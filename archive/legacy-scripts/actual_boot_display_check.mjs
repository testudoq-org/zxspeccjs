#!/usr/bin/env node

/**
 * Test actual ROM boot sequence to see if copyright message is written to display memory
 */

import { Emulator } from './src/main.mjs';

console.log('🚀 Testing Actual ROM Boot Display Content');
console.log('=========================================');

async function testActualBoot() {
  try {
    // Create a test canvas
    const testCanvas = {
      width: 256,
      height: 192,
      style: {},
      getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
        putImageData: () => {},
        imageSmoothingEnabled: false
      })
    };

    const emulator = new Emulator({ canvas: testCanvas });
    
    console.log('✅ Emulator created');
    
    // Load the ROM and start boot sequence
    console.log('\n=== Loading ROM and Starting Boot ===');
    
    // The main.mjs auto-loads spec48, so we just need to start the emulator
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for auto-load
    
    console.log('Starting emulator...');
    emulator.start();
    
    // Let it run for a short time to execute boot sequence
    console.log('Running boot sequence for 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Pausing emulator...');
    emulator.pause();
    
    // Check memory state after boot
    console.log('\n=== Checking Memory State After Boot ===');
    
    const memory = emulator.memory;
    if (!memory) {
      console.log('❌ Memory system not initialized');
      return;
    }
    
    // Check display file content
    console.log('Checking display file (0x4000-0x57FF)...');
    let displayNonZero = 0;
    let displayBytes = [];
    for (let addr = 0x4000; addr < 0x4100; addr++) { // Check first 256 bytes
      const value = memory.read(addr);
      if (value !== 0) {
        displayNonZero++;
        displayBytes.push({ addr, value, char: String.fromCharCode(value) });
      }
    }
    
    console.log(`Display file: ${displayNonZero} non-zero bytes in first 256 bytes`);
    
    if (displayBytes.length > 0) {
      console.log('Non-zero display bytes:');
      displayBytes.slice(0, 20).forEach(({ addr, value, char }) => {
        console.log(`  0x${addr.toString(16)}: 0x${value.toString(16)} (${char})`);
      });
      
      // Check if we can find copyright-like content
      const displayText = displayBytes.map(b => b.char).join('');
      console.log(`Display text (first 20 chars): "${displayText}"`);
      
      if (displayText.includes('Sinclair') || displayText.includes('RESEARCH')) {
        console.log('✅ FOUND copyright message content in display memory!');
      } else {
        console.log('❌ No copyright message found in display memory');
      }
    } else {
      console.log('❌ No non-zero bytes found in display memory');
    }
    
    // Check attribute file
    console.log('\nChecking attribute file (0x5800-0x5AFF)...');
    let attrNonZero = 0;
    let attrValues = [];
    for (let addr = 0x5800; addr < 0x5900; addr++) { // Check first 256 bytes
      const value = memory.read(addr);
      if (value !== 0) {
        attrNonZero++;
        attrValues.push({ addr, value });
      }
    }
    
    console.log(`Attribute file: ${attrNonZero} non-zero bytes in first 256 bytes`);
    
    if (attrValues.length > 0) {
      console.log('Non-zero attribute bytes:');
      attrValues.slice(0, 10).forEach(({ addr, value }) => {
        const ink = value & 0x07;
        const paper = (value >> 3) & 0x07;
        const bright = (value & 0x40) ? 'BRIGHT' : 'normal';
        const flash = (value & 0x80) ? 'FLASH' : '';
        console.log(`  0x${addr.toString(16)}: 0x${value.toString(16)} (INK:${ink} PAPER:${paper} ${bright} ${flash})`);
      });
    }
    
    // Check border color
    if (emulator.ula) {
      console.log(`\nBorder color: ${emulator.ula.border} (expected: 7 for white)`);
    }
    
    // Test ULA render
    console.log('\n=== Testing ULA Render ===');
    try {
      const bitmap = memory.getBitmapView();
      const attrs = memory.getAttributeView();
      
      console.log(`Bitmap view: ${bitmap ? bitmap.length : 'NULL'} bytes`);
      console.log(`Attribute view: ${attrs ? attrs.length : 'NULL'} bytes`);
      
      if (bitmap && attrs) {
        // Check if copyright characters are in the bitmap
        const copyrightChars = ' Sinclair RESEARCH Ltd ';
        let foundCopyright = false;
        
        for (let i = 0; i <= bitmap.length - copyrightChars.length; i++) {
          let match = true;
          for (let j = 0; j < copyrightChars.length; j++) {
            if (bitmap[i + j] !== copyrightChars.charCodeAt(j)) {
              match = false;
              break;
            }
          }
          if (match) {
            foundCopyright = true;
            console.log(`✅ Found copyright message at display address 0x${(0x4000 + i).toString(16)}`);
            break;
          }
        }
        
        if (!foundCopyright) {
          console.log('❌ Copyright message not found in bitmap view');
          
          // Let's check what IS in the display memory
          console.log('\nActual display content:');
          let textContent = '';
          for (let i = 0; i < Math.min(100, bitmap.length); i++) {
            const byte = bitmap[i];
            if (byte >= 32 && byte <= 126) { // Printable ASCII
              textContent += String.fromCharCode(byte);
            } else if (byte === 0) {
              textContent += ' ';
            } else {
              textContent += `\\x${byte.toString(16)}`;
            }
          }
          console.log(`First 100 bytes as text: "${textContent}"`);
        }
      }
      
      emulator.ula.render();
      console.log('✅ ULA render completed');
      
    } catch (error) {
      console.log('❌ ULA render failed:', error.message);
    }
    
    // Final assessment
    console.log('\n🎯 FINAL ASSESSMENT:');
    console.log('====================');
    
    if (displayBytes.length > 0) {
      console.log('✅ Display memory contains data after boot');
      console.log('✅ ROM boot sequence is writing to display memory');
      
      if (displayBytes.some(b => b.char === 'S' || b.char === 'i')) {
        console.log('✅ Found potential copyright message characters');
        console.log('💡 The display system is working - copyright should be visible');
      } else {
        console.log('⚠️  Display contains data but not copyright characters');
        console.log('💡 Boot sequence may not have completed or may use different text');
      }
    } else {
      console.log('❌ Display memory is empty after boot');
      console.log('💡 ROM boot sequence may not be executing properly');
      console.log('💡 Or boot sequence takes longer than 2 seconds');
    }
    
  } catch (error) {
    console.error('❌ Error during test:', error.message);
    console.error(error.stack);
  }
}

testActualBoot().then(() => {
  console.log('\n🏁 Test completed');
}).catch(error => {
  console.error('Test failed:', error);
});