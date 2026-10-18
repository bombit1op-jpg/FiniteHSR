import { evaluateSpace, rank, compareCandidates, type ScoredCandidate } from './search'
import type { ScoreOptions } from './score'
import type { SearchSpace } from './space'
import type { EncounterSpec } from '../core/encounter'

/**
 * §81 ENEMY / ENDGAME × TEAM OPTIMIZATION. The optimizer must NOT exist separately from the encounter
 * model (§81): the same team is legitimately #1 vs one boss and #8 vs an AoE wave. This module ranks the
 * same candidate space under several encounters and exposes each team's rank per encounter, so the
 * result is always "team X under encounter Y", never a context-free "best team". §83.7/§83.8.
 *
 * Exact (§80.1) exhaustive search is the authority here; use the pruned stages to shrink the space first.
 */

export interface EncounterRanking { encounter: string; ranked: ScoredCandidate[] }
export interface TeamRankRow {
  /** member identity: the team's kitIds joined — the same key across all encounters */
  key: string
  ranks: Array<{ encounter: string; rank: number; score: number; feasible: boolean }>
}

/** §81 rank the whole space under each encounter (exhaustive; the search space's own encounter is replaced). */
export function rankAcrossEncounters(space: SearchSpace, encounters: EncounterSpec[], opts: ScoreOptions = {}): EncounterRanking[] {
  return encounters.map(enc => ({ encounter: enc.id, ranked: rank(evaluateSpace({ ...space, encounter: enc }, opts), space.objective) }))
}

const teamKey = (c: ScoredCandidate): string => c.config.members.map(m => m.kitId).join('+')

/** §81 cross-encounter table: for every team, its rank + score under each encounter (rank 1 = best). */
export function teamRankTable(space: SearchSpace, encounters: EncounterSpec[], opts: ScoreOptions = {}): TeamRankRow[] {
  const perEncounter = rankAcrossEncounters(space, encounters, opts)
  const keys: string[] = []
  const seen = new Set<string>()
  for (const { ranked } of perEncounter) {
    for (const c of ranked) {
      const k = teamKey(c)
      if (!seen.has(k)) { seen.add(k); keys.push(k) }
    }
  }
  return keys.map(key => ({
    key,
    ranks: perEncounter.map(({ encounter, ranked }) => {
      const sorted = [...ranked].sort((a, b) => -compareCandidates(a, b, space.objective))
      const idx = sorted.findIndex(c => teamKey(c) === key)
      if (idx < 0) return { encounter, rank: NaN, score: NaN, feasible: false }
      const c = sorted[idx]!
      return { encounter, rank: idx + 1, score: c.values[space.objective.primary], feasible: c.feasible }
    }),
  }))
}
