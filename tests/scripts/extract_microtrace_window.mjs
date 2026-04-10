import fs from 'fs';
import path from 'path';
import { Emulator } from '../../src/main.mjs';
import { Z80 } from '../../src/z80.mjs';

// Usage: node extract_microtrace_window.mjs <out.json> <frameIndex> <tailEvents>
(async function main() {
  const out = process.argv[2] || 'microtrace-window.json';
  const frameIndex = Number(process.argv[3] || 0);
  const tail = Number(process.argv[4] || 200);

  const canvasStub = { width: 320, height: 240, style: {}, getContext: () => ({ createImageData: () => ({ data: new Uint8ClampedArray(320 * 240 * 4) }), putImageData: () => {}, fillRect: () => {} }) };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if (!emu.memory) await emu._createCore(null);

  // Use parsed Jetpac snapshot if available for deterministic start
  const parsed = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');
  if (fs.existsSync(parsed)) {
    const json = JSON.parse(fs.readFileSync(parsed, 'utf8'));
    await emu.applySnapshot(json, { autoStart: false, fileName: 'parsed_jetpac_snapshot' });
  }

  emu.cpu.enableMicroTrace();

  // warm several frames so we land in a stable state
  for (let i = 0; i < Math.max(3, frameIndex); i++) emu._runCpuForFrame();

  // capture microLog for the requested frame (slice the tail)
  const micro = emu.cpu.getMicroLog() || [];
  const payload = micro.slice(-tail);

  fs.writeFileSync(out, JSON.stringify({ meta: { frame: frameIndex, captured: payload.length }, micro: payload }, null, 2));
  console.log('Wrote microtrace window to', out);
})();