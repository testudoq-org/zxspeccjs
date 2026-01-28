# A Working Bootload Sequence: Analysis and Implementation Guide

## Executive Summary

This document provides a comprehensive analysis comparing our ZX Spectrum emulator boot loading approach with the proven JSSpeccy3 implementation by Matt Westcott (gasman). The goal is to identify architectural differences that explain our "red lines" boot issue and propose concrete solutions.

---

## Part 1: JSSpeccy3 Architecture Analysis

### 1.1 Key Architectural Patterns

JSSpeccy3 uses a fundamentally different approach from ours:

#### **Three-Layer Architecture:**
1. **UI Thread** (`runtime/jsspeccy.js`) - Lightweight, handles rendering, input, and audio output only
2. **Web Worker** (`runtime/worker.js`) - Mediator that manages state and tape loading
3. **WebAssembly Core** (`jsspeccy-core.wasm`) - ALL performance-critical emulation

```
┌──────────────────────────────────────────────────────────────┐
│                    UI Thread (Main)                          │
│  - Canvas rendering (CanvasRenderer)                         │
│  - Keyboard events                                           │
│  - Audio output (AudioHandler)                               │
│  - requestAnimationFrame() timing                            │
└──────────────────────────────────────────────────────────────┘
         ↓ postMessage('runFrame')      ↑ postMessage('frameCompleted')
┌──────────────────────────────────────────────────────────────┐
│                    Web Worker                                │
│  - Tape trap handling                                        │
│  - Snapshot loading                                          │
│  - Message routing                                           │
└──────────────────────────────────────────────────────────────┘
         ↓ core.runFrame()              ↑ status codes
┌──────────────────────────────────────────────────────────────┐
│                    WebAssembly Core                          │
│  - Z80 CPU emulation                                         │
│  - Memory reads/writes                                       │
│  - Port I/O                                                  │
│  - Frame buffer generation (deferred rendering)              │
│  - Audio buffer generation (deferred generation)             │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 The Critical "Deferred Rendering" Pattern

**This is the key insight from the tech_notes.md:**

> "On the real machine, generating video and audio output happens in parallel with the Z80's execution - an emulator implementing this naïvely would have to break out of the Z80 loop every few cycles to perform these tasks. In fact, these processes can be **deferred for as long as we like**, as long as we catch up on them **before any state changes occur** that would affect the output."

JSSpeccy implements this via:
- `updateFramebuffer()` - Called before any video-affecting operation
- `updateAudioBuffer()` - Called before any audio-affecting operation

**Operations that trigger framebuffer update:**
1. Write to video memory (0x4000-0x57FF)
2. Write to attribute memory (0x5800-0x5AFF)
3. Change border colour (OUT to port 0xFE)
4. Memory paging port write (128K mode)

### 1.3 Frame Buffer Format

JSSpeccy uses a **log-based frame buffer** (0x6600 bytes) that records:
- Border colour changes (scanline-accurate)
- Screen bitmap bytes + attribute bytes

The frame buffer is essentially a **recording** of what video data was present at each scanline position, allowing the renderer to reconstruct accurate timing without needing to render in real-time.

### 1.4 ROM Loading Approach

```javascript
// JSSpeccy3: ROMs loaded into fixed memory pages
async loadRoms() {
    await this.loadRom('roms/128-0.rom', 8);  // 128K ROM bank 0
    await this.loadRom('roms/128-1.rom', 9);  // 128K ROM bank 1  
    await this.loadRom('roms/48.rom', 10);    // 48K ROM
    await this.loadRom('roms/pentagon-0.rom', 12);
    await this.loadRom('roms/trdos.rom', 13);
}

// Loading is just a memcpy into the WASM memory
const loadMemoryPage = (page, data) => {
    memoryData.set(data, core.MACHINE_MEMORY + page * 0x4000);
};
```

**Key Point**: ROMs are loaded into **fixed page slots**, not dynamically mapped. The core knows where each ROM type resides.

### 1.5 The `runFrame()` Execution Model

```javascript
// In worker.js
let status = core.runFrame();  // Run exactly one frame of emulation
while (status) {
    switch (status) {
        case 1:
            throw("Unrecognised opcode!");
        case 2:
            trapTapeLoad();
            break;
    }
    status = core.resumeFrame();  // Continue after trap
}
```

**Critical**: The WASM core runs **one complete frame** (69888 t-states for 48K) in a single call. The frame boundary naturally generates the interrupt.

---

## Part 2: Our Current Architecture Analysis

### 2.1 Our Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Single Thread (main.mjs)                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Z80.mjs                                               │  │
│  │  - Full Z80 implementation in JavaScript               │  │
│  │  - Per-instruction execution with callbacks            │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Memory.mjs                                            │  │
│  │  - Page-based memory with ROM/RAM separation           │  │
│  │  - No contention timing                                │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ULA.mjs                                               │  │
│  │  - Direct render() calls                               │  │
│  │  - Interrupt generation via setTimeout                 │  │
│  │  - Flash handled separately                            │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Identified Problems

#### **Problem 1: Real-Time Rendering During Execution**

Our `_loop()` function:
```javascript
_loop(now) {
    // ... timing code ...
    while (this._acc >= FRAME_MS) {
        this.cpu.runFor(TSTATES_PER_FRAME);
        // PROBLEM: render() called AFTER all CPU execution
        if (this.ula) this.ula.render();
        this._acc -= FRAME_MS;
    }
}
```

The ROM's boot sequence **writes to video memory during execution**. If we don't catch these writes at the exact right timing, we either:
1. Display garbage before ROM initializes memory
2. Display nothing because we render before writes complete
3. Display corrupted state (the "red lines")

#### **Problem 2: Interrupt Generation Timing**

Our current approach:
```javascript
// ULA.mjs
generateInterrupt(tstates) {
    this.tstatesInFrame += tstates;
    if (this.tstatesInFrame >= this.tstatesPerFrame) {
        // PROBLEM: Async setTimeout for interrupt
        setTimeout(() => {
            this.cpu.requestInterrupt();
        }, 2);
    }
}
```

**Issues:**
1. `setTimeout` is asynchronous and non-deterministic
2. The 2ms delay is arbitrary and breaks deterministic emulation
3. Interrupt timing is not tied to frame execution

#### **Problem 3: Display Memory Initialization Race**

```javascript
// ULA.mjs render()
if (!this._initialized) {
    if (bitmap) bitmap.fill(0x00);
    if (attrs) attrs.fill(0x38);
    this._initialized = true;
}
```

This initialization happens in `render()`, but the ROM also initializes these areas. There's a race condition between:
1. Our initialization (white on black = 0x38 attributes)
2. ROM initialization (may write different values)
3. When `render()` actually gets called

#### **Problem 4: Video Memory Is Read From Live RAM**

Our `render()` reads directly from `this.mem.getBitmapView()` - the live RAM at any moment. If the ROM is in the middle of writing patterns (like clearing screen), we might catch a half-written state.

---

## Part 3: The "Red Lines" Bug Root Cause

### 3.1 What Causes Red Lines

The "red lines" appear because:

1. **Attribute byte interpretation**: When attribute bytes contain garbage or specific values, they're interpreted as red ink/paper combinations
2. **Timing mismatch**: The ROM's screen clearing routine is interrupted or not fully executed before rendering
3. **Initialization race**: Our attribute initialization (0x38 = white ink, black paper) might be overwritten by ROM routine mid-way

### 3.2 The Specific Boot Sequence Problem

The ZX Spectrum ROM boot sequence at 0x0000:
```assembly
0000: F3        DI              ; Disable interrupts
0001: AF        XOR A           ; A = 0
0002: 11 3A 5C  LD DE, 0x5C3A   ; System variables area
0005: C3 38 00  JP 0x0038       ; Jump to interrupt handler (intentional during boot)
```

At 0x0038 (the IM 1 interrupt handler), the ROM performs initialization. The problem is that our emulator might:
1. Execute partial initialization
2. Call `render()` before screen clear completes
3. Generate interrupts at wrong times, disrupting initialization

---

## Part 4: Recommended Architectural Changes

### 4.1 Option A: Adopt Deferred Rendering (Recommended)

Instead of rendering live memory, **log video writes** and render from the log:

```javascript
// New approach: Frame buffer as a log
class FrameBuffer {
    constructor() {
        this.buffer = new Uint8Array(0x6600); // Like JSSpeccy3
        this.writePtr = 0;
        this.currentBorder = 7; // White default
    }
    
    // Called at frame start
    reset() {
        this.writePtr = 0;
    }
    
    // Called when video-affecting write occurs
    updateToTstate(tstate) {
        // Calculate which scanline position corresponds to this tstate
        // Fill buffer with current border/screen state up to this point
    }
    
    // Called when border changes
    setBorder(colour) {
        this.updateToTstate(this.cpu.tstates);
        this.currentBorder = colour;
    }
}
```

**Benefits:**
- Exact timing accuracy
- No race conditions
- Screen state captured at correct moments

### 4.2 Option B: Simplified Boot Sequence (Quick Fix)

If full deferred rendering is too complex, implement a **boot mode**:

```javascript
class Emulator {
    constructor() {
        this._bootMode = true;
        this._bootFrameCount = 0;
    }
    
    _loop(now) {
        if (this._bootMode) {
            // During boot: run multiple frames without rendering
            for (let i = 0; i < 10; i++) {  // ~200ms of emulation
                this.cpu.runFor(TSTATES_PER_FRAME);
                this._handleInterrupt();
            }
            this._bootMode = false;
            this.ula.render();  // Single render after boot completes
        } else {
            // Normal frame execution
            this.cpu.runFor(TSTATES_PER_FRAME);
            this._handleInterrupt();
            this.ula.render();
        }
    }
}
```

**Benefits:**
- Simple to implement
- Avoids race conditions during boot
- ROM has time to fully initialize display

**Drawbacks:**
- Not cycle-accurate during boot
- Won't show boot animations

### 4.3 Option C: Synchronous Interrupt Generation

Replace async `setTimeout` with synchronous interrupt handling:

```javascript
// Z80.mjs
runFor(targetTstates) {
    const startTstates = this.tstates;
    const endTstates = startTstates + targetTstates;
    
    while (this.tstates < endTstates) {
        // Check for interrupt at frame boundary
        if (this.tstates >= this._nextInterruptTstate) {
            this._handleInterruptNow();
            this._nextInterruptTstate += 69888; // Next frame
        }
        
        const cycles = this.executeInstruction();
        this.tstates += cycles;
    }
}

_handleInterruptNow() {
    if (this.IFF1) {
        this.IFF1 = false;
        this.IFF2 = false;
        // Push PC, jump to 0x0038
        this._pushWord(this.PC);
        this.PC = 0x0038;
        this.tstates += 13; // Interrupt acknowledge cycles
    }
}
```

---

## Part 5: Immediate Action Plan

### Phase 1: Quick Boot Fix (Implement First)

1. **Skip rendering during first 10-20 frames**
   - Let ROM fully initialize display memory
   - Avoids race conditions entirely

2. **Make interrupt generation synchronous**
   - Remove `setTimeout` from interrupt generation
   - Generate interrupt at exact frame boundary

3. **Initialize display to known state BEFORE ROM loads**
   - Clear bitmap to 0x00
   - Set attributes to 0x38 (white on black)
   - Set border to white (7)

### Phase 2: Proper Deferred Rendering (Future)

1. Implement frame buffer logging system
2. Track video memory writes with tstate timing
3. Render from log at frame end
4. Add border colour change logging

### Phase 3: Consider Architecture Change (Long-term)

1. Move Z80 core to Web Worker
2. Use message passing for frame synchronization
3. Consider WebAssembly for performance

---

## Part 6: Code Implementation Guide

### 6.1 Immediate Boot Fix Implementation

```javascript
// main.mjs modifications

class Emulator {
    constructor(opts = {}) {
        // ... existing code ...
        this._bootFramesRemaining = 20; // Skip first 20 frames of rendering
    }
    
    _loop(now) {
        if (!this._running) return;
        
        const dt = now - this._lastTime;
        this._lastTime = now;
        this._acc += dt;

        while (this._acc >= FRAME_MS) {
            this._applyInputToULA();
            
            // Run CPU for frame
            if (this.cpu && typeof this.cpu.runFor === 'function') {
                this.cpu.runFor(TSTATES_PER_FRAME);
                
                // Generate interrupt synchronously
                if (this.cpu.IFF1) {
                    this.cpu.intRequested = true;
                    // Let CPU handle interrupt on next instruction
                }
            }

            // Only render after boot completes
            if (this._bootFramesRemaining > 0) {
                this._bootFramesRemaining--;
                console.log(`[Boot] Frame ${20 - this._bootFramesRemaining}/20`);
            } else if (this.ula) {
                this.ula.render();
            }

            this._acc -= FRAME_MS;
        }

        this._rafId = requestAnimationFrame(this._loop);
    }
}
```

### 6.2 Synchronous Interrupt Fix

```javascript
// z80.mjs modifications

class Z80 {
    runFor(targetTstates) {
        const endTstates = this.tstates + targetTstates;
        
        while (this.tstates < endTstates) {
            // Handle pending interrupt BEFORE next instruction
            if (this.intRequested && this.IFF1) {
                this._handleInterrupt();
                this.intRequested = false;
            }
            
            const cycles = this.step();
            this.tstates += cycles;
        }
    }
    
    _handleInterrupt() {
        this.IFF1 = false;
        this.IFF2 = false;
        
        // IM 1 mode: Jump to 0x0038
        if (this.IM === 1) {
            this._pushWord(this.PC);
            this.PC = 0x0038;
            this.tstates += 13;
        }
    }
}
```

### 6.3 ULA Initialization Fix

```javascript
// ula.mjs modifications

class ULA {
    constructor(memory, canvas) {
        // ... existing code ...
        
        // Initialize display BEFORE any emulation starts
        this._initializeDisplay();
    }
    
    _initializeDisplay() {
        // Get direct access to video memory
        const bitmap = this.mem.getBitmapView();
        const attrs = this.mem.getAttributeView();
        
        if (bitmap) {
            // Clear bitmap to all zeros (black pixels)
            bitmap.fill(0x00);
        }
        
        if (attrs) {
            // Set all attributes to 0x38 (white ink on black paper)
            attrs.fill(0x38);
        }
        
        // Set border to white
        this.border = 7;
        this._updateCanvasBorder();
        
        console.log('[ULA] Display initialized: black screen with white ink/border');
    }
    
    render() {
        // REMOVE the _initialized check - initialization happens in constructor now
        // The ROM will overwrite these values as it executes
        
        this._updateFlash();
        // ... rest of render code ...
    }
}
```

---

## Part 7: ROM Compatibility Notes

### 7.1 Using JSSpeccy3 ROMs

The JSSpeccy3 project includes working ROM files in `roms/` directory:
- `48.rom` - ZX Spectrum 48K ROM (16384 bytes)
- `128-0.rom` - ZX Spectrum 128K ROM bank 0
- `128-1.rom` - ZX Spectrum 128K ROM bank 1

These are the same Sinclair ROMs used by most emulators. If our ROM file has issues, we can verify by:

1. Comparing byte-for-byte with JSSpeccy3's 48.rom
2. Checking first bytes: `F3 AF 11 FF FF` (DI, XOR A, LD DE, 0xFFFF)
3. Verifying size is exactly 16384 bytes

### 7.2 ROM Boot Entry Points

| Address | Purpose |
|---------|---------|
| 0x0000  | Cold start (power on) |
| 0x0038  | IM 1 interrupt handler |
| 0x0066  | NMI handler |
| 0x11CB  | Main BASIC interpreter entry |
| 0x12A2  | MAIN-EXEC loop |

---

## Part 8: Testing the Boot Sequence

### 8.1 Boot Sequence Validation Checklist

1. **Frame 1-5**: CPU should be executing 0x0000-0x0005
2. **Frame 5-10**: CPU should be in interrupt handler at 0x0038
3. **Frame 10-20**: Screen clearing should occur (bitmap → 0x00)
4. **Frame 20+**: Copyright message should appear

### 8.2 Debug Points

Add these checkpoints to verify boot progress:

```javascript
// Debug helper
const BOOT_CHECKPOINTS = {
    0x0000: 'Cold start',
    0x0038: 'Interrupt handler',
    0x0DAF: 'Channel clearing',
    0x11CB: 'BASIC entry',
    0x12A2: 'MAIN-EXEC',
    0x15C4: 'REPORT-J (copyright)'
};

// In Z80.step() or debugCallback:
if (BOOT_CHECKPOINTS[this.PC]) {
    console.log(`[BOOT] Reached ${BOOT_CHECKPOINTS[this.PC]} at PC=${this.PC.toString(16)}`);
}
```

---

## Part 9: Summary of Changes Required

### Must Do (Critical Fixes)

1. ✅ Remove `setTimeout` from interrupt generation
2. ✅ Add boot frame skip (20 frames)
3. ✅ Initialize display memory in ULA constructor
4. ✅ Make interrupt handling synchronous in runFor()

### Should Do (Stability Improvements)

1. Implement frame buffer logging
2. Track border colour changes with tstate
3. Add video memory write hooks
4. Improve interrupt timing accuracy

### Nice to Have (Future)

1. Web Worker architecture
2. WebAssembly Z80 core
3. Full cycle-accurate rendering
4. Memory contention emulation

---

## Conclusion

The "red lines" boot issue stems from a fundamental timing mismatch between our rendering approach (live memory reads) and the ROM's initialization sequence. JSSpeccy3 solves this with:

1. **Deferred rendering** - Log video state changes, render at frame end
2. **Deterministic interrupt generation** - Part of the WASM frame execution
3. **Clean separation** - UI, worker, and core in separate threads

Our quickest path to a working boot is to:
1. Skip rendering during the first 20 frames
2. Make interrupts synchronous
3. Initialize display before emulation starts

This document should serve as both an analysis and implementation guide for fixing the boot sequence issue.

---

*Document created: 2026-01-27*
*Based on analysis of [gasman/jsspeccy3](https://github.com/gasman/jsspeccy3) tech_notes.md and source code*
