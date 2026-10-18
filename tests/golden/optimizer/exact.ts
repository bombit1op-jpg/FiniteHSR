import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import { exactSimulation } from '../../../src/optimizer/exact'
import type { SearchSpace, FullTeamConfig } from '../../../src/optimizer/space'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §72.5 exact simulation: outcome distributions over seeds × encounters (target counts), including the
 * §72.5 metric list (percentiles, failure rate, cycles, turns, deaths). Deterministic given explicit
 * seeds/encounters (§80.4).
 */

export default (): Case[] => {
  const enc1: EncounterSpec = { id: 'target_1', waves: [[mob({ hp: 400_000, toughness: 120 })]], cycles: 4 }
  const enc3: EncounterSpec = { id: 'target_3', waves: [[mob({ hp: 400_000, toughness: 120, count: 3 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron' }, { id: 'pela' }],
    teamSize: 2,
    encounter: enc1,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const cfg: FullTeamConfig = {
    members: [{ kitId: 'acheron', build: {} }, { kitId: 'pela', build: {} }],
    encounter: enc1,
    seed: 7,
  }

  const one = exactSimulation(cfg, space, { seeds: [7, 8, 9] })
  const oneAgain = exactSimulation(cfg, space, { seeds: [7, 8, 9] })
  const multi = exactSimulation(cfg, space, { seeds: [7, 8], encounters: [enc1, enc3] })
  const d = one.totalDamage

  return [
    case_('exact: runs = seeds × encounters (3 seeds, 1 encounter)', one.runs === 3 && d.n === 3),
    case_('exact: percentile ladder is monotone (p10 ≤ p50 ≤ p90 ≤ p99)', d.p10 <= d.p50 && d.p50 <= d.p90 && d.p90 <= d.p99 && d.min <= d.p10 && d.p99 <= d.max),
    case_('exact: mean/median/variance are finite', [d.mean, d.median, d.variance, d.stdev].every(Number.isFinite)),
    case_('exact: failure rate and deaths are in range', one.failureRate >= 0 && one.failureRate <= 1 && one.deaths.mean >= 0),
    case_('exact: cycles and turns distributions are reported', one.cycles.n === 3 && one.turns.n === 3),
    case_('exact: multiple encounters → 4 runs and one summary per encounter', multi.runs === 4 && multi.perEncounter.length === 2 && multi.perEncounter.map(e => e.runs).join(',') === '2,2'),
    case_('exact: deterministic for the same seeds (§80.4)', JSON.stringify(one.totalDamage) === JSON.stringify(oneAgain.totalDamage) && one.raw.every((r, i) => r.totalDamage === oneAgain.raw[i]!.totalDamage)),
    case_('exact: raw run list carries encounter/seed identity', one.raw.every(r => r.encounter === 'target_1') && one.raw.map(r => r.seed).join(',') === '7,8,9'),
  ]
}
