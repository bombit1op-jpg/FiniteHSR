import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', skillPriority: 1 }], enemy: { name: 'Ice Edge', count: 1, hp: 4_000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] } })
  const deaths = all(c, 'DEATH')
  const enemyNames = c.sim.roster.filter(u => u.side === 'enemy').map(u => u.name)
  const dead = c.sim.roster.filter(u => u.side === 'enemy' && u.hp <= 0)
  const acts = all(c, 'ACTION_START')
  const ghostTurns = dead.flatMap(d => acts.filter((a, i) => a.source === d.name && deaths.some(x => i > c.nodes.indexOf(x) && x.target === d.name)))
  return [
    chk('enemy dies', c, { assert: 'present', of: { type: 'DEATH' } }),
    raw('killer attributed', deaths.every(n => typeof n.source === 'string' && n.source.length > 0),
      deaths.map(n => String(n.source)).join(',')),
    raw('victim hp at zero', dead.length > 0, dead.map(u => `${u.name}=${u.hp}`).join(',')),
    raw('dead unit takes no further turns', ghostTurns.length === 0, `ghost=${ghostTurns.length}`),
    raw('death targets an enemy', deaths.every(n => n.target !== undefined && enemyNames.includes(n.target))),
  ]
}
