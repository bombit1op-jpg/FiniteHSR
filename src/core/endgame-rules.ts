/**
 * Endgame mode rules (guide §60). §60 splits the ENDGAME layer into data / rules / runtime:
 *  - data   — `endgame.ts` (stages, waves, levels from `endgame.json`)
 *  - rules  — THIS file: `EncounterMode`, `ModeDefinition`, and a per-mode `ScoreResolver`
 *  - runtime — `sim` + `EncounterState` (§59)
 *
 * §60.3 rule: a mode's result must NOT be reduced to `totalDamage`. Every mode fills the same
 * `ModeScore` metric set (victory/turns/cycles/time/score/remainingHP/kills/objectives) but resolves
 * `score` on its own primary metric. Exact score digits are project-side (no formula in the data);
 * the contract under test is that the modes differ and are monotone in their primary metric.
 */
import type { Simulator } from './simulator'

/** §60.2 — the mode-space an enemy variant can exist in (guide's five mode overrides). */
export type EncounterMode = 'NORMAL' | 'MEMORY_OF_CHAOS' | 'PURE_FICTION' | 'APOCALYPTIC_SHADOW' | 'OTHER_MODE'

/** our short endgame codes → guide mode space (endgame.json uses `MoC`/`PF`/`AS`/`AA`). */
export const MODE_BY_ENDGAME: Record<string, EncounterMode> = {
  MoC: 'MEMORY_OF_CHAOS',
  PF: 'PURE_FICTION',
  AS: 'APOCALYPTIC_SHADOW',
  AA: 'OTHER_MODE',
}

export type ScoreMetric = 'damage' | 'cycles' | 'kills' | 'remainingHP' | 'turns'

export interface ModeDefinition {
  id: EncounterMode
  label: string
  /** the metric this mode scores on beyond victory (§60.3) */
  primary: ScoreMetric
}

export const MODE_DEFINITIONS: Record<EncounterMode, ModeDefinition> = {
  NORMAL: { id: 'NORMAL', label: 'Normal', primary: 'damage' },
  MEMORY_OF_CHAOS: { id: 'MEMORY_OF_CHAOS', label: 'Memory of Chaos', primary: 'cycles' },
  PURE_FICTION: { id: 'PURE_FICTION', label: 'Pure Fiction', primary: 'kills' },
  APOCALYPTIC_SHADOW: { id: 'APOCALYPTIC_SHADOW', label: 'Apocalyptic Shadow', primary: 'remainingHP' },
  OTHER_MODE: { id: 'OTHER_MODE', label: 'Other', primary: 'turns' },
}

/** §60.3 — mode-agnostic score view. `score` is the only field whose meaning is mode-specific. */
export interface ModeScore {
  mode: EncounterMode
  victory: boolean
  /** total turns taken (battle logger) */
  turns: number
  /** cycles used in the final wave (1-based; per-wave AV/cycle reset makes this final-wave scope) */
  cycles: number
  /** AV elapsed in the final wave */
  time: number
  /** mode-specific score (see the resolver) */
  score: number
  /** summed HP of enemies still standing (0 on a full clear) */
  remainingHP: number
  /** enemies killed */
  kills: number
  /** total enemies that entered the fight */
  totalEnemies: number
  /** objectives met (declared objectives when the encounter was won) */
  objectives: string[]
}

export interface ScoreContext {
  /** cycle budget of the stage (MoC/AS) — lets the resolver reward unused cycles */
  cycleLimit?: number
  /** declared stage objectives (`endgame.json`); met only on victory */
  objectives?: string[]
}

/** map a stage/mode label (our `MoC` code, a full label, or a §59 mode string) to a mode. */
export function encounterModeFromLabel(label?: string): EncounterMode {
  if (!label) return 'NORMAL'
  if (label in MODE_BY_ENDGAME) return MODE_BY_ENDGAME[label]
  const norm = label.toLowerCase().replace(/[^a-z]/g, '')
  if (norm.includes('apocalyptic')) return 'APOCALYPTIC_SHADOW'
  if (norm.includes('fiction')) return 'PURE_FICTION'
  if (norm.includes('chaos') || norm.includes('memory')) return 'MEMORY_OF_CHAOS'
  return 'NORMAL'
}

/** the mode of a running battle, from its rules snapshot (defaults to NORMAL). */
export function endgameModeOf(sim: Simulator): EncounterMode {
  return encounterModeFromLabel(sim.rules?.mode)
}

/** score a finished battle for `mode`. `NORMAL` may keep damage; every endgame mode uses its own
 *  primary metric, so the result is never a bare `totalDamage` (§60.3). */
export function resolveScore(mode: EncounterMode, sim: Simulator, ctx: ScoreContext = {}): ModeScore {
  const roster = sim.units()
  const enemies = roster.filter(u => u.side === 'enemy')
  const kills = enemies.filter(u => u.dead).length
  const totalEnemies = enemies.length
  const totalMaxHp = enemies.reduce((a, u) => a + u.maxHp, 0)
  const remainingHP = enemies.reduce((a, u) => a + (u.dead ? 0 : u.hp), 0)
  const totalDamage = Math.round([...sim.ownerDamage.values()].reduce((a, b) => a + b, 0))
  const victory = sim.endReason === 'win'
  const turns = sim.logger.turn
  const cycles = sim.cycle + 1
  const time = sim.avElapsed

  // score digits are engine-side placeholders (no formula exists in the data). The
  // contract is that each mode resolves score on its own primary metric; upgrade path is to swap
  // the per-mode line for a data-sourced table if one is ever added.
  let score = 0
  switch (mode) {
    case 'MEMORY_OF_CHAOS':
      score = victory ? Math.max(0, (ctx.cycleLimit ?? cycles) - cycles) : 0
      break
    case 'PURE_FICTION':
      score = kills * 1000 + totalDamage
      break
    case 'APOCALYPTIC_SHADOW':
      score = victory ? 1000 + Math.max(0, 1000 - turns) : Math.ceil(1000 * (1 - remainingHP / Math.max(1, totalMaxHp)))
      break
    case 'OTHER_MODE':
      score = Math.max(0, 1000 - turns)
      break
    default:
      score = totalDamage
  }

  const objectives = victory ? (ctx.objectives ?? []) : []
  return { mode, victory, turns, cycles, time, score, remainingHP, kills, totalEnemies, objectives }
}
