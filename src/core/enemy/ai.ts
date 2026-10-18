import type { Unit } from '../entities/Unit'
import type { SimApi } from '../kit'
import type { EnemyAbilityDefinition } from './ability'
import type { EnemyPhaseDefinition } from './phase'
import type { EnemyPassive } from './passive'

/** §54 — the AI is data + a small chooser, separated from the ability definitions.
 *  `EnemyBehavior` binds an ability set to one AI (and, optionally, a §56 phase state machine),
 *  so a definition never hard-codes "what this enemy picks". */

export interface EnemyBehavior {
  abilities: EnemyAbilityDefinition[]
  ai: EnemyAI
  /** §56 — optional phase list; when present `enemyTurn` evaluates it before choosing. */
  phases?: EnemyPhaseDefinition[]
  /** §57 — optional reaction hooks (onSpawn/onHitTaken/onTurnEnd), e.g. War Armor. */
  passive?: EnemyPassive
}

export interface EnemyAI {
  /** pick a ready ability; `undefined` falls back to the built-in default attack */
  choose(sim: SimApi, actor: Unit, rt: EnemyAIRuntime, behavior: EnemyBehavior, targetCount: number): EnemyAbilityDefinition | undefined
}

/** per-battle mutable AI state (§9 lifetime = PER_BATTLE, stored off the Unit) */
export interface EnemyAIRuntime {
  /** PatternAI cursor */
  patternIndex: number
  /** ability id → turns of cooldown remaining */
  cooldowns: Record<string, number>
  /** ability id → uses remaining */
  charges: Record<string, number>
  /** §55 active telegraph: ability being charged + turns left */
  casting: { id: string; turnsLeft: number } | null
}

const RUNTIMES = new WeakMap<Unit, EnemyAIRuntime>()

export function enemyRuntimeOf(actor: Unit): EnemyAIRuntime {
  let r = RUNTIMES.get(actor)
  if (!r) { r = { patternIndex: 0, cooldowns: {}, charges: {}, casting: null }; RUNTIMES.set(actor, r) }
  return r
}

/** drop a unit's AI state (regen / new battle) */
export function resetEnemyRuntime(actor: Unit): void { RUNTIMES.delete(actor) }

/** §54.1 SimpleAI — highest `aiPriority` among ready abilities (ties → declaration order). */
export class SimpleAI implements EnemyAI {
  choose(_sim: SimApi, actor: Unit, rt: EnemyAIRuntime, behavior: EnemyBehavior): EnemyAbilityDefinition | undefined {
    const ready = behavior.abilities.filter(a => isReady(rt, actor, a))
    if (!ready.length) return undefined
    return ready.reduce((best, a) => ((a.aiPriority ?? 0) > (best.aiPriority ?? 0) ? a : best))
  }
}

/** §54.2 PatternAI — a fixed rotation of ability ids, looped. A step whose ability is on
 *  cooldown/exhausted is skipped forward to the next ready id in the pattern. */
export class PatternAI implements EnemyAI {
  constructor(private pattern: string[], private repeat = true) {}

  choose(_sim: SimApi, actor: Unit, rt: EnemyAIRuntime, behavior: EnemyBehavior): EnemyAbilityDefinition | undefined {
    if (!this.pattern.length) return undefined
    const byId = new Map(behavior.abilities.map(a => [a.id, a]))
    const n = this.pattern.length
    for (let off = 0; off < n; off++) {
      const idx = (rt.patternIndex + off) % n
      const ab = byId.get(this.pattern[idx])
      if (!ab || !isReady(rt, actor, ab)) continue
      rt.patternIndex = this.repeat ? (idx + 1) % n : idx + 1
      return ab
    }
    return undefined
  }
}

function isReady(rt: EnemyAIRuntime, actor: Unit, a: EnemyAbilityDefinition): boolean {
  if ((rt.cooldowns[a.id] ?? 0) > 0) return false
  if ((rt.charges[a.id] ?? 1) <= 0) return false
  if (a.require?.buff && !actor.buffs.some(b => b.id === a.require!.buff)) return false
  if (a.require?.noBuff && actor.buffs.some(b => b.id === a.require!.noBuff)) return false
  return true
}

function markUsed(rt: EnemyAIRuntime, a: EnemyAbilityDefinition): void {
  if (a.cooldown) rt.cooldowns[a.id] = a.cooldown
  if (a.charges !== undefined) rt.charges[a.id] = (rt.charges[a.id] ?? a.charges) - 1
}

/** which execution phase a chosen ability is in this turn */
export type EnemyActionPhase = 'use' | 'charge' | 'release'

export interface EnemyAction {
  ability: EnemyAbilityDefinition
  phase: EnemyActionPhase
}

/** §54+§55 driver — one enemy turn's decision. Ticks cooldowns, resolves an active
 *  telegraph (charge → release), then asks the AI. Mutates `rt`; returns the ability to run
 *  (or `undefined` to fall back to the built-in default attack). */
export function chooseEnemyAction(sim: SimApi, actor: Unit, targetCount: number, behavior: EnemyBehavior): EnemyAction | undefined {
  const rt = enemyRuntimeOf(actor)
  for (const id of Object.keys(rt.cooldowns)) if (rt.cooldowns[id]! > 0) rt.cooldowns[id]!--

  if (rt.casting) {
    if (rt.casting.turnsLeft > 1) {
      rt.casting.turnsLeft--
      const ab = behavior.abilities.find(a => a.id === rt.casting!.id)
      return ab ? { ability: ab, phase: 'charge' } : undefined
    }
    const ab = behavior.abilities.find(a => a.id === rt.casting!.id)
    rt.casting = null
    if (!ab) return undefined
    markUsed(rt, ab)
    return { ability: ab, phase: 'release' }
  }

  const ab = behavior.ai.choose(sim, actor, rt, behavior, targetCount)
  if (!ab) return undefined
  if (ab.cast && ab.cast > 0) {
    rt.casting = { id: ab.id, turnsLeft: ab.cast }
    return { ability: ab, phase: 'charge' }
  }
  markUsed(rt, ab)
  return { ability: ab, phase: 'use' }
}
