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
  
  const stat = fs.statSync(charDir);
  if (!stat.isDirectory()) continue;

  let files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
  
  // Filter out non-eidolon files
  files = files.filter(file => {
    // Skip ability icons and other non-eidolon files
    if (file.includes('Ability')) return false;
    if (file.includes('File_Trace')) return false;
    if (file.includes('Trace Optimus')) return false;
    return true;
  });
  
  // Remove duplicates: keep only one version of each eidolon
  // Normalize by removing version suffixes like " 0.70" or " 1"
  const seen = new Map();
  for (const file of files) {
    const name = file.replace('.png', '');
    // Remove "Eidolon " prefix if present
    const displayName = name.startsWith('Eidolon ') ? name.substring(8) : name;
    // Remove version suffixes like " 0.70" or " 1"
    const normalized = displayName.replace(/\s+\d+\.\d+$/, '').replace(/\s+\d+$/, '').trim();
    
    if (!seen.has(normalized)) {
      seen.set(normalized, { file, displayName });
    } else {
      console.log(`Duplicate removed for ${charName}: ${displayName} (kept: ${seen.get(normalized).displayName})`);
    }
  }
  
  for (const [normalized, { file, displayName }] of seen) {
    const relativePath = `eidolons/${charName}/${file}`;
    manifest.eidolons.icons.push({
      file: relativePath,
      name: displayName,
      character: charName
    });
  }
}

manifest.eidolons.count = manifest.eidolons.icons.length;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');
console.log('Unique characters:', new Set(manifest.eidolons.icons.map(i => i.character)).size);