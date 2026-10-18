import { needProfile, type CausalFeatureId, type NeedScore } from '../analysis/causal'
import { marginalValue, spearman, type TeamValueOptions } from '../analysis/team'
import { rankProviders, type RankedProvider, type RoleProfile } from './pipeline'

/**
 * §78 COMPATIBILITY MODEL vs EXACT SIMULATOR. The §69/§72.2 compatibility score is NEVER proof (§78):
 * this module keeps the discrepancy between what the cheap model predicts and what the exact engine
 * measures, in the exact shape §78 asks for — `predicted_rank`, `actual_rank`, `confidence`, the
 * `scenario`, and the feature profile behind the need — so the model can be calibrated rather than
 * trusted. Prediction = `rankProviders` (§72.2); measurement = §70 marginal value of each provider on
 * the real engine. `spearman` is the calibration signal (order only, never absolute units).
 */

export interface CalibrationRecord {
  kitId: string
  predictedScore: number
  predictedRank: number
  actualScore: number
  actualRank: number
  /** §68 confidence behind the need satisfied here (samples per feature) */
  confidence: number
}

export interface CalibrationResult {
  /** §78 scenario + feature profile this discrepancy was recorded under */
  scenario: string
  features: CausalFeatureId[]
  records: CalibrationRecord[]
  /** rank agreement between the cheap model and the exact simulator (order only) */
  spearman: number
  /** did the model pick the same top provider the simulator did? */
  topMatch: boolean
}

const DEFAULT_NEED_FEATURES: CausalFeatureId[] = ['damage_boost', 'crit_dmg', 'crit_rate', 'atk_boost', 'res_pen', 'final_boost']

export interface CalibrateOptions extends TeamValueOptions {
  features?: CausalFeatureId[]
}

function rankOf<T>(items: T[], value: (t: T) => number, id: (t: T) => string): Map<string, number> {
  const sorted = [...items].sort((a, b) => value(b) - value(a) || (id(a) < id(b) ? -1 : id(a) > id(b) ? 1 : 0))
  return new Map(sorted.map((t, i) => [id(t), i + 1]))
}

/** §78 record the predicted vs actual provider ranking for one core, under one scenario. */
export function calibrate(core: string, providers: RoleProfile[], opts: CalibrateOptions = {}): CalibrationResult {
  const features = opts.features ?? DEFAULT_NEED_FEATURES
  const need: NeedScore[] = needProfile(core, { scenarios: ['single'], seeds: [7], features })
  const confidence = need.length ? need.reduce((s, n) => s + n.samples, 0) / need.length : 0

  const predicted: RankedProvider[] = rankProviders(need, providers)
  const actual = providers.map(p => ({ id: p.kitId, measured: marginalValue(p.kitId, [core], opts) }))

  const predictedRank = new Map(predicted.map((p, i) => [p.kitId, i + 1]))
  const actualRank = rankOf(actual, a => a.measured, a => a.id)
  const measuredById = new Map(actual.map(a => [a.id, a.measured]))

  const records: CalibrationRecord[] = predicted.map(p => ({
    kitId: p.kitId,
    predictedScore: p.score,
    predictedRank: predictedRank.get(p.kitId)!,
    actualScore: measuredById.get(p.kitId) ?? NaN,
    actualRank: actualRank.get(p.kitId) ?? NaN,
    confidence,
  }))

  const sp = spearman(predicted.map(p => p.score), providers.map(p => measuredById.get(p.kitId) ?? NaN))
  const topMatch = predicted.length > 0 && actual.length > 0 && predicted[0]!.kitId === actual.slice().sort((a, b) => b.measured - a.measured || (a.id < b.id ? -1 : 1))[0]!.id

  return { scenario: 'single', features, records, spearman: sp, topMatch }
}
