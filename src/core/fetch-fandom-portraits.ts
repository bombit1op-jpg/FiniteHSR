import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const ROOT = join(import.meta.dirname, '..', '..');
const PORTRAIT_DIR = join(ROOT, 'public', 'portraits');
const CHARACTERS_DATA = join(ROOT, 'hsr-data', 'characters.json');

interface CharInfo {
  name: string;
  avatar_id?: number;
}

const characters = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8')) as CharInfo[];

const have = new Set(readdirSync(PORTRAIT_DIR).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)));

const missingChars = characters
  .filter(c => c.avatar_id)
  .filter(c => !have.has(String(c.avatar_id)) && !have.has(String(c.avatar_id)+'b1') && !have.has(String(c.avatar_id)+'b2') && !have.has(String(c.avatar_id)+'b3'))
  .map(c => ({ name: c.name, avatar_id: String(c.avatar_id!) }));

console.log(`Missing portraits: ${missingChars.length}`);
missingChars.forEach(c => console.log(`  ${c.name} (${c.avatar_id})`));

const FANDOM_TO_AVATAR: Record<string, string> = {
  'Character Acheron Portrait.png': '1000001',
  'Character Aglaea Portrait.png': '1510',
  'Character Anaxa Portrait.png': '1512',
  'Character Archer Portrait.png': '1008',
  'Character Argenti Portrait.png': '1308',
  'Character Arlan Portrait.png': '1101',
  'Character Ashveil Portrait.png': '1511',
  'Character Asta Portrait.png': '1006',
  'Character Aventurine Portrait.png': '1305',
  'Character Aventurine • Waveflair Portrait.png': '1509',
  'Character Bailu Portrait.png': '1004',
  'Character Black Swan Portrait.png': '1307',
  'Character Blade Portrait.png': '1205',
  'Character Boothill Portrait.png': '1407',
  'Character Bronya Portrait.png': '1102',
  'Character Castorice Portrait.png': '1503',
  'Character Castorice Gossamer Flutter Portrait.png': '1503b1',
  'Character Cerydra Portrait.png': '1501',
  'Character Cipher Portrait.png': '1401',
  'Character Clara Portrait.png': '1103',
  'Character Cyrene Portrait.png': '1412',
  'Character Dan Heng Portrait.png': '1003',
  'Character Dan Heng • Imbibitor Lunae Portrait.png': '1215',
  'Character Dan Heng • Permansor Terrae Portrait.png': '1403',
  'Character Dr. Ratio Portrait.png': '1314',
  'Character Evanescia Portrait.png': '1502',
  'Character Evanescia Lunar Blossoming Portrait.png': '1502b1',
  'Character Evernight Portrait.png': '1413',
  'Character Feixiao Portrait.png': '1402',
  'Character Firefly Portrait.png': '1317',
  'Character Firefly Spring Missive Portrait.png': '1317b1',
  'Character Fu Xuan Portrait.png': '1207',
  'Character Fugue Portrait.png': '1316',
  'Character Gallagher Portrait.png': '1310',
  'Character Gepard Portrait.png': '1005',
  'Character Gilgamesh Portrait.png': '1415',
  'Character Guinaifen Portrait.png': '1302',
  'Character Hanya Portrait.png': '1211',
  'Character Herta Portrait.png': '1007',
  'Character Himeko Portrait.png': '1001',
  'Character Himeko • Nova Portrait.png': '1507',
  'Character Hook Portrait.png': '1104',
  'Character Huohuo Portrait.png': '1217',
  'Character Hyacine Portrait.png': '1504',
  'Character Hyacine Warm Cotton Skies Portrait.png': '1504b1',
  'Character Hysilens Portrait.png': '1414',
  'Character Jade Portrait.png': '1404',
  'Character Jiaoqiu Portrait.png': '1411',
  'Character Jing Yuan Portrait.png': '1105',
  'Character Jingliu Portrait.png': '1203',
  'Character Kafka Portrait.png': '1112',
  'Character Lingsha Portrait.png': '1405',
  'Character Luka Portrait.png': '1202',
  'Character Luocha Portrait.png': '1108',
  'Character Lynx Portrait.png': '1206',
  'Character March 7th (Preservation) Portrait.png': '1001',
  'Character March 7th (The Hunt) Portrait.png': '1209',
  'Character March 7th (Preservation) Nascent Spring Portrait.png': '1001b1',
  'Character Misha Portrait.png': '1309',
  'Character Mortenax Blade Portrait.png': '1505',
  'Character Moze Portrait.png': '1313',
  'Character Mydei Portrait.png': '1508',
  'Character Natasha Portrait.png': '1009',
  'Character Pearl Portrait.png': '1506',
  'Character Pela Portrait.png': '1110',
  'Character Phainon Portrait.png': '1406',
  'Character Qingque Portrait.png': '1111',
  'Character Rappa Portrait.png': '1408',
  'Character Rin Tohsaka Portrait.png': '1508',
  'Character Robin Portrait.png': '1315',
  'Character Robin • Summeretto Portrait.png': '1508b1',
  'Character Ruan Mei Portrait.png': '1304',
  'Character Ruan Mei Plumblossom Letter Portrait.png': '1304b1',
  'Character Saber Portrait.png': '1008',
  'Character Sampo Portrait.png': '1106',
  'Character Seele Portrait.png': '1107',
  'Character Serval Portrait.png': '1010',
  'Character Silver Wolf Portrait.png': '1201',
  'Character Silver Wolf LV.999 Portrait.png': '1510',
  'Character Sparkle Portrait.png': '1306',
  'Character Sparxie Portrait.png': '1410',
  'Character Sparxie Candy-Coated Waves Portrait.png': '1410b1',
  'Character Sunday Portrait.png': '1409',
  'Character Sushang Portrait.png': '1109',
  'Character The Dahlia Portrait.png': '1410',
  'Character The Herta Portrait.png': '1411',
  'Character Tingyun Portrait.png': '1112',
  'Character Topaz and Numby Portrait.png': '1303',
  'Character Trailblazer (M) Destruction Portrait.png': '8001',
  'Character Trailblazer (M) Elation Portrait.png': '8009',
  'Character Trailblazer (M) Harmony Portrait.png': '8005',
  'Character Trailblazer (M) Preservation Portrait.png': '8003',
  'Character Trailblazer (M) Remembrance Portrait.png': '8007',
  'Character Trailblazer (M) Remembrance Portrait (Updated).png': '8007b1',
  'Character Trailblazer (F) Destruction Portrait.png': '8002',
  'Character Trailblazer (F) Elation Portrait.png': '8010',
  'Character Trailblazer (F) Harmony Portrait.png': '8006',
  'Character Trailblazer (F) Preservation Portrait.png': '8004',
  'Character Trailblazer (F) Remembrance Portrait.png': '8008',
  'Character Trailblazer (F) Remembrance Portrait (Updated).png': '8008b1',
  'Character Tribbie Portrait.png': '1511',
  'Character Welt Portrait.png': '1012',
  'Character Xueyi Portrait.png': '1210',
  'Character Yanqing Portrait.png': '1105',
  'Character Yao Guang Portrait.png': '1401',
  'Character Yukong Portrait.png': '1208',
  'Character Yunli Portrait.png': '1405',
};

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main(): Promise<void> {
  mkdirSync(PORTRAIT_DIR, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const [fandomName, avatarId] of Object.entries(FANDOM_TO_AVATAR)) {
    if (have.has(avatarId)) {
      skipped++;
      continue;
    }

    const fileName = `File:${encodeURIComponent(fandomName)}`;
    const apiUrl = `https://honkai-star-rail.fandom.com/api.php?action=query&titles=${fileName}&prop=imageinfo&iiprop=url&format=json`;

    try {
      console.log(`Fetching ${fandomName} -> ${avatarId}...`);
      
      const apiRes = await fetch(apiUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
      const apiData = await apiRes.json();
      
      const pages = apiData.query?.pages;
      if (!pages) {
        console.log(`  No pages for ${fandomName}`);
        failed++;
        continue;
      }

      let imageUrl: string | null = null;
      for (const page of Object.values(pages)) {
        if ((page as any).imageinfo?.[0]?.url) {
          imageUrl = (page as any).imageinfo[0].url;
          break;
        }
      }

      if (!imageUrl) {
        console.log(`  No image URL for ${fandomName}`);
        failed++;
        continue;
      }

      const pngBuf = await fetchBuffer(imageUrl);
      
      await sharp(pngBuf)
        .resize(376, 512, { fit: 'cover', position: 'center' })
        .webp({ quality: 85 })
        .toFile(join(PORTRAIT_DIR, `${avatarId}.webp`));

      console.log(`  Saved ${avatarId}.webp`);
      downloaded++;
      have.add(avatarId);

      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`  FAILED ${fandomName}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\nDone: downloaded ${downloaded}, skipped ${skipped}, failed ${failed}`);
  
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