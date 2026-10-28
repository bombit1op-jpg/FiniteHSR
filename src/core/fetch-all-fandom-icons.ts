import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ICON_DIR = join(ROOT, 'public', 'icons', 'characters');
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json');

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function getAllCategoryImages(category: string, limit = 500): Promise<{ title: string; url: string }[]> {
  const results: { title: string; url: string }[] = [];
  let continueToken: string | null = null;
  
  do {
    const listUrl: string = `https://honkai-star-rail.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=${limit}&format=json${continueToken ? `&cmcontinue=${encodeURIComponent(continueToken)}` : ''}`;
    const res = await fetch(listUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
    const data: any = await res.json();
    
    if (data.query?.categorymembers) {
      for (const page of data.query.categorymembers) {
        if (page.title.startsWith('File:') && page.title.endsWith('.png')) {
          // Get the actual image URL
          const imgUrl = `https://honkai-star-rail.fandom.com/api.php?action=query&titles=${encodeURIComponent(page.title)}&prop=imageinfo&iiprop=url&format=json`;
          const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
          const imgData = await imgRes.json();
          
          const pages = imgData.query?.pages;
          if (pages) {
            for (const p of Object.values(pages)) {
              if ((p as any).imageinfo?.[0]?.url) {
                results.push({ title: page.title, url: (p as any).imageinfo[0].url });
                break;
              }
            }
          }
        }
      }
    }
    
    continueToken = data.continue?.cmcontinue ?? null;
    await new Promise(r => setTimeout(r, 100));
  } while (continueToken);
  
  return results;
}

function cleanFileName(title: string): string {
  return title
    .replace('File:', '')
    .replace('.png', '')
    .replace(/[<>:"/\\|?*]/g, '')
    .trim();
}

async function main(): Promise<void> {
  console.log('Fetching ALL images from Category:Character_Icons...');
  const images = await getAllCategoryImages('Character_Icons');
  console.log(`Found ${images.length} PNG files`);
  
  mkdirSync(ICON_DIR, { recursive: true });
  
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  manifest.characters.icons = [];
  
  let downloaded = 0;
  let failed = 0;
  
  for (const { title, url } of images) {
    const fileName = cleanFileName(title) + '.png';
    const filePath = join(ICON_DIR, fileName);
    
    try {
      console.log(`Fetching ${title}...`);
      const pngBuf = await fetchBuffer(url);
      writeFileSync(filePath, pngBuf);
      
      manifest.characters.icons.push({
        file: `characters/${fileName}`,
        name: cleanFileName(title),
      });
      
      downloaded++;
      console.log(`  Saved ${fileName}`);
      
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.error(`  FAILED ${title}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  
  manifest.characters.count = manifest.characters.icons.length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest updated: ${manifest.characters.count} icons`);
  console.log(`Done: downloaded ${downloaded}, failed ${failed}`);
  
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