const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = 'C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json';

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));

// Remove duplicates - keep only entries where name starts with "Eidolon "
// and deduplicate by character + name
const seen = new Set();
const filtered = manifest.eidolons.icons.filter(icon => {
  if (!icon.name.startsWith('Eidolon ')) return false;
  const key = icon.character + '|' + icon.name;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log('Removed', manifest.eidolons.icons.length - filtered.length, 'entries');
manifest.eidolons.icons = filtered;
manifest.eidolons.count = filtered.length;

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.count, 'eidolon icons');