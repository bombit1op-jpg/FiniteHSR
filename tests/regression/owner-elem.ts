import { prepareBattle } from '../../src/core/battle'
import { case_, type Case } from '../suites'

/**
 * §11 Attribute-разрез — per-owner damage folded by ELEMENT (`sim.ownerElem`), the accumulator behind
 * the sweep `.done` "by element" line. `account()` receives the hit element at every call site
 * (pipeline / DoT / break / super-break / adjacent / additional), so for a single-element attacker the
 * element fold must sum EXACTLY to `ownerDamage` — a missing element at any path would show up as a
 * shortfall here. Break/DoT/Additional DMG all carry their own element, not the attacker's blanket one.
 */

const dummy = (weak: string, hp = 5_000_000) => ({
  name: 'Elem Test Foe', count: 1, hp, spd: 1, level: 80, toughness: 0, weaknesses: [weak] as never, atk: 1,
})

const build = (kitId: string, weak: string, cycles = 1, hp = 5_000_000) => {
  const s = prepareBattle({
    team: [{ kitId, stats: { hp: 30000, atk: 4000, def: 1000, spd: 160 }, skillPriority: 2 }],
    enemy: dummy(weak, hp), cycles, seed: 3,
  })
  s.initBattle(); s.loop()
  const u = s.roster.find(x => x.side === 'ally' && x.kind === 'char')!
  return { s, u }
}

const foldOf = (s: ReturnType<typeof prepareBattle>, id: string): Map<string, number> =>
  s.ownerElem.get(id) ?? new Map<string, number>()

export default (): Case[] => {
  const cases: Case[] = []

  // single-element attacker: the element fold is complete and keyed by the attacker's element
  {
    const { s, u } = build('hook', 'Fire')
    const fold = foldOf(s, u.id)
    const sum = [...fold.values()].reduce((a, b) => a + b, 0)
    const dmg = s.ownerDamage.get(u.id) ?? 0
    cases.push(case_('Hook: element fold sums to ownerDamage', Math.round(sum) === Math.round(dmg), `${Math.round(sum)} vs ${Math.round(dmg)}`))
    cases.push(case_('Hook: single element = Fire', fold.size === 1 && fold.has('Fire'), [...fold.keys()].join(',')))
  }

  // a second element on the same team stays on its own owner (no cross-attribution)
  {
    const s = prepareBattle({
      team: [
        { kitId: 'hook', stats: { hp: 30000, atk: 4000, def: 1000, spd: 160 }, skillPriority: 2 },
        { kitId: 'arlan', stats: { hp: 30000, atk: 4000, def: 1000, spd: 150 }, skillPriority: 2 },
      ],
      enemy: dummy('Fire'), cycles: 1, seed: 3,
    })
    s.initBattle(); s.loop()
    const hook = s.roster.find(x => x.kitId === 'hook')!
    const arlan = s.roster.find(x => x.kitId === 'arlan')!
    const fh = foldOf(s, hook.id)
    const fa = foldOf(s, arlan.id)
    cases.push(case_('Hook keeps only Fire', fh.size === 1 && fh.has('Fire'), [...fh.keys()].join(',')))
    cases.push(case_('Arlan keeps only Lightning', fa.size === 1 && fa.has('Lightning'), [...fa.keys()].join(',')))
  }

  // DoT damage folds under the DoT's own element: Kafka's Shock is part of her element total
  {
    const { s, u } = build('kafka', 'Lightning', 2, 9_000_000)
    const fold = foldOf(s, u.id)
    const sum = [...fold.values()].reduce((a, b) => a + b, 0)
    const dmg = s.ownerDamage.get(u.id) ?? 0
    const hasDot = [...(s.ownerAxis.get(u.id) ?? new Map<string, number>())].some(([k]) => k === 'dot')
    cases.push(case_('Kafka: DoT tick is present', hasDot, String(hasDot)))
    cases.push(case_('Kafka: element fold includes DoT (sums to ownerDamage)', Math.round(sum) === Math.round(dmg), `${Math.round(sum)} vs ${Math.round(dmg)}`))
    cases.push(case_('Kafka: single element = Lightning', fold.size === 1 && fold.has('Lightning'), [...fold.keys()].join(',')))
  }

  return cases
}
