import fs from 'fs';
const parsed = JSON.parse(fs.readFileSync('traces/parsed_jetpac_snapshot.json','utf8'));
const ram = parsed.ram || {};
const get = (addr) => (ram[addr] || 0) & 0xff;
const dump = (start, len) => {
  let out = '';
  for (let i = 0; i < len; i++) {
    const a = start + i;
    out += a.toString(16).padStart(4,'0') + ': ' + get(a).toString(16).padStart(2,'0') + '\n';
  }
  return out;
};

console.log('\n--- Bytes around 0x71A0 ---\n');
console.log(dump(0x71a0 - 32, 96));

const scanPattern = (patBytes) => {
  const hits = [];
  const max = 49152; // 48K ROM
  for (let i = 0; i < max - patBytes.length; i++) {
    let ok = true;
    for (let j = 0; j < patBytes.length; j++) {
      if (get(i + j) !== (patBytes[j] & 0xff)) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
};

const ed78 = scanPattern([0xed, 0x78]);
const ldCfe = scanPattern([0x0e, 0xfe]);
const dbfe = scanPattern([0xdb, 0xfe]);

console.log('Found ED 78 (IN A,(C)) at:', ed78.slice(0,50));
console.log('Found LD C,0xFE at:', ldCfe.slice(0,50));
console.log('Found DB FE (IN 0xFE) at:', dbfe.slice(0,50));

const exec = JSON.parse(fs.readFileSync('traces/pc_exec_stream.json','utf8'));
const topPCs = new Set((exec.topPCs || []).map(x => Number(x[0])));

const intersect = (arr) => arr.filter(a => topPCs.has(a));
console.log('\nIntersect with executed topPCs:');
console.log('ED78 executed?', intersect(ed78));
console.log('LD C,0xFE executed?', intersect(ldCfe));
console.log('DB FE executed?', intersect(dbfe));

console.log('\n--- Done ---');
