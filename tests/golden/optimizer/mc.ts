/**
 * §73 Monte-Carlo-assisted search. §72.3 asks not to simulate every team in equal detail and §72.5 asks
 * for exact simulation only on top candidates; this stage screens EVERY candidate cheaply (sampled) and
 * re-scores only a shortlist precisely. The exhaustive reference is the authority (§80.2), and when the
 * screen is wide enough to keep everything the two-stage result must equal it. Determinism: the same
 * seed set gives the same screen and result (§80.3).
 */
import { case_ } from '../../suites'
import { mob } from '../../_helpers/battle'
import { candidateCount, type SearchSpace } from '../../../src/optimizer/space'
import { mcAssistedSearch, mcReport, objectiveUsesMultiRun } from '../../../src/optimizer/mc'
import type { EncounterSpec } from '../../../src/core/encounter'

export default () => {
  const enc: EncounterSpec = { id: 'mc_probe', waves: [[mob({ hp: 600_000, toughness: 160 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron', eidolons: [0, 1] }, { id: 'pela' }, { id: 'luocha' }],
    teamSize: 2,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const multiSpace: SearchSpace = { ...space, objective: { primary: 'variance' } }

  const wide = mcAssistedSearch(space)
  const wideAgain = mcAssistedSearch(space)
  const narrow = mcAssistedSearch(space, { shortlist: 1 })
  const reportWide = mcReport(space)
  const reportNarrow = mcReport(space, { shortlist: 1 })
  const reportMulti = mcReport(multiSpace)
  const mcMulti = mcAssistedSearch(multiSpace)

  return [
    case_('mc: candidate space is enumerable and non-trivial', candidateCount(space) === 5),
    case_('mc: wide shortlist screens the whole space and advances all of it', wide.screened === candidateCount(space) && wide.shortlisted === candidateCount(space)),
    case_('mc: wide shortlist ⇒ result equals the exhaustive reference (§80.2)', reportWide.match === true),
    case_('mc: wide shortlist keeps the exhaustive optimum in the frontier', reportWide.shortlistHasOptimum === true),
    case_('mc: deterministic for the same space/seed/objective (§80.3)', JSON.stringify(wide.ranked.map(c => c.values)) === JSON.stringify(wideAgain.ranked.map(c => c.values))),
    case_('mc: narrow shortlist advances exactly its width to the precise stage', narrow.shortlisted === 1 && narrow.screened === candidateCount(space)),
    case_('mc: ranked[0] is feasible and `best` is defined (unconstrained objective)', !!wide.ranked[0]?.feasible && !!wide.best),
    case_('mc: every returned config is a full team of distinct members', wide.ranked.every(c => c.config.members.length === space.teamSize && new Set(c.config.members.map(m => m.kitId)).size === space.teamSize)),
    case_('mc: the precise stage is exact for a single-run objective', wide.ranked[0]!.values.variance === null || Number.isNaN(wide.ranked[0]!.values.variance)),
    case_('mc: multi-run objective is routed to the sampling regime', objectiveUsesMultiRun(multiSpace.objective) && !objectiveUsesMultiRun(space.objective)),
    case_('mc: a multi-run objective (variance) is scorable without throwing', Number.isFinite(mcMulti.best?.values.variance ?? NaN)),
    case_('mc: multi-run wide shortlist ⇒ result equals the exhaustive sampled reference', reportMulti.match === true),
    case_('mcReport: always reports a boolean match (never throws) for a narrow shortlist', typeof reportNarrow.match === 'boolean'),
    case_('mcReport: exact-vs-exhaustive optimum is reported when the frontier keeps it', reportWide.shortlistHasOptimum && !!reportWide.oracle && !!reportWide.mc),
  ]
}
