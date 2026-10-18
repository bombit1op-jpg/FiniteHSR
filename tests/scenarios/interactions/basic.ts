import { chk, run, raw, all, mob } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'natasha', skillPriority: 1 }, { kitId: 'hook' }], enemy: mob({ count: 2 }) })
  const heals = all(c, 'HEAL_APPLIED')
  return [
    chk('damage system ran', c, { assert: 'present', of: { type: 'DAMAGE_DEALT' } }),
    chk('healing system ran', c, { assert: 'present', of: { type: 'HEAL_APPLIED' } }),
    raw('heal amount positive', heals.some(n => n.payload.amount !== undefined && Number(n.payload.amount) >= 0),
      heals.map(n => String(n.payload.amount)).join(',')),
    raw('both allies fought', all(c, 'ACTION_START').some(n => n.source === c.sim.roster[0]!.name)
      && all(c, 'ACTION_START').some(n => n.source === c.sim.roster[1]!.name)),
    raw('no logger errors', c.sim.logger.errors.length === 0, c.sim.logger.errors.join('; ')),
  ]
}
