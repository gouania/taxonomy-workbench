/**
 * Controlled, cross-platform (Windows 11 / macOS / Linux) live integration test harness
 * for Taxonomy Workbench.
 *
 * Safeguards:
 * - Zero Gemini inference calls unless `--confirm-billable` is explicitly passed.
 * - Stage 3 (iNaturalist v1/v2 + photo-host checks) requires no credentials and incurs $0.
 * - Stage 1 checks `models.get` first and NEVER silently substitutes another model.
 * - Hard call-count (`--max-calls`) and estimated USD budget (`--max-budget-usd`) caps.
 * - Never prints or persists GEMINI_API_KEY.
 */

import http from 'node:http';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import { createApp } from '../server';
import { getConfiguredGeminiModel, getRuntimeCacheConfig, getThinkingConfig } from '../server/gemini';
import { inaturalistService } from '../src/services/inaturalistService';

export type StageOption = '1' | '2' | '3' | '4' | 'all';

export interface ParsedCliArgs {
  stage: StageOption;
  modelsOnly: boolean;
  confirmBillable: boolean;
  maxCalls: number;
  maxBudgetUsd: number;
  reportPath?: string;
  help: boolean;
}

export interface UsageMetrics {
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
  estimated: boolean;
  groundingQueries: number;
}

export interface CallRecord {
  stage: string;
  label: string;
  status: 'pass' | 'fail' | 'skipped';
  durationMs: number;
  usage?: UsageMetrics;
  estimatedCostUsd: number;
  details: string;
}

// Published November 2026 Gemini Developer API rates (USD per 1M tokens)
const MODEL_RATES_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gemini-4-hydrogen': { input: 1.5, output: 7.5 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-4-argon': { input: 2.0, output: 10.0 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
};

const DEFAULT_MAX_CALLS_BY_STAGE: Record<StageOption, number> = {
  '1': 2,
  '2': 1,
  '3': 0,
  '4': 7,
  all: 10,
};

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  let stage: StageOption = '1';
  let modelsOnly = false;
  let confirmBillable = false;
  let explicitMaxCalls: number | undefined;
  let maxBudgetUsd = 1.5;
  let reportPath: string | undefined;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--models-only') {
      modelsOnly = true;
    } else if (arg === '--confirm-billable') {
      confirmBillable = true;
    } else if (arg.startsWith('--stage=')) {
      const val = arg.slice('--stage='.length).trim().toLowerCase();
      if (val === '1' || val === '2' || val === '3' || val === '4' || val === 'all') {
        stage = val;
      } else {
        throw new Error(`Invalid --stage value "${val}". Expected 1, 2, 3, 4, or all.`);
      }
    } else if (arg.startsWith('--max-calls=')) {
      const n = Number(arg.slice('--max-calls='.length));
      if (!Number.isInteger(n) || n < 0 || n > 50) {
        throw new Error(`Invalid --max-calls value "${arg}". Expected integer between 0 and 50.`);
      }
      explicitMaxCalls = n;
    } else if (arg.startsWith('--max-budget-usd=')) {
      const n = Number(arg.slice('--max-budget-usd='.length));
      if (!Number.isFinite(n) || n < 0 || n > 25) {
        throw new Error(`Invalid --max-budget-usd value "${arg}". Expected number between 0 and 25.`);
      }
      maxBudgetUsd = n;
    } else if (arg.startsWith('--report=')) {
      reportPath = arg.slice('--report='.length).trim();
    } else {
      throw new Error(`Unknown argument: ${arg}. Run with --help for usage.`);
    }
  }

  return {
    stage,
    modelsOnly,
    confirmBillable,
    maxCalls: explicitMaxCalls ?? DEFAULT_MAX_CALLS_BY_STAGE[stage],
    maxBudgetUsd,
    reportPath,
    help,
  };
}

export function estimateCallCostUsd(
  usage: UsageMetrics,
  model: string,
  assumeFreeGroundingQuotaRemaining: boolean = true
): number {
  const rate = MODEL_RATES_PER_MILLION[model] ?? { input: 2.0, output: 10.0 };
  const inputCost = (usage.inputTokens / 1_000_000) * rate.input;
  // Output pricing includes thinking tokens on Gemini 3/4 models
  const billableOutputTokens = usage.outputTokens + usage.thoughtsTokens;
  const outputCost = (billableOutputTokens / 1_000_000) * rate.output;
  // Grounding with Google Search: 5,000 free queries/month across Gemini 3/4, then $14 / 1,000 queries
  const groundingCost = assumeFreeGroundingQuotaRemaining ? 0 : (usage.groundingQueries / 1_000) * 14.0;
  return Number((inputCost + outputCost + groundingCost).toFixed(6));
}

export function estimateTokensFromText(inputText: string, outputText: string, thinkingMultiplier: number = 1.5): UsageMetrics {
  const inputTokens = Math.max(1, Math.ceil(inputText.length / 4));
  const outputTokens = Math.max(1, Math.ceil(outputText.length / 4));
  const thoughtsTokens = Math.ceil(outputTokens * thinkingMultiplier);
  return {
    inputTokens,
    outputTokens,
    thoughtsTokens,
    totalTokens: inputTokens + outputTokens + thoughtsTokens,
    estimated: true,
    groundingQueries: 0,
  };
}

export interface CallBudgetGuard {
  assertCanExecuteBillableCall(label: string): void;
  recordBillableCall(usage: UsageMetrics, model: string): number;
  getSummary(): {
    callsUsed: number;
    maxCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalThoughtsTokens: number;
    totalGroundingQueries: number;
    estimatedCostUsd: number;
    maxBudgetUsd: number;
  };
}

export function createCallBudgetGuard(maxCalls: number, maxBudgetUsd: number): CallBudgetGuard {
  let callsUsed = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThoughtsTokens = 0;
  let totalGroundingQueries = 0;
  let estimatedCostUsd = 0;

  return {
    assertCanExecuteBillableCall(label: string) {
      if (callsUsed >= maxCalls) {
        throw new Error(
          `Call cap reached (${callsUsed}/${maxCalls}) before "${label}". Increase --max-calls only if explicitly intended.`
        );
      }
      if (estimatedCostUsd >= maxBudgetUsd) {
        throw new Error(
          `Estimated budget cap reached ($${estimatedCostUsd.toFixed(4)} / $${maxBudgetUsd.toFixed(2)}) before "${label}".`
        );
      }
    },
    recordBillableCall(usage: UsageMetrics, model: string): number {
      callsUsed += 1;
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalThoughtsTokens += usage.thoughtsTokens;
      totalGroundingQueries += usage.groundingQueries;
      const cost = estimateCallCostUsd(usage, model, true);
      estimatedCostUsd = Number((estimatedCostUsd + cost).toFixed(6));
      return cost;
    },
    getSummary() {
      return {
        callsUsed,
        maxCalls,
        totalInputTokens,
        totalOutputTokens,
        totalThoughtsTokens,
        totalGroundingQueries,
        estimatedCostUsd,
        maxBudgetUsd,
      };
    },
  };
}

async function verifyImageHostUrl(url: string): Promise<{ ok: boolean; status: number; contentType: string; host: string }> {
  const parsed = new URL(url);
  let res = await fetch(url, { method: 'HEAD' });
  if (res.status === 405 || res.status === 403) {
    res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
  }
  const contentType = res.headers.get('content-type') || '';
  return {
    ok: res.ok && contentType.toLowerCase().startsWith('image/'),
    status: res.status,
    contentType,
    host: parsed.hostname,
  };
}

export async function runStage3Inaturalist(records: CallRecord[]): Promise<{ sampleTaxonName: string; samplePlaceId?: number }> {
  let sampleTaxonName = 'Quercus robur';
  let samplePlaceId: number | undefined;
  const testedImageUrls: string[] = [];

  // 3.1 Place autocomplete & geometry
  {
    const t0 = Date.now();
    const places = await inaturalistService.searchPlacesDetailed('Royal Botanic Gardens, Kew');
    const top = places[0];
    if (top?.id) samplePlaceId = top.id;
    records.push({
      stage: '3',
      label: 'iNat searchPlacesDetailed("Royal Botanic Gardens, Kew")',
      status: places.length > 0 && Boolean(top?.id) ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      estimatedCostUsd: 0,
      details: top
        ? `Found ${places.length} match(es); top: "${top.display_name}" (id=${top.id}, bbox=${Boolean(top.bounding_box)})`
        : 'No matching places returned',
    });
  }

  // 3.2 Taxon photos (v1 autocomplete -> v2 taxa/{id})
  {
    const t0 = Date.now();
    const photos = await inaturalistService.getTaxonPhotos('Quercus robur');
    if (photos[0]?.url) testedImageUrls.push(photos[0].url);
    records.push({
      stage: '3',
      label: 'iNat getTaxonPhotos("Quercus robur")',
      status: photos.length > 0 ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      estimatedCostUsd: 0,
      details:
        photos.length > 0
          ? `Returned ${photos.length} licensed photo(s); first attribution: "${photos[0].attribution}"`
          : 'No licensed taxon photos returned',
    });
  }

  // 3.3 Representative photo (default_photo + attribution)
  {
    const t0 = Date.now();
    const rep = await inaturalistService.getRepresentativePhoto('Fagus sylvatica');
    if (rep?.url) testedImageUrls.push(rep.url);
    records.push({
      stage: '3',
      label: 'iNat getRepresentativePhoto("Fagus sylvatica")',
      status: rep && rep.url ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      estimatedCostUsd: 0,
      details: rep ? `URL host=${new URL(rep.url).hostname}, attribution="${rep.attribution}"` : 'No photo returned',
    });
  }

  // 3.4 Recent locality observations (boundary if placeId resolved, else New Forest point radius)
  {
    const t0 = Date.now();
    const loc = samplePlaceId
      ? await inaturalistService.getRecentLocalityObservations({ placeId: samplePlaceId, perPage: 3 })
      : await inaturalistService.getRecentLocalityObservations({ lat: 50.87, lng: -1.63, radiusKm: 15, perPage: 3 });
    if (loc.observations[0]?.photoUrl) testedImageUrls.push(loc.observations[0].photoUrl);
    records.push({
      stage: '3',
      label: `iNat getRecentLocalityObservations (${loc.filterKind})`,
      status: loc.observations.length > 0 ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      estimatedCostUsd: 0,
      details: `Returned ${loc.observations.length} observation(s) (totalResults=${loc.totalResults}); top taxon: "${loc.observations[0]?.taxonName ?? 'none'}"`,
    });
  }

  // 3.5 Quiz observations (v2 observations with RISON fields)
  {
    const t0 = Date.now();
    const taxonId = await inaturalistService.getTaxonId('Quercus');
    const obs = taxonId ? await inaturalistService.getQuizObservations(taxonId, 3) : [];
    if (obs[0]?.taxon?.name) sampleTaxonName = obs[0].taxon.name;
    if (obs[0]?.photos?.[0]?.url) testedImageUrls.push(obs[0].photos[0].url);
    records.push({
      stage: '3',
      label: 'iNat getQuizObservations("Quercus")',
      status: Boolean(taxonId) && obs.length > 0 ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      estimatedCostUsd: 0,
      details: taxonId
        ? `taxonId=${taxonId}, returned ${obs.length} research-grade observation(s); sample: "${sampleTaxonName}"`
        : 'Failed to resolve taxonId for Quercus',
    });
  }

  // 3.6 Photograph-host HTTP delivery verification
  const uniqueUrls = Array.from(new Set(testedImageUrls)).slice(0, 3);
  for (const imgUrl of uniqueUrls) {
    const t0 = Date.now();
    try {
      const check = await verifyImageHostUrl(imgUrl);
      records.push({
        stage: '3',
        label: `Photo host check (${check.host})`,
        status: check.ok ? 'pass' : 'fail',
        durationMs: Date.now() - t0,
        estimatedCostUsd: 0,
        details: `HTTP ${check.status}, content-type="${check.contentType}"`,
      });
    } catch (err: any) {
      records.push({
        stage: '3',
        label: `Photo host check (${new URL(imgUrl).hostname})`,
        status: 'fail',
        durationMs: Date.now() - t0,
        estimatedCostUsd: 0,
        details: err?.message || 'Image fetch failed',
      });
    }
  }

  return { sampleTaxonName, samplePlaceId };
}

export function loadEnvFileIfPresent(filePath: string = '.env.local', targetEnv: Record<string, string | undefined> = process.env): boolean {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let val = line.slice(eqIndex + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && (targetEnv[key] === undefined || targetEnv[key] === '')) {
      targetEnv[key] = val;
    }
  }
  return true;
}

async function withEphemeralServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = await createApp({ nodeEnv: 'production', trustProxy: false, skipFrontend: true });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral local server');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function postGeminiApi(
  baseUrl: string,
  action: string,
  payload: unknown
): Promise<{ status: number; data: any; cacheNamespace: string | null; rawRequest: string; rawResponse: string }> {
  const rawRequest = JSON.stringify({ action, payload });
  const res = await fetch(`${baseUrl}/api/gemini`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawRequest,
  });
  const rawResponse = await res.text();
  let data: any = null;
  try {
    data = rawResponse ? JSON.parse(rawResponse) : null;
  } catch {
    data = { rawResponse };
  }
  return {
    status: res.status,
    data,
    cacheNamespace: res.headers.get('X-Taxonomy-Cache-Namespace'),
    rawRequest,
    rawResponse,
  };
}

function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  if (!key.trim()) {
    throw new Error(
      'GEMINI_API_KEY is not set. Create .env.local in the repository root (see docs/LOCAL_LIVE_TESTING.md) or set $env:GEMINI_API_KEY in PowerShell.'
    );
  }
  return key.trim();
}

async function runStage1ConnectivityAndModelGate(
  args: ParsedCliArgs,
  guard: CallBudgetGuard,
  records: CallRecord[]
): Promise<boolean> {
  const apiKey = requireGeminiApiKey();
  const configuredModel = getConfiguredGeminiModel();
  const ai = new GoogleGenAI({ apiKey });

  // 1.1 Non-generative model metadata check (0 token cost)
  let modelAvailable = false;
  {
    const t0 = Date.now();
    try {
      const modelInfo = await ai.models.get({ model: `models/${configuredModel}` });
      modelAvailable = true;
      records.push({
        stage: '1',
        label: `models.get("models/${configuredModel}") [0 tokens]`,
        status: 'pass',
        durationMs: Date.now() - t0,
        estimatedCostUsd: 0,
        details: `Available: ${modelInfo.name || configuredModel} (displayName="${modelInfo.displayName || 'n/a'}")`,
      });
    } catch (err: any) {
      let availableModels = 'unable to list models';
      try {
        const list = await ai.models.list();
        const names: string[] = [];
        for await (const m of list) {
          if (m.name && /gemini/i.test(m.name)) {
            names.push(m.name.replace(/^models\//, ''));
          }
          if (names.length >= 15) break;
        }
        availableModels = names.join(', ') || 'none returned';
      } catch {
        // ignore secondary listing failure
      }
      records.push({
        stage: '1',
        label: `models.get("models/${configuredModel}") [0 tokens]`,
        status: 'fail',
        durationMs: Date.now() - t0,
        estimatedCostUsd: 0,
        details: `Model "${configuredModel}" is NOT available (${err?.message || err}). Halting without silent substitution. Visible Gemini models: ${availableModels}`,
      });
      return false;
    }
  }

  if (args.modelsOnly) {
    records.push({
      stage: '1',
      label: 'Inference probe (--models-only)',
      status: 'skipped',
      durationMs: 0,
      estimatedCostUsd: 0,
      details: 'Skipped billable inference because --models-only was specified.',
    });
    return modelAvailable;
  }

  if (!args.confirmBillable) {
    throw new Error('Stage 1 inference requires --confirm-billable (or use --models-only for 0-cost model verification).');
  }

  // 1.2 Minimal SDK inference probe to verify exact usageMetadata + thinkingConfig
  {
    guard.assertCanExecuteBillableCall('Stage 1 SDK connectivity probe');
    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: configuredModel,
      contents: 'Define the botanical term "ochrea" in one concise sentence.',
      config: {
        ...getThinkingConfig(configuredModel),
      },
    });
    const um = response.usageMetadata;
    const usage: UsageMetrics = {
      inputTokens: um?.promptTokenCount ?? 0,
      outputTokens: um?.candidatesTokenCount ?? 0,
      thoughtsTokens: (um as any)?.thoughtsTokenCount ?? 0,
      totalTokens: um?.totalTokenCount ?? 0,
      estimated: !um,
      groundingQueries: 0,
    };
    const cost = guard.recordBillableCall(usage, configuredModel);
    const text = (response.text || '').trim();
    records.push({
      stage: '1',
      label: `SDK generateContent probe (${configuredModel})`,
      status: text.length > 10 ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      usage,
      estimatedCostUsd: cost,
      details: `Exact SDK tokens: in=${usage.inputTokens}, out=${usage.outputTokens}, thoughts=${usage.thoughtsTokens}, total=${usage.totalTokens}. Preview: "${text.slice(0, 90)}"`,
    });
  }

  return modelAvailable;
}

async function runStage2Grounding(
  args: ParsedCliArgs,
  guard: CallBudgetGuard,
  records: CallRecord[]
): Promise<void> {
  requireGeminiApiKey();
  if (!args.confirmBillable) {
    throw new Error('Stage 2 requires --confirm-billable.');
  }
  const configuredModel = getConfiguredGeminiModel();

  await withEphemeralServer(async (baseUrl) => {
    guard.assertCanExecuteBillableCall('Stage 2 lookupAuthority (Hook.f.)');
    const t0 = Date.now();
    const res = await postGeminiApi(baseUrl, 'lookupAuthority', { query: 'Hook.f.', useWebSearch: true });
    const usage = estimateTokensFromText(res.rawRequest, res.rawResponse, 1.0);
    const sources = Array.isArray(res.data?.groundingSources) ? res.data.groundingSources : [];
    usage.groundingQueries = Math.max(1, Math.min(3, sources.length));
    const cost = guard.recordBillableCall(usage, configuredModel);

    const hasValidHttpSources = sources.some(
      (s: any) => typeof s?.uri === 'string' && /^https?:\/\//i.test(s.uri)
    );
    records.push({
      stage: '2',
      label: 'POST /api/gemini lookupAuthority ("Hook.f.") [Google Search grounding]',
      status: res.status === 200 && hasValidHttpSources && Boolean(res.cacheNamespace) ? 'pass' : 'fail',
      durationMs: Date.now() - t0,
      usage,
      estimatedCostUsd: cost,
      details: `HTTP ${res.status}, namespace=${res.cacheNamespace}, groundingSources=${sources.length}, provenance=${res.data?.sourceProvenance?.evidenceBasis ?? 'missing'}`,
    });
  });
}

async function runStage4SixModules(
  args: ParsedCliArgs,
  guard: CallBudgetGuard,
  records: CallRecord[]
): Promise<void> {
  requireGeminiApiKey();
  if (!args.confirmBillable) {
    throw new Error('Stage 4 requires --confirm-billable.');
  }
  const configuredModel = getConfiguredGeminiModel();

  await withEphemeralServer(async (baseUrl) => {
    const runAction = async (
      label: string,
      action: string,
      payload: unknown,
      thinkingMultiplier: number,
      validate: (res: { status: number; data: any; cacheNamespace: string | null }) => { ok: boolean; note: string }
    ) => {
      guard.assertCanExecuteBillableCall(label);
      const t0 = Date.now();
      const res = await postGeminiApi(baseUrl, action, payload);
      const usage = estimateTokensFromText(res.rawRequest, res.rawResponse, thinkingMultiplier);
      const sources = Array.isArray(res.data?.groundingSources) ? res.data.groundingSources : [];
      if (sources.length > 0) usage.groundingQueries = Math.min(4, sources.length);
      const cost = guard.recordBillableCall(usage, configuredModel);
      const verdict = validate(res);
      records.push({
        stage: '4',
        label,
        status: verdict.ok ? 'pass' : 'fail',
        durationMs: Date.now() - t0,
        usage,
        estimatedCostUsd: cost,
        details: `HTTP ${res.status}, ns=${res.cacheNamespace || 'none'} — ${verdict.note}`,
      });
    };

    // 1. Authorities
    await runAction(
      'Module 1 — Authorities (lookupAuthority: "DC.")',
      'lookupAuthority',
      { query: 'DC.', useWebSearch: true },
      1.0,
      (res) => ({
        ok: res.status === 200 && Boolean(res.data?.standardAbbreviation || res.data?.fullName),
        note: `abbr="${res.data?.standardAbbreviation ?? '?'}", fullName="${res.data?.fullName ?? '?'}", sources=${res.data?.groundingSources?.length ?? 0}`,
      })
    );

    // 2. Explore Taxa
    await runAction(
      'Module 2 — Explore Taxa (analyzeSingleTaxon: "Fagus sylvatica")',
      'analyzeSingleTaxon',
      { name: 'Fagus sylvatica', useWebSearch: true },
      1.2,
      (res) => ({
        ok: res.status === 200 && Boolean(res.data?.scientificName && res.data?.family),
        note: `name="${res.data?.scientificName ?? '?'}", family="${res.data?.family ?? '?'}", sources=${res.data?.groundingSources?.length ?? 0}`,
      })
    );

    // 3. Identify (deliberately incomplete observations -> must NOT force species-level determination)
    await runAction(
      'Module 3 — Identify (incomplete Lamiaceae traits)',
      'identifySpecimen',
      {
        characters: ['Opposite leaves', 'Square stem'],
        notes: 'Flowers and fruits not observed; vegetative stem only.',
        location: 'Southern England',
        useWebSearch: true,
      },
      1.5,
      (res) => {
        const rank = String(res.data?.determinationRank || res.data?.bestDefensibleRank || '').toLowerCase();
        const notForcedSpecies = rank !== 'species';
        return {
          ok: res.status === 200 && Boolean(res.data?.summary || res.data?.candidates?.length) && notForcedSpecies,
          note: `rank="${rank || 'unspecified'}", candidates=${res.data?.candidates?.length ?? 0}, forcedSpecies=${!notForcedSpecies}`,
        };
      }
    );

    // 4. Guides (bounded regional genus guide)
    await runAction(
      'Module 4 — Guides (generateStructuredTaxonGuide: "Genus Betula in Great Britain")',
      'generateStructuredTaxonGuide',
      {
        taxon: 'Betula',
        locality: 'Great Britain',
        useSearch: true,
        filters: ['Diagnostic vegetative and fruiting characters'],
        coverageScope: 'comprehensive',
      },
      2.0,
      (res) => ({
        ok:
          res.status === 200 &&
          Array.isArray(res.data?.taxa) &&
          res.data.taxa.length > 0 &&
          Array.isArray(res.data?.key) &&
          res.data.key.length > 0,
        note: `taxa=${res.data?.taxa?.length ?? 0}, couplets=${res.data?.key?.length ?? 0}, sources=${res.data?.groundingSources?.length ?? 0}`,
      })
    );

    // 5. Places & flora
    await runAction(
      'Module 5 — Places & flora (generateLocalityProfile: "New Forest, Hampshire, UK")',
      'generateLocalityProfile',
      { locationInput: 'New Forest, Hampshire, UK' },
      1.2,
      (res) => ({
        ok: res.status === 200 && Boolean(res.data?.name || res.data?.summary || res.data?.habitats?.length),
        note: `name="${res.data?.name ?? '?'}", habitats=${res.data?.habitats?.length ?? 0}, sources=${res.data?.groundingSources?.length ?? 0}`,
      })
    );

    // 6a. Field ID Challenge — Distractors
    await runAction(
      'Module 6a — Quiz (generateQuizDistractors: "Quercus robur")',
      'generateQuizDistractors',
      { correctTaxon: 'Quercus robur' },
      0.8,
      (res) => ({
        ok: res.status === 200 && Array.isArray(res.data?.result) && res.data.result.length >= 2,
        note: `distractors=${JSON.stringify(res.data?.result ?? [])}`,
      })
    );

    // 6b. Field ID Challenge — Evaluation
    await runAction(
      'Module 6b — Quiz (evaluateQuizAnswer)',
      'evaluateQuizAnswer',
      {
        correctTaxon: 'Quercus robur',
        guessedTaxon: 'Quercus petraea',
      },
      0.8,
      (res) => ({
        ok: res.status === 200 && typeof res.data?.result === 'string' && res.data.result.length > 20,
        note: `feedbackLen=${typeof res.data?.result === 'string' ? res.data.result.length : 0}`,
      })
    );
  });
}

function printHelp(): void {
  console.log(`
Taxonomy Workbench — Controlled Live Integration Test Harness

Usage (Windows 11 PowerShell / macOS / Linux):
  npm run verify:live -- --stage=3
  npm run verify:live -- --stage=1 --models-only
  npm run verify:live -- --stage=1 --confirm-billable
  npm run verify:live -- --stage=2 --confirm-billable
  npm run verify:live -- --stage=4 --confirm-billable --report=live-stage4-report.json

Note: Automatically loads .env.local from the repository root if GEMINI_API_KEY is not already set.

Options:
  --stage=1|2|3|4|all      Stage to run (default: 1)
                           1 = Model availability gate + 1 minimal SDK probe
                           2 = Google Search grounding check (1 call)
                           3 = Live iNaturalist v1/v2 & photo-host checks ($0, no API key)
                           4 = Six-module end-to-end smoke matrix (7 calls)
                           all = Runs Stages 1, 2, 3, and 4 sequentially
  --models-only            Stage 1 only: run 0-cost models.get check without inference
  --confirm-billable       Required acknowledgement before any billable Gemini call
  --max-calls=<N>          Hard inference-call cap (defaults: S1=2, S2=1, S3=0, S4=7, all=10)
  --max-budget-usd=<USD>   Hard estimated-cost cap in USD (default: 1.50)
  --report=<path.json>     Optional path to save sanitized JSON report (no secrets)
  --help, -h               Show this help text
`);
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const loadedLocalEnv = loadEnvFileIfPresent('.env.local');
  const runtimeConfig = getRuntimeCacheConfig();
  const guard = createCallBudgetGuard(args.maxCalls, args.maxBudgetUsd);
  const records: CallRecord[] = [];

  console.log('=== Taxonomy Workbench Live Integration Harness ===');
  console.log(
    `Stage: ${args.stage} | Model: ${runtimeConfig.model} | Thinking: ${runtimeConfig.thinkingLevel} | Namespace: ${runtimeConfig.cacheNamespace}`
  );
  console.log(
    `Safeguards: maxCalls=${args.maxCalls}, maxBudgetUsd=$${args.maxBudgetUsd.toFixed(2)}, confirmBillable=${args.confirmBillable}`
  );
  console.log(
    `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY || process.env.API_KEY ? 'SET (hidden)' : 'UNSET'}${loadedLocalEnv ? ' (loaded from .env.local)' : ''}`
  );
  console.log('');

  let failed = false;

  try {
    if (args.stage === '1' || args.stage === 'all') {
      const ok = await runStage1ConnectivityAndModelGate(args, guard, records);
      if (!ok) {
        failed = true;
        if (args.stage === 'all') {
          console.error('Stage 1 Gate failed — stopping before Stages 2–4 without substituting another model.');
        }
      }
    }

    if (!failed && (args.stage === '2' || args.stage === 'all')) {
      await runStage2Grounding(args, guard, records);
    }

    if (args.stage === '3' || args.stage === 'all') {
      await runStage3Inaturalist(records);
    }

    if (!failed && (args.stage === '4' || args.stage === 'all')) {
      await runStage4SixModules(args, guard, records);
    }
  } catch (err: any) {
    failed = true;
    records.push({
      stage: args.stage,
      label: 'Harness error / safeguard halt',
      status: 'fail',
      durationMs: 0,
      estimatedCostUsd: 0,
      details: err?.message || String(err),
    });
  }

  console.log('--- Results ---');
  for (const r of records) {
    const badge = r.status === 'pass' ? '[PASS]' : r.status === 'skipped' ? '[SKIP]' : '[FAIL]';
    console.log(`${badge} Stage ${r.stage} | ${r.label} (${r.durationMs}ms)`);
    console.log(`       ${r.details}`);
    if (r.status === 'fail') failed = true;
  }

  const summary = guard.getSummary();
  console.log('\n--- Token & Expenditure Summary ---');
  console.log(`Billable calls executed : ${summary.callsUsed} / ${summary.maxCalls}`);
  console.log(
    `Tokens (in/out/thoughts): ${summary.totalInputTokens} / ${summary.totalOutputTokens} / ${summary.totalThoughtsTokens}`
  );
  console.log(`Est. grounding queries  : ${summary.totalGroundingQueries} (covered by 5,000/mo free quota if unused)`);
  console.log(`Estimated token cost    : $${summary.estimatedCostUsd.toFixed(4)} USD (cap: $${summary.maxBudgetUsd.toFixed(2)})`);

  if (args.reportPath) {
    const payload = {
      timestamp: new Date().toISOString(),
      stage: args.stage,
      runtimeConfig,
      summary,
      records,
    };
    fs.writeFileSync(args.reportPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Saved sanitized report  : ${args.reportPath}`);
  }

  if (failed) {
    process.exitCode = 1;
  }
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((err) => {
    console.error(err?.message || err);
    process.exitCode = 1;
  });
}
