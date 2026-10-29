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

async function main() {
  const characters = {
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
    }
  };

  for (const [displayName, data] of Object.entries(characters)) {
    try {
      await downloadCharacterEidolons(displayName, data);
      console.log('Completed ' + displayName);
    } catch (e) {
      console.error('Failed ' + displayName + ': ' + (e instanceof Error ? e.message : e));
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

  console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });