import { run, raw, all } from '../../_helpers/battle'
import { resolveBuild, validateBuild } from '../../../src/core/build'
import type { GearConfig } from '../../../src/core/entities/Unit'

/**
 * BuildSpec (guide Phase B #11): a fixture can *name* a build instead of hand-assembling a
 * GearConfig. The family law: `build` compiles to exactly the runtime gear the explicit path
 * produces, set counts follow the engine's 2-per-id rule (so `relicCount: 4` = 4pc), and unknown
 * dataset ids are reported by `validateBuild` rather than silently ignored.
 */
export default () => {
  const gear: GearConfig = { coneId: 'secret_vow', si: 1, relicSets: ['musketeer', 'musketeer'], planarId: 'salsotto' }
  const explicit = run({ team: [{ kitId: 'hook', gear }] })
  const viaBuild = run({ team: [{ kitId: 'hook', build: { cone: 'secret_vow', si: 1, relic: 'musketeer', relicCount: 4, planar: 'salsotto' } }] })
  const twoPc = run({ team: [{ kitId: 'hook', build: { relic: 'musketeer', relicCount: 2 } }] })

  const unit = (c: typeof explicit) => c.sim.roster.find(u => u.kitId === 'hook')!
  const agg = (c: typeof explicit) => c.sim.gearOf(unit(c))!
  const dmg = (c: typeof explicit): number => all(c, 'DAMAGE_DEALT')
    .reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)

  const r = resolveBuild({ cone: 'secret_vow', si: 3, relic: 'musketeer', relic2: 'passerby', relicCount: 2, planar: 'salsotto' })
  const override = run({ team: [{ kitId: 'hook', build: { stats: { atk: 4321 }, eidolon: 2 } }] })

  return [
    raw('build compiles to the same gear aggregate as the explicit path',
      JSON.stringify(agg(explicit).mods) === JSON.stringify(agg(viaBuild).mods),
      `${agg(explicit).mods.length} vs ${agg(viaBuild).mods.length} mods`),
    raw('build run deals the same damage as the explicit run', dmg(explicit) === dmg(viaBuild), `${dmg(explicit)} vs ${dmg(viaBuild)}`),
    raw('relicCount 4 registers the four-piece bonus', agg(viaBuild).relicSets4!.length === 1, `${agg(viaBuild).relicSets4!.length}`),
    raw('relicCount 2 does not register the four-piece bonus', agg(twoPc).relicSets4!.length === 0, `${agg(twoPc).relicSets4!.length}`),
    raw('planar set is wired into the aggregate', agg(viaBuild).planar?.id === 'salsotto', String(agg(viaBuild).planar?.id)),
    raw('cone is wired at the requested superimposition', agg(viaBuild).cone?.id === 'secret_vow' && agg(viaBuild).coneSi === 1,
      `${agg(viaBuild).cone?.id}@${agg(viaBuild).coneSi}`),
    raw('resolveBuild maps 2+2 sets + SI', JSON.stringify(r.gear) === JSON.stringify({ coneId: 'secret_vow', si: 3, relicSets: ['musketeer', 'passerby'], planarId: 'salsotto' }),
      JSON.stringify(r.gear)),
    raw('validateBuild accepts known ids', validateBuild({ cone: 'secret_vow', relic: 'musketeer', relic2: 'passerby', planar: 'salsotto' }).length === 0),
    raw('validateBuild flags unknown ids', validateBuild({ cone: 'nope', relic: 'nope', planar: 'nope' }).length === 3,
      validateBuild({ cone: 'nope', relic: 'nope', planar: 'nope' }).join(',')),
    raw('build stat + eidolon overrides reach the unit',
      unit(override).base.atk === 4321 && override.sim.rt(unit(override)).eidolon === 2,
      `atk=${unit(override).base.atk} eidolon=${override.sim.rt(unit(override)).eidolon}`),
  ]
}
