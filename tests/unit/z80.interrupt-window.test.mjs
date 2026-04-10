import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Ensure the "32‑T‑state interrupt pulse" window actually clears the
// `intRequested` flag if it has not been accepted.  This mimics the ULA
// /INT pulse duration and prevents a stale request from firing later in the
// frame (Jetpac etc. were hitting the bug before this patch).

test('intRequested is cleared once tstates passes _intWindowEnd', () => {
  const mem = new Memory({ contention: false });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();

  cpu.intRequested = true;
  cpu.IFF1 = false; // ensure interrupt is not accepted
  cpu._intWindowEnd = cpu.tstates + 32; // 32‑cycle window

  // run a few instructions; the tstate delta doesn't matter so long as we
  // cross the 32‑cycle threshold
  cpu.runFor(40);
  expect(cpu.intRequested).toBe(false);
  expect(cpu._intWindowEnd).toBeUndefined();
});

// sanity check: if _intWindowEnd is undefined we don't auto-clear
// (this is mainly a regression guard for the test maintainers)
test('intRequested persists when _intWindowEnd is not set', () => {
  const mem = new Memory({ contention: false });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();

  cpu.intRequested = true;
  cpu.IFF1 = false;
  cpu._intWindowEnd = undefined;

  cpu.runFor(100);
  expect(cpu.intRequested).toBe(true);
});
