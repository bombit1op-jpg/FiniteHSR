/**
 * §44 `regression/` — state diff must see through the decimal and the qualitative fields.
 *
 * `StateMatcher` extracts a full per-unit state (hp, energy, buffs as `id x stacks @ turns`,
 * av, toughness, dots, dead). This pins the direction the whole verification layer reads state
 * in: a stack change, a re-rolled amount or a fallen unit all HAVE to land in the diff.
 */

import { prepareBattle } from '../../src/core/battle'
import { snapshot, diff } from '../../src/verification/StateMatcher'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  const sim = prepareBattle({
    team: [{ kitId: 'danheng', name: 'Dan' }],
    enemy: { name: 'Foe', count: 1, hp: 1_000_000, spd: 100, level: 60, toughness: 30, weaknesses: ['Wind'] },
    cycles: 5, seed: 1,
  })
  const u = sim.roster.find(x => x.kitId === 'danheng')!
  const foe = sim.roster.find(x => x.side === 'enemy')!

  const before = snapshot(sim)
  u.hp -= 100
  u.energy += 30
  sim.addBuff(u, { id: 'st_test', name: 'ST test', mods: [{ stat: 'dmgAll', value: 0.1 }], turns: 1 })
  foe.hp -= 500
  foe.dead = true
  const changed = diff(before, sim)

  cases.push(t.truthy('state diff: hp move lands (ally)', changed.some(l => l.startsWith('Dan.hp:'))))
  cases.push(t.truthy('state diff: energy grant lands (3 -> 33)', changed.some(l => l.startsWith('Dan.energy:'))))
  cases.push(t.truthy('state diff: buff stack/duration lands (id x stacks @ turns)', changed.some(l => l.startsWith('Dan.buffs:') && l.includes('st_test'))))
  cases.push(t.truthy('state diff: untoched av/toughness stay silent', !changed.some(l => l.includes('.av:') || l.includes('.toughness:'))))
  cases.push(t.truthy('state diff: enemy death lands dead flag', changed.some(l => l.startsWith('Foe.dead:')) && changed.some(l => l.startsWith('Foe.hp:'))))
  cases.push(t.truthy('state diff: no phantom removals', !changed.some(l => l.endsWith('<removed>'))))

  return cases
}