import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
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

// Map Fandom category names to display names and handle special cases
const CHARACTER_CATEGORIES: Record<string, { category: string; displayName: string; fandomNameMap?: Record<string, string> }> = {
  'Acheron': { category: 'Acheron_Eidolon_Icons', displayName: 'Acheron' },
  'Aglaea': { category: 'Aglaea_Eidolon_Icons', displayName: 'Aglaea' },
  'Anaxa': { category: 'Anaxa_Eidolon_Icons', displayName: 'Anaxa' },
  'Archer': { category: 'Archer_Eidolon_Icons', displayName: 'Archer' },
  'Argenti': { category: 'Argenti_Eidolon_Icons', displayName: 'Argenti' },
  'Arlan': { category: 'Arlan_Eidolon_Icons', displayName: 'Arlan' },
  'Ashveil': { category: 'Ashveil_Eidolon_Icons', displayName: 'Ashveil' },
  'Asta': { category: 'Asta_Eidolon_Icons', displayName: 'Asta' },
  'Aventurine': { category: 'Aventurine_Eidolon_Icons', displayName: 'Aventurine' },
  'Aventurine • Waveflair': { category: 'Aventurine_•_Waveflair_Eidolon_Icons', displayName: 'Aventurine • Waveflair' },
  'Bailu': { category: 'Bailu_Eidolon_Icons', displayName: 'Bailu' },
  'Black Swan': { category: 'Black_Swan_Eidolon_Icons', displayName: 'Black Swan' },
  'Blade': { category: 'Blade_Eidolon_Icons', displayName: 'Blade' },
  'Boothill': { category: 'Boothill_Eidolon_Icons', displayName: 'Boothill' },
  'Bronya': { category: 'Bronya_Eidolon_Icons', displayName: 'Bronya' },
  'Castorice': { category: 'Castorice_Eidolon_Icons', displayName: 'Castorice' },
  'Cerydra': { category: 'Cerydra_Eidolon_Icons', displayName: 'Cerydra' },
  'Cipher': { category: 'Cipher_Eidolon_Icons', displayName: 'Cipher' },
  'Clara': { category: 'Clara_Eidolon_Icons', displayName: 'Clara' },
  'Cyrene': { category: 'Cyrene_Eidolon_Icons', displayName: 'Cyrene' },
  'Dan Heng': { category: 'Dan_Heng_Eidolon_Icons', displayName: 'Dan Heng' },
  'Dan Heng • Imbibitor Lunae': { category: 'Dan_Heng_•_Imbibitor_Lunae_Eidolon_Icons', displayName: 'Dan Heng • Imbibitor Lunae' },
  'Dan Heng • Permansor Terrae': { category: 'Dan_Heng_•_Permansor_Terrae_Eidolon_Icons', displayName: 'Dan Heng • Permansor Terrae' },
  'Dr. Ratio': { category: 'Dr._Ratio_Eidolon_Icons', displayName: 'Dr. Ratio' },
  'Evanescia': { category: 'Evanescia_Eidolon_Icons', displayName: 'Evanescia' },
  'Evernight': { category: 'Evernight_Eidolon_Icons', displayName: 'Evernight' },
  'Feixiao': { category: 'Feixiao_Eidolon_Icons', displayName: 'Feixiao' },
  'Firefly': { category: 'Firefly_Eidolon_Icons', displayName: 'Firefly' },
  'Fu Xuan': { category: 'Fu_Xuan_Eidolon_Icons', displayName: 'Fu Xuan' },
  'Fugue': { category: 'Fugue_Eidolon_Icons', displayName: 'Fugue' },
  'Gallagher': { category: 'Gallagher_Eidolon_Icons', displayName: 'Gallagher' },
  'Gepard': { category: 'Gepard_Eidolon_Icons', displayName: 'Gepard' },
  'Gilgamesh': { category: 'Gilgamesh_Eidolon_Icons', displayName: 'Gilgamesh' },
  'Guinaifen': { category: 'Guinaifen_Eidolon_Icons', displayName: 'Guinaifen' },
  'Hanya': { category: 'Hanya_Eidolon_Icons', displayName: 'Hanya' },
  'Herta': { category: 'Herta_Eidolon_Icons', displayName: 'Herta' },
  'Himeko': { category: 'Himeko_Eidolon_Icons', displayName: 'Himeko' },
  'Himeko • Nova': { category: 'Himeko_•_Nova_Eidolon_Icons', displayName: 'Himeko • Nova' },
  'Hook': { category: 'Hook_Eidolon_Icons', displayName: 'Hook' },
  'Huohuo': { category: 'Huohuo_Eidolon_Icons', displayName: 'Huohuo' },
  'Hyacine': { category: 'Hyacine_Eidolon_Icons', displayName: 'Hyacine' },
  'Hysilens': { category: 'Hysilens_Eidolon_Icons', displayName: 'Hysilens' },
  'Jade': { category: 'Jade_Eidolon_Icons', displayName: 'Jade' },
  'Jiaoqiu': { category: 'Jiaoqiu_Eidolon_Icons', displayName: 'Jiaoqiu' },
  'Jing Yuan': { category: 'Jing_Yuan_Eidolon_Icons', displayName: 'Jing Yuan' },
  'Jingliu': { category: 'Jingliu_Eidolon_Icons', displayName: 'Jingliu' },
  'Kafka': { category: 'Kafka_Eidolon_Icons', displayName: 'Kafka' },
  'Lingsha': { category: 'Lingsha_Eidolon_Icons', displayName: 'Lingsha' },
  'Luka': { category: 'Luka_Eidolon_Icons', displayName: 'Luka' },
  'Luocha': { category: 'Luocha_Eidolon_Icons', displayName: 'Luocha' },
  'Lynx': { category: 'Lynx_Eidolon_Icons', displayName: 'Lynx' },
  'March 7th': { category: 'March_7th_(Preservation)_Eidolon_Icons', displayName: 'March 7th' },
  'March 7th • The Hunt': { category: 'March_7th_(The_Hunt)_Eidolon_Icons', displayName: 'March 7th • The Hunt' },
  'Misha': { category: 'Misha_Eidolon_Icons', displayName: 'Misha' },
  'Mortenax Blade': { category: 'Mortenax_Blade_Eidolon_Icons', displayName: 'Mortenax Blade' },
  'Moze': { category: 'Moze_Eidolon_Icons', displayName: 'Moze' },
  'Mydei': { category: 'Mydei_Eidolon_Icons', displayName: 'Mydei' },
  'Natasha': { category: 'Natasha_Eidolon_Icons', displayName: 'Natasha' },
  'Pearl': { category: 'Pearl_Eidolon_Icons', displayName: 'Pearl' },
  'Pela': { category: 'Pela_Eidolon_Icons', displayName: 'Pela' },
  'Phainon': { category: 'Phainon_Eidolon_Icons', displayName: 'Phainon' },
  'Qingque': { category: 'Qingque_Eidolon_Icons', displayName: 'Qingque' },
  'Rappa': { category: 'Rappa_Eidolon_Icons', displayName: 'Rappa' },
  'Rin Tohsaka': { category: 'Rin_Tohsaka_Eidolon_Icons', displayName: 'Rin Tohsaka' },
  'Robin': { category: 'Robin_Eidolon_Icons', displayName: 'Robin' },
  'Robin • Summeretto': { category: 'Robin_•_Summeretto_Eidolon_Icons', displayName: 'Robin • Summeretto' },
  'Ruan Mei': { category: 'Ruan_Mei_Eidolon_Icons', displayName: 'Ruan Mei' },
  'Saber': { category: 'Saber_Eidolon_Icons', displayName: 'Saber' },
  'Sampo': { category: 'Sampo_Eidolon_Icons', displayName: 'Sampo' },
  'Seele': { category: 'Seele_Eidolon_Icons', displayName: 'Seele' },
  'Serval': { category: 'Serval_Eidolon_Icons', displayName: 'Serval' },
  'Silver Wolf': { category: 'Silver_Wolf_Eidolon_Icons', displayName: 'Silver Wolf' },
  'Silver Wolf LV.999': { category: 'Silver_Wolf_LV.999_Eidolon_Icons', displayName: 'Silver Wolf LV.999' },
  'Sparkle': { category: 'Sparkle_Eidolon_Icons', displayName: 'Sparkle' },
  'Sparxie': { category: 'Sparxie_Eidolon_Icons', displayName: 'Sparxie' },
  'Sunday': { category: 'Sunday_Eidolon_Icons', displayName: 'Sunday' },
  'Sushang': { category: 'Sushang_Eidolon_Icons', displayName: 'Sushang' },
  'The Dahlia': { category: 'The_Dahlia_Eidolon_Icons', displayName: 'The Dahlia' },
  'The Herta': { category: 'The_Herta_Eidolon_Icons', displayName: 'The Herta' },
  'Tingyun': { category: 'Tingyun_Eidolon_Icons', displayName: 'Tingyun' },
  'Topaz & Numby': { category: 'Topaz_and_Numby_Eidolon_Icons', displayName: 'Topaz & Numby' },
  'Trailblazer (Physical)': { category: 'Trailblazer_(Destruction)_Eidolon_Icons', displayName: 'Trailblazer (Physical)' },
  'Trailblazer (Fire)': { category: 'Trailblazer_(Preservation)_Eidolon_Icons', displayName: 'Trailblazer (Fire)' },
  'Trailblazer (Harmony)': { category: 'Trailblazer_(Harmony)_Eidolon_Icons', displayName: 'Trailblazer (Harmony)' },
  'Trailblazer (Remembrance)': { category: 'Trailblazer_(Remembrance)_Eidolon_Icons', displayName: 'Trailblazer (Remembrance)' },
  'Trailblazer (Elation)': { category: 'Trailblazer_(Elation)_Eidolon_Icons', displayName: 'Trailblazer (Elation)' },
  'Tribbie': { category: 'Tribbie_Eidolon_Icons', displayName: 'Tribbie' },
  'Welt': { category: 'Welt_Eidolon_Icons', displayName: 'Welt' },
  'Xueyi': { category: 'Xueyi_Eidolon_Icons', displayName: 'Xueyi' },
  'Yanqing': { category: 'Yanqing_Eidolon_Icons', displayName: 'Yanqing' },
  'Yao Guang': { category: 'Yao_Guang_Eidolon_Icons', displayName: 'Yao Guang' },
  'Yukong': { category: 'Yukong_Eidolon_Icons', displayName: 'Yukong' },
  'Yunli': { category: 'Yunli_Eidolon_Icons', displayName: 'Yunli' },
};

async function downloadCharacterEidolons(displayName: string, { category, fandomNameMap }: { category: string; fandomNameMap?: Record<string, string> }): Promise<void> {
  const dir = join(EIDOLON_DIR, displayName);
  mkdirSync(dir, { recursive: true });

  console.log(`\n${displayName} (${category}):`);

  // Get all images from the category
  const images = await fetchCategoryImages(category);
  console.log(`  Found ${images.length} files in category`);

  // Get eidolon names from the first image's title pattern (assumes 6 per character)
  // Extract unique eidolon names from the category
  const eidolonNames = new Set<string>();
  for (const img of images) {
    const name = img.title.replace('File:Eidolon ', '').replace('.png', '');
    if (name && name !== img.title) {
      eidolonNames.add(name);
    }
  }

  console.log(`  Found ${eidolonNames.size} unique eidolons`);

  // Force re-download all by removing existing files first
  for (const eidolonName of eidolonNames) {
    const fandomName = fandomNameMap?.[eidolonName] ?? eidolonName;
    const fileName = `Eidolon ${fandomName}.png`;
    const destPath = join(dir, `Eidolon ${eidolonName}.png`);
    
    if (existsSync(destPath)) {
      console.log(`  Removing old ${eidolonName}...`);
      unlinkSync(destPath);
    }

    const matchingImage = images.find(img =>
      img.title.toLowerCase() === `file:${`Eidolon ${fandomName}.png`.toLowerCase()}`
    );

    if (matchingImage) {
      await downloadImage(matchingImage.title, destPath);
    } else {
      console.error(`  MISSING: ${eidolonName} (expected ${fileName}) not found in category`);
    }
  }
}

function updateManifest(): void {
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  // Clear existing eidolons and rebuild
  manifest.eidolons.icons = [];

  for (const [displayName] of Object.entries(CHARACTER_CATEGORIES)) {
    const dir = join(EIDOLON_DIR, displayName);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.startsWith('Eidolon ') || !file.endsWith('.png')) continue;
      
      const eidolonName = file.replace('Eidolon ', '').replace('.png', '');
      const relativePath = `eidolons/${displayName}/${file}`;
      
      manifest.eidolons.icons.push({
        file: relativePath,
        name: eidolonName,
        character: displayName
      });
    }
  }

  manifest.eidolons.count = manifest.eidolons.icons.length;
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`Manifest updated with ${manifest.eidolons.count} eidolon icons`);
}

async function main(): Promise<void> {
  console.log('=== Downloading ALL eidolon icons from Fandom ===');
  console.log(`Total characters: ${Object.keys(CHARACTER_CATEGORIES).length}`);

  let downloaded = 0;
  let failed = 0;

  for (const [displayName, data] of Object.entries(CHARACTER_CATEGORIES)) {
    try {
      await downloadCharacterEidolons(displayName, data);
      downloaded++;
} catch (e) {
      console.error(`Failed ${displayName}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }
  if (result.status !== 0) {
    console.error('gen-icon-manifest.ts failed');
    process.exit(result.status ?? 1);
  }
  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });