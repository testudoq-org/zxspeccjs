# Z80 opcode implementation plan

This document lists opcode groups and implementation status for the Z80 core in this project.

1. Basic opcodes (implemented)
   - NOP, LD r,n, LD r,r, JP, JR, CALL, RET, LD (HL),n, LD (nn),A, LD A,(nn)
   - IN/OUT (simple support)

2. Arithmetic (partial)
   - ADD A,r (implemented subset)
   - SUB r (partial)
   - INC/DEC r and (HL) implemented

3. Logical (added)
   - AND/OR/XOR/CP implemented for registers and (HL)

4. Stack and register ops (partial)
   - PUSH/POP for AF, BC, DE, HL implemented
   - EX DE,HL implemented

5. RST instructions implemented

6. Extended opcodes (TODO)
   - CB prefix: BIT, RES, SET, RLC/RRC/RL/RR,SLA/SRA/SRL (needed)
   - ED prefix: block instructions, I/O block ops, in/outr, etc.
   - DD/FD prefixes: IX/IY register set

7. Interrupts and IM modes (TODO)
   - Full IM0/IM1/IM2 support

8. I/O handling (TODO)
   - Proper port mapping and ULA/AY integration

9. Flags (TODO)
   - Correct H, PV, N, C behavior for every operation

Plan:
- Implement CB-prefixed opcodes next (BIT/RES/SET and shifts/rotates).
- Implement remaining arithmetic edge cases (half-carry, overflow) and flags.
- Implement ED-prefixed opcodes and DD/FD prefixes.
- Add tests referencing official Z80 opcode tables and compare with known traces.
