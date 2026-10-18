import { configToSetup, memberBuilds, type SearchSpace, type FullTeamConfig, type CharacterPool } from './space'
import { evaluateCandidate, type ScoreOptions } from './score'
import { bruteForce, compareCandidates, type ScoredCandidate } from './search'

/**
 * §72.4 — JOINT BUILD OPTIMIZATION for a fixed team. §71/§72.4 forbid optimizing members one-by-one in
 * isolation; the accepted cheap alternative is coordinate search over the whole team:
 *
 *     optimize build of slot 1, holding the others fixed
 *     re-optimize slot 2, ...
 *     repeat until no slot improves (or maxRounds)
 *
 * `space` supplies each member's build envelope (`CharacterPool`); the team identities are fixed by
 * `teamIds`. Deterministic: no RNG, exhaustive per-slot scan in `memberBuilds` order, improvements only
 * accepted when strictly better. §80.1/§80.2: `jointReport` validates the coordinate result against the
 * exhaustive build optimum of the SAME team (brute force over the fixed team's build product).
 */

export interface JointOptions extends ScoreOptions {
  /** coordinate-descent rounds before giving up (default 8) */
  maxRounds?: number
}

export interface JointResult {
  best: ScoredCandidate
  rounds: number
  /** team-config battles evaluated (across all slots and rounds) */
  evaluated: number
}

/** §72.4 coordinate search for one fixed team. Throws when a `teamId` has no pool in `space`. */
export function jointTeamSearch(teamIds: string[], space: SearchSpace, opts: JointOptions = {}): JointResult {
  let evaluated = 0
  const members = teamIds.map(id => {
    const pool = space.members.find(m => m.id === id)
    if (!pool) throw new Error(`jointTeamSearch: unknown team member ${id}`)
    return { kitId: id, build: memberBuilds(pool)[0]! }
  })

  const grade = (): ScoredCandidate => {
    const cfg: FullTeamConfig = { members, encounter: space.encounter, seed: space.seed }
    evaluated++
    const r = evaluateCandidate(configToSetup(space, cfg), space.objective, opts)
    return { config: cfg, metrics: r.metrics, values: r.values, constraints: r.constraints, feasible: r.feasible }
  }

  let current = grade()
  const maxRounds = opts.maxRounds ?? 8
  let rounds = 0
  for (; rounds < maxRounds;) {
    let improved = false
    for (let j = 0; j < members.length; j++) {
      const kitId = members[j]!.kitId
      let bestBuild = members[j]!.build
      let bestScored = current
      for (const build of memberBuilds(space.members.find(m => m.id === kitId)!)) {
        members[j] = { kitId, build }
        const sc = grade()
        if (compareCandidates(sc, bestScored, space.objective) > 0) { bestScored = sc; bestBuild = build }
      }
      members[j] = { kitId, build: bestBuild }
      if (compareCandidates(bestScored, current, space.objective) > 0) { current = bestScored; improved = true }
    }
    rounds++
    if (!improved) break
  }

  return { best: current, rounds, evaluated }
}

export interface JointReport {
  /** does coordinate search reach the exhaustive build optimum of the same team? */
  match: boolean
  joint?: ScoredCandidate
  brute?: ScoredCandidate
  jointEvaluated: number
  bruteCandidates: number
}

/** §80.1/§80.2 — validate joint build optimization against brute force over the SAME team's build space. */
export function jointReport(teamIds: string[], space: SearchSpace, opts: ScoreOptions = {}): JointReport {
  const members = teamIds.map(id => {
    const pool = space.members.find(m => m.id === id)
    if (!pool) throw new Error(`jointReport: unknown team member ${id}`)
    return pool
  })
  const subSpace: SearchSpace = { ...space, members, teamSize: members.length }
  const brute = bruteForce(subSpace, opts)
  const joint = jointTeamSearch(teamIds, space, opts)
  const match = !!brute && compareCandidates(brute, joint.best, space.objective) === 0
  return { match, joint: joint.best, brute, jointEvaluated: joint.evaluated, bruteCandidates: memberCount(subSpace) }
}

/** candidate count for a space whose member combination is fixed (characterCount = members.length). */
function memberCount(space: SearchSpace): number {
  return space.members.reduce((n, m: CharacterPool) => n * memberBuilds(m).length, 1)
}
