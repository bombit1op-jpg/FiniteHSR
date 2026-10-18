/**
 * Machine-readable skill/character specification (guide: "Как я бы проверял
 * конкретного персонажа" + "Сначала превращаем описание персонажа в спецификацию").
 *
 * A spec owns its own scenarios (fixtures) and its own atomic requirements. Nothing in here
 * imports the simulator: a spec is data, the runner turns it into assertions.
 */
import { readFileSync } from 'node:fs'
import { LAYERS, STATE_STATS, ABILITY_SLOTS, type Requirement } from './Requirement'

/** where a mechanic came from — the guide's "Mechanics Registry": dataset / wiki / manual / derived */
export type CanonSource = 'dataset' | 'wiki' | 'manual' | 'derived'
export type Confidence = 'raw' | 'interpreted' | 'verified'

export interface Canon {
  source: CanonSource
  /** pointer into the source, e.g. "characters.json#/skills/1202/desc" */
  ref?: string
  confidence: Confidence
  note?: string
}

/** deliberate, documented divergence from canon (guide: "Для известных расхождений — отдельный статус") */
export interface KnownDeviation {
  reason: string
  scope: string[]
  /** what a correct implementation would do, so the deviation is auditable rather than decorative */
  expectation: string
}

export interface Fixture {
  id: string
  /** guide: "не тестировать skill только в одном окружении" — name the environment */
  env: string
  /** `battle` runs the full fight (default); `init` stops at initBattle — battle-start effects */
  mode?: 'battle' | 'init'
  battle: Record<string, unknown>
}

export interface SlotSpec {
  kit: string
  slot: 'base' | 'basic' | 'skill' | 'talent' | 'ultimate' | 'technique' | 'traces' | 'eidolons' | 'interactions' | 'gear'
  canon?: Canon
  fixtures: Fixture[]
  requirements: Requirement[]
}

/** JSON specs, not YAML — zero runtime deps in this repo, so YAML would mean either a
 * new dependency or a hand-rolled subset parser. The schema below is the guide's, unchanged. */
export function loadSlot(file: string): SlotSpec {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as SlotSpec
  validateSlot(raw, file)
  return raw
}

export function validateSlot(s: SlotSpec, where: string): void {
  const bad = (m: string): never => { throw new Error(`${where}: ${m}`) }
  if (!s || typeof s.kit !== 'string' || !s.kit) bad('missing kit')
  if (!s.slot) bad('missing slot')
  if (!Array.isArray(s.fixtures) || !s.fixtures.length) bad('no fixtures')
  if (!Array.isArray(s.requirements) || !s.requirements.length) bad('no requirements')
  const fx = new Set(s.fixtures.map(f => f.id))
  const seen = new Set<string>()
  for (const f of s.fixtures) if (!f.id || !f.env || typeof f.battle !== 'object') bad(`bad fixture ${JSON.stringify(f.id ?? f)}`)
  for (const r of s.requirements) {
    if (!r.id || seen.has(r.id)) bad(`bad requirement ${JSON.stringify(r.id ?? r)}`)
    seen.add(r.id)
    if (r.ability !== undefined && !(ABILITY_SLOTS as readonly string[]).includes(r.ability)) bad(`bad ability ${r.ability}`)
    if (!LAYERS.includes(r.layer)) bad(`requirement ${r.id}: bad layer ${r.layer}`)
    if (!r.claim) bad(`requirement ${r.id}: claim is the canon sentence, keep it`)
    if (!r.assertion || !(r.assertion as { assert?: string }).assert) bad(`requirement ${r.id}: no assertion`)
    if (r.status && r.status !== 'gap' && r.status !== 'blocked') bad(`requirement ${r.id}: bad status ${JSON.stringify(r.status)}`)
    for (const ref of r.fixtures ?? []) if (!fx.has(ref)) bad(`requirement ${r.id}: unknown fixture ${ref}`)
    for (const c of [...(r.before ?? []), ...(r.after ?? [])]) {
      if (!c || !STATE_STATS.includes(c.stat)) bad(`requirement ${r.id}: bad clause stat ${JSON.stringify(c?.stat)}`)
      if (!['eq', 'atLeast', 'atMost'].includes(c.op)) bad(`requirement ${r.id}: bad clause op ${JSON.stringify(c?.op)}`)
      if (typeof c.value !== 'number') bad(`requirement ${r.id}: clause value must be a number`)
      if (c.unit === undefined && c.kitId === undefined) bad(`requirement ${r.id}: clause needs unit or kitId`)
    }
  }
}