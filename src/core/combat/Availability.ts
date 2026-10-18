/**
 * §10 state machine / §19 ability availability.
 *
 * A unit is in one of several modes ('normal', Firefly's 'complete_combustion', ...). The mode
 * decides which *variant* of each base ability is offered (normal vs enhanced) and whether an
 * ability is offered at all — instead of scattering `hasBuff('cc_state')` / `ctx.someFlag` checks
 * across `decide()` and `perform()`.
 *
 * The state is DERIVED: a kit computes it from its own authoritative runtime state (buff, resource,
 * timer), so there is no second source of truth to keep in sync. `sim.availableAbilities(u)` returns
 * the current state; `DEFAULT_AVAILABILITY` is the all-normal fallback for kits without the hook.
 */
export type AbilityKind = 'basic' | 'skill' | 'ult'

/** active variant per base ability ('normal' | 'enhanced' | ...); `null` = ability not offered in
 *  this mode; an absent key means the ability keeps its normal variant. */
export type AbilityVariants = Partial<Record<AbilityKind, string | null>>

export interface AvailabilityState {
  /** the state-machine mode id, e.g. 'normal' | 'complete_combustion' */
  mode: string
  /** ability variants active in this mode */
  variant: AbilityVariants
}

/** all-normal fallback: every base ability offered at its normal variant (no kit hook) */
export const DEFAULT_AVAILABILITY: AvailabilityState = Object.freeze({ mode: 'normal', variant: Object.freeze({}) })

/** variant id offered for `kind` (defaults to 'normal' when the mode does not override it) */
export function abilityVariant(av: AvailabilityState, kind: AbilityKind): string | null {
  return kind in av.variant ? av.variant[kind]! : 'normal'
}

/** is the ability offered at all in this mode? (`variant: null` = suppressed) */
export function abilityAvailable(av: AvailabilityState, kind: AbilityKind): boolean {
  return abilityVariant(av, kind) !== null
}
