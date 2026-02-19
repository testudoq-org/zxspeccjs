#!/usr/bin/env node
import fs from 'fs';
import { Loader } from '../src/loader.mjs';
import { Emulator } from '../src/main.mjs';

const URL = 'https://cors.archive.org/cors/zx_Jetpac_1983_Ultimate_Play_The_Game_a_16K/Jetpac_1983_Ultimate_Play_The_Game_a_16K.z80';

function toHex(b){return '0x'+b.toString(16).padStart(4,'0');}
function hex8(b){return b.toString(16).padStart(2,'0');}

async function main(){
  const res = await fetch(URL);
  if(!res.ok) throw new Error('fetch failed');
  const buf = new Uint8Array(await res.arrayBuffer());
  const parsed = Loader.parseZ80(buf.buffer);
  const emu = new Emulator({ canvas: { getContext: ()=>({}) } });
  if(!emu.memory) await emu._createCore(null);
  // apply ram pages from snapshot
  const ram = parsed.snapshot.ram;
  emu.memory.pages[1].set(ram.subarray(0x0000,0x4000));
  emu.memory.pages[2].set(ram.subarray(0x4000,0x8000));
  emu.memory.pages[3].set(ram.subarray(0x8000,0xC000));
  if(typeof emu.memory._syncFlatRamFromBanks==='function') emu.memory._syncFlatRamFromBanks();

  const addr = 0x714c;
  const bytes = [];
  for(let i=0;i<64;i++) bytes.push(emu.memory.read((addr+i)&0xffff));
  const out = 'Dump @ 0x'+addr.toString(16)+': ' + bytes.map(hex8).join(' ')+"\n";
  await fs.promises.writeFile('traces/dump_0x714c.txt', out);
  console.log('Wrote traces/dump_0x714c.txt');
}

main().catch(e=>{ console.error(e); process.exit(1); });