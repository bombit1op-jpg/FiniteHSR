import { case_, type Case } from '../../suites'
import {
  PROBE_BUILDS, PROBE_SCENARIOS, ARCHETYPE_PROBE_LEVELS, PROBE_TARGET,
  runProbe, probeCharacter, type ProbeLevel, type ProbeAggregate,
} from '../../../src/analysis/probe'

/**
 * §65.1 probe-build ladder + §65.2 scenario matrix. A probe is character + build + standard scenario →
 * a §65/§66 profile; `probeCharacter` aggregates CONTROL+FUNCTIONAL over the scenarios. Verified here:
 * the ladder is declared, the enemy-driven scenarios run, single-vs-AoE fan-out is real, and the
 * aggregate is the elementwise mean of its probes (deterministic).
 */

const bounded = (r: Record<string, number>): boolean => Object.values(r).every(v => v >= 0 && v <= 1)
const mean = (probes: number[]): number => probes.reduce((a, b) => a + b, 0) / probes.length

export default (): Case[] => {
  const acheronSingle = runProbe('acheron', 'control', 'single')
  const himekoAoe = runProbe('himeko', 'control', 'aoe')
  const feixiaoAoe = runProbe('feixiao', 'control', 'aoe')

  const agg = probeCharacter('feixiao', { scenarios: ['single', 'aoe'] })
  const agg2 = probeCharacter('feixiao', { scenarios: ['single', 'aoe'] })

  const levels: ProbeLevel[] = ['control', 'functional', 'benchmark']

  return [
    // ---- ladder / scenario declaration ----
    case_('probe ladder declares CONTROL / FUNCTIONAL / BENCHMARK', levels.every(l => PROBE_BUILDS[l] !== undefined)),
    case_('CONTROL build carries no gear (minimal external effects)', !PROBE_BUILDS.control.cone && !PROBE_BUILDS.control.relic && !PROBE_BUILDS.control.planar),
    case_('archtype inference levels are CONTROL + FUNCTIONAL only (§65.1)', ARCHETYPE_PROBE_LEVELS.join(',') === 'control,functional'),
    case_('scenario matrix exposes the enemy-driven §65.2 cases', ['single', 'blast', 'aoe', 'short', 'long', 'broken', 'unbroken'].every(s => PROBE_SCENARIOS[s] !== undefined)),
    case_('probe target is neutral (no weakness) so delivery is not break-biased', PROBE_TARGET.weaknesses.length === 0),

    // ---- a probe is a real run ----
    case_('runProbe: yields real telemetry', acheronSingle.profile.features.actions > 0 && acheronSingle.profile.features.hits > 0 && acheronSingle.profile.features.totalDamage > 0),
    case_('runProbe: records its identity', acheronSingle.kitId === 'acheron' && acheronSingle.level === 'control' && acheronSingle.scenario === 'single'),

    // ---- scenario matrix actually changes the fan-out ----
    case_('AoE scenario: an AoE kit fans out to all targets', himekoAoe.profile.features.maxTargets >= 4),
    case_('AoE scenario: a single-target kit stays single-target', feixiaoAoe.profile.features.maxTargets === 1 && feixiaoAoe.profile.archetypes.target.single_target === 1),

    // ---- aggregation ----
    case_('probeCharacter: coverage = levels × scenarios', agg.aggregate.coverage === ARCHETYPE_PROBE_LEVELS.length * 2),
    case_('probeCharacter: aggregate is the elementwise mean of its probes', (() => {
      const a = agg.aggregate as ProbeAggregate
      for (const key of Object.keys(a.delivery)) {
        const want = mean(agg.probes.map(p => p.profile.archetypes.delivery[key as keyof typeof p.profile.archetypes.delivery]))
        if (Math.abs(a.delivery[key]! - want) > 1e-9) return false
      }
      return true
    })()),
    case_('probeCharacter: aggregate axes are bounded [0,1]', bounded(agg.aggregate.delivery) && bounded(agg.aggregate.tempo) && bounded(agg.aggregate.target)),
    case_('probeCharacter: deterministic for the same inputs', JSON.stringify(agg) === JSON.stringify(agg2)),
  ]
}
