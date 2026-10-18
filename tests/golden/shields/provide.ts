import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'march7th', skillPriority: 1 }] })
  const applied = all(c, 'SHIELD_APPLIED')
  const absorbed = all(c, 'SHIELD_ABSORBED')
  const applyIdx = applied.length ? c.nodes.indexOf(applied[0]!) : -1
  const absIdx = absorbed.length ? c.nodes.indexOf(absorbed[0]!) : -1
  return [
    chk('shield handed out', c, { assert: 'present', of: { type: 'SHIELD_APPLIED' } }),
    raw('shield amount positive', applied.every(n => num(n.payload.amount) > 0),
      applied.map(n => String(n.payload.amount)).join(',')),
    raw('absorption never leaves a negative remainder', absorbed.every(n => num(n.payload.remaining) >= 0),
      absorbed.map(n => String(n.payload.remaining)).join(',')),
    raw('absorbed amount <= incoming', absorbed.every(n => num(n.payload.amount) <= num(n.payload.incoming) + 1e-9)),
    raw('shield applied before it absorbs', absIdx < 0 || (applyIdx >= 0 && applyIdx < absIdx)),
    chk('shield provider named', c, { assert: 'present', of: { type: 'SHIELD_APPLIED', source: c.sim.roster.find(u => u.kitId === 'march7th')!.name } }),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
