/**
 * Encounter model (guide §21.3 + §59). Encounter — это не просто список EnemyInstance:
 * Enemies знает, как сражается; Encounter знает, почему бой происходит и как меняются
 * правила между волнами (guide §59 last rule).
 *
 * Layers:
 *  - `EncounterSpec`  — compile input (what a fixture/config names). Legacy fields kept.
 *  - `EncounterDefinition` / `WaveDefinition` — каноничная модель §59 (why the fight happens,
 *    per-wave rules, limits, victory/defeat conditions).
 *  - `resolveEncounter` — EncounterSpec → `EncounterFields` for `BattleSetup`.
 *  - `asDefinition` — EncounterSpec → §59 definition.
 *  - `encounterStateOf` — живой §59 `EncounterState` view над battle state (wave/cycle/time/
 *    activeEnemies/spawnedEntities/encounterFlags/encounterResources/victory/defeat).
 */
import type { EnemySpec, ManualMod } from './battle'
import type { Simulator } from './simulator'

export interface EncounterSpec {
  /** stable encounter id for logging/attribution */
  id: string
  /** stage/mode label, e.g. "MoC 12", "Pure Fiction", "Apocalyptic Shadow" */
  mode?: string
  /** stage id for endgame binding (endgame.json section id) */
  stageId?: string
  /** waves of enemy groups — wave 0 opens the fight; each group carries its own `count` */
  waves: EnemySpec[][]
  /** cycle/time limit (defaults to the engine's 6 when omitted) */
  cycles?: number
  /** stage effects applied at battle start (mirrors `BattleSetup.manualMods`) */
  effects?: ManualMod[]
  /** §59 starting rules (declarative, recorded in the rules snapshot; engine hooks land §60-61) */
  startingRules?: EncounterRule[]
  /** §59 stage modifiers merged into `effects` */
  stageModifiers?: ManualMod[]
  /** §59 explicit limits (cycleLimit ≈ cycles; turnLimit informational until §60-61 enforcement) */
  cycleLimit?: number
  turnLimit?: number
  victoryCondition?: string
  defeatCondition?: string
  /** victory condition label — informational, the engine wins on all enemies down */
  victory?: string
  /** loss condition label — informational */
  loss?: string
}

export interface EncounterFields {
  enemy: EnemySpec
  enemyWaves?: EnemySpec[][]
  cycles: number
  manualMods?: ManualMod[]
}

export type EncounterRule =
  | { kind: 'manualMod'; side: ManualMod['side']; stat: ManualMod['stat']; value: ManualMod['value'] }
  | { kind: 'note'; note: string }

/** §59 WaveDefinition: who/what spawns in a wave and how it behaves as a wave */
export interface WaveDefinition {
  id: string
  /** enemy GROUPS of this wave (each group carries its own `count`) */
  enemies: EnemySpec[]
  /** per-wave stage effects (applied to the pool that exists at spawn) */
  waveModifiers?: ManualMod[]
  spawnRules?: { trigger?: 'all_cleared' | 'timer'; note?: string }
  transitionRules?: { nextWave?: 'on_clear' | string; note?: string }
  startingPositions?: string[]
}

/** §59 EncounterDefinition: why the fight happens + how rules change between waves */
export interface EncounterDefinition {
  id: string
  mode?: string
  stageId?: string
  waves: WaveDefinition[]
  startingRules?: EncounterRule[]
  stageModifiers?: ManualMod[]
  cycleLimit?: number
  turnLimit?: number
  victoryCondition?: string
  defeatCondition?: string
}

/** §59 EncounterState (runtime contract). `encounterStateOf` derives a live view from battle
 *  state, so there is no second mutable copy to drift; flags/resources are engine-owned storage. */
export interface EncounterState {
  currentWave: number
  completedWaves: number[]
  /** ids of awakened, currently living enemies */
  activeEnemies: string[]
  /** ids of every enemy that has been spawned/awakened so far */
  spawnedEntities: string[]
  cycle: number
  time: number
  encounterFlags: Record<string, unknown>
  encounterResources: Record<string, number>
  victory?: string
  defeat?: string
}

const DEFAULT_CYCLES = 6

/** compile a declarative encounter to the `BattleSetup` encounter fields */
export function resolveEncounter(enc: EncounterSpec): EncounterFields {
  const first = enc.waves[0]?.[0]
  if (!first) throw new Error(`encounter ${enc.id}: no enemies in wave 1`)
  const out: EncounterFields = { enemy: first, cycles: enc.cycles ?? DEFAULT_CYCLES }
  if (enc.waves.length > 1 || enc.waves[0]!.length > 1) out.enemyWaves = enc.waves
  if (enc.effects?.length) out.manualMods = enc.effects
  if (enc.stageModifiers?.length) out.manualMods = [...(out.manualMods ?? []), ...enc.stageModifiers]
  return out
}

/** compile the §59 model from an EncounterSpec (waves [][] → WaveDefinition[]) */
export function asDefinition(enc: EncounterSpec): EncounterDefinition {
  return {
    id: enc.id,
    mode: enc.mode,
    stageId: enc.stageId,
    waves: enc.waves.map((enemies, i) => ({
      id: `${enc.id}.w${i + 1}`,
      enemies,
    })),
    startingRules: enc.startingRules,
    stageModifiers: enc.stageModifiers,
    cycleLimit: enc.cycleLimit ?? enc.cycles,
    turnLimit: enc.turnLimit,
    victoryCondition: enc.victoryCondition ?? enc.victory,
    defeatCondition: enc.defeatCondition ?? enc.loss,
  }
}

/** §59 live EncounterState projection of a battle */
export function encounterStateOf(sim: Simulator): EncounterState {
  const spawned = sim.roster.filter(u => u.side === 'enemy' && (u.wave ?? 1) <= sim.wave)
  const r = sim.rules
  return {
    currentWave: sim.wave,
    completedWaves: sim.wave > 1 ? [...Array(sim.wave - 1)].map((_, i) => i + 1) : [],
    activeEnemies: spawned.filter(u => !u.dead).map(u => u.id),
    spawnedEntities: spawned.map(u => u.id),
    cycle: sim.cycle + 1,
    time: sim.avElapsed,
    encounterFlags: sim.encounterFlags,
    encounterResources: sim.encounterResources,
    victory: sim.endReason === 'win' ? r?.victoryCondition : undefined,
    defeat: sim.endReason === 'lose' ? r?.defeatCondition : undefined,
  }
}

/** structural problems with an encounter; empty = valid */
export function validateEncounter(enc: EncounterSpec): string[] {
  const bad: string[] = []
  if (!enc.id) bad.push('id:empty')
  if (!enc.waves.length) bad.push('waves:empty')
  enc.waves.forEach((wave, wi) => {
    if (!wave.length) bad.push(`wave${wi + 1}:empty`)
    wave.forEach((g, gi) => {
      if (!g.name) bad.push(`wave${wi + 1}[${gi}]:name`)
      if (!(g.count >= 1)) bad.push(`wave${wi + 1}[${gi}]:count`)
      if (!(g.hp > 0)) bad.push(`wave${wi + 1}[${gi}]:hp`)
    })
  })
  if (enc.cycles !== undefined && !(enc.cycles > 0)) bad.push('cycles:<=0')
  if (enc.cycleLimit !== undefined && !(enc.cycleLimit > 0)) bad.push('cycleLimit:<=0')
  if (enc.turnLimit !== undefined && !(enc.turnLimit > 0)) bad.push('turnLimit:<=0')
  return bad
}