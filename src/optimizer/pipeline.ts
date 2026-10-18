import { behaviorProfile } from '../analysis/profile'
import { PROBE_BUILDS, PROBE_SCENARIOS, type ProbeLevel } from '../analysis/probe'
import { needProfile, provideProfile, type CausalFeatureId, type NeedScore, type ProvideProfile } from '../analysis/causal'
import { predictCompatibility } from '../analysis/team'
import { runBattle } from '../core/battle'

/**
 * §72.1 ROLE FILTERING + §72.2 COMPATIBILITY RANKING — the two cheap pre-stages of the team pipeline.
 * §72.1 is explicit that roles are a pruning heuristic, NEVER binding: `filterByRole` falls back to the
 * full set rather than emptying it. §72.2 ranks candidates by Need/Provide/Conflict (reusing the §69
 * `predictCompatibility` bridge) plus role/archetype tags; the measured `rankAgreement` test is the only
 * check on the ranking's claim, so nothing here fabricates an absolute "synergy" number.
 */

/** §72.1 role tags. Deliberately coarse; `carry` is the always-present fallback. */
export type RoleTag = 'carry' | 'support' | 'sustain' | 'breaker' | 'dotter' | 'summoner'

export interface RoleProfile {
  kitId: string
  /** roles present, strongest first (never empty — `carry` is the floor) */
  roles: RoleTag[]
  primary: RoleTag
  provides: ProvideProfile
  /** §65 dominant delivery axis, carried for encounter-fit reasoning by the caller */
  delivery: string
}

/** §72.1 pure role classifier: utility roles from the §67 provide profile; `carry` is the baseline. */
export function classifyRoles(provides: ProvideProfile): RoleTag[] {
  const score: Record<RoleTag, number> = {
    carry: 0.5,
    support: (provides.buff ?? 0) + (provides.debuff ?? 0),
    sustain: (provides.healing ?? 0) + (provides.shielding ?? 0),
    breaker: provides.break ?? 0,
    dotter: provides.dot ?? 0,
    summoner: provides.summon ?? 0,
  }
  const order: RoleTag[] = (Object.keys(score) as RoleTag[]).filter(r => score[r]! > 0)
  order.sort((a, b) => score[b]! - score[a]! || (a < b ? -1 : a > b ? 1 : 0))
  return order
}

export interface RoleProfileOptions { level?: ProbeLevel; seed?: number }

/** §65 probe (single-target, standard build) → §67 provide → §72.1 role tags. One real run per character. */
export function roleProfile(kitId: string, opts: RoleProfileOptions = {}): RoleProfile {
  const sc = PROBE_SCENARIOS.single!
  const sim = runBattle({
    cycles: sc.cycles,
    seed: opts.seed ?? 7,
    log: { debug: 5 },
    team: [{ kitId, build: PROBE_BUILDS[opts.level ?? 'functional'] }],
    enemy: sc.waves[0]![0]!,
    enemyWaves: sc.waves,
  })
  const provides = provideProfile(sim)
  const roles = classifyRoles(provides)
  return { kitId, roles, primary: roles[0]!, provides, delivery: behaviorProfile(sim).dominant.delivery }
}

export interface RankedProvider {
  kitId: string
  score: number
  breakdown: { needsSatisfied: number; providedBenefits: number; conflicts: number }
  roles: RoleTag[]
}

export interface RankProvidersOptions {
  /** §72.1 role pre-filter — non-binding (see `filterByRole`) */
  roles?: RoleTag[]
  /** §72.2 top-K cutoff */
  topK?: number
}

/** §72.1 non-binding role filter: keep profiles carrying any requested role; if that empties the set,
 *  return the input unchanged (roles must not silently drop every candidate). */
export function filterByRole(profiles: RoleProfile[], roles?: RoleTag[]): RoleProfile[] {
  if (!roles || roles.length === 0) return profiles
  const kept = profiles.filter(p => p.roles.some(r => roles.includes(r)))
  return kept.length ? kept : profiles
}

/** §72.2 compatibility ranking over already-profiled candidates. Deterministic: ties break by kitId. */
export function rankProviders(need: NeedScore[], profiles: RoleProfile[], opts: RankProvidersOptions = {}): RankedProvider[] {
  const pool = filterByRole(profiles, opts.roles)
  const ranked: RankedProvider[] = pool.map(p => {
    const c = predictCompatibility(need, p.provides)
    return { kitId: p.kitId, score: c.score, breakdown: { needsSatisfied: c.needsSatisfied, providedBenefits: c.providedBenefits, conflicts: c.conflicts }, roles: p.roles }
  })
  ranked.sort((a, b) => b.score - a.score || (a.kitId < b.kitId ? -1 : a.kitId > b.kitId ? 1 : 0))
  return opts.topK === undefined ? ranked : ranked.slice(0, opts.topK)
}

/** §72.2 convenience: needs of `carry` (measured causal features) → ranked providers. */
export function providerRanking(carry: string, providers: RoleProfile[], opts: RankProvidersOptions = {}): RankedProvider[] {
  return rankProviders(needProfileFor(carry), providers, opts)
}

const DEFAULT_NEED_FEATURES: CausalFeatureId[] = ['damage_boost', 'crit_dmg', 'crit_rate', 'atk_boost', 'res_pen', 'final_boost']
function needProfileFor(carry: string): NeedScore[] {
  return needProfile(carry, { scenarios: ['single'], seeds: [7], features: DEFAULT_NEED_FEATURES })
}
