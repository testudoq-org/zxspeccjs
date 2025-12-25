import { test, expect } from '@playwright/test';

test.describe('Direct Memory Access Test', () => {
  test('should directly set ROM data in memory system', async ({ page }) => {
    console.log('=== Direct Memory Access Test ===');
    
    // Navigate to the emulator
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);
    
    // Wait for emulator to load
    await page.waitForFunction(() => window.emu !== undefined, { timeout: 10000 });
    console.log('Emulator loaded successfully');
    
    // Directly manipulate memory to test ROM loading
    await page.evaluate(() => {
      console.log('=== Direct Memory Manipulation ===');
      
      if (window.emu && window.spec48 && window.emu.memory) {
        console.log('Directly setting ROM data...');
        
        // Clear existing ROM banks
        window.emu.memory.romBanks = [];
        
        // Create a new ROM bank and manually copy the data
        const spec48Bytes = window.spec48.bytes;
        console.log('spec48 first 10 bytes:', Array.from(spec48Bytes.slice(0, 10)));
        
        // Create a new ROM bank directly
        const newRomBank = new Uint8Array(16384);
        for (let i = 0; i < Math.min(spec48Bytes.length, 16384); i++) {
          newRomBank[i] = spec48Bytes[i];
        }
        
        console.log('New ROM bank first 10 bytes:', Array.from(newRomBank.slice(0, 10)));
        
        // Set the ROM bank directly
        window.emu.memory.romBanks[0] = newRomBank;
        
        // Map it to page 0
        window.emu.memory.pages[0] = newRomBank;
        window.emu.memory.currentRom = 0;
        
        console.log('Direct setup completed');
        console.log('ROM bank first byte:', window.emu.memory.romBanks[0][0]);
        console.log('Page 0 first byte:', window.emu.memory.pages[0][0]);
        
        // Test memory reads
        console.log('Memory read at 0x0000:', window.emu.memory.read(0x0000));
        console.log('Memory read at 0x0001:', window.emu.memory.read(0x0001));
        console.log('Memory read at 0x0002:', window.emu.memory.read(0x0002));
        
      } else {
        console.log('Cannot perform direct memory manipulation - emulator, spec48, or memory not available');
      }
    });
    
    // Check if direct manipulation worked
    const directResult = await page.evaluate(() => {
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
    
    console.log('Direct manipulation result:', directResult);
    
    // This should definitely work
    expect(directResult.memoryRead0x0000, 'Direct memory manipulation should work').toBe(243);
    expect(directResult.memoryRead0x0001, 'Direct memory manipulation should work').toBe(175);
    
  });
});