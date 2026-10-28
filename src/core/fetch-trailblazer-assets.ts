import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..');
const PORTRAIT_DIR = join(ROOT, 'public', 'portraits');
const CHAR_ICON_DIR = join(ROOT, 'public', 'icons', 'characters');
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json');

const TRAILBLAZER_IDS = [8001, 8002, 8003, 8004, 8005, 8006, 8007, 8008, 8009, 8010];

const PATH_NAMES = {
  8001: 'Trailblazer (Physical)',
  8002: 'Trailblazer (Physical)',
  8003: 'Trailblazer (Fire)',
  8004: 'Trailblazer (Fire)',
  8005: 'Trailblazer (Harmony)',
  8006: 'Trailblazer (Harmony)',
  8007: 'Trailblazer (Remembrance)',
  8008: 'Trailblazer (Remembrance)',
  8009: 'Trailblazer (Elation)',
  8010: 'Trailblazer (Elation)',
};

const AVATAR_BASE = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/avatar';
const PORTRAIT_BASE = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/character_portrait';

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function downloadPortraits(): Promise<void> {
  console.log('Downloading Trailblazer portraits...');
  mkdirSync(PORTRAIT_DIR, { recursive: true });

  for (const id of TRAILBLAZER_IDS) {
    const webpPath = join(PORTRAIT_DIR, `${id}.webp`);

    if (existsSync(webpPath)) {
      console.log(`  ${id}.webp already exists, skipping`);
      continue;
    }

    try {
      console.log(`  Fetching ${id}...`);
      const pngBuf = await fetchBuffer(`${PORTRAIT_BASE}/${id}.png`);

      // Convert to WebP
      await sharp(pngBuf)
        .resize(376, 512, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(webpPath);

      console.log(`  Saved ${id}.webp`);
    } catch (e) {
      console.error(`  FAILED ${id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function downloadCharacterIcons(): Promise<void> {
  console.log('\nDownloading Trailblazer character icons...');
  mkdirSync(CHAR_ICON_DIR, { recursive: true });

  for (const id of TRAILBLAZER_IDS) {
    const displayName = PATH_NAMES[id as keyof typeof PATH_NAMES];
    const fileName = `${displayName}.png`;
    const filePath = join(CHAR_ICON_DIR, fileName);

    if (existsSync(filePath)) {
      console.log(`  ${fileName} already exists, skipping`);
      continue;
    }

    try {
      console.log(`  Fetching ${displayName} (avatar ${id})...`);
      const pngBuf = await fetchBuffer(`${AVATAR_BASE}/${id}.png`);
      writeFileSync(filePath, pngBuf);
      console.log(`  Saved ${fileName}`);
    } catch (e) {
      console.error(`  FAILED ${displayName}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

function updateManifest(): void {
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  // Add Trailblazer entries to characters category
  const existingNames = new Set(manifest.characters.icons.map((i: any) => i.name));

  for (const id of TRAILBLAZER_IDS) {
    const displayName = PATH_NAMES[id as keyof typeof PATH_NAMES];
    if (existingNames.has(displayName)) {
      console.log(`  ${displayName} already in manifest`);
      continue;
    }

    const fileName = `${displayName}.png`;
    manifest.characters.icons.push({
      file: `characters/${fileName}`,
      name: displayName,
    });
    existingNames.add(displayName);
    console.log(`  Added ${displayName} to manifest`);
  }

  // Sort icons by name for consistency
  manifest.characters.icons.sort((a: any, b: any) => a.name.localeCompare(b.name));
  manifest.characters.count = manifest.characters.icons.length;

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Manifest updated');
}

async function main(): Promise<void> {
  await downloadPortraits();
  await downloadCharacterIcons();
  updateManifest();

  console.log('\nRunning gen-icon-manifest.ts...');
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('npx', ['tsx', 'src/core/gen-icon-manifest.ts'], {
    cwd: ROOT,
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