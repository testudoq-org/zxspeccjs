import { test, expect } from '@playwright/test';

test.describe('Simple Instruction Test', () => {
  test('CPU executes first few instructions', async ({ page }, testInfo) => {
    console.log('=== Simple CPU Instruction Test ===');
    
    await page.goto('/');
    
    // Wait for emulator to initialize
    await page.waitForTimeout(2000);
    
    // Check if debug API is available
    const debugApiAvailable = await page.evaluate(() => {
      return {
        hasZXDebug: !!window.__ZX_DEBUG__,
        hasLastPC: window.__LAST_PC__ !== undefined,
        emulatorObject: !!window.emu
      };
    });
    
    console.log('Debug API Status:', debugApiAvailable);
    
    // Click Start to begin execution
    const startButton = page.locator('button:has-text("Start")');
    await startButton.click();
    
    await page.waitForTimeout(1000);
    
    // Check PC progression for first few instructions
    const pcProgression = [];
    for (let i = 0; i < 20; i++) {
      const state = await page.evaluate(() => {
        return {
          PC: window.__LAST_PC__ || 0,
          debugAPI: !!window.__ZX_DEBUG__,
          emuExists: !!window.emu
        };
      });
      
      pcProgression.push(state);
      console.log(`Step ${i}: PC=0x${state.PC.toString(16).padStart(4, '0')}`);
      
      await page.waitForTimeout(50);
    }
    
    testInfo.attach('pc-progression', { 
      body: JSON.stringify(pcProgression, null, 2), 
      contentType: 'application/json' 
    });
    
    // Basic checks
    expect(debugApiAvailable.hasZXDebug, 'Debug API should be available').toBe(true);
    expect(pcProgression.length, 'Should have PC progression data').toBe(20);
    
    // Check if PC is changing (indicating CPU is executing)
    const firstPC = pcProgression[0].PC;
    const lastPC = pcProgression[pcProgression.length - 1].PC;
    
    console.log(`First PC: 0x${firstPC.toString(16).padStart(4, '0')}, Last PC: 0x${lastPC.toString(16).padStart(4, '0')}`);
    
    // If CPU is working, PC should have progressed
    if (lastPC !== firstPC) {
      console.log('CPU appears to be executing instructions');
    } else {
      console.log('CPU appears to be stuck at single address');
    }
    
    expect(lastPC, 'PC should change if CPU is executing').not.toBe(firstPC);
    
  });
});