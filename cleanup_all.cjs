const fs = require('fs');
const path = require('path');

const EIDOLON_DIR = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons';
const MANIFEST_PATH = 'C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json';

const chars = [
  'Argenti', 'Aventurine', 'Cyrene', 'Evanescia', 'Feixiao', 'Fu Xuan', 'Gilgamesh',
  'Himeko Nova', 'Jade', 'Lingsha', 'Mortenax Blade', 'Moze', 'Pearl',
  'Rin Tohsaka', 'Silver Wolf LV.999', 'Sparxie', 'Yao Guang',
  'Cipher', 'Aventurine Waveflair', 'Himeko Nova', 'Mortenax Blade', 'Moze',
  'Sparxie', 'Yao Guang'
];

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function cleanCharacter(charName) {
  const safeName = charName.replace(/[\\/:*?"<>|]/g, '_');
  const dir = path.join(EIDOLON_DIR, charName.replace(/[\\/:*?"<>|]/g, '_'));
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
  
  // Group by base name (without Eidolon prefix and version suffixes)
  const groups = {};
  files.forEach(file => {
    let baseName = file.replace('.png', '');
    // Remove Eidolon prefix
    if (baseName.startsWith('Eidolon ')) {
      baseName = baseName.substring(8);
    }
    // Remove version suffixes like " 0.70", " 3.3", " 0.70"
    baseName = baseName.replace(/\s+\d+\.\d+$/, '').replace(/\s+\d+$/, '');
    
    if (!groups[baseName]) groups[baseName] = [];
    groups[baseName].push(file);
  });

  // For each group, keep the "Eidolon " prefixed version, or the one without version suffix
  let removed = 0;
  Object.entries(groups).forEach(([baseName, files]) => {
    if (files.length <= 1) return;
    
    // Prefer the one with "Eidolon " prefix and no version suffix
    const preferred = files.find(f => f.startsWith('Eidolon ') && !/\s+\d+(\.\d+)?$/.test(f.replace('.png', '')));
    const toKeep = preferred || files.find(f => f.startsWith('Eidolon ')) || files[0];
    
    files.forEach(file => {
      if (file !== toKeep) {
        fs.unlinkSync(path.join(EIDOLON_DIR, charName.replace(/[\\/:*?"<>|]/g, '_'), file));
        console.log(`  Removed duplicate: ${file}`);
      }
    });
  });
}

const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));
manifest.eidolons.icons = [];
manifest.eidolons.count = 0;

const chars = fs.readdirSync(EIDOLON_DIR);
chars.forEach(charName => {
  const safeName = charName.replace(/[\\/:*?"<>|]/g, '_');
  const charDir = path.join(EIDOLON_DIR, safeName);
  if (!fs.existsSync(charDir)) return;
  
  const files = fs.readdirSync(charDir).filter(f => f.endsWith('.png'));
  files.forEach(file => {
    const eidolonName = file.replace('.png', '');
    const relativePath = 'eidolons/' + charName + '/' + file;
    manifest.eidolons.icons.push({
      file: 'eidolons/' + charName + '/' + file,
      name: eidolonName,
      character: charName
    });
  });
});

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.icons.length, 'eidolon icons');