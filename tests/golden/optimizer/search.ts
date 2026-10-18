import { case_, type Case } from '../../suites'
import { teamCandidates, type SearchSpace } from '../../../src/optimizer/space'
import { compareValues, checkConstraints, isFeasible, assertSingleRun, MULTI_RUN_METRICS, type MetricValues } from '../../../src/optimizer/score'
import { evaluateSpace, bruteForce, rank, best, topK, compareCandidates } from '../../../src/optimizer/search'
import { mob } from '../../_helpers/battle'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §72/§80 — scoring + exhaustive search. The oracle's §74 metrics come from a real run; the search is
 * checked against its own brute-force (§80.1), ranking is stable (§80.3), and the §73 boundary (a
 * multi-run metric cannot be answered by a single run) is enforced rather than faked with NaN.
 */
const V = (over: Partial<MetricValues>): MetricValues => ({
  totalDamage: 0, dps: 0, dpa: 0, burstDamage: 0, cycles: 1, turns: 0, variance: NaN,
  survival: 1, healing: 0, shielding: 0, resourceEfficiency: 0, consistency: NaN, ...over,
})

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'opt_probe', waves: [[mob({ hp: 600_000, toughness: 160 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron', eidolons: [0, 1] }],
    teamSize: 1,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }

  const cands = evaluateSpace(space)
  const cands2 = evaluateSpace(space)
  const bf = bruteForce(space)
  const maxDmg = Math.max(...cands.map(c => c.values.totalDamage))

  // synthetic value records for direction / constraint unit checks (no engine needed)
  const fast = V({ totalDamage: 100, cycles: 3 })
  const slow = V({ totalDamage: 200, cycles: 5 })

  let threw = false
  try { assertSingleRun({ primary: 'variance' }) } catch { threw = true }

  return [
    case_('evaluateSpace: one graded result per enumerated candidate', cands.length === [...teamCandidates(space)].length && cands.length === 2, `got ${cands.length}`),
    case_('evaluateSpace: scoring a real battle produces positive total damage', cands.every(c => c.values.totalDamage > 0), cands.map(c => Math.round(c.values.totalDamage)).join(',')),
    case_('evaluateSpace: deterministic across calls (§80.3)', JSON.stringify(cands.map(c => c.values)) === JSON.stringify(cands2.map(c => c.values))),
    case_('bruteForce: returns the exhaustive optimum (§80.1)', !!bf && bf.feasible && bf.values.totalDamage === maxDmg, `bf=${bf ? Math.round(bf.values.totalDamage) : 'none'} max=${Math.round(maxDmg)}`),
    case_('rank: best-first and total order preserved for equal values', rank(cands, space.objective).length === cands.length && rank(cands, space.objective)[0]!.values.totalDamage === maxDmg),
    case_('best: picks the top FEASIBLE candidate', best(cands, space.objective)?.values.totalDamage === maxDmg),
    case_('topK: bounded slice, K > space returns the whole ranked set', topK(space, 1).length === 1 && topK(space, 99).length === cands.length),
    case_('compareValues: honours direction (min-cycles prefers the faster build)', compareValues(fast, slow, { primary: 'cycles' }) > 0 && compareValues(fast, slow, { primary: 'totalDamage' }) < 0),
    case_('compareValues: secondary is a tie-break only', compareValues(V({ totalDamage: 50, cycles: 3 }), V({ totalDamage: 50, cycles: 5 }), { primary: 'totalDamage', secondary: ['cycles'] }) > 0),
    case_('constraints: unsatisfiable bound ⇒ infeasible, and best() skips infeasible candidates', !isFeasible(V({ totalDamage: 100 }), { primary: 'totalDamage', constraints: [{ metric: 'totalDamage', op: '>=', value: 1e12 }] }) && best([{ ...cands[0]!, feasible: false }], space.objective) === undefined),
    case_('constraints: satisfied bound keeps candidates feasible', isFeasible(V({ totalDamage: 100 }), { primary: 'totalDamage', constraints: [{ metric: 'totalDamage', op: '>=', value: 0 }] }) && checkConstraints(V({ totalDamage: 100 }), { primary: 'totalDamage', constraints: [{ metric: 'totalDamage', op: '>=', value: 0 }] })[0]!.ok),
    case_('§73 boundary: a multi-run metric is refused, not NaN-scored', threw && MULTI_RUN_METRICS.includes('variance')),
    case_('objectiveValue: single-run metrics are finite, multi-run metrics are NaN', (() => { const v = cands[0]!.values; return Number.isFinite(v.totalDamage) && Number.isFinite(v.dps) && Number.isNaN(v.variance) && Number.isNaN(v.consistency) })()),
    case_('compareCandidates: feasible always outranks infeasible', compareCandidates({ ...cands[0]!, feasible: true }, { ...cands[0]!, feasible: false, values: V({ totalDamage: 1e12 }) }, { primary: 'totalDamage' }) > 0),
  ]
}
