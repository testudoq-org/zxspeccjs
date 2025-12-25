import { test, expect } from '@playwright/test';

test.describe('Memory Debug Test', () => {
  test('should correctly read ROM bytes after loading', async ({ page }) => {
    console.log('=== Memory Debug Test ===');
    
    // Navigate to the emulator
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(2000);
    
    // Wait for emulator to load
    await page.waitForFunction(() => window.emu !== undefined, { timeout: 10000 });
    console.log('Emulator loaded successfully');
    
    // Check if emulator has memory object
    await page.evaluate(() => {
      console.log('Memory object exists:', !!window.emu?.memory);
      console.log('ROM banks length:', window.emu?.memory?.romBanks?.length || 0);
      console.log('Pages array length:', window.emu?.memory?.pages?.length || 0);
      console.log('Current ROM index:', window.emu?.memory?.currentRom || 0);
      
      if (window.emu?.memory?.romBanks?.[0]) {
        console.log('ROM bank 0 first bytes:', Array.from(window.emu.memory.romBanks[0].slice(0, 10)));
      }
      
      if (window.emu?.memory?.pages?.[0]) {
        console.log('Page 0 first bytes:', Array.from(window.emu.memory.pages[0].slice(0, 10)));
      }
      
      // Test memory reads
      console.log('Memory read at 0x0000:', window.emu?.memory?.read?.(0x0000).toString(16));
      console.log('Memory read at 0x0001:', window.emu?.memory?.read?.(0x0001).toString(16));
      console.log('Memory read at 0x0002:', window.emu?.memory?.read?.(0x0002).toString(16));
      console.log('Memory read at 0x0038:', window.emu?.memory?.read?.(0x0038).toString(16));
      console.log('Memory read at 0x0005:', window.emu?.memory?.read?.(0x0005).toString(16));
      console.log('Memory read at 0x11CB:', window.emu?.memory?.read?.(0x11CB).toString(16));
    });
    
    // Check if ROM bytes are correctly loaded
    const romBytes = await page.evaluate(() => {
      return {
        hasSpec48: !!window.spec48,
        spec48BytesLength: window.spec48?.bytes?.length || 0,
        spec48FirstBytes: window.spec48?.bytes ? Array.from(window.spec48.bytes.slice(0, 10)) : []
      };
    });
    
    console.log('ROM analysis:', romBytes);
    
    // Test memory reads
    const actualROMBytes = await page.evaluate(() => {
      if (!window.emu?.memory) return null;
      
      return {
        addr0x0000: window.emu.memory.read(0x0000),
        addr0x0001: window.emu.memory.read(0x0001), 
        addr0x0002: window.emu.memory.read(0x0002),
        addr0x0005: window.emu.memory.read(0x0005),
        addr0x0038: window.emu.memory.read(0x0038),
        addr0x11CB: window.emu.memory.read(0x11CB)
      };
    });
    
    console.log('Actual ROM reads:', actualROMBytes);
    
    // Expected values from spec48 ROM (first few bytes)
    const expectedFirstBytes = [243, 175, 17, 255, 255, 195, 203, 17, 42, 93];
    
    // Test memory reads
    if (actualROMBytes) {
      expect(actualROMBytes.addr0x0000, 'Address 0x0000 should contain first ROM byte').toBe(expectedFirstBytes[0]);
      expect(actualROMBytes.addr0x0001, 'Address 0x0001 should contain second ROM byte').toBe(expectedFirstBytes[1]);
      expect(actualROMBytes.addr0x0002, 'Address 0x0002 should contain third ROM byte').toBe(expectedFirstBytes[2]);
      expect(actualROMBytes.addr0x0005, 'Address 0x0005 should contain sixth ROM byte').toBe(expectedFirstBytes[5]);
    }
    
  });
});