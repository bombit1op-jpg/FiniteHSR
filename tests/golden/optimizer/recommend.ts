import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import { buildRecommendations, replacementRecommendations, type RecommendationContext } from '../../../src/optimizer/recommend'
import { evaluateCandidate } from '../../../src/optimizer/score'
import { configToSetup, memberBuilds, type CharacterPool } from '../../../src/optimizer/space'
import { applyBuild } from '../../../src/core/build'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * Phase F — build/team recommendations over the production optimizer.
 * Covers the spec §9 acceptance list: correct production-API input, fixed slots, invalid-build
 * rejection, baseline delta, deterministic ranking, empty candidate set, bounded-search
 * marking, and honest reasons (no invented synergy).
 */

export default (): Case[] => {
  const enc: EncounterSpec = { id: 'rec', waves: [[mob({ hp: 200_000, toughness: 140 })]], cycles: 2 }
  const ctx: RecommendationContext = {
    team: [
      { kitId: 'hook', build: { cone: 'secret_vow', si: 1, relic: 'musketeer', planar: 'salsotto' } },
      { kitId: 'pela', build: {} },
      { kitId: 'luocha', build: {} },
    ],
    slot: 0,
    encounter: enc,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }

  const pool: CharacterPool = { id: 'hook', eidolons: [0, 1], cones: ['secret_vow'], si: [1, 2], relicSets: ['musketeer'], planarSets: ['salsotto'] }
  const rec = buildRecommendations(ctx, pool)

  // 1) correct input into the production API: an independently rebuilt row setup must score
  //    identically to what the report says for that row (same seed/encounter/log contract)
  const row0 = rec.rows[0]!
  const space = { members: [], teamSize: 3, encounter: enc, seed: 7, objective: ctx.objective }
  const indep = evaluateCandidate(configToSetup(space, { members: row0.team, encounter: enc, seed: 7 }, { log: { debug: 4 } }), ctx.objective)

  // 2) fixed slots: every row varies ONLY the target slot's build; other members verbatim
  const othersFixed = rec.rows.every(r =>
    r.team.length === 3 && r.team[1]!.kitId === 'pela' && r.team[2]!.kitId === 'luocha'
    && JSON.stringify(r.team[1]!.build) === JSON.stringify(ctx.team[1]!.build)
    && JSON.stringify(r.team[2]!.build) === JSON.stringify(ctx.team[2]!.build)
    && r.team[0]!.kitId === 'hook')
  const targetChanged = rec.rows.every(r => JSON.stringify(r.team[0]!.build) === JSON.stringify(r.build))

  // 3) invalid builds rejected: unknown cone dropped with a warning, never silently zero-filled
  const badPool: CharacterPool = { id: 'hook', cones: ['secret_vow', 'no_such_cone'] }
  const bad = buildRecommendations(ctx, badPool)
  const badDropped = bad.warnings.some(w => w.includes('no_such_cone')) && bad.rows.every(r => r.build?.cone !== 'no_such_cone')

  // 4) delta vs baseline: row.delta = row value − independently recomputed baseline value
  const baseSetup = configToSetup(space, { members: ctx.team.map(applyBuild), encounter: enc, seed: 7 }, { log: { debug: 4 } })
  const baseValues = evaluateCandidate(baseSetup, ctx.objective).values
  const deltaOk = rec.rows.every(r => Math.abs(r.delta - (r.values.totalDamage - baseValues.totalDamage)) < 1e-9)
    && Math.abs(rec.baselineValues.totalDamage - baseValues.totalDamage) < 1e-9

  // 5) deterministic ranking: same inputs → byte-identical report core
  const recAgain = buildRecommendations(ctx, pool)
  const deterministic = JSON.stringify(rec.rows.map(r => [r.rank, r.label, r.delta])) === JSON.stringify(recAgain.rows.map(r => [r.rank, r.label, r.delta]))

  // 6) empty candidate set: F2 with no pools reports it explicitly, no canned build
  const empty = replacementRecommendations(ctx, [])
  const emptyHonest = empty.rows.length === 0 && empty.warnings.some(w => w.includes('нет допустимых кандидатов')) && empty.evaluated === 0

  // 7) bounded search: maxCandidates truncates deterministically and marks incompleteness
  const wide: CharacterPool = { id: 'hook', eidolons: [0, 1, 2, 3], cones: ['secret_vow'], si: [1, 2] }
  expectTotal(wide, 8)
  const capped = buildRecommendations({ ...ctx, maxCandidates: 3 }, wide)
  const capHonest = !capped.exhaustive && capped.evaluated === 3 && capped.candidatesConsidered === 8
    && capped.warnings.some(w => w.includes('исследовано 3 из 8'))
    && capped.rows.length === 3

  // 8) multi-run metrics throw instead of faking a number (score.assertSingleRun boundary)
  let threw = false
  try { buildRecommendations({ ...ctx, objective: { primary: 'variance' } }, pool) } catch { threw = true }

  // 9) F2: fixed slot + per-candidate rows ranked against the same baseline, deterministic
  const cands: CharacterPool[] = [{ id: 'pela' }, { id: 'kafka' }]
  const rep = replacementRecommendations(ctx, cands)
  const rep2 = replacementRecommendations(ctx, cands)
  const repOk = rep.rows.length === 2 && rep.rows.every(r => r.team[0]!.kitId === r.kitId && r.team[1]!.kitId === 'pela' && r.team[2]!.kitId === 'luocha')
    && JSON.stringify(rep.rows.map(r => [r.rank, r.delta])) === JSON.stringify(rep2.rows.map(r => [r.rank, r.delta]))

  // 10) reasons are verifiable: feasible rows carry a numeric delta sentence, no synergy prose
  const reasonsOk = rec.rows.every(r => r.feasible ? r.reason.includes('изменение') : r.reason.includes('ограничение'))

  // 11) feasible-first: with an unreachable constraint every row is infeasible and says why
  const constrained = buildRecommendations({ ...ctx, objective: { primary: 'totalDamage', constraints: [{ metric: 'cycles', op: '<=', value: 0 }] } }, pool)
  const constraintOk = constrained.rows.every(r => !r.feasible && r.reason.includes('cycles'))

  return [
    case_('F1: rows ranked, baseline present, exhaustive over 4-build pool', rec.exhaustive && rec.rows.length === 4 && rec.candidatesConsidered === 4 && rec.evaluated === 4),
    case_('F1: row values match an independent production-API run of the same setup', Math.abs(row0.values.totalDamage - indep.values.totalDamage) < 1e-9 && Math.abs(row0.metrics.totalDamage - indep.metrics.totalDamage) < 1e-9),
    case_('F1: fixed slots — only the target build varies, others verbatim', othersFixed && targetChanged),
    case_('F1: invalid builds dropped with warning, never evaluated', badDropped && bad.evaluated === 1),
    case_('F1: delta and baseline recomputed independently and equal', deltaOk),
    case_('F1: deterministic ranking for the same inputs (§80.3)', deterministic),
    case_('F2: empty candidate set reported explicitly, no fake rows', emptyHonest),
    case_('F1: maxCandidates truncates and marks the report incomplete', capHonest),
    case_('multi-run objective metric throws (no fabricated number)', threw),
    case_('F2: per-candidate rows, fixed other slots, deterministic', repOk),
    case_('reasons are verifiable delta/constraint sentences, not synergy prose', reasonsOk),
    case_('infeasible rows rank last and explain the failed constraint', constraintOk && constrained.rows.length === 4),
    case_('F1: pool id must match the varied slot kitId', (() => { let t = false; try { buildRecommendations(ctx, { id: 'kafka' }) } catch { t = true } return t })()),
  ]
}

function expectTotal(pool: CharacterPool, want: number): void {
  const got = memberBuilds(pool).length
  if (got !== want) throw new Error(`test fixture drifted: memberBuilds(${pool.id}) = ${got}, expected ${want}`)
}
