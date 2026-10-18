import type { Elem, Unit } from '../entities/Unit'
import type { DoT } from '../effects/Buff'
import { computeBreakDamage } from './DamageCalculator'
import { buffSum, eff, stdMultipliers } from './StatResolver'
import { levelMultiplier } from './LevelMultiplier'
import type { DoTWithSource, Simulator } from '../simulator'
import type { DamagePipeline } from './DamagePipeline'
import { ToughnessBars } from './ToughnessBars'
import type { BreakPolicy } from './ToughnessBars'
import { enemyBehavior } from '../enemy/behaviors'

/** Break resolution: the toughness state machine and everything it triggers.
 *
 *  Split out of DamagePipeline, which keeps attack sequencing only. The order rule is the whole
 *  point of this file: a hit that zeroes toughness and its Break DMG BOTH resolve while the enemy
 *  is still intact (x0.9), and `broken` is set only afterwards (transcript "Techniques are
 *  Cursed"). `gearHitMods` / `ironCavPen` stay on DamagePipeline - they are per-hit gear
 *  conditionals, not break rules - so this class holds a reference to the pipeline. */
export class BreakResolver {
  readonly bars: ToughnessBars
  constructor(private s: Simulator, private dmg: DamagePipeline) {
    this.bars = new ToughnessBars(this.s, this)
  }
  applyToughness(attacker: Unit, target: Unit, elem: Elem, toughDmg: number, wbeBonus: number, pierceRatio?: number): void {
    if (target.broken) {
      // already Broken: no main-bar toughness left, but the attack still inflicts toughness damage
      // (Dahlia Super Break conversion reads it); must not touch toughRed (Xueyi Karma = real removal only)
      const weak = target.weaknesses.includes(elem)
      const red = weak ? toughDmg * (1 + wbeBonus) : pierceRatio !== undefined ? toughDmg * (1 + wbeBonus) * pierceRatio : 0
      if (red > 0) this.s.attackToughRed += red
      // exo bars ignore Weakness Type: any attack drains them by the hit's toughness-equivalent
      if (toughDmg > 0) this.bars.consume(attacker, target, elem, toughDmg * (1 + wbeBonus))
      return
    }
    const weak = target.weaknesses.includes(elem)
    const wbe = 1 + wbeBonus
    let red: number
    if (weak) red = toughDmg * wbe
    else if (pierceRatio !== undefined) red = toughDmg * wbe * pierceRatio
    else return
    const before = target.toughness
    target.toughness -= red
    this.s.toughRed += before - target.toughness
    this.s.attackToughRed += before - target.toughness
    this.s.logger.emit({ type: 'TOUGHNESS_DAMAGE', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: elem, payload: { amount: before - target.toughness, before, after: Math.max(0, target.toughness), wbe, pierceRatio, weak } })
if (target.toughness <= 0) {
      target.toughness = 0
      if (this.policyFor(target) === 'damage-only') {
        // intrinsic multi-layer, non-last bar: damage-only Break. The layer empties into Break DMG on
        // the still-intact target (x0.9) but the enemy is NOT broken — no delay, no elemental break
        // debuff, no `broken`, no break triggers. The next bar becomes current. Overflow past the bar
        // boundary in one hit is dropped (no carry postulate — revisit with canon on carry/multi-hop).
        const pen = this.dmg.ironCavPen(attacker, false)
        const bhm = this.dmg.gearHitMods(attacker, target, 'break')
        if (pen) this.s.addBuff(target, { id: '_ic', name: 'Iron Cavalry Break pen', mods: [{ stat: 'defIgnore', value: pen }], turns: Infinity })
        if (bhm.tgt.length) this.s.addBuff(target, { id: '_gearhm', name: 'Gear hit mods', mods: bhm.tgt, turns: Infinity })
        const bdmg = computeBreakDamage({ attacker, target, elem, kind: 'break' })
        if (bhm.tgt.length) this.s.removeBuff(target, '_gearhm')
        if (pen) this.s.removeBuff(target, '_ic')
        this.applyTargetBreak(attacker, target, bdmg, 'Weakness Break', 'break')
        if (target.dead) return
        const bars = target.toughnessBars!
        const next = (target.toughBarIndex ?? 0) + 1
        target.toughBarIndex = next
        target.maxToughness = bars[next]!
        target.toughness = bars[next]!
        this.s.log(`>> ${target.name} layer ${next}/${bars.length} depleted — Break DMG ${bdmg}`)
        this.s.logger.emit({ type: 'TOUGHNESS_BAR_DEPLETED', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: elem, payload: { bar: next, bars: bars.length, maxToughness: bars[next]!, breakDamage: bdmg, hpAfter: target.hp } })
        return
      }
      this.fullBreak(attacker, target, elem, 'Weakness Break')
    }
  }

  /** the break policy of the current (intrinsic) bar: every layer but the last is a damage-only
   *  break; only the last layer (and scalar toughness) ends in a full Weakness Break. */
  private policyFor(target: Unit): BreakPolicy {
    const bars = target.toughnessBars
    if (bars && (target.toughBarIndex ?? 0) < bars.length - 1) return 'damage-only'
    return 'full-break'
  }

  /** unified "a bar empties → full Weakness Break" consequence path. Shared by the enemy's last
   *  intrinsic bar and by exo bars (re-Break): the breaking hit and Break DMG both resolve while the
   *  enemy is still intact (x0.9) and `broken` is set only afterwards; a re-Break on an already
   *  broken target runs the same delay / break debuff / break hooks at full damage (×1.0 brokenM). */
  fullBreak(attacker: Unit, target: Unit, elem: Elem, label: string): number {
    const pen = this.dmg.ironCavPen(attacker, false)
    const bhm = this.dmg.gearHitMods(attacker, target, 'break')
    if (pen) this.s.addBuff(target, { id: '_ic', name: 'Iron Cavalry Break pen', mods: [{ stat: 'defIgnore', value: pen }], turns: Infinity })
    if (bhm.tgt.length) this.s.addBuff(target, { id: '_gearhm', name: 'Gear hit mods', mods: bhm.tgt, turns: Infinity })
    const bdmg = computeBreakDamage({ attacker, target, elem, kind: 'break' })
    if (bhm.tgt.length) this.s.removeBuff(target, '_gearhm')
    if (pen) this.s.removeBuff(target, '_ic')
    target.hp -= bdmg
    this.s.account(attacker, label, bdmg, 'break', elem)
    this.s.log(`>> ${target.name} WEAKNESS BROKEN — Break DMG ${bdmg}`)
    this.s.logger.emit({ type: 'WEAKNESS_BREAK', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: elem, payload: { breakDamage: bdmg, hpAfter: target.hp, toughness: 0 } })
    this.s.logger.emit({ type: 'BREAK_DAMAGE', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: elem, payload: { amount: bdmg, hpAfter: target.hp, be: eff(attacker).be, kind: 'break' } })
    target.broken = true
    this.s.delay(target, 0.25)
    this.applyBreakDebuff(attacker, target, elem)
    if (target.side === 'enemy') enemyBehavior(target.name)?.passive?.onBreak?.(this.s, target, elem)
    if (attacker.side === 'ally' && attacker.kind === 'char') this.s.fireBreak(attacker, target, bdmg)
    if (target.side === 'ally') this.s.gainEnergy(target, 10)
    if (target.hp <= 0) this.s.kill(attacker, target)
    return bdmg
  }

  applyBreakDebuff(source: Unit, target: Unit, elem: Elem): void {
    const be = eff(source).be
    const mk = (kind: DoT['kind'], extra?: Partial<DoT>): DoTWithSource =>
      Object.assign({ kind, elem, turns: 2, baseDmg: 0, sourceUnit: source }, extra) as DoTWithSource
    switch (elem) {
      case 'Physical': this.s.applyDot(target, mk('Bleed')); break
      case 'Fire': this.s.applyDot(target, mk('Burn')); break
      case 'Ice': this.s.applyDot(target, mk('Freeze', { turns: 1 })); break
      case 'Lightning': this.s.applyDot(target, mk('Shock')); break
      case 'Wind': {
        const ex = target.dots.find(d => d.kind === 'WindShear')
        if (ex) { ex.stacks = Math.min(5, (ex.stacks ?? 1) + 3); ex.turns = 2 }
        else this.s.applyDot(target, mk('WindShear', { stacks: 3 }))
        break
      }
      case 'Quantum': {
        this.s.delay(target, 0.20 * (1 + be))
        const existing = target.dots.find(d => d.kind === 'Entanglement')
        if (existing) { existing.stacks = Math.min(5, (existing.stacks ?? 1) + 1); existing.turns = 1 }
        else this.s.applyDot(target, mk('Entanglement', { turns: 1, stacks: 1 }))
        break
      }
      case 'Imaginary':
        this.s.delay(target, 0.30 * (1 + be))
        this.s.applyDot(target, mk('Imprisonment', { turns: 1 }))
        this.s.addBuff(target, { id: 'imprisonSpd', name: 'Imprisoned SPD-10%', mods: [{ stat: 'spdDown', value: 0.1 }] })
        break
    }
    const g = this.s.gearMap.get(source.id)
    g?.cone?.onAfterBreak?.(this.s, source, target, g.coneSi)
    g?.relicSets?.forEach(s => s.onAfterBreak?.(this.s, source, target))
    this.s.log(`${target.name} afflicted by ${elem} break debuff`)
  }

  superBreak(attacker: Unit, target: Unit, toughnessReduced: number, abilityMult: number): void {
    if (toughnessReduced <= 0) return
    const pen = this.dmg.ironCavPen(attacker, true)
    const bhm = this.dmg.gearHitMods(attacker, target, 'break')
    if (pen) this.s.addBuff(target, { id: '_ic', name: 'Iron Cavalry Super Break pen', mods: [{ stat: 'defIgnore', value: pen }], turns: Infinity })
    if (bhm.tgt.length) this.s.addBuff(target, { id: '_gearhm', name: 'Gear hit mods', mods: bhm.tgt, turns: Infinity })
    const sb = Math.floor(
      (toughnessReduced / 10) *
      levelMultiplier(attacker.base.level) *
      abilityMult * (1 + eff(attacker).be) *
      stdMultipliers(attacker, target, attacker.elem, 'break') *
      (1 + buffSum(attacker.buffs, 'finalDmgBoost')),
    )
    if (bhm.tgt.length) this.s.removeBuff(target, '_gearhm')
    if (pen) this.s.removeBuff(target, '_ic')
    target.hp -= sb
    this.s.account(attacker, 'Super Break', sb, 'superbreak', attacker.elem)
    this.s.log(`${attacker.name} SUPER BREAK → ${target.name}: ${sb}`)
    this.s.logger.emit({ type: 'SUPERBREAK', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: attacker.elem, payload: { amount: sb, toughnessReduced, abilityMult, hpAfter: target.hp } })
    if (target.hp <= 0) this.s.kill(attacker, target)
  }

  applyTargetBreak(attacker: Unit, target: Unit, amount: number, label: string, bucket = 'break'): number {
    if (amount <= 0 || target.dead) return 0
    target.hp -= amount
    this.s.account(attacker, label, amount, bucket, attacker.elem)
    this.s.log(`${attacker.name} ${label} → ${target.name}: ${amount}`)
    this.s.logger.emit({ type: 'BREAK_DAMAGE', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, payload: { amount, label, bucket, hpAfter: target.hp } })
    if (target.hp <= 0) this.s.kill(attacker, target)
    return amount
  }

  /** refill after Weakness Break recovery — the full multi-layer stack (all bars back, current = first),
   *  not just the bar that broke. Single-bar enemies keep their scalar max. Exo bars (source-bound
   *  secondary bars) refill to full too: recovery restores them whether they were drained partly or fully. */
  refillToughness(u: Unit): void {
    const bars = u.toughnessBars
    if (bars && bars.length) {
      u.toughBarIndex = 0
      u.maxToughness = bars[0]!
      u.toughness = bars[0]!
    } else {
      u.toughness = u.maxToughness
    }
    this.bars.resetTarget(u)
  }
}
