import type { Unit } from '../entities/Unit'
import type { Simulator } from '../simulator'

/** The one character-shield hull (`reference/docs/combat_mechanics/Shield.md`: a shield is "a buff
 *  applied to characters that will absorb DMG taken in place of HP"; a leftover overflow "will be
 *  dealt to the character").
 *
 *  Every HP-reducing path that lands on a character routes its incoming damage through here first, so
 *  a shield behaves identically whether the damage came from an enemy basic attack (TurnManager.enemyHit),
 *  a data-driven enemy ability / counter through the hit pipeline (DamagePipeline.hitDigitInner), a
 *  DoT / Entanglement tick, or Elation chip damage. Before this hull the absorption lived ONLY inside
 *  the bespoke enemyHit path, so every other ally-damage source leaked straight through the shield.
 *
 *  Shields stack: the drain runs over the unit's shield buffs in application order, spilling from one
 *  into the next; a shield that reaches 0 is removed (SHIELD_BROKEN). Enemy units keep their own §58
 *  defense shield (enemy/defense.ts::routeEnemyDamage) — this hull is for character shields. Returns
 *  the damage left to land on HP. */
export function absorbWithShields(s: Simulator, target: Unit, incoming: number, reportedIncoming = incoming): number {
  let remaining = incoming
  for (const b of [...target.buffs]) {
    if (b.shield === undefined) continue
    const abs = Math.min(b.shield, remaining)
    b.shield -= abs
    remaining -= abs
    const srcName = b.sourceId ? s.find(b.sourceId)?.name : undefined
    s.logger.emit({ type: 'SHIELD_ABSORBED', source: srcName, target: target.name, sourceId: b.sourceId, targetId: target.id, payload: { id: b.id, amount: abs, remaining: b.shield, incoming: reportedIncoming } })
    if (b.shield <= 0) {
      s.logger.emit({ type: 'SHIELD_BROKEN', source: srcName, target: target.name, sourceId: b.sourceId, targetId: target.id, payload: { id: b.id, absorbed: abs } })
      s.removeBuff(target, b.id)
    }
    if (remaining <= 0) break
  }
  return remaining
}
