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
    // Only include files that look like eidolons (have "Eidolon " prefix or are known eidolon names)
    // Skip files that look like ability icons (contain "Ability" or "File_Trace")
    if (file.includes('Ability') || file.includes('File_Trace') || file.includes('Trace Optimus')) return;
    
    const eidolonName = file.replace('.png', '');
    // Normalize: if it has "Eidolon " prefix, use name after that; otherwise use as-is
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