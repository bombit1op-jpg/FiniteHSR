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
  'characters', 'enemies', 'lightcones', 'relicsets', 'planarsets',
  'stats', 'buffs', 'debuffs', 'states', 'abilities', 'types', 'paths', 'elements',
] as const

const toAppPath = (file: string): string => '/icons/' + file.replace(/\\/g, '/')
const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

function buildSimple(cat: Category): Record<string, string> {
  const map: Record<string, string> = {}
  for (const it of cat.icons) map[it.name] = toAppPath(it.file)
  return map
}

function buildEidolons(cat: Category): Record<string, Record<string, string>> {
  const byChar: Record<string, Record<string, string>> = {}
  for (const it of cat.icons) {
    const c = it.character ?? '?'
    ;(byChar[c] ??= {})[it.name] = toAppPath(it.file)
  }
  return byChar
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
    for (const c of characters) if (c.name && c.relics?.avatar_id) idByName[c.name] = String(c.relics.avatar_id)
  } catch {
    // fallback: try reference data
    try {
      const game = JSON.parse(readFileSync(join(ROOT, 'reference', 'hsr-optimizer-main', 'src', 'data', 'game_data.json'), 'utf8')) as { characters: Record<string, { name: string }> }
      for (const [id, c] of Object.entries(game.characters)) idByName[c.name] = id
    } catch { /* ignore */ }
  }
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
  const parts: string[] = []
  parts.push(`/**`)
  parts.push(` * GENERATED by src/core/gen-icon-manifest.ts — do not edit by hand.`)
  parts.push(` * Maps stable display keys (character/Light Cone/set/stat/... names) to committed icon paths.`)
  parts.push(` * Keys are display names because that is the identity the raw game data and the manifest share;`)
  parts.push(` * the UI call sites do the id -> name lookup through the existing gear/kit tables.`)
  parts.push(` * Source: public/icons/_manifest.json (${Object.values(manifest).reduce((n, c) => n + c.icons.length, 0)} files).`)
  parts.push(` */`)
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
  for (const c of Object.keys(eid).sort()) {
    parts.push(`  ${quote(c)}: {`)
    parts.push(emitRecord(eid[c], '    '))
    parts.push('  },')
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

  const portraits = buildPortraits(manifest.characters.icons.map(i => i.name))
  parts.push('export const CHARACTER_PORTRAITS: Record<string, string> = {')
  parts.push(emitRecord(portraits, '  '))
  parts.push('}')
  parts.push('')

  writeFileSync(OUT, parts.join('\n'), 'utf8')
  console.log(`wrote ${OUT} (${parts.join('\n').length} bytes, ${Object.keys(portraits).length} portraits)`)
}

main()
