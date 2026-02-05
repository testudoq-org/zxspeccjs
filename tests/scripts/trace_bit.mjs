/* eslint-disable no-console, no-undef, no-unused-vars */
// Trace exactly what happens in BIT instruction
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';

async function traceExactBit() {
  console.log('=== Trace Exact BIT Execution ===\n');

  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  // Patch _executeCBOperation to trace
  const original = cpu._executeCBOperation.bind(cpu);
  cpu._executeCBOperation = function(cbOpcode) {
    console.log(`  _executeCBOperation called with cbOpcode=0x${cbOpcode.toString(16)}`);
    const result = original(cbOpcode);
    console.log(`  After execution: F=0x${cpu.F.toString(16)}`);
    return result;
  };
  
  // Test BIT 7,A with A=0xFF
  memory.write(0x4000, 0xCB);  // CB prefix
  memory.write(0x4001, 0x7F);  // BIT 7,A
  
  cpu.PC = 0x4000;
  cpu.A = 0xFF;
  cpu.F = 0x00;
  
  console.log(`Before: PC=0x${cpu.PC.toString(16)}, A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log('Executing CB 7F (BIT 7,A)...');
  cpu.step();
  console.log(`After: PC=0x${cpu.PC.toString(16)}, A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log(`  Z=${(cpu.F & 0x40) ? 1 : 0}, H=${(cpu.F & 0x10) ? 1 : 0}`);
  console.log(`  Expected: Z=0 (bit 7 of 0xFF is 1), H=1`);
  console.log('');
  
  // Test with A=0x00
  cpu.PC = 0x4000;
  cpu.A = 0x00;
  cpu.F = 0x00;
  
  console.log(`Before: PC=0x${cpu.PC.toString(16)}, A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log('Executing CB 7F (BIT 7,A)...');
  cpu.step();
  console.log(`After: PC=0x${cpu.PC.toString(16)}, A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log(`  Z=${(cpu.F & 0x40) ? 1 : 0}, H=${(cpu.F & 0x10) ? 1 : 0}`);
  console.log(`  Expected: Z=1 (bit 7 of 0x00 is 0), H=1`);
}

traceExactBit().catch(console.error);

