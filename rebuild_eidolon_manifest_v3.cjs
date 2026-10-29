const fs = require('fs');
const path = require('path');

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
manifest.eidolons.icons = [];

const chars = fs.readdirSync(EIDOLON_DIR);

// Folders to skip (duplicates of other folders)
const skipFolders = new Set([
  'Himeko • Nova',      // duplicate of Himeko Nova (has 6 vs 5)
  'Mortenax Blade',     // duplicate of Mortenax (has 5 vs 6)
  'Dan Heng • Imbibitor Lunae', // empty folder
  'Silver Wolf',        // contains ability icons, not eidolons
]);

for (const charName of chars) {
  if (skipFolders.has(charName)) {
    console.log(`Skipping ${charName} (duplicate/empty/wrong)`);
    continue;
  }
  
  const charDir = path.join(EIDOLON_DIR, charName);
  if (!fs.existsSync(charDir)) continue;
  
  const stat = fs.statSync(charDir);
  if (!stat.isDirectory()) continue;

  let files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
  
  // Filter out non-eidolon files
  files = files.filter(file => {
    if (file.includes('Ability')) return false;
    if (file.includes('File_Trace')) return false;
    if (file.includes('Trace Optimus')) return false;
    // Skip obvious ability icons for Silver Wolf
    if (['Bounce Attack.png', 'Brute Force Attack.png', 'Overlay Network.png', 
         'Payload.png', 'Social Engineering.png', 'Zombie Network.png'].includes(file)) return false;
    // "Just Like This, Always..." IS March 7th's E6 - keep it!
    return true;
  });
  
  // Strategy: If there are files with "Eidolon " prefix, prefer those
  const prefixed = files.filter(f => f.startsWith('Eidolon '));
  const nonPrefixed = files.filter(f => !f.startsWith('Eidolon '));
  
  let candidates = prefixed.length >= 6 ? prefixed : files;
  
  // Remove duplicates by normalizing names
  const seen = new Map();
  for (const file of candidates) {
    const name = file.replace('.png', '');
    // Remove "Eidolon " prefix if present
    let displayName = name.startsWith('Eidolon ') ? name.substring(8) : name;
    // Remove leading underscore after "Eidolon " (e.g., "Eidolon _Your_ Resplendence" -> "Your Resplendence")
    displayName = displayName.replace(/^_/, '');
    // Remove version suffixes like " 0.70" or " 1"
    const normalized = displayName.replace(/\s+\d+\.\d+$/, '').replace(/\s+\d+$/, '').trim();
    // Also normalize # prefixes for Sparxie
    const normalizedNoHash = normalized.replace(/^#/, '');
    
    if (!seen.has(normalizedNoHash)) {
      seen.set(normalizedNoHash, { file, displayName });
    } else {
      console.log(`Duplicate removed for ${charName}: ${displayName} (kept: ${seen.get(normalizedNoHash).displayName})`);
    }
  }
  
  const uniqueEntries = Array.from(seen.values());
  console.log(`${charName}: ${uniqueEntries.length} unique eidolons`);
  
  for (const { file, displayName } of uniqueEntries) {
    const relativePath = `eidolons/${charName}/${file}`;
    manifest.eidolons.icons.push({
      file: relativePath,
      name: displayName,
      character: charName
    });
  }
}

// Special handling for Silver Wolf LV.999 - remove duplicate "Aether Editing"
const silverWolfLV999 = manifest.eidolons.icons.filter(i => i.character === 'Silver Wolf LV.999');
if (silverWolfLV999.length > 6) {
  // Remove the non-prefixed duplicate
  const toRemove = silverWolfLV999.find(i => i.name === 'Aether Editing Eidolon +1' && !i.file.includes('Eidolon Aether Editing'));
  if (toRemove) {
    const idx = manifest.eidolons.icons.indexOf(toRemove);
    if (idx >= 0) {
      manifest.eidolons.icons.splice(idx, 1);
      console.log('Removed duplicate for Silver Wolf LV.999: Aether Editing Eidolon +1');
    }
  }
}

manifest.eidolons.count = manifest.eidolons.icons.length;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
console.log('\nManifest updated with ' + manifest.eidolons.count + ' eidolon icons');
console.log('Unique characters:', new Set(manifest.eidolons.icons.map(i => i.character)).size);

// Verify each character has 6
const charCounts = {};
for (const icon of manifest.eidolons.icons) {
  charCounts[icon.character] = (charCounts[icon.character] || 0) + 1;
}
console.log('\nCharacters with != 6 eidolons:');
for (const [char, count] of Object.entries(charCounts).sort()) {
  if (count !== 6) {
    console.log(`  ${char}: ${count}`);
  }
}