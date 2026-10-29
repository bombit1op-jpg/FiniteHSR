import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json');
const NANOKA_BASE = 'https://static.nanoka.cc/hsr/4.6.54/en/character/';

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

async function fetchBuffer(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function fetchCharacterEidolons(charId: string) {
  const url = `${NANOKA_BASE}${charId}.json`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`  Failed to fetch character ${charId}: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

function getEidolonNames(charData: any) {
  if (!charData.ranks) return [];
  const ranks = Object.values(charData.ranks);
  return ranks.map(r => ({
    name: r.name,
    icon: r.icon,
    rank: r.id % 10
  }));
}

function sanitizePath(name: string): string {
  return name
    .replace(/<unbreak>/gi, '')
    .replace(/<\/unbreak>/gi, '')
    .replace(/[\\/:*?"<>|]/g, '_');
}

async function downloadCharacterEidolons(charName: string, charData: any) {
  const safeCharName = sanitizePath(charName);
  const dir = join('C:\\.projects\\FiniteHSR\\public\\icons\\eidolons', safeCharName);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const eidolons = getEidolonNames(charData);
  console.log(`\n${charName}: ${eidolons.length} eidolons`);

  for (const e of eidolons) {
    const fileName = sanitize(e.name) + '.png';
    const destPath = join('C:\\.projects\\FiniteHSR\\public\\icons\\eidolons', safeCharName, fileName);

    // Skip if no icon data available
    if (!e.icon) {
      console.log(`  ${e.name}: no icon data available, skipping`);
      continue;
    }

    // Map icon name to CDN URL - all eidolon icons follow the SkillIcon_{id}_Rank{N}.webp pattern on Nanoka CDN
    const iconUrl = `https://static.nanoka.cc/assets/hsr/skillicons/${e.icon.replace('.png', '.webp')}`;

    if (existsSync(destPath)) {
      console.log(`  ${e.name} already exists, skipping`);
      continue;
    }

    console.log(`  Downloading ${e.name}...`);
    try {
      const pngBuf = await fetch(iconUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
      if (!pngBuf.ok) throw new Error(`HTTP ${pngBuf.status}`);
      const buf = Buffer.from(await pngBuf.arrayBuffer());
      writeFileSync(destPath, buf);
      console.log(`  Saved ${sanitize(e.name)}.png`);
    } catch (err) {
      console.error(`  FAILED ${e.name}: ${err instanceof Error ? err.message : err}`);
    }
    await new Promise(r => setTimeout(r, 100)); // rate limit
  }
}

async function main() {
  console.log('=== Downloading ALL eidolon icons from Nanoka ===');

  // Load characters from local data
  const charsData = JSON.parse(readFileSync(join(ROOT, 'hsr-data', 'characters.json'), 'utf8'));

  // Filter to unique characters by name (handle {NICKNAME} Trailblazers)
  const uniqueChars = new Map<string, any>();
  for (const c of charsData) {
    const key = c.name === '{NICKNAME}' ? `${c.name}_${c.id}` : c.name;
    if (!uniqueChars.has(key)) {
      uniqueChars.set(key, c);
    }
  }

  console.log(`Total unique characters: ${uniqueChars.size}`);

  let downloaded = 0;
  let failed = 0;

  for (const [key, charData] of uniqueChars) {
    const charName = charData.name === '{NICKNAME}' ? `Trailblazer (${charData.base_type})` : charData.name;
    const eidolons = getEidolonNames(charData);

    if (eidolons.length === 0) {
      console.log(`\n${charName}: no eidolons`);
      continue;
    }

    try {
      await downloadCharacterEidolons(charName, charData);
      downloaded++;
    } catch (e) {
      console.error(`Failed ${charName}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // Update manifest
  console.log('\nUpdating manifest...');
  updateManifest();

  console.log('\n=== Summary ===');
  console.log(`Downloaded: ${downloaded}, Failed: ${failed}`);

  // Regenerate icon manifest
  console.log('\nRunning gen-icon-manifest.ts...');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npx', ['tsx', 'src/core/gen-icon-manifest.ts'], {
    cwd: 'C:\\.projects\\FiniteHSR',
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('gen-icon-manifest.ts failed');
    process.exit(result.status ?? 1);
  }
  console.log('Done!');
}

function updateManifest() {
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'icons', '_manifest.json'), 'utf8'));

  // Clear existing eidolons and rebuild from disk
  manifest.eidolons.icons = [];

  const chars = readdirSync(EIDOLON_DIR);

  for (const charName of chars) {
    const charDir = join(EIDOLON_DIR, charName);
    if (!existsSync(charDir)) continue;

    const files = readdirSync(charDir);
    for (const file of files) {
      if (!file.startsWith('Eidolon ') || !file.endsWith('.png')) continue;

      const eidolonName = file.replace('Eidolon ', '').replace('.png', '');
      const relativePath = `eidolons/${charName}/${file}`;

      manifest.eidolons.icons.push({
        file: relativePath,
        name: eidolonName,
        character: charName
      });
    }
  }

  manifest.eidolons.count = manifest.eidolons.icons.length;
  writeFileSync(join(ROOT, 'public', 'icons', '_manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated with ${manifest.eidolons.count} eidolon icons`);
}

main().catch(e => { console.error(e); process.exit(1); });