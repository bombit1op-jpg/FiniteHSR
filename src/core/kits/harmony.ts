// Kits of the Harmony path, merged from the former per-character modules (12 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, type KitDef, type KitRuntime, type SimApi } from '../kit'
import type { Unit, AbilityLevels } from '../entities/Unit'
import { mult, PROG } from '../progression'
import { lowestHpEnemy } from './hunt'
import { eff } from '../combat/StatResolver'
import { mainDpsOf } from '../autoai'
import { computeBreakDamage } from '../combat/DamageCalculator'

// ===== bronya  (was bronya.ts) =====
export const bronyaKit: KitDef = {
  id: 'bronya',
  name: 'Bronya',
  elem: 'Wind',
  energyMax: 120,
  base: { ...PROG.bronya.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 110107 "Banner of Command": at battle start, all allies ATK +15% for 2 turns.
  technique: {
    name: 'Banner of Command',
    kind: 'buff',
    apply(sim, u) {
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'bronya_tech', name: 'Banner of Command ATK↑', mods: [{ stat: 'atkPct', value: 0.15 }], turns: 2 })
      }
    },
  },
  onStart(sim, u) {
    // A4 Battlefield: DEF+20% for all allies, 2 turns
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char') continue
      sim.addBuff(a, { id: 'bronya_a4', name: 'Battlefield', mods: [{ stat: 'defPct', value: 0.20 }], turns: 2 })
    }
    // A6 Military Might: all allies +10% DMG
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char') continue
      sim.addBuff(a, { id: 'bronya_a6', name: 'Military Might', mods: [{ stat: 'dmgAll', value: 0.10 }] })
    }
  },
  onTurnStart(_sim, u) {
    simRt(_sim, u).e4Used = false
  },
  decide(sim, u, ctx) {
    // strategy: useSkillWhenPossible
    if ((ctx.strategy as Record<string, boolean>)?.useSkillWhenPossible && sim.sp() >= 1) {
      const t = mainDps(sim, u, ctx)
      if (t) return { kind: 'skill' }
    }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) {
      const t = mainDps(sim, u, ctx)
      if (t) return { kind: 'skill' }
    }
    return decideByPattern(sim, u, ctx)
  },
  // E4 Take by Surprise: after ally Basic on Wind-weak enemy → FUA 80% Basic DMG (1/turn)
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.kitId === 'bronya' || attacker.dead || target.dead) return
    if (dmgType !== 'basic') return
    if (((ctx.eidolon as number) ?? 0) < 4) return
    const rt = sim.rt(ctx as unknown as Unit)
    if (rt.e4Used) return
    if (!target.weaknesses.includes('Wind')) return
    const bronya = sim.allies('ally').find(u => u.kitId === 'bronya' && !u.dead)
    if (!bronya) return
    const lv = levelsOf(ctx)
    rt.e4Used = true
    sim.gainEnergy(bronya, 5)
    sim.log('E4 Take by Surprise (energy +5)')
    sim.hit(bronya, target, { type: 'fua', mult: mult('bronya', 'basic', lv.basic) * 0.80, toughDmg: 10, label: 'Take by Surprise (FUA)' })
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('The Belobog March (energy +5)') // +5 from castUlt
      sim.markAlliedTarget('team')
      const ownCd = sim.effCritDmg(u)
      // ult attr1: ATK%; attr2/3: CRIT DMG = flat + fraction of Bronya's own CRIT DMG
      const cdBuff = ownCd * mult('bronya', 'ult_a2', lv.ult) + mult('bronya', 'ult_a3', lv.ult)
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char') continue
        sim.addBuff(a, {
          id: 'belobog_atk', name: `Belobog ATK+${Math.round(mult('bronya', 'ult', lv.ult) * 100)}%`,
          mods: [{ stat: 'atkPct', value: mult('bronya', 'ult', lv.ult) }], turns: 2,
        })
        sim.addBuff(a, {
          id: 'belobog_cd', name: `Belobog CD+${Math.round(cdBuff * 100)}%`,
          mods: [{ stat: 'critDmg', value: cdBuff }], turns: 2,
        })
      }
      sim.log(`${u.name} casts The Belobog March`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const f = mainDps(sim, u, ctx)
      if (!f) return
      const t = manualTarget(sim, action, f)
      sim.markAlliedTarget(t)
      // E6: DMG boost lasts 1 extra turn
      sim.addBuff(t, { id: 'bronya_dmg', name: 'Combat Redeployment', mods: [{ stat: 'dmgAll', value: mult('bronya', 'skill', lv.skill) }], turns: eid >= 6 ? 2 : 1 })
      // E1: 50% fixed chance to recover the SP (1-turn cooldown)
      if (eid >= 1) {
        const tc = sim.turnCount.get(u.id) ?? 0
        const last = (sim.rt(u).e1LastRefund as number) ?? -9
        if (tc - last >= 2 && sim.rng() < 0.5) {
          sim.gainSp(1)
          sim.rt(u).e1LastRefund = tc
          sim.log('E1 Hone Your Strength recovers 1 SP')
        }
      }
      if (t.id !== u.id) {
        sim.log(`${u.name} advances ${t.name} (immediate action)`)
        sim.immediateTurn(t)
        // E2: after acting, target SPD+30% for 1 turn
        if (eid >= 2 && !t.dead)
          sim.addBuff(t, { id: 'bronya_e2', name: 'Quick March', mods: [{ stat: 'spdPct', value: 0.30 }], turns: 1 })
      }
      return
    }

    // basic — trace Command: guaranteed crit on basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const e = lowestHpEnemy(sim, u)
    if (e) {
      sim.hit(u, e, { type: 'basic', mult: mult('bronya', 'basic', lv.basic), toughDmg: 10, forceCrit: true, label: 'Windrider Bullet' })
    }
    // talent Leading the Way: advance self
    sim.advance(u, mult('bronya', 'talent', lv.talent))
    sim.log('Bronya Talent: self-advance')
  },
}

function mainDps(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const forced = ctx.mainDpsId as string | undefined
  if (forced) {
    const f = sim.find(forced)
    if (f && f.kind === 'char' && f.id !== u.id) return f
  }
  let best: Unit | undefined
  let bestAtk = -1
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.id === u.id || a.dead) continue
    const atk = sim.effAtk(a)
    if (atk > bestAtk) { bestAtk = atk; best = a }
  }
  return best
}

function simRt(sim: SimApi, u: Unit) { return sim.rt(u) }

export { bronyaKit as kit }

// ===== sparkle  (was sparkle.ts) =====
export const sparkleKit: KitDef = {
  id: 'sparkle',
  name: 'Sparkle',
  elem: 'Quantum',
  energyMax: 110,
  base: { ...PROG.sparkle.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 1130607 "Unreliable Narrator": +3 Skill Points for the team and +20 Energy for Sparkle at battle start.
  technique: {
    name: 'Unreliable Narrator',
    kind: 'buff',
    apply(sim, u) {
      sim.gainSp(3)
      sim.gainEnergy(u, 20)
    },
  },
  decide(sim, u, ctx) {
    // strategy: prioritizeSkillOnHighSP
    if ((ctx.strategy as Record<string, boolean>)?.prioritizeSkillOnHighSP && sim.sp() >= 2) return { kind: 'skill' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    const pattern = (ctx.skillPattern as string) ?? 'auto'
    if (pattern === 'auto' && sim.sp() >= 2) return { kind: 'skill' }
    if (pattern === 'auto' && sim.sp() >= 1) return { kind: 'basic' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('The Hero with a Thousand Faces (energy +5)') // +5 from castUlt
      // #2: recover 6 SP (#2=6); E4 "Life Is a Gamble" → +1 more
      const spRec = eid >= 4 ? 7 : 6
      const maxSp = (sim as unknown as { maxSp: number }).maxSp
      const gained = Math.min(spRec, Math.max(0, maxSp - sim.sp()))
      sim.gainSp(gained)
      // overflow → Mask (recorded SP, up to #5=10), drained on each ally turn start
      const overflow = spRec - gained
      if (overflow > 0) ctx.mask = Math.min(10, ((ctx.mask as number) ?? 0) + overflow)
      // #4: Cipher lasts 3 turns
      const cipherTurns = 3
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        // E1: Cipher also grants ATK+40%
        if (eid >= 1)
          sim.addBuff(a, { id: 'cipher_atk', name: 'The Hero with a Thousand Faces', mods: [{ stat: 'atkPct', value: 0.40 }], turns: cipherTurns })
        // Cipher: each Figment stack's DMG boost additionally increases by #3[f2]% (#3=ult multiplier)
        sim.addBuff(a, {
          id: 'cipher_dmg', name: 'Purely Fictitious',
          mods: [{ stat: 'dmgAll', value: mult('sparkle', 'ult', lv.ult) }],
          turns: cipherTurns, maxStacks: 3,
        })
      }
      // E6: ally holding Skill CD boost spreads it to Cipher teammates
      if (eid >= 6) {
        const holder = sim.allies(u.side).find(a => a.kind === 'char' && !a.dead && sim.hasBuff(a, 'dreamdiver'))
        if (holder) {
          let cdBuff = eff(u).critDmg * mult('sparkle', 'skill', lv.skill) + mult('sparkle', 'skill_a2', lv.skill) + eff(u).critDmg * 0.30
          for (const a of sim.allies(u.side))
            if (a.kind === 'char' && !a.dead && a.id !== holder.id && sim.hasBuff(a, 'cipher_dmg'))
              sim.addBuff(a, { id: 'dreamdiver', name: `Dreamdiver CD+${Math.round(cdBuff * 100)}%`, mods: [{ stat: 'critDmg', value: cdBuff }, { stat: 'resPenAll', value: 0.10 }], turns: 2 })
        }
      }
      sim.log('The Hero with a Thousand Faces: +SP, Cipher on allies')
      return
    }
    if (!enemies.length) return

    if (action.kind === 'skill' && sim.spendSp(1)) {
      // A4 Artificial Flower: 3+ ally SP spent since last skill → this Skill costs nothing
      if (ctx.a4Free) sim.gainSp(1)
      ctx.a4Free = false
      sim.gainEnergy(u, 30)
      const chars = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead)
      const target = manualTarget(sim, action, mainDpsOf(sim, ctx) ?? chars.reduce((m, a) => (a.base.atk > m.base.atk ? a : m), chars[0] ?? u))
      // Dreamdiver: #1[f1]% of Sparkle's CD + #2[f1]%, lasting #3[i] turns, advance #4[i]%
      let cdBuff = eff(u).critDmg * mult('sparkle', 'skill', lv.skill) + mult('sparkle', 'skill_a2', lv.skill)
      if (eid >= 6) cdBuff += eff(u).critDmg * 0.30
      const applyCd = (t: typeof target): void => {
        // A6 Nocturne: allies holding the Skill's CD boost gain +10% All-Type RES PEN
        sim.addBuff(t, { id: 'dreamdiver', name: `Dreamdiver CD+${Math.round(cdBuff * 100)}%`, mods: [{ stat: 'critDmg', value: cdBuff }, { stat: 'resPenAll', value: 0.10 }], turns: 2 })
      }
      applyCd(target)
      if (target.id !== u.id) {
        sim.advance(target, 0.50)
        sim.log(`Dreamdiver advances ${target.name} by 50%`)
      }
      // E6: CD boost spreads to all allies with Cipher
      if (eid >= 6) {
        for (const a of chars) if (a.id !== target.id && sim.hasBuff(a, 'cipher_dmg')) applyCd(a)
      }
      // E1 Suspension of Disbelief: SPD+15% for 2 turns after skill
      if (eid >= 1) sim.addBuff(u, { id: 'sod_spd', name: 'Suspension of Disbelief', mods: [{ stat: 'spdPct', value: 0.15 }], turns: 2 })
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    // A2 Almanac: Basic ATK additionally regenerates 10 Energy
    sim.gainEnergy(u, 10)
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('sparkle', 'basic', lv.basic), toughDmg: 10, label: 'Monodrama' })
  },
  // Ultimate Mask: consume recorded overflow to refill SP until max at each ally turn start
  onAllyTurnStart(sim, ally, _ctx) {
    if (ally.side !== 'ally' || ally.kind !== 'char' || ally.dead) return
    const sparkle = sim.allies('ally').find(x => x.kitId === 'sparkle' && !x.dead)
    if (!sparkle) return
    const ctx = sim.rt(sparkle)
    const mask = (ctx.mask as number) ?? 0
    if (mask <= 0) return
    const maxSp = (sim as unknown as { maxSp: number }).maxSp
    const need = Math.max(0, maxSp - sim.sp())
    if (need <= 0) return
    const take = Math.min(mask, need)
    ctx.mask = mask - take
    sim.gainSp(take)
    sim.log(`Sparkle Mask: +${take} SP (${ctx.mask} left)`)
  },
  onStart(sim, u, ctx) {
    // Talent Red Herring: max SP +2 (#3[i]=2); E4: +1 more (on-field only)
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 5) {
      const bonus = ((ctx.eidolon as number) ?? 0) >= 4 ? 3 : 2
      s.maxSp += bonus
      ctx.sparkleSp = bonus
    }
    void u
    // E1 Suspension of Disbelief: SPD+15% at battle start
    if (((ctx.eidolon as number) ?? 0) >= 1)
      sim.addBuff(u, { id: 'sod_spd', name: 'Suspension of Disbelief', mods: [{ stat: 'spdPct', value: 0.15 }], turns: 2 })
    // A6 Nocturne: +45% ATK for all allies
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char') continue
      sim.addBuff(a, { id: 'sparkle_a6', name: 'Nocturne', mods: [{ stat: 'atkPct', value: 0.45 }] })
    }
    sim.log('Red Herring: max Skill Points raised')
  },

  onUnitDeath(sim, _u, ctx) {
    const bonus = (ctx.sparkleSp as number) ?? 0
    if (bonus <= 0) return
    ctx.sparkleSp = 0
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 5 + bonus) s.maxSp -= bonus
    sim.log(`Red Herring: max Skill Points -${bonus} (Sparkle down)`)
  },
}

/** Talent Red Herring hook — called by Simulator.spendSp. Each SP spend grants "Figment" stacks. */
export function redHerringOnSpSpend(sim: SimApi): void {
  const sparkle = sim.allies('ally').find(x => x.kitId === 'sparkle')
  if (!sparkle || sparkle.dead) return
  const ctx = sim.rt(sparkle)
  const eid = (ctx.eidolon as number) ?? 0
  // A4 Artificial Flower: 3+ SP consumed in a single turn → next Skill is free
  if (!ctx.a4Free && (sim as unknown as { res: { spThisTurn: number } }).res.spThisTurn >= 3) {
    ctx.a4Free = true
    sim.log('A4 Artificial Flower: next Sparkle Skill is free')
  }
  // A2 Almanac: an ally holding the CD boost consuming SP → Sparkle +1 Energy
  if (sim.allies('ally').some(a => a.kind === 'char' && !a.dead && sim.hasBuff(a, 'dreamdiver')))
    sim.gainEnergy(sparkle, 1)
  for (const a of sim.allies(sparkle.side)) {
    if (a.kind !== 'char' || a.dead) continue
    // Figment: each stack increases DMG taken by all enemies by #2[f1]%, lasts #1[i] turns, max #4[i] stacks
    sim.addBuff(a, {
      id: 'figment', name: 'Figment',
      mods: [{ stat: 'dmgAll', value: mult('sparkle', 'talent', ((ctx.levels as AbilityLevels)?.talent ?? 10)) }],
      turns: 2, maxStacks: 3,
    })
    // Cipher amplifies every Figment stack while active
    if (sim.hasBuff(a, 'cipher_dmg'))
      sim.addBuff(a, {
        id: 'cipher_dmg', name: 'Purely Fictitious',
        mods: [{ stat: 'dmgAll', value: mult('sparkle', 'ult', ((ctx.levels as AbilityLevels)?.ult ?? 10)) }],
        turns: 3, maxStacks: 3,
      })
  }
  // E2 Purely Fictitious: each Figment stack ignores 10% of target's DEF
  if (eid >= 2)
    for (const e of sim.livingEnemiesOf(sparkle))
      sim.addBuff(e, { id: 'sparkle_e2', name: 'Purely Fictitious', mods: [{ stat: 'defRed', value: 0.10 }], turns: 2, maxStacks: 3 })
}


// ===== yukong  (was yukong.ts) =====
function findYukong(sim: SimApi, u: Unit): Unit | undefined {
  return sim.allies(u.side).find(a => a.kitId === 'yukong' && !a.dead)
}

function roaringPool(sim: SimApi, u: Unit): number {
  const yk = findYukong(sim, u)
  return yk ? ((sim.rt(yk).roaring as number) ?? 0) : 0
}

export const yukongKit: KitDef = {
  id: 'yukong',
  name: 'Yukong',
  elem: 'Imaginary',
  energyMax: 130,
  base: { ...PROG.yukong.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 120707 "Windchaser": gains 2 stacks of Roaring Bowstrings on entering combat by attacking. buff Technique.
  technique: {
    name: 'Windchaser',
    kind: 'buff',
    apply(sim, u, ctx) { grantRoaring(sim, u, ctx, levelsOf(ctx), 2) },
  },
  onStart(sim, u, ctx) {
    // A4: allies +12% Imaginary DMG while Yukong is on the field
    for (const a of sim.allies('ally')) {
      if (a.kind === 'char') sim.addBuff(a, { id: 'yukong_dmg', name: 'Emboldening Salvo', mods: [{ stat: 'dmg:Imaginary', value: 0.12 }] })
    }
    // E1: allies SPD+10% for 2 turns
    if (((ctx.eidolon as number) ?? 0) >= 1) {
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char') sim.addBuff(a, { id: 'yukong_e1', name: 'Aerial Marshal', mods: [{ stat: 'spdPct', value: 0.10 }], turns: 2 })
      }
    }
  },
  onTurnStart(sim, u, ctx) {
    // Talent "Seven Layers, One Arrow" cooldown (1 turn between triggers)
    const cd = ((ctx.talentCd as number) ?? 0)
    if (cd > 0) ctx.talentCd = cd - 1
    // E4: while Roaring Bowstrings active, Yukong DMG+30%
    if (((ctx.eidolon as number) ?? 0) >= 4) {
      if (roaringPool(sim, u) > 0) sim.addBuff(u, { id: 'yukong_e4', name: 'Zephyrean Echoes', mods: [{ stat: 'dmgAll', value: 0.30 }], turns: 1 })
      else sim.removeBuff(u, 'yukong_e4')
    }
  },
  // Roaring pool: consumed at the END of each ally's turn (no onAllyTurnEnd hook —
  // emulate: decrement at next ally's START; sentinel -1 removes before the THIRD action)
  // → exactly 2 ally actions keep the buff, matching the real "2 stacks" span
  onAllyTurnStart(sim, _ally, ctx) {
    if (ctx.roaring === -1) {
      const yk = findYukong(sim, _ally)
      if (yk) removeRoaring(sim, yk, ctx)
      else ctx.roaring = 0
      return
    }
    const pool = (ctx.roaring as number) ?? 0
    if (pool <= 0) return
    const yk = findYukong(sim, _ally)
    if (!yk) return
    // A6: +2 Energy per ally action while Roaring is active
    sim.gainEnergy(yk, 2)
    sim.log('Yukong A6: +2 Energy')
    if (pool === 1) ctx.roaring = -1
    else ctx.roaring = pool - 1
    sim.log(`Roaring Bowstrings: 1 stack consumed (${ctx.roaring} actions left)`)
  },
  onAllyUlt(sim, ally, ctx) {
    // E2: ally casting an Ultimate (energy at limit) → Yukong +5 energy (once per ally, reset on ult)
    if (ally.dead || ally.kind !== 'char') return
    if (((ctx.eidolon as number) ?? 0) < 2) return
    const yk = findYukong(sim, ally)
    if (!yk) return
    const done = (ctx.e2Done as string[]) ?? []
    if (done.includes(ally.id)) return
    done.push(ally.id)
    ctx.e2Done = done
    sim.gainEnergy(yk, 5)
    sim.log(`Yukong E2: +5 Energy (${ally.name} at full energy)`)
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      ctx.e2Done = []
      sim.log('Diving Kestrel (energy +5) // +5 from castUlt')
      // If Roaring active: all allies CRIT Rate & CRIT DMG boost (1 turn)
      if (roaringPool(sim, u) > 0) {
        for (const a of sim.allies('ally')) {
          if (a.kind !== 'char') continue
          sim.addBuff(a, { id: 'yukong_ult_cr', name: 'Diving Kestrel', mods: [{ stat: 'critRate', value: mult('yukong', 'ult_a2', lv.ult) }], turns: 1 })
          sim.addBuff(a, { id: 'yukong_ult_cd', name: 'Diving Kestrel', mods: [{ stat: 'critDmg', value: mult('yukong', 'ult_a3', lv.ult) }], turns: 1 })
        }
      }
      if (!enemies.length) return
      sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'ult', mult: mult('yukong', 'ult', lv.ult), toughDmg: 20, label: 'Diving Kestrel' })
      // E6: instantly gains 1 stack of Roaring Bowstrings (cap 2, canon "gains 1 stack")
      if (eid >= 6) {
        const cur = Math.min(2, (ctx.roaring as number) ?? 0)
        if (cur < 2) grantRoaring(sim, u, ctx, lv, cur + 1)
        sim.log('Yukong E6: Roaring Bowstrings +1 stack (ult)')
      }
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      grantRoaring(sim, u, ctx, lv)
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    if (!enemies.length) return
    const t = enemies[0]
    sim.hit(u, t, { type: 'basic', mult: mult('yukong', 'basic', lv.basic), toughDmg: 10, label: 'Arrowslinger', split: [0.2, 0.2, 0.6] })
    // Talent: extra Imaginary hit on Basic ATK (2-turn cadence: fire, skip, fire)
    if (((ctx.talentCd as number) ?? 0) === 0) {
      ctx.talentCd = 2
      sim.hit(u, t, { type: 'basic', mult: mult('yukong', 'talent', lv.talent), toughDmg: 10, label: 'Seven Layers, One Arrow' })
    }
  },
}

function grantRoaring(sim: SimApi, u: Unit, ctx: KitRuntime, lv: AbilityLevels, stacks = 2): void {
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    const ex = a.buffs.find(b => b.id === 'roaring_bow')
    if (ex) ex.stacks = stacks
    else sim.addBuff(a, { id: 'roaring_bow', name: 'Emboldening Salvo', mods: [{ stat: 'atkPct', value: mult('yukong', 'skill', lv.skill) }], turns: 100, stacks, maxStacks: 2 })
  }
  ctx.roaring = stacks
  sim.log(`Yukong Skill: Roaring Bowstrings x${stacks} (ATK+m%) for all allies`)
}

function removeRoaring(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  for (const a of sim.allies('ally')) sim.removeBuff(a, 'roaring_bow')
  ctx.roaring = 0
  sim.log('Roaring Bowstrings expired')
}

// ===== asta  (was asta.ts) =====
// Charging: 1 stack per DIFFERENT enemy hit this action, +1 if that enemy has Fire weakness. Cap 5.
function gatherCharging(sim: SimApi, u: Unit, ctx: Record<string, unknown>, hitIds: Set<string>, fireCount: number): number {
  const eid = (ctx.eidolon as number) ?? 0
  const lost = (eid >= 6 ? 2 : 3)
  const lv = levelsOf(ctx)
  // turn-end reduction skipped if E2 was consumed (or it's the first turn)
  let stacks = (ctx.charging as number) ?? 0
  if ((ctx.firstTurn as boolean)) {
    ctx.firstTurn = false
  } else if (ctx.skipReduce) {
    ctx.skipReduce = false
  } else {
    stacks = Math.max(0, stacks - lost)
  }
  // this action: +1 distinct enemy + fire-weak extras
  stacks = Math.min(5, stacks + hitIds.size + fireCount)
  ctx.charging = stacks
  // E4: ERR +15% while ≥2 stacks (refresh with stack change)
  refreshErr(sim, u, ctx, stacks)
  // Constellation trace: Asta DEF +6% per Charging stack
  sim.removeBuff(u, 'asta_const_def')
  if (stacks > 0)
    sim.addBuff(u, { id: 'asta_const_def', name: 'Constellation', mods: [{ stat: 'defPct', value: 0.06 * stacks }], turns: Infinity })
  // Talent: every stack → all allies ATK up
  const talent = mult('asta', 'talent', lv.talent) * stacks
  const buffTurns = 3
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    if (stacks > 0)
      sim.addBuff(a, { id: 'asta_talent', name: 'Astrometry', mods: [{ stat: 'atkPct', value: talent }], turns: buffTurns })
    else sim.removeBuff(a, 'asta_talent')
  }
  sim.log(`Asta Charging: ${stacks} stacks (team ATK +${Math.round(talent * 100)}%)`)
  return stacks
}

function refreshAtkBuff(sim: SimApi, u: Unit, ctx: Record<string, unknown>): void {
  const stacks = (ctx.charging as number) ?? 0
  refreshErr(sim, u, ctx, stacks)
  const lv = levelsOf(ctx)
  const talent = mult('asta', 'talent', lv.talent) * stacks
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    if (stacks > 0) sim.addBuff(a, { id: 'asta_talent', name: 'Astrometry', mods: [{ stat: 'atkPct', value: talent }], turns: 3 })
    else sim.removeBuff(a, 'asta_talent')
  }
}

// E4 Aurora Basks in Beauty and Bliss: ERR +15% while ≥2 Charging stacks
function refreshErr(sim: SimApi, u: Unit, ctx: Record<string, unknown>, stacks: number): void {
  if (((ctx.eidolon as number) ?? 0) < 4) return
  if (stacks >= 2) sim.addBuff(u, { id: 'asta_e4', name: 'Aurora ERR+', mods: [{ stat: 'err', value: 0.15 }], turns: Infinity })
  else sim.removeBuff(u, 'asta_e4')
}

export const astaKit: KitDef = {
  id: 'asta',
  name: 'Asta',
  elem: 'Fire',
  energyMax: 120,
  base: { ...PROG.asta.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 100907 "Miracle Flash": 50% ATK Fire DMG to all enemies. attack Technique.
  technique: {
    name: 'Miracle Flash',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Fire', mult: 0.5, label: 'Miracle Flash' })
    },
  },
  onStart(sim, u, ctx) {
    ctx.charging = 0
    ctx.firstTurn = true
    ctx.skipReduce = false
    // Sky-scorched Trace (Ignite): all allies Fire DMG +18% while Asta on field
    for (const a of sim.allies('ally'))
      if (a.kind === 'char')
        sim.addBuff(a, { id: 'asta_ignite', name: 'Ignite', mods: [{ stat: 'dmg:Fire', value: 0.18 }], turns: Infinity })
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('Astral Blessing (energy +5)') // +5 from castUlt
      const spd = mult('asta', 'ult', lv.ult)
      for (const a of sim.allies('ally'))
        if (a.kind === 'char')
          sim.addBuff(a, { id: 'asta_ult', name: `Astral Blessing SPD+${spd}`, mods: [{ stat: 'spdFlat', value: spd }], turns: 2 })
      // E2: Charging not reduced next turn
      if (eid >= 2) ctx.skipReduce = true
      // ultimate doesn't clear/increment charging by the enemy-hit rule; keep at current
      sim.log(`Asta Ult: all allies SPD+${spd} (2t)`)
      // re-assert talent buff
      refreshAtkBuff(sim, u, ctx)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const nHits = 1 + 4 + (eid >= 1 ? 1 : 0)
      const hitIds = new Set<string>()
      let fireCount = 0
      sim.markAlliedTarget('team')
      // first hit on designated (highest-hp) enemy for more targeted toughness
      const primary = manualTarget(sim, action, enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0]))
      for (let i = 0; i < nHits; i++) {
        const pool = sim.livingEnemiesOf(u)
        if (!pool.length) break
        const t = i === 0 ? (pool.find(p => p.id === primary.id) ?? pool[0]) : sim.rngPick(pool)
        sim.hit(u, t, { type: 'skill', mult: mult('asta', 'skill', lv.skill), toughDmg: i === 0 ? 20 : 6, label: 'Meteor Storm' })
        if (!t.dead) {
          hitIds.add(t.id)
          if (t.weaknesses.includes('Fire')) fireCount++
        }
      }
      gatherCharging(sim, u, ctx, hitIds, fireCount)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    const dealt = sim.hit(u, t, { type: 'basic', mult: mult('asta', 'basic', lv.basic), toughDmg: 10, label: 'Spectrum Beam' })
    const hitIds = new Set<string>()
    if (!t.dead) hitIds.add(t.id)
    const fireCount = !t.dead && t.weaknesses.includes('Fire') ? 1 : 0
    gatherCharging(sim, u, ctx, hitIds, fireCount)
    // Sparks Trace: 80% base chance to Burn for 3 turns
    if (!t.dead) applyBurn(sim, u, t, dealt)
  },
}

function applyBurn(sim: SimApi, asta: Unit, target: Unit, basicDmg: number): void {
  if (target.dead) return
  sim.applyDebuff(asta, target, 0.80, () => {
    const baseDmg = Math.floor(basicDmg * 0.5)
    const ex = target.dots.find(d => d.kind === 'Burn')
    if (ex) { ex.baseDmg = Math.max(ex.baseDmg ?? 0, baseDmg); ex.turns = Math.max(ex.turns, 3); (ex as { sourceUnit?: Unit }).sourceUnit = asta }
    else sim.applyDot(target, { kind: 'Burn', elem: 'Fire', turns: 3, baseDmg, sourceUnit: asta } as never)
  }, 'Burn', 'Burn')
}


// ===== tingyun  (was tingyun.ts) =====
function findTingyun(sim: SimApi, side: 'ally' | 'enemy'): Unit | undefined {
  return sim.allies(side).find(a => a.kitId === 'tingyun' && !a.dead)
}

/** the single ally currently carrying Benediction */
function beneHolder(sim: SimApi, side: 'ally' | 'enemy'): Unit | undefined {
  return sim.allies(side).find(a => a.kind === 'char' && !a.dead && sim.hasBuff(a, 'benediction'))
}

/** best non-Tingyun ally by effective ATK (auto-Skill target) */
function bestAlly(sim: SimApi, u: Unit): Unit | undefined {
  let best: Unit | undefined
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead || a === u) continue
    if (!best || sim.effAtk(a) > sim.effAtk(best)) best = a
  }
  return best
}

/** clear Benediction everywhere, then place it on `target` */
function placeBenediction(sim: SimApi, target: Unit, ctx: KitRuntime): void {
  for (const a of sim.allies('ally'))
    if (a.kind === 'char' && a !== target) sim.removeBuff(a, 'benediction')
  const lv = levelsOf(ctx)
  const ting = findTingyun(sim, 'ally')
  const atkPct = mult('tingyun', 'skill_a2', lv.skill)
  const cap = ting ? mult('tingyun', 'skill_a3', lv.skill) * sim.effAtk(ting) : 0
  const flat = Math.min(target.base.atk * atkPct, cap)
  sim.addBuff(target, {
    id: 'benediction', name: 'Soothing Melody',
    mods: [{ stat: 'atkFlat', value: Math.floor(flat) }],
    turns: 3,
  })
  sim.log(`Tingyun Skill → ${target.name}: Benediction ATK+${Math.round(flat)} (cap ${Math.round(cap)})`)
}

export const tingyunKit: KitDef = {
  id: 'tingyun',
  name: 'Tingyun',
  elem: 'Lightning',
  energyMax: 130,
  base: { level: 80, hp: 846, atk: 529, def: 396, spd: 112, critRate: 0.05, critDmg: 0.5 },
  // 120207 "Gentle Breeze": +50 Energy at battle start. §84.6.1 repeat-use: may be activated
  // up to two times pre-fight (zero/one/two uses), each activation +50 Energy (capped).
  technique: {
    name: 'Gentle Breeze',
    kind: 'buff',
    maxUses: 2,
    apply(sim, u) {
      sim.gainEnergy(u, 50)
    },
  },
  onTurnStart(sim, u, ctx) {
    // A6 Jubilant Passage: +5 Energy at the start of her turn
    sim.gainEnergy(u, 5)
    sim.log('Tingyun A6: +5 Energy (Jubilant Passage)')
    ctx.e2Used = false
  },
  decide(sim, u, _ctx) {
    // keep the carry buffed; basic only when SP is drained
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
      let target = beneHolder(sim, 'ally')
      if (!target) target = bestAlly(sim, u)
      if (target) {
        sim.markAlliedTarget(target)
        // regen 50 Energy (+10 at E6), DMG+ for 2 turns, E1 SPD+20% for 1 turn
        sim.gainEnergy(target, eid >= 6 ? 60 : 50)
        sim.addBuff(target, {
          id: 'tingyun_ult', name: 'Violet Sparknado',
          mods: [{ stat: 'dmgAll', value: mult('tingyun', 'ult', lv.ult) }], turns: 2,
        })
        if (eid >= 1) sim.addBuff(target, { id: 'tingyun_e1', name: 'Windfall of Lucky Springs', mods: [{ stat: 'spdPct', value: 0.20 }], turns: 1 })
        sim.log(`Tingyun Ult → ${target.name}: +${eid >= 6 ? 60 : 50} Energy, DMG+${Math.round(mult('tingyun', 'ult', lv.ult) * 100)}% (2 turns)`)
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // A2 Nourished Joviality: SPD+20% for 1 turn
      sim.addBuff(u, { id: 'tingyun_a2', name: 'Nourished Joviality', mods: [{ stat: 'spdPct', value: 0.20 }], turns: 1 })
      const target = manualTarget(sim, action, bestAlly(sim, u) ?? u)
      sim.markAlliedTarget(target)
      placeBenediction(sim, target, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    if (!enemies.length) return
    // A4 Knell Subdual: Basic ATK DMG +40%
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('tingyun', 'basic', lv.basic) * 1.4, toughDmg: 10, label: 'Dislodged (A4 +40%)', split: [0.3, 0.7] })
  },

  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (dmgType === 'add' || target.dead || target.side !== 'enemy') return
    const ting = findTingyun(sim, 'ally')
    if (!ting || !ting.kitId) return
    const ben = beneHolder(sim, 'ally')
    if (!ben) return
    const lv = levelsOf(ctx)

    if (attacker === ting) {
      // Talent Violet Sparknado: Tingyun hits an enemy → Benediction ally adds Lightning DMG
      sim.hit(ben, target, { type: 'add', noSeq: true, elem: 'Lightning', mult: mult('tingyun', 'talent', lv.talent), label: 'Violet Sparknado' })
    } else if (attacker === ben) {
      // Skill: the Benediction ally attacking deals Lightning Additional DMG (1 time per attack)
      const multv = mult('tingyun', 'skill', lv.skill) * (((ctx.eidolon as number) ?? 0) >= 4 ? 1.2 : 1)
      sim.hit(ben, target, { type: 'add', noSeq: true, elem: 'Lightning', mult: multv, label: 'Soothing Melody' })
    }
  },

  onAllyKill(sim, killer, _victim, _ctx) {
    // E2 Gainfully Gives: Benediction ally regens 5 Energy after defeating an enemy, once per turn
    const ben = beneHolder(sim, 'ally')
    if (!ben || ben !== killer) return
    const ting = findTingyun(sim, 'ally')
    if (!ting) return
    const tctx = sim.rt(ting)
    if (((tctx.eidolon as number) ?? 0) < 2) return
    if ((tctx.e2Used as boolean) ?? false) return
    tctx.e2Used = true
    sim.gainEnergy(ben, 5)
    sim.log('Tingyun E2: +5 Energy to Benediction ally (kill)')
  },
}

// ===== tribbie  (was tribbie.ts) =====
function lowestHp(sim: SimApi, u: Unit): Unit | undefined {
  const l = sim.livingEnemiesOf(u)
  if (!l.length) return undefined
  return l.reduce((m, e) => (e.hp < m.hp ? e : m), l[0])
}

/** Apply/refresh the Zone's enemy DMG-taken vuln to all enemies. */
function applyZoneVuln(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const v = mult('tribbie', 'ult_a2', lv.ult)
  for (const e of sim.livingEnemiesOf(u)) {
    sim.removeBuff(e, 'tri_zone_vuln')
    sim.addBuff(e, { id: 'tri_zone_vuln', name: 'Guess Who Lives Here DMG Taken+', mods: [{ stat: 'vulnAll', value: v }], turns: Infinity } as never)
  }
  sim.log(`${u.name} Zone: enemies take +${(v * 100).toFixed(0)}% DMG`)
}

function clearZoneVuln(sim: SimApi, u: Unit): void {
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'tri_zone_vuln')
}

/** Numinosity: all allies All-Type RES PEN (+E4 → also DEF ignore 18%). */
function applyNuminosity(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const pen = mult('tribbie', 'skill', lv.skill)
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char') continue
    sim.removeBuff(a, 'tri_respen')
    sim.addBuff(a, { id: 'tri_respen', name: 'Numinosity RES PEN', mods: [{ stat: 'resPenAll', value: pen }], turns: Infinity } as never)
    if (eid >= 4) {
      sim.removeBuff(a, 'tri_e4')
      sim.addBuff(a, { id: 'tri_e4', name: 'Peace of Empathy Bond', mods: [{ stat: 'defIgnore', value: 0.18 }], turns: Infinity } as never)
    }
  }
  sim.log(`${u.name} Numinosity: allies RES PEN +${(pen * 100).toFixed(0)}%${eid >= 4 ? ', DEF ignore 18%' : ''}`)
}

function clearNuminosity(sim: SimApi, u: Unit): void {
  for (const a of sim.allies('ally')) {
    sim.removeBuff(a, 'tri_respen')
    sim.removeBuff(a, 'tri_e4')
  }
}

/** Talent FUA: Quantum AoE = #1% MaxHP. A0: after FUA, self DMG+72% (3 stacks). */
function talentFua(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const e6mult = eid >= 6 ? 1 + 7.29 : 1
  sim.hitAoe(u, { type: 'fua', elem: 'Quantum', mult: mult('tribbie', 'talent', lv.talent) * e6mult, scaleStat: 'hp', toughDmg: 10, label: 'Busy as Tribbie' })
  // A0: +72% DMG, stacks 3, 3 turns
  sim.addBuff(u, { id: 'tri_a0', name: 'Lamb Outside the Wall...', mods: [{ stat: 'dmgAll', value: 0.72 }], turns: 3, maxStacks: 3 } as never)
}

export const tribbieKit: KitDef = {
  id: 'tribbie',
  name: 'Tribbie',
  elem: 'Quantum',
  energyMax: 120,
  base: { ...PROG.tribbie.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Harmony' },
  // 140307 "If You're Happy and You Know It": at battle start gain Numinosity (allies' RES PEN),
  // as the Skill grants it. buff Technique.
  technique: {
    name: "If You're Happy and You Know It",
    kind: 'buff',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      sim.rt(u).numinosity = mult('tribbie', 'skill_a2', lv.skill)
      applyNuminosity(sim, u, ctx)
    },
  },
  onStart(sim, u, _ctx) {
    // A6: battle start +30 Energy
    sim.gainEnergy(u, 30)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.hitAoe(u, { type: 'ult', elem: 'Quantum', mult: mult('tribbie', 'ult', lv.ult), scaleStat: 'hp', toughDmg: 15, label: 'Guess Who Lives Here' })
      rt.zone = mult('tribbie', 'ult_turns', lv.ult)
      applyZoneVuln(sim, u, ctx)
      // A2: while Zone, Tribbie MaxHP +9% of sum of all allies' MaxHP
      const sum = sim.allies('ally').filter(a => a.kind === 'char').reduce((s, a) => s + a.maxHp, 0)
      sim.removeBuff(u, 'tri_a2')
      sim.addBuff(u, { id: 'tri_a2', name: 'Lamb Outside the Wall...', mods: [{ stat: 'hpFlat', value: sum * 0.09 }], turns: Infinity } as never)
      if (eid >= 6) talentFua(sim, u, ctx)
      sim.log(`${u.name} Ultimate: Zone (${rt.zone} turns)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      rt.numinosity = mult('tribbie', 'skill_a2', lv.skill)
      applyNuminosity(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = lowestHp(sim, u)!
    sim.hitBlast(u, t,
      { type: 'basic', elem: 'Quantum', mult: mult('tribbie', 'basic', lv.basic), scaleStat: 'hp', toughDmg: 10, label: 'Hundred Rockets' },
      { type: 'basic', elem: 'Quantum', mult: mult('tribbie', 'basic_en', lv.basic), scaleStat: 'hp', toughDmg: 5, label: 'Hundred Rockets (adj)' })
  },

  // Talent: after OTHER ally ultimates → FUA. (onAllyUlt fires for all non-caster kits.)
  onAllyUlt(sim, ally, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'tribbie' && !a.dead)
    if (!u || ally === u) return
    talentFua(sim, u, ctx)
    sim.log(`${u.name} Talent: FUA on ${ally.name}'s Ult`)
  },

  // Zone: 1 instance of Additional DMG per DISTINCT target hit per ATTACK (canon 140303:
  // "After an ally target attacks, for every 1 target hit, deals 1 instance of Quantum
  // Additional DMG ... to the target that has the highest HP among the hit targets").
  // `onAfterAttack` is per HIT (simulator.ts:432), so both the per-attack grouping and the
  // per-target dedup live here. The old code fired per hit AND multiplied by the number of
  // LIVING enemies, so one single-target hit in a 5-enemy fight dealt 5 instances instead of 1
  // (and a multi-hit attack dealt hits×enemies): Tribbie took 82% of team damage in the sweep.
  // Attack identity is tracked LOCALLY: the sim's global `attackNo()`/`attackAct()` are
  // overwritten by nested hits (Sushang's A2 additional, Moze's FUA, ...) and reset mid-attack.
  // A new attacker or a new turn of that attacker (onAllyTurnStart) starts a new attack.
  // canon picks the single highest-HP target among ALL hit targets once the attack
  // resolves; we pick the highest among the targets hit SO FAR — the instance COUNT matches,
  // only the landing target differs when the max-HP target is hit last.
  onAfterAttack(sim, attacker, target, dmgType, ctx, dmg) {
    const u = sim.allies('ally').find(a => a.kitId === 'tribbie' && !a.dead)
    if (!u) return
    if (attacker.side !== 'ally' || attacker.kind === 'summon') return
    const rt = sim.rt(u)
    const inZone = (rt.zone as number) > 0
    const eid = (ctx.eidolon as number) ?? 0
    const carriesNuminosity = !!attacker.buffs?.some(b => b.id === 'tri_respen')
    const trueDmg = (t: Unit, d: number): void => {
      if (eid >= 1 && inZone && d > 0 && t.side === 'enemy' && !t.dead && carriesNuminosity)
        sim.trueDamage(attacker, t, d * 0.24)
    }

    // Tribbie's OWN zone additional: canon E1 converts it (it IS "a target that has been dealt
    // Additional DMG by the Zone"), and it must not re-trigger the Zone.
    if (dmgType === 'add' && attacker === u) { if (dmg) trueDmg(target!, dmg); return }
    if (dmgType === 'add') return // external Additional DMG (Robin/MoZe/Cipher) — not an attack

    if (rt.zoneBy !== attacker.id) { rt.zoneBy = attacker.id; rt.zoneTgt = []; rt.zoneAddTgt = '' }
    const hitIds = (rt.zoneTgt as string[]) ?? []
    if (target && target.side === 'enemy' && !target.dead && !hitIds.includes(target.id)) {
      hitIds.push(target.id)
      rt.zoneTgt = hitIds
      sim.gainEnergy(u, 1.5) // A6: 1.5 Energy per target hit, once per attack
      if (inZone) {
        const lv = levelsOf(ctx)
        const instances = eid >= 2 ? 2 : 1 // E2: "further deals 1 instance"
        const multE2 = eid >= 2 ? 1.2 : 1 // E2: "increases to 120% of the original DMG"
        const living = sim.livingEnemiesOf(u)
        const best = hitIds.reduce((m, id) => {
          const e = living.find(x => x.id === id)
          return e && e.hp > m.hp ? e : m
        }, target)
        rt.zoneAddTgt = best.id
        for (let i = 0; i < instances; i++)
          // noSeq: the Zone additional is part of the ALLY's attack (canon "after an ally target
          // attacks"), not a new activation — it must not mint a new attackNo() for the outer one.
          sim.hit(u, best, { type: 'add', elem: 'Quantum', mult: mult('tribbie', 'ult_a3', lv.ult) * multE2, scaleStat: 'hp', noSeq: true, label: 'Zone Additional DMG' })
        sim.log(`${u.name} Zone: +${instances}× Additional DMG vs ${best.name} (${eid >= 2 ? 'E2×1.2' : '1'}) — ${attacker.name} hit ${hitIds.length} target${hitIds.length > 1 ? 's' : ''}`)
      }
    }
    // E1 (while Zone lasts): True DMG = 24% of the hit, only to targets the Zone hit.
    if (dmg && (rt.zoneAddTgt as string) === target?.id) trueDmg(target!, dmg)
  },

  // A new turn of an ally = a new attack: drop the per-attack target set (extra turns too).
  onAllyTurnStart(sim, ally, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'tribbie' && !a.dead)
    if (!u || (sim.rt(u).zoneBy as string) !== ally.id) return
    const rt = sim.rt(u)
    rt.zoneTgt = []
    rt.zoneAddTgt = ''
    rt.zoneBy = ''
  },

  // Zone & Numinosity countdown on Tribbie's own turn start.
  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u)
    // A new turn of the zone setter is a new attack — drop the per-attack target set. onAllyTurnStart
    // covers OTHER allies only (EventBus skips self), so her own turn must clear it here or her hits
    // keep deduping against the Ult's targets and never route through the Zone.
    if (rt.zoneBy === u.id) { rt.zoneTgt = []; rt.zoneAddTgt = ''; rt.zoneBy = '' }
    if ((rt.zone as number) > 0) {
      rt.zone = (rt.zone as number) - 1
      if ((rt.zone as number) <= 0) { clearZoneVuln(sim, u); sim.removeBuff(u, 'tri_a2'); sim.log(`${u.name} Zone ended`) }
    }
    if ((rt.numinosity as number) > 0) {
      rt.numinosity = (rt.numinosity as number) - 1
      if ((rt.numinosity as number) <= 0) { clearNuminosity(sim, u); sim.log(`${u.name} Numinosity ended`) }
    }
  },
}


// ===== sunday  (was sunday.ts) =====
function hasOwnSummon(sim: SimApi, t: Unit): boolean {
  return sim.units().some(x => x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === t.id)
}

/** target + its living summon(s) — canon Skill/Ult buffs also land on the memosprite */
function targetAndSummon(sim: SimApi, t: Unit): Unit[] {
  const out = [t]
  for (const x of sim.units())
    if (x.side === 'ally' && x.kind === 'summon' && !x.dead && sim.rt(x).ownerId === t.id) out.push(x)
  return out
}

/** E6: CR overflow → CD (+2% per 1% excess), per unit (mirror summons have own crit) */
function crOverflowToCd(sim: SimApi, t: Unit): void {
  const excess = Math.max(0, eff(t).critRate - 1)
  if (excess > 0) sim.addBuff(t, { id: 'sunday_cr2cd', name: 'Ode to Caress and Cicatrix', mods: [{ stat: 'critDmg', value: excess * 2 }], turns: 4 })
}

/** 131307 "The Glorious Mysteries": the first ability Sunday lands on an ally target →
 *  that target's DMG dealt +50% for 2 turns. Armed by the buff Technique, consumed once. */
function techniqueMysteries(sim: SimApi, u: Unit, t: Unit, rt: KitRuntime): void {
  if (!rt.sundayTech) return
  rt.sundayTech = false
  for (const a of targetAndSummon(sim, t))
    sim.addBuff(a, { id: 'sunday_tech', name: 'The Glorious Mysteries', mods: [{ stat: 'dmgAll', value: 0.5 }], turns: 2 })
  sim.log(`Sunday Technique: ${t.name} DMG dealt +50% (2 turns)`)
}

function pickTarget(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  // support Sunday: buff the main DPS first (declared or strongest), else strongest living ally
  const main = mainDpsOf(sim, ctx)
  if (main && main.kind === 'char' && main.id !== u.id && !main.dead) return main
  const allies = sim.allies(u.side).filter(a => a.kind === 'char' && a.id !== u.id && !a.dead)
  if (!allies.length) return undefined
  return allies.reduce((m, a) => (sim.effAtk(a) + sim.effCritDmg(a) > sim.effAtk(m) + sim.effCritDmg(m) ? a : m), allies[0])
}

export const sundayKit: KitDef = {
  id: 'sunday',
  name: 'Sunday',
  elem: 'Imaginary',
  energyMax: 130,
  base: { ...PROG.sunday.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  technique: {
    name: 'The Glorious Mysteries',
    kind: 'buff',
    apply(sim, u) { sim.rt(u).sundayTech = true },
  },
  onStart(sim, u) {
    // A2: +25 Energy at battle start
    sim.gainEnergy(u, 25)
    sim.log('Sunday A2: +25 Energy')
  },
  onTurnStart(sim, u, ctx) {
    // E4: +8 Energy at turn start
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 4) { sim.gainEnergy(u, 8); sim.log('Sunday E4: +8 Energy') }
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy && sim.allies(u.side).some(a => a.kind === 'char' && !a.dead && a.id !== u.id)) return { kind: 'ult' }
    if (sim.sp() >= 1 && pickTarget(sim, u, ctx)) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const t = pickTarget(sim, u, ctx)
      if (!t) return
      sim.markAlliedTarget(t)
      techniqueMysteries(sim, u, t, rt)
      // Ult: regen energy (min 40 per Rest Day's Longing) + turn target & summon into "The Beatified" (CRIT DMG = frac of Sunday's CD);
      // duration drops at the start of Sunday's every turn (tickOnSource), 3 turns
      const en = Math.max(40, mult('sunday', 'ult', lv.ult) * t.maxEnergy)
      if (eid >= 2 && !rt.e2First) { rt.e2First = true; sim.gainSp(2); sim.log('Sunday E2: +2 SP (first ult)') }
      const cd = sim.effCritDmg(u) * mult('sunday', 'ult_a2', lv.ult) + mult('sunday', 'ult_a3', lv.ult)
      t.energy = Math.min(t.maxEnergy, t.energy + en)
      for (const a of targetAndSummon(sim, t))
        sim.addBuff(a, { id: 'beatified', name: 'The Beatified', mods: [{ stat: 'critDmg', value: cd }, { stat: 'dmgAll', value: eid >= 2 ? 0.30 : 0 }], turns: 3, sourceId: u.id, tickOnSource: true })
      // E6: ult also applies the Talent CRIT Rate boost (CR overflow → CD)
      if (eid >= 6) {
        const tl = mult('sunday', 'talent', lv.talent)
        for (const a of targetAndSummon(sim, t)) {
          sim.addBuff(a, { id: 'sunday_talent', name: 'The Sorrowing Body', mods: [{ stat: 'critRate', value: tl }], turns: 4, maxStacks: 3 })
          crOverflowToCd(sim, a)
        }
      }
      sim.log(`${u.name} Ult on ${t.name}: +${Math.round(en)} energy, CD +${Math.round(cd * 100)}%, Beatified`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const t = pickTarget(sim, u, ctx)
      if (!t) return
      sim.markAlliedTarget(t)
      techniqueMysteries(sim, u, t, rt)
      // Talent: CRIT Rate buff for 3 turns (E6: stackable 3x, +1 turn); CR overflow → CD (+2% per 1% excess)
      const tl = mult('sunday', 'talent', lv.talent)
      for (const a of targetAndSummon(sim, t)) {
        sim.addBuff(a, { id: 'sunday_talent', name: 'The Sorrowing Body', mods: [{ stat: 'critRate', value: tl }], turns: eid >= 6 ? 4 : 3, maxStacks: eid >= 6 ? 3 : 1 })
        // CR overflow → CD is an E6-only mechanic (talent base just gives CR)
        if (eid >= 6) crOverflowToCd(sim, a)
      }
      // Skill: DMG+ (+ extra if the target has a summon) — lands on target + summon
      let dmg = mult('sunday', 'skill', lv.skill)
      if (hasOwnSummon(sim, t)) dmg += mult('sunday', 'skill_a2', lv.skill)
      for (const a of targetAndSummon(sim, t))
        sim.addBuff(a, { id: 'sunday_dmg', name: 'Ode to Caress and Cicatrix', mods: [{ stat: 'dmgAll', value: dmg }], turns: 2 })
      // E1: target DEF-ignore 16%, summon DEF-ignore 40%
      if (eid >= 1) {
        sim.addBuff(t, { id: 'sunday_e1', name: 'Millennium\'s Quietus DEF↓', mods: [{ stat: 'defIgnore', value: 0.16 }], turns: 2 })
        for (const s of sim.units())
          if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === t.id)
            sim.addBuff(s, { id: 'sunday_e1_sum', name: 'Millennium\'s Quietus', mods: [{ stat: 'defIgnore', value: 0.40 }], turns: 2 })
      }
      // A6 "Haven in Palm": dispel 1 debuff from the target. EnemySpec.debuff (opening ally debuff)
      // + sim.dispel provide the observable primitive; dispel is a no-op when no debuff is present.
      sim.dispel(t)
      // canon: Skill on The Beatified recovers 1 SP
      if (t.buffs.some(b => b.id === 'beatified')) { sim.gainSp(1); sim.log('Sunday: +1 SP (Skill on The Beatified)') }
      // canon: Harmony-path target cannot trigger the immediate action
      if (t.base.path !== 'Harmony') {
        sim.immediateTurn(t)
        // summon takes immediate action too (canon: "the ally and their summon immediate action");
        // immediateTurn is char-only, so zero the summon's AV directly; skip SPD-0 off-timeline summons (av=Inf)
        for (const s of sim.units())
          if (s.side === 'ally' && s.kind === 'summon' && !s.dead && sim.rt(s).ownerId === t.id && Number.isFinite(s.av) && s.av > 0)
            s.av = 0
        sim.log(`${u.name} Skill on ${t.name}: DMG+${Math.round(dmg * 100)}%, advances`)
      } else {
        sim.log(`${u.name} Skill on ${t.name}: DMG+${Math.round(dmg * 100)}% (Harmony: no immediate action)`)
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, sim.livingEnemiesOf(u)[0], { type: 'basic', mult: mult('sunday', 'basic', lv.basic), toughDmg: 10, label: 'Gleaming Admonition' })
  },
}


// ===== cerydra  (was cerydra.ts) =====
const CHARGE_CAP = 8
const PEERAGE_AT = 6

function pickTarget_cerydra(sim: SimApi, u: Unit): Unit | undefined {
  // Cerydra grants Military Merit to the strongest living ally (the on-field DPS)
  const allies = sim.allies(u.side).filter(a => a.kind === 'char' && a.id !== u.id && !a.dead)
  if (!allies.length) return undefined
  return allies.reduce((m, a) => (sim.effAtk(a) + sim.effCritDmg(a) > sim.effAtk(m) + sim.effCritDmg(m) ? a : m), allies[0])
}

function carrierOf(sim: SimApi, rt: KitRuntime): Unit | undefined {
  const id = (rt as { mmId?: string }).mmId
  if (!id) return undefined
  return sim.allies('ally').find(a => a.id === id && !a.dead)
}

function applyMerit(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u) as {
    mmId?: string; charge?: number; peerage?: boolean; coupCount?: number; e2Self?: boolean; peerageApplied?: boolean
  }
  // Talent: Merit only affects the most recent target; when the target changes, Charge resets to 0
  const prev = (rt as { mmId?: string }).mmId
  if (prev && prev !== target.id) {
    const old = sim.allies('ally').find(a => a.id === prev && !a.dead)
    if (old) {
      sim.removeBuff(old, 'cerydra_atk')
      sim.removeBuff(old, 'cerydra_def')
      sim.removeBuff(old, 'cerydra_peer')
      sim.removeBuff(old, 'cerydra_e2')
    }
    rt.peerage = false
    rt.charge = 0
  }
  rt.mmId = target.id
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  sim.markAlliedTarget(target)
  // Talent: MM carrier gains ATK = % of Cerydra's ATK
  sim.removeBuff(target, 'cerydra_atk')
  sim.addBuff(target, {
    id: 'cerydra_atk', name: 'Ave Imperator',
    mods: [{ stat: 'atkFlat', value: mult('cerydra', 'talent_a2', lv.talent) * sim.effAtk(u) }],
  })
  // E1: MM carrier DEF-ignore (16%; Peerage → +20% more)
  sim.removeBuff(target, 'cerydra_def')
  sim.addBuff(target, {
    id: 'cerydra_def', name: 'Seize the Crowns of All',
    mods: [{ stat: 'defIgnore', value: rt.peerage ? 0.36 : 0.16 }],
  })
  // E2: MM carrier +40% DMG
  if (eid >= 2) {
    sim.removeBuff(target, 'cerydra_e2')
    sim.addBuff(target, { id: 'cerydra_e2', name: 'Forge the Dreams of Many', mods: [{ stat: 'dmgAll', value: 0.40 }] })
    // while a teammate has MM, Cerydra +160% DMG
    if (!rt.e2Self) { rt.e2Self = true; sim.addBuff(u, { id: 'cerydra_e2self', name: 'Forge the Dreams of Many', mods: [{ stat: 'dmgAll', value: 1.60 }] }) }
  }
  sim.log(`${u.name} grants Military Merit to ${target.name}`)
  maybePeerage(sim, u, ctx)
}

function maybePeerage(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u) as { mmId?: string; peerage?: boolean; peerageApplied?: boolean; charge?: number }
  if (rt.peerage || !rt.mmId || rt.charge! < PEERAGE_AT) return
  rt.peerage = true
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const target = carrierOf(sim, rt)
  if (target) {
    // Peerage: Skill CRIT DMG + All-Type RES PEN (+E1 skill DEF-ignore ×0.36; E6 +20% RES PEN)
    sim.removeBuff(target, 'cerydra_def')
    sim.addBuff(target, {
      id: 'cerydra_def', name: 'Seize the Crowns of All',
      mods: [{ stat: 'defIgnore', value: eid >= 1 ? 0.36 : 0 }],
    })
    sim.removeBuff(target, 'cerydra_peer')
    sim.addBuff(target, {
      id: 'cerydra_peer', name: 'Peerage',
      mods: [
        { stat: 'critDmg:skill', value: mult('cerydra', 'skill', lv.skill) },
        { stat: 'resPenAll', value: mult('cerydra', 'skill_a5', lv.skill) + (eid >= 6 ? 0.20 : 0) },
      ],
    })
    sim.log(`${u.name}: Charge ${rt.charge} → ${target.name} upgraded to Peerage`)
  }
}

function revertPeerage(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u) as { mmId?: string; peerage?: boolean; charge?: number }
  if (!rt.peerage) return
  rt.peerage = false
  rt.charge = Math.max(0, (rt.charge ?? 0) - PEERAGE_AT)
  const target = carrierOf(sim, rt)
  if (target) {
    // Merit → Merit: drop Peerage buffs, restore base Merit DEF-ignore
    sim.removeBuff(target, 'cerydra_peer')
    sim.removeBuff(target, 'cerydra_def')
    sim.addBuff(target, { id: 'cerydra_def', name: 'Seize the Crowns of All DEF↓', mods: [{ stat: 'defIgnore', value: 0.16 }] })
  }
  sim.log(`${u.name}: Coup de Main → Peerage reverted (Charge ${rt.charge})`)
}

function gainCharge(sim: SimApi, u: Unit, n: number, ctx: KitRuntime): void {
  const rt = sim.rt(u) as { charge?: number }
  const before = rt.charge ?? 0
  rt.charge = Math.min(CHARGE_CAP, before + n)
  if (rt.charge !== before) sim.log(`${u.name}: Charge ${before} → ${rt.charge}`)
  maybePeerage(sim, u, ctx)
}

/** Skill effect: grant Merit to the chosen ally, gain Charge, +20 SPD self & carrier 3t. */
function cerydraSkill(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const eid = (ctx.eidolon as number) ?? 0
  sim.gainEnergy(u, 30)
  const t = pickTarget_cerydra(sim, u)
  if (!t) return
  applyMerit(sim, u, t, ctx)
  gainCharge(sim, u, 1, ctx)
  if (eid >= 1) sim.gainEnergy(t, 2)
  sim.addBuff(u, { id: 'cerydra_spd', name: 'Vidi', mods: [{ stat: 'spdFlat', value: 20 }], turns: 3 })
  sim.addBuff(t, { id: 'cerydra_spd', name: 'Vidi', mods: [{ stat: 'spdFlat', value: 20 }], turns: 3 })
  sim.log(`${u.name} Skill on ${t.name}: Merit + Charge`)
}

export const cerydraKit: KitDef = {
  id: 'cerydra',
  name: 'Cerydra',
  elem: 'Wind',
  energyMax: 130,
  base: { ...PROG.cerydra.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  onStart(sim, u, ctx) {
    const rt0 = sim.rt(u) as { charge?: number; coupCount?: number }
    rt0.charge = 0
    rt0.coupCount = 0
    // A4: Cerydra CRIT Rate +100%
    sim.addBuff(u, { id: 'cerydra_crit', name: 'Vidi', mods: [{ stat: 'critRate', value: 1.0 }] })
    // A1: +18% CRIT DMG per 100 ATK over 2000 (cap +360%)
    const over = Math.max(0, sim.effAtk(u) - 2000)
    const cd = Math.min(3.60, 0.18 * Math.floor(over / 100))
    if (cd > 0) sim.addBuff(u, { id: 'cerydra_cd', name: 'Veni', mods: [{ stat: 'critDmg', value: cd }] })
  },
  technique: {
    name: 'First-Move Advantage',
    kind: 'buff',
    apply(sim, u, ctx) {
      cerydraSkill(sim, u, ctx)
      sim.log(`${u.name} Technique: auto-Skill (no SP)`)
    },
  },

  decide(sim, u, ctx) {
    const rt0 = sim.rt(u) as { mmId?: string; charge?: number }
    // keep Merit active on the field: if none exists, skill to grant it
    if (!carrierOf(sim, rt0)) { if (sim.sp() >= 1) return { kind: 'skill' }; return { kind: 'basic' } }
    if (u.energy >= u.maxEnergy && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    // once Charge is capped, save SP for the carrier to Coup de Main; rebuild only when dropped (revert consumed)
    if (sim.sp() >= 1 && (rt0.charge ?? 0) < CHARGE_CAP) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  // §P5 Coup de Main: the Peerage carrier's Skill is hijacked BEFORE it resolves — the copy is cast
  // immediately (Follow-Up, no SP), then the ORIGINAL is released in an Extra Turn. Raw 141202 notes:
  // "Copy and immediately use the ability about to be used, then use the original ability... the
  // original ability will be released in an Extra Turn."
  onBeforeAction(sim, actor, action, ctx) {
    if (action.kind !== 'skill') return false
    const a = sim.rt(actor) as { extraRelease?: boolean; levels?: AbilityLevels }
    if (a.extraRelease) return false // never re-hijack the released original
    const u = sim.allies('ally').find(x => x.kitId === 'cerydra' && !x.dead)
    if (!u) return false
    const rt = sim.rt(u) as { mmId?: string; peerage?: boolean; coupLock?: boolean; coupCopy?: boolean }
    if (rt.mmId !== actor.id || !rt.peerage || rt.coupLock) return false
    const living = sim.livingEnemiesOf(u)
    if (!living.length) return false
    const ck = a.levels?.skill ?? 10
    // copy-first, so the carrier's primary target is still alive — no retarget fallback needed
    rt.coupLock = true
    rt.coupCopy = true
    sim.hit(actor, living[0]!, { type: 'skill', mult: mult(actor.kitId!, 'skill', ck), toughDmg: 10, label: 'Coup de Main' })
    sim.releaseAsExtraTurn(actor, action)
    revertPeerage(sim, u, ctx)
    rt.coupLock = false
    return true
  },
  onAfterAttack(sim, attacker, target, dmgType, ctx, _dmg) {
    if (attacker.dead) return
    if (dmgType === 'add' || dmgType === 'elation' || dmgType === 'dot' || dmgType === 'break') return
    const u = sim.allies('ally').find(a => a.kitId === 'cerydra' && !a.dead)
    if (!u) return
    const rt = sim.rt(u) as { mmId?: string; coupCount?: number; a4Done?: boolean; charge?: number; coupLock?: boolean; coupCopy?: boolean }
    // Merit carrier attacked an enemy → Cerydra gains Charge / A3 energy / Additional DMG
    if (rt.mmId === attacker.id && target.side === 'enemy') {
      // the copy's OWN after-attack reaction is skipped; it fired before the original (§P5)
      if (rt.coupCopy) { rt.coupCopy = false; return }
      const lv = levelsOf(ctx)
      const eid = (ctx.eidolon as number) ?? 0
      if (dmgType === 'basic' || dmgType === 'skill') {
        sim.gainEnergy(u, 5) // A3: +5 Energy for Cerydra when Merit carrier Basic/Skill
        // Talent: during Coup de Main Cerydra cannot gain Charge (only the A3 Energy still lands)
        if (!rt.coupLock) gainCharge(sim, u, 1, ctx)
      } else if (dmgType === 'ult' && !rt.a4Done && rt.charge! < CHARGE_CAP) {
        rt.a4Done = true
        gainCharge(sim, u, 1, ctx)
      }
      // after carrier attack → Cerydra Wind Additional DMG (reset count on her Ult)
      if ((rt.coupCount ?? 0) < 20 && !target.dead) {
        rt.coupCount = (rt.coupCount ?? 0) + 1
        const cm = mult('cerydra', 'talent', lv.talent) * (eid >= 6 ? 4 : 1)
        sim.hit(u, target, { type: 'add', noSeq: true, mult: cm, label: 'Id Conservancy' })
      }
    }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u) as { charge?: number; coupCount?: number; mmId?: string }

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      gainCharge(sim, u, 2, ctx)
      rt.coupCount = 0 // reset Additional DMG count
      let um = mult('cerydra', 'ult', lv.ult)
      if (eid >= 4) um *= 3.4 // E4: Ult DMG ×3.4
      // Ult grants Merit to first team char if none present
      if (!carrierOf(sim, rt)) {
        const t = (sim.allies(u.side) as Unit[]).filter(a => a.kind === 'char' && a.id !== u.id && !a.dead)[0]
        if (t) applyMerit(sim, u, t, ctx)
      }
      for (const e of sim.livingEnemiesOf(u)) sim.hit(u, e, { type: 'ult', mult: um, label: "Scholar's Mate" })
      sim.log(`${u.name} Ult: Charge +2, Wind DMG ×${um.toFixed(2)} all enemies`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      cerydraSkill(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, sim.livingEnemiesOf(u)[0], { type: 'basic', mult: mult('cerydra', 'basic', lv.basic), toughDmg: 10, label: "King's Castling" })
  },
}


// ===== hanya  (was hanya.ts) =====
function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** ally attacked a Burden-carrying enemy → Sanction DMG buff + SP-recovery count */
function onBurdenAttack(sim: SimApi, attacker: Unit, target: Unit, dmgType: string, ctx: KitRuntime): void {
  // canon: только Basic ATK/Skill/Ultimate; FUA/Additional — часть той же способности
  if (dmgType !== 'basic' && dmgType !== 'skill' && dmgType !== 'ult') return
  const burden = target.buffs.find(b => b.id === 'hanya_burden')
  if (!burden) return
  if (ctx.burdenSeq === sim.attackNo()) return // раз на применение, не на хит (Blast/мультихит)
  ctx.burdenSeq = sim.attackNo()
  // Talent Sanction: ally hits burdened enemy → +DMG 2t
  const lv = levelsOf(ctx)
  let dmg = mult('hanya', 'talent', lv.talent)
  if (eid(ctx) >= 6) dmg += 0.10
  sim.addBuff(attacker, { id: 'hanya_sanction', name: 'Sanction', mods: [{ stat: 'dmgAll', value: dmg }], turns: mult('hanya', 'talent_a2', lv.talent) })
  // count attacks: every 2 → recover 1 SP (Burden consumed after #2 recoveries)
  const cur = ((burden.payload as number) ?? 0) + 1
  burden.payload = cur % 2
  if (cur % 2 === 0) {
    // A1 Scrivener: triggering ally ATK+10% 1t
    sim.addBuff(attacker, { id: 'hanya_a1', name: 'Scrivener', mods: [{ stat: 'atkPct', value: 0.1 }], turns: 1 })
    sim.gainSp(1)
    sim.log('Burden: allies recover 1 Skill Point')
    const hanya = sim.allies('ally').find(u => u.kitId === 'hanya' && !u.dead)
    if (hanya) {
      sim.gainEnergy(hanya, 2) // A5 Reanimated
    }
    const rem = (burden.stacks ?? 1) - 1
    if (rem <= 0) {
      sim.removeBuff(target, 'hanya_burden')
      if (ctx.burdenId === target.id) ctx.burdenId = undefined
    } else {
      const ex = target.buffs.find(b => b.id === 'hanya_burden')
      if (ex) ex.stacks = rem
    }
  }
}

export const hanyaKit: KitDef = {
  id: 'hanya',
  name: 'Hanya',
  elem: 'Physical',
  energyMax: 140,
  base: { ...PROG.hanya.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Harmony' },
  // 121507 "Netherworld Judgment": applies Burden (as the Skill does) to a random enemy. attack Technique.
  technique: {
    name: 'Netherworld Judgment',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      const t = sim.rngPick(enemies)
      sim.hit(u, t, { type: 'basic', mult: 0.5, elem: 'Physical', toughDmg: 10, label: 'Netherworld Judgment' })
      for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'hanya_burden')
      sim.addBuff(t, { id: 'hanya_burden', name: 'Samsara, Locked', mods: [], payload: 0, stacks: mult('hanya', 'skill_a2', lv.skill) })
      ctx.burdenId = t.id
    },
  },
  decide(sim, u, ctx) {
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
      const chars = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
      const highest = chars.reduce((m, a) => (sim.effAtk(a) > sim.effAtk(m) ? a : m), u)
      const target = manualTarget(sim, action, highest)
      sim.markAlliedTarget(target)
      const turns = mult('hanya', 'ult_a3', lv.ult) + (eid(ctx) >= 4 ? 1 : 0) // E4: +1 turn
      sim.addBuff(target, {
        id: 'hanya_ult', name: 'Ten-Lords\' Decree, All Shall Obey',
        mods: [
          { stat: 'atkPct', value: mult('hanya', 'ult', lv.ult) },
          { stat: 'spdFlat', value: Math.floor(eff(u).spd * mult('hanya', 'ult_a2', lv.ult)) },
        ],
        turns, sourceId: u.id,
      })
      sim.log(`Ten-Lords' Decree: buff ${target.name} (ATK+SPD)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      if (eid(ctx) >= 2) sim.addBuff(u, { id: 'hanya_e2', name: 'Two Views', mods: [{ stat: 'spdPct', value: 0.2 }], turns: 1 })
      const t = manualTarget(sim, action, enemies[0])
      sim.hit(u, t, { type: 'skill', mult: mult('hanya', 'skill', lv.skill), elem: 'Physical', toughDmg: 20, label: 'Samsara, Locked' })
      // apply Burden (latest target only; capacity = skill_a2 SP recoveries)
      for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'hanya_burden')
      if (!t.dead) {
        sim.addBuff(t, { id: 'hanya_burden', name: 'Samsara, Locked', mods: [], payload: 0, stacks: mult('hanya', 'skill_a2', lv.skill) })
        ctx.burdenId = t.id
      } else {
        ctx.burdenId = undefined
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('hanya', 'basic', lv.basic), elem: 'Physical', toughDmg: 10, label: 'Oracle Brush' })
  },

  onStart(sim, _u, ctx) {
    ctx.advThisTurn = false
    void sim
  },

  onTurnStart(sim, _u, ctx) {
    ctx.advThisTurn = false
  },

  /** Sanction + Burden SP counting when any ally hits a Burden-carrying enemy */
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    onBurdenAttack(sim, attacker, target, dmgType, ctx)
  },

  /** E1 One Heart: ult-holder's kill → hanya advance 15% (1×/turn); A2 Netherworld: kill Burdened enemy +1 SP */
  onAllyKill(sim, killer, victim, ctx) {
    if (eid(ctx) >= 1 && !ctx.advThisTurn && sim.hasBuff(killer, 'hanya_ult')) {
      const hanya = sim.allies('ally').find(u => u.kitId === 'hanya' && !u.dead)
      if (hanya) {
        ctx.advThisTurn = true
        sim.advance(hanya, 0.15)
        sim.log('Hanya E1: action advanced 15%')
      }
    }
    // A2 Netherworld: счётчик триггеров ≤1 всегда, пока Burden жив (2-й триггер снимает бафф).
    // id в ctx, не бафф жертвы: kill() чистит buffs до onAllyKill (simulator.ts:755).
    if (ctx.burdenId === victim.id) {
      ctx.burdenId = undefined
      sim.gainSp(1)
      sim.log('Netherworld: recover 1 Skill Point')
    }
  },
}


// ===== ruanmei  (was ruanmei.ts) =====
const ID = 'ruanmei'

function rmUnit(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kitId === ID && !a.dead)
}

/** Skill "String Sings Slow Swirls" Overtone: all allies DMG + WBE for #3 turns.
 *  Also fired for free by the Technique Silken Serenade at battle start. */
function applyOvertone(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const turns = mult(ID, 'skill_a3', lv.skill)
  ctx.overtoneTurns = turns
  const wbe = mult(ID, 'skill_a2', lv.skill)
  const skillDmg = mult(ID, 'skill', lv.skill)
  // A4 Candle Lights on Still Waters: per 10% BE over 120% → +6% skill DMG (cap 36%)
  const be = eff(u).be
  const a4Bonus = be > 1.2 ? Math.min(Math.floor((be - 1.2) / 0.1) * 0.06, 0.36) : 0
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    sim.addBuff(a, { id: 'rm_overtone_dmg', name: 'String Sings Slow Swirls', mods: [{ stat: 'dmgAll', value: skillDmg + a4Bonus }], turns })
    sim.removeBuff(a, 'rm_overtone_wbe')
    sim.addBuff(a, { id: 'rm_overtone_wbe', name: 'String Sings Slow Swirls', mods: [{ stat: 'wbe', value: wbe }], turns })
  }
}

export const ruanmeiKit: KitDef = {
  id: ID,
  name: 'Ruan Mei',
  elem: 'Ice',
  energyMax: 130,
  base: { ...PROG.ruanmei.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Harmony' },

  onStart(sim, u, ctx) {
    ctx.overtoneTurns = 0
    ctx.zoneTurns = 0
    ctx.fieldActive = false
    ctx.rebloom = []
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    // Talent Somatotypical Helix: SPD +10% for all teammates (excluding self)
    const spdVal = mult(ID, 'talent', lv.talent)
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      if (a.id !== u.id) sim.addBuff(a, { id: 'rm_talent_spd', name: 'Somatotypical Helix', mods: [{ stat: 'spdPct', value: spdVal }] })
      // A2 Inert Respiration: all allies BE +20%
      sim.addBuff(a, { id: 'rm_a2_be', name: 'Inert Respiration', mods: [{ stat: 'be', value: 0.20 }] })
      // E2 Reedside Promenade: while RM on field, allies +40% ATK vs Weakness-Broken enemies
      if (eid >= 2) sim.addBuff(a, { id: 'rm_e2', name: 'Reedside Promenade', mods: [{ stat: 'atkPctVsBroken', value: 0.4 }] })
    }
    // Technique Silken Serenade: trigger the Skill once at battle start without consuming SP
    applyOvertone(sim, u, ctx)
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // keep Overtone up; conserve SP otherwise
    if ((ctx.overtoneTurns as number) <= 1 && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      ctx.fieldActive = true
      ctx.zoneTurns = eid >= 6 ? 3 : 2 // E6 Sash Cascade: Zone +1 turn
      const resPen = mult(ID, 'ult', lv.ult)
      // Zone: all allies' All-Type RES PEN +#1% (resPenAll is read from the attacker)
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'rm_field', name: 'Petals to Stream, Repose in Dream', mods: [{ stat: 'resPenAll', value: resPen }], turns: ctx.zoneTurns as number })
      }
      // E1 Neuronic Embroidery: while the Zone is deployed, allies ignore 20% of enemy DEF
      if (eid >= 1) for (const e of enemies) sim.addBuff(e, { id: 'rm_e1', name: 'Neuronic Embroidery DEF↓', mods: [{ stat: 'defIgnore', value: 0.20 }], turns: ctx.zoneTurns as number })
      sim.log(`${u.name} Ult: Petals to Stream, Repose in Dream (Zone ${ctx.zoneTurns}t)`)
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      applyOvertone(sim, u, ctx)
      sim.log(`${u.name} Skill: String Sings Slow Swirls (Overtone ${ctx.overtoneTurns}t)`)
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0] ?? u)
    sim.hit(u, t, { type: 'basic', mult: mult(ID, 'basic', lv.basic), elem: 'Ice', toughDmg: 10, label: 'Threading Fragrance' })
  },

  onTurnStart(sim, u, ctx) {
    // A3 Days Wane, Thoughts Wax: +5 Energy at the start of her turn
    sim.gainEnergy(u, 5)
    if ((ctx.overtoneTurns as number) > 0) ctx.overtoneTurns = (ctx.overtoneTurns as number) - 1
    if (ctx.fieldActive && (ctx.zoneTurns as number) > 0) {
      ctx.zoneTurns = (ctx.zoneTurns as number) - 1
      if ((ctx.zoneTurns as number) <= 0) {
        ctx.fieldActive = false
        for (const a of sim.allies('ally')) sim.removeBuff(a, 'rm_field')
        for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'rm_e1')
        sim.log(`${u.name} Zone ends`)
      }
    }
  },

  onBreak(sim, _breaker, victim, ctx) {
    if (victim.side !== 'enemy') return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rm = rmUnit(sim)
    if (!rm) return
    // E4 Chatoyant Éclat: enemy Weakness-Broken → RM Break Effect +100% for 3 turns
    sim.addBuff(rm, { id: 'rm_e4', name: 'Chatoyant Éclat', mods: [{ stat: 'be', value: 1.00 }], turns: 3 })
    // Talent: when an ally Breaks an enemy, RM deals Break DMG = #2% of her Ice Break DMG
    const baseBreakDmg = computeBreakDamage({ attacker: rm, target: victim, elem: 'Ice', kind: 'break' })
    const e6Mult = eid >= 6 ? 3 : 1 // E6: Talent Break DMG multiplier +200%
    const dmg = Math.floor(baseBreakDmg * mult(ID, 'talent_a2', lv.talent) * e6Mult)
    sim.applyTargetBreak(rm, victim, dmg, 'Somatotypical Helix (Break)')
    // Thanatoplum Rebloom: while inside the Zone, mark the Broken enemy to trigger on recovery
    if (ctx.fieldActive) {
      const set = (ctx.rebloom as string[]) ?? []
      if (!set.includes(victim.id)) ctx.rebloom = [...set, victim.id]
    }
  },

  onEnemyTurnStart(sim, u, e, ctx) {
    // Thanatoplum Rebloom: a marked enemy just recovered from Weakness Break this turn
    const set = (ctx.rebloom as string[]) ?? []
    if (!set.includes(e.id)) return
    ctx.rebloom = set.filter(x => x !== e.id)
    const lv = levelsOf(ctx)
    // delay by #3% of RM's Break Effect + #4%; Break DMG = #5% of her Ice Break DMG
    sim.delay(e, mult(ID, 'ult_a3', lv.ult) * eff(u).be + mult(ID, 'ult_a4', lv.ult))
    const bdmg = Math.floor(computeBreakDamage({ attacker: u, target: e, elem: 'Ice', kind: 'break' }) * mult(ID, 'ult_a5', lv.ult))
    sim.applyTargetBreak(u, e, bdmg, 'Thanatoplum Rebloom')
    sim.log(`${u.name} Thanatoplum Rebloom triggers on ${e.name}`)
  },
}


// ===== robin  (was robin.ts) =====
// this is the base Robin (Harmony/Physical, Concerto). «Robin • Summeretto» is a SEPARATE form
// (Remembrance/Wind, memosprite «Summer Songbirds») — see the remembrance.ts kit `robin_summeretto`.

const CONCERTO_ID = 'robin_concerto'

function concertoBuffs(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  // canon: allies' ATK += #1×Robin's ATK + #3[i] (share of ROBIN's ATK, not of the ally's)
  const atkShare = Math.round(sim.effAtk(u) * mult('robin', 'ult_a2', lv.ult)) + mult('robin', 'ult_a3', lv.ult)
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char' || a.dead) continue
    sim.addBuff(a, {
      id: CONCERTO_ID, name: 'Concerto', sourceId: u.id,
      mods: [
        { stat: 'atkFlat', value: atkShare },
        // A4 Impromptu Flourish: allies' Follow-Up ATK CRIT DMG +25%
        { stat: 'critDmg:fua', value: 0.25 },
        ...(eid >= 1 ? [{ stat: 'resPenAll' as const, value: 0.24 }] : []),
        ...(eid >= 2 ? [{ stat: 'spdPct' as const, value: 0.16 }] : []),
        // E4 Raindrop Key: Effect RES +50% (CC-dispel itself is a no-op — sim has no ally CC)
        ...(eid >= 4 ? [{ stat: 'effRes' as const, value: 0.5 }] : []),
      ],
      turns: Infinity,
    })
  }
}

function exitConcerto(sim: SimApi, u: Unit): void {
  const rt = sim.rt(u)
  if (!rt.concerto) return
  rt.concerto = false
  for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.removeBuff(a, CONCERTO_ID)
  sim.log(`${u.name} exits the Concerto state`)
}

export const robinKit: KitDef = {
  id: 'robin',
  name: 'Robin',
  elem: 'Physical',
  energyMax: 160,
  base: { ...PROG.robin.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Harmony' },
  // #130405 "Barrier" (Technique): +5 Energy at the start of each wave (wave 1 modeled).
  technique: {
    name: 'Barrier',
    kind: 'buff',
    apply(sim, u) { sim.gainEnergy(u, 5) },
  },
  onStart(sim, u, ctx) {
    const lv = levelsOf(ctx)
    // A2 Coloratura Cadenza: action-advance self by 25% at battle start
    sim.advance(u, 0.25)
    // Talent Tonal Resonance: all allies CRIT DMG (always on)
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char') continue
      sim.addBuff(a, { id: 'robin_cd', name: 'Tonal Resonance', mods: [{ stat: 'critDmg', value: mult('robin', 'talent', lv.talent) }], turns: Infinity })
    }
  },
  decide(sim, u, ctx) {
    // cannot enter her turn or take action while Concerto is active
    if (sim.rt(u).concerto) return { kind: 'basic' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    const robin = sim.allies('ally').find(x => x.kitId === 'robin' && !x.dead)
    if (!robin || target.side !== 'enemy') return
    const rt = sim.rt(robin)
    const eid = (ctx.eidolon as number) ?? 0
    // Talent Tonal Resonance: after ally targets attack → Robin regens Energy (E2 +1)
    if (attacker.side === 'ally' && attacker !== robin && dmgType !== 'add') {
      sim.gainEnergy(robin, 2 + (eid >= 2 ? 1 : 0))
    }
    // Ultimate: while Concerto, after every attack by ally targets → Physical Additional DMG, fixed CRIT
    if (rt.concerto && attacker.side === 'ally' && attacker !== robin && dmgType !== 'add' && !target.dead) {
      const seq = sim.attackNo()
      if (rt.lastSeq !== seq) {
        rt.lastSeq = seq
        // E6 Moonless Midnight: first 8 procs per ult gain +450% CRIT DMG (600%); bonus then lapses but the base proc keeps firing
        const enhanced = eid >= 6 && ((rt.e6Count as number) ?? 0) < 8
        // fixed CRIT DMG 150% (enhanced → 600%): neutralize Robin's own CD via target-mod lane
        const fixedCd = (enhanced ? 1.5 + 4.5 : 1.5) - sim.effCritDmg(robin)
        sim.addBuff(robin, { id: 'robin_cdfix', name: 'Vox Harmonique, Opus Cosmique', mods: [{ stat: 'critDmg:add', value: fixedCd }], turns: Infinity })
        sim.hit(robin, target, { type: 'add', noSeq: true, mult: mult('robin', 'ult', levelsOf(ctx).ult), forceCrit: true, label: 'Vox Harmonique (Additional)' })
        sim.removeBuff(robin, 'robin_cdfix')
        if (enhanced) { const n = (rt.e6Count as number) ?? 0; rt.e6Count = n + 1 }
      }
    }
  },
  // concerto countdown reaches its turn → Robin exits and immediately takes action
  onCcEnd(sim, u, ctx) {
    exitConcerto(sim, u)
    sim.immediateTurn(u)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    if (rt.concerto) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      rt.concerto = true
      rt.e6Count = 0
      rt.lastSeq = 0
      sim.markAlliedTarget('team')
      concertoBuffs(sim, u, ctx)
      // countdown: own fixed SPD 90; when its turn begins Robin exits and acts immediately
      sim.scheduleCountdown(u, { id: `robintimer_${u.id}`, name: 'Concerto Countdown', side: 'ally', elem: 'Physical', spd: 90, weaknesses: ['Physical'] })
      sim.log(`${u.name} enters the Concerto state`)
      // teammates (excluding Robin) immediately take action
      for (const a of sim.allies(u.side)) {
        if (a.kind === 'char' && a.id !== u.id && !a.dead) sim.immediateTurn(a)
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // Pinion's Aria: team DMG+ lasting #2 turns; duration drops at the start of Robin's every turn (tickOnSource)
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char') continue
        sim.addBuff(a, { id: 'robin_aria', name: 'Pinion\'s Aria', sourceId: u.id, tickOnSource: true, mods: [{ stat: 'dmgAll', value: mult('robin', 'skill', lv.skill) }], turns: 3 })
      }
      // A6 Sequential Passage: +5 Energy on Skill
      sim.gainEnergy(u, 5)
      sim.log(`${u.name} uses Pinion's Aria (team DMG+)`)
      return
    }

    // basic — Wingflip White Noise (3-hit)
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const e = lowestHpEnemy(sim, u)
    if (e) sim.hit(u, e, { type: 'basic', mult: mult('robin', 'basic', lv.basic), toughDmg: 10, label: 'Wingflip White Noise', split: [0.33, 0.33, 0.34] })
  },
}

// ===== trailblazer_harmony  (was trailblazer_harmony.ts) =====
const TOUGHNESS_BY_TYPE: Record<string, number> = { basic: 10, skill: 20, ult: 30, fua: 15, add: 10, elation: 10, break: 10 }

function danceMult(sim: SimApi): number {
  const n = sim.allies('enemy').length
  if (n >= 5) return 1.60
  if (n === 4) return 1.50
  if (n === 3) return 1.40
  if (n === 2) return 1.30
  return 1.20 // 1 enemy
}

export const trailblazerHarmonyKit: KitDef = {
  id: 'trailblazer_harmony',
  name: '{NICKNAME}',
  elem: 'Imaginary',
  energyMax: 140,
  base: { ...PROG.trailblazer_harmony.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Harmony' },
  // 800507 "Now! I'm the Band!": all allies' Break Effect +30% for 2 turns at battle start.
  technique: {
    name: "Now! I'm the Band!",
    kind: 'buff',
    apply(sim, u) {
      for (const a of sim.allies(u.side)) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'tb_harm_tech_be', name: "Now! I'm the Band!", mods: [{ stat: 'be', value: 0.30 }], turns: 2 })
      }
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    // E2: battle start ERR +25% 3t
    if (eid >= 2) sim.addBuff(u, { id: 'tb_harm_e2', name: 'ERR Boost', mods: [{ stat: 'err', value: 0.25 }], turns: 3 })
    // E4: teammates BE +15% of TB BE
    if (eid >= 4) {
      const tbBE = sim.effBe(u)
      const beBonus = Math.round(tbBE * 0.15 * 1000) / 1000
      for (const a of sim.allies('ally')) {
        if (a.id === u.id || a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'tb_harm_e4', name: 'Dove in Tophat', mods: [{ stat: 'be', value: beBonus }], turns: Infinity })
      }
    }
  },

  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return decideByPattern(sim, u, _ctx)
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Backup Dancer: all allies BE +ult_a3, 1 turn (decrement on TB turn)
      const beVal = mult('trailblazer_harmony', 'ult_a3', lv.ult)
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'tb_harm_bd', name: 'Backup Dancer', mods: [{ stat: 'be', value: beVal }], turns: Infinity, tickOnSource: true, sourceId: u.id })
      }
      sim.log(`TB Harmony Ult: Backup Dancer BE+${(beVal * 100).toFixed(0)}% to all allies`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // E1: first skill → +1 SP
      if (eid >= 1 && !(rt.tbHarmE1Used as boolean)) {
        rt.tbHarmE1Used = true
        sim.gainSp(1)
      }
      // Single hit + N random hits (4 base, E6 +2)
      const hits = eid >= 6 ? 6 : mult('trailblazer_harmony', 'skill_a2', lv.skill)
      sim.hit(u, t, { type: 'skill', elem: 'Imaginary', mult: mult('trailblazer_harmony', 'skill', lv.skill), toughDmg: 20, label: 'Halftime (main)' })
      sim.hitRandom(u, hits, { type: 'skill', elem: 'Imaginary', mult: mult('trailblazer_harmony', 'skill', lv.skill), toughDmg: 10, label: 'Halftime (extra)' })
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, t, { type: 'basic', elem: 'Imaginary', mult: mult('trailblazer_harmony', 'basic', lv.basic), toughDmg: 10, label: 'Swing Dance Etiquette' })
  },

  // Talent: TB regenerates energy when enemy weakness broken
  onBreak(sim, breaker, _victim, ctx) {
    if (breaker.kitId !== 'trailblazer_harmony') return
    const lv = levelsOf(ctx)
    const gain = mult('trailblazer_harmony', 'talent', lv.talent)
    sim.gainEnergy(breaker, gain)
    sim.log(`TB Harmony Talent: Full-on Aerial Dance +${gain} Energy`)
  },

  // Backup Dancer: when allies attack broken enemies, convert toughness → Super Break
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.side !== 'ally') return
    if (target.side !== 'enemy' || target.dead || !target.broken) return
    if (!sim.hasBuff(attacker, 'tb_harm_bd')) return
    const toughness = TOUGHNESS_BY_TYPE[dmgType] ?? 10
    const dm = danceMult(sim)
    sim.superBreak(attacker, target, toughness, dm)
  },
}

