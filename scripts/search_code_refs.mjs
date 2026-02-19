import { Loader } from '../src/loader.mjs';
import { Emulator } from '../src/main.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
(async ()=>{
  // DOM stubs
  if (typeof globalThis.window === 'undefined') globalThis.window = { addEventListener: ()=>{}, dispatchEvent: ()=>{}, __TEST__: {} };
  if (typeof globalThis.document === 'undefined') globalThis.document = { getElementById: ()=>null };
  const res = await fetch(URL);
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  const canvasStub = { width:320, height:240, style: {}, getContext: ()=>({ createImageData: ()=>({ data: new Uint8ClampedArray(320*240*4) }), putImageData: ()=>{}, fillRect: ()=>{}, imageSmoothingEnabled:false }), toDataURL: ()=>'' };
  const emu = new Emulator({ canvas: canvasStub, statusEl: {} });
  if(!emu.memory) await emu._createCore(null);
  const ram = parsed.snapshot.ram;
  emu.memory.pages[1].set(ram.subarray(0x0000,0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000,0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000,0xC000));
  if(typeof emu.memory._syncFlatRamFromBanks==='function') emu.memory._syncFlatRamFromBanks();

  const searchBytes = (pattern) => {
    const hits = [];
    for (let addr = 0x4000; addr < 0xC000 - pattern.length; addr++) {
      let ok = true;
      for (let i = 0; i < pattern.length; i++) if (emu.memory.read(addr + i) !== pattern[i]) { ok = false; break; }
      if (ok) hits.push(addr);
    }
    return hits;
  };

  const dbfe = searchBytes([0xDB, 0xFE]);
  const call29c1 = searchBytes([0xCD, 0xC1, 0x29]);
  const out = [];
  out.push('DB FE hits (sample): ' + dbfe.slice(0,20).map(x => '0x'+x.toString(16)).join(', '));
  out.push('CALL 0x29C1 hits: ' + call29c1.map(x => '0x'+x.toString(16)).join(', '));
  await fs.promises.writeFile('traces/search_code_refs.out.txt', out.join('\n'));
  console.log('Wrote traces/search_code_refs.out.txt');
})();