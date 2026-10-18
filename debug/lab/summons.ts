/**
 * §45 lab — summons / memosprites.
 * Isolates the memosprite CRIT mirror (§11): a memosprite crits with its Memomaster's CURRENT
 * CRIT (live lookup, no snapshot), its own buffs add once on top, and a true summon (or a
 * summon-owned chain) is not followed — the recursion stop is `kind === 'char'`.
 */
import { mirrorOwnerCrit } from '../../src/core/kit'
import { eff } from '../../src/core/combat/StatResolver'
import { eq, isEntry, mkUnit, report, type LabCase } from './harness'

export function summonsLab(): LabCase[] {
  const owner = mkUnit({
    id: 'own', name: 'Own', kind: 'char',
    base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
  })
  const memo = mkUnit({ id: 'memo', name: 'Memo', kind: 'summon', base: { level: 80, hp: 500, atk: 800, def: 200, spd: 60 } })
  mirrorOwnerCrit(owner, memo)
  const before = { cr: eff(memo).critRate, cd: eff(memo).critDmg }

  owner.buffs.push({ id: 'own_cr', name: 'Owner CR', turns: 2, mods: [{ stat: 'critRate', value: 0.3 }] })
  const afterGain = eff(memo).critRate

  owner.buffs = []
  const afterDrop = eff(memo).critRate

  memo.buffs.push({ id: 'memo_cd', name: 'Memo CD', turns: 2, mods: [{ stat: 'critDmg', value: 0.4 }] })
  const ownCd = eff(memo).critDmg
  memo.buffs.push({ id: 'memo_cr', name: 'Memo CR', turns: 2, mods: [{ stat: 'critRate', value: 0.2 }] })
  const ownCr = eff(memo).critRate

  const pet = mkUnit({ id: 'pet', name: 'Pet', kind: 'summon', sharesOwnerBuffs: true, base: { level: 80, hp: 500, atk: 800, def: 200, spd: 60, critRate: 0.05, critDmg: 0.5 } })
  const petBase = eff(pet).critRate
  pet.critOwner = memo
  const petOwned = eff(pet).critRate

  return [
    eq('memo critRate mirrors owner (live)', before.cr, 0.05, 1e-9),
    eq('memo critDmg mirrors owner (live)', before.cd, 0.5, 1e-9),
    eq('owner CRIT buff gained after summon is followed', afterGain, 0.35, 1e-9),
    eq('owner buff expiry drops from the memo (no stale snapshot)', afterDrop, 0.05, 1e-9),
    eq('memo own critDmg buff counted once', ownCd, 0.9, 1e-9),
    eq('memo own critRate adds on top once', ownCr, 0.25, 1e-9),
    eq('true summon keeps its own base crit', petBase, 0.05, 1e-9),
    eq('summon-owned critOwner is NOT followed (recursion stop)', petOwned, 0.05, 1e-9)
  ]
}

if (isEntry('summons.ts')) process.exitCode = report('Summons / memosprite lab', summonsLab())
