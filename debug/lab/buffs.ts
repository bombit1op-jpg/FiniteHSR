/**
 * §45 lab — state / buff lifecycle.
 * Isolates effects/BuffSystem: the one apply path (add → APPLIED/STACKED/REFRESHED), the one
 * countdown path (expire), stack capping, tickOnSource exemption, and the stat aggregation
 * (buffSum) + debuff classification (isDebuff) + runtime-bag stringification (runtimeString).
 */
import { buffSum, isDebuff, runtimeString } from '../../src/core/combat/StatResolver'
import { Simulator } from '../../src/core/simulator'
import { eq, isEntry, mkUnit, mod, ok, report, type LabCase } from './harness'

export function buffsLab(): LabCase[] {
  const sim = new Simulator({ cycles: 1, seed: 1 })
  const u = mkUnit({ name: 'U' })
  sim.roster.push(u)

  // fresh apply
  sim.addBuff(u, { id: 'fresh', name: 'Fresh', mods: [], turns: 2 })
  const fresh = u.buffs.find(b => b.id === 'fresh')

  // stack cap 3
  for (let i = 0; i < 4; i++) sim.addBuff(u, { id: 'st', name: 'ST', mods: [], turns: 1, maxStacks: 3 })
  const st = u.buffs.find(b => b.id === 'st')

  // refresh (same id, no cap → turns replaced, not a second record)
  const u2 = mkUnit({ name: 'U2' })
  sim.roster.push(u2)
  sim.addBuff(u2, { id: 'rf', name: 'RF', mods: [], turns: 2 })
  sim.addBuff(u2, { id: 'rf', name: 'RF', mods: [], turns: 4 })
  const rfCount = u2.buffs.filter(b => b.id === 'rf').length

  // expire: 2 turns → 1 → gone
  const u3 = mkUnit({ name: 'U3' })
  sim.roster.push(u3)
  sim.addBuff(u3, { id: 'ex', name: 'EX', mods: [], turns: 2 })
  const tick1 = sim.expireBuffs(u3)
  const exLive = u3.buffs.find(b => b.id === 'ex')?.turns
  sim.expireBuffs(u3)

  // tickOnSource exempt from the owner's countdown
  const u4 = mkUnit({ name: 'U4' })
  sim.roster.push(u4)
  sim.addBuff(u4, { id: 'tos', name: 'TOS', mods: [], turns: 1, tickOnSource: true })
  const tosTicked = sim.expireBuffs(u4)

  return [
    eq('fresh apply installs one record', u.buffs.filter(b => b.id === 'fresh').length, 1),
    ok('fresh record carries no stacks field', fresh?.stacks === undefined),
    eq('stack cap: 3', st?.stacks, 3),
    eq('refresh replaces turns, not records', rfCount * 10 + (u2.buffs.find(b => b.id === 'rf')?.turns ?? 0), 14),
    eq('expire ticks once (2→1)', tick1, 1),
    eq('record survives at 1 turn', exLive, 1),
    ok('record removed at 0 turns', u3.buffs.find(b => b.id === 'ex') === undefined),
    eq('tickOnSource skipped by owner countdown', tosTicked, 0),
    ok('tickOnSource record still present', u4.buffs.find(b => b.id === 'tos') !== undefined),
    ok('isDebuff: negative mod', isDebuff(mod('critRate', -0.1))),
    ok('isDebuff: defRed mod', isDebuff({ id: 'd', name: 'd', turns: 1, mods: [{ stat: 'defRed', value: 0.2 }] })),
    ok('isDebuff: explicit debuff flag', isDebuff({ id: 'd', name: 'd', turns: 1, mods: [], debuff: true })),
    ok('isDebuff: positive dmgAll is a buff', !isDebuff(mod('dmgAll', 0.1))),
    eq('buffSum multiplies by stacks', buffSum([{ ...mod('dmgAll', 0.1), stacks: 3 }], 'dmgAll'), 0.3, 1e-9),
    ok('runtimeString skips bookkeeping keys', runtimeString({ levels: 1, turnIndex: 2, foo: 3 }) === 'foo=3')
  ]
}

if (isEntry('buffs.ts')) process.exitCode = report('State / buff lifecycle lab', buffsLab())
