import { case_, type Case } from '../../suites'
import { classifyRoles, filterByRole, rankProviders, roleProfile, type RoleProfile, type RoleTag } from '../../../src/optimizer/pipeline'
import type { NeedScore, ProvideProfile } from '../../../src/analysis/causal'

/**
 * §72.1 role filtering (non-binding) + §72.2 compatibility pre-ranking. Classifier and ranker are
 * unit-tested as pure functions; `filterByRole` must never empty the candidate set (§72.1); ranking is
 * deterministic (§80.3).
 */

const prov = (over: Partial<ProvideProfile> = {}): ProvideProfile => ({
  buff: 0, debuff: 0, healing: 0, shielding: 0, dot: 0, break: 0, fua: 0, summon: 0, energy: 0, sp: 0, ...over,
})
const rp = (kitId: string, over: Partial<ProvideProfile>, roles?: RoleTag[]): RoleProfile => {
  const provides = prov(over)
  const r = roles ?? classifyRoles(provides)
  return { kitId, roles: r, primary: r[0]!, provides, delivery: 'single' }
}
const ns = (feature: NeedScore['feature'], mean: number): NeedScore => ({ feature, mean, stddev: 0, samples: 1, scenarios: 1 })

export default (): Case[] => {
  const supportOnly = [rp('a', { buff: 1 }, ['support', 'carry']), rp('b', { debuff: 0.5 }, ['support', 'carry'])]
  const ranked = rankProviders([ns('damage_boost', 2)], [rp('buffer', { buff: 1 }), rp('energizer', { energy: 1 })])
  const conflict = rankProviders([ns('damage_boost', -2)], [rp('x', { buff: 1 })])

  return [
    // ---- §72.1 classify ----
    case_('classifyRoles: a buffer leads with support, still carries', classifyRoles(prov({ buff: 1 }))[0] === 'support'),
    case_('classifyRoles: a healer leads with sustain', classifyRoles(prov({ healing: 1 }))[0] === 'sustain'),
    case_('classifyRoles: no utility ⇒ carry-only floor (never empty)', classifyRoles(prov()).join(',') === 'carry'),

    // ---- §72.1 non-binding filter ----
    case_('filterByRole: falls back to the full set when nothing matches (§72.1)', filterByRole(supportOnly, ['summoner']).length === supportOnly.length),
    case_('filterByRole: keeps only matching roles when a match exists', filterByRole(supportOnly, ['support']).length === 2 && filterByRole([rp('c', {}, ['carry'])], ['support']).length === 1),

    // ---- §72.2 ranking ----
    case_('rankProviders: a needed buffer outranks an unneeded energizer', ranked[0]!.kitId === 'buffer' && ranked[0]!.breakdown.needsSatisfied > 0),
    case_('rankProviders: topK slices the ranking', rankProviders([ns('damage_boost', 2)], supportOnly, { topK: 1 }).length === 1),
    case_('rankProviders: conflicts reduce the score below the provided benefit', conflict[0]!.score < conflict[0]!.breakdown.providedBenefits && conflict[0]!.breakdown.conflicts > 0),
    case_('rankProviders: deterministic — ties break by kitId', rankProviders([ns('damage_boost', 1)], [rp('z', { buff: 1 }), rp('a', { buff: 1 })])[0]!.kitId === 'a'),

    // ---- §72.1 real probe ----
    case_('roleProfile(pela): reports a utility provide and a role tag', (() => {
      const p = roleProfile('pela')
      const util = p.provides.debuff + p.provides.buff
      return util > 0 && p.roles.includes('support')
    })()),
  ]
}
