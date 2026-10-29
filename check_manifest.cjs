const fs = require('fs');
const m = JSON.parse(fs.readFileSync('public/icons/_manifest.json', 'utf8'));
const abilities = m.abilities?.icons || [];
const names = [
  'Let the Storm Rage On',
  'That Smile Hits Different',
  'I Said "Elation," Did I Stutter?',
  'Make Some Noise'
];
for (const name of names) {
  const found = abilities.find(i => i.name === name);
  if (found) console.log('FOUND:', found);
  else console.log('NOT IN MANIFEST:', name);
}