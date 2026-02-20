// Minimal AssemblyScript sample: opcode decoder table (illustrative only)
// This is a tiny, well-typed subset showing how an opcode-dispatcher
// could be expressed in AssemblyScript for compilation to WASM.

export function decodeOpcode(op: u32): u32 {
  // Map opcode to an internal opcode id (very small sample)
  switch (op & 0xFF) {
    case 0x00: return 0; // NOP
    case 0x76: return 1; // HALT
    case 0x3E: return 2; // LD A,n
    case 0xDB: return 3; // IN A,(n)
    case 0xD3: return 4; // OUT (n),A
    default: return 255; // UNIMPL
  }
}

// Sample decoder utility returning the number of operand bytes expected
export function operandBytes(op: u32): u32 {
  switch (op & 0xFF) {
    case 0x3E: return 1;
    case 0x01: // LD BC,nn
    case 0x11: // LD DE,nn
    case 0x21: // LD HL,nn
    case 0x31: return 2;
    default: return 0;
  }
}
