const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\.projects\\FiniteHSR';
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const icons = manifest.eidolons.icons;

// Remove duplicates with version suffixes (e.g., "Da Capo 0.70" is duplicate of "Da Capo")
const seen = new Set();
const deduped = manifest.eidolons.icons.filter(icon => {
  // Normalize name by removing version suffixes
  const normalized = icon.name.replace(/\s+\d+\.\d+$/, '').replace(/\s+\d+$/, '').trim();
  const key = icon.character + '|' + normalized;
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