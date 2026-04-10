import fs from 'fs';
const lines = fs.readFileSync('traces/run_jetpac_press5_node.output.txt','utf8').split(/\r?\n/);
for (const l of lines){ if (l.startsWith('Frame ')) console.log(l); }
console.log('done');