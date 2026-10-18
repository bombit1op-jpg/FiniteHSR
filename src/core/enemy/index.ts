import { buildCatalog } from './parse'
import type { EnemyDefinition, EnemyVariant } from './types'

export * from './types'
export { buildCatalog, ELEMS, parseNum, parsePct, parseToughness, rankOf } from './parse'
export { getEnemyStat, getEnemyStatRow, resolveInstance } from './resolve'
export { executeEnemyAbility, fireEnemyCounter, type EnemyAbilityDefinition, type EnemyEffect, type EnemyTargetRule } from './ability'
export { enemyCounterOf, enterEnemyCounter, resetEnemyCounter, counterFiredSeq, markCounterFired, type EnemyCounterDef } from './counter'
export { chooseEnemyAction, enemyRuntimeOf, resetEnemyRuntime, SimpleAI, PatternAI, type EnemyAction, type EnemyActionPhase, type EnemyAI, type EnemyAIRuntime, type EnemyBehavior } from './ai'
export { evaluateEnemyPhase, filterPhaseAbilities, enemyPhaseRuntimeOf, resetEnemyPhase, type EnemyPhaseCondition, type EnemyPhaseDefinition, type EnemyPhaseRuntime } from './phase'
export { registerEnemyBehavior, enemyBehavior, unregisterEnemyBehavior } from './behaviors'
export { registerEnemyDefense, unregisterEnemyDefense, enemyDefenseOf, resetEnemyDefense, enemyInvulnerable, enemyToughnessImmune, enemyDelayImmune, enemyControlImmune, routeEnemyDamage, type EnemyDefenseState, type EnemyLinkDef, type EnemyDefenseRuntime, type EnemyRelationship } from './defense'

/** §51 — all definitions, grouped by `baseName` (the parsed raw `enemies.json`). */
export const DEFINITIONS: EnemyDefinition[] = buildCatalog()

const byId = new Map(DEFINITIONS.map(d => [d.id, d]))
const byTitle = new Map<string, EnemyVariant>()
for (const d of DEFINITIONS) for (const v of d.variants) byTitle.set(v.variantId, v)

export function getDefinition(baseName: string): EnemyDefinition | undefined {
  return byId.get(baseName)
}

/** exact title first (every endgame card is an exact title), else `baseName` → its base
 *  (mode `''`) variant, else the first. Deterministic — never "last row wins". */
export function getVariant(name: string): EnemyVariant | undefined {
  const exact = byTitle.get(name)
  if (exact) return exact
  const d = byId.get(name)
  return d ? (d.variants.find(v => v.mode === '') ?? d.variants[0]) : undefined
}

export function allDefinitions(): EnemyDefinition[] {
  return DEFINITIONS
}
