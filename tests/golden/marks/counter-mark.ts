import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * A mark is a debuff placed by one unit on another and read back by later mechanics — here
 * Clara's Talent stamps `Mark of Counter` on whoever hits her, and her Skill pays it out. The
 * family rule: the mark lives on the target as a state object with a source, so it can be
 * re-read (and refreshed) by whoever owns the marking rule.
 */
export default () => {
  const c = run({ team: [{ kitId: 'clara' }], enemy: mob({ name: 'Boss', hp: 500000, spd: 140, atk: 900 }), cycles: 4 })
  const applied = all(c, 'BUFF_APPLIED').filter(n => n.target === 'Boss' && n.payload.id === 'clara_mark')
  const refreshed = all(c, 'BUFF_REFRESHED').filter(n => n.target === 'Boss' && n.payload.id === 'clara_mark')
  const log = c.buffLog.filter(e => e.id === 'clara_mark')
  return [
    chk('mark applied to the attacker', c, { assert: 'present', of: { type: 'BUFF_APPLIED', target: 'Boss', payload: { id: 'clara_mark' } } }),
    raw('mark is a named state with a permanent duration', applied.length > 0 && applied.every(n => n.payload.name === 'Mark of Counter' && n.payload.turns === 999),
      applied.map(n => `${n.payload.name}/${n.payload.turns}`).join(',')),
    raw('mark re-arms when the enemy strikes again', refreshed.length > 0, `refreshed=${refreshed.length}`),
    raw('mark is tracked on the target', log.length > 0 && log.every(e => e.unitName === 'Boss'), log.map(e => e.unitName).join(',')),
  ]
}
