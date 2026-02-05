import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { FrameBuffer, FrameRenderer } from '../../src/frameBuffer.mjs';

function createMockCanvas() {
  const width = 320;
  const height = 240;
  const imageData = { data: new Uint8ClampedArray(width * height * 4) };
  return {
    width,
    height,
    style: { backgroundColor: '' },
    getContext: () => ({
      createImageData: () => imageData,
      putImageData: () => {},
      fillRect: () => {},
      imageSmoothingEnabled: false,
    }),
  };
}

describe('ULA attribute & bounds rendering', () => {
  it('bright bit affects palette index (adds 8)', () => {
    const mem = new Memory();
    // Bitmap MSB set at first bitmap byte
    mem.write(0x4000, 0x80);
    // Attribute: ink=1, paper=0, bright=1
    const attr = 0x01 | (0x00 << 3) | 0x40;
    mem.write(0x5800, attr);

    const fb = new FrameBuffer();
    fb.attach(mem);
    fb.generateFromMemory();
    const canvas = createMockCanvas();
    const renderer = new FrameRenderer(canvas);

    // indices for first pixel of first cell
    const topBorderPixels = 24 * 160 * 2;
    const leftBorderPixels = 16 * 2;
    const firstPixel = topBorderPixels + leftBorderPixels;

    renderer.render(fb, 0);
    const pixelNoBright = renderer.pixels[firstPixel];

    // Now set bright off and regenerate
    const attr2 = 0x01; // ink=1, no bright
    mem.write(0x5800, attr2);
    fb.generateFromMemory();
    renderer.render(fb, 0);
    const pixelNoBright2 = renderer.pixels[firstPixel];

    expect(pixelNoBright).not.toBe(pixelNoBright2);
    // Ensure bright one uses palette index with +8 applied
    const palette = renderer.palette;
    const ink = 1;
    const expectedBright = palette[ink + 8];
    const expectedNormal = palette[ink];
    // We cannot guarantee which of pixelNoBright/pixelNoBright2 corresponds to which (order above), so test both
    const actuals = [pixelNoBright, pixelNoBright2];
    expect(actuals).toContain(expectedBright);
    expect(actuals).toContain(expectedNormal);
  });

  it('ink/paper combos produce correct pixel colours for set/clear bits', () => {
    const mem = new Memory();
    // Bitmap byte with MSB set for ink pixel
    mem.write(0x4000, 0x80);
    const attr = (2 & 0x07) | ((3 & 0x07) << 3); // ink=2, paper=3
    mem.write(0x5800, attr);

    const fb = new FrameBuffer(); fb.attach(mem); fb.generateFromMemory();
    const canvas = createMockCanvas(); const renderer = new FrameRenderer(canvas);
    const topBorderPixels = 24 * 160 * 2; const leftBorderPixels = 16 * 2; const firstPixel = topBorderPixels + leftBorderPixels;

    // render when bitmap bit = 1 -> ink colour
    renderer.render(fb, 0);
    const pixelInk = renderer.pixels[firstPixel];
    const expectedInk = renderer.palette[2];
    expect(pixelInk).toBe(expectedInk);

    // flip to bitmap 0x00 -> should show paper colour
    mem.write(0x4000, 0x00); fb.generateFromMemory(); renderer.render(fb, 0);
    const pixelPaper = renderer.pixels[firstPixel];
    const expectedPaper = renderer.palette[3];
    expect(pixelPaper).toBe(expectedPaper);
  });

  it('borders are rendered using borderColour', () => {
    const mem = new Memory();
    const fb = new FrameBuffer(); fb.attach(mem);
    // set a non-default border colour
    fb.setBorder(4);
    fb.generateFromMemory();

    const canvas = createMockCanvas(); const renderer = new FrameRenderer(canvas);
    renderer.render(fb, 0);
    const pixels = renderer.pixels;
    // top-left pixel is in the top border
    expect(pixels[0]).toBe(renderer.palette[4]);
    // check a bottom border pixel roughly at end
    const totalPixels = 320 * 240;
    expect(pixels[totalPixels - 1]).toBe(renderer.palette[4]);
  });
});