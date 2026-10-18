import type { Elem } from '../entities/Unit'

/** §51 — data / variant / instance split for enemies.
 *
 *  Raw `hsr-data/enemies.json` is one row per *variant* (a `title`; one `baseName`
 *  may carry several mode/phase variants). The three layers below keep the identity,
 *  the mode-specific override and the runtime view apart (`Не хранить raw data и runtime
 *  state в одном объекте`). */

export type EnemyRank = 'mob' | 'elite' | 'boss'

/** one raw level row, numbers already parsed from the wiki strings */
export interface EnemyStatRow {
  level: number
  hp: number
  atk: number
  def: number
  spd: number
  /** wiki "Eff.H.R." (EHR), fraction */
  effectHitRate: number
  /** wiki "Eff.RES", fraction */
  effectRes: number
}

/** level → row. `undefined` (never a zero-filled table) when raw data has no stats (§52). */
export type EnemyStatTable = Record<number, EnemyStatRow>

/** §52.2 damage RES profile — 7 elements; `allType` optional (absent in current raw data) */
export type ResistanceProfile = Partial<Record<Elem | 'allType', number>>

/** Debuff RES — raw table has no column labels, so values stay unlabeled; consumers use the wiki
 *  column order [Bleed, Burn, Frozen, Shock, Wind Shear, Entanglement, Imprisonment, Control Effects]. */
export interface EffectResistanceProfile {
  headers: string[]
  /** fractions, raw column order (see interface doc) */
  values: number[]
}

/** one `N ×k` group; a single bar is `{ max: N, count: 1 }` */
export interface ToughnessSegment {
  max: number
  count: number
}

/** §52.1 multi-bar / segmented / phase-specific toughness. Never "one integer forever". */
export interface ToughnessModel {
  /** raw infobox string, verbatim */
  raw: string
  /** first parsed bar max — the value the pre-§52 engine used as scalar toughness */
  primary: number
  /** every `N ×k` group, in raw order */
  segments: ToughnessSegment[]
  /** present only when the raw string annotated phases ("(Phase 1/2) … (Phase 3)") */
  phases?: { phase: string; segments: ToughnessSegment[] }[]
  /** raw string carried no parseable number (wiki omission) — explicit, not silent 0 */
  unknown: boolean
}

export interface EnemySkillData {
  name: string
  tag: string
  description: string
}

/** §51 — constant identity/properties of an enemy concept (grouped by `baseName`) */
export interface EnemyDefinition {
  id: string
  baseName: string
  faction: string[]
  type: Elem[]
  defaultRank: EnemyRank
  weaknesses: Elem[]
  resistanceProfile: ResistanceProfile
  effectResistanceProfile?: EffectResistanceProfile
  baseSkills: EnemySkillData[]
  baseToughnessModel: ToughnessModel
  variants: EnemyVariant[]
}

/** §51 — one mode/phase version of a definition (a raw row) */
export interface EnemyVariant {
  variantId: string
  title: string
  baseName: string
  /** '' for the base/Normal page; otherwise e.g. 'Apocalyptic Shadow', 'Bug', 'Phase 3' */
  mode: string
  url?: string
  rank: EnemyRank
  /** undefined = raw data has no stat table for this variant (explicit, §52) */
  stats?: EnemyStatTable
  weaknesses: Elem[]
  resistanceProfile: ResistanceProfile
  effectResistanceProfile?: EffectResistanceProfile
  toughnessModel: ToughnessModel
  skills: EnemySkillData[]
  gameplayNotes: string
}

/** §52 — the stat keys a resolver can produce */
export type EnemyStatKey = 'hp' | 'atk' | 'def' | 'spd' | 'effectHitRate' | 'effectRes'

/** §52 modifiers layered over the level table (each defaults to 1) */
export interface EnemyStatCtx {
  level: number
  stageMul?: Partial<Record<EnemyStatKey, number>>
  phaseMul?: Partial<Record<EnemyStatKey, number>>
  runtimeMul?: Partial<Record<EnemyStatKey, number>>
}

/** §51 — the resolved, data-only instance view. Mutable runtime (buffs, phases, charges,
 *  linked entities …) lives on the battle `Unit`, not here — that is §53+ scope. */
export interface EnemyInstanceData {
  id: string
  definitionId: string
  variantId: string
  level: number
  hp?: number
  atk?: number
  def?: number
  spd?: number
  effectRes?: number
  weaknesses: Elem[]
  resistances: ResistanceProfile
  effectResistance?: EffectResistanceProfile
  toughness: ToughnessModel
  rank: EnemyRank
}
