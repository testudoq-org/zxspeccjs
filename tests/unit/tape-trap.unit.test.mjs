import { describe, it, expect } from 'vitest';
// Provide minimal DOM stubs so importing `src/main.mjs` (UI-heavy) is safe in Node/Vitest
if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: () => null };
import ROM_DATA from '../../src/roms/spec48.js';

// TDD: expected behaviour for ROM "tape trap" instant load (jsspeccy3 style)
// - When a TAP is injected and the CPU enters the ROM's tape-loader,
//   the emulator should perform an *instant* load of the next TAP block:
//     * poke block[1..] into memory at IX for length DE
//     * set AF carry on successful checksum, and set PC = 0x05E2
// This test suite asserts that behaviour (will fail until implementation).

async function makeEmu() {
  const { Emulator } = await import('../../src/main.mjs');
  const canvasStub = {
    width: 320,
    height: 240,
    style: {},
    getContext: () => ({
      createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }),
      putImageData: () => {},
      fillRect: () => {},
      imageSmoothingEnabled: false,
    }),
    toDataURL: () => ''
  };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  return emu;
}

describe('ROM tape-trap (instant load) - TDD expectations', () => {
  it('injectTape should store parsed TAP and be callable (smoke)', async () => {
    const emu = await makeEmu();
    const parsed = { type: 'tap', blocks: [ new Uint8Array([0xFF, 0xAA, 0xBB, 0x00]) ] };
    const res = await emu.injectTape(parsed, { fileName: 'dummy.tap', autoStart: false });
    expect(res && res.success).toBe(true);
    expect(emu._lastTap).toBeDefined();
  });

  it('when trap is executed it should poke block bytes at IX and set PC=0x05E2 and set C flag on success', async () => {
    const emu = await makeEmu();

    // Ensure core + ROM present
    await emu._createCore(null);
    emu.memory.loadROM(ROM_DATA.bytes, 0);

    // Prepare a single data block: [type, b0, b1, ..., checksum]
    // (checksum semantics are implementation-defined; test expects successful path)
    const payload = new Uint8Array([0xFF, 0x11, 0x22, 0x33, 0x99]);
    const parsed = { type: 'tap', blocks: [payload] };
    await emu.injectTape(parsed, { fileName: 'trap-test.tap', autoStart: false });

    // CPU registers expected by ROM trap loader: IX -> target addr, DE -> length
    const cpu = emu.cpu = emu.cpu || (await import('../../src/z80.mjs')).Z80 && new (await import('../../src/z80.mjs')).Z80(emu.memory);
    cpu.IX = 0x8000; // typical program load area
    cpu.D = 0x00; cpu.E = 0x03; // DE = 3 bytes to write (0x11,0x22,0x33)

    // Sanity: target memory must not already contain the payload
    expect(emu.memory.read(0x8000)).not.toBe(0x11);

    // --- EXPECTATION (TDD) ---
    // Calling the ROM tape-trap handler (to be implemented) should:
    //  - write payload[1..3] into memory at IX
    //  - set cpu.PC === 0x05E2
    //  - set carry flag in F (cpu.F & 0x01 === 1)
    // The handler name is currently unspecified in code; this test will
    // call the public-facing hook we intend to implement: emu._trapTapeLoad()

    expect(typeof emu._trapTapeLoad).toBe('function'); // <-- TDD: implement this

    // invoke trap (will fail until implemented)
    await emu._trapTapeLoad();

    // Assertions (expected behaviour)
    expect(emu.memory.read(0x8000)).toBe(0x11);
    expect(emu.memory.read(0x8001)).toBe(0x22);
    expect(emu.memory.read(0x8002)).toBe(0x33);
    expect(cpu.PC).toBe(0x05E2);
    expect((cpu.F & 0x01)).toBe(1); // carry set on successful load
  });

  it('trap handler should clear carry / indicate failure for bad checksum', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);
    emu.memory.loadROM(ROM_DATA.bytes, 0);

    // corrupted checksum block (last byte wrong)
    const payload = new Uint8Array([0xFF, 0xAA, 0xBB, 0xCC, 0x00]); // checksum intentionally incorrect
    const parsed = { type: 'tap', blocks: [payload] };
    await emu.injectTape(parsed, { fileName: 'trap-bad.tap', autoStart: false });

    const cpu = emu.cpu = emu.cpu || (await import('../../src/z80.mjs')).Z80 && new (await import('../../src/z80.mjs')).Z80(emu.memory);
    cpu.IX = 0x9000; cpu.D = 0x00; cpu.E = 0x03;

    // Expect trap API exists
    expect(typeof emu._trapTapeLoad).toBe('function');

    // invoke trap
    await emu._trapTapeLoad();

    // On checksum failure we expect carry cleared and PC to be set to the ROM's
    // failure/exit point (implementation-defined). At minimum ensure carry is clear.
    expect((cpu.F & 0x01)).toBe(0);
  });

  it('should auto-invoke tape-trap when ROM loader PC is executed', async () => {
    const emu = await makeEmu();
    await emu._createCore(null);
    emu.memory.loadROM(ROM_DATA.bytes, 0);

    // Prepare a single valid data block
    const payload = new Uint8Array([0xFF, 0xDE, 0xAD, 0xBE, 0xFF]);
    const parsed = { type: 'tap', blocks: [payload] };
    await emu.injectTape(parsed, { fileName: 'trap-auto.tap', autoStart: false });

    const cpu = emu.cpu;
    cpu.IX = 0x4000; cpu.D = 0x00; cpu.E = 0x03; // write 3 bytes at 0x4000

    // Simulate execution of ROM loader entry (one of the known trap PCs)
    // The emulator's debug hook (_trackOpcodeExecution) should detect this and
    // call the async trap handler. Allow a microtask tick for the handler to run.
    emu._trackOpcodeExecution(0x00, 0x056b);
    await Promise.resolve(); // allow async _trapTapeLoad to complete

    // Assertions: memory written, PC set to ROM exit, carry set
    expect(emu.memory.read(0x4000)).toBe(0xDE);
    expect(emu.memory.read(0x4001)).toBe(0xAD);
    expect(emu.memory.read(0x4002)).toBe(0xBE);
    expect(cpu.PC).toBe(0x05E2);
    expect((cpu.F & 0x01)).toBe(1);
  });
});
