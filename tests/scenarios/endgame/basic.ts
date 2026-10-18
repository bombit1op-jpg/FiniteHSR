import { chk, run, raw, all, mob } from '../../_helpers/battle'

export default () => {
  const c = run({
    team: [{ kitId: 'hook', skillPriority: 1 }, { kitId: 'ruanmei', skillPriority: 1 }],
    enemy: mob({ hp: 6_000 }),
    enemyWaves: [[{ ...mob({ hp: 6_000 }) }], [{ ...mob({ hp: 6_000 }) }]],
    cycles: 6,
  })
  const starts = all(c, 'WAVE_START')
  const ends = all(c, 'WAVE_END')
  const s0 = starts.length ? c.nodes.indexOf(starts[0]!) : -1
  const s1 = starts.length > 1 ? c.nodes.indexOf(starts[1]!) : -1
  const e0 = ends.length ? c.nodes.indexOf(ends[0]!) : -1
  return [
    chk('both waves announced', c, { assert: 'present', of: { type: 'WAVE_START' } }),
    raw('two wave starts', starts.length === 2, `starts=${starts.length}`),
    raw('wave 1 closed before wave 2 opened', s0 >= 0 && e0 >= 0 && e0 < s1, `s0=${s0} e0=${e0} s1=${s1}`),
    chk('battle ends', c, { assert: 'present', of: { type: 'BATTLE_END' } }),
    raw('no logger errors', c.sim.logger.errors.length === 0, c.sim.logger.errors.join('; ')),
    raw('wave 2 enemy actually spawned', c.sim.roster.some(u => u.side === 'enemy' && u.wave === 2), 'wave2 unit'),
  ]
}
