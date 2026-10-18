import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * A countdown is a first-class timer entity, not a buff duration. Firefly's Complete Combustion
 * spawns a `kind: 'timer'` unit; when its AV reaches the top the engine calls the kit's onCcEnd,
 * the state is removed and the timer despawns. The family rule: the state's lifetime is owned by
 * the timer's timeline presence, and it is gone once the timer has fired.
 */
export default () => {
  const c = run({ team: [{ kitId: 'firefly', energyStartFrac: 1 }], enemy: mob({ hp: 400000 }), cycles: 4 })
  const created = all(c, 'SUMMON_CREATED').filter(n => n.payload.kind === 'timer')
  const gone = all(c, 'SUMMON_DESPAWNED').filter(n => n.target === 'CC Countdown')
  const cIdx = created.length ? c.nodes.indexOf(created[0]!) : -1
  const gIdx = gone.length ? c.nodes.indexOf(gone[0]!) : -1
  const ff = c.sim.roster.find(u => u.kitId === 'firefly')!
  return [
    raw('countdown spawns as a timer entity', created.length > 0, created.map(n => String(n.target)).join(',')),
    raw('timer attributed to the skill owner', created.length > 0 && created.every(n => n.source === 'Firefly'),
      created.map(n => String(n.source)).join(',')),
    chk('Complete Combustion state applied', c, { assert: 'buff', id: 'cc_state' }),
    raw('timer fires then despawns', gone.length > 0 && cIdx >= 0 && cIdx < gIdx, `created#${cIdx} despawn#${gIdx}`),
    raw('state is gone once the countdown resolves', !c.sim.hasBuff(ff, 'cc_state')),
  ]
}
