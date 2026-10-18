import type { EnemyBehavior } from './ai'
import { BOSS_BEHAVIORS } from './profiles'
import { MOB_BEHAVIORS } from './mob-profiles'

/** §54 — the enemy behavior registry. `enemyTurn` looks a unit up by display name; a hit uses
 *  the declarative behavior, a miss keeps the built-in default attack (so existing enemies and
 *  every current scenario are untouched). Name is a lookup key here, not identity: the mapping
 *  is authored data (`profiles.ts`), never derived from raw prose (which carries no structured
 *  effects). The map seeds from the production profiles; `registerEnemyBehavior` still overrides
 *  for tests. */
const BEHAVIORS = new Map<string, EnemyBehavior>(Object.entries({ ...BOSS_BEHAVIORS, ...MOB_BEHAVIORS }))

export function registerEnemyBehavior(name: string, behavior: EnemyBehavior): void {
  BEHAVIORS.set(name, behavior)
}

export function enemyBehavior(name: string): EnemyBehavior | undefined {
  // Duplicate spawns in one group get a " #N" display suffix (battle.ts spawn loop). The behavior is
  // authored under the base name, so strip that suffix before the fallback — multi-enemy waves of an
  // authored enemy otherwise silently dropped to the default attack.
  return BEHAVIORS.get(name) ?? BEHAVIORS.get(name.replace(/ #\d+$/, ''))
}

export function unregisterEnemyBehavior(name: string): void {
  BEHAVIORS.delete(name)
}
