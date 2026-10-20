// One-off generator: imports Fribbels (hsr-optimizer) per-character gear preferences
// into src/core/gearPrefs.ts, mapped to our kit slugs by character name (+ path for Trailblazer).
//
// Produces, per kit slug:
//   - signature: our light-cone id the character is designed around (defaultLightCone)
//   - relics / ornaments: recommended set ids, in Fribbels priority order (best first)
//
// Source of truth: reference/hsr-optimizer-main/src/lib/conditionals/character/**/*.ts
// Run: npx tsx src/core/gen-gear-prefs.ts
import fs from 'node:fs'
import path from 'node:path'
import { KITS } from './kits/index'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from './gear'

const REF = path.join('reference', 'hsr-optimizer-main')
const GD = path.join(REF, 'src', 'data', 'game_data.json')
const CHAR_DIR = path.join(REF, 'src', 'lib', 'conditionals', 'character')
const LC_DIR = path.join(REF, 'src', 'lib', 'conditionals', 'lightcone')
const SETS_CONST = path.join(REF, 'src', 'lib', 'constants', 'constants.ts')
const SPREAD_CONST = path.join(REF, 'src', 'lib', 'scoring', 'scoringConstants.ts')
const OUT = path.join('src', 'core', 'gearPrefs.ts')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) out.push(...walk(p))
    else if (f.endsWith('.ts') && !f.includes('.test.')) out.push(p)
  }
  return out
}

// ---------- Fribbels Sets map: key -> display name ----------
function loadSetsMap(): Record<string, string> {
  const src = fs.readFileSync(SETS_CONST, 'utf8')
  const block = src.match(/export const Sets = \{([\s\S]*?)\n\} as const/)
  if (!block) throw new Error('Sets block not found in constants.ts')
  const map: Record<string, string> = {}
  for (const m of block[1].matchAll(/(\w+):\s*'((?:[^'\\]|\\.)*)'/g)) {
    map[m[1]] = m[2].replace(/\\'/g, "'")
  }
  return map
}

// ---------- Spread constants: name -> flat list of Sets.X keys ----------
function loadSpreads(): Record<string, string[]> {
  const src = fs.readFileSync(SPREAD_CONST, 'utf8')
  const spreads: Record<string, string[]> = {}
  // Two passes so a spread may reference an earlier spread (e.g. HEAL includes SUPPORT).
  for (let pass = 0; pass < 2; pass++) {
    for (const m of src.matchAll(/export const (\w+) = \[([\s\S]*?)\n\]/g)) {
      const name = m[1]
      const body = m[2]
      const keys: string[] = []
      for (const s of body.matchAll(/Sets\.(\w+)/g)) keys.push(s[1])
      for (const s of body.matchAll(/\.\.\.(\w+)/g)) {
        if (spreads[s[1]]) keys.push(...spreads[s[1]])
      }
      spreads[name] = keys
    }
  }
  return spreads
}

const setsMap = loadSetsMap()
const spreads = loadSpreads()
const setName = (key: string): string | undefined => setsMap[key]

// ---------- Light-cone alias -> reference name (via id) ----------
const gd = JSON.parse(fs.readFileSync(GD, 'utf8')) as {
  characters: Record<string, { name: string; path?: string }>
  lightCones: Record<string, { name: string }>
}
const lcNameById: Record<string, string> = {}
for (const [id, c] of Object.entries(gd.lightCones)) lcNameById[id] = c.name

const aliasToName: Record<string, string> = {}
for (const fp of walk(LC_DIR)) {
  const src = fs.readFileSync(fp, 'utf8')
  // export const <Alias>: LightConeConfig = { id: '<id>', ...
  for (const m of src.matchAll(/export const (\w+)(?::\s*LightConeConfig)?\s*=\s*\{\s*\n?\s*id:\s*'(\d+)'/g)) {
    const nm = lcNameById[m[2]]
    if (nm) aliasToName[m[1]] = nm
  }
}

// ---------- Reference set names -> our ids ----------
const refSetToOurs = new Map<string, string>()
for (const s of [...RELIC_SETS, ...PLANAR_SETS]) refSetToOurs.set(norm(s.name), s.id)

const refConeToOurs = new Map<string, string>()
for (const c of LIGHT_CONES) refConeToOurs.set(norm(c.name), c.id)

// ---------- Parse a character config ----------
function extractSets(src: string, field: string): string[] {
  // Search every simulation-like block for `<field>: [ ... ]`
  const out: string[] = []
  const seen = new Set<string>()
  for (const block of src.matchAll(/relicSets\s*:\s*\[([\s\S]*?)\n\s*\]|ornamentSets\s*:\s*\[([\s\S]*?)\n\s*\]/g)) {
    const body = block[1] ?? block[2] ?? ''
    const isRelic = block[1] != null
    if ((field === 'relicSets') !== isRelic) continue
    for (const s of body.matchAll(/Sets\.(\w+)/g)) {
      const nm = setName(s[1])
      if (!nm) continue
      const ours = refSetToOurs.get(norm(nm))
      if (ours && !seen.has(ours)) { seen.add(ours); out.push(ours) }
    }
    for (const s of body.matchAll(/\.\.\.(\w+)/g)) {
      for (const key of spreads[s[1]] ?? []) {
        const nm = setName(key)
        if (!nm) continue
        const ours = refSetToOurs.get(norm(nm))
        if (ours && !seen.has(ours)) { seen.add(ours); out.push(ours) }
      }
    }
  }
  return out
}

type Abs = { id: string; name: string; path: string; signature?: string; relics: string[]; ornaments: string[] }

const abstracts: Abs[] = []
for (const fp of walk(CHAR_DIR)) {
  const src = fs.readFileSync(fp, 'utf8')
  const idm = src.match(/\bid:\s*'(\d+)'/)
  if (!idm) continue // skip *B1 variants
  const id = idm[1]
  const meta = gd.characters[id]
  if (!meta) continue

  const sigAlias = src.match(/defaultLightCone:\s*(\w+)\.id/)
  const sigName = sigAlias ? aliasToName[sigAlias[1]] : undefined
  const signature = sigName ? refConeToOurs.get(norm(sigName)) : undefined

  abstracts.push({
    id, name: meta.name, path: meta.path ?? '',
    signature,
    relics: extractSets(src, 'relicSets'),
    ornaments: extractSets(src, 'ornamentSets'),
  })
}

// ---------- Map reference character -> our slug (same rules as gen-relic-weights) ----------
const slugName: Record<string, string> = {}
for (const k of KITS) slugName[k.id] = k.name
const byName = new Map<string, string>()
for (const slug of Object.keys(slugName)) byName.set(norm(slugName[slug]), slug)

const NAME_PATH_TO_SLUG: Record<string, Record<string, string>> = {
  march7th: { Preservation: 'march7th', Hunt: 'march7th_the_hunt' },
}

const result: Record<string, Abs> = {}
const unmatched: string[] = []
for (const a of abstracts) {
  let slug: string | undefined
  if (norm(a.name) === 'trailblazer') {
    slug = `trailblazer_${a.path.toLowerCase()}`
    if (!slugName[slug]) slug = undefined
  } else {
    const key = norm(a.name)
    slug = NAME_PATH_TO_SLUG[key]?.[a.path] ?? byName.get(key)
  }
  if (!slug) { unmatched.push(`${a.id}=${a.name}${a.path ? ' (' + a.path + ')' : ''}`); continue }
  result[slug] = a
}

const slugs = Object.keys(result).sort()
const lines: string[] = []
lines.push('// AUTO-GENERATED by src/core/gen-gear-prefs.ts — do not hand-edit.')
lines.push('// Per-character gear preferences imported from Fribbels hsr-optimizer')
lines.push('// (reference/hsr-optimizer-main, defaultLightCone + relicSets/ornamentSets).')
lines.push('// signature = our light-cone id; relics/ornaments = our set ids in priority order (best first).')
lines.push('')
lines.push('export type GearPref = {')
lines.push('  signature?: string')
lines.push('  relics: string[]')
lines.push('  ornaments: string[]')
lines.push('}')
lines.push('')
lines.push('export const GEAR_PREFS: Record<string, GearPref> = {')
for (const slug of slugs) {
  const a = result[slug]
  const arr = (x: string[]) => `[${x.map(v => JSON.stringify(v)).join(', ')}]`
  const sig = a.signature ? `, signature: ${JSON.stringify(a.signature)}` : ''
  lines.push(`  ${slug}: { relics: ${arr(a.relics)}, ornaments: ${arr(a.ornaments)}${sig} },`)
}
lines.push('}')
lines.push('')
fs.writeFileSync(OUT, lines.join('\n'))

const withSig = slugs.filter(s => result[s].signature).length
const withRelics = slugs.filter(s => result[s].relics.length).length
const withOrn = slugs.filter(s => result[s].ornaments.length).length
console.log(`abstracts=${abstracts.length} matched=${slugs.length} unmatched=${unmatched.length}`)
console.log(`signature=${withSig} relics=${withRelics} ornaments=${withOrn}`)
if (unmatched.length) console.log('UNMATCHED:\n' + unmatched.join('\n'))
