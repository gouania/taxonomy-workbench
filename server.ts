import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

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
} from './server/gemini';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Lightweight per-IP sliding-window rate limiter for public API protection
  const requestLog = new Map<string, number[]>();
  const RATE_LIMIT_WINDOW_MS = 60_000;
  const RATE_LIMIT_MAX_REQUESTS = 40;

  function checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const recent = (requestLog.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
      requestLog.set(ip, recent);
      return false;
    }
    recent.push(now);
    requestLog.set(ip, recent);
    return true;
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

  // API Router
  app.post('/api/gemini', async (req, res) => {
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
            ? payload.activeFilters.slice(0, 12).map((f: unknown, i: number) => requireBoundedString(f, `Filter #${i + 1}`, 200))
            : [];
          const useSearch = payload.useSearch !== undefined ? Boolean(payload.useSearch) : true;
          const data = await serverCompareGuideTaxa(taxa, locality, activeFilters, useSearch);
          return res.json(data);
        }
        case 'identifySpecimen': {
          const characters = Array.isArray(payload.characters)
            ? payload.characters.slice(0, 60).map((c: unknown, i: number) => requireBoundedString(c, `Character #${i + 1}`, 200))
            : [];
          const notes = optionalBoundedString(payload.notes, 'Notes', 6000) || '';
          const location = optionalBoundedString(payload.location, 'Location', 250) || '';
          const suspectedFamilies = optionalBoundedString(payload.suspectedFamilies, 'Suspected families', 500) || '';
          const allowedStatuses = new Set(['observed', 'not_observed', 'unsure']);
          const followupObservations = Array.isArray(payload.followupObservations)
            ? payload.followupObservations
                .slice(0, 30)
                .filter((f: any) => f && typeof f === 'object')
                .map((f: any, i: number) => ({
                  questionId: requireBoundedString(f.questionId || `q_${i + 1}`, `Followup[${i}].questionId`, 100),
                  prompt: requireBoundedString(f.prompt, `Followup[${i}].prompt`, 400),
                  targetOrgan: optionalBoundedString(f.targetOrgan, `Followup[${i}].targetOrgan`, 100),
                  answer: requireBoundedString(f.answer || 'Not observed', `Followup[${i}].answer`, 400),
                  status: allowedStatuses.has(f.status) ? f.status : 'observed',
                }))
            : [];
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
            ? payload.filters.slice(0, 12).map((f: unknown, i: number) => requireBoundedString(f, `Filter #${i + 1}`, 200))
            : undefined;
          const allowedScopes = new Set(['comprehensive', 'curated', 'groups']);
          const coverageScope = allowedScopes.has(payload.coverageScope) ? payload.coverageScope : 'comprehensive';
          const data = await serverGenerateStructuredTaxonGuide(taxon, locality, useSearch, filters, coverageScope);
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
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
