import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..');
const PORTRAIT_DIR = join(ROOT, 'public', 'portraits');
const CHARACTERS_DATA = join(ROOT, 'hsr-data', 'characters.json');
const PORTRAIT_BASE = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/image/character_portrait';

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const characters = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8')) as Array<{ name: string; relics?: { avatar_id: number } }>;
  
  const have = new Set(readdirSync(PORTRAIT_DIR).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)));
  
  const missing = characters
    .filter(c => c.relics?.avatar_id)
    .filter(c => !have.has(String(c.relics!.avatar_id)) && !have.has(String(c.relics!.avatar_id)+'b1') && !have.has(String(c.relics!.avatar_id)+'b2') && !have.has(String(c.relics!.avatar_id)+'b3'));

  console.log(`Found ${missing.length} characters missing portraits`);

  mkdirSync(PORTRAIT_DIR, { recursive: true });

  for (const c of missing) {
    const id = String(c.relics!.avatar_id);
    const webpPath = join(PORTRAIT_DIR, `${id}.webp`);

    if (existsSync(webpPath)) {
      console.log(`  ${c.name} (${id}).webp already exists, skipping`);
      continue;
    }

    try {
      console.log(`  Fetching ${c.name} (${id})...`);
      const pngBuf = await fetchBuffer(`${PORTRAIT_BASE}/${id}.png`);

      await sharp(pngBuf)
        .resize(376, 512, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(webpPath);

      console.log(`  Saved ${id}.webp`);
    } catch (e) {
      console.error(`  FAILED ${c.name} (${id}): ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log('Done! Running gen-icon-manifest.ts...');
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
  console.log('All done!');
}

main().catch(e => { console.error(e); process.exit(1); });