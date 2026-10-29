const fs = require('fs');
const path = require('path');

const EIDOLON_DIR = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons';

if (fs.existsSync(EIDOLON_DIR)) {
  const dirs = fs.readdirSync(EIDOLON_DIR);
  let total = 0;
  dirs.forEach(c => {
    const charDir = path.join(EIDOLON_DIR, c);
    if (fs.existsSync(charDir)) {
      const files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
      if (files.length > 0) {
        console.log(c, ':', files.length, 'files');
        total += files.length;
      }
    }
  });
  console.log('Total files on disk:', total);