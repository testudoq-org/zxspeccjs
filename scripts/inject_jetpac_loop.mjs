import fs from 'fs';
import path from 'path';

// Inject the synthetic Jetpac loop into traces/parsed_jetpac_snapshot.json
// at the PC location used by the jsspeccy reference trace (frame-0).

const REF_TRACE = path.resolve(process.cwd(), 'traces', 'jsspeccy_reference_jetpac_trace.json');
const PARSED = path.resolve(process.cwd(), 'traces', 'parsed_jetpac_snapshot.json');

if (!fs.existsSync(REF_TRACE)) {
  console.error('Reference trace not found:', REF_TRACE);
  process.exit(1);
}
if (!fs.existsSync(PARSED)) {
  console.error('Parsed snapshot not found:', PARSED);
  process.exit(1);
}

const ref = JSON.parse(fs.readFileSync(REF_TRACE, 'utf8'));
const parsed = JSON.parse(fs.readFileSync(PARSED, 'utf8'));

const pc = ref && Array.isArray(ref.frames) && ref.frames[0] && ref.frames[0].regs && ref.frames[0].regs.PC;
if (typeof pc !== 'number') throw new Error('Could not determine reference PC from ref trace');
const ramBase = 0x4000;
const offset = pc - ramBase;
if (offset < 0 || offset > 0xC000) throw new Error('Ref PC (0x' + pc.toString(16) + ') not in writable RAM area for injection');

const loopCode = [0x21,0x00,0x40, 0x3E,0xAA, 0x06,0x10, 0x77,0x23,0xD3,0xFE, 0x10,0xFA, 0xC3,0x03,0x80];

console.log('Injecting synthetic Jetpac loop at PC=0x' + pc.toString(16) + ' -> ram offset ' + offset + ', bytes=' + loopCode.map(b=>b.toString(16).padStart(2,'0')).join(' '));

for (let i = 0; i < loopCode.length; i++) {
  const idx = offset + i;
  parsed.ram = parsed.ram || {};
  parsed.ram[String(idx)] = loopCode[i] & 0xff;
}

fs.writeFileSync(PARSED, JSON.stringify(parsed, null, 2));
console.log('Injection complete — updated', PARSED);
