/* eslint-disable no-console, no-undef, no-unused-vars */
// Debug CB opcode handling
import { Memory } from './src/memory.mjs';
import { Z80 } from './src/z80.mjs';

async function debugCB() {
  console.log('=== Debug CB Opcode Handling ===\n');

  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  // Use RAM address (0x8000 and above are safe)
  const testAddr = 0x8000;
  
  // Write test code
  memory.write(testAddr, 0xCB);  // CB prefix
  memory.write(testAddr + 1, 0x7F);  // BIT 7,A
  memory.write(testAddr + 2, 0x00);  // NOP
  
  console.log(`Memory at 0x${testAddr.toString(16)}: ${memory.read(testAddr).toString(16)} ${memory.read(testAddr + 1).toString(16)} ${memory.read(testAddr + 2).toString(16)}`);
  console.log(`Opcode 0xCB === 203: ${0xCB === 203}`);
  
  cpu.PC = testAddr;
  cpu.A = 0xFF;
  cpu.F = 0x00;
  cpu.SP = 0xFFF0;
  cpu.IFF1 = false;
  cpu.IFF2 = false;
  
  console.log(`Before step: PC=0x${cpu.PC.toString(16)}, IFF1=${cpu.IFF1}, IFF2=${cpu.IFF2}`);
  
  // Let's manually check what readByte returns
  const opcodeRead = cpu.readByte(cpu.PC);
  console.log(`readByte(0x${testAddr.toString(16)}) = ${opcodeRead} (0x${opcodeRead.toString(16)})`);
  console.log(`opcodeRead === 0xCB: ${opcodeRead === 0xCB}`);
  
  // Now step
  cpu.step();
  
  console.log(`After step: PC=0x${cpu.PC.toString(16)}, A=0x${cpu.A.toString(16)}, F=0x${cpu.F.toString(16)}`);
  console.log(`  Z=${(cpu.F & 0x40) ? 1 : 0}, H=${(cpu.F & 0x10) ? 1 : 0}`);
  console.log(`  Expected: PC=0x${(testAddr + 2).toString(16)}, Z=0, H=1`);
}

debugCB().catch(console.error);

