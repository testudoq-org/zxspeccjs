// Diagnostic runner for tape-trap behavior
if (typeof global.window === 'undefined') global.window = { addEventListener: () => {}, dispatchEvent: () => {} };
if (typeof global.document === 'undefined') global.document = { getElementById: () => null };

import { Emulator } from '../../src/main.mjs';
import ROM_DATA from '../../src/roms/spec48.js';

(async function(){
  const canvasStub = { width:320, height:240, style:{}, getContext: () => ({ createImageData: () => ({data: new Uint8ClampedArray(320*240*4)}), putImageData: ()=>{}, fillRect: ()=>{} }), toDataURL: () => '' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  console.log('Created Emulator instance');
  await emu._createCore(null);
  console.log('Core created, memory present?', !!emu.memory);
  emu.memory.loadROM(ROM_DATA.bytes, 0);
  console.log('ROM loaded, memory[0]=', emu.memory.read(0));

  const payload = new Uint8Array([0xFF, 0x11, 0x22, 0x33, 0x99]);
  await emu.injectTape({ type: 'tap', blocks: [payload] }, { fileName: 'diag.tap', autoStart: false });
  console.log('_lastTap present?', !!emu._lastTap);

  const cpu = emu.cpu;
  cpu.IX = 0x8000; cpu.D = 0x00; cpu.E = 0x03;
  console.log('Before trap: mem@8000=', emu.memory.read(0x8000), 'PC=', cpu.PC, 'F=', cpu.F);

  const ok = await emu._trapTapeLoad();
  console.log('_trapTapeLoad returned', ok);
  console.log('After trap: mem@8000..2=', emu.memory.read(0x8000), emu.memory.read(0x8001), emu.memory.read(0x8002));
  console.log('CPU PC=', cpu.PC.toString(16), 'F=', cpu.F.toString(16));

  // Now test automatic detection via _trackOpcodeExecution
  // Reset memory area and cpu registers
  emu.memory.write(0x8000, 0x00); emu.memory.write(0x8001, 0x00); emu.memory.write(0x8002, 0x00);
  cpu.IX = 0x4000; cpu.D = 0x00; cpu.E = 0x03; cpu.F = cpu.F & ~0x01;
  await emu.injectTape({ type: 'tap', blocks: [payload] }, { fileName: 'diag2.tap', autoStart: false });
  console.log('Invoking _trackOpcodeExecution with PC=0x056b');
  emu._trackOpcodeExecution(0x00, 0x056b);
  // allow microtask for async trap handler
  await new Promise(r => setTimeout(r, 0));
  console.log('Auto-trap: mem@4000..2=', emu.memory.read(0x4000), emu.memory.read(0x4001), emu.memory.read(0x4002));
  console.log('Auto-trap: CPU PC=', cpu.PC.toString(16), 'F=', cpu.F.toString(16));
})();