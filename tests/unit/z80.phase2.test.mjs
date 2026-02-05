/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test, expect } from 'vitest';
const console = globalThis.console;

/**
 * Simple test to verify Phase 2 Z80 operations implementation
 */

import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';

test('ADC HL,BC (16-bit ADC HL,BC)', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu._setHL(0x1000);
  cpu._setBC(0x0F00);
  cpu.setCarry(true);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x4A); // ADC HL,BC

  const tstates1 = cpu.step();
  expect(cpu._getHL()).toBe(0x1F01);
  expect(tstates1).toBe(15);
});

test("EX AF,AF' swaps AF and A_'", () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu.A = 0x12;
  cpu.F = 0x45;
  cpu.A_ = 0x34;
  cpu.F_ = 0x67;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x08); // EX AF,AF'

  cpu.step();
  expect(cpu.A).toBe(0x34);
  expect(cpu.F).toBe(0x67);
});

test('EXX swaps register sets (BC/DE/HL)', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu._setBC(0x1234);
  cpu._setDE(0x5678);
  cpu._setHL(0x9ABC);
  cpu.B_ = 0xFF; cpu.C_ = 0xEE;
  cpu.D_ = 0xDD; cpu.E_ = 0xCC;
  cpu.H_ = 0xBB; cpu.L_ = 0xAA;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xD9); // EXX

  cpu.step();
  expect(cpu._getBC()).toBe(0xFFEE);
  expect(cpu._getDE()).toBe(0xDDCC);
  expect(cpu._getHL()).toBe(0xBBAA);
});

test('LDI block transfer updates memory and registers', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu._setHL(0x1000);
  cpu._setDE(0x2000);
  cpu._setBC(0x0003);
  memory.write(0x1000, 0xAB);
  memory.write(0x2000, 0x00);
  cpu.PC = 0x3000;
  memory.write(0x3000, 0xED);
  memory.write(0x3001, 0xA0); // LDI

  cpu.step();
  expect(memory.read(0x2000)).toBe(0xAB);
  expect(cpu._getHL()).toBe(0x1001);
  expect(cpu._getDE()).toBe(0x2001);
  expect(cpu._getBC()).toBe(0x0002);
});

test('EI enables IFF and DI disables IFF', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xFB); // EI
  cpu.step();
  expect(cpu.IFF1).toBe(true);
  expect(cpu.IFF2).toBe(true);

  cpu.PC = 0x1001;
  memory.write(0x1001, 0xF3); // DI
  cpu.step();
  expect(cpu.IFF1).toBe(false);
  expect(cpu.IFF2).toBe(false);
});

test('Interrupt modes IM0 and IM1 set correctly', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x46); // IM 0
  cpu.step();
  expect(cpu.IM).toBe(0);

  cpu.PC = 0x1002;
  memory.write(0x1002, 0xED);
  memory.write(0x1003, 0x56); // IM 1
  cpu.step();
  expect(cpu.IM).toBe(1);
});

test('NEG and CPL operations affect A correctly', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu.A = 0x42;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0xED);
  memory.write(0x1001, 0x44); // NEG
  cpu.step();
  expect(cpu.A).toBe(0xBE);

  cpu.reset();
  cpu.A = 0xAB;
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x2F); // CPL
  cpu.step();
  expect(cpu.A).toBe(0x54);
});

test('INC BC wraps around correctly', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  cpu.reset();
  cpu._setBC(0xFFFF);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x03); // INC BC
  cpu.step();
  expect(cpu._getBC()).toBe(0x0000);
});

test('ADC A,B and SBC A,C arithmetic', () => {
  const memory = new Memory();
  const cpu = new Z80(memory);

  // ADC A,B
  cpu.reset();
  cpu.A = 0xFF;
  cpu.B = 0x01;
  cpu.setCarry(false);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x88); // ADC A,B
  cpu.step();
  expect(cpu.A).toBe(0x00);
  expect(cpu.getCarry()).toBe(true);
  expect(cpu.getZero()).toBe(true);

  // SBC A,C
  cpu.reset();
  cpu.A = 0x10;
  cpu.C = 0x05;
  cpu.setCarry(true);
  cpu.PC = 0x1000;
  memory.write(0x1000, 0x99); // SBC A,C
  cpu.step();
  expect(cpu.A).toBe(0x0A);
});
