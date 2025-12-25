import { test, expect } from '@playwright/test';

test.describe('ROM Loading Diagnostic Test', () => {
  test('should trace ROM loading process step by step', async ({ page }) => {
    console.log('=== ROM Loading Diagnostic Test ===');
    
    // Navigate to the emulator
    await page.goto('http://localhost:8080/');
    await page.waitForTimeout(2000);
    
    // Wait for emulator to load
    await page.waitForFunction(() => window.emu !== undefined, { timeout: 10000 });
    console.log('Emulator loaded successfully');
    
    // Detailed diagnostic of ROM loading process
    await page.evaluate(() => {
      console.log('=== ROM Loading Process Diagnostic ===');
      
      // 1. Check if spec48 is available
      console.log('1. Global spec48 availability:');
      console.log('   - window.spec48 exists:', !!window.spec48);
      if (window.spec48) {
        console.log('   - spec48.id:', window.spec48.id);
        console.log('   - spec48.bytes length:', window.spec48.bytes?.length || 0);
        console.log('   - spec48.first 10 bytes:', Array.from(window.spec48.bytes?.slice(0, 10) || []));
      }
      
      // 2. Check emulator state
      console.log('\\n2. Emulator state:');
      console.log('   - window.emu exists:', !!window.emu);
      if (window.emu) {
        console.log('   - emulator.memory exists:', !!window.emu.memory);
        console.log('   - emulator.cpu exists:', !!window.emu.cpu);
        
        if (window.emu.memory) {
          console.log('   - memory.romBanks length:', window.emu.memory.romBanks?.length || 0);
          console.log('   - memory.pages length:', window.emu.memory.pages?.length || 0);
          console.log('   - memory.currentRom:', window.emu.memory.currentRom || 0);
          
          // 3. Check ROM bank contents
          console.log('\\n3. ROM bank analysis:');
          if (window.emu.memory.romBanks?.[0]) {
            const romBank = window.emu.memory.romBanks[0];
            console.log('   - ROM bank 0 exists: true');
            console.log('   - ROM bank 0 length:', romBank.length);
            console.log('   - ROM bank 0 first 10 bytes:', Array.from(romBank.slice(0, 10)));
            console.log('   - ROM bank 0 is same object as spec48.bytes:', romBank === window.spec48?.bytes);
          } else {
            console.log('   - ROM bank 0 exists: false');
          }
          
          // 4. Check page mapping
          console.log('\\n4. Page mapping analysis:');
          if (window.emu.memory.pages?.[0]) {
            const page0 = window.emu.memory.pages[0];
            console.log('   - Page 0 exists: true');
            console.log('   - Page 0 length:', page0.length);
            console.log('   - Page 0 first 10 bytes:', Array.from(page0.slice(0, 10)));
            console.log('   - Page 0 is same object as ROM bank 0:', page0 === window.emu.memory.romBanks?.[0]);
            console.log('   - Page 0 is same object as spec48.bytes:', page0 === window.spec48?.bytes);
          } else {
            console.log('   - Page 0 exists: false');
          }
          
          // 5. Test memory reads
          console.log('\\n5. Memory read test:');
          const readAddr = (addr) => window.emu.memory.read(addr);
          console.log('   - read(0x0000):', readAddr(0x0000).toString(16));
          console.log('   - read(0x0001):', readAddr(0x0001).toString(16));
          console.log('   - read(0x0002):', readAddr(0x0002).toString(16));
          console.log('   - read(0x0005):', readAddr(0x0005).toString(16));
          
          // 6. Check if ROM was auto-loaded
          console.log('\\n6. Auto-loading check:');
          console.log('   - emulator.romBuffer exists:', !!window.emu.romBuffer);
          if (window.emu.romBuffer) {
            console.log('   - emulator.romBuffer length:', window.emu.romBuffer.length);
            console.log('   - emulator.romBuffer first 10 bytes:', Array.from(window.emu.romBuffer.slice(0, 10)));
          }
        }
      }
      
      // 7. Check console for any loading errors
      console.log('\\n7. Console messages check - look for any error messages above this line');
    });
    
    // Additional verification
    const romAvailability = await page.evaluate(() => {
      return {
        hasSpec48: !!window.spec48,
        hasEmulator: !!window.emu,
        hasMemory: !!window.emu?.memory,
        romBankLength: window.emu?.memory?.romBanks?.[0]?.length || 0,
        page0Length: window.emu?.memory?.pages?.[0]?.length || 0,
        memoryRead0x0000: window.emu?.memory?.read(0x0000) || -1,
        memoryRead0x0001: window.emu?.memory?.read(0x0001) || -1,
        spec48FirstByte: window.spec48?.bytes?.[0] || -1,
        romBankFirstByte: window.emu?.memory?.romBanks?.[0]?.[0] || -1,
        page0FirstByte: window.emu?.memory?.pages?.[0]?.[0] || -1
      };
    });
    
    console.log('\\n=== Final Diagnostic Summary ===');
    console.log(JSON.stringify(romAvailability, null, 2));
    
    // Test basic expectations
    expect(romAvailability.hasSpec48, 'spec48 should be available globally').toBe(true);
    expect(romAvailability.hasEmulator, 'emulator should be available').toBe(true);
    expect(romAvailability.hasMemory, 'memory should be available').toBe(true);
    
    // The core test - ROM data should be readable from memory
    if (romAvailability.memoryRead0x0000 !== -1) {
      expect(romAvailability.memoryRead0x0000, 'Memory should read actual ROM byte at 0x0000').toBe(243);
      expect(romAvailability.memoryRead0x0001, 'Memory should read actual ROM byte at 0x0001').toBe(175);
    }
    
  });
});