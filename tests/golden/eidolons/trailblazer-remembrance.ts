import { run, raw, all, mob } from '../../_helpers/battle'

export default () => {
  const tbr = {
    kitId: 'trailblazer_remembrance',
    name: 'TBR',
    stats: { hp: 6000, atk: 2000, def: 1300, spd: 130 },
    energyStartFrac: 1,
    skillPriority: 2,
  }
  const enemy = mob({ name: 'Frost', count: 1, hp: 600000, atk: 600, spd: 120, level: 85, toughness: 120, weaknesses: ['Ice', 'Lightning'] })
  const base = run({ team: [{ ...tbr, eidolon: 1 }], enemy, cycles: 8, seed: 3 })
  const owner = base.sim.roster.find(u => u.name === 'TBR')!
  const mem = base.sim.roster.find(u => u.name === 'Mem')!
  const extra = all(base, 'EXTRA_TURN').filter(n => n.target === 'Mem').length

  const e1 = run({
    team: [
      { ...tbr, eidolon: 1 },
      { kitId: 'aglaea', name: 'Aglaea', stats: { hp: 6000, atk: 4000, def: 1300, spd: 140 }, skillPriority: 1 },
    ],
    enemy,
    cycles: 8,
    seed: 3,
  })
  const garmentBuffs = new Set(e1.buffLog.filter(b => b.unitName === 'Garmentmaker').map(b => b.id))

  const lord = run({
    team: [
      { ...tbr, eidolon: 1 },
      { kitId: 'jingyuan', name: 'Jing Yuan', stats: { hp: 6000, atk: 4000, def: 1300, spd: 130 }, skillPriority: 1 },
    ],
    enemy,
    cycles: 8,
    seed: 3,
  })
  const lordTrue = lord.logLines.some((line, i) =>
    line.includes('Lightning-Lord →') &&
    lord.logLines[i + 1]?.includes('Jing Yuan →') &&
    lord.logLines[i + 1]?.includes('[True DMG]'))

  const specialEnergy = { kitId: 'acheron', name: 'Acheron', stats: { hp: 6000, atk: 4000, def: 1300, spd: 120 }, skillPriority: 1 }
  const e4 = run({ team: [{ ...tbr, eidolon: 4 }, specialEnergy], enemy, cycles: 8, seed: 3 })
  const e0 = run({ team: [{ ...tbr, eidolon: 0 }, specialEnergy], enemy, cycles: 8, seed: 3 })
  const e4Logs = (c: typeof e4): number => c.logLines.filter(l => l.includes('E4: Mem +3% Charge')).length

  return [
    raw('Mem mirrors owner CRIT live', mem.critOwner === owner),
    raw('100% Charge grants Mem an Extra Turn', extra > 0, `${extra} extra turn(s)`),
    raw('Mem uses Lemme! Help You! at full Charge', base.logLines.some(l => l.includes('uses Lemme! Help You!'))),
    raw('Mem uses Baddies! Trouble! below full Charge', base.logLines.some(l => l.includes('uses Baddies! Trouble!'))),
    raw('E1 propagates Mem support to memosprite', garmentBuffs.has('tb_rem_support') && garmentBuffs.has('tb_rem_e1'), [...garmentBuffs].join(', ')),
    raw('Lightning-Lord procs owner Mem support as True DMG', lordTrue),
    raw('E4 charges Mem after 0-Energy-target action', e4Logs(e4) > 0, `${e4Logs(e4)} trigger(s)`),
    raw('E4 locked below rank 4', e4Logs(e0) === 0, `${e4Logs(e0)} trigger(s)`),
  ]
}
