import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'pela', skillPriority: 1, energyStartFrac: 0.95 }] })
  const deb = all(c, 'DEBUFF_APPLIED')
  const debExp = all(c, 'DEBUFF_EXPIRED')
  const buf = all(c, 'BUFF_APPLIED')
  const enemyNames = new Set(c.sim.roster.filter(u => u.side === 'enemy').map(u => u.name))
  const orderOk = deb.every(d => {
    const e = debExp.find(x => x.payload.id === d.payload.id)
    return !e || c.nodes.indexOf(d) < c.nodes.indexOf(e)
  })
  return [
    chk('debuff lands on the enemy', c, { assert: 'present', of: { type: 'DEBUFF_APPLIED' } }),
    raw('debuff targets are enemies', deb.length > 0 && deb.every(n => n.target !== undefined && enemyNames.has(n.target)),
      deb.map(n => String(n.target)).join(',')),
    raw('DEBUFF_* flagged debuff=true', deb.every(n => n.payload.debuff === true)),
    raw('BUFF_* flagged debuff=false', buf.every(n => n.payload.debuff === false)),
    raw('debuff applied before expired', orderOk),
    raw('DEBUFF_EXPIRED uses the same id vocabulary', debExp.every(x => deb.some(d => d.payload.id === x.payload.id))),
  ]
}
