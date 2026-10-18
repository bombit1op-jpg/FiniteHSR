import type { DmgType, Unit } from '../entities/Unit'
import type { Simulator } from '../simulator'
import { isMemosprite } from '../simulator'
import type { LossKind } from '../kit'
import { enemyBehavior } from '../enemy/behaviors'

/** Unit lifecycle: the state mutations that are neither a hit nor a turn - damage bookkeeping,
 *  HP-loss redirection, and death resolution. Buff apply/expire and DoT application moved to
 *  `effects/BuffSystem` and `effects/DotSystem` (§46); they stayed single-choke-point, so the
 *  emitted event stream is unchanged.
 *
 *  Everything here writes to Simulator-owned state directly (that is the point: Simulator stays the
 *  single owner of the mutable battle state) and dispatches outward only through the existing
 *  `fire*` / `gearMap` / `kits` surfaces. Bodies are moved verbatim from Simulator; the only change
 *  is the `this.` receiver.
 *
 *  Death is resolved here rather than by a separate death pass because the sim checks `hp <= 0` at
 *  each of its 10 damage paths and must fire the kill hooks at that exact point — a deferred
 *  "checkDeaths(state)" sweep would reorder kill-triggered damage relative to the hit that caused it
 *  (onKill FUA, onAllyKill, energy for the killer) and change every kit's numbers. */
export class Lifecycle {
  constructor(private s: Simulator) {}

  /** record damage for the offline report: by ability label, plus an owner fold so a summon's hits
   *  land on its owner (Little Ica was 48% of Hyacine's damage under a name-keyed total) */
  account(who: Unit | string, skill: string, dmg: number, bucket?: string, elem?: string): void {
    const name = typeof who === 'string' ? who : who.name
    let a = this.s.accounts.get(name)
    if (!a) { a = { total: 0, bySkill: {} }; this.s.accounts.set(name, a) }
    a.total += dmg
    a.bySkill[skill] = (a.bySkill[skill] ?? 0) + dmg
    // kit call sites pass `x.name` (Kafka DoT Detonation, Hysilens Bubble of Banquets, Frozen
    // Additional DMG, ...) - a string key matched `accounts` but skipped the owner fold below, so
    // the carrier's reported damage silently lost those hits. A string that names a roster unit
    // resolves to it; 'ENEMY <name>' / unknown names stay name-only.
    // a string that names a roster unit resolves to it. The lookup picks the first roster match, so
    // a duplicate display name would misattribute — the roster keys by kitId, so names are unique in
    // practice. 'ENEMY <name>' / unknown names stay name-only.
    const unit = typeof who === 'string' ? this.s.roster.find(u => u.name === who) : who
    if (unit) {
      // owner fold: `accounts` is keyed by unit name, so a summon (memosprite, Numby, LL) keeps its
      // damage to itself and a preset total read by name misses it. Keyed by OWNER id — the owner's
      // own damage lands under its own id, so ownerDamage.get(owner.id) = char + all its summons.
      // Resolved at deal time, so a summon that despawns (Netherwing) still folds into its owner.
      const ownerId = (this.s.runtimes.get(unit.id)?.ownerId as string | undefined) ?? unit.id
      this.s.ownerDamage.set(ownerId, (this.s.ownerDamage.get(ownerId) ?? 0) + dmg)
      let s = this.s.ownerSkill.get(ownerId)
      if (!s) { s = new Map(); this.s.ownerSkill.set(ownerId, s) }
      s.set(skill, (s.get(skill) ?? 0) + dmg)
      // damage axis: attack TYPE for a normal hit, or the SOURCE for break/superbreak/dot/true.
      // One map, no double counting — a DoT tick is only ever in `dot`, never in `skill`.
      const b = bucket ?? (isMemosprite(unit) ? 'mem_skill' : 'skill')
      let x = this.s.ownerAxis.get(ownerId)
      if (!x) { x = new Map(); this.s.ownerAxis.set(ownerId, x) }
      x.set(b, (x.get(b) ?? 0) + dmg)
      // element fold: drives the per-source element report (§11) — no-op for true/enemy strings
      if (elem) {
        let el = this.s.ownerElem.get(ownerId)
        if (!el) { el = new Map(); this.s.ownerElem.set(ownerId, el) }
        el.set(elem, (el.get(elem) ?? 0) + dmg)
      }
    }
  }

  /** run the ally-damage redirectors (Castorice Mooncocoon, Mydei A1, Arlan A6 Repel) in order against
   *  the hit's remaining damage; returns how much they absorbed in total */
  interceptLoss(u: Unit, dmg: number, kind: LossKind = 'attack'): number {
    if (u.side !== 'ally' || !this.s.hpLossInterceptors.length) return 0
    let remaining = dmg
    let absorbed = 0
    for (const fn of [...this.s.hpLossInterceptors]) {
      const a = fn(u, remaining, kind)
      if (a > 0) {
        absorbed += a; remaining = Math.max(0, remaining - a)
        const redirect = this.s.hpLossRedirectors.has(fn)
        this.s.logger.emit({
          type: redirect ? 'HP_REDIRECT' : 'HP_INTERCEPT',
          target: u.name, targetId: u.id,
          payload: { amount: a, remaining, incoming: dmg, kind, by: redirect ? 'redirector' : 'interceptor' },
        })
      }
      if (remaining <= 0) break
    }
    return absorbed
  }

  /** Knockdown cancelled by a revive kit: restore HP and emit the single REVIVAL event. */
  revive(target: Unit, hp: number, source: Unit | undefined): void {
    target.dead = false
    target.hp = Math.max(1, Math.min(hp, target.maxHp))
    this.s.log(`XX ${target.name} revived`)
    this.s.logger.emit({ type: 'REVIVAL', source: source?.name, target: target.name, sourceId: source?.id, targetId: target.id, element: target.elem, payload: { side: target.side, kind: target.kind, hp: target.hp } })
  }

  kill(killer: Unit, victim: Unit, blow?: DmgType): void {
    if (victim.dead) return
    victim.dead = true
    victim.hp = 0
    victim.buffs = []
    // §54 record how the killing blow landed (the damage source passes the attack type; DoT ticks
    // pass 'dot'). Read post-kill by death-rattle passives that reward a specific kill type
    // (Fortune Seller "Dreamjolt Prizepool"). A direct test `sim.kill` with no type leaves it unset.
    if (victim.side === 'enemy' && blow) (this.s.rt(victim) as { killingBlow?: DmgType }).killingBlow = blow
    this.s.log(`XX ${victim.name} defeated`)
    this.s.logger.emit({ type: 'DEATH', source: killer.name, target: victim.name, sourceId: killer.id, targetId: victim.id, element: victim.elem, payload: { side: victim.side, kind: victim.kind, hp: 0 } })
    // Enemy death-rattle hook: fires at the killing blow and may CANCEL the death (Mara-Struck
    // Soldier "Rejuvenate" restores HP instead of going down). If it revives, this is not a kill —
    // killer energy / on-kill hooks / summon despawn must not run (the DEATH event stays emitted;
    // the revive follows it, exactly the observable "killing blow → restored" sequence).
    if (victim.side === 'enemy') enemyBehavior(victim.name)?.passive?.onKilled?.(this.s, victim, killer)
    if (!victim.dead) return
    if (killer.side === 'ally' && killer.kind === 'char') this.s.gainEnergy(killer, 10)
    const kit = killer.kitId ? this.s.kits.get(killer.kitId) : undefined
    kit?.onKill?.(this.s, killer, victim, this.s.rt(killer))
    // OnAllyKill: notify OTHER ally kits (Tingyun E2 — kill by Benediction ally)
    for (const a of this.s.roster) {
      if (a.side !== 'ally' || a.kind !== 'char' || a.dead || a === killer) continue
      if (!a.kitId) continue
      this.s.kits.get(a.kitId)?.onAllyKill?.(this.s, killer, victim, this.s.rt(a))
      this.s.gearMap.get(a.id)?.planar?.onAllyKill?.(this.s, a, killer, victim)
    }
    // owner-death hook (victim's own kit): state/summon cleanup
    if (victim.kitId) this.s.kits.get(victim.kitId)?.onUnitDeath?.(this.s, victim, this.s.rt(victim))
    const vg = this.s.gearMap.get(victim.id)
    vg?.cone?.onUnitDeath?.(this.s, victim, vg.coneSi)

    // ally-death hook: when any ally character dies, notify OTHER allies' kits/cones
    if (victim.side === 'ally' && victim.kind === 'char') {
      for (const a of this.s.roster) {
        if (a.side !== 'ally' || a.kind !== 'char' || a.dead || a.id === victim.id) continue
        if (a.kitId) this.s.kits.get(a.kitId)?.onAllyDeath?.(this.s, victim, this.s.rt(a))
        const ag = this.s.gearMap.get(a.id)
        ag?.cone?.onAllyDeath?.(this.s, a, victim, ag.coneSi)
      }
    }
    this.s.fireGear('onKill', killer, victim)
    this.s.gearMap.get(killer.id)?.planar?.onKill?.(this.s, killer, victim)
    // A summon/timer that dies despawns: leave the roster + emit SUMMON_DESPAWNED (idempotent —
    // a kit that already unregistered in onUnitDeath above leaves nothing to do). Enemies keep
    // their corpses (wave/accounting); 'transformed' is a self-form with kit-defined death
    // semantics and is not a field entity, so it stays roster-mutable.
    if (victim.kind === 'summon' || victim.kind === 'timer') this.s.unregisterUnit(victim.id)
  }
}
