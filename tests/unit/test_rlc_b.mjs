/**
 * Test CB 00 (RLC B) instruction
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

// Initialize system
const memory = new Memory({ model: '48k' });
memory.loadROM(ROM_DATA.bytes, 0);

const mockCanvas = {
    getContext: () => ({ 
        createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
        putImageData: () => {},
        imageSmoothingEnabled: false
    }),
    width: 256,
    height: 192,
    style: {}
};

const ula = new ULA(memory, mockCanvas);
const cpu = new Z80(memory, ula);
cpu.reset();
ula.attachCPU(cpu);

// Write a test program at 0x8000
// CB 00 - RLC B
// C9    - RET
memory.write(0x8000, 0xCB);
memory.write(0x8001, 0x00);
memory.write(0x8002, 0xC9);

// Test RLC B with B = 0xFE (should become 0xFD with carry set)
console.log('=== Testing RLC B (CB 00) ===');

cpu.PC = 0x8000;
cpu.B = 0xFE;  // 11111110
cpu.F = 0;     // Clear flags

console.log(`Before: B=0x${cpu.B.toString(16)}, F=0x${cpu.F.toString(16)}`);
console.log(`Expected after RLC B: B=0xFD (carry from bit 7), C flag set`);

cpu.step();  // Execute CB 00

console.log(`After:  B=0x${cpu.B.toString(16)}, F=0x${cpu.F.toString(16)}`);
console.log(`PC after: 0x${cpu.PC.toString(16)}`);

// Check if RLC worked correctly
// RLC B: rotate B left through carry
// B = 0xFE = 11111110
// After RLC: B = 11111101 = 0xFD, C = 1 (bit 7 was 1)
const expectedB = 0xFD;
const expectedC = 1;  // Carry flag

if (cpu.B === expectedB) {
    console.log('✓ B value is correct');
} else {
    console.log(`✗ B value is wrong: expected 0x${expectedB.toString(16)}, got 0x${cpu.B.toString(16)}`);
}

if ((cpu.F & 0x01) === expectedC) {
    console.log('✓ Carry flag is correct');
} else {
    console.log(`✗ Carry flag is wrong: expected ${expectedC}, got ${cpu.F & 0x01}`);
}

// Test RLC B with B = 0x7F (should become 0xFE with carry clear)
console.log('\n=== Testing RLC B with B = 0x7F ===');
cpu.PC = 0x8000;
cpu.B = 0x7F;  // 01111111
cpu.F = 0;

console.log(`Before: B=0x${cpu.B.toString(16)}`);
cpu.step();
console.log(`After:  B=0x${cpu.B.toString(16)}, F=0x${cpu.F.toString(16)}`);

// B = 0x7F = 01111111
// After RLC: B = 11111110 = 0xFE, C = 0 (bit 7 was 0)
if (cpu.B === 0xFE && (cpu.F & 0x01) === 0) {
    console.log('✓ RLC B (0x7F) worked correctly');
} else {
    console.log(`✗ RLC B (0x7F) failed: B=0x${cpu.B.toString(16)}, C=${cpu.F & 0x01}`);
}

// Test the keyboard scan loop scenario
console.log('\n=== Testing keyboard scan scenario ===');
console.log('Simulating the loop at 0x02AC: CB 00 (RLC B) with B cycling through keyboard half-rows');

// The keyboard scan starts with B = 0xFE
// Each iteration does RLC B, looking for carry to become set after all bits rotated
cpu.B = 0xFE;  // First keyboard half-row mask
console.log(`Starting B=0x${cpu.B.toString(16)}`);

for (let i = 0; i < 10; i++) {
    cpu.PC = 0x8000;
    cpu.step();
    const carrySet = (cpu.F & 0x01) !== 0;
    console.log(`  After RLC #${i+1}: B=0x${cpu.B.toString(16).padStart(2,'0')}, C=${carrySet ? 1 : 0}`);
    if (carrySet && cpu.B === 0xFF) {
        console.log(`  Loop would exit after ${i+1} iterations (B=0xFF, C=1)`);
        break;
    }
}
