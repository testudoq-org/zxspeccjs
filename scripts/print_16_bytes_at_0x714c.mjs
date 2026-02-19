import { Loader } from '../src/loader.mjs';
import { Emulator } from '../src/main.mjs';
import fs from 'fs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';
(async ()=>{
  const res = await fetch(URL);
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  const emu = new Emulator({ canvas: { getContext: ()=>({}) } });
  if(!emu.memory) await emu._createCore(null);
  const ram = parsed.snapshot.ram;
  emu.memory.pages[1].set(ram.subarray(0x0000,0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000,0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000,0xC000));
  if(typeof emu.memory._syncFlatRamFromBanks==='function') emu.memory._syncFlatRamFromBanks();
  const addr = 0x714c;
  const bytes = [];
  for(let i=0;i<16;i++) bytes.push(emu.memory.read((addr+i)&0xffff));
  console.log('0x714c: ', bytes.map(b=>b.toString(16).padStart(2,'0')).join(' '));
})();
