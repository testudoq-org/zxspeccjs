#!/usr/bin/env node
/**
 * ROM Integrity Diagnostic Tool
 * Verifies ZX Spectrum 48K ROM file integrity and loading process
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ROMIntegrityChecker {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.info = [];
  }

  log(type, message) {
    console.log(`[${type}] ${message}`);
    if (type === 'ERROR') this.errors.push(message);
    else if (type === 'WARN') this.warnings.push(message);
    else this.info.push(message);
  }

  // Check ROM file size
  checkFileSize(filePath) {
    this.log('INFO', `Checking ROM file: ${filePath}`);
    
    try {
      const stats = fs.statSync(filePath);
      const size = stats.size;
      this.log('INFO', `File size: ${size} bytes (${size/1024}KB)`);
      
      if (size === 16384) {
        this.log('INFO', '✓ ROM file size is correct (16KB)');
      } else {
        this.log('ERROR', `ROM file size should be 16384 bytes, got ${size}`);
      }
      return size;
    } catch (error) {
      this.log('ERROR', `Cannot access ROM file: ${error.message}`);
      return null;
    }
  }

  // Load ROM data from binary file
  loadROMFile(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      return new Uint8Array(buffer);
    } catch (error) {
      this.log('ERROR', `Failed to load ROM file: ${error.message}`);
      return null;
    }
  }

  // Load ROM data from JavaScript module
  async loadROMModule(modulePath) {
    try {
      const fullPath = path.join(__dirname, modulePath);
      const spec48 = await import(`file://${fullPath}`);
      
      if (spec48?.default?.bytes instanceof Uint8Array) {
        return spec48.default.bytes;
      } else if (spec48?.bytes instanceof Uint8Array) {
        return spec48.bytes;
      } else {
        this.log('ERROR', 'ROM module does not provide bytes array');
        return null;
      }
    } catch (error) {
      this.log('ERROR', `Failed to load ROM module: ${error.message}`);
      return null;
    }
  }

  // Check for known ZX Spectrum 48K ROM signatures
  checkROMContent(romBytes, source) {
    this.log('INFO', `Checking ROM content from: ${source}`);
    
    if (!romBytes || romBytes.length === 0) {
      this.log('ERROR', 'No ROM data to check');
      return;
    }

    // Check ROM size
    if (romBytes.length === 16384) {
      this.log('INFO', '✓ ROM size is correct (16KB)');
    } else {
      this.log('ERROR', `ROM size is ${romBytes.length}, expected 16384`);
    }

    // Check boot vector at 0x0000 (should be JP instruction)
    const bootVector = romBytes[0];
    this.log('INFO', `Boot vector at 0x0000: 0x${bootVector.toString(16).padStart(2, '0')}`);
    if (bootVector === 0xC3) { // JP instruction
      this.log('INFO', '✓ Boot vector looks correct (JP instruction)');
    } else {
      this.log('WARN', `Boot vector should be 0xC3 (JP), got 0x${bootVector.toString(16)}`);
    }

    // Check copyright message location (around 0x0D00-0x1000)
    this.log('INFO', 'Looking for copyright message...');
    let foundCopyright = false;
    for (let addr = 0x0C00; addr < Math.min(0x1200, romBytes.length - 50); addr++) {
      const chunk = String.fromCharCode(...romBytes.slice(addr, addr + 50));
      if (chunk.includes('@ 1982 Sinclair Research Ltd')) {
        this.log('INFO', `✓ Found copyright message at address 0x${addr.toString(16)}`);
        foundCopyright = true;
        break;
      }
    }
    if (!foundCopyright) {
      this.log('WARN', 'Could not find standard Sinclair copyright message');
    }

    // Check specific problematic address mentioned in the issue (0x11CB)
    const problematicAddr = 0x11CB;
    if (problematicAddr < romBytes.length) {
      const value = romBytes[problematicAddr];
      this.log('INFO', `Content at 0x${problematicAddr.toString(16)}: 0x${value.toString(16).padStart(2, '0')} (${value})`);
      
      if (value === 0xFF) {
        this.log('WARN', `Address 0x${problematicAddr.toString(16)} contains 0xFF (expected not 0xFF)`);
        this.log('INFO', 'This might indicate unused ROM space or corruption');
      } else {
        this.log('INFO', `Address 0x${problematicAddr.toString(16)} does not contain 0xFF`);
      }
    } else {
      this.log('ERROR', `Problematic address 0x${problematicAddr.toString(16)} is outside ROM bounds`);
    }

    // Check for ED 2A sequence (mentioned in the issue)
    let foundED2A = false;
    for (let addr = 0; addr < romBytes.length - 1; addr++) {
      if (romBytes[addr] === 0xED && romBytes[addr + 1] === 0x2A) {
        this.log('INFO', `✓ Found ED 2A sequence at address 0x${addr.toString(16)}`);
        foundED2A = true;
        break;
      }
    }
    if (!foundED2A) {
      this.log('WARN', 'Could not find ED 2A sequence in ROM');
    }

    // Show first few bytes for comparison
    this.log('INFO', 'First 32 bytes of ROM:');
    const firstBytes = Array.from(romBytes.slice(0, 32))
      .map(b => `0x${b.toString(16).padStart(2, '0')}`)
      .join(', ');
    this.log('INFO', firstBytes);
  }

  // Check ROM loading process
  async checkROMLoading() {
    this.log('INFO', 'Checking ROM loading process...');
    
    try {
      // Try to load the JavaScript module
      const modulePath = './src/roms/spec48.js';
      const romFromModule = await this.loadROMModule(modulePath);
      
      if (romFromModule) {
        this.checkROMContent(romFromModule, 'JavaScript Module');
      }

      // Try to load the binary file
      const binPath = './roms/spec48.rom';
      const romFromFile = this.loadROMFile(binPath);
      
      if (romFromFile) {
        this.checkROMContent(romFromFile, 'Binary File');
      }

      // Compare the two sources
      if (romFromModule && romFromFile) {
        this.log('INFO', 'Comparing ROM data from both sources...');
        if (romFromModule.length === romFromFile.length) {
          let mismatches = 0;
          for (let i = 0; i < romFromModule.length; i++) {
            if (romFromModule[i] !== romFromFile[i]) {
              mismatches++;
              if (mismatches <= 10) { // Only show first 10 mismatches
                this.log('WARN', `Mismatch at 0x${i.toString(16)}: module=${romFromModule[i]}, file=${romFromFile[i]}`);
              }
            }
          }
          if (mismatches === 0) {
            this.log('INFO', '✓ ROM data matches between module and file');
          } else {
            this.log('ERROR', `Found ${mismatches} mismatches between module and file`);
          }
        } else {
          this.log('ERROR', `ROM size mismatch: module=${romFromModule.length}, file=${romFromFile.length}`);
        }
      }

    } catch (error) {
      this.log('ERROR', `ROM loading check failed: ${error.message}`);
    }
  }

  // Generate summary report
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('ROM INTEGRITY REPORT');
    console.log('='.repeat(60));
    
    console.log(`\n✅ INFO messages: ${this.info.length}`);
    console.log(`⚠️  WARNINGS: ${this.warnings.length}`);
    console.log(`❌ ERRORS: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n🚨 ERRORS:');
      this.errors.forEach(err => console.log(`  - ${err}`));
    }

    if (this.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.warnings.forEach(warn => console.log(`  - ${warn}`));
    }

    console.log('\n' + '='.repeat(60));
    
    return {
      success: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info
    };
  }
}

// Main execution
async function main() {
  console.log('🔍 ROM Integrity Diagnostic Tool');
  console.log('Investigating ZX Spectrum 48K ROM loading process...\n');

  const checker = new ROMIntegrityChecker();
  
  // Check ROM file
  const fileSize = checker.checkFileSize('./roms/spec48.rom');
  
  // Check ROM loading
  await checker.checkROMLoading();
  
  // Generate report
  const report = checker.generateReport();
  
  if (report.success) {
    console.log('✅ ROM integrity check completed successfully');
  } else {
    console.log('❌ ROM integrity check found issues');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});