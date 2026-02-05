/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

// Test BIT instruction directly
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';

async function testBit() {
  console.log('=== BIT Instruction Test ===\n');

  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  // Test BIT 7,r with value 0xFF (bit 7 is SET)
  // Expected: Z=0 (bit is not zero)
  
  // Set up test at address 0x4000 (RAM)
  memory.write(0x4000, 0xCB);  // CB prefix
  memory.write(0x4001, 0x7F);  // BIT 7,A
  memory.write(0x4002, 0x00);  // NOP
  
  cpu.PC = 0x4000;
  cpu.A = 0xFF;  // All bits set, including bit 7
  cpu.F = 0x00;
  
  console.log(`Before BIT 7,A: A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  cpu.step();
  console.log(`After BIT 7,A:  A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log(`  Z flag: ${(cpu.F & 0x40) ? 'SET' : 'CLEAR'}`);
  console.log(`  Expected Z: CLEAR (because bit 7 of 0xFF is 1)`);
  console.log(`  Result: ${(cpu.F & 0x40) ? 'BUG!' : 'CORRECT'}`);
  
  console.log('');
  
  // Test BIT 7,A with value 0x00 (bit 7 is CLEAR)
  cpu.PC = 0x4000;
  cpu.A = 0x00;  // All bits clear
  cpu.F = 0x00;
  
  console.log(`Before BIT 7,A: A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  cpu.step();
  console.log(`After BIT 7,A:  A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log(`  Z flag: ${(cpu.F & 0x40) ? 'SET' : 'CLEAR'}`);
  console.log(`  Expected Z: SET (because bit 7 of 0x00 is 0)`);
  console.log(`  Result: ${(cpu.F & 0x40) ? 'CORRECT' : 'BUG!'}`);
  
  console.log('');
  
  // Test BIT 7,(HL) with value 0xFF
  memory.write(0x4100, 0xCB);  // CB prefix
  memory.write(0x4101, 0x7E);  // BIT 7,(HL)
  memory.write(0x4102, 0x00);  // NOP
  memory.write(0x5000, 0xFF);  // Value at (HL)
  
  cpu.PC = 0x4100;
  cpu.H = 0x50;
  cpu.L = 0x00;
  cpu.F = 0x00;
  
  console.log(`Before BIT 7,(HL): (HL)=0x${memory.read(0x5000).toString(16)}, F=0x${cpu.F.toString(16)}`);
  cpu.step();
  console.log(`After BIT 7,(HL):  F=0x${cpu.F.toString(16)}`);
  console.log(`  Z flag: ${(cpu.F & 0x40) ? 'SET' : 'CLEAR'}`);
  console.log(`  Expected Z: CLEAR (because bit 7 of 0xFF is 1)`);
  console.log(`  Result: ${(cpu.F & 0x40) ? 'BUG!' : 'CORRECT'}`);
}

testBit().catch(console.error);

