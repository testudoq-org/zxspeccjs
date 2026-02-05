#!/usr/bin/env node
/**
 * Detailed ROM Analysis Tool
 * Deep analysis of ZX Spectrum 48K ROM content and structure
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DetailedROMAnalyzer {
  constructor() {
    this.romData = null;
    this.romPath = null;
  }

  loadROM() {
    try {
      // Try to load the binary ROM file first
      this.romPath = path.join(__dirname, 'roms', 'spec48.rom');
      const buffer = fs.readFileSync(this.romPath);
      this.romData = new Uint8Array(buffer);
      console.log(`✅ Loaded ROM from: ${this.romPath}`);
      console.log(`📊 ROM size: ${this.romData.length} bytes`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to load ROM: ${error.message}`);
      return false;
    }
  }

  analyzeBootSequence() {
    console.log('\n🔍 BOOT SEQUENCE ANALYSIS');
    console.log('='.repeat(50));
    
    if (this.romData.length < 20) {
      console.log('❌ ROM too small for analysis');
      return;
    }

    // First few bytes
    console.log('📍 First 20 bytes:');
    for (let i = 0; i < Math.min(20, this.romData.length); i++) {
      const byte = this.romData[i];
      const opcode = this.getOpcodeName(byte);
      console.log(`  0x${i.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} (${byte.toString().padStart(3)}) - ${opcode}`);
    }

    // Check for common boot patterns
    const firstBytes = Array.from(this.romData.slice(0, 6));
    console.log(`\n🔍 First 6 bytes: [${firstBytes.map(b => '0x' + b.toString(16)).join(', ')}]`);
    
    // ZX Spectrum 48K ROM starts with: F3 AF 11 FF FF C3
    // F3 = DI (Disable Interrupts)
    // AF = XOR A (Clear A register)
    // 11 = LD DE, nn (Load DE with next word)
    // C3 = JP nn (Jump to address)
    
    const expectedPattern = [0xF3, 0xAF, 0x11, 0xFF, 0xFF, 0xC3];
    let matches = 0;
    for (let i = 0; i < Math.min(expectedPattern.length, firstBytes.length); i++) {
      if (firstBytes[i] === expectedPattern[i]) matches++;
    }
    
    console.log(`\n✅ Boot pattern match: ${matches}/${expectedPattern.length} bytes`);
    if (matches === expectedPattern.length) {
      console.log('✅ Boot sequence matches standard ZX Spectrum 48K ROM');
    } else {
      console.log('⚠️  Boot sequence does not match standard pattern');
    }
  }

  getOpcodeName(byte) {
    const opcodes = {
      0x00: 'NOP', 0x01: 'LD BC,nn', 0x02: 'LD (BC),A', 0x03: 'INC BC',
      0x04: 'INC B', 0x05: 'DEC B', 0x06: 'LD B,n', 0x07: 'RLCA',
      0x08: 'EX AF,AF\\'', 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)', 0x0B: 'DEC BC',
      0x0C: 'INC C', 0x0D: 'DEC C', 0x0E: 'LD C,n', 0x0F: 'RRCA',
      0x10: 'DJNZ d', 0x11: 'LD DE,nn', 0x12: 'LD (DE),A', 0x13: 'INC DE',
      0x14: 'INC D', 0x15: 'DEC D', 0x16: 'LD D,n', 0x17: 'RLA',
      0x18: 'JR d', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)', 0x1B: 'DEC DE',
      0x1C: 'INC E', 0x1D: 'DEC E', 0x1E: 'LD E,n', 0x1F: 'RRA',
      0x20: 'JR NZ,d', 0x21: 'LD HL,nn', 0x22: 'LD (nn),HL', 0x23: 'INC HL',
      0x24: 'INC H', 0x25: 'DEC H', 0x26: 'LD H,n', 0x27: 'DAA',
      0x28: 'JR Z,d', 0x29: 'ADD HL,HL', 0x2A: 'LD HL,(nn)', 0x2B: 'DEC HL',
      0x2C: 'INC L', 0x2D: 'DEC L', 0x2E: 'LD L,n', 0x2F: 'CPL',
      0x30: 'JR NC,d', 0x31: 'LD SP,nn', 0x32: 'LD (nn),A', 0x33: 'INC SP',
      0x34: 'INC (HL)', 0x35: 'DEC (HL)', 0x36: 'LD (HL),n', 0x37: 'SCF',
      0x38: 'JR C,d', 0x39: 'ADD HL,SP', 0x3A: 'LD A,(nn)', 0x3B: 'DEC SP',
      0x3C: 'INC A', 0x3D: 'DEC A', 0x3E: 'LD A,n', 0x3F: 'CCF',
      0x40: 'LD B,B', 0x41: 'LD B,C', 0x42: 'LD B,D', 0x43: 'LD B,E',
      0x44: 'LD B,H', 0x45: 'LD B,L', 0x46: 'LD B,(HL)', 0x47: 'LD B,A',
      0x48: 'LD C,B', 0x49: 'LD C,C', 0x4A: 'LD C,D', 0x4B: 'LD C,E',
      0x4C: 'LD C,H', 0x4D: 'LD C,L', 0x4E: 'LD C,(HL)', 0x4F: 'LD C,A',
      0x50: 'LD D,B', 0x51: 'LD D,C', 0x52: 'LD D,D', 0x53: 'LD D,E',
      0x54: 'LD D,H', 0x55: 'LD D,L', 0x56: 'LD D,(HL)', 0x57: 'LD D,A',
      0x58: 'LD E,B', 0x59: 'LD E,C', 0x5A: 'LD E,D', 0x5B: 'LD E,E',
      0x5C: 'LD E,H', 0x5D: 'LD E,L', 0x5E: 'LD E,(HL)', 0x5F: 'LD E,A',
      0x60: 'LD H,B', 0x61: 'LD H,C', 0x62: 'LD H,D', 0x63: 'LD H,E',
      0x64: 'LD H,H', 0x65: 'LD H,L', 0x66: 'LD H,(HL)', 0x67: 'LD H,A',
      0x68: 'LD L,B', 0x69: 'LD L,C', 0x6A: 'LD L,D', 0x6B: 'LD L,E',
      0x6C: 'LD L,H', 0x6D: 'LD L,L', 0x6E: 'LD L,(HL)', 0x6F: 'LD L,A',
      0x70: 'LD (HL),B', 0x71: 'LD (HL),C', 0x72: 'LD (HL),D', 0x73: 'LD (HL),E',
      0x74: 'LD (HL),H', 0x75: 'LD (HL),L', 0x76: 'HALT', 0x77: 'LD (HL),A',
      0x78: 'LD A,B', 0x79: 'LD A,C', 0x7A: 'LD A,D', 0x7B: 'LD A,E',
      0x7C: 'LD A,H', 0x7D: 'LD A,L', 0x7E: 'LD A,(HL)', 0x7F: 'LD A,A',
      0x80: 'ADD A,B', 0x81: 'ADD A,C', 0x82: 'ADD A,D', 0x83: 'ADD A,E',
      0x84: 'ADD A,H', 0x85: 'ADD A,L', 0x86: 'ADD A,(HL)', 0x87: 'ADD A,A',
      0x88: 'ADC A,B', 0x89: 'ADC A,C', 0x8A: 'ADC A,D', 0x8B: 'ADC A,E',
      0x8C: 'ADC A,H', 0x8D: 'ADC A,L', 0x8E: 'ADC A,(HL)', 0x8F: 'ADC A,A',
      0x90: 'SUB B', 0x91: 'SUB C', 0x92: 'SUB D', 0x93: 'SUB E',
      0x94: 'SUB H', 0x95: 'SUB L', 0x96: 'SUB (HL)', 0x97: 'SUB A',
      0x98: 'SBC A,B', 0x99: 'SBC A,C', 0x9A: 'SBC A,D', 0x9B: 'SBC A,E',
      0x9C: 'SBC A,H', 0x9D: 'SBC A,L', 0x9E: 'SBC A,(HL)', 0x9F: 'SBC A,A',
      0xA0: 'AND B', 0xA1: 'AND C', 0xA2: 'AND D', 0xA3: 'AND E',
      0xA4: 'AND H', 0xA5: 'AND L', 0xA6: 'AND (HL)', 0xA7: 'AND A',
      0xA8: 'XOR B', 0xA9: 'XOR C', 0xAA: 'XOR D', 0xAB: 'XOR E',
      0xAC: 'XOR H', 0xAD: 'XOR L', 0xAE: 'XOR (HL)', 0xAF: 'XOR A',
      0xB0: 'OR B', 0xB1: 'OR C', 0xB2: 'OR D', 0xB3: 'OR E',
      0xB4: 'OR H', 0xB5: 'OR L', 0xB6: 'OR (HL)', 0xB7: 'OR A',
      0xB8: 'CP B', 0xB9: 'CP C', 0xBA: 'CP D', 0xBB: 'CP E',
      0xBC: 'CP H', 0xBD: 'CP L', 0xBE: 'CP (HL)', 0xBF: 'CP A',
      0xC0: 'RET NZ', 0xC1: 'POP BC', 0xC2: 'JP NZ,nn', 0xC3: 'JP nn',
      0xC4: 'CALL NZ,nn', 0xC5: 'PUSH BC', 0xC6: 'ADD A,n', 0xC7: 'RST 0',
      0xC8: 'RET Z', 0xC9: 'RET', 0xCA: 'JP Z,nn', 0xCB: 'PREFIX CB',
      0xCC: 'CALL Z,nn', 0xCD: 'CALL nn', 0xCE: 'ADC A,n', 0xCF: 'RST 8',
      0xD0: 'RET NC', 0xD1: 'POP DE', 0xD2: 'JP NC,nn', 0xD3: 'OUT (n),A',
      0xD4: 'CALL NC,nn', 0xD5: 'PUSH DE', 0xD6: 'SUB n', 0xD7: 'RST 10',
      0xD8: 'RET C', 0xD9: 'EXX', 0xDA: 'JP C,nn', 0xDB: 'IN A,(n)',
      0xDC: 'CALL C,nn', 0xDD: 'PREFIX DD', 0xDE: 'SBC A,n', 0xDF: 'RST 18',
      0xE0: 'RET PO', 0xE1: 'POP HL', 0xE2: 'JP PO,nn', 0xE3: 'EX (SP),HL',
      0xE4: 'CALL PO,nn', 0xE5: 'PUSH HL', 0xE6: 'AND n', 0xE7: 'RST 20',
      0xE8: 'RET PE', 0xE9: 'JP (HL)', 0xEA: 'JP PE,nn', 0xEB: 'EX DE,HL',
      0xEC: 'CALL PE,nn', 0xED: 'PREFIX ED', 0xEE: 'XOR n', 0xEF: 'RST 28',
      0xF0: 'RET P', 0xF1: 'POP AF', 0xF2: 'JP P,nn', 0xF3: 'DI',
      0xF4: 'CALL P,nn', 0xF5: 'PUSH AF', 0xF6: 'OR n', 0xF7: 'RST 30',
      0xF8: 'RET M', 0xF9: 'LD SP,HL', 0xFA: 'JP M,nn', 0xFB: 'EI',
      0xFC: 'CALL M,nn', 0xFD: 'PREFIX FD', 0xFE: 'CP n', 0xFF: 'RST 38'
    };
    return opcodes[byte] || 'UNKNOWN';
  }

  analyzeProblematicAddress() {
    console.log('\n🎯 PROBLEMATIC ADDRESS ANALYSIS (0x11CB)');
    console.log('='.repeat(50));
    
    const addr = 0x11CB;
    if (addr >= this.romData.length) {
      console.log(`❌ Address 0x${addr.toString(16)} is outside ROM bounds (${this.romData.length} bytes)`);
      return;
    }

    const value = this.romData[addr];
    console.log(`📍 Address 0x${addr.toString(16)}: 0x${value.toString(16).padStart(2, '0')} (${value})`);
    console.log(`📝 Opcode: ${this.getOpcodeName(value)}`);
    
    // Check context around the problematic address
    console.log('\n🔍 Context around 0x11CB:');
    for (let i = Math.max(0, addr - 10); i < Math.min(this.romData.length, addr + 15); i++) {
      const byte = this.romData[i];
      const marker = (i === addr) ? '👈 PROBLEMATIC' : '   ';
      console.log(`${marker} 0x${i.toString(16).padStart(4, '0')}: 0x${byte.toString(16).padStart(2, '0')} - ${this.getOpcodeName(byte)}`);
    }
  }

  searchForPatterns() {
    console.log('\n🔍 PATTERN SEARCH');
    console.log('='.repeat(50));
    
    // Search for ED 2A sequence
    console.log('🔍 Searching for ED 2A sequence...');
    let foundED2A = false;
    for (let i = 0; i < this.romData.length - 1; i++) {
      if (this.romData[i] === 0xED && this.romData[i + 1] === 0x2A) {
        console.log(`✅ Found ED 2A at address 0x${i.toString(16)}`);
        console.log(`   Context: ${this.getOpcodeName(this.romData[i-1]||0x00)} ED 2A ${this.getOpcodeName(this.romData[i+2]||0x00)}`);
        foundED2A = true;
        if (i < 10) break; // Only show first few if they're early
      }
    }
    if (!foundED2A) {
      console.log('❌ ED 2A sequence not found');
    }

    // Search for copyright message patterns
    console.log('\n🔍 Searching for text patterns...');
    let textFound = false;
    const searchStrings = [
      'Sinclair',
      '@ 1982',
      'Research Ltd',
      'ZX Spectrum',
      '1982 Sinclair',
      'Microdigital'
    ];
    
    for (const searchStr of searchStrings) {
      const asciiBytes = new TextEncoder().encode(searchStr);
      let found = false;
      for (let i = 0; i < this.romData.length - asciiBytes.length; i++) {
        let match = true;
        for (let j = 0; j < asciiBytes.length; j++) {
          if (this.romData[i + j] !== asciiBytes[j]) {
            match = false;
            break;
          }
        }
        if (match) {
          console.log(`✅ Found "${searchStr}" at address 0x${i.toString(16)}`);
          textFound = true;
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`❌ "${searchStr}" not found`);
      }
    }

    if (!textFound) {
      console.log('⚠️  No recognizable text patterns found');
    }
  }

  analyzeMemoryLayout() {
    console.log('\n🗺️  MEMORY LAYOUT ANALYSIS');
    console.log('='.repeat(50));
    
    // Check for common ROM regions
    const regions = [
      { name: 'Boot Area', start: 0x0000, end: 0x0066 },
      { name: 'Channel Info', start: 0x0C00, end: 0x1000 },
      { name: 'Character Set', start: 0x3800, end: 0x3FFF },
    ];
    
    for (const region of regions) {
      console.log(`\n📍 ${region.name} (0x${region.start.toString(16)}-0x${region.end.toString(16)}):`);
      
      // Sample first few bytes of each region
      const sampleSize = Math.min(16, region.end - region.start);
      const sample = Array.from(this.romData.slice(region.start, region.start + sampleSize))
        .map(b => `0x${b.toString(16).padStart(2, '0')}`)
        .join(', ');
      console.log(`   First ${sampleSize} bytes: ${sample}`);
    }
  }

  runCompleteAnalysis() {
    if (!this.loadROM()) {
      return false;
    }

    this.analyzeBootSequence();
    this.analyzeProblematicAddress();
    this.searchForPatterns();
    this.analyzeMemoryLayout();

    console.log('\n✅ Complete ROM analysis finished');
    return true;
  }
}

// Main execution
function main() {
  console.log('🔬 DETAILED ROM ANALYSIS');
  console.log('Deep analysis of ZX Spectrum 48K ROM content\n');

  const analyzer = new DetailedROMAnalyzer();
  analyzer.runCompleteAnalysis();
}

main();