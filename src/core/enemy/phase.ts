import type { Elem, Mod, Unit } from '../entities/Unit'
import type { SimApi } from '../kit'
import type { BattleLogger } from '../battlelog'
import type { EnemyAbilityDefinition } from './ability'

/** §56 — boss phase controller. A phase transition is a state-machine step, NOT death: the enemy
 *  keeps its identity and HP, only its stats / resistances / ability set change, and a
 *  PHASE_START / PHASE_END event is emitted. The controller only moves forward through the
 *  phase list (a boss never returns to an earlier phase). Runtime lives off the Unit (PER_BATTLE),
 *  so a fresh battle or `resetEnemyPhase` starts clean. */

export type EnemyPhaseCondition =
  /** current HP fraction < x */
  | { hpBelow: number }
  /** current HP fraction > x */
  | { hpAbove: number }
  /** toughness depleted */
  | { broken: true }
  /** timer: at least N enemy turns taken */
  | { turnAtLeast: number }
  /** scripted / special condition */
  | { predicate: (sim: SimApi, actor: Unit, turn: number) => boolean }

export interface EnemyPhaseDefinition {
  id: string
  name?: string
  /** condition to ENTER this phase from an earlier one; the first phase is entered unconditionally */
  start?: EnemyPhaseCondition
  /** stat modifiers applied to the actor while in this phase (owner-permanent buff) */
  statModifiers?: Mod[]
  /** ability ids disabled while in this phase */
  disabledAbilities?: string[]
  /** if set, ONLY these ability ids remain usable while in this phase */
  availableAbilities?: string[]
  /** weaknesses override while in this phase (the pre-phase list is restored on exit) */
  weaknesses?: Elem[]
  /** RES (absolute) override while in this phase (the pre-phase profile is restored on exit) */
  resistanceModifiers?: Partial<Record<Elem, number>>
  /** scripted on-enter effect (timeline / summons / victory); advanced hooks stay caller-side */
  onEnter?: (sim: SimApi, actor: Unit) => void
  onExit?: (sim: SimApi, actor: Unit) => void
}

/** per-battle phase state (stored off the Unit, like the AI runtime) */
export interface EnemyPhaseRuntime {
  /** current phase index, -1 = not entered yet */
  index: number
  savedWeak?: Elem[]
  savedRes?: Partial<Record<Elem, number>>
}

const PHASE_RT = new WeakMap<Unit, EnemyPhaseRuntime>()

export function enemyPhaseRuntimeOf(actor: Unit): EnemyPhaseRuntime {
  let r = PHASE_RT.get(actor)
  if (!r) { r = { index: -1 }; PHASE_RT.set(actor, r) }
  return r
}

/** drop a unit's phase state (regen / new battle) */
export function resetEnemyPhase(actor: Unit): void { PHASE_RT.delete(actor) }

/** enter the first phase, then advance as far as the conditions allow. Returns the live runtime so
 *  the caller can read `index` / filter abilities for this turn. */
export function evaluateEnemyPhase(
  sim: SimApi,
  logger: BattleLogger,
  actor: Unit,
  phases: EnemyPhaseDefinition[],
  turn = 0,
): EnemyPhaseRuntime {
  const rt = enemyPhaseRuntimeOf(actor)
  if (!phases.length) return rt
  if (rt.index < 0) enterPhase(sim, logger, actor, phases, 0, rt)
  let moved = true
  while (moved) {
    moved = false
    for (let j = rt.index + 1; j < phases.length; j++) {
      if (condMet(sim, actor, turn, phases[j]!.start)) {
        exitPhase(sim, logger, actor, phases, rt)
        enterPhase(sim, logger, actor, phases, j, rt)
        moved = true
        break
      }
    }
  }
  return rt
}

/** §56 — ability availability for the current phase (available = whitelist, disabled = blacklist) */
export function filterPhaseAbilities(
  abilities: EnemyAbilityDefinition[],
  phases: EnemyPhaseDefinition[],
  rt: EnemyPhaseRuntime,
): EnemyAbilityDefinition[] {
  const p = rt.index >= 0 ? phases[rt.index] : undefined
  if (!p) return abilities
  let list = abilities
  if (p.availableAbilities) { const s = new Set(p.availableAbilities); list = list.filter(a => s.has(a.id)) }
  if (p.disabledAbilities) { const s = new Set(p.disabledAbilities); list = list.filter(a => !s.has(a.id)) }
  return list
}

function condMet(sim: SimApi, actor: Unit, turn: number, c?: EnemyPhaseCondition): boolean {
  if (!c) return false
  if ('hpBelow' in c) return actor.maxHp > 0 && actor.hp / actor.maxHp < c.hpBelow
  if ('hpAbove' in c) return actor.maxHp > 0 && actor.hp / actor.maxHp > c.hpAbove
  if ('broken' in c) return actor.broken === true
  if ('turnAtLeast' in c) return turn >= c.turnAtLeast
  return c.predicate(sim, actor, turn)
}

const phaseBuffId = (id: string) => `phase:${id}`

function enterPhase(
  sim: SimApi, logger: BattleLogger, actor: Unit,
  phases: EnemyPhaseDefinition[], j: number, rt: EnemyPhaseRuntime,
): void {
  rt.index = j
  const p = phases[j]!
  if (p.statModifiers?.length) {
    sim.addBuff(actor, { id: phaseBuffId(p.id), name: p.name ?? p.id, mods: p.statModifiers, turns: Infinity })
  }
  if (p.weaknesses) { if (!rt.savedWeak) rt.savedWeak = [...actor.weaknesses]; actor.weaknesses = [...p.weaknesses] }
  if (p.resistanceModifiers) { if (!rt.savedRes) rt.savedRes = { ...actor.res }; actor.res = { ...actor.res, ...p.resistanceModifiers } }
  p.onEnter?.(sim, actor)
  logger.emit({ type: 'PHASE_START', source: actor.name, sourceId: actor.id, payload: { phase: p.id, index: j } })
}

function exitPhase(
  sim: SimApi, logger: BattleLogger, actor: Unit,
  phases: EnemyPhaseDefinition[], rt: EnemyPhaseRuntime,
): void {
  const p = phases[rt.index]
  if (!p) return
  if (p.statModifiers?.length) sim.removeBuff(actor, phaseBuffId(p.id))
  if (rt.savedWeak) { actor.weaknesses = rt.savedWeak; rt.savedWeak = undefined }
  if (rt.savedRes) { actor.res = rt.savedRes; rt.savedRes = undefined }
  p.onExit?.(sim, actor)
  logger.emit({ type: 'PHASE_END', source: actor.name, sourceId: actor.id, payload: { phase: p.id, index: rt.index } })
}
