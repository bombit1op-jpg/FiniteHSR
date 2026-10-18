import type { Unit } from '../entities/Unit'
import type { Simulator } from '../simulator'
import { buffVal } from '../simulator'
import { archerOnSpChange } from '../kits/archer'
import { rinOnSpChange } from '../kits/rin'
import { redHerringOnSpSpend } from '../kits/sparkle'
import { mishaOnSpSpend } from '../kits/misha'
import { swOnSpSpend } from '../kits/silver_wolf_lv999'

/** Team resources: shared SP pool, per-turn SP counters, Energy regen.
 *  Extracted from Simulator (TODO L86 ResourceManager); Simulator keeps thin
 *  `sp`/`gainSp`/`spendSp`/`gainEnergy`/`gainEnergyFlat` delegates so the
 *  800+ call sites stay untouched. */
export class ResourceSystem {
  /** shared SP pool (start 3, cap = sim.maxSp) */
  pool = 3
  /** SP spent by the acting character within their current turn */
  spThisTurn = 0
  /** true once the acting char's turn has crossed >=4 SP (team SP-gate cones, once per turn) */
  spHigh = false

  constructor(private s: Simulator) {}

  sp(): number { return this.pool }

  gain(n: number): void {
    const before = this.pool
    this.pool = Math.max(0, Math.min(this.s.maxSp, this.pool + n))
    if (this.s.logger.on && this.pool > before) this.s.logger.emit({ type: 'SP_GAIN', source: this.s.currentActor?.name, sourceId: this.s.currentActor?.id, payload: { n: this.pool - before, total: this.pool } })
    if (this.s.logger.on && this.pool < before) this.s.logger.emit({ type: 'SP_LOSS', source: this.s.currentActor?.name, sourceId: this.s.currentActor?.id, payload: { n: before - this.pool, total: this.pool } })
    // Archer A3 Guardian: allies gained SP → if pool ≤ 4, Archer CRIT DMG +120% 1t
    archerOnSpChange(this.s)
    // Rin talent: SP recovered → ally CRIT DMG + CD buff 2t, Rin +7 Energy
    rinOnSpChange(this.s, true)
  }

  spend(n: number): boolean {
    if (this.pool < n) return false
    this.pool -= n
    if (this.s.logger.on) this.s.logger.emit({ type: 'SP_LOSS', source: this.s.currentActor?.name, sourceId: this.s.currentActor?.id, payload: { n, total: this.pool } })
    this.spThisTurn += n
    if (this.s.currentActor?.side === 'ally' && this.s.currentActor.kind === 'char') {
      const g = this.s.gearMap.get(this.s.currentActor.id)
      g?.planar?.onSpSpend?.(this.s, this.s.currentActor, this.spThisTurn)
      g?.cone?.onSpSpend?.(this.s, this.s.currentActor, this.spThisTurn, g.coneSi)
      // team SP-gate (Flickering Stars Radiant Crown): once per turn when >=4 SP spent
      if (this.spThisTurn >= 4 && !this.spHigh) {
        this.spHigh = true
        for (const a of this.s.roster) {
          if (a.dead || a.side !== 'ally' || a.kind !== 'char') continue
          const ag = this.s.gearMap.get(a.id)
          ag?.cone?.onTurnSpHigh?.(this.s, a, this.spThisTurn, ag.coneSi)
        }
      }
    }
    // Sparkle talent: any ally consuming SP buffs the team
    redHerringOnSpSpend(this.s)
    // Misha talent: any ally consuming SP → +1 hit + energy
    mishaOnSpSpend(this.s)
    // Rin talent: SP consumed → ally CRIT DMG + CD buff 2t, Rin +7 Energy
    rinOnSpChange(this.s, false)
    // Silver Wolf LV.999: SP spent inside her Zone may trigger Top Loot Box, 1 roll per point
    swOnSpSpend(this.s, n)
    return true
  }

  /** ERR from buffs multiplies flat regen */
  gainEnergy(u: Unit, base: number): void {
    const err = buffVal(u, 'err')
    const wasFull = u.energy >= u.maxEnergy
    const before = u.energy
    u.energy = Math.min(u.maxEnergy, u.energy + base * (1 + err))
    if (this.s.logger.on && u.energy > before) {
      const gained = u.energy - before
      this.s.logger.emit({ type: 'ENERGY_GAIN', source: this.s.currentActor?.name ?? u.name, target: u.name, sourceId: this.s.currentActor?.id ?? u.id, targetId: u.id, payload: { n: gained, total: u.energy, max: u.maxEnergy, err } })
      if (!wasFull && u.energy >= u.maxEnergy) this.s.logger.emit({ type: 'ENERGY_FULL', source: this.s.currentActor?.name ?? u.name, target: u.name, sourceId: this.s.currentActor?.id ?? u.id, targetId: u.id })
    }
    if (!wasFull && u.energy >= u.maxEnergy && this.s.turns.departedUlt(u)) this.s.immediateTurn(u)
    if (u.side === 'ally' && u.kind === 'char') {
      for (const [kid, kit] of this.s.kits) {
        kit.onAllyEnergy?.(this.s, u, base, this.s.runtimes.get(kid) ?? {})
      }
    }
  }

  /** flat energy regen — NOT multiplied by ERR (light cones / sets / wave-start / techniques) */
  gainEnergyFlat(u: Unit, base: number): void {
    const before = u.energy
    u.energy = Math.min(u.maxEnergy, u.energy + base)
    if (this.s.logger.on && u.energy > before) this.s.logger.emit({ type: 'ENERGY_GAIN', source: this.s.currentActor?.name ?? u.name, target: u.name, sourceId: this.s.currentActor?.id ?? u.id, targetId: u.id, payload: { n: u.energy - before, total: u.energy, max: u.maxEnergy, err: 0, flat: true } })
    if (u.side === 'ally' && u.kind === 'char') {
      for (const [kid, kit] of this.s.kits) {
        kit.onAllyEnergy?.(this.s, u, base, this.s.runtimes.get(kid) ?? {})
      }
    }
  }

  /** §7 energy drain: remove up to `base` Energy, clamped at 0 (enemy "drain %Max Energy",
   *  canon Mr. Domescreen "Startling Broadcast" −20%). Emits ENERGY_LOSS when any is removed;
   *  no ERR / onAllyEnergy hook (this is a loss, not a regen). */
  loseEnergy(u: Unit, base: number): void {
    const amount = Math.min(base, u.energy)
    if (amount <= 0) return
    u.energy -= amount
    if (this.s.logger.on) this.s.logger.emit({ type: 'ENERGY_LOSS', source: this.s.currentActor?.name ?? u.name, target: u.name, sourceId: this.s.currentActor?.id ?? u.id, targetId: u.id, payload: { amount, energy: u.energy, max: u.maxEnergy, reason: 'drain' } })
  }
}
