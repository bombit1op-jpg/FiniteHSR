import { runBattle, type EnemySpec, type TeamSpec } from '../core/battle'
import type { BuildSpec } from '../core/build'
import { behaviorProfile, type BehaviorProfile } from './profile'

/**
 * §65.1 PROBE-BUILD LADDER + §65.2 STANDARD SCENARIO MATRIX — the runner that turns §65's pure
 * extractor (`profile.ts`) into a behavior PROFILE of a kit.
 *
 * A probe = one standardized build × one standardized scenario → one `BehaviorProfile`. Archetype
 * inference follows §65.1: it leans on CONTROL + FUNCTIONAL; BENCHMARK is the performance context.
 *
 * Deliberately enemy/config-driven only. The §65.2 "ally behaviour" cells (frequent/slow ally
 * actions, HP-loss available, summon environment, high/low SP) require specific ally kits, which
 * would couple this layer to content; `ScenarioSpec.allies` lets the caller supply them explicitly
 * instead of hard-coding kits here. The enemy-driven half of the matrix is fully specified below.
 */
export type ProbeLevel = 'control' | 'functional' | 'benchmark'

/** §65.1 probe-build ladder. Standardized across characters so intrinsic mechanics are comparable.
 *  CONTROL = kit base + traces, no gear. FUNCTIONAL = maxed levels + a path-agnostic cone/sets so
 *  the kit's mechanics activate. BENCHMARK = realistic high-quality (SI 5). */
export const PROBE_BUILDS: Record<ProbeLevel, BuildSpec> = {
  control: { traces: true, eidolon: 0 },
  functional: { cone: 'in_the_night', si: 1, relic: 'pioneer', planar: 'salsotto', eidolon: 0 },
  benchmark: { cone: 'in_the_night', si: 5, relic: 'pioneer', planar: 'salsotto', eidolon: 1 },
}

export type ProbeLevels = ProbeLevel[]
export const ARCHETYPE_PROBE_LEVELS: ProbeLevels = ['control', 'functional']

/** Neutral probe target: high HP so the character, not a one-shot, is measured; no weakness so no
 *  break/DoT contamination; low SPD/atk so it barely acts. §65.2 wants this constant across scenarios. */
export const PROBE_TARGET: Omit<EnemySpec, 'count'> = {
  name: 'Probe Target', hp: 5_000_000, spd: 100, level: 80, toughness: 120, weaknesses: [], atk: 300,
}
const tgt = (over: Partial<EnemySpec> = {}): EnemySpec => ({ ...PROBE_TARGET, count: 1, ...over })

export interface ScenarioSpec {
  id: string
  label: string
  /** enemy waves; `count` differences realise single/blast/AoE (§65.2) */
  waves: EnemySpec[][]
  cycles: number
  /** optional environment allies (frequent/slow actions, HP-loss, summon). Kept caller-supplied to
   *  avoid hard-coding content into the probe layer. */
  allies?: TeamSpec[]
}

/** §65.2 standard scenario matrix — every purely enemy/cycle-driven case, fully specified. */
export const PROBE_SCENARIOS: Record<string, ScenarioSpec> = {
  single: { id: 'single', label: 'single target', waves: [[tgt()]], cycles: 4 },
  blast: { id: 'blast', label: 'blast (3)', waves: [[tgt({ count: 3 })]], cycles: 4 },
  aoe: { id: 'aoe', label: 'AoE (5)', waves: [[tgt({ count: 5 })]], cycles: 4 },
  short: { id: 'short', label: 'short fight', waves: [[tgt()]], cycles: 2 },
  long: { id: 'long', label: 'long fight', waves: [[tgt()]], cycles: 12 },
  broken: { id: 'broken', label: 'broken target', waves: [[tgt({ toughness: 1, weaknesses: ['Fire', 'Lightning', 'Wind', 'Quantum', 'Physical', 'Ice', 'Imaginary'] })]], cycles: 4 },
  unbroken: { id: 'unbroken', label: 'unbroken target', waves: [[tgt({ toughness: 9999, weaknesses: [] })]], cycles: 4 },
}
export type ScenarioId = keyof typeof PROBE_SCENARIOS

export interface RunProbeOptions {
  seed?: number
  /** enable §66 role axis via a team context (the probe is single-character, so usually omitted) */
  role?: { teamDamage: number; teamHealing?: number; teamShielding?: number }
}

export interface Probe {
  kitId: string
  level: ProbeLevel
  scenario: ScenarioId
  profile: BehaviorProfile
}

/** §65 pipeline: character + probe build + standard scenario → simulation → feature vector → profile. */
export function runProbe(kitId: string, level: ProbeLevel, scenario: ScenarioId, opts: RunProbeOptions = {}): Probe {
  const sc = PROBE_SCENARIOS[scenario]
  const team: TeamSpec[] = [{ kitId, build: PROBE_BUILDS[level] }, ...(sc.allies ?? [])]
  const sim = runBattle({
    cycles: sc.cycles,
    seed: opts.seed ?? 7,
    log: { debug: 5 },
    team,
    enemy: sc.waves[0]![0]!,
    enemyWaves: sc.waves,
  })
  return { kitId, level, scenario, profile: behaviorProfile(sim, opts.role ? { role: opts.role } : {}) }
}

export interface ProbeAggregate {
  /** mean of every §66 axis across all probes */
  delivery: Record<string, number>
  tempo: Record<string, number>
  target: Record<string, number>
  /** number of (level, scenario) probes aggregated — the §68 confidence "sample count" */
  coverage: number
}

const meanAxes = (probes: Probe[]): ProbeAggregate => {
  const acc = (pick: (a: Probe['profile']['archetypes']) => Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const p of probes) for (const [k, v] of Object.entries(pick(p.profile.archetypes))) out[k] = (out[k] ?? 0) + v
    for (const k of Object.keys(out)) out[k] = probes.length ? out[k]! / probes.length : 0
    return out
  }
  return { delivery: acc(a => a.delivery), tempo: acc(a => a.tempo), target: acc(a => a.target), coverage: probes.length }
}

export interface ProbeOptions extends RunProbeOptions {
  levels?: ProbeLevels
  scenarios?: ScenarioId[]
}

export interface CharacterProbeResult {
  kitId: string
  probes: Probe[]
  aggregate: ProbeAggregate
}

/** §65 archetype inference: aggregate CONTROL+FUNCTIONAL across the standard scenario matrix (BENCHMARK
 *  is for performance, not archetype). Returns the composite profile + its coverage/confidence count. */
export function probeCharacter(kitId: string, opts: ProbeOptions = {}): CharacterProbeResult {
  const levels = opts.levels ?? ARCHETYPE_PROBE_LEVELS
  const scenarioIds = opts.scenarios ?? (Object.keys(PROBE_SCENARIOS) as ScenarioId[])
  const probes: Probe[] = []
  for (const level of levels) for (const scenario of scenarioIds) probes.push(runProbe(kitId, level, scenario, opts))
  return { kitId, probes, aggregate: meanAxes(probes) }
}
