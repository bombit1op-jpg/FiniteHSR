/**
 * Requirement-level Before/Event/After state clauses (Phase-3 post-StateMatcher):
 * a requirement may carry `before`/`after` StateClause lists, evaluated by runFixture on the
 * pre-battle and end-of-battle `StateView`. The boothill fixture proves the wiring on a live sim
 * (Boothill alive at end, elite toughness ≤ 90) and pins the stable SP-pool boundary: `before sp=3`
 * (the ResourceSystem default at post-init). An exact `after sp` is deliberately NOT pinned on this
 * two-character pool — it regenerates via Basics, so the end value is not a stable contract. The
 * deterministic 3 -> 0 solo drain is pinned in the production spec boothill/skill.json instead.
 */
import type { SlotSpec } from '../../src/verification/Spec'
import { runFixture } from '../../src/verification/GoldenRunner'
import { clauses, type StateView } from '../../src/verification/StateMatcher'
import { t, type Case } from '../suites'

const spec: SlotSpec = {
  kit: 'boothill',
  slot: 'skill',
  fixtures: [
    {
      id: 'standoff-basic',
      env: 'clause test — craft fixture',
      battle: {
        team: [
          { kitId: 'boothill', stats: { hp: 5000, atk: 2400, def: 1300, spd: 107 }, eidolon: 0, skillPriority: 2 },
          { kitId: 'danheng', stats: { hp: 5000, atk: 2200, def: 1300, spd: 130 }, skillPriority: 3 },
        ],
        enemy: { name: 'Elite', count: 1, hp: 220000, spd: 160, level: 85, toughness: 90, weaknesses: ['Physical'], atk: 350 },
        cycles: 8,
        seed: 5,
      },
    },
  ],
  requirements: [
    {
      id: 'r1',
      layer: 'structure',
      claim: 'The fight starts on the post-init battle state (full-HP units, intact elite, team SP pool at its 3-point default) and Boothill ends alive.',
      assertion: { assert: 'present', of: { type: 'SP_LOSS', source: 'Boothill' } },
      before: [
        { kitId: 'boothill', stat: 'hp', op: 'atLeast', value: 5000 },
        { kitId: 'boothill', stat: 'sp', op: 'eq', value: 3 },
        { unit: 'Elite', stat: 'hp', op: 'eq', value: 220000 },
        { unit: 'Elite', stat: 'toughness', op: 'eq', value: 90 },
        { unit: 'Elite', stat: 'broken', op: 'eq', value: 0 },
      ],
      after: [
        { kitId: 'boothill', stat: 'dead', op: 'eq', value: 0 },
      ],
    },
    {
      id: 'r2',
      layer: 'parameters',
      claim: 'Elite toughness starts at 90 and can only go down — the engine never grows it.',
      assertion: { assert: 'present', of: { type: 'ACTION_START' } },
      after: [{ unit: 'Elite', stat: 'toughness', op: 'atMost', value: 90 }],
    },
  ],
}

export default (): Case[] => {
  const cases: Case[] = []
  const fakeView: StateView = {
    units: new Map([
      ['Dan', { kitId: 'danheng', name: 'Dan', hp: 100, energy: 50, buffs: ['a x 1 @ 1'], broken: false, dead: false, spd: 120, av: 100, toughness: 0, dots: [] }],
    ]),
    sp: 5,
  }
  cases.push(t.truthy('clause: eq on numeric stat', clauses([{ kitId: 'danheng', stat: 'hp', op: 'eq', value: 100 }], fakeView).ok))
  cases.push(t.truthy('clause: sp is the team pool, not a unit stat', clauses([{ kitId: 'danheng', stat: 'sp', op: 'eq', value: 5 }], fakeView).ok))
  cases.push(t.truthy('clause: boolean stats coerce (dead=false → 0)', clauses([{ kitId: 'danheng', stat: 'dead', op: 'eq', value: 0 }], fakeView).ok))
  cases.push(t.truthy('clause: buffs count buff lines', clauses([{ kitId: 'danheng', stat: 'buffs', op: 'eq', value: 1 }], fakeView).ok))
  cases.push(t.truthy('clause: atLeast fails on a lower value', !clauses([{ kitId: 'danheng', stat: 'hp', op: 'atLeast', value: 101 }], fakeView).ok))
  cases.push(t.truthy('clause: unknown unit fails with a reason', !clauses([{ unit: 'Nope', stat: 'hp', op: 'eq', value: 1 }], fakeView).ok))
  cases.push(t.truthy('clause list: AND semantics, one miss kills', !clauses([{ kitId: 'danheng', stat: 'hp', op: 'atLeast', value: 50 }, { kitId: 'danheng', stat: 'energy', op: 'eq', value: 51 }], fakeView).ok))
  cases.push(t.truthy('clause list: all pass', clauses([{ kitId: 'danheng', stat: 'hp', op: 'atLeast', value: 50 }, { kitId: 'danheng', stat: 'energy', op: 'atMost', value: 50 }], fakeView).ok))

  const run = runFixture(spec, spec.fixtures[0])
  cases.push(t.truthy('before/after clauses pass in a real fixture run', !run.rows.some(r => !r.result.ok)))
  cases.push(t.truthy('rows carry claim + layer + fixture through', run.rows.every(r => r.claim && r.layer && r.fixture === 'standoff-basic')))

  const mutant = JSON.parse(JSON.stringify(spec)) as SlotSpec
  mutant.requirements[0].after = [{ kitId: 'boothill', stat: 'dead', op: 'eq', value: 1 }]
  const runM = runFixture(mutant, mutant.fixtures[0])
  const rowM = runM.rows.find(r => r.requirement === 'r1')!
  cases.push(t.truthy('clause failure surfaces in the row result (mutant dead eq 1)', !rowM.result.ok && /Boothill\.dead/.test(rowM.result.detail)))
  return cases
}