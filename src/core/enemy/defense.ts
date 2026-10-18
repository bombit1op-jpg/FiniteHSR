import type { Unit } from '../entities/Unit'
import type { Simulator } from '../simulator'

/** §57–58 — enemy defensive state and linked entities, DATA-DRIVEN and per-unit, keyed by exact
 *  display name exactly like enemy behaviors. Nothing here is reached through `if (enemyId === ...)`;
 *  the engine only ever consults a unit's resolved defense profile. Incoming HP damage is routed
 *  through `routeEnemyDamage` (the §57 DamageReceiver), toughness through `enemyToughnessImmune`,
 *  CC application through `enemyControlImmune` (buff and DoT pressure points) and timeline delay
 *  through `enemyDelayImmune` in `sim.delay`.
 *
 *  Shape follows total_guide §57 `EntityLink` + §58 `DefenseState`: a profile owns flags + an
 *  optional HP shield + a link set; links carry their §57 relationship and, when `damageRouting` is
 *  set, redefine where THIS unit's incoming damage lands (Echoes of Faded Dreams → Harmonious
 *  Choir is `redirect_to`). */

export type EnemyRelationship =
  | 'SUMMON' | 'PROXY' | 'SHIELD_SOURCE' | 'DAMAGE_REDIRECT' | 'LINKED_TARGET' | 'PHASE_OBJECT' | 'ADD' | 'MIRROR'

export interface EnemyLinkDef {
  relationship: EnemyRelationship
  /** the OTHER unit: a roster id or a display name (resolved against the live roster at route time) */
  target: string
  /** where `this` unit's incoming HP damage goes instead (§57 DamageReceiver) */
  damageRouting?: 'redirect_to' | 'redistribute'
  lifecycleRule?: string
  targetingRule?: string
}

export interface EnemyDefenseState {
  /** no incoming HP damage lands */
  invulnerable?: boolean
  /** incoming HP damage is scaled to this fraction (0..1) */
  partial?: number
  /** no toughness damage / Weakness Break */
  toughnessImmune?: boolean
  /** Action Delay no-ops */
  delayImmune?: boolean
  /** debuff-buff and control-DoT application no-ops */
  controlImmune?: boolean
  /** an HP shield absorbed before HP damage lands */
  shield?: number
  /** §57 linked entities + §58 damage routing */
  links?: EnemyLinkDef[]
}

export interface EnemyDefenseRuntime {
  defense: EnemyDefenseState
  shield: number
  links: EnemyLinkDef[]
}

const DEFENSES = new Map<string, EnemyDefenseState>()
const DEFENSE_RT = new WeakMap<Unit, EnemyDefenseRuntime>()

export function registerEnemyDefense(name: string, d: EnemyDefenseState): void { DEFENSES.set(name, d) }
export function unregisterEnemyDefense(name: string): void { DEFENSES.delete(name) }

/** §41-named spawns (`Boss #2`) resolve against the authored base name */
function authoredDefense(name: string): EnemyDefenseState {
  return DEFENSES.get(name.replace(/\s+#\d+$/, '')) ?? {}
}

/** lazy per-unit runtime: profile is read from the registry on first access, so a profile can be
 *  registered before OR after the battle spins up — the first hit/CC/delay gate sees it. */
export function enemyDefenseOf(u: Unit): EnemyDefenseRuntime {
  let rt = DEFENSE_RT.get(u)
  if (!rt) {
    const d = authoredDefense(u.name)
    rt = { defense: d, shield: d.shield ?? 0, links: d.links ?? [] }
    DEFENSE_RT.set(u, rt)
  }
  return rt
}

/** wipe the runtime (wave revive): shield accrual must not survive a respawn */
export function resetEnemyDefense(u: Unit): void { DEFENSE_RT.delete(u) }

export function enemyInvulnerable(u: Unit): boolean { return enemyDefenseOf(u).defense.invulnerable === true }
export function enemyToughnessImmune(u: Unit): boolean { return enemyDefenseOf(u).defense.toughnessImmune === true }
export function enemyDelayImmune(u: Unit): boolean { return enemyDefenseOf(u).defense.delayImmune === true }
export function enemyControlImmune(u: Unit): boolean { return enemyDefenseOf(u).defense.controlImmune === true }

function resolveLink(sim: Simulator, l: EnemyLinkDef): Unit | undefined {
  const byId = sim.find(l.target)
  if (byId) return byId
  return sim.roster.find(u => u.name === l.target)
}

/** §57/§58 applied amount: how much incoming HP damage actually lands on `unit`'s HP. Emits
 *  HP_INTERCEPT (invulnerable / partial), SHIELD_ABSORBED/SHIELD_BROKEN (shield) and HP_REDIRECT
 *  (redirect_to / redistribute). Default (no profile / no gates): returns `incoming` untouched. */
export function routeEnemyDamage(sim: Simulator, unit: Unit, incoming: number, seen?: Set<Unit>): number {
  const rt = enemyDefenseOf(unit)
  const guard = seen ?? new Set<Unit>()
  if (guard.has(unit)) return incoming // §57 cycle guard: a redirect loop collapses on the original target
  guard.add(unit)
  if (rt.defense.invulnerable === true) {
    sim.logger.emit({ type: 'HP_INTERCEPT', target: unit.name, targetId: unit.id, payload: { amount: incoming, remaining: 0, incoming, by: 'defense', reason: 'invulnerable' } })
    return 0
  }
  const routed = routeLinks(sim, unit, rt, guard, incoming)
  if (routed !== undefined) return routed
  let remaining = incoming
  if (rt.shield > 0) {
    const absorb = Math.min(rt.shield, remaining)
    rt.shield -= absorb
    remaining -= absorb
    sim.logger.emit({ type: 'SHIELD_ABSORBED', target: unit.name, targetId: unit.id, payload: { amount: absorb, id: 'enemy_shield', name: 'Defense Shield', remaining: rt.shield } })
    if (rt.shield <= 0) {
      sim.log(`${unit.name} Defense Shield broken`)
      sim.logger.emit({ type: 'SHIELD_BROKEN', target: unit.name, targetId: unit.id, payload: { id: 'enemy_shield', name: 'Defense Shield' } })
    }
  }
  if (rt.defense.partial !== undefined) {
    const keep = Math.floor(remaining * rt.defense.partial)
    const absorbed = remaining - keep
    if (absorbed > 0) {
      sim.logger.emit({ type: 'HP_INTERCEPT', target: unit.name, targetId: unit.id, payload: { amount: absorbed, remaining: keep, incoming, by: 'defense', reason: 'partial' } })
    }
    remaining = keep
  }
  return remaining
}

/** returns 0 when the link set absorbed the hit (target takes none); undefined when nothing routes */
function routeLinks(sim: Simulator, from: Unit, rt: EnemyDefenseRuntime, guard: Set<Unit>, incoming: number): number | undefined {
  const routed = rt.links.filter(l => l.damageRouting)
  if (!routed.length) return undefined
  const recv = routed
    .map(l => resolveLink(sim, l))
    .filter((u): u is Unit => !!u && !u.dead && !guard.has(u))
  if (!recv.length) return undefined
  if (routed[0]!.damageRouting === 'redirect_to') {
    const r = recv[0]!
    const applied = applyRouted(sim, r, incoming, guard)
    emitRedirect(sim, from, routed[0]!, [r], [applied], incoming, 'redirect_to')
    return 0
  }
  const split = Math.floor(incoming / recv.length)
  const applied: number[] = []
  let rem = incoming
  for (const r of recv) {
    const amt = applyRouted(sim, r, Math.min(rem, split), guard)
    applied.push(amt)
    rem -= split
  }
  emitRedirect(sim, from, routed[0]!, recv, applied, incoming, 'redistribute')
  return 0
}

function applyRouted(sim: Simulator, r: Unit, amount: number, guard: Set<Unit>): number {
  const applied = routeEnemyDamage(sim, r, amount, guard)
  r.hp = Math.max(0, r.hp - applied)
  return applied
}

function emitRedirect(sim: Simulator, from: Unit, link: EnemyLinkDef, recv: Unit[], applied: number[], incoming: number, kind: 'redirect_to' | 'redistribute'): void {
  for (let i = 0; i < recv.length; i++) {
    sim.logger.emit({
      type: 'HP_REDIRECT', source: `${link.relationship}`, target: recv[i]!.name, sourceId: from.id,
      targetId: recv[i]!.id,
      payload: { amount: kind === 'redirect_to' ? incoming : Math.floor(incoming / recv.length), incoming, by: kind, to: recv[i]!.name, applied: applied[i] },
    })
  }
}