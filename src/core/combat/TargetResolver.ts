/**
 * Enemy target resolution (guide §62). One deterministic pipeline instead of the ad-hoc
 * `pickTargetByAggro` / `forcedTargetFor` calls previously scattered in TurnManager.
 *
 * Levels, highest priority first (guide §62):
 *   1. geometry rules — `aoe` returns every candidate, `self` returns none
 *   2. forced target (Taunt / `TargetOverride`, guide §25)
 *   3. marked target (enemy mark rules)
 *   4. locked target (phase/ability lock)
 *   5. deterministic HP rules — `lowest_hp` / `highest_hp`
 *   6. `random` (uniform) and the default weighted-aggro draw (covers `single`/`aggro`)
 *
 * The resolver is pure: the caller supplies `weights` (base aggro + buff aggro) and the seeded
 * `rng`, so it consumes exactly the rolls its chosen rule needs (weighted/random = 1, the rest = 0).
 * Golden traces depend on that roll count matching the pre-§62 code exactly.
 */
import type { Unit } from '../entities/Unit'

export type TargetRule =
  | 'single' | 'aoe' | 'self' | 'blast'
  | 'random' | 'lowest_hp' | 'highest_hp'
  | 'aggro' | 'weighted_aggro'
  | 'forced' | 'marked' | 'locked'

export interface TargetContext {
  actorId: string
  rule: TargetRule
  candidates: Unit[]
  /** precomputed aggro weights in candidate order (base `aggro` + buff aggro); default = `u.aggro ?? 100` */
  weights?: number[]
  /** §25 Taunt: a validated pinned target (already restricted to `candidates`) */
  forcedTarget?: Unit
  /** enemy mark rule: preferred target */
  markedTarget?: Unit
  /** phase/ability lock: hard-pinned target */
  lockedTarget?: Unit
  rng: () => number
}

/** §62 `TargetSelection` — the resolved targets plus the debug trail of how they were chosen. */
export interface TargetSelection {
  targets: Unit[]
  rule: TargetRule
  reason: string
  /** candidate names snapshot (debug: `candidates=...`) */
  candidates: string[]
  /** weights used for the weighted draw, candidate order (debug: `weights=...`) */
  weights: number[]
  /** the raw roll for weighted/random rules (test/debug only — never a scalar in the event payload) */
  rngRoll?: number
}

const baseWeight = (u: Unit): number => u.aggro ?? 100

/** weighted draw: exactly one `rng()` call, identical arithmetic to the pre-§62 `pickTargetByAggro`. */
function weightedPick(candidates: Unit[], weights: number[], roll: number): Unit {
  const total = weights.reduce((a, w) => a + w, 0)
  let acc = roll * total
  for (let i = 0; i < candidates.length; i++) {
    acc -= weights[i]!
    if (acc <= 0) return candidates[i]!
  }
  return candidates[candidates.length - 1]!
}

function hpPick(candidates: Unit[], highest: boolean): Unit {
  let best = candidates[0]!
  for (const u of candidates) if (highest ? u.hp > best.hp : u.hp < best.hp) best = u
  return best
}

export function resolveTargets(ctx: TargetContext): TargetSelection {
  const { candidates } = ctx
  const names = candidates.map(u => u.name)
  const weights = ctx.weights ?? candidates.map(baseWeight)

  if (!candidates.length) return { targets: [], rule: ctx.rule, reason: 'no candidates', candidates: [], weights: [] }

  if (ctx.rule === 'aoe') return { targets: [...candidates], rule: 'aoe', reason: 'aoe — every candidate', candidates: names, weights }
  if (ctx.rule === 'self') return { targets: [], rule: 'self', reason: 'self — no targets', candidates: names, weights: [] }

  if (ctx.forcedTarget) return { targets: [ctx.forcedTarget], rule: 'forced', reason: 'forced (Taunt)', candidates: names, weights }
  if (ctx.markedTarget) return { targets: [ctx.markedTarget], rule: 'marked', reason: 'marked target', candidates: names, weights }
  if (ctx.lockedTarget) return { targets: [ctx.lockedTarget], rule: 'locked', reason: 'locked target', candidates: names, weights }

  if (ctx.rule === 'lowest_hp') return { targets: [hpPick(candidates, false)], rule: 'lowest_hp', reason: 'lowest HP', candidates: names, weights }
  if (ctx.rule === 'highest_hp') return { targets: [hpPick(candidates, true)], rule: 'highest_hp', reason: 'highest HP', candidates: names, weights }

  if (ctx.rule === 'random') {
    const roll = ctx.rng()
    const picked = candidates[Math.min(candidates.length - 1, Math.floor(roll * candidates.length))]!
    return { targets: [picked], rule: 'random', reason: 'uniform random', candidates: names, weights, rngRoll: roll }
  }

  // default: weighted aggro (covers 'single', 'aggro', 'weighted_aggro')
  const roll = ctx.rng()
  return {
    targets: [weightedPick(candidates, weights, roll)],
    rule: 'weighted_aggro',
    reason: `weighted aggro (weights ${weights.join(',')})`,
    candidates: names, weights, rngRoll: roll,
  }
}
