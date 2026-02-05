/**
 * Keyboard Input Diagnostic Script
 * Run in browser console after emulator is loaded and running.
 * 
 * Usage: Paste this entire script in browser DevTools console
 * or run: import('./scripts/debug-keyboard-input.mjs')
 */

/* eslint-env browser */
/* global window, console, setTimeout */

(function debugKeyboardInput() {
  console.log('=== ZX Spectrum Keyboard Input Diagnostic ===\n');
  
  const emu = window.emulator || window.emu;
  if (!emu) {
    console.error('❌ Emulator not found. Make sure it is running.');
    return;
  }
  
  // 1. Check emulator components
  console.log('1. Component Check:');
  console.log(`   - Emulator: ${emu ? '✅' : '❌'}`);
  console.log(`   - CPU: ${emu.cpu ? '✅' : '❌'}`);
  console.log(`   - Memory: ${emu.memory ? '✅' : '❌'}`);
  console.log(`   - ULA: ${emu.ula ? '✅' : '❌'}`);
  console.log(`   - Input: ${emu.input ? '✅' : '❌'}`);
  console.log(`   - CPU.io adapter: ${emu.cpu && emu.cpu.io ? '✅' : '❌'}`);
  
  // 2. Check ULA keyMatrix state
  console.log('\n2. ULA Key Matrix (should be all 0xFF when no keys pressed):');
  if (emu.ula && emu.ula.keyMatrix) {
    for (let row = 0; row < 8; row++) {
      const val = emu.ula.keyMatrix[row];
      console.log(`   Row ${row}: 0x${val.toString(16).padStart(2, '0')} ${val === 0xff ? '(no keys)' : '⚠️ KEY PRESSED'}`);
    }
  } else {
    console.error('   ❌ ULA keyMatrix not found!');
  }
  
  // 3. Check Input matrix state
  console.log('\n3. Input Matrix:');
  if (emu.input && emu.input.matrix) {
    for (let row = 0; row < 8; row++) {
      const val = emu.input.matrix[row];
      console.log(`   Row ${row}: 0x${val.toString(16).padStart(2, '0')} ${val === 0x1f ? '(no keys)' : '⚠️ KEY PRESSED'}`);
    }
  } else {
    console.error('   ❌ Input matrix not found!');
  }
  
  // 4. Test programmatic key press
  console.log('\n4. Testing programmatic key press (L key):');
  
  // L is in Row 6, bit 1 (mask 0x02) - position 1 in ['enter', 'l', 'k', 'j', 'h']
  const testKey = 'l';
  const expectedRow = 6;
  const expectedMask = 0x02;
  
  // Capture initial state
  const beforeULA = emu.ula?.keyMatrix ? emu.ula.keyMatrix[expectedRow] : null;
  const beforeInput = emu.input?.matrix ? emu.input.matrix[expectedRow] : null;
  
  // Press via Input.pressKey
  if (emu.input && typeof emu.input.pressKey === 'function') {
    const result = emu.input.pressKey(testKey);
    console.log(`   pressKey('${testKey}') returned: ${result}`);
  } else {
    console.error('   ❌ Input.pressKey not available');
    return;
  }
  
  // Apply to ULA
  if (typeof emu._applyInputToULA === 'function') {
    emu._applyInputToULA();
    console.log('   _applyInputToULA() called');
  }
  
  // Check state after press
  const afterInput = emu.input?.matrix ? emu.input.matrix[expectedRow] : null;
  const afterULA = emu.ula?.keyMatrix ? emu.ula.keyMatrix[expectedRow] : null;
  
  console.log(`\n   Input Matrix Row ${expectedRow}:`);
  console.log(`     Before: 0x${beforeInput?.toString(16)} (${beforeInput?.toString(2).padStart(5,'0')})`);
  console.log(`     After:  0x${afterInput?.toString(16)} (${afterInput?.toString(2).padStart(5,'0')})`);
  console.log(`     Expected bit ${1} (mask 0x02) to be cleared`);
  console.log(`     Bit 1 cleared: ${((afterInput & expectedMask) === 0) ? '✅' : '❌'}`);
  
  console.log(`\n   ULA KeyMatrix Row ${expectedRow}:`);
  console.log(`     Before: 0x${beforeULA?.toString(16)}`);
  console.log(`     After:  0x${afterULA?.toString(16)}`);
  console.log(`     Bit 1 cleared: ${((afterULA & expectedMask) === 0) ? '✅' : '❌'}`);
  
  // 5. Test ULA readPort directly
  console.log('\n5. Testing ULA readPort directly:');
  
  // Port 0xBFFE reads Row 6 (A14=0)
  const testPort = 0xBFFE;
  
  if (emu.ula && typeof emu.ula.readPort === 'function') {
    const portResult = emu.ula.readPort(testPort);
    console.log(`   ula.readPort(0x${testPort.toString(16)}) = 0x${portResult.toString(16)}`);
    console.log(`   Binary: ${portResult.toString(2).padStart(8, '0')}`);
    console.log(`   Bit 1 (L key) is ${((portResult & 0x02) === 0) ? '0 (pressed) ✅' : '1 (not pressed) ❌'}`);
    
    // Verify the row selection logic
    const highByte = (testPort >> 8) & 0xff;
    console.log(`\n   Port high byte: 0x${highByte.toString(16)} = ${highByte.toString(2).padStart(8, '0')}`);
    for (let row = 0; row < 8; row++) {
      const selected = ((highByte >> row) & 1) === 0;
      console.log(`     Row ${row} selected: ${selected ? 'YES' : 'no'}`);
    }
  }
  
  // 6. Test CPU IO adapter
  console.log('\n6. Testing CPU IO adapter:');
  if (emu.cpu && emu.cpu.io && typeof emu.cpu.io.read === 'function') {
    const ioResult = emu.cpu.io.read(testPort);
    console.log(`   cpu.io.read(0x${testPort.toString(16)}) = 0x${ioResult.toString(16)}`);
    console.log(`   Bit 1 (L key) is ${((ioResult & 0x02) === 0) ? '0 (pressed) ✅' : '1 (not pressed) ❌'}`);
  } else {
    console.error('   ❌ CPU IO adapter not found!');
  }
  
  // 7. Release the key
  if (emu.input && typeof emu.input.releaseKey === 'function') {
    emu.input.releaseKey(testKey);
    console.log(`\n7. Released '${testKey}' key`);
  }
  
  // 8. Check __TEST__ diagnostics
  console.log('\n8. Test Hook Diagnostics:');
  if (window.__TEST__) {
    console.log(`   keyEvents: ${window.__TEST__.keyEvents?.length || 0} recorded`);
    console.log(`   portReads: ${window.__TEST__.portReads?.length || 0} recorded`);
    console.log(`   lastAppliedKeyMatrix: ${window.__TEST__.lastAppliedKeyMatrix ? 'present' : 'not set'}`);
    
    // Show recent port reads to 0xFE
    const recentFEReads = (window.__TEST__.portReads || [])
      .filter(p => (p.port & 0xff) === 0xfe)
      .slice(-5);
    if (recentFEReads.length > 0) {
      console.log('\n   Recent port 0xFE reads:');
      recentFEReads.forEach(p => {
        console.log(`     port=0x${p.port.toString(16)}, result=0x${p.result.toString(16)}`);
      });
    }
  }
  
  // 9. Summary and recommendations
  console.log('\n=== DIAGNOSIS SUMMARY ===');
  
  const inputOK = afterInput !== null && ((afterInput & expectedMask) === 0);
  const ulaOK = afterULA !== null && ((afterULA & expectedMask) === 0);
  const ioOK = emu.cpu?.io?.read && (emu.cpu.io.read(testPort) & expectedMask) === 0;
  
  if (inputOK && ulaOK && ioOK) {
    console.log('✅ All checks passed - keyboard input chain is working');
    console.log('\nIf typing still does not work, possible causes:');
    console.log('  1. Canvas does not have focus (click on canvas)');
    console.log('  2. ROM is not polling keyboard (check CPU is running)');
    console.log('  3. Interrupts are disabled (ROM keyboard scan happens in interrupt handler)');
    console.log('  4. Key is pressed too briefly for ROM to detect');
  } else {
    if (!inputOK) console.log('❌ Input matrix not updating on key press');
    if (!ulaOK) console.log('❌ ULA keyMatrix not updating (check _applyInputToULA)');
    if (!ioOK) console.log('❌ CPU IO read not returning key state');
  }
  
  // Export for __ZX_DEBUG__
  window.__ZX_DEBUG__ = window.__ZX_DEBUG__ || {};
  window.__ZX_DEBUG__.pressKey = (key) => {
    if (emu.input) {
      emu.input.pressKey(key);
      if (typeof emu._applyInputToULA === 'function') emu._applyInputToULA();
      console.log(`Pressed '${key}' - hold for 100ms then call releaseKey('${key}')`);
    }
  };
  window.__ZX_DEBUG__.releaseKey = (key) => {
    if (emu.input) {
      emu.input.releaseKey(key);
      if (typeof emu._applyInputToULA === 'function') emu._applyInputToULA();
      console.log(`Released '${key}'`);
    }
  };
  window.__ZX_DEBUG__.typeKey = async (key, holdMs = 100) => {
    window.__ZX_DEBUG__.pressKey(key);
    await new Promise(r => setTimeout(r, holdMs));
    window.__ZX_DEBUG__.releaseKey(key);
  };
  
  console.log('\n=== Debug Functions Added to window.__ZX_DEBUG__ ===');
  console.log('  pressKey(key)      - Press a key');
  console.log('  releaseKey(key)    - Release a key');
  console.log('  typeKey(key, ms)   - Press and release after ms delay');
  console.log('\nExample: await __ZX_DEBUG__.typeKey("l", 100)');
})();
