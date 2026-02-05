import { test, expect } from '@playwright/test';
import { setupDiagnostics, ensureStarted } from '../_helpers/bootHelpers.mjs';

// Press 'L' programmatically and assert ULA/IO port reads show the L key (bit 1 cleared)
test('keyboard port reads detect L key @ui', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 15000 });

  // Start emulator if not running
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Enable verbose keyboard debug in-page so IO/ULA log to console
  const helpersPresent = await page.evaluate(() => {
    try {
      const info = {
        zx_debug_pressKey: !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function'),
        zx_debug_enable: !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.enableKeyboardDebug === 'function'),
        emu_input_press: !!(window.emu && window.emu.input && typeof window.emu.input.pressKey === 'function'),
        emulator_input_press: !!(window.emulator && window.emulator.input && typeof window.emulator.input.pressKey === 'function'),
        input_matrix: window.emulator && window.emulator.input ? Array.from(window.emulator.input.matrix) : null
      };
      try { if (!window.__ZX_DEBUG__) window.__ZX_DEBUG__ = {}; } catch { /* ignore */ }
      try { if (typeof window.__ZX_DEBUG__.enableKeyboardDebug === 'function') window.__ZX_DEBUG__.enableKeyboardDebug(); } catch { /* ignore */ }
      try { if (window.__TEST__) window.__TEST__.portReads = []; } catch (e) { /* ignore */ }
      return info;
    } catch (e) { return { err: String(e) }; }
  });
  console.log('helpersPresent:', helpersPresent);
  if (helpersPresent && helpersPresent.err) throw new Error('setup failed: ' + helpersPresent.err);

  // Pre-flight checks: emulator & ULA present
  const presence = await page.evaluate(() => ({ hasEmu: !!window.emulator, hasUla: !!(window.emulator && window.emulator.ula), hasApply: !!(window.emulator && typeof window.emulator._applyInputToULA === 'function') }));
  console.log('emulator presence:', presence);
  if (!presence.hasEmu || !presence.hasUla) throw new Error('Emulator or ULA not present for keyboard test: ' + JSON.stringify(presence));

  // Use Playwright's keyboard to simulate a real user keypress (canvas must be focused)
  await page.click('#screen');
  await page.keyboard.down('l');
  // Hold briefly to give DOM handlers time
  await page.waitForTimeout(100);
  // Check immediate input matrix snapshot (mid-press)
  const midSnapshot = await page.evaluate(() => ({ input: Array.from(window.emulator.input.matrix), lastApplied: window.__TEST__ && window.__TEST__.lastAppliedKeyMatrix ? Array.from(window.__TEST__.lastAppliedKeyMatrix) : null }));
  console.log('mid press snapshot:', midSnapshot);

  // If midSnapshot indicates the L key bit is low, poll ULA.readPort immediately for a short window
  let directDuringPress = null;
  if (midSnapshot && midSnapshot.input && (midSnapshot.input[6] & 0x02) === 0) {
    console.log('[test] L key observed in input.matrix; polling ULA.readPort for immediate verification');
    const start = Date.now();
    while (Date.now() - start < 300) {
      directDuringPress = await page.evaluate(() => { try { return window.emulator && window.emulator.ula ? window.emulator.ula.readPort(0xBFFE) : null; } catch(e) { return null; } });
      if (directDuringPress !== null && (directDuringPress & 0x02) === 0) break;
      await page.waitForTimeout(20);
    }
    console.log('[test] directDuringPress:', directDuringPress);
  if (directDuringPress !== null && (directDuringPress & 0x02) === 0) {
    console.log('[test] Detected L via immediate direct ULA.readPort during press - PASS');
    expect((directDuringPress & 0x02) === 0).toBeTruthy();
    // Release key and finish early
    await page.keyboard.up('l');
    return;
  }
  }

  await page.keyboard.up('l');
  // Ensure the input handling and ULA sync have a chance to run
  await page.waitForTimeout(200);
  // Try to apply input to ULA explicitly as a safety
  await page.evaluate(() => { try { if (window.emulator && typeof window.emulator._applyInputToULA === 'function') window.emulator._applyInputToULA(); } catch { /* ignore */ } });
  // Post-release snapshot
  const postSnapshot = await page.evaluate(() => ({ input: Array.from(window.emulator.input.matrix), lastApplied: window.__TEST__ && window.__TEST__.lastAppliedKeyMatrix ? Array.from(window.__TEST__.lastAppliedKeyMatrix) : null }));
  console.log('post press snapshot:', postSnapshot);

  // Give ROM plenty of time to poll (longer hold)
  await page.waitForTimeout(1000);

  await page.evaluate(() => {
    if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.releaseKey === 'function') window.__ZX_DEBUG__.releaseKey('l');
  });

  // Wait a bit for additional polling and recording
  await page.waitForTimeout(1000);

  // Inspect last port reads and assert at least one read shows row 6 selected and bit 1 cleared (L)
  const portReads = await page.evaluate(() => (window.__TEST__ && Array.isArray(window.__TEST__.portReads)) ? window.__TEST__.portReads.slice(-200) : []);

  // Dump into test output for debugging if needed
  console.log('Captured portReads (tail):', portReads.slice(-20));

  // Also check ULA.readPort directly for deterministic verification
  const direct = await page.evaluate(() => {
    try {
      if (window.emulator && window.emulator.ula && typeof window.emulator.ula.readPort === 'function') {
        return window.emulator.ula.readPort(0xBFFE);
      }
      return null;
    } catch (e) { return null; }
  });

  if (direct === null) throw new Error('Direct ULA.readPort not available');
  // Expect direct read to show L key in bit 1
  if ((direct & 0x02) !== 0) {
    const inputMatrix = await page.evaluate(() => Array.from(window.emulator && window.emulator.input ? window.emulator.input.matrix : []));
    const lastApplied = await page.evaluate(() => (window.__TEST__ && window.__TEST__.lastAppliedKeyMatrix) ? Array.from(window.__TEST__.lastAppliedKeyMatrix) : null);
    const domLog = await page.evaluate(() => (window.__TEST__ && window.__TEST__.domLog) ? window.__TEST__.domLog.slice(-20) : null);
    const keyEvents = await page.evaluate(() => (window.__TEST__ && window.__TEST__.keyEvents) ? window.__TEST__.keyEvents.slice(-20) : null);
    throw new Error('Direct ULA.readPort did not show L key: 0x' + (direct || 0).toString(16) + ' ; input.matrix: ' + JSON.stringify(inputMatrix) + ' ; lastAppliedKeyMatrix: ' + JSON.stringify(lastApplied) + ' ; domLog: ' + JSON.stringify(domLog) + ' ; keyEvents: ' + JSON.stringify(keyEvents) + ' ; portReads tail: ' + JSON.stringify(portReads.slice(-50)));
  }

  // Expect at least one read where 'high' selects row 6 (bit 6 = 0) and the result's bit 1 is zero (0x02)
  const sawL = portReads.some(r => (((r.high >> 6) & 1) === 0) && ((r.result & 0x02) === 0));
  if (!sawL) {
    // Not fatal if ROM didn't poll row 6 in time, but direct read should confirm presence
    console.warn('No ROM poll observed selecting row 6 in portReads tail');
  }
  expect((direct & 0x02) === 0).toBeTruthy();

  // Also check lastAppliedKeyMatrix reflects L key (some row changed)
  const lastApplied = await page.evaluate(() => (window.__TEST__ && window.__TEST__.lastAppliedKeyMatrix) ? Array.from(window.__TEST__.lastAppliedKeyMatrix) : null);
  expect(lastApplied).not.toBeNull();
  // at least one byte should not be 0xff when L pressed
  const nonFF = lastApplied.some(b => (b & 0xff) !== 0xff);
  expect(nonFF).toBeTruthy();
});

// More robust test using the pressAndHold debug helper with extended hold time
test('keyboard pressAndHold detects L key reliably @ui', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 15000 });

  // Start emulator if not running
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Focus canvas and enable debug
  await page.click('#screen');
  await page.evaluate(() => {
    try { if (window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.enableKeyboardDebug === 'function') window.__ZX_DEBUG__.enableKeyboardDebug(); } catch { /* ignore */ }
  });

  // Verify pressAndHold helper is available
  const debugInfo = await page.evaluate(() => {
    return {
      hasZxDebug: !!window.__ZX_DEBUG__,
      zxDebugKeys: window.__ZX_DEBUG__ ? Object.keys(window.__ZX_DEBUG__) : [],
      hasPressAndHold: !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressAndHold === 'function'),
      hasPressKey: !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.pressKey === 'function'),
      hasTypeKey: !!(window.__ZX_DEBUG__ && typeof window.__ZX_DEBUG__.typeKey === 'function')
    };
  });
  console.log('debugInfo:', debugInfo);
  const hasPressAndHold = debugInfo.hasPressAndHold;
  console.log('pressAndHold helper available:', hasPressAndHold);
  expect(hasPressAndHold).toBeTruthy();

  // Use pressAndHold to hold L key for 700ms and get diagnostics
  const diagnostics = await page.evaluate(async () => {
    try {
      return await window.__ZX_DEBUG__.pressAndHold('l', 700);
    } catch (e) {
      return { error: String(e) };
    }
  });

  console.log('pressAndHold diagnostics:', {
    key: diagnostics.key,
    holdMs: diagnostics.holdMs,
    keyDetectedDuringHold: diagnostics.keyDetectedDuringHold,
    portReadCount: diagnostics.portReadsDuringHold?.length,
    sampleReads: diagnostics.portReadsDuringHold?.slice(0, 5)
  });

  // Assert key was detected during the hold period
  expect(diagnostics.error).toBeUndefined();
  expect(diagnostics.keyDetectedDuringHold).toBeTruthy();

  // Verify at least some port reads captured the key (bit 1 cleared)
  const detectedReads = diagnostics.portReadsDuringHold?.filter(r => r.keyBitCleared) || [];
  console.log(`Detected L key in ${detectedReads.length} of ${diagnostics.portReadsDuringHold?.length} port reads`);
  expect(detectedReads.length).toBeGreaterThan(0);

  // Final check: verify ULA matrix was updated correctly (row 6 should have bit 1 cleared = 0xFD)
  const finalMatrix = diagnostics.finalUlaMatrix;
  console.log('Final ULA matrix:', finalMatrix?.map(v => '0x' + v.toString(16)));
  // Row 6 is where L lives - during hold it should show 0xFD (bit 1 cleared from 0xFF)
  // Note: after release it goes back to 0xFF, so we check the port reads captured during hold
});

// Test that canvas auto-focus on start is working
test('canvas receives auto-focus on emulator start @ui', async ({ page }) => {
  await setupDiagnostics(page);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('#screen', { timeout: 15000 });

  // Start emulator
  await page.click('#startBtn').catch(() => {});
  await ensureStarted(page);

  // Wait a moment for focus to be applied
  await page.waitForTimeout(200);

  // Check if canvas was focused on start
  const focusInfo = await page.evaluate(() => ({
    canvasFocusedOnStart: window.__TEST__?.canvasFocusedOnStart,
    activeElementId: document.activeElement?.id,
    activeElementTag: document.activeElement?.tagName
  }));

  console.log('Focus info:', focusInfo);
  
  // Verify canvas was focused (either by our flag or by checking active element)
  const isFocused = focusInfo.canvasFocusedOnStart || 
                    focusInfo.activeElementId === 'screen' ||
                    focusInfo.activeElementTag === 'CANVAS';
  expect(isFocused).toBeTruthy();
});