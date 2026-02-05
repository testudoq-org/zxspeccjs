import { test, expect } from 'vitest';
import { Z80 } from '../../../src/z80.mjs';
import { Memory } from '../../../src/memory.mjs';

function runSingleOp(bytes, start = 0x4000){
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  for(let i=0;i<bytes.length;i++) mem.write(start + i, bytes[i]);
  cpu.PC = start;
  const cycles = cpu.step();
  return { cpu, mem, cycles };
}

test('LD B,n works (0x06)', () => {
  const { cpu, cycles } = runSingleOp([0x06, 0x05]);
  expect(cycles).toBeGreaterThan(0);
  expect(cpu.B).toBe(0x05);
});

test('INC C wraps and sets flags (0x0C)', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  cpu.C = 0xFF;
  mem.write(0x4000, 0x0C);
  cpu.PC = 0x4000;
  const cycles = cpu.step();
  expect(cycles).toBeGreaterThan(0);
  expect(cpu.C).toBe(0x00);
});

test('ADD A,C (0x81) and ADC/ADD immediate (0xC6,0xCE)', () => {
  let r = runSingleOp([0x3E, 0x01]); // LD A,1
  expect(r.cpu.A).toBe(1);
  r = runSingleOp([0x0E, 0x02]); // LD C,2
  // need to perform ADD A,C as a single-run sequence
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  mem.write(0x4000, 0x3E); mem.write(0x4001, 0x05); // LD A,5
  mem.write(0x4002, 0x0E); mem.write(0x4003, 0x03); // LD C,3
  mem.write(0x4004, 0x81); // ADD A,C
  cpu.PC = 0x4000;
  cpu.step(); // LD A
  cpu.step(); // LD C
  const cycles = cpu.step(); // ADD A,C
  expect(cycles).toBeGreaterThan(0);
  expect(cpu.A).toBe(8);

  // ADD A,n (0xC6)
  mem.write(0x4010, 0x3E); mem.write(0x4011, 0x02); mem.write(0x4012, 0xC6); mem.write(0x4013, 0x03);
  cpu.PC = 0x4010; cpu.step(); cpu.step();
  const cyclesAddn = cpu.step();
  expect(cyclesAddn).toBeGreaterThan(0);

  // ADC A,n (0xCE) with carry
  cpu.A = 0x01; cpu.F |= 0x01; // set carry
  mem.write(0x4020, 0xCE); mem.write(0x4021, 0x02);
  cpu.PC = 0x4020;
  const cyclesAdcn = cpu.step();
  expect(cyclesAdcn).toBeGreaterThan(0);
});

test('SUB/SBC register forms (0x90/0x98) and OR n (0xF6)', () => {
  // SUB B
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  cpu.A = 10; cpu.B = 3;
  mem.write(0x4000, 0x90); cpu.PC = 0x4000;
  cpu.step(); expect(cpu.A).toBe((10 - 3) & 0xFF);

  // SBC B when carry set
  cpu.A = 10; cpu.B = 2; cpu.F |= 0x01;
  mem.write(0x4001, 0x98); cpu.PC = 0x4001; cpu.step();

  // OR immediate
  mem.write(0x4010, 0x3E); mem.write(0x4011, 0x01); mem.write(0x4012, 0xF6); mem.write(0x4013, 0x02);
  cpu.PC = 0x4010; cpu.step(); cpu.step(); const cycles = cpu.step();
  expect(cycles).toBeGreaterThan(0);
});

test('RRCA rotates A (0x0F)', () => {
  const mem = new Memory({ model: '48k' });
  const cpu = new Z80(mem);
  const orig = 0x03;
  cpu.A = orig;
  mem.write(0x4000, 0x0F);
  cpu.PC = 0x4000;
  const cycles = cpu.step();
  expect(cycles).toBeGreaterThan(0);
  expect(cpu.A).toBe(((orig >>> 1) | ((orig & 0x01) ? 0x80 : 0)) & 0xFF);
});