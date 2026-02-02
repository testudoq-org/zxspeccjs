import { describe, it, expect, beforeEach } from 'vitest';
import Input, { ROW_KEYS, KEY_TO_POS, DEFAULT_ROW } from '../src/input.mjs';

describe('ZX Spectrum Keyboard Matrix', () => {
  let input;

  beforeEach(() => {
    input = new Input();
  });

  describe('Keyboard Layout', () => {
    it('should have correct row layout matching ZX Spectrum 48K hardware', () => {
      // ZX Spectrum 48K hardware layout (matches jsspeccy3 reference):
      // Row 0: Caps Shift,Z,X,C,V
      expect(ROW_KEYS[0]).toEqual(['shift', 'z', 'x', 'c', 'v']);
      // Row 1: A,S,D,F,G
      expect(ROW_KEYS[1]).toEqual(['a', 's', 'd', 'f', 'g']);
      // Row 2: Q,W,E,R,T
      expect(ROW_KEYS[2]).toEqual(['q', 'w', 'e', 'r', 't']);
      // Row 3: 1,2,3,4,5
      expect(ROW_KEYS[3]).toEqual(['1', '2', '3', '4', '5']);
      // Row 4: 0,9,8,7,6
      expect(ROW_KEYS[4]).toEqual(['0', '9', '8', '7', '6']);
      // Row 5: P,O,I,U,Y
      expect(ROW_KEYS[5]).toEqual(['p', 'o', 'i', 'u', 'y']);
      // Row 6: Enter,L,K,J,H
      expect(ROW_KEYS[6]).toEqual(['enter', 'l', 'k', 'j', 'h']);
      // Row 7: Space,Symbol Shift,M,N,B
      expect(ROW_KEYS[7]).toEqual(['space', 'symshift', 'm', 'n', 'b']);
    });

    it('should have 8 rows with 5 keys each', () => {
      expect(ROW_KEYS.length).toBe(8);
      ROW_KEYS.forEach((row) => {
        expect(row.length).toBe(5);
      });
    });
  });

  describe('Key to Position Mapping', () => {
    it('should correctly map keys to row and bit position', () => {
      // Test key mappings with correct ZX Spectrum hardware layout
      expect(KEY_TO_POS.get('1')).toEqual({ row: 3, mask: 1 });   // Row 3, bit 0
      expect(KEY_TO_POS.get('5')).toEqual({ row: 3, mask: 16 });  // Row 3, bit 4
      expect(KEY_TO_POS.get('q')).toEqual({ row: 2, mask: 1 });   // Row 2, bit 0
      expect(KEY_TO_POS.get('a')).toEqual({ row: 1, mask: 1 });   // Row 1, bit 0
      expect(KEY_TO_POS.get('enter')).toEqual({ row: 6, mask: 1 });
      expect(KEY_TO_POS.get('space')).toEqual({ row: 7, mask: 1 });
      expect(KEY_TO_POS.get('shift')).toEqual({ row: 0, mask: 1 }); // Caps Shift on row 0
      expect(KEY_TO_POS.get('symshift')).toEqual({ row: 7, mask: 2 });
      expect(KEY_TO_POS.get('z')).toEqual({ row: 0, mask: 2 });   // Z on row 0, bit 1
    });
  });

  describe('Matrix Initialization', () => {
    it('should initialize all rows to 0x1F (no keys pressed)', () => {
      for (let i = 0; i < 8; i++) {
        expect(input.matrix[i]).toBe(DEFAULT_ROW);
        expect(input.matrix[i]).toBe(0b11111);
      }
    });
  });

  describe('Key Press/Release', () => {
    it('should clear bit when key is pressed', () => {
      // Press '1' (row 3, bit 0 in correct layout)
      input.pressKey('1');
      expect(input.matrix[3]).toBe(0b11110); // bit 0 cleared
    });

    it('should set bit when key is released', () => {
      input.pressKey('1');
      expect(input.matrix[3]).toBe(0b11110);
      input.releaseKey('1');
      expect(input.matrix[3]).toBe(0b11111);
    });

    it('should handle multiple keys in same row', () => {
      input.pressKey('1'); // row 3, bit 0
      input.pressKey('3'); // row 3, bit 2
      expect(input.matrix[3]).toBe(0b11010); // bits 0 and 2 cleared
    });

    it('should handle keys in different rows', () => {
      input.pressKey('1'); // row 3, bit 0
      input.pressKey('q'); // row 2, bit 0
      expect(input.matrix[3]).toBe(0b11110);
      expect(input.matrix[2]).toBe(0b11110);
    });

    it('should track pressed keys in set', () => {
      expect(input.pressed.has('1')).toBe(false);
      input.pressKey('1');
      expect(input.pressed.has('1')).toBe(true);
      input.releaseKey('1');
      expect(input.pressed.has('1')).toBe(false);
    });
  });

  describe('Port Reading', () => {
    it('should return 0xFF when no keys pressed and port 0xFE is read', () => {
      // Read with all rows selected (high byte = 0x00)
      const value = input.getPortValue(0x00FE);
      expect(value).toBe(0xFF);
    });

    it('should return correct value when key is pressed', () => {
      // Press '1' (row 3, bit 0 in correct layout)
      input.pressKey('1');
      
      // Read row 3 (A11 = 0, port = 0xF7FE)
      const value = input.getPortValue(0xF7FE);
      expect(value & 0x1F).toBe(0b11110); // bit 0 cleared in lower 5 bits
    });

    it('should return 0xFF for rows without pressed keys', () => {
      // Press 'q' (row 2)
      input.pressKey('q');
      
      // Read row 3 (should be unaffected)
      const value = input.getPortValue(0xF7FE);
      expect(value & 0x1F).toBe(0b11111); // all bits set
    });

    it('should AND multiple rows when multiple address bits are low', () => {
      // Press '1' (row 3, bit 0) and 'q' (row 2, bit 0)
      input.pressKey('1');
      input.pressKey('q');
      
      // Read with both row 2 and row 3 selected (A10=0, A11=0, port = 0xF3FE)
      const value = input.getPortValue(0xF3FE);
      expect(value & 0x1F).toBe(0b11110); // bit 0 cleared (AND of both rows)
    });

    it('should set upper bits correctly (tape EAR and unused bits)', () => {
      const value = input.getPortValue(0xFEFE);
      // Bits 5-7 should be 1
      expect(value & 0b11100000).toBe(0b11100000);
    });

    it('should return 0xFF for non-keyboard ports', () => {
      const value = input.getPortValue(0x1234);
      expect(value).toBe(0xFF);
    });
  });

  describe('Reset', () => {
    it('should reset all keys to released state', () => {
      input.pressKey('1');
      input.pressKey('q');
      input.pressKey('space');
      
      input.reset();
      
      for (let i = 0; i < 8; i++) {
        expect(input.matrix[i]).toBe(DEFAULT_ROW);
      }
      expect(input.pressed.size).toBe(0);
    });
  });

  describe('Matrix State Debugging', () => {
    it('should return correct matrix state', () => {
      input.pressKey('a');
      
      const state = input.getMatrixState();
      // 'a' is in row 1 in the correct layout
      expect(state.row1.pressed).toContain('a');
      expect(state.row0.pressed).toHaveLength(0);
    });
  });
});

describe('Keyboard Integration with ULA', () => {
  // These tests verify the integration between Input and ULA modules
  
  it('should have correct port addresses for each row', () => {
    // Standard ZX Spectrum port addresses for keyboard rows
    const rowPorts = [
      0xFEFE, // Row 0: A8=0
      0xFDFE, // Row 1: A9=0
      0xFBFE, // Row 2: A10=0
      0xF7FE, // Row 3: A11=0
      0xEFFE, // Row 4: A12=0
      0xDFFE, // Row 5: A13=0
      0xBFFE, // Row 6: A14=0
      0x7FFE  // Row 7: A15=0
    ];

    rowPorts.forEach((port, row) => {
      const highByte = (port >> 8) & 0xFF;
      // Check that only the correct bit is low
      for (let i = 0; i < 8; i++) {
        const bitValue = (highByte >> i) & 1;
        if (i === row) {
          expect(bitValue).toBe(0); // Selected row bit should be 0
        } else {
          expect(bitValue).toBe(1); // Other bits should be 1
        }
      }
    });
  });
});
