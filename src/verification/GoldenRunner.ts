/**
 * Spec runner: fixture -> battle -> normalized events -> requirement rows.
 *
 * One code path, no golden-registry abstraction. A golden trace is just a file next
 * to the spec; if a spec has none, only its requirements run.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { prepareBattle } from '../core/battle'
import type { BattleSetup } from '../core/battle'
import type { Simulator } from '../core/simulator'
import type { Fixture, SlotSpec } from './Spec'
import type { Layer } from './Requirement'
import { normalize, firstDivergence, renderDivergence, type Node } from './TraceMatcher'
import { evaluate, type Ctx, type Result } from './Assertion'
import { diff, snapshot, stateView, clauses, type StateView } from './StateMatcher'

export interface Row {
  fixture: string
  requirement: string
  layer: Layer
  claim: string
  result: Result
  deviation?: boolean
  /** Phase 3.5: a declared non-fatal interaction outcome (`gap`=documented divergence,
   *  `blocked`=missing engine capability). Such rows never count as failures. */
  status?: 'gap' | 'blocked'
}

export interface FixtureRun {
  fixture: Fixture
  sim: Simulator
  ctx: Ctx
  rows: Row[]
  /** golden trace key mismatch — a real failure (counted by `report`) */
  divergence?: string
  /** state delta after the battle (informational, not a failure) */
  stateAfter?: string
}

/** events cost ~1.5x; verification always wants them, sweep never does. `verifyPerEvent` (§10) makes
 *  a spec fail at the offending event instead of at battle end. */
const VERIFY_LOG = { debug: 7, verifyPerEvent: true } as const

export function runFixture(spec: SlotSpec, f: Fixture, goldenDir?: string): FixtureRun {
  const setup = { ...f.battle, log: VERIFY_LOG } as unknown as BattleSetup
  const sim = prepareBattle(setup)
  // Before/After: snapshots after initBattle (start-of-battle buffs, SP/HP normalization in) and
  // before the first turn, so `before` clauses see the real battle-start state, not the empty pre-init one.
  sim.initBattle()
  const before = snapshot(sim)
  const beforeView: StateView = stateView(sim)
  if (f.mode !== 'init') sim.loop()
  else sim.logger.dispose()
  const nodes: Node[] = normalize(sim.logger.events)
  const ctx: Ctx = { nodes, sim, buffLog: sim.buffLog, logLines: sim.logLines }

  const rows: Row[] = []
  const afterView = () => stateView(sim)
  for (const r of spec.requirements) {
    if (r.fixtures && !r.fixtures.includes(f.id)) continue
    const base = evaluate(r.assertion, ctx)
    const cB = r.before ? clauses(r.before, beforeView) : undefined
    const cA = r.after ? clauses(r.after, afterView()) : undefined
    const bad = [base, cB, cA].find(x => x && !x.ok)
    const res: Result = bad
      ? { ok: false, detail: `${bad.detail} ${base.ok ? '' : `assert: ${base.detail}`}`.trim() }
      : base
    rows.push({ fixture: f.id, requirement: r.id, layer: r.layer, claim: r.claim, result: res, deviation: !!r.deviation, status: r.status })
  }

  const run: FixtureRun = { fixture: f, sim, ctx, rows }
  const golden = goldenDir ? join(goldenDir, `${spec.kit}`, `${f.id}.json`) : undefined
  if (golden && existsSync(golden)) {
    const g = JSON.parse(readFileSync(golden, 'utf8')) as { expectedKeys: string[] }
    const d = firstDivergence(g.expectedKeys, nodes)
    if (d) run.divergence = renderDivergence(d)
  }

  if (f.mode === 'init') return run

  const changed = diff(before, sim)
  if (changed.length) run.stateAfter = `  state after: ${changed.join('; ')}`
  return run
}

export function runSlot(spec: SlotSpec, goldenDir?: string): FixtureRun[] {
  return spec.fixtures.map(f => runFixture(spec, f, goldenDir))
}

export interface SlotReport {
  kit: string
  slot: string
  runs: FixtureRun[]
  passed: number
  failed: number
  deviations: number
  /** declared non-fatal rows (status gap/blocked) among the requirements */
  nonFatal: number
  /** fixtures whose golden trace diverged — counted as failures by the CLI */
  divergences: number
}

export function report(runs: FixtureRun[], kit = '?', slot = '?'): SlotReport {
  const rows = runs.flatMap(r => r.rows)
  return {
    kit, slot, runs,
    passed: rows.filter(r => r.result.ok).length,
    failed: rows.filter(r => !r.result.ok && !r.status).length,
    deviations: rows.filter(r => r.deviation).length,
    nonFatal: rows.filter(r => r.status).length,
    divergences: runs.filter(r => r.divergence).length,
  }
}

export function render(r: SlotReport): string {
  const out = [`${r.kit} / ${r.slot}  PASS ${r.passed}  FAIL ${r.failed}  DIVERGED ${r.divergences}  DEVIATIONS ${r.deviations}${r.nonFatal ? `  NONFATAL ${r.nonFatal}` : ''}`]
  for (const run of r.runs) {
    const bad = run.rows.filter(x => !x.result.ok)
    out.push(`  fixture ${run.fixture.id} (${run.fixture.env}): ${run.rows.length - bad.length}/${run.rows.length}`)
    for (const x of bad) out.push(`    ${x.status ? `[${x.status.toUpperCase()}]` : 'FAIL'} [${x.layer}] ${x.requirement} — ${x.claim} :: ${x.result.detail}`)
    if (run.divergence) out.push(run.divergence)
    if (run.stateAfter) out.push(run.stateAfter)
  }
  return out.join('\n')
}
