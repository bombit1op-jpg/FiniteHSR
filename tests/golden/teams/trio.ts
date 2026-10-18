import { run, raw, name, all } from '../../_helpers/battle'
import { buffSum } from '../../../src/core/combat/StatResolver'

/**
 * 3-kit team interaction (guide §16 / Phase-B item 16): two independent supporters (Ruan Mei,
 * Bronya) both reach the same carry and their contributions stack on it. Total damage is a poor
 * metric here (adding a supporter dilutes the carry's action count in a fixed cycle budget), so we
 * assert on the carry's live state: which supporters' buffs land, and that their DMG% sums.
 */
export default () => {
  const duo = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'hook' }] })
  const trio = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'bronya', skillPriority: 2 }, { kitId: 'hook' }] })

  const hook = name(trio, 'hook')
  const ids = all(trio, 'BUFF_APPLIED').filter(n => n.target === hook).map(n => String(n.payload.id))
  const dmgAll = (c: typeof trio): number => buffSum(c.sim.roster.find(u => u.name === hook)!.buffs, 'dmgAll')

  return [
    raw('three allies present', trio.sim.roster.filter(u => u.side === 'ally').length === 3),
    raw('Ruan Mei buffs the carry', ids.some(i => i.startsWith('rm_')), ids.filter(i => i.startsWith('rm_')).join(',')),
    raw('Bronya buffs the carry', ids.some(i => i.startsWith('bronya_')), ids.filter(i => i.startsWith('bronya_')).join(',')),
    raw('Ruan Mei field reaches the carry', ids.includes('rm_field')),
    raw('two supporters stack DMG% on the carry', dmgAll(trio) > dmgAll(duo), `${dmgAll(trio)} vs ${dmgAll(duo)}`),
    raw('Bronya takes an extra action for the team', all(trio, 'ACTION_ADVANCE').length >= 1, `n=${all(trio, 'ACTION_ADVANCE').length}`),
  ]
}
