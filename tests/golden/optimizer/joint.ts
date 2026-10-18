import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import type { SearchSpace } from '../../../src/optimizer/space'
import { jointTeamSearch, jointReport } from '../../../src/optimizer/joint'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §72.4 joint build optimization (coordinate search) + §80.1/§80.2 validation against brute force over
 * the SAME team's build product. Deterministic (§80.3): exhaustive per-slot scans, no RNG; reads only
 * its explicit `SearchSpace` (§80.4).
 */

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'joint_probe', waves: [[mob({ hp: 600_000, toughness: 160 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron', eidolons: [0, 1] }, { id: 'pela' }],
    teamSize: 2,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const team = ['acheron', 'pela']

  const run = jointTeamSearch(team, space)
  const again = jointTeamSearch(team, space)
  const report = jointReport(team, space)

  let threw = false
  try { jointTeamSearch(['acheron', 'not_a_member'], space) } catch { threw = true }

  return [
    case_('joint: returns a two-member team with the requested identities', run.best.config.members.length === 2 && run.best.config.members.map(m => m.kitId).join(',') === 'acheron,pela'),
    case_('joint: coordinate search reaches the exhaustive build optimum of the same team (§80.2)', report.match && !!report.brute),
    case_('joint: deterministic for the same space/seed (§80.3)', JSON.stringify(run.best.config.members) === JSON.stringify(again.best.config.members)),
    case_('joint: evaluated > 0 and rounds >= 1', run.evaluated > 0 && run.rounds >= 1, `evaluated=${run.evaluated} rounds=${run.rounds}`),
    case_('joint: throws when a team id has no pool in the space', threw),
    case_('joint: bruteCandidates equals the fixed-team build product (acheron 2 × pela 1)', report.bruteCandidates === 2),
    case_('joint: result is a feasible candidate', run.best.feasible),
  ]
}
