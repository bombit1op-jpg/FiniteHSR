// Kits of the Elation path, merged from the former per-character modules (7 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { levelsOf, manualTarget, decideByPattern, type KitDef, type KitRuntime, type SimApi } from '../kit'
import type { Unit, Elem } from '../entities/Unit'
import type { Buff } from '../effects/Buff'
import { mult, PROG } from '../progression'
import { eff } from '../combat/StatResolver'
import { engageFarming, engagePoolsReset, greatEncore, gainPunchline, isElation, cbElationHit, elationHit, punchlineMult, type CBStack } from '../elation'
import { elationLevelMultiplier } from '../combat/LevelMultiplier'

// ===== sparxie  (was sparxie.ts) =====
function pick(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}

/** Thrill offsets Sparxie's Skill Point consumption (consuming Thrill counts as consuming SP). */
function spendSpWithThrill(sim: SimApi, rt: KitRuntime): boolean {
  const thrill = (rt.thrill as number) ?? 0
  if (thrill > 0) {
    rt.thrill = thrill - 1
    return true
  }
  return sim.spendSp(1)
}

/** Effective SP available to Sparxie = pool + Thrill banks. */
function effSp(sim: SimApi, rt: KitRuntime): number {
  return sim.sp() + ((rt.thrill as number) ?? 0)
}

/** A4 (Dazzling! Persona Kaleidoscope): per #Elation chars on team, Ult additionally
 *  gains 2/4/8 Punchline and 1/1/4 Thrill. */
function a4Dazzling(sim: SimApi, u: Unit, rt: KitRuntime): void {
  const elationCount = sim.allies('ally').filter(a => isElation(sim, a)).length
  const punchlineGain = elationCount >= 3 ? 8 : elationCount === 2 ? 4 : 2
  const thrillGain = elationCount >= 3 ? 4 : 1
  gainPunchline(sim, punchlineGain)
  rt.thrill = ((rt.thrill as number) ?? 0) + thrillGain
  sim.log(`${u.name} A4 Dazzling! (+${punchlineGain} Punchline, +${thrillGain} Thrill, ${elationCount} Elation ally)`)
}

export const sparxieKit: KitDef = {
  id: 'sparxie',
  name: 'Sparxie',
  elem: 'Fire',
  energyMax: 160,
  base: { ...PROG.sparxie.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Elation' },
  // 150107 "Content Monetization": Fire DMG 50% ATK to all enemies + 2 Skill Points at battle start.
  technique: {
    name: 'Content Monetization',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Fire', mult: 0.5, toughDmg: 10, label: 'Content Monetization' })
      sim.gainSp(2)
    },
  },
  onStart(sim, u, ctx) {
    u.aggro = 100
    const rt = sim.rt(u)
    rt.thrill = 0
    rt.livestream = false
    rt.engageLeft = 0
    rt.engageCount = 0
    // Gift pools per skill chain (real law, vash transcript "The Actual Probability of Sparxie's Skill")
    rt.engageGrand = 3
    rt.engageMinor = 25
    rt.engagePity = 0
    // E6 BuiltDifferent: All-Type RES PEN +20% (permanent)
    if (((ctx.eidolon as number) ?? 0) >= 6) {
      sim.addBuff(u, { id: 'sparxie_e6', name: '#BuiltDifferent #GoingExtinct', mods: [{ stat: 'resPenAll', value: 0.20 }], turns: Infinity })
    }
  },
  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    const rt = sim.rt(u)
    if (rt.livestream === true && (rt.engageLeft as number) > 0 && effSp(sim, rt) >= 1) return { kind: 'basic' }
    if (effSp(sim, rt) >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  /** Aha Instant: Sparxie uses her Elation Skill (the Great Encore) 1 time. The
   *  simulator grants her a Certified Banger state (punchline taken into the
   *  instant) afterwards — see simulator.ahaTurn. */
  onAhaInstant(sim, u, ctx) {
    greatEncore(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      gainPunchline(sim, 2)
      if (eid >= 4) {
        gainPunchline(sim, 5)
        sim.addBuff(u, { id: 'sparxie_e4', name: '#LockedIn #FaceCard', mods: [{ stat: 'elation', value: 0.36 }], turns: 3 })
      }
      a4Dazzling(sim, u, rt)
      const elation = eff(u).elation
      const multUlt = mult('sparxie', 'ult', lv.ult) + mult('sparxie', 'ult_a2', lv.ult) * elation
      for (const e of enemies) sim.hit(u, e, { type: 'ult', elem: 'Fire', mult: multUlt, toughDmg: 15, label: "Party's Wildin'" })
      // Sleight (ult): CB-produced Elation DMG — no CB → no damage
      for (const e of enemies) cbElationHit(sim, u, e, mult('sparxie', 'talent_a2', lv.ult), 'Sleight (Ult)')
      return
    }

    if (action.kind === 'skill' && spendSpWithThrill(sim, rt)) {
      sim.gainEnergy(u, 30)
      rt.livestream = true
      rt.engageCount = 0
      rt.engageLeft = mult('sparxie', 'skill', lv.skill)
      engageFarming(sim, u)
      sim.log(`${u.name} Boom! livestream up (Engagement Farming ${rt.engageLeft}×)`)
      return
    }

    // basic
    if (rt.livestream === true && (rt.engageLeft as number) > 0) {
      const t = manualTarget(sim, action, pick(sim, u)!)
      const n = (rt.engageCount as number) ?? 0
      const main = mult('sparxie', 'basic_en', lv.basic) + n * mult('sparxie', 'engage', lv.skill)
      const adj = mult('sparxie', 'basic_en_a2', lv.basic) + n * mult('sparxie', 'engage_a2', lv.skill)
      sim.hitBlast(u, t,
        { type: 'basic', elem: 'Fire', mult: main, toughDmg: 20, label: 'Bloom (main)' },
        { type: 'basic', elem: 'Fire', mult: adj, toughDmg: 10, label: 'Bloom (adj)' })
      // Sleight (main/adj): CB-produced Elation DMG — no CB → no damage
      cbElationHit(sim, u, t, mult('sparxie', 'talent_a3', lv.talent), 'Sleight (main)')
      cbElationHit(sim, u, t, mult('sparxie', 'talent_a4', lv.talent), 'Sleight (adj)')
      // Talent 150104: "for every 1 instance of Engagement Farming triggered, the Enhanced Basic
      // ATK deals 1 extra instance of #1[f1]% Fire Elation DMG to 1 random attacked enemy target".
      // The Skill itself triggers Engagement Farming once, so the k-th Bloom carries k instances
      // (engageCount before the increment is k-1). This is the livestream's main damage curve.
      const stream = n + 1
      for (let i = 0; i < stream; i++) {
        const live = sim.livingEnemiesOf(u)
        if (!live.length) break
        cbElationHit(sim, u, sim.rngPick(live), mult('sparxie', 'talent', lv.talent), `Sleight (stream ${i + 1}/${stream})`, 'Fire', undefined, true)
      }
      rt.engageLeft = (rt.engageLeft as number) - 1
      rt.engageCount = n + 1
      engageFarming(sim, u)
      // the stream cap is 20 Engagement Farming triggers = 20 Enhanced Basics, but a
      // 2-5 cycle fight only gives Sparxie 2-6 turns, so the engage scaling, the per-instance
      // Elation of Talent 150104 (max ~5 instances) and the stream payoff are all unreachable.
      // The Great Encore (150120) is her Elation Skill and canonically fires from Aha Instant
      // only (`onAhaInstant` above) — it is NOT triggered by the stream ending, so nothing fires
      // here. Keeping the literal "1 trigger per Enhanced Basic" reading of 150102.
    } else {
      engagePoolsReset(sim, u)  // skill chain ended with a basic attack: pools → 3/25, pity carries
      sim.gainSp(1)
      sim.gainEnergy(u, 20)
      const t = manualTarget(sim, action, pick(sim, u)!)
      sim.hit(u, t, { type: 'basic', elem: 'Fire', mult: mult('sparxie', 'basic', lv.basic), toughDmg: 10, label: 'Cat Got Your Flametongue?' })
    }
  },
}


// ===== yao_guang  (was yao_guang.ts) =====
function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

/** Skill effect: "Decalight Unveils All" zone — allies gain a share of Yao Guang's Elation, +Punchline. */
function yaoSkill(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(u)
  sim.gainEnergy(u, 30)
  rt.ygZone = mult('yao_guang', 'skill', lv.skill)
  const elat = mult('yao_guang', 'skill_a2', lv.skill) * (eff(u).elation)
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    const mods: Array<{ stat: 'elation' | 'spdPct'; value: number }> = [{ stat: 'elation', value: elat }]
    if (eid(ctx) >= 2) {
      mods.push({ stat: 'elation', value: 0.16 }) // E2: additionally +16% Elation
      mods.push({ stat: 'spdPct', value: 0.12 }) // E2: all ally SPD+12%
    }
    sim.addBuff(a, { id: 'yg_zone', name: 'Decalight Unveils All', mods: mods as never, turns: Infinity })
  }
  // Skill 150202: after Yao Guang uses Basic or Skill, gains #3 Punchline (zone not required)
  sim.gainPunchline(mult('yao_guang', 'skill_a3', lv.skill))
  sim.log(`${u.name} Skill: Decalight Unveils All (zone, Elation share)`)
}

export const yao_guangKit: KitDef = {
  id: 'yao_guang',
  name: 'Yao Guang',
  elem: 'Physical',
  energyMax: 180,
  base: { ...PROG.yao_guang.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 150201 "Untethered Glimmer Sails Far": auto-uses Skill 1× at battle start, no SP.
  technique: {
    name: 'Untethered Glimmer Sails Far',
    kind: 'buff',
    zone: true,
    apply(sim, u, ctx) { yaoSkill(sim, u, ctx) },
  },
  decide(sim, _u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.allies('enemy').filter(e => !e.dead)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.gainPunchline(mult('yao_guang', 'ult', lv.ult))
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'yg_rpen', name: 'Hexagram of Feathered Fortune', mods: [{ stat: 'resPenAll', value: mult('yao_guang', 'ult_a2', lv.ult) }], turns: mult('yao_guang', 'ult_a3', lv.ult) })
      }
      // Aha gains an extra turn with a fixed Punchline amount; does not consume the pool.
      const aha: Unit | undefined = (sim as unknown as { aha?: Unit }).aha
      if (aha) {
        aha.av = 0
        sim.log(`${u.name}: Aha granted an extra turn`)
        if (eid(ctx) >= 4) {
          for (const a of sim.allies('ally')) {
            if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'yg_e4', name: 'Auspices Mirrored In Decalight', mods: [{ stat: 'dmgAll', value: 0.5 }], turns: 1 })
          }
        }
      }
      // Elation Skill: Woe's Whisper + AoE Physical Elation DMG + random instances.
      // Fixed Punchline taken into account (does NOT consume the shared pool).
      const fixP = eid(ctx) >= 1 ? 40 : mult('yao_guang', 'ult_a4', lv.ult)
      sim.fireElationSkill(u, 'let_thy_fortune')
      const woe = mult('yao_guang', 'el_skill_a3', lv.talent)
      const turns = mult('yao_guang', 'el_skill_a4', lv.talent)
      for (const e of enemies) sim.addBuff(e, { id: 'yg_woe', name: "Woe's Whisper DMG Taken+", mods: [{ stat: 'vulnAll', value: woe }], turns, debuff: true })
      const aoeBase = mult('yao_guang', 'el_skill_a2', lv.talent) * (eid(ctx) >= 6 ? 2 : 1)
      for (const e of [...sim.allies('enemy')]) {
        if (!e.dead) elationHit(sim, u, e, aoeBase, 'Let Thy Fortune Burst', u.elem, true, fixP)
      }
      for (let i = 0; i < mult('yao_guang', 'el_skill_a5', lv.talent); i++) {
        const pool = sim.allies('enemy').filter(x => !x.dead)
        if (!pool.length) break
        elationHit(sim, u, sim.rngPick(pool), mult('yao_guang', 'el_skill_a6', lv.talent) * (eid(ctx) >= 6 ? 2 : 1), 'Let Thy Fortune (random)', u.elem, true, fixP)
      }
      // CB granted at the END of the instant — so this Ult's own Elation hits don't self-proc Boon.
      sim.addCb(u, fixP)
      const stacks = rt.cbStacks as { pts: number; turns: number }[] | undefined
      if (stacks?.length) stacks[stacks.length - 1].turns = 3 // A2: CB lasts one more turn
      sim.log(`${u.name}: Certified Banger ${stacks?.at(-1)?.pts} (${stacks?.at(-1)?.turns} turns)`)
      sim.gainSp(1) // A1 Poised and Sated: Elation Skill recovers 1 SP
      return
    }

    if (action.kind === 'skill') {
      if (sim.spendSp(1)) yaoSkill(sim, u, ctx)
      return
    }

    sim.gainEnergy(u, 30) // Basic ATK Energy increases to 30
    const primary = manualTarget(sim, action, enemies[0])
    sim.hitBlast(u, primary, { type: 'basic', mult: mult('yao_guang', 'basic', lv.basic), elem: 'Physical', toughDmg: 30, label: 'Whistlebolt Sings Joy' }, { type: 'basic', mult: mult('yao_guang', 'basic_a2', lv.basic), elem: 'Physical', toughDmg: 15, label: 'Whistlebolt (adjacent)' })
  },

  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    rt.ygZone = 0
    rt.ygBoonBusy = false
    // A0 Amaze-In Grace: SPD ≥120 → Elation +30% + 1%/SPD (cap 200)
    const spd = u.base.spd
    if (spd >= 120) {
      const elat = 0.30 + Math.min(200, spd - 120) * 0.01
      sim.addBuff(u, { id: 'yg_a0', name: 'Amaze-In Grace', mods: [{ stat: 'elation', value: elat }], turns: Infinity })
    }
    // A1 Poised and Sated: CRIT DMG +60%
    sim.addBuff(u, { id: 'yg_a1', name: 'Poised and Sated', mods: [{ stat: 'critDmg', value: 0.6 }], turns: Infinity })
    // E1: all allies ignore 20% DEF on Elation DMG (flatten to all DMG)
    if (eid(ctx) >= 1) {
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'yg_e1', name: 'Chuckle Chimes Where Jade Falls', mods: [{ stat: 'defIgnore', value: 0.2 }], turns: Infinity })
      }
    }
    // E6: all allies Merrymake +25%
    if (eid(ctx) >= 6) {
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'yg_e6', name: 'Ferried Along the Astral Arc', mods: [{ stat: 'merrymake', value: 0.25 }], turns: Infinity })
      }
    }
  },

  onTurnStart(sim, u, _ctx) {
    const rt = sim.rt(u)
    if ((rt.ygZone as number) > 0) {
      rt.ygZone = (rt.ygZone as number) - 1
      if ((rt.ygZone as number) <= 0) {
        sim.log(`${u.name}: Decalight Zone ends`)
        for (const a of sim.allies('ally')) sim.removeBuff(a, 'yg_zone')
      }
    }
  },

  /** Great Boon is a per-HIT reaction (golden: main hit → Boon → adjacent hit → Boon). It is safe
   *  per-hit because the talent's own Elation DMG no longer re-procs it (see `onAfterAttack`); the
   *  old `'attack'` window only masked the runaway loop and diverged from the verified trace. */
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (target.side !== 'enemy' || attacker.side !== 'ally') return
    const u = sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'yao_guang' && !a.dead)
    if (!u) return
    const rt = sim.rt(u)
    if (attacker === u && dmgType === 'basic') {
      // Skill 150202: +3 Punchline after Basic ATK (Skill handled in skill branch — no hit).
      const seq = sim.attackNo()
      if ((rt.ygSeq as number) !== seq) {
        rt.ygSeq = seq
        sim.gainPunchline(mult('yao_guang', 'skill_a3', levelsOf(ctx).skill))
      }
    }
    // Talent: Great Boon — while holding Certified Banger, ally attacks deal Elation DMG.
    // Boon sources the Elation/CB from the ally with the HIGHER Elation (attacker if it
    // beats Yao Guang's, else Yao Guang), while the hit is owned by the attacker (kills
    // -> attacker energy). Aha instant: only Elation Skill damage procs it.
    // Boon's own trigger "is not considered as using 1 instance of attack", so its Elation
    // DMG must not re-proc the talent — otherwise the deferred reaction loops (GB -> Elation
    // DMG -> GB). Elation-typed hits that reach here are bonus damage, not an attack use.
    if (dmgType === 'elation') return
    if (rt.ygBoonBusy) return
    if (sim.cbOf(u) <= 0) return
    rt.ygBoonBusy = true
    const lv = levelsOf(ctx)
    const count = 1 + (dmgType === 'skill' ? 1 : 0) // SP-consuming attacks Boon twice
    const src = eff(attacker).elation >= eff(u).elation ? attacker : u
    for (let i = 0; i < count; i++) {
      const pool = sim.allies('enemy').filter(x => !x.dead)
      if (!pool.length) break
      cbElationHit(sim, attacker, sim.rngPick(pool), mult('yao_guang', 'talent', lv.talent), 'Great Boon', attacker.elem, src)
    }
    rt.ygBoonBusy = false
  },
}

// ===== trailblazer_elation  (was trailblazer_elation.ts) =====
const TID = 'trailblazer_elation'

/** Talent That Smile Hits Different: Lightning Elation DMG using the HIGHEST
 *  Certified Banger among all allies (docs: CB-based effects use the char's own CB;
 *  this specific talent reads the whole team). Static talents stack via max. */
function tbMaxCbHit(sim: SimApi, u: Unit, base: number, label: string): void {
  let hi = 0
  for (const a of sim.allies('ally')) hi = Math.max(hi, sim.cbOf(a))
  if (hi <= 0) return
  const elation = eff(u).elation
  const merrymake = eff(u).merrymake
  const m = elationLevelMultiplier(u.base.level) * base * (1 + elation) * punchlineMult(hi) * (1 + merrymake)
  for (const e of [...sim.livingEnemiesOf(u)]) {
    sim.hit(u, e, { type: 'elation', elem: 'Lightning', statValue: 1, mult: m, label })
  }
}

/** I Said "Elation," Did I Stutter? — the TB Elation Skill.
 *  `pm` = fixed Punchline multiplier (when granted by the Ultimate with ult_a5),
 *  else the shared team pool. */
function elationSkill(sim: SimApi, u: Unit, ctx: KitRuntime, pm?: number): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  sim.fireElationSkill(u, 'trailblazer_elation')
  const enemies = sim.livingEnemiesOf(u)
  // E4: enemies take +10% DMG (vulnAll) for 2 turns
  if (eid >= 4) {
    for (const e of enemies) sim.addBuff(e, { id: 'tb_ela_e4', name: 'Save the World, Just Because DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 2 })
  }
  // E6: self CRIT DMG +100%, 3 turns
  if (eid >= 6) sim.addBuff(u, { id: 'tb_ela_e6', name: 'The Cosmic Legend Cometh', mods: [{ stat: 'critDmg', value: 1.0 }], turns: 3 })
  if (enemies.length === 0) return
  const el = eff(u).elation
  const merry = eff(u).merrymake
  const pmult = pm ?? punchlineMult(sim.punchlinePool())
  const m = (base: number) => elationLevelMultiplier(u.base.level) * base * (1 + el) * pmult * (1 + merry)
  const n = mult(TID, 'el_skill', lv.skill) // 8 random-target instances
  for (let i = 0; i < n; i++) {
    const e = sim.rngPick(enemies)
    if (e.dead || e.hp <= 0) continue
    sim.hit(u, e, { type: 'elation', elem: 'Lightning', statValue: 1, mult: m(mult(TID, 'el_skill_a2', lv.skill)), label: 'I Said "Elation," Did I Stutter? (random)' })
  }
  // last: el_skill_a3%, split evenly among all enemies
  const each = mult(TID, 'el_skill_a3', lv.skill) / enemies.length
  for (const e of enemies) {
    if (e.dead || e.hp <= 0) continue
    sim.hit(u, e, { type: 'elation', elem: 'Lightning', statValue: 1, mult: m(each), label: 'I Said "Elation," Did I Stutter? (split)' })
  }
}

// {NICKNAME} — The Elation path
export const trailblazerElationKit: KitDef = {
  id: TID,
  name: '{NICKNAME}',
  elem: 'Lightning',
  energyMax: 160,
  base: { ...PROG.trailblazer_elation.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Elation' },
  // #800713 "We Are So Back!" (Technique): all allies' Elation +30% (low-roll) or +20% (high-roll) for 3 turns.
  technique: {
    name: 'We Are So Back!',
    kind: 'buff',
    apply(sim, u, _ctx) {
      const v = sim.rng() < 0.1 ? 0.3 : 0.2
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'tb_el_tech', name: 'We Are So Back! (Elation)', mods: [{ stat: 'elation', value: v }], turns: 3 })
      sim.log(`${u.name} Technique: allies +${Math.round(v * 100)}% Elation (3t)`)
    },
  },

  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return decideByPattern(sim, u, ctx) // skill-priority: builds Certified Banger
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const enemies = sim.livingEnemiesOf(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      gainPunchline(sim, mult(TID, 'ult_a6', lv.ult)) // +5 Punchline
      const e1 = eid >= 1 ? Math.min(3, (rt.tbElaE1 as number) ?? 0) : 0
      // Enchanted Praise: one designated ally
      const allies = sim.allies('ally').filter(a => a.kind === 'char' && a.id !== u.id)
      const ela = allies.filter(a => isElation(sim, a))
      let pick: Unit | undefined
      if (ela.length) pick = ela[0]
      else if (allies.length) pick = allies.reduce((best, a) => (eff(a).atk > eff(best).atk ? a : best), allies[0])
      if (pick) {
        sim.addBuff(pick, { id: 'tb_ela_ult', name: 'May the Trailblaze Fly You Starward', mods: [{ stat: 'critDmg', value: mult(TID, 'ult', lv.ult) }], turns: mult(TID, 'ult_a2', lv.ult) })
        if (eid >= 2) sim.addBuff(pick, { id: 'tb_ela_e2', name: 'History in the Making', mods: [{ stat: 'elation', value: 0.12 }], turns: 2 })
        if (isElation(sim, pick)) {
          // has an Elation Skill: +CB, immediately use that Elation Skill 1 time
          // with the fixed Punchline amount ult_a5
          const eps = mult(TID, 'ult_a4', lv.ult) + 2 * e1
          sim.addCb(pick, eps)
          if (pick === u) elationSkill(sim, u, ctx, punchlineMult(mult(TID, 'ult_a5', lv.ult)))
          // other Elation ally (Sparxie): CB only — their skill fires via Aha
        } else if (e1 > 0) {
          sim.addCb(pick, 2 * e1) // E1: extra CB to ally targets
          sim.advance(pick, mult(TID, 'ult_a3', lv.ult))
        } else {
          sim.advance(pick, mult(TID, 'ult_a3', lv.ult))
        }
      }
      rt.tbElaE1 = 0
      sim.gainSp(1) // Screw It, We Ball: after ult, +1 SP
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      for (const e of enemies) {
        sim.hit(u, e, { type: 'skill', elem: 'Lightning', mult: mult(TID, 'skill', lv.skill), toughDmg: 10, label: 'Let the Storm Rage On' })
      }
      sim.addCb(u, mult(TID, 'skill_a2', lv.skill)) // 20 CB to self
      rt.tbElaE1 = Math.min(3, ((rt.tbElaE1 as number) ?? 0) + 1) // E1 stack
      // Aha, Sic 'Em!: ally Elation Skill → TB's next Skill +2 CB
      if ((rt.tbElaAhaLeft as number) > 0) {
        sim.addCb(u, 2)
        rt.tbElaAhaLeft = (rt.tbElaAhaLeft as number) - 1
      }
      // Talent: while holding CB, Skill additionally deals Lightning Elation DMG
      // (highest CB among all allies)
      if (sim.cbOf(u) > 0) tbMaxCbHit(sim, u, mult(TID, 'talent_a3', lv.talent), 'That Smile Hits Different')
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', elem: 'Lightning', mult: mult(TID, 'basic', lv.basic), toughDmg: 10, label: 'Make Some Noise' })
  },

  // Talent That Smile Hits Different: after using an attack, +talent% Energy and
  // +talent_a2 Punchline (once per attack).
  onAfterAttack(sim, attacker, _target, _dmgType, ctx) {
    if (attacker.kitId !== TID) return
    const rt = sim.rt(attacker)
    if (rt.tbElaAtkSeq === sim.attackNo()) return
    rt.tbElaAtkSeq = sim.attackNo()
    sim.gainEnergy(attacker, mult(TID, 'talent', levelsOf(ctx).talent))
    gainPunchline(sim, mult(TID, 'talent_a2', levelsOf(ctx).talent))
  },

  // Aha Instant ({K}nutty Banger): TB uses her own Elation Skill
  onAhaInstant(sim, u, ctx) {
    elationSkill(sim, u, ctx)
    // Aha, Sic 'Em!: next own Skill gains +2 CB (stacks once)
    const rt = sim.rt(u)
    rt.tbElaAhaLeft = ((rt.tbElaAhaLeft as number) ?? 0) + 1
  },
}

// ===== pearl  (was pearl.ts) =====
const PID = 'pearl'

function rt(sim: SimApi, u: Unit): KitRuntime {
  return sim.rt(u)
}

function pearlOf(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kitId === PID)
}

/** Elation-path characters on the team (drives Pearl's tiered Elation effects). */
function elationCount(sim: SimApi): number {
  return sim.allies('ally').filter(a => a.kind === 'char' && isElation(sim, a)).length
}

/** Pearl's Certified Banger = Repellency pool. 1 CB = 200 Repellency; cap 50 CB (10000). */
function addRep(r: KitRuntime, pts: number): void {
  r.pearlRep = Math.min(10000, ((r.pearlRep as number) ?? 0) + pts * 200)
}
function rep(r: KitRuntime): number {
  return (r.pearlRep as number) ?? 0
}

/** Elation DMG whose Elation/Punchline/Merrymake come from `src` while the hit is owned by `owner`. */
function elationFrom(sim: SimApi, owner: Unit, src: Unit, t: Unit, base: number, elem: Elem, label: string): void {
  const m = elationLevelMultiplier(owner.base.level) * base * (1 + eff(src).elation) * punchlineMult(sim.punchlinePool()) * (1 + eff(src).merrymake)
  sim.hit(owner, t, { type: 'elation', elem, statValue: 1, mult: m, label })
}

function pickArchetype(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const chars = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== u.id)
  if (!chars.length) return undefined
  const main = ctx.mainDpsId as string | undefined
  if (main) {
    const m = chars.find(a => a.id === main || a.kitId === main)
    if (m) return m
  }
  const ela = chars.filter(a => isElation(sim, a))
  const pool = ela.length ? ela : chars
  return pool.reduce((b, a) => (eff(a).atk > eff(b).atk ? a : b), pool[0])
}

/**
 * Pearl — Elation (Ice), DEF-scaling healer/support (id 78).
 * Basic "Brushstroke: Trace the Severed Stream": Ice %DEF single.
 * Skill "Relume Life's Light": +15 Certified Banger + DEF heal all (+ extra lowest-HP).
 * Ult "Appraise Soul's Ground": +20 CB, "Deep Learning" on a designated ally (Aesthetic Archetype),
 *   advance (tiered by Elation count) + extra turn at 4+ Elation; enhanced Basic ATK while active.
 * Talent "Grow Grace from Grit": CB = Repellency (200/CB, cap 50) blocks 60% incoming ally DMG;
 *   ally ≤50% HP takes −30%.
 * Elation Skill "Dissolve Reason into Elation": allies deal extra Elation DMG after their next attack.
 */
export const pearlKit: KitDef = {
  id: PID,
  name: 'Pearl',
  elem: 'Ice',
  energyMax: 180,
  base: {
    ...PROG.pearl.base,
    level: 80,
    critRate: 0.05,
    critDmg: 0.5,
  },
  // #150904 "Recast Masterwork in Nacre" (Technique): +20 Certified Banger (Repellency) and
  // "Deep Learning" (2 charges) on the Aesthetic Archetype ally.
  technique: {
    name: 'Recast Masterwork in Nacre',
    kind: 'buff',
    apply(sim, u, ctx) {
      const r = rt(sim, u)
      addRep(r, 20)
      const arch = pickArchetype(sim, u, ctx)
      if (arch) {
        r.pearlArchetype = arch.id
        r.pearlDeep = 2
        sim.addBuff(arch, { id: 'pearl_deep', name: 'Deep Learning', mods: [], turns: 999 })
        sim.log(`Pearl Technique: +20 CB, Deep Learning (2) on ${arch.name}`)
      } else {
        sim.log('Pearl Technique: +20 CB (no Aesthetic Archetype ally)')
      }
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt(sim, u)
    r.pearlRep = 0
    r.pearlDeep = 0
    r.pearlArchetype = undefined
    r.pearlE1 = 2
    r.pearlFirewall = 1

    // A0 Panoptic Vision: DEF≥2400 → Elation +32%, +3% per 100 DEF over (cap 3600 excess); OHB = 20% Elation
    const def = sim.effDef(u)
    const excess = Math.min(3600, Math.max(0, def - 2400))
    const el = def >= 2400 ? 0.32 + 0.03 * (excess / 100) : 0
    if (el > 0) sim.addBuff(u, { id: 'pearl_a0', name: 'Panoptic Vision', mods: [{ stat: 'elation', value: el }], turns: 999 })
    const totEl = eff(u).elation + el
    sim.addBuff(u, { id: 'pearl_a0_ohb', name: 'Panoptic Vision OHB', mods: [{ stat: 'outHeal', value: 0.2 * totEl }], turns: 999 })

    // E1 Nestle That Pearl in Uninked Tides: all-allies Elation +10/20/60% by Elation count (2/3/4+)
    if (eid >= 1) {
      const ec = elationCount(sim)
      const v = ec >= 4 ? 0.6 : ec >= 3 ? 0.2 : ec >= 2 ? 0.1 : 0
      if (v > 0) for (const a of sim.allies('ally')) sim.addBuff(a, { id: 'pearl_e1', name: 'Nestle That Pearl in Uninked Tides', mods: [{ stat: 'elation', value: v }], turns: 999 })
    }
    // E2 Crop That Dappled Dawn: Merrymake all allies' Elation DMG +15%
    if (eid >= 2) for (const a of sim.allies('ally')) sim.addBuff(a, { id: 'pearl_e2', name: 'Crop That Dappled Dawn', mods: [{ stat: 'merrymake', value: 0.15 }], turns: 999 })

    // Talent Grow Grace from Grit: CB-as-Repellency interceptor + ≤50%-HP DMG-taken −30%
    const pearlRef = u
    sim.addLossInterceptor((t, dmg) => {
      if (t.kind !== 'char' || t.side !== 'ally' || pearlRef.dead) return 0
      const rr = rt(sim, pearlRef)
      let left = dmg
      let absorbed = 0
      if (t.maxHp > 0 && t.hp / t.maxHp <= 0.5) {
        const m = left * 0.3
        absorbed += m
        left -= m
      }
      const repNow = (rr.pearlRep as number) ?? 0
      if (repNow > 0 && left > 0) {
        const b = Math.min(repNow, left * 0.6)
        absorbed += b
        left -= b
        rr.pearlRep = repNow - b
      }
      if (absorbed > 0 && !rr.pearlRepLogged) {
        rr.pearlRepLogged = true
        sim.log(`Pearl Repellency blocks ${Math.round(absorbed)} (${t.name})`)
      }
      return absorbed
    })
  },

  // A2 Sensory Latitude: ally turn begins → Pearl +5 CB (cap 50); while holding CB, all allies Effect RES +50%
  onAllyTurnStart(sim, _ally, _ctx) {
    const p = pearlOf(sim)
    if (!p || p.dead) return
    addRep(rt(sim, p), 5)
    if (rep(rt(sim, p)) > 0) {
      for (const a of sim.allies('ally')) if (a.kind === 'char') sim.addBuff(a, { id: 'pearl_a2', name: 'Sensory Latitude', mods: [{ stat: 'effRes', value: 0.5 }], turns: 2 })
    }
  },

  // E1: fatal damage on an ally → restore 50% Max HP instead of knockdown (2×/battle)
  onAllyHit(sim, _attacker, target, _dmg, _ctx) {
    const p = pearlOf(sim)
    if (!p || p.dead) return
    const r = rt(sim, p)
    if (target.side !== 'ally' || target.kind !== 'char') return
    if (target.hp <= 0 && ((r.pearlE1 as number) ?? 0) > 0) {
      sim.revive(target, Math.round(target.maxHp * 0.5), p)
      r.pearlE1 = ((r.pearlE1 as number) ?? 0) - 1
      sim.log(`Pearl E1: ${target.name} saved from defeat (${target.hp} HP)`)
    }
  },

  // A3 Aesthetic Firewall: after combat+ult, the Elation Archetype's next Ult → +90 flat Energy for Pearl
  onAllyUlt(sim, ally, _ctx) {
    const p = pearlOf(sim)
    if (!p || p.dead) return
    const r = rt(sim, p)
    if (ally.id === (r.pearlArchetype as string) && isElation(sim, ally) && ((r.pearlFirewall as number) ?? 0) > 0) {
      r.pearlFirewall = 0
      sim.gainEnergyFlat(p, 90)
      sim.log('Pearl A3 Aesthetic Firewall: +90 Energy')
    }
  },

  onAfterAttack(sim, attacker, _target, dmgType, ctx, _dmg) {
    const pearl = pearlOf(sim)
    if (!pearl || pearl.dead) return
    const r = rt(sim, pearl)
    // guard: the extra Elation/Deep-Learning hits below fire onAfterAttack again
    if (r.pearlBusy) return
    r.pearlBusy = true
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    // Deep Learning: the Archetype's Basic ATK is enhanced (AoE %DEF + heal + extra Elation DMG)
    if (dmgType === 'basic' && r.pearlArchetype === attacker.id && ((r.pearlDeep as number) ?? 0) > 0) {
      const isEl = isElation(sim, attacker)
      const en = sim.livingEnemiesOf(pearl)
      const base = isEl ? mult(PID, 'basic_en', lv.basic) : mult(PID, 'basic_en2', lv.basic)
      for (const e of en) sim.hit(pearl, e, { type: 'basic', elem: 'Ice', scaleStat: 'def', mult: base, toughDmg: 30, label: isEl ? 'Brushstroke: Imagenate the Starry Night' : 'Brushstroke: Render the Great Wave' })
      const heal = sim.effDef(pearl) * mult(PID, 'basic_en_a2', lv.basic) + mult(PID, 'basic_en_a4', lv.basic)
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.heal(a, heal)
      const low = sim.lowestHpAlly(pearl)
      if (low) sim.heal(low, heal)
      // after attacking: +0.6% Ice Elation DMG using the Archetype's stats
      for (const e of en) elationFrom(sim, attacker, attacker, e, mult(PID, 'ult_a2', lv.ult), 'Ice', 'Deep Learning')
      // Elation-path Archetype: +0.2% Ice Elation DMG while Pearl holds CB
      if (isEl && rep(r) > 0) for (const e of en) elationFrom(sim, attacker, attacker, e, mult(PID, 'basic_en_a5', lv.basic), 'Ice', 'Imagenate the Starry Night (CB)')
      // E6: +240% Ice Elation DMG using the Archetype's stats
      if (eid >= 6) for (const e of en) elationFrom(sim, attacker, attacker, e, 2.4, 'Ice', 'Compute Life From One Shell (E6)')

      r.pearlDeep = ((r.pearlDeep as number) ?? 0) - 1
      if ((r.pearlDeep as number) <= 0) {
        r.pearlArchetype = undefined
        sim.removeBuff(attacker, 'pearl_deep')
        for (const a of sim.allies('ally')) sim.removeBuff(a, 'pearl_e6')
      }
    }

    // Elation Skill "Dissolve Reason into Elation": ally deals extra Elation DMG after their next attack
    if (sim.hasBuff(attacker, 'pearl_el') && r.pearlElSeq !== sim.attackNo()) {
      r.pearlElSeq = sim.attackNo()
      const pct = (r.pearlElPct as number) ?? 0
      for (const e of sim.livingEnemiesOf(pearl)) elationFrom(sim, attacker, attacker, e, pct, attacker.elem, 'Dissolve Reason into Elation')
      sim.removeBuff(attacker, 'pearl_el')
    }
    r.pearlBusy = false
  },

  // Aha Instant: Pearl uses her Elation Skill
  onAhaInstant(sim, u, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const ec = elationCount(sim)
    let base = ec >= 4 ? mult(PID, 'el_skill_a4', lv.skill) : ec >= 3 ? mult(PID, 'el_skill_a3', lv.skill) : ec >= 2 ? mult(PID, 'el_skill_a2', lv.skill) : mult(PID, 'el_skill', lv.skill)
    if (eid >= 4) base *= 2
    const r = rt(sim, u)
    r.pearlElPct = base
    r.pearlElSeq = -1
    for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'pearl_el', name: 'Dissolve Reason into Elation', mods: [], turns: 2 })
    sim.fireElationSkill(u, 'pearl')
    sim.log(`Pearl Dissolve Reason into Elation (${Math.round(base * 1000) / 10}% Elation, ${ec} Elation chars)`)
  },

  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt(sim, u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      addRep(r, mult(PID, 'ult_a3', lv.ult)) // +20 Certified Banger
      const arch = pickArchetype(sim, u, ctx)
      if (arch) {
        const prev = r.pearlArchetype as string | undefined
        if (prev && prev !== arch.id) {
          const p = sim.find(prev)
          if (p) sim.removeBuff(p, 'pearl_deep')
        }
        r.pearlArchetype = arch.id
        r.pearlDeep = mult(PID, 'ult', lv.ult) // Deep Learning charges (3)
        sim.addBuff(arch, { id: 'pearl_deep', name: 'Deep Learning', mods: [], turns: 999 })
        sim.log(`Pearl Ult: Deep Learning on ${arch.name}`)
        if (eid >= 6) for (const a of sim.allies('ally')) sim.addBuff(a, { id: 'pearl_e6', name: 'Compute Life From One Shell', mods: [{ stat: 'resPenAll', value: 0.2 }], turns: 999 })
        const ec = elationCount(sim)
        const pct = ec >= 3 ? mult(PID, 'ult_a6', lv.ult) : ec >= 2 ? mult(PID, 'ult_a5', lv.ult) : mult(PID, 'ult_a4', lv.ult)
        // advance targets the waiting Archetype (and other Elation chars at E2), never self mid-own-turn → real
        sim.advance(arch, pct)
        if (eid >= 2) for (const a of sim.allies('ally')) if (a.kind === 'char' && isElation(sim, a) && a.id !== u.id && a.id !== arch.id) sim.advance(a, pct)
        sim.log(`Pearl Ult: advance ${arch.name} ${Math.round(pct * 100)}%${eid >= 2 ? ' + Elation chars' : ''}`)
        if (ec >= 4) {
          const mul = eid >= 2 ? 2 : 1
          addRep(r, mult(PID, 'ult_a8', lv.ult) * mul) // +30 CB
          sim.gainPunchline(mult(PID, 'ult_a7', lv.ult) * mul) // +60 Punchline
          sim.grantExtraTurn(arch)
        }
      }
      // +5 energy from castUlt
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      addRep(r, mult(PID, 'skill', lv.skill)) // +15 Certified Banger
      const heal = sim.effDef(u) * mult(PID, 'skill_a2', lv.skill) + mult(PID, 'skill_a3', lv.skill)
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.heal(a, heal)
      const low = sim.lowestHpAlly(u)
      if (low) sim.heal(low, heal)
      sim.log(`Pearl Skill: Relume Life's Light (+15 CB, heal ${Math.round(heal)})`)
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    if (!t) return
    sim.hit(u, t, { type: 'basic', elem: 'Ice', scaleStat: 'def', mult: mult(PID, 'basic', lv.basic), toughDmg: 30, label: 'Brushstroke: Trace the Severed Stream' })
  },
}


// ===== evanescia  (was evanescia.ts) =====
const PID_evanescia = 'evanescia'
function rt_evanescia(sim: SimApi, u: Unit): KitRuntime {
  return sim.rt(u)
}

function evanesciaOf(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kitId === PID_evanescia)
}

/** E2 "Voyage: A Wish for Everbloom" doubles the trace conversions (50% -> 100% of the CB gained). */
function convRate(ctx: KitRuntime): number {
  return ((ctx.eidolon as number) ?? 0) >= 2 ? 1 : 0.5
}

/** Evanescia's own CB state: 2 turns, E6 "Maiden: A Step into Dreams" +1 turn. */
function addCb(sim: SimApi, u: Unit, pts: number, ctx: KitRuntime): void {
  if (pts <= 0) return
  sim.addCb(u, pts, ((ctx.eidolon as number) ?? 0) >= 6 ? 3 : 2)
}

/** E6: +15% Merrymake plus 2% per 100 CB held (1000 CB counted at most). */
function applyMerrymake(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (((ctx.eidolon as number) ?? 0) < 6) return
  const steps = Math.min(10, Math.floor(Math.min(1000, sim.cbOf(u)) / 100))
  sim.addBuff(u, { id: 'ev_e6_merry', name: 'Maiden: A Step into Dreams', mods: [{ stat: 'merrymake', value: 0.15 + 0.02 * steps }] })
}

/** Elation DMG whose Punchline punctuation uses the owner's CB, floored at `cbMin`
 *  (Talent: the Ult counts at least Max Energy worth of CB). */
function cbElationMin(sim: SimApi, u: Unit, t: Unit, base: number, label: string, cbMin: number): void {
  const cb = sim.cbOf(u)
  if (cb <= 0) return
  const m = elationLevelMultiplier(u.base.level) * base * (1 + eff(u).elation) * punchlineMult(Math.max(cb, cbMin)) * (1 + eff(u).merrymake)
  sim.hit(u, t, { type: 'elation', elem: 'Physical', statValue: 1, mult: m, canCrit: true, label })
}

/** Elation Skill "Scarlet: Elation or Execution": Physical Elation DMG AoE + CB. */
function elSkill_evanescia(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const lvl = lv.el_skill ?? lv.skill
  applyMerrymake(sim, u, ctx)
  sim.fireElationSkill(u, PID_evanescia)
  const pct = mult(PID_evanescia, 'el_skill_a2', lvl)
  for (const e of sim.livingEnemiesOf(u)) elationHit(sim, u, e, pct, 'Scarlet: Elation or Execution', 'Physical')
  const cb = mult(PID_evanescia, 'el_skill', lvl) + (eid >= 1 ? 10 : 0)
  addCb(sim, u, cb, ctx)
  sim.log(`Evanescia Elation Skill: Scarlet: Elation or Execution (${Math.round(pct * 1000) / 10}% Elation AoE, +${cb} CB)`)
}

/** "Master Fox" Follow-Up ATK (Talent, fires once per 240 accumulated Energy). */
function masterFox(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const r = rt_evanescia(sim, u)
  if (r.evFox) return
  r.evFox = true
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  applyMerrymake(sim, u, ctx)
  const base = mult(PID_evanescia, 'talent', lv.talent)
  for (const e of sim.livingEnemiesOf(u)) sim.hit(u, e, { type: 'fua', elem: 'Physical', mult: base, label: 'Master Fox' })
  if (sim.cbOf(u) > 0) {
    for (const e of sim.livingEnemiesOf(u)) cbElationHit(sim, u, e, mult(PID_evanescia, 'talent_a2', lv.talent), 'Master Fox (CB)', 'Physical')
  }
  for (const e of sim.livingEnemiesOf(u)) {
    sim.applyDebuff(u, e, 1, () => sim.addBuff(e, { id: 'ev_a4_vuln', name: 'Weigh All Truths', mods: [{ stat: 'vulnAll', value: 0.12 }], turns: 3, debuff: true }), 'Weigh All Truths')
  }
  if (eid >= 1) elSkill_evanescia(sim, u, ctx)
  sim.gainEnergy(u, mult(PID_evanescia, 'talent_a4', lv.talent))
  sim.log(`Evanescia Master Fox: Follow-Up ATK ${Math.round(base * 100)}% ATK to all enemies`)
  r.evFox = false
}

/**
 * Evanescia — Elation (Physical), 480 Max Energy, ATK-scaling Elation nuker.
 * Basic "Syllabus: Pop Quiz": Physical %ATK single.
 * Skill "Discipline: Final Verdict": Blast (main in 4 hits 20/20/20/40) + 10 Punchline.
 * Ult "Swordsong: Absolution Denied": Physical AoE + 5 random bounces (A2: +1/2/4 by enemy count).
 * Talent "Youth: Halcyon Evermore": Elation = 20% of CRIT DMG; Energy <-> Certified Banger (1:1,
 *   <=100 pts per instance); every 240 accumulated Energy -> "Master Fox" FUA (+10 Energy).
 *   CB-gated Physical Elation DMG: Skill 8%, Ult 24% AoE + 28% to the bounce targets, FUA 25%.
 * Elation Skill "Scarlet: Elation or Execution": Physical Elation DMG AoE + 5 CB (+10 at E1).
 * the Energy<->CB exchange is one hop per instance (the real chain cascades, but its
 *   100-per-instance cap makes an unbounded loop in the sim — the termination guard in debug-kits.ts);
 *   `ult_a4` (88) has no text and is unused;
 *   Technique "Petalfall: Floral Reminiscence" (100% ATK AoE + 20 CB) is a Maze pre-fight, modelled below.
 */
export const evanesciaKit: KitDef = {
  id: PID_evanescia,
  name: 'Evanescia',
  elem: 'Physical',
  energyMax: 480,
  // canon (Energy.md): Evanescia's Ultimate is usable at HALF Max Energy (240), like Argenti/Yunli
  ultActivation: { kind: 'energy', at: 'half' },
  base: {
    ...PROG.evanescia.base,
    level: 80,
    critRate: 0.05,
    critDmg: 0.5,
  },

  // 150507 "Petalfall: Floral Reminiscence": AoE 100% ATK Physical + 20 Certified Banger. attack Technique.
  technique: {
    name: 'Petalfall: Floral Reminiscence',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Physical', mult: 1.0, toughDmg: 10, label: 'Petalfall: Floral Reminiscence' })
      addCb(sim, u, 20, rt_evanescia(sim, u))
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt_evanescia(sim, u)
    r.evAcc = 0
    r.evE6Ult = 0
    // Participant-ID order (roster order at battle start) — stable snapshot, since allies() drops the dead
    r.evOrder = sim.allies('ally').map(a => a.id)
    if (eid >= 1) sim.addBuff(u, { id: 'ev_e1', name: 'Home: A Prayer in Dance', mods: [{ stat: 'resPenAll', value: 0.2 }] })
    if (eid >= 2) sim.addBuff(u, { id: 'ev_e2_cd', name: 'Voyage: A Wish for Everbloom', mods: [{ stat: 'critDmg', value: 0.36 }] })
    if (eid >= 4) sim.addBuff(u, { id: 'ev_e4', name: 'Meadow: A Ruin by Vice', mods: [{ stat: 'defIgnore', value: 0.15 }] })
    // A2 "Watch All Revels": CRIT Rate +30%
    sim.addBuff(u, { id: 'ev_a2_crit', name: 'Watch All Revels', mods: [{ stat: 'critRate', value: 0.3 }] })
    // Talent: Elation = #5 (20%) of CRIT DMG
    const lv = levelsOf(ctx)
    sim.addBuff(u, { id: 'ev_el', name: 'Youth: Halcyon Evermore (Elation)', mods: [{ stat: 'elation', value: mult(PID_evanescia, 'talent_a5', lv.talent) * sim.effCritDmg(u) }] })
  },

  /** Talent: Energy <-> Certified Banger, and the 240-Energy "Master Fox" accumulation. */
  onAllyEnergy(sim, unit, base) {
  const ev = evanesciaOf(sim)
    if (!ev || unit.id !== ev.id || base <= 0) return
    const ctx = rt_evanescia(sim, ev)
    const r = ctx
    const need = mult(PID_evanescia, 'talent_a3', levelsOf(ctx).talent)
    if (!r.evSwap) {
      r.evSwap = true
      addCb(sim, ev, Math.min(base, 100), ctx) // <=100 pts per instance
      r.evSwap = false
    }
    const acc = Math.min(need, (r.evAcc as number) + Math.min(base, need))
    r.evAcc = acc
    if (acc >= need) {
      r.evAcc = 0
      masterFox(sim, ev, ctx)
    }
  },

  /** Talent: CB gained -> equal Energy; A2: lower-Participant-ID Elation teammate's CB -> 50%/100% own CB. */
  onCbGain(sim, gainer, pts) {
    const ev = evanesciaOf(sim)
    if (!ev || ev.dead || pts <= 0) return
    const ctx = rt_evanescia(sim, ev)
    const r = ctx
    if (gainer.id === ev.id) {
      if (r.evSwap) return
      r.evSwap = true
      sim.gainEnergy(ev, Math.min(pts, 100))
      r.evSwap = false
      return
    }
    // A2 "Watch All Revels": only Elation-Skill teammates with a LOWER Participant ID
    const order = (r.evOrder as string[] | undefined) ?? []
    const i = order.indexOf(gainer.id)
    const j = order.indexOf(ev.id)
    if (i < 0 || j < 0 || i >= j || !isElation(sim, gainer)) return
    addCb(sim, ev, convRate(ctx) * pts, ctx)
  },

  /** A6 "Best All Blooms": a teammate's expired CB -> 50%/100% of it as own CB. Any teammate, no Elation gate. */
  onCbEnd(sim, holder, pts) {
    const ev = evanesciaOf(sim)
    if (!ev || ev.dead || holder.id === ev.id || pts <= 0) return
    const ctx = rt_evanescia(sim, ev)
    addCb(sim, ev, convRate(ctx) * pts, ctx)
  },

  /** Aha Instant: Evanescia uses her Elation Skill. */
  onAhaInstant(sim, u, ctx) {
    elSkill_evanescia(sim, u, ctx)
  },

  decide(sim, u) {
    if (u.energy >= u.maxEnergy / 2) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt_evanescia(sim, u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy / 2) return
      u.energy = 0
      const enemies = sim.livingEnemiesOf(u)
      for (const e of enemies) sim.hit(u, e, { type: 'ult', elem: 'Physical', mult: mult(PID_evanescia, 'ult', lv.ult), toughDmg: 30, label: 'Swordsong: Absolution Denied' })
      // A2: bounce count +1/2/4 when there are 3/2/1 enemy targets
      const extra = enemies.length >= 3 ? 1 : enemies.length === 2 ? 2 : enemies.length === 1 ? 4 : 0
      const inst = Math.round(mult(PID_evanescia, 'ult_a2', lv.ult)) + extra
      const perInst = mult(PID_evanescia, 'ult_a3', lv.ult)
      const bounced = new Set<string>()
      for (let i = 0; i < inst; i++) {
        const pool = sim.livingEnemiesOf(u)
        if (!pool.length) break
        const e = sim.rngPick(pool)
        if (e.dead || e.hp <= 0) continue
        sim.hit(u, e, { type: 'ult', elem: 'Physical', mult: perInst, label: 'Swordsong: Absolution Denied (bounce)' })
        bounced.add(e.id)
      }
      // CB-gated Elation: all enemies + the randomly-hit ones, counting at least Max Energy of CB
      if (sim.cbOf(u) > 0) {
        applyMerrymake(sim, u, ctx)
        for (const e of sim.livingEnemiesOf(u)) cbElationMin(sim, u, e, mult(PID_evanescia, 'talent_a6', lv.talent), 'Swordsong: Absolution Denied (CB)', u.maxEnergy)
        for (const id of bounced) {
          const e = sim.find(id)
          if (e && e.side === 'enemy' && !e.dead) cbElationMin(sim, u, e, mult(PID_evanescia, 'talent_a8', lv.talent), 'Swordsong: Absolution Denied (CB bounce)', u.maxEnergy)
        }
      }
      sim.log(`Evanescia Ult: Swordsong: Absolution Denied (${inst} bounce${inst === 1 ? '' : 's'})`)
      // E6: 1st Ult of the battle, then 1 per 4 more (every 5th), regenerates 120 Energy
      r.evE6Ult = ((r.evE6Ult as number) ?? 0) + 1
      if (eid >= 6 && (r.evE6Ult as number) % 5 === 1) {
        sim.gainEnergy(u, 120)
        sim.log('Evanescia E6: Maiden: A Step into Dreams (+120 Energy)')
      }
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      gainPunchline(sim, mult(PID_evanescia, 'skill_a4', lv.skill))
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      const t = manualTarget(sim, action, enemies[0])
      if (!t) return
      sim.hitBlast(
        u,
        t,
        { type: 'skill', elem: 'Physical', mult: mult(PID_evanescia, 'skill_a2', lv.skill), split: [0.2, 0.2, 0.2, 0.4], toughDmg: 30, label: 'Discipline: Final Verdict' },
        { type: 'skill', elem: 'Physical', mult: mult(PID_evanescia, 'skill_a3', lv.skill), label: 'Discipline: Final Verdict (adjacent)' },
      )
      if (sim.cbOf(u) > 0) {
        applyMerrymake(sim, u, ctx)
        for (const e of sim.livingEnemiesOf(u)) cbElationHit(sim, u, e, mult(PID_evanescia, 'talent_a7', lv.talent), 'Discipline: Final Verdict (CB)', 'Physical')
      }
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    if (!t) return
    sim.hit(u, t, { type: 'basic', elem: 'Physical', mult: mult(PID_evanescia, 'basic', lv.basic), toughDmg: 10, label: 'Syllabus: Pop Quiz' })
  },
}


// ===== aventurine_waveflair  (was aventurine_waveflair.ts) =====
const PID_aventurine_waveflair = 'aventurine_waveflair'

function rt_aventurine_waveflair(sim: SimApi, u: Unit): KitRuntime {
  return sim.rt(u)
}

function awOf(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kitId === PID_aventurine_waveflair)
}

/** Fervor upper limit: talent_a4 (30), E2 "Idle as the Turning Tide" raises it to 50. */
function fervorCap(ctx: KitRuntime): number {
  return ((ctx.eidolon as number) ?? 0) >= 2 ? 50 : mult(PID_aventurine_waveflair, 'talent_a4', levelsOf(ctx).talent)
}

/** Talent "Fervor" checkpoints. E1 "A Holiday on the Line" adds 20/30, E2 adds 40/50. */
function fervorSteps(ctx: KitRuntime): number[] {
  const eid = (ctx.eidolon as number) ?? 0
  const base = mult(PID_aventurine_waveflair, 'talent', levelsOf(ctx).talent)
  const steps = [base]
  if (eid >= 1) steps.push(base * 2, base * 3)
  if (eid >= 2) steps.push(base * 4, base * 5)
  return steps
}

/** Elation Skill — "Cheers! To Summer's Blaze" (default) / "All In! To Summer's Blaze" (enhanced).
 *  `elSkill` fired by an Aha Instant; `forceCheers` = Talent Fervor proc (E1 "immediately uses"). */
function elSkill(sim: SimApi, u: Unit, ctx: KitRuntime, inAha: boolean, forceCheers = false): void {
  const r = rt_aventurine_waveflair(sim, u)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const lvl = lv.el_skill ?? lv.skill
  r.awElUses = ((r.awElUses as number) ?? 0) + 1
  // E6 "The Past in Fast Lane": after 2 uses every Elation Skill is enhanced
  const allIn = !forceCheers && ((inAha && r.awAllInNext) || (eid >= 6 && (r.awElUses as number) > 2))
  const label = allIn ? "All In! To Summer's Blaze" : "Cheers! To Summer's Blaze"
  // "Cheers!" takes into account a FIXED amount of Punchline (talent_a5); "All In!" uses the shared pool
  const fixedP = mult(PID_aventurine_waveflair, 'talent_a5', lv.talent)
  // the Talent proc fires from inside onAfterAttack (mid-attack): keep the nested Elation hits
  // in the interrupted attack's sequence, else its later hits re-open a new one and Fervor leaks
  const noSeq = !inAha
  sim.fireElationSkill(u, allIn ? 'all_in' : 'cheers')
  for (const e of sim.livingEnemiesOf(u)) {
    elationHit(sim, u, e, mult(PID_aventurine_waveflair, allIn ? 'el_skill' : 'el_skill2', lvl), label, 'Quantum', true, allIn ? undefined : fixedP, noSeq)
  }
  let bonus = 0
  if (allIn) {
    bonus = (r.awFervor as number) ?? 0
    // E6: outside an Aha Instant "All In!" no longer consumes Fervor
    if (!(eid >= 6 && !inAha)) { r.awFervor = 0; r.awThresh = 0 }
  }
  const fixed = Math.round(mult(PID_aventurine_waveflair, allIn ? 'el_skill_a3' : 'el_skill2_a2', lvl))
  const per = mult(PID_aventurine_waveflair, allIn ? 'el_skill_a4' : 'el_skill2_a3', lvl)
  const perFervor = mult(PID_aventurine_waveflair, 'el_skill_a2', lvl)
  for (let i = 0; i < fixed + bonus; i++) {
    const pool = sim.livingEnemiesOf(u)
    if (!pool.length) break
    const e = sim.rngPick(pool)
    if (e.dead || e.hp <= 0) continue
    elationHit(sim, u, e, i < fixed ? per : perFervor, `${label} (instance)`, 'Quantum', true, undefined, noSeq)
  }
  // only the Aha path CONSUMES the arming: the Talent proc's own forced "Cheers!" fires on
  // non-Aha and must leave `awAllInNext` set for the next Aha Instant (else "All In!" is unreachable)
  if (inAha) r.awAllInNext = false
  sim.log(`${u.name} Elation Skill: ${label} (${fixed} instance${fixed === 1 ? '' : 's'}${bonus ? ` + ${bonus} from Fervor` : ''})`)
  // E2: +4 Fervor after using an Elation Skill
  if (eid >= 2) addFervor(sim, u, ctx, 4)
}

/** Talent: EVERY newly crossed Fervor checkpoint fires its own "Cheers!" and arms the
 *  next Aha-Instant Elation Skill to be enhanced into "All In!". */
function checkFervor(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const r = rt_aventurine_waveflair(sim, u)
  const steps = fervorSteps(ctx)
  const f = (r.awFervor as number) ?? 0
  let idx = (r.awThresh as number) ?? 0
  const crossed: number[] = []
  while (idx < steps.length && f >= steps[idx]) { crossed.push(steps[idx]); idx++ }
  if (!crossed.length) return
  r.awThresh = idx // written BEFORE the procs: the elSkill call re-enters here
  r.awAllInNext = true
  // the log line is unchanged (one per checkpoint) — checkers count the procs
  for (const _step of crossed) {
    sim.log(`${u.name} reaches ${f} Fervor — Talent uses Cheers! To Summer's Blaze`)
    elSkill(sim, u, ctx, false, true)
  }
}

function addFervor(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  const r = rt_aventurine_waveflair(sim, u)
  r.awFervor = Math.min(fervorCap(ctx), ((r.awFervor as number) ?? 0) + n)
  checkFervor(sim, u, ctx)
}

/**
 * Aventurine • Waveflair — Elation (Quantum), 130 Max Energy, Punchline/Fervor Elation AoE nuker.
 * Basic "Dead Center, the Torrent Hits": Quantum %ATK single.
 * Skill "Kill Shot, the Sands Boil": Quantum AoE + Punchline (#2) + Fervor (#3).
 * Ult "Grand Slam, Crest That High Tide": Quantum AoE + Punchline + Fervor + SPD (#4/#5);
 *   while holding Certified Banger it also deals Elation DMG to all enemies (talent #3).
 * Skill likewise gets a CB-gated Elation AoE (talent #2).
 * Talent "Ante Up, the Abyss Answers": +1 turn of Certified Banger duration; every teammate attack
 *   grants Fervor (#7) + Punchline (#6); each Fervor checkpoint (#1, E1: 10/20/30, E2: 40/50) fires
 *   "Cheers! To Summer's Blaze" and arms the next Aha-Instant Elation Skill into "All In!", which
 *   consumes all Fervor for one extra Elation instance per point.
 * checkpoint spacing is 10 while the largest single Fervor grant is 6 (ult_a3), so natural
 *   play never crosses two checkpoints at once — the per-checkpoint loop is proven white-box (debug
 *   check `aw-multi`); the "All In!" punchline is a shared-pool value with no per-use gain in the
 *   data; Technique "Make Waves in Still Waters" (Maze pre-fight: AoE + Fervor + Certified Banger)
 *   is not modelled (Maze pre-fight, TODO §11).
 */
export const aventurineWaveflairKit: KitDef = {
  id: PID_aventurine_waveflair,
  name: 'Aventurine • Waveflair',
  elem: 'Quantum',
energyMax: 130,
  base: {
    ...PROG.aventurine_waveflair.base,
    level: 80,
    critRate: 0.05,
    critDmg: 0.5,
  },
  // #150207 "Make Waves in Still Waters" (Technique): AoE Quantum DMG = 100% ATK, +2 Fervor, +20 CB.
  technique: {
    name: 'Make Waves in Still Waters',
    kind: 'attack',
    apply(sim, u, ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 1, toughDmg: 10, label: 'Make Waves in Still Waters' })
      addFervor(sim, u, ctx, 2)
      sim.addCb(u, 20)
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt_aventurine_waveflair(sim, u)
    r.awFervor = 0
    r.awThresh = 0
    r.awAllInNext = false
    r.awElUses = 0
    r.awLastSeq = -1
    if (eid >= 1) sim.addBuff(u, { id: 'aw_e1', name: 'A Holiday on the Line', mods: [{ stat: 'resPenAll', value: 0.24 }] })
 // E6: Elation DMG merrymakes by 25%
    if (eid >= 6) sim.addBuff(u, { id: 'aw_e6', name: 'The Past in Fast Lane', mods: [{ stat: 'merrymake', value: 0.25 }] })
  },

  /** Aha Instant: uses the Elation Skill ("Cheers!", or the enhanced "All In!" when the Talent armed it). */
  onAhaInstant(sim, u, ctx) {
    elSkill(sim, u, ctx, true)
  },

  /** Talent: Certified Banger lasts one turn longer (the Aha Instant is the only CB source). */
  onCbGain(sim, gainer) {
    if (gainer.kitId !== PID_aventurine_waveflair) return
    const arr = sim.rt(gainer).cbStacks as CBStack[] | undefined
    const last = arr?.[arr.length - 1]
    if (last && last.turns === 2) last.turns = 3
  },

  /** Talent: after a TEAMMATE's attack -> Fervor + Punchline (once per attack sequence). */
  onAfterAttack(sim, attacker) {
    const aw = awOf(sim)
    if (!aw || aw.dead) return
    if (attacker.side !== 'ally' || attacker.kind !== 'char' || attacker.id === aw.id) return
    const r = rt_aventurine_waveflair(sim, aw)
    const seq = sim.attackNo()
    if (r.awLastSeq === seq) return
    r.awLastSeq = seq
    const lv = levelsOf(r)
    addFervor(sim, aw, r, mult(PID_aventurine_waveflair, 'talent_a7', lv.talent))
    sim.gainPunchline(mult(PID_aventurine_waveflair, 'talent_a6', lv.talent))
  },

  decide(sim, u) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.hitAoe(u, { type: 'ult', elem: 'Quantum', mult: mult(PID_aventurine_waveflair, 'ult', lv.ult), toughDmg: 30, label: 'Grand Slam, Crest That High Tide' })
      sim.gainPunchline(mult(PID_aventurine_waveflair, 'ult_a2', lv.ult))
      addFervor(sim, u, ctx, mult(PID_aventurine_waveflair, 'ult_a3', lv.ult))
      sim.addBuff(u, { id: 'aw_ult_spd', name: 'Grand Slam: Crest That High Tide', mods: [{ stat: 'spdPct', value: mult(PID_aventurine_waveflair, 'ult_a4', lv.ult) }], turns: Math.round(mult(PID_aventurine_waveflair, 'ult_a5', lv.ult)) })
      if (sim.cbOf(u) > 0) {
        for (const e of sim.livingEnemiesOf(u)) cbElationHit(sim, u, e, mult(PID_aventurine_waveflair, 'talent_a3', lv.talent), 'Grand Slam, Crest That High Tide (CB)', 'Quantum', undefined, true)
      }
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      sim.gainPunchline(mult(PID_aventurine_waveflair, 'skill_a2', lv.skill))
      sim.hitAoe(u, { type: 'skill', elem: 'Quantum', mult: mult(PID_aventurine_waveflair, 'skill', lv.skill), toughDmg: 30, label: 'Kill Shot, the Sands Boil' })
      addFervor(sim, u, ctx, mult(PID_aventurine_waveflair, 'skill_a3', lv.skill))
      if (sim.cbOf(u) > 0) {
        for (const e of sim.livingEnemiesOf(u)) cbElationHit(sim, u, e, mult(PID_aventurine_waveflair, 'talent_a2', lv.skill), 'Kill Shot, the Sands Boil (CB)', 'Quantum', undefined, true)
      }
      // E4 "Sunlight Runs No Tab": allies ignore 18% DEF for 3 turns
      if (eid >= 4) {
        for (const a of sim.allies('ally')) {
          sim.addBuff(a, { id: 'aw_e4_def', name: 'Sunlight Runs No Tab', mods: [{ stat: 'defIgnore', value: 0.18 }], turns: 3 })
        }
      }
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    if (!t) return
    sim.hit(u, t, { type: 'basic', elem: 'Quantum', mult: mult(PID_aventurine_waveflair, 'basic', lv.basic), toughDmg: 10, label: 'Dead Center, the Torrent Hits' })
  },
}


// ===== silver_wolf_lv999  (was silver_wolf_lv999.ts) =====
const PID_silver_wolf_lv999 = 'silver_wolf_lv999'

/** Silver Wolf LV.999 — 5★ Elation/Imaginary, E1-E6 + A1-A3 from hsr-data/characters.json.
 *
 *  Resource chain: Punchline (team pool) -> Hidden MMR -> CRIT Rate, and the Ult
 *  unlocks at 60 Hidden MMR. "Godmode Player" is a state, not a turn buff: it
 *  survives until the 3 Enhanced Basics are spent (E2 adds more), and it is what
 *  makes the Enhanced Basic an Elation hit and unlocks the Enhanced Elation Skill.
 *
 *  Known deviations (collapsed 100-bounce hits, dead CR-DMG-past-100 branch, E6 no re-entry,
 *  All-Type RES modelled as vulnAll, Godmode CC-immunity no-op, standard 10/30 toughness; TODO §11):
 *  - 100 bounce hits of "Bonus Stage: aWolf Instant" collapse into one logged hit
 *    (same convention as every other collapsed multi-hit kit here).
 *  - Hidden MMR can never push CRIT Rate to 100% (300 point cap = 60% CR), so the
 *    "each further point gives CRIT DMG instead" branch is implemented but dead.
 *  - All-Type Weakness (E6) is applied to every living enemy on wave start; there
 *    is no re-entry trigger, so a later enemy is not implanted until the next wave.
 *  - All-Type Base RES -> 0 is modelled as vulnAll +20% (the project's standing
 *    approximation for an enemy-side RES shred, cf. castorice/mortenax).
 *  - Punchline -> Hidden MMR tracks only the Punchline SW LV.999 gains from her own
 *    sources; Punchline granted to her by other units is not attributed.
 *  - The Enhanced Basic's Elation conversion is read as NOT CB-gated (its own
 *    sentence); the CB gate covers only the Basic/Skill bonus from the Talent and
 *    the Ult's per-SP Top Loot Box.
 *  - "Immune to Crowd Control" inside Godmode is a no-op: the sim has no CC stat
 *    (same standing gap as hyacine A2 / robin E4).
 *  - hsr-data carries no toughness value for her abilities, so the standard flat
 *    10 (Basic) / 30 (Skill) are used rather than inventing per-hit data.
 *  - "When dealing fatal damage to all enemies, this ends / after attackable
 *    enemies appear, gains an extra turn" needs a multi-wave enemy roster; single-
 *    wave sims never hit it, so the use count is simply consumed.
 *  - Technique "This? Absolute Meta!" (Maze, pre-fight) is not modelled.
 */

const ALL_ELEMS: Elem[] = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary']

const rt_silver_wolf_lv999 = (sim: SimApi, u: Unit): KitRuntime => sim.rt(u)

function mmrOf(r: KitRuntime): number {
  return (r.swMmr as number) ?? 0
}

/** Hidden MMR cap: talent (max) + talent_a2 (overflow allowance) = 300. */
function mmrCap(lv: ReturnType<typeof levelsOf>): number {
  return mult(PID_silver_wolf_lv999, 'talent', lv.talent) + mult(PID_silver_wolf_lv999, 'talent_a2', lv.talent)
}

/** Hidden MMR -> CRIT Rate (talent_a4), spilling into CRIT DMG (talent_a6) past 100%. */
function applyMmr(sim: SimApi, u: Unit, r: KitRuntime, lv: ReturnType<typeof levelsOf>): void {
  const per = mult(PID_silver_wolf_lv999, 'talent_a4', lv.talent)
  const perCd = mult(PID_silver_wolf_lv999, 'talent_a6', lv.talent)
  const pts = mmrOf(r)
  const raw = pts * per
  const mods: { stat: 'critRate' | 'critDmg'; value: number }[] = [{ stat: 'critRate', value: Math.min(raw, 1) }]
  if (raw > 1) mods.push({ stat: 'critDmg', value: ((raw - 1) / per) * perCd })
  sim.addBuff(u, { id: 'sw_mmr', name: 'I Carry, We Win (Hidden MMR)', mods, turns: Infinity })
}

/** Add Hidden MMR (capped) and run the E2 "every 120 points increased" payout. */
function addMmr(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  if (n <= 0) return
  const r = rt_silver_wolf_lv999(sim, u)
  const lv = levelsOf(ctx)
  const before = mmrOf(r)
  r.swMmr = Math.min(mmrCap(lv), before + n)
  applyMmr(sim, u, r, lv)
  if (r.swGod) e2Payout(sim, u, ctx)
  sim.log(`${u.name} Hidden MMR ${before} -> ${mmrOf(r)}`)
}

/** E2: for every 120 Hidden MMR increased (initial grant included) -> 1 extra turn
 *  + 1 restored Enhanced Basic use. Thresholds are counted cumulatively per entry. */
function e2Payout(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (((ctx.eidolon as number) ?? 0) < 2) return
  const r = rt_silver_wolf_lv999(sim, u)
  const step = 120
  let seen = (r.swE2Marks as number) ?? 0
  const total = Math.floor(mmrOf(r) / step)
  for (let i = seen; i < total; i++) {
    r.swEb = ((r.swEb as number) ?? 0) + 1
    sim.grantExtraTurn(u)
    sim.log(`${u.name} E2: Hidden MMR threshold ${(i + 1) * step} -> +1 Enhanced Basic use, extra turn`)
  }
  if (total > seen) r.swE2Marks = total
}

/** All buff durations on this unit +1 turn (E2 on entry, Enhanced Basic once/turn). */
function extendOwnBuffs(u: Unit, label: string, sim: SimApi): void {
  for (const b of u.buffs) {
    if (b.id === 'sw_mmr') continue
    if (b.turns === undefined || b.turns === Infinity) continue
    b.turns += 1
  }
  sim.log(`${u.name} extends own buff durations +1 (${label})`)
}

/** E1 "enemy targets in the Zone take 20% increased DMG" -> vulnAll on the field. */
function zoneBuff(sim: SimApi, u: Unit, on: boolean): void {
  for (const e of sim.livingEnemiesOf(u)) {
    if (on) {
      const b: Buff = { id: 'sw_zone', name: 'Godmode Player (Zone)', mods: [{ stat: 'vulnAll', value: 0.2 }], debuff: true }
      sim.addBuff(e, b)
    } else {
      sim.removeBuff(e, 'sw_zone')
    }
  }
}

function enterGodmode(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const r = rt_silver_wolf_lv999(sim, u)
  const lv = levelsOf(ctx)
  r.swGod = true
  r.swEb = mult(PID_silver_wolf_lv999, 'talent_a5', lv.talent)
  r.swE2Marks = 0
  // A3 "Secret Level Maxed": +20 Hidden MMR on entry (E2 counts this initial grant)
  addMmr(sim, u, ctx, 20)
  // E2 "extends the duration of all buffs on this unit by 1 turn"
  if (((ctx.eidolon as number) ?? 0) >= 2) extendOwnBuffs(u, 'Godmode: ON!', sim)
  zoneBuff(sim, u, true)
  sim.log(`${u.name} enters Godmode Player (${r.swEnhanced} Enhanced Basic uses)`)
}

function exitGodmode(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const r = rt_silver_wolf_lv999(sim, u)
  const lv = levelsOf(ctx)
  r.swGod = false
  zoneBuff(sim, u, false)
  // E1: 20% of Hidden MMR is retained instead of cleared
  const keep = ((ctx.eidolon as number) ?? 0) >= 1 ? Math.floor(mmrOf(r) * 0.2) : 0
  r.swMmr = keep
  r.swE2Marks = 0
  if (keep > 0) applyMmr(sim, u, r, lv)
  else sim.removeBuff(u, 'sw_mmr')
  sim.log(`${u.name} exits Godmode Player (Hidden MMR ${keep > 0 ? `-> ${keep}` : 'cleared'})`)
}

/** "Top Loot Box": Elation DMG split across enemies, then 1 random gift.
 *  Rolls the fixed chance first and cuts it by ult_a4 on a success.
 *  `gated` = the Ult's own "while holding Certified Banger" version; the Enhanced
 *  Basic triggers the box from its own sentence and is never CB-gated. */
function topLootBox(sim: SimApi, u: Unit, ctx: KitRuntime, gated: boolean): boolean {
  const r = rt_silver_wolf_lv999(sim, u)
  const lv = levelsOf(ctx)
  const chance = gated && sim.cbOf(u) <= 0 ? 0 : ((r.swLoot as number) ?? 0)
  if (chance <= 0) return false
  if (sim.rng() >= chance) return false
  r.swLoot = chance * mult(PID_silver_wolf_lv999, 'ult_a4', lv.ult)

  const enemies = sim.livingEnemiesOf(u)
  const base = mult(PID_silver_wolf_lv999, 'ult_a3', lv.ult)
  let dealt = 0
  for (const e of enemies) {
    dealt += gated
      ? cbElationHit(sim, u, e, base, 'Top Loot Box', 'Imaginary', undefined, true)
      : elationHit(sim, u, e, base, 'Top Loot Box', 'Imaginary')
  }
  sim.log(`${u.name} Top Loot Box (Imaginary Elation ${dealt.toFixed(0)} total, chance -> ${(r.swLoot as number).toFixed(2)})`)

  const gift = sim.rngInt(3)
  if (gift === 0) {
    // Big Flipping Sword: True DMG = ult_a5 of the total damage just dealt, to the highest-HP enemy
    let top: Unit | undefined
    for (const e of enemies) if (!top || e.hp > top.hp) top = e
    if (top) {
      sim.trueDamage(u, top, dealt * mult(PID_silver_wolf_lv999, 'ult_a5', lv.ult))
      sim.log(`${u.name} Top Loot Box -> Big Flipping Sword on ${top.name}`)
    }
  } else if (gift === 1) {
    sim.gainSp(mult(PID_silver_wolf_lv999, 'ult_a7', lv.ult))
    sim.log(`${u.name} Top Loot Box -> Kaboom Eggsplosion (+${mult(PID_silver_wolf_lv999, 'ult_a7', lv.ult)} SP)`)
  } else {
    const n = mult(PID_silver_wolf_lv999, 'ult_a6', lv.ult)
    sim.gainPunchline(n)
    addMmr(sim, u, ctx, n)
    sim.log(`${u.name} Top Loot Box -> Funky Munch Bean (+${n} Punchline)`)
  }
  return true
}

/** Talent: Basic ATK / Skill deal talent_a3 Imaginary Elation DMG while holding CB. */
function cbBonus(sim: SimApi, u: Unit, lv: ReturnType<typeof levelsOf>, targets: Unit[], label: string): void {
  if (sim.cbOf(u) <= 0) return
  for (const t of targets) cbElationHit(sim, u, t, mult(PID_silver_wolf_lv999, 'talent_a3', lv.talent), `${label} (CB)`, 'Imaginary', undefined, true)
}

/** spendSp hook: any ally's SP spent inside the ZoneWay trigger one Top Loot Box
 *  per point spent, CB-gated by the Ult's own sentence. */
export function swOnSpSpend(sim: SimApi, n: number): void {
  const sw = sim.allies('ally').find(x => x.kitId === PID_silver_wolf_lv999 && !x.dead)
  if (!sw || !rt_silver_wolf_lv999(sim, sw).swGod) return
  const ctx = sim.rt(sw)
  for (let i = 0; i < n; i++) topLootBox(sim, sw, ctx, true)
}

/** E6: enemies entering combat are implanted with "Absolute Weakness". */
function implantWeakness(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (((ctx.eidolon as number) ?? 0) < 6) return
  for (const e of sim.livingEnemiesOf(u)) {
    for (const el of ALL_ELEMS) sim.applyWeakness(u, e, el)
    sim.addBuff(e, {
      id: 'sw_absweak',
      name: 'Absolute Weakness',
      mods: [{ stat: 'vulnAll', value: 0.2 }],
      debuff: true,
      turns: Infinity,
    })
    sim.log(`${e.name} implanted with Absolute Weakness`)
  }
}

export const silverWolfLv999Kit: KitDef = {
  id: PID_silver_wolf_lv999,
  name: 'Silver Wolf LV.999',
  elem: 'Imaginary',
  energyMax: 60,
  // canon (Energy.md): SW LV.999 does not use the Energy system — ready = full Energy AND
  // Hidden MMR ≥ talent AND outside Godmode (mirrors decide/perform/holdUlt), no +5 after cast
  ultActivation: { kind: 'ready', check: (sim, u, ctx) => {
    const r = rt_silver_wolf_lv999(sim, u)
    return u.energy >= u.maxEnergy && !r.swGod && mmrOf(r) >= mult(PID_silver_wolf_lv999, 'talent', levelsOf(ctx).talent)
  } },
  ultConsumption: 'none',
  base: { ...PROG.silver_wolf_lv999.base, level: 80, critRate: 0.05, critDmg: 0.5 },

  technique: {
    name: 'This? Absolute Meta!',
    kind: 'buff',
    apply(_sim, _u, ctx) {
      // Funky Munch Bean present → 1 Top Loot Box per wave carrying a fixed 99 CB (Ult #1).
      ctx.swTechBox = true
    },
  },

  onStart(sim, u, ctx) {
    const r = rt_silver_wolf_lv999(sim, u)
    const lv = levelsOf(ctx)
    r.swMmr = 0
    r.swGod = false
    r.swEb = 0
    r.swE2Marks = 0
    r.swLoot = 0
    r.swBuffExt = -1
    applyMmr(sim, u, r, lv)
  },

  /** E6 Absolute Weakness applies to enemies that enter combat (wave start). */
  onWaveStart(sim, u, ctx) {
    // Technique: Funky Munch Bean triggers a Top Loot Box worth 99 CB at the start of each wave.
    if (ctx.swTechBox) sim.addCb(u, 99)
    implantWeakness(sim, u, ctx)
  },

  /** Ult is locked until Hidden MMR reaches `talent` (60), and cannot be used inside Godmode. */
  holdUlt(sim, u, ctx) {
    const r = rt_silver_wolf_lv999(sim, u)
    if (r.swGod) return true
    return mmrOf(r) < mult(PID_silver_wolf_lv999, 'talent', levelsOf(ctx).talent)
  },

  decide(sim, u, ctx) {
    const r = rt_silver_wolf_lv999(sim, u)
    // only pick the Ult when perform will actually accept it (60 Hidden MMR, not in Godmode)
    if (u.energy >= u.maxEnergy && !r.swGod && mmrOf(r) >= mult(PID_silver_wolf_lv999, 'talent', levelsOf(ctx).talent)) return { kind: 'ult' }
    if (r.swGod && ((r.swEb as number) ?? 0) > 0) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const r = rt_silver_wolf_lv999(sim, u)
    const enemies = sim.livingEnemiesOf(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      // talent gate: locked below 60 Hidden MMR, and forbidden inside Godmode
      if (r.swGod || mmrOf(r) < mult(PID_silver_wolf_lv999, 'talent', lv.talent)) return
      u.energy = 0
      r.swLoot = 1
      sim.advance(u, 1)
      enterGodmode(sim, u, ctx)
      return
    }

    if (action.kind === 'skill') {
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      const p = mult(PID_silver_wolf_lv999, 'skill_a2', lv.skill)
      sim.gainPunchline(p)
      addMmr(sim, u, ctx, p)
      sim.hitAoe(u, { type: 'skill', elem: 'Imaginary', mult: mult(PID_silver_wolf_lv999, 'skill', lv.skill), toughDmg: 30, label: 'Trigger Happy' })
      cbBonus(sim, u, lv, enemies, 'Trigger Happy')
      return
    }

    // ---- basic: Enhanced Basic inside Godmode, otherwise the plain One Punch! ----
    if (r.swGod) {
      if (((r.swEb as number) ?? 0) <= 0) { exitGodmode(sim, u, ctx); return }
      // E6: Elation DMG during Enhanced Basic merrymakes by 50%
      if (eid >= 6) sim.addBuff(u, { id: 'sw_e6', name: 'God Mode: ON! (E6)', mods: [{ stat: 'merrymake', value: 0.5 }], turns: 1 })

      // 100 bounce hits collapsed into one; Top Loot Box fires up to basic_en_a5 times
      const step = mult(PID_silver_wolf_lv999, 'basic_en_a6', lv.basic)
      const maxStacks = mult(PID_silver_wolf_lv999, 'basic_en_a7', lv.basic)
      const perStack = mult(PID_silver_wolf_lv999, 'basic_en_a8', lv.basic)
      const stacks = Math.min(maxStacks, Math.floor(mmrOf(r) / step))
      const bounce = mult(PID_silver_wolf_lv999, 'basic_en', lv.basic) * (1 + stacks * perStack)
      const t = manualTarget(sim, action, enemies[0])
      if (t) elationHit(sim, u, t, bounce, 'Bonus Stage: aWolf Instant', 'Imaginary', true, undefined, true)
      const boxes = mult(PID_silver_wolf_lv999, 'basic_en_a5', lv.basic)
      for (let i = 0; i < boxes; i++) topLootBox(sim, u, ctx, false)
      // Final Hit: split evenly across all enemies
      for (const e of sim.livingEnemiesOf(u)) {
        elationHit(sim, u, e, mult(PID_silver_wolf_lv999, 'basic_en_a4', lv.basic), 'aWolf Instant: Final Hit', 'Imaginary', true, undefined, true)
      }
      sim.log(`${u.name} Enhanced Basic (${mult(PID_silver_wolf_lv999, 'basic_en_a3', lv.basic)} bounces collapsed, ${stacks} MMR boost stack(s))`)
      // first trigger each turn extends her own buff durations
      if (r.swBuffExt !== sim.battleTurn) {
        r.swBuffExt = sim.battleTurn
        extendOwnBuffs(u, 'aWolf Instant', sim)
      }
      r.swEb = (r.swEb as number) - 1
      if (eid >= 6) sim.removeBuff(u, 'sw_e6')
      if (((r.swEb as number) ?? 0) <= 0) exitGodmode(sim, u, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 2)
    if (!enemies.length) return
    const t = manualTarget(sim, action, enemies[0])
    if (!t) return
    sim.hit(u, t, { type: 'basic', elem: 'Imaginary', mult: mult(PID_silver_wolf_lv999, 'basic', lv.basic), toughDmg: 10, label: 'One Punch!' })
    cbBonus(sim, u, lv, [t], 'One Punch!')
  },

  /** Aha Instant -> one Elation Skill: Enhanced ("Honkai-DMG Demo") inside Godmode,
   *  otherwise "Pro-Gamer Move" (Hidden MMR only, no damage per data). */
  onAhaInstant(sim, u, ctx) {
    const r = rt_silver_wolf_lv999(sim, u)
    const lv = levelsOf(ctx)
    const lvl = lv.el_skill ?? lv.skill
    const enhanced = !!r.swGod
    // A2: Punchline in the pool at the moment of the Elation Skill
    const pool = sim.punchlinePool()
    sim.fireElationSkill(u, enhanced ? 'honkai_dmg_demo' : 'pro_gamer_move')
    if (enhanced) {
      const instances = mult(PID_silver_wolf_lv999, 'el_skill_en_a2', lvl)
      const base = mult(PID_silver_wolf_lv999, 'el_skill_en', lvl) * ((((ctx.eidolon as number) ?? 0) >= 4) ? 5 : 1)
      for (let i = 0; i < instances; i++) {
        const pool2 = sim.livingEnemiesOf(u)
        if (!pool2.length) break
        elationHit(sim, u, sim.rngPick(pool2), base, 'Honkai-DMG Demo', 'Imaginary')
      }
      r.swLoot = 1
      sim.log(`${u.name} Honkai-DMG Demo (${instances} instances, Top Loot Box chance reset)`)
    } else {
      addMmr(sim, u, ctx, mult(PID_silver_wolf_lv999, 'el_skill', lvl))
      sim.log(`${u.name} Pro-Gamer Move`)
    }
    if (pool >= 40) addMmr(sim, u, ctx, 40)
    else if (pool >= 20) addMmr(sim, u, ctx, 20)
  },

  /** A1 "False Ending Speedrun": SPD >= 160 -> +50% Elation, +2% per excess point
   *  (max 100 excess). Re-evaluated each turn so in-battle SPD buffs count. */
  onTurnStart(sim, u) {
    const spd = eff(u).spd
    if (spd <= 160) { sim.removeBuff(u, 'sw_a1'); return }
    const value = 0.5 + 0.02 * Math.min(100, spd - 160)
    sim.addBuff(u, { id: 'sw_a1', name: 'False Ending Speedrun', mods: [{ stat: 'elation', value }], turns: Infinity })
  },

  onUnitDeath(sim, u) {
    const r = rt_silver_wolf_lv999(sim, u)
    r.swGod = false
    for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'sw_zone')
  },
}

