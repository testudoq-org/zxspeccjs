# zxspeccjs

Lightweight ZX Spectrum emulator in JavaScript/ESM.

This repository provides an in-browser ZX Spectrum emulator with support for multiple ROMs and Spectrum models.

See [`docs/ROM_ADDITION.md`](docs/ROM_ADDITION.md:1) for detailed instructions on adding new ROMs.

## ROM Selection and Management

The emulator supports selecting different ROM images (firmware) at runtime. ROMs are grouped into supported categories and can be added as preloaded modules.

Supported ROM categories

- `zx80-81` — ZX80/ZX81 originals
- `spectrum16-48` — 16K and 48K Spectrum images
- `spectrum128-plus2` — 128K and Plus2 images
- `spectrum-plus3` — +3 and disk-based images

ROM selection UI

- The UI exposes a ROM dropdown to choose from installed ROMs.
- When running the app locally, use the dropdown in the emulator UI to change ROMs and Spectrum model.

Adding new ROMs

- Follow the step-by-step guide in [`docs/ROM_ADDITION.md`](docs/ROM_ADDITION.md:1).
- In brief: place your ROM binary in `roms/`, convert it to a JS module in `src/roms/`, register it in `src/romManager.mjs` and rebuild.

Setup and usage

1. Install dependencies:

```bash
npm install
```

2. Run dev server:

```bash
npm run dev
```

3. Open the app in the browser (see [`index.html`](index.html:1)). Use the ROM selector dropdown to choose a ROM.

Build for production:

```bash
npm run build
```

Testing:

```bash
npm test
```

Troubleshooting

- ROM not appearing in the dropdown: ensure the JS ROM module is present in `src/roms/` and exported from `src/romManager.mjs`.
- ROM fails to load or crashes: check browser console for messages from `romManager`/`loader` and ensure the ROM file matches the expected model (e.g., 48K ROM for 48K mode).
- Bundling errors: verify rollup config (`rollup.config.js`) includes `src/roms` and that the generated JS module syntax is valid ESM.

Legal notice

- The emulator does not distribute commercial ROMs. Users must supply ROMs they legally own. See [`docs/ROM_ADDITION.md`](docs/ROM_ADDITION.md:1) for legal considerations and sourcing guidance.

---

## Developer: Enforce instruction blocks (Husky + script)

- **Setup (one-time):**
  - Run: `npm install`
  - Run: `npm run prepare` (installs Husky hooks)

- **Check & append instruction blocks:**
  - Run: `npm run ensure-instruction-blocks`
  - The script will append the required instructional blocks to `.github/copilot-instructions.md` and `.roocode/memory-bank.md` **only if missing**.
  - If the script modifies files it will stage them and exit non-zero; review the changes, commit them, and re-run your command.

- **Pre-commit behavior:**
  - A Husky pre-commit hook runs the script automatically and will block commits when it makes changes so you can review and commit the modifications manually.

- **Codacy & local analysis:**
  - The script attempts a best-effort `npx codacy-analysis-cli analyze <file>` for any modified files when the Codacy CLI is available.
  - I attempted to install the Codacy CLI via the repository MCP installer in this environment and the installer failed; as a fail-safe the repo includes `scripts/run-codacy-if-available.mjs` and `verify:local` will skip Codacy analysis when the CLI is not present (no local failure).
  - To enable full local Codacy analysis, follow the official Codacy CLI docs: https://docs.codacy.com/analysis/codacy-analysis-cli/ and then run `npx codacy-analysis-cli analyze --upload` locally. If you want, I can help troubleshoot the MCP installer failure or coordinate org-level setup.

- **Sonar (SonarLint / SonarCloud) — local & CI:**
  - We added `sonar-project.properties` (minimal config) and npm scripts: `npm run sonar:local` (requires SonarScanner CLI installed) and `npm run sonar:cloud:local` which passes the `SONAR_TOKEN` env var for SonarCloud.
  - CI integration: the GitHub Actions workflow will run a SonarCloud scan when the `SONAR_TOKEN` secret is configured for the repository (it is conditional on `secrets.SONAR_TOKEN`).
  - Local step: install SonarScanner CLI (https://docs.sonarsource.com/sonarqube/sonarqube-installation/ or https://sonarcloud.io/documentation), then run `npm run sonar:local` to execute a local scan against `sonar-project.properties`.
  - Recommendation: use the SonarLint VS Code extension for instant local feedback, and SonarCloud in CI for PR quality gates (complements Codacy checks).

- **Important reminders:**
  - Mandatory pre-commit reminder: "Before committing, run: npm run test:unit && npx playwright test tests/e2e --grep @smoke && codacy-analysis-cli analyze --upload"
  - Verify locally with: `npm run test:unit && npx playwright test tests/e2e --grep @smoke`

---


