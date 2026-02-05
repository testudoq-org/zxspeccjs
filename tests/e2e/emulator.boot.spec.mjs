// @e2e @ui
import { test, expect } from '@playwright/test';
import fs from 'fs';

/* eslint-env browser, node */
/* eslint no-undef: "off" */

// High-level integration/diagnostic test for ZX Spectrum 48K boot sequence
// - Defensive probes into the running emulator in the page.

const BOOT_ADDRESSES = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
const KEY_OPCODE_BYTES = {
  DI: 0xF3,
  XOR_A: 0xAF,
  LD_DE: 0x11,
  JP: 0xC3,
};

// removed unused helper readDebug; prefer in-page helpers below

import { getRegsFromPage, pollPCSequence } from '../tests/_helpers/emulatorDebug.mjs';





async function readMemoryRegion(page, start, length){
  return page.evaluate(({ start, length }) => {
    const tryNames = ['__ZX_DEBUG__','__ZX_STATE__','emulator','spec','zx','z80','cpu'];
    for(const n of tryNames){
      const obj = window[n];
      if(!obj) continue;
      if(typeof obj.peekMemory === 'function'){
        try{ return obj.peekMemory(start, length); }catch(e){ void e; }
      }
      if(obj.memory && typeof obj.memory.slice === 'function'){
        try{ return obj.memory.slice(start, start+length); }catch(e){ void e; }
      }
    }
    return null;
  }, { start, length });
}
