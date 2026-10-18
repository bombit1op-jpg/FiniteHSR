/**
 * §45 lab — break / toughness.
 * Isolates Break DMG (combat/DamageCalculator.computeBreakDamage): the MaxToughnessMult
 * `0.5 + tough/40` (project canon — NOT the reference /120), the per-element Break coefficient,
 * the level multiplier, and the intact ×0.9 / broken ×1.0 transition.
 */
import { computeBreakDamage } from '../../src/core/combat/DamageCalculator'
import { rawDefMult } from '../../src/core/combat/StatResolver'
import { BREAK_ELEM_MULT, elationLevelMultiplier, levelMultiplier } from '../../src/core/combat/LevelMultiplier'
import type { Elem } from '../../src/core/entities/Unit'
import { eq, isEntry, mkUnit, report, type LabCase } from './harness'

export function breakLab(): LabCase[] {
  const defM = rawDefMult(80, 95)
  const lm80 = levelMultiplier(80)
  const attacker = mkUnit({ name: 'A', base: { level: 80, hp: 1, atk: 1, def: 1, spd: 1 } })
  const tgt = (tough: number, broken = false): ReturnType<typeof mkUnit> =>
    mkUnit({ side: 'enemy', maxToughness: tough, broken, base: { level: 95, hp: 9_999_999, atk: 1, def: 0, spd: 1 } })
  const breakDmg = (elem: Elem, tough: number, broken = false): number =>
    computeBreakDamage({ attacker, target: tgt(tough, broken), elem, kind: 'break' })

  // base = elemMult × LM × (0.5 + tough/40); intact break ×0.9
  const base = (elemMult: number, tough: number): number => elemMult * lm80 * (0.5 + tough / 40)

  return [
    eq('lvlMult 80 anchor', lm80, 3767.5533),
    eq('elation lvlMult = 2× toughness table', elationLevelMultiplier(80), 7535.1066),
    eq('BREAK_ELEM_MULT Physical = 2', BREAK_ELEM_MULT.Physical, 2),
    eq('BREAK_ELEM_MULT Quantum = 0.5', BREAK_ELEM_MULT.Quantum, 0.5),
    eq('MaxToughnessMult 0.5+tough/40 (t60): Physical', breakDmg('Physical', 60), Math.floor(base(2, 60) * defM * 0.9), 0.5),
    eq('MaxToughnessMult (t40): Physical', breakDmg('Physical', 40), Math.floor(base(2, 40) * defM * 0.9), 0.5),
    eq('Break coefficient Ice (×1) vs Physical (×2) = half', breakDmg('Ice', 60), Math.floor(base(1, 60) * defM * 0.9), 0.5),
    eq('broken target ×1.0 (not ×0.9)', breakDmg('Physical', 60, true), Math.floor(base(2, 60) * defM), 0.5)
  ]
}

if (isEntry('break.ts')) process.exitCode = report('Break / toughness lab', breakLab())
