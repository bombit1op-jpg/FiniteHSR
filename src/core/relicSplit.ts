/**
 * §Task7 — value-based substat back-solve for the whole-piece relic editor.
 *
 * The relic editor takes ONE number per piece (the summed substat VALUE in the stats' native
 * units — `0.30` for 30% worth of rolls, `120` for 120 flat HP worth) and splits it into up to
 * 4 substat lines with their roll tiers. The split is deterministic and reuses the existing
 * scoring weights (`buildMeta().sortedSubstats`) to decide WHICH stats a piece rolls — the same
 * ranking Fribbels uses — so the editor never invents a second notion of "good substats".
 *
 * Algorithm (greedy, fully deterministic — no RNG):
 *   1. Candidates = the kit's weighted substats (desc) inside the entered unit class, excluding
 *      the piece's main stat.
 *   2. Seed each line with one MID start roll (LOW if the budget is tight) while it fits.
 *   3. Spend the rest on the largest roll that still fits (HIGH first), capped at 6 rolls per
 *      piece — a 5★ relic has 6 rolls in total.
 *   4. `spread` = per-roll tier indices (start roll first) — the engine's own substat-value model
 *      (`substatValue`) reads it, so the previewed stats match the split exactly.
 *
 * NOTE — unit class is picked by magnitude (< 1 = percent, >= 1 = flat) because percent and
 * flat values cannot be added to one another. Ceiling: a real 5★ piece has 4 lines and 6 rolls,
 * so budgets above that ceiling cannot be spent exactly — the residue is dropped.
 */
import { SUBSTAT_TIERS } from './gear'
import { buildMeta } from './relicScore'

export type SplitSub = { stat: string; tier: 0 | 1 | 2; rolls: number; spread: number[] }

const MAX_SUBS = 4
const MAX_ROLLS = 6

/** flat HP/ATK/DEF/SPD rolls vs percent rolls */
const FLAT_STATS = ['hpFlat', 'atkFlat', 'defFlat', 'spd']

const FALLBACK_STATS = Object.keys(SUBSTAT_TIERS)

/** the class the entered total belongs to: < 1 = percent-class, >= 1 = flat-class */
function unitClass(total: number): 'flat' | 'pct' {
  return total >= 1 ? 'flat' : 'pct'
}

function inClass(stat: string, cls: 'flat' | 'pct'): boolean {
  return cls === 'flat' ? FLAT_STATS.includes(stat) : !FLAT_STATS.includes(stat)
}

function candidates(slug: string, main: string, cls: 'flat' | 'pct'): string[] {
  const meta = buildMeta(slug)
  const ranked = (meta?.sortedSubstats ?? []).map(([stat]) => stat)
  const seen = new Set<string>()
  const out: string[] = []
  for (const stat of [...ranked, ...FALLBACK_STATS]) {
    if (stat === main || seen.has(stat) || !SUBSTAT_TIERS[stat] || !inClass(stat, cls)) continue
    seen.add(stat)
    out.push(stat)
    if (out.length >= MAX_SUBS) break
  }
  return out
}

/** exact-ish subtraction for float roll values (5 decimal places, matches gear.ts rounding) */
function round5(n: number): number { return Math.round(n * 1e5) / 1e5 }

function rollValue(stat: string, tier: 0 | 1 | 2): number { return SUBSTAT_TIERS[stat][tier] }

/** split a summed substat value into up to 4 lines (deterministic; ties broken by kit weight) */
export function splitSubValues(slug: string, main: string, total: number): SplitSub[] {
  const budget = round5(Math.max(0, total))
  if (budget <= 0) return []
  const picks = candidates(slug, main, unitClass(budget))
  if (!picks.length) return []

  const subs: SplitSub[] = picks.map(stat => ({ stat, tier: 1 as 0 | 1 | 2, rolls: 0, spread: [] as number[] }))
  let left = budget
  let rolls = 0
  let lines = 0

  // 1) one start roll per line (mid, else low), in kit-weight order
  for (const s of subs) {
    if (lines >= MAX_SUBS || rolls >= MAX_ROLLS) break
    const tier: 0 | 1 | 2 = left >= rollValue(s.stat, 1) ? 1 : 0
    const v = rollValue(s.stat, tier)
    if (left < v) continue
    s.spread.push(tier); s.rolls++; rolls++; lines++
    left = round5(left - v)
  }

  // 2) spend the rest: the largest roll that still fits (HIGH first), weight order wins ties
  while (left > 0 && rolls < MAX_ROLLS) {
    let best: { s: SplitSub; tier: 0 | 1 | 2; v: number } | null = null
    for (const s of subs) {
      if (s.rolls === 0) continue
      for (const tier of [2, 1, 0] as const) {
        const v = rollValue(s.stat, tier)
        if (v > left) continue
        if (!best || v > best.v) best = { s, tier, v }
        break
      }
    }
    if (!best) break
    best.s.spread.push(best.tier); best.s.rolls++; rolls++
    left = round5(left - best.v)
  }

  // tier = the start roll's tier (the line's base quality; upgrades stay visible in `spread`)
  for (const s of subs) s.tier = (s.spread[0] ?? 0) as 0 | 1 | 2
  return subs.filter(s => s.rolls > 0)
}
