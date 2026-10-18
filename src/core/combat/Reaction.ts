/**
 * §13 reaction window — an armed counter/parry state that stays up until its charges are consumed.
 *
 * A window is exactly `{ charges }` stored under one KitRuntime key: `armWindow` (re)arms/refills it,
 * `consumeWindow` spends one charge per eligible trigger and reports whether it was armed, and
 * `disarmWindow` drops it (owner turn start / explicit clear).
 *
 * Replaces the ad-hoc `rt.counterEnhanced + rt.counterCharges` pair (Clara Svarog Counter) and the
 * `rt.parry` boolean (Yunli Intuit) plus their hand-rolled "consume → forget to disarm at 0" branches.
 */
export interface ReactionWindow {
  /** remaining triggers; the window is armed while > 0 */
  charges: number
}

type Rt = Record<string, unknown>

/** (re)arm the window with `charges` triggers (re-arming overwrites the previous window) */
export function armWindow(rt: Rt, key: string, charges: number): void {
  rt[key] = { charges }
}

/** is the window armed (charges > 0)? */
export function windowArmed(rt: Rt, key: string): boolean {
  const w = rt[key] as ReactionWindow | undefined
  return !!w && w.charges > 0
}

/** charges still in the window (0 when disarmed/never armed) */
export function windowCharges(rt: Rt, key: string): number {
  const w = rt[key] as ReactionWindow | undefined
  return w?.charges ?? 0
}

/** spend one charge if armed (returns true, count never goes below 0) */
export function consumeWindow(rt: Rt, key: string): boolean {
  const w = rt[key] as ReactionWindow | undefined
  if (!w || w.charges <= 0) return false
  w.charges -= 1
  return true
}

/** drop the window immediately */
export function disarmWindow(rt: Rt, key: string): void {
  delete rt[key]
}