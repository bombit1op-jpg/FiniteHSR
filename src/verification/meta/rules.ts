/**
 * §21.4 rules snapshot: pin the exact rules a run used — engine version, mechanics/rules version,
 * dataset version, the stage (encounter) identity, and explicit per-run overrides — so an old
 * replay artifact is recognized as non-reproducible when any of them changes. `rulesHash` digests
 * it with the shared key-sorted SHA-256.
 */
import { sha256Hex, stableJson } from './hash'
import { ENCOUNTER_PRESETS, type BattleSetup } from '../../core/battle'

/** engine version label (also written into the §40 `config.json`). */
export const ENGINE_VERSION = '0.42.1'

/** Bumped when a rules change makes older artifacts intentionally non-reproducible. */
export const RULES_VERSION = '2026-10-08'

/** Bumped when the raw datasets (characters/lightcones/relics/endgame) change. */
export const DATASET_VERSION = '2026-10-08'

export interface RulesSnapshot {
  engine: string
  rules: string
  dataset: string
  /** stage identity: encounter id/mode + cycle limit (guide §21.3/§21.4) */
  stage: { encounter?: string; mode?: string; cycles: number }
  /** explicit per-run overrides that are not part of the datasets */
  overrides: { seed: number; techniques: string[]; manualMods: number; enemyWaves: number }
}

export function rulesSnapshot(setup: BattleSetup): RulesSnapshot {
  let encounter: string | undefined
  let mode: string | undefined
  let cycles = setup.cycles
  if (typeof setup.encounter === 'string') {
    encounter = setup.encounter
    mode = ENCOUNTER_PRESETS[setup.encounter]?.mode
  } else if (setup.encounter) {
    encounter = setup.encounter.id
    mode = setup.encounter.mode
    cycles = setup.encounter.cycles ?? cycles
  }
  // omit undefined keys (JSON.stringify drops them; stableJson renders them as null → hash drift)
  const stage: RulesSnapshot['stage'] = { cycles }
  if (encounter !== undefined) stage.encounter = encounter
  if (mode !== undefined) stage.mode = mode
  return {
    engine: ENGINE_VERSION,
    rules: RULES_VERSION,
    dataset: DATASET_VERSION,
    stage,
    overrides: {
      seed: setup.seed,
      techniques: setup.techniques ?? [],
      manualMods: setup.manualMods?.length ?? 0,
      enemyWaves: setup.enemyWaves?.length ?? 0,
    },
  }
}

export function rulesHash(s: RulesSnapshot): string {
  return sha256Hex(stableJson(s))
}
