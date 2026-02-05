/* eslint-disable no-console, no-undef, no-unused-vars */
/* eslint-env node, browser */
const console = globalThis.console;

#!/usr/bin/env node

/**
 * Test Port I/O operations (IN r,(C) and OUT (C),r)
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

console.log('🔧 Z80 Port I/O Operations Test');
console.log('=================================');

try {
  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  // Create a mock I/O device
  const mockIO = {
    readLog: [],
    writeLog: [],
    
    read(port) {
      console.log(`📥 I/O Read from port 0x${port.toString(16)}`);
      this.readLog.push(port);
      // Return different values based on port for testing
      switch (port & 0xFF) {
        case 0xFE: return 0xFF; // Keyboard/ULA port - return all keys released
        default: return 0xAB;
      }
    },
    
    write(port, value, tstates) {
      console.log(`📤 I/O Write to port 0x${port.toString(16)}: 0x${value.toString(16)} (tstates: ${tstates})`);
      this.writeLog.push({ port, value, tstates });
    }
  };
  
  // Attach I/O to CPU
  cpu.io = mockIO;
  
  console.log('✅ Mock I/O device attached to CPU');
  
  // Test IN r,(C) operations
  console.log('\n=== Testing IN r,(C) Operations ===');
  
  // Set up BC register for port address
  cpu.reset();
  cpu._setBC(0xFE); // Port 0xFE (keyboard/ULA port)
  
  console.log(`🔍 Before IN operations: BC=0x${cpu._getBC().toString(16)}`);
  
  // Test IN B,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x40); // IN B,(C)
  
  const tstates1 = cpu.step();
  console.log(`After IN B,(C): B=0x${cpu.B.toString(16)}, tstates=${tstates1}`);
  
  // Test IN C,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x48); // IN C,(C)
  
  const tstates2 = cpu.step();
  console.log(`After IN C,(C): C=0x${cpu.C.toString(16)}, tstates=${tstates2}`);
  
  // Test IN D,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x50); // IN D,(C)
  
  const tstates3 = cpu.step();
  console.log(`After IN D,(C): D=0x${cpu.D.toString(16)}, tstates=${tstates3}`);
  
  // Test IN E,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x58); // IN E,(C)
  
  const tstates4 = cpu.step();
  console.log(`After IN E,(C): E=0x${cpu.E.toString(16)}, tstates=${tstates4}`);
  
  // Test IN H,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x60); // IN H,(C)
  
  const tstates5 = cpu.step();
  console.log(`After IN H,(C): H=0x${cpu.H.toString(16)}, tstates=${tstates5}`);
  
  // Test IN L,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x68); // IN L,(C)
  
  const tstates6 = cpu.step();
  console.log(`After IN L,(C): L=0x${cpu.L.toString(16)}, tstates=${tstates6}`);
  
  // Test IN A,(C)
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x78); // IN A,(C)
  
  const tstates7 = cpu.step();
  console.log(`After IN A,(C): A=0x${cpu.A.toString(16)}, tstates=${tstates7}`);
  
  console.log(`\n📊 IN operations read from ports: [${mockIO.readLog.map(p => '0x' + p.toString(16)).join(', ')}]`);
  
  // Test OUT (C),r operations
  console.log('\n=== Testing OUT (C),r Operations ===');
  
  // Set up registers with test values
  cpu._setBC(0xFE); // Port address
  cpu.A = 0x11; cpu.B = 0x22; cpu.C = 0x33; cpu.D = 0x44; cpu.E = 0x55; cpu.H = 0x66; cpu.L = 0x77;
  
  console.log(`🔍 Before OUT operations: BC=0x${cpu._getBC().toString(16)}`);
  console.log(`   Registers: A=0x${cpu.A.toString(16)} B=0x${cpu.B.toString(16)} C=0x${cpu.C.toString(16)} D=0x${cpu.D.toString(16)} E=0x${cpu.E.toString(16)} H=0x${cpu.H.toString(16)} L=0x${cpu.L.toString(16)}`);
  
  // Test OUT (C),B
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x41); // OUT (C),B
  
  const tstates8 = cpu.step();
  console.log(`After OUT (C),B: tstates=${tstates8}`);
  
  // Test OUT (C),C
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x49); // OUT (C),C
  
  const tstates9 = cpu.step();
  console.log(`After OUT (C),C: tstates=${tstates9}`);
  
  // Test OUT (C),D
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x51); // OUT (C),D
  
  const tstates10 = cpu.step();
  console.log(`After OUT (C),D: tstates=${tstates10}`);
  
  // Test OUT (C),E
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x59); // OUT (C),E
  
  const tstates11 = cpu.step();
  console.log(`After OUT (C),E: tstates=${tstates11}`);
  
  // Test OUT (C),H
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x61); // OUT (C),H
  
  const tstates12 = cpu.step();
  console.log(`After OUT (C),H: tstates=${tstates12}`);
  
  // Test OUT (C),L
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x69); // OUT (C),L
  
  const tstates13 = cpu.step();
  console.log(`After OUT (C),L: tstates=${tstates13}`);
  
  // Test OUT (C),A
  cpu.PC = 0x4000;
  memory.write(0x4000, 0xED);
  memory.write(0x4001, 0x79); // OUT (C),A
  
  const tstates14 = cpu.step();
  console.log(`After OUT (C),A: tstates=${tstates14}`);
  
  console.log(`\n📊 OUT operations:`);
  mockIO.writeLog.forEach((entry, i) => {
    console.log(`   ${i + 1}. Port 0x${entry.port.toString(16)} <- 0x${entry.value.toString(16)}`);
  });
  
  console.log('\n✅ Port I/O operations test completed');
  console.log(`📈 Total I/O operations: ${mockIO.readLog.length} reads, ${mockIO.writeLog.length} writes`);
  
} catch (error) {
  console.error('\n❌ Error during port I/O test:', error.message);
  console.error(error.stack);
}
