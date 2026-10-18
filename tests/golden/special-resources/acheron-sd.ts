import { chk, run, raw, all } from '../../_helpers/battle'

/**
 * Acheron's Ultimate is gated on Slashed Dream, a non-Energy resource stored in `energy`
 * (cap 9, `ultConsumption: 'none'`). The family rule: the pool is drained with an
 * ENERGY_LOSS the engine labels `ult_cost`, but the resource is NEVER refilled through
 * ENERGY_GAIN — it only grows via the kit's own gainSD path. A kit that silently used the
 * standard Energy system would fail the second check.
 */
export default () => {
  // seed the Slashed Dream pool full — canonically it progresses only from debuffs
  // (or ally applications), never from being attacked, so a 0-start solo brawl would cast 0 Ults.
  const c = run({ team: [{ kitId: 'acheron', energyStartFrac: 1 }] })
  const losses = all(c, 'ENERGY_LOSS').filter(n => n.source === 'Acheron')
  const gains = all(c, 'ENERGY_GAIN').filter(n => n.source === 'Acheron')
  const ults = all(c, 'ABILITY_USED').filter(n => n.source === 'Acheron' && n.payload.action === 'ultimate')
  const a = c.sim.roster.find(u => u.kitId === 'acheron')!
  return [
    chk('Slashed Dream cap is the pool size', c, { assert: 'unitState', kitId: 'acheron', field: 'maxEnergy', value: 9 }),
    raw('ult cost is a resource loss labelled ult_cost', losses.length > 0 && losses.every(n => n.payload.reason === 'ult_cost'),
      losses.map(n => String(n.payload.reason)).join(',')),
    raw('resource never refills through the Energy system', gains.length === 0, `gains=${gains.length}`),
    raw('SD refills and the Ultimate fires', ults.length >= 1, `ults=${ults.length}`),
    raw('resource stays within [0, cap]', a.energy >= 0 && a.energy <= a.maxEnergy, `${a.energy}/${a.maxEnergy}`),
  ]
}
