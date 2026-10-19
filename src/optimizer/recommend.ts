/**
 * §84.12 — BUILD / TEAM RECOMMENDATIONS on the production optimizer (audit phase F).
 *
 * F1 (build improvement) and F2 (team-member replacement) are two surfaces, not one algorithm.
 * Both reuse the existing §71/§74/§76 primitives and add no battle logic of their own:
 *
 *   - candidate builds come from `space.memberBuilds` (deterministic cartesian enumeration, §80.3);
 *   - each candidate is scored by `search.evaluateCandidate` → the real `runBattle` oracle;
 *   - every row is measured against the SAME baseline team, seed, encounter, rules and log config
 *     (§80.4 — all inputs explicit; nothing but the varied member/slot differs between a row and
 *     the baseline, so the delta isolates that one change).
 *
 * `core/calcs.ts` is NOT used as a recommendation source (per phase-F spec §5) — it is a what-if
 * tool, not the production chain. Every number here comes from `evaluateCandidate`.
 *
 * Honesty rules encoded here:
 *   - a space wider than `maxCandidates` reports `exhaustive=false` and a warning; we never
 *     silently truncate and never claim a global optimum for a bounded run;
 *   - infeasible candidates rank below every feasible one (same rule as `search.rank`) and their
 *     constraint failures travel with the row, so the UI can show WHY;
 *   - an empty candidate set is reported explicitly, never back-filled with a canned "build";
 *   - multi-run objective metrics (variance/consistency) throw via `score.assertSingleRun` — a
 *     single run cannot answer them and we do not fake a number.
 */
import { applyBuild, validateBuild, type BuildSpec } from '../core/build'
import { runBattle, type TeamSpec } from '../core/battle'
import type { EncounterSpec } from '../core/encounter'
import { teamMetrics } from '../analysis/compare'
import { evaluateCandidate, type ConstraintResult, type MetricValues } from './score'
import { compareCandidates, type ScoredCandidate } from './search'
import {
  configToSetup, memberBuilds, objectiveDirection,
  type CharacterPool, type FullTeamConfig, type Objective, type SearchSpace,
} from './space'

/** identical inputs for baseline and every candidate — the one thing that may differ is the varied
 *  member's `build` (F1) or the varied slot's `kitId`+`build` (F2). */
export interface RecommendationContext {
  /** full team, including the member/slot that will be varied */
  team: TeamSpec[]
  /** index into `team` of the member to improve (F1) or replace (F2) */
  slot: number
  encounter: EncounterSpec
  seed: number
  objective: Objective
  /** hard search cap; the report records whether the run was exhaustive */
  maxCandidates?: number
}

export interface RecommendationRow {
  rank: number
  label: string
  build?: BuildSpec
  kitId: string
  /** the full team this row was measured with — every member except the varied slot is verbatim baseline */
  team: TeamSpec[]
  metrics: { totalDamage: number; cycles: number; spFinal: number; survival: number; events: number }
  values: MetricValues
  constraints: ConstraintResult[]
  feasible: boolean
  /** signed delta of the primary metric vs baseline */
  delta: number
  /** why this row sits where it does — a verifiable difference, never invented synergy */
  reason: string
}

export interface RecommendationReport {
  baselineLabel: string
  baselineValues: MetricValues
  baselineTotalDamage: number
  rows: RecommendationRow[]
  exhaustive: boolean
  candidatesConsidered: number
  evaluated: number
  /** explicit human-readable limitations / warnings (empty array when the run was exhaustive) */
  warnings: string[]
}

const METRIC_LABEL: Record<string, string> = {
  totalDamage: 'суммарный урон', dps: 'DPS', dpa: 'DPA', burstDamage: 'пиковый урон',
  cycles: 'циклы', turns: 'ходы', survival: 'выживание', healing: 'лечение', shielding: 'щит',
  resourceEfficiency: 'эффективность ресурсов',
}
const primaryLabel = (o: Objective): string => METRIC_LABEL[o.primary] ?? o.primary

/** stable, verifiable description of a build — the differences the UI shows instead of invented synergy */
function buildKey(b: BuildSpec | undefined): string {
  const x = b ?? {}
  return [x.eidolon ?? 0, x.cone ?? '', x.si ?? '', x.relic ?? '', x.relic2 ?? '', x.relicCount ?? '', x.planar ?? ''].join('|')
}

const assertSlot = (ctx: RecommendationContext, fn: string): void => {
  if (ctx.slot < 0 || ctx.slot >= ctx.team.length) throw new Error(`${fn}: slot ${ctx.slot} out of range (team ${ctx.team.length})`)
}

/** the one `SearchSpace` every run in a report shares — same encounter, seed, objective (§80.4) */
function sharedSpace(ctx: RecommendationContext): SearchSpace {
  return { members: [], teamSize: ctx.team.length, encounter: ctx.encounter, seed: ctx.seed, objective: ctx.objective, maxCandidates: ctx.maxCandidates }
}

function toLite(m: { totalDamage: number; cycles: number; spFinal: number; survival: number; events: number }): RecommendationRow['metrics'] {
  return { totalDamage: m.totalDamage, cycles: m.cycles, spFinal: m.spFinal, survival: m.survival, events: m.events }
}

function failWarnings(c: ConstraintResult[]): string {
  return c.filter(x => !x.ok).map(x => `не проходит ограничение ${x.metric} ${x.op} ${x.bound} (факт ${x.value})`).join('; ')
}

function rowReason(feasible: boolean, constraints: ConstraintResult[], primary: string, dir: 'max' | 'min', delta: number): string {
  if (!feasible) return failWarnings(constraints) || 'необходимо проверить ограничения'
  const sign = delta > 0 ? '+' : ''
  const word = dir === 'max' ? (delta > 0 ? 'выше' : delta < 0 ? 'ниже' : 'равно') : (delta < 0 ? 'лучше (меньше)' : delta > 0 ? 'хуже (больше)' : 'равно')
  return `изменение ${primary} ${sign}${delta.toFixed(2)} — ${word} базового варианта`
}

interface Setup { label: string; build?: BuildSpec; kitId: string; team: TeamSpec[] }

function evaluateSetups(setups: Setup[], ctx: RecommendationContext, opts: {
  exhaustive: boolean; candidatesConsidered: number; warnings: string[]; baselineLabel: string; baselineValues: MetricValues; baselineTotalDamage: number
}): RecommendationReport {
  const { objective } = ctx
  const dir = objectiveDirection(objective)
  const primary = objective.primary
  const space = sharedSpace(ctx)

  const scored: Array<ScoredCandidate & Setup> = setups.map(s => {
    const cfg: FullTeamConfig = { members: s.team, encounter: ctx.encounter, seed: ctx.seed }
    const r = evaluateCandidate(configToSetup(space, cfg, { log: { debug: 4 } }), objective)
    return { config: cfg, metrics: r.metrics, values: r.values, constraints: r.constraints, feasible: r.feasible, ...s }
  })
  const evaluated = scored.length

  const ranked = [...scored].sort((a, b) => -compareCandidates(a, b, objective))
  const rows: RecommendationRow[] = ranked.map((c, i) => {
    const delta = (c.values[primary] ?? 0) - (opts.baselineValues[primary] ?? 0)
    return {
      rank: i + 1, label: c.label, build: c.build, kitId: c.kitId, team: c.team,
      metrics: toLite(c.metrics), values: c.values, constraints: c.constraints,
      feasible: c.feasible, delta, reason: rowReason(c.feasible, c.constraints, primaryLabel(objective), dir, delta),
    }
  })

  return {
    baselineLabel: opts.baselineLabel, baselineValues: opts.baselineValues, baselineTotalDamage: opts.baselineTotalDamage,
    rows, exhaustive: opts.exhaustive, candidatesConsidered: opts.candidatesConsidered, evaluated, warnings: opts.warnings,
  }
}

function runBaseline(ctx: RecommendationContext): { values: MetricValues; totalDamage: number; label: string } {
  const space = sharedSpace(ctx)
  const team = ctx.team.map(applyBuild)
  const cfg: FullTeamConfig = { members: team, encounter: ctx.encounter, seed: ctx.seed }
  const setup = configToSetup(space, cfg, { log: { debug: 4 } })
  const sim = runBattle(setup)
  const totalDamage = teamMetrics(sim).totalDamage
  const values = evaluateCandidate(setup, ctx.objective).values
  const m = ctx.team[ctx.slot]
  const label = m ? `${m.kitId}${m.build ? ` [${buildKey(m.build)}]` : ''}` : 'базовый состав'
  return { values, totalDamage, label }
}

/** split enumerated builds into valid ones and the ids that failed `core/build.validateBuild` */
function splitValidBuilds(builds: BuildSpec[], owner: string): { valid: BuildSpec[]; bad: string[] } {
  const valid: BuildSpec[] = []
  const bad: string[] = []
  for (const b of builds) {
    const errs = validateBuild(b)
    if (errs.length) bad.push(`${owner}: ${errs.join(', ')}`)
    else valid.push(b)
  }
  return { valid, bad }
}

function capWarning(exhaustive: boolean, evaluated: number, total: number, ctx: RecommendationContext): string[] {
  if (exhaustive) return []
  return [`пространство ограничено maxCandidates=${ctx.maxCandidates}: исследовано ${evaluated} из ${total} кандидатов — рейтинг относится только к исследованному подмножеству, это не глобальный оптимум`]
}

/**
 * F1 — improve the build of ONE fixed member inside a fixed team.
 *
 * The member at `ctx.slot` is enumerated over `pool` (`eidolons × cones × si × relicSets ×
 * planarSets`, cartesian, lexicographic — §80.3). Every other member keeps its build verbatim.
 * The baseline is the team as given; each candidate is measured against that same baseline.
 * Builds with unknown dataset ids are dropped with a warning (§7 — no silent zero-fill).
 */
export function buildRecommendations(ctx: RecommendationContext, pool: CharacterPool, opts: { top?: number } = {}): RecommendationReport {
  assertSlot(ctx, 'buildRecommendations')
  if (pool.id !== ctx.team[ctx.slot]!.kitId) throw new Error(`buildRecommendations: pool.id '${pool.id}' != team[${ctx.slot}].kitId '${ctx.team[ctx.slot]!.kitId}'`)

  const base = runBaseline(ctx)
  const { valid, bad } = splitValidBuilds(memberBuilds(pool), pool.id)
  const warnings = bad.map(x => `некорректная сборка отброшена — ${x}`)
  const evaluated = ctx.maxCandidates === undefined ? valid : valid.slice(0, Math.max(0, ctx.maxCandidates))
  const exhaustive = evaluated.length === valid.length
  warnings.push(...capWarning(exhaustive, evaluated.length, valid.length, ctx))
  if (!valid.length) warnings.push(`пуль '${pool.id}' не содержит ни одной валидной сборки — сравнивать нечего`)

  const kitId = ctx.team[ctx.slot]!.kitId
  const setups: Setup[] = evaluated.map(b => ({
    label: `${kitId} [${buildKey(b)}]`, build: b, kitId,
    team: ctx.team.map((m, i) => (i === ctx.slot ? { ...m, build: b } : m)),
  }))
  const report = evaluateSetups(setups, ctx, { exhaustive, candidatesConsidered: valid.length, warnings, baselineLabel: base.label, baselineValues: base.values, baselineTotalDamage: base.totalDamage })
  return opts.top !== undefined ? { ...report, rows: report.rows.slice(0, Math.max(1, opts.top)) } : report
}

/**
 * F2 — rank replacement candidates for ONE slot in a fixed team.
 *
 * The member at `ctx.slot` is swapped for each candidate's build; the other three members keep
 * their builds verbatim. The baseline is the original member in that slot. Candidates are ranked
 * by the same objective against the same baseline. Invalid candidate builds are dropped with a
 * warning; an empty result is reported as such, never back-filled.
 */
export function replacementRecommendations(ctx: RecommendationContext, candidates: CharacterPool[], opts: { top?: number } = {}): RecommendationReport {
  assertSlot(ctx, 'replacementRecommendations')

  const base = runBaseline(ctx)
  const warnings: string[] = []
  const all: Setup[] = []
  const seen = new Set<string>()
  for (const pool of candidates) {
    const { valid, bad } = splitValidBuilds(memberBuilds(pool), pool.id)
    for (const x of bad) warnings.push(`некорректная сборка кандидата отброшена — ${x}`)
    for (const b of valid) {
      const key = `${pool.id}|${buildKey(b)}`
      if (seen.has(key)) continue
      seen.add(key)
      all.push({ label: `${pool.id} [${buildKey(b)}]`, build: b, kitId: pool.id, team: ctx.team.map((m, i) => (i === ctx.slot ? { kitId: pool.id, build: b } : m)) })
    }
  }
  const evaluated = ctx.maxCandidates === undefined ? all : all.slice(0, Math.max(0, ctx.maxCandidates))
  const exhaustive = evaluated.length === all.length
  warnings.push(...capWarning(exhaustive, evaluated.length, all.length, ctx))
  if (!all.length) warnings.push('нет допустимых кандидатов для замены')

  const report = evaluateSetups(evaluated, ctx, { exhaustive, candidatesConsidered: all.length, warnings, baselineLabel: base.label, baselineValues: base.values, baselineTotalDamage: base.totalDamage })
  return opts.top !== undefined ? { ...report, rows: report.rows.slice(0, Math.max(1, opts.top)) } : report
}
