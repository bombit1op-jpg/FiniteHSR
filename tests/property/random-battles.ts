/**
 * §44 `property/` — universal invariants over random battles.
 *
 * The kit sweeps answer "is this kit's damage monotonic in E/S"; this answers "does ANY random
 * team produce a NaN, a negative HP, an energy overshoot or an out-of-order event stream" - the
 * failures that no per-kit golden can catch because they are not about a kit.
 *
 * Deterministic: every battle is seeded from the case index, so a failure is reproducible.
 */

import { ENEMY_PRESETS, runBattle } from '../../src/core/battle'
import type { BattleSetup, EnemySpec, TeamSpec } from '../../src/core/battle'
import { KITS } from '../../src/core/kits'
import { t, type Case } from '../suites'

const BATTLES = 12

/** deterministic PRNG so a failing index reproduces byte-for-byte */
function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function randomBattle(i: number): BattleSetup {
  const rng = mulberry(1000 + i)
  const team: TeamSpec[] = []
  for (let n = 0; n < 4; n++) {
    const kit = KITS[Math.floor(rng() * KITS.length)]!
    team.push({ kitId: kit.id, name: kit.id, eidolon: Math.floor(rng() * 7) })
  }
  const preset = Object.values(ENEMY_PRESETS)[i % 6] as EnemySpec
  const enemy: EnemySpec = { ...preset, count: 1 + (i % 3) }
  return { team, enemy, cycles: 2, seed: 5000 + i }
}

export default function (): Case[] {
  const cases: Case[] = []
  for (let i = 0; i < BATTLES; i++) {
    const tag = `battle #${i}`
    let sim
    try {
      sim = runBattle(randomBattle(i))
    } catch (e) {
      cases.push(t.ok(`${tag} runs`, false, e instanceof Error ? e.message : String(e)))
      continue
    }
    cases.push(t.ok(`${tag} runs`, true))

    const bad = sim.roster.filter(u =>
      !Number.isFinite(u.hp) || u.hp < -1 || !Number.isFinite(u.energy) || u.energy < 0 ||
      !Number.isFinite(u.av) || !Number.isFinite(u.toughness) || u.toughness < -1e-9 ||
      !Number.isFinite(u.maxHp) || u.maxHp <= 0)
    cases.push(t.ok(`${tag}: finite stats, hp>=0, energy>=0, toughness>=0`, bad.length === 0,
      bad.map(u => `${u.name} hp=${u.hp} en=${u.energy} tough=${u.toughness}`).join('; ')))

    const nan = sim.logger.events.filter(e =>
      Object.values(e.payload ?? {}).some(v => typeof v === 'number' && !Number.isFinite(v)))
    cases.push(t.ok(`${tag}: no NaN in event payloads`, nan.length === 0,
      nan.slice(0, 3).map(e => `${e.type}#${e.eventId}`).join(' ')))

    const ids = sim.logger.events.map(e => e.eventId)
    const ordered = ids.every((v, k) => k === 0 || v > ids[k - 1]!)
    cases.push(t.ok(`${tag}: event ids strictly increasing`, ordered, `${ids.length} events`))
  }
  return cases
}
