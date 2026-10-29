const fs = require('fs');
const path = require('path');

const EIDOLON_DIR = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons';

if (fs.existsSync(EIDOLON_DIR)) {
  const dirs = fs.readdirSync(EIDOLON_DIR);
  dirs.forEach(charName => {
    const safeName = charName.replace(/[\\/:*?"<>|]/g, '_');
    const charDir = path.join(EIDOLON_DIR, safeName);
    if (!fs.existsSync(charDir)) return;
    
    const files = fs.readdirSync(charDir).filter(f => f.endsWith('.png') && f.startsWith('Eidolon '));
    const filtered = files.filter(f => !/\s+\d+(\.\d+)?\.png$/.test(f));
    if (files.length !== filtered.length) {
      console.log(charName + ': ' + files.length + ' -> ' + filtered.length);
      files.filter(f => !filtered.includes(f)).forEach(f => console.log('  REMOVED:', f));
    }
  });
}