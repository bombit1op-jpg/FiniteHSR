const fs = require('fs');
const path = require('path');
const fetch = global.fetch || require('node-fetch');

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  return Buffer.from(await res.arrayBuffer());
}

async function getImageUrl(title) {
  try {
    const encodedTitle = encodeURIComponent(title);
    const res = await fetch('https://honkai-star-rail.fandom.com/api.php?action=query&titles=' + encodedTitle + '&prop=imageinfo&iiprop=url&format=json');
    const data = await res.json();
    const pages = data.query?.pages;
    if (pages) {
      for (const p of Object.values(pages)) {
        if (p.imageinfo?.[0]?.url) {
          return p.imageinfo[0].url;
        }
      }
    }
  } catch (e) {
    console.error('  Failed to get URL for ' + title + ': ' + (e instanceof Error ? e.message : e));
  }
  return null;
}

async function downloadImage(title, destPath) {
  if (fs.existsSync(destPath)) {
    console.log('  ' + path.basename(destPath) + ' already exists, skipping');
    return true;
  }

  const url = await getImageUrl(title);
  if (!url) {
    console.error('  FAILED to get URL for ' + title);
    return false;
  }

  try {
    console.log('  Fetching ' + title + '...');
    const pngBuf = await fetchBuffer(url);
    fs.writeFileSync(destPath, pngBuf);
    console.log('  Saved ' + path.basename(destPath));
    return true;
  } catch (e) {
    console.error('  FAILED ' + title + ': ' + (e instanceof Error ? e.message : e));
    return false;
  }
}

async function fetchCategoryImages(category) {
  const results = [];
  let continueToken = null;

  do {
    const listUrl = 'https://honkai-star-rail.fandom.com/api.php?action=query&list=categorymembers&cmtitle=Category:' + encodeURIComponent(category) + '&cmlimit=100&format=json' + (continueToken ? '&cmcontinue=' + encodeURIComponent(continueToken) : '');
    const res = await fetch(listUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
    const data = await res.json();

    if (data.query?.categorymembers) {
      for (const page of data.query.categorymembers) {
        if (page.title.startsWith('File:') && page.title.endsWith('.png')) {
          const imgUrl = 'https://honkai-star-rail.fandom.com/api.php?action=query&titles=' + encodeURIComponent(page.title) + '&prop=imageinfo&iiprop=url&format=json';
          const imgRes = await fetch(imgUrl, { headers: { 'User-Agent': 'FiniteHSR/1.0' } });
          const imgData = await imgRes.json();
          const pages = imgData.query?.pages;
          if (pages) {
            for (const p of Object.values(pages)) {
              if (p.imageinfo?.[0]?.url) {
                results.push({ title: page.title, url: p.imageinfo[0].url });
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

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function sanitizePath(name) {
  return name
    .replace(/<unbreak>/gi, '')
    .replace(/<\/unbreak>/gi, '')
    .replace(/[\\/:*?"<>|]/g, '_');
}

async function downloadCharacterEidolons(displayName, data) {
  const safeCharName = displayName.replace(/[\\/:*?"<>|]/g, '_');
  const dir = path.join('C:\\.projects\\FiniteHSR\\public\\icons\\eidolons', safeCharName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  console.log('\n' + displayName + ' (' + data.category + '):');

  const images = await fetchCategoryImages(data.category);
  console.log('  Found ' + images.length + ' files in category');

  for (const eidolonName of data.eidolons) {
    const fandomName = data.fandomNameMap ? data.fandomNameMap[eidolonName] : eidolonName;
    const fileName = sanitize(fandomName) + '.png';
    const destPath = path.join('C:\\.projects\\FiniteHSR\\public\\icons\\eidolons', safeCharName, fileName);

    if (fs.existsSync(destPath)) {
      console.log('  ' + eidolonName + ' already exists, skipping');
      continue;
    }

    const matchingImage = images.find(img =>
      img.title.toLowerCase() === 'file:' + fileName.toLowerCase() ||
      img.title.toLowerCase() === 'file:eidolon ' + fileName.toLowerCase()
    );

    if (matchingImage) {
      await downloadImage(matchingImage.title, destPath);
    } else {
      console.error('  MISSING: ' + eidolonName + ' (expected ' + fileName + ') not found in category');
    }
  }
}

function sanitize(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}

function sanitizePath(name) {
  return name
    .replace(/<unbreak>/gi, '')
    .replace(/<\/unbreak>/gi, '')
    .replace(/[\\/:*?"<>|]/g, '_');
}

async function main() {
  const targetChar = process.argv[2];

  const characters = {
    'Argenti': {
      category: 'Argenti_Eidolon_Icons',
      eidolons: ['A Lacuna in Kingdom of Aesthetics', 'Agate\'s Humility', 'Snow, From Somewhere in Cosmos', 'Thorny Road\'s Glory', 'Trumpet\'s Dedication', 'Your Resplendence']
    },
    'Aventurine • Waveflair': {
      category: 'Aventurine_•_Waveflair_Eidolon_Icons',
      eidolons: ['A Holiday on the Line', 'Idle as the Turning Tide', 'Into the Eye of the Jackpot', 'Sunlight Runs No Tab', 'The Past in Fast Lane', 'A Rendezvous Served Chilled']
    },
    'Cipher': {
      category: 'Cipher_Eidolon_Icons',
      eidolons: ['From Thin Air, Hard to Foresee', 'In the Fray, Nab On a Spree', 'Read the Room, Seek the Glee', 'The Jig Is Up, Quick to Flee', 'Safe in Numbers, Light as a Bee', 'The Thief\'s Game, Unsung and Free']
    },
    'Cyrene': {
      category: 'Cyrene_Eidolon_Icons',
      eidolons: ['A Tomorrow in Thirteen Shades', 'By Thy Being, As I\'ve Written', 'Epics, Born on a Blank Slate', 'Please Write On, With a Smile', 'Gaze, Steeped in Yesterbloom', 'Remembrance, Sung in Ripples ♪']
    },
    'Evanescia': {
      category: 'Evanescia_Eidolon_Icons',
      eidolons: ['Arcadia- A Glimpse of Fates', 'Blade- A Feast on Evils', 'Home- A Prayer in Dance', 'Maiden- A Step into Dreams', 'Meadow- A Ruin by Vice', 'Voyage- A Wish for Everbloom']
    },
    'Feixiao': {
      category: 'Feixiao_Eidolon_Icons',
      eidolons: ['Heavenward I Leap', 'Homeward I Near', 'Moonward I Wish', 'Skyward I Quell', 'Starward I Bode', 'Stormward I Hear']
    },
    'Fu Xuan': {
      category: 'Fu_Xuan_Eidolon_Icons',
      eidolons: ['Apex Nexus', 'Arbiter Primus', 'Dominus Pacis', 'Fortuna Stellaris', 'Arbiter Primus', 'Omnia Vita', 'Optimus Felix']
    },
    'Gilgamesh': {
      category: 'Gilgamesh_Eidolon_Icons',
      eidolons: ['He Who Saw the Deep', 'Journey That Spanned Far', 'King Who Bowed to None', 'Sword That Parted Gods from Man', 'Soul That Bore Friendship', 'Wisdom That Encompassed All']
    },
    'Himeko • Nova': {
      category: 'Himeko_•_Nova_Eidolon_Icons',
      eidolons: ['Let No Skyward Hand Stay Unheld', 'Ours Is the Oath to Sail Starward', 'That Which We Stride Is the Trailblaze', 'The Colors We Never Strike', 'To Cross the Cosmos and Beyond', 'We Who Are Starborn Muse Starward']
    },
    'Jade': {
      category: 'Jade_Eidolon_Icons',
      eidolons: ['Altruism- Nevertheless Tradable', 'Equity- Pending Sponsorship', 'Honesty- Soon Mortgaged', 'Hope- Hitherto Forfeited', 'Morality- Herein Authenticated', 'Sincerity- Put Option Only']
    },
    'Kafka': {
      category: 'Kafka_Eidolon_Icons',
      eidolons: ['Capriccio', 'Da Capo', 'Doloroso', 'Fortississimo', 'Leggiero', 'Recitativo']
    },
    'Lingsha': {
      category: 'Lingsha_Eidolon_Icons',
      eidolons: ['Arcadia Under Deep Seclusion', 'Bloom on Vileward Bouquet', 'Leisure in Carmine Smokeveil', 'Poise Atop Twists and Turns', 'Redolence from Canopied Banquet', 'Shine of Floral Wick']
    },
    'Mortenax Blade': {
      category: 'Mortenax_Blade_Eidolon_Icons',
      eidolons: ['Across the Shore, Wrath Laid Bare', 'Ash Was My Heart, Yet the Flame Stayed', 'Ere My Death, I Stood Unmade', 'I Severed My Woes, Knowing Death Begets Life', 'If Immortality Could Die, I Swore THEM Slain', 'Odium I\'ve Smitten, Thence Came the Blade']
    },
    'Moze': {
      category: 'Moze_Eidolon_Icons',
      eidolons: ['Deathchaser', 'Faithbinder', 'Heathprowler', 'Oathkeeper', 'Truthbender', 'Wrathbearer']
    },
    'Pearl': {
      category: 'Pearl_Eidolon_Icons',
      eidolons: ['Compute Life From One Shell', 'Crop That Dappled Dawn', 'Nestle That Pearl in Uninked Tides', 'Render Those Starlit Swirls', 'Sketch That Suspended Wave', 'Study That Veiled Smile']
    },
    'Rin Tohsaka': {
      category: 'Rin_Tohsaka_Eidolon_Icons',
      eidolons: ['Dimensional Traveler', 'Goddess of Venus\'s Favor', 'Holy Grail War- Victory Memorial', 'Nailed It This Time!', 'Red Devil- Triple Speed', 'Zelretch\'s Apprentice']
    },
    'Silver Wolf LV.999': {
      category: 'Silver_Wolf_LV.999_Eidolon_Icons',
      eidolons: ['Aether Editing- Eidolon +1', 'Basic ATK Is the New Ultimate', 'I Came. I Saw. I One-Shot', 'It\'s a Feature, Not a Bug', 'Max Lv. <unbreak>15</unbreak>? Says who?', 'Solo Maxxing!']
    },
    'Sparxie': {
      category: 'Sparxie_Eidolon_Icons',
      eidolons: ['AudienceKnows', 'BuiltDifferent #GoingExtinct', 'GoingViral #WhoIsShe', 'HealingTheWorld #GoodVibesOnly', 'LockedIn #FaceCard', 'HealingTheWorld #GoodVibesOnly']
    },
    'Yao Guang': {
      category: 'Yao_Guang_Eidolon_Icons',
      eidolons: ['Blind Arrows Guided by Feathers', 'Chuckle Chimes Where Jade Falls', 'Auspices Mirrored In Decalight', 'Threads of Fate Colored by Plumes', 'Bejeweled in Radiant Grace', 'Ferried Along the Astral Arc']
    },
    'Moze': {
      category: 'Moze_Eidolon_Icons',
      eidolons: ['Deathchaser', 'Faithbinder', 'Heathprowler', 'Oathkeeper', 'Truthbender', 'Wrathbearer']
    },
    'Sparxie': {
      category: 'Sparxie_Eidolon_Icons',
      eidolons: ['AudienceKnows', 'BuiltDifferent #GoingExtinct', 'GoingViral #WhoIsShe', 'HealingTheWorld #GoodVibesOnly', 'LockedIn #FaceCard', 'HealingTheWorld #GoodVibesOnly']
    },
    'Yao Guang': {
      category: 'Yao_Guang_Eidolon_Icons',
      eidolons: ['Auspices Mirrored In Decalight', 'Blind Arrows Guided by Feathers', 'Chuckle Chimes Where Jade Falls', 'Ferried Along the Astral Arc', 'Bejeweled in Radiant Grace', 'Ferried Along the Astral Arc']
    }
  };


  console.log('=== Downloading eidolon icons from Fandom ===');

  let downloaded = 0;
  let failed = 0;

  for (const [displayName, data] of Object.entries(characters)) {
    if (targetChar && displayName !== targetChar) continue;

    try {
      await downloadCharacterEidolons(displayName, data);
      downloaded++;
    } catch (e) {
      console.error('Failed ' + displayName + ': ' + (e instanceof Error ? e.message : e));
      failed++;
    }
  }

  // Update manifest
  console.log('\nUpdating _manifest.json...');
  const manifest = JSON.parse(fs.readFileSync('C:\\.projects\\FiniteHSR\\public\\icons\\_manifest.json', 'utf8'));
  manifest.eidolons.icons = [];

  const chars = fs.readdirSync('C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\eidolons');
  for (const charName of chars) {
    const charDir = path.join('C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\eidolons', charName);
    if (!fs.existsSync(charDir)) continue;

    const files = fs.readdirSync(charDir);
    for (const file of files) {
      if (!file.endsWith('.png')) continue;

      const eidolonName = file.replace('.png', '');
      const relativePath = 'eidolons/' + charName + '/' + file;

      const existing = manifest.eidolons.icons.find(i => i.file === 'eidolons/' + charName + '/' + file);
      if (!existing) {
        manifest.eidolons.icons.push({
          file: 'eidolons/' + charName + '/' + file,
          name: file.replace('.png', ''),
          character: charName
        });
      }
    }
  }

  manifest.eidolons.count = manifest.eidolons.icons.length;
  fs.writeFileSync('C:\\\\.projects\\\\FiniteHSR\\\\public\\\\icons\\\\_manifest.json', JSON.stringify(manifest, null, 2));
  console.log('Manifest updated with ' + manifest.eidolons.count + ' eidolon icons');

  console.log('\n=== Summary ===');
  console.log('Downloaded: ' + downloaded + ', Failed: ' + failed);
  console.log('Total eidolon icons in manifest: ' + manifest.eidolons.count);
}

main().catch(e => { console.error(e); process.exit(1); });