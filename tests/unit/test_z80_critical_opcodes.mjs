import { Z80 } from './src/z80.mjs';

// Mock memory class for testing
class MockMemory {
  constructor() {
    this.mem = new Uint8Array(65536);
  }
  
  read(addr) {
    return this.mem[addr & 0xFFFF];
  }
  
  write(addr, value) {
    this.mem[addr & 0xFFFF] = value & 0xFF;
  }
}

function testCriticalEDOpcodes() {
  console.log('Testing Critical Z80 ED-Prefixed Opcodes...');
  
  const memory = new MockMemory();
  const cpu = new Z80(memory);
  
  // Test 1: LD HL,(nn) - ED 2A
  console.log('\n1. Testing LD HL,(nn) - ED 2A');
  memory.write(0x1000, 0x34); // LSB
  memory.write(0x1001, 0x12); // MSB
  memory.write(0x2000, 0xED); // ED prefix
  memory.write(0x2001, 0x2A); // LD HL,(nn) opcode
  memory.write(0x2002, 0x00); // Address LSB
  memory.write(0x2003, 0x10); // Address MSB
  
  cpu.PC = 0x2000;
  cpu._setHL(0x0000); // Clear HL
  
  const tstates1 = cpu.step();
  console.log(`LD HL,(0x1000) = 0x${cpu._getHL().toString(16).padStart(4, '0')} (expected: 0x1234)`);
  console.log(`T-states: ${tstates1} (expected: 16)`);
  console.log(`Test 1: ${cpu._getHL() === 0x1234 ? 'PASS' : 'FAIL'}`);
  
  // Test 2: LD (nn),HL - ED 22
  console.log('\n2. Testing LD (nn),HL - ED 22');
  memory.write(0x3000, 0xED); // ED prefix
  memory.write(0x3001, 0x22); // LD (nn),HL opcode
  memory.write(0x3002, 0x00); // Address LSB
  memory.write(0x3003, 0x20); // Address MSB
  
  cpu.PC = 0x3000;
  cpu._setHL(0xABCD); // Set HL to test value
  
  const tstates2 = cpu.step();
  const storedValue = (memory.read(0x2001) << 8) | memory.read(0x2000);
  console.log(`Stored at 0x2000 = 0x${storedValue.toString(16).padStart(4, '0')} (expected: 0xABCD)`);
  console.log(`T-states: ${tstates2} (expected: 16)`);
  console.log(`Test 2: ${storedValue === 0xABCD ? 'PASS' : 'FAIL'}`);
  
  // Test 3: ADD HL,BC - 0x09
  console.log('\n3. Testing ADD HL,BC - 0x09');
  memory.write(0x4000, 0x09); // ADD HL,BC opcode
  
  cpu.PC = 0x4000;
  cpu._setHL(0x1000);
  cpu._setBC(0x2000);
  cpu.F = 0; // Clear flags
  
  const tstates3 = cpu.step();
  console.log(`HL + BC = 0x${cpu._getHL().toString(16).padStart(4, '0')} (expected: 0x3000)`);
  console.log(`Carry flag: ${(cpu.F & 0x01) ? 'SET' : 'CLEAR'} (expected: CLEAR)`);
  console.log(`T-states: ${tstates3} (expected: 11)`);
  console.log(`Test 3: ${cpu._getHL() === 0x3000 ? 'PASS' : 'FAIL'}`);
  
  // Test 4: SCF - 0x37
  console.log('\n4. Testing SCF - 0x37');
  memory.write(0x5000, 0x37); // SCF opcode
  
  cpu.PC = 0x5000;
  cpu.F = 0; // Clear all flags including carry
  
  const tstates4 = cpu.step();
  console.log(`Carry flag after SCF: ${(cpu.F & 0x01) ? 'SET' : 'CLEAR'} (expected: SET)`);
  console.log(`Half-carry flag: ${(cpu.F & 0x10) ? 'SET' : 'CLEAR'} (expected: CLEAR)`);
  console.log(`T-states: ${tstates4} (expected: 4)`);
  console.log(`Test 4: ${(cpu.F & 0x01) ? 'PASS' : 'FAIL'}`);
  
  // Test 5: CCF - 0x3F
  console.log('\n5. Testing CCF - 0x3F');
  memory.write(0x6000, 0x3F); // CCF opcode
  
  cpu.PC = 0x6000;
  cpu.F = 0x01; // Set carry flag
  
  const tstates5 = cpu.step();
  console.log(`Carry flag after CCF: ${(cpu.F & 0x01) ? 'SET' : 'CLEAR'} (expected: CLEAR)`);
  console.log(`T-states: ${tstates5} (expected: 4)`);
  console.log(`Test 5: ${!(cpu.F & 0x01) ? 'PASS' : 'FAIL'}`);
  
  console.log('\n=== Critical Z80 Opcode Tests Complete ===');
}

testCriticalEDOpcodes();