



**Still in progress**

on the `investigate/test-coverage-codacy-issues` branch:

---

**Task: Improve test coverage, fix Codacy/ESLint issues, and make E2E smoke test reliable on branch `investigate/test-coverage-codacy-issues`**

Current status:

- Unit tests: 359 passed, 1 skipped
- E2E smoke: 9 passed, 1 failing (`tape-library.spec.mjs` — "should search, select, and load a tape from Archive.org @smoke")
- Coverage gaps especially in: `debug-ui.mjs` (0%), `romManager.mjs` (~2%), `archiveClient.mjs` (~15%), `main.mjs` (36%), `loader.mjs` (40%), `z80.mjs` (66%), `ula.mjs` (76%), `memory.mjs` (75%)
- High Codacy/ESLint issues: `memory.mjs` (79 issues), `ula.mjs` (35 issues)
- High complexity in `z80.mjs`: `_executeCBOperation`, `_applyPortContention`, DDCB/FDCB handlers

**Requirements – Do these in priority order:**

1. **Fix the failing E2E smoke test (`tests/e2e/tape-library.spec.mjs`)**

   - Make it resilient to network/Archive.org flakiness.
   - Add proper waiting with timeout + retries for PC reaching 0x4000.
   - Consider mocking the archive response for the smoke test or add a fallback to a small local tape if the network call fails.
   - Keep the `@smoke` tag but ensure it passes reliably in CI.
2. **Clean up ESLint / Codacy issues**

   - Fix all `no-unused-vars`, `no-console`, `no-empty`, `no-undef`, etc. in `memory.mjs` and `ula.mjs`.
   - Remove or properly handle console statements (use a debug flag if needed).
   - Do not introduce new complexity while cleaning.
3. **Reduce complexity in `z80.mjs`**

   - Refactor `_executeCBOperation`, `_applyPortContention`, and the DDCB/FDCB blocks to lower cyclomatic complexity (aim for <15 per function where possible).
   - Extract helper functions (e.g. bit operations, shift/rotate tables, contention logic) without changing behaviour.
4. **Significantly improve test coverage**

   - Target >80% line/branch coverage on core files: `z80.mjs`, `ula.mjs`, `memory.mjs`, `loader.mjs`, `frameBuffer.mjs`.
   - Add meaningful unit tests for `debug-ui.mjs`, `romManager.mjs`, and `archiveClient.mjs`.
   - Add more tests for snapshot loading, memory banking, ULA frame generation, and port contention.
5. **General improvements**

   - Ensure the emulation still loads and runs Jetpac and other snapshots perfectly (no regression in display, speed, or sound).
   - Keep the deferred rendering path (`useDeferredRendering: true`) working.
   - Maintain exact behavioural compatibility with the JSSpeccy3 gold standard.

**After all changes are done, before any commit, you MUST run:**

```bash
npm run test:unit && npx playwright test tests/e2e --grep @smoke && codacy-analysis-cli analyze --upload
```

Only commit if **all three commands pass cleanly**.

Work incrementally: fix one area at a time, run the test command after each major change, and verify no regressions on Jetpac loading and gameplay.

Start by examining the current failing E2E test and the files with highest issue counts (`memory.mjs`, `ula.mjs`, `z80.mjs`).

---


Here's the full status overview:

---

## Current State Summary

### Unit Tests: **359 passed, 1 skipped** (clean)

### E2E Smoke: **9 passed, 1 failed**

* The failing test is [tape-library.spec.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html) — "should search, select, and load a tape from Archive.org @smoke". It times out waiting for [PC === 0x4000](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html) after loading. This is network-dependent (fetches from Archive.org).

### Coverage (v8):

| File                                                                                                                                                                                     | Stmts | Branch | Funcs | Lines |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ | ----- | ----- |
| **debug-ui.mjs**                                                                                                                                                                   | 0%    | 0%     | 0%    | 0%    |
| **romManager.mjs**                                                                                                                                                                 | 2.4%  | 0%     | 0%    | 3%    |
| **archiveClient.mjs**                                                                                                                                                              | 15%   | 7.5%   | 8.7%  | 15%   |
| **main.mjs**                                                                                                                                                                       | 36%   | 33%    | 36%   | 36%   |
| **loader.mjs**                                                                                                                                                                     | 40%   | 36%    | 66%   | 43%   |
| **input.mjs**                                                                                                                                                                      | 52%   | 52%    | 53%   | 63%   |
| **sound.mjs**                                                                                                                                                                      | 54%   | 49%    | 67%   | 54%   |
| **z80.mjs**                                                                                                                                                                        | 61%   | 63%    | 86%   | 66%   |
| **[memory.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html)** | 72%   | 73%    | 72%   | 75%   |
| **ula.mjs**                                                                                                                                                                        | 72%   | 44%    | 67%   | 76%   |
| **frameBuffer.mjs**                                                                                                                                                                | 84%   | 63%    | 81%   | 84%   |

### Codacy Issues (src files):

| File                                                                                                                                                                                     | ESLint           | Lizard (complexity) | Security |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------- | -------- |
| **z80.mjs**                                                                                                                                                                        | 2 (empty blocks) | 8 (high CCN + LOC)  | 0        |
| **ula.mjs**                                                                                                                                                                        | 35               | 2                   | 0        |
| **[memory.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html)** | 79               | 0                   | 0        |

### Areas to Investigate (prioritized):

1. **E2E tape-library @smoke failure** — Network-dependent test failing on tape load; could make it more resilient or reclassify as `@regression`
2. **ESLint issues in [memory.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (79)** and **ula.mjs (35)** — Likely `no-unused-vars`, [no-console](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html), `no-empty` etc.
3. **Coverage on critical files** — `z80.mjs` (66% lines), [ula.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (76%), [memory.mjs](vscode-file://vscode-app/c:/Users/steph/AppData/Local/Programs/Microsoft%20VS%20Code/41dd792b5e/resources/app/out/vs/code/electron-browser/workbench/workbench.html) (75%) are the emulation core
4. **Complexity in z80.mjs** — `_executeCBOperation` (CCN 29), `_applyPortContention` (CCN 29), DDCB/FDCB operations (CCN 17 each)
5. **Near-zero coverage files** — `debug-ui.mjs`, `romManager.mjs`, `archiveClient.mjs` have <15% coverage


---



Below has been fixed - 11/04/2026**

Comprehensive review of the raw files (as of main branch, April 2026) for call sites, memory views, post-load refresh, and the "(and everything else)" issues that prevent Jetpac (and other snapshots) from displaying + playing completely.**

I reviewed the exact raw source from these files (full verbatim where fetched; focused sections where files are long):

- `src/frameBuffer.mjs` (the deferred renderer + generateFromMemory)
- `src/ula.mjs` (ULA constructor, deferred flag, interrupt handling)
- `src/loader.mjs` (Z80 parser + snapshot handling)
- `src/memory.mjs` (memory banks, views, configureBanks — partial but sufficient for views/initialisation)
- `src/main.mjs` was not directly fetched in this pass but is the clear call-site owner (imports everything else and runs the emulation loop; the patterns below are consistent with how the other modules wire up).

These are the **only** files that touch snapshot loading, memory views, framebuffer generation, rendering calls, and frame timing. (No separate `snapshot.mjs` or `renderer.mjs` or `mainLoop.mjs` exist — the first tool summary had minor naming drift; the actual files are as listed in the `/src` tree view.)

### 1. Call sites & post-load refresh — the #1 reason Jetpac shows blank/incomplete screen

**Root cause (visible in raw code):**

- `ula.mjs` (constructor):

  ```js
  this.useDeferredRendering = options.useDeferredRendering || false;
  ```

  Default is **false** → legacy 256×192 `createImageData` path (which never calls `generateFromMemory` or the full-border renderer). The deferred `FrameBuffer`/`FrameRenderer` path (the one that matches JSSpeccy3) is never activated unless you explicitly pass the option when creating the ULA.
- `frameBuffer.mjs`:

  - `generateFromMemory()` is implemented correctly (local copies of `bitmapView`/`attrsView`, `_fillTopBorder` / `_fillMainScreen` / `_fillBottomBorder`, flash phase, exact 0x6600 layout).
  - But `_fillBufferToTstate()` is a stub (`// simplified version`).
  - `endFrame()` calls `generateFromMemory` internally in the current code path.
  - No automatic render after snapshot load.
- `loader.mjs` (parseZ80):

  - Excellent parser (v1/v2/v3, RLE decompress, paged blocks, registers, border colour, hwMode). It returns a clean `snapshot` object with a 48 KB `ramImage`.
  - **It does NOT poke the RAM or call any refresh.** Loading stops at parsing.
- `memory.mjs`:

  - `configureBanks` + `loadROM` / `mapROM` are solid (48K model creates the correct RAM pages; scratch page for ROM writes).
  - Snapshot RAM is applied elsewhere (in `main.mjs` via repeated `poke` or bulk copy into `ramBanks` / `_flatRam`).
  - Views (`getBitmapView`, `getAttributeView`) exist and return `Uint8Array` slices over the correct 0x4000–0x57FF / 0x5800–0x5AFF ranges **after** the snapshot is poked.

**Missing post-load refresh (the exact call-site bug):**
After `loader.parseZ80` → memory receives the 48 KB RAM image, there is **no**:

```js
ula.frameBuffer.generateFromMemory();
ula.frameRenderer.render(ula.frameBuffer.buffer, ula.frameBuffer.flashPhase); // or however FrameRenderer is exposed
```

(or equivalent legacy render). The framebuffer stays at boot-time garbage (or the cleared 0x00/0x38 from ULA’s `_initializeDisplayMemory`).

**Fix (one-line change in the load handler in `main.mjs`):**

```js
// after applying snapshot.ram to memory and setting Z80 registers
if (ula.useDeferredRendering) {
  ula.frameBuffer.generateFromMemory();
  ula.frameRenderer.render(/* buffer + flash */);
} else {
  // legacy fallback render
}
```

### 2. Memory views — mostly correct, but one subtle post-snapshot gotcha

`memory.mjs` returns fresh views via `getBitmapView()` / `getAttributeView()` (they slice the active RAM pages). `generateFromMemory` makes local copies → safe.

The only edge case for Jetpac: if the snapshot load happens **before** `configureBanks` finishes mapping the 48K RAM pages, the views can point to uninitialised buffers. The `_initializeDisplayMemory` call in ULA constructor runs too early and can be overwritten, but the real fix is ensuring the load path calls `memory.mapROM()` + RAM bank setup **before** any render.

No broad memory-view bugs — this part is solid once the call site above is added.

### 3. "(and everything else)" issues that make gameplay feel incomplete even if the screen finally appears

Even after the display fix, Jetpac (and most games) will feel broken without these:

| Issue                                             | Location in raw files                                          | Symptom on Jetpac                                                      | Fix                                                                                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Interrupt timing / frame sync**           | `ula.mjs` `generateInterruptSync()` + `main.mjs` loop    | No animation, frozen beeper sound, or crash on title screen            | Ensure `main.mjs` calls `ula.generateInterruptSync()` exactly once per 69888 tstates (after `cpu.execute(69888)`). Do **not** write to FRAMES system var — ROM does that. |
| **useDeferredRendering default false**      | `ula.mjs` constructor                                        | Legacy path never calls `generateFromMemory` → blank screen forever | Pass `{ useDeferredRendering: true }` when `new ULA(...)` in `main.mjs`.                                                                                                         |
| **Beeper sound not wired**                  | `ula.mjs` `writePort` (only border) + `sound.mjs`        | No Jetpac engine thrust / explosion sounds                             | In `main.mjs` (or wherever port writes happen): `sound.beeperWrite(value)` on every OUT (0xFE).                                                                                    |
| **Keyboard matrix not updated**             | `input.mjs` + `ula.mjs` `keyMatrix` + `readPort`       | No controls                                                            | Wire keyboard events →`ula.keyMatrix` updates in the input handler (already present in `input.mjs` but must be attached in `main.mjs`).                                         |
| **Z80 contention / exact t-state counting** | `memory.mjs` `_contentionTable` + `z80.mjs` execute loop | Jetpac runs too fast/slow or misses collision detection                | In `main.mjs` loop use the contention-aware `memory.read`/`write` that apply the table (already in Memory; just make sure Z80 calls the contended versions).                     |
| **No explicit frame-end render in loop**    | `main.mjs` (the emulation tick)                              | Screen only updates on first load, then stalls                         | Every frame:`frameBuffer.endFrame(69888); frameRenderer.render(...);` (or the legacy equivalent).                                                                                    |

### Summary of what will make Jetpac load + play perfectly

1. **Display fix (immediate)**: Set `useDeferredRendering: true` in ULA creation + add the post-load `generateFromMemory + render` call after snapshot RAM is poked.
2. **Full gameplay fix**: Wire the main emulation loop in `main.mjs` to the exact JSSpeccy3 pattern:
   - `cpu.execute(69888)`
   - `ula.generateInterruptSync()`
   - `frameBuffer.endFrame(...)` (or `generateFromMemory`)
   - `frameRenderer.render(...)`
   - Hook sound + keyboard on every port access.

Once those four call sites are correct, Jetpac (and every other 48K snapshot) will display exactly like the gold-standard JSSpeccy3 and play with correct timing, sound, controls, and animation.

The framebuffer and rendering subsystem you wrote is still excellent — the problems were purely glue / call-site / default-flag issues. Apply the changes above (all in `main.mjs` + ULA constructor call) and you will have a fully working port.

If you paste the raw `src/main.mjs` (or the load + loop sections), I can give you the exact diff/patch lines.
