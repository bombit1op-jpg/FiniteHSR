/**
 * §13 ReactionWindow — armed counter/parry state with a charge budget.
 *
 * Pins the pure contract (arm / consume / disarm, never below 0, re-arm overwrites) and the two
 * live migrations: Clara's Svarog Counter window (2 charges, E6 3) and Yunli's Intuit Parry
 * (single charge, spent on the first counter).
 */

import { armWindow, windowArmed, windowCharges, consumeWindow, disarmWindow } from '../../src/core/combat/Reaction'
import { KITS } from '../../src/core/kits'
import { run, raw, mob } from '../_helpers/battle'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  // ---- pure contract ----
  {
    const rt: Record<string, unknown> = {}
    cases.push(t.eq('never-armed window is disarmed', windowArmed(rt, 'w'), false))
    cases.push(t.eq('never-armed window reads 0', windowCharges(rt, 'w'), 0))

    armWindow(rt, 'w', 3)
    cases.push(t.eq('armed window reports true', windowArmed(rt, 'w'), true))
    cases.push(t.eq('armed window carries its charge', windowCharges(rt, 'w'), 3))

    const spent1 = consumeWindow(rt, 'w')
    const spent2 = consumeWindow(rt, 'w')
    const spent3 = consumeWindow(rt, 'w')
    cases.push(t.eq('each eligible trigger consumes', spent1 && spent2 && spent3, true))
    cases.push(t.eq('consumed window is empty', windowArmed(rt, 'w'), false))

    const spent4 = consumeWindow(rt, 'w')
    cases.push(t.eq('empty window does not consume', spent4, false))
    cases.push(t.eq('charges never go below 0', windowCharges(rt, 'w'), 0))

    armWindow(rt, 'w', 1)
    disarmWindow(rt, 'w')
    cases.push(t.eq('disarm drops the window', windowCharges(rt, 'w'), 0))

    armWindow(rt, 'w', 1)
    armWindow(rt, 'w', 5)
    cases.push(t.eq('re-arm overwrites the old budget', windowCharges(rt, 'w'), 5))
  }

  // ---- Clara: E6 Svarog Counter window = 3 charges ----
  const cc = run({
    team: [{ kitId: 'clara', stats: { hp: 4000, atk: 2000, def: 1500, spd: 100 }, eidolon: 6, energyStartFrac: 1 }],
    enemy: mob({ hp: 5_000_000, atk: 100 }),
  })
  const ck = KITS.find(k => k.id === 'clara')!
  const cu = cc.sim.roster.find(x => x.kitId === 'clara')
  const ce = cc.sim.roster.find(x => x.kind === 'enemy')
  cases.push(raw('clara scenario has clara + a live enemy', !!cu && !!ce && !ce.dead))
  if (cu && ce) {
    cu.energy = cu.maxEnergy
    ck.perform(cc.sim, cu, { kind: 'ult' }, cc.sim.rt(cu))
    cases.push(t.eq('E6 ult arms 3 charges', windowCharges(cc.sim.rt(cu), 'clara_counter'), 3))
    for (let i = 0; i < 3; i++) ck.onAllyHit!(cc.sim, ce, cu, 100, cc.sim.rt(cu))
    cases.push(t.eq('3 enhanced counters drain the window', windowArmed(cc.sim.rt(cu), 'clara_counter'), false))
    cases.push(t.eq('drained window reads 0', windowCharges(cc.sim.rt(cu), 'clara_counter'), 0))
    ck.onAllyHit!(cc.sim, ce, cu, 100, cc.sim.rt(cu))
    cases.push(t.eq('a 4th hit spends nothing', windowCharges(cc.sim.rt(cu), 'clara_counter'), 0))
  }

  // ---- Yunli: Intuit Parry = one charge, spent on the first attack ----
  const yc = run({
    team: [{ kitId: 'yunli', stats: { hp: 4000, atk: 2000, def: 1200, spd: 100 }, energyStartFrac: 1 }],
    enemy: mob({ hp: 5_000_000, atk: 100 }),
  })
  const yk = KITS.find(k => k.id === 'yunli')!
  const yu = yc.sim.roster.find(x => x.kitId === 'yunli')
  const ye = yc.sim.roster.find(x => x.kind === 'enemy')
  cases.push(raw('yunli scenario has yunli + a live enemy', !!yu && !!ye && !ye.dead))
  if (yu && ye) {
    yu.energy = 120
    yk.perform(yc.sim, yu, { kind: 'ult' }, yc.sim.rt(yu))
    cases.push(t.eq('ult arms the parry window', windowCharges(yc.sim.rt(yu), 'yunli_parry'), 1))
    yk.onAllyHit!(yc.sim, ye, yu, 100, yc.sim.rt(yu))
    cases.push(t.eq('attack spends the parry', windowArmed(yc.sim.rt(yu), 'yunli_parry'), false))
    yk.onAllyHit!(yc.sim, ye, yu, 100, yc.sim.rt(yu))
    cases.push(t.eq('parry does not re-trigger when spent', windowCharges(yc.sim.rt(yu), 'yunli_parry'), 0))
  }

  return cases
}