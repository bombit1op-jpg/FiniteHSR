import type { Unit } from '../entities/Unit'
import { buffSum } from './StatResolver'
import type { Simulator } from '../simulator'

/** Healing: the one application path (68 call sites reach it through `Simulator.heal`).
 *
 *  Owns the OHB/IHB multipliers and caps the restore at MaxHP, so `HEAL_APPLIED.amount` is always
 *  the HP actually restored — kits that feed on "healing done" (Hyacine tally, Robin Summeretto
 *  Vibes, Castorice Contained Dark Tide) read that number, not the requested one. */
export class HealingPipeline {
  constructor(private s: Simulator) {}

  /** Outgoing-Healing Boost of `healer`, honoring per-mod ability gates. Cornucopia's OHB counts
   *  only while the heal originates from a Skill or Ultimate (`pressedAbility` is set across the
   *  healer's own action); all ungated OHB sources sum as before. */
  private ohb(healer: Unit): number {
    const ability = this.s.pressedAbility(healer.id)
    let v = 0
    for (const b of healer.buffs) {
      const st = b.stacks ?? 1
      for (const m of b.mods) {
        if (m.stat !== 'outHeal') continue
        if (m.whenAbility && (!ability || !m.whenAbility.includes(ability))) continue
        v += m.value * st
      }
    }
    return v
  }

  apply(u: Unit, amount: number, src?: Unit): void {
    const healer = src ?? this.s.currentActor
    // Healing Boost Multiplier = 1 + OHB_Healer + IHB_Target − IHR_Target (canon formula, hsr-data
    // combat_mechanics.json "Healing"). OHB and IHB stack ADDITIVELY, not multiplicatively; the
    // target-side Anti-Heal (Incoming Healing Reduction) is folded into `inHeal` as a negative
    // value (signed IHB keeps the simple 1+IHB−IHR). Floor at 0: a 100%+ anti-heal nullifies
    // healing but never converts it into damage.
    const ihb = buffSum(u.buffs, 'inHeal')
    const ohb = healer && healer.side === 'ally' && healer.kind === 'char' ? this.ohb(healer) : 0
    const mult = Math.max(0, 1 + ihb + ohb)
    const before = u.hp
    u.hp = Math.min(u.maxHp, u.hp + Math.round(amount * mult))
    if (u.hp > before) this.s.events.fireAllyHeal(u, u.hp - before, healer)
    this.s.logger.emit({ type: 'HEAL_APPLIED', source: healer?.name, target: u.name, sourceId: healer?.id, targetId: u.id, payload: { amount: u.hp - before, hp: u.hp, maxHp: u.maxHp, ohb, ihb } })
    // the acting ally healed someone else -> fire their gear hook (Goddess Gentle Rain)
    if (healer && healer.side === 'ally' && healer.kind === 'char' && healer !== u)
      this.s.gearMap.get(healer.id)?.relicSets?.forEach(s => s.onAllyHeal?.(this.s, healer))
  }
}
