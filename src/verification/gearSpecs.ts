/**
 * Gear fixtures (guide §19.2/§19.3): every light cone, relic set and planar set gets a spec that
 * runs a REAL battle with the item equipped, through the same Spec/Requirement/GoldenRunner pipeline
 * as characters. This is what turns `LIGHT CONE COVERAGE 0/169` into a measured number and gives
 * relics/planars a fixture home of their own.
 *
 * Scope: the stat-bearing levels of the guide's cone checklist — data stats, passive structure and
 * condition — asserted from the battle's own gear buff (`id: 'gear'`) and the wearer's base stats.
 * Stateful hook levels (stack/refresh/expiration/per-turn, SI scaling, character interaction) stay
 * with the existing `tests/golden/gear/*` behavioural tests and the `gearCoverage` registry; a cone
 * with open hooks is already honestly classified `partial` there.
 *
 * Specs are generated from the dataset rather than hand-written: 229 items x several requirements
 * is not something a human should maintain by hand, and the values already live in `src/core/gear`.
 */

import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS, aggregateGear } from '../core/gear'
import { KITS, KIT_PATH } from '../core/kits'
import type { BaseStats, GearConfig } from '../core/entities/Unit'
import type { TeamSpec, EnemySpec } from '../core/battle'
import type { Fixture, SlotSpec } from './Spec'
import type { Requirement } from './Requirement'

const HOST = { hp: 5000, atk: 1000, def: 500, spd: 100 } as const
const WEARER = 'Wearer'
const DUMMY: EnemySpec = { name: 'Dummy', count: 1, hp: 5_000_000, spd: 90, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 0 }

type HostStats = NonNullable<TeamSpec['stats']>

/** first kit that will actually carry `path` at battle time (base.path set, or filled from KIT_PATH) */
function pathHosts(): Record<string, string> {
  const m: Record<string, string> = {}
  for (const k of KITS) {
    const p = k.base.path ?? KIT_PATH[k.id]
    if (p && !m[p]) m[p] = k.id
  }
  return m
}
const HOSTS = pathHosts()

/** stat overrides that satisfy an attach-time condition gate. effRes is not a TeamSpec stat, so an
 *  effRes-gated bonus simply stays closed in a fixture — its base mods are still asserted. */
function condStats(stat: string | undefined): HostStats {
  switch (stat) {
    case 'spd': return { spd: 999 }
    case 'critRate': return { critRate: 9 }
    case 'ehr': return { ehr: 9 }
    case 'be': return { be: 9 }
    default: return {}
  }
}

/** buffStat reads the FIRST mod for a stat, so assert each stat once (later duplicates are covered
 *  by the behavioural tests, which own the stack/refresh levels). */
function byStat(mods: { stat: string; value: number }[]): { stat: string; value: number }[] {
  const seen = new Set<string>()
  const out: { stat: string; value: number }[] = []
  for (const m of mods) if (!seen.has(m.stat)) { seen.add(m.stat); out.push(m) }
  return out
}

/** shared base-stat fold + gear-buff requirements, plus the per-mod requirements */
function coreReqs(id: string, name: string, host: string, agg: ReturnType<typeof aggregateGear>): Requirement[] {
  const reqs: Requirement[] = [
    { id: `${id}_base_hp`, layer: 'structure', claim: `${name} (${id}) folds its base HP into the wearer's base stats.`, assertion: { assert: 'unitState', kitId: host, field: 'base.hp', value: HOST.hp + agg.baseAdd.hp } },
    { id: `${id}_base_atk`, layer: 'structure', claim: `${name} (${id}) folds its base ATK into the wearer's base stats.`, assertion: { assert: 'unitState', kitId: host, field: 'base.atk', value: HOST.atk + agg.baseAdd.atk } },
    { id: `${id}_base_def`, layer: 'structure', claim: `${name} (${id}) folds its base DEF into the wearer's base stats.`, assertion: { assert: 'unitState', kitId: host, field: 'base.def', value: HOST.def + agg.baseAdd.def } },
  ]
  if (agg.mods.length) {
    const mods = byStat(agg.mods)
    reqs.push({ id: `${id}_gear_buff`, layer: 'structure', claim: `${name} (${id}) delivers its passive through the wearer's gear buff.`, assertion: { assert: 'buff', id: 'gear', target: WEARER } })
    let i = 0
    for (const m of mods) reqs.push({ id: `${id}_mod_${i++}`, layer: 'parameters', claim: `${name} (${id}) grants ${m.stat} ${m.value} at SI 1.`, assertion: { assert: 'buffStat', id: 'gear', stat: m.stat, value: m.value, tol: 1e-6 } })
  }
  return reqs
}

function oneFixture(id: string, env: string, stats: HostStats, gear: GearConfig, host: string, path?: string): Fixture {
  return {
    id: `${id}-si1`,
    env,
    battle: {
      team: [{ kitId: host, name: WEARER, ...(path ? { path } : {}), stats, gear }],
      enemy: DUMMY, cycles: 1, seed: 7,
    },
  }
}

function coneSpec(id: string, name: string, path: string, gear: GearConfig, stats: HostStats): SlotSpec {
  const host = HOSTS[path] ?? 'seele'
  const base = { level: 80, ...stats, path } as BaseStats
  const agg = aggregateGear(gear, base)
  return {
    kit: id, slot: 'gear',
    fixtures: [oneFixture(id, `${name} at SI 1 on a ${path}-path wearer vs a Fire dummy (1 cycle, seed 7)`, stats, gear, host, path)],
    requirements: coreReqs(id, name, host, agg),
  }
}

/** generates one Spec per Light Cone, Relic set and Planar set */
export function gearSpecs(): SlotSpec[] {
  const specs: SlotSpec[] = []

  for (const c of LIGHT_CONES) {
    const stats: HostStats = { ...HOST, ...condStats(c.cond?.stat) }
    specs.push(coneSpec(c.id, c.name, c.path, { coneId: c.id, si: 1 }, stats))
  }

  for (const s of RELIC_SETS) {
    const host = 'seele'
    const stats: HostStats = { ...HOST }
    const gear: GearConfig = { relicSets: [s.id, s.id] }
    const agg = aggregateGear(gear, { level: 80, ...stats } as BaseStats)
    specs.push({ kit: s.id, slot: 'gear', fixtures: [oneFixture(s.id, `${s.name} 4pc on a seele wearer vs a Fire dummy (1 cycle, seed 7)`, stats, gear, host)], requirements: coreReqs(s.id, s.name, host, agg) })
  }

  for (const p of PLANAR_SETS) {
    const host = 'seele'
    const stats: HostStats = { ...HOST, ...condStats(p.cond?.stat) }
    const gear: GearConfig = { planarId: p.id }
    const agg = aggregateGear(gear, { level: 80, ...stats } as BaseStats)
    specs.push({ kit: p.id, slot: 'gear', fixtures: [oneFixture(p.id, `${p.name} on a seele wearer vs a Fire dummy (1 cycle, seed 7)`, stats, gear, host)], requirements: coreReqs(p.id, p.name, host, agg) })
  }

  return specs
}
