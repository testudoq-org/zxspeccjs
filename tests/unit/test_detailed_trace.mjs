/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test } from 'vitest';

// Long diagnostic moved to tests/scripts/test_detailed_trace.mjs
// Excluded from unit runs; run the script directly from `tests/scripts/test_detailed_trace.mjs`.

test.skip('test_detailed_trace moved to tests/scripts (long diagnostic)', () => {
  // intentionally empty placeholder
});
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
const cpu = new Z80(memory);

let keyMatrix = [0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];

cpu.io = {
  read: (port) => {
    if ((port & 0xFF) === 0xFE) {
      const high = (port >> 8) & 0xFF;
      let result = 0xFF;
      for (let row = 0; row < 8; row++) {
        if (((high >> row) & 0x01) === 0) {
          result &= keyMatrix[row];
        }
      }
      return (result & 0x1F) | 0xE0;
    }
    return 0xFF;
  },
  write: () => {}
};

cpu.reset();

// Boot
for (let frame = 0; frame < 100; frame++) {
  for (let i = 0; i < 70000; i++) cpu.step();
  if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.\n');

// Press L
keyMatrix[6] = 0xFD;

let tracing = false;
let traceLog = [];

cpu.debugCallback = (opcode, pc) => {
  // Start tracing after RES 5,(IY+1) at 0x10B8 (next PC will be 0x10BC)
  if (pc === 0x10BC && !tracing) {
    tracing = true;
    console.log('Key consumed. Starting trace with A=0x' + cpu.A.toString(16));
  }
  
  if (tracing && traceLog.length < 300) {
    traceLog.push({ 
      pc, 
      opcode, 
      a: cpu.A, 
      hl: (cpu.H << 8) | cpu.L,
      de: (cpu.D << 8) | cpu.E,
      sp: cpu.SP 
    });
  }
};

// Run one frame
for (let i = 0; i < 70000; i++) cpu.step();
if (cpu.IFF1) cpu.intRequested = true;

console.log('Trace after key consumption (' + traceLog.length + ' entries):\n');

// Show first 50 entries
traceLog.slice(0, 50).forEach((t, i) => {
  console.log(`${i.toString().padStart(3)}: PC=0x${t.pc.toString(16).padStart(4,'0')} op=0x${t.opcode.toString(16).padStart(2,'0')} A=0x${t.a.toString(16).padStart(2,'0')} HL=0x${t.hl.toString(16).padStart(4,'0')} DE=0x${t.de.toString(16).padStart(4,'0')}`);
});

// Check if we hit RST 10 (print) at 0x0010
const rst10Hits = traceLog.filter(t => t.pc === 0x0010).length;
console.log('\nRST 10 (print) hits: ' + rst10Hits);

// Check if we hit print-char routine
const printHits = traceLog.filter(t => t.pc >= 0x09F4 && t.pc < 0x0A00).length;
console.log('PRINT-A (0x09F4+) hits: ' + printHits);

// Check for calls to TOKENS table
const tokenHits = traceLog.filter(t => t.pc >= 0x0095 && t.pc < 0x0100).length;
console.log('Token area (0x0095+) hits: ' + tokenHits);

