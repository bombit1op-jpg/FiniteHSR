const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
manifest.eidolons.icons = [];

const chars = fs.readdirSync(EIDOLON_DIR);
chars.forEach(charName => {
  const safeName = charName.replace(/[\\/:*?"<>|]/g, '_');
  const charDir = path.join(EIDOLON_DIR, safeName);
  if (!fs.existsSync(charDir)) return;

  const files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
  files.forEach(file => {
    // Skip ability icons and other non-eidolon files
    if (file.includes('Ability') || file.includes('File_Trace') || file.includes('Trace Optimus')) return;
    
    const eidolonName = file.replace('.png', '');
    const displayName = eidolonName.startsWith('Eidolon ') ? eidolonName.substring(8) : eidolonName;
    const relativePath = 'eidolons/' + charName + '/' + file;
    
    manifest.eidolons.icons.push({
      file: 'eidolons/' + charName + '/' + file,
      name: displayName,
      character: charName
    });
  });
});

manifest.eidolons.count = manifest.eidolons.icons.length;
fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');