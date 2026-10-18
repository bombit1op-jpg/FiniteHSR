/**
 * §85.E1 — per-ability inventory pin.
 *
 *  `coverage.ts` pins one row per enemy *base name*; this pins the expansion of the authored
 *  registry into one row per declared *ability*. The totals are deliberate: a new ability or
 *  behavior batch cannot silently change the inventory. `requirements` is Σ over abilities of the
 *  applicable verification dimensions (rule 7 of the §85 task), i.e. "requirements enumerated".
 *
 *  Test *linkage* is deliberately NOT pinned here — it is a heuristic filesystem scan produced by
 *  `inventory-report.ts`, not engine state, so asserting it in a suite would couple the corpus to
 *  a string heuristic. This suite pins the registry shape only.
 */
import { t } from '../../suites'
import { enemyAbilityInventory, enemyInventorySummary } from '../../../src/core/enemy/inventory'
import { enemyCoverageSummary, implementedEnemyNames } from '../../../src/core/enemy/coverage'

export default () => {
  const rows = enemyAbilityInventory()
  const s = enemyInventorySummary(rows)
  const cov = enemyCoverageSummary()
  const impl = new Set(implementedEnemyNames())

  const cases = [
    t.eq('inventory: enemies == 250', s.enemies, 250),
    t.eq('inventory: abilities == 631', s.abilities, 631),
    t.eq('inventory: enumerated requirements == 3224', s.requirements, 3224),
    t.eq('inventory: rank ability split', s.byRank, { mob: 179, elite: 164, boss: 288 }),
    t.eq('inventory: telegraphed abilities == 68', s.telegraphed, 68),
    t.eq('inventory: state-gated abilities == 43', s.withRequire, 43),
    t.eq('inventory: charged abilities == 8', s.withCharges, 8),
    t.eq('inventory: passive-carrying behaviours == 71', s.passiveBehaviors, 71),
    t.eq('inventory: phased behaviours == 1', s.phasedBehaviors, 1),

    // cross-checks against the §64 base-name coverage registry
    t.eq('inventory: enemy count == coverage bases', s.enemies, cov.bases),
    t.eq('inventory: coverage behavioural == presence in inventory', cov.behavioral, s.enemies),
    t.truthy('inventory: every inventory enemy is a resolved implemented name',
      [...new Set(rows.map(r => r.enemy))].every(n => impl.has(n))),

    // shape invariants
    t.eq('inventory: ability row ids unique', new Set(rows.map(r => r.id)).size, rows.length),
    t.eq('inventory: requirements == Σ dimensions', s.requirements, rows.reduce((n, r) => n + r.dimensions.length, 0)),
    t.eq('inventory: rank split sums to abilities', s.byRank.mob + s.byRank.elite + s.byRank.boss, s.abilities),
    t.truthy('inventory: every ability declares >=1 dimension', rows.every(r => r.dimensions.length > 0)),
    // rule 7: every effect-bearing ability declares a targeting dimension + its target rule (only
    // effect-less behavioural actions are exempt, marked 'no-op').
    t.truthy('inventory: every effect ability declares targeting + a target-* rule',
      rows.every(r => r.dimensions.includes('no-op') || (r.dimensions.includes('targeting') && r.dimensions.some(x => x.startsWith('target-'))))),
    t.truthy('inventory: every ability has id and name', rows.every(r => r.abilityId.length > 0 && r.abilityName.length > 0)),
    t.eq('inventory: telegraphed flag matches cast>0', rows.filter(r => r.telegraphed).length, s.telegraphed),
  ]
  return cases
}
