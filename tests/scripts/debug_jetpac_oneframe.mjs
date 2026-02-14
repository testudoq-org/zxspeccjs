#!/usr/bin/env node
import { Loader } from '../../src/loader.mjs';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';
import { Memory } from '../../src/memory.mjs';

function generateJetpacZ80Payload() {
  const PAGE_SIZE = 16384;
  const header = new Uint8Array(30);
  header[0] = 0xFF; header[1] = 0x44; header[6] = 0x00; header[7] = 0x80; // PC=0x8000
  header[10] = 0x3F; header[11] = 0x01; header[27] = 1; header[28] = 1; header[29] = 1;
  const ram = new Uint8Array(3 * PAGE_SIZE);
  for (let i = 0; i < 6144; i++) ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
  for (let i = 6144; i < 6912; i++) ram[i] = 0x47;
  const code = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x10, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];
  for (let i = 0; i < code.length; i++) ram[0x8000 + i] = code[i];
  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0); out.set(ram, header.length);
  return out.buffer;
}

async function main() {
  const payloadBuf = generateJetpacZ80Payload();
  const parsed = Loader.parseZ80(payloadBuf);

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(320*240*4) }), putImageData: () => {}, createImageData: () => ({ data: new Uint8ClampedArray(320*240*4) }) }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });

  // Apply snapshot
  if (!emu.memory) await emu._createCore(parsed.rom || null);
  const ram = parsed.snapshot && parsed.snapshot.ram;
  if (ram.length >= 0xC000) {
    emu.memory.pages[1].set(ram.subarray(0x0000, 0x4000));
    emu.memory.pages[2].set(ram.subarray(0x4000, 0x8000));
    emu.memory.pages[3].set(ram.subarray(0x8000, 0xC000));
  }

  // CPU
  emu.cpu = new Z80(emu.memory);
  const cpu = emu.cpu;
  cpu.PC = parsed.snapshot.registers.PC || 0x8000;
  cpu.SP = parsed.snapshot.registers.SP || 0xFF00;
  cpu.A = parsed.snapshot.registers.A || 0x00;
  cpu.B = parsed.snapshot.registers.B || 0x00;
  cpu.I = parsed.snapshot.registers.I || 0;
  cpu.R = parsed.snapshot.registers.R || 0;

  // Enable memory watch and deterministic logging
  emu._debugEnabled = true;
  if (typeof emu._enableMemoryWatch === 'function') emu._enableMemoryWatch();

  // Hook CPU debug callback to trace executed opcodes
  cpu.debugCallback = (opcode, pc) => {
    // Only log instructions in the loop range
    if (pc >= 0x8000 && pc < 0x8010) {
      console.log(`DBG OPCODE @PC=0x${pc.toString(16)} opcode=0x${opcode.toString(16)} HL=0x${cpu._getHL().toString(16)} B=${cpu.B} t=${cpu.tstates}`);
    }
  };

  // Clear previous logs
  emu.memory._memWrites = [];
  emu._portWrites = [];

  // Run a single frame
  const TPF = 69888;
  cpu.frameStartTstates = cpu.tstates;
  cpu.runFor(TPF);

  console.log('After frame run: cpu.tstates=', cpu.tstates);
  console.log('mem._memWrites length=', (emu.memory._memWrites||[]).length);
  console.log('mem._memWrites (first 10)=', (emu.memory._memWrites||[]).slice(0,20));
  console.log('emu._portWrites (first 20)=', (emu._portWrites||[]).slice(0,40));
}

main().catch(e => { console.error(e); process.exit(1); });