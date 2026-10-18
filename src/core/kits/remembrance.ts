// Kits of the Remembrance path, merged from the former per-character modules (7 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { levelsOf, manualTarget, decideByPattern, type KitDef, type KitRuntime, type SimApi, type Action } from '../kit'
import type { Unit } from '../entities/Unit'
import type { Buff } from '../effects/Buff'
import { mult, PROG } from '../progression'
import { buffSum, eff } from '../combat/StatResolver'

// ===== aglaea  (was aglaea.ts) =====
function lowestHp(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}

function garmentmakerOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`gm_${u.id}`)
}

function stitchedTarget(sim: SimApi, u: Unit): Unit | undefined {
  return sim.livingEnemiesOf(u).find(e => sim.hasBuff(e, 'gm_stitch'))
}

/** Re-derive Garmentmaker's combat stats from Aglaea's current stats (Summon.md:
 *  summons "use the current stats of their characters"). Talent 140204: GM SPD = #4
 *  (0.35 at every level) of Aglaea SPD, GM Max HP = #5 (44-66% over L1-L10) of Aglaea
 *  Max HP + #6 flat. */
function refreshGm(sim: SimApi, u: Unit, gm: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const newSpd = Math.max(1, Math.round(eu.spd * mult('aglaea', 'talent_a2', lv.talent)))
  // keep HP ratio BEFORE eff() recomputes maxHp from base.hp (it clobbers a
  // manually-set maxHp). GM Max HP = #5 (0.44-0.66) of Aglaea Max HP + #6 flat.
  const ratio = gm.maxHp > 0 ? gm.hp / gm.maxHp : 1
  const ghp = Math.max(1, Math.round(eu.hp * mult('aglaea', 'talent_a3', lv.talent) + mult('aglaea', 'talent_a4', lv.talent)))
  gm.base.hp = ghp
  gm.maxHp = ghp
  gm.hp = Math.max(1, Math.round(ghp * ratio))
  if (gm.base.spd !== newSpd) sim.setSpeedDynamic(gm, newSpd)
  gm.base.atk = eu.atk
  // eu is buff-INCLUSIVE, but GM carries its own copies of the same buffs (Brocade,
  // Hero CRIT DMG, Sunday crit rate). Writing eu into base and then letting eff(gm)
  // add them again double-counts the overlap — it reached critDmg 548%. Subtract the
  // overlap; gear main-stat critDmg still arrives via the mirror since GM doesn't hold it.
  gm.base.critRate = eu.critRate - buffSum(gm.buffs, 'critRate')
  gm.base.critDmg = eu.critDmg - buffSum(gm.buffs, 'critDmg')
  gm.base.level = u.base.level
}

const gmSpdMax = (eid: number): number => (eid >= 4 ? 7 : 6)

/** Ability Energy grants live in `sp_base`, NOT in `param_list` (which only carries the
 *  ability's own scaling). Every Aglaea entry is level-independent: basic 20, skill 20,
 *  ult 5, Joint ATK 20. Talent carries `sp_base: 10` but talents are never "cast" —
 *  unmapped, unused. Ult/Joint-ATK SP is 0: 140208's desc ends with "Slash by a
 *  Thousandfold Kiss" cannot recover Skill Points. */
const EN_BASIC = 20
const EN_SKILL = 20
const EN_JOINT = 20 // 140208 "Slash by a Thousandfold Kiss" (enhanced Basic)

/** Memosprite Talent "A Body Brewed by Tears": stacking SPD boost on Garmentmaker,
 *  each stack also feeds Aglaea's Supreme Stance SPD% (Ult #1). */
function setGmSpdStacks(sim: SimApi, gm: Unit, owner: Unit, ctx: KitRuntime, stacks: number): void {
  const lv = levelsOf(ctx)
  sim.rt(owner).supStacks = stacks
  sim.removeBuff(gm, 'gm_spd')
  if (stacks > 0)
    sim.addBuff(gm, {
      id: 'gm_spd', name: 'A Body Brewed by Tears',
      mods: [{ stat: 'spdFlat', value: stacks * mult('aglaea', 'mem_talent', lv.talent) }], turns: Infinity,
    })
  refreshSupSpd(sim, owner, ctx)
  // Myopic's Doom scales off GM SPD, which grows with stacks — keep it in sync
  if (sim.rt(owner).supreme === true) refreshMyopic(sim, owner, ctx)
}

function refreshSupSpd(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const stacks = (sim.rt(u).supStacks as number) ?? 0
  sim.removeBuff(u, 'aglaea_sup_spd')
  // Supreme Stance SPD% is Supreme-only — SPD stacks outside Supreme (skill re-summon)
  // still apply to Garmentmaker, but must not leak the stance buff onto Aglaea.
  if (sim.rt(u).supreme !== true || stacks <= 0) return
  if (stacks > 0)
    sim.addBuff(u, {
      id: 'aglaea_sup_spd', name: 'Dance, Destined Weaveress',
      mods: [{ stat: 'spdPct', value: stacks * mult('aglaea', 'ult', lv.ult) }], turns: Infinity,
    })
}

/** Talent "Rosy-Fingered": while Garmentmaker is on the field, Aglaea's attacks
 *  inflict "Seam Stitch" on the target. E1: stitched target takes +15% DMG. */
function stitch(sim: SimApi, u: Unit, t: Unit, ctx: KitRuntime): void {
  const eid = (ctx.eidolon as number) ?? 0
  for (const e of sim.livingEnemiesOf(u)) if (e.id !== t.id) sim.removeBuff(e, 'gm_stitch')
  sim.addBuff(t, {
    id: 'gm_stitch', name: 'Seam Stitch DMG Taken+',
    mods: eid >= 1 ? [{ stat: 'vulnAll', value: 0.15 }] : [], turns: Infinity,
  })
}

/** Trace "The Myopic's Doom": in Supreme Stance, Aglaea & Garmentmaker ATK up by
 *  720% of Aglaea SPD + 360% of Garmentmaker SPD. */
function refreshMyopic(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const gm = garmentmakerOf(sim, u)
  const gmSpd = gm ? eff(gm).spd : 0
  const atk = 7.2 * eff(u).spd + 3.6 * gmSpd
  sim.removeBuff(u, 'aglaea_myopic')
  if (gm) sim.removeBuff(gm, 'aglaea_myopic')
  if (atk <= 0) return
  sim.addBuff(u, { id: 'aglaea_myopic', name: 'The Myopic\'s Doom', mods: [{ stat: 'atkFlat', value: atk }], turns: Infinity })
  if (gm) sim.addBuff(gm, { id: 'aglaea_myopic', name: 'The Myopic\'s Doom', mods: [{ stat: 'atkFlat', value: atk }], turns: Infinity })
}

/** E2 "Sail on the Raft of Eyelids": A/G DMG ignores 14% DEF on the target, stacking 3×.
 *  Stacks reset when any unit other than A/G acts (onAllyActionEnd). */
function e2DefIgnore(sim: SimApi, target: Unit): void {
  sim.addBuff(target, {
    id: 'aglaea_e2def', name: 'Sail on the Raft of Eyelids',
    mods: [{ stat: 'defIgnore', value: 0.14 }], turns: Infinity, maxStacks: 3,
  })
}

/** Summon or reset the Supreme Stance countdown (Ult #4: SPD 100). On its turn the
 *  countdown fires → Garmentmaker self-destructs, Supreme ends. */
function summonCountdown(sim: SimApi, u: Unit): void {
  const cid = `gmcd_${u.id}`
  const cd = sim.find(cid)
  if (cd) { sim.log(`${u.name} Ultimate resets the Supreme countdown`); cd.av = sim.baseAv(cd); return }
  sim.scheduleCountdown(u, { id: cid, name: 'Supreme Countdown', side: 'ally', elem: 'Lightning', spd: 100, kitId: u.kitId })
  sim.log(`${u.name} Supreme Stance: countdown (SPD 100) begins`)
}

function summonGm(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const gm = garmentmakerOf(sim, u)
  if (gm) return gm
  const gmU: Unit = {
    id: `gm_${u.id}`, name: 'Garmentmaker', side: 'ally', kind: 'summon', elem: 'Lightning',
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: 1 },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId, aggro: 125,
  }
  const grt = sim.rt(gmU)
  grt.ownerId = u.id
  refreshGm(sim, u, gmU, ctx)
  // Memosprite Talent "The Speeding Summer": summoned → GM action advances 100%
  sim.registerUnit(gmU)
  sim.fireMemospriteSummon(u)
  // Trace "Last Thread of Fate": SPD stacks retained on disappear reapply on re-summon
  const retained = (sim.rt(u).supStacks as number) ?? 0
  if (retained > 0) {
    setGmSpdStacks(sim, gmU, u, ctx, retained)
    sim.log(`${u.name} Last Thread of Fate: ${retained} GM SPD stack re-applied`)
  }
  sim.advance(gmU, 1.0)
  sim.log(`${u.name} summons Garmentmaker (SPD ${gmU.base.spd}, HP ${gmU.maxHp})`)
  return gmU
}

/** Joint ATK "Slash by a Thousandfold Kiss" (enhanced Supreme Basic, Blast):
 *  Aglaea + Garmentmaker hit the target with their OWN stats. Cannot recover SP. */
function jointAtk(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u)
  let e6 = 0
  if (eid >= 6 && rt.supreme === true) {
    const spd = eff(u).spd
    e6 = spd > 320 ? 0.6 : spd > 240 ? 0.3 : spd > 160 ? 0.1 : 0
  }
  const m = 1 + e6
  const gm = garmentmakerOf(sim, u)
  if (gm) stitch(sim, u, target, ctx) // designate the marked enemy BEFORE hits
  // 140208.notes: EACH actor reduces 10 Toughness on the main target and 5 on the
  // adjacent ones. toughDmg is applied once per attack by hitDigit, so the two
  // hitBlast calls sum to 20 main / 10 adjacent — not 40/20.
  sim.hitBlast(u, target,
    { type: 'basic', elem: 'Lightning', mult: mult('aglaea', 'basic_en', lv.basic) * m, toughDmg: 10, label: 'Joint ATK (main)', split: [0.25, 0.25, 0.25, 0.25] },
    { type: 'basic', elem: 'Lightning', mult: mult('aglaea', 'basic_en_a2', lv.basic) * m, toughDmg: 5, label: 'Joint ATK (adj)' })
  if (gm) {
    refreshGm(sim, u, gm, ctx)
    sim.hitBlast(gm, target,
      { type: 'basic', elem: 'Lightning', mult: mult('aglaea', 'basic_en_a3', lv.basic) * m, toughDmg: 10, label: 'Joint ATK (main)' },
      { type: 'basic', elem: 'Lightning', mult: mult('aglaea', 'basic_en_a4', lv.basic) * m, toughDmg: 5, label: 'Joint ATK (adj)' })
    // Joint ATK is Aglaea AND Garmentmaker attacking together, so GM's own "attacked an
    // enemy afflicted with Seam Stitch" trigger fires too. The target was stitched at the
    // top of jointAtk, so the gate holds by construction. Separate from the Thorned Snare
    // path in onSummonTurn (that one is a `fua` hit on GM's own turn) ⇒ no double count.
    const stacks = Math.min(gmSpdMax(eid), ((rt.supStacks as number) ?? 0) + 1)
    setGmSpdStacks(sim, gm, u, ctx, stacks)
    sim.log(`-- Joint ATK: ${gm.name} SPD stacks ${stacks}/${gmSpdMax(eid)}`)
  }
  if (eid >= 2) e2DefIgnore(sim, target)
}

export const aglaeaKit: KitDef = {
  id: 'aglaea',
  name: 'Aglaea',
  elem: 'Lightning',
  energyMax: 350,
  base: { ...PROG.aglaea.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  // 140207 "Meteoric Sunder": summon Garmentmaker, +30 Energy, 100% ATK Lightning to all enemies,
  // then Seam Stitch a random enemy. combat-starting (attack) Technique.
  technique: {
    name: 'Meteoric Sunder',
    kind: 'attack',
    apply(sim, u, ctx) {
      sim.gainEnergyFlat(u, 30)
      summonGm(sim, u, ctx)
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Lightning', mult: 1.0, label: 'Meteoric Sunder' })
      const alive = sim.livingEnemiesOf(u)
      if (alive.length) stitch(sim, u, alive[Math.floor(sim.rng() * alive.length)], ctx)
    },
  },
  onStart(sim, u, _ctx) {
    u.aggro = 100
    // Trace "The Speeding Sol": battle start, Energy < 50% → regen to 50%
    if (u.energy < u.maxEnergy * 0.5) u.energy = u.maxEnergy * 0.5
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    const rt = sim.rt(u)
    if (rt.supreme === true) return { kind: 'basic' }
    // Skill is the only SP sink; its 140202 branch is identical whether or not GM is
    // present (summon vs restore-HP), so one SP>=1 gate covers both.
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const eid = (ctx.eidolon as number) ?? 0

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      // the ult's own Energy grant is the framework's job — castUlt detects the
      // cost deduction here and adds sp_base (5) back at simulator.ts:1423. Setting a value
      // here would double-count (measured 5+5=10 against the reference sheet's 5).
      u.energy = 0
      const gm = summonGm(sim, u, ctx)
      if (gm) sim.hpChange(gm, gm.maxHp - gm.hp, 'heal') // already on field → restore HP to max
      rt.supreme = true
      refreshSupSpd(sim, u, ctx)
      refreshMyopic(sim, u, ctx)
      if (eid >= 6) {
        sim.addBuff(u, { id: 'aglaea_e6', name: 'Fluctuate in the Tapestry of Fates', mods: [{ stat: 'resPen:Lightning', value: 0.2 }], turns: Infinity })
        if (gm) sim.addBuff(gm, { id: 'aglaea_e6', name: 'Fluctuate in the Tapestry of Fates', mods: [{ stat: 'resPen:Lightning', value: 0.2 }], turns: Infinity })
      }
      summonCountdown(sim, u)
      sim.log(`${u.name} Ultimate: Supreme Stance (Joint ATK, countdown SPD 100)`)
      // "immediately takes action" → a Joint ATK right now
      sim.grantExtraTurn(u)
      return
    }

    if (rt.supreme === true) {
      const t = manualTarget(sim, action, lowestHp(sim, u)!)
      jointAtk(sim, u, t, ctx)
      sim.gainEnergy(u, EN_JOINT)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, EN_SKILL)
      const absent = !garmentmakerOf(sim, u)
      const gm = summonGm(sim, u, ctx)
      if (gm) {
        const heal = gm.maxHp * mult('aglaea', 'skill', lv.skill)
        sim.heal(gm, heal)
        sim.log(`${u.name} Skill: Garmentmaker regains ${heal.toFixed(0)} HP`)
        // "If absent, summons GM and makes this unit immediately take action"
        if (absent) { sim.grantExtraTurn(u); sim.log(`${u.name} Skill: GM summoned — immediate action`) }
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, EN_BASIC)
    const t = lowestHp(sim, u)!
    if (garmentmakerOf(sim, u)) stitch(sim, u, t, ctx)
    sim.hit(u, t, { type: 'basic', elem: 'Lightning', mult: mult('aglaea', 'basic', lv.basic), toughDmg: 10, label: 'Thorned Nectar', split: [0.2, 0.2, 0.6] })
    if (eid >= 2) e2DefIgnore(sim, t)
  },

  // Garmentmaker's own turn → auto "Thorned Snare" (Blast), prioritizes Seam Stitch.
  onSummonTurn(sim, gm, owner, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    refreshGm(sim, owner, gm, ctx)
    const target = stitchedTarget(sim, owner) ?? lowestHp(sim, owner)
    if (!target) return
    // Memosprite Skill "Thorned Snare": #1 of GM ATK to primary, #2 to adjacent.
    // toughDmg from `show_stance_list` [30, 0, 15] — the Blast's hidden toughness data.
    // 1140201.notes: primary 5 hits 30/30/10/10/20, adjacent 3 hits 25/25/50.
    sim.hitBlast(gm, target,
      { type: 'fua', elem: 'Lightning', mult: mult('aglaea', 'mem_skill', lv.skill), toughDmg: 30, memoSkill: true, label: 'Thorned Snare', split: [0.3, 0.3, 0.1, 0.1, 0.2] },
      { type: 'fua', elem: 'Lightning', mult: mult('aglaea', 'mem_skill_a2', lv.skill), toughDmg: 15, memoSkill: true, label: 'Thorned Snare (adj)', split: [0.25, 0.25, 0.5] })
    if (sim.hasBuff(target, 'gm_stitch')) {
      const stacks = Math.min(gmSpdMax(eid), ((sim.rt(owner).supStacks as number) ?? 0) + 1)
      setGmSpdStacks(sim, gm, owner, ctx, stacks)
      sim.log(`-- ${gm.name} acts (Thorned Snare); SPD stacks ${stacks}/${gmSpdMax(eid)}`)
    } else {
      sim.log(`-- ${gm.name} acts (Thorned Snare)`)
    }
    if (eid >= 2) e2DefIgnore(sim, target)
  },

  // Supreme Stance countdown expired → Garmentmaker self-destructs, Supreme ends, +20 Energy.
  onCcEnd(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const gm = garmentmakerOf(sim, u)
    const gmSpd = gm ? eff(gm).spd : 0
    if (gm) {
      // Trace "Last Thread of Fate" (E2): up to 1 SPD-boost stack retained on disappear.
      // E0/E1 have no trace, so the stack count drops to 0.
      const cur = (rt.supStacks as number) ?? 0
      rt.supStacks = eid >= 2 ? Math.min(cur, 1) : 0
      const retained = (rt.supStacks as number) ?? 0
      if (retained > 0) sim.log(`${u.name} Last Thread of Fate: retained ${retained} GM SPD stack`)
      sim.fireMemospriteDisappear(u)
      sim.unregisterUnit(gm.id)
    }
    rt.supreme = false
    sim.removeBuff(u, 'aglaea_sup_spd')
    sim.removeBuff(u, 'aglaea_myopic')
    sim.removeBuff(u, 'aglaea_e6')
    // Memosprite Talent "Bloom of Drying Grass": GM disappears → +20 Energy
    sim.gainEnergy(u, 20)
    sim.log(`${u.name} Supreme Stance ends; Garmentmaker vanished (SPD was ${gmSpd.toFixed(0)})`)
    if (eid < 6) return
  },

  // Rosy-Fingered Seam Stitch + E1/E4/E2 riders, firing for ALL ally attacks (guard inside).
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (dmgType === 'add') return
    const u = sim.allies('ally').find(a => a.kitId === 'aglaea' && !a.dead)
    if (!u) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const gm = garmentmakerOf(sim, u)
    const isU = attacker === u
    const isGm = attacker === gm
    if (!isU && !isGm) return
    if (target.side !== 'enemy' || target.dead) return

    // Talent: attacking the Seam-Stitched enemy → Lightning Additional DMG
    if (sim.hasBuff(target, 'gm_stitch'))
      sim.hit(u, target, { type: 'add', noSeq: true, elem: 'Lightning', mult: mult('aglaea', 'talent', lv.talent), label: 'Seam Stitch' })

    // E1: attacking the stitched target → +20 Energy
    if (eid >= 1 && sim.hasBuff(target, 'gm_stitch')) { sim.gainEnergy(u, 20); sim.log('Aglaea E1: +20 Energy') }

    // E4: after Aglaea attacks, Garmentmaker also gains a SPD-boost stack
    if (isU && eid >= 4 && gm) {
      const stacks = Math.min(gmSpdMax(eid), ((rt.supStacks as number) ?? 0) + 1)
      setGmSpdStacks(sim, gm, u, ctx, stacks)
    }
  },

  // E2 140202: the DEF-ignore stacks last "until any unit, other than Aglaea or Garmentmaker,
  // actively uses an ability" ⇒ reset on the ACTION-END choke point, not turn start: onAllyTurnStart
  // misses enemy / summon / timer / Aha actions. Aglaea herself is already excluded by
  // fireAllyActionEnd (listener !== actor); Garmentmaker is a summon, so exclude it by id.
  onAllyActionEnd(sim, actor, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'aglaea' && !a.dead)
    if (!u) return
    if (((ctx.eidolon as number) ?? 0) < 2) return
    const gm = garmentmakerOf(sim, u)
    if (actor.id === u.id || (gm && actor.id === gm.id)) return
    for (const e of sim.livingEnemiesOf(u))
      if (e.buffs.some(b => b.id === 'aglaea_e2def'))
        sim.removeBuff(e, 'aglaea_e2def')
  },
}


// ===== hyacine  (was hyacine.ts) =====
function icaOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`ica_${u.id}`)
}

function isIca(sim: SimApi, u: Unit, id: string): boolean {
  return u.id === `ica_${id}`
}

function lowestHpAlly(sim: SimApi, u: Unit): Unit | undefined {
  const allies = sim.allies('ally').filter(a => !a.dead && a.kind !== 'summon' && !isIca(sim, a, u.id))
  const hurt = allies.filter(a => a.hp < a.maxHp)
  if (!hurt.length) return undefined
  return hurt.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), hurt[0])
}

/** Ica mirrors Hyacine: MaxHP = talent(0.5) × Hyacine MaxHP; ATK mirrors. CRIT Rate/DMG follow
 *  Hyacine LIVE through `critOwner` (StatResolver resolves the Memomaster's current values), so they
 *  are deliberately NOT snapshotted into `base` here — a snapshot would freeze Ica's E4 CRIT DMG. */
function refreshIca(sim: SimApi, u: Unit, ica: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const ratio = ica.maxHp > 0 ? ica.hp / ica.maxHp : 1
  const ihp = Math.max(1, Math.round(eu.hp * mult('hyacine', 'talent', lv.talent)))
  ica.base.hp = ihp
  ica.maxHp = ihp
  ica.hp = Math.max(1, Math.round(ihp * ratio))
  ica.base.atk = eu.atk
  ica.base.level = u.base.level
}

/** Trace A3 Tempestuous Halt: SPD>200 → MaxHP+20%; per excess SPD → +1% OHB (cap 200 excess).
 *  E4 <Sunlit Amber, Yours to Keep> adds per excess SPD +2% CRIT DMG — Hyacine only; Ica inherits it
 *  live through `critOwner` (a second buff would double-count it). */
function refreshTempestuous(sim: SimApi, u: Unit, ica: Unit | undefined, ctx: KitRuntime): void {
  const spd = eff(u).spd
  const excess = Math.min(200, Math.max(0, spd - 200))
  const hpPct = spd > 200 ? 0.2 : 0
  const ohbPct = excess * 0.01
  const cdPct = ((ctx.eidolon as number) ?? 0) >= 4 ? excess * 0.02 : 0
  for (const x of [u, ica]) {
    if (!x) continue
    sim.removeBuff(x, 'hy_th')
    if (hpPct > 0 || ohbPct > 0)
      sim.addBuff(x, { id: 'hy_th', name: 'Tempestuous Halt', mods: [
        ...(hpPct > 0 ? [{ stat: 'hpPct' as const, value: hpPct }] : []),
        ...(ohbPct > 0 ? [{ stat: 'outHeal' as const, value: ohbPct }] : []),
      ], turns: Infinity } as never)
  }
  if (cdPct > 0) sim.addBuff(u, { id: 'hy_th4', name: 'Sunlit Amber, Yours to Keep', mods: [{ stat: 'critDmg', value: cdPct }], turns: Infinity } as never)
  else sim.removeBuff(u, 'hy_th4')
}

/** Talent "First Light Heals the World": after Hyacine/Ica heals, Ica DMG+ for #3 turns, max #5 stacks. */
function addIcaStack(sim: SimApi, u: Unit, ica: Unit | undefined, ctx: KitRuntime): void {
  if (!ica) return
  const lv = levelsOf(ctx)
  sim.addBuff(ica, { id: 'hy_dmg', name: 'First Light Heals the World', mods: [{ stat: 'dmgAll', value: mult('hyacine', 'talent_a2', lv.talent) }], turns: mult('hyacine', 'talent_a3', lv.talent), maxStacks: mult('hyacine', 'talent_a4', lv.talent) } as never)
}

function tallyHeal(sim: SimApi, u: Unit, amount: number): void {
  const rt = sim.rt(u)
  rt.hyTally = ((rt.hyTally as number) ?? 0) + Math.round(amount)
}

/** A1 Gloomy Grin: <When providing healing to an ally target whose current HP is equal to or less
 *  than 50% of their Max HP, increases Hyacine's and Little Ica's Outgoing Healing by 25%>.
 *  Returns the amount actually healed so the caller can feed the Rainclouds tally. */
function healOut(sim: SimApi, target: Unit, amount: number, src?: Unit): number {
  if (amount <= 0 || target.dead) return 0
  const amt = Math.round(target.hp <= target.maxHp * 0.5 ? amount * 1.25 : amount)
  sim.heal(target, amt, src)
  return amt
}

/** actually restored HP: `sim.heal` caps at MaxHP, so a heal landing on a full-HP ally must NOT feed the
 *  Rainclouds tally (canon counts accumulated healing, not requested amounts). */
function hpSnapshot(sim: SimApi): Map<string, number> {
  return new Map(sim.allies('ally').map(a => [a.id, a.hp]))
}
function hpRestored(snap: Map<string, number>, a: Unit): number {
  return Math.max(0, a.hp - (snap.get(a.id) ?? a.hp))
}
function sumRestored(sim: SimApi, snap: Map<string, number>): number {
  let n = 0
  for (const a of sim.allies('ally')) n += hpRestored(snap, a)
  return n
}

/** Little Ica "Rainclouds, Time to Go!": AoE Wind DMG = #1% of healing tally; clears #2% (E6 12%). */
function rainclouds(sim: SimApi, u: Unit, ica: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u)
  const tally = (rt.hyTally as number) ?? 0
  if (tally <= 0) return
  const flat = Math.round(tally * mult('hyacine', 'mem_skill', lv.skill))
  const clear = eid >= 6 ? 0.12 : mult('hyacine', 'mem_skill_a2', lv.skill)
  rt.hyTally = Math.max(0, tally - Math.round(tally * clear))
  sim.hitAoe(ica, { type: 'fua', elem: 'Wind', flat, memoSkill: true, label: 'Rainclouds, Time to Go!' })
  sim.log(`${ica.name} Rainclouds: ${flat.toFixed(0)} Wind DMG (tally ${tally.toFixed(0)} → ${((rt.hyTally as number) ?? 0).toFixed(0)})`)
  icaActed(sim, u, ica, ctx)
}

/** Little Ica "Take Sky in Hand": consume #1% own MaxHP, heal the HP-reduced ally by #2% Hyacine
 *  MaxHP + #3 flat, and <when Little Ica triggers the Talent's healing effect, additionally restores
 *  HP for all ally targets by an amount equal to #4% of Hyacine's Max HP plus #5> — the AoE half is
 *  a separate param pair, so the primary target is charged once with #2/#3 and the rest with #4/#5.
 *  Canon: the cost is paid even on the last charge — hitting 0 HP makes Ica disappear (`Fall, Then Take
 *  Wing`), so the heal still lands before the despawn. */
function takeSky(sim: SimApi, u: Unit, ica: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const target = lowestHpAlly(sim, u)
  if (!target) return
  const cost = Math.round(ica.maxHp * mult('hyacine', 'mem_talent', lv.talent))
  sim.hpChange(ica, -cost, 'cost', { floor: 0 })
  // снимок ПОСЛЕ оплаты стоимости: стоимость — потеря HP, а не хил ⇒ талли меряет только восстановленное
  const snap = hpSnapshot(sim)
  const main = Math.round(eff(u).hp * mult('hyacine', 'mem_talent_a2', lv.talent)) + Math.round(mult('hyacine', 'mem_talent_a3', lv.talent))
  const aoe = Math.round(eff(u).hp * mult('hyacine', 'mem_talent_a4', lv.talent)) + Math.round(mult('hyacine', 'mem_talent_a5', lv.talent))
  const mainDone = healOut(sim, target, main, ica)
  let others = 0
  for (const a of sim.allies('ally')) {
    if (a.id === target.id || a.dead || a.kind === 'summon') continue
    others += healOut(sim, a, aoe, ica)
  }
  tallyHeal(sim, u, sumRestored(sim, snap))
  addIcaStack(sim, u, ica, ctx)
  // лог печатает ФАКТИЧЕСКИЙ хил (+A1) рядом с базой — иначе A1-гейл не виден в транскрипте
  sim.log(`${ica.name} Take Sky: heals ${target.name} +${mainDone} (base ${main}), all others +${others} (base ${aoe} ea.) — total ${mainDone + others}, Ica −${cost} HP`)
  icaActed(sim, u, ica, ctx)
}

/** Take Sky / Rainclouds / any Ica ability: <After Little Ica uses an ability, the duration of all their
 *  Continuous Effects decreases by 1 turn>. Ica has no turn timer (0 SPD, event-driven), so its buff
 *  durations never ticked down on their own. Routed through the shared countdown path so an expiring
 *  Continuous Effect still fires `onBuffExpire` (endTick semantics) instead of vanishing silently. */
function icaActed(sim: SimApi, u: Unit, ica: Unit, ctx: KitRuntime): void {
  const ticked = sim.expireBuffs(ica)
  if (ticked) sim.log(`${ica.name} Continuous Effects −1 (${ticked} effect(s))`)
  if (ica.hp <= 0) despawnIca(sim, u, ica, ctx)
}

/** Ica at 0 HP disappears: memosprite-disappear event (Shadowburn/Evernight/Reminiscence/gear) + memosprite
 *  skill 1140906 "Fall, Then Take Wing" <Upon disappearing, advances the action of Hyacine by 30%>. E6 team
 *  RES PEN is gated on Ica being on the field, so it goes with her. */
function despawnIca(sim: SimApi, u: Unit, ica: Unit, ctx: KitRuntime): void {
  sim.unregisterUnit(ica.id)
  sim.fireMemospriteDisappear(u)
  for (const a of sim.allies('ally')) if (!a.dead) sim.removeBuff(a, 'hy_e6')
  const adv = mult('hyacine', 'mem_talent_a6', levelsOf(ctx).talent)
  sim.advance(u, adv)
  sim.log(`${ica.name} falls, then takes wing — disappears, Hyacine advances ${(adv * 100).toFixed(0)}%`)
}

function summonIca(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const ica = icaOf(sim, u)
  if (ica) return ica
  const lv = levelsOf(ctx)
  const icaU: Unit = {
    id: `ica_${u.id}`, name: 'Little Ica', side: 'ally', kind: 'summon', elem: 'Wind',
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: 0 },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
  const crt = sim.rt(icaU)
  crt.ownerId = u.id
  icaU.critOwner = u
  refreshIca(sim, u, icaU, ctx)
  sim.registerUnit(icaU)
  sim.fireMemospriteSummon(u)
  // Soar, Unto the Sunlight: +energy, first summon +extra.
  if (!(sim.rt(u).hyFirstSummon as boolean)) { sim.rt(u).hyFirstSummon = true; sim.gainEnergy(u, mult('hyacine', 'mem_skill2_a2', lv.talent)) }
  sim.gainEnergy(u, mult('hyacine', 'mem_skill2', lv.talent))
  refreshTempestuous(sim, u, icaU, ctx)
  // E6 <O Sky, Heed My Plea>: while Little Ica is on the field, all ally targets gain 20% All-Type RES PEN.
  // Gated on her presence — removed again when she runs out of HP and disappears (see `despawnIca`).
  if (((ctx.eidolon as number) ?? 0) >= 6) {
    for (const a of sim.allies('ally')) {
      if (a.dead) continue
      sim.addBuff(a, { id: 'hy_e6', name: 'O Sky, Heed My Plea', mods: [{ stat: 'resPenAll', value: 0.2 }], turns: Infinity } as never)
    }
  }
  sim.log(`${u.name} summons Little Ica (MaxHP ${icaU.maxHp})`)
  return icaU
}

// per-target excluded from heals; A1 Outgoing Healing folded in, tally counts actual healed HP.
// Skill/Ult heal in two components (json pairs): %MaxHP of Hyacine + a flat add, separately for allies and Ica.
function healAlliesExceptIca(sim: SimApi, u: Unit, healAll: number, healIca: number, ctx: KitRuntime): void {
  if (healAll <= 0 && healIca <= 0) return
  const snap = hpSnapshot(sim)
  for (const a of sim.allies('ally')) {
    if (isIca(sim, a, u.id)) {
      if (healIca > 0) healOut(sim, a, healIca)
    } else if (a.kind !== 'summon' && a.id !== `ica_${u.id}`) {
      if (healAll > 0) healOut(sim, a, healAll)
    }
  }
  tallyHeal(sim, u, sumRestored(sim, snap))
  addIcaStack(sim, u, icaOf(sim, u), ctx)
}

/** Ult 140903: <While "After Rain" is active, all ally targets increase their Max HP by #3% plus #4>.
 *  E1 <Cradle the Candle of Night> adds a further 50% for the same duration — both are torn down when
 *  After Rain runs out (`onTurnStart`), they used to stay for the rest of the battle. */
function applyAfterRainHp(sim: SimApi, u: Unit, ctx: KitRuntime, eid: number): void {
  const lv = levelsOf(ctx)
  for (const a of sim.allies('ally')) {
    if (a.dead) continue
    sim.addBuff(a, { id: 'hy_ar_base', name: 'After Rain', mods: [
      { stat: 'hpPct' as const, value: mult('hyacine', 'ult_a3', lv.ult) },
      { stat: 'hpFlat' as const, value: mult('hyacine', 'ult_a4', lv.ult) },
    ], turns: Infinity } as never)
    if (eid >= 1) sim.addBuff(a, { id: 'hy_ar', name: 'Cradle the Candle of Night', mods: [{ stat: 'hpPct', value: 0.5 }], turns: Infinity } as never)
  }
}

function clearAfterRainHp(sim: SimApi, u: Unit): void {
  for (const a of sim.allies('ally')) {
    sim.removeBuff(a, 'hy_ar_base')
    sim.removeBuff(a, 'hy_ar')
  }
}

export const hyacineKit: KitDef = {
  id: 'hyacine',
  name: 'Hyacine',
  elem: 'Wind',
  energyMax: 140,
  base: { ...PROG.hyacine.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  // 140907 "Day So Right, Life So Fine!": heals all allies (30% of Hyacine's Max HP + 600) and
  // raises their Max HP +20% for 2 turns at battle start.
  technique: {
    name: 'Day So Right, Life So Fine!',
    kind: 'buff',
    apply(sim, u) {
      const amount = Math.round(eff(u).hp * 0.3) + 600
      for (const a of sim.allies('ally')) {
        if (a.kind !== 'char' || a.dead) continue
        sim.heal(a, amount)
        sim.addBuff(a, { id: 'hyacine_tech_hp', name: 'Day So Right, Life So Fine!', mods: [{ stat: 'hpPct', value: 0.20 }], turns: 2 })
      }
    },
  },
  onStart(sim, u, ctx) {
    sim.addBuff(u, { id: 'hy_cr', name: 'Gloomy Grin', mods: [{ stat: 'critRate', value: 1.0 }], turns: Infinity } as never)
    // A2 Stormy Caress: +50% Effect RES (unconditional part; the dispel half is a no-op — allies carry no debuffs).
    sim.addBuff(u, { id: 'hy_a2', name: 'Stormy Caress', mods: [{ stat: 'effRes', value: 0.5 }], turns: Infinity } as never)
    refreshTempestuous(sim, u, undefined, ctx)
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    const ica = icaOf(sim, u)
    const hurt = sim.allies('ally').some(a => !a.dead && a.kind !== 'summon' && !isIca(sim, a, u.id) && a.hp < a.maxHp)
    if (sim.sp() >= 1 && (hurt || !ica)) return { kind: 'skill' }
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
      const ica = summonIca(sim, u, ctx)
      healAlliesExceptIca(sim, u, Math.round(eff(u).hp * mult('hyacine', 'ult', lv.ult)) + Math.round(mult('hyacine', 'ult_flat', lv.ult)), ica ? Math.round(eff(u).hp * mult('hyacine', 'ult_a2', lv.ult)) + Math.round(mult('hyacine', 'ult_a2_flat', lv.ult)) : 0, ctx)
      rt.afterRain = mult('hyacine', 'ult_turns', lv.ult)
      applyAfterRainHp(sim, u, ctx, eid)
      if (ica) refreshIca(sim, u, ica, ctx)
      refreshTempestuous(sim, u, ica, ctx)
      sim.log(`${u.name} Ultimate: summons Little Ica, heals all; After Rain ${rt.afterRain} turns`)
      if (ica) rainclouds(sim, u, ica, ctx)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const ica = summonIca(sim, u, ctx)
      healAlliesExceptIca(sim, u, Math.round(eff(u).hp * mult('hyacine', 'skill', lv.skill)) + Math.round(mult('hyacine', 'skill_flat', lv.skill)), ica ? Math.round(eff(u).hp * mult('hyacine', 'skill_a2', lv.skill)) + Math.round(mult('hyacine', 'skill_a2_flat', lv.skill)) : 0, ctx)
      sim.log(`${u.name} Skill: heals all`)
      // <automatically casts "Rainclouds, Time to Go!" immediately after Hyacine uses an ability> — After Rain only.
      if (ica && (rt.afterRain as number) > 0) rainclouds(sim, u, ica, ctx)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = enemies.reduce((m, e) => (e.hp < m.hp ? e : m), enemies[0])
    sim.hit(u, t, { type: 'basic', elem: 'Wind', mult: mult('hyacine', 'basic', lv.basic), scaleStat: 'hp', toughDmg: 10, label: 'When Breeze Kisses Cirrus' })
  },

  // Ica is event-driven (0 SPD, not in AV): Take Sky resolves at the start of any turn AND after any
  // target acts (canon 1140903) — two resolution points, so both fire.
  // Rainclouds is NOT here — canon casts it <immediately after Hyacine uses an ability> (see `perform`),
  // it used to fire once per ally turn-start, i.e. ~4x too often.
  onAllyTurnStart(sim, ally, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'hyacine' && !a.dead)
    if (!u) return
    const ica = icaOf(sim, u)
    if (!ica) return
    takeSky(sim, u, ica, ctx)
  },

  /** E2 <Come Sit in My Courtyard>: "When any ally target's HP decreases, this unit's SPD increases by
   *  30% for 2 turn(s)." The SPD gain applies to Hyacine herself, keyed on any ally HP loss (any cause —
   *  combat damage, DoT, kit drains/costs), which `sim.fireAllyHpLoss` announces. */
  onAllyHpLoss(sim, u, _target, _amt, ctx) {
    if (((ctx.eidolon as number) ?? 0) >= 2) sim.addBuff(u, { id: 'hy_e2', name: 'Come Sit in My Courtyard', mods: [{ stat: 'spdPct', value: 0.3 }], turns: 2 } as never)
  },

  /** <after any target takes action> — the second Take Sky resolution point (the first is turn start). */
  onAllyActionEnd(sim, actor, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'hyacine' && !a.dead)
    if (!u) return
    const ica = icaOf(sim, u)
    if (!ica || isIca(sim, actor, u.id)) return
    takeSky(sim, u, ica, ctx)
  },

  // After Rain <duration decreases by 1 at the start of Hyacine's every turn> — was decremented in onTurnEnd.
  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u)
    if ((rt.afterRain as number) > 0) {
      rt.afterRain = (rt.afterRain as number) - 1
      if ((rt.afterRain as number) <= 0) { clearAfterRainHp(sim, u); sim.log(`${u.name} After Rain ends`) }
    }
    refreshTempestuous(sim, u, icaOf(sim, u), ctx)
  },

  // E1: while After Rain, any ally attack restores 8% Hyacine MaxHP + feeds tally. Guard to Hyacine's own kit context.
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'hyacine' && !a.dead)
    if (!u) return
    if (target.side !== 'enemy' || target.dead || attacker.side !== 'ally' || attacker.kind === 'summon') return
    if ((ctx.eidolon as number) < 1) return
    if ((sim.rt(u).afterRain as number) <= 0) return
    const heal = Math.round(eff(u).hp * 0.08)
    const before = attacker.hp
    healOut(sim, attacker, heal)
    tallyHeal(sim, u, hpRestored(new Map([[attacker.id, before]]), attacker))
  },
}


// ===== castorice  (was castorice.ts) =====

function netherwingOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`nw_${u.id}`)
}

/** HP-scaled base: flat = % of Castorice's Max HP. */
function hpBase(sim: SimApi, u: Unit, frac: number): number {
  return eff(u).hp * frac
}

/** E1 "Death Kisses the Dewdrop": Boneclaw/Breath/Wings DMG ×1.2 at enemy ≤80% HP, ×1.4 at ≤50%. */
function e1Mul(e: Unit | undefined, eid: number): number {
  if (eid < 1 || !e) return 1
  const r = e.hp / e.maxHp
  return r <= 0.5 ? 1.4 : r <= 0.8 ? 1.2 : 1
}

// Max "Newbud" (Talent 140704 notes): 34000 at EQ 5-6; EQ 1-4 = 5.3125×Level² of the highest ally (min 2000).
const MAX_NEWBUD = 34000
// Netherwing "has a set Max HP equal to #3% of max Newbud" (Ult 140703, #3 = 1 at every level).
// The stored value is a FRACTION like every other `%` param in hsr-data (see AGENTS.md), so #3 = 1 is
// the FULL pool, not 1%. Proof from the same skill — #4 = 0.1…0.25 is the Territory's All-Type RES
// down, and 0.1 as a raw percent would make the Territory pointless. Breath's 25%-per-launch cost
// (1140702 #1) then walks the bar 34000 → 25500 → 17000 → 8500 before the payout press.
const NW_MAX_HP = MAX_NEWBUD
// Mooncocoon 1140703 #1: allies' "current HP can be reduced down to a minimum of 1, after which
// Netherwing will bear the HP loss. But Netherwing consumes HP equal to #1% of the original value".
const MOONCOCOCOON_PCT = 0.05
// Netherwing lifespan in turns (Ult 140703 #2 = 3 at every level) and the hard launch bound used by
// onSummonTurn's final-turn loop (25% cost per launch off a MaxHP that fits 4 launches).
const NW_LIFESPAN_TURNS = 3
const NW_MAX_LAUNCHES = 8
// "Contained Dark Tide" (bonus_abilities[0]): "Each ally target can accumulate a conversion amount up to
// 12% of the max 'Newbud'" => 0.12×34000 = 4080 healed HP per target, reset after ANY unit acts.
const CDT_ACC_CAP = Math.round(MAX_NEWBUD * 0.12)
// "Where the West Wind Dwells" (bonus_abilities[2]): "Each time Netherwing uses Breath, the DMG dealt
// increases by 30%, stacks up to 6 and lasts until the end of this turn." No params/ranks in hsr-data,
// so both numbers are canon text constants. Distinct from Breath's own #3/#4 multiplier boost
// (1140702), which ramps per launch and never falls back before the wing disappears.
// the stack is added at the TOP of breathScorches, i.e. the payout press (Wings Sweep) stacks it too —
// E0 runs 4 presses (3 damaging + payout) = 4 stacks, E2 (2 free Ardent + 3 damaging + payout) hits the 6-cap.
// Canon names Breath as the stacking trigger and the payout press is Wings, so the 6-cap being reachable rests on
// counting it. See TODO.md. Claw does not stack it: canon names Breath only.
const WIND_STEP = 0.30
const WIND_CAP = 6
// E2 "Crown on Wings of Bloom": "After summoning the memosprite Netherwing, Castorice gains 2 stack(s) of 'Ardent
// Will.' 'Ardent Will' can stack up to 2 time(s) and can be used to offset the HP cost of Netherwing's Memosprite
// Skill 'Breath Scorches the Shadow' and advance Castorice's action by 100%. When using the next Enhanced Skill,
// Castorice gains 'Newbud' by an amount equal to 30% of max 'Newbud.'" No params/ranks in hsr-data -> text constants.
// the 100% advance is read as a once-per-summon burst (the text states it once, and 2 stacks would
// otherwise mean a 200% gap); the stacks themselves are spent one per Breath HP cost. Both readings agree on the
// HP-cost part, which is what the wing's damage window depends on.
const ARDENT_MAX = 2
const ARDENT_NEWBUD_PCT = 0.30
// E4 "Rest in Songs of Gloom": "While Castorice is on the field, all allies' HP restored when receiving healing
// increases by 20%." -> inHeal (sim.heal reads it as the IHB term).
const E4_INHEAL = 0.20
// E6 "Await for Years to Loom": "When Castorice or Netherwing deals DMG, increases Quantum RES PEN by 20%. During
// Netherwing's attacks, can reduce enemy Toughness regardless of Weakness Types. When breaking Weaknesses,
// triggers the Quantum Weakness Break effect. And the number of Bounces for Netherwing's Talent 'Wings Sweep the
// Ruins' additionally increases by 3." (the +3 is also spelled out in 1140706/1140712 notes).
// The Quantum Weakness Break effect is handled generically by BreakResolver.applyBreakDebuff: every Netherwing/Claw/
// Breath hit is `elem:'Quantum'` with `pierceRatio:1`, so a pierce break on a non-Quantum-weak target still runs the
// Quantum branch (Entanglement dot + 20% action delay). See debug-kits 'E6 pierce break triggers the Quantum ...'.
const E6_RES_PEN = 0.20
const E6_WINGS_EXTRA = 3
// show_stance_list: 1140702 "Breath Scorches the Shadow" = [0,30,0] (30 Toughness per launch), 1140706 /
// 1140712 "Wings Sweep the Ruins" = [15,0,0] (15 per Bounce instance). Without these the wing never stripped
// any Toughness, so no enemy could ever break from its attacks and E6's type-agnostic Toughness reduction had
// nothing to reduce. 1140701 "Claw Splits the Veil" is also [0,30,0] (once per use, not per hit).
const BREATH_TOUGH = 30
const CLAW_TOUGH = 30
const WINGS_TOUGH = 15

function refreshRt(u: Unit, sim: SimApi): { newbud?: number; ardent?: number; ardentNewbud?: boolean } {
  const rt = sim.rt(u)
  if (typeof rt.newbud !== 'number') rt.newbud = 0
  return rt
}

/** Every point of HP an ally loses -> +1 Newbud. Netherwing HP loss excluded. */
function addNewbud(sim: SimApi, u: Unit, amt: number): void {
  const rt = refreshRt(u, sim)
  if (amt <= 0) return
  const before = rt.newbud!
  rt.newbud = Math.min(MAX_NEWBUD, before + amt)
  if (rt.newbud !== before) sim.log(`Castorice: Newbud ${before} -> ${rt.newbud} / ${MAX_NEWBUD}`)
}

/** Talent 140704: "When Netherwing is on the field, Newbud cannot be gained through Talent, and every 1
 *  point of HP lost by all allies (except Netherwing) will be converted to an equal amount of HP for Netherwing." */
function creditDrain(sim: SimApi, u: Unit, amt: number): void {
  const nw = netherwingOf(sim, u)
  if (!nw) { addNewbud(sim, u, amt); return }
  const before = nw.hp
  sim.hpChange(nw, amt, 'heal')
  sim.log(`Desolation Across Palms: Netherwing gains ${Math.round(nw.hp - before)} HP instead of Newbud`)
}

/** Talent 140704 #2: "When allies lose HP, Castorice's and Netherwing's DMG dealt increases by #2[i]%, stacks
 *  up to #3[i] time(s), lasting for #4[i] turn(s)" — same trigger clause as Newbud (any ally HP loss). */
function stackTalentDmg(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(u) as { dmgStacks?: number }
  const st = Math.min(3, (rt.dmgStacks ?? 0) + 1)
  rt.dmgStacks = st
  const buff: Buff = { id: 'cast_dmg', name: 'Desolation Across Palms', mods: [{ stat: 'dmgAll', value: st * mult('castorice', 'talent', lv.talent) }], turns: mult('castorice', 'talent_a3', lv.talent) }
  sim.removeBuff(u, 'cast_dmg')
  sim.addBuff(u, buff)
  const nw = netherwingOf(sim, u)
  if (nw) { sim.removeBuff(nw, 'cast_dmg'); sim.addBuff(nw, buff) }
}

/** Drain current HP of all allies (except Netherwing, except self? skill hits all allies incl self).
 *  Per-ally Newbud/DMG+ crediting rides the shared `fireAllyHpLoss` path (`onAllyHpLoss`). */
function drainAllies(sim: SimApi, u: Unit, ctx: KitRuntime, pct: number, _excludeNw: boolean): number {
  let lost = 0
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char') continue
    const cost = Math.max(1, Math.round(a.hp * pct))
    const actual = -sim.hpChange(a, -cost, 'drain')
    // The drain floors at 1 HP, so a floored ally loses nothing -> no Newbud, no DMG+ stack.
    if (actual <= 0) continue
    sim.fireAllyHpLoss(a, actual)
    lost += actual
  }
  return lost
}

/** Territory "Lost Netherland": all enemies All-RES down (↓% → resAll). */
function applyTerritory(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const v = mult('castorice', 'ult', lv.ult)
  for (const e of sim.livingEnemiesOf(u))
    sim.addBuff(e, { id: 'cast_terr', name: 'Doomshriek, Dawn\'s Chime All-RES↓', mods: [{ stat: 'resAll', value: -v }], debuff: true })
  sim.log(`Castorice deploys Lost Netherland: enemies DMG taken +${Math.round(v * 100)}%`)
}

function removeTerritory(sim: SimApi, u: Unit): void {
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'cast_terr')
}

/** Memosprite Talent "Wings Sweep the Ruins" (1140706): on disappear, N-bounce Quantum DMG + heal all allies.
 *  `src` is the (already unregistered) wing, kept for heal attribution - the wing is off the field by the
 *  time the payout resolves, so `netherwingOf` can no longer find it.
 *  Two canon details the flat `hitRandom` could not carry, both fixed here:
 *   - E1 (ranks.1) lists "Wings Sweep the Ruins" next to Boneclaw/Claw/Breath, and its multiplier is per enemy
 *     while each instance picks its own random target -> the target is resolved per instance.
 *   - E6 "Await for Years to Loom" adds 3 Bounces (6 -> 9; 1140706 notes). */
function wingsSweep(sim: SimApi, u: Unit, ctx: KitRuntime, src?: Unit): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const per = hpBase(sim, u, mult('castorice', 'mem_talent', lv.talent))
  const bounces = mult('castorice', 'mem_talent_a2', lv.talent) + (eid >= 6 ? E6_WINGS_EXTRA : 0)
  for (let i = 0; i < bounces; i++) {
    const pool = sim.livingEnemiesOf(u)
    if (!pool.length) break
    const e = pool[Math.floor(sim.rng() * pool.length)]
    // 1140706/1140712 show_stance_list = [15,0,0]: each Bounce instance strips 15 Toughness.
    sim.hit(u, e, { type: 'add', elem: 'Quantum', flat: per * e1Mul(e, eid), label: 'Wings Sweep the Ruins', toughDmg: WINGS_TOUGH, ...(eid >= 6 ? { pierceRatio: 1 } : null) })
  }
  // Heal = #3[i]% of Castоrice's Max HP + #4[i] flat, for all allies; E4's +20% healing received rides inHeal.
  const heal = hpBase(sim, u, mult('castorice', 'mem_talent_a3', lv.talent)) + mult('castorice', 'mem_talent_a4', lv.talent)
  const nw = src ?? netherwingOf(sim, u)
  for (const a of sim.allies(u.side)) sim.heal(a, heal, nw)
  sim.log(`Netherwing disappears: Wings burst -${bounces} + all allies heal ${Math.round(heal)}`)
}

/** Mooncocoon 1140703: while Netherwing is on the field it is the allies' backup — "their current HP
 *  can be reduced down to a minimum of 1, after which Netherwing will bear the HP loss. But Netherwing
 *  consumes HP equal to #1% of the original value". The ally therefore eats min(dmg, hp-1) itself and
 *  the wing only covers the remainder. Chained interceptor (sim.addLossInterceptor): coexists with
 *  Mydei A1; removes itself when Netherwing dies. */
function armMooncocoon(sim: SimApi, u: Unit, nw: Unit, ctx: KitRuntime): void {
  const fn = (t: Unit, dmg: number): number => {
    if (t.side !== 'ally' || t.kind !== 'char' || !dmg) return 0
    const cur = sim.find(nw.id)
    if (!cur || cur.dead) { sim.removeLossInterceptor(fn); return 0 }
    const bear = Math.max(0, dmg - (t.hp - 1))
    if (bear <= 0) return 0
    if (bear <= 0) return 0
    const pay = Math.min(dmg * MOONCOCOCOON_PCT, cur.hp)
    if (pay > 0) sim.hpChange(cur, -pay, 'redirect', { floor: 0 })
    sim.log(`Mooncocoon: Netherwing bears ${Math.round(bear)} of ${Math.round(dmg)} for ${t.name} at 1 HP, consumes ${Math.round(pay)} (${Math.round(MOONCOCOCOON_PCT * 100)}% of original)`)
    if (cur.hp <= 0) despawnWing(sim, cur, u, ctx) // canon: the wing disappears at 0 HP (140703)
    return bear
  }
  sim.addLossInterceptor(fn, 'redirect')
  sim.rt(u).mooncocoonFn = fn
}

function clearMooncocoon(sim: SimApi, u: Unit): void {
  const fn = sim.rt(u).mooncocoonFn as ((t: Unit, dmg: number) => number) | undefined
  if (fn) sim.removeLossInterceptor(fn)
  sim.rt(u).mooncocoonFn = undefined
}

function summonNetherwing(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const nw = netherwingOf(sim, u)
  if (nw) { sim.advance(nw, 1.0); return nw }
  const nwU: Unit = {
    id: `nw_${u.id}`, name: 'Netherwing: Pollux', side: 'ally', kind: 'summon', elem: 'Quantum',
    base: { level: 80, hp: NW_MAX_HP, atk: 1, def: 0, spd: 165 },
    hp: NW_MAX_HP, maxHp: NW_MAX_HP, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
  const rt = sim.rt(nwU) as { ownerId?: string; nwLaunches?: number; nwTurns?: number }
  rt.ownerId = u.id
  rt.nwLaunches = 0
  // 140703 #2 counts the turns *this* Netherwing experiences; the runtime is keyed by the stable
  // `nw_<owner>` id, so a re-summoned wing must start its 3-turn lifespan (and its #2→#3→#4 ramp) over.
  rt.nwTurns = 0
  sim.registerUnit(nwU)
  armMooncocoon(sim, u, nwU, ctx)
  sim.fireMemospriteSummon(u)
  sim.advance(nwU, 1.0)
  // E6: "When Castorice or Netherwing deals DMG, increases Quantum RES PEN by 20%" - the wing's Quantum hits
  // carry it too (it has no gear of its own).
  if (((ctx.eidolon as number) ?? 0) >= 6)
    sim.addBuff(nwU, { id: 'cast_e6_respen', name: 'Await for Years to Loom', mods: [{ stat: 'resPen:Quantum', value: E6_RES_PEN }], turns: Infinity })
  // E2 "Crown on Wings of Bloom": 2 stacks of "Ardent Will" (each offsets one Breath HP cost), Castorice's
  // action advanced by 100%, and the next Enhanced Skill grants 30% of max Newbud.
  if (((ctx.eidolon as number) ?? 0) >= 2) {
    const orun = refreshRt(u, sim)
    orun.ardent = ARDENT_MAX
    orun.ardentNewbud = true
    sim.advance(u, 1.0)
    sim.log(`Castorice gains ${ARDENT_MAX} stack(s) of Ardent Will (E2)`)
  }
  // Memosprite Talent "Roar Rumbles the Realm": on summon, all allies DMG +10% for 3 turns
  for (const a of sim.allies(u.side))
    if (a.kind === 'char') sim.addBuff(a, { id: 'cast_roar', name: 'Doomshriek, Dawn\'s Chime', mods: [{ stat: 'dmgAll', value: 0.10 }], turns: 3 })
  applyTerritory(sim, u, ctx)
  sim.log(`Castorice summons Netherwing (HP ${NW_MAX_HP}, SPD 165)`)
  return nwU
}

/** Netherwing disappears: "Wings Sweep the Ruins" (1140706) fires, the Territory is dispelled and
 *  Mooncocoon stops shielding. Shared by the <=25% HP trigger and the 140703 3-turn lifespan expiry.
 *  The wing leaves the field FIRST: it is already gone when the payout resolves, so the payout's own
 *  all-ally heal can no longer be converted back into its HP (Contained Dark Tide / 140704) and nothing
 *  downstream can keep acting for a dead wing. */
function despawnWing(sim: SimApi, nw: Unit, owner: Unit, ctx: KitRuntime): void {
  sim.hpChange(nw, 1 - nw.hp, 'set')
  sim.unregisterUnit(nw.id)
  clearMooncocoon(sim, owner)
  sim.fireMemospriteDisappear(owner)
  wingsSweep(sim, owner, ctx, nw)
  removeTerritory(sim, owner)
}

/** One "Breath Scorches the Shadow" press. Returns true when the wing despawned (Wings Sweep fired).
 *  1140702: every press costs #1 = 25% of the wing's **Max** HP (never of its current HP) and the DMG
 *  multiplier ramps #2 → #3 → #4 without ever falling back. "When Netherwing's current HP is equal to or
 *  less than #5 = 25% of its Max HP, launching this ability will actively reduce HP down to 1, and then
 *  trigger the ability effect equal to that of the Talent 'Wings Sweep the Ruins'" — the press that finds
 *  the wing at the line therefore deals NO Breath DMG, it only drops it to 1 HP and pays out. From a full
 *  bar that is 3 damaging Breaths (340 → 255 → 170 → 85) plus the 4th press that pays out. */
function breathScorches(sim: SimApi, nw: Unit, owner: Unit, ctx: KitRuntime, lv: ReturnType<typeof levelsOf>, eid: number, rt: { nwLaunches?: number; windStacks?: number }): boolean {
  // bonus_abilities[2]: "each time Netherwing uses 'Breath Scorches the Shadow'" - the stack lands on the
  // press itself (before its own damage), and only lasts inside this wing turn, so onSummonTurn clears both
  // the buff and the counter. The payout press (HP at/below the 25% line) also increments: 1140702 calls it a
  // *launch* of Breath whose effect is replaced by the Talent, and it is inert anyway — the press deals no
  // Breath DMG, the wing despawns on the spot, and the counter resets at the next wing turn.
  const wind = Math.min(WIND_CAP, (rt.windStacks ?? 0) + 1)
  rt.windStacks = wind
  sim.removeBuff(nw, 'cast_wind')
  sim.addBuff(nw, { id: 'cast_wind', name: 'Where the West Wind Dwells', mods: [{ stat: 'dmgAll', value: wind * WIND_STEP }], turns: 1 })
  // 1140702 "can be launched repeatedly" - every press is its own activation, hence its own attack: per-attack
  // hooks (a Besotted attacker healing on attack, Moze's Charge, per-attack gear) must see press by press. The
  // AoE hits of ONE press still share that press's sequence.
  sim.newAttack()
  if (nw.hp <= nw.maxHp * mult('castorice', 'mem_skill_a5', lv.talent)) {
    sim.hpChange(nw, 1 - nw.hp, 'set')
    despawnWing(sim, nw, owner, ctx)
    return true
  }
  // E2 "Ardent Will": a stack "can be used to offset the HP cost of 'Breath Scorches the Shadow'" - the press
  // still lands (Wind stack, ramp, damage) but the 25% cost is paid by the stack.
  const ort = refreshRt(owner, sim)
  if (eid >= 2 && (ort.ardent ?? 0) > 0) {
    ort.ardent = ort.ardent! - 1
    sim.log(`Ardent Will (E2) absorbs Breath's HP cost (${ort.ardent} stack(s) left)`)
  } else {
    sim.hpChange(nw, -Math.max(1, Math.round(nw.maxHp * mult('castorice', 'mem_skill', lv.talent))), 'cost')
  }
  // Canon: the wing cannot be healed while it is taking its OWN turn — its bar is spent by its own presses and
  // nothing refills it mid-turn. The sim can (Gallagher's Besotted Talent heals the ATTACKER, and the wing
  // attacks every press; 140704 conversions can also land mid-turn), so the bar is pinned to its post-cost value
  // once the press has resolved: over a turn it is monotonically non-increasing. With MaxHP 340 = 4 x 85 (one
  // press) a wing life is therefore 3 damaging Breaths + the payout press, which is what the game shows; the fed
  // branch in onSummonTurn (8 presses, then Claw) is a dead branch kept for the canon case.
  const barAfterCost = nw.hp
  const ramp = [
    mult('castorice', 'mem_skill_a2', lv.talent),
    mult('castorice', 'mem_skill_a3', lv.talent),
    mult('castorice', 'mem_skill_a4', lv.talent),
  ]
  const frac = ramp[Math.min(rt.nwLaunches ?? 0, ramp.length - 1)]
  rt.nwLaunches = (rt.nwLaunches ?? 0) + 1
  for (const e of sim.livingEnemiesOf(owner))
    sim.hit(nw, e, { type: 'fua', elem: 'Quantum', flat: hpBase(sim, owner, frac) * e1Mul(e, eid), label: 'Breath Scorches (AoE)', memoSkill: true, toughDmg: BREATH_TOUGH, ...(eid >= 6 ? { pierceRatio: 1 } : null) })
  // bonus_abilities[1] "Inverted Torch", 2nd clause: "When Netherwing uses 'Breath Scorches the Shadow' and deals
  // fatal damage to all enemies on the field or brings them to a point where their HP cannot be reduced further,
  // Netherwing's SPD increases by 100%, lasting for 1 turn." -> every living enemy at (near) zero HP.
  if (!sim.livingEnemiesOf(owner).length)
    sim.addBuff(nw, { id: 'cast_torch_wing', name: 'Inverted Torch', mods: [{ stat: 'spdPct', value: 1.0 }], turns: 1 })
  if (nw.hp > barAfterCost) {
    sim.log(`Netherwing: mid-turn healing rejected (+${nw.hp - barAfterCost} HP above the bar this turn, bar stays ${barAfterCost})`)
    sim.hpChange(nw, barAfterCost - nw.hp, 'set')
  }
  return false
}

/** 1140701 "Claw Splits the Veil" [Servant, AoEAttack]: "Deals Quantum DMG equal to #1[f1]% of Castorice's
 *  Max HP to all enemies", param ladder 0.2→0.56 over the Memosprite Skill's 10 levels, stance [0,30,0].
 *  It is the turn closer: 1140702's notes say "Netherwing's turn will not end until 'Claw Splits the Veil'
 *  is used, 'Wings Sweep the Ruins' is triggered, or if all enemies present on the field are killed by this
 *  Skill" — so a Breath chain that runs out of HP budget while the wing is still above the 25% payout line
 *  (i.e. a fed wing) ends its turn on Claw. That case is unreachable now (mid-turn healing is rejected, so a
 *  340 bar always reaches the payout line first), hence the white-box coverage. Unlike Breath it costs no HP,
 *  and it is its own activation (`newAttack`) so it cannot inherit or open a press chain.
 *  E1 (ranks.1 lists Claw) is resolved per enemy like the other wing attacks; E6's type-agnostic Toughness
 *  applies too ("Netherwing's attacks"). It does NOT stack West Wind and does NOT arm Inverted Torch's 2nd
 *  clause — both texts name Breath explicitly — but the Wind buff itself (dmgAll on the wing, "lasting until
 *  the end of this turn") does ride on it. */
export function clawSplitsVeil(sim: SimApi, nw: Unit, owner: Unit, lv: ReturnType<typeof levelsOf>, eid: number): void {
  sim.newAttack()
  const frac = mult('castorice', 'mem_claw', lv.talent)
  for (const e of sim.livingEnemiesOf(owner))
    sim.hit(nw, e, { type: 'fua', elem: 'Quantum', flat: hpBase(sim, owner, frac) * e1Mul(e, eid), label: 'Claw Splits the Veil', toughDmg: CLAW_TOUGH, ...(eid >= 6 ? { pierceRatio: 1 } : null) })
  sim.log(`Netherwing: Claw Splits the Veil (${Math.round(frac * 100)}% of Castorice MaxHP, all enemies, 30 Toughness)`)
}

export const castoriceKit: KitDef = {
  id: 'castorice',
  name: 'Castorice',
  elem: 'Quantum',
  energyMax: 99999, // Newbud gate replaces Energy (ultimate costs full Newbud)
  // canon (Energy.md): Castorice does not use the Energy system — Newbud gate mirrors decide;
  // no sp_base +5 after the cast
  ultActivation: { kind: 'ready', check: (sim, u) => {
    const rt = sim.rt(u) as { newbud?: number }
    return (rt.newbud ?? 0) >= MAX_NEWBUD && sim.livingEnemiesOf(u).length > 0
  } },
  ultConsumption: 'none',
  base: { ...PROG.castorice.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  technique: {
    name: "Wail, Death's Herald",
    kind: 'attack',
    apply(sim, u, ctx) {
      const nw = summonNetherwing(sim, u, ctx) // summons + advances 100% + deploys Territory
      if (nw) nw.hp = Math.round(MAX_NEWBUD * 0.5) // #2: current HP = 50% of max Newbud
      for (const a of sim.allies('ally')) {
        if (a.kind === 'summon' || a.dead) continue
        sim.hpChange(a, -Math.round(a.hp * 0.4), 'cost') // #1: consumes 40% of current HP
      }
      sim.log(`${u.name} Technique: Wail, Death's Herald (Netherwing at ${Math.round(MAX_NEWBUD * 0.5)} HP, allies -40% HP)`)
    },
  },
  onStart(sim, u, ctx) {
    refreshRt(u, sim)
    // E6 "Await for Years to Loom": Quantum RES PEN +20% for Castоrice herself (the wing gets its own copy at summon).
    if (((ctx.eidolon as number) ?? 0) >= 6)
      sim.addBuff(u, { id: 'cast_e6_respen', name: 'Await for Years to Loom', mods: [{ stat: 'resPen:Quantum', value: E6_RES_PEN }], turns: Infinity })
    // E4 "Rest in Songs of Gloom": "While Castorice is on the field, all allies' HP restored when receiving
    // healing increases by 20%" -> inHeal, the IHB term sim.heal reads.
    if (((ctx.eidolon as number) ?? 0) >= 4)
      for (const a of sim.allies(u.side))
        if (a.kind === 'char') sim.addBuff(a, { id: 'cast_e4_ihb', name: 'Rest in Songs of Gloom', mods: [{ stat: 'inHeal', value: E4_INHEAL }], turns: Infinity })
    // bonus_abilities[1] "Inverted Torch": HP >= 50% of Max HP => SPD +40%, re-gated each turn
    // (HP moves on her own from Boneclaw's drain and from healing).
    if (u.hp / u.maxHp >= 0.5) sim.addBuff(u, { id: 'cast_spd', name: 'Inverted Torch', mods: [{ stat: 'spdPct', value: 0.40 }] })
  },
  onTurnStart(sim, u, _ctx) {
    const has = u.buffs.some(b => b.id === 'cast_spd')
    const gate = u.hp / u.maxHp >= 0.5
    if (gate && !has) sim.addBuff(u, { id: 'cast_spd', name: 'Inverted Torch', mods: [{ stat: 'spdPct', value: 0.40 }] })
    else if (!gate && has) sim.removeBuff(u, 'cast_spd')
  },
  /** Talent 140704: "For every 1 point of HP lost by all allies, Castorice gains 1 point of 'Newbud'" and
   *  "When allies lose HP, [her] and Netherwing's DMG dealt increases" — both fire for HP lost by ANY cause
   *  (combat damage, DoT, kit drains/costs), which is what `sim.fireAllyHpLoss` announces. The Netherwing
   *  clause (HP to the wing instead of Newbud) lives in `creditDrain`. */
  onAllyHpLoss(sim, u, _target, amt, ctx) {
    creditDrain(sim, u, amt)
    stackTalentDmg(sim, u, ctx)
  },
  /** bonus_abilities[0] "Contained Dark Tide": "After ally targets (excluding Netherwing) receive healing,
   *  converts 100% of the healed amount into 'Newbud.' If Netherwing is on the field, this is converted to
   *  Netherwing's HP instead. Each ally target can accumulate a conversion amount up to 12% of the max
   *  'Newbud.' After any unit takes action, all units reset their accumulated conversion amount."
   *  `amount` is the HP actually restored (sim.heal passes the post-cap delta), so overheal never feeds it.
   *  The wing-HP branch is `creditDrain`'s. `onAllyHeal` carries no owner parameter, hence the roster find. */
  onAllyHeal(sim, target, amount, ctx) {
    if (amount <= 0) return
    const u = sim.allies('ally').find(a => a.kitId === 'castorice' && !a.dead)
    if (!u) return
    const toWing = netherwingOf(sim, u)
    // "excluding Netherwing" — by identity, not by kind: any other ally summon is a valid target.
    if (toWing && target.id === toWing.id) return
    const rt = ctx as { cdtAcc?: Record<string, number> }
    const acc = (rt.cdtAcc ??= {})
    const used = acc[target.id] ?? 0
    if (used >= CDT_ACC_CAP) return
    const room = Math.min(amount, CDT_ACC_CAP - used)
    acc[target.id] = used + room
    creditDrain(sim, u, room)
    sim.log(`Contained Dark Tide: ${target.name} healed ${amount} -> ${Math.round(room)} ${toWing ? 'Netherwing HP' : 'Newbud'} (${Math.round(acc[target.id])}/${CDT_ACC_CAP})`)
  },
  /** "After any unit takes action, all units reset" — this fires for every OTHER actor (ally, enemy,
   *  summon, timer, Aha); her own turn is covered by onTurnEnd, Netherwing's by onSummonTurn. */
  onAllyActionEnd(_sim, _actor, ctx) {
    ;(ctx as { cdtAcc?: Record<string, number> }).cdtAcc = {}
  },
  onTurnEnd(_sim, _u, ctx) {
    ;(ctx as { cdtAcc?: Record<string, number> }).cdtAcc = {}
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) < 0) return { kind: 'basic' }
    const rt = refreshRt(u, sim)
    if (rt.newbud! >= MAX_NEWBUD && sim.livingEnemiesOf(u).length) return { kind: 'ult' }
    // Skill is free (bp_need:-1 in canon). With Netherwing on field it becomes Boneclaw Joint ATK.
    return { kind: 'skill' }
  },
  onSummonTurn(sim, nw, owner, ctx) {
    // Netherwing's own action ends the accumulation window too (its turn is an action like any other).
    ;(ctx as { cdtAcc?: Record<string, number> }).cdtAcc = {}
    // bonus_abilities[2] "lasts until the end of this turn": every Breath happens inside this one wing
    // turn, so the stacks are per-turn — cleared here rather than relying on summon buff expiry.
    sim.removeBuff(nw, 'cast_wind')
    const rt = sim.rt(nw) as { nwLaunches?: number; nwTurns?: number; windStacks?: number }
    rt.windStacks = 0
    // The ramp is per-attack too: 1140702 "in one attack, 'Breath Scorches the Shadow' can be launched
    // repeatedly, with the DMG multiplier increased progressively to #2/#3/#4" — a fresh press chain of a
    // NEW turn starts at #2 again. (Unobservable now: a life is one turn, see below — white-boxed on re-summon.)
    rt.nwLaunches = 0
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    // Ult 140703 #2: "After Netherwing experiences #2 turns ... it disappears and dispels Lost Netherland".
    rt.nwTurns = (rt.nwTurns ?? 0) + 1
    // 1140702 notes: "Netherwing's turn will not end until 'Claw Splits the Veil' is used, 'Wings Sweep the
    // Ruins' is triggered, or if all enemies present on the field are killed by this Skill." So the wing keeps
    // pressing Breath for as long as the presses pay normally (HP > 25% of Max HP), and the press that finds it
    // at the line drops it to 1 HP and pays out — inside that same turn. From a full bar: 3 damaging Breaths
    // (340 → 255 → 170 → 85) then the 4th press pays out, which is what the game shows. Only a heal of the wing
    // itself (a Besotted attacker, an ally healer, or 140704 ally HP loss while it is alive) keeps it past that.
    // Mooncocoon is the opposite: it moves ally damage ONTO the wing, so it feeds the bar by draining allies, not
    // by healing it.
    // nothing can feed the wing mid-turn any more — breathScorches pins the bar to its post-cost value
    // and rejects the difference, so a life is 3 Breaths + the payout press and the cap below is never reached.
    // Both the per-press attack boundary and NW_MAX_LAUNCHES stay in place for the canon case (a source of
    // between-turn refills would bring the fed chain back, and canon's closer for that leftover turn is Claw).
    for (let guard = 0; guard < NW_MAX_LAUNCHES; guard++) {
      if (!sim.livingEnemiesOf(owner).length) break
      // a press that reaches the 25% line pays out (Wings) and takes the wing off the field: the turn is over
      if (breathScorches(sim, nw, owner, ctx, lv, eid, rt)) return
    }
    // 1140702 notes again: the turn may not end without Claw, Wings or all enemies dead. The payout returned
    // above and the all-dead break cover the other two, so what is left is a chain that ran out of HP budget
    // with the wing still alive and above the line — canon closes that on Claw. DEAD BRANCH: a 340 bar cannot
    // run out of HP budget, so this only fires if the cap is raised or the bar is refilled. Turn 3 is excluded:
    // "In the third turn of Netherwing after it's summoned, it can only launch 'Breath Scorches the Shadow'
    // repeatedly until 'Wings Sweep the Ruins' is triggered."
    if (rt.nwTurns! < NW_LIFESPAN_TURNS && sim.find(nw.id) && sim.livingEnemiesOf(owner).length)
      clawSplitsVeil(sim, nw, owner, lv, eid)
    // Lifespan expiry: "After Netherwing experiences #2 turns or when its HP is 0, it disappears and dispels
    // the Territory" — pays Wings out. Only reachable when the turn was cut short (the enemies died mid-chain).
    if (rt.nwTurns >= NW_LIFESPAN_TURNS && sim.find(nw.id)) despawnWing(sim, nw, owner, ctx)
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = refreshRt(u, sim)

    if (action.kind === 'ult') {
      if (rt.newbud! < MAX_NEWBUD) return
      rt.newbud = 0
      sim.log('Castorice Ultimate (Newbud full): summon Netherwing + Lost Netherland')
      // Skill becomes "Boneclaw" via Netherwing presence; ult just (re)summons + advances
      const nw = netherwingOf(sim, u)
      if (!nw) summonNetherwing(sim, u, ctx)
      else { sim.advance(nw, 1.0); applyTerritory(sim, u, ctx) }
      return
    }

    if (action.kind === 'skill') {
      const nw = netherwingOf(sim, u)
      if (!nw) {
        // Silence, Wraithfly's Caress: drain 30% allies, Blast Quantum (HP-scaled)
        // Newbud/DMG+ crediting fires per drained ally through sim.fireAllyHpLoss — no direct call here (double count).
        drainAllies(sim, u, ctx, 0.30, false)
        const main = sim.livingEnemiesOf(u)[0]
        sim.hitBlast(u, main,
          { type: 'skill', elem: 'Quantum', flat: hpBase(sim, u, mult('castorice', 'skill', lv.skill)) * e1Mul(main, eid), toughDmg: 20, label: 'Wraithfly Caress (main)' },
          { type: 'skill', elem: 'Quantum', flat: hpBase(sim, u, mult('castorice', 'skill_a2', lv.skill)), toughDmg: 10, label: 'Wraithfly Caress (adj)' })
        sim.log('Castorice Skill: drain 30% allies HP в†’ Newbud, Quantum Blast')
      } else {
        // Boneclaw Doomdrake's Embrace (Netherwing on field): drain 40% allies (except nw), Joint ATK all
        drainAllies(sim, u, ctx, 0.40, true)
        for (const e of sim.livingEnemiesOf(u)) {
          const em = e1Mul(e, eid)
          sim.hit(u, e, { type: 'skill', elem: 'Quantum', flat: hpBase(sim, u, mult('castorice', 'skill_a3', lv.skill)) * em, toughDmg: 15, label: 'Boneclaw (Castorice)' })
          // E6: "During Netherwing's attacks, can reduce enemy Toughness regardless of Weakness Types" - the
          // wing's half only (Castоrice's own hit keeps its Quantum weakness typing).
          sim.hit(nw, e, { type: 'fua', elem: 'Quantum', flat: hpBase(sim, u, mult('castorice', 'skill_a4', lv.skill)) * em, toughDmg: 15, label: 'Boneclaw (Netherwing)', ...(eid >= 6 ? { pierceRatio: 1 } : null) })
        }
        sim.log('Castorice Skill: Boneclaw Joint ATK (Netherwing) all enemies')
        // E2: "When using the next Enhanced Skill, Castorice gains 'Newbud' by 30% of max 'Newbud'." Boneclaw is
        // the Enhanced Skill, so the grant lands here and only once per summon.
        const ort = refreshRt(u, sim)
        if (eid >= 2 && ort.ardentNewbud) {
          ort.ardentNewbud = false
          addNewbud(sim, u, Math.round(MAX_NEWBUD * ARDENT_NEWBUD_PCT))
          sim.log(`Ardent Will (E2): Enhanced Skill granted ${Math.round(MAX_NEWBUD * ARDENT_NEWBUD_PCT)} Newbud`)
        }
      }
      return
    }

    // Basic: Lament Nethersea's Ripple, Quantum HP-scaled
    sim.gainSp(1)
    sim.hit(u, sim.livingEnemiesOf(u)[0], { type: 'basic', elem: 'Quantum', flat: hpBase(sim, u, mult('castorice', 'basic', lv.basic)), toughDmg: 10, label: 'Nethersea Ripple' })
  },
}


// ===== evernight  (was evernight.ts) =====
const MEMORIA_CAP = 16

function lowestHp_evernight(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}

function eveyOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`evey_${u.id}`)
}

/** All ally memosprites on the field (any summon whose owner is a live ally char). */
function allySummons(sim: SimApi): Unit[] {
  return sim.units().filter(x => x.side === 'ally' && x.kind === 'summon' && !x.dead)
}

/** Count ally Remembrance-path chars (A2 "Kindle the Morn" CD bonus tiers). */
function remembranceCount(sim: SimApi): number {
  return sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.base.path === 'Remembrance').length
}

/** Re-derive Evey's combat stats from Evernight (Summon.md: summons "use the current
 *  stats of their characters"). Evey SPD = Talent #4 (flat 160), Max HP = Talent #5 (50%)
 *  of Evernight Max HP. DMG is HP-scaled so ATK is irrelevant; CRIT mirrors Evernight. */
function refreshEvey(sim: SimApi, u: Unit, evey: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const ghp = Math.max(1, Math.round(eu.hp * mult('evernight', 'talent_a5', lv.talent)))
  const ratio = evey.maxHp > 0 ? evey.hp / evey.maxHp : 1
  evey.base.hp = ghp
  evey.maxHp = ghp
  evey.hp = Math.max(1, Math.round(ghp * ratio))
  if (evey.base.spd !== mult('evernight', 'talent_a4', lv.talent))
    sim.setSpeedDynamic(evey, mult('evernight', 'talent_a4', lv.talent))
  evey.base.atk = eu.atk
  // eff(u) is buff-INCLUSIVE and Evernight holds its own copies of the same buffs;
  // mirroring it into base double-counts the overlap. See aglaea.ts:refreshGm.
  evey.base.critRate = eu.critRate - buffSum(evey.buffs, 'critRate')
  evey.base.critDmg = eu.critDmg - buffSum(evey.buffs, 'critDmg')
  evey.base.level = u.base.level
}

/** A0 CRIT Rate +35% on Evernight and Evey. Applies on every summon, so a re-summoned Evey
 *  after a mid-battle death gets it too (onStart-only let it ride in dead). */
function applyA0Cr(sim: SimApi, u: Unit): void {
  const eve = eveyOf(sim, u)
  for (const t of [u, eve]) {
    if (!t) continue
    sim.removeBuff(t, 'ev_a0_cr')
    sim.addBuff(t, { id: 'ev_a0_cr', name: 'Dark the Night, Still the Moon', mods: [{ stat: 'critRate', value: 0.35 }], turns: Infinity })
  }
}

/** Summon Evey. `immediate` = mid-battle summon → Evey acts right now (memosprite talent
 *  "Night, Trailing, In Step"). Battle-start summon (onStart) just advances Evey forward.
 *  `preBuffs` = Skill-granted memosprite buffs applied to the fresh summons before it acts
 *  (so Dream/Whirling Rain benefit on that same skill, canon: skill buffs memosprites). */
function summonEvey(sim: SimApi, u: Unit, ctx: KitRuntime, immediate: boolean, preBuffs?: Buff[]): Unit | undefined {
  const eve = eveyOf(sim, u)
  if (eve) return eve
  const lv = levelsOf(ctx)
  const evU: Unit = {
    id: `evey_${u.id}`, name: 'Evey', side: 'ally', kind: 'summon', elem: 'Ice',
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: 1 },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId, aggro: Math.round(125 * mult('evernight', 'mem_talent_a2', 1)),
  }
  const rt = sim.rt(evU)
  rt.ownerId = u.id
  refreshEvey(sim, u, evU, ctx)
  sim.registerUnit(evU)
  sim.fireMemospriteSummon(u)
  applyA0Cr(sim, u)
  // E1/E2/E4 re-apply to a mid-battle summon (E5 ranks the fresh memosprite too)
  refreshE1(sim, u)
  applyE2(sim, u)
  applyE4(sim, u)
  applyE6(sim, u)
  // Solitude, Drifting, In Murk: while Evey on field Evernight & Evey deal +#1 DMG
  const soloDmg = mult('evernight', 'mem_talent', lv.talent)
  sim.removeBuff(u, 'ev_solitude')
  sim.addBuff(u, { id: 'ev_solitude', name: 'Solitude, Drifting, In Murk', mods: [{ stat: 'dmgAll', value: soloDmg }], turns: Infinity })
  sim.removeBuff(evU, 'ev_solitude')
  sim.addBuff(evU, { id: 'ev_solitude', name: 'Solitude, Drifting, In Murk', mods: [{ stat: 'dmgAll', value: soloDmg }], turns: Infinity })
  if (immediate) {
    for (const b of preBuffs ?? []) sim.addBuff(evU, b)
    sim.grantExtraTurn(evU)
    // grantExtraTurn leaves av=0 → would act again on the next loop pass;
    // real kit: after the immediate action Evey returns to her own SPD-160 turn.
    evU.av = sim.baseAv(evU)
  } else {
    sim.advance(evU, 1.0)
  }
  sim.log(`${u.name} summons memosprite Evey (SPD ${evU.base.spd}, HP ${evU.maxHp})`)
  return evU
}

/** Memosprite talent "You, Parting, Beyond Reach": Evey disappears → Evernight SPD +#1;
 *  via Dream → extra +#2 per Memoria consumed (cap #3). Non-stack, removed at start of
 *  Evernight's next turn (handled in onTurnStart). */
function applyParting(sim: SimApi, u: Unit, ctx: KitRuntime, viaDream: boolean, memoriaConsumed: number): void {
  const lv = levelsOf(ctx)
  let spd = mult('evernight', 'mem_talent_en2', lv.talent)
  if (viaDream) spd += Math.min(mult('evernight', 'mem_talent_en2_a3', lv.talent), memoriaConsumed) * mult('evernight', 'mem_talent_en2_a2', lv.talent)
  sim.removeBuff(u, 'ev_parting')
  sim.addBuff(u, { id: 'ev_parting', name: 'You, Parting, Beyond Reach', mods: [{ stat: 'spdPct', value: spd }], turns: Infinity })
  sim.log(`${u.name}: Evey parted${viaDream ? ' via Dream' : ''}; SPD+${(spd * 100).toFixed(1)}% (until next turn)`)
}

/** Detect Evey gone (death/silent despawn) at Evernight's turn start; non-Dream parting. */
function eveyDeath(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const eve = eveyOf(sim, u)
  if (eve && !eve.dead) return
  if (eve) {
    sim.fireMemospriteDisappear(u)
    sim.unregisterUnit(eve.id)
  }
  sim.removeBuff(u, 'ev_solitude')
  applyParting(sim, u, ctx, false, 0)
}

/** Memoria gain (E2: +2 to every gain; cap). Reaching ≥16 → Evey immediately acts,
 *  re-arms only after Dream consumes Memoria. CC-dispel/immunity = no-op (no ally CC). */
function gainMemoria(sim: SimApi, u: Unit, ctx: KitRuntime, base: number): void {
  const eid = (ctx.eidolon as number) ?? 0
  const amount = base + (eid >= 2 ? 2 : 0)
  const rt = sim.rt(u)
  const cur = (rt.everMemoria as number) ?? 0
  const next = Math.min(MEMORIA_CAP, cur + amount)
  rt.everMemoria = next
  const eve = eveyOf(sim, u)
  if (next > cur) sim.log(`${u.name} Memoria: ${cur} → ${next} (+${amount})`)
  if (next >= MEMORIA_CAP && eve && !eve.dead && !(rt.everImmediate as boolean)) {
    rt.everImmediate = true
    sim.log(`${u.name}: Memoria full — Evey immediately takes action`)
    sim.grantExtraTurn(eve)
    // grantExtraTurn leaves av=0 → would act again on the next loop pass
    eve.av = sim.baseAv(eve)
  }
}

/** Talent "With Me, This Night": each Evernight/Evey HP-loss event → +Memoria and
 *  Evernight & Evey CRIT DMG up (Talent #2) for Talent #3 turns (stackable). */
function onHpLoss(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  gainMemoria(sim, u, ctx, mult('evernight', 'talent', lv.talent))
  const eve = eveyOf(sim, u)
  const cdBuff = (): Buff => ({
    id: 'ev_cd', name: 'With Me, This Night',
    mods: [{ stat: 'critDmg', value: mult('evernight', 'talent_a2', lv.talent) }],
    turns: mult('evernight', 'talent_a3', lv.talent), maxStacks: 99,
  })
  sim.addBuff(u, cdBuff())
  if (eve) sim.addBuff(eve, cdBuff())
}

/** E2: Evernight & Evey CRIT DMG +40% (static while on field). */
function applyE2(sim: SimApi, u: Unit): void {
  const eid = (sim.rt(u).eidolon as number) ?? 0
  if (eid < 2) return
  const eve = eveyOf(sim, u)
  sim.removeBuff(u, 'ev_e2')
  sim.addBuff(u, { id: 'ev_e2', name: 'Listen Up, the Slumber Speaks Soft', mods: [{ stat: 'critDmg', value: 0.4 }], turns: Infinity })
  if (eve) { sim.removeBuff(eve, 'ev_e2'); sim.addBuff(eve, { id: 'ev_e2', name: 'Listen Up, the Slumber Speaks Soft', mods: [{ stat: 'critDmg', value: 0.4 }], turns: Infinity }) }
}

/** E1: ally memosprites deal more DMG by enemy count (≥4:120% / 3:125% / 2:130% / 1:150%). */
function refreshE1(sim: SimApi, u: Unit): void {
  const eid = (sim.rt(u).eidolon as number) ?? 0
  if (eid < 1) return
  const n = sim.livingEnemiesOf(u).length
  const base = n >= 4 ? 1.2 : n === 3 ? 1.25 : n === 2 ? 1.3 : 1.5
  for (const s of allySummons(sim)) {
    sim.removeBuff(s, 'ev_e1')
    sim.addBuff(s, { id: 'ev_e1', name: 'Sleep Tight, the Night Dreams Long', mods: [{ stat: 'dmgAll', value: base - 1 }], turns: Infinity })
  }
}

/** E4: ally memosprites Weakness Break Efficiency +25%, Evey an extra +25%. */
function applyE4(sim: SimApi, u: Unit): void {
  const eid = (sim.rt(u).eidolon as number) ?? 0
  if (eid < 4) return
  for (const s of allySummons(sim)) {
    sim.removeBuff(s, 'ev_e4')
    sim.addBuff(s, { id: 'ev_e4', name: 'Wake Up, the Tomorrow is Yours', mods: [{ stat: 'wbe', value: 0.25 }], turns: Infinity })
  }
  const eve = eveyOf(sim, u)
  if (eve) {
    sim.removeBuff(eve, 'ev_e4x')
    sim.addBuff(eve, { id: 'ev_e4x', name: 'Wake Up, the Tomorrow is Yours', mods: [{ stat: 'wbe', value: 0.25 }], turns: Infinity })
  }
}

/** E6: all ally targets All-Type RES PEN +20% while Evernight is on the field. */
function applyE6(sim: SimApi, u: Unit): void {
  const eid = (sim.rt(u).eidolon as number) ?? 0
  if (eid < 6) return
  for (const a of sim.allies('ally')) {
    if (a.dead) continue
    sim.removeBuff(a, 'ev_e6')
    sim.addBuff(a, { id: 'ev_e6', name: 'Like This, Always', mods: [{ stat: 'resPenAll', value: 0.2 }], turns: Infinity })
  }
}

/** A0 "Dark the Night, Still the Moon": each Evernight ability → lose 5% current HP →
 *  CRIT DMG +15% for Evernight & Evey, 2 turns. (HP loss also feeds the Talent.)
 *  CRIT Rate +35% both applied at battle start (onStart). After Dream → +1 SP (Dream branch). */
function a0Ability(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const cost = Math.max(0, Math.round(eff(u).hp * 0.05))
  if (cost > 0) {
    sim.hpChange(u, -cost, 'cost')
    sim.fireAllyHpLoss(u, cost)
    onHpLoss(sim, u, ctx)
    sim.log(`${u.name} A0: loses ${cost} HP (5% current)`)
  }
  const eve = eveyOf(sim, u)
  const cd = 0.15
  sim.removeBuff(u, 'ev_a0_cd')
  sim.addBuff(u, { id: 'ev_a0_cd', name: 'Dark the Night, Still the Moon', mods: [{ stat: 'critDmg', value: cd }], turns: 2 })
  if (eve) { sim.removeBuff(eve, 'ev_a0_cd'); sim.addBuff(eve, { id: 'ev_a0_cd', name: 'Dark the Night, Still the Moon', mods: [{ stat: 'critDmg', value: cd }], turns: 2 }) }
}

/** A1 "Rouse the Flame, Lull the Light": Evernight (or Evey, see eveyAct) uses an ability →
 *  Evernight +5 Energy +1 Memoria.  Battle-start +70 EN +1 Memoria applied in onStart. */
function a1Ability(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  sim.gainEnergy(u, 5)
  gainMemoria(sim, u, ctx, 1)
}

/** A2 "Kindle the Morn, Drop the Rain": 1/2/3/4+ Remembrance chars → ally memosprites
 *  CRIT DMG +5/15/50/65% while the Skill buff lasts. Applied in doSkill. */
function a2Kindle(sim: SimApi, u: Unit, ctx: KitRuntime, turns: number): void {
  const cnt = remembranceCount(sim)
  const cb = cnt >= 4 ? 0.65 : cnt === 3 ? 0.5 : cnt === 2 ? 0.15 : 0.05
  for (const s of allySummons(sim)) {
    sim.removeBuff(s, 'ev_a2_cd')
    sim.addBuff(s, { id: 'ev_a2_cd', name: 'Kindle the Morn, Drop the Rain', sourceId: u.id, tickOnSource: true, mods: [{ stat: 'critDmg', value: cb }], turns, maxStacks: 1 })
  }
}

/** Skill "Day Gently Slips": free, no SP. */
function doSkill(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(u)
  const eve = eveyOf(sim, u)
  // consume current HP (#6) to summon Evey if absent (mid-battle → Evey acts immediately)
  const costPct = mult('evernight', 'skill_a6', lv.skill)
  const cost = Math.max(0, Math.round(eff(u).hp * costPct))
  const cdMul = mult('evernight', 'skill', lv.skill) * eff(u).critDmg
  const turns = mult('evernight', 'skill_a2', lv.skill)
  // memosprite buffs the Skill grants (#1 CD by Evernight CD, A2 Kindle by Remembrance count) —
  // applied BEFORE a freshly-summoned Evey's immediate action so her Dream/Whirling benefits
  const cdBuff = (): Buff => ({ id: 'ev_skill_cd', name: 'Day Gently Slips', sourceId: u.id, tickOnSource: true, mods: [{ stat: 'critDmg', value: cdMul }], turns, maxStacks: 1 })
  if (!eve) {
    if (cost > 0) {
      sim.hpChange(u, -cost, 'cost')
      sim.fireAllyHpLoss(u, cost)
      onHpLoss(sim, u, ctx)
      sim.log(`${u.name} Skill: consumes ${cost} HP to summon Evey`)
    }
    const cnt = remembranceCount(sim)
    const cb = cnt >= 4 ? 0.65 : cnt === 3 ? 0.5 : cnt === 2 ? 0.15 : 0.05
    const kindle: Buff = { id: 'ev_a2_cd', name: 'Kindle the Morn, Drop the Rain', sourceId: u.id, tickOnSource: true, mods: [{ stat: 'critDmg', value: cb }], turns, maxStacks: 1 }
    summonEvey(sim, u, ctx, true, [cdBuff(), kindle])
  } else {
    // Evey already on field → restore it (heal 50% of its Max HP, Skill #4)
    const heal = eve.maxHp * mult('evernight', 'skill_a4', lv.skill)
    sim.heal(eve, heal)
    sim.log(`${u.name} Skill: Evey regains ${heal.toFixed(0)} HP`)
  }
  for (const s of allySummons(sim)) {
    sim.removeBuff(s, 'ev_skill_cd')
    sim.addBuff(s, cdBuff())
  }
  // Skill #3 Memoria (+ #5 extra while in Darkest Riddle)
  gainMemoria(sim, u, ctx, mult('evernight', 'skill_a3', lv.skill))
  if ((rt.darkestRiddle as number) > 0) gainMemoria(sim, u, ctx, mult('evernight', 'skill_a5', lv.skill))
  // A2 "Kindle the Morn": extra memosprite CD by Remembrance count while Skill lasts
  a2Kindle(sim, u, ctx, turns)
  sim.gainEnergy(u, 30)
  a1Ability(sim, u, ctx)
}

/** "Dream, Dissolving, as Dew": per Memoria — primary #1 of Evey Max HP, others #2.
 *  Consumes ALL Memoria + Evey disappears; Darkest Riddle costs 1 Charge; A0 +1 SP;
 *  E6 Evernight regains 30% of Memoria consumed. */
function eveyDream(sim: SimApi, summon: Unit, owner: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(owner)
  const n = (rt.everMemoria as number) ?? 0
  rt.everMemoria = 0
  rt.everImmediate = false
  let t = (() => {
    const lt = sim.find((rt.everLastTarget as string) ?? '')
    if (lt && lt.side === 'enemy' && !lt.dead) return lt
    return lowestHp_evernight(sim, owner)
  })() ?? undefined
  if (!t) t = lowestHp_evernight(sim, owner)
  const enemies = sim.livingEnemiesOf(owner)
  sim.log(`-- Evey uses Dream, Dissolving, as Dew (×${n} Memoria)`)
  if (t) sim.hit(summon, t, { type: 'fua', elem: 'Ice', mult: mult('evernight', 'mem_skill_en', lv.skill) * n, scaleStat: 'hp', toughDmg: 30, memoSkill: true, label: 'Dream, Dissolving, as Dew' })
  for (const e of enemies) {
    if (e === t) continue
    sim.hit(summon, e, { type: 'fua', elem: 'Ice', mult: mult('evernight', 'mem_skill_en_a2', lv.skill) * n, scaleStat: 'hp', toughDmg: 15, memoSkill: true, label: 'Dream, Dissolving, as Dew' })
  }
  // Evey disappears
  sim.fireMemospriteDisappear(owner)
  sim.unregisterUnit(summon.id)
  sim.removeBuff(owner, 'ev_solitude')
  applyParting(sim, owner, ctx, true, n)
  // A0: after Dream → +1 SP
  sim.gainSp(1)
  sim.log(`${owner.name} A0: +1 SP (Dream)`)
  // Darkest Riddle consumes 1 Charge; exit at Evernight's turn start when 0 (onTurnStart)
  if ((rt.darkestRiddle as number) > 0) {
    rt.darkestRiddle = (rt.darkestRiddle as number) - 1
    sim.log(`${owner.name} Darkest Riddle Charge: ${(rt.darkestRiddle as number) + 1} → ${rt.darkestRiddle}`)
  }
  // E6: regain 30% of Memoria consumed
  if (eid >= 6) {
    gainMemoria(sim, owner, ctx, Math.round(n * 0.3))
    sim.log(`${owner.name} E6: regained 30% of Memoria consumed`)
  }
}

/** Evey's turn (timeline or grantExtraTurn): Whirling Rain or, at ≥16 Memoria, Dream. */
function eveyAct(sim: SimApi, summon: Unit, owner: Unit, ctx: KitRuntime): void {
  // owner-dead fallback (summonTurn/perform resolve `?? s` / `?? u` to the summon
  // itself) must not act — rt(summon) has no everMemoria, and even if it did the memosprite
  // has no master to draw stats from. Canon: memosprite vanishes/idles with its owner down.
  if (!owner || owner.kind !== 'char' || owner.dead) {
    sim.log(`${summon.name} idles: owner is down`)
    return
  }
  const lv = levelsOf(ctx)
  const rt = sim.rt(owner)
  refreshEvey(sim, owner, summon, ctx)
  const src = rt.everMemoria as number
  if (src >= MEMORIA_CAP) {
    eveyDream(sim, summon, owner, ctx)
    return
  }
  // "Remembrance, Whirling, Like Rain": single target, enemy Evernight last hit if alive;
  // + extra per 4 Memoria; +1 Memoria after use
  let t = (() => {
    const lt = sim.find((rt.everLastTarget as string) ?? '')
    if (lt && lt.side === 'enemy' && !lt.dead) return lt
    return lowestHp_evernight(sim, owner)
  })() ?? undefined
  if (!t) t = lowestHp_evernight(sim, owner)
  if (!t) return
  t = manualTarget(sim, { kind: 'skill' }, t)
  const extra = Math.floor(src / mult('evernight', 'mem_skill_a3', lv.skill)) * mult('evernight', 'mem_skill_a2', lv.skill)
  sim.hit(summon, t, { type: 'fua', elem: 'Ice', mult: mult('evernight', 'mem_skill', lv.skill) + extra, scaleStat: 'hp', toughDmg: 20, memoSkill: true, label: 'Remembrance, Whirling, Like Rain' })
  sim.log(`-- Evey uses Remembrance, Whirling, Like Rain (on ${t.name}, +extra ${(extra * 100).toFixed(1)}%)`)
  gainMemoria(sim, owner, ctx, mult('evernight', 'mem_skill_a4', lv.skill))
}

export const evernightKit: KitDef = {
  id: 'evernight',
  name: 'Evernight',
  elem: 'Ice',
  energyMax: 240,
  base: { ...PROG.evernight.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  // #221107 "Let it Rain Cold On Thee" (Technique): at battle start, grant ally memosprites the Skill's
  // CRIT DMG buff (Day Gently Slips) and gain 1 Memoria.
  technique: {
    name: 'Let it Rain Cold On Thee',
    kind: 'buff',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const cdMul = mult('evernight', 'skill', lv.skill) * eff(u).critDmg
      const turns = mult('evernight', 'skill_a2', lv.skill)
      for (const s of allySummons(sim)) {
        sim.removeBuff(s, 'ev_skill_cd')
        sim.addBuff(s, { id: 'ev_skill_cd', name: 'Day Gently Slips', sourceId: u.id, tickOnSource: true, mods: [{ stat: 'critDmg', value: cdMul }], turns, maxStacks: 1 })
      }
      gainMemoria(sim, u, ctx, 1)
      sim.log('Evernight Technique: memosprites +CRIT DMG, +1 Memoria')
    },
  },

  onStart(sim, u, ctx) {
    u.aggro = 100
    sim.rt(u).everMemoria = 0
    sim.rt(u).darkestRiddle = 0
    sim.rt(u).everImmediate = false
    const eve = summonEvey(sim, u, ctx, false)
    if (eve) sim.heal(eve, eve.maxHp)
    applyE2(sim, u)
    applyE4(sim, u)
    applyE6(sim, u)
    refreshE1(sim, u)
    // A0: CRIT Rate +35% both (applied by summonEvey, which runs first) / A1: +70 EN +1 Memoria at battle start
    sim.gainEnergy(u, 70)
    gainMemoria(sim, u, ctx, 1)
    sim.log(`${u.name} enters combat; Evey summoned (A0 CR+, A1 +70 EN +1 Memoria)`)
  },

  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u)
// Darkest Riddle drops when no Charge remains at Evernight's turn start.
  // (Solitude persists while Evey is fielded — NOT removed here; handled on Evey death/Dream.)
  if ((rt.darkestRiddle as number) <= 0) {
    sim.removeBuff(u, 'ev_dr_atk')
    const eve = eveyOf(sim, u)
    if (eve) sim.removeBuff(eve, 'ev_dr_atk')
    for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, 'ev_dr_vuln')
    if (rt.drLogged !== true) sim.log('Darkest Riddle ends')
    rt.drLogged = true
  } else {
    rt.drLogged = false
  }
    // Parting SPD buff removed at the start of Evernight's next turn
    sim.removeBuff(u, 'ev_parting')
    eveyDeath(sim, u, ctx)
  },

  decide(sim, u, _ctx) {
    if (u.kind === 'summon') return { kind: 'basic' }
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // Skill is free (no SP) and either summons/heals Evey + buffs memosprites → prefer it.
    // Basic only when HP is dangerously low (skill self-cost could kill).
    if (u.hp > u.maxHp * 0.15) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    if (u.kind === 'summon') {
      const owner = sim.find(sim.rt(u).ownerId as string) ?? u
      // grantExtraTurn path skips summonTurn → fire the memosprite-turn hook here
      // (timeline turns already fire it in simulator.summonTurn)
      sim.fireMemospriteTurnStart(owner)
      // ctx here is the summon's rt (eidolon-less on grantExtraTurn); use the owner's rt
      eveyAct(sim, u, owner, sim.rt(owner))
      return
    }
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const eve = summonEvey(sim, u, ctx, false)
      // Evey attacks all enemies: Ice DMG = Ult #1 of Evey's Max HP (Evey is the attacker)
      for (const e of enemies)
        sim.hit(eve!, e, { type: 'ult', elem: 'Ice', mult: mult('evernight', 'ult', lv.ult), scaleStat: 'hp', toughDmg: 30, label: 'O Wakeful World, Goodnight' })
      rt.everLastTarget = enemies[0].id
      if (eve) refreshEvey(sim, u, eve, ctx)
      // Enter "Darkest Riddle" (Charge system): ult gains +#2 Charge, E2 +2 more
      rt.darkestRiddle = (rt.darkestRiddle as number) + mult('evernight', 'ult_a2', lv.ult) + ((ctx.eidolon as number) >= 2 ? 2 : 0)
      sim.removeBuff(u, 'ev_dr_atk')
      sim.addBuff(u, { id: 'ev_dr_atk', name: 'O Wakeful World, Goodnight', mods: [{ stat: 'dmgAll', value: mult('evernight', 'ult_a3', lv.ult) }], turns: Infinity })
      if (eve) { sim.removeBuff(eve, 'ev_dr_atk'); sim.addBuff(eve, { id: 'ev_dr_atk', name: 'O Wakeful World, Goodnight', mods: [{ stat: 'dmgAll', value: mult('evernight', 'ult_a3', lv.ult) }], turns: Infinity }) }
      for (const e of enemies)
        sim.addBuff(e, { id: 'ev_dr_vuln', name: 'O Wakeful World, Goodnight DMG Taken+', mods: [{ stat: 'vulnAll', value: mult('evernight', 'ult_a4', lv.ult) }], turns: Infinity })
      sim.log(`${u.name} Ultimate: O Wakeful World, Goodnight (Darkest Riddle Charge ${rt.darkestRiddle})`)
      a0Ability(sim, u, ctx)
      a1Ability(sim, u, ctx)
      return
    }

    // Skill is free; skill_en behaves identically.
    if (action.kind === 'skill') {
      doSkill(sim, u, ctx)
      a0Ability(sim, u, ctx)
      return
    }

    // Basic "Time Thence Blurs": Ice DMG of Evernight's Max HP, single target; +20 Energy
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, lowestHp_evernight(sim, u)!)
    sim.hit(u, t, { type: 'basic', elem: 'Ice', mult: mult('evernight', 'basic', lv.basic), scaleStat: 'hp', toughDmg: 10, label: 'Time Thence Blurs' })
    rt.everLastTarget = t.id
    a0Ability(sim, u, ctx)
    a1Ability(sim, u, ctx)
  },

  // Evey's own turn on the timeline → auto attack (Whirling Rain or Dream Dissolving).
  onSummonTurn(sim, summon, owner, ctx) {
    eveyAct(sim, summon, owner, ctx)
  },

  // A1 "Rouse the Flame, Lull the Light" is Evernight OR ANY ally memosprite using an ability.
  // `onSummonTurn` only ever dispatches to the owner's own kit, so Evey's turn used to be the
  // single covered path; the broadcast reaches every memosprite action (AV timeline + inline Extra
  // Turn) and filters enemy summons / `sharesOwnerBuffs` true-summons / timer units.
  onAllyMemospriteAct(sim, u, summon, ctx) {
    a1Ability(sim, u, ctx)
  },

  // Talent CD/Memoria on HP loss: enemy hits on Evernight or Evey (once per target per attack).
  onAllyHit(sim, attacker, target, _dmg, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'evernight' && !a.dead)
    if (!u) return
    const eve = eveyOf(sim, u)
    if (target !== u && target !== eve) return
    if (target.side !== 'ally') return
    const rt = sim.rt(u)
    const key = `${attacker?.id ?? '?'}|${target.id}|${sim.attackNo()}`
    if (rt.everHitKey === key) return
    rt.everHitKey = key
    onHpLoss(sim, u, ctx)
  },

  // Track Evernight's last attacked enemy for Whirling Rain targeting.
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (target.side !== 'enemy' || target.dead || dmgType === 'add') return
    const u = sim.allies('ally').find(a => a.kitId === 'evernight' && !a.dead)
    if (!u || attacker !== u) return
    sim.rt(u).everLastTarget = target.id
    refreshE1(sim, u)
  },
}

// ===== cyrene  (was cyrene.ts) =====
const ULT_REQ = 24
const ULT_COST = 12

/** E4 "Please Write On, With a Smile": Ode to Ego DMG +6% per Minuet use, stacking up to 24. */
const E4_STEP = 0.06
const E4_CAP = 24

/** Chrysos Heir kit ids — cyrene A2 "Ripples Across Time" counts them (Remembrance path included too). */
const CHRYSOS = new Set([
  'cyrene', 'tribbie', 'cerydra', 'evernight', 'danhengperman', 'hysilens', 'hyacine',
  'phainon', 'anaxa', 'aglaea', 'mydei', 'castorice', 'cipher', 'trailblazer_remembrance',
])

/** A3 "Causality in Trichotomy": SPD≥180 → Ice RES PEN +2% per excess SPD for Cyrene + Demiurge (cap 60 SPD). */
function iceResPen(sim: SimApi, u: Unit): number {
  return Math.max(0, Math.min(60, eff(u).spd - 180)) * 0.02
}

/** Cyrene's "energy" IS the Recollection pool (energyMax 24). Clamp at max.
 *  pompay: canon overflow up to +27 (talent_a3) — inert in sim, Reunion only drains 12. */
function gainRec(u: Unit, n: number): void {
  const cap = u.maxEnergy > 0 ? u.maxEnergy : 24
  u.energy = Math.min(cap, u.energy + n)
}

function demiurgeOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`demi_${u.id}`)
}

/** Demiurge immediate action: grantExtraTurn acts inline; then park it off-timeline (SPD 0, no
 *  onSummonTurn → an av=0 timeline pass would only log "no summon turn"). baseAv reset avoids
 *  that zero-AV pass also firing cyrene onTurnStart hooks on the Demiurge. */
function demiAct(sim: SimApi, demi: Unit): void {
  sim.grantExtraTurn(demi)
  if (!demi.dead) demi.av = sim.baseAv(demi)
}

/** A3 gate (re-evaluated each Cyrene turn + on Demiurge summon): SPD≥180 → all allies DMG+20%;
 *  Cyrene + Demiurge Ice RES PEN by excess SPD. */
function a3Gate(sim: SimApi, cy: Unit): void {
  const fast = eff(cy).spd >= 180
  for (const a of sim.allies('ally')) {
    if (a.dead || sim.hasBuff(a, 'cy_a3_team') === fast) continue
    if (fast) sim.addBuff(a, { id: 'cy_a3_team', name: 'Causality in Trichotomy', mods: [{ stat: 'dmgAll', value: 0.2 }], turns: Infinity })
    else sim.removeBuff(a, 'cy_a3_team')
  }
  const pen = iceResPen(sim, cy)
  for (const t of [cy, ...sim.allies('ally').filter(a => a.kind === 'summon' && sim.rt(a).ownerId === cy.id)]) {
    if (t.dead) continue
    sim.removeBuff(t, 'cy_a3_pen')
    if (pen > 0) sim.addBuff(t, { id: 'cy_a3_pen', name: 'Causality in Trichotomy', mods: [{ stat: 'resPen:Ice', value: pen }], turns: Infinity })
  }
}

/** Talent "Hearts Gather as One" passive: while Cyrene on field, all ally targets DMG +talent_a2%. */
function applyAura(sim: SimApi, cy: Unit): void {
  const pct = mult('cyrene', 'talent_a2', levelsOf(sim.rt(cy)).talent)
  for (const a of sim.allies('ally')) {
    if (a.dead || sim.hasBuff(a, 'cy_heart')) continue
    sim.addBuff(a, { id: 'cy_heart', name: 'Hearts Gather as One', mods: [{ stat: 'dmgAll', value: pct }], turns: Infinity })
  }
}

/** Партнёрского This Ode у Tribbie/Cipher нет — Cyrene их не баффает (решение юзера): раздача
 *  Future и гейт автобоя их игнорируют. `cy_heart`/`cy_a3_team` — общие аурные DMG-баффы, они
 *  остаются (снижать урон команды из-за формальности Ode бессмысленно). */
const NO_ODE = new Set(['tribbie', 'cipher'])

/** Talent "Hearts Gather as One": other ally chars + memosprites (not Cyrene) get "Future". */
function applyFuture(sim: SimApi, cy: Unit): void {
  for (const a of sim.allies('ally')) {
    if (a === cy || a.dead) continue
    if (a.kind !== 'char' && a.kind !== 'summon') continue
    if (NO_ODE.has(a.kitId ?? '')) continue
    if (!sim.hasBuff(a, 'cy_future'))
      sim.addBuff(a, { id: 'cy_future', name: 'Bloom, Elysium of Beyond', mods: [], turns: Infinity })
  }
}

/** Future is consumed by a CHARACTER's action (A1 Child of Remembrance: memosprite Future stays).
 *  Distinct consumers feed Ode to Ego bounce count. */
function consumeFuture(sim: SimApi, actor: Unit, cy: Unit): void {
  if (actor === cy || actor.kind !== 'char' || actor.dead) return
  if (!sim.hasBuff(actor, 'cy_future')) return
  sim.removeBuff(actor, 'cy_future')
  gainRec(cy, 1)
  const rt = sim.rt(cy)
  const set = (rt.cyDistinct as Set<string>) ?? new Set<string>()
  rt.cyDistinct = set
  if (!set.has(actor.id)) {
    set.add(actor.id)
    sim.log(`${actor.name} consumed Future → Cyrene +1 Recollection (Ode source ${set.size})`)
  } else sim.log(`${actor.name} consumed Future → Cyrene +1 Recollection`)
}

/** After Cyrene's Ultimate or on Demiurge summon → +1 Story. At 3, consumed → Demiurge extra turn. */
function gainStory(sim: SimApi, owner: Unit): void {
  const rt = sim.rt(owner)
  rt.cyStory = ((rt.cyStory as number) ?? 0) + 1
  if ((rt.cyStory as number) >= 3) {
    rt.cyStory = 0
    const demi = demiurgeOf(sim, owner)
    if (demi) { demiAct(sim, demi); sim.log('Demiurge Story full → extra turn + auto Minuet') }
  }
}

/** Summon Demiurge (kind 'summon', SPD 0 — off-timeline, acts only via forced turns).
 *  141503: "Demiurge's initial Max HP equals to #1[i]% of Cyrene's Max HP", #1 = 1 at every level.
 *  The stored value is a FRACTION like every other `%` param in hsr-data (see AGENTS.md): 1 = 100%,
 *  not 1%. Proof from the same skill — #3 = 0.25…0.625 is the CRIT Rate bonus, and 0.25 as a raw
 *  percent would make the Ultimate's crit buff dead. So Demiurge starts on Cyrene's FULL bar, and
 *  because Minuet/Ode to Ego hit with `scaleStat:'hp'` on the SUMMON, they scale with it.
 *  Waiting, In Every Past then raises Cyrene's AND Demiurge's MaxHP by mem_talent. */
function summonDemi(sim: SimApi, u: Unit, ctx: KitRuntime): Unit | undefined {
  const demi = demiurgeOf(sim, u)
  if (demi) return demi
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const dhp = Math.max(1, Math.round(eu.hp * mult('cyrene', 'ult', lv.ult)))
  const dU: Unit = {
    id: `demi_${u.id}`, name: 'Demiurge', side: 'ally', kind: 'summon', elem: 'Ice',
    base: { level: 80, hp: dhp, atk: 1, def: 0, spd: 0 },
    hp: dhp, maxHp: dhp, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId, aggro: 0, untargetable: true,
  }
  const crt = sim.rt(dU)
  crt.ownerId = u.id
  sim.registerUnit(dU)
  sim.fireMemospriteSummon(u)
  // Memosprite Talent "Waiting, In Every Past": Cyrene + Demiurge MaxHP +mem_talent% while on field.
  const hpPct = mult('cyrene', 'mem_talent', lv.talent)
  sim.addBuff(u, { id: 'cy_demi_hp', name: 'Waiting, In Every Past', mods: [{ stat: 'hpPct', value: hpPct }], turns: Infinity })
  sim.addBuff(dU, { id: 'cy_demi_hp', name: 'Waiting, In Every Past', mods: [{ stat: 'hpPct', value: hpPct }], turns: Infinity })
  sim.log(`${u.name} summons Demiurge (MaxHP ${dhp}, SPD 0 off-timeline, +${(hpPct * 100).toFixed(1)}% MaxHP)`)
  a3Gate(sim, u)
  // 1141526 "Ode to Ego": +1 Story "after Cyrene uses Ultimate OR when Demiurge is summoned" —
  // Verse does both in one cast, so it is worth 2, not 1.
  gainStory(sim, u)
  return dU
}

/** Demiurge turn: first act = This Ode, to All Lives (ally buff); later = Minuet + Ode to Ego. */
function demiurgeTurn(sim: SimApi, demi: Unit): void {
  const owner = sim.find(sim.rt(demi).ownerId as string) ?? demi
  const ctx = sim.rt(owner)
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(owner)

  sim.fireMemospriteTurnStart(owner)
  const enemies = sim.livingEnemiesOf(owner)
  if (!enemies.length) return

  // First Demiurge act: "This Ode, to All Lives" — buff strongest ally (dmgAll, 2 turns).
  if (rt.cyFirstOde !== true) {
    rt.cyFirstOde = true
    const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== owner.id)
    if (allies.length) {
      const target = allies.reduce((m, a) => (eff(a).atk > eff(m).atk ? a : m), allies[0])
      const mods: Array<{ stat: 'dmgAll'; value: number }> = [{ stat: 'dmgAll', value: mult('cyrene', 'mem_skill_en_a2', lv.skill) }]
      const turns = mult('cyrene', 'mem_skill_en_a3', lv.skill)
      sim.addBuff(target, { id: 'cy_ode', name: 'This Ode, to All Lives', mods, turns })
      // canon: buff also applies to the target's memosprite
      for (const s of sim.allies('ally')) if (s.kind === 'summon' && sim.rt(s).ownerId === target.id) sim.addBuff(s, { id: 'cy_ode', name: 'This Ode, to All Lives', mods, turns })
      const odeSet = (rt.cyOdeSet as Set<string>) ?? new Set<string>()
      rt.cyOdeSet = odeSet
      odeSet.add(target.id)
      sim.log(`-- Demiurge casts This Ode on ${target.name} (+${(mods[0].value * 100).toFixed(0)}% DMG, ${turns} turns)`)
    } else sim.log('-- Demiurge: no ally for This Ode')
    return
  }

  // Minuet of Blooms and Plumes + Ode to Ego. 1141526: "For every 1 different teammate (excluding
  // Demiurge) from whom Cyrene has gained 'Recollection', additionally deals 1 instance" — Recollection
  // reaches Cyrene per-teammate only through consumed Future, so the distinct-consumer set is the count.
  let bounces = ((rt.cyDistinct as Set<string>) ?? new Set<string>()).size
  let bm = mult('cyrene', 'mem_skill_en15', lv.skill)
  if (eid >= 4) bm += Math.min(E4_CAP, ((rt.cyOdeStacks as number) ?? 0)) * E4_STEP
  if (eid >= 1) { bounces += 12; gainRec(owner, 6); sim.log(`Cyrene E1: Ode to Ego +6 Recollection`) }

  sim.hitAoe(demi, {
    type: 'fua', elem: 'Ice', mult: mult('cyrene', 'mem_skill', lv.skill),
    scaleStat: 'hp', toughDmg: mult('cyrene', 'mem_skill_a2', lv.skill), memoSkill: true, label: 'Minuet of Blooms and Plumes',
  })
  if (bounces > 0 && bm > 0)
    // 1141526 lists no Toughness for the bounce hits (only the 0.84% scale + Story threshold 3),
    // so 5 is a modelling choice, not a data read.
    sim.hitRandom(demi, bounces, {
      type: 'fua', elem: 'Ice', mult: bm, scaleStat: 'hp', toughDmg: 5, label: 'Ode to Ego',
    })
  if (eid >= 4) {
    rt.cyOdeStacks = Math.min(E4_CAP, ((rt.cyOdeStacks as number) ?? 0) + 1)
    sim.log(`Cyrene E4: Ode to Ego mult stack ${rt.cyOdeStacks}/${E4_CAP}`)
  }
  // E6: 1st Ode during Minuet → all enemies DEF -20% (while Demiurge on field); later → allies advance 24%.
  if (eid >= 6) {
    rt.cyE6Ode = ((rt.cyE6Ode as number) ?? 0) + 1
    if ((rt.cyE6Ode as number) === 1) {
      for (const e of enemies) if (!sim.hasBuff(e, 'cy_e6_def'))
        sim.addBuff(e, { id: 'cy_e6_def', name: 'Remembrance, Sung in Ripples ♪', mods: [{ stat: 'defRed', value: 0.2 }], turns: Infinity, debuff: true })
      sim.log('Cyrene E6: 1st Ode to Ego → all enemies DEF -20%')
    } else {
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead && a.id !== owner.id) sim.advance(a, 0.24)
      sim.log('Cyrene E6: Ode to Ego → all allies advance 24%')
    }
  }
  sim.log(`-- Demiurge acts: Minuet (Ice AoE) + Ode to Ego (${bounces} bounces)`)
}

function lowestHp_cyrene(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}

/** Zone True DMG for ONE ally damage instance. True DMG % = Skill (0.12..0.30); E2 adds +6% per
 *  distinct This-Ode recipient (cap 24%). 141502: every instance counts — DoT ticks and Weakness
 *  Break included, which is why the hit path, onDoTTick and onBreak all funnel through here. */
function zoneTrue(sim: SimApi, attacker: Unit | undefined, target: Unit | undefined, dmg: number, u: Unit, ctx: KitRuntime): void {
  if (!attacker || attacker.side !== 'ally') return
  if (!target || target.side !== 'enemy' || target.dead) return
  if ((sim.rt(u).cyZone as number) <= 0 || dmg <= 0) return
  const lv = levelsOf(ctx)
  let pct = mult('cyrene', 'skill', lv.skill)
  if (((ctx.eidolon as number) ?? 0) >= 2) {
    const odeSet = (sim.rt(u).cyOdeSet as Set<string>) ?? new Set<string>()
    pct += Math.min(0.24, odeSet.size * 0.06)
  }
  sim.trueDamage(attacker, target, Math.round(dmg * pct))
}

export const cyreneKit: KitDef = {
  id: 'cyrene',
  name: 'Cyrene',
  elem: 'Ice',
  energyMax: 24,
  // #141216 "Peace at West Wind's End" (Technique): deploys the Skill's Elysium Zone.
  technique: {
    name: "Peace at West Wind's End",
    kind: 'buff',
    zone: true,
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      ctx.cyZone = mult('cyrene', 'skill_a2', lv.skill)
      sim.log(`${u.name} Technique: deploys Elysium Zone (${ctx.cyZone} turns)`)
    },
  },
  // canon (Energy.md): Cyrene does not use the Energy system — Recollection gate mirrors decide
  // (Ripples state halves the cost to 12), no sp_base +5 after the cast
  ultActivation: { kind: 'ready', check: (sim, u) => {
    const rt = sim.rt(u) as { cyRipples?: boolean }
    return rt.cyRipples === true ? u.energy >= ULT_COST : u.energy >= ULT_REQ
  } },
  ultConsumption: 'none',
  base: { ...PROG.cyrene.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  onStart(sim, u, ctx) {
    if (u.kind !== 'char') return
    u.aggro = 100
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 2) { gainRec(u, 12); sim.log(`Cyrene E2: battle-start +12 Recollection`) }
    // A2 "Ripples Across Time": +2/3/6 Rec by Chrysos Heir / Remembrance teammates (excl. Cyrene)
    const heirs = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== u.id &&
      (a.base.path === 'Remembrance' || CHRYSOS.has(a.kitId ?? ''))).length
    if (heirs >= 3) { gainRec(u, 6); sim.log(`Cyrene A2: ${heirs} Chrysos/Remembrance ally(ies) → +6 Recollection`) }
    else if (heirs === 2) { gainRec(u, 3); sim.log(`Cyrene A2: ${heirs} Chrysos/Remembrance ally(ies) → +3 Recollection`) }
    else if (heirs === 1) { gainRec(u, 2); sim.log(`Cyrene A2: 1 Chrysos/Remembrance ally → +2 Recollection`) }
    applyAura(sim, u)
    a3Gate(sim, u)
    applyFuture(sim, u)
  },
  decide(sim, u, ctx) {
    if (u.kind === 'summon') return { kind: 'basic' }
    const rt = sim.rt(u)
    if (rt.cyRipples === true) return { kind: u.energy >= ULT_COST ? 'ult' : 'basic' } // Reunion at First Sight
    // Партнёрский буфф выдаёт УЛЬТА (Verse ◦ Vow ∞), не навык, поэтому буфф-first = дойти до ульты:
    // ульта стоит первым, а навык (3 Recollection, свой урон 0) и так предпочитается базовому
    // урону, пока SP есть. После Verse (Ripples) — только свой урон (Enhanced Basic).
    if (u.energy >= ULT_REQ) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    if (u.kind === 'summon') { demiurgeTurn(sim, u); return }
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)

    if (action.kind === 'ult') {
      if (rt.cyRipples === true) {
        // Reunion at First Sight — Ripples-state ult, drains 12, Demiurge extra turn + Story.
        if (u.energy < ULT_COST) return
        u.energy -= ULT_COST
        const demi = demiurgeOf(sim, u)
        if (demi) demiAct(sim, demi)
        gainStory(sim, u)
        sim.log(`${u.name} Ultimate: Reunion at First Sight`)
        return
      }
      // Verse ◦ Vow ∞ — once per battle: summon Demiurge, Ripples state, permanent Zone.
      if (u.energy < ULT_REQ) return
      u.energy -= ULT_COST
      rt.cyVerseUsed = true
      rt.cyRipples = true
      rt.cyZone = Infinity
      const demi = summonDemi(sim, u, ctx)
      const cr = mult('cyrene', 'ult_a3', lv.ult)
      sim.removeBuff(u, 'cy_ripples_cr')
      sim.addBuff(u, { id: 'cy_ripples_cr', name: 'Remembrance, Sung in Ripples ♪', mods: [{ stat: 'critRate', value: cr }], turns: Infinity })
      if (demi) {
        sim.removeBuff(demi, 'cy_ripples_cr')
        sim.addBuff(demi, { id: 'cy_ripples_cr', name: 'Remembrance, Sung in Ripples ♪', mods: [{ stat: 'critRate', value: cr }], turns: Infinity })
      }
      // 141503 "...and activates all teammates' Ultimates" — REAL (was a log-only flatten): a READY ally
      // casts its Ultimate right here, inside Verse ◦ Vow ∞, without waiting for its own turn. The
      // gate is the sim's own auto-ult readiness (energy == max), so an ally at 0 Energy is skipped.
      sim.log(`${u.name} Ultimate: Ripples of Past Reverie (CRIT +${(cr * 100).toFixed(1)}%, Zone permanent); activates all teammates' Ultimates`)
      for (const a of sim.allies('ally')) {
        if (a === u || a.kind !== 'char' || a.dead) continue
        if (sim.activateAllyUlt(a)) sim.log(`${a.name} activates Ultimate from Verse ◦ Vow ∞`)
      }
      if (demi) demiAct(sim, demi)
      gainStory(sim, u)
      if (eid >= 6 && !rt.cyE6) {
        rt.cyE6 = true
        for (const a of sim.allies('ally')) {
          if (a.side === 'ally' && a.kind === 'char' && !a.dead && a !== u) sim.advance(a, 1.0)
        }
        sim.log(`Cyrene E6: all allies advance 100%`)
      }
      return
    }

    if (rt.cyRipples === true) {
      // Enhanced Basic "To Love and Tomorrow ♪" — only ability usable in Ripples, cannot recover SP.
      gainRec(u, mult('cyrene', 'basic_en_a2', lv.basic))
      const t = lowestHp_cyrene(sim, u)!
      sim.hit(u, t, { type: 'basic', elem: 'Ice', mult: mult('cyrene', 'basic_en_a3', lv.basic), scaleStat: 'hp', toughDmg: 10, label: 'To Love and Tomorrow (single)' })
      sim.hitAoe(u, { type: 'basic', elem: 'Ice', mult: mult('cyrene', 'basic_en', lv.basic), scaleStat: 'hp', toughDmg: 5, label: 'To Love and Tomorrow (AoE)' })
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      gainRec(u, mult('cyrene', 'skill_a3', lv.skill))
      rt.cyZone = mult('cyrene', 'skill_a2', lv.skill)
      sim.log(`${u.name} Skill: deploys Elysium Zone (${rt.cyZone} turns, True DMG ${(mult('cyrene', 'skill', lv.skill) * 100).toFixed(0)}%)`)
      return
    }

    // Basic "Lo, Hope Takes Flight!"
    sim.gainSp(1)
    gainRec(u, mult('cyrene', 'basic_a2', lv.basic))
    const t = lowestHp_cyrene(sim, u)!
    sim.hit(u, t, { type: 'basic', elem: 'Ice', mult: mult('cyrene', 'basic', lv.basic), scaleStat: 'hp', toughDmg: 10, label: 'Lo, Hope Takes Flight!' })
  },

  // Zone decrements at start of Cyrene's turn (Infinity = Ripples permanent zone; token Demiurge
  // timeline passes are kind-gated out so they don't eat zone duration or re-fire A3).
  onTurnStart(sim, u, _ctx) {
    if (u.kind !== 'char') return
    const rt = sim.rt(u)
    if ((rt.cyZone as number) > 0 && (rt.cyZone as number) !== Infinity) {
      rt.cyZone = (rt.cyZone as number) - 1
      if ((rt.cyZone as number) <= 0) sim.log(`${u.name} Elysium Zone ends`)
    }
    a3Gate(sim, u)
  },

  // Talent "Hearts Gather as One": after Cyrene takes action, re-apply Future + on-field aura.
  onTurnEnd(sim, u, _ctx) {
    if (u.kind !== 'char') return
    applyAura(sim, u)
    applyFuture(sim, u)
  },

  // Talent "Future": an ally CHAR with Future taking a turn consumes it → Cyrene +1 Recollection.
  onAllyTurnStart(sim, ally, _ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'cyrene' && !a.dead)
    if (!u) return
    consumeFuture(sim, ally, u)
  },

  // Zone True DMG per ally DMG instance + Future consumed on injected/FUA actions (chars only).
  onAfterAttack(sim, attacker, target, dmgType, ctx, dmg) {
    // `dot`/`break` pay through onDoTTick / onBreak below (both resolve outside fireAfterAttack) —
    // leaving them here would double count. Additional DMG is part of the hit that spawned it.
    if (dmgType === 'add' || dmgType === 'dot' || dmgType === 'elation' || dmgType === 'break') return
    const u = sim.allies('ally').find(a => a.kitId === 'cyrene' && !a.dead)
    if (!u || !attacker || attacker.side !== 'ally') return
    consumeFuture(sim, attacker, u)
    zoneTrue(sim, attacker, target, dmg ?? 0, u, ctx)
  },

  // 141502 counts every DMG *instance* an ally deals while the Zone lasts, DoT ticks and Weakness
  // Break included; neither goes through fireAfterAttack, so each needs its own hook path.
  onDoTTick(sim, attacker, target, _dot, ctx, _owner, dmg) {
    const u = sim.allies('ally').find(a => a.kitId === 'cyrene' && !a.dead)
    if (!u) return
    zoneTrue(sim, attacker, target, dmg ?? 0, u, ctx)
  },

  onBreak(sim, breaker, victim, ctx, dmg) {
    const u = sim.allies('ally').find(a => a.kitId === 'cyrene' && !a.dead)
    if (!u) return
    zoneTrue(sim, breaker, victim, dmg ?? 0, u, ctx)
  },

  // 141502: "When Cyrene is downed, the Zone will also be dispelled" — the while-on-field
  // Future / Hearts Gather as One / Causality buffs live on OTHER units, so they must go too.
  // Demiurge has no canon despawn, so it stays as a token (it is inert: every Demiurge hook
  // resolves its owner through sim.find, which skips a dead Cyrene).
  onUnitDeath(sim, u) {
    if (u.kind !== 'char') return
    const rt = sim.rt(u)
    const hadZone = ((rt.cyZone as number) ?? 0) > 0
    rt.cyZone = 0
    for (const a of sim.allies('ally')) {
      sim.removeBuff(a, 'cy_heart')
      sim.removeBuff(a, 'cy_future')
      sim.removeBuff(a, 'cy_a3_team')
    }
    const demi = demiurgeOf(sim, u)
    if (demi) {
      sim.removeBuff(demi, 'cy_demi_hp')
      sim.removeBuff(demi, 'cy_ripples_cr')
      sim.removeBuff(demi, 'cy_a3_pen')
    }
    sim.log(`${u.name} is downed — Elysium Zone dispelled${hadZone ? '' : ' (no Zone was active)'}; Future / Hearts Gather as One / Causality in Trichotomy removed`)
  },
}

// ===== trailblazer_remembrance  (was trailblazer_remembrance.ts) =====
function memOf(sim: SimApi, u: Unit): Unit | undefined { return sim.find(`mem_${u.id}`) }

function refreshMem(sim: SimApi, u: Unit, mem: Unit, ctx: KitRuntime) {
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const ratio = mem.maxHp > 0 ? mem.hp / mem.maxHp : 1
  const mhp = Math.max(1, Math.round(eu.hp * mult('trailblazer_remembrance', 'talent_a2', lv.talent) + mult('trailblazer_remembrance', 'talent_a4', lv.talent)))
  mem.base.hp = mhp; mem.maxHp = mhp; mem.hp = Math.max(1, Math.round(mhp * ratio))
  mem.base.atk = eu.atk; mem.base.critRate = eu.critRate; mem.base.critDmg = eu.critDmg; mem.base.level = u.base.level
  // Friends! Together! passive aura
  const cdBonus = eff(mem).critDmg * mult('trailblazer_remembrance', 'mem_talent', lv.talent) + mult('trailblazer_remembrance', 'mem_talent_a2', lv.talent)
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    sim.addBuff(a, { id: 'tb_rem_friends', name: 'Friends! Together!', mods: [{ stat: 'critDmg', value: cdBonus }], turns: Infinity })
  }
}

function summonMem(sim: SimApi, u: Unit, ctx: KitRuntime): Unit {
  const existing = memOf(sim, u)
  if (existing) return existing
  const lv = levelsOf(ctx)
  const mem: Unit = {
    id: `mem_${u.id}`, name: 'Mem', side: 'ally', kind: 'summon', elem: 'Ice',
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: mult('trailblazer_remembrance', 'talent', lv.talent) },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
  sim.rt(mem).ownerId = u.id
  refreshMem(sim, u, mem, ctx)
  sim.registerUnit(mem)
  sim.fireMemospriteSummon(u)
  const rt = sim.rt(u)
  rt.memCharge = Math.min(100, ((rt.memCharge as number) ?? 0) + mult('trailblazer_remembrance', 'mem_talent_en', lv.talent) * 100)
  if (!(rt.tbRemFirstSummon as boolean)) {
    rt.tbRemFirstSummon = true
    rt.memCharge = Math.min(100, (rt.memCharge as number) + 40)
  }
  sim.log(`${u.name} summons Mem (HP ${mem.maxHp}, SPD ${mem.base.spd})`)
  return mem
}

function memBaddies(sim: SimApi, mem: Unit, u: Unit, ctx: KitRuntime) {
  const lv = levelsOf(ctx)
  const n = mult('trailblazer_remembrance', 'mem_skill_a2', lv.skill)
  const pool = [...sim.livingEnemiesOf(mem)]
  for (let i = 0; i < n; i++) {
    if (!pool.length) break
    const e = pool[Math.floor(sim.rng() * pool.length)]
    if (!e.dead) sim.hit(mem, e, { type: 'skill', elem: 'Ice', mult: mult('trailblazer_remembrance', 'mem_skill', lv.skill), toughDmg: 10, label: 'Baddies!' })
  }
  for (const e of [...sim.livingEnemiesOf(mem)])
    sim.hit(mem, e, { type: 'skill', elem: 'Ice', mult: mult('trailblazer_remembrance', 'mem_skill_a3', lv.skill), toughDmg: 10, label: 'Baddies AoE' })
  const rt = sim.rt(u)
  rt.memCharge = Math.min(100, ((rt.memCharge as number) ?? 0) + 5) // Petite Parable
}

function memLemme(sim: SimApi, mem: Unit, u: Unit, ctx: KitRuntime) {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== mem.id)
  const target = allies.reduce((best, a) => (sim.effAtk(a) > sim.effAtk(best) ? a : best), allies[0] ?? u)
  sim.markAlliedTarget(target)
  sim.advance(target, mult('trailblazer_remembrance', 'mem_skill_en_a3', lv.skill))
  const excess = Math.max(0, target.maxEnergy - 100)
  const magnetBonus = Math.min(0.20, Math.floor(excess / 10) * 0.02)
  const payload = mult('trailblazer_remembrance', 'mem_skill_en', lv.skill) + magnetBonus
  sim.addBuff(target, { id: 'tb_rem_support', name: "Mem's Support", mods: [], turns: mult('trailblazer_remembrance', 'mem_skill_en_a2', lv.skill), payload, sourceId: u.id })
  if (eid >= 1) sim.addBuff(target, { id: 'tb_rem_e1', name: 'Narrator CR+', mods: [{ stat: 'critRate', value: 0.10 }], turns: mult('trailblazer_remembrance', 'mem_skill_en_a2', lv.skill) })
  sim.log(`${mem.name} Lemme: ${target.name} (true ${(payload * 100).toFixed(1)}%)`)
}

/** 1800707 "Mem's Support": one True DMG instance worth `payload` of the damage that triggered it.
 *  Shared by the hit, DoT-tick and Break paths — the proc is per instance, not per attack. */
function memSupportTrue(sim: SimApi, attacker: Unit, target: Unit, dmg: number): void {
  if (attacker.side !== 'ally' || target.side !== 'enemy' || target.dead) return
  const support = attacker.buffs.find(b => b.id === 'tb_rem_support')
  if (!support?.payload || dmg <= 0) return
  sim.trueDamage(attacker, target, Math.round(dmg * (support.payload as number)))
}

export const trailblazerRemembranceKit: KitDef = {
  id: 'trailblazer_remembrance',
  name: '{NICKNAME}',
  elem: 'Ice',
  energyMax: 160,
  base: { ...PROG.trailblazer_remembrance.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  // #800612 "Memories Back as Echoes" (Technique): delay all enemies 50%, then AoE Ice = 100% ATK.
  technique: {
    name: 'Memories Back as Echoes',
    kind: 'attack',
    apply(sim, u, _ctx) {
      for (const e of sim.livingEnemiesOf(u)) sim.delay(e, 0.5)
      sim.hitAoe(u, { type: 'basic', elem: 'Ice', mult: 1, toughDmg: 10, label: 'Memories Back as Echoes' })
    },
  },

  onStart(sim, u, _ctx) { sim.advance(u, 0.30) },

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
      const mem = summonMem(sim, u, ctx)
      rt.memCharge = Math.min(100, ((rt.memCharge as number) ?? 0) + mult('trailblazer_remembrance', 'ult_a2', lv.ult) * 100)
      const opts = eid >= 6 ? { forceCrit: true } : {}
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.hit(mem, e, { type: 'ult', elem: 'Ice', mult: mult('trailblazer_remembrance', 'ult', lv.ult), toughDmg: 20, label: 'Together, Mem!', ...opts })
      rt.tbRemEpic = Math.min(2, ((rt.tbRemEpic as number) ?? 0) + 1)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const mem = summonMem(sim, u, ctx)
      sim.heal(mem, Math.round(mem.maxHp * mult('trailblazer_remembrance', 'skill', lv.skill)), u)
      rt.memCharge = Math.min(100, ((rt.memCharge as number) ?? 0) + mult('trailblazer_remembrance', 'skill_a2', lv.skill) * 100)
      return
    }

    const mem = memOf(sim, u)
    const epic = (rt.tbRemEpic as number) ?? 0
    if (epic > 0 && mem && !mem.dead) {
      rt.tbRemEpic = epic - 1
      sim.gainEnergy(u, 20)
      for (const e of [...sim.livingEnemiesOf(u)]) {
        sim.hit(u, e, { type: 'basic', elem: 'Ice', mult: mult('trailblazer_remembrance', 'basic_en', lv.basic), toughDmg: 20, label: 'Script Tomorrow (TB)' })
        sim.hit(mem, e, { type: 'basic', elem: 'Ice', mult: mult('trailblazer_remembrance', 'basic_en_a2', lv.basic), toughDmg: 10, label: 'Script Tomorrow (Mem)' })
      }
      rt.memCharge = Math.min(100, (rt.memCharge as number) + mult('trailblazer_remembrance', 'basic_en_a3', 1) * 100)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, t, { type: 'basic', elem: 'Ice', mult: mult('trailblazer_remembrance', 'basic', lv.basic), toughDmg: 10, label: 'Leave It to Me!' })
  },

  onSummonTurn(sim, summon, owner, ctx) {
    const rt = sim.rt(owner)
    const charge = (rt.memCharge as number) ?? 0
    if (charge >= 100) {
      memLemme(sim, summon, owner, ctx)
      rt.memCharge = 0
    } else {
      memBaddies(sim, summon, owner, ctx)
    }
    refreshMem(sim, owner, summon, ctx)
  },

  onTurnStart(sim, u, _ctx) {
    if (u.kitId !== 'trailblazer_remembrance') return
    sim.rt(u).tbRemE2ThisTurn = false
  },

  // E2: a non-Mem ALLY memosprite acts → TB +8 Energy, once per TB turn. Canon reads "any other
  // memosprite", so Mem's own action is the one exclusion. This used to sit in `onSummonTurn`,
  // which the sim only ever dispatches to the owner's own kit — the `summon.id !== mem_…` test was
  // therefore always false and E2 never fired for anyone.
  onAllyMemospriteAct(sim, u, summon, ctx) {
    if (summon.id === `mem_${u.id}`) return
    if (((ctx.eidolon as number) ?? 0) < 2) return
    const rt = sim.rt(u)
    if (rt.tbRemE2ThisTurn as boolean) return
    rt.tbRemE2ThisTurn = true
    sim.gainEnergy(u, 8)
  },

  // Mem Charge: every 10 energy all allies gain → +1% charge
  onAllyEnergy(sim, _unit, base, _ctx) {
    const owner = sim.allies('ally').find(a => a.kitId === 'trailblazer_remembrance' && !a.dead)
    if (!owner) return
    const rt = sim.rt(owner)
    rt.tbRemEnergyTotal = ((rt.tbRemEnergyTotal as number) ?? 0) + base
    const prev = (rt.tbRemEnergySeen as number) ?? 0
    const crossings = Math.floor((rt.tbRemEnergyTotal as number) / 10) - prev
    if (crossings > 0) {
      rt.tbRemEnergySeen = prev + crossings
      rt.memCharge = Math.min(100, ((rt.memCharge as number) ?? 0) + crossings)
    }
  },

  // Mem's Support: true DMG proc per hit
  onAfterAttack(sim, attacker, target, _dmgType, _ctx, dmg) {
    memSupportTrue(sim, attacker, target, dmg ?? 0)
  },

  // 1800707 counts *instances*, so a DoT tick and a Weakness Break each pay the proc too — neither
  // goes through fireAfterAttack, hence one hook each.
  onDoTTick(sim, attacker, target, _dot, _ctx, _owner, dmg) {
    memSupportTrue(sim, attacker, target, dmg ?? 0)
  },

  onBreak(sim, breaker, victim, _ctx, dmg) {
    memSupportTrue(sim, breaker, victim, dmg ?? 0)
  },

  // No... Regrets: Mem dies → advance TB 25%
  onAllyKill(sim, _killer, victim, ctx) {
    const owner = sim.allies('ally').find(a => a.kitId === 'trailblazer_remembrance' && !a.dead)
    if (!owner) return
    if (victim.id !== `mem_${owner.id}`) return
    sim.advance(owner, mult('trailblazer_remembrance', 'mem_talent_en2', levelsOf(ctx).talent))
    sim.log('No... Regrets: Mem disappeared, TB advances 25%')
  },
}


// ===== robin_summeretto  (was robin_summeretto.ts) =====
// Robin • Summeretto — Remembrance (Wind). Memosprite "Summer Songbirds" (Bessie / Drummie / Paddie).
// the three Songbirds are ONE summon unit + a member count (1..3) — the count only drives the
// "DMG taken by all enemies by member count" aura and the "all three take the stage" Fever trigger.
// The Fever countdown is a re-armed `kind:'timer'` unit (the built-in timer unregisters itself after
// onCcEnd), so every countdown turn deducts 50% of Vibes (minimum 12). CC immunity / CC dispel are
// no-ops — the sim has no CC on allies or summons. Vibes only come from OTHER allies (canon: "ally
// targets"); the Special Guest's own summons count too.

const PID = 'robin_summeretto'
const ZONE = 'rsu_zone' // allies' DEF-ignore inside the Fever Zone
const BIRD = 'rsu_bird' // Robin + Songbirds DMG+ in Fever
const MEMBER = 'rsu_member' // enemies' DMG-taken by member count
const GUEST = 'rsu_guest' // Special Guest marker
const E2_RES = 'rsu_e2_res' // E2 team-wide All-Type RES PEN
const DEV = 'rsu_dev' // Trace "Deviated Chords"
const CRIT = 'rsu_cr' // Trace "Rebuilt Harmony"

const birdsOf = (sim: SimApi, u: Unit): Unit | undefined => sim.find(`bird_${u.id}`)

/** Memosprite ladders top out at Lv.10; E3 grants Memosprite Talent +1, E5 Memosprite Skill +1
 *  (mult() clamps to the ladder length). */
function memLevels(ctx: KitRuntime): { skill: number; talent: number } {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  return { skill: lv.skill + (eid >= 5 ? 1 : 0), talent: lv.talent + (eid >= 3 ? 1 : 0) }
}

const vibesCap = (ctx: KitRuntime): number =>
  mult(PID, 'talent_a5', levelsOf(ctx).talent) + (((ctx.eidolon as number) ?? 0) >= 2 ? 20 : 0)

/** Trace "Rebuilt Harmony": CRIT Rate +50% for Robin and the Summer Songbirds. */
function critBuff(sim: SimApi, u: Unit, birds?: Unit): void {
  sim.removeBuff(u, CRIT)
  sim.addBuff(u, { id: CRIT, name: 'Rebuilt Harmony', sourceId: u.id, mods: [{ stat: 'critRate', value: 0.5 }], turns: Infinity })
  const b = birds ?? birdsOf(sim, u)
  if (b && !b.dead) {
    sim.removeBuff(b, CRIT)
    sim.addBuff(b, { id: CRIT, name: 'Rebuilt Harmony', sourceId: u.id, mods: [{ stat: 'critRate', value: 0.5 }], turns: Infinity })
  }
}

/** Memosprite Talent: initial Max HP = #1 (70%) of Robin's Max HP, SPD = #2 (180%) of Robin's SPD.
 *  Out of the Action Order (SPD 0) until Fever; E4 adds (20% + Vibes × 0.5%) during Fever. */
function refreshBirds(sim: SimApi, u: Unit, b: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eu = eff(u)
  const ratio = b.maxHp > 0 ? b.hp / b.maxHp : 1
  const ghp = Math.max(1, Math.round(eu.hp * mult(PID, 'talent', lv.talent)))
  b.base.hp = ghp
  b.maxHp = ghp
  b.hp = Math.max(1, Math.round(ghp * ratio))
  let spd = Math.max(1, Math.round(eu.spd * mult(PID, 'talent_a2', lv.talent)))
  if (sim.rt(u).fever === true) {
    if (((ctx.eidolon as number) ?? 0) >= 4)
      spd = Math.round(spd * (1 + 0.2 + ((sim.rt(u).vibes as number) ?? 0) * 0.005))
  } else spd = 0
  sim.setSpeedDynamic(b, spd)
}

/** Memosprite Talent "A Warble of Wings": Robin + Songbirds DMG+ = #1 + Vibes × #2 (Fever only);
 *  Zone: allies ignore DEF = #8 + Vibes × #9. Both scale with Vibes → re-applied on every gain. */
function refreshFeverMods(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (sim.rt(u).fever !== true) return
  const lv = levelsOf(ctx)
  const ml = memLevels(ctx)
  const v = (sim.rt(u).vibes as number) ?? 0
  const dm = mult(PID, 'mem_talent', ml.talent) + v * mult(PID, 'mem_talent_a2', ml.talent)
  const b = birdsOf(sim, u)
  for (const t of [u, b]) {
    if (!t || t.dead) continue
    sim.removeBuff(t, BIRD)
    sim.addBuff(t, { id: BIRD, name: 'A Warble of Wings', sourceId: u.id, mods: [{ stat: 'dmgAll', value: dm }], turns: Infinity })
  }
  const di = mult(PID, 'talent_a8', lv.talent) + v * mult(PID, 'talent_a9', lv.talent)
  for (const a of sim.allies(u.side)) {
    if (a.kind !== 'char' || a.dead) continue
    sim.removeBuff(a, ZONE)
    sim.addBuff(a, { id: ZONE, name: 'Fever Zone (DEF ignore)', sourceId: u.id, mods: [{ stat: 'defIgnore', value: di }], turns: Infinity })
  }
  if (b && !b.dead) refreshBirds(sim, u, b, ctx)
}

/** Memosprite Talent: enemies take +#3/#4/#5% DMG by the number of Songbirds on stage. */
function applyMemberAura(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const ml = memLevels(ctx)
  const m = (sim.rt(u).members as number) ?? 0
  if (m <= 0) return
  const slot = m >= 3 ? 'mem_talent_a5' : m === 2 ? 'mem_talent_a4' : 'mem_talent_a3'
  const v = mult(PID, slot, ml.talent)
  for (const e of sim.livingEnemiesOf(u)) {
    sim.removeBuff(e, MEMBER)
    sim.addBuff(e, { id: MEMBER, name: 'Summer Songbirds', sourceId: u.id, mods: [{ stat: 'vulnAll', value: v }], turns: Infinity })
  }
}

/** Fever countdown: own fixed SPD (#9 = 140). The built-in timer is one-shot - `timerTurn` unregisters
 *  the unit AFTER firing onCcEnd, so a re-arm inside the hook needs a FRESH id or the new timer is
 *  unregistered by id collision. */
function armCountdown(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const seq = ((rt.cdSeq as number) ?? 0) + 1
  rt.cdSeq = seq
  const cid = `rsucd_${u.id}_${seq}`
  rt.cdId = cid
  sim.scheduleCountdown(u, { id: cid, name: 'Fever Countdown', side: 'ally', elem: 'Wind', spd: mult(PID, 'mem_talent_a9', memLevels(ctx).talent), kitId: u.kitId })
}

/** drop the live countdown timer (Fever end / owner death) */
function disarmCountdown(sim: SimApi, u: Unit): void {
  const cid = sim.rt(u).cdId as string | undefined
  if (cid) sim.unregisterUnit(cid)
}

function startFever(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  rt.fever = true
  // E4: +12 Vibes on entering Fever (Vibes now >= 3 members, so no re-trigger loop)
  if (((ctx.eidolon as number) ?? 0) >= 4) {
    const was = (rt.vibes as number) ?? 0
    const now = Math.min(vibesCap(ctx), was + 12)
    rt.vibes = now
    sim.log(`${u.name} gains ${now - was} Vibes (E4, ${was} → ${now})`)
  }
  // CC dispel on Robin + Songbirds: no-op (the sim has no CC on allies/summons)
  // CC immunity in Fever: no-op (same reason)
  refreshFeverMods(sim, u, ctx)
  armCountdown(sim, u, ctx)
  sim.log(`${u.name} enters the Fever state — Zone deployed, Summer Songbirds join the Action Order`)
  // E6: first Fever of the battle → fixed 140 Energy
  if (((ctx.eidolon as number) ?? 0) >= 6 && rt.e6Fever !== true) {
    rt.e6Fever = true
    sim.gainEnergyFlat(u, 140)
    sim.log(`E6 A Song Yet Unnamed: ${u.name} regenerates a fixed 140 Energy`)
    maybeStoreUlt(sim, u, ctx)
  }
}

/** E6: while in Fever the Ult can be stored (up to 2) — the energy is banked, then released on exit. */
function maybeStoreUlt(sim: SimApi, u: Unit, ctx: KitRuntime): boolean {
  const rt = sim.rt(u)
  if (((ctx.eidolon as number) ?? 0) < 6 || rt.fever !== true) return false
  const stored = (rt.stored as number) ?? 0
  if (stored >= 2 || u.energy < u.maxEnergy) return false
  rt.stored = stored + 1
  u.energy = 0
  sim.log(`E6 A Song Yet Unnamed: ${u.name} stores her Ultimate (${stored + 1}/2)`)
  return true
}

function castUlt(sim: SimApi, u: Unit, ctx: KitRuntime, action: Action): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(u)
  if (rt.fever === true && maybeStoreUlt(sim, u, ctx)) return
  u.energy = 0
  // "Ascend That Rhapsody in Blue": advance the designated ally + a slice of their Max Energy,
  // and make them the Special Guest (2 Vibes per attack, 2 turns).
  const cands = sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead && a.id !== u.id)
  const strongest = cands.length ? cands.reduce((m, a) => (sim.effAtk(a) > sim.effAtk(m) ? a : m)) : u
  const target = cands.length ? manualTarget(sim, action, strongest) : undefined
  if (!target) {
    sim.log(`${u.name} uses Ascend That Rhapsody in Blue (no ally target)`)
    return
  }
  sim.markAlliedTarget(target)
  sim.advance(target, mult(PID, 'ult', lv.ult))
  const en = Math.round(target.maxEnergy * mult(PID, 'ult_a3', lv.ult))
  target.energy = Math.min(target.maxEnergy, target.energy + en)
  rt.guestId = target.id
  rt.guestTurns = 2
  sim.addBuff(target, { id: GUEST, name: 'Special Guest', sourceId: u.id, mods: [], turns: 2 })
  sim.log(`${u.name} uses Ascend That Rhapsody in Blue: ${target.name} is the Special Guest (+${en} Energy, advance ${(mult(PID, 'ult', lv.ult) * 100).toFixed(0)}%)`)
}

function endFever(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  if (rt.fever !== true) return
  rt.fever = false
  rt.vibes = 0
  disarmCountdown(sim, u)
  const b = birdsOf(sim, u)
  if (b) {
    sim.removeBuff(b, BIRD)
    sim.removeBuff(b, CRIT)
    sim.unregisterUnit(b.id)
    // Memosprite Talent "Astride Summer's Nightwind": on disappear → advance #1 (50%)
    sim.fireMemospriteDisappear(u)
    sim.advance(u, mult(PID, 'mem_talent_en2', memLevels(ctx).talent))
  }
  rt.members = 0
  for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.removeBuff(a, ZONE)
  for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, MEMBER)
  sim.removeBuff(u, BIRD)
  sim.log(`${u.name} exits the Fever state`)
  // E6: release the stored Ult(s) — the banked Energy comes back with them
  const stored = (rt.stored as number) ?? 0
  rt.stored = 0
  if (stored > 0) {
    for (let i = 0; i < stored; i++) castUlt(sim, u, ctx, { kind: 'ult' })
    u.energy = u.maxEnergy
  }
}

/** Talent "Wings Heed No Borders" / Trace "Deviated Chords" / Trace "Improvised Blues":
 *  every Vibes point re-derives the member count, the Fever state, both Fever buffs, the
 *  Deviated Chords ATK/CRIT DMG buff and the Groove → Energy exchange. */
function addVibes(sim: SimApi, u: Unit, ctx: KitRuntime, n: number, byAlly?: Unit): void {
  const rt = sim.rt(u)
  const b = birdsOf(sim, u)
  if (!b || b.dead || n <= 0) return
  const cap = vibesCap(ctx)
  const before = (rt.vibes as number) ?? 0
  if (before >= cap) return
  let amt = n
  // E2: the FIRST ability-caused Vibes gain of any turn by an ALLY target (not Robin's own Skill) → +2
  if (byAlly && ((ctx.eidolon as number) ?? 0) >= 2 && (rt.e2Turn as number) !== sim.battleTurn) {
    rt.e2Turn = sim.battleTurn
    amt += 2
  }
  const after = Math.min(cap, before + amt)
  rt.vibes = after
  if (after !== before + amt) sim.log(`${u.name} gains ${amt} Vibes (capped at ${cap}: ${before} → ${after})`)
  else sim.log(`${u.name} gains ${amt} Vibes (${before} → ${after})`)

  // Trace "Improvised Blues": first Vibes of any turn consumes 1 Groove → fixed 3 Energy
  if ((rt.grooveTurn as number) !== sim.battleTurn) {
    rt.grooveTurn = sim.battleTurn
    const g = (rt.groove as number) ?? 0
    if (g > 0) {
      rt.groove = g - 1
      sim.gainEnergyFlat(u, 3)
      sim.log(`Improvised Blues: ${u.name} spends 1 Groove (${g} → ${g - 1}) for 3 Energy`)
    }
  }

  // Trace "Deviated Chords": the Vibes source gets ATK (from Robin's Max HP) or CRIT DMG, 2 turns
  if (byAlly && byAlly.kind === 'char' && byAlly.id !== u.id && !byAlly.dead) {
    sim.removeBuff(byAlly, DEV)
    if (sim.effAtk(byAlly) > sim.effAtk(u)) {
      const flat = Math.round(eff(u).hp * (0.16 + after * 0.004))
      sim.addBuff(byAlly, {
        id: DEV, name: 'Deviated Chords (ATK)', sourceId: u.id,
        mods: [{ stat: 'atkFlat', value: flat }], turns: 2,
      })
    } else {
      sim.addBuff(byAlly, {
        id: DEV, name: 'Deviated Chords (CRIT DMG)', sourceId: u.id,
        mods: [{ stat: 'critDmg', value: 0.4 + after * 0.015 }], turns: 2,
      })
    }
  }

  refreshFeverMods(sim, u, ctx)
  // members: Bessie(1) → Drummie(2) at #6 → Paddie(3) at #7 → all on stage → Fever
  const lv = levelsOf(ctx)
  const m = (rt.members as number) ?? 1
  const want = after >= mult(PID, 'talent_a7', lv.talent) ? 3 : after >= mult(PID, 'talent_a6', lv.talent) ? 2 : m
  if (want > m) {
    rt.members = want
    sim.log(`Summer Songbirds: ${want} member${want > 1 ? 's' : ''} on stage (${want === 2 ? 'Drummie joins' : 'Drummie + Paddie join'})`)
    applyMemberAura(sim, u, ctx)
  }
  if (want >= 3 && rt.fever !== true) startFever(sim, u, ctx)
  else if (rt.fever === true) maybeStoreUlt(sim, u, ctx)
}

function summonBirds(sim: SimApi, u: Unit, ctx: KitRuntime): Unit {
  const ml = memLevels(ctx)
  const b: Unit = {
    id: `bird_${u.id}`, name: 'Summer Songbirds', side: 'ally', kind: 'summon', elem: 'Wind',
    base: { level: 80, hp: 1, atk: 1, def: 0, spd: 0 },
    hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {}, kitId: u.kitId,
  }
  ;(sim.rt(b)).ownerId = u.id
  refreshBirds(sim, u, b, ctx)
  sim.registerUnit(b)
  sim.fireMemospriteSummon(u)
  critBuff(sim, u, b)
  // Memosprite Talent "Near the Sea's Heartbeat": on summon → #1 (20) Energy
  sim.gainEnergy(u, mult(PID, 'mem_talent_en', ml.talent))
  sim.rt(u).members = 1
  applyMemberAura(sim, u, ctx)
  sim.log(`${u.name} summons Summer Songbirds Bessie (MaxHP ${b.maxHp}, SPD ${mult(PID, 'talent_a2', levelsOf(ctx).talent) * 100}%)`)
  return b
}

/** heal/shield providers that already paid their "first time in any target's turn" Vibes */
function firstHealThisTurn(sim: SimApi, rt: KitRuntime, src: Unit | undefined): boolean {
  if (!src) return false
  const seen = (rt.healTurns ?? {}) as Record<string, number>
  if (seen[src.id] === sim.battleTurn) return false
  seen[src.id] = sim.battleTurn
  rt.healTurns = seen
  return true
}

export const robinSummerettoKit: KitDef = {
  id: PID,
  name: 'Robin • Summeretto',
  elem: 'Wind',
  energyMax: 140,
  base: { ...PROG[PID].base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Remembrance' },
  // #150203 "We Are the Melody" (Technique): advance 20%, +6 Vibes, allies +30% DMG (2t).
  technique: {
    name: 'We Are the Melody',
    kind: 'buff',
    apply(sim, u, ctx) {
      sim.advance(u, 0.2)
      addVibes(sim, u, ctx, 6)
      for (const a of sim.allies('ally')) if (a.kind === 'char' && !a.dead) sim.addBuff(a, { id: 'rsu_tech_dmg', name: 'We Are the Melody (DMG+)', mods: [{ stat: 'dmgAll', value: 0.3 }], turns: 2 })
      sim.log(`${u.name} Technique: +6 Vibes, advance 20%, allies +30% DMG (2t)`)
    },
  },

  onStart(sim, u) {
    critBuff(sim, u)
    // E2: All-Type RES PEN for the whole team (permanent)
    if (((sim.rt(u).eidolon as number) ?? 0) >= 2) {
      for (const a of sim.allies(u.side))
        if (a.kind === 'char')
          sim.addBuff(a, { id: E2_RES, name: 'To Run Through Blue (RES PEN)', sourceId: u.id, mods: [{ stat: 'resPenAll', value: 0.18 }], turns: Infinity })
    }
  },

  decide(sim, u, ctx) {
    const rt = sim.rt(u)
    // canon: she will not enter her turn until the Fever state ends
    if (rt.fever === true) return { kind: 'basic' }
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    const b = birdsOf(sim, u)
    const hurt = !!b && b.hp < b.maxHp * 0.6
    if (sim.sp() >= 1 && (!b || hurt || ((ctx.skillPriority as number) ?? 0) > 0)) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    // no action at all while in Fever
    if (rt.fever === true && action.kind !== 'ult') return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      castUlt(sim, u, ctx, action)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const b = birdsOf(sim, u)
      if (!b) summonBirds(sim, u, ctx)
      else {
        // Skill: any Songbirds member already on the field → heal them + gain #2 (6) Vibes
        const heal = Math.round(b.maxHp * mult(PID, 'skill', lv.skill))
        sim.heal(b, heal, u)
        sim.log(`${u.name} uses Summer Strums the Soul: Summer Songbirds restore ${heal} HP`)
      }
      addVibes(sim, u, ctx, mult(PID, 'skill_a2', lv.skill))
      return
    }

    // basic — The Sea Sings in My Key (Wind, Max HP scaling, single target)
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const e = sim.livingEnemiesOf(u)[0]
    if (e) sim.hit(u, e, { type: 'basic', elem: 'Wind', scaleStat: 'hp', mult: mult(PID, 'basic', lv.basic), toughDmg: 10, label: 'The Sea Sings in My Key' })
  },

  onAfterAttack(sim, attacker, target, _dmgType, ctx, dmg) {
    if (attacker.side !== 'ally' || target.side !== 'enemy') return
    const u = sim.allies('ally').find(x => x.kitId === PID && !x.dead)
    if (!u || attacker.id === u.id) return
    const rt = sim.rt(u)
    // E1 "Stray Bird of Summer": tally 100% of the non-True DMG dealt by ally targets.
    // True DMG never reaches here (sim.trueDamage does not fire onAfterAttack).
    if (typeof dmg === 'number' && dmg > 0) rt.tally = ((rt.tally as number) ?? 0) + dmg
    // Talent: an ally's attack → +1 Vibes; the Special Guest (and their summon) → +#2 (2) Vibes
    const isChar = attacker.kind === 'char'
    const isGuestSummon = !isChar && sim.rt(attacker).ownerId === rt.guestId
    if (!isChar && !isGuestSummon) return
    if (rt.guestId === attacker.id) addVibes(sim, u, ctx, mult(PID, 'ult_a2', levelsOf(ctx).ult), attacker)
    else addVibes(sim, u, ctx, 1, attacker)
  },

  onAllyTurnStart(sim, ally, ctx) {
    const u = sim.allies('ally').find(x => x.kitId === PID && !x.dead)
    if (!u) return
    const rt = sim.rt(u)
    if (rt.guestId !== ally.id) return
    // canon: Special Guest duration drops by 1 at the start of that character's turn
    const left = ((rt.guestTurns as number) ?? 0) - 1
    rt.guestTurns = left
    if (left <= 0) {
      rt.guestId = undefined
      rt.guestTurns = 0
      sim.removeBuff(ally, GUEST)
      sim.log(`${ally.name} is no longer the Special Guest`)
    } else sim.log(`${ally.name} — Special Guest: ${left} turn(s) left`)
  },

  // Summer Songbirds' own turn (Fever only) — Memosprite Skill "Chirrup Quartet"
  onSummonTurn(sim, birds, u, ctx) {
    const rt = sim.rt(u)
    if (rt.fever !== true) {
      sim.log(`-- ${birds.name} is not on the Action Order (no Fever)`)
      return
    }
    const eid = (ctx.eidolon as number) ?? 0
    const ml = memLevels(ctx)
    const v = (rt.vibes as number) ?? 0
    const m = mult(PID, 'mem_skill_a2', ml.skill) * (eid >= 6 ? 2 : 1)
    sim.hitAoe(birds, { type: 'skill', elem: 'Wind', scaleStat: 'hp', mult: m, toughDmg: 30, memoSkill: true, label: 'Chirrup Quartet' })
    // E1 "Stray Bird of Summer": True DMG to the highest-HP enemy = (11% + Vibes × 0.1%) of the tally
    const tally = (rt.tally as number) ?? 0
    if (eid >= 1 && tally > 0) {
      const es = sim.livingEnemiesOf(u)
      const top = es.length ? es.reduce((m2, e) => (e.hp > m2.hp ? e : m2)) : undefined
      if (top) {
        const amt = tally * (0.11 + v * 0.001)
        if (amt > 0) {
          sim.trueDamage(birds, top, amt)
          sim.log(`E1 Stray Bird of Summer: Summer Songbirds deal ${Math.round(amt).toLocaleString()} True DMG to ${top.name}`)
        }
      }
      rt.tally = tally * 0.5
    }
  },

  // Fever countdown turn → deduct #10 (50%) of current Vibes (minimum #6 = 12)
  onCcEnd(sim, u, ctx) {
    const rt = sim.rt(u)
    if (rt.fever !== true) return
    const eid = (ctx.eidolon as number) ?? 0
    const ml = memLevels(ctx)
    if (eid >= 6) {
      sim.gainEnergyFlat(u, 140)
      sim.log(`E6 A Song Yet Unnamed: the Fever countdown's turn — ${u.name} regenerates a fixed 140 Energy`)
      maybeStoreUlt(sim, u, ctx)
    }
    const v = (rt.vibes as number) ?? 0
    const cut = Math.max(mult(PID, 'mem_talent_a6', ml.talent), Math.round(v * mult(PID, 'mem_talent_a10', ml.talent)))
    const after = Math.max(0, v - cut)
    rt.vibes = after
    sim.log(`Fever countdown: −${v - after} Vibes (${after} left)`)
    if (after <= 0) {
      endFever(sim, u, ctx)
      return
    }
    refreshFeverMods(sim, u, ctx)
    armCountdown(sim, u, ctx)
  },

  onAllyHeal(sim, target, _amount, ctx, src) {
    const u = sim.allies('ally').find(x => x.kitId === PID && !x.dead)
    if (!u) return
    const b = birdsOf(sim, u)
    if (target.id !== u.id && target.id !== b?.id) return
    if (!src || src.id === u.id || src.id === b?.id) return
    const rt = sim.rt(u)
    // Trace "Improvised Blues": heal from a TEAMMATE → 12 Groove (cap 12)
    const g = Math.min(12, ((rt.groove as number) ?? 0) + 12)
    rt.groove = g
    sim.log(`Improvised Blues: ${u.name} gains 12 Groove (${g}/12)`)
    // Talent: heal for the first time in any target's turn → +1 Vibes
    if (firstHealThisTurn(sim, rt, src)) addVibes(sim, u, ctx, 1, src)
  },

  onAllyShield(sim, target, _amount, ctx, src) {
    const u = sim.allies('ally').find(x => x.kitId === PID && !x.dead)
    if (!u) return
    const b = birdsOf(sim, u)
    if (target.id !== u.id && target.id !== b?.id) return
    if (!src || src.id === u.id || src.id === b?.id) return
    const rt = sim.rt(u)
    const g = Math.min(12, ((rt.groove as number) ?? 0) + 12)
    rt.groove = g
    sim.log(`Improvised Blues: ${u.name} gains 12 Groove (${g}/12)`)
    if (firstHealThisTurn(sim, rt, src)) addVibes(sim, u, ctx, 1, src)
  },

  onUnitDeath(sim, u) {
    // owner death: drop the Songbirds + the Zone, no Fever to close
    const b = birdsOf(sim, u)
    if (b) sim.unregisterUnit(b.id)
    disarmCountdown(sim, u)
    sim.rt(u).fever = false
    for (const a of sim.allies(u.side)) if (a.kind === 'char') sim.removeBuff(a, ZONE)
    for (const e of sim.livingEnemiesOf(u)) sim.removeBuff(e, MEMBER)
  },
}

