/* eslint-env node, browser */
import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';

// Regression test: ensure the Z80 helper forwards the *actual* port value to
// its contention logic. Previously `_applyPortContention()` was invoked with
// no argument from IN/OUT handlers which caused incorrect highContended checks.

test('Z80: _applyPortContention uses the provided port for IN A,(n)', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.attachCPU(cpu);
  cpu.reset();
  cpu.frameStartTstates = 0;
  mem.contentionEnabled = true;

  // Simulate: only addresses whose high byte == 0x4000 are contended
  mem._isContended = (addr) => (addr === 0x4000);

  // Place IN A,(n) at 0x4000 with immediate low-byte 0xFE so port => 0x40FE
  cpu.PC = 0x4000;
  mem.write(0x4000, 0xDB); // IN A,(n)
  mem.write(0x4001, 0xFE); // low byte -> portLo

  cpu.A = 0x40; // high byte for port

  // Move CPU into the contended region of the frame so contention table yields >0
  cpu.frameStartTstates = 0;
  cpu.tstates = mem._firstContended + 2; // inside first contended area

  // Ensure no contention logged before instruction (sanity)
  expect(mem._lastContention || 0).toBe(0);

  // Diagnostic sanity-check: ensure we are in the contended region before stepping
  expect(mem._contentionTable && mem._contentionTable[cpu.tstates - cpu.frameStartTstates] > 0).toBeTruthy();
  cpu.step(); // execute IN A,(n)

  // Because port high byte is 0x40 -> mem._isContended(0x4000) should be true
  // and _applyPortContention should have triggered memory contention logging
  const hasContentionLog = Array.isArray(mem._contentionLog) && mem._contentionLog.some(c => c && c.addr === 0x4000);
  expect(hasContentionLog, 'expected memory._contentionLog to include an entry for addr 0x4000').toBeTruthy();
});
