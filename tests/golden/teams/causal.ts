import { case_, type Case } from '../../suites'
import { run } from '../../_helpers/battle'
import {
  causalProbe, needProfile, provideProfile, conflictProfile, CAUSAL_FEATURES,
} from '../../../src/analysis/causal'

/**
 * §67 need/provide/conflict + §68 causal team probes. Two halves:
 *   - integration: a real counterfactual pair (A vs A + feature) is measured off the event stream;
 *   - unit: aggregation/confidence and the provide/conflict reductions are pure.
 * §67's point is causal, not correlational: the assertions check the counterfactual direction and the
 * §68 confidence bookkeeping, not a hard-coded damage number.
 */

const bounded = (r: Record<string, number>): boolean => Object.values(r).every(v => v >= 0 && v <= 1 && Number.isFinite(v))

export default (): Case[] => {
  const boost = causalProbe('acheron', 'damage_boost', { scenario: 'single', seed: 7 })
  const boost2 = causalProbe('acheron', 'damage_boost', { scenario: 'single', seed: 7 })
  const need = needProfile('acheron', { scenarios: ['single'], seeds: [7, 11], features: ['damage_boost', 'crit_dmg', 'speed'] })

  const luocha = provideProfile(run({ team: [{ kitId: 'luocha' }] }).sim)
  const kafka = provideProfile(run({ team: [{ kitId: 'kafka' }] }).sim)
  const acheron = provideProfile(run({ team: [{ kitId: 'acheron' }] }).sim)

  return [
    // ---- §68 feature vocabulary ----
    case_('CAUSAL_FEATURES: every feature has id/label/>=1 mod and is ally-side', Object.values(CAUSAL_FEATURES).every(f => f.id && f.label && f.mods.length >= 1 && f.side === 'ally')),

    // ---- §68 single counterfactual ----
    case_('causalProbe: a DMG boost raises the metric (positive marginal)', boost.delta > 0 && boost.normalized > 0),
    case_('causalProbe: treated = baseline + delta', Math.abs(boost.baseline + boost.delta - boost.treated) < 1e-6),
    case_('causalProbe: deterministic for the same carry/scenario/seed', JSON.stringify(boost) === JSON.stringify(boost2)),
    case_('causalProbe: alternates metric reported as a finite number', Number.isFinite(causalProbe('acheron', 'speed', { metric: 'turns' }).baseline)),

    // ---- §67 need profile + §68 confidence ----
    case_('needProfile: samples = seeds x scenarios, scenario coverage recorded', need.every(n => n.samples === 2 && n.scenarios === 1)),
    case_('needProfile: mean/stddev finite, stddev >= 0', need.every(n => Number.isFinite(n.mean) && Number.isFinite(n.stddev) && n.stddev >= 0)),
    case_('needProfile: scores only finite, [feature] keys valid', need.every(n => n.feature in CAUSAL_FEATURES)),

    // ---- §67 conflict ----
    case_('conflictProfile: no negative marginal => empty', conflictProfile(need).length === 0),
    case_('conflictProfile: a negative mean is reported with severity', (() => {
      const synthetic = [{ feature: 'speed' as const, mean: -0.25, stddev: 0.1, samples: 4, scenarios: 2 }]
      const c = conflictProfile(synthetic)
      return c.length === 1 && c[0]!.feature === 'speed' && Math.abs(c[0]!.severity - 0.25) < 1e-9
    })()),

    // ---- §67 provide (observed telemetry) ----
    case_('provideProfile: bounded [0,1] and finite', bounded(luocha) && bounded(kafka) && bounded(acheron)),
    case_('provideProfile: Luocha offers healing, Kafka offers DoT, neither shows up for Acheron/Luocha', luocha.healing === 1 && kafka.dot > 0 && acheron.healing === 0 && luocha.dot === 0),
    case_('provideProfile: deterministic for the same seed', JSON.stringify(luocha) === JSON.stringify(provideProfile(run({ team: [{ kitId: 'luocha' }] }).sim))),
  ]
}
