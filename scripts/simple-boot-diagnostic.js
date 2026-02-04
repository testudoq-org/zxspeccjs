// Simple Boot & Keyboard Diagnostic for ZX Spectrum Emulator
// Paste this ENTIRE script into browser DevTools console and it will run automatically

(async function() {
  console.log('=== ZX Spectrum Boot & Keyboard Diagnostic ===\n');
  
  // 1. Check basic components exist
  console.log('1. CHECKING COMPONENTS:');
  const emu = window.emu || window.emulator;
  console.log('   emu:', emu ? 'FOUND' : 'NOT FOUND');
  console.log('   __ZX_DEBUG__:', window.__ZX_DEBUG__ ? 'FOUND' : 'NOT FOUND');
  console.log('   __TEST__:', window.__TEST__ ? 'FOUND' : 'NOT FOUND');
  
  if (!emu) {
    console.error('❌ CRITICAL: Emulator not found. Page may not have loaded correctly.');
    return;
  }
  
  // 2. Check emulator state
  console.log('\n2. EMULATOR STATE:');
  console.log('   cpu:', emu.cpu ? 'CREATED' : 'MISSING');
  console.log('   memory:', emu.memory ? 'CREATED' : 'MISSING');
  console.log('   ula:', emu.ula ? 'CREATED' : 'MISSING');
  console.log('   input:', emu.input ? 'CREATED' : 'MISSING');
  console.log('   _running:', emu._running);
  console.log('   canvas:', emu.canvas ? 'FOUND' : 'MISSING');
  
  if (!emu._running) {
    console.warn('⚠️  Emulator is NOT running! Attempting to start...');
    try {
      emu.start();
      await new Promise(r => setTimeout(r, 100));
      console.log('   After start(), _running:', emu._running);
    } catch (e) {
      console.error('   Failed to start:', e);
    }
  }
  
  // 3. Check CPU state
  console.log('\n3. CPU STATE:');
  if (emu.cpu) {
    console.log('   PC:', '0x' + emu.cpu.PC.toString(16).padStart(4, '0'));
    console.log('   SP:', '0x' + emu.cpu.SP.toString(16).padStart(4, '0'));
    console.log('   IFF1 (interrupts):', emu.cpu.IFF1);
    console.log('   IM (interrupt mode):', emu.cpu.IM);
    console.log('   tstates:', emu.cpu.tstates);
  }
  
  // 4. Check ROM loading
  console.log('\n4. ROM STATE:');
  if (emu.memory) {
    const rom0 = emu.memory.read(0x0000);
    const rom1 = emu.memory.read(0x0001);
    const rom2 = emu.memory.read(0x0002);
    console.log('   ROM[0x0000-0x0002]:', 
      '0x' + rom0.toString(16).padStart(2, '0'),
      '0x' + rom1.toString(16).padStart(2, '0'),
      '0x' + rom2.toString(16).padStart(2, '0'));
    console.log('   Expected ZX48 ROM start: 0xF3 0xAF 0x11 (DI; XOR A; LD DE,...)');
    
    if (rom0 === 0xF3 && rom1 === 0xAF) {
      console.log('   ✓ ROM appears to be loaded correctly');
    } else if (rom0 === 0x00 && rom1 === 0x00 && rom2 === 0x00) {
      console.error('   ❌ ROM is all zeros - NOT LOADED!');
    } else {
      console.warn('   ⚠️  ROM start bytes unexpected');
    }
  }
  
  // 5. Check system variables (to see if boot has progressed)
  console.log('\n5. ZX SYSTEM VARIABLES:');
  if (emu.memory) {
    const chars_lo = emu.memory.read(0x5C36);
    const chars_hi = emu.memory.read(0x5C37);
    const chars = (chars_hi << 8) | chars_lo;
    console.log('   CHARS (0x5C36):', '0x' + chars.toString(16).padStart(4, '0'), 
      chars === 0x3C00 ? '(ROM charset - normal)' : 
      chars === 0 ? '(NOT SET - boot incomplete!)' : '');
    
    const flags = emu.memory.read(0x5C3A); // FLAGS
    console.log('   FLAGS (0x5C3A):', '0x' + flags.toString(16).padStart(2, '0'));
    
    const mode = emu.memory.read(0x5C41); // MODE
    console.log('   MODE (0x5C41):', mode, mode === 0 ? '(K mode - keyboard)' : '');
    
    const lastk = emu.memory.read(0x5C08); // LAST_K  
    console.log('   LAST_K (0x5C08):', '0x' + lastk.toString(16).padStart(2, '0'));
  }
  
  // 6. Check if boot completed - look at tstates
  console.log('\n6. BOOT PROGRESS:');
  const framesRun = emu.cpu ? Math.floor(emu.cpu.tstates / 69888) : 0;
  console.log('   Frames executed:', framesRun);
  console.log('   Boot needs ~250 frames for copyright message');
  
  if (framesRun < 10) {
    console.error('   ❌ Almost no frames executed - CPU may be stuck');
  } else if (framesRun < 250) {
    console.warn('   ⚠️  Boot may not be complete yet');
  } else {
    console.log('   ✓ Sufficient frames for boot');
  }
  
  // 7. Check display memory
  console.log('\n7. DISPLAY MEMORY:');
  if (emu.memory) {
    // Check if any display memory has been written
    let nonZeroPixels = 0;
    let nonZeroAttrs = 0;
    
    for (let i = 0x4000; i < 0x5800; i++) {
      if (emu.memory.read(i) !== 0) nonZeroPixels++;
    }
    for (let i = 0x5800; i < 0x5B00; i++) {
      if (emu.memory.read(i) !== 0x38) nonZeroAttrs++; // 0x38 = white paper, black ink
    }
    
    console.log('   Non-zero pixel bytes (0x4000-0x57FF):', nonZeroPixels);
    console.log('   Non-default attr bytes (0x5800-0x5AFF):', nonZeroAttrs);
    
    if (nonZeroPixels === 0) {
      console.warn('   ⚠️  Display memory appears empty');
    }
  }
  
  // 8. Check keyboard matrix
  console.log('\n8. KEYBOARD STATE:');
  if (emu.input && emu.input.matrix) {
    const matrixHex = Array.from(emu.input.matrix).map(v => '0x' + v.toString(16).padStart(2, '0'));
    console.log('   input.matrix:', matrixHex.join(' '));
    const allFF = emu.input.matrix.every(v => v === 0xFF);
    console.log('   All keys released:', allFF ? 'YES' : 'NO (some key pressed)');
  }
  if (emu.ula && emu.ula.keyMatrix) {
    const ulaMatrixHex = Array.from(emu.ula.keyMatrix).map(v => '0x' + v.toString(16).padStart(2, '0'));
    console.log('   ula.keyMatrix:', ulaMatrixHex.join(' '));
  }
  
  // 9. Check canvas
  console.log('\n9. CANVAS:');
  if (emu.canvas) {
    console.log('   Canvas size:', emu.canvas.width, 'x', emu.canvas.height);
    console.log('   Canvas focused:', document.activeElement === emu.canvas);
    console.log('   Canvas tabIndex:', emu.canvas.tabIndex);
  }
  
  // 10. Attempt simple key test
  console.log('\n10. KEY TEST (pressing L for 500ms):');
  if (emu.input && emu._running) {
    const initialLastK = emu.memory ? emu.memory.read(0x5C08) : null;
    
    emu.input.pressKey('L');
    if (emu._applyInputToULA) emu._applyInputToULA();
    
    console.log('   Key pressed, waiting 500ms...');
    await new Promise(r => setTimeout(r, 500));
    
    const finalLastK = emu.memory ? emu.memory.read(0x5C08) : null;
    
    emu.input.releaseKey('L');
    if (emu._applyInputToULA) emu._applyInputToULA();
    
    console.log('   LAST_K before:', initialLastK !== null ? '0x' + initialLastK.toString(16) : 'N/A');
    console.log('   LAST_K after:', finalLastK !== null ? '0x' + finalLastK.toString(16) : 'N/A');
    
    if (initialLastK !== finalLastK) {
      console.log('   ✓ ROM detected key press!');
    } else {
      console.warn('   ⚠️  LAST_K unchanged - ROM may not have scanned keyboard');
    }
  }
  
  console.log('\n=== DIAGNOSTIC COMPLETE ===');
  console.log('If boot incomplete (frames < 250, CHARS=0), the issue is ROM execution, not keyboard.');
  console.log('If boot complete but no BASIC prompt, check interrupts (IFF1) and ULA rendering.');
  
})();
