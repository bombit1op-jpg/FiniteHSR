const fs = require('fs');
const c = fs.readFileSync('src/ui/iconManifest.ts', 'utf8');

const chars = [
  'Silver Wolf', 
  'Silver Wolf LV.999', 
  'March 7th', 
  'March 7th • The Hunt', 
  'Trailblazer (Physical)', 
  'Trailblazer (Fire)', 
  'Trailblazer (Harmony)', 
  'Trailblazer (Remembrance)', 
  'Trailblazer (Elation)', 
  'Silver Wolf LV.999',
  'March 7th • The Hunt', 
  'Pearl'
];

chars.forEach(name => {
  const idx = c.indexOf('"' + name + '"', c.indexOf('EIDOLON_ICONS'));
  if (idx >= 0) {
    console.log(name, ': FOUND in EIDOLON_ICONS');
  } else {
    console.log(name, ': MISSING from EIDOLON_ICONS');
  }
});