import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const EIDOLON_DIR = join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json');

interface FileInfo {
  title: string;
  url: string;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function getImageUrl(title: string): Promise<string | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const res = await fetch(`https://honkai-star-rail.fandom.com/api.php?action=query&titles=${encodedTitle}&prop=imageinfo&iiprop=url&format=json`);
    const data = await res.json();
    const pages = data.query?.pages;
    if (pages) {
      for (const p of Object.values(pages)) {
        if ((p as any).imageinfo?.[0]?.url) {
          return (p as any).imageinfo[0].url;
        }
      }
    }
  } catch (e) {
    console.error(`  Failed to get URL for ${title}: ${e instanceof Error ? e.message : e}`);
  }
  return null;
}

async function downloadImage(title: string, destPath: string): Promise<boolean> {
  if (existsSync(destPath)) {
    console.log(`  ${basename(destPath)} already exists, skipping`);
    return true;
  }

  const url = await getImageUrl(title);
  if (!url) {
    console.error(`  FAILED to get URL for ${title}`);
    return false;
  }

  try {
    console.log(`  Fetching ${title}...`);
    const pngBuf = await fetchBuffer(url);
    writeFileSync(destPath, pngBuf);
    console.log(`  Saved ${basename(destPath)}`);
    return true;
  } catch (e) {
    console.error(`  FAILED ${title}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

// Trailblazer eidolon data from Fandom categories
const TRAILBLAZER_EIDOLONS: Record<string, { category: string; eidolons: string[]; fandomNameMap?: Record<string, string> }> = {
  'Trailblazer (Physical)': {
    category: 'Trailblazer_(Destruction)_Eidolon_Icons',
    eidolons: [
      'A Falling Star',
      'An Unwilling Host',
      'A Leading Whisper',
      'A Destructing Glance',
      'A Surviving Hope',
      'A Trailblazing Will'
    ]
  },
  'Trailblazer (Fire)': {
    category: 'Trailblazer_(Preservation)_Eidolon_Icons',
    eidolons: [
      'Earth-Shaking Resonance',
      'Time-Defying Tenacity',
      'Trail-Blazing Blueprint',
      'Nation-Building Oath',
      'Spirit-Warming Flame',
      'City-Forging Bulwarks'
    ]
  },
  'Trailblazer (Harmony)': {
    category: 'Trailblazer_(Harmony)_Eidolon_Icons',
    eidolons: [
      'Best Seat in the House',
      'Jailbreaking Rainbowwalk',
      'Sanatorium for Rest Notes',
      'Dove in Tophat',
      'Poem Favors Rhythms of Old',
      'Tomorrow, Rest in Spotlight'
    ]
  },
  'Trailblazer (Remembrance)': {
    category: 'Trailblazer_(Remembrance)_Eidolon_Icons',
    eidolons: [
      'Narrator of the Present',
      'Gleaner of the Past',
      'Chanter of the Future',
      'Dancer of the Muse',
      'Seamster of the Ode',
      'Bearer of the Revelation'
    ]
  },
  'Trailblazer (Elation)': {
    category: 'Trailblazer_(Elation)_Eidolon_Icons',
    eidolons: [
      'Believe In the Light',
      'History in the Making...',
      'Into the Spotlight',
      'Save the World. Just Because.',
      'Love & Courage: Always in Style',
      'The Cosmic Legend Cometh!'
    ],
    fandomNameMap: {
      'Love & Courage: Always in Style': 'Love & Courage Always in Style'
    }
  }
};

// Pearl's updated E5 icon
const PEARL_UPDATED = {
  oldName: 'Render Those Starlit Swirls',
  newTitle: 'File:Eidolon Render Those Starlit Swirls.png'
};

async function fetchCategoryImages(category: string): Promise<FileInfo[]> {
  const results: FileInfo[] = [];
  let continueToken: string | null = null;

  do {
    const listUrl = `https://honkai-star-rail.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:${encodeURIComponent(category)}&cmlimit=100&format=json${continueToken ? `&cmcontinue=${encodeURIComponent(continueToken)}` : ''}`;
    const res = await fetch(listUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
    const data: any = await res.json();

    if (data.query?.categorymembers) {
      for (const page of data.query.categorymembers) {
        if (page.title.startsWith('File:') && page.title.endsWith('.png')) {
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

async function downloadTrailblazerEidolons(): Promise<void> {
  console.log('Downloading Trailblazer eidolon icons...');

  for (const [displayName, data] of Object.entries(TRAILBLAZER_EIDOLONS)) {
    const { category, eidolons, fandomNameMap } = data;
    const dir = join(EIDOLON_DIR, displayName);
    mkdirSync(dir, { recursive: true });

    console.log(`\n${displayName} (${category}):`);

    // Get all images from the category
    const images = await fetchCategoryImages(category);

    // Match eidolons to images
    for (const eidolonName of eidolons) {
      const fandomName = fandomNameMap?.[eidolonName] ?? eidolonName;
      const expectedFileName = `Eidolon ${fandomName}.png`;
      const matchingImage = images.find(img =>
        img.title.toLowerCase() === `file:${expectedFileName.toLowerCase()}`
      );

      if (matchingImage) {
        const destPath = join(dir, `Eidolon ${eidolonName}.png`);
        await downloadImage(matchingImage.title, destPath);
      } else {
        console.error(`  MISSING: ${expectedFileName} not found in category`);
      }
    }
  }
}

async function downloadPearlUpdated(): Promise<void> {
  console.log('\nDownloading Pearl updated E5 icon...');
  const dir = join(EIDOLON_DIR, 'Pearl');
  mkdirSync(dir, { recursive: true });

  const destPath = join(dir, 'Render Those Starlit Swirls.png');
  
  // Force re-download by removing existing file
  if (existsSync(destPath)) {
    console.log('  Removing old Pearl E5 icon...');
    const { unlinkSync } = await import('node:fs');
    unlinkSync(destPath);
  }
  
  await downloadImage(PEARL_UPDATED.newTitle, destPath);
}

function updateManifest(): void {
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  // Add Trailblazer eidolon directories to manifest
  for (const [displayName, { eidolons }] of Object.entries(TRAILBLAZER_EIDOLONS)) {
    for (const eidolonName of eidolons) {
      const fileName = `Eidolon ${eidolonName}.png`;
      const relativePath = `eidolons/${displayName}/${fileName}`;

      // Check if already in manifest
      const exists = manifest.eidolons.icons.some((i: any) => i.file === relativePath);
      if (!exists) {
        manifest.eidolons.icons.push({
          file: relativePath,
          name: eidolonName,
          character: displayName
        });
        console.log(`  Added ${displayName}: ${eidolonName} to manifest`);
      }
    }
  }

  // Update Pearl's E5 icon path
  const pearlOldPath = 'eidolons/Pearl/Render Those Starlit Swirls.png';
  const pearlIdx = manifest.eidolons.icons.findIndex((i: any) => i.file === pearlOldPath);
  if (pearlIdx >= 0) {
    // Already exists, just ensure it's correct
    console.log(`  Pearl E5 already in manifest`);
  } else {
    manifest.eidolons.icons.push({
      file: pearlOldPath,
      name: 'Render Those Starlit Swirls',
      character: 'Pearl'
    });
    console.log(`  Added Pearl E5 to manifest`);
  }

  manifest.eidolons.count = manifest.eidolons.icons.length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Manifest updated');
}

async function main(): Promise<void> {
  await downloadTrailblazerEidolons();
  await downloadPearlUpdated();
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