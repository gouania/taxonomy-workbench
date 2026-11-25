# Taxonomy Workbench

**Taxonomy Workbench** is a botanical research, specimen identification, and regional flora reference web application combining AI-assisted taxonomic synthesis (Google Gemini API with Google Search grounding) with live biodiversity data from iNaturalist.

---

## Application Architecture

Taxonomy Workbench is a single-repository TypeScript application consisting of a React single-page application (SPA) backed by a lightweight Express server that proxies all Gemini API requests.

### Technology Stack
- **Frontend:** React 19, TypeScript 5.8, Tailwind CSS v4 (`@tailwindcss/vite`, `@tailwindcss/typography`), `lucide-react`, `react-markdown`.
- **Backend:** Node.js 22, Express 4 (`server.ts`), `@google/genai` (`server/gemini.ts`).
- **Build & Tooling:** Vite 6 (frontend bundle), `esbuild` (bundles `server.ts` into `dist/server.cjs`), `tsx` (TypeScript execution for development and tests).
- **External Integrations:**
  - **Google Gemini API** (server-side only via `POST /api/gemini`, default model `gemini-4-hydrogen` with configurable `ThinkingLevel` and optional Google Search grounding).
  - **iNaturalist REST API v1 & v2** (client-side fetches for taxon photos, place boundary resolution, locality observations, and quiz specimens).
  - **OpenStreetMap** (`iframe` map embeds in *Places & flora*) and outbound search links to POWO, WFO, IPNI, GBIF, BHL, and HUH.
- **Persistence:** Browser `localStorage` only (24-hour response cache keyed by model/thinking tag, recent searches, field bookmarks, and up to 20 device-saved structured guides). No server-side database is used.

### Modules & Cross-Module Workflows

All six modules remain mounted in `src/App.tsx` to preserve in-progress work when switching tabs, and share structured context via `NavigationTarget` (`PlaceRef`, `SpecimenRecord`, and `TaxonConceptHandoff`):

1. **Guides (`src/components/guide/`):** Structured regional identification guides by taxon and locality (coverage scope selection, Fresh vs. Herbarium material presets, interactive `KeyRunner` with graph-level structural validation, 2–4 taxon subset comparison modal, Markdown export, print view, and device-saved guides) plus a free-text custom guide mode.
2. **Identify (`src/components/identify/`):** Iterative specimen identification from field notes, optional 145-character anatomical matrix, collection place/GPS, observed habitat, and adaptive follow-up questions with explicit `"Not observed"` / `"Unsure"` states and post-hoc evidence auditing (`src/utils/identifyEvidence.ts`).
3. **Explore Taxa (`src/components/profiles/`):** Single-taxon monographs (morphology, APG IV classification, synonyms, IUCN status, hazards, phenology, ecology, etymology, history, distribution, look-alikes, iNaturalist gallery) and 2–3 taxon side-by-side comparison.
4. **Places & flora (`src/components/localities/`):** Place exploration by name, coordinates, or GPS, with iNaturalist ambiguity checks, habitat summaries, characteristic plant examples (explicitly distinct from complete checklists), optional elevation zones, and recent iNaturalist observations.
5. **Authorities (`src/components/authorities/`):** Botanical author biographies, IPNI / Brummitt & Powell standard abbreviations, Index Herbariorum collections, and described/eponymous taxa.
6. **Field Photo Quiz (`src/components/quiz/`):** Photo identification trainer using Research Grade iNaturalist observations and AI-generated distractors and diagnostic feedback.

---

## Development Workflow (`npm`)

`npm` is the canonical package manager (`package-lock.json` is the authoritative lockfile).

### Prerequisites
- Node.js 22+ and npm (verified on Node `v22.23.5`, npm `12.2.2`).

### Install Dependencies
```bash
npm ci
```

### Run in Development Mode
Starts Express (`server.ts`) with Vite dev middleware on `http://localhost:3000` (or `PORT`):
```bash
npm run dev
```

### Build for Production
Builds the frontend into `dist/` and bundles the Express server into `dist/server.cjs`:
```bash
npm run build
```

### Run Standalone Production Build
`npm start` sets `NODE_ENV=production`, serves compiled static assets from `dist/`, exposes `GET /health`, and listens on `process.env.PORT` (default `3000`):
```bash
npm start
```

---

## Environment Variables

Secrets must be kept strictly server-side and never committed to Git. See `.env.example` for reference.

| Variable | Required | Where Used | Purpose |
| :--- | :---: | :--- | :--- |
| `GEMINI_API_KEY` *(or `API_KEY`)* | Yes (for AI actions) | `server/gemini.ts` | Authenticates server-side requests to the Google Gemini API. |
| `GEMINI_MODEL` | Optional (`gemini-4-hydrogen`) | `server/gemini.ts` | Overrides the default Gemini model ID without code changes. |
| `GEMINI_THINKING_LEVEL` | Optional (`MEDIUM`) | `server/gemini.ts` | Overrides the default thinking level for primary synthesis actions (`LOW`, `MEDIUM`, `HIGH`, `XHIGH`). Lightweight helper actions retain `LOW`. |
| `PORT` | Optional (`3000`) | `server.ts` | Listening port for the HTTP server (defaults to `3000` for AI Studio compatibility). |
| `TRUST_PROXY` | Optional (`1` in prod, `false` in dev) | `server.ts` | Express `trust proxy` setting so per-IP rate limiting identifies clients behind reverse proxies. |
| `NODE_ENV` | Set by `npm start` (`production`) | `server.ts` | Switches Express from Vite dev middleware to serving built static assets from `dist/`. |
| `DISABLE_HMR` | Optional (`true` in AI Studio) | `vite.config.ts` | Disables Vite Hot Module Replacement when running inside Google AI Studio's editor. |

> **Important:** `dotenv` is not installed as a dependency. Supply environment variables via your hosting platform's secret manager, your shell environment, or Node 22's built-in flag when running locally (e.g. `node --env-file=.env dist/server.cjs`).

---

## Testing & Verification Commands

| Command | Underlying Tool | What It Checks |
| :--- | :--- | :--- |
| `npm run lint` | `tsc --noEmit` | Full TypeScript type check across frontend, server, and tests. |
| `npm test` | `tsx --test tests/*.test.ts` | Runs all automated unit and static-render tests (`tests/identify.test.ts`, `tests/places.test.ts`, `tests/reliability.test.ts`). |
| `npm run build` | `vite build` + `esbuild` | Verifies production client bundle and server bundle compilation. |

---

## Verified Baseline (Commit `92971d3`)

Established on branch `dev/migration-baseline` from `main` (`92971d3`) on Node `v22.23.5` / npm `12.2.2`:

### Verified Functionality
- **Dependency installation:** `npm ci` succeeded cleanly (342 packages).
- **TypeScript (`npm run lint`):** **0 errors** (exit `0`).
- **Automated test suite (`npm test`):** **35 / 35 tests passing** (0 failing, 0 skipped; ~3.9 s):
  - `tests/identify.test.ts`: 9 passing
  - `tests/places.test.ts`: 6 passing
  - `tests/reliability.test.ts`: 20 passing
- **Production build (`npm run build`):** Succeeded (exit `0`).
  - Output: `dist/index.html` (0.81 kB), `dist/assets/index-*.css` (145.02 kB / 20.11 kB gzip), `dist/assets/index-*.js` (761.69 kB / 204.82 kB gzip), `dist/server.cjs` (149.8 kB).
  - Known baseline warning: Vite reports a chunk-size warning (`index-*.js` > 500 kB minified).
- **Development server (`npm run dev`) & headless Chrome inspection:** Started cleanly on port `3000`; Landing page and all six modules rendered with `HTTP 200`, expected headings, `0` `ErrorBoundary` triggers, `0` uncaught JS errors, working navigation, and `HTTP 400` validation on invalid `/api/gemini` actions.
- **Standalone production server (`NODE_ENV=production node dist/server.cjs`):** Verified independently of Google AI Studio; served compiled `dist/` assets for all six modules with `0` uncaught JS errors and returned a clean `HTTP 500` JSON error when `GEMINI_API_KEY` is absent.

### Untested Live External Integrations (Not Executed in Baseline)
To avoid unapproved API expenditure and respect restricted VM network egress during baseline setup, the following live external integrations were **not** executed end-to-end:
- **Live Google Gemini API calls** (`gemini-4-hydrogen` generation, structured JSON outputs, and Google Search grounding against `generativelanguage.googleapis.com`). *(Official Google documentation confirms `gemini-4-hydrogen` is GA on the standard Gemini API outside Google AI Studio.)*
- **Live iNaturalist API queries & specimen images** (`api.inaturalist.org`, `static.inaturalist.org`, `inaturalist-open-data.s3.amazonaws.com`).
- **Live OpenStreetMap iframe tiles** (`openstreetmap.org`) and **Google Fonts** (`fonts.googleapis.com`, which gracefully degrades to system fonts when blocked).
