/* eslint-disable no-console, no-undef, no-unused-vars */
import { test, expect } from '@playwright/test';
import fs from 'fs';

// Comprehensive diagnostic test to identify boot sequence issues
test.describe('ZX Spectrum Boot Sequence Diagnostics', () => {
  test('comprehensive boot diagnostic', async ({ page }, testInfo) => {
    console.log('=== ZX Spectrum Boot Diagnostic Test ===');
    
    // Navigate to emulator
    await page.goto('/');
    
    // Gather console logs
    const consoleMsgs = [];
    page.on('console', msg => consoleMsgs.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', e => consoleMsgs.push({ type: 'error', text: String(e) }));
    
    // Wait for initial canvas
    await page.waitForSelector('canvas', { timeout: 10000 });
    
    console.log('1. Testing emulator initialization...');
    
    // Check if debug API is available
    const debugApiAvailable = await page.evaluate(() => {
      return {
        hasZXDebug: !!window.__ZX_DEBUG__,
        hasPCWatcher: !!window.__PC_WATCHER__,
        hasLastPC: window.__LAST_PC__ !== undefined,
        emulatorObject: !!window.emu
      };
    });
    
    console.log('Debug API Status:', debugApiAvailable);
    testInfo.attach('debug-api-status', { 
      body: JSON.stringify(debugApiAvailable, null, 2), 
      contentType: 'application/json' 
    });
    
    console.log('2. Testing ROM loading...');
    
    // Check ROM loading
    const romStatus = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.peekMemory) {
        return { error: 'Debug API not available' };
      }
      
      // Check ROM area (first few bytes)
      const romBytes = [];
      for (let addr = 0x0000; addr < 0x0010; addr++) {
        romBytes.push(window.__ZX_DEBUG__.peekMemory(addr, 1)?.[0] || 0);
      }
      
      // Check if ROM appears to be Sinclair ROM (look for characteristic patterns)
      const isSinclairROM = romBytes[0] === 0xF3 && romBytes[1] === 0x21; // DI, LD HL,nn
      
      return {
        romBytes: romBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
        isSinclairROM,
        firstByte: romBytes[0],
        secondByte: romBytes[1]
      };
    });
    
    console.log('ROM Status:', romStatus);
    testInfo.attach('rom-status', { 
      body: JSON.stringify(romStatus, null, 2), 
      contentType: 'application/json' 
    });
    
    console.log('3. Testing CPU reset and initial state...');
    
    // Reset and check initial CPU state
    await page.evaluate(() => {
      if (window.emu && typeof window.emu.reset === 'function') {
        console.log('Calling emulator reset...');
        window.emu.reset();
      }
    });
    
    await page.waitForTimeout(1000);
    
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
        tstates: regs.tstates,
        IFF1: regs.IFF1,
        IFF2: regs.IFF2
      };
    });
    
    console.log('Initial CPU State:', initialState);
    testInfo.attach('initial-cpu-state', { 
      body: JSON.stringify(initialState, null, 2), 
      contentType: 'application/json' 
    });
    
    console.log('4. Testing boot progression...');
    
    // Test boot progression with detailed tracking
    const startButton = page.locator('button:has-text("Start")');
    await startButton.click();
    
    await page.waitForTimeout(1000);
    
    // Poll for boot progression
    const bootProgress = [];
    const maxPolls = 50;
    
    for (let i = 0; i < maxPolls; i++) {
      const state = await page.evaluate(() => {
        if (!window.__ZX_DEBUG__ || !window.__ZX_DEBUG__.getRegisters) {
          return null;
        }
        
        const regs = window.__ZX_DEBUG__.getRegisters();
        const pcHistory = window.__PC_WATCHER__?.history || [];
        
        return {
          PC: regs.PC,
          tstates: regs.tstates,
          recentPCs: pcHistory.slice(-10),
          bootComplete: typeof window.__ZX_DEBUG__.bootComplete === 'function' ? 
            window.__ZX_DEBUG__.bootComplete() : false
        };
      });
      
      if (state) {
        bootProgress.push(state);
        console.log(`Poll ${i}: PC=0x${state.PC.toString(16).padStart(4, '0')}, tstates=${state.tstates}`);
        
        // If we've seen a reasonable progression, stop polling
        if (state.PC > 0x100 && bootProgress.length > 10) {
          console.log('CPU appears to be progressing normally');
          break;
        }
      }
      
      await page.waitForTimeout(100);
    }
    
    testInfo.attach('boot-progress', { 
      body: JSON.stringify(bootProgress, null, 2), 
      contentType: 'application/json' 
    });
    
    console.log('5. Testing screen rendering...');
    
    // Check screen content
    const screenContent = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return { error: 'No canvas found' };
      
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Analyze pixel distribution
      let whitePixels = 0, blackPixels = 0, otherPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r > 200 && g > 200 && b > 200) whitePixels++;
        else if (r < 50 && g < 50 && b < 50) blackPixels++;
        else otherPixels++;
      }
      
      return {
        canvasSize: { width: canvas.width, height: canvas.height },
        pixelStats: { whitePixels, blackPixels, otherPixels },
        hasContent: whitePixels > 100 || blackPixels > 100
      };
    });
    
    console.log('Screen Content:', screenContent);
    testInfo.attach('screen-content', { 
      body: JSON.stringify(screenContent, null, 2), 
      contentType: 'application/json' 
    });
    
    // Take screenshot
    const screenshotPath = `debug_boot_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    testInfo.attach('debug-screenshot', { path: screenshotPath, contentType: 'image/png' });
    
    console.log('6. Final diagnostics...');
    
    // Final comprehensive state check
    const finalState = await page.evaluate(() => {
      return {
        debugAPI: !!window.__ZX_DEBUG__,
        emulator: !!window.emu,
        pcWatcher: !!window.__PC_WATCHER_,
        lastPC: window.__LAST_PC__,
        registers: window.__ZX_DEBUG__?.getRegisters ? window.__ZX_DEBUG__.getRegisters() : null,
        bootProgress: window.__ZX_DEBUG__?.getBootProgress ? window.__ZX_DEBUG__.getBootProgress() : null,
        consoleErrors: consoleMsgs.filter(m => m.type === 'error').length
      };
    });
    
    console.log('Final State:', finalState);
    testInfo.attach('final-state', { 
      body: JSON.stringify(finalState, null, 2), 
      contentType: 'application/json' 
    });
    
    // Attach console logs
    testInfo.attach('console-logs', { 
      body: JSON.stringify(consoleMsgs, null, 2), 
      contentType: 'application/json' 
    });
    
    console.log('=== Diagnostic Test Complete ===');
    
    // Basic sanity checks
    expect(debugApiAvailable.hasZXDebug, 'Debug API should be available').toBe(true);
    expect(romStatus.isSinclairROM, 'Should load Sinclair ROM').toBe(true);
    expect(initialState.PC, 'CPU should have valid PC').toBeDefined();
    expect(screenContent.hasContent, 'Screen should have some content').toBe(true);
    
  });
});
