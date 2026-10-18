import { run, raw, all } from '../../_helpers/battle'
import { preset } from '../../../src/core/presets'
import type { GearConfig } from '../../../src/core/entities/Unit'

export default () => {
  const bare = run({ team: [{ kitId: 'hook' }] })
  const p = preset('hook')!
  const gear: GearConfig = { si: 1 }
  if (p.lc[0]) gear.coneId = p.lc[0]
  else gear.coneId = 'night_of_fright'
  if (p.relic4[0]) gear.relicSets = [p.relic4[0], p.relic4[0]]
  if (p.planar[0]) gear.planarId = p.planar[0]
  const geared = run({ team: [{ kitId: 'hook', gear }] })
  const atkBare = bare.sim.roster.find(u => u.kitId === 'hook')!.base.atk
  const kit = geared.sim.roster.find(u => u.kitId === 'hook')!
  const dmg = (c: typeof bare): number => all(c, 'DAMAGE_DEALT')
    .reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)
  return [
    raw('cone raises base ATK', kit.base.atk > atkBare, `${kit.base.atk} > ${atkBare}`),
    raw('gear aggregate registered', geared.sim.gearMap.has(kit.id)),
    raw('damage output changes with gear', dmg(geared) !== dmg(bare), `${dmg(geared)} vs ${dmg(bare)}`),
    raw('bare run registers no gear', bare.sim.gearMap.size === 0, `size=${bare.sim.gearMap.size}`),
  ]
}
