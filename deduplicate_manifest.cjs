const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\.projects\\FiniteHSR';
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));

// Deduplicate by file path
const seen = new Set();
const deduped = manifest.eidolons.icons.filter(icon => {
  if (seen.has(icon.file)) {
    console.log('Duplicate removed:', icon.file);
    return false;
  }
  seen.add(icon.file);
  return true;
});

console.log('Removed', manifest.eidolons.icons.length - deduped.length, 'duplicates');

manifest.eidolons.icons = deduped;
manifest.eidolons.count = deduped.length;

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.count, 'eidolon icons');