import { test, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';

test('mem.write records pc and R for screen-area writes', () => {
  const mem = new Memory({ model: '48k' });
  // attach a fake CPU
  const fakeCpu = { tstates: 12345, PC: 0xC0DE, R: 0x5A };
  mem.attachCPU(fakeCpu);

  // perform a write in the screen region
  mem.write(0x4000, 0x77);

  expect(mem._memWrites.length).toBeGreaterThan(0);
  const last = mem._memWrites[mem._memWrites.length - 1];
  expect(last.addr).toBe(0x4000);
  expect(last.value).toBe(0x77);
  expect(last.pc).toBe(0xC0DE);
  expect(typeof last.R).toBe('number');
  expect((last.R & 0xFF)).toBe(0x5A);
});

test('writes to rocket area (0x4800..0x49FF) are captured in mem._memWrites with PC/R', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = { tstates: 9999, PC: 0x1111, R: 0xAA };
  mem.attachCPU(cpu);

  // write several bytes across the rocket tile area
  const addrs = [0x4800, 0x4801, 0x48FF];
  for (const a of addrs) mem.write(a, (a & 0xFF));

  // extract recent writes that match our addresses
  const hits = mem._memWrites.filter(w => addrs.includes(w.addr));
  expect(hits.length).toBe(addrs.length);
  for (let i = 0; i < hits.length; i++) {
    expect(hits[i].pc).toBe(0x1111);
    expect((hits[i].R & 0xFF)).toBe(0xAA);
  }
});
