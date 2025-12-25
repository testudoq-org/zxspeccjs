# I/O Channels and Print Routine Setup Analysis

## Executive Summary

The ZX Spectrum emulator currently lacks a complete I/O channel system implementation, which prevents proper execution of ROM print routines and channel-based I/O operations. While the CPU can execute RST 0x10 instructions, the actual PRINT routine and channel system are not properly implemented.

## Current Implementation Status

### ✅ **What's Currently Implemented**

1. **Z80 CPU (src/z80.mjs)**
   - RST 0x10 instruction executes (jumps to address 0x10 in ROM)
   - Basic IN/OUT port instructions implemented
   - I/O adapter connection established in main.mjs

2. **Main Emulator (src/main.mjs)**
   - I/O adapter routes port 0xFE to ULA for border/keyboard
   - Basic memory and CPU initialization
   - Port write tracking for debugging

3. **ULA Display System (src/ula.mjs)**
   - Complete display rendering from memory (0x4000-0x57FF bitmap, 0x5800-0x5AFF attributes)
   - Port 0xFE handling for border color and keyboard scanning
   - Proper Spectrum memory layout handling

4. **Memory System (src/memory.mjs)**
   - Basic memory mapping and access functions
   - Display file access methods (getBitmapView, getAttributeView)

### ❌ **What's Missing**

#### 1. **I/O Channel System Infrastructure**
- **CHANS system variable (0x5C4F)**: Not implemented
- **CURCHL system variable (0x5C51)**: Not implemented  
- **Channel table structure**: Not implemented
- **CHAN-OPEN routine (0x1601)**: Not implemented

#### 2. **PRINT Routine Implementation**
- ROM address 0x10: Points to actual PRINT routine in ROM, but channel system not set up
- Channel output routing: No connection between channels and actual output devices
- Character positioning and formatting: Not implemented
- Attribute handling during text output: Not implemented

#### 3. **Screen Output Integration**
- Display file writes: No automatic screen updates when display file is modified by print routines
- Cursor positioning: Not implemented
- Text rendering from character patterns: ROM handles this, but display updates not triggered
- Line management and scrolling: Not implemented

## ZX Spectrum I/O Channel Architecture

### Channel System Overview

The ZX Spectrum uses a sophisticated channel-based I/O system:

1. **System Variables (RAM at boot):**
   - `CHANS` (0x5C4F): Pointer to channel information table
   - `CURCHL` (0x5C51): Pointer to current channel information
   - Channel table contains entries for 'K' (keyboard), 'S' (screen), 'P' (printer)

2. **Channel Information Structure:**
   ```
   Channel Entry Format:
   - Flag byte (bit 7: output, bit 6: input)
   - Stream ID (0=K, 1=S, 2=P)  
   - Output routine address (for 'S' channel: prints to screen)
   - Input routine address (for 'K' channel: reads from keyboard)
   - Additional channel-specific data
   ```

3. **PRINT Routine Flow (RST 0x10):**
   - Called when CPU needs to print characters
   - Uses CURCHL to find current output channel
   - Routes character to appropriate output routine
   - For 'S' channel: writes to display file at current cursor position
   - Handles cursor positioning, line feeds, attribute updates

## ROM Analysis

### Critical ROM Addresses

- **0x0010**: RST 0x10 - PRINT routine entry point
- **0x0038**: RST 0x38 - Interrupt handler
- **0x1601**: CHAN-OPEN - Channel opening routine

### Expected Boot Sequence

1. **ROM boot at 0x0000** → Initializes system variables
2. **Sets up CHANS table** → Points to channel information in RAM  
3. **Opens default channels** → 'K', 'S', 'P' channels
4. **Prints copyright message** → Uses RST 0x10 to output to 'S' channel
5. **Enters BASIC** → Ready for user input via 'K' channel

## Required Implementation

### 1. System Variables Setup

```javascript
// In memory.mjs - add system variables handling
class SystemVariables {
  static CHANS = 0x5C4F;    // Channel table pointer
  static CURCHL = 0x5C51;   // Current channel pointer
  
  static initializeChannels(memory) {
    // Set up CHANS table in RAM
    // Initialize CURCHL to point to screen channel
  }
}
```

### 2. Channel Implementation

```javascript
// Channel classes for different I/O devices
class ScreenChannel {
  output(char) {
    // Write character to display file at cursor position
    // Handle cursor movement, line feeds, scrolling
    // Update attributes
  }
}

class KeyboardChannel {
  input() {
    // Read from keyboard matrix
    // Handle key debouncing
  }
}
```

### 3. PRINT Routine Integration

```javascript
// In Z80 CPU - enhanced RST 0x10 handling
case 0xD7: // RST 0x10 - PRINT
  this.handlePrintRoutine();
  return 11;
```

### 4. Display Update Triggers

```javascript
// In ULA - detect display file modifications
class DisplayFileWatcher {
  onDisplayFileWrite(address, value) {
    // Trigger screen update when display file is modified
    // This connects print routines to actual screen updates
  }
}
```

## Current Problems

### 1. **CPU Stops Early (PC: 0x00 → 0x38)**
- **Cause**: Missing channel system means ROM boot sequence cannot complete
- **Impact**: Copyright message printing never reached
- **Fix**: Implement basic channel system to allow boot sequence progression

### 2. **No Screen Output**
- **Cause**: PRINT routine executes but output goes nowhere
- **Impact**: No text appears on screen even if CPU reaches print routines
- **Fix**: Connect 'S' channel to actual screen display

### 3. **Missing Channel Tables**
- **Cause**: No CHANS/CURCHL system variables initialized
- **Impact**: RST 0x10 has nowhere to find channel information
- **Fix**: Initialize channel system during ROM load/reset

## Implementation Recommendations

### Priority 1: Basic Channel System
1. Implement CHANS and CURCHL system variables
2. Create basic 'S' (screen) channel implementation
3. Connect PRINT routine to screen output

### Priority 2: Display Integration  
1. Add display file change detection
2. Implement cursor positioning
3. Handle text formatting and attributes

### Priority 3: Complete I/O System
1. Add 'K' (keyboard) channel for input
2. Add 'P' (printer) channel (optional)
3. Implement channel opening/closing routines

## Expected Outcome

Once implemented, the emulator should:

1. **Complete ROM boot sequence** → Progress past 0x38 to copyright message
2. **Display text on screen** → Copyright message and other ROM output
3. **Support BASIC input/output** → Full Spectrum compatibility
4. **Handle all I/O operations** → Keyboard, screen, printer channels

## Testing Strategy

1. **ROM Boot Test**: Verify CPU reaches copyright message printing
2. **Screen Output Test**: Confirm text appears on screen
3. **Channel System Test**: Verify CHANS/CURCHL pointers are correct
4. **Print Routine Test**: Test RST 0x10 with various characters
5. **Integration Test**: Full boot sequence with visible output

## Files Requiring Modification

1. **src/memory.mjs**: Add system variables and channel table support
2. **src/z80.mjs**: Enhance RST 0x10 handling with channel routing
3. **src/ula.mjs**: Add display file change detection
4. **src/main.mjs**: Initialize channel system during emulator setup
5. **src/ioChannels.mjs** (new): Implement channel classes and I/O routing

This implementation will transform the emulator from a CPU-only system to a fully functional ZX Spectrum with proper I/O capabilities.