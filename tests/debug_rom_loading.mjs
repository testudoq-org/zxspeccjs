import { test, expect } from '@playwright/test';

test.describe('ROM Loading Debug', () => {
  test('debug ROM loading process', async ({ page }) => {
    console.log('=== ROM Loading Debug ===');
    
    await page.goto('http://localhost:8080/');
    
    // Wait for emulator to initialize
    await page.waitForTimeout(3000);
    
    // Debug ROM loading step by step
    const debugInfo = await page.evaluate(() => {
      const info = {};
      
      // Check if spec48 module is available
      info.spec48Available = typeof spec48 !== 'undefined';
      if (info.spec48Available) {
        info.spec48Bytes = spec48.bytes ? Array.from(spec48.bytes.slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 'no bytes property';
        info.spec48Size = spec48.size || 'no size';
      }
      
      // Check memory system
      if (window.emu && window.emu.memory) {
        const memory = window.emu.memory;
        info.memoryExists = true;
        info.romBanksLength = memory.romBanks ? memory.romBanks.length : 0;
        info.currentRom = memory.currentRom;
        info.pages0FirstBytes = memory.pages[0] ? Array.from(memory.pages[0].slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 'no pages[0]';
        
        // Check if ROM bank 0 has data
        if (memory.romBanks && memory.romBanks[0]) {
          info.romBank0FirstBytes = Array.from(memory.romBanks[0].slice(0, 20)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
          info.romBank0AllFF = memory.romBanks[0].every(b => b === 0xFF);
        } else {
          info.romBank0FirstBytes = 'no romBank[0]';
          info.romBank0AllFF = 'unknown';
        }
      } else {
        info.memoryExists = false;
      }
      
      // Check debug API
      info.debugAPIAvailable = !!window.__ZX_DEBUG__;
      if (info.debugAPIAvailable) {
        info.firstMemoryBytes = window.__ZX_DEBUG__.peekMemory ? 
          window.__ZX_DEBUG__.peekMemory(0, 20).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 
          'peekMemory not available';
      }
      
      // Check CPU state
      if (window.emu && window.emu.cpu) {
        info.cpuPC = window.emu.cpu.PC;
        info.cpuRunning = window.emu._running || false;
      } else {
        info.cpuPC = 'no cpu';
        info.cpuRunning = false;
      }
      
      return info;
    });
    
    console.log('Debug Info:', debugInfo);
    
    // Take screenshot for visual inspection
    await page.screenshot({ path: 'debug_rom_loading.png', fullPage: true });
    
    // Basic expectations
    expect(debugInfo.spec48Available, 'spec48 ROM should be available').toBe(true);
    expect(debugInfo.memoryExists, 'Memory system should be initialized').toBe(true);
    expect(debugInfo.debugAPIAvailable, 'Debug API should be available').toBe(true);
    
  });
});