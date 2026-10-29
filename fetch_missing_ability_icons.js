const names = [
  { name: 'Let the Storm Rage On', url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/a/ab/Ability_Let_the_Storm_Rage_On.png/revision/latest?cb=20260415193512', fileName: 'Let the Storm Rage On.png' },
  { name: 'That Smile Hits Different', url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/1/1b/Ability_That_Smile_Hits_Different.png/revision/latest?cb=20260415193351', fileName: 'That Smile Hits Different.png' },
  { name: 'I Said "Elation," Did I Stutter?', url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/a/a3/Ability_I_Said_%22Elation%2C%22_Did_I_Stutter%3F.png/revision/latest?cb=20260415193727', fileName: 'I Said "Elation," Did I Stutter?.png' },
  { name: 'Make Some Noise', url: 'https://static.wikia.nocookie.net/houkai-star-rail/images/5/58/Ability_Make_Some_Noise.png/revision/latest?cb=20260415193323', fileName: 'Make Some Noise.png' }
];

const fs = require('fs');
const path = require('path');
const ROOT = 'C:\\\\.projects\\\\FiniteHSR';
const ABILITIES_DIR = path.join(ROOT, 'public', 'icons', 'abilities');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('Download failed ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync('public/icons/_manifest.json', 'utf8'));
  const abilitiesCat = manifest.abilities || { label: 'Иконки навыков', count: 0, icons: [] };
  const existingFiles = new Set(abilitiesCat.icons.map((i) => i.file));

  const ABILITIES_DIR = path.join('C:\\\\.projects\\\\FiniteHSR', 'public', 'icons', 'abilities');
  if (!fs.existsSync(ABILITIES_DIR)) fs.mkdirSync(ABILITIES_DIR, { recursive: true });

  for (const item of names) {
    const safeName = item.name.replace(/[\\/:*?"<>|]/g, '_');
    const fileName = safeName + '.png';
    const destPath = path.join('C:\\\\.projects\\\\FiniteHSR', 'public', 'icons', 'abilities', fileName);

    if (fs.existsSync(destPath)) {
      console.log('  ' + item.name + ' already exists, skipping');
      continue;
    }

    console.log('Downloading ' + item.name + '...');
    try {
      const pngBuf = await fetch(item.url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
      if (!pngBuf.ok) throw new Error('HTTP ' + pngBuf.status);
      const buf = Buffer.from(await pngBuf.arrayBuffer());
      fs.writeFileSync(destPath, buf);
      console.log('  Saved ' + fileName);

      if (!existingFiles.has('abilities/' + fileName)) {
        abilitiesCat.icons.push({ file: 'abilities/' + fileName, name: item.name });
        existingFiles.add('abilities/' + fileName);
      }
    } catch (e) {
      console.error('  FAILED ' + item.name + ': ' + e.message);
    }
  }

  abilitiesCat.count = abilitiesCat.icons.length;
  abilitiesCat.label = 'Иконки навыков';
  const manifestPath = path.join('C:\\\\.projects\\\\FiniteHSR', 'public', 'icons', '_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.abilities = abilitiesCat;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('Manifest updated');

  // Regenerate icon manifest
  console.log('Running gen-icon-manifest.ts...');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npx', ['tsx', 'src/core/gen-icon-manifest.ts'], {
    cwd: 'C:\\\\.projects\\\\FiniteHSR',
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('gen-icon-manifest.ts failed');
    process.exit(result.status ?? 1);
  }
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });