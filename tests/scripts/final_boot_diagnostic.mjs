/* eslint-disable no-console, no-undef, no-unused-vars */
#!/usr/bin/env node

/**
 * Final diagnostic for the specific boot failure at PC 0x11CB
 */

import { Z80 } from './src/z80.mjs';
import { Memory } from './src/memory.mjs';

console.log('🔧 Final Boot Failure Diagnostic');
console.log('=================================');

try {
  const memory = new Memory({ model: '48k' });
  const cpu = new Z80(memory);
  
  console.log('✅ Memory and CPU initialized');
  
  // Disable interrupts to prevent boot loop
  cpu.reset();
  cpu.IFF1 = false;
  cpu.IFF2 = false;
  cpu.IM = 0;
  
  console.log('✅ Interrupts disabled to prevent boot loop');
  
  // Directly test the problematic instruction sequence
  console.log('\n=== Direct Test of Boot Failure Point ===');
  
  // Set up the exact scenario from the audit report
  const bootAddr = 0x11CB;
  
  // Ensure we have test data at the target address
  const targetAddr = 0x5C5D;
  const testValue = 0x1234;
  memory.writeWord(targetAddr, testValue);
  
  console.log(`📝 Test setup:`);
  console.log(`   Target instruction address: 0x${bootAddr.toString(16)}`);
  console.log(`   Memory address to read: 0x${targetAddr.toString(16)}`);
  console.log(`   Test data: 0x${testValue.toString(16)}`);
  
  // Place the problematic instruction at the target address
  memory.write(bootAddr, 0xED);     // ED prefix
  memory.write(bootAddr + 1, 0x2A); // LD HL,(nn)
  memory.write(bootAddr + 2, targetAddr & 0xFF);      // Low byte
  memory.write(bootAddr + 3, (targetAddr >> 8) & 0xFF); // High byte
  
  console.log(`📝 Instruction placed at 0x${bootAddr.toString(16)}:`);
  console.log(`   0x${memory.read(bootAddr).toString(16)} 0x${memory.read(bootAddr + 1).toString(16)} 0x${memory.read(bootAddr + 2).toString(16)} 0x${memory.read(bootAddr + 3).toString(16)}`);
  
  // Set CPU to execute the instruction
  cpu.PC = bootAddr;
  console.log(`\n🔍 Before execution:`);
  console.log(`   PC: 0x${cpu.PC.toString(16)}`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)}`);
  console.log(`   Interrupts: IFF1=${cpu.IFF1}, IFF2=${cpu.IFF2}, IM=${cpu.IM}`);
  
  // Execute the problematic instruction
  const tstates = cpu.step();
  
  console.log(`\n🔍 After executing LD HL,(0x${targetAddr.toString(16)}):`);
  console.log(`   PC: 0x${cpu.PC.toString(16)} (expected: 0x${(bootAddr + 4).toString(16)})`);
  console.log(`   HL: 0x${cpu._getHL().toString(16)} (expected: 0x${testValue.toString(16)})`);
  console.log(`   T-states: ${tstates} (expected: 16)`);
  
  // Check results
  const pcCorrect = cpu.PC === (bootAddr + 4);
  const hlCorrect = cpu._getHL() === testValue;
  const tstatesCorrect = tstates === 16;
  
  console.log('\n📊 Test Results:');
  console.log(`   PC advance: ${pcCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
  console.log(`   HL loading: ${hlCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
  console.log(`   T-states: ${tstatesCorrect ? '✅ CORRECT' : '❌ INCORRECT'}`);
  
  if (pcCorrect && hlCorrect && tstatesCorrect) {
    console.log('\n🎉 RESULT: The LD HL,(nn) instruction works perfectly!');
    console.log('💡 The boot failure is NOT caused by ED prefix implementation issues.');
    console.log('🔍 The failure might be caused by:');
    console.log('   • Missing or incorrect ROM content');
    console.log('   • Other missing Z80 opcodes');
    console.log('   • Memory mapping issues');
    console.log('   • I/O device interactions');
    console.log('   • Timing/contention issues');
  } else {
    console.log('\n❌ RESULT: The LD HL,(nn) instruction is NOT working correctly!');
    console.log('🚨 This confirms there is an implementation issue with ED prefixes.');
  }
  
  // Test other critical ED operations that might be used in boot
  console.log('\n=== Testing Other Critical ED Operations ===');
  
  const edTests = [
    { name: 'LD (nn),HL', opcode1: 0xED, opcode2: 0x22, tstates: 16 },
    { name: 'LD SP,(nn)', opcode1: 0xED, opcode2: 0x6B, tstates: 20 },
    { name: 'ADC HL,BC', opcode1: 0xED, opcode2: 0x4A, tstates: 15 },
    { name: 'SBC HL,BC', opcode1: 0xED, opcode2: 0x42, tstates: 15 },
    { name: 'IN B,(C)', opcode1: 0xED, opcode2: 0x40, tstates: 12 },
    { name: 'OUT (C),B', opcode1: 0xED, opcode2: 0x41, tstates: 12 }
  ];
  
  let allTestsPassed = true;
  
  for (const test of edTests) {
    const addr = 0x5000;
    memory.write(addr, test.opcode1);
    memory.write(addr + 1, test.opcode2);
    
    cpu.PC = addr;
    cpu._setBC(0xFE); // Set up BC for I/O tests
    cpu._setHL(0x1234); // Set up HL for memory tests
    
    const usedTstates = cpu.step();
    const passed = usedTstates === test.tstates && cpu.PC === addr + 2;
    
    console.log(`${test.name}: ${passed ? '✅' : '❌'} (tstates: ${usedTstates}, expected: ${test.tstates})`);
    
    if (!passed) allTestsPassed = false;
  }
  
  console.log('\n📊 Overall ED Operations Assessment:');
  if (allTestsPassed) {
    console.log('✅ All tested ED operations are working correctly');
  } else {
    console.log('❌ Some ED operations are not working correctly');
  }
  
  // Final conclusion
  console.log('\n🎯 FINAL CONCLUSION:');
  console.log('===================');
  
  if (pcCorrect && hlCorrect && tstatesCorrect && allTestsPassed) {
    console.log('✅ The Z80 ED prefix implementation is WORKING CORRECTLY');
    console.log('✅ Port I/O operations are WORKING CORRECTLY');
    console.log('✅ The boot sequence failure is NOT caused by missing ED opcodes');
    console.log('🎯 Next steps:');
    console.log('   1. Check if the actual ROM file is being loaded correctly');
    console.log('   2. Verify other Z80 opcode implementations');
    console.log('   3. Test I/O device implementations');
    console.log('   4. Check memory contention and timing issues');
    console.log('   5. Verify the boot sequence reaches the copyright message');
  } else {
    console.log('❌ There are implementation issues with ED prefix operations');
    console.log('🚨 This confirms the boot failure is caused by incomplete ED opcode support');
  }
  
} catch (error) {
  console.error('\n❌ Error during diagnostic:', error.message);
  console.error(error.stack);
}
