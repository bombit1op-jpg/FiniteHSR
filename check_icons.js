const names = [
  'Let the Storm Rage On',
  'That Smile Hits Different',
  'I Said "Elation," Did I Stutter?',
  'Make Some Noise'
];

async function checkIcon(name) {
  const title = 'File:Ability ' + encodeURIComponent(name) + '.png';
  const url = 'https://honkai-star-rail.fandom.com/api.php?action=query&titles=' + encodeURIComponent('File:Ability ' + name + '.png') + '&prop=imageinfo&iiprop=url&format=json';
  try {
    const res = await fetch('https://honkai-star-rail.fandom.com/api.php?action=query&titles=File:Ability%20' + encodeURIComponent(name) + '.png&prop=imageinfo&iiprop=url&format=json');
    const data = await res.json();
    const pages = data.query?.pages;
    if (pages) {
      for (const p of Object.values(pages)) {
        if (p.imageinfo?.[0]?.url) {
          console.log('FOUND:', name, '->', p.imageinfo[0].url);
          return true;
        }
      }
    }
    console.log('NOT FOUND:', name);
    return false;
  } catch (e) {
    console.log('ERROR:', name, e.message);
    return false;
  }
}

async function main() {
  for (const name of names) {
    await checkIcon(name);
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(e => console.error(e));