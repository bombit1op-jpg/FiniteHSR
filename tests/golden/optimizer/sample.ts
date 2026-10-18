import { case_, type Case } from '../../suites'
import { sampleCandidate, sampleValues, evaluateSpaceSampled } from '../../../src/optimizer/sample'
import { compareValues, MULTI_RUN_METRICS } from '../../../src/optimizer/score'
import { configToSetup, teamCandidates, type SearchSpace } from '../../../src/optimizer/space'
import { mob } from '../../_helpers/battle'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §73 Monte-Carlo scoring. A candidate is sampled over several seeds; the two metrics a single run
 * cannot answer (`variance`, `consistency`) are derived from totalDamage's spread and become scorable
 * through the SAME `compareValues`. Determinism holds: a fixed seed set gives an identical summary.
 */
export default (): Case[] => {
  const enc: EncounterSpec = { id: 'opt_probe', waves: [[mob({ hp: 600_000, toughness: 160 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron', eidolons: [0, 1] }],
    teamSize: 1,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const setup = configToSetup(space, { members: [{ kitId: 'acheron', build: { eidolon: 0 } }], encounter: enc, seed: 7 })

  const a = sampleCandidate(setup, space.objective, { seeds: [7, 8, 9, 10] })
  const b = sampleCandidate(setup, space.objective, { seeds: [7, 8, 9, 10] })
  const vals = sampleValues(a)

  const unsat = sampleCandidate(setup, { primary: 'totalDamage', constraints: [{ metric: 'totalDamage', op: '<=', value: 0 }] }, { seeds: [7, 8] })
  const sat = sampleCandidate(setup, { primary: 'totalDamage', constraints: [{ metric: 'totalDamage', op: '>=', value: 0 }] }, { seeds: [7, 8] })

  const spaceResults = evaluateSpaceSampled(space, { seeds: [7, 8] })

  return [
    case_('sampleCandidate: one run per seed, seeds preserved', a.seeds.join(',') === '7,8,9,10' && a.runs.length === 4),
    case_('sampleCandidate: totalDamage summary is a real distribution', a.summary.totalDamage.mean > 0 && a.summary.totalDamage.variance >= 0 && a.summary.totalDamage.stdev >= 0 && a.summary.totalDamage.max >= a.summary.totalDamage.min),
    case_('sampleCandidate: deterministic for a fixed seed set (§80.3)', JSON.stringify(a.summary) === JSON.stringify(b.summary) && JSON.stringify(a.seeds) === JSON.stringify(b.seeds)),
    case_('sampleValues: variance + consistency are finite, none NaN', Number.isFinite(vals.totalDamage) && Number.isFinite(vals.variance) && Number.isFinite(vals.consistency) && Number.isFinite(vals.survival)),
    case_('consistency: a coefficient-of-variation complement within [0,1]', a.summary.consistency.mean >= 0 && a.summary.consistency.mean <= 1, String(a.summary.consistency.mean)),
    case_('§73 unblocks multi-run objectives: variance is scorable via the sampled path', compareValues(vals, { ...vals, variance: vals.variance + 1 }, { primary: 'variance' }) > 0),
    case_('sampleCandidate: feasibleRate = 0 when no seed satisfies the constraint', unsat.feasibleRate === 0, `rate=${unsat.feasibleRate}`),
    case_('sampleCandidate: feasibleRate = 1 when every seed satisfies', sat.feasibleRate === 1),
    case_('evaluateSpaceSampled: one aggregated result per enumerated candidate', spaceResults.length === [...teamCandidates(space)].length && spaceResults.every(r => Number.isFinite(r.values.totalDamage))),
    case_('the §73 metrics remain refused by the single-run path', MULTI_RUN_METRICS.includes('variance') && MULTI_RUN_METRICS.includes('consistency')),
    case_('sampleValues: determinism carries through aggregation', JSON.stringify(sampleValues(a)) === JSON.stringify(sampleValues(b))),
  ]
}
