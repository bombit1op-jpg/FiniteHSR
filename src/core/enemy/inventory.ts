import { DEFINITIONS } from './index'
import { BOSS_BEHAVIORS } from './profiles'
import { MOB_BEHAVIORS } from './mob-profiles'
import type { EnemyBehavior } from './ai'
import type { EnemyAbilityDefinition } from './ability'
import type { EnemyRank } from './types'

/** §85.E1 — per-ability inventory of the authored enemy registry.
 *
 *  `coverage.ts` reports one row per enemy *base name* (implemented / fallback). That is not enough
 *  for verification: an implemented enemy may carry up to 9 abilities, and "a test exists for the
 *  enemy" says nothing about whether each attack was independently asserted. This primitive expands
 *  every authored `EnemyBehavior` into one row per declared ability, with a stable id, the declared
 *  mechanics (`ops`) and the verification *dimensions* that attack makes applicable.
 *
 *  Pure and deterministic — no filesystem, no tests. Test linkage/evidence is layered on by the
 *  report CLI (`inventory-report.ts`), so this stays safe to call from a suite. */

/** every behaviour the production registry resolves, tagged with the file that authors it */
function registry(): Array<{ source: 'profiles' | 'mob-profiles'; name: string; behavior: EnemyBehavior }> {
  const out: Array<{ source: 'profiles' | 'mob-profiles'; name: string; behavior: EnemyBehavior }> = []
  for (const [name, behavior] of Object.entries(BOSS_BEHAVIORS)) out.push({ source: 'profiles', name, behavior })
  for (const [name, behavior] of Object.entries(MOB_BEHAVIORS)) out.push({ source: 'mob-profiles', name, behavior })
  return out
}

export interface EnemyAbilityRow {
  /** stable id: `enemy/<enemy-slug>/<abilityId>` */
  id: string
  /** registry key (the enemy base name / endgame card name) */
  enemy: string
  rank: EnemyRank
  abilityId: string
  abilityName: string
  source: 'profiles' | 'mob-profiles'
  targetRule: string
  /** the effect ops this ability declares, in declaration order (deduped) */
  ops: string[]
  /** verification dimensions this ability makes applicable (derived from ops + gates) */
  dimensions: string[]
  cast: number
  cooldown: number
  charges?: number
  /** §54 state gate, when declared */
  require?: { buff?: string; noBuff?: string }
  telegraphed: boolean
  /** the behaviour carries a §57 passive (onSpawn/onHitTaken/onTurnEnd) */
  passive: boolean
  /** the behaviour carries a §56 phase state machine */
  phases: boolean
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x'

/** applicable verification dimensions for one declared ability (rule 7 of the task) */
export function abilityDimensions(a: EnemyAbilityDefinition): string[] {
  const d = new Set<string>()
  const addDamage = (e: { elem?: string }): void => { d.add('damage'); d.add('toughness'); if (e.elem) d.add('element') }
  for (const e of a.effects) {
    switch (e.op) {
      case 'attack': addDamage(e); if ((e.hits ?? 1) > 1) d.add('hit-pattern'); break
      case 'blast': addDamage(e); d.add('hit-pattern'); break
      case 'aoe': addDamage(e); break
      case 'bounce': addDamage(e); d.add('hit-pattern'); d.add('random-target'); break
      case 'delay': d.add('timeline'); break
      case 'advanceSelf': d.add('timeline'); break
      case 'advance': d.add('timeline'); break
      case 'heal': d.add('heal'); break
      case 'dot': d.add('dot'); break
      case 'buff': d.add('buff'); break
      case 'shield': d.add('shield'); break
      case 'counter': d.add('counter'); break
      case 'control': d.add('control'); break
      case 'debuff': d.add('debuff'); break
      case 'sp': d.add('resource'); break
      case 'dispelSelf': d.add('cleanse'); break
      case 'allyEnergyPct': d.add('resource'); break
      case 'drainEnergyPct': d.add('resource'); break
      case 'drainEnergyFlat': d.add('resource'); break
      case 'guard': d.add('defense'); break
      case 'lockon': d.add('forced-target'); d.add('vulnerability'); break
      case 'oneOf': d.add('rng-branch'); break
    }
  }
  // targeting applies to every ability that declares effects; the target rule is itself a
  // separately-verified dimension (single/aoe/blast/random/self/allies), never left implicit.
  if (a.effects.length) {
    d.add('targeting')
    d.add(`target-${a.targetRule ?? 'single'}`)
  }
  if ((a.cast ?? 0) > 0) d.add('charge')
  if (a.cooldown) d.add('cooldown')
  if (a.charges !== undefined) d.add('charges')
  if (a.require) d.add('state-gate')
  // effect-less behavioural actions (Trotter flee / "wait" / idle): verify via flee/despawn/state,
  // not via a discrete effect payload — explicit dimension, never a silent empty row.
  if (!d.size) d.add('no-op')
  return [...d].sort()
}

/** every authored (enemy, ability) pair as a stable, sorted registry row */
export function enemyAbilityInventory(): EnemyAbilityRow[] {
  const rankOfBase = new Map(DEFINITIONS.map(d => [d.baseName, d.defaultRank]))
  const rows: EnemyAbilityRow[] = []
  for (const { source, name, behavior } of registry()) {
    const rank = rankOfBase.get(name) ?? 'mob'
    const phases = !!behavior.phases?.length
    const passive = !!behavior.passive
    for (const a of behavior.abilities) {
      rows.push({
        id: `enemy/${slug(name)}/${a.id}`,
        enemy: name,
        rank,
        abilityId: a.id,
        abilityName: a.name,
        source,
        targetRule: a.targetRule ?? 'single',
        ops: [...new Set(a.effects.map(e => e.op))],
        dimensions: abilityDimensions(a),
        cast: a.cast ?? 0,
        cooldown: a.cooldown ?? 0,
        charges: a.charges,
        require: a.require,
        telegraphed: (a.cast ?? 0) > 0,
        passive,
        phases,
      })
    }
  }
  rows.sort((x, y) => x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  return rows
}

export interface EnemyInventorySummary {
  enemies: number
  abilities: number
  /** total enumerated atomic requirements = Σ |dimensions| over abilities */
  requirements: number
  byRank: Record<EnemyRank, number>
  telegraphed: number
  withCooldown: number
  withCharges: number
  withRequire: number
  phasedBehaviors: number
  passiveBehaviors: number
  ops: Record<string, number>
  dimensions: Record<string, number>
}

export function enemyInventorySummary(rows: EnemyAbilityRow[] = enemyAbilityInventory()): EnemyInventorySummary {
  const byRank: Record<EnemyRank, number> = { mob: 0, elite: 0, boss: 0 }
  const ops: Record<string, number> = {}
  const dims: Record<string, number> = {}
  const enemies = new Set<string>()
  let requirements = 0
  let telegraphed = 0, withCooldown = 0, withCharges = 0, withRequire = 0
  const phased = new Set<string>()
  const passive = new Set<string>()
  for (const r of rows) {
    enemies.add(r.enemy)
    byRank[r.rank] += 1
    requirements += r.dimensions.length
    for (const o of r.ops) ops[o] = (ops[o] ?? 0) + 1
    for (const d of r.dimensions) dims[d] = (dims[d] ?? 0) + 1
    if (r.telegraphed) telegraphed++
    if (r.cooldown) withCooldown++
    if (r.charges !== undefined) withCharges++
    if (r.require) withRequire++
    if (r.phases) phased.add(r.enemy)
    if (r.passive) passive.add(r.enemy)
  }
  return {
    enemies: enemies.size,
    abilities: rows.length,
    requirements,
    byRank,
    telegraphed,
    withCooldown,
    withCharges,
    withRequire,
    phasedBehaviors: phased.size,
    passiveBehaviors: passive.size,
    ops,
    dimensions: dims,
  }
}
