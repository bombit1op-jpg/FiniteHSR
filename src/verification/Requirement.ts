/**
 * One atomic, checkable claim about a kit (guide §46: requirements separate from the spec file so
 * a coverage report can count them per layer).
 *
 * A requirement is data: prose canon sentence + machine assertion. The runner turns it into a row.
 */

import type { Assertion } from './Assertion'
import type { KnownDeviation } from './Spec'

export type Layer = 'structure' | 'parameters' | 'ordering' | 'interactions'

/** guide §30 character verification matrix: the six ability slots a requirement can pin. */
export const ABILITY_SLOTS = ['base', 'basic', 'skill', 'talent', 'ultimate', 'technique'] as const
export type AbilitySlot = (typeof ABILITY_SLOTS)[number]

/** the stats a StateClause can pin; kept as a list so validateSlot can reject JSON typos instead
 *  of silently no-op'ing a clause nobody asked for. */
export const STATE_STATS = ['hp', 'energy', 'sp', 'broken', 'dead', 'buffs', 'av', 'toughness'] as const
export type StateStat = (typeof STATE_STATS)[number]
export type StateOp = 'eq' | 'atLeast' | 'atMost'

/** one expected quantity of the pre- or post-effect state (guide: Before / Event / After).
 *  `before` clauses assert the state BEFORE the fixture's events, `after` clauses the state AFTER
 *  them. Without mid-battle snapshots the runner evaluates `before` at battle start and `after`
 *  at battle end; when a fixture's battle log turns `snapshotOn` on, the nearest snapshot event
 *  brackets the requirement instead (elastic bracketing). */
export interface StateClause {
  /** unit name; targeting resolved like Assertion (kitId ? by kit : by name) */
  unit?: string
  kitId?: string
  stat: StateStat
  op: StateOp
  /** for `buffs`: expected count of buff lines (qualitative ids are the TraceMatcher's domain) */
  value: number
}

export interface Requirement {
  id: string
  layer: Layer
  /** prose = the canon sentence this came from, kept next to the assertion on purpose */
  claim: string
  assertion: Assertion
  /** fixtures this requirement applies to; omitted = all fixtures of the slot */
  fixtures?: string[]
  /** Before-state clauses (see `StateClause`) */
  before?: StateClause[]
  /** After-state clauses (see `StateClause`) */
  after?: StateClause[]
  deviation?: KnownDeviation
  /** Phase 3.5 (Paired/Allies): the expected outcome of an interaction check.
   *  `gap` — the assertion encodes canon, but the sim currently diverges (documented, non-fatal;
   *  flips to PROMOTE — i.e. ready for the mandatory gate — once the assertion starts passing).
   *  `blocked` — a missing engine feature prevents a meaningful assertion (`blockReason` says why);
   *  never evaluated, never counted as a pass. */
  status?: 'gap' | 'blocked'
  blockReason?: string
  /** guide §30: which ability slot this requirement exercises. Optional — when omitted the runner
   *  derives it from the assertion's `action` matcher (basic/skill/ultimate); base/talent/technique
   *  have no action tag, so a spec must set this explicitly to claim them. Feeds `abilityCoverage`. */
  ability?: AbilitySlot
}

export const LAYERS: Layer[] = ['structure', 'parameters', 'ordering', 'interactions']
