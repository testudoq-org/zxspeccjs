import { test, expect } from '@playwright/test';

test.describe('ROM Analysis Test', () => {
  test('analyze ROM contents at critical addresses', async ({ page }, testInfo) => {
    console.log('=== ROM Analysis Test ===');
    
    await page.goto('/');
    
    // Wait for emulator to initialize
    await page.waitForTimeout(2000);
    
    // Analyze ROM contents at critical addresses
    const romAnalysis = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.peekMemory) {
        return { error: 'Debug API not available' };
      }
      
      const analysis = {};
      
      // Check boot sequence addresses
      const bootAddresses = [0x0000, 0x0001, 0x0002, 0x0005, 0x11CB];
      
      for (const addr of bootAddresses) {
        const bytes = [];
        for (let i = 0; i < 4; i++) {
          bytes.push(window.__ZX_DEBUG__.peekMemory(addr + i, 1)?.[0] || 0);
        }
        analysis[`0x${addr.toString(16).padStart(4, '0')}`] = {
          bytes: bytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
          hex: bytes.map(b => b.toString(16).padStart(2, '0')).join(' '),
          decimal: bytes.join(' ')
        };
      }
      
      // Also check 0x38 specifically (where CPU is stuck)
      const addr38 = [];
      for (let i = 0; i < 10; i++) {
        addr38.push(window.__ZX_DEBUG__.peekMemory(0x38 + i, 1)?.[0] || 0);
      }
      analysis['0x38_detailed'] = {
        bytes: addr38.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
        hex: addr38.map(b => b.toString(16).padStart(2, '0')).join(' '),
        decimal: addr38.join(' ')
      };
      
      return analysis;
    });
    
    console.log('ROM Analysis:', romAnalysis);
    testInfo.attach('rom-analysis', { 
      body: JSON.stringify(romAnalysis, null, 2), 
      contentType: 'application/json' 
    });
    
    // Check initial CPU state
    const initialState = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.getRegisters) {
        return { error: 'Cannot get registers' };
      }
      
      const regs = window.__ZX_DEBUG__.getRegisters();
      return {
        PC: regs.PC,
        SP: regs.SP,
        A: regs.A,
        F: regs.F,
        tstates: regs.tstates
      };
    });
    
    console.log('Initial CPU State:', initialState);
    testInfo.attach('initial-cpu-state', { 
      body: JSON.stringify(initialState, null, 2), 
      contentType: 'application/json' 
    });
    
    // Basic checks
    expect(romAnalysis, 'ROM analysis should be available').not.toBe({ error: 'Debug API not available' });
    expect(initialState, 'CPU state should be available').not.toBe({ error: 'Cannot get registers' });
    
  });
});