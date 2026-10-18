import { run, raw, name, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'hook' }] })
  const dst = name(c, 'hook')
  const overtone = all(c, 'BUFF_APPLIED').filter(n => String(n.payload.id).startsWith('rm_') && n.target === dst)
  return [
    raw('both allies present', c.sim.roster.filter(u => u.side === 'ally').length === 2),
    raw('buffer buffs the carry', overtone.length > 0, `to=${dst} n=${overtone.length}`),
    raw('overtone lands on the carry', all(c, 'BUFF_APPLIED').some(n => n.payload.id === 'rm_overtone_dmg' && n.target === dst)),
    raw('shared SP pool survives', c.sim.sp() >= 0, `sp=${c.sim.sp()}`),
  ]
}
