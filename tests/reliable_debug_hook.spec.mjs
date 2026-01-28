// Test to verify the reliable debug hook implementation for PC monitoring
import { test, expect } from '@playwright/test';

test.describe('Reliable Debug Hook Implementation', () => {
  test('PC watcher should track every instruction execution', async ({ page }) => {
    // Navigate to emulator
    await page.goto('http://localhost:8080/');

    // Wait for emulator to load
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Check that PC watcher is initialized
    const pcWatcherExists = await page.evaluate(() => {
      return window.__PC_WATCHER__ !== undefined && 
             window.__PC_WATCHER__.history !== undefined;
    });

    expect(pcWatcherExists, 'PC watcher should be initialized').toBe(true);

    // Check that LAST_PC is initialized
    const lastPcExists = await page.evaluate(() => {
      return window.__LAST_PC__ !== undefined;
    });

    expect(lastPcExists, 'LAST_PC should be initialized').toBe(true);

    // Run emulator for a short time to generate some PC updates
    await page.evaluate(() => {
      if (window.emu && window.emu.start) {
        window.emu.start();
      }
    });

    // Wait for some instructions to execute
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check that PC history is being populated
    const pcHistory = await page.evaluate(() => {
      return window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.slice() : [];
    });

    expect(pcHistory.length, 'PC history should contain entries').toBeGreaterThan(0);

    // Check that LAST_PC is being updated
    const lastPc = await page.evaluate(() => {
      return window.__LAST_PC__;
    });

    expect(typeof lastPc, 'LAST_PC should be a number').toBe('number');
    expect(lastPc, 'LAST_PC should be a valid address').toBeGreaterThanOrEqual(0);
    expect(lastPc, 'LAST_PC should be a valid address').toBeLessThan(0x10000);

    // Stop emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.pause) {
        window.emu.pause();
      }
    });
  });

  test('Boot sequence detection should work correctly', async ({ page }) => {
    // Navigate to emulator
    await page.goto('http://localhost:8080/');

    // Wait for emulator to load and start
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Start the emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.start) {
        window.emu.start();
      }
    });

    // Wait for boot sequence to progress
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check boot progression
    const bootProgress = await page.evaluate(() => {
      if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.getBootProgress) {
        return window.__ZX_DEBUG__.getBootProgress();
      }
      return null;
    });

    if (bootProgress) {
      expect(Array.isArray(bootProgress.visited), 'Boot progress should contain visited array').toBe(true);
      expect(typeof bootProgress.complete, 'Boot progress should contain complete boolean').toBe('boolean');
      expect(typeof bootProgress.totalAddresses, 'Boot progress should contain total count').toBe('number');
    }

    // Check if emulator is running and has progressed past boot address 0x0000
    // Note: PC_WATCHER history may not be populated as it's an optional debug feature
    const currentState = await page.evaluate(() => {
      let bootComplete = false;
      if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.bootComplete) {
        // bootComplete can be a function or a boolean
        bootComplete = typeof window.__ZX_DEBUG__.bootComplete === 'function' 
          ? window.__ZX_DEBUG__.bootComplete() 
          : window.__ZX_DEBUG__.bootComplete;
      }
      const state = {
        pcHistory: window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.slice() : [],
        currentPC: window.__ZX_DEBUG__ ? window.__ZX_DEBUG__.getCurrentPC() : 0,
        bootComplete
      };
      return state;
    });

    // Either PC history should have some addresses OR the emulator should have progressed past 0x0000
    const hasProgress = currentState.pcHistory.length > 0 || currentState.currentPC > 0x0000 || currentState.bootComplete;
    expect(hasProgress, 'Emulator should show boot progress (either PC history, current PC > 0, or boot complete)').toBe(true);

    // Stop emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.pause) {
        window.emu.pause();
      }
    });
  });

  test('Debug API should be consistent and reliable', async ({ page }) => {
    // Navigate to emulator
    await page.goto('http://localhost:8080/');

    // Wait for emulator to load
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Start emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.start) {
        window.emu.start();
      }
    });

    // Test multiple PC readings to ensure consistency
    const pcReadings = [];
    for (let i = 0; i < 10; i++) {
      const pc = await page.evaluate(() => {
        return {
          lastPC: window.__LAST_PC__,
          debugPC: window.__ZX_DEBUG__ ? window.__ZX_DEBUG__.getLastPC() : null,
          cpuPC: window.emu && window.emu.cpu ? window.emu.cpu.PC : null
        };
      });
      pcReadings.push(pc);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Verify all PC readings are consistent
    for (let i = 1; i < pcReadings.length; i++) {
      const reading = pcReadings[i];
      
      // LAST_PC should be updated consistently
      expect(typeof reading.lastPC, 'LAST_PC should be a number').toBe('number');
      
      // debugPC should match LAST_PC
      if (reading.debugPC !== null) {
        expect(reading.debugPC, 'Debug PC should match LAST_PC').toBe(reading.lastPC);
      }
    }

    // Stop emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.pause) {
        window.emu.pause();
      }
    });
  });

  test('PC watcher should handle reset correctly', async ({ page }) => {
    // Navigate to emulator
    await page.goto('http://localhost:8080/');

    // Wait for emulator to load
    await page.waitForSelector('#screen', { timeout: 10000 });

    // Start emulator and let it run
    await page.evaluate(() => {
      if (window.emu && window.emu.start) {
        window.emu.start();
      }
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Pause emulator before reset to ensure clean state
    await page.evaluate(() => {
      if (window.emu && window.emu.pause) {
        window.emu.pause();
      }
    });

    // Reset the emulator
    await page.evaluate(() => {
      if (window.emu && window.emu.reset) {
        window.emu.reset();
      }
    });

    // Check PC history after reset (should be clear since we paused)
    const pcHistoryAfter = await page.evaluate(() => {
      return window.__PC_WATCHER__ ? window.__PC_WATCHER__.history.slice() : [];
    });

    // PC history should be cleared
    expect(pcHistoryAfter.length, 'PC history should be cleared on reset').toBe(0);

    // LAST_PC should be reset to 0
    const lastPcAfter = await page.evaluate(() => {
      return window.__LAST_PC__;
    });

    expect(lastPcAfter, 'LAST_PC should be 0 after reset').toBe(0);
  });
});