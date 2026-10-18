import type { AbilityType, DmgType, Unit } from '../entities/Unit'
import type { Buff } from '../effects/Buff'
import type { Simulator } from '../../core/simulator'
import type { Action } from '../kit'

/** Event dispatch: turns one battle fact ("ally X hit Y", "wave 2 began") into the kit/gear hook
 *  calls every listener registered for it.
 *
 *  These are the ONLY place that fans an event out across the roster. Listener filters differ per
 *  event on purpose — some exclude the actor, some take the victim's own gear, some are cone-only —
 *  so each event keeps its own loop rather than sharing one generic walk. Nothing here mutates
 *  battle state directly; the hooks they call do. Simulator owns the state. */
export class EventBus {
  constructor(private s: Simulator) {}

  /** living ally char listeners (the usual fan-out audience) */
  private listeners(): Unit[] {
    return this.s.roster.filter(u => !u.dead && u.side === 'ally' && u.kind === 'char')
  }

  fireGear(kind: 'onAfterSkill' | 'onAfterUlt' | 'onKill', u: Unit, extra?: Unit, outOfTurn = false): void {
    const g = this.s.gearMap.get(u.id)
    if (!g) return
    if (kind === 'onAfterSkill') g.cone?.onAfterSkill?.(this.s, u, extra, g.coneSi, this.s.rt(u))
    else if (kind === 'onAfterUlt') g.cone?.onAfterUlt?.(this.s, u, g.coneSi, this.s.rt(u))
    else if (kind === 'onKill') g.cone?.onKill?.(this.s, u, extra!, g.coneSi)
    for (const s of g.relicSets) {
      if (kind === 'onAfterSkill') s.onAfterSkill?.(this.s, u, extra)
      else if (kind === 'onAfterUlt') s.onAfterUlt?.(this.s, u, outOfTurn)
      else if (kind === 'onKill') s.onKill?.(this.s, u, extra!)
    }
  }

  fireAfterAttack(attacker: Unit, target: Unit, dmgType: DmgType, dmg?: number, atkToughRed?: number, abilityType?: AbilityType, memoSkill?: boolean): void {
    // depth-first: the default per-hit window resolves at the event that spawned it, even when that
    // event happens inside another reaction (a FUA spawned mid-reaction). Routing this through
    // `push`+`drain` deferred those nested reactions to the outer FIFO loop and inverted the order
    // (goldens encode depth-first). Opt-in non-`hit` windows still defer inside `resolveAfterAttack`.
    this.resolveAfterAttack(attacker, target, dmgType, dmg, atkToughRed, abilityType, memoSkill)
  }

  private resolveAfterAttack(attacker: Unit, target: Unit, dmgType: DmgType, dmg?: number, atkToughRed?: number, abilityType?: AbilityType, memoSkill?: boolean): void {
    // A buff-inheriting summon counts as its wearer for the wearer's own after-attack hooks: it
    // uses all of the wearer's buffs, so the wearer's set bonuses fire for it (Valorous 4pc).
    const attackerOwner = attacker.sharesOwnerBuffs ? String(this.s.rt(attacker).ownerId ?? '') : ''
    // reverse slot order: follow-ups / Additional DMG fire last-slot-first (in-game event queue)
    for (const u of [...this.s.roster].reverse()) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char' || !u.kitId) continue
      const kit = this.s.kits.get(u.kitId)
      if (kit?.onAfterAttack) {
        const call = () => kit.onAfterAttack!(this.s, attacker, target, dmgType, this.s.rt(u), dmg, atkToughRed, abilityType)
        // per-mechanic window: kits that resolve after the WHOLE attack (Great Boon) defer to the
        // attack boundary instead of the per-hit drain; everyone else keeps the per-hit order.
        if (kit.afterAttackWindow && kit.afterAttackWindow !== 'hit') this.s.triggers.push(call, kit.afterAttackWindow)
        else call()
      }
const g = this.s.gearMap.get(u.id)
      if (u === attacker || u.id === attackerOwner) {
        g?.cone?.onAfterAttack?.(this.s, u, target, dmgType, g.coneSi)
        g?.relicSets?.forEach(s => s.onAfterAttack?.(this.s, u, target, dmgType))
      }
      g?.planar?.onAfterAttack?.(this.s, u, attacker, target, dmgType)
      g?.relicSets?.forEach(s => s.onAllyAttack?.(this.s, u, attacker, target, dmgType))
      g?.cone?.onAllyAttack?.(this.s, u, attacker, target, dmgType, g.coneSi, memoSkill)
    }
  }

  /** §P5 cross-kit action interception. Forward slot order (the first kit to claim the action wins);
   *  a hijack short-circuits so later kits never see it. */
  resolveBeforeAction(actor: Unit, action: Action): boolean {
    for (const u of this.s.roster) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char' || !u.kitId) continue
      if (this.s.kits.get(u.kitId)?.onBeforeAction?.(this.s, actor, action, this.s.rt(u))) return true
    }
    return false
  }

  /** §P4 does any living ally kit offer `actor` an Assist Skill right now? Forward slot order. */
  assistOffered(actor: Unit): boolean {
    for (const u of this.s.roster) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char' || !u.kitId || u === actor) continue
      if (this.s.kits.get(u.kitId)?.assistReady?.(this.s, u, actor, this.s.rt(u))) return true
    }
    return false
  }

  /** §P4 run `actor`'s Assist Skill through the first provider kit offering it. Returns true if one
   *  ran. */
  runAssist(actor: Unit): boolean {
    for (const u of this.s.roster) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char' || !u.kitId || u === actor) continue
      const kit = this.s.kits.get(u.kitId)
      if (kit?.assistReady?.(this.s, u, actor, this.s.rt(u)) && kit.runAssist) {
        kit.runAssist(this.s, u, actor, this.s.rt(u))
        return true
      }
    }
    return false
  }

  fireElationSkill(u: Unit, identity?: string): void {
    const g = this.s.gearMap.get(u.id)
    g?.relicSets?.forEach(s => s.onElationSkill?.(this.s, u))
    g?.cone?.onElationSkill?.(this.s, u, g.coneSi, identity)
  }

  fireAhaInstant(): void {
    for (const u of this.listeners()) {
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onAhaInstant?.(this.s, u, g.coneSi)
    }
  }

  fireAllyTurnStart(ally: Unit): void {
    for (const u of this.listeners()) {
      if (!u.kitId || u.id === ally.id) continue
      this.s.kits.get(u.kitId)?.onAllyTurnStart?.(this.s, ally, this.s.rt(u))
    }
  }

  fireAllyUlt(ally: Unit): void {
    for (const u of this.listeners()) {
      if (!u.kitId || u.id === ally.id) continue
      this.s.kits.get(u.kitId)?.onAllyUlt?.(this.s, ally, this.s.rt(u))
    }
  }

  fireBreak(breaker: Unit, victim: Unit, dmg?: number): void {
    this.s.triggers.push(() => this.resolveBreak(breaker, victim, dmg))
    this.s.triggers.drain()
  }

  private resolveBreak(breaker: Unit, victim: Unit, dmg?: number): void {
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      this.s.kits.get(u.kitId)?.onBreak?.(this.s, breaker, victim, this.s.rt(u), dmg)
    }
  }

/** fire onAllyHit hooks (March 7th counter) after an ally takes enemy damage */
  fireAllyHit(src: Unit, target: Unit, dmg: number): void {
    this.s.triggers.push(() => this.resolveAllyHit(src, target, dmg))
    this.s.triggers.drain()
  }

  private resolveAllyHit(src: Unit, target: Unit, dmg: number): void {
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      const kit = this.s.kits.get(u.kitId)
      kit?.onAllyHit?.(this.s, src, target, dmg, this.s.rt(u))
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onAllyHit?.(this.s, u, target, g.coneSi)
    }
    // gear hook for the hit target itself (Longevous Disciple; cone gets the enemy attacker for Trend Burn)
    const g = this.s.gearMap.get(target.id)
    g?.relicSets?.forEach(s => s.onHitTaken?.(this.s, target))
    g?.cone?.onHitTaken?.(this.s, target, g.coneSi, src)
  }

  /** fire onAllyHpLoss hooks (Eclipse stacks, She Already Shut Her Eyes) after an ally loses HP by ANY cause */
  fireAllyHpLoss(target: Unit, amt: number): void {
    if (amt <= 0 || target.side !== 'ally') return
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onAllyHpLoss?.(this.s, u, target, amt, g.coneSi)
      this.s.kits.get(u.kitId)?.onAllyHpLoss?.(this.s, u, target, amt, this.s.rt(u))
    }
  }

  /** fire the wearer's cone memosprite-event hooks (Shadowburn SP/energy, Reminiscence, Evernight) */
  fireMemospriteSummon(u: Unit): void { this.fireMemospriteEvent(u, 'summon') }
  fireMemospriteTurnStart(u: Unit): void { this.fireMemospriteEvent(u, 'turnstart') }
  fireMemospriteDisappear(u: Unit): void { this.fireMemospriteEvent(u, 'disappear') }
  private fireMemospriteEvent(u: Unit, kind: 'summon' | 'turnstart' | 'disappear'): void {
    const g = this.s.gearMap.get(u.id)
    const c = g?.cone
    if (!c) return
    if (kind === 'summon') c.onMemospriteSummon?.(this.s, u, g.coneSi)
    else if (kind === 'turnstart') c.onMemospriteTurnStart?.(this.s, u, g.coneSi)
    else c.onMemospriteDisappear?.(this.s, u, g.coneSi)
  }

  /** fire cone + kit onWaveStart for every living char ally */
  fireWaveStart(): void {
    for (const u of this.listeners()) {
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onWaveStart?.(this.s, u, g.coneSi)
      if (u.kitId) this.s.kits.get(u.kitId)?.onWaveStart?.(this.s, u, this.s.rt(u))
    }
  }

  /** fire cone + kit onWaveEnd for every living char ally */
  fireWaveEnd(): void {
    for (const u of this.listeners()) {
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onWaveEnd?.(this.s, u, g.coneSi)
      if (u.kitId) this.s.kits.get(u.kitId)?.onWaveEnd?.(this.s, u, this.s.rt(u))
    }
  }

  /** fire cone + kit onCycleStart/onCycleEnd for every living char ally */
  fireCycle(kind: 'start' | 'end', cycle: number): void {
    for (const u of this.listeners()) {
      const g = this.s.gearMap.get(u.id)
      if (kind === 'start') {
        g?.cone?.onCycleStart?.(this.s, u, cycle, g.coneSi)
        if (u.kitId) this.s.kits.get(u.kitId)?.onCycleStart?.(this.s, u, cycle, this.s.rt(u))
      } else {
        g?.cone?.onCycleEnd?.(this.s, u, cycle, g.coneSi)
        if (u.kitId) this.s.kits.get(u.kitId)?.onCycleEnd?.(this.s, u, cycle, this.s.rt(u))
      }
    }
  }

  /** fire onAllyHeal hooks (Himeko A6; cone Ninja Record HP-change CD) after an ally character is healed */
  fireAllyHeal(target: Unit, amount: number, src?: Unit): void {
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      const kit = this.s.kits.get(u.kitId)
      kit?.onAllyHeal?.(this.s, target, amount, this.s.rt(u), src)
      const g = this.s.gearMap.get(u.id)
      g?.cone?.onAllyHeal?.(this.s, u, target, amount, g.coneSi, src)
    }
  }

  /** fire onAllyShield hooks (Phainon A2 shield half) after an ally receives a Shield buff */
  fireAllyShield(target: Unit, amount: number, src?: Unit): void {
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      this.s.kits.get(u.kitId)?.onAllyShield?.(this.s, target, amount, this.s.rt(u), src)
    }
  }

  /** fire onFrozenTurn hooks (March 7th Frozen additional DMG) when a unit's turn is skipped */
  fireFrozenTurn(u: Unit): void {
    for (const a of this.listeners()) {
      if (!a.kitId) continue
      this.s.kits.get(a.kitId)?.onFrozenTurn?.(this.s, u, this.s.rt(a))
    }
  }

  /** fire onAllyActionEnd for every living ally kit after ANY unit finished acting (Hyacine Take Sky:
   *  canon <at the start of any target's turn or after any target takes action>). `endTick` is the
   *  single choke point for ally/enemy/summon/timer actions, so one call site covers them all. */
  fireAllyActionEnd(actor: Unit): void {
    for (const u of this.listeners()) {
      if (!u.kitId || u.id === actor.id) continue
      this.s.kits.get(u.kitId)?.onAllyActionEnd?.(this.s, actor, this.s.rt(u))
    }
  }

  /** An ALLY memosprite acted → tell every living ally char kit. A memosprite has two action paths and
   *  BOTH must fire: the AV-timeline turn (summonTurn) and the inline Extra Turn (grantExtraTurn, which
   *  bypasses endTick). `sharesOwnerBuffs` marks a true summon (Numby, Lightning-Lord, Souldragon,
   *  Fuyuan), not a memosprite, so it is filtered out here. */
  fireAllyMemospriteAct(summon: Unit): void {
    if (summon.side !== 'ally' || summon.kind !== 'summon' || summon.sharesOwnerBuffs) return
    for (const u of this.listeners()) {
      if (!u.kitId) continue
      this.s.kits.get(u.kitId)?.onAllyMemospriteAct?.(this.s, u, summon, this.s.rt(u))
    }
  }

  /** fire onBuffExpire hooks (Fu Xuan Knowledge unwind) when a buff's countdown ends */
  fireBuffExpire(u: Unit, b: Buff): void {
    for (const a of this.listeners()) {
      if (!a.kitId) continue
      const kit = this.s.kits.get(a.kitId)
      kit?.onBuffExpire?.(this.s, u, b, this.s.rt(a))
    }
  }

  /** fire onBuffApplied hooks (spec §6 step 6, "Выполнить onApply") for every application
   *  outcome - fresh / stacked / refreshed. Mirrors `fireBuffExpire` on the apply side. */
  fireBuffApplied(u: Unit, b: Buff, src?: Unit): void {
    for (const a of this.listeners()) {
      if (!a.kitId) continue
      const kit = this.s.kits.get(a.kitId)
      kit?.onBuffApplied?.(this.s, u, b, this.s.rt(a), src)
    }
  }
}
