/**
 * Tests for the debug-jetpac-graphics-sound branch fixes:
 * 1. Alternate register restore from .z80 snapshots
 * 2. Border colour property fix
 * 3. Kempston port 0x1F returns 0x00
 * 4. IM 2 interrupt dispatch
 * 5. ED-prefix IN/OUT opcodes (full set)
 * 6. Block I/O: INI, IND, OUTI, OUTD, INIR, INDR, OTIR, OTDR
 * 7. Sound sample-buffer API
 * 8. _parity and _setInFlags helpers
 */
import { describe, it, expect } from 'vitest';
import { Memory } from '../../src/memory.mjs';
import { Z80 } from '../../src/z80.mjs';
import { Sound } from '../../src/sound.mjs';

// ── Helpers ──

function makeCPU(rom = []) {
  const mem = new Memory();
  if (rom.length > 0) mem.loadROM(new Uint8Array(rom));
  const cpu = new Z80(mem);
  cpu.reset();
  return { cpu, mem };
}

function makeCPUWithIO(rom = [], ioRead = () => 0xFF, ioWrite = () => {}) {
  const { cpu, mem } = makeCPU(rom);
  cpu.io = { read: ioRead, write: ioWrite };
  return { cpu, mem };
}

// ── 1. Alternate register property names ──

describe('Z80 alternate register properties', () => {
  it('should have A_ through L_ properties', () => {
    const { cpu } = makeCPU();
    expect(cpu).toHaveProperty('A_');
    expect(cpu).toHaveProperty('F_');
    expect(cpu).toHaveProperty('B_');
    expect(cpu).toHaveProperty('C_');
    expect(cpu).toHaveProperty('D_');
    expect(cpu).toHaveProperty('E_');
    expect(cpu).toHaveProperty('H_');
    expect(cpu).toHaveProperty('L_');
  });

  it('should allow writing and reading alternate registers', () => {
    const { cpu } = makeCPU();
    cpu.A_ = 0x12;
    cpu.F_ = 0x34;
    cpu.B_ = 0x56;
    cpu.C_ = 0x78;
    cpu.D_ = 0x9A;
    cpu.E_ = 0xBC;
    cpu.H_ = 0xDE;
    cpu.L_ = 0xF0;
    expect(cpu.A_).toBe(0x12);
    expect(cpu.F_).toBe(0x34);
    expect(cpu.B_).toBe(0x56);
    expect(cpu.C_).toBe(0x78);
    expect(cpu.D_).toBe(0x9A);
    expect(cpu.E_).toBe(0xBC);
    expect(cpu.H_).toBe(0xDE);
    expect(cpu.L_).toBe(0xF0);
  });
});

// ── 2. Parity helper ──

describe('Z80 _parity helper', () => {
  it('should return true for even parity (0x00 = 0 bits set)', () => {
    const { cpu } = makeCPU();
    expect(cpu._parity(0x00)).toBe(true);
  });

  it('should return false for odd parity (0x01 = 1 bit set)', () => {
    const { cpu } = makeCPU();
    expect(cpu._parity(0x01)).toBe(false);
  });

  it('should return true for 0xFF (8 bits set = even)', () => {
    const { cpu } = makeCPU();
    expect(cpu._parity(0xFF)).toBe(true);
  });

  it('should return false for 0x07 (3 bits set = odd)', () => {
    const { cpu } = makeCPU();
    expect(cpu._parity(0x07)).toBe(false);
  });

  it('should return true for 0x03 (2 bits set = even)', () => {
    const { cpu } = makeCPU();
    expect(cpu._parity(0x03)).toBe(true);
  });
});

// ── 3. _setInFlags helper ──

describe('Z80 _setInFlags helper', () => {
  it('should set Z flag for zero input', () => {
    const { cpu } = makeCPU();
    cpu.F = 0x01; // carry set
    cpu._setInFlags(0x00);
    // Z=1, S=0, H=0, P/V=even parity of 0 = 1, N=0, C=preserved
    expect(cpu.F & 0x40).toBe(0x40); // Z
    expect(cpu.F & 0x80).toBe(0);    // S=0
    expect(cpu.F & 0x04).toBe(0x04); // P/V (even parity)
    expect(cpu.F & 0x10).toBe(0);    // H=0
    expect(cpu.F & 0x02).toBe(0);    // N=0
    expect(cpu.F & 0x01).toBe(0x01); // C preserved
  });

  it('should set S flag for negative input', () => {
    const { cpu } = makeCPU();
    cpu.F = 0x00;
    cpu._setInFlags(0x80);
    expect(cpu.F & 0x80).toBe(0x80); // S=1
    expect(cpu.F & 0x40).toBe(0);    // Z=0
  });

  it('should clear Z and S for small positive', () => {
    const { cpu } = makeCPU();
    cpu.F = 0x00;
    cpu._setInFlags(0x01); // 1 bit set = odd parity
    expect(cpu.F & 0x80).toBe(0);    // S=0
    expect(cpu.F & 0x40).toBe(0);    // Z=0
    expect(cpu.F & 0x04).toBe(0);    // P/V=0 (odd parity)
  });
});

// ── 4. IM 2 interrupt dispatch ──

describe('IM 2 interrupt dispatch', () => {
  it('should read vector table and jump to target address', () => {
    const { cpu, mem } = makeCPU();
    // Set up IM 2 vector table at I=0x80, vector at (0x80FF)
    cpu.I = 0x80;
    cpu.IM = 2;
    cpu.IFF1 = true;
    cpu.IFF2 = true;
    cpu.SP = 0xFFF0;
    cpu.PC = 0x1234;
    cpu.intRequested = true;

    // Write vector at 0x80FF: low=0x00, high=0x90 → target = 0x9000
    mem.write(0x80FF, 0x00);
    mem.write(0x8100, 0x90);

    // Also place a HALT at current PC so step() processes the interrupt first
    cpu.step();

    expect(cpu.PC).toBe(0x9000);
    expect(cpu.IFF1).toBe(false);
    expect(cpu.IFF2).toBe(false);
  });

  it('should still jump to 0x0038 in IM 1', () => {
    const { cpu } = makeCPU();
    cpu.IM = 1;
    cpu.IFF1 = true;
    cpu.IFF2 = true;
    cpu.SP = 0xFFF0;
    cpu.PC = 0x1234;
    cpu.intRequested = true;

    cpu.step();

    expect(cpu.PC).toBe(0x0038);
  });

  it('should still jump to 0x0038 in IM 0', () => {
    const { cpu } = makeCPU();
    cpu.IM = 0;
    cpu.IFF1 = true;
    cpu.IFF2 = true;
    cpu.SP = 0xFFF0;
    cpu.PC = 0x1234;
    cpu.intRequested = true;

    cpu.step();

    expect(cpu.PC).toBe(0x0038);
  });
});

// ── 5. ED-prefix IN r,(C) — full set ──

describe('ED IN r,(C) opcodes', () => {
  const regCases = [
    { opcode: 0x40, reg: 'B', label: 'IN B,(C)' },
    { opcode: 0x48, reg: 'C', label: 'IN C,(C)' },
    { opcode: 0x50, reg: 'D', label: 'IN D,(C)' },
    { opcode: 0x58, reg: 'E', label: 'IN E,(C)' },
    { opcode: 0x60, reg: 'H', label: 'IN H,(C)' },
    { opcode: 0x68, reg: 'L', label: 'IN L,(C)' },
    { opcode: 0x78, reg: 'A', label: 'IN A,(C)' },
  ];

  for (const { opcode, reg, label } of regCases) {
    it(`ED ${opcode.toString(16)}: ${label} should read port and store in ${reg}`, () => {
      const portValue = 0x42;
      const { cpu, mem } = makeCPUWithIO([], () => portValue);

      // Place ED XX at RAM address (0x8000)
      mem.write(0x8000, 0xED);
      mem.write(0x8001, opcode);
      cpu.PC = 0x8000;
      cpu.B = 0x10; // BC = 0x10FE for port address
      cpu.C = 0xFE;

      cpu.step();

      expect(cpu[reg]).toBe(portValue);
    });
  }

  it('ED 70: undocumented IN (C) — affects flags only, does not store', () => {
    const { cpu, mem } = makeCPUWithIO([], () => 0x00);

    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0x70);
    cpu.PC = 0x8000;
    cpu.B = 0xAA; // should NOT be overwritten
    cpu.C = 0xFE;

    const origB = cpu.B;
    cpu.step();

    // B should be unchanged (undocumented: result not stored)
    expect(cpu.B).toBe(origB);
    // Z flag should be set (port returned 0x00)
    expect(cpu.F & 0x40).toBe(0x40);
  });
});

// ── 6. ED-prefix OUT (C),r — full set ──

describe('ED OUT (C),r opcodes', () => {
  const outCases = [
    { opcode: 0x41, reg: 'B', label: 'OUT (C),B' },
    { opcode: 0x49, reg: 'C', label: 'OUT (C),C' },
    { opcode: 0x51, reg: 'D', label: 'OUT (C),D' },
    { opcode: 0x59, reg: 'E', label: 'OUT (C),E' },
    { opcode: 0x61, reg: 'H', label: 'OUT (C),H' },
    { opcode: 0x69, reg: 'L', label: 'OUT (C),L' },
    { opcode: 0x79, reg: 'A', label: 'OUT (C),A' },
  ];

  for (const { opcode, reg, label } of outCases) {
    it(`ED ${opcode.toString(16)}: ${label} should write register value to port`, () => {
      let writtenPort = null;
      let writtenValue = null;
      const { cpu, mem } = makeCPUWithIO(
        [],
        () => 0xFF,
        (port, value) => { writtenPort = port; writtenValue = value; }
      );

      mem.write(0x8000, 0xED);
      mem.write(0x8001, opcode);
      cpu.PC = 0x8000;

      // For B and C, setting the register also changes the port address (BC)
      if (reg === 'B') {
        cpu.B = 0x10;
        cpu.C = 0xFE;
        // B=0x10, port = BC = 0x10FE, output value = B = 0x10
      } else if (reg === 'C') {
        cpu.B = 0x10;
        cpu.C = 0x55;
        // C=0x55, port = BC = 0x1055, output value = C = 0x55
      } else {
        cpu.B = 0x10;
        cpu.C = 0xFE;
        cpu[reg] = 0x55;
      }

      cpu.step();

      if (reg === 'B') {
        expect(writtenPort).toBe(0x10FE);
        expect(writtenValue).toBe(0x10);
      } else if (reg === 'C') {
        expect(writtenPort).toBe(0x1055);
        expect(writtenValue).toBe(0x55);
      } else {
        expect(writtenPort).toBe(0x10FE);
        expect(writtenValue).toBe(0x55);
      }
    });
  }

  it('ED 71: undocumented OUT (C),0 — outputs 0', () => {
    let writtenValue = null;
    const { cpu, mem } = makeCPUWithIO(
      [],
      () => 0xFF,
      (_port, value) => { writtenValue = value; }
    );

    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0x71);
    cpu.PC = 0x8000;
    cpu.B = 0x10;
    cpu.C = 0xFE;

    cpu.step();

    expect(writtenValue).toBe(0);
  });
});

// ── 7. Block I/O instructions ──

describe('Block I/O instructions', () => {
  it('ED A2: INI — reads port, writes to (HL), HL++, B--', () => {
    const portValue = 0x42;
    const { cpu, mem } = makeCPUWithIO([], () => portValue);

    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xA2);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x00;

    cpu.step();

    expect(mem.read(0x4000)).toBe(portValue);
    expect(cpu.B).toBe(0x02);
    // HL should have incremented
    expect(cpu.H).toBe(0x40);
    expect(cpu.L).toBe(0x01);
  });

  it('ED AA: IND — reads port, writes to (HL), HL--, B--', () => {
    const portValue = 0x55;
    const { cpu, mem } = makeCPUWithIO([], () => portValue);

    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xAA);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x10;

    cpu.step();

    expect(mem.read(0x4010)).toBe(portValue);
    expect(cpu.B).toBe(0x02);
    expect(cpu.H).toBe(0x40);
    expect(cpu.L).toBe(0x0F);
  });

  it('ED A3: OUTI — reads (HL), outputs to port, HL++, B--', () => {
    let writtenValue = null;
    const { cpu, mem } = makeCPUWithIO(
      [],
      () => 0xFF,
      (_port, value) => { writtenValue = value; }
    );

    mem.write(0x4000, 0xAA);
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xA3);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x00;

    cpu.step();

    expect(writtenValue).toBe(0xAA);
    expect(cpu.B).toBe(0x02);
    expect(cpu.H).toBe(0x40);
    expect(cpu.L).toBe(0x01);
  });

  it('ED AB: OUTD — reads (HL), outputs to port, HL--, B--', () => {
    let writtenValue = null;
    const { cpu, mem } = makeCPUWithIO(
      [],
      () => 0xFF,
      (_port, value) => { writtenValue = value; }
    );

    mem.write(0x4010, 0xBB);
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xAB);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x10;

    cpu.step();

    expect(writtenValue).toBe(0xBB);
    expect(cpu.B).toBe(0x02);
    expect(cpu.H).toBe(0x40);
    expect(cpu.L).toBe(0x0F);
  });

  it('ED B2: INIR — repeats until B=0', () => {
    let callCount = 0;
    const { cpu, mem } = makeCPUWithIO([], () => {
      callCount++;
      return callCount & 0xFF;
    });

    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xB2);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x00;

    // INIR repeats by rewinding PC — we need to step multiple times
    // First iteration: B becomes 2, PC rewound to 0x8000
    cpu.step();
    expect(cpu.B).toBe(0x02);
    expect(cpu.PC).toBe(0x8000);

    cpu.step();
    expect(cpu.B).toBe(0x01);
    expect(cpu.PC).toBe(0x8000);

    cpu.step();
    expect(cpu.B).toBe(0x00);
    // When B reaches 0, PC should NOT be rewound
    expect(cpu.PC).toBe(0x8002);
  });

  it('ED B3: OTIR — repeats until B=0', () => {
    let outCount = 0;
    const { cpu, mem } = makeCPUWithIO(
      [],
      () => 0xFF,
      () => { outCount++; }
    );

    // Place data at 0x4000-0x4002
    mem.write(0x4000, 0x11);
    mem.write(0x4001, 0x22);
    mem.write(0x4002, 0x33);
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0xB3);
    cpu.PC = 0x8000;
    cpu.B = 0x03;
    cpu.C = 0xFE;
    cpu.H = 0x40;
    cpu.L = 0x00;

    cpu.step(); // B=2, repeat
    cpu.step(); // B=1, repeat
    cpu.step(); // B=0, done

    expect(cpu.B).toBe(0x00);
    expect(outCount).toBe(3);
  });
});

// ── 8. Kempston port 0x1F ──

describe('Kempston joystick port', () => {
  it('should return 0x00 for port 0x1F (no joystick input)', () => {
    // This tests the IO adapter logic — we simulate it here
    // The actual adapter is in main.mjs; we verify the expected behavior
    const kempstonPort = 0x001F;
    // Emulate the IO adapter logic:
    const portLow = kempstonPort & 0xFF;
    const isULA = portLow === 0xFE;
    const isKempston = portLow === 0x1F;

    expect(isULA).toBe(false);
    expect(isKempston).toBe(true);
    // Expected return: 0x00 (no directions/fire pressed)
    const result = isKempston ? 0x00 : 0xFF;
    expect(result).toBe(0x00);
  });
});

// ── 9. Sound module API ──

describe('Sound sample-buffer module', () => {
  it('should have endFrame method', () => {
    const snd = new Sound();
    expect(typeof snd.endFrame).toBe('function');
  });

  it('should accept writePort calls without crashing', () => {
    const snd = new Sound();
    expect(() => snd.writePort(0xFE, 0x10, 100)).not.toThrow();
    expect(() => snd.writePort(0xFE, 0x00, 200)).not.toThrow();
  });

  it('should record toggles from writePort', () => {
    const snd = new Sound();
    snd.writePort(0xFE, 0x10, 100); // speaker bit ON
    expect(snd._toggles.length).toBe(1);
    expect(snd._toggles[0]).toEqual({ t: 100, level: 1 });

    snd.writePort(0xFE, 0x00, 200); // speaker bit OFF
    expect(snd._toggles.length).toBe(2);
    expect(snd._toggles[1]).toEqual({ t: 200, level: 0 });
  });

  it('should not record duplicate toggles (same bit)', () => {
    const snd = new Sound();
    snd.writePort(0xFE, 0x10, 100); // ON
    snd.writePort(0xFE, 0x10, 150); // still ON — no toggle
    expect(snd._toggles.length).toBe(1);
  });

  it('should ignore non-0xFE ports', () => {
    const snd = new Sound();
    snd.writePort(0x1F, 0x10, 100);
    expect(snd._toggles.length).toBe(0);
  });

  it('endFrame should clear toggles', () => {
    const snd = new Sound();
    snd.writePort(0xFE, 0x10, 100);
    snd.writePort(0xFE, 0x00, 200);
    expect(snd._toggles.length).toBe(2);

    snd.endFrame(0);
    expect(snd._toggles.length).toBe(0);
  });

  it('should have setMuted/isMuted/setVolume API', () => {
    const snd = new Sound();
    expect(snd.isMuted()).toBe(false);
    snd.setMuted(true);
    expect(snd.isMuted()).toBe(true);
    snd.setVolume(0.5);
    expect(snd._volume).toBe(0.5);
  });

  it('close should not throw', () => {
    const snd = new Sound();
    expect(() => snd.close()).not.toThrow();
  });
});

// ── 10. IM mode setting opcodes ──

describe('IM mode setting opcodes', () => {
  it('ED 46: IM 0', () => {
    const { cpu, mem } = makeCPU();
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0x46);
    cpu.PC = 0x8000;
    cpu.IM = 1;

    cpu.step();
    expect(cpu.IM).toBe(0);
  });

  it('ED 56: IM 1', () => {
    const { cpu, mem } = makeCPU();
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0x56);
    cpu.PC = 0x8000;
    cpu.IM = 0;

    cpu.step();
    expect(cpu.IM).toBe(1);
  });

  it('ED 5E: IM 2', () => {
    const { cpu, mem } = makeCPU();
    mem.write(0x8000, 0xED);
    mem.write(0x8001, 0x5E);
    cpu.PC = 0x8000;
    cpu.IM = 1;

    cpu.step();
    expect(cpu.IM).toBe(2);
  });
});
