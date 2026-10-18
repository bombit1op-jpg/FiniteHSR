/**
 * §44 `regression/` — the damage multiplier chain, factor by factor.
 *
 * `dealDamage` multiplies ~10 factors (crit, boost, weaken, DEF, RES, vuln, mitigation, broken,
 * final). Dropping or double-counting one breaks every kit at once and NOTHING in `npm test`
 * notices — `probe-damage-chain.ts` catches it, but that is a manual run, not a gate. Each case
 * here pins ONE factor's exact multiplier, so a bad edit names itself.
 *
 * Order itself is NOT the invariant: every factor is a scalar and multiplication commutes, so
 * canon order (base×crit×boost×weaken×DEF×RES×vuln×mit×broken×final, wiki/fandom Damage) is
 * equivalent to any other. `probe-damage-chain.ts` re-derives each hit in reference order and
 * compares — that is the order check. This file is the completeness check.
 *
 * Two factors REPLACE rather than scale, which is what makes naive expectations wrong:
 *   - `resFactor` recomputes from (target RES − total RES PEN); more PEN is not `×(1+pen)`.
 *   - `defMultiplier` = (LvAtk·10+200) / ((200+10·LvFoe)·mod + LvAtk·10+200) — the numerator
 *     carries the attacker's level, so DEF ignore does NOT scale the neutral DEF multiplier.
 */

import { dealDamage } from '../../src/core/combat/DamageCalculator'
import { eff } from '../../src/core/combat/StatResolver'
import type { Buff } from '../../src/core/effects/Buff'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const ATK_LVL = 80
const FOE_LVL = 95
const ATK = 1000
const FOE_RES = 0.2
const NEUTRAL_DEF_M = 1000 / (200 + 10 * FOE_LVL + 1000)

type Mods = [string, number][]

function mkUnit(side: 'ally' | 'enemy', level: number, res: Partial<Record<string, number>>): Unit {
  return {
    id: side, name: side, side, kind: side === 'ally' ? 'char' : 'enemy', elem: 'Physical',
    base: { level, hp: 1000, atk: ATK, def: 500, spd: 100, critRate: 0.25, critDmg: 0.5 },
    hp: 1e9, maxHp: 1e9, energy: 0, maxEnergy: 100, av: 0, buffs: [], dots: [],
    toughness: 0, maxToughness: 0, broken: false, weaknesses: [], res,
  } as unknown as Unit
}

const withBuffs = (u: Unit, mods: Mods): Unit => {
  if (mods.length) u.buffs.push({ id: 'x', name: 'x', turns: 1, mods: mods.map(([stat, value]) => ({ stat, value })) } as unknown as Buff)
  return u
}

/** 1000-ATK L80 hit vs an L95 20%-RES target; `statValue` is supplied, so no atkPct scaling here */
function hit(atkMods: Mods, foeMods: Mods, opts?: { crit?: boolean; noDmgBoost?: boolean }): number {
  const a = withBuffs(mkUnit('ally', ATK_LVL, {}), atkMods)
  const e = withBuffs(mkUnit('enemy', FOE_LVL, { Physical: FOE_RES }), foeMods)
  return dealDamage({
    attacker: a, target: e, elem: 'Physical', type: 'skill', statValue: ATK, mult: 1,
    canCrit: opts?.crit ? undefined : false, forceCrit: opts?.crit || undefined, noDmgBoost: opts?.noDmgBoost,
  }, () => 0).dmg
}

/** resFactor for a given total RES PEN against the 20% fixture */
const resM = (pen: number) => 1 - Math.min(0.9, Math.max(-1, FOE_RES - pen))
/** resFactor for a given target-side All-Type RES (resAll: -- = lowered, + = raised) on the 20% fixture */
const resAllM = (resAll: number) => 1 - Math.min(0.9, Math.max(-1, FOE_RES + resAll))
/** defMultiplier for a given DEF modifier */
const defM = (mod: number) => 1000 / ((200 + 10 * FOE_LVL) * mod + 1000)

/** [name, attacker mods, foe mods, expected damage] — expected written out, not derived from a shared helper */
const factors: [string, Mods, Mods, number][] = [
  ['DMG Boost: boost:skill +30%', [['boost:skill', 0.3]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.3)],
  ['DMG Boost: dmg:Physical +30%', [['dmg:Physical', 0.3]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.3)],
  ['DMG Boost: dmgAll +30%', [['dmgAll', 0.3]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.3)],
  ['DMG Boost pools are ADDITIVE (3×30% = 90%)',
    [['boost:skill', 0.3], ['dmg:Physical', 0.3], ['dmgAll', 0.3]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.9)],
  ['Weaken 40%', [['weaken', 0.4]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 0.6)],
  ['Weaken clamps at 100% (×0, not negative)', [['weaken', 1.5]], [], 0],
  ['RES PEN 50%: 20% RES becomes −30% → ×1.3', [['resPenAll', 0.5]], [], Math.floor(ATK * NEUTRAL_DEF_M * resM(0.5))],
  ['resPenAll and resPen:Physical are ADDITIVE',
    [['resPenAll', 0.3], ['resPen:Physical', 0.2]], [], Math.floor(ATK * NEUTRAL_DEF_M * resM(0.5))],
  ['RES PEN floor: 200% PEN on 20% RES = ×2.0', [['resPenAll', 2]], [], Math.floor(ATK * NEUTRAL_DEF_M * 2)],
  ['target-side resAll −50%: 20% RES becomes −30% → ×1.3', [], [['resAll', -0.5]], Math.floor(ATK * NEUTRAL_DEF_M * resAllM(-0.5))],
  ['target-side resAll +30% (All-Type RES raised) → ×0.5', [], [['resAll', 0.3]], Math.floor(ATK * NEUTRAL_DEF_M * resAllM(0.3))],
  ['resAll and resRed:Physical are ADDITIVE (both RES stage): 20% − 50% − 20% = −50% → ×1.5',
    [], [['resAll', -0.5], ['resRed:Physical', 0.2]], Math.floor(ATK * NEUTRAL_DEF_M * 1.5)],
  ['vulnerability +50%', [], [['vulnAll', 0.5]], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.5)],
  ['resAll (RES stage) and vulnAll (vuln stage) are MULTIPLICATIVE, not pooled: RES−30% & vuln+50% = ×1.1 ×1.5',
    [], [['resAll', -0.3], ['vulnAll', 0.5]], Math.floor(ATK * NEUTRAL_DEF_M * resAllM(-0.3) * 1.5)],
  ['vulnAll + vuln:Physical are ADDITIVE', [], [['vulnAll', 0.3], ['vuln:Physical', 0.2]], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.5)],
  ['vulnerability cap: +250% = ×3.5', [], [['vulnAll', 2.5]], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 3.5)],
  ['Mitigation 30%', [], [['mitigation', 0.3]], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 0.7)],
  ['Mitigation clamps at 100%', [], [['mitigation', 1.5]], 0],
  ['DEF ignore 40% on the foe', [], [['defIgnore', 0.4]], Math.floor(ATK * defM(0.6) * 0.8)],
  ['DEF reduction 40% (defRed)', [], [['defRed', 0.4]], Math.floor(ATK * defM(0.6) * 0.8)],
  ['defBonus 40% goes the other way', [], [['defBonus', 0.4]], Math.floor(ATK * defM(1.4) * 0.8)],
  ['DEF ignore and defRed stack', [], [['defIgnore', 0.2], ['defRed', 0.2]], Math.floor(ATK * defM(0.6) * 0.8)],
  ['finalDmgBoost 20% is MULTIPLICATIVE on the boost pool (30% + 20% = ×1.56)',
    [['boost:skill', 0.3], ['finalDmgBoost', 0.2]], [], Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.3 * 1.2)],
]

export default function (): Case[] {
  const cases: Case[] = [
    t.eq('neutral baseline is floor(1000 × DEF × RES)', hit([], []), Math.floor(ATK * NEUTRAL_DEF_M * 0.8)),
  ]

  for (const [name, atkMods, foeMods, expected] of factors)
    cases.push(t.eq(name, hit(atkMods, foeMods), expected))

  // the 20% fixture cannot express the RES cap, so that row needs its own target
  cases.push(t.eq('RES reduction floor: 100% RES on the foe = ×0.1', dealDamage(
    { attacker: mkUnit('ally', ATK_LVL, {}), target: mkUnit('enemy', FOE_LVL, { Physical: 1 }),
      elem: 'Physical', type: 'skill', statValue: ATK, mult: 1, canCrit: false }, () => 0).dmg,
    Math.floor(ATK * NEUTRAL_DEF_M * 0.1)))

  // crit multiplier only exists on a crit hit — same buff, canCrit:false vs forceCrit
  cases.push(t.eq('critDmg has no effect on canCrit:false hits', hit([['critDmg', 1]], []), hit([], [])))
  cases.push(t.eq('critDmg +100% crits for ×2.5', hit([['critDmg', 1]], [], { crit: true }), Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 2.5)))
  cases.push(t.eq('forceCrit crits even at CR 0 (roll is skipped)', hit([], [], { crit: true }), Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.5)))
  cases.push(t.eq('critDmg:skill on the attacker stacks onto the base', hit([['critDmg', 1], ['critDmg:skill', 1]], [], { crit: true }),
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 3.5)))
  // critDmgTaken lives on the TARGET, not the attacker
  cases.push(t.eq('critDmgTaken:skill on the foe adds to the crit multiplier', hit([['critDmg', 1]], [['critDmgTaken:skill', 0.5]], { crit: true }),
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 3)))
  cases.push(t.eq('critDmgTaken on the ATTACKER is inert', hit([['critDmg', 1], ['critDmgTaken:skill', 0.5]], [], { crit: true }),
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 2.5)))
  // noDmgBoost (Time Waits for No One) drops the additive pool but keeps finalDmgBoost
  cases.push(t.eq('noDmgBoost drops the boost pool', hit([['boost:skill', 1]], [], { noDmgBoost: true }), Math.floor(ATK * NEUTRAL_DEF_M * 0.8)))
  cases.push(t.eq('noDmgBoost keeps finalDmgBoost', hit([['boost:skill', 1], ['finalDmgBoost', 0.5]], [], { noDmgBoost: true }),
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 1.5)))

  // broken-state universal multiplier (×0.9 while the enemy is still intact)
  const intact = mkUnit('enemy', FOE_LVL, { Physical: FOE_RES })
  intact.maxToughness = 60
  cases.push(t.eq('intact enemy takes ×0.9', hit([], []) === 0 ? 0 : dealDamage(
    { attacker: mkUnit('ally', ATK_LVL, {}), target: Object.assign(intact, { broken: false }), elem: 'Physical', type: 'skill', statValue: ATK, mult: 1, canCrit: false }, () => 0).dmg,
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8 * 0.9)))
  cases.push(t.eq('Weakness-Broken enemy takes ×1.0', dealDamage(
    { attacker: mkUnit('ally', ATK_LVL, {}), target: Object.assign(mkUnit('enemy', FOE_LVL, { Physical: FOE_RES }), { maxToughness: 60, broken: true }),
    elem: 'Physical', type: 'skill', statValue: ATK, mult: 1, canCrit: false }, () => 0).dmg,
    Math.floor(ATK * NEUTRAL_DEF_M * 0.8)))
  cases.push(t.eq('toughnessless target skips the ×0.9 penalty', hit([], []), Math.floor(ATK * NEUTRAL_DEF_M * 0.8)))

  // atkPct changes the hit BASE via eff(), which dealDamage reads through statValue — that scaling
  // belongs to the pipeline, so assert it on eff() rather than duplicating the chain
  const aPct = withBuffs(mkUnit('ally', ATK_LVL, {}), [['atkPct', 0.5], ['atkFlat', 100]])
  cases.push(t.eq('atkPct/atkFlat resolve in eff().atk (pipeline base)', eff(aPct).atk, Math.round(ATK * 1.5) + 100))

  // full stack: one number for the whole product, so a factor dropped only in combination fails
  cases.push(t.eq('full factor stack matches the reference product',
    hit([['critDmg', 1], ['boost:skill', 0.3], ['weaken', 0.4], ['resPenAll', 0.5], ['finalDmgBoost', 0.2]],
      [['vulnAll', 0.5], ['mitigation', 0.3], ['defIgnore', 0.4]], { crit: true }),
    Math.floor(ATK * 2.5 * 1.3 * 0.6 * defM(0.6) * resM(0.5) * 1.5 * 0.7 * 1.2)))

  return cases
}
