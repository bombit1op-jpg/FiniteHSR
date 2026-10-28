import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..');
const PORTRAIT_DIR = join(ROOT, 'public', 'portraits');
const CHARACTERS_DATA = join(ROOT, 'hsr-data', 'characters.json');
const PORTRAIT_BASE = 'https://static.nanoka.cc/assets/hsr/avatarshopicon/';

interface CharInfo {
  name: string;
  relics?: { avatar_id: number };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  const characters = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8')) as CharInfo[];
  
  // Collect unique avatar_ids
  const avatarIds = new Set<string>();
  for (const c of characters) {
    if (c.relics?.avatar_id) {
      avatarIds.add(String(c.relics.avatar_id));
    }
  }
  
  // Add Trailblazer variants (8001-8010)
  for (let i = 8001; i <= 8010; i++) {
    avatarIds.add(String(i));
  }
  
  const ids = Array.from(avatarIds).sort((a, b) => Number(a) - Number(b));
  console.log(`Total portraits to download: ${ids.length}`);
  
  mkdirSync(PORTRAIT_DIR, { recursive: true });
  
  const have = new Set(readdirSync(PORTRAIT_DIR).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)));
  console.log(`Already have: ${have.size}`);
  
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const id of ids) {
    if (have.has(id)) {
      skipped++;
      continue;
    }
    
    const webpPath = join(PORTRAIT_DIR, `${id}.webp`);
    
    try {
      console.log(`Fetching ${id}...`);
      const webpBuf = await fetchBuffer(`${PORTRAIT_BASE}/${id}.webp`);
      
      // The source is already WebP, but we need to resize to 376x512
      await sharp(webpBuf)
        .resize(376, 512, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(webpPath);
      
      console.log(`  Saved ${id}.webp`);
      downloaded++;
      have.add(id);
      
      // Small delay to be nice to the server
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error(`  FAILED ${id}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  
  console.log(`\nDone: downloaded ${downloaded}, skipped ${skipped}, failed ${failed}`);
  
  // Regenerate icon manifest
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
  console.log('All done!');
}

main().catch(e => { console.error(e); process.exit(1); });