/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node

/**
 * Comprehensive ZX Spectrum Emulator Boot Sequence Test
 * This test verifies the complete boot sequence in the browser to ensure:
 * 1. No blue-grey bars appear
 * 2. Proper boot sequence with border changes
 * 3. Copyright text "@ 1982 Sinclair Research Ltd" is displayed
 * 4. BASIC ready prompt appears
 * 5. Multiple boot cycles work consistently
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class ComprehensiveBootTest {
  constructor() {
    this.serverPort = 8081;
    this.emulatorUrl = `http://localhost:${this.serverPort}`;
    this.testResults = {
      bootCycles: [],
      borderChanges: [],
      displayContent: [],
      copyrightText: null,
      basicPrompt: false,
      blueGreyBars: false,
      errors: [],
      success: false
    };
    
    // Expected boot sequence patterns
    this.expectedPatterns = {
      borderChanges: [
        { color: 2, desc: 'Red during memory test' },    // Start of boot
        { color: 5, desc: 'Cyan during screen clear' },  // Middle of boot  
        { color: 0, desc: 'Black after clear' },         // End of boot
        { color: 7, desc: 'White for display' }          // Ready state
      ],
      copyrightText: /@ 1982 Sinclair Research Ltd/,
      basicPrompt: /^\s*$/,  // Empty line before BASIC prompt
      noBlueGreyBars: true
    };
  }

  async startServer() {
    console.log('🚀 Starting local development server...');
    try {
      // Check if server is already running
      await execAsync(`curl -s http://localhost:${this.serverPort}/index.html`);
      console.log(`✅ Server already running on port ${this.serverPort}`);
      return true;
    } catch (e) {
      // Start server
      const serverCommand = `cd d:/Code/GitHub/zxspeccjs && npx http-server -p ${this.serverPort}`;
      console.log(`📡 Starting server: ${serverCommand}`);
      
      const serverProcess = exec(serverCommand);
      serverProcess.stdout.on('data', (data) => {
        console.log(`📡 Server: ${data.trim()}`);
      });
      
      // Wait for server to be ready
      let attempts = 0;
      while (attempts < 10) {
        try {
          await execAsync(`curl -s http://localhost:${this.serverPort}/index.html`);
          console.log(`✅ Server started successfully on port ${this.serverPort}`);
          return true;
        } catch (e) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      console.log('❌ Failed to start server');
      return false;
    }
  }

  async createBrowserTest() {
    console.log('🧪 Creating browser-based boot sequence test...');
    
    // Create test HTML file
    const testHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ZX Spectrum Boot Sequence Test</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            padding: 20px; 
            background: #f0f0f0; 
        }
        #test-container { 
            display: flex; 
            gap: 20px; 
            align-items: flex-start; 
        }
        #emulator-screen { 
            border: 2px solid #333; 
            image-rendering: pixelated; 
        }
        #test-results { 
            flex: 1; 
            background: white; 
            padding: 20px; 
            border-radius: 5px; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.1); 
        }
        .result-pass { color: green; font-weight: bold; }
        .result-fail { color: red; font-weight: bold; }
        .result-warning { color: orange; font-weight: bold; }
        #boot-status { 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 5px; 
            font-family: monospace; 
        }
        .status-running { background: #e3f2fd; }
        .status-success { background: #e8f5e8; }
        .status-error { background: #ffebee; }
    </style>
</head>
<body>
    <div id="test-container">
        <div>
            <h2>ZX Spectrum Emulator</h2>
            <canvas id="emulator-screen" width="256" height="192" aria-label="ZX Spectrum screen"></canvas>
            <div id="controls">
                <button id="start-test" disabled>Start Boot Test</button>
                <button id="reset-test">Reset Test</button>
                <button id="run-multiple">Test Multiple Boots</button>
            </div>
        </div>
        <div id="test-results">
            <h2>Boot Sequence Test Results</h2>
            <div id="boot-status" class="status-running">Ready to test...</div>
            <div id="detailed-results"></div>

