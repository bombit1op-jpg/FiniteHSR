import { case_, type Case } from '../../suites'
import { run } from '../../_helpers/battle'
import { provideProfile, needProfile, type NeedScore, type ProvideProfile } from '../../../src/analysis/causal'
import {
  scoreKits, marginalValue, replacementValue, interactionTerm, pairInteraction, shapleyValue,
  predictCompatibility, rankAgreement,
} from '../../../src/analysis/team'

/**
 * §69 team compatibility + §70 team value. The §70 readings are identities over real runs (marginal /
 * replacement / interaction / Shapley); §69's predictive score is unit-tested as a pure function and its
 * only claim — ranking providers like the measurement does — is exposed via `rankAgreement` (Spearman),
 * never as an absolute number.
 */

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const ns = (feature: string, mean: number): NeedScore => ({ feature: feature as NeedScore['feature'], mean, stddev: 0, samples: 1, scenarios: 1 })
const prov = (over: Partial<ProvideProfile> = {}): ProvideProfile => ({
  buff: 0, debuff: 0, healing: 0, shielding: 0, dot: 0, break: 0, fua: 0, summon: 0, energy: 0, sp: 0, ...over,
})

export default (): Case[] => {
  const sA = scoreKits(['acheron'])
  const sAP = scoreKits(['acheron', 'pela'])
  const sCore = scoreKits(['luocha'])
  const sCoreAP = scoreKits(['luocha', 'acheron', 'pela'])

  const phi = shapleyValue(['acheron'], ['pela', 'kafka'])
  const phi2 = shapleyValue(['acheron'], ['pela', 'kafka'])

  const need = needProfile('acheron', { scenarios: ['single'], seeds: [7], features: ['damage_boost', 'break_effect', 'crit_dmg'] })
  const pela = provideProfile(run({ team: [{ kitId: 'pela' }] }).sim)

  return [
    // ---- §70.2 marginal ----
    case_('marginalValue: equals Score(core+m) - Score(core)', near(marginalValue('pela', ['acheron']), sAP - sA)),
    case_('marginalValue: empty core is the solo score', near(marginalValue('acheron', []), sA)),

    // ---- §70.3 replacement ----
    case_('replacementValue: R(j->i) = Score((T-j)+i) - Score(T)', (() => {
      const team = ['acheron', 'pela', 'luocha']
      const expected = scoreKits(['acheron', 'kafka', 'luocha']) - scoreKits(team)
      return near(replacementValue('kafka', 'pela', team), expected)
    })()),

    // ---- §69.3 / §70 interaction ----
    case_('interactionTerm: I(A,B|R) = S(R+A+B) - S(R+A) - S(R+B) + S(R)', near(interactionTerm('acheron', 'pela', ['luocha']), sCoreAP - scoreKits(['luocha', 'acheron']) - scoreKits(['luocha', 'pela']) + sCore)),
    case_('pairInteraction: equals interactionTerm with empty core (Score(empty)=0)', near(pairInteraction('acheron', 'pela'), interactionTerm('acheron', 'pela', []))),
    case_('scoreKits: empty team scores zero', scoreKits([]) === 0),

    // ---- §70.4 Shapley ----
    case_('shapleyValue: phi sums to Score(core+members) - Score(core)', (() => {
      const sum = Object.values(phi).reduce((a, b) => a + b, 0)
      return near(sum, scoreKits(['acheron', 'pela', 'kafka']) - sA)
    })()),
    case_('shapleyValue: deterministic for the same seed', JSON.stringify(phi) === JSON.stringify(phi2)),

    // ---- §69.1 predictive compatibility (pure unit) ----
    case_('predictCompatibility: break provider satisfies a break need', (() => {
      const r = predictCompatibility([ns('break_effect', 0.4)], prov({ break: 1 }))
      return near(r.needsSatisfied, 0.4) && near(r.conflicts, 0) && near(r.score, 0.4 + 1)
    })()),
    case_('predictCompatibility: a negative need is a conflict (subtracted)', (() => {
      const r = predictCompatibility([ns('speed', -0.3)], prov({ buff: 0 }))
      return r.conflicts === 0 && near(r.score, 0)
    })()),
    case_('predictCompatibility: benefits raise the score, conflicts lower it', (() => {
      const noProvide = predictCompatibility([ns('damage_boost', 0.5)], prov())
      const withBuff = predictCompatibility([ns('damage_boost', 0.5)], prov({ buff: 1 }))
      return withBuff.score > noProvide.score
    })()),

    // ---- §69 the cheap score's only claim: ranking ----
    case_('rankAgreement: one pair per provider and Spearman in [-1,1]', (() => {
      const r = rankAgreement(need, 'acheron', [{ id: 'pela', provide: pela }, { id: 'kafka', provide: prov({ break: 1 }) }])
      return r.pairs.length === 2 && r.spearman >= -1 && r.spearman <= 1 && Number.isFinite(r.spearman)
    })()),
    case_('rankAgreement: predicted/measured recorded for calibration', (() => {
      const r = rankAgreement(need, 'acheron', [{ id: 'pela', provide: pela }])
      return r.pairs.length === 1 && Number.isFinite(r.pairs[0]!.predicted) && Number.isFinite(r.pairs[0]!.measured)
    })()),

    // ---- determinism ----
    case_('scoreKits: deterministic for the same scenario/seed', scoreKits(['acheron', 'pela']) === sAP),
  ]
}
