import { runBattle } from '../core/battle'
import { teamMetrics } from './compare'
import { interactionContribution, marginalContribution } from './attribution'
import { PROBE_BUILDS, PROBE_SCENARIOS, type ScenarioId, type ProbeLevel } from './probe'
import { type CausalFeatureId, type NeedScore, type ProvideProfile, type NeedMetric } from './causal'

/**
 * §69 TEAM COMPATIBILITY + §70 TEAM VALUE.
 *
 * §70 — team value is NOT "who dealt the most". Four readings of one real team, all simulation-backed:
 *   direct (§70.1, see `attribution.ts`), marginal (§70.2), replacement (§70.3), Shapley (§70.4).
 *
 * §69 — compatibility is a CHEAP PREDICTIVE score for candidate pruning, never the final answer
 * (§69 "не итоговый DPS"; the formula "должна обучаться/калиброваться"). Two layers here:
 *   - `pairInteraction` / `interactionTerm` (§69.3): the *measured* synergy term, exact, from runs;
 *     the calibration target for anything predictive.
 *   - `predictCompatibility` (§69.1/§69.2): a cheap need↔provide overlap. The provide→feature bridge is
 *     a documented heuristic, deliberately minimal — calibrate it against the measured terms.
 */

export interface TeamValueOptions {
  scenario?: ScenarioId
  level?: ProbeLevel
  seed?: number
  cycles?: number
  metric?: NeedMetric
}

const metricOf = (kitIds: string[], opts: TeamValueOptions): number => {
  if (kitIds.length === 0) return 0
  const sc = PROBE_SCENARIOS[opts.scenario ?? 'single']
  const sim = runBattle({
    cycles: opts.cycles ?? sc.cycles,
    seed: opts.seed ?? 7,
    log: { debug: 5 },
    team: kitIds.map(kitId => ({ kitId, build: PROBE_BUILDS[opts.level ?? 'control'] })),
    enemy: sc.waves[0]![0]!,
    enemyWaves: sc.waves,
  })
  const t = teamMetrics(sim)
  const m = opts.metric ?? 'totalDamage'
  return m === 'totalDamage' ? t.totalDamage : m === 'turns' ? t.turns : t.cycles
}

/** Measured score of a full team on one scenario/seed (the §70 `Score(T, E)`). */
export function scoreKits(kitIds: string[], opts: TeamValueOptions = {}): number {
  return metricOf(kitIds, opts)
}

// ---------------------------------------------------------------------------------------------
// §70 TEAM VALUE
// ---------------------------------------------------------------------------------------------

/** §70.2 marginal team contribution: M(i|T,E) = Score(T+i) − Score(T). */
export function marginalValue(member: string, core: string[], opts: TeamValueOptions = {}): number {
  return marginalContribution(scoreKits([...core, member], opts), scoreKits(core, opts))
}

/** §70.3 replacement value: R(j→i|T,E) = Score((T−j)+i) − Score(T) — the "who fills the 4th slot?" number. */
export function replacementValue(incoming: string, outgoing: string, team: string[], opts: TeamValueOptions = {}): number {
  const rest = team.filter(k => k !== outgoing)
  return scoreKits([...rest, incoming], opts) - scoreKits(team, opts)
}

/** §69.3 / §70 higher-order interaction: I(A,B|R) = Score(R+A+B) − Score(R+A) − Score(R+B) + Score(R). */
export function interactionTerm(a: string, b: string, core: string[] = [], opts: TeamValueOptions = {}): number {
  const full = scoreKits([...core, a, b], opts)
  const aOnly = scoreKits([...core, a], opts)
  const bOnly = scoreKits([...core, b], opts)
  return interactionContribution(full, aOnly, bOnly) + scoreKits(core, opts)
}

/** §69.1 pair compatibility (measured): synergy excess of {A,B} over their solo scores (Score(∅)=0). */
export function pairInteraction(a: string, b: string, opts: TeamValueOptions = {}): number {
  return interactionContribution(scoreKits([a, b], opts), scoreKits([a], opts), scoreKits([b], opts))
}

export interface ShapleyOptions extends TeamValueOptions { samples?: number }

/** Deterministic LCG — analysis harness must stay seed-reproducible (§32/§80.3); no `Math.random`. */
const lcg = (seed: number): (() => number) => {
  let s = (seed >>> 0) || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** §70.4 Shapley value over the variable members with a fixed core. Enumerates all permutations when
 *  feasible, otherwise samples `samples` permutations deterministically. φ sums to Score(core+members) − Score(core). */
export function shapleyValue(core: string[], members: string[], opts: ShapleyOptions = {}): Record<string, number> {
  const cache = new Map<string, number>()
  const score = (ids: string[]): number => {
    const key = [...ids].sort().join('|')
    let v = cache.get(key)
    if (v === undefined) { v = scoreKits(ids, opts); cache.set(key, v) }
    return v
  }
  const perms: string[][] = permutations(members)
  const rnd = lcg(opts.seed ?? 1)
  const useCount = Math.min(opts.samples ?? perms.length, perms.length)
  const chosen = useCount >= perms.length ? perms : samplePermutations(perms, useCount, rnd)

  const phi: Record<string, number> = {}
  for (const m of members) phi[m] = 0
  for (const perm of chosen) {
    const prefix = [...core]
    const base = score(prefix)
    let prev = base
    for (const m of perm) {
      prefix.push(m)
      const val = score(prefix)
      phi[m]! += val - prev
      prev = val
    }
  }
  for (const m of members) phi[m]! /= chosen.length
  return phi
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const out: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) out.push([items[i]!, ...p])
  }
  return out
}
function samplePermutations<T>(all: T[][], n: number, rnd: () => number): T[][] {
  const pool = all.slice()
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!] }
  return pool.slice(0, n)
}

// ---------------------------------------------------------------------------------------------
// §69 PREDICTIVE COMPATIBILITY (cheap; calibrate against the measured terms above)
// ---------------------------------------------------------------------------------------------

/** Heuristic provide→feature bridge. Intentionally minimal; §69 requires calibrating it against the
 *  measured `pairInteraction`/`interactionTerm`, not trusting it as canon. Behaviours whose causal
 *  feature is not injectable here (debuff→DEF/vuln, DoT, FUA, summon, shield, heal) map to `[]`. */
export const PROVIDE_TO_FEATURES: Record<keyof ProvideProfile, CausalFeatureId[]> = {
  buff: ['damage_boost', 'atk_boost', 'crit_rate', 'crit_dmg'],
  debuff: [],
  healing: [],
  shielding: [],
  dot: [],
  break: ['break_effect', 'break_efficiency'],
  fua: [],
  summon: [],
  energy: ['energy_regen'],
  sp: [],
}

export interface CompatibilityBreakdown {
  /** Σ over B's provided features of A's causal need (positive part) */
  needsSatisfied: number
  /** §69 ProvidedBenefits: sum of B's provide intensities in [0,1] */
  providedBenefits: number
  /** §69 Conflicts: A's negative needs on features B provides, as positive magnitudes */
  conflicts: number
  /** NeedsSatisfied + ProvidedBenefits − Conflicts */
  score: number
}

/** §69.1/§69.2 cheap predictive compatibility of B for A, from A's need profile and B's provide profile.
 *  `need` is A's `needProfile` output; `provide` is `provideProfile(B)`. Bounded and finite. The
 *  `- Conflicts` term reuses §68's negative margins. */
export function predictCompatibility(need: NeedScore[], provide: ProvideProfile): { needsSatisfied: number; providedBenefits: number; conflicts: number; score: number } {
  const needByFeature = new Map(need.map(n => [n.feature, n.mean]))
  let needsSatisfied = 0, providedBenefits = 0, conflicts = 0
  for (const [behaviour, intensity] of Object.entries(provide) as [keyof ProvideProfile, number][]) {
    providedBenefits += intensity
    for (const feature of PROVIDE_TO_FEATURES[behaviour]) {
      const m = needByFeature.get(feature)
      if (m === undefined) continue
      if (m > 0) needsSatisfied += m * intensity
      else if (m < 0) conflicts += -m * intensity
    }
  }
  return { needsSatisfied, providedBenefits, conflicts, score: needsSatisfied + providedBenefits - conflicts }
}

/** §69 the cheap score is not authoritative — rank the providers by the predicted score and compare
 *  that ordering with the measured `pairInteraction` (Spearman). That is the calibration signal: the
 *  absolute units differ, only the ORDER of candidates is claimed. */
export function rankAgreement(need: NeedScore[], a: string, providers: { id: string; provide: ProvideProfile }[], opts: TeamValueOptions = {}): { pairs: Array<{ id: string; predicted: number; measured: number }>; spearman: number } {
  const pairs = providers.map(p => ({
    id: p.id,
    predicted: predictCompatibility(need, p.provide).score,
    measured: pairInteraction(a, p.id, opts),
  }))
  return { pairs, spearman: spearman(pairs.map(p => p.predicted), pairs.map(p => p.measured)) }
}

function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
  const out = new Array<number>(values.length)
  for (let k = 0; k < idx.length; k++) out[idx[k]!.i] = k + 1
  return out
}
/** Spearman rank correlation; 1 = the cheap predictor ranks providers exactly as the measurement does. */
export function spearman(a: number[], b: number[]): number {
  if (a.length < 2) return a.length === 1 ? 1 : 0
  const ra = ranks(a), rb = ranks(b)
  const n = a.length
  const mean = (n + 1) / 2
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const x = ra[i]! - mean, y = rb[i]! - mean
    num += x * y; da += x * x; db += y * y
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}
