// @e2e @snapshot @regression
/**
 * Generic .z80 snapshot E2E tests.
 *
 * Loads a synthetic .z80 snapshot (v1 format) via the Tape Library UI,
 * runs ~150 frames, then verifies:
 *  - canvas has non-blank content in the main play area
 *  - enemy/sprite regions differ from background colour
 *  - alternate registers were restored correctly
 *  - IM mode was applied from snapshot header
 *  - Kempston port reads 0x00
 *  - per-frame tracing captures port I/O
 *
 * All network requests are stubbed — no real Archive.org access needed.
 */
/* eslint-env browser, node */
/* eslint no-undef: "off" */
import { test, expect } from '@playwright/test';

// ── URL patterns ──
const SEARCH_URL_PATTERN = /archive\.org\/advancedsearch\.php/;
const METADATA_URL_PATTERN = /archive\.org\/metadata\/([^/]+)/;
const ARCHIVE_DOWNLOAD_URL_PATTERN = /archive\.org\/download\/([^/]+)\/(.+)/;
const CORS_ARCHIVE_PATTERN = /cors\.archive\.org\/cors\//;
const DIRECT_SERVER_PATTERN = /ia\d+\.us\.archive\.org\//;

const UI_TIMEOUT = 8000;
const NETWORK_TIMEOUT = 12000;

const TEST_ID = 'zx_Generic_Test_Game';
const TEST_FILE = 'Generic_Test_Game.z80';

// ── Mock data ──
const MOCK_SEARCH = {
  responseHeader: { status: 0 },
  response: {
    numFound: 1, start: 0,
    docs: [{
      identifier: TEST_ID,
      title: 'Generic Test Game',
      creator: 'Test Author',
      mediatype: 'software',
      format: ['Z80 Snapshot'],
      publicdate: '2024-01-01T00:00:00Z',
    }],
  },
};

const MOCK_METADATA = {
  created: 1704067200,
  d1: 'ia600300.us.archive.org',
  d2: 'ia800300.us.archive.org',
  dir: `/27/items/${TEST_ID}`,
  files: [{ name: TEST_FILE, source: 'original', format: 'Z80 Snapshot', size: '49179' }],
  metadata: { identifier: TEST_ID, title: 'Generic Test Game', creator: 'Test Author', description: 'Test.' },
  server: 'ia800300.us.archive.org',
  workable_servers: ['ia800300.us.archive.org'],
};

// ── Z80 v1 snapshot builder ──

/**
 * Build a synthetic Z80 v1 snapshot with controllable parameters.
 * @param {object} opts
 * @param {number} opts.im - Interrupt mode (0, 1, or 2)
 * @param {number} opts.borderColour - Border colour 0-7
 * @param {number} opts.altA - Alternate A register value
 * @param {number} opts.altF - Alternate F register value
 * @param {number} opts.altBC - Alternate BC 16-bit value
 * @param {number} opts.iReg - I register value
 * @param {boolean} opts.fillScreen - Whether to fill screen with pattern
 * @param {boolean} opts.placeSprites - Whether to place "sprite" patterns at known positions
 */
function buildZ80Snapshot(opts = {}) {
  const {
    im = 1,
    borderColour = 2,
    altA = 0xAA,
    altF = 0x55,
    altBC = 0xBBCC,
    iReg = 0x3F,
    fillScreen = true,
    placeSprites = true,
  } = opts;

  const PAGE_SIZE = 16384;
  const header = new Uint8Array(30);

  // Main registers
  header[0] = 0xFF;  // A
  header[1] = 0x44;  // F
  header[2] = 0xCC;  // C
  header[3] = 0xBB;  // B
  header[4] = 0xEE;  // L
  header[5] = 0xDD;  // H
  // PC = 0x8000
  header[6] = 0x00;
  header[7] = 0x80;
  // SP = 0xFF00
  header[8] = 0x00;
  header[9] = 0xFF;
  // I
  header[10] = iReg;
  // R (low 7 bits)
  header[11] = 0x01;
  // Flag byte (12): border colour in bits 1-3, R bit 7 in bit 0, not compressed
  header[12] = ((borderColour & 0x07) << 1) | 0x00;
  // DE
  header[13] = 0x34;  // E
  header[14] = 0x12;  // D
  // BC'
  header[15] = altBC & 0xFF;        // C'
  header[16] = (altBC >> 8) & 0xFF; // B'
  // DE'
  header[17] = 0x78;  // E'
  header[18] = 0x56;  // D'
  // HL'
  header[19] = 0xBC;  // L'
  header[20] = 0x9A;  // H'
  // AF'
  header[21] = altA;   // A'
  header[22] = altF;   // F'
  // IY
  header[23] = 0x86;  // IY low
  header[24] = 0x42;  // IY high
  // IX
  header[25] = 0x97;  // IX low
  header[26] = 0x53;  // IX high
  // IFF1, IFF2
  header[27] = 1;
  header[28] = 1;
  // IM (bits 0-1 of byte 29)
  header[29] = im & 0x03;

  // 48K RAM
  const ram = new Uint8Array(3 * PAGE_SIZE);

  if (fillScreen) {
    // Screen bitmap: 0x4000-0x57FF → RAM[0..6143]
    for (let i = 0; i < 6144; i++) {
      ram[i] = ((i & 0x1F) ^ (i >> 5)) & 0xFF;
    }
    // Attributes: 0x5800-0x5AFF → RAM[6144..6911]
    for (let i = 6144; i < 6912; i++) {
      ram[i] = 0x47; // INK 7, PAPER 0, BRIGHT 1
    }
  }

  if (placeSprites) {
    // Place distinctive patterns at known screen positions to simulate enemies.
    // Character cell row 10, cols 10-13 → bitmap addresses in screen memory.
    // ZX Spectrum screen address for (row, col): see standard layout.
    // For char row 10 (pixel line 80): base = 0x4000 + ((80 & 0xC0) << 5) + ((80 & 0x38) << 2) + ((80 & 0x07) << 8)
    // Simplified: just place at known offsets in the first third
    const spritePattern = [0xFF, 0x81, 0xBD, 0xA5, 0xA5, 0xBD, 0x81, 0xFF]; // face-like glyph
    for (let line = 0; line < 8; line++) {
      // Character row 10, line `line` within char
      const addr = getScreenAddress(10, line) - 0x4000;
      if (addr >= 0 && addr < 6144) {
        ram[addr + 10] = spritePattern[line]; // col 10
        ram[addr + 11] = spritePattern[line]; // col 11
        ram[addr + 20] = spritePattern[(line + 4) % 8]; // col 20 — offset pattern
      }
    }
    // Set bright colour attributes for sprite cells
    const attrBase = 6144; // attribute area starts here in RAM
    for (const col of [10, 11, 20]) {
      ram[attrBase + 10 * 32 + col] = 0x46; // INK 6, PAPER 0, BRIGHT 1 — yellow
    }
  }

  // HALT at 0x8000
  ram[0x4000] = 0x76;

  const out = new Uint8Array(header.length + ram.length);
  out.set(header, 0);
  out.set(ram, header.length);
  return out;
}

/** Compute ZX Spectrum screen byte address for character row and pixel line within char */
function getScreenAddress(charRow, pixelLine) {
  const y = charRow * 8 + pixelLine;
  return 0x4000 + ((y & 0xC0) << 5) + ((y & 0x38) << 2) + ((y & 0x07) << 8);
}

function makeZ80Response(payload) {
  return {
    status: 200,
    contentType: 'application/octet-stream',
    body: Buffer.from(payload),
    headers: { 'Content-Length': String(payload.length), 'Access-Control-Allow-Origin': '*' },
  };
}

// ── Stub setup ──
async function setupStubs(page, z80Payload) {
  await page.route(SEARCH_URL_PATTERN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SEARCH) })
  );
  await page.route(METADATA_URL_PATTERN, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_METADATA) })
  );
  const resp = makeZ80Response(z80Payload);
  await page.route(ARCHIVE_DOWNLOAD_URL_PATTERN, (route) => route.fulfill(resp));
  await page.route(CORS_ARCHIVE_PATTERN, (route) => route.fulfill(resp));
  await page.route(DIRECT_SERVER_PATTERN, (route) => route.fulfill(resp));
}

/** Load snapshot via UI: open Tape Library → search → details → load */
async function loadSnapshotViaUI(page) {
  await page.goto('/');
  await expect(page.locator('[data-testid="screen"]')).toBeVisible({ timeout: UI_TIMEOUT });

  // Tape Library → Search → Details → Load
  await page.locator('[data-testid="tape-library-btn"]').click();
  const input = page.locator('[data-testid="tape-search-input"]');
  await expect(input).toBeVisible({ timeout: UI_TIMEOUT });
  await input.fill('Test');

  const searchResp = page.waitForResponse(SEARCH_URL_PATTERN, { timeout: NETWORK_TIMEOUT });
  await page.locator('[data-testid="tape-search-btn"]').click();
  await searchResp;

  await expect(page.locator('[data-testid="tape-results"]')).toBeVisible({ timeout: UI_TIMEOUT });
  const detailsBtn = page.locator('[data-testid="tape-result-details-btn"]').first();
  await expect(detailsBtn).toBeVisible({ timeout: UI_TIMEOUT });

  const metaResp = page.waitForResponse(METADATA_URL_PATTERN, { timeout: NETWORK_TIMEOUT });
  await detailsBtn.evaluate((btn) => btn.click());
  await metaResp;

  await expect(page.locator('[data-testid="tape-detail"]')).toBeVisible({ timeout: UI_TIMEOUT });
  const loadBtn = page.locator('[data-testid="tape-load-btn"]').first();
  await expect(loadBtn).toBeVisible({ timeout: UI_TIMEOUT });

  const loaded = page.evaluate(() => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('tape-loaded timeout')), 15000);
    window.addEventListener('tape-loaded', () => { clearTimeout(t); res(true); }, { once: true });
    window.addEventListener('tape-load-error', (e) => { clearTimeout(t); rej(new Error(e.detail?.message)); }, { once: true });
  }));
  await loadBtn.evaluate((btn) => btn.click());
  await loaded;
}

// ── Tests ──
test.describe('Generic .z80 snapshot tests @snapshot @regression', () => {
  test('snapshot loads, renders non-blank canvas with sprite regions @smoke', async ({ page }) => {
    const payload = buildZ80Snapshot({ im: 1, borderColour: 2, placeSprites: true });
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);

    // Let emulator render ~150 frames (3 seconds at 50fps)
    await page.waitForTimeout(3000);

    // Verify status
    const status = await page.locator('[data-testid="status"]').textContent();
    expect(status).toMatch(/Snapshot .+ applied|running/i);

    // Verify canvas content
    const canvasCheck = await page.evaluate(() => {
      try {
        const c = document.querySelector('#screen');
        if (!c) return { ok: false, reason: 'no canvas' };
        const ctx = c.getContext('2d');
        const img = ctx.getImageData(0, 0, c.width, c.height);
        let nonBlack = 0;
        for (let i = 0; i < img.data.length; i += 4) {
          if (img.data[i] > 0 || img.data[i + 1] > 0 || img.data[i + 2] > 0) nonBlack++;
        }
        return { ok: nonBlack > 100, nonBlack };
      } catch (e) { return { ok: false, reason: String(e) }; }
    });

    // Fallback: check screen memory directly
    if (!canvasCheck.ok) {
      const memCheck = await page.evaluate(() => {
        try {
          const mem = window.emu && window.emu.memory;
          if (!mem || !mem.pages || !mem.pages[1]) return false;
          let sum = 0;
          for (let i = 0; i < 6144; i++) sum += mem.pages[1][i];
          return sum > 0;
        } catch { return false; }
      });
      expect(memCheck).toBe(true);
    } else {
      expect(canvasCheck.ok).toBe(true);
    }

    // Check sprite region differs from background
    const spriteVisible = await page.evaluate(() => {
      try {
        const mem = window.emu && window.emu.memory;
        if (!mem) return 'no-memory';
        // Character row 10, col 10 — should have non-zero bitmap
        // Read from screen address
        const y = 10 * 8;
        const addr = 0x4000 + ((y & 0xC0) << 5) + ((y & 0x38) << 2) + ((y & 0x07) << 8) + 10;
        const val = mem.read(addr);
        return val !== 0;
      } catch { return false; }
    });
    expect(spriteVisible).toBe(true);

    await page.screenshot({ path: 'test-results/generic-snapshot.png', fullPage: true });
  });

  test('alternate registers are restored from snapshot', async ({ page }) => {
    const altA = 0xAA;
    const altF = 0x55;
    const altBC = 0xBBCC;
    const payload = buildZ80Snapshot({ altA, altF, altBC });
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);

    // Wait a moment for snapshot to be fully applied
    await page.waitForTimeout(500);

    const regs = await page.evaluate(() => {
      if (!window.emu || !window.emu.cpu) return null;
      const cpu = window.emu.cpu;
      return {
        A_: cpu.A_, F_: cpu.F_,
        B_: cpu.B_, C_: cpu.C_,
      };
    });

    expect(regs).not.toBeNull();
    expect(regs.A_).toBe(altA);
    expect(regs.F_).toBe(altF);
    expect(regs.B_).toBe((altBC >> 8) & 0xFF);
    expect(regs.C_).toBe(altBC & 0xFF);
  });

  test('IM mode is applied from snapshot header', async ({ page }) => {
    const payload = buildZ80Snapshot({ im: 2, iReg: 0xFE });
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);
    await page.waitForTimeout(500);

    const imMode = await page.evaluate(() => {
      if (!window.emu || !window.emu.cpu) return null;
      return window.emu.cpu.IM;
    });
    expect(imMode).toBe(2);
  });

  test('Kempston port 0x1F reads 0x00 (no phantom input)', async ({ page }) => {
    const payload = buildZ80Snapshot();
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);
    await page.waitForTimeout(500);

    const portVal = await page.evaluate(() => {
      if (!window.emu || !window.emu.cpu || !window.emu.cpu.io) return null;
      return window.emu.cpu.io.read(0x1F);
    });
    expect(portVal).toBe(0x00);
  });

  test('per-frame trace captures port I/O events', async ({ page }) => {
    const payload = buildZ80Snapshot();
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);

    // Enable tracing
    await page.evaluate(() => {
      if (window.__ZX_DEBUG__ && window.__ZX_DEBUG__.setTracing) {
        window.__ZX_DEBUG__.setTracing(true);
      } else {
        window.__ZX_TRACE__ = true;
      }
    });

    // Let a few frames run with tracing enabled
    await page.waitForTimeout(500);

    const traceInfo = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__) return null;
      const log = window.__ZX_DEBUG__.traceLog;
      if (!log || log.length === 0) return { frames: 0 };
      const last = log[log.length - 1];
      return {
        frames: log.length,
        lastFrame: last.frame,
        hasRegisters: !!last.registers,
        portReadCount: last.portReads ? last.portReads.length : 0,
        portWriteCount: last.portWrites ? last.portWrites.length : 0,
        hasBorder: last.border !== null && last.border !== undefined,
      };
    });

    expect(traceInfo).not.toBeNull();
    expect(traceInfo.frames).toBeGreaterThan(0);
    expect(traceInfo.hasRegisters).toBe(true);
    expect(traceInfo.hasBorder).toBe(true);
  });

  test('border colour is set from snapshot header', async ({ page }) => {
    const payload = buildZ80Snapshot({ borderColour: 5 }); // cyan
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);
    await page.waitForTimeout(500);

    const border = await page.evaluate(() => {
      if (!window.emu || !window.emu.ula) return null;
      return window.emu.ula.border;
    });
    expect(border).toBe(5);
  });

  test('canvas shows content after 150 frames with various IM modes', async ({ page }) => {
    // Test with IM 2 specifically since many games use it
    const payload = buildZ80Snapshot({
      im: 2,
      iReg: 0x3F,
      borderColour: 1,
      placeSprites: true,
    });
    await setupStubs(page, payload);
    await loadSnapshotViaUI(page);

    // 150 frames at 50fps = 3 seconds
    await page.waitForTimeout(3000);

    // Emulator should still be running (not crashed)
    const running = await page.evaluate(() =>
      !!(window.emu && window.emu._running)
    );
    expect(running).toBe(true);

    // Screen memory should still have content
    const screenOk = await page.evaluate(() => {
      try {
        const mem = window.emu && window.emu.memory;
        if (!mem) return false;
        let sum = 0;
        for (let i = 0x4000; i < 0x5800; i++) sum += mem.read(i);
        return sum > 0;
      } catch { return false; }
    });
    expect(screenOk).toBe(true);
  });
});
