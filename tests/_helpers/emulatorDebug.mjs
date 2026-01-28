/* eslint-env browser, node */
/* eslint no-undef: "off" */
export async function getStateFromPage(page){
  return page.evaluate(() => {
    const tryNames = ['__ZX_DEBUG__','__ZX_STATE__','emulator','spec','zx','z80','cpu'];
    for(const n of tryNames){
      const obj = window[n];
      if(!obj) continue;
      if(typeof obj.getRegisters === 'function'){
        try{ const r = obj.getRegisters(); return { regs: r, pc: r.pc ?? r.PC }; }catch(e){ void e; }
      }
      if(obj.registers) return { regs: obj.registers, pc: obj.registers.pc ?? obj.registers.PC };
      if(obj.cpu && obj.cpu.getRegisters) { try{ const r = obj.cpu.getRegisters(); return { regs: r, pc: r.pc ?? r.PC }; }catch(e){ void e; } }
    }
    if(window.__LAST_PC__ !== undefined) return { pc: window.__LAST_PC__ };
    if(window.__PC_WATCHER__ && Array.isArray(window.__PC_WATCHER__.history)){
      const last = window.__PC_WATCHER__.history[window.__PC_WATCHER__.history.length-1];
      return { pc: last };
    }
    return null;
  });
}

export async function getRegsFromPage(page){
  return page.evaluate(() => {
    const tryNames = ['__ZX_DEBUG__','__ZX_STATE__','emulator','spec','zx','z80','cpu'];
    for(const n of tryNames){
      const obj = window[n];
      if(!obj) continue;
      if(typeof obj.getRegisters === 'function'){
        try{ return obj.getRegisters(); }catch(e){ void e; }
      }
      if(obj.registers) return obj.registers;
    }
    return null;
  });
}

export async function checkProgVisited(page, target){
  try{
    const prog = await page.evaluate(() => {
      if(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.getBootProgress === 'function'){
        try{ return window.__ZX_DEBUG__.getBootProgress(); }catch(e){ void e; return null; }
      }
      return null;
    });
    if(prog && Array.isArray(prog.visited) && prog.visited.includes(target)){
      const regs = await getRegsFromPage(page).catch(e => { void e; return null; });
      return regs;
    }
  }catch(e){ void e; }
  return null;
}

export async function getPCWatcherHistory(page){
  try{
    return await page.evaluate(() => (window.__PC_WATCHER__ && Array.isArray(window.__PC_WATCHER__.history)) ? window.__PC_WATCHER__.history.slice() : null);
  }catch(e){ void e; }
  return null;
}

export async function checkStateForTarget(page, state, target){
  if(!state || typeof state.pc !== 'number') return null;
  const pc = state.pc;
  if(pc === target || pc === target + 1){
    const regs = state.regs || await getRegsFromPage(page).catch(e => { void e; return null; });
    return { pc, regs };
  }
  const regsFromProg = await checkProgVisited(page, target).catch(e => { void e; return null; });
  if(regsFromProg !== null) return { pc: target, regs: regsFromProg };
  return null;
}

export async function checkHistoryForTarget(page, hist, target){
  if(!hist || !hist.length) return null;
  const found = hist.some(v => v === target || v === target + 1);
  if(!found) return null;
  const regs = await getRegsFromPage(page).catch(e => { void e; return null; });
  return { pc: target, regs };
}

export async function pollPCSequence(page, addresses, opts = {}){
  const { timeout = 45000, pollInterval = 100, outSamples = null } = opts;
  const results = [];
  const start = Date.now();
  let nextIndex = 0;
  const samples = [];

  while(Date.now() - start < timeout){
    if (page.isClosed && page.isClosed()) break;
    let state = null;
    let hist = null;
    try{
      state = await getStateFromPage(page);
    }catch(e){
      await new Promise(r => setTimeout(r, pollInterval));
      continue;
    }

    const target = addresses[nextIndex];
    const stateMatch = await checkStateForTarget(page, state, target);
    if(stateMatch){
      results.push({ address: target, pc: stateMatch.pc, regs: stateMatch.regs });
      nextIndex++; if(nextIndex >= addresses.length) break;
    }

    try{ hist = await getPCWatcherHistory(page); }catch(e){ void e; hist = null; }
    const histMatch = await checkHistoryForTarget(page, hist, target);
    if(histMatch){
      results.push({ address: target, pc: histMatch.pc, regs: histMatch.regs });
      nextIndex++; if(nextIndex >= addresses.length) break;
    }

    // record a diagnostic sample for later analysis
    try{ samples.push({ t: Date.now() - start, state: state || null, histLen: hist ? hist.length : 0, nextIndex }); }catch(e){ void e; }
    await new Promise(r => setTimeout(r, pollInterval));
  }

  if(outSamples && Array.isArray(outSamples)) outSamples.push(...samples);
  return results;
}
