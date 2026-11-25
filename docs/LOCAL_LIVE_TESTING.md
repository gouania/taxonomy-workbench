# Local Live Integration Testing Guide (Windows 11)

This guide is written for running **Taxonomy Workbench** and its controlled live integration tests on your personal **Windows 11** laptop without ever pasting your Gemini API key into chat, logs, or Git.

---

## 1. One-Time Prerequisites on Windows 11

Install two free, official tools if you do not already have them:

1. **Git for Windows:** Download from https://git-scm.com/download/win (accept the default options during installation).
2. **Node.js 22 LTS:** Download the **22.x LTS** Windows Installer (`.msi`) from https://nodejs.org/ (accept the default options).

To verify both are installed, open **Windows Terminal** (or **PowerShell** from the Start menu) and run:

```powershell
git --version
node -v
npm -v
```

You should see `git version 2.x...`, `v22.x...`, and `10.x...` (or `11.x...`).

---

## 2. Clone the Repository & Install Dependencies

In PowerShell, choose a folder (for example your user folder) and run:

```powershell
cd $HOME
git clone https://github.com/gouania/taxonomy-workbench.git
cd taxonomy-workbench
git checkout dev/live-integration
npm ci
```

Verify the offline baseline (0 API calls, \$0 cost):

```powershell
npm run lint
npm test
npm run build
```

All tests should pass with 0 errors.

---

## 3. Configure `GEMINI_API_KEY` Securely (Local Only)

Your `.gitignore` already ignores `.env*` files (except `.env.example`), so `.env.local` will **never** be committed to Git.

Run this command in PowerShell inside the `taxonomy-workbench` folder (replace `PASTE_YOUR_KEY_HERE` with your `"Taxonomy Workbench – Antigravity Development"` key):

```powershell
@'
GEMINI_API_KEY=PASTE_YOUR_KEY_HERE
'@ | Set-Content -Path .env.local -Encoding utf8NoBOM
```

Verify that Git ignores `.env.local` (it must **not** appear in `git status`):

```powershell
git status
```

You should see `nothing to commit, working tree clean`.

> **Tip:** Never use Notepad's default "Save As" without quotes, or Windows may accidentally name the file `.env.local.txt`. Using the PowerShell command above avoids this issue completely.

---

## 4. Run the Staged Live Integration Tests

The test harness (`scripts/live-integration.ts`) includes built-in safeguards:
- **Zero billable calls** unless you explicitly include `--confirm-billable`.
- **Hard call-count cap** (`--max-calls`) and **estimated USD cap** (`--max-budget-usd`, default `1.50`).
- **Zero silent model substitution:** If `gemini-4-hydrogen` is unavailable on your key, Stage 1 stops immediately and lists the models visible to your key.
- **Per-call and total token + estimated USD reporting** at the end of every run.

Run the stages in order:

### Stage 3 — Live iNaturalist & Photo Hosts (Free, 0 Gemini calls)
```powershell
npm run verify:live -- --stage=3
```

### Stage 1A — Model Availability Check Only (Free, 0 inference tokens)
```powershell
npm run verify:live -- --stage=1 --models-only
```
- Confirm `[PASS] Stage 1 | models.get("models/gemini-4-hydrogen") [0 tokens]`.
- If this fails, **stop here** and share the console output (it contains no API keys).

### Stage 1B — Minimal Gemini Connectivity Probe (1 tiny call, ~\$0.01)
```powershell
npm run verify:live -- --stage=1 --confirm-billable
```
- Prints exact `usageMetadata` token counts (`in`, `out`, `thoughts`, `total`) from Gemini.

### Stage 2 — Google Search Grounding Check (1 call, ~\$0.03)
```powershell
npm run verify:live -- --stage=2 --confirm-billable
```
- Verifies live `groundingSources` (`http(s)://` URLs), `sourceProvenance`, and `X-Taxonomy-Cache-Namespace`.

### Stage 4 — Six-Module End-to-End Smoke Matrix (7 calls, ~\$0.35–\$0.50)
```powershell
npm run verify:live -- --stage=4 --confirm-billable --report=live-stage4-report.json
```
- Tests **Authorities**, **Explore Taxa**, **Identify** (including the anti-forced-species epistemic check), **Guides** (*Betula* in Great Britain), **Places & flora** (New Forest), and **Field ID Challenge** (distractors + evaluation).
- Saves a sanitized JSON summary to `live-stage4-report.json` (contains zero API keys; do not commit this report file).

---

## 5. Interactive Browser Verification on Your Laptop

To inspect all six modules interactively in Chrome or Edge with live Gemini + iNaturalist responses:

```powershell
npm run start:local
```

Then open **http://localhost:3000** in your browser.  
When finished, press `Ctrl + C` in PowerShell to stop the server.

---

## 6. Switching Models Temporarily (Only If Needed)

If you ever want to test an alternative Gemini model without editing code, set `GEMINI_MODEL` in your current PowerShell window only:

```powershell
$env:GEMINI_MODEL = "gemini-2.5-pro"
npm run verify:live -- --stage=1 --models-only
Remove-Item Env:GEMINI_MODEL
```
