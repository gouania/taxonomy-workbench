import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  createApp,
  createRateLimiter,
  resolvePort,
  resolveTrustProxy,
} from '../server';

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

test('resolvePort honors valid PORT env values and defaults to 3000 for AI Studio compatibility', () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort(''), 3000);
  assert.equal(resolvePort('8080'), 8080);
  assert.equal(resolvePort('3000'), 3000);
  assert.equal(resolvePort('0'), 3000);
  assert.equal(resolvePort('70000'), 3000);
  assert.equal(resolvePort('not-a-port'), 3000);
});

test('resolveTrustProxy defaults safely by environment and parses explicit TRUST_PROXY overrides', () => {
  assert.equal(resolveTrustProxy(undefined, 'production'), 1);
  assert.equal(resolveTrustProxy(undefined, 'development'), false);
  assert.equal(resolveTrustProxy('true', 'development'), true);
  assert.equal(resolveTrustProxy('false', 'production'), false);
  assert.equal(resolveTrustProxy('2', 'production'), 2);
  assert.equal(resolveTrustProxy('loopback', 'production'), 'loopback');
});

test('createRateLimiter enforces sliding window and prunes expired IP entries to prevent unbounded memory growth', () => {
  let currentTime = 1_000;
  const limiter = createRateLimiter({
    windowMs: 10_000,
    maxRequests: 2,
    maxTrackedIps: 5,
    now: () => currentTime,
  });

  assert.equal(limiter.check('10.0.0.1'), true);
  assert.equal(limiter.check('10.0.0.1'), true);
  assert.equal(limiter.check('10.0.0.1'), false); // 3rd request in window blocked
  assert.equal(limiter.check('10.0.0.2'), true);
  assert.equal(limiter.size(), 2);

  // Advance past the window; next check sweeps expired entries
  currentTime += 11_000;
  assert.equal(limiter.check('10.0.0.3'), true);
  assert.equal(limiter.size(), 1); // 10.0.0.1 and 10.0.0.2 were pruned

  // Verify hard cap on tracked active IPs
  for (let i = 4; i <= 12; i++) {
    limiter.check(`10.0.0.${i}`);
  }
  assert.ok(limiter.size() <= 5);
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
