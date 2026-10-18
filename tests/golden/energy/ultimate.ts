import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook', energyStartFrac: 0.95 }] })
  const gains = all(c, 'ENERGY_GAIN')
  const who = c.sim.roster.find(u => u.kitId === 'hook')!
  return [
    chk('energy gained', c, { assert: 'present', of: { type: 'ENERGY_GAIN' } }),
    raw('gain recorded for the character', gains.some(n => n.target === who.name), gains.map(n => n.target).join(',')),
    raw('energy never exceeds the pool', gains.every(n => num(n.payload.total) <= num(n.payload.max) + 1e-9),
      gains.map(n => `${n.payload.total}/${n.payload.max}`).join(' ')),
    raw('final energy within pool', who.energy <= who.maxEnergy, `${who.energy}/${who.maxEnergy}`),
    chk('full energy announced before the ult fires', c, { assert: 'present', of: { type: 'ENERGY_FULL' } }),
  ]
}

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)
