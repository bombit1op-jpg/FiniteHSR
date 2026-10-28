const fs = require('fs');
const path = require('path');
const https = require('https');
const ROOT = process.cwd();
const ICON_DIR = path.join(ROOT, 'public', 'icons', 'characters');
const MANIFEST_PATH = path.join(ROOT, 'public', 'icons', '_manifest.json');
fs.mkdirSync(ICON_DIR, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
const existing = new Set(manifest.characters.icons.map(function(i){ return i.name; }));
const icons = fs.readFileSync('C:/temp/fandom_icons.txt', 'utf8').split('\n').filter(Boolean);
console.log('existing', existing.size, 'icons', icons.length);

const NAME_MAP = {
  'File:Character Acheron Icon.png': 'Acheron',
  'File:Character Aglaea Icon.png': 'Aglaea',
  'File:Character Anaxa Icon.png': 'Anaxa',
  'File:Character Archer Icon.png': 'Archer',
  'File:Character Argenti Icon.png': 'Argenti',
  'File:Character Arlan Icon.png': 'Arlan',
  'File:Character Ashveil Icon.png': 'Ashveil',
  'File:Character Asta Icon.png': 'Asta',
  'File:Character Aventurine Icon.png': 'Aventurine',
  'File:Character Aventurine • Waveflair Icon.png': 'Aventurine • Waveflair',
  'File:Character Bailu Icon.png': 'Bailu',
  'File:Character Black Swan Icon.png': 'Black Swan',
  'File:Character Blade Icon.png': 'Blade',
  'File:Character Boothill Icon.png': 'Boothill',
  'File:Character Bronya Icon.png': 'Bronya',
  'File:Character Caelus (Destruction) Icon.png': 'Trailblazer (Physical)',
  'File:Character Caelus (Harmony) Icon.png': 'Trailblazer (Harmony)',
  'File:Character Caelus (Preservation) Icon.png': 'Trailblazer (Fire)',
  'File:Character Caelus (Remembrance) Icon.png': 'Trailblazer (Remembrance)',
  'File:Character Castorice Icon.png': 'Castorice',
  'File:Character Cerydra Icon.png': 'Cerydra',
  'File:Character Cipher Icon.png': 'Cipher',
  'File:Character Clara Icon.png': 'Clara',
  'File:Character Cyrene Icon.png': 'Cyrene',
  'File:Character Dan Heng Icon.png': 'Dan Heng',
  'File:Character Dan Heng • Imbibitor Lunae Icon.png': 'Dan Heng • Imbibitor Lunae',
  'File:Character Dan Heng • Permansor Terrae Icon.png': 'Dan Heng • Permansor Terrae',
  'File:Character Dr. Ratio Icon.png': 'Dr. Ratio',
  'File:Character Evanescia Icon.png': 'Evanescia',
  'File:Character Evernight Icon.png': 'Evernight',
  'File:Character Feixiao Icon.png': 'Feixiao',
  'File:Character Firefly Icon.png': 'Firefly',
  'File:Character Fu Xuan Icon.png': 'Fu Xuan',
  'File:Character Fugue Icon.png': 'Fugue',
  'File:Character Gallagher Icon.png': 'Gallagher',
  'File:Character Gepard Icon.png': 'Gepard',
  'File:Character Gilgamesh Icon.png': 'Gilgamesh',
  'File:Character Guinaifen Icon.png': 'Guinaifen',
  'File:Character Hanya Icon.png': 'Hanya',
  'File:Character Herta Icon.png': 'Herta',
  'File:Character Himeko Icon.png': 'Himeko',
  'File:Character Himeko • Nova Icon.png': 'Himeko • Nova',
  'File:Character Hook Icon.png': 'Hook',
  'File:Character Huohuo Icon.png': 'Huohuo',
  'File:Character Hyacine Icon.png': 'Hyacine',
  'File:Character Hysilens Icon.png': 'Hysilens',
  'File:Character Jade Icon.png': 'Jade',
  'File:Character Jiaoqiu Icon.png': 'Jiaoqiu',
  'File:Character Jing Yuan Icon.png': 'Jing Yuan',
  'File:Character Jingliu Icon.png': 'Jingliu',
  'File:Character Kafka Icon.png': 'Kafka',
  'File:Character Lingsha Icon.png': 'Lingsha',
  'File:Character Luka Icon.png': 'Luka',
  'File:Character Luocha Icon.png': 'Luocha',
  'File:Character Lynx Icon.png': 'Lynx',
  'File:Character March 7th (The Hunt) Icon.png': 'March 7th',
  'File:Character March 7th Icon.png': 'March 7th',
  'File:Character Misha Icon.png': 'Misha',
  'File:Character Mortenax Blade Icon.png': 'Mortenax Blade',
  'File:Character Moze Icon.png': 'Moze',
  'File:Character Mydei Icon.png': 'Mydei',
  'File:Character Natasha Icon.png': 'Natasha',
  'File:Character Pearl Icon.png': 'Pearl',
  'File:Character Pela Icon.png': 'Pela',
  'File:Character Phainon Icon.png': 'Phainon',
  'File:Character Qingque Icon.png': 'Qingque',
  'File:Character Rappa Icon.png': 'Rappa',
  'File:Character Rin Tohsaka Icon.png': 'Rin Tohsaka',
  'File:Character Robin Icon.png': 'Robin',
  'File:Character Robin • Summeretto Icon.png': 'Robin • Summeretto',
  'File:Character Ruan Mei Icon.png': 'Ruan Mei',
  'File:Character Saber Icon.png': 'Saber',
  'File:Character Sampo Icon.png': 'Sampo',
  'File:Character Seele Icon.png': 'Seele',
  'File:Character Serval Icon.png': 'Serval',
  'File:Character Silver Wolf Icon.png': 'Silver Wolf',
  'File:Character Silver Wolf LV.999 Icon.png': 'Silver Wolf LV.999',
  'File:Character Sparkle Icon.png': 'Sparkle',
  'File:Character Sparxie Icon.png': 'Sparxie',
  'File:Character Stelle (Destruction) Icon.png': 'Trailblazer (Physical)',
  'File:Character Stelle (Harmony) Icon.png': 'Trailblazer (Harmony)',
  'File:Character Stelle (Preservation) Icon.png': 'Trailblazer (Fire)',
  'File:Character Stelle (Remembrance) Icon.png': 'Trailblazer (Remembrance)',
  'File:Character Sunday Icon.png': 'Sunday',
  'File:Character Sushang Icon.png': 'Sushang',
  'File:Character The Dahlia Icon.png': 'The Dahlia',
  'File:Character The Herta Icon.png': 'The Herta',
  'File:Character Tingyun Icon.png': 'Tingyun',
  'File:Character Topaz & Numby Icon.png': 'Topaz & Numby',
  'File:Character Trailblazer (Destruction) Icon.png': 'Trailblazer (Physical)',
  'File:Character Trailblazer (Elation) Icon.png': 'Trailblazer (Elation)',
  'File:Character Trailblazer (Harmony) Icon.png': 'Trailblazer (Harmony)',
  'File:Character Trailblazer (Preservation) Icon.png': 'Trailblazer (Fire)',
  'File:Character Trailblazer (Remembrance) Icon.png': 'Trailblazer (Remembrance)',
  'File:Character Tribbie Icon.png': 'Tribbie',
  'File:Character Welt Icon.png': 'Welt',
  'File:Character Xueyi Icon.png': 'Xueyi',
  'File:Character Yanqing Icon.png': 'Yanqing',
  'File:Character Yao Guang Icon.png': 'Yao Guang',
  'File:Character Yukong Icon.png': 'Yukong',
  'File:Character Yunli Icon.png': 'Yunli'
};

function fetchImageUrl(title) {
  return new Promise(function(resolve, reject) {
    var t = 'File:' + encodeURIComponent(title.replace('File:', ''));
    var url = 'https://honkai-star-rail.fandom.com/api.php?action=query&titles=' + t + '&prop=imageinfo&iiprop=url&format=json';
    https.get(url, { headers: { 'User-Agent': 'FiniteHSR' } }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() {
        try {
          var j = JSON.parse(d);
          var pages = j.query && j.query.pages ? j.query.pages : {};
          for (var k in pages) {
            if (pages[k].imageinfo && pages[k].imageinfo[0] && pages[k].imageinfo[0].url) {
              resolve(pages[k].imageinfo[0].url);
              return;
            }
          }
          resolve(null);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise(function(resolve, reject) {
    https.get(url, { headers: { 'User-Agent': 'FiniteHSR' } }, function(res) {
      var chunks = [];
      res.on('data', function(c) { chunks.push(c); });
      res.on('end', function() {
        fs.writeFileSync(dest, Buffer.concat(chunks));
        resolve();
      });
    }).on('error', reject);
  });
}

async function main() {
  var added = 0;
  for (var i = 0; i < icons.length; i++) {
    var line = icons[i];
    var name = NAME_MAP[line];
    if (!name) { continue; }
    var file = path.join(ICON_DIR, name + '.png');
    if (fs.existsSync(file)) { continue; }
    try {
      var url = await fetchImageUrl(line);
      if (!url) { console.log('NO URL', name); continue; }
      console.log('DOWN', name);
      await download(url, file);
      if (!existing.has(name)) {
        manifest.characters.icons.push({ file: 'characters/' + name + '.png', name: name });
        existing.add(name);
        added++;
      }
    } catch(e) { console.log('ERR', name, e.message); }
    await new Promise(function(r) { setTimeout(r, 150); });
  }
  manifest.characters.icons.sort(function(a,b) { return a.name.localeCompare(b.name); });
  manifest.characters.count = manifest.characters.icons.length;
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('ADDED', added, 'TOTAL', manifest.characters.icons.length);
}
main();
