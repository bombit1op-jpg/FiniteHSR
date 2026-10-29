const fs = require('fs');
const path = require('path');

const EIDOLON_DIR = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons';
const MANIFEST_PATH = 'C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json';

const problemChars = [
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
  
  // Group by base name (without Eidolon prefix and version suffix)
  const groups = {};
  files.forEach(file => {
    let baseName = file.replace('.png', '');
    if (baseName.startsWith('Eidolon ')) {
      baseName = baseName.substring(8);
    }
    baseName = baseName.replace(/\s+\d+(\.\d+)?$/, '').replace(/\s+\d+$/, '');
    
    if (!groups[baseName]) groups[baseName] = [];
    groups[baseName].push(file);
  });

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

const allChars = [
  'Argenti', 'Aventurine', 'Cyrene', 'Evanescia', 'Feixiao', 'Fu Xuan', 'Gilgamesh',
  'Himeko Nova', 'Jade', 'Lingsha', 'Mortenax Blade', 'Moze', 'Pearl',
  'Rin Tohsaka', 'Silver Wolf LV.999', 'Sparxie', 'Yao Guang',
  'Cipher', 'Aventurine Waveflair', 'Himeko Nova', 'Mortenax Blade', 'Moze',
  'Sparxie', 'Yao Guang',
  'Acheron', 'Aglaea', 'Anaxa', 'Archer', 'Argenti', 'Arlan', 'Ashveil', 'Asta',
  'Aventurine', 'Bailu', 'Black Swan', 'Blade', 'Boothill', 'Bronya', 'Castorice',
  'Cerydra', 'Cipher', 'Clara', 'Cyrene', 'Dan Heng', 'Dan Heng Imbibitor Lunae',
  'Dan Heng Permansor Terrae', 'Dr. Ratio', 'Evanescia', 'Evernight', 'Feixiao',
  'Firefly', 'Fu Xuan', 'Fugue', 'Gallagher', 'Gepard', 'Gilgamesh', 'Guinaifen',
  'Hanya', 'Herta', 'Himeko', 'Himeko Nova', 'Hook', 'Huohuo', 'Hyacine', 'Hysilens',
  'Jade', 'Jiaoqiu', 'Jing Yuan', 'Jingliu', 'Kafka', 'Lingsha', 'Luka', 'Luocha',
  'Lynx', 'March 7th', 'March 7th The Hunt', 'Misha', 'Mortenax Blade', 'Moze',
  'Mydei', 'Natasha', 'Pearl', 'Pela', 'Phainon', 'Qingque', 'Rappa', 'Rin Tohsaka',
  'Robin', 'Robin Summeretto', 'Ruan Mei', 'Saber', 'Sampo', 'Seele', 'Serval',
  'Silver Wolf', 'Silver Wolf LV.999', 'Sparkle', 'Sparxie', 'Sunday', 'Sushang',
  'The Dahlia', 'The Herta', 'Tingyun', 'Topaz Numby', 'Trailblazer Destruction',
  'Trailblazer Elation', 'Trailblazer Harmony', 'Trailblazer Preservation',
  'Trailblazer Remembrance', 'Tribbie', 'Welt', 'Xueyi', 'Yanqing', 'Yao Guang',
  'Yukong', 'Yunli'
];

// Clean all problematic characters
problemChars.forEach(cleanCharacter);

// Rebuild manifest
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
    if (!file.startsWith('Eidolon ')) return;
    
    const eidolonName = file.replace('.png', '');
    const relativePath = 'eidolons/' + charName + '/' + file;
    
    const existing = manifest.eidolons.icons.find(i => i.file === 'eidolons/' + charName + '/' + file);
    if (!existing) {
      manifest.eidolons.icons.push({
        file: 'eidolons/' + charName + '/' + file,
        name: eidolonName,
        character: charName
      });
    }
  });
});

fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
console.log('Manifest updated with', manifest.eidolons.icons.length, 'eidolon icons');