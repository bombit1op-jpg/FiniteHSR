/**
 * §71/§74/§80 — BUILD / TEAM SEARCH-SPACE CONTRACT (phase D, stage 1: the space, not the search).
 *
 * This module only *describes* an optimization problem and *enumerates* it deterministically. There is
 * no search, pruning or scoring here — those consume this contract in later stages (§72). Two rules
 * from the guide are load-bearing and enforced structurally:
 *
 *   §80.4 — no hidden assumptions: allowed characters/eidolons/cones/SI/relic pool, the objective, the
 *           encounter and the seed are ALL explicit fields of `SearchSpace`. Nothing is read from a
 *           global, so two callers with the same `SearchSpace` enumerate the same candidates.
 *   §80.3 — determinism: enumeration order is fixed (lexicographic, nested loops), so "same config +
 *           seed ⇒ same ranking" holds before any battle even runs.
 *
 * Enumeration is lazy (`teamCandidates` is a generator): a full team space is astronomically large and
 * must never be materialized as an array. `candidateCount` gives the exact size without iterating.
 */
import type { AbilityLevels } from '../core/entities/Unit'
import type { BuildSpec } from '../core/build'
import type { TeamSpec, BattleSetup } from '../core/battle'
import type { EncounterSpec } from '../core/encounter'
import type { LogConfig } from '../core/battlelog'

// ---------------------------------------------------------------- objective (§74)

/** §74 build-optimization objectives. */
export type ObjectiveMetric =
  | 'totalDamage' | 'dps' | 'dpa' | 'burstDamage'
  | 'cycles' | 'turns' | 'variance'
  | 'survival' | 'healing' | 'shielding'
  | 'resourceEfficiency' | 'consistency'

/** Which direction is "better" by default — lower is better for time/variance metrics. */
export const OBJECTIVE_DIRECTION: Record<ObjectiveMetric, 'max' | 'min'> = {
  totalDamage: 'max', dps: 'max', dpa: 'max', burstDamage: 'max',
  cycles: 'min', turns: 'min', variance: 'min',
  survival: 'max', healing: 'max', shielding: 'max',
  resourceEfficiency: 'max', consistency: 'max',
}

export interface ObjectiveConstraint { metric: ObjectiveMetric; op: '>=' | '<=' | '>' | '<'; value: number }

/** §74 ObjectiveProfile: primary metric, optional tie-breakers, optional hard constraints. */
export interface Objective {
  primary: ObjectiveMetric
  direction?: 'max' | 'min'
  secondary?: ObjectiveMetric[]
  constraints?: ObjectiveConstraint[]
}

export function objectiveDirection(o: Objective): 'max' | 'min' {
  return o.direction ?? OBJECTIVE_DIRECTION[o.primary]
}

// ---------------------------------------------------------------- search space (§71.1, §80.4)

/** One allowed character and the explicit envelope of builds it may take. Absent arrays = a single
 *  choice, so an "E0-only, no-cone, no-set" analysis is just an empty `CharacterPool`. */
export interface CharacterPool {
  id: string
  eidolons?: number[]
  cones?: string[]
  /** superimposition ranks — only meaningful together with a cone (default [1]) */
  si?: number[]
  relicSets?: string[]
  /** planar sets available to fill the 2nd gear slot */
  planarSets?: string[]
  /** fixed ability levels shared by every build of this member (default engine DEFAULT_LEVELS) */
  levels?: AbilityLevels
  traces?: boolean
}

/** §80.4 the complete, explicit optimization problem. All constraints live here — never a global. */
export interface SearchSpace {
  /** candidate pool; a team is `teamSize` DISTINCT members drawn from here */
  members: CharacterPool[]
  teamSize: number
  /** §73.1 encounter is part of the problem — supplies waves + cycles, so `toBattleSetup` needs no enemy arg */
  encounter: EncounterSpec
  /** battle seed; every candidate is scored on this same seed (§80.3) */
  seed: number
  objective: Objective
  /** hard cap for a search stage to refuse an over-large space; `candidateCount` is checked against it */
  maxCandidates?: number
}

/** §71.1 FullTeamConfig — members + encounter + seed: one fully specified candidate the oracle can run. */
export interface FullTeamConfig {
  members: TeamSpec[]
  encounter: EncounterSpec
  seed: number
}

// ---------------------------------------------------------------- deterministic enumeration

const unique = <T>(xs: T[]): T[] => [...new Set(xs)]

/** All builds a single pool member may take — cartesian product in a fixed (lexicographic) order. */
export function memberBuilds(pool: CharacterPool): BuildSpec[] {
  const eidolons = pool.eidolons ?? [0]
  const cones: (string | undefined)[] = pool.cones?.length ? unique(pool.cones) : [undefined]
  const relics: (string | undefined)[] = pool.relicSets?.length ? unique(pool.relicSets) : [undefined]
  const planars: (string | undefined)[] = pool.planarSets?.length ? unique(pool.planarSets) : [undefined]
  const out: BuildSpec[] = []
  for (const eidolon of eidolons)
    for (const cone of cones) {
      const siList = cone ? (pool.si ?? [1]) : [undefined]
      for (const si of siList)
        for (const relic of relics)
          for (const planar of planars) {
            const b: BuildSpec = { eidolon }
            if (cone !== undefined) { b.cone = cone; b.si = si }
            if (relic !== undefined) b.relic = relic
            if (planar !== undefined) b.planar = planar
            if (pool.levels !== undefined) b.levels = pool.levels
            if (pool.traces !== undefined) b.traces = pool.traces
            out.push(b)
          }
    }
  return out
}

/** index combinations `C(n, k)` in lexicographic order (lazy). */
function* indexCombos(n: number, k: number): Generator<number[]> {
  if (k < 0 || k > n) return
  if (k === 0) { yield []; return }
  const pick: number[] = []
  function* rec(start: number): Generator<number[]> {
    if (pick.length === k) { yield pick.slice(); return }
    for (let i = start; i <= n - (k - pick.length); i++) { pick.push(i); yield* rec(i + 1); pick.pop() }
  }
  yield* rec(0)
}

/**
 * Deterministic, lazy enumeration of every candidate team. Members are chosen as index-combinations
 * (lexicographic) and their builds as `memberBuilds` (cartesian) — so the same `SearchSpace` always
 * yields the same sequence. `maxCandidates` (when set) refuses to start an over-large space.
 */
export function* teamCandidates(space: SearchSpace): Generator<FullTeamConfig> {
  const n = space.members.length
  if (space.maxCandidates !== undefined && candidateCount(space) > space.maxCandidates) {
    throw new Error(`search space too large: ${candidateCount(space)} > maxCandidates ${space.maxCandidates}`)
  }
  const buildsByPool = space.members.map(memberBuilds)
  for (const combo of indexCombos(n, space.teamSize)) {
    const perMember = combo.map(i => buildsByPool[i]!)
    const idx = new Array(combo.length).fill(0)
    // odometer over the chosen members' build lists (last member varies fastest — fixed order)
    for (;;) {
      const members: TeamSpec[] = combo.map((poolIdx, j) => {
        const pool = space.members[poolIdx]!
        return { kitId: pool.id, build: perMember[j]![idx[j]!]! }
      })
      yield { members, encounter: space.encounter, seed: space.seed }
      let carry = idx.length - 1
      while (carry >= 0) {
        idx[carry]! += 1
        if (idx[carry]! < perMember[carry]!.length) break
        idx[carry] = 0
        carry -= 1
      }
      if (carry < 0) break
    }
  }
}

/** exact number of candidates `teamCandidates` would yield (no iteration). */
export function candidateCount(space: SearchSpace): number {
  const k = space.teamSize
  const n = space.members.length
  if (k < 0 || k > n) return 0
  const builds = space.members.map(m => memberBuilds(m).length)
  let total = 0
  for (const combo of indexCombos(n, k)) {
    let product = 1
    for (const i of combo) product *= builds[i]!
    total += product
  }
  return total
}

// ---------------------------------------------------------------- candidate -> runnable setup

/**
 * Compile one enumerated candidate into a `BattleSetup` the engine can run. The encounter supplies the
 * waves (so `enemy`/`enemyWaves` are derived), the seed is the space's, and the log is OFF by default —
 * a search stage runs thousands of candidates and must not record events unless asked.
 */
export function toBattleSetup(space: SearchSpace, team: TeamSpec[], opts: { log?: LogConfig; cycles?: number } = {}): BattleSetup {
  const waves = space.encounter.waves
  return {
    team,
    enemy: waves[0]![0]!,
    enemyWaves: waves,
    encounter: space.encounter,
    cycles: opts.cycles ?? space.encounter.cycles ?? 4,
    seed: space.seed,
    log: opts.log,
  }
}

/** compile a `FullTeamConfig` (members already carry their `build`) into a runnable setup. */
export function configToSetup(space: SearchSpace, cfg: FullTeamConfig, opts?: { log?: LogConfig; cycles?: number }): BattleSetup {
  return toBattleSetup(space, cfg.members, opts)
}
