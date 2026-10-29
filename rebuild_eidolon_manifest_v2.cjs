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
  
  // Filter: only keep files that are actual eidolon icons
  // Eidolon files typically start with "Eidolon " or are the actual eidolon names from game data
  files = files.filter(file => {
    // Skip ability icons and other non-eidolon files
    if (file.includes('Ability')) return false;
    if (file.includes('File_Trace')) return false;
    if (file.includes('Trace Optimus')) return false;
    // Skip obvious non-eidolon names (like Silver Wolf's "Bounce Attack" etc)
    if (file === 'Bounce Attack.png') return false;
    if (file === 'Brute Force Attack.png') return false;
    if (file === 'Overlay Network.png') return false;
    if (file === 'Payload.png') return false;
    if (file === 'Social Engineering.png') return false;
    if (file === 'Zombie Network.png') return false;
    // Skip "Just Like This, Always..." for March 7th (not an eidolon)
    if (file === 'Just Like This, Always....png') return false;
    return true;
  });
  
  // For characters without "Eidolon " prefix, the eidolon names are the actual names
  // For Aventurine, the first 6 are non-eidolon (Ambiguity Aversion, etc), last 6 are eidolons (Chatoyant Éclat, etc)
  // We need to identify the real 6 eidolons
  
  // Remove duplicates: keep only one version of each eidolon
  // Normalize by removing version suffixes like " 0.70" or " 1"
  const seen = new Map();
  for (const file of files) {
    const name = file.replace('.png', '');
    // Remove "Eidolon " prefix if present
    let displayName = name.startsWith('Eidolon ') ? name.substring(8) : name;
    // Remove version suffixes like " 0.70" or " 1"
    const normalized = displayName.replace(/\s+\d+\.\d+$/, '').replace(/\s+\d+$/, '').trim();
    
    if (!seen.has(normalized)) {
      seen.set(normalized, { file, displayName });
    } else {
      console.log(`Duplicate removed for ${charName}: ${displayName} (kept: ${seen.get(normalized).displayName})`);
    }
  }
  
  const uniqueEntries = Array.from(seen.values());
  console.log(`${charName}: ${uniqueEntries.length} unique eidolons after dedup`);
  
  // If more than 6, we may have non-eidolon files mixed in
  // For now, keep all unique entries - gen-icon-manifest.ts will match to game data ranks
  for (const { file, displayName } of uniqueEntries) {
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
console.log('\nManifest updated with ' + manifest.eidolons.count + ' eidolon icons');
console.log('Unique characters:', new Set(manifest.eidolons.icons.map(i => i.character)).size);