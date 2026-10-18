/**
 * §8 HP semantics / §17 typed HPChange — the single typed HP-mutation choke-point.
 *
 * These cases pin the clamp policy per kind (cost/drain floor at 1 HP, heal/revive cap at maxHp,
 * redirect floors at 0, spawn/init unrestricted) and the returned applied-delta contract. A kit
 * self-cost converted to `hpChange` must reproduce the old `Math.min(hp-1, amount)` behaviour.
 */

import { applyHpChange, type HpChangeKind } from '../../src/core/combat/HpChange'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const mk = (hp: number, maxHp = 1000): Unit => ({ hp, maxHp } as Unit)

export default (): Case[] => {
  const cases: Case[] = []
  const after = (hp: number, delta: number, kind: HpChangeKind, opts?: { floor?: number; ceil?: number }): Unit => {
    const u = mk(hp)
    applyHpChange(u, delta, kind, opts)
    return u
  }

  cases.push(t.eq('cost floors at 1 HP', after(100, -500, 'cost').hp, 1))
  cases.push(t.eq('cost returns the applied loss', applyHpChange(mk(100), -500, 'cost'), -99))
  cases.push(t.eq('cost never clamps a small loss', after(100, -40, 'cost').hp, 60))
  cases.push(t.eq('drain floors at 1 HP', after(100, -500, 'drain').hp, 1))
  cases.push(t.eq('cost floor can be overridden to 0 (Little Ica)', after(10, -50, 'cost', { floor: 0 }).hp, 0))
  cases.push(t.eq('redirect floors at 0 HP', after(50, -80, 'redirect').hp, 0))
  cases.push(t.eq('heal caps at maxHp', after(900, 500, 'heal').hp, 1000))
  cases.push(t.eq('heal returns the applied restore', applyHpChange(mk(900), 500, 'heal'), 100))
  cases.push(t.eq('revive caps at maxHp', after(10, 5000, 'revive').hp, 1000))
  cases.push(t.eq('set applies an absolute value via delta', after(100, 400 - 100, 'set').hp, 400))
  cases.push(t.eq('damage kind floors at 0 by default', after(50, -80, 'damage').hp, 0))
  cases.push(t.eq('spawn/init are unrestricted (no floor)', after(10, -50, 'spawn').hp, -40))

  return cases
}
