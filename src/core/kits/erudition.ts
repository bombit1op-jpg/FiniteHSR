// Kits of the Erudition path, merged from the former per-character modules (12 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, type KitDef, type SimApi, type KitRuntime, type HitOpts } from '../kit'
import type { Unit, AbilityLevels, Elem } from '../entities/Unit'
import { lowestHpEnemy } from './hunt'
import { mult, PROG } from '../progression'
import { type DoTWithSource } from '../simulator'
import { mainDpsOf } from '../autoai'
import { computeBreakDamage } from '../combat/DamageCalculator'

// ===== jingyuan  (was jingyuan.ts) =====
export const jingyuanKit: KitDef = {
  id: 'jingyuan',
  name: 'Jing Yuan',
  elem: 'Lightning',
  energyMax: 130,
  base: { level: 80, hp: 1164, atk: 698, def: 485, spd: 99, critRate: 0.05, critDmg: 0.5 },
  // #130806 "Spiritus Invocation" (Technique): Lightning-Lord +3 Hits Per Action in its first turn.
  technique: {
    name: 'Spiritus Invocation',
    kind: 'buff',
    apply(sim, u) {
      const ll = sim.find(`ll_${u.id}`)
      if (ll) (sim.rt(ll) as Record<string, unknown>).techHits = 3
    },
  },
  onStart(sim, u, ctx) {
    const lv = levelsOf(ctx)
    // A4 Savant Providence: +15 Energy at battle start
    u.energy = Math.min(u.maxEnergy, u.energy + 15)
    const ll: Unit = {
      id: `ll_${u.id}`, name: 'Lightning-Lord', side: 'ally', kind: 'summon', elem: 'Lightning',
      sharesOwnerBuffs: true,
      // Summon.md: "they use the current stats of their characters" — same base (so Jing Yuan's
      // buffs land on it through the shared-buff merge), own fixed SPD 60, and no HP of its own.
      base: { ...u.base, hp: 1, spd: 60 },
      hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
      buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
      weaknesses: [], res: {}, kitId: u.kitId,
    }
    ctx.ownerId = u.id
    const lrt = sim.rt(ll)
    lrt.ownerId = u.id
    lrt.baseHpa = 3
    lrt.baseSpd = 60
    lrt.hpa = 3
    lrt.mult = mult('jingyuan', 'talent', lv.talent)
    sim.registerUnit(ll)
    sim.log(`${u.name} summons Lightning-Lord`)
  },
  // Lightning-Lord's own turn: it acts once its AV reaches the front of the turn order. Its hits
  // land as the unit itself and it shares Jing Yuan's buffs + stats, so there is no snapshot to
  // refresh — the merge in hitDigit reads Jing Yuan's live buffs and base.
  onSummonTurn(sim, s, owner, ctx) {
    const lrt = sim.rt(s)
    const hpa = ((lrt.hpa as number) ?? 3) + ((lrt.techHits as number) ?? 0)
    lrt.techHits = 0
    const eid = (sim.rt(owner).eidolon as number) ?? 0
    sim.log(`-- ${s.name} acts (${hpa} hits)`)
    if (hpa >= 6) sim.addBuff(owner, { id: 'battalia', name: 'Battalia Crush', mods: [{ stat: 'critDmg', value: 0.25 }] })
    // E6: each LL hit → Vulnerable +12% (stacks up to 3x)
    if (eid >= 6) {
      for (const e of sim.livingEnemiesOf(owner))
        sim.addBuff(e, { id: 'jy_e6', name: 'Sweep, Souls Slain DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.12 }], turns: 1, maxStacks: 3 })
    }
    sim.hitRandom(s, hpa, {
      type: 'fua', mult: (lrt.mult as number) ?? 0.66,
      label: 'Lightning-Lord', toughDmg: 5,
    }, eid >= 1 ? 0.50 : 0.25) // E1: adjacent gets +25% of primary mult
    sim.removeBuff(owner, 'battalia')
    // E2: after LL, Jing Yuan B/S/U DMG +20% for 2 turns
    if (eid >= 2)
      sim.addBuff(owner, { id: 'jy_e2', name: 'Swing, Skies Squashed', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 2 })
    // E4: each LL hit → +2 Energy for Jing Yuan
    if (eid >= 4) sim.gainEnergy(owner, 2 * hpa)
    lrt.hpa = lrt.baseHpa ?? 3
    sim.setSpeedDynamic(s, (lrt.baseSpd as number) ?? 60)
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const ll = sim.find(`ll_${u.id}`)
    if (!ll) return
    const lv = levelsOf(ctx)
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('Lightbringer (energy +5)') // +5 from castUlt
      sim.hitAoe(u, { type: 'ult', mult: mult('jingyuan', 'ult', lv.ult), toughDmg: 20, label: 'Lightbringer' })
      addHpa(sim, ll, sim.rt(ll), 3)
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      sim.addBuff(u, { id: 'war_marshal', name: 'War Marshal', mods: [{ stat: 'critRate', value: 0.10 }], turns: 2 })
      sim.hitAoe(u, { type: 'skill', mult: mult('jingyuan', 'skill', lv.skill), toughDmg: 10, label: 'Rifting Zenith', split: [0.4, 0.3, 0.3] })
      addHpa(sim, ll, sim.rt(ll), 2)
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, lowestHpEnemy(sim, u)!, { type: 'basic', mult: mult('jingyuan', 'basic', lv.basic), toughDmg: 10, label: 'Glistening Light', split: [0.45, 0.55] })
  },
}

function addHpa(sim: SimApi, ll: Unit, ctx: Record<string, unknown>, n: number): void {
  const hpa = Math.min(10, ((ctx.hpa as number) ?? 3) + n)
  ctx.hpa = hpa
  const baseSpd = (ctx.baseSpd as number) ?? 60
  const spd = baseSpd + 10 * (hpa - ((ctx.baseHpa as number) ?? 3))
  sim.setSpeedDynamic(ll, spd)
}


// ===== himeko  (was himeko.ts) =====
const MAX_CHARGE = 3

const isBurning = (t: { dots: { kind: string }[] }): boolean => t.dots.some(d => d.kind === 'Burn')

// E2 Convergence: +15% DMG vs enemies at ≤50% HP (wraps a hit in a one-turn buff)
function uiWrap(sim: SimApi, u: Unit, t: Unit, eid: number, fn: () => void): void {
  if (eid >= 2 && t.hp / t.maxHp <= 0.5) sim.addBuff(u, { id: 'himeko_e2', name: 'Convergence', mods: [{ stat: 'dmgAll', value: 0.15 }], turns: 1 })
  fn()
  if (eid >= 2) sim.removeBuff(u, 'himeko_e2')
}

// A2 Starfire: 50% base chance to Burn for 2 turns (30% ATK Fire DoT) on attack
function applyBurn(sim: SimApi, u: Unit, t: Unit): void {
  sim.applyDebuff(u, t, 0.5, () => {
    sim.applyDot(t, {
      kind: 'Burn', elem: 'Fire', turns: 2,
      baseDmg: sim.effAtk(u) * 0.30, sourceUnit: u,
    } as unknown as DoTWithSource)
  }, 'Burn (Starfire)', 'Burn')
}

export const himekoKit: KitDef = {
  id: 'himeko',
  name: 'Himeko',
  elem: 'Fire',
  energyMax: 120,
  base: { ...PROG.himeko.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 100307 "Incomplete Combustion": enemies take +10% Fire DMG for 2 turns at battle start.
  technique: {
    name: 'Incomplete Combustion',
    kind: 'buff',
    apply(sim, u) {
      for (const e of sim.livingEnemiesOf(u))
        sim.addBuff(e, { id: 'himeko_tech_fire', name: 'Incomplete Combustion DMG Taken+', mods: [{ stat: 'vuln:Fire', value: 0.10 }], turns: 2, debuff: true })
    },
  },
  onStart(sim, u, ctx) {
    u.aggro = 75
    // Talent: 1 Charge at battle start
    ctx.charge = 1
    // A6 Benchmark: CRIT Rate+15% while HP ≥ 80%
    sim.addBuff(u, { id: 'himeko_a6', name: 'Benchmark', mods: [{ stat: 'critRate', value: 0.15 }] })
  },
  onAllyHit(sim, _attacker, target, _dmg, _ctx) {
    // A6: remove the CRIT buff when HP drops below 80%
    if (target.kind === 'char' && target.kitId === 'himeko' && target.hp / target.maxHp < 0.8)
      sim.removeBuff(target, 'himeko_a6')
  },
  // A6: re-apply the CRIT buff when healed back above 80%
  onAllyHeal(sim, target, _amount, _ctx) {
    if (target.kind !== 'char' || target.kitId !== 'himeko') return
    if (target.hp / target.maxHp >= 0.8 && !sim.hasBuff(target, 'himeko_a6'))
      sim.addBuff(target, { id: 'himeko_a6', name: 'Benchmark', mods: [{ stat: 'critRate', value: 0.15 }] })
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    const pattern = (ctx.skillPattern as string) ?? 'auto'
    if (pattern === 'rotation') return { kind: 'skill' }
    if (pattern === 'skill->basic') return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
    if (pattern === 'normal->skill->normal') {
      const ti = (sim.rt(u).turnIndex as number) ?? 0
      return { kind: (ti % 3 === 1 && sim.sp() >= 1) ? 'skill' : 'basic' }
    }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const ultMult = mult('himeko', 'ult', lv.ult)
      for (const e of [...sim.livingEnemiesOf(u)]) {
        uiWrap(sim, u, e, eid, () => sim.hit(u, e, { type: 'ult', mult: ultMult, toughDmg: 30, label: 'Heavenly Flare' }))
        applyBurn(sim, u, e)
      }
      // E6 Trailblaze!: 2 extra instances of Fire DMG = 40% of the original, to one random enemy
      if (eid >= 6) {
        for (let i = 0; i < 2; i++) {
          const list = sim.livingEnemiesOf(u)
          if (!list.length) break
          const r = sim.rngPick(list)
          sim.hit(u, r, { type: 'ult', mult: ultMult * 0.4, toughDmg: 0, label: 'Heavenly Flare (E6)' })
        }
      }
      // Ultimate: +ult_a2 Energy per enemy defeated
      sim.gainEnergy(u, mult('himeko', 'ult_a2', lv.ult) * (enemies.length - sim.livingEnemiesOf(u).length))
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      const main = mult('himeko', 'skill', lv.skill)
      const adj = mult('himeko', 'skill_a2', lv.skill)
      const wasBroken = new Map(sim.livingEnemiesOf(u).map(e => [e.id, e.broken]))
      for (const e of [...sim.livingEnemiesOf(u)]) {
        // A4 Magma: +20% vs each target's OWN Burn state (canon is per-target)
        const bonus = isBurning(e) ? 0.20 : 0
        const isMain = e === primary
        uiWrap(sim, u, e, eid, () => sim.hit(u, e, {
          type: 'skill', elem: 'Fire', mult: (isMain ? main : adj) + bonus,
          toughDmg: isMain ? 20 : 10,
          label: `${isMain ? 'Molten Detonation' : 'Molten Detonation (adj)'}${bonus ? ' (Burn)' : ''}`,
          split: isMain ? [0.2, 0.2, 0.05, 0.05, 0.05, 0.05, 0.4] : [0.2, 0.2, 0.6],
        }))
      }
      applyBurn(sim, u, primary)
      // E4: Skill inflicts Weakness Break on any target (main or adjacent) → +1 extra Charge
      if (eid >= 4 && sim.livingEnemiesOf(u).some(e => e.broken && !wasBroken.get(e.id))) {
        ctx.charge = Math.min(MAX_CHARGE, ((ctx.charge as number) ?? 0) + 1)
        sim.log('Himeko E4: +1 Charge (skill break)')
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('himeko', 'basic', lv.basic), toughDmg: 10, label: 'Sawblade Tuning', split: [0.4, 0.6] })
    applyBurn(sim, u, enemies[0])
  },

  // Talent Victory Rush: Weakness Break → +1 Charge (Elite/Boss → +3)
  onBreak(sim, _breaker, victim, ctx) {
    if (victim.side !== 'enemy') return
    const gain = victim.rank === 'elite' || victim.rank === 'boss' ? 3 : 1
    ctx.charge = Math.min(MAX_CHARGE, ((ctx.charge as number) ?? 0) + gain)
    if (gain > 1) sim.log(`Himeko: Elite/Boss break → +3 Charge`)
  },

  // Fully Charged → Follow-Up ATK after any ally attack
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.side !== 'ally' || attacker.kind !== 'char') return
    if (dmgType === 'fua' || dmgType === 'add') return
    if (((ctx.charge as number) ?? 0) < MAX_CHARGE) return
    const himeko = sim.allies('ally').find(u => u.kitId === 'himeko' && !u.dead)
    if (!himeko) return
    ctx.charge = 0
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 1) sim.addBuff(himeko, { id: 'himeko_e1', name: 'Childhood', mods: [{ stat: 'spdPct', value: 0.20 }], turns: 2 })
    for (const e of [...sim.livingEnemiesOf(himeko)]) {
      uiWrap(sim, himeko, e, eid, () => sim.hit(himeko, e, { type: 'fua', mult: mult('himeko', 'talent', levelsOf(ctx).talent), toughDmg: 15, label: 'Victory Rush', split: [0.2, 0.2, 0.2, 0.4] }))
      applyBurn(sim, himeko, e)
    }
    void target
  },
}

// ===== herta  (was herta.ts) =====
function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function fireTalent(sim: SimApi, herta: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const base = mult('herta', 'talent', lv.talent)
  sim.gainEnergy(herta, 5)
  sim.log(`${herta.name} Talent: Fine, I'll Do It Myself (energy +5)`)
  sim.hitAoe(herta, { type: 'fua', mult: base, elem: 'Ice', toughDmg: 10, label: "Fine, I'll Do It Myself!" })
  if (eid(ctx) >= 2) {
    const count = Math.min(5, ((ctx.herta_fuaCount as number) ?? 0) + 1)
    const crBonus = 0.03 * count
    sim.addBuff(herta, { id: 'herta_e2', name: 'Keep the Ball Rolling', mods: [{ stat: 'critRate', value: crBonus }], turns: 999 })
    ctx.herta_fuaCount = count
  }
  if (eid(ctx) >= 4) {
    sim.addBuff(herta, { id: 'herta_e4', name: 'That\'s the Kind of Girl I Am', mods: [{ stat: 'dmgAll', value: 0.1 }], turns: 1 })
  }
}

export const hertaKit: KitDef = {
  id: 'herta',
  name: 'Herta',
  elem: 'Ice',
  energyMax: 110,
  base: { ...PROG.herta.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 101307 "It Can Still Be Optimized": at battle start, self ATK +40% for 3 turns.
  technique: {
    name: 'It Can Still Be Optimized',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'herta_tech', name: 'It Can Still Be Optimized ATK↑', mods: [{ stat: 'atkPct', value: 0.4 }], turns: 3 })
    },
  },
  decide(sim, _u, ctx) {
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
      sim.hitAoe(u, { type: 'ult', mult: mult('herta', 'ult', lv.ult), elem: 'Ice', toughDmg: 20, label: "It's Magic, I Added Some Magic" })
      if (eid(ctx) >= 6) {
        sim.addBuff(u, { id: 'herta_e6', name: 'Cuss Big or Cuss Nothing', mods: [{ stat: 'atkPct', value: 0.25 }], turns: 1 })
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const threshold = mult('herta', 'skill_a2', lv.skill)
      const boostBase = mult('herta', 'skill_a3', lv.skill)
      const a4Boost = 0.25
      for (const e of sim.livingEnemiesOf(u)) {
        const hpFrac = e.hp / e.maxHp
        const boost = hpFrac >= threshold ? boostBase + a4Boost : 0
        sim.hit(u, e, { type: 'skill', mult: mult('herta', 'skill', lv.skill) + boost, elem: 'Ice', toughDmg: 20, label: 'One-Time Offer', split: [0.3, 0.7] })
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('herta', 'basic', lv.basic), elem: 'Ice', toughDmg: 10, label: 'What Are You Looking At?' })
    if (t.dead) return
    if (eid(ctx) >= 1 && t.hp / t.maxHp <= 0.5) {
      sim.hit(u, t, { type: 'add', noSeq: true, mult: 0.4, elem: 'Ice', toughDmg: 0, label: 'Herta E1 Additional' })
    }
  },

  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (target.side !== 'enemy' || target.dead) return
    if (attacker.side !== 'ally') return
    // Talent 101304 fires ONE Follow-Up per qualifying attack: the FUA's own hits (dmgType 'fua')
    // must not re-arm the Talent. The `herta_firing` boolean cannot survive the deferred trigger
    // queue (the nested FUA hit resolves after it is reset), so gate on the hit type instead.
    if (dmgType === 'fua') return
    if (target.hp / target.maxHp > 0.5) return
    if ((ctx.herta_firing as boolean)) return
    if (ctx.herta_fuaSeq === sim.attackNo()) return
    ctx.herta_fuaSeq = sim.attackNo()
    const herta = sim.allies('ally').find(u => u.kitId === 'herta' && !u.dead)
    if (herta) {
      ctx.herta_firing = true
      fireTalent(sim, herta, ctx)
      ctx.herta_firing = false
    }
  },
}


// ===== serval  (was serval.ts) =====
function eid_serval(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function applyShock(sim: SimApi, source: Unit, target: Unit, turns: number, lv: { skill: number }): void {
  const baseDmg = Math.floor(sim.effAtk(source) * mult('serval', 'skill_a3', lv.skill))
  sim.applyDot(target, { kind: 'Shock', elem: 'Lightning', baseDmg, turns })
}

function isShocked(t: Unit): boolean {
  return t.dots.some(d => d.kind === 'Shock')
}

// E6 "This Song Rocks to Heaven!": 30% more DMG against Shocked enemies — transient buff around the hit
function hitS(sim: SimApi, u: Unit, t: Unit, ctx: KitRuntime, o: { type: string; mult: number; elem: string; toughDmg: number; label: string; noSeq?: boolean }): number {
  if (eid_serval(ctx) >= 6 && isShocked(t)) {
    sim.addBuff(u, { id: 'serval_e6', name: 'This Song Rocks to Heaven!', mods: [{ stat: 'dmgAll', value: 0.3 }], turns: Infinity } as never)
  }
  const d = sim.hit(u, t, o as never)
  sim.removeBuff(u, 'serval_e6')
  return d
}

export const servalKit: KitDef = {
  id: 'serval',
  name: 'Serval',
  elem: 'Lightning',
  energyMax: 100,
  base: { ...PROG.serval.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 110307 "Good Night, Belobog": Lightning DMG 50% ATK to a random enemy + 100% base chance to
  // Shock all enemies for 3 turns. attack Technique.
  technique: {
    name: 'Good Night, Belobog',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hit(u, sim.rngPick(enemies), { type: 'basic', mult: 0.5, elem: 'Lightning', toughDmg: 10, label: 'Good Night, Belobog' })
      for (const e of sim.livingEnemiesOf(u)) sim.applyDebuff(u, e, 1.0, () => applyShock(sim, u, e, 3, lv), 'Shock', 'Shock')
    },
  },
  decide(sim, _u, ctx) {
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
      sim.log(`${u.name} Here Comes the Mechanical Fever (energy +5)`) // +5 from castUlt
      const preShocked = new Set(sim.livingEnemiesOf(u).filter(isShocked).map(e => e.id))
      if (eid_serval(ctx) >= 4) {
        for (const e of sim.livingEnemiesOf(u)) {
          if (!isShocked(e)) sim.applyDebuff(u, e, 1.0, () => applyShock(sim, u, e, 2, lv), 'Shock', 'Shock') // E4: 100% base chance
        }
      }
      for (const e of sim.livingEnemiesOf(u)) hitS(sim, u, e, ctx, { type: 'ult', mult: mult('serval', 'ult', lv.ult), elem: 'Lightning', toughDmg: 20, label: 'Voltage' })
      for (const e of sim.livingEnemiesOf(u)) {
        const shock = e.dots.find(d => d.kind === 'Shock')
        if (shock && preShocked.has(e.id)) shock.turns = Math.min(shock.turns + mult('serval', 'ult_a2', lv.ult), 999)
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hitBlast(u, primary,
        { type: 'skill', mult: mult('serval', 'skill', lv.skill), elem: 'Lightning', toughDmg: 20, label: 'Lightning Whip' },
        { type: 'skill', mult: mult('serval', 'skill_a4', lv.skill), elem: 'Lightning', toughDmg: 10, label: 'Lightning Whip (adj)' })
      const baseChance = mult('serval', 'skill_a2', lv.skill) + 0.2 // A2 Rock 'n' Roll: +20% base chance
      for (const e of sim.livingEnemiesOf(u)) {
        sim.applyDebuff(u, e, baseChance, () => applyShock(sim, u, e, 2, lv), 'Shock', 'Shock')
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('serval', 'basic', lv.basic), elem: 'Lightning', toughDmg: 10, label: 'Guitar String' })
    // E1 "Echo Chamber": 60% of Basic ATK DMG to a random target adjacent to the target
    if (eid_serval(ctx) >= 1) {
      const others = sim.livingEnemiesOf(u).filter(e => e !== t)
      if (others.length) {
        const o = sim.rngPick(others)
        sim.hit(u, o, { type: 'basic', mult: mult('serval', 'basic', lv.basic) * 0.6, elem: 'Lightning', toughDmg: 0, label: 'Echo Chamber' })
      }
    }
  },

  onStart(sim, u, ctx) {
    sim.gainEnergy(u, 15) // A4 "String Vibration": battle start +15 Energy
    sim.log(`A4 String Vibration (energy +15)`)
  },

  onKill(sim, u, ctx) {
    // A6 "Mania": upon defeating an enemy, ATK +20% for 2 turns
    sim.addBuff(u, { id: 'serval_mania', name: 'Mania', mods: [{ stat: 'atkPct', value: 0.2 }], turns: 2 })
  },

  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (dmgType === 'add') return
    if (attacker.kitId !== 'serval') return
    if (target.side !== 'enemy' || target.dead) return
    // Talent "Galvanic Chords": once per attack (dedup across multi-target hits), hits ALL Shocked enemies
    if (sim.attackNo() === (ctx.servalTalentSeq as number)) return
    ctx.servalTalentSeq = sim.attackNo()
    const lv = levelsOf(ctx)
    const base = mult('serval', 'talent', lv.talent)
    if (eid_serval(ctx) >= 2) {
      sim.gainEnergy(attacker, 4) // E2 "Encore!": +4 Energy per Talent trigger
      sim.log(`Encore! (energy +4)`)
    }
    for (const e of sim.livingEnemiesOf(attacker)) {
      if (isShocked(e)) {
        hitS(sim, attacker, e, ctx, { type: 'add', mult: base, elem: 'Lightning', toughDmg: 0, label: 'Talent Additional', noSeq: true })
      }
    }
  },
}

// ===== qingque  (was qingque.ts) =====
/** canon 120104: the hand holds tiles of 3 suits and caps at 4 */
const SUITS = ['Spade', 'Heart', 'Diamond'] as const
const HAND_MAX = 4

/** Tile choice is automated (the player picks in game) — tie on equal counts goes to the
 *  lower suit, a Basic with an empty hand tosses nothing, the Ult REPLACES the hand with 4
 *  same-suit tiles, E2 pays Energy even for a discarded tile, and the E4 FUA reuses the Basic
 *  multiplier once per Blast. All are ceiling-free: hand state is per-kit runtime, so a player
 *  choice would only need `manualTarget`/a pick hook on top of the same draw. */

type Hand = [number, number, number]
const hand = (ctx: KitRuntime): Hand => (ctx.hand as Hand) ?? [0, 0, 0]
const total = (h: Hand) => h[0] + h[1] + h[2]
/** machine-parseable hand state — the debug block replays the hand out of the transcript */
const handTag = (h: Hand) => `[Spade=${h[0]} Heart=${h[1]} Diamond=${h[2]}]`
const fewest = (h: Hand) => {
  let best = -1
  // only suits she actually holds a tile of can be tossed — a 0-count suit must never go negative
  for (let i = 0; i < 3; i++) if (h[i] > 0 && (best < 0 || h[i] < h[best])) best = i
  return best
}
/** the 4-of-a-kind suit, or null when the hand is no quad (canon: checked at her turn start only) */
const quad = (h: Hand) => (total(h) === HAND_MAX && h.indexOf(HAND_MAX) >= 0 ? h.indexOf(HAND_MAX) : -1)
const setHand = (ctx: KitRuntime, h: Hand) => { ctx.hand = h }

/** draw one random tile; the hand caps at 4 and the overflow is discarded (canon 120104) */
function drawOne(sim: SimApi, u: Unit, ctx: KitRuntime, eid: number, src: 'Celestial Jade' | 'A Scoop of Moon' | 'Game Solitaire'): void {
  const h = hand(ctx).slice() as Hand
  const s = sim.rngInt(3) % 3
  if (total(h) >= HAND_MAX) sim.log(`${u.name} discards a ${SUITS[s]} tile (${src}, hand full) ${handTag(h)}`)
  else {
    h[s] += 1
    sim.log(`${u.name} draws a ${SUITS[s]} tile (${src}) ${handTag(h)}`)
  }
  setHand(ctx, h)
  // canon ranks.2 "Sleep on the Tiles": every Draw Tile trigger regenerates 1 Energy
  if (eid >= 2) {
    sim.gainEnergy(u, 1)
    sim.log(`${u.name} E2: +1 Energy (Draw Tile)`)
  }
}

/** E4 Right on the Tiles: Basic / Enhanced Basic launches 1 FUA on the same target for 100% of its DMG */
function selfSuccFua(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime, m: number): void {
  if (!ctx.selfSufficer) return
  ctx.selfSufficer = false
  sim.hit(u, target, { type: 'add', mult: m, toughDmg: 0, label: 'E4 Self-Sufficer (FUA)' })
  sim.log(`${u.name} E4 Self-Sufficer FUA`)
}

export const qingqueKit: KitDef = {
  id: 'qingque',
  name: 'Qingque',
  elem: 'Quantum',
  energyMax: 140,
  base: { ...PROG.qingque.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 120107 "Game Solitaire": draw 2 jade tiles at battle start.
  technique: {
    name: 'Game Solitaire',
    kind: 'buff',
    apply(sim, u, ctx) {
      const eid = (ctx.eidolon as number) ?? 0
      drawOne(sim, u, ctx, eid, 'Game Solitaire')
      drawOne(sim, u, ctx, eid, 'Game Solitaire')
    },
  },
  onStart(_sim, _u, ctx) {
    setHand(ctx, [0, 0, 0])
    ctx.dmgStack = 0
    ctx.hidden = false
    ctx.selfSufficer = false
    ctx.tileBattleUsed = false
  },
  // Talent Celestial Jade: EVERY other ally's turn start draws 1 tile (canon has no draw chance —
  // the old 0.65 roll was invented and made the whole hand engine RNG-gated)
  onAllyTurnStart(sim, _ally, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'qingque' && !a.dead)
    if (!u) return
    drawOne(sim, u, ctx, (ctx.eidolon as number) ?? 0, 'Celestial Jade')
  },
  onTurnStart(sim, u, ctx) {
    const lv = levelsOf(ctx)
    // canon 120102: the DMG Boost lasts "until the end of the current turn" — the stack count resets
    ctx.dmgStack = 0
    ctx.selfSufficer = false
    // canon 120104: Hidden Hand is entered only when she STARTS her turn holding 4 of one suit
    if (ctx.hidden) return
    const q = quad(hand(ctx))
    if (q < 0) return
    const h4 = hand(ctx).slice() as Hand
    setHand(ctx, [0, 0, 0])
    ctx.hidden = true
    sim.addBuff(u, {
      id: 'qingque_hidden_hand',
      name: 'Hidden Hand',
      mods: [{ stat: 'atkPct', value: mult('qingque', 'talent', lv.talent) }],
      turns: Infinity,
    })
    sim.log(`${u.name}: Hidden Hand (4 ${SUITS[q]} tiles) ${handTag(h4)}`)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // canon 120104: Hidden Hand locks the Skill only — the Ult stays available
    if (ctx.hidden) return { kind: 'basic' }
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const ultM = mult('qingque', 'ult', lv.ult) * (eid >= 1 ? 1.1 : 1)
      sim.hitAoe(u, { type: 'ult', mult: ultM, toughDmg: 20, label: 'A Quartet? Woo-hoo!' })
      // canon 120103: obtains 4 tiles OF THE SAME SUIT. The cap is 4, so the old hand is dropped.
      const s = sim.rngInt(3) % 3
      const h = [0, 0, 0] as Hand
      h[s] = HAND_MAX
      setHand(ctx, h)
      sim.log(`${u.name} [ULT] A Quartet? Woo-hoo! — 4 ${SUITS[s]} tiles ${handTag(h)}`)
      // Hidden Hand is NOT granted here: canon gates it on her turn start. The 120102 note
      // ("Casting Ultimates during this Extra Turn will push it to behind the Ultimate/Extra Turn
      // queue as if it were a regular turn") is what makes the quad resolve on the next turn.
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      // canon 120102 has NO energy param (params are [tiles, DMG%/stack, max stacks]) — the old
      // kit invented "+30 Energy", which made the Extra Turn resolve as an Ult and silently
      // killed both Bide Time and E4 Self-Sufficer.
      // A0 Tile Battle: 1 SP back on the first Skill of the battle
      if (!ctx.tileBattleUsed) {
        sim.gainSp(1)
        ctx.tileBattleUsed = true
        sim.log(`${u.name} Tile Battle: +1 SP`)
      }
      // canon 120102 param#1: draw 2 tiles (the Skill deals NO damage — the old kit invented a
      // 200%→298% AoE out of the "2 tiles drawn" param)
      const n = mult('qingque', 'skill', lv.skill)
      for (let i = 0; i < n; i++) drawOne(sim, u, ctx, eid, 'A Scoop of Moon')
      // canon 120102 param#2/#3: +DMG% per stack until end of turn, capped at `skill_a3` stacks.
      // A0 Bide Time: +10% DMG Boost per stack.
      const cap = mult('qingque', 'skill_a3', lv.skill)
      const st = Math.min(cap, ((ctx.dmgStack as number) ?? 0) + 1)
      ctx.dmgStack = st
      sim.addBuff(u, {
        id: 'qingque_draw',
        name: 'A Scoop of Moon',
        mods: [{ stat: 'dmgAll', value: (mult('qingque', 'skill_a2', lv.skill) + 0.1) * st }],
        turns: 1,
      })
      // E4 Right on the Tiles: 24% fixed chance to gain Self-Sufficer until end of turn
      if (eid >= 4 && sim.rng() < 0.24) {
        ctx.selfSufficer = true
        sim.log(`${u.name} E4 Self-Sufficer active (until end of turn)`)
      }
      sim.log(`${u.name} [SKILL] A Scoop of Moon (draw ${n}, boost ${st}/${cap}) ${handTag(hand(ctx))}`)
      sim.grantExtraTurn(u)
      return
    }

    sim.gainEnergy(u, 20)
    const primary = manualTarget(sim, action, enemies[0])
    // canon 120101: tosses 1 tile from the suit with the FEWEST tiles in hand
    const h = hand(ctx).slice() as Hand
    const s = fewest(h)
    if (s >= 0) {
      h[s] -= 1
      sim.log(`${u.name} tosses a ${SUITS[s]} tile (fewest) ${handTag(h)}`)
    } else {
      sim.log(`${u.name} has an empty hand — nothing to toss ${handTag(h)}`)
    }
    setHand(ctx, h)
    if (ctx.hidden) {
      const mainM = mult('qingque', 'basic_en', lv.basic)
      const adjM = mult('qingque', 'basic_en_a2', lv.basic)
      sim.hitBlast(u, primary,
        { type: 'basic', mult: mainM, toughDmg: 10, label: 'Cherry on Top! (main)' },
        { type: 'basic', mult: adjM, toughDmg: 10, label: 'Cherry on Top! (adj)' },
      )
      sim.log(`${u.name} [BASIC] Cherry on Top! (Enhanced)`)
      // canon 120108: "Cherry on Top!" recovers no Skill Point — E6 hands it back
      if (eid >= 6) {
        sim.gainSp(1)
        sim.log(`${u.name} E6: +1 SP`)
      }
      sim.removeBuff(u, 'qingque_hidden_hand')
      ctx.hidden = false
      if (!u.buffs.find(b => b.id === 'qingque_winning_hand')) {
        sim.addBuff(u, { id: 'qingque_winning_hand', name: 'Winning Hand', mods: [{ stat: 'spdPct', value: 0.1 }], turns: 1 })
      }
      selfSuccFua(sim, u, primary, ctx, mainM)
    } else {
      const mainM = mult('qingque', 'basic', lv.basic)
      sim.hit(u, primary, { type: 'basic', mult: mainM, toughDmg: 10, label: 'Flower Pick' })
      sim.log(`${u.name} [BASIC] Flower Pick`)
      sim.gainSp(1)
      selfSuccFua(sim, u, primary, ctx, mainM)
    }
  },
}


// ===== argenti  (was argenti.ts) =====
function apotheosisCap(eid: number): number {
  return eid >= 4 ? 12 : 10 // E4 Trumpet's Dedication: max stack limit +2
}

/** Trace Courage: +15% DMG vs ≤50% HP enemies (per-target multiplier). */
function courageMult(e: Unit): number {
  return e.maxHp > 0 && e.hp <= e.maxHp * 0.5 ? 1.15 : 1
}

export const argentiKit: KitDef = {
  id: 'argenti',
  name: 'Argenti',
  elem: 'Physical',
  energyMax: 180,
  // canon (Energy.md): Argenti's Ultimate is usable at HALF Max Energy (90) — mirrors decide/perform
  ultActivation: { kind: 'energy', at: 'half' },
  base: { ...PROG.argenti.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  // 130207 "Manifesto of Purest Virtue": Physical DMG 80% ATK to all enemies + 15 Energy at battle start.
  technique: {
    name: 'Manifesto of Purest Virtue',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Physical', mult: 0.8, toughDmg: 10, label: 'Manifesto of Purest Virtue' })
      sim.gainEnergy(u, 15)
    },
  },
  onStart(sim, u, ctx) {
    ctx.apotheosis = ((ctx.eidolon as number) ?? 0) >= 4 ? 2 : 0
    // Trace Piety: +1 stack at start of turn (first turn)
    ctx.apotheosis = Math.min(apotheosisCap((ctx.eidolon as number) ?? 0), (ctx.apotheosis as number) + 1)
  },
  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (u.energy >= 90) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const apCap = apotheosisCap(eid)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    // Talent Sublime Object: per enemy hit → +3 Energy + 1 Apotheosis stack (basic/skill/ult)
    const feed = (n: number) => {
      sim.gainEnergy(u, n * 3)
      ctx.apotheosis = Math.min(apCap, (ctx.apotheosis as number) + n)
      sim.log(`${u.name} Sublime Object: +${n * 3} Energy, Apotheosis ${ctx.apotheosis}/${apCap}`)
    }

    if (action.kind === 'ult') {
      if (u.energy < 90) return
      if (u.energy >= u.maxEnergy) {
        // Enhanced ult (180 energy): AoE + 6 extra random hits
        u.energy = 0
        if (eid >= 6) sim.addBuff(u, { id: 'argenti_e6', name: '"Your" Resplendence', mods: [{ stat: 'defIgnore', value: 0.3 }], turns: 1 })
        for (const e of [...sim.livingEnemiesOf(u)])
          sim.hit(u, e, { type: 'ult', mult: mult('argenti', 'ult_a2', lv.ult) * courageMult(e), elem: 'Physical', toughDmg: 20, label: 'Merit Bestowed in "My" Garden' })
        let total = sim.livingEnemiesOf(u).length
        for (let i = 0; i < 6; i++) {
          const list = sim.livingEnemiesOf(u)
          if (!list.length) break
          const e = sim.rngPick(list)
          sim.hit(u, e, { type: 'ult', mult: mult('argenti', 'ult_a3', lv.ult) * courageMult(e), elem: 'Physical', toughDmg: 5, label: 'Merit Bestowed (extra)' })
          total++
        }
        feed(total)
        sim.log(`${u.name} Enhanced Ult: Merit Bestowed in "My" Garden (180E)`)
      } else {
        // Standard ult (90 energy): AoE
        u.energy = 0
        if (eid >= 6) sim.addBuff(u, { id: 'argenti_e6', name: '"Your" Resplendence', mods: [{ stat: 'defIgnore', value: 0.3 }], turns: 1 })
        for (const e of [...sim.livingEnemiesOf(u)])
          sim.hit(u, e, { type: 'ult', mult: mult('argenti', 'ult', lv.ult) * courageMult(e), elem: 'Physical', toughDmg: 15, label: 'For In This Garden, Supreme Beauty Bestows' })
        feed(sim.livingEnemiesOf(u).length)
        sim.log(`${u.name} Ult: For In This Garden, Supreme Beauty Bestows (90E)`)
      }
      // E2: 3+ enemies → ATK+40% 1t
      if (eid >= 2 && enemies.length >= 3) sim.addBuff(u, { id: 'argenti_e2', name: 'Agate\'s Humility', mods: [{ stat: 'atkPct', value: 0.4 }], turns: 1 })
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.hit(u, e, { type: 'skill', mult: mult('argenti', 'skill', lv.skill) * courageMult(e), elem: 'Physical', toughDmg: 15, label: 'Justice, Hereby Blooms' })
      // Sublime Object: each enemy hit → +3 energy + Apotheosis stack
      const hits = enemies.length
      sim.gainEnergy(u, hits * 3)
      ctx.apotheosis = Math.min(apCap, (ctx.apotheosis as number) + hits)
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('argenti', 'basic', lv.basic) * courageMult(t), elem: 'Physical', toughDmg: 10, label: 'Fleeting Fragrance' })
    // Sublime Object: +3 energy + stack
    sim.gainEnergy(u, 3)
    ctx.apotheosis = Math.min(apCap, (ctx.apotheosis as number) + 1)
  },

  onTurnStart(sim, u, ctx) {
    // Trace Piety: +1 Apotheosis at turn start
    ctx.apotheosis = Math.min(apotheosisCap((ctx.eidolon as number) ?? 0), (ctx.apotheosis as number) + 1)
    // Apotheosis CRIT Rate buff (refreshed each turn)
    const stacks = ctx.apotheosis as number
    const crPerStack = mult('argenti', 'talent', levelsOf(ctx).talent)
    sim.addBuff(u, { id: 'argenti_apotheosis', name: `Apotheosis CR+${Math.round(stacks * crPerStack * 100)}%`, mods: [{ stat: 'critRate', value: stacks * crPerStack }], turns: 1 })
    // E1: each stack also +4% CRIT DMG
    if (((ctx.eidolon as number) ?? 0) >= 1)
      sim.addBuff(u, { id: 'argenti_e1', name: 'A Lacuna in Kingdom of Aesthetics', mods: [{ stat: 'critDmg', value: stacks * 0.04 }], turns: 1 })
  },
}


// ===== jade  (was jade.ts) =====
const CHARGE_NEED = 8 // talent Charge cost per Follow-Up ATK
const CHARGE_MAX = 40
const PAWN_MAX = 50

function liveJade(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'jade' && !u.dead)
}

function applyPawn(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const pawn = (sim.rt(u).pawn as number) ?? 0
  const mods: Array<{ stat: string; value: number }> = [
    // Talent Fang of Flare Flaying: per-stack CRIT DMG (max 50)
    { stat: 'critDmg', value: mult('jade', 'talent_a2', lv.talent) * pawn },
    // A6 Asset Forfeiture: +0.5% ATK per Pawned Asset stack
    { stat: 'atkPct', value: 0.005 * pawn },
    // E2 Morality?: at 15+ stacks → CRIT Rate +18%
    ...(eid >= 2 && pawn >= 15 ? [{ stat: 'critRate', value: 0.18 }] : []),
  ]
  sim.removeBuff(u, 'jade_pawn')
  sim.addBuff(u, { id: 'jade_pawn', name: `Pawned Asset ×${pawn}`, mods: mods as any, turns: Infinity })
}

function gainPawn(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const rt = sim.rt(u)
  rt.pawn = Math.min(PAWN_MAX, ((rt.pawn as number) ?? 0) + n)
  applyPawn(sim, u, ctx)
}

function jadeCharge(sim: SimApi, u: Unit, n: number): void {
  const rt = sim.rt(u)
  rt.charge = Math.min(CHARGE_MAX, ((rt.charge as number) ?? 0) + n)
}

/** Talent Follow-Up ATK: 5 hits flattened to one Quantum AoE; does not generate Charge. */
function fireJadeFua(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u)
  let fuaMult = mult('jade', 'talent', lv.talent)
  if (eid >= 1) fuaMult *= 1.32 // E1 Altruism?: FUA DMG +32%
  const enhanced = (rt.enh as number) ?? 0 > 0
  if (enhanced) {
    fuaMult += mult('jade', 'ult_a2', lv.ult) // Vow of the Deep enhancement (+DMG)
    rt.enh = (rt.enh as number) - 1
  }
  sim.hitAoe(u, {
    type: 'fua', elem: 'Quantum', mult: fuaMult, toughDmg: 5, split: [0.15, 0.15, 0.15, 0.15, 0.4],
    label: enhanced ? 'Fang of Flare Flaying (Enhanced)' : 'Fang of Flare Flaying',
  })
  sim.gainEnergy(u, 10) // talent sp_base
  gainPawn(sim, u, ctx, 5) // each FUA gives 5 Pawned Asset
}

function checkFua(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  while ((rt.charge as number) >= CHARGE_NEED) {
    rt.charge = (rt.charge as number) - CHARGE_NEED
    fireJadeFua(sim, u, ctx)
  }
}

function collectorUnit(sim: SimApi, u: Unit): Unit | undefined {
  const rt = sim.rt(u)
  const id = rt.debtId as string | undefined
  if (!id) return undefined
  return sim.allies('ally').find(a => a.id === id && !a.dead)
}

function setDebt(sim: SimApi, u: Unit, ctx: KitRuntime, ally: Unit): void {
  const rt = sim.rt(u)
  const eid = (ctx.eidolon as number) ?? 0
  rt.debtId = ally.id
  rt.debt = 3
  sim.log(`${ally.name} becomes the Debt Collector`)
  if (ally.id !== u.id) {
    // Debt Collector SPD +30 (flat; Jade-as-collector gets no SPD boost)
    sim.addBuff(ally, { id: 'jade_debt_spd', name: 'Acquisition Surety', mods: [{ stat: 'spdFlat', value: 30 }], turns: Infinity })
  }
  // E6 Equity?: while a Debt Collector exists → Jade Quantum RES PEN +20%
  if (eid >= 6) sim.addBuff(u, { id: 'jade_e6', name: 'Equity? Pending Sponsorship', mods: [{ stat: 'resPen:Quantum', value: 0.2 }], turns: Infinity })
}

function clearDebt(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  if (!rt.debtId) return
  if (rt.debtId !== u.id) {
    const a = sim.allies('ally').find(x => x.id === rt.debtId)
    if (a) sim.removeBuff(a, 'jade_debt_spd')
  }
  sim.removeBuff(u, 'jade_e6')
  rt.debtId = undefined
  rt.debt = 0
  sim.log(`${u.name}: Debt Collector removed`)
}

export const jadeKit: KitDef = {
  id: 'jade',
  name: 'Jade',
  elem: 'Quantum',
  energyMax: 140,
  base: { ...PROG.jade.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  // #141007 "Visionary Predation" (Technique): AoE 50% ATK Quantum + 15 Pawned Asset.
  technique: {
    name: 'Visionary Predation',
    kind: 'attack',
    apply(sim, u, ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 0.5, toughDmg: 10, label: 'Visionary Predation' })
      gainPawn(sim, u, ctx, 15)
    },
  },
  onStart(sim, u, ctx) {
    // A4 Collateral Ticket: action-advance self by 50% at battle start
    sim.advance(u, 0.5)
  },
  // A2 Reverse Repo pt1: +1 Pawned Asset per enemy entering combat (per wave)
  onWaveStart(sim, u, ctx) {
    gainPawn(sim, u, ctx, sim.livingEnemiesOf(u).length)
  },
  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u)
    // Skill duration drops at the start of Jade's every turn
    if (rt.debtId) {
      rt.debt = ((rt.debt as number) ?? 3) - 1
      if ((rt.debt as number) <= 0) clearDebt(sim, u, ctx)
    }
  },
  // A2 Reverse Repo pt2: Debt Collector turn start → +3 Pawned Asset
  onAllyTurnStart(sim, ally, ctx) {
    const jade = liveJade(sim)
    if (!jade) return
    const rt = sim.rt(jade)
    if (rt.debtId && ally.id === rt.debtId) {
      gainPawn(sim, jade, ctx, 3)
      sim.log(`${ally.name} Debt Collector turn → Jade +3 Pawned Asset`)
    }
  },
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    const jade = liveJade(sim)
    if (!jade || target.side !== 'enemy') return
    const rt = sim.rt(jade)
    const eid = (ctx.eidolon as number) ?? 0
    // no self-attack here: Jade's own Charge comes from perform; FUA/Additional never meta-trigger
    if (attacker === jade || dmgType === 'add') return
    const collector = collectorUnit(sim, jade)
    if (!collector || attacker.id !== collector.id) return
    // gate once per attack (multi-hit shares the same attackNo)
    const seq = sim.attackNo()
    if (rt.lastSeq === seq) return
    rt.lastSeq = seq

    // Talent Charge: 1 per enemy target hit (proxy: AoE-class hits all, single-class hits 1)
    const nEnemies = sim.livingEnemiesOf(jade).length
    const hits = dmgType === 'ult' || dmgType === 'fua' ? nEnemies : 1
    jadeCharge(sim, jade, hits)
    // E1: after collector hits 2/1 enemies → +1/+2 extra Charge
    if (eid >= 1) {
      if (nEnemies === 1) jadeCharge(sim, jade, 2)
      else if (nEnemies === 2) jadeCharge(sim, jade, 1)
    }
    sim.log(`${collector.name} Debt Collector attack → Jade +${hits} Charge`)

    // Acquisition Surety: Quantum Additional DMG per enemy hit + consumes DC HP (2% Max HP, floor 1)
    const addMult = mult('jade', 'skill', levelsOf(ctx).skill)
    for (const en of [...sim.livingEnemiesOf(jade)]) {
      sim.hit(jade, en, { type: 'add', noSeq: true, elem: 'Quantum', mult: addMult, toughDmg: 0, label: 'Acquisition Surety (Additional)' })
    }
    if (collector.kind === 'char') {
      sim.fireAllyHpLoss(collector, Math.min(0.02 * collector.maxHp, Math.max(0, collector.hp - 1)))
    }

    checkFua(sim, jade, ctx)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // once a Debt Collector exists Jade cannot use her Skill
    if (sim.rt(u).debtId) return { kind: 'basic' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.hitAoe(u, { type: 'ult', elem: 'Quantum', mult: mult('jade', 'ult', lv.ult), toughDmg: 15, label: 'Vow of the Deep' })
      rt.enh = 2 // enhances next 2 Talent Follow-Up ATKs
      // E4 Sincerity?: Ult → ignore 12% DEF for 3 turns
      if (eid >= 4) sim.addBuff(u, { id: 'jade_e4', name: 'Sincerity? Put Option Only', mods: [{ stat: 'defIgnore', value: 0.12 }], turns: 3 })
      // Talent: her own attack grants Charge per enemy hit
      jadeCharge(sim, u, sim.livingEnemiesOf(u).length)
      checkFua(sim, u, ctx)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      if (rt.debtId) return // collector exists → Skill unusable (guard; decide prevents)
      // a teammate should carry the Debt (Jade-as-collector is the no-teammate fallback)
      let ally = mainDpsOf(sim, ctx)
      if (!ally || ally.id === u.id) {
        ally = undefined
        let bestAtk = 0
        for (const a of sim.allies('ally')) {
          if (a.kind === 'char' && !a.dead && a.id !== u.id && sim.effAtk(a) > bestAtk) { bestAtk = sim.effAtk(a); ally = a }
        }
      }
      if (ally) {
        setDebt(sim, u, ctx, ally)
        sim.gainEnergy(u, 30)
      } else {
        sim.gainSp(1) // no valid target → refund the SP
      }
      return
    }

    // basic — Lash of Riches (Blast: main + adjacent to all other enemies in the pack)
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const e = lowestHpEnemy(sim, u)
    if (e) {
      sim.hitBlast(u, e,
        { type: 'basic', elem: 'Quantum', mult: mult('jade', 'basic', lv.basic), toughDmg: 10, label: 'Lash of Riches' },
        { type: 'basic', elem: 'Quantum', mult: mult('jade', 'basic_a2', lv.basic), toughDmg: 5, label: 'Lash of Riches (adj)' })
      jadeCharge(sim, u, sim.livingEnemiesOf(u).length)
      checkFua(sim, u, ctx)
    }
  },
}

// ===== rappa  (was rappa.ts) =====
const CHARGE_MAX_rappa = 10 // Endurance Gauge cap (E6: +5)
const INK = 3 // ult Chroma Ink charges per Sealform

function liveRappa(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'rappa' && !u.dead)
}

function chargeCap(eid: number): number {
  return CHARGE_MAX_rappa + (eid >= 6 ? 5 : 0)
}

function gainCharge(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const rt = sim.rt(u)
  rt.charge = Math.min(chargeCap((ctx.eidolon as number) ?? 0), ((rt.charge as number) ?? 0) + n)
}

// Nindō Supreme: Aishiteru — enter Sealform (WBE+50%, BE+, defIgnore E1, E4 team SPD)
function enterSeal(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u)
  rt.ink = INK
  const mods: Array<{ stat: string; value: number }> = [
    { stat: 'wbe', value: mult('rappa', 'ult', lv.ult) },
    { stat: 'be', value: mult('rappa', 'ult_a2', lv.ult) },
  ]
  if (eid >= 1) mods.push({ stat: 'defIgnore', value: 0.15 }) // E1: 15% DEF ignore in Sealform
  sim.addBuff(u, { id: 'rap_seal', name: 'Nindō Supreme: Aishiteru', mods: mods as any, turns: Infinity })
  // E4: all allies SPD +12% while in Sealform
  for (const a of sim.allies('ally')) {
    if (eid >= 4 && !a.dead) sim.addBuff(a, { id: 'rap_e4', name: 'Lost Is the Nindō Devoured by Time', mods: [{ stat: 'spdPct', value: 0.12 }], turns: Infinity })
  }
  sim.log(`${u.name} enters SEALFORM (WBE+50%, BE+${Math.round(mult('rappa', 'ult_a2', lv.ult) * 100)}%)`)
}

function exitSeal(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const eid = (ctx.eidolon as number) ?? 0
  rt.ink = 0
  sim.removeBuff(u, 'rap_seal')
  for (const a of sim.allies('ally')) sim.removeBuff(a, 'rap_e4')
  // E1: +20 Energy on exiting Sealform
  if (eid >= 1) {
    sim.gainEnergy(u, 20)
    sim.log('E1: +20 Energy on Sealform exit')
  }
  sim.log(`${u.name} exits Sealform`)
}

// Talent Endurance Gauge: 3rd Petalblade hit — Break DMG to all enemies + ignore-weakness toughness pierce
function talentPetalBreak(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const charge = (sim.rt(u).charge as number) ?? 0
  sim.rt(u).charge = 0 // consumed all Charge
  const breakMult = mult('rappa', 'talent', lv.talent) + charge * mult('rappa', 'talent_a2', lv.talent)
  const pierceTough = mult('rappa', 'talent_a3', lv.talent) + charge * mult('rappa', 'talent_a4', lv.talent)
  for (const e of [...sim.livingEnemiesOf(u)]) {
    const base = computeBreakDamage({ attacker: u, target: e, elem: 'Imaginary', kind: 'break' })
    const amount = Math.floor(base * breakMult)
    if (amount > 0) sim.applyTargetBreak(u, e, amount, 'Demonbane Petalblade Break')
    sim.applyToughness(u, e, 'Imaginary', pierceTough, 0, 1.0) // ignores Weakness Type
  }
}

// A2 Sea Echo: Sealform Enhanced Basic vs Weakness-Broken target → 60% Super Break of that hit's toughness
function seaEchoProbe(sim: SimApi, u: Unit, mainTough: number, wasBroken: boolean, primary: Unit): void {
  if (!wasBroken || primary.dead) return
  sim.superBreak(u, primary, mainTough * 1.5, 0.6) // 1 row of 60% Super Break
}

export const rappaKit: KitDef = {
  id: 'rappa',
  name: 'Rappa',
  elem: 'Imaginary',
  energyMax: 140,
  base: { ...PROG.rappa.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  technique: {
    name: 'Ninja Dash: By Leaps and Bounds',
    kind: 'attack',
    apply(sim, u, _ctx) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      for (const e of enemies) {
        sim.applyToughness(u, e, 'Imaginary', 30, 0, 1.0) // #5: 30 Toughness, ignores Weakness Type
        const base = computeBreakDamage({ attacker: u, target: e, elem: 'Imaginary', kind: 'break' })
        const amount = Math.floor(base * 2.0) // #2: 200% of Rappa's Imaginary Break DMG
        if (amount > 0) sim.applyTargetBreak(u, e, amount, 'Ninja Dash Break')
      }
      sim.gainEnergy(u, 10) // #4
      sim.log(`${u.name} Technique: Ninja Dash (Toughness 30 ignore-weakness, Break ×2.0, +10 Energy)`)
    },
  },
  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    rt.charge = 0
    rt.ink = 0
    // E6: +5 Charge at battle start
    if (((ctx.eidolon as number) ?? 0) >= 6) {
      gainCharge(sim, u, ctx, 5)
      sim.log('E6: +5 Charge at battle start')
    }
  },
  decide(sim, u, _ctx) {
    // in Sealform only the Enhanced Basic is usable
    if (((sim.rt(u).ink as number) ?? 0) > 0) return { kind: 'basic' }
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy || (rt.ink as number) > 0) return
      u.energy = 0
      enterSeal(sim, u, ctx)
      // Nindō Supreme grants an immediate Extra Turn right after the Ultimate
      sim.grantExtraTurn(u)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      sim.hitAoe(u, { type: 'skill', elem: 'Imaginary', mult: mult('rappa', 'skill', lv.skill), toughDmg: 15, label: 'Ninja Strike: Rooted Resolute' })
      return
    }

    const primary = lowestHpEnemy(sim, u)
    if (!primary) return

    if ((rt.ink as number) > 0) {
      // Enhanced Basic Ningu: Demonbane Petalblade — Blast, 3 hits flattened to 1 (main+adj)
      const mainTough = 30 + (eid >= 2 ? 10 : 0) // E2: first-2-hit +50% vs designated enemy ≈ 2/3 of hits boosted
      const wasBroken = primary.broken
      sim.hitBlast(u, primary,
        { type: 'basic', elem: 'Imaginary', mult: mult('rappa', 'basic_en', lv.basic), toughDmg: mainTough, label: 'Ningu: Demonbane Petalblade' },
        { type: 'basic', elem: 'Imaginary', mult: mult('rappa', 'basic_en', lv.basic) / 2, toughDmg: 15, label: 'Ningu: Demonbane Petalblade (adj)' })
      sim.gainEnergy(u, 20) // 5 + 5 + 10 per hit
      rt.ink = (rt.ink as number) - 1
      // 3rd hit triggers the Talent, then E6 refunds 5 Charge
      talentPetalBreak(sim, u, ctx)
      if (eid >= 6) {
        gainCharge(sim, u, ctx, 5)
        sim.log('E6: +5 Charge after 3rd Petalblade hit')
      }
      seaEchoProbe(sim, u, mainTough, wasBroken, primary)
      if ((rt.ink as number) <= 0) exitSeal(sim, u, ctx)
      return
    }

    // normal Basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, primary, { type: 'basic', elem: 'Imaginary', mult: mult('rappa', 'basic', lv.basic), toughDmg: 10, label: 'Ninjutsu: Rise Above Tumbles' })
  },
  // Talent Endurance Gauge: any enemy Weakness Break → +1 Charge; A1 Sky High on elite+; A6 Withered Leaf on broken enemy
  onBreak(sim, _breaker, victim, ctx) {
    const rap = liveRappa(sim)
    if (!rap) return
    gainCharge(sim, rap, ctx, 1)
    if (victim.rank === 'elite' || victim.rank === 'boss') {
      gainCharge(sim, rap, ctx, 1)
      sim.gainEnergy(rap, 10)
      sim.log(`${victim.name} (elite+) broken → Rappa +1 Charge, +10 Energy`)
    }
    // A6 Withered Leaf: broken enemy takes +Break DMG 2t (2% +1% per 100 ATK>2400, max +8%)
    const atk = sim.effAtk(rap)
    const extra = Math.min(0.08, Math.max(0, Math.floor((atk - 2400) / 100) * 0.01))
    sim.addBuff(victim, { id: 'rap_leaf', name: 'Ninjutsu Inscription: Withered Leaf Break Taken+', mods: [{ stat: 'vulnType:break', value: 0.02 + extra }], turns: 2, debuff: true })
  },
}

// ===== the_herta  (was the_herta.ts) =====
const INTERPRETATION_ID = 'th_interpretation'
const INSPIRATION_ID = 'th_inspiration'
const MAX_INTERPRETATION = 42

function interpretationStacks(target: Unit): number {
  const b = target.buffs.find(b => b.id === INTERPRETATION_ID)
  return b?.stacks ?? 0
}

function setInterpretation(sim: SimApi, target: Unit, n: number): void {
  sim.removeBuff(target, INTERPRETATION_ID)
  sim.addBuff(target, {
    id: INTERPRETATION_ID,
    name: 'Hand Them Over',
    mods: [],
    turns: Infinity,
    stacks: n,
    maxStacks: MAX_INTERPRETATION,
    debuff: true,
  } as never)
}

function addInterpretation(sim: SimApi, herta: Unit, target: Unit, n: number, withAnswer = true): void {
  if (!target || target.dead || target.side !== 'enemy') return
  const cur = interpretationStacks(target)
  const next = Math.min(MAX_INTERPRETATION, cur + n)
  if (next === cur) return
  setInterpretation(sim, target, next)
  if (withAnswer) {
    const rt = sim.rt(herta)
    rt.thAnswer = Math.min(99, ((rt.thAnswer as number) ?? 0) + (next - cur))
  }
}

function pickRandomEnemy(sim: SimApi, u: Unit): Unit | undefined {
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return undefined
  const elites = enemies.filter(e => e.rank === 'elite' || e.rank === 'boss')
  if (elites.length) return sim.rngPick(elites)
  return sim.rngPick(enemies)
}

function theHerta(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(x => x.kitId === 'the_herta' && !x.dead)
}

// enemy died while carrying Interpretation → move the stacks to a survivor (elite-first)
function transferInterpretation(sim: SimApi, herta: Unit, count: number): void {
  const live = sim.livingEnemiesOf(herta)
  if (!live.length) return
  const elites = live.filter(e => e.rank === 'elite' || e.rank === 'boss')
  const t = elites.length ? sim.rngPick(elites) : sim.rngPick(live)
  addInterpretation(sim, herta, t, count, false)
  sim.log(`Hand Them Over: +${count} Interpretation transferred to ${t.name}`)
}

// Aloofly Honest: how many targets an attack counts for the fixed-Energy gain (cap 5)
function alooflyTargets(sim: SimApi, attacker: Unit, dmgType: string | undefined, msg: boolean): number {
  let n: number
  if (dmgType === 'ult') n = Math.min(5, sim.livingEnemiesOf(attacker).length)
  else if (dmgType === 'skill') n = 3
  else n = 1
  if (msg) n = Math.max(3, n)
  return Math.min(5, n)
}

export const the_hertaKit: KitDef = {
  id: 'the_herta',
  name: 'The Herta',
  elem: 'Ice',
  energyMax: 220,
  base: { ...PROG.the_herta.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  // 140107 "Vibe Checker": at battle start, self ATK +60% for 2 turns. The SU-only Basic-Treasure
  // marking / True-DMG rider is not modeled (out of scope for the combat sim).
  technique: {
    name: 'Vibe Checker',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'the_herta_tech', name: 'Vibe Checker ATK↑', mods: [{ stat: 'atkPct', value: 0.6 }], turns: 2 })
    },
  },

  onStart(sim, u) {
    const rt = sim.rt(u)
    rt.thAnswer = 0
    const eid = (rt.eidolon as number) ?? 0
    // Talent: enemies enter combat with +1 Interpretation
    for (const e of sim.livingEnemiesOf(u)) addInterpretation(sim, u, e, 1)
    // Message From Beyond the Veil: 2+ Erudition → all allies CRIT DMG +80%, Aloofly counts ≥3 targets
    const erud = sim.allies('ally').filter(a => a.kind === 'char' && a.base.path === 'Erudition').length
    if (erud >= 2) {
      rt.thMsg = true
      for (const ally of sim.allies('ally')) {
        if (ally.kind === 'char' || ally.kind === 'summon') {
          sim.addBuff(ally, { id: 'th_msg_cd', name: 'Message From Beyond the Veil', mods: [{ stat: 'critDmg', value: 0.8 }], turns: Infinity } as never)
        }
      }
      sim.log(`${u.name} Message From Beyond the Veil: ${erud} Erudition → all allies CRIT DMG +80%`)
    }
    // E2: +1 Inspiration when entering combat
    if (eid >= 2) {
      sim.addBuff(u, { id: INSPIRATION_ID, name: 'Wind Through Keyhole', mods: [], turns: Infinity, stacks: 1, maxStacks: 4 } as never)
    }
    // E6: Ice RES PEN +20%
    if (eid >= 6) {
      sim.addBuff(u, { id: 'th_e6_res', name: 'Sweet Lure of Answer', mods: [{ stat: 'resPen:Ice', value: 0.2 }], turns: Infinity } as never)
    }
    // E4: team Erudition SPD +12%
    if (eid >= 4) {
      for (const ally of sim.allies('ally')) {
        if (ally.kind === 'char' && ally.base.path === 'Erudition') {
          sim.addBuff(ally, { id: 'th_e4_spd', name: 'The Sixteenth Key', mods: [{ stat: 'spdPct', value: 0.12 }], turns: Infinity } as never)
        }
      }
    }
  },

  onWaveStart(sim, u) {
    const t = pickRandomEnemy(sim, u)
    if (t) {
      const n = Math.round(mult('the_herta', 'talent_a6', 15))
      addInterpretation(sim, u, t, n)
      sim.log(`${u.name} Wave Start: ${n} Interpretation → ${t.name}`)
    }
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },

  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const eid = (rt.eidolon as number) ?? 0
    const msg = (rt.thMsg as boolean) ?? false
    const msgMult = msg ? 2 : 1

    // capture pre-hit Interpretation so a kill transfers the stacks (buffs are cleared on kill)
    const hitAndTransfer = (e: Unit, o: Parameters<SimApi['hit']>[2]): number => {
      const pre = interpretationStacks(e)
      const dmg = sim.hit(u, e, o)
      if (e.dead && pre > 0) transferInterpretation(sim, u, pre)
      return dmg
    }

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // rearrange Interpretation among enemies (flatten: transfer-on-kill covers the migration)
      const ultMult = mult('the_herta', 'ult', lv.ult)
      // Starved Landscape: +1% per Answer stack (cap 99)
      const answerBonus = Math.min((rt.thAnswer as number) ?? 0, 99) * 0.01
      // E6: DMG multiplier +140% (≥3) / +250% (2) / +400% (1) — folded into the same AoE hit
      const e6Add = eid >= 6 ? (enemies.length >= 3 ? 1.4 : enemies.length === 2 ? 2.5 : 4.0) : 0
      const total = ultMult + answerBonus + e6Add
      for (const e of enemies) {
        hitAndTransfer(e, {
          type: 'ult', elem: 'Ice', mult: total,
          toughDmg: 10,
          label: e6Add > 0 ? 'Told Ya! Magic Happens (E6)' : 'Told Ya! Magic Happens',
        })
      }
      // Self ATK+ for #5 (3) turns
      sim.addBuff(u, { id: 'th_ult_atk', name: 'Told Ya! Magic Happens', mods: [{ stat: 'atkPct', value: mult('the_herta', 'ult_a4', lv.ult) }], turns: Math.round(mult('the_herta', 'ult_a5', lv.ult)) } as never)
      // +1 Inspiration (+E2 extra)
      sim.addBuff(u, { id: INSPIRATION_ID, name: 'Wind Through Keyhole', mods: [], turns: Infinity, stacks: 1, maxStacks: 4 } as never)
      if (eid >= 2) {
        sim.addBuff(u, { id: INSPIRATION_ID, name: 'Wind Through Keyhole', mods: [], turns: Infinity, stacks: 1, maxStacks: 4 } as never)
      }
      sim.log(`${u.name} Ult: AoE Ice ×${total.toFixed(3)}, ATK+${Math.round(mult('the_herta', 'ult_a4', lv.ult) * 100)}%, Answer=${Math.min((rt.thAnswer as number) ?? 0, 99)}`)
      // immediately takes action
      sim.grantExtraTurn(u)
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)

      const insp = u.buffs.find(b => b.id === INSPIRATION_ID)
      const hasInspiration = insp && (insp.stacks ?? 0) >= 1
      const main = enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0])

      if (hasInspiration) {
        // Enhanced Skill "Hear Me Out": consume 1 Inspiration
        const curStacks = insp!.stacks ?? 1
        sim.removeBuff(u, INSPIRATION_ID)
        if (curStacks > 1) {
          sim.addBuff(u, { id: INSPIRATION_ID, name: 'Wind Through Keyhole', mods: [], turns: Infinity, stacks: curStacks - 1, maxStacks: 4 } as never)
        }

        const enMult = mult('the_herta', 'skill_en', lv.skill)
        const enA3 = mult('the_herta', 'skill_en_a3', lv.skill)
        const perPrimary = mult('the_herta', 'talent', lv.talent) * msgMult      // +/stack vs primary
        const perOther = mult('the_herta', 'talent_a2', lv.talent) * msgMult     // +/stack vs others
        const primaryStacks = interpretationStacks(main)
        // E1: count 50% of the target with the most stacks among primary + other targets
        let primaryEff = primaryStacks
        if (eid >= 1) {
          let top = primaryStacks
          for (const e of enemies) if (e.id !== main.id) top = Math.max(top, interpretationStacks(e))
          primaryEff += Math.round(top * 0.5)
        }
        // Aloofly Honest: primary at full 42 → The Herta Ice DMG +50% until this attack ends
        if (primaryStacks >= MAX_INTERPRETATION) {
          sim.addBuff(u, { id: 'th_full', name: 'Aloofly Honest', mods: [{ stat: 'dmg:Ice', value: 0.5 }], turns: 1 } as never)
          sim.log(`${u.name} Enhanced: primary at 42 Interpretation → Ice DMG +50%`)
        }
        // +1 Interpretation on the designated enemy (once, not per blast)
        addInterpretation(sim, u, main, 1)
        // 3 blast waves: main per-stack boost, others take their own stacks
        for (let i = 0; i < 3; i++) {
          if (main.dead) break
          for (const e of sim.livingEnemiesOf(u)) {
            if (e.dead) continue
            const m = e === main ? enMult + perPrimary * primaryEff : enMult + perOther * interpretationStacks(e)
            hitAndTransfer(e, { type: 'skill', elem: 'Ice', mult: m, toughDmg: e === main ? 10 : 5, label: `Hear Me Out (${i + 1}/3)${e === main ? '' : ' (adj)'}` })
          }
        }
        // final AoE, per-target stack boost
        for (const e of sim.livingEnemiesOf(u)) {
          if (e.dead) continue
          hitAndTransfer(e, { type: 'skill', elem: 'Ice', mult: enA3 + perOther * interpretationStacks(e), toughDmg: 0, label: 'Hear Me Out (final AoE)' })
        }
        // reset the designated target's Interpretation (E1 → 15)
        if (!main.dead) setInterpretation(sim, main, eid >= 1 ? 15 : 1)
        // E2: advances next action by 35%
        if (eid >= 2) sim.advance(u, 0.35)
        sim.log(`${u.name} Enhanced Skill: 3×Blast + AoE, stacks=${primaryStacks}, Answer=${Math.min((rt.thAnswer as number) ?? 0, 99)}`)
      } else {
        // Normal Skill "Big Brain Energy": 3 waves, +1 Interpretation on the designated enemy (once)
        const skMult = mult('the_herta', 'skill', lv.skill)
        addInterpretation(sim, u, main, 1)
        for (let i = 0; i < 3; i++) {
          if (main.dead) break
          for (const e of sim.livingEnemiesOf(u)) {
            if (e.dead) continue
            hitAndTransfer(e, { type: 'skill', elem: 'Ice', mult: skMult, toughDmg: e === main ? 10 : 5, label: `Big Brain Energy (${i + 1}/3)${e === main ? '' : ' (adj)'}` })
          }
        }
        sim.log(`${u.name} Skill: 3×AoE (flat)` + (msg ? ', [Message 2×]' : ''))
      }
      return
    }

    // Basic "Did You Get It"
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    hitAndTransfer(t, { type: 'basic', elem: 'Ice', mult: mult('the_herta', 'basic', lv.basic), toughDmg: 10, label: 'Did You Get It' })
  },

  // Aloofly Honest: when any ally hits an enemy → +1 Interpretation on it + 3 fixed Energy per target hit (cap 5)
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    const herta = theHerta(sim)
    if (!herta || target.side !== 'enemy' || attacker.side !== 'ally') return
    if (ctx.lastSeq === sim.attackNo()) return
    ctx.lastSeq = sim.attackNo()
    const rt = sim.rt(herta)
    const msg = (rt.thMsg as boolean) ?? false
    addInterpretation(sim, herta, target, 1)
    const n = alooflyTargets(sim, attacker, dmgType, msg)
    if (n > 0) {
      sim.gainEnergyFlat(herta, 3 * n)
      sim.log(`Aloofly Honest: ${attacker.name} attacked → Interpretation +1, +${3 * n} Energy`)
    }
    // Message From Beyond the Veil: after The Herta attacks, apply more stacks to the highest-stack hit target
    if (attacker === herta && msg) {
      const live = sim.livingEnemiesOf(herta)
      if (live.length) {
        let top = live[0]
        for (const e of live) if (interpretationStacks(e) > interpretationStacks(top)) top = e
        const extra = 1 + 2 // Erudition attacker: 1 + 2 extra
        addInterpretation(sim, herta, top, extra)
      }
    }
  },
}

// ===== anaxa  (was anaxa.ts) =====
const ALL_ELEMS: Elem[] = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary']

function randomMissingElem(sim: SimApi, e: Unit): Elem | undefined {
  const missing = ALL_ELEMS.filter(el => !e.weaknesses.includes(el))
  return missing.length ? sim.rngPick(missing) : undefined
}

function weaknessUtils(e: Unit): number {
  return new Set(e.weaknesses).size
}

function ensureDisclosure(sim: SimApi, target: Unit, lv: AbilityLevels): void {
  if (weaknessUtils(target) >= mult('anaxa', 'talent_a3', lv.talent)) {
    sim.addBuff(target, { id: 'axa_disclosure', name: 'Tetrad Wisdom Reigns Thrice', mods: [], turns: Infinity, debuff: true } as never)
  }
}

function addAnaxaWeakness(sim: SimApi, u: Unit, target: Unit, lv: AbilityLevels): void {
  const elem = randomMissingElem(sim, target)
  if (!elem) return
  sim.applyWeakness(u, target, elem)
  const turns = mult('anaxa', 'talent_a2', lv.talent)
  sim.addBuff(target, { id: 'axa_weak', name: 'Tetrad Wisdom Reigns Thrice', mods: [], turns, payload: elem } as never)
  ensureDisclosure(sim, target, lv)
}

function removeAnaxaWeakness(sim: SimApi, target: Unit, elem: Elem): void {
  const idx = target.weaknesses.lastIndexOf(elem)
  if (idx >= 0) target.weaknesses.splice(idx, 1)
  if (weaknessUtils(target) < mult('anaxa', 'talent_a3', 10)) sim.removeBuff(target, 'axa_disclosure')
}

/**
 * Central hit path for Anaxa:
 * - Talent: Anaxa deals talent% extra DMG to Qualitative Disclosure targets (self bonus, not vulnAll)
 * - Trace A6 Qualitative Shift: defIgnore 4% per unique Weakness Type on the target, cap 7 types
 */
function hitA(sim: SimApi, u: Unit, t: Unit, o: HitOpts, lv: AbilityLevels): number {
  let multVal = o.mult ?? 1
  if (t.buffs.some(b => b.id === 'axa_disclosure')) multVal *= 1 + mult('anaxa', 'talent', lv.talent)
  const di = Math.min(7, weaknessUtils(t)) * 0.04
  if (di > 0) sim.addBuff(t, { id: '_axa6', name: 'Qualitative Shift DEF↓', mods: [{ stat: 'defIgnore', value: di }], turns: Infinity, debuff: true } as never)
  const d = sim.hit(u, t, { ...o, mult: multVal })
  if (di > 0) sim.removeBuff(t, '_axa6')
  return d
}

/** Trace A4 Imperative Hiatus: 1 Erudition char → self CRIT DMG +140%; ≥2 → all allies DMG +50% */
function imperativeHiatus(sim: SimApi, u: Unit, teamDmg: boolean): void {
  if (teamDmg) {
    for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'axa_a4_team', name: 'Imperative Hiatus', mods: [{ stat: 'dmgAll', value: 0.5 }], turns: Infinity } as never)
  } else {
    sim.addBuff(u, { id: 'axa_a4_cd', name: 'Imperative Hiatus', mods: [{ stat: 'critDmg', value: 1.4 }], turns: Infinity } as never)
  }
}

/** Skill mult: +skill_a3% per attackable enemy on the field (skill ID 140502 #3) */
function skillMult(sim: SimApi, u: Unit, lv: AbilityLevels): number {
  const n = sim.livingEnemiesOf(u).length
  return mult('anaxa', 'skill', lv.skill) * (1 + mult('anaxa', 'skill_a3', lv.skill) * n)
}

function e1Def(sim: SimApi, target: Unit, rt: KitRuntime): void {
  if (((rt.eidolon as number) ?? 0) >= 1) {
    sim.addBuff(target, { id: 'axa_e1', name: 'Magician, Isolated by Stars DEF↓', mods: [{ stat: 'defRed', value: 0.16 }], turns: 2, debuff: true } as never)
  }
}

/** full Skill: main hit + 4 bounces (each hit implants a weakness, E1 DEF↓ on all hit targets) */
function doSkillFull(sim: SimApi, u: Unit, primary: Unit, lv: AbilityLevels, rt: KitRuntime): void {
  hitA(sim, u, primary, { type: 'skill', elem: 'Wind', mult: skillMult(sim, u, lv), toughDmg: 10, label: 'Fractal, Exiles Fallacy' }, lv)
  addAnaxaWeakness(sim, u, primary, lv)
  e1Def(sim, primary, rt)

  const bounceCount = mult('anaxa', 'skill_a2', lv.skill)
  const hitSet = rt.axaBounceHits as Set<string>
  hitSet.clear()
  hitSet.add(primary.id)
  for (let i = 0; i < bounceCount; i++) {
    const t = pickBounceTarget(sim, u, hitSet)
    if (!t) break
    hitA(sim, u, t, { type: 'skill', elem: 'Wind', mult: skillMult(sim, u, lv), toughDmg: 5, label: 'Fractal bounce' }, lv)
    addAnaxaWeakness(sim, u, t, lv)
    e1Def(sim, t, rt)
  }

  if (((rt.eidolon as number) ?? 0) >= 4) {
    sim.addBuff(u, { id: 'axa_e4', name: 'Blaze, Plunged to Canyon', mods: [{ stat: 'atkPct', value: 0.3 }], turns: 2, stacks: 2, maxStacks: 2 } as never)
  }
}

function pickBounceTarget(sim: SimApi, u: Unit, hitSet: Set<string>): Unit | undefined {
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return undefined
  const unhit = enemies.filter(e => !hitSet.has(e.id))
  if (unhit.length) {
    const t = sim.rngPick(unhit)
    hitSet.add(t.id)
    return t
  }
  hitSet.clear()
  const t = sim.rngPick(enemies)
  hitSet.add(t.id)
  return t
}

export const anaxaKit: KitDef = {
  id: 'anaxa',
  name: 'Anaxa',
  elem: 'Wind',
  energyMax: 140,
  base: { ...PROG.anaxa.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  // #140907 "Prism of the Pupil" (Technique): apply 1 Weakness of the attacker's Type to every enemy.
  technique: {
    name: 'Prism of the Pupil',
    kind: 'buff',
    apply(sim, u) {
      for (const e of sim.livingEnemiesOf(u)) sim.applyWeakness(u, e, u.elem)
    },
  },

  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    rt.eidolon = (ctx.eidolon as number) ?? 0
    rt.axaExtraTurn = false
    rt.axaFirstSkill = true
    rt.axaBounceHits = new Set<string>()
    if ((rt.eidolon as number) >= 6) {
      sim.addBuff(u, { id: 'axa_e6', name: 'Everything Is in Everything', mods: [{ stat: 'finalDmgBoost', value: 0.3 }], turns: Infinity } as never)
    }

    // A4 Imperative Hiatus (E6: both effects directly, independent of Erudition count)
    if ((rt.eidolon as number) >= 6) {
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'axa_a4_team', name: 'Imperative Hiatus', mods: [{ stat: 'dmgAll', value: 0.5 }], turns: Infinity } as never)
      sim.addBuff(u, { id: 'axa_a4_cd', name: 'Imperative Hiatus', mods: [{ stat: 'critDmg', value: 1.4 }], turns: Infinity } as never)
    } else {
      const erudition = sim.allies('ally').filter(a => a.kind === 'char' && a.base.path === 'Erudition').length
      imperativeHiatus(sim, u, erudition >= 2)
    }
  },

  /** E2: enemy enters battlefield → 1 Talent weakness implant + All-Type RES↓20% */
  onWaveStart(sim, u, ctx) {
    const rt = sim.rt(u)
    if (((rt.eidolon as number) ?? 0) < 2) return
    const lv = levelsOf(ctx)
    for (const e of sim.livingEnemiesOf(u)) {
      addAnaxaWeakness(sim, u, e, lv)
      sim.addBuff(e, { id: 'axa_e2', name: 'Soul, True to History RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: Infinity, debuff: true } as never)
    }
    sim.log(`${u.name} E2: battlefield-entry weakness implant + All-RES↓`)
  },

  /** A2: at start of own turn, if no enemy in Qualitative Disclosure → +30 Energy */
  onTurnStart(sim, u, _ctx) {
    if (!sim.livingEnemiesOf(u).some(e => e.buffs.some(b => b.id === 'axa_disclosure'))) {
      sim.gainEnergy(u, 30)
      sim.log('Anaxa A2: no Disclosure enemies → +30 Energy')
    }
  },

  onEnemyTurnStart(sim, _u, enemy, _ctx) {
    const sub = enemy.buffs.find(b => b.id === 'axa_sub')
    if (sub) {
      const orig: Elem[] = (sub.payload as Elem[] | undefined) ?? []
      for (const e of [...enemy.weaknesses]) {
        if (!orig.includes(e)) {
          const idx = enemy.weaknesses.lastIndexOf(e)
          if (idx >= 0) enemy.weaknesses.splice(idx, 1)
        }
      }
      sim.removeBuff(enemy, 'axa_sub')
      const unique = new Set(enemy.weaknesses).size
      if (unique < 5) sim.removeBuff(enemy, 'axa_disclosure')
    }
  },

  onBuffExpire(sim, u, b, _ctx) {
    if (b.id === 'axa_weak' && b.payload !== undefined && u.side === 'enemy') {
      const stillHas = u.buffs.some(ob => ob.id === 'axa_weak' && ob.payload === b.payload)
      if (!stillHas) removeAnaxaWeakness(sim, u, b.payload as unknown as Elem)
    }
  },

  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)

    // Talent extra instance of Skill — cast before the queued ult. No SP, cannot retrigger.
    if (rt.axaExtraTurn) {
      const primary = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
      doSkillFull(sim, u, primary, lv, rt)
      rt.axaExtraTurn = false
      sim.log(`${u.name} Extra Turn: Fractal repeat (no SP)`)
      return
    }

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const ultMult = mult('anaxa', 'ult', lv.ult)
      for (const e of enemies) {
        const origWeaknesses: Elem[] = [...e.weaknesses]
        for (const el of ALL_ELEMS) sim.applyWeakness(u, e, el)
        sim.addBuff(e, { id: 'axa_sub', name: 'Sublimation', mods: [], turns: Infinity, payload: origWeaknesses } as never)
        ensureDisclosure(sim, e, lv)
      }
      for (const e of enemies) {
        hitA(sim, u, e, { type: 'ult', elem: 'Wind', mult: ultMult, toughDmg: 30, label: 'Sprouting Life Sculpts Earth' }, lv)
      }
      sim.log(`${u.name} Ult: Sublimation + Wind AoE`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      if (rt.axaFirstSkill && (rt.eidolon as number) >= 1) {
        sim.gainSp(1)
        sim.log('E1: First Skill +1 SP')
      }
      rt.axaFirstSkill = false

      const primary = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
      doSkillFull(sim, u, primary, lv, rt)

      // Talent: after Basic/Skill on a Qualitative Disclosure enemy → 1 additional Skill instance
      if (primary.buffs.some(b => b.id === 'axa_disclosure')) {
        rt.axaExtraTurn = true
        sim.grantExtraTurn(u)
        sim.log(`${u.name} Talent: additional Skill on Disclosure enemy`)
      }
      return
    }

    // Basic — A2: +10 extra Energy (sp_base 20 + trace 10 = 30)
    sim.gainSp(1)
    sim.gainEnergy(u, 30)
    const target = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    hitA(sim, u, target, { type: 'basic', elem: 'Wind', mult: mult('anaxa', 'basic', lv.basic), toughDmg: 10, label: 'Pain, Brews Truth' }, lv)
    addAnaxaWeakness(sim, u, target, lv)

    // Talent: after Basic on a Qualitative Disclosure enemy → 1 additional Skill instance
    if (target.buffs.some(b => b.id === 'axa_disclosure')) {
      rt.axaExtraTurn = true
      sim.grantExtraTurn(u)
      sim.log(`${u.name} Talent: additional Skill after Basic`)
    }
  },
}

// ===== rin  (was rin.ts) =====
const ULT_COST = 160

function findRin(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'rin' && !c.dead)
}

export const rinKit: KitDef = {
  id: 'rin',
  name: 'Rin Tohsaka',
  elem: 'Quantum',
  energyMax: ULT_COST,
  base: { ...PROG.rin.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },
  // #150807 "Conversion Charge" (Technique): gains #1 = 10 Gem Energy at the start of the battle.
  technique: {
    name: 'Conversion Charge',
    kind: 'buff',
    apply(sim, u, ctx) {
      const gem = mult('rin', 'technique', 1)
      ctx.gem = ((ctx.gem as number) ?? 0) + gem
      sim.log(`Conversion Charge: +${gem} Gem Energy`)
    },
  },
  decide(sim, u, ctx) {
    if (u.energy >= ULT_COST) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < ULT_COST) return
      u.energy = 0
      const t = manualTarget(sim, action, enemies[0])
      sim.hit(u, t, { type: 'ult', mult: mult('rin', 'ult', lv.ult), elem: 'Quantum', toughDmg: 20, label: 'An Gal Ta Ki Gal (main)' })
      const others = mult('rin', 'ult_a2', lv.ult)
      if (others > 0) {
        for (const x of [...sim.livingEnemiesOf(u)].filter(e => e !== t)) {
          sim.hit(u, x, { type: 'ult', mult: others, elem: 'Quantum', toughDmg: 10, label: 'An Gal Ta Ki Gal (others)' })
        }
      }
      // +1 SP for allies + all enemies take +25% DMG for 3t
      sim.gainSp(mult('rin', 'ult_a4', lv.ult))
      const vuln = mult('rin', 'ult_a5', lv.ult)
      const turns = Math.round(mult('rin', 'ult_a6', lv.ult))
      for (const x of sim.livingEnemiesOf(u)) sim.addBuff(x, { id: 'rin_ult_vuln', name: 'An Gal Ta Ki Gal Se DMG Taken+', mods: [{ stat: 'vulnAll', value: vuln }], turns })
      // A3 Inbound Prosperity: +12 Gem Energy on Ultimate (E6: +24 + extra turn)
      const gemGain = mult('rin', 'ult_a3', lv.ult) + (eid >= 6 ? 24 : 0)
      ctx.gem = ((ctx.gem as number) ?? 0) + gemGain
      if (eid >= 6) sim.grantExtraTurn(u)
      sim.log(`${u.name} Ult: +1 SP, vuln ${vuln}, Gem ${ctx.gem}`)
      return
    }

    if (action.kind === 'skill') {
      sim.gainEnergy(u, 30)
      const gem = (ctx.gem as number) ?? 0
      // Enhanced Skill (Second Magic Experiment) while Gem≥15 or SP≥7; consumes NO SP. Else Jeweled Sword Zelretch (1 SP).
      const gemGate = mult('rin', 'talent_a5', lv.talent)
      const spGate = mult('rin', 'talent_a4', lv.talent)
      const shadow = (ctx.shadow as number) ?? 0
      if (gem >= gemGate || sim.sp() >= spGate || shadow > 0) {
        const gemCost = mult('rin', 'skill_en_a2', lv.skill)
        const inst = mult('rin', 'skill_en_a3', lv.skill)
        const maxC = Math.round(mult('rin', 'skill_en_a6', lv.skill))
        let over = 0
        if (shadow > 0) {
          // E1 Zelretch's Apprentice: holding Shadow Gem → consume ALL of it as the instance pool,
          // no SP→Gem conversion, no Gem consumption.
          ctx.shadow = 0
        } else {
          // SP>2 → consume down to 2; each point → +2 Gem immediately
          const spFloor = Math.round(mult('rin', 'skill_en_a4', lv.skill))
          const gemPerSp = Math.round(mult('rin', 'skill_en_a5', lv.skill))
          over = Math.max(0, sim.sp() - spFloor)
          for (let i = 0; i < over; i++) sim.spendSp(1)
          ctx.gem = (ctx.gem as number) + over * gemPerSp
        }
        const aoe = mult('rin', 'skill_en', lv.skill)
        for (const x of sim.livingEnemiesOf(u)) sim.hit(u, x, { type: 'skill', mult: aoe, elem: 'Quantum', toughDmg: 15, label: 'Second Magic (AoE)', split: [0.25, 0.25, 0.25, 0.25] })
        let pool = shadow > 0 ? shadow : (ctx.gem as number)
        let spent = 0
        while (pool >= gemCost && spent < maxC) {
          const ts = [...sim.livingEnemiesOf(u)]
          if (!ts.length) break
          const t = sim.rngPick(ts)
          sim.hit(u, t, { type: 'skill', mult: inst, elem: 'Quantum', toughDmg: 5, label: 'Second Magic instance' })
          pool -= gemCost
          if (shadow <= 0) ctx.gem = (ctx.gem as number) - gemCost
          spent += 1
        }
        // E1: a single Enhanced Skill consuming ≥30 Gem → gain Shadow Gem equal to the amount consumed
        if (shadow <= 0 && eid >= 1) {
          const consumed = spent * gemCost
          if (consumed >= mult('rin', 'skill_en_a7', lv.skill)) {
            ctx.shadow = consumed
            sim.log(`${u.name} Zelretch's Apprentice: Shadow Gem +${consumed}`)
          }
        }
        sim.log(`${u.name} Second Magic Experiment (${spent} compounds${shadow > 0 ? `, Shadow Gem ${shadow}` : `, -${over} SP → ${over * Math.round(mult('rin', 'skill_en_a5', lv.skill))} Gem`})`)
        // A2 Ladylike Poise: after Enhanced Skill SPD+20% 3t
        sim.addBuff(u, { id: 'rin_a2_spd', name: 'Ladylike Poise', mods: [{ stat: 'spdPct', value: 0.2 }], turns: 3 })
      } else if (sim.spendSp(1)) {
        sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'skill', mult: mult('rin', 'skill', lv.skill), elem: 'Quantum', toughDmg: 15, label: 'Jeweled Sword Zelretch' })
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('rin', 'basic', lv.basic), elem: 'Quantum', toughDmg: 10, label: 'Bajiquan' })
  },

  onStart(sim, u, ctx) {
    ctx.gem = mult('rin', 'talent', 15) // 20 battle-start Gem Energy (the Technique adds +10 separately)
    ctx.shadow = 0
    ctx.freeform = false
    // A2 Elegant Conduct: while Rin on field, max Skill Point limit +2
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 5) { s.maxSp += 2; ctx.rinSp = true }
    sim.log(`Elegant Conduct: max Skill Point limit +2, Gem ${ctx.gem}`)
    // A1 Elegant Conduct: ATK+150% + Quantum RES PEN+15% (self; + Archer if on team)
    const rp = { stat: 'resPen:Quantum', value: 0.15 } as const
    sim.addBuff(u, { id: 'rin_a1', name: 'Elegant Conduct', mods: [{ stat: 'atkPct', value: 1.5 }, rp], turns: 999 })
    const archer = sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'archer' && !c.dead)
    if (archer) sim.addBuff(archer, { id: 'rin_a1_archer', name: 'Elegant Conduct', mods: [{ stat: 'atkPct', value: 1.5 }, rp], turns: 999 })
    // A2 Ladylike Poise: SPD+20% 3t at combat start
    sim.addBuff(u, { id: 'rin_a2_spd', name: 'Ladylike Poise', mods: [{ stat: 'spdPct', value: 0.2 }], turns: 3 })
    // E2 Dimensional Traveler: all allies' Skill DMG becomes 130% of original
    if (((ctx.eidolon as number) ?? 0) >= 2) {
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'rin_e2', name: 'Dimensional Traveler', mods: [{ stat: 'boost:skill', value: 0.3 }], turns: 999 })
    }
    // E6 Nailed It This Time!: All-Type RES PEN +20%
    if (((ctx.eidolon as number) ?? 0) >= 6) sim.addBuff(u, { id: 'rin_e6', name: 'Nailed It This Time!', mods: [{ stat: 'resPenAll', value: 0.2 }], turns: 999 })
  },

  onUnitDeath(sim, _u, ctx) {
    if (!ctx.rinSp) return
    ctx.rinSp = false
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 7) s.maxSp -= 2
    sim.log('Elegant Conduct: max Skill Point limit -2 (Rin down)')
  },

  // Freeform Tohsaka Style resets when Rin's turn ends
  onTurnEnd(_sim, _u, ctx) {
    ctx.freeform = false
  },

  // Talent Freeform Tohsaka Style: after Archer's Skill, if SP ≤ 3 (or Caladbolg used 5× in CC)
  // and not yet triggered this Rin turn → Joint FUA (Archer first, then Rin) on all enemies, +4 SP.
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (dmgType !== 'skill' || attacker.kitId !== 'archer' || target.side !== 'enemy') return
    const rin = findRin(sim)
    if (!rin || rin === attacker) return
    if (ctx.freeform) return
    const seq = sim.attackNo()
    if (ctx.freeformSeq === seq) return
    const lv = levelsOf(ctx)
    const archerCtx = sim.rt(attacker)
    const ccUses = (archerCtx.ccUses as number) ?? 0
    if (sim.sp() > mult('rin', 'talent2_a3', lv.talent) && ccUses < 5) return
    ctx.freeform = true
    ctx.freeformSeq = seq
    const enemies = [...sim.livingEnemiesOf(rin)]
    if (!enemies.length) return
    for (const x of enemies) sim.hit(attacker, x, { type: 'fua', mult: mult('rin', 'talent2_a4', lv.talent), elem: 'Quantum', toughDmg: 10, label: 'Freeform (Archer)' })
    for (const x of [...sim.livingEnemiesOf(rin)]) sim.hit(rin, x, { type: 'fua', mult: mult('rin', 'talent2', lv.talent), elem: 'Quantum', toughDmg: 10, label: 'Freeform (Rin)' })
    sim.gainSp(Math.round(mult('rin', 'talent2_a2', lv.talent)))
    sim.log(`${rin.name} & Archer Freeform Tohsaka Style Joint FUA (+${Math.round(mult('rin', 'talent2_a2', lv.talent))} SP)`)
  },
}

// Talent Gem Magecraft: ally consumes OR recovers SP → that ally CRIT DMG +70% for 2t; Rin +1 Gem per SP
export function rinOnSpChange(sim: SimApi, gained: boolean): void {
  const rin = findRin(sim)
  if (!rin) return
  const ctx = sim.rt(rin)
  const lv = levelsOf(ctx)
  const consumer = sim.currentActor
  if (consumer && consumer.side === 'ally' && consumer.kind === 'char') {
    // E4 Red Devil: Gem Magecraft CD buff on Rin herself can stack to 2
    const eid = (ctx.eidolon as number) ?? 0
    const isRinStack = consumer.kitId === 'rin' && eid >= 4
    sim.addBuff(consumer, {
      id: 'rin_gem_cd', name: 'Gem Magecraft',
      mods: [{ stat: 'critDmg', value: mult('rin', 'talent_a3', lv.talent) }],
      turns: Math.round(mult('rin', 'talent_a2', lv.talent)),
      ...(isRinStack ? { maxStacks: 2 } : {}),
    })
  }
  // every 1 SP consumed/recovered → +1 Gem Energy
  ctx.gem = ((ctx.gem as number) ?? 0) + 1
}

// ===== himeko_nova  (was himeko_nova.ts) =====
const ID = 'himeko_nova'

/** Starblazer fires 6 attacks per Ultimate (skill text: "6 times"); wiki #8 = 3 is the
 *  Hyperluminal animation cycle, so the Ultimate runs two of them. */
const HPB_USES = 6
/** wiki carries NO toughness values for any Himeko • Nova hit — design constants */
const TOUGH_BEAM = 30
const TOUGH_PULSE = 30

/** "Source Energy" cap: 3, E6 -> 6 */
const seCap = (eid: number): number => (eid >= 6 ? 6 : 3)
/** Assist Skill use cap: 1, E1 -> 2 (E2 states the same cap of 2) */
const assistCap = (eid: number): number => (eid >= 1 ? 2 : 1)

/** Companion Protocol: Verdict — only these allies can enter it (skill 151025 notes) */
const VERDICT_KITS = ['danheng', 'danhengil', 'danhengperman', 'sunday']
/** Companion Protocol: Decimation — only these allies can enter it (skill 151026 notes) */
const DECIMATION_KITS = ['march7th', 'evernight', 'welt', 'himeko']

const seOf = (ctx: KitRuntime): number => (ctx.se as number) ?? 0
const addSe = (ctx: KitRuntime, eid: number, n: number): void => { ctx.se = Math.min(seCap(eid), seOf(ctx) + n) }

function novaOf(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === ID && !u.dead)
}

const isTrailblazer = (kitId: string): boolean => kitId.startsWith('trailblazer_')

/** Special Effect a given ally grants when it uses the Assist Skill, or undefined if it grants none.
 *  Trailblazer variants count as Verdict (skill 151025 note). The two lists are disjoint in canon. */
function protocolOf(kitId: string): 'verdict' | 'decimation' | undefined {
  if (isTrailblazer(kitId) || VERDICT_KITS.includes(kitId)) return 'verdict'
  if (DECIMATION_KITS.includes(kitId)) return 'decimation'
  return undefined
}

/** "Trailblaze Companions" character (the Hark! trace category) = any Special-Effect giver. */
const isCompanion = (kitId: string): boolean => protocolOf(kitId) !== undefined

/** Enter (or switch to) a Companion Protocol state. Canon: the two are mutually exclusive and only
 *  entered when a listed ally uses the Assist Skill; the previous protocol's charge is kept. */
function setProtocol(sim: SimApi, u: Unit, ctx: KitRuntime, which: 'verdict' | 'decimation'): void {
  if (ctx.protocol === which) return
  const prev = ctx.protocol as string | undefined
  if (prev === 'verdict') {
    sim.removeBuff(u, 'hn_verdict')
    sim.removeBuff(u, 'hn_verdict_ult')
  } else if (prev === 'decimation') {
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      sim.removeBuff(a, 'hn_decimation')
      sim.removeBuff(a, 'hn_decimation_skill')
    }
  }
  ctx.protocol = which
  if (which === 'verdict') {
    sim.addBuff(u, { id: 'hn_verdict', name: 'Companion Protocol: Verdict', mods: [{ stat: 'dmgAll', value: mult(ID, 'verdict_a2', 15) }], turns: Infinity })
    sim.addBuff(u, { id: 'hn_verdict_ult', name: 'Companion Protocol: Verdict (Ult DMG)', mods: [{ stat: 'boost:ult', value: mult(ID, 'verdict_a4', 15) }], turns: Infinity })
  } else {
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      sim.addBuff(a, { id: 'hn_decimation', name: 'Companion Protocol: Decimation', mods: [{ stat: 'critDmg', value: mult(ID, 'decimation_a2', 15) }], turns: Infinity })
      sim.addBuff(a, { id: 'hn_decimation_skill', name: 'Companion Protocol: Decimation (Skill CRIT DMG)', mods: [{ stat: 'critDmg:skill', value: mult(ID, 'decimation_a4', 15) }], turns: Infinity })
    }
  }
  sim.log(`${u.name}: Companion Protocol: ${which === 'verdict' ? 'Verdict' : 'Decimation'}`)
}

/** Assist Skill "Trailblaze, By Your Side" (151022). `byNova` picks her own branch (params #4/#5/#6,
 *  a free launch) vs a listed ally calling it (params #1/#2/#3). Always typed as a Skill — canon
 *  "Using Assist Skill is considered as Himeko • Nova using her Skill". E6: +1 Source Energy on any
 *  assist use/launch. */
function launchStarblazer(sim: SimApi, u: Unit, ctx: KitRuntime, label: string, byNova: boolean): void {
  const eid = (ctx.eidolon as number) ?? 0
  const boost = (eid >= 2 ? 1.3 : 1) * (eid >= 6 ? 1.75 : 1)
  const main = mult(ID, byNova ? 'assist_a4' : 'assist', 15) * boost
  const per = mult(ID, byNova ? 'assist_a6' : 'assist_a3', 15) * boost
  const inst = mult(ID, byNova ? 'assist_a5' : 'assist_a2', 15) + (eid >= 1 ? 1 : 0) // E1: +1 instance
  ctx.inAssist = true
  sim.hitAoe(u, { type: 'skill', abilityType: 'skill', elem: 'Fire', mult: main, toughDmg: TOUGH_PULSE, pierceRatio: 1, label })
  sim.hitRandom(u, inst, { type: 'skill', abilityType: 'skill', elem: 'Fire', mult: per, toughDmg: 0, pierceRatio: 1, label: `${label} (instance)` })
  ctx.inAssist = false
  if (eid >= 6) addSe(ctx, eid, 1)
  sim.log(`${u.name} Assist Skill: ${label} (charge=${(ctx.charge as number) ?? 0})`)
}

/** Free Assist launch from a Special Effect. Canon: launchable up to #8 (=2) times per battle, reset
 *  after Nova's Ultimate; the launch itself consumes no Assist use (trace "Whither…"). */
function freeLaunch(sim: SimApi, u: Unit, ctx: KitRuntime, label: string): void {
  if (((ctx.free as number) ?? 0) >= mult(ID, 'assist_a8', 15)) return
  ctx.free = ((ctx.free as number) ?? 0) + 1
  launchStarblazer(sim, u, ctx, label, true)
}

/** "Hyperluminal Particle Beam": #1% Fire AoE, +#2 Source Energy (E6: +1 more during the Ult) */
function hyperluminal(sim: SimApi, u: Unit, ctx: KitRuntime, boost: number, idx: number): void {
  const lv = levelsOf(ctx)
  sim.hitAoe(u, {
    type: 'ult', elem: 'Fire', mult: mult(ID, 'ult', lv.ult) * boost,
    toughDmg: TOUGH_BEAM, pierceRatio: 1, label: `Hyperluminal Particle Beam (${idx + 1})`,
  })
  const eid = (ctx.eidolon as number) ?? 0
  addSe(ctx, eid, mult(ID, 'ult_a2', lv.ult) + (eid >= 6 ? 1 : 0))
}

/** "Orbital Annihilation Pulse": burns 1 Source Energy, #9% to the designated enemy, #10% to the rest,
 *  plus 1 random #5% instance per #4 Source Energy consumed while more than 1 is held. #4 is 1 and each
 *  pulse burns exactly 1 Source Energy, so the count is 1 per launch and does NOT scale with the pool.
 *  (trace "The Silver Rail" boosts that random instance by 30% at 3+ Source Energy). */
function orbitalPulse(sim: SimApi, u: Unit, ctx: KitRuntime, boost: number, label: string): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return
  const primary = list[0]
  const seBefore = seOf(ctx)
  // E6: at 6+ Source Energy the pulse adds one AoE instance of 160% ATK
  const burst = eid >= 6 && seBefore >= 6
  for (const e of [...list]) {
    sim.hit(u, e, {
      type: 'ult', elem: 'Fire', mult: (e === primary ? mult(ID, 'ult_a9', lv.ult) : mult(ID, 'ult_a10', lv.ult)) * boost,
      toughDmg: e === primary ? TOUGH_PULSE : Math.round(TOUGH_PULSE / 2), pierceRatio: 1, label,
    })
  }
  ctx.se = seBefore - 1
  if (seBefore > 1) {
    const rail = seBefore >= 3 ? 1.3 : 1
    sim.hitRandom(u, 1, {
      type: 'ult', elem: 'Fire', mult: mult(ID, 'ult_a5', lv.ult) * boost * rail,
      toughDmg: 0, pierceRatio: 1, label: `${label} (Source Energy)`,
    })
  }
  if (burst) sim.hitAoe(u, { type: 'ult', elem: 'Fire', mult: 1.6 * boost, toughDmg: 0, pierceRatio: 1, label: `${label} (E6)` })
}

/** Skill effect: "Upraise the Vanward Cresset" — refill Assist uses, grant Semaphore to all allies. */
function himekoSkill(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  sim.gainEnergy(u, 30)
  ctx.assist = assistCap(eid) // "immediately recovers all Assist Skill uses"
  const turns = mult(ID, 'skill_a2', lv.skill)
  ctx.semTurns = turns
  const dmg = mult(ID, 'skill', lv.skill)
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    sim.addBuff(a, {
      id: 'hn_sem', name: "Navigator's Semaphore",
      mods: [{ stat: 'dmgAll', value: dmg }], turns,
      tickOnSource: true, sourceId: u.id, // decays at the start of HER every turn
    })
  }
  sim.log(`${u.name} Skill: Upraise the Vanward Cresset (Semaphore ${turns}t, Assist uses → ${ctx.assist})`)
}

export const himekoNovaKit: KitDef = {
  id: ID,
  name: 'Himeko • Nova',
  elem: 'Fire',
  energyMax: 150,
  base: { ...PROG.himeko_nova.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Erudition' },

  technique: {
    name: 'Starcharter Cruise',
    kind: 'buff',
    apply(_sim, _u, ctx) { ctx.hnTech = true },
  },

  /** Technique "Starcharter Cruise": after entering combat, auto-uses Skill 1× at the start of each wave. */
  onWaveStart(sim, u, ctx) {
    if (ctx.hnTech) himekoSkill(sim, u, ctx)
  },

  onStart(sim, u, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    u.aggro = 75
    ctx.se = 0
    ctx.charge = 0
    ctx.verdict = 0
    ctx.semTurns = 0
    ctx.inAssist = false
    ctx.free = 0
    ctx.protocol = undefined
    // Talent: Territory "Starblazer Visioscape" + Starblazer on the field. The Starblazer
    // only ever attacks inside the Ultimate or an Assist launch, so it needs no AV slot.
    ctx.starblazer = true
    ctx.assist = assistCap(eid) // Talent grants all allies 1 Assist Skill use (E1: 2)
    sim.log(`${u.name}: Territory "Starblazer Visioscape" deployed`)
    // Talent "Of Fire and Far Faring": #1% CRIT DMG, #2% All-Type RES PEN
    // (E4: the RES PEN boost also applies to all allies, and hers gains +10%)
    const respen = mult(ID, 'talent_a2', lv.talent)
    sim.addBuff(u, { id: 'hn_respen', name: 'Of Fire and Far Faring (All-Type RES PEN)', mods: [{ stat: 'resPenAll', value: respen + (eid >= 4 ? 0.1 : 0) }], turns: Infinity })
    sim.addBuff(u, { id: 'hn_cd', name: 'Of Fire and Far Faring (CRIT DMG)', mods: [{ stat: 'critDmg', value: mult(ID, 'talent', lv.talent) }], turns: Infinity })
    if (eid >= 4) {
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.addBuff(a, { id: 'hn_e4_respen', name: 'Let No Skyward Hand Stay Unheld', mods: [{ stat: 'resPenAll', value: respen }], turns: Infinity })
      }
    }
    if (eid >= 6) sim.addBuff(u, { id: 'hn_e6_fire', name: 'Ours Is the Oath to Sail Starward', mods: [{ stat: 'resPen:Fire', value: 0.2 }], turns: Infinity })
    // Companion Protocol (Verdict / Decimation) is NOT granted at field: canon enters it only when a
    // listed ally uses the Assist Skill (setProtocol from `runAssist`).
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // keep "Navigator's Semaphore" (and the Assist uses it refunds) up
    if (sim.sp() >= 1 && ((ctx.semTurns as number) ?? 0) <= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const boost = eid >= 2 ? 1.3 : 1 // E2: Ultimate DMG x130%
      // Trace "The Silver Rail, Hushed in Antiquity": using the Ultimate GAINS 3 Source Energy
      // (it does not reset the pool — E6 Assist launches bank Source Energy between Ults)
      addSe(ctx, eid, 3)
      // canon (151022): the free-Assist count resets after Himeko • Nova uses her Ultimate
      ctx.free = 0
      sim.log(`${u.name}: takes control of Starblazer`)
      for (let i = 0; i < HPB_USES; i++) {
        if (!sim.livingEnemiesOf(u).length) break
        if (seOf(ctx) >= 1) orbitalPulse(sim, u, ctx, boost, `Orbital Annihilation Pulse (${i + 1}/${HPB_USES})`)
        else hyperluminal(sim, u, ctx, boost, i)
      }
      // "When the uses of HPB are depleted, automatically launches OAP, followed by Final Hit"
      if (seOf(ctx) >= 1 && sim.livingEnemiesOf(u).length) orbitalPulse(sim, u, ctx, boost, 'Orbital Annihilation Pulse (final)')
      if (sim.livingEnemiesOf(u).length) {
        sim.hitRandom(u, mult(ID, 'ult_a6', lv.ult), {
          type: 'ult', elem: 'Fire', mult: mult(ID, 'ult_a7', lv.ult) * boost,
          toughDmg: 0, pierceRatio: 1, label: 'Final Hit',
        })
      }
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      himekoSkill(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), {
      type: 'basic', elem: 'Fire', mult: mult(ID, 'basic', lv.basic),
      toughDmg: 10, pierceRatio: 1, label: 'Enkindle the First Lodestar',
    })
  },

  onTurnStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const cap = assistCap(eid)
    // "At the start of every turn, immediately recovers 1 Assist Skill use"
    // (E2: +1 more while Navigator's Semaphore is up)
    let uses = seOf(ctx) >= 0 ? ((ctx.assist as number) ?? 0) + 1 : 1
    if (eid >= 2 && ((ctx.semTurns as number) ?? 0) > 0) uses += 1
    ctx.assist = Math.min(cap, uses)
    // Trace "Whither, the Last and First Men?": full Assist uses -> 5 Energy
    if (((ctx.assist as number) ?? 0) >= cap) sim.gainEnergy(u, 5)
    // Navigator's Semaphore loses 1 turn at the start of her every turn
    const sem = Math.max(0, ((ctx.semTurns as number) ?? 0) - 1)
    ctx.semTurns = sem
    if (sem === 0) for (const a of sim.allies('ally')) sim.removeBuff(a, 'hn_sem')
  },

  // Verdict: after teammates actively use their Ultimate #9 times -> 1 free Assist Skill
  onAllyUlt(sim, ally, ctx) {
    const u = novaOf(sim)
    if (!u || ctx.protocol !== 'verdict' || ally === u) return
    const eid = (ctx.eidolon as number) ?? 0
    const need = Math.max(1, mult(ID, 'verdict_a3', 15) - (eid >= 1 ? 1 : 0)) // E1: -1 Ult required
    const n = ((ctx.verdict as number) ?? 0) + 1
    if (n < need) { ctx.verdict = n; return }
    ctx.verdict = 0
    sim.log(`${u.name} Verdict: ${ally.name}'s Ult -> free Assist Skill`)
    freeLaunch(sim, u, ctx, 'Companion Protocol: Verdict')
  },

  // Decimation: every enemy target hit by an ally -> 1 Charge; at #9 -> free Assist Skill
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (attacker.side !== 'ally' || target.side !== 'enemy') return
    if (ctx.protocol !== 'decimation' || ctx.inAssist) return // canon: that launch grants no Charge
    const u = novaOf(sim)
    if (!u) return
    const eid = (ctx.eidolon as number) ?? 0
    const need = Math.max(1, mult(ID, 'decimation_a3', 15) - (eid >= 1 ? 3 : 0)) // E1: -3 Charge
    const n = ((ctx.charge as number) ?? 0) + 1
    if (n < need) { ctx.charge = n; return }
    ctx.charge = 0
    sim.log(`${u.name} Decimation: ${need} Charge -> free Assist Skill`)
    freeLaunch(sim, u, ctx, 'Companion Protocol: Decimation')
  },

  /** §P4 offer the Assist Skill to a listed ally (Trailblazer Companion). Canon grants the use to
   *  every ally, but v1 only offers it to a Special-Effect giver so the protocol is always defined.
   *  After a protocol is active, only a giver of the enemy-count-preferred protocol may use it. */
  assistReady(sim, u, actor, ctx) {
    if (((ctx.assist as number) ?? 0) <= 0) return false
    const p = protocolOf(actor.kitId ?? '')
    if (!p) return false
    if (ctx.protocol === undefined) return true
    const pref = sim.livingEnemiesOf(u).length >= 2 ? 'decimation' : 'verdict'
    return p === pref
  },

  /** §P4 resolve a listed ally's Assist Skill: enter/switch the protocol, spend one granted use,
   *  launch the Starblazer (non-Nova params), regenerate #3 (=4) Energy for the user, and grant the
   *  user the "Hark!" extra turn (E2: also non-companions). */
  runAssist(sim, u, actor, ctx) {
    if (((ctx.assist as number) ?? 0) <= 0) return
    const p = protocolOf(actor.kitId ?? '')
    if (!p) return
    setProtocol(sim, u, ctx, p)
    ctx.assist = ((ctx.assist as number) ?? 0) - 1
    launchStarblazer(sim, u, ctx, `Trailblaze, By Your Side (${actor.name})`, false)
    sim.gainEnergyFlat(actor, mult(ID, 'talent_a3', 15)) // Talent #3: +4 Energy to the user
    const eid = (ctx.eidolon as number) ?? 0
    if (isCompanion(actor.kitId ?? '') || eid >= 2) sim.grantExtraTurn(actor) // Hark! trace
  },
}

