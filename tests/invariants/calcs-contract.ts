/**
 * §44 `invariants/` — what-if calculator (`core/calcs.ts`) vs production damage chain
 * contract (docs/audit/CALC_CONTRACT.md).
 *
 * The calculator runs on flat numbers; production runs on Units+buffs with extra stages and
 * caps. These cases pin the documented EQUIVALENCE ZONES (empty buffs, uncapped stage ranges;
 * production == floor(what-if)) and the documented DIVERGENCES (caps, missing stages, broken
 * vs maxToughness=0) so a silent change in either layer fails here by name.
 */

import { runBattle } from '../../src/core/battle'
import {
  hitBreakdown, breakDamage, superBreakHit,
  type CalcProfile, type CalcEnemy,
} from '../../src/core/calcs'
import { dealDamage, computeBreakDamage } from '../../src/core/combat/DamageCalculator'
import { stdMultipliers } from '../../src/core/combat/StatResolver'
import type { Buff, Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'
import { mob } from '../_helpers/battle'

const ATK_LVL = 80
const FOE_LVL = 95

function mkUnit(side: 'ally' | 'enemy', elem: string): Unit {
  return {
    id: side, name: side, side, kind: side === 'ally' ? 'char' : 'enemy', elem,
    base: { level: side === 'ally' ? ATK_LVL : FOE_LVL, hp: 1e9, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 1.0 },
    hp: 1e9, maxHp: 1e9, energy: 0, maxEnergy: 120, av: 0, buffs: [], dots: [],
    toughness: 0, maxToughness: 60, broken: false, weaknesses: [], res: {},
  } as unknown as Unit
}

const buff = (u: Unit, stat: string, value: number): Unit => {
  u.buffs.push({ id: 'x', name: 'x', turns: 1, mods: [{ stat, value }] } as unknown as Buff)
  return u
}

const PROFILE: CalcProfile = { atk: 1000, atkPct: 0, attLevel: ATK_LVL, critRate: 0.05, critDmg: 1.0, dmgPct: 0, be: 0, spd: 100 }

export default function calcsContract(): Case[] {
  const out: Case[] = []

  // --- full hit inside the linear zones: noCrit / crit / boost / defShred / broken ---
  {
    const e: CalcEnemy = { level: FOE_LVL, res: 0.2, vuln: 0.3, defShred: 0.5, broken: false }
    const p = { ...PROFILE, dmgPct: 0.24 }
    const b = hitBreakdown(p, e)
    const atk = buff(mkUnit('ally', 'Fire'), 'dmg:Fire', 0.24)
    const tgt = buff(mkUnit('enemy', 'Fire'), 'vulnAll', 0.3)
    tgt.res = { Fire: 0.2 }
    const noCrit = dealDamage({
      attacker: atk, target: tgt, elem: 'Fire', type: 'skill',
      statValue: PROFILE.atk, mult: 1, canCrit: false, defIgnore: e.defShred,
    }, () => 1).dmg
    out.push(t.eq('noCrit what-if == dealDamage (res .2 vuln .3 defShred .5 boost .24)', noCrit, Math.floor(b.noCrit)))
    out.push(t.eq('crit what-if == dealDamage forceCrit',
      dealDamage({
        attacker: atk, target: tgt, elem: 'Fire', type: 'skill',
        statValue: PROFILE.atk, mult: 1, forceCrit: true, defIgnore: e.defShred,
      }, () => 1).dmg,
      Math.floor(b.crit)))
    tgt.broken = true
    out.push(t.eq('broken=true zone: what-if == dealDamage',
      dealDamage({
        attacker: atk, target: tgt, elem: 'Fire', type: 'skill',
        statValue: PROFILE.atk, mult: 1, canCrit: false, defIgnore: e.defShred,
      }, () => 1).dmg,
      Math.floor(hitBreakdown(p, { ...e, broken: true }).noCrit)))
  }

  // --- documented divergences: production caps vs what-if linear, missing stages ---
  {
    const noCritDmg = (a: Unit, tgt: Unit): number => dealDamage({
      attacker: a, target: tgt, elem: 'Fire', type: 'skill',
      statValue: 1000, mult: 1, canCrit: false,
    }, () => 1).dmg
    const whatIf = (res: number, vuln: number): number =>
      hitBreakdown(PROFILE, { level: FOE_LVL, res, vuln, defShred: 0, broken: false }).noCrit
    const res95 = mkUnit('enemy', 'Fire'); res95.res = { Fire: 0.95 }
    out.push(t.ok('RES cap divergence: res .95 -> what-if 1-res < production (capped .9)',
      whatIf(0.95, 0) < noCritDmg(mkUnit('ally', 'Fire'), res95),
      `${whatIf(0.95, 0)} vs ${noCritDmg(mkUnit('ally', 'Fire'), res95)}`))
    const vuln3 = buff(mkUnit('enemy', 'Fire'), 'vulnAll', 3.0)
    out.push(t.ok('vuln cap divergence: vuln 3.0 -> what-if > production (capped +2.5)',
      whatIf(0, 3.0) > noCritDmg(mkUnit('ally', 'Fire'), vuln3),
      `${whatIf(0, 3.0)} vs ${noCritDmg(mkUnit('ally', 'Fire'), vuln3)}`))
    const noTough = mkUnit('enemy', 'Fire'); noTough.maxToughness = 0
    const neutral = Math.floor(whatIf(0, 0))
    out.push(t.ok('broken=false & maxToughness=0 divergence: what-if 0.9 vs production 1.0',
      neutral < noCritDmg(mkUnit('ally', 'Fire'), noTough),
      `${neutral} vs ${noCritDmg(mkUnit('ally', 'Fire'), noTough)}`))
    const weakened = buff(mkUnit('ally', 'Fire'), 'weaken', 0.4)
    out.push(t.ok('what-if has no weaken stage (production scales down)',
      neutral > noCritDmg(weakened, mkUnit('enemy', 'Fire')),
      `${neutral} vs ${noCritDmg(weakened, mkUnit('enemy', 'Fire'))}`))
  }

  // --- break base: breakDamage (base+BE) == computeBreakDamage on empty buffs, unbroken ---
  {
    const be = 1.5
    const a = buff(mkUnit('ally', 'Physical'), 'be', be)
    const tgt = mkUnit('enemy', 'Physical')
    tgt.broken = false
    const defM = 1000 / (200 + 10 * FOE_LVL + 1000)
    out.push(t.eq('breakDamage (base+BE) == computeBreakDamage (defM · broken 0.9 outside)',
      computeBreakDamage({ attacker: a, target: tgt, elem: 'Physical', kind: 'break' }),
      Math.floor(breakDamage('Physical', ATK_LVL, 60, be) * defM * 0.9)))
  }

  // --- super break: what-if == BreakResolver.superBreak on a live sim (empty buffs, no gear) ---
  {
    const sim = runBattle({
      cycles: 1, seed: 7, log: { debug: 0 },
      team: [{ kitId: 'sparxie', stats: { atk: 1000, critRate: 0.05, critDmg: 1.0, spd: 100 } }],
      enemy: mob({ hp: 9e9 }),
    })
    const a = sim.roster.find(u => u.side === 'ally')!
    const tgt = sim.roster.find(u => u.side === 'enemy')!
    const elem = a.elem
    a.buffs.splice(0, a.buffs.length, { id: 'be', name: 'be', turns: 99, mods: [{ stat: 'be', value: 0.5 }] } as unknown as Buff)
    tgt.buffs.splice(0, tgt.buffs.length)
    tgt.res = { [elem]: 0.2 } as Unit['res']
    const tough = 10, abil = 0.5
    const hpBefore = tgt.hp
    sim.breaks.superBreak(a, tgt, tough, abil)
    const produced = hpBefore - tgt.hp
    const p: CalcProfile = { ...PROFILE, attLevel: a.base.level, be: 0.5 }
    const e: CalcEnemy = { level: tgt.base.level, res: 0.2, vuln: 0, defShred: 0, broken: false }
    out.push(t.eq('superBreakHit == BreakResolver.superBreak (empty buffs, no gear)',
      produced, superBreakHit(p, e, tough, abil)))
    out.push(t.eq('stdMultipliers zone: == rawDefMult · (1−res) · 1 · 1',
      stdMultipliers(a, tgt, elem, 'break'),
      (1000 / (200 + 10 * tgt.base.level + 1000)) * 0.8))
  }

  return out
}
