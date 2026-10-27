// Kits of the Destruction path, merged from the former per-character modules (15 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, mirrorOwnerCrit, type KitDef, type KitRuntime, type SimApi, type HitOpts } from '../kit'
import type { AbilityLevels, DmgType, Unit } from '../entities/Unit'
import type { Mod } from '../effects/Buff'
import { lowestHpEnemy } from './hunt'
import { mult, PROG } from '../progression'
import { eff } from '../combat/StatResolver'
import { accAdd, accGet } from '../combat/Accumulator'
import { DEFAULT_AVAILABILITY, abilityVariant, abilityAvailable } from '../combat/Availability'
import { armWindow, windowArmed, windowCharges, consumeWindow, disarmWindow } from '../combat/Reaction'
import { type DoTWithSource } from '../simulator'

// ===== firefly  (was firefly.ts) =====
export const fireflyKit: KitDef = {
  id: 'firefly',
  name: 'Firefly',
  elem: 'Fire',
  energyMax: 240,
  base: { level: 80, hp: 814, atk: 523, def: 776, spd: 104, critRate: 0.05, critDmg: 0.5 },
  // #131007 "Δ Order: Meteoric Incineration" (Technique): Fire Weakness on all enemies, then AoE
  // Fire DMG = 200% of SAM's ATK. (Sim convention: enemy Weaknesses are permanent.)
  technique: {
    name: 'Δ Order: Meteoric Incineration',
    kind: 'attack',
    apply(sim, u) {
      for (const e of sim.livingEnemiesOf(u)) sim.applyWeakness(u, e, 'Fire')
      sim.hitAoe(u, { type: 'basic', elem: 'Fire', mult: 2, toughDmg: 10, label: 'Δ Order: Meteoric Incineration' })
    },
  },
  onStart(sim, u, ctx) {
    if (u.energy < u.maxEnergy * 0.5) {
      u.energy = Math.floor(u.maxEnergy * 0.5)
      sim.log(`${u.name} talent: energy set to 50%`)
    }
    // Module γ: every 10 ATK above 1800 → +0.8% BE (capped at 360% BE)
    const atk = sim.effAtk(u)
    const excess = Math.max(0, atk - 1800)
    const beBonus = Math.min(3.6, Math.floor(excess / 10) * 0.008)
    if (beBonus > 0) {
      sim.addBuff(u, { id: 'module_gamma', name: 'Module γ: Core Overload' + Math.round(beBonus * 100) + '%', mods: [{ stat: 'be', value: beBonus }] })
      sim.log(`${u.name} Module γ: +${Math.round(beBonus * 100)}% BE from ATK`)
    }
  },
  availability(sim, u) {
    // Complete Combustion: Basic/Skill become their enhanced variants, the Ult is suppressed
    if (sim.hasBuff(u, 'cc_state')) {
      return { mode: 'complete_combustion', variant: { basic: 'enhanced', skill: 'enhanced', ult: null } }
    }
    return DEFAULT_AVAILABILITY
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    // CC: preferred skill is the blast (Deathstar); basic (single) only under SP pressure
    if (sim.availableAbilities(u).mode === 'complete_combustion') return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const av = sim.availableAbilities(u)
    const basicEn = abilityVariant(av, 'basic') === 'enhanced'
    const skillEn = abilityVariant(av, 'skill') === 'enhanced'
    const lv = levelsOf(ctx)
    // ult #3[i]: SPD increase during Complete Combustion
    const ccSpd = mult('firefly', 'ult_a2', lv.ult)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy || !abilityAvailable(av, 'ult')) return
      u.energy = 0
      sim.log('Fyrefly Type-IV: Complete Combustion (energy +5)') // +5 from castUlt
      enterCc(sim, u, ctx, lv, ccSpd)
      return
    }

    const wantSkill = action.kind === 'skill' && sim.spendSp(1)
    const fb = lowestHpEnemy(sim, u)
    if (!fb) return
    const t = action.kind === 'skill' ? manualTarget(sim, action, fb) : fb
    if (!t) return

    if (!wantSkill) {
      sim.gainSp(1)
      if (basicEn) {
        // Enhanced Basic: restores 20% max HP (flat per hsr-data #2), deals #1 ATK fire DMG
        sim.heal(u, u.maxHp * 0.20)
        ccAttack(sim, u, t, { type: 'basic', mult: mult('firefly', 'basic_en', lv.basic), toughDmg: 15, label: 'Pyrogenic Decimation', split: [0.15, 0.15, 0.15, 0.15, 0.4] }, undefined, ctx)
        // enhanced basic generates no energy
      } else {
        sim.gainEnergy(u, 20)
        sim.hit(u, t, { type: 'basic', mult: mult('firefly', 'basic', lv.basic), toughDmg: 10, label: 'Order: Flare Propulsion' })
      }
      return
    }

    // skill branch
    if (skillEn) {
      const eid = (ctx.eidolon as number) ?? 0
      // E1: enhanced skill costs no SP, refunds it
      if (eid >= 1) sim.gainSp(1)
      // Enhanced Skill: restores 25% max HP (flat)
      sim.heal(u, u.maxHp * 0.25)
      const be = Math.min(3.6, sim.effBe(u))
      // 1131009: "Adds Fire Weakness to one designated enemy AND ITS ADJACENT TARGETS, lasting for 2 turns"
      // (sim: enemy weaknesses are permanent — same convention as anaxa/silverwolf/phainon; Blast = all other living)
      for (const e of sim.livingEnemiesOf(u)) sim.applyWeakness(u, e, 'Fire')
      // Enhanced Skill: (#5 × BE + #1%) to primary, (#6 × BE + #2%) to adjacent, BE capped at #7=360%
      const eMain = mult('firefly', 'skill_en', lv.skill)
      const adjBase = mult('firefly', 'skill_en_a2', lv.skill)
      // E1: 15% DEF ignore on enhanced skill
      if (eid >= 1) {
        for (const e of sim.livingEnemiesOf(u))
          sim.addBuff(e, { id: 'ff_e1_def', name: 'In Reddened Chrysalis, I Once Rest DEF↓', mods: [{ stat: 'defIgnore', value: 0.15 }], turns: 1 })
      }
      ccAttack(
        sim, u, t,
        { type: 'skill', mult: 0.2 * be + eMain, toughDmg: 30, label: 'Deathstar Overload', split: [0.15, 0.15, 0.15, 0.15, 0.4] },
        { type: 'skill', mult: 0.1 * be + adjBase, toughDmg: 15, label: 'Deathstar Overload (adj)' },
        ctx,
      )
      if (eid >= 1) {
        for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'ff_e1_def')
      }
    } else {
      // Skill: consumes #2=40% HP, regens #3=65% of max energy (#1=250% ATK DMG)
      sim.hpChange(u, -u.maxHp * 0.40, 'cost')
      u.energy = Math.min(u.maxEnergy, u.energy + u.maxEnergy * mult('firefly', 'skill', lv.skill))
      // self-advance 25% fires mid-own-turn → lost per rule (own AV already 0); kept only for manual/out-of-turn shape
      sim.advance(u, 0.25)
      sim.hit(u, t, { type: 'skill', mult: mult('firefly', 'skill_a2', lv.skill), toughDmg: 20, label: 'Order: Aerial Bombardment', split: [0.4, 0.6] })
    }
  },
  // called by simulator when the CC countdown timer fires
  onCcEnd(sim, u) {
    exitCc(sim, u)
  },
  // E2: extra turn on kill/break in Complete Combustion
  onKill(sim, u, _victim, ctx) {
    if (((ctx.eidolon as number) ?? 0) < 2) return
    if (sim.availableAbilities(u).mode !== 'complete_combustion') return
    const rt = sim.rt(u)
    if (rt.inExtraTurn) return
    sim.grantExtraTurn(u)
    sim.log('E2 extra turn on kill in Complete Combustion')
  },
  onBreak(sim, breaker, _victim, ctx) {
    if (breaker.kitId !== 'firefly') return
    if (((ctx.eidolon as number) ?? 0) < 2) return
    if (sim.availableAbilities(breaker).mode !== 'complete_combustion') return
    const rt = sim.rt(breaker)
    if (rt.inExtraTurn) return
    sim.grantExtraTurn(breaker)
    sim.log('E2 extra turn on break in Complete Combustion')
  },
}

function enterCc(sim: SimApi, u: Unit, ctx: Record<string, unknown>, lv: AbilityLevels, ccSpd: number): void {
  // Ult: #1=Break DMG boost, #3=SPD increase; Talent: #4=Effect RES at max reduction
  const eid = (ctx.eidolon as number) ?? 0
  const beBoost = mult('firefly', 'ult', lv.ult)
  const effRes = mult('firefly', 'talent_a2', lv.talent)
  const mitigation = mult('firefly', 'talent', lv.talent)
  const mods: Mod[] = [
    // mitigation stays at max while in CC regardless of HP (wiki behavior)
    { stat: 'boost:break', value: beBoost },
    { stat: 'effRes', value: effRes + (eid >= 4 ? 0.50 : 0) },
    { stat: 'mitigation', value: mitigation },
    // A2 Module α: +25% Break Effect while in Complete Combustion
    { stat: 'be', value: 0.25 },
  ]
  // E6: +20% Fire RES PEN while in Complete Combustion
  if (eid >= 6) mods.push({ stat: 'resPen:Fire', value: 0.20 })
  sim.addBuff(u, { id: 'cc_state', name: 'Complete Combustion', mods })
  ctx.prevSpd = u.base.spd
  sim.setSpeedDynamic(u, u.base.spd + ccSpd)
  // ult action advance 100%: own-turn cast in auto → lost per rule (own AV already 0);
  // applies on manual/out-of-turn ults only (same as DHIL E2)
  sim.advance(u, 1.0)
  sim.log(`${u.name}: CC action advance 100%`)
  sim.scheduleCountdown(u, { id: `cctimer_${u.id}`, name: 'CC Countdown', side: 'ally', elem: 'Fire', spd: 70 })
  sim.log(`${u.name} enters COMPLETE COMBUSTION`)
}

function exitCc(sim: SimApi, u: Unit): void {
  sim.removeBuff(u, 'cc_state')
  const prev = sim.rt(u).prevSpd as number | undefined
  if (prev) sim.setSpeedDynamic(u, prev)
  sim.log(`${u.name} exits Complete Combustion`)
}

/** CC attack: WBE base +50% (#2); E6 +50% more. pierce 55% (Module α) w/o weakness, Super Break (Module β) vs broken primary */
function ccAttack(sim: SimApi, u: Unit, primary: Unit, main: Parameters<SimApi['hit']>[2], adj: Parameters<SimApi['hit']>[2] | undefined, ctx: KitRuntime): void {
  const wbe = 0.5 + (((ctx.eidolon as number) ?? 0) >= 6 ? 0.5 : 0)
  const m = { ...main, wbeBonus: wbe, pierceRatio: 0.55 }
  const wasBroken = primary.broken
  if (adj) {
    for (const e of [...sim.livingEnemiesOf(u)]) {
      if (e === primary) sim.hit(u, e, m)
      else sim.hit(u, e, { ...adj, wbeBonus: wbe, pierceRatio: 0.55 })
    }
  } else {
    sim.hit(u, primary, m)
  }
  // Module β: Super Break on broken targets — 100% at BE ≥ 150%, 150% at BE ≥ 300% (trace desc).
  // SB base = the toughness actually consumed by this hit (includes WBE): toughDmg × (1+wbe).
  if (wasBroken && !primary.dead && main.toughDmg) {
    const be = sim.effBe(u)
    const ratio = be >= 3.0 ? 1.5 : be >= 1.5 ? 1.0 : 0
    if (ratio > 0) sim.superBreak(u, primary, main.toughDmg * (1 + wbe), ratio)
  }
}


// ===== blade  (was blade.ts) =====
function chargeCap(eid: number): number {
  return eid >= 6 ? 4 : 5
}

/** read the Ultimate tally, capped at 90% of Max HP (canon ult #7) */
function cappedTally(ctx: KitRuntime, u: Unit): number {
  return Math.min((ctx.hpTally as number) ?? 0, Math.round(u.maxHp * 0.9))
}

/** E1 "Blade Cuts the Deepest in Hell": Enhanced Basic primary + Ult primary deal +150% of the tally */
function e1Extra(ctx: KitRuntime, u: Unit): number {
  const eid = (ctx.eidolon as number) ?? 0
  if (eid < 1) return 0
  return Math.round(cappedTally(ctx, u) * 1.5)
}

/** E4 "Rejected by Death, Infected With Life": triggers when HP drops from above 50% to ≤50%;
 *  permanent +20% MaxHP stacks, up to 2 (persist — canon has no remove-on-heal clause) */
function e4Check(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (((ctx.eidolon as number) ?? 0) < 4) return
  const below = u.hp <= u.maxHp * 0.5
  if (below && !ctx.e4SeenBelow) {
    ctx.e4SeenBelow = true
    sim.addBuff(u, { id: 'blade_e4', name: 'Rejected by Death, Infected With Life', mods: [{ stat: 'hpPct', value: 0.20 }], turns: Infinity, maxStacks: 2 })
    sim.log(`${u.name} E4: HP dropped to ≤50% — Max HP +20% (stack)`)
  }
  if (!below) ctx.e4SeenBelow = false
}

/** HP loss from self-cost (skill/ebasic/ult set-to-50%): reduces HP, adds to tally, gains Charge */
function selfHpCost(sim: SimApi, u: Unit, amount: number, ctx: KitRuntime): void {
  if (amount <= 0) return
  const actual = -sim.hpChange(u, -amount, 'cost')
  sim.fireAllyHpLoss(u, actual)
  ctx.hpTally = ((ctx.hpTally as number) ?? 0) + actual
  gainCharge(sim, u, ctx)
  sim.log(`${u.name} loses ${actual} HP (self-cost)`)
  e4Check(sim, u, ctx)
}

/** External hit (enemy attack): HP already reduced by the sim; only tally + Charge */
function externalHpLoss(sim: SimApi, u: Unit, amount: number, ctx: KitRuntime): void {
  if (amount <= 0) return
  ctx.hpTally = ((ctx.hpTally as number) ?? 0) + Math.round(amount)
  gainCharge(sim, u, ctx)
  e4Check(sim, u, ctx)
}

function gainCharge(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const eid = (ctx.eidolon as number) ?? 0
  ctx.charge = ((ctx.charge as number) ?? 0) + 1
  if ((ctx.charge as number) >= chargeCap(eid)) {
    ctx.charge = 0
    triggerFua(sim, u, ctx)
  }
}

/** Talent "Shuhu's Gift": full Charge → FUA on all enemies + self-heal.
 *  Energy: talent base 10 (canon sp=10) + A6 Cyclone +15 = 25. */
function triggerFua(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  // A6: FUA DMG +20%; E6: FUA DMG +50% of Max HP
  let m = mult('blade', 'talent', lv.talent) * 1.2
  if (eid >= 6) m += 0.5
  sim.hitAoe(u, { type: 'fua', scaleStat: 'hp', mult: m, toughDmg: 20, label: "Shuhu's Gift (FUA)", split: [0.33, 0.33, 0.34] })
  // restores 25% Max HP (canon talent #3); A2 converts 25% of healed into the tally via onAllyHeal
  sim.heal(u, Math.round(u.maxHp * 0.25))
  sim.gainEnergy(u, 25)
  sim.log(`${u.name} Talent FUA + self-heal (energy +25)`)
}

export const bladeKit: KitDef = {
  id: 'blade',
  name: 'Blade',
  elem: 'Wind',
  energyMax: 130,
  base: { ...PROG.blade.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // Karma Wind (Technique): AoE 40% MaxHP Wind; consumes 20% Max HP (HP floors at 1).
  technique: {
    name: 'Karma Wind',
    kind: 'attack',
    apply(sim, u) {
      hpCost(sim, u, u.maxHp * 0.2)
      sim.hitAoe(u, { type: 'basic', elem: 'Wind', scaleStat: 'hp', mult: 0.4, toughDmg: 10, label: 'Karma Wind' })
    },
  },
  onStart(sim, u) {
    u.aggro = 125
    // A2: incoming healing +20%
    sim.addBuff(u, { id: 'blade_b1', name: 'Vita Infinita', mods: [{ stat: 'inHeal', value: 0.20 }] })
  },
  // Talent: sustains external DMG → tally + 1 Charge (max 1 per attack)
  onAllyHit(sim, attacker, target, dmg, ctx) {
    if (attacker.side !== 'enemy') return
    if (target.kind !== 'char' || target.kitId !== 'blade' || target.dead) return
    externalHpLoss(sim, target, dmg, ctx)
  },
  // A2 "Neverending Deaths": any healing received (incl. Talent self-heal) → 25% into the Ultimate tally
  onAllyHeal(sim, target, amount, ctx) {
    if (target.kind !== 'char' || target.kitId !== 'blade') return
    const conv = Math.round(amount * 0.25)
    ctx.hpTally = ((ctx.hpTally as number) ?? 0) + conv
    e4Check(sim, target, ctx)
    sim.log(`${target.name} A2: healing converts ${conv} to Ultimate tally`)
  },
  onTurnStart(sim, u, ctx) {
    e4Check(sim, u, ctx)
  },
  decide(sim, u, _ctx) {
    if (sim.hasBuff(u, 'hellscape')) return { kind: 'basic' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      if (!enemies.length) return
      // sets current HP to 50% of Max HP: above → consuming HP (tally+Charge); below → raise, no heal credit
      const targetHp = Math.round(u.maxHp * 0.5)
      if (u.hp > targetHp) selfHpCost(sim, u, u.hp - targetHp, ctx)
      else if (u.hp < targetHp) { sim.hpChange(u, targetHp - u.hp, 'set'); sim.log(`${u.name} HP set to 50% (no heal credit)`) }
      const tally = cappedTally(ctx, u)
      // A1 Vita Infinita: Ultimate clears 50% of the tally
      ctx.hpTally = Math.round(((ctx.hpTally as number) ?? 0) * 0.5)
      const primary = manualTarget(sim, action, enemies[0])
      const extra = e1Extra(ctx, u)
      sim.hitBlast(u, primary,
        { type: 'ult', scaleStat: 'hp', mult: mult('blade', 'ult', lv.ult), flat: tally * mult('blade', 'ult_a2', lv.ult) + extra, toughDmg: 30, label: 'Death Sentence (main)' },
        { type: 'ult', scaleStat: 'hp', mult: mult('blade', 'ult_a3', lv.ult), flat: tally * mult('blade', 'ult_a4', lv.ult), toughDmg: 15, label: 'Death Sentence (adj)' },
      )
      sim.log(`Blade: Death Sentence (tally ${tally}${eid >= 1 ? `, E1 extra ${extra}` : ''}); energy +5`) // +5 from castUlt
      return
    }
    if (action.kind === 'skill') {
      if (sim.hasBuff(u, 'hellscape')) {
        // can't use Skill while in Hellscape — acts as a basic instead
        doBasic(sim, u, ctx)
        return
      }
      if (sim.spendSp(1)) {
        selfHpCost(sim, u, Math.round(u.maxHp * 0.3), ctx)
        const mods: Mod[] = [{ stat: 'dmgAll', value: mult('blade', 'skill', lv.skill) }, { stat: 'aggro', value: 500 }]
        if (eid >= 2) mods.push({ stat: 'critRate', value: 0.15 }) // E2
        sim.addBuff(u, {
          id: 'hellscape', name: `Hellscape DMG+${Math.round(mult('blade', 'skill', lv.skill) * 100)}%`,
          mods, turns: 3,
        })
        sim.log(`${u.name} enters Hellscape (3 turns) + Extra Turn`)
        // canon: "Using this Skill does not end the current turn" — grants an Extra Turn
        sim.grantExtraTurn(u)
      }
      return
    }
    doBasic(sim, u, ctx)
  },
}

/** Shard Sword (normal / +1 SP / +20 energy) or Forest of Swords
 *  (enhanced: no SP, 30 energy, 10% MaxHP self-cost, E1 extra on primary) */
function doBasic(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  if (sim.hasBuff(u, 'hellscape')) {
    // Forest of Swords: "cannot regenerate Skill Points" — no gainSp; 30 energy (canon sp)
    selfHpCost(sim, u, Math.round(u.maxHp * 0.1), ctx)
    sim.gainEnergy(u, 30)
    const primary = enemies[0]
    const extra = e1Extra(ctx, u)
    sim.hitBlast(u, primary,
      { type: 'basic', scaleStat: 'hp', mult: mult('blade', 'basic_en', lv.basic), flat: extra, toughDmg: 10, label: 'Forest of Swords', split: [0.5, 0.5] },
      { type: 'basic', scaleStat: 'hp', mult: mult('blade', 'basic_en_a2', lv.basic), toughDmg: 10, label: 'Forest of Swords (adj)' },
    )
  } else {
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', scaleStat: 'hp', mult: mult('blade', 'basic', lv.basic), toughDmg: 10, label: 'Shard Sword' })
  }
}

// ===== danhengil  (was danhengil.ts) =====
function levelsOf_danhengil(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

interface StageInfo { slot: string; hits: number; label: string; split: number[] | null }

const STAGES: StageInfo[] = [
  { slot: 'basic', hits: 2, label: 'Beneficent Lotus', split: [0.3, 0.7] },
  { slot: 'basic_en', hits: 3, label: 'Transcendence', split: [0.33, 0.33, 0.34] },
  { slot: 'basic_en_a2', hits: 5, label: 'Divine Spear', split: null },
  { slot: 'basic_en_a3', hits: 7, label: 'Fulgurant Leap', split: [0.142, 0.142, 0.142, 0.142, 0.142, 0.142, 0.148] },
]

export const danhengilKit: KitDef = {
  id: 'danhengil',
  name: 'Dan Heng • Imbibitor Lunae',
  elem: 'Imaginary',
  energyMax: 140,
  base: { ...PROG.danhengil.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #1004 "Heaven-Quelling Prismadrakon" (Technique): AoE Imaginary = 120% ATK + 1 Squama.
  technique: {
    name: 'Heaven-Quelling Prismadrakon',
    kind: 'attack',
    apply(sim, u, ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Imaginary', mult: 1.2, toughDmg: 20, label: 'Heaven-Quelling Prismadrakon' })
      ctx.squama = Math.min(3, ((ctx.squama as number) ?? 0) + 1)
      sim.log(`${u.name} Technique: Squama ${ctx.squama}/3`)
    },
  },
  onStart(sim, u, ctx) {
    ctx.stage = 0
    ctx.squama = 0
    // A2 Star Veil: +15 Energy at battle start
    sim.gainEnergy(u, 15)
    sim.log('Dan Heng IL A2: +15 Energy')
    // A4: CC resist +35% (Effect RES)
    sim.addBuff(u, { id: 'dhl_a4', name: 'A4 Effect RES', mods: [{ stat: 'effRes', value: 0.35 }], turns: Infinity })
    // A6 Jolt Anew: +24% CRIT DMG vs Imaginary-weak enemies (always-on in sim)
    sim.addBuff(u, { id: 'dhl_a6', name: 'Jolt Anew', mods: [{ stat: 'critDmg', value: 0.24 }] })
  },
  decide(sim, _u, ctx) {
    // enhance up to 3 (free), then unleash the enhanced basic
    return { kind: ((ctx.stage as number) ?? 0) < 3 ? 'enhance' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf_danhengil(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const stage = Math.min(3, (ctx.stage as number) ?? 0)
    const squama = (ctx.squama as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const primary = enemies[0]
      sim.hitBlast(u, primary,
        { type: 'ult', mult: mult('danhengil', 'ult', lv.ult), toughDmg: 20, label: "Azure's Aqua Ablutes All", split: [0.3, 0.3, 0.4] },
        { type: 'ult', mult: mult('danhengil', 'ult_a2', lv.ult), toughDmg: 10, label: "Azure's Aqua (adj)", split: [0.3, 0.3, 0.4] },
      )
      // gain 2 Squama (E2: +1), cap 3
      ctx.squama = Math.min(3, squama + 2 + (eid >= 2 ? 1 : 0))
      // Righteous Heart: 3 ult hits = 3 stacks (E1: +1/hit, cap 10); DMG+ per stack (canon talent per hit)
      const uCap = 6 + (eid >= 1 ? 4 : 0)
      const uStacks = Math.min(uCap, 3 * (eid >= 1 ? 2 : 1))
      sim.addBuff(u, {
        id: 'dhl_heart', name: 'Righteous Heart', mods: [{ stat: 'dmgAll', value: mult('danhengil', 'talent', lv.talent) }],
        turns: 1, stacks: uStacks, maxStacks: uCap,
      })
      // +5 energy from castUlt
      // E2 (post-ult 100% action advance): real sim.advance. In auto mode DHIL ults at his own
      // turn start (charTurn) — his AV is already 0, so the advance is inert and endTick re-arms
      // him at baseAV (player rule: advance during a regular turn is lost; DHIL has no
      // "turn does not end" extra-turn chain like Qingque/Archer/Blade/Seele to make it stick).
      // Manual/out-of-turn ults (castUlt outOfTurn via outOfTurnUlts) DO pull his next action.
      if (eid >= 2) {
        sim.advance(u, 1.0)
        sim.log('Dan Heng IL E2: action advance 100%')
      }
      sim.log(`Dan Heng IL Ult: Squama ${(ctx.squama as number)}/3`)
      return
    }

    if (action.kind === 'enhance') {
      // Dracore Libre: enhance Basic, no SP consumed, not a Skill, 0 Energy (canon sp_base None)
      const nu = Math.min(3, stage + 1)
      ctx.stage = nu
      sim.log(`Dracore Libre: basic enhanced to stage ${nu}`)
      return
    }

    // basic (any stage) — enhanced stages consume SP (1/2/3 per stage), Squama offsets it
    if (stage > 0) {
      const cost = stage
      const use = Math.min(squama, cost)
      ctx.squama = squama - use
      if (cost - use > 0) sim.spendSp(cost - use)
    }
    const st = STAGES[stage]
    const main: { type: 'basic'; mult: number; toughDmg: number; label: string; split?: number[] } = { type: 'basic', mult: mult('danhengil', st.slot, lv.basic), toughDmg: 15, label: st.label }
    if (st.split) main.split = st.split
    if (stage >= 2) {
      const adjSlot = stage === 2 ? 'basic_en_a2_adj' : 'basic_en_a3_adj'
      const adj: { type: 'basic'; mult: number; toughDmg: number; label: string; split?: number[] } = { type: 'basic', mult: mult('danhengil', adjSlot, lv.basic), toughDmg: 7.5, label: `${st.label} (adj)` }
      if (stage === 3) adj.split = [0.25, 0.25, 0.25, 0.25]
      sim.hitBlast(u, enemies[0], main, adj)
    } else {
      sim.hit(u, enemies[0], main)
    }
    sim.gainEnergy(u, [20, 30, 35, 40][stage])
    if (stage === 0) sim.gainSp(1) // beneficent Lotus restores 1 SP (canon bp_add 1)

    // Righteous Heart: 1 stack per hit, DMG+ per stack, until end of turn (E1: +1/hit, cap 10)
    const heartCap = 6 + (eid >= 1 ? 4 : 0)
    const heartStacks = Math.min(heartCap, st.hits * (eid >= 1 ? 2 : 1))
    if (heartStacks > 0)
      sim.addBuff(u, {
        id: 'dhl_heart', name: 'Righteous Heart', mods: [{ stat: 'dmgAll', value: mult('danhengil', 'talent', lv.talent) }],
        turns: 1, stacks: heartStacks, maxStacks: heartCap,
      })
    // Outroar: from 4th hit of Spear(5h)/Leap(7h), CRIT DMG per stack (E4: lasts through next turn)
    if (stage >= 2) {
      const outroarStacks = stage === 2 ? 2 : 4
      sim.addBuff(u, {
        id: 'dhl_outroar', name: 'Dracore Libre', mods: [{ stat: 'critDmg', value: mult('danhengil', 'skill', lv.skill) }],
        turns: eid >= 4 ? 2 : 1, stacks: outroarStacks, maxStacks: 4,
      })
      if (stage === 3) sim.removeBuff(u, 'dhl_e6') // E6 consumed by Fulgurant Leap
    }
    ctx.stage = 0
  },
  onAllyUlt(sim, _ally, ctx) {
    // E6: after another ally's Ultimate, next Fulgurant Leap +20% Imaginary RES PEN (up to 3)
    if (((ctx.eidolon as number) ?? 0) < 6) return
    const il = sim.allies('ally').find(x => x.kitId === 'danhengil' && !x.dead)
    if (!il) return
    sim.addBuff(il, {
      id: 'dhl_e6', name: 'Reign, Returned', mods: [{ stat: 'resPen:Imaginary', value: 0.2 }],
      turns: Infinity, maxStacks: 3,
    })
    sim.log('Dan Heng IL E6: Fulgurant Leap RES PEN +20% (stacking)')
  },
}

// ===== arlan  (was arlan.ts) =====
/** Talent "Pain and Anger": DMG bonus from missing HP%, capped at the talent value. */
function refreshPain(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const missing = Math.min(1, Math.max(0, 1 - u.hp / Math.max(1, u.maxHp)))
  const cap = mult('arlan', 'talent', lv.talent)
  const dmg = cap * missing
  sim.removeBuff(u, 'arlan_pain')
  if (dmg > 0)
    sim.addBuff(u, { id: 'arlan_pain', name: `Pain & Anger DMG+${Math.round(dmg * 100)}%`, mods: [{ stat: 'dmgAll', value: dmg }], turns: Infinity })
}

/** Skill / Basic self HP cost (15% / flat). Never drops below 1 HP. */
function hpCost(sim: SimApi, u: Unit, amount: number): void {
  if (amount <= 0) return
  const actual = -sim.hpChange(u, -Math.round(amount), 'cost')
  if (actual <= 0) return
  sim.fireAllyHpLoss(u, actual)
  sim.log(`${u.name} loses ${actual} HP (self-cost)`)
}

function lowHp(u: Unit): boolean {
  return u.hp / Math.max(1, u.maxHp) <= 0.5
}

// A4 Endurance (50% DoT RES) and A6 Repel (battle-start HP ≤ 50% → damage nullifier until attacked)
// live in onStart. A6 needs the loss-interceptor `kind` (DoT ticks are exempt per canon) plus a
// wounded start-HP knob — sim.addLossInterceptor now passes kind ('dot'|'add'|'attack') and
// TeamSpec.hpFrac lets a fixture begin the battle below full HP. E2 (Skill/Ult dispels 1 debuff
// from Arlan) needs an enemy-applied ally debuff: EnemySpec.debuff + sim.dispel provide it.
export const arlanKit: KitDef = {
  id: 'arlan',
  name: 'Arlan',
  elem: 'Lightning',
  energyMax: 110,
  base: { ...PROG.arlan.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 100807 "Swift Harvest": 80% ATK Lightning DMG to all enemies. attack Technique.
  technique: {
    name: 'Swift Harvest',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Lightning', mult: 0.8, label: 'Swift Harvest' })
    },
  },
  onStart(sim, u, ctx) {
    // E4 Turn the Tables: armed for 2 turns, then expires unused
    ctx.e4Turns = 2
    ctx.e4Used = false
    // A4 Endurance: 50% DoT RES (permanent major trace)
    sim.addBuff(u, { id: 'arlan_endurance', name: 'Endurance', mods: [{ stat: 'dotRes', value: 0.5 }], turns: Infinity })
    // A6 Repel: canon "upon entering battle, if HP ≤ 50%, nullify all DMG received except DoTs
    // until attacked". A one-shot loss interceptor armed at battle start, disarmed by the first
    // non-DoT hit that reaches Arlan.
    if (lowHp(u)) {
      ctx.repelArmed = true
      sim.log(`${u.name} A6 Repel: HP ≤50%, all DMG nullified until attacked`)
      sim.addLossInterceptor((t, dmg, kind) => {
        if (t !== u || kind === 'dot' || !ctx.repelArmed) return 0
        ctx.repelArmed = false
        sim.log(`${t.name} A6 Repel: nullified ${dmg} DMG (consumed)`)
        return dmg
      })
    }
    refreshPain(sim, u, ctx)
  },
  onTurnStart(sim, u, ctx) {
    refreshPain(sim, u, ctx)
  },
  onTurnEnd(_sim, u, ctx) {
    const left = Math.max(0, ((ctx.e4Turns as number) ?? 0) - 1)
    ctx.e4Turns = left
    if (left <= 0) ctx.e4Used = true
  },
  // Refresh Pain & Anger whenever Arlan takes an HP-affecting hit; E4 death-revive
  onAllyHit(sim, attacker, target, _dmg, ctx) {
    if (target.kind !== 'char' || target.kitId !== 'arlan' || target.dead) return
    if (target.hp <= 0 && ((ctx.eidolon as number) ?? 0) >= 4 && !(ctx.e4Used as boolean)) {
      // E4 Turn the Tables: killing blow → revive to 25% Max HP (one-time)
      sim.revive(target, Math.floor(target.maxHp * 0.25), attacker)
      ctx.e4Used = true
      sim.log(`${target.name} E4: revived to 25% Max HP`)
    }
    refreshPain(sim, target, ctx)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // don't kill himself when very low; otherwise spam the free Skill
    if (u.hp / Math.max(1, u.maxHp) <= 0.12) return { kind: 'basic' }
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    return { kind: 'skill' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // E2: Ult removes 1 debuff from Arlan
      if (eid >= 2) sim.dispel(u)
      const primary = manualTarget(sim, action, enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0]))
      // E6: HP ≤50% → Ult +20% and adjacent raised to main multiplier
      const six = eid >= 6 && lowHp(u)
      const mainM = mult('arlan', 'ult', lv.ult) * (six ? 1.2 : 1)
      const adjM = six ? mainM : mult('arlan', 'ult_a2', lv.ult)
      sim.hitBlast(u, primary,
        { type: 'ult', mult: mainM, toughDmg: 15, label: 'Frenzied Punishment (main)', split: [0.3, 0.1, 0.6] },
        { type: 'ult', mult: adjM, toughDmg: 15, label: 'Frenzied Punishment (adj)', split: [0.3, 0.1, 0.6] },
      )
      sim.log(`${u.name} Ult: Frenzied Punishment (Blast)`)
      return
    }

    if (action.kind === 'skill') {
      // Shackle Breaker: costs 15% Max HP, deals no Skill Point (free)
      hpCost(sim, u, u.maxHp * 0.15)
      refreshPain(sim, u, ctx)
      // E2: Skill removes 1 debuff from Arlan
      if (eid >= 2) sim.dispel(u)
      // E1: HP ≤50% → Skill DMG +10%
      const s = mult('arlan', 'skill', lv.skill) * (eid >= 1 && lowHp(u) ? 1.1 : 1)
      const t = manualTarget(sim, action, enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0]))
      sim.hit(u, t, { type: 'skill', mult: s, toughDmg: 30, label: 'Shackle Breaker' })
      sim.gainEnergy(u, 30)
      sim.log(`${u.name} Skill: Shackle Breaker`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('arlan', 'basic', lv.basic), toughDmg: 10, label: 'Lightning Rush', split: [0.3, 0.7] })
  },
  onKill(sim, u, _victim, ctx) {
    // A2 Revival: HP ≤30% when defeating an enemy → heal 20% Max HP (no once-per-battle gate in canon)
    if (u.hp / Math.max(1, u.maxHp) <= 0.3) {
      const heal = Math.round(u.maxHp * 0.2)
      sim.heal(u, heal)
      refreshPain(sim, u, ctx)
      sim.log(`${u.name} A2 Revival: heals ${heal}`)
    }
  },
}


// ===== jingliu  (was jingliu.ts) =====
function levelsOf_jingliu(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

function inSpectral(ctx: Record<string, unknown>): boolean {
  return ctx.jlInSpectral === true
}

function spectralCap(ctx: Record<string, unknown>): number {
  // canon: Syzygy stacks up to 4 (E6: limit +1 = 5)
  return ((ctx.eidolon as number) ?? 0) >= 6 ? 5 : 4
}

function exitSpectral(sim: SimApi, u: Unit, ctx: Record<string, unknown>): void {
  ctx.jlInSpectral = false
  ctx.syzygy = 0
  sim.removeBuff(u, 'jingliu_spectral')
  sim.removeBuff(u, 'jingliu_moon')
  sim.log(`${u.name} leaves Spectral Transmigration`)
}

function enterSpectral(sim: SimApi, u: Unit, ctx: Record<string, unknown>, lv: AbilityLevels): void {
  ctx.jlInSpectral = true
  // canon (talent 1121204): enter at ≥2 stacks with +1 extra; E6 additionally gains 2 stacks
  ctx.syzygy = 2 + 1 + (((ctx.eidolon as number) ?? 0) >= 6 ? 2 : 0)
  const eid = (ctx.eidolon as number) ?? 0
  const mods: Mod[] = [
    { stat: 'critRate', value: mult('jingliu', 'talent_a2', lv.talent) },
    { stat: 'boost:ult', value: 0.2 }, // A2 Deathrealm: +20% Ultimate DMG while in state
    { stat: 'effRes', value: 0.35 },
  ]
  if (eid >= 6) mods.push({ stat: 'resPen:Ice', value: 0.3 }) // E6: Ice RES PEN +30% while in state
  sim.addBuff(u, { id: 'jingliu_spectral', name: 'Spectral Transmigration', mods, turns: Infinity })
  sim.advance(u, 1.0) // action advanced 100% on entering (talent #6)
  const cap = spectralCap(ctx)
  if ((ctx.syzygy as number) >= cap) ctx.jlFrostNext = true
  sim.log(`${u.name} enters Spectral Transmigration (${ctx.syzygy}/${cap} Syzygy)`)
}

// A6 Frost Wraith: when Syzygy reaches its stack limit, next attack ignores 25% DEF (consumed once)
function armFrost(sim: SimApi, u: Unit, ctx: Record<string, unknown>, target: Unit): void {
  if (!ctx.jlFrostNext || !target || target.dead) return
  sim.addBuff(target, { id: '_jw6', name: 'Frost Wraith DEF↓', mods: [{ stat: 'defIgnore', value: 0.25 }], turns: Infinity, debuff: true } as never)
  sim.log(`${u.name} Frost Wraith A6: attack ignores 25% DEF`)
}
function disarmFrost(sim: SimApi, ctx: Record<string, unknown>, target: Unit): void {
  if (!ctx.jlFrostNext || !target) return
  sim.removeBuff(target, '_jw6')
  ctx.jlFrostNext = false
}

// Moonlight: in state, every ally-DMG-received/HP-consume event +1 stack (cap 5);
// each stack +CRIT DMG talent% (E4: an additional 20% per stack)
function rebuildMoonlight(sim: SimApi, u: Unit, ctx: Record<string, unknown>, lv: AbilityLevels): void {
  const stacks = (ctx.jlMoon as number) ?? 0
  const eid = (ctx.eidolon as number) ?? 0
  const cd = stacks * (mult('jingliu', 'talent', lv.talent) + (eid >= 4 ? 0.2 : 0))
  sim.removeBuff(u, 'jingliu_moon')
  if (cd > 0) {
    sim.addBuff(u, { id: 'jingliu_moon', name: 'Moonlight', mods: [{ stat: 'critDmg', value: cd }], turns: Infinity })
    sim.log(`${u.name} Moonlight ${stacks} stacks (+${Math.round(cd * 100)}% CRIT DMG)`)
  }
}

// canon (talent #8): after allies receive DMG or consume HP a total of 20 times → +1 Syzygy.
// Each attack received by each target counts once (dedup by attackNo + target id).
function allyHpEvent(sim: SimApi, u: Unit, target: Unit, ctx: Record<string, unknown>, lv: AbilityLevels): void {
  const seq = sim.attackNo()
  const key = `${seq}:${target.id}`
  const set = ((ctx.jlEvtTags as Set<string>) ?? (ctx.jlEvtTags = new Set())) as Set<string>
  if (set.has(key)) return
  set.add(key)
  if (inSpectral(ctx)) {
    ctx.jlMoon = Math.min(5, ((ctx.jlMoon as number) ?? 0) + 1)
    rebuildMoonlight(sim, u, ctx, lv)
  }
  ctx.jlTally = ((ctx.jlTally as number) ?? 0) + 1
  if ((ctx.jlTally as number) >= mult('jingliu', 'talent_a3', lv.talent)) {
    ctx.jlTally = 0
    gainSyzygy(sim, u, ctx, lv, 1)
  }
}

// canon (talent #2): Jingliu's attacks in the state consume 5% Max HP from HER TEAMMATES (not self),
// each above 1 HP. Each consumed ally counts as an HP-consume event.
function drainAllies(sim: SimApi, u: Unit, ctx: Record<string, unknown>, lv: AbilityLevels): void {
  let consumed = 0
  for (const a of sim.allies('ally')) {
    if (a === u || a.kind !== 'char' || a.dead) continue
    const lost = -sim.hpChange(a, -Math.round(a.maxHp * 0.05), 'drain')
    sim.fireAllyHpLoss(a, lost)
    consumed += lost
    allyHpEvent(sim, u, a, ctx, lv)
  }
  if (consumed > 0) sim.log(`${u.name} Spectral drain: team -5% Max HP`)
}

// E1 Moon Crashes Tianguan Gate: Ult/Enhanced Skill → CRIT DMG +36% (1 turn, transient) +
// 1 instance Ice DMG = 80% of Max HP to the primary target
function e1Proc(sim: SimApi, u: Unit, target: Unit): void {
  sim.addBuff(u, { id: 'jingliu_e1', name: 'Moon Crashes Tianguan Gate', mods: [{ stat: 'critDmg', value: 0.36 }], turns: 0 })
  sim.hit(u, target, { type: 'add', noSeq: true, elem: 'Ice', scaleStat: 'hp', mult: 0.8, canCrit: true, label: 'E1 Tianguan Gate' })
}

export const jingliuKit: KitDef = {
  id: 'jingliu',
  name: 'Jingliu',
  elem: 'Ice',
  energyMax: 140,
  base: { ...PROG.jingliu.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #150804 "Flowing Frostblade" (Technique): enter with +15 Energy, +1 Syzygy, and a 100% base
  // chance to Freeze every enemy for 1 turn. Frozen enemies take Ice Additional DMG = 80% of
  // Jingliu's Max HP at the start of each of their turns (see onFrozenTurn).
  technique: {
    name: 'Flowing Frostblade',
    kind: 'buff',
    apply(sim, u, ctx) {
      sim.gainEnergy(u, 15)
      gainSyzygy(sim, u, ctx as unknown as Record<string, unknown>, levelsOf_jingliu(ctx), 1)
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.applyDebuff(sim.allies('ally').find(a => a.kitId === 'jingliu' && !a.dead) ?? u, e, 1, () => {
          const d = { kind: 'Freeze' as const, elem: 'Ice' as const, turns: 1, baseDmg: u.maxHp * 0.8, jlFrozen: true }
          e.dots.push(d as never)
          sim.log(`${u.name} Technique: ${e.name} Frozen`)
        }, 'Freeze', 'Freeze')
      }
    },
  },
  decide(sim, u, ctx) {
    // in state → the free Enhanced Skill Moon On Glacial River (a Skill action, no SP cost:
    // perform's inSpectral branch skips spendSp); otherwise build Syzygy with the normal Skill
    if (inSpectral(ctx as Record<string, unknown>)) return { kind: 'skill' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf_jingliu(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = ctx as Record<string, unknown>
    const target = lowestHpEnemy(sim, u) ?? sim.livingEnemiesOf(u)[0]
    if (!target) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      armFrost(sim, u, rt, target)
      sim.hitBlast(u, target,
        { type: 'ult', scaleStat: 'hp', mult: mult('jingliu', 'ult', lv.ult), toughDmg: 20, label: 'Florephemeral Dreamflux' },
        { type: 'ult', scaleStat: 'hp', mult: mult('jingliu', 'ult_a2', lv.ult), toughDmg: 10, label: 'Florephemeral (adj)' },
      )
      disarmFrost(sim, rt, target)
      if (eid >= 1) e1Proc(sim, u, target)
      if (eid >= 2) { rt.jlE2Next = true; sim.log(`${u.name} E2: next Enhanced Skill +80%`) }
      // canon: any Ult (in or out of state) grants 1 Syzygy; drains only in state
      if (inSpectral(rt)) drainAllies(sim, u, rt, lv)
      gainSyzygy(sim, u, rt, lv, 1)
      return
    }

    if (action.kind === 'skill' && !inSpectral(rt) && sim.spendSp(1)) {
      // Transcendent Flash: single, +1 Syzygy; A4 Sword Champion: +15 Energy (sp_base 20 → 35)
      sim.gainEnergy(u, 20)
      sim.gainEnergy(u, 15)
      sim.log(`${u.name} Jingliu A4: Sword Champion +15 Energy`)
      sim.hit(u, target, { type: 'skill', scaleStat: 'hp', mult: mult('jingliu', 'skill', lv.skill), toughDmg: 10, label: 'Transcendent Flash' })
      gainSyzygy(sim, u, rt, lv, 1)
      return
    }

    if (inSpectral(rt)) {
      // Moon On Glacial River: enhanced SKILL (no SP, no SP gain); consumes 1 Syzygy
      // A4 Sword Champion: +8 Energy (sp_base 30 → 38)
      sim.gainEnergy(u, 30)
      sim.gainEnergy(u, 8)
      sim.log(`${u.name} Jingliu A4: Sword Champion +8 Energy`)
      if (eid >= 2 && rt.jlE2Next) {
        sim.addBuff(u, { id: 'jingliu_e2', name: 'Crescent Shadows Qixing Dipper', mods: [{ stat: 'dmgAll', value: 0.8 }], turns: 0 })
        rt.jlE2Next = false
        sim.log(`${u.name} E2: next Enhanced Skill +80% applied`)
      }
      armFrost(sim, u, rt, target)
      sim.hitBlast(u, target,
        { type: 'skill', scaleStat: 'hp', mult: mult('jingliu', 'skill_en', lv.skill), toughDmg: 15, label: 'Moon On Glacial River', split: [0.1, 0.1, 0.1, 0.2, 0.5] },
        { type: 'skill', scaleStat: 'hp', mult: mult('jingliu', 'skill_en_a2', lv.skill), toughDmg: 7.5, label: 'Moon (adj)' },
      )
      disarmFrost(sim, rt, target)
      if (eid >= 1) e1Proc(sim, u, target)
      drainAllies(sim, u, rt, lv)
      rt.syzygy = ((rt.syzygy as number) ?? 0) - 1
      if ((rt.syzygy as number) <= 0) exitSpectral(sim, u, rt)
      return
    }

    // normal basic (out of state): Lucent Moonglow gives +1 SP (bp_add 1)
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, target, { type: 'basic', scaleStat: 'hp', mult: mult('jingliu', 'basic', lv.basic), toughDmg: 10, label: 'Lucent Moonglow' })
  },

  // canon (talent #8): allies RECEIVING damage counts toward Syzygy — fires when an ally is hit
  onAllyHit(sim, attacker, target, dmg, ctx) {
    if (!target || target.side !== 'ally' || target.kind !== 'char' || target.dead) return
    const u = sim.allies('ally').find(a => a.kitId === 'jingliu' && !a.dead)
    if (!u) return
    allyHpEvent(sim, u, target, ctx as Record<string, unknown>, levelsOf_jingliu(ctx))
  },
  // Technique Freeze: Ice Additional DMG = 80% of Jingliu's Max HP at the frozen enemy's turn start.
  onFrozenTurn(sim, u) {
    const d = u.dots.find(x => (x as unknown as { jlFrozen?: boolean }).jlFrozen) as unknown as { jlFrozen?: boolean } | undefined
    if (!d) return
    const jl = sim.allies('ally').find(a => a.kitId === 'jingliu' && !a.dead)
    if (!jl) return
    sim.hit(jl, u, { type: 'add', elem: 'Ice', scaleStat: 'hp', mult: 0.8, canCrit: false, noSeq: true, label: 'Frozen Additional DMG' })
  },
}

function gainSyzygy(sim: SimApi, u: Unit, ctx: Record<string, unknown>, lv: AbilityLevels, n: number): void {
  const cap = spectralCap(ctx)
  const cur = (ctx.syzygy as number) ?? 0
  const next = Math.min(cap, cur + n)
  ctx.syzygy = next
  if (next >= cap && next > cur) { ctx.jlFrostNext = true }
  if (!inSpectral(ctx)) {
    if (next >= 2) enterSpectral(sim, u, ctx, lv)
    else sim.log(`${u.name} Syzygy ${cur} → ${next}`)
  }
}

// ===== phainon  (was phainon.ts) =====
const COREFLAME_CAP = 12
const EXTRA_TURNS = 8
const SS_STACK_BOOST = 0.20 // each Soulscorch stack ×+20% of the base counter mult (140809 #5)

/** typed runtime bag for Phainon's transformation economy */
interface PhainonRt extends KitRuntime {
  coreflame?: number
  overflow?: number
  territory?: boolean
  surge?: number
  scourge?: number
  ssActive?: boolean
  ssAwaited?: number
  ssStacks?: number
  extraLeft?: number
}

function khaslanaOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`kh_${u.id}`)
}

function refreshKhaslana(sim: SimApi, u: Unit, kh: Unit): void {
  kh.base.atk = eff(u).atk // mirror Phainon's (transform-boosted) ATK
  mirrorOwnerCrit(u, kh) // CRIT is Phainon's, live (no snapshot to go stale mid-transformation)
  kh.base.level = u.base.level
}

function gains(sim: SimApi, u: Unit): PhainonRt {
  const rt = sim.rt(u) as PhainonRt
  if (typeof rt.coreflame !== 'number') rt.coreflame = 0
  return rt
}

function gainCoreflame(sim: SimApi, u: Unit, n: number, ctx: KitRuntime): void {
  const rt = gains(sim, u)
  const before = rt.coreflame!
  rt.coreflame = Math.min(COREFLAME_CAP + 3, before + n)
  if (rt.coreflame !== before) sim.log(`Phainon: Coreflame ${before} → ${rt.coreflame}`)
  void ctx
}

/** Deploy Territory "Ruinous Irontomb": marker + all enemies gain Physical weakness. */
function deployTerritory(sim: SimApi, u: Unit): void {
  const rt = gains(sim, u)
  rt.territory = true
  for (const e of sim.livingEnemiesOf(u)) sim.applyWeakness(u, e, 'Physical')
  sim.log('Phainon deploys Ruinous Irontomb (enemies get Physical weakness)')
}

function clearTerritory(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = gains(sim, u)
  rt.territory = false
  rt.ssActive = false
  rt.ssAwaited = 0
  // 140804: transformation ends → regain Coreflame from the stored overflow (+3 cap in gainCoreflame)
  if (rt.overflow! > 0) gainCoreflame(sim, u, rt.overflow!, ctx)
  rt.overflow = 0
}

/** A3: transform start/end -> +50% ATK, stack up to 2. */
function atkSurge(sim: SimApi, u: Unit): void {
  const st = ((sim.rt(u) as { surge?: number }).surge ?? 0) + 1
  ;(sim.rt(u) as { surge?: number }).surge = st
  sim.removeBuff(u, 'ph_atk')
  if (st > 0) sim.addBuff(u, { id: 'ph_atk', name: 'Bide in Flames', mods: [{ stat: 'atkPct', value: 0.50 * Math.min(2, st) }] })
}

/** Enhanced Basic "Bloodthorn Ferry": +2 Scourge, Physical Blast. */
function bloodthorn(sim: SimApi, kh: Unit, owner: Unit, ctx: KitRuntime, target: Unit): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(owner) as { scourge?: number }
  rt.scourge = (rt.scourge ?? 0) + 2
  sim.hitBlast(kh, target,
    { type: 'basic', elem: 'Physical', mult: mult('phainon', 'mem_basic', lv.talent), toughDmg: 20, label: 'Bloodthorn Ferry (main)' },
    { type: 'basic', elem: 'Physical', mult: mult('phainon', 'mem_basic_a2', lv.talent), toughDmg: 10, label: 'Bloodthorn Ferry (adj)' })
}

/** "Calamity: Soulscorch Edict" (140809): +Scourge per enemy +1 Soulscorch state. All enemies
 *  immediately take action; each enemy turn that elapses stacks +1 (E4: +4 to start); Khaslana
 *  takes 75% reduced DMG while the state is up. When all advanced enemies have acted, the
 *  Counter fires (see soulscorchCounter). If still active when Khaslana's extra turn starts,
 *  it fires at that turn's start instead. */
function soulscorch(sim: SimApi, kh: Unit, owner: Unit, ctx: KitRuntime): void {
  const eid = (ctx.eidolon as number) ?? 0
  const rt = gains(sim, owner)
  const nEn = sim.livingEnemiesOf(owner).length
  rt.scourge = (rt.scourge ?? 0) + nEn
  rt.ssActive = true
  rt.ssAwaited = nEn
  rt.ssStacks = 1 + (eid >= 4 ? 4 : 0)
  // while Soulscorch, Khaslana takes 75% reduced DMG
  sim.removeBuff(kh, 'ph_ss')
  sim.addBuff(kh, { id: 'ph_ss', name: 'Soulscorch Edict', mods: [{ stat: 'mitigation', value: 0.75 }], turns: Infinity })
  // all living enemies immediately take action (advance to the top of the timeline)
  for (const e of sim.livingEnemiesOf(owner)) sim.advance(e, 1.0)
  sim.log(`Khaslana: Soulscorch Edict (+${nEn} Scourge, ${rt.ssStacks} SS — enemies advance)`)
}

/** The deferred Counter: Physical DMG to ALL enemies (mem_edict) + mem_edict_a2 instances of
 *  mem_edict_a3 to a random enemy; each stack multiplies the counters ×(1+0.20·stacks); then the
 *  Soulscorch state is dispelled. Counts as Skill DMG (140809). */
function soulscorchCounter(sim: SimApi, kh: Unit, owner: Unit, ctx: KitRuntime): void {
  const rt = gains(sim, owner)
  if (!rt.ssActive) return
  const lv = levelsOf(ctx)
  const stacks = rt.ssStacks ?? 1
  const factor = 1 + SS_STACK_BOOST * stacks
  const aoe = mult('phainon', 'mem_edict', lv.talent) * factor
  const per = mult('phainon', 'mem_edict_a3', lv.talent) * factor
  const instances = Math.max(1, Math.round(mult('phainon', 'mem_edict_a2', lv.talent)))
  for (const e of sim.livingEnemiesOf(owner))
    sim.hit(kh, e, { type: 'skill', elem: 'Physical', mult: aoe, toughDmg: 10, label: 'Soulscorch Counter (AoE)' })
  sim.hitRandom(kh, instances, { type: 'skill', elem: 'Physical', mult: per, label: 'Soulscorch Counter' })
  rt.ssActive = false
  rt.ssAwaited = 0
  sim.removeBuff(kh, 'ph_ss')
  sim.log(`Khaslana: Soulscorch Counter (${stacks} SS ×${factor.toFixed(2)})`)
}

/** "Foundation: Stardeath Verdict": consume Scourge -> lots of hits + even AoE when >=4. */
function verdict(sim: SimApi, kh: Unit, owner: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(owner) as { scourge?: number }
  const sc = Math.max(0, rt.scourge ?? 0)
  rt.scourge = 0
  const per = mult('phainon', 'mem_verdict_a2', lv.talent)
  const instances = sc * mult('phainon', 'mem_verdict_a3', lv.talent)
  sim.hitRandom(kh, instances, { type: 'ult', elem: 'Physical', mult: per, label: 'Stardeath Verdict (hits)' })
  if (sc >= mult('phainon', 'mem_verdict_a4', lv.talent)) {
    const em = mult('phainon', 'mem_verdict', lv.talent)
    for (const e of sim.livingEnemiesOf(owner))
      sim.hit(kh, e, { type: 'ult', elem: 'Physical', mult: em, toughDmg: 30, label: 'Stardeath Verdict (AoE)' })
    // E2: consuming 4+ Scourge grants an extra turn (awarded as extra Khaslana action)
    if (eid >= 2) sim.log('Khaslana E2: Verdict consumed 4+ Scourge')
  }
  sim.log(`Khaslana: Stardeath Verdict (${sc} Scourge → ${instances} hits)`)
}

/** Final hit of the transformation: Physical Ult DMG distributed evenly across all enemies. */
function finalHit(sim: SimApi, kh: Unit, owner: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const nEn = Math.max(1, sim.livingEnemiesOf(owner).length)
  const per = mult('phainon', 'ult', lv.ult) / nEn
  for (const e of sim.livingEnemiesOf(owner))
    sim.hit(kh, e, { type: 'ult', elem: 'Physical', mult: per, toughDmg: 30, label: 'Final: Let There Be Light' })
  sim.log(`Khaslana: Final Ult hit (${per.toFixed(2)}% ATK × ${nEn} enemies)`)
}

function khaslanaHeal(sim: SimApi, kh: Unit): void {
  sim.heal(kh, kh.maxHp * 0.20)
}

/** 140804 "Pyric Corpus": Phainon targeted by an ability from another target → +1 Coreflame;
 *  if the ability was cast by a teammate, ALSO +talent% CRIT DMG for 3 turns. Enemy attacks
 *  count as non-teammate targets (onAllyHit); teammate heals/shields count as teammate casts
 *  (onAllyHeal / onAllyShield — heals can only come from teammates, Phainon has no self-heal). */
function pyric(sim: SimApi, target: Unit, ctx: KitRuntime, byTeammate: boolean): void {
  if (target.kind !== 'char' || target.kitId !== 'phainon') return
  gainCoreflame(sim, target, 1, ctx)
  if (byTeammate) {
    sim.addBuff(target, {
      id: 'ph_tgtcd', name: 'Pyric Corpus',
      mods: [{ stat: 'critDmg', value: mult('phainon', 'talent', levelsOf(ctx).talent) }], turns: 3,
    })
  }
}

export const phainonKit: KitDef = {
  id: 'phainon',
  name: 'Phainon',
  elem: 'Physical',
  energyMax: 120,
  // canon (Energy.md): Phainon does not use the Energy system — Coreflame gate mirrors decide;
  // no sp_base +5 after the cast
  ultActivation: { kind: 'ready', check: (sim, u) => {
    const rt = gains(sim, u)
    return rt.coreflame! >= COREFLAME_CAP && !khaslanaOf(sim, u) && sim.livingEnemiesOf(u).length > 0
  } },
  ultConsumption: 'none',
  base: { ...PROG.phainon.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 140807 "Beginning of the End": AoE 200% ATK Physical + 25 Energy for allies + 1 SP. (Scourge is a
  // Khaslana-form resource, not held pre-transform → not modeled here.) attack Technique.
  technique: {
    name: 'Beginning of the End',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Physical', mult: 2.0, toughDmg: 10, label: 'Beginning of the End' })
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.gainEnergy(a, 25)
      sim.gainSp(1)
    },
  },
  onStart(sim, u, ctx) {
    gains(sim, u).coreflame = 0
    const eid = (ctx.eidolon as number) ?? 0
    gainCoreflame(sim, u, 1 + (eid >= 6 ? 6 : 0), ctx) // A1: battle start +1; E6 +6
  },
  // A2 "Undying Resolve": receiving healing from a teammate → +45% DMG for 4 turns
  // (Phainon has no self-heal, so any heal on him is from a teammate; shield half now real
  //  via kit hook onAllyShield, fired in sim.addBuff when an ally receives a Buff.shield)
  onAllyHeal(sim, target, _amount, ctx) {
    if (target.kind !== 'char' || target.kitId !== 'phainon') return
    pyric(sim, target, ctx, true)
    sim.addBuff(target, { id: 'ph_a2', name: 'March to Oblivion', mods: [{ stat: 'dmgAll', value: 0.45 }], turns: 4 })
  },
  onAllyShield(sim, target, _amount, ctx) {
    if (target.kind !== 'char' || target.kitId !== 'phainon') return
    pyric(sim, target, ctx, true)
    sim.addBuff(target, { id: 'ph_a2', name: 'March to Oblivion', mods: [{ stat: 'dmgAll', value: 0.45 }], turns: 4 })
  },
  // 140804: an enemy targeting Phainon with an attack → +1 Coreflame, no CD buff
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    pyric(sim, target, ctx, false)
  },
  // 140809: enemies acting during Soulscorch stack +1 each; when all advanced enemies have
  // finished, the Counter fires (see soulscorchCounter)
  onEnemyTurnEnd(sim, u, _enemy, ctx) {
    const rt = gains(sim, u)
    if (!rt.ssActive) return
    const kh = khaslanaOf(sim, u)
    if (!kh) return
    rt.ssStacks = (rt.ssStacks ?? 1) + 1
    rt.ssAwaited = (rt.ssAwaited ?? 0) - 1
    if (rt.ssAwaited! <= 0) soulscorchCounter(sim, kh, u, ctx)
  },
  decide(sim, u, ctx) {
    const rt = gains(sim, u)
    if (rt.coreflame! >= COREFLAME_CAP && !khaslanaOf(sim, u) && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  onSummonTurn(sim, kh, owner, ctx) {
    const rt = sim.rt(owner) as PhainonRt
    const eid = (ctx.eidolon as number) ?? 0
    if (typeof rt.extraLeft !== 'number') rt.extraLeft = EXTRA_TURNS
    rt.extraLeft!--
    refreshKhaslana(sim, owner, kh)
    // 140809: Soulscorch still active at the start of Khaslana's extra turn → Counter fires now
    if (rt.ssActive) soulscorchCounter(sim, kh, owner, ctx)
    // Final hit on the last extra turn, then end the transformation
    if (rt.extraLeft! <= 0) {
      finalHit(sim, kh, owner, ctx)
      clearTerritory(sim, owner, ctx)
      sim.unregisterUnit(kh.id)
      atkSurge(sim, owner) // A3: transformation ends -> +50% ATK
      sim.log('Khaslana transformation ends')
      return
    }
    // Turn policy: alternate Enhanced Basic (build Scourge), Soulscorch Edict (reload+counter),
    // Stardeath Verdict (spend). Ensures all three fire across the 8-turn window.
    const sc = rt.scourge ?? 0
    const main = sim.livingEnemiesOf(owner)[0]
    if (sc >= 4) {
      verdict(sim, kh, owner, ctx)
    } else if ((rt.extraLeft! === EXTRA_TURNS - 1) || (rt.extraLeft! % 2 === 1)) {
      // early turns / odd turns: build with Enhanced Basic
      bloodthorn(sim, kh, owner, ctx, main)
    } else {
      soulscorch(sim, kh, owner, ctx)
    }
    if (eid >= 1) sim.log('Khaslana E1: SPD inheritance') // E1 modeled via base SPD already
    khaslanaHeal(sim, kh)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      const rt = gains(sim, u)
      if (rt.coreflame! < COREFLAME_CAP) return
      // 140804: the transformation consumes 12 Coreflame; excess is kept as overflow and
      // returned when the transformation ends (gainCoreflame caps it at +3, E6 opens the cap)
      rt.overflow = Math.max(0, rt.coreflame! - COREFLAME_CAP)
      rt.coreflame = Math.max(0, rt.coreflame! - COREFLAME_CAP)
      // Transform into Khaslana: Territory + summon Khaslana with 8 extra turns
      u.energy = 0
      // Transformation state lives on the OWNER runtime (onSummonTurn/bloodthorn/soulscorch/verdict all
      // read sim.rt(owner)), so a re-transformation must reset it here — `extraLeft` left at 0 from the
      // previous one made the new Khaslana fire its Final Ult and despawn on its first turn.
      rt.extraLeft = EXTRA_TURNS
      rt.scourge = 4 // Scourge on transformation (140805 #1)
      rt.ssActive = false
      rt.ssAwaited = 0
      deployTerritory(sim, u)
      atkSurge(sim, u) // A3: entering combat -> +50% ATK
      // ATK+/MaxHP+ transform buffs on Phainon (Khaslana mirrors his boosted ATK)
      sim.removeBuff(u, 'ph_tatk')
      sim.removeBuff(u, 'ph_thp')
      sim.addBuff(u, { id: 'ph_tatk', name: 'He Who Bears the World Must Burn', mods: [{ stat: 'atkPct', value: mult('phainon', 'mem_talent', lv.talent) }] })
      sim.addBuff(u, { id: 'ph_thp', name: 'He Who Bears the World Must Burn', mods: [{ stat: 'hpPct', value: mult('phainon', 'mem_talent_a5', lv.talent) }] })
      const ratio = eid >= 1 ? Math.min(0.84, 0.66 + 0.015 * 0) : 0.60 // E1: scaled by kills (0 here)
      const kh: Unit = {
        id: `kh_${u.id}`, name: 'Khaslana', side: 'ally', kind: 'transformed', elem: 'Physical',
        base: { level: 80, hp: 1, atk: sim.effAtk(u), def: eff(u).def, spd: Math.max(1, Math.round(eff(u).spd * ratio)) },
        hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
        buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
        weaknesses: [], res: {}, kitId: u.kitId,
      }
      const krt = sim.rt(kh) as { ownerId?: string }
      krt.ownerId = u.id
      sim.registerUnit(kh)
      sim.advance(kh, 1.0)
      khaslanaHeal(sim, kh)
      sim.log(`Phainon transforms into Khaslana (SPD ${kh.base.spd}, Scourge 4, 8 extra turns)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      const main = sim.livingEnemiesOf(u)[0]
      if (!main) return
      gainCoreflame(sim, u, 2, ctx)
      sim.hitBlast(u, main,
        { type: 'skill', elem: 'Physical', mult: mult('phainon', 'skill', lv.skill), toughDmg: 20, label: 'Let There Be Light (main)' },
        { type: 'skill', elem: 'Physical', mult: mult('phainon', 'skill_a2', lv.skill), toughDmg: 10, label: 'Let There Be Light (adj)' })
      sim.gainEnergy(u, 30)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, sim.livingEnemiesOf(u)[0], { type: 'basic', elem: 'Physical', mult: mult('phainon', 'basic', lv.basic), toughDmg: 10, label: 'Stride to Deliverance' })
  },
}


// ===== clara  (was clara.ts) =====
function fireCounter(sim: SimApi, clara: Unit, attacker: Unit, enhanced: boolean, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  // Revenge trace: Svarog's Counter DMG +30% (applies to the whole counter, incl. ult #2 extra)
  const base = mult('clara', 'talent', lv.talent) * 1.3
  const m = enhanced ? (base + mult('clara', 'ult_a2', lv.ult) * 1.3) : base
  if (enhanced) {
    // Enhanced Counter: enemies adjacent to the primary take 50% of the primary DMG
    sim.hitBlast(clara, attacker,
      { type: 'fua', mult: m, elem: 'Physical', toughDmg: 10, label: 'Svarog Counter' },
      { type: 'fua', mult: m * 0.5, elem: 'Physical', toughDmg: 5, label: 'Svarog Counter (adj)' },
    )
  } else {
    sim.hit(clara, attacker, { type: 'fua', mult: m, elem: 'Physical', toughDmg: 10, label: 'Svarog Counter' })
  }
  sim.addBuff(attacker, { id: 'clara_mark', name: 'Mark of Counter', mods: [], turns: 999, sourceId: clara.id })
  // Because We're Family talent sp_base 5 → Counter regenerates energy (herta/kafka pattern)
  sim.gainEnergy(clara, 5)
  sim.log(`Svarog Counter → ${attacker.name}${enhanced ? ' (Enhanced)' : ''} (energy +5)`)
}

export const claraKit: KitDef = {
  id: 'clara',
  name: 'Clara',
  elem: 'Physical',
  energyMax: 110,
  base: { ...PROG.clara.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 110707 "A Small Price for Victory": raises Clara's aggro (more likely to be attacked) for 2 turns.
  technique: {
    name: 'A Small Price for Victory',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'clara_tech_aggro', name: 'A Small Price for Victory', mods: [{ stat: 'aggro', value: 150 }], turns: 2 })
    },
  },
  onStart(sim, u, ctx) {
    // Talent "Because We're Family" #3: DMG taken -10% permanently; self-aggro flatten
    sim.addBuff(u, { id: 'clara_protect', name: "Because We're Family", mods: [{ stat: 'mitigation', value: 0.1 }], turns: Infinity })
    u.aggro = 150
    disarmWindow(ctx, 'clara_counter')
  },
  onTurnStart(sim, u, ctx) {
    // E4 Family's Warmth: "until the start of her next turn" → cleared here, not by generic buff expiry
    if (sim.hasBuff(u, 'clara_e4')) sim.removeBuff(u, 'clara_e4')
  },
  onAllyHit(sim, attacker, target, _dmg, ctx) {
    if (target.kind !== 'char' || target.dead || attacker.side !== 'enemy') return
    const clara = sim.allies('ally').find(u => u.kitId === 'clara' && !u.dead)
    if (!clara) return
    const rt = sim.rt(clara)
    const eid = (ctx.eidolon as number) ?? 0

    // E4 Family's Warmth: after Clara is hit, DMG taken -30% until her next turn
    if (target.kitId === 'clara' && eid >= 4) {
      if (sim.hasBuff(target, 'clara_e4')) sim.removeBuff(target, 'clara_e4')
      sim.addBuff(target, { id: 'clara_e4', name: "Family's Warmth", mods: [{ stat: 'mitigation', value: 0.3 }], turns: 999 })
    }

    // Enhanced counter (ult): ANY ally attacked → immediate Counter, consumes one charge of the window
    if (consumeWindow(rt, 'clara_counter')) {
      fireCounter(sim, clara, attacker, true, ctx)
    }
    // Normal counter: Clara herself hit; E6: other allies hit → 50% fixed-chance Counter as well
    else if (target.kitId === 'clara' || (eid >= 6 && sim.rng() < 0.5)) {
      fireCounter(sim, clara, attacker, false, ctx)
    }
  },
  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Promise, Not Command deals NO damage: +DR #4 (0.25 lv10) + heavy aggro for #3 (2t); Svarog Counter enhanced +1.6 (ult_a2)
      const dr = [0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3]
      const drVal = dr[Math.min(lv.ult - 1, dr.length - 1)]
      if (sim.hasBuff(u, 'clara_ult')) sim.removeBuff(u, 'clara_ult')
      sim.addBuff(u, { id: 'clara_ult', name: 'Promise, Not Command', mods: [{ stat: 'mitigation', value: drVal }, { stat: 'aggro', value: 500 }], turns: 2 })
      armWindow(rt, 'clara_counter', eid >= 6 ? 3 : 2)
      sim.log(`${u.name} Ult: Promise, Not Command (${windowCharges(rt, 'clara_counter')} enhanced counters) (energy +5)`)
      // E2 A Tight Embrace: ATK +30% for 2 turns after ult
      if (eid >= 2) sim.addBuff(u, { id: 'clara_e2', name: 'A Tight Embrace', mods: [{ stat: 'atkPct', value: 0.3 }], turns: 2 })
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // Svarog Watches Over You: AoE #1 to ALL enemies + additional #2 to enemies with Mark of Counter
      for (const e of sim.livingEnemiesOf(u)) {
        if (e.buffs.some(b => b.id === 'clara_mark')) {
          sim.hit(u, e, { type: 'skill', mult: mult('clara', 'skill_a2', lv.skill), elem: 'Physical', toughDmg: 0, label: 'Svarog Watches (extra)', split: [0.25, 0.25, 0.25, 0.25] })
        }
        sim.hit(u, e, { type: 'skill', mult: mult('clara', 'skill', lv.skill), elem: 'Physical', toughDmg: 20, label: 'Svarog Watches (main)' })
      }
      // E1 A Tall Figure: marks retained; otherwise all Marks removed after the Skill
      if (eid < 1) for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'clara_mark')
      sim.log(`${u.name} Skill: Svarog Watches Over You`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('clara', 'basic', lv.basic), elem: 'Physical', toughDmg: 10, label: 'I Want to Help' })
  },
}


// ===== hook  (was hook.ts) =====
function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** Burn: 2 turns (3 with E2), DoT from the skill's DoT column (skill_a2). */
function applyBurn(sim: SimApi, hook: Unit, target: Unit, lv: { skill: number }, e: number): void {
  if (target.dead) return
  const turns = e >= 2 ? 3 : 2
  const base = sim.effAtk(hook) * mult('hook', 'skill_a2', lv.skill)
  sim.applyDebuff(hook, target, 1.0, () => {
    sim.applyDot(target, {
      kind: 'Burn', elem: 'Fire', turns, stacks: 1,
      baseDmg: base, sourceUnit: hook,
    } as unknown as DoTWithSource)
  }, 'Burn', 'Burn')
}

function isBurned(t: Unit): boolean {
  return t.dots.some(d => d.kind === 'Burn')
}

/** E6 "Always Ready to Punch and Kick": +20% DMG to Burned enemies. */
function vsBurned(target: Unit, e: number): number {
  return e >= 6 && isBurned(target) ? 1.2 : 1
}

export const hookKit: KitDef = {
  id: 'hook',
  name: 'Hook',
  elem: 'Fire',
  energyMax: 120,
  base: { ...PROG.hook.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 110907 "Ack! Look at This Mess!": Fire DMG 50% ATK to a random enemy + 100% base chance to
  // inflict Burn (50% ATK, 3 turns) on every enemy. attack Technique.
  technique: {
    name: 'Ack! Look at This Mess!',
    kind: 'attack',
    apply(sim, u) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hit(u, sim.rngPick(enemies), { type: 'basic', mult: 0.5, elem: 'Fire', toughDmg: 10, label: 'Ack! Look at This Mess!' })
      for (const e of enemies) {
        if (e.dead) continue
        sim.applyDebuff(u, e, 1.0, () => sim.applyDot(e, {
          kind: 'Burn', elem: 'Fire', turns: 3, stacks: 1,
          baseDmg: sim.effAtk(u) * 0.5, sourceUnit: u,
        }), 'Burn', 'Burn')
      }
    },
  },
  onStart(sim, u, ctx) {
    ctx.hookEnhanced = false
  },
  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const e = eid(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const primary = manualTarget(sim, action, enemies[0])
      sim.hit(u, primary, { type: 'ult', mult: mult('hook', 'ult', lv.ult) * vsBurned(primary, e), elem: 'Fire', toughDmg: 20, label: 'Boom! Here Comes the Fire!', split: [0.3, 0.7] })
      // A6 Playing With Fire: ult → advance 20% + 5 energy
      sim.advance(u, 0.2)
      sim.gainEnergy(u, 5)
      sim.log(`${u.name} A6 Playing With Fire: advance 20% +5 Energy`)
      rt.hookEnhanced = true
      sim.log(`${u.name} Ult: Boom! → Next Skill Enhanced`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      const enhanced = rt.hookEnhanced as boolean
      if (enhanced) {
        const e1 = e >= 1 ? 1.2 : 1
        const mainM = mult('hook', 'skill_en', lv.skill) * e1 * vsBurned(primary, e)
        const adjM = mult('hook', 'skill_en_a2', lv.skill) * e1
        sim.hitBlast(u, primary,
          { type: 'skill', mult: mainM, elem: 'Fire', toughDmg: 20, label: 'Enhanced Skill (main)' },
          { type: 'skill', mult: adjM, elem: 'Fire', toughDmg: 10, label: 'Enhanced Skill (adj)' },
        )
        applyBurn(sim, u, primary, lv, e)
        rt.hookEnhanced = false
        sim.log(`${u.name} Enhanced Skill: Hey! Remember Hook? (Blast)`)
      } else {
        sim.hit(u, primary, { type: 'skill', mult: mult('hook', 'skill', lv.skill) * vsBurned(primary, e), elem: 'Fire', toughDmg: 20, label: 'Hey! Remember Hook?' })
        applyBurn(sim, u, primary, lv, e)
        sim.log(`${u.name} Skill: Hey! Remember Hook?`)
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('hook', 'basic', lv.basic) * vsBurned(t, e), elem: 'Fire', toughDmg: 10, label: "Hehe! Don't Get Burned!" })
  },

  // Talent "Ha! Oil to the Flames!": attacking a Burned target → Fire Additional DMG + 5 Energy
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.kitId !== 'hook' || attacker.side !== 'ally') return
    if (dmgType === 'fua' || dmgType === 'dot' || dmgType === 'break' || dmgType === 'add') return
    if (target.dead || target.side !== 'enemy' || !isBurned(target)) return
    const hook = attacker
    const lv = levelsOf(ctx)
    const e = eid(ctx)
    const m = mult('hook', 'talent', lv.talent) * vsBurned(target, e)
    if (m > 0) sim.hit(hook, target, { type: 'add', mult: m, label: 'Oil to the Flames', noSeq: true })
    sim.gainEnergy(hook, 5)
    // A2 Innocence: Talent trigger → heal 5% MaxHP
    sim.heal(hook, Math.round(hook.maxHp * 0.05))
    // E4 "It's Okay to Not Know": Talent trigger → 100% base chance to Burn adjacent enemies
    if (e >= 4) for (const en of sim.livingEnemiesOf(hook)) if (en !== target) applyBurn(sim, hook, en, lv, e)
  },
}


// ===== xueyi  (was xueyi.ts) =====
/** Ult toughness (type-ignoring) */
const ULT_TOUGH = 120
/** DMG boost saturates at 40 toughness reduced (per 10 = 25% of max, 4 steps) */
const ULT_BOOST_CAP = 40
/** Karma: 1 stack per 30 toughness Xueyi reduces herself (Honey: 120-toughness Ult = 4 stacks) */
const KARMA_PER_TOUGH = 30
/** Talent FUA: toughness per bounce, energy per bounce (talent sp_base = 2) */
const FUA_TOUGH = 15
const FUA_HITS = 3
const FUA_ENERGY = 2
/** A3 Perspicacious Mainframe: overflow tally cap */
const TALLY_CAP = 6

export function xueyiEid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function karmMax(ctx: KitRuntime): number {
  return xueyiEid(ctx) >= 6 ? 6 : 8
}

/** fire the Talent FUA (3 quantum bounces) when Karma maxes */
function fireFua(sim: SimApi, xueyi: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = xueyiEid(ctx)
  let m = mult('xueyi', 'talent', lv.talent)
  if (eid >= 1) m *= 1.4 // E1 Dvesha: +40% FUA DMG
  sim.hitRandom(xueyi, FUA_HITS, { type: 'fua', mult: m, elem: 'Quantum', toughDmg: FUA_TOUGH, pierceRatio: eid >= 2 ? 1 : undefined, label: 'Karmic Perpetuation FUA' })
  sim.gainEnergy(xueyi, FUA_HITS * FUA_ENERGY)
  if (eid >= 2) sim.heal(xueyi, Math.floor(xueyi.maxHp * 0.05)) // E2: heal 5% MaxHP
  sim.log('Xueyi Karma full → Follow-Up ATK (3 bounces)')
}

/** gain karma; consume-all + FUA when it maxes, A3 tally returns right after */
function gainKarma(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const max = karmMax(ctx)
  const total = ((ctx.karma as number) ?? 0) + n
  if (total < max) {
    ctx.karma = total
    return
  }
  ctx.karmaOvf = Math.min(TALLY_CAP, ((ctx.karmaOvf as number) ?? 0) + total - max)
  ctx.karma = 0
  ctx.inFua = true
  fireFua(sim, u, ctx)
  ctx.inFua = false
  ctx.karma = (ctx.karmaOvf as number) ?? 0
  ctx.karmaOvf = 0
}

export const xueyiKit: KitDef = {
  id: 'xueyi',
  name: 'Xueyi',
  elem: 'Quantum',
  energyMax: 120,
  base: { ...PROG.xueyi.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  // 121407 "Summary Execution": 80% ATK Quantum DMG to all enemies. attack Technique.
  technique: {
    name: 'Summary Execution',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 0.8, label: 'Summary Execution' })
    },
  },
  decide(sim, u) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const t = manualTarget(sim, action, enemies[0])
      // A2 Intrepid Rollerbearings: +10% DMG vs enemy ≥50% toughness
      if (t.maxToughness > 0 && t.toughness / t.maxToughness >= 0.5) {
        sim.addBuff(u, { id: 'xueyi_a2', name: 'Intrepid Rollerbearings', mods: [{ stat: 'dmgAll', value: 0.1 }], turns: 1 })
      }
      // E4 Karma, Severed: ult → Break Effect +40% 2t (lands before the hit's break damage)
      if (xueyiEid(ctx) >= 4) sim.addBuff(u, { id: 'xueyi_e4', name: 'Karma, Severed', mods: [{ stat: 'be', value: 0.4 }], turns: 2 })
      // DMG scales with toughness reduced (per 10 = 25% of max boost, saturates at 40)
      const red = t.broken ? 0 : Math.min(t.toughness, ULT_BOOST_CAP)
      const boost = Math.min(red / 10 * mult('xueyi', 'ult_a2', lv.ult), mult('xueyi', 'ult_a3', lv.ult))
      sim.hit(u, t, { type: 'ult', mult: mult('xueyi', 'ult', lv.ult) * (1 + boost), elem: 'Quantum', toughDmg: ULT_TOUGH, pierceRatio: 1, label: 'Divine Castigation' })
      sim.removeBuff(u, 'xueyi_a2')
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const t = manualTarget(sim, action, enemies[0])
      sim.hitBlast(u, t,
        { type: 'skill', mult: mult('xueyi', 'skill', lv.skill), elem: 'Quantum', toughDmg: 60, label: 'Iniquity Obliteration (main)' },
        { type: 'skill', mult: mult('xueyi', 'skill_a2', lv.skill), elem: 'Quantum', toughDmg: 30, label: 'Iniquity Obliteration (adj)' },
      )
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('xueyi', 'basic', lv.basic), elem: 'Quantum', toughDmg: 10, split: [0.4, 0.6] })
  },

  onStart(sim, u, ctx) {
    ctx.karma = 0
    ctx.karmaOvf = 0
    // A1 Clairvoyant Loom: DMG += 100% of Break Effect, cap 240%
    sim.addBuff(u, { id: 'xueyi_a1', name: 'Clairvoyant Loom', mods: [{ stat: 'dmgAll', value: Math.min(2.4, sim.effBe(u)) }] })
  },

  /** Karmic Perpetuation: Karma from toughness reduced — 1 per 30 own, 1 per ally attack */
  onAfterAttack(sim, attacker, _target, _dmgType, _ctx) {
    if (attacker.side !== 'ally') return
    const xueyi = sim.allies('ally').find(a => a.kitId === 'xueyi' && !a.dead)
    if (!xueyi) return
    const rctx = sim.rt(xueyi)
    if (rctx.inFua) return // FUA doesn't add Karma
    if (sim.toughRed <= 0) return // no toughness reduced → no Karma
    gainKarma(sim, xueyi, rctx, attacker.id === xueyi.id ? Math.floor(sim.toughRed / KARMA_PER_TOUGH) : 1)
  },
}


// ===== misha  (was misha.ts) =====
function eid_misha(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** DoT that carries its source (Freeze's Ice Additional DMG needs it). */
interface DoTWithSource_misha extends NonNullable<Unit['dots'][number]> {
  sourceUnit?: Unit
}

/** Talent Horological Escapement: fires from Simulator.spendSp — each ally SP → +1 hit + energy */
export function mishaOnSpSpend(sim: SimApi): void {
  const misha = sim.allies('ally').find(u => u.kitId === 'misha' && !u.dead)
  if (!misha) return
  const ctx = sim.rt(misha)
  const lv = levelsOf(ctx)
  ctx.ultHits = ((ctx.ultHits as number) ?? 0) + mult('misha', 'talent_a2', lv.talent)
  sim.gainEnergy(misha, mult('misha', 'talent', lv.talent))
}

/** apply Freeze to a target with this Ult's chance + Misha source (for Frozen Additional DMG) */
function tryFreeze(sim: SimApi, misha: Unit, t: Unit, chance: number, frozenDmg: number): void {
  if (t.dead) return
  sim.applyDebuff(misha, t, chance, () => {
    sim.applyDot(t, {
      kind: 'Freeze', elem: 'Ice', turns: 1,
      baseDmg: sim.effAtk(misha) * frozenDmg,
      sourceUnit: misha,
    } as DoTWithSource)
  }, 'Freeze', 'Freeze')
}

/** A3 Transmission: CRIT DMG +30% while hitting a Frozen enemy */
function hitFrozen(sim: SimApi, u: Unit, t: Unit, o: Parameters<SimApi['hit']>[2]): void {
  const frozen = t.dots.some(d => d.kind === 'Freeze')
  if (frozen) sim.addBuff(u, { id: 'misha_a3_cd', name: 'Transmission CRIT DMG+', mods: [{ stat: 'critDmg', value: 0.3 }], turns: 99 })
  sim.hit(u, t, o)
  if (frozen) sim.removeBuff(u, 'misha_a3_cd')
}

export const mishaKit: KitDef = {
  id: 'misha',
  name: 'Misha',
  elem: 'Ice',
  energyMax: 100,
  base: { ...PROG.misha.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  // #131207 "Wait, You Are So Beautiful!" (Technique): Misha's next Ultimate gains +2 Hits Per Action.
  technique: {
    name: 'Wait, You Are So Beautiful!',
    kind: 'buff',
    apply(sim, u, ctx) {
      ctx.ultHits = ((ctx.ultHits as number) ?? 0) + 2
      sim.log(`${u.name} Technique: next Ultimate +2 hits`)
    },
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const hits = ((ctx.ultHits as number) ?? 0)
      ctx.ultHits = 0
      // E1 Whimsicality: +1 hit per enemy (max +5)
      const e1Bonus = eid_misha(ctx) >= 1 ? Math.min(5, sim.livingEnemiesOf(u).length) : 0
      const total = Math.min(3 + hits + e1Bonus, 10) // base 3 + skill/talent extra + E1, cap 10
      // E4 Visage of Kinship: Ult hit DMG multiplier +6% (relative)
      let m = mult('misha', 'ult', lv.ult)
      if (eid_misha(ctx) >= 4) m *= 1.06
      const freezeChance = mult('misha', 'ult_a2', lv.ult)
      const frozenDmg = mult('misha', 'ult_a3', lv.ult)
      // E6 Estrangement of Dream: ult → own DMG+30% until end of turn + next Skill free SP
      if (eid_misha(ctx) >= 6) {
        sim.addBuff(u, { id: 'misha_e6', name: 'Estrangement of Dream', mods: [{ stat: 'dmgAll', value: 0.3 }], turns: 1 })
        ctx.e6FreeSp = true
      }
      // A2 Interlock: +60% EHR for the duration of the Ult
      sim.addBuff(u, { id: 'misha_a2_ehr', name: 'Interlock EHR+', mods: [{ stat: 'ehr', value: 0.6 }], turns: 99 })
      // E2 Yearning: 24% base chance DEF-16% 3 turns before each hit
      const shred = (t: Unit) => { if (eid_misha(ctx) >= 2) sim.applyDebuff(u, t, 0.24, () => {
        sim.addBuff(t, { id: 'misha_e2', name: 'Yearning of Youth DEF↓', mods: [{ stat: 'defRed', value: 0.16 }], turns: 3 })
      }, 'E2 DEF shred') }
      // first hit: single target
      const first = manualTarget(sim, action, enemies[0])
      shred(first)
      // A1 Release: +80% freeze chance before the first hit
      tryFreeze(sim, u, first, freezeChance + 0.8, frozenDmg)
      hitFrozen(sim, u, first, { type: 'ult', mult: m, elem: 'Ice', toughDmg: 20, label: 'First hit — G—Gonna Be Late!' })
      // remaining hits: random enemy
      for (let i = 0; i < total - 1 && sim.livingEnemiesOf(u).length > 0; i++) {
        const ts = [...sim.livingEnemiesOf(u)]
        const t = sim.rngPick(ts)
        shred(t)
        tryFreeze(sim, u, t, freezeChance, frozenDmg)
        hitFrozen(sim, u, t, { type: 'ult', mult: m, elem: 'Ice', toughDmg: 10, label: 'G—Gonna Be Late!' })
      }
      sim.removeBuff(u, 'misha_a2_ehr')
      sim.log(`Misha Ult: ${total} hits (base 3 + ${hits} extra + ${e1Bonus} E1, cap 10)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // E6: after ult, next skill recovers 1 SP (handled via flag set on ult)
      if (ctx.e6FreeSp) { ctx.e6FreeSp = false; sim.gainSp(1); sim.log('Misha E6: +1 SP (next Skill)') }
      const t = manualTarget(sim, action, enemies[0])
      // A3 Transmission (canon: "when dealing DMG to Frozen enemies, CRIT DMG +30%") is a PER-TARGET
      // gate: walk the Blast target by target instead of evaluating it once on the main target
      // (hitBlast applied the bonus to every adj target when only the main one was frozen, and
      // dropped it for frozen adj targets). Same loop shape as Simulator.hitBlast.
      const main: HitOpts = { type: 'skill', mult: mult('misha', 'skill', lv.skill), elem: 'Ice', toughDmg: 20, label: 'R—Room Service! (main)' }
      const adj: HitOpts = { type: 'skill', mult: mult('misha', 'skill_a2', lv.skill), elem: 'Ice', toughDmg: 10, label: 'R—Room Service! (adj)' }
      for (const e of [...sim.livingEnemiesOf(u)]) hitFrozen(sim, u, e, e === t ? main : adj)
      // skill → +1 hit to next ult
      ctx.ultHits = ((ctx.ultHits as number) ?? 0) + mult('misha', 'skill_a3', lv.skill)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    hitFrozen(sim, u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('misha', 'basic', lv.basic), elem: 'Ice', toughDmg: 10, label: 'E—Excuse Me, Please!' })
  },

  onStart(sim, _u, ctx) {
    ctx.ultHits = 0
    ctx.e6FreeSp = false
  },

  // Frozen enemies take Ice Additional DMG equal to ult_a3 of Misha's ATK at turn start
  onFrozenTurn(sim, u, _ctx) {
    const frozen = u.dots.find(d => d.kind === 'Freeze') as DoTWithSource_misha | undefined
    if (!frozen?.sourceUnit || frozen.sourceUnit.kitId !== 'misha') return
    if (!(frozen.baseDmg > 0)) return
    sim.hit(frozen.sourceUnit, u, { type: 'dot', statValue: frozen.baseDmg * (frozen.stacks ?? 1), mult: 1, canCrit: false, defIgnore: frozen.defIgnore, label: 'Frozen Additional DMG', noSeq: true })
  },
}


// ===== yunli  (was yunli.ts) =====
const ULT_COST = 120 // canon ult #8 = 120 Energy; max pool 240 via energyMax (double-ult)

function intuitMult(eid: number): number {
  // E1 Weathered Blade: Intuit Slash/Cull DMG +20%
  return eid >= 1 ? 1.2 : 1
}

/** Launch a Counter. Parry active → Intuit (Ult DMG, +CRIT DMG, Cull extra hits; fallback = Slash only). */
function launchCounter(sim: SimApi, yunli: Unit, target: Unit, ctx: KitRuntime, fallback = false): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(yunli)
  const parry = windowArmed(rt, 'yunli_parry')
  // A3 True Sunder: using a Counter → ATK +30% 1t
  sim.addBuff(yunli, { id: 'yunli_sunder', name: 'True Sunder', mods: [{ stat: 'atkPct', value: 0.3 }], turns: 1 })
  // E2: counters ignore 20% DEF (target buff, consumed this counter)
  if (eid >= 2) sim.addBuff(target, { id: 'yunli_e2_def', name: 'First Luster Breaks Dawn DEF↓', mods: [{ stat: 'defIgnore', value: 0.2 }], turns: 1 })
  const mk = (m: number, label: string, type: 'fua' | 'ult' = 'fua', also?: DmgType[]) =>
    ({ type, also, elem: 'Physical', mult: m, toughDmg: 10, label } as const)

  if (parry) {
    // Intuit counts as Ultimate DMG; next Counter CRIT DMG #2 covers the whole counter.
    sim.addBuff(yunli, { id: 'yunli_intuit_cd', name: 'Earthbind, Etherbreak', mods: [{ stat: 'critDmg', value: mult('yunli', 'ult_a4', lv.ult) }], turns: 1 })
    // E6: Intuit Slash/Cull CRIT Rate +15% + Physical RES PEN 20%
    if (eid >= 6)
      sim.addBuff(yunli, { id: 'yunli_e6', name: 'Walk in Blade, Talk in Zither', mods: [{ stat: 'critRate', value: 0.15 }, { stat: 'resPen:Physical', value: 0.2 }], turns: 1 })
    const main = mult('yunli', 'ult', lv.ult) * intuitMult(eid)
    const adj = mult('yunli', 'ult_a2', lv.ult) * intuitMult(eid)
    sim.hitBlast(yunli, target, mk(main, 'Intuit: Slash', 'ult', ['fua']), mk(adj, 'Intuit: Slash (adj)', 'ult', ['fua']))
    // Intuit: Cull — #4 extra hits of #7% each, random single (E1 +3 hits)
    if (!fallback) {
      const cullHits = eid >= 1 ? 9 : 6
      const cullMult = mult('yunli', 'ult_a3', lv.ult) * intuitMult(eid)
      for (let i = 0; i < cullHits; i++) {
        const list = sim.livingEnemiesOf(yunli)
        if (!list.length) break
        const r = sim.rngPick(list)
        sim.hit(yunli, r, mk(cullMult, 'Intuit: Cull (hit)', 'ult', ['fua']))
      }
    }
    disarmWindow(rt, 'yunli_parry')
    sim.removeBuff(yunli, 'yunli_parry_dr') // A2 20% mitigation is active only while Parry is
    sim.removeBuff(yunli, 'yunli_intuit_cd')
    if (eid >= 6) sim.removeBuff(yunli, 'yunli_e6')
    // E4: after Intuit → Effect RES +50% 1t
    if (eid >= 4) sim.addBuff(yunli, { id: 'yunli_e4', name: 'Artisan\'s Ironsong', mods: [{ stat: 'effRes', value: 0.5 }], turns: 1 })
    sim.log(`${yunli.name} Intuit: Slash${fallback ? '' : ' + Cull'} (spent Parry)`)
    return
  }
  // Base Talent Flashforge counter, +15 Energy
  sim.hitBlast(yunli, target,
    mk(mult('yunli', 'talent', lv.talent), 'Flashforge Counter'),
    mk(mult('yunli', 'talent_a2', lv.talent), 'Flashforge Counter (adj)'))
  sim.gainEnergy(yunli, mult('yunli', 'talent_a3', lv.talent))
  sim.log(`${yunli.name} Flashforge Counter → ${target.name}`)
}

export const yunliKit: KitDef = {
  id: 'yunli',
  name: 'Yunli',
  elem: 'Physical',
  energyMax: 240,
  // canon (Energy.md): Yunli's Ultimate is usable at HALF Max Energy (120 = ULT_COST)
  ultActivation: { kind: 'energy', at: ULT_COST },
  base: { ...PROG.yunli.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  // #121807 "Posterior Precedence" (Technique): on entering battle, cast Intuit: Cull on a random enemy,
  // DMG of that attack +80%.
  technique: {
    name: 'Posterior Precedence',
    kind: 'attack',
    apply(sim, u, ctx) {
      const list = sim.livingEnemiesOf(u)
      if (!list.length) return
      const lv = levelsOf(ctx)
      const boost = 1.8 // #1: +80% DMG
      const mk = (m: number, label: string) =>
        ({ type: 'fua' as const, elem: 'Physical' as const, mult: m * boost, toughDmg: 10, label })
      sim.hit(u, sim.rngPick(list), mk(mult('yunli', 'ult', lv.ult), 'Posterior Precedence (Intuit: Cull)'))
      const cullMult = mult('yunli', 'ult_a3', lv.ult)
      for (let i = 0; i < 6; i++) {
        const l2 = sim.livingEnemiesOf(u)
        if (!l2.length) break
        sim.hit(u, sim.rngPick(l2), mk(cullMult, 'Intuit: Cull (hit)'))
      }
    },
  },
  onStart(sim, u, ctx) {
    u.aggro = 150
    disarmWindow(ctx, 'yunli_parry')
  },
  decide(sim, u, _ctx) {
    if (u.energy >= ULT_COST) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < ULT_COST) return
      u.energy -= ULT_COST
      armWindow(rt, 'yunli_parry', 1)
      // A2 Demon Quell: while Parry active, DMG taken −20%. The Parry lasts until the END of the
      // next ally's/enemy's turn (canon 122103), so the mitigation is NOT on Yunli's own turn
      // clock (her faster AV would tick it off before the next enemy turn). It lives until the
      // window closes: removed by the counter that consumes the Parry, or by onAllyActionEnd.
      sim.addBuff(u, { id: 'yunli_parry_dr', name: 'Demon Quell', mods: [{ stat: 'mitigation', value: 0.2 }] })
      sim.log(`${u.name} Ult: Earthbind, Etherbreak (Parry ready)`) // +5 from castUlt
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hitBlast(u, primary,
        { type: 'skill', mult: mult('yunli', 'skill', lv.skill), elem: 'Physical', toughDmg: 20, label: 'Bladeborne Quake' },
        { type: 'skill', mult: mult('yunli', 'skill_a2', lv.skill), elem: 'Physical', toughDmg: 10, label: 'Bladeborne Quake (adj)' })
      sim.heal(u, Math.floor(sim.effAtk(u) * mult('yunli', 'skill_a3', lv.skill) + mult('yunli', 'skill_a4', lv.skill)))
      sim.log(`${u.name} Skill: Bladeborne Quake + heal`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('yunli', 'basic', lv.basic), elem: 'Physical', toughDmg: 10, label: 'Galespin Summersault' })
  },

  // Talent Flashforge: when Yunli is attacked → counter (Intuit if parrying).
  onAllyHit(sim, attacker, target, _dmg, ctx) {
    if (target.kind !== 'char' || target.dead) return
    if (target.kitId !== 'yunli') return
    if (attacker.side !== 'enemy') return
    launchCounter(sim, target, attacker, ctx)
  },

  // Canon 122103: if no Counter triggered while Parry is active, Yunli IMMEDIATELY launches
  // Intuit: Slash when the Parry window ends — the end of the next ally's or enemy's turn.
  // onAllyActionEnd fires after every non-self unit acted (endTick choke point); the window is
  // exactly one such turn, so its close here is the "immediately" of the canon. Summon turns do
  // not prompt Intuit (canon note) and are skipped.
  onAllyActionEnd(sim, actor, ctx) {
    if (actor.kind === 'summon') return
    const u = sim.allies('ally').find(a => a.kitId === 'yunli' && !a.dead)
    if (!u) return
    const rt = sim.rt(u)
    if (!windowArmed(rt, 'yunli_parry')) return
    sim.log(`${u.name} Parry window ends untriggered → Intuit: Slash`)
    disarmWindow(rt, 'yunli_parry')
    sim.removeBuff(u, 'yunli_parry_dr')
    const enemies = sim.livingEnemiesOf(u)
    if (enemies.length) launchCounter(sim, u, sim.rngPick(enemies), ctx, true)
  },

  // E6 Walk in Blade, Talk in Zither: while Parry active, any enemy's turn (active ability) triggers Intuit: Cull + removes Parry.
  onEnemyTurnStart(sim, u, enemy, ctx) {
    const rt = sim.rt(u)
    if (!windowArmed(rt, 'yunli_parry')) return
    if (((ctx.eidolon as number) ?? 0) >= 6) {
      sim.log(`${u.name} E6: enemy turn → Intuit: Cull`)
      launchCounter(sim, u, enemy, ctx)
    }
  },
}


// ===== mydei  (was mydei.ts) =====
const CHARGE_MAX = 200
const REVIVES_MAX = 3

function mydeiSelf(sim: SimApi, u: Unit): boolean {
  return u.kind === 'char' && u.kitId === 'mydei' && !u.dead
}

/** Charge gain from HP loss (1 per 1% Max HP lost) or healed-amount conversion (E2).
 *  Feeds Godslayer (150, E6: 100) while in Vendetta; triggers Vendetta at 100 otherwise. */
function gainCharge_mydei(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  if (n <= 0) return
  const rt = sim.rt(u)
  if (rt.godslaying) return // canon: while Godslayer Be God is in use, Charge cannot be accumulated
  const eid = (ctx.eidolon as number) ?? 0
  rt.mydeiCharge = Math.min(CHARGE_MAX, ((rt.mydeiCharge as number) ?? 0) + n)
  sim.log(`Mydei: Charge → ${rt.mydeiCharge} / ${CHARGE_MAX} (+${n})`)
  // In Vendetta the charge feeds Godslayer Be God (150; E6 lowers to 100).
  if (rt.mydeiVendetta && !rt.godslaying) {
    const need = eid >= 6 ? 100 : 150
    if ((rt.mydeiCharge as number) >= need) {
      rt.godslaying = true
      sim.log(`Mydei: Charge ${rt.mydeiCharge} ≥ ${need} → Godslayer Be God (extra turn)`)
      sim.grantExtraTurn(u)
      return
    }
  }
  // Outside Vendetta, at 100 Charge enter Vendetta.
  if (!rt.mydeiVendetta && (rt.mydeiCharge as number) >= 100) {
    enterVendetta(sim, u, ctx)
  }
}

function enterVendetta(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  rt.mydeiVendetta = true
  rt.mydeiCharge = Math.max(0, (rt.mydeiCharge as number) - 100)
  const heal = Math.round(u.maxHp * mult('mydei', 'talent', lv.talent))
  sim.heal(u, heal)
  sim.advance(u, 1.0)
  const mods: Array<{ stat: string; value: number }> = [
    { stat: 'hpPct', value: mult('mydei', 'talent_a5', lv.talent) },
  ]
  if (eid >= 4) mods.push({ stat: 'critDmg', value: 0.30 }) // E4: +30% CRIT DMG in Vendetta
  sim.removeBuff(u, 'mydei_vend')
  sim.addBuff(u, { id: 'mydei_vend', name: 'Vendetta', mods: mods as any, turns: Infinity })
  // E2: during Vendetta Mydei DMG ignores 15% of enemy DEF → defIgnore is a defender-side debuff
  if (eid >= 2) {
    for (const e of sim.livingEnemiesOf(u))
      sim.addBuff(e, { id: 'mydei_e2_def', name: 'Strife Beholds Cry of Dead DEF↓', mods: [{ stat: 'defIgnore', value: 0.15 }], turns: Infinity, debuff: true })
  }
  sim.log(`Mydei: enters VENDETTA (Max HP +${Math.round(mult('mydei', 'talent_a5', lv.talent) * 100)}%, heal ${heal}, advance 100%; Charge → ${rt.mydeiCharge})`)
}
/** Skill / Enhanced-Skill HP-cost: consumes % of CURRENT HP (min leave 1), returns actual HP lost. */
function selfHpCost_mydei(sim: SimApi, u: Unit, ctx: KitRuntime, pctOfCurrent: number): number {
  const lv = levelsOf(ctx)
  void lv
  const actual = -sim.hpChange(u, -Math.round(u.hp * pctOfCurrent), 'cost')
  if (actual <= 0) return 0
  sim.fireAllyHpLoss(u, actual)
  gainCharge_mydei(sim, u, ctx, Math.floor((actual / u.maxHp) * 100))
  sim.log(`Mydei: loses ${actual} HP (${Math.round(pctOfCurrent * 100)}% current HP) → Charge`)
  return actual
}

/** Basic: Vow of Voyage — single Imaginary, Max-HP-scaled, 20 Energy, +1 SP */
function doBasic_mydei(sim: SimApi, u: Unit, action: { kind?: string; targetId?: string }, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  sim.gainSp(1)
  sim.gainEnergy(u, 20)
  const primary = manualTarget(sim, action, enemies[0])
  sim.hit(u, primary, { type: 'basic', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'basic', lv.basic), toughDmg: 10, label: 'Vow of Voyage' })
}

/** Skill: Deaths are Legion, Regrets are None — free, consume 50% current HP, Blast. */
function doLegion(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  sim.gainEnergy(u, selfHpCost_mydei(sim, u, ctx, mult('mydei', 'skill_a3', lv.skill)))
  const primary = lowestHpEnemy(sim, u) ?? enemies[0]
  sim.hitBlast(u, primary,
    { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'skill', lv.skill), toughDmg: 20, label: 'Deaths are Legion (main)' },
    { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'skill_a2', lv.skill), toughDmg: 10, label: 'Deaths are Legion (adj)' })
  sim.log('Mydei: Deaths are Legion (free, HP-consuming Blast)')
}

/** Enhanced Skill (in Vendetta): Kingslayer Be King — free, consume 35% current HP, Blast, charge still gained. */
function doKingslayer(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  sim.gainEnergy(u, selfHpCost_mydei(sim, u, ctx, mult('mydei', 'skill_en_a3', lv.skill)))
  const primary = lowestHpEnemy(sim, u) ?? enemies[0]
  sim.hitBlast(u, primary,
    { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'skill_en', lv.skill), toughDmg: 20, label: 'Kingslayer Be King (main)' },
    { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'skill_en_a2', lv.skill), toughDmg: 10, label: 'Kingslayer Be King (adj)' })
  sim.log('Mydei: Kingslayer Be King (Vendetta Enhanced Skill)')
}

/** Godslayer Be God — automatic extra-turn ability: consume 150 (E6: 100) Charge, 2×50% hits.
 *  E1: main mult ×1.3 and the ability deals to ALL enemies the primary-target mult. */
function doGodslayer(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  rt.godslaying = false
  const consume = eid >= 6 ? 100 : 150
  rt.mydeiCharge = Math.max(0, (rt.mydeiCharge as number) - consume)
  sim.gainEnergy(u, 10) // canon sp_base 10
  const mainMult = mult('mydei', 'skill_en2', lv.skill) * (eid >= 1 ? 1.3 : 1)
  const adjMult = mult('mydei', 'skill_en2_a2', lv.skill)
  const enemies = sim.livingEnemiesOf(u)
  const primary = lowestHpEnemy(sim, u) ?? enemies[0]
  if (eid >= 1) {
    // E1: deals the primary-target multiplier to ALL enemies, in 2×50% hits
    for (const e of enemies) {
      sim.hit(u, e, { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mainMult / 2, toughDmg: 15, label: 'Godslayer Be God (1/2)' })
      sim.hit(u, e, { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mainMult / 2, toughDmg: 15, label: 'Godslayer Be God (2/2)' })
    }
  } else {
    sim.hitBlast(u, primary,
      { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mainMult / 2, toughDmg: 15, label: 'Godslayer Be God (1/2)' },
      { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: adjMult / 2, toughDmg: 7.5, label: 'Godslayer Be God (1/2 adj)' })
    sim.hitBlast(u, primary,
      { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: mainMult / 2, toughDmg: 15, label: 'Godslayer Be God (2/2)' },
      { type: 'skill', elem: 'Imaginary', scaleStat: 'hp', mult: adjMult / 2, toughDmg: 7.5, label: 'Godslayer Be God (2/2 adj)' })
  }
  sim.log(`Mydei: GODSLAYER BE GOD (consume ${consume} Charge; Charge → ${rt.mydeiCharge})`)
}

/** Ultimate: Throne of Bones — heal self, +20 Charge, Blast, Taunts the target and adjacent for #4 turns. */
function doUlt(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  u.energy = 0
  const heal = Math.round(u.maxHp * mult('mydei', 'ult_a3', lv.ult))
  sim.heal(u, heal)
  const primary = lowestHpEnemy(sim, u) ?? enemies[0]
  sim.hitBlast(u, primary,
    { type: 'ult', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'ult', lv.ult), toughDmg: 30, label: 'Throne of Bones (main)' },
    { type: 'ult', elem: 'Imaginary', scaleStat: 'hp', mult: mult('mydei', 'ult_a2', lv.ult), toughDmg: 15, label: 'Throne of Bones (adj)' })
  gainCharge_mydei(sim, u, ctx, mult('mydei', 'ult_a5', lv.ult))
  // Taunts every living enemy (blast hit them all) for raw #4 turns — their single-target
  // attacks are forced onto Mydei until the mark expires (TargetOverride, §25).
  const tauntTurns = Math.round(mult('mydei', 'ult_a4', lv.ult))
  const taunted = sim.livingEnemiesOf(u)
  for (const e of taunted) sim.addTargetOverride(e, u, tauntTurns)
  sim.log(`Mydei: THRONE OF BONES (heal ${heal}, +${mult('mydei', 'ult_a5', lv.ult)} Charge; Taunt ${tauntTurns} turn(s) on ${taunted.length} enemy/enemies)`)
}

export const mydeiKit: KitDef = {
  id: 'mydei',
  name: 'Mydei',
  elem: 'Imaginary',
  energyMax: 160,
  base: { ...PROG.mydei.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  // #140807 "Cage of Broken Lance" (Technique): AoE Imaginary DMG = 80% Max HP, Taunt the targets
  // for 1 turn, and accumulate 50 charge.
  technique: {
    name: 'Cage of Broken Lance',
    kind: 'attack',
    apply(sim, u, ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Imaginary', scaleStat: 'hp', mult: 0.8, toughDmg: 10, label: 'Cage of Broken Lance' })
      for (const e of sim.livingEnemiesOf(u)) sim.addTargetOverride(e, u, 1)
      gainCharge_mydei(sim, u, ctx, 50)
    },
  },
  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    rt.mydeiCharge = 0
    rt.mydeiVendetta = false
    rt.godslaying = false
    rt.mydeiRevives = REVIVES_MAX
    rt.e2HealTally = 0
    rt.e2Turn = sim.battleTurn
    rt.mydeiChitRatio = 1
    // A3 Bloodied Chiton: battle-start, per 100 Max HP above 4000 (cap 4000 excess):
    // CRIT Rate +1.2%, Charge ratio from enemy-target DMG +2.5%, incoming healing +0.75%.
    const excess = Math.min(4000, Math.max(0, u.maxHp - 4000))
    const units = Math.floor(excess / 100)
    if (units > 0) {
      sim.addBuff(u, {
        id: 'mydei_chiton', name: 'Bloodied Chiton (A3)',
        mods: [
          { stat: 'critRate', value: 0.012 * units },
          { stat: 'inHeal', value: 0.0075 * units },
        ] as any, turns: Infinity,
      })
      rt.mydeiChitRatio = 1 + 0.025 * units
      sim.log(`Mydei (A3 Bloodied Chiton): ${units}×100 MaxHP above 4000 → CRIT +${Math.round(0.012 * units * 100)}%, Charge ratio ×${rt.mydeiChitRatio}`)
    }
    // E6: enter Vendetta immediately at battle start
    if (((ctx.eidolon as number) ?? 0) >= 6) {
      rt.mydeiCharge = 100
      enterVendetta(sim, u, ctx)
    }
    // A1 Earth and Water: in Vendetta, a killing blow instead survives, exits Vendetta,
    // clears Charge and restores HP by 50% Max HP — 3× per battle.
    // Registered as a chained loss interceptor (coexists with Castorice Mooncocoon).
    sim.addLossInterceptor((t, dmg) => {
      if (!mydeiSelf(sim, t)) return 0
      if (!rt.mydeiVendetta) return 0
      if (t.hp - dmg > 0 || (rt.mydeiRevives as number) <= 0) return 0
      const absorb = Math.max(0, t.hp - 1)
      rt.mydeiRevives = (rt.mydeiRevives as number) - 1
      rt.mydeiCharge = 0
      rt.mydeiVendetta = false
      rt.godslaying = false
      sim.removeBuff(t, 'mydei_vend')
      for (const e of sim.livingEnemiesOf(t)) sim.removeBuff(e, 'mydei_e2_def')
      const heal = Math.round(t.maxHp * 0.5) // talent #4 = 0.5 Max HP, constant
      sim.heal(t, heal)
      sim.log(`Mydei (A1 Earth and Water): survives killing blow — Vendetta ends, Charge cleared, heals ${heal} (revives left ${rt.mydeiRevives})`)
      return absorb
    })
  },
  decide(sim, u, ctx) {
    const rt = sim.rt(u)
    if (rt.godslaying) return { kind: 'skill' }
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // Skills are free (no SP) — Mydei almost always uses one.
    return { kind: 'skill' }
  },
  onAllyHit(sim, attacker, target, dmg, ctx) {
    if (attacker.side !== 'enemy') return
    if (!mydeiSelf(sim, target)) return
    const rt = sim.rt(target)
    // Talent: for each 1% of HP lost accumulates 1 Charge — includes HP lost to enemy attacks.
    if (dmg > 0) {
      const lost = Math.floor((dmg / target.maxHp) * 100 * ((rt.mydeiChitRatio as number) ?? 1))
      if (lost > 0) gainCharge_mydei(sim, target, ctx, lost)
    }
    // E4: in Vendetta, heal 10% Max HP after receiving an enemy attack
    if (((ctx.eidolon as number) ?? 0) >= 4 && rt.mydeiVendetta) {
      const heal = Math.round(target.maxHp * 0.10) // E4: heal 10% Max HP after being attacked
      sim.heal(target, heal)
      sim.log(`Mydei (E4): heals ${heal} after being attacked`)
    }
  },
  onAllyHeal(sim, target, amount, ctx) {
    if (!mydeiSelf(sim, target)) return
    if (((ctx.eidolon as number) ?? 0) >= 2) {
      const rt = sim.rt(target)
      // E2: convert 40% of received healing to Charge, tally capped at 40 and reset after any unit takes action
      if (rt.e2Turn !== sim.battleTurn) { rt.e2HealTally = 0; rt.e2Turn = sim.battleTurn }
      const tally = (rt.e2HealTally as number) ?? 0
      if (tally < 40) {
        const conv = Math.min(40 - tally, Math.round(amount * 0.4))
        rt.e2HealTally = tally + conv
        gainCharge_mydei(sim, target, ctx, conv)
        sim.log(`Mydei (E2): healing converts ${conv} Charge (tally ${rt.e2HealTally}/40)`)
      }
    }
  },
  perform(sim, u, action, ctx) {
    const rt = sim.rt(u)

    if (rt.godslaying && ctx.inExtraTurn) {
      doGodslayer(sim, u, ctx)
      return
    }

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      doUlt(sim, u, ctx)
      return
    }

    if (action.kind === 'skill') {
      if (rt.mydeiVendetta) doKingslayer(sim, u, ctx)
      else doLegion(sim, u, ctx)
      return
    }

    doBasic_mydei(sim, u, action, ctx)
  },
}


// ===== saber  (was saber.ts) =====
const ULT_COST_saber = 360

// A4 Blessing of the Lake: overflow Energy cap (E6 raises to 200)
function overflowCap(ctx: KitRuntime): number {
  return ((ctx.eidolon as number) ?? 0) >= 6 ? 200 : 120
}

function crOf(ctx: KitRuntime): number {
  return ((ctx.cr as number) ?? 0)
}

// Talent Dragon Reactor Core: every 1 CR consumed → this much Energy (#5 = 8)
function crEnergy(sim: SimApi, ctx: KitRuntime): number {
  return mult('saber', 'talent_a5', (levelsOf(ctx)).talent)
}

function setCr(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const cap = Math.round(mult('saber', 'talent_a7', 15))
  const prev = crOf(ctx)
  ctx.cr = Math.min(cap, Math.max(0, n))
  // A6 Crown of the Star: every CR gained → permanent CRIT DMG +4% (cap 8)
  const gained = Math.max(0, (ctx.cr as number) - prev)
  if (gained > 0) {
    const a6 = accAdd(ctx, 'a6Cnt', gained, { cap: 8 })
    if (a6 > 0) sim.addBuff(u, { id: 'saber_a6p', name: 'Crown of the Star', mods: [{ stat: 'critDmg', value: 0.04 * a6 }], turns: 999 })
    // E2 The Lost Oath of the Round Table: every CR GAINED this battle → DEF-ignore +1% (cap 15)
    accAdd(ctx, 'e2Cnt', gained, { cap: 15 })
  }
  const e2 = ((ctx.eidolon as number) ?? 0) >= 2 ? 0.01 * accGet(ctx, 'e2Cnt') : 0
  if (e2 > 0) sim.addBuff(u, { id: 'saber_e2', name: 'The Lost Oath of the Round Table', mods: [{ stat: 'defIgnore', value: e2 }], turns: 999 })
}

export const saberKit: KitDef = {
  id: 'saber',
  name: 'Saber',
  elem: 'Wind',
  energyMax: 480, // 360 + 120 overflow (A4); E6 → 560 via overflowCap + KitDef cannot change
  base: { ...PROG.saber.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  decide(sim, u, ctx) {
    if (sim.sp() >= 1 && ctx.enBasic) return { kind: 'basic' }
    if ((ctx.inExtraTurn as boolean) && ctx.enBasic) return { kind: 'basic' }
    if (u.energy >= ULT_COST_saber) return { kind: 'ult' }
    if (ctx.enBasic) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < ULT_COST_saber) return
      const overflow = Math.min(overflowCap(ctx), u.energy - ULT_COST_saber)
      u.energy = overflow
      let main = mult('saber', 'ult', lv.ult)
      if (eid >= 1) main *= 1.6 // E1 +60% Ultimate DMG
      // Gilgamesh Joint FUA (talent2): Saber's next Ult DMG ×2 (talent2_a6), consumed once
      if (ctx.gilNextUltMul) {
        main *= ctx.gilNextUltMul as number
        ctx.gilNextUltMul = 0
      }
      // E6: Ultimate DMG Wind RES PEN +20% (ult-window only)
      let e6Pen: string | null = null
      if (eid >= 6) {
        sim.addBuff(u, { id: 'saber_e6_pen', name: 'The Long Fated Night', mods: [{ stat: 'resPen:Wind', value: 0.2 }], turns: 1 })
        e6Pen = 'saber_e6_pen'
      }
      for (const x of [...sim.livingEnemiesOf(u)]) sim.hit(u, x, { type: 'ult', mult: main, elem: 'Wind', toughDmg: 20, label: 'Excalibur' })
      // #3 instances of #2% to one random enemy each — flatten to one extra per additional living enemy
      let inst = mult('saber', 'ult_a2', lv.ult)
      if (eid >= 1) inst *= 1.6
      const count = Math.round(mult('saber', 'ult_a3', lv.ult))
      for (let i = 0; i < count; i++) {
        const ts = [...sim.livingEnemiesOf(u)]
        if (!ts.length) break
        const t = sim.rngPick(ts)
        sim.hit(u, t, { type: 'ult', mult: inst, elem: 'Wind', toughDmg: 8, label: 'Excalibur instance' })
      }
      if (e6Pen) sim.removeBuff(u, e6Pen)
      // E4: after ult Wind RES PEN +4% stacking 3 (base E4 +8% applied at onStart)
      if (eid >= 4) sim.addBuff(u, { id: 'saber_e4', name: 'The Saga of Sixteen Winter Days', mods: [{ stat: 'resPen:Wind', value: 0.04 }], turns: 999, maxStacks: 3 })
      // E6: +300 Energy on ult #1, then again after every 3 Ultimate uses
      if (eid >= 6) {
        const seq = ((ctx.ultSeq as number) ?? 0) + 1
        ctx.ultSeq = seq
        if ((seq - 1) % 3 === 0) {
          sim.gainEnergy(u, 300)
          sim.log(`${u.name} E6: +300 Energy (Ult #${seq})`)
        }
      }
      // next Basic → enhanced (Release, the Golden Scepter)
      ctx.enBasic = true
      // A2 Mana Burst application window is entered-combat or Enhanced Basic; granted at onStart
      sim.log(`${u.name} Ult: Excalibur, ${count} instances, overflow ${overflow}`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const t = manualTarget(sim, action, enemies[0])
      let m = mult('saber', 'skill', lv.skill)
      const cr = crOf(ctx)
      // Dragon Reactor Core: consume CR to refill Energy ("fully regenerated" = reaches ult cost + overflow cap)
      const perCr = crEnergy(sim, ctx)
      const canFull = cr > 0 && u.energy + 30 + cr * perCr >= ULT_COST_saber + overflowCap(ctx)
      if (canFull && cr > 0) {
        // consume all CR → boosted Skill (mult ×(1 + per-CR × skill_a4); E2 adds +7%/CR)
        const perCrBoost = mult('saber', 'skill_a4', lv.skill) + (eid >= 2 ? 0.07 : 0)
        const boost = 1 + cr * perCrBoost
        m *= boost
        u.energy = Math.min(ULT_COST_saber + overflowCap(ctx), u.energy + 30 + cr * perCr)
        setCr(sim, u, ctx, 0)
        sim.log(`${u.name} Skill: Core Resonance boost ×${boost.toFixed(2)}`)
      } else {
        // normal Skill: +3 Core Resonance
        setCr(sim, u, ctx, cr + mult('saber', 'skill_a3', lv.skill))
      }
      sim.hit(u, t, { type: 'skill', mult: m, elem: 'Wind', toughDmg: 15, label: 'Strike Air (main)', split: [0.1, 0.1, 0.1, 0.7] })
      const adj = mult('saber', 'skill_a2', lv.skill)
      if (adj > 0) {
        const ts = [...sim.livingEnemiesOf(u)].filter(x => x !== t)
        for (const x of ts) sim.hit(u, x, { type: 'skill', mult: adj, elem: 'Wind', toughDmg: 10, label: 'Strike Air (adj)' })
      }
      // A6 Crown of the Star: Skill → critDmg +50% 2t (per-CR-gained stacking kept flat per data gap)
      sim.addBuff(u, { id: 'saber_a6', name: 'Crown of the Star', mods: [{ stat: 'critDmg', value: 0.5 }], turns: 2 })
      // E1: basic/skill → +1 CR
      if (eid >= 1) setCr(sim, u, ctx, crOf(ctx) + 1)
      return
    }

    // Enhanced Basic (enBasic): Release, the Golden Scepter — AoE, +2 CR, extra when ≤2 enemies
    if (ctx.enBasic) {
      ctx.enBasic = false
      sim.gainSp(1)
      sim.gainEnergy(u, 30)
      const recastCr = crOf(ctx) + mult('saber', 'basic_en_a2', lv.basic)
      setCr(sim, u, ctx, recastCr)
      let m = mult('saber', 'basic_en', lv.basic)
      const nEnemy = sim.livingEnemiesOf(u).length
      const extra = nEnemy <= 2 ? (nEnemy === 1 ? mult('saber', 'basic_en_a4', lv.basic) : mult('saber', 'basic_en_a3', lv.basic)) : 0
      const ts = [...sim.livingEnemiesOf(u)]
      // aoe
      for (const x of ts) {
        sim.hit(u, x, { type: 'basic', mult: m, elem: 'Wind', toughDmg: 10, label: 'Release, the Golden Scepter', split: [0.5, 0.5] })
        if (extra > 0 && !x.dead) sim.hit(u, x, { type: 'basic', mult: extra, elem: 'Wind', toughDmg: 5, label: 'Release (≤2 enemies)' })
      }
      // E1: Basic ATK (incl. Enhanced) → +1 CR
      if (eid >= 1) setCr(sim, u, ctx, crOf(ctx) + 1)
      // A2 Mana Burst re-granted on Enhanced Basic; consume for +1 SP + immediate action
      ctx.manaBurst = false
      manaBurst(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('saber', 'basic', lv.basic), elem: 'Wind', toughDmg: 10, label: 'Invisible Air' })
    if (eid >= 1) setCr(sim, u, ctx, crOf(ctx) + 1)
  },

  onStart(sim, u, ctx) {
    ctx.cr = 0
    ctx.enBasic = false
    ctx.firstUlt = false
    ctx.manaBurst = false
    // Technique Behold, the King of Knights: ATK +35% 2t, +2 Core Resonance
    sim.addBuff(u, { id: 'saber_tech', name: 'Behold, the King of Knights', mods: [{ stat: 'atkPct', value: 0.35 }], turns: 2 })
    // Talent Dragon Reactor Core: battle-start CR (#8) + Technique CR
    setCr(sim, u, ctx, mult('saber', 'talent_a8', 15) + 2)
    // A4 Blessing of the Lake: battle-start energy <60% → 60%
    if (u.energy < ULT_COST_saber * 0.6) u.energy = ULT_COST_saber * 0.6
    // A2 Knight of the Dragon: CRIT Rate +20% + entering-combat Mana Burst
    sim.addBuff(u, { id: 'saber_a2', name: 'Knight of the Dragon', mods: [{ stat: 'critRate', value: 0.2 }], turns: 999 })
    // E4 base Wind RES PEN +8%
    if (((ctx.eidolon as number) ?? 0) >= 4) sim.addBuff(u, { id: 'saber_e4_base', name: 'The Saga of Sixteen Winter Days', mods: [{ stat: 'resPen:Wind', value: 0.08 }], turns: 999 })
    manaBurst(sim, u, ctx)
  },

  // Talent Dragon Reactor Core: any ally Ultimate → +3 CR, +25 Energy, Saber DMG +talent_a3 for 2t
  onAllyUlt(sim, _ally, ctx) {
    const u = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'saber' && !c.dead)
    if (!u) return
    const lv = levelsOf(ctx)
    setCr(sim, u, ctx, crOf(ctx) + mult('saber', 'talent', lv.talent))
    sim.gainEnergy(u, mult('saber', 'talent_a2', lv.talent))
    sim.addBuff(u, { id: 'saber_talent', name: 'Dragon Reactor Core', mods: [{ stat: 'dmgAll', value: mult('saber', 'talent_a3', lv.talent) }], turns: mult('saber', 'talent_a4', lv.talent) })
    sim.log(`${u.name} gains Core Resonance +3, +25 energy (ally Ult)`)
  },
}

// A2 Mana Burst: if Saber has Core Resonance and Skill+CR can fully regenerate Energy → consume Mana Burst for 1 SP + immediate action.
// The bonus-turn Skill itself consumes the CR (and regens) — do NOT zero CR here.
function manaBurst(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const cr = crOf(ctx)
  const perCr = crEnergy(sim, ctx)
  if (cr > 0 && u.energy + 30 + cr * perCr >= ULT_COST_saber + overflowCap(ctx) && !ctx.manaBurst) {
    ctx.manaBurst = true
    sim.gainSp(1)
    sim.grantExtraTurn(u)
    sim.log(`${u.name} Mana Burst: +1 SP, bonus turn`)
  }
}

// ===== gilgamesh  (was gilgamesh.ts) =====
const ULT_COST_gilgamesh = 360

function setInterest(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const prev = (ctx.interest as number) ?? 0
  ctx.interest = Math.max(0, n)
  // A2 Hero's Hauteur: for every Interest *gained* this battle → CRIT DMG +25% (cap 6 stacks, persists whole battle)
  const gained = Math.max(0, (ctx.interest as number) - prev)
  if (gained > 0) accAdd(ctx, 'hauteur', gained, { cap: 6 })
  const cd = accGet(ctx, 'hauteur') * 0.25
  if (cd > 0) sim.addBuff(u, { id: 'gil_hauteur', name: 'Hero\'s Hauteur', mods: [{ stat: 'critDmg', value: cd }], turns: 999 })
  // Talent: for each Interest in possession → SPD +10% (drops when Interest cleared)
  const spd = (ctx.interest as number) * mult('gilgamesh', 'talent_a4', 15)
  if (spd > 0) sim.addBuff(u, { id: 'gil_interest_spd', name: 'Hero\'s Hauteur', mods: [{ stat: 'spdPct', value: spd }], turns: 999 })
  else sim.removeBuff(u, 'gil_interest_spd')
  // Piqued: first time Interest reaches talent_a2 threshold (10) → can only use Skill for the rest of the battle
  if (!ctx.piqued && (ctx.interest as number) >= mult('gilgamesh', 'talent_a2', 15)) {
    ctx.piqued = true
    sim.log(`${u.name}: Interest Piqued! (can only use Skill)`)
  }
}

export const gilgameshKit: KitDef = {
  id: 'gilgamesh',
  name: 'Gilgamesh',
  elem: 'Lightning',
  energyMax: ULT_COST_gilgamesh,
  base: { ...PROG.gilgamesh.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  decide(sim, u, ctx) {
    if (u.energy >= ULT_COST_gilgamesh) return { kind: 'ult' }
    // Talent: auto-Basic; once Interest Piqued! → can only use Skill (which costs no SP)
    return { kind: ctx.piqued ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < ULT_COST_gilgamesh) return
      u.energy = 0
      // A1 Epic's Opening: own Ult +2 Interest; E2 +5
      setInterest(sim, u, ctx, ((ctx.interest as number) ?? 0) + 2 + (eid >= 2 ? 5 : 0))
      // E6 Golden Rule: consume all (max 3) → +100% critDmg:ult each
      const golden = ctx.golden as number ?? 0
      if (eid >= 6 && golden > 0) {
        sim.addBuff(u, { id: 'gil_golden', name: 'E6 Golden Rule', mods: [{ stat: 'critDmg:ult', value: golden }], turns: 1 })
        ctx.golden = 0
      }
      let main = mult('gilgamesh', 'ult', lv.ult)
      for (const x of [...sim.livingEnemiesOf(u)]) sim.hit(u, x, { type: 'ult', mult: main, elem: 'Lightning', toughDmg: 20, label: 'Enuma Elish' })
      // bounce instances (E6 ×1.8) — each to one random enemy, repeat allowed
      let inst = mult('gilgamesh', 'ult_a2', lv.ult)
      if (eid >= 6) inst *= 1.8
      const count = Math.round(mult('gilgamesh', 'ult_a3', lv.ult))
      for (let i = 0; i < count; i++) {
        const ts = [...sim.livingEnemiesOf(u)]
        if (!ts.length) break
        const t = sim.rngPick(ts)
        sim.hit(u, t, { type: 'ult', mult: inst, elem: 'Lightning', toughDmg: 8, label: 'Enuma Elish bounce' })
      }
      sim.log(`${u.name} Enuma Elish, ${count} bounces`)
      return
    }

    if (action.kind === 'skill') {
      sim.gainEnergy(u, 30 + (eid >= 1 ? 40 : 0)) // sp_base 30; E1 He Who Saw the Deep: +40 Energy
      // King's Acknowledgement: DEF-ignore (E1 also raises ATK +60% and shares to allies)
      const defIgn = mult('gilgamesh', 'skill_a5', lv.skill)
      const turns = Math.round(mult('gilgamesh', 'skill_a6', lv.skill))
      if (eid >= 1) sim.addBuff(u, { id: 'gil_e1_atk', name: 'He Who Saw the Deep', mods: [{ stat: 'atkPct', value: 0.6 }], turns: 999 })
      sim.addBuff(u, { id: 'gil_ack', name: 'King\'s Acknowledgement', mods: [{ stat: 'defIgnore', value: defIgn }], turns })
      if (eid >= 1 && defIgn > 0) {
        for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead && a !== u) sim.addBuff(a, { id: 'gil_e1_ack', name: 'He Who Saw the Deep', mods: [{ stat: 'defIgnore', value: defIgn }], turns })
      }
      // Talent: after using Skill in "Interest Piqued!", clears Interest (SPD buff drops; A2 CD persists)
      if (ctx.piqued) {
        ctx.interest = 0
        sim.removeBuff(u, 'gil_interest_spd')
      }
      let main = mult('gilgamesh', 'skill', lv.skill)
      let adj = mult('gilgamesh', 'skill_a2', lv.skill)
      if (eid >= 2) { main *= 2; adj *= 1.5 } // E2 Wisdom: primary ×2, adjacent ×1.5
      const t = manualTarget(sim, action, enemies[0])
      sim.hit(u, t, { type: 'skill', mult: main, elem: 'Lightning', toughDmg: 15, label: 'Gate of Babylon (main)', split: [0.1, 0.1, 0.2, 0.2, 0.4] })
      if (adj > 0) {
        for (const x of [...sim.livingEnemiesOf(u)].filter(e => e !== t)) {
          sim.hit(u, x, { type: 'skill', mult: adj, elem: 'Lightning', toughDmg: 10, label: 'Gate of Babylon (adj)' })
        }
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('gilgamesh', 'basic', lv.basic), elem: 'Lightning', toughDmg: 10, label: 'Halfhearted Blow', split: [0.3, 0.3, 0.4] })
  },

  onStart(sim, u, ctx) {
    ctx.interest = 0
    ctx.tally = 0
    ctx.golden = 0
    ctx.piqued = false
    // Technique Enkidu: entering combat → immediately +3 Interest (AoE 200% on entry unmodeled)
    // E2: +5 Interest battle-start
    setInterest(sim, u, ctx, 3 + (((ctx.eidolon as number) ?? 0) >= 2 ? 5 : 0))
    // A3 Hegemon's Strife: allies ATK/CD +20% + per maxEnergy>140 +1% (cap +100%)
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      const ex = Math.min(1, Math.max(0, a.maxEnergy - 140) * 0.01)
      sim.addBuff(a, { id: 'gil_a3', name: 'Hegemon\'s Strife', mods: [{ stat: 'atkPct', value: 0.2 + ex }, { stat: 'critDmg', value: 0.2 + ex }], turns: 999 })
    }
    // E4: Energy Regen +20%
    if (((ctx.eidolon as number) ?? 0) >= 4) sim.addBuff(u, { id: 'gil_e4', name: 'King Who Bowed to None', mods: [{ stat: 'err', value: 0.2 }], turns: 999 })
    // E6: allies All-Type RES PEN +20%
    if (((ctx.eidolon as number) ?? 0) >= 6) {
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'gil_e6', name: 'Soul That Bore Friendship', mods: [{ stat: 'resPenAll', value: 0.2 }], turns: 999 })
    }
  },

  // Talent "Amuse Me to the Fullest": teammate Ultimate → King's Burden (Ult DMG +40%, 3t); A1 Epic's Opening: +2 Interest + 30% of the Energy spent; E6: +1 Golden Rule
  onAllyUlt(sim, ally, ctx) {
    const u = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'gilgamesh' && !c.dead)
    if (!u) return
    const lv = levelsOf(ctx)
    sim.addBuff(u, { id: 'gil_burden', name: 'King\'s Burden', mods: [{ stat: 'boost:ult', value: mult('gilgamesh', 'talent_a3', lv.talent) }], turns: Math.round(mult('gilgamesh', 'talent', lv.talent)) })
    setInterest(sim, u, ctx, ((ctx.interest as number) ?? 0) + 2)
    sim.gainEnergy(u, 0.3 * ally.maxEnergy)
    // E6: +1 Golden Rule (max 3)
    if (((ctx.eidolon as number) ?? 0) >= 6) ctx.golden = Math.min(3, ((ctx.golden as number) ?? 0) + 1)
    sim.log(`${u.name} King's Burden +2 Interest + energy on ally Ult`)
  },

  // Talent: when another ally target takes action, +1 Interest
  onAllyTurnStart(sim, _ally, ctx) {
    const u = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'gilgamesh' && !c.dead)
    if (!u) return
    setInterest(sim, u, ctx, ((ctx.interest as number) ?? 0) + 1)
  },

  // Talent2 "I Grant You Permission To Strike": Gil/Saber attacks → tally; at threshold (8) → Joint FUA on ALL enemies (Saber Wind first, then Gilgamesh Lightning) + 3 Interest + Saber +120 Energy + Saber next Ult ×2
  onAfterAttack(sim, attacker, _target, dmgType, ctx) {
    const isSelf = attacker.kind === 'char' && attacker.kitId === 'gilgamesh'
    const isSaber = attacker.kind === 'char' && attacker.kitId === 'saber'
    if (!isSelf && !isSaber) return
    const u = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'gilgamesh' && !c.dead)
    if (!u) return
    // Joint FUA's own hits must not advance the tally / re-trigger. Its hits are deferrable, so a
    // sync flag is defeated (the reaction runs after the flag cleared) — gate on the hit type
    // instead: the only `fua` Gilgamesh/Saber ever deal is the Joint FUA itself (canon: "After using
    // Joint Follow-Up ATK, resets the attack tally").
    if (dmgType === 'fua') return
    const lv = levelsOf(ctx)
    ctx.tally = ((ctx.tally as number) ?? 0) + 1
    const thresh = mult('gilgamesh', 'talent2_a5', lv.talent)
    if ((ctx.tally as number) < thresh) return
    ctx.tally = 0
    const saber = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'saber' && !c.dead)
    for (const e of [...sim.livingEnemiesOf(u)]) {
      // canon notes: Saber attacks first, then Gilgamesh
      if (saber) sim.hit(saber, e, { type: 'fua', mult: mult('gilgamesh', 'talent2_a2', lv.talent), elem: 'Wind', toughDmg: 10, label: 'Joint FUA (Saber)' })
      sim.hit(u, e, { type: 'fua', mult: mult('gilgamesh', 'talent2', lv.talent), elem: 'Lightning', toughDmg: 10, label: 'Joint FUA (Gilgamesh)', split: [0.18, 0.18, 0.18, 0.46] })
    }
    setInterest(sim, u, ctx, ((ctx.interest as number) ?? 0) + mult('gilgamesh', 'talent2_a3', lv.talent))
    if (saber) {
      sim.gainEnergy(saber, mult('gilgamesh', 'talent2_a4', lv.talent))
      // Saber next Ult DMG ×2 (talent2_a6) — set flag on saber's runtime
      const saberRt = sim.rt(saber)
      saberRt.gilNextUltMul = mult('gilgamesh', 'talent2_a6', lv.talent)
    }
    sim.log(`${u.name} Joint FUA triggered (tally reset)`)
  },
}


// ===== trailblazer_destruction  (was trailblazer_destruction.ts) =====
const TID = 'trailblazer_destruction'

// {NICKNAME} — The Destruction path
  // docs/combat_mechanics/Stat calc.md: break-based ATK stacking bruiser.
  export const trailblazerDestructionKit: KitDef = {
    id: TID,
    name: 'Trailblazer (Destruction)',
  elem: 'Physical',
  energyMax: 120,
  base: { ...PROG.trailblazer_destruction.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Destruction' },
  // 800107 "Immortal Third Strike": immediately heal all allies for 15% of their Max HP.
  technique: {
    name: 'Immortal Third Strike',
    kind: 'buff',
    apply(sim, u) {
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        sim.heal(a, Math.floor(a.maxHp * 0.15))
      }
    },
  },

  onStart(sim, u, _ctx) {
    sim.gainEnergy(u, 15) // Ready for Battle trace
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return decideByPattern(sim, u, ctx)
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    rt.tbDestLastAction = action.kind

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      if (enemies.length <= 1) {
        sim.hit(u, t, { type: 'ult', elem: 'Physical', mult: mult(TID, 'ult', lv.ult), toughDmg: 30, label: 'Stardust Ace: Blowout Farewell Hit' })
      } else {
        sim.addBuff(t, { id: 'tb_dest_fw', name: 'Fighting Will DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.25 }], turns: 1 })
        sim.hitBlast(u, t,
          { type: 'ult', elem: 'Physical', mult: mult(TID, 'ult_a2', lv.ult), toughDmg: 30, label: 'Blowout: RIP Home Run (main)' },
          { type: 'ult', elem: 'Physical', mult: mult(TID, 'ult_a3', lv.ult), toughDmg: 20, label: 'Blowout: RIP Home Run (adj)' })
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      sim.addBuff(t, { id: 'tb_dest_fw', name: 'Fighting Will DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.25 }], turns: 1 })
      sim.hitBlast(u, t,
        { type: 'skill', elem: 'Physical', mult: mult(TID, 'skill', lv.skill), toughDmg: 20, label: 'RIP Home Run (main)' },
        { type: 'skill', elem: 'Physical', mult: mult(TID, 'skill', lv.skill), toughDmg: 10, label: 'RIP Home Run (adj)' })
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, t, { type: 'basic', elem: 'Physical', mult: mult(TID, 'basic', lv.basic), toughDmg: 10, label: 'Farewell Hit' })
    // E2: attacking Physical-weakness enemy heals 5% of own ATK
    if (eid >= 2 && t.weaknesses.includes('Physical')) sim.heal(u, Math.round(eff(u).atk * 0.05), u)
  },

  // Talent "The Unyielding": weakness break → this character gains Perfect Pickoff
  // (ATK + talent%, DEF +10%, stack max 2). E6: also on defeating an enemy.
  onBreak(sim, breaker, _victim, ctx) {
    if (breaker.kitId !== TID) return
    sim.addBuff(breaker, {
      id: 'tb_dest_pickoff', name: 'Perfect Pickoff', turns: Infinity, maxStacks: 2,
      mods: [
        { stat: 'atkPct', value: mult(TID, 'talent', levelsOf(ctx).talent) },
        { stat: 'defPct', value: 0.10 },
      ],
    })
  },

  onKill(sim, killer, _victim, ctx) {
    if (killer.kitId !== TID) return
    const eid = (ctx.eidolon as number) ?? 0
    // E6: talent stacks also on defeat
    if (eid >= 6) {
      sim.addBuff(killer, {
        id: 'tb_dest_pickoff', name: 'Perfect Pickoff', turns: Infinity, maxStacks: 2,
        mods: [
          { stat: 'atkPct', value: mult(TID, 'talent', levelsOf(ctx).talent) },
          { stat: 'defPct', value: 0.10 },
        ],
      })
    }
    // E1: when enemies defeated due to Ultimate, +10 extra Energy, once per attack
    const rt = sim.rt(killer)
    if (eid >= 1 && rt.tbDestLastAction === 'ult' && rt.tbDestE1Seq !== sim.attackNo()) {
      rt.tbDestE1Seq = sim.attackNo()
      sim.gainEnergy(killer, 10)
    }
  },

  }
