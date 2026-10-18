import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook' }] })
  const tough = all(c, 'TOUGHNESS_DAMAGE')
  const brk = all(c, 'WEAKNESS_BREAK')
  const bdmg = all(c, 'BREAK_DAMAGE')
  return [
    chk('toughness damage recorded', c, { assert: 'present', of: { type: 'TOUGHNESS_DAMAGE' } }),
    chk('weakness breaks', c, { assert: 'present', of: { type: 'WEAKNESS_BREAK' } }),
    chk('break damage recorded', c, { assert: 'present', of: { type: 'BREAK_DAMAGE' } }),
    chk('toughness before break', c, {
      assert: 'ordering',
      before: [{ type: 'TOUGHNESS_DAMAGE' }],
      after: [{ type: 'WEAKNESS_BREAK' }],
    }),
    raw('one break at most per toughness event', brk.length <= tough.length, `${brk.length}/${tough.length}`),
    raw('break zeroes the bar', brk.every(n => num(n.payload.toughness) === 0)),
    raw('break damage non-negative', bdmg.every(n => num(n.payload.amount) >= 0)),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
