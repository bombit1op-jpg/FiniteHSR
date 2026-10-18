import type { Unit } from '../entities/Unit'
import { baseAv } from './Timeline'

/**
 * Timeline / Action Queue (ref engine §6). The sim's queue is implicit — the next actor is the
 * living unit with the smallest AV, tie-broken by roster order (= team slot order, the HSR
 * convention). No heap: the roster is small and rescans are cheap.
 *
 * The queue only SHUFFLES time; it never triggers actions itself. `takeTurn` of the returned
 * unit belongs to the BattleEngine host.
 */
export class ActionQueue {
  /** the next acting unit among living units, or null when empty. Tie-break: earlier roster slot. */
  next(alive: Unit[]): Unit | null {
    if (!alive.length) return null
    let m = alive[0]
    for (let i = 1; i < alive.length; i++) if (alive[i].av < m.av) m = alive[i]
    return m
  }

  /** advance the shared clock by the next actor's AV, pulling everyone else down to 0-relative. */
  advanceTime(alive: Unit[], next: Unit): number {
    const delta = next.av
    for (const u of alive) u.av -= delta
    return delta
  }

  /** re-base a unit at its SPD position after a wave transition / end-of-lap reset. */
  rebase(u: Unit): void {
    u.av = baseAv(u)
  }
}