// Kits of the Hunt path, merged from the former per-character modules (12 kits).
// Bodies are verbatim; only module-local names that collided across kits are suffixed with their kit id.
import { decideByPattern, levelsOf, manualTarget, type KitDef, type SimApi, type KitRuntime } from '../kit'
import type { AbilityLevels, AbilityType, Unit, DmgType, StatKey, Elem } from '../entities/Unit'
import type { Mod } from '../effects/Buff'
import { mult, PROG } from '../progression'
import { eff } from '../combat/StatResolver'
import { computeBreakDamage } from '../combat/DamageCalculator'

// ===== seele  (was seele.ts) =====
function findSeele(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'seele' && !u.dead)
}

function enterAmplification(sim: SimApi, u: Unit, lv: AbilityLevels): void {
  sim.addBuff(u, {
    id: 'amplif', name: 'Resurgence',
    mods: [{ stat: 'dmgAll', value: mult('seele', 'talent', lv.talent) }, { stat: 'resPen:Quantum', value: 0.25 }],
    turns: 3,
  })
}

// E1 Extirpating Slash: target ≤80% HP → critRate +15% AND ignore 20% of target DEF
function e1Apply(sim: SimApi, u: Unit, t: Unit, eid: number): void {
  if (eid < 1 || t.hp / t.maxHp > 0.8) return
  sim.addBuff(u, { id: 'seele_e1', name: 'Extirpating Slash', mods: [{ stat: 'critRate', value: 0.15 }], turns: 1 })
  sim.addBuff(t, { id: 'seele_e1_def', name: 'Extirpating Slash DEF↓', mods: [{ stat: 'defIgnore', value: 0.2 }], turns: 1 })
}

function e1Clean(sim: SimApi, u: Unit, t: Unit): void {
  sim.removeBuff(u, 'seele_e1')
  sim.removeBuff(t, 'seele_e1_def')
}

export function lowestHpEnemy(sim: SimApi, u: Unit): Unit | undefined {
  const list = sim.livingEnemiesOf(u)
  if (!list.length) return undefined
  return list.reduce((m, e) => (e.hp < m.hp ? e : m), list[0])
}

function pickTarget(sim: SimApi, u: Unit): Unit | undefined {
  return lowestHpEnemy(sim, u)
}

export const seeleKit: KitDef = {
  id: 'seele',
  name: 'Seele',
  elem: 'Quantum',
  energyMax: 120,
  base: { level: 80, hp: 931, atk: 640, def: 363, spd: 115, critRate: 0.05, critDmg: 0.5 },
  // 1110207 "Phantom Illusion": Quantum DMG = Seele's Skill multiplier to a random enemy, guaranteed CRIT.
  technique: {
    name: 'Phantom Illusion',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      const enemies = sim.livingEnemiesOf(u)
      if (!enemies.length) return
      sim.hit(u, sim.rngPick(enemies), { type: 'skill', mult: mult('seele', 'skill', lv.skill), elem: 'Quantum', forceCrit: true, toughDmg: 20, label: 'Phantom Illusion' })
    },
  },
  onStart(sim, u) {
    u.aggro = 75
    sim.rt(u).bfSeq = -1
  },
  onTurnStart(_sim, u) {
    u.aggro = u.hp / u.maxHp <= 0.5 ? 50 : 75
  },
  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx, true)
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const target = pickTarget(sim, u)!
      e1Apply(sim, u, target, eid)
      const dealt = sim.hit(u, target, { type: 'ult', mult: mult('seele', 'ult', lv.ult), toughDmg: 30, label: 'Butterfly Flurry' })
      e1Clean(sim, u, target)
      enterAmplification(sim, u, lv)
      // E6: Butterfly Flurry — target takes 30% of the ult's dealt damage as True DMG on each attack, 3 turns
      if (eid >= 6 && !target.dead) {
        sim.addBuff(target, {
          id: 'seele_e6', name: 'Butterfly Flurry',
          mods: [], turns: 3,
          sourceId: u.id,
          payload: dealt,
        })
      }
      sim.log(`${u.name} Butterfly Flurry (energy +5)`) // +5 from castUlt
      return
    }
    if (action.kind === 'skill') {
      const free = !!ctx.inExtraTurn // Resurgence auto Skill: no SP, no energy (1110202)
      if (!free && !sim.spendSp(1)) return
      if (!free) sim.gainEnergy(u, 30)
      sim.addBuff(u, { id: 'seele_spd', name: 'Resurgence', mods: [{ stat: 'spdPct', value: 0.25 }], turns: 3, maxStacks: eid >= 2 ? 2 : 1 })
      const t = manualTarget(sim, action, pickTarget(sim, u)!)
      e1Apply(sim, u, t, eid)
      sim.hit(u, t, { type: 'skill', mult: mult('seele', 'skill', lv.skill), toughDmg: 20, label: free ? 'Sheathed Blade (Auto)' : 'Sheathed Blade', split: [0.2, 0.1, 0.1, 0.6] })
      e1Clean(sim, u, t)
      if (free) sim.log(`${u.name} Resurgence auto Skill → ${t.name}`)
      return
    }
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = pickTarget(sim, u)!
    e1Apply(sim, u, t, eid)
    sim.hit(u, t, { type: 'basic', mult: mult('seele', 'basic', lv.basic), toughDmg: 10, label: 'Thwack', split: [0.3, 0.7] })
    e1Clean(sim, u, t)
    sim.advance(u, 0.20)
  },

  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (target.dead) return
    // --- E6 Butterfly Flurry: 1 true-DMG instance = 30% of ult damage dealt, per attack ---
    const bf = target.buffs.find(b => b.id === 'seele_e6')
    if (bf) {
      const seele = findSeele(sim)
      if (seele && !seele.dead) {
        const rt = sim.rt(seele)
        const seq = sim.attackNo()
        if (rt.bfSeq !== seq) {
          rt.bfSeq = seq
          const ultDmg = (bf.payload as number) || 0
          const addDmg = Math.floor(ultDmg * 0.3)
          if (addDmg > 0) sim.trueDamage(seele, target, addDmg)
        }
      }
    }
  },

  onKill(sim, u, _victim, ctx) {
    const rt = sim.rt(u)
    // A2 Nightshade: defeat enemy → DMG+50%, stacks ×3, 3 turns
    sim.addBuff(u, { id: 'seele_nightshade', name: 'Nightshade', mods: [{ stat: 'dmgAll', value: 0.50 }], turns: 3, maxStacks: 3 })
    // E4 Flitting Phantasm: +15 Energy per defeat
    if (((ctx.eidolon as number) ?? 0) >= 4) {
      sim.gainEnergy(u, 15)
      sim.log('Seele E4: +15 Energy')
    }
    // Resurgence: Amplification + extra turn, but not from kills during the extra turn
    if (rt.inExtraTurn) return
    if (!sim.hasBuff(u, 'amplif')) enterAmplification(sim, u, levelsOf(ctx))
    if (sim.livingEnemiesOf(u).length) sim.grantExtraTurn(u)
  },
}


// ===== danheng  (was danheng.ts) =====
// A4 Faster Than Light: 50% FIXED chance +20% SPD for 2 turns after launching an attack (canon, via sim.rng)
function spdRush(sim: SimApi, target: Unit, u: Unit): void {
  void target
  if (sim.rng() < 0.5) sim.addBuff(u, { id: 'danheng_a4', name: 'Faster Than Light', mods: [{ stat: 'spdPct', value: 0.20 }], turns: 2 })
}

function isSlowed(sim: SimApi, t: Unit): boolean {
  return t.buffs.some(b => b.mods.some(m => m.stat === 'spdDown'))
}

function findDanHeng(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'danheng' && !u.dead)
}

export const danhengKit: KitDef = {
  id: 'danheng',
  name: 'Dan Heng',
  elem: 'Wind',
  energyMax: 100,
  base: { ...PROG.danheng.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 100207 "Splitting Spearhead": at battle start, self ATK +40% for 3 turns.
  technique: {
    name: 'Splitting Spearhead',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'danheng_tech', name: 'Splitting Spearhead ATK↑', mods: [{ stat: 'atkPct', value: 0.4 }], turns: 3 })
    },
  },
  onStart(_sim, u) {
    u.aggro = 75
  },
decide(sim, u, ctx) {
    // Resurgence extra turn: free automatic Skill (no SP, no energy)
    if (ctx.inExtraTurn) return { kind: 'skill' }
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx, true)
  },
  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const target = manualTarget(sim, action, enemies[0])

    // E1: +12% CRIT Rate vs targets at ≥50% HP
    const amp = () => {
      if (eid >= 1 && target.hp / target.maxHp >= 0.5)
        sim.addBuff(u, { id: 'danheng_e1', name: 'The Higher You Fly, the Harder You Fall', mods: [{ stat: 'critRate', value: 0.12 }], turns: 1 })
    }
    const deamp = () => sim.removeBuff(u, 'danheng_e1')

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      ctx.ultKilling = true
      amp()
      const mult_ = mult('danheng', 'ult', lv.ult) + (isSlowed(sim, target) ? mult('danheng', 'ult_a2', lv.ult) : 0)
      sim.hit(u, target, { type: 'ult', mult: mult_, toughDmg: 30, label: 'Ethereal Dream' })
      deamp()
      // sp_base 5: castUlt refunds +5 Energy after a fired ult
      sim.log('Ethereal Dream (energy +5)')
      spdRush(sim, target, u)
      ctx.ultKilling = false
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      amp()
      // Slow is crit-gated: base chance 100% but only on a CRIT hit; E6 deepens it
      sim.hit(u, target, {
        type: 'skill', mult: mult('danheng', 'skill', lv.skill), toughDmg: 20, label: 'Cloudlancer Art: Torrent',
        split: [0.3, 0.15, 0.15, 0.4],
        onCrit: () => sim.applyDebuff(u, target, 1.0,
          () => sim.addBuff(target, {
            id: 'danheng_slow', name: 'Cloudlancer Art: Torrent SPD↓', debuff: true,
            mods: [{ stat: 'spdDown', value: eid >= 6 ? 0.20 : 0.12 }], turns: 2,
          }), 'Slow (Torrent)'),
      })
      deamp()
      spdRush(sim, target, u)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    amp()
    // A6 High Gale: Basic ATK deals 40% more DMG to Slowed enemies (multiplicative)
    const baseB = mult('danheng', 'basic', lv.basic)
    const basicMult = isSlowed(sim, target) ? baseB * 1.4 : baseB
    if (isSlowed(sim, target)) sim.log('Dan Heng A6: +40% basic vs slowed')
    sim.hit(u, target, { type: 'basic', mult: basicMult, toughDmg: 10, label: 'Cloudlancer Art: North Wind', split: [0.45, 0.55] })
    deamp()
    spdRush(sim, target, u)
  },

  onAllyHit(sim, _attacker, target, _dmg, _ctx) {
    if (target.kind !== 'char') return
    // A2 Succubus: below 50% HP → reduced aggro
    const low = target.hp < target.maxHp * 0.5
    if (low && !sim.hasBuff(target, 'danheng_a2'))
      sim.addBuff(target, { id: 'danheng_a2', name: 'Hidden Dragon', mods: [{ stat: 'aggro', value: -150 }] })
    else if (!low && sim.hasBuff(target, 'danheng_a2')) sim.removeBuff(target, 'danheng_a2')
  },

  // Talent Wild Wind: an ally's ability makes Dan Heng's next attack Wind RES PEN up
  onAllyTurnStart(sim, ally, ctx) {
    if (ally.id === (findDanHeng(sim)?.id)) return
    grantTalent(sim, ctx)
  },
  onAllyUlt(sim, ally, ctx) {
    if (ally.kind !== 'char') return
    grantTalent(sim, ctx)
  },

  // E4: Ultimate kill → act again
  onKill(sim, u, _victim, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 4 && ctx.ultKilling && sim.livingEnemiesOf(u).length) sim.grantExtraTurn(u)
  },
}

function grantTalent(sim: SimApi, ctx: KitRuntime): void {
  const dh = findDanHeng(sim)
  if (!dh) return
  sim.addBuff(dh, {
    id: 'danheng_talent', name: 'Superiority of Reach',
    mods: [{ stat: 'resPen:Wind', value: mult('danheng', 'talent', levelsOf(ctx).talent) }], turns: 1,
  })
}

// ===== topaz  (was topaz.ts) =====
function levelsOf_topaz(ctx: { levels?: AbilityLevels }): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
}

function numbyOf(sim: SimApi, u: Unit): Unit | undefined {
  return sim.find(`nb_${u.id}`)
}

function podTarget(sim: SimApi, u: Unit): Unit | undefined {
  const enemies = sim.livingEnemiesOf(u)
  return enemies.find(e => sim.hasBuff(e, 'topaz_pod')) ?? lowestHpEnemy(sim, u) ?? undefined
}

function applyPod(sim: SimApi, u: Unit, target: Unit, ctx: { levels?: AbilityLevels }): void {
  // no living enemy on this turn (last one died to a prior follow-up) — nothing to mark
  if (!target) return
  for (const e of sim.livingEnemiesOf(u))
    if (e.id !== target.id) {
      sim.removeBuff(e, 'topaz_pod')
      sim.removeBuff(e, 'topaz_debtor') // E1 Debtor travels with Proof of Debt
    }
  sim.addBuff(target, {
    id: 'topaz_pod', name: 'Proof of Debt FUA Taken+',
    mods: [{ stat: 'vulnType:fua', value: mult('topaz', 'skill_a2', levelsOf_topaz(ctx).skill) }],
    turns: 0,
  })
}

export const topazKit: KitDef = {
  id: 'topaz',
  name: 'Topaz & Numby',
  elem: 'Fire',
  energyMax: 130,
  base: { ...PROG.topaz.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #111207 "Explicit Subsidy" (Technique): Topaz +60 Energy after Numby's first attack.
  technique: {
    name: 'Explicit Subsidy',
    kind: 'buff',
    apply(sim, u, ctx) {
      ctx.numbyTech = 60
      sim.log(`${u.name} Technique: Numby's first attack → +60 Energy`)
    },
  },
  onStart(sim, u) {
    // Talent "Trotter Market!?": Numby is summoned at battle start (SPD 80, own AV timeline)
    const nb: Unit = {
      id: `nb_${u.id}`, name: 'Numby', side: 'ally', kind: 'summon', elem: 'Fire',
      sharesOwnerBuffs: true,
      // Summon.md: "they use the current stats of their characters" — Topaz's base + Topaz's
      // buffs (merged per hit), Numby's own fixed SPD 80, no HP of its own.
      base: { ...u.base, hp: 1, spd: 80 },
      hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
      buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
      weaknesses: [], res: {}, kitId: u.kitId,
    }
    const nrt = sim.rt(nb)
    nrt.ownerId = u.id
    sim.registerUnit(nb)
    sim.log(`${u.name} summons Numby (SPD 80)`)
  },

  onUnitDeath(sim, u) {
    const nb = numbyOf(sim, u)
    if (!nb) return
    sim.unregisterUnit(nb.id)
    sim.log('Numby disappears: Topaz is down')
  },
  decide(sim, u, _ctx) {
    return { kind: sim.sp() >= 1 ? 'skill' : 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf_topaz(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const nb = numbyOf(sim, u)
    if (!nb) return
    const target = podTarget(sim, u)!
    const nctx = sim.rt(nb)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      // Windfall Effect: Numby DMG +, Crit DMG +, 2 attacks (E6 +1 → 3). No action advance.
      nctx.numby = { cd: mult('topaz', 'ult_a2', lv.ult), attacks: eid >= 6 ? 3 : 2 }
      sim.log(`${u.name} Ult: Turn a Profit! — Windfall Effect, Numby attacks ${eid >= 6 ? 3 : 2}×`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      applyPod(sim, u, target, ctx)
      const fw = target.weaknesses.includes('Fire')
      // A4 Financial Turmoil: +15% DMG vs Fire-weak applies to Topaz's own hits too, not Numby-only
      if (fw) sim.addBuff(u, { id: 'topaz_a4', name: 'Financial Turmoil', mods: [{ stat: 'dmgAll', value: 0.15 }], turns: 99 })
      // PoD = most recent target; skill DMG counts as a Follow-up ATK (E1/advance gates see it via Topaz kitId)
      // 111202 Notes: 7 hits of 1/7, or 8 hits 10%x7+30% while Numby is in Windfall Bonanza
      const wind = sim.rt(nb).numby
      sim.hit(u, target, { type: 'skill', also: ['fua'], mult: mult('topaz', 'skill', lv.skill), toughDmg: 10, label: 'Difficulty Paying?', split: wind ? [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.3] : [1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7] })
      if (fw) sim.removeBuff(u, 'topaz_a4')
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const fwBasic = target.weaknesses.includes('Fire')
    if (fwBasic) sim.addBuff(u, { id: 'topaz_a4', name: 'Financial Turmoil', mods: [{ stat: 'dmgAll', value: 0.15 }], turns: 99 })
    // A2 Overdraft: Basic ATK counts as a Follow-up ATK
    sim.hit(u, target, { type: 'basic', mult: mult('topaz', 'basic', lv.basic), toughDmg: 10, label: 'Deficit...' })
    if (fwBasic) sim.removeBuff(u, 'topaz_a4')
  },

  onSummonTurn(sim, nb, owner, ctx) {
    const lv = levelsOf_topaz(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const target = podTarget(sim, owner)
    // E4 Agile Operation: Numby's turn begins → Topaz +20% action advance
    if (eid >= 4) { sim.advance(owner, 0.2); sim.log('Topaz E4: action advanced 20%') }
    if (!target) return
    let numbyMult = mult('topaz', 'talent', lv.talent)
    const nctx = sim.rt(nb)
    const wind = nctx.numby as { cd: number; attacks: number } | undefined
    if (wind) {
      numbyMult *= 1 + mult('topaz', 'ult', lv.ult)
      sim.addBuff(nb, { id: 'numby_wind', name: 'Turn a Profit!', mods: [{ stat: 'critDmg', value: wind.cd }], turns: 1 })
      // E6 Incentive Mechanism: Numby Fire RES PEN +10% while Windfall active
      if (eid >= 6) sim.addBuff(nb, { id: 'numby_e6', name: 'Incentive Mechanism', mods: [{ stat: 'resPen:Fire', value: 0.1 }], turns: 1 })
      wind.attacks--
      if (wind.attacks <= 0) delete nctx.numby
      sim.gainEnergy(owner, 10) // A6 Stonks Market: Windfall attack → Topaz +10 Energy
      sim.log('Topaz A6 Stonks Market: +10 Energy')
    }
    // A4 Financial Turmoil: Numby DMG +15% only while hitting a Fire-weak enemy (transient, per hit)
    const fireWeak = target.weaknesses.includes('Fire')
    if (fireWeak) sim.addBuff(nb, { id: 'topaz_a4', name: 'Financial Turmoil', mods: [{ stat: 'dmgAll', value: 0.15 }], turns: 99 })
    // canon: Numby attacks with Topaz's stats. Numby's base is a copy of the wearer's base, so
    // `eff(nb).atk` already resolves the wearer's live ATK — and `hitDigit` merges the wearer's
    // whole buff list in, which is what picks up owner atk buffs AND Numby's own direct buffs.
    // Do NOT pass `statValue` here: it would bypass the merge and ignore buffs aimed at Numby.
    sim.hit(nb, target, { type: 'fua', mult: numbyMult, toughDmg: 10, label: 'Numby', split: [1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7, 1 / 7] })
    const trt = sim.rt(owner) as Record<string, unknown>
    if (trt.numbyTech) { sim.gainEnergy(owner, trt.numbyTech as number); trt.numbyTech = 0; sim.log('Topaz Technique: Numby first attack → +60 Energy') }
    if (fireWeak) sim.removeBuff(nb, 'topaz_a4')
    if (eid >= 2) { sim.gainEnergy(owner, 5); sim.log('Topaz E2: Numby hit → +5 Energy') }
    sim.log(`-- ${nb.name} acts${wind ? ' (Windfall)' : ''}`)
  },

  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    if (target.side !== 'enemy' || target.dead || attacker.side !== 'ally' || attacker.dead) return
    if (!sim.hasBuff(target, 'topaz_pod')) return
    const u = sim.allies('ally').find(a => a.kitId === 'topaz' && !a.dead)
    if (!u) return
    const rt = sim.rt(u)
    const seq = sim.attackNo()
    const eid = (ctx.eidolon as number) ?? 0
    // A2 Overdraft + canon: Topaz's Skill also counts as a Follow-up ATK
    const isFua = dmgType === 'fua' || (attacker.kitId === 'topaz' && (dmgType === 'skill' || dmgType === 'basic'))

    // E1 Future Market: FUA on a PoD enemy makes it a Debtor (+25% FUA CRIT DMG taken, 2 stacks,
    // once per attack, removed with PoD)
    if (eid >= 1 && isFua && rt.e1Seq !== seq) {
      rt.e1Seq = seq
      sim.addBuff(target, {
        id: 'topaz_debtor', name: 'Difficulty Paying? FUA Crit Taken+',
        mods: [{ stat: 'critDmgTaken:fua', value: 0.25 }],
        turns: Infinity, maxStacks: 2, // tracks PoD: removed on pod transfer, not turn-ticked
      })
      sim.log('Topaz E1: Debtor (FUA CRIT DMG taken +25%)')
    }

    // Talent #3 + Ult #3: ally B/S/U or FUA on a PoD enemy → Numby action advance 50%
    // (Talent: cannot trigger during Numby's own turn; Ult: only ally attacks)
    const nb = numbyOf(sim, u)
    if (!nb || attacker === nb || attacker.kind !== 'char') return
    if (rt.advSeq === seq) return
    rt.advSeq = seq
    sim.advance(nb, 0.5)
    sim.log(`${u.name}: Numby advance 50% (${attacker.name} ${dmgType} on PoD)`)
  },

  // Talent: when an ally's turn starts or takes action and no PoD enemy exists → Topaz marks a random one
  onAllyTurnStart(sim, _ally, ctx) {
    const u = sim.allies('ally').find(a => a.kitId === 'topaz' && !a.dead)
    if (!u) return
    const enemies = sim.livingEnemiesOf(u)
    if (enemies.length && !enemies.some(e => sim.hasBuff(e, 'topaz_pod'))) {
      applyPod(sim, u, podTarget(sim, u)!, ctx)
    }
  },
}

// ===== yanqing  (was yanqing.ts) =====
const SOULSTEEL = 'yanqing_soulsteel'
const ULT = 'yanqing_ult'
const E4 = 'yanqing_e4'
const A6 = 'yanqing_a6'

interface DoTWithSource extends NonNullable<Unit['dots'][number]> {
  sourceUnit?: Unit
}

function eid(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

function isFrozen(t: Unit): boolean {
  return t.dots.some(d => d.kind === 'Freeze')
}

function applySoulsteel(sim: SimApi, u: Unit, ctx: KitRuntime, turns: number): void {
  const lv = levelsOf(ctx)
  const mods: Mod[] = [
    { stat: 'critRate', value: mult('yanqing', 'talent_a2', lv.talent) },
    { stat: 'critDmg', value: mult('yanqing', 'talent_a3', lv.talent) },
    { stat: 'effRes', value: 0.2 },
  ]
  if (eid(ctx) >= 2) mods.push({ stat: 'err', value: 0.1 })
  sim.addBuff(u, { id: SOULSTEEL, name: 'Soulsteel Sync', mods, turns })
  u.aggro = 50
  sim.log(`${u.name}: Soulsteel Sync`)
}

function critSpd(sim: SimApi, u: Unit): void {
  sim.addBuff(u, { id: A6, name: 'Gentle Blade', mods: [{ stat: 'spdPct', value: 0.1 }], turns: 2 })
}

function afterHitDmg(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime): void {
  const onCrit = (): void => critSpd(sim, u)
  if (eid(ctx) >= 1 && isFrozen(target)) {
    sim.hit(u, target, { type: 'add', noSeq: true, mult: 0.6, toughDmg: 0, label: 'E1 Svelte Saber', onCrit })
    sim.log(`${u.name} E1 Svelte Saber`)
  }
  for (const t of sim.livingEnemiesOf(u)) {
    if (!t.weaknesses.includes('Ice')) continue
    sim.hit(u, t, { type: 'add', noSeq: true, mult: 0.3, toughDmg: 0, label: 'A2 Icing on the Kick', onCrit })
    sim.log(`${u.name} A2 Icing on the Kick`)
  }
}

export const yanqingKit: KitDef = {
  id: 'yanqing',
  name: 'Yanqing',
  elem: 'Ice',
  energyMax: 140,
  base: { ...PROG.yanqing.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // 120907 "The One True Sword": Yanqing deals +30% DMG for 2 turns at battle start. Canon gates
  // this to targets at ≥50% HP; the condition is not modelled here (ungated approximation).
  technique: {
    name: 'The One True Sword',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'yanqing_tech', name: 'The One True Sword', mods: [{ stat: 'dmgAll', value: 0.30 }], turns: 2 })
    },
  },
  onStart(_sim, _u, ctx) {
    ctx.atkSeq = -1
    ctx.yqProc = false
  },
  onTurnStart(sim, u, ctx) {
    u.aggro = sim.hasBuff(u, SOULSTEEL) ? 50 : 75
    if (eid(ctx) < 4) return
    if (u.hp / Math.max(1, u.maxHp) >= 0.8) {
      sim.addBuff(u, { id: E4, name: 'Searing Sting', mods: [{ stat: 'resPen:Ice', value: 0.12 }], turns: 1 })
    } else {
      sim.removeBuff(u, E4)
    }
  },
  onAllyHit(sim, _attacker, target, dmg) {
    if (target.kitId !== 'yanqing' || target.side !== 'ally' || dmg <= 0) return
    if (!sim.hasBuff(target, SOULSTEEL)) return
    sim.removeBuff(target, SOULSTEEL)
    target.aggro = 75
    sim.log(`${target.name}: Soulsteel Sync lost (took damage)`)
  },
  onKill(sim, u, _victim, ctx) {
    if (eid(ctx) < 6) return
    for (const id of [SOULSTEEL, ULT]) {
      const b = u.buffs.find(x => x.id === id)
      if (b) sim.addBuff(u, { ...b, turns: (b.turns ?? 1) + 1 })
    }
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
    const onCrit = (): void => critSpd(sim, u)

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const mods: Mod[] = [{ stat: 'critRate', value: 0.6 }]
      if (sim.hasBuff(u, SOULSTEEL)) mods.push({ stat: 'critDmg', value: mult('yanqing', 'ult_a2', lv.ult) })
      sim.addBuff(u, { id: ULT, name: 'Amidst the Raining Bliss', mods, turns: 2 })
      const primary = manualTarget(sim, action, enemies[0])
      sim.hit(u, primary, { type: 'ult', mult: mult('yanqing', 'ult', lv.ult), toughDmg: 15, label: 'Amidst the Raining Bliss', onCrit })
      sim.log(`${u.name} [ULT] Amidst the Raining Bliss`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      applySoulsteel(sim, u, ctx, 2)
      const primary = manualTarget(sim, action, enemies[0])
      sim.hit(u, primary, { type: 'skill', mult: mult('yanqing', 'skill', lv.skill), toughDmg: 20, label: 'Darting Ironthorn', split: [0.25, 0.25, 0.25, 0.25], onCrit })
      sim.log(`${u.name} [SKILL] Darting Ironthorn`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const primary = manualTarget(sim, action, enemies[0])
    sim.hit(u, primary, { type: 'basic', mult: mult('yanqing', 'basic', lv.basic), toughDmg: 10, label: 'Frost Thorn', split: [0.5, 0.25, 0.25], onCrit })
    sim.log(`${u.name} [BASIC] Frost Thorn`)
  },
  onAfterAttack(sim, attacker, target, _dmgType, _ctx, _dmg) {
    if (attacker.kitId !== 'yanqing' || target.side !== 'enemy' || target.dead) return
    const ctx = sim.rt(attacker)
    if (ctx.yqProc) return
    const seq = sim.attackNo()
    if ((ctx.atkSeq as number) === seq) return
    ctx.atkSeq = seq
    ctx.yqProc = true
    const lv = levelsOf(ctx)
    afterHitDmg(sim, attacker, target, ctx)
    if (sim.hasBuff(attacker, SOULSTEEL) && sim.rng() < mult('yanqing', 'talent', lv.talent)) {
      sim.hit(attacker, target, { type: 'fua', mult: mult('yanqing', 'talent_a4', lv.talent), toughDmg: 10, label: 'Soulsteel Sync FUA', split: [0.3, 0.7], onCrit: () => critSpd(sim, attacker) })
      sim.log(`${attacker.name} Soulsteel Sync FUA`)
      if (!target.dead) {
        sim.applyDebuff(attacker, target, mult('yanqing', 'talent_a6', lv.talent), () => {
          sim.applyDot(target, {
            kind: 'Freeze', elem: 'Ice', turns: 1,
            baseDmg: sim.effAtk(attacker) * mult('yanqing', 'talent_a5', lv.talent),
            sourceUnit: attacker,
          } as unknown as DoTWithSource)
          sim.log(`${target.name} Frozen`)
        }, 'Freeze', 'Freeze')
      }
    }
    ctx.yqProc = false
  },
  onFrozenTurn(sim, u, _ctx) {
    const frozen = u.dots.find(d => d.kind === 'Freeze') as DoTWithSource | undefined
    if (!frozen?.sourceUnit || frozen.sourceUnit.kitId !== 'yanqing' || !(frozen.baseDmg > 0)) return
    sim.hit(frozen.sourceUnit, u, { type: 'dot', statValue: frozen.baseDmg * (frozen.stacks ?? 1), mult: 1, canCrit: false, defIgnore: frozen.defIgnore, label: 'Frozen Additional DMG', noSeq: true })
  },
}


// ===== feixiao  (was feixiao.ts) =====
interface FxRt extends KitRuntime {
  fuaThisTurn?: boolean
  fuaLastTurn?: boolean
  allyAttackCount?: number
  e2AureusCount?: number
  fxAttackSeq?: number
  e2Seq?: number
}

// Talent Thunderhunt: after an ally attacks → Feixiao FUA against the primary target, once per turn.
function thunderhuntFua(sim: SimApi, feixiao: Unit, ctx: KitRuntime, target?: Unit, force = false): void {
  const rt = sim.rt(feixiao) as FxRt
  if (!force) {
    if (rt.fuaThisTurn) return
    rt.fuaThisTurn = true
  }
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  rt.fuaLastTurn = true
  // Talent #5: +DMG 30% 2 turns
  sim.addBuff(feixiao, { id: 'feixiao_fua_dmg', name: 'Thunderhunt', mods: [{ stat: 'dmgAll', value: mult('feixiao', 'talent_a2', lv.talent) }], turns: 2 })
  // E4: FUA Toughness Reduction ×2 + SPD +8% 2t
  if (eid >= 4) sim.addBuff(feixiao, { id: 'feixiao_e4_spd', name: 'Stormward I Hear', mods: [{ stat: 'spdPct', value: 0.08 }], turns: 2 })
  // E6: Talent FUA's DMG is considered Ultimate DMG, mult +140%
  const mult6 = eid >= 6 ? 2.4 : 1
  const type = eid >= 6 ? 'ult' as const : 'fua' as const
  const also: DmgType[] | undefined = eid >= 6 ? ['fua'] : undefined
  const primary = target ?? sim.livingEnemiesOf(feixiao)[0]
  if (primary)
    sim.hit(feixiao, primary, { type, also, elem: 'Wind', mult: mult('feixiao', 'talent', lv.talent) * mult6, toughDmg: eid >= 4 ? 20 : 10, label: 'Thunderhunt FUA' })
  if (force) sim.log(`${feixiao.name} Thunderhunt FUA (Skill)`)
}

function flyingAureus(sim: SimApi, feixiao: Unit, n: number): void {
  feixiao.energy = Math.min(feixiao.maxEnergy, feixiao.energy + n)
  sim.log(`${feixiao.name} Flying Aureus +${n} (${feixiao.energy}/${feixiao.maxEnergy})`)
}

// every 2 ally attacks → +1 Flying Aureus
function aureusTick(sim: SimApi, feixiao: Unit, rt: FxRt): void {
  const nc = (rt.allyAttackCount as number) + 1
  rt.allyAttackCount = nc
  if (nc >= 2) {
    flyingAureus(sim, feixiao, 1)
    rt.allyAttackCount = 0
  }
}

export const feixiaoKit: KitDef = {
  id: 'feixiao',
  name: 'Feixiao',
  elem: 'Wind',
  energyMax: 12,
  // canon (Energy.md): Feixiao does not use the Energy system — ready at 6 Flying Aureus
  // (decide/perform `energy >= 6`), no sp_base +5 after the cast
  ultActivation: { kind: 'energy', at: 6 },
  ultConsumption: 'none',
  base: { ...PROG.feixiao.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // 122007 "Stormborn": after entering battle, +1 Flying Aureus and AoE 200% ATK Wind DMG at the
  // start of each wave, guaranteed to CRIT. apply models the battle-start wave. attack Technique.
  technique: {
    name: 'Stormborn',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      flyingAureus(sim, u, 1)
      sim.hitAoe(u, { type: 'basic', elem: 'Wind', mult: 2.0, toughDmg: 10, label: 'Stormborn', forceCrit: true })
    },
  },
  onStart(sim, u, ctx) {
    if ((ctx.skillPriority as number) >= 0) {
      // A1 Heavenpath: +3 Flying Aureus at battle start
      flyingAureus(sim, u, 3)
    }
    // A4 Formshift: FUA CRIT DMG +36%; Ultimate is considered a Follow-Up ATK
    sim.addBuff(u, { id: 'feixiao_formshift', name: 'Formshift', mods: [{ stat: 'critDmg:fua', value: 0.36 }], turns: Infinity })
    const rt = sim.rt(u) as FxRt
    rt.allyAttackCount = 0
    rt.fuaThisTurn = false
    rt.fuaLastTurn = false
    rt.e2AureusCount = 0
  },
  decide(sim, u, _ctx) {
    if (u.energy >= 6) return { kind: 'ult' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },
  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < 6) return
      u.energy -= 6
      const target = enemies[0]
      // E1: launching Blitz/Skyward → Ult DMG +10% (stack up to 5, until end of Ult)
      let stacks = 0
      for (let i = 0; i < 6; i++) {
        // Blitz (+DMG vs broken) / Skyward (+DMG vs not broken): same value, always applies.
        // Ult ignores Weakness Type (pierce) and, while target intact, WBE +100%.
        const blitzMult = mult('feixiao', 'blitz', lv.ult) + mult('feixiao', 'blitz_a2', lv.ult)
        // Canon 122003: the mid-ult strike switches by target state — Waraxe Skyward (122009) while
        // intact, Boltsunder Blitz (122008) while Broken. Ladders are symmetric, so the mult is fixed.
        const strike = target.broken ? 'Boltsunder Blitz' : 'Waraxe Skyward'
        sim.hit(u, target, { type: 'ult', also: ['fua'], elem: 'Wind', mult: blitzMult * (1 + Math.min(stacks, 5) * 0.1), toughDmg: 5, pierceRatio: 1, wbeBonus: 1, label: strike })
        if (eid >= 1) stacks = Math.min(5, stacks + 1)
      }
      // E6: Ult All-Type RES PEN +20%
      if (eid >= 6) sim.addBuff(target, { id: 'feixiao_e6_respen', name: 'Homeward I Near Wind RES↓', mods: [{ stat: 'resPen:Wind', value: 0.2 }], turns: 1 })
      const e1Terrasplit = eid >= 1 ? 1 + stacks * 0.1 : 1
      sim.hit(u, target, { type: 'ult', also: ['fua'], elem: 'Wind', mult: mult('feixiao', 'ult', lv.ult) * e1Terrasplit, toughDmg: 10, pierceRatio: 1, wbeBonus: 1, label: 'Terrasplit' })
      sim.log(`${u.name} Ult: Terrasplit (+6 Blitz, E1 stacks ${stacks})`)
      return
    }

    if (action.kind === 'skill') {
      const primary = manualTarget(sim, action, enemies[0])
      // A3 Boltcatch: Skill → ATK +48% 3t
      sim.addBuff(u, { id: 'feixiao_boltcatch', name: 'Boltcatch', mods: [{ stat: 'atkPct', value: 0.48 }], turns: 3 })
      if (sim.spendSp(1)) {
        sim.hit(u, primary, { type: 'skill', mult: mult('feixiao', 'skill', lv.skill), elem: 'Wind', toughDmg: 20, label: 'Waraxe', split: [0.34, 0.33, 0.33] })
        // Skill Waraxe: immediately launches 1 extra instance of Talent's FUA against the target
        thunderhuntFua(sim, u, ctx, primary, true)
        sim.log(`${u.name} Skill: Waraxe`)
      }
      return
    }

    sim.gainSp(1)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('feixiao', 'basic', lv.basic), elem: 'Wind', toughDmg: 10, label: 'Boltsunder', split: [0.2, 0.2, 0.6] })
  },

  // Talent Thunderhunt: ally attacks → FUA against the primary target (once/turn); every 2 ally attacks → +1 FA.
  onAfterAttack(sim, attacker, target, dmgType, ctx) {
    const feixiao = sim.allies('ally').find(a => a.kitId === 'feixiao' && !a.dead)
    if (!feixiao) return
    if (target.side !== 'enemy') return
    const rt = sim.rt(feixiao) as FxRt
    const eid = (ctx.eidolon as number) ?? 0
    // Ultimate attacks do not grant Flying Aureus
    if (dmgType !== 'ult') {
      // attack-level gate: fireAfterAttack fires per hit, canon counts one attack per action
      const seq = sim.attackNo()
      if (rt.fxAttackSeq !== seq) {
        aureusTick(sim, feixiao, rt)
        rt.fxAttackSeq = seq
      }
      // E2 Moonward: each ally FUA instance → +1 FA (up to 6/turn)
      if (eid >= 2 && dmgType === 'fua' && (rt.e2AureusCount as number) < 6 && rt.e2Seq !== seq) {
        flyingAureus(sim, feixiao, 1)
        rt.e2AureusCount = ((rt.e2AureusCount as number) ?? 0) + 1
        rt.e2Seq = seq
      }
    }
    // Talent FUA triggered by teammate attacks (not Feixiao's own hits), vs the attacked primary target
    if (attacker !== feixiao && attacker.side === 'ally' && attacker.kind === 'char') thunderhuntFua(sim, feixiao, ctx, target)
  },

  // reset FUA trigger at start of Feixiao's turn
  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u) as FxRt
    // A1 Heavenpath: if no Talent FUA was launched last turn, counts as 1 attack toward FA
    rt.fxAttackSeq = -1
    if (!rt.fuaLastTurn) aureusTick(sim, u, rt)
    rt.fuaLastTurn = false
    rt.fuaThisTurn = false
    rt.e2AureusCount = 0
  },
}

// ===== dr_ratio  (was dr_ratio.ts) =====
function debuffCount(_sim: SimApi, target: Unit): number {
  // real debuff count on the target: DoT statuses + negative buffs + broken state
  let n = target.dots.length
  n += target.buffs.filter(b =>
    b.mods.some(m =>
      m.stat === 'defRed' || m.stat === 'spdDown' || m.stat === 'weaken' ||
      m.stat === 'dotVuln' || m.stat === 'vulnAll' || m.stat.startsWith('vuln:') || m.stat.startsWith('vulnType:') ||
      (m.stat === 'effRes' && m.value < 0)))
    .length
  if (target.broken) n += 1
  return n
}

function triggerFua(sim: SimApi, ratio: Unit, target: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  // canon: if target defeated before FUA triggers, direct FUA at a single random enemy instead
  if (target.dead) {
    const pool = sim.livingEnemiesOf(ratio)
    if (!pool.length) return
    target = sim.rngPick(pool)
  }
  const fuaMult = mult('ratio', 'talent', lv.talent) + (eid >= 6 ? mult('ratio', 'talent', lv.talent) * 0.5 : 0)
  // Deduction: target with ≥3 debuffs → +10% per debuff, cap 50%
  const dc = debuffCount(sim, target)
  if (dc >= 3) sim.addBuff(ratio, { id: 'ratio_deduction', name: 'Deduction', mods: [{ stat: 'dmgAll', value: Math.min(0.5, dc * 0.1) }], turns: Infinity })
  sim.hit(ratio, target, { type: 'fua', elem: 'Imaginary', mult: fuaMult, toughDmg: 10, label: 'Cogito, Ergo Sum FUA' })
  sim.removeBuff(ratio, 'ratio_deduction')
  // E2: per-debuff Imaginary Additional 20% ATK, max 4 hits
  if (eid >= 2) {
    const addCount = Math.min(4, dc)
    for (let i = 0; i < addCount; i++)
      sim.hit(ratio, target, { type: 'add', noSeq: true, elem: 'Imaginary', mult: 0.20, scaleStat: 'atk', toughDmg: 0, label: 'E2 Additional' })
  }
  // E4: +15 Energy on talent trigger
  if (eid >= 4) sim.gainEnergy(ratio, 15)
  sim.log(`${ratio.name} Cogito, Ergo Sum FUA`)
}

/** Deduction trace: dmgAll = 10% per debuff on the target (needs ≥3), cap 50%. */
function deductionOf(sim: SimApi, target: Unit): number {
  const dc = debuffCount(sim, target)
  return dc >= 3 ? Math.min(0.5, dc * 0.1) : 0
}

export const dr_ratioKit: KitDef = {
  id: 'dr_ratio',
  name: 'Dr. Ratio',
  elem: 'Imaginary',
  energyMax: 140,
  base: { ...PROG.dr_ratio.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // #120407 "Mold of Idolatry" (Technique): 100% base chance, SPD −15% on all enemies 2 turns.
  technique: {
    name: 'Mold of Idolatry',
    kind: 'buff',
    apply(sim, u) {
      for (const e of [...sim.livingEnemiesOf(u)])
        sim.applyDebuff(u, e, 1.0, () => sim.addBuff(e, { id: 'dr_tech_spd', name: 'Mold of Idolatry SPD↓', mods: [{ stat: 'spdPct', value: -0.15 }], turns: 2, debuff: true }), 'SPD Down')
    },
  },
  onStart(sim, u, ctx) {
    ctx.wisemanTarget = undefined
    ctx.wisemanCharges = 0
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
      const target = enemies[0]
      if (deductionOf(sim, target) > 0) sim.addBuff(u, { id: 'ratio_deduction', name: 'Deduction', mods: [{ stat: 'dmgAll', value: deductionOf(sim, target) }], turns: Infinity })
      sim.hit(u, target, { type: 'ult', elem: 'Imaginary', mult: mult('ratio', 'ult', lv.ult), toughDmg: 15, label: 'Syllogistic Paradox' })
      sim.removeBuff(u, 'ratio_deduction')
      // Wiseman's Folly: next #2[2] ally attacks → Dr. Ratio FUA
      rt.wisemanTarget = target.id
      rt.wisemanCharges = eid >= 6 ? 3 : 2
      sim.log(`${u.name} Ult: Syllogistic Paradox (Wiseman ${rt.wisemanCharges} charges)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const target = manualTarget(sim, action, enemies[0])
      // Summation trace: real per-target debuff count → +2.5% CR + 5% CD (cap 6; E1 cap 10 + 4 battle-start stacks)
      const stacks = Math.min(eid >= 1 ? 10 : 6, debuffCount(sim, target) + (eid >= 1 ? 4 : 0))
      const crBonus = stacks * 0.025
      const cdBonus = stacks * 0.05
      if (crBonus > 0) sim.addBuff(u, { id: 'ratio_summation_cr', name: `Summation CR+${Math.round(crBonus * 100)}%`, mods: [{ stat: 'critRate', value: crBonus }], turns: 1 })
      if (cdBonus > 0) sim.addBuff(u, { id: 'ratio_summation_cd', name: `Summation CD+${Math.round(cdBonus * 100)}%`, mods: [{ stat: 'critDmg', value: cdBonus }], turns: 1 })
      if (deductionOf(sim, target) > 0) sim.addBuff(u, { id: 'ratio_deduction', name: 'Deduction', mods: [{ stat: 'dmgAll', value: deductionOf(sim, target) }], turns: Infinity })
      sim.hit(u, target, { type: 'skill', elem: 'Imaginary', mult: mult('ratio', 'skill', lv.skill), toughDmg: 15, label: 'Intellectual Midwifery' })
      sim.removeBuff(u, 'ratio_summation_cr')
      sim.removeBuff(u, 'ratio_summation_cd')
      sim.removeBuff(u, 'ratio_deduction')
      // Inference: 100% base chance EffRes −10% 2t
      sim.applyDebuff(u, target, 1.0, () => {
        sim.addBuff(target, { id: 'ratio_infer', name: 'Inference Effect RES↓', mods: [{ stat: 'effRes', value: -0.1 }], turns: 2 })
      }, 'Inference')
      // Talent: FUA chance = 40% + 20% × debuffs (cap 100%); real per-target count
      const fuaChance = Math.min(1, 0.4 + 0.2 * debuffCount(sim, target))
      if (sim.rng() < fuaChance) triggerFua(sim, u, target, ctx)
      return
    }

    // basic
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    if (deductionOf(sim, t) > 0) sim.addBuff(u, { id: 'ratio_deduction', name: 'Deduction', mods: [{ stat: 'dmgAll', value: deductionOf(sim, t) }], turns: Infinity })
    sim.hit(u, t, { type: 'basic', mult: mult('ratio', 'basic', lv.basic), elem: 'Imaginary', toughDmg: 10, label: 'Mind is Might' })
    sim.removeBuff(u, 'ratio_deduction')
  },

  // Wiseman's Folly: ally attacks on marked target → Dr. Ratio FUA
  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (attacker.kitId === 'dr_ratio') return
    const ratio = sim.allies('ally').find(u => u.kitId === 'dr_ratio' && !u.dead)
    if (!ratio) return
    const rt = sim.rt(ratio)
    if (!rt.wisemanTarget || target.id !== (rt.wisemanTarget as string)) return
    if ((rt.wisemanCharges as number) <= 0) return
    triggerFua(sim, ratio, target, ctx)
    rt.wisemanCharges = (rt.wisemanCharges as number) - 1
    if ((rt.wisemanCharges as number) <= 0) rt.wisemanTarget = undefined
  },
}


// ===== moze  (was moze.ts) =====
// Talent Cascading Featherblade: ally attacks on Prey → Moze Additional DMG +1 Charge-cost;
// every 3 Charges consumed (talent_a2) → 1 Follow-Up ATK. Charge 0 → dispel Prey.
// Ult also launches the FUA against its own target; if that target died, retarget at random.
function fireFua(sim: SimApi, moze: Unit, ctx: KitRuntime, want?: Unit, tag?: string): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(moze)
  const living = sim.livingEnemiesOf(moze)
  if (!living.length) return
  const target = want && !want.dead ? want : sim.rngPick(living)
  // E6 Faithbinder: FUA multiplier +25%
  const fuaMult = mult('moze', 'talent', lv.talent) * (eid >= 6 ? 1.25 : 1)
  sim.hit(moze, target, { type: 'fua', elem: 'Lightning', mult: fuaMult, toughDmg: 10, label: tag ? `Cascading Featherblade FUA (${tag})` : 'Cascading Featherblade FUA', split: [0.08, 0.08, 0.08, 0.08, 0.08, 0.6], noSeq: true })
  // A1 Nightfeather: +1 SP after Talent FUA, once per 1 turn (by global turn counter)
  const tc = sim.turnCount.get(moze.id) ?? 0
  const cd = (rt.nightfeatherCd as number) ?? 0
  if (tc >= cd) {
    sim.gainSp(1)
    rt.nightfeatherCd = tc + 1
    sim.log('Nightfeather: +1 SP')
  }
}

function clearPrey(sim: SimApi, moze: Unit, ctx: KitRuntime, advancePct: number): void {
  const rt = sim.rt(moze)
  moze.departedFlag = false
    if (rt.preyId) {
      const t = sim.find(rt.preyId as string)
      if (t) {
        sim.removeBuff(t, 'moze_vengeful')
        sim.removeBuff(t, 'moze_e2')
        sim.removeBuff(t, 'prey')
      }
    }
  rt.preyId = undefined
  rt.charge = 0
  if (advancePct > 0) sim.advance(moze, advancePct)
}

function preyDefeated(sim: SimApi, moze: Unit, victim: Unit, ctx: KitRuntime): void {
  if (victim.id !== (sim.rt(moze).preyId as string)) return
  clearPrey(sim, moze, ctx, 0.2)
  sim.log('Prey defeated — Departed dispelled (+20% AV)')
}

// Talent 122304: "When \"Prey\" exists on the field, Moze will enter the Departed state" — modeled
// via Unit.departedFlag (read by simulator.departed), the same rooted/untargetable state Phainon's
// Khaslana imposes on the team.
// Talent note (canon, characters.json skills.122304.notes): "Moze can still use his Ultimate during
// his Departed state" → `ultWhileDeparted` below; the sim resolves that Ult off-order (no turn).
// The same note: with Eagle of Twilight Line the Ult still advances the action order even though
// Moze is not displayed on it — nothing extra here, the relic advance rides on the same castUlt.
const CRIT_TYPES: DmgType[] = ['basic', 'skill', 'ult', 'fua', 'add', 'elation']

export const mozeKit: KitDef = {
  id: 'moze',
  name: 'Moze',
  elem: 'Lightning',
  energyMax: 120,
  ultWhileDeparted: true,
  base: { ...PROG.moze.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // 122307 "Bated Wings": Moze deals +30% DMG for 2 turns at battle start (Stealth is overworld-only).
  technique: {
    name: 'Bated Wings',
    kind: 'buff',
    apply(sim, u) {
      sim.addBuff(u, { id: 'moze_tech', name: 'Bated Wings', mods: [{ stat: 'dmgAll', value: 0.30 }], turns: 2 })
    },
  },
  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    if (eid >= 1) {
      sim.gainEnergy(u, 20)
      sim.log('E1 Oathkeeper: +20 Energy')
    }
    ctx.preyId = undefined
    ctx.charge = 0
    ctx.nightfeatherCd = 0
    ctx.lastSeq = -1
    u.departedFlag = false
  },
  decide(sim, u, ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1) {
      // no other capable ally on the field → cannot use Skill, and Departed/Prey is dispelled
      if (sim.allies(u.side).filter(a => a.kind === 'char' && !a.dead).length <= 1) {
        clearPrey(sim, u, ctx, 0)
        return { kind: 'basic' }
      }
      return { kind: 'skill' }
    }
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
      const target = enemies[0]
      // A4 Vengewise: ult counts as a Follow-Up ATK → type 'fua' so Prey FUA-taken vuln applies
      sim.hit(u, target, { type: 'fua', elem: 'Lightning', mult: mult('moze', 'ult', lv.ult), toughDmg: 15, label: 'Dash In, Gash Out' })
      if (eid >= 4) sim.addBuff(u, { id: 'moze_e4', name: 'Heathprowler', mods: [{ stat: 'dmgAll', value: 0.3 }], turns: 2 })
      // the ult's FUA spends no Charge and is not a Talent trigger: mark it with a sentinel seq so
      // its noSeq hits never inherit (or suppress) a nested Talent trigger's seq
      rt.lastSeq = -1
      fireFua(sim, u, ctx, target, 'Ult')
      sim.log(`${u.name} Ult: Dash In, Gash Out`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const target = manualTarget(sim, action, enemies[0])
      // A2 Daggerhold: re-casting Skill while Departed dispels it → +20% advance
      clearPrey(sim, u, ctx, rt.preyId ? 0.2 : 0)
      sim.hit(u, target, { type: 'skill', elem: 'Lightning', mult: mult('moze', 'skill', lv.skill), toughDmg: 15, label: 'Fleetwinged Raid', split: [0.15, 0.15, 0.7] })
      if (target.dead) { sim.log('Prey defeated by Fleetwinged Raid — no Departed'); return }
      rt.preyId = target.id
      rt.charge = 9
      // canon (Talent 122304): "When \"Prey\" exists on the field, Moze will enter the Departed
      // state" — rooted, off the action order and untargetable until Prey is dispelled/dead
      u.departedFlag = true
      sim.addBuff(target, { id: 'prey', name: 'Fleetwinged Raid', mods: [], turns: Infinity, debuff: true })
      // A4 Vengewise: unremovable FUA-taken +25% on the Prey
      sim.addBuff(target, { id: 'moze_vengeful', name: 'Vengewise FUA Taken+', mods: [{ stat: 'vulnType:fua', value: 0.25 }], turns: Infinity, debuff: true })
      // E2 Wrathbearer (ranks.2): "When all allies deal DMG to the enemy target marked as \"Prey\",
      // increases CRIT DMG by 40%" — the gate is the TARGET, not the ally. Modeled as critDmgTaken
      // on the Prey (all 6 crit types) rather than a new attacker-side conditional: only allies
      // ever attack the Prey, so ally-side and target-side are numerically identical here, and
      // critDmgTaken is already summed for every crit path (dealDamage + dealElationDamage).
      if (eid >= 2) {
        const mods = CRIT_TYPES.map(ty => ({ stat: `critDmgTaken:${ty}` as StatKey, value: 0.4 }))
        sim.addBuff(target, { id: 'moze_e2', name: 'Wrathbearer (CRIT DMG taken+)', mods, turns: Infinity, debuff: true })
      }
      sim.log(`${u.name} Prey -> ${target.name}`)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, enemies[0], { type: 'basic', elem: 'Lightning', mult: mult('moze', 'basic', lv.basic), toughDmg: 10, label: 'Hurlthorn' })
  },

  // Talent: any ally (incl. Moze's own basic/skill) attacking Prey → Additional DMG +1 Charge spent
  onAfterAttack(sim, attacker, target, dmgType, _ctx) {
    const moze = sim.allies('ally').find(u => u.kitId === 'moze' && !u.dead)
    if (!moze) return
    if (attacker.side !== 'ally' || attacker.kind !== 'char') return
    const rt = sim.rt(moze)
    if (!rt.preyId || target.id !== (rt.preyId as string)) return
    // own cascade-safe: Additional/FUA hits don't re-trigger the Talent
    if (dmgType === 'add') return
    if (attacker === moze && dmgType === 'fua') return
    // canon: "each time an ally attacks" the Prey — once per attack instance, not per hit
    // (multi-hit skills share one attackNo() seq; fireAfterAttack runs per hit)
    const seq = sim.attackNo()
    if ((rt.lastSeq as number) === seq) return
    rt.lastSeq = seq
    const lv = levelsOf(rt)
    const eid = (rt.eidolon as number) ?? 0
    // charge is spent before the hit: sim.hit re-enters fireAfterAttack, so a nested trigger
    // (ally FUA) may kill the Prey and clear rt while this callback is still running
    const charge = (rt.charge as number) - 1
    rt.charge = charge
    const need = mult('moze', 'talent_a2', lv.talent)
    const fuaNow = charge > 0 && charge % need === 0
    sim.hit(moze, target, { type: 'add', elem: 'Lightning', mult: mult('moze', 'talent_a3', lv.talent), toughDmg: 0, label: 'Cascading Featherblade (Additional)', noSeq: true })
    if (eid >= 1) sim.gainEnergy(moze, 2)
    if (rt.preyId !== target.id) return
    if (charge <= 0) {
      // Charge exhausted → Prey dispelled (A2 Daggerhold: +20% advance)
      clearPrey(sim, moze, rt, 0.2)
      sim.log('Departed dispelled (+20% AV)')
    } else if (fuaNow) fireFua(sim, moze, rt, target)
  },

  // Prey defeated → Departed ends; A2 Daggerhold advances Moze 20% (own kill or ally kill)
  onKill(sim, u, victim, ctx) { preyDefeated(sim, u, victim, ctx) },
  onAllyKill(sim, _killer, victim, _ctx) {
    const moze = sim.allies('ally').find(a => a.kitId === 'moze' && !a.dead)
    if (moze) preyDefeated(sim, moze, victim, sim.rt(moze))
  },

  // A2 Daggerhold: +30% advance at the start of each wave; stale Prey cleared
  onWaveStart(sim, u, ctx) {
    clearPrey(sim, u, ctx, 0)
    sim.advance(u, 0.3)
  },
}

// ===== boothill  (was boothill.ts) =====
const TRICK_MAX = 3

// Skill Sizzlin' Tango forces Boothill + one enemy into the Standoff:
// enemy takes +skill% DMG from Boothill / Boothill takes +15% from that enemy;
// Skill costs 1 SP, regens no Energy, grants an Extra Turn, cannot be used again in standoff.
function setStandoff(sim: SimApi, u: Unit, ctx: KitRuntime, target: Unit): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const rt = sim.rt(u)
  rt.standoffId = target.id
  rt.standoffTurns = 2
  const vuln = mult('boothill', 'skill', lv.skill) + (eid >= 4 ? 0.12 : 0)
  sim.addBuff(target, { id: 'bh_standoff', name: `Sizzlin' Tango DMG+${Math.round(vuln * 100)}%`, mods: [{ stat: 'vulnAll', value: vuln }], turns: Infinity, debuff: true })
  // Boothill takes +15% from the standoff enemy; E4 offsets 12% → net −3%.
  // Above Snakes flattens the −30% dmg from NON-standoff targets to a global +30% mitigation
  // (enemies have no per-target AI), so the stance stack totals: −0.15 +0.12(E4) +0.30 = +0.27 mitigation → ~0.73x taken.
  const stance = -0.15 + (eid >= 4 ? 0.12 : 0) + 0.30
  sim.addBuff(u, { id: 'bh_stance', name: 'Sizzlin\' Tango', mods: [{ stat: 'mitigation', value: stance }], turns: Infinity })
  sim.log(`${u.name} vs ${target.name}: enters the Standoff (DMG+${Math.round(vuln * 100)}%)`)
}

function clearStandoff(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  if (!rt.standoffId) return
  const t = sim.find(rt.standoffId as string)
  if (t) sim.removeBuff(t, 'bh_standoff')
  sim.removeBuff(u, 'bh_stance')
  rt.standoffId = undefined
  rt.standoffTurns = 0
  sim.log('Standoff over')
}

/** Pocket Trickshot stack gained when the standoff enemy breaks or dies. */
function grantTrick(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  const rt = sim.rt(u)
  const eid = (ctx.eidolon as number) ?? 0
  rt.tricks = Math.min(TRICK_MAX, ((rt.tricks as number) ?? 0) + 1)
  // A0 Point Blank: in Standoff, gaining a Trickshot (incl. overflow) → +10 Energy
  if (rt.standoffId) {
    sim.gainEnergy(u, 10)
    // E2 Milestonemonger: +1 SP, BE+30% 2t, once per turn (global battle turn)
    if (eid >= 2 && rt.e2BattleTurn !== sim.battleTurn) {
      sim.gainSp(1)
      sim.addBuff(u, { id: 'bh_e2', name: 'Milestonemonger', mods: [{ stat: 'be', value: 0.3 }], turns: 2 })
      rt.e2BattleTurn = sim.battleTurn
      sim.log('E2: +1 SP, Break Effect +30%')
    }
  }
  sim.log(`Pocket Trickshot +1 (now ${rt.tricks})`)
  applyGhost(sim, u)
}

// A0 Ghost Load: CRIT Rate/CRIT DMG = 10%/50% of Break Effect (cap 30%/150%)
function applyGhost(sim: SimApi, u: Unit): void {
  const be = sim.effBe(u)
  const cr = Math.min(0.3, 0.1 * be)
  const cd = Math.min(1.5, 0.5 * be)
  sim.removeBuff(u, 'bh_ghost')
  sim.addBuff(u, { id: 'bh_ghost', name: 'Ghost Load', mods: [{ stat: 'critRate', value: cr }, { stat: 'critDmg', value: cd }], turns: Infinity })
}

/** Talent Five Peas in a Pod: extra Break DMG when the enhanced basic hits a Weakness-Broken target. */
function talentBreak(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime): void {
  const lv = levelsOf(ctx)
  const eid = (ctx.eidolon as number) ?? 0
  const stacks = (sim.rt(u).tricks as number) ?? 0
  if (stacks === 0) return
  const scale = stacks >= 3 ? mult('boothill', 'talent_a3', lv.talent)
    : stacks === 2 ? mult('boothill', 'talent_a2', lv.talent)
    : mult('boothill', 'talent', lv.talent)
  const base = computeBreakDamage({ attacker: u, target, elem: 'Physical', kind: 'break' })
  let total = 0
  if (eid >= 6) {
    // E6 Crowbar Hotel's Raccoon: +40% to target, +70% to adjacent (all other living enemies)
    sim.applyTargetBreak(u, target, Math.floor(base * scale * 1.4), 'Five Peas in a Pod +40%')
    for (const e of sim.livingEnemiesOf(u)) {
      if (e === target || e.dead) continue
      total += sim.applyTargetBreak(u, e, Math.floor(computeBreakDamage({ attacker: u, target: e, elem: 'Physical', kind: 'break' }) * scale * 0.7), 'Five Peas in a Pod (adj)')
    }
  } else {
    total += sim.applyTargetBreak(u, target, Math.floor(base * scale), 'Five Peas in a Pod (Break)')
  }
  void total
}

function bhUnit(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(u => u.kitId === 'boothill' && !u.dead)
}

export const boothillKit: KitDef = {
  id: 'boothill',
  name: 'Boothill',
  elem: 'Physical',
  energyMax: 115,
  base: { ...PROG.boothill.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // #130507 "3-9× Smile" (Technique): first Skill of the battle also applies Physical Weakness to the target.
  technique: {
    name: '3-9× Smile',
    kind: 'buff',
    apply(_sim, _u, ctx) { ctx.bhTech = true },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    ctx.standoffId = undefined
    ctx.standoffTurns = 0
    ctx.tricks = eid >= 1 ? 1 : 0
    ctx.e2BattleTurn = -1
    applyGhost(sim, u)
    if (eid >= 1) sim.log('E1: +1 Pocket Trickshot at battle start')
  },

  onTurnStart(sim, u, ctx) {
    const rt = sim.rt(u)
    if (rt.standoffId) {
      const turns = (rt.standoffTurns as number) - 1
      if (turns <= 0) clearStandoff(sim, u, ctx)
      else rt.standoffTurns = turns
    }
  },

  decide(sim, u, _ctx) {
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    // cannot re-cast Skill while in the Standoff
    if (sim.rt(u).standoffId) return { kind: 'basic' }
    if (sim.sp() >= 1) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const lv = levelsOf(ctx)
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const target = manualTarget(sim, action, enemies[0])
      sim.applyWeakness(u, target, 'Physical')
      sim.hit(u, target, { type: 'ult', elem: 'Physical', mult: mult('boothill', 'ult', lv.ult), toughDmg: 15, label: "Dust Devil's Sunset Rodeo" })
      const delayPct = mult('boothill', 'ult_a2', lv.ult)
      sim.delay(target, delayPct)
      if (eid >= 1) sim.addBuff(target, { id: 'bh_e1', name: 'Dusty Trail\'s Lone Star DEF↓', mods: [{ stat: 'defIgnore', value: 0.16 }], turns: 2, debuff: true })
      sim.log(`${u.name} delays ${target.name} by ${Math.round(delayPct * 100)}%`)
      return
    }

    if (action.kind === 'skill' && !rt.standoffId && sim.spendSp(1)) {
      const target = manualTarget(sim, action, enemies[0])
      // Technique "3-9× Smile": first Skill also applies Physical Weakness
      if (ctx.bhTech) { ctx.bhTech = false; sim.applyWeakness(u, target, 'Physical') }
      // skill regens no Energy and the current turn does not end → Extra Turn
      setStandoff(sim, u, ctx, target)
      sim.grantExtraTurn(u)
      return
    }

    // Basic ATK: enhanced "Fanning the Hammer" vs the standoff enemy when Standoff is active
    if (rt.standoffId) {
      const st = sim.find(rt.standoffId as string)
      if (st && !st.dead) {
        const en = mult('boothill', 'basic_en', lv.basic)
        const toughMul = 1 + 0.5 * ((rt.tricks as number) ?? 0)
        sim.hit(u, st, { type: 'basic', elem: 'Physical', mult: en, toughDmg: 30 * toughMul, label: 'Fanning the Hammer' })
        sim.gainEnergy(u, 30)
        if (eid >= 1) sim.addBuff(st, { id: 'bh_e1', name: 'Dusty Trail\'s Lone Star DEF↓', mods: [{ stat: 'defIgnore', value: 0.16 }], turns: 2, debuff: true })
        // Talent: extra Break DMG vs Weakness-Broken target
        if (st.broken) talentBreak(sim, u, st, ctx)
        return
      }
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const target = enemies[0]
    sim.hit(u, target, { type: 'basic', elem: 'Physical', mult: mult('boothill', 'basic', lv.basic), toughDmg: 10, label: 'Skullcrush Spurs' })
    if (eid >= 1) sim.addBuff(target, { id: 'bh_e1', name: 'Dusty Trail\'s Lone Star DEF↓', mods: [{ stat: 'defIgnore', value: 0.16 }], turns: 2, debuff: true })
  },

  // standoff target breaks → Pocket Trickshot + Standoff dispels
  onBreak(sim, _breaker, victim, ctx) {
    const bh = bhUnit(sim)
    if (!bh || ctx.standoffId !== victim.id) return
    grantTrick(sim, bh, ctx)
    clearStandoff(sim, bh, ctx)
  },

  // standoff target dies (Boothill's own kill) → Trickshot
  onKill(sim, u, victim, ctx) {
    if (sim.rt(u).standoffId === victim.id) {
      grantTrick(sim, u, ctx)
      clearStandoff(sim, u, ctx)
    }
  },

  // standoff target dies to another ally → Trickshot
  onAllyKill(sim, _killer, victim, ctx) {
    const bh = bhUnit(sim)
    if (!bh || ctx.standoffId !== victim.id) return
    grantTrick(sim, bh, ctx)
    clearStandoff(sim, bh, ctx)
  },
}

// ===== archer  (was archer.ts) =====
const ULT_COST = 220

function findArcher(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(c => c.kind === 'char' && c.kitId === 'archer' && !c.dead)
}

export const archerKit: KitDef = {
  id: 'archer',
  name: 'Archer',
  elem: 'Quantum',
  energyMax: ULT_COST,
  base: { ...PROG.archer.base, level: 80, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // 101507 "Clairvoyance": AoE 200% ATK Quantum DMG to all enemies + 1 Charge. attack Technique.
  technique: {
    name: 'Clairvoyance',
    kind: 'attack',
    apply(sim, u, ctx) {
      const lv = levelsOf(ctx)
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Quantum', mult: 2.0, toughDmg: 10, label: 'Clairvoyance' })
      const cap = mult('archer', 'ult_a3', lv.ult)
      ctx.charge = Math.min(cap, ((ctx.charge as number) ?? 0) + 1)
    },
  },
  decide(sim, u, ctx) {
    if (u.energy >= ULT_COST) return { kind: 'ult' }
    // in Circuit Connection: keep chaining Skill (extra turns); else SP economy
    if (ctx.inCC) return { kind: 'skill' }
    return { kind: sim.sp() >= 2 ? 'skill' : 'basic' }
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
      let m = mult('archer', 'ult', lv.ult)
      if (eid >= 4) m *= 2.5 // E4 The Unsung Life: Ultimate DMG +150%
      sim.hit(u, t, { type: 'ult', mult: m, elem: 'Quantum', toughDmg: 20, label: 'Unlimited Blade Works', split: [0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.04, 0.44] })
      // +2 Charge (cap #3=4)
      const cap = mult('archer', 'ult_a3', lv.ult)
      ctx.charge = Math.min(cap, ((ctx.charge as number) ?? 0) + mult('archer', 'ult_a2', lv.ult))
      // E2: Quantum RES -20% + Quantum weakness 2t
      if (eid >= 2) sim.addBuff(t, { id: 'archer_e2', name: 'The Unfulfilled Happiness Quantum Taken+', mods: [{ stat: 'vuln:Quantum', value: 0.2 }], turns: 2 })
      sim.log(`${u.name} UBW, Charge ${ctx.charge}`)
      return
    }

    if (action.kind === 'skill' && (!ctx.inCC || sim.spendSp(2))) {
      // Circuit Connection pays its 2-SP cost once per combo start (canon 101502 'consume 2 SP');
      // the chained re-casts (grantExtraTurn segments) are the same combo and cast free.
      if (!ctx.inCC) {
        ctx.inCC = true
        ctx.ccUses = 0
        ctx.ccStacks = 0
      }
      sim.gainEnergy(u, 30)
      ctx.skillsThisTurn = ((ctx.skillsThisTurn as number) ?? 0) + 1
      // Skill DMG boost per CC stack (cap a3, +1 E6)
      const capSt = mult('archer', 'skill_a3', lv.skill) + (eid >= 6 ? 1 : 0)
      const nStack = Math.min(capSt, ctx.ccStacks as number)
      let m = mult('archer', 'skill', lv.skill) * (1 + mult('archer', 'skill_a2', lv.skill) * nStack)
      if (eid >= 6) sim.addBuff(u, { id: 'archer_e6d', name: 'The Endless Pilgrimage', mods: [{ stat: 'defIgnore', value: 0.2 }], turns: 1 })
      sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'skill', mult: m, elem: 'Quantum', toughDmg: 15, label: 'Caladbolg II' })
      if (eid >= 6) u.buffs = u.buffs.filter(b => b.id !== 'archer_e6d')
      ctx.ccStacks = Math.min(capSt, ((ctx.ccStacks as number) ?? 0) + 1)
      ctx.ccUses = ((ctx.ccUses as number) ?? 0) + 1
      // E1: 3 Skills within one turn → +2 SP for allies
      if (eid >= 1 && (ctx.skillsThisTurn as number) === 3) sim.gainSp(2)
      // current turn does not end while CC active (up to #5 active uses)
      const maxUses = mult('archer', 'skill_a5', lv.skill)
      if (ctx.inCC && (ctx.ccUses as number) < maxUses) {
        sim.grantExtraTurn(u)
        sim.log(`${u.name} CC Chain (${ctx.ccUses}/${maxUses}, stack ${ctx.ccStacks})`)
      } else {
        ctx.inCC = false
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, manualTarget(sim, action, enemies[0]), { type: 'basic', mult: mult('archer', 'basic', lv.basic), elem: 'Quantum', toughDmg: 10, label: 'Kanshou and Bakuya', split: [0.3, 0.35, 0.35] })
  },

  onStart(sim, _u, ctx) {
    // A2 Hero of Justice: +1 Charge at combat start
    ctx.charge = 1
    ctx.inCC = false
    ctx.ccUses = 0
    ctx.ccStacks = 0
    ctx.skillsThisTurn = 0
    // A0 "Projection Magecraft": while Archer on field, max Skill Point limit +2.
    // maxSp raisers (Sparkle Red Herring, Rin A2) each subtract their own bonus in
    // onUnitDeath, so composition no longer depends on onStart order.
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 5) { s.maxSp += 2; ctx.pmSp = true }
    sim.log('Projection Magecraft: max Skill Point limit +2')
  },

  onUnitDeath(sim, _u, ctx) {
    if (!ctx.pmSp) return
    const s = sim as unknown as { maxSp: number }
    if (s.maxSp >= 7) s.maxSp -= 2
    sim.log('Projection Magecraft: max Skill Point limit back to 5')
  },

  onTurnStart(sim, u, ctx) {
    ctx.skillsThisTurn = 0
    // E6: turn start → recover 1 Skill Point
    if (((ctx.eidolon as number) ?? 0) >= 6) sim.gainSp(1)
    // Circuit Connection ends when SP is insufficient for next Skill
    if (ctx.inCC && sim.sp() < 1) {
      ctx.inCC = false
    }
  },

  // Circuit Connection also exits when all enemies in a wave are defeated.
  onWaveEnd(sim, _u, ctx) {
    if (ctx.inCC) { ctx.inCC = false; ctx.ccStacks = 0 }
  },

  // Talent Mind's Eye (True): teammates attack → consume 1 Charge, FUA on the primary target +1 SP (once per attack)
  onAfterAttack(sim, attacker, target, depth, ctx) {
    if (target.side !== 'enemy') return
    const archer = findArcher(sim)
    if (!archer || attacker === archer) return
    if (((ctx.charge as number) ?? 0) < 1) return
    const seq = sim.attackNo()
    if (ctx.eyeSeq === seq) return
    ctx.eyeSeq = seq
    ctx.charge = (ctx.charge as number) - 1
    const lv = levelsOf(ctx)
    let t = target
    if (t.dead) {
      const ts = sim.livingEnemiesOf(archer)
      t = sim.rngPick(ts)
    }
    sim.hit(archer, t, { type: 'fua', mult: mult('archer', 'talent', lv.talent), elem: 'Quantum', toughDmg: 10, label: 'Mind\'s Eye FUA' })
    sim.gainSp(1)
    sim.log(`${archer.name} Mind's Eye FUA (+1 SP), Charge ${ctx.charge}`)
  },
}

// A3 Guardian: any ally gained a SP → if pool ≥ 4 then Archer CRIT DMG +120% 1t
export function archerOnSpChange(sim: SimApi): void {
  const archer = findArcher(sim)
  if (!archer) return
  if (sim.sp() < 4) return
  sim.addBuff(archer, { id: 'archer_a3', name: 'Guardian', mods: [{ stat: 'critDmg', value: 1.2 }], turns: 1 })
}

// ===== ashveil  (was ashveil.ts) =====
function eid_ashveil(ctx: KitRuntime): number {
  return (ctx.eidolon as number) ?? 0
}

const gluttonyMax = (ctx: KitRuntime): number => (eid_ashveil(ctx) >= 2 ? 18 : 12)

function ashVeil(sim: SimApi): Unit | undefined {
  return sim.allies('ally').find(a => a.kitId === 'ashveil' && !a.dead && a.kind === 'char')
}

/** the current Bait (most recent), or undefined */
function baitOf(sim: SimApi): Unit | undefined {
  return sim.allies('enemy').find(e => !e.dead && sim.hasBuff(e, 'ash_bait'))
}

/** (re)set Bait to `prefer` (itself if already Bait), else lowest-HP living enemy */
function ensureBait(sim: SimApi, prefer?: Unit): Unit {
  const enemies = sim.allies('enemy').filter(e => !e.dead)
  if (!enemies.length) return prefer as Unit
  let t = prefer && !prefer.dead ? prefer : undefined
  if (t && sim.hasBuff(t, 'ash_bait')) return t
  if (!t || sim.hasBuff(t, 'ash_bait')) {
    t = prefer && !prefer.dead ? prefer : enemies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]
  }
  sim.removeBuff(t!, 'ash_bait')
  sim.addBuff(t!, { id: 'ash_bait', name: 'Bait', mods: [], turns: Infinity, debuff: true })
  sim.log(`Ashveil: ${t!.name} becomes the Bait`)
  return t!
}

/** all enemies DEF-reduced while the Bait exists */
function sideDefDown(sim: SimApi, v: number): void {
  for (const e of sim.allies('enemy')) sim.addBuff(e, { id: 'ash_def', name: 'Banquet: Insatiable Appetite DEF↓', mods: [{ stat: 'defRed', value: v }], turns: Infinity, debuff: true })
}

/** E6: +4% DMG per Gluttony stack (cap 30) — refreshed as Gluttony changes */
function refreshE6Dmg(sim: SimApi, u: Unit, ctx: KitRuntime): void {
  if (eid_ashveil(ctx) < 6) return
  const v = 0.04 * Math.min((sim.rt(u).ashGlut as number) ?? 0, 30)
  sim.removeBuff(u, 'ash_e6_dmg')
  sim.addBuff(u, { id: 'ash_e6_dmg', name: 'Finale: And Then There Were None DMG+', mods: [{ stat: 'dmgAll', value: v }], turns: Infinity })
}

/** Talent Follow-Up ATK vs the Bait: consumes 1 Charge (unless enhanced), gains Gluttony */
function talentFua(sim: SimApi, u: Unit, ctx: KitRuntime, bait: Unit, enhanced: boolean): void {
  const lv = levelsOf(ctx)
  const rt = sim.rt(u)
  const crt: number = (rt.ashCharge as number) ?? 2
  if (!enhanced) {
    if (crt <= 0) return
    rt.ashCharge = crt - 1
  }
  const gmax = gluttonyMax(ctx)
  rt.ashGlut = Math.min(gmax, ((rt.ashGlut as number) ?? 0) + 2)
  refreshE6Dmg(sim, u, ctx)
  sim.log(`Ashveil: Talent FUA vs ${bait.name} (Charge ${crt}→${rt.ashCharge as number}, Gluttony →${rt.ashGlut as number})`)
  sim.hit(u, bait, { type: 'fua', mult: mult('ashveil', 'talent_a4', lv.talent), elem: 'Lightning', toughDmg: 10, label: 'Rancor: Enmity Reprisal' })
}

export const ashveilKit: KitDef = {
  id: 'ashveil',
  name: 'Ashveil',
  elem: 'Lightning',
  energyMax: 150,
  base: { ...PROG.ashveil.base, level: 80, critRate: 0.05, critDmg: 0.5 },
  // #150407 "Devour: O Loathsome Hand" (Technique): AoE Lightning DMG = 100% ATK, grants Ashveil 1 Charge.
  technique: {
    name: 'Devour: O Loathsome Hand',
    kind: 'attack',
    apply(sim, u, _ctx) {
      sim.hitAoe(u, { type: 'basic', elem: 'Lightning', mult: 1, toughDmg: 10, label: 'Devour: O Loathsome Hand' })
      const rt = sim.rt(u)
      rt.ashCharge = Math.min(3, ((rt.ashCharge as number) ?? 2) + 1)
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

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      const bait = ensureBait(sim, manualTarget(sim, action, enemies[0]))
      sim.hit(u, bait, { type: 'ult', mult: mult('ashveil', 'ult', lv.ult), elem: 'Lightning', toughDmg: 20, label: 'Banquet: Insatiable Appetite' })
      sideDefDown(sim, mult('ashveil', 'skill_a4', lv.skill))
      const rt = sim.rt(u)
      rt.ashCharge = Math.min(3, ((rt.ashCharge as number) ?? 2) + mult('ashveil', 'ult_a2', lv.ult))
      // one free enhanced FUA that does not consume Charge
      talentFua(sim, u, ctx, bait, true)
      if (eid_ashveil(ctx) >= 4) sim.addBuff(u, { id: 'ash_e4', name: 'Heed: Swallow Truth Whole', mods: [{ stat: 'atkPct', value: 0.4 }], turns: 3 })
      // Gluttony chain: ≥4 → consume 4 → deal, continue to a new Bait on kill
      while ((rt.ashGlut as number) >= mult('ashveil', 'ult_a3', lv.ult)) {
        const used = mult('ashveil', 'ult_a3', lv.ult)
        rt.ashGlut = (rt.ashGlut as number) - used
        const b = baitOf(sim)
        if (!b) break
        sim.hit(u, b, { type: 'fua', mult: mult('ashveil', 'ult_a4', lv.ult), elem: 'Lightning', toughDmg: 10, label: 'Enhanced Talent Follow-Up' })
        ensureBait(sim)
        if (eid_ashveil(ctx) >= 2) rt.ashGlut = (rt.ashGlut as number) + Math.ceil(used * 0.35)
      }
      refreshE6Dmg(sim, u, ctx)
      return
    }

    if (action.kind === 'skill') {
      const wasBait = baitOf(sim) === manualTarget(sim, action, enemies[0]) || sim.hasBuff(manualTarget(sim, action, enemies[0]), 'ash_bait')
      if (sim.spendSp(1)) {
        sim.gainEnergy(u, 30)
        const target = manualTarget(sim, action, enemies[0])
        const bait = ensureBait(sim, target)
        sim.hit(u, bait, { type: 'skill', mult: mult('ashveil', 'skill', lv.skill), elem: 'Lightning', toughDmg: 20, label: 'Flog: Smite Evil' })
        if (wasBait) {
          sim.gainSp(1) // #5: recovers 1 Skill Point
          sim.hit(u, bait, { type: 'skill', mult: mult('ashveil', 'skill_a3', lv.skill), elem: 'Lightning', toughDmg: 0, label: 'Flog (Bait repeat)' })
        }
        sideDefDown(sim, mult('ashveil', 'skill_a4', lv.skill))
      }
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, enemies[0])
    sim.hit(u, t, { type: 'basic', mult: mult('ashveil', 'basic', lv.basic), elem: 'Lightning', toughDmg: 10, label: 'Talons: Inculcate Decorum' })
  },

  onStart(sim, u, ctx) {
    const rt = sim.rt(u)
    rt.ashCharge = mult('ashveil', 'talent', levelsOf(ctx).talent) // initial Charge 2
    rt.ashGlut = 0
    if (eid_ashveil(ctx) >= 1) {
      for (const e of sim.allies('enemy')) sim.addBuff(e, { id: 'ash_e1', name: 'Beware: Venture Not at Full Moon DMG Taken+', mods: [{ stat: 'vulnAll', value: 0.24 }], turns: Infinity, debuff: true })
    }
    if (eid_ashveil(ctx) >= 6) {
      // Finale: And Then There Were None — while the Bait exists, all enemies All-Type RES −20%
      for (const e of sim.allies('enemy')) sim.addBuff(e, { id: 'ash_e6_res', name: 'Finale: And Then There Were None All RES↓', mods: [{ stat: 'resAll', value: -0.2 }], turns: Infinity, debuff: true })
      refreshE6Dmg(sim, u, ctx)
    }
  },

  onAfterAttack(sim, attacker, target, _dmgType, ctx) {
    if (target.side !== 'enemy' || target.dead) return
    if (attacker.side !== 'ally') return
    if (!sim.hasBuff(target, 'ash_bait')) return
    const ash = ashVeil(sim)
    if (!ash || attacker === ash) return
    const rt = sim.rt(ash)
    if (sim.attackNo() === (rt.ashLastSeq as number)) return
    rt.ashLastSeq = sim.attackNo()
    sim.gainEnergy(ash, mult('ashveil', 'talent_a7', levelsOf(ctx).talent))
    talentFua(sim, ash, ctx, target, false)
  },
}

// ===== sushang  (was sushang.ts) =====
const MAX_SS = 10

function anyBroken(sim: SimApi, u: Unit): boolean {
  return sim.livingEnemiesOf(u).some(e => e.broken)
}

function pickTarget_sushang(sim: SimApi, u: Unit): Unit | undefined {
  const es = sim.livingEnemiesOf(u)
  // prefer a Weakness-Broken target: Sword Stance is then guaranteed and Vanquisher/E1 gate on it
  return es.find(e => e.broken) ?? es[0]
}

/** A1 Guileless: at HP ≤ 50% Sushang is less likely to be attacked by enemies. The data carries no
 *  numeric value, so reuse the identical aspect's constant — Dan Heng A2 «Hidden Dragon»
 *  (`danheng.ts:96`, aggro −150 → weight 100 → −50, i.e. effectively untargetable in a 3-5 enemy pack).
 *  Re-evaluated when she is hit and at her own turn start, so a healer's heal above 50% clears it
 *  (danheng's A2 has no re-check at all and can stick for the rest of the battle). */
function applyGuileless(sim: SimApi, u: Unit): void {
  const low = u.hp <= u.maxHp * 0.5
  if (low && !sim.hasBuff(u, 'sushang_a1'))
    sim.addBuff(u, { id: 'sushang_a1', name: 'Guileless', mods: [{ stat: 'aggro', value: -150 }], turns: Infinity })
  else if (!low && sim.hasBuff(u, 'sushang_a1')) sim.removeBuff(u, 'sushang_a1')
}

/** Talent Dancing Blade: any enemy Weakness-Broken on field → SPD up 2 turns (re-gated each Sushang turn).
 *  `force` = E6 start stack, granted regardless of the break condition. */
function applyDancingBlade(sim: SimApi, u: Unit, lv: AbilityLevels, eid: number, force = false): void {
  if (!force && !anyBroken(sim, u)) return
  sim.addBuff(u, {
    id: 'sushang_db', name: 'Dancing Blade',
    mods: [{ stat: 'spdPct', value: mult('sushang', 'talent', lv.talent) }],
    turns: mult('sushang', 'talent_a2', lv.talent),
    maxStacks: eid >= 6 ? 2 : undefined,
  })
}

export const sushangKit: KitDef = {
  id: 'sushang',
  name: 'Sushang',
  elem: 'Physical',
  energyMax: 120,
  base: { level: 80, hp: 917, atk: 564, def: 418, spd: 107, critRate: 0.05, critDmg: 0.5 },
  // 120607 "Cloudfencer Art: Warcry": 80% ATK Physical DMG to all enemies. attack Technique.
  technique: {
    name: 'Cloudfencer Art: Warcry',
    kind: 'attack',
    apply(sim, u) {
      if (!sim.livingEnemiesOf(u).length) return
      sim.hitAoe(u, { type: 'basic', elem: 'Physical', mult: 0.8, label: 'Cloudfencer Art: Warcry' })
    },
  },

  onStart(sim, u, ctx) {
    const eid = (ctx.eidolon as number) ?? 0
    const rt = sim.rt(u)
    // Riposte stacks never expire — source data documents only "Stacks up to 10 time(s)"
    // with no duration. Upgrade: decay on turn end if the wiki ever states one.
    rt.ssStacks = 0
    // E6 Dwell Like Water: immediately gain 1 stack of Talent's SPD Boost at battle start
    if (eid >= 6) applyDancingBlade(sim, u, levelsOf(ctx), eid, true)
    // E4 Cleave With Heart: Break Effect +40%
    if (eid >= 4) sim.addBuff(u, { id: 'sushang_e4', name: 'Cleave With Heart', mods: [{ stat: 'be', value: 0.4 }], turns: Infinity })
  },

  onTurnStart(sim, u, ctx) {
    applyGuileless(sim, u)
    applyDancingBlade(sim, u, levelsOf(ctx), (ctx.eidolon as number) ?? 0)
  },

  // A1 Guileless re-gate: the hit that takes her under 50% turns the aspect on.
  // A1 Guileless re-gate: the hit that takes her under 50% turns the aspect on.
  // Kit onAllyHit has no owner param (it fires for every kit), so identify her by kitId.
  onAllyHit(sim, _attacker, target, _dmg, _ctx) {
    if (target.kind === 'char' && target.kitId === 'sushang') applyGuileless(sim, target)
  },

  onBreak(sim, _breaker, _victim, ctx) {
    // Talent re-gate: a fresh weakness break re-applies the SPD buff immediately.
    const sushang = sim.allies('ally').find(a => a.kitId === 'sushang' && !a.dead)
    if (sushang) applyDancingBlade(sim, sushang, levelsOf(ctx), (ctx.eidolon as number) ?? 0)
  },

  decide(sim, u, ctx) {
    if ((ctx.skillPriority as number) > 0 && sim.sp() >= 1) return { kind: 'skill' }
    return decideByPattern(sim, u, ctx, true)
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
      const t = manualTarget(sim, action, pickTarget_sushang(sim, u)!)
      sim.hit(u, t, { type: 'ult', mult: mult('sushang', 'ult', lv.ult), toughDmg: 30, label: 'Dawn Herald' })
      // ATK up + 2 extra Sword Stance chances for the same duration
      const turns = mult('sushang', 'ult_a2', lv.ult)
      sim.addBuff(u, {
        id: 'sushang_ult', name: 'Dawn Herald',
        mods: [{ stat: 'atkPct', value: mult('sushang', 'ult_a4', lv.ult) }],
        turns,
      })
      sim.grantExtraTurn(u) // Dawn Herald: Sushang immediately takes action
      sim.log(`${u.name} Dawn Herald (energy +5)`)
      return
    }

    if (action.kind === 'skill' && sim.spendSp(1)) {
      sim.gainEnergy(u, 30)
      const t = manualTarget(sim, action, pickTarget_sushang(sim, u)!)
      const brokenTarget = t.broken
      sim.hit(u, t, { type: 'skill', mult: mult('sushang', 'skill', lv.skill), split: [0.3, 0.7], toughDmg: 30, label: 'Mountainfall' })

      // Sword Stance: 33% chance (skill_a3) → Additional DMG (skill_a2); guaranteed vs Broken.
      const chance = mult('sushang', 'skill_a3', lv.skill)
      const roll = brokenTarget || sim.rng() < chance
      if (roll) {
        // Riposte: each Sword Stance triggered +2% Sword Stance DMG, 10 stacks
        const st = Math.min(MAX_SS, ((rt.ssStacks as number) ?? 0) + 1)
        rt.ssStacks = st
        const bonus = 1 + 0.02 * st
        const ssDmg = sim.hit(u, t, {
          type: 'add', noSeq: true, mult: mult('sushang', 'skill_a2', lv.skill) * bonus, toughDmg: 0,
          label: 'Sword Stance',
        })
        // E2 Refine in Toil: after Sword Stance → DMG taken −20% for 1 turn
        if (eid >= 2 && ssDmg > 0) sim.addBuff(u, { id: 'sushang_e2', name: 'Refine in Toil', mods: [{ stat: 'mitigation', value: 0.2 }], turns: 1 })
      }

      // Ult A2: while Dawn Herald active, Skill has 2 extra Sword Stance chances, each at 50% of original.
      if (sim.hasBuff(u, 'sushang_ult')) {
        for (let i = 0; i < mult('sushang', 'ult_a2', lv.ult); i++) {
          if (sim.rng() < chance) {
            const st = Math.min(MAX_SS, ((rt.ssStacks as number) ?? 0) + 1)
            rt.ssStacks = st
            const bonus = 1 + 0.02 * st
            sim.hit(u, t, {
          type: 'add', noSeq: true, mult: mult('sushang', 'skill_a2', lv.skill) * mult('sushang', 'ult_a3', lv.ult) * bonus,
          toughDmg: 0, label: 'Sword Stance (extra)',
            })
          }
        }
      }

      // E1 Cut With Ease: Skill vs Weakness-Broken enemy → +1 SP
      if (eid >= 1 && brokenTarget) {
        sim.gainSp(1)
        sim.log(`${u.name} E1 Cut With Ease: +1 Skill Point`)
      }
      // Vanquisher: after Basic/Skill, if any enemy is Weakness-Broken → advance 15%
      if (anyBroken(sim, u)) sim.advance(u, 0.15)
      return
    }

    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    const t = manualTarget(sim, action, pickTarget_sushang(sim, u)!)
    sim.hit(u, t, { type: 'basic', mult: mult('sushang', 'basic', lv.basic), toughDmg: 10, label: 'Starshine' })
    // Vanquisher
    if (anyBroken(sim, u)) sim.advance(u, 0.15)
  },
}


// ===== march7th_the_hunt  (was march7th_the_hunt.ts) =====
// Technique «Feast in One Go» (122407): at the start of the next battle grants 1 Charge per
// teammate that used a Technique (max 3) and 30 Energy. «Фильгри»/Shifu-дизейгн: мульти-хит Enhanced Basic схлопнут
// в одну атаку (`split`), поэтому её треул-инстанс один на всю атаку, а не на каждый хит (паттерн
// yanqing/sushang).

const PID = 'march7th_the_hunt'
const SHIFU = 'm7h_shifu'    // Shifu-дизейгн: SPD% (канон: «только последняя цель Skill»)
const E1SPD = 'm7h_e1_spd'   // E1 My Sword Stirs Starlight
const ASCEND = 'm7h_ascend'  // Talent Master, I've Ascended! — DMG+
const TIDE = 'm7h_tide'      // A6 Tide Tamer
const E6CD = 'm7h_e6_cd'     // E6 Me, the Best Girl in Sight

/** Shifu-пути: «боевые» дают Additional DMG в элементе Shifu, «саппорт» — +100% Toughness Reduction.
 *  Путь The Hunt в реестре пишется как 'Hunt', в characters.json — как 'The Hunt' (оба в списке). */
const STRIKER = ['Erudition', 'Destruction', 'Hunt', 'The Hunt', 'Remembrance', 'Elation']

const isStriker = (s: Unit): boolean => STRIKER.includes(s.base.path ?? '')

/** назначенный Shifu: только живые алли-чары (самона/мемоспрайта назначить нельзя) */
function shifuOf(sim: SimApi, m: Unit): Unit | undefined {
  const id = sim.rt(m).shifuId as string | undefined
  if (!id) return undefined
  const s = sim.find(id)
  return s && s.kind === 'char' ? s : undefined
}

function chargeOf(sim: SimApi, m: Unit): number {
  return (sim.rt(m).charge as number) ?? 0
}

/** Talent: Shifu-атакует → +1 Charge; на пороге — немедленное действие (Ascended) */
function addCharge(sim: SimApi, m: Unit, ctx: KitRuntime, n: number): void {
  if (m.dead) return
  const rt = sim.rt(m)
  const lv = levelsOf(ctx)
  const need = mult(PID, 'talent', lv.talent)
  const cap = mult(PID, 'talent_a3', lv.talent)
  const before = chargeOf(sim, m)
  const after = Math.min(cap, before + n)
  rt.charge = after
  sim.log(`${m.name}: Charge ${before} → ${after}/${cap}`)
  if (rt.ascended === true) return
  if (after < need) return
  rt.ascended = true
  sim.removeBuff(m, ASCEND)
  sim.addBuff(m, {
    id: ASCEND, name: "Master, I've Ascended!", sourceId: m.id, turns: Infinity,
    mods: [{ stat: 'dmgAll', value: mult(PID, 'talent_a2', lv.talent) }],
  })
  sim.log(`>> ${m.name} ASCENDED (Basic ATK enhanced, Skill locked, DMG +${(mult(PID, 'talent_a2', lv.talent) * 100).toFixed(0)}%)`)
  sim.immediateTurn(m)
}

/** Skill-дизейгн: SPD-буфф переезжает на новую цель, E1 переоценивается */
function designate(sim: SimApi, m: Unit, ctx: KitRuntime, target: Unit): void {
  const rt = sim.rt(m)
  const prev = shifuOf(sim, m)
  if (prev && prev.id !== target.id) sim.removeBuff(prev, SHIFU)
  rt.shifuId = target.id
  sim.removeBuff(target, SHIFU)
  sim.addBuff(target, {
    id: SHIFU, name: 'Shifu (Tea Time)', sourceId: m.id, turns: Infinity,
    mods: [{ stat: 'spdPct', value: mult(PID, 'skill', levelsOf(ctx).skill) }],
  })
  refreshE1(sim, m)
  sim.markAlliedTarget(target)
  sim.log(`${m.name} designates ${target.name} as "Shifu" (${target.base.path}, SPD +${(mult(PID, 'skill', levelsOf(ctx).skill) * 100).toFixed(1)}%)`)
}

/** E1 My Sword Stirs Starlight: +10% SPD, пока Shifu в строю (смерть Shifu видна на её ходу) */
function refreshE1(sim: SimApi, m: Unit): void {
  sim.removeBuff(m, E1SPD)
  if (((sim.rt(m).eidolon as number) ?? 0) < 1 || !shifuOf(sim, m)) return
  sim.addBuff(m, { id: E1SPD, name: 'My Sword Stirs Starlight', sourceId: m.id, turns: Infinity, mods: [{ stat: 'spdPct', value: 0.1 }] })
}

/** лучший Shifu-кандидат: быстрейший живой алли (его быстрее вставить в ротацию) */
function bestShifu(sim: SimApi, m: Unit): Unit | undefined {
  const cands = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead && a.id !== m.id)
  if (!cands.length) return undefined
  return cands.reduce((b, a) => (sim.baseAv(a) < sim.baseAv(b) ? a : b), cands[0])
}

/**
 * Skill-эффект Shifu: боевой путь → Additional DMG в элементе Shifu (по каждому хиту Enhanced Basic),
 * саппорт-путь → Toughness Reduction самой атаки (wbeBonus +100%, canon skill_a3 = 1).
 */
function shifuEffect(sim: SimApi, m: Unit, ctx: KitRuntime, target: Unit, times: number): void {
  const s = shifuOf(sim, m)
  if (!s || !isStriker(s) || times <= 0) return
  const mult2 = mult(PID, 'skill_a2', levelsOf(ctx).skill)
  const elem = s.elem as Elem
  for (let i = 0; i < times; i++) {
    if (target.dead) break
    sim.hit(m, target, { type: 'add', mult: mult2, elem, noSeq: true, label: "Master, It's Tea Time! (Shifu Additional DMG)" })
  }
}

/** +100% Toughness Reduction этой атаки, если Shifu — саппорт-путь */
function shifuWbe(sim: SimApi, m: Unit, ctx: KitRuntime): number {
  const s = shifuOf(sim, m)
  return s && !isStriker(s) ? mult(PID, 'skill_a3', levelsOf(ctx).skill) : 0
}

/** A4 Filigree: треул и Imaginary-break работают и по слабости элемента Shifu */
function filigree(sim: SimApi, m: Unit, target: Unit): number | undefined {
  const s = shifuOf(sim, m)
  if (!s || !s.elem || s.elem === m.elem) return undefined
  return target.weaknesses.includes(s.elem) ? 1 : undefined
}

/** E2 Blade Dances on Waves' Fight: Shifu Basic ATK or Skill → FUA 60% + эффект пути +1 Charge
 *  (раз за ход). Гейт по pressed-ability (не по типу DMG): у Shifu их Basic/Skill могут быть
 *  ретайпнуты (Feixiao A4/Ult, Moze), а Ult по канону НЕ триггерит E2 — только Talent даёт Charge
 *  за «attack or Ultimate». Тег `abilityType` приходит из DamagePipeline через onAfterAttack. */
function e2FollowUp(sim: SimApi, m: Unit, ctx: KitRuntime, attacker: Unit, target: Unit, abilityType: AbilityType): void {
  if (((ctx.eidolon as number) ?? 0) < 2) return
  if (abilityType !== 'basic' && abilityType !== 'skill') return
  const rt = sim.rt(m)
  if ((rt.e2Turn as number) === sim.battleTurn) return
  rt.e2Turn = sim.battleTurn
  const primary = target && target.side === 'enemy' && !target.dead ? target : sim.livingEnemiesOf(m)[0]
  if (!primary) return
  sim.hit(m, primary, { type: 'fua', mult: 0.6, label: 'Blade Dances on Waves Fight (Shifu FUA)' })
  shifuEffect(sim, m, ctx, primary, 1)
  addCharge(sim, m, ctx, 1)
}

export const march7thTheHuntKit: KitDef = {
  id: PID,
  name: 'March 7th • The Hunt',
  elem: 'Imaginary',
  energyMax: 110,
  base: { level: 80, hp: 1058, atk: 564, def: 441, spd: 102, critRate: 0.05, critDmg: 0.5, path: 'Hunt' },
  // #122407 "Feast in One Go" (Technique): at battle start March 7th gains 1 Charge per other
  // teammate that used a Technique (max #1=3) and regenerates #2=30 Energy.
  technique: {
    name: 'Feast in One Go',
    kind: 'buff',
    apply(sim, u, ctx) {
      const active = new Set(sim.activeTechniques())
      const mates = sim.allies('ally').filter(a => a.id !== u.id && a.kind === 'char' && !!a.kitId && active.has(a.kitId)).length
      if (mates > 0) addCharge(sim, u, ctx, Math.min(3, mates))
      sim.gainEnergy(u, 30)
    },
  },

  onStart(sim, u) {
    // A2 Swan Soar: на старте боя её действие сдвигается на 25%
    sim.advance(u, 0.25)
    sim.log(`${u.name}: Swan Soar (advance 25%)`)
    // E2 Blade Dances on Waves' Fight: shield for the ally with the lowest HP at battle start
    const eid = (sim.rt(u).eidolon as number) ?? 0
    if (eid >= 2) {
      const allies = sim.allies('ally').filter(a => a.kind === 'char' && !a.dead)
      if (allies.length) {
        const low = allies.reduce((m, a) => (a.hp / a.maxHp < m.hp / m.maxHp ? a : m), allies[0])
        sim.addBuff(low, {
          id: 'm7h_e2_shield', name: 'Blade Dances on Waves Fight', sourceId: u.id,
          mods: [], turns: 3, shield: Math.round(eff(u).def * 0.24 + 320),
        })
        sim.log(`${u.name} E2: battle-start shield for ${low.name}`)
      }
    }
  },

  onTurnStart(sim, u, ctx) {
    if (((ctx.eidolon as number) ?? 0) >= 4) sim.gainEnergy(u, 5)
    refreshE1(sim, u)
  },

  decide(sim, u, ctx) {
    const rt = sim.rt(u)
    if (rt.ascended === true) return { kind: 'basic' }  // Skill залочен, Basic ATK Enhanced
    if (u.energy >= u.maxEnergy) return { kind: 'ult' }
    if (sim.sp() >= 1 && (!shifuOf(sim, u) || ((ctx.skillPriority as number) ?? 0) > 0)) return { kind: 'skill' }
    return { kind: 'basic' }
  },

  perform(sim, u, action, ctx) {
    const enemies = sim.livingEnemiesOf(u)
    if (!enemies.length) return
    const lv = levelsOf(ctx)
    const rt = sim.rt(u)
    const eid = (ctx.eidolon as number) ?? 0
    const target = enemies[0]

    if (action.kind === 'ult') {
      if (u.energy < u.maxEnergy) return
      u.energy = 0
      sim.hit(u, target, { type: 'ult', mult: mult(PID, 'ult', lv.ult), toughDmg: 30, label: 'March 7th, the Apex Heroine' })
      rt.ultHits = ((rt.ultHits as number) ?? 0) + mult(PID, 'ult_a2', lv.ult)
      rt.ultChance = ((rt.ultChance as number) ?? 0) + mult(PID, 'ult_a3', lv.ult)
      sim.log(`The Apex Heroine: next Enhanced Basic ATK +${rt.ultHits} hit(s), +${((rt.ultChance as number) * 100).toFixed(0)}% additional-hit chance`)
      if (eid >= 6) {
        sim.removeBuff(u, E6CD)
        sim.addBuff(u, { id: E6CD, name: 'Me, the Best Girl in Sight', sourceId: u.id, turns: Infinity, mods: [{ stat: 'critDmg', value: 0.5 }] })
        sim.log('E6 Me, the Best Girl in Sight: next Enhanced Basic ATG CRIT DMG +50%')
      }
      return
    }

    if (action.kind === 'skill') {
      if (rt.ascended === true) { sim.log(`${u.name}: Skill is locked while Ascended`); return }
      const fallback = bestShifu(sim, u)
      if (!fallback) { sim.log(`${u.name}: no living ally to designate as Shifu`); return }
      if (!sim.spendSp(1)) return
      sim.gainEnergy(u, 30)
      designate(sim, u, ctx, manualTarget(sim, action, fallback))
      return
    }

    if (rt.ascended === true) {
      // ---- Enhanced Basic ATK «Brows Be Smitten, Heart Be Bitten» ----
      let hits = mult(PID, 'basic_en_a4', lv.basic) + ((rt.ultHits as number) ?? 0)
      const maxExtra = mult(PID, 'basic_en_a3', lv.basic)
      const chance = mult(PID, 'basic_en_a2', lv.basic) + ((rt.ultChance as number) ?? 0)
      let extra = 0
      while (extra < maxExtra && sim.rng() < chance) extra++
      hits += extra
      rt.ultHits = 0
      rt.ultChance = 0
      const wbe = shifuWbe(sim, u, ctx)
      sim.gainEnergy(u, 30)  // энергия не растёт с числом хитов (canon)
      // Enhanced Basic ATK не восстанавливает SP
      sim.hit(u, target, {
        type: 'basic', mult: mult(PID, 'basic_en', lv.basic) * hits,
        split: Array.from({ length: hits }, () => 1 / hits),
        toughDmg: 5, wbeBonus: wbe, pierceRatio: filigree(sim, u, target),
        label: 'Brows Be Smitten, Heart Be Bitten',
      })
      shifuEffect(sim, u, ctx, target, hits)

      // Talent: Enhanced Basic потратил Charge → состояние спадает
      rt.ascended = false
      rt.charge = Math.max(0, chargeOf(sim, u) - mult(PID, 'talent', lv.talent))
      sim.removeBuff(u, ASCEND)
      sim.removeBuff(u, E6CD)
      sim.log(`${u.name}: Charge consumed (${rt.charge})`)
      const s = shifuOf(sim, u)
      if (s) {
        sim.removeBuff(s, TIDE)
        sim.addBuff(s, { id: TIDE, name: 'Tide Tamer', sourceId: u.id, turns: 2, mods: [{ stat: 'critDmg', value: 0.6 }, { stat: 'be', value: 0.36 }] })
        sim.log(`Tide Tamer: ${s.name} CRIT DMG +60%, Break Effect +36% (2t)`)
      }
      return
    }

    // ---- Basic ATK «My Sword Zaps Demons» ----
    sim.gainSp(1)
    sim.gainEnergy(u, 20)
    sim.hit(u, target, {
      type: 'basic', mult: mult(PID, 'basic', lv.basic), split: [0.4, 0.6], toughDmg: 10,
      wbeBonus: shifuWbe(sim, u, ctx), pierceRatio: filigree(sim, u, target),
      label: 'My Sword Zaps Demons',
    })
    shifuEffect(sim, u, ctx, target, 1)
    addCharge(sim, u, ctx, mult(PID, 'basic_a2', lv.basic))
  },

  /** Talent Charge (Shifu атаковал) + E2 FUA. `u` = сама March 7th */
  /** Talent Charge (Shifu атаковал) + E2 FUA. Хук не передаёт `u` — March ищем по kitId. */
  onAfterAttack(sim, attacker, target, dmgType, ctx, _dmg, _atkToughRed, abilityType) {
    if (attacker.dead) return
    const m = sim.allies('ally').find(x => x.kitId === PID)
    if (!m) return
    const s = shifuOf(sim, m)
    if (!s || attacker.id !== s.id) return
    const rt = sim.rt(m)
    const seq = sim.attackNo()
    const firstHit = rt.lastSeq !== seq
    rt.lastSeq = seq
    // Talent 122404 «Master, I've Ascended!»: «After Shifu uses an attack or Ultimate» → +1 Charge.
    // Триггерит по любому удару Shifu, кроме не-атак (DoT/break); `firstHit` — один раз на атаку.
    // E2 (Blade Dances) отдельно: только Basic ATK/Skill — гейт по abilityType внутри e2FollowUp.
    if (dmgType !== 'dot' && dmgType !== 'break') {
      if (firstHit) addCharge(sim, m, ctx, mult(PID, 'basic_a2', levelsOf(ctx).basic))
      e2FollowUp(sim, m, ctx, attacker, target, abilityType ?? 'other')
    }
  },
}

