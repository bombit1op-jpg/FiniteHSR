// Relic rating ported from Fribbels hsr-optimizer (reference/hsr-optimizer-main).
// Faithful subset: per-relic percent score + letter grade. See AGENTS.md §Gear Rules.
//
// Model:
//   contribution(stat) = weight(stat) * (6.48 / highRoll(stat))    -> weight * 6.48 per high roll
//   rawScore           = Σ subValue * contribution(sub)
//   percentScore       = truncate10ths(round5(rawScore / idealScore * 100))
//   idealScore         = optimal packing of the 6 substat rolls (per part/mainstat)
import { SUBSTAT_TIERS, SLOT_MAINS, substatValue } from './gear'
import { RELIC_WEIGHTS, type RelicScoringMeta } from './relicWeights'

/** flat HP/ATK/DEF weight is derived from the corresponding percent weight (Fribbels FLAT_STAT_SCALING). */
const FLAT_SCALING = 0.4
const PCT_TO_FLAT: Record<string, string> = { hpPct: 'hpFlat', atkPct: 'atkFlat', defPct: 'defFlat' }

/** the 6.48 unit = high roll of BE/CD in Fribbels percent-as-number units; scale-free in the ratio. */
const POTENTIAL_UNIT = 6.48

export type RelicSlot = 'head' | 'hands' | 'body' | 'feet' | 'sphere' | 'rope'

export type SubRoll = { stat: string; tier: 0 | 1 | 2; rolls: number; spread?: number[] }

type Meta = {
  stats: Record<string, number>
  parts: Record<string, string[]>
  sortedSubstats: [string, number][]
}

const highRoll = (stat: string): number => SUBSTAT_TIERS[stat]?.[2] ?? 0

/** contributions[stat] = weight * 6.48/highRoll  (raw-value -> potential unit scale) */
function contributions(meta: Meta): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [stat, weight] of meta.sortedSubstats) {
    out[stat] = weight * (POTENTIAL_UNIT / highRoll(stat))
  }
  return out
}

/** weighted potential per high-roll tier: weight * value * (6.48/high) ; mid/low scale off their roll values. */
function potential(meta: Meta, tier: 0 | 1 | 2): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [stat, weight] of meta.sortedSubstats) {
    const v = SUBSTAT_TIERS[stat]?.[tier] ?? 0
    out[stat] = weight * v * (POTENTIAL_UNIT / highRoll(stat))
  }
  return out
}

export function buildMeta(slug: string): Meta | null {
  const raw: RelicScoringMeta | undefined = RELIC_WEIGHTS[slug]
  if (!raw) return null
  const stats: Record<string, number> = {}
  for (const [k, v] of Object.entries(raw.stats)) stats[k] = Math.min(1, Math.max(0, v))
  // Fribbels applyFlatStatScaling: flat = pct * 0.4 (overwrites any explicit flat weight)
  for (const [pct, flat] of Object.entries(PCT_TO_FLAT)) stats[flat] = (stats[pct] || 0) * FLAT_SCALING
  const sortedSubstats = (Object.entries(stats) as [string, number][])
    .filter(([s]) => s in SUBSTAT_TIERS)
    .sort((a, b) => b[1] - a[1])
  return { stats, parts: raw.parts, sortedSubstats }
}

const hasMainStat = (slot: RelicSlot): boolean => slot !== 'head' && slot !== 'hands'

function mainStatWeight(slot: RelicSlot, main: string, meta: Meta): number {
  if (!hasMainStat(slot)) return 0
  if ((meta.parts[slot] ?? []).includes(main)) return 1
  return meta.stats[main] ?? 0
}

enum HandlingCase { SINGLE_STAT, HP, ATK, DEF, NORMAL, NONE }

function handlingCase(meta: Meta): HandlingCase {
  const s = meta.sortedSubstats
  if (!s[0] || s[0][1] === 0) return HandlingCase.NONE
  if (!s[1] || s[1][1] === 0) return HandlingCase.SINGLE_STAT
  if (s[2] && s[2][1] > 0) return HandlingCase.NORMAL
  const a = s[0][0]
  const b = s[1][0]
  const pair = (p: string, flat: string) => (a === flat && b === p) || (a === p && b === flat)
  if (pair('hpPct', 'hpFlat')) return HandlingCase.HP
  if (pair('atkPct', 'atkFlat')) return HandlingCase.ATK
  if (pair('defPct', 'defFlat')) return HandlingCase.DEF
  return HandlingCase.NORMAL
}

/** Fribbels resolveOptimalMainstat — needed only for the NORMAL case's substat pool. */
function resolveOptimalMainstat(slot: RelicSlot, main: string, meta: Meta): string {
  const optimal = meta.parts[slot] ?? []
  if (optimal.includes(main) || meta.stats[main] === 1 || !hasMainStat(slot)) return main
  const possible = SLOT_MAINS[slot] ?? []
  const entries = Object.keys(meta.stats)
    .map((stat) => [stat, optimal.includes(stat) || meta.stats[stat] === 1 ? 1 : meta.stats[stat] ?? 0] as [string, number])
    .sort((a, b) => b[1] - a[1])
  const idx = entries.findIndex(([name]) => possible.includes(name))
  if (idx < 0) return main
  const topWeight = entries[idx][1]
  let chosen = entries[idx][0]
  let isIdeal = false
  let isSubstat = true
  for (let i = idx; i < entries.length; i++) {
    const [name, weight] = entries[i]
    if (weight !== topWeight) break
    if (!possible.includes(name)) continue
    const newIdeal = optimal.includes(name)
    const newSubstat = name in SUBSTAT_TIERS
    if (isIdeal && !newIdeal) continue
    if (!isSubstat && newSubstat) continue
    if (isIdeal === newIdeal && isSubstat === newSubstat) continue
    chosen = name
    isIdeal = newIdeal
    isSubstat = newSubstat
  }
  return chosen
}

/** Fribbels computeOptimalScore — max substat score for a part/main (Infinity when no valid substats). */
export function computeOptimalScore(slot: RelicSlot, main: string, meta: Meta): number {
  const high = potential(meta, 2)
  const caseKind = handlingCase(meta)
  if (caseKind === HandlingCase.NONE) return Infinity
  if (caseKind === HandlingCase.SINGLE_STAT) {
    const stat = meta.sortedSubstats[0][0]
    if (stat === main) return Infinity
    return 6 * (high[stat] ?? 0)
  }
  if (caseKind === HandlingCase.HP || caseKind === HandlingCase.ATK || caseKind === HandlingCase.DEF) {
    const s1 = meta.sortedSubstats[0][0]
    const s2 = meta.sortedSubstats[1][0]
    const b1 = s1 === main
    const b2 = s2 === main
    if (b1 && b2) return Infinity
    if (b1) return 6 * (high[s2] ?? 0)
    if (b2) return 6 * (high[s1] ?? 0)
    return 6 * (high[s1] ?? 0) + (high[s2] ?? 0)
  }
  const optMain = resolveOptimalMainstat(slot, main, meta)
  const filtered = meta.sortedSubstats
    .filter(([name]) => name !== optMain)
    .map(([name]) => high[name] ?? 0)
    .sort((a, b) => b - a)
  return 6 * (filtered[0] ?? 0) + (filtered[1] ?? 0) + (filtered[2] ?? 0) + (filtered[3] ?? 0)
}

// each grade = 5% of ideal substat perfection
const RATING_TIERS: [number, string][] = [
  [0, 'F'], [5, 'F+'], [10, 'D'], [15, 'D+'], [20, 'C'], [25, 'C+'], [30, 'B'], [35, 'B+'],
  [40, 'A'], [45, 'A+'], [50, 'S'], [55, 'S+'], [60, 'SS'], [65, 'SS+'], [70, 'SSS'], [75, 'SSS+'],
  [80, 'WTF'], [85, 'WTF+'], [90, 'AEON'],
  // overflow tier above Fribbels' AEON: score exceeds 100% of the 6-roll ideal
  [100, 'CHETAH'],
]

export function pctToRating(pct: number, part: RelicSlot, hasCorrectMain: boolean, aeonEligible = false): string {
  if (pct <= 0) return '?'
  if (part !== 'head' && part !== 'hands' && !hasCorrectMain) return '?'
  for (let i = RATING_TIERS.length - 1; i >= 0; i--) {
    if (pct >= RATING_TIERS[i][0]) {
      const rating = RATING_TIERS[i][1]
      // AEON and above require verified weights (mirrors Fribbels' aeonEligible gate)
      return (rating === 'AEON' || rating === 'CHETAH') && !aeonEligible ? 'WTF+' : rating
    }
  }
  return '?'
}

export type RelicScore = { pct: number; rating: string; ideal: number }

const round5 = (n: number) => Math.round(n * 1e5) / 1e5
const truncate10ths = (n: number) => Math.floor(n * 10) / 10

/** Score a single relic piece for a character. `verified` enables AEON (mirrors Fribbels). */
export function scoreRelic(
  slug: string,
  slot: RelicSlot,
  main: string,
  subs: readonly SubRoll[],
  verified = false,
): RelicScore {
  const meta = buildMeta(slug)
  if (!meta) return { pct: 0, rating: '?', ideal: Infinity }
  const ideal = computeOptimalScore(slot, main, meta)
  const contrib = contributions(meta)
  let rawScore = 0
  for (const s of subs) {
    const value = substatValue(s)
    rawScore += value * (contrib[s.stat] ?? 0)
  }
  const pct = ideal === Infinity ? 0 : truncate10ths(round5((rawScore / ideal) * 100))
  const hasCorrectMain = !hasMainStat(slot) || mainStatWeight(slot, main, meta) > 0
  const aeonEligible = verified // NOTE: meta.aeonEligibleWeights omitted — no user-edited weights in this project
  return { pct, rating: pctToRating(pct, slot, hasCorrectMain, aeonEligible), ideal }
}

/**
 * Number of "rolls" a substat represents at its own tier (Fribbels substatMinRolls uses the low roll).
 * Used for the green quality cubes.
 */
export function rollCount(s: SubRoll): number {
  return s.rolls
}
