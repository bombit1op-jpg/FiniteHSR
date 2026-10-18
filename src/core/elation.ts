import type { KitRuntime, SimApi } from './kit'
import type { Elem, Unit } from './entities/Unit'
import { mult } from './progression'
import { eff } from './combat/StatResolver'
import { elationLevelMultiplier } from './combat/LevelMultiplier'

// ============================================================
// Elation subsystem (Punchline economy) — common to every Elation-path kit.
//
// All scaling values live in the character's data (PROG[char].abilities):
//   el_skill / el_skill_a2 / el_skill_a3 — the Elation Skill (the Great Encore)
//   engage / engage_a2                  — per-use Engagement Farming Bloom boost
//
// Punchline is a TEAM-SHARED pool (docs/combat_mechanics/Punchline.md):
// "Punchline is shared by the whole team. The more Punchline taken into
// account, the higher the Elation DMG." Stored on the Simulator (sim.punchline).
//
// Elation DMG formula (docs/combat_mechanics/Elation DMG.md):
//   Base × CRIT × (1+Elation) × PunchlineMult × (1+Merrymake)
//   × DEF × RES × Vuln × Mitigation × Broken
// NOT affected by DMG Boost effects. dealElationDamage handles the DEF/RES/Vuln/
// Mitigation/Broken (no DMG Boost); the Elation/Punchline/Merrymake multipliers
// are folded into `mult` here.
// ============================================================

/** Punchline Multiplier (attacker-side multiplier on Elation DMG).
 *  docs: `1 + P×5/(P+240)` — used with the SHARED pool for Elation Skills /
 *  regular Elation hits, and with a character's Certified Banger total for
 *  CB-produced Elation DMG (talent procs like Sparxie Sleight). */
export function punchlineMult(punchline: number): number {
  return 1 + (punchline * 5) / (punchline + 240)
}

/** one tracked Certified Banger state (cached Punchline, 2 turns, independent durations) */
export interface CBStack { pts: number; turns: number }

/** Elation DMG: Base × (1+Elation) × PunchlineMult × (1+Merrymake), routed
 *  through the dedicated elation damage path (no DMG Boost).
 *  Base DMG = Level Multiplier × Ability Multiplier (docs/Elation DMG.md) — do
 *  NOT scale from ATK; `base` is the ability multiplier fraction (e.g. 0.5). */
/** Elation DMG: Base × (1+Elation) × PunchlineMult × (1+Merrymake), routed
 *  through the dedicated elation damage path (no DMG Boost).
 *  Base DMG = Level Multiplier × Ability Multiplier (docs/Elation DMG.md) — do
 *  NOT scale from ATK; `base` is the ability multiplier fraction (e.g. 0.5).
 *  `p` overrides the Punchline value taken into account (e.g. Aha's fixed
 *  Punchline from Yao Guang's Ult); default = shared team pool.
 *  `noSeq` keeps the hit inside the triggering attack's sequence, so an Elation
 *  hit fired from a hook mid-attack (Aventurine • Waveflair Fervor proc) does
 *  not break once-per-attack gates on the interrupted attack.
 *  Returns the damage dealt — Silver Wolf LV.999 scales "Big Flipping Sword"
 *  True DMG off the Top Loot Box hit that preceded it. */
export function elationHit(sim: SimApi, u: Unit, t: Unit, base: number, label: string, elem: Elem = 'Fire', canCrit = true, p?: number, noSeq = false): number {
  const elation = eff(u).elation
  const merrymake = eff(u).merrymake
  const m = elationLevelMultiplier(u.base.level) * base * (1 + elation) * punchlineMult(p ?? sim.punchlinePool()) * (1 + merrymake)
  return sim.hit(u, t, { type: 'elation', elem, statValue: 1, mult: m, canCrit, label, noSeq })
}

/** Elation DMG produced by the **Certified Banger** state (Sparxie Sleight etc.).
 *  Gated: deals NO damage while the character holds no Certified Banger.
 *  Punctuation uses the character's cached CB total, NOT the shared Punchline pool
 *  (docs: Elation Skills use Punchline; CB-based effects use CB. See Aha transcript).
 *  `statsFrom` swaps the Elation/CB source while keeping hit ownership on `u`
 *  (Yao Guang Great Boon: attacker owns the kill, but takes Yao Guang's Elation
 *  when the attacker's own is lower).
 *  Returns the damage dealt (0 while CB-gated out) — Silver Wolf LV.999 scales
 *  "Big Flipping Sword" True DMG off the Top Loot Box hit that preceded it. */
export function cbElationHit(sim: SimApi, u: Unit, t: Unit, base: number, label: string, elem: Elem = 'Fire', statsFrom?: Unit, noSeq = false): number {
  const src = statsFrom ?? u
  const cb = sim.cbOf(src)
  if (cb <= 0) return 0
  const elation = eff(src).elation
  const merrymake = eff(src).merrymake
  const m = elationLevelMultiplier(u.base.level) * base * (1 + elation) * punchlineMult(cb) * (1 + merrymake)
  return sim.hit(u, t, { type: 'elation', elem, statValue: 1, mult: m, canCrit: true, label, noSeq })
}

/** Gain shared team Punchline (Ult bonus, E4, Engagement Farming gift, ...). */
export function gainPunchline(sim: SimApi, n: number): void {
  sim.gainPunchline(n)
}

/** Engagement Farming remuneration (#EngagementFarming, docs/Punchline.md + vash transcript
 *  "The Actual Probability of Sparxie's Skill"). Real law:
 *  - Gift pools per skill chain: 3 grand ("Straight Fire" 2P+2SP) + 25 minor ("Unreal Banger" 1P).
 *  - Pity counter `engagePity` = consecutive non-grand results; ≥6 AND grand remaining → forced grand.
 *  - Non-forced roll: grand with prob grand/(grand+minor) ≈ 10.7% at battle start (3/28).
 *  - Grand consumes a pool slot, resets pity to 0. Minor consumes a slot, pity+1.
 *  - Pools reset when the skill chain ends with a basic attack; pity carries over (engagePity not reset).
 *  State lives on the unit runtime so it survives across calls in a chain. */
export function engageFarming(sim: SimApi, u: Unit): void {
  const rt = sim.rt(u)
  const grand0 = (rt.engageGrand as number) ?? 3
  const minor0 = (rt.engageMinor as number) ?? 25
  const pity0 = (rt.engagePity as number) ?? 0
  const forced = pity0 >= 6 && grand0 > 0
  const isGrand = forced || sim.rng() < grand0 / (grand0 + minor0)
  if (isGrand) {
    rt.engageGrand = Math.max(0, grand0 - 1)
    rt.engagePity = 0
    sim.gainPunchline(2)
    sim.gainSp(2)
    sim.log(`${u.name} Engagement Farming: Straight Fire (2 Punchline, 2 SP) — pool ${sim.punchlinePool()}`)
  } else {
    rt.engageMinor = Math.max(0, minor0 - 1)
    rt.engagePity = pity0 + 1
    sim.gainPunchline(1)
    sim.log(`${u.name} Engagement Farming: Unreal Banger (1 Punchline) — pool ${sim.punchlinePool()}`)
  }
}

/** Skill chain ended with a basic attack: gift pools reset to 3/25, pity carries over. */
export function engagePoolsReset(sim: SimApi, u: Unit): void {
  const rt = sim.rt(u)
  rt.engageGrand = 3
  rt.engageMinor = 25
}

/** Is this character an Elation-path kit? Gates use of the shared subsystem. */
export function isElation(sim: SimApi, u: Unit): boolean {
  return (u.base.path ?? (sim.rt(u).path as string)) === 'Elation'
}

/** The Great Encore — the shared Elation Skill (data-driven from PROG[char]).
 *  Docs: "Deals 25%-55% Fire Elation DMG to all enemies and deals
 *  `el_skill_a3` (20) additional DMG instances, each 12.5%-27.5% Fire Elation
 *  DMG to one random enemy. Grants 2 Thrill."
 *  Instance count is a fixed constant from data; E6 #BuiltDifferent adds +1 per
 *  Punchline (team pool) up to 40. Punchline is NOT spent to gate instances (it
 *  is a damage multiplier instead). */
export function greatEncore(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  sim.fireElationSkill(u, 'great_encore') // diviner 4pc: once-per-battle team Elation buff on the wearer's Elation Skill
  const rt = sim.rt(u)
  const char = u.kitId ?? ''
  const lv = (ctx.levels as { skill?: number })?.skill ?? 10
  const eid = (ctx.eidolon as number) ?? 0
  const base = mult(char, 'el_skill_a3', lv) ?? 20
  const instances = eid >= 6 ? Math.min(40, base + sim.punchlinePool()) : base

  for (const e of [...sim.livingEnemiesOf(u)]) {
    elationHit(sim, u, e, mult(char, 'el_skill', lv), 'The Great Encore!')
  }
  const pool = [...sim.livingEnemiesOf(u)]
  for (let i = 0; i < instances; i++) {
    if (!pool.length) break
    const e = sim.rngPick(pool)
    if (e.dead || e.hp <= 0) continue
    elationHit(sim, u, e, mult(char, 'el_skill_a2', lv), 'Encore extra touch')
  }

  rt.thrill = ((rt.thrill as number) ?? 0) + 2 // Grants 2 Thrill
  sim.gainEnergy(u, 30)
  sim.log(`${u.name} The Great Encore (Elation Skill AoE + ${instances} extra touche(s), +2 Thrill)`)
}
