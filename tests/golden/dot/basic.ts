import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', skillPriority: 1 }] })
  const applied = all(c, 'DOT_APPLIED')
  const ticks = all(c, 'DOT_TICK')
  const enemyNames = new Set(c.sim.roster.filter(u => u.side === 'enemy').map(u => u.name))
  return [
    chk('burn applied', c, { assert: 'present', of: { type: 'DOT_APPLIED' } }),
    chk('burn ticks', c, { assert: 'present', of: { type: 'DOT_TICK' } }),
    chk('applied before ticked', c, {
      assert: 'ordering',
      before: [{ type: 'DOT_APPLIED' }],
      after: [{ type: 'DOT_TICK' }],
    }),
    raw('dot lands on enemies', applied.length > 0 && applied.every(n => n.target !== undefined && enemyNames.has(n.target)),
      applied.map(n => String(n.target)).join(',')),
    raw('tick damage positive', ticks.every(n => num(n.payload.amount) > 0),
      ticks.map(n => String(n.payload.amount)).join(',')),
    raw('ticks carry hpAfter', ticks.every(n => num(n.payload.hpAfter) >= 0)),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
