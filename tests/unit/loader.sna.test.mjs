import { describe, test, expect } from 'vitest';
import { Loader } from '../../src/loader.mjs';

/**
 * Build a synthetic 48K SNA file buffer.
 * Header: 27 bytes, RAM: 49152 bytes (48K), total: 49179 bytes.
 */
function buildSNA48K(opts = {}) {
  const {
    I = 0x3F, HL2 = 0x1122, DE2 = 0x3344, BC2 = 0x5566, AF2 = 0x7788,
    HL = 0xAABB, DE = 0xCCDD, BC = 0xEEFF, IY = 0x1234, IX = 0x5678,
    iff2 = true, R = 0x42, AF = 0x9A00, SP = 0x7FFE, IM = 1,
    borderColor = 2, pc = 0x8000
  } = opts;

  const HEADER_SIZE = 27;
  const RAM_SIZE = 48 * 1024;
  const buf = new ArrayBuffer(HEADER_SIZE + RAM_SIZE);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // Header
  dv.setUint8(0, I);
  dv.setUint8(1, HL2 & 0xFF);        // L'
  dv.setUint8(2, (HL2 >> 8) & 0xFF); // H'
  dv.setUint8(3, DE2 & 0xFF);        // E'
  dv.setUint8(4, (DE2 >> 8) & 0xFF); // D'
  dv.setUint8(5, BC2 & 0xFF);        // C'
  dv.setUint8(6, (BC2 >> 8) & 0xFF); // B'
  dv.setUint8(7, AF2 & 0xFF);        // F'
  dv.setUint8(8, (AF2 >> 8) & 0xFF); // A'
  dv.setUint8(9, HL & 0xFF);         // L
  dv.setUint8(10, (HL >> 8) & 0xFF); // H
  dv.setUint8(11, DE & 0xFF);        // E
  dv.setUint8(12, (DE >> 8) & 0xFF); // D
  dv.setUint8(13, BC & 0xFF);        // C
  dv.setUint8(14, (BC >> 8) & 0xFF); // B
  dv.setUint16(15, IY, true);
  dv.setUint16(17, IX, true);
  dv.setUint8(19, iff2 ? 0x04 : 0x00);
  dv.setUint8(20, R);
  dv.setUint8(21, AF & 0xFF);        // F
  dv.setUint8(22, (AF >> 8) & 0xFF); // A
  dv.setUint16(23, SP, true);
  dv.setUint8(25, IM);
  dv.setUint8(26, borderColor);

  // Push PC onto stack in RAM at SP-0x4000
  const spOff = SP - 0x4000;
  u8[HEADER_SIZE + spOff] = pc & 0xFF;
  u8[HEADER_SIZE + spOff + 1] = (pc >> 8) & 0xFF;

  return buf;
}

/**
 * Build a synthetic 128K SNA file buffer.
 * Header: 27 bytes, RAM: 49152 bytes (48K), extension: PC (2) + port7FFD (1) + trdos (1) + extra pages
 * Total > 49179 + 4
 */
function buildSNA128K(opts = {}) {
  const {
    I = 0x3F, HL2 = 0x1122, DE2 = 0x3344, BC2 = 0x5566, AF2 = 0x7788,
    HL = 0xAABB, DE = 0xCCDD, BC = 0xEEFF, IY = 0x1234, IX = 0x5678,
    iff2 = true, R = 0x42, AF = 0x9A00, SP = 0x8000, IM = 1,
    borderColor = 2, pc = 0x6000, pagingFlags = 0x10
  } = opts;

  const HEADER_SIZE = 27;
  const RAM_48K = 48 * 1024;
  // 128K SNA: 27 header + 48K + 4 extension bytes + additional 16K pages
  // We add exactly 5 extra bytes to trigger the 128K detection path
  const EXT_SIZE = 5;
  const buf = new ArrayBuffer(HEADER_SIZE + RAM_48K + EXT_SIZE);
  const dv = new DataView(buf);

  // Header (same as 48K)
  dv.setUint8(0, I);
  dv.setUint8(1, HL2 & 0xFF);
  dv.setUint8(2, (HL2 >> 8) & 0xFF);
  dv.setUint8(3, DE2 & 0xFF);
  dv.setUint8(4, (DE2 >> 8) & 0xFF);
  dv.setUint8(5, BC2 & 0xFF);
  dv.setUint8(6, (BC2 >> 8) & 0xFF);
  dv.setUint8(7, AF2 & 0xFF);
  dv.setUint8(8, (AF2 >> 8) & 0xFF);
  dv.setUint8(9, HL & 0xFF);
  dv.setUint8(10, (HL >> 8) & 0xFF);
  dv.setUint8(11, DE & 0xFF);
  dv.setUint8(12, (DE >> 8) & 0xFF);
  dv.setUint8(13, BC & 0xFF);
  dv.setUint8(14, (BC >> 8) & 0xFF);
  dv.setUint16(15, IY, true);
  dv.setUint16(17, IX, true);
  dv.setUint8(19, iff2 ? 0x04 : 0x00);
  dv.setUint8(20, R);
  dv.setUint8(21, AF & 0xFF);
  dv.setUint8(22, (AF >> 8) & 0xFF);
  dv.setUint16(23, SP, true);
  dv.setUint8(25, IM);
  dv.setUint8(26, borderColor);

  // 128K extension: PC at offset 49179, pagingFlags at 49181
  const extOff = HEADER_SIZE + RAM_48K;
  dv.setUint16(extOff, pc, true);
  dv.setUint8(extOff + 2, pagingFlags);

  return buf;
}


describe('Loader.parseSNA — 48K snapshots', () => {
  test('should parse all register fields from 48K SNA header', () => {
    const buf = buildSNA48K();
    const result = Loader.parseSNA(buf);
    const regs = result.snapshot.registers;

    expect(regs.I).toBe(0x3F);
    expect(regs.L2).toBe(0x22);   // low byte of HL' = 0x1122
    expect(regs.H2).toBe(0x11);
    expect(regs.E2).toBe(0x44);
    expect(regs.D2).toBe(0x33);
    expect(regs.C2).toBe(0x66);
    expect(regs.B2).toBe(0x55);
    expect(regs.F2).toBe(0x88);
    expect(regs.A2).toBe(0x77);
    expect(regs.L).toBe(0xBB);
    expect(regs.H).toBe(0xAA);
    expect(regs.E).toBe(0xDD);
    expect(regs.D).toBe(0xCC);
    expect(regs.C).toBe(0xFF);
    expect(regs.B).toBe(0xEE);
    expect(regs.IY).toBe(0x1234);
    expect(regs.IX).toBe(0x5678);
    expect(regs.R).toBe(0x42);
    expect(regs.F).toBe(0x00);   // low byte of AF=0x9A00
    expect(regs.A).toBe(0x9A);   // high byte of AF=0x9A00
    expect(regs.IM).toBe(1);
    expect(regs.borderColor).toBe(2);
  });

  test('should extract IFF1/IFF2 from header byte 19', () => {
    const buf = buildSNA48K({ iff2: true });
    const regsOn = Loader.parseSNA(buf).snapshot.registers;
    expect(regsOn.IFF2).toBe(true);
    expect(regsOn.IFF1).toBe(true);

    const buf2 = buildSNA48K({ iff2: false });
    const regsOff = Loader.parseSNA(buf2).snapshot.registers;
    expect(regsOff.IFF2).toBe(false);
    expect(regsOff.IFF1).toBe(false);
  });

  test('should pop PC from stack for 48K SNA', () => {
    const buf = buildSNA48K({ SP: 0x7FFE, pc: 0x8000 });
    const result = Loader.parseSNA(buf);
    const regs = result.snapshot.registers;

    expect(regs.PC).toBe(0x8000);
    // SP should be incremented by 2 after popping
    expect(regs.SP).toBe(0x8000);
  });

  test('should clear popped stack bytes in RAM after PC recovery', () => {
    const buf = buildSNA48K({ SP: 0x7FFE, pc: 0xABCD });
    const result = Loader.parseSNA(buf);
    const ram = result.snapshot.ram;
    // SP offset in RAM: 0x7FFE - 0x4000 = 0x3FFE
    expect(ram[0x3FFE]).toBe(0);
    expect(ram[0x3FFF]).toBe(0);
  });

  test('should return 48K RAM image', () => {
    const buf = buildSNA48K();
    const result = Loader.parseSNA(buf);
    expect(result.snapshot.ram).toHaveLength(48 * 1024);
    expect(result.snapshot.ram).toBeInstanceOf(Uint8Array);
  });

  test('should return null rom', () => {
    const buf = buildSNA48K();
    const result = Loader.parseSNA(buf);
    expect(result.rom).toBeNull();
  });

  test('should handle SP at bottom of RAM (0x4000)', () => {
    const buf = buildSNA48K({ SP: 0x4000, pc: 0x1234 });
    const result = Loader.parseSNA(buf);
    const regs = result.snapshot.registers;
    expect(regs.PC).toBe(0x1234);
    expect(regs.SP).toBe(0x4002);
  });

  test('should reject files too small for SNA format', () => {
    const buf = new ArrayBuffer(100);
    const result = Loader.parseSNA(buf);
    expect(result.snapshot.ram).toBeNull();
  });
});

describe('Loader.parseSNA — 128K snapshots', () => {
  test('should extract PC from extension area for 128K SNA', () => {
    const buf = buildSNA128K({ pc: 0x6000 });
    const result = Loader.parseSNA(buf);
    expect(result.snapshot.registers.PC).toBe(0x6000);
  });

  test('should extract pagingFlags from 128K extension', () => {
    const buf = buildSNA128K({ pagingFlags: 0x10 });
    const result = Loader.parseSNA(buf);
    expect(result.snapshot.registers.pagingFlags).toBe(0x10);
  });

  test('should NOT pop PC from stack for 128K SNA', () => {
    const buf = buildSNA128K({ SP: 0x8000, pc: 0x6000 });
    const result = Loader.parseSNA(buf);
    // SP should remain as-is (no stack popping for 128K)
    expect(result.snapshot.registers.SP).toBe(0x8000);
    expect(result.snapshot.registers.PC).toBe(0x6000);
  });
});

describe('Loader.parseSNA — border color', () => {
  test('should mask border to 3 bits', () => {
    const buf = buildSNA48K({ borderColor: 0xFF });
    const result = Loader.parseSNA(buf);
    expect(result.snapshot.registers.borderColor).toBe(7);
  });
});
