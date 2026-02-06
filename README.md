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


## Acknowledgements & Thanks

This project builds on the incredible work of the ZX Spectrum community and would not have been possible without the following resources, tools, and archives. Huge thanks to everyone who has kept the Speccy alive for decades!

- **[gasman/jsspeccy3](https://github.com/gasman/jsspeccy3)**A high-performance ZX Spectrum emulator for the browser (written by Matt Westcott / gasman). This is the core emulation engine powering the browser experience here. It's a complete rewrite using modern web tech (WebAssembly, Web Workers, etc.) for accurate 48K/128K/Pentagon emulation, tape loading, AY sound, and more. Check out the live demo at [https://jsspeccy.zxdemo.org/](https://jsspeccy.zxdemo.org/) and the source on GitHub. Massive respect for open-sourcing this gem!
- **[World of Spectrum Classic](https://worldofspectrum.org/)**
  The definitive online archive for ZX Spectrum software, preserving thousands of games, utilities, magazines, and documentation. Many of the tape images (.TAP/.TZX), ROMs, screenshots, and loading screens used or tested with this project come from (or were inspired by) this irreplaceable resource. Thank you for keeping the library accessible and for all the historical context.

Additional shout-outs to other community pillars commonly referenced or utilized in Spectrum emulation projects:

- **Internet Archive ZX Spectrum collections** — For mirrored games, tapes, and snapshots (e.g., https://archive.org/details/zx_spectrum_library_games).
- **ZXDB (by Einar Saukas and others)** — Extensive database of Spectrum software metadata, often cross-referenced with World of Spectrum.
- **Various open-source tools** — Including TAP/TZX utilities, Z80 snapshot handlers, and font/ROM dumps shared in the community (respecting original copyrights where applicable).

### Licensing

**ZXSPECCJS is licensed under the GNU General Public License version 3 (GPL-3.0)** — see the [`COPYING` file](COPYING) in this repository for the full license text.

This project incorporates and/or derives from gasman/jsspeccy3, which is also licensed under GPL-3.0. As required by the GPL, the source code remains open, modifications are clearly indicated (where applicable), and the license is preserved throughout. All original copyrights and credits for ROMs, tapes, and other assets are retained by their respective owners and are used here strictly in the spirit of preservation, education, and fair use.

If you distribute or modify ZXSPECCJS, please adhere to the terms of the GPL-3.0.

Long live the ZX Spectrum! 🕹️🇬🇧
