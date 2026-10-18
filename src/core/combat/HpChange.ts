import type { Unit } from '../entities/Unit'

/** §8 HP semantics — the typed choke-point for HP mutation OUTSIDE the damage/heal pipelines.
 *
 *  The pipelines (`DamagePipeline`/`BreakResolver`/`TurnManager` ticks/`HealingPipeline`) own
 *  resolved incoming damage and keep their own application sites + events. Everything else a kit or
 *  piece of gear does to HP — self-cost, team drain, redirect, absolute set, restore — must classify
 *  its intent here instead of writing `unit.hp -= x`/`unit.hp = y` directly, so the kind is explicit
 *  and the clamp policy lives in one place.
 *
 *  Kinds (§8 "Не смешивать"):
 *    damage / break / dot / true  incoming damage applied by a pipeline (no default floor)
 *    cost        own HP paid for an ability / summon cost (default floor 1)
 *    drain       HP removed from others into a pool or resource (default floor 1)
 *    redirect    HP moved from one ally onto another entity (default floor 0)
 *    heal/revive restore (default ceil maxHp)
 *    set         absolute assignment / clamp (no default clamp)
 *    spawn/init  entity creation / battle-setup bookkeeping — allowed to write `unit.hp` directly
 */
export type HpChangeKind =
  | 'damage' | 'break' | 'dot' | 'true'
  | 'cost' | 'drain' | 'redirect'
  | 'heal' | 'revive' | 'set'
  | 'spawn' | 'init'

export interface HpChangeOpts {
  /** lower bound the change may reach (default: 1 for 'cost'/'drain', else 0) */
  floor?: number
  /** upper bound the change may reach (default: maxHp for 'heal'/'revive', else Infinity) */
  ceil?: number
}

/** Apply a signed HP delta (negative = loss, positive = restore) with explicit bounds; returns the
 *  actual signed delta applied.
 *
 *  Pure mutation: it does NOT fire `onAllyHpLoss` hooks nor resolve death. Callers keep their
 *  existing hook/kill ordering, so converting a raw write to `hpChange` cannot reorder events. */
export function applyHpChange(target: Unit, delta: number, kind: HpChangeKind, opts: HpChangeOpts = {}): number {
  const before = target.hp
  const floor = opts.floor ?? (kind === 'cost' || kind === 'drain' ? 1 : kind === 'spawn' || kind === 'init' ? -Infinity : 0)
  const ceil = opts.ceil ?? (kind === 'heal' || kind === 'revive' ? target.maxHp : Infinity)
  const next = Math.min(ceil, Math.max(floor, before + delta))
  target.hp = next
  return next - before
}
