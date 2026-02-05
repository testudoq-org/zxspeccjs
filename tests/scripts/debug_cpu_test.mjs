/* eslint-disable no-console, no-undef, no-unused-vars */
import spec48 from './src/roms/spec48.js';
import { Emulator } from './src/main.mjs';

// Create emulator instance
const canvas = document.createElement('canvas');
canvas.id = 'screen';
document.body.appendChild(canvas);

const emulator = new Emulator({ canvas });

// Load ROM
await emulator.loadROM(spec48);

console.log('Initial PC:', emulator.getPC());
console.log('Initial registers:', emulator.getRegisters());

// Start execution
emulator.start();

// Monitor for a few seconds
setTimeout(() => {
    console.log('After 2 seconds:');
    console.log('PC:', emulator.getPC());
    console.log('Registers:', emulator.getRegisters());
    console.log('Executed opcodes:', window.__ZX_DEBUG__?.executedOpcodes?.slice(-10));
    console.log('Port writes:', window.__ZX_DEBUG__?.portWrites?.slice(-5));
}, 2000);

setTimeout(() => {
    console.log('After 5 seconds:');
    console.log('PC:', emulator.getPC());
    console.log('Boot complete:', window.__ZX_DEBUG__?.bootComplete());
    console.log('Total executed opcodes:', window.__ZX_DEBUG__?.executedOpcodes?.length);
}, 5000);
