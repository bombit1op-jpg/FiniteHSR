// Kits of the Abundance path, merged from the former per-character modules (7 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, type KitDef, type SimApi, type KitRuntime } from '../kit'
import { mult, PROG } from '../progression'
import { isDebuff, eff, buffSum } from '../combat/StatResolver'
import type { AbilityLevels, Unit } from '../entities/Unit'
import type { Mod } from '../effects/Buff'

// ===== gallagher  (was gallagher.ts) =====

export const gallagherKit: KitDef = {
  id: 'gallagher',
  name: 'Gallagher',
  elem: 'Fire',
  energyMax: 110,
  base: { ...PROG.gallagher.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 130107 "Artisan Elixir": Besotted on all enemies (2 turns) + 50% ATK Fire to all enemies.
  // combat-starting (attack) Technique.
  technique: {
    name: 'Artisan Elixir',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0,
          () => sim.addBuff(e, {
            id: 'besotted', name: 'Besotted Break Taken+',
            mods: [{ stat: 'vulnType:break', value: mult('gallagher', 'talent', lv.talent) }],
            turns: 2,
            sourceId: u.id,
            payload: mult('gallagher', 'talent_a2', lv.talent),
          }),
          'Besotted')
      sim.hitAoe(u, { type: 'basic', elem: 'Fire', mult: 0.5, label: 'Artisan Elixir' })
    },
  },
  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 1) {
      sim.gainEnergy(u, 20)
      sim.addBuff(u, { id: 'gallagher_e1', name: 'Salty Dog', mods: [{ stat: 'effRes', value: 0.50 }] })
    }
    if (eid >= 6)
      sim.addBuff(u, { id: 'gallagher_e6', name: 'Blood and Sand', mods: [{ stat: 'be', value: 0.20 }] })
  },
  decide(sim, u, ctx) {
    // Ult (130103) enhances next Basic into Nectar Blitz — the extra turn after Ult
    // must resolve as that Basic, not as an AI-picked Skill (extra-turn action goes through decide).
    if (ctx.nectarReady) return { kind: 'basic' }
    // healer AI: heal when someone is hurt (needs SP — Special Brew costs 1)
    const critically = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp < a.maxHp * 0.35)
    if (critically && sim.sp() >= 1) return { kind: 'skill' }
    const wounded = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp < a.maxHp * 0.70)
    if (wounded && sim.sp() >= 1) return { kind: 'skill' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const e6wbe = eid >= 6 ? 0.2 : 0
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log(`${u.name} Ult: Champagne Etiquette (energy +5)`) // +5 from castUlt
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'ult', mult: mult('gallagher', 'ult', lv.ult), toughDmg: 20, label: 'Champagne Etiquette', wbeBonus: e6wbe })
        // Besotted: target takes more Break DMG; attacking allies heal flat amount
        const turns = eid >= 4 ? 3 : 2
        sim.applyDebuff(u, e, 1.0, () => {
          sim.addBuff(e, {
            id: 'besotted', name: 'Besotted Break Taken+',
            mods: [{ stat: 'vulnType:break', value: mult('gallagher', 'talent', lv.talent) }],
            turns,
            sourceId: u.id,
            payload: mult('gallagher', 'talent_a2', lv.talent),
          })
        }, 'Besotted')
      }
      // enhance next Basic into Nectar Blitz
      ctx.nectarReady = true
      // A4 Organic Yeast: 100% Advance Forward after Ultimate (any cast).
      // advance() during own turn is wiped by endTick (av<=0 → baseAv), so extra turn directly.
      sim.grantExtraTurn(u)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      // Special Brew: heals one ally, 1 SP, +30 energy (sp_base)
      sim.gainEnergy(u, 30)
      const allies = sim.allies('ally').filter(a => a.kind === 'char')
      const fallback = allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), allies[0] ?? u)
      const t = manualTarget(sim, action, fallback)
      // base flat heal; trace Novel Concoction adds 50% of BE as bonus healing, capped at 75%
      const bonus = Math.min(0.75, 0.5 * sim.effBe(u))
      const amount = mult('gallagher', 'skill', lv.skill) * (1 + bonus)
      sim.heal(t, amount)
      sim.log(`${u.name} heals ${t.name} for ${Math.round(amount)} [Special Brew]`)
      // E2 Lion's Tail: dispel 1 debuff + target Effect RES +30% for 2 turns
      if (eid >= 2) {
        const debuff = t.buffs.find(b => b.sourceId !== 'gear' && b.id !== 'traces' && isDebuff(b))
        if (debuff) sim.removeBuff(t, debuff.id)
        sim.addBuff(t, { id: 'gallagher_e2', name: 'Lion\'s Tail', mods: [{ stat: 'effRes', value: 0.30 }], turns: 2 })
      }
      return
    }

    // basic branch — no SP cost/gain changes needed except standard generation
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    if (ctx.nectarReady) {
      ctx.nectarReady = false
      const target = t
      // Nectar Blitz: Fire DMG ignoring Weakness Type (pierce), tough 30
      sim.hit(u, target, {
        type: 'basic', mult: mult('gallagher', 'basic_en', lv.basic),
        toughDmg: 30, pierceRatio: 1, label: 'Nectar Blitz', wbeBonus: e6wbe, split: [0.25, 0.15, 0.6],
      })
      // A6 Bottoms Up: when Nectar Blitz hits Besotted enemy, talent heal also applies to teammates
      if (eid >= 6 && target.buffs.some(b => b.id === 'besotted')) {
        const bonus = Math.min(0.75, 0.5 * sim.effBe(u))
        const amount = mult('gallagher', 'talent_a2', lv.talent) * (1 + bonus)
        for (const a of sim.allies('ally')) {
          if (a.kind === 'char' && !a.dead && a.id !== u.id) sim.heal(a, amount)
        }
        sim.log('A6 Bottoms Up: Nectar Blitz heals all teammates')
      }
    } else {
      // basic dealt in 2 hits (50% + 50%)
      sim.hit(u, t, { type: 'basic', mult: mult('gallagher', 'basic', lv.basic) * 0.5, toughDmg: 5, label: 'Corkage Fee', wbeBonus: e6wbe })
      if (!t.dead) sim.hit(u, t, { type: 'basic', mult: mult('gallagher', 'basic', lv.basic) * 0.5, toughDmg: 5, label: 'Corkage Fee', wbeBonus: e6wbe })
    }
  },

  // Talent Tipsy Tussle: when a Besotted enemy is attacked by an ally, the ATTACKING ally is healed (flat talent_a2).
  // A6 Bottoms Up arms the same heal to everyone when Gallagher's Nectar Blitz hits Besotted (in perform).
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (target.dead || !attacker || attacker.side !== 'ally' || attacker.dead) return
    if (!target.buffs.some(b => b.id === 'besotted')) return
    if (ctx.gallTalentSeq === sim.attackNo()) return // once per attack (multi-hit/bounce)
    ctx.gallTalentSeq = sim.attackNo()
    const lv = levelsOf(ctx)
    // Novel Concoction bonus scales Gallagher's OWN outgoing healing, not the attacker's BE
    const g = sim.allies('ally').find(u => u.kitId === 'gallagher' && !u.dead) ?? attacker
    const bonus = Math.min(0.75, 0.5 * sim.effBe(g))
    const amount = mult('gallagher', 'talent_a2', lv.talent) * (1 + bonus)
    sim.heal(attacker, amount)
    sim.log(`${attacker.name} healed +${Math.round(amount)} (Besotted Talent)`)
  },
}


// ===== huohuo  (was huohuo.ts) =====
function levelsOf_huohuo(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

// Talent flat heal amounts by level (L1-L10)
const TALENT_FLAT = [30, 48, 61.5, 75, 84, 93, 99.75, 106.5, 113.25, 120]

// E4 Tangerine of War: less HP → more healing, up to +80% (full bonus at 50% missing HP)
function e4Mul(target: Unit, eid: number): number {
  if (eid < 4) return 1
  const missing = 1 - target.hp / target.maxHp
  return 1 + Math.min(0.8, (missing * 0.8) / 0.5)
}

function talentHeal(sim: SimApi, u: Unit, lv: AbilityLevels, target: Unit, eid: number): number {
  const base = eff(u).hp * mult('huohuo', 'talent', lv.talent) + TALENT_FLAT[Math.min(lv.talent - 1, 9)]
  return Math.round(base * e4Mul(target, eid))
}

function healWithE6(sim: SimApi, u: Unit, t: Unit, amount: number, eid: number): void {
  sim.heal(t, amount)
  // E6: healed ally DMG+50% for 2 turns
  if (eid >= 6 && t.kind === 'char') sim.addBuff(t, { id: 'huohuo_e6', name: 'Woven Together, Cohere Forever', mods: [{ stat: 'dmgAll', value: 0.50 }], turns: 2 })
}

// grant/refresh Divine Provision (Skill/Ult 3 turns, A2 2 turns; E1: +1 turn, team SPD+12% while active, OHB+20%)
function grantDivineProvision(sim: SimApi, u: Unit, eid: number, turns: number): void {
  const ctx = sim.rt(u)
  ctx.divineProvTurns = turns + (eid >= 1 ? 1 : 0)
  ctx.divineProvTriggers = 0
  sim.removeBuff(u, 'divine_prov')
  sim.addBuff(u, { id: 'divine_prov', name: 'Tail: Spiritual Domination', mods: eid >= 1 ? [{ stat: 'outHeal', value: 0.20 }] : [], turns: Infinity })
  if (eid >= 1) {
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char' || a.dead) continue
      sim.addBuff(a, { id: 'huohuo_e1_spd', name: 'Anchored to Vessel, Specters Nestled', mods: [{ stat: 'spdPct', value: 0.12 }], turns: Infinity })
    }
  }
}

function expireDivineProv(sim: SimApi, u: Unit): void {
  const ctx = sim.rt(u)
  ctx.divineProvTurns = 0
  sim.removeBuff(u, 'divine_prov')
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char') continue
    sim.removeBuff(a, 'huohuo_e1_spd')
  }
}

// shared Talent path (ally turn start OR ally Ult): heal target + lowest-HP ally + all allies ≤50% HP
function divineProc(sim: SimApi, hh: Unit, ally: Unit): void {
  const hhCtx = sim.rt(hh)
  if (((hhCtx.divineProvTriggers as number) ?? 0) >= ((hhCtx.divineProvMax as number) ?? 6)) return
  const lv = levelsOf_huohuo(hhCtx)
  const eid = (hhCtx.eidolon as number) ?? 0
  const amount = talentHeal(sim, hh, lv, ally, eid)
  healWithE6(sim, hh, ally, amount, eid)
  hhCtx.divineProvTriggers = ((hhCtx.divineProvTriggers as number) ?? 0) + 1
  // A6 Stress Reaction to Horror: each Talent trigger restores 1 Energy to Huohuo
  sim.gainEnergy(hh, 1)
  sim.log('Huohuo A6: +1 Energy (Divine Provision)')
  const others = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== ally.id)
  let lowest: Unit | null = null
  for (const a of others) if (!lowest || a.hp / a.maxHp < lowest.hp / lowest.maxHp) lowest = a
  if (lowest) healWithE6(sim, hh, lowest, talentHeal(sim, hh, lv, lowest, eid), eid)
  for (const a of others) {
    if (a.hp <= a.maxHp * 0.5) healWithE6(sim, hh, a, talentHeal(sim, hh, lv, a, eid), eid)
  }
  // dispel 1 debuff from the healed ally
  const debuff = ally.buffs.find(b => b.debuff === true)
  if (debuff) sim.removeBuff(ally, debuff.id)
  sim.log(`Huohuo Talent: heals ${ally.name} +${amount} (Divine Provision)`)
}

export const huohuoKit: KitDef = {
  id: 'huohuo',
  name: 'Huohuo',
  elem: 'Wind',
  energyMax: 140,
  base: { ...PROG.huohuo.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #121207 "Fiend: Impeachment of Evil" (Technique): 100% base chance, ATK −25% on all enemies 2 turns.
  technique: {
    name: 'Fiend: Impeachment of Evil',
    kind: 'buff',
    apply(sim, u) {
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0, () => sim.addBuff(e, { id: 'huohuo_tech_atk', name: 'Impeachment of Evil ATK↓', mods: [{ stat: 'atkPct', value: -0.25 }], turns: 2, debuff: true }), 'ATK Down')
    },
  },
  onStart(sim, u) {
    // A2 Fearful to Act: +30 Energy + Divine Provision
    sim.gainEnergy(u, 30)
    const ctx = sim.rt(u)
    ctx.divineProvTriggers = 0
    ctx.divineProvMax = 6
    ctx.divineProvRevives = 0
    grantDivineProvision(sim, u, (ctx.eidolon as number) ?? 0, 2)
    // A4 The Cursed One: +35% CC RES
    sim.addBuff(u, { id: 'huohuo_a4', name: 'The Cursed One', mods: [{ stat: 'effRes', value: 0.35 }] })
  },
  onTurnStart(sim, u, ctx) {
    // Divine Provision duration decreases by 1 turn at the start of Huohuo's turn
    if (u.kitId !== 'huohuo' || u.dead || !sim.hasBuff(u, 'divine_prov')) return
    const t = ((ctx.divineProvTurns as number) ?? 3) - 1
    if (t <= 0) expireDivineProv(sim, u)
    else ctx.divineProvTurns = t
  },
  decide(sim, u, _ctx) {
    const allies = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead && a.hp < a.maxHp * 0.85)
    if (allies.length && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf_huohuo(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.markAlliedTarget('team')
      sim.log('Huohuo Ult: energy + ATK for all allies')
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead || a.id === u.id) continue
        a.energy = Math.min(a.maxEnergy, a.energy + mult('huohuo', 'ult_a2', lv.ult) * a.maxEnergy)
        sim.addBuff(a, { id: 'tailwind', name: 'Tail: Spiritual Domination', mods: [{ stat: 'atkPct', value: mult('huohuo', 'ult', lv.ult) }], turns: 2 })
        // A4 The Cursed One: allies with max Energy ≥ 160 also get ATK+24%
        if (a.maxEnergy >= 160)
          sim.addBuff(a, { id: 'huohuo_a4_atk', name: 'The Cursed One', mods: [{ stat: 'atkPct', value: 0.24 }], turns: 2 })
      }
      // Talent: Ultimate also grants/refreshes Divine Provision
      grantDivineProvision(sim, u, eid, 3)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const allies = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead)
      const target = allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), allies[0])
      sim.markAlliedTarget(target)
      const eid2 = (ctx.eidolon as number) ?? 0
      // Skill heal: #1% MaxHP + #2 (target), #3% MaxHP + #4 (adjacent); E4 scales by missing HP
      const skillHealTarget = Math.round((eff(u).hp * mult('huohuo', 'skill', lv.skill) + [160,256,328,400,448,496,532,568,604,640][Math.min(lv.skill - 1, 9)]) * e4Mul(target, eid2))
      const skillHealAdj = Math.round((eff(u).hp * mult('huohuo', 'skill_a2', lv.skill) + [128,204.8,262.4,320,358.4,396.8,425.6,454.4,483.2,512][Math.min(lv.skill - 1, 9)]) * e4Mul(target, eid2))
      healWithE6(sim, u, target, skillHealTarget, eid2)
      for (const a of allies) {
        if (a.id !== target.id) healWithE6(sim, u, a, skillHealAdj, eid2)
      }
      // Talent: Skill also grants/refreshes Divine Provision (resets trigger counter)
      grantDivineProvision(sim, u, eid2, 3)
      sim.log(`Huohuo Skill: heals ${target.name} +${skillHealTarget}, all +${skillHealAdj}`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', elem: 'Wind', flat: eff(u).hp * mult('huohuo', 'basic', lv.basic), toughDmg: 10, label: 'Hwaa!', split: [0.2, 0.2, 0.2, 0.4] })
  },

  // Talent: Divine Provision heals ally at start of their turn
  onAllyTurnStart(sim, ally, _ctx) {
    if (ally.dead) return
    const hh = sim.allies('ally').find(u => u.kitId === 'huohuo' && !u.dead)
    if (!hh) return
    if (!sim.hasBuff(hh, 'divine_prov')) return
    divineProc(sim, hh, ally)
  },

  // Talent: heal ally when they use Ultimate
  onAllyUlt(sim, ally, _ctx) {
    if (ally.dead) return
    const hh = sim.allies('ally').find(u => u.kitId === 'huohuo' && !u.dead)
    if (!hh) return
    if (!sim.hasBuff(hh, 'divine_prov')) return
    divineProc(sim, hh, ally)
  },

  // E2: Divine Provision revives a fallen ally to 50% HP (2 uses per battle) and shortens Divine Provision
  onAllyHit(sim, _attacker, target, _dmg, _ctx) {
    if (target.kind !== 'char' || target.hp > 0) return
    const hh = sim.allies('ally').find(u => u.kitId === 'huohuo' && !u.dead)
    if (!hh) return
    const eid = (sim.rt(hh).eidolon as number) ?? 0
    if (eid < 2) return
    if (!sim.hasBuff(hh, 'divine_prov')) return
    const hhCtx = sim.rt(hh)
    if (((hhCtx.divineProvRevives as number) ?? 0) >= 2) return
    hhCtx.divineProvRevives = ((hhCtx.divineProvRevives as number) ?? 0) + 1
    sim.revive(target, Math.round(target.maxHp * 0.5), hh)
    hhCtx.divineProvTurns = ((hhCtx.divineProvTurns as number) ?? 3) - 1
    if ((hhCtx.divineProvTurns as number) <= 0) expireDivineProv(sim, hh)
    sim.log(`Huohuo E2: revives ${target.name} to 50% HP`)
  },
}

// ===== luocha  (was luocha.ts) =====
function findLuocha(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'luocha' && !u.dead)
}

function lowestHpAlly(sim: SimApi, u: Unit): Unit {
  const list = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
  return list.length ? list.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), list[0]) : u
}

function skillHealAmount(sim: SimApi, u: Unit, lv: AbilityLevels): number {
  return Math.round(sim.effAtk(u) * mult('luocha', 'skill', lv.skill) + mult('luocha', 'skill_a2', lv.skill))
}

export const luochaKit: KitDef = {
  id: 'luocha',
  name: 'Luocha',
  elem: 'Imaginary',
  energyMax: 100,
  base: { ...PROG.luocha.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #120307 "Mercy of a Fool" (Technique): trigger the Talent (Prayer of Abyss Flower field) at battle start.
  technique: {
    name: 'Mercy of a Fool',
    kind: 'buff',
    zone: true,
    apply(sim, u, ctx) {
      sim.addBuff(u, { id: 'luocha_zone', name: 'Prayer of Abyss Flower', mods: [], turns: 2 })
      if (((ctx.eidolon as number) ?? 0) >= 4)
        for (const e of sim.livingEnemiesOf(u))
          sim.addBuff(e, { id: 'luocha_e4', name: 'Heavy Lies the Crown DMG↓', mods: [{ stat: 'weaken', value: 0.12 }], turns: 2 })
      sim.log('Luocha Technique: Prayer of Abyss Flower (Talent) triggered')
    },
  },
  // E1: Zone active → all allies +20% ATK (refreshed on each ally's turn)
  onAllyTurnStart(sim, ally, ctx) {
    if (((ctx.eidolon as number) ?? 0) < 1) return
    const lc = findLuocha(sim)
    const active = lc ? sim.hasBuff(lc, 'luocha_zone') : false
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char') continue
      if (active) sim.addBuff(a, { id: 'luocha_e1', name: 'Ablution of the Quick', mods: [{ stat: 'atkPct', value: 0.20 }], turns: 1 })
      else sim.removeBuff(a, 'luocha_e1')
    }
  },
  // Talent: ally attacking an enemy in the Zone is healed (12% ATK + flat);
  // A4 Sanctified: all OTHER allies heal 7% ATK + 93 as well.
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (attacker.side !== 'ally' || attacker.kind !== 'char' || attacker.dead) return
    if (target.dead || target.side !== 'enemy') return
    const lc = findLuocha(sim)
    if (!lc || !sim.hasBuff(lc, 'luocha_zone')) return
    const lv = levelsOf(ctx)
    const main = Math.round(sim.effAtk(lc) * mult('luocha', 'talent_a2', lv.talent) + mult('luocha', 'talent_a3', lv.talent))
    sim.heal(attacker, main)
    const side = Math.round(sim.effAtk(lc) * 0.07 + 93)
    for (const a of sim.allies('ally')) {
      if (a.kind === 'char' && !a.dead && a.id !== attacker.id) sim.heal(a, side)
    }
    sim.log(`Zone heals ${attacker.name}+${main}, others+${side}`)
  },
  // Talent: ally drops to ≤50% HP → auto-triggers the Skill (2-turn CD).
  // Canon: the auto version regenerates Energy (sp_base 30) and grants 1 Abyss Flower,
  // but does NOT trigger on-use effects (Shared Feeling) and costs no SP.
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    if (target.side !== 'ally' || target.kind !== 'char' || target.dead) return
    const lc = findLuocha(sim)
    if (!lc) return
    if (target.hp / target.maxHp > 0.5) return
    if (((ctx.autoHealCd as number) ?? 0) > 0) return
    ctx.autoHealCd = 2
    let amt = skillHealAmount(sim, lc, levelsOf(ctx))
    // E2: auto version = Skill trigger → target is always <50% → Outgoing Healing +30%
    if (((ctx.eidolon as number) ?? 0) >= 2) amt = Math.round(amt * 1.3)
    sim.gainEnergy(lc, 30)
    sim.heal(target, amt)
    sim.log(`Abyss Flower auto-heals ${target.name}+${amt} (energy +30)`)
    addFlower(sim, lc, ctx, levelsOf(ctx))
  },
  onTurnStart(sim, _u, ctx) {
    ctx.autoHealCd = Math.max(0, ((ctx.autoHealCd as number) ?? 0) - 1)
  },
  decide(sim, u, ctx) {
    const needsHeal = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp / a.maxHp < 0.6)
    if ((needsHeal || (ctx.skillPriority as number) > 0) && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('Death Wish (energy +5)') // +5 from castUlt
      for (const e of [...sim.livingEnemiesOf(u)]) {
        // dispels 1 buff from each enemy
        const dispellable = e.buffs.filter(b => b.sourceId !== 'gear')
        if (dispellable.length) {
          sim.removeBuff(e, dispellable[0].id)
          sim.log(`Death Wish dispels ${dispellable[0].name} from ${e.name}`)
        }
        sim.hit(u, e, { type: 'ult', mult: mult('luocha', 'ult', lv.ult), toughDmg: 20, label: 'Death Wish' })
        if (eid >= 6 && !e.dead) {
          sim.applyDebuff(u, e, 1.0, () => sim.addBuff(e, { id: 'luocha_e6', name: 'Reunion With the Dust All-RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: 2 }), 'E6 All RES down')
        }
      }
      addFlower(sim, u, ctx, lv)
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const ally = manualTarget(sim, action, lowestHpAlly(sim, u))
    sim.markAlliedTarget(ally)
      let amt = skillHealAmount(sim, u, lv)
      // A2 Purification: dispels 1 debuff
      const debuff = ally.buffs.find(b => b.sourceId !== 'gear' && b.id !== 'traces')
      if (debuff) {
        sim.removeBuff(ally, debuff.id)
        sim.log(`Prayer dispels ${debuff.name} from ${ally.name}`)
      }
      if (eid >= 2) {
        if (ally.hp / ally.maxHp < 0.5) amt = Math.round(amt * 1.3)
        else sim.addBuff(ally, { id: 'luocha_e2_shield', name: 'Bestowal From the Pure', mods: [], turns: 2, sourceId: u.id, shield: Math.round(sim.effAtk(u) * 0.18 + 240) })
      }
      sim.heal(ally, amt)
      sim.log(`${u.name} heals ${ally.name}+${amt}`)
      addFlower(sim, u, ctx, lv)
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    if (!enemies.length) return
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('luocha', 'basic', lv.basic), toughDmg: 10, label: 'Thorns of the Abyss', split: [0.3, 0.3, 0.4] })
  },
}

function addFlower(sim: SimApi, u: Unit, ctx: KitRuntime, lv: AbilityLevels): void {
  const need = mult('luocha', 'talent', lv.talent)
  const have = (ctx.flower as number) ?? 0
  if (have + 1 >= need) {
    ctx.flower = 0
    sim.addBuff(u, { id: 'luocha_zone', name: 'Prayer of Abyss Flower', mods: [], turns: 2 })
    sim.log(`${u.name} deploys the Abyss Flower Zone`)
    // E4: enemies in the Zone are Weakened (deal 12% less)
    if (((ctx.eidolon as number) ?? 0) >= 4) {
      for (const e of sim.livingEnemiesOf(u)) {
        sim.addBuff(e, { id: 'luocha_e4', name: 'Heavy Lies the Crown DMG↓', mods: [{ stat: 'weaken', value: 0.12 }], turns: 2 })
      }
    }
  } else {
    ctx.flower = have + 1
  }
}

// ===== natasha  (was natasha.ts) =====
function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** Talent "Innervation": when healing allies at ≤30% HP, natasha's Outgoing Healing +talent_a2%.
 *  Also works on continuous healing. Model: outHeal buff ON NATASHA while any living ally ≤30%. */
function refreshTalent(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const threshold = mult('natasha', 'talent', lv.talent)
  const bonus = mult('natasha', 'talent_a2', lv.talent)
  const wounded = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp / a.maxHp <= threshold)
  if (wounded) {
    sim.addBuff(u, { id: 'natasha_innervation', name: 'Innervation', mods: [{ stat: 'outHeal', value: bonus }], turns: 999 })
    sim.log(`Innervation active: outHeal +${Math.round(bonus * 100)}%`)
  } else {
    sim.removeBuff(u, 'natasha_innervation')
  }
}

interface Hot { heal: number; turns: number }

/** skill/E2 HoT: heal at the start of the affected ally's turn. Heal with src=natasha so her
 *  OHB (incl. Innervation) applies — canon "Innervation also works on continuous healing". */
function tickHot(fx: SimApi, ctx: KitRuntime, ally: Unit): void {
  const hots = (ctx.hots as Record<string, Hot>) ?? {}
  const h = hots[ally.id]
  if (!h) return
  const nat = fx.allies('ally').find(a => a.kitId === 'natasha' && !a.dead)
  fx.heal(ally, h.heal, nat)
  h.turns--
  if (h.turns <= 0) delete hots[ally.id]
}

function addHot(ctx: KitRuntime, ally: Unit, natMaxHp: number, pct: number, flat: number, turns: number): void {
  const hots = (ctx.hots as Record<string, Hot>) ?? (ctx.hots = {} as Record<string, Hot>)
  hots[ally.id] = { heal: Math.floor(natMaxHp * pct + flat), turns }
}

export const natashaKit: KitDef = {
  id: 'natasha',
  name: 'Natasha',
  elem: 'Physical',
  energyMax: 90,
  base: { ...PROG.natasha.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Abundance' },
  // 110507 "Hypnosis Research": Physical DMG 80% ATK to a random enemy + 100% base chance to
  // Weaken all enemies (deal 30% less DMG) for 1 turn. attack Technique.
  technique: {
    name: 'Hypnosis Research',
    kind: 'attack',
    apply(sim, u) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hit(u, sim.rngPick(enemies), { type: 'basic', mult: 0.8, elem: 'Physical', toughDmg: 10, label: 'Hypnosis Research' })
      for (const e of enemies) sim.applyDebuff(u, e, 1.0, () => sim.addBuff(e, { id: 'natasha_tech_weaken', name: 'Hypnosis Research', mods: [{ stat: 'weaken', value: 0.30 }], turns: 1, debuff: true }), 'Weaken')
    },
  },
  decide(sim, _u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    const wounded = sim.allies('ally').filter(a => a.hp / a.maxHp < 0.5)
    if (wounded.length > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const healPct = mult('natasha', 'ult', lv.ult)
      const healFlat = mult('natasha', 'ult_a2', lv.ult)
      // E2 Clinical Research: allies ≤30% before the heal get a 1-turn HoT (6% MaxHP + 160)
      const e2Targets = eid(ctx) >= 2 ? sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.hp / a.maxHp <= 0.3) : []
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.heal(a, Math.floor(u.maxHp * healPct + healFlat), u)
      }
      for (const a of e2Targets) addHot(ctx, a, u.maxHp, 0.06, 160, 1)
      sim.log('Gift of Rebirth (energy +5)') // +5 from castUlt
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const healPct = mult('natasha', 'skill', lv.skill)
      const healFlat = mult('natasha', 'skill_a3', lv.skill)
      const weakest = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead).reduce((w, a) => a.hp / a.maxHp < w.hp / w.maxHp ? a : w)
      sim.heal(weakest, Math.floor(u.maxHp * healPct + healFlat), u)
      const hotPct = mult('natasha', 'skill_a2', lv.skill)
      const hotFlat = mult('natasha', 'skill_a4', lv.skill)
      // A6 Recuperation: Regeneration +1 turn
      addHot(ctx, weakest, u.maxHp, hotPct, hotFlat, 2 + 1)
      sim.log(`Love, Heal, and Choose: heals ${weakest.name} + Regeneration`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('natasha', 'basic', lv.basic), elem: 'Physical', toughDmg: 10, label: 'Behind the Kindness' })
    if (eid(ctx) >= 6) {
      sim.hit(u, t, { type: 'add', noSeq: true, mult: 0.4, scaleStat: 'hp', elem: 'Physical', toughDmg: 0, label: "E6 Doctor's Grace" })
    }
  },

  onStart(sim, u, ctx) {
    ctx.hots = {}
    // A4 Healer: +10% Outgoing Healing
    sim.addBuff(u, { id: 'natasha_a4', name: 'Healer', mods: [{ stat: 'outHeal', value: 0.1 }], turns: Infinity })
    refreshTalent(sim, u, ctx)
  },

  onTurnStart(sim, u, ctx) {
    tickHot(sim, ctx, u)
    refreshTalent(sim, u, ctx)
  },

  onAllyTurnStart(sim, ally, ctx) {
    const nat = sim.allies('ally').find(a => a.kitId === 'natasha' && !a.dead)
    if (nat) refreshTalent(sim, nat, ctx)
    tickHot(sim, ctx, ally)
  },

  // E1 Pharmacology Expertise: self-heal once when HP ≤30% after being attacked; E4 +5 EN per hit
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    if (target.kind !== 'char' || target.dead || target.kitId !== 'natasha') return
    if (eid(ctx) >= 1 && !(ctx.ntE1 as boolean) && target.hp / target.maxHp <= 0.3) {
      ctx.ntE1 = true
      const heal = Math.floor(target.maxHp * 0.15 + 400)
      sim.heal(target, heal, target)
      sim.log(`E1 Pharmacology Expertise: self-heal ${heal}`)
    }
    if (eid(ctx) >= 4) {
      sim.gainEnergy(target, 5)
      sim.log('E4 Miracle Cure: +5 Energy')
    }
  },
}

// ===== lynx  (was lynx.ts) =====
function levelsOf_lynx(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

interface Hot_lynx { heal: number; turns: number; eid: number }

function healOut(sim: SimApi, t: Unit, amount: number, eid: number): void {
  // E1 Morning of Snow Hike: healing allies at ≤50% HP is boosted by 20% (also continuous healing)
  if (eid >= 1 && t.hp <= t.maxHp * 0.5) {
    amount *= 1.2
    sim.log(`Lynx E1: healing ally at ≤50% HP, Outgoing +20%`)
  }
  sim.heal(t, Math.round(amount))
}
function tickHot_lynx(fx: SimApi, ctx: Record<string, unknown>, ally: Unit): void {
  const hots = (ctx.hots as Record<string, Hot_lynx> | undefined) ?? {}
  const h = hots[ally.id]
  if (!h) return
  healOut(fx, ally, h.heal, h.eid)
  fx.log(`Lynx Talent: ${ally.name} +${Math.round(h.heal)} (Outdoor Survival Experience)`)
  h.turns--
  if (h.turns <= 0) delete hots[ally.id]
}

function addHot_lynx(fx: SimApi, ctx: Record<string, unknown>, ally: Unit, lx: Unit, lv: AbilityLevels, eid: number): void {
  const hots = (ctx.hots as Record<string, Hot_lynx>) ?? {}
  // Talent Outdoor Survival Experience: HoT = #2% of Lynx's Max HP + #3 per turn; if target has SR, + #4% + #5
  let heal = lx.maxHp * mult('lynx', 'talent_a2', lv.talent) + mult('lynx', 'talent_a3', lv.talent)
  if (fx.hasBuff(ally, 'lynx_sr')) heal += lx.maxHp * mult('lynx', 'talent_a4', lv.talent) + mult('lynx', 'talent_a5', lv.talent)
  // A6 Survival in the Extreme: HoT +1 turn (#1=2 → 3)
  const turns = Math.round(mult('lynx', 'talent', lv.talent)) + 1
  hots[ally.id] = { heal, turns, eid }
}

export const lynxKit: KitDef = {
  id: 'lynx',
  name: 'Lynx',
  elem: 'Quantum',
  energyMax: 100,
  base: { ...PROG.lynx.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Abundance' },
  // 111007 "Chocolate Energy Bar": at battle start, all allies gain the Talent's continuous healing
  // (HoT) for 2 turns. Reuses the Talent HoT formula; duration pinned to the Technique's own
  // param #1=2 (not the A6-boosted Talent duration).
  technique: {
    name: 'Chocolate Energy Bar',
    kind: 'buff',
    apply(sim, u, ctx) {
      const lv = levelsOf_lynx(ctx)
      const eid = (ctx.eidolon as number) ?? 0
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        addHot_lynx(sim, ctx, a, u, lv, eid)
        const h = (ctx.hots as Record<string, Hot_lynx>)[a.id]
        if (h) h.turns = 2
      }
    },
  },
  onStart(sim, _u, ctx) {
    ctx.hots = {}
  },
  decide(sim, u, _ctx) {
    const hurt = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp < a.maxHp * 0.85)
    if (hurt && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf_lynx(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.markAlliedTarget('team')
      // Snowfield First Aid: dispel 1 debuff from all allies + heal them (#2/#3 of Lynx's Max HP); Talent HoT applies to each
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        healOut(sim, a, u.maxHp * mult('lynx', 'ult_a2', lv.ult) + mult('lynx', 'ult_a3', lv.ult), eid)
        const debuff = a.buffs.find(b => b.sourceId !== 'gear' && b.id !== 'traces' && isDebuff(b))
        if (debuff) sim.removeBuff(a, debuff.id)
        addHot_lynx(sim, ctx, a, u, lv, eid)
      }
      sim.log('Snowfield First Aid (energy +5)')
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const targets = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
      const target = targets.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), targets[0])
      sim.markAlliedTarget(target)
      // instant heal component (#4/#5 of Lynx's Max HP)
      healOut(sim, target, u.maxHp * mult('lynx', 'skill_a3', lv.skill) + mult('lynx', 'skill_a4', lv.skill), eid)
      // Survival Response: Max HP +#1% of Lynx's Max HP + #2 flat for #3 turns; E6 adds +6% of Lynx Max HP
      const maxHpBoost = Math.round(u.maxHp * mult('lynx', 'skill', lv.skill) + mult('lynx', 'skill_a2', lv.skill))
        + (eid >= 6 ? Math.round(u.maxHp * 0.06) : 0)
      const mods: Mod[] = []
      mods.push({ stat: 'hpFlat', value: maxHpBoost })
      // Survival Response: Destruction/Preservation targets draw aggro (+500 weight, "greatly increased")
      if (target.base.path === 'Destruction' || target.base.path === 'Preservation')
        mods.push({ stat: 'aggro', value: 500 })
      // E6 Dawn of Explorers' Chart: Effect RES +30% for the Survival Response holder
      if (eid >= 6) mods.push({ stat: 'effRes', value: 0.3 })
      if (sim.hasBuff(target, 'lynx_sr')) sim.removeBuff(target, 'lynx_sr')
      sim.addBuff(target, {
        id: 'lynx_sr', name: 'Survival Response', mods,
        turns: 2,
      })
      eff(target) // recompute maxHp so hpFlat SR applies immediately
      // E4 Dusk of Warm Campfire: SR gained → target ATK +3% of Lynx's Max HP for 1 turn
      if (eid >= 4) {
        if (sim.hasBuff(target, 'lynx_e4')) sim.removeBuff(target, 'lynx_e4')
        sim.addBuff(target, {
          id: 'lynx_e4', name: 'Dusk of Warm Campfire', mods: [{ stat: 'atkFlat', value: Math.round(u.maxHp * 0.03) }],
          turns: 1,
        })
      }
      sim.log(`Lynx Skill: heals ${target.name}, Survival Response + MaxHP+${maxHpBoost}`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', scaleStat: 'hp', mult: mult('lynx', 'basic', lv.basic), toughDmg: 10, label: 'Ice Crampon Technique' })
  },

  // Talent: continuous healing ticks at the start of the affected ally's turn
  onAllyTurnStart(sim, ally, ctx) {
    if (!ally) return
    tickHot_lynx(sim, ctx, ally)
  },
  onTurnStart(sim, u, ctx) {
    tickHot_lynx(sim, ctx, u)
  },

  // A2 Advance Surveying: +2 Energy after a Survival Response target is hit
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    if (!target || !sim.hasBuff(target, 'lynx_sr')) return
    const lx = sim.allies('ally').find(a => a.kitId === 'lynx' && !a.dead)
    if (!lx) return
    sim.gainEnergy(lx, 2)
    sim.log('Lynx A2: +2 Energy')
  },
}

// ===== bailu  (was bailu.ts) =====
function eid_bailu(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** per-holder Invigoration trigger count (talent heal-on-hit, cap talent_a5 + A4 Vidyadhara) */
function invTrig(ctx: KitRuntime, a: Unit): number {
  return ((ctx.invTrig as Record<string, number>) ?? {})[a.id] ?? 0
}
function setInvTrig(ctx: KitRuntime, a: Unit, n: number): void {
  ;(ctx.invTrig as Record<string, number>)[a.id] = n
}

/** apply/refresh Invigoration: heal-on-hit payload + A6 Aquatic Benediction 10% less DMG */
function invigorate(sim: SimApi, u: Unit, a: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const turns = Math.round(mult('bailu', 'ult_a3', lv.ult))
  const ex = a.buffs.find(b => b.id === 'bailu_invig')
  if (ex) {
    // already invigorated → extends duration by 1, triggers preserved
    ex.turns = (ex.turns ?? turns) + 1
    return
  }
  sim.addBuff(a, {
    id: 'bailu_invig', name: 'Invigoration',
    mods: [{ stat: 'mitigation', value: 0.1 }], // A6 Aquatic Benediction: 10% less DMG
    turns, sourceId: u.id,
    payload: Math.floor(mult('bailu', 'talent', lv.talent) * u.maxHp + mult('bailu', 'talent_a2', lv.talent)),
  })
  setInvTrig(ctx, a, 0)
}

/** A2 Qihuang Analects: overheal → target Max HP +10% 2t (approx: heal reaching full HP) */
function qihuang(sim: SimApi, a: Unit): void {
  if (a.dead || a.hp < a.maxHp) return
  sim.addBuff(a, { id: 'bailu_a2', name: 'Qihuang Analects', mods: [{ stat: 'hpPct', value: 0.1 }], turns: 2 })
}

export const bailuKit: KitDef = {
  id: 'bailu',
  name: 'Bailu',
  elem: 'Lightning',
  energyMax: 100,
  base: { ...PROG.bailu.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Abundance' },
  // 121107 "Saunter in the Rain": at battle start, all allies gain Invigoration for 2 turns.
  technique: {
    name: 'Saunter in the Rain',
    kind: 'buff',
    apply(sim, u, ctx) {
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        invigorate(sim, u, a, ctx)
      }
    },
  },
  decide(sim, _u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    const wounded = sim.allies('ally').filter(a => a.hp / a.maxHp < 0.5)
    if (wounded.length > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    const lv = levelsOf(ctx)
    const gifts = () => sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const healPct = mult('bailu', 'ult', lv.ult)
      const healFlat = mult('bailu', 'ult_a2', lv.ult)
      for (const a of gifts()) {
        sim.heal(a, Math.floor(u.maxHp * healPct + healFlat), u)
        qihuang(sim, a)
        invigorate(sim, u, a, ctx)
      }
      // E2 Sylphic Slumber: ult → +15% Outgoing Healing 2t
      if (eid_bailu(ctx) >= 2) sim.addBuff(u, { id: 'bailu_e2', name: 'Sylphic Slumber', mods: [{ stat: 'outHeal', value: 0.15 }], turns: 2 })
      sim.log('Felicitous Thunderleap: heal all + Invigoration (energy +5)')
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const healPct = mult('bailu', 'skill', lv.skill)
      const healFlat = mult('bailu', 'skill_a2', lv.skill)
      const reduce = mult('bailu', 'skill_a3', lv.skill)
      const weakest = gifts().reduce((w, a) => a.hp / a.maxHp < w.hp / w.maxHp ? a : w)
      const healOne = (t: Unit, mul: number) => {
        sim.heal(t, Math.floor((u.maxHp * healPct + healFlat) * mul), u)
        qihuang(sim, t)
        // E4 Evil Excision: every Skill heal → recipient +10% DMG 2t (stacks ×3)
        if (eid_bailu(ctx) >= 4) sim.addBuff(t, { id: 'bailu_e4', name: 'Evil Excision', mods: [{ stat: 'dmgAll', value: 0.1 }], turns: 2, maxStacks: 3 })
      }
      healOne(weakest, 1)
      // #4 random bounces (can re-hit the designated ally, so solo Bailu heals herself), each subsequent heal reduced by #3%
      let m = 1
      for (let i = 0; i < 2; i++) {
        m *= (1 - reduce)
        const candidates = gifts()
        if (!candidates.length) break
        const t = sim.rngPick(candidates)
        healOne(t, m)
      }
      sim.log('Singing Among Clouds: heal + random bounces (energy +30)')
      return
    }

    if (!enemies.length) return
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('bailu', 'basic', lv.basic), elem: 'Lightning', toughDmg: 10, label: 'Diagnostic Kick' })
  },

  // Talent Gourdful of Elixir: Invigorated ally hit → heal (cap talent_a5 + A4); killing blow → revive teammate
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    if (target.kind !== 'char' || target.dead) return
    if (target.hp <= 0) {
      // killing-blow revive: teammates only, once per battle (E6: twice); Bailu herself NOT revived
      if (target.kitId === 'bailu') return
      const bailu = sim.allies('ally').find(u => u.kitId === 'bailu' && !u.dead)
      if (!bailu) return
      const rctx = sim.rt(bailu)
      const used = (rctx.revives as number) ?? 0
      const max = eid_bailu(sim.rt(bailu)) >= 6 ? 2 : 1
      if (used < max && sim.hasBuff(target, 'bailu_invig')) {
        const lv = levelsOf(rctx)
        const revPct = mult('bailu', 'talent_a3', lv.talent)
        const revFlat = mult('bailu', 'talent_a4', lv.talent)
        sim.revive(target, Math.floor(bailu.maxHp * revPct + revFlat), bailu)
        rctx.revives = used + 1
        sim.log(`${target.name} revived by Gourdful of Elixir`)
      }
      return
    }
    const inv = target.buffs.find(b => b.id === 'bailu_invig')
    if (!inv) return
    const bailu = sim.allies('ally').find(u => u.kitId === 'bailu' && !u.dead)
    if (!bailu) return
    const rctx = sim.rt(bailu)
    const cap = Math.round(mult('bailu', 'talent_a5', levelsOf(rctx).talent)) + 1 // A4 Vidyadhara Ichor Lines: +1 trigger
    if (invTrig(rctx, target) >= cap) return
    setInvTrig(rctx, target, invTrig(rctx, target) + 1)
    sim.heal(target, inv.payload as number, bailu)
    sim.log(`Invigoration heals ${target.name}`)
  },

  onBuffExpire(sim, u, b, ctx) {
    if (eid_bailu(ctx) < 1 || b.id !== 'bailu_invig' || u.dead || u.side !== 'ally') return
    // E1 Ambrosial Aqua: Invigoration ends on a full-HP ally → +8 Energy to them
    if (u.hp >= u.maxHp) {
      sim.gainEnergy(u, 8)
      sim.log(`E1 Ambrosial Aqua: ${u.name} +8 energy`)
    }
  },

  onStart(sim, _u, ctx) {
    ctx.revives = 0
    ctx.invTrig = {}
  },
}

// ===== lingsha  (was lingsha.ts) =====
const FUYUAN_SPD = 90
const FUYUAN_MAX = 5

/** E6 Arcadia: while Fuyuan on field, all enemies All-Type RES −20%. */
function applyE6Res(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (((ctx.eidolon as number) ?? 0) < 6) return
  for (const e of sim.livingEnemiesOf(u))
    sim.addBuff(e, { id: 'lingsha_e6_res', name: 'Arcadia RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: Infinity, debuff: true })
}
function clearE6Res(sim: SimApi, u: Unit): void {
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'lingsha_e6_res')
}

function healAllies(sim: SimApi, u: Unit, pct: number, flat: number): void {
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    sim.heal(a, Math.floor(sim.effAtk(u) * pct + flat))
  }
}

function fuyuanOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`fy_${u.id}`)
}

/** Fuyuan Follow-Up ATK: Fire AoE + extra single + heal all + count decrement. */
function fuyuanAct(sim: SimApi, fy: Unit, owner: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(owner)
  fy.base.atk = sim.effAtk(owner) // Fuyuan ATK mirrors Lingsha's current ATK
  sim.hitAoe(fy, { type: 'fua', mult: mult('lingsha', 'talent', lv.talent), elem: 'Fire', toughDmg: 10, label: 'Fuyuan Follow-Up' })
  // Extra single-target hit (#8), prioritizes broken/fire-weak — random here
  const list = sim.livingEnemiesOf(owner)
  if (list.length)
    sim.hit(fy, sim.rngPick(list), { type: 'fua', mult: mult('lingsha', 'talent_a2', lv.talent), elem: 'Fire', toughDmg: 5, label: 'Fuyuan random hit' })
  // E6: +4 extra hits of 50% ATK + All-RES reduction
  if (eid >= 6) {
    for (let i = 0; i < 4; i++) {
      const l2 = sim.livingEnemiesOf(owner)
      if (!l2.length) break
      sim.hit(fy, sim.rngPick(l2), { type: 'fua', mult: 0.5, elem: 'Fire', toughDmg: 5, label: 'Fuyuan E6 hit' })
    }
  }
  // Heal all (#3% ATK + #4 flat)
  healAllies(sim, owner, mult('lingsha', 'talent_a3', lv.talent), mult('lingsha', 'talent_a4', lv.talent))
  // E4: heal lowest-HP ally 40% ATK
  if (eid >= 4) {
    const chars = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
    if (chars.length) {
      const lowest = chars.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), chars[0])
      sim.heal(lowest, Math.floor(sim.effAtk(owner) * 0.4))
    }
  }
  // consume 1 action count; at 0 → disappears
  rt.fuyuanCount = (rt.fuyuanCount as number) - 1
  sim.log(`Fuyuan acts (count ${rt.fuyuanCount})`)
  if ((rt.fuyuanCount as number) <= 0) {
    sim.unregisterUnit(fy.id)
    sim.rt(owner).fuyuanCount = 0
    clearE6Res(sim, owner)
    sim.log(`${owner.name} Fuyuan disappears`)
  }
}

function summonFuyuan(sim: SimApi, u: Unit, ctx: KitRuntime, count: number): Unit {
  const fy = fuyuanOf(sim, u)
  if (fy) {
    sim.rt(u).fuyuanCount = Math.min(FUYUAN_MAX, (sim.rt(u).fuyuanCount as number) + count)
    return fy
  }
  const fyU: Unit = {
    id: `fy_${u.id}`, name: 'Fuyuan', side: 'ally', kind: 'summon', elem: 'Fire',
    sharesOwnerBuffs: true,
    // Summon.md: "they use the current stats of their characters" — Lingsha's base + Lingsha's
    // buffs (merged per hit), Fuyuan's own fixed SPD, no HP of its own.
    base: { ...u.base, hp: 1, spd: FUYUAN_SPD },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
const frt = sim.rt(fyU)
  frt.ownerId = u.id
  sim.rt(u).fuyuanCount = count
  sim.registerUnit(fyU)
  applyE6Res(sim, u, ctx)
  sim.log(`${u.name} summons Fuyuan (SPD ${FUYUAN_SPD}, count ${count})`)
  return fyU
}

export const lingshaKit: KitDef = {
  id: 'lingsha',
  name: 'Lingsha',
  elem: 'Fire',
  energyMax: 110,
  base: { ...PROG.lingsha.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Abundance' },
  // #122207 "Wisps of Aurora" (Technique): summon Fuyuan at battle start + Befog all enemies 2 turns.
  technique: {
    name: 'Wisps of Aurora',
    kind: 'buff',
    apply(sim, u, ctx) {
      summonFuyuan(sim, u, ctx, 2)
      const lv = levelsOf(ctx)
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.addBuff(e, { id: 'lingsha_befog', name: 'Dripping Mistscape Break Taken+', mods: [{ stat: 'vulnType:break', value: mult('lingsha', 'ult_a4', lv.ult) }], turns: 2, debuff: true })
      sim.log(`${u.name} Technique: summons Fuyuan + Befog`)
    },
  },
  onStart(sim, u, ctx) {
    ctx.fuyuanCount = 0
    ctx.emberCd = 0
    const eid = (ctx.eidolon as number) ?? 0
    // E1 Untethered Sun: WBE +50% always
    if (eid >= 1)
      sim.addBuff(u, { id: 'lingsha_e1_wbe', name: 'Untethered Sun WBE', mods: [{ stat: 'wbe', value: 0.5 }], turns: Infinity })
    // A1 Vermilion Waft: ATK = 25% of BE (cap 50%), Outgoing Healing = 10% of BE (cap 20%)
    const be = buffSum(u.buffs, 'be')
    const a1 = be * 0.25
    if (a1 > 0)
      sim.addBuff(u, { id: 'lingsha_a1_atk', name: 'Vermilion Waft ATK', mods: [{ stat: 'atkPct', value: Math.min(0.5, a1) }], turns: Infinity })
    const a1h = be * 0.1
    if (a1h > 0)
      sim.addBuff(u, { id: 'lingsha_a1_ohb', name: 'Vermilion Waft OHB', mods: [{ stat: 'outHeal', value: Math.min(0.2, a1h) }], turns: Infinity })
  },
  // E1 Untethered Sun: enemy Weakness Broken → DEF −20% (debuff on the broken victim)
  onBreak(sim, _breaker, victim, ctx) {
    if (((ctx.eidolon as number) ?? 0) >= 1 && victim && !victim.dead)
      sim.addBuff(victim, { id: 'lingsha_e1_def', name: 'Untethered Sun DEF↓', mods: [{ stat: 'defRed', value: 0.2 }], turns: 2, debuff: true })
  },
  decide(sim, u, ctx) {
    const wounded = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.hp / a.maxHp < 0.5)
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1 && (wounded.length > 0 || !fuyuanOf(sim, u))) return { kind: 'skill' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Befog: all enemies take +Break DMG #4 for #5 turns
      for (const e of enemies)
        sim.addBuff(e, { id: 'lingsha_befog', name: 'Dripping Mistscape Break Taken+', mods: [{ stat: 'vulnType:break', value: mult('lingsha', 'ult_a4', lv.ult) }], turns: 2, debuff: true })
      // Fire AoE + heal all + Fuyuan 100% advance
      if (enemies.length) sim.hitAoe(u, { type: 'ult', mult: mult('lingsha', 'ult', lv.ult), elem: 'Fire', toughDmg: 20, label: 'Dripping Mistscape' })
      healAllies(sim, u, mult('lingsha', 'ult_a2', lv.ult), mult('lingsha', 'ult_a3', lv.ult))
      // E2: all allies Break Effect +40% 3t
      if (eid >= 2)
        for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead)
          sim.addBuff(a, { id: 'lingsha_e2', name: 'Leisure in Carmine Smokeveil', mods: [{ stat: 'be', value: 0.4 }], turns: 3 })
      const fy = fuyuanOf(sim, u)
      if (fy) sim.advance(fy, 1.0)
      sim.gainEnergy(u, 5)
      sim.log(`${u.name} Ult: Dripping Mistscape + Befog`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      if (enemies.length) sim.hitAoe(u, { type: 'skill', mult: mult('lingsha', 'skill', lv.skill), elem: 'Fire', toughDmg: 10, label: 'Smoke and Splendor' })
      healAllies(sim, u, mult('lingsha', 'skill_a2', lv.skill), mult('lingsha', 'skill_a3', lv.skill))
      // summon Fuyuan (or +3 count) + 20% advance
      const fy = summonFuyuan(sim, u, ctx, 3)
      sim.advance(fy, 0.2)
      sim.log(`${u.name} Skill: Smoke and Splendor + Fuyuan`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    // A2 Sylvan Smoke: Basic +10 energy
    sim.gainEnergy(u, 10)
    if (enemies.length) sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('lingsha', 'basic', lv.basic), elem: 'Fire', toughDmg: 10, label: 'Votive Incense' })
  },

  // Fuyuan's own turn → Follow-Up ATK (Talent). It shares Lingsha's buffs + stats through the
  // per-hit merge, so there is no crit/ATK snapshot to refresh.
  onSummonTurn(sim, fy, owner, ctx) {
    fuyuanAct(sim, fy, owner, ctx)
  },

  // A3 Ember's Echo: any ally takes DMG/HP loss AND any ally ≤60% HP → Fuyuan FUA once per 2 turns (no count consumed).
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    const lingsha = sim.allies('ally').find(u => u.kitId === 'lingsha' && !u.dead)
    if (!lingsha) return
    if (target.kind !== 'char' || target.dead) return
    const rt = sim.rt(lingsha)
    if ((rt.emberCd as number) > 0) { rt.emberCd = (rt.emberCd as number) - 1; return }
    const fy = fuyuanOf(sim, lingsha)
    if (!fy) return
    const inDanger = sim.allies('ally').some(a => a.kind === 'char' && !a.dead && a.hp / a.maxHp <= 0.6)
    if (inDanger) {
      fuyuanAct(sim, fy, lingsha, ctx)
      rt.emberCd = 2
      sim.log(`${lingsha.name} Ember's Echo → Fuyuan FUA`)
    }
  },
}

