import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'aglaea', energyStartFrac: 0.95 }] })
  const created = all(c, 'SUMMON_CREATED')
  const gone = all(c, 'SUMMON_DESPAWNED')
  const summons = c.sim.roster.filter(u => u.kind === 'summon')
  const cIdx = created.length ? c.nodes.indexOf(created[0]!) : -1
  const gIdx = gone.length ? c.nodes.indexOf(gone[0]!) : -1
  return [
    chk('summon event', c, { assert: 'present', of: { type: 'SUMMON_CREATED' } }),
    raw('summon unit on the roster', summons.length > 0, `summons=${summons.length}`),
    raw('summon has owner + its own AV', summons.every(u => c.sim.rt(u).ownerId !== undefined && Number.isFinite(u.av)),
      summons.map(u => `${u.name} av=${u.av}`).join(' ')),
    raw('despawn after spawn', gIdx < 0 || (cIdx >= 0 && cIdx < gIdx)),
    raw('spawn payload carries side', created.every(n => n.payload.side === 'ally')),
  ]
}
