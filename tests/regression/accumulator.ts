/**
 * §9 PERSISTENT / PER_BATTLE accumulator — running totals of "gained this battle" mechanics
 * (Gilgamesh A2 Hero's Hauteur, Saber A6 Crown of the Star / E2 The Lost Oath).
 *
 * Pins the contract: monotone, ignores non-positive deltas, clamps to [0, cap?], and the persisted
 * value survives the depletion of whatever it counts (it is read back independently of the resource).
 */

import { accAdd, accGet, type RuntimeBag } from '../../src/core/combat/Accumulator'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  cases.push(t.eq('unset accumulator reads 0', accGet({}, 'x'), 0))
  cases.push(t.eq('add returns the new total', accAdd({}, 'x', 3), 3))

  {
    const rt: RuntimeBag = {}
    accAdd(rt, 'x', 3); accAdd(rt, 'x', 4)
    cases.push(t.eq('repeated gains accumulate', accGet(rt, 'x'), 7))
    cases.push(t.eq('persists across depletion of the counted resource', accGet(rt, 'x'), 7))
  }

  {
    const rt: RuntimeBag = {}
    accAdd(rt, 'x', 5)
    cases.push(t.eq('non-positive delta is ignored', accAdd(rt, 'x', -3), 5))
    cases.push(t.eq('zero delta is ignored', accAdd(rt, 'x', 0), 5))
  }

  cases.push(t.eq('cap clamps the running total', accAdd({}, 'h', 9, { cap: 6 }), 6))
  cases.push(t.eq('cap is reached incrementally', (() => { const rt: RuntimeBag = {}; accAdd(rt, 'h', 4, { cap: 6 }); return accAdd(rt, 'h', 4, { cap: 6 }) })(), 6))
  cases.push(t.eq('no cap grows unbounded', accAdd({}, 'n', 9), 9))

  // Gilgamesh A2 canon: each Interest *gained* across the battle -> +25% CRIT DMG, cap 6 stacks (=+150%)
  {
    const rt: RuntimeBag = {}
    for (let i = 0; i < 10; i++) accAdd(rt, 'hauteur', 1, { cap: 6 })
    cases.push(t.eq('A2 Hero\'s Hauteur caps at 6 stacks (+150% CRIT DMG)', accGet(rt, 'hauteur') * 0.25, 1.5))
  }

  return cases
}
