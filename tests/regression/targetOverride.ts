/**
 * §25 forced-target / Taunt (TargetOverride).
 *
 * Pins the mark contract (apply refresh, per-turn tick, expiring window at 0) and the end-to-end
 * engine behavior: Mydei's Throne of Bones Taunts every living enemy (raw ult param #4 = 2 turns),
 * which forces the enemy's SINGLE-target picks onto Mydei (TARGET_SELECTED mode 'forced') and stops
 * after the 2-turn window — AoE picks stay unredirected. Also pins Trailblazer (Preservation) Skill
 * "Ever-Burning Amber" (100% base chance, 1 turn): every enemy single-target pick is forced onto the caster.
 */

import { applyOverride, tickOverride } from '../../src/core/combat/TargetOverride'
import { run, raw, all, name, mob } from '../_helpers/battle'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  // ---- pure mark contract ----
  const m = applyOverride(3, 'mydei', 'mydei')
  cases.push(t.eq('apply carries source/target/turns', JSON.stringify(m), JSON.stringify({ sourceId: 'mydei', targetId: 'mydei', turns: 3 })))
  const m2 = tickOverride(applyOverride(2, 'a', 'b'))
  cases.push(t.eq('one attacker turn consumed', m2?.turns, 1))
  cases.push(raw('turns hit 0 -> window expired', tickOverride(applyOverride(1, 'a', 'b')) === undefined))
  const rearm = applyOverride(3, 'a', 'b')
  cases.push(t.eq('re-apply refreshes the window', applyOverride(5, 'a', 'b').turns > rearm.turns, true))

  // ---- engine: Mydei Throne of Bones Taunts all enemies for 2 turns ----
  const c = run({
    team: [
      { kitId: 'mydei', stats: { hp: 9000, atk: 1200, def: 1000, spd: 140, critRate: 0.5, critDmg: 1.0 }, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'asta', stats: { hp: 4000, atk: 1000, spd: 130 } },
    ],
    enemy: mob({ hp: 50_000_000, atk: 100 }),
    cycles: 40,
  })
  const mydei = name(c, 'mydei')
  const picks = all(c, 'TARGET_SELECTED')
  const forced = picks.filter(n => n.payload.mode === 'forced')
  const taunts = (c.logLines.filter(l => /Taunt 2 turn\(s\) on 1 enemy/.test(l))).length
  // window semantics: every run of CONSECUTIVE forced picks is ≤ the 2-turn window
  // (each ult application re-arms a fresh window; AoE picks in between don't consume it)
  let streak = 0, maxRun = 0
  for (const n of picks) {
    if (n.payload.mode === 'forced') { streak++; maxRun = Math.max(maxRun, streak) }
    else streak = 0
  }
  cases.push(raw('taunt fired (ult log line)', taunts >= 1))
  cases.push(raw('enemy single-target picks were forced onto Mydei at least once', forced.length >= 1))
  cases.push(raw('a single application never exceeds its 2-turn window', maxRun <= 2))
  cases.push(raw('every forced pick landed on the taunter (Mydei)', forced.every(n => n.target === mydei)))

  // ---- engine: mark API is inspectable/removable on the sim ----
  const mydeiU = c.sim.roster.find(x => x.kitId === 'mydei')!
  const enemyU = c.sim.roster.find(x => x.side === 'enemy')!
  c.sim.addTargetOverride(enemyU, mydeiU, 1)
  cases.push(raw('mark registered by attacker id', c.sim.targetOverrides.has(enemyU.id)))
  cases.push(raw('mark points at the taunter', c.sim.targetOverrides.get(enemyU.id)?.targetId === mydeiU.id))
  c.sim.removeTargetOverride(enemyU)
  cases.push(raw('removeTargetOverride clears the mark', !c.sim.targetOverrides.has(enemyU.id)))

  // ---- engine: TB Preservation Skill (Ever-Burning Amber) Taunts ALL enemies for 1 turn ----
  const b = run({
    team: [
      { kitId: 'trailblazer_preservation', stats: { hp: 6000, atk: 1200, def: 1500, spd: 130 }, skillPriority: 2 },
      { kitId: 'asta', stats: { hp: 4000, atk: 1000, spd: 90 } },
    ],
    enemy: mob({ hp: 50_000_000, atk: 100, count: 2 }),
    cycles: 12,
  })
  const tbp = name(b, 'trailblazer_preservation')
  const bForced = all(b, 'TARGET_SELECTED').filter(n => n.payload.mode === 'forced')
  cases.push(raw('TB Preservation Skill taunt forced enemy single-target picks', bForced.length >= 1))
  cases.push(raw('every forced pick landed on the caster', bForced.every(n => n.target === tbp)))

  return cases
}