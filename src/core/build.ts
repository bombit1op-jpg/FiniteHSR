/**
 * BuildSpec — declarative per-character build (guide §49 Phase B, item 11 "BuildSpec").
 *
 * A BuildSpec names a character's equipment in dataset terms — light cone (+superimposition),
 * cavern relic set (+piece count), a second set for 2+2, planar ornament set, or explicit
 * per-slot pieces — plus the build knobs that are not gear (stat overrides, eidolon, ability
 * levels, minor traces). It compiles to the runtime `GearConfig` + the matching `TeamSpec` fields,
 * so a fixture can *name* a build instead of hand-assembling a `GearConfig`, and unknown dataset
 * ids are reported rather than silently ignored (the raw gear path never validated them).
 *
 * Set-count semantics reuse the engine's legacy mode (`aggregateGear`): each id in `relicSets`
 * counts as two cavern pieces, so `[id]` = 2pc and `[id, id]` = 4pc.
 */
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from './gear'
import type { AbilityLevels, GearConfig, RelicPiece } from './entities/Unit'
import type { TeamSpec } from './battle'

export interface BuildSpec {
  /** light cone id (see `LIGHT_CONES`) */
  cone?: string
  /** superimposition rank 1-5 (default 1) */
  si?: number
  /** cavern relic set id (see `RELIC_SETS`) */
  relic?: string
  /** second cavern set for a 2+2 build (see `RELIC_SETS`) */
  relic2?: string
  /** cavern pieces of `relic` (default 4) */
  relicCount?: 2 | 4
  /** planar ornament set id (see `PLANAR_SETS`) */
  planar?: string
  /** explicit per-slot pieces — overrides the set shorthand above */
  pieces?: RelicPiece[]
  /** direct stat overrides applied to the character on top of gear */
  stats?: TeamSpec['stats']
  eidolon?: number
  levels?: AbilityLevels
  traces?: boolean
}

export interface ResolvedBuild {
  gear?: GearConfig
  stats?: TeamSpec['stats']
  eidolon?: number
  levels?: AbilityLevels
  traces?: boolean
}

/** declarative build → runtime `GearConfig` + the non-gear build fields */
export function resolveBuild(b: BuildSpec): ResolvedBuild {
  const gear: GearConfig = {}
  let hasGear = false
  if (b.cone) { gear.coneId = b.cone; gear.si = b.si ?? 1; hasGear = true }
  const sets: string[] = []
  if (b.relic) for (let i = 0; i < (b.relicCount === 2 ? 1 : 2); i++) sets.push(b.relic)
  if (b.relic2) sets.push(b.relic2)
  if (sets.length) { gear.relicSets = sets; hasGear = true }
  if (b.planar) { gear.planarId = b.planar; hasGear = true }
  if (b.pieces?.length) { gear.pieces = b.pieces; hasGear = true }

  const out: ResolvedBuild = {}
  if (hasGear) out.gear = gear
  if (b.stats) out.stats = b.stats
  if (b.eidolon !== undefined) out.eidolon = b.eidolon
  if (b.levels) out.levels = b.levels
  if (b.traces !== undefined) out.traces = b.traces
  return out
}

/** dataset ids referenced by a build that do not exist. Empty = every id resolves. */
export function validateBuild(b: BuildSpec): string[] {
  const bad: string[] = []
  if (b.cone && !LIGHT_CONES.some(l => l.id === b.cone)) bad.push(`cone:${b.cone}`)
  if (b.relic && !RELIC_SETS.some(s => s.id === b.relic)) bad.push(`relic:${b.relic}`)
  if (b.relic2 && !RELIC_SETS.some(s => s.id === b.relic2)) bad.push(`relic2:${b.relic2}`)
  if (b.planar && !PLANAR_SETS.some(s => s.id === b.planar)) bad.push(`planar:${b.planar}`)
  for (const p of b.pieces ?? []) {
    const planarSlot = p.slot === 'sphere' || p.slot === 'rope'
    const known = planarSlot ? PLANAR_SETS.some(s => s.id === p.setId) : RELIC_SETS.some(s => s.id === p.setId)
    if (!known) bad.push(`piece:${p.setId}`)
  }
  return bad
}

/** fold a member's `build` into its explicit `TeamSpec` fields — explicit fields always win */
export function applyBuild<T extends TeamSpec>(t: T): T {
  if (!t.build) return t
  const r = resolveBuild(t.build)
  return {
    ...t,
    stats: t.stats ?? r.stats,
    gear: t.gear ?? r.gear,
    eidolon: t.eidolon ?? r.eidolon,
    levels: t.levels ?? r.levels,
    traces: t.traces ?? r.traces,
  }
}
