/**
 * §9 PERSISTENT / PER_BATTLE accumulator — the typed choke-point for "gained this battle" running
 * totals (Gilgamesh A2 Hero's Hauteur, Saber A6 Crown of the Star / E2 The Lost Oath).
 *
 * A battle-history accumulator counts a repeated gain over the WHOLE battle and is deliberately NOT
 * a resource: it never spends, and it must survive the depletion of whatever it counts (Interest /
 * Core Resonance clearing, buff expiry, waves). Its lifetime is PER_BATTLE — it resets only because a
 * fresh run builds a fresh KitRuntime.
 *
 * Semantics: monotone non-decreasing, clamped to [0, cap?]. A non-positive delta is ignored.
 * The value lives at the given key on the owner's KitRuntime, so it appears in the debug `R:{...}`
 * dump and the auditor's rt-key inventory like any other runtime field.
 */
export type RuntimeBag = Record<string, unknown>

export interface AccumulatorOpts {
  /** upper bound the running total may reach (canon caps like +150% CRIT DMG = 6 stacks) */
  cap?: number
}

/** add a positive gain to the named accumulator, returning the new total (0 for a non-positive delta) */
export function accAdd(rt: RuntimeBag, key: string, amount: number, opts: AccumulatorOpts = {}): number {
  if (!(amount > 0)) return accGet(rt, key)
  const next = accGet(rt, key) + amount
  return (rt[key] = opts.cap != null ? Math.min(opts.cap, next) : next)
}

/** read the current running total of the named accumulator (0 when never touched this battle) */
export function accGet(rt: RuntimeBag, key: string): number {
  return (rt[key] as number) ?? 0
}
