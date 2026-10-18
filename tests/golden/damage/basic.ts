import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook' }], enemy: undefined, cycles: 4 })
  const enemy = c.sim.roster.find(u => u.side === 'enemy')!
  const dmgs = all(c, 'DAMAGE_DEALT')
  return [
    chk('damage event emitted', c, { assert: 'present', of: { type: 'DAMAGE_DEALT' } }),
    chk('damage amount > 0', c, { assert: 'payloadAtLeast', of: { type: 'DAMAGE_DEALT' }, field: 'amount', value: 1 }),
    raw('every amount finite positive', dmgs.length > 0 && dmgs.every(n => Number.isFinite(numOf(n.payload.amount)) && numOf(n.payload.amount) > 0),
      `n=${dmgs.length}`),
    raw('enemy lost HP', enemy.hp < enemy.maxHp, `${enemy.hp}/${enemy.maxHp}`),
    chk('hpAfter recorded on hits', c, { assert: 'payloadAtLeast', of: { type: 'DAMAGE_DEALT' }, field: 'hpAfter', value: 0 }),
  ]
}

const numOf = (v: unknown): number => (typeof v === 'number' ? v : NaN)
