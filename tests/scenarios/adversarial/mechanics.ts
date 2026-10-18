import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * Adversarial scenarios (guide §20.x verification levels → "Adversarial verified").
 *
 * The golden/<family> fixtures pin each mechanic's *happy-path family rule*. These run the same
 * five non-standard families to completion — through break, death, wave boundaries and teardown —
 * and assert the cross-cutting laws that only bite under stress: identity is id-stable, an entity
 * owns exactly one damage account, a reaction never lands on a dead target, a reaction never
 * retriggers itself, and a spawned entity leaves no orphan behind.
 *
 * Family rules exercised: transformations, follow-up attacks, counters, summons, countdowns.
 */
export default () => {
  // ── transform: the transformed entity owns the order and the damage account; the owner is parked ──
  const tr = run({
    team: [{ kitId: 'phainon', skillPriority: 1, stats: { spd: 160 } }],
    enemy: mob({ hp: 6_000_000, spd: 90 }),
    cycles: 8,
  })
  const owner = tr.sim.roster.find(u => u.kitId === 'phainon')!
  const kh = tr.sim.roster.find(u => u.kind === 'transformed')
  const khStarts = tr.nodes
    .map((n, i) => ({ n, i }))
    .filter(x => x.n.type === 'ACTION_START' && x.n.source === 'Khaslana')
    .map(x => x.i)
  const ownerStartsWhileTransformed = tr.nodes
    .map((n, i) => ({ n, i }))
    .filter(x => x.n.type === 'ACTION_START' && x.n.source === owner.name
      && khStarts.length > 0 && x.i > khStarts[0]! && x.i < khStarts[khStarts.length - 1]!)
    .length
  const transformAccounts = [...tr.sim.ownerDamage.keys()]

  // ── follow-up: break-gated FUA across a wave boundary with real deaths ──
  const fu = run({
    team: [{ kitId: 'himeko', skillPriority: 1 }, { kitId: 'natasha' }],
    enemy: mob({ name: 'Elite Puppet', hp: 12_000 }),
    enemyWaves: [[mob({ name: 'Elite Puppet', hp: 12_000 })], [mob({ name: 'Elite Puppet', hp: 12_000 })]],
    cycles: 6,
  })
  const fua = all(fu, 'DAMAGE_DEALT').filter(n => n.attackType === 'fua')
  const firstBreak = all(fu, 'WEAKNESS_BREAK').length ? fu.nodes.indexOf(all(fu, 'WEAKNESS_BREAK')[0]!) : -1
  const firstFua = fua.length ? fu.nodes.indexOf(fua[0]!) : -1
  const deadAt = new Map<string, number>()
  fu.nodes.forEach((n, i) => { if (n.type === 'DEATH' && n.payload.targetId) deadAt.set(String(n.payload.targetId), i) })
  const landedOnDead = fu.nodes.filter((n, i) => n.type === 'DAMAGE_DEALT' && n.payload.targetId
    && deadAt.has(String(n.payload.targetId)) && i > deadAt.get(String(n.payload.targetId))!).length

  // ── counter: triggered by the incoming hit, one per enemy action, never self-retriggering ──
  const co = run({
    team: [{ kitId: 'clara', stats: { hp: 9000, def: 1500 } }],
    enemy: mob({ name: 'Boss', hp: 500_000, spd: 140, atk: 900 }),
    cycles: 6,
  })
  const counters = all(co, 'DAMAGE_DEALT').filter(n => n.attackType === 'fua' && n.source === 'Clara')
  const enemyActions = all(co, 'ACTION_START').filter(n => n.source === 'Boss')
  const firstCounter = counters.length ? co.nodes.indexOf(counters[0]!) : -1
  const firstEnemyAction = enemyActions.length ? co.nodes.indexOf(enemyActions[0]!) : -1

  // ── summon: owned by its owner, one damage account, balanced create/despawn lifecycle ──
  const su = run({ team: [{ kitId: 'aglaea', energyStartFrac: 0.95 }], enemy: mob({ hp: 500_000 }), cycles: 6 })
  const suOwner = su.sim.roster.find(u => u.kitId === 'aglaea')!
  const summonsCreated = all(su, 'SUMMON_CREATED').filter(n => n.payload.kind === 'summon')
  const summonsGone = all(su, 'SUMMON_DESPAWNED').filter(n => n.payload.kind === 'summon')
  const summonsAlive = su.sim.roster.filter(u => u.kind === 'summon')
  const summonAccounts = [...su.sim.ownerDamage.keys()]

  // ── countdown: a timer entity, owned, fires then despawns with its state, no orphan left ──
  const cd = run({ team: [{ kitId: 'firefly', energyStartFrac: 1 }], enemy: mob({ hp: 400_000 }), cycles: 6 })
  const cdOwner = cd.sim.roster.find(u => u.kitId === 'firefly')!
  const timersCreated = all(cd, 'SUMMON_CREATED').filter(n => n.payload.kind === 'timer')
  const timersGone = all(cd, 'SUMMON_DESPAWNED').filter(n => n.target === 'CC Countdown')
  const timersAlive = cd.sim.roster.filter(u => u.kind === 'timer')
  const tSpawn = timersCreated.length ? cd.nodes.indexOf(timersCreated[0]!) : -1
  const tDespawn = timersGone.length ? cd.nodes.indexOf(timersGone[0]!) : -1

  const clean = (c: ReturnType<typeof run>) => c.sim.logger.errors.length === 0

  return [
    // transform
    chk('transform entity registered', tr, { assert: 'present', of: { type: 'SUMMON_CREATED', payload: { kind: 'transformed' } } }),
    raw('transformed entity is distinct from its owner', !!kh && kh.id !== owner.id, `kh=${kh?.id ?? '-'} owner=${owner.id}`),
    raw('owner is parked while the transform owns the order', khStarts.length > 0 && ownerStartsWhileTransformed === 0,
      `khStarts=${khStarts.length} ownerBetween=${ownerStartsWhileTransformed}`),
    raw('transform damage joins the owner account, not a second one', transformAccounts.length === 1 && transformAccounts[0] === owner.id,
      transformAccounts.join(',')),

    // follow-up
    chk('break triggers a follow-up', fu, { assert: 'present', of: { type: 'DAMAGE_DEALT', attackType: 'fua' } }),
    raw('follow-up is break-gated', firstBreak >= 0 && firstFua > firstBreak, `break#${firstBreak} fua#${firstFua}`),
    raw('follow-up never lands on an already-dead target', landedOnDead === 0, `violations=${landedOnDead}`),
    raw('follow-up labels are explicit', fua.every(n => typeof n.payload.label === 'string' && n.payload.label.length > 0),
      fua.map(n => String(n.payload.label)).join(',')),

    // counter
    chk('counter fires as follow-up damage', co, { assert: 'present', of: { type: 'DAMAGE_DEALT', source: 'Clara', attackType: 'fua' } }),
    raw('counter is triggered by the incoming hit, not its own order', firstCounter > firstEnemyAction && firstEnemyAction >= 0,
      `enemy#${firstEnemyAction} counter#${firstCounter}`),
    raw('counter does not recursively retrigger itself', counters.length <= enemyActions.length,
      `counters=${counters.length} enemyActions=${enemyActions.length}`),
    raw('counter is labelled', counters.every(n => n.payload.label === 'Svarog Counter'), counters.map(n => String(n.payload.label)).join(',')),

    // summon
    chk('summon created', su, { assert: 'present', of: { type: 'SUMMON_CREATED', payload: { kind: 'summon' } } }),
    raw('summon is owned by its owner', summonsAlive.length > 0 && summonsAlive.every(u => su.sim.rt(u).ownerId === suOwner.id),
      summonsAlive.map(u => `${u.id}=>${String(su.sim.rt(u).ownerId)}`).join(',')),
    raw('summon lifecycle is balanced (created = alive + despawned)', summonsCreated.length === summonsAlive.length + summonsGone.length,
      `created=${summonsCreated.length} alive=${summonsAlive.length} despawned=${summonsGone.length}`),
    raw('summon damage joins the owner account, not a summon account', summonAccounts.length === 1 && summonAccounts[0] === suOwner.id,
      summonAccounts.join(',')),

    // countdown
    chk('countdown registered as a timer entity', cd, { assert: 'present', of: { type: 'SUMMON_CREATED', payload: { kind: 'timer' } } }),
    raw('timer is attributed to its owner', timersCreated.length > 0 && timersCreated.every(n => n.payload.ownerId === cdOwner.id),
      timersCreated.map(n => String(n.payload.ownerId)).join(',')),
    raw('timer fires then despawns', tDespawn >= 0 && tSpawn >= 0 && tSpawn < tDespawn, `spawn#${tSpawn} despawn#${tDespawn}`),
    raw('no orphan timer left on the roster', timersAlive.length === 0 && timersCreated.length === timersGone.length,
      `alive=${timersAlive.length} created=${timersCreated.length} gone=${timersGone.length}`),
    raw('attached state is gone once the countdown resolves', !cd.sim.hasBuff(cdOwner, 'cc_state')),

    // hygiene
    raw('transform run emitted no logger errors', clean(tr), tr.sim.logger.errors.join('; ')),
    raw('follow-up run emitted no logger errors', clean(fu), fu.sim.logger.errors.join('; ')),
    raw('counter run emitted no logger errors', clean(co), co.sim.logger.errors.join('; ')),
    raw('summon run emitted no logger errors', clean(su), su.sim.logger.errors.join('; ')),
    raw('countdown run emitted no logger errors', clean(cd), cd.sim.logger.errors.join('; ')),
  ]
}
