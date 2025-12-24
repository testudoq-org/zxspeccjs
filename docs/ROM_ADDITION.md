# ROM Addition Guide

This guide explains how to add ROM files to the emulator for users and developers. Follow the steps below to add new ROMs, convert binaries to ESM modules, register them with the app, and test them.

Refer to the top-level README: [`README.md`](README.md:1) and developer build notes: [`docs/BUILD_AND_TESTING.md`](docs/BUILD_AND_TESTING.md:1).

## Supported ROM categories

- `zx80-81` — ZX80 / ZX81
- `spectrum16-48` — 16K / 48K Spectrum
- `spectrum128-plus2` — 128K and Plus2
- `spectrum-plus3` — +3 / disk-based images

## 1) High-level overview

- User-facing flow: place ROM binary in `roms/` → convert to ESM module in `src/roms/` → register in [`src/romManager.mjs`](src/romManager.mjs:1) → rebuild or run dev server → select ROM in the UI.
- Developer-facing flow: convert, create a module with metadata, ensure memory mapper supports the ROM's banking model (see [`src/memory.mjs`](src/memory.mjs:1)).

## 2) Legal considerations (required)

- Do NOT distribute commercial ROMs without a license. Users must supply ROMs they legally own.
- Only include ROM binaries in the repository if you hold the rights or when they are public-domain/homebrew.
- For redistribution, obtain explicit permission or use open-source/homebrew ROMs.
- Recommended sources:
  - Official re-releases where the ROM is freely licensed
  - Homebrew and public-domain ROM repositories

Add a short disclaimer in user-facing docs and the app UI: the project does not provide commercial ROMs.

## 3) File naming conventions

- ROM binary files (in `roms/`): use lower-case, hyphen-separated names, include model and size, e.g.:
  - `roms/spectrum48k.rom`
  - `roms/spec128k-plus2.rom`
- Generated ESM modules (in `src/roms/`): same basename with `.js`, e.g. `src/roms/spectrum48k.js`.
- Module `id` should be unique and reflect basename, e.g. `spectrum48k`.

## 4) Converting a ROM binary to a JS module

Recommended: use a small Node converter to generate an ESM file that exports metadata and a Uint8Array of bytes.

Example converter usage (create `tools/rom-to-js.js` or run a similar script):

```javascript
// language: javascript
// Example usage: node tools/rom-to-js.js roms/spectrum48k.rom src/roms/spectrum48k.js
import fs from 'fs';
import path from 'path';
const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) throw new Error('Usage: node rom-to-js.js <in.rom> <out.js>');
const bytes = fs.readFileSync(inPath);
const arr = Array.from(bytes);
const id = path.basename(outPath, '.js');
const content = `export default {\n  id: '${id}',\n  name: '${id}',\n  category: 'spectrum16-48',\n  size: ${arr.length},\n  bytes: new Uint8Array([${arr.join(',')}])\n};\n`;
fs.writeFileSync(outPath, content);
```

Notes:
- Set `category` to the appropriate supported category.
- For very large ROMs, consider serving the raw `.rom` file as a static asset and fetching at runtime instead of bundling bytes.

## 5) Example ESM ROM module shape

```javascript
// language: javascript
export default {
  id: 'spectrum48k',
  name: 'Spectrum 48K (example)',
  category: 'spectrum16-48',
  size: 49152,
  bytes: new Uint8Array([ /* ... */ ])
};
```

Fields explained:
- `id` — unique string identifier used by the app
- `name` — display name for the UI
- `category` — determines which models/mapping to use
- `size` — integer byte length
- `bytes` — Uint8Array with raw ROM contents

## 6) Register the module so the app discovers it

Preferred (static) approach: add an import in [`src/romManager.mjs`](src/romManager.mjs:1) and push the module into the registry that builds the dropdown. Example snippet:

```javascript
// language: javascript
import spectrum48k from './roms/spectrum48k.js';
const ROMS = [spectrum48k /* , ... */];
export default ROMS;
```

If using a build-time generated index, ensure the index statically imports modules so Rollup includes them.

## 7) Memory & banking considerations (developer notes)

- 16/48K ROMs: typically map into low memory (0x0000–0xBFFF) and require simple mapping.
- 128K/+2/+3 ROMs: typically include multiple banks and a paging mechanism. Ensure [`src/memory.mjs`](src/memory.mjs:1) supports initial bank selection and port-based bank switching.
- When adding a banked ROM, include metadata indicating bank size or bank count if needed, for example add `banks: N` and `bankSize: X` fields in the module.

## 8) Build and run

1. Static import + dev server:

```bash
npm install
npm run dev
```

2. Production build:

```bash
npm run build
```

Open the app in the browser and use the ROM selector. See [`index.html`](index.html:1).

## 9) Testing new ROMs

A) Unit tests (example using Vitest):

```javascript
// language: javascript
import rom from '../src/roms/spectrum48k.js';
import { describe, it, expect } from 'vitest';

describe('spectrum48k rom', () => {
  it('has correct size', () => {
    expect(rom.size).toBe(49152);
    expect(rom.bytes.length).toBe(rom.size);
  });
});
```

B) Integration (manual):
- Start the app (`npm run dev`).
- Select the ROM in the emulator UI dropdown and verify boot behaviour.
- Check browser console for errors coming from [`src/loader.mjs`](src/loader.mjs:1), [`src/romManager.mjs`](src/romManager.mjs:1), and [`src/memory.mjs`](src/memory.mjs:1).

C) Automated E2E (Playwright suggestion):
- Write a Playwright test that navigates to the app, chooses the ROM from the dropdown, and takes a screenshot of the canvas for snapshot comparison.

D) Memory and bank-switch tests:
- For banked ROMs, write unit tests that exercise port writes which trigger bank switching and assert reads return expected bytes.

## 10) Troubleshooting

Symptom → Quick checks

- ROM not in dropdown
  - Confirm `src/roms/<name>.js` exists and is imported from [`src/romManager.mjs`](src/romManager.mjs:1).
  - Rebuild dev server after adding modules.

- ROM loads but emulator freezes/crashes
  - Verify `size` matches expected bytes.
  - Check that `category` matches the chosen model.
  - Enable debug logs in `src/memory.mjs` and inspect console.

- Bundle size too large
  - Use runtime fetch of `.rom` from `/roms/` instead of embedding full byte arrays.

## 11) Examples and screenshots

- The UI exposes the ROM dropdown; see [`index.html`](index.html:1) and [`src/main.mjs`](src/main.mjs:1) for where the UI is mounted.
- Take screenshots with DevTools or use Playwright to capture test snapshots.

## 12) Extended developer guidance

- Add `banks` and `bankSize` to the module when necessary for automatic wiring in [`src/memory.mjs`](src/memory.mjs:1).
- If you add a new `category`, update the category enum and mapping logic in [`src/romManager.mjs`](src/romManager.mjs:1) and in the memory mapper.
- Keep module metadata consistent and add a sample test in `test/` for CI.

----

Files referenced in this guide:

- [`roms/`](roms/:1)
- [`src/roms/`](src/roms/:1)
- [`src/romManager.mjs`](src/romManager.mjs:1)
- [`src/memory.mjs`](src/memory.mjs:1)
- [`src/loader.mjs`](src/loader.mjs:1)
- [`index.html`](index.html:1)

Legal notice: this project does not distribute commercial ROMs. Users must ensure they have the legal right to use any ROM they load into the emulator.
