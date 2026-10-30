const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = 'C:\\.projects\\FiniteHSR';
const EIDOLON_DIR = path.join(ROOT, 'public', 'icons', 'eidolons');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');

const SPECIAL_AVATAR = {
  'March 7th': 1001,
  'March 7th • The Hunt': 1224,
  'Mortenax': 1507,
  'Himeko Nova': 1510,
  'Silver Wolf LV.999': 1506,
  'Trailblazer (Destruction)': 8001,
  'Trailblazer (Preservation)': 8003,
  'Trailblazer (Harmony)': 8005,
  'Trailblazer (Remembrance)': 8007,
  'Trailblazer (Elation)': 8009,
};

const chars = JSON.parse(fs.readFileSync(path.join(ROOT, 'hsr-data', 'characters.json'), 'utf8'));
const ranksByAvatar = {};
const avatarByName = {};
for (const c of chars) {
  const id = c.relics?.avatar_id;
  if (!id || !c.ranks) continue;
  ranksByAvatar[id] = Object.values(c.ranks).map(r => r.name);
  if (c.name && c.name !== '{NICKNAME}') {
    const name = c.name === 'Silver Wolf LV.<unbreak>999</unbreak>' ? 'Silver Wolf LV.999' : c.name;
    avatarByName[name] = id;
  }
}

function sanitize(name) {
  return name
    .replace(/<\/?unbreak>/gi, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}

function get(url, depth = 0) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && depth < 5) {
        res.resume();
        const loc = res.headers.location.startsWith('http') ? res.headers.location : 'https://hsr.gachabase.net' + res.headers.location;
        return resolve(get(loc, depth + 1));
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    }).on('error', e => resolve({ status: 'ERR', body: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 'TIMEOUT', body: '' }); });
  });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'Referer': 'https://hsr.gachabase.net/' } }, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      } else {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error('HTTP ' + res.statusCode));
      }
    }).on('error', (e) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(e);
    });
    req.setTimeout(30000, () => { req.destroy(); file.close(); fs.unlink(dest, () => {}); reject(new Error('Timeout')); });
  });
}

// Small eidolon icons live inside `<section id="eidolon-N">` as
// `data-preview-group="eidolon-icons"`. Pair each icon with the nearest
// PRECEDING section id so E1..E6 stay aligned.
function extractEidolonIcons(body) {
  const out = {};
  const re = /<img[^>]*data-preview-group="eidolon-icons"[^>]*>/g;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[0];
    const src = (tag.match(/data-preview-src="([^"]+)"/) || [])[1];
    if (!src) continue;
    const before = body.slice(0, m.index);
    const secs = [...before.matchAll(/id="eidolon-(\d+)"/g)];
    if (!secs.length) continue;
    const n = Number(secs[secs.length - 1][1]);
    if (!out[n]) out[n] = src;
  }
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const only = process.argv.slice(2);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const folders = [...new Set(manifest.eidolons.icons.map(e => e.character))]
    .filter(name => only.length === 0 || only.includes(name));

  const newEntries = [];
  const problems = [];

  for (const folder of folders) {
    const avatarId = SPECIAL_AVATAR[folder] ?? avatarByName[folder];
    const rankNames = avatarId ? ranksByAvatar[avatarId] : null;
    if (!avatarId || !rankNames || rankNames.length < 6) {
      problems.push(`${folder}: no avatar/ranks (avatar=${avatarId}, ranks=${rankNames?.length ?? 0})`);
      continue;
    }

    let urls = {};
    let status = 0;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const page = await get(`https://hsr.gachabase.net/characters/${avatarId}/x/beta?lang=en`);
      status = page.status;
      urls = extractEidolonIcons(page.body);
      if (Object.keys(urls).length === 6) break;
      await sleep(1500 * attempt);
    }
    if (Object.keys(urls).length !== 6) {
      problems.push(`${folder}: icons=${Object.keys(urls).length} (status ${status})`);
      continue;
    }

    const dir = path.join(EIDOLON_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));

    const labels = [];
    for (let n = 1; n <= 6; n++) {
      const rankName = rankNames[n - 1];
      const safe = sanitize(rankName);
      const fileName = `E${n}_${safe}.png`;
      const dest = path.join(dir, fileName);
      let ok = false;
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        try {
          await download(urls[n], dest);
          ok = true;
        } catch (e) {
          if (attempt === 3) problems.push(`${folder} E${n}: ${e.message}`);
          await sleep(1000 * attempt);
        }
      }
      if (ok) {
        newEntries.push({ file: `eidolons/${folder}/${fileName}`, name: rankName, character: folder });
        labels.push(`E${n}=${rankName}`);
      }
      await sleep(150);
    }

    console.log(`OK ${folder} (${avatarId}) :: ${labels.join(' | ')}`);
    await sleep(700);
  }

  const processed = new Set(newEntries.map(e => e.character));
  const kept = manifest.eidolons.icons.filter(e => !processed.has(e.character));
  manifest.eidolons.icons = kept.concat(newEntries);
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`\nentries=${newEntries.length} chars=${processed.size}`);
  if (problems.length) console.log('PROBLEMS:\n' + problems.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });