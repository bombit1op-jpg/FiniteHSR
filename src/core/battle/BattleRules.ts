/**
 * §46 battle rules layer — the RULES SNAPSHOT stage of the engine pipeline.
 *
 * A `RulesSnapshot` is the frozen, deterministic digest of everything that defines a battle's
 * rules (encounter identity, seed, cycles/limits, starting rules, stage modifiers, per-wave
 * enemy signatures, techniques, victory/defeat conditions). It is attached to the Simulator as
 * `sim.rules` BEFORE the battle starts, so a run can be re-identified and replayed from config
 * alone — no simulation needed (guide §59, §46).
 *
 * This file owns the digest shape (`RulesSnapshot`) and its constructor (`buildRulesSnapshot`).
 * The encounter model that FEEDS it (EncounterSpec, waves, live EncounterState) stays in
 * `encounter.ts`; rules are the battle-side projection of an encounter.
 */
import type { EnemySpec, ManualMod } from '../battle'
import type { EncounterRule, EncounterSpec } from '../encounter'

/** §59 RulesSnapshot: frozen, deterministic digest of the battle's rules — the "RULES SNAPSHOT"
 *  stage of the engine pipeline. Attached to Simulator as `sim.rules` before battle start. */
export interface RulesSnapshot {
  version: 1
  id: string
  mode?: string
  stageId?: string
  seed: number
  cycles: number
  cycleLimit?: number
  turnLimit?: number
  startingRules: EncounterRule[]
  stageModifiers: ManualMod[]
  /** per-wave digest of the EFFECTIVE enemy specs actually run (name|count|hp|spd|level|toughness|weak|res|atk) */
  waveSignatures: string[]
  techniques: string[]
  victoryCondition?: string
  defeatCondition?: string
}

export interface SnapshotInputs {
  encounter?: EncounterSpec
  /** the EFFECTIVE waves configured on the battle (post-resolve) */
  enemyWaves: EnemySpec[][]
  seed: number
  cycles: number
  techniques?: string[]
}

function waveSignature(e: EnemySpec): string {
  const res = Object.entries(e.res ?? {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(',')
  return `${e.name}|${e.count}|${e.hp}|${e.spd}|${e.level}|${e.toughness}|${(e.weaknesses ?? []).join(',')}|${res}|${e.atk}|${e.rank ?? ''}`
}

/** deterministic, serializable rules digest — same inputs ⇒ identical snapshot */
export function buildRulesSnapshot(inp: SnapshotInputs): RulesSnapshot {
  const enc = inp.encounter
  return {
    version: 1,
    id: enc?.id ?? 'setup',
    mode: enc?.mode,
    stageId: enc?.stageId,
    seed: inp.seed,
    cycles: inp.cycles,
    cycleLimit: enc?.cycleLimit ?? inp.cycles,
    turnLimit: enc?.turnLimit,
    startingRules: enc?.startingRules ?? [],
    stageModifiers: enc?.stageModifiers ?? [],
    waveSignatures: inp.enemyWaves.map(w => w.map(waveSignature).join(';')),
    techniques: [...(inp.techniques ?? [])].sort(),
    victoryCondition: enc?.victoryCondition ?? enc?.victory,
    defeatCondition: enc?.defeatCondition ?? enc?.loss,
  }
}
