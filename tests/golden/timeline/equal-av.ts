import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', stats: { spd: 100 } }, { kitId: 'qingque', stats: { spd: 100 } }] })
  const allyNames = new Set(c.sim.roster.filter(u => u.side === 'ally').map(u => u.name))
  const allyActs = all(c, 'ACTION_START').filter(n => n.source !== undefined && allyNames.has(n.source))
  const turns = allyActs.map(n => n.turn)
  const events = c.nodes.map(n => n.eventId)
  const names = [...allyNames]
  const firstTwo = allyActs.slice(0, 2).map(n => n.source)
  return [
    chk('actions start', c, { assert: 'present', of: { type: 'ACTION_START' } }),
    raw('turn numbers never decrease', allyActs.every((_, i) => i === 0 || turns[i]! >= turns[i - 1]!), turns.join(',')),
    raw('eventIds strictly increase', events.every((e, i) => i === 0 || e > events[i - 1]!)),
    raw('equal-SPD allies act in team slot order', firstTwo[0] === names[0] && firstTwo[1] === names[1], `${firstTwo} vs ${names}`),
    raw('every ally action logged', allyActs.length > 0, `acts=${allyActs.length}`),
  ]
}
