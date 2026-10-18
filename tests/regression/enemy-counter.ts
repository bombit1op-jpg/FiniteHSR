import { prepareBattle } from '../../src/core/battle'
import { SimpleAI, registerEnemyBehavior, unregisterEnemyBehavior, enemyCounterOf, type EnemyAbilityDefinition } from '../../src/core/enemy'
import { case_, type Case } from '../suites'

/** L185 Reflected Damage (guide №60 — stale ref) → engine primitive: enemy Counter state.
 *  Canon: Silvermane Lieutenant "Shield Reflect" (hsr-data/enemies.json) — "When attacked by a
 *  single character, acts immediately and casts 'Pierce' on the attacker." Counter state is
 *  entered by an enemy ability effect `{ op: 'counter' }`; any SINGLE-target ally-character hit
 *  on the countering enemy casts the counter ability at the attacker once per attack (attackSeq,
 *   §5). Blast/AoE/Random attacks never trigger (they are not "an attack by a single character"). */

const PIERCE: EnemyAbilityDefinition = {
  id: 'pierce', name: 'Pierce', targetRule: 'single',
  effects: [{ op: 'attack', mult: 1 }],
}
const reflect = (exit: 'once' | 'manual'): EnemyAbilityDefinition => ({
  id: 'shield_reflect', name: 'Shield Reflect', aiPriority: 10,
  effects: [{ op: 'counter', ability: PIERCE, exit }],
})
const ENEMY = 'Silvermane Lieutenant'

const SUP = { hp: 30000, atk: 2000, def: 1000, spd: 100 }

/** namespaced enemy name per exit rule, so each armed() uses exactly the registered behavior */
const name = (exit: 'once' | 'manual') => `${ENEMY} (${exit})`

/** register a single-exit behavior, run the battle, arm the Counter state via the enemy's own
 *  turn (SimpleAI picks Shield Reflect), then revoke the registration. */
const armed = (exit: 'once' | 'manual') => {
  const n = name(exit)
  registerEnemyBehavior(n, { abilities: [reflect(exit), PIERCE], ai: new SimpleAI() })
  try {
    const s = prepareBattle({
      team: [{ kitId: 'hook', stats: { ...SUP }, skillPriority: 0 }],
      enemy: { name: n, count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 0, weaknesses: ['Fire'] as never, atk: 60 },
      cycles: 1, seed: 7,
      log: { debug: 7 },
    })
    s.initBattle()
    const h = s.roster.find(u => u.kitId === 'hook')!
    const e = s.roster.find(u => u.side === 'enemy')!
    s.enemyTurn(e, 1)
    return { s, h, e }
  } finally {
    unregisterEnemyBehavior(n)
  }
}
type Ctx = ReturnType<typeof armed>
const castsSince = (s: Ctx['s'], from: number, e: Ctx['e'], h: Ctx['h']): number =>
  s.logger.events.slice(from).filter(ev => ev.type === 'DAMAGE_DEALT' && ev.source === e.name && ev.target === h.name).length
const hit = (s: Ctx['s'], h: Ctx['h'], e: Ctx['e'], type: 'basic' | 'skill' | 'fua', split?: number[]) =>
  s.hit(h, e, { type, mult: 1, elem: 'Fire', canCrit: false, label: type, ...(split ? { split } : {}) })

export default (): Case[] => {
  const cases: Case[] = []
  // wiring: `counter` ability effect arms the state on the enemy's own turn
  {
    const { e } = armed('once')
    cases.push(case_('counter: A ability effect "counter" arms the state', enemyCounterOf(e) !== undefined, String(enemyCounterOf(e)?.ability.name)))
  }
    // single-target attack fires once, cast lands on the attacker
    {
      const { s, h, e } = armed('once')
      const before = h.hp
      const from = s.logger.events.length
      hit(s, h, e, 'basic')
      cases.push(case_('counter: B single-target attack is countered on the attacker',
        castsSince(s, from, e, h) === 1 && h.hp < before, `${castsSince(s, from, e, h)} casts, hp ${before}→${h.hp}`))
    }
    // exit 'once': state clears after the first fire — a second (different) attack is NOT countered
    {
      const { s, h, e } = armed('once')
      const from = s.logger.events.length
      hit(s, h, e, 'basic')
      hit(s, h, e, 'skill')
      cases.push(case_('counter: C exit once clears after firing', castsSince(s, from, e, h) === 1 && enemyCounterOf(e) === undefined, `${castsSince(s, from, e, h)} casts, state=${enemyCounterOf(e) !== undefined}`))
    }
    // exit 'manual': persists — a fresh attack (different attackSeq) fires again
    {
      const { s, h, e } = armed('manual')
      const from = s.logger.events.length
      hit(s, h, e, 'basic')
      hit(s, h, e, 'skill')
      cases.push(case_('counter: D exit manual persists across attacks', castsSince(s, from, e, h) === 2, `${castsSince(s, from, e, h)} casts`))
    }
    // a multi-digit split single-target attack is one attack → one cast
    {
      const { s, h, e } = armed('manual')
      const from = s.logger.events.length
      hit(s, h, e, 'basic', [0.3, 0.7])
      cases.push(case_('counter: F multi-digit split fires once', castsSince(s, from, e, h) === 1, `${castsSince(s, from, e, h)} casts`))
    }
    // Blast / AoE are NOT single-character attacks → never counter
    {
      const { s, h, e } = armed('manual')
      const from = s.logger.events.length
      s.hitBlast(h, e, { type: 'basic', mult: 1, elem: 'Fire', canCrit: false, label: 'blast' }, { type: 'basic', mult: 0.5, elem: 'Fire', canCrit: false, label: 'blast adj' })
      s.hitAoe(h, { type: 'basic', mult: 1, elem: 'Fire', canCrit: false, label: 'aoe' })
      cases.push(case_('counter: G blast/aoe never trigger', castsSince(s, from, e, h) === 0, `${castsSince(s, from, e, h)} casts`))
    }
    // the counter cast itself is an enemy attack on an ally — no recursion, state still armed (manual)
    {
      const { s, h, e } = armed('manual')
      const from = s.logger.events.length
      hit(s, h, e, 'basic')
      cases.push(case_('counter: H no self-trigger on the counter cast', castsSince(s, from, e, h) === 1 && enemyCounterOf(e) !== undefined, `${castsSince(s, from, e, h)} casts, state=${enemyCounterOf(e) !== undefined}`))
    }
    // same-type consecutive hits: the counter cast is an interleaving enemy attack, so each hit is
    // a fresh attackSeq and re-fires (basic, basic, skill → 3 casts); the once-per-attackSeq gate
    // is pinned by the multi-digit F instead (one hit() → one cast, never two).
    {
      const { s, h, e } = armed('manual')
      const from = s.logger.events.length
      hit(s, h, e, 'basic')
      hit(s, h, e, 'basic')
      hit(s, h, e, 'skill')
      cases.push(case_('counter: E interleaving counter casts = fresh attacks each', castsSince(s, from, e, h) === 3, `${castsSince(s, from, e, h)} casts`))
    }
  return cases
}