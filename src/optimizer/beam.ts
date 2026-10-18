import {
  configToSetup, memberBuilds, candidateCount,
  type SearchSpace, type FullTeamConfig,
} from './space'
import type { TeamSpec } from '../core/battle'
import { evaluateCandidate, type ScoreOptions } from './score'
import { bruteForce, compareCandidates, type ScoredCandidate } from './search'

/**
 * §72.3 — TEAM EXPANSION by BEAM SEARCH. This is the APPROXIMATE stage: it prunes member combinations
 * level by level, evaluating each partial team (a real, smaller battle) and keeping the top-`width`
 * frontier. It is NOT the authority — `bruteForce` (§80.1) is. §80.2 asks that pruning be validated
 * against exhaustive search on small spaces, so `pruningReport` compares the two and reports whether the
 * optimum survived (it is a check, never a guarantee: beam search can, by design, prune the optimum).
 *
 * §72.1 role filtering and §72.2 compatibility ranking are candidate heuristics layered on TOP of this
 * frontier; they are intentionally not folded in here (a role rule invented here would be fabrication).
 */

export interface BeamOptions extends ScoreOptions {
  /** frontier width kept at each level (default 8). `width` ≥ the frontier size ⇒ exhaustive. */
  width?: number
}

export interface BeamResult {
  best?: ScoredCandidate
  ranked: ScoredCandidate[]
  /** total partial-team battles evaluated (intermediate levels included) */
  evaluated: number
  /** largest pre-prune frontier seen */
  frontierPeak: number
}

interface Node { members: TeamSpec[]; lastIndex: number; scored: ScoredCandidate }

/** §72.3 beam search over member combinations. Deterministic: same space/seed/objective ⇒ same result. */
export function beamSearch(space: SearchSpace, opts: BeamOptions = {}): BeamResult {
  const width = opts.width ?? 8
  const buildsByPool = space.members.map(memberBuilds)
  let evaluated = 0
  let frontierPeak = 0

  const grade = (members: TeamSpec[]): ScoredCandidate => {
    const cfg: FullTeamConfig = { members, encounter: space.encounter, seed: space.seed }
    evaluated++
    const r = evaluateCandidate(configToSetup(space, cfg), space.objective, opts)
    return { config: cfg, metrics: r.metrics, values: r.values, constraints: r.constraints, feasible: r.feasible }
  }

  let frontier: Node[] = [{ members: [], lastIndex: -1, scored: undefined as unknown as ScoredCandidate }]
  for (let level = 0; level < space.teamSize; level++) {
    const expanded: Node[] = []
    for (const node of frontier) {
      for (let i = node.lastIndex + 1; i < space.members.length; i++) {
        const pool = space.members[i]!
        for (const build of buildsByPool[i]!) {
          const members: TeamSpec[] = [...node.members, { kitId: pool.id, build }]
          expanded.push({ members, lastIndex: i, scored: grade(members) })
        }
      }
    }
    if (expanded.length > frontierPeak) frontierPeak = expanded.length
    expanded.sort((a, b) => -compareCandidates(a.scored, b.scored, space.objective))
    frontier = expanded.slice(0, width)
  }

  const ranked = frontier.map(n => n.scored).sort((a, b) => -compareCandidates(a, b, space.objective))
  return { best: ranked.find(c => c.feasible), ranked, evaluated, frontierPeak }
}

export interface PruningReport {
  /** §80.2: does the pruned search reach the same optimum as brute force? */
  match: boolean
  brute?: ScoredCandidate
  beam?: ScoredCandidate
  bruteCandidates: number
  beamEvaluated: number
  frontierPeak: number
}

/** §80.2 pruning correctness: exhaustive optimum vs the beam result on the same space. */
export function pruningReport(space: SearchSpace, opts: BeamOptions = {}): PruningReport {
  const brute = bruteForce(space, opts)
  const beam = beamSearch(space, opts)
  const match = !!brute && !!beam.best && compareCandidates(brute, beam.best, space.objective) === 0
  return { match, brute, beam: beam.best, bruteCandidates: candidateCount(space), beamEvaluated: beam.evaluated, frontierPeak: beam.frontierPeak }
}
