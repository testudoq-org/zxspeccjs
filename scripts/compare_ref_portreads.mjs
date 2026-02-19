import fs from 'fs';
const ref = JSON.parse(fs.readFileSync('traces/jsspeccy_reference_jetpac_trace.frames.json','utf8'));
const frames = ref.frames || [];
for (let i=0;i<frames.length;i++){
  const fr = frames[i];
  const reads = fr.portReads || [];
  const fe = reads.filter(r => (r.port & 0xff) === 0xfe);
  if (fe.length) { console.log('Frame', fr.frame, 'has portReads to 0xFE:', fe); break; }
}
