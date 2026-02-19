import fs from 'fs';
import readline from 'readline';

const ADDR_DEC = 0x4001;
const IN_FILE = 'traces/jetpac_trace.json';

async function run(){
  const rl = readline.createInterface({ input: fs.createReadStream(IN_FILE), crlfDelay: Infinity });
  let currentFrame = -1;
  let results = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    // detect frame header lines like "frame": 0,
    const frameMatch = trimmed.match(/^"frame"\s*:\s*(\d+),?$/);
    if (frameMatch) {
      currentFrame = Number(frameMatch[1]);
      continue;
    }
    // detect memWrite addr lines
    if (trimmed === `"addr": ${ADDR_DEC},` || trimmed === `"addr": ${ADDR_DEC}`) {
      // next few lines likely contain value and t; capture a small window
      results.push({ frame: currentFrame, snippetLine: trimmed });
      if (results.length >= 20) break;
    }
  }
  console.log('Found occurrences (sample):', results.slice(0,40));
}

run().catch(e=>{ console.error(e); process.exit(1); });