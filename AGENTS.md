# AGENTS.md — Taxonomy Workbench Development Instructions

This document defines persistent scientific, engineering, and governance rules for all AI agents and contributors working in the **Taxonomy Workbench** repository.

## 1. Project Identity & Scientific Standards

- **Purpose:** Taxonomy Workbench is a professional botanical research and identification tool managed by a PhD-level plant taxonomist (scientific domain expert and product owner) through natural-language instructions.
- **Scientific rigour over apparent completeness:** Prioritise scientific accuracy, traceable evidence, and appropriate uncertainty over apparent completeness or polished prose.
- **No forced species-level identifications:** Never force species-level determinations when supplied evidence is insufficient. Stop at the finest defensible rank (`family`, `genus`, `species_group`, or `unresolved`), explain why separation stops there, and present finer possibilities strictly as unverified hypotheses.
- **Epistemic clarity:** Always distinguish clearly between:
  - **Observed characters** (explicitly supplied by the user — never treat `"Not observed"` or `"Unsure"` as morphological absence),
  - **Inferred characters** (derived from taxon descriptions or literature),
  - **Verified facts / retrieved web evidence** (backed by retrieved grounding sources or authoritative databases), and
  - **AI-generated hypotheses / synthesis** (unverified suggestions, including suggested literature).
- **Authoritative literature & zero fabrication:** Prefer recognised taxonomic frameworks and databases (ICN, APG IV, PPG I, POWO, WFO, IPNI, Index Fungorum, Catalogue of Life, Brummitt & Powell author abbreviations, regional Floras, and peer-reviewed monographs). Never fabricate bibliographic references or present unretrieved citations as verified consulted sources.
- **Taxonomic concept consistency:** Preserve accepted names, authorities, synonymy, and taxonomic concept handoffs (`TaxonConceptHandoff`, `PlaceRef`, `SpecimenRecord`) consistently across all modules (`Guides`, `Identify`, `Explore Taxa`, `Places & flora`, `Authorities`, and `Field Photo Quiz`).

## 2. Preservation & Change Discipline

- **Preserve scientific behaviour by default:** Preserve existing scientific prompts (`SYSTEM_TAXONOMIST_INSTRUCTION`, `SYSTEM_PROMPT`, and per-action prompts/schemas in `server/gemini.ts`), validation logic (`guideValidation.ts`, `identifyEvidence.ts`), workflows, and functionality unless changes are explicitly authorised by the product owner.
- **Incremental, reversible changes:** Prefer small, focused, well-scoped edits that can be reviewed and reverted cleanly. Avoid speculative refactors outside the approved task scope.
- **Regression tests for every defect fix:** Whenever a bug, validation gap, or security defect is fixed, add targeted automated regression test(s) covering the failure mode.
- **Mandatory verification after substantive changes:** After any substantive code change, run:
  1. `npm run lint` (`tsc --noEmit`)
  2. `npm test` (`tsx --test tests/*.test.ts`)
  3. `npm run build` (`vite build` + `esbuild`)
  4. Relevant browser checks (e.g., headless Chrome / Playwright verification of affected modules in dev and/or standalone production mode).

## 3. Security, Credentials & Migration Compatibility

- **Server-side credentials only:** Keep `GEMINI_API_KEY` (and any future API secrets) strictly server-side. Never expose credentials in conversation output, logs, source code, `.agents/` configs, or client bundles.
- **AI Studio transitional compatibility:** Maintain compatibility with Google AI Studio during the transitional migration period (e.g., preserve `metadata.json`, `DISABLE_HMR` handling, and default port `3000` fallback) while progressively decoupling hosting, configuration, and security for standalone deployment.
- **Canonical package manager:** Use **`npm`** (`npm ci` for deterministic installs, `package-lock.json` as the canonical lockfile). Do not introduce competing lockfile updates via `bun` unless explicitly instructed.

## 4. Communication & Governance

- **Explain consequential technical decisions:** Communicate architectural, security, cost, or scientific trade-offs clearly in plain, rigorous language suitable for a PhD plant taxonomist acting as product owner. Distinguish confirmed code findings from potential concerns.
- **Approval gates (hard stops):** Never do any of the following without explicit approval from the product owner:
  - Push to `main` (always work on dedicated feature/migration branches),
  - Deploy to production, or
  - Make live billable API calls or infrastructure changes that could incur significant expenditure.

## 5. Repository Quick Reference

- **Frontend entry & routing:** `src/App.tsx` (6 mounted modules: `guide`, `identify`, `profiles`, `localities`, `authorities`, `quiz`).
- **Backend & Gemini RPC:** `server.ts` (`POST /api/gemini`), `server/gemini.ts` (12 actions, `gemini-4-hydrogen` default).
- **Validation & provenance:** `src/utils/guideValidation.ts`, `src/utils/identifyEvidence.ts`, `src/utils/placeUtils.ts`.
- **Client services:** `src/services/geminiService.ts`, `src/services/inaturalistService.ts`, `src/services/cacheService.ts`, `src/services/historyFavoritesService.ts`.
- **Tests:** `tests/identify.test.ts`, `tests/places.test.ts`, `tests/reliability.test.ts` (Node built-in test runner via `tsx --test`).
