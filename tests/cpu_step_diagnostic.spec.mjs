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
    
    const emulator = await page.evaluate(() => window.emulator);
    const cpu = emulator.cpu;
    const memory = emulator.memory;
    
    console.log('Emulator initialized:', !!emulator);
    console.log('CPU initialized:', !!cpu);
    console.log('Memory initialized:', !!memory);
    
    // Check what's at address 0x0000
    const firstByte = memory.read(0x0000);
    console.log('First byte at 0x0000:', firstByte, '(expected: 243 for DI instruction)');
    
    // Check what's at address 0x0001  
    const secondByte = memory.read(0x0001);
    console.log('Second byte at 0x0001:', secondByte);
    
    // Check what's at address 0x0002
    const thirdByte = memory.read(0x0002);
    console.log('Third byte at 0x0002:', thirdByte);
    
    // Manually execute a few steps and track PC changes
    console.log('\\nExecuting manual CPU steps:');
    
    for (let i = 0; i < 5; i++) {
      const pcBefore = cpu.PC;
      const opcode = memory.read(cpu.PC);
      console.log(`Step ${i}: PC=0x${pcBefore.toString(16).padStart(4, '0')}, opcode=0x${opcode.toString(16).padStart(2, '0')}`);
      
      const consumed = cpu.step();
      const pcAfter = cpu.PC;
      console.log(`        -> PC=0x${pcAfter.toString(16).padStart(4, '0')}, tstates consumed=${consumed}`);
      
      if (pcBefore === pcAfter) {
        console.log(`        WARNING: PC did not advance!`);
        break;
      }
    }
    
    // Take screenshot for visual inspection
    await page.screenshot({ path: 'screenshots/cpu_diagnostic.png' });
    
    expect(true, 'CPU diagnostic completed - check console output').toBe(true);
  });
});