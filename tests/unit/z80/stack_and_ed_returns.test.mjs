/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

import { Z80 } from '../../../src/z80.mjs';

function runTests(){
  console.log('🧪 Testing stack and ED return semantics\n');
  // Use a simple flat memory to avoid ROM/bank interactions in unit tests
  const mem = { mem: new Uint8Array(0x10000),
    read(addr){ return this.mem[addr & 0xFFFF]; },
    write(addr, val){ this.mem[addr & 0xFFFF] = val & 0xFF; }
  };
  const cpu = new Z80(mem);
  cpu.enableMicroTrace();

  let passed = 0, failed = 0;
  const t = (desc, cond) => { if(cond){ console.log(`✅ ${desc}`); passed++; } else { console.log(`❌ ${desc}`); failed++; } };

  // Test push/pop symmetry
  cpu.reset(); cpu.SP = 0xFFFE;
  const val = 0xBEEF;
  cpu.pushWord(val);
  console.log('DEBUG: mem at SP+1,SP', mem.mem[(cpu.SP+1)&0xFFFF].toString(16), mem.mem[(cpu.SP+2)&0xFFFF].toString(16));
  t('pushWord decreased SP by 2', cpu.SP === ((0xFFFE - 2) & 0xFFFF));
  const popped = cpu.popWord();
  console.log('DEBUG: popped', popped.toString(16));
  t('popWord returned original value', popped === val);
  t('SP restored to original', cpu.SP === 0xFFFE);

  // Test CALL -> RET round trip and micro logs
  cpu.reset();
  cpu.PC = 0x200;
  // Place CALL 0x300 at 0x200, and RET at 0x300
  mem.write(0x200, 0xCD); mem.write(0x201, 0x00); mem.write(0x202, 0x03); // CALL 0x0300
  mem.write(0x300, 0xC9); // RET
  cpu.step(); // execute CALL
  // After CALL, PC should be 0x300
  t('CALL transferred PC to subroutine', cpu.PC === 0x300);
  // There should be a pushWord event in microLog
  const push = cpu.getMicroLog().find(e => e.type === 'pushWord');
  t('MicroLog recorded pushWord for CALL', !!push);
  cpu.step(); // execute RET
  // After RET, PC should be return address 0x203
  t('RET returned to caller', cpu.PC === 0x203);
  const retEv = cpu.getMicroLog().find(e => e.type === 'RET' || e.type === 'popWord');
  t('MicroLog recorded RET/popWord', !!retEv);

  // Test ED RETN/RETI semantics
  cpu.reset(); cpu.enableMicroTrace();
  // Push return address manually
  cpu.SP = 0xFFFE; cpu.pushWord(0x400);
  // Place ED 0x45 (RETN) at 0x200
  cpu.PC = 0x200; mem.write(0x200, 0xED); mem.write(0x201, 0x45);
  const cycles = cpu.step(); // execute ED 45
  if (typeof cycles === 'number') console.log('ED RETN cycles:', cycles);
  const edEvent = cpu.getMicroLog().find(e => e.type === 'ED RETN' || e.type === 'ED RETI');
  t('ED RETN emitted micro event', !!edEvent);
  t('ED RETN popped to 0x400', cpu.PC === 0x400);

  // Summary
  console.log('\nTest Summary:', passed, 'passed,', failed, 'failed');
  if(failed === 0) console.log('🎉 All tests passed');
  else console.log('⚠️ Some tests failed');
  return failed;
}

import { test, expect } from 'vitest';

// Wrap the script-style runner in a proper Vitest test so it is discovered as a test suite
test('stack and ED return semantics (script)', () => {
  const failed = runTests();
  expect(failed).toBe(0);
});