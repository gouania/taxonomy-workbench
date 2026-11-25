import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseCliArgs,
  estimateCallCostUsd,
  createCallBudgetGuard,
  loadEnvFileIfPresent,
} from '../scripts/live-integration';

test('parseCliArgs defaults to Stage 1 with billable confirmation disabled and validates flags', () => {
  const defaults = parseCliArgs([]);
  assert.equal(defaults.stage, '1');
  assert.equal(defaults.confirmBillable, false);
  assert.equal(defaults.modelsOnly, false);
  assert.equal(defaults.maxCalls, 2);
  assert.equal(defaults.maxBudgetUsd, 1.5);

  const stage4 = parseCliArgs([
    '--stage=4',
    '--confirm-billable',
    '--max-calls=7',
    '--max-budget-usd=1.25',
    '--report=out.json',
  ]);
  assert.equal(stage4.stage, '4');
  assert.equal(stage4.confirmBillable, true);
  assert.equal(stage4.maxCalls, 7);
  assert.equal(stage4.maxBudgetUsd, 1.25);
  assert.equal(stage4.reportPath, 'out.json');

  assert.throws(() => parseCliArgs(['--stage=99']), /Invalid --stage/);
  assert.throws(() => parseCliArgs(['--max-calls=999']), /Invalid --max-calls/);
  assert.throws(() => parseCliArgs(['--unknown-flag']), /Unknown argument/);
});

test('estimateCallCostUsd computes Gemini 4 Hydrogen token + thinking + optional grounding costs', () => {
  const usage = {
    inputTokens: 100_000,
    outputTokens: 10_000,
    thoughtsTokens: 10_000,
    totalTokens: 120_000,
    estimated: false,
    groundingQueries: 10,
  };
  // Input: 0.1M * $1.50 = $0.15; Output+Thoughts: 0.02M * $7.50 = $0.15 -> $0.30 (free grounding quota)
  assert.equal(estimateCallCostUsd(usage, 'gemini-4-hydrogen', true), 0.3);
  // With paid grounding: + (10 / 1000) * $14 = +$0.14 -> $0.44
  assert.equal(estimateCallCostUsd(usage, 'gemini-4-hydrogen', false), 0.44);
});

test('createCallBudgetGuard enforces hard call-count and estimated USD budget caps before execution', () => {
  const callGuard = createCallBudgetGuard(2, 1.5);
  callGuard.assertCanExecuteBillableCall('call-1');
  callGuard.recordBillableCall(
    { inputTokens: 1000, outputTokens: 500, thoughtsTokens: 500, totalTokens: 2000, estimated: false, groundingQueries: 0 },
    'gemini-4-hydrogen'
  );
  callGuard.assertCanExecuteBillableCall('call-2');
  callGuard.recordBillableCall(
    { inputTokens: 1000, outputTokens: 500, thoughtsTokens: 500, totalTokens: 2000, estimated: false, groundingQueries: 0 },
    'gemini-4-hydrogen'
  );
  assert.throws(() => callGuard.assertCanExecuteBillableCall('call-3'), /Call cap reached \(2\/2\)/);

  const budgetGuard = createCallBudgetGuard(10, 0.05);
  budgetGuard.assertCanExecuteBillableCall('expensive-call');
  budgetGuard.recordBillableCall(
    { inputTokens: 10_000, outputTokens: 5_000, thoughtsTokens: 5_000, totalTokens: 20_000, estimated: false, groundingQueries: 0 },
    'gemini-4-hydrogen'
  );
  assert.throws(() => budgetGuard.assertCanExecuteBillableCall('next-call'), /Estimated budget cap reached/);
});

test('loadEnvFileIfPresent parses Windows CRLF .env.local without overwriting existing env vars', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-env-test-'));
  const envPath = path.join(tmpDir, '.env.local');
  try {
    fs.writeFileSync(
      envPath,
      '# Comment line\r\nGEMINI_API_KEY="test_placeholder_key"\r\nEXISTING_VAR=from_file\r\n',
      'utf8'
    );
    const target: Record<string, string | undefined> = { EXISTING_VAR: 'from_shell' };
    const loaded = loadEnvFileIfPresent(envPath, target);
    assert.equal(loaded, true);
    assert.equal(target.GEMINI_API_KEY, 'test_placeholder_key');
    assert.equal(target.EXISTING_VAR, 'from_shell');
    assert.equal(loadEnvFileIfPresent(path.join(tmpDir, 'missing.env'), target), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
