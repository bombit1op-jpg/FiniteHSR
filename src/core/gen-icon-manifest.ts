/**
 * Generates `src/ui/iconManifest.ts` from `public/icons/_manifest.json`.
 *
 * The committed PNG assets live under `public/icons/` (served at `/icons/...`); the raw manifest
 * is the source of truth for which files exist. This script turns it into a small typed module so
 * the UI resolves images by stable display key without fetching JSON at runtime. Re-run after
 * assets change:  npx tsx src/core/gen-icon-manifest.ts
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RELIC_SETS, PLANAR_SETS } from './gear'

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'public', 'icons', '_manifest.json')
const RELIC_DATA = join(ROOT, 'hsr-data', 'data', 'relicsets.json')
const PORTRAIT_DIR = join(ROOT, 'public', 'portraits')
const CHARACTERS_DATA = join(ROOT, 'hsr-data', 'characters.json')
const OUT = join(ROOT, 'src', 'ui', 'iconManifest.ts')

interface IconEntry { file: string; name: string; character?: string }
interface Category { icons: IconEntry[] }
type RawManifest = Record<string, Category>
interface RelicSet { name: string; parts: Record<string, { name: string }> }

const SIMPLE = [
  'enemies', 'lightcones', 'relicsets', 'planarsets',
  'stats', 'buffs', 'debuffs', 'states', 'abilities', 'types', 'paths', 'elements',
] as const

const toAppPath = (file: string): string => '/icons/' + file.replace(/\\/g, '/')
const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function normalizeName(s: string): string {
  return s
    .replace(/<unbreak>/gi, '')
    .replace(/<\/unbreak>/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function buildSimple(cat: Category): Record<string, string> {
  const map: Record<string, string> = {}
  for (const it of cat.icons) map[it.name] = toAppPath(it.file)
  return map
}

/** Build character icon map keyed by clean character name (matching KITS/characters.json) */
function buildCharacters(cat: Category, charactersData: any[]): Record<string, string> {
  // Build a map from normalized clean name -> manifest entry
  const byNorm: Record<string, string> = {}
  for (const it of cat.icons) {
    // Extract clean name from "Character X Icon" format
    let clean = it.name
      .replace(/^Character\s+/i, '')
      .replace(/\s+Icon$/i, '')
      .replace(/^\s*\(Icon\)\s*$/i, '')
      .trim()
    // Handle special cases - prioritize "Trailblazer" format over "Caelus"/"Stelle"
    if (clean.startsWith('Caelus (') || clean.startsWith('Stelle (')) {
      clean = clean.replace(/^Caelus\s*\(/, 'Trailblazer (')
      clean = clean.replace(/^Stelle\s*\(/, 'Trailblazer (')
    }
    // Map Fandom path names to game path names
    clean = clean
      .replace(/^Trailblazer\s*\(\s*Destruction\s*\)/, 'Trailblazer (Physical)')
      .replace(/^Trailblazer\s*\(\s*Preservation\s*\)/, 'Trailblazer (Fire)')
      .replace(/^Trailblazer\s*\(\s*Harmony\s*\)/, 'Trailblazer (Harmony)')
      .replace(/^Trailblazer\s*\(\s*Remembrance\s*\)/, 'Trailblazer (Remembrance)')
      .replace(/^Trailblazer\s*\(\s*Elation\s*\)/, 'Trailblazer (Elation)')
    const norm = normalizeName(clean)
    // Prefer Trailblazer format: only add if not already present, or if it's the Trailblazer version
    const existing = byNorm[norm]
    const isTrailblazer = clean.startsWith('Trailblazer (')
    const existingIsTrailblazer = existing && existing.includes('Trailblazer')
    if (!existing || (isTrailblazer && !existingIsTrailblazer)) {
      byNorm[norm] = toAppPath(it.file)
    }
  }
  
  // Add direct mappings for actual kit names to their icon files
  // These ensure the correct lookup even when Fandom name differs from kit name
  const kitNameToFile: Record<string, string> = {
    'Trailblazer (Destruction)': 'Character Trailblazer (Destruction) Icon.png',
    'Trailblazer (Preservation)': 'Character Trailblazer (Preservation) Icon.png',
    'Trailblazer (Harmony)': 'Character Trailblazer (Harmony) Icon.png',
    'Trailblazer (Remembrance)': 'Character Trailblazer (Remembrance) Icon.png',
    'Trailblazer (Elation)': 'Character Trailblazer (Elation) Icon.png',
    'Silver Wolf LV.999': 'Character Silver Wolf LV.999 Icon.png',
    // Kit name uses bullet (• U+2022), not parentheses
    'March 7th • The Hunt': 'Character March 7th (The Hunt) Icon.png',
  }
  for (const [kitName, fileName] of Object.entries(kitNameToFile)) {
    const norm = normalizeName(kitName)
    if (!byNorm[norm]) {
      byNorm[norm] = toAppPath(`characters/${fileName}`)
    }
  }
  
  // Now map from known character names (from characters.json + Trailblazer paths)
  const out: Record<string, string> = {}
  const knownNames = new Set<string>()
  
  for (const c of charactersData) {
    if (c.name && c.name !== '{NICKNAME}') {
      // Use kit name format (without <unbreak> tags) for Silver Wolf LV.999
      const name = c.name === 'Silver Wolf LV.<unbreak>999</unbreak>' ? 'Silver Wolf LV.999' : c.name
      knownNames.add(name)
    }
  }
  // Use actual kit names for Trailblazer paths (these are what the UI looks up by)
  const trailblazerNames = [
    'Trailblazer (Destruction)', 'Trailblazer (Preservation)', 'Trailblazer (Harmony)',
    'Trailblazer (Remembrance)', 'Trailblazer (Elation)'
  ]
  for (const n of trailblazerNames) knownNames.add(n)
  // Add March 7th • The Hunt - uses bullet (• U+2022) per kit definition
  knownNames.add('March 7th • The Hunt')
  
  for (const name of knownNames) {
    const norm = normalizeName(name)
    if (byNorm[norm]) {
      out[name] = byNorm[norm]
    }
  }
  
  return out
}

function buildEidolons(cat: Category): { byChar: Record<string, Record<string, string>>; ordered: Record<string, string[]> } {
  const byChar: Record<string, Record<string, string>> = {}
  const ordered: Record<string, string[]> = {}
  for (const it of cat.icons) {
    const c = it.character ?? '?'
    if (!byChar[c]) { byChar[c] = {}; ordered[c] = [] }
    byChar[c][it.name] = toAppPath(it.file)
    ordered[c].push(it.name)
  }
  return { byChar, ordered }
}

/**
 * relic/planar piece art, keyed `setSlug -> slot -> path`. Slot order comes from the local
 * `relicsets.json` part order (HEAD/HAND/BODY/FOOT for cavern relics, NECK/OBJECT for planar),
 * which is the same order the downloader (`fetch-relic-piece-icons.ts`) used, so the two agree.
 * Output is keyed by the gear-table slug (what the UI selects by), resolved via set name.
 */
function buildRelicPieces(pieces: Category): Record<string, Record<string, string>> {
  const byName: Record<string, string> = {}
  for (const it of pieces.icons) byName[it.name] = toAppPath(it.file)
  const slugByName: Record<string, string> = {}
  for (const s of [...RELIC_SETS, ...PLANAR_SETS]) slugByName[s.name] = s.id
  const sets = JSON.parse(readFileSync(RELIC_DATA, 'utf8')) as Record<string, RelicSet>
  const out: Record<string, Record<string, string>> = {}
  for (const set of Object.values(sets)) {
    const slug = slugByName[set.name]
    if (!slug) continue
    const slots: Record<string, string> = {}
    Object.values(set.parts).forEach((p, slot) => { const url = byName[p.name]; if (url) slots[String(slot)] = url })
    if (Object.keys(slots).length) out[slug] = slots
  }
  return out
}

function emitRecord(map: Record<string, string>, indent: string): string {
  const keys = Object.keys(map).sort()
  return keys.map(k => `${indent}${quote(k)}: ${quote(map[k])},`).join('\n')
}

/**
 * Full-character art (`public/portraits/<id>.webp`, 376x512) keyed by the same display name the
 * rest of the manifest uses. Files are named by the game's numeric character id (avatar_id from
 * hsr-data/characters.json); the name is resolved through that file.
 * Only files that actually exist on disk are emitted, so the map never points at a 404.
 */
function buildPortraits(names: readonly string[]): Record<string, string> {
  let idByName: Record<string, string> = {}
  try {
    const characters = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8')) as Array<{ name: string; relics?: { avatar_id: number } }>
    for (const c of characters) {
      if (c.name && c.relics?.avatar_id) {
        // Use kit name format (without <unbreak> tags) for Silver Wolf LV.999
        const name = c.name === 'Silver Wolf LV.<unbreak>999</unbreak>' ? 'Silver Wolf LV.999' : c.name
        idByName[name] = String(c.relics.avatar_id)
      }
    }
  } catch {
    // fallback: try reference data
    try {
      const game = JSON.parse(readFileSync(join(ROOT, 'reference', 'hsr-optimizer-main', 'src', 'data', 'game_data.json'), 'utf8')) as { characters: Record<string, { name: string }> }
      for (const [id, c] of Object.entries(game.characters)) idByName[c.name] = id
    } catch { /* ignore */ }
  }

  // Trailblazer paths: raw data uses '{NICKNAME}' for all 10 entries; map display names to primary avatar_id
  // Use actual kit names for lookup keys
  const TRAILBLAZER_AVATAR_ID: Record<string, string> = {
    'Trailblazer (Destruction)': '8001',
    'Trailblazer (Preservation)': '8003',
    'Trailblazer (Harmony)': '8005',
    'Trailblazer (Remembrance)': '8007',
    'Trailblazer (Elation)': '8009',
  }
  for (const [displayName, avatarId] of Object.entries(TRAILBLAZER_AVATAR_ID)) {
    idByName[displayName] = avatarId
  }
  // Also add March 7th • The Hunt portrait (uses bullet • U+2022 per kit definition)
  idByName['March 7th • The Hunt'] = '1224'
  // Add Silver Wolf LV.999 portrait (kit name is without <unbreak> tags)
  idByName['Silver Wolf LV.999'] = '1506'

  const have = new Set(readdirSync(PORTRAIT_DIR).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)))
  const out: Record<string, string> = {}
  for (const name of names) {
    const baseId = idByName[name]
    if (!baseId) continue
    // Try exact match first, then with b1, b2, etc. suffixes
    const candidates = [baseId, `${baseId}b1`, `${baseId}b2`, `${baseId}b3`]
    for (const id of candidates) {
      if (have.has(id)) {
        out[name] = `/portraits/${id}.webp`
        break
      }
    }
  }
  return out
}

function main(): void {
  const manifest = JSON.parse(readFileSync(SRC, 'utf8')) as RawManifest
  const charactersData = JSON.parse(readFileSync(CHARACTERS_DATA, 'utf8'))
  const parts: string[] = []
  parts.push(`/**`)
  parts.push(` * GENERATED by src/core/gen-icon-manifest.ts — do not edit by hand.`)
  parts.push(` * Maps stable display keys (character/Light Cone/set/stat/... names) to committed icon paths.`)
  parts.push(` * Keys are display names because that is the identity the raw game data and the manifest share;`)
  parts.push(` * the UI call sites do the id -> name lookup through the existing gear/kit tables.`)
  parts.push(` * Source: public/icons/_manifest.json (${Object.values(manifest).reduce((n, c) => n + c.icons.length, 0)} files).`)
  parts.push(` */`)
  parts.push('')

  // Characters: special handling to map clean names
  const charMap = buildCharacters(manifest.characters, charactersData)
  parts.push(`export const CHARACTERS_ICONS: Record<string, string> = {`)
  parts.push(emitRecord(charMap, '  '))
  parts.push('}')
  parts.push('')

  for (const cat of SIMPLE) {
    const map = buildSimple(manifest[cat])
    parts.push(`export const ${cat.toUpperCase()}_ICONS: Record<string, string> = {`)
    parts.push(emitRecord(map, '  '))
    parts.push('}')
    parts.push('')
  }

  const eid = buildEidolons(manifest.eidolons)
  parts.push('export const EIDOLON_ICONS: Record<string, Record<string, string>> = {')
  for (const c of Object.keys(eid.byChar).sort()) {
    parts.push(`  ${quote(c)}: {`)
    parts.push(emitRecord(eid.byChar[c], '    '))
    parts.push('  },')
  }
  parts.push('}')
  parts.push('')

  parts.push('export const EIDOLON_NAMES_ORDERED: Record<string, string[]> = {')
  for (const c of Object.keys(eid.ordered).sort()) {
    parts.push(`  ${quote(c)}: [${eid.ordered[c].map(quote).join(', ')}],`)
  }
  parts.push('}')
  parts.push('')

  const rp = buildRelicPieces(manifest.relicpieces)
  parts.push('export const RELICPIECES_ICONS: Record<string, Record<string, string>> = {')
  for (const setId of Object.keys(rp).sort()) {
    parts.push(`  ${quote(setId)}: {`)
    parts.push(emitRecord(rp[setId], '    '))
    parts.push('  },')
  }
  parts.push('}')
  parts.push('')

  const portraits = buildPortraits(Object.keys(charMap))
  parts.push('export const CHARACTER_PORTRAITS: Record<string, string> = {')
  parts.push(emitRecord(portraits, '  '))
  parts.push('}')
  parts.push('')

  writeFileSync(OUT, parts.join('\n'), 'utf8')
  console.log(`wrote ${OUT} (${parts.join('\n').length} bytes, ${Object.keys(portraits).length} portraits)`)
}

main()
