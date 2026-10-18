import type { Unit } from '../entities/Unit'
import type { EnemyAbilityDefinition } from './ability'

/** §61 — enemy Counter state (canon: Silvermane Lieutenant "Shield Reflect" — "When attacked by
 *  a single character, acts immediately and casts 'Pierce' on the attacker"). The state lives
 *  PER_BATTLE, off the Unit (mirrors `EnemyAIRuntime`); entering fires from an enemy ability
 *  effect `{ op: 'counter' }`; the trigger is wired once in DamagePipeline (any single-target
 *  ally attack on a countering enemy casts its counter ability at the attacker). */
export interface EnemyCounterDef {
  /** the ability cast at the attacker when the counter fires */
  ability: EnemyAbilityDefinition
  /** 'once': clears after the first fire; 'manual': persists until reset/battle end (canon
   *  Lieutenant keeps Counter state until its summoned allies are defeated). */
  exit: 'once' | 'manual'
}

interface EnemyCounterEntry {
  def: EnemyCounterDef
  /** attackSeq the counter last fired on (-1 = never); the gate is once-per-attack (§5) */
  firedSeq: number
}

const STATES = new WeakMap<Unit, EnemyCounterEntry>()

export function enemyCounterOf(u: Unit): EnemyCounterDef | undefined {
  return STATES.get(u)?.def
}

/** enter a counter state; the first state wins (no stacking). */
export function enterEnemyCounter(u: Unit, def: EnemyCounterDef): void {
  if (STATES.has(u)) return
  STATES.set(u, { def, firedSeq: -1 })
}

export function resetEnemyCounter(u: Unit): void {
  STATES.delete(u)
}

export function counterFiredSeq(u: Unit): number {
  return STATES.get(u)?.firedSeq ?? -1
}

export function markCounterFired(u: Unit, seq: number): void {
  const st = STATES.get(u)
  if (st) st.firedSeq = seq
}