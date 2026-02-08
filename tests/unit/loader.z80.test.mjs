import { describe, test, expect } from 'vitest';
import { Loader } from '../../src/loader.mjs';

// ── Helper: build a valid Z80 v1 uncompressed snapshot ──
function generateV1Uncompressed({ pc = 0x4000, sp = 0xFF00, a = 0x12, f = 0x34,
  b = 0x56, c = 0x78, h = 0xAB, l = 0xCD, d = 0xDE, e = 0xF0,
  i = 0x3F, r = 0x42, ix = 0x1234, iy = 0x5678,
  iff1 = 1, iff2 = 1, im = 1, border = 7,
  screenFill = 0xAA } = {}) {
  const header = new Uint8Array(30);
  const RAM_SIZE = 48 * 1024;
  header[0] = a;
  header[1] = f;
  header[2] = c;  // C (low byte of BC)
  header[3] = b;  // B (high byte of BC)
  header[4] = l;  // L
  header[5] = h;  // H
  header[6] = pc & 0xFF;         // PC low
  header[7] = (pc >> 8) & 0xFF;  // PC high
  header[8] = sp & 0xFF;         // SP low
  header[9] = (sp >> 8) & 0xFF;  // SP high
  header[10] = i;
  header[11] = r & 0x7F;         // R bits 0-6
  // Flag byte at offset 12: bit0=R bit7, bits1-3=border, bit5=compressed(0)
  header[12] = ((r >> 7) & 0x01) | ((border & 0x07) << 1);
  header[13] = e;  // E (low byte of DE)
  header[14] = d;  // D (high byte of DE)
  // Alternate registers (simple zeros for test)
  header[15] = 0; header[16] = 0; // BC'
  header[17] = 0; header[18] = 0; // DE'
  header[19] = 0; header[20] = 0; // HL'
  header[21] = 0; // A'
  header[22] = 0; // F'
  header[23] = iy & 0xFF;
  header[24] = (iy >> 8) & 0xFF;
  header[25] = ix & 0xFF;
  header[26] = (ix >> 8) & 0xFF;
  header[27] = iff1;
  header[28] = iff2;
  header[29] = im & 0x03;

  const ram = new Uint8Array(RAM_SIZE);
  // Fill screen area (first 6912 bytes of RAM = 0x4000-0x5AFF) with pattern
  for (let j = 0; j < 6912 && j < ram.length; j++) ram[j] = screenFill;
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out.buffer;
}

// ── Helper: build a V1 compressed snapshot ──
function generateV1Compressed({ pc = 0x8000, screenFill = 0xBB } = {}) {
  const header = new Uint8Array(30);
  header[6] = pc & 0xFF;
  header[7] = (pc >> 8) & 0xFF;
  header[12] = 0x20; // bit5 = compressed
  header[29] = 1; // IM 1

  // Compressed data: ED ED 00 40 BB → repeat 0xBB 16384 times (first page)
  // then ED ED 00 40 00 for pages 2 and 3, then end marker 00 ED ED 00
  const blocks = [];
  // Page 1 (0x4000-0x7FFF): fill with screenFill
  blocks.push(0xED, 0xED, 0x00, screenFill); // 256 repetitions × 64 times = 16384
  // Actually ED ED NN VV repeats VV NN times. Max NN=255.
  // To fill 16384 bytes: 64 blocks of 256 = 16384. But NN max is 255.
  // So use 65 blocks of 252 + 1 block of 4 = 16384. Actually let's just do 64*256=16384... 
  // NN=0 means 0 repetitions which outputs nothing.
  // Let's build it properly:
  const compressed = [];
  const PAGE = 16384;
  // Fill 3 pages: 48K total
  for (let page = 0; page < 3; page++) {
    const fillVal = page === 0 ? screenFill : 0x00;
    let remaining = PAGE;
    while (remaining > 0) {
      const count = Math.min(remaining, 255);
      compressed.push(0xED, 0xED, count, fillVal);
      remaining -= count;
    }
  }
  // End marker
  compressed.push(0x00, 0xED, 0xED, 0x00);

  const data = new Uint8Array(compressed);
  const out = new Uint8Array(header.length + data.length);
  out.set(header, 0);
  out.set(data, header.length);
  return out.buffer;
}

// ── Helper: build a V2/V3 snapshot with paged blocks ──
function generateV2({ pc = 0x6000, sp = 0xFE00, hwMode = 0, screenFill = 0xCC } = {}) {
  const PAGE_SIZE = 16384;
  const extHeaderLen = 23; // v2

  // V1 header with PC=0 to signal v2
  const header = new Uint8Array(30);
  header[0] = 0x11; // A
  header[1] = 0x22; // F
  header[6] = 0; header[7] = 0; // PC=0 → v2
  header[8] = sp & 0xFF;
  header[9] = (sp >> 8) & 0xFF;
  header[10] = 0x3F; // I
  header[11] = 0x01; // R low
  header[12] = 0x01; // flag byte: R bit7=1, border=0
  header[27] = 1; // IFF1
  header[28] = 1; // IFF2
  header[29] = 1; // IM 1

  // Extended header
  const extHeader = new Uint8Array(2 + extHeaderLen);
  extHeader[0] = extHeaderLen & 0xFF;
  extHeader[1] = (extHeaderLen >> 8) & 0xFF;
  extHeader[2] = pc & 0xFF;         // real PC low
  extHeader[3] = (pc >> 8) & 0xFF;  // real PC high
  extHeader[4] = hwMode;            // hardware mode

  // Build page blocks (compressed): page 8 (0x4000), page 4 (0x8000), page 5 (0xC000)
  const pageNums = [8, 4, 5];
  const pageBlocks = [];
  for (const pn of pageNums) {
    const fillVal = pn === 8 ? screenFill : 0x00;
    // Compress page: use RLE
    const compressedPage = [];
    let remaining = PAGE_SIZE;
    while (remaining > 0) {
      const count = Math.min(remaining, 255);
      compressedPage.push(0xED, 0xED, count, fillVal);
      remaining -= count;
    }
    const blockData = new Uint8Array(compressedPage);
    // 3-byte block header: length (2 bytes LE), page number (1 byte)
    const blockHeader = new Uint8Array(3);
    blockHeader[0] = blockData.length & 0xFF;
    blockHeader[1] = (blockData.length >> 8) & 0xFF;
    blockHeader[2] = pn;
    pageBlocks.push(blockHeader, blockData);
  }

  // Assemble full file
  let totalLen = header.length + extHeader.length;
  for (const b of pageBlocks) totalLen += b.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(header, off); off += header.length;
  out.set(extHeader, off); off += extHeader.length;
  for (const b of pageBlocks) { out.set(b, off); off += b.length; }
  return out.buffer;
}

// ── Helper: build V2 with uncompressed blocks (0xFFFF length marker) ──
function generateV2Uncompressed({ pc = 0x7000, screenFill = 0xDD } = {}) {
  const PAGE_SIZE = 16384;
  const extHeaderLen = 23;

  const header = new Uint8Array(30);
  header[6] = 0; header[7] = 0; // v2
  header[29] = 1;

  const extHeader = new Uint8Array(2 + extHeaderLen);
  extHeader[0] = extHeaderLen;
  extHeader[2] = pc & 0xFF;
  extHeader[3] = (pc >> 8) & 0xFF;

  const pageNums = [8, 4, 5];
  const pageBlocks = [];
  for (const pn of pageNums) {
    const fillVal = pn === 8 ? screenFill : 0x00;
    const blockHeader = new Uint8Array(3);
    blockHeader[0] = 0xFF;  // 0xFFFF = uncompressed
    blockHeader[1] = 0xFF;
    blockHeader[2] = pn;
    const pageData = new Uint8Array(PAGE_SIZE).fill(fillVal);
    pageBlocks.push(blockHeader, pageData);
  }

  let totalLen = header.length + extHeader.length;
  for (const b of pageBlocks) totalLen += b.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  out.set(header, off); off += header.length;
  out.set(extHeader, off); off += extHeader.length;
  for (const b of pageBlocks) { out.set(b, off); off += b.length; }
  return out.buffer;
}

// ══════════════════════════ Tests ══════════════════════════

describe('Loader.parseZ80 — V1 uncompressed', () => {
  test('extracts PC, SP, and main registers at correct offsets', () => {
    const buf = generateV1Uncompressed({ pc: 0x4000, sp: 0xFF00, a: 0x12, f: 0x34,
      b: 0x56, c: 0x78, h: 0xAB, l: 0xCD, d: 0xDE, e: 0xF0 });
    const parsed = Loader.parseZ80(buf);
    const r = parsed.snapshot.registers;
    expect(r.PC).toBe(0x4000);
    expect(r.SP).toBe(0xFF00);
    expect(r.A).toBe(0x12);
    expect(r.F).toBe(0x34);
    expect(r.B).toBe(0x56);
    expect(r.C).toBe(0x78);
    expect(r.H).toBe(0xAB);
    expect(r.L).toBe(0xCD);
    expect(r.D).toBe(0xDE);
    expect(r.E).toBe(0xF0);
  });

  test('extracts IX, IY, I, R, IFF, IM', () => {
    const buf = generateV1Uncompressed({ i: 0x3F, r: 0xC2, ix: 0x1234, iy: 0x5678, iff1: 1, iff2: 1, im: 2 });
    const r = Loader.parseZ80(buf).snapshot.registers;
    expect(r.I).toBe(0x3F);
    expect(r.R).toBe(0xC2);  // bit 7 reconstructed from flag byte
    expect(r.IX).toBe(0x1234);
    expect(r.IY).toBe(0x5678);
    expect(r.IFF1).toBe(true);
    expect(r.IFF2).toBe(true);
    expect(r.IM).toBe(2);
  });

  test('extracts border colour', () => {
    const buf = generateV1Uncompressed({ border: 5 });
    expect(Loader.parseZ80(buf).snapshot.registers.borderColor).toBe(5);
  });

  test('extracts 48K RAM and screen data is non-zero', () => {
    const buf = generateV1Uncompressed({ screenFill: 0xAA });
    const parsed = Loader.parseZ80(buf);
    expect(parsed.snapshot.ram).toBeInstanceOf(Uint8Array);
    expect(parsed.snapshot.ram.length).toBe(48 * 1024);
    // Screen memory starts at RAM offset 0 (maps to 0x4000-0x57FF)
    expect(parsed.snapshot.ram[0]).toBe(0xAA);
    expect(parsed.snapshot.ram[6911]).toBe(0xAA);
  });

  test('version is 1', () => {
    const parsed = Loader.parseZ80(generateV1Uncompressed());
    expect(parsed.snapshot.version).toBe(1);
  });
});

describe('Loader.parseZ80 — V1 compressed', () => {
  test('decompresses ED ED NN VV RLE correctly', () => {
    const buf = generateV1Compressed({ screenFill: 0xBB });
    const parsed = Loader.parseZ80(buf);
    expect(parsed.snapshot.version).toBe(1);
    expect(parsed.snapshot.ram.length).toBe(48 * 1024);
    // First page should be filled with 0xBB
    expect(parsed.snapshot.ram[0]).toBe(0xBB);
    expect(parsed.snapshot.ram[16383]).toBe(0xBB);
    // Second page should be 0x00
    expect(parsed.snapshot.ram[16384]).toBe(0x00);
  });

  test('reads PC from header', () => {
    const parsed = Loader.parseZ80(generateV1Compressed({ pc: 0x8000 }));
    expect(parsed.snapshot.registers.PC).toBe(0x8000);
  });
});

describe('Loader.parseZ80 — V2 compressed pages', () => {
  test('detects version 2 when header PC is 0', () => {
    const parsed = Loader.parseZ80(generateV2());
    expect(parsed.snapshot.version).toBe(2);
  });

  test('reads real PC from extended header', () => {
    const parsed = Loader.parseZ80(generateV2({ pc: 0x6000 }));
    expect(parsed.snapshot.registers.PC).toBe(0x6000);
  });

  test('decompresses page blocks and places screen data correctly', () => {
    const parsed = Loader.parseZ80(generateV2({ screenFill: 0xCC }));
    expect(parsed.snapshot.ram.length).toBe(48 * 1024);
    // Page 8 → RAM offset 0 (0x4000-0x7FFF), filled with 0xCC
    expect(parsed.snapshot.ram[0]).toBe(0xCC);
    expect(parsed.snapshot.ram[16383]).toBe(0xCC);
    // Page 4 → RAM offset 0x4000 (0x8000-0xBFFF), filled with 0x00
    expect(parsed.snapshot.ram[16384]).toBe(0x00);
  });

  test('reads main registers from v1 header area', () => {
    const parsed = Loader.parseZ80(generateV2());
    expect(parsed.snapshot.registers.A).toBe(0x11);
    expect(parsed.snapshot.registers.F).toBe(0x22);
    expect(parsed.snapshot.registers.I).toBe(0x3F);
  });
});

describe('Loader.parseZ80 — V2 uncompressed pages', () => {
  test('handles 0xFFFF length as uncompressed 16K page', () => {
    const parsed = Loader.parseZ80(generateV2Uncompressed({ pc: 0x7000, screenFill: 0xDD }));
    expect(parsed.snapshot.registers.PC).toBe(0x7000);
    expect(parsed.snapshot.ram[0]).toBe(0xDD);
    expect(parsed.snapshot.ram[16383]).toBe(0xDD);
    expect(parsed.snapshot.ram[16384]).toBe(0x00); // page 4
  });
});

describe('Loader.parseZ80 — edge cases', () => {
  test('returns null ram for files shorter than 30 bytes', () => {
    const parsed = Loader.parseZ80(new ArrayBuffer(10));
    expect(parsed.snapshot.ram).toBeNull();
  });

  test('register A=0 is preserved (not coerced by || 0)', () => {
    const buf = generateV1Uncompressed({ a: 0 });
    const r = Loader.parseZ80(buf).snapshot.registers;
    expect(r.A).toBe(0);
  });

  test('PC=0 in v1 context (impossible per spec) treated as v2 gracefully', () => {
    // A file with PC=0 at offset 6 but no valid extended header
    // Parser should still return usable output without crashing
    const small = new Uint8Array(34);
    small[6] = 0; small[7] = 0; // PC=0
    small[30] = 0; small[31] = 0; // extLen=0
    const parsed = Loader.parseZ80(small.buffer);
    expect(parsed.snapshot).toBeDefined();
  });
});

describe('Loader._z80Decompress', () => {
  test('decompresses literal bytes', () => {
    const src = new Uint8Array([0x01, 0x02, 0x03]);
    const result = Loader._z80Decompress(src, 3);
    expect(Array.from(result)).toEqual([0x01, 0x02, 0x03]);
  });

  test('decompresses RLE sequences', () => {
    // ED ED 05 AA → 5 copies of 0xAA
    const src = new Uint8Array([0xED, 0xED, 0x05, 0xAA]);
    const result = Loader._z80Decompress(src, 5);
    expect(Array.from(result)).toEqual([0xAA, 0xAA, 0xAA, 0xAA, 0xAA]);
  });

  test('decompresses mixed literal and RLE', () => {
    // 0x01, ED ED 03 FF, 0x02
    const src = new Uint8Array([0x01, 0xED, 0xED, 0x03, 0xFF, 0x02]);
    const result = Loader._z80Decompress(src, 6);
    expect(Array.from(result.subarray(0, 6))).toEqual([0x01, 0xFF, 0xFF, 0xFF, 0x02, 0x00]);
  });

  test('does not overrun expectedLen', () => {
    const src = new Uint8Array([0xED, 0xED, 0xFF, 0xAA]); // 255×0xAA
    const result = Loader._z80Decompress(src, 10);
    expect(result.length).toBe(10);
    expect(result[9]).toBe(0xAA);
  });
});