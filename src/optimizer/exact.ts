import { runBattle } from '../core/battle'
import { teamMetrics } from '../analysis/compare'
import type { EncounterSpec } from '../core/encounter'
import { configToSetup, type FullTeamConfig, type SearchSpace } from './space'

/**
 * §72.5 EXACT SIMULATION for top candidates — the last pipeline stage, distinct from the §73 Monte-Carlo
 * *scoring* stage: it does NOT reduce to one grade, it reports the full outcome distribution over a seed
 * set and an encounter set (multiple target counts / endgame scenarios), as §72.5 lists:
 * mean, median, variance, P10/P50/P90/P99, failure rate, cycles, turns, deaths.
 *
 * Failure is defined explicitly as "any ally died during the battle" (survival < 1); deaths is the
 * per-battle count of allies lost. Everything is deterministic given the explicit `seeds`/`encounters`
 * (§80.4); no RNG beyond the seeded engine.
 */

export interface ExactOptions {
  /** explicit seed set; when omitted, `samples` consecutive seeds from the config's seed */
  seeds?: number[]
  samples?: number
  /** encounters to run (target-count / scenario variants). When omitted, only the config's encounter. */
  encounters?: EncounterSpec[]
}

export interface Distribution {
  n: number
  mean: number
  median: number
  variance: number
  stdev: number
  min: number
  max: number
  p10: number
  p50: number
  p90: number
  p99: number
}

export interface ExactRun {
  encounter: string
  seed: number
  totalDamage: number
  cycles: number
  turns: number
  deaths: number
  failure: boolean
}
export interface ExactEncounterSummary { id: string; runs: number; totalDamage: Distribution; failureRate: number }
export interface ExactOutcome {
  runs: number
  totalDamage: Distribution
  cycles: Distribution
  turns: Distribution
  deaths: Distribution
  /** fraction of runs in which at least one ally died */
  failureRate: number
  perEncounter: ExactEncounterSummary[]
  raw: ExactRun[]
}

function dist(xs: number[]): Distribution {
  const finite = xs.filter(Number.isFinite)
  if (finite.length === 0) return { n: 0, mean: NaN, median: NaN, variance: NaN, stdev: NaN, min: NaN, max: NaN, p10: NaN, p50: NaN, p90: NaN, p99: NaN }
  const sorted = [...finite].sort((a, b) => a - b)
  const mean = finite.reduce((s, x) => s + x, 0) / finite.length
  const variance = finite.reduce((s, x) => s + (x - mean) ** 2, 0) / finite.length
  const at = (q: number): number => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!
  return { n: finite.length, mean, median: at(0.5), variance, stdev: Math.sqrt(variance), min: sorted[0]!, max: sorted[sorted.length - 1]!, p10: at(0.1), p50: at(0.5), p90: at(0.9), p99: at(0.99) }
}

/** §72.5 run one configuration over seeds × encounters and return the outcome distributions. */
export function exactSimulation(cfg: FullTeamConfig, space: SearchSpace, opts: ExactOptions = {}): ExactOutcome {
  const seeds = opts.seeds ?? Array.from({ length: Math.max(1, opts.samples ?? 4) }, (_, i) => (cfg.seed ?? 0) + i)
  const encounters = opts.encounters ?? [cfg.encounter]
  const log = { debug: 4 } as const

  const raw: ExactRun[] = []
  for (const enc of encounters) {
    for (const seed of seeds) {
      const setup = configToSetup(space, { ...cfg, encounter: enc, seed })
      const sim = runBattle({ ...setup, log })
      const m = teamMetrics(sim)
      const deaths = sim.roster.filter(u => u.side !== 'enemy' && u.dead).length
      raw.push({ encounter: enc.id, seed, totalDamage: m.totalDamage, cycles: m.cycles, turns: m.turns, deaths, failure: deaths > 0 })
    }
  }

  const perEncounter: ExactEncounterSummary[] = encounters.map(enc => {
    const runs = raw.filter(r => r.encounter === enc.id)
    return {
      id: enc.id,
      runs: runs.length,
      totalDamage: dist(runs.map(r => r.totalDamage)),
      failureRate: runs.length ? runs.filter(r => r.failure).length / runs.length : 0,
    }
  })

  return {
    runs: raw.length,
    totalDamage: dist(raw.map(r => r.totalDamage)),
    cycles: dist(raw.map(r => r.cycles)),
    turns: dist(raw.map(r => r.turns)),
    deaths: dist(raw.map(r => r.deaths)),
    failureRate: raw.length ? raw.filter(r => r.failure).length / raw.length : 0,
    perEncounter,
    raw,
  }
}
