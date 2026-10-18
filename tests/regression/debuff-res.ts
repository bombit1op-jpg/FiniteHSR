/**
 * Debuff RES resolution — `debuffResMult` maps a debuff category to the target's `Unit.debuffRes`
 * column (raw order [Bleed, Burn, Frozen, Shock, Wind Shear, Entanglement, Imprisonment, Control
 * Effects]) and `applyDebuff(..., kind)` multiplies the landing chance by it BEFORE the cap:
 *
 *   chance = baseChance × (1+EHR) × (1−Effect RES) × (1−Debuff RES)
 *
 * Control debuffs (Freeze/Entanglement/Imprisonment) multiply the type column by the Control
 * Effects RES column (canon: an overlap with a different RES multiplies). `undefined` profile (all
 * allies, most enemies) = unaffected. `kind` never changes the number of `rngf` draws, so wiring it
 * changes only the threshold, not RNG ordering.
 */
import { debuffResMult } from '../../src/core/combat/StatResolver'
import { Simulator } from '../../src/core/simulator'
import { enemyAtLevel } from '../../src/core/endgame'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const unit = (side: 'ally' | 'enemy', debuffRes?: number[]): Unit => ({
  id: 'U', name: 'U', side, kind: side === 'enemy' ? 'enemy' : 'char', elem: 'Physical',
  base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
  hp: 1000, maxHp: 1000, energy: 0, maxEnergy: 100, av: 100,
  buffs: [], dots: [], weaknesses: [], res: {}, debuffRes,
} as unknown as Unit)

// [Bleed, Burn, Frozen, Shock, WindShear, Entanglement, Imprisonment, Control]
const COCOLIA = [0, 0, 1, 0, 0, 0, 0, 0.5]

export default (): Case[] => {
  const cases: Case[] = []

  // no profile / no kind → unaffected
  cases.push(t.eq('no profile → 1', debuffResMult(unit('enemy'), 'Burn'), 1))
  cases.push(t.eq('no kind → 1', debuffResMult(unit('enemy', COCOLIA)), 1))
  cases.push(t.eq('ally (no profile) → 1', debuffResMult(unit('ally'), 'Freeze'), 1))

  // per-category column mapping
  const burnImmune = unit('enemy', [0, 1, 0, 0, 0, 0, 0, 0])
  cases.push(t.eq('Burn col (100%) → 0', debuffResMult(burnImmune, 'Burn'), 0))
  cases.push(t.eq('Burn col leaves Shock unaffected', debuffResMult(burnImmune, 'Shock'), 1))
  cases.push(t.eq('Shock col (100%) → 0', debuffResMult(unit('enemy', [0, 0, 0, 1, 0, 0, 0, 0]), 'Shock'), 0))
  cases.push(t.eq('WindShear col (100%) → 0', debuffResMult(unit('enemy', [0, 0, 0, 0, 1, 0, 0, 0]), 'WindShear'), 0))
  cases.push(t.eq('Bleed col (100%) → 0', debuffResMult(unit('enemy', [1, 0, 0, 0, 0, 0, 0, 0]), 'Bleed'), 0))

  // control debuffs multiply the type column × Control Effects RES column
  cases.push(t.eq('Freeze on Frozen 100% × Control 50% → 0', debuffResMult(unit('enemy', COCOLIA), 'Freeze'), 0))
  cases.push(t.eq('Freeze on Frozen 50% × Control 50% → 0.25', debuffResMult(unit('enemy', [0, 0, 0.5, 0, 0, 0, 0, 0.5]), 'Freeze'), 0.25))
  cases.push(t.eq('Control column applies to Imprisonment', debuffResMult(unit('enemy', [0, 0, 0, 0, 0, 0, 0, 0.4]), 'Imprisonment'), 0.6))
  cases.push(t.eq('Entanglement also control-gated', debuffResMult(unit('enemy', [0, 0, 0, 0, 0, 0.5, 0, 0.5]), 'Entanglement'), 0.25))
  cases.push(t.eq('Burn is NOT control-gated', debuffResMult(unit('enemy', [0, 0, 0, 0, 0, 0, 0, 0.5]), 'Burn'), 1))

  // landing: multiplied BEFORE the cap (0 roll on a Burn-immune enemy still resists)
  const sim = new Simulator({ cycles: 1, seed: 1 })
  const src = unit('ally')
  const foe = unit('enemy', [0, 1, 0, 0, 0, 0, 0, 0]) // Burn-immune
  let landed = 0
  sim.rngf = () => 0.0
  sim.applyDebuff(src, foe, 1.0, () => { landed++ }, 'probe', 'Burn')
  cases.push(t.eq('Burn-immune enemy resists even a 0 roll', landed, 0))
  sim.applyDebuff(src, foe, 1.0, () => { landed++ }, 'probe') // no kind → unaffected
  cases.push(t.eq('same enemy, no kind → unaffected', landed, 1))

  // Debuff RES shrinks chance (base 1.0 × 0.5 = 0.5), not just a post-roll gate
  const halfBurn = unit('enemy', [0, 0.5, 0, 0, 0, 0, 0, 0])
  sim.rngf = () => 0.6
  sim.applyDebuff(src, halfBurn, 1.0, () => { landed++ }, 'probe', 'Burn') // 0.5, roll 0.6 resists
  cases.push(t.eq('Burn 50%: chance 0.5, roll 0.6 resists', landed, 1))
  sim.rngf = () => 0.4
  sim.applyDebuff(src, halfBurn, 1.0, () => { landed++ }, 'probe', 'Burn') // 0.5, roll 0.4 lands
  cases.push(t.eq('Burn 50%: chance 0.5, roll 0.4 lands', landed, 2))

  // RNG draw count is unchanged by `kind` (one rngf per attempt) — no ordering divergence
  let draws = 0
  sim.rngf = () => { draws++; return 0.0 }
  sim.applyDebuff(src, foe, 1.0, () => {}, 'probe', 'Burn')
  sim.applyDebuff(src, foe, 1.0, () => {}, 'probe')
  cases.push(t.eq('one rngf draw per applyDebuff regardless of kind', draws, 2))

  // end-to-end: raw enemy → EnemySpec → Simulator.addEnemy carries the profile
  const sim2 = new Simulator({ cycles: 1, seed: 1 })
  const spec = enemyAtLevel('Blaze Out of Space', 80)!
  cases.push(t.eq('raw fire enemy carries Burn Debuff RES', spec.debuffRes?.[1], 1))
  const e = sim2.addEnemy({
    name: spec.name, hp: spec.hp, spd: spec.spd, level: spec.level, toughness: spec.toughness,
    weaknesses: spec.weaknesses, res: spec.res, atk: spec.atk, effectRes: spec.effectRes, debuffRes: spec.debuffRes,
  })
  cases.push(t.eq('spawned enemy keeps debuffRes', e.debuffRes?.[1], 1))
  let landed2 = 0
  sim2.rngf = () => 0.0
  sim2.applyDebuff(src, e, 1.0, () => { landed2++ }, 'probe', 'Burn')
  cases.push(t.eq('Burn never lands on the raw fire enemy', landed2, 0))

  return cases
}
