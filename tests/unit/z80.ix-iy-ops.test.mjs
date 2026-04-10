/* eslint-disable no-unused-vars */
import { describe, it, expect } from 'vitest';
import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';

function createCPU(code) {
  const mem = new Memory();
  mem.loadROM(new Uint8Array(code));
  const cpu = new Z80(mem);
  cpu.reset();
  cpu.PC = 0x0000;
  return { cpu, mem };
}

describe('Z80 DD-prefix (IX) register operations', () => {
  it('ADD IX,BC adds BC to IX', () => {
    const { cpu } = createCPU([0xDD, 0x09]);
    cpu.IX = 0x1000;
    cpu.B = 0x02; cpu.C = 0x34;
    cpu.step();
    expect(cpu.IX).toBe(0x1234);
  });

  it('ADD IX,DE adds DE to IX', () => {
    const { cpu } = createCPU([0xDD, 0x19]);
    cpu.IX = 0x1000;
    cpu.D = 0x05; cpu.E = 0x00;
    cpu.step();
    expect(cpu.IX).toBe(0x1500);
  });

  it('ADD IX,IX doubles IX', () => {
    const { cpu } = createCPU([0xDD, 0x29]);
    cpu.IX = 0x0800;
    cpu.step();
    expect(cpu.IX).toBe(0x1000);
  });

  it('ADD IX,SP adds SP to IX', () => {
    const { cpu } = createCPU([0xDD, 0x39]);
    cpu.IX = 0x1000;
    cpu.SP = 0x0200;
    cpu.step();
    expect(cpu.IX).toBe(0x1200);
  });

  it('ADD IX,BC sets carry on overflow', () => {
    const { cpu } = createCPU([0xDD, 0x09]);
    cpu.IX = 0xFFF0;
    cpu.B = 0x00; cpu.C = 0x20;
    cpu.step();
    expect(cpu.IX).toBe(0x0010);
    expect(cpu.F & 0x01).toBe(0x01);
  });

  it('ADD IX,BC sets half-carry correctly', () => {
    const { cpu } = createCPU([0xDD, 0x09]);
    cpu.IX = 0x0FFF;
    cpu.B = 0x00; cpu.C = 0x01;
    cpu.step();
    expect(cpu.IX).toBe(0x1000);
    expect(cpu.F & 0x10).toBe(0x10);
  });

  it('INC IX increments IX', () => {
    const { cpu } = createCPU([0xDD, 0x23]);
    cpu.IX = 0x1234;
    cpu.step();
    expect(cpu.IX).toBe(0x1235);
  });

  it('INC IX wraps at 0xFFFF', () => {
    const { cpu } = createCPU([0xDD, 0x23]);
    cpu.IX = 0xFFFF;
    cpu.step();
    expect(cpu.IX).toBe(0x0000);
  });

  it('DEC IX decrements IX', () => {
    const { cpu } = createCPU([0xDD, 0x2B]);
    cpu.IX = 0x1234;
    cpu.step();
    expect(cpu.IX).toBe(0x1233);
  });

  it('DEC IX wraps at 0x0000', () => {
    const { cpu } = createCPU([0xDD, 0x2B]);
    cpu.IX = 0x0000;
    cpu.step();
    expect(cpu.IX).toBe(0xFFFF);
  });

  it('JP (IX) loads PC from IX', () => {
    const { cpu } = createCPU([0xDD, 0xE9]);
    cpu.IX = 0x4000;
    cpu.step();
    expect(cpu.PC).toBe(0x4000);
  });

  it('EX (SP),IX exchanges stack top with IX', () => {
    const { cpu, mem } = createCPU([0xDD, 0xE3]);
    cpu.IX = 0x1234;
    cpu.SP = 0x8000;
    mem.write(0x8000, 0x78, 0);
    mem.write(0x8001, 0x56, 0);
    cpu.step();
    expect(cpu.IX).toBe(0x5678);
    expect(mem.read(0x8000, 0)).toBe(0x34);
    expect(mem.read(0x8001, 0)).toBe(0x12);
  });
});

describe('Z80 FD-prefix (IY) register operations', () => {
  it('ADD IY,BC adds BC to IY', () => {
    const { cpu } = createCPU([0xFD, 0x09]);
    cpu.IY = 0x2000;
    cpu.B = 0x03; cpu.C = 0x00;
    cpu.step();
    expect(cpu.IY).toBe(0x2300);
  });

  it('ADD IY,DE adds DE to IY', () => {
    const { cpu } = createCPU([0xFD, 0x19]);
    cpu.IY = 0x1000;
    cpu.D = 0x04; cpu.E = 0x56;
    cpu.step();
    expect(cpu.IY).toBe(0x1456);
  });

  it('ADD IY,IY doubles IY', () => {
    const { cpu } = createCPU([0xFD, 0x29]);
    cpu.IY = 0x0400;
    cpu.step();
    expect(cpu.IY).toBe(0x0800);
  });

  it('ADD IY,SP adds SP to IY', () => {
    const { cpu } = createCPU([0xFD, 0x39]);
    cpu.IY = 0x1000;
    cpu.SP = 0x0300;
    cpu.step();
    expect(cpu.IY).toBe(0x1300);
  });

  it('INC IY increments IY', () => {
    const { cpu } = createCPU([0xFD, 0x23]);
    cpu.IY = 0xABCD;
    cpu.step();
    expect(cpu.IY).toBe(0xABCE);
  });

  it('DEC IY decrements IY', () => {
    const { cpu } = createCPU([0xFD, 0x2B]);
    cpu.IY = 0xABCD;
    cpu.step();
    expect(cpu.IY).toBe(0xABCC);
  });

  it('JP (IY) loads PC from IY', () => {
    const { cpu } = createCPU([0xFD, 0xE9]);
    cpu.IY = 0x6000;
    cpu.step();
    expect(cpu.PC).toBe(0x6000);
  });

  it('EX (SP),IY exchanges stack top with IY', () => {
    const { cpu, mem } = createCPU([0xFD, 0xE3]);
    cpu.IY = 0xAABB;
    cpu.SP = 0x8000;
    mem.write(0x8000, 0xDD, 0);
    mem.write(0x8001, 0xCC, 0);
    cpu.step();
    expect(cpu.IY).toBe(0xCCDD);
    expect(mem.read(0x8000, 0)).toBe(0xBB);
    expect(mem.read(0x8001, 0)).toBe(0xAA);
  });
});
