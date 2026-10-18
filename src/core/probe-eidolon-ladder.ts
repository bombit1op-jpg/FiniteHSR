/**
 * Eidolon ladder probe (guide §34.5, §19.4).
 *
 * Two independent checks over all 93 kits:
 *   1. data drift — re-derives EIDOLON_LV from `hsr-data/characters.json` ranks.3 / ranks.5 text
 *      and fails if the table in `battle.ts` no longer matches the data (`--emit` prints the block).
 *   2. runtime ladder — for every kit runs E0..E6 and asserts the cumulative invariant:
 *      ability levels never decrease as the eidolon rank rises, and no `*_eN` buff leaks below E_N.
 *
 *   npx tsx src/core/probe-eidolon-ladder.ts          # check, exit 1 on any drift/violation
 *   npx tsx src/core/probe-eidolon-ladder.ts --emit    # print the EIDOLON_LV block
 */
import { readFileSync } from 'node:fs'
import { KITS } from './kits/index'
import { runBattle, resolveLevels, EIDOLON_LV, ENEMY_PRESETS, type TeamSpec } from './battle'
import type { Elem } from './entities/Unit'

const norm = (s: string): string => s.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '')

// characters.json does not distinguish forms by name: March 7th has two rows (Preservation first,
// The Hunt second). KITS order + CLAIMED consumption splits the tie, same as audit-abils.
const ALIAS: Record<string, string> = { march7th_the_hunt: 'March 7th' }

const ABIL: [string, keyof Levels][] = [
  ['Basic ATK', 'basic'], ['Elation Skill', 'el_skill'],
  ['Skill', 'skill'], ['Ultimate', 'ult'], ['Talent', 'talent'],
]
type Levels = { basic?: number; skill?: number; ult?: number; talent?: number; el_skill?: number }

/** ranks.3/ranks.5 desc -> { basic?, skill?, ult?, talent?, el_skill? }; memosprite bumps are
 *  handled inside the kit, so they are skipped here (they never enter EIDOLON_LV). */
function parseRank(desc: string): Levels {
  const out: Levels = {}
  const re = /(Memosprite Skill|Memosprite Talent|Basic ATK|Elation Skill|Skill|Ultimate|Talent) Lv\. \+(\d)/g
  for (const m of desc.matchAll(re)) {
    const key = ABIL.find(([label]) => label === m[1])?.[1]
    if (key) out[key] = (out[key] ?? 0) + Number(m[2])
  }
  return out
}

interface CharRec { name: string; base_type: string; ranks: Record<string, { desc: string }> }

/** trailblazer rows all share `name: "{NICKNAME}"`; separate them by their path (base_type). */
const TB_PATH: Record<string, string> = {
  trailblazer_destruction: 'Destruction', trailblazer_preservation: 'Preservation',
  trailblazer_harmony: 'Harmony', trailblazer_remembrance: 'Remembrance', trailblazer_elation: 'Elation',
}

const matches = (k: { id: string; name: string }, x: CharRec): boolean => {
  const path = TB_PATH[k.id]
  if (path) return x.name === '{NICKNAME}' && x.base_type === path
  return norm(x.name) === norm(ALIAS[k.id] ?? k.name)
}

function derive(): { out: Record<string, Record<number, Levels>>; missing: Set<string> } {
  const chars = JSON.parse(readFileSync('hsr-data/characters.json', 'utf8')) as CharRec[]
  const claimed = new Set<CharRec>()
  const out: Record<string, Record<number, Levels>> = {}
  const missing = new Set<string>()
  for (const k of KITS) {
    const c = chars.find(x => !claimed.has(x) && matches(k, x))
    if (!c) { missing.add(k.id); continue }
    claimed.add(c)
    const r: Record<number, Levels> = {}
    for (const n of [3, 5]) { const d = parseRank(c.ranks[String(n)]?.desc ?? ''); if (Object.keys(d).length) r[n] = d }
    out[k.id] = r
  }
  return { out, missing }
}

const eq = (a: Levels | undefined, b: Levels | undefined): boolean => {
  const keys: (keyof Levels)[] = ['basic', 'skill', 'ult', 'talent', 'el_skill']
  return keys.every(k => (a?.[k] ?? 0) === (b?.[k] ?? 0))
}

function checkDrift(): number {
  const { out: derived, missing } = derive()
  let bad = 0
  for (const k of KITS) {
    // Kits newer than the shipped dataset can't be re-derived — warn, don't fail.
    if (missing.has(k.id)) { console.log(`  ? ${k.id}: no characters.json row (drift unchecked)`); continue }
    const want = EIDOLON_LV[k.id] ?? {}
    const got = derived[k.id] ?? {}
    for (const n of [3, 5]) {
      if (!eq(want[n], got[n])) {
        console.log(`  DRIFT ${k.id} E${n}: table=${JSON.stringify(want[n] ?? {})} data=${JSON.stringify(got[n] ?? {})}`)
        bad++
      }
    }
  }
  const unverified = [...missing].length
  console.log(`drift: ${bad ? `${bad} mismatch(es)` : 'none'}${unverified ? `, ${unverified} kit(s) unchecked (@${[...missing].join(', ')})` : ''}`)
  return bad
}

const ELEMS = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'] as Elem[]

function checkLadder(): number {
  let bad = 0
  for (const k of KITS) {
    const team = (e: number): TeamSpec[] => [{ kitId: k.id, eidolon: e }]
    let prev: ReturnType<typeof resolveLevels> | null = null
    for (let e = 0; e <= 6; e++) {
      const lv = resolveLevels({ kitId: k.id, eidolon: e })
      if (prev) {
        for (const a of ['basic', 'skill', 'ult', 'talent', 'el_skill'] as const) {
          if ((lv[a] ?? 0) < (prev[a] ?? 0)) { console.log(`  GAP ${k.id} E${e}: ${a} ${prev[a]} -> ${lv[a]}`); bad++ }
        }
      }
      const sim = runBattle({ cycles: 2, seed: 7, team: team(e), enemy: { ...ENEMY_PRESETS.mob, count: 1, weaknesses: ELEMS } })
      for (const u of sim.roster) {
        if (!Number.isFinite(u.hp) || u.hp < 0) { console.log(`  NaN/HP ${k.id} E${e}: ${u.name} hp=${u.hp}`); bad++ }
        if (!Number.isFinite(u.energy) || u.energy < 0) { console.log(`  NaN/EN ${k.id} E${e}: ${u.name} energy=${u.energy}`); bad++ }
      }
      for (const b of sim.buffLog) {
        const [, rank] = /_e(\d)$/.exec(b.id) ?? []
        if (rank && Number(rank) > e) { console.log(`  LEAK ${k.id} E${e}: buff ${b.id} active below its rank`); bad++ }
      }
      prev = lv
    }
  }
  console.log(bad ? `ladder: ${bad} violation(s)` : 'ladder: all 93 kits cumulative E0..E6, no gaps, no leaks')
  return bad
}

function emit(): void {
  const { out: derived } = derive()
  for (const k of KITS) {
    const r = derived[k.id] ?? {}
    if (!Object.keys(r).length) continue
    console.log(`  ${k.id}: ${JSON.stringify(r).replace(/"/g, '').replace(/,/g, ', ')},`)
  }
}

const emitMode = process.argv.includes('--emit')
if (emitMode) { emit() } else {
  const bad = checkDrift() + checkLadder()
  console.log(bad ? `\nEIDOLON LADDER: ${bad} problem(s)` : '\nEIDOLON LADDER: OK')
  process.exit(bad ? 1 : 0)
}
