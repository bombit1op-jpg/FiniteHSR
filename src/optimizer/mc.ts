/**
 * §73 — MONTE-CARLO-ASSISTED SEARCH. §72.3 warns against simulating millions of teams in equal detail,
 * and §72.5 wants exact simulation only on top candidates. This stage wires the two together: a CHEAP
 * broad screen samples EVERY candidate over a small seed set (noisy but cheap) and keeps a top-`shortlist`
 * frontier; the PRECISE stage then re-scores ONLY that frontier — the target seed for a single-run
 * objective (§74), or a larger seed set for a multi-run objective (`variance`/`consistency`, §73). It is
 * the APPROXIMATE stage: exhaustive search / exhaustive sampling is the authority, and `mcReport` measures
 * the screen's recall against it (§80.2). Deterministic: a fixed seed set gives the same screen and result.
 */
import { configToSetup, candidateCount, type SearchSpace, type FullTeamConfig, type Objective } from './space'
import { rank, compareCandidates, bruteForce, type ScoredCandidate } from './search'
import { evaluateSpaceSampled, sampleCandidate, sampleValues } from './sample'
import { evaluateCandidate, MULTI_RUN_METRICS, type ScoreOptions } from './score'

export interface McOptions extends ScoreOptions {
  /** how many candidates survive the cheap screen into the precise stage (default 8) */
  shortlist?: number
  /** seed count used by the cheap screen (default 2) */
  screenSamples?: number
  /** seed count used by the precise stage for a multi-run objective (default 6) */
  finalSamples?: number
}

export interface McResult {
  best?: ScoredCandidate
  /** precise-stage ranking of the shortlist (best first) */
  ranked: ScoredCandidate[]
  /** the frontier that survived the cheap screen, in screen order */
  frontier: FullTeamConfig[]
  /** candidates that went through the cheap screen (the whole space) */
  screened: number
  /** candidates advanced to the precise stage */
  shortlisted: number
}

const seedsFrom = (base: number, n: number): number[] =>
  Array.from({ length: Math.max(1, n) }, (_, i) => base + i)

/** does the objective reference a metric only repeated sampling can produce (§73 boundary)? */
export const objectiveUsesMultiRun = (o: Objective): boolean => {
  const used = [o.primary, ...(o.secondary ?? []), ...(o.constraints ?? []).map(c => c.metric)]
  return used.some(m => MULTI_RUN_METRICS.includes(m))
}

/**
 * §73 two-stage search. Stage 1 (cheap screen): sample EVERY candidate over `screenSamples` seeds and
 * keep the top `shortlist` by sampled objective. Stage 2 (precise): re-score only that frontier — the
 * target seed for a single-run objective (§74), or `finalSamples` seeds for a multi-run one (variance /
 * consistency, §73). Approximate by design: `mcReport` measures it against the exhaustive reference.
 */
export function mcAssistedSearch(space: SearchSpace, opts: McOptions = {}): McResult {
  const shortlist = Math.max(1, opts.shortlist ?? 8)
  const screenSeeds = seedsFrom(space.seed, opts.screenSamples ?? 2)
  const finalSeeds = seedsFrom(space.seed, opts.finalSamples ?? 6)
  const multi = objectiveUsesMultiRun(space.objective)

  // Stage 1 — cheap broad screen.
  const screened = rank(evaluateSpaceSampled(space, { seeds: screenSeeds, log: opts.log }), space.objective)
  const frontier = screened.slice(0, shortlist)

  // Stage 2 — precise narrow stage.
  const precise: ScoredCandidate[] = frontier.map(c => {
    const setup = configToSetup(space, c.config, { log: opts.log })
    if (multi) {
      const r = sampleCandidate(setup, space.objective, { seeds: finalSeeds, log: opts.log })
      return { config: c.config, metrics: r.runs[0]!.metrics, values: sampleValues(r), constraints: r.constraints, feasible: r.feasibleRate >= 1 }
    }
    const r = evaluateCandidate(setup, space.objective, { log: opts.log })
    return { config: c.config, metrics: r.metrics, values: r.values, constraints: r.constraints, feasible: r.feasible }
  })
  const ranked = rank(precise, space.objective)

  return {
    best: ranked.find(c => c.feasible),
    ranked,
    frontier: frontier.map(c => c.config),
    screened: screened.length,
    shortlisted: frontier.length,
  }
}

export interface McReport {
  /** §80.2: does the MC-assisted result reach the same optimum as the exhaustive reference? */
  match: boolean
  /** did the cheap screen actually keep the exhaustive optimum in its frontier? */
  shortlistHasOptimum: boolean
  mc?: ScoredCandidate
  oracle?: ScoredCandidate
  candidates: number
  screened: number
  shortlisted: number
}

const sameConfig = (a: FullTeamConfig, b: FullTeamConfig): boolean =>
  a.seed === b.seed && JSON.stringify(a.members) === JSON.stringify(b.members)

/** §80.2 correctness check: the exhaustive reference vs the two-stage MC-assisted result. */
export function mcReport(space: SearchSpace, opts: McOptions = {}): McReport {
  const multi = objectiveUsesMultiRun(space.objective)
  // the oracle uses the SAME precise scoring regime (target seed for single-run, finalSeeds for multi-run).
  const oracle = multi
    ? rank(evaluateSpaceSampled(space, { seeds: seedsFrom(space.seed, opts.finalSamples ?? 6), log: opts.log }), space.objective).find(c => c.feasible)
    : bruteForce(space, opts)
  const mc = mcAssistedSearch(space, opts)
  const match = !!oracle && !!mc.best && compareCandidates(oracle, mc.best, space.objective) === 0
  const shortlistHasOptimum = !!oracle && mc.frontier.some(f => sameConfig(f, oracle.config))
  return { match, shortlistHasOptimum, mc: mc.best, oracle, candidates: candidateCount(space), screened: mc.screened, shortlisted: mc.shortlisted }
}
