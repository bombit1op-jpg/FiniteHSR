const fs = require('fs');
const path = require('path');

const fetch = global.fetch || require('node-fetch');

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadImage(url, destPath) {
  if (fs.existsSync(destPath)) {
    console.log('  ' + path.basename(destPath) + ' already exists, skipping');
    return true;
  }

  try {
    console.log('  Downloading...');
    const pngBuf = await fetchBuffer(url);
    fs.writeFileSync(destPath, pngBuf);
    console.log('  Saved ' + path.basename(destPath));
    return true;
  } catch (e) {
    console.error('  FAILED: ' + (e instanceof Error ? e.message : e));
    return false;
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

const characters = [
  {name: 'Argenti', id: 1302},
  {name: 'Aventurine', id: 1303},
  {name: 'Cyrene', id: 1415},
  {name: 'Evanescia', id: 1505},
  {name: 'Feixiao', id: 1220},
  {name: 'Fu Xuan', id: 1208},
  {name: 'Gilgamesh', id: 1509},
  {name: 'Himeko Nova', id: 1510},
  {name: 'Jade', id: 1314},
  {name: 'Lingsha', id: 1222},
  {name: 'Mortenax', id: 1507},
  {name: 'Moze', id: 1223},
  {name: 'Pearl', id: 1503},
  {name: 'Rin', id: 1508},
  {name: 'Silver Wolf LV.999', id: 1506},
  {name: 'Sparxie', id: 1501},
  {name: 'Yao Guang', id: 1502}
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
        const pngBuf = await fetchBuffer('https://static.nanoka.cc/assets/hsr/skillicons/' + rank.icon.replace('.png', '.webp'));
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
    
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.png')) continue;
      
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
  fs.writeFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');
  
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });