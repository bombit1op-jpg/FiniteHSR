import { case_, type Case } from '../../suites'
import { roleProfile } from '../../../src/optimizer/pipeline'
import { calibrate } from '../../../src/optimizer/calibration'

/**
 * §78 compatibility model vs exact simulator: keeps the predicted/actual ranking discrepancy and its
 * Spearman agreement, instead of treating the cheap score as proof. Deterministic given the seed.
 */

export default (): Case[] => {
  const providers = [roleProfile('pela'), roleProfile('kafka')]
  const cal = calibrate('acheron', providers)
  const again = calibrate('acheron', providers)

  const rankSet = new Set(cal.records.map(r => r.actualRank))
  const predSet = new Set(cal.records.map(r => r.predictedRank))

  return [
    case_('calibrate: one record per provider, with both ranks', cal.records.length === 2 && rankSet.has(1) && rankSet.has(2) && predSet.has(1) && predSet.has(2)),
    case_('calibrate: Spearman agreement is finite and in [-1, 1]', Number.isFinite(cal.spearman) && cal.spearman >= -1 && cal.spearman <= 1),
    case_('calibrate: confidence reflects the §68 need samples', cal.records.every(r => r.confidence > 0)),
    case_('calibrate: records the scenario and feature profile (§78)', cal.scenario === 'single' && cal.features.length === 6),
    case_('calibrate: topMatch is a boolean', typeof cal.topMatch === 'boolean'),
    case_('calibrate: deterministic for the same seed', cal.spearman === again.spearman && JSON.stringify(cal.records.map(r => r.actualRank)) === JSON.stringify(again.records.map(r => r.actualRank))),
    case_('calibrate: measured scores are real numbers', cal.records.every(r => Number.isFinite(r.actualScore))),
  ]
}
