import { Simulator } from './simulator'
import { KITS, KIT_PATH } from './kits'
import { preset, presetTeams, presetTeamOrder } from './presets'
import type { Elem, GearConfig, StatKey, Unit } from './entities/Unit'
import type { Buff } from './effects/Buff'
import type { AbilityLevels } from './entities/Unit'
import { DEFAULT_LEVELS, type Action } from './kit'
import { traceMods } from './progression'
import { charLevelRatios } from './levelStats'
import type { LogConfig } from './battlelog'
import { applyBuild, type BuildSpec } from './build'
import { resolveEncounter, type EncounterSpec } from './encounter'
import { buildRulesSnapshot } from './battle/BattleRules'
import { enemyBehavior } from './enemy/behaviors'

export type SkillPattern = 'auto' | 'basic->skill' | 'skill->basic' | 'normal->skill->normal' | 'rotation'
export type SkillRotation = string // e.g. "B S B S U" (B=basic, S=skill, U=ult)

export interface TeamSpec {
  kitId: string
  name?: string
  /** path for the cone's passive to work (off-path cones give stats only). Defaults to KIT_PATH[kitId]. */
  path?: string
  stats?: Partial<{ hp: number; atk: number; def: number; spd: number; critRate: number; critDmg: number; be: number; ehr: number }>
  energyStartFrac?: number
  /** start-HP fraction (Arlan A6 Repel triggers at battle start with HP ≤ 50%). Default 1 = full. */
  hpFrac?: number
  mainDpsId?: string
  gear?: GearConfig
  /** declarative build (guide Phase B #11): compiled to `gear`/`stats`/`eidolon` unless set explicitly */
  build?: BuildSpec
  eidolon?: number
  levels?: AbilityLevels
  /** character level (1…80). Default 80. Scales the kit's base HP/ATK/DEF. */
  level?: number
  /** minor traces: `true` = all, `false` = none, array = per-trace flags (3 slots, raw order) */
  traces?: boolean | boolean[]
  /** higher = used first when SP available (default 0) */
  skillPriority?: number
  /** AI pattern for skill usage */
  skillPattern?: SkillPattern
  /** custom rotation string when pattern='rotation' */
  skillRotation?: SkillRotation
  /** character-specific strategy flags */
  strategy?: Record<string, boolean>
}

/** resolve effective ability levels given eidolon rank */
/** Per-character eidolon ability-level deltas, keyed by minimum eidolon.
 *  Complete for all 93 kits — `probe-eidolon-ladder.ts` re-derives it from
 *  hsr-data/characters.json and fails on drift, so there is no generic fallback. */
export const EIDOLON_LV: Record<string, Record<number, { basic?: number; skill?: number; ult?: number; talent?: number; el_skill?: number }>> = {
  // canon: E3 Sword Savant = Skill+2/Basic+1, E5 Surging Strife = Ult+2/Talent+2
  yanqing: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 Rise From Fame = Ult+2/Talent+2, E5 Prevail via Taixu = Skill+2/Basic+1
  sushang: { 3: { ult: 2, talent: 2 }, 5: { skill: 2, basic: 1 } },
  // canon: E3 Vestige of Happiness = Ult+2/Basic+1, E5 Genesis of First Love = Skill+2/Talent+2
  misha: { 3: { ult: 2, basic: 1 }, 5: { skill: 2, talent: 2 } },
  // canon: E3 Duḥkha = Skill+2/Basic+1, E5 Deva = Ult+2/Talent+2
  xueyi: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 Three Temptations = Skill+2/Basic+1, E5 Five Skandhas = Ult+2/Talent+2
  hanya: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 Big Money! = Skill+2/Basic+1, E5 Huuuuge Money! = Ult+2/Talent+2
  sampo: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 Bear Weight of Worlds = Ult+2/Basic+1, E5 The Path of Permanence Sweeps Far = Skill+2/Talent+2
  danhengperman: { 3: { ult: 2, basic: 1 }, 5: { skill: 2, talent: 2 } },
  // canon: E3 Blade: A Feast on Evils = Ult+2/Basic+1/Elation Skill+1, E5 Arcadia: A Glimpse of Fates = Skill+2/Talent+2/Elation Skill+1
  evanescia: { 3: { ult: 2, basic: 1, el_skill: 1 }, 5: { skill: 2, talent: 2, el_skill: 1 } },
  // canon: E3 Across the Shore = Ult+2/Talent+2, E5 I Severed My Woes = Skill+2/Basic+1
  mortenax_blade: { 3: { ult: 2, talent: 2 }, 5: { skill: 2, basic: 1 } },
  // canon: E3 A Rendezvous Served Chilled = Skill+2/Talent+2/Elation Skill+1,
  //       E5 Into the Eye of the Jackpot = Ult+2/Basic+1/Elation Skill+1
  aventurine_waveflair: { 3: { skill: 2, talent: 2, el_skill: 1 }, 5: { ult: 2, basic: 1, el_skill: 1 } },
  // canon: E3 An Ocean in the Soul = Ult+2/Basic+1, E5 Oho, the Answer = Skill+2/Talent+2
  himeko_nova: { 3: { ult: 2, basic: 1 }, 5: { skill: 2, talent: 2 } },
  // canon: E3 Basic+1/Skill+2/Elation Skill+1, E5 Ult+2/Talent+2/Elation Skill+1 (Lv.15/10 caps)
  silver_wolf_lv999: { 3: { skill: 2, basic: 1, el_skill: 1 }, 5: { ult: 2, talent: 2, el_skill: 1 } },
  // canon: E3 Read Between the Tiles = Ult+2/Talent+2, E5 Gambit for the Tiles = Skill+2/Basic+1
  qingque: { 3: { ult: 2, talent: 2 }, 5: { skill: 2, basic: 1 } },
  // canon: E3 Echoes Left Along the Way = Skill+2/Talent+2 (Memosprite Talent+1 handled in the kit,
  //       ladder caps at Lv.10), E5 To Chase the Dawn Anew = Ult+2/Basic+1 (Memosprite Skill+1 in the kit)
  robin_summeretto: { 3: { skill: 2, talent: 2 }, 5: { ult: 2, basic: 1 } },
  // canon: E3 Sharp Wit in Martial Might = Skill+2/Basic+1, E5 Sword Delights, Sugar Blights = Ult+2/Talent+2
  march7th_the_hunt: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 By Thy Being, As I've Written = Ult+2/Talent+2 (Memosprite Skill+1, ladder caps at Lv.10),
  //       E5 Gaze, Steeped in Yesterbloom = Skill+2/Basic+1 (Memosprite Talent+1)
  cyrene: { 3: { ult: 2, talent: 2 }, 5: { skill: 2, basic: 1 } },
  // canon: E3 Amidst Silenced Stars, I Deep Sleep = Skill+2/Basic+1, E5 From Undreamt Night, I Thence Shine = Ult+2/Talent+2
  // (basic/basic_en ladders cap at Lv.10 ⇒ the E3 Basic+1 clamps, same as robin_summeretto's memosprite ladders)
  firefly: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },
  // canon: E3 Bequeath in the Coalescence of Dew = Skill+2/Basic+1/Memosprite Talent+1,
  //       E5 Weave Under the Shroud of Woe = Ult+2/Talent+2/Memosprite Skill+1.
  // The two memosprite ladders (1140201 Thorned Snare, 1140203 SPD boost) are 10 deep and
  // already pinned at Lv.10 ⇒ both memosprite bumps clamp, as does the E3 Basic+1.
  aglaea: { 3: { skill: 2, basic: 1 }, 5: { ult: 2, talent: 2 } },

  // ---- generated from hsr-data/characters.json `ranks.3` / `ranks.5` (canon eidolon ladder text).
  // `rtk npx tsx probe-eidolon-ladder.ts` re-derives these and fails on any drift;
  // `--emit` prints this block. Only `robin` (above) uses the generic fallback below.
  seele: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  jingyuan: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  bronya: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  pela: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  guinaifen: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  sparkle: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  gallagher: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  huohuo: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  march7th: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  danheng: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  himeko: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  welt: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  kafka: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  silverwolf: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  luocha: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  yukong: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  blade: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  luka: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  danhengil: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  fuxuan: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  asta: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  arlan: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  herta: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  serval: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  gepard: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  natasha: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  lynx: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  topaz: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  jingliu: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  tingyun: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  blackswan: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  sparxie: { 3: { basic: 1, skill: 2, el_skill: 1 }, 5: { ult: 2, talent: 2, el_skill: 1 } },
  yao_guang: { 3: { basic: 1, skill: 2, el_skill: 1 }, 5: { ult: 2, talent: 2, el_skill: 1 } },
  hyacine: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  tribbie: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  sunday: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  cipher: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  cerydra: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  castorice: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  phainon: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  aventurine: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  fugue: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  clara: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  hook: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  bailu: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  jiaoqiu: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  feixiao: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  yunli: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  lingsha: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  argenti: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  ruanmei: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  dr_ratio: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  moze: { 3: { ult: 2, talent: 2 }, 5: { basic: 1, skill: 2 } },
  acheron: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  jade: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  boothill: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  rappa: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  the_herta: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  mydei: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  anaxa: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  hysilens: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  evernight: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  saber: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  archer: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  rin: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  gilgamesh: { 3: { basic: 1, skill: 2 }, 5: { ult: 2, talent: 2 } },
  trailblazer_preservation: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  trailblazer_harmony: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  trailblazer_remembrance: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  trailblazer_destruction: { 3: { skill: 2, talent: 2 }, 5: { basic: 1, ult: 2 } },
  trailblazer_elation: { 3: { skill: 2, talent: 2, el_skill: 1 }, 5: { basic: 1, ult: 2, el_skill: 1 } },
  pearl: { 3: { basic: 1, ult: 2, el_skill: 1 }, 5: { skill: 2, talent: 2, el_skill: 1 } },
  ashveil: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  the_dahlia: { 3: { basic: 1, ult: 2 }, 5: { skill: 2, talent: 2 } },
  // canon: Robin's E3/E5 happen to be the generic shape (Skill+2/Ult+2, Basic+1/Talent+2).
  // Listed explicitly so the fallback below is dead code and the probe covers all 93 kits.
  robin: { 3: { skill: 2, ult: 2 }, 5: { basic: 1, talent: 2 } },
}

/** Per-kit level ceilings. Default 7/12/12/12/12; kits whose data/eidolons cap
 *  higher (silver_wolf_lv999 E3 = Basic 10 / everything else 15) raise them here. */
const LEVEL_CAPS: Record<string, Partial<AbilityLevels>> = {
  silver_wolf_lv999: { basic: 10, skill: 15, ult: 15, talent: 15, el_skill: 15 },
  robin_summeretto: { basic: 10, skill: 15, ult: 15, talent: 15 },
  // canon: data-лестницы 1224xx — basic 10 ур., skill/ult/talent 15 ур.
  march7th_the_hunt: { basic: 10, skill: 15, ult: 15, talent: 15 },
  // canon: data-лестницы 1415xx — basic 10 ур., skill/ult/talent 15 ур.
  cyrene: { basic: 10, skill: 15, ult: 15, talent: 15 },
  // canon: data-лестницы 1402xx — basic 10 ур. (140201/140208), skill/ult/talent 15 ур.
  // (140202/140209, 140203, 140204); мемоспрайт-лестницы 1140201/1140203 — 10 ур.
  aglaea: { basic: 10, skill: 15, ult: 15, talent: 15 },
}

/** per-kit ability level ceilings (pre-eidolon input caps) — the UI reads these instead of
 *  duplicating the ladder, so the picker can never offer a level the engine would clip. */
export function levelCaps(kitId: string): AbilityLevels {
  const cap = LEVEL_CAPS[kitId] ?? {}
  return {
    basic: cap.basic ?? 7,
    skill: cap.skill ?? 12,
    ult: cap.ult ?? 12,
    talent: cap.talent ?? 12,
    el_skill: cap.el_skill ?? 12,
  }
}

export function resolveLevels(t: TeamSpec): AbilityLevels {
  const e = t.eidolon ?? 0
  const lv = t.levels ?? DEFAULT_LEVELS
  const add = { basic: 0, skill: 0, ult: 0, talent: 0, el_skill: 0 }
  const per = EIDOLON_LV[t.kitId]
  // EIDOLON_LV is complete (probe-verified), so an unknown kitId just gets no bonus
  for (const [threshold, d] of Object.entries(per ?? {})) {
    if (e < Number(threshold)) continue
    add.basic += d.basic ?? 0
    add.skill += d.skill ?? 0
    add.ult += d.ult ?? 0
    add.talent += d.talent ?? 0
    add.el_skill += d.el_skill ?? 0
  }
  const cap = LEVEL_CAPS[t.kitId] ?? {}
  return {
    basic: Math.min(lv.basic + add.basic, cap.basic ?? 7),
    skill: Math.min(lv.skill + add.skill, cap.skill ?? 12),
    ult: Math.min(lv.ult + add.ult, cap.ult ?? 12),
    talent: Math.min(lv.talent + add.talent, cap.talent ?? 12),
    el_skill: Math.min((lv.el_skill ?? lv.skill) + add.el_skill, cap.el_skill ?? 12),
  }
}

/** Recommended team as runnable TeamSpecs, from the kit's preset: the carrier itself
 *  pre-loaded with its recommended relic/planar/lightcone gear, then its best teammates.
 *  Empty when the kit has no preset (no data in hsr-data/characters.json). */
export function presetTeam(kitId: string): TeamSpec[] {
  const p = preset(kitId)
  if (!p) return []
  const gear: GearConfig = {}
  if (p.lc[0]) gear.coneId = p.lc[0]
  if (p.relic4[0]) gear.relicSets = [p.relic4[0], p.relic4[0]]
  if (p.planar[0]) gear.planarId = p.planar[0]
  const team: TeamSpec[] = presetTeamOrder(kitId, presetTeams(kitId)[0] ?? []).map((k) => ({ kitId: k, gear: k === kitId ? gear : undefined }))
  return team
}

export interface EnemySpec {
  name: string
  count: number
  hp: number
  spd: number
  level: number
  toughness: number
  /** multi-layer intrinsic toughness: full ordered bar maxes (e.g. Cacophonic Conductor 80 ×10).
   *  When present, `toughness` must equal bars[0] (primary). Omitted = single-bar enemy. */
  toughnessBars?: number[]
  weaknesses: Elem[]
  res?: Partial<Record<Elem, number>>
  atk?: number
  effectRes?: number
  /** Debuff RES profile (raw 8-col order); usually engine-filled from raw enemy data */
  debuffRes?: number[]
  /** difficulty tier (Himeko elite+ charge); derived from `name` if omitted */
  rank?: 'mob' | 'elite' | 'boss'
  /** opening debuff this enemy applies to an ally at battle start (Arlan E2 / Sunday A6 dispel
   *  fixtures). Modelled as a Buff tagged `debuff: true` with the enemy as source. */
  debuff?: { id: string; name: string; mods: Array<{ stat: StatKey; value: number }>; turns?: number; targetName?: string; targetId?: string }
  /** opening positive buff this enemy holds itself at battle start (Pela Frostbite dispel / E2 / A6
   *  fixtures). Each spawned enemy of the group carries its own copy. */
  buff?: { id: string; name: string; mods: Array<{ stat: StatKey; value: number }>; turns?: number }
}

export const ENEMY_PRESETS: Record<string, Omit<EnemySpec, 'count'>> = {
  mob: { name: 'Ice Edge', hp: 25_000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] },
  elite: { name: 'Aurumaton Gatekeeper', hp: 340_000, spd: 145, level: 85, toughness: 90, weaknesses: ['Quantum', 'Fire'], res: { Physical: 0.2 } },
  boss: { name: 'Sting', hp: 900_000, spd: 150, level: 90, toughness: 180, weaknesses: ['Fire', 'Imaginary'], res: { Quantum: 0.3, Wind: 0.2 }, atk: 1400 },
  // ---- endgame templates (numbers are tunable approximations of current-cycle content) ----
  moc12_boss: { name: 'MoC 12 Boss', hp: 1_500_000, spd: 158, level: 95, toughness: 240, weaknesses: ['Fire', 'Quantum'], res: {}, atk: 1600, effectRes: 0.3 },
  moc12_add: { name: 'MoC 12 Add', hp: 420_000, spd: 150, level: 95, toughness: 90, weaknesses: ['Fire', 'Quantum', 'Ice'], res: {}, atk: 1200, effectRes: 0.2 },
  pf_swarm: { name: 'PF Swarm', hp: 65_000, spd: 140, level: 90, toughness: 60, weaknesses: ['Fire', 'Wind', 'Imaginary'], res: {}, atk: 900 },
  pf_elite: { name: 'PF Elite', hp: 260_000, spd: 148, level: 90, toughness: 120, weaknesses: ['Fire', 'Wind'], res: {}, atk: 1300 },
  as_boss: { name: 'Apocalyptic Shadow Boss', hp: 2_200_000, spd: 154, level: 93, toughness: 360, weaknesses: ['Fire', 'Lightning'], res: { Ice: 0.2 }, atk: 1700, effectRes: 0.4 },
}

/** named encounters (guide §21.3): wave composition + cycle limit, reusable by fixtures/configs */
export const ENCOUNTER_PRESETS: Record<string, EncounterSpec> = {
  mob: { id: 'mob', mode: 'Open field', cycles: 6, waves: [[{ ...ENEMY_PRESETS.mob, count: 1 }]] },
  boss: { id: 'boss', mode: 'Elite boss', cycles: 6, waves: [[{ ...ENEMY_PRESETS.boss, count: 1 }]] },
  moc12: { id: 'moc12', mode: 'Memory of Chaos 12', cycles: 8, waves: [[{ ...ENEMY_PRESETS.moc12_add, count: 2 }], [{ ...ENEMY_PRESETS.moc12_boss, count: 1 }]] },
  pf: { id: 'pf', mode: 'Pure Fiction', cycles: 4, waves: [[{ ...ENEMY_PRESETS.pf_swarm, count: 3 }], [{ ...ENEMY_PRESETS.pf_elite, count: 2 }]] },
  as: { id: 'as', mode: 'Apocalyptic Shadow', cycles: 6, waves: [[{ ...ENEMY_PRESETS.as_boss, count: 1 }]] },
}

/** manual pre-battle modifiers (UI "buffs/debuffs" panel) */
export interface ManualMod {
  stat: string
  value: number
  side: 'ally' | 'enemy'
}

export interface BattleSetup {
  team: TeamSpec[]
  /** wave 1 enemies (single wave if `enemyWaves` omitted) */
  enemy: EnemySpec
  /** optional additional waves: array of waves, each a list of enemy groups (MoC two-wave+) */
  enemyWaves?: EnemySpec[][]
  /** declarative encounter (guide §21.3): supplies wave(s)/cycles/stage effects so a fixture need
   *  not inline `enemy`/`enemyWaves`/`cycles`. Also accepts a name from `ENCOUNTER_PRESETS`.
   *  When present it DEFINES the encounter — inline `enemy`/`enemyWaves`/`cycles` are superseded;
   *  `manualMods` merge (encounter effects first), `seed`/`techniques`/`aha` stay from the setup. */
  encounter?: EncounterSpec | string
  cycles: number
  seed: number
  manualMods?: ManualMod[]
  /** include the Aha battle-event unit (default: true when the team has an Elation-path
   *  character; the event also appears in some endgame modes without one — pass true to force) */
  aha?: boolean
  /** pre-fight Techniques to activate (kitIds). Order = activation order; a repeated kitId is
   *  an additional use (capped by the Technique's maxUses, default 1). Buff techniques stack;
   *  at most ONE attack technique starts the fight and at most one zone survives (§84.6.1).
   *  Default: none. */
  techniques?: string[]
  /** battle-log settings (§32). Omitted = OFF: a plain sweep records nothing. */
  log?: LogConfig
}

// ---------------------------------------------------------------- manual step-by-step mode

export interface BattleUnitView {
  id: string
  name: string
  side: Unit['side']
  kind: Unit['kind']
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  av: number
  dead: boolean
  broken: boolean
}

/** live battle state handed to the UI at every decision point */
export interface BattleView {
  units: BattleUnitView[]
  avElapsed: number
  sp: number
  maxSp: number
  nextActorId?: string
}

export interface BattleIO {
  /**
   * Out-of-turn Ultimate window: fires before ANY unit's turn (enemy or ally).
   * Return ready units in cast order — advance-forward effects (relic sets, traces) apply here.
   */
  pickUlts(ready: Unit[], view: BattleView): Promise<Unit[]>
  /**
   * A character's own turn: return the ordered action sequence.
   * Ults inside the sequence count as in-turn casts (no advance-forward from gear/traces).
   */
  planTurn(u: Unit, view: BattleView): Promise<Action[]>
}

function setupSim(setup: BattleSetup): Simulator {
  // declarative encounter (guide §21.3): resolve first — it feeds the Simulator ctor (cycles)
  const encounter = typeof setup.encounter === 'string'
    ? ENCOUNTER_PRESETS[setup.encounter] ?? (() => { throw new Error(`unknown encounter: ${setup.encounter}`) })()
    : setup.encounter
  const resolved = encounter ? resolveEncounter(encounter) : undefined
  const enemy = resolved ? resolved.enemy : setup.enemy
  const enemyWaves = resolved ? resolved.enemyWaves : setup.enemyWaves
  const cycles = resolved?.cycles ?? setup.cycles
  const manualMods = resolved?.manualMods ? [...resolved.manualMods, ...(setup.manualMods ?? [])] : setup.manualMods

  const sim = new Simulator({ cycles, seed: setup.seed, techniques: setup.techniques, log: setup.log })
  for (const k of KITS) sim.kits.set(k.id, k)

  for (const spec of setup.team) {
    const t = applyBuild(spec)
    const { be, ...rawStats } = t.stats ?? {}
    // Partial stats patches may carry `undefined` keys (UI rows with untouched fields); spreading
    // them into `BaseStats` would overwrite a real base value with undefined and yield NaN.
    const stats = Object.fromEntries(Object.entries(rawStats).filter(([, v]) => typeof v === 'number' && Number.isFinite(v))) as typeof rawStats
    const level = t.level ?? 80
    const ratios = charLevelRatios(t.kitId, level)
    const kitBase = sim.kits.get(t.kitId)?.base
    const baseOverride = kitBase && ratios
      ? { hp: kitBase.hp * ratios.hp, atk: kitBase.atk * ratios.atk, def: kitBase.def * ratios.def, level }
      : { level }
    const u = sim.addChar(t.kitId, t.name ?? kitName(t.kitId), stats, t.energyStartFrac ?? 0.5, t.hpFrac ?? 1, baseOverride)
    if (!u.base.path) u.base.path = t.path ?? KIT_PATH[t.kitId] ?? ''
    const ctx = sim.rt(u)
    ctx.levels = resolveLevels(t)
    ctx.eidolon = t.eidolon ?? 0
    ctx.skillPriority = t.skillPriority ?? 0
    ctx.skillPattern = t.skillPattern ?? 'auto'
    ctx.skillRotation = t.skillRotation ?? ''
    ctx.strategy = t.strategy ?? {}
    // minor traces as a permanent buff (flat SPD becomes a flat buff, not base mutation)
    // `traces` = all (default) | none | per-trace flags in the raw order of `PROG[kitId].traces`
    const traceSel: boolean[] | null = t.traces === undefined || t.traces === true ? null : t.traces === false ? [] : t.traces
    if (t.traces !== false) {
      const mods: Buff['mods'] = []
      let flatSpd = 0
      traceMods(t.kitId).forEach((m, i) => {
        if (traceSel && !traceSel[i]) return
        if (m.stat === 'spdFlat') { flatSpd += m.value; return }
        mods.push({ stat: m.stat as Buff['mods'][number]['stat'], value: m.value })
      })
      if (flatSpd) mods.push({ stat: 'spdFlat', value: flatSpd })
      if (mods.length) sim.addBuff(u, { id: 'traces', name: 'Traces', mods })
    }
    // gear: flat cone stats fold into base, passive mods become a permanent buff
    if (t.gear) {
      const agg = sim.attachGear(u, t.gear, be)
      u.base.hp += agg.baseAdd.hp
      u.base.atk += agg.baseAdd.atk
      u.base.def += agg.baseAdd.def
      u.hp = u.maxHp = Math.round(u.base.hp)
      if (agg.mods.length) {
        sim.addBuff(u, { id: 'gear', name: 'Gear', mods: agg.mods, sourceId: 'gear' })
      }
    }
    if (be !== undefined) sim.addBuff(u, { id: 'gear_be', name: 'Break Effect', mods: [{ stat: 'be', value: be }] })
    sim.rt(u).mainDpsId = t.mainDpsId
  }

  // manual/stage mods — ALLY side here only: enemies are not spawned yet (see below), so an
  // enemy-side application at this point would silently drop. Enemy-side mods land after the spawn
  // loop (L245). Ally-side stays here so its BUFF_APPLIED ordering is unchanged.
  for (const m of manualMods ?? []) {
    if (m.side !== 'ally') continue
    for (const t of sim.roster.filter(x => x.side === 'ally' && !x.dead && x.kind === 'char')) {
      sim.addBuff(t, { id: `manual_${m.stat}`, name: `Manual ${m.stat} ${m.value > 0 ? '+' : ''}${Math.round(m.value * 100)}%`, mods: [{ stat: m.stat as Buff['mods'][number]['stat'], value: m.value }] })
    }
  }

  const waves = enemyWaves ?? [[enemy]]
  sim.waveCount = waves.length
  // §59 RULES SNAPSHOT: frozen, deterministic digest of exactly what this battle will run,
  // attached before any unit/rule mutates state (replay identity, BATTLE_START consumers).
  sim.rules = buildRulesSnapshot({ encounter, enemyWaves: waves, seed: setup.seed, cycles, techniques: setup.techniques })
  // Aha battle event: present by default with an Elation-path character (or forced true)
  const teamHasElation = setup.team.some(t => (KIT_PATH[t.kitId] ?? '') === 'Elation')
  if (setup.aha === true || (setup.aha === undefined && teamHasElation)) sim.addAha()
  waves.forEach((groups, wi) => {
    const wave = wi + 1
    for (const e of groups) {
      let groupFirst: Unit | undefined
      for (let i = 0; i < e.count; i++) {
        const spawned = sim.addEnemy({
          name: e.count > 1 ? `${e.name} #${i + 1}` : e.name,
          hp: e.hp, spd: e.spd, level: e.level, toughness: e.toughness,
          weaknesses: e.weaknesses, res: e.res, atk: e.atk, effectRes: e.effectRes, debuffRes: e.debuffRes,
          rank: e.rank, wave, toughnessBars: e.toughnessBars,
        })
        groupFirst ??= spawned
        // §57 enemy passive opening state (War Armor arming): the behavior is authored keyed by the
        // base name, and the spawn-time name is that base name for count-1 groups.
        enemyBehavior(spawned.name)?.passive?.onSpawn?.(sim, spawned)
        // opening positive buff: each enemy of the group holds its own copy (dispel fixtures)
        if (e.buff) sim.addBuff(spawned, { id: e.buff.id, name: e.buff.name, mods: e.buff.mods, turns: e.buff.turns ?? Infinity, sourceId: spawned.id })
      }
      // opening debuff: applied once per group by the group's first enemy onto an ally (dispel fixtures)
      if (e.debuff) {
        const src = groupFirst
        const pool = sim.roster.filter(x => x.side === 'ally' && x.kind === 'char' && !x.dead)
        const t = e.debuff.targetId
          ? pool.find(x => x.id === e.debuff!.targetId) ?? pool[0]
          : pool.find(x => x.name === e.debuff!.targetName) ?? pool[0]
        if (src && t) {
          sim.addBuff(t, { id: e.debuff.id, name: e.debuff.name, mods: e.debuff.mods, turns: e.debuff.turns, sourceId: src.id, debuff: true })
        }
      }
    }
  })

  // enemy-side manual/stage mods (L245): the enemy pool is empty until the waves above spawn, so a
  // pre-spawn application was a silent no-op. Apply now that every wave's enemies exist.
  for (const m of manualMods ?? []) {
    if (m.side !== 'enemy') continue
    for (const t of sim.roster.filter(x => x.side === 'enemy' && !x.dead && x.kind === 'enemy')) {
      sim.addBuff(t, { id: `manual_${m.stat}`, name: `Manual ${m.stat} ${m.value > 0 ? '+' : ''}${Math.round(m.value * 100)}%`, mods: [{ stat: m.stat as Buff['mods'][number]['stat'], value: m.value }] })
    }
  }
  return sim
}

export function runBattle(setup: BattleSetup): Simulator {
  const sim = prepareBattle(setup)
  sim.start()
  return sim
}

/** build the sim with all units/gear/traces applied, without starting the battle */
export function prepareBattle(setup: BattleSetup): Simulator {
  return setupSim(setup)
}

/** manual step-by-step battle: awaits user decisions via io at every decision point */
export async function runBattleManual(setup: BattleSetup, io: BattleIO): Promise<Simulator> {
  const sim = setupSim(setup)
  await sim.startInteractive(io)
  return sim
}

function kitName(id: string): string {
  return KITS.find(k => k.id === id)?.name ?? id
}
