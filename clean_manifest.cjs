const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = 'C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json';

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));

// Keep only entries that start with "Eidolon " in the name
const filtered = manifest.eidolons.icons.filter(icon => {
  return icon.name.startsWith('Eidolon ');
});

console.log('Kept:', filtered.length, 'out of', manifest.eidolons.icons.length);

manifest.eidolons.icons = filtered;
manifest.eidolons.count = filtered.length;

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.count, 'eidolon icons');