/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
import { test } from 'vitest';

// Long diagnostic moved to tests/scripts/test_correct_key.mjs
// Excluded from unit runs; run the script directly from `tests/scripts/test_correct_key.mjs`.

test.skip('test_correct_key moved to tests/scripts (long diagnostic)', () => {
  // intentionally empty placeholder
});
const memory = new Memory({ model: '48k', romBuffer: romData.buffer });
memory._debugEnabled = false;
const cpu = new Z80(memory);

let keyMatrix = Array(8).fill(0xFF);

cpu.io = {
    read: (port) => {
        if ((port & 0xFF) === 0xFE) {
            let result = 0xFF;
            const highByte = (port >> 8) & 0xFF;
            for (let row = 0; row < 8; row++) {
                if ((highByte & (1 << row)) === 0) {
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

console.log('Booting...');
for (let frame = 0; frame < 100; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('Boot complete.');
console.log('MODE (0x5C41) = 0x' + memory.read(0x5C41).toString(16)); // mode: 0=K, 1=L, 2=C, 3=E, 4=G

// Press 'k' (row 5, bit 2) according to ZX Spectrum keyboard layout
// Wait - let me check: row 5 = YUIOP row, bit 2 = I
// Actually K is on row 5 = QWERT, YUIOP, ASDFG, HJKL<ENTER>, LSHIFT-ZXCV, BNMS<SPACE>
// ZX Spectrum keyboard matrix:
// Row 0: SHIFT,Z,X,C,V  (0xFE port high A8)
// Row 1: A,S,D,F,G       (0xFD port high A9)
// Row 2: Q,W,E,R,T       (0xFB port high A10)
// Row 3: 1,2,3,4,5       (0xF7 port high A11)
// Row 4: 0,9,8,7,6       (0xEF port high A12)
// Row 5: P,O,I,U,Y       (0xDF port high A13)
// Row 6: ENTER,L,K,J,H   (0xBF port high A14)
// Row 7: SPACE,SYM,M,N,B (0x7F port high A15)

// So K is row 6, bit 2! Not row 5!
console.log('\nK key is row 6, bit 2 (not row 5!)');

keyMatrix[6] = 0xFF & ~0x04; // K is row 6, bit 2
console.log('Pressed K (corrected: row 6, bit 2)');

// Run a few frames
for (let frame = 0; frame < 5; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

console.log('LASTK (0x5C08) = 0x' + memory.read(0x5C08).toString(16));
console.log('FLAGS (0x5C3B) = 0x' + memory.read(0x5C3B).toString(16));

// Release key
keyMatrix[6] = 0xFF;
console.log('Released K');

// Run more frames
for (let frame = 0; frame < 10; frame++) {
    for (let i = 0; i < 70000; i++) cpu.step();
    if (cpu.IFF1) cpu.intRequested = true;
}

// Check screen
let screenWrites = 0;
for (let addr = 0x4000; addr < 0x5800; addr++) {
    if (memory.read(addr) !== 0) screenWrites++;
}
console.log(`\nNon-zero bytes in display file: ${screenWrites}`);

