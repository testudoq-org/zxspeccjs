import fs from 'fs';
import { PNG } from 'pngjs';

const file = process.argv[2] || 'test-results/jetpac-enemy-archive-org-J-89250-fter-pressing-5-regression--chromium/test-failed-1.png';
if (!fs.existsSync(file)) {
  console.error('Screenshot not found:', file);
  process.exit(2);
}

const png = PNG.sync.read(fs.readFileSync(file));
const { width, height, data } = png;
console.log('Image size:', width, 'x', height);

// Main screen crop (emulator uses 320x240 canvas with 16px left/right borders and 24px top/bottom border)
const mainX = 16, mainY = 24, mainW = 256, mainH = 192;
if (width < mainX + mainW || height < mainY + mainH) {
  console.log('Image smaller than expected main screen region; skipping crop analysis');
  process.exit(0);
}

function getPixel(x,y){
  const idx = (y*width + x) * 4;
  return { r: data[idx], g: data[idx+1], b: data[idx+2], a: data[idx+3] };
}

// Determine background color by sampling corner of main screen
const bg = getPixel(mainX + 4, mainY + 4);
console.log('Sampled background color (approx):', bg.r, bg.g, bg.b);

// Simple threshold: pixel is "non-bg" if any channel differs by > 24
const diffThresh = 24;
function isNonBg(px){
  return Math.abs(px.r - bg.r) > diffThresh || Math.abs(px.g - bg.g) > diffThresh || Math.abs(px.b - bg.b) > diffThresh;
}

let nonBgCount = 0;
const mask = new Uint8Array(mainW * mainH);
for (let y = 0; y < mainH; y++){
  for (let x = 0; x < mainW; x++){
    const px = getPixel(mainX + x, mainY + y);
    const non = isNonBg(px);
    mask[y*mainW + x] = non ? 1 : 0;
    if (non) nonBgCount++;
  }
}
console.log('Non-background pixels in main screen:', nonBgCount);

// Find connected components (4-neighbour) of non-bg pixels and report sizes
const visited = new Uint8Array(mainW * mainH);
const components = [];
for (let y = 0; y < mainH; y++){
  for (let x = 0; x < mainW; x++){
    const i = y*mainW + x;
    if (mask[i] && !visited[i]){
      // flood fill
      const stack = [i];
      visited[i] = 1;
      let cnt = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      while (stack.length){
        const idx = stack.pop();
        cnt++;
        const yy = Math.floor(idx / mainW);
        const xx = idx % mainW;
        if (xx < minX) minX = xx; if (xx > maxX) maxX = xx;
        if (yy < minY) minY = yy; if (yy > maxY) maxY = yy;
        const neighbours = [ [xx-1,yy],[xx+1,yy],[xx,yy-1],[xx,yy+1] ];
        for (const [nx,ny] of neighbours){
          if (nx >=0 && nx < mainW && ny >=0 && ny < mainH){
            const ni = ny*mainW + nx;
            if (mask[ni] && !visited[ni]){ visited[ni] = 1; stack.push(ni); }
          }
        }
      }
      components.push({ size: cnt, bbox: { minX, minY, maxX, maxY } });
    }
  }
}

components.sort((a,b)=>b.size-a.size);
console.log('Found components (top 10):', components.slice(0,10));

// Heuristic: look for small blobs (size 4..100) — possible bullets/enemies
const smallBlobs = components.filter(c => c.size >= 4 && c.size <= 200);
console.log('Small blobs count:', smallBlobs.length);
for (let i=0;i<Math.min(10, smallBlobs.length); i++){
  const c = smallBlobs[i];
  console.log(`  blob[${i}] size=${c.size} bbox=${JSON.stringify(c.bbox)}`);
}

process.exit(0);
