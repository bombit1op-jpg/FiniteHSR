import type { Elem, Unit } from '../entities/Unit'

/**
 * §10/§17 scheduled countdown entity.
 *
 * A countdown is a `kind:'timer'` unit owned by a character. It sits on the timeline at its own
 * fixed SPD; when its turn arrives `TurnManager.timerTurn` fires the owner kit's `onCcEnd` and then
 * unregisters it. This is the single factory for that shape, so kits no longer hand-build the
 * 13-field Unit literal and its inert defaults (hp 1, toughness 0, no dots/buffs) cannot drift.
 */
export interface CountdownSpec {
  /** unit id; must be unique while live — `timerTurn` unregisters by id AFTER the hook, so a
   *  re-arm inside `onCcEnd` needs a FRESH id or the new timer is unregistered by collision. */
  id: string
  name: string
  /** timeline side the countdown occupies (usually the owner's) */
  side: 'ally' | 'enemy' | 'neutral'
  elem: Elem
  /** fixed countdown SPD — its turn arrives after `baseAv(spd)` */
  spd: number
  weaknesses?: Elem[]
  /** copied onto the timer for kits that key behaviour on `kitId`; `onCcEnd` dispatch is by OWNER */
  kitId?: string
}

export function makeCountdown(spec: CountdownSpec): Unit {
  return {
    id: spec.id, name: spec.name, side: spec.side, kind: 'timer', elem: spec.elem,
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: spec.spd },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: spec.weaknesses ?? [], res: {}, kitId: spec.kitId,
  }
}
