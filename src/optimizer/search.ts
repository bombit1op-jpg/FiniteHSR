/**
 * §72 — SEARCH over the space contract. This stage provides the deterministic BASELINE: an exhaustive
 * `bruteForce` (the §80.1 optimum that any smarter stage must match), a stable `rank`, and `topK`.
 * Pruning/beam/branch-and-bound are later stages (§72.3); every one of them is validated by comparing
 * its result against `bruteForce` on a small space (§80.2), so this layer is the reference oracle.
 *
 * Ranking is feasible-first, then lexicographic by the objective (§74), with ties left in enumeration
 * order (Array.sort is stable) — so "same config + seed + objective ⇒ same ranking" (§80.3) holds.
 */
import { configToSetup, teamCandidates, type SearchSpace, type FullTeamConfig, type Objective } from './space'
import { compareValues, evaluateCandidate, type MetricValues, type ConstraintResult, type ScoreOptions } from './score'
import type { TeamMetrics } from '../analysis/compare'

export interface ScoredCandidate {
  config: FullTeamConfig
  metrics: TeamMetrics
  values: MetricValues
  constraints: ConstraintResult[]
  feasible: boolean
}

/** run every candidate in the space (bounded by `SearchSpace.maxCandidates`) and grade each. */
export function evaluateSpace(space: SearchSpace, opts: ScoreOptions = {}): ScoredCandidate[] {
  const out: ScoredCandidate[] = []
  for (const cfg of teamCandidates(space)) {
    const r = evaluateCandidate(configToSetup(space, cfg), space.objective, opts)
    out.push({ config: cfg, metrics: r.metrics, values: r.values, constraints: r.constraints, feasible: r.feasible })
  }
  return out
}

/** feasibility gate first (a feasible candidate always outranks an infeasible one), then objective. */
export function compareCandidates(a: ScoredCandidate, b: ScoredCandidate, o: Objective): number {
  if (a.feasible !== b.feasible) return a.feasible ? 1 : -1
  return compareValues(a.values, b.values, o)
}

/** descending rank (best first); stable, so equal candidates keep enumeration order. */
export function rank(candidates: ScoredCandidate[], o: Objective): ScoredCandidate[] {
  return [...candidates].sort((a, b) => -compareCandidates(a, b, o))
}

/** the best FEASIBLE candidate, or undefined when none satisfies the constraints. */
export function best(candidates: ScoredCandidate[], o: Objective): ScoredCandidate | undefined {
  const first = rank(candidates, o)[0]
  return first && first.feasible ? first : undefined
}

/** §80.1 exhaustive baseline: load the whole space, return its optimum. */
export function bruteForce(space: SearchSpace, opts: ScoreOptions = {}): ScoredCandidate | undefined {
  return best(evaluateSpace(space, opts), space.objective)
}

/** top-K feasible-first candidates for a space. */
export function topK(space: SearchSpace, k: number, opts: ScoreOptions = {}): ScoredCandidate[] {
  return rank(evaluateSpace(space, opts), space.objective).slice(0, Math.max(0, k))
}
