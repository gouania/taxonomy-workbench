import express from 'express';
import path from 'path';

import {
  serverAnalyzeSingleTaxon,
  serverCompareTaxa,
  serverIdentifySpecimen,
  serverSuggestNextCharacters,
  serverExplainCharacter,
  serverLookupAuthority,
  serverGenerateLocalityProfile,
  serverGenerateQuizDistractors,
  serverEvaluateQuizAnswer,
  serverGenerateTaxonGuide,
  serverGenerateStructuredTaxonGuide,
  serverCompareGuideTaxa,
  getRuntimeCacheConfig,
} from './server/gemini';

export function resolvePort(rawPort: string | undefined = process.env.PORT): number {
  if (!rawPort) return 3000;
  const parsed = Number(rawPort);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
    return parsed;
  }
  return 3000;
}

export function resolveNodeEnv(
  rawNodeEnv: string | undefined = process.env.NODE_ENV,
  argv: string[] = process.argv
): string {
  // Explicit CLI flags take precedence over inherited NODE_ENV (e.g. `npm start`
  // passing `--production` must reliably launch production mode even if the shell
  // exports NODE_ENV=development).
  if (argv.includes('--production')) return 'production';
  if (argv.includes('--development')) return 'development';
  const trimmed = rawNodeEnv?.trim();
  if (trimmed) return trimmed;
  const entry = argv[1];
  if (entry && path.basename(entry) === 'server.cjs') return 'production';
  return 'development';
}

export function resolveTrustProxy(
  rawValue: string | undefined = process.env.TRUST_PROXY
): boolean | number | string {
  if (rawValue !== undefined && rawValue.trim() !== '') {
    const trimmed = rawValue.trim().toLowerCase();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
    return rawValue.trim();
  }
  // Safe default: never trust spoofable X-Forwarded-For headers unless explicitly configured
  // for a known reverse proxy (e.g., TRUST_PROXY=1 on Cloud Run / Nginx / Cloudflare).
  return false;
}

export interface RateLimiterOptions {
  windowMs?: number;
  maxRequests?: number;
  maxTrackedIps?: number;
  minSweepIntervalMs?: number;
  now?: () => number;
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 40;
  const maxTrackedIps = options.maxTrackedIps ?? 10_000;
  const minSweepIntervalMs = options.minSweepIntervalMs ?? Math.max(1_000, Math.floor(windowMs / 6));
  const getNow = options.now ?? (() => Date.now());

  const requestLog = new Map<string, number[]>();
  let lastSweepAt = getNow();
  let sweeps = 0;

  function pruneExpired(now: number): void {
    sweeps++;
    for (const [ip, timestamps] of requestLog.entries()) {
      const recent = timestamps.filter((ts) => now - ts < windowMs);
      if (recent.length === 0) {
        requestLog.delete(ip);
      } else if (recent.length !== timestamps.length) {
        requestLog.set(ip, recent);
      }
    }
    lastSweepAt = now;
  }

  function check(ip: string): boolean {
    const now = getNow();

    // Periodic time-bounded cleanup so sustained traffic never triggers O(N) scans per request
    if (now - lastSweepAt >= windowMs) {
      pruneExpired(now);
    }

    const existing = requestLog.get(ip);
    if (existing !== undefined) {
      const recent = existing.filter((ts) => now - ts < windowMs);
      if (recent.length >= maxRequests) {
        requestLog.set(ip, recent);
        return false;
      }
      recent.push(now);
      requestLog.set(ip, recent);
      return true;
    }

    // New untracked IP: if at capacity, attempt at most one rate-limited sweep to reclaim
    // expired records; if still at capacity with active IPs, fail closed instead of evicting
    // an active IP record and resetting its rate limit.
    if (requestLog.size >= maxTrackedIps) {
      if (now - lastSweepAt >= minSweepIntervalMs) {
        pruneExpired(now);
      }
      if (requestLog.size >= maxTrackedIps) {
        return false;
      }
    }

    requestLog.set(ip, [now]);
    return true;
  }

  return {
    check,
    pruneExpired: () => pruneExpired(getNow()),
    size: () => requestLog.size,
    sweepCount: () => sweeps,
  };
}

export interface CreateAppOptions {
  nodeEnv?: string;
  trustProxy?: boolean | number | string;
  rateLimit?: RateLimiterOptions;
  skipFrontend?: boolean;
}

export async function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const nodeEnv = options.nodeEnv ?? resolveNodeEnv();

  app.set('trust proxy', options.trustProxy ?? resolveTrustProxy(process.env.TRUST_PROXY));
  app.use(express.json({ limit: '256kb' }));

  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large' || err?.status === 413) {
      return res.status(413).json({ error: 'Request payload exceeds maximum allowed size of 256kb.' });
    }
    if (err instanceof SyntaxError && (err as any)?.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON request body.' });
    }
    return next(err);
  });

  app.get('/health', (_req, res) => {
    return res.status(200).json({ status: 'ok' });
  });

  app.get('/api/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(getRuntimeCacheConfig());
  });

  // Lightweight per-IP sliding-window rate limiter with bounded memory and expiry pruning
  const rateLimiter = createRateLimiter(options.rateLimit);
  function checkRateLimit(ip: string): boolean {
    return rateLimiter.check(ip);
  }

  function requireBoundedString(val: unknown, label: string, maxLen = 500): string {
    if (typeof val !== 'string' || !val.trim()) {
      throw Object.assign(new Error(`${label} is required and must be a non-empty string.`), { statusCode: 400 });
    }
    const trimmed = val.trim();
    if (trimmed.length > maxLen) {
      throw Object.assign(new Error(`${label} exceeds maximum length of ${maxLen} characters.`), { statusCode: 400 });
    }
    return trimmed;
  }

  function optionalBoundedString(val: unknown, label: string, maxLen = 500): string | undefined {
    if (val === undefined || val === null || val === '') return undefined;
    if (typeof val !== 'string') {
      throw Object.assign(new Error(`${label} must be a string.`), { statusCode: 400 });
    }
    const trimmed = val.trim();
    if (trimmed.length > maxLen) {
      throw Object.assign(new Error(`${label} exceeds maximum length of ${maxLen} characters.`), { statusCode: 400 });
    }
    return trimmed || undefined;
  }

  const ALLOWED_FOLLOWUP_STATUSES = new Set(['observed', 'not_observed', 'unsure']);

  function parseFollowupObservations(raw: unknown, labelPrefix = 'Followup'): import('./src/types').FollowUpObservation[] {
    if (!Array.isArray(raw)) return [];
    if (raw.length > 30) {
      throw Object.assign(
        new Error(`${labelPrefix} list exceeds maximum limit of 30 observations. Remove older observations before re-evaluating.`),
        { statusCode: 400 }
      );
    }
    return raw
      .filter((f: any) => f && typeof f === 'object')
      .map((f: any, i: number) => ({
        id: optionalBoundedString(f.id, `${labelPrefix}[${i}].id`, 100),
        questionId: requireBoundedString(f.questionId || `q_${i + 1}`, `${labelPrefix}[${i}].questionId`, 100),
        prompt: requireBoundedString(f.prompt, `${labelPrefix}[${i}].prompt`, 400),
        targetOrgan: optionalBoundedString(f.targetOrgan, `${labelPrefix}[${i}].targetOrgan`, 100),
        answer: requireBoundedString(f.answer || 'Not observed', `${labelPrefix}[${i}].answer`, 400),
        status: (ALLOWED_FOLLOWUP_STATUSES.has(f.status) ? f.status : 'observed') as 'observed' | 'not_observed' | 'unsure',
      }));
  }

  function parseOptionalSpecimenRecord(raw: unknown): import('./src/types').SpecimenRecord | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw Object.assign(new Error('specimenRecord must be an object.'), { statusCode: 400 });
    }
    const obj = raw as Record<string, unknown>;
    const selectedTraits = Array.isArray(obj.selectedTraits)
      ? obj.selectedTraits.slice(0, 60).map((c: unknown, i: number) => requireBoundedString(c, `specimenRecord.selectedTraits[${i}]`, 200))
      : [];
    return {
      notes: optionalBoundedString(obj.notes, 'specimenRecord.notes', 6000),
      selectedTraits,
      observedHabitat: optionalBoundedString(obj.observedHabitat, 'specimenRecord.observedHabitat', 250),
      locality: optionalBoundedString(obj.locality, 'specimenRecord.locality', 250),
      followups: parseFollowupObservations(obj.followups, 'specimenRecord.followups'),
    };
  }

  function parseOptionalTaxonConcept(raw: unknown): import('./src/types').TaxonConceptHandoff | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      throw Object.assign(new Error('taxonConcept must be an object.'), { statusCode: 400 });
    }
    const obj = raw as Record<string, unknown>;
    const submittedName = requireBoundedString(obj.submittedName, 'taxonConcept.submittedName', 250);
    const acceptedName = requireBoundedString(obj.acceptedName, 'taxonConcept.acceptedName', 250);
    const synonyms = Array.isArray(obj.synonyms)
      ? obj.synonyms.slice(0, 30).map((s: unknown, i: number) => requireBoundedString(s, `taxonConcept.synonyms[${i}]`, 250))
      : undefined;
    return {
      submittedName,
      acceptedName,
      authority: optionalBoundedString(obj.authority, 'taxonConcept.authority', 200),
      family: optionalBoundedString(obj.family, 'taxonConcept.family', 200),
      synonyms: synonyms && synonyms.length > 0 ? synonyms : undefined,
      treatmentNote: optionalBoundedString(obj.treatmentNote, 'taxonConcept.treatmentNote', 500),
    };
  }

  // API Router
  app.post('/api/gemini', async (req, res) => {
    res.setHeader('X-Taxonomy-Cache-Namespace', getRuntimeCacheConfig().cacheNamespace);
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: 'Too many requests. Please wait a minute before trying again.' });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Invalid request body.' });
    }

    const { action, payload } = req.body;
    if (typeof action !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Request must include a valid action and payload object.' });
    }

    try {
      switch (action) {
        case 'analyzeSingleTaxon': {
          const name = requireBoundedString(payload.name, 'Taxon name', 250);
          const locality = optionalBoundedString(payload.locality, 'Locality', 250);
          const useWebSearch = Boolean(payload.useWebSearch);
          const data = await serverAnalyzeSingleTaxon(name, locality, useWebSearch);
          return res.json(data);
        }
        case 'compareTaxa': {
          if (!Array.isArray(payload.names) || payload.names.length < 2 || payload.names.length > 3) {
            return res.status(400).json({ error: 'compareTaxa requires between 2 and 3 taxon names.' });
          }
          const names = payload.names.map((n: unknown, i: number) => requireBoundedString(n, `Taxon name #${i + 1}`, 250));
          const locality = optionalBoundedString(payload.locality, 'Locality', 250);
          const useWebSearch = Boolean(payload.useWebSearch);
          const data = await serverCompareTaxa(names, locality, useWebSearch);
          return res.json(data);
        }
        case 'compareGuideTaxa': {
          if (!Array.isArray(payload.taxa) || payload.taxa.length < 2 || payload.taxa.length > 4) {
            return res.status(400).json({ error: 'Subset comparison requires between 2 and 4 taxa.' });
          }
          const taxa = payload.taxa.map((t: any, i: number) => {
            if (!t || typeof t !== 'object') {
              throw Object.assign(new Error(`Invalid taxon entry at index ${i}.`), { statusCode: 400 });
            }
            return {
              scientific_name: requireBoundedString(t.scientific_name, `Taxa[${i}].scientific_name`, 250),
              common_name: optionalBoundedString(t.common_name, `Taxa[${i}].common_name`, 250) ?? null,
              key_diagnostics: optionalBoundedString(t.key_diagnostics, `Taxa[${i}].key_diagnostics`, 2000),
              habitat_and_ecology: optionalBoundedString(t.habitat_and_ecology, `Taxa[${i}].habitat_and_ecology`, 2000),
            };
          });
          const locality = optionalBoundedString(payload.locality, 'Locality', 250) || '';
          const activeFilters = Array.isArray(payload.activeFilters)
            ? payload.activeFilters.slice(0, 12).map((f: unknown, i: number) => requireBoundedString(f, `Filter #${i + 1}`, 400))
            : [];
          const useSearch = payload.useSearch !== undefined ? Boolean(payload.useSearch) : true;
          const specimenRecord = parseOptionalSpecimenRecord(payload.specimenRecord);
          const data = await serverCompareGuideTaxa(taxa, locality, activeFilters, useSearch, specimenRecord);
          return res.json(data);
        }
        case 'identifySpecimen': {
          const characters = Array.isArray(payload.characters)
            ? payload.characters.slice(0, 60).map((c: unknown, i: number) => requireBoundedString(c, `Character #${i + 1}`, 200))
            : [];
          const notes = optionalBoundedString(payload.notes, 'Notes', 6000) || '';
          const location = optionalBoundedString(payload.location, 'Location', 250) || '';
          const suspectedFamilies = optionalBoundedString(payload.suspectedFamilies, 'Suspected families', 500) || '';
          const followupObservations = parseFollowupObservations(payload.followupObservations, 'Followup');
          if (characters.length === 0 && !notes && followupObservations.length === 0) {
            return res.status(400).json({ error: 'Provide either morphological characters or specimen field notes.' });
          }
          const useWebSearch = Boolean(payload.useWebSearch);
          const data = await serverIdentifySpecimen(
            characters,
            notes,
            location,
            suspectedFamilies,
            useWebSearch,
            followupObservations
          );
          return res.json(data);
        }
        case 'suggestNextCharacters': {
          const selectedCharacters = Array.isArray(payload.selectedCharacters)
            ? payload.selectedCharacters.slice(0, 60).map(String)
            : [];
          const availableCharacters = Array.isArray(payload.availableCharacters)
            ? payload.availableCharacters.slice(0, 200).map(String)
            : [];
          const data = await serverSuggestNextCharacters(selectedCharacters, availableCharacters);
          return res.json(data);
        }
        case 'explainCharacter': {
          const characterLabel = requireBoundedString(payload.characterLabel, 'Character label', 250);
          const data = await serverExplainCharacter(characterLabel);
          return res.json({ result: data });
        }
        case 'lookupAuthority': {
          const query = requireBoundedString(payload.query, 'Authority query', 250);
          const useWebSearch = Boolean(payload.useWebSearch);
          const data = await serverLookupAuthority(query, useWebSearch);
          return res.json(data);
        }
        case 'generateLocalityProfile': {
          const locationInput = requireBoundedString(payload.locationInput, 'Location', 250);
          const data = await serverGenerateLocalityProfile(locationInput);
          return res.json(data);
        }
        case 'generateQuizDistractors': {
          const correctTaxon = requireBoundedString(payload.correctTaxon, 'Taxon', 250);
          const data = await serverGenerateQuizDistractors(correctTaxon);
          return res.json({ result: data });
        }
        case 'evaluateQuizAnswer': {
          const correctTaxon = requireBoundedString(payload.correctTaxon, 'Correct taxon', 250);
          const guessedTaxon = requireBoundedString(payload.guessedTaxon, 'Guessed taxon', 250);
          const data = await serverEvaluateQuizAnswer(correctTaxon, guessedTaxon);
          return res.json({ result: data });
        }
        case 'generateTaxonGuide': {
          const inputText = requireBoundedString(payload.inputText, 'Guide prompt', 8000);
          const useSearch = payload.useSearch !== undefined ? Boolean(payload.useSearch) : true;
          const data = await serverGenerateTaxonGuide(inputText, useSearch);
          return res.json(data);
        }
        case 'generateStructuredTaxonGuide': {
          const taxon = requireBoundedString(payload.taxon, 'Taxon', 250);
          const locality = requireBoundedString(payload.locality, 'Locality', 250);
          const useSearch = payload.useSearch !== undefined ? Boolean(payload.useSearch) : true;
          const filters = Array.isArray(payload.filters)
            ? payload.filters.slice(0, 12).map((f: unknown, i: number) => requireBoundedString(f, `Filter #${i + 1}`, 400))
            : undefined;
          const allowedScopes = new Set(['comprehensive', 'curated', 'groups']);
          const coverageScope = allowedScopes.has(payload.coverageScope) ? payload.coverageScope : 'comprehensive';
          const specimenRecord = parseOptionalSpecimenRecord(payload.specimenRecord);
          const taxonConcept = parseOptionalTaxonConcept(payload.taxonConcept);
          const data = await serverGenerateStructuredTaxonGuide(
            taxon,
            locality,
            useSearch,
            filters,
            coverageScope,
            specimenRecord,
            taxonConcept
          );
          return res.json(data);
        }
        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }
    } catch (error: any) {
      const status = typeof error?.statusCode === 'number' ? error.statusCode : 500;
      if (status >= 500) {
        console.error(`Error in /api/gemini (${action}):`, error);
      }
      return res.status(status).json({ error: error.message || 'Server error processing request' });
    }
  });

  // Vite middleware for dev / static serving for prod
  if (!options.skipFrontend) {
    if (nodeEnv !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

export async function startServer() {
  const app = await createApp();
  const port = resolvePort(process.env.PORT);

  return app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

function isDirectExecution(): boolean {
  if (process.env.TAXONOMY_DISABLE_AUTOSTART === 'true') return false;
  const entry = process.argv[1];
  if (!entry) return false;
  const base = path.basename(entry);
  return base === 'server.ts' || base === 'server.cjs' || base === 'server.js';
}

if (isDirectExecution()) {
  startServer().catch((err) => {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  });
}
