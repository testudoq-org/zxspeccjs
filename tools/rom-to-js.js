// Node.js script to convert a ROM binary to an ESM JS module
// Usage: node tools/rom-to-js.js roms/spec48.rom src/roms/spec48.js
import fs from 'fs';
import path from 'path';
const [,, inPath, outPath] = process.argv;
if (!inPath || !outPath) throw new Error('Usage: node rom-to-js.js <in.rom> <out.js>');
const bytes = fs.readFileSync(inPath);
const arr = Array.from(bytes);
const id = path.basename(outPath, '.js');
const content = `export default {
  id: '${id}',
  name: '${id}',
  category: 'spectrum16-48',
  size: ${arr.length},
  bytes: new Uint8Array([${arr.join(',')}])
};
`;
fs.writeFileSync(outPath, content);
