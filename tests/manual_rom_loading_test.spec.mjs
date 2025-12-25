import { test, expect } from '@playwright/test';

test.describe('ROM Loading Trigger Test', () => {
  test('should manually trigger ROM loading to verify the process', async ({ page }) => {
    console.log('=== ROM Loading Trigger Test ===');
    
    // Navigate to the emulator
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(2000);
    
    // Wait for emulator to load
    await page.waitForFunction(() => window.emu !== undefined, { timeout: 10000 });
    console.log('Emulator loaded successfully');
    
    // Manually trigger ROM loading to test the process
    await page.evaluate(() => {
      console.log('=== Manual ROM Loading Test ===');
      
      if (window.emu && window.spec48) {
        console.log('Manually calling loadROM with spec48.bytes');
        console.log('spec48.bytes length:', window.spec48.bytes.length);
        console.log('spec48 first 10 bytes:', Array.from(window.spec48.bytes.slice(0, 10)));
        
        // Clear existing ROM data first
        if (window.emu.memory) {
          window.emu.memory.romBanks = [];
          window.emu.memory.pages[0] = null;
        }
        
        // Call loadROM directly
        window.emu.loadROM(window.spec48.bytes);
        
        console.log('Manual loadROM completed');
        console.log('ROM bank first byte after manual load:', window.emu.memory.romBanks[0]?.[0] || 'undefined');
        console.log('Page 0 first byte after manual load:', window.emu.memory.pages[0]?.[0] || 'undefined');
        
        // Test memory reads
        console.log('Memory read at 0x0000:', window.emu.memory.read(0x0000));
        console.log('Memory read at 0x0001:', window.emu.memory.read(0x0001));
        console.log('Memory read at 0x0002:', window.emu.memory.read(0x0002));
      } else {
        console.log('Cannot manually load ROM - emulator or spec48 not available');
      }
    });
    
    // Check if manual loading worked
    const manualLoadResult = await page.evaluate(() => {
      if (!window.emu?.memory) return { success: false, error: 'No memory' };
      
      return {
        success: true,
        romBankFirstByte: window.emu.memory.romBanks[0]?.[0] || -1,
        page0FirstByte: window.emu.memory.pages[0]?.[0] || -1,
        memoryRead0x0000: window.emu.memory.read(0x0000),
        memoryRead0x0001: window.emu.memory.read(0x0001),
        memoryRead0x0002: window.emu.memory.read(0x0002),
      };
    });
    
    console.log('Manual load result:', manualLoadResult);
    
    // The test should pass if manual loading works
    if (manualLoadResult.success) {
      expect(manualLoadResult.memoryRead0x0000, 'Manual load should make ROM readable').toBe(243);
      expect(manualLoadResult.memoryRead0x0001, 'Manual load should make ROM readable').toBe(175);
    }
    
  });
});