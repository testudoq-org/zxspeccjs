import { test, expect } from 'vitest';
import { Z80 } from '../src/z80.mjs';
import { Memory } from '../src/memory.mjs';

test('ED prefix fallback does not return undefined', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  // Place ED 0x47 at 0x0200 (ED 47 is LD I,A but not implemented fully)
  mem.write(0x0200, 0xED);
  mem.write(0x0201, 0x47);
  cpu.PC = 0x0200;
  cpu._debugVerbose = true;
  const res = cpu.step();
  expect(res).toBeGreaterThan(0);
});
