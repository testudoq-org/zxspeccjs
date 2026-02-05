import { describe, it, expect, beforeEach } from 'vitest';
import { Memory } from '../src/memory.mjs';
import { ULA } from '../src/ula.mjs';

// Mock canvas for Node.js environment
function createMockCanvas() {
  const imageData = { data: new Uint8ClampedArray(256 * 192 * 4) };
  return {
    width: 256,
    height: 192,
    style: { backgroundColor: '' }, // Required for _updateCanvasBorder
    getContext: () => ({
      createImageData: () => imageData,
      putImageData: () => {},
      fillRect: () => {},
      imageSmoothingEnabled: false,
    }),
  };
}

describe('ULA display initialization', () => {
  let mem;
  let canvas;
  let ula;

  beforeEach(() => {
    mem = new Memory();
    canvas = createMockCanvas();
  });

  it('should set _initialized flag after first render()', () => {
    ula = new ULA(mem, canvas);
    // Before render, _initialized may be false if memory views already exist
    // (because _initializeDisplayMemory is only called when views are missing)
    // After render(), _initialized should be true
    ula.render();
    expect(ula._initialized).toBe(true);
  });

  it('should not clear display memory on first render() call', () => {
    ula = new ULA(mem, canvas);
    
    // Simulate ROM writing copyright to display memory (address 0x4000 is first bitmap byte)
    const testPattern = 0xAA; // Alternating bits pattern
    mem.write(0x4000, testPattern);
    
    // Call render - this should NOT clear the display memory
    ula.render();
    
    // Verify the test pattern is preserved (not cleared to 0x00)
    expect(mem.read(0x4000)).toBe(testPattern);
  });

  it('should preserve attribute memory on first render() call', () => {
    ula = new ULA(mem, canvas);
    
    // Write a custom attribute value (address 0x5800 is first attribute byte)
    const customAttr = 0x47; // Blue ink on white paper
    mem.write(0x5800, customAttr);
    
    // Call render - this should NOT overwrite attributes
    ula.render();
    
    // Verify the custom attribute is preserved
    expect(mem.read(0x5800)).toBe(customAttr);
  });

  it('should remain initialized after multiple render() calls', () => {
    ula = new ULA(mem, canvas);
    
    // Write test data
    mem.write(0x4000, 0x55);
    mem.write(0x5800, 0x38);
    
    // Multiple renders should not affect the display content
    ula.render();
    ula.render();
    ula.render();
    
    // Verify data is preserved
    expect(mem.read(0x4000)).toBe(0x55);
    expect(mem.read(0x5800)).toBe(0x38);
    expect(ula._initialized).toBe(true);
  });

  describe('copyright glyph regression test', () => {
    it('should not cause duplicate display clearing that erases ROM output', () => {
      // This test verifies the fix for the duplicate copyright glyph issue
      // Root cause: _initializeDisplayMemory() did not set _initialized flag,
      // causing render() to clear display AFTER ROM wrote copyright message
      
      ula = new ULA(mem, canvas);
      
      // Simulate ROM writing copyright symbol to display memory
      // Copyright glyph (©) is character 0x7F, 8 bytes at ROM 0x3FF8
      // When printed at screen position, it writes to bitmap area
      const copyrightGlyphBytes = [0x3c, 0x42, 0x99, 0xa1, 0xa1, 0x99, 0x42, 0x3c];
      
      // Write "copyright" pattern to a display location (simulating ROM print)
      // Display address for (0, 0) is 0x4000
      for (let i = 0; i < 8; i++) {
        mem.write(0x4000 + (i * 256), copyrightGlyphBytes[i]);
      }
      
      // First render should NOT clear this data
      ula.render();
      
      // Verify copyright glyph bytes are preserved
      for (let i = 0; i < 8; i++) {
        expect(mem.read(0x4000 + (i * 256))).toBe(copyrightGlyphBytes[i]);
      }
    });

    it('should have _initialized=true after first render when memory views exist', () => {
      // The key fix: render() sets _initialized = true without clearing memory
      // This prevents display memory from being erased after ROM writes
      
      ula = new ULA(mem, canvas);
      
      // Write test data before first render
      mem.write(0x4000, 0xFF);
      
      // First render sets _initialized = true without clearing
      ula.render();
      
      expect(ula._initialized).toBe(true);
      expect(mem.read(0x4000)).toBe(0xFF); // Data preserved
    });
  });
});
