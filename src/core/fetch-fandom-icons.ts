import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const ICON_DIR = join(ROOT, 'public', 'icons', 'characters');
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json');
const CHARACTERS_DATA = join(ROOT, 'hsr-data', 'characters.json');

interface CharInfo {
  name: string;
  relics?: { avatar_id: number };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function getCategoryMembers(category: string, limit = 500): Promise<string[]> {
  const members: string[] = [];
  let continueToken: string | null = null;
  
  do {
    const url: string = `https://honkai-star-rail.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=${limit}&format=json${continueToken ? `&cmcontinue=${encodeURIComponent(continueToken)}` : ''}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
    const data: any = await res.json();
    
    if (data.query?.categorymembers) {
      for (const page of data.query.categorymembers) {
        if (page.title.startsWith('File:') && page.title.endsWith('.png')) {
          members.push(page.title);
        }
      }
    }
    
    continueToken = data.continue?.cmcontinue ?? null;
    await new Promise(r => setTimeout(r, 100));
  } while (continueToken);
  
  return members;
}

async function getImageUrl(fileTitle: string): Promise<string | null> {
  const url = `https://honkai-star-rail.fandom.com/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&format=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  const data = await res.json();
  
  const pages = data.query?.pages;
  if (!pages) return null;
  
  for (const page of Object.values(pages)) {
    if ((page as any).imageinfo?.[0]?.url) {
      return (page as any).imageinfo[0].url;
    }
  }
  return null;
}

function normalizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\s•.'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function main(): Promise<void> {
  // Load character data as source of truth
  const characters = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8')) as CharInfo[];
  
  // Build a map of character display name -> avatar_id
  const charMap = new Map<string, string>();
  for (const c of characters) {
    if (c.name && c.name !== '{NICKNAME}') {
      charMap.set(c.name, String(c.relics?.avatar_id));
    }
  }
  
  // Add Trailblazer paths
  const TRAILBLAZER_NAMES = [
    'Trailblazer (Physical)',
    'Trailblazer (Fire)', 
    'Trailblazer (Harmony)',
    'Trailblazer (Remembrance)',
    'Trailblazer (Elation)',
  ];
  const TRAILBLAZER_AVATARS = ['8001', '8003', '8005', '8007', '8009'];
  for (let i = 0; i < TRAILBLAZER_NAMES.length; i++) {
    charMap.set(TRAILBLAZER_NAMES[i], TRAILBLAZER_AVATARS[i]);
  }
  
  console.log(`Target characters: ${charMap.size}`);
  
  // Get Fandom files
  console.log('Fetching character icon list from Fandom...');
  const files = await getCategoryMembers('Character_Icons');
  console.log(`Found ${files.length} files in Category:Character_Icons`);
  
  // Build a map of normalized Fandom filename -> fileTitle
  const fandomMap = new Map<string, string>();
  for (const fileTitle of files) {
    let name = fileTitle.replace('File:', '').replace('.png', '');
    name = name.replace(/^\s*Character\s+/i, '');
    name = name.replace(/\s*Icon\s*$/i, '');
    name = name.replace(/\s*\(Icon\)\s*$/i, '');
    name = name.trim();
    
    const norm = normalizeName(name);
    if (norm && !fandomMap.has(norm)) {
      fandomMap.set(norm, fileTitle);
    }
  }
  
  // Manual overrides for characters with different Fandom names
  const manualMap: Record<string, string> = {
    'trailblazer (physical)': 'File:Character Caelus (Destruction) Icon.png',
    'trailblazer (fire)': 'File:Character Caelus (Preservation) Icon.png',
    'silver wolf lv.999': 'File:Character Silver Wolf LV.999 Icon.png',
    'trailblazer (elation)': 'File:Character Trailblazer (Elation) Icon.png',
  };
  
  for (const [norm, fileTitle] of Object.entries(manualMap)) {
    fandomMap.set(norm, fileTitle);
  }
  
  // Match characters to Fandom files
  mkdirSync(ICON_DIR, { recursive: true });
  
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  // Clear existing character icons
  manifest.characters.icons = [];
  const existingFiles = new Set(readdirSync(ICON_DIR).filter(f => f.endsWith('.png')).map(f => f.replace('.png', '')));
  
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  let notFound = 0;
  
  for (const [charName, _avatarId] of charMap) {
    const norm = normalizeName(charName);
    let fileTitle = fandomMap.get(norm);
    
    if (!fileTitle) {
      // Try some variations
      let variations = [norm];
      if (norm.startsWith('the ')) variations.push(norm.slice(4));
      else variations.push('the ' + norm);
      if (norm.includes('trailblazer')) {
        variations.push(norm.replace('trailblazer', 'caleus'));
        variations.push(norm.replace('trailblazer', 'stelle'));
      }
      if (norm.includes('caleus') || norm.includes('stelle')) {
        variations.push(norm.replace('caleus', 'trailblazer'));
        variations.push(norm.replace('stelle', 'trailblazer'));
      }
      
      for (const v of variations) {
        if (fandomMap.has(v)) {
          fileTitle = fandomMap.get(v)!;
          break;
        }
      }
    }
    
    if (!fileTitle) {
      notFound++;
      console.log(`  NOT FOUND: ${charName}`);
      continue;
    }
    
    const fileName = `${charName}.png`;
    const filePath = join(ICON_DIR, fileName);
    
    if (existingFiles.has(charName)) {
      skipped++;
      manifest.characters.icons.push({
        file: `characters/${fileName}`,
        name: charName,
      });
      continue;
    }
    
    try {
      const imageUrl = await getImageUrl(fileTitle);
      if (!imageUrl) {
        console.log(`  No URL for ${charName} (${fileTitle})`);
        failed++;
        continue;
      }
      
      console.log(`Fetching ${charName} (${fileTitle})...`);
      const pngBuf = await fetchBuffer(imageUrl);
      writeFileSync(filePath, pngBuf);
      
      manifest.characters.icons.push({
        file: `characters/${fileName}`,
        name: charName,
      });
      existingFiles.add(charName);
      
      downloaded++;
      console.log(`  Saved ${fileName}`);
      
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.error(`  FAILED ${charName}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  
  // Sort and update count
  manifest.characters.icons.sort((a: any, b: any) => a.name.localeCompare(b.name));
  manifest.characters.count = manifest.characters.icons.length;
  
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest updated: ${manifest.characters.count} characters`);
  
  console.log(`\nDone: downloaded ${downloaded}, skipped ${skipped}, failed ${failed}, not found ${notFound}`);
  
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