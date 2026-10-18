import { case_, type Case } from '../../suites'
import { run } from '../../_helpers/battle'
import {
  featureVector, normalizeFeatures, lateDamageShare, behaviorProfile,
  deliveryScores, tempoScores, targetScores, roleScores,
  type NormalizedFeatures, type FeatureVector, type ArchetypeScores,
} from '../../../src/analysis/profile'

/**
 * §65 feature vector + §66 archetype model. Two halves:
 *   - integration: a real battle's telemetry is read off the event stream (per kit);
 *   - unit: the §66 scoring is a pure function of a feature vector, tested with exact synthetic inputs.
 * §66 dependency axes and §67-69 need counterfactual runs — covered by later layers, not faked here.
 */

const NF = (over: Partial<NormalizedFeatures> = {}): NormalizedFeatures => ({
  perAction: {}, perTurn: {}, per100Av: {},
  actionsPerCycle: 0, hitsPerAction: 0, multiTargetFraction: 0,
  damageShareByAttackType: {}, damageShareByElement: {}, survival: 1, lateDamageShare: 0,
  ...over,
})
const FV = (over: Partial<FeatureVector> = {}): FeatureVector => ({ hitGroups: 0, multiTargetHits: 0, maxTargets: 1, ...over } as FeatureVector)
const bounded = (axis: Record<string, number>): boolean => Object.values(axis).every(v => v >= 0 && v <= 1)

export default (): Case[] => {
  const acheron = run({ team: [{ kitId: 'acheron' }] })
  const fvA = featureVector(acheron.sim)
  const nfA = normalizeFeatures(fvA, lateDamageShare(acheron.sim))
  const profA = behaviorProfile(acheron.sim)
  const profA2 = behaviorProfile(run({ team: [{ kitId: 'acheron' }] }).sim)

  const clara = run({ team: [{ kitId: 'clara' }] }).sim
  const kafka = run({ team: [{ kitId: 'kafka' }] }).sim
  const luocha = run({ team: [{ kitId: 'luocha' }] }).sim

  const sum = (r: Record<string, number>): number => Object.values(r).reduce((a, b) => a + b, 0)
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9

  return [
    // ---- §65.3 integration ----
    case_('featureVector: reads real telemetry (actions/hits/damage/allies)', fvA.actions > 0 && fvA.hits > 0 && fvA.totalDamage > 0 && fvA.allies === 1),
    case_('normalizeFeatures: attack-type damage shares sum to 1', near(sum(nfA.damageShareByAttackType), 1)),
    case_('normalizeFeatures: element damage shares sum to 1', near(sum(nfA.damageShareByElement), 1)),
    case_('normalizeFeatures: rates derive from actions/turns/AV', near(nfA.hitsPerAction, fvA.hits / fvA.actions) && nfA.actionsPerCycle === fvA.actions / fvA.cycles),
    case_('profile is deterministic for the same seed', JSON.stringify(profA) === JSON.stringify(profA2)),
    case_('all §66 archetype scores are within [0,1]', bounded(profA.archetypes.delivery) && bounded(profA.archetypes.tempo) && bounded(profA.archetypes.target)),
    case_('Clara: intrinsic FUA/counter damage is detected', featureVector(clara).fua > 0 && deliveryScores(normalizeFeatures(featureVector(clara))).fua > 0),
    case_('Kafka: DoT application/ticks are detected', featureVector(kafka).dotTicks > 0),
    case_('Luocha: healing is detected', featureVector(luocha).healing > 0),

    // ---- §66 delivery (synthetic, exact) ----
    case_('delivery: shares map onto mechanisms, hybrid = 1 - dominant', (() => {
      const d = deliveryScores(NF({ damageShareByAttackType: { skill: 0.6, ult: 0.4 } }))
      return near(d.direct_damage, 0.6) && near(d.ultimate, 0.4) && near(d.hybrid, 0.4)
    })()),
    case_('delivery: a single-axis kit has hybrid 0', (() => {
      const d = deliveryScores(NF({ damageShareByAttackType: { fua: 1 } }))
      return near(d.fua, 1) && near(d.hybrid, 0)
    })()),
    case_('delivery: dot/break/elation map onto their axes', (() => {
      const d = deliveryScores(NF({ damageShareByAttackType: { dot: 0.5, break: 0.3, elation: 0.2 } }))
      return near(d.dot, 0.5) && near(d.break, 0.3) && near(d.direct_damage, 0.2)
    })()),

    // ---- §66 tempo (synthetic) ----
    case_('tempo: ramp tracks late damage share; fast_cycle saturates at 6 actions/cycle', (() => {
      const t = tempoScores(NF({ lateDamageShare: 0.9, actionsPerCycle: 6 }))
      return near(t.ramp, 0.9) && near(t.fast_cycle, 1) && near(t.slow_scaling, 0)
    })()),
    case_('tempo: action_driven saturates at 0.5 extra-actions per action', near(tempoScores(NF({ perAction: { extraTurns: 0.25, actionAdvances: 0.25 } })).action_driven, 1)),

    // ---- §66 target (synthetic) ----
    case_('target: fan-out 2-3 counts as blast', (() => {
      const t = targetScores(FV({ hitGroups: 4, multiTargetHits: 3, maxTargets: 3 }))
      return near(t.single_target, 0.25) && near(t.blast, 0.75) && near(t.aoe, 0)
    })()),
    case_('target: fan-out 4+ counts as AoE', (() => {
      const t = targetScores(FV({ hitGroups: 2, multiTargetHits: 2, maxTargets: 5 }))
      return near(t.aoe, 1) && near(t.single_target, 0)
    })()),

    // ---- §66 role (team-relative, only with context) ----
    case_('role: no team context yields an empty axis (no fake solo role)', Object.keys(roleScores(fvA)).length === 0),
    case_('role: half the team damage => hypercarry 0.5, sub_dps peaks', (() => {
      const r = roleScores(FV({ totalDamage: 100 }), { teamDamage: 200 })
      return near(r.hypercarry!, 0.5) && near(r.sub_dps!, 1)
    })()),
    case_('role: is bounded [0,1]', (() => {
      const r = roleScores(FV({ totalDamage: 100, healing: 5000, shielding: 0, buffApplied: 4, debuffApplied: 0 }), { teamDamage: 200, teamHealing: 5000, teamBuffApplications: 4 })
      return bounded(r as Record<string, number>)
    })()),

    // ---- §66 dominant axis ----
    case_('dominant: names a valid axis in each family', (() => {
      const d: ArchetypeScores = profA.archetypes
      return d.delivery[profA.dominant.delivery] === Math.max(...Object.values(d.delivery)) &&
        d.tempo[profA.dominant.tempo] === Math.max(...Object.values(d.tempo)) &&
        d.target[profA.dominant.target] === Math.max(...Object.values(d.target))
    })()),
  ]
}
