import type { Unit } from '../entities/Unit'
import type { Buff } from './Buff'
import type { Simulator, BuffLogEntry } from '../simulator'
import { isDebuff } from '../combat/StatResolver'
import { enemyControlImmune } from '../enemy/defense'
import type { EventType } from '../battlelog'

/** Buff + debuff ownership: the one application path and the one countdown path.
 *
 *  Debuffs are not a separate system — they are the same `Buff` record tagged by `isDebuff(b)`,
 *  which only changes the emitted event group (`DEBUFF_*` vs `BUFF_*`) and is consulted in
 *  `StatResolver.eff` when aggregating mods. A `DebuffSystem` would be a one-method alias. */
export class BuffSystem {
  constructor(private s: Simulator) {}

  /** apply a buff: stack it if it already has a cap, refresh it if the id repeats, otherwise add.
   *  Shield amplification from the provider's gear and the Self-Enshrouded 4pc bonus live here
   *  because they can only be resolved once we know a NEW shield is being handed out. */
  add(u: Unit, b: Buff): void {
    // §58 control-immune: the debuff never lands (buffs for allies pass through — the profile is
    // enemy-only). No DEBUFF_APPLIED, one NOTE so the immunity is observable. Data-driven: only
    // enemies with a registered `controlImmune` profile are affected; everything else is untouched.
    if (isDebuff(b) && enemyControlImmune(u)) {
      this.s.log(`${u.name} is immune to ${b.name} (control-immune)`)
      this.s.logger.emit({ type: 'NOTE', raw: `${u.name} is immune to ${b.name}`, minDebug: 2 })
      return
    }
    const rec = (stacks: number, turns?: number): void => {
      const e: BuffLogEntry = {
        unitName: u.name, av: this.s.avElapsed, id: b.id, name: b.name,
        turns: turns ?? b.turns, maxStacks: b.maxStacks, stacks,
        shield: b.shield, mods: b.mods,
      }
      this.s.buffLog.push(e)
    }
    const ex = u.buffs.find(x => x.id === b.id)
    const deb = isDebuff(b)
    const grp = deb ? 'DEBUFF' : 'BUFF'
    const emit = (kind: 'APPLIED' | 'STACKED' | 'REFRESHED'): void => {
      const cur = u.buffs.find(x => x.id === b.id)
      const src = b.sourceId ? this.s.find(b.sourceId) : undefined
      this.s.logger.emit({
        type: `${grp}_${kind}` as EventType, source: src?.name, target: u.name, sourceId: b.sourceId, targetId: u.id,
        payload: { id: b.id, name: b.name, stacks: cur?.stacks ?? b.stacks ?? 1, maxStacks: b.maxStacks, turns: cur?.turns ?? b.turns, shield: b.shield, mods: b.mods, debuff: deb },
      })
      // spec §6 step 6 "Выполнить onApply", paired with the emit above. Hands over the STORED
      // record (`cur`), not the incoming spec: on the stacked/refreshed paths that is the one
      // carrying the post-application stacks/turns a reacting hook needs. No recursion guard -
      // a hook that re-adds a buff recurses exactly like the sibling `onBuffExpire` does; the
      // trigger queue (spec §27) is the real fix and is not built yet.
      this.s.events.fireBuffApplied(u, cur ?? b, src)
    }
    if (ex && b.maxStacks) { ex.stacks = Math.min(b.maxStacks, (ex.stacks ?? 1) + 1); ex.turns = b.turns; rec(ex.stacks); emit('STACKED'); return }
    if (ex) { ex.turns = b.turns ?? ex.turns; rec(ex.stacks ?? 1, ex.turns); emit('REFRESHED'); return }
    // shield provided by someone with shield sets: amplify absorption + Self-Enshrouded 4pc ally CRIT DMG
    if (b.shield !== undefined && b.sourceId) {
      const provider = this.s.gearMap.get(b.sourceId)
      if (provider && provider.shieldMult > 0) b.shield = Math.round(b.shield * (1 + provider.shieldMult))
      if (provider?.relicSets4?.some(s => s.id === 'self_enshrouded')) {
        this.add(u, { id: 'se_cd', name: 'Enshrouded CRIT DMG', mods: [{ stat: 'critDmg', value: 0.15 }], turns: b.turns ?? 1 })
      }
      const prov = this.s.find(b.sourceId)
      if (prov) provider?.cone?.onShieldProvide?.(this.s, prov, u, provider.coneSi)
    }
    u.buffs.push({ ...b })
    if (b.shield !== undefined) this.s.events.fireAllyShield(u, b.shield, b.sourceId ? this.s.find(b.sourceId) : undefined)
    rec(b.stacks ?? 1)
    emit('APPLIED')
    if (b.shield !== undefined) this.s.logger.emit({ type: 'SHIELD_APPLIED', source: b.sourceId ? this.s.find(b.sourceId)?.name : undefined, target: u.name, sourceId: b.sourceId, targetId: u.id, payload: { amount: b.shield, id: b.id } })
  }

  /** the one countdown path: tick every timed buff, fire onBuffExpire as each ends, return the count
   *  decremented. endTick uses it for turn-end ticks; units that never take a turn (event-driven
   *  memosprites like Little Ica, whose Continuous Effects tick per her own ability) reuse it too. */
  expire(u: Unit, by = 1): number {
    let ticked = 0
    u.buffs = u.buffs.filter(b => {
      if (b.turns === undefined || b.turns === Infinity) return true
      // tickOnSource buffs run on the SOURCE's clock — endTick's source pass owns them, so
      // ticking them here too would count every holder's turn as well (half the stated duration)
      if (b.tickOnSource) return true
      b.turns -= by
      ticked++
      if (b.turns > 0) return true
      this.s.events.fireBuffExpire(u, b)
      this.s.logger.emit({ type: `${isDebuff(b) ? 'DEBUFF_EXPIRED' : 'BUFF_EXPIRED'}` as EventType, target: u.name, targetId: u.id, payload: { id: b.id, name: b.name, stacks: b.stacks ?? 1 } })
      return false
    })
    return ticked
  }
}
