import { LIGHT_CONES, aggregateGear } from '../../../src/core/gear'
import { run } from '../../_helpers/battle'
import { t, type Case } from '../../suites'
import type { BaseStats, GearConfig } from '../../../src/core/entities/Unit'

/**
 * Light-cone passive verification (guide §19.3): the levels a cone must reach — data stats,
 * passive structure, condition, SI scaling, expiration/stacking, and character interaction.
 * Structural levels run over ALL 169 cones; the conditional/stacking/interaction levels pin a
 * few representative cones (in_the_night, showtime, swordplay, secret_vow).
 */
const base: BaseStats = { level: 80, hp: 8000, atk: 4000, def: 600, spd: 100 }
const withPath = (path: string, over: Partial<BaseStats> = {}): BaseStats => ({ ...base, path, ...over })
const cone = (id: string) => LIGHT_CONES.find(c => c.id === id)!
const modsOf = (g: GearConfig, cs: BaseStats) => aggregateGear(g, cs)

export default (): Case[] => {
  const cases: Case[] = []

  // --- data stats + structure over every cone ---------------------------------
  let statsOk = true, structOk = true, metaOk = true
  const bad: string[] = []
  for (const c of LIGHT_CONES) {
    if (!(c.hp > 0 && c.atk > 0 && c.def > 0)) { statsOk = false; bad.push(`stats ${c.id}`) }
    if (typeof c.path !== 'string' || !c.path || !(c.rarity === 3 || c.rarity === 4 || c.rarity === 5)) { metaOk = false; bad.push(`meta ${c.id}`) }
    if (c.mods) for (let si = 1; si <= 5; si++) {
      const arr = c.mods(si)
      if (!Array.isArray(arr) || arr.some(m => typeof m.stat !== 'string' || !Number.isFinite(m.value))) { structOk = false; bad.push(`mods ${c.id} si${si}`) }
    }
  }
  const where = `${LIGHT_CONES.length} cones` + (bad.length ? `; e.g. ${bad.slice(0, 3).join(', ')}` : ' — all pass')
  cases.push(t.ok('every light cone has positive base HP/ATK/DEF', statsOk, where))
  cases.push(t.ok('every light cone has a path and a 3/4/5★ rarity', metaOk, where))
  cases.push(t.ok('passive structure: mods(si) is a finite Mod[] for si 1..5', structOk, where))

  // --- base stats always apply, passive only on path match ---------------------
  const sv = cone('secret_vow')
  const svAgg = modsOf({ coneId: 'secret_vow' }, withPath('Destruction'))
  cases.push(t.ok('data stats: cone base HP/ATK/DEF fold into baseAdd',
    svAgg.baseAdd.hp === sv.hp && svAgg.baseAdd.atk === sv.atk && svAgg.baseAdd.def === sv.def,
    `${JSON.stringify(svAgg.baseAdd)} vs ${sv.hp}/${sv.atk}/${sv.def}`))

  const mism = modsOf({ coneId: 'in_the_night' }, withPath('Destruction'))
  const match = modsOf({ coneId: 'in_the_night' }, withPath('Hunt'))
  cases.push(t.ok('path mismatch: base stats apply but the passive does not',
    mism.cone === undefined && mism.baseAdd.atk === cone('in_the_night').atk && match.cone !== undefined,
    `cone=${mism.cone}; atk=${mism.baseAdd.atk}`))

  // --- SI scaling of the passive ----------------------------------------------
  const sv1 = sv.mods!(1).find(m => m.stat === 'dmgAll')!.value
  const sv5 = sv.mods!(5).find(m => m.stat === 'dmgAll')!.value
  const sh = cone('showtime')
  cases.push(t.ok('SI scales the passive value', sv5 > sv1 && sh.mods!(1)[0].value < sh.mods!(5)[0].value, `sv ${sv1}->${sv5}`))

  // --- condition (stat gate, evaluated against final gear stats) ---------------
  const night = (spd: number) => modsOf({ coneId: 'in_the_night' }, withPath('Hunt', { spd }))
  const lowSpd = night(100), hiSpd = night(130)
  const boost = (g: ReturnType<typeof modsOf>) => g.mods.filter(m => m.stat === 'boost:basic').reduce((a, m) => a + m.value, 0)
  cases.push(t.ok('spd condition: gate closed below 120, opens at/above 120',
    boost(lowSpd) === 0 && boost(hiSpd) > 0, `100=${boost(lowSpd)} 130=${boost(hiSpd)}`))

  const show = (ehr: number, si: number) => modsOf({ coneId: 'showtime', si }, withPath('Nihility', { ehr }))
  const atkPct = (g: ReturnType<typeof modsOf>) => g.mods.filter(m => m.stat === 'atkPct').reduce((a, m) => a + m.value, 0)
  cases.push(t.ok('ehr condition: ATK% bonus only when EHR ≥ 80%',
    atkPct(show(0.5, 5)) === 0 && Math.abs(atkPct(show(1.0, 5)) - 0.36) < 1e-9,
    `ehr0.5=${atkPct(show(0.5, 5))} ehr1.0=${atkPct(show(1.0, 5))}`))

  // --- dynamic stacks + character interaction (battle) -------------------------
  const sw = (kid: string, si: number) => {
    const c = run({ team: [{ kitId: kid, stats: base, gear: { coneId: 'swordplay', si } }] })
    const u = c.sim.roster.find(x => x.kitId === kid)!
    const mod = u.buffs.find(b => b.id === 'swordplay')?.mods?.find(m => m.stat === 'dmgAll')
    return { value: mod?.value ?? 0, atk: u.base.atk, present: u.buffs.some(b => b.id === 'swordplay') }
  }
  const s1 = sw('seele', 1), s5 = sw('seele', 5)
  const per = 0.08 // swordplay: 0.08 + 0.02*(si-1) per stack, max 5 stacks
  const stacks = Math.round(s1.value / per)
  cases.push(t.ok('stack cone: wearer interactions build per-attack stacks',
    s1.present && stacks >= 1 && stacks <= 5 && Math.abs(s1.value - per * stacks) < 1e-9,
    `value=${s1.value} stacks=${stacks}`))
  cases.push(t.ok('stack value doubles with SI (same stacks, per-stack 2×)',
    Math.abs(s5.value - 2 * s1.value) < 1e-9, `${s1.value}->${s5.value}`))

  const off = sw('hook', 1) // hook is Destruction; swordplay is Hunt → passive must not fire
  cases.push(t.ok('path mismatch leaves the stack passive dormant but keeps base ATK',
    !off.present && off.atk === base.atk + cone('swordplay').atk,
    `present=${off.present} atk=${off.atk}`))

  return cases
}
