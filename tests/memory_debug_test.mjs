import { test, expect } from '@playwright/test';

test.describe('Memory Debug Test', () => {
  test('check memory initialization and ROM loading', async ({ page }) => {
    console.log('=== Memory Debug Test ===');
    
    // Capture console messages
    page.on('console', msg => {
      console.log('Browser console:', msg.type(), msg.text());
    });
    
    await page.goto('/');
    
    // Wait for emulator to initialize
    await page.waitForTimeout(3000);
    
    // Check memory state
    const memoryState = await page.evaluate(() => {
      if (!window.emu || !window.emu.memory) {
        return { error: 'No emulator or memory found' };
      }
      
      const memory = window.emu.memory;
      return {
        romBanksLength: memory.romBanks ? memory.romBanks.length : 0,
        currentRom: memory.currentRom,
        pages0Exists: !!memory.pages[0],
        pages0FirstBytes: memory.pages[0] ? Array.from(memory.pages[0].slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 'no pages[0]',
        romBank0FirstBytes: memory.romBanks && memory.romBanks[0] ? 
          Array.from(memory.romBanks[0].slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 'no romBank[0]',
        spec48Available: typeof spec48 !== 'undefined',
        spec48FirstBytes: (typeof spec48 !== 'undefined' && spec48.bytes) ? 
          Array.from(spec48.bytes.slice(0, 10)).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ') : 'no spec48 bytes'
      };
    });
    
    console.log('Memory State:', memoryState);
    
    // Take screenshot
    await page.screenshot({ path: 'memory_debug.png', fullPage: true });
    
    // Test memory reads directly
    const memoryReads = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.peekMemory) {
        return { error: 'Debug API not available' };
      }
      
      return {
        address0: window.__ZX_DEBUG__.peekMemory(0, 1)[0],
        address1: window.__ZX_DEBUG__.peekMemory(1, 1)[0],
        address2: window.__ZX_DEBUG__.peekMemory(2, 1)[0],
        address38: window.__ZX_DEBUG__.peekMemory(0x38, 1)[0]
      };
    });
    
    console.log('Memory Reads:', memoryReads);
    
    // Basic expectations
    expect(memoryState.spec48Available, 'spec48 should be available').toBe(true);
    expect(memoryState.pages0Exists, 'pages[0] should exist').toBe(true);
    
  });
});