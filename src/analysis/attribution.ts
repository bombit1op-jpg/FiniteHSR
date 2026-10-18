import type { Simulator } from '../core/simulator'
import type { BattleEvent } from '../core/battlelog'

/**
 * §39 ATTRIBUTION — multiple damage views over ONE completed battle, all read from the single event
 * stream + the engine's own `ownerDamage`/`ownerSkill`/`ownerAxis` accumulators (no parallel combat
 * logic). This is the single-run attribution; the causal views (marginal/pair/interaction) are pure
 * helpers over multiple runs' totals, because they need variant battles and belong to the sweep layer.
 *
 * Do NOT read `fullTeam - teamWithoutX` as causal: it is marginal contribution in that environment.
 */

export interface DamageAttribution {
  /** HP actually removed, Σ `DAMAGE_DEALT.payload.amount` (post-shield/redirect/mitigation) */
  totalApplied: number
  /** direct: applied damage by the attacking unit's display name */
  byAttacker: Record<string, number>
  /** owner: raw damage folded back to the owner, incl. summons (`sim.ownerDamage`) */
  byOwner: Record<string, number>
  /** by attack type axis (basic/skill/ult/fua/dot/...; `sim.ownerAxis` aggregated) */
  byAttackType: Record<string, number>
  /** by skill/ability label (`sim.ownerSkill` aggregated) */
  bySkill: Record<string, number>
  /** applied damage by element */
  byElement: Record<string, number>
}

const add = (rec: Record<string, number>, key: string, v: number): void => { rec[key] = (rec[key] ?? 0) + v }
const mergeNested = (out: Record<string, number>, m: Map<string, Map<string, number>>): void => {
  for (const inner of m.values()) for (const [k, v] of inner) add(out, k, v)
}
const amountOf = (e: BattleEvent): number => {
  const a = (e.payload as { amount?: unknown }).amount
  return typeof a === 'number' && Number.isFinite(a) ? a : 0
}

/** §39 single-run attribution views. Pure read of public sim state + the event stream. */
export function attributeDamage(sim: Simulator): DamageAttribution {
  const idToName = new Map(sim.roster.map(u => [u.id, u.name]))
  const byAttacker: Record<string, number> = {}
  const byElement: Record<string, number> = {}
  let totalApplied = 0
  for (const e of sim.logger.events) {
    if (e.type !== 'DAMAGE_DEALT') continue
    const amt = amountOf(e)
    totalApplied += amt
    if (e.element) add(byElement, e.element, amt)
    const sid = e.payload.sourceId
    const key = typeof sid === 'string' ? (idToName.get(sid) ?? sid) : (e.source ?? 'unknown')
    add(byAttacker, key, amt)
  }

  const byOwner: Record<string, number> = {}
  for (const [id, v] of sim.ownerDamage) add(byOwner, idToName.get(id) ?? id, v)

  const byAttackType: Record<string, number> = {}
  mergeNested(byAttackType, sim.ownerAxis)
  const bySkill: Record<string, number> = {}
  mergeNested(bySkill, sim.ownerSkill)

  return { totalApplied, byAttacker, byOwner, byAttackType, bySkill, byElement }
}

// ---- causal views (§39) — pure functions over multiple runs' totals ----

/** marginal contribution of an element: full team minus the same team without it (same environment). */
export function marginalContribution(full: number, without: number): number { return full - without }

/** interaction/synergy excess of a pair: full pair minus the sum of each alone. */
export function interactionContribution(full: number, aOnly: number, bOnly: number): number { return full - aOnly - bOnly }

/** share of a total, 0 when the total is empty. */
export function shareOf(value: number, total: number): number { return total ? value / total : 0 }
