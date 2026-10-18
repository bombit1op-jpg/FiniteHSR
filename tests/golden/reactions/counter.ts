import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * Clara's counter is a reaction, not a scheduled turn: it fires immediately after the enemy hit
 * lands on her and injects an off-turn follow-up. The family rule pinned here: the counter is a
 * `fua` damage event labelled `Svarog Counter`, and it appears only AFTER Clara has taken a hit —
 * i.e. the trigger is the incoming hit, not her own action order.
 */
export default () => {
  const c = run({ team: [{ kitId: 'clara' }], enemy: mob({ name: 'Boss', hp: 500000, spd: 140, atk: 900 }), cycles: 4 })
  const fua = all(c, 'DAMAGE_DEALT').filter(n => n.attackType === 'fua' && n.source === 'Clara')
  const enemyStart = all(c, 'ACTION_START').filter(n => n.source === 'Boss')
  const enemyEnd = all(c, 'ACTION_END').filter(n => n.source === 'Boss')
  const firstCounter = fua.length ? c.nodes.indexOf(fua[0]!) : -1
  const startIdx = enemyStart.length ? c.nodes.indexOf(enemyStart[0]!) : -1
  const endIdx = enemyEnd.length ? c.nodes.indexOf(enemyEnd[0]!) : -1
  return [
    chk('counter fires as follow-up damage', c, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Clara', attackType: 'fua' } }),
    raw('counter labelled Svarog Counter', fua.length > 0 && fua.every(n => n.payload.label === 'Svarog Counter'),
      fua.map(n => String(n.payload.label)).join(',')),
    raw('counter fires off-turn, inside the enemy action window', startIdx >= 0 && firstCounter > startIdx && firstCounter < endIdx,
      `enemy#${startIdx}..${endIdx} counter#${firstCounter}`),
    raw('counter repeats across enemy attacks', fua.length >= 2, `fua=${fua.length}`),
  ]
}
