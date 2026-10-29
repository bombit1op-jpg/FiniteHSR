function normalizeForMatch(s) {
  return s
    .replace(/<unbreak>/gi, '')
    .replace(/<\/unbreak>/gi, '')
    .replace(/:/g, '-')
    .replace(/[^\w\s\-+!]/g, '')
    .replace(/(\d)-(\s|[a-zA-Z]|$)/g, '$1$2')
    .replace(/-(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

const manifestNames = [
  'Aether Editing- Eidolon +1',
  'Basic ATK Is the New Ultimate',
  'I Came. I Saw. I One-Shot',
  'It\'s a Feature, Not a Bug',
  'Max Lv. 15- Says who-',
  'Solo Maxxing!'
]

const rankNames = [
  'Aether Editing: Eidolon +1',
  'It\'s a Feature, Not a Bug',
  'Max Lv. <unbreak>15</unbreak>? Says who?',
  'I Came. I Saw. I One-Shot.',
  'Basic ATK Is the New Ultimate',
  'Solo Maxxing!'
]

console.log('Manifest normalized:')
manifestNames.forEach(m => console.log('  ', normalizeForMatch(m)))

console.log('\nRank normalized:')
rankNames.forEach(r => console.log('  ', normalizeForMatch(r)))