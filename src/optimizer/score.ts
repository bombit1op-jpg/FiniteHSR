/**
 * §74 — OBJECTIVE SCORING. Maps one completed battle to a scalar for whichever build objective the
 * search asks for, plus hard-constraint feasibility. It is deliberately a pure function of a finished
 * `Simulator` + an `Objective`, so the search layer (§72) never embeds a metric formula and the oracle
 * stays testable in isolation.
 *
 * A single run can only answer single-run objectives. `variance` / `consistency` need many samples and
 * belong to the Monte-Carlo stage (§73); asking for them here THROWS rather than returning a silent NaN,
 * so a caller cannot mistake "not measured yet" for a real score.
 */
import { runBattle, type BattleSetup } from '../core/battle'
import type { Simulator } from '../core/simulator'
import type { LogConfig } from '../core/battlelog'
import { teamMetrics, type TeamMetrics } from '../analysis/compare'
import { objectiveDirection, OBJECTIVE_DIRECTION, type Objective, type ObjectiveMetric } from './space'

/** Metrics that a single battle cannot produce (need repeated sampling — §73). */
export const MULTI_RUN_METRICS: readonly ObjectiveMetric[] = ['variance', 'consistency']

export type MetricValues = Record<ObjectiveMetric, number>

const amountOf = (payload: Record<string, unknown>): number => {
  const a = payload.amount
  return typeof a === 'number' && Number.isFinite(a) ? a : 0
}

/** every §74 metric derivable from one finished battle (multi-run metrics are `NaN`). */
export function objectiveValue(sim: Simulator): MetricValues {
  const metrics = teamMetrics(sim)
  const events = sim.logger.events
  let burst = 0
  let heal = 0
  let shield = 0
  for (const e of events) {
    if (e.type === 'DAMAGE_DEALT') burst = Math.max(burst, amountOf(e.payload))
    else if (e.type === 'HEAL_APPLIED') heal += amountOf(e.payload)
    else if (e.type === 'SHIELD_APPLIED') shield += amountOf(e.payload)
  }
  return {
    totalDamage: metrics.totalDamage,
    dps: metrics.totalDamage / Math.max(metrics.cycles, 1),
    dpa: metrics.totalDamage / Math.max(metrics.actions, 1),
    burstDamage: burst,
    cycles: metrics.cycles,
    turns: metrics.turns,
    variance: NaN,
    survival: metrics.survival,
    healing: heal,
    shielding: shield,
    resourceEfficiency: metrics.totalDamage / Math.max(metrics.energyGained, 1),
    consistency: NaN,
  }
}

/** throw when an objective references a metric a single run cannot provide (§73 boundary). */
export function assertSingleRun(o: Objective): void {
  const used: ObjectiveMetric[] = [o.primary, ...(o.secondary ?? []), ...(o.constraints ?? []).map(c => c.metric)]
  for (const m of MULTI_RUN_METRICS) if (used.includes(m)) {
    throw new Error(`objective metric '${m}' needs multi-run sampling (§73); not available to a single-run score`)
  }
}

/** signed comparison of one metric: > 0 ⇒ `x` is better than `y` under `dir`. NaN always loses. */
function cmpMetric(x: number, y: number, dir: 'max' | 'min'): number {
  const xBad = Number.isNaN(x)
  const yBad = Number.isNaN(y)
  if (xBad || yBad) return xBad && yBad ? 0 : xBad ? -1 : 1
  if (x === y) return 0
  return dir === 'max' ? (x > y ? 1 : -1) : (x < y ? 1 : -1)
}

/** lexicographic comparison: primary first, then secondaries (each by its own default direction). */
export function compareValues(a: MetricValues, b: MetricValues, o: Objective): number {
  const d = cmpMetric(a[o.primary], b[o.primary], objectiveDirection(o))
  if (d !== 0) return d
  for (const m of o.secondary ?? []) {
    const c = cmpMetric(a[m], b[m], OBJECTIVE_DIRECTION[m])
    if (c !== 0) return c
  }
  return 0
}

export interface ConstraintResult { metric: ObjectiveMetric; op: ObjectiveConstraintOp; bound: number; value: number; ok: boolean }
type ObjectiveConstraintOp = '>=' | '<=' | '>' | '<'

const satisfies = (value: number, op: ObjectiveConstraintOp, bound: number): boolean => {
  if (Number.isNaN(value)) return false
  switch (op) {
    case '>=': return value >= bound
    case '<=': return value <= bound
    case '>': return value > bound
    case '<': return value < bound
  }
}

/** evaluate every hard constraint (§74) against one battle's values. */
export function checkConstraints(v: MetricValues, o: Objective): ConstraintResult[] {
  return (o.constraints ?? []).map(c => ({ metric: c.metric, op: c.op, bound: c.value, value: v[c.metric], ok: satisfies(v[c.metric], c.op, c.value) }))
}

export function isFeasible(v: MetricValues, o: Objective): boolean {
  return (o.constraints ?? []).every(c => satisfies(v[c.metric], c.op, c.value))
}

export interface RunScore {
  sim: Simulator
  metrics: TeamMetrics
  values: MetricValues
  constraints: ConstraintResult[]
  feasible: boolean
}

export interface ScoreOptions {
  /** log config for the scored run. MUST be debug > 0: events are gated off at debug 0 and every
   *  §74 metric then reads empty. Default 4 = the lowest level that unlocks DAMAGE_DEALT/BREAK. */
  log?: LogConfig
}

/** run one candidate and grade it against the space's objective (§72 stage 4 oracle). */
export function evaluateCandidate(setup: BattleSetup, objective: Objective, opts: ScoreOptions = {}): RunScore {
  assertSingleRun(objective)
  const sim = runBattle({ ...setup, log: opts.log ?? { debug: 4 } })
  const values = objectiveValue(sim)
  return { sim, metrics: teamMetrics(sim), values, constraints: checkConstraints(values, objective), feasible: isFeasible(values, objective) }
}
