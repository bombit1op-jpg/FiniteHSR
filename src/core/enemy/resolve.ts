import type {
  EnemyDefinition,
  EnemyInstanceData,
  EnemyStatCtx,
  EnemyStatKey,
  EnemyStatRow,
  EnemyVariant,
} from './types'

/** §52 — resolve a single raw level row. `undefined` when the variant has no stat table
 *  or no row for that level (explicit unknown, never a silent zero). */
export function getEnemyStatRow(v: EnemyVariant, level: number): EnemyStatRow | undefined {
  return v.stats?.[level]
}

/** §52 — resolve one stat from the level table, then apply stage/phase/runtime multipliers
 *  (each defaults to 1). Returns `undefined` when the underlying data is absent. */
export function getEnemyStat(v: EnemyVariant, key: EnemyStatKey, ctx: EnemyStatCtx): number | undefined {
  const row = getEnemyStatRow(v, ctx.level)
  if (!row) return undefined
  const mul = (ctx.stageMul?.[key] ?? 1) * (ctx.phaseMul?.[key] ?? 1) * (ctx.runtimeMul?.[key] ?? 1)
  return row[key] * mul
}

/** §51 — the resolved data-only instance view of a variant at a level. */
export function resolveInstance(def: EnemyDefinition, v: EnemyVariant, level: number): EnemyInstanceData {
  const row = getEnemyStatRow(v, level)
  return {
    id: v.variantId,
    definitionId: def.id,
    variantId: v.variantId,
    level,
    hp: row?.hp,
    atk: row?.atk,
    def: row?.def,
    spd: row?.spd,
    effectRes: row?.effectRes,
    weaknesses: v.weaknesses,
    resistances: v.resistanceProfile,
    effectResistance: v.effectResistanceProfile,
    toughness: v.toughnessModel,
    rank: v.rank,
  }
}
