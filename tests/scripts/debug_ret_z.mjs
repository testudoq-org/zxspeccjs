/* eslint-disable no-console, no-undef, no-unused-vars */
/**
 * Debug RET Z issue
 */

import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';
import { ULA } from './src/ula.mjs';
import ROM_DATA from './src/roms/spec48.js';

// Initialize system
const memory = new Memory({ model: '48k' });
memory.loadROM(ROM_DATA.bytes, 0);

console.log('=== ROM at 0x02B0-0x02C5 ===');
for (let addr = 0x02B0; addr < 0x02C5; addr++) {
    const byte = memory.read(addr);
    let desc = '';
    switch (byte) {
        case 0x7A: desc = 'LD A,D'; break;
        case 0x3C: desc = 'INC A'; break;
        case 0xC8: desc = 'RET Z'; break;
        case 0xFE: desc = 'CP n'; break;
        case 0x28: desc = 'JR Z,n'; break;
        case 0xC9: desc = 'RET'; break;
        case 0x7B: desc = 'LD A,E'; break;
        case 0x5A: desc = 'LD E,D'; break;
        case 0x57: desc = 'LD D,A'; break;
        case 0xCD: desc = 'CALL nn'; break;
        case 0xC0: desc = 'RET NZ'; break;
        case 0x21: desc = 'LD HL,nn'; break;
        case 0xCB: desc = '(CB prefix)'; break;
        case 0x7E: desc = 'LD A,(HL)'; break;
        case 0x20: desc = 'JR NZ,n'; break;
        case 0x23: desc = 'INC HL'; break;
        case 0x35: desc = 'DEC (HL)'; break;
        case 0x2B: desc = 'DEC HL'; break;
        case 0x36: desc = 'LD (HL),n'; break;
    }
    console.log(`  0x${addr.toString(16)}: ${byte.toString(16).padStart(2, '0')} - ${desc}`);
}

// Actually decode the sequence properly
console.log('\n=== Decoded sequence at 0x02B0 ===');
console.log('0x02B0: 7A       LD A,D');
console.log('0x02B1: 3C       INC A');
console.log('0x02B2: C8       RET Z       ; Returns if A was 0xFF (now 0)');
console.log('0x02B3: FE 28    CP 0x28');
console.log('0x02B5: C8       RET Z');
console.log('0x02B6: FE 19    CP 0x19');
console.log('0x02B8: C8       RET Z');
console.log('0x02B9: 7B       LD A,E');
console.log('0x02BA: 5A       LD E,D');
console.log('0x02BB: 57       LD D,A');
console.log('0x02BC: FE 18    CP 0x18');
console.log('0x02BE: C9       RET');
console.log('');
console.log('0x02BF: CD 8E 02 CALL 0x028E  ; Call KEY_SCAN');
console.log('0x02C2: C0       RET NZ');
console.log('0x02C3: 21 00 5C LD HL,0x5C00');

// So RET Z at 0x02B2 returns if D was 0xFF
// D is set to 0xFF at 0x0290: LD DE,0xFFFF
// The keyboard scan loop doesn't change D
// So when we get to 0x02B0: LD A,D, A = 0xFF
// Then INC A makes A = 0x00, Z flag is set
// RET Z returns!

// But where does it return TO?
// The CALL was from 0x004A: CALL 02BF
// When we called KEY_SCAN at 0x02BF, the return address pushed was 0x02C2
// But the RET Z at 0x02B2 is returning from the CALL 028E at 0x02BF!
// The return address should be 0x02C2

console.log('\n=== Analysis ===');
console.log('The keyboard scan routine is called from 0x02BF: CALL 0x028E');
console.log('When KEY_SCAN at 0x028E is called, return address 0x02C2 is pushed');
console.log('KEY_SCAN ends at 0x02B2 with RET Z if D was 0xFF');
console.log('D = 0xFF means no key was found');
console.log('So RET Z at 0x02B2 should return to 0x02C2');
console.log('');
console.log('But we ended up at 0x0044! This means:');
console.log('1. Stack corruption, or');
console.log('2. RET Z is not working correctly, or'); 
console.log('3. The stack was already wrong when KEY_SCAN was called');

