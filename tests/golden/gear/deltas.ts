import { run, raw, all } from '../../_helpers/battle'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS, RELIC_MAIN_VALUES } from '../../../src/core/gear'
import type { Ctx } from '../../_helpers/battle'
import type { RelicPiece } from '../../../src/core/entities/Unit'

/**
 * Equipment delta tests (guide §19.2 "verification targets" / Phase-B item 15): swap ONE item and
 * pin the resulting delta. The law: a light cone adds exactly its base ATK; a 2pc cavern set and a
 * planar set each add their own stat value; the deltas are additive; SI scales the passive without
 * touching base stats. Everything else (character, stats, seed, enemy) is held fixed.
 */
export default () => {
  const base = { atk: 4000, hp: 8000, def: 600, spd: 100 }
  const mk = (gear?: unknown): Ctx => run({ team: [{ kitId: 'hook', stats: base, ...(gear ? { gear } : {}) }] })
  const eff = (c: Ctx): number => Math.round(c.sim.effAtk(c.sim.roster.find(u => u.kitId === 'hook')!))
  const baseAtk = (c: Ctx): number => c.sim.roster.find(u => u.kitId === 'hook')!.base.atk
  const dmg = (c: Ctx): number => all(c, 'DAMAGE_DEALT').reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)

  const bare = mk()
  const cone = mk({ coneId: 'secret_vow', si: 1 })
  const cone5 = mk({ coneId: 'secret_vow', si: 5 })
  const musk2 = mk({ relicSets: ['musketeer'] })
  const sss = mk({ planarId: 'sss' })
  const both = mk({ relicSets: ['musketeer'], planarId: 'sss' })

  const coneAtk = LIGHT_CONES.find(l => l.id === 'secret_vow')!.atk
  const relicAtkPct = RELIC_SETS.find(s => s.id === 'musketeer')!.twoPc!.find(m => m.stat === 'atkPct')!.value
  const planarAtkPct = PLANAR_SETS.find(s => s.id === 'sss')!.mods!.find(m => m.stat === 'atkPct')!.value

  // one body relic swapped on its main stat only (same set, one piece → no 2pc activation)
  const body = (main: string): RelicPiece => ({ setId: 'musketeer', slot: 'body', main, subs: [] })
  const bodyAtk = mk({ pieces: [body('atkPct')] })
  const bodyCrit = mk({ pieces: [body('critDmg')] })

  return [
    raw('light cone adds exactly its base ATK', baseAtk(cone) - baseAtk(bare) === coneAtk, `+${baseAtk(cone) - baseAtk(bare)} vs cone ${coneAtk}`),
    raw('2pc cavern set adds its ATK% of base', eff(musk2) - eff(bare) === Math.round(relicAtkPct * base.atk), `+${eff(musk2) - eff(bare)} vs ${Math.round(relicAtkPct * base.atk)}`),
    raw('planar set adds its ATK% of base', eff(sss) - eff(bare) === Math.round(planarAtkPct * base.atk), `+${eff(sss) - eff(bare)} vs ${Math.round(planarAtkPct * base.atk)}`),
    raw('equal-ATK% cavern and planar give the same ATK', eff(musk2) === eff(sss), `${eff(musk2)} vs ${eff(sss)}`),
    raw('cavern + planar ATK% deltas are additive', eff(both) - eff(bare) === Math.round((relicAtkPct + planarAtkPct) * base.atk), `+${eff(both) - eff(bare)}`),
    raw('SI scales the passive, not base stats', baseAtk(cone5) === baseAtk(cone) && dmg(cone5) > dmg(cone), `atk ${baseAtk(cone5)} dmg ${dmg(cone5)} vs ${dmg(cone)}`),
    raw('one body piece swapped on main stat = its main-value delta',
      eff(bodyAtk) - eff(bodyCrit) === Math.round(RELIC_MAIN_VALUES.atkPct! * base.atk),
      `+${eff(bodyAtk) - eff(bodyCrit)} vs ${Math.round(RELIC_MAIN_VALUES.atkPct! * base.atk)}`),
  ]
}
