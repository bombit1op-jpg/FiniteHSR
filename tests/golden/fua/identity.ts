import { chk, run, raw, all, mob } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'himeko' }], enemy: mob({ name: 'Elite Puppet', hp: 40_000 }), cycles: 6 })
  const fua = c.nodes.filter(n => n.type === 'DAMAGE_DEALT' && n.attackType === 'fua')
  const anyDmg = all(c, 'DAMAGE_DEALT')
  const tough = all(c, 'TOUGHNESS_DAMAGE')
  return [
    chk('break trigger fires follow-up', c, { assert: 'present', of: { type: 'DAMAGE_DEALT', attackType: 'fua' } }),
    raw('follow-up happened after toughness damage', tough.length > 0 && fua.length > 0
      && c.nodes.indexOf(tough[0]!) < c.nodes.indexOf(fua[0]!), `tough=${tough.length} fua=${fua.length}`),
    raw('normal hits exist alongside follow-ups', anyDmg.some(n => n.attackType !== 'fua')),
    raw('follow-up labels are explicit', fua.every(n => typeof n.payload.label === 'string' && n.payload.label.length > 0),
      fua.map(n => String(n.payload.label)).join(',')),
  ]
}
