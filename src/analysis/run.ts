import type { Simulator } from '../core/simulator'
import type { BattleEvent } from '../core/battlelog'
import { auditTeam, type AuditInput, type AuditReport } from './audit'
import { teamMetrics, compareTeams, type TeamMetrics, type ComparisonOptions } from './compare'
import { attributeDamage, type DamageAttribution } from './attribution'

/**
 * §39-40 RUN ANALYSIS + §36 delta explanation. `analyzeRun` folds one completed battle into a single
 * artefact (metrics + health audit + attribution) — the in-memory form of a run's summary.json/audit.json.
 * `explainDelta` locates the FIRST DIVERGENCE between two runs' event streams and adds the metric-level
 * WHY from `compareTeams`, so a comparison is diagnosable rather than just a winner.
 *
 * `compareRuns` is the guided name for `compareTeams` (two completed runs, same seed + encounter).
 */
export { compareTeams as compareRuns }

export interface RunAnalysis {
  metrics: TeamMetrics
  audit: AuditReport
  attribution: DamageAttribution
  eventCount: number
  ok: boolean
  text: string
}

/** §39/§40 single-run artefact: metrics + audit + attribution, composed from closed layers. */
export function analyzeRun(input: AuditInput): RunAnalysis {
  const { sim } = input
  const metrics = teamMetrics(sim)
  const audit = auditTeam(input)
  const attribution = attributeDamage(sim)
  const eventCount = sim.logger.events.length

  const fmt = (v: number): string => (v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : String(Math.round(v)))
  const table = (title: string, rec: Record<string, number>): string[] => {
    const rows = Object.entries(rec).sort((a, b) => b[1] - a[1])
    const total = rows.reduce((s, [, v]) => s + v, 0)
    return [title, ...rows.map(([k, v]) => `  ${k.padEnd(20)}${fmt(v).padStart(10)}   ${(total ? (v / total) * 100 : 0).toFixed(1)}%`)]
  }

  const text = [
    audit.text, '',
    'ATTRIBUTION', '─'.repeat(47), '',
    ...table('Applied damage by attacker', attribution.byAttacker), '',
    ...table('Raw damage by owner (summons folded)', attribution.byOwner), '',
    ...table('Raw damage by attack type', attribution.byAttackType), '',
    ...table('Applied damage by element', attribution.byElement),
  ].join('\n')

  return { metrics, audit, attribution, eventCount, ok: audit.ok, text }
}

export interface DeltaExplanation {
  /** index of the FIRST DIVERGENCE in the event streams, -1 when they are identical */
  index: number
  /** events matched before the divergence (== min length when identical) */
  commonPrefix: number
  /** 'none' identical · 'events' same length but a differing event · 'length' prefix equal, one ended early */
  kind: 'none' | 'events' | 'length'
  a?: BattleEvent
  b?: BattleEvent
  /** metric-level WHY (from `compareTeams`) plus the first-divergence line */
  why: string[]
  text: string
}

const sigOfEvent = (e: BattleEvent): string => {
  const a = (e.payload as { amount?: unknown }).amount
  const amt = typeof a === 'number' ? Math.round(a) : 0
  return `${e.type}|${e.source ?? ''}|${e.target ?? ''}|${e.attackType ?? ''}|${amt}`
}

/** §36 first-divergence + metric WHY between two completed runs. */
export function explainDelta(a: Simulator, b: Simulator, opts: ComparisonOptions = {}): DeltaExplanation {
  const ea = a.logger.events
  const eb = b.logger.events
  const n = Math.min(ea.length, eb.length)
  let index = -1
  for (let i = 0; i < n; i++) if (sigOfEvent(ea[i]!) !== sigOfEvent(eb[i]!)) { index = i; break }
  const lengthDiff = index === -1 && ea.length !== eb.length
  const div = lengthDiff ? n : index

  const kind: DeltaExplanation['kind'] = div === -1 ? 'none' : lengthDiff ? 'length' : 'events'
  const first = div >= 0 && div < n ? { a: ea[div], b: eb[div] } : undefined

  const why = compareTeams(a, b, opts).why.slice()
  const lines: string[] = []
  if (kind === 'none') {
    why.unshift('event streams are identical (§38 determinism holds)')
    lines.push('no divergence: identical event streams')
  } else if (kind === 'length') {
    const longer = ea.length > eb.length ? 'A' : 'B'
    lines.push(`streams share ${n} events; ${longer} continues (A=${ea.length} · B=${eb.length})`)
  } else {
    lines.push(`first divergence at event #${div}:`)
    lines.push(`  A: ${sigOfEvent(ea[div]!)}`)
    lines.push(`  B: ${sigOfEvent(eb[div]!)}`)
  }

  const text = [
    'RUN DELTA', '─'.repeat(47), '',
    `Events: A=${ea.length} · B=${eb.length} · common prefix=${div === -1 ? n : div} · kind=${kind}`, '',
    ...lines, '', 'WHY:', ...why.map(x => `  ${x}`),
  ].join('\n')

  return { index: div, commonPrefix: div === -1 ? n : div, kind, a: first?.a, b: first?.b, why, text }
}
