const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

const characters = [
  {name: 'Sparxie', id: 1501},
  {name: 'Silver Wolf LV.999', id: 1506},
  {name: 'Himeko Nova', id: 1510},
  {name: 'Rin', id: 1508},
  {name: 'Mortenax', id: 1507},
];

async function downloadCharacterEidolons(charName, charId) {
  const safeCharName = charName.replace(/[\\/:*?"<>|]/g, '_');
  const dir = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons\\' + charName.replace(/[\\/:*?"<>|]/g, '_');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('\n' + charName + ':');

  try {
    const r = await fetch('https://static.nanoka.cc/hsr/4.6.54/en/character/' + charId + '.json');
    const data = await r.json();
    if (!data.ranks) return;

    for (const [key, rank] of Object.entries(data.ranks)) {
      if (!rank.icon) continue;
      
      const iconUrl = 'https://static.nanoka.cc/assets/hsr/skillicons/' + rank.icon.replace('.png', '.webp');
      const fileName = 'Eidolon ' + rank.name.replace(/[\\/:*?"<>|]/g, '_') + '.png';
      const destPath = 'C:\\.projects\\FiniteHSR\\public\\icons\\eidolons\\' + charName.replace(/[\\/:*?"<>|]/g, '_') + '\\' + 'Eidolon ' + rank.name.replace(/[\\/:*?"<>|]/g, '_') + '.png';

      if (fs.existsSync(destPath)) {
        console.log('  ' + rank.name + ' already exists, skipping');
        continue;
      }

      console.log('Downloading ' + rank.name + '...');
      try {
        const pngBuf = await fetchBuffer(iconUrl);
        fs.writeFileSync(destPath, pngBuf);
        console.log('  Downloaded ' + rank.name);
      } catch (e) {
        console.error('  FAILED ' + rank.name + ': ' + e.message);
      }
    }
  } catch (e) {
    console.error('Error for ' + charName + ': ' + e.message);
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log('=== Downloading missing eidolon icons from Nanoka ===');
  console.log('Total characters: ' + characters.length);

  for (const c of characters) {
    try {
      await downloadCharacterEidolons(c.name, c.id);
      console.log('Completed ' + c.name);
    } catch (e) {
      console.error('Failed ' + c.name + ': ' + e.message);
    }
  }
  
  // Update manifest
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));
  manifest.eidolons.icons = [];
  
  const chars = fs.readdirSync('C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\eidolons');
  for (const charName of chars) {
    const charDir = 'C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\eidolons\\' + charName;
    if (!fs.existsSync(charDir)) continue;
    
    const files = fs.readdirSync(charDir);
    for (const file of files) {
      if (!file.endsWith('.png')) continue;
      if (!file.startsWith('Eidolon ')) continue;
      
      const eidolonName = file.replace('.png', '');
      const relativePath = 'eidolons/' + charName + '/' + file;
      
      const existing = manifest.eidolons.icons.find(i => i.file === 'eidolons/' + charName + '/' + file);
      if (!existing) {
        manifest.eidolons.icons.push({
          file: 'eidolons/' + charName + '/' + file,
          name: file.replace('.png', ''),
          character: charName
        });
      }
    }
  }
  
  manifest.eidolons.count = manifest.eidolons.icons.length;
  fs.writeFileSync('C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\_manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');
  
  console.log('Done!');
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

main().catch(e => { console.error(e); process.exit(1); });