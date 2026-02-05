/* eslint-disable no-console, no-undef, no-unused-vars */
import spec48 from './src/roms/spec48.js';
import { Emulator } from './src/main.mjs';

// Simple test to check debug API
const canvas = document.createElement('canvas');
canvas.id = 'screen';
document.body.appendChild(canvas);

const emulator = new Emulator({ canvas });

// Load ROM and start
await emulator.loadROM(spec48);

console.log('=== Debug API Check ===');
console.log('window.__ZX_DEBUG__ exists:', !!window.__ZX_DEBUG__);
console.log('window.__LAST_PC__ exists:', window.__LAST_PC__ !== undefined);
console.log('Initial PC:', emulator.getPC());
console.log('Initial registers:', emulator.getRegisters());

if (window.__ZX_DEBUG__) {
    console.log('getPC() method:', typeof window.__ZX_DEBUG__.getPC);
    console.log('getRegisters() method:', typeof window.__ZX_DEBUG__.getRegisters);
    console.log('isTestMode:', window.__ZX_DEBUG__.isTestMode);
    
    // Test memory access
    console.log('ROM byte at 0x0000:', window.__ZX_DEBUG__.readROM(0x0000));
    console.log('peekMemory(0x0000, 5):', window.__ZX_DEBUG__.peekMemory(0x0000, 5));
}

emulator.start();

// Check after starting
setTimeout(() => {
    console.log('=== After 1 second ===');
    console.log('PC:', emulator.getPC());
    console.log('__LAST_PC__:', window.__LAST_PC__);
    console.log('Executed opcodes count:', window.__ZX_DEBUG__?.executedOpcodes?.length || 0);
    if (window.__ZX_DEBUG__?.executedOpcodes?.length > 0) {
        console.log('Last 5 executed opcodes:', window.__ZX_DEBUG__.executedOpcodes.slice(-5));
    }
}, 1000);
