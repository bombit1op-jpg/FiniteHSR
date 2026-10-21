/**
 * Level scaling for characters and Light Cones.
 *
 * Character base stats come from `PROG[kitId].byLevel` (ascension boundaries 10…80, floored from
 * `hsr-data/characters.json`). Growth is linear inside an ascension segment; below the first
 * boundary the 10→20 slope continues backwards (the raw data has no level-1 anchor).
 *
 * Light Cone base stats follow the raw promotion stages of `hsr-data/data/lightcones.json`:
 * every cone shares one shape — `base_p = add * K_p` with the per-level `add` from the same row —
 * so a single factor curve serves all rarities. The cone's PASSIVE never scales with level.
 */
import { PROG } from './progression'

export const MAX_CHAR_LEVEL = 80
export const MAX_CONE_LEVEL = 80

/** multiplier of a character's base stat at `level`, relative to level 80 */
export function charLevelRatios(kitId: string, level: number): { hp: number; atk: number; def: number; spd: number } | undefined {
  const prog = PROG[kitId]
  if (!prog) return undefined
  const bounds = Object.keys(prog.byLevel).map(Number).sort((a, b) => a - b)
  if (bounds.length < 2) return undefined
  const lv = Math.max(1, Math.min(MAX_CHAR_LEVEL, Math.round(level)))
  const top = prog.byLevel[bounds[bounds.length - 1]]
  const at = (stat: 'hp' | 'atk' | 'def' | 'spd', L: number): number => {
    if (L <= bounds[0]) {
      const b0 = prog.byLevel[bounds[0]]
      const b1 = prog.byLevel[bounds[1]]
      const slope = (b1[stat] - b0[stat]) / (bounds[1] - bounds[0])
      return b0[stat] + slope * (L - bounds[0])
    }
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1]
      if (L <= b) {
        const va = prog.byLevel[a][stat]
        const vb = prog.byLevel[b][stat]
        return va + (vb - va) * (L - a) / (b - a)
      }
    }
    return top[stat]
  }
  return {
    hp: at('hp', lv) / top.hp,
    atk: at('atk', lv) / top.atk,
    def: at('def', lv) / top.def,
    spd: at('spd', lv) / top.spd,
  }
}

/** promotion stage of a Light Cone level (raw stages cover 1–20, 21–30, … 71–80) */
const CONE_STAGE_K = [6.666667, 14.666667, 25.333333, 36, 46.666667, 57.333333, 68]
const CONE_STAGE_MAX = [20, 30, 40, 50, 60, 70, 80]

/** Light Cone base-stat factor at `level` (1 = level-80 value) */
export function coneLevelFactor(level: number): number {
  const L = Math.max(1, Math.min(MAX_CONE_LEVEL, Math.round(level)))
  let p = 0
  while (p < CONE_STAGE_MAX.length - 1 && L > CONE_STAGE_MAX[p]) p++
  return (CONE_STAGE_K[p] + (L - 1)) / (CONE_STAGE_K[6] + 79)
}
