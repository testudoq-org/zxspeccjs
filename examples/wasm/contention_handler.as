// AssemblyScript sample: contention helper (illustrative)

// Simple contention table accessor (frameCycleCount and table would be
// populated by the JS layer or built at init time in a full port).

export const FRAME_CYCLE: i32 = 69888;

// Example: return contention extra for a given tstate offset (0..FRAME_CYCLE-1)
export function contentionAt(frameOffset: i32): i32 {
  // Simple placeholder: emulate the classic 8-step pattern for first visible period
  const pos = frameOffset % FRAME_CYCLE;
  // naive: if pos in first contended window (simulated) return 3 else 0
  if (pos > 14335 && pos < 14335 + 224 * 192) {
    const x = pos % 8;
    if (x === 7) return 0;
    return 6 - x; // sequence 6,5,4,3,2,1,0,0
  }
  return 0;
}
