import { chk, run, raw, all, mob } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook' }, { kitId: 'pela' }], enemy: mob({ count: 3 }) })
  const picks = all(c, 'TARGET_SELECTED')
  const allies = new Set(c.sim.roster.filter(u => u.side === 'ally').map(u => u.name))
  const single = picks.filter(n => n.payload.mode === 'single')
  const aoe = picks.filter(n => n.payload.mode === 'aoe')
  return [
    chk('target picked', c, { assert: 'present', of: { type: 'TARGET_SELECTED' } }),
    raw('single pick = exactly one team unit', single.length > 0 && single.every(n => n.target !== undefined && allies.has(n.target)
      && Array.isArray(n.payload.targets) && n.payload.targets.length === 1 && n.payload.targets[0] === n.target),
      single.map(n => `${n.target}|${JSON.stringify(n.payload.targets)}`).join(' ')),
    raw('aoe pick lists its units', aoe.every(n => Array.isArray(n.payload.targets) && n.payload.targets.length > 0
      && n.payload.targets.every(t => allies.has(String(t)))),
      aoe.map(n => JSON.stringify(n.payload.targets)).join(' ')),
    raw('every ally gets targeted', [...allies].every(a => single.some(n => n.target === a) || aoe.some(n => (n.payload.targets as unknown[]).includes(a))),
      `allies=${[...allies].join(',')} singles=${[...new Set(single.map(n => String(n.target)))].join(',')}`),
    raw('enemy attacker named', single.every(n => n.source !== undefined && c.sim.roster.some(u => u.name === n.source && u.side === 'enemy'))),
  ]
}
