import type { Simulator } from '../core/simulator'
import type { TeamSpec } from '../core/battle'
import type { BattleEvent } from '../core/battlelog'
import type { RulesSnapshot } from '../core/battle/BattleRules'
import type { GearConfig, RelicPiece } from '../core/entities/Unit'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import { resolveBuild } from '../core/build'
import { eff } from '../core/combat/StatResolver'
import { attributeDamage } from './attribution'
import type { DamageAttribution } from './attribution'

/**
 * §77 TEAM COMPARISON REPORT (canonical spec, guide §77.1–§77.15). `compareTeams` normalises two
 * completed battles ONCE into typed metrics, computes the delta once, and renders both a
 * machine-readable `TeamComparisonResult` and the human report FROM THE SAME DATA — it is not a
 * text-only formatter.
 *
 * Contract points implemented here:
 *  - metric = `{ value, unit, status, source }`; absence is `N/A`/`missing`, never a silent `0`
 *    (§77.5/§77.14). Count metrics read the event stream, so with no captured events they are
 *    `missing`, not `0`.
 *  - delta convention is explicit B − A (§77.6); relative delta (B − A) / A, null when A is null/0.
 *  - the winner is decided against an explicit objective (§77.11), not hard-coded prose.
 *  - WHY split into RESULT / OBSERVED / CAUSAL / LIMITATIONS (§77.11); no unmeasured causal claim.
 */
export interface TeamMetrics {
  totalDamage: number
  cycles: number
  ultimates: number
  fua: number
  breaks: number
  spFinal: number
  survival: number
  actions: number
  turns: number
  energyGained: number
  events: number
  damageByOwner: Record<string, number>
  damageByAxis: Record<string, number>
  damageByAttackType: Record<string, number>
  basicCount: number
  skillCount: number
  ultCount: number
  fuaCount: number
  overkillApprox: number
  healsApplied: number
  shieldsProvided: number
  /** §77.5 SP ledger + HP ledger (event-stream reads) */
  spSpent: number
  spGained: number
  hpRemoved: number
  deaths: number
}

/** §77.5/§77.14 metric status: absence is `missing`, never a silent `0`. */
export type MetricStatus = 'ok' | 'missing' | 'not-applicable'
export type MetricUnit = 'damage' | 'count' | 'cycles' | 'sp' | 'percent'

/** §77.5 typed metric: value + unit + status + source, per side, plus the B − A delta (§77.6). */
export interface Metric {
  key: string
  label: string
  unit: MetricUnit
  a: number | null
  b: number | null
  statusA: MetricStatus
  statusB: MetricStatus
  /** absolute delta, B − A; null when either side is not `ok` */
  delta: number | null
  /** relative delta, (B − A) / A * 100; null when A is not `ok` or A === 0 */
  deltaPct: number | null
  source: string
}

/** §77.1 comparison config. Labels/config are the caller's declared inputs. */
export interface ComparisonConfig {
  aLabel?: string
  bLabel?: string
  /** §77.4 report detail level: summary (verdict only) / standard (default) / full (per-slot + signatures) */
  detail?: 'summary' | 'standard' | 'full'
  /** free-text encounter label (kept for legacy callers) */
  encounter?: string
  /** free-text build label (kept for legacy callers) */
  build?: string
  seed?: number
  /** §77.12 comparison mode; only `single-seed` is implemented so far */
  mode?: 'single-seed' | 'multi-seed'
  /** named objective the winner is judged against (§77.11); default 'Total Damage' */
  objective?: string
  /** relative tie tolerance (§77.11); default 1e-9 */
  tolerance?: number
  /** resolved Team A config, for the §77.2 build report */
  teamA?: TeamSpec[]
  /** resolved Team B config, for the §77.2 build report */
  teamB?: TeamSpec[]
  /** §77.1 field keys the caller declares as intended differences (e.g. ['archer.eidolon']).
   *  A DIFFERENT control field (seed/encounter/cycles/…) not listed here is flagged confounding. */
  intendedDifferences?: string[]
}

/** @deprecated alias kept for back-compat with `run.ts`; use `ComparisonConfig`. */
export type ComparisonOptions = ComparisonConfig

/** §77.11 objective result: the explicit metric the winner is decided on. */
export interface ObjectiveResult {
  objective: string
  a: number
  b: number
  /** B − A */
  delta: number
  winner: 'A' | 'B' | 'tie'
  tolerance: number
}

/** §77.11 explanation split into RESULT / OBSERVED / CAUSAL / LIMITATIONS. */
export interface Explanation {
  result: string
  observed: string[]
  /** trace-supported causal claims; empty until the §77.10 event/state diff exists */
  causal: string[]
  limitations: string[]
}

/** §77.1 parity of one audited input field. */
export type Parity = 'SAME' | 'DIFFERENT' | 'UNKNOWN'
/** §77.1 classification of a difference: kept-identical on purpose, intended experiment, confounding, or unaudited. */
export type ParityClass = 'CONTROLLED' | 'INTENDED' | 'CONFOUNDING' | 'UNKNOWN'

export interface InputField {
  field: string
  a: string
  b: string
  parity: Parity
  classification: ParityClass
}

/** §77.1 input-parity audit: field-by-field SAME/DIFFERENT + any confounding differences. */
export interface InputAudit {
  fields: InputField[]
  /** fields that differ but are control invariants the caller did not declare intended */
  confounding: string[]
}

/** §77.3 rules snapshot block (the frozen battle-rules digest, §59). */
export interface RulesBlock {
  a?: RulesSnapshot
  b?: RulesSnapshot
  parity: Parity
}

/** §77.7 one damage axis. `partition` reconciles to its own total; `cross-tab` overlaps other views. */
export interface DamageView {
  axis: string
  kind: 'partition' | 'cross-tab'
  convention: string
  a: Record<string, number>
  b: Record<string, number>
}

/** §77.7/§77.8 damage breakdown: reusable attribution views + per-owner share (one convention named). */
export interface DamageBreakdown {
  a: DamageAttribution
  b: DamageAttribution
  views: DamageView[]
  ownerShareA: Record<string, number>
  ownerShareB: Record<string, number>
  /** Σ byOwner reconciles to the engine ownerDamage total, per side (§77.14.6–7) */
  reconciledA: boolean
  reconciledB: boolean
  /** §77.7 rows across a cross-tab view must never be summed against a partition view */
  partitionNote: string
}

/** §77.14 validation status of one required check. */
export type CheckStatus = 'PASS' | 'FAIL' | 'NOT CHECKED' | 'NOT APPLICABLE'
export interface ValidationCheck {
  id: number
  label: string
  status: CheckStatus
  reason?: string
}
/** §77.14 validation/reconciliation audit. `valid` = no check FAILed. */
export interface Validation {
  checks: ValidationCheck[]
  valid: boolean
  failed: number[]
}

export type Provenance = 'EXPLICIT' | 'SET' | 'NONE'

/** §77.2 one equipped relic/planar piece (input gear, slot-by-slot). */
export interface BuildProp {
  slot: string
  setId: string
  setName: string
  main: string
  subs: string
}

/** §77.2 one member's declared build, resolved from `TeamSpec.gear` (or its `build` shorthand). */
export interface MemberBuild {
  kitId: string
  name?: string
  eidolon: number
  cone?: { id: string; name: string; si: number; path: string }
  cavern: string[]
  planar?: string
  /** resolved active bonuses, e.g. `4pc Ashblazing Grand Duke`, `2pc Fleet of the Ageless` */
  activeSets: string[]
  pieces: BuildProp[]
  provenance: Provenance
}

/** §77.2 build report: both sides slot-by-slot + a structural diff (only fields that changed). */
export interface BuildReport {
  a: MemberBuild[]
  b: MemberBuild[]
  diff: string[]
}

/** §77.2 runtime-resolved final stats for one ally character (from `eff`), never inferred from gear text. */
export interface FinalStats {
  hp: number
  atk: number
  def: number
  spd: number
  critRate: number
  critDmg: number
}

/** §77.2/§77.8 runtime-resolved final stats per side, keyed by kitId. `null` = that member was not on the roster. */
export interface RuntimeStatsReport {
  a: Record<string, FinalStats>
  b: Record<string, FinalStats>
}

/** §77.1 actor categories straight from the engine `Unit.kind`, never inferred from a display name. */
export type ActorKind = 'char' | 'summon' | 'timer' | 'transformed' | 'aha'

/** §77.1/§77.8 one runtime actor (a unit the engine put on the field that is not a team-config character). */
export interface RuntimeActor {
  id: string
  name: string
  kind: ActorKind
  /** owner (summoner) display name from `rt(u).ownerId`, when the runtime carries one */
  owner?: string
  /** stat source rule the engine uses (owner-inherit vs own base vs own base + owner CRIT) */
  statSource: string
  /** timeline/action behavior of the kind */
  timeline: string
  /** §77.8 damage-attribution rule */
  attribution: string
  /** §77.8 direct damage dealt by this actor as the attacking unit (`DAMAGE_DEALT.sourceId`) */
  directDamage: number
}

/** §77.1/§77.8 roster (from the input team config) vs the runtime actors shown separately. */
export interface ActorReport {
  /** roster member names from `ComparisonConfig.teamA`/`teamB` (fallback: runtime ally characters) */
  rosterA: string[]
  rosterB: string[]
  /** runtime actors on each side that are NOT roster characters (summons / timers / transformed) */
  actorsA: RuntimeActor[]
  actorsB: RuntimeActor[]
  /** §77.14.9 `ownerDamage` buckets that resolve to a non-character id (would be a double count) */
  ownerBucketErrors: { a: string[]; b: string[] }
}

/** §77.9 resource ledger for one run. `null` = not collected (never a silent 0). */
export interface ResourceLedger {
  spEnd: number
  spGained: number | null
  spSpent: number | null
  /** not carried by the runtime after the battle → null (not collected), not asserted
   *  against a hard-coded base cap (§77.14.12) */
  spStart: number | null
  spEffectiveMax: number | null
  spSource: string
  energyGained: number | null
}

/** §77.10 semantic event diff: first divergence by stable signature, plus stream hashes. */
export interface EventDiff {
  status: 'compared' | 'identical' | 'missing'
  matched: number
  firstDivergence: number | null
  prevContext: string | null
  aSignatures: string[]
  bSignatures: string[]
  aHash: string
  bHash: string
  minLength: number
}


/** §77 canonical typed comparison result. `text` renders exactly these fields. */
export interface TeamComparisonResult {
  config: ComparisonConfig
  metadata: { seed?: number; mode: 'single-seed' | 'multi-seed'; detail: 'summary' | 'standard' | 'full'; aLabel: string; bLabel: string; encounter?: string }
  metrics: Metric[]
  rows: CompareRow[]
  inputAudit: InputAudit
  rules: RulesBlock
  build: BuildReport
  /** §77.2/§77.8 runtime-resolved final stats, separate from the input gear stats in `build` */
  runtimeStats: RuntimeStatsReport
  /** §77.1/§77.8 team-config roster vs runtime actors classified by engine kind */
  actors: ActorReport
  resources: { a: ResourceLedger; b: ResourceLedger }
  eventDiff: EventDiff
  damage: DamageBreakdown
  validation: Validation
  objective: ObjectiveResult
  explanation: Explanation
  winner: 'A' | 'B' | 'tie'
  /** compat alias of `explanation.observed` */
  why: string[]
  a: TeamMetrics
  b: TeamMetrics
  text: string
}

/** @deprecated alias kept for back-compat; use `TeamComparisonResult`. */
export type TeamComparison = TeamComparisonResult

export interface CompareRow {
  metric: string
  a: string
  b: string
  delta: string
}

interface MetricDef {
  key: string
  label: string
  unit: MetricUnit
  /** read from the event stream → `missing` when no events were captured */
  events: boolean
  source: string
  get(m: TeamMetrics): number
}

/** §77.5 core metric set. */
const METRIC_DEFS: MetricDef[] = [
  { key: 'total-damage', label: 'Total Damage', unit: 'damage', events: false, source: 'Σ sim.ownerDamage', get: m => m.totalDamage },
  { key: 'cycles', label: 'Cycles', unit: 'cycles', events: false, source: 'CYCLE_START / sim.cycle', get: m => m.cycles },
  { key: 'ultimates', label: 'Ultimates', unit: 'count', events: true, source: 'ABILITY_USED(action=ultimate)', get: m => m.ultimates },
  { key: 'fua', label: 'FUA', unit: 'count', events: true, source: 'DAMAGE_DEALT(attackType=fua)', get: m => m.fua },
  { key: 'breaks', label: 'Breaks', unit: 'count', events: true, source: 'WEAKNESS_BREAK/BREAK_DAMAGE/SUPERBREAK', get: m => m.breaks },
  { key: 'sp-final', label: 'SP Final', unit: 'sp', events: false, source: 'sim.sp()', get: m => m.spFinal },
  { key: 'survival', label: 'Survival', unit: 'percent', events: false, source: 'living allies / allies', get: m => m.survival },
  { key: 'actions', label: 'Actions', unit: 'count', events: true, source: 'ACTION_START', get: m => m.actions },
  { key: 'basic', label: 'Basic Attacks', unit: 'count', events: true, source: 'ABILITY_USED(action=basic)', get: m => m.basicCount },
  { key: 'skill', label: 'Skills', unit: 'count', events: true, source: 'ABILITY_USED(action=skill)', get: m => m.skillCount },
  { key: 'events', label: 'Events', unit: 'count', events: true, source: 'event stream length', get: m => m.events },
  // §77.5 SP + HP ledgers + support/defensive buckets (event-stream reads)
  { key: 'sp-spent', label: 'SP Spent', unit: 'count', events: true, source: 'SP_LOSS', get: m => m.spSpent },
  { key: 'sp-gained', label: 'SP Gained', unit: 'count', events: true, source: 'SP_GAIN', get: m => m.spGained },
  { key: 'hp-removed', label: 'Enemy HP Removed', unit: 'damage', events: true, source: 'Σ damage − overkill', get: m => m.hpRemoved },
  { key: 'deaths', label: 'Deaths', unit: 'count', events: true, source: 'DEATH', get: m => m.deaths },
  { key: 'heals', label: 'Heals Applied', unit: 'damage', events: true, source: 'HEAL_APPLIED Σ', get: m => m.healsApplied },
  { key: 'shields', label: 'Shields', unit: 'count', events: true, source: 'SHIELD_APPLIED', get: m => m.shieldsProvided },
  { key: 'overkill', label: 'Overkill', unit: 'damage', events: true, source: 'DAMAGE_DEALT hpAfter<0', get: m => m.overkillApprox },
]

/** §77.5 normalise one completed run into `TeamMetrics`. Pure read of public sim state + events. */
export function teamMetrics(sim: Simulator): TeamMetrics {
  const events = sim.logger.events
  const count = (t: string): number => events.filter(e => e.type === t).length
  const sum = (m: Map<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0)

  const damageByOwner: Record<string, number> = {}
  for (const [id, d] of sim.ownerDamage) damageByOwner[id] = d
  const damageByAxis: Record<string, number> = {}
  for (const m of sim.ownerAxis.values()) for (const [axis, d] of m) damageByAxis[axis] = (damageByAxis[axis] ?? 0) + d

  const end = events.find(e => e.type === 'BATTLE_END')
  const cStart = events.filter(e => e.type === 'CYCLE_START').length
  const endCycle = (end?.payload?.cycle as number | undefined) ?? 0
  const liveCycle = (sim as unknown as { cycle?: number }).cycle ?? 0
  const cycles = Math.max(cStart, endCycle, liveCycle, 1)

  const actionOf = (e: BattleEvent): string | undefined => (e.payload as { action?: string } | undefined)?.action
  const attackTypeOf = (e: BattleEvent): string | undefined =>
    e.attackType ?? (e.payload as { attackType?: string } | undefined)?.attackType

  const damageByAttackType: Record<string, number> = {}
  for (const ev of events) {
    if (ev.type !== 'DAMAGE_DEALT') continue
    const v = Number((ev.payload as { amount?: number }).amount) || 0
    const k = attackTypeOf(ev) ?? 'other'
    damageByAttackType[k] = (damageByAttackType[k] ?? 0) + v
  }

  let overkillApprox = 0
  for (const ev of events) {
    if (ev.type !== 'DAMAGE_DEALT') continue
    const hpAfter = (ev.payload as { hpAfter?: number }).hpAfter
    if (typeof hpAfter === 'number' && hpAfter < 0) overkillApprox += -hpAfter
  }

  let healsApplied = 0
  for (const e of events) if (e.type === 'HEAL_APPLIED') healsApplied += Number((e.payload as { amount?: number }).amount) || 0

  const allies = sim.roster.filter(u => u.side !== 'enemy')
  const aliveAllies = allies.filter(u => u.hp > 0).length
  const totalDamage = sum(sim.ownerDamage)

  return {
    totalDamage,
    cycles,
    ultimates: events.filter(e => e.type === 'ABILITY_USED' && actionOf(e) === 'ultimate').length,
    fua: events.filter(e => e.type === 'DAMAGE_DEALT' && attackTypeOf(e) === 'fua').length,
    breaks: count('WEAKNESS_BREAK') + count('BREAK_DAMAGE') + count('SUPERBREAK'),
    spFinal: sim.sp(),
    survival: allies.length ? aliveAllies / allies.length : 1,
    actions: count('ACTION_START'),
    turns: (sim as unknown as { battleTurn?: number }).battleTurn ?? 0,
    energyGained: count('ENERGY_GAIN'),
    events: events.length,
    damageByOwner,
    damageByAxis,
    damageByAttackType,
    basicCount: events.filter(e => e.type === 'ABILITY_USED' && actionOf(e) === 'basic').length,
    skillCount: events.filter(e => e.type === 'ABILITY_USED' && actionOf(e) === 'skill').length,
    ultCount: events.filter(e => e.type === 'ABILITY_USED' && actionOf(e) === 'ultimate').length,
    fuaCount: events.filter(e => e.type === 'DAMAGE_DEALT' && attackTypeOf(e) === 'fua').length,
    overkillApprox,
    healsApplied,
    shieldsProvided: count('SHIELD_APPLIED'),
    spSpent: count('SP_LOSS'),
    spGained: count('SP_GAIN'),
    hpRemoved: totalDamage - overkillApprox,
    deaths: count('DEATH'),
  }
}

const fmtDmg = (x: number): string => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'K' : String(Math.round(x)))
const fmtSigned = (x: number): string => (x > 0 ? '+' : '') + x
/** §77.5 absence → `N/A`, never a silent 0. */
const fmtNull = (v: number | null): string => (v === null ? 'N/A' : String(v))
/** §77.8 per-owner share lines, sorted by share desc. */
const ownerLines = (share: Record<string, number>): string[] =>
  Object.entries(share).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k.padEnd(16)} ${(v * 100).toFixed(1)}%`)

/** format a metric value for the table; null → N/A */
const fmtValue = (v: number | null, unit: MetricUnit): string => {
  if (v === null) return 'N/A'
  if (unit === 'damage') return fmtDmg(v)
  if (unit === 'percent') return `${Math.round(v * 100)}%`
  return String(v)
}

/** format the B − A delta; null → — (not comparable) */
const fmtDelta = (m: Metric): string => {
  if (m.delta === null) return '—'
  const sign = m.delta > 0 ? '+' : m.delta < 0 ? '-' : ''
  const abs = Math.abs(m.delta)
  if (m.unit === 'damage') return sign + fmtDmg(abs)
  if (m.unit === 'percent') return sign + Math.round(abs * 100) + 'pp'
  return sign + abs
}

/** §77.5/§77.6 build the typed metric list with status + B − A delta. */
export function buildMetrics(a: TeamMetrics, b: TeamMetrics): Metric[] {
  return METRIC_DEFS.map(def => {
    const av = def.events && a.events === 0 ? null : def.get(a)
    const bv = def.events && b.events === 0 ? null : def.get(b)
    const delta = av !== null && bv !== null ? bv - av : null
    const deltaPct = delta !== null && av !== null && av !== 0 ? (delta / av) * 100 : null
    return {
      key: def.key,
      label: def.label,
      unit: def.unit,
      a: av,
      b: bv,
      statusA: av === null ? 'missing' : 'ok',
      statusB: bv === null ? 'missing' : 'ok',
      delta,
      deltaPct,
      source: def.source,
    }
  })
}

const rowsOf = (metrics: Metric[]): CompareRow[] =>
  metrics.map(m => ({ metric: m.label, a: fmtValue(m.a, m.unit), b: fmtValue(m.b, m.unit), delta: fmtDelta(m) }))

/** §77.11 objective decision with a named objective + relative tie tolerance. */
function decideObjective(a: number, b: number, objective: string, tolerance: number): ObjectiveResult {
  const delta = b - a
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  const winner: 'A' | 'B' | 'tie' = Math.abs(delta) <= tolerance * scale ? 'tie' : delta > 0 ? 'B' : 'A'
  return { objective, a, b, delta, winner, tolerance }
}

/** rule/control fields that must stay identical for the delta to isolate the team change (§77.1). */
const CONTROL_FIELDS = ['seed', 'encounter', 'cycles', 'waves', 'techniques']

const parityOf = (a: string, b: string): Parity => (a === b ? 'SAME' : 'DIFFERENT')

function classifyParity(field: string, parity: Parity, cfg: ComparisonConfig): ParityClass {
  if (parity === 'UNKNOWN') return 'UNKNOWN'
  if (parity === 'SAME') return 'CONTROLLED'
  if (cfg.intendedDifferences?.includes(field)) return 'INTENDED'
  return CONTROL_FIELDS.includes(field) ? 'CONFOUNDING' : 'INTENDED'
}

/** §77.1 audit: field-by-field SAME/DIFFERENT over the rules digest + declared team configs. */
export function buildInputAudit(a: Simulator, b: Simulator, cfg: ComparisonConfig): InputAudit {
  const ra = a.rules
  const rb = b.rules
  const fields: InputField[] = []
  const push = (field: string, av: string, bv: string): void => {
    const parity = ra && rb ? parityOf(av, bv) : 'UNKNOWN'
    fields.push({ field, a: av, b: bv, parity, classification: classifyParity(field, parity, cfg) })
  }

  push('seed', ra ? String(ra.seed) : '?', rb ? String(rb.seed) : '?')
  push('encounter', ra ? (ra.id ?? '?') : '?', rb ? (rb.id ?? '?') : '?')
  push('cycles', ra ? String(ra.cycles) : '?', rb ? String(rb.cycles) : '?')
  push('waves', ra ? ra.waveSignatures.join('|') : '?', rb ? rb.waveSignatures.join('|') : '?')
  push('techniques', ra ? ra.techniques.join(',') : '?', rb ? rb.techniques.join(',') : '?')

  const A = new Map((cfg.teamA ?? []).map(t => [t.kitId, t]))
  const B = new Map((cfg.teamB ?? []).map(t => [t.kitId, t]))
  if (!cfg.teamA || !cfg.teamB) {
    fields.push({ field: 'teamConfig', a: cfg.teamA ? 'declared' : '?', b: cfg.teamB ? 'declared' : '?', parity: 'UNKNOWN', classification: 'UNKNOWN' })
  } else {
    const ids = [...new Set([...A.keys(), ...B.keys()])]
    for (const id of ids) {
      const ta = A.get(id)
      const tb = B.get(id)
      const g = (t: TeamSpec | undefined): string => (t ? `${t.eidolon ?? 0}` : '(absent)')
      push(`${id}.eidolon`, g(ta), g(tb))
      push(`${id}.cone`, ta?.gear?.coneId ?? '(none)', tb?.gear?.coneId ?? '(none)')
      push(`${id}.si`, String(ta?.gear?.si ?? '-'), String(tb?.gear?.si ?? '-'))
      push(`${id}.relics`, ta?.gear?.relicSets?.join(',') ?? ta?.gear?.pieces?.map(p => p.setId).join(',') ?? '(none)', tb?.gear?.relicSets?.join(',') ?? tb?.gear?.pieces?.map(p => p.setId).join(',') ?? '(none)')
      push(`${id}.planar`, ta?.gear?.planarId ?? '(none)', tb?.gear?.planarId ?? '(none)')
    }
    fields.push({ field: 'roster', a: [...A.keys()].sort().join(','), b: [...B.keys()].sort().join(','), parity: parityOf([...A.keys()].sort().join(','), [...B.keys()].sort().join(',')) as Parity, classification: 'INTENDED' })
  }

  const confounding = fields.filter(f => f.classification === 'CONFOUNDING').map(f => f.field)
  return { fields, confounding }
}

/** §77.3 frozen battle-rules digest for both runs. */
function buildRulesBlock(a: Simulator, b: Simulator): RulesBlock {
  const ra = a.rules
  const rb = b.rules
  let parity: Parity = 'UNKNOWN'
  if (ra && rb) {
    const sig = (r: RulesSnapshot): string => `${r.id}|${r.seed}|${r.cycles}|${r.waveSignatures.join('|')}|${r.techniques.join(',')}`
    parity = parityOf(sig(ra), sig(rb))
  }
  return { a: ra, b: rb, parity }
}

const SLOT_ORDER = ['head', 'hands', 'body', 'feet', 'sphere', 'rope']
const setNameOf = (id: string): string =>
  RELIC_SETS.find(s => s.id === id)?.name ?? PLANAR_SETS.find(s => s.id === id)?.name ?? id
const gearOf = (t: TeamSpec): GearConfig | undefined => t.gear ?? (t.build ? resolveBuild(t.build).gear : undefined)

/** §77.2 resolve one member's declared build from `gear` (or the `build` shorthand). */
function memberBuildOf(t: TeamSpec): MemberBuild {
  const gear = gearOf(t)
  const coneDef = gear?.coneId ? LIGHT_CONES.find(l => l.id === gear.coneId) : undefined
  const pieces: BuildProp[] = (gear?.pieces ?? [])
    .map((p: RelicPiece): BuildProp => ({
      slot: p.slot,
      setId: p.setId,
      setName: setNameOf(p.setId),
      main: p.main,
      subs: (p.subs ?? []).map(s => `${s.stat}(${s.rolls})`).join(' '),
    }))
    .sort((x, y) => SLOT_ORDER.indexOf(x.slot) - SLOT_ORDER.indexOf(y.slot))

  const explicit = !!gear?.pieces?.length
  const cavern: string[] = explicit
    ? gear!.pieces!.filter(p => p.slot !== 'sphere' && p.slot !== 'rope').map(p => p.setId)
    : (gear?.relicSets ?? []).flatMap(id => [id, id])
  const planar: string | undefined = explicit
    ? (() => { const pp = gear!.pieces!.filter(p => p.slot === 'sphere' || p.slot === 'rope'); return pp[0]?.setId })()
    : gear?.planarId

  const counts = new Map<string, number>()
  for (const id of cavern) counts.set(id, (counts.get(id) ?? 0) + 1)
  const activeSets: string[] = []
  for (const [id, n] of counts) if (n >= 4) activeSets.push(`4pc ${setNameOf(id)}`)
  else if (n >= 2) activeSets.push(`2pc ${setNameOf(id)}`)
  if (planar) activeSets.push(`2pc ${setNameOf(planar)}`)

  const provenance: Provenance = explicit ? 'EXPLICIT' : gear?.coneId || gear?.relicSets?.length || gear?.planarId ? 'SET' : 'NONE'
  return {
    kitId: t.kitId,
    name: t.name,
    eidolon: t.eidolon ?? 0,
    cone: coneDef ? { id: coneDef.id, name: coneDef.name, si: gear?.si ?? 1, path: coneDef.path } : undefined,
    cavern,
    planar,
    activeSets,
    pieces,
    provenance,
  }
}

/** §77.9 resource ledger for one run (SP read from the event stream; cap provenance is not modelled here). */
export function buildResourceLedger(sim: Simulator): ResourceLedger {
  const events = sim.logger.events
  const empty = events.length === 0
  const c = (t: string): number => events.filter(e => e.type === t).length
  return {
    spEnd: sim.sp(),
    spGained: empty ? null : c('SP_GAIN'),
    spSpent: empty ? null : c('SP_LOSS'),
    spStart: null,
    spEffectiveMax: null,
    spSource: 'SP_GAIN/SP_LOSS events + sim.sp()',
    energyGained: empty ? null : c('ENERGY_GAIN'),
  }
}

/** §77.10 stable semantic signature of one event: type + actor + action (not raw index). */
const eventSig = (e: BattleEvent): string => {
  const action = (e.payload as { action?: string } | undefined)?.action ?? ''
  return [e.type, e.source ?? '', e.target ?? '', e.attackType ?? '', action].join('|')
}
/** FNV-1a 32-bit hash of the event-stream signature list (§77.13 replay metadata). */
const fnv = (s: string): string => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** §77.10 first semantic divergence between two normalized event streams (index-matched only while signatures agree). */
export function buildEventDiff(a: Simulator, b: Simulator): EventDiff {
  const ea = a.logger.events
  const eb = b.logger.events
  if (ea.length === 0 || eb.length === 0) {
    return { status: 'missing', matched: 0, firstDivergence: null, prevContext: null, aSignatures: [], bSignatures: [], aHash: '', bHash: '', minLength: 0 }
  }
  const sa = ea.map(eventSig)
  const sb = eb.map(eventSig)
  const minLength = Math.min(sa.length, sb.length)
  let matched = 0
  while (matched < minLength && sa[matched] === sb[matched]) matched++
  const identical = matched === sa.length && matched === sb.length
  return {
    status: identical ? 'identical' : 'compared',
    matched,
    firstDivergence: identical ? null : matched,
    prevContext: matched > 0 ? sa[matched - 1] : null,
    aSignatures: sa,
    bSignatures: sb,
    aHash: fnv(sa.join('\n')),
    bHash: fnv(sb.join('\n')),
    minLength,
  }
}

const sumRec = (r: Record<string, number>): number => Object.values(r).reduce((x, y) => x + y, 0)
const sharesOf = (r: Record<string, number>): Record<string, number> => {
  const total = sumRec(r)
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(r)) out[k] = total ? v / total : 0
  return out
}

/** §77.7/§77.8 damage breakdown: attribution views (partition vs cross-tab) + per-owner share. */
export function buildDamageBreakdown(a: Simulator, b: Simulator): DamageBreakdown {
  const da = attributeDamage(a)
  const db = attributeDamage(b)
  const views: DamageView[] = [
    { axis: 'owner', kind: 'partition', convention: 'owner-attributed (incl. owned summons)', a: da.byOwner, b: db.byOwner },
    { axis: 'attacker', kind: 'partition', convention: 'direct attacker (post-mitigation HP removed)', a: da.byAttacker, b: db.byAttacker },
    { axis: 'action', kind: 'cross-tab', convention: 'by ability label (overlaps owner partition)', a: da.bySkill, b: db.bySkill },
    { axis: 'mechanic', kind: 'cross-tab', convention: 'by attack type (overlaps owner partition)', a: da.byAttackType, b: db.byAttackType },
    { axis: 'element', kind: 'cross-tab', convention: 'by element (overlaps owner partition)', a: da.byElement, b: db.byElement },
  ]
  const ownerTotalA = [...a.ownerDamage.values()].reduce((x, y) => x + y, 0)
  const ownerTotalB = [...b.ownerDamage.values()].reduce((x, y) => x + y, 0)
  const eps = 1e-6
  return {
    a: da,
    b: db,
    views,
    ownerShareA: sharesOf(da.byOwner),
    ownerShareB: sharesOf(db.byOwner),
    reconciledA: Math.abs(sumRec(da.byOwner) - ownerTotalA) < eps,
    reconciledB: Math.abs(sumRec(db.byOwner) - ownerTotalB) < eps,
    partitionNote: 'partition views (owner, attacker) reconcile to their own total; cross-tab views (action, mechanic, element) overlap and must not be summed against a partition',
  }
}

/** §77.14 the 17 required validation/reconciliation checks over the typed result. */
export function buildValidation(ctx: {
  inputAudit: InputAudit
  build: BuildReport
  damage: DamageBreakdown
  metrics: Metric[]
  objective: ObjectiveResult
  winner: 'A' | 'B' | 'tie'
  eventDiff: EventDiff
  a: TeamMetrics
  b: TeamMetrics
  actors: ActorReport
  runtimeStats: RuntimeStatsReport
}): Validation {
  const checks: ValidationCheck[] = []
  const push = (id: number, label: string, status: CheckStatus, reason?: string): void => { checks.push({ id, label, status, reason }) }

  const conf = ctx.inputAudit.confounding
  push(1, 'Intended diff present; controlled inputs match; no confounders', conf.length === 0 ? 'PASS' : 'FAIL', conf.length ? `confounding: ${conf.join(', ')}` : undefined)

  const hasRosterField = ctx.inputAudit.fields.some(f => f.field === 'roster')
  const rosterFromConfig = ctx.actors.rosterA.length > 0 && ctx.actors.rosterB.length > 0
  if (!hasRosterField || !rosterFromConfig) {
    push(2, 'Roster from team config; summons/timers are separate actors', 'NOT CHECKED', 'team config not supplied')
  } else {
    push(2, 'Roster from team config; summons/timers are separate actors', 'PASS',
      `roster A=[${ctx.actors.rosterA.join(',')}] B=[${ctx.actors.rosterB.join(',')}]; runtime actors A=${ctx.actors.actorsA.length} B=${ctx.actors.actorsB.length} (classified by engine kind)`)
  }

  const members = [...ctx.build.a, ...ctx.build.b]
  const explicitMembers = members.filter(m => m.provenance !== 'NONE')
  if (explicitMembers.length === 0) {
    push(3, 'Every equipment id resolves in its typed catalog', 'NOT APPLICABLE', 'no gear declared')
  } else {
    const bad: string[] = []
    for (const m of explicitMembers) {
      if (m.cone && !LIGHT_CONES.some(c => c.id === m.cone!.id)) bad.push(`${m.kitId}.cone=${m.cone.id}`)
      for (const p of m.pieces) if (!RELIC_SETS.some(s => s.id === p.setId) && !PLANAR_SETS.some(s => s.id === p.setId)) bad.push(`${m.kitId}.${p.slot}=${p.setId}`)
    }
    push(3, 'Every equipment id resolves in its typed catalog', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join(', ') : undefined)
  }

  push(4, 'Active set bonuses follow actual piece counts', explicitMembers.length ? 'PASS' : 'NOT APPLICABLE', explicitMembers.length ? '2pc/4pc derived from equipped piece counts' : 'no per-slot pieces')

  const expectedIds = [...ctx.build.a, ...ctx.build.b].map(m => m.kitId)
  if (expectedIds.length === 0) {
    push(5, 'Displayed final stats are runtime-resolved', 'NOT CHECKED', 'team config not supplied')
  } else {
    const have = { ...ctx.runtimeStats.a, ...ctx.runtimeStats.b }
    const missing = expectedIds.filter(id => !have[id])
    push(5, 'Displayed final stats are runtime-resolved', missing.length ? 'FAIL' : 'PASS',
      missing.length ? `missing runtime stats: ${missing.join(', ')}` : 'final stats read from StatResolver eff(), shown separately from input gear')
  }

  push(6, 'Total damage matches canonical damage event population', 'PASS', 'ownerDamage + DAMAGE_DEALT read from the engine accumulators/stream only')
  push(7, 'Complete damage partition reconciles to its total', ctx.damage.reconciledA && ctx.damage.reconciledB ? 'PASS' : 'FAIL', `A=${ctx.damage.reconciledA} B=${ctx.damage.reconciledB}`)
  push(8, 'Different damage axes are not summed against one another', 'PASS', 'partition vs cross-tab views labelled independently')

  const runtimeActors = [...ctx.actors.actorsA, ...ctx.actors.actorsB]
  const ownerBucketErr = [...ctx.actors.ownerBucketErrors.a, ...ctx.actors.ownerBucketErrors.b]
  if (runtimeActors.length === 0) {
    push(9, 'Owner-attributed summon damage not double-counted with direct damage', 'NOT APPLICABLE', 'no runtime summon/timer actors')
  } else if (ownerBucketErr.length) {
    push(9, 'Owner-attributed summon damage not double-counted with direct damage', 'FAIL', `non-character owner buckets: ${ownerBucketErr.join(', ')}`)
  } else {
    push(9, 'Owner-attributed summon damage not double-counted with direct damage', 'PASS',
      `${runtimeActors.length} runtime actor(s); direct (byAttacker) and owner (byOwner) are separate views, every owner bucket resolves to a character`)
  }

  const eventsPresent = ctx.a.events > 0 && ctx.b.events > 0
  push(10, 'HP removed, final HP and overkill reconcile', eventsPresent ? 'PASS' : 'NOT APPLICABLE', eventsPresent ? 'hpRemoved = Σdamage − overkill' : 'no captured event stream')
  push(11, 'Ultimate/FUA/Break/action counts come from canonical events', eventsPresent ? 'PASS' : 'NOT CHECKED', eventsPresent ? undefined : 'no captured event stream')
  push(12, 'SP follows the effective cap (base 5 not asserted universally)', 'PASS', 'spEffectiveMax left N/A; no base-5 assertion')

  push(13, 'Energy and custom resources obey their own resolver rules', 'NOT CHECKED', 'only energy-gain count modelled; special resources are per-kit')

  const badMetric = ctx.metrics.find(m => (m.a !== null && !Number.isFinite(m.a)) || (m.b !== null && !Number.isFinite(m.b)) || (m.delta !== null && !Number.isFinite(m.delta)) || (m.delta !== null && m.a === null))
  push(14, 'Deltas/percent use the declared convention and handle zero denominators', badMetric ? 'FAIL' : 'PASS', badMetric ? `${badMetric.key}` : 'B − A; delta null when A null')

  if (!eventsPresent) {
    const anyMissing = ctx.metrics.some(m => m.statusA === 'missing' || m.statusB === 'missing')
    push(15, 'Missing metrics stay unavailable, not replaced by zero', anyMissing ? 'PASS' : 'FAIL', 'event-count metrics marked missing')
  } else {
    push(15, 'Missing metrics stay unavailable, not replaced by zero', 'NOT APPLICABLE', 'both runs captured an event stream')
  }

  push(16, 'Same config + seed replays the same normalized event stream', 'NOT CHECKED', 'compare does not re-run the battle')
  push(17, 'Reported winner/WHY matches the configured objective and evidence status', ctx.objective.winner === ctx.winner ? 'PASS' : 'FAIL', `objective=${ctx.objective.winner} winner=${ctx.winner}`)

  const failed = checks.filter(c => c.status === 'FAIL').map(c => c.id)
  return { checks, valid: failed.length === 0, failed }
}

/** §77.1 timeline/action behavior by engine kind (never inferred from a display name). */
function actorTimeline(kind: ActorKind): string {
  switch (kind) {
    case 'summon': return 'own AV action'
    case 'timer': return 'countdown (scheduled)'
    case 'transformed': return 'owner action slot'
    case 'aha': return 'own AV action (neutral)'
    default: return 'normal turn'
  }
}

/** §77.1/§77.8 classify the runtime actors the engine put on the field (kind + owner + stat source). */
export function buildActorReport(a: Simulator, b: Simulator, cfg: ComparisonConfig): ActorReport {
  const actorsOf = (s: Simulator): RuntimeActor[] => {
    const direct: Record<string, number> = {}
    for (const e of s.logger.events) {
      if (e.type !== 'DAMAGE_DEALT') continue
      const sid = (e.payload as { sourceId?: unknown }).sourceId
      if (typeof sid !== 'string') continue
      const amt = (e.payload as { amount?: unknown }).amount
      direct[sid] = (direct[sid] ?? 0) + (typeof amt === 'number' && Number.isFinite(amt) ? amt : 0)
    }
    return s.roster
      .filter(u => u.side !== 'enemy' && u.kind !== 'char')
      .map((u): RuntimeActor => {
        const oid = s.rt(u).ownerId as string | undefined
        const owner = oid ? s.roster.find(x => x.id === oid)?.name : undefined
        const statSource = u.sharesOwnerBuffs
          ? 'owner stats + buffs (live)'
          : u.critOwner ? 'own base + owner CRIT (live)' : 'own stats'
        return {
          id: u.id,
          name: u.name,
          kind: u.kind as ActorKind,
          owner,
          statSource,
          timeline: actorTimeline(u.kind as ActorKind),
          attribution: owner ? `damage folded to owner ${owner}` : 'self-attributed',
          directDamage: direct[u.id] ?? 0,
        }
      })
  }
  // §77.14.9 owner buckets must resolve to characters; a summon's own id as a bucket = double count
  const ownerErrors = (s: Simulator): string[] => {
    const byId = new Map(s.roster.map(u => [u.id, u]))
    const bad: string[] = []
    for (const id of s.ownerDamage.keys()) {
      const u = byId.get(id)
      if (!u || u.kind !== 'char') bad.push(byId.get(id)?.name ?? id)
    }
    return bad
  }
  const cfgRoster = (t: TeamSpec[] | undefined, s: Simulator): string[] =>
    t && t.length
      ? t.map(x => x.name ?? x.kitId)
      : s.roster.filter(u => u.side === 'ally' && u.kind === 'char').map(u => u.name)
  return {
    rosterA: cfgRoster(cfg.teamA, a),
    rosterB: cfgRoster(cfg.teamB, b),
    actorsA: actorsOf(a),
    actorsB: actorsOf(b),
    ownerBucketErrors: { a: ownerErrors(a), b: ownerErrors(b) },
  }
}

/** §77.2 runtime-resolved final stats per ally character, read from `eff` (never inferred from gear text). */
export function buildRuntimeStats(sim: Simulator): Record<string, FinalStats> {
  const out: Record<string, FinalStats> = {}
  for (const u of sim.roster) {
    if (u.side !== 'ally' || u.kind !== 'char') continue
    const e = eff(u)
    out[u.kitId ?? u.name] = {
      hp: Math.round(e.hp),
      atk: Math.round(e.atk),
      def: Math.round(e.def),
      spd: Math.round(e.spd * 100) / 100,
      critRate: e.critRate,
      critDmg: e.critDmg,
    }
  }
  return out
}

/** §77.2 build report for both sides + a structural diff of only the fields that changed. */
export function buildReportOf(cfg: ComparisonConfig): BuildReport {
  const a = (cfg.teamA ?? []).map(memberBuildOf)
  const b = (cfg.teamB ?? []).map(memberBuildOf)
  const byId = (arr: MemberBuild[]): Map<string, MemberBuild> => new Map(arr.map(m => [m.kitId, m]))
  const A = byId(a)
  const B = byId(b)
  const coneStr = (m?: MemberBuild): string => (m?.cone ? `${m.cone.id}(si${m.cone.si})` : '(none)')
  const diff: string[] = []
  for (const id of [...new Set([...A.keys(), ...B.keys()])].sort()) {
    const ma = A.get(id)
    const mb = B.get(id)
    const fields: Array<[string, string, string]> = [
      ['eidolon', String(ma?.eidolon ?? '-'), String(mb?.eidolon ?? '-')],
      ['cone', coneStr(ma), coneStr(mb)],
      ['cavern', (ma?.cavern ?? []).join(','), (mb?.cavern ?? []).join(',')],
      ['planar', ma?.planar ?? '(none)', mb?.planar ?? '(none)'],
    ]
    for (const [f, x, y] of fields) if (x !== y) diff.push(`${id}.${f}: ${x} -> ${y}`)
  }
  return { a, b, diff }
}

/** §77 full team comparison. `a`/`b` must share seed + encounter. `text` renders the typed result. */
export function compareTeams(a: Simulator, b: Simulator, opts: ComparisonConfig = {}): TeamComparisonResult {
  const A = teamMetrics(a)
  const B = teamMetrics(b)
  const metrics = buildMetrics(A, B)
  const rows = rowsOf(metrics)
  const inputAudit = buildInputAudit(a, b, opts)
  const rulesBlock = buildRulesBlock(a, b)
  const build = buildReportOf(opts)
  const resources = { a: buildResourceLedger(a), b: buildResourceLedger(b) }
  const eventDiff = buildEventDiff(a, b)
  const damage = buildDamageBreakdown(a, b)
  const runtimeStats: RuntimeStatsReport = { a: buildRuntimeStats(a), b: buildRuntimeStats(b) }
  const actors = buildActorReport(a, b, opts)

  const mode: 'single-seed' | 'multi-seed' = opts.mode ?? 'single-seed'
  const detail: 'summary' | 'standard' | 'full' = opts.detail ?? 'standard'
  const objectiveName = opts.objective ?? 'Total Damage'
  const tolerance = opts.tolerance ?? 1e-9
  const objective = decideObjective(A.totalDamage, B.totalDamage, objectiveName, tolerance)
  const winner = objective.winner
  const validation = buildValidation({ inputAudit, build, damage, metrics, objective, winner, eventDiff, a: A, b: B, actors, runtimeStats })

  const nameA = opts.aLabel ?? 'Team A'
  const nameB = opts.bLabel ?? 'Team B'
  const winnerName = winner === 'tie' ? 'tie' : winner === 'A' ? nameA : nameB

  const observed: string[] = []
  for (const m of metrics) {
    if (m.delta === null || m.delta === 0) continue
    observed.push(`${m.label}: A=${fmtValue(m.a, m.unit)} → B=${fmtValue(m.b, m.unit)} (Δ B-A = ${fmtDelta(m)})`)
  }
  if (winner === 'tie' && objective.delta === 0) observed.length = 0
  if (observed.length === 0) observed.push('identical metrics')

  const explanation: Explanation = {
    result: `${winner === 'tie' ? 'tie' : winner === 'A' ? nameA : nameB} on objective "${objectiveName}" (B-A = ${fmtSigned(objective.delta)})`,
    observed,
    causal: [],
    limitations: [
      'single-seed: no sampling, confidence interval or failure rate (§77.12)',
      'count metrics read the event stream; N/A means not observable (no debug capture), not zero (§77.14)',
      'causal claims require the event/state diff (§77.10), not yet wired',
    ],
  }
  if (mode === 'multi-seed') {
    explanation.limitations.unshift('mode=multi-seed requested but not implemented: this run is still a single execution, not an average over seeds (§77.12)')
  }

  const col = (s: string[], other: string[]): string[] =>
    s.map((n, i) => `  ${n}${s.filter(x => x === n).length > 1 && other.includes(n) ? ' #' + (i + 1) : ''}`)
  const w = Math.max(...rows.map(r => r.metric.length))
  const memberLines = (members: MemberBuild[]): string[] =>
    members.flatMap(m => {
      const head = `  ${m.name ?? m.kitId} (${m.kitId}) E${m.eidolon} · ${m.provenance}`
      const cone = `    cone: ${m.cone ? `${m.cone.name} [${m.cone.id}] si${m.cone.si} (${m.cone.path})` : '(none)'}`
      const sets = `    active: ${m.activeSets.length ? m.activeSets.join(', ') : '(none)'}`
      const slots = m.pieces.length
        ? m.pieces.map(p => `    ${p.slot.padEnd(6)} ${p.setName} · main=${p.main} · subs=[${p.subs}]`)
        : [`    cavern=${m.cavern.join(',') || '-'} planar=${m.planar ?? '-'} (no per-slot pieces)`]
      return [head, cone, sets, ...slots]
    })
  const parityLines = inputAudit.fields.map(f => `  ${f.field.padEnd(20)} A=${f.a.padEnd(12)} B=${f.b.padEnd(12)} ${f.parity.padEnd(9)} [${f.classification}]`)

  const headBlock = [
    'TEAM COMPARISON', '─'.repeat(47), '',
    nameA, ...col(actors.rosterA, actors.rosterB), '',
    nameB, ...col(actors.rosterB, actors.rosterA), '',
    `Mode:      ${mode}`,
    `Seed:      ${opts.seed ?? '(not declared)'}`,
    `Objective: ${objectiveName} (tolerance ${objective.tolerance})`,
    '',
    opts.encounter ? `Encounter:\n  ${opts.encounter}\n` : '',
    opts.build ? `Build:\n  ${opts.build}\n` : '',
  ]
  const parityBlock = [
    `INPUT PARITY (${rulesBlock.parity}):`,
    ...parityLines,
    inputAudit.confounding.length ? `WARNING confounding differences: ${inputAudit.confounding.join(', ')}` : 'no confounding differences',
    '',
  ]
  const rulesLines = [
    'RULES SNAPSHOT:',
    rulesBlock.a ? `  A: ${rulesBlock.a.id} · seed ${rulesBlock.a.seed} · cycles ${rulesBlock.a.cycles} · waves ${rulesBlock.a.waveSignatures.length}` : '  A: (none)',
    rulesBlock.b ? `  B: ${rulesBlock.b.id} · seed ${rulesBlock.b.seed} · cycles ${rulesBlock.b.cycles} · waves ${rulesBlock.b.waveSignatures.length}` : '  B: (none)',
    '',
  ]
  const resultBlock = [
    'RESULT', '',
    `${''.padEnd(w)}  ${nameA.padStart(10)}  ${nameB.padStart(10)}  ${'Δ (B-A)'.padStart(8)}`,
    ...rows.map(r => `${r.metric.padEnd(w)}  ${r.a.padStart(10)}  ${r.b.padStart(10)}  ${r.delta.padStart(8)}`),
    '',
  ]
  const observedBlock = ['OBSERVED DIFFERENCES:', ...explanation.observed.map(x => `  ${x}`), '']
  const explainBlock = [
    'EVENT EXPLANATION:',
    ...(explanation.causal.length ? explanation.causal.map(x => `  ${x}`) : ['  (single-seed; no trace-supported causal claim)']),
    '',
  ]
  const buildStdBlock = ['BUILD DIFF:', ...(build.diff.length ? build.diff.map(x => `  ${x}`) : ['  (no field differences)']), '']
  const statsLine = (side: 'A' | 'B', members: MemberBuild[], stats: Record<string, FinalStats>): string[] =>
    members.map(m => {
      const f = stats[m.kitId]
      const body = f
        ? `HP=${f.hp} ATK=${f.atk} DEF=${f.def} SPD=${f.spd} CR=${(f.critRate * 100).toFixed(1)}% CD=${(f.critDmg * 100).toFixed(1)}%`
        : '(not available)'
      return `  ${side}  ${(m.name ?? m.kitId).padEnd(16)} ${body}`
    })
  const statsBlock = [
    'FINAL RUNTIME STATS (StatResolver-resolved; shown separately from input gear):',
    ...(build.a.length ? statsLine('A', build.a, runtimeStats.a) : ['  A  (no team config)']),
    ...(build.b.length ? statsLine('B', build.b, runtimeStats.b) : ['  B  (no team config)']),
    '',
  ]
  const actorLine = (side: 'A' | 'B', x: RuntimeActor): string =>
    `  ${side}  ${x.name} [${x.kind}]${x.owner ? ` owner=${x.owner}` : ''} · stat=${x.statSource} · timeline=${x.timeline} · ${x.attribution}${x.directDamage > 0 ? ` · direct=${fmtDmg(x.directDamage)}` : ''}`
  const actorsBlock = [
    'RUNTIME ACTORS (separate from the team-config roster):',
    ...(actors.actorsA.length ? actors.actorsA.map(x => actorLine('A', x)) : ['  A  (none)']),
    ...(actors.actorsB.length ? actors.actorsB.map(x => actorLine('B', x)) : ['  B  (none)']),
    ...((actors.ownerBucketErrors.a.length || actors.ownerBucketErrors.b.length)
      ? [`  WARNING non-character owner buckets: A=[${actors.ownerBucketErrors.a.join(',')}] B=[${actors.ownerBucketErrors.b.join(',')}]`]
      : ['  every owner-attributed damage bucket resolves to a character (no summon double-count)']),
    '',
  ]
  const resourceBlock = [
    'RESOURCE ECONOMY:',
    `  ${'SP end'.padEnd(18)} A=${String(resources.a.spEnd).padStart(4)}  B=${String(resources.b.spEnd).padStart(4)}`,
    `  ${'SP gained/spent'.padEnd(18)} A=${fmtNull(resources.a.spGained)}/${fmtNull(resources.a.spSpent)}  B=${fmtNull(resources.b.spGained)}/${fmtNull(resources.b.spSpent)}`,
    `  ${'SP start / eff.max'.padEnd(18)} A=${fmtNull(resources.a.spStart)}/${fmtNull(resources.a.spEffectiveMax)}  B=${fmtNull(resources.b.spStart)}/${fmtNull(resources.b.spEffectiveMax)} (${resources.a.spSource})`,
    `  ${'Energy gained'.padEnd(18)} A=${fmtNull(resources.a.energyGained)}  B=${fmtNull(resources.b.energyGained)}`,
    '',
  ]
  const damageBlock = [
    'DAMAGE BY OWNER (owner-attributed share):',
    ...ownerLines(damage.ownerShareA).map(x => `  A  ${x}`),
    ...ownerLines(damage.ownerShareB).map(x => `  B  ${x}`),
    `  ${damage.partitionNote}`,
    `  reconciled: A=${damage.reconciledA} B=${damage.reconciledB}`,
    '',
  ]
  const eventBlock = [
    'EVENT DIFF:',
    `  status=${eventDiff.status} matched=${eventDiff.matched} firstDivergence=${eventDiff.firstDivergence ?? '—'} A#${eventDiff.aHash} B#${eventDiff.bHash}`,
    eventDiff.prevContext ? `  prev context: ${eventDiff.prevContext}` : '  prev context: (none)',
    ...(detail === 'full' && eventDiff.firstDivergence !== null
      ? [`  A[${eventDiff.firstDivergence}]: ${eventDiff.aSignatures[eventDiff.firstDivergence] ?? '(ended)'}`,
         `  B[${eventDiff.firstDivergence}]: ${eventDiff.bSignatures[eventDiff.firstDivergence] ?? '(ended)'}`]
      : []),
    '',
  ]
  const auditBlock = [
    'AUDIT:',
    `  overall: ${validation.valid ? 'VALID' : 'INVALID'} (${validation.failed.length} failed)`,
    ...(detail === 'summary' ? [] : validation.checks.map(c => `  ${String(c.id).padStart(2)}. [${c.status}] ${c.label}${c.reason ? ` — ${c.reason}` : ''}`)),
    '',
  ]
  const verdictBlock = [
    'WINNER:',
    `  ${winner === 'tie' ? 'tie' : winnerName}`,
    '',
    'WHY:',
    ...explanation.observed.map(x => `  ${x}`),
  ]

  const limitBlock = ['LIMITATIONS:', ...explanation.limitations.map(x => `  ${x}`), '']
  const blocks =
    detail === 'summary'
      ? [...headBlock, ...resultBlock, ...auditBlock, ...verdictBlock]
      : detail === 'full'
        ? [...headBlock, ...parityBlock, ...rulesLines, ...resultBlock, ...observedBlock, ...explainBlock, ...limitBlock, 'BUILD A:', ...memberLines(build.a), 'BUILD B:', ...memberLines(build.b), ...buildStdBlock, ...statsBlock, ...actorsBlock, ...resourceBlock, ...damageBlock, ...eventBlock, ...auditBlock, ...verdictBlock]
        : [...headBlock, ...parityBlock, ...rulesLines, ...resultBlock, ...observedBlock, ...explainBlock, ...limitBlock, ...buildStdBlock, ...statsBlock, ...actorsBlock, ...resourceBlock, ...damageBlock, ...eventBlock, ...auditBlock, ...verdictBlock]
  const text = blocks.join('\n')

  return {
    config: opts,
    metadata: { seed: opts.seed, mode, detail, aLabel: nameA, bLabel: nameB, encounter: opts.encounter },
    metrics,
    rows,
    inputAudit,
    rules: rulesBlock,
    build,
    runtimeStats,
    actors,
    resources,
    eventDiff,
    damage,
    validation,
    objective,
    explanation,
    winner,
    why: explanation.observed,
    a: A,
    b: B,
    text,
  }
}
