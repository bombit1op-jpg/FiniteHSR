const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
manifest.eidolons.icons = [];

const chars = fs.readdirSync(EIDOLON_DIR);

for (const charName of chars) {
  const charDir = path.join(EIDOLON_DIR, charName);
  if (!fs.existsSync(charDir)) continue;

  const files = fs.readdirSync(charDir);
  for (const file of files) {
    if (!file.endsWith('.png')) continue;

    const eidolonName = file.replace('.png', '');
    const relativePath = `eidolons/${charName}/${file}`;

    manifest.eidolons.icons.push({
      file: relativePath,
      name: eidolonName,
      character: charName
    });
  }
}

manifest.eidolons.count = manifest.eidolons.icons.length;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');