import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import { candidateCount, type SearchSpace } from '../../../src/optimizer/space'
import { bruteForce } from '../../../src/optimizer/search'
import { beamSearch, pruningReport } from '../../../src/optimizer/beam'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §72.3 beam search + §80.2 pruning correctness. On a small space (§80.1/§80.2) a beam wide enough to
 * not actually prune must reproduce the exhaustive optimum exactly; a narrow beam must prune (fewer
 * evaluations) and `pruningReport` must report honestly whether the optimum survived. §80.4 the search
 * reads only its explicit `SearchSpace` (no globals); §80.3 it is deterministic.
 */

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'beam_probe', waves: [[mob({ hp: 600_000, toughness: 160 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron', eidolons: [0, 1] }, { id: 'pela' }, { id: 'luocha' }],
    teamSize: 2,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }

  const brute = bruteForce(space)
  const wide = beamSearch(space, { width: 99 })
  const narrow = beamSearch(space, { width: 1 })
  const wideAgain = beamSearch(space, { width: 99 })
  const report = pruningReport(space, { width: 99 })

  return [
    case_('beam (wide): frontier not pruned ⇒ best equals the exhaustive optimum (§80.2)', !!brute && !!wide.best && JSON.stringify(wide.best.config.members) === JSON.stringify(brute.config.members)),
    case_('beam (wide): pruningReport.match is true on the small space', report.match && report.bruteCandidates === candidateCount(space) && candidateCount(space) === 5),
    case_('beam: deterministic for the same space/seed/objective (§80.3)', JSON.stringify(wide.ranked.map(c => c.values)) === JSON.stringify(wideAgain.ranked.map(c => c.values))),
    case_('beam: narrow beam prunes (fewer partial evaluations than a wide beam)', narrow.evaluated < wide.evaluated, `narrow=${narrow.evaluated} wide=${wide.evaluated}`),
    case_('beam: frontierPeak never exceeds the wide frontier (narrow <= wide)', narrow.frontierPeak <= wide.frontierPeak),
    case_('beam: every returned leaf is a full team of distinct members', wide.ranked.every(c => c.config.members.length === space.teamSize && new Set(c.config.members.map(m => m.kitId)).size === space.teamSize)),
    case_('beam: ranked[0] is a feasible candidate when one exists', !!wide.ranked[0]?.feasible),
    case_('pruningReport: always reports a boolean match (never throws) for a narrow beam', typeof pruningReport(space, { width: 1 }).match === 'boolean'),
  ]
}
