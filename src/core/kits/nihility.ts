// Kits of the Nihility path, merged from the former per-character modules (15 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, type KitDef, type SimApi, type KitRuntime, type HitOpts } from '../kit'
import type { Unit, AbilityLevels, Elem, StatKey } from '../entities/Unit'
import type { DoT } from '../effects/Buff'
import { mult, PROG } from '../progression'
import { type DoTWithSource } from '../simulator'
import { buffSum, eff, isDebuff } from '../combat/StatResolver'

// ===== pela  (was pela.ts) =====

export const pelaKit: KitDef = {
  id: 'pela',
  name: 'Pela',
  elem: 'Ice',
  energyMax: 110,
  base: { ...PROG.pela.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 110607 "Preemptive Strike": 80% ATK Ice to a random enemy + 100% base chance DEF-20% on
  // all enemies for 2 turns. combat-starting (attack) Technique.
  technique: {
    name: 'Preemptive Strike',
    kind: 'attack',
    apply(sim, u) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hit(u, sim.rngPick(enemies), { type: 'basic', elem: 'Ice', mult: 0.8, label: 'Preemptive Strike' })
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0,
          () => sim.addBuff(e, { id: 'pela_tech', name: 'Preemptive Strike DEF↓', mods: [{ stat: 'defRed', value: 0.2 }], turns: 2 }),
          'Preemptive Strike DEF↓')
    },
  },
  // E1: +5 Energy when an enemy is defeated (own kill)
  onKill(sim, u) {
    if (((sim.rt(u).eidolon as number) ?? 0) >= 1) {
      sim.gainEnergy(u, 5)
      sim.log('E1 Victory Report restores 5 Energy')
    }
  },
  // E1: +5 Energy when an enemy is defeated by another ally
  onAllyKill(sim, _killer, _victim, ctx) {
    const pela = sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'pela' && !a.dead)
    if (!pela || ((ctx.eidolon as number) ?? 0) < 1) return
    sim.gainEnergy(pela, 5)
    sim.log('E1 Victory Report restores 5 Energy')
  },
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.kitId !== 'pela' || attacker.dead) return
    if (dmgType === 'fua' || dmgType === 'dot' || dmgType === 'break' || dmgType === 'add') return
    if (target.dead || target.side !== 'enemy') return
    if (((ctx.eidolon as number) ?? 0) < 6) return
    const hasDebuff = target.buffs.some(b => b.sourceId !== 'gear' && b.id !== 'traces')
    if (!hasDebuff) return
    sim.hit(attacker, target, { type: 'add', mult: 0.40, label: 'E6 Feeble Pursuit', noSeq: true })
  },
  onStart(sim, u) {
    // A4 The Secret Strategy: all allies EHR +10%
    for (const a of sim.allies(u.side)) {
      if (a.kind !== 'char' || a.dead) continue
      sim.addBuff(a, { id: 'pela_a4', name: 'The Secret Strategy', mods: [{ stat: 'ehr', value: 0.10 }], turns: Infinity })
    }
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('Zone Suppression (energy +5)') // +5 from castUlt
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'ult', mult: mult('pela', 'ult', lv.ult), toughDmg: 20, label: 'Zone of Suppression', canCrit: true })
        if (!e.dead) {
          // ult attr2: Exposed DEF-30..42% for 2 turns
          sim.applyDebuff(u, e, 1.0,
            () => sim.addBuff(e, { id: 'exposed', name: 'Zone Suppression DEF↓', mods: [{ stat: 'defRed', value: mult('pela', 'ult_a2', lv.ult) }], turns: 2 }),
            'Exposed')
        }
      }
      dataCollecting(sim, u, sim.units().filter(x => x.side === 'enemy'), lv.talent)
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // `enemies` (line above) is already known non-empty; lowestHp re-queries livingEnemiesOf and
      // gainEnergy above can grant an immediate turn that DoT-ticks the last enemy away, so it may
      // come back undefined — fall back to the validated snapshot instead of asserting non-null.
      const victim = manualTarget(sim, action, lowestHp(sim, u) ?? enemies[0])
      // Frostbite dispels 1 positive buff (canon 110602); never a debuff.
      const dispellable = victim.buffs.filter(b => b.sourceId !== 'gear' && !isDebuff(b))
      let dispelled = false
      if (dispellable.length) {
        sim.removeBuff(victim, dispellable[0].id)
        sim.log(`Frostbite dispels ${dispellable[0].name} from ${victim.name}`)
        dispelled = true
        // E2: SPD+10% for 2 turns after dispelling
        if (eid >= 2) sim.addBuff(u, { id: 'pela_e2', name: 'Adamant Charge', mods: [{ stat: 'spdPct', value: 0.10 }], turns: 2 })
      }
      // A6 Wipe Out: +20% DMG on next attack after dispelling
      if (dispelled) sim.addBuff(u, { id: 'pela_a6', name: 'Wipe Out', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
      // A2 Bash: +20% DMG vs debuffed targets
      const hasDebuffs = victim.buffs.some(b => b.sourceId !== 'gear' && b.id !== 'traces')
      if (hasDebuffs) sim.addBuff(u, { id: 'pela_a2', name: 'Bash', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
      sim.hit(u, victim, { type: 'skill', mult: mult('pela', 'skill', lv.skill), toughDmg: 20, label: 'Frostbite' })
      sim.removeBuff(u, 'pela_a2')
      // E4: Ice RES -12% for 2 turns
      if (eid >= 4 && !victim.dead)
        sim.applyDebuff(u, victim, 1.0,
          () => sim.addBuff(victim, { id: 'pela_e4', name: 'Full Analysis', mods: [{ stat: 'vuln:Ice', value: 0.12 }], turns: 2 }),
          'Ice RES Reduction')
      dataCollecting(sim, u, [victim], lv.talent)
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const target = lowestHp(sim, u) ?? enemies[0]
    // A2 Bash: +20% DMG vs debuffed targets
    const hasDebuffsBasic = target.buffs.some(b => b.sourceId !== 'gear' && b.id !== 'traces')
    if (hasDebuffsBasic) sim.addBuff(u, { id: 'pela_a2', name: 'Bash', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
    // two hits at 50% each
    sim.hit(u, target, { type: 'basic', mult: mult('pela', 'basic', lv.basic) * 0.5, toughDmg: 5, label: 'Frost Shot' })
    if (!target.dead) sim.hit(u, target, { type: 'basic', mult: mult('pela', 'basic', lv.basic) * 0.5, toughDmg: 5, label: 'Frost Shot' })
    else sim.hit(u, target, { type: 'basic', mult: mult('pela', 'basic', lv.basic) * 0.5, toughDmg: 0 })
    sim.removeBuff(u, 'pela_a2')
    dataCollecting(sim, u, [target], lv.talent)
  },
}

function dataCollecting(sim: SimApi, u: Unit, targets: Unit[], talentLv: number): void {
  for (const t of targets) {
    if (!t.dead && t.side === 'enemy' && (t.buffs.length > 0 || t.dots.length > 0)) {
      sim.gainEnergy(u, mult('pela', 'talent', talentLv))
      sim.log('Pela Talent: +Energy')
      return
    }
  }
}

function lowestHp(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}


// ===== guinaifen  (was guinaifen.ts) =====

export const guinaifenKit: KitDef = {
  id: 'guinaifen',
  name: 'Guinaifen',
  elem: 'Fire',
  energyMax: 120,
  base: { ...PROG.guinaifen.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 121007 "Skill Showcase": 4 hits, Fire DMG 50% ATK to a random enemy each, 100% base chance
  // Firekiss. attack Technique.
  technique: {
    name: 'Skill Showcase',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const eid = (ctx.eidolon as number) ?? 0
      for (let i = 0; i < 4; i++) {
        const enemies = sim.livingEnemiesOf(u)
        if (!enemies.length) break
        const t = sim.rngPick(enemies)
        sim.hit(u, t, { type: 'basic', mult: 0.5, elem: 'Fire', toughDmg: 10, label: 'Skill Showcase' })
        sim.applyDebuff(u, t, 1.0, () => sim.addBuff(t, {
          id: 'firekiss', name: 'Firekiss DMG Taken+',
          mods: [{ stat: 'vulnAll', value: mult('guinaifen', 'talent', lv.talent) }],
          turns: 3, maxStacks: eid >= 6 ? 4 : 3,
        }), 'Firekiss')
      }
    },
  },
  onStart(sim, u) {
    // A4 Bladed Hoop: +25% action advance at battle start
    sim.advance(u, 0.25)
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log('Watch This Showstopper (energy +5)') // +5 from castUlt
      for (const e of [...sim.livingEnemiesOf(u)]) {
        // A6 Walking on Knives: +20% DMG vs Burned
        const hasBurn = e.dots.some(d => d.kind === 'Burn')
        if (hasBurn) sim.addBuff(u, { id: 'gui_a6', name: 'Walking on Knives', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
        sim.hit(u, e, { type: 'ult', mult: mult('guinaifen', 'ult', lv.ult), toughDmg: 20, label: 'Watch This Showstopper' })
        if (hasBurn) sim.removeBuff(u, 'gui_a6')
        detonateBurn(sim, u, e, mult('guinaifen', 'ult_a2', lv.ult))
      }
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0]))
      // A6 Walking on Knives: +20% DMG vs Burned
      const hasBurnPrimary = primary.dots.some(d => d.kind === 'Burn')
      if (hasBurnPrimary) sim.addBuff(u, { id: 'gui_a6', name: 'Walking on Knives', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
      sim.hitBlast(
        u, primary,
        { type: 'skill', mult: mult('guinaifen', 'skill', lv.skill), toughDmg: 20, label: 'Blazing Welcome Blast' },
        { type: 'skill', mult: mult('guinaifen', 'skill_a2', lv.skill), toughDmg: 10, label: 'Blazing Welcome Blast (adj)' },
      )
      if (hasBurnPrimary) sim.removeBuff(u, 'gui_a6')
      for (const e of sim.livingEnemiesOf(u)) applyBurn(sim, u, e, lv, eid)
      // E1: 100% base chance to reduce target Eff RES by 10% for 2 turns
      if (eid >= 1)
        sim.applyDebuff(u, primary, 1.0,
          () => sim.addBuff(primary, { id: 'gui_e1', name: 'Slurping Noodles During Handstand', mods: [{ stat: 'effRes', value: -0.10 }], turns: 2 }),
          'Eff RES Reduction')
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = enemies[0]
    // A6 Walking on Knives: +20% DMG vs Burned
    const hasBurnBasic = t.dots.some(d => d.kind === 'Burn')
    if (hasBurnBasic) sim.addBuff(u, { id: 'gui_a6', name: 'Walking on Knives', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 })
    sim.hit(u, t, { type: 'basic', mult: mult('guinaifen', 'basic', lv.basic), toughDmg: 10, label: 'Standing Ovation' })
    if (hasBurnBasic) sim.removeBuff(u, 'gui_a6')
    // A2 High Poles: Basic 80% base chance to Burn
    applyBurn(sim, u, t, lv, eid, 0.80)
  },
  // Talent 121004 "PatrAeon Benefits": Firekiss after "their Burn status causes DMG" — canon puts NO
  // "inflicted by Guinaifen" restriction on it, so ANY Burn tick feeds it (break-Burn, ally Burn...).
  // E4 is the source-restricted half ("Every time the Burn status inflicted by Guinaifen causes DMG"),
  // so energy is gated on the tick's own source. `owner` is the unit this kit belongs to.
  onDoTTick(sim, attacker, target, dot, ctx, owner) {
    if (dot.kind !== 'Burn') return
    firekissTick(sim, owner, target, attacker.kitId === 'guinaifen', levelsOf(ctx))
  },
}

function applyBurn(sim: SimApi, gui: Unit, target: Unit, lv: AbilityLevels, eid: number, baseChance = 1.0): void {
  if (target.dead) return
  sim.applyDebuff(gui, target, baseChance, () => {
    // Burn per-turn = % of Guinaifen's ATK; scales with Skill level
    let dmg = sim.effAtk(gui) * mult('guinaifen', 'skill_a3', lv.skill)
    // E2: +40% Burn multiplier when target already Burning
    if (eid >= 2 && target.dots.some(d => d.kind === 'Burn')) dmg *= 1.4
    const ex = target.dots.find(d => d.kind === 'Burn') as DoTWithSource | undefined
    if (ex) {
      ex.baseDmg = Math.max(ex.baseDmg ?? 0, dmg)
      ex.turns = Math.max(ex.turns, 2)
      // Re-application is a fresh infliction: one Burn status per target, so ownership passes to the
      // latest applier (canon E2 scales her Burn off it, E4 "Burn status INFLICTED BY Guinaifen's DMG").
      ex.sourceUnit = gui
    } else {
      sim.applyDot(target, { kind: 'Burn', elem: 'Fire', turns: 2, baseDmg: dmg, sourceUnit: gui } as unknown as DoTWithSource)
    }
  }, 'Burn', 'Burn')
}

/** Ultimate: a Burned target instantly takes % of its pending Burn damage */
function detonateBurn(sim: SimApi, gui: Unit, target: Unit, procFrac: number): void {
  const burn = target.dots.find(d => d.kind === 'Burn')
  if (!burn || target.dead) return
  sim.hit(gui, target, { type: 'dot', statValue: burn.baseDmg * (burn.stacks ?? 1), mult: procFrac, canCrit: false, defIgnore: burn.defIgnore, label: 'Burn Detonation', noSeq: true })
}

function firekissTick(sim: SimApi, gui: Unit, target: Unit, ownBurn: boolean, lv?: AbilityLevels): void {
  const eid = (sim.rt(gui).eidolon as number) ?? 0
  // E4: only Burn she inflicted herself regenerates 2 Energy
  if (ownBurn && eid >= 4) sim.gainEnergy(gui, 2)
  sim.applyDebuff(gui, target, 1.0, () => {
    // talent Firekiss: vuln per stack; E6 adds a stack
    sim.addBuff(target, {
      id: 'firekiss', name: 'Firekiss DMG Taken+',
      mods: [{ stat: 'vulnAll', value: mult('guinaifen', 'talent', lv?.talent) }],
      turns: 3, maxStacks: eid >= 6 ? 4 : 3,
    })
  }, 'Firekiss')
}


// ===== welt  (was welt.ts) =====
function isSlowed(t: Unit): boolean {
  return t.buffs.some(b => b.mods.some(m => m.stat === 'spdDown'))
}

function hasWeightless(t: Unit): boolean {
  return t.buffs.some(b => b.id === 'welt_weightless')
}

// E1 Legacy of Honor (canon): Skill/Ult hit on a target in the Weightless state → +1 instance of
// Imaginary Additional DMG = 40% of the Ultimate's DMG multiplier, once per target per attack.
function e1Hit(sim: SimApi, u: Unit, t: Unit, ctx: KitRuntime, lv: { ult: number }, done: Set<string>): void {
  if (((ctx.eidolon as number) ?? 0) < 1) return
  if (t.dead || t.side !== 'enemy') return
  if (!hasWeightless(t)) return
  if (done.has(t.id)) return
  done.add(t.id)
  sim.hit(u, t, { type: 'add', noSeq: true, mult: mult('welt', 'ult', lv.ult) * 0.4, label: 'Legacy of Honor (E1)' })
}

// E6 Prospect of Glory (canon): Skill/Ult hit on a Slowed target → CR+30% / CD+60% for that DMG.
function e6Hit(sim: SimApi, u: Unit, t: Unit, o: HitOpts, ctx: KitRuntime): number {
  if (((ctx.eidolon as number) ?? 0) < 6) return sim.hit(u, t, o)
  if (t.side !== 'enemy' || t.dead || !isSlowed(t)) return sim.hit(u, t, o)
  if (!ctx.weltE6Logged) { ctx.weltE6Logged = true; sim.log('Welt E6: Prospect of Glory CR+30% CD+60% vs Slowed') }
  sim.addBuff(u, { id: 'welt_e6_tmp', name: 'Prospect of Glory', mods: [{ stat: 'critRate', value: 0.3 }, { stat: 'critDmg', value: 0.6 }], turns: Infinity })
  const d = sim.hit(u, t, o)
  sim.removeBuff(u, 'welt_e6_tmp')
  return d
}

export const weltKit: KitDef = {
  id: 'welt',
  name: 'Welt',
  elem: 'Imaginary',
  energyMax: 120,
  base: { level: 80, hp: 1125, atk: 620, def: 509, spd: 102, critRate: 0.05, critDmg: 0.5 },
  // #100407 "Gravitational Imprisonment" (Technique): 100% base chance to Imprison all enemies
  // (immediate 20% action delay + SPD −10% for 1 turn).
  technique: {
    name: 'Gravitational Imprisonment',
    kind: 'buff',
    apply(sim, u) {
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0, () => {
          sim.delay(e, 0.2)
          sim.addBuff(e, { id: 'welt_tech_imprison', name: 'Gravitational Imprisonment SPD↓', mods: [{ stat: 'spdDown', value: 0.1 }], turns: 1, debuff: true })
        }, 'Imprison', 'Imprisonment')
    },
  },
  onStart(sim, u, ctx) {
    u.aggro = 100
    ctx.wtHits = {}
    // A2 Retribution: +30 Energy at battle start
    sim.gainEnergy(u, 30)
    // A6 Punishment: effective EHR>40% → ATK+20% per 10% over, capped +80%
    const ehr = (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr')
    if (ehr > 0.4) {
      const atkUp = Math.min(0.8, Math.floor((ehr - 0.4) / 0.1) * 0.2)
      sim.addBuff(u, { id: 'welt_a6', name: 'Punishment', mods: [{ stat: 'atkPct', value: atkUp }] })
    }
  },
  onTurnStart(_sim, u, ctx) {
    ctx.wtHits = {}
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    const pattern = (ctx.skillPattern as string) ?? 'auto'
    if (pattern === 'rotation') return { kind: 'skill' }
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
      // A6 Punishment: Ultimate restores 5 Energy
      sim.gainEnergy(u, 5)
      const e1Done = new Set<string>()
      for (const e of [...sim.livingEnemiesOf(u)]) {
        const wasWl = hasWeightless(e)
        const wlMods: { stat: 'defRed' | 'spdDown' | 'resAll'; value: number }[] = [{ stat: 'defRed', value: 0.40 }, { stat: 'spdDown', value: 0.05 }]
        // E4 Appellation of Justice: Weightless enemies take All-Type RES −30%
        if (eid >= 4) wlMods.push({ stat: 'resAll', value: -0.30 })
        e6Hit(sim, u, e, { type: 'ult', mult: mult('welt', 'ult', lv.ult), toughDmg: 30, label: 'Synthetic Black Hole', split: [0.1, 0.9] }, ctx)
        if (!e.dead) {
          // Imprison: immediate 12% delay (ult lv10) + SPD-10% for 1 turn; action-skip not modeled
          sim.delay(e, 0.12)
          sim.addBuff(e, { id: 'welt_imprison', name: 'Synthetic Black Hole SPD↓', mods: [{ stat: 'spdDown', value: 0.10 }], turns: 1, debuff: true })
          // Weightless: DEF-40%, SPD-5%, attacked → 4% action delay
          sim.addBuff(e, {
            id: 'welt_weightless', name: 'Synthetic Black Hole DEF↓ SPD↓',
            mods: wlMods,
            turns: 2, payload: 0.04,
          })
          if (wasWl) e1Hit(sim, u, e, ctx, lv, e1Done)
        }
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      const chance = mult('welt', 'skill_a1', lv.skill)
      const slow = (t: Unit) => sim.applyDebuff(u, t, chance,
        () => sim.addBuff(t, { id: 'welt_slow', name: 'Edge of the Void SPD↓', mods: [{ stat: 'spdDown', value: 0.10 }], turns: 2 }),
        'SPD Reduction (Edge of the Void)')
      const e1Done = new Set<string>()
      e6Hit(sim, u, primary, { type: 'skill', mult: mult('welt', 'skill', lv.skill), toughDmg: 20, label: 'Edge of the Void' }, ctx)
      slow(primary)
      // A4 Judgment: Skill gets +1 extra instance = 120% of Skill DMG multiplier
      sim.hit(u, primary, { type: 'add', noSeq: true, mult: mult('welt', 'skill', lv.skill) * 1.2, label: 'Edge of the Void (A4)' })
      e1Hit(sim, u, primary, ctx, lv, e1Done)
      for (let i = 0; i < 4; i++) {
        const pool = sim.livingEnemiesOf(u)
        if (!pool.length) break
        const t = sim.rngPick(pool)
        e6Hit(sim, u, t, { type: 'skill', mult: mult('welt', 'skill', lv.skill), toughDmg: 20, label: 'Edge of the Void (bounce)' }, ctx)
        slow(t)
        e1Hit(sim, u, t, ctx, lv, e1Done)
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('welt', 'basic', lv.basic), toughDmg: 10, label: 'Gravity Suppression' })
    // A4 Judgment: Basic gets +1 extra instance = 80% of Basic DMG multiplier
    sim.hit(u, enemies[0], { type: 'add', noSeq: true, mult: mult('welt', 'basic', lv.basic) * 0.8, label: 'Gravity Suppression (A4)' })
  },

  // Weightless: ally attacks on Weightless enemies delay their action (≤8/target/turn)
  // Talent Time Distortion: Welt's attacks on Slowed enemies deal Additional Imaginary DMG
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.side !== 'ally') return
    if (!target.dead && target.side === 'enemy') {
      const wl = target.buffs.find(b => b.id === 'welt_weightless')
      if (wl) {
        const hits = (ctx.wtHits as Record<string, number>) ?? {}
        if ((hits[target.id] ?? 0) < 8) {
          hits[target.id] = (hits[target.id] ?? 0) + 1
          ctx.wtHits = hits
          sim.delay(target, wl.payload ?? 0.04)
        }
        // A2 Retribution: attacking a Weightless target → +10% DMG, stacks ×10, 2 turns
        sim.addBuff(attacker, { id: 'welt_a2', name: 'Retribution', mods: [{ stat: 'dmgAll', value: 0.10 }], turns: 2, maxStacks: 10 })
      }
    }
    if (attacker.kind !== 'char') return
    if (attacker.kitId !== 'welt' || dmgType === 'add' || dmgType === 'fua') return
    if (target.dead || target.side !== 'enemy') return
    if (!isSlowed(target)) return
    sim.hit(attacker, target, { type: 'add', noSeq: true, mult: mult('welt', 'talent', levelsOf(ctx).talent), label: 'Time Distortion' })
    // E2 Conflux of Stars: Talent trigger → +3 Energy
    if (((ctx.eidolon as number) ?? 0) >= 2) { sim.gainEnergy(attacker, 3); sim.log('Welt E2: Conflux +3 Energy') }
  },
}

// ===== kafka  (was kafka.ts) =====
const DETONABLE: DoT['kind'][] = ['Bleed', 'Burn', 'Shock', 'WindShear']

// E6 Leggiero: Shock DMG +156% (×2.56), lasts 1 extra turn (2→3) — canon param_list [0.48,...,1.56,1]
function shockDots(sim: SimApi, kafka: Unit, target: Unit, dotMult: number): void {
  const eid = (sim.rt(kafka).eidolon as number) ?? 0
  const leg = eid >= 6 ? 1.56 : 0
  const dmg = sim.effAtk(kafka) * dotMult * (1 + leg)
  const turns = eid >= 6 ? 3 : 2
  const ex = target.dots.find(d => d.kind === 'Shock') as DoTWithSource | undefined
  if (ex) {
    ex.baseDmg = Math.max(ex.baseDmg ?? 0, dmg)
    ex.turns = Math.max(ex.turns, turns)
    ex.sourceUnit = kafka
  } else {
    sim.applyDot(target, {
      kind: 'Shock', elem: 'Lightning', turns, baseDmg: dmg, sourceUnit: kafka,
    } as unknown as DoTWithSource)
  }
  if (leg) sim.log('Kafka E6: Shock 2.56×, 3 turns')
}

/** instantly produce `frac` of each current DoT on the target */
function detonateDots(sim: SimApi, kafka: Unit, target: Unit, frac: number): void {
  if (target.dead) return
  for (const d of [...target.dots]) {
    if (!DETONABLE.includes(d.kind)) continue
    sim.hit(kafka, target, { type: 'dot', statValue: d.baseDmg * (d.stacks ?? 1), mult: frac, canCrit: false, defIgnore: d.defIgnore, label: 'DoT Detonation', noSeq: true })
    if (target.dead) break
  }
}

/** E1 Da Capo: Kafka's attack → target DoT taken +30% for 2 turns (100% base chance) */
function kafkaE1(sim: SimApi, t: Unit, eid: number): void {
  if (eid >= 1 && !t.dead) sim.addBuff(t, { id: 'kafka_e1', name: 'Da Capo DoT Taken+', mods: [{ stat: 'dotVuln', value: 0.30 }], turns: 2 })
}

export const kafkaKit: KitDef = {
  id: 'kafka',
  name: 'Kafka',
  elem: 'Lightning',
  energyMax: 120,
  base: { ...PROG.kafka.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 1100507 "Mercy Is Not Forgiveness": 50% ATK Lightning to ALL enemies + 100% base chance to
  // Shock (equivalent to her Ultimate's Shock). combat-starting (attack) Technique.
  technique: {
    name: 'Mercy Is Not Forgiveness',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      sim.hitAoe(u, { type: 'basic', elem: 'Lightning', mult: 0.5, label: 'Mercy Is Not Forgiveness' })
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0, () => shockDots(sim, u, e, mult('kafka', 'ult_a3', lv.ult)), 'Shock (Mercy Is Not Forgiveness)', 'Shock')
    },
  },
  onStart(sim, u, ctx) {
    u.aggro = 100
    ctx.fuUses = 0
    const eid = (ctx.eidolon as number) ?? 0
    // E2 Fortississimo: DoT dealt by all allies +33% (canon param_list[0])
    if (eid >= 2) {
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char' && !a.dead)
          sim.addBuff(a, { id: 'kafka_e2', name: 'Fortississimo', mods: [{ stat: 'boost:dot', value: 0.33 }] })
      }
    }
    // A2 Torture: an ally with effective EHR ≥ 75% (base + gear/trace EHR buffs) gets ATK+100%
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a.dead) continue
      let ehr = a.base.ehr ?? 0
      for (const b of a.buffs) {
        const st = b.stacks ?? 1
        for (const m of b.mods) if (m.stat === 'ehr') ehr += m.value * st
      }
      if (ehr >= 0.75)
        sim.addBuff(a, { id: 'kafka_a2', name: 'Torture', mods: [{ stat: 'atkPct', value: 1.0 }] })
    }
  },
  // Talent #4: regain 1 triggerable FUA count at end of Kafka's turn (cap #5 = 2 across the battle)
  onTurnEnd(_sim, _u, ctx) {
    const lv = levelsOf(ctx)
    ctx.fuUses = Math.min(mult('kafka', 'talent_a5', lv.talent) as number, ((ctx.fuUses as number) ?? 0) + (mult('kafka', 'talent_a4', lv.talent) as number))
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    const pattern = (ctx.skillPattern as string) ?? 'auto'
    if (pattern === 'rotation') return { kind: 'skill' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'ult', mult: mult('kafka', 'ult', lv.ult), toughDmg: 30, label: 'Twilight Trill' })
        if (e.dead) continue
        kafkaE1(sim, e, (ctx.eidolon as number) ?? 0)
        detonateDots(sim, u, e, mult('kafka', 'ult_a2', lv.ult))
        sim.applyDebuff(u, e, 1.0, () => shockDots(sim, u, e, mult('kafka', 'ult_a3', lv.ult)), 'Shock (Twilight Trill)', 'Shock')
      }
      // A6 Thorns: restore 1 Talent FUA count; FUA can detonate DoTs at 80%
      ctx.thorns = true
      ctx.fuUses = Math.max(0, ((ctx.fuUses as number) ?? 0) - 1)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hitBlast(
        u, primary,
        { type: 'skill', mult: mult('kafka', 'skill', lv.skill), toughDmg: 20, label: 'Caressing Moonlight', split: [0.2, 0.3, 0.5] },
        { type: 'skill', mult: mult('kafka', 'skill_a3', lv.skill), toughDmg: 10, label: 'Caressing Moonlight (adj)' },
      )
      for (const e of sim.livingEnemiesOf(u)) {
        kafkaE1(sim, e, (ctx.eidolon as number) ?? 0)
        const frac = e === primary ? mult('kafka', 'skill_a2', lv.skill) : mult('kafka', 'skill_a4', lv.skill)
        detonateDots(sim, u, e, frac)
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    kafkaE1(sim, enemies[0], (ctx.eidolon as number) ?? 0)
    sim.hit(u, enemies[0], { type: 'basic', mult: mult('kafka', 'basic', lv.basic), toughDmg: 10, label: 'Midnight Tumult', split: [0.5, 0.5] })
  },

  // Talent Gentle but Cruel: ally attacks → Kafka Follow-Up + Shock (≤2 total, 1 regained at Kafka's turn end)
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.side !== 'ally' || attacker.kind !== 'char' || target.dead) return
    if (attacker.kitId === 'kafka' || attacker.id === target.id) return
    if (target.side !== 'enemy') return
    if (dmgType === 'add') return
    const kafka = sim.allies('ally').find(u => u.kitId === 'kafka' && !u.dead)
    if (!kafka) return
    if (((ctx.fuUses as number) ?? 0) >= 2) return
    ctx.fuUses = ((ctx.fuUses as number) ?? 0) + 1
    sim.hit(kafka, target, { type: 'fua', mult: mult('kafka', 'talent', levelsOf(ctx).talent), toughDmg: 10, label: 'Gentle but Cruel', split: [0.15, 0.15, 0.15, 0.15, 0.15, 0.25] })
    if (target.dead) return
    // talent sp_base 10: FUA regenerates 10 Energy
    sim.gainEnergy(kafka, 10)
    sim.log('Kafka Talent: Gentle but Cruel (energy +10)')
    kafkaE1(sim, target, (ctx.eidolon as number) ?? 0)
    // A6 Thorns: FUA detonates all DoTs at 80%
    if (ctx.thorns) {
      detonateDots(sim, kafka, target, 0.8)
      sim.log('Kafka A6: Thorns DoT detonation')
    }
    sim.applyDebuff(kafka, target, 1.0, () => shockDots(sim, kafka, target, mult('kafka', 'ult_a3', levelsOf(ctx).ult)), 'Shock (Gentle but Cruel)', 'Shock')
  },

  // A4 Plunder: enemy defeated while under Kafka's Shock → +5 Energy (own kill)
  onKill(sim, u, victim, _ctx) {
    if (victim.dots.some(d => d.kind === 'Shock' && (d as DoTWithSource).sourceUnit?.kitId === 'kafka')) {
      sim.gainEnergy(u, 5)
      sim.log('Kafka A4: +5 Energy (Shock kill)')
    }
  },
  // teammate kills a Shocked enemy → same A4 (dots survive kill(); buffs don't)
  onAllyKill(sim, _killer, victim, _ctx) {
    const kafka = sim.allies('ally').find(x => x.kitId === 'kafka' && !x.dead)
    if (!kafka) return
    if (victim.dots.some(d => d.kind === 'Shock' && (d as DoTWithSource).sourceUnit?.kitId === 'kafka')) {
      sim.gainEnergy(kafka, 5)
      sim.log('Kafka A4: +5 Energy (Shock kill)')
    }
  },

  // E4 Recitativo: enemy taking Kafka's Shock DoT → +2 Energy
  onDoTTick(sim, attacker, target, dot, ctx) {
    if (dot.kind !== 'Shock' || (dot as unknown as { sourceUnit?: Unit }).sourceUnit?.kitId !== 'kafka') return
    if (((ctx.eidolon as number) ?? 0) >= 4) {
      sim.gainEnergy(attacker, 2)
      sim.log('Kafka E4: +2 Energy (Shock tick)')
    }
    if (target.dead) return
  },
}

// ===== silverwolf  (was silverwolf.ts) =====
// this is the base Silver Wolf (Nihility/Quantum). «Silver Wolf LV.999» is a SEPARATE form
// (Elation/Imaginary, sp_need 60) — see the elation.ts kit `silver_wolf_lv999`.

/** Weakness implant type (skill desc 1100602): an on-field ally's Type, prioritizing the first
 *  character in the team lineup; else a random party Type not native to the target. */
function implantElem(sim: SimApi, u: Unit, target: Unit): string {
  const chars = sim.units().filter(x => x.side === u.side && x.kind === 'char' && !x.dead)
  const party = [...new Set(chars.map(x => x.elem))]
  const nonNative = party.filter(e => !target.weaknesses.includes(e))
  if (!nonNative.length) return party.length ? party[0] : u.elem
  // prioritizing the first character in the team lineup (chars[0] = first added to roster)
  const first = chars[0]?.elem
  if (first && nonNative.includes(first)) return first
  return sim.rngPick(nonNative)
}

function countDebuffs(target: Unit): number {
  return target.buffs.length + target.dots.length
}

/** Talent "Awaiting System Response...": one of the 3 Bug types — ATK− (talent_a1), DEF− (talent_a2),
 *  SPD− (talent_a3). Enemy ATK is inert in sim (no enemy DMG output) → atkPct bug is decorative. */
function bugRoll(sim: SimApi, lv: { talent: number }): { stat: 'defRed' | 'spdDown' | 'atkPct'; value: number } {
  const idx = sim.rngInt(3)
  return [
    { stat: 'defRed' as const, value: mult('silverwolf', 'talent_a2', lv.talent) },
    { stat: 'spdDown' as const, value: mult('silverwolf', 'talent_a3', lv.talent) },
    { stat: 'atkPct' as const, value: mult('silverwolf', 'talent_a1', lv.talent) },
  ][idx]
}

/** Talent: defeated enemy → transfer implanted Weakness to a surviving non-implanted enemy (elite+ priority).
 *  Reads rt().swWeak map — sim.kill clears victim.buffs before onKill fires, so buffs are unusable here. */
function transferWeakness(sim: SimApi, sw: Unit, victim: Unit): void {
  const rt = sim.rt(sw) as KitRuntime & { swWeak?: Record<string, Elem> }
  const map = rt.swWeak ?? {}
  const elem = map[victim.id]
  if (!elem) return
  delete map[victim.id]
  const candidates = sim.livingEnemiesOf(sw).filter(e => e !== victim && !e.weaknesses.includes(elem))
  if (!candidates.length) return
  candidates.sort((a, b) => (b.rank === 'elite' || b.rank === 'boss' ? 1 : 0) - (a.rank === 'elite' || a.rank === 'boss' ? 1 : 0))
  const t = candidates[0]
  const old = t.buffs.find(b => b.id === `sw_weak_${elem}`)
  if (!t.weaknesses.includes(elem)) sim.applyWeakness(sw, t, elem)
  if (old) {
    old.turns = 3
  } else {
    t.buffs.push({ id: `sw_weak_${elem}`, name: `Allow Changes? ${elem} Weakness`, mods: [{ stat: `vuln:${elem}`, value: 0.2 }], turns: 3 })
  }
  sim.log(`Transfer weakness ${elem} → ${t.name}`)
}

/** E6: +20% DMG per debuff on the attacked enemy (max 5). Scoped to the single hit on that enemy. */
function e6Buff(sim: SimApi, u: Unit, target: Unit, eid: number): void {
  if (eid < 6 || target.dead) return
  const n = Math.min(5, countDebuffs(target))
  sim.removeBuff(u, 'sw_e6')
  if (n > 0) sim.addBuff(u, { id: 'sw_e6', name: `E6 DMG+${20 * n}%`, mods: [{ stat: 'dmgAll', value: 0.2 * n }], turns: 1 })
}

function e6Hit_silverwolf(sim: SimApi, u: Unit, target: Unit, eid: number, o: HitOpts): void {
  e6Buff(sim, u, target, eid)
  sim.hit(u, target, o)
  sim.removeBuff(u, 'sw_e6')
}

export const silverwolfKit: KitDef = {
  id: 'silverwolf',
  name: 'Silver Wolf',
  elem: 'Quantum',
  energyMax: 110,
  base: { ...PROG.silverwolf.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 1100607 "Force Quit Program": Quantum DMG 80% ATK to all enemies, reducing Toughness regardless
  // of Weakness Types. attack Technique.
  technique: {
    name: 'Force Quit Program',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 0.8, toughDmg: 10, label: 'Force Quit Program' })
    },
  },
  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    // A4: +20 Energy at battle start
    sim.gainEnergy(u, 20)
    // A6: +10% ATK per 10% EHR, up to 50%
    const ehr = (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr')
    const bonus = Math.min(0.5, Math.floor(ehr / 0.1) * 0.1)
    if (bonus > 0) sim.addBuff(u, { id: 'sw_a6', name: `A6 ATK+${Math.round(bonus * 100)}%`, mods: [{ stat: 'atkPct', value: bonus }] })
    // E2 "Zombie Network": enemy enters combat → DMG taken +20%
    if (eid >= 2) {
      for (const e of sim.livingEnemiesOf(u)) {
        sim.addBuff(e, { id: 'sw_e2', name: 'Zombie Network DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.2 }], turns: 999 })
      }
      sim.log('E2: enemy DMG taken +20%')
    }
  },
  onTurnStart(sim, u) {
    // A4: +5 Energy when her own turn starts
    sim.gainEnergy(u, 5)
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx)
  },
  // Talent "Awaiting System Response...": after every SW attack, chance to implant a random Bug.
  // E2 "Zombie Network": ANY ally attacking an enemy → 100% base chance implant. Bug duration 4 = base 3 + Trace Generate +1.
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (target.dead || target.side !== 'enemy') return
    const eid = (ctx.eidolon as number) ?? 0
    const isSw = attacker.kitId === 'silverwolf' && !attacker.dead
    if (!isSw && eid < 2) return
    const lv = levelsOf(ctx)
    const chance = isSw ? mult('silverwolf', 'talent', lv.talent) : 1.0
    const statOf = bugRoll(sim, lv)
    const src = isSw ? attacker : (sim.allies('ally').find(u => u.kitId === 'silverwolf' && !u.dead) ?? attacker)
    sim.applyDebuff(src, target, chance, () => {
      sim.addBuff(target, { id: 'sw_bug', name: `Bug (${statOf.stat === 'spdDown' ? 'SPD↓' : 'DEF↓'})`, mods: [statOf], turns: 4 })
    }, 'Bug')
  },
  // Trace Generate: on any enemy Weakness break, 100% base chance to implant a random Bug
  onBreak(sim, _breaker, target, ctx) {
    if (target.side !== 'enemy' || target.dead) return
    const sw = sim.allies('ally').find(u => u.kitId === 'silverwolf' && !u.dead)
    if (!sw) return
    const lv = levelsOf(ctx)
    const statOf = bugRoll(sim, lv)
    sim.applyDebuff(sw, target, 1.0, () => {
      sim.addBuff(target, { id: 'sw_bug', name: `Bug (${statOf.stat === 'spdDown' ? 'SPD↓' : statOf.stat === 'atkPct' ? 'ATK↓' : 'DEF↓'})`, mods: [statOf], turns: 4 })
    }, 'Bug (break)')
  },
  onKill(sim, u, victim, ctx) {
    if (victim.side !== 'enemy') return
    const sw = sim.allies('ally').find(x => x.kitId === 'silverwolf' && !x.dead)
    if (!sw) return
    // Talent: implanted Weakness transfers to a surviving non-implanted enemy on defeat
    transferWeakness(sim, sw, victim)
  },
  // teammate lands the kill → same transfer (onAllyKill skips the killer, so no double-fire)
  onAllyKill(sim, _killer, victim, _ctx) {
    const sw = sim.allies('ally').find(x => x.kitId === 'silverwolf' && !x.dead)
    if (!sw) return
    transferWeakness(sim, sw, victim)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      for (const e of [...sim.livingEnemiesOf(u)]) {
        e6Hit_silverwolf(sim, u, e, eid, { type: 'ult', mult: mult('silverwolf', 'ult', lv.ult), toughDmg: 20, label: 'User Banned' })
        if (!e.dead) {
          sim.applyDebuff(u, e, mult('silverwolf', 'ult_a3', lv.ult), () => {
            sim.addBuff(e, { id: 'sw_ult_def', name: 'User Banned DEF↓', mods: [{ stat: 'defRed', value: mult('silverwolf', 'ult_a2', lv.ult) }], turns: 3 })
          }, 'Banned DEF down')
          const ndeb = countDebuffs(e)
          // E1: +7 Energy per debuff on target (max 5)
          if (eid >= 1) {
            const add = Math.min(5, ndeb) * 7
            if (add > 0) sim.gainEnergy(u, add)
          }
          // E4: Additional DMG = 20% ATK per debuff (max 5)
          if (eid >= 4 && ndeb > 0) {
            sim.hit(u, e, { type: 'add', mult: 0.20 * Math.min(5, ndeb), label: 'E4 Additional DMG', noSeq: true })
          }
        }
      }
      return
    }
    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      // Weakness implant (base chance #2, scales 0.8→1.2; one per enemy ever)
      const elem = implantElem(sim, u, primary) as Elem
      const weakChance = mult('silverwolf', 'skill_a2', lv.skill)
      const already = primary.buffs.some(b => b.id.startsWith('sw_weak_'))
      // Skill desc 1100602: implant reduces the enemy's RES to that Type (#4) for #3 turn(s) — only when the
      // Weakness isn't already present; then (independent) further All-Type RES↓ #6 for #7 turns at #5 base chance.
      if (!primary.weaknesses.includes(elem) && !already) {
        sim.applyDebuff(u, primary, weakChance, () => {
          sim.applyWeakness(u, primary, elem)
          const sw = sim.rt(u) as KitRuntime & { swWeak?: Record<string, Elem> }
          sw.swWeak = { ...(sw.swWeak ?? {}), [primary.id]: elem }
          sim.addBuff(primary, { id: `sw_weak_${elem}`, name: `Allow Changes? ${elem} Weakness`, mods: [{ stat: `vuln:${elem}`, value: mult('silverwolf', 'skill_a4', lv.skill) }], turns: mult('silverwolf', 'skill_a5', lv.skill) })
          sim.log(`${u.name} implants ${elem} weakness on ${primary.name}`)
        }, 'Weakness Implant')
      }
      sim.applyDebuff(u, primary, mult('silverwolf', 'skill_a6', lv.skill), () => {
        sim.addBuff(primary, { id: 'sw_resall', name: 'Allow Changes? All-RES↓', mods: [{ stat: 'resAll', value: -mult('silverwolf', 'skill_a3', lv.skill) }], turns: mult('silverwolf', 'skill_a7', lv.skill) })
        sim.log(`${u.name} All-Type RES↓ → ${primary.name}`)
      }, 'All-RES down')
      e6Hit_silverwolf(sim, u, primary, eid, { type: 'skill', mult: mult('silverwolf', 'skill', lv.skill), toughDmg: 20, label: 'Allow Changes?' })
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    e6Hit_silverwolf(sim, u, enemies[0], eid, { type: 'basic', mult: mult('silverwolf', 'basic', lv.basic), toughDmg: 10, label: 'System Warning', split: [0.25, 0.25, 0.5] })
  },
}

// ===== luka  (was luka.ts) =====
function fighting(ctx: KitRuntime): number {
  return (ctx.fighting as number) ?? 0
}

function refreshFightingBuff(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const n = fighting(ctx)
  // E4: +5% ATK per stack (max 4)
  if (((ctx.eidolon as number) ?? 0) >= 4 && n > 0) {
    sim.addBuff(u, { id: 'luka_e4', name: `Fighting ATK+${n * 5}%`, mods: [{ stat: 'atkPct', value: 0.05 * n }], turns: 100 })
  } else sim.removeBuff(u, 'luka_e4')
}

/** adds Fighting Will stacks; A4 trace: +3 Energy per stack obtained */
function addFighting(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  ctx.fighting = Math.min(4, fighting(ctx) + n)
  refreshFightingBuff(sim, u, ctx)
  sim.gainEnergy(u, 3 * n)
  sim.log(`Luka A4: +${3 * n} Energy`)
}

function consumeFighting(sim: SimApi, u: Unit, ctx: KitRuntime, n: number): void {
  ctx.fighting = Math.max(0, fighting(ctx) - n)
  refreshFightingBuff(sim, u, ctx)
}

function hasBleed(u: Unit): boolean {
  return u.dots.some(d => d.kind === 'Bleed')
}

export const lukaKit: KitDef = {
  id: 'luka',
  name: 'Luka',
  elem: 'Physical',
  energyMax: 130,
  base: { ...PROG.luka.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 111107 "Anticipator": Physical DMG 50% ATK to a random enemy + 100% base chance to inflict the
  // Skill's Bleed, then +1 Fighting Will stack. attack Technique.
  technique: {
    name: 'Anticipator',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      const t = sim.rngPick(enemies)
      sim.hit(u, t, { type: 'basic', mult: 0.5, elem: 'Physical', toughDmg: 10, label: 'Anticipator' })
      sim.applyDebuff(u, t, 1.0, () => {
        const cap = mult('luka', 'skill_cap', lv.skill) * sim.effAtk(u)
        const base = Math.min(t.maxHp * 0.24, cap)
        const ex = t.dots.find(d => d.kind === 'Bleed')
        if (ex) { ex.baseDmg = Math.max(ex.baseDmg, base); (ex as { sourceUnit?: Unit }).sourceUnit = u }
        else sim.applyDot(t, { kind: 'Bleed', elem: 'Physical', turns: 3, baseDmg: base, sourceUnit: u } as unknown as DoT)
      }, 'Bleed', 'Bleed')
      addFighting(sim, u, ctx, 1)
    },
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    // skill applies Bleed (feeds Fist burst); basic rebuilds SP + Fighting Will
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    // E1: acting against a Bleeding target → DMG+15% 2 turns
    if (eid >= 1 && enemies.some(hasBleed)) {
      sim.addBuff(u, { id: 'luka_e1', name: 'Fighting Endlessly', mods: [{ stat: 'dmgAll', value: 0.15 }], turns: 2 })
    }

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const t = manualTarget(sim, action, enemies[0])
      // canon order: gains 2 stacks, applies vuln, THEN deals DMG
      addFighting(sim, u, ctx, 2)
      // #2 100% base chance → target takes #3% more DMG for #4 turns
      sim.applyDebuff(u, t, 1.0, () => {
        sim.addBuff(t, { id: 'luka_ult_vuln', name: `Coup de Grâce DMG Taken+${Math.round(mult('luka', 'ult_a2', lv.ult) * 100)}%`, mods: [{ stat: 'vulnAll', value: mult('luka', 'ult_a2', lv.ult) }], turns: 3 })
      }, 'Coup de Grâce vuln')
      sim.log('Coup de Grâce (energy +5) // +5 from castUlt')
      sim.hit(u, t, { type: 'ult', mult: mult('luka', 'ult', lv.ult), toughDmg: 20, label: 'Coup de Grâce' })
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const t = manualTarget(sim, action, enemies[0])
      // A2: dispel 100 buffs from the target
      const dispellable = t.buffs.filter(b => b.sourceId !== 'gear')
      if (dispellable.length) {
        sim.removeBuff(t, dispellable[0].id)
        sim.log(`Lacerating Fist dispels ${dispellable[0].name} from ${t.name}`)
      }
      sim.hit(u, t, { type: 'skill', mult: mult('luka', 'skill', lv.skill), toughDmg: 20, label: 'Lacerating Fist' })
      // #2=100% base chance → Bleed #3% MaxHP as Physical DoT, cap #4% ATK, #5=3 turns
      sim.applyDebuff(u, t, mult('luka', 'skill', lv.skill) > 0 ? 1.0 : 0, () => {
        const cap = mult('luka', 'skill_cap', lv.skill) * sim.effAtk(u)
        const base = Math.min(t.maxHp * 0.24, cap)
        const ex = t.dots.find(d => d.kind === 'Bleed')
        if (ex) { ex.baseDmg = Math.max(ex.baseDmg, base); (ex as { sourceUnit?: Unit }).sourceUnit = u }
        else sim.applyDot(t, { kind: 'Bleed', elem: 'Physical', turns: 3, baseDmg: base, sourceUnit: u } as unknown as DoT)
        sim.log(`${t.name} Bleeded (${Math.round(base)} base)`)
      }, 'Bleed', 'Bleed')
      // E2: hitting a Physical-weak target → +1 stack of Fighting Will (canon ranks "gain 1 stack")
      if (eid >= 2 && t.weaknesses.includes('Physical')) {
        addFighting(sim, u, ctx, 1)
        sim.log('Luka E2: +1 Fighting Will (Phys-weak target)')
      }
      addFighting(sim, u, ctx, 1)
      return
    }

    sim.gainEnergy(u, 20)
    const t = enemies[0]
    if (fighting(ctx) >= 2) {
      // Sky-Shatter Fist (canon sp_base 20 bp_add 1 → +20 EN +1 SP)
      sim.gainSp(1)
      // Direct Punch ×3 (each hit = #1% ATK) + Rising Uppercut (#2% ATK)
      consumeFighting(sim, u, ctx, 2)
      let punches = 3
      for (let i = 0; i < 3 && !t.dead; i++) {
        sim.hit(u, t, { type: 'basic', mult: mult('luka', 'basic_en', lv.basic), toughDmg: 10 / 3, label: 'Sky-Shatter Fist' })
        // B2: 50% fixed chance for one extra hit (not recursive)
        if (sim.rng() < 0.5) {
          punches++
          sim.hit(u, t, { type: 'basic', mult: mult('luka', 'basic_en', lv.basic), toughDmg: 10 / 3, label: 'Sky-Shatter Fist (extra)' })
        }
      }
      if (!t.dead) {
        sim.hit(u, t, { type: 'basic', mult: mult('luka', 'basic_en_a2', lv.basic), toughDmg: 10, label: 'Rising Uppercut' })
        // Talent: Rising Uppercut on a Bleeding target → Bleed immediately deals #2% of original DMG; E6 adds 8% per Direct Punch hit
        const bleed = t.dots.find(d => d.kind === 'Bleed')
        if (bleed) {
          let ratio = mult('luka', 'talent', lv.talent)
          if (eid >= 6) ratio += 0.08 * punches
          sim.hit(u, t, { type: 'dot', statValue: bleed.baseDmg * (bleed.stacks ?? 1), mult: ratio, canCrit: false, defIgnore: bleed.defIgnore, label: 'Bleed Burst', noSeq: true })
        }
      }
      return
    }
    sim.gainSp(1)
    // Direct Punch
    sim.hit(u, t, { type: 'basic', mult: mult('luka', 'basic', lv.basic), toughDmg: 10, label: 'Direct Punch' })
    addFighting(sim, u, ctx, 1)
  },
  onStart(sim, u, ctx) {
    // Talent: at the start of battle, Luka has 1 stack of Fighting Will
    addFighting(sim, u, ctx, 1)
  },
}

// ===== blackswan  (was blackswan.ts) =====
type DoTWithSource_blackswan = DoT & { sourceUnit?: Unit }

function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function sumMods(u: Unit, key: string): number {
  return u.buffs.flatMap(b => b.mods).filter(m => (m.stat as string) === key).reduce((a, m) => a + m.value, 0)
}

function stacksOf(ctx: KitRuntime, t: Unit): number {
  return ((ctx.arcana as Record<string, number> | undefined)?.[t.id]) ?? 0
}

/** (re)writes the Arcana DoT on the target with a fresh ATK-scaled baseDMG. */
function setStacks(sim: SimApi, bs: Unit, t: Unit, ctx: KitRuntime, s: number): void {
  ctx.arcana = (ctx.arcana as Record<string, number>) ?? {}
  if (s <= 0) {
    delete (ctx.arcana as Record<string, number>)[t.id]
    t.dots = t.dots.filter(d => d.kind !== 'Arcana')
    return
  }
  ;(ctx.arcana as Record<string, number>)[t.id] = s
  const lv = levelsOf(ctx)
  const multTotal = mult('blackswan', 'talent', lv.talent) + mult('blackswan', 'talent_a3', lv.talent) * s
  const base = Math.floor(sim.effAtk(bs) * multTotal)
  const ex = t.dots.find(d => d.kind === 'Arcana')
  if (ex) { ex.baseDmg = base; (ex as DoTWithSource_blackswan).sourceUnit = bs }
  else (t.dots as DoTWithSource_blackswan[]).push({ kind: 'Arcana', elem: 'Wind', turns: 900, baseDmg: base, sourceUnit: bs, defIgnore: 0.2 })
}

/** A2/E2/E6/Talent entry point. E6 doubles inflicted stacks; Epiphany adds +1 per stack at 50%. */
function addStacks(sim: SimApi, bs: Unit, t: Unit, ctx: KitRuntime, n: number, label: string): void {
  if (t.dead) return
  const cap = 50 + (eid(ctx) >= 6 ? 30 : 0)
  let s = stacksOf(ctx, t)
  let add = n * (eid(ctx) >= 6 ? 2 : 1)
  if (sim.hasBuff(t, 'bs_epiphany')) {
    for (let i = 0; i < add; i++) if (sim.rng() < 0.5) s = Math.min(cap, s + 1)
  }
  s = Math.min(cap, s + add)
  setStacks(sim, bs, t, ctx, s)
  sim.log(`${label} → ${t.name} Arcana ${s}`)
}

/** Skill's DEF-reduction (also applied by A4 on Basic/Ult/combat-entry). */
function defRed(sim: SimApi, bs: Unit, t: Unit, ctx: KitRuntime): void {
  const v = mult('blackswan', 'skill_a2', levelsOf(ctx).skill)
  sim.addBuff(t, { id: 'bs_def', name: `Decadence, False Twilight DEF↓ ${Math.round(v * 100)}%`, mods: [{ stat: 'defRed', value: v }], turns: 3 })
}

/** E1: enemy under a DoT → corresponding elem RES ↓25% (approximated as vuln).
 *  Talent canon: an enemy in the Arcana state counts as simultaneously afflicted
 *  with WindShear, Bleed, Burn, AND Shock — so Arcana presence alone grants all 4. */
function refreshE1(sim: SimApi, t: Unit, ctx: KitRuntime): void {
  if (t.dead || eid(ctx) < 1) return
  const inArcana = t.dots.some(d => d.kind === 'Arcana')
  const pairs: Array<[DoT['kind'], Elem]> = [['WindShear', 'Wind'], ['Bleed', 'Physical'], ['Burn', 'Fire'], ['Shock', 'Lightning']]
  for (const [kind, el] of pairs) {
    const id = `bs_e1_${el}`
    if (inArcana || t.dots.some(d => d.kind === kind))
      sim.addBuff(t, { id, name: `Seven Pillars of Wisdom RES↓ ${el} 25%`, mods: [{ stat: `vuln:${el}`, value: 0.25 }], turns: 999 })
    else sim.removeBuff(t, id)
  }
}

export const blackswanKit: KitDef = {
  id: 'blackswan',
  name: 'Black Swan',
  elem: 'Wind',
  energyMax: 120,
  base: { ...PROG.blackswan.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 1130707 "From Façade to Vérité": 150% base chance to inflict 1 Arcana stack on each enemy at
  // battle start; each success chains another at 50% of the previous chance until a roll fails.
  technique: {
    name: 'From Façade to Vérité',
    kind: 'buff',
    apply(sim, u, ctx) {
      for (const e of sim.livingEnemiesOf(u)) {
        let p = 1.5
        while (true) {
          const before = stacksOf(ctx, e)
          sim.applyDebuff(u, e, p, () => addStacks(sim, u, e, ctx, 1, 'From Façade to Vérité Arcana'), 'From Façade to Vérité Arcana')
          if (stacksOf(ctx, e) === before) break
          p *= 0.5
        }
      }
    },
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  onStart(sim, u, ctx) {
    ctx.arcana = {}
    ctx.ephIds = new Set<string>()
    // A6 Candleflame's Portent: all allies +DMG equal to 60% of EHR, cap 72%
    const ehr = (u.base.ehr ?? 0) + sumMods(u, 'ehr')
    const dmg = Math.min(0.72, ehr * 0.6)
    for (const a of sim.allies('ally'))
      sim.addBuff(a, { id: 'bs_a6', name: `Candleflame DMG+${Math.round(dmg * 100)}%`, mods: [{ stat: 'dmgAll', value: dmg }], turns: Infinity })
    // A4 Goblet's Dredges: on combat entry each enemy gets 65% → 1 Arcana + 100% Skill DEF↓
    for (const e of sim.livingEnemiesOf(u)) {
      sim.applyDebuff(u, e, 1.0, () => defRed(sim, u, e, ctx), 'Goblet\'s Dredges DEF↓')
      sim.applyDebuff(u, e, 0.65, () => addStacks(sim, u, e, ctx, 1, 'Goblet\'s Dredges Arcana'), 'Goblet\'s Dredges Arcana')
    }
    // E2: enemies entering combat take 30 Arcana stacks at 100% base chance
    if (eid(ctx) >= 2)
      for (const e of sim.livingEnemiesOf(u))
        sim.applyDebuff(u, e, 1.0, () => addStacks(sim, u, e, ctx, 30, 'Weep Not For Me, My Lamb Arcana ×30'), 'Weep Not For Me, My Lamb Arcana ×30')
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const vuln = mult('blackswan', 'ult_a2', lv.ult) + (eid(ctx) >= 4 ? 0.2 : 0)
      // canon: Epiphany inflicted BEFORE the Wind DMG - the ult hit itself eats its vuln
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.addBuff(e, { id: 'bs_epiphany', name: 'Epiphany DMG Taken+', mods: [{ stat: 'vulnAll', value: vuln }], turns: 2 })
        ;(ctx.ephIds as Set<string>).add(e.id)
      }
      sim.log('Black Swan: Epiphany applied (pre-ult-damage)')
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'ult', mult: mult('blackswan', 'ult', lv.ult), toughDmg: 20, label: "Bliss of Otherworld's Embrace" })
        if (e.dead) continue
        // A4: Ultimate → Skill DEF↓
        sim.applyDebuff(u, e, 1.0, () => defRed(sim, u, e, ctx), 'Decadence, False Twilight DEF↓')
        // A2: each attack on an enemy → 65% ×5 Arcana
        sim.applyDebuff(u, e, 0.65, () => addStacks(sim, u, e, ctx, 5, "Viscera's Disquiet Arcana ×5"), "Viscera's Disquiet Arcana ×5")
        refreshE1(sim, e, ctx)
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hitBlast(
        u, primary,
        { type: 'skill', mult: mult('blackswan', 'skill', lv.skill), toughDmg: 20, label: 'Decadence, False Twilight' },
        { type: 'skill', mult: mult('blackswan', 'skill', lv.skill), toughDmg: 10, label: 'Decadence, False Twilight (adj)' },
      )
      for (const e of sim.livingEnemiesOf(u)) {
        if (e.dead) continue
        sim.applyDebuff(u, e, 1.0, () => defRed(sim, u, e, ctx), 'Decadence, False Twilight DEF↓')
        sim.applyDebuff(u, e, 0.65, () => addStacks(sim, u, e, ctx, 5, "Viscera's Disquiet Arcana ×5"), "Viscera's Disquiet Arcana ×5")
        refreshE1(sim, e, ctx)
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('blackswan', 'basic', lv.basic), toughDmg: 10, label: 'Percipience, Silent Dawn' })
    if (t.dead) return
    // A4: Basic → Skill DEF↓
    sim.applyDebuff(u, t, 1.0, () => defRed(sim, u, t, ctx), 'Decadence, False Twilight DEF↓')
    // A2: attack → 65% ×5 Arcana
    sim.applyDebuff(u, t, 0.65, () => addStacks(sim, u, t, ctx, 5, "Viscera's Disquiet Arcana ×5"), "Viscera's Disquiet Arcana ×5")
    refreshE1(sim, t, ctx)
  },
  // Talent Loom of Fate's Caprice hands the Arcana DoT itself; E4/E6 glue lives here.
  // Simulator fires kit onDoTTick for ANY enemy DoT tick (Shock/Burn/etc), so the
  // Talent 65% +1 Arcana roll must resolve the real Black Swan (attacker is the
  // tick's source — Kafka's Shock ticks with Kafka as attacker) and fire on every kind.
  onDoTTick(sim, attacker, target, dot, ctx) {
    if (target.dead) return
    const bs = sim.allies('ally').find(x => x.kitId === 'blackswan' && !x.dead)
    if (!bs) return
    const lv = levelsOf(ctx)
    if (dot.kind === 'Arcana') {
      // E4: at the start of that enemy's turn (this tick) while Epiphany → +8 Energy
      if (eid(ctx) >= 4 && sim.hasBuff(target, 'bs_epiphany')) {
        sim.gainEnergy(bs, 8)
        sim.log('Black Swan E4: +8 Energy')
      }
      // splash: adjacent targets take 1 Wind DoT instance (#5)
      for (const e of sim.livingEnemiesOf(bs)) {
        if (e.id === target.id || e.dead) continue
        if (e.dots.some(d => d.kind === 'WindShear' && (d as DoTWithSource_blackswan).sourceUnit?.kitId === 'blackswan')) continue
        sim.applyDot(e, { kind: 'WindShear', elem: 'Wind', turns: 1, baseDmg: Math.floor(sim.effAtk(bs) * mult('blackswan', 'talent_a4', lv.talent)), sourceUnit: bs } as DoTWithSource_blackswan)
      }
      // stacks halve after dealing DMG — unless Epiphany is up
      const cur = stacksOf(ctx, target)
      if (cur > 0 && !sim.hasBuff(target, 'bs_epiphany')) setStacks(sim, bs, target, ctx, Math.floor(cur / 2))
    }
    // Talent: every DoT instance the enemy receives → 65% base chance +1 Arcana
    if (!target.dead)
      sim.applyDebuff(bs, target, mult('blackswan', 'talent_a2', lv.talent), () => addStacks(sim, bs, target, ctx, 1, "Loom of Fate's Caprice Arcana"), "Loom of Fate's Caprice Arcana")
  },
  // E4: enemies defeated while Epiphany → +8 Energy (buff is wiped before kill hooks,
  // so the runtime ephIds set carries the state)
  onKill(sim, u, victim, ctx) {
    const set = (ctx.ephIds as Set<string> | undefined)
    if (eid(ctx) >= 4 && set?.has(victim.id)) {
      sim.gainEnergy(u, 8)
      sim.log('Black Swan E4: +8 Energy (defeat)')
    }
    set?.delete(victim.id)
  },
  onAllyKill(sim, _killer, victim, ctx) {
    const bs = sim.allies('ally').find(x => x.kitId === 'blackswan' && !x.dead)
    if (!bs) return
    const set = (ctx.ephIds as Set<string> | undefined)
    if (eid(ctx) >= 4 && set?.has(victim.id)) {
      sim.gainEnergy(bs, 8)
      sim.log('Black Swan E4: +8 Energy (defeat)')
    }
    set?.delete(victim.id)
  },
  onBuffExpire(sim, _u, b, ctx) {
    if (b.id === 'bs_epiphany') (ctx.ephIds as Set<string> | undefined)?.delete(_u.id)
  },
  // E1 (RES↓ per DoT) + E6 (teammates attacking → Arcana proc)
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (target.side !== 'enemy' || target.dead) return
    refreshE1(sim, target, ctx)
    if (eid(ctx) < 6) return
    if (attacker.side !== 'ally' || attacker.kind !== 'char' || attacker.kitId === 'blackswan') return
    const bs = sim.allies('ally').find(x => x.kitId === 'blackswan' && !x.dead)
    if (!bs) return
    sim.applyDebuff(bs, target, 0.65, () => addStacks(sim, bs, target, ctx, 1, 'Pantheon Merciful, Masses Pitiful Arcana'), 'Pantheon Merciful, Masses Pitiful Arcana')
  },
}

// ===== cipher  (was cipher.ts) =====
function cipherOf(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'cipher' && !a.dead)
}

function highestMaxHpEnemy(sim: SimApi, u: Unit): Unit | undefined {
  return sim.livingEnemiesOf(u).reduce((m, e) => (e.maxHp > m.maxHp ? e : m), sim.livingEnemiesOf(u)[0])
}

function ensurePatron(sim: SimApi, u: Unit, rt: KitRuntime, forced?: string): void {
  if (forced) { rt.cipherPatron = forced; return }
  if (rt.cipherPatron && sim.find(rt.cipherPatron as string)) return
  const e = highestMaxHpEnemy(sim, u)
  if (e) rt.cipherPatron = e.id
}

export const cipherKit: KitDef = {
  id: 'cipher',
  name: 'Cipher',
  elem: 'Quantum',
  energyMax: 130,
  base: { ...PROG.cipher.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Nihility' },
  // #131207 "Puss in Boots" (Technique): AoE Quantum DMG = 100% ATK to all enemies.
  technique: {
    name: 'Puss in Boots',
    kind: 'attack',
    apply(sim, u, _ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 1, toughDmg: 10, label: 'Puss in Boots' })
    },
  },
  onStart(sim, u) {
    const rt = sim.rt(u)
    rt.cipherTally = 0
    rt.cipherFuaCount = 0
    // A3 Sleight of Sky: all enemies take +40% DMG; Cipher's FUA CRIT DMG +100%
    for (const e of sim.livingEnemiesOf(u)) sim.addBuff(e, { id: 'cipher_a6', name: 'Sleight of Sky', mods: [{ stat: 'vulnAll', value: 0.40 }], turns: Infinity } as never)
    sim.addBuff(u, { id: 'cipher_a3', name: 'Sleight of Sky', mods: [{ stat: 'critDmg:fua', value: 1.0 }], turns: Infinity } as never)
    // A0: SPD-gated CRIT Rate
    const spd = eff(u).spd
    let crit = 0
    if (spd >= 170) crit = 0.5
    else if (spd >= 140) crit = 0.25
    if (crit > 0) sim.addBuff(u, { id: 'cipher_a0', name: 'Empyrean Strides', mods: [{ stat: 'critRate', value: crit }], turns: Infinity } as never)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  onTurnStart(sim, u) {
    sim.rt(u).cipherFuaCount = 0
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    ensurePatron(sim, u, rt)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const main = enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0])
      ensurePatron(sim, u, rt, main.id)
      const tally = (rt.cipherTally as number) ?? 0
      // Quantum DMG main + True DMG = % of tally
      sim.hit(u, main, { type: 'ult', elem: 'Quantum', mult: mult('cipher', 'ult', lv.ult), toughDmg: 10, label: "Yours Truly" })
      if (tally > 0) sim.hit(u, main, { type: 'add', noSeq: true, flat: Math.round(tally * mult('cipher', 'ult_a2', lv.ult)), canCrit: false, label: 'True DMG (main)' })
      // adj: Quantum + True (distributed)
      const adjQ = mult('cipher', 'ult_a4', lv.ult)
      const adjT = tally * mult('cipher', 'ult_a3', lv.ult)
      const adjTargets = enemies.filter(e => e.id !== main.id)
      if (adjTargets.length) {
        const perT = adjT / (adjTargets.length + 1)
        for (const e of enemies) {
          sim.hit(u, e, { type: 'ult', elem: 'Quantum', mult: adjQ, toughDmg: 20, label: 'Yours Truly (adj)' })
          if (perT > 0) sim.hit(u, e, { type: 'add', noSeq: true, flat: Math.round(perT), canCrit: false, label: 'True DMG (adj)' })
        }
      }
      const eidU = (ctx.eidolon as number) ?? 0
      rt.cipherTally = eidU >= 6 ? Math.round(((rt.cipherTally as number) ?? 0) * 0.2) : 0
      sim.log(`${u.name} Ult: True DMG from tally ${Math.round(tally)}${eidU >= 6 ? ` (E6 return ${rt.cipherTally})` : ''}`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const main = enemies.reduce((m, e) => (e.hp > m.hp ? e : m), enemies[0])
      ensurePatron(sim, u, rt, main.id)
      // Weaken main + adj (base chance 120%) — sim has no enemy-DMG-down stat, applied as tag
      for (const e of enemies) {
        const isMain = e.id === main.id
        // applyDebuff(sim, attacker, target, baseChance, onHit, label)
        sim.applyDebuff(u, e, 1.2, () => sim.addBuff(e, { id: 'cipher_weaken', name: 'Hey, Jackpot for the Taking', mods: [], turns: mult('cipher', 'skill_a5', lv.skill) } as never), 'Weaken')
        // Quantum DMG main / adj
        sim.hit(u, e, { type: 'skill', elem: 'Quantum', mult: isMain ? mult('cipher', 'skill', lv.skill) : mult('cipher', 'skill_a2', lv.skill), toughDmg: isMain ? 10 : 5, label: isMain ? 'Jackpot (main)' : 'Jackpot (adj)', ...(isMain ? { split: [0.1, 0.1, 0.1, 0.1, 0.1, 0.5] } : {}) })
      }
      // Cipher ATK+ 30% for 2 turns
      sim.addBuff(u, { id: 'cipher_atk', name: 'Hey, Jackpot for the Taking', mods: [{ stat: 'atkPct', value: mult('cipher', 'skill_a4', lv.skill) }], turns: 2 } as never)
      sim.log(`${u.name} Skill: Weaken + Quantum Blast, ATK+`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    sim.hit(u, t, { type: 'basic', elem: 'Quantum', mult: mult('cipher', 'basic', lv.basic), toughDmg: 10, label: 'Missed Catch' })
  },

  // Talent: tally ally non-True DMG to the Patron; FUA when another ally attacks the Patron
  onAfterAttack(sim, attacker, target, dmgType, ctx, dmg) {
    const u = cipherOf(sim)
    if (!u) return
    if (attacker.side !== 'ally' || attacker.kind !== 'char') return
    if (target.side !== 'enemy' || target.dead) return
    if (dmgType === 'add' || dmgType === 'elation' || dmgType === 'dot' || dmgType === 'break') return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const patronId = (rt.cipherPatron as string) ?? ''
    const dealt = dmg ?? 0
    // A0 SPD tally multiplier
    const spd = eff(u).spd
    const tallyMult = spd >= 170 ? 2 : spd >= 140 ? 1.5 : 1
    // E2: Cipher hits an enemy → 120% base chance: DMG taken +30% (2 turns)
    if (eid >= 2 && attacker.id === u.id) {
      sim.applyDebuff(u, target, 1.2, () => sim.addBuff(target, { id: 'cipher_e2', name: 'In the Fray, Nab On a Spree', mods: [{ stat: 'vulnAll', value: 0.30 }], turns: 2 } as never), 'E2 DMG taken+')
    }
    if (target.id === patronId) {
      let pct = mult('cipher', 'talent_a2', lv.talent) * tallyMult
      if (eid >= 1) pct *= 1.5
      if (eid >= 6 && dmgType === 'fua') pct += 0.16
      rt.cipherTally = (rt.cipherTally as number ?? 0) + Math.round(dealt * pct)
    } else {
      // A2 300 Rogues: tally 8% of non-True DMG dealt to non-Patron enemies (always-on)
      rt.cipherTally = (rt.cipherTally as number ?? 0) + Math.round(dealt * 0.08 * tallyMult)
    }
    // Talent FUA when another ally attacks the Patron (up to talent_a3 per turn)
    if (target.id === patronId && attacker.id !== u.id) {
      const cap = mult('cipher', 'talent_a3', lv.talent)
      const cnt = (rt.cipherFuaCount as number) ?? 0
      if (cnt < cap) {
        rt.cipherFuaCount = cnt + 1
        if (eid >= 1) sim.addBuff(u, { id: 'cipher_e1', name: 'Read the Room, Seek the Glee', mods: [{ stat: 'atkPct', value: 0.8 }], turns: 2 } as never)
        const fuaMult = mult('cipher', 'talent', lv.talent) * (eid >= 6 ? 4.5 : 1) // E6 +350%
        sim.hit(u, target, { type: 'fua', elem: 'Quantum', mult: fuaMult, toughDmg: 5, label: 'Hospitable Dolosian (FUA)', split: [0.2, 0.1, 0.1, 0.6] })
      }
      // E4: Patron attacked by an ally → Additional Quantum DMG 50% ATK (every attack)
      if (eid >= 4 && !target.dead) sim.hit(u, target, { type: 'add', noSeq: true, elem: 'Quantum', flat: Math.round(eff(u).atk * 0.5), canCrit: false, label: 'E4 add DMG' })
    }
  },
}


// ===== fugue  (was fugue.ts) =====
function prayerTarget(sim: SimApi, u: Unit): Unit | undefined {
  const allies = sim.allies(u.side).filter(a => a.kind === 'char' && a.id !== u.id && !a.dead)
  if (!allies.length) return undefined
  return allies.reduce((m, a) => (sim.effBe(a) > sim.effBe(m) ? a : m), allies[0])
}

export const fugueKit: KitDef = {
  id: 'fugue',
  name: 'Fugue',
  elem: 'Fire',
  energyMax: 130,
  base: { ...PROG.fugue.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 122507 "Percipient Shine": advance self 40%, then 100% base chance to inflict each enemy with
  // the DEF Reduction state of the Skill's Torrid Scorch on-attack (8%, 2t).
  technique: {
    name: 'Percipient Shine',
    kind: 'buff',
    apply(sim, u, ctx) {
      // 122507: advance self 40%, then 100% base chance to inflict each enemy with the Skill's
      // Torrid Scorch DEF Reduction (Skill #4, 2t). Value read from the ladder (was a stale 0.08).
      sim.advance(u, 0.4)
      const val = mult('fugue', 'skill_def', levelsOf(ctx).skill)
      for (const e of sim.livingEnemiesOf(u)) {
        if (!e.dead) sim.addBuff(e, { id: 'fugue_scorch', name: 'Torrid Scorch DEF↓', mods: [{ stat: 'defRed', value: val }], turns: 2, debuff: true })
      }
      sim.log(`${u.name} Technique: Percipient Shine (+40% AV, Torrid Scorch DEF↓ ${Math.round(val * 100)}% ×2t)`)
    },
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    // keep Torrid Scorch up: re-skill when it expires (track remaining scorch turns)
    const rt = sim.rt(u) as { scorch?: number }
    if (sim.sp() >= 1 && (!rt.scorch || rt.scorch <= 1) && prayerTarget(sim, u)) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  onTurnStart(sim, u, _ctx) {
    // Torrid Scorch duration decreases at start of Fugue's every turn
    const rt = sim.rt(u) as { scorch?: number }
    if (typeof rt.scorch === 'number') rt.scorch = Math.max(0, rt.scorch - 1)
  },
  onUnitDeath(sim, u) {
    // no Cloudflame Luster bars without their source: dead Fugue drops the exo bars (no re-Break)
    sim.clearExoBars(u)
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    // talent 122504 #2: every enemy carries a Cloudflame Luster bar (40% Max Toughness) that drains
    // after the main bar breaks and empties into another Weakness Break DMG (Exo bar, resolved in BreakResolver)
    sim.registerExoBar(u, { id: 'cloudflame', pct: 0.4, label: 'Cloudflame Break' })

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Solar Splendor: Fire AoE all enemies (ignores weakness for toughness; flat fire break)
      const um = mult('fugue', 'ult', lv.ult)
      for (const e of sim.livingEnemiesOf(u)) {
        sim.hit(u, e, { type: 'ult', elem: 'Fire', mult: um, toughDmg: 30, label: 'Solar Splendor', split: [0.6, 0.1, 0.1, 0.1, 0.1] })
      }
      sim.log(`${u.name} Ult: Solar Splendor AoE ×${um.toFixed(2)}`)
      // E2: after ult, advance all allies by 24% (self excluded: own advance mid-own-turn would be lost per rule)
      if (eid >= 2) {
        for (const a of sim.allies(u.side)) if (a.kind === 'char' && a.id !== u.id) sim.advance(a, 0.24)
        sim.log('Fugue E2: advance all allies 24%')
      }
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      const t = prayerTarget(sim, u)
      if (!t) { sim.gainSp(1); return }
      const rt = sim.rt(u) as { scorch?: number }
      rt.scorch = mult('fugue', 'skill', lv.skill)
      sim.markAlliedTarget(t)
      // Foxian Prayer: +Break Effect to ally (B+E boosts their break DMG)
      // E6: while Torrid Scorch is active, prayer applies to ALL allies
      const targets = eid >= 6 ? sim.allies(u.side).filter(a => a.kind === 'char' && a.id !== u.id && !a.dead) : [t]
      for (const a of targets) {
        sim.removeBuff(a, 'fox_prayer')
        // Foxian Prayer lasts while Torrid Scorch is active (same-turn removal on either side), so
        // its duration follows the Torrid Scorch ladder, not the DEF-Reduction duration (#5).
        sim.addBuff(a, { id: 'fox_prayer', name: 'Foxian Prayer', mods: [
          { stat: 'be', value: mult('fugue', 'skill_a2', lv.skill) },
          // 122502 #6: bearer attacks ignore 50% of Toughness when the enemy lacks their Weakness
          { stat: 'toughPierce', value: mult('fugue', 'skill_a6', lv.skill) },
        ], turns: mult('fugue', 'skill', lv.skill) })
      }
      // E1: prayer ally weakness-break efficiency (approx: +50% BE-boosted break) — skip precise
      if (eid >= 1) sim.log('Fugue E1: prayer ally break efficiency')
      sim.gainEnergy(u, 30)
      sim.log(`${u.name} Skill: Foxian Prayer → ${eid >= 6 ? 'ALL allies' : t.name} (BE+), Torrid Scorch ${rt.scorch}t`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const target = sim.livingEnemiesOf(u)[0]
    const rt = sim.rt(u) as { scorch?: number }
    if ((rt.scorch ?? 0) > 0) {
      // 122508 "Fiery Caress": enhanced Basic ATK while in Torrid Scorch — single + adjacent Blast.
      sim.hitBlast(u, target,
        { type: 'basic', elem: 'Fire', mult: mult('fugue', 'basic', lv.basic), toughDmg: 10, label: 'Fiery Caress' },
        { type: 'basic', elem: 'Fire', mult: mult('fugue', 'basic_a2', lv.basic), toughDmg: 10, label: 'Fiery Caress (adj)' })
      sim.log(`${u.name} Basic: Fiery Caress (single+adjacent)`)
    } else {
      sim.hit(u, target, { type: 'basic', elem: 'Fire', mult: mult('fugue', 'basic', lv.basic), toughDmg: 10, label: 'Radiant Streak' })
    }
  },

  // Resolve at the end of the whole attack so the Super Break conversion reads the attack's full
  // Toughness Reduction (not one hit's share) and the DEF-shred rolls once per attack.
  afterAttackWindow: 'attack',
  onAfterAttack(sim, attacker, target, _dmgType, ctx, _dmg, atkToughRed) {
    if (attacker.side !== 'ally' || target.side !== 'enemy' || target.dead) return
    const u = sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'fugue' && !a.dead)
    if (!u) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const seq = sim.attackNo()

    // Torrid Scorch (Skill #3/#4/#5): every attack by the Foxian Prayer bearer has a base chance to
    // reduce the enemy's DEF (`fugue_scorch`, same state the Technique seeds), 2 turns. Once per attack.
    if (sim.hasBuff(attacker, 'fox_prayer') && rt.fugueScorchSeq !== seq) {
      rt.fugueScorchSeq = seq
      sim.applyDebuff(u, target, mult('fugue', 'skill_a3', lv.skill), () => {
        sim.removeBuff(target, 'fugue_scorch')
        sim.addBuff(target, { id: 'fugue_scorch', name: 'Torrid Scorch DEF↓', mods: [{ stat: 'defRed', value: mult('fugue', 'skill_def', lv.skill) }], turns: mult('fugue', 'skill_a4', lv.skill), debuff: true })
      }, 'Torrid Scorch DEF↓')
    }

    // Talent: after an ally attacks a Weakness Broken enemy, converts this attack's Toughness
    // Reduction into one instance of Super Break DMG. Once per attack.
    if (target.broken && (atkToughRed ?? 0) > 0 && rt.fugueSbSeq !== seq) {
      rt.fugueSbSeq = seq
      sim.superBreak(attacker, target, atkToughRed as number, mult('fugue', 'talent', lv.talent))
    }
  },
}


// ===== sampo  (was sampo.ts) =====
const WIND_SHEAR_TURNS = 4 // 3 + A1 Trap

function sampoUnit(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(x => x.kitId === 'sampo' && !x.dead)
}

function applyWindShear(sim: SimApi, sampo: Unit, target: Unit, lv: { talent: number }, eid: number, baseChance = 0.65): void {
  const dmgMult = mult('sampo', 'talent', lv.talent) * (eid >= 6 ? 1.15 : 1)
  sim.applyDebuff(sampo, target, baseChance, () => {
    const existing = target.dots.find(d => d.kind === 'WindShear')
    if (existing) {
      existing.stacks = Math.min(5, (existing.stacks ?? 1) + 1)
      existing.turns = WIND_SHEAR_TURNS
    } else {
      sim.applyDot(target, {
        kind: 'WindShear', elem: 'Wind', turns: WIND_SHEAR_TURNS, stacks: 1,
        baseDmg: sim.effAtk(sampo) * dmgMult, sourceUnit: sampo,
      } as unknown as DoTWithSource)
    }
  }, 'Wind Shear', 'WindShear')
}

/** E4: Skill hit on a 5-stack target immediately deals 8% of current Wind Shear DMG. */
function deeperTheLove(sim: SimApi, sampo: Unit, target: Unit, eid: number): void {
  if (eid < 4) return
  const ws = target.dots.find(d => d.kind === 'WindShear')
  if (!ws?.baseDmg || (ws.stacks ?? 1) < 5) return
  sim.hit(sampo, target, { type: 'dot', statValue: ws.baseDmg, mult: 0.08 * (ws.stacks ?? 1), canCrit: false, noDmgBoost: true, label: 'Deeper the Love' })
}

/** E2: defeat of a Wind Shear enemy → 100% base chance 1 Wind Shear stack on all enemies. */
function infectiousEnthusiasm(sim: SimApi, sampo: Unit, victim: Unit, lv: { talent: number }, eid: number): void {
  if (eid < 2 || !victim.dots.some(d => d.kind === 'WindShear')) return
  for (const e of [...sim.livingEnemiesOf(sampo)]) applyWindShear(sim, sampo, e, lv, eid, 1.0)
}

export const sampoKit: KitDef = {
  id: 'sampo',
  name: 'Sampo',
  elem: 'Wind',
  energyMax: 120,
  base: { ...PROG.sampo.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #110207 "Shining Bright" (Technique): delay all enemies' action by 25%.
  technique: {
    name: 'Shining Bright',
    kind: 'buff',
    apply(sim, u) {
      for (const e of [...sim.livingEnemiesOf(u)]) sim.delay(e, 0.25)
    },
  },
  onStart(sim, u, ctx) {
    ctx._wsOnBasic = true
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

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // AoE Wind ult
      sim.hitAoe(u, { type: 'ult', mult: mult('sampo', 'ult', lv.ult), elem: 'Wind', toughDmg: 20, label: 'Surprise Present', split: [0.25, 0.25, 0.25, 0.25] })
      // DoT vulnerability debuff: +30% DoT taken, 2t, 100% base chance
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.applyDebuff(u, e, 1.0, () => {
          sim.addBuff(e, { id: 'sampo_ult_vuln', name: 'Surprise Present DoT Taken+', mods: [{ stat: 'dotVuln', value: mult('sampo', 'ult_a2', lv.ult) }], turns: 2, debuff: true })
        }, 'Surprise Present')
        for (let i = 0; i < 4; i++) applyWindShear(sim, u, e, lv, eid) // Talent: 4 ult hits → 4 rolls
      }
      sim.gainEnergy(u, 10) // A2 Defensive Position
      sim.log(`${u.name} Ult: Surprise Present`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      // Single target hit + 4 random bounces
      const primary = manualTarget(sim, action, enemies[0])
      const skillM = mult('sampo', 'skill', lv.skill)
      sim.hit(u, primary, { type: 'skill', mult: skillM, elem: 'Wind', toughDmg: 20, label: 'Ricochet Love' })
      deeperTheLove(sim, u, primary, eid)
      applyWindShear(sim, u, primary, lv, eid)
      // E1: +1 bounce (5 total). Every hit (incl. bounce) rolls Wind Shear per-hit.
      const bounceCount = eid >= 1 ? 5 : 4
      for (let i = 0; i < bounceCount; i++) {
        const list = sim.livingEnemiesOf(u)
        if (!list.length) break
        const r = sim.rngPick(list)
        sim.hit(u, r, { type: 'skill', mult: skillM, elem: 'Wind', toughDmg: 0, label: 'Ricochet Love (bounce)' })
        deeperTheLove(sim, u, r, eid)
        applyWindShear(sim, u, r, lv, eid)
      }
      sim.log(`${u.name} Skill: Ricochet Love`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('sampo', 'basic', lv.basic), elem: 'Wind', toughDmg: 10, label: 'Dazzling Blades', split: [0.3, 0.3, 0.4] })
    for (let i = 0; i < 3; i++) applyWindShear(sim, u, t, lv, eid) // Talent: 3 basic hits → 3 rolls
  },

  onKill(sim, u, victim, ctx) {
    infectiousEnthusiasm(sim, u, victim, levelsOf(ctx), (ctx.eidolon as number) ?? 0)
  },
  onAllyKill(sim, _killer, victim, ctx) {
    const u = sampoUnit(sim)
    if (u) infectiousEnthusiasm(sim, u, victim, levelsOf(ctx), (ctx.eidolon as number) ?? 0)
  },

  // A4 Spice Up: enemies carrying Wind Shear deal 15% less DMG to Sampo (one enemy acts per turn)
  onEnemyTurnStart(sim, u, enemy, _ctx) {
    if (enemy.dots.some(d => d.kind === 'WindShear'))
      sim.addBuff(u, { id: 'sampo_a4', name: 'Spice Up', mods: [{ stat: 'mitigation', value: 0.15 }], turns: 1 })
  },
}


// ===== jiaoqiu  (was jiaoqiu.ts) =====
const ROAST_CAP = 5 // canon talent #4 = 5 max stacks; E6 → 9

/** Add n Ashen Roast stacks to a target. Stack 1 → +DMG #2, each extra +#3, plus Burn DoT #6. E1: +40% ally DMG to roast targets +1 extra stack on Talent inflict. */
function applyRoast(sim: SimApi, jq: Unit, target: Unit, n: number, ctx: KitRuntime, viaTalent = false): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  if (eid >= 1 && viaTalent) n += 1
  const cap = eid >= 6 ? 9 : ROAST_CAP
  const ex = target.buffs.find(b => b.id === 'jq_roast')
  const cur = ex?.stacks ?? 0
  if (n <= 0 && !ex) return // nothing to equalize onto — never create a 0-stack roast
  const next = Math.min(cap, cur + n)
  const mods: Array<{ stat: import('../entities/Unit').StatKey; value: number }> = [
    { stat: 'vulnAll', value: mult('jiaoqiu', 'talent', lv.talent) + mult('jiaoqiu', 'talent_a2', lv.talent) * (next - 1) },
  ]
  if (eid >= 1) mods.push({ stat: 'vulnAll', value: 0.4 }) // E1 Pentapathic Transference: allies +40% DMG to roast enemies
  if (eid >= 6) mods.push({ stat: 'resAll', value: -next * 0.03 }) // E6: Ashen Roast All-Type RES −3%/stack (target-side, signed)
  if (ex) {
    ex.stacks = next
    ex.mods = mods
    ex.turns = 2
  } else {
    sim.addBuff(target, { id: 'jq_roast', name: 'Ashen Roast', mods, turns: 2, debuff: true, maxStacks: cap, stacks: 1 })
  }
  // Burned: Fire DoT #6 of ATK per turn, 2 turns (E2 ×300%)
  const dotMult = mult('jiaoqiu', 'talent_a3', lv.talent) * (eid >= 2 ? 4 : 1)
  const burn = target.dots.find(d => d.kind === 'Burn') as DoTWithSource | undefined
  if (burn) {
    burn.baseDmg = Math.max(burn.baseDmg ?? 0, sim.effAtk(jq) * dotMult)
    burn.turns = 2
    burn.sourceUnit = jq
  } else {
    sim.applyDot(target, { kind: 'Burn', elem: 'Fire', turns: 2, baseDmg: sim.effAtk(jq) * dotMult, sourceUnit: jq } as unknown as DoTWithSource)
  }
  sim.log(`${jq.name} Ashen Roast ${next}/${cap} on ${target.name}`)
}

export const jiaoqiuKit: KitDef = {
  id: 'jiaoqiu',
  name: 'Jiaoqiu',
  elem: 'Fire',
  energyMax: 100,
  base: { ...PROG.jiaoqiu.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Nihility' },
  // 121807 "Fiery Queller": AoE 100% ATK Fire + 100% base chance to apply 1 Ashen Roast stack to
  // each enemy. attack Technique.
  technique: {
    name: 'Fiery Queller',
    kind: 'attack',
    apply(sim, u, ctx) {
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Fire', mult: 1.0, toughDmg: 10, label: 'Fiery Queller' })
      for (const e of enemies) sim.applyDebuff(u, e, 1.0, () => applyRoast(sim, u, e, 1, ctx), 'Ashen Roast')
    },
  },
  onStart(sim, u, ctx) {
    // A1 Pyre Cleanse: +15 Energy at battle start
    sim.gainEnergy(u, 15)
    // A2 Hearth Kindle: per 15% EHR over 80% → ATK +60%, cap +240%
    const ehr = (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr')
    const tiers = Math.max(0, Math.floor((ehr - 0.8) / 0.15))
    if (tiers > 0)
      sim.addBuff(u, { id: 'jq_a2_atk', name: 'Hearth Kindle', mods: [{ stat: 'atkPct', value: Math.min(2.4, tiers * 0.6) }], turns: Infinity })
    ctx.zone = false
    ctx.zoneTurns = 0
    ctx.zoneRoast = 0
  },
  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Set all enemies' stacks to the highest on the battlefield
      const max = enemies.reduce((m, e) => Math.max(m, e.buffs.find(b => b.id === 'jq_roast')?.stacks ?? 0), 0)
      for (const e of enemies) applyRoast(sim, u, e, Math.max(0, max - (e.buffs.find(b => b.id === 'jq_roast')?.stacks ?? 0)), ctx)
      // AoE Fire + Zone (#3 turns)
      sim.hitAoe(u, { type: 'ult', mult: mult('jiaoqiu', 'ult', lv.ult), elem: 'Fire', toughDmg: 20, label: 'Pyrograph Arcanum' })
      ctx.zone = true
      ctx.zoneTurns = 3
      ctx.zoneRoast = 0 // reset Zone action-roast cap (ult #5 = 6 triggers per Zone)
      // Zone: enemies take +Ult DMG #3
      for (const e of enemies)
        sim.addBuff(e, { id: 'jq_zone_vuln', name: 'Pyrograph Arcanum Ult Taken+', mods: [{ stat: 'vulnType:ult', value: mult('jiaoqiu', 'ult_a3', lv.ult) }], turns: 3, debuff: true })
      // E4: Zone → enemies ATK −15%
      if ((ctx.eidolon as number) >= 4)
        for (const e of enemies)
          sim.addBuff(e, { id: 'jq_e4_atk', name: 'Leisure In, Luster Out ATK↓', mods: [{ stat: 'atkPct', value: -0.15 }], turns: 3, debuff: true })
      sim.log(`${u.name} Ult: Pyrograph Arcanum + Zone (3t)`) // +5 energy from castUlt
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hitBlast(u, primary,
        { type: 'skill', mult: mult('jiaoqiu', 'skill', lv.skill), elem: 'Fire', toughDmg: 20, label: 'Scorch Onslaught' },
        { type: 'skill', mult: mult('jiaoqiu', 'skill_a2', lv.skill), elem: 'Fire', toughDmg: 10, label: 'Scorch Onslaught (adj)' })
      // 100% base chance (#3) to inflict 1 Ashen Roast on primary
      sim.applyDebuff(u, primary, mult('jiaoqiu', 'skill_a3', lv.skill), () => applyRoast(sim, u, primary, 1, ctx, true), 'Ashen Roast')
      sim.log(`${u.name} Skill: Scorch Onslaught`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('jiaoqiu', 'basic', lv.basic), elem: 'Fire', toughDmg: 10, label: 'Heart Afire' })
    // Talent: Basic/Skill/Ult hit → 100% inflict 1 Ashen Roast (#1)
    sim.applyDebuff(u, t, mult('jiaoqiu', 'talent', lv.talent), () => applyRoast(sim, u, t, 1, ctx, true), 'Ashen Roast')
  },

  // Ult Zone: enemies taking action have 60% base chance (#2) to gain 1 Ashen Roast, up to 6 times (#5) per Zone.
  onEnemyTurnStart(sim, u, enemy, ctx) {
    if (!ctx.zone) return
    if ((ctx.zoneRoast as number) >= 6) return
    sim.applyDebuff(u, enemy, mult('jiaoqiu', 'ult_a2', levelsOf(ctx).ult), () => {
      ctx.zoneRoast = (ctx.zoneRoast as number) + 1
      applyRoast(sim, u, enemy, 1, ctx)
      sim.log(`${u.name} Zone Ashen Roast (${ctx.zoneRoast}/6)`)
    }, 'Ashen Roast')
  },

  // Zone tick-down at Jiaoqiu's turn start; Zone expiry clears the buff.
  onTurnStart(sim, u, ctx) {
    if (!ctx.zone) return
    ctx.zoneTurns = (ctx.zoneTurns as number) - 1
    if ((ctx.zoneTurns as number) <= 0) {
      ctx.zone = false
      for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'jq_zone_vuln')
      sim.log(`${u.name} Zone ends`)
    }
  },
}


// ===== acheron  (was acheron.ts) =====
/** Slashed Dream cap (Acheron's custom resource replaces Energy). */
const SD_MAX = 9
/** Crimson Knot max stacks per enemy. */
const CK_MAX = 9

/** gain Slashed Dream (capped at SD_MAX). */
function gainSD(sim: SimApi, u: Unit, n: number): void {
  const before = u.energy
  u.energy = Math.min(SD_MAX, u.energy + n)
  if (u.energy !== before) sim.log(`Acheron: Slashed Dream ${before} → ${u.energy}/${SD_MAX}`)
}

/** Get current CK stacks on an enemy. */
function ckOf(e: Unit): number {
  const b = e.buffs.find(b => b.id === 'crimson_knot')
  return b ? (b.stacks ?? 0) : 0
}

/** Add/remove CK stacks on an enemy. */
function setCK(sim: SimApi, e: Unit, stacks: number): void {
  const clamped = Math.max(0, Math.min(CK_MAX, stacks))
  sim.removeBuff(e, 'crimson_knot')
  if (clamped > 0) sim.addBuff(e, { id: 'crimson_knot', name: 'Crimson Knot', mods: [], stacks: clamped, turns: Infinity, debuff: true })
}

/** Count Nihility allies other than Acheron (for The Abyss). */
function countNihility(sim: SimApi, acheron: Unit): number {
  return sim.allies(acheron.side).filter(u => u.kind === 'char' && u.id !== acheron.id && u.base.path === 'Nihility').length
}

/**
 * The Abyss: "When there are 1 or 2 Nihility characters other than Acheron in the team, the
 * DMG dealt by Acheron's Basic ATK, Skill, and Ultimate increases to 115% or 160%."
 * E2 lowers the requirement for the **highest** effect only (2 → 1) — it must never hand out
 * 115% for an empty Nihility roster, so the reduction is applied to the 160% gate only.
 */
function abyssMult(sim: SimApi, acheron: Unit, eid: number): number {
  const nih = countNihility(sim, acheron)
  if (nih >= (eid >= 2 ? 1 : 2)) return 1.60
  if (nih >= 1) return 1.15
  return 1.0
}

/** Thunder Core stacking DMG buff (from Rainblade hitting CK targets). */
function addThunderCore(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u) as { thunderCore?: number }
  const stacks = Math.min(3, (rt.thunderCore ?? 0) + 1)
  rt.thunderCore = stacks
  sim.removeBuff(u, 'ach_thunder_core')
  sim.addBuff(u, { id: 'ach_thunder_core', name: `Thunder Core ${stacks}/3`, mods: [{ stat: 'dmgAll', value: stacks * 0.30 }], turns: 3 })
}

/**
 * Acheron Ult: 3× Rainblade + Stygian Resurge.
 * Each Rainblade: hit main target, remove up to 3 CK, then AoE burst per removed CK.
 * Stygian Resurge: AoE hit + remove all remaining CK.
 */
function performUlt(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const enemies = sim.livingEnemiesOf(u)
  if (!enemies.length) return
  const target = enemies[0] // primary target

  // E4: enemies take +8% Ult DMG Vuln (already applied at battle start)
  // Talent: during Ult, all enemies All-RES down
  const resDown = mult('acheron', 'talent', lv.talent)
  for (const e of enemies) sim.addBuff(e, { id: 'ach_ult_res', name: 'Slashed Dream Cries in Red All RES↓', mods: [{ stat: 'resAll', value: -resDown }], turns: Infinity })

  // Abyss multiplier — the same onStart-cached value Basic/Skill use: the trace reads team
  // composition, which is static for the battle, so the Ult must not re-derive it.
  const abyss = (ctx.abyssMult as number) ?? 1

  // E6: RES PEN +20%
  if (eid >= 6) sim.addBuff(u, { id: 'ach_e6_pen', name: 'Apocalypse, the Emancipator', mods: [{ stat: 'resPenAll', value: 0.20 }], turns: Infinity })

  // 3× Rainblade (RB1: 2h, RB2: 3h, RB3: unsplit)
  const rbSplit: [number[], number[]] = [[0.5, 0.5], [0.3, 0.3, 0.4]]
  for (let i = 0; i < 3; i++) {
    if (target.dead) break
    // Rainblade: hit main target
    sim.hit(u, target, { type: 'ult', elem: 'Lightning', mult: mult('acheron', 'ult', lv.ult) * abyss, toughDmg: 15, label: `Rainblade ${i + 1}`, ...(i < 2 ? { split: rbSplit[i] } : {}) })
    // Remove up to 3 CK from main target → AoE burst
    const ck = ckOf(target)
    const removed = Math.min(3, ck)
    if (removed > 0) {
      setCK(sim, target, ck - removed)
      // CK-removal AoE: base + per-stack; ult_a4 = cap of ALL additions (3 stacks → /3 per stack)
      const aoeMult = (mult('acheron', 'ult_a2', lv.ult) + removed * mult('acheron', 'ult_a4', lv.ult) / 3) * abyss
      sim.hitAoe(u, { type: 'ult', elem: 'Lightning', mult: aoeMult, toughDmg: 5, label: `Rainblade ${i + 1} CK-Burst` })
      sim.log(`Acheron: CK-Burst mult ${aoeMult.toFixed(4)} (removed ${removed})`)
      addThunderCore(sim, u, ctx)
    }
  }

  // Stygian Resurge: AoE hit + remove ALL remaining CK
  sim.hitAoe(u, { type: 'ult', elem: 'Lightning', mult: mult('acheron', 'ult_a3', lv.ult) * abyss, toughDmg: 10, label: 'Stygian Resurge' })
  // Remove all CK from all enemies
  for (const e of sim.livingEnemiesOf(u)) setCK(sim, e, 0)

  // A6: Stygian Resurge additionally deals 6× 25% ATK random hits (Ult DMG)
  for (let i = 0; i < 6; i++) {
    const living = sim.livingEnemiesOf(u)
    if (!living.length) break
    const random = sim.rngPick(living)
    sim.hit(u, random, { type: 'ult', elem: 'Lightning', mult: 0.25 * abyss, toughDmg: 3, label: 'Thunder Core (Resurge)' })
  }

  // Clean up
  for (const e of enemies) sim.removeBuff(e, 'ach_ult_res')
  if (eid >= 6) sim.removeBuff(u, 'ach_e6_pen')
  sim.log(`${u.name} Ult: Slashed Dream Cries in Red`)
}

export const acheronKit: KitDef = {
  id: 'acheron',
  name: 'Acheron',
  elem: 'Lightning',
  energyMax: SD_MAX, // Slashed Dream stored as energy
  // canon (Energy.md): Acheron does not use the Energy system — no sp_base +5 after the cast
  ultConsumption: 'none',
  base: { ...PROG.acheron.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Nihility' },
  // 130807 "Quadrivalent Ascendance": at the start of each wave, deals Lightning DMG equal to 200%
  // of Acheron's ATK to all enemies, reducing Toughness regardless of Weakness. attack Technique.
  technique: {
    name: 'Quadrivalent Ascendance',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Lightning', mult: 2.0, toughDmg: 10, label: 'Quadrivalent Ascendance' })
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    // Red Oni: battle start +5 SD +5 CK on random enemy
    gainSD(sim, u, 5)
    const enemies = sim.livingEnemiesOf(u)
    if (enemies.length) {
      const target = sim.rngPick(enemies)
      setCK(sim, target, 5)
    }
    // E4: enemies take +8% Ultimate DMG (vulnType:ult debuff, re-applied per wave)
    if (eid >= 4) {
      for (const e of enemies) sim.addBuff(e, { id: 'ach_e4', name: 'Shrined Fire for Mirrored Soul Ult Taken+', mods: [{ stat: 'vulnType:ult', value: 0.08 }], turns: Infinity, debuff: true })
      ctx.e4Applied = true
    }
    // E1: critRate vs debuffed enemies — flattened always-on (sim has no per-target crit gate)
    if (eid >= 1) sim.addBuff(u, { id: 'ach_e1', name: 'Silenced Sky Spake Sooth', mods: [{ stat: 'critRate', value: 0.18 }], turns: Infinity })
    ctx.abyssMult = abyssMult(sim, u, eid)
    ctx.thunderCore = 0
  },

  onWaveStart(sim, u, ctx) {
    // E4: re-apply ult vuln on each new wave's enemies
    if (((ctx.eidolon as number) ?? 0) >= 4) {
      for (const e of sim.livingEnemiesOf(u)) sim.addBuff(e, { id: 'ach_e4', name: 'Shrined Fire for Mirrored Soul Ult Taken+', mods: [{ stat: 'vulnType:ult', value: 0.08 }], turns: Infinity, debuff: true })
    }
    // wave energy reset → Slashed Dream persists (нет reset)
  },

  onTurnStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    // E2: +1 SD +1 CK on most-stacked enemy
    if (eid >= 2) {
      gainSD(sim, u, 1)
      let best: Unit | undefined, bestCk = -1
      for (const e of sim.livingEnemiesOf(u)) {
        const ck = ckOf(e)
        if (ck > bestCk) { bestCk = ck; best = e }
      }
      if (best) setCK(sim, best, ckOf(best) + 1)
    }
  },

  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const abyss = (ctx.abyssMult as number) ?? 1

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      performUlt(sim, u, ctx)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      const target = enemies[0]
      // Skill: Blast +1 SD +3 CK on main target
      sim.hitBlast(u, target,
        { type: 'skill', elem: 'Lightning', mult: mult('acheron', 'skill', lv.skill) * abyss, toughDmg: 15, label: 'Octobolt Flash', split: [0.1, 0.1, 0.1, 0.7] },
        { type: 'skill', elem: 'Lightning', mult: mult('acheron', 'skill_a2', lv.skill) * abyss, toughDmg: 5, label: 'Octobolt Flash (adj)' },
      )
      gainSD(sim, u, 1)
      setCK(sim, target, ckOf(target) + 3)
      return
    }

    // Basic: single +1 SD
    sim.hit(u, enemies[0], { type: 'basic', elem: 'Lightning', mult: mult('acheron', 'basic', lv.basic) * abyss, toughDmg: 10, label: 'Trilateral Wiltcross' })
    gainSD(sim, u, 1)
  },

  // Talent: debuff application by any unit → +1 SD +1 CK on most-stacked enemy
  onDebuffInflict(sim, u, target, _ctx) {
    // The real game fires once per ability use; we simplify to once per debuff landing.
    gainSD(sim, u, 1)
    void target
    let best: Unit | undefined, bestCk = -1
    for (const e of sim.livingEnemiesOf(u)) {
      const ck = ckOf(e)
      if (ck > bestCk) { bestCk = ck; best = e }
    }
    if (best) setCK(sim, best, ckOf(best) + 1)
  },
}

// ===== hysilens  (was hysilens.ts) =====
const HYS_DOTS: Array<{ kind: DoT['kind']; elem: Elem; stat: 'talent_a2' | 'talent_a4' }> = [
  { kind: 'WindShear', elem: 'Wind', stat: 'talent_a2' },
  { kind: 'Burn', elem: 'Fire', stat: 'talent_a2' },
  { kind: 'Shock', elem: 'Lightning', stat: 'talent_a2' },
  { kind: 'Bleed', elem: 'Physical', stat: 'talent_a4' },
]

const ZONE_BUFFS = ['hys_zone', 'hys_zone_def', 'hys_zone_atk', 'hys_e4']

/** Sirenic Serenade: apply ONE of WindShear/Bleed/Burn/Shock, preferring a state the target lacks.
 *  Bleed = min(#3(0.2)×target MaxHP, #4×ATK); others = #2×ATK for 2 turns.
 *  E1: a second "equivalent" instance coexists unconditionally. */
function applyTalentDot(sim: SimApi, hys: Unit, target: Unit, lv: { talent: number }, mults: {
  a2: number
  a4: number
}, turns: number, ctx: KitRuntime): void {
  if (target.dead) return
  const eid = (ctx.eidolon as number) ?? 0
  const present = new Set(target.dots.map(d => d.kind))
  const missing = HYS_DOTS.filter(o => !present.has(o.kind))
  const pool = missing.length ? missing : HYS_DOTS
  const choice = sim.rngPick(pool)
  const dotMult = choice.stat === 'talent_a2' ? mults.a2 : mults.a4
  let dmg = sim.effAtk(hys) * dotMult
  // canon: Bleed is 20% of target MaxHP, capped at #4×ATK
  if (choice.kind === 'Bleed') dmg = Math.min(dmg, mult('hysilens', 'talent_a3', lv.talent) * target.maxHp)
  const existing = target.dots.find(d => d.kind === choice.kind) as DoTWithSource | undefined
  const push = (): void => {
    sim.applyDot(target, { kind: choice.kind, elem: choice.elem, turns, baseDmg: dmg, sourceUnit: hys } as unknown as DoTWithSource)
  }
  if (existing) {
    existing.baseDmg = Math.max(existing.baseDmg ?? 0, dmg)
    existing.turns = Math.max(existing.turns, turns)
    // baseDmg is now Hysilens'-derived, so the source must be too — computeDotDamage reads the
    // owner's DMG-boost buffs and level, and A1's detonation scales off the same owner.
    existing.sourceUnit = hys
  } else {
    push()
  }
  sim.log(`Hysilens Talent: ${choice.kind} on ${target.name}`)
  // E1: additionally inflict 1 instance equivalent to the original, can coexist with pre-existing states
  if (eid >= 1) {
    push()
    sim.log('Hysilens E1: extra ' + choice.kind + ' instance')
  }
}

/** Maelstrom Rhapsody Zone Phys DoT — one instance per DoT-tick trigger, capped per turn per enemy. */
function zoneDot(sim: SimApi, hys: Unit, target: Unit, ctx: KitRuntime, lv: { ult: number }): void {
  if (target.dead) return
  const eid = (ctx.eidolon as number) ?? 0
  const cap = eid >= 6 ? 12 : Math.round(mult('hysilens', 'ult_a5', lv.ult))
  const trig = (ctx.hysTrig as Map<string, number> | undefined) ?? new Map<string, number>()
  const cur = trig.get(target.id) ?? 0
  if (cur >= cap) return
  trig.set(target.id, cur + 1)
  ctx.hysTrig = trig
  // E6: multiplier of the DMG dealt +20% (canon: relative, ×1.2)
  const dotMult = mult('hysilens', 'ult_a4', lv.ult) * (1 + (eid >= 6 ? 0.2 : 0))
  const dmg = sim.effAtk(hys) * dotMult
  sim.applyDot(target, { kind: 'Bleed', elem: 'Physical', turns: 2, baseDmg: dmg, sourceUnit: hys } as unknown as DoTWithSource)
  sim.log(`Hysilens Zone Phys DoT on ${target.name} (+1)`)
}

/** The Fiddle of Pearls (A2): every 10% EHR over 60% → +15% DMG dealt, max +90%. */
function fiddleDmg(sim: SimApi, hys: Unit): number {
  const ehr = (hys.base.ehr ?? 0) + buffSum(hys.buffs, 'ehr')
  return Math.min(0.9, Math.max(0, Math.floor((ehr - 0.6) / 0.1)) * 0.15)
}

/** deploy Zone (Maelstrom Rhapsody): DEF↓/ATK↓(flatten)/zone mark (+E4 ALL-RES), 3 turns of Hysilens, +1 SP (A0). */
function deployZone(sim: SimApi, hys: Unit, ctx: KitRuntime, lv: { ult: number }): void {
  const eid = (ctx.eidolon as number) ?? 0
  for (const e of [...sim.livingEnemiesOf(hys)]) {
    for (const id of ZONE_BUFFS) if (sim.hasBuff(e, id)) sim.removeBuff(e, id)
    sim.addBuff(e, { id: 'hys_zone', name: 'Maelstrom Rhapsody', mods: [], turns: Infinity, debuff: true })
    // DEF -30% (ult_a3); ATK-down flattened to log-only tag (no enemy-ATK-down in sim)
    sim.addBuff(e, { id: 'hys_zone_def', name: 'Maelstrom Rhapsody DEF↓', mods: [{ stat: 'defRed', value: mult('hysilens', 'ult_a3', lv.ult) }], turns: Infinity, debuff: true })
    sim.addBuff(e, { id: 'hys_zone_atk', name: 'Maelstrom Rhapsody', mods: [], turns: Infinity, debuff: true })
    // E4: All-Type RES -20% while zone active
    if (eid >= 4)
      sim.addBuff(e, { id: 'hys_e4', name: 'Lo, How Time Flows By All-RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: Infinity, debuff: true })
  }
  ctx.zoneActive = true
  ctx.zoneTurns = Math.round(mult('hysilens', 'ult_a2', lv.ult))
  // A0 The Gladius of Conquest: every zone deploy recovers 1 Skill Point
  sim.gainSp(1)
  // E2: while Zone is active the Fiddle of Pearls DMG Boost applies to ALL allies
  const f = fiddleDmg(sim, hys)
  if (((ctx.eidolon as number) ?? 0) >= 2 && f > 0) {
    for (const a of sim.allies('ally')) {
      if (a.kind === 'char' && !a.dead) {
        if (sim.hasBuff(a, 'hys_fiddle2')) sim.removeBuff(a, 'hys_fiddle2')
        sim.addBuff(a, { id: 'hys_fiddle2', name: 'Tell Me Why Waves Roar High DMG+', mods: [{ stat: 'dmgAll', value: f }] })
      }
    }
    sim.log(`Hysilens E2: Fiddle of Pearls +${(f * 100).toFixed(0)}% DMG to all allies`)
  }
  sim.log('Hysilens Deploys Zone +1 SP')
}

/** dispel Zone at 0 remaining turns: strip zone buffs + E2 team Fiddle from all allies. */
function removeZone(sim: SimApi, ctx: KitRuntime): void {
  ctx.zoneActive = false
  ctx.zoneTurns = 0
  const hys = sim.allies('ally').find(u => u.kitId === 'hysilens')
  if (!hys) return
  for (const e of sim.allies('enemy')) {
    for (const id of ZONE_BUFFS) if (sim.hasBuff(e, id)) sim.removeBuff(e, id)
  }
  for (const a of sim.allies('ally')) {
    if (a.kind === 'char' && sim.hasBuff(a, 'hys_fiddle2')) sim.removeBuff(a, 'hys_fiddle2')
  }
  sim.log('Hysilens Zone dispelled')
}

/** A1 The Bubble of Banquets: on Ultimate, all DoTs currently on each enemy deal 150% of their original DMG. */
function detonateDots_hysilens(sim: SimApi, hys: Unit, target: Unit): void {
  if (target.dead) return
  for (const d of [...target.dots]) {
    if (d.kind === 'Freeze' || d.kind === 'Imprisonment' || d.kind === 'Entanglement') continue
    const src = (d as DoTWithSource).sourceUnit ?? hys
    sim.hit(src, target, { type: 'dot', statValue: d.baseDmg * (d.stacks ?? 1), mult: 1.5, canCrit: false, defIgnore: d.defIgnore, label: 'The Bubble of Banquets', noSeq: true })
    if (target.dead) break
  }
}

export const hysilensKit: KitDef = {
  id: 'hysilens',
  name: 'Hysilens',
  elem: 'Physical',
  energyMax: 110,
  base: { ...PROG.hysilens.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Nihility' },
  // #132007 "At Ocean's Abode" (Technique): 100% base chance to inflict 2 of the Talent's
  // WindShear/Bleed/Burn/Shock states on every enemy.
  technique: {
    name: "At Ocean's Abode",
    kind: 'buff',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const mults = { a2: mult('hysilens', 'talent_a2', lv.talent), a4: mult('hysilens', 'talent_a4', lv.talent) }
      const turns = Math.round(mult('hysilens', 'talent_a5', lv.talent))
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0, () => {
          applyTalentDot(sim, u, e, lv, mults, turns, ctx)
          applyTalentDot(sim, u, e, lv, mults, turns, ctx)
        }, "At Ocean's Abode")
    },
  },
  onStart(sim, u, ctx) {
    ctx.hysTrig = new Map<string, number>()
    ctx.zoneActive = false
    ctx.zoneTurns = 0
    const eid = (ctx.eidolon as number) ?? 0
    // E1: DoT dealt by all allies ×1.16
    if (eid >= 1) {
      for (const a of sim.allies('ally')) {
        if (a.kind === 'char' && !a.dead)
          sim.addBuff(a, { id: 'hys_e1', name: 'You Ask Why Hearts Cry', mods: [{ stat: 'boost:dot', value: 0.16 }] })
      }
    }
    // A2 The Fiddle of Pearls: own DMG Boost (EHR-gated), always
    const f = fiddleDmg(sim, u)
    if (f > 0)
      sim.addBuff(u, { id: 'hys_fiddle', name: 'The Fiddle of Pearls DMG+', mods: [{ stat: 'dmgAll', value: f }] })
    // A0 The Gladius of Conquest: battle-start Zone (3 turns) +1 SP
    deployZone(sim, u, ctx, { ult: levelsOf(ctx).ult })
  },
  onTurnStart(sim, u, ctx) {
    // reset per-enemy zone trigger counters each Hysilens turn
    ctx.hysTrig = new Map<string, number>()
    // Zone duration: -1 at the start of Hysilens's every turn
    if (ctx.zoneActive) {
      const t = ((ctx.zoneTurns as number) ?? 0) - 1
      if (t <= 0) removeZone(sim, ctx)
      else ctx.zoneTurns = t
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

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.log(`${u.name} Ult: Maelstrom Rhapsody`)
      // A1 The Bubble of Banquets: DoTs detonate at 150% on ult use
      for (const e of [...sim.livingEnemiesOf(u)]) detonateDots_hysilens(sim, u, e)
      sim.hitAoe(u, { type: 'ult', mult: mult('hysilens', 'ult', lv.ult), toughDmg: 30, label: 'Maelstrom Rhapsody' })
      deployZone(sim, u, ctx, lv)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      sim.log(`${u.name} Skill: Overtone Hum`)
      sim.hitAoe(u, { type: 'skill', mult: mult('hysilens', 'skill', lv.skill), toughDmg: 15, label: 'Overtone Hum' })
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.applyDebuff(u, e, mult('hysilens', 'skill_a2', lv.skill), () => {
          sim.addBuff(e, { id: 'hys_vuln', name: 'Overtone Hum: Chorus After Dark Tides DMG Taken+', mods: [{ stat: 'vulnAll', value: mult('hysilens', 'skill_a3', lv.skill) }], turns: Math.round(mult('hysilens', 'skill_a4', lv.skill)), debuff: true })
          sim.log('Hysilens Skill: Increased DMG taken on ' + e.name)
        }, 'Overtone Hum (DMG taken)')
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    const total = mult('hysilens', 'basic', lv.basic)
    sim.hit(u, t, { type: 'basic', mult: total * 0.5, toughDmg: 5, label: 'Aeolian Mode (1/2)' })
    sim.hit(u, t, { type: 'basic', mult: total * 0.5, toughDmg: 5, label: 'Aeolian Mode (2/2)' })
  },

  // Talent Sirenic Serenade: any ally attack → 100% base chance to inflict ONE of 4 DoTs on the hit enemy
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (attacker.side !== 'ally' || target.side !== 'enemy' || target.dead) return
    if (dmgType === 'add' || dmgType === 'dot') return
    const hys = sim.allies('ally').find(u => u.kitId === 'hysilens' && !u.dead)
    if (!hys) return
    const lv = levelsOf(ctx)
    sim.applyDebuff(hys, target, mult('hysilens', 'talent', lv.talent), () => {
      applyTalentDot(sim, hys, target, lv, {
        a2: mult('hysilens', 'talent_a2', lv.talent),
        a4: mult('hysilens', 'talent_a4', lv.talent),
      }, Math.round(mult('hysilens', 'talent_a5', lv.talent)), ctx)
    }, 'Sirenic Serenade')
  },

  // Zone trigger: every DoT tick on a zoned enemy → Hysilens zone Phys DoT (capped per turn per enemy).
  // sim.tickDots fires onDoTTick for ALL living ally kits on any enemy DoT tick, so scale off `owner`
  // (this kit's unit) — the tick's own source is a different unit and may be a breaker or an ally.
  onDoTTick(sim, attacker, target, dot, ctx, owner) {
    if (target.side !== 'enemy' || target.dead) return
    if (!ctx.zoneActive || !sim.hasBuff(target, 'hys_zone')) return
    zoneDot(sim, owner, target, ctx, { ult: levelsOf(ctx).ult })
  },
}

// ===== the_dahlia  (was the_dahlia.ts) =====
function eid_the_dahlia(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function partnerOf(sim: SimApi, u: Unit): Unit | undefined {
  const id = sim.rt(u).dahlPartnerId as string | undefined
  if (!id) return undefined
  return sim.allies('ally').find(a => a.id === id && !a.dead)
}

// Super Break converts the triggering attack's toughness damage on the already-Broken target
// (sim.attackToughRed: real per-attack accumulator, includes Broken targets, resets per attack key).

export const the_dahliaKit: KitDef = {
  id: 'the_dahlia',
  name: 'The Dahlia',
  elem: 'Fire',
  energyMax: 130,
  base: { ...PROG.the_dahlia.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #132201 "The Heart Makes the Finest Tomb" (Technique): immediately deploys the Skill's Zone.
  technique: {
    name: 'The Heart Makes the Finest Tomb',
    kind: 'buff',
    zone: true,
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      ctx.dahlZone = mult('the_dahlia', 'skill_a2', lv.skill)
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'dahl_zone', name: 'Lick... Enkindled Betrayal', mods: [{ stat: 'wbe', value: mult('the_dahlia', 'skill_a3', lv.skill) }], turns: Infinity })
      sim.log(`${u.name} Technique: deploys Skill's Zone`)
    },
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
      // Wilt on all enemies: DEF↓ for ult_a2 turns
      for (const e of enemies) {
        sim.addBuff(e, { id: 'dahl_wilt', name: 'Wilt DEF↓', mods: [{ stat: 'defRed', value: mult('the_dahlia', 'ult_a3', lv.ult) }], turns: mult('the_dahlia', 'ult_a2', lv.ult), debuff: true })
      }
      sim.hitAoe(u, { type: 'ult', mult: mult('the_dahlia', 'ult', lv.ult), elem: 'Fire', toughDmg: 90, label: 'Wallow: Entombed Ash' })
      // A2 (Outgrow the Old): Fire weakness implant attack → +20 fixed Fire toughness on the implanted,
      // +10% Max Energy per use (capped 50%)
      for (const e of enemies) {
        if (!e.dead && sim.hasBuff(e, 'dahl_wilt')) sim.applyToughness(u, e, 'Fire', 20, 0, 1.0)
      }
      const a2 = (rt.dahlA2En as number) ?? 0
      if (a2 < 65) {
        rt.dahlA2En = Math.min(65, a2 + 13)
        sim.gainEnergy(u, 13)
      }
      return
    }

    if (action.kind === 'skill') {
      if (sim.spendSp(1)) {
        sim.gainEnergy(u, 30)
        rt.dahlZone = mult('the_dahlia', 'skill_a2', lv.skill) // 3 turns
        for (const a of sim.allies('ally')) {
          if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'dahl_zone', name: 'Lick... Enkindled Betrayal', mods: [{ stat: 'wbe', value: mult('the_dahlia', 'skill_a3', lv.skill) }], turns: Infinity })
        }
        const primary = manualTarget(sim, action, enemies[0])
        sim.hitBlast(u, primary, { type: 'skill', mult: mult('the_dahlia', 'skill', lv.skill), elem: 'Fire', toughDmg: 60, label: 'Lick: Enkindled Betrayal' }, { type: 'skill', mult: mult('the_dahlia', 'skill', lv.skill), elem: 'Fire', toughDmg: 30, label: 'Lick (adjacent)' })
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('the_dahlia', 'basic', lv.basic), elem: 'Fire', toughDmg: 30, label: 'Fiddle: Fissured Memory' })
  },

  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    sim.gainEnergy(u, mult('the_dahlia', 'talent_a4', levelsOf(ctx).talent))
    // A0 (Yet Another Funeral): allies' BE = 24% of Dahlia's BE + 50%, 1 turn
    const beStat = 0.24 * sim.effBe(u) + 0.5
    for (const a of sim.allies('ally')) {
      if (a.kind === 'char' && a !== u && !a.dead) {
        sim.addBuff(a, { id: 'dahl_a0', name: 'Yet Another Funeral', mods: [{ stat: 'be', value: beStat }], turns: 1 })
      }
    }
    // Dance Partner = highest-BE teammate (re-picked at battle start)
    let best: Unit | undefined
    let bestBe = -1
    for (const a of sim.allies('ally')) {
      if (a.kind !== 'char' || a === u || a.dead) continue
      const b = sim.effBe(a)
      if (b > bestBe) { bestBe = b; best = a }
    }
    if (best) {
      rt.dahlPartnerId = best.id
      sim.log(`${u.name} dances with ${best.name} (BE ${Math.round(bestBe * 100)}%)`)
      if (eid_the_dahlia(ctx) >= 6) sim.addBuff(best, { id: 'dahl_e6', name: 'And Yet, Always, Deathly Beautiful', mods: [{ stat: 'be', value: 1.5 }], turns: Infinity })
    }
    rt.dahlFuaTurn = -1
    rt.dahlConvSeq = -1
    rt.dahlFuaSeq = -1
    rt.dahlA2En = 0
    rt.dahlFuaCount = 0
    rt.dahlToughIds = new Set<string>()
    if (eid_the_dahlia(ctx) >= 2) {
      for (const e of sim.allies('enemy')) sim.addBuff(e, { id: 'dahl_a2', name: 'Fresh, Ethereal, and Beloved All-RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: Infinity, debuff: true })
    }
  },

  onTurnStart(sim, u, _ctx) {
    const rt = sim.rt(u)
    if ((rt.dahlZone as number) > 0) {
      rt.dahlZone = ((rt.dahlZone as number) ?? 0) - 1
      if ((rt.dahlZone as number) <= 0) {
        sim.log(`${u.name}: Zone ends`)
        for (const a of sim.allies('ally')) sim.removeBuff(a, 'dahl_zone')
      }
    }
  },

  onAfterAttack(sim, attacker, target, _dmgType, ctx, _dmg, atkToughRed) {
    if (target.side !== 'enemy' || target.dead || attacker.side !== 'ally') return
    const u = sim.allies('ally').find(a => a.kind === 'char' && a.kitId === 'the_dahlia' && !a.dead)
    if (!u) return
    const rt = sim.rt(u)
    const seq = sim.attackNo()

    // FUA's own hits: conversion was already applied per instance; don't chain.
    if (attacker === u && rt.dahlFuaSeq === seq) return

    const e2 = eid_the_dahlia(ctx)
    const isPartner = attacker === u || attacker.id === rt.dahlPartnerId

    // Talent: Dance Partner attacking a Weakness-Broken enemy converts this attack's toughness
    // reduction into Super Break. E1: holds for ALL allies, partner gets +40% extra.
    if (target.broken && (isPartner || e2 >= 1) && rt.dahlConvSeq !== seq) {
      rt.dahlConvSeq = seq
      const bonus = e2 >= 1 && attacker.id === rt.dahlPartnerId ? 0.4 : 0
      const sbTough = atkToughRed ?? 0
      if (sbTough > 0) sim.superBreak(attacker, target, sbTough, mult('the_dahlia', 'talent_a5', levelsOf(ctx).talent) + bonus)
      // E1: partner attacks also drain 25% of Max Toughness (min 10, max 300), once per enemy till death
      if (e2 >= 1 && attacker.id === rt.dahlPartnerId && target.maxToughness > 0) {
        const set = rt.dahlToughIds as Set<string>
        if (!set.has(target.id)) {
          set.add(target.id)
          sim.applyToughness(attacker, target, 'Fire', Math.max(10, Math.min(300, 0.25 * target.maxToughness)), 0)
        }
      }
    }

    // Talent Follow-Up ATK: fires when the partner attacks (once per turn); R4 +5 instances
    if (attacker.id !== rt.dahlPartnerId || rt.dahlFuaTurn === sim.battleTurn) return
    if (attacker.id === u.id) return
    const lv = levelsOf(ctx)
    rt.dahlFuaTurn = sim.battleTurn
    rt.dahlFuaSeq = seq
    const n = mult('the_dahlia', 'talent_a2', lv.talent) + (e2 >= 4 ? 5 : 0)
    sim.log(`${u.name}: Talent FUA (${n} hits) after ${attacker.name}`)
    for (let i = 0; i < n; i++) {
      const pool = sim.allies('enemy').filter(e => !e.dead)
      if (!pool.length) return
      const t = sim.rngPick(pool)
      const beforeSb = sim.attackToughRed
      sim.hit(u, t, { type: 'fua', mult: mult('the_dahlia', 'talent', lv.talent), elem: 'Fire', toughDmg: 15, label: 'Talent FUA' })
      const sbTough = sim.attackToughRed - beforeSb
      if (!t.dead && t.broken && sbTough > 0) sim.superBreak(u, t, sbTough, mult('the_dahlia', 'talent_a3', lv.talent))
    }
    rt.dahlFuaCount = (rt.dahlFuaCount as number) + 1
    if ((rt.dahlFuaCount as number) % 2 === 0) sim.gainSp(1) // A1: 1 SP per 2 FUA uses
    if (e2 >= 4) {
      for (const e of sim.allies('enemy')) sim.addBuff(e, { id: 'dahl_r4', name: 'Pity Its Heart Gnawed by Worms DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.12 }], turns: 2, debuff: true })
    }
    if (e2 >= 6) {
      // E6 20% advance: partner is the mid-own-turn attacker → lost per rule (own AV already 0);
      // Dahlia is waiting (FUA fires from partner's attack) → advance is real
      sim.advance(u, 0.2)
      const p = partnerOf(sim, u)
      if (p) sim.advance(p, 0.2)
      sim.log(`${u.name} E6: advance self 20%${p ? `, partner ${p.name} 20% (mid-turn → lost)` : ''}`)
    }
  },

  onKill(sim, _u, victim, ctx) {
    if (eid_the_dahlia(ctx) >= 1) {
      const rt = sim.rt(_u)
      const set = rt.dahlToughIds as Set<string>
      set.delete(victim.id)
    }
  },
}

// ===== mortenax_blade  (was mortenax_blade.ts) =====
// Mortenax Blade (5★ Nihility / Fire) — every hit scales off Max HP, so no ATK stats are used.
// Ult «Fornax Ex Corpore» deals NO DMG: it binds all enemies (Balefire Bind), pays 20% Max HP and
// deploys the Zone, flipping him into «Infinite Fury» (CRIT Rate/DMG, enhanced Basic, Skill
// unlocked, new Ult) with a fixed-SPD 70 countdown unit on the action order. When the countdown
// acts, the Zone is dispelled. Talent turns ally attacks on enemies into Charge; at cap the Skill
// fires once more as a Follow-Up ATK. A0 keeps 80 overflow Energy.
// E1 enemy All-Type RES down uses target-side resAll;
// E2's "ally Ult counts as FUA" cannot re-type another unit's hits, only the +75% ally FUA boost is
// real. A1 (after being attacked) gates on `sim.attackNo()`, which every enemy attack now mints —
// the built-in attack via `TurnManager.mintEnemyAttack`, declarative abilities via the pipeline — so
// one multi-hit enemy action pays A1 once. E1/E2 are known deviations (TODO §11).

const MB = 'mortenax_blade'
const OF_CAP = 80 // A0 Bone, Hardened ad Nauseam: overflow Energy cap
const OF_FLOOR = 0.75 // A0: Energy floor at battle start / on Zone dispel
const TIMER_ID = 'mbtimer_'

function me(sim: SimApi, side: 'ally' | 'enemy' | 'neutral'): Unit | undefined {
  return sim.allies(side).find(u => u.kind === 'char' && u.kitId === MB && !u.dead)
}

function inZone(sim: SimApi, m: Unit): boolean {
  return sim.rt(m).mbZone === true
}

/** Balefire Bind: DEF reduction (ult_a7) + DMG taken increase (ult_a4), ult_a8 turns */
function bind(sim: SimApi, m: Unit, target: Unit, ctx: KitRuntime): void {
  if (!target || target.dead || target.side === m.side) return
  const lv = levelsOf(ctx)
  sim.addBuff(target, {
    id: 'mb_bind', name: 'Balefire Bind', sourceId: m.id,
    mods: [
      { stat: 'defRed', value: mult(MB, 'ult_a7', lv.ult) },
      { stat: 'vulnAll', value: mult(MB, 'ult_a4', lv.ult) },
    ],
    turns: mult(MB, 'ult_a8', lv.ult),
  })
}

/** Max-HP self cost, never dropping below 1 HP. Returns the HP actually spent. */
function selfHpCost(sim: SimApi, m: Unit, pct: number): number {
  if (m.hp <= 1) return 0
  const cost = Math.min(m.hp - 1, Math.round(m.maxHp * pct))
  if (cost <= 0) return 0
  sim.fireAllyHpLoss(m, cost)
  return cost
}

/** E6: HP consumption grants 1 Charge, rearming after any turn boundary. */
function hpCostCharge(sim: SimApi, m: Unit, ctx: KitRuntime, spent: number): void {
  if (spent <= 0) return
  const rt = sim.rt(m)
  if (((ctx.eidolon as number) ?? 0) < 6 || rt.mbE6 === true) return
  rt.mbE6 = true
  addCharge(sim, m, ctx, 1)
}

/** Talent: 1 Charge per ally attack on an enemy; at cap -> extra Skill as FUA */
function addCharge(sim: SimApi, m: Unit, ctx: KitRuntime, n: number): void {
  const rt = sim.rt(m)
  if (!rt.mbZone || m.hp <= 1) return
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const cap = eid >= 2 ? 7 : mult(MB, 'talent', lv.talent)
  rt.mbChg = Math.min(cap, ((rt.mbChg as number) ?? 0) + n)
  sim.log(`${m.name} gains ${n} Charge (${(rt.mbChg as number)}/${cap})`)
  if ((rt.mbChg as number) < cap) return
  rt.mbChg = 0
  sim.log(`${m.name} consumes ${cap} Charge → extra Skill (Follow-Up ATK)`)
  rainOfBlades(sim, m, ctx, true)
}

/** Skill A Rain of Blades Seals Fate: AoE main + 4 random instances, 10% Max HP cost, 0 SP */
function rainOfBlades(sim: SimApi, m: Unit, ctx: KitRuntime, fua: boolean): void {
  const rt = sim.rt(m)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const type = fua ? 'fua' : 'skill'
  const label = fua ? 'A Rain of Blades Seals Fate (extra Skill)' : 'A Rain of Blades Seals Fate'
  const cost = selfHpCost(sim, m, mult(MB, fua ? 'skill_en' : 'skill_a4', lv.skill))
  if (fua) rt.mbFua = true
  sim.hitAoe(m, {
    type, elem: 'Fire', scaleStat: 'hp', mult: mult(MB, 'skill', lv.skill),
    toughDmg: 30, noSeq: fua, label: `${label} (main)`,
  })
  const inst = Math.round(mult(MB, 'skill_a2', lv.skill))
  if (inst > 0) {
    sim.hitRandom(m, inst, {
      type, elem: 'Fire', scaleStat: 'hp', mult: mult(MB, 'skill_a3', lv.skill),
      noSeq: fua, label: `${label} (instance)`,
    })
  }
  if (fua) {
    rt.mbFua = false
    sim.gainEnergy(m, mult(MB, 'talent_a2', lv.talent))
    // E1: the extra Skill delays the Infinite Fury countdown by 15%
    if (eid >= 1) {
      const t = sim.find(`${TIMER_ID}${m.id}`)
      if (t) {
        sim.delay(t, 0.15)
        sim.log('E1 Ere My Death: countdown delayed 15%')
      }
    }
  }
  hpCostCharge(sim, m, ctx, cost)
}

function zoneOn(sim: SimApi, m: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(m)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  rt.mbZone = true
  rt.mbE6 = false
  // A0: the overflow pool persists across Zones (only an Ult clears it)
  // Infinite Fury
  sim.addBuff(m, {
    id: 'mb_fury', name: 'Infinite Fury', sourceId: m.id,
    mods: [
      { stat: 'critRate', value: mult(MB, 'ult_a2', lv.ult) },
      { stat: 'critDmg', value: mult(MB, 'ult_a3', lv.ult) },
    ],
    turns: 99,
  })
  // A1 Soul, Tempered ad Mortem: "increases the chance of being attacked" = aggro-buff on the
  // weighted enemy targeting (`pickTargetByAggro`, simulator.ts:1380), pattern danheng.ts:96
  sim.addBuff(m, {
    id: 'mb_a1', name: 'Soul, Tempered ad Mortem', sourceId: m.id,
    mods: [{ stat: 'aggro', value: 150 }, { stat: 'mitigation', value: 0.5 }, { stat: 'inHeal', value: 0.5 }],
    turns: 99,
  })
  // A2 Heart, Refined ad Infinitum (E4 adds another +50% to allies) + E2 ally FUA DMG
  const otherNih = sim.allies(m.side).some(a => a.kind === 'char' && a.id !== m.id && a.base.path === 'Nihility')
  const allyPct = eid >= 4 ? 1.0 : 0.5
  for (const a of sim.allies(m.side)) {
    if (a.kind !== 'char' || a.dead) continue
    const mods: Array<{ stat: StatKey; value: number }> = [{ stat: 'dmgAll', value: allyPct }]
    if (otherNih) mods.push({ stat: 'boost:ult', value: 0.75 })
    if (eid >= 2 && a.id !== m.id) mods.push({ stat: 'boost:fua', value: 0.75 })
    sim.addBuff(a, { id: a.id === m.id ? 'mb_a2self' : 'mb_a2', name: 'Heart, Refined ad Infinitum', sourceId: m.id, mods, turns: 99 })
  }
  if (!otherNih) {
    sim.addBuff(m, { id: 'mb_a2b', name: 'Heart, Refined ad Infinitum (no ally Nihility)', sourceId: m.id, mods: [{ stat: 'dmgAll', value: 0.75 }], turns: 99 })
  }
  // E1 Ere My Death: enemy All-Type RES down
  if (eid >= 1) {
    for (const e of sim.livingEnemiesOf(m)) {
      sim.addBuff(e, { id: 'mb_e1', name: 'Ere My Death', sourceId: m.id, mods: [{ stat: 'resAll', value: -0.2 }], turns: 99, debuff: true })
    }
  }
  // countdown unit: fixed SPD (ult_a5), dispels the Zone when its turn starts
  sim.scheduleCountdown(m, { id: `${TIMER_ID}${m.id}`, name: 'Infinite Fury Countdown', side: m.side, elem: 'Fire', spd: mult(MB, 'ult_a5', lv.ult), weaknesses: ['Fire'] })
  sim.log(`${m.name} deploys the Zone and enters Infinite Fury`)
}

function zoneOff(sim: SimApi, m: Unit, why: string): void {
  const rt = sim.rt(m)
  if (!rt.mbZone) return
  rt.mbZone = false
  for (const id of ['mb_fury', 'mb_a1', 'mb_a2', 'mb_a2self', 'mb_a2b']) sim.removeBuff(m, id)
  for (const a of sim.allies(m.side)) {
    sim.removeBuff(a, 'mb_a2')
    sim.removeBuff(a, 'mb_e2')
  }
  for (const t of sim.units()) if (t.side !== m.side) sim.removeBuff(t, 'mb_e1')
  const timer = sim.find(`${TIMER_ID}${m.id}`)
  if (timer) sim.unregisterUnit(timer.id)
  // A0: floor Energy back to 75% when the Zone is dispelled
  const floor = Math.floor(m.maxEnergy * OF_FLOOR)
  if (m.energy < floor) {
    m.energy = floor
    sim.log(`A0 Bone, Hardened ad Nauseam: Energy regenerated to 75%`)
  }
  rt.mbEnergy = m.energy
  sim.log(`${m.name} exits Infinite Fury (${why})`)
}

export const mortenaxBladeKit: KitDef = {
  id: MB,
  name: 'Mortenax Blade',
  elem: 'Fire',
  energyMax: 160, // sp_need
  base: { ...PROG[MB].base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Nihility' },

  // 150707 "Blade's Reach Spares None" (Technique): on entry, Taunt all enemies 1t and
  // reduce DMG taken by this unit 90% for 2t. The overworld attack carries no battle
  // coefficient in raw data, so this applies the two battle-start states only.
  technique: {
    name: "Blade's Reach Spares None",
    kind: 'attack',
    apply(sim, u) {
      for (const e of sim.livingEnemiesOf(u)) sim.addTargetOverride(e, u, 1)
      sim.addBuff(u, { id: 'mb_tech', name: "Blade's Reach Spares None", mods: [{ stat: 'mitigation', value: 0.9 }], turns: 2 })
      sim.log(`${u.name} Technique: Blade's Reach Spares None (Taunt ×1t, DMG taken −90% ×2t)`)
    },
  },

  onStart(sim, u) {
    // A0: battle start Energy floor
    const floor = Math.floor(u.maxEnergy * OF_FLOOR)
    if (u.energy < floor) {
      u.energy = floor
      sim.log(`A0 Bone, Hardened ad Nauseam: Energy regenerated to 75%`)
    }
    sim.rt(u).mbEnergy = u.energy
  },

  onCcEnd(sim, u) {
    // countdown unit acted → Zone dispelled
    zoneOff(sim, u, 'countdown ended')
  },

  onAllyTurnStart(sim, u) {
    sim.rt(u).mbE6 = false // E6 re-arms on any turn boundary
  },

  onEnemyTurnStart(sim, u) {
    sim.rt(u).mbE6 = false
  },

  onUnitDeath(sim, u) {
    const timer = sim.find(`${TIMER_ID}${u.id}`)
    if (timer) sim.unregisterUnit(timer.id)
  },

  onAllyEnergy(sim, unit, base) {
    if (unit.kitId !== MB || unit.dead) return
    const rt = sim.rt(unit)
    // A0: Energy past the cap accumulates as overflow (max OF_CAP)
    const prev = (rt.mbEnergy as number) ?? unit.energy
    const delta = Math.max(0, unit.energy - prev)
    rt.mbEnergy = unit.energy
    const over = Math.min(OF_CAP - ((rt.mbOf as number) ?? 0), Math.max(0, base - delta))
    if (over > 0) {
      rt.mbOf = ((rt.mbOf as number) ?? 0) + over
      sim.log(`${unit.name} stores ${Math.round(over)} overflow Energy (${rt.mbOf}/${OF_CAP})`)
    }
    // A0: at full Energy, all debuffs on this unit are dispelled
    if (unit.energy >= unit.maxEnergy) {
      for (const b of unit.buffs.filter(isDebuff)) sim.removeBuff(unit, b.id)
    }
  },

  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (!target || target.side === attacker.side || target.dead) return
    const m = me(sim, attacker.side)
    if (!m) return
    const rt = sim.rt(m)
    if (!rt.mbZone || rt.mbFua === true) return
    // once per *activation*: `attackNo()` is keyed attacker|type|avElapsed, so a chain that retypes
    // mid-activation (skill→FUA, e.g. a Shifu Additional DMG) minted a second sequence and paid
    // double. `attackAct()` = attacker|avElapsed is stable across the retype.
    if (rt.mbAct === sim.attackAct()) return
    rt.mbAct = sim.attackAct()
    bind(sim, m, target, ctx)
    addCharge(sim, m, ctx, 1)
  },

  onAllyHit(sim, attacker, target, dmg, ctx) {
    if (target.kitId !== MB || target.dead) return
    const rt = sim.rt(target)
    if (!rt.mbZone) return
    // lethal blow: no knockdown — dispel the Zone and restore HP
    if (target.hp <= 0) {
      const lv = levelsOf(ctx)
      sim.revive(target, Math.floor(target.maxHp * mult(MB, 'ult_a6', lv.ult)), attacker)
      zoneOff(sim, target, 'lethal blow')
      sim.log(`${target.name} survives the killing blow and restores HP to ${Math.round((target.hp / target.maxHp) * 100)}% Max HP`)
      return
    }
    // A1: after being attacked — bind the attacker and gain 1 Charge
    if (attacker.side !== target.side && rt.lastSeq !== sim.attackNo()) {
      rt.lastSeq = sim.attackNo()
      bind(sim, target, attacker, ctx)
      addCharge(sim, target, ctx, 1)
    }
    // E6: taking DMG grants 1 Charge, once per turn boundary
    if (dmg > 0 && ((ctx.eidolon as number) ?? 0) >= 6 && rt.mbE6 !== true) {
      rt.mbE6 = true
      addCharge(sim, target, ctx, 1)
    }
  },

  holdUlt(sim, u) {
    // A0 banks overflow Energy: outside the Zone the Ult is withheld until the 80 pool is full,
    // which is what pays for Tenax Per Ignem right after Fornax. Inside the Zone the Ult fires
    // immediately (that is Tenax Per Ignem).
    const rt = sim.rt(u)
    if (rt.mbZone === true) return false
    return ((rt.mbOf as number) ?? 0) < OF_CAP
  },

  decide(sim, u, ctx) {
    // Skill is locked outside Infinite Fury and at 1 HP
    if (inZone(sim, u) && u.hp > 1) return { kind: (ctx.skillPriority as number) < 0 ? 'basic' : 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const enemies = sim.livingEnemiesOf(u)
    const zone = rt.mbZone === true

    if (action.kind === 'ult') {
      u.energy = 0
      rt.mbEnergy = 0
      if (zone) {
        // Tenax Per Ignem: in-Zone damage Ult
        const mult2 = mult(MB, 'ult_en', lv.ult) * (eid >= 6 ? 1.5 : 1)
        sim.hitAoe(u, { type: 'ult', elem: 'Fire', scaleStat: 'hp', mult: mult2, toughDmg: 30, label: 'Tenax Per Ignem' })
        sim.log(`${u.name} Ult: Tenax Per Ignem`)
        return
      }
      // Fornax Ex Corpore: bind all, pay HP, deploy the Zone
      for (const e of enemies) bind(sim, u, e, ctx)
      const cost = selfHpCost(sim, u, mult(MB, 'ult', lv.ult))
      hpCostCharge(sim, u, ctx, cost)
      zoneOn(sim, u, ctx)
      sim.log(`${u.name} Ult: Fornax Ex Corpore`)
      // A0: clear overflow and regenerate the corresponding Energy
      const of = (rt.mbOf as number) ?? 0
      rt.mbOf = 0
      if (of > 0) {
        const before = u.energy
        u.energy = Math.min(u.maxEnergy, u.energy + of)
        rt.mbEnergy = u.energy
        sim.log(`A0 Bone, Hardened ad Nauseam: ${of} overflow Energy cleared, +${u.energy - before} Energy`)
        if (u.energy >= u.maxEnergy) for (const b of u.buffs.filter(isDebuff)) sim.removeBuff(u, b.id)
      }
      return
    }

    if (action.kind === 'skill') {
      rainOfBlades(sim, u, ctx, false)
      sim.gainEnergy(u, 30)
      sim.log(`${u.name} uses A Rain of Blades Seals Fate (0 SP)`)
      return
    }

    // Basic: outside the Zone 1 hit, inside it the enhanced 5-hit blade
    if (zone) {
      sim.hit(u, enemies[0], {
        type: 'basic', elem: 'Fire', scaleStat: 'hp', mult: mult(MB, 'basic_en', lv.basic),
        toughDmg: 6, split: [0.2, 0.2, 0.2, 0.2, 0.2], label: 'A Tempered Blade Severs Souls',
      })
    } else {
      sim.hit(u, enemies[0], {
        type: 'basic', elem: 'Fire', scaleStat: 'hp', mult: mult(MB, 'basic', lv.basic),
        toughDmg: 10, label: 'A Broken Blade Still Slays',
      })
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
  },
}

