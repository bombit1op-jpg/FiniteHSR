import { runBattle, type BattleSetup, type TeamSpec } from '../core/battle'
import { teamMetrics, type TeamMetrics } from '../analysis/compare'
import type { EncounterSpec } from '../core/encounter'
import { configToSetup, type FullTeamConfig, type SearchSpace } from './space'

/**
 * §76 ABLATION / REPLACEMENT / TEAM VALUE MATRIX. For a top team, build the variants guide §76 lists —
 * remove each member, replace a member, swap gear/eidolon/SI — and report the five deltas it asks for:
 * score, cycles, resource (SP), survival, events. The point (§76) is "the best member FOR THIS exact
 * composition and build", so every row is measured against the SAME full team as baseline, same seed
 * and encounter — the delta isolates the single change (§80.4: all inputs explicit).
 *
 * §75 (eidolons/gear are part of the search input, not a post-filter) is already satisfied by
 * `space.ts`: a member's `CharacterPool` enumerates eidolons/cones/SI, so a variant team is just another
 * explicit `TeamSpec[]` here.
 */

export interface AblationOptions {
  encounter?: EncounterSpec
  seed?: number
  log?: BattleSetup['log']
}

/** §76 the five named deltas. `delta = variant − baseline`. */
export interface TeamDelta {
  scoreDelta: number
  cycleDelta: number
  resourceDelta: number
  survivalDelta: number
  eventDelta: number
}

export function metricsDelta(variant: TeamMetrics, baseline: TeamMetrics): TeamDelta {
  return {
    scoreDelta: variant.totalDamage - baseline.totalDamage,
    cycleDelta: variant.cycles - baseline.cycles,
    resourceDelta: variant.spFinal - baseline.spFinal,
    survivalDelta: variant.survival - baseline.survival,
    eventDelta: variant.events - baseline.events,
  }
}

function runTeam(team: TeamSpec[], space: SearchSpace, opts: AblationOptions): TeamMetrics {
  const cfg: FullTeamConfig = { members: team, encounter: opts.encounter ?? space.encounter, seed: opts.seed ?? space.seed }
  const sim = runBattle({ ...configToSetup(space, cfg), log: opts.log ?? { debug: 4 } })
  return teamMetrics(sim)
}

export interface VariantRow { label: string; metrics: TeamMetrics; delta: TeamDelta }
export interface VariantMatrix { baseline: TeamMetrics; rows: VariantRow[] }

/** §76 core: run a baseline team and any explicit variant teams, each delta taken against the baseline. */
export function variantMatrix(team: TeamSpec[], variants: Array<{ label: string; team: TeamSpec[] }>, space: SearchSpace, opts: AblationOptions = {}): VariantMatrix {
  const baseline = runTeam(team, space, opts)
  const rows = variants.map(v => {
    const metrics = runTeam(v.team, space, opts)
    return { label: v.label, metrics, delta: metricsDelta(metrics, baseline) }
  })
  return { baseline, rows }
}

/** §76 removal ablation: leave-one-member-out, each measured against the full team. */
export function teamAblation(team: TeamSpec[], space: SearchSpace, opts: AblationOptions = {}): VariantMatrix {
  const variants = team.map((m, i) => ({ label: `remove ${m.kitId}`, team: team.filter((_, j) => j !== i) }))
  return variantMatrix(team, variants, space, opts)
}

/** §76 replacement ablation: swap the member at `slot` for each candidate (build/eidolon/cone included). */
export function replacementMatrix(team: TeamSpec[], slot: number, candidates: TeamSpec[], space: SearchSpace, opts: AblationOptions = {}): VariantMatrix {
  if (slot < 0 || slot >= team.length) throw new Error(`replacementMatrix: slot ${slot} out of range (${team.length})`)
  const outgoing = team[slot]!.kitId
  const variants = candidates.map(c => ({ label: `${outgoing} → ${c.kitId}`, team: team.map((m, j) => (j === slot ? c : m)) }))
  return variantMatrix(team, variants, space, opts)
}
