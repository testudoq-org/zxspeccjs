import { test, expect } from '@playwright/test';

test.describe('CPU Step Diagnostic', () => {
  test('CPU should execute first instruction and advance PC', async ({ page }) => {
    console.log('=== CPU Step Diagnostic Test ===');
    
    await page.goto('http://localhost:8080');
    
    // Wait for emulator to be available
    await page.waitForFunction(() => {
      return window.emulator && window.emulator.cpu && window.emulator.memory;
    }, null, { timeout: 10000 });
    
    // Click Start button to begin execution
    await page.click('#startBtn');
    await page.waitForTimeout(100);
    
    // All interactions must be inside page.evaluate since we can't serialize live objects
    const diagnosticResults = await page.evaluate(() => {
      const emulator = window.emulator;
      if (!emulator || !emulator.cpu || !emulator.memory) {
        return { error: 'Emulator not fully initialized', hasEmulator: !!emulator, hasCpu: !!(emulator && emulator.cpu), hasMemory: !!(emulator && emulator.memory) };
      }
      
      const cpu = emulator.cpu;
      const memory = emulator.memory;
      
      // Use peekMemory from debug API instead of direct memory.read
      const firstByte = window.__ZX_DEBUG__.peekMemory(0x0000, 1)[0];
      const secondByte = window.__ZX_DEBUG__.peekMemory(0x0001, 1)[0];
      const thirdByte = window.__ZX_DEBUG__.peekMemory(0x0002, 1)[0];
      
      return {
        hasEmulator: true,
        hasCpu: true,
        hasMemory: true,
        firstByte,
        secondByte,
        thirdByte,
        initialPC: cpu.PC,
        registers: window.__ZX_DEBUG__.getRegisters()
      };
    });
    
    console.log('Emulator initialized:', diagnosticResults.hasEmulator);
    console.log('CPU initialized:', diagnosticResults.hasCpu);
    console.log('Memory initialized:', diagnosticResults.hasMemory);
    
    if (diagnosticResults.error) {
      console.log('Error:', diagnosticResults.error);
    } else {
      console.log('First byte at 0x0000:', diagnosticResults.firstByte, '(expected: 243 for DI instruction)');
      console.log('Second byte at 0x0001:', diagnosticResults.secondByte);
      console.log('Third byte at 0x0002:', diagnosticResults.thirdByte);
      console.log('Initial PC:', '0x' + diagnosticResults.initialPC.toString(16).padStart(4, '0'));
      console.log('Registers:', diagnosticResults.registers);
    }
    
    // Take screenshot for visual inspection
    await page.screenshot({ path: 'screenshots/cpu_diagnostic.png' });
    
    expect(diagnosticResults.hasEmulator, 'Emulator should be initialized').toBe(true);
    expect(diagnosticResults.hasCpu, 'CPU should be initialized').toBe(true);
    expect(diagnosticResults.hasMemory, 'Memory should be initialized').toBe(true);
    expect(diagnosticResults.firstByte, 'First byte should be DI (0xF3)').toBe(243);
  });
});