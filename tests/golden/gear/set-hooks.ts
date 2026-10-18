import { RELIC_SETS, PLANAR_SETS, aggregateGear } from '../../../src/core/gear'
import { t, type Case } from '../../suites'

/**
 * Relic/planar SET hook behaviour (guide §19.3): one dedicated case per declared hook, driven by
 * direct hook invocation against a recording SimApi. A set is listed in `SET_TESTS` only once every
 * hook it declares is exercised, which is what lifts it from `partial` to `verified` in
 * `gearCoverage`.
 *
 * Direct invocation (not a full battle) mirrors the cone-hooks precedent for state-gated hooks: it
 * isolates the set's own effect from the character kits that would otherwise have to ride along.
 */

type AnyFn = (...a: any[]) => any
const R = (id: string) => RELIC_SETS.find(s => s.id === id)!
const P = (id: string) => PLANAR_SETS.find(s => s.id === id)!
const hook = (s: unknown, name: string): AnyFn => (s as Record<string, AnyFn>)[name]

const BASE = { path: 'Destruction', hp: 1000, atk: 1000, def: 1000, spd: 100, critRate: 0.05, critDmg: 0.5 }
const unit = (over: Record<string, any> = {}): any => ({
  id: 'a1', name: 'W', side: 'ally', kind: 'char', dead: false, elem: 'Fire',
  hp: 1000, maxHp: 1000, buffs: [], dots: [], weaknesses: [], base: { ...BASE }, ...over,
})

function rec(opts: { allies?: any[]; units?: any[]; enemies?: any[]; lastAbilityTarget?: any; extra?: Record<string, any> } = {}) {
  const allies = opts.allies ?? []
  const units = opts.units ?? allies
  const enemies = opts.enemies ?? []
  const applied: any[] = []
  const removed: string[] = []
  const sp: number[] = []
  const energy: number[] = []
  const heals: any[] = []
  const logs: string[] = []
  const advances: any[] = []
  const ctx = new Map<object, Record<string, any>>()
  const rt = (u: object) => { let c = ctx.get(u); if (!c) { c = {}; ctx.set(u, c) } return c }
  const sim: any = {
    rt,
    allies: (_s?: string) => allies,
    units: () => units,
    livingEnemiesOf: (_u?: any) => enemies,
    addBuff: (u: any, b: any) => { applied.push({ u, b }) },
    removeBuff: (_u: any, id: string) => { removed.push(id) },
    gainSp: (n: number) => { sp.push(n) },
    gainEnergyFlat: (_u: any, n: number) => { energy.push(n) },
    heal: (u: any, n: number) => { heals.push({ u, n }) },
    log: (s: string) => { logs.push(s) },
    advance: (u: any, pct: number) => { advances.push({ u, pct }) },
    hasBuff: (u: any, id: string) => (u.buffs ?? []).some((b: any) => b.id === id),
    battleTurn: 1,
    lastAbilityTarget: opts.lastAbilityTarget,
    ...(opts.extra ?? {}),
  }
  const buffs = (id: string) => applied.filter(a => a.b.id === id).map(a => a.b)
  return { sim, rt, applied, removed, sp, energy, heals, logs, advances, buffs, first: (id: string) => buffs(id)[0] }
}

const mod = (b: any, stat: string): number | undefined => b?.mods?.find((m: any) => m.stat === stat)?.value
const near = (a: number | undefined, b: number) => a !== undefined && Math.abs(a - b) < 1e-9
const debuff = (stat = 'spdDown'): any => ({ id: 'd', mods: [{ stat, value: -0.1 }] })
/** a unit whose base path is Remembrance + an owned memosprite on the field */
const memoField = (extraAllies: any[] = []) => {
  const u = unit({ base: { ...BASE, path: 'Remembrance' } })
  const gm = unit({ id: 's1', kind: 'summon' })
  const r = rec({ units: [u, gm, ...extraAllies], allies: [u, ...extraAllies] })
  r.rt(gm).ownerId = u.id
  return { u, gm, r }
}

export default (): Case[] => {
  const c: Case[] = []

  // ================================================================ RELIC SETS

  { // passerby
    const r = rec()
    hook(R('passerby'), 'onStart')(r.sim, unit())
    c.push(t.ok('passerby onStart: grants +1 Skill Point at battle start', r.sp.length === 1 && r.sp[0] === 1, `sp=${r.sp.join(',')}`))
  }

  { // knight — numeric 4pc shield amplification wired through aggregateGear
    const g = aggregateGear({ relicSets: ['knight', 'knight'] }, { hp: 1000, atk: 1000, def: 1000, spd: 100, level: 80 })
    c.push(t.ok('knight: 4pc shield absorption +20% reaches the aggregate', near(g.shieldMult, 0.20), `shieldMult=${g.shieldMult}`))
  }

  { // hunter_glacial
    const r = rec()
    hook(R('hunter_glacial'), 'onAfterUlt')(r.sim, unit())
    const b = r.first('glacial')
    c.push(t.ok('hunter_glacial onAfterUlt: +25% CRIT DMG for 2 turns', near(mod(b, 'critDmg'), 0.25) && b.turns === 2, `cd=${mod(b, 'critDmg')} t=${b.turns}`))
  }

  { // boxing
    const u = unit(); const r = rec()
    hook(R('boxing'), 'onAfterAttack')(r.sim, u, null, 'basic')
    hook(R('boxing'), 'onAfterAttack')(r.sim, u, null, 'basic')
    const last = r.buffs('boxing').pop()
    const r2 = rec(); hook(R('boxing'), 'onAfterAttack')(r2.sim, u, null, 'skill')
    c.push(t.ok('boxing onAfterAttack: +5% ATK per Basic (2nd stack → 0.10), ignored on Skill', near(mod(last, 'atkPct'), 0.10) && r2.buffs('boxing').length === 0, `2nd=${mod(last, 'atkPct')} skill=${r2.buffs('boxing').length}`))
  }

  { // guard
    const low = unit({ hp: 400, maxHp: 1000 }); const hi = unit({ hp: 800, maxHp: 1000 })
    const r = rec(); hook(R('guard'), 'onTurnStart')(r.sim, low)
    const r2 = rec(); hook(R('guard'), 'onTurnStart')(r2.sim, hi)
    c.push(t.ok('guard onTurnStart: below 50% HP heals 8% MaxHP + 5 energy, else nothing',
      r.heals.length === 1 && r.heals[0].n === 80 && r.energy[0] === 5 && r2.heals.length === 0,
      `heal=${r.heals[0]?.n} e=${r.energy.join(',')} hi=${r2.heals.length}`))
  }

  { // firesmith — buff on ult, consumed on the next attack
    const u = unit(); const r = rec()
    hook(R('firesmith'), 'onAfterUlt')(r.sim, u)
    const b = r.first('firesmith')
    u.buffs = [{ id: 'firesmith', mods: [], turns: Infinity }]
    hook(R('firesmith'), 'onAfterAttack')(r.sim, u)
    c.push(t.ok('firesmith onAfterUlt sets +12% Fire DMG, onAfterAttack consumes it', near(mod(b, 'dmg:Fire'), 0.12) && r.removed.includes('firesmith'), `fire=${mod(b, 'dmg:Fire')} removed=${r.removed.join(',')}`))
  }

  { // genius
    const q = unit({ id: 'e1', weaknesses: ['Quantum'] }); const n = unit({ id: 'e2', weaknesses: [] })
    const r = rec({ enemies: [q, n] })
    hook(R('genius'), 'onStart')(r.sim, unit())
    const bq = r.applied.find(a => a.u === q)?.b; const bn = r.applied.find(a => a.u === n)?.b
    c.push(t.ok('genius onStart: 20% DEF-ignore vs Quantum-weak, 10% otherwise', near(mod(bq, 'defIgnore'), 0.20) && near(mod(bn, 'defIgnore'), 0.10), `q=${mod(bq, 'defIgnore')} n=${mod(bn, 'defIgnore')}`))
  }

  { // sizzling
    const r = rec(); hook(R('sizzling'), 'onAfterSkill')(r.sim, unit(), null)
    c.push(t.ok('sizzling onAfterSkill: +20% ATK buff', near(mod(r.first('sizzling'), 'atkPct'), 0.20), `atk=${mod(r.first('sizzling'), 'atkPct')}`))
  }

  { // eagle
    const r = rec(); hook(R('eagle'), 'onAfterUlt')(r.sim, unit(), true)
    const r2 = rec(); hook(R('eagle'), 'onAfterUlt')(r2.sim, unit(), false)
    c.push(t.ok('eagle onAfterUlt: advances 25% only when the ult is cast out-of-turn', r.advances.length === 1 && r.advances[0].pct === 0.25 && r2.advances.length === 0, `out=${r.advances.length} own=${r2.advances.length}`))
  }

  { // thief
    const r = rec(); hook(R('thief'), 'onAfterBreak')(r.sim, unit(), unit({ id: 'e1' }))
    c.push(t.ok('thief onAfterBreak: +3 flat energy on break', r.energy.length === 1 && r.energy[0] === 3, `e=${r.energy.join(',')}`))
  }

  { // wastelander
    const hm = hook(R('wastelander'), 'hitMods')
    const deb = unit({ buffs: [debuff()] })
    const clean = unit()
    const imp = unit({ buffs: [{ id: 'welt_imprison', mods: [{ stat: 'spdDown', value: -0.1 }] }] })
    const m1 = hm(rec().sim, unit(), deb); const m2 = hm(rec().sim, unit(), clean); const m3 = hm(rec().sim, unit(), imp)
    c.push(t.ok('wastelander hitMods: +10% CRIT Rate vs debuffed, +20% CRIT DMG vs Imprisoned',
      near(m1[0]?.value, 0.10) && m2.length === 0 && near(m3.find((x: any) => x.stat === 'critDmg')?.value, 0.20),
      `deb=${m1.length} clean=${m2.length} imp=${m3.length}`))
  }

  { // longevous
    const r = rec(); hook(R('longevous'), 'onHitTaken')(r.sim, unit())
    const b = r.first('longevous')
    c.push(t.ok('longevous onHitTaken: +8% CRIT Rate (2 turns, cap 2)', near(mod(b, 'critRate'), 0.08) && b.turns === 2 && b.maxStacks === 2, `cr=${mod(b, 'critRate')} max=${b.maxStacks}`))
  }

  { // messenger
    const ally = unit({ id: 'a2' })
    const r = rec({ allies: [ally], lastAbilityTarget: ally }); hook(R('messenger'), 'onAfterUlt')(r.sim, unit())
    const r2 = rec({ allies: [ally], lastAbilityTarget: undefined }); hook(R('messenger'), 'onAfterUlt')(r2.sim, unit())
    c.push(t.ok('messenger onAfterUlt: +12% party SPD when the ult targets an ally, skipped when it targets nothing', near(mod(r.first('hackerspace'), 'spdPct'), 0.12) && r2.buffs('hackerspace').length === 0, `ally=${r.buffs('hackerspace').length} none=${r2.buffs('hackerspace').length}`))
  }

  { // grand_duke
    const u = unit(); const r = rec()
    hook(R('grand_duke'), 'onAfterAttack')(r.sim, u, null, 'fua')
    const r2 = rec(); hook(R('grand_duke'), 'onAfterAttack')(r2.sim, u, null, 'skill')
    c.push(t.ok('grand_duke onAfterAttack: +6% ATK per FUA hit, ignored on non-FUA', near(mod(r.first('duke_fire'), 'atkPct'), 0.06) && r2.buffs('duke_fire').length === 0, `fua=${mod(r.first('duke_fire'), 'atkPct')} skill=${r2.buffs('duke_fire').length}`))
  }

  { // prisoner
    const hm = hook(R('prisoner'), 'hitMods')
    const m = hm(rec().sim, unit(), unit({ dots: [{}, {}] }))
    const m0 = hm(rec().sim, unit(), unit())
    c.push(t.ok('prisoner hitMods: 6% DEF-ignore per target DoT (2 → 0.12), none without DoTs', near(m[0]?.value, 0.12) && m0.length === 0, `dots2=${m[0]?.value} none=${m0.length}`))
  }

  { // pioneer
    const u = unit(); const r = rec()
    const hm = hook(R('pioneer'), 'hitMods')
    const t1 = unit({ buffs: [debuff()] })
    const base = hm(r.sim, u, t1)[0]?.value
    hook(R('pioneer'), 'onDebuffInflict')(r.sim, u)
    const doubled = hm(r.sim, u, t1)[0]?.value
    hook(R('pioneer'), 'onTurnStart')(r.sim, u)
    const reset = hm(r.sim, u, t1)[0]?.value
    c.push(t.ok('pioneer hitMods: 12% DMG vs debuffed; onDebuffInflict doubles to 24%, onTurnStart resets',
      near(base, 0.12) && near(doubled, 0.24) && near(reset, 0.12), `base=${base} x2=${doubled} reset=${reset}`))
  }

  { // watchmaker
    const r = rec({ allies: [unit({ id: 'a2' })], lastAbilityTarget: unit({ id: 'a2' }) }); hook(R('watchmaker'), 'onAfterUlt')(r.sim, unit())
    const r2 = rec({ allies: [unit({ id: 'a2' })], lastAbilityTarget: undefined }); hook(R('watchmaker'), 'onAfterUlt')(r2.sim, unit())
    c.push(t.ok('watchmaker onAfterUlt: +30% Break Effect to chars when the ult targets an ally, else nothing', near(mod(r.first('watchmaker'), 'be'), 0.30) && r2.buffs('watchmaker').length === 0, `ally=${mod(r.first('watchmaker'), 'be')} none=${r2.buffs('watchmaker').length}`))
  }

  { // sacerdos — skill and ult share the helper
    const ally = unit({ id: 'a2' })
    const r = rec({ lastAbilityTarget: ally })
    hook(R('sacerdos'), 'onAfterSkill')(r.sim, unit(), null)
    hook(R('sacerdos'), 'onAfterUlt')(r.sim, unit())
    const b = r.applied.find(a => a.u === ally)?.b
    const r2 = rec({ lastAbilityTarget: 'team' }); hook(R('sacerdos'), 'onAfterSkill')(r2.sim, unit(), null)
    c.push(t.ok('sacerdos onAfterSkill/onAfterUlt: +18% CRIT DMG to a single ally (cap 2), skipped for team',
      near(mod(b, 'critDmg'), 0.18) && b.maxStacks === 2 && r.applied.filter(a => a.u === ally).length === 2 && r2.applied.length === 0,
      `cd=${mod(b, 'critDmg')} applies=${r.applied.filter(a => a.u === ally).length} team=${r2.applied.length}`))
  }

  { // scholar
    const r = rec(); hook(R('scholar'), 'onAfterUlt')(r.sim, unit())
    c.push(t.ok('scholar onAfterUlt: grants +25% Skill DMG', near(mod(r.first('scholar'), 'boost:skill'), 0.25), `skill=${mod(r.first('scholar'), 'boost:skill')}`))
  }

  { // hero
    const { u, gm, r } = memoField()
    hook(R('hero'), 'onStart')(r.sim, u)
    const spd = r.first('hero_spd')
    const r3 = rec({ units: [u], allies: [u] }); r3.rt(gm).ownerId = u.id
    hook(R('hero'), 'onTurnStart')(r3.sim, u)
    const r4 = rec({ units: [u, gm], allies: [u] }); r4.rt(gm).ownerId = u.id
    hook(R('hero'), 'onAllyAttack')(r4.sim, u, gm, unit({ id: 'e1' }), 'fua')
    const cdU = r4.applied.find(a => a.u === u && a.b.id === 'hero_cd')?.b
    const cdS = r4.applied.find(a => a.u === gm && a.b.id === 'hero_cd')?.b
    c.push(t.ok('hero onStart/onTurnStart: SPD +6% while a memosprite is on field, removed when it leaves', near(mod(spd, 'spdPct'), 0.06) && r3.removed.includes('hero_spd'), `spd=${mod(spd, 'spdPct')} removed=${r3.removed.join(',')}`))
    c.push(t.ok('hero onAllyAttack: memosprite attack → +30% CRIT DMG on wearer and memosprite', near(mod(cdU, 'critDmg'), 0.30) && near(mod(cdS, 'critDmg'), 0.30), `u=${mod(cdU, 'critDmg')} s=${mod(cdS, 'critDmg')}`))
  }

  { // world_remaking
    const { u, r } = memoField([unit({ id: 'a2' })])
    hook(R('world_remaking'), 'onAfterSkill')(r.sim, u, null)
    hook(R('world_remaking'), 'onAfterAttack')(r.sim, u, null, 'basic')
    const hp = r.first('world_hp'); const dmg = r.first('world_dmg')
    const r2 = rec({ units: [u], allies: [u] }); r2.rt(unit({ id: 's1' })).ownerId = u.id
    hook(R('world_remaking'), 'onAfterAttack')(r2.sim, u, null, 'skill')
    c.push(t.ok('world_remaking onAfterSkill/onAfterAttack(Basic): +24% MaxHP (wearer+memosprite) +15% ally DMG', near(mod(hp, 'hpPct'), 0.24) && r.buffs('world_hp').length === 4 && near(mod(dmg, 'dmgAll'), 0.15) && r.buffs('world_dmg').length === 4, `hp=${mod(hp, 'hpPct')} hpn=${r.buffs('world_hp').length} ally=${mod(dmg, 'dmgAll')}`))
    c.push(t.ok('world_remaking onAfterAttack: a non-Basic attack does nothing', r2.buffs('world_hp').length === 0, `nonbasic=${r2.buffs('world_hp').length}`))
  }

  { // self_enshrouded — 2pc + 4pc shield amplification
    const g = aggregateGear({ relicSets: ['self_enshrouded', 'self_enshrouded'] }, { hp: 1000, atk: 1000, def: 1000, spd: 100, level: 80 })
    c.push(t.ok('self_enshrouded: 2pc+4pc shield absorption +22% reaches the aggregate', near(g.shieldMult, 0.22), `shieldMult=${g.shieldMult}`))
  }

  { // diviner
    const u = unit(); const a2 = unit({ id: 'a2' })
    const r = rec({ allies: [u, a2] })
    hook(R('diviner'), 'onElationSkill')(r.sim, u)
    hook(R('diviner'), 'onElationSkill')(r.sim, u)
    const pm = hook(R('diviner'), 'postMods')
    c.push(t.ok('diviner onElationSkill: 1st Elation Skill gives each char ally +10% Elation, once per battle',
      r.buffs('diviner_e').length === 2 && near(mod(r.first('diviner_e'), 'elation'), 0.10), `apps=${r.buffs('diviner_e').length} el=${mod(r.first('diviner_e'), 'elation')}`))
    c.push(t.ok('diviner postMods: +18% CRIT Rate at SPD≥160, +10% at ≥120, none below', near(pm({ spd: 165 })[0]?.value, 0.18) && near(pm({ spd: 130 })[0]?.value, 0.10) && pm({ spd: 100 }).length === 0, `160=${pm({ spd: 165 })[0]?.value} 120=${pm({ spd: 130 })[0]?.value}`))
  }

  { // navigator
    const u = unit(); const r = rec()
    hook(R('navigator'), 'onStart')(r.sim, u)
    hook(R('navigator'), 'onAfterSkill')(r.sim, u)
    hook(R('navigator'), 'onTurnStart')(r.sim, u)
    hook(R('navigator'), 'onAfterUlt')(r.sim, u)
    const vals = r.buffs('navigator').map(b => mod(b, 'boost:skill'))
    c.push(t.ok('navigator onStart/onAfterSkill/onTurnStart/onAfterUlt: +18% Skill/Ult per stack, decaying (0.18→0.36→0.18→removed)',
      vals.length === 3 && near(vals[0], 0.18) && near(vals[1], 0.36) && near(vals[2], 0.18) && near(mod(r.buffs('navigator')[2], 'boost:ult'), 0.18) && r.removed.includes('navigator'), `vals=${vals.map(v => Math.round((v ?? -1) * 100)).join('→')} removed=${r.removed.length}`))
  }

  { // smith
    const u = unit(); const r = rec({ allies: [u, unit({ id: 'a2' })] })
    hook(R('smith'), 'onDefRedInflict')(r.sim, u)
    const hm = hook(R('smith'), 'hitMods')
    const vsRed = hm(rec().sim, u, unit({ buffs: [{ id: 'x', mods: [{ stat: 'defRed', value: 0.1 }] }] }))
    const vsClean = hm(rec().sim, u, unit())
    c.push(t.ok('smith onDefRedInflict: party +15% DMG (Comburent)', r.buffs('smith_comb').length === 2 && near(mod(r.first('smith_comb'), 'dmgAll'), 0.15), `apps=${r.buffs('smith_comb').length} dmg=${mod(r.first('smith_comb'), 'dmgAll')}`))
    c.push(t.ok('smith hitMods: +28% CRIT DMG vs DEF-reduced target only', near(vsRed[0]?.value, 0.28) && vsClean.length === 0, `red=${vsRed[0]?.value} clean=${vsClean.length}`))
  }

  { // poet
    const pm = hook(R('poet'), 'postMods')
    c.push(t.ok('poet postMods: +32% CRIT Rate below 95 SPD, +20% below 110, none otherwise',
      near(pm({ spd: 90 })[0]?.value, 0.32) && near(pm({ spd: 100 })[0]?.value, 0.20) && pm({ spd: 120 }).length === 0,
      `95=${pm({ spd: 90 })[0]?.value} 110=${pm({ spd: 100 })[0]?.value} 120=${pm({ spd: 120 }).length}`))
  }

  { // warrior_goddess
    const u = unit(); const a2 = unit({ id: 'a2' })
    const r = rec({ allies: [u, a2] })
    hook(R('warrior_goddess'), 'onAllyHeal')(r.sim, u)
    c.push(t.ok('warrior_goddess onAllyHeal: self +6% SPD + all char allies +15% CRIT DMG (Gentle Rain)',
      near(mod(r.applied.find(a => a.u === u && a.b.id === 'goddess_spd')?.b, 'spdPct'), 0.06) && r.buffs('goddess_cd').length === 2,
      `spd=${mod(r.applied.find(a => a.u === u && a.b.id === 'goddess_spd')?.b, 'spdPct')} cd=${r.buffs('goddess_cd').length}`))
  }

  { // wavestrider
    const u = unit(); const r = rec()
    hook(R('wavestrider'), 'onAllyAbility')(r.sim, u)
    hook(R('wavestrider'), 'onAllyAbility')(r.sim, u)
    hook(R('wavestrider'), 'onAfterUlt')(r.sim, u)
    const r2 = rec()
    hook(R('wavestrider'), 'onAllyAbility')(r2.sim, u)
    hook(R('wavestrider'), 'onAfterUlt')(r2.sim, u)
    c.push(t.ok('wavestrider onAllyAbility/onAfterUlt: 2 Help stacks consumed by the ult → +48% ATK; below 2 does nothing',
      near(mod(r.first('wavestrider'), 'atkPct'), 0.48) && r2.buffs('wavestrider').length === 0,
      `2=${mod(r.first('wavestrider'), 'atkPct')} 1=${r2.buffs('wavestrider').length}`))
  }

  { // valorous
    const u = unit(); const r = rec()
    hook(R('valorous'), 'onAfterAttack')(r.sim, u, null, 'fua')
    const r2 = rec(); hook(R('valorous'), 'onAfterAttack')(r2.sim, u, null, 'skill')
    c.push(t.ok('valorous onAfterAttack: FUA grants +36% Ultimate DMG, non-FUA ignored', near(mod(r.first('valorous'), 'boost:ult'), 0.36) && r2.buffs('valorous').length === 0, `fua=${mod(r.first('valorous'), 'boost:ult')} skill=${r2.buffs('valorous').length}`))
  }

  { // magical_girl
    const u = unit(); const hm = hook(R('magical_girl'), 'hitMods')
    const r = rec({ extra: { punchlinePool: () => 15 } })
    c.push(t.ok('magical_girl hitMods: Elation DEF-ignore 10% + 1%/5 Punchline (15 pool → 0.13), non-Elation ignored',
      near(hm(r.sim, u, null, 'elation')[0]?.value, 0.13) && hm(r.sim, u, null, 'basic').length === 0,
      `el=${hm(r.sim, u, null, 'elation')[0]?.value} basic=${hm(r.sim, u, null, 'basic').length}`))
  }

  // ================================================================ PLANAR SETS

  { // fleet
    const u = unit({ base: { ...BASE, spd: 130 } }); const r = rec({ allies: [u, unit({ id: 'a2' })] })
    hook(P('fleet'), 'onStart')(r.sim, u)
    const slow = unit({ base: { ...BASE, spd: 100 } }); const r2 = rec({ allies: [slow] })
    hook(P('fleet'), 'onStart')(r2.sim, slow)
    c.push(t.ok('fleet onStart: SPD≥120 grants +8% ATK to each char ally, low SPD none', r.buffs('fleet_atk').length === 2 && near(mod(r.first('fleet_atk'), 'atkPct'), 0.08) && r2.buffs('fleet_atk').length === 0, `ok=${r.buffs('fleet_atk').length} slow=${r2.buffs('fleet_atk').length}`))
  }

  { // glamoth
    const pm = hook(P('glamoth'), 'postMods')
    c.push(t.ok('glamoth postMods: +18% DMG at SPD≥160, +12% at ≥135, none below', near(pm({ spd: 160 })[0]?.value, 0.18) && near(pm({ spd: 140 })[0]?.value, 0.12) && pm({ spd: 100 }).length === 0, `160=${pm({ spd: 160 })[0]?.value} 135=${pm({ spd: 140 })[0]?.value}`))
  }

  { // broken_keel
    const u = unit({ base: { ...BASE, effRes: 0.30 } }); const r = rec({ allies: [u, unit({ id: 'a2' })] })
    hook(P('broken_keel'), 'onStart')(r.sim, u)
    const slow = unit({ base: { ...BASE, effRes: 0.0 } }); const r2 = rec({ allies: [slow] })
    hook(P('broken_keel'), 'onStart')(r2.sim, slow)
    c.push(t.ok('broken_keel onStart: at ≥30% Effect RES, +10% CRIT DMG to each char ally', r.buffs('keel_cd').length === 2 && near(mod(r.first('keel_cd'), 'critDmg'), 0.10) && r2.buffs('keel_cd').length === 0, `ok=${r.buffs('keel_cd').length} low=${r2.buffs('keel_cd').length}`))
  }

  { // vonwacq
    const u = unit({ base: { ...BASE, spd: 130 } }); const r = rec({ allies: [u] })
    hook(P('vonwacq'), 'onStart')(r.sim, u)
    const slow = unit({ base: { ...BASE, spd: 100 } }); const r2 = rec({ allies: [slow] })
    hook(P('vonwacq'), 'onStart')(r2.sim, slow)
    c.push(t.ok('vonwacq onStart: advances 40% when SPD≥120, else no advance', r.advances.length === 1 && r.advances[0].pct === 0.40 && r2.advances.length === 0, `ok=${r.advances.length} slow=${r2.advances.length}`))
  }

  { // pan_cosmic
    const pm = hook(P('pan_cosmic'), 'postMods')
    c.push(t.ok('pan_cosmic postMods: +25% ATK per 100% EHR, capped at 0.25', near(pm({ ehr: 1.0 })[0]?.value, 0.25) && near(pm({ ehr: 0.4 })[0]?.value, 0.10), `1.0=${pm({ ehr: 1.0 })[0]?.value} 0.4=${pm({ ehr: 0.4 })[0]?.value}`))
  }

  { // celestial
    const u = unit(); const r = rec({ extra: { effCritDmg: () => 1.3 } })
    hook(P('celestial'), 'onStart')(r.sim, u)
    const r2 = rec({ extra: { effCritDmg: () => 1.0 } })
    hook(P('celestial'), 'onStart')(r2.sim, u)
    c.push(t.ok('celestial onStart: at ≥120% CRIT DMG grants +60% CRIT Rate for 1 turn, else nothing', near(mod(r.first('celestial'), 'critRate'), 0.60) && r2.buffs('celestial').length === 0, `hi=${mod(r.first('celestial'), 'critRate')} lo=${r2.buffs('celestial').length}`))
  }

  { // penacony
    const u = unit({ elem: 'Fire' }); const a2 = unit({ id: 'a2', elem: 'Fire' }); const a3 = unit({ id: 'a3', elem: 'Ice' })
    const r = rec({ allies: [u, a2, a3] })
    hook(P('penacony'), 'onStart')(r.sim, u)
    c.push(t.ok('penacony onStart: +10% DMG to same-element allies (excluding wearer)',
      near(mod(r.first('penacony'), 'dmgAll'), 0.10) && r.applied.some(a => a.u === a2 && a.b.id === 'penacony') && !r.applied.some(a => a.u === a3 && a.b.id === 'penacony'),
      `same=${r.applied.filter(a => a.b.id === 'penacony').length}`))
  }

  { // sigonia
    const r = rec(); hook(P('sigonia'), 'onKill')(r.sim, unit(), unit({ id: 'e1' }))
    const b = r.first('sigonia')
    c.push(t.ok('sigonia onKill: +4% CRIT DMG stacking up to 10', near(mod(b, 'critDmg'), 0.04) && b.maxStacks === 10, `cd=${mod(b, 'critDmg')} max=${b.maxStacks}`))
  }

  { // izumo
    const u = unit(); const a2 = unit({ id: 'a2' })
    const r = rec({ units: [u, a2], allies: [u, a2] })
    hook(P('izumo'), 'onStart')(r.sim, u)
    const u3 = unit(); const a4 = unit({ id: 'a4', base: { ...BASE, path: 'Harmony' } })
    const r2 = rec({ units: [u3, a4], allies: [u3, a4] })
    hook(P('izumo'), 'onStart')(r2.sim, u3)
    c.push(t.ok('izumo onStart: +12% CRIT Rate with a same-Path teammate, else nothing', near(mod(r.first('izumo_cr'), 'critRate'), 0.12) && r2.buffs('izumo_cr').length === 0, `same=${mod(r.first('izumo_cr'), 'critRate')} none=${r2.buffs('izumo_cr').length}`))
  }

  { // duran
    const u = unit(); const r = rec()
    for (let i = 0; i < 5; i++) hook(P('duran'), 'onAfterAttack')(r.sim, u, u, null, 'fua')
    const b = r.buffs('duran_merit').pop()
    const r2 = rec(); hook(P('duran'), 'onAfterAttack')(r2.sim, u, u, null, 'skill')
    c.push(t.ok('duran onAfterAttack: 1 Merit per FUA → +5% FUA DMG per stack, +25% CRIT DMG at 5; non-FUA ignored',
      near(mod(b, 'boost:fua'), 0.25) && near(mod(b, 'critDmg'), 0.25) && r2.buffs('duran_merit').length === 0,
      `fua=${mod(b, 'boost:fua')} cd=${mod(b, 'critDmg')} skill=${r2.buffs('duran_merit').length}`))
  }

  { // kalpagni
    const u = unit()
    const r = rec(); hook(P('kalpagni'), 'onAfterAttack')(r.sim, u, u, unit({ id: 'e1', weaknesses: ['Fire'] }), 'basic')
    const r2 = rec(); hook(P('kalpagni'), 'onAfterAttack')(r2.sim, u, u, unit({ id: 'e2', weaknesses: ['Ice'] }), 'basic')
    c.push(t.ok('kalpagni onAfterAttack: +40% Break Effect when the hit lands on a Fire-weak target', near(mod(r.first('kalpagni'), 'be'), 0.40) && r2.buffs('kalpagni').length === 0, `fire=${mod(r.first('kalpagni'), 'be')} ice=${r2.buffs('kalpagni').length}`))
  }

  { // lushaka
    const first = unit({ id: 'c1' }); const wearer = unit({ id: 'c2' })
    const r = rec({ units: [first, wearer], allies: [first, wearer] })
    hook(P('lushaka'), 'onStart')(r.sim, wearer)
    const w = unit({ id: 'c1' }); const r2 = rec({ units: [w], allies: [w] })
    hook(P('lushaka'), 'onStart')(r2.sim, w)
    c.push(t.ok('lushaka onStart: +12% ATK to the first lineup character when the wearer is not first', r.applied.some(a => a.u === first && a.b.id === 'lushaka') && near(mod(r.first('lushaka'), 'atkPct'), 0.12) && r2.buffs('lushaka').length === 0, `away=${r.buffs('lushaka').length} first=${r2.buffs('lushaka').length}`))
  }

  { // bone
    const pm = hook(P('bone'), 'postMods')
    c.push(t.ok('bone postMods: +28% CRIT DMG at ≥5000 HP, none below', near(pm({ hp: 5000 })[0]?.value, 0.28) && pm({ hp: 4000 }).length === 0, `hi=${pm({ hp: 5000 })[0]?.value} lo=${pm({ hp: 4000 }).length}`))
  }

  { // giant_tree
    const pm = hook(P('giant_tree'), 'postMods')
    c.push(t.ok('giant_tree postMods: +20% Outgoing Healing at SPD≥180, +12% at ≥135, none below', near(pm({ spd: 180 })[0]?.value, 0.20) && near(pm({ spd: 140 })[0]?.value, 0.12) && pm({ spd: 100 }).length === 0, `180=${pm({ spd: 180 })[0]?.value} 135=${pm({ spd: 140 })[0]?.value}`))
  }

  { // arcadia
    const u = unit(); const a2 = unit({ id: 'a2' }); const r = rec({ units: [u, a2], allies: [u, a2] })
    hook(P('arcadia'), 'onStart')(r.sim, u)
    const four = [unit(), unit({ id: 'b' }), unit({ id: 'c' }), unit({ id: 'd' })]
    const r2 = rec({ units: four, allies: four })
    hook(P('arcadia'), 'onStart')(r2.sim, four[0])
    c.push(t.ok('arcadia onStart: +12% DMG per missing ally (2 allies → 0.24), nothing in a full team', near(mod(r.first('arcadia'), 'dmgAll'), 0.24) && r2.buffs('arcadia').length === 0, `two=${mod(r.first('arcadia'), 'dmgAll')} four=${r2.buffs('arcadia').length}`))
  }

  { // revelry
    const pm = hook(P('revelry'), 'postMods')
    c.push(t.ok('revelry postMods: +24% DoT at ATK≥3600, +12% at ≥2400, none below', near(pm({ atk: 3600 })[0]?.value, 0.24) && near(pm({ atk: 2500 })[0]?.value, 0.12) && pm({ atk: 1000 }).length === 0, `3600=${pm({ atk: 3600 })[0]?.value} 2400=${pm({ atk: 2500 })[0]?.value}`))
  }

  { // tengoku
    const r = rec(); hook(P('tengoku'), 'onSpSpend')(r.sim, unit(), 3)
    const r2 = rec(); hook(P('tengoku'), 'onSpSpend')(r2.sim, unit(), 2)
    c.push(t.ok('tengoku onSpSpend: ≥3 SP in a turn → +32% CRIT DMG for 3 turns, else nothing', near(mod(r.first('tengoku'), 'critDmg'), 0.32) && r2.buffs('tengoku').length === 0, `3=${mod(r.first('tengoku'), 'critDmg')} 2=${r2.buffs('tengoku').length}`))
  }

  { // punklorde
    const hi = unit({ buffs: [{ id: 'e', mods: [{ stat: 'elation', value: 0.85 }] }] })
    const r = rec(); hook(P('punklorde'), 'onStart')(r.sim, hi)
    const b = r.first('punklorde_cd')
    hook(P('punklorde'), 'onAfterAttack')(r.sim, hi, hi, null, 'basic')
    const lo = unit({ buffs: [{ id: 'e', mods: [{ stat: 'elation', value: 0.45 }] }] })
    const r2 = rec(); hook(P('punklorde'), 'onStart')(r2.sim, lo)
    c.push(t.ok('punklorde onStart/onAfterAttack: latches +32% CRIT DMG at 80% Elation (+20% at 40%), never downgrades',
      near(mod(b, 'critDmg'), 0.32) && r.rt(hi).punkTier === 2 && r.buffs('punklorde_cd').length === 1 && near(mod(r2.first('punklorde_cd'), 'critDmg'), 0.20),
      `hi=${mod(b, 'critDmg')} again=${r.buffs('punklorde_cd').length} lo=${mod(r2.first('punklorde_cd'), 'critDmg')}`))
  }

  { // converging
    const u = unit(); const a2 = unit({ id: 'a2' })
    const r = rec(); hook(P('converging'), 'onAfterAttack')(r.sim, u, u, null, 'fua')
    const r2 = rec(); hook(P('converging'), 'onAfterAttack')(r2.sim, u, u, null, 'skill')
    const r3 = rec({ allies: [u, a2] }); hook(P('converging'), 'onAllyKill')(r3.sim, u, unit({ id: 'k' }), unit({ id: 'v' }))
    c.push(t.ok('converging onAfterAttack: own FUA grants +24% ATK (2t)',
      near(mod(r.first('converging'), 'atkPct'), 0.24) && r2.buffs('converging').length === 0,
      `fua=${mod(r.first('converging'), 'atkPct')} skill=${r2.buffs('converging').length}`))
    c.push(t.ok('converging onAllyKill: +12% CRIT DMG to each char ally for the rest of the battle',
      r3.buffs('converging_cd').length === 2 && near(mod(r3.first('converging_cd'), 'critDmg'), 0.12),
      `apps=${r3.buffs('converging_cd').length} cd=${mod(r3.first('converging_cd'), 'critDmg')}`))
  }

  { // amphoreus
    const { u, r } = memoField([unit({ id: 'a2' })])
    hook(P('amphoreus'), 'onStart')(r.sim, u)
    hook(P('amphoreus'), 'onAfterAttack')(r.sim, u, u, null, 'basic')
    const away = unit({ base: { ...BASE, path: 'Remembrance' } })
    const r2 = rec({ units: [away], allies: [away] })
    hook(P('amphoreus'), 'onStart')(r2.sim, away)
    c.push(t.ok('amphoreus onStart/onAfterAttack: memosprite on field → +8% SPD to each char ally, else nothing',
      r.buffs('amph_spd').length === 4 && near(mod(r.first('amph_spd'), 'spdPct'), 0.08) && r2.buffs('amph_spd').length === 0,
      `present=${r.buffs('amph_spd').length} absent=${r2.buffs('amph_spd').length}`))
  }

  { // banana
    const { u, r } = memoField()
    hook(P('banana'), 'onStart')(r.sim, u)
    hook(P('banana'), 'onAfterAttack')(r.sim, u, u, null, 'basic')
    const away = unit({ base: { ...BASE, path: 'Remembrance' } })
    const r2 = rec({ units: [away], allies: [away] })
    hook(P('banana'), 'onStart')(r2.sim, away)
    c.push(t.ok('banana onStart/onAfterAttack: memosprite on field → +32% CRIT DMG, else nothing',
      r.buffs('banana_sum').length === 2 && near(mod(r.first('banana_sum'), 'critDmg'), 0.32) && r2.buffs('banana_sum').length === 0,
      `present=${r.buffs('banana_sum').length} absent=${r2.buffs('banana_sum').length}`))
  }

  { // fallen
    const u = unit({ kitId: 'danheng' }); const mate = unit({ id: 'a2', kitId: 'march7th' })
    const r = rec({ units: [u, mate], allies: [u, mate] })
    hook(P('fallen'), 'onStart')(r.sim, u)
    const solo = unit({ kitId: 'danheng' }); const r2 = rec({ units: [solo], allies: [solo] })
    hook(P('fallen'), 'onStart')(r2.sim, solo)
    const other = rec({ units: [unit(), unit({ id: 'a2', kitId: 'danheng' })] })
    hook(P('fallen'), 'onStart')(other.sim, other.sim.units()[0])
    c.push(t.ok('fallen onStart: +32% CRIT DMG for a Trailblaze Companion with a TBC teammate, else nothing',
      near(mod(r.first('fallen'), 'critDmg'), 0.32) && r2.buffs('fallen').length === 0 && other.buffs('fallen').length === 0,
      `pair=${mod(r.first('fallen'), 'critDmg')} solo=${r2.buffs('fallen').length} nonTBC=${other.buffs('fallen').length}`))
  }

  { // cosmic
    const pm = hook(P('cosmic'), 'postMods')
    c.push(t.ok('cosmic postMods: +0.2% DMG per energyMax above 200, capped at 0.32', near(pm({ energyMax: 300 })[0]?.value, 0.20) && near(pm({ energyMax: 400 })[0]?.value, 0.32) && pm({ energyMax: 150 }).length === 0, `300=${pm({ energyMax: 300 })[0]?.value} 400=${pm({ energyMax: 400 })[0]?.value}`))
  }

  return c
}
