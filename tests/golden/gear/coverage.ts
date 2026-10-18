import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS, aggregateGear, SLOT_MAINS } from '../../../src/core/gear'
import { gearRegistry, gearCoverageReport, CONE_HOOK_TESTS, SET_TESTS, CONE_BLOCKED, SET_BLOCKED } from '../../../src/verification/gearCoverage'
import { t, type Case } from '../../suites'
import type { BaseStats, RelicPiece } from '../../../src/core/entities/Unit'

/**
 * Equipment coverage (guide §19.2/§19.3/§34): the generic behaviour sweep that every light cone
 * and relic/planar set must pass, plus the completeness gate for the coverage registry. This is
 * what turns `LIGHT CONE COVERAGE 0/169` into a measured number: the registry classifies each
 * item verified / partial / unverified / blocked, and this suite asserts nothing is skipped.
 * Stat-level effects are asserted here; hook-level effects are honestly left `partial` by the
 * registry (see `src/verification/gearCoverage.ts`) until a dedicated behavioural test exists.
 */
const st = (path: string, over: Partial<BaseStats> = {}): BaseStats => ({ level: 80, hp: 8000, atk: 4000, def: 600, spd: 100, path, ...over })
const sum = (g: ReturnType<typeof aggregateGear>, s: string): number => g.mods.filter(m => m.stat === s).reduce((a, m) => a + m.value, 0)
const TRIGGER: Record<string, number> = { spd: 999, ehr: 9, critRate: 9, effRes: 9, be: 9 }
const cave = (setId: string): RelicPiece[] => (['head', 'hands', 'body', 'feet'] as const).map(slot => ({ setId, slot, main: SLOT_MAINS[slot][0], subs: [] }))
const span = (setId: string): RelicPiece[] => [
  { setId, slot: 'sphere', main: SLOT_MAINS.sphere[0], subs: [] },
  { setId, slot: 'rope', main: SLOT_MAINS.rope[0], subs: [] },
]

export default (): Case[] => {
  const cases: Case[] = []

  // 1) every cone: base stats fold into baseAdd, unconditional mods apply on a path match
  const e1: string[] = []
  for (const c of LIGHT_CONES) {
    const g = aggregateGear({ coneId: c.id, si: 1 }, st(c.path))
    if (!(g.baseAdd.hp === c.hp && g.baseAdd.atk === c.atk && g.baseAdd.def === c.def)) e1.push(`${c.id}:base`)
    for (const w of c.mods?.(1) ?? []) if (!g.mods.some(m => m.stat === w.stat && Math.abs(m.value - w.value) < 1e-9)) e1.push(`${c.id}:${w.stat}`)
  }
  cases.push(t.ok('all cones: base HP/ATK/DEF fold in + unconditional mods applied', e1.length === 0, e1.slice(0, 5).join(', ')))

  // 2) every conditional cone: the gate adds exactly its value, and adds nothing when closed
  const e2: string[] = []
  for (const c of LIGHT_CONES) {
    if (!c.cond) continue
    const hi = aggregateGear({ coneId: c.id, si: 1 }, st(c.path, { [c.cond.stat]: TRIGGER[c.cond.stat] } as Partial<BaseStats>))
    const lo = aggregateGear({ coneId: c.id, si: 1 }, st(c.path, { [c.cond.stat]: 0 } as Partial<BaseStats>))
    for (const m of c.cond.mods(1, { spd: TRIGGER.spd! })) if (Math.abs((sum(hi, m.stat) - sum(lo, m.stat)) - m.value) > 1e-9) e2.push(`${c.id}:${m.stat}`)
  }
  cases.push(t.ok('conditional cones: gate adds exactly its value, nothing when closed', e2.length === 0, e2.join(', ')))

  // 3) every relic set on a legal 4pc: 4pc activates, 2pc + 4pc stat mods present
  const e3: string[] = []
  for (const s of RELIC_SETS) {
    const g = aggregateGear({ pieces: cave(s.id) }, st('Destruction'))
    if (!(g.relicSets4 ?? []).some(x => x.id === s.id)) e3.push(`${s.id}:no4pc`)
    for (const m of s.twoPc) if (!g.mods.some(x => x.stat === m.stat && Math.abs(x.value - m.value) < 1e-9)) e3.push(`${s.id}:2pc`)
    for (const m of s.fourPc ?? []) if (!g.mods.some(x => x.stat === m.stat && Math.abs(x.value - m.value) < 1e-9)) e3.push(`${s.id}:4pc`)
  }
  cases.push(t.ok('all relic sets: 4pc activates, 2pc/4pc stat mods applied', e3.length === 0, e3.slice(0, 5).join(', ')))

  // 4) every planar set: activates with sphere+rope, mods applied, condition is a real delta
  const e4: string[] = []
  for (const p of PLANAR_SETS) {
    const g = aggregateGear({ pieces: span(p.id) }, st('Destruction'))
    if (g.planar?.id !== p.id) e4.push(`${p.id}:inactive`)
    for (const m of p.mods) if (!g.mods.some(x => x.stat === m.stat && Math.abs(x.value - m.value) < 1e-9)) e4.push(`${p.id}:mods`)
    if (p.cond) {
      const hi = aggregateGear({ pieces: span(p.id) }, st('Destruction', { [p.cond.stat]: TRIGGER[p.cond.stat] } as Partial<BaseStats>))
      const lo = aggregateGear({ pieces: span(p.id) }, st('Destruction', { [p.cond.stat]: 0 } as Partial<BaseStats>))
      for (const m of p.cond.mods) if (Math.abs((sum(hi, m.stat) - sum(lo, m.stat)) - m.value) > 1e-9) e4.push(`${p.id}:cond`)
    }
  }
  cases.push(t.ok('all planar sets: activate, mods applied, condition is a real delta', e4.length === 0, e4.slice(0, 5).join(', ')))

  // 5) coverage registry: every dataset item classified exactly once, no unknown evidence keys
  const reg = gearRegistry()
  const expect = LIGHT_CONES.length + RELIC_SETS.length + PLANAR_SETS.length
  const seen = new Set(reg.map(e => `${e.kind}/${e.id}`))
  cases.push(t.ok('registry classifies every dataset item exactly once', reg.length === expect && seen.size === expect, `${reg.length}/${expect}`))
  const conIds = new Set(LIGHT_CONES.map(c => c.id)), relicIds = new Set(RELIC_SETS.map(s => s.id)), planarIds = new Set(PLANAR_SETS.map(p => p.id))
  const stray = [...Object.keys(CONE_HOOK_TESTS), ...Object.keys(CONE_BLOCKED)].filter(id => !conIds.has(id))
    .concat([...Object.keys(SET_TESTS), ...Object.keys(SET_BLOCKED)].filter(id => !relicIds.has(id) && !planarIds.has(id)))
  cases.push(t.ok('registry evidence/blocked keys all exist in the dataset', stray.length === 0, stray.join(', ')))

  // 6) the report renders and names every unverified/blocked item (no silent gap)
  const rep = gearCoverageReport(reg)
  const gaps = reg.filter(e => e.status === 'unverified' || e.status === 'blocked')
  cases.push(t.ok('coverage report renders and names every gap', rep.startsWith('GEAR COVERAGE') && gaps.every(e => rep.includes(e.id)), rep.split('\n')[0]))

  return cases
}
