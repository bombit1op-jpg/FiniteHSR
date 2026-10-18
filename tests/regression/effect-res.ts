/**
 * Effect RES resolution (§16) — `effectResOf` = static `Unit.effectRes` + `effRes` buff mods, and
 * `applyDebuff` must check THAT, not the raw static field. The enemy `dot` / `control` ops must too
 * (they roll a BASE chance against the target's Effect RES, mirroring `applyDebuff`).
 *
 * Documented §33 known deviation: `applyDebuff` read a static `target.effectRes`, so a debuff that
 * lowers a target's Effect RES (Dreamjolt Troupe's Spring Loader "Effect RES −20%") had no path to
 * actually raise a later debuff's landing chance. `effectResOf` (StatResolver) is the single resolved
 * value both `applyDebuff` and the Ocean Sing cone formula now read. The landing assertions pin an
 * EXPLICIT `rngf` so the outcome is deterministic (no sampling flakiness).
 */
import { effectResOf } from '../../src/core/combat/StatResolver'
import { Simulator } from '../../src/core/simulator'
import { executeEnemyAbility, type EnemyAbilityDefinition } from '../../src/core/enemy'
import type { Buff } from '../../src/core/effects/Buff'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const unit = (side: 'ally' | 'enemy', effectRes?: number): Unit => ({
  id: 'U', name: 'U', side, kind: side === 'enemy' ? 'enemy' : 'char', elem: 'Physical',
  base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
  hp: 1000, maxHp: 1000, energy: 0, maxEnergy: 100, av: 100,
  buffs: [], dots: [], weaknesses: [], res: {}, effectRes,
} as unknown as Unit)

const effRes = (id: string, value: number): Buff => ({ id, name: id, mods: [{ stat: 'effRes', value }] } as unknown as Buff)

export default (): Case[] => {
  const cases: Case[] = []

  // resolved value: static base + buff mods (stack-aware), for either side
  cases.push(t.eq('static only', effectResOf(unit('enemy', 0.2)), 0.2))
  cases.push(t.eq('no static, no buffs', effectResOf(unit('ally')), 0))

  const tgt = unit('enemy', 0.2)
  tgt.buffs = [effRes('shred', -0.2)]
  cases.push(t.eq('lowered by an effRes debuff', effectResOf(tgt), 0))
  tgt.buffs = [effRes('shred', -0.2), effRes('shred2', -0.8)]
  cases.push(t.eq('sums across mods', effectResOf(tgt), -0.8))

  const ward = unit('ally')
  ward.buffs = [effRes('ward', 0.5)]
  cases.push(t.eq('raised by an effRes buff', effectResOf(ward), 0.5))

  // landing: with a fixed roll of 0.6, a target at Effect RES 0.5 (chance 0.5) resists; lowering
  // its Effect RES to 0 (chance 1.0) makes the same roll land. EHR 0, base chance 1.0.
  const sim = new Simulator({ cycles: 1, seed: 1 })
  const src = unit('ally')
  const foe = unit('enemy', 0.5)
  sim.rngf = () => 0.6

  let landed = 0
  sim.applyDebuff(src, foe, 1.0, () => { landed++ }, 'probe')
  cases.push(t.eq('roll 0.6 vs Effect RES 0.5 (chance 0.5) resists', landed, 0))

  foe.buffs = [effRes('shred', -0.5)] // Effect RES 0.5 → 0, chance → 1.0, same roll lands
  sim.applyDebuff(src, foe, 1.0, () => { landed++ }, 'probe')
  cases.push(t.eq('same roll lands once Effect RES is lowered to 0', landed, 1))

  // an effRes BUFF on the target can now make a would-be landing roll resist
  const warded = unit('enemy', 0)
  warded.buffs = [effRes('ward', 0.5)] // Effect RES 0 → 0.5, chance 0.5, roll 0.6 resists
  let landed2 = 0
  sim.applyDebuff(src, warded, 1.0, () => { landed2++ }, 'probe')
  cases.push(t.eq('effRes buff makes roll 0.6 resist (chance 0.5)', landed2, 0))

  // ---- enemy `dot` / `control` ops roll a BASE chance against the target's Effect RES ----
  // (the former flat gate ignored it; a base 1.0 op landed even on a high-Effect-RES ally)
  const sim2 = new Simulator({ cycles: 1, seed: 1 })
  const mob = unit('enemy')
  const dotAbility: EnemyAbilityDefinition = { id: 'p_dot', name: 'Probe DoT', effects: [{ op: 'dot', kind: 'Shock', mult: 1, turns: 3, elem: 'Lightning', chance: 1.0 }] }
  const ctrlAbility: EnemyAbilityDefinition = { id: 'p_ctrl', name: 'Probe Control', effects: [{ op: 'control', kind: 'Freeze', turns: 1, chance: 1.0 }] }
  const halfAbility: EnemyAbilityDefinition = { id: 'p_half', name: 'Probe Half', effects: [{ op: 'dot', kind: 'Burn', mult: 1, turns: 2, chance: 0.5 }] }

  sim2.rngf = () => 0.6
  const r1 = unit('ally', 0.5) // base 1.0 vs Effect RES 0.5 → 0.5; roll 0.6 resists
  executeEnemyAbility(sim2, mob, dotAbility, [r1])
  cases.push(t.eq('enemy dot: base 1.0 vs Effect RES 0.5, roll 0.6 → resists', r1.dots.length, 0))

  const r2 = unit('ally', 0.5)
  executeEnemyAbility(sim2, mob, ctrlAbility, [r2])
  cases.push(t.eq('enemy control: base 1.0 vs Effect RES 0.5, roll 0.6 → resists', r2.dots.length, 0))

  const r3 = unit('ally', 0.5) // Effect RES lowered to 0 → resolved 1.0 → no roll → lands
  r3.buffs = [effRes('shred', -0.5)]
  executeEnemyAbility(sim2, mob, dotAbility, [r3])
  cases.push(t.eq('enemy dot: Effect RES lowered to 0 → lands', r3.dots.filter(d => d.kind === 'Shock').length, 1))

  const r4 = unit('ally') // an effRes buff raises resist on an Effect-RES-free target
  r4.buffs = [effRes('ward', 0.5)]
  executeEnemyAbility(sim2, mob, ctrlAbility, [r4])
  cases.push(t.eq('enemy control: effRes buff makes roll 0.6 resist', r4.dots.length, 0))

  sim2.rngf = () => 0.3 // sub-1 base chance scaled by Effect RES: 0.5 × (1−0.5) = 0.25 (flat 0.5 lands)
  const r5 = unit('ally', 0.5)
  executeEnemyAbility(sim2, mob, halfAbility, [r5])
  cases.push(t.eq('enemy dot: 0.5 × (1−0.5) = 0.25, roll 0.3 → resists', r5.dots.length, 0))

  return cases
}
