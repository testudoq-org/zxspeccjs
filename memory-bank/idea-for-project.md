### Architectural Approach for ZX Spectrum Emulator in a Webpage

Building a ZX Spectrum emulator in a webpage is indeed simpler than emulating Windows 95, as the ZX Spectrum is an 8-bit system with a Z80 CPU, 48KB RAM (typically), basic graphics (256x192 pixels with attributes), keyboard input, and beeper sound. The Windows 95 project uses Electron to wrap a full x86 emulator (like v86), but for ZX Spectrum, we can run everything client-side in the browser using JavaScript (ES6 modules via .mjs files). Node.js can be used for development (e.g., bundling with tools like Rollup or serving a local dev server), but the emulator itself will be browser-based.

#### High-Level Architecture

1. **Core Components**:

   - **CPU Emulation**: Implement a Z80 CPU emulator in JS. This handles opcode execution, registers, interrupts, and timing (e.g., 3.5 MHz clock).
   - **Memory Management**: Model 16KB ROM (loaded from the provided BIOS repo) + 48KB RAM. Handle contention for accurate timing.
   - **Graphics (ULA Emulation)**: Use HTML5 Canvas to render the 256x192 bitmap screen + 32x24 attribute grid for colors. Update on a frame basis (50Hz).
   - **Input**: Map browser keyboard events to ZX Spectrum's matrix-based keyboard.
   - **Sound**: Emulate the beeper using Web Audio API for simple square waves.
   - **File Loading**: Support loading .ROM, .Z80 snapshots, or .TAP tapes via File API or drag-and-drop.
   - **UI/Controls**: A simple HTML page with Canvas for display, buttons for load/reset, and virtual keyboard overlay.
2. **Tech Stack**:

   - **Frontend**: ES6 JavaScript in .mjs modules (for modularity: e.g., z80.mjs, ula.mjs). No frameworks needed initially; pure JS for performance.
   - **Build/Dev**: Node.js for a local server (e.g., via http-server or custom Express app) and bundling if modules grow complex.
   - **Deployment**: Host as a static webpage (e.g., on GitHub Pages). The emulator runs entirely in the browser—no server-side computation required.
   - **Performance**: Use requestAnimationFrame for rendering loop. Aim for cycle-accurate emulation but start with basic for simplicity.
3. **Modular Structure**:

   - `index.html`: Entry point with Canvas, script tags loading .mjs modules.
   - `main.mjs`: Orchestrates the emulator loop (fetch, decode, execute, render).
   - `z80.mjs`: CPU logic.
   - `memory.mjs`: ROM/RAM handling.
   - `ula.mjs`: Graphics and I/O ports.
   - `input.mjs`: Keyboard mapping.
   - `sound.mjs`: Beeper emulation.
   - `loader.mjs`: Handle BIOS and program loading.
4. **Challenges and Simplifications**:

   - Start with 48K mode (no 128K extras).
   - Use the BIOS ROM from https://github.com/spectrumforeveryone/zx-roms (e.g., 48.rom) – download it manually and bundle as a Uint8Array.
   - Emulation is easier than Win95 due to lower complexity, but timing accuracy (contention) is key for games.
   - Legal Note: Ensure ROM usage complies with copyrights; the repo you linked seems to provide open alternatives or dumps.
5. **Comparison to Windows95 Project**:

   - Windows95 uses Electron for a desktop app feel, with a full OS VM. Yours can be lighter: no Electron needed, just browser. If you want a desktop version later, wrap it in Electron.

### Guide for Building in Visual Studio Code Using an AI Coding Assistant (e.g., GitHub Copilot or Similar)

Assuming "Roocode AI" refers to an AI coding assistant like GitHub Copilot, Cursor, or a similar tool integrated into VS Code (e.g., via extensions), we'll use it to generate code snippets via prompts. Install the Copilot extension if not already (requires GitHub account). Set up VS Code for web dev:

1. **Project Setup**:

   - Create a new folder: `zx-spectrum-emulator`.
   - Open in VS Code: `code zx-spectrum-emulator`.
   - Initialize Node.js: Run `npm init -y` in terminal.
   - Install dev tools: `npm install -D http-server rollup` (for local server and bundling).
   - Download ZX ROM: Clone https://github.com/spectrumforeveryone/zx-roms, copy `48.rom` to your project (e.g., `./roms/48.rom`).
   - Create `index.html`:
     ```html
     <!DOCTYPE html>
     <html lang="en">
     <head>
         <meta charset="UTF-8">
         <title>ZX Spectrum Emulator</title>
     </head>
     <body>
         <canvas id="screen" width="256" height="192"></canvas>
         <button id="load">Load ROM</button>
         <button id="reset">Reset</button>
         <script type="module" src="main.mjs"></script>
     </body>
     </html>
     ```
   - Run local server: `npx http-server` and open http://localhost:8080.
2. **Using AI Assistant in VS Code**:

   - Enable Copilot (or equivalent): In VS Code, go to Extensions > Search "GitHub Copilot" > Install and sign in.
   - For each task, create a .mjs file, write a comment with the prompt, and let AI auto-complete/generates code.
   - Tip: Use `// @prompt: [your prompt here]` or just descriptive comments. Review and debug generated code.
   - Test incrementally: Use browser dev tools (F12) for console logs. Use Node.js REPL for quick tests if needed.

### Task Breakdown with AI Prompts

Break the project into 8 tasks. For each, create the file, add the prompt as a comment, let AI generate, then refine. Aim for ES6 syntax, modular exports.

1. **Task: Set Up Memory Module**

   - File: `memory.mjs`
   - Prompt for AI: "Write an ES6 module for ZX Spectrum memory: 16KB ROM + 48KB RAM as Uint8Arrays. Function to load ROM from a binary file (assume fetched as ArrayBuffer). Export read/write methods with address wrapping."
   - Guide: After generation, load the ROM in `main.mjs` via fetch('./roms/48.rom'). Test: Console.log some ROM bytes.
2. **Task: Implement Z80 CPU Core**

   - File: `z80.mjs`
   - Prompt for AI: "Create an ES6 class for Z80 CPU emulation. Include registers (A, B, C, D, E, H, L, PC, SP, flags), opcode table for basic instructions (LD, ADD, JP, etc.). Methods: reset(), step() to execute one instruction. Integrate with memory module for reads/writes. Focus on non-contended timing first."
   - Guide: This is the heart—AI might generate a partial opcode table; expand as needed. Reference Z80 docs online if AI misses ops. Test: Run simple code like LD A, 42; console.log registers.
3. **Task: Emulate ULA (Graphics and Ports)**

   - File: `ula.mjs`
   - Prompt for AI: "ES6 module for ZX Spectrum ULA emulation. Handle port I/O (e.g., 0xFE for border/keyboard). Render screen: 6912 bytes bitmap + 768 attributes. Use CanvasRenderingContext2D to draw pixels and colors. Export updateScreen(canvas) function called per frame."
   - Guide: In `index.html`, get canvas context and pass to ULA. Colors: 15-color palette (bright/normal). Test: Fill attributes with random colors and render.
4. **Task: Handle Input (Keyboard)**

   - File: `input.mjs`
   - Prompt for AI: "ES6 module for ZX Spectrum keyboard emulation. Map browser keydown/keyup to 5x8 matrix (ports 0xFE). Export getPortValue(port) to simulate half-rows."
   - Guide: Add event listeners in `main.mjs`. Common mappings: QWERTY to ZX keys (e.g., 'A' -> bit 1 on port 0xF7FE). Test: Log port reads on key press.
5. **Task: Emulate Sound (Beeper)**

   - File: `sound.mjs`
   - Prompt for AI: "ES6 module using Web Audio API for ZX Spectrum beeper. Create oscillator for square wave. Toggle on/off via port 0xFE bit 4. Handle frequency based on T-states."
   - Guide: Initialize AudioContext in `main.mjs`. Simple: Just toggle sound on EAR bit changes. Test: Play a tone on border change.
6. **Task: File Loader for Snapshots/Tapes**

   - File: `loader.mjs`
   - Prompt for AI: "ES6 module to load ZX Spectrum files. Support .Z80 snapshots: Parse header, load registers and memory. Use FileReader for browser upload. Export loadSnapshot(file) that updates CPU and memory."
   - Guide: Add drag-and-drop or input file in HTML. Start with basic ROM load; add .TAP later. Test: Upload a .Z80 file and verify memory.
7. **Task: Main Emulator Loop**

   - File: `main.mjs`
   - Prompt for AI: "ES6 module for ZX Spectrum emulator main loop. Import all modules. Initialize CPU, memory (load ROM), ULA, input, sound. Use requestAnimationFrame for 50Hz frames: Run ~70,000 T-states per frame, update screen/sound. Handle reset/load buttons."
   - Guide: Calculate T-states: 69888 per frame for accuracy. Add pause/resume. Test: Boot to BASIC prompt (should show copyright).
8. **Task: Bundling and Optimization**

   - File: `rollup.config.js` (for Node.js build)
   - Prompt for AI: "Write a Rollup config to bundle all .mjs into a single browser-compatible JS file. Include plugins for resolving modules and minification."
   - Guide: Run `npx rollup -c` to build. Update `index.html` to load the bundle. Use Node.js for dev server.

### Final Tips

- **Iterate**: Start with booting to BASIC (type commands via virtual keyboard). Add games later.
- **Debugging**: Use VS Code debugger for JS (attach to Chrome). Log T-states for performance.
- **Resources**: If AI struggles, manually reference Z80 user manual or existing open-source JS emulators (e.g., search "jszx" or "jsspeccy" for inspiration—but don't copy code).
- **Timeline**: With AI assistance, core emulation in 1-2 weeks part-time. Test on modern browsers; optimize for mobile if needed.
- **Extensions**: Add save states, turbo mode, or Electron wrapper for desktop.

This should get you a functional emulator. If you hit issues, provide specifics for more targeted prompts!
