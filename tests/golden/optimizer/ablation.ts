import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import { teamAblation, replacementMatrix, variantMatrix, metricsDelta } from '../../../src/optimizer/ablation'
import type { SearchSpace } from '../../../src/optimizer/space'
import type { TeamSpec } from '../../../src/core/battle'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §76 ablation / replacement / team value matrix. Every row is a delta against the same full-team
 * baseline (§76); determinism given explicit seed/encounter (§80.4).
 */

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'ablate', waves: [[mob({ hp: 500_000, toughness: 140 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron' }, { id: 'pela' }, { id: 'luocha' }, { id: 'kafka' }],
    teamSize: 3,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const team: TeamSpec[] = [{ kitId: 'acheron', build: {} }, { kitId: 'pela', build: {} }, { kitId: 'luocha', build: {} }]

  const abl = teamAblation(team, space)
  const ablAgain = teamAblation(team, space)
  const repl = replacementMatrix(team, 1, [{ kitId: 'kafka', build: {} }], space)
  const variants = variantMatrix(team, [{ label: 'full team', team }], space)

  let threw = false
  try { replacementMatrix(team, 9, [{ kitId: 'kafka', build: {} }], space) } catch { threw = true }

  return [
    case_('teamAblation: one removal row per member', abl.rows.length === 3 && abl.rows[1]!.label === 'remove pela'),
    case_('teamAblation: row delta equals metricsDelta(row, baseline)', JSON.stringify(abl.rows[0]!.delta) === JSON.stringify(metricsDelta(abl.rows[0]!.metrics, abl.baseline))),
    case_('ablation: deterministic for the same seed/encounter (§80.4)', JSON.stringify(abl.rows.map(r => r.delta)) === JSON.stringify(ablAgain.rows.map(r => r.delta))),
    case_('teamAblation: baseline is a full-team metric set', abl.baseline.totalDamage > 0 && abl.baseline.cycles >= 1),
    case_('replacementMatrix: labels outgoing → incoming', repl.rows.length === 1 && repl.rows[0]!.label === 'pela → kafka'),
    case_('replacementMatrix: throws on an out-of-range slot', threw),
    case_('variantMatrix: an identical variant has zero delta', variants.rows[0]!.delta.scoreDelta === 0 && variants.rows[0]!.delta.eventDelta === 0),
    case_('delta: self-difference is all zeros', JSON.stringify(metricsDelta(abl.baseline, abl.baseline)) === JSON.stringify({ scoreDelta: 0, cycleDelta: 0, resourceDelta: 0, survivalDelta: 0, eventDelta: 0 })),
  ]
}
