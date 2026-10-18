/**
 * Timeline — action-value math and cycle accounting (ref: engine §3 SPDepl, §4 Action Value).
 * Pure: no Simulator state, operates on Unit.av + eff spd.
 * Canonical home of the AV formulas — src/core/simulator.ts delegates here (baseAv/advance/delay/
 * rescaleAv), so there is a single source of truth. The HSR convention here is
 *   advance: av -= baseAv*pct  (NOT the ref's pure av*(1-pct), see simulator.advance comment),
 *   delay:   av += baseAv*pct.  Changing them alters the 473k-battle parity.
 */
import type { Unit } from '../entities/Unit'
import { eff } from '../combat/StatResolver'

export const BASE_AV = 10000

/** action value for a unit = BASE_AV / effective SPD (floor 1 to avoid div-by-zero). */
export function baseAv(u: Unit): number {
  return BASE_AV / Math.max(1, eff(u).spd)
}

/** Action Advance: cut remaining AV by pct of a base-action-value slice, never below 0. */
export function advance(u: Unit, pct: number): void {
  u.av = Math.max(0, u.av - baseAv(u) * pct)
}

/** Action Delay: push remaining AV back by pct of a base-action-value slice. */
export function delay(u: Unit, pct: number): void {
  u.av += baseAv(u) * pct
}

/** MoC cycle of an absolute wave-relative elapsed AV: first cycle 150, then 100 each. */
export function cycleIndexOf(av: number): number {
  return av < 150 ? 0 : 1 + Math.floor((av - 150) / 100)
}

/** total AV budget for `cycles` MoC cycles (first 150, then 100). */
export function totalBudget(cycles: number): number {
  return 150 + (cycles - 1) * 100
}

/** re-base a unit's AV after a SPD change, canceling the constant buff term (simulator.setSpeedDynamic). */
export function rescaleAv(u: Unit, spdNew: number): void {
  const oldEff = eff(u).spd
  const oldBase = u.base.spd
  if (oldEff <= 0) { u.base.spd = spdNew; return }
  u.base.spd = spdNew
  u.av = u.av * (oldEff / Math.max(1, spdNew + (oldEff - oldBase)))
}