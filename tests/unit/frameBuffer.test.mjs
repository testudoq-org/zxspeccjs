import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

describe('FrameBuffer / FrameRenderer', () => {
  let mem;

  beforeEach(() => {
    mem = new Memory();
  });

  afterEach(() => {
    if (globalThis.__TEST__) {
      delete globalThis.__TEST__.frameRendered;
    }
  });

  it('generateFromMemory copies bitmap and attributes into buffer', () => {
    // Arrange
    mem.write(0x4000, 0xAA);
    mem.write(0x5800, 0x47);

    const fb = new FrameBuffer();
    fb.attach(mem);

    // Act
    fb.generateFromMemory();

    // Assert
    const buf = fb.getBuffer();
    const topBorderBytes = 24 * 160; // top border size in bytes
    const index = topBorderBytes + 16; // start of first main line (after left border)

    expect(buf[index]).toBe(0xAA);
    expect(buf[index + 1]).toBe(0x47);
    expect(fb.writePtr).toBeGreaterThan(index + 1);
  });

  it('render writes pixels and triggers frameRendered hook', () => {
    // Arrange
    mem.write(0x4000, 0xFF);
    mem.write(0x5800, 0x07);

    const fb = new FrameBuffer();
    fb.attach(mem);
    fb.generateFromMemory();

    const canvas = createMockCanvas();
    const renderer = new FrameRenderer(canvas);

    let called = false;
    globalThis.__TEST__ = globalThis.__TEST__ || {};
    globalThis.__TEST__.frameRendered = () => { called = true; };

    // Act
    renderer.render(fb, fb.getFlashPhase());

    // Assert
    expect(called).toBe(true);

    const pixels = renderer.pixels; // Uint32Array
    const buf = fb.getBuffer();

    // Top-left pixel should match border palette entry for the first byte in buffer
    const expected = renderer.palette[buf[0]];
    expect(pixels[0]).toBe(expected);
  });
});