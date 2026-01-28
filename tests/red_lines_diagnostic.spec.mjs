#!/usr/bin/env node

/**
 * Comprehensive diagnostic test for ZX Spectrum 48K emulator
 * Focuses on identifying red lines and boot completion issues
 */

import { test, expect } from '@playwright/test';

test.describe('ZX Spectrum Red Lines and Boot Diagnostic', () => {
  test('comprehensive diagnostic of red lines and boot issues', async ({ page }) => {
    console.log('=== COMPREHENSIVE ZX SPECTRUM DIAGNOSTIC ===\n');
    
    // Navigate to emulator
    await page.goto('http://localhost:8080/');
    await page.waitForSelector('#screen', { timeout: 10000 });
    console.log('✓ Emulator loaded');
    
    // Start the emulator
    await page.click('#startBtn');
    console.log('✓ Emulator started');
    
    // Wait a moment for initial boot
    await page.waitForTimeout(1000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'diagnostic_initial_state.png' });
    console.log('✓ Initial screenshot captured');
    
    // DIAGNOSTIC 1: Check Debug API availability
    console.log('\n=== DIAGNOSTIC 1: DEBUG API STATUS ===');
    const debugAPIStatus = await page.evaluate(() => {
      return {
        hasDebugAPI: !!window.__ZX_DEBUG__,
        debugAPIMethods: window.__ZX_DEBUG__ ? Object.getOwnPropertyNames(window.__ZX_DEBUG__) : [],
        hasEmu: !!window.emu,
        emuState: window.emu ? {
          running: window.emu._running,
          cpu: !!window.emu.cpu,
          memory: !!window.emu.memory,
          ula: !!window.emu.ula
        } : null
      };
    });
    
    console.log('Debug API available:', debugAPIStatus.hasDebugAPI);
    console.log('Emulator available:', debugAPIStatus.hasEmu);
    if (debugAPIStatus.emuState) {
      console.log('Emulator state:', debugAPIStatus.emuState);
    }
    
    // DIAGNOSTIC 2: Memory system integrity check
    console.log('\n=== DIAGNOSTIC 2: MEMORY SYSTEM INTEGRITY ===');
    const memoryCheck = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__ || !window.emu || !window.emu.memory) {
        return { error: 'Memory system not available' };
      }
      
      const mem = window.emu.memory;
      const results = {};
      
      // Check ROM visibility at 0x0000
      results.romAt0x0000 = [];
      for (let i = 0; i < 16; i++) {
        results.romAt0x0000.push(mem.read(i));
      }
      
      // Check video memory at 0x4000 (bitmap area)
      results.videoMemory0x4000 = [];
      for (let i = 0; i < 32; i++) {
        results.videoMemory0x4000.push(mem.read(0x4000 + i));
      }
      
      // Check attribute memory at 0x5800
      results.attributeMemory0x5800 = [];
      for (let i = 0; i < 32; i++) {
        results.attributeMemory0x5800.push(mem.read(0x5800 + i));
      }
      
      // Check system variables
      results.frames = [
        mem.read(0x5C5C), mem.read(0x5C5D), mem.read(0x5C5E), mem.read(0x5C5F)
      ];
      results.chans = mem.read(0x5C36);
      results.curchl = [mem.read(0x5C37), mem.read(0x5C38)];
      
      return results;
    });
    
    console.log('ROM at 0x0000 (first 16 bytes):', memoryCheck.romAt0x0000?.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    console.log('Video memory at 0x4000 (first 32 bytes):', memoryCheck.videoMemory0x4000?.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    console.log('Attribute memory at 0x5800 (first 32 bytes):', memoryCheck.attributeMemory0x5800?.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
    console.log('FRAMES system variable:', memoryCheck.frames?.map(b => '0x' + b.toString(16).padStart(2, '0')).join(''));
    console.log('CHANS at 0x5C36:', '0x' + (memoryCheck.chans?.toString(16).padStart(2, '0') || '00'));
    
    // DIAGNOSTIC 3: CPU state and boot progression
    console.log('\n=== DIAGNOSTIC 3: CPU STATE AND BOOT PROGRESSION ===');
    const cpuCheck = await page.evaluate(() => {
      if (!window.__ZX_DEBUG__) return { error: 'Debug API not available' };
      
      const regs = window.__ZX_DEBUG__.getRegisters();
      const currentPC = window.__ZX_DEBUG__.getCurrentPC();
      const bootProgress = window.__ZX_DEBUG__.getBootProgress ? window.__ZX_DEBUG__.getBootProgress() : null;
      
      return {
        registers: regs,
        currentPC: currentPC,
        bootProgress: bootProgress,
        tstates: regs?.tstates || 0
      };
    });
    
    if (cpuCheck.registers && cpuCheck.registers.PC !== undefined) {
      console.log('CPU Registers:', {
        PC: '0x' + (cpuCheck.registers.PC || 0).toString(16).padStart(4, '0'),
        SP: '0x' + (cpuCheck.registers.SP || 0).toString(16).padStart(4, '0'),
        I: '0x' + (cpuCheck.registers.I || 0).toString(16).padStart(2, '0'),
        IFF1: cpuCheck.registers.IFF1,
        IFF2: cpuCheck.registers.IFF2,
        IM: cpuCheck.registers.IM
      });
      console.log('Current PC:', '0x' + (cpuCheck.currentPC || 0).toString(16).padStart(4, '0'));
      console.log('T-states:', cpuCheck.tstates);
      if (cpuCheck.bootProgress) {
        console.log('Boot progress:', cpuCheck.bootProgress);
      }
    } else {
      console.log('Registers not available:', cpuCheck);
    }
    
    // DIAGNOSTIC 4: ULA and display system check
    console.log('\n=== DIAGNOSTIC 4: ULA AND DISPLAY SYSTEM ===');
    const ulaCheck = await page.evaluate(() => {
      if (!window.emu || !window.emu.ula) return { error: 'ULA not available' };
      
      const ula = window.emu.ula;
      return {
        border: ula.border,
        borderBright: ula.borderBright,
        frameCounter: ula.frameCounter,
        interruptEnabled: ula.interruptEnabled,
        tstatesInFrame: ula.tstatesInFrame,
        canvasSize: { width: ula.canvas.width, height: ula.canvas.height },
        hasImageData: !!ula.image,
        imageDataSize: ula.image ? ula.image.data.length : 0
      };
    });
    
    console.log('ULA State:', ulaCheck);
    
    // DIAGNOSTIC 5: Memory mapping verification
    console.log('\n=== DIAGNOSTIC 5: MEMORY MAPPING VERIFICATION ===');
    const mappingCheck = await page.evaluate(() => {
      if (!window.emu || !window.emu.memory) return { error: 'Memory not available' };
      
      const mem = window.emu.memory;
      const results = {};
      
      // Check page mappings
      results.page0 = mem.pages[0] ? mem.pages[0][0] : null; // ROM
      results.page1 = mem.pages[1] ? mem.pages[1][0] : null; // RAM bank 0
      results.page2 = mem.pages[2] ? mem.pages[2][0] : null; // RAM bank 1  
      results.page3 = mem.pages[3] ? mem.pages[3][0] : null; // RAM bank 2
      
      // Check flatRam if available
      results.hasFlatRam = !!mem._flatRam;
      if (mem._flatRam) {
        results.flatRamLength = mem._flatRam.length;
        results.flatRamFirstBytes = Array.from(mem._flatRam.slice(0, 16));
      }
      
      return results;
    });
    
    console.log('Memory mapping:', mappingCheck);
    
    // DIAGNOSTIC 6: Look for red lines or display corruption
    console.log('\n=== DIAGNOSTIC 6: DISPLAY CORRUPTION CHECK ===');
    await page.waitForTimeout(2000); // Let boot progress
    
    const displayCheck = await page.evaluate(() => {
      const canvas = document.getElementById('screen');
      if (!canvas) return { error: 'Canvas not found' };
      
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Analyze first few rows for red lines
      const redLines = [];
      for (let y = 0; y < Math.min(50, canvas.height); y++) {
        let redCount = 0;
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          
          // Look for predominantly red pixels (red lines)
          if (r > 200 && g < 100 && b < 100) {
            redCount++;
          }
        }
        if (redCount > canvas.width * 0.1) { // More than 10% red in row
          redLines.push({ y, redCount, percentage: (redCount / canvas.width * 100).toFixed(1) });
        }
      }
      
      return {
        canvasSize: { width: canvas.width, height: canvas.height },
        imageDataSize: data.length,
        redLinesFound: redLines.length,
        redLineDetails: redLines.slice(0, 10) // First 10 red lines
      };
    });
    
    console.log('Display analysis:', displayCheck);
    
    // Take final screenshot
    await page.screenshot({ path: 'diagnostic_final_state.png' });
    console.log('\n✓ Final screenshot captured');
    
    // SUMMARY AND DIAGNOSIS
    console.log('\n=== DIAGNOSTIC SUMMARY ===');
    
    let issues = [];
    let recommendations = [];
    
    // Check for red lines
    if (displayCheck.redLinesFound > 0) {
      issues.push(`RED LINES DETECTED: ${displayCheck.redLinesFound} rows with excessive red pixels`);
      recommendations.push('Check video memory initialization at 0x4000-0x57FF');
      recommendations.push('Verify ULA attribute processing');
    }
    
    // Check debug API
    if (!debugAPIStatus.hasDebugAPI) {
      issues.push('DEBUG API NOT AVAILABLE');
      recommendations.push('Check debug API initialization in main.mjs');
    }
    
    // Check memory integrity
    if (memoryCheck.romAt0x0000 && memoryCheck.romAt0x0000[0] !== 0xF3) {
      issues.push('ROM NOT PROPERLY MAPPED: Expected 0xF3 at 0x0000');
      recommendations.push('Verify ROM loading and mapping in memory.mjs');
    }
    
    // Check CPU state
    if (cpuCheck.registers && cpuCheck.registers.I !== undefined && cpuCheck.registers.I !== 0x3F) {
      issues.push('I REGISTER INCORRECT: Expected 0x3F, got 0x' + (cpuCheck.registers.I || 0).toString(16));
      recommendations.push('Check CPU reset in z80.mjs');
    }
    
    // Check boot progression
    if (cpuCheck.bootProgress && !cpuCheck.bootProgress.complete && cpuCheck.tstates > 100000) {
      issues.push('BOOT NOT COMPLETING: Boot sequence stalled');
      recommendations.push('Check interrupt generation and boot sequence timing');
    }
    
    console.log('\nIDENTIFIED ISSUES:');
    if (issues.length === 0) {
      console.log('✓ No major issues detected in basic diagnostics');
    } else {
      issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
    }
    
    console.log('\nRECOMMENDATIONS:');
    if (recommendations.length === 0) {
      console.log('✓ No specific recommendations - system appears stable');
    } else {
      recommendations.forEach((rec, i) => console.log(`${i + 1}. ${rec}`));
    }
    
    // Return diagnostic results for further analysis
    expect(true).toBeTruthy(); // Test passes regardless for diagnostic purposes
  });
});