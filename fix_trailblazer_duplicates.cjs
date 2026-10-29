const fs = require('fs');
const path = require('path');

// Remove duplicate Trailblazer directories - keep the canonical names
const dirsToRemove = [
  'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons\\Trailblazer (Physical)',
  'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons\\Trailblazer (Fire)',
];

// Keep canonical: Trailblazer (Destruction), Trailblazer (Preservation), Trailblazer (Harmony), Trailblazer (Remembrance), Trailblazer (Elation)
dirsToRemove.forEach(dir => {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log('Removed:', dir);
  } else {
    console.log('Not found:', dir);
  }
});

// Update manifest to use canonical names
const ROOT = 'C:\\.projects\\FiniteHSR';
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));

// Fix character names in manifest
manifest.eidolons.icons.forEach(icon => {
  if (icon.character === 'Trailblazer (Physical)') {
    icon.character = 'Trailblazer (Destruction)';
    icon.file = icon.file.replace('Trailblazer (Physical)', 'Trailblazer (Destruction)');
  }
  if (icon.character === 'Trailblazer (Fire)') {
    icon.character = 'Trailblazer (Preservation)';
    icon.file = icon.file.replace('Trailblazer (Fire)', 'Trailblazer (Preservation)');
  }
});

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated');

console.log('Done');