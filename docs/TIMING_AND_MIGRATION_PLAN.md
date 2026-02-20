# Timing accuracy, microtrace-parity and AssemblyScript migration plan

Purpose
- Capture remaining cycle-accuracy gaps vs. gasman/jsspeccy3, add deterministic tests, provide targeted JS fixes, and outline a safe migration path for CPU/timing logic to AssemblyScript (WASM).

Summary (short)
- Add narrow, deterministic Vitest cases that expose R-register / M1 / HALT / I/O contention edge-cases and Jetpac keyboard/rocket timing.
- Add microtrace extraction tooling to compare instruction-level windows against an external reference (jsspeccy3). Use those diffs to find the first-instruction divergence.
- Keep immediate fixes small and well-tested; move heavy, cycle-critical code (Z80 core + contention tables) to AssemblyScript in a separate incremental migration.

High-level findings (from repo review)
- R register increments and HALT M1 behaviour are implemented and covered by unit tests, but microtrace parity tooling is missing which makes root-cause localization manual.
- Memory contention model and ULA contention table are present and well instrumented; some subtle timing differences remain in corner cases (prefixed opcodes, IN/OUT path timing, snapshot-restore alignment).
- Snapshot/tape parsing for `.z80` is implemented; SNA/SZX/TZX support is limited or missing.

Immediate changes added in this branch
- Deterministic microtrace window extractor script + Vitest harness so you can generate and compare narrow instruction windows against a reference trace.
- New unit tests that document the gaps we want to lock down next (instruction‑timing edgecases + Jetpac microtrace window capture). These are test-first artifacts for the follow-up fixes.
- Documentation with a prioritized action list and an AssemblyScript migration plan + small sample AS code for opcode decode / contention handler.

Targeted JS fixes (proposals)
- Ensure every opcode fetch and every additional opcode-read (CB/ED/DD/FD/FD-CB etc.) performs the same R increment and M1 timing as jsspeccy3.
  - Test: capture microtrace around a multi-prefix instruction and assert R and tstate deltas match reference.
- Verify IN/OUT on `0xFE` correctly triggers ULA contention when executed in the contended window.
  - Test: execute IN (0xFE) at known contended tstate and assert mem.lastContention() > 0 and tstates delta.
- Snapshot-restore: ensure IFF1/IFF2, IM, I, R, frameStartTstates and tstates are restored exactly; add unit tests for SZX/Z80/SNA round-trip.

AssemblyScript (WASM) migration plan — short
1. Isolate CPU core & contention logic behind a narrow JS interface: step(), reset(), read/write state, and a microtrace hook. Keep JS as orchestration/UI layer. (2–3 days)  
2. Port the Z80 core (opcode dispatcher + timing) to AssemblyScript in small modules: decoder (mapping opcodes->operation id), execution engine (apply operation), contention helper. Start with selected opcodes to validate tooling. (1–2 weeks incremental)  
3. Compile with AssemblyScript toolchain (asconfig.json). Expose a Web Worker bridge for CPU run loop to keep UI responsive. (3–4 days)  
4. Regression: run full Vitest + Playwright smoke E2E to verify parity. Use browser profiler & wasm-bindgen metrics to benchmark. (2–3 days)  
5. Optimize inner loops in AssemblyScript (avoid boxing; use TypedArray views and plain numbers), expand opcode coverage, then replace JS Z80 core. (ongoing)

AssemblyScript sample (included)
- `examples/wasm/z80_decoder.as` — small opcode-decode switch (sample).  
- `examples/wasm/contention_handler.as` — contention-table helper (sample).

Benchmarks & rollout
- Add browser/profile benchmark harness to compare JS core vs WASM core on heavy frames (e.g., Manic Miner, Jetpac). If WASM shows clear throughput + lower jitter, continue migration.
- Roll out by feature flag and keep JS fallback for platforms where WASM isn't available.

Tests to add (priority + location)
1. Vitest: instruction-level microtrace parity (tests/unit/microtrace-parity.*) — high priority.  
2. Vitest: IN/OUT port 0xFE contention window tests (tests/unit/z80.port-contention.*) — medium.  
3. Vitest: snapshot format coverage (SZX, SNA, zipped .z80) — medium.  
4. Playwright E2E: Jetpac 128K keyboard poll + rocket overlay (tests/e2e/jetpac-*.spec.mjs) — high priority.  

Next immediate steps (short-term roadmap)
1. Run microtrace window between local and jsspeccy3; identify first opcode/time/flag mismatch.  
2. Implement the minimal JS fix for the first divergence and add a unit test that fails before the fix and passes after.  
3. Repeat until the first N frames match reference parity.  
4. If performance bottleneck persists, start AssemblyScript migration for the CPU inner loop only.

Priority backlog (ordered)
1. Microtrace diff tooling + tests (this PR) ✅
2. Fix first-instruction divergence found by microtrace (TDD) — immediate bugfix ✅ (follow-up PR if required)
3. Add Playwright scenarios for Jetpac and a smoke-set for CI
4. Snapshot format coverage (SNA/SZX, zipped snapshots)
5. AssemblyScript migration (prototype + benchmark)

Verification checklist (before merge)
- [ ] Vitest: new unit tests pass locally.  
- [ ] Playwright: smoke tests for Jetpac run green locally.  
- [ ] Codacy/Trivy scan OK for any new dependencies.  

Mandatory local verification (run locally before committing)
> npm run test:unit && npx playwright test tests/e2e --grep @smoke && codacy-analysis-cli analyze --upload

References
- gasman/jsspeccy3 (reference timing & microtrace behaviours)
- Z80 timing references, ULA contention patterns

Contact
- If you want, I can: reopen the investigation, generate the microtrace diff for a selected frame, implement the first minimal fix, and open a PR with tests + fix.

