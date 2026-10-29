const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = 'C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json';

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));

// Deduplicate by (character, name)
const seen = new Set();
const deduped = manifest.eidolons.icons.filter(icon => {
  const key = icon.character + '|' + icon.name;
  if (seen.has(key)) {
    console.log('Duplicate removed:', icon.character, '->', icon.name);
    return false;
  }
  seen.add(key);
  return true;
});

console.log('Removed', manifest.eidolons.icons.length - deduped.length, 'duplicates');

manifest.eidolons.icons = deduped;
manifest.eidolons.count = deduped.length;

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.count, 'eidolon icons');