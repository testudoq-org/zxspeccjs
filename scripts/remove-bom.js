const fs = require('fs');
const path = 'package.json';
let s = fs.readFileSync(path, 'utf8');
if (s.charCodeAt(0) === 0xFEFF) {
  s = s.slice(1);
  fs.writeFileSync(path, s, 'utf8');
  console.log('BOM removed');
} else {
  console.log('No BOM found');
}