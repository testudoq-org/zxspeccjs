export function runBootFrames({ cpu, memory, frames = 200, tstatesPerFrame = 69888 } = {}) {
  const milestones = {
    'Start': 0x0000,
    'After DI': 0x0001,
    'Interrupt Vector': 0x0038,
    'Error Handler': 0x0055,
    'Copyright Display': 0x1530,
    'BASIC Entry': 0x0D6E
  };

  const reached = {};
  let eiExecuted = false;
  let interruptsServiced = 0;
  let firstInterruptFrame = null;

  for (let frame = 0; frame < frames; frame++) {
    let tStates = 0;

    while (tStates < tstatesPerFrame) {
      const pc = cpu.PC;
      const opcode = memory.read(pc);

      if (opcode === 0xFB) eiExecuted = true; // EI

      Object.entries(milestones).forEach(([name, addr]) => {
        if (pc === addr && !reached[name]) reached[name] = frame;
      });

      tStates += cpu.step();

      // Quick heuristic to stop early when boot output area reached
      if (eiExecuted && interruptsServiced > 0 && reached['Copyright Display']) {
        return { reached, eiExecuted, interruptsServiced, firstInterruptFrame };
      }
    }

    if (cpu.IFF1) {
      cpu.intRequested = true;
      interruptsServiced++;
      if (firstInterruptFrame === null) firstInterruptFrame = frame;
    }
  }

  return { reached, eiExecuted, interruptsServiced, firstInterruptFrame };
}

export function detectStall({ cpu, steps = 3000, stallThreshold = 50 } = {}) {
  let lastPC = cpu.PC;
  let stalledCount = 0;

  for (let i = 0; i < steps; i++) {
    cpu.step();
    if (cpu.PC === lastPC) {
      stalledCount++;
      if (stalledCount >= stallThreshold) break; // early exit when threshold reached
    } else {
      stalledCount = 0;
      lastPC = cpu.PC;
    }
  }

  return { stalledCount, finalPC: cpu.PC, stallThreshold };
}
