/**
 * Full Keyboard Diagnostic Script for ZX Spectrum Emulator
 * 
 * Paste this entire script into browser console after the emulator has booted
 * to BASIC prompt (> cursor visible).
 * 
 * Tests the complete keyboard path from pressKey → matrix → ULA → ROM detection
 */

/* eslint-env browser */
/* global window, console, setTimeout */

(async function fullKeyboardDiagnostic() {
  console.log('%c=== ZX Spectrum Full Keyboard Diagnostic ===', 'color: #00ff00; font-weight: bold');
  console.log('Testing complete keyboard path: pressKey → matrix → ULA → ROM\n');

  // ==================== PREREQUISITES ====================
  const emu = window.emulator || window.emu;
  if (!emu) {
    console.error('❌ Emulator not found. Make sure it is running.');
    return { success: false, error: 'no_emulator' };
  }

  if (!window.__ZX_DEBUG__) {
    console.error('❌ __ZX_DEBUG__ not found. Debug API not initialized.');
    return { success: false, error: 'no_debug_api' };
  }

  console.log('✓ Prerequisites check passed\n');

  // ==================== 1. COMPONENT CHECK ====================
  console.log('%c1. Component Verification', 'color: #ffff00; font-weight: bold');
  const components = {
    cpu: !!emu.cpu,
    memory: !!emu.memory,
    ula: !!emu.ula,
    input: !!emu.input,
    ioAdapter: !!(emu.cpu && emu.cpu.io),
    keyMatrix: !!(emu.ula && emu.ula.keyMatrix),
    inputMatrix: !!(emu.input && emu.input.matrix),
    applyInputToULA: typeof emu._applyInputToULA === 'function'
  };

  Object.entries(components).forEach(([name, ok]) => {
    console.log(`   ${ok ? '✅' : '❌'} ${name}`);
  });

  if (!Object.values(components).every(Boolean)) {
    console.error('\n❌ Missing critical components. Cannot proceed.');
    return { success: false, error: 'missing_components', components };
  }

  // ==================== 2. INITIAL STATE ====================
  console.log('\n%c2. Initial State (no keys pressed)', 'color: #ffff00; font-weight: bold');
  
  const initialInput = Array.from(emu.input.matrix);
  const initialULA = Array.from(emu.ula.keyMatrix);
  
  console.log('   Input matrix:', initialInput.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  console.log('   ULA keyMatrix:', initialULA.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  
  const inputAllClear = initialInput.every(v => v === 0x1f);
  const ulaAllClear = initialULA.every(v => v === 0xff);
  console.log(`   Input clear: ${inputAllClear ? '✅' : '❌'} (expect all 0x1f)`);
  console.log(`   ULA clear: ${ulaAllClear ? '✅' : '❌'} (expect all 0xff)`);

  // ==================== 3. TEST L KEY PRESS ====================
  console.log('\n%c3. Testing L Key Press', 'color: #ffff00; font-weight: bold');
  console.log('   L key position: Row 6 (0xBFFE), Bit 1 (mask 0x02)');
  
  // Press L key
  const pressResult = window.__ZX_DEBUG__.pressKey('l');
  console.log(`   pressKey('l') returned: ${pressResult}`);
  
  // Check matrices immediately after press
  const afterPressInput = Array.from(emu.input.matrix);
  const afterPressULA = Array.from(emu.ula.keyMatrix);
  
  console.log('\n   After press:');
  console.log('   Input matrix:', afterPressInput.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  console.log('   ULA keyMatrix:', afterPressULA.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  
  const inputRow6OK = (afterPressInput[6] & 0x02) === 0;
  const ulaRow6OK = (afterPressULA[6] & 0x02) === 0;
  
  console.log(`   Input row 6 bit 1 cleared: ${inputRow6OK ? '✅' : '❌'} (value: 0x${afterPressInput[6].toString(16)})`);
  console.log(`   ULA row 6 bit 1 cleared: ${ulaRow6OK ? '✅' : '❌'} (value: 0x${afterPressULA[6].toString(16)})`);

  // ==================== 4. TEST ULA.readPort ====================
  console.log('\n%c4. Testing ULA.readPort(0xBFFE)', 'color: #ffff00; font-weight: bold');
  
  const portResult = emu.ula.readPort(0xBFFE);
  console.log(`   ula.readPort(0xBFFE) = 0x${portResult.toString(16)}`);
  console.log(`   Binary: ${portResult.toString(2).padStart(8, '0')}`);
  
  const portBit1OK = (portResult & 0x02) === 0;
  const portUpperOK = (portResult & 0xe0) === 0xe0;
  
  console.log(`   Bit 1 (L key) cleared: ${portBit1OK ? '✅' : '❌'}`);
  console.log(`   Upper bits (5-7) set: ${portUpperOK ? '✅' : '❌'}`);

  // ==================== 5. TEST CPU IO ADAPTER ====================
  console.log('\n%c5. Testing CPU IO Adapter', 'color: #ffff00; font-weight: bold');
  
  if (emu.cpu && emu.cpu.io && typeof emu.cpu.io.read === 'function') {
    const ioResult = emu.cpu.io.read(0xBFFE);
    console.log(`   cpu.io.read(0xBFFE) = 0x${ioResult.toString(16)}`);
    console.log(`   Matches ULA result: ${ioResult === portResult ? '✅' : '❌'}`);
  } else {
    console.log('   ❌ CPU IO adapter not available');
  }

  // ==================== 6. HOLD AND POLL ====================
  console.log('\n%c6. Hold Key and Poll (800ms)', 'color: #ffff00; font-weight: bold');
  console.log('   Holding L key for ROM polling...');
  
  const pollResults = [];
  const startTime = Date.now();
  
  while (Date.now() - startTime < 800) {
    const poll = emu.ula.readPort(0xBFFE);
    pollResults.push({
      t: Date.now() - startTime,
      result: poll,
      keyDetected: (poll & 0x02) === 0
    });
    await new Promise(r => setTimeout(r, 50));
  }
  
  const keyDetectedCount = pollResults.filter(p => p.keyDetected).length;
  console.log(`   Polled ${pollResults.length} times over 800ms`);
  console.log(`   Key detected in ${keyDetectedCount}/${pollResults.length} polls (${(keyDetectedCount/pollResults.length*100).toFixed(0)}%)`);
  
  if (keyDetectedCount === pollResults.length) {
    console.log('   ✅ Key consistently detected during hold');
  } else if (keyDetectedCount > 0) {
    console.log('   ⚠️ Key intermittently detected (timing issue?)');
  } else {
    console.log('   ❌ Key never detected during hold');
  }

  // ==================== 7. RELEASE KEY ====================
  console.log('\n%c7. Release Key', 'color: #ffff00; font-weight: bold');
  
  window.__ZX_DEBUG__.releaseKey('l');
  console.log('   Released L key');
  
  const afterReleaseInput = Array.from(emu.input.matrix);
  const afterReleaseULA = Array.from(emu.ula.keyMatrix);
  const afterReleasePort = emu.ula.readPort(0xBFFE);
  
  console.log('   Input matrix:', afterReleaseInput.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  console.log('   ULA keyMatrix:', afterReleaseULA.map(v => '0x' + v.toString(16).padStart(2, '0')).join(', '));
  console.log(`   ula.readPort(0xBFFE) = 0x${afterReleasePort.toString(16)}`);
  
  const releasedOK = (afterReleasePort & 0x02) !== 0;
  console.log(`   Key released properly: ${releasedOK ? '✅' : '❌'}`);

  // ==================== 8. CHECK ROM MODE ====================
  console.log('\n%c8. ROM/System State', 'color: #ffff00; font-weight: bold');
  
  try {
    // Check FLAGS system variable (0x5C3A)
    const flags = emu.peekMemory ? emu.peekMemory(0x5C3A, 1)[0] : emu.memory.read(0x5C3A);
    console.log(`   FLAGS (0x5C3A) = 0x${flags.toString(16)} (bit 5 = ${(flags & 0x20) ? 'K' : 'L'} mode)`);
    
    // Check LAST_K (0x5C08) - last key pressed
    const lastK = emu.peekMemory ? emu.peekMemory(0x5C08, 1)[0] : emu.memory.read(0x5C08);
    console.log(`   LAST_K (0x5C08) = 0x${lastK.toString(16)} (last key code)`);
    
    // Check ERR_NR (0x5C3A) - error number
    const errNr = emu.peekMemory ? emu.peekMemory(0x5C3A, 1)[0] : emu.memory.read(0x5C3A);
    console.log(`   ERR_NR (0x5C3A) = ${errNr} (error state)`);
    
    // Check interrupt status
    console.log(`   Interrupts: IFF1=${emu.cpu.IFF1}, IFF2=${emu.cpu.IFF2}, IM=${emu.cpu.IM}`);
    
    if (!emu.cpu.IFF1) {
      console.log('   ⚠️ Interrupts disabled - ROM keyboard scan may not run!');
    }
  } catch (e) {
    console.log('   Could not read system variables:', e.message);
  }

  // ==================== 9. KEYBOARD DEBUG STATS ====================
  console.log('\n%c9. Keyboard Debug Statistics', 'color: #ffff00; font-weight: bold');
  
  if (window.__KEYBOARD_DEBUG__) {
    console.log('   Port read stats:', {
      totalReads: window.__KEYBOARD_DEBUG__.reads,
      lastResult: '0x' + (window.__KEYBOARD_DEBUG__.lastResult || 0).toString(16),
      lastKeyDetected: window.__KEYBOARD_DEBUG__.lastKeyDetected
    });
  } else {
    console.log('   __KEYBOARD_DEBUG__ not available');
  }

  // ==================== SUMMARY ====================
  console.log('\n%c=== DIAGNOSTIC SUMMARY ===', 'color: #00ff00; font-weight: bold');
  
  const allPassed = inputRow6OK && ulaRow6OK && portBit1OK && portUpperOK && releasedOK && keyDetectedCount > 0;
  
  if (allPassed) {
    console.log('%c✅ All keyboard path checks PASSED', 'color: #00ff00; font-weight: bold');
    console.log('\nIf text still does not appear on screen, check:');
    console.log('  1. Canvas has focus (click on canvas)');
    console.log('  2. CPU is running (check status indicator)');
    console.log('  3. Interrupts are enabled (IFF1 should be true)');
    console.log('  4. ROM is in correct mode (try pressing keys at BASIC prompt)');
    console.log('\nTry: await __ZX_DEBUG__.pressAndHold("l", 1000)');
  } else {
    console.log('%c❌ Some checks FAILED', 'color: #ff0000; font-weight: bold');
    if (!inputRow6OK) console.log('  - Input matrix not updating');
    if (!ulaRow6OK) console.log('  - ULA keyMatrix not syncing from input');
    if (!portBit1OK) console.log('  - ULA.readPort not returning correct bits');
    if (!portUpperOK) console.log('  - ULA.readPort upper bits incorrect');
    if (keyDetectedCount === 0) console.log('  - Key not detected during hold');
    if (!releasedOK) console.log('  - Key not releasing properly');
  }

  return {
    success: allPassed,
    components,
    inputRow6OK,
    ulaRow6OK,
    portBit1OK,
    portUpperOK,
    keyDetectedCount,
    pollTotal: pollResults.length,
    releasedOK
  };
})();
