import { runBattle } from '../core/battle'
import type { Simulator } from '../core/simulator'
import type { StatKey } from '../core/entities/Unit'
import { teamMetrics } from './compare'
import { behaviorProfile } from './profile'
import { PROBE_SCENARIOS, PROBE_BUILDS, type ScenarioId, type ProbeLevel } from './probe'

/**
 * §67 NEED / PROVIDE / CONFLICT + §68 CAUSAL TEAM PROBES.
 *
 * §67 warns: don't infer Need by correlation — use causal probes. §68 defines the counterfactual:
 * `A` vs `A + feature X` (baseline / +provider / −provider). The engine-honest way to inject "X" is a
 * `manualMods` stat buff on a side (the same knob endgame encounters use), so a *feature* here is a
 * named, injectable modifier set — not a hard-coded character.
 *
 *   Need[A][X]     = normalized marginal benefit of X for A            (causalProbe / needProfile)
 *   Provide[B][X]  = what B's observed behaviour offers the team        (provideProfile, §65 telemetry)
 *   Conflict       = features whose marginal benefit is NEGATIVE        (conflictProfile)
 *
 * Every need number carries confidence (mean / stddev / sample count / scenario coverage) per §68:
 * a small delta from one seed is not a proven synergy.
 */

// ---------------------------------------------------------------------------------------------
// §68 injectable features
// ---------------------------------------------------------------------------------------------

export interface CausalFeature {
  id: string
  label: string
  side: 'ally' | 'enemy'
  mods: Array<{ stat: StatKey; value: number }>
}

/** Named stat-features a probe can add to a side. Values are moderate so the marginal is informative
 *  rather than saturating; the set is the causal vocabulary, not a claim about any character. */
export const CAUSAL_FEATURES: Record<string, CausalFeature> = {
  damage_boost: { id: 'damage_boost', label: 'generic DMG boost +30%', side: 'ally', mods: [{ stat: 'dmgAll', value: 0.3 }] },
  crit_dmg: { id: 'crit_dmg', label: 'CRIT DMG +50%', side: 'ally', mods: [{ stat: 'critDmg', value: 0.5 }] },
  crit_rate: { id: 'crit_rate', label: 'CRIT Rate +30%', side: 'ally', mods: [{ stat: 'critRate', value: 0.3 }] },
  atk_boost: { id: 'atk_boost', label: 'ATK +40%', side: 'ally', mods: [{ stat: 'atkPct', value: 0.4 }] },
  res_pen: { id: 'res_pen', label: 'RES PEN +20%', side: 'ally', mods: [{ stat: 'resPenAll', value: 0.2 }] },
  // NOTE: DEF is deliberately NOT a feature here. `defIgnore` only reaches the DoT path (damage.ts:130)
  // and `defRed`/`vulnAll` are enemy-side (a `side:'enemy'` mod is now reachable — L245 applies it after
  // spawn), but this vocabulary is intentionally single-sided: an ally-side analogue would misrepresent
  // the mechanism, so DEF/vuln need a real provider or an explicit enemy-side feature — out of scope.
  final_boost: { id: 'final_boost', label: 'final DMG boost +15%', side: 'ally', mods: [{ stat: 'finalDmgBoost', value: 0.15 }] },
  break_effect: { id: 'break_effect', label: 'Break Effect +50%', side: 'ally', mods: [{ stat: 'be', value: 0.5 }] },
  break_efficiency: { id: 'break_efficiency', label: 'Weakness Break Eff +30%', side: 'ally', mods: [{ stat: 'wbe', value: 0.3 }] },
  speed: { id: 'speed', label: 'SPD +20%', side: 'ally', mods: [{ stat: 'spdPct', value: 0.2 }] },
  energy_regen: { id: 'energy_regen', label: 'Energy Regen +50%', side: 'ally', mods: [{ stat: 'err', value: 0.5 }] },
  effect_hit: { id: 'effect_hit', label: 'Effect Hit Rate +50%', side: 'ally', mods: [{ stat: 'ehr', value: 0.5 }] },
}
export type CausalFeatureId = keyof typeof CAUSAL_FEATURES

export type NeedMetric = 'totalDamage' | 'turns' | 'cycles'
const metricOf = (sim: Simulator, m: NeedMetric): number => {
  const t = teamMetrics(sim)
  return m === 'totalDamage' ? t.totalDamage : m === 'turns' ? t.turns : t.cycles
}

export interface CausalProbeOptions {
  scenario?: ScenarioId
  level?: ProbeLevel
  seed?: number
  metric?: NeedMetric
  cycles?: number
}

export interface CausalDelta {
  feature: CausalFeatureId
  baseline: number
  treated: number
  /** treated - baseline */
  delta: number
  /** delta / baseline (0 when baseline is 0) — the §68 normalized marginal */
  normalized: number
}

/** §68 single counterfactual: run A, then A + feature X on the same scenario/seed, compare the metric. */
export function causalProbe(carry: string, feature: CausalFeatureId, opts: CausalProbeOptions = {}): CausalDelta {
  const sc = PROBE_SCENARIOS[opts.scenario ?? 'single']
  const f = CAUSAL_FEATURES[feature]
  const base = {
    cycles: opts.cycles ?? sc.cycles,
    seed: opts.seed ?? 7,
    log: { debug: 5 } as const,
    team: [{ kitId: carry, build: PROBE_BUILDS[opts.level ?? 'control'] }],
    enemy: sc.waves[0]![0]!,
    enemyWaves: sc.waves,
  }
  const metric = opts.metric ?? 'totalDamage'
  const baseline = metricOf(runBattle({ ...base }), metric)
  const treated = metricOf(runBattle({ ...base, manualMods: f.mods.map(m => ({ stat: m.stat, value: m.value, side: f.side })) }), metric)
  const delta = treated - baseline
  return { feature, baseline, treated, delta, normalized: baseline ? delta / baseline : 0 }
}

export interface NeedScore {
  feature: CausalFeatureId
  /** mean normalized marginal across samples */
  mean: number
  stddev: number
  /** number of (scenario, seed) samples behind the mean (§68 confidence) */
  samples: number
  /** distinct scenarios covered */
  scenarios: number
}

export interface NeedProfileOptions {
  scenarios?: ScenarioId[]
  seeds?: number[]
  level?: ProbeLevel
  metric?: NeedMetric
  features?: CausalFeatureId[]
}

/** §67/§68 Need profile: for each feature, the mean normalized marginal benefit of X for the carry,
 *  with confidence. Recommend ≥2 scenarios and ≥2 seeds before trusting a number (§68). */
export function needProfile(carry: string, opts: NeedProfileOptions = {}): NeedScore[] {
  const scenarios = opts.scenarios ?? (['single', 'broken'] as ScenarioId[])
  const seeds = opts.seeds ?? [7, 11]
  const features = opts.features ?? (Object.keys(CAUSAL_FEATURES) as CausalFeatureId[])
  return features.map(feature => {
    const ns: number[] = []
    for (const scenario of scenarios) for (const seed of seeds) ns.push(causalProbe(carry, feature, { scenario, seed, level: opts.level, metric: opts.metric }).normalized)
    const mean = ns.reduce((a, b) => a + b, 0) / ns.length
    const variance = ns.reduce((a, b) => a + (b - mean) ** 2, 0) / ns.length
    return { feature, mean, stddev: Math.sqrt(variance), samples: ns.length, scenarios: scenarios.length }
  })
}

// ---------------------------------------------------------------------------------------------
// §67 Provide / Conflict
// ---------------------------------------------------------------------------------------------

export interface ProvideProfile {
  buff: number
  debuff: number
  healing: number
  shielding: number
  dot: number
  break: number
  fua: number
  summon: number
  energy: number
  sp: number
}

const c01 = (x: number): number => (x > 1 ? 1 : x > 0 ? x : 0)

/** §67 Provide profile — what a character's OBSERVED behaviour offers the team, as bounded [0,1]
 *  intensities. Derived from §65 telemetry (not hard-coded): a healer shows healing, a debuffer shows
 *  debuffs, an FUA kit shows follow-ups, etc. */
export function provideProfile(sim: Simulator): Record<keyof ProvideProfile, number> {
  const f = behaviorProfile(sim).features
  const pa = (n: number): number => n / Math.max(1, f.actions)
  return {
    buff: c01(pa(f.buffApplied) / 0.5),
    debuff: c01(pa(f.debuffApplied) / 0.5),
    healing: c01(f.healing > 0 ? 1 : 0),
    shielding: c01(f.shielding > 0 ? 1 : 0),
    dot: c01(pa(f.dotTicks) / 0.5),
    break: c01(pa(f.breaks) / 0.25),
    fua: c01(pa(f.fua) / 0.5),
    summon: c01(f.summons > 0 ? 1 : 0),
    energy: c01(pa(f.energyGained) / 40),
    sp: c01(pa(f.spSpent) / 0.5),
  }
}

/** §67 Conflict: features whose causal marginal benefit for the carry is NEGATIVE (they cost more than
 *  they give in the probed environment). Severity = |mean|. Empty when nothing is harmful. */
export interface ConflictEntry { feature: CausalFeatureId; severity: number }
export function conflictProfile(need: NeedScore[]): ConflictEntry[] {
  return need.filter(n => n.mean < 0).map(n => ({ feature: n.feature, severity: -n.mean })).sort((a, b) => b.severity - a.severity)
}
