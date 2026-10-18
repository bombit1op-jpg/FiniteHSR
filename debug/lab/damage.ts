/**
 * §45 lab — damage formula.
 * Isolates the pure per-hit chain (combat/DamageCalculator + combat/StatResolver): DEF mult,
 * RES cap, RES-PEN floor, vulnerability cap, crit, broken multiplier, finalDmgBoost composition.
 * No Simulator, no rng drift — expected values are written out by hand from the doc'd caps.
 */
import { dealDamage, makeRng } from '../../src/core/combat/DamageCalculator'
import { defMultiplier, rawDefMult, resFactor, vulnFactor, vulnMult } from '../../src/core/combat/StatResolver'
import type { Buff } from '../../src/core/effects/Buff'
import type { Unit } from '../../src/core/entities/Unit'
import { eq, isEntry, mkUnit, mod, ok, report, type LabCase } from './harness'

export function damageLab(): LabCase[] {
  const defM = rawDefMult(80, 95)                       // (800+200)/(1150+800+200)
  const target = mkUnit({ side: 'enemy', res: { Fire: 0.2 }, maxToughness: 60 })
  const noBuff: Buff[] = []
  const t95 = (extra: Partial<Unit> = {}): Unit =>
    mkUnit({ side: 'enemy', maxToughness: 60, base: { level: 95, hp: 9999, atk: 1, def: 0, spd: 1 }, ...extra })

  // crit: guaranteed crit multiplies by (1 + critDmg)
  const critA = mkUnit({ name: 'A', elem: 'Fire', base: { level: 80, hp: 1, atk: 2500, def: 0, spd: 100, critRate: 1, critDmg: 1.0 } })
  const critDmg = dealDamage({ attacker: critA, target: t95(), elem: 'Fire', type: 'skill', statValue: 2500, mult: 1.10 }, makeRng(1)).dmg

  // broken multiplier ×1.0 (broken) vs ×0.9 (intact)
  const bA = mkUnit({ name: 'A', elem: 'Fire' })
  const hit = (t: Unit): number => dealDamage({ attacker: bA, target: t, elem: 'Fire', type: 'skill', statValue: 2500, mult: 1, canCrit: false }, makeRng(1)).dmg

  // finalDmgBoost composes multiplicatively (1.5 × 1.3 = 1.95), not additively
  const boostA = mkUnit({ name: 'A', elem: 'Fire', buffs: [mod('dmgAll', 0.5), mod('finalDmgBoost', 0.3)] })
  const boostDmg = dealDamage({ attacker: boostA, target: t95(), elem: 'Fire', type: 'skill', statValue: 2500, mult: 1, canCrit: false }, makeRng(1)).dmg

  return [
    // ---- DEF multiplier ----
    eq('DEF mult lvl80 vs lvl95', defMultiplier(80, 95, mkUnit({ base: { level: 95, hp: 1, atk: 1, def: 0, spd: 1 } })), defM),
    eq('DEF mult +50% ignore', defMultiplier(80, 95, mkUnit(), 0.5), rawDefMult(80, 95, 0.5)),

    // ---- RES cap 90% + PEN floor -100% (StatResolver caps [-1, 0.9]) ----
    eq('RES 20% no pen -> 0.8', resFactor(target, noBuff, 'Fire'), 0.8, 1e-9),
    eq('RES 95% -> capped 0.1 (reduction cap 90%)', resFactor(mkUnit({ side: 'enemy', res: { Fire: 0.95 } }), noBuff, 'Fire'), 0.1, 1e-9),
    eq('RES 20% + PEN 200% -> capped 2.0 (floor -100%)', resFactor(target, [mod('resPenAll', 2.0)], 'Fire'), 2.0, 1e-9),

    // ---- vulnerability cap +250% (3.5x), floor 1.0 ----
    eq('vuln +400% -> capped 3.5x', vulnFactor(4.0), 3.5),
    eq('vuln negative -> floored 1.0x', vulnFactor(-0.5), 1.0),
    eq('vulnMult all-type +100% -> 2.0x', vulnMult(mkUnit({ side: 'enemy', buffs: [mod('vulnAll', 1.0)] }), 'Fire', 'skill'), 2.0),

    // ---- crit: guaranteed crit multiplies by 1 + critDmg ----
    eq('guaranteed crit uses 1+CD', critDmg, Math.floor(2500 * 1.10 * (1 + 1.0) * defM * 0.9), 0.5),

    // ---- broken multiplier ×1.0 vs intact ×0.9 ----
    eq('intact target ×0.9', hit(t95()), Math.floor(2500 * defM * 0.9), 0.5),
    eq('broken target ×1.0', hit(t95({ broken: true })), Math.floor(2500 * defM), 0.5),

    // ---- finalDmgBoost composes with the boost pool ----
    eq('boost 0.5 × final 0.3 = 1.95', boostDmg, Math.floor(2500 * 1.5 * 1.3 * defM * 0.9), 0.5),
    ok('finalDmgBoost is NOT additive (≠1.8)', boostDmg !== Math.floor(2500 * 1.8 * defM * 0.9))
  ]
}

if (isEntry('damage.ts')) process.exitCode = report('Damage formula lab', damageLab())
