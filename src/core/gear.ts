import type { BaseStats, DmgType, GearConfig, RelicPiece, StatKey, Unit } from './entities/Unit'
import type { Buff, DoT, Mod } from './effects/Buff'
import type { SimApi } from './kit'
import { buffSum, eff, effectResOf, isDebuff } from './combat/StatResolver'
import { coneLevelFactor } from './levelStats'

// ---------------------------------------------------------------- relic stat tables (5-star, +15 / per-roll)

export const RELIC_MAIN_VALUES: Record<string, number> = {
  hpFlat: 705.6,
  atkFlat: 352.8,
  spd: 25.032,
  hpPct: 0.432,
  atkPct: 0.432,
  defPct: 0.54,
  ehr: 0.432,
  outHeal: 0.3456,
  critRate: 0.324,
  critDmg: 0.648,
  be: 0.648,
  err: 0.1944,
}

export const SPHERE_DMG_MAIN = 0.3888

/** substat value per single roll, by tier [low, mid, high] */
export const SUBSTAT_TIERS: Record<string, [number, number, number]> = {
  spd: [2, 2.3, 2.6],
  hpFlat: [33.87, 38.103795, 42.33751],
  atkFlat: [16.935, 19.051877, 21.168754],
  defFlat: [16.935, 19.051877, 21.168754],
  hpPct: [0.03456, 0.03888, 0.0432],
  atkPct: [0.03456, 0.03888, 0.0432],
  defPct: [0.0432, 0.0486, 0.054],
  be: [0.05184, 0.05832, 0.0648],
  ehr: [0.03456, 0.03888, 0.0432],
  effRes: [0.03456, 0.03888, 0.0432],
  critRate: [0.02592, 0.02916, 0.0324],
  critDmg: [0.05184, 0.05832, 0.0648],
}

const ELEMS = ['Physical', 'Fire', 'Ice', 'Wind', 'Lightning', 'Quantum', 'Imaginary']

/** allowed main stats per slot */
export const SLOT_MAINS: Record<RelicPiece['slot'], string[]> = {
  head: ['hpFlat'],
  hands: ['atkFlat'],
  body: ['hpPct', 'atkPct', 'defPct', 'ehr', 'outHeal', 'critRate', 'critDmg'],
  feet: ['hpPct', 'atkPct', 'defPct', 'spd'],
  sphere: ['hpPct', 'atkPct', 'defPct', ...ELEMS.map(e => `dmg:${e}`)],
  rope: ['hpPct', 'atkPct', 'defPct', 'be', 'err'],
}

/** schema gate: legal slot/main combination (the single source for both builders and tests) */
export function validMain(slot: RelicPiece['slot'], key: string): boolean {
  return SLOT_MAINS[slot].includes(key)
}

/** the value of one substat line: per-roll tiers (when `spread` is given) or tier × rolls */
export function substatValue(sub: { stat: string; tier: 0 | 1 | 2; rolls: number; spread?: number[] }): number {
  const tiers = SUBSTAT_TIERS[sub.stat]
  if (!tiers) return 0
  if (sub.spread) return Math.round(sub.spread.map(t => tiers[t]).reduce((a, b) => a + b, 0) * 1e5) / 1e5
  return Math.round(tiers[sub.tier] * sub.rolls * 1e5) / 1e5
}

/** main + substats of one piece as flat additions and percent mods */
export function pieceContrib(p: RelicPiece): { baseAdd: { hp: number; atk: number; def: number }; mods: Mod[] } {
  const out = { baseAdd: { hp: 0, atk: 0, def: 0 }, mods: [] as Mod[] }
  if (p.main === 'hpFlat') out.mods.push({ stat: 'hpFlat', value: RELIC_MAIN_VALUES.hpFlat })
  else if (p.main === 'atkFlat') out.mods.push({ stat: 'atkFlat', value: RELIC_MAIN_VALUES.atkFlat })
  else if (p.main === 'spd') out.mods.push({ stat: 'spdFlat', value: RELIC_MAIN_VALUES.spd })
  else if (p.main.startsWith('dmg:')) out.mods.push({ stat: p.main as Mod['stat'], value: SPHERE_DMG_MAIN })
  else if (RELIC_MAIN_VALUES[p.main] !== undefined) {
    const key = p.main === 'ehr' ? 'ehr' : p.main === 'outHeal' ? 'outHeal' : p.main
    out.mods.push({ stat: key as Mod['stat'], value: RELIC_MAIN_VALUES[p.main] })
  }
  for (const s of p.subs ?? []) {
    const v = substatValue(s)
    if (!v) continue
    switch (s.stat) {
      case 'hpFlat': out.mods.push({ stat: 'hpFlat', value: v }); break
      case 'atkFlat': out.mods.push({ stat: 'atkFlat', value: v }); break
      case 'defFlat': out.mods.push({ stat: 'defFlat', value: v }); break
      case 'spd': out.mods.push({ stat: 'spdFlat', value: v }); break
      default: out.mods.push({ stat: s.stat as Mod['stat'], value: v })
    }
  }
  return out
}


export interface LightCone {
  id: string
  name: string
  rarity: 3 | 4 | 5
  path: string
  /** base stats at level 80 */
  hp: number
  atk: number
  def: number
  /** unconditional mods */
  mods?: (si: number, ctx?: { energyMax?: number }) => Mod[]
  /** stat gate evaluated at battle start against final stats */
  cond?: { stat: CondStat; gte: (si: number) => number; mods: (si: number, ctx?: { spd: number }) => Mod[] }
  onStart?(sim: SimApi, u: Unit, si: number): void
  onAfterSkill?(sim: SimApi, u: Unit, target: Unit | undefined, si: number, ctx: Record<string, unknown>): void
  onAfterUlt?(sim: SimApi, u: Unit, si: number, ctx: Record<string, unknown>): void
  onKill?(sim: SimApi, u: Unit, victim: Unit, si: number): void
  /** the wearer's own death — return non-battle contributions (Dazzled maxSp) */
  onUnitDeath?(sim: SimApi, u: Unit, si: number): void
  /** any ally character is defeated (knocked down) — fires for cones on other ally units */
  onAllyDeath?(sim: SimApi, u: Unit, ally: Unit, si: number): void
  /** Break DMG dealt by wearer (Whereabouts Should Dreams Rest: Routed + heal) */
  onAfterBreak?(sim: SimApi, u: Unit, target: Unit, si: number): void
  /** the wearer starts their turn (Quid Pro Quo energy share) */
  onTurnStart?(sim: SimApi, u: Unit, si: number): void
  /** the wearer's turn ends (Venture Forth Luminflux removal; kit onTurnEnd also fired) */
  onTurnEnd?(sim: SimApi, u: Unit, si: number): void
  /** any attack by the wearer (Swordplay dynamic stacks) */
  onAfterAttack?(sim: SimApi, u: Unit, target: Unit, dmgType: DmgType, si: number): void
  /** per-hit conditional mods (Fermata: vs Shock/WindShear targets) */
  hitMods?(sim: SimApi, u: Unit, target: Unit, type: DmgType, si: number): Mod[]
  /** the wearer is hit by an enemy attack (Moment of Victory extra DEF, Dust calm; Trend Burn on the attacker) */
  onHitTaken?(sim: SimApi, u: Unit, si: number, attacker?: Unit): void
  /** any ally is attacked (incl. the wearer) — Eclipse stacks (My Own Sword) */
  onAllyHit?(sim: SimApi, u: Unit, target: Unit, si: number): void
  /** any ally loses HP (enemy hit, DoT, kit drains) — Eclipse stacks, She Already Shut Her Eyes all-ally DMG */
  onAllyHpLoss?(sim: SimApi, u: Unit, target: Unit, amt: number, si: number): void
  /** any ally is healed (wearer HP change / Ninja Record CD, etc.) — cone twin of kit onAllyHeal */
  onAllyHeal?(sim: SimApi, u: Unit, target: Unit, amt: number, si: number, src?: Unit): void
  /** any ally launches an attack — Cantillation (Flowing Nightglow). `memoSkill` = the attacking
   *  MEMOSPRITE used its own Skill ability (Long May Rainbows / This Love, Forever gate on it). */
  onAllyAttack?(sim: SimApi, u: Unit, attacker: Unit, target: Unit, dmgType: DmgType, si: number, memoSkill?: boolean): void
  /** the wearer provides a Shield to an ally (Inherently Unjust Destiny CRIT DMG) */
  onShieldProvide?(sim: SimApi, u: Unit, ally: Unit, si: number): void
  /** SP consumed during the wearer's current turn (Dazzled per-SP DEF-ignore) */
  onSpSpend?(sim: SimApi, u: Unit, spThisTurn: number, si: number): void
  /** the wearer lands a CRIT hit (Final Victor Good Fortune, Return to Darkness dispel) */
  onCrit?(sim: SimApi, u: Unit, target: Unit, si: number): void
  /** the wearer lands a non-CRIT hit on a crit-eligible attack (Sleep Like the Dead crit-rate window) */
  onNonCrit?(sim: SimApi, u: Unit, target: Unit, si: number): void
  /** a DoT applied by the wearer deals its tick damage (cone twin of kit onDoTTick) */
  onDoTTick?(sim: SimApi, u: Unit, target: Unit, dot: DoT, si: number): void
  /** an enemy begins its turn (the missing enemy-turn hook — Erode-style per-enemy-turn effects) */
  onEnemyTurnStart?(sim: SimApi, u: Unit, enemy: Unit, si: number): void
  /** a new battle wave starts (wave 1 fires at battle start) — Great Fortune, Summer wave-SP, wave energy */
  onWaveStart?(sim: SimApi, u: Unit, si: number): void
  /** the current wave's enemies are all defeated (only for multi-wave battles) */
  onWaveEnd?(sim: SimApi, u: Unit, si: number): void
  /** a new cycle begins (MoC: first cycle 150 AV, then 100) */
  onCycleStart?(sim: SimApi, u: Unit, cycle: number, si: number): void
  /** the current cycle ends */
  onCycleEnd?(sim: SimApi, u: Unit, cycle: number, si: number): void
  /** the wearer lands a debuff on an enemy (It's Showtime Trick stacks) */
  onDebuffInflict?(sim: SimApi, u: Unit, target: Unit, si: number): void

  /** any ally (incl. wearer) applies a NEW elemental weakness to an enemy (NFF Skill Point) */
  onWeaknessApply?(sim: SimApi, u: Unit, source: Unit, target: Unit, si: number): void
  /** the wearer uses an Elation Skill (Summer Rides Updraft + every-3rd-SP); identity = which Elation Skill (deterministic in sim: 'great_encore') */
  onElationSkill?(sim: SimApi, u: Unit, si: number, identity?: string): void
  /** an Aha Instant began (fired per ally at the Aha turn start, before any Elation Skill). Effects
   *  the wearer holds "until Aha Instant ends" live for that one turn (Sneering Elation) */
  onAhaInstant?(sim: SimApi, u: Unit, si: number): void
  /** the acting char's turn consumed >=4 SP (team-wide; Flickering Stars Radiant Crown) */
  onTurnSpHigh?(sim: SimApi, u: Unit, spThisTurn: number, si: number): void
  /** the wearer summons their memosprite (Shadowburn first-summon SP+Energy) */
  onMemospriteSummon?(sim: SimApi, u: Unit, si: number): void
  /** the wearer's memosprite starts its turn (Reminiscence Commemoration stacks) */
  onMemospriteTurnStart?(sim: SimApi, u: Unit, si: number): void
  /** the wearer's memosprite disappears (Reminiscence Commemoration clear, Evernight disappears-energy) */
  onMemospriteDisappear?(sim: SimApi, u: Unit, si: number): void
}

type CondStat = 'spd' | 'critRate' | 'effRes' | 'ehr' | 'be'

/** stat bag for attach-time gates (gearFinal), computed from base + gear mods */
export interface GearFinal {
  spd: number
  hp: number
  atk: number
  energyMax: number
  ehr: number
  critRate: number
  critDmg: number
  effRes: number
  be: number
}

export interface RelicSet {
  id: string
  name: string
  twoPc: Mod[]
  fourPc?: Mod[]
  /** 2pc/4pc shield-amplification bonus: +N to shields created by the wearer (Knight 4pc, Self-Enshrouded 2/4pc) */
  shieldMult2?: number
  shieldMult4?: number
  /** gated bonus applied at attach time against final gear stats (spd/hp/atk/energy...), fires with the 4pc */
  postMods?: (f: GearFinal) => Mod[]
  onStart?(sim: SimApi, u: Unit): void
  onTurnStart?(sim: SimApi, u: Unit): void
  /** wearer is hit by an enemy attack (Longevous Disciple) */
  onHitTaken?(sim: SimApi, u: Unit): void
  /** another ally's skill/ult targets the wearer (Wavestrider Help) */
  onAllyAbility?(sim: SimApi, u: Unit, caster: Unit): void
  /** the acting ally healed someone else this action (Goddess Gentle Rain) */
  onAllyHeal?(sim: SimApi, u: Unit): void
  /** the wearer inflicted a NEW DEF-reduction via applyDebuff (Smith Comburent re-trigger) */
  onDefRedInflict?(sim: SimApi, u: Unit): void
  /** the wearer landed ANY debuff via applyDebuff (Pioneer keystone double) */
  onDebuffInflict?(sim: SimApi, u: Unit): void
  /** the wearer used the Elation Skill/Great Encore (Diviner: once-per-battle team Elation buff) */
  onElationSkill?(sim: SimApi, u: Unit): void
  onAfterSkill?(sim: SimApi, u: Unit, target: Unit | undefined): void
  /** outOfTurn = ult cast outside any unit's own turn (gates advance-forward effects) */
  onAfterUlt?(sim: SimApi, u: Unit, outOfTurn: boolean): void
  onKill?(sim: SimApi, u: Unit, victim: Unit): void
  onAfterBreak?(sim: SimApi, u: Unit, victim: Unit): void
  onAfterAttack?(sim: SimApi, u: Unit, target: Unit, dmgType: DmgType): void
  /** any ally attack (incl. the wearer's own memosprite); attacker carries the acting unit (Hero 4pc CD on memosprite attack) */
  onAllyAttack?(sim: SimApi, u: Unit, attacker: Unit, target: Unit, dmgType: DmgType): void
  /** per-hit conditional mods (Wastelander, Pioneer) */
  hitMods?(sim: SimApi, u: Unit, target: Unit, type: DmgType): Mod[]
}

export interface PlanarSet {
  id: string
  name: string
  mods: Mod[]
  cond?: { stat: CondStat; gte: number; mods: Mod[] }
  /** gated bonus applied at attach time against final gear stats (planar = always-on 2pc) */
  postMods?: (f: GearFinal) => Mod[]
  onStart?(sim: SimApi, u: Unit): void
  /** enemy defeated by the wearer (Sigonia) */
  onKill?(sim: SimApi, u: Unit, victim: Unit): void
  /** any ally defeats an enemy (Converging Stars) */
  onAllyKill?(sim: SimApi, u: Unit, killer: Unit, victim: Unit): void
  /** any ally attack (fired for every planar wearer) */
  onAfterAttack?(sim: SimApi, u: Unit, attacker: Unit, target: Unit, dmgType: DmgType): void
  /** per-hit conditional mods */
  hitMods?(sim: SimApi, u: Unit, target: Unit, type: DmgType): Mod[]
  /** SP spent by the wearer in their current turn (Tengoku) */
  onSpSpend?(sim: SimApi, u: Unit, spThisTurn: number): void
}

// ---------------------------------------------------------------- light cones

export const LIGHT_CONES: LightCone[] = [
  {
    id: 'in_the_night', name: 'In the Night', rarity: 5, path: 'Hunt',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }],
    cond: {
      stat: 'spd', gte: () => 120,
      mods: (si, ctx) => {
        const stacks = ctx ? Math.min(6, Math.floor((ctx.spd - 100) / 10)) : 0
        return [{ stat: 'boost:basic', value: (0.06 + 0.01 * (si - 1)) * stacks },
                { stat: 'boost:skill', value: (0.06 + 0.01 * (si - 1)) * stacks },
                { stat: 'critDmg:ult', value: (0.12 + 0.02 * (si - 1)) * stacks }]
      },
    },
  },
  {
    id: 'night_of_fright', name: 'Night of Fright', rarity: 5, path: 'Abundance',
    hp: 1164, atk: 476, def: 529,
    mods: si => [{ stat: 'err', value: 0.12 + 0.02 * (si - 1) }],
    onAfterUlt: (sim, u, si) => {
      const lowest = sim.allies(u.side).filter(a => !a.dead && a.kind === 'char')
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
      if (lowest) sim.addBuff(lowest, gearBuff('nof_atk', 'Night of Fright ATK', [{ stat: 'atkPct', value: 0.024 + 0.004 * (si - 1) }], 2, 5))
    },
  },
  {
    id: 'before_dawn', name: 'Before Dawn', rarity: 5, path: 'Erudition',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critDmg', value: 0.36 + 0.06 * (si - 1) },
                 { stat: 'boost:skill', value: 0.18 + 0.03 * (si - 1) },
                 { stat: 'boost:ult', value: 0.18 + 0.03 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => sim.addBuff(u, gearBuff('somnus', 'Somnus Token', [{ stat: 'boost:fua', value: 0.48 + 0.08 * (si - 1) }], Infinity, 3)),
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('somnus', 'Somnus Token', [{ stat: 'boost:fua', value: 0.48 + 0.08 * (si - 1) }], Infinity, 3)),
  },
  {
    id: 'whereabouts', name: 'Whereabouts Should Dreams Rest', rarity: 5, path: 'Destruction',
    hp: 1164, atk: 476, def: 529,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    onAfterBreak: (sim, u, target, si) => {
      sim.addBuff(target, gearBuff('routed', 'Routed', [{ stat: 'vulnAll', value: 0.24 + 0.04 * (si - 1) }, { stat: 'spdDown', value: 0.20 }], 2))
    },
  },
  {
    id: 'bbibo', name: "But the Battle Isn't Over", rarity: 5, path: 'Harmony',
    hp: 1164, atk: 529, def: 463,
    mods: si => [{ stat: 'err', value: 0.10 + 0.02 * (si - 1) }],
    onStart: (sim, u) => { sim.rt(u).bbiboUlts = 0 },
    onAfterSkill: (sim, u, target, si) => {
      const next = sim.allies('ally').filter(a => a.id !== u.id && !a.dead && a.kind === 'char')
        .sort((a, b) => a.av - b.av)[0]
      if (next) sim.addBuff(next, gearBuff('bbibo_dmg', "Battle Isn't Over", [{ stat: 'dmgAll', value: 0.30 + 0.05 * (si - 1) }], 1))
    },
    onAfterUlt: (sim, u, si, ctx) => {
      const n = ((ctx.bbiboUlts as number) ?? 0) + 1
      ctx.bbiboUlts = n
      if (n % 2 === 1) sim.gainSp(1)
    },
  },
  {
    id: 'earthly_escapade', name: 'Earthly Escapade', rarity: 5, path: 'Harmony',
    hp: 1164, atk: 529, def: 463,
    mods: si => [{ stat: 'critDmg', value: 0.32 + 0.07 * (si - 1) }],
    onAfterUlt: (sim, u, si) => {
      const best = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
        .sort((a, b) => sim.effCritDmg(b) - sim.effCritDmg(a))[0]
      if (best) sim.addBuff(best, gearBuff('mask', 'Mask', [{ stat: 'critDmg', value: 0.28 + 0.07 * (si - 1) }, { stat: 'critRate', value: 0.10 + 0.01 * (si - 1) }], 4))
    },
  },
  {
    id: 'cruising', name: 'Cruising in the Stellar Sea', rarity: 5, path: 'Hunt',
    hp: 953, atk: 529, def: 463,
    mods: si => [{ stat: 'critRate', value: 0.08 + 0.02 * (si - 1) }],
    onKill: (sim, u, victim, si) => sim.addBuff(u, gearBuff('cruise_atk', 'Sea Gaze', [{ stat: 'atkPct', value: 0.20 + 0.05 * (si - 1) }], 2)),
  },
  {
    id: 'resolution', name: 'Resolution Shines As Pearls of Sweat', rarity: 4, path: 'Nihility',
    hp: 953, atk: 476, def: 331,
    // "When the wearer hits an enemy and if the hit enemy is not already Ensnared" -- this is a
    // HIT trigger (lightcones.json 21015 `refinements.desc`), so basic/skill/ult/FUA all roll it,
    // not just the two ability types the sim used to hang it off. The "not already" clause IS the
    // per-attack dedup: a success leaves the buff up for a turn, so the rest of a multi-hit no-op.
    onAfterAttack: (sim, u, target, _dmgType, si) => {
      if (target.dead || target.side === u.side || target.buffs.some(b => b.id === 'ensnared')) return
      sim.applyDebuff(u, target, 0.60 + 0.10 * (si - 1),
        () => sim.addBuff(target, gearBuff('ensnared', 'Ensnared DEF↓', [{ stat: 'defRed', value: 0.12 + 0.01 * (si - 1) }], 1)), 'Ensnared')
    },
  },
  {
    id: 'ddd', name: 'Dance! Dance! Dance!', rarity: 4, path: 'Harmony',
    hp: 953, atk: 423, def: 397,
    onAfterUlt: (sim, _u, si) => {
      // advance all ally chars incl. wearer; wearer's own mid-own-turn advance is lost per rule (av=0)
      for (const a of [...sim.allies('ally'), ...sim.allies('enemy')])
        if (!a.dead && a.kind === 'char') sim.advance(a, 0.16 + 0.02 * (si - 1))
      sim.log('♪ Dance! Dance! Dance! advances all allies')
    },
  },
  {
    id: 'planetary', name: 'Planetary Rendezvous', rarity: 4, path: 'Harmony',
    hp: 1058, atk: 423, def: 331,
    onStart: (sim, u, si) => {
      for (const a of sim.allies(u.side)) {
        if (!a.dead && a.elem === u.elem && a.id !== u.id)
          sim.addBuff(a, gearBuff('rendezvous', 'Rendezvous', [{ stat: 'dmgAll', value: 0.12 + 0.03 * (si - 1) }], Infinity))
      }
    },
  },
  {
    id: 'swordplay', name: 'Swordplay', rarity: 4, path: 'Hunt',
    hp: 953, atk: 476, def: 331,
    mods: () => [],
    // dynamic stacks: same-target hits build 1 stack (max 5) each +8%; a fresh target resets them
    onAfterAttack: (sim, u, target, _dmgType, si) => {
      const rt = sim.rt(u)
      if (rt.swordTarget !== target.id) rt.swordStacks = 0
      rt.swordTarget = target.id
      rt.swordStacks = Math.min(5, ((rt.swordStacks as number) ?? 0) + 1)
      const per = 0.08 + 0.02 * (si - 1)
      sim.removeBuff(u, 'swordplay')
      sim.addBuff(u, gearBuff('swordplay', 'Swordplay', [{ stat: 'dmgAll', value: per * (rt.swordStacks as number) }], Infinity))
      sim.log(`${u.name} Swordplay: DMG +${Math.round(per * (rt.swordStacks as number) * 100)}% (${rt.swordStacks}/5)`)
    },
  },
  {
    id: 'fermata', name: 'Fermata', rarity: 4, path: 'Nihility',
    hp: 953, atk: 476, def: 331,
    // +DMG vs Shock/WindShear-afflicted targets only (also applies to DoT — hitMods only covers the hit, dot ticks keep base kit scaling)
    mods: si => [{ stat: 'be', value: 0.16 + 0.04 * (si - 1) }],
    hitMods: (_sim, _u, target, _type, si) =>
      target.dots.some(d => d.kind === 'Shock' || d.kind === 'WindShear')
        ? [{ stat: 'dmgAll', value: 0.16 + 0.04 * (si - 1) }]
        : [],
  },
  {
    id: 'tapd', name: 'Today Is Another Peaceful Day', rarity: 4, path: 'Erudition',
    hp: 847, atk: 529, def: 331,
    mods: (si, ctx) => [{ stat: 'dmgAll', value: (0.002 + 0.0005 * (si - 1)) * Math.min(ctx?.energyMax ?? 130, 160) }],
  },
  {
    id: 'though_worlds_apart', name: 'Though Worlds Apart', rarity: 5, path: 'Preservation',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'atkPct', value: 0.64 + 0.16 * (si - 1) }],
    // Redoubt "further increases DMG if the targets have summons" = target(s) own an ally summon
    // (memosprite / Lightning-Lord / Fuyuan / Numby — side 'ally' kind 'summon', rt.ownerId match, like sunday.ts)
    onAfterUlt: (sim, u, si) => {
      const heal = sim.effAtk(u) * (0.10 + 0.025 * (si - 1))
      const chars = sim.allies(u.side).filter(a => !a.dead && a.kind === 'char')
      const lowest = [...chars].sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]
      for (const a of chars) sim.heal(a, heal + (a === lowest ? heal : 0))
      const dmg = 0.24 + 0.06 * (si - 1)
      const sum = 0.12 + 0.03 * (si - 1)
      for (const a of chars) {
        const hasSummon = sim.units().some(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === a.id)
        sim.addBuff(a, gearBuff('twa_redoubt', 'Redoubt', [{ stat: 'dmgAll', value: dmg + (hasSummon ? sum : 0) }], 3))
      }
    },
  },
  {
    // party All-Type RES +8% (target-side `resAll`; raises the ally's own RES on incoming attacks)
    id: 'day_one', name: 'Day One of My New Life', rarity: 4, path: 'Preservation',
    hp: 952, atk: 370, def: 463,
    mods: si => [{ stat: 'defPct', value: 0.16 + 0.02 * (si - 1) }],
    onStart: (sim, u, si) => {
      const res = 0.08 + 0.01 * (si - 1)
      for (const a of sim.allies(u.side)) if (!a.dead && a.kind === 'char') sim.addBuff(a, gearBuff('day_one_res', 'Day One RES', [{ stat: 'resAll', value: res }], Infinity))
    },
  },
  {
    // wave-start heal = #3% of each ally's lost HP (tracked per-ally in rt().sheLost, reset each wave)
    id: 'shut_her_eyes', name: 'She Already Shut Her Eyes', rarity: 5, path: 'Preservation',
    hp: 1269, atk: 423, def: 529,
    mods: si => [{ stat: 'hpPct', value: 0.24 + 0.04 * (si - 1) }, { stat: 'err', value: 0.12 + 0.02 * (si - 1) }],
    onAllyHpLoss: (sim, u, target, amt, si) => {
      const rt = sim.rt(target)
      rt.sheLost = ((rt.sheLost as number) ?? 0) + Math.round(amt)
      if (target !== u) return
      const dmg = 0.09 + 0.015 * (si - 1)
      for (const a of sim.allies(u.side)) if (!a.dead && a.kind === 'char') sim.addBuff(a, gearBuff('she_the', 'Allies Soaring', [{ stat: 'dmgAll', value: dmg }], 2))
    },
    onWaveStart: (sim, u, si) => {
      const pct = 0.80 + 0.05 * (si - 1)
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        const lost = (sim.rt(a).sheLost as number) ?? 0
        if (lost <= 0) continue
        sim.heal(a, Math.round(lost * pct))
        sim.rt(a).sheLost = 0
      }
    },
  },
  {
    id: 'unjust_destiny', name: 'Inherently Unjust Destiny', rarity: 5, path: 'Preservation',
    hp: 1058, atk: 423, def: 661,
    mods: si => [{ stat: 'defPct', value: 0.40 + 0.06 * (si - 1) }],
    onShieldProvide: (sim, u, _a, si) => sim.addBuff(u, gearBuff('unjust_cd', 'Unfair CD', [{ stat: 'critDmg', value: 0.40 + 0.06 * (si - 1) }], 2)),
    onAfterAttack: (sim, u, target, dmgType, si) => {
      if (dmgType === 'fua' && target && !target.dead) sim.applyDebuff(u, target, 1, () => sim.addBuff(target, gearBuff('unjust_vuln', 'Unfair Advantage DMG Taken+', [{ stat: 'vulnAll', value: 0.10 + 0.015 * (si - 1) }], 2)), 'Unfair Advantage')
    },
  },
  {
    // Brocade stacks (wearer + memosprite attacks) → CRIT DMG per stack (max 6); at max stacks Basic ATK DMG bonus
    id: 'time_woven_gold', name: 'Time Woven Into Gold', rarity: 5, path: 'Remembrance',
    hp: 1058, atk: 635, def: 397,
    mods: si => [{ stat: 'spdFlat', value: 12 + 2 * (si - 1) }],
    hitMods: (sim, u, _t, type, si) => {
      if (type !== 'basic') return []
      const cur = u.buffs?.find(b => b.id === 'brocade')
      if (!cur || (cur.stacks ?? 1) < 6) return []
      return [{ stat: 'boost:basic', value: 6 * (0.09 + 0.015 * (si - 1)) }]
    },
    // Brocade: wearer (or its memosprite) attacks → +1 CD stack (max 6); each stack = CD for wearer + memosprite
    onAllyAttack: (sim, u, attacker, _t, _d, si) => {
      const mine = attacker === u || (attacker.kind === 'summon' && sim.rt(attacker).ownerId === u.id)
      if (!mine) return
      const cur = u.buffs?.find(b => b.id === 'brocade')
      const st = Math.min(6, (cur?.stacks ?? 0) + 1)
      // per-STACK value: sumMods (damage.ts) already multiplies m.value by b.stacks.
      // Writing the running total here too counted it twice (st^2 — 324% CD at 6 stacks).
      const cd = 0.09 + 0.015 * (si - 1)
      const mk = (): Buff => ({ ...gearBuff('brocade', 'Brocade', [{ stat: 'critDmg', value: cd }], Infinity), stacks: st })
      sim.removeBuff(u, 'brocade')
      sim.addBuff(u, mk())
      const gm = sim.units().find(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === u.id)
      if (gm) {
        sim.removeBuff(gm, 'brocade')
        sim.addBuff(gm, mk())
      }
    },
  },
  {
    // real: MaxHP+X%; HP loss (wearer or its memosprite) ON their own turn -> "Death Flower": DEF-ignore X% 2 turns
    // (wearer + memosprite). Memosprite disappears -> advance wearer X %, once per trigger, reset on wearer Ult.
    id: 'farewells', name: 'Make Farewells More Beautiful', rarity: 5, path: 'Remembrance',
    hp: 1269, atk: 529, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.30 + 0.075 * (si - 1) }],
    onAllyHpLoss: (sim, u, target, _amt, si) => {
      const owned = target.id === u.id || (target.kind === 'summon' && sim.rt(target).ownerId === u.id)
      if (!owned) return
      const actor = sim.currentActor
      if (!actor || (actor.id !== u.id && !(actor.kind === 'summon' && sim.rt(actor).ownerId === u.id))) return
      const val = 0.30 + 0.05 * (si - 1)
      sim.addBuff(u, gearBuff('death_flower', 'Death Flower', [{ stat: 'defIgnore', value: val }], 2))
      for (const s of sim.units())
        if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === u.id)
          sim.addBuff(s, gearBuff('death_flower', 'Death Flower', [{ stat: 'defIgnore', value: val }], 2))
    },
    onAfterUlt: (sim, u) => { sim.rt(u)['dfAdv'] = false },
    onTurnStart: (sim, u, si) => {
      const had = (sim.rt(u)['dfHad'] as boolean) ?? false
      const now = memospriteOnField(sim, u)
      if (had && !now && !(sim.rt(u)['dfAdv'] as boolean)) {
        sim.rt(u)['dfAdv'] = true
        sim.advance(u, 0.12 + 0.03 * (si - 1))
      }
      sim.rt(u)['dfHad'] = now
    },
  },
  {
    id: 'dazzled', name: 'Dazzled by a Flowery World', rarity: 5, path: 'Elation',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critDmg', value: 0.48 + 0.08 * (si - 1) }],
    onStart: (sim, u, si) => {
      const elation = sim.allies(u.side).filter(a => (a.base.path ?? '') === 'Elation').length
      if (elation <= 0) return
      const gain = Math.min(3, elation)
      const s = sim as unknown as { maxSp: number }
      s.maxSp += gain
      sim.rt(u).dazzleSp = gain
    },
    onUnitDeath: (sim, u) => {
      const own = (sim.rt(u).dazzleSp as number | undefined) ?? 0
      if (own <= 0) return
      const s = sim as unknown as { maxSp: number }
      s.maxSp = Math.max(5, s.maxSp - own)
    },
    onSpSpend: (sim, u, spThisTurn, si) => {
      sim.addBuff(u, gearBuff('dazzle_def', 'Dazzled Ignore', [{ stat: 'defIgnore', value: 0.05 + 0.01 * (si - 1) }], Infinity, 4))
      if (spThisTurn >= 4) gearParty(sim, u, 'stream_promo', 'Stream Promo', [{ stat: 'elation', value: 0.2 + 0.04 * (si - 1) }], 1)
    },
  },
  // ---------- batch 2: kit signatures (5★) ----------
  {
    id: 'in_the_name', name: 'In the Name of the World', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 582, def: 463,
    hitMods: (_s, _u, target, _type, si) =>
      (target.dots.length > 0 || target.buffs.some(b => b.mods.some(m => /down|Red$|vuln|Taken/i.test(m.stat))))
        ? [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }] : [],
    onSpSpend: (sim, u, _sp, si) => sim.addBuff(u, gearBuff('itnw_ehr', 'World EHR', [{ stat: 'ehr', value: 0.18 + 0.04 * (si - 1) }], Infinity)),
    onAfterSkill: (sim, u, _t, si) => {
      sim.removeBuff(u, 'itnw_ehr')
      sim.addBuff(u, gearBuff('itnw_atk', 'World ATK', [{ stat: 'atkPct', value: 0.24 + 0.04 * (si - 1) }], 1))
    },
  },
  {
    id: 'patience', name: 'Patience Is All You Need', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }],
    // Erode: every attack +SPD% stack (max 3); on hit vs target not already Shocked -> Lightning DoT 60% ATK, 1t (100% base chance)
    onAfterAttack: (sim, u, target, _d, si) => {
      sim.addBuff(u, gearBuff('patience_spd', 'Patience SPD', [{ stat: 'spdPct', value: 0.048 + 0.008 * (si - 1) }], Infinity, 3))
      if (!target || target.dead || target.side !== 'enemy' || target.dots.some(d => d.kind === 'Shock')) return
      sim.applyDebuff(u, target, 1.0, () => {
        sim.applyDot(target, { kind: 'Shock', elem: 'Lightning', turns: 1, baseDmg: sim.effAtk(u) * (0.60 + 0.10 * (si - 1)), sourceUnit: u } as DoT & { sourceUnit?: Unit })
      }, 'Erode', 'Shock')
    },
  },
  {
    id: 'incessant_rain', name: 'Incessant Rain', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'ehr', value: 0.24 + 0.04 * (si - 1) }],
    hitMods: (_s, _u, target, _t, si) => target.buffs.filter(isDebuff).length >= 3 ? [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }] : [],
    onAfterAttack: (sim, u, target, _d, si) => {
      if (target && !target.dead) sim.applyDebuff(u, target, 1, () => sim.addBuff(target, gearBuff('aether_code', 'Aether Code DMG Taken+', [{ stat: 'vulnAll', value: 0.12 + 0.02 * (si - 1) }], 1)), 'Aether Code')
    },
  },
  {
    // Real: wearer attacked OR consumes own HP → DMG+ until end of next turn, removed after its attack
    id: 'unreachable', name: 'The Unreachable Side', rarity: 5, path: 'Destruction',
    hp: 1269, atk: 582, def: 330,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }, { stat: 'hpPct', value: 0.18 + 0.03 * (si - 1) }],
    onHitTaken: (sim, u, si) => sim.addBuff(u, gearBuff('unreachable_dmg', 'Unreachable DMG', [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }], Infinity)),
    onAllyHpLoss: (sim, u, target, amt, si) => { if (target === u && amt > 0) sim.addBuff(u, gearBuff('unreachable_dmg', 'Unreachable DMG', [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }], Infinity)) },
    onAfterAttack: (sim, u, _t, _d, _si) => { if (u.buffs?.some(b => b.id === 'unreachable_dmg')) sim.removeBuff(u, 'unreachable_dmg') },
  },
  {
    // Tame: FUA → inflicts Tame (2 stacks, 2t); allies' hits on Tamed enemies add CRIT DMG
    // (= critDmgTaken per crit type on the target, stacked ×stacks)
    id: 'worrisome', name: 'Worrisome, Blissful', rarity: 5, path: 'Hunt',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }, { stat: 'boost:fua', value: 0.30 + 0.05 * (si - 1) }],
    onAfterAttack: (sim, u, target, dmgType, si) => {
      if (dmgType === 'fua' && target && !target.dead) {
        const v = 0.12 + 0.02 * (si - 1)
        const mods: Mod[] = (['basic', 'skill', 'ult', 'fua', 'add', 'elation'] as DmgType[]).map(t => ({ stat: `critDmgTaken:${t}` as StatKey, value: v }))
        sim.applyDebuff(u, target, 1, () => sim.addBuff(target, gearBuff('tame', 'Tame Crit Taken+', mods, 2, 2)), 'Tame')
      }
    },
  },
  {
    // Prophet: 1 stack per DoT type hit, max 4; each stack ATK% + DoT DEF-ignore
    id: 'reforged', name: 'Reforged Remembrance', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'ehr', value: 0.40 + 0.05 * (si - 1) }],
    onAfterAttack: (sim, u, target, _dt, si) => {
      const kinds = (target?.dots ?? []).map(d => d.kind)
      const st = sim.rt(u)
      const seen: string[] = (st.prophetSeen as string[]) ?? []
      let added = 0
      for (const k of kinds) {
        const key = k as string
        if (key === 'Entanglement' || key === 'Imprisonment' || key === 'Arcana') continue
        if (!seen.includes(key)) { seen.push(key); added++ }
      }
      if (!added) return
      st.prophetSeen = seen
      const n = Math.min(4, seen.length)
      const atk = 0.072 + 0.007 * (si - 1)
      sim.removeBuff(u, 'prophet_atk')
      sim.addBuff(u, gearBuff('prophet_atk', 'Prophet ATK', [{ stat: 'atkPct', value: n * atk }], Infinity))
      sim.log(`${u.name} Prophet ${n}/4 stacks`)
    },
  },
  {
    // Presage 2t: battle-start + every FUA (also +12 Energy)
    id: 'if_time', name: 'If Time Were a Flower', rarity: 5, path: 'Harmony',
    hp: 1269, atk: 529, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.36 + 0.06 * (si - 1) }],
    onStart: (sim, u, si) => {
      sim.gainEnergyFlat(u, 21)
      const cd = 0.48 + 0.12 * (si - 1)
      for (const a of sim.allies(u.side)) if (!a.dead && a.kind === 'char') sim.addBuff(a, gearBuff('presage', 'Presage', [{ stat: 'critDmg', value: cd }], 2))
    },
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'fua') return
      sim.gainEnergyFlat(u, 12)
      const cd = 0.48 + 0.12 * (si - 1)
      for (const a of sim.allies(u.side)) if (!a.dead && a.kind === 'char') sim.addBuff(a, gearBuff('presage', 'Presage', [{ stat: 'critDmg', value: cd }], 2))
    },
  },
  {
    // Skill/Ult consume 6%+0.5%(si-1) MaxHP → that attack DMG+30%+5%(si-1); consume >500 → +30%+5% more.
    // hitMods applies to the consuming attack itself (was post-ult buff → next action). HP isn't actually drained.
    id: 'flame_blood', name: 'Flame of Blood, Blaze My Path', rarity: 5, path: 'Destruction',
    hp: 1375, atk: 476, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.18 + 0.03 * (si - 1) }, { stat: 'inHeal', value: 0.20 + 0.05 * (si - 1) }],
    hitMods: (sim, u, _t, type, si) => {
      if (type !== 'skill' && type !== 'ult') return []
      const consume = u.maxHp * (0.06 + 0.005 * (si - 1))
      const d = 0.30 + 0.05 * (si - 1)
      return [{ stat: 'dmgAll', value: d + (consume > 500 ? d : 0) }]
    },
  },
  {
    id: 'lies_breeze', name: 'Lies Dance on the Breeze', rarity: 5, path: 'Nihility',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'spdPct', value: 0.18 + 0.03 * (si - 1) }],
    onAfterAttack: (sim, u, _t, _d, si) => {
      const enemySide = u.side === 'ally' ? 'enemy' : 'ally'
      for (const e of sim.allies(enemySide)) {
        sim.applyDebuff(u, e, 1.2, () => sim.addBuff(e, gearBuff('bamboozle', 'Bamboozle DEF↓', [{ stat: 'defRed', value: 0.16 + 0.02 * (si - 1) }], 2)), 'Bamboozle')
        if (eff(u).spd >= 170) sim.applyDebuff(u, e, 1.2, () => sim.addBuff(e, gearBuff('theft', 'Theft DEF↓', [{ stat: 'defRed', value: 0.08 + 0.01 * (si - 1) }], 2)), 'Theft')
      }
    },
  },
  {
    id: 'thus_burns', name: 'Thus Burns the Dawn', rarity: 5, path: 'Destruction',
    hp: 952, atk: 687, def: 397,
    mods: si => [{ stat: 'spdFlat', value: 12 + 2 * (si - 1) }, { stat: 'defIgnore', value: 0.18 + 0.045 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('blazing_sun', 'Blazing Sun', [{ stat: 'dmgAll', value: 0.60 + 0.18 * (si - 1) }], Infinity)),
    onTurnStart: (sim, u, _si) => { if (u.buffs?.some(b => b.id === 'blazing_sun')) sim.removeBuff(u, 'blazing_sun') },
  },
  // ---------- batch 3: kit signatures (5★/4★) ----------
  {
    // ATK per enemy on the field (max 5, re-counted each attack); break-DMG buff honored
    id: 'milkyway', name: 'Night on the Milky Way', rarity: 5, path: 'Erudition',
    hp: 1163, atk: 582, def: 397,
    mods: () => [],
    onAfterAttack: (sim, u, _t, _dt, si) => {
      const n = Math.min(5, sim.livingEnemiesOf(u).length)
      sim.removeBuff(u, 'milkyway_atk')
      sim.addBuff(u, gearBuff('milkyway_atk', 'Milky Way ATK', [{ stat: 'atkPct', value: n * (0.09 + 0.015 * (si - 1)) }], Infinity))
      sim.log(`${u.name} Milky Way: ${n} enemies → ATK stacks`)
    },
    onAfterBreak: (sim, u, _t, si) => sim.addBuff(u, gearBuff('milkyway_break', 'Milky Way Break', [{ stat: 'dmgAll', value: 0.30 + 0.05 * (si - 1) }], 1)),
  },
  {
    // Eclipse: teammate attacked OR loses HP -> +1 stack (max 3); each stack = next-attack DMG; 3 stacks = DEF-ignore
    id: 'my_own_sword', name: 'I Shall Be My Own Sword', rarity: 5, path: 'Destruction',
    hp: 1163, atk: 582, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.20 + 0.03 * (si - 1) }],
    onAllyHpLoss: (sim, u, _t, _amt, si) => {
      const cur = u.buffs?.find(b => b.id === 'sword_eclipse')
      const st = Math.min(3, ((cur?.stacks ?? 0) + 1))
      sim.removeBuff(u, 'sword_eclipse')
      sim.addBuff(u, { ...gearBuff('sword_eclipse', 'Eclipse', [{ stat: 'dmgAll', value: 0.14 + 0.025 * (si - 1) }], Infinity), stacks: st })
    },
    hitMods: (_s, u, _t, _ty, si) => (u.buffs?.find(b => b.id === 'sword_eclipse')?.stacks ?? 0) >= 3 ? [{ stat: 'defIgnore', value: 0.12 + 0.02 * (si - 1) }] : [],
    onAfterAttack: (sim, u, _t, _d, _si) => { if (u.buffs?.some(b => b.id === 'sword_eclipse')) sim.removeBuff(u, 'sword_eclipse') },
  },
  {
    // Thorns: per different enemy hit in one attack → #3 Energy (cap #4=3 grants per attack).
    // Attack boundary ≈ own-turn boundary (extra attacks within one turn share the cap — minor).
    id: 'echo_coffin', name: 'Echoes of the Coffin', rarity: 5, path: 'Abundance',
    hp: 1163, atk: 582, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.24 + 0.04 * (si - 1) }],
    onAfterUlt: (sim, u, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('coffin_spd', 'Coffin SPD', [{ stat: 'spdFlat', value: 12 + 2 * (si - 1) }], 1))
    },
    onAfterAttack: (sim, u, target, _d, si) => {
      if (target.side !== 'enemy' || target.dead) return
      const rt = sim.rt(u) as { coffinAtk?: { turn: number; seen: Set<string>; grants: number } }
      const turn = sim.turnCount.get(u.id) ?? 0
      const st = (rt.coffinAtk = rt.coffinAtk && rt.coffinAtk.turn === turn
        ? rt.coffinAtk
        : { turn, seen: new Set(), grants: 0 })
      if (st.grants >= 3 || st.seen.has(target.id)) return
      st.seen.add(target.id)
      st.grants++
      const en = 3 + 0.5 * (si - 1)
      sim.gainEnergyFlat(u, en)
      sim.log(`${u.name} Echoes of the Coffin: +${en.toFixed(1)} Energy (${st.grants}/3)`)
    },
  },
  {
    id: 'long_rainbows', name: 'Long May Rainbows Adorn the Sky', rarity: 5, path: 'Remembrance',
    hp: 1163, atk: 476, def: 529,
    mods: si => [{ stat: 'spdPct', value: 0.18 + 0.03 * (si - 1) }],
    onStart: (sim, u) => { sim.rt(u).rainbowPool = 0 },
    // wearer Basic/Skill/Ult: consume 1% of each char ally's CURRENT HP into the pool (pool resets on memosprite attack)
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic' && dmgType !== 'skill' && dmgType !== 'ult') return
      const pct = 0.01 + 0.0025 * (si - 1)
      let consumed = 0
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        const amt = Math.min(Math.floor(a.hp * pct), Math.max(0, a.hp - 1))
        if (amt <= 0) continue
        sim.hpChange(a, -amt, 'drain')
        sim.fireAllyHpLoss(a, amt)
        consumed += amt
      }
      sim.rt(u).rainbowPool = ((sim.rt(u).rainbowPool as number) ?? 0) + consumed
      if (consumed > 0) sim.log(`${u.name} Long Rainbows: allies -${consumed} HP (pool ${sim.rt(u).rainbowPool})`)
    },
    // 23042: the pool Additional fires after the NEXT ATTACK of the wearer's memosprite (any attack);
    // the vuln (enemies DMG taken+) fires only when the memosprite uses its Memosprite Skill — the kit
    // tags that hit (`HitOpts.memoSkill`). Joint attacks the owner drags the memosprite into carry no
    // tag: the pool Additional still fires, the vuln does not.
    onAllyAttack: (sim, u, attacker, target, _dmgType, si, memoSkill) => {
      const mine = attacker.kind === 'summon' && sim.rt(attacker).ownerId === u.id
      if (!mine || !target || target.dead) return
      const pool = (sim.rt(u).rainbowPool as number) ?? 0
      if (pool > 0) {
        sim.rt(u).rainbowPool = 0
        sim.hit(attacker, target, { type: 'add', noSeq: true, elem: attacker.elem, mult: 0, flat: Math.round(pool * (2.5 + 0.625 * (si - 1))), label: 'Rainbow Vow (Memosprite Additional)' })
        sim.log(`${u.name} Long Rainbows: memosprite Additional = ${Math.round(pool * (2.5 + 0.625 * (si - 1)))} (pool ${pool})`)
      }
      if (memoSkill) rainbowVuln(sim, u, si)
    },
  },
  {
    id: 'epoch_etched', name: 'Epoch Etched in Golden Blood', rarity: 5, path: 'Harmony',
    hp: 952, atk: 635, def: 463,
    mods: si => [{ stat: 'atkPct', value: 0.64 + 0.16 * (si - 1) }],
    onAfterSkill: (sim, u, target, si) => {
      if (target && target.side === u.side && target.kind === 'char') sim.addBuff(target, gearBuff('epoch_sb', 'Epoch Skill DMG', [{ stat: 'boost:skill', value: 0.54 + 0.135 * (si - 1) }], 3))
    },
    onAfterUlt: (sim) => sim.gainSp(1),
  },
  {
    // Hymn: wearer's Skill OR Ultimate on ONE ally char → target gets Hymn (DMG+), wearer +energy, every 2nd SP refund
    // (Ult gated by lastAbilityTarget being a single ally char — squad/AoE ults don't qualify)
    id: 'grounded_ascent', name: 'A Grounded Ascent', rarity: 5, path: 'Harmony',
    hp: 1163, atk: 476, def: 529,
    onStart: (sim, u) => { sim.rt(u).groundedUses = 0 },
    onAfterSkill: (sim, u, target, si) => {
      if (!target || target.side !== u.side || target.kind !== 'char') return
      sim.addBuff(target, gearBuff('hymn', 'Hymn', [{ stat: 'dmgAll', value: 0.15 + 0.0225 * (si - 1) }], 3, 3))
      grAsc(sim, u, 6 + 0.5 * (si - 1))
    },
    onAfterUlt: (sim, u, si) => {
      const t = sim.lastAbilityTarget
      if (!t || t === 'team' || t.side !== u.side || t.kind !== 'char') return
      sim.addBuff(t, gearBuff('hymn', 'Hymn', [{ stat: 'dmgAll', value: 0.15 + 0.0225 * (si - 1) }], 3, 3))
      grAsc(sim, u, 6 + 0.5 * (si - 1))
    },
  },
  {
    // Charring: Break → vulnAll 2 turns, stacks up to 2
    id: 'long_road', name: 'Long Road Leads Home', rarity: 5, path: 'Nihility',
    hp: 952, atk: 476, def: 661,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    onAfterBreak: (sim, u, target, si) => sim.applyDebuff(u, target, 1, () => sim.addBuff(target, gearBuff('charring', 'Charring DMG Taken+', [{ stat: 'vulnAll', value: 0.18 + 0.03 * (si - 1) }], 2, 2)), 'Charring'),
  },
  {
    id: 'what_is_real', name: 'What Is Real?', rarity: 4, path: 'Abundance',
    hp: 1058, atk: 423, def: 330,
    mods: si => [{ stat: 'be', value: 0.24 + 0.06 * (si - 1) }],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType === 'basic') sim.heal(u, u.maxHp * (0.02 + 0.005 * (si - 1)) + 800)
    },
  },
  {
    // real: "the next ally to take action (except wearer) deals +DMG 1 turn" — pick the alive char ally with the lowest AV
    id: 'past_future', name: 'Past and Future', rarity: 4, path: 'Harmony',
    hp: 952, atk: 423, def: 397,
    onAfterSkill: (sim, u, _target, si) => {
      const cands = sim.units().filter(a => a.side === u.side && a.kind === 'char' && a !== u && !a.dead)
      const next = cands.length ? cands.reduce((m, a) => (a.av < m.av ? a : m), cands[0]) : null
      if (next) sim.addBuff(next, gearBuff('past_future', 'Past and Future', [{ stat: 'dmgAll', value: 0.16 + 0.04 * (si - 1) }], 1))
    },
  },
  {
    // Secret: battle start + each wearer turn → 1 of 3 party effects (ATK+% / CRIT DMG+% / ERR+%), never the
    // same twice in a row, replacing the previous effect for 1 turn.
    // Knock-down: wearer defeated → current effect removed (real via onUnitDeath, 25-09-2026).
    id: 'carve_moon', name: 'Carve the Moon, Weave the Clouds', rarity: 4, path: 'Harmony',
    hp: 952, atk: 476, def: 330,
    onStart: (sim, u, si) => carveApply(sim, u, si),
    onTurnStart: (sim, u, si) => carveApply(sim, u, si),
    onUnitDeath: (sim, u) => {
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') {
          sim.removeBuff(a, 'carve_atk'); sim.removeBuff(a, 'carve_cd'); sim.removeBuff(a, 'carve_err')
        }
      sim.log(`${u.name} knocked down — Carve the Moon effect removed`)
    },
  },
  {
    id: 'sleep_like_dead', name: 'Sleep Like the Dead', rarity: 5, path: 'Hunt',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critDmg', value: 0.30 + 0.05 * (si - 1) }],
    onNonCrit: (sim, u, _t, si) => {
      sim.removeBuff(u, 'sld_cr')
      sim.addBuff(u, gearBuff('sld_cr', 'Sleep Like the Dead CR', [{ stat: 'critRate', value: 0.36 + 0.06 * (si - 1) }], 2))
    },
  },
  {
    // heal-tally: onAllyHeal(amt) accumulates wearer's outgoing healing; any ally attack → Additional
    // DMG equal to 36% of the recorded heal to a random attacked enemy, once per turn.
    id: 'time_waits', name: 'Time Waits for No One', rarity: 5, path: 'Abundance',
    hp: 1269, atk: 476, def: 463,
    mods: si => [{ stat: 'hpPct', value: 0.18 + 0.03 * (si - 1) }, { stat: 'outHeal', value: 0.12 + 0.02 * (si - 1) }],
    onAllyHeal: (sim, u, _t, amt, si, src) => {
      if (src !== u) return
      const rt = sim.rt(u) as Record<string, unknown>
      rt.twTally = ((rt.twTally as number) ?? 0) + amt
    },
    onAllyAttack: (sim, u, attacker, _target, _type, si) => {
      const rt = sim.rt(u) as Record<string, unknown>
      const tally = (rt.twTally as number) ?? 0
      if (tally <= 0 || (rt.twTurn as number) === sim.battleTurn) return
      rt.twTurn = sim.battleTurn
      const pool = sim.allies('enemy').filter(e => !e.dead)
      if (!pool.length) return
      rt.twTally = 0
      const t = sim.rngPick(pool)
      const mult_ = 0.36 + 0.06 * (si - 1)
      sim.hit(u, t, { type: 'add', noSeq: true, flat: tally * mult_, mult: 0, canCrit: false, elem: u.elem, noDmgBoost: true, label: 'Time Waits Additional' })
      sim.log(`${attacker.name} attack → Time Waits Additional DMG ${(tally * mult_).toFixed(0)}`)
    },
  },
  {
    id: 'passing_shore', name: 'Along the Passing Shore', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 635, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.36 + 0.06 * (si - 1) }, { stat: 'boost:ult', value: 0.24 + 0.04 * (si - 1) }],
    hitMods: (_sim, _u, _target, _type, si) => [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }],
  },
  {
    // Moment of Victory: flat aggro feeds weighted enemy target selection; =150 (real, pickTargetByAggro)
    id: 'moment_victory', name: 'Moment of Victory', rarity: 5, path: 'Preservation',
    hp: 1058, atk: 476, def: 595,
    mods: si => [{ stat: 'defPct', value: 0.24 + 0.04 * (si - 1) }, { stat: 'ehr', value: 0.24 + 0.04 * (si - 1) }, { stat: 'aggro', value: 150 }],
    onHitTaken: (sim, u, si) => sim.addBuff(u, gearBuff('mom_def', 'Mom of Victory DEF', [{ stat: 'defPct', value: 0.24 + 0.04 * (si - 1) }], 1)),
  },
  {
    // attack → ATK+% stack, max 4 (matches data); break → DMG+% 2t
    id: 'aeon', name: 'On the Fall of an Aeon', rarity: 5, path: 'Destruction',
    hp: 1058, atk: 529, def: 397,
    mods: () => [],
    onAfterAttack: (sim, u, _t, _d, si) => sim.addBuff(u, gearBuff('aeon_atk', 'Aeon Grudge', [{ stat: 'atkPct', value: 0.08 + 0.02 * (si - 1) }], Infinity, 4)),
    onAfterBreak: (sim, u, _t, si) => sim.addBuff(u, gearBuff('aeon_break', 'Aeon Routed', [{ stat: 'dmgAll', value: 0.12 + 0.03 * (si - 1) }], 2)),
  },
  {
    // real: barrier re-grant gated by a 3-turn CD (once per 3 turns per the real text); while the
    // shield is intact the hit instead applies the extra mitigation
    id: 'texture_memories', name: 'Texture of Memories', rarity: 5, path: 'Preservation',
    hp: 1058, atk: 423, def: 529,
    mods: si => [{ stat: 'effRes', value: 0.08 + 0.02 * (si - 1) }],
    onHitTaken: (sim, u, si) => {
      const has = u.buffs.some(b => b.id === 'texture_shield')
      const cd = u.buffs.some(b => b.id === 'texture_cd')
      if (has) sim.addBuff(u, gearBuff('texture_mit', 'Memories Guard', [{ stat: 'mitigation', value: 0.12 + 0.03 * (si - 1) }], 1))
      else if (!cd) {
        sim.addBuff(u, { id: 'texture_shield', name: 'Memories Barrier', mods: [], shield: Math.round(u.maxHp * (0.16 + 0.04 * (si - 1))), sourceId: 'gear', turns: 2 })
        sim.addBuff(u, gearBuff('texture_cd', 'Memories Barrier CD', [], 3))
      }
    },
  },
  {
    id: 'curtain_never', name: "Memory's Curtain Never Falls", rarity: 5, path: 'Remembrance',
    hp: 1058, atk: 529, def: 397,
    mods: si => [{ stat: 'spdPct', value: 0.06 + 0.015 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('curtain_dmg', 'Memory Curtain DMG', [{ stat: 'dmgAll', value: 0.08 + 0.02 * (si - 1) }], 3))
    },
  },
  {
    id: 'gnsw', name: 'Good Night and Sleep Well', rarity: 4, path: 'Nihility',
    hp: 952, atk: 476, def: 330,
    hitMods: (_s, _u, target, _t, si) => {
      const n = Math.min(3, target.buffs.filter(isDebuff).length)
      return n > 0 ? [{ stat: 'dmgAll', value: n * (0.12 + 0.03 * (si - 1)) }] : []
    },
  },
  {
    id: 'eyes_of_prey', name: 'Eyes of the Prey', rarity: 4, path: 'Nihility',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'ehr', value: 0.20 + 0.05 * (si - 1) }, { stat: 'boost:dot', value: 0.24 + 0.06 * (si - 1) }],
  },
  {
    id: 'secret_vow', name: 'A Secret Vow', rarity: 4, path: 'Destruction',
    hp: 1058, atk: 476, def: 264,
    mods: si => [{ stat: 'dmgAll', value: 0.20 + 0.05 * (si - 1) }],
    hitMods: (_sim, u, target, _type, si) =>
      target.hp / target.maxHp > u.hp / u.maxHp ? [{ stat: 'dmgAll', value: 0.20 + 0.05 * (si - 1) }] : [],
  },
  {
    // Landau's Choice: unconditional DMG-reduction (data-verified); aggro =150 real
    id: 'landau_choice', name: "Landau's Choice", rarity: 4, path: 'Preservation',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'mitigation', value: 0.16 + 0.02 * (si - 1) }, { stat: 'aggro', value: 150 }],
  },
  {
    id: 'qpq', name: 'Quid Pro Quo', rarity: 4, path: 'Abundance',
    hp: 952, atk: 423, def: 397,
    mods: () => [],
    onTurnStart: (sim, u, si) => {
      const allies = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead && a !== u)
      const lowest = allies.sort((a, b) => (a.energy ?? 0) / (a.maxEnergy ?? 1) - (b.energy ?? 0) / (b.maxEnergy ?? 1))[0]
      if (lowest && (lowest.energy ?? 0) / (lowest.maxEnergy ?? 1) < 0.50) {
        sim.gainEnergyFlat(lowest, 8 + 2 * (si - 1)); sim.log(`${u.name} QPQ: energy to ${lowest.name}`)
      }
    },
  },
  {
    id: 'indelible_promise', name: 'Indelible Promise', rarity: 4, path: 'Destruction',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'be', value: 0.28 + 0.07 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('indelible_ult', 'Indelible Ult CRIT', [{ stat: 'critRate', value: 0.15 + 0.0375 * (si - 1) }], 2)),
  },
  {
    // real trigger: "memosprite uses an ability on an ally target" (in sim = memosprite heals an ally).
    // Fired via cone onAllyHeal when src is a summon owned by the wearer (Ica Take Sky, Netherwing Wings Sweep).
    id: 'victory_blink', name: 'Victory In a Blink', rarity: 4, path: 'Remembrance',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.12 + 0.03 * (si - 1) }],
    onAllyHeal: (sim, u, _target, _amt, si, src) => {
      if (!src || src.kind !== 'summon') return
      const ownerId = sim.rt(src).ownerId as string | undefined
      if (ownerId !== u.id) return
      for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('blink_dmg', 'Blink DMG', [{ stat: 'dmgAll', value: 0.08 + 0.02 * (si - 1) }], 3))
    },
  },
  {
    id: 'genius_greeting', name: "Geniuses' Greetings", rarity: 4, path: 'Remembrance',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('genius_basic', 'Genius Basic DMG', [{ stat: 'boost:basic', value: 0.20 + 0.05 * (si - 1) }], 3)),
  },
  {
    // real: wearer CRIT Rate +X%; while the wearer's memosprite is on field -> wearer AND memosprite DMG +X%.
    // The DMG share is gated on memosprite presence — re-evaluated on summon/disappear (exact) and on turn
    // start (covers states that change without a memosprite event), never always-on.
    id: 'sweat_now', name: 'Sweat Now, Cry Less', rarity: 4, path: 'Remembrance',
    hp: 1058, atk: 529, def: 198,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }],
    onStart: (sim, u, si) => sweatNowApply(sim, u, si),
    onMemospriteSummon: (sim, u, si) => sweatNowApply(sim, u, si),
    onMemospriteDisappear: (sim, u) => sim.removeBuff(u, 'sweat_dmg'),
    onTurnStart: (sim, u, si) => {
      if (memospriteOnField(sim, u)) sweatNowApply(sim, u, si)
      else sim.removeBuff(u, 'sweat_dmg')
    },
  },
  {
    // wearer CRIT DMG +24%; memosprite inherits the same +24% via ATK/CRIT mirroring (Ica/Garmentmaker/Khaslana mirror wearer critDmg)
    id: 'flower_remembers', name: 'The Flower Remembers', rarity: 4, path: 'Remembrance',
    hp: 1058, atk: 529, def: 330,
    mods: si => [{ stat: 'critDmg', value: 0.24 + 0.04 * (si - 1) }],
  },
  {
    id: 'today_good_luck', name: "Today's Good Luck", rarity: 4, path: 'Elation',
    hp: 952, atk: 529, def: 397,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }],
    onElationSkill: (sim, u, si) => sim.addBuff(u, gearBuff('tgl_elation', "Good Luck Elation", [{ stat: 'elation', value: 0.12 + 0.02 * (si - 1) }], Infinity, 2)),
  },
  {
    id: 'trail_bygone_blood', name: 'A Trail of Bygone Blood', rarity: 4, path: 'Destruction',
    hp: 1058, atk: 529, def: 330,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }, { stat: 'boost:skill', value: 0.24 + 0.04 * (si - 1) }, { stat: 'boost:ult', value: 0.24 + 0.04 * (si - 1) }],
  },
  {
    id: 'tutorial_before', name: 'Before the Tutorial Mission Starts', rarity: 4, path: 'Nihility',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'ehr', value: 0.20 + 0.05 * (si - 1) }],
    onAfterAttack: (sim, u, target, _dmgType, si) => {
      if (target && target.buffs.some(b => b.mods.some(m => m.stat === 'defRed'))) {
        const e = 4 + 1 * (si - 1)
        sim.gainEnergyFlat(u, e)
        sim.log(`${u.name} Tutorial: +${e} energy (DEF-down target)`)
      }
    },
  },
  // ------------------------------------------------ 3★ cones ----------
  // every 3★ passive carries its real gate: kill/condition one-liners use hooks, and the two whose
  // effect is tied to the action that triggers it (Cornucopia OHB → Skill/Ult heal, Sneering Elation
  // → Aha Instant) are gated too — no always-on flatten left.
  {
    id: 'arrows', name: 'Arrows', rarity: 3, path: 'Hunt',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onStart: (sim, u, si) => sim.addBuff(u, gearBuff('arrows_cr', 'Arrows CRIT Rate', [{ stat: 'critRate', value: 0.12 + 0.03 * (si - 1) }], 3)),
  },
  {
    id: 'cornucopia', name: 'Cornucopia', rarity: 3, path: 'Abundance',
    hp: 952, atk: 264, def: 264,
    // "When the wearer uses their Skill or Ultimate, their Outgoing Healing increases by #1%": the
    // boost counts only for heals produced by a Skill/Ult — HealingPipeline reads `whenAbility`
    mods: si => [{ stat: 'outHeal', value: 0.12 + 0.03 * (si - 1), whenAbility: ['skill', 'ult'] }],
  },
  {
    id: 'collapsing_sky', name: 'Collapsing Sky', rarity: 3, path: 'Destruction',
    hp: 846, atk: 370, def: 198,
    mods: si => [{ stat: 'boost:basic', value: 0.20 + 0.05 * (si - 1) }, { stat: 'boost:skill', value: 0.20 + 0.05 * (si - 1) }],
  },
  {
    // DEF+16%: extra +16% while wearer HP <50% (apply on HP-loss below 50, remove on heal above 50)
    id: 'amber', name: 'Amber', rarity: 3, path: 'Preservation',
    hp: 846, atk: 264, def: 330,
    mods: si => [{ stat: 'defPct', value: 0.16 + 0.04 * (si - 1) }],
    onAllyHpLoss: (sim, u, target, _amt, si) => { if (target === u && u.maxHp > 0 && u.hp / u.maxHp < 0.5 && !u.buffs.some(b => b.id === 'amber_low')) sim.addBuff(u, gearBuff('amber_low', 'Amber low-HP DEF', [{ stat: 'defPct', value: 0.16 + 0.04 * (si - 1) }], Infinity)) },
    onAllyHeal: (sim, u, target) => { if (target === u && u.maxHp > 0 && u.hp / u.maxHp >= 0.5) sim.removeBuff(u, 'amber_low') },
  },
  {
    id: 'void', name: 'Void', rarity: 3, path: 'Nihility',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onStart: (sim, u, si) => sim.addBuff(u, gearBuff('void_ehr', 'Void EHR', [{ stat: 'ehr', value: 0.20 + 0.05 * (si - 1) }], 3)),
  },
  {
    id: 'chorus', name: 'Chorus', rarity: 3, path: 'Harmony',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onStart: (sim, u, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('chorus_atk', 'Chorus ATK', [{ stat: 'atkPct', value: 0.08 + 0.01 * (si - 1) }], Infinity))
    },
  },
  {
    id: 'data_bank', name: 'Data Bank', rarity: 3, path: 'Erudition',
    hp: 740, atk: 370, def: 264,
    mods: si => [{ stat: 'boost:ult', value: 0.28 + 0.07 * (si - 1) }],
  },
  {
    id: 'darting_arrow', name: 'Darting Arrow', rarity: 3, path: 'Hunt',
    hp: 740, atk: 370, def: 264,
    mods: () => [],
    onKill: (sim, u, _v, si) => sim.addBuff(u, gearBuff('dart_atk', 'Darting Arrow ATK', [{ stat: 'atkPct', value: 0.24 + 0.06 * (si - 1) }], 3)),
  },
  {
    id: 'fine_fruit', name: 'Fine Fruit', rarity: 3, path: 'Abundance',
    hp: 952, atk: 317, def: 198,
    mods: () => [],
    onStart: (sim, u, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') { sim.gainEnergyFlat(a, 6 + 1.5 * (si - 1)); sim.log(`${a.name} Fine Fruit: +energy`) }
    },
  },
  {
    // Shattered Home: +DMG to enemy targets whose HP% > 50% (real gate, per-target hitMods)
    id: 'shattered_home', name: 'Shattered Home', rarity: 3, path: 'Destruction',
    hp: 846, atk: 370, def: 198,
    mods: () => [],
    hitMods: (_sim, _u, target, _type, si) => (target.hp / target.maxHp >= 0.5 ? [{ stat: 'dmgAll', value: 0.20 + 0.05 * (si - 1) }] : []),
  },
  {
    id: 'defense', name: 'Defense', rarity: 3, path: 'Preservation',
    hp: 952, atk: 264, def: 264,
    mods: () => [],
    onAfterUlt: (sim, u, si) => { sim.heal(u, u.maxHp * (0.18 + 0.03 * (si - 1))); sim.log(`${u.name} Defense: ult heal`) },
  },
  {
    id: 'loop', name: 'Loop', rarity: 3, path: 'Nihility',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    hitMods: (_s, _u, target, _type, si) => (target.buffs.some(b => b.mods.some(m => m.stat === 'spdDown')) ? [{ stat: 'dmgAll', value: 0.24 + 0.06 * (si - 1) }] : []),
  },
  {
    id: 'meshing_cogs', name: 'Meshing Cogs', rarity: 3, path: 'Harmony',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    // Meshing Cogs: attack OR get-hit → +4 energy, once per turn (flag reset on wearer turn start)
    onTurnStart: (sim, u) => { sim.rt(u)['cogsTick'] = 0 },
    onAfterAttack: (sim, u, _t, _dt, si) => {
      const rt = sim.rt(u)
      if (rt['cogsTick'] || u.dead) return
      rt['cogsTick'] = 1
      sim.gainEnergyFlat(u, 4 + 1 * (si - 1)); sim.log(`${u.name} Meshing Cogs: +energy (attack)`)
    },
    onHitTaken: (sim, u, si) => {
      const rt = sim.rt(u)
      if (rt['cogsTick'] || u.dead) return
      rt['cogsTick'] = 1
      sim.gainEnergyFlat(u, 4 + 1 * (si - 1)); sim.log(`${u.name} Meshing Cogs: +energy (hit)`)
    },
  },
  {
    id: 'passkey', name: 'Passkey', rarity: 3, path: 'Erudition',
    hp: 740, atk: 370, def: 264,
    mods: () => [],
    onAfterSkill: (sim, u, _t, si) => { sim.gainEnergyFlat(u, 8 + 1 * (si - 1)); sim.log(`${u.name} Passkey: +energy`) },
  },
  {
    id: 'adversarial', name: 'Adversarial', rarity: 3, path: 'Hunt',
    hp: 740, atk: 370, def: 264,
    mods: () => [],
    onKill: (sim, u, _v, si) => sim.addBuff(u, gearBuff('adversarial_spd', 'Adversarial SPD', [{ stat: 'spdPct', value: 0.10 + 0.02 * (si - 1) }], 2)),
  },
  {
    id: 'multiplication', name: 'Multiplication', rarity: 3, path: 'Abundance',
    hp: 952, atk: 317, def: 198,
    mods: () => [],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic') return
      sim.advance(u, 0.12 + 0.02 * (si - 1))
      sim.log(`${u.name} Multiplication: next action advanced`)
    },
  },
  {
id: 'mutual_demise', name: 'Mutual Demise', rarity: 3, path: 'Destruction',
    hp: 846, atk: 370, def: 198,
    mods: () => [],
    hitMods: (_sim, u, _t, _type, si) => (u.hp / u.maxHp < 0.8 ? [{ stat: 'critRate', value: 0.12 + 0.03 * (si - 1) }] : []),
  },
  {
    id: 'pioneering', name: 'Pioneering', rarity: 3, path: 'Preservation',
    hp: 952, atk: 264, def: 264,
    mods: () => [],
    onAfterBreak: (sim, u, _v, si) => { sim.heal(u, u.maxHp * (0.12 + 0.02 * (si - 1))); sim.log(`${u.name} Pioneering: heal on break`) },
  },
  {
id: 'hidden_shadow', name: 'Hidden Shadow', rarity: 3, path: 'Nihility',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onAfterSkill: (sim, u, _t, si) => { sim.rt(u)['hsMult'] = 0.60 + 0.15 * (si - 1) },
    onAfterAttack: (sim, u, t, dmgType, si) => {
      if (dmgType !== 'basic') return
      const m = sim.rt(u)['hsMult'] as number | undefined
      delete sim.rt(u)['hsMult']
      if (m && t && !t.dead) { sim.hit(u, t, { type: 'add', noSeq: true, mult: m, label: 'Hidden Shadow' }); sim.log(`${u.name} Hidden Shadow → ${t.name}`) }
    },
  },
  {
    id: 'mediation', name: 'Mediation', rarity: 3, path: 'Harmony',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onStart: (sim, u, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('mediation_spd', 'Mediation SPD', [{ stat: 'spdFlat', value: 12 + 2 * (si - 1) }], 1))
    },
  },
  {
    id: 'sagacity', name: 'Sagacity', rarity: 3, path: 'Erudition',
    hp: 740, atk: 370, def: 264,
    mods: () => [],
    onAfterUlt: (sim, u, si) => { sim.addBuff(u, { id: 'sag_atk', name: 'Sagacity ATK', mods: [{ stat: 'atkPct', value: 0.24 + 0.06 * (si - 1) }], turns: 2 }); sim.log(`${u.name} Sagacity: +ATK%`) },
  },
  {
    // Shadowburn: first memosprite summon → recovers 1 SP + regenerates 12(+2/SI) Energy (real, lightcones.json 20021)
    id: 'shadowburn', name: 'Shadowburn', rarity: 3, path: 'Remembrance',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    onMemospriteSummon: (sim, u, si) => {
      const rt = sim.rt(u) as { shadowFired?: boolean }
      if (rt.shadowFired) return
      rt.shadowFired = true
      sim.gainSp(1)
      sim.gainEnergyFlat(u, 12 + 2 * (si - 1))
      sim.log(`${u.name} Shadowburn: first memosprite summon → +1 SP, +energy`)
    },
  },
  {
    // Reminiscence: memosprite turn start → wearer + memosprite each gain 1 "Commemoration" stack
    // (DMG+8%(+1%(SI-1))/stack, max 4); memosprite disappears → Commemoration removed from wearer + memosprite
    id: 'reminiscence', name: 'Reminiscence', rarity: 3, path: 'Remembrance',
    hp: 635, atk: 423, def: 264,
    mods: () => [],
    onMemospriteTurnStart: (sim, u, si) => {
      const v = 0.08 + 0.01 * (si - 1)
      sim.addBuff(u, gearBuff('remem_comm', 'Commemoration', [{ stat: 'dmgAll', value: v }], Infinity, 4))
      for (const s of sim.units())
        if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === u.id)
          sim.addBuff(s, gearBuff('remem_comm', 'Commemoration', [{ stat: 'dmgAll', value: v }], Infinity, 4))
      sim.log(`${u.name} Reminiscence: Commemoration stacks`)
    },
    onMemospriteDisappear: (sim, u) => {
      sim.removeBuff(u, 'remem_comm')
      for (const s of sim.units())
        if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === u.id)
          sim.removeBuff(s, 'remem_comm')
      sim.log(`${u.name} Reminiscence: Commemoration removed`)
    },
  },
  {
    id: 'sneering', name: 'Sneering', rarity: 3, path: 'Elation',
    hp: 740, atk: 370, def: 264,
    mods: () => [],
    // "When Aha Instant is activated, the wearer's Elation increases by #1%, lasting until Aha
    // Instant ends": buffed at the instant's start, ticked off at Aha's turn end (tickOnSource)
    onAhaInstant: (sim, u, si) => {
      const aha = sim.units().find(x => x.kind === 'aha')
      if (!aha) return
      sim.addBuff(u, { id: 'sneering_el', name: 'Sneering Elation', mods: [{ stat: 'elation', value: 0.16 + 0.04 * (si - 1) }], turns: 1, sourceId: aha.id, tickOnSource: true })
      sim.log(`${u.name} Sneering: Elation up for Aha Instant`)
    },
  },
  {
    id: 'lingering_tear', name: 'Lingering Tear', rarity: 3, path: 'Elation',
    hp: 846, atk: 317, def: 264,
    mods: () => [],
    hitMods: (sim, _u, _t, _ty, si) => (sim.punchlinePool() >= 10 ? [{ stat: 'critDmg', value: 0.20 + 0.05 * (si - 1) }] : []),
  },
  // ------------------------------------------------ 4★ cones (better) ----------
  {
    id: 'post_op', name: 'Post-Op Conversation', rarity: 4, path: 'Abundance',
    hp: 1058, atk: 423, def: 330,
    mods: si => [{ stat: 'err', value: 0.08 + 0.02 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('post_op', 'Post-Op Healing', [{ stat: 'outHeal', value: 0.12 + 0.03 * (si - 1) }], 2)),
  },
  {
    id: 'only_silence', name: 'Only Silence Remains', rarity: 4, path: 'Hunt',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    hitMods: (sim, u, _t, _type, si) => (sim.livingEnemiesOf(u).length <= 2 ? [{ stat: 'critRate', value: 0.12 + 0.03 * (si - 1) }] : []),
  },
  {
    id: 'memories_past', name: 'Memories of the Past', rarity: 4, path: 'Harmony',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'be', value: 0.28 + 0.07 * (si - 1) }],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic') return
      sim.gainEnergyFlat(u, 4 + 1 * (si - 1))
      sim.log(`${u.name} Memories of the Past: +energy`)
    },
  },
  {
id: 'moles', name: 'The Moles Welcome You', rarity: 4, path: 'Destruction',
    hp: 1058, atk: 476, def: 264,
    mods: () => [],
    // Mischievous: +1 stack per Basic/Skill/Ult attack, stacks persist (fresh hits refresh)
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic' && dmgType !== 'skill' && dmgType !== 'ult') return
      sim.addBuff(u, { id: 'moles_atk', name: 'Mischievous ATK', mods: [{ stat: 'atkPct', value: 0.12 + 0.03 * (si - 1) }], turns: Infinity, maxStacks: 3 })
    },
  },
  {
    id: 'birth_self', name: 'The Birth of the Self', rarity: 4, path: 'Erudition',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'boost:fua', value: 0.24 + 0.06 * (si - 1) }],
    hitMods: (_sim, _u, target, type, si) => (type === 'fua' && target.hp / target.maxHp <= 0.5 ? [{ stat: 'boost:fua', value: 0.24 + 0.06 * (si - 1) }] : []),
  },
  {
id: 'shared_feeling', name: 'Shared Feeling', rarity: 4, path: 'Abundance',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'outHeal', value: 0.10 + 0.025 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => {
      for (const a of sim.allies(u.side)) if (a.kind === 'char') { sim.gainEnergyFlat(a, 2 + 0.5 * (si - 1)); sim.log(`${a.name} Shared Feeling: +energy`) }
    },
  },
  {
    id: 'clamor', name: 'Make the World Clamor', rarity: 4, path: 'Erudition',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'boost:ult', value: 0.32 + 0.08 * (si - 1) }],
    onStart: (sim, u, si) => { sim.gainEnergyFlat(u, 20 + 3 * (si - 1)); sim.log(`${u.name} Clamor: +energy`) },
  },
  {
    // effRes +16%; outHeal = 33%×(effRes incl. own), cap 15%
    id: 'perfect_timing', name: 'Perfect Timing', rarity: 4, path: 'Abundance',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'effRes', value: 0.16 + 0.04 * (si - 1) }],
    onStart: (sim, u, si) => {
      const rate = 0.33 + 0.03 * (si - 1)
      const cap = 0.15 + 0.03 * (si - 1)
      const val = Math.min(cap, rate * buffSum(u.buffs, 'effRes'))
      sim.addBuff(u, gearBuff('perfect_timing_ohb', 'Perfect Timing OutHeal', [{ stat: 'outHeal', value: val }], Infinity))
    },
  },
  {
id: 'subscribe', name: 'Subscribe for More!', rarity: 4, path: 'Hunt',
    hp: 952, atk: 476, def: 330,
    mods: () => [],
    hitMods: (_sim, u, _t, type, si) => {
      if (type !== 'basic' && type !== 'skill') return []
      const base = 0.24 + 0.06 * (si - 1)
      const extra = u.energy >= u.maxEnergy ? 0.24 + 0.06 * (si - 1) : 0
      return [{ stat: type === 'basic' ? 'boost:basic' : 'boost:skill', value: base + extra }]
    },
  },
  {
id: 'blue_sky', name: 'Under the Blue Sky', rarity: 4, path: 'Destruction',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onKill: (sim, u, _v, si) => sim.addBuff(u, gearBuff('blue_sky_cr', 'Blue Sky CRIT Rate', [{ stat: 'critRate', value: 0.12 + 0.03 * (si - 1) }], 3)),
  },
  {
    id: 'genius_repose', name: "Geniuses' Repose", rarity: 4, path: 'Erudition',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onKill: (sim, u, _v, si) => sim.addBuff(u, gearBuff('genius_cd', 'Geniuses CRIT DMG', [{ stat: 'critDmg', value: 0.24 + 0.06 * (si - 1) }], 3)),
  },
  {
    id: 'wildfire', name: 'We Are Wildfire', rarity: 4, path: 'Preservation',
    hp: 740, atk: 476, def: 463,
    mods: () => [],
    onStart: (sim, u, si) => {
      // Teary-Eyed: at battle start, all allies take #2 DMG- less (#2=8%+2%(si)) for #3=5 turns;
      // plus heal #1 of missing HP (#1=30%+5%(si)). Numbers checked against lightcones.json (07-09-2026).
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, gearBuff('wildfire_mit', 'Wildfire Mitigation', [{ stat: 'mitigation', value: 0.08 + 0.02 * (si - 1) }], 5))
        sim.heal(a, (a.maxHp - a.hp) * (0.30 + 0.05 * (si - 1)))
      }
    },
  },
  {
    id: 'river_spring', name: 'River Flows in Spring', rarity: 4, path: 'Hunt',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'spdPct', value: 0.08 + 0.01 * (si - 1) }, { stat: 'dmgAll', value: 0.12 + 0.03 * (si - 1) }],
  },
  {
    id: 'woof', name: 'Woof! Walk Time!', rarity: 4, path: 'Destruction',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.10 + 0.025 * (si - 1) }],
    hitMods: (_s, _u, target, _type, si) => (target.dots.some(d => d.kind === 'Burn' || d.kind === 'Bleed') ? [{ stat: 'dmgAll', value: 0.16 + 0.04 * (si - 1) }] : []),
  },
  {
    id: 'breakfast', name: 'The Seriousness of Breakfast', rarity: 4, path: 'Erudition',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'dmgAll', value: 0.12 + 0.03 * (si - 1) }],
    // kill → ATK+4% stack (max 3)
    onKill: (sim, u, _v, si) => sim.addBuff(u, gearBuff('breakfast_atk', 'Breakfast ATK', [{ stat: 'atkPct', value: 0.04 + 0.01 * (si - 1) }], Infinity, 3)),
  },
  {
    id: 'warmth', name: 'Warmth Shortens Cold Nights', rarity: 4, path: 'Abundance',
    hp: 1058, atk: 370, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.16 + 0.04 * (si - 1) }],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic' && dmgType !== 'skill') return
      for (const a of sim.allies(u.side)) if (a.kind === 'char' && !a.dead) sim.heal(a, a.maxHp * (0.02 + 0.005 * (si - 1)))
    },
  },
  {
    id: 'meet_again', name: 'We Will Meet Again', rarity: 4, path: 'Nihility',
    hp: 846, atk: 529, def: 330,
    mods: () => [],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic' && dmgType !== 'skill') return
      const e = sim.livingEnemiesOf(u)[0]
      if (e) sim.hit(u, e, { type: 'add', noSeq: true, mult: 0.48 + 0.12 * (si - 1), toughDmg: 0, label: 'Echo Strike' })
    },
  },
  {
    // This Is Me!: DEF+16/20/24/28/32% + on each Ult, bonus DMG = 60/75/90/105/120% of DEF (once per enemy target).
    id: 'this_is_me', name: 'This Is Me!', rarity: 4, path: 'Preservation',
    hp: 846, atk: 370, def: 529,
    mods: si => [{ stat: 'defPct', value: 0.16 + 0.04 * (si - 1) }],
    hitMods: (_s, u, _t, type, si) => type === 'ult' ? [{ stat: 'dmgAll', value: eff(u).def / 100 * (0.60 + 0.60 * (si - 1)) }] : [],
  },
  {
    // Return to Darkness: CRIT hit → 16% fixed chance to dispel 1 buff on the target enemy, once per attack (sim.attackNo).
    // In-sim impact small: enemies rarely carry a removable buff, but the dispel mechanic is real.
    id: 'return_dark', name: 'Return to Darkness', rarity: 4, path: 'Hunt',
    hp: 846, atk: 529, def: 330,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.03 * (si - 1) }],
    onCrit: (sim, u, target, si) => {
      if (target.side !== 'enemy' || sim.rng() >= (0.16 + 0.04 * (si - 1))) return
      const rt = sim.rt(u)
      if (rt.rdDispelAtk === sim.attackNo()) return
      rt.rdDispelAtk = sim.attackNo()
      const hostile = target.buffs.find(b => !b.debuff)
      if (hostile) { sim.removeBuff(target, hostile.id); sim.log(`${u.name} Return to Darkness: dispelled ${hostile.name}`) }
    },
  },
  {
    id: 'nowhere_run', name: 'Nowhere to Run', rarity: 4, path: 'Destruction',
    hp: 952, atk: 529, def: 264,
    mods: si => [{ stat: 'atkPct', value: 0.24 + 0.06 * (si - 1) }],
    onKill: (sim, u, _v, si) => { sim.heal(u, sim.effAtk(u) * (0.12 + 0.03 * (si - 1))); sim.log(`${u.name} Nowhere to Run: heal`) },
  },
  {
    // Dreamville: after wearer uses Basic/Skill/Ult → all allies gain Childishness (DMG for that SAME ability type, 3 turns, non-stacking, only most recent type)
    id: 'dreamville', name: 'Dreamville Adventure', rarity: 4, path: 'Harmony',
    hp: 952, atk: 423, def: 397,
    mods: () => [],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType !== 'basic' && dmgType !== 'skill' && dmgType !== 'ult') return
      for (const a of sim.allies(u.side)) if (a.kind === 'char') {
        sim.removeBuff(a, 'dreamville_child')
        sim.addBuff(a, gearBuff('dreamville_child', `Dreamville ${dmgType}`, [{ stat: `boost:${dmgType}`, value: 0.12 + 0.02 * (si - 1) }], 3))
      }
    },
  },
  {
    // Final Victor: crit → 1 Good Fortune stack (max 4), each CD+8%; cleared on the wearer's next turn start (turn-end removal approximated as turn-start clear — equal steady state for a DPS critting every action)
    id: 'final_victor', name: 'Final Victor', rarity: 4, path: 'Hunt',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.12 + 0.02 * (si - 1) }],
    onCrit: (sim, u, _t, si) => sim.addBuff(u, gearBuff('good_fortune', 'Good Fortune CD', [{ stat: 'critDmg', value: 0.08 + 0.01 * (si - 1) }], Infinity, 4)),
    onTurnStart: (sim, u) => sim.removeBuff(u, 'good_fortune'),
  },
  {
    // HP loss >25% MaxHP in one attack (or self-consume) → heal 15% MaxHP + DMG+ 2t, once per 3 turns
    // flatten: "one attack" approximated as cumulative HP loss since last trigger (multi-hit enemy attack spans turn window)
    id: 'flames_afar', name: 'Flames Afar', rarity: 4, path: 'Destruction',
    hp: 1058, atk: 476, def: 264,
    mods: () => [],
    onTurnStart: (sim, u) => {
      const r = sim.rt(u)
      r.flamesLoss = 0
      r.flamesCd = Math.max(0, ((r.flamesCd as number) ?? 0) - 1)
    },
    onAllyHpLoss: (sim, u, target, amt, si) => {
      if (target !== u) return
      const r = sim.rt(u)
      if ((r.flamesCd as number ?? 0) > 0) return
      r.flamesLoss = (r.flamesLoss as number ?? 0) + amt
      if ((r.flamesLoss as number) < 0.25 * u.maxHp) return
      r.flamesLoss = 0
      r.flamesCd = 3
      sim.heal(u, 0.15 * u.maxHp)
      sim.addBuff(u, gearBuff('flames_afar', 'Flames Afar DMG', [{ stat: 'dmgAll', value: 0.25 + 0.0625 * (si - 1) }], 2))
      sim.log(`${u.name} Flames Afar: >25% MaxHP loss → heal + DMG+`)
    },
  },
  {
    // Destiny's Threads: per-100-DEF +0.8% DMG, cap 32% (real: live DEF via hitMods)
    id: 'destiny_threads', name: "Destiny's Threads Forewoven", rarity: 4, path: 'Preservation',
    hp: 952, atk: 370, def: 463,
    mods: si => [{ stat: 'effRes', value: 0.12 + 0.02 * (si - 1) }],
    hitMods: (_s, u, _t, _type, _si) => [{ stat: 'dmgAll', value: Math.min(0.32, eff(u).def / 100 * (0.008)) }],
  },
  {
    // Cosmos Fell: atkPct + CD when attack hits ≥2 enemies with the wearer's element Weakness
    // (gate checked vs living wave enemies with matching weakness — attacked-set ≈ living set for AoE mains)
    id: 'cosmos_fell', name: 'The Day The Cosmos Fell', rarity: 4, path: 'Erudition',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.02 * (si - 1) }],
    onAfterAttack: (sim, u, _t, _dt, si) => {
      const matched = sim.livingEnemiesOf(u).filter(e => e.weaknesses.includes(u.elem)).length
      if (matched >= 2) sim.addBuff(u, gearBuff('cosmos_cd', 'Cosmos Fell CRIT DMG', [{ stat: 'critDmg', value: 0.20 + 0.05 * (si - 1) }], 2))
    },
  },
  {
    // Trick stacks on debuff-inflict (DMG, max 3, 1 turn); EHR>=80% -> ATK (cond)
    id: 'showtime', name: "It's Showtime", rarity: 4, path: 'Nihility',
    hp: 1058, atk: 476, def: 264,
    mods: si => [{ stat: 'ehr', value: 0.10 + 0.02 * (si - 1) }],
    cond: { stat: 'ehr', gte: () => 0.8, mods: si => [{ stat: 'atkPct', value: 0.20 + 0.04 * (si - 1) }] },
    onDebuffInflict: (sim, u, _t, si) => sim.addBuff(u, gearBuff('showtime_trick', 'Trick', [{ stat: 'dmgAll', value: 0.06 + 0.01 * (si - 1) }], 1, 3)),
  },
  {
    // Concert for Two: DEF+16/32% + per on-field shielded char → wearer DMG+4/8%
    id: 'concert_two', name: 'Concert for Two', rarity: 4, path: 'Preservation',
    hp: 952, atk: 370, def: 463,
    mods: si => [{ stat: 'defPct', value: 0.16 + 0.04 * (si - 1) }],
    hitMods: (sim, u, _t, _type, si) => {
      const n = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead && a.buffs.some(b => (b.shield ?? 0) > 0)).length
      return n > 0 ? [{ stat: 'dmgAll', value: n * (0.04 + 0.01 * (si - 1)) }] : []
    },
  },
  {
    // real: CRIT DMG vs slowed/DEF-reduced enemies — target-debuff gate via hitMods below
    id: 'boundless_choreo', name: 'Boundless Choreo', rarity: 4, path: 'Nihility',
    hp: 952, atk: 476, def: 330,
    mods: si => [{ stat: 'critRate', value: 0.08 + 0.02 * (si - 1) }],
    hitMods: (_s, _u, target, _type, si) => ((target.buffs.some(b => b.mods.some(m => m.stat === 'spdDown' || m.stat === 'defRed')) || target.dots.some(d => d.kind === 'Imprisonment')) ? [{ stat: 'critDmg', value: 0.24 + 0.06 * (si - 1) }] : []),
  },
  {
    id: 'charmony_fall', name: 'After the Charmony Fall', rarity: 4, path: 'Erudition',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'be', value: 0.28 + 0.07 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('charmony_spd', 'Charmony SPD', [{ stat: 'spdPct', value: 0.08 + 0.02 * (si - 1) }], 2)),
  },
  {
    // real: entering battle, ≥2 chars of a same Path → those chars CRIT DMG + (non-stacking)
    id: 'poised_bloom', name: 'Poised to Bloom', rarity: 4, path: 'Harmony',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onStart: (sim, u, si) => {
      const cnt = new Map<string, Unit[]>()
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead || !a.base.path) continue
        const arr = cnt.get(a.base.path) ?? []
        arr.push(a)
        cnt.set(a.base.path, arr)
      }
      for (const group of cnt.values()) {
        if (group.length >= 2) for (const a of group)
          sim.addBuff(a, gearBuff('poised_cd', 'Poised to Bloom CRIT DMG', [{ stat: 'critDmg', value: 0.16 + 0.04 * (si - 1) }], Infinity))
      }
    },
  },
  {
    id: 'shadowed_night', name: 'Shadowed by Night', rarity: 4, path: 'Hunt',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'be', value: 0.28 + 0.07 * (si - 1) }],
    onStart: (sim, u, si) => sim.addBuff(u, gearBuff('shadow_spd', 'Shadowed SPD', [{ stat: 'spdPct', value: 0.08 + 0.01 * (si - 1) }], 2)),
    onAfterBreak: (sim, u, _t, si) => sim.addBuff(u, gearBuff('shadow_spd2', 'Shadowed SPD', [{ stat: 'spdPct', value: 0.08 + 0.01 * (si - 1) }], 2)),
  },
  {
    id: 'dream_montage', name: "Dream's Montage", rarity: 4, path: 'Abundance',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'spdPct', value: 0.08 + 0.01 * (si - 1) }],
    onAfterAttack: (sim, u, t, _dt, si) => {
      if (!t || t.dead || !t.broken) return
      const rt = sim.rt(u)
      const c = (rt['dmCount'] as number ?? 0) + 1
      if (c > 2) return
      rt['dmCount'] = c
      sim.gainEnergyFlat(u, 3 + 0.5 * (si - 1))
      sim.log(`${u.name} Dream's Montage: broken-enemy energy`)
    },
    onTurnStart: (sim, u) => { sim.rt(u)['dmCount'] = 0 },
  },
  {
    id: 'journey_peaceful', name: 'Journey, Forever Peaceful', rarity: 4, path: 'Preservation',
    hp: 1058, atk: 370, def: 529,
    mods: si => [{ stat: 'atkPct', value: 0.12 + 0.03 * (si - 1) }, { stat: 'mitigation', value: 0.12 + 0.02 * (si - 1) }],
  },
  {
    id: 'story_page', name: "The Story's Next Page", rarity: 4, path: 'Remembrance',
    hp: 1058, atk: 370, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.16 + 0.04 * (si - 1) }],
    onAllyAttack: (sim, u, attacker, _target, _dmgType, si) => {
      if (attacker.kind === 'summon' && sim.rt(attacker).ownerId === u.id) {
        const ohb = 0.12 + 0.03 * (si - 1)
        sim.addBuff(u, gearBuff('story_ohb', 'Story OHB', [{ stat: 'outHeal', value: ohb }], 1))
        sim.addBuff(attacker, gearBuff('story_ohb', 'Story OHB', [{ stat: 'outHeal', value: ohb }], 1))
      }
    },
  },
  {
    id: 'morrow', name: "Unto Tomorrow's Morrow", rarity: 4, path: 'Abundance',
    hp: 1058, atk: 476, def: 397,
    mods: si => [{ stat: 'outHeal', value: 0.12 + 0.03 * (si - 1) }],
    hitMods: (sim, u, _t, _type, si) => {
      const anyHigh = sim.allies(u.side).some(a => a.kind !== 'enemy' && !a.dead && a.hp / a.maxHp >= 0.5)
      return anyHigh ? [{ stat: 'dmgAll', value: 0.12 + 0.02 * (si - 1) }] : []
    },
  },
  {
    id: 'pursuit_wind', name: 'In Pursuit of the Wind', rarity: 4, path: 'Harmony',
    hp: 1058, atk: 476, def: 397,
    mods: si => [{ stat: 'spdPct', value: 0.16 + 0.02 * (si - 1) }],
  },
  {
    id: 'wheat', name: 'A Dream Scented in Wheat', rarity: 4, path: 'Erudition',
    hp: 952, atk: 529, def: 397,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }, { stat: 'boost:ult', value: 0.24 + 0.06 * (si - 1) }, { stat: 'boost:fua', value: 0.24 + 0.06 * (si - 1) }],
  },
  {
    id: 'thermae', name: 'Holiday Thermae Escapade', rarity: 4, path: 'Nihility',
    hp: 1058, atk: 529, def: 330,
    mods: si => [{ stat: 'boost:dot', value: 0.16 + 0.04 * (si - 1) }, { stat: 'dmgAll', value: 0.10 + 0.015 * (si - 1) }],
  },
  {
    id: 'see_you', name: 'See You at the End', rarity: 4, path: 'Hunt',
    hp: 952, atk: 529, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.24 + 0.04 * (si - 1) }, { stat: 'boost:skill', value: 0.24 + 0.04 * (si - 1) }, { stat: 'boost:fua', value: 0.24 + 0.04 * (si - 1) }],
  },
  {
    // real: wearer Elation Skill → all enemies Elation-DMG taken + (2t)
    id: 'mushy_shroomy', name: "Mushy Shroomy's Adventures", rarity: 4, path: 'Elation',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'elation', value: 0.12 + 0.02 * (si - 1) }],
    onElationSkill: (sim, u, si) => gearEnemies(sim, u, 'shroomy_vuln', 'Mushy Shroomy Elation taken', [{ stat: 'vulnElation', value: 0.06 + 0.01 * (si - 1) }], 2),
  },
  {
    id: 'little_getaway', name: 'A Little Getaway', rarity: 4, path: 'Elation',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'elation', value: 0.20 + 0.05 * (si - 1) }, { stat: 'dmgAll', value: 0.08 + 0.02 * (si - 1) }],
  },

  // ---- 2.3+ / 3.x cones (verified verbatim against hsr-data/lightcones.json) ----
  {
    // Trend of the Universal Market: hit → 100% base chance to Burn the attacker; DoT = wearer DEF% for 2 turns
    id: 'trend_universal_market', name: 'Trend of the Universal Market', rarity: 4, path: 'Preservation',
    hp: 1058, atk: 370, def: 397,
    mods: si => [{ stat: 'defPct', value: 0.16 + 0.04 * (si - 1) }],
    onHitTaken: (sim, u, si, attacker) => {
      if (!attacker || attacker.side === 'ally' || attacker.dead) return
      const dmg = Math.floor(eff(u).def * (0.4 + 0.1 * (si - 1)))
      sim.applyDebuff(u, attacker, 1.0, () => {
        const ex = attacker.dots.find(d => d.kind === 'Burn')
        if (ex) { ex.baseDmg = Math.max(ex.baseDmg ?? 0, dmg); (ex as DoT & { sourceUnit?: Unit }).sourceUnit = u }
        else sim.applyDot(attacker, { kind: 'Burn', elem: 'Fire', turns: 2, baseDmg: dmg, sourceUnit: u } as DoT & { sourceUnit?: Unit })
      }, 'Trend Burn', 'Burn')
    },
  },
  {
    id: 'hey_over_here', name: 'Hey, Over Here', rarity: 4, path: 'Abundance',
    hp: 952, atk: 423, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.08 + 0.01 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => sim.addBuff(u, gearBuff('hey_heal', 'Hey Over Here OHB', [{ stat: 'outHeal', value: 0.16 + 0.03 * (si - 1) }], 2)),
  },
  {
    id: 'for_tomorrow_journey', name: "For Tomorrow's Journey", rarity: 4, path: 'Harmony',
    hp: 952, atk: 476, def: 331,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('tomorrow_dmg', 'For Tomorrow DMG+', [{ stat: 'dmgAll', value: 0.18 + 0.03 * (si - 1) }], 1)),
  },
  {
    // HP-change CRIT DMG: on wearer HP loss OR heal → CD+18% 2 turns, once per turn (reset onTurnStart)
    id: 'ninja_record', name: 'Ninja Record: Sound Hunt', rarity: 4, path: 'Destruction',
    hp: 1058, atk: 476, def: 264,
    mods: si => [{ stat: 'hpPct', value: 0.12 + 0.03 * (si - 1) }],
    onTurnStart: (sim, u) => { sim.rt(u).ninjaTick = 0 },
    onAllyHpLoss: (sim, u, target, _amt, si) => { if (target === u) ninjaCd(sim, u, si) },
    onAllyHeal: (sim, u, target, _amt, si) => { if (target === u) ninjaCd(sim, u, si) },
  },
  {
    id: 'great_cosmic', name: 'The Great Cosmic Enterprise', rarity: 4, path: 'Erudition',
    hp: 952, atk: 476, def: 331,
    mods: si => [{ stat: 'atkPct', value: 0.08 + 0.02 * (si - 1) }],
    hitMods: (_sim, _u, target, _type, si) => [{ stat: 'dmgAll', value: Math.min(7, target.weaknesses.length) * (0.04 + 0.01 * (si - 1)) }],
  },
  {
    id: 'forever_victual', name: 'The Forever Victual', rarity: 4, path: 'Harmony',
    hp: 952, atk: 476, def: 331,
    mods: si => [{ stat: 'atkPct', value: 0.16 + 0.04 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => sim.addBuff(u, gearBuff('victual_atk', 'Forever Victual ATK+', [{ stat: 'atkPct', value: 0.08 + 0.02 * (si - 1) }], 99, 3)),
  },
  {
    // gated: only TB(Remembrance) gets party dmgAll + Enhanced Basic boost
    id: 'fly_pink_tomorrow', name: 'Fly Into a Pink Tomorrow', rarity: 4, path: 'Remembrance',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'critDmg', value: 0.12 + 0.03 * (si - 1) }],
    onStart: (sim, u, si) => {
      if (u.kitId === 'trailblazer_remembrance') gearParty(sim, u, 'pink_dmg', 'Pink Tomorrow ally DMG+', [{ stat: 'dmgAll', value: 0.08 + 0.02 * (si - 1) }], Infinity)
    },
    hitMods: (_sim, u, _target, type, si) =>
      u.kitId === 'trailblazer_remembrance' && type === 'basic' ? [{ stat: 'boost:basic', value: 0.60 + 0.10 * (si - 1) }] : [],
  },
  {
    id: 'tomorrow_together', name: 'Tomorrow, Together', rarity: 4, path: 'Elation',
    hp: 952, atk: 476, def: 331,
    mods: si => [{ stat: 'critDmg', value: 0.12 + 0.03 * (si - 1) }],
    onAfterUlt: (sim, u, si) => gearParty(sim, u, 'tom_together', 'Tomorrow Together Elation+', [{ stat: 'elation', value: 0.08 + 0.01 * (si - 1) }], 1),
  },
  {
    id: 'race_horizon', name: 'Race to the Horizon', rarity: 4, path: 'Hunt',
    hp: 846, atk: 476, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.12 + 0.03 * (si - 1) }],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType === 'fua') sim.addBuff(u, gearBuff('race_cd', 'Race CRIT DMG+', [{ stat: 'critDmg', value: 0.03 + 0.005 * (si - 1) }], 2, 10))
    },
  },
  {
    // Something Irreplaceable: ATK% static; kill OR hit → heal 8-12% ATK AND DMG+24-40% until end of wearer's
    // next turn (1 turn buff, decremented at own endTick), non-stacking, once per battleTurn.
    id: 'something_irreplaceable', name: 'Something Irreplaceable', rarity: 5, path: 'Destruction',
    hp: 1164, atk: 582, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.24 + 0.04 * (si - 1) }],
    onKill: (sim, u, _v, si) => irrTrigger(sim, u, si, 'on defeat'),
    onHitTaken: (sim, u, si) => irrTrigger(sim, u, si, 'on hit'),
  },
  {
    id: 'brighter_sun', name: 'Brighter Than the Sun', rarity: 5, path: 'Destruction',
    hp: 1058, atk: 635, def: 397,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }],
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType === 'basic') sim.addBuff(u, gearBuff('dragons_call', 'Dragon\'s Call', [{ stat: 'atkPct', value: 0.18 + 0.03 * (si - 1) }, { stat: 'err', value: 0.06 + 0.01 * (si - 1) }], 2, 2))
    },
  },
  {
    id: 'instant_before_gaze', name: 'An Instant Before A Gaze', rarity: 5, path: 'Erudition',
    hp: 1058, atk: 582, def: 463,
    mods: (si, ctx) => [{ stat: 'critDmg', value: 0.36 + 0.06 * (si - 1) },
                        { stat: 'boost:ult', value: Math.min(180, ctx?.energyMax ?? 0) * (0.0036 + 0.0006 * (si - 1)) }],
  },
  {
    id: 'past_self_mirror', name: 'Past Self in Mirror', rarity: 5, path: 'Harmony',
    hp: 1058, atk: 529, def: 529,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    onStart: (sim, u, si) => gearParty(sim, u, 'past_mirror_energy', 'Past Self wave energy', [], Infinity, (a) => sim.gainEnergyFlat(a, 10 + 2.5 * (si - 1))),
    onAfterUlt: (sim, u, si) => {
      gearParty(sim, u, 'past_mirror_dmg', 'Past Self ally DMG+', [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }], 3)
      if (eff(u).be >= 1.5) sim.gainSp(1)
    },
  },
  {
    id: 'baptism_pure_thought', name: 'Baptism of Pure Thought', rarity: 5, path: 'Hunt',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'critDmg', value: 0.20 + 0.03 * (si - 1) }],
    hitMods: (sim, u, target, type, si) => {
      const per = 0.08 + 0.01 * (si - 1)
      const out: Mod[] = [{ stat: 'critDmg', value: Math.min(3, target.buffs.filter(b => b.debuff).length) * per }]
      if (type === 'fua' && sim.hasBuff(u, 'disputation')) out.push({ stat: 'defIgnore', value: 0.24 + 0.04 * (si - 1) })
      return out
    },
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('disputation', 'Disputation', [{ stat: 'dmgAll', value: 0.36 + 0.06 * (si - 1) }], 2)),
  },
  {
    id: 'flowing_nightglow', name: 'Flowing Nightglow', rarity: 5, path: 'Harmony',
    hp: 952, atk: 635, def: 463,
    mods: () => [],
    onAllyAttack: (sim, u, _a, _t, _d, si) => sim.addBuff(u, gearBuff('cantillation', 'Cantillation', [{ stat: 'err', value: 0.03 + 0.005 * (si - 1) }], Infinity, 5)),
    onAfterUlt: (sim, u, si) => {
      sim.removeBuff(u, 'cantillation')
      sim.addBuff(u, gearBuff('cadenza_atk', 'Cadenza ATK+', [{ stat: 'atkPct', value: 0.48 + 0.12 * (si - 1) }], 1))
      gearParty(sim, u, 'cadenza_dmg', 'Cadenza ally DMG+', [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }], 1)
    },
  },
  {
    // Sailing Second Life: BE +60/100%, DEF-ignore 20/32% on Break DMG only, SPD +12/20% if BE≥150%
    id: 'sailing_second_life', name: 'Sailing Towards a Second Life', rarity: 5, path: 'Hunt',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    cond: { stat: 'be', gte: () => 1.5, mods: si => [{ stat: 'spdPct', value: 0.12 + 0.02 * (si - 1) }] },
    hitMods: (_sim, _u, _t, type, si) => type === 'break' ? [{ stat: 'defIgnore', value: 0.20 + 0.03 * (si - 1) }] : [],
  },
  {
    // FUA boost: (critDmg - 1.2) / 0.2 stacks, max 4; Ult/FUA DEF-ignore gated by hope_defignore buff (2 turns)
    id: 'yet_hope_priceless', name: 'Yet Hope Is Priceless', rarity: 5, path: 'Erudition',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'critRate', value: 0.16 + 0.03 * (si - 1) }],
    hitMods: (sim, u, _t, type, si) => {
      const per = 0.12 + 0.02 * (si - 1)
      const cd = eff(u).critDmg
      const stacks = Math.min(4, Math.max(0, Math.floor((cd - 1.2) / 0.2)))
      const out: Mod[] = []
      if (type === 'fua' && stacks > 0) out.push({ stat: 'boost:fua', value: stacks * per })
      if ((type === 'fua' || type === 'ult') && sim.hasBuff(u, 'hope_defignore'))
        out.push({ stat: 'defIgnore', value: 0.20 + 0.04 * (si - 1) })
      return out
    },
    onStart: (sim, u, si) => sim.addBuff(u, gearBuff('hope_defignore', 'Yet Hope DEF-ignore', [{ stat: 'defIgnore', value: 0.20 + 0.04 * (si - 1) }], 2)),
    onAfterAttack: (sim, u, _t, dmgType, si) => {
      if (dmgType === 'basic') sim.addBuff(u, gearBuff('hope_defignore', 'Yet Hope DEF-ignore', [{ stat: 'defIgnore', value: 0.20 + 0.04 * (si - 1) }], 2))
    },
  },
  {
    id: 'many_springs', name: 'Those Many Springs', rarity: 5, path: 'Nihility',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'ehr', value: 0.60 + 0.10 * (si - 1) }],
    onAfterAttack: (sim, u, target, _dmgType, si) => {
      if (!target) return
      const base = 0.10 + 0.02 * (si - 1)
      const extra = target.dots.length > 0 ? 0.14 + 0.02 * (si - 1) : 0
      sim.addBuff(target, gearBuff('unarmored', 'Unarmored', [{ stat: 'vulnAll', value: base + extra }], 2))
    },
  },
  {
    id: 'dance_sunset', name: 'Dance at Sunset', rarity: 5, path: 'Destruction',
    hp: 1058, atk: 582, def: 463,
    mods: si => [{ stat: 'critDmg', value: 0.36 + 0.06 * (si - 1) }, { stat: 'aggro', value: 200 }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('firedance', 'Firedance', [{ stat: 'boost:fua', value: 0.36 + 0.06 * (si - 1) }], 2, 2)),
  },
  {
    // I Venture Forth to Hunt: wearer FUA (incl. via own memosprite) → +1 Luminflux (max 2); each stack lets Ult ignore DEF%; −1 stack at turn end
    id: 'venture_forth_hunt', name: 'I Venture Forth to Hunt', rarity: 5, path: 'Hunt',
    hp: 952, atk: 635, def: 463,
    mods: si => [{ stat: 'critRate', value: 0.15 + 0.025 * (si - 1) }],
    onAllyAttack: (sim, u, attacker, _t, dmgType, si) => {
      if (dmgType !== 'fua') return
      const mine = attacker === u || (attacker.kind === 'summon' && sim.rt(attacker)['ownerId'] === u.id)
      if (!mine) return
      const rt = sim.rt(u)
      rt['luminflux'] = Math.min(2, ((rt['luminflux'] as number) ?? 0) + 1)
      sim.log(`${u.name} Luminflux ×${rt['luminflux']}`)
    },
    hitMods: (sim, u, _t, type, si) => type === 'ult'
      ? [{ stat: 'defIgnore', value: ((sim.rt(u)['luminflux'] as number) ?? 0) * (0.27 + 0.03 * (si - 1)) }]
      : [],
    onTurnEnd: (sim, u) => {
      const rt = sim.rt(u)
      rt['luminflux'] = Math.max(0, ((rt['luminflux'] as number) ?? 0) - 1)
    },
  },
  {
    id: 'scent_alone', name: 'Scent Alone Stays True', rarity: 5, path: 'Abundance',
    hp: 1058, atk: 529, def: 529,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    onAfterUlt: (_sim, u, si) => {
      const base = 0.10 + 0.02 * (si - 1)
      const extra = eff(u).be >= 1.5 ? 0.08 + 0.02 * (si - 1) : 0
      gearEnemies(_sim, u, 'woefree', 'Woefree', [{ stat: 'vulnAll', value: base + extra }], 2)
    },
  },
  {
    id: 'ninjutsu_inscription', name: 'Ninjutsu Inscription: Dazzling Evilbreaker', rarity: 5, path: 'Erudition',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'be', value: 0.60 + 0.10 * (si - 1) }],
    onStart: (sim, u, si) => sim.gainEnergyFlat(u, 30 + 2.5 * (si - 1)),
    onAfterUlt: (sim, u, _si) => { const rt = sim.rt(u); rt.raiton = true; rt.raitonBasics = 0 },
    onAfterAttack: (sim, u, _t, dmgType, _si) => {
      if (dmgType !== 'basic') return
      const rt = sim.rt(u)
      if (!rt.raiton) return
      rt.raitonBasics = ((rt.raitonBasics as number) ?? 0) + 1
      if ((rt.raitonBasics as number) >= 2) { sim.advance(u, 0.5); rt.raiton = false; sim.log(`${u.name} Raiton 2-Basic advance 50%`) }
    },
  },
  {
    id: 'unreachable_veil', name: 'Into the Unreachable Veil', rarity: 5, path: 'Erudition',
    hp: 952, atk: 635, def: 463,
    mods: si => [{ stat: 'critRate', value: 0.12 + 0.02 * (si - 1) }],
    onAfterUlt: (sim, u, si) => {
      sim.addBuff(u, gearBuff('veil_boost', 'Veil Skill/Ult+', [{ stat: 'boost:skill', value: 0.60 + 0.10 * (si - 1) }, { stat: 'boost:ult', value: 0.60 + 0.10 * (si - 1) }], 3))
      if (u.maxEnergy >= 140) sim.gainSp(1)
    },
  },
  {
    id: 'life_flames', name: 'Life Should Be Cast to Flames', rarity: 5, path: 'Erudition',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'dmgAll', value: 0.60 + 0.10 * (si - 1) }],
    onTurnStart: (sim, u) => sim.gainEnergyFlat(u, 10),
    onAfterAttack: (sim, u, target, _dmgType, si) => {
      if (!target) return
      sim.addBuff(target, gearBuff('flames_def', 'Life Flames DEF-', [{ stat: 'defRed', value: 0.12 + 0.03 * (si - 1) }], 2))
    },
  },
  {
    id: 'thankless_coronation', name: 'A Thankless Coronation', rarity: 5, path: 'Destruction',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'critDmg', value: 0.36 + 0.09 * (si - 1) }],
    onAfterUlt: (sim, u, si) => {
      const v = 0.40 + 0.10 * (si - 1)
      const extra = u.maxEnergy >= 300 ? v : 0
      sim.addBuff(u, gearBuff('coronation_atk', 'Coronation ATK+', [{ stat: 'atkPct', value: v + extra }], 2))
      if (u.maxEnergy >= 300) sim.gainEnergyFlat(u, 0.10 * u.maxEnergy)
    },
  },
  {
    id: 'hell_ideals_burn', name: 'The Hell Where Ideals Burn', rarity: 5, path: 'Hunt',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'critRate', value: 0.16 + 0.04 * (si - 1) }],
    onWaveStart: (sim, u, si) => {
      if ((sim as unknown as { wave: number }).wave === 1 && (sim as unknown as { maxSp: number }).maxSp >= 6)
        sim.addBuff(u, gearBuff('ideals_limit', 'Ideals SP-limit ATK', [{ stat: 'atkPct', value: 0.40 + 0.10 * (si - 1) }], Infinity))
    },
    onAfterSkill: (sim, u, _t, si) => sim.addBuff(u, gearBuff('ideals_atk', 'Ideals ATK+', [{ stat: 'atkPct', value: 0.10 + 0.025 * (si - 1) }], 99, 4)),
  },
  {
    // Enthrallment: gear debuff → target enters Enthrallment (3t); each wearer-debuff on that target
    // → +5%(+1.25%(SI-1)) DoT-taken stack (max 6); ally attacking an Enthralled target → +10%(+2.5%(SI-1))
    // SPD 3t. 80% base chance rolled vs EHR/effRES (same formula as applyDebuff).
    // Knock-down removal of Enthrallment modeled via onUnitDeath (wearer defeated).
    id: 'ocean_sing', name: 'Why Does the Ocean Sing', rarity: 5, path: 'Nihility',
    hp: 952, atk: 635, def: 463,
    mods: si => [{ stat: 'ehr', value: 0.40 + 0.05 * (si - 1) }],
    onDebuffInflict: (sim, u, target, si) => {
      const rt = sim.rt(u) as { oceanC?: Record<string, number> }
      // 80% base chance to enter Enthrallment per wearer-debuff (EHR vs effRes resolved), same formula as applyDebuff
      const ehr = (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr')
      const res = effectResOf(target)
      const chance = Math.min(1, Math.max(0, 0.8 * (1 + ehr) * (1 - res)))
      if (sim.rng() >= chance) {
        sim.log(`${target.name} RESISTS Ocean Sing Enthrallment (${Math.round(chance * 100)}% chance)`)
        return
      }
      rt.oceanC ??= {}
      const c = Math.min(6, (rt.oceanC[target.id] ?? 0) + 1)
      rt.oceanC[target.id] = c
      const v = c * (0.05 + 0.0125 * (si - 1))
      sim.removeBuff(target, 'ocean_enthrall')
      sim.addBuff(target, gearBuff('ocean_enthrall', 'Enthrallment', [{ stat: 'dotVuln', value: v }], 3))
      sim.log(`${u.name} Ocean Sing: Enthrallment ${c}/6 on ${target.name}, DoT taken ${(v * 100).toFixed(1)}%`)
    },
    onAllyAttack: (sim, u, attacker, target, _type, si) => {
      if (!sim.hasBuff(target, 'ocean_enthrall')) return
      sim.addBuff(attacker, gearBuff('ocean_spd', 'Ocean Solo SPD', [{ stat: 'spdPct', value: 0.10 + 0.025 * (si - 1) }], 3))
      sim.log(`${attacker.name} Ocean Sing: SPD+ on attacking Enthralled ${target.name}`)
    },
    onUnitDeath: (sim, u, si) => {
      for (const e of sim.livingEnemiesOf(u)) {
        sim.removeBuff(e, 'ocean_enthrall')
      }
      sim.log(`${u.name} Ocean Sing: Enthrallment removed (wearer defeated)`)
    },
  },
  {
    // Noctis (memosprite-ability-gated all-ally-memosprite DEF-ignore) flattened always-on — memosprite acts every cycle;
    // disappears-energy real (onMemospriteDisappear, 8+2(SI-1) Energy)
    id: 'evernight_stars', name: "To Evernight's Stars", rarity: 5, path: 'Remembrance',
    hp: 1164, atk: 529, def: 463,
    mods: si => [{ stat: 'hpPct', value: 0.30 + 0.075 * (si - 1) }, { stat: 'dmgAll', value: 0.30 + 0.075 * (si - 1) }],
    onStart: (sim, u, si) => gearEnemies(sim, u, 'evernight_def', 'Evernight DEF-ignore', [{ stat: 'defIgnore', value: 0.20 + 0.025 * (si - 1) }], Infinity),
    onMemospriteDisappear: (sim, u, si) => { sim.gainEnergyFlat(u, 8 + 2 * (si - 1)); sim.log(`${u.name} Evernight's Stars: memosprite disappeared → +energy`) },
  },
  {
    // Immolation: BE to self; entering combat → Break DMG+32%+10%(si-1) to self AND the teammate with highest
    // Break Effect (or the combat-triggering teammate). non-stackable.
    // weakness-apply SP gain: +1 SP once per turn (reset on wearer's Ult) — real via sim.applyWeakness + onWeaknessApply
    id: 'never_forget_her_flame', name: 'Never Forget Her Flame', rarity: 5, path: 'Nihility',
    hp: 1164, atk: 529, def: 463,
    mods: si => [{ stat: 'be', value: 0.60 + 0.15 * (si - 1) }],
    onWeaknessApply: (sim, u, _source, target) => {
      if (sim.rt(u).nffSp) return
      sim.rt(u).nffSp = true
      sim.gainSp(1)
      sim.log(`${u.name} Never Forget Her Flame: weakness on ${target.name} → +1 Skill Point`)
    },
    onTurnStart: (sim, u) => { delete sim.rt(u).nffSp },
    onAfterUlt: (sim, u) => { delete sim.rt(u).nffSp },
    onStart: (sim, u, si) => {
      sim.addBuff(u, gearBuff('nff_break', 'Immolation', [{ stat: 'boost:break', value: 0.32 + 0.10 * (si - 1) }], Infinity))
      let best: Unit | undefined
      let bestBe = -1
      for (const a of sim.allies(u.side)) {
        if (a === u || a.dead) continue
        const be = eff(a).be
        if (be > bestBe) { bestBe = be; best = a }
      }
      if (best) sim.addBuff(best, gearBuff('nff_break', 'Immolation', [{ stat: 'boost:break', value: 0.32 + 0.10 * (si - 1) }], Infinity))
      sim.log(`${u.name} Never Forget Her Flame: Break+ on self${best ? ` and ${best.name}` : ''}`)
    },
  },
  {
    // 23052: memosprite uses Memosprite Skill on an ally → Blank (enemy vulnAll); on an enemy →
    // Verse (ally critDmg); when the memosprite has both → both +flags. Verse is keyed on the explicit
    // Memosprite-Skill tag (`HitOpts.memoSkill`). Blank still approximates via a summon-sourced heal:
    // the only memosprite Skill that targets an ally (TB-Rem "Lemme! Help You!") is a BUFF with no heal
    // event, so Blank has no exact signal yet (known gap). State permanent (no removal text).
    id: 'this_love_forever', name: 'This Love, Forever', rarity: 5, path: 'Remembrance',
    hp: 1270, atk: 476, def: 463,
    mods: si => [{ stat: 'spdPct', value: 0.18 + 0.03 * (si - 1) }],
    onAllyHeal: (sim, u, _target, _amt, si, src) => {
      if (!src || src.kind !== 'summon' || sim.rt(src).ownerId !== u.id) return
      sim.rt(u).loveBlank = true
      loveApply(sim, u, si)
    },
    onAllyAttack: (sim, u, attacker, target, _dmgType, si, memoSkill) => {
      if (!memoSkill || attacker.kind !== 'summon' || sim.rt(attacker).ownerId !== u.id) return
      if (target.side !== 'enemy') return
      sim.rt(u).loveVerse = true
      loveApply(sim, u, si)
    },
  },
  {
    // Great Fortune: 3 turns (not permanent), gained on wave start + when ult-ing an ally; wave-start +15 energy (flat, any SI)
    id: 'when_she_decided_to_see', name: 'When She Decided to See', rarity: 5, path: 'Elation',
    hp: 1058, atk: 529, def: 529,
    mods: si => [{ stat: 'spdPct', value: 0.18 + 0.03 * (si - 1) }, { stat: 'err', value: 0.12 + 0.02 * (si - 1) }],
    onWaveStart: (sim, u, si) => {
      gearParty(sim, u, 'great_fortune', 'Great Fortune',
        [{ stat: 'critRate', value: 0.10 + 0.01 * (si - 1) }, { stat: 'critDmg', value: 0.30 + 0.075 * (si - 1) }], 3)
      sim.gainEnergyFlat(u, 15)
      sim.log(`${u.name} When She Decided: wave energy +15, Great Fortune 3t`)
    },
    onAfterUlt: (sim, u, si) => {
      const t = sim.lastAbilityTarget
      if (typeof t === 'object' && t.kind === 'char' && t.side === u.side) {
        gearParty(sim, u, 'great_fortune', 'Great Fortune',
          [{ stat: 'critRate', value: 0.10 + 0.01 * (si - 1) }, { stat: 'critDmg', value: 0.30 + 0.075 * (si - 1) }], 3)
        sim.log(`${u.name} When She Decided: ult on ally → Great Fortune 3t`)
      }
    },
  },
  {
    // Umbra Devourer: battle start AND every 4th wearer FUA → "Umbra Devourer" 3 turns (ATK% + enemies take
    // more DMG), refreshed on each trigger (non-stacking refresh). Real FUA-count gate via onAllyAttack.
    id: 'finale_of_a_lie', name: 'The Finale of a Lie', rarity: 5, path: 'Hunt',
    hp: 846, atk: 635, def: 529,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }],
    onStart: (sim, u, si) => umbraApply(sim, u, si),
    onAllyAttack: (sim, u, attacker, _target, dmgType, si) => {
      const mine = attacker === u || (attacker.kind === 'summon' && sim.rt(attacker).ownerId === u.id)
      if (!mine || dmgType !== 'fua') return
      const rt = sim.rt(u) as { umbraFua?: number }
      rt.umbraFua = (rt.umbraFua ?? 0) + 1
      if ((rt.umbraFua as number) % 4 === 0) umbraApply(sim, u, si)
    },
  },
  {
    id: 'welcome_cosmic_city', name: 'Welcome to the Cosmic City', rarity: 5, path: 'Elation',
    hp: 1164, atk: 476, def: 529,
    mods: si => [{ stat: 'spdPct', value: 0.18 + 0.03 * (si - 1) }],
    hitMods: (_sim, _u, _t, type, si) => type === 'elation' ? [{ stat: 'defIgnore', value: 0.20 + 0.04 * (si - 1) }] : [],
    onAfterUlt: (sim, u, si) => sim.gainPunchline(20 + 5 * (si - 1)),
  },
  {
    id: 'until_flowers', name: 'Until the Flowers Bloom Again', rarity: 5, path: 'Elation',
    hp: 952, atk: 635, def: 463,
    mods: (si, ctx) => [{ stat: 'critDmg', value: 0.60 + 0.15 * (si - 1) },
                        { stat: 'err', value: (0.10 + 0.015 * (si - 1)) + Math.min(360, Math.max(0, (ctx?.energyMax ?? 0) - 120)) * 0.0003 }],
    onElationSkill: (sim, u, si) => gearEnemies(sim, u, 'flowers_vuln', 'Flowers vuln', [{ stat: 'vulnAll', value: 0.15 + 0.0375 * (si - 1) }], 2),
  },
  {
    // Purgatory: target takes +30% CRIT DMG (all types, 2t); weapon-specific +30% extra from the wearer
    // via hitMods → critDmgTaken lands on the target's transient buff (same as defIgnore lane).
    id: 'reforged_hellfire', name: 'Reforged in Hellfire', rarity: 5, path: 'Nihility',
    hp: 1375, atk: 423, def: 463,
    mods: si => [{ stat: 'hpPct', value: 0.30 + 0.075 * (si - 1) }],
    onTurnStart: (sim, u) => sim.gainEnergyFlat(u, 20),
    onAfterSkill: (sim, u, target, si) => {
      if (target && target.side !== u.side) {
        const v = 0.30 + 0.075 * (si - 1)
        const mods: Mod[] = (['basic', 'skill', 'ult', 'fua', 'add', 'elation'] as DmgType[]).map(t => ({ stat: `critDmgTaken:${t}` as StatKey, value: v }))
        sim.addBuff(target, gearBuff('purgatory', 'Purgatory', mods, 2))
        sim.log(`${u.name} Reforged in Hellfire: Purgatory on ${target.name} (+${(v * 100).toFixed(1)}% CRIT DMG taken, 2t)`)
      }
    },
    hitMods: (sim, u, target, type, si) => {
      if (target && !target.dead && target.side !== u.side && sim.hasBuff(target, 'purgatory') && type !== 'dot' && type !== 'break')
        return [{ stat: `critDmgTaken:${type}` as StatKey, value: 0.30 + 0.075 * (si - 1) }]
      return []
    },
  },
  {
    // First Wish: wearer uses Assist Skill (unmodeled in sim → wearer's Skill as proxy) → +6 EN + "Sail" 2t
    // (max 3). Each Sail stack = Assist Skill DMG+ 0.20+0.05(si-1) (boost:skill proxy). At 3 stacks each Sail
    // stack ALSO boosts Ultimate DMG (real hitMods ult gate). defIgnore base always-on.
    id: 'star_lights_night', name: 'A Star That Lights the Night', rarity: 5, path: 'Erudition',
    hp: 846, atk: 635, def: 529,
    hitMods: (sim, u, _t, type, si) => {
      const st = u.buffs.find(b => b.id === 'sail')?.stacks ?? 0
      if (type !== 'ult' || st < 3) return []
      sim.log(`${u.name} Star That Lights: Sail ${st}/3 → Ult DMG +${((0.20 + 0.05 * (si - 1)) * st * 100).toFixed(0)}%`)
      return [{ stat: 'boost:ult', value: (0.20 + 0.05 * (si - 1)) * st }]
    },
    mods: si => [{ stat: 'defIgnore', value: 0.32 + 0.04 * (si - 1) }],
    onAfterSkill: (sim, u, _t, si) => {
      sim.gainEnergyFlat(u, 6)
      sim.addBuff(u, gearBuff('sail', 'Sail', [{ stat: 'boost:skill', value: 0.20 + 0.05 * (si - 1) }], 2, 3))
      const st = u.buffs.find(b => b.id === 'sail')?.stacks ?? 1
      sim.log(`${u.name} Star That Lights: Assist Skill → +6 EN, Sail ${st}/3`)
    },
  },
  {
    // Radiant Crown: any ally spends >=4 SP in one turn -> all allies DEF-ignore + wearer Skill DMG (3 turns)
    id: 'flickering_stars', name: 'Flickering Stars', rarity: 5, path: 'Erudition',
    hp: 846, atk: 635, def: 529,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }],
    onTurnSpHigh: (sim, u, _sp, si) => {
      gearParty(sim, u, 'crown_def', 'Radiant Crown',
        [{ stat: 'defIgnore', value: 0.20 + 0.04 * (si - 1) }], 3)
      sim.addBuff(u, gearBuff('crown_skill', 'Radiant Crown Skill', [{ stat: 'boost:skill', value: 0.72 + 0.12 * (si - 1) }], 3))
      sim.log(`${u.name} Flickering Stars: ally spent >=4 SP -> Radiant Crown 3t`)
    },
  },
  {
    id: 'i_am_as_you_behold', name: 'I Am As You Behold', rarity: 5, path: 'Destruction',
    hp: 952, atk: 635, def: 463,
    mods: (si, ctx) => [{ stat: 'atkPct', value: 0.18 + 0.03 * (si - 1) }, { stat: 'err', value: 0.10 + 0.025 * (si - 1) },
                        { stat: 'boost:ult', value: Math.min(0.72 + 0.18 * (si - 1), (ctx?.energyMax ?? 0) * (0.002 + 0.0005 * (si - 1))) }],
    onStart: (sim, u, si) => gearParty(sim, u, 'kings_ent', "King's Entertainment", [{ stat: 'critDmg', value: 0.24 + 0.06 * (si - 1) }], Infinity),
  },
  {
    id: 'rise_and_sing', name: 'Rise and Sing', rarity: 5, path: 'Remembrance',
    hp: 1164, atk: 582, def: 397,
    mods: si => [{ stat: 'hpPct', value: 0.30 + 0.075 * (si - 1) }],
    onStart: (sim, u, si) => {
      sim.advance(u, 0.30 + 0.025 * (si - 1))
      gearParty(sim, u, 'new_melody', 'New Melody', [{ stat: 'spdPct', value: 0.20 + 0.05 * (si - 1) }], 2)
    },
    onAfterUlt: (sim) => sim.gainSp(1),
  },
  {
    // Real: each Elation Skill -> Updraft (SPD%, persistent wearer buff); if the used Elation Skill
    // differs from the last one -> also Uptrend (Elation%). Wave start + every 3rd Elation Skill -> +1 SP.
    id: 'summer_rides_surf', name: 'Summer Rides the Surf', rarity: 5, path: 'Elation',
    hp: 952, atk: 582, def: 529,
    mods: si => [{ stat: 'critRate', value: 0.18 + 0.03 * (si - 1) }],
    onWaveStart: (sim, u, si) => { sim.gainSp(1); sim.log(`${u.name} Summer Rides: wave-start +1 SP`) },
    onElationSkill: (sim, u, si, identity) => {
      const rt = sim.rt(u) as Record<string, unknown>
      sim.addBuff(u, gearBuff('summer_updraft', 'Summer Rides Updraft SPD', [{ stat: 'spdPct', value: 0.24 + 0.04 * (si - 1) }], Infinity))
      sim.log(`${u.name} Summer Rides: Elation Skill -> Updraft SPD%`)
      if (identity && identity !== rt.summerLastSkill) {
        sim.addBuff(u, gearBuff('summer_uptrend', 'Summer Rides Uptrend Elation', [{ stat: 'elation', value: 0.40 + 0.15 * (si - 1) }], Infinity))
        sim.log(`${u.name} Summer Rides: new Elation Skill (${identity}) -> Uptrend Elation%`)
      }
      rt.summerLastSkill = identity
      const c = ((rt.summerEnc as number) ?? 0) + 1
      rt.summerEnc = c
      if (c % 3 === 0) { sim.gainSp(1); sim.log(`${u.name} Summer Rides: 3rd Elation Skill -> +1 SP`) }
    },
  },
  {
    // energy rounds to int (data has .5 steps)
    id: 'solitary_healing', name: 'Solitary Healing', rarity: 5, path: 'Nihility',
    hp: 1058, atk: 529, def: 397,
    mods: si => [{ stat: 'be', value: 0.20 + 0.05 * (si - 1) }],
    onAfterUlt: (sim, u, si) => sim.addBuff(u, gearBuff('solitary_dot', 'Solitary DoT+', [{ stat: 'boost:dot', value: 0.24 + 0.06 * (si - 1) }], 2)),
    onKill: (sim, u, _victim, si) => sim.gainEnergyFlat(u, Math.round(4 + 0.5 * (si - 1))),
  },
  {
    id: 'eternal_calculus', name: 'Eternal Calculus', rarity: 5, path: 'Erudition',
    hp: 1058, atk: 529, def: 397,
    mods: si => [{ stat: 'atkPct', value: 0.08 + 0.02 * (si - 1) }],
    // ATK stacks per enemy hit (max 5, reset next attack); ≥3 targets → SPD+8% 1t
    // approximation: uses livingEnemiesOf count (correct for AoE; slightly high for Blast)
    onAfterAttack: (sim, u, _t, _dt, si) => {
      const n = Math.min(5, sim.livingEnemiesOf(u).length)
      if (n >= 3) sim.addBuff(u, gearBuff('ec_spd', 'Calculus SPD', [{ stat: 'spdPct', value: 0.08 + 0.02 * (si - 1) }], 1))
      sim.removeBuff(u, 'ec_atk')
      sim.addBuff(u, gearBuff('ec_atk', 'Calculus ATK', [{ stat: 'atkPct', value: n * (0.04 + 0.01 * (si - 1)) }], Infinity))
      sim.log(`${u.name} Eternal Calculus: +${n} ATK stacks`)
    },
  },
  {
    id: 'elation_brimming', name: 'Elation Brimming With Blessings', rarity: 5, path: 'Elation',
    hp: 952, atk: 529, def: 463,
    mods: si => [{ stat: 'atkPct', value: 0.20 + 0.05 * (si - 1) }],
    onAfterSkill: (sim, u, target, si) => {
      if (target && target.side === u.side && target.kind === 'char') sim.addBuff(target, gearBuff('brimming', 'Elation Brimming', [{ stat: 'elation', value: 0.12 + 0.03 * (si - 1) }], 2))
    },
    onAfterUlt: (sim, u, si) => {
      const t = sim.lastAbilityTarget
      if (typeof t === 'object' && t.kind === 'char' && t.side === u.side) sim.addBuff(t, gearBuff('brimming', 'Elation Brimming', [{ stat: 'elation', value: 0.12 + 0.03 * (si - 1) }], 2))
    },
  },
]

// ---------------------------------------------------------------- relic sets

export const RELIC_SETS: RelicSet[] = [
  // ---------- 1.x cavern ----------
  { id: 'passerby', name: 'Passerby of Wandering Cloud',
    twoPc: [{ stat: 'outHeal', value: 0.10 }],
    onStart: (sim) => { sim.gainSp(1); sim.log('Passerby grants +1 skill point') },
  },
  { id: 'musketeer', name: 'Musketeer of Wild Wheat',
    twoPc: [{ stat: 'atkPct', value: 0.12 }],
    fourPc: [{ stat: 'spdPct', value: 0.06 }, { stat: 'boost:basic', value: 0.10 }],
  },
  { id: 'knight', name: 'Knight of Purity Palace',
    twoPc: [{ stat: 'defPct', value: 0.15 }],
    // 4pc: shields created by the wearer absorb +20% DMG (shieldMult4 amplified in simulator.addBuff)
    shieldMult4: 0.20,
  },
  { id: 'hunter_glacial', name: 'Hunter of Glacial Forest',
    twoPc: [{ stat: 'dmg:Ice', value: 0.10 }],
    onAfterUlt: (sim, u) => sim.addBuff(u, gearBuff('glacial', 'Glacial Hunter', [{ stat: 'critDmg', value: 0.25 }], 2)),
  },
  { id: 'boxing', name: 'Champion of Streetwise Boxing',
    twoPc: [{ stat: 'dmg:Physical', value: 0.10 }],
    fourPc: [],
    // 4pc: each basic-ATK hit grants +5% ATK (max 5 stacks); idle-stack decay not modeled
    onAfterAttack: (sim, u, _t, dmgType) => {
      if (dmgType !== 'basic') return
      const rt = sim.rt(u)
      rt.boxingStacks = Math.min(5, ((rt.boxingStacks as number) ?? 0) + 1)
      sim.removeBuff(u, 'boxing')
      sim.addBuff(u, gearBuff('boxing', 'Boxing ATK', [{ stat: 'atkPct', value: 0.05 * (rt.boxingStacks as number) }], Infinity))
      sim.log(`${u.name} Boxing: ATK +${5 * (rt.boxingStacks as number)}%`)
    },
  },
  { id: 'guard', name: 'Guard of Wuthering Snow',
    twoPc: [{ stat: 'mitigation', value: 0.08 }],
    onTurnStart: (sim, u) => {
      if (u.hp / u.maxHp <= 0.50) {
        sim.heal(u, u.maxHp * 0.08)
        sim.gainEnergyFlat(u, 5)
        sim.log(`${u.name} (Guard) <50% HP: heals 8% max HP + 5 energy`)
      }
    },
  },
  { id: 'firesmith', name: 'Firesmith of Lava-Forging',
    twoPc: [{ stat: 'dmg:Fire', value: 0.10 }],
    fourPc: [{ stat: 'boost:skill', value: 0.12 }],
    // 4pc: after ult -> Fire DMG +12% for the next attack only (consumed on the attack)
    onAfterUlt: (sim, u) => { sim.removeBuff(u, 'firesmith'); sim.addBuff(u, gearBuff('firesmith', 'Firesmith Flame', [{ stat: 'dmg:Fire', value: 0.12 }], Infinity)) },
    onAfterAttack: (sim, u) => {
      if (sim.hasBuff(u, 'firesmith')) {
        sim.removeBuff(u, 'firesmith')
        sim.log(`${u.name} Firesmith Flame consumed: next attack Fire DMG +12%`)
      }
    },
  },
  { id: 'genius', name: 'Genius of Brilliant Stars',
    twoPc: [{ stat: 'dmg:Quantum', value: 0.10 }],
    onStart: (sim, u) => {
      // 10% DEF ignore (20% vs Quantum-weak) — target-side debuff, re-applied per target
      for (const e of sim.livingEnemiesOf(u)) {
        const v = e.weaknesses.includes('Quantum') ? 0.20 : 0.10
        sim.addBuff(e, gearBuff('genius_def', 'Genius DEF-ignore', [{ stat: 'defIgnore', value: v }], Infinity))
      }
    },
  },
  { id: 'sizzling', name: 'Band of Sizzling Thunder',
    twoPc: [{ stat: 'dmg:Lightning', value: 0.10 }],
    onAfterSkill: (sim, u) => sim.addBuff(u, gearBuff('sizzling', 'Sizzling Charge', [{ stat: 'atkPct', value: 0.20 }], 1)),
  },
  { id: 'eagle', name: 'Eagle of Twilight Line',
    twoPc: [{ stat: 'dmg:Wind', value: 0.10 }],
    onAfterUlt: (sim, u, outOfTurn) => {
      // wiki rule: ult-triggered Advance Forward only applies when cast outside the wearer's own turn
      if (!outOfTurn) return
      sim.advance(u, 0.25); sim.log(`Eagle of Twilight Line advances ${u.name} by 25%`)
    },
  },
  { id: 'thief', name: 'Thief of Shooting Meteor',
    twoPc: [{ stat: 'be', value: 0.16 }],
    fourPc: [{ stat: 'be', value: 0.16 }],
    onAfterBreak: (sim, u) => { sim.gainEnergyFlat(u, 3); sim.log(`${u.name} (Thief) +3 energy on break`) },
  },
  { id: 'wastelander', name: 'Wastelander of Banditry Desert',
    twoPc: [{ stat: 'dmg:Imaginary', value: 0.10 }],
    fourPc: [],
    // 4pc: +10% CR vs debuffed targets, +20% CD vs Imprisoned — per-hit conditionals
    hitMods: (_sim, _u, target) => {
      const deb = target.buffs.filter(isDebuff)
      if (!deb.length) return []
      const mods: Mod[] = [{ stat: 'critRate', value: 0.10 }]
      if (deb.some(b => b.id === 'welt_imprison') || target.dots.some(d => d.kind === 'Imprisonment'))
        mods.push({ stat: 'critDmg', value: 0.20 })
      return mods
    },
  },
  { id: 'longevous', name: 'Longevous Disciple',
    twoPc: [{ stat: 'hpPct', value: 0.12 }],
    // 4pc: hit or HP-consume -> CRIT Rate +8% for 2 turns, up to 2 stacks (consumes by allies/self not modeled)
    onHitTaken: (sim, u) => sim.addBuff(u, gearBuff('longevous', 'Longevous Disciple CR', [{ stat: 'critRate', value: 0.08 }], 2, 2)),
  },
  { id: 'messenger', name: 'Messenger Traversing Hackerspace',
    twoPc: [{ stat: 'spdPct', value: 0.06 }],
    // 4pc: ult used ON an ally -> whole team +12% SPD 1 turn (1 stack)
    onAfterUlt: (sim, u) => {
      if (sim.lastAbilityTarget === undefined) return
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('hackerspace', 'Hackerspace boost', [{ stat: 'spdPct', value: 0.12 }], 1))
    },
  },
  { id: 'grand_duke', name: 'The Ashblazing Grand Duke',
    twoPc: [{ stat: 'boost:fua', value: 0.20 }],
    fourPc: [],
    // 4pc: each FUA hit stacks +6% ATK (max 8); burns last 3 turns, 8/attack possible
    onAfterAttack: (sim, u, _t, dmgType) => {
      if (dmgType !== 'fua') return
      const rt = sim.rt(u)
      rt.dukeStacks = Math.min(8, ((rt.dukeStacks as number) ?? 0) + 1)
      sim.addBuff(u, gearBuff('duke_fire', 'Duke Fire', [{ stat: 'atkPct', value: 0.06 }], 3, 8))
      sim.log(`${u.name} Duke: ATK +${6 * (rt.dukeStacks as number)}%`)
    },
  },
  { id: 'prisoner', name: 'Prisoner in Deep Confinement',
    twoPc: [{ stat: 'atkPct', value: 0.12 }],
    // 4pc: DEF ignore 6% per DoT on target, max 3 — counted live at hit time
    hitMods: (_sim, _u, target) => {
      const n = Math.min(3, target.dots.length)
      return n ? [{ stat: 'defIgnore', value: 0.06 * n }] : []
    },
  },
  { id: 'pioneer', name: 'Pioneer Diver of Dead Waters',
    twoPc: [],
    fourPc: [{ stat: 'critRate', value: 0.04 }],
    // 2pc +12% DMG vs debuffed; 4pc +8/12% CRIT DMG by 2/3 debuffs — per-hit conditionals
    // 4pc keystone: "after the wearer inflicts a debuff, the set's effects double for 1 turn"
    hitMods: (_sim, _u, target) => {
      const n = target.buffs.filter(isDebuff).length
      const db = _sim.rt(_u).pioneerDouble as boolean
      const m = db ? 2 : 1
      const out: Mod[] = []
      if (n > 0) out.push({ stat: 'dmgAll', value: 0.12 * m })
      if (n >= 3) out.push({ stat: 'critDmg', value: 0.12 * m })
      else if (n >= 2) out.push({ stat: 'critDmg', value: 0.08 * m })
      return out
    },
    onDebuffInflict: (sim, u) => { sim.rt(u).pioneerDouble = true },
    onTurnStart: (sim, u) => { sim.rt(u).pioneerDouble = false },
  },
  { id: 'watchmaker', name: 'Watchmaker, Master of Dream Machinations',
    twoPc: [{ stat: 'be', value: 0.16 }],
    // 4pc: ult used ON an ally -> all allies' Break Effect +30% for 2 turns (1 stack)
    onAfterUlt: (sim, u) => {
      if (sim.lastAbilityTarget === undefined) return
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('watchmaker', 'Dream Machinations', [{ stat: 'be', value: 0.30 }], 2))
    },
  },
  { id: 'iron_cavalry', name: 'Iron Cavalry Against the Scourge',
    twoPc: [{ stat: 'be', value: 0.16 }],
    // 4pc: Break DMG ignores 10% DEF at BE>=150%; Super Break adds 15% more at BE>=250% — gated in simulator (ironCavPen), break-only
  },
{ id: 'valorous', name: 'The Wind-Soaring Valorous',
      twoPc: [{ stat: 'atkPct', value: 0.12 }],
      // 4pc: CRIT Rate +6% (always); after wearer's FUA -> Ultimate DMG +36% for 1 turn
      fourPc: [{ stat: 'critRate', value: 0.06 }],
      onAfterAttack: (sim, u, _t, dmgType) => {
        if (dmgType !== 'fua') return
        sim.addBuff(u, gearBuff('valorous', 'Valorous FUA', [{ stat: 'boost:ult', value: 0.36 }], 1))
      },
    },
  { id: 'sacerdos', name: "Sacerdos' Relived Ordeal",
    twoPc: [{ stat: 'spdPct', value: 0.06 }],
    // 4pc: skill/ult on ONE ally -> that target's CRIT DMG +18% (2 turns, max 2 stacks)
    onAfterSkill: (sim, u) => sacerdosApply(sim, u),
    onAfterUlt: (sim, u) => sacerdosApply(sim, u),
  },
  // ---------- 2.x cavern ----------
  { id: 'scholar', name: 'Scholar Lost in Erudition',
    twoPc: [{ stat: 'critRate', value: 0.08 }],
    fourPc: [{ stat: 'boost:skill', value: 0.20 }, { stat: 'boost:ult', value: 0.20 }],
    onAfterUlt: (sim, u) => sim.addBuff(u, gearBuff('scholar', 'Scholar Erudite', [{ stat: 'boost:skill', value: 0.25 }], 1)),
  },
  { id: 'hero', name: 'Hero of Triumphant Song',
    twoPc: [{ stat: 'atkPct', value: 0.12 }],
    // 4pc: memosprite on field -> wearer SPD+6%; memosprite attack -> +30% CRIT DMG (wearer+memosprite) 2 turns
    onStart: (sim, u) => heroApply(sim, u),
    onTurnStart: (sim, u) => {
      if (memospriteOnField(sim, u)) heroApply(sim, u)
      else sim.removeBuff(u, 'hero_spd')
    },
    onAllyAttack: (sim, u, attacker, _target, _dmgType) => {
      if (!memospriteOnField(sim, u) || attacker.kind !== 'summon' || sim.rt(attacker).ownerId !== u.id) return
      const gm = sim.units().find(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === u.id)
      sim.addBuff(u, gearBuff('hero_cd', 'Hero CRIT DMG', [{ stat: 'critDmg', value: 0.30 }], 2))
      if (gm) sim.addBuff(gm, gearBuff('hero_cd', 'Hero CRIT DMG', [{ stat: 'critDmg', value: 0.30 }], 2))
    },
  },
  // ---------- 3.x cavern ----------
  { id: 'poet', name: 'Poet of Mourning Collapse',
    twoPc: [{ stat: 'dmg:Quantum', value: 0.10 }],
    fourPc: [{ stat: 'spdPct', value: -0.08 }],
    postMods: f => f.spd < 95 ? [{ stat: 'critRate', value: 0.32 }] : f.spd < 110 ? [{ stat: 'critRate', value: 0.20 }] : [],
  },
  { id: 'warrior_goddess', name: 'Warrior Goddess of Sun and Thunder',
    twoPc: [{ stat: 'spdPct', value: 0.06 }],
    // 4pc: acting ally heals someone else -> Gentle Rain 2 turns (self SPD +6%, all allies' CRIT DMG +15%)
    onAllyHeal: (sim, u) => {
      sim.addBuff(u, gearBuff('goddess_spd', 'Gentle Rain SPD', [{ stat: 'spdPct', value: 0.06 }], 2))
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('goddess_cd', 'Gentle Rain CRIT DMG', [{ stat: 'critDmg', value: 0.15 }], 2))
    },
  },
  { id: 'wavestrider', name: 'Wavestrider Captain',
    twoPc: [{ stat: 'critDmg', value: 0.16 }],
    // 4pc: ally's ability targets wearer -> +1 "Help" (max 2); wearer ult at FULL 2 stacks consumes all -> ATK +48% 1 turn
    onAllyAbility: (sim, u) => { sim.rt(u).helpStacks = Math.min(2, ((sim.rt(u).helpStacks as number) ?? 0) + 1) },
    onAfterUlt: (sim, u) => {
      const n = (sim.rt(u).helpStacks as number) ?? 0
      if (n < 2) return
      sim.removeBuff(u, 'wavestrider')
      sim.addBuff(u, gearBuff('wavestrider', 'Help', [{ stat: 'atkPct', value: 0.48 }], 1))
      sim.rt(u).helpStacks = 0
    },
  },
  { id: 'world_remaking', name: 'World-Remaking Deliverer',
    twoPc: [{ stat: 'critRate', value: 0.08 }],
    // 4pc: wearer Basic/Skill with memosprite on field -> +24% MaxHP (wearer+memosprite) +15% ally DMG till next Basic/Skill
    onAfterSkill: (sim, u) => worldRemakeApply(sim, u),
    onAfterAttack: (sim, u, _t, dmgType) => { if (dmgType === 'basic') worldRemakeApply(sim, u) },
  },
  { id: 'self_enshrouded', name: 'Self-Enshrouded Recluse',
    twoPc: [],
    // 2pc: +10% Shield Effect; 4pc: +12% wearer Shield Effect + allies holding the wearer's shield get CRIT DMG +15% (CD applied in simulator.addBuff)
    shieldMult2: 0.10,
    shieldMult4: 0.12,
  },
  { id: 'magical_girl', name: 'Ever-Glorious Magical Girl',
    twoPc: [{ stat: 'critDmg', value: 0.16 }],
    // 4pc: Elation DMG ignores 10% DEF; +1% per 5 team Punchline (max 10 extra)
    hitMods: (sim, _u, _t, type) =>
      type === 'elation'
        ? [{ stat: 'defIgnore', value: 0.10 + Math.min(0.10, Math.floor((sim.punchlinePool() ?? 0) / 5) * 0.01) }]
        : [],
  },
  { id: 'diviner', name: 'Diviner of Distant Reach',
    twoPc: [{ stat: 'spdPct', value: 0.06 }],
    postMods: f => f.spd >= 160 ? [{ stat: 'critRate', value: 0.18 }] : f.spd >= 120 ? [{ stat: 'critRate', value: 0.10 }] : [],
    // 4pc: "1st Elation Skill per battle -> all allies Elation +10%" (once-per-battle team buff)
    onElationSkill: (sim, u) => {
      if (sim.rt(u).divinerDone) return
      sim.rt(u).divinerDone = true
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('diviner_e', 'Elation +10%', [{ stat: 'elation', value: 0.10 }], 99))
      sim.log(`${u.name} Diviner: first Elation Skill — all allies Elation +10%`)
    },
  },
  { id: 'navigator', name: 'As Navigator Isee Sees It',
    twoPc: [{ stat: 'atkPct', value: 0.12 }],
    // 4pc: enter-combat | Skill -> +1 stack; turn start | after ult -> -1 stack; +18% Skill/Ult DMG each (max 3)
    onStart: (sim, u) => { sim.rt(u).navStacks = 1; navApply(sim, u) },
    onAfterSkill: (sim, u) => { sim.rt(u).navStacks = Math.min(3, ((sim.rt(u).navStacks as number) ?? 1) + 1); navApply(sim, u) },
    onTurnStart: (sim, u) => { sim.rt(u).navStacks = Math.max(0, ((sim.rt(u).navStacks as number) ?? 1) - 1); navApply(sim, u) },
    onAfterUlt: (sim, u) => { sim.rt(u).navStacks = Math.max(0, ((sim.rt(u).navStacks as number) ?? 1) - 1); navApply(sim, u) },
  },
  { id: 'smith', name: 'Divine-Querying Master Smith',
    twoPc: [{ stat: 'hpPct', value: 0.12 }],
    fourPc: [],
    // 4pc: hitMods CD vs DEF-reduced targets; Comburent (allies DMG+15%, 2 turns, re-triggered on wearer inflicting new DEF-reduction)
    hitMods: (_sim, _u, target) =>
      target.buffs.some(b => b.mods.some(m => m.stat === 'defRed'))
        ? [{ stat: 'critDmg', value: 0.28 }]
        : [],
    onDefRedInflict: (sim, u) => {
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('smith_comb', 'Comburent', [{ stat: 'dmgAll', value: 0.15 }], 2))
    },
  },
]

// ---------------------------------------------------------------- planar sets

export const PLANAR_SETS: PlanarSet[] = [
  { id: 'sss', name: 'Space Sealing Station',
    mods: [{ stat: 'atkPct', value: 0.12 }],
    cond: { stat: 'spd', gte: 120, mods: [{ stat: 'atkPct', value: 0.12 }] },
  },
  { id: 'fleet', name: 'Fleet of the Ageless',
    mods: [{ stat: 'hpPct', value: 0.12 }],
    onStart: (sim, u) => {
      if (eff(u).spd < 120) return
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('fleet_atk', 'Ageless Fleet', [{ stat: 'atkPct', value: 0.08 }], Infinity))
    },
  },
  { id: 'salsotto', name: 'Inert Salsotto',
    mods: [{ stat: 'critRate', value: 0.08 }],
    cond: { stat: 'critRate', gte: 0.50, mods: [{ stat: 'boost:ult', value: 0.15 }, { stat: 'boost:fua', value: 0.15 }] },
  },
  { id: 'rutilant', name: 'Rutilant Arena',
    mods: [{ stat: 'critRate', value: 0.08 }],
    cond: { stat: 'critRate', gte: 0.70, mods: [{ stat: 'boost:basic', value: 0.20 }, { stat: 'boost:skill', value: 0.20 }] },
  },
  { id: 'talia', name: 'Talia- Kingdom of Banditry',
    mods: [{ stat: 'be', value: 0.16 }],
    cond: { stat: 'spd', gte: 145, mods: [{ stat: 'be', value: 0.20 }] },
  },
  { id: 'glamoth', name: 'Firmament Frontline- Glamoth',
    mods: [{ stat: 'atkPct', value: 0.12 }],
    postMods: f => f.spd >= 160 ? [{ stat: 'dmgAll', value: 0.18 }] : f.spd >= 135 ? [{ stat: 'dmgAll', value: 0.12 }] : [],
  },
  { id: 'broken_keel', name: 'Broken Keel',
    mods: [{ stat: 'effRes', value: 0.10 }],
    onStart: (sim, u) => {
      const totalEffRes = ((u.base as { effRes?: number }).effRes ?? 0) + buffSum(u.buffs, 'effRes')
      if (totalEffRes < 0.30) return
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('keel_cd', 'Unbroken Keel', [{ stat: 'critDmg', value: 0.10 }], Infinity))
    },
  },
  { id: 'vonwacq', name: 'Sprightly Vonwacq',
    mods: [{ stat: 'err', value: 0.05 }],
    onStart: (sim, u) => {
      if (eff(u).spd < 120) return
      sim.advance(u, 0.40); sim.log(`Vonwacq advances ${u.name} by 40%`)
    },
  },
  // ---------- 2.x planar ----------
  { id: 'pan_cosmic', name: 'Pan-Cosmic Commercial Enterprise',
    mods: [{ stat: 'ehr', value: 0.10 }],
    postMods: f => [{ stat: 'atkPct', value: Math.min(0.25, 0.25 * (f.ehr ?? 0)) }],
  },
  { id: 'belobog', name: 'Belobog of the Architects',
    mods: [{ stat: 'defPct', value: 0.15 }],
    cond: { stat: 'ehr', gte: 0.5, mods: [{ stat: 'defPct', value: 0.15 }] },
  },
  { id: 'celestial', name: 'Celestial Differentiator',
    mods: [{ stat: 'critDmg', value: 0.16 }],
    onStart: (sim, u) => {
      if (sim.effCritDmg(u) < 1.2) return
      sim.addBuff(u, gearBuff('celestial', 'Celestial Edge', [{ stat: 'critRate', value: 0.60 }], 1))
    },
  },
  { id: 'penacony', name: 'Penacony, Land of the Dreams',
    mods: [{ stat: 'err', value: 0.05 }],
    onStart: (sim, u) => {
      for (const a of sim.allies(u.side))
        if (a.kind === 'char' && a !== u && a.elem === u.elem)
          sim.addBuff(a, gearBuff('penacony', 'Land of Dreams', [{ stat: 'dmgAll', value: 0.10 }], Infinity))
    },
  },
  { id: 'sigonia', name: 'Sigonia, the Unclaimed Desolation',
    mods: [{ stat: 'critRate', value: 0.04 }],
    onKill: (sim, u) => {
      // enemy defeated -> +4% CRIT DMG stacking up to 10
      sim.addBuff(u, gearBuff('sigonia', 'Sigonia Trace', [{ stat: 'critDmg', value: 0.04 }], Infinity, 10))
    },
  },
  { id: 'izumo', name: 'Izumo Gensei and Takama Divine Realm',
    mods: [{ stat: 'atkPct', value: 0.12 }],
    // 2pc: +12% CRIT Rate when a teammate follows the wearer's Path (base.path filled for every kit)
    onStart: (sim, u) => {
      const same = sim.units().some(x => x.side === 'ally' && x.kind === 'char' && x !== u && x.base.path && x.base.path === u.base.path)
      if (same) sim.addBuff(u, gearBuff('izumo_cr', 'Izumo CRIT Rate', [{ stat: 'critRate', value: 0.12 }], Infinity))
    },
  },
  { id: 'duran', name: 'Duran, Dynasty of Running Wolves',
    mods: [],
    // 2pc: 1 Merit per ally FUA (max 5), +5% FUA DMG per stack, +25% CRIT DMG at 5
    onAfterAttack: (sim, u, _attacker, _target, dmgType) => {
      if (dmgType !== 'fua') return
      const rt = sim.rt(u)
      rt.merit = Math.min(5, ((rt.merit as number) ?? 0) + 1)
      const n = rt.merit as number
      const mods: Mod[] = [{ stat: 'boost:fua', value: 0.05 * n }]
      if (n >= 5) mods.push({ stat: 'critDmg', value: 0.25 })
      sim.removeBuff(u, 'duran_merit')
      sim.addBuff(u, gearBuff('duran_merit', 'Merit', mods, Infinity))
      sim.log(`${u.name} Merit ${n}/5: FUA +${5 * n}%${n >= 5 ? ', CRIT DMG +25%' : ''}`)
    },
  },
  { id: 'kalpagni', name: 'Forge of the Kalpagni Lantern',
    mods: [{ stat: 'spdPct', value: 0.06 }],
    onAfterAttack: (sim, u, attacker, target, _dmgType) => {
      if (attacker !== u) return
      if (!target.weaknesses.includes('Fire')) return
      sim.addBuff(u, gearBuff('kalpagni', 'Kalpagni Lantern', [{ stat: 'be', value: 0.40 }], 1))
    },
  },
  { id: 'lushaka', name: 'Lushaka, the Sunken Seas',
    mods: [{ stat: 'err', value: 0.05 }],
    onStart: (sim, u) => {
      // if the wearer is not the first unit in the team lineup, buff that first character
      const lineup = sim.units().filter(x => x.side === 'ally' && x.kind === 'char' && !x.dead)
      const first = lineup[0]
      if (!first || first === u) return
      sim.addBuff(first, gearBuff('lushaka', 'Lushaka ATK', [{ stat: 'atkPct', value: 0.12 }], Infinity))
    },
  },
  { id: 'banana', name: 'The Wondrous BananAmusement Park',
    mods: [{ stat: 'critDmg', value: 0.16 }],
    // 2pc: +16% CRIT DMG; +32% more while a target the wearer summoned is on the field
    onStart: (sim, u) => bananaApply(sim, u),
    onAfterAttack: (sim, u) => bananaApply(sim, u),
  },
  { id: 'bone', name: "Bone Collection's Serene Demesne",
    mods: [{ stat: 'hpPct', value: 0.12 }],
    postMods: f => f.hp >= 5000 ? [{ stat: 'critDmg', value: 0.28 }] : [],
  },
  { id: 'giant_tree', name: 'Giant Tree of Rapt Brooding',
    mods: [{ stat: 'spdPct', value: 0.06 }],
    postMods: f => f.spd >= 180 ? [{ stat: 'outHeal', value: 0.20 }] : f.spd >= 135 ? [{ stat: 'outHeal', value: 0.12 }] : [],
  },
  { id: 'arcadia', name: 'Arcadia of Woven Dreams',
    mods: [],
    onStart: (sim, u) => {
      // when ally count != 4, +12% per missing ally (max 3 stacks)
      const n = sim.units().filter(x => x.side === 'ally' && x.kind === 'char' && !x.dead).length
      if (n >= 4) return
      sim.addBuff(u, gearBuff('arcadia', 'Woven Dreams', [{ stat: 'dmgAll', value: 0.12 * (4 - n) }], Infinity))
    },
  },
  { id: 'revelry', name: 'Revelry by the Sea',
    mods: [{ stat: 'atkPct', value: 0.12 }],
    postMods: f => f.atk >= 3600 ? [{ stat: 'boost:dot', value: 0.24 }] : f.atk >= 2400 ? [{ stat: 'boost:dot', value: 0.12 }] : [],
  },
  { id: 'amphoreus', name: 'Amphoreus, The Eternal Land',
    mods: [{ stat: 'critRate', value: 0.08 }],
    // 2pc +8% CR; while the wearer's memosprite is on field, all allies +8% SPD (no stack)
    onStart: (sim, u) => amphoreusApply(sim, u),
    onAfterAttack: (sim, u) => amphoreusApply(sim, u),
  },
  { id: 'tengoku', name: 'Tengoku@Livestream',
    mods: [{ stat: 'critDmg', value: 0.16 }],
    // 2pc+: when >=3 SP consumed in the wearer's current turn -> +32% CRIT DMG for 3 turns
    onSpSpend: (sim, u, spThisTurn) => {
      if (spThisTurn >= 3) sim.addBuff(u, gearBuff('tengoku', 'Livestream CRIT DMG', [{ stat: 'critDmg', value: 0.32 }], 3))
    },
  },
  { id: 'punklorde', name: 'Punklorde Stage Zero',
    mods: [{ stat: 'elation', value: 0.08 }],
    // 2pc +8% Elation; "first time Elation reaches 40%/80% in combat" -> +20%/32% CRIT DMG (latched tier, see punklordeApply)
    onStart: (sim, u) => punklordeApply(sim, u),
    onAfterAttack: (sim, u) => punklordeApply(sim, u),
  },
  { id: 'converging', name: 'City of Converging Stars',
    mods: [],
    onAfterAttack: (sim, u, attacker, _t, dmgType) => {
      if (attacker !== u || dmgType !== 'fua') return
      sim.addBuff(u, gearBuff('converging', 'Converging Stars', [{ stat: 'atkPct', value: 0.24 }], 2))
    },
    onAllyKill: (sim, u, _killer, _victim) => {
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, gearBuff('converging_cd', 'Converging Stars CRIT DMG', [{ stat: 'critDmg', value: 0.12 }], Infinity))
    },
  },
  { id: 'fallen', name: 'Fallen Star Anchorage',
    mods: [{ stat: 'critRate', value: 0.08 }],
    // entering combat: wearer + another teammate both Trailblaze Companions -> CRIT DMG +32%
    onStart: (sim, u) => {
      const tbc = ['march7th', 'danheng', 'himeko', 'welt']
      if (!tbc.includes(u.kitId!)) return
      const mate = sim.units().some(x => x.side === 'ally' && x.kind === 'char' && x !== u && !x.dead && tbc.includes(x.kitId!))
      if (mate) sim.addBuff(u, gearBuff('fallen', 'Fallen Star CRIT DMG', [{ stat: 'critDmg', value: 0.32 }], Infinity))
    },
  },
  { id: 'cosmic', name: 'Cosmic Life Sciences Institute',
    mods: [],
    postMods: f => f.energyMax >= 200 ? [{ stat: 'dmgAll', value: Math.min(0.32, 0.002 * (f.energyMax - 200)) }] : [],
  },
]

// ---------------------------------------------------------------- helpers

function gearBuff(id: string, name: string, mods: Mod[], turns: number, maxStacks?: number): Buff {
  return { id, name, mods, turns, maxStacks, sourceId: 'gear' }
}

/** buff every living char ally (born party buffs, e.g. Past Self in Mirror) */
function gearParty(sim: SimApi, u: Unit, id: string, name: string, mods: Mod[], turns: number, sideEffect?: (a: Unit) => void): void {
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char' || a.dead) continue
    sideEffect?.(a)
    if (mods.length) sim.addBuff(a, gearBuff(id, name, mods, turns))
  }
}

/** buff every living enemy (born-vuln/def-ignore cones, e.g. Flickering Stars) */
function gearEnemies(sim: SimApi, u: Unit, id: string, name: string, mods: Mod[], turns: number): void {
  for (const e of sim.livingEnemiesOf(u)) sim.addBuff(e, gearBuff(id, name, mods, turns))
}

/** A Grounded Ascent: regen energy + refund 1 SP every 2 ally-target casts */
function grAsc(sim: SimApi, u: Unit, energy: number): void {
  sim.gainEnergyFlat(u, energy)
  const n = ((sim.rt(u).groundedUses as number) ?? 0) + 1
  sim.rt(u).groundedUses = n
  if (n % 2 === 0) sim.gainSp(1)
}

/** Ninja Record: Sound Hunt — wearer HP change → CRIT DMG 2 turns, once per turn */
function ninjaCd(sim: SimApi, u: Unit, si: number): void {
  const rt = sim.rt(u)
  if (rt.ninjaTick) return
  rt.ninjaTick = 1
  sim.addBuff(u, gearBuff('ninja_cd', 'Sound Hunt CRIT DMG', [{ stat: 'critDmg', value: 0.18 + 0.045 * (si - 1) }], 2))
  sim.log(`${u.name} Ninja Record: HP change → CRIT DMG`)
}

/** Long May Rainbows: memosprite-skill → all enemies DMG taken +% */
function rainbowVuln(sim: SimApi, u: Unit, si: number): void {
  for (const e of sim.allies(u.side === 'ally' ? 'enemy' : 'ally')) {
    sim.addBuff(e, gearBuff('rainbow_vuln', 'Rainbow Vow', [{ stat: 'vulnAll', value: 0.18 + 0.045 * (si - 1) }], 2))
  }
}

/** Navigator 4pc: re-apply the buff for the current stack count (0 = no buff) */
function navApply(sim: SimApi, u: Unit): void {
  const n = sim.rt(u).navStacks as number
  sim.removeBuff(u, 'navigator')
  if (n > 0) sim.addBuff(u, gearBuff('navigator', 'Navigator Skill/Ult DMG', [{ stat: 'boost:skill', value: 0.18 * n }, { stat: 'boost:ult', value: 0.18 * n }], Infinity))
}

/** Sacerdos 4pc: apply CD+18% to the ability target when the action targets ONE ally */
function sacerdosApply(sim: SimApi, u: Unit): void {
  const t = sim.lastAbilityTarget
  if (!t || t === 'team') return
  sim.addBuff(t, gearBuff('sacerdos', 'Relived Ordeal', [{ stat: 'critDmg', value: 0.18 }], 2, 2))
}

/** Is a memosprite (Remembrance-path summon) owned by `u` currently on the field?
 *  Non-Remembrance summons (Jing Yuan's Lightning-Lord, Topaz's Numby) and Phainon's
 *  Khaslana are NOT memosprites and do NOT gate memosprite sets (banana/amphoreus/hero...). */
function memospriteOnField(sim: SimApi, u: Unit): boolean {
  if (u.base.path !== 'Remembrance') return false
  return sim.units().some(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && !x.sharesOwnerBuffs && sim.rt(x).ownerId === u.id)
}

/** Umbra Devourer (Finale of a Lie): 3-turn ATK% on wearer + enemy DMG-taken, refreshed (non-stacked). */
function umbraApply(sim: SimApi, u: Unit, si: number): void {
  const atk = 0.40 + 0.10 * (si - 1)
  const vuln = 0.20 + 0.025 * (si - 1)
  for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.removeBuff(a, 'umbra_dev')
  sim.addBuff(u, gearBuff('umbra_dev', 'Umbra Devourer', [{ stat: 'atkPct', value: atk }], 3))
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'umbra_vuln')
  for (const e of sim.livingEnemiesOf(u)) sim.addBuff(e, gearBuff('umbra_vuln', 'Umbra Devourer', [{ stat: 'vulnAll', value: vuln }], 3))
  sim.log(`${u.name} Finale of a Lie: Umbra Devourer 3t (ATK+${(atk * 100).toFixed(0)}%, enemies take +${(vuln * 100).toFixed(1)}%)`)
}

/**
 * Something Irreplaceable proc: heal + DMG% until end of next turn (1t buff decremented at own endTick).
 * Non-stacking; once per battleTurn.
 */
function irrTrigger(sim: SimApi, u: Unit, si: number, via: string): void {
  const rt = sim.rt(u) as { irrTurn?: number; irrLabel?: string }
  if (rt.irrTurn === sim.battleTurn) {
    sim.log(`${u.name} Irreplaceable: ${via} already procced this turn`)
    return
  }
  rt.irrTurn = sim.battleTurn
  rt.irrLabel = via
  sim.heal(u, Math.round(sim.effAtk(u) * (0.08 + 0.01 * (si - 1))))
  sim.removeBuff(u, 'irr_dmg')
  sim.addBuff(u, gearBuff('irr_dmg', 'Irreplaceable DMG', [{ stat: 'dmgAll', value: 0.24 + 0.04 * (si - 1) }], 1))
  sim.log(`${u.name} Irreplaceable: DMG+ until end of next turn (${via})`)
}

/** Carve the Moon effect rotation: battle start + each wearer turn → random party effect (1t), never the last one. */
function carveApply(sim: SimApi, u: Unit, si: number): void {
  const rt = sim.rt(u) as { carveIdx?: number }
  const opts: Array<{ id: string; name: string; mods: Mod[] }> = [
    { id: 'carve_atk', name: 'Carve Moon: ATK', mods: [{ stat: 'atkPct', value: 0.10 + 0.025 * (si - 1) }] },
    { id: 'carve_cd', name: 'Carve Moon: CRIT DMG', mods: [{ stat: 'critDmg', value: 0.12 + 0.03 * (si - 1) }] },
    { id: 'carve_err', name: 'Carve Moon: ERR', mods: [{ stat: 'err', value: 0.06 + 0.015 * (si - 1) }] },
  ]
  const avail = opts.map((_, i) => i).filter(i => i !== rt.carveIdx)
  const idx = sim.rngPick(avail)
  rt.carveIdx = idx
  const pick = opts[idx]
  for (const a of sim.allies(u.side))
    if (a.kind === 'char') {
      sim.removeBuff(a, 'carve_atk'); sim.removeBuff(a, 'carve_cd'); sim.removeBuff(a, 'carve_err')
    }
  for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff(pick.id, pick.name, pick.mods, 1))
  sim.log(`${u.name} Carve the Moon: ${pick.name} to allies (1t)`)
}

/** Blank/Verse recompute for This Love, Forever. Both states present → effects +60%+20%(si-1). */
function loveApply(sim: SimApi, u: Unit, si: number): void {
  const rt = sim.rt(u) as { loveBlank?: boolean; loveVerse?: boolean }
  const mult = rt.loveBlank && rt.loveVerse ? 1 + 0.6 + 0.2 * (si - 1) : 1
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'love_blank')
  for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.removeBuff(a, 'love_verse')
  if (rt.loveBlank)
    for (const e of sim.livingEnemiesOf(u)) sim.addBuff(e, gearBuff('love_blank', "Blank", [{ stat: 'vulnAll', value: (0.10 + 0.02 * (si - 1)) * mult }], Infinity))
  if (rt.loveVerse)
    for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.addBuff(a, gearBuff('love_verse', 'Verse', [{ stat: 'critDmg', value: (0.16 + 0.03 * (si - 1)) * mult }], Infinity))
  sim.log(`${u.name} This Love, Forever: Blank=${rt.loveBlank ? 'yes' : 'no'} Verse=${rt.loveVerse ? 'yes' : 'no'}${mult > 1 ? ` (both ×${mult.toFixed(2)})` : ''}`)
}

/** Hero 4pc SPD gate: memosprite on field -> wearer SPD+6%. The CD+30% (wearer+memosprite, 2 turns)
 *  is set by the set's onAllyAttack when the wearer's memosprite attacks (real trigger). */
function heroApply(sim: SimApi, u: Unit): void {
  if (!memospriteOnField(sim, u)) return
  sim.addBuff(u, gearBuff('hero_spd', 'Hero SPD+', [{ stat: 'spdPct', value: 0.06 }], Infinity))
}

/** Sweat Now cone: memosprite on field -> DMG+X% on wearer AND the owned memosprite (not mirrored, needs a direct share). */
function sweatNowApply(sim: SimApi, u: Unit, si: number): void {
  if (!memospriteOnField(sim, u)) return
  const val = 0.24 + 0.03 * (si - 1)
  sim.addBuff(u, gearBuff('sweat_dmg', 'Come Train! DMG', [{ stat: 'dmgAll', value: val }], Infinity))
  for (const s of sim.units())
    if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === u.id)
      sim.addBuff(s, gearBuff('sweat_dmg', 'Come Train! DMG', [{ stat: 'dmgAll', value: val }], Infinity))
}

/** World-Remaking 4pc: wearer Basic/Skill with memosprite on field -> +24% MaxHP (wearer+memosprite)
 *  +15% ally DMG, until the wearer's next Basic/Skill. Refreshed each action in a skill-spam rotation. */
function worldRemakeApply(sim: SimApi, u: Unit): void {
  if (!memospriteOnField(sim, u)) return
  const gm = sim.units().find(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === u.id)
  sim.addBuff(u, gearBuff('world_hp', 'World-Remaking HP', [{ stat: 'hpPct', value: 0.24 }], 1))
  if (gm) sim.addBuff(gm, gearBuff('world_hp', 'World-Remaking HP', [{ stat: 'hpPct', value: 0.24 }], 1))
  for (const a of sim.allies(u.side))
    if (a.kind === 'char') sim.addBuff(a, gearBuff('world_dmg', 'World-Remaking DMG', [{ stat: 'dmgAll', value: 0.15 }], 1))
}

/** Banana planar: summoned target on field -> extra +32% CRIT DMG. Re-gated each ally action. */
function bananaApply(sim: SimApi, u: Unit): void {
  if (memospriteOnField(sim, u)) sim.addBuff(u, gearBuff('banana_sum', 'Banana Summoned CRIT DMG', [{ stat: 'critDmg', value: 0.32 }], Infinity))
}

/** Amphoreus planar: memosprite on field -> all allies +8% SPD (cannot stack). Re-gated each ally action. */
function amphoreusApply(sim: SimApi, u: Unit): void {
  if (!memospriteOnField(sim, u)) return
  for (const a of sim.allies(u.side))
    if (a.kind === 'char') sim.addBuff(a, gearBuff('amph_spd', 'Amphoreus SPD+', [{ stat: 'spdPct', value: 0.08 }], Infinity))
}

/** Punklorde planar: "first time Elation reaches 40%/80% in combat" -> +20%/32% CRIT DMG.
 *  Latched at the highest tier reached, never downgraded (once Elation crosses a gate it stays). */
function punklordeApply(sim: SimApi, u: Unit): void {
  const el = buffSum(u.buffs, 'elation')
  const tier = (sim.rt(u).punkTier as number) ?? 0
  if (el >= 0.80 && tier < 2) {
    sim.rt(u).punkTier = 2
    sim.addBuff(u, gearBuff('punklorde_cd', 'Punklorde CRIT DMG', [{ stat: 'critDmg', value: 0.32 }], Infinity))
  } else if (el >= 0.40 && tier < 1) {
    sim.rt(u).punkTier = 1
    sim.addBuff(u, gearBuff('punklorde_cd', 'Punklorde CRIT DMG', [{ stat: 'critDmg', value: 0.20 }], Infinity))
  }
}

export interface GearAggregate {
  baseAdd: Pick<BaseStats, 'hp' | 'atk' | 'def'>
  mods: Mod[]
  /** total shield-amplification multiplier bonus from the wearer's shield sets (Knight 4pc, Self-Enshrouded 2/4pc) */
  shieldMult: number
  cone?: LightCone
  coneSi: number
  relicSets: RelicSet[]
  /** sets whose 4-piece bonus is active (2pc hooks live on the set itself) */
  relicSets4?: RelicSet[]
  planar?: PlanarSet
  /** per-slot relics+planar the wearer is actually equipped with (for debug pre-battle dump) */
  pieces?: RelicPiece[]
  /** deferred gated bonuses (postMods), fired once against final gear stats */
  post: Set<() => void>
}

/** final-stat gates need the character's own contribution only (gear flat excluded to avoid recursion) */
export function aggregateGear(
  cfg: GearConfig | undefined,
  charStats?: BaseStats & { be?: number; effRes?: number },
  extraBe?: number,
): GearAggregate {
  const out: GearAggregate = { baseAdd: { hp: 0, atk: 0, def: 0 }, mods: [], shieldMult: 0, relicSets: [], relicSets4: [], coneSi: Math.min(5, Math.max(1, cfg?.si ?? 1)), pieces: cfg?.pieces, post: new Set() }
  if (!cfg) return out
  const si = out.coneSi
  const stats: (BaseStats & { be?: number; effRes?: number }) | undefined =
    extraBe !== undefined
      ? charStats ? { ...charStats, be: extraBe } : { be: extraBe } as BaseStats & { be?: number }
      : charStats

  const cone = LIGHT_CONES.find(l => l.id === cfg.coneId)
  if (cone) {
    // base stats always apply; the passive (mods/cond/hooks) only when the
    // wearer's path matches the cone's path — mismatched cones give stats only.
    // The cone's base stats scale with its level; its passive never does.
    const cf = cfg.coneLevel ? coneLevelFactor(cfg.coneLevel) : 1
    out.baseAdd.hp += cone.hp * cf
    out.baseAdd.atk += cone.atk * cf
    out.baseAdd.def += cone.def * cf
    if (!charStats?.path || charStats.path === cone.path) {
      out.cone = cone
      if (cone.mods) out.mods.push(...cone.mods(si, stats))
    }
  }

  if (cfg.pieces?.length) {
    // per-piece mode: flat mains/subs fold into base, rest become permanent mods
    for (const p of cfg.pieces) {
      const c = pieceContrib(p)
      out.baseAdd.hp += c.baseAdd.hp
      out.baseAdd.atk += c.baseAdd.atk
      out.baseAdd.def += c.baseAdd.def
      out.mods.push(...c.mods.map(m => ({ ...m })))
    }
    // set bonuses from piece ids
    const cavern = cfg.pieces.filter(p => p.slot !== 'sphere' && p.slot !== 'rope').map(p => p.setId)
    applySetCounts(out, cavern, charStats)
    // planar set active when sphere+rope share a set
    const planarPieces = cfg.pieces.filter(p => p.slot === 'sphere' || p.slot === 'rope')
    const planarId = planarPieces.length === 2 && planarPieces[0].setId === planarPieces[1].setId
      ? planarPieces[0].setId
      : undefined
    const planar = PLANAR_SETS.find(p => p.id === (cfg.planarId ?? planarId))
    if (planar) {
      out.planar = planar
      out.mods.push(...planar.mods.map(m => ({ ...m })))
      if (planar.cond && stats && meetsCond(planar.cond.stat, planar.cond.gte, stats))
        out.mods.push(...planar.cond.mods.map(m => ({ ...m })))
    }
  } else {
    // legacy simple mode: a repeated set id means all four cavern pieces are that set
    applySetCounts(out, (cfg.relicSets ?? []).flatMap(id => [id, id]), charStats)
  }

  // cone conditional + legacy planar + gated set bonuses, all against final gear stats
  if (stats) {
    const gearStats = { ...stats }
    for (const m of out.mods) accumulateStat(gearStats, stats, m)
    if (out.cone === cone && cone?.cond && meetsCond(cone.cond.stat, cone.cond.gte(si), gearStats))
      out.mods.push(...cone.cond.mods(si, gearStats))
    if (!cfg.pieces?.length) {
      const planar = PLANAR_SETS.find(p => p.id === cfg.planarId)
      if (planar) {
        out.planar = planar
        out.mods.push(...planar.mods.map(m => ({ ...m })))
        if (planar.cond && meetsCond(planar.cond.stat, planar.cond.gte, gearStats))
          out.mods.push(...planar.cond.mods.map(m => ({ ...m })))
      }
    }
    const f = gearFinal(gearStats, out.mods)
    out.post = new Set()
    for (const s of out.relicSets4 ?? []) if (s.postMods) out.post.add(() => out.mods.push(...s.postMods!(f)))
    if (out.planar?.postMods) out.post.add(() => out.mods.push(...out.planar!.postMods!(f)))
  }
  return out
}

function accumulateStat(f: BaseStats & { be?: number; effRes?: number; ehr?: number }, base: BaseStats & { be?: number; effRes?: number }, m: Mod): void {
  const s = m.stat as string
  if (s === 'critRate') f.critRate = (f.critRate ?? 0) + m.value
  else if (s === 'critDmg') f.critDmg = (f.critDmg ?? 0) + m.value
  else if (s === 'spd') f.spd += m.value
  else if (s === 'spdFlat') f.spd += m.value
  else if (s === 'spdPct') f.spd *= 1 + m.value
  else if (s === 'hp') f.hp += m.value
  else if (s === 'hpPct') f.hp += base.hp * m.value
  else if (s === 'atk') f.atk += m.value
  else if (s === 'atkPct') f.atk += base.atk * m.value
  else if (s === 'be') f.be = (f.be ?? 0) + m.value
  else if (s === 'effRes') f.effRes = (f.effRes ?? 0) + m.value
  else if (s === 'ehr') f.ehr = (f.ehr ?? 0) + m.value
}

/** final attach-time bag (base + gear mods), used by postMods gates (spd/hp/atk/energy...) */
function gearFinal(base: BaseStats & { be?: number; effRes?: number }, gearMods: Mod[]): GearFinal {
  const f: BaseStats & { be?: number; effRes?: number; ehr?: number } = { ...base, ehr: base.ehr ?? 0, effRes: base.effRes ?? 0 }
  for (const m of gearMods) accumulateStat(f, base, m)
  return { spd: f.spd, hp: f.hp, atk: f.atk, energyMax: base.energyMax ?? 0, ehr: f.ehr ?? 0, critRate: f.critRate ?? 0.05, critDmg: f.critDmg ?? 0.5, effRes: f.effRes ?? 0, be: f.be ?? 0 }
}

function applySetCounts(out: GearAggregate, ids: string[], charStats?: BaseStats & { be?: number; effRes?: number }): void {
  void charStats
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  for (const [id, n] of counts) {
    const s = RELIC_SETS.find(r => r.id === id)
    if (!s) continue
    out.relicSets.push(s)
    if (n >= 2) { out.mods.push(...s.twoPc.map(m => ({ ...m }))); if (s.shieldMult2) out.shieldMult += s.shieldMult2 }
    if (n >= 4) {
      out.relicSets4!.push(s)
      if (s.fourPc) out.mods.push(...s.fourPc.map(m => ({ ...m })))
      if (s.shieldMult4) out.shieldMult += s.shieldMult4
    }
  }
}

function meetsCond(stat: CondStat, gte: number, f: BaseStats & { be?: number; effRes?: number; ehr?: number }): boolean {
  switch (stat) {
    case 'spd': return f.spd >= gte
    case 'critRate': return (f.critRate ?? 0) >= gte
    case 'effRes': return (f.effRes ?? 0) >= gte
    case 'ehr': return (f.ehr ?? 0) >= gte
    case 'be': return (f.be ?? 0) >= gte
  }
}
