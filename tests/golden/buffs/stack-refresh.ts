import { chk, run, raw, all, name } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', skillPriority: 1 }] })
  const applied = all(c, 'BUFF_APPLIED')
  const expired = all(c, 'BUFF_EXPIRED')
  const stacked = all(c, 'BUFF_STACKED')
  const appliedBeforeExpired = applied.every(a => {
    const e = expired.find(x => x.payload.id === a.payload.id)
    return !e || c.nodes.indexOf(a) < c.nodes.indexOf(e)
  })
  const stacksOk = stacked.every(s => {
    const max = s.payload.maxStacks
    return typeof max !== 'number' || num(s.payload.stacks) <= max
  })
  return [
    chk('a buff lands', c, { assert: 'present', of: { type: 'BUFF_APPLIED' } }),
    chk('traces applied pre-battle', c, { assert: 'buff', id: 'traces', target: name(c, 'hook') }),
    raw('applied stacks >= 1', applied.every(n => num(n.payload.stacks) >= 1),
      applied.map(n => String(n.payload.stacks)).join(',')),
    raw('applied strictly before expired for same id', appliedBeforeExpired),
    raw('stacked never exceeds maxStacks', stacksOk),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
