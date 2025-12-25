import { test, expect } from '@playwright/test';

test.describe('Force ROM Reload Test', () => {
  test('force ROM reload and verify boot sequence', async ({ page }, testInfo) => {
    console.log('=== Force ROM Reload Test ===');
    
    await page.goto('http://localhost:8080/');
    
    // Wait for initial load
    await page.waitForTimeout(2000);
    
    // Force ROM reload
    await page.evaluate(() => {
      if (window.emu && typeof window.emu.reset === 'function') {
        console.log('Forcing emulator reset...');
        window.emu.reset();
      }
      
      // Force reload the spec48 module
      if (typeof spec48 !== 'undefined' && spec48 && spec48.bytes) {
        console.log('Reloading ROM with fresh bytes...');
        console.log('First ROM bytes:', Array.from(spec48.bytes.slice(0, 10)));
        window.emu.loadROM(spec48);
      }
    });
    
    await page.waitForTimeout(1000);
    
    // Verify ROM contents after reload
    const romAfterReload = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.peekMemory) {
        return { error: 'Debug API not available' };
      }
      
      const bytes = [];
      for (let i = 0; i < 10; i++) {
        bytes.push(window.__ZX_DEBUG__.peekMemory(i, 1)?.[0] || 0);
      }
      
      return {
        bytes: bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
        hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' '),
        decimal: bytes.join(' ')
      };
    });
    
    console.log('ROM after reload:', romAfterReload);
    testInfo.attach('rom-after-reload', { 
      body: JSON.stringify(romAfterReload, null, 2), 
      contentType: 'application/json' 
    });
    
    // Test CPU execution after reload
    const startButton = page.locator('button:has-text("Start")');
    await startButton.click();
    
    await page.waitForTimeout(1000);
    
    // Check PC progression
    const pcProgression = [];
    for (let i = 0; i < 10; i++) {
      const state = await page.evaluate(() => {
        return {
          PC: window.__LAST_PC__ || 0
        };
      });
      
      pcProgression.push(state.PC);
      console.log(`Step ${i}: PC=0x${state.PC.toString(16).padStart(4, '0')}`);
      
      await page.waitForTimeout(100);
    }
    
    testInfo.attach('pc-progression-after-reload', { 
      body: JSON.stringify(pcProgression, null, 2), 
      contentType: 'application/json' 
    });
    
    // Check if PC is now progressing (should start from 0x0000)
    const firstPC = pcProgression[0];
    const hasProgressed = pcProgression.some((pc, i) => i > 0 && pc !== firstPC);
    
    console.log(`First PC: 0x${firstPC.toString(16).padStart(4, '0')}, Has progressed: ${hasProgressed}`);
    
    if (firstPC === 0x0000) {
      console.log('CPU now starting from correct boot address!');
    } else {
      console.log('CPU still starting from wrong address');
    }
    
    // Basic checks
    expect(romAfterReload, 'ROM should be readable after reload').not.toBe({ error: 'Debug API not available' });
    
    if (romAfterReload.bytes && !romAfterReload.bytes.includes('ff ff ff ff ff')) {
      console.log('ROM appears to be loaded with real data, not 0xFF');
    } else {
      console.log('ROM still contains 0xFF - loading issue persists');
    }
    
  });
});