/**
 * §73 MONTE-CARLO-ASSISTED SCORING. Runs the SAME candidate over a seed set and aggregates §74 metrics
 * so the two objectives a single battle cannot answer become measurable:
 *
 *   variance     = population variance of totalDamage across the sampled seeds
 *   consistency  = 1 - coefficient of variation of totalDamage (1 = perfectly reproducible)
 *
 * `sampleValues` returns a full `MetricValues`, so it feeds the same `compareValues`/constraints as the
 * single-run path — an objective whose primary is `variance`/`consistency` is scorable here and stays
 * refused by `assertSingleRun`. Everything is deterministic: the same seed set gives the same summary.
 */
import { runBattle, type BattleSetup } from '../core/battle'
import { objectiveValue, checkConstraints, isFeasible, type MetricValues, type ScoreOptions, type ConstraintResult } from './score'
import { configToSetup, teamCandidates, type Objective, type ObjectiveMetric, type SearchSpace } from './space'
import type { TeamMetrics } from '../analysis/compare'
import { teamMetrics } from '../analysis/compare'
import type { ScoredCandidate } from './search'

export interface MetricStats { mean: number; median: number; min: number; max: number; variance: number; stdev: number; p5: number; p95: number }
export type MetricSummary = Record<ObjectiveMetric, MetricStats>

export interface SampleOptions extends ScoreOptions {
  /** explicit seed set; when omitted, `samples` consecutive seeds from the setup's base seed */
  seeds?: number[]
  /** number of seeds when `seeds` is omitted (default 4) */
  samples?: number
}

export interface SampleResult {
  seeds: number[]
  runs: { seed: number; values: MetricValues; metrics: TeamMetrics }[]
  /** per-metric distribution across the sampled runs (multi-run metrics carry NaN for the raw metric) */
  summary: MetricSummary
  /** fraction of runs whose battle satisfied every hard constraint (§74) */
  feasibleRate: number
  constraints: ConstraintResult[]
}

const expandSeeds = (base: number, opts: SampleOptions): number[] =>
  opts.seeds ?? Array.from({ length: Math.max(1, opts.samples ?? 4) }, (_, i) => base + i)

function stats(xs: number[]): MetricStats {
  const finite = xs.filter(Number.isFinite)
  if (finite.length === 0) return { mean: NaN, median: NaN, min: NaN, max: NaN, variance: NaN, stdev: NaN, p5: NaN, p95: NaN }
  const sorted = [...finite].sort((a, b) => a - b)
  const mean = finite.reduce((s, x) => s + x, 0) / finite.length
  const variance = finite.reduce((s, x) => s + (x - mean) ** 2, 0) / finite.length
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!
  return {
    mean, median: at(0.5), min: sorted[0]!, max: sorted[sorted.length - 1]!,
    variance, stdev: Math.sqrt(variance), p5: at(0.05), p95: at(0.95),
  }
}

const consistency = (mean: number, stdev: number): number =>
  Number.isFinite(mean) && mean > 0 ? Math.max(0, Math.min(1, 1 - stdev / mean)) : 1

/** run one candidate over the seed set and aggregate. */
export function sampleCandidate(setup: BattleSetup, objective: Objective, opts: SampleOptions = {}): SampleResult {
  const seeds = expandSeeds(setup.seed, opts)
  const log = opts.log ?? { debug: 4 }
  const runs = seeds.map(seed => {
    const sim = runBattle({ ...setup, seed, log })
    return { seed, values: objectiveValue(sim), metrics: teamMetrics(sim) }
  })

  const keys = Object.keys(runs[0]!.values) as ObjectiveMetric[]
  const summary = {} as MetricSummary
  for (const k of keys) summary[k] = stats(runs.map(r => r.values[k]))
  // the two multi-run metrics are DERIVED from totalDamage's spread, not averaged across seeds.
  const td = summary.totalDamage
  const cons = consistency(td.mean, td.stdev)
  summary.variance = { mean: td.variance, median: td.variance, min: td.variance, max: td.variance, variance: 0, stdev: 0, p5: td.variance, p95: td.variance }
  summary.consistency = { mean: cons, median: cons, min: cons, max: cons, variance: 0, stdev: 0, p5: cons, p95: cons }

  const constraints = checkConstraints(runs[0]!.values, objective)
  const feasibleVotes = runs.map(r => isFeasible(r.values, objective))
  const feasibleRate = feasibleVotes.length ? feasibleVotes.filter(Boolean).length / feasibleVotes.length : 1

  return { seeds, runs, summary, feasibleRate, constraints }
}

/** collapse a sample into one `MetricValues` record: single-run metrics averaged, multi-run derived. */
export function sampleValues(result: SampleResult): MetricValues {
  const out = {} as MetricValues
  for (const [k, s] of Object.entries(result.summary) as [ObjectiveMetric, MetricStats][]) out[k] = s.mean
  return out
}

/** Monte-Carlo grade every candidate in a space (aggregated values), for a sampled-objective search. */
export function evaluateSpaceSampled(space: SearchSpace, opts: SampleOptions = {}): ScoredCandidate[] {
  const out: ScoredCandidate[] = []
  for (const cfg of teamCandidates(space)) {
    const r = sampleCandidate(configToSetup(space, cfg), space.objective, opts)
    out.push({
      config: cfg, metrics: r.runs[0]!.metrics, values: sampleValues(r),
      constraints: r.constraints, feasible: r.feasibleRate >= 1,
    })
  }
  return out
}
