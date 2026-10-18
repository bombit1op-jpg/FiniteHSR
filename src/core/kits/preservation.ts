// Kits of the Preservation path, merged from the former per-character modules (6 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { type DoTWithSource } from '../simulator'
import { levelsOf, manualTarget, decideByPattern, type KitDef, type SimApi, type KitRuntime, type DmgType } from '../kit'
import type { Unit, AbilityLevels, StatKey } from '../entities/Unit'
import type { Mod } from '../effects/Buff'
import { mult, PROG } from '../progression'
import { eff, isDebuff } from '../combat/StatResolver'

// ===== march7th  (was march7th.ts) =====
// this is the base March 7th (Preservation/Ice). «March 7th • The Hunt» is a SEPARATE 4★ form
// (The Hunt/Imaginary) — see the hunt.ts kit `march7th_the_hunt`.

function findMarch(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'march7th' && !u.dead)
}

export const march7thKit: KitDef = {
  id: 'march7th',
  name: 'March 7th',
  elem: 'Ice',
  energyMax: 120,
  base: { level: 80, hp: 1058, atk: 511, def: 573, spd: 101, critRate: 0.05, critDmg: 0.5, path: 'Preservation' },
  // 100107 "Freezing Beauty": 100% base chance to Freeze a random enemy for 1 turn (Frozen: Ice
  // Additional DMG = 50% ATK each turn). attack Technique.
  technique: {
    name: 'Freezing Beauty',
    kind: 'attack',
    apply(sim, u) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      const e = sim.rngPick(enemies)
      sim.applyDebuff(u, e, 1.0, () => sim.applyDot(e, {
        kind: 'Freeze', elem: 'Ice', turns: 1,
        baseDmg: sim.effAtk(u) * 0.5, sourceUnit: u,
      } as unknown as DoTWithSource), 'Freeze', 'Freeze')
    },
  },
  onStart(sim, u) {
    u.aggro = 150
    // E2: grant the ally with lowest HP a shield at battle start
    const eid = (sim.rt(u).eidolon as number) ?? 0
    if (eid >= 2) {
      const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
      if (allies.length) {
        const low = allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), allies[0])
        sim.addBuff(low, {
          id: 'march_shield', name: 'March 7th, the Apex Heroine',
          mods: [], turns: 3, sourceId: u.id,
          shield: Math.round(eff(u).def * 0.24 + 320),
        })
        sim.log(`March E2: battle-start shield for ${low.name}`)
      }
    }
  },
  onTurnStart(_sim, u, ctx) {
    ctx.counterUses = 0
  },
  // E6: Shielded ally restores 4% Max HP + 106 at the start of their turn
  onAllyTurnStart(sim, ally, ctx) {
    if (ally.dead || !sim.hasBuff(ally, 'march_shield')) return
    const march = findMarch(sim)
    if (!march) return
    if (((ctx.eidolon as number) ?? 0) < 6) return
    const amount = Math.round(ally.maxHp * 0.04 + 106)
    sim.heal(ally, amount)
    sim.log(`March E6: heals ${ally.name} +${amount} (Shield regen)`)
  },
  decide(sim, u, ctx) {
    const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
    // shield anyone missing one first; when everyone's shielded, basic to earn SP
    if (sim.sp() >= 1 && allies.some(a => !sim.hasBuff(a, 'march_shield'))) return { kind: 'skill' }
    const pattern = (ctx.skillPattern as string) ?? 'auto'
    if (pattern !== 'auto') return { kind: 'basic' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('March Ult: Glacial Cascade (energy +5)') // +5 from castUlt
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'ult', mult: mult('march7th', 'ult', lv.ult), toughDmg: 30, label: 'Glacial Cascade', split: [0.25, 0.25, 0.25, 0.25] })
        if (!e.dead) {
          // A6 Ice Spell: +15% Freeze chance (canon base #2 = 0.5 const)
          sim.applyDebuff(u, e, 0.65, () => {
            sim.applyDot(e, {
              kind: 'Freeze', elem: 'Ice', turns: 1,
              baseDmg: sim.effAtk(u) * mult('march7th', 'ult_a2', lv.ult),
              sourceUnit: u,
            } as unknown as DoTWithSource)
            if (eid >= 1) {
              sim.gainEnergy(u, 6)
              sim.log('March E1: +6 Energy (freeze)')
            }
            sim.log('March A6: Freeze applied')
          }, 'Freeze (Glacial Cascade)', 'Freeze')
        }
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
      const noShield = allies.find(a => !sim.hasBuff(a, 'march_shield'))
      const ally = noShield ?? allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), allies[0])
    sim.markAlliedTarget(ally)
      const amount = Math.round(eff(u).def * mult('march7th', 'skill', lv.skill) + mult('march7th', 'skill_a2', lv.skill))
      // A2 Purify: dispels 1 debuff from the shielded ally
      const debuff = ally.buffs.find(b => isDebuff(b))
      if (debuff) {
        sim.removeBuff(ally, debuff.id)
        sim.log('March A2: dispelled 1 debuff')
      }
      sim.removeBuff(ally, 'march_shield')
      sim.addBuff(ally, {
        id: 'march_shield', name: 'March 7th, the Apex Heroine',
        mods: ally.hp / ally.maxHp >= 0.3 ? [{ stat: 'aggro', value: 150 }] : [],
        // A4 Reinforce: shield duration extended by 1 turn (canon 3t + 1)
        turns: 4, sourceId: u.id, shield: amount,
      })
      sim.log(`${ally.name} gains Shield ${amount} (The Power of Cuteness)`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('march7th', 'basic', lv.basic), toughDmg: 10, label: 'Frigid Cold Arrow' })
  },

  // Talent Girl Power: a Shielded ally is attacked → immediately Counter (2/turn)
  onAllyHit(sim, attacker, target, _dmg, ctx) {
    if (attacker.side !== 'enemy') return
    const march = findMarch(sim)
    if (!march) return
    if (!sim.hasBuff(target, 'march_shield')) return
    const eid = (ctx.eidolon as number) ?? 0
    const limit = 2 + (eid >= 4 ? 1 : 0)
    if (((ctx.counterUses as number) ?? 0) >= limit) return
    ctx.counterUses = ((ctx.counterUses as number) ?? 0) + 1
    const lv = levelsOf(ctx)
    const flat = eid >= 4 ? eff(march).def * 0.3 : 0
    sim.gainEnergy(march, 10)
    sim.log(`March Talent: Girl Power (counter +10 Energy)`)
    sim.hit(march, attacker, {
      type: 'fua', mult: mult('march7th', 'talent', lv.talent), flat,
      toughDmg: 10, label: 'Girl Power (Counter)',
    })
  },

  // Ultimate: Frozen enemies take Ice Additional DMG at the start of each turn
  onFrozenTurn(sim, u, ctx) {
    const frozen = u.dots.find(d => d.kind === 'Freeze') as DoTWithSource | undefined
    if (!frozen?.sourceUnit || frozen.sourceUnit.kitId !== 'march7th') return
    if (!(frozen.baseDmg > 0)) return
    sim.hit(frozen.sourceUnit, u, { type: 'dot', statValue: frozen.baseDmg * (frozen.stacks ?? 1), mult: 1, canCrit: false, defIgnore: frozen.defIgnore, label: 'Frozen Additional DMG', noSeq: true })
  },
}

// ===== fuxuan  (was fuxuan.ts) =====
function levelsOf_fuxuan(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

// Talent HP Restore: when Fu Xuan's HP falls to ≤50% Max HP, restore #3% of missing HP (max 2 charges, not on killing blow)
function maybeHeal(sim: any, u: any, ctx: any) {
  const charges = (ctx.talentCharges as number) ?? 0
  if (charges <= 0 || u.hp <= 0) return
  const lv = levelsOf_fuxuan(ctx)
  ctx.talentCharges = charges - 1
  const heal = Math.round((u.maxHp - u.hp) * mult('fuxuan', 'talent_a2', lv.talent))
  sim.heal(u, heal)
  sim.log(`Fu Xuan Talent: HP Restore +${heal} (${ctx.talentCharges} charges left)`)
}

export const fuxuanKit: KitDef = {
  id: 'fuxuan',
  name: 'Fu Xuan',
  elem: 'Quantum',
  energyMax: 135,
  base: { ...PROG.fuxuan.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Preservation' },
  // #120307 "Of Fortune Comes Fate" (Technique): auto-activate Matrix of Prescience at battle start (2 turns).
  technique: {
    name: 'Of Fortune Comes Fate',
    kind: 'buff',
    apply(sim, u, _ctx) {
      sim.addBuff(u, { id: 'fx_matrix', name: 'Matrix of Prescience', mods: [], turns: 2 })
      sim.log('Fu Xuan Technique: Matrix of Prescience active (2 turns)')
    },
  },
  onStart(sim, u, ctx) {
    ctx.talentCharges = 1
    ctx.e2Used = false
    ctx.hpLossTotal = 0
    // Talent passive: Misfortune Avoidance — whole team takes less DMG while Fu Xuan is alive
    const lv = levelsOf_fuxuan(ctx)
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      sim.addBuff(a, {
        id: 'fx_ma', name: 'Bleak Breeds Bliss',
        mods: [{ stat: 'mitigation', value: mult('fuxuan', 'talent', lv.talent) }], turns: Infinity,
      })
    }
  },
  decide(sim, u, _ctx) {
    if (!sim.hasBuff(u, 'fx_matrix') && sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf_fuxuan(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.hitAoe(u, {
        type: 'ult', scaleStat: 'hp', mult: mult('fuxuan', 'ult', lv.ult),
        toughDmg: 15, label: 'Woes of Many Morphed to One',
      })
      sim.log('Woes of Many Morphed to One (energy +5)')
      // A4 Dunjia: heals all other allies by 5% of Fu Xuan Max HP + 133
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead || a === u) continue
        sim.heal(a, Math.round(u.maxHp * 0.05) + 133)
      }
      sim.log('Fu Xuan Ult: Dunjia heals allies')
      ctx.talentCharges = Math.min(2, ((ctx.talentCharges as number) ?? 1) + 1)
      // E6: +200% of tally of team HP lost (cap 120% of Max HP), then tally resets
      if (eid >= 6 && ((ctx.hpLossTotal as number) ?? 0) > 0) {
        const tally = Math.min((ctx.hpLossTotal as number) ?? 0, u.maxHp * 1.2)
        sim.hitAoe(u, { type: 'ult', scaleStat: 'hp', flat: Math.round(2 * tally), canCrit: false, label: 'Omnia Vita' })
        ctx.hpLossTotal = 0
      }
      sim.log(`Fu Xuan Ult: talent charges ${ctx.talentCharges}/2`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // A2: +20 extra Energy if Matrix already active
      if (sim.hasBuff(u, 'fx_matrix')) {
        sim.gainEnergy(u, 20)
        sim.log('Fu Xuan A2: +20 extra Energy')
      }
      // Matrix of Prescience: allies distribute 65% of incoming DMG to Fu Xuan, 3 turns
      sim.addBuff(u, { id: 'fx_matrix', name: 'Matrix of Prescience', mods: [], turns: 3 })
      // Knowledge: MaxHP +#% of Fu Xuan Max HP (applied once per application), CRIT Rate +#
      const kHp = Math.round(u.maxHp * mult('fuxuan', 'skill_a2', lv.skill))
      const kCrit = mult('fuxuan', 'skill_a3', lv.skill)
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        const fresh = !sim.hasBuff(a, 'fx_knowledge')
        const mods: Mod[] = [{ stat: 'critRate', value: kCrit }, { stat: 'hpFlat', value: kHp }]
        if (eid >= 1) mods.push({ stat: 'critDmg', value: 0.3 })
        sim.addBuff(a, { id: 'fx_knowledge', name: 'Woes of Many Morphed to One', mods, turns: 3, payload: kHp })
        if (fresh) a.hp += kHp // Knowledge also raises current HP on first application
        eff(a) // recompute maxHp so the hpFlat boost is live (StatResolver owns the value)
      }
      sim.log(`Fu Xuan Skill: Matrix + Knowledge (MaxHP+${kHp}, CRIT rate +${kCrit})`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', scaleStat: 'hp', mult: mult('fuxuan', 'basic', lv.basic), toughDmg: 10, label: 'Novaburst' })
  },

  // Talent: HP Restore when Fu Xuan falls to ≤50% HP (also covered at hit-time in onAllyHit)
  onTurnStart(sim, u, ctx) {
    if (u.hp <= u.maxHp * 0.5) maybeHeal(sim, u, ctx)
  },

  onAllyHit(sim, attacker, target, dmg, ctx) {
    const u = sim.allies('ally').find(x => x.kitId === 'fuxuan' && !x.dead)
    if (!u) return
    const eid = (ctx.eidolon as number) ?? 0
    const matrix = sim.hasBuff(u, 'fx_matrix')
    // E2: killing blow on an ally under Matrix instead restores 70% Max HP (once per battle)
    if (eid >= 2 && !ctx.e2Used && matrix && target.kind === 'char' && target.hp <= 0) {
      ctx.e2Used = true
      sim.revive(target, Math.round(target.maxHp * 0.7), u)
      sim.log(`Fu Xuan E2: ${target.name} saved at 70% HP`)
      return
    }
    if (target.kind !== 'char' || target.hp <= 0) return
    // E6 tally: total HP lost by all team members (incl. Fu Xuan's own hits)
    if (eid >= 6) { ctx.hpLossTotal = ((ctx.hpLossTotal as number) ?? 0) + dmg; sim.log('Fu Xuan E6 tally +DMG') }
    // Talent HP Restore triggers the moment Fu Xuan's HP falls to ≤50% (not only on her turn)
    if (target === u) {
      if (matrix && u.hp <= u.maxHp * 0.5) maybeHeal(sim, u, ctx)
      return
    }
    // redistribute 65% of the damage to Fu Xuan — the ally keeps only 35%
    if (!matrix) return
    const transfer = Math.round(dmg * 0.65)
    if (transfer <= 0) return
    sim.hpChange(target, transfer, 'heal')
    sim.hpChange(u, -transfer, 'redirect')
    sim.fireAllyHpLoss(u, transfer)
    sim.log(`Fu Xuan redirects ${transfer} DMG from ${target.name}`)
    if (eid >= 4) sim.gainEnergy(u, 5) // E4: +5 Energy per ally hit under Matrix
    if (eid >= 4) sim.log('Fu Xuan E4: +5 Energy')
    if (u.hp <= 0) sim.kill(attacker, u)
    // recalc: Fu Xuan took the transfer, so re-check the ≤50% restore
    if (u.hp <= u.maxHp * 0.5) maybeHeal(sim, u, ctx)
  },
  // Knowledge's Max HP is carried by its hpFlat mod; drop the current-HP grant and clamp when it ends
  onBuffExpire(sim, target, b, _ctx) {
    if (b.id !== 'fx_knowledge') return
    const k = b.payload ?? 0
    eff(target) // buff still present here: maxHp includes the boost
    target.hp = Math.min(target.hp, Math.max(1, target.maxHp - k))
  },
}

// ===== gepard  (was gepard.ts) =====
interface DoTWithSource_gepard extends NonNullable<Unit['dots'][number]> {
  sourceUnit?: Unit
}

function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

export const gepardKit: KitDef = {
  id: 'gepard',
  name: 'Gepard',
  elem: 'Ice',
  energyMax: 100,
  base: { ...PROG.gepard.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Preservation' },
  // 110407 "Comradery": at battle start, a Shield on all allies absorbing 24% of Gepard's DEF
  // +150 for 2 turns (reuses the ult's shield record shape; separate id so it stacks alongside).
  technique: {
    name: 'Comradery',
    kind: 'buff',
    apply(sim, u) {
      const shieldVal = Math.floor(sim.effDef(u) * 0.24 + 150)
      for (const a of sim.allies('ally')) {
        if (a.dead) continue
        sim.addBuff(a, { id: 'gepard_tech_shield', name: 'Comradery', mods: [], turns: 2, shield: shieldVal, sourceId: u.id })
      }
    },
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const shieldPct = mult('gepard', 'ult', lv.ult)
      const shieldFlat = mult('gepard', 'ult_a3', lv.ult)
      const shieldVal = Math.floor(sim.effDef(u) * shieldPct + shieldFlat)
      for (const a of sim.allies('ally')) {
        if (a.dead) continue
        sim.addBuff(a, { id: 'gepard_shield', name: 'Enduring Bulwark', mods: [], turns: mult('gepard', 'ult_a2', lv.ult), shield: shieldVal })
      }
      sim.log(`Gepard Ult: Shield ${shieldVal} to all allies`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const baseChance = mult('gepard', 'skill_a2', lv.skill) + (eid(ctx) >= 1 ? 0.35 : 0)
      const t = manualTarget(sim, action, enemies[0])
      sim.hit(u, t, { type: 'skill', mult: mult('gepard', 'skill', lv.skill), elem: 'Ice', toughDmg: 20, label: 'Daunting Smite', split: [0.15, 0.35, 0.5] })
      if (!t.dead) {
        sim.applyDebuff(u, t, baseChance, () => {
          sim.applyDot(t, {
            kind: 'Freeze', elem: 'Ice', turns: 1,
            baseDmg: sim.effAtk(u) * mult('gepard', 'skill_a4', lv.skill),
            sourceUnit: u,
          } as unknown as DoTWithSource_gepard)
        }, 'Freeze', 'Freeze')
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('gepard', 'basic', lv.basic), elem: 'Ice', toughDmg: 10, label: 'Fist of Conviction', split: [0.5, 0.5] })
  },

  onStart(sim, u, ctx) {
    if (eid(ctx) >= 4) {
      for (const a of sim.allies('ally')) {
        sim.addBuff(a, { id: 'gepard_e4', name: 'Faith Moves Mountains', mods: [{ stat: 'effRes', value: 0.2 }], turns: 999 })
      }
    }
    ctx.gepard_revived = false
  },

  onTurnStart(sim, u) {
    // A2 Grit: ATK +35% of current DEF, refreshes each turn
    sim.addBuff(u, { id: 'gepard_a2', name: 'Grit', mods: [{ stat: 'atkFlat', value: Math.floor(sim.effDef(u) * 0.35) }] })
  },

  // Frozen enemies take Gepard's Ice Additional DMG at their turn start; E2 lands on unfreeze
  onFrozenTurn(sim, target) {
    const frozen = target.dots.find(d => d.kind === 'Freeze') as DoTWithSource_gepard | undefined
    if (frozen?.sourceUnit?.kitId !== 'gepard') return
    if (frozen.turns <= 1 && eid(sim.rt(frozen.sourceUnit)) >= 2) {
      sim.addBuff(target, { id: 'gepard_e2', name: 'Lingering Cold SPD↓', mods: [{ stat: 'spdDown', value: 0.2 }], turns: 1, debuff: true })
      sim.log(`Gepard E2: ${target.name} unfrozen → SPD-20% (1 turn)`)
    }
    if (!(frozen.baseDmg > 0)) return
    sim.hit(frozen.sourceUnit, target, { type: 'dot', statValue: frozen.baseDmg * (frozen.stacks ?? 1), mult: 1, canCrit: false, defIgnore: frozen.defIgnore, label: 'Frozen Additional DMG', noSeq: true })
  },

  onAllyHit(sim, attacker, target, _dmg, ctx) {
    if (target.kitId !== 'gepard') return
    if (target.hp > 0) return
    if (ctx.gepard_revived) return
    const lv = levelsOf(ctx)
    const revivePct = mult('gepard', 'talent', lv.talent)
    sim.revive(target, Math.floor(target.maxHp * revivePct), target)
    ctx.gepard_revived = true
    // A1 Commander (always-on) + E6 extra heal + immediate action
    sim.gainEnergy(target, target.maxEnergy)
    sim.log(`Gepard revives with ${Math.round(revivePct * 100)}% HP!`)
    if (eid(ctx) >= 6) {
      sim.heal(target, Math.floor(target.maxHp * 0.5))
      sim.immediateTurn(target)
      sim.log('Gepard E6: immediately takes action + 50% MaxHP heal')
    }
  },
}


// ===== danhengperman  (was danhengperman.ts) =====
// Dan Heng • Permansor Terrae — Physical/Preservation. Bondmate + stacking team shields
// + Souldragon on a real AV timeline (initial SPD 165, canon Talent #5).

function dragon(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`sd_${u.id}`)
}

function shield(b: Unit): number {
  return b.buffs.map(x => x.shield ?? 0).reduce((a, s) => a + s, 0)
}

function lowestShieldAlly(sim: SimApi, u: Unit): Unit | undefined {
  const allies = sim.allies('ally').filter(a => !a.dead)
  if (!allies.length) return undefined
  return allies.reduce((m, a) => (shield(a) < shield(m) ? a : m), allies[0])
}

// Stacking shield with a cap — canon (Skill/Talent): DH's Shield can stack when received
// repeatedly, but not exceed 300% of the current Shield provided by Skill.
function grantShield(sim: SimApi, u: Unit, t: Unit, amount: number, turns: number, lv: ReturnType<typeof levelsOf>): void {
  if (amount <= 0) return
  const cap = 3 * (eff(u).atk * mult('danhengperman', 'skill', lv.skill) + mult('danhengperman', 'skill_a2', lv.skill))
  const id = `dh_shield_${t.id}`
  const ex = t.buffs.find(b => b.id === id)
  if (ex) {
    ex.shield = Math.min(cap, (ex.shield ?? 0) + amount)
    ex.turns = Math.max(ex.turns ?? 0, turns)
    return
  }
  sim.addBuff(t, { id, name: 'Cloudlancer Art: Torrent', mods: [], shield: Math.min(cap, Math.round(amount)), sourceId: u.id, turns } as never)
}

// designation helper: "Bondmate" only applies to the most recent target of Skill.
// Strips old-target buffers (A0 atk, E4 mitigation, E6 defIgnore) before re-designating.
function designateBondmate(sim: SimApi, u: Unit, ctx: KitRuntime, bond: Unit): void {
  const rt = sim.rt(u)
  const prev = sim.find((rt.dhBondmate as string) ?? '')
  if (prev && prev.id !== bond.id) {
    sim.removeBuff(prev, 'dh_a0')
    sim.removeBuff(prev, 'dh_e4')
    sim.removeBuff(prev, 'dh_e6_def')
  }
  rt.dhBondmate = bond.id
  const eid = (ctx.eidolon as number) ?? 0
  // A0 Empyreanity: Bondmate ATK +15% of DH ATK
  sim.addBuff(bond, { id: 'dh_a0', name: 'Hidden Dragon', mods: [{ stat: 'atkFlat', value: eff(u).atk * 0.15 }], turns: Infinity } as never)
  // E4 By Oath: Bondmate takes 20% less DMG
  if (eid >= 4) sim.addBuff(bond, { id: 'dh_e4', name: 'By Oath, This Vessel Is I', mods: [{ stat: 'mitigation', value: 0.20 }], turns: Infinity } as never)
  // E6 One Dream: Bondmate on field → all enemies +20% DMG taken + Bondmate ignores 12% DEF
  if (eid >= 6) {
    sim.addBuff(bond, { id: 'dh_e6_def', name: 'Enfold All Wilds', mods: [{ stat: 'defIgnore', value: 0.12 }], turns: Infinity } as never)
    for (const e of sim.allies('enemy')) {
      sim.addBuff(e, { id: 'dh_e6_vuln', name: 'Enfold All Wilds', mods: [{ stat: 'vulnAll', value: 0.20 }], turns: Infinity } as never)
    }
  }
}

function summonDragon(sim: SimApi, u: Unit): Unit | undefined {
  if (dragon(sim, u)) return dragon(sim, u)
  const d: Unit = {
    id: `sd_${u.id}`, name: 'Souldragon', side: 'ally', kind: 'summon', elem: 'Imaginary',
    sharesOwnerBuffs: true,
    // canon Talent #5: Souldragon has an initial SPD of 165 → its own AV timeline. Summon.md:
    // "they use the current stats of their characters" — DH's base + DH's buffs (merged per
    // hit), no HP of its own.
    base: { ...u.base, hp: 1, spd: 165 },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
  sim.rt(d).ownerId = u.id
    sim.registerUnit(d)
  sim.log(`${u.name} summons Souldragon for the Bondmate`)
  return d
}

// Souldragon turn (dispatched via onSummonTurn on the dragon's own AV): dispel 1 debuff
// from all allies + team shield (enhanced: dragon FUA by DH + Bondmate Additional DMG).
function dragonAct(sim: SimApi, d: Unit, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  // the dragon shares DH's buffs + stats through the per-hit merge — nothing to refresh here
  // Souldragon disappears when Dan Heng or the Bondmate is knocked down
  const bond = sim.find((rt.dhBondmate as string) ?? '')
  if (u.dead || !bond || bond.dead) {
    sim.unregisterUnit(d.id)
    sim.log(`${d.name} disappears (owner/Bondmate down)`)
    return
  }
  // dispel 1 debuff from all allies (canon Talent #6)
  for (const a of sim.allies('ally')) {
    const deb = a.buffs.find(b => b.sourceId !== 'gear' && b.id !== 'traces' && (b.mods ?? []).some(m => m.stat === 'defRed' || m.stat === 'vulnAll'))
    if (deb) sim.removeBuff(a, deb.id)
  }
  const enhanced = (rt.dhEnh as number) > 0
  // shield all allies (talent% of DH ATK + flat); E2 doubles the shield provided in this instance
  let sdShield = eff(u).atk * mult('danhengperman', 'talent', lv.talent) + mult('danhengperman', 'talent_a2', lv.talent)
  if (enhanced && eid >= 2) sdShield *= 2
  for (const a of sim.allies('ally')) if (a.kind !== 'summon') grantShield(sim, u, a, sdShield, mult('danhengperman', 'talent_a3', 1), lv)
  // A6 Sublimity: extra shield 5% ATK + 100 to the lowest-shield ally (every dragon action)
  const ls = lowestShieldAlly(sim, u)
  if (ls) grantShield(sim, u, ls, eff(u).atk * 0.05 + 100, mult('danhengperman', 'talent_a3', 1), lv)
  if (enhanced) {
    // Enhanced FUA: landed BY THE SOULDRAGON (Phys, %DH ATK via the dragon's shared stats,
    // 4 hits 25% each, canon note). The Bondmate's Additional DMG below is dealt by the
    // Bondmate itself - its own element, dmg type 'add'.
    const fuaMul = mult('danhengperman', 'ult_a2', lv.ult)
    for (const e of sim.livingEnemiesOf(u)) {
      sim.hit(d, e, { type: 'fua', elem: 'Physical', mult: fuaMul, toughDmg: 5, split: [0.25, 0.25, 0.25, 0.25], label: 'Souldragon FUA' })
    }
    // Bondmate's Additional DMG to all enemies (ult_a5 % Bondmate ATK); E2 → ×200%
    let addMul = mult('danhengperman', 'ult_a5', lv.ult)
    if (eid >= 2) addMul *= 2
    for (const e of sim.livingEnemiesOf(u)) sim.hit(bond, e, { type: 'add', noSeq: true, flat: Math.round(eff(bond).atk * addMul), label: "Bondmate's DMG" })
    // A6 Sublimity (enhanced): 1 instance of Bondmate-type AD to the ONE enemy with the highest HP — 40% Bondmate ATK
    const foes = sim.livingEnemiesOf(u)
    if (foes.length) {
      const top = foes.reduce((m, e) => (e.hp > m.hp ? e : m), foes[0])
      sim.hit(bond, top, { type: 'add', noSeq: true, flat: Math.round(eff(bond).atk * 0.40), label: 'Sublimity DMG' })
    }
    sim.log(`${d.name} enhanced FUA + Bondmate DMG`)
    rt.dhEnh = (rt.dhEnh as number) - 1
  }
  sim.log(`${d.name} acts: shields all allies, dispels debuffs`)
}

/** Skill effect: designate Bondmate (highest-ATK ally), summon Souldragon, team shield. */
function danhengSkill(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  sim.gainEnergy(u, 30)
  const allies = sim.allies('ally').filter(a => a.kind === 'char' && a.id !== u.id && !a.dead)
  const bond = allies.length ? allies.reduce((m, a) => (eff(a).atk > eff(m).atk ? a : m), allies[0]) : u
  designateBondmate(sim, u, ctx, bond)
  summonDragon(sim, u)
  const skShield = eff(u).atk * mult('danhengperman', 'skill', lv.skill) + mult('danhengperman', 'skill_a2', lv.skill)
  for (const a of sim.allies('ally')) if (a.kind !== 'summon') grantShield(sim, u, a, skShield, 3, lv)
  sim.log(`${u.name} Skill: Bondmate ${bond.name}, team shield, summons Souldragon`)
}

export const danhengpermanKit: KitDef = {
  id: 'danhengperman',
  name: 'Dan Heng • Permansor Terrae',
  elem: 'Physical',
  energyMax: 135,
  base: { ...PROG.danhengperman.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Preservation' },
  onStart(sim, u) {
    // A2 Sylvanity: advance self by 40% at battle start
    sim.advance(u, 0.40)
    sim.log(`${u.name} A2: advances 40% at start`)
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
      // AoE Physical + team shield
      for (const e of enemies) sim.hit(u, e, { type: 'ult', elem: 'Physical', mult: mult('danhengperman', 'ult', lv.ult), toughDmg: 15, label: "A Dragon's Zenith" })
      const ulShield = eff(u).atk * mult('danhengperman', 'ult_a3', lv.ult) + mult('danhengperman', 'ult_a4', lv.ult)
      for (const a of sim.allies('ally')) if (a.kind !== 'summon') grantShield(sim, u, a, ulShield, 3, lv)
      // Enhance Souldragon: canon #3 — ult increases its actions by 2 (E2 adds +2 → 4)
      const d = summonDragon(sim, u)
      rt.dhEnh = 2 + (eid >= 2 ? 2 : 0)
      if (d && eid >= 2) { sim.advance(d, 1); sim.log('Souldragon advances 100% (E2)') }
      sim.log(`${u.name} Ultimate: AoE Physical, team shield, Souldragon enhanced`)
      // E1: +1 SP + Bondmate All-Type RES PEN 18%
      if (eid >= 1) {
        sim.gainSp(1)
        const bond = sim.find((rt.dhBondmate as string) ?? '')
        if (bond) sim.addBuff(bond, { id: 'dh_respen', name: 'The Higher You Fly, the Harder You Fall', mods: [{ stat: 'resPenAll', value: 0.18 }], turns: 3 } as never)
      }
      // E6: Bondmate deals 330% ATK Additional DMG to all enemies
      if (eid >= 6) {
        const bond = sim.find((rt.dhBondmate as string) ?? '')
        if (bond && !bond.dead) for (const e of enemies) sim.hit(bond, e, { type: 'add', noSeq: true, flat: Math.round(eff(bond).atk * 3.30), label: 'E6 Bondmate DMG' })
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      danhengSkill(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    sim.hit(u, t, { type: 'basic', elem: 'Physical', mult: mult('danhengperman', 'basic', lv.basic), toughDmg: 10, label: 'Aegis Vitae', split: [0.3, 0.7] })
  },

  technique: {
    name: 'Earthrend',
    kind: 'buff',
    apply(sim, u, ctx) {
      sim.log(`${u.name} Technique: auto-Skill on Bondmate (no SP)`)
      danhengSkill(sim, u, ctx)
    },
  },

  // Souldragon owns its action on its real AV timeline (initial SPD 165)
  onSummonTurn(sim, d, u, ctx) {
    dragonAct(sim, d, u, ctx)
  },
  // Souldragon disappears when Dan Heng is knocked down
  onUnitDeath(sim, u) {
    const d = dragon(sim, u)
    if (d) {
      sim.unregisterUnit(d.id)
      sim.log('Souldragon disappears (owner down)')
    }
  },
  // A2 Sylvanity: Bondmate attack → DH +6 Energy AND Souldragon advances 15%
  onAfterAttack(sim, attacker, _target, _dmgType, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'danhengperman' && !a.dead)
    if (!u) return
    const rt = sim.rt(u)
    if (attacker.id !== (rt.dhBondmate as string)) return
    sim.gainEnergy(u, 6)
    const d = dragon(sim, u)
    if (d) sim.advance(d, 0.15)
  },
}

// ===== aventurine  (was aventurine.ts) =====
/** Talent: Blind Bet is capped at 10 points; 7 points are consumed to launch the FUA. */
const BLIND_BET_CAP = 10
const BLIND_BET_THRESHOLD = 7
/** A3 Bingo!: FW shield = 7% DEF + 96; teammate-FUA trigger cap 3 per turn. */
const BINGO_DEF = 0.07
const BINGO_FLAT = 96
const BINGO_MAX = 3
/** the 6 crit-eligible damage types (Unnerved CRIT-DMG-taken, same lane as gear.ts) */
const CRIT_TYPES: DmgType[] = ['basic', 'skill', 'ult', 'fua', 'add', 'elation']

/** DEF-scaled base: flat = Aventurine's DEF × fraction. */
function defBase(sim: SimApi, u: Unit, frac: number): number {
  return eff(u).def * frac
}

/** Fortified Wager shield value = %Aventurine DEF + flat. */
function shieldValue(sim: SimApi, u: Unit, ctx: KitRuntime): number {
  const lv = levelsOf(ctx)
  return Math.round(defBase(sim, u, mult('aventurine', 'skill', lv.skill)) + mult('aventurine', 'skill_a2', lv.skill))
}

function findAv(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'aventurine' && !a.dead)
}

function hasShield(u: Unit): boolean {
  return u.buffs.some(b => (b.shield ?? 0) > 0)
}

function fwOf(u: Unit): number {
  return u.buffs.find(b => b.id === 'fort_wager')?.shield ?? 0
}

/** Grant/add Fortified Wager to one ally; re-grants stack the shield up to 200% of the Skill shield (canon). */
function addFw(sim: SimApi, u: Unit, ctx: KitRuntime, ally: Unit, val: number): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const turns = mult('aventurine', 'skill_a3', lv.skill)
  const ex = ally.buffs.find(b => b.id === 'fort_wager')
  if (ex) {
    const amp = 1 + sim.shieldMultOf(u.id)
    ex.shield = Math.min(Math.round(2 * shieldValue(sim, u, ctx) * amp), (ex.shield ?? 0) + Math.round(val * amp))
    ex.turns = turns
    return
  }
  sim.addBuff(ally, {
    id: 'fort_wager', name: 'Fortified Wager',
    mods: [{ stat: 'effRes', value: mult('aventurine', 'talent_a4', lv.talent) }],
    shield: val, sourceId: u.id, turns, maxStacks: 2,
  })
  if (eid >= 1) sim.addBuff(ally, { id: 'av_e1', name: "Prisoner's Dilemma", mods: [{ stat: 'critDmg', value: 0.20 }] })
}

function grantShield_aventurine(sim: SimApi, u: Unit, ctx: KitRuntime, label: string): void {
  const val = shieldValue(sim, u, ctx)
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char') continue
    addFw(sim, u, ctx, a, val)
  }
  sim.log(`${u.name}: ${label} Fortified Wager (${val}) to all allies`)
}

/** A3 Bingo!: after the Talent FUA, FW (7% DEF + 96) to all allies + a second copy to the lowest-shield one. */
function bingoShield(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const val = Math.round(defBase(sim, u, BINGO_DEF) + BINGO_FLAT)
  const chars = sim.allies(u.side).filter(a => a.kind === 'char')
  const lowest = chars.slice().sort((a, b) => fwOf(a) - fwOf(b))[0]
  for (const a of chars) addFw(sim, u, ctx, a, val)
  if (lowest) addFw(sim, u, ctx, lowest, val)
  sim.log(`Aventurine A3 Bingo!: FW (${val}) to all allies (+${val} to lowest)`)
}

function addBlindBet(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u) as { blindBet?: number }
  const before = rt.blindBet ?? 0
  rt.blindBet = Math.min(BLIND_BET_CAP, before + n)
  if (rt.blindBet < BLIND_BET_THRESHOLD) return
  // E4: FUA first raises DEF +40% (2 turns) and adds 3 more hits (ranks#4)
  if (eid >= 4) {
    sim.addBuff(u, { id: 'av_e4', name: 'Unexpected Hanging Paradox', mods: [{ stat: 'defPct', value: 0.40 }], turns: 2 })
    sim.log('Aventurine E4: FUA DEF+40%')
  }
  rt.blindBet -= BLIND_BET_THRESHOLD
  const hits = mult('aventurine', 'talent_a2', lv.talent) + (eid >= 4 ? 3 : 0)
  sim.hitRandom(u, hits, { type: 'fua', elem: 'Imaginary', flat: defBase(sim, u, mult('aventurine', 'talent_a3', lv.talent)), toughDmg: 10 / 3, label: "Roulette Shark FUA" })
  sim.log(`Aventurine: Blind Bet ${BLIND_BET_THRESHOLD} → FUA ×${hits}`)
  bingoShield(sim, u, ctx)
}

export const aventurineKit: KitDef = {
  id: 'aventurine',
  name: 'Aventurine',
  elem: 'Imaginary',
  energyMax: 110,
  base: { ...PROG.aventurine.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  onStart(sim, u, ctx) {
    const lv = levelsOf(ctx)
    ;(sim.rt(u) as { blindBet?: number }).blindBet = 0
    // Technique The Red or the Black: DEF+24/36/60% to all allies 3t (odds 30/60/10%)
    const r = sim.rng()
    const tDef = r < 0.30 ? mult('aventurine', 'technique', lv.talent)
      : r < 0.90 ? mult('aventurine', 'technique_a2', lv.talent)
      : mult('aventurine', 'technique_a3', lv.talent)
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char') continue
      sim.addBuff(a, { id: 'av_tech', name: 'The Red or the Black', mods: [{ stat: 'defPct', value: tDef }], turns: mult('aventurine', 'technique_a4', lv.talent) })
    }
    sim.log(`Aventurine Technique: DEF+${Math.round(tDef * 100)}% to all allies (3t)`)
    // A1: +2% CRIT per 100 DEF over 1600 (cap +48%)
    const over = Math.max(0, eff(u).def - 1600)
    const crit = Math.min(0.48, 0.02 * Math.floor(over / 100))
    if (crit > 0) sim.addBuff(u, { id: 'av_a1', name: 'Leverage', mods: [{ stat: 'critRate', value: crit }] })
    // A2: battle start → all allies Fortified Wager (100% of Skill)
    grantShield_aventurine(sim, u, ctx, 'A2 start:')
  },
  onTurnStart(sim, u, ctx) {
    ;(sim.rt(u) as { bingoCount?: number }).bingoCount = 0
    if (((ctx.eidolon as number) ?? 0) < 6) return
    // E6 Stag Hunt Game: +50% DMG per shielded ally, cap +150% (ranks#6), refreshed on his turn
    const shielded = sim.allies(u.side).filter(a => a.kind === 'char' && hasShield(a)).length
    sim.removeBuff(u, 'av_e6')
    const v = Math.min(1.5, 0.5 * shielded)
    if (v > 0) sim.addBuff(u, { id: 'av_e6', name: 'Stag Hunt Game', mods: [{ stat: 'dmgAll', value: v }] })
  },
  onAllyHit(sim, _attacker, target, _dmg, ctx) {
    // Talent: FW ally attacked → +1 Blind Bet; Aventurine additionally +1 when he himself is attacked
    if (target.dead || target.side !== 'ally' || target.kind !== 'char') return
    const av = findAv(sim)
    if (!av) return
    if (target.id !== av.id && !sim.hasBuff(target, 'fort_wager')) return
    const extra = target.id === av.id ? mult('aventurine', 'talent', levelsOf(ctx).talent) : 0
    addBlindBet(sim, av, ctx, 1 + extra)
  },
  onAfterAttack(sim, attacker, _target, dmgType, ctx) {
    // A3 Bingo!: FW teammate launches a FUA → +1 Blind Bet (max 3 per turn, reset on Aventurine's turn)
    if (dmgType !== 'fua' || attacker.side !== 'ally') return
    if (attacker.kind !== 'char' && attacker.kind !== 'summon' && attacker.kind !== 'transformed') return
    const av = findAv(sim)
    if (!av || attacker.id === av.id) return
    if (!sim.hasBuff(attacker, 'fort_wager')) return
    const rt = ctx as { bingoSeq?: number; bingoCount?: number }
    const seq = sim.attackNo()
    if (rt.bingoSeq === seq) return
    rt.bingoSeq = seq
    if ((rt.bingoCount ?? 0) >= BINGO_MAX) return
    rt.bingoCount = (rt.bingoCount ?? 0) + 1
    addBlindBet(sim, av, ctx, 1)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    if (sim.sp() >= 1 && !sim.hasBuff(u, 'fort_wager')) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Ult: Random 1-7 Blind Bet (may trigger the Talent FUA) + Unnerved (CRIT DMG taken +15%) + Imaginary DEF DMG
      const gain = 1 + sim.rngInt(7)
      addBlindBet(sim, u, ctx, gain)
      const t = sim.livingEnemiesOf(u)[0]
      if (t) {
        const cd = mult('aventurine', 'ult_a3', lv.ult)
        const mods = CRIT_TYPES.map(ty => ({ stat: `critDmgTaken:${ty}` as StatKey, value: cd }))
        sim.addBuff(t, { id: 'unnerved', name: 'Unnerved CRIT DMG taken+', mods, debuff: true, turns: mult('aventurine', 'ult_a4', lv.ult) })
        sim.hit(u, t, { type: 'ult', elem: 'Imaginary', flat: defBase(sim, u, mult('aventurine', 'ult_a2', lv.ult)), toughDmg: 30, label: 'Roulette Shark' })
        sim.log(`${u.name} Ult: +${gain} Blind Bet, Unnerved + CRIT DMG`)
      }
      // E1: ult also grants FW shield
      if (eid >= 1) grantShield_aventurine(sim, u, ctx, 'E1 ult:')
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      grantShield_aventurine(sim, u, ctx, 'Skill:')
      sim.gainEnergy(u, 30)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = sim.livingEnemiesOf(u)[0]
    if (t) {
      sim.hit(u, t, { type: 'basic', elem: 'Imaginary', flat: defBase(sim, u, mult('aventurine', 'basic', lv.basic)), toughDmg: 10, label: 'Straight Bet' })
      // E2: basic reduces target All-RES by 12%
      if (eid >= 2) sim.addBuff(t, { id: 'av_e2', name: 'Bounded Rationality All-RES↓', mods: [{ stat: 'resAll', value: -0.12 }], debuff: true, turns: 3 })
    }
  },
}


// ===== trailblazer_preservation  (was trailblazer_preservation.ts) =====
const MW_MAX = 8

function shieldVal(u: Unit, lv: { talent: number }, eid: number): number {
  return Math.floor(effDef(u) * mult('trailblazer_preservation', 'talent', lv.talent) + mult('trailblazer_preservation', 'talent_a4', lv.talent) + (eid >= 2 ? effDef(u) * 0.02 + 27 : 0))
}

function effDef(u: Unit): number {
  const base = u.base.def
  let pct = 0, flat = 0
  for (const b of u.buffs) {
    for (const m of b.mods) {
      if (m.stat === 'defPct') pct += m.value
      else if (m.stat === 'defFlat') flat += m.value
    }
  }
  return base * (1 + pct) + flat
}

function applyShield(sim: SimApi, u: Unit, lv: { talent: number }, eid: number) {
  const val = shieldVal(u, lv, eid)
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    sim.addBuff(a, { id: 'tb_pres_shield', name: 'Treasure of the Architects', mods: [], turns: mult('trailblazer_preservation', 'talent_a2', lv.talent), shield: val, sourceId: u.id })
  }
}

function addMagmaWill(sim: SimApi, u: Unit, n: number) {
  const rt = sim.rt(u)
  rt.mw = Math.min(MW_MAX, ((rt.mw as number) ?? 0) + n)
}

export const trailblazerPreservationKit: KitDef = {
  id: 'trailblazer_preservation',
  name: '{NICKNAME}',
  elem: 'Fire',
  energyMax: 120,
  base: { ...PROG.trailblazer_preservation.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Preservation' },
  // 800307 "Call of the Guardian": self Shield absorbing 30% of DEF + 384 for 1 turn.
  technique: {
    name: 'Call of the Guardian',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'tb_pres_tech_shield', name: 'Call of the Guardian', mods: [], turns: 1, shield: Math.floor(effDef(u) * 0.3 + 384), sourceId: u.id })
    },
  },

  onStart(sim, u, ctx) {
    if (((ctx.eidolon as number) ?? 0) >= 4) addMagmaWill(sim, u, 4)
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
    const mw = (rt.mw as number) ?? 0
    const useEnhanced = (rt.tbPresFreeEnhanced as boolean) || mw >= 4
    const freeEnhanced = (rt.tbPresFreeEnhanced as boolean)
    rt.tbPresFreeEnhanced = false

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // AoE: ATK×ult + DEF×ult_a2
      const flatDef = Math.round(effDef(u) * mult('trailblazer_preservation', 'ult_a2', lv.ult))
      for (const e of enemies) {
        sim.hit(u, e, { type: 'ult', elem: 'Fire', mult: mult('trailblazer_preservation', 'ult', lv.ult), flat: flatDef, toughDmg: 30, label: 'War-Flaming Lance' })
      }
      // E6: ult → DEF+10% stack 3
      if (eid >= 6) sim.addBuff(u, { id: 'tb_pres_e6', name: 'City-Forging Bulwarks', mods: [{ stat: 'defPct', value: 0.10 }], turns: Infinity, maxStacks: 3 })
      applyShield(sim, u, lv, eid)
      rt.tbPresFreeEnhanced = true // next basic auto-enhanced free
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      addMagmaWill(sim, u, 1)
      // DMG reduction self (mitigation 40%)
      sim.addBuff(u, { id: 'tb_pres_skill', name: 'Ever-Burning Amber', mods: [{ stat: 'mitigation', value: 0.40 }], turns: 1 })
      // The Strong Defend the Weak: all allies DMG taken -15% 1t
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'tb_pres_sdw', name: 'Strong Defend the Weak', mods: [{ stat: 'mitigation', value: 0.15 }], turns: 1 })
      }
      applyShield(sim, u, lv, eid)
      // Ever-Burning Amber param#2 (100% base chance) / param#3 (1 turn): Taunt all enemies onto {NICKNAME}.
      // Direct forced-target mark, mirroring Mydei — no debuff roll, so the RNG stream is untouched.
      const tauntTurns = Math.round(mult('trailblazer_preservation', 'skill_a3', lv.skill))
      for (const e of enemies) sim.addTargetOverride(e, u, tauntTurns)
      return
    }

    // Basic (enhanced or normal)
    if (useEnhanced) {
      // Enhanced Basic consumes 4 Magma Will, except the one the Ultimate grants for free
      if (!freeEnhanced) rt.mw = mw - 4
      sim.gainEnergy(u, 20)
      // Blast: main + adj
      sim.hitBlast(u, t,
        { type: 'basic', elem: 'Fire', mult: mult('trailblazer_preservation', 'basic_en', lv.basic), toughDmg: 20, label: 'Ice-Breaking Light (enhanced main)' },
        { type: 'basic', elem: 'Fire', mult: mult('trailblazer_preservation', 'basic_en_a2', lv.basic), toughDmg: 10, label: 'Ice-Breaking Light (enhanced adj)' })
      // E1: enhanced basic +50% DEF fire (flat extra)
      if (eid >= 1) {
        const extraDef = Math.round(effDef(u) * 0.50)
        for (const e of sim.livingEnemiesOf(u)) sim.hit(u, e, { type: 'basic', elem: 'Fire', flat: extraDef, label: 'E1 Enhanced Bonus' })
      }
      // Unwavering Gallantry: heal 5% MaxHP
      sim.heal(u, Math.round(u.maxHp * 0.05))
      // E6: enhanced basic → DEF+10% stack 3
      if (eid >= 6) sim.addBuff(u, { id: 'tb_pres_e6', name: 'City-Forging Bulwarks', mods: [{ stat: 'defPct', value: 0.10 }], turns: Infinity, maxStacks: 3 })
      applyShield(sim, u, lv, eid)
      return
    }

    // Normal Basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    addMagmaWill(sim, u, 1)
    sim.hit(u, t, { type: 'basic', elem: 'Fire', mult: mult('trailblazer_preservation', 'basic', lv.basic), toughDmg: 10, label: 'Ice-Breaking Light' })
    // E1: normal basic +25% DEF fire
    if (eid >= 1) {
      const extraDef = Math.round(effDef(u) * 0.25)
      sim.hit(u, t, { type: 'basic', elem: 'Fire', flat: extraDef, label: 'E1 Basic Bonus' })
    }
    applyShield(sim, u, lv, eid)
  },

  // Talent: when hit → +1 Magma Will (max 8)
  onAllyHit(sim, attacker, target, _dmg, _ctx) {
    if (target.kitId !== 'trailblazer_preservation') return
    if (attacker.side !== 'enemy') return
    addMagmaWill(sim, target, 1)
  },

  // Action Beats Overthinking: turn start if shielded → ATK+15% +5 EN
  onTurnStart(sim, u, _ctx) {
    if (u.kitId !== 'trailblazer_preservation') return
    if (u.buffs.some(b => (b.shield ?? 0) > 0)) {
      sim.addBuff(u, { id: 'tb_pres_abt', name: 'Action Beats Overthinking', mods: [{ stat: 'atkPct', value: 0.15 }], turns: 1 })
      sim.gainEnergy(u, 5)
    }
  },
}

