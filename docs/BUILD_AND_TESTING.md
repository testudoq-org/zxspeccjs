# Build and Testing

This document supplements the top-level [`README.md`](README.md:1) with developer-facing instructions for building the project and adding/testing ROM modules.

Contents

- Adding new ROM modules
- ROM conversion process (binary -> ESM)
- Build process and bundling ROMs
- Testing procedures for ROM functionality
- Troubleshooting
- Tips for maintainers

## Adding new ROM modules

Goal: make a ROM available to the emulator as an ESM module with metadata so the UI can list and load it.

Steps:

1. Place the ROM binary in the repository's `roms/` directory (example: `roms/myrom.rom`). See [`roms/`](roms/:1).
2. Convert the binary into a JS module (see "ROM conversion process"). The result should be saved in `src/roms/` (example: `src/roms/myrom.js`). See [`src/roms/`](src/roms/:1).
3. The generated module must export a default object with at least these fields:
   - `id` (string, unique)
   - `name` (string, human readable)
   - `category` (one of: `zx80-81`, `spectrum16-48`, `spectrum128-plus2`, `spectrum-plus3`)
   - `size` (number, in bytes)
   - `bytes` (Uint8Array)

   Example module shape:

```javascript
// language: javascript
export default {
  id: 'myrom-48k',
  name: 'My ROM (48K)',
  category: 'spectrum16-48',
  size: 49152,
  bytes: new Uint8Array([ /* ... */ ])
};
```

4. Register the module so the bundler includes it and the app can discover it. There are two recommended approaches:
   - Static registration: add an import and push to the registry in [`src/romManager.mjs`](src/romManager.mjs:1). Static imports are preferred for bundlers.
   - Dynamic discovery: if you maintain a build-time generated index, ensure the index file imports the module and re-exports it.

5. Rebuild and run the dev server (`npm run dev`) or the production build (`npm run build`) and confirm the ROM appears in the emulator ROM dropdown.

## ROM conversion process (recommended)

You should convert ROM binaries into ESM modules so Rollup/ESM bundlers can include them in the final bundle. A simple Node script can perform this transformation.

Example converter script (tools/rom-to-js.js):

```javascript
// language: javascript
// Usage: node tools/rom-to-js.js path/to/input.rom path/to/output.js
import fs from 'fs';
const [,, inputPath, outputPath] = process.argv;
const bytes = fs.readFileSync(inputPath);
const arr = Array.from(bytes);
const out = `export default {\n  id: '${path.basename(outputPath, '.js')}',\n  name: '${path.basename(outputPath, '.js')}',\n  category: 'spectrum16-48',\n  size: ${arr.length},\n  bytes: new Uint8Array([${arr.join(',')}])\n};\n`;
fs.writeFileSync(outputPath, out);
```

Important notes:
- Keep generated files source-controlled if you expect reproducible builds or want to avoid generating at runtime.
- For large ROMs, consider generating compressed exports or loading them as binary assets (adjust Rollup config accordingly).

## Build process and bundling ROMs

- The project uses Rollup (`rollup.config.js`). Ensure your ROM JS modules in `src/roms/` are statically imported somewhere reachable by the bundle graph (e.g., from [`src/romManager.mjs`](src/romManager.mjs:1)).
- If you prefer dynamic loading (e.g., load ROMs at runtime via fetch), maintain a manifest that the app can fetch from `/roms/` and implement runtime conversion to Uint8Array in the loader.

Commands:

- Dev server: `npm run dev`
- Production build: `npm run build`

## Testing ROM functionality

Testing should cover both metadata correctness and runtime behaviour.

1. Unit tests

- Add tests under `test/` validating the generated module shape and size. Example:

```javascript
// language: javascript
import rom from '../src/roms/myrom.js';
import { describe, it, expect } from 'vitest';

describe('myrom', () => {
  it('exports correct metadata', () => {
    expect(rom.id).toBeDefined();
    expect(rom.bytes.length).toBe(rom.size);
  });
});
```

2. Integration tests (manual)

- Start the app (`npm run dev`) and use the ROM selector to choose the new ROM.
- Verify the emulator boots into the expected ROM state (title screen, expected behavior).
- Open browser devtools and inspect console logs for errors from [`loader.mjs`](src/loader.mjs:1), [`romManager.mjs`](src/romManager.mjs:1) and [`memory.mjs`](src/memory.mjs:1).

3. Automated E2E tests

- Use Playwright to launch the app and take snapshot comparisons for known ROM boot screens. See existing test patterns in `test/`.
- Add a Playwright test that selects the ROM in the UI and waits for a canvas or DOM change that indicates a successful boot.

4. Memory and banking tests

- For banked ROMs (128K/+2/+3), add unit tests ensuring the memory mapper correctly initializes banks and switches pages. Validate reads from ROM areas match expected vectors.

## Troubleshooting

Common issues and fixes:

- ROM not visible in dropdown
  - Ensure the module is in `src/roms/` and imported by [`src/romManager.mjs`](src/romManager.mjs:1).
  - If using dynamic manifest, ensure the manifest is served and has correct JSON entries.

- Bundle size increases significantly
  - Large ROMs can bloat bundles. Consider serving ROM binaries as static assets and fetching them at runtime instead of bundling the full byte arrays.

- ROM loads but emulator crashes
  - Confirm the ROM size matches expectations for the chosen category (e.g., 48K ROM for `spectrum16-48`).
  - Enable debug logging in [`memory.mjs`](src/memory.mjs:1) and inspect stack traces.

## Tips for maintainers

- Keep one sample ROM per category in `src/roms/` for CI checks.
- Prefer static imports for stable build graphs; use manifest-driven dynamic loading only when supporting user-supplied ROMs at runtime.
- Document any custom conversion flags or special handling for disk-based +3 ROMs.

## References

- ROM addition and legal guidance: [`docs/ROM_ADDITION.md`](docs/ROM_ADDITION.md:1)
- ROM manager: [`src/romManager.mjs`](src/romManager.mjs:1)
- Loader: [`src/loader.mjs`](src/loader.mjs:1)
- Memory mapper: [`src/memory.mjs`](src/memory.mjs:1)
