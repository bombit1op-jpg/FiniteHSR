/**
 * §29.7 replay artifact: `simulation -> save config + seed + event hash -> replay -> compare`.
 * A battle is reproducible when the same `BattleSetup` + seed reproduce the same event stream
 * (not merely the same final damage), so the artifact pins both hashes. §29.8 checkpoint hashes
 * are the per-event refinement of the same idea (see `BattleLogger.eventHash`).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Simulator } from '../../core/simulator'
import type { BattleSetup } from '../../core/battle'
import { eventHash, computeStateHash } from './hash'
import { rulesSnapshot, RULES_VERSION, type RulesSnapshot } from './rules'

/** Bumped when a rules change makes older artifacts intentionally non-reproducible. */
export { RULES_VERSION } from './rules'

export interface ReplayArtifact {
  version: string
  seed: number
  config: BattleSetup | unknown
  eventHash: string
  stateHash: string
  eventCount: number
  /** §21.4: the exact rules used (engine/rules/dataset versions + stage + overrides). */
  rules?: RulesSnapshot
  /** §28 first-divergence pointer: the event/action a failing run stopped at. */
  failAt?: { event: number; action: number }
}

/** a config is a runnable setup when it carries the required encounter fields */
function isSetup(v: unknown): v is BattleSetup {
  return !!v && typeof v === 'object' && 'team' in v && 'seed' in v && 'cycles' in v
}

/** Build the artifact from a finished battle. Requires `cfg.log` to be on, or `eventHash` is over
 *  an empty stream (`eventCount: 0`) — a replay of a run that recorded nothing is meaningless. */
export function makeReplay(sim: Simulator, config: BattleSetup | unknown, version = RULES_VERSION): ReplayArtifact {
  return {
    version,
    seed: sim.cfg.seed,
    config,
    rules: isSetup(config) ? rulesSnapshot(config) : undefined,
    eventHash: eventHash(sim.logger.events),
    stateHash: computeStateHash(sim.logger.snapshot()),
    eventCount: sim.logger.events.length,
  }
}

export function writeReplay(a: ReplayArtifact, path: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(a, null, 2) + '\n')
}

export function readReplay(path: string): ReplayArtifact {
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayArtifact
}

/** A replay "passes" when a fresh run agrees on the whole event stream and the final state. */
export function replayMatches(a: ReplayArtifact, b: ReplayArtifact): boolean {
  return a.eventHash === b.eventHash && a.stateHash === b.stateHash
}
