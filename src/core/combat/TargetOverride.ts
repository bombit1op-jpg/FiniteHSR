/**
 * §25 forced-target / Taunt override.
 *
 * A forced-target mark makes one attacker (usually an enemy) pick a specific unit for its
 * single-target attack selection instead of the aggro-weighted draw (`resolveTargets`).
 * Applied by "Taunt"-style effects (Mydei Throne of Bones, technique). The mark is keyed by
 * the ATTACKER's unit id and lasts a fixed number of the attacker's turns, then expires.
 * It only affects single-target selection — AoE attacks are not redirected.
 */
export interface TargetOverride {
  /** who applied the Taunt / forced-target mark */
  sourceId: string
  /** forced target — dead/off-field/filtered-out targets void the mark */
  targetId: string
  /** remaining attacker turns the mark holds (ticked down on the attacker's own turn) */
  turns: number
}

/** fresh mark (also refreshes an existing mark to a full window on re-apply) */
export function applyOverride(turns: number, sourceId: string, targetId: string): TargetOverride {
  return { sourceId, targetId, turns }
}

/** consume one attacker turn; `undefined` when the window expires (turns reached 0) */
export function tickOverride(m: TargetOverride): TargetOverride | undefined {
  const t = m.turns - 1
  return t <= 0 ? undefined : { ...m, turns: t }
}