import { run, mob, raw } from '../../_helpers/battle'
import { analyzeRun, explainDelta, compareRuns } from '../../../src/analysis/run'
import { attributeDamage, marginalContribution, interactionContribution, shareOf } from '../../../src/analysis/attribution'
import { compareTeams } from '../../../src/analysis/compare'

/**
 * §39-40 analysis layer: `analyzeRun` (metrics + audit + attribution artefact), `explainDelta`
 * (first-divergence + metric WHY), `compareRuns` (guided name for the §77 comparison). Checks the
 * composed artefact is a pure read of the closed layers and the causal helpers behave.
 */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6

export default () => {
  const tanky = mob({ hp: 400_000, toughness: 160, spd: 110 })
  const teamA = [{ kitId: 'acheron', skillPriority: 1 }, { kitId: 'pela', skillPriority: 2 }, { kitId: 'guinaifen', skillPriority: 2 }, { kitId: 'bronya', skillPriority: 3 }]
  const teamB = [{ kitId: 'acheron', skillPriority: 1 }, { kitId: 'pela', skillPriority: 2 }, { kitId: 'guinaifen', skillPriority: 2 }, { kitId: 'sparkle', skillPriority: 3 }]
  const a = run({ team: teamA, enemy: tanky })
  const b = run({ team: teamB, enemy: tanky })

  const analysis = analyzeRun({ sim: a.sim, team: teamA })
  const attr = attributeDamage(a.sim)
  const ownerTotal = Object.values(attr.byOwner).reduce((s, v) => s + v, 0)
  const typeTotal = Object.values(attr.byAttackType).reduce((s, v) => s + v, 0)
  const allyNames = a.sim.roster.filter(u => u.side !== 'enemy').map(u => u.name)

  const self1 = run({ team: teamA, enemy: tanky })
  const self2 = run({ team: teamA, enemy: tanky })
  const selfDelta = explainDelta(self1.sim, self2.sim)
  const delta = explainDelta(a.sim, b.sim)
  const cmp = compareTeams(a.sim, b.sim)
  const runs = compareRuns(a.sim, b.sim)

  return [
    raw('analyzeRun: artefact carries metrics + audit + attribution', analysis.metrics.totalDamage > 0 && analysis.eventCount > 0 && !!analysis.attribution, `events=${analysis.eventCount}`),
    raw('analyzeRun: composed audit is green on a real team', analysis.ok, analysis.ok ? '' : analysis.text.split('\n').filter(l => l.includes('FAIL')).join(' | ')),
    raw('analyzeRun: text renders both the audit and the attribution tables', /TEAM AUDIT/.test(analysis.text) && /ATTRIBUTION/.test(analysis.text) && /by owner/.test(analysis.text)),
    raw('attribution: applied damage is positive and attributed to a real attacker', attr.totalApplied > 0 && Object.keys(attr.byAttacker).some(n => allyNames.includes(n)), `applied=${Math.round(attr.totalApplied)}`),
    raw('attribution: owner view sums to the run total damage', near(ownerTotal, analysis.metrics.totalDamage), `owner=${Math.round(ownerTotal)} total=${Math.round(analysis.metrics.totalDamage)}`),
    raw('attribution: attack-type axis sums to the run total damage', near(typeTotal, analysis.metrics.totalDamage), `axis=${Math.round(typeTotal)}`),
    raw('attribution: element view partitions all applied damage', near(Object.values(attr.byElement).reduce((s, v) => s + v, 0), attr.totalApplied)),
    raw('causal helpers: marginal / interaction / share', marginalContribution(100, 40) === 60 && interactionContribution(100, 40, 30) === 30 && near(shareOf(25, 100), 0.25) && shareOf(1, 0) === 0),
    raw('compareRuns: guided name yields the same comparison as compareTeams', runs.winner === cmp.winner && runs.rows.length === cmp.rows.length && near(runs.a.totalDamage, cmp.a.totalDamage)),
    raw('explainDelta: identical runs → no divergence, determinism cited', selfDelta.kind === 'none' && selfDelta.index === -1 && selfDelta.commonPrefix > 0 && selfDelta.why.some(w => /identical/.test(w)), `${selfDelta.kind} prefix=${selfDelta.commonPrefix}`),
    raw('explainDelta: a support swap diverges at a real event', delta.kind !== 'none' && delta.index >= 0 && !!delta.a && !!delta.b, `kind=${delta.kind} idx=${delta.index} A=${delta.a?.type ?? '-'} B=${delta.b?.type ?? '-'}`),
    raw('explainDelta: report names the divergence and the metric WHY', /RUN DELTA/.test(delta.text) && /WHY:/.test(delta.text) && delta.why.length > 0, delta.why.join(' | ')),
  ]
}
