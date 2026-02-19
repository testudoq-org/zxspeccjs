import fs from 'fs';
const file = 'traces/jetpac_trace_partial_frame_99.json';
const needle = '205,76,113';
const rl = (await import('readline')).createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
let found=0;
for await (const line of rl){ if(line.includes(needle)){ console.log('Found line:', line.trim()); found++; if(found>=5) break; } }
console.log('done, found', found);