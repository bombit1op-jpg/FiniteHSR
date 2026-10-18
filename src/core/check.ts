// Self-check: assert-based verification of core formulas + a smoke battle.
// Node:  npm run check   Browser: кнопка "Self-check" (лог в консоль DevTools)
import { defMultiplier } from './combat/StatResolver'
import { eff, effectResOf } from './combat/StatResolver'
import { computeBreakDamage, computeDotDamage, dealDamage, dealElationDamage, makeRng } from './combat/DamageCalculator'
import { punchlineMult, cbElationHit, engageFarming, engagePoolsReset } from './elation'
import { levelMultiplier, elationLevelMultiplier } from './combat/LevelMultiplier'
import { Simulator } from './simulator'
import { mirrorOwnerCrit } from './kit'
import type { KitDef } from './kit'
import { KITS } from './kits'
import { aggregateGear } from './gear'
import { ENEMY_PRESETS, prepareBattle, runBattle, runBattleManual } from './battle'
import { selfCheck as autoAiCheck } from './autoai'
import type { BattleIO, BattleSetup } from './battle'
import type { Elem, RelicPiece, Unit } from './entities/Unit'
import type { Buff } from './effects/Buff'

export async function runChecks(): Promise<{ text: string; failed: number }> {
  const lines: string[] = []
  let failed = 0

  function eq(name: string, actual: number, expected: number, tol = 0.01): void {
    const ok = Math.abs(actual - expected) <= tol
    if (!ok) { failed++; lines.push(`FAIL ${name}: got ${actual}, want ${expected}`) }
    else lines.push(`ok   ${name} = ${actual}`)
  }

  function mkUnit(p: Partial<Unit>): Unit {
    return {
      id: 't', name: 'T', side: 'ally', kind: 'char', elem: 'Quantum',
      base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100 },
      hp: 1000, maxHp: 1000, energy: 0, maxEnergy: 120, av: 0,
      buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false, weaknesses: [], res: {},
      ...p,
    } as Unit
  }

  // DEF multiplier: attacker lvl80 vs defender lvl95 (DEF=1150), no mods
  eq('defMult lvl80 vs lvl95',
    defMultiplier(80, 95, mkUnit({ base: { level: 95, hp: 1, atk: 1, def: 0, spd: 1 } })),
    (800 + 200) / (1150 + 800 + 200))

  // Level Multiplier anchors (wiki table)
  eq('lvlMult 80', levelMultiplier(80), 3767.5533)
  eq('lvlMult 60', levelMultiplier(60), 1640.3068)
  // Elation Level Multiplier = 2× the Toughness table (docs/Elation DMG.md)
  eq('elation lvlMult 80', elationLevelMultiplier(80), 7535.107)

  // Break DMG: Physical lvl80 BE=0 vs maxToughness 60, unbroken ×0.9
  {
    const atk = mkUnit({ name: 'A', elem: 'Physical', base: { level: 80, hp: 1, atk: 1, def: 1, spd: 1 } })
    const tgt = mkUnit({ side: 'enemy', maxToughness: 60, res: {}, base: { level: 95, hp: 9_999_999, atk: 1, def: 0, spd: 1 } })
    const expected = Math.floor(2 * levelMultiplier(80) * (0.5 + 60 / 40) * ((800 + 200) / (1150 + 800 + 200)) * 0.9)
    eq('breakDMG physical t60 unbroken',
      computeBreakDamage({ attacker: atk, target: tgt, elem: 'Physical', kind: 'break' }),
      expected, 0.5)
  }

  // FULL break path (vash transcript "Techniques are Cursed"): the hit that depletes
  // toughness AND its break DMG both resolve at intact ×0.9 — the enemy counts as broken
  // only AFTER the break DMG resolves. Drives through applyToughness, not the direct call.
  {
    const sim = new Simulator({ cycles: 1, seed: 3 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const u = sim.addChar('seele', 'Seele', { atk: 2000, critRate: 0, critDmg: 0.5 })
    const e = sim.addEnemy({ name: 'Mob', hp: 100_000, spd: 110, level: 95, toughness: 10, weaknesses: ['Quantum'], atk: 800 })
    sim.hit(u, e, { type: 'skill', elem: 'Quantum', mult: 1.0, toughDmg: 10, canCrit: false, label: 'probe' })
    const acc = [...sim.accounts].find(([n]) => n === 'Seele')?.[1]
    const bdmg = acc?.bySkill['Weakness Break'] ?? NaN
    const want = Math.floor(0.5 * levelMultiplier(80) * (0.5 + 10 / 40) * ((800 + 200) / (1150 + 800 + 200)) * 0.9)
    eq('breaking-hit Break DMG resolves intact ×0.9 (full path)', bdmg, want, 0.5)
  }

  // General damage: basic 110% ATK 2500, no crit; broken multiplier 0.9 → 1.0
  {
    const rng = makeRng(42)
    const atk = mkUnit({
      name: 'Seele', elem: 'Quantum',
      base: { level: 80, hp: 931, atk: 2500, def: 363, spd: 115, critRate: 0, critDmg: 1.0 },
    })
    const tgt = mkUnit({ side: 'enemy', maxToughness: 60, base: { level: 95, hp: 99_999, atk: 1, def: 0, spd: 1 }, res: {} })
    const defM = (800 + 200) / (1150 + 800 + 200)
    eq('basic dmg no crit ×0.9',
      dealDamage({ attacker: atk, target: tgt, elem: 'Quantum', type: 'skill', statValue: 2500, mult: 1.10, canCrit: false }, rng).dmg,
      Math.floor(2500 * 1.10 * defM * 0.9), 0.5)

    tgt.broken = true
    eq('basic dmg vs broken ×1.0',
      dealDamage({ attacker: atk, target: tgt, elem: 'Quantum', type: 'skill', statValue: 2500, mult: 1.10, canCrit: false }, rng).dmg,
      Math.floor(2500 * 1.10 * defM), 0.5)

    // guaranteed crit: multiplier must be 1 + critDmg
    atk.base.critRate = 1
    eq('guaranteed crit uses 1+CD',
      dealDamage({ attacker: atk, target: tgt, elem: 'Quantum', type: 'skill', statValue: 2500, mult: 1.10 }, makeRng(1)).dmg,
      Math.floor(2500 * 1.10 * defM * (1 + 1.0)), 0.5)
  }

  // finalDmgBoost: the final multiplier is applied LAST, so it composes with the DMG Boost
  // pool instead of folding into it — Anaxa E6 (+30% final) over A4 (+50% boost) is
  // 1.5×1.3 = 1.95, not 1+0.5+0.3 = 1.8. Must hold on every damage path.
  {
    const boost: Buff = { id: 'b_boost', name: 'Boost', mods: [{ stat: 'dmgAll', value: 0.5 }], turns: 9 }
    const final: Buff = { id: 'b_final', name: 'Final', mods: [{ stat: 'finalDmgBoost', value: 0.3 }], turns: 9 }
    const atk = mkUnit({ name: 'A', elem: 'Quantum', base: { level: 80, hp: 1, atk: 1, def: 1, spd: 1 } })
    const tgt = mkUnit({ side: 'enemy', maxToughness: 60, base: { level: 95, hp: 9_999_999, atk: 1, def: 0, spd: 1 }, res: {} })
    const defM = (800 + 200) / (1150 + 800 + 200)
    // target is intact (maxToughness 60, not broken) → ×0.9 on every path
    const deal = () => dealDamage({ attacker: atk, target: tgt, elem: 'Quantum', type: 'skill', statValue: 2500, mult: 1, canCrit: false }, makeRng(1)).dmg
    const ela = () => dealElationDamage({ attacker: atk, target: tgt, elem: 'Quantum', type: 'elation', statValue: 2500, mult: 1, canCrit: false }, makeRng(1)).dmg
    const dot = () => computeDotDamage(atk, tgt, { kind: 'Burn', elem: 'Quantum', baseDmg: 2500, turns: 2 })
    const brk = () => computeBreakDamage({ attacker: atk, target: tgt, elem: 'Physical', kind: 'break' })
    const brkBase = 2 * levelMultiplier(80) * (0.5 + 60 / 40) * defM * 0.9

    atk.buffs = [boost, final]
    // dealDamage and DoT consume the boost pool; Elation and Break never do
    eq('finalDmgBoost: dealDamage = boost × final (1.5×1.3)', deal(), Math.floor(2500 * 1.5 * 1.3 * defM * 0.9), 0.5)
    eq('finalDmgBoost: DoT = boost × final (1.5×1.3)', dot(), Math.floor(2500 * 1.5 * 1.3 * defM * 0.9), 0.5)
    eq('finalDmgBoost: dealElation ×1.3 (skips boost pool)', ela(), Math.floor(2500 * 1.3 * defM * 0.9), 0.5)
    eq('finalDmgBoost: break ×1.3 (skips boost pool)', brk(), Math.floor(brkBase * 1.3), 0.5)
    // regression guard: the old single-pool model produced exactly 1.8 here
    eq('finalDmgBoost: not additive into the boost pool', deal() === Math.floor(2500 * 1.8 * defM * 0.9) ? 0 : 1, 1)
    atk.buffs = [final]
    eq('finalDmgBoost: final applies with no boost present', deal(), Math.floor(2500 * 1.3 * defM * 0.9), 0.5)
  }

  // Sparxie gift pools (vash transcript "The Actual Probability of Sparxie's Skill"):
  // pity ≥6 AND grand remaining → forced grand; pools reset on basic attack; pity carries.
  {
    const sim = new Simulator({ cycles: 1, seed: 1 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const u = sim.addChar('sparxie', 'Sparxie', { atk: 1000 })
    sim.addEnemy({ name: 'Mob', hp: 100_000, spd: 110, level: 95, toughness: 0, weaknesses: ['Fire'], atk: 800 })
    const rt = sim.rt(u)

    // 1. Forced grand: pity=6, grand=1 → grand guaranteed, no rng consumed
    rt.engageGrand = 1; rt.engageMinor = 25; rt.engagePity = 6
    const pBefore = sim.sp()
    engageFarming(sim, u)
    eq('gift pools: pity=6 → forced grand (grand-1, pity→0)',
      (rt.engageGrand as number) === 0 && (rt.engagePity as number) === 0 && sim.sp() - pBefore === 2 ? 1 : 0, 1)

    // 2. Guaranteed minor when grand=0: ratio = 0 → always minor regardless of rng
    rt.engageGrand = 0; rt.engageMinor = 25; rt.engagePity = 0
    engageFarming(sim, u)
    eq('gift pools: grand=0 → guaranteed minor (minor-1, pity+1)',
      (rt.engageMinor as number) === 24 && (rt.engagePity as number) === 1 ? 1 : 0, 1)

    // 3. Pool reset preserves pity
    rt.engagePity = 5
    engagePoolsReset(sim, u)
    eq('gift pools: reset → grand=3, minor=25, pity carried (5)',
      (rt.engageGrand as number) === 3 && (rt.engageMinor as number) === 25 && (rt.engagePity as number) === 5 ? 1 : 0, 1)
  }

  // Elation subsystem (docs/combat_mechanics/{Punchline,Elation DMG,Merrymake}.md)
  {
    eq('punchlineMult 0 = 1', punchlineMult(0), 1)
    eq('punchlineMult 240 = 3.5', punchlineMult(240), 3.5)
    eq('punchlineMult 20 = 1+100/260', punchlineMult(20), 1 + 100 / 260)

    const rng = makeRng(7)
    const a = mkUnit({
      name: 'Sparxie', elem: 'Fire',
      base: { level: 80, hp: 931, atk: 2500, def: 363, spd: 107, critRate: 1, critDmg: 1.0, path: 'Elation' },
    })
    const t = mkUnit({ side: 'enemy', maxToughness: 60, base: { level: 95, hp: 99_999, atk: 1, def: 0, spd: 1 }, res: {} })
    const defM = (800 + 200) / (1150 + 800 + 200)
    const fold = (base: number, elation: number, p: number, merry: number) =>
      base * (1 + elation) * punchlineMult(p) * (1 + merry)

    // Elation DMG ignores DMG Boost: a dmgAll buff must NOT change the elation hit.
    a.buffs = [{ id: 'dmgAll', name: 'dmgAll', mods: [{ stat: 'dmgAll', value: 0.5 }] }]
    const noBoost = dealElationDamage({ attacker: a, target: t, elem: 'Fire', type: 'elation', statValue: 2500, mult: fold(1.10, 0, 20, 0) }, rng).dmg
    eq('elation no DMG Boost (dmgAll ignored)',
      noBoost,
      Math.floor(2500 * fold(1.10, 0, 20, 0) * (1 + 1.0) * defM * 0.9), 0.5)
    const regularBoosted = dealDamage({ attacker: a, target: t, elem: 'Fire', type: 'skill', statValue: 2500, mult: 1.10 }, rng).dmg
    eq('regular DMG still applies dmgAll',
      regularBoosted,
      Math.floor(2500 * 1.10 * (1 + 0.5) * (1 + 1.0) * defM * 0.9), 0.5)

    // Time Waits for No One: pure damage formula — noDmgBoost ignores dmgAll AND dmg:elem.
    const a2buff = [{ id: 'dmgAll', name: 'dmgAll', mods: [{ stat: 'dmgAll' as const, value: 0.5 }] }]
    a.buffs = a2buff; t.buffs = []
    const pureHit = dealDamage({ attacker: a, target: t, elem: 'Fire', type: 'add', statValue: 0, flat: 100, mult: 0, noDmgBoost: true, canCrit: false }, rng).dmg
    eq('pure formula no DMG% (dmgAll + elem ignored)', pureHit, Math.floor(100 * defM * 0.9), 0.5)
    a.buffs = []

    // Elation base = Level Multiplier × Ability Multiplier (statValue=1 convention):
    // mult already holds LM × 0.5 ability fraction, crit +defM +broken apply downstream.
    const lmBased = dealElationDamage({ attacker: a, target: t, elem: 'Fire', type: 'elation', statValue: 1, mult: 7535.107 * 0.5 }, rng).dmg
    eq('elation base LM×AbilityMult', lmBased, Math.floor(7535.107 * 0.5 * (1 + 1.0) * defM * 0.9), 0.5)
  }

  // Certified Banger: states track 2 turns independently and sum; CB-gated Elation DMG
  // uses the character's CB total (never the shared pool). Aha's instant drains the pool.
  {
    const sim = new Simulator({ cycles: 1, seed: 3 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const s = sim.addChar('sparxie', 'Sparxie', { spd: 107, atk: 2500, critRate: 1, critDmg: 1.0 })
    const e = sim.addEnemy({ name: 'Mob', hp: 100_000, spd: 110, level: 95, toughness: 0, weaknesses: ['Fire'], atk: 800 })
    sim.addCb(s, 40)
    sim.addCb(s, 60)
    eq('cbOf sums states', sim.cbOf(s), 100)
    // CB-gated Elation hit uses CB (not shared pool=0): mult = punchlineMult(100)
    const cbDmg = dealElationDamage({ attacker: s, target: e, elem: 'Fire', type: 'elation', statValue: 1, mult: 7535.107 * 0.5 * (1 + eff(s).elation) * punchlineMult(100) * (1 + eff(s).merrymake) }, makeRng(9)).dmg
    eq('CB Elation DMG uses CB (pool empty → 0 Punchline ≠ gated hit)', cbDmg, Math.floor(7535.107 * 0.5 * (1 + eff(s).elation) * punchlineMult(100) * (1 + eff(s).merrymake) * (1 + eff(s).critDmg) * defMultiplier(80, 95, e)), 0.5)
    // cbElationHit with NO CB deals no damage
    const s2 = mkUnit({ base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, path: 'Elation' } })
    const e2 = mkUnit({ side: 'enemy', maxToughness: 0, base: { level: 95, hp: 100_000, atk: 1, def: 0, spd: 1 }, res: {} })
    const hpBefore = e2.hp
    cbElationHit(sim, s2, e2, 0.5, 'Sleight (main)')
    eq('cbElationHit gated: no CB → 0 dmg', hpBefore - e2.hp, 0)
    // CB punctuation scales with punchlineMult of the character's CB total (deterministic unit:
    // base elation/merrymake 0, critRate/critDmg 1/1 → mult = LM × 0.5 × punchlineMult(CB) × 2 crit)
    const s3 = mkUnit({ elem: 'Fire',
      base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, path: 'Elation', critRate: 1, critDmg: 1 } })
    const e3 = mkUnit({ side: 'enemy', maxToughness: 0, hp: 1_000_000, maxHp: 1_000_000, base: { level: 95, hp: 1_000_000, atk: 1, def: 0, spd: 1 }, res: {} })
    sim.addCb(s3, 100)
    cbElationHit(sim, s3, e3, 0.5, 'Sleight (main)')
    const wantCB = Math.floor(7535.107 * 0.5 * punchlineMult(100) * (1 + 1) * defMultiplier(80, 95, e3))
    eq('CB punctuation = LM×0.5×punchlineMult(CB)×crit×DEF (tough 0 → brokenM 1)',
      (1_000_000 - e3.hp), wantCB, 0.5)
    // Aha event: generated for an Elation team, takes instants on its own timeline, and
    // drains the shared Punchline into Certified Banger (2t) states
    const ab = runBattle({
      team: [{ kitId: 'sparxie', stats: { hp: 5000, atk: 2200, def: 1300, spd: 107 } }],
      enemy: { name: 'Test Foe', count: 3, hp: 400_000, spd: 110, level: 85, toughness: 600, weaknesses: ['Fire'], atk: 600 },
      cycles: 2, seed: 21,
    })
    eq('Aha Instant fired', ab.logLines.some(l => l.includes('AHA INSTANT')) ? 1 : 0, 1)
    eq('Certified Banger granted by Aha Instant', ab.logLines.some(l => l.includes('Certified Banger')) ? 1 : 0, 1)
    eq('Aha drains Punchline to 0', ab.punchline, 0)
    eq('pool was positive (peak>0)', ab.punchlinePeak() > 0 ? 1 : 0, 1)
  }

  // Aha SPD transfer: 20/10/5/2.5% of fastest→slowest Elation char speeds (80 base).
  // Solo Elation char at 107 SPD → 80 + 0.2×107 = 101.4 (≈98.6 AV/first instant).
  {
    const sim = new Simulator({ cycles: 1, seed: 5 })
    for (const k of KITS) sim.kits.set(k.id, k)
    sim.addChar('sparxie', 'Sparxie', { spd: 107, atk: 2200 })
    sim.addAha()
    sim.addEnemy({ name: 'Practice Dummy', hp: 50_000, spd: 60, level: 95, toughness: 0, weaknesses: ['Fire'], atk: 800 })
    sim.loop()
    const ahaSpd = sim.aha ? Math.round(eff(sim.aha).spd * 100) / 100 : NaN
    eq('Aha SPD = 80 + 0.2×107', ahaSpd, 101.4, 1e-6)
  }

  // AV math
  {
    const sim = new Simulator({ cycles: 1, seed: 1 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const u = sim.addChar('seele', 'Seele')
    eq('AV = 10000/SPD (spd115)', sim.baseAv(u), 10000 / 115, 1e-6)
    u.av = sim.baseAv(u)
    sim.advance(u, 0.5)
    eq('advance 50% halves AV', u.av, (10000 / 115) * 0.5, 1e-6)
  }

  // Speed-change prorating: AV' = AV·spd_old/spd_new
  {
    const sim = new Simulator({ cycles: 1, seed: 1 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const u = sim.addChar('jingyuan', 'JY')
    u.av = 50
    sim.setSpeedDynamic(u, 120)
    eq('speed prorate AV*old/new', u.av, 50 * 99 / 120, 1e-6)
  }

  // A permanent spd buff must cancel out of the prorate: callers pass a new BASE spd, so
  // dividing eff(u).spd by the bare base inflated av by (base+buff)/base on every call
  // (Aglaea's Garmentmaker queued +3.7..5.5x av per Aglaea turn and stopped acting).
  {
    const sim = new Simulator({ cycles: 1, seed: 1 })
    for (const k of KITS) sim.kits.set(k.id, k)
    const u = sim.addChar('aglaea', 'A')
    sim.addBuff(u, { id: 'b', name: 'b', mods: [{ stat: 'spdFlat', value: 60 }], turns: Infinity })
    const before = eff(u).spd
    u.av = 40
    sim.setSpeedDynamic(u, u.base.spd + 15)
    eq('speed prorate keeps a permanent spd buff neutral', u.av, 40 * before / (before + 15), 1e-6)
  }

  // Gear aggregation: cone flat stats + cond gate + relic sets
  {
    const agg = aggregateGear({ coneId: 'in_the_night', si: 1, relicSets: ['musketeer', 'musketeer'], planarId: 'sss' },
      { level: 80, hp: 931, atk: 2500, def: 363, spd: 140, critRate: 0.7, critDmg: 1.8 })
    eq('cone flat ATK', agg.baseAdd.atk, 582)
    // ITN critRate+18% (S1) unconditional; musketeer 4pc spd+6%
    eq('ITN critRate mod', agg.mods.filter(m => m.stat === 'critRate').reduce((a, m) => a + m.value, 0), 0.18)
    eq('total spdPct mods', agg.mods.filter(m => m.stat === 'spdPct').reduce((a, m) => a + m.value, 0), 0.06)
    // SPD 140 >= 120 -> In the Night + Space Sealing Station conditions both fire
    eq('ITN cond mods count', agg.mods.filter(m => m.stat === 'boost:skill').length, 1)
    // musketeer 2pc atk+12% + SSS base atk+12% + SSS cond atk+12%
    eq('SSS cond atk total', agg.mods.filter(m => m.stat === 'atkPct').reduce((a, m) => a + m.value, 0), 0.12 * 3)
    // below gate: no condition mods
    const agg2 = aggregateGear({ coneId: 'in_the_night', planarId: 'sss' },
      { level: 80, hp: 931, atk: 2500, def: 363, spd: 100, critRate: 0.7, critDmg: 1.8 })
    if (agg2.mods.some(m => m.stat === 'boost:basic')) { failed++; lines.push('FAIL ITN cond fired below SPD gate') }
    else lines.push('ok   ITN cond suppressed at SPD<120')
    if (agg2.mods.filter(m => m.stat === 'atkPct' && m.value === 0.12).length > 1) { failed++; lines.push('FAIL SSS cond fired below SPD gate') }
    else lines.push('ok   SSS cond suppressed at SPD<120')
  }

  // Gear pieces mode: per-slot mains/subs + set counting by real pieces
  {
    const mk = (slot: RelicPiece['slot'], setId: string, main: string, subs: RelicPiece['subs'] = []): RelicPiece =>
      ({ setId, slot, main, subs })
    const agg = aggregateGear({
      pieces: [
        mk('head', 'musketeer', 'hpFlat', [{ stat: 'critDmg', tier: 2, rolls: 3 }]),
        mk('hands', 'musketeer', 'atkFlat'),
        mk('body', 'musketeer', 'critRate'),
        mk('feet', 'musketeer', 'spd'),
        mk('sphere', 'sss', 'dmg:Quantum'),
        mk('rope', 'sss', 'be'),
      ],
    }, { level: 80, hp: 931, atk: 2500, def: 363, spd: 140, critRate: 0.7, critDmg: 1.8 })
    // musketeer ×4 -> twoPc atk+12% and fourPc spd+6%; sss sphere+rope -> base atk+12%
    eq('pieces musk 4pc spd', agg.mods.filter(m => m.stat === 'spdPct').reduce((a, m) => a + m.value, 0), 0.06)
    // musketeer twoPc atk+12% + SSS base atk+12% + SSS cond atk+12% (spd140>=120)
    eq('pieces atk total', agg.mods.filter(m => m.stat === 'atkPct').reduce((a, m) => a + m.value, 0), 0.12 * 3)
    // critDmg sub: tier2 (6.48%) ×3 rolls = 19.44%
    eq('pieces sub critDmg', agg.mods.filter(m => m.stat === 'critDmg').reduce((a, m) => a + m.value, 0), 0.0648 * 3)
    // flat mains are flat buffs (added after % multipliers)
    eq('pieces head hpFlat', agg.mods.filter(m => m.stat === 'hpFlat').reduce((a, m) => a + m.value, 0), 705.6)
    eq('pieces hands atkFlat', agg.mods.filter(m => m.stat === 'atkFlat').reduce((a, m) => a + m.value, 0), 352.8)
  }

  // EHR debuff roll: baseChance×(1+EHR)×(1-res), deterministic rng
  {
    const sim = new Simulator({ cycles: 1, seed: 1 })
    const src = mkUnit({ name: 'src' })
    src.base.ehr = 1.0
    const tgt = mkUnit({ side: 'enemy', effectRes: 0.2 })
    let applied = 0
    for (let i = 0; i < 100; i++) sim.applyDebuff(src, tgt, 1.0, () => { applied++ }, 'test')
    // chance = 1.0 × (1+1.0) × (1-0.2) = 1.6 → capped at 1 → always applies
    if (applied !== 100) { failed++; lines.push(`FAIL EHR cap: ${applied}/100 applied`) }
    else lines.push('ok   EHR chance capped at 100%')

    const tgt2 = mkUnit({ side: 'enemy', effectRes: 0.75 })
    let applied2 = 0
    for (let i = 0; i < 2000; i++) sim.applyDebuff(src, tgt2, 1.0, () => { applied2++ }, 'test')
    // chance = 2 × 0.25 = 0.5 → ~50%
    lines.push(`ok   EHR vs res sampling ≈${Math.round((applied2 / 2000) * 100)}% (want ~50%)`)
    if (Math.abs(applied2 / 2000 - 0.5) > 0.06) { failed++; lines.push(`FAIL EHR sampling off: ${applied2}/2000`) }
  }

  // Effect RES is the STATIC field resolved with `effRes` buff mods, so a debuff that lowers a
  // target's Effect RES (Dreamjolt Troupe's Spring Loader "Effect RES −20%") actually raises the
  // landing chance of later debuffs — the deviation that motivated `effectResOf` (StatResolver).
  {
    const sim = new Simulator({ cycles: 1, seed: 3 })
    const src = mkUnit({ name: 'src' })  // ehr = 0
    const tgt = mkUnit({ side: 'enemy', effectRes: 0.2 })
    eq('effectResOf: static base', effectResOf(tgt), 0.2)
    sim.addBuff(tgt, { id: 'shred', name: 'Effect RES↓', mods: [{ stat: 'effRes', value: -0.2 }], turns: 2, debuff: true })
    eq('effectResOf: lowered by effRes debuff', effectResOf(tgt), 0)
    sim.addBuff(tgt, { id: 'shred2', name: 'Effect RES↓', mods: [{ stat: 'effRes', value: -0.8 }], turns: 2, debuff: true })
    eq('effectResOf: stacks across mods', effectResOf(tgt), -0.8)
    let applied = 0
    for (let i = 0; i < 100; i++) sim.applyDebuff(src, tgt, 1.0, () => { applied++ }, 'test')
    // chance = 1 × (1+0) × (1 − (−0.8)) = 1.8 → capped at 1 → always lands
    if (applied !== 100) { failed++; lines.push(`FAIL effRes shred: ${applied}/100 applied`) }
    else lines.push('ok   lowered Effect RES raises debuff landing (capped 100%)')

    const buffed = mkUnit({ side: 'enemy', effectRes: 0 })
    sim.addBuff(buffed, { id: 'ward', name: 'Effect RES↑', mods: [{ stat: 'effRes', value: 0.5 }], turns: 2 })
    eq('effectResOf: raised by effRes buff', effectResOf(buffed), 0.5)
  }

  // §6 `onApply`: the kit hook fires once per application outcome (fresh / stacked / refreshed),
  // 1:1 with the BUFF_/DEBUFF_* emit, and reads the STORED record (post-application stacks/turns)
  // with the effect already installed. Broadcasting skips non-listener units: `foe` wears the same
  // kitId, so 6 records - not 12 - is what proves the living-ally-char filter.
  {
    // debug 3 = MIN_DEBUG for BUFF_/DEBUFF_* (battlelog.ts); the emit/hook pairing below is
    // asserted against the real log, not against the hook's own bookkeeping.
    const sim = new Simulator({ cycles: 1, seed: 1, log: { debug: 3 } })
    const seen: { id: string; stacks: number | undefined; live: number | undefined; debuff: boolean; src: string | undefined }[] = []
    const onBuffApplied: NonNullable<KitDef['onBuffApplied']> = (_s, u, b, _c, src) => {
      seen.push({ id: b.id, stacks: b.stacks, live: u.buffs.find(x => x.id === b.id)?.stacks, debuff: b.debuff === true, src: src?.id })
    }
    sim.kits.set('probe6', { id: 'probe6', onBuffApplied } as unknown as KitDef)
    const listener = mkUnit({ id: 'L', name: 'L', kitId: 'probe6' })
    const foe = mkUnit({ id: 'F', name: 'F', side: 'enemy', kitId: 'probe6' })
    const src = mkUnit({ id: 'S', name: 'S' })
    const tgt = mkUnit({ id: 'G', name: 'G' })
    sim.roster.push(listener, foe, src, tgt)

    const stackable = { id: 'p6_stack', name: 'Stacked', mods: [], turns: 1, maxStacks: 3, sourceId: 'S' }
    sim.addBuff(tgt, stackable)                    // APPLIED
    sim.addBuff(tgt, { ...stackable })              // STACKED
    sim.addBuff(tgt, { ...stackable })              // STACKED, hits the cap
    sim.addBuff(tgt, { id: 'p6_ref', name: 'Refresh', mods: [], turns: 2, sourceId: 'S' })
    sim.addBuff(tgt, { id: 'p6_ref', name: 'Refresh', mods: [], turns: 4, sourceId: 'S' })  // REFRESHED
    sim.addBuff(tgt, { id: 'p6_deb', name: 'Debuff', mods: [], turns: 1, debuff: true, sourceId: 'S' })

    const emits = sim.logger.events.filter(e => /^(BUFF|DEBUFF)_(APPLIED|STACKED|REFRESHED)$/.test(e.type)).length
    eq('§6 onApply fires once per application', seen.length, 6)
    eq('§6 emit and onApply stay paired', emits, seen.length)
    // fresh application stores no `stacks` field (the emit payload defaults it to 1), then 2, 3.
    // The incoming spec never carries `stacks` at all, so only the STORED record yields 2 and 3.
    const stackRecs = seen.filter(r => r.id === 'p6_stack')
    eq('§6 onApply sees post-application stacks (2nd, 3rd apply)', (stackRecs[1]?.stacks ?? 0) * 10 + (stackRecs[2]?.stacks ?? 0), 23)
    eq('§6 onApply runs with the effect already installed', seen.filter(r => r.live !== r.stacks).length, 0)
    eq('§6 onApply resolves the applier from sourceId', new Set(seen.map(r => r.src)).size, 1)
    eq('§6 sourceId resolves to the applier', seen[0].src === 'S' ? 1 : 0, 1)
    eq('§6 debuff arrives on the same hook via b.debuff', seen.filter(r => r.debuff).length, 1)
  }

  // Sparkle maxSp talent + Pela kit presence
  {
    const setup: BattleSetup = {
      team: [
        { kitId: 'sparkle' }, { kitId: 'pela' }, { kitId: 'guinaifen' },
        { kitId: 'seele', gear: { coneId: 'in_the_night', si: 1 } },
      ],
      enemy: { ...ENEMY_PRESETS.moc12_boss, count: 1 },
      cycles: 5,
      seed: 11,
    }
    const start = prepareBattle(setup)
    start.initBattle()
    if (!(start.maxSp === 7)) { failed++; lines.push(`FAIL sparkle maxSp=${start.maxSp}`) }
    else lines.push('ok   sparkle Red Herring raises SP cap to 7')
    const sim = runBattle(setup)
    lines.push(`--- endgame smoke: ${sim.endReason}, ${(sim.accounts.get('Seele')?.total ?? 0)} Seele dmg`)
  }

  // Maze Techniques: attack-kind fires at battle start, buffs only arm, one attack max
  {
    const mk = (techniques: string[]): BattleSetup => ({
      team: [
        { kitId: 'aglaea' }, { kitId: 'pela' }, { kitId: 'sunday' }, { kitId: 'gallagher' },
      ],
      enemy: { ...ENEMY_PRESETS.moc12_boss, count: 1 },
      cycles: 3, seed: 5, techniques,
    })
    const s = prepareBattle(mk(['aglaea', 'sunday']))
    s.initBattle()
    const ag = s.roster.find(x => x.kitId === 'aglaea')!
    const su = s.roster.find(x => x.kitId === 'sunday')!
    if (!s.find(`gm_${ag.id}`)) { failed++; lines.push('FAIL technique(attack): Garmentmaker not summoned') }
    else lines.push('ok   technique(attack) applies at battle start (Garmentmaker summoned)')
    if (!(ag.energy === 205)) { failed++; lines.push(`FAIL technique: Aglaea energy=${ag.energy} want 205`) }
    else lines.push('ok   technique +30 Energy on top of the start-energy trace (205)')
    if (!(s.rt(su).sundayTech === true)) { failed++; lines.push('FAIL technique(buff): not armed') }
    else lines.push('ok   technique(buff) arms instead of acting')
    // one combat-starting (attack) Technique per battle: Pela's is dropped behind Aglaea's
    const s2 = prepareBattle(mk(['aglaea', 'pela']))
    s2.initBattle()
    if (s2.roster.some(e => e.side === 'enemy' && e.buffs.some(b => b.id === 'pela_tech')))
      { failed++; lines.push('FAIL technique: second attack technique applied') }
    else lines.push('ok   only the first attack-type Technique applies')
  }

  // Smoke battle: full team vs boss preset
  try {
    const sim = runBattle({
      team: [
        { kitId: 'seele' },
        { kitId: 'jingyuan' },
        { kitId: 'firefly', stats: { be: 3.0 } },
        { kitId: 'bronya' },
      ],
      enemy: { ...ENEMY_PRESETS.boss, count: 1, weaknesses: ['Fire', 'Quantum'] },
      cycles: 4,
      seed: 7,
    })
    lines.push(`--- smoke battle: ${sim.endReason}, ${sim.logLines.length} log lines`)
    let total = 0
    for (const [name, acc] of sim.accounts) {
      total += acc.total
      if (!name.startsWith('ENEMY')) lines.push(`  ${name}: ${acc.total}`)
    }
    if (!(total > 0)) { failed++; lines.push('FAIL smoke battle: zero damage dealt') }
    if (!sim.endReason) { failed++; lines.push('FAIL smoke battle: no end reason') }
  } catch (e) {
    failed++
    lines.push(`FAIL smoke battle threw: ${e instanceof Error ? e.stack : String(e)}`)
  }

  // New-kit battle smoke: March 7th, Dan Heng, Himeko, Welt, Kafka vs all-weak boss — each must deal damage
  try {
    const sim = runBattle({
      team: [
        { kitId: 'kafka', stats: { hp: 4000, atk: 2200, def: 1100, spd: 130 }, skillPriority: 2 },
        { kitId: 'welt', stats: { hp: 4200, atk: 2200, def: 1150, spd: 128 }, skillPriority: 2 },
        { kitId: 'danheng', stats: { hp: 4000, atk: 2200, def: 1100, spd: 130 }, skillPriority: 2 },
        { kitId: 'march7th', stats: { hp: 4600, atk: 1200, def: 1500, spd: 118 } },
        { kitId: 'himeko', stats: { hp: 4000, atk: 2200, def: 1100, spd: 130 }, skillPriority: 2 },
      ],
      enemy: {
        ...ENEMY_PRESETS.moc12_boss, count: 1, hp: 300_000, toughness: 60,
        weaknesses: ['Fire', 'Ice', 'Wind', 'Lightning', 'Imaginary'] as Elem[],
      },
      cycles: 12,
      seed: 3,
    })
    lines.push(`--- new-kits smoke: ${sim.endReason}, ${Math.round(sim.avElapsed)} AV`)
    const want = ['Kafka', 'Dan Heng', 'Himeko', 'Welt', 'March 7th']
    for (const name of want) {
      const amt = sim.accounts.get(name)?.total ?? 0
      lines.push(`  ${name}: ${Math.round(amt)}`)
      if (!(amt > 0)) { failed++; lines.push(`FAIL new-kit smoke: ${name} dealt no damage`) }
    }
  } catch (e) {
    failed++
    lines.push(`FAIL new-kit smoke threw: ${e instanceof Error ? e.stack : String(e)}`)
  }

  // Manual mode: Eagle advance-forward applies ONLY on out-of-turn ults
  {
    const mkSetup = () => ({
      team: [{ kitId: 'seele', energyStartFrac: 1, stats: { spd: 160 }, gear: { relicSets: ['eagle', 'eagle'] } }],
      enemy: { ...ENEMY_PRESETS.mob, count: 1 },
      cycles: 1,
      seed: 3,
    })
    const io: BattleIO = {
      async pickUlts(ready) { return ready },
      async planTurn(u) {
        return u.energy >= u.maxEnergy ? [{ kind: 'ult' }, { kind: 'skill' }] : [{ kind: 'basic' }]
      },
    }
    const manual = await runBattleManual(mkSetup(), io)
    eq('eagle advances on out-of-turn ult (manual)',
      manual.logLines.some(l => l.includes('Eagle of Twilight Line advances')) ? 1 : 0, 1)
    const auto = runBattle(mkSetup())
    eq('no eagle advance on in-turn ult (auto)',
      auto.logLines.filter(l => l.includes('Eagle of Twilight Line advances')).length, 0)
  }

  // Manual mode: Bronya skill defers the ally's immediate turn to the next timeline slot
  {
    const sim = await runBattleManual(
      {
        team: [
          { kitId: 'bronya', stats: { spd: 200 } },
          { kitId: 'seele', stats: { spd: 100 } },
        ],
        enemy: { ...ENEMY_PRESETS.mob, count: 1 },
        cycles: 1,
        seed: 5,
      },
      {
        async pickUlts() { return [] },
        async planTurn() { return [{ kind: 'skill' }, { kind: 'basic' }] },
      },
    )
    eq('manual bronya skill grants seele a deferred immediate turn',
      sim.logLines.some(l => l.includes('Seele') && l.includes('will act immediately')) ? 1 : 0, 1)
  }

  // charTurn one-action convention (canon 30-09-2026): a turn is ONE action. The Ultimate
  // REPLACES the Basic/Skill; energy filled mid-action does not buy a second action (the Ult
  // fires at the start of the NEXT turn); a granted Extra Turn still acts normally at full
  // energy. Regression gate for the global 93-kit rebase.
  {
    const mkTurn = () => {
      const sim = new Simulator({ cycles: 1, seed: 3 })
      for (const k of KITS) sim.kits.set(k.id, k)
      sim.addEnemy({ name: 'Dummy', hp: 999_999, spd: 60, level: 95, toughness: 0, weaknesses: ['Quantum'], atk: 800 })
      return sim
    }
    const turn = (sim: Simulator, u: Unit) => {
      const before = sim.logLines.length
      ;(sim as any).charTurn(u)
      const added = sim.logLines.slice(before)
      const headers = added.filter(l => />>>.*\[(ULT|SKILL|BASIC)\]/.test(l))
      return { headers, isUlt: headers.some(l => /\[ULT\]/.test(l)) }
    }
    {
      const sim = mkTurn()
      const u = sim.addChar('seele', 'Seele', { atk: 2000 })
      u.energy = u.maxEnergy
      const t = turn(sim, u)
      eq('one-action: full energy → exactly one header', t.headers.length, 1)
      eq('one-action: full energy → that header is ULT (Basic/Skill replaced)', t.isUlt ? 1 : 0, 1)
    }
    {
      const sim = mkTurn()
      const u = sim.addChar('seele', 'Seele', { atk: 2000 })
      u.energy = u.maxEnergy - 1
      const t = turn(sim, u)
      eq('one-action: mid-action fill → exactly one header', t.headers.length, 1)
      eq('one-action: mid-action fill → not ULT (deferred to next turn)', t.isUlt ? 1 : 0, 0)
      eq('one-action: mid-action fill → energy full, ready next turn', u.energy >= u.maxEnergy ? 1 : 0, 1)
    }
    {
      const sim = mkTurn()
      const u = sim.addChar('seele', 'Seele', { atk: 2000 })
      u.energy = u.maxEnergy
      sim.rt(u).inExtraTurn = true
      const t = turn(sim, u)
      eq('one-action: extra turn at full energy → exactly one header', t.headers.length, 1)
      eq('one-action: extra turn acts (not swallowed by auto-Ult)', t.isUlt ? 1 : 0, 0)
    }
  }

  // --- Preset validation ---
  {
    const { PRESETS, presetTeams } = await import('./presets')
    const { RELIC_SETS, PLANAR_SETS, LIGHT_CONES } = await import('./gear')
    const relicIds = new Set(RELIC_SETS.map(s => s.id))
    const planarIds = new Set(PLANAR_SETS.map(s => s.id))
    const lcIds = new Set(LIGHT_CONES.map(c => c.id))
    const kitIds = new Set(KITS.map(k => k.id))
    const presetKeys = Object.keys(PRESETS)

    // report kits without presets (not a failure — some kits lack hsr-data)
    const missing = KITS.map(k => k.id).filter(id => !PRESETS[id])
    if (missing.length) lines.push(`ok   presets missing for ${missing.length} kits: ${missing.join(', ')}`)
    else lines.push('ok   all kits have presets')

    // all relic/planar/lc/teammate refs must resolve to gear.ts keys
    let badRef = 0
    for (const [id, p] of Object.entries(PRESETS)) {
      for (const r of p.relic4) if (!relicIds.has(r)) { badRef++; lines.push(`FAIL preset ${id}: bad relic ${r}`) }
      for (const r of p.planar) if (!planarIds.has(r)) { badRef++; lines.push(`FAIL preset ${id}: bad planar ${r}`) }
      for (const r of p.lc) if (!lcIds.has(r)) { badRef++; lines.push(`FAIL preset ${id}: bad lc ${r}`) }
      for (const team of presetTeams(id)) for (const m of team) if (!kitIds.has(m)) { badRef++; lines.push(`FAIL preset ${id}: bad teammate ${m}`) }
    }
    eq('preset refs valid', badRef, 0)

    // smoke: presetTeam() → runBattle for every preset (first team)
    // enemy: all-element-weak, 400k HP — prevents kit crashes from mismatched weaknesses
    const allElem: Elem[] = ['Physical','Fire','Ice','Lightning','Wind','Quantum','Imaginary']
    const smokeEnemy = { name: 'Preset Test', count: 1, hp: 400_000, spd: 145, level: 85, toughness: 90, weaknesses: allElem }
    let presetFailed = 0, presetZero = 0
    const { presetTeam } = await import('./battle')
    for (const id of presetKeys) {
      const team = presetTeam(id)
      if (team.length === 0) { presetFailed++; lines.push(`FAIL preset ${id}: empty team`); continue }
      try {
        const sim = runBattle({ team, enemy: smokeEnemy, cycles: 5, seed: 3 })
        let total = 0
        for (const [, acct] of sim.accounts) total += acct.total
        if (total <= 0) { presetZero++; lines.push(`FAIL preset ${id}: zero dmg`) }
      } catch (e) {
        presetFailed++
        lines.push(`FAIL preset ${id}: ${(e as Error).message}`)
      }
    }
    eq('preset battles ok', presetFailed, 0)
    eq('preset battles dmg>0', presetZero, 0)
    lines.push(`ok   ${presetKeys.length} presets smoke-tested (${presetKeys.length - missing.length} kits)`)
  }

  // --- Calculator module checks ---
  {
    const { rawDefMult } = await import('./combat/StatResolver')
    const { hitBreakdown, statGrid, critOptimal, minSpdFor, actionsIn, advanceAsSpeed, vulnEquivDefShred, superBreakHit } = await import('./calcs')

    eq('rawDefMult lvl80 vs lvl95',
      rawDefMult(80, 95),
      (800 + 200) / (1150 + 800 + 200))

    eq('rawDefMult with 50% shred',
      rawDefMult(80, 95, 0.5),
      (800 + 200) / (1150 * 0.5 + 800 + 200))

    const p = { atk: 1000, atkPct: 0, attLevel: 80, critRate: 0.5, critDmg: 1.0, dmgPct: 0, be: 0, spd: 120 }
    const e = { level: 95, res: 0, vuln: 0, defShred: 0, broken: true }
    const b = hitBreakdown(p, e, 1)
    eq('hitBreakdown noCrit',
      b.noCrit,
      1000 * 1 * rawDefMult(80, 95, 1) * 1 * 1 * 1)
    eq('hitBreakdown expected',
      b.expected,
      b.noCrit * (1 + 0.5 * 1.0))

    eq('statGrid baseline ratio = 1',
      statGrid(p, e, 'atkPct', 'dmgPct', 10, 0.1)[0][0],
      1.0)

    const co = critOptimal(0.05, 1.0, 10)
    eq('critOptimal D2/E2 crRolls (capped at rolls)',
      co.crRolls,
      10) // formula unclamped ≈ 11.94, capped to 10

    eq('minSpdFor 2 actions MoC',
      minSpdFor(2, 150),
      134)

    eq('actionsIn spd134 MoC4c',
      actionsIn(134, 600),
      8) // 600*134/10000 = 8.04 → 8

    eq('advanceAsSpeed 50%',
      advanceAsSpeed(0.5),
      2)

    eq('vulnEquivDefShred 10% (att80 def95)',
      vulnEquivDefShred(0.1, 80, 95),
      0.1700, 0.001) // a=1000, d=1150

    eq('vulnEquivDefShred 50% (att80 def95)',
      vulnEquivDefShred(0.5, 80, 95),
      0.6232, 0.001)

    const sb = superBreakHit(p, e, 10, 1)
    eq('superBreakHit tough10',
      sb,
      Math.floor(1 * 3767.5533 * 1 * 1 * rawDefMult(80, 95, 1) * 1 * 1))
  }

  // ---- wave/cycle subsystem (MoC rules) ----
  {
    const E = (hp: number) => ({ name: 'F', count: 1, hp, spd: 60, level: 80, toughness: 0, weaknesses: ['Quantum' as Elem], atk: 900 })
    const team: any = [{ kitId: 'sparxie', stats: { atk: 4200, critRate: 0.9, critDmg: 1.2, spd: 140 }, gear: { coneId: 'when_she_decided_to_see', si: 1 } }, { kitId: 'luocha', stats: { hp: 20000, atk: 1800, def: 800, spd: 150 } }]
    const sim = runBattle({ team, enemy: E(110000), enemyWaves: [[E(110000)], [E(150000)]], cycles: 40, seed: 1 })
    eq('multiwave win wave==2', sim.wave, 2)
    eq('multiwave waveCount==2', sim.waveCount, 2)
    eq('multiwave endReason win', sim.endReason === 'win' ? 1 : 0, 1)
    const wearer = sim.roster.find(u => u.kitId === 'sparxie')!
    const gf = wearer.buffs.find(b => b.id === 'great_fortune')
    // Great Fortune is a 3-turn (non-permanent) buff: the wave hook fired AND it was never applied as Infinity
    const waveFired = sim.logLines.some(l => /wave energy \+15/.test(l))
    eq('whenSheDecided wave hook fired', waveFired ? 1 : 0, 1)
    eq('greatFortune non-permanent', gf && gf.turns === Infinity ? 0 : 1, 1)
    const w2 = sim.logLines.filter(l => /WAVE 2/.test(l)).length
    eq('wave2 transition fired once', w2, 1)
  }

  // ---- game damage caps: vulnerability +250% (3.5x), RES reduction 90% / RES PEN -100% ----
  {
    const { resFactor, vulnMult, vulnFactor } = await import('./combat/StatResolver')
    const b = (stat: string, value: number): any => ({ id: stat, name: stat, turns: 1, mods: [{ stat, value }] })
    const t = (res: number, buffs: any[]): any => ({ res: { Physical: res }, buffs })

    eq('vuln 0% -> 1.0x', vulnMult(t(0, []), 'Physical', 'skill'), 1.0)
    eq('vuln +100% -> 2.0x', vulnMult(t(0, [b('vulnAll', 1.0)]), 'Physical', 'skill'), 2.0)
    eq('vuln +400% -> capped 3.5x', vulnMult(t(0, [b('vulnAll', 4.0)]), 'Physical', 'skill'), 3.5)
    eq('vuln stacked 2.0+2.0 -> capped 3.5x',
      vulnMult(t(0, [b('vulnAll', 2.0), b('vulnType:skill', 2.0)]), 'Physical', 'skill'), 3.5)
    eq('vuln negative -> floored 1.0x', vulnMult(t(0, [b('vulnAll', -0.5)]), 'Physical', 'skill'), 1.0)
    eq('vuln elation helper 2.5 -> 3.5', vulnFactor(2.5), 3.5)
    eq('vuln elation helper -1 -> 1.0', vulnFactor(-1), 1.0)

    eq('res 20% no pen -> 0.8', resFactor(t(0.2, []), [], 'Physical'), 0.8, 1e-9)
    eq('res 20% pen 40% -> 1.2', resFactor(t(0.2, []), [b('resPenAll', 0.4)], 'Physical'), 1.2, 1e-9)
    eq('res 95% -> capped 0.1', resFactor(t(0.95, []), [], 'Physical'), 0.1, 1e-9)
    eq('res 20% pen 200% -> capped 2.0', resFactor(t(0.2, []), [b('resPenAll', 2.0)], 'Physical'), 2.0, 1e-9)
  }

  // ---- memosprite CRIT is the Memomaster's, read LIVE (reference: entity 0) ----
  // Old code snapshotted `eff(owner)` into `base` at summon/refresh time, so owner CRIT buffs
  // gained after the summon never reached the memosprite and expired ones stuck forever;
  // Mem additionally double-counted its own buffs (no subtract-the-overlap).
  {
    const owner = mkUnit({ id: 'own', name: 'Own', kind: 'char',
      base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 } })
    const memo = mkUnit({ id: 'memo', name: 'Memo', kind: 'summon',
      base: { level: 80, hp: 500, atk: 800, def: 200, spd: 60 } })
    mirrorOwnerCrit(owner, memo)
    eq('memo critRate = owner critRate', eff(memo).critRate, 0.05, 1e-9)
    eq('memo critDmg = owner critDmg', eff(memo).critDmg, 0.5, 1e-9)
    // owner gains CRIT AFTER the summon -> memosprite must see it at once
    owner.buffs.push({ id: 'own_cr', name: 'Owner CR', turns: 2, mods: [{ stat: 'critRate', value: 0.3 }] })
    eq('memo follows owner CRIT buff gained after summon', eff(memo).critRate, 0.35, 1e-9)
    // ...and drops it when the owner's buff expires (no stale snapshot)
    owner.buffs = []
    eq('memo drops owner CRIT buff on expiry', eff(memo).critRate, 0.05, 1e-9)
    // memosprite's own buffs add on top exactly once
    memo.buffs.push({ id: 'memo_cd', name: 'Memo CD', turns: 2, mods: [{ stat: 'critDmg', value: 0.4 }] })
    eq('memo own CRIT DMG buff counted once', eff(memo).critDmg, 0.9, 1e-9)
    memo.buffs.push({ id: 'memo_cr', name: 'Memo CR', turns: 2, mods: [{ stat: 'critRate', value: 0.2 }] })
    eq('memo own CRIT Rate buff counted once', eff(memo).critRate, 0.25, 1e-9)
    // a true summon (sharesOwnerBuffs) has no critOwner link and keeps its own base
    const pet = mkUnit({ id: 'pet', name: 'Pet', kind: 'summon', sharesOwnerBuffs: true,
      base: { level: 80, hp: 500, atk: 800, def: 200, spd: 60, critRate: 0.05, critDmg: 0.5 } })
    eq('non-memosprite keeps own base crit', eff(pet).critRate, 0.05, 1e-9)
    // recursion stop: only a `kind: 'char'` owner is followed, so a summon-owned chain
    // resolves from its own base instead of recursing (and cannot cycle)
    pet.critOwner = memo
    eq('summon-owned critOwner is not followed', eff(pet).critRate, 0.05, 1e-9)
  }

  autoAiCheck()

  lines.unshift(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED')
  return { text: lines.join('\n'), failed }
}

const isNode = typeof process !== 'undefined' && !!process.stdout
/** self-execute only when this file IS the entry (`npm run check`); importing it must be inert */
const isEntry = isNode && !!process.argv[1] && /check\.ts$/.test(process.argv[1].replace(/\\/g, '/'))
if (isEntry) {
  runChecks().then(r => {
    console.log(r.text)
    if (r.failed) process.exit(1)
  })
}
