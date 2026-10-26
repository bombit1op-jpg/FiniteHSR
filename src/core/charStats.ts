/**
 * §Party Setup — pre-battle final stat preview for a single character.
 *
 * This does NOT re-implement the stat math. It builds the character through the SAME setup path a
 * real battle uses (`prepareBattle` → `setupSim`: kit base + stat patch, path, minor traces, gear
 * flat stats + gear/cone/planar mods), then reads the resolved values through the engine's own
 * `eff(unit)` resolver. A preview can therefore never silently diverge from what the engine would
 * actually run.
 *
 * Battles are throwaway (a minimal one-mob encounter is spawned but never started), so calling this
 * for the four cards has no side effects on any real run.
 */
import { prepareBattle, ENEMY_PRESETS, type BattleSetup, type TeamSpec } from './battle'
import { buffSum, eff, effectResOf } from './combat/StatResolver'
import type { Unit } from './entities/Unit'
import { KITS } from './kits'

/** resolved pre-battle stats; percentages are fractions (0.05 = 5%) like the engine's `eff` */
export interface CharFinalStats {
  hp: number
  atk: number
  def: number
  spd: number
  critRate: number
  critDmg: number
  be: number
  /** Effect Hit Rate (base + gear/traces) */
  ehr: number
  /** Effect RES (flat, on the unit) */
  effRes: number
  /** Energy Regeneration Rate total: base 100% + gear/traces bonus (engine regen is `base × (1 + bonus)`) */
  err: number
  /** Outgoing Healing Boost */
  outHeal: number
  /** elemental DMG boost of the character's own element (gear) */
  elemDmgBoost: number
  /** kit's energy maximum for the Ultimate resource (for the energy-start slider) */
  energyMax: number
}

function probeSetup(spec: TeamSpec): BattleSetup {
  return {
    team: [spec],
    enemy: { ...ENEMY_PRESETS.mob, count: 1 },
    cycles: 1,
    seed: 1,
    aha: false,
  }
}

/** resolved stats for one character, or null when the kit id is unknown */
export function charFinalStats(spec: TeamSpec): CharFinalStats | null {
  const kit = KITS.find(k => k.id === spec.kitId)
  if (!kit) return null
  const sim = prepareBattle(probeSetup(spec))
  const u: Unit | undefined = sim.roster.find(x => x.side === 'ally' && x.kind === 'char')
  if (!u) return null
  const s = eff(u)
  return {
    hp: s.hp, atk: s.atk, def: s.def, spd: s.spd,
    critRate: s.critRate, critDmg: s.critDmg, be: s.be,
    ehr: (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr'),
    effRes: effectResOf(u),
    // display the total from the 100% base (ResourceSystem.gainEnergy applies `base × (1 + bonus)`)
    err: 1 + buffSum(u.buffs, 'err'),
    outHeal: buffSum(u.buffs, 'outHeal'),
    elemDmgBoost: buffSum(u.buffs, `dmg:${kit.elem}`),
    energyMax: kit.energyMax,
  }
}

/** the four combat skills shown on a character card, with their resolved level and multiplier */
export interface SkillLine {
  /** raw slot id as used by `PROG.abilities` / `DEFAULT_LEVELS` */
  slot: 'basic' | 'skill' | 'ult' | 'talent'
  label: string
  level: number
}

/** display labels for the four standard ability slots (no per-kit name table exists in raw data) */
export const SKILL_LABELS: Record<SkillLine['slot'], string> = {
  basic: 'Basic ATK',
  skill: 'Skill',
  ult: 'Ultimate',
  talent: 'Talent',
}
