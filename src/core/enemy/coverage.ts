import { DEFINITIONS } from './index'
import { enemyBehavior } from './behaviors'
import type { EnemyRank } from './types'

/** §64 — enemy roster coverage registry.
 *
 *  The catalog (`hsr-data/enemies.json`) has 379 variant rows over 250 base names; a variant is
 *  only *implemented* when the engine can resolve an authored `EnemyBehavior` for the unit it
 *  spawns. The runtime looks a unit up by its exact display name (the endgame card name), and the
 *  authored profiles key on the base name (which equals the card name for the current three), so
 *  this registry accepts either key.
 *
 *  This is a reporting primitive, not a gate by itself: it makes "registered but swings a generic
 *  default attack" a *visible* state instead of a silent one. `tests/golden/enemies/coverage.ts`
 *  pins the explicit implemented set, so adding a profile can never silently change the roster. */
export interface EnemyCoverageRow {
  baseName: string
  rank: EnemyRank
  /** number of raw variant rows (modes/phases) folded into this definition */
  variants: number
  modes: string[]
  /** true when an authored behavior resolves for the base name or any variant title */
  behavioral: boolean
  /** the registry key that matched, or null when only the default attack applies */
  key: string | null
}

export function enemyCoverage(): EnemyCoverageRow[] {
  return DEFINITIONS.map(def => {
    let key: string | null = null
    if (enemyBehavior(def.baseName)) key = def.baseName
    else {
      const hit = def.variants.find(v => enemyBehavior(v.variantId))
      if (hit) key = hit.variantId
    }
    return {
      baseName: def.baseName,
      rank: def.defaultRank,
      variants: def.variants.length,
      modes: [...new Set(def.variants.map(v => v.mode))],
      behavioral: key !== null,
      key,
    }
  })
}

export interface EnemyCoverageSummary {
  bases: number
  records: number
  behavioral: number
  byRank: Record<EnemyRank, { bases: number; behavioral: number; records: number }>
}

export function enemyCoverageSummary(): EnemyCoverageSummary {
  const rows = enemyCoverage()
  const byRank: EnemyCoverageSummary['byRank'] = {
    mob: { bases: 0, behavioral: 0, records: 0 },
    elite: { bases: 0, behavioral: 0, records: 0 },
    boss: { bases: 0, behavioral: 0, records: 0 },
  }
  let records = 0
  let behavioral = 0
  for (const r of rows) {
    const b = byRank[r.rank]
    b.bases += 1
    b.records += r.variants
    if (r.behavioral) { b.behavioral += 1; behavioral += 1 }
    records += r.variants
  }
  return { bases: rows.length, records, behavioral, byRank }
}

/** the base names the engine currently resolves an authored behavior for */
export function implementedEnemyNames(): string[] {
  return enemyCoverage().filter(r => r.behavioral).map(r => r.baseName)
}
