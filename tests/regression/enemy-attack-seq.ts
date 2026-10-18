import { prepareBattle } from '../../src/core/battle'
import { case_, type Case } from '../suites'

/** §5/§9 — attack identity for the BUILT-IN enemy action.
 *  A declarative enemy ability routes through `sim.hit`, which mints `attackSeq` (DamagePipeline).
 *  The built-in attack (`TurnManager.defaultEnemyAttack` → `enemyHit`) bypasses the pipeline, so it
 *  must mint its own identity — otherwise EVERY once-per-attack gate (`sim.attackNo()`: Mortenax
 *  Blade A1, Jingliu talent tally) sees one stale sequence for the whole battle, and a multi-target
 *  AoE pays such a gate once per TARGET instead of once per action. */

const ENEMY = 'Seq Test Foe'

const setup = () => {
  const s = prepareBattle({
    team: [
      { kitId: 'hook', stats: { hp: 30000, atk: 2000, def: 1000, spd: 100 }, skillPriority: 0 },
      { kitId: 'arlan', stats: { hp: 30000, atk: 2000, def: 1000, spd: 90 }, skillPriority: 0 },
    ],
    enemy: { name: ENEMY, count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'] as never, atk: 60 },
    cycles: 1, seed: 7,
  })
  s.initBattle()
  const e = s.roster.find(u => u.side === 'enemy')!
  return { s, e }
}

export default (): Case[] => {
  const cases: Case[] = []

  // two consecutive built-in actions mint two distinct attack identities
  {
    const { s, e } = setup()
    const a = s.attackNo()
    s.enemyTurn(e, 1)
    const b = s.attackNo()
    s.enemyTurn(e, 2)
    const c = s.attackNo()
    cases.push(case_('built-in enemy action mints a fresh attackSeq', b > a && c > b, `${a} → ${b} → ${c}`))
  }

  // a multi-target built-in action (tc%3===0, 2+ targets → AoE) is ONE attack, not one per target
  {
    const { s, e } = setup()
    const before = s.attackNo()
    s.enemyTurn(e, 3)
    const after = s.attackNo()
    cases.push(case_('multi-target built-in action mints exactly ONE attackSeq', after - before === 1, `Δ${after - before}`))
  }

  return cases
}
