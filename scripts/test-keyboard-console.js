/**
 * Keyboard Diagnostic - Paste this entire script into browser console
 * after the emulator has booted to BASIC prompt (> cursor visible)
 */

/* eslint-env browser */
/* global window, console, setTimeout */

(async function testKeyboard() {
  console.log('=== ZX Spectrum Keyboard Diagnostic ===\n');
  
  // Check prerequisites
  if (!window.__ZX_DEBUG__) {
    console.error('❌ __ZX_DEBUG__ not found. Is emulator running?');
    return;
  }
  
  if (!window.__ZX_DEBUG__.pressKey) {
    console.error('❌ __ZX_DEBUG__.pressKey not found. Emulator may need reload.');
    return;
  }
  
  console.log('✓ Debug API available\n');
  
  // Test the keyboard path
  if (window.__ZX_DEBUG__.testKeyboardPath) {
    console.log('Running full keyboard path test with "l" key...\n');
    await window.__ZX_DEBUG__.testKeyboardPath('l');
  } else {
    // Manual test if testKeyboardPath not available
    console.log('1. Getting initial matrix state:');
    console.log('   Input:', window.__ZX_DEBUG__.getKeyMatrix?.()?.input || 'N/A');
    console.log('   ULA:', window.__ZX_DEBUG__.getKeyMatrix?.()?.ula || 'N/A');
    
    console.log('\n2. Pressing "l" key...');
    window.__ZX_DEBUG__.pressKey('l');
    
    console.log('   Matrix after press:');
    console.log('   Input:', window.__ZX_DEBUG__.getKeyMatrix?.()?.input || 'N/A');
    console.log('   ULA:', window.__ZX_DEBUG__.getKeyMatrix?.()?.ula || 'N/A');
    
    console.log('\n3. Holding for 500ms...');
    await new Promise(r => setTimeout(r, 500));
    
    console.log('4. Releasing key...');
    window.__ZX_DEBUG__.releaseKey('l');
  }
  
  console.log('\n=== Check screen for "LIST " text ===');
  console.log('If no text appeared, check:');
  console.log('  1. window.__KEYBOARD_DEBUG__ for port read stats');
  console.log('  2. Run: __ZX_DEBUG__.enableKeyboardDebug() then press keys');
  console.log('  3. Check __ZX_DEBUG__.getKeyMatrix() values');
  
  // Show port read stats
  if (window.__KEYBOARD_DEBUG__) {
    console.log('\nPort read stats:', {
      totalReads: window.__KEYBOARD_DEBUG__.reads,
      lastResult: window.__KEYBOARD_DEBUG__.lastResult?.toString(16),
      lastKeyDetected: window.__KEYBOARD_DEBUG__.lastKeyDetected
    });
  }
})();
