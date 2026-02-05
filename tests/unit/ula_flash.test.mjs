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

describe('FrameRenderer flash behaviour', () => {
  it('flash attribute toggles ink/paper when flashPhase bit set', () => {
    const mem = new Memory();

    // Write a bitmap byte with MSB = 1 at the first bitmap byte (0x4000)
    mem.write(0x4000, 0x80);
    // Attribute for first character cell at 0x5800. Set ink=1, paper=0, flash=1 (0x80)
    const attr = (1 & 0x07) | ((0 & 0x07) << 3) | 0x80;
    mem.write(0x5800, attr);

    const fb = new FrameBuffer();
    fb.attach(mem);
    fb.generateFromMemory();

    const canvas = createMockCanvas();
    const renderer = new FrameRenderer(canvas);

    // Calculate first main-screen pixel index where the first bitmap bit is drawn
    const topBorderPixels = 24 * 160 * 2; // each byte -> 2 pixels
    const leftBorderPixels = 16 * 2;
    const firstCellPixelIndex = topBorderPixels + leftBorderPixels; // first pixel of first cell

    // Render with flashPhase = 0 (no swap) and capture pixel
    renderer.render(fb, 0x00);
    const pixelNoFlash = renderer.pixels[firstCellPixelIndex];

    // Render with flashPhase bit set (0x10) -> ink/paper should swap for flash attribute
    renderer.render(fb, 0x10);
    const pixelFlash = renderer.pixels[firstCellPixelIndex];

    expect(pixelNoFlash).not.toBe(pixelFlash);
  });
});