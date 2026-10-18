import { case_, type Case } from '../../suites'
import {
  memberBuilds, teamCandidates, candidateCount, configToSetup, objectiveDirection,
  type SearchSpace, type CharacterPool,
} from '../../../src/optimizer/space'
import { validateBuild } from '../../../src/core/build'
import { runBattle } from '../../../src/core/battle'
import { mob } from '../../_helpers/battle'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §80 OPTIMIZATION VERIFICATION — the space contract, tested independently of any search/engine run:
 * §80.4 every constraint is an explicit field (nothing global), §80.3 enumeration is deterministic,
 * and a candidate compiles to a runnable `BattleSetup`. Enumeration correctness is checked against a
 * hand-computed cartesian size (the §80.1 brute-force precondition).
 */
const near = (a: number, b: number): boolean => a === b

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'opt_probe', waves: [[mob({ hp: 500_000, toughness: 160 })]], cycles: 4 }

  const richPool: CharacterPool = { id: 'acheron', eidolons: [0, 1], cones: ['in_the_night'], si: [1, 2], relicSets: ['pioneer'], planarSets: ['izumo'] }
  const barePool: CharacterPool = { id: 'pela' }

  const builds = memberBuilds(richPool)
  const buildsAgain = memberBuilds(richPool)
  const bare = memberBuilds(barePool)

  const tiny: SearchSpace = {
    members: [
      { id: 'acheron', cones: ['in_the_night'], eidolons: [0, 1] },
      { id: 'pela', cones: ['in_the_night'], eidolons: [0, 1] },
      { id: 'guinaifen' },
    ],
    teamSize: 2,
    encounter: enc,
    seed: 12345,
    objective: { primary: 'totalDamage' },
  }
  const candidates = [...teamCandidates(tiny)]
  const first = candidates[0]!
  const setup = configToSetup(tiny, first)

  let ranOk = false
  let rosterNote = ''
  try {
    const sim = runBattle(setup)
    ranOk = sim.roster.filter(u => u.side === 'ally').length === 2 && sim.rules?.seed === 12345
    rosterNote = `allies=${sim.roster.filter(u => u.side === 'ally').length} seed=${sim.rules?.seed}`
  } catch (e) {
    rosterNote = String(e)
  }

  const overLarge: SearchSpace = { ...tiny, maxCandidates: 1 }
  let refused = false
  try { void [...teamCandidates(overLarge)] } catch { refused = true }

  return [
    case_('memberBuilds: cartesian size = eidolons × cones × SI × sets', near(builds.length, 2 * 1 * 2 * 1 * 1), `got ${builds.length}`),
    case_('memberBuilds: every generated build resolves against the dataset', builds.every(b => validateBuild(b).length === 0), builds.map(b => validateBuild(b).join(',')).join(' | ')),
    case_('memberBuilds: deterministic order across calls', JSON.stringify(builds) === JSON.stringify(buildsAgain)),
    case_('memberBuilds: empty pool = a single bare build (no cone, no set)', bare.length === 1 && bare[0]!.cone === undefined && bare[0]!.relic === undefined),
    case_('candidateCount: matches a hand-computed team space', near(candidateCount(tiny), 8), `C(3,2) build-products = 2·2 + 2·1 + 2·1 = 8; got ${candidateCount(tiny)}`),
    case_('teamCandidates: yield count equals candidateCount', candidates.length === candidateCount(tiny), `${candidates.length} vs ${candidateCount(tiny)}`),
    case_('teamCandidates: every team draws DISTINCT members', candidates.every(c => new Set(c.members.map(m => m.kitId)).size === c.members.length)),
    case_('teamCandidates: seed + encounter carried onto every candidate', candidates.every(c => c.seed === 12345 && c.encounter.id === 'opt_probe')),
    case_('teamCandidates: enumeration is deterministic (§80.3)', JSON.stringify([...teamCandidates(tiny)]) === JSON.stringify(candidates)),
    case_('teamCandidates: refuses an over-large space via maxCandidates (§80.4)', refused),
    case_('toBattleSetup: candidate compiles to a runnable setup on the space seed', ranOk, rosterNote),
    case_('objectiveDirection: defaults lower-is-better/time metrics to min, others to max', objectiveDirection({ primary: 'cycles' }) === 'min' && objectiveDirection({ primary: 'totalDamage' }) === 'max' && objectiveDirection({ primary: 'cycles', direction: 'max' }) === 'max'),
  ]
}
