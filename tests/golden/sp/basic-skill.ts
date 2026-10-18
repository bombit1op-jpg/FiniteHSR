import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', skillPriority: 1 }, { kitId: 'pela', skillPriority: 1 }] })
  const losses = all(c, 'SP_LOSS')
  const gains = all(c, 'SP_GAIN')
  return [
    chk('skill spends SP', c, { assert: 'present', of: { type: 'SP_LOSS' } }),
    raw('skill costs exactly 1 SP', losses.every(n => num(n.payload.n) === 1),
      losses.map(n => String(n.payload.n)).join(',')),
    raw('pool never negative', [...losses, ...gains].every(n => num(n.payload.total) >= 0),
      [...losses, ...gains].map(n => String(n.payload.total)).join(',')),
    chk('basic generates SP back', c, { assert: 'present', of: { type: 'SP_GAIN' } }),
    raw('final pool within limits', c.sim.sp() >= 0 && c.sim.sp() <= 5, `sp=${c.sim.sp()}`),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
