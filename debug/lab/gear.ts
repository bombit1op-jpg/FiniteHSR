/**
 * §45 lab — gear aggregation.
 * Isolates src/core/gear.aggregateGear: cone flat stats, relic/planar set bonuses, and the
 * SPEED-gated conditional mods (In the Night / Space Sealing Station fire only at SPD ≥ 120).
 */
import { aggregateGear } from '../../src/core/gear'
import { eq, isEntry, ok, report, type LabCase } from './harness'

const base = { level: 80, hp: 931, atk: 2500, def: 363, spd: 140, critRate: 0.7, critDmg: 1.8 }
const sum = (mods: { stat: string; value: number }[], stat: string): number =>
  mods.filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0)

export function gearLab(): LabCase[] {
  const on = aggregateGear({ coneId: 'in_the_night', si: 1, relicSets: ['musketeer', 'musketeer'], planarId: 'sss' }, base)
  const off = aggregateGear({ coneId: 'in_the_night', planarId: 'sss' }, { ...base, spd: 100 })

  return [
    eq('cone (In the Night) flat ATK', on.baseAdd.atk, 582),
    eq('cone unconditional critRate +18%', sum(on.mods, 'critRate'), 0.18),
    eq('musketeer 4pc spdPct +6%', sum(on.mods, 'spdPct'), 0.06),
    eq('SPD gate ON: atkPct = musk2 + SSS base + SSS cond = 0.36', sum(on.mods, 'atkPct'), 0.12 * 3),
    eq('SPD gate ON: In the Night critRate condition fires', on.mods.filter(m => m.stat === 'boost:skill').length, 1),
    ok('SPD < 120: In the Night condition suppressed', off.mods.filter(m => m.stat === 'boost:basic' || m.stat === 'boost:skill').length === 0),
    ok('SPD < 120: SSS conditional suppressed (only its base atkPct remains)', sum(off.mods, 'atkPct') === 0.12)
  ]
}

if (isEntry('gear.ts')) process.exitCode = report('Gear aggregation lab', gearLab())
