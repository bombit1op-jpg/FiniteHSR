const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  // Check manifest for version
  const manifest = await fetch('https://static.nanoka.cc/manifest.json');
  const version = manifest.hsr.latest;
  console.log('Version:', version);
  
  // Check a regular character for icon structure
  const char = await fetch(`https://static.nanoka.cc/hsr/${version}/en/character/1001.json`);
  console.log('Character 1001 keys:', Object.keys(char));
  console.log('icon:', char.icon);
  console.log('portrait:', char.portrait);
  console.log('side_icon:', char.side_icon);
  console.log('avatar:', char.avatar);
  console.log('icon_key:', char.icon_key);
  console.log('relics:', JSON.stringify(char.relics, null, 2));
  
  // Check a Trailblazer character
  const tb = await fetch(`https://static.nanoka.cc/hsr/${version}/en/character/8001.json`);
  console.log('\nTrailblazer 8001 keys:', Object.keys(tb));
  console.log('icon:', tb.icon);
  console.log('portrait:', tb.portrait);
  console.log('side_icon:', tb.side_icon);
  console.log('avatar:', tb.avatar);
  console.log('icon_key:', tb.icon_key);
  console.log('relics:', JSON.stringify(tb.relics, null, 2));
}

main().catch(console.error);