/**
 * Generates `src/core/abilityNames.ts` from `hsr-data/characters.json`.
 *
 * The Party Setup UI needs real ability names (labels + `public/icons/abilities` lookup);
 * the raw dataset is 2+ MB and must not enter the browser bundle, so names are extracted here.
 * Re-run after dataset changes:  npx tsx src/core/gen-ability-names.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KITS } from './kits'
import { PROG } from './progression'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'src', 'core', 'abilityNames.ts')

interface RawSkill { id: number; type: string | null; type_name: string | null; name: string }
interface RawChar {
  name: string
  base_type: string
  damage_type: string
  skills: Record<string, RawSkill>
  memosprite?: { skills: Record<string, RawSkill> }
}

/** PROG slot -> dataset type_name + occurrence index (0 = first of that type) */
const SLOT_SPEC: Record<string, { type: string; occ: number }> = {
  basic: { type: 'Basic ATK', occ: 0 },
  basic_en: { type: 'Basic ATK', occ: 1 },
  basic2: { type: 'Basic ATK', occ: 1 },
  skill: { type: 'Skill', occ: 0 },
  skill_en: { type: 'Skill', occ: 1 },
  skill_en2: { type: 'Skill', occ: 1 },
  ult: { type: 'Ultimate', occ: 0 },
  ult_en: { type: 'Ultimate', occ: 1 },
  ult_en2: { type: 'Ultimate', occ: 2 },
  ult_en3: { type: 'Ultimate', occ: 3 },
  talent: { type: 'Talent', occ: 0 },
  talent2: { type: 'Talent', occ: 1 },
  el_skill: { type: 'Elation Skill', occ: 0 },
  el_skill2: { type: 'Elation Skill', occ: 1 },
  mem_skill: { type: 'Memosprite Skill', occ: 0 },
  mem_skill2: { type: 'Memosprite Skill', occ: 1 },
  mem_skill_en: { type: 'Memosprite Skill', occ: 1 },
  mem_skill_en2: { type: 'Memosprite Skill', occ: 1 },
  mem_talent: { type: 'Memosprite Talent', occ: 0 },
  mem_talent_en: { type: 'Memosprite Talent', occ: 1 },
  mem_talent_en2: { type: 'Memosprite Talent', occ: 2 },
}

const norm = (s: unknown): string =>
  String(s).replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** kit id -> dataset name, only where the two differ */
const ALIAS: Record<string, string> = { march7th_the_hunt: 'March 7th' }

const chars = JSON.parse(readFileSync(join(ROOT, 'hsr-data', 'characters.json'), 'utf8')) as RawChar[]

const byName = new Map<string, RawChar[]>()
for (const c of chars) {
  const k = norm(c.name)
  const arr = byName.get(k) ?? []
  arr.push(c)
  byName.set(k, arr)
}

/** dataset row for a kit: same-name rows are split by element, then by path */
function rowFor(kitId: string, name: string, elem: string, path: string): RawChar | undefined {
  const rows = byName.get(norm(ALIAS[kitId] ?? name)) ?? []
  if (!rows.length) return undefined
  if (rows.length === 1) return rows[0]
  const byElem = rows.filter(r => r.damage_type === elem)
  if (byElem.length === 1) return byElem[0]
  const byPath = byElem.filter(r => r.base_type === path)
  return byPath[0] ?? byElem[0] ?? rows[0]
}

function namesByType(skills: Record<string, RawSkill>, type: string, occ: number): string | undefined {
  const hits = Object.values(skills).filter(s => s.type_name === type)
  return hits[occ]?.name
}

const out: Record<string, Record<string, string>> = {}
const missing: string[] = []

for (const kit of KITS) {
  const row = rowFor(kit.id, kit.name, kit.elem, kit.path)
  if (!row) { missing.push(`${kit.id}: no dataset row`); continue }
  const slots = Object.keys(PROG[kit.id]?.abilities ?? {})
  const entry: Record<string, string> = {}
  for (const slot of slots) {
    const spec = SLOT_SPEC[slot]
    if (!spec) continue
    const fromMemo = spec.type.startsWith('Memosprite')
    const name = namesByType(fromMemo ? row.memosprite?.skills ?? {} : row.skills, spec.type, spec.occ)
    if (name) entry[slot] = name.replace(/<[^>]*>/g, '').trim()
  }
  if (!entry.basic || !entry.skill || !entry.ult || !entry.talent) missing.push(`${kit.id}: incomplete ${Object.keys(entry).join(',')}`)
  out[kit.id] = entry
}

const body = `/**
 * GENERATED FILE — do not edit by hand.
 * Source: hsr-data/characters.json
 * Regenerate: npx tsx src/core/gen-ability-names.ts
 *
 * kit id -> PROG ability slot -> display name of that ability.
 */

/** PROG ability slot -> display name (absent when the dataset has no such row) */
export type KitAbilityNames = Record<string, string>

export const ABILITY_NAMES: Record<string, KitAbilityNames> = ${JSON.stringify(out, null, 2)}

/** display name for a kit ability slot, e.g. \`abilityName('seele', 'skill')\` */
export function abilityName(kitId: string, slot: string): string | undefined {
  return ABILITY_NAMES[kitId]?.[slot]
}
`

writeFileSync(OUT, body)
console.log(`wrote ${OUT}`)
console.log(`kits: ${Object.keys(out).length}/${KITS.length}`)
if (missing.length) console.log('missing:\n  ' + missing.join('\n  '))
