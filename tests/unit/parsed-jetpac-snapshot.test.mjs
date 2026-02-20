import fs from 'fs';
import path from 'path';
import { test, expect } from 'vitest';

test('parsed_jetpac_snapshot.json registers: IFF1 should be true and snapshot contains Jetpac loop at ref PC', () => {
  const parsedPath = path.resolve('traces', 'parsed_jetpac_snapshot.json');
  const refPath = path.resolve('traces', 'jsspeccy_reference_jetpac_trace.json');
  expect(fs.existsSync(parsedPath)).toBe(true);
  expect(fs.existsSync(refPath)).toBe(true);

  const json = JSON.parse(fs.readFileSync(parsedPath, 'utf8'));
  const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));

  expect(json.registers, 'snapshot should include registers').toBeDefined();
  expect(json.registers.IFF1, 'parsed snapshot must have IFF1=true for Jetpac start behaviour').toBeTruthy();

  // Ensure parsed snapshot contains the synthetic loop at the reference PC
  const refPC = ref.frames && ref.frames[0] && ref.frames[0].regs && ref.frames[0].regs.PC;
  expect(typeof refPC === 'number').toBeTruthy();
  const ramOff = refPC - 0x4000;
  expect(typeof json.ram[String(ramOff)] !== 'undefined', `expected parsed snapshot to contain code at ram offset ${ramOff}`).toBeTruthy();
  expect(json.ram[String(ramOff)], `expected first opcode at ram[${ramOff}] to be 0x21`).toBe(0x21);
});