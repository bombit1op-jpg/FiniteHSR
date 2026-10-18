import { run, all } from '../../_helpers/battle'
import { t, type Case } from '../../suites'
import { PatternAI, registerEnemyBehavior, unregisterEnemyBehavior } from '../../../src/core/enemy'
import { absorbWithShields } from '../../../src/core/combat/ShieldResolver'

/** L180 remaining shields — absorption used to live ONLY inside TurnManager.enemyHit, so every other
 *  HP-reducing path that lands on a character (enemy / counter abilities through the damage pipeline,
 *  DoT / Entanglement ticks, Aha chip damage) leaked straight through the shield while the buff still
 *  claimed to be absorbing. `ShieldResolver.absorbWithShields` is now the one character-shield hull
 *  (`reference/docs/combat_mechanics/Shield.md`: a shield absorbs DMG taken in place of HP, overflow
 *  is dealt to the character). These cases pin the hull's own semantics (spill across a stack, a
 *  broken shield is dropped, the old enemyHit emit quirks preserved) AND prove the enemy-*ability*
 *  pipeline now reaches it — an enemy that only casts abilities (never its built-in basic, which is
 *  the one path that already absorbed) emits SHIELD_ABSORBED only because the hull exists. */

// ---- direct hull semantics: a stub Simulator/target keeps this independent of any kit ----------
interface StubBuff { id: string; shield?: number; sourceId?: string }
function stub(buffs: StubBuff[]) {
  const target = { name: 'Ally', id: 'a1', buffs: buffs.map(b => ({ ...b })) } as unknown as { name: string; id: string; buffs: StubBuff[] }
  const events: { type: string; payload: Record<string, unknown> }[] = []
  const s = {
    find: (id: string) => ({ name: `src:${id}`, id }),
    logger: { emit: (e: { type: string; payload: Record<string, unknown> }) => events.push(e) },
    removeBuff: (_u: unknown, id: string) => { target.buffs = target.buffs.filter(b => b.id !== id) },
  }
  return { target, events, s: s as never, sim: s as never }
}

export default (): Case[] => {
  const cases: Case[] = []

  // partial absorb: hit smaller than the shield leaves the shield alive, nothing reaches HP
  {
    const { target, events, s } = stub([{ id: 'g_shield', shield: 500 }])
    const left = absorbWithShields(s, target as never, 300)
    const ab = events.filter(e => e.type === 'SHIELD_ABSORBED')
    cases.push(t.eq('hull: partial absorb leaves no HP overflow', left, 0))
    cases.push(t.eq('hull: partial absorb emits one SHIELD_ABSORBED', ab.length, 1))
    cases.push(t.eq('hull: partial absorb leaves the shield at 200', target.buffs[0]!.shield, 200))
    cases.push(t.eq('hull: partial absorb emits no SHIELD_BROKEN', events.filter(e => e.type === 'SHIELD_BROKEN').length, 0))
  }

  // overflow: a spent shield is dropped and the remainder spills through to HP
  {
    const { target, events, s } = stub([{ id: 'g_shield', shield: 100 }])
    const left = absorbWithShields(s, target as never, 250)
    cases.push(t.eq('hull: overflow past a shield reaches HP', left, 150))
    cases.push(t.eq('hull: an emptied shield is removed', target.buffs.length, 0))
    cases.push(t.eq('hull: an emptied shield emits SHIELD_BROKEN', events.filter(e => e.type === 'SHIELD_BROKEN').length, 1))
  }

  // a stack spills inner → next before anything reaches HP
  {
    const { target, events, s } = stub([{ id: 'inner', shield: 100 }, { id: 'outer', shield: 400 }])
    const left = absorbWithShields(s, target as never, 250)
    const spans = events.filter(e => e.type === 'SHIELD_ABSORBED').map(e => e.payload.id)
    cases.push(t.eq('hull: stack spill reaches HP only after both shields', left, 0))
    cases.push(t.eq('hull: stack is drained in order (inner then outer)', spans.join(','), 'inner,outer'))
    cases.push(t.eq('hull: only the emptied inner shield is dropped', target.buffs.map(b => b.id).join(','), 'outer'))
    cases.push(t.eq('hull: the outer shield keeps the untouched remainder', target.buffs[0]!.shield, 250))
  }

  // no shield = pure passthrough
  {
    const { target, events, s } = stub([])
    cases.push(t.eq('hull: unshielded target passes the hit through unchanged', absorbWithShields(s, target as never, 77), 77))
    cases.push(t.eq('hull: unshielded target emits nothing', events.length, 0))
  }

  // old enemyHit quirk kept: a 0 hit with a shield present still reports the shield (remaining unchanged)
  {
    const { target, events, s } = stub([{ id: 'g_shield', shield: 536 }])
    const left = absorbWithShields(s, target as never, 0)
    const ab = events.filter(e => e.type === 'SHIELD_ABSORBED')
    cases.push(t.eq('hull: a zero incoming hit is a no-op on HP', left, 0))
    cases.push(t.eq('hull: a zero hit still reports the standing shield once', ab.length, 1))
    cases.push(t.eq('hull: a zero hit leaves the shield value unchanged', target.buffs[0]!.shield, 536))
  }

  // ---- scenario: the enemy-ability pipeline path now reaches the hull -------------------------
  // This enemy uses ONLY a registered ability (never its built-in basic attack, the sole path that
  // absorbed before L180), so any SHIELD_ABSORBED can only come from the newly-hulled pipeline.
  const name = 'Hull Saboteur'
  registerEnemyBehavior(name, {
    abilities: [{ id: 'strike', name: 'Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 0.6, elem: 'Ice' }] }],
    ai: new PatternAI(['strike', 'strike', 'strike']),
  })
  const shielded = run({ team: [{ kitId: 'march7th', skillPriority: 1, stats: { hp: 50000, atk: 1000, def: 500, spd: 100 } }, { kitId: 'serval', stats: { hp: 50000, atk: 1000, def: 500, spd: 100 } }], enemy: { name, count: 1, hp: 5_000_000, spd: 150, level: 80, toughness: 0, weaknesses: ['Ice'], atk: 3000 }, cycles: 6 })
  const bare = run({ team: [{ kitId: 'danheng', stats: { hp: 50000, atk: 1000, def: 500, spd: 100 } }, { kitId: 'serval', stats: { hp: 50000, atk: 1000, def: 500, spd: 100 } }], enemy: { name, count: 1, hp: 5_000_000, spd: 150, level: 80, toughness: 0, weaknesses: ['Ice'], atk: 3000 }, cycles: 6 })
  unregisterEnemyBehavior(name)

  const absorbed = all(shielded, 'SHIELD_ABSORBED')
  const absorbedTotal = absorbed.reduce((sum, n) => sum + Number(n.payload.amount ?? 0), 0)
  const loss = (c: typeof shielded): number => c.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char').reduce((s, u) => s + Math.max(0, u.maxHp - u.hp), 0)

  cases.push(t.truthy('hull: an enemy ability (pipeline) is absorbed by an ally shield', absorbed.length >= 1, `absorbed=${absorbed.length}`))
  cases.push(t.truthy('hull: the pipeline absorb actually removed damage', absorbedTotal > 0, `total=${absorbedTotal}`))
  cases.push(t.truthy('hull: a shielded team loses less HP than the same team without a shielder', loss(shielded) < loss(bare), `${loss(shielded)} < ${loss(bare)}`))
  cases.push(t.eq('hull: invariants hold with absorption', shielded.sim.logger.verify().length, 0))

  return cases
}
