import type { Buff, DoT } from '../effects/Buff'

export type Elem = 'Physical' | 'Fire' | 'Ice' | 'Lightning' | 'Wind' | 'Quantum' | 'Imaginary'

/** json element labels that differ from the in-code `Elem` spelling; the scrap writes
 *  "Thunder" for Lightning (all Lightning chars: serval, moze, arlan, bailu, acheron,
 *  aglaea, trailblazer_elation, …). Use `normElem` on every value read from hsr-data. */
const ELEM_ALIAS: Record<string, Elem> = { Thunder: 'Lightning' }

export const normElem = (s: string): Elem => (ELEM_ALIAS[s] ?? (s as Elem))

export type DmgType = 'basic' | 'skill' | 'ult' | 'fua' | 'add' | 'dot' | 'break' | 'elation'

/** Which ability the source actually USED to produce an attack — the pressed-ability axis,
 *  independent of the hit's damage type. A Basic ATK stays `basic` even when its digits are
 *  retyped `fua`/`add`; an off-turn Follow-Up launched by another unit's action is `fua`; a
 *  Break/DoT tick or any unauthored hit is `other`. Lets a gate say "after X uses Basic ATK or
 *  Skill" (M7H Shifu talent/E2) — expressible with neither `DmgType` nor `AbilityKind`. */
export type AbilityType = 'basic' | 'skill' | 'ult' | 'talent' | 'technique' | 'fua' | 'add' | 'other'

export type StatKey =
  // attacker-side
  | 'hpPct' | 'hpFlat' | 'atkPct' | 'atkFlat' | 'defPct' | 'defFlat' | 'spdPct' | 'spdFlat'
  | 'critRate' | 'critDmg'
  | `critDmg:${DmgType}` | `critDmgTaken:${DmgType}`
  | 'be'        // Break Effect
  | 'wbe'       // Weakness Break Efficiency (fractional bonus on top of 1.0; Ruan Mei Overtone)
  | 'toughPierce' // weakness-ignore fraction for Toughness DMG on non-weak enemies (Fugue Foxian Prayer #6)
  | 'elation'   // Elation (Sparxie) — scales her Elation DMG multiplier directly
  | 'merrymake' // Merrymake — extra Elation DMG multiplier
  | 'vulnElation' // Elation DMG taken (target-side)
  | 'ehr' | 'err' | 'effRes'
  | 'outHeal'   // outgoing healing boost (healer-side)
  | 'inHeal'    // incoming healing boost (target-side); Anti-Heal / Incoming Healing Reduction rides this as a negative value (HealingPipeline `1+OHB+IHB−IHR`)
  | 'dmgAll' | `dmg:${Elem}` | `boost:${DmgType}`
  | 'finalDmgBoost' // final multiplicative DMG bonus, applied AFTER the boost pool and DEF/RES/vuln/mitigation. Separate from `dmgAll`, so it multiplies instead of adding. Canonical counterpart: `StatKey.FINAL_DMG_BOOST` in hsr-optimizer. Currently only written by Anaxa E6 — the other reference writers are either ordinary boosts here or already folded into their own multiplier (Himeko Nova E2 → `ctx.mult`).
  | 'atkPctVsBroken' // ATK bonus applied only to hits vs Weakness-Broken targets (Ruan Mei E2)
  | 'resPenAll' | `resPen:${Elem}`
  | 'defIgnore'
  | 'weaken'
  // target-side debuffs
  | 'vulnAll' | `vuln:${Elem}` | `vulnType:${DmgType}` | 'dotVuln'
  | `resRed:${Elem}` // target-side element RES reduction (opposite of attacker `resPen:${Elem}`); lowers the target's own `res[elem]`
  | 'resAll' // target-side All-Type RES modifier (signed): positive raises the target's All-Type RES (Day One), negative lowers it (All-Type RES shred — Silver Wolf Skill, Welt E4, Acheron Ult, Mortenax E1, ...)
  | 'defRed' | 'defBonus' | 'spdDown' | 'mitigation'
  | 'dotRes' // DoT damage taken reduction (Arlan A4 Endurance), fraction
  | 'aggro' // additive aggro weight for enemy targeting (TargetResolver)

/** Out-of-combat final stats (base + light cone + relics). */
export interface BaseStats {
  level: number
  hp: number
  atk: number
  def: number
  spd: number
  critRate?: number    // fractions: 0.05 = 5%
  critDmg?: number     // 1.0 = 100%
  energyMax?: number
  /** trace stat for debuffers */
  ehr?: number
  /** combat path (Destruction/Preservation/...): some traces gate on it (Lynx aggro) */
  path?: string
}

export interface Unit {
  id: string
  name: string
  /** 'neutral' = the Aha battle-event unit (takes its own turns, attacks both sides) */
  side: 'ally' | 'enemy' | 'neutral'
  kind: 'char' | 'enemy' | 'summon' | 'timer' | 'transformed' | 'aha'
  elem: Elem
  base: BaseStats
  hp: number
  maxHp: number
  /** start-HP fraction vs `maxHp` as the battle opens (default 1 = full). initBattle syncs hp to it,
   *  so HP-gated battle-start mechanics (Arlan A6 Repel at HP ≤ 50%) stay reachable from a fixture. */
  startHp?: number
  energy: number
  maxEnergy: number
  av: number
  /** AV at the unit's last action (DPAV metric per sheet). Unset = never acted (dead/departed). */
  lastActAv?: number
  buffs: Buff[]
  dots: DoT[]
  toughness: number
  maxToughness: number
  broken: boolean
  /** multi-layer intrinsic toughness (e.g. "120 ×8"): full ordered bar maxes, set at spawn from the
   *  enemy card model when it has more than one layer. `toughness`/`maxToughness` always mirror the
   *  CURRENT bar (`toughBarIndex`). Phase-gated segment lists are flattened in order (no per-phase
   *  toughness override exists) — see `enemyAtLevel`. */
  toughnessBars?: number[]
  /** 0-based index of the current intrinsic bar; 0 = first. Unset on single-bar enemies. */
  toughBarIndex?: number
  weaknesses: Elem[]
  res: Partial<Record<Elem, number>>
  /** resistance to debuff application (Effect RES), fraction */
  effectRes?: number
  /** Debuff RES — per-category application resistance, fraction, raw column order
   *  [Bleed, Burn, Frozen, Shock, Wind Shear, Entanglement, Imprisonment, Control Effects RES].
   *  `undefined` = no profile (all zero). Enemies only; allies carry no Debuff RES. */
  debuffRes?: number[]
    kitId?: string
    dead?: boolean
    /** left battle voluntarily (Trotter "Phew... Escaped") — dead for all targeting/action gates,
     *  no death-rattle/killer attribution involved */
    fled?: boolean
    /** off the action order by the unit's own state (Moze: "Prey" on the field) — rooted, untargetable */
    departedFlag?: boolean
  /** battle wave this unit belongs to (enemies: 1-indexed; 1 default) */
  wave?: number
  /** enemy difficulty tier (Himeko charge +3 vs elite+) — derived from enemy name if unset */
  rank?: 'mob' | 'elite' | 'boss'
  /** aggro value for enemy targeting (100 = normal, 150 = Preservation, modified by buffs) */
  aggro?: number
  /** cannot be targeted by anything (Cyrene Demiurge): only team/zone buffs (no turn duration) reach it */
  untargetable?: boolean
  /**
   * A SUMMON (Lightning-Lord, Numby, Souldragon, Fuyuan) uses ALL of its owner's buffs and
   * stats while it deals damage — `Summon.md`: "When they deal damage, they use the current
   * stats of their characters." Owner id lives in the kit runtime (`rt(u).ownerId`).
   * Memosprites leave this OFF: they receive Status Effects separately from their Memomaster
   * and only inherit base stats (`Memosprite.md`) — CRIT Rate/DMG come from `critOwner`.
   */
  sharesOwnerBuffs?: boolean
  /**
   * Memosprite CRIT Rate/DMG source: the Memomaster, read LIVE at every `eff()` call
   * (a memosprite crits with its owner's current CRIT). Set by `mirrorOwnerCrit`.
   * object ref, not an id — `eff()` has no roster access, and no cycle exists
   * (owners are always `kind: 'char'`, which `eff()` also uses as the recursion stop).
   */
  critOwner?: Unit
}

/** ability levels as chosen in game (basic 1-7, others 1-12 with eidolons) */
export interface AbilityLevels {
  basic: number
  skill: number
  ult: number
  talent: number
  /** Elation Skill level (defaults to `skill`; own E3/E5 eidolon bumps only) */
  el_skill?: number
}

/** one equipped relic/planar piece */
export interface RelicPiece {
  setId: string
  /** main stat key (see RELIC_MAIN_VALUES); head=hpFlat hands=atkFlat fixed */
  slot: 'head' | 'hands' | 'body' | 'feet' | 'sphere' | 'rope'
  main: string
  /** substat rolls */
  subs: Array<{
    stat: string
    /** starting (first) roll tier */
    tier: 0 | 1 | 2
    /** total number of rolls (start + upgrades) */
    rolls: number
    /** per-roll tiers, first = start, rest = +3/+6/+9/+12/+15 upgrades; when absent, falls back to tier×rolls */
    spread?: number[]
  }>
  /** relic level (0-15); 0/1-star pieces default 15 */
  level?: number
  /** relic rarity stars (2-5) */
  quality?: 2 | 3 | 4 | 5
}

/** equipment selection per character */
export interface GearConfig {
  coneId?: string
  /** superimposition rank 1-5, default 1 */
  si?: number
  /** Light Cone level 1-80 (default 80). Only the cone's base stats scale; its passive does not. */
  coneLevel?: number
  /** two or four-piece relic set ids (legacy simple mode) */
  relicSets?: string[]
  planarId?: string
  /** per-slot pieces (overrides relicSets/planarId set counting) */
  pieces?: RelicPiece[]
}

export  type { Buff, DoT, Mod } from '../effects/Buff'