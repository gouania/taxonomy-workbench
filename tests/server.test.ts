import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ThinkingLevel } from '@google/genai';
import {
  createApp,
  createRateLimiter,
  resolveNodeEnv,
  resolvePort,
  resolveTrustProxy,
} from '../server';
import {
  getConfiguredGeminiModel,
  getThinkingConfig,
  resolveThinkingLevel,
} from '../server/gemini';

function listenEphemeral(app: import('express').Express): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to obtain bound server address'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
    server.on('error', reject);
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

test('resolveNodeEnv gives --production precedence over inherited NODE_ENV=development while preserving AI Studio dev workflow', () => {
  assert.equal(resolveNodeEnv(undefined, ['node', 'dist/server.cjs', '--production']), 'production');
  assert.equal(resolveNodeEnv('development', ['node', 'dist/server.cjs', '--production']), 'production');
  assert.equal(resolveNodeEnv('production', ['node', 'server.ts', '--development']), 'development');
  assert.equal(resolveNodeEnv(undefined, ['node', 'dist/server.cjs']), 'production');
  assert.equal(resolveNodeEnv(undefined, ['node', 'server.ts']), 'development');
  assert.equal(resolveNodeEnv('production', ['node', 'server.ts']), 'production');
  assert.equal(resolveNodeEnv('development', ['node', 'dist/server.cjs']), 'development');
});

test('resolvePort honors valid PORT env values and defaults to 3000 for AI Studio compatibility', () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort(''), 3000);
  assert.equal(resolvePort('8080'), 8080);
  assert.equal(resolvePort('3000'), 3000);
  assert.equal(resolvePort('0'), 3000);
  assert.equal(resolvePort('70000'), 3000);
  assert.equal(resolvePort('not-a-port'), 3000);
});

test('resolveTrustProxy defaults to false (safe against X-Forwarded-For spoofing) and parses explicit TRUST_PROXY overrides', () => {
  assert.equal(resolveTrustProxy(undefined), false);
  assert.equal(resolveTrustProxy(''), false);
  assert.equal(resolveTrustProxy('true'), true);
  assert.equal(resolveTrustProxy('false'), false);
  assert.equal(resolveTrustProxy('1'), 1);
  assert.equal(resolveTrustProxy('2'), 2);
  assert.equal(resolveTrustProxy('loopback'), 'loopback');
});

test('createRateLimiter enforces sliding window, fails closed at capacity without resetting active IPs, and bounds full-map sweeps', () => {
  let currentTime = 1_000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    maxRequests: 2,
    maxTrackedIps: 3,
    minSweepIntervalMs: 2_000,
    now: () => currentTime,
  });

  // Exhaust quota for active IP 10.0.0.1 and fill remaining 2 slots
  assert.equal(limiter.check('10.0.0.1'), true);
  assert.equal(limiter.check('10.0.0.1'), true);
  assert.equal(limiter.check('10.0.0.1'), false);
  assert.equal(limiter.check('10.0.0.2'), true);
  assert.equal(limiter.check('10.0.0.3'), true);
  assert.equal(limiter.size(), 3);
  assert.equal(limiter.sweepCount(), 0);

  // Sustained overflow burst within minSweepIntervalMs fails closed without evicting active IPs or sweeping repeatedly
  currentTime += 500;
  for (let i = 4; i <= 25; i++) {
    assert.equal(limiter.check(`10.0.0.${i}`), false);
  }
  assert.equal(limiter.size(), 3);
  assert.equal(limiter.sweepCount(), 0);

  // Active rate-limited IP 10.0.0.1 must STILL be blocked (never silently reset by overflow)
  assert.equal(limiter.check('10.0.0.1'), false);

  // After minSweepIntervalMs passes (still within window), at most 1 sweep runs for the entire next burst
  currentTime += 2_000;
  for (let i = 30; i <= 50; i++) {
    assert.equal(limiter.check(`10.0.0.${i}`), false);
  }
  assert.equal(limiter.sweepCount(), 1);
  assert.equal(limiter.check('10.0.0.1'), false);

  // Advance past windowMs: expired records are reclaimed and new IPs are admitted cleanly
  currentTime += 11_000;
  assert.equal(limiter.check('10.0.0.99'), true);
  assert.equal(limiter.size(), 1);
});

test('server exposes /health, enforces 256kb JSON limit, validates JSON, and isolates proxied client IPs via trust proxy', async () => {
  const app = await createApp({
    nodeEnv: 'production',
    trustProxy: 1,
    rateLimit: { maxRequests: 2, windowMs: 60_000 },
    skipFrontend: true,
  });

  const { server, baseUrl } = await listenEphemeral(app);
  try {
    // 1. Health endpoint
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    assert.deepEqual(await healthRes.json(), { status: 'ok' });

    // 2. Malformed JSON returns structured 400 JSON error
    const malformedRes = await fetch(`${baseUrl}/api/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.10',
      },
      body: '{"action":',
    });
    assert.equal(malformedRes.status, 400);
    const malformedBody = await malformedRes.json();
    assert.match(malformedBody.error, /Malformed JSON/i);

    // 3. Oversized payload (> 256kb) returns structured 413 JSON error
    const oversizedRes = await fetch(`${baseUrl}/api/gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '203.0.113.11',
      },
      body: JSON.stringify({ action: 'generateTaxonGuide', payload: { inputText: 'a'.repeat(300_000) } }),
    });
    assert.equal(oversizedRes.status, 413);
    const oversizedBody = await oversizedRes.json();
    assert.match(oversizedBody.error, /256kb/i);

    // 4. Rate limiter isolates distinct client IPs behind reverse proxy
    const callAs = (ip: string) =>
      fetch(`${baseUrl}/api/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({ action: 'unknownAction', payload: {} }),
      });

    assert.equal((await callAs('198.51.100.1')).status, 400);
    assert.equal((await callAs('198.51.100.1')).status, 400);
    assert.equal((await callAs('198.51.100.1')).status, 429); // 3rd request from same IP blocked

    // Distinct proxied client IP is NOT affected by the first client's rate limit
    assert.equal((await callAs('198.51.100.2')).status, 400);
  } finally {
    await closeServer(server);
  }
});

test('Gemini model and thinking level are env-configurable while preserving defaults and task-specific levels', () => {
  assert.equal(getConfiguredGeminiModel(undefined), 'gemini-4-hydrogen');
  assert.equal(getConfiguredGeminiModel('   '), 'gemini-4-hydrogen');
  assert.equal(getConfiguredGeminiModel('gemini-2.5-pro'), 'gemini-2.5-pro');

  assert.equal(resolveThinkingLevel(undefined), ThinkingLevel.MEDIUM);
  assert.equal(resolveThinkingLevel('high'), ThinkingLevel.HIGH);
  assert.equal(resolveThinkingLevel('LOW'), ThinkingLevel.LOW);
  assert.equal(resolveThinkingLevel('invalid-level'), ThinkingLevel.MEDIUM);

  // Gemini 4 supports LOW/MEDIUM/HIGH/XHIGH and maps unsupported MINIMAL to MEDIUM
  assert.deepEqual(getThinkingConfig('gemini-4-hydrogen', ThinkingLevel.LOW), {
    thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
  });
  assert.deepEqual(getThinkingConfig('gemini-4-hydrogen', ThinkingLevel.MINIMAL), {
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
  });

  // Non-Gemini 3/4 models omit thinkingConfig cleanly
  assert.deepEqual(getThinkingConfig('gemini-2.5-pro', ThinkingLevel.MEDIUM), {});

  // Hardcoded AI Studio telemetry header is removed
  const geminiSource = fs.readFileSync(path.join(process.cwd(), 'server/gemini.ts'), 'utf8');
  assert.doesNotMatch(geminiSource, /aistudio-build/);
});

test('default trustProxy=false prevents spoofed X-Forwarded-For headers from bypassing per-IP rate limiting', async () => {
  const app = await createApp({
    nodeEnv: 'production',
    // trustProxy omitted -> defaults to false
    rateLimit: { maxRequests: 2, windowMs: 60_000 },
    skipFrontend: true,
  });

  const { server, baseUrl } = await listenEphemeral(app);
  try {
    const callWithSpoofedIp = (spoofedIp: string) =>
      fetch(`${baseUrl}/api/gemini`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': spoofedIp,
        },
        body: JSON.stringify({ action: 'unknownAction', payload: {} }),
      });

    // Even when rotating X-Forwarded-For on every request, the same socket IP is rate-limited on request #3
    assert.equal((await callWithSpoofedIp('203.0.113.1')).status, 400);
    assert.equal((await callWithSpoofedIp('203.0.113.2')).status, 400);
    assert.equal((await callWithSpoofedIp('203.0.113.3')).status, 429);
  } finally {
    await closeServer(server);
  }
});

test('256kb JSON body limit accepts maximum-bounds realistic compareGuideTaxa + SpecimenRecord payloads', async () => {
  const app = await createApp({
    nodeEnv: 'production',
    skipFrontend: true,
  });

  const { server, baseUrl } = await listenEphemeral(app);
  try {
    const maxComparePayload = {
      action: 'compareGuideTaxa',
      payload: {
        taxa: Array.from({ length: 4 }, (_, i) => ({
          scientific_name: `Quercus species${i + 1}`,
          common_name: `Oak ${i + 1}`,
          key_diagnostics: 'd'.repeat(2000),
          habitat_and_ecology: 'h'.repeat(2000),
        })),
        // Intentionally 251 chars so Express parses the full ~78 KB body and the route validator
        // rejects with 400 (proving the body passed the 256kb limit without calling Gemini).
        locality: 'L'.repeat(251),
        activeFilters: Array.from({ length: 12 }, () => 'f'.repeat(400)),
        specimenRecord: {
          notes: 'n'.repeat(6000),
          selectedTraits: Array.from({ length: 60 }, () => 't'.repeat(200)),
          observedHabitat: 'o'.repeat(250),
          locality: 'l'.repeat(250),
          followups: Array.from({ length: 30 }, (_, i) => ({
            id: `obs_${i}`,
            questionId: `q_${i}`,
            prompt: 'p'.repeat(400),
            targetOrgan: 'Leaf',
            answer: 'a'.repeat(400),
            status: 'observed',
          })),
        },
      },
    };

    const serialized = JSON.stringify(maxComparePayload);
    assert.ok(Buffer.byteLength(serialized, 'utf8') > 60_000);
    assert.ok(Buffer.byteLength(serialized, 'utf8') < 100_000);

    const res = await fetch(`${baseUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Locality exceeds maximum length/);
  } finally {
    await closeServer(server);
  }
});



