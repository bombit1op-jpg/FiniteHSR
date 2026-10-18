import { chk, run, raw, all, mob } from '../../_helpers/battle'

/**
 * A transformation is not a buff on the character: Phainon's Ultimate registers a separate
 * `kind: 'transformed'` entity (Khaslana) that owns its own actions and mirrors the owner's
 * live ATK/CRIT, while the original is off the action order. The family rule: the transformed
 * entity is distinct from its owner (`ownerId`), it is the one dealing damage, and the owner
 * stops acting once the transformation is up.
 */
export default () => {
  const c = run({
    team: [{ kitId: 'phainon', skillPriority: 1, stats: { spd: 160 } }],
    enemy: mob({ hp: 6000000, spd: 90 }),
    cycles: 8,
  })
  const created = all(c, 'SUMMON_CREATED').filter(n => n.payload.kind === 'transformed')
  const kh = c.sim.roster.find(u => u.kind === 'transformed')
  const khDmg = all(c, 'DAMAGE_DEALT').filter(n => n.source === 'Khaslana')
  const lastOwnerAct = c.nodes.filter(n => n.type === 'ABILITY_USED' && n.source === 'Phainon')
    .map(n => c.nodes.indexOf(n)).pop() ?? -1
  const firstKhDmg = khDmg.length ? c.nodes.indexOf(khDmg[0]!) : -1
  return [
    chk('transformed entity registered', c, { assert: 'present', of: { type: 'SUMMON_CREATED', payload: { kind: 'transformed' } } }),
    raw('transformed entity is distinct from its owner', created.length > 0 && kh !== undefined && c.sim.rt(kh).ownerId !== kh.id,
      `ownerId=${kh ? String(c.sim.rt(kh).ownerId) : '?'}`),
    raw('damage is attributed to the transformed entity', khDmg.length > 0, `hits=${khDmg.length}`),
    raw('owner stops acting once transformed', lastOwnerAct >= 0 && firstKhDmg > lastOwnerAct,
      `lastOwnerAct#${lastOwnerAct} firstKhDmg#${firstKhDmg}`),
  ]
}
