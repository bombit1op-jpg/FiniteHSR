/**
 * §45 lab — resources / energy.
 * Isolates combat/ResourceSystem: ERR multiplies flat regen (gainEnergy) but NOT a flat grant
 * (gainEnergyFlat), both clamp at maxEnergy, and the SP pool clamps [0, maxSp] with a spend that
 * fails rather than going negative.
 */
import { Simulator } from '../../src/core/simulator'
import { eq, isEntry, mkUnit, mod, ok, report, type LabCase } from './harness'

export function energyLab(): LabCase[] {
  const sim = new Simulator({ cycles: 1, seed: 1 })
  const u = mkUnit({ name: 'U', maxEnergy: 120, energy: 0 })
  sim.roster.push(u)

  u.energy = 0
  sim.gainEnergy(u, 50)
  const plain = u.energy

  u.energy = 0
  u.buffs = [mod('err', 0.5)]
  sim.gainEnergy(u, 50)
  const withErr = u.energy

  u.energy = 100
  sim.gainEnergy(u, 50)          // 100 + 75 → clamp
  const overcap = u.energy

  u.buffs = []
  u.energy = 0
  sim.gainEnergyFlat(u, 50)      // flat grant ignores ERR
  const flat = u.energy

  u.buffs = []
  const maxSp = sim.maxSp
  sim.gainSp(10)
  const spGained = sim.sp()
  const spendTooMuch = sim.spendSp(6)
  const spAfterShort = sim.sp()
  const spendOk = sim.spendSp(3)

  return [
    eq('gainEnergy no ERR: +50', plain, 50),
    eq('gainEnergy with ERR 50%: +75', withErr, 75),
    eq('gainEnergy clamps at maxEnergy', overcap, 120),
    ok('energy never exceeds maxEnergy', overcap <= u.maxEnergy),
    eq('gainEnergyFlat ignores ERR: +50', flat, 50),
    eq('SP cap default = 5', maxSp, 5),
    eq('gainSp clamps at maxSp', spGained, 5),
    ok('spendSp aborts when short (returns false, no negative)', spendTooMuch === false && spAfterShort === 5),
    ok('spendSp succeeds when affordable', spendOk === true && sim.sp() === 2)
  ]
}

if (isEntry('energy.ts')) process.exitCode = report('Resource / energy lab', energyLab())
