# I/O Channels Implementation Plan

## Implementation Strategy

Based on the analysis, we need to implement a complete I/O channel system to enable proper ZX Spectrum emulation. The current emulator has a working CPU and display system, but lacks the channel infrastructure that connects them.

## Phase 1: Core Channel System (Priority 1)

### 1.1 System Variables Implementation

**File: `src/memory.mjs` - Add to Memory class**

```javascript
// System variable addresses
static SYSTEM_VARS = {
  CHANS: 0x5C4F,    // Channel table pointer
  CURCHL: 0x5C51,   // Current channel pointer
  PROG: 0x5C53,     // Current line address
  NXTLIN: 0x5C55,   // Next line address
  CHADD: 0x5C57,    // Character address
  PR_CC: 0x5C5A,    // Printer cursor column
  SRC: 0x5C6B       // Stream routing
};

// Initialize channel system during reset
initializeChannelSystem() {
  // Set up CHANS table in RAM
  const chansAddr = this.allocateChannelTable();
  this.writeWord(Memory.SYSTEM_VARS.CHANS, chansAddr);
  
  // Set up default channels (K, S, P)
  this.setupDefaultChannels(chansAddr);
  
  // Initialize CURCHL to point to screen channel
  this.initializeCurrentChannel();
}
```

### 1.2 Channel Table Structure

**Create: `src/channels.mjs`**

```javascript
// Channel types and structures
export class ChannelManager {
  constructor(memory) {
    this.memory = memory;
    this.channels = new Map();
  }
  
  // Channel information structure (5 bytes per channel)
  // [0]: Flag byte (bit 7: output, bit 6: input)
  // [1]: Stream ID (0=K, 1=S, 2=P) 
  // [2-3]: Output routine address (low, high)
  // [4]: Additional data (window line for S channel)
  
  createChannelTable() {
    const tableAddr = this.memory.allocate(1024); // 1KB for channel table
    
    // 'K' Channel - Keyboard input
    this.createKeyboardChannel(tableAddr);
    
    // 'S' Channel - Screen output  
    this.createScreenChannel(tableAddr + 5);
    
    // 'P' Channel - Printer output
    this.createPrinterChannel(tableAddr + 10);
    
    return tableAddr;
  }
  
  createScreenChannel(addr) {
    // Flag: output only (0x80)
    this.memory.write(addr, 0x80);
    // Stream ID: S = 1
    this.memory.write(addr + 1, 0x01);
    // Output routine: address of screen print routine
    this.memory.writeWord(addr + 2, 0x2AB6); // ROM address for screen print
    // Window line: current line (0)
    this.memory.write(addr + 4, 0x00);
  }
  
  createKeyboardChannel(addr) {
    // Flag: input only (0x40)
    this.memory.write(addr, 0x40);
    // Stream ID: K = 0
    this.memory.write(addr + 1, 0x00);
    // Input routine: address of keyboard read routine
    this.memory.writeWord(addr + 2, 0x2DAF); // ROM address for keyboard read
    // Additional data
    this.memory.write(addr + 4, 0x00);
  }
}
```

### 1.3 PRINT Routine Integration

**File: `src/z80.mjs` - Enhance RST 0x10 handling**

```javascript
case 0xD7: // RST 0x10 - PRINT
  if (this.channelSystem) {
    this.handlePrintRoutine();
  } else {
    // Fallback: simple character output
    this.simplePrintOutput();
  }
  this.tstates += 11;
  return 11;

// Add to Z80 class:
handlePrintRoutine() {
  // Get character from A register
  const char = this.A;
  
  // Get current channel from CURCHL
  const curchAddr = this.readWord(Memory.SYSTEM_VARS.CURCHL);
  
  // Read channel information
  const channelInfo = this.readChannelInfo(curchAddr);
  
  // Route to appropriate output routine
  if (channelInfo.isOutput()) {
    this.routeToOutput(char, channelInfo);
  }
}

routeToOutput(char, channelInfo) {
  const streamId = channelInfo.getStreamId();
  
  switch (streamId) {
    case 0x01: // 'S' channel - Screen
      this.outputToScreen(char, channelInfo);
      break;
    case 0x02: // 'P' channel - Printer
      this.outputToPrinter(char, channelInfo);
      break;
    default:
      // Unknown channel, ignore
      break;
  }
}

outputToScreen(char, channelInfo) {
  // Write character to display file at current cursor position
  const cursorAddr = this.getCursorAddress();
  this.writeByte(cursorAddr, char);
  
  // Update cursor position
  this.advanceCursor();
  
  // Trigger screen update
  if (this.ula) {
    this.ula.render();
  }
}
```

## Phase 2: Display Integration (Priority 2)

### 2.1 Cursor and Position Management

**File: `src/ula.mjs` - Add to ULA class**

```javascript
// Add cursor management
class SpectrumCursor {
  constructor() {
    this.x = 0;        // Column (0-31)
    this.y = 0;        // Line (0-23)
    this.pixelX = 0;   // Pixel column (0-255)
    this.pixelY = 0;   // Pixel row (0-191)
  }
  
  nextCharacter() {
    this.x++;
    this.pixelX += 8;
    
    if (this.x >= 32) { // End of line
      this.newLine();
    }
  }
  
  newLine() {
    this.x = 0;
    this.y++;
    this.pixelX = 0;
    this.pixelY += 8;
    
    if (this.y >= 24) { // End of screen
      this.scrollUp();
    }
  }
  
  scrollUp() {
    // Scroll display file up by one line
    this.memory.scrollDisplayUp();
    this.y = 23;
    this.pixelY = 23 * 8;
  }
}
```

### 2.2 Display File Change Detection

**File: `src/ula.mjs` - Enhance render method**

```javascript
// Add display file monitoring
class DisplayFileMonitor {
  constructor(ula) {
    this.ula =ula;
    this.lastBitmap = new Uint8Array(0x1800);
    this.displayDirty = false;
  }
  
  checkDisplayChanges() {
    const currentBitmap = this.ula.memory.getBitmapView();
    
    for (let i = 0; i < currentBitmap.length; i++) {
      if (currentBitmap[i] !== this.lastBitmap[i]) {
        this.displayDirty = true;
        break;
      }
    }
    
    if (this.displayDirty) {
      this.ula.render();
      this.lastBitmap.set(currentBitmap);
      this.displayDirty = false;
    }
  }
}
```

## Phase 3: Enhanced Features (Priority 3)

### 3.1 Character Attributes and Formatting

**File: `src/channels.mjs` - Add to ScreenChannel class**

```javascript
class ScreenChannel {
  output(char) {
    if (char >= 32 && char <= 126) {
      // Printable ASCII character
      this.writeCharacter(char);
    } else if (char === 13) {
      // Carriage return
      this.cursor.newLine();
    } else if (char === 10) {
      // Line feed
      this.cursor.newLine();
    } else if (char < 32) {
      // Control character - handle formatting
      this.handleControlCharacter(char);
    }
  }
  
  writeCharacter(char) {
    // Write character to display file
    const displayAddr = this.getDisplayAddress();
    this.memory.write(displayAddr, char);
    
    // Write attribute to attribute file
    const attrAddr = this.getAttributeAddress();
    const attr = this.getCurrentAttributes();
    this.memory.write(attrAddr, attr);
    
    // Advance cursor
    this.cursor.nextCharacter();
  }
  
  getDisplayAddress() {
    // Convert cursor position to display file address
    const base = 0x4000;
    const lineOffset.cursor.y * 32;
    return base + lineOffset + this.cursor.x;
  }
  
  getAttributeAddress() = this {
    // Convert cursor position to attribute file address
    const base = 0x5800;
    const lineOffset = this.cursor.y * 32;
    return base + lineOffset + this.cursor.x;
  }
}
```

### 3.2 Keyboard Input Channel

**File: `src/channels.mjs` - Add KeyboardChannel class**

```javascript
class KeyboardChannel {
  constructor(ula) {
    this.ula = ula;
    this.inputBuffer = [];
  }
  
  input() {
    // Wait for key press
    while (this.inputBuffer.length === 0) {
      this.checkForKeyPresses();
    }
    
    // Return next character from buffer
    return this.inputBuffer.shift();
  }
  
  checkForKeyPresses() {
    // Check ULA keyboard matrix for pressed keys
    for (let row = 0; row < 8; row++) {
      const rowData = this.ula.keyMatrix[row];
      for (let col = 0; col < 5; col++) {
        if ((rowData & (1 << col)) === 0) {
          const keyCode = this.getKeyCode(row, col);
          this.inputBuffer.push(keyCode);
        }
      }
    }
  }
  
  getKeyCode(row, col) {
    // Convert matrix position to character code
    // This would need a proper key mapping table
    return 0; // Placeholder
  }
}
```

## Phase 4: Integration and Testing

### 4.1 Main System Integration

**File: `src/main.mjs` - Update _createCore method**

```javascript
async _createCore(romBuffer = null) {
  // ... existing code ...
  
  // Create channel system
  this.channelSystem = new ChannelManager(this.memory);
  this.channelSystem.initializeChannelSystem();
  
  // Connect to CPU
  this.cpu.channelSystem = this.channelSystem;
  
  // Connect to ULA
  this.ula.cursor = new SpectrumCursor();
  this.ula.displayMonitor = new DisplayFileMonitor(this.ula);
  
  // ... rest of existing code ...
}
```

### 4.2 Boot Sequence Testing

**Create: `test/channel_system_test.mjs`**

```javascript
describe('I/O Channel System', () => {
  test('should initialize CHANS and CURCHL system variables', () => {
    // Test that channel system variables are set correctly
  });
  
  test('should route PRINT output to screen channel', () => {
    // Test RST 0x10 with character output
  });
  
  test('should update display file when printing', () => {
    // Test that display file is modified correctly
  });
  
  test('should handle cursor positioning', () => {
    // Test cursor movement and line wrapping
  });
});
```

## Implementation Timeline

### Week 1: Core Infrastructure
- [ ] System variables implementation
- [ ] Basic channel table creation
- [ ] Simple PRINT routine integration

### Week 2: Display Integration  
- [ ] Cursor management
- [ ] Display file change detection
- [ ] Character output to screen

### Week 3: Input and Polish
- [ ] Keyboard input channel
- [ ] Attribute handling
- [ ] Testing and debugging

## Success Criteria

1. **ROM Boot Completes**: CPU progresses past 0x38 to copyright message
2. **Text Appears on Screen**: Copyright message and other ROM output visible
3. **Channel System Active**: CHANS and CURCHL properly initialized
4. **Full I/O Support**: Keyboard input and screen output working
5. **Spectrum Compatibility**: Passes ZX Spectrum compatibility tests

This implementation will transform the emulator from a CPU-only system to a fully functional ZX Spectrum with proper I/O capabilities.