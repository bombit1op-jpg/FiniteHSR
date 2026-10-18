import { run, all } from '../../_helpers/battle'
import { LIGHT_CONES } from '../../../src/core/gear'
import { t, type Case } from '../../suites'
import type { Ctx } from '../../_helpers/battle'
import type { DmgType } from '../../../src/core/entities/Unit'
import type { TeamSpec, EnemySpec } from '../../../src/core/battle'
import type { GearConfig } from '../../../src/core/entities/Unit'

/**
 * Light-cone hook behaviour (guide §19.3): one dedicated case per declared hook, driven through a
 * real battle. A cone here is only listed in `CONE_HOOK_TESTS` when EVERY hook it declares is
 * exercised, which is what lifts it from `partial` to `verified` in `gearCoverage`.
 *
 * Most hooks are proven from the battle's own buff log / game log. Purely-internal hooks that leave
 * no trace in the stream (onStart seeding a counter, onTurnStart clearing a once-per-turn flag) are
 * additionally pinned by invoking the hook directly against a minimal stub - the same function the
 * engine calls, just isolated.
 */

const S = (over: NonNullable<TeamSpec['stats']> = {}): NonNullable<TeamSpec['stats']> => ({ hp: 50000, atk: 1200, def: 600, spd: 100, ...over })
const mob = (over: Partial<EnemySpec> = {}): EnemySpec => ({ name: 'Dummy', count: 1, hp: 5_000_000, spd: 90, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 0, ...over })

/** buff-id → application count over the whole battle (buffLog records fresh/stack/refresh alike) */
const ids = (c: Ctx): Record<string, number> => {
  const m: Record<string, number> = {}
  for (const b of c.buffLog) m[b.id] = (m[b.id] ?? 0) + 1
  return m
}
/** first application's value for one stat of a buff id */
const val = (c: Ctx, id: string, stat: string): number | undefined =>
  c.buffLog.find(b => b.id === id)?.mods?.find(m => m.stat === stat)?.value
const unit = (c: Ctx, kitId: string) => c.sim.roster.find(u => u.kitId === kitId)!
const rt = (c: Ctx, kitId: string): Record<string, unknown> => c.sim.rt(unit(c, kitId)) as Record<string, unknown>
const party = (kitId: string, gear?: GearConfig, over: Partial<{ path: string; skillPriority: number; energyStartFrac: number; stats: TeamSpec['stats'] }> = {}): TeamSpec =>
  ({ kitId, ...over, ...(gear ? { gear } : {}) })

/** recording fake Sim: every method a hook calls is logged; `rt` keeps a per-unit ctx object.
 *  Used to pin a single hook's branch when no battle scenario can isolate it (silent removals,
 *  HP-loss/heal pairs that always co-fire, flag resets). */
function recSim(over: Record<string, unknown> = {}) {
  const calls: { name: string; args: unknown[] }[] = []
  const rec = (name: string) => (...args: unknown[]) => { calls.push({ name, args }) }
  const ctxByUnit = new Map<object, Record<string, unknown>>()
  const rt = (u: object) => { let c = ctxByUnit.get(u); if (!c) { c = {}; ctxByUnit.set(u, c) } return c }
  const sim: Record<string, unknown> = {
    addBuff: rec('addBuff'), removeBuff: rec('removeBuff'), gainSp: rec('gainSp'),
    gainEnergyFlat: rec('gainEnergyFlat'), log: rec('log'), heal: rec('heal'),
    applyDebuff: rec('applyDebuff'), applyDot: rec('applyDot'), advance: rec('advance'), hit: rec('hit'), gainPunchline: rec('gainPunchline'), rt,
    allies: () => [], units: () => [], livingEnemiesOf: () => [], enemies: () => [], hasBuff: () => false, effAtk: () => 0, ...over,
  }
  return { sim: sim as never, rt, argsOf: (n: string) => calls.filter(c => c.name === n).map(c => c.args) }
}
const mkUnit = (over: Record<string, unknown> = {}) =>
  ({ id: 'a1', name: 'W', side: 'ally', kind: 'char', dead: false, visibility: 'visible', elem: 'Fire', buffs: [], dots: [], ...over }) as never

export default (): Case[] => {
  const cases: Case[] = []

  // ---------------------------------------------------------------- bbibo (Harmony)
  // onStart seeds the ult counter; onAfterSkill buffs the next-acting ally; every 2nd ult refunds 1 SP.
  const bb = (gear?: GearConfig) => run({
    team: [
      party('bronya', gear, { path: 'Harmony', skillPriority: 2, energyStartFrac: 1 }),
      party('seele', undefined, { stats: S() }),
    ],
    enemy: mob(), cycles: 6,
  })
  const bbCone = bb({ coneId: 'bbibo', si: 1 })
  const bbNone = bb()
  cases.push(t.ok('bbibo onAfterSkill: after the wearer skills, the next-acting ally gains the DMG buff',
    (ids(bbCone)['bbibo_dmg'] ?? 0) >= 1 && (ids(bbNone)['bbibo_dmg'] ?? 0) === 0,
    `cone=${ids(bbCone)['bbibo_dmg'] ?? 0} bare=${ids(bbNone)['bbibo_dmg'] ?? 0}`))
  cases.push(t.ok('bbibo SI scales the skill buff (S1 0.30 → S5 0.50)',
    val(bbCone, 'bbibo_dmg', 'dmgAll') === 0.30 && val(bb({ coneId: 'bbibo', si: 5 }), 'bbibo_dmg', 'dmgAll') === 0.50,
    `S1=${val(bbCone, 'bbibo_dmg', 'dmgAll')} S5=${val(bb({ coneId: 'bbibo', si: 5 }), 'bbibo_dmg', 'dmgAll')}`))
  cases.push(t.ok('bbibo onStart/onAfterUlt: the ult counter seeds at 0 and increments per ult in battle',
    (rt(bbCone, 'bronya')['bbiboUlts'] as number) >= 1,
    `ults=${rt(bbCone, 'bronya')['bbiboUlts']}`))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'bbibo')!
    const ctx: Record<string, unknown> = {}
    const gains: number[] = []
    const stub = { rt: (_u: unknown) => ctx, gainSp: (n: number) => gains.push(n) }
    hook.onStart!(stub as never, {} as never, 1)
    const seeded = ctx.bbiboUlts
    for (let i = 0; i < 3; i++) hook.onAfterUlt!(stub as never, {} as never, 1, ctx)
    cases.push(t.ok('bbibo onStart/onAfterUlt: odd ults (1st, 3rd) refund 1 SP, even ults do not',
      seeded === 0 && ctx.bbiboUlts === 3 && gains.join(',') === '1,1',
      `seed=${seeded} n=${ctx.bbiboUlts} sp=${gains.join('|')}`))
  }

  // ---------------------------------------------------------------- meshing_cogs (Harmony, 3★)
  // onTurnStart clears the once-per-turn flag; the FIRST attack or hit that turn gives +4 energy.
  const mc = run({
    team: [party('bronya', { coneId: 'meshing_cogs', si: 1 }, { path: 'Harmony', skillPriority: 1 }), party('seele', undefined, { stats: S() })],
    enemy: mob({ atk: 3000 }), cycles: 8,
  })
  const cogs = (kind: string) => mc.logLines.some(l => l.includes(`Meshing Cogs: +energy (${kind})`))
  cases.push(t.ok('meshing_cogs onAfterAttack: the wearer gains energy on its first attack of a turn', cogs('attack')))
  cases.push(t.ok('meshing_cogs onHitTaken: the wearer gains energy on its first hit taken of a turn', cogs('hit')))
  cases.push(t.ok('meshing_cogs onTurnStart: the once-per-turn gate resets (both an attack and a hit proc)', cogs('attack') && cogs('hit')))

  // ---------------------------------------------------------------- carve_moon (Harmony)
  // onStart + onTurnStart rotate one party effect (never the same twice); onUnitDeath clears it.
  const cm = run({
    team: [party('bronya', { coneId: 'carve_moon', si: 1 }, { path: 'Harmony', skillPriority: 1 }), party('seele', undefined, { stats: S() })],
    enemy: mob(), cycles: 6,
  })
  const picks = cm.logLines.filter(l => l.includes('Carve the Moon:')).map(l => /Carve Moon: (.+?) to allies/.exec(l)?.[1] ?? '')
  const firstAtZero = cm.logLines.some(l => l.startsWith('[0.0]') && l.includes('Carve the Moon'))
  const noRepeat = picks.every((p, i) => i === 0 || p !== picks[i - 1])
  cases.push(t.ok('carve_moon onStart: a party effect is applied at battle start', firstAtZero && picks.length >= 1, `picks=${picks.length} at0=${firstAtZero}`))
  cases.push(t.ok('carve_moon onTurnStart: the effect rotates every wearer turn, never repeating', picks.length >= 2 && noRepeat, picks.join(' → ')))
  const cmDeath = run({ team: [party('bronya', { coneId: 'carve_moon', si: 1 }, { path: 'Harmony', skillPriority: 1, stats: { hp: 1, atk: 100, def: 0, spd: 100 } })], enemy: mob({ atk: 200000 }), cycles: 2 })
  cases.push(t.ok('carve_moon onUnitDeath: the wearer is knocked down and the effect is removed',
    cmDeath.logLines.some(l => l.includes('knocked down — Carve the Moon effect removed'))))

  // ---------------------------------------------------------------- dazzled (Elation)
  // onStart borrows maxSp per Elation-path ally; onSpSpend stacks DEF-ignore; onUnitDeath repays it.
  const dz = run({
    team: [
      party('sparxie', { coneId: 'dazzled', si: 1 }, { path: 'Elation', skillPriority: 2 }),
      party('yao_guang', undefined, { path: 'Elation', skillPriority: 2, stats: S() }),
    ],
    enemy: mob(), cycles: 6,
  })
  cases.push(t.ok('dazzled onStart: +1 max Skill Point per Elation-path ally (2 allies → 7)',
    dz.sim.maxSp === 7, `maxSp=${dz.sim.maxSp}`))
  cases.push(t.ok('dazzled onSpSpend: spending a Skill Point grants a DEF-ignore stack (capped)',
    (ids(dz)['dazzle_def'] ?? 0) >= 1 && val(dz, 'dazzle_def', 'defIgnore') === 0.05,
    `apps=${ids(dz)['dazzle_def'] ?? 0} val=${val(dz, 'dazzle_def', 'defIgnore')}`))
  const dzDeath = run({
    team: [
      party('sparxie', { coneId: 'dazzled', si: 1 }, { path: 'Elation', skillPriority: 2, stats: { hp: 1, atk: 100, def: 0, spd: 100 } }),
      party('yao_guang', undefined, { path: 'Elation', skillPriority: 2, stats: { hp: 1, atk: 100, def: 0, spd: 100 } }),
    ],
    enemy: mob({ atk: 200000 }), cycles: 2,
  })
  cases.push(t.ok('dazzled onUnitDeath: the wearer\'s death returns the borrowed max Skill Points',
    dzDeath.sim.maxSp === 5, `maxSp=${dzDeath.sim.maxSp}`))

  // ---------------------------------------------------------------- long_rainbows (Remembrance)
  // onStart seeds the pool; onAfterAttack drains ally HP into it; onAllyAttack spends it as Additional DMG + vuln.
  const lr = run({ team: [party('aglaea', { coneId: 'long_rainbows', si: 1 }, { path: 'Remembrance', skillPriority: 2 })], enemy: mob(), cycles: 8 })
  const drain = lr.logLines.map(l => /Long Rainbows: allies -(\d+) HP \(pool (\d+)\)/.exec(l)).find(Boolean)
  cases.push(t.ok('long_rainbows onStart: the pool starts empty, so the first drain sets pool = drained HP',
    !!drain && drain[1] === drain[2], drain ? `drained=${drain[1]} pool=${drain[2]}` : 'no drain line'))
  cases.push(t.ok('long_rainbows onAfterAttack: the wearer\'s basic/skill/ult drains ally HP into the pool',
    lr.logLines.some(l => l.includes('Long Rainbows: allies -'))))
  cases.push(t.ok('long_rainbows onAllyAttack: the memosprite spends the pool as Additional DMG and applies vuln',
    lr.logLines.some(l => l.includes('Long Rainbows: memosprite Additional')) && (ids(lr)['rainbow_vuln'] ?? 0) >= 1,
    `vuln=${ids(lr)['rainbow_vuln'] ?? 0} val=${val(lr, 'rainbow_vuln', 'vulnAll')}`))

  // ---------------------------------------------------------------- never_forget_her_flame (Nihility)
  // onStart buffs Break DMG on the wearer + highest-BE ally; onWeaknessApply refunds 1 SP once per
  // turn; onTurnStart / onAfterUlt clear that once-per-turn flag.
  const nff = run({
    team: [
      party('silverwolf', { coneId: 'never_forget_her_flame', si: 1 }, { path: 'Nihility', skillPriority: 2 }),
      party('serval', undefined, { path: 'Erudition', skillPriority: 2, stats: S({ be: 0.10 }) }),
      party('seele', undefined, { path: 'TheHunt', skillPriority: 2, stats: S({ be: 0.20 }) }),
    ],
    enemy: mob(), cycles: 6,
  })
  const nffOn = (kitId: string) => unit(nff, kitId).buffs.some(b => b.id === 'nff_break')
  cases.push(t.ok('never_forget_her_flame onStart: Break DMG goes to the wearer and the highest-BE ally',
    nffOn('silverwolf') && nffOn('seele') && !nffOn('serval') && (ids(nff)['nff_break'] ?? 0) === 2,
    `self=${nffOn('silverwolf')} best=${nffOn('seele')} other=${nffOn('serval')} n=${ids(nff)['nff_break'] ?? 0}`))
  cases.push(t.ok('never_forget_her_flame onWeaknessApply: implanting a weakness refunds 1 Skill Point',
    nff.logLines.some(l => l.includes('Never Forget Her Flame: weakness') && l.includes('+1 Skill Point'))))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'never_forget_her_flame')!
    const ctx: Record<string, unknown> = {}
    const stub = { rt: (_u: unknown) => ctx }
    ctx.nffSp = true
    hook.onTurnStart!(stub as never, {} as never, 1)
    const afterTurn = ctx.nffSp
    ctx.nffSp = true
    hook.onAfterUlt!(stub as never, {} as never, 1, ctx)
    cases.push(t.ok('never_forget_her_flame onTurnStart/onAfterUlt: both clear the once-per-turn SP flag',
      afterTurn === undefined && ctx.nffSp === undefined,
      `afterTurn=${String(afterTurn)} afterUlt=${String(ctx.nffSp)}`))
  }

  // ---------------------------------------------------------------- unreachable (Destruction)
  // onHitTaken + onAllyHpLoss grant the DMG buff; onAfterAttack clears it.
  const unr = run({ team: [party('blade', { coneId: 'unreachable', si: 1 }, { path: 'Destruction', skillPriority: 2 })], enemy: mob(), cycles: 6 })
  const unrBare = run({ team: [party('blade', undefined, { path: 'Destruction', skillPriority: 2 })], enemy: mob(), cycles: 6 })
  cases.push(t.ok('unreachable onAllyHpLoss: the wearer\'s own HP loss grants the DMG buff (SI-scaled)',
    (ids(unr)['unreachable_dmg'] ?? 0) >= 1 && (ids(unrBare)['unreachable_dmg'] ?? 0) === 0 && val(unr, 'unreachable_dmg', 'dmgAll') === 0.24,
    `cone=${ids(unr)['unreachable_dmg'] ?? 0} bare=${ids(unrBare)['unreachable_dmg'] ?? 0}`))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'unreachable')!
    const hit = recSim()
    hook.onHitTaken!(hit.sim, mkUnit(), 1)
    const clear = recSim()
    hook.onAfterAttack!(clear.sim, mkUnit({ buffs: [{ id: 'unreachable_dmg' }] }), mkUnit(), 'basic', 1)
    const empty = recSim()
    hook.onAfterAttack!(empty.sim, mkUnit(), mkUnit(), 'basic', 1)
    const added = (r: ReturnType<typeof recSim>) => r.argsOf('addBuff').some(x => (x[1] as { id: string }).id === 'unreachable_dmg')
    cases.push(t.ok('unreachable onHitTaken: taking a hit grants the DMG buff', added(hit)))
    cases.push(t.ok('unreachable onAfterAttack: the wearer\'s attack clears the buff, but only if present',
      clear.argsOf('removeBuff').some(x => x[1] === 'unreachable_dmg') && empty.argsOf('removeBuff').length === 0))
  }

  // ---------------------------------------------------------------- ninja_record (Destruction)
  // onTurnStart re-arms a once-per-turn gate; onAllyHpLoss / onAllyHeal both grant CRIT DMG through it.
  const nj = run({ team: [party('blade', { coneId: 'ninja_record', si: 1 }, { path: 'Destruction', skillPriority: 2 })], enemy: mob(), cycles: 6 })
  cases.push(t.ok('ninja_record onTurnStart/onAllyHpLoss: HP change grants CRIT DMG, re-armed every turn',
    (ids(nj)['ninja_cd'] ?? 0) >= 2 && val(nj, 'ninja_cd', 'critDmg') === 0.18, `apps=${ids(nj)['ninja_cd'] ?? 0}`))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'ninja_record')!
    const s = recSim()
    const u = mkUnit()
    const n = () => s.argsOf('addBuff').length
    hook.onAllyHeal!(s.sim, u, u, 100, 1)
    const first = n()
    hook.onAllyHeal!(s.sim, u, u, 100, 1)
    const same = n()
    hook.onTurnStart!(s.sim, u, 1)
    hook.onAllyHeal!(s.sim, u, u, 100, 1)
    const next = n()
    cases.push(t.ok('ninja_record onAllyHeal: healing the wearer grants CRIT DMG once per turn; onTurnStart re-arms',
      first === 1 && same === 1 && next === 2 && (s.argsOf('addBuff')[0][1] as { id: string }).id === 'ninja_cd',
      `f=${first} same=${same} next=${next}`))
  }

  // ---------------------------------------------------------------- my_own_sword (Destruction)
  // onAllyHpLoss stacks Eclipse (cap 3); 3 stacks add DEF-ignore (hitMods); onAfterAttack clears it.
  const ms = run({ team: [party('blade', { coneId: 'my_own_sword', si: 1 }, { path: 'Destruction', skillPriority: 2 })], enemy: mob(), cycles: 8 })
  const swStacks = ms.buffLog.filter(b => b.id === 'sword_eclipse').map(b => b.stacks ?? 0)
  cases.push(t.ok('my_own_sword onAllyHpLoss: ally HP loss stacks Eclipse with an SI-scaled DMG bonus',
    swStacks.length >= 1 && Math.max(...swStacks) <= 3 && val(ms, 'sword_eclipse', 'dmgAll') === 0.14,
    `apps=${swStacks.length} max=${Math.max(0, ...swStacks)}`))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'my_own_sword')!
    const at = (stacks: number) => hook.hitMods!(recSim().sim, mkUnit({ buffs: [{ id: 'sword_eclipse', stacks }] }), mkUnit(), 'basic', 1)
    const full = at(3), partial = at(2), none = at(0)
    const rm = recSim()
    hook.onAfterAttack!(rm.sim, mkUnit({ buffs: [{ id: 'sword_eclipse' }] }), mkUnit(), 'basic', 1)
    cases.push(t.ok('my_own_sword hitMods/onAfterAttack: 3 stacks grant DEF-ignore; the wearer\'s attack clears Eclipse',
      full.length === 1 && full[0].stat === 'defIgnore' && partial.length === 0 && none.length === 0 &&
      rm.argsOf('removeBuff').some(x => x[1] === 'sword_eclipse'),
      `full=${full.length} partial=${partial.length}`))
  }

  // ---------------------------------------------------------------- sweat_now (Remembrance)
  // onStart + onMemospriteSummon apply Come Train! DMG while a memosprite is out; onMemospriteDisappear
  // and onTurnStart (no memosprite) drop it.
  const sw = run({ team: [party('evernight', { coneId: 'sweat_now', si: 1 }, { path: 'Remembrance', skillPriority: 2 })], enemy: mob(), cycles: 8 })
  cases.push(t.ok('sweat_now onMemospriteSummon: the wearer gains Come Train! DMG when its memosprite appears',
    all(sw, 'SUMMON_CREATED').length >= 1 && (ids(sw)['sweat_dmg'] ?? 0) >= 1 && val(sw, 'sweat_dmg', 'dmgAll') === 0.24,
    `summons=${all(sw, 'SUMMON_CREATED').length} apps=${ids(sw)['sweat_dmg'] ?? 0}`))
  {
    const hook = LIGHT_CONES.find(c => c.id === 'sweat_now')!
    const u = mkUnit({ id: 'a1', base: { path: 'Remembrance' } })
    const sprite = { side: 'ally', kind: 'summon', dead: false }
    const withSprite = () => recSim({ units: () => [sprite], rt: (x: object) => x === sprite ? { ownerId: 'a1' } : {} })
    const added = (r: ReturnType<typeof recSim>) => r.argsOf('addBuff').some(x => (x[1] as { id: string }).id === 'sweat_dmg')
    const removed = (r: ReturnType<typeof recSim>) => r.argsOf('removeBuff').some(x => x[1] === 'sweat_dmg')
    const onStart = withSprite()
    hook.onStart!(onStart.sim, u, 1)
    const noSprite = recSim({ units: () => [] })
    hook.onTurnStart!(noSprite.sim, u, 1)
    const yesSprite = withSprite()
    hook.onTurnStart!(yesSprite.sim, u, 1)
    const gone = recSim()
    hook.onMemospriteDisappear!(gone.sim, u, 1)
    cases.push(t.ok('sweat_now onStart/onTurnStart: applied while a memosprite is on field, dropped otherwise',
      added(onStart) && removed(noSprite) && added(yesSprite)))
    cases.push(t.ok('sweat_now onMemospriteDisappear: the buff is dropped when the memosprite leaves', removed(gone)))
  }

  // ---------------------------------------------------------------- farewells (Remembrance)
  // onAllyHpLoss grants Death Flower only when the wearer (or its summon) loses HP on its own action;
  // onAfterUlt re-arms the advance gate; onTurnStart advances once when its memosprite leaves.
  {
    const hook = LIGHT_CONES.find(c => c.id === 'farewells')!
    const u = mkUnit({ id: 'w1', base: { path: 'Remembrance' } })
    const acted = recSim({ currentActor: u, units: () => [u] })
    hook.onAllyHpLoss!(acted.sim, u, u, 100, 1)
    const bystander = recSim({ currentActor: mkUnit({ id: 'e9', side: 'enemy' }), units: () => [u] })
    hook.onAllyHpLoss!(bystander.sim, u, u, 100, 1)
    const added = (r: ReturnType<typeof recSim>) => r.argsOf('addBuff').some(x => (x[1] as { id: string }).id === 'death_flower')
    cases.push(t.ok('farewells onAllyHpLoss: the wearer\'s own HP loss grants Death Flower; a foreign actor does not',
      added(acted) && !added(bystander)))

    const ult = recSim()
    hook.onAfterUlt!(ult.sim, u, 1, {} as never)
    cases.push(t.ok('farewells onAfterUlt: clears the once-per-cycle advance flag', ult.rt(u)['dfAdv'] === false))

    const turn = recSim({ units: () => [] })
    turn.rt(u)['dfHad'] = true
    hook.onTurnStart!(turn.sim, u, 1)
    cases.push(t.ok('farewells onTurnStart: advancing once when a memosprite left the field since last turn',
      turn.argsOf('advance').length === 1 && turn.rt(u)['dfAdv'] === true && turn.rt(u)['dfHad'] === false))
  }

  // ================================================================ batch 2: onStart / onAfterBreak / hitMods
  const LT = (id: string) => LIGHT_CONES.find(c => c.id === id)!
  const v0 = (r: ReturnType<typeof recSim>) => (r.argsOf('addBuff')[0]?.[1] as { mods: { value: number }[] } | undefined)?.mods[0]?.value
  const id0 = (r: ReturnType<typeof recSim>) => (r.argsOf('addBuff')[0]?.[1] as { id: string } | undefined)?.id

  {
    const hook = LT('arrows')
    const a1 = recSim(), a5 = recSim()
    hook.onStart!(a1.sim, mkUnit(), 1)
    hook.onStart!(a5.sim, mkUnit(), 5)
    cases.push(t.ok('arrows onStart: CRIT Rate buff, SI-scaled', id0(a1) === 'arrows_cr' && v0(a1) === 0.12 && v0(a5) === 0.24, `si1=${v0(a1)} si5=${v0(a5)}`))
  }
  {
    const hook = LT('void')
    const s1 = recSim(), s5 = recSim()
    hook.onStart!(s1.sim, mkUnit(), 1)
    hook.onStart!(s5.sim, mkUnit(), 5)
    cases.push(t.ok('void onStart: Effect Hit Rate buff, SI-scaled', id0(s1) === 'void_ehr' && v0(s1) === 0.20 && v0(s5) === 0.40, `si1=${v0(s1)} si5=${v0(s5)}`))
  }
  {
    const hook = LT('chorus')
    const s1 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    const s5 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    hook.onStart!(s1.sim, mkUnit(), 1)
    hook.onStart!(s5.sim, mkUnit(), 5)
    cases.push(t.ok('chorus onStart: ATK% to each char ally, SI-scaled',
      s1.argsOf('addBuff').length === 2 && id0(s1) === 'chorus_atk' && v0(s1) === 0.08 && v0(s5) === 0.12,
      `n=${s1.argsOf('addBuff').length} si1=${v0(s1)} si5=${v0(s5)}`))
  }
  {
    const hook = LT('fine_fruit')
    const s1 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    const s5 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    hook.onStart!(s1.sim, mkUnit(), 1)
    hook.onStart!(s5.sim, mkUnit(), 5)
    const e = (r: ReturnType<typeof recSim>) => r.argsOf('gainEnergyFlat')
    cases.push(t.ok('fine_fruit onStart: flat energy to each char ally, SI-scaled',
      e(s1).length === 2 && e(s1)[0][1] === 6 && e(s5)[0][1] === 12, `n=${e(s1).length} si1=${e(s1)[0]?.[1]} si5=${e(s5)[0]?.[1]}`))
  }
  {
    const hook = LT('poised_bloom')
    const ally = (p: string) => mkUnit({ base: { path: p } })
    const s1 = recSim({ allies: () => [ally('Harmony'), ally('Harmony'), ally('Hunt')] })
    const s5 = recSim({ allies: () => [ally('Harmony'), ally('Harmony'), ally('Hunt')] })
    hook.onStart!(s1.sim, mkUnit(), 1)
    hook.onStart!(s5.sim, mkUnit(), 5)
    cases.push(t.ok('poised_bloom onStart: CRIT DMG only to chars sharing a Path (2+), SI-scaled',
      s1.argsOf('addBuff').length === 2 && id0(s1) === 'poised_cd' && v0(s1) === 0.16 && v0(s5) === 0.32,
      `n=${s1.argsOf('addBuff').length} si1=${v0(s1)} si5=${v0(s5)}`))
  }
  {
    const hook = LT('shadowed_night')
    const st = recSim()
    hook.onStart!(st.sim, mkUnit(), 1)
    const br = recSim()
    hook.onAfterBreak!(br.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('shadowed_night onStart/onAfterBreak: both grant an SI-scaled SPD% buff',
      id0(st) === 'shadow_spd' && v0(st) === 0.08 && id0(br) === 'shadow_spd2' && v0(br) === 0.08))
  }
  {
    const hook = LT('pioneering')
    const u = mkUnit({ maxHp: 1000 })
    const s1 = recSim(), s5 = recSim()
    hook.onAfterBreak!(s1.sim, u, mkUnit(), 1)
    hook.onAfterBreak!(s5.sim, u, mkUnit(), 5)
    const h = (r: ReturnType<typeof recSim>) => r.argsOf('heal')[0]?.[1]
    cases.push(t.ok('pioneering onAfterBreak: heals the wearer by an SI-scaled max-HP fraction',
      h(s1) === 120 && h(s5) === 200, `si1=${h(s1)} si5=${h(s5)}`))
  }
  {
    const hook = LT('i_am_as_you_behold')
    const s1 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    const s5 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    hook.onStart!(s1.sim, mkUnit(), 1)
    hook.onStart!(s5.sim, mkUnit(), 5)
    cases.push(t.ok('i_am_as_you_behold onStart: party CRIT DMG buff, SI-scaled',
      s1.argsOf('addBuff').length === 2 && id0(s1) === 'kings_ent' && v0(s1) === 0.24 && v0(s5) === 0.48,
      `n=${s1.argsOf('addBuff').length} si1=${v0(s1)} si5=${v0(s5)}`))
  }
  {
    const hook = LT('passing_shore')
    const at = (si: number) => hook.hitMods!(recSim().sim, mkUnit(), mkUnit(), 'basic', si)
    cases.push(t.ok('passing_shore hitMods: unconditional DMG bonus, SI-scaled',
      at(1)[0]?.stat === 'dmgAll' && at(1)[0]?.value === 0.24 && at(5)[0]?.value === 0.40, `si1=${at(1)[0]?.value} si5=${at(5)[0]?.value}`))
  }
  {
    const hook = LT('gnsw')
    const deb = () => ({ debuff: true, mods: [] })
    const n3 = mkUnit({ buffs: [deb(), deb(), deb()] })
    const n1 = mkUnit({ buffs: [deb()] })
    const n0 = mkUnit({ buffs: [] })
    const at = (tgt: unknown, si: number) => hook.hitMods!(recSim().sim, mkUnit(), tgt as never, 'basic', si)
    cases.push(t.ok('gnsw hitMods: DMG% scales with the target\'s debuff count (cap 3), SI-scaled',
      at(n3, 1)[0]?.value === 0.36 && at(n1, 1)[0]?.value === 0.12 && at(n0, 1).length === 0,
      `n3=${at(n3, 1)[0]?.value} n1=${at(n1, 1)[0]?.value} n0=${at(n0, 1).length}`))
  }
  {
    const hook = LT('shattered_home')
    const hi = mkUnit({ hp: 60, maxHp: 100 })
    const lo = mkUnit({ hp: 40, maxHp: 100 })
    const at = (tgt: unknown, si: number) => hook.hitMods!(recSim().sim, mkUnit(), tgt as never, 'basic', si)
    cases.push(t.ok('shattered_home hitMods: bonus only vs targets above 50% HP, SI-scaled',
      at(hi, 1)[0]?.value === 0.20 && at(lo, 1).length === 0))
  }
  {
    const hook = LT('loop')
    const slowed = mkUnit({ buffs: [{ mods: [{ stat: 'spdDown', value: -0.1 }] }] })
    const plain = mkUnit({ buffs: [] })
    const at = (tgt: unknown, si: number) => hook.hitMods!(recSim().sim, mkUnit(), tgt as never, 'basic', si)
    cases.push(t.ok('loop hitMods: DMG bonus only vs SPD-reduced targets, SI-scaled',
      at(slowed, 1)[0]?.value === 0.24 && at(plain, 1).length === 0))
  }
  {
    const hook = LT('morrow')
    const at = (allies: unknown[], si: number) => hook.hitMods!(recSim({ allies: () => allies as never }).sim, mkUnit(), mkUnit(), 'basic', si)
    cases.push(t.ok('morrow hitMods: bonus while any ally is at 50%+ HP',
      at([mkUnit({ hp: 80, maxHp: 100 })], 1)[0]?.value === 0.12 && at([mkUnit({ hp: 40, maxHp: 100 })], 1).length === 0))
  }
  {
    const hook = LT('great_cosmic')
    const at = (n: number, si: number) => hook.hitMods!(recSim().sim, mkUnit(), mkUnit({ weaknesses: Array.from({ length: n }, (_, i) => 'W' + i) }), 'basic', si)
    cases.push(t.ok('great_cosmic hitMods: DMG% scales with the target\'s weakness count (cap 7), SI-scaled',
      at(3, 1)[0]?.value === 0.12 && at(10, 1)[0]?.value === 0.28, `n3=${at(3, 1)[0]?.value} n10=${at(10, 1)[0]?.value}`))
  }

  // ================================================================ batch 3: onKill / onHitTaken / onAfterUlt
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { value: number }[]; shield?: number }).find(b => b.id === id)
    // darting_arrow / adversarial: onKill → buff self
    const da = LT('darting_arrow'), ad = LT('adversarial')
    const d1 = recSim(), d5 = recSim(), a1 = recSim()
    da.onKill!(d1.sim, mkUnit(), mkUnit(), 1)
    da.onKill!(d5.sim, mkUnit(), mkUnit(), 5)
    ad.onKill!(a1.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('darting_arrow onKill: ATK% buff on the wearer, SI-scaled',
      id0(d1) === 'dart_atk' && v0(d1) === 0.24 && v0(d5) === 0.48, `si1=${v0(d1)} si5=${v0(d5)}`))
    cases.push(t.ok('adversarial onKill: SPD% buff on the wearer, SI-scaled',
      id0(a1) === 'adversarial_spd' && v0(a1) === 0.10))

    // solitary_healing: onAfterUlt → DoT boost buff; onKill → flat energy (rounded)
    const sh = LT('solitary_healing')
    const u1 = recSim(), k1 = recSim(), k5 = recSim()
    sh.onAfterUlt!(u1.sim, mkUnit(), 1, {} as never)
    sh.onKill!(k1.sim, mkUnit(), mkUnit(), 1)
    sh.onKill!(k5.sim, mkUnit(), mkUnit(), 5)
    cases.push(t.ok('solitary_healing onAfterUlt: DoT DMG buff, SI-scaled',
      id0(u1) === 'solitary_dot' && v0(u1) === 0.24))
    cases.push(t.ok('solitary_healing onKill: flat energy, SI-scaled + rounded',
      k1.argsOf('gainEnergyFlat')[0]?.[1] === 4 && k5.argsOf('gainEnergyFlat')[0]?.[1] === 6,
      `si1=${k1.argsOf('gainEnergyFlat')[0]?.[1]} si5=${k5.argsOf('gainEnergyFlat')[0]?.[1]}`))

    // something_irreplaceable: onKill == onHitTaken == irrTrigger (heal + DMG%, once per battleTurn)
    const ir = LT('something_irreplaceable')
    const stub = () => recSim({ battleTurn: 1, effAtk: () => 1000 })
    const first = stub()
    const fu = mkUnit()
    ir.onHitTaken!(first.sim, fu, 1)
    ir.onKill!(first.sim, fu, mkUnit(), 1) // same turn → gate
    const again = stub()
    ir.onKill!(again.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('something_irreplaceable onHitTaken: heals + DMG% buff, gated once per battleTurn',
      buffOf(first, 'irr_dmg')?.mods[0]?.value === 0.24 && first.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'irr_dmg').length === 1 && again.argsOf('addBuff').some(a => (a[1] as { id: string }).id === 'irr_dmg')))

    // moment_victory: onHitTaken → DEF% buff self
    const mv = LT('moment_victory')
    const m1 = recSim(), m5 = recSim()
    mv.onHitTaken!(m1.sim, mkUnit(), 1)
    mv.onHitTaken!(m5.sim, mkUnit(), 5)
    cases.push(t.ok('moment_victory onHitTaken: DEF% buff on the wearer, SI-scaled',
      id0(m1) === 'mom_def' && v0(m1) === 0.24 && v0(m5) === 0.40, `si1=${v0(m1)} si5=${v0(m5)}`))

    // texture_memories: onHitTaken → shield+CD when fresh, mitigation while shielded, nothing during CD
    const tex = LT('texture_memories')
    const fresh = recSim()
    tex.onHitTaken!(fresh.sim, mkUnit({ maxHp: 1000 }), 1)
    const shielded = recSim()
    tex.onHitTaken!(shielded.sim, mkUnit({ maxHp: 1000, buffs: [{ id: 'texture_shield' }] }), 1)
    const onCd = recSim()
    tex.onHitTaken!(onCd.sim, mkUnit({ maxHp: 1000, buffs: [{ id: 'texture_cd' }] }), 1)
    cases.push(t.ok('texture_memories onHitTaken: grants shield+CD when fresh, mitigation while shielded, nothing during CD',
      buffOf(fresh, 'texture_shield')?.shield === 160 && !!buffOf(fresh, 'texture_cd') &&
      buffOf(shielded, 'texture_mit')?.mods[0]?.value === 0.12 && onCd.argsOf('addBuff').length === 0,
      `freshCD=${!!buffOf(fresh, 'texture_cd')} mit=${buffOf(shielded, 'texture_mit')?.mods[0]?.value} cdAdds=${onCd.argsOf('addBuff').length}`))
  }

  // ================================================================ batch 4: onAfterUlt / onAfterSkill / onStart
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number }).find(b => b.id === id)
    const ult = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, si: number) => c.onAfterUlt!(sim.sim, u as never, si, {} as never)
    const skill = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, si: number) => c.onAfterSkill!(sim.sim, mkUnit(), undefined, si, {} as never)

    // defense: onAfterUlt heal
    const def = LT('defense')
    const d1 = recSim(), d5 = recSim()
    ult(def, d1, mkUnit({ maxHp: 1000 }), 1)
    ult(def, d5, mkUnit({ maxHp: 1000 }), 5)
    cases.push(t.ok('defense onAfterUlt: heals the wearer by an SI-scaled max-HP fraction',
      d1.argsOf('heal')[0]?.[1] === 180 && d5.argsOf('heal')[0]?.[1] === 300, `si1=${d1.argsOf('heal')[0]?.[1]} si5=${d5.argsOf('heal')[0]?.[1]}`))

    // indelible_promise / genius_greeting / charmony_fall / for_tomorrow_journey: onAfterUlt self-buff
    const ip = LT('indelible_promise'), gg = LT('genius_greeting'), cf = LT('charmony_fall'), ftj = LT('for_tomorrow_journey')
    const i1 = recSim(), i5 = recSim(), g1 = recSim(), c1 = recSim(), f1 = recSim()
    ult(ip, i1, mkUnit(), 1); ult(ip, i5, mkUnit(), 5); ult(gg, g1, mkUnit(), 1); ult(cf, c1, mkUnit(), 1); ult(ftj, f1, mkUnit(), 1)
    cases.push(t.ok('indelible_promise onAfterUlt: CRIT Rate buff, SI-scaled',
      buffOf(i1, 'indelible_ult')?.mods[0]?.value === 0.15 && buffOf(i5, 'indelible_ult')?.mods[0]?.value === 0.30))
    cases.push(t.ok('genius_greeting onAfterUlt: Basic DMG buff, SI-scaled', buffOf(g1, 'genius_basic')?.mods[0]?.value === 0.20))
    cases.push(t.ok('charmony_fall onAfterUlt: SPD% buff, SI-scaled', buffOf(c1, 'charmony_spd')?.mods[0]?.value === 0.08))
    cases.push(t.ok('for_tomorrow_journey onAfterUlt: DMG% buff, SI-scaled', buffOf(f1, 'tomorrow_dmg')?.mods[0]?.value === 0.18))

    // dance_sunset: onAfterUlt FUA boost (2 stacks max)
    const ds = LT('dance_sunset')
    const ds1 = recSim()
    ult(ds, ds1, mkUnit(), 1)
    cases.push(t.ok('dance_sunset onAfterUlt: FUA DMG buff, SI-scaled, capped at 2 stacks',
      buffOf(ds1, 'firedance')?.mods[0]?.value === 0.36 && buffOf(ds1, 'firedance')?.maxStacks === 2))

    // unreachable_veil: onAfterUlt Skill/Ult boost + SP only at maxEnergy>=140
    const uv = LT('unreachable_veil')
    const lo = recSim(), hi = recSim()
    ult(uv, lo, mkUnit({ maxEnergy: 139 }), 1)
    ult(uv, hi, mkUnit({ maxEnergy: 140 }), 1)
    cases.push(t.ok('unreachable_veil onAfterUlt: Skill/Ult DMG buff, +1 SP only when maxEnergy>=140',
      buffOf(lo, 'veil_boost')?.mods[0]?.value === 0.60 && lo.argsOf('gainSp').length === 0 && hi.argsOf('gainSp').length === 1))

    // thankless_coronation: onAfterUlt ATK% + doubled + energy refund at maxEnergy>=300
    const tc = LT('thankless_coronation')
    const t1 = recSim(), t5 = recSim()
    ult(tc, t1, mkUnit({ maxEnergy: 100 }), 1)
    ult(tc, t5, mkUnit({ maxEnergy: 300 }), 1)
    cases.push(t.ok('thankless_coronation onAfterUlt: ATK% buff; doubled and +energy when maxEnergy>=300',
      buffOf(t1, 'coronation_atk')?.mods[0]?.value === 0.40 && t1.argsOf('gainEnergyFlat').length === 0 &&
      buffOf(t5, 'coronation_atk')?.mods[0]?.value === 0.80 && t5.argsOf('gainEnergyFlat')[0]?.[1] === 30,
      `lo=${buffOf(t1, 'coronation_atk')?.mods[0]?.value} hi=${buffOf(t5, 'coronation_atk')?.mods[0]?.value}`))

    // tomorrow_together / curtain_never: party-wide buffs (onAfterUlt / onAfterSkill)
    const tt = LT('tomorrow_together'), cn = LT('curtain_never')
    const t2 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    ult(tt, t2, mkUnit(), 1)
    const c2 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    skill(cn, c2, 1)
    cases.push(t.ok('tomorrow_together onAfterUlt: Elation buff to each char ally, SI-scaled',
      t2.argsOf('addBuff').length === 2 && buffOf(t2, 'tom_together')?.mods[0]?.value === 0.08))
    cases.push(t.ok('curtain_never onAfterSkill: DMG buff to each char ally, SI-scaled',
      c2.argsOf('addBuff').length === 2 && buffOf(c2, 'curtain_dmg')?.mods[0]?.value === 0.08,
      `n=${c2.argsOf('addBuff').length} v=${buffOf(c2, 'curtain_dmg')?.mods[0]?.value}`))

    // hey_over_here / forever_victual: onAfterSkill self-buff (heal bonus / stacking ATK)
    const ho = LT('hey_over_here'), fv = LT('forever_victual')
    const h1 = recSim(), v1 = recSim()
    skill(ho, h1, 1)
    skill(fv, v1, 1)
    cases.push(t.ok('hey_over_here onAfterSkill: outgoing-heal bonus, SI-scaled', buffOf(h1, 'hey_heal')?.mods[0]?.value === 0.16))
    cases.push(t.ok('forever_victual onAfterSkill: stacking ATK% buff (cap 3), SI-scaled',
      buffOf(v1, 'victual_atk')?.mods[0]?.value === 0.08 && buffOf(v1, 'victual_atk')?.maxStacks === 3))

    // scent_alone / past_self_mirror: onAfterUlt/onStart with a Break-Effect gate (eff(u))
    const base = { hp: 1000, atk: 1000, def: 1000, spd: 100 }
    const beMod = (v: number) => ({ mods: [{ stat: 'be', value: v }] })
    const sa = LT('scent_alone'), psm = LT('past_self_mirror')
    const saLo = recSim({ livingEnemiesOf: () => [mkUnit()] })
    const saHi = recSim({ livingEnemiesOf: () => [mkUnit()] })
    ult(sa, saLo, mkUnit({ base, buffs: [] }), 1)
    ult(sa, saHi, mkUnit({ base, buffs: [beMod(1.5)] }), 1)
    cases.push(t.ok('scent_alone onAfterUlt: vulnerability to all enemies; higher when BE>=150%',
      buffOf(saLo, 'woefree')?.mods[0]?.value === 0.10 && buffOf(saHi, 'woefree')?.mods[0]?.value === 0.18,
      `lo=${buffOf(saLo, 'woefree')?.mods[0]?.value} hi=${buffOf(saHi, 'woefree')?.mods[0]?.value}`))
    const ps1 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    psm.onStart!(ps1.sim, mkUnit(), 1)
    const ps5 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    psm.onStart!(ps5.sim, mkUnit(), 5)
    const psU = recSim({ allies: () => [mkUnit(), mkUnit()] })
    ult(psm, psU, mkUnit({ base, buffs: [] }), 1)
    cases.push(t.ok('past_self_mirror onStart: flat energy to each char ally, SI-scaled',
      ps1.argsOf('gainEnergyFlat').length === 2 && ps1.argsOf('gainEnergyFlat')[0]?.[1] === 10 && ps5.argsOf('gainEnergyFlat')[0]?.[1] === 20))
    cases.push(t.ok('past_self_mirror onAfterUlt: DMG% buff to each char ally, SI-scaled',
      psU.argsOf('addBuff').length === 2 && buffOf(psU, 'past_mirror_dmg')?.mods[0]?.value === 0.24))
  }

  // ================================================================ batch 5: onAfterAttack / hitMods / onTurnStart
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, mkUnit(), target as never, type, si)

    // tutorial_before: onAfterAttack → energy only vs a DEF-reduced target
    const tb = LT('tutorial_before')
    const debuffed = recSim(), clean = recSim()
    atk(tb, debuffed, mkUnit({ buffs: [{ mods: [{ stat: 'defRed', value: -0.1 }] }] }), 'basic', 1)
    atk(tb, clean, mkUnit({ buffs: [] }), 'basic', 1)
    cases.push(t.ok('tutorial_before onAfterAttack: flat energy only when the target is DEF-reduced',
      debuffed.argsOf('gainEnergyFlat')[0]?.[1] === 4 && clean.argsOf('gainEnergyFlat').length === 0))

    // cosmos_fell: onAfterAttack → CRIT DMG only vs ≥2 element-weak enemies
    const cfs = LT('cosmos_fell')
    const weak2 = recSim({ livingEnemiesOf: () => [mkUnit({ weaknesses: ['Fire'] }), mkUnit({ weaknesses: ['Fire'] })] })
    const weak1 = recSim({ livingEnemiesOf: () => [mkUnit({ weaknesses: ['Fire'] })] })
    atk(cfs, weak2, mkUnit(), 'basic', 1)
    atk(cfs, weak1, mkUnit(), 'basic', 1)
    cases.push(t.ok('cosmos_fell onAfterAttack: CRIT DMG buff only when ≥2 living enemies share the wearer element weakness',
      buffOf(weak2, 'cosmos_cd')?.mods[0]?.value === 0.20 && !buffOf(weak1, 'cosmos_cd')))

    // multiplication / race_horizon / brighter_sun: onAfterAttack gated by attack type
    const mul = LT('multiplication'), rh = LT('race_horizon'), bs = LT('brighter_sun')
    const mB = recSim(), mS = recSim(), rF = recSim(), rB = recSim(), bB = recSim(), bS = recSim()
    atk(mul, mB, mkUnit(), 'basic', 1); atk(mul, mS, mkUnit(), 'skill', 1)
    atk(rh, rF, mkUnit(), 'fua', 1); atk(rh, rB, mkUnit(), 'basic', 1)
    atk(bs, bB, mkUnit(), 'basic', 1); atk(bs, bS, mkUnit(), 'skill', 1)
    cases.push(t.ok('multiplication onAfterAttack: advances only after a Basic attack',
      mB.argsOf('advance')[0]?.[1] === 0.12 && mS.argsOf('advance').length === 0))
    cases.push(t.ok('race_horizon onAfterAttack: CRIT DMG buff only after a follow-up (cap 10)',
      buffOf(rF, 'race_cd')?.mods[0]?.value === 0.03 && buffOf(rF, 'race_cd')?.maxStacks === 10 && !buffOf(rB, 'race_cd')))
    cases.push(t.ok('brighter_sun onAfterAttack: ATK%+ERR buff only after a Basic (cap 2)',
      buffOf(bB, 'dragons_call')?.mods[0]?.value === 0.18 && buffOf(bB, 'dragons_call')?.mods[1]?.value === 0.06 && !buffOf(bS, 'dragons_call')))

    // many_springs: onAfterAttack → vulnerability to the target; larger if it already has a DoT
    const ms = LT('many_springs')
    const msDot = recSim(), msNo = recSim()
    atk(ms, msDot, mkUnit({ dots: [{ kind: 'Burn' }] }), 'basic', 1)
    atk(ms, msNo, mkUnit({ dots: [] }), 'basic', 1)
    cases.push(t.ok('many_springs onAfterAttack: vulnerability to the target; higher when it carries a DoT',
      Math.abs((buffOf(msDot, 'unarmored')?.mods[0]?.value ?? 0) - 0.24) < 1e-9 && buffOf(msNo, 'unarmored')?.mods[0]?.value === 0.10))

    // eternal_calculus: onAfterAttack → ATK per enemy (cap 5), +SPD at ≥3 enemies, re-stacks each attack
    const ec = LT('eternal_calculus')
    const ec3 = recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit(), mkUnit()] })
    const ec2 = recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit()] })
    atk(ec, ec3, mkUnit(), 'basic', 1)
    atk(ec, ec2, mkUnit(), 'basic', 1)
    cases.push(t.ok('eternal_calculus onAfterAttack: ATK% per enemy hit (cap 5) + SPD at ≥3',
      buffOf(ec3, 'ec_atk')?.mods[0]?.value === 0.12 && buffOf(ec3, 'ec_spd')?.mods[0]?.value === 0.08 && !buffOf(ec2, 'ec_spd') &&
      ec3.argsOf('removeBuff').some(a => a[1] === 'ec_atk')))

    // mutual_demise / destiny_threads / concert_two / boundless_choreo / sailing_second_life: hitMods
    const md = LT('mutual_demise'), dt = LT('destiny_threads'), ct = LT('concert_two'), bc = LT('boundless_choreo'), ssl = LT('sailing_second_life')
    const hm = (c: (typeof LIGHT_CONES)[number], u: unknown, target: unknown, type: DmgType, si: number, allies?: unknown[]) =>
      c.hitMods!(recSim(allies ? { allies: () => allies as never } : {}).sim, u as never, target as never, type, si)
    cases.push(t.ok('mutual_demise hitMods: CRIT Rate only below 80% HP',
      hm(md, mkUnit({ hp: 40, maxHp: 100 }), mkUnit(), 'basic', 1)[0]?.value === 0.12 && hm(md, mkUnit({ hp: 90, maxHp: 100 }), mkUnit(), 'basic', 1).length === 0))
    const defBase = (d: number) => mkUnit({ base: { hp: 1, atk: 1, def: d, spd: 1 } })
    cases.push(t.ok('destiny_threads hitMods: DMG% per 100 DEF, capped at 32%',
      hm(dt, defBase(1000), mkUnit(), 'basic', 1)[0]?.value === 0.08 && hm(dt, defBase(5000), mkUnit(), 'basic', 1)[0]?.value === 0.32))
    cases.push(t.ok('concert_two hitMods: DMG% per on-field shielded char ally',
      hm(ct, mkUnit(), mkUnit(), 'basic', 1, [mkUnit({ buffs: [{ shield: 100 }] })])[0]?.value === 0.04 &&
      hm(ct, mkUnit(), mkUnit(), 'basic', 1, [mkUnit({ buffs: [] })]).length === 0))
    cases.push(t.ok('boundless_choreo hitMods: CRIT DMG only vs slowed/DEF-reduced/Imprisoned targets',
      hm(bc, mkUnit(), mkUnit({ buffs: [{ mods: [{ stat: 'spdDown', value: -0.1 }] }] }), 'basic', 1)[0]?.value === 0.24 &&
      hm(bc, mkUnit(), mkUnit({ dots: [{ kind: 'Imprisonment' }] }), 'basic', 1)[0]?.value === 0.24 &&
      hm(bc, mkUnit(), mkUnit(), 'basic', 1).length === 0))
    cases.push(t.ok('sailing_second_life hitMods: DEF-ignore only on Break DMG',
      hm(ssl, mkUnit(), mkUnit(), 'break', 1)[0]?.value === 0.20 && hm(ssl, mkUnit(), mkUnit(), 'basic', 1).length === 0))

    // qpq: onTurnStart → energy to the lowest-energy ally under 50%
    const qpq = LT('qpq')
    const self = mkUnit({ id: 'self', energy: 100, maxEnergy: 100 })
    const low = mkUnit({ id: 'low', energy: 1, maxEnergy: 100 })
    const high = mkUnit({ id: 'high', energy: 90, maxEnergy: 100 })
    const q1 = recSim({ allies: () => [self, low, high] })
    qpq.onTurnStart!(q1.sim, self, 1)
    const q2 = recSim({ allies: () => [self, high] })
    qpq.onTurnStart!(q2.sim, self, 1)
    cases.push(t.ok('qpq onTurnStart: flat energy to the lowest-energy ally only below 50%',
      q1.argsOf('gainEnergyFlat')[0]?.[1] === 8 && q1.argsOf('gainEnergyFlat')[0]?.[0] === low && q2.argsOf('gainEnergyFlat').length === 0))
  }

  // ================================================================ batch 6: onAfterAttack / onAfterBreak / onAfterSkill / onTurnStart
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, mkUnit(), target as never, type, si)
    const hm = (c: (typeof LIGHT_CONES)[number], u: unknown, target: unknown, type: DmgType, si: number) => c.hitMods!(recSim().sim, u as never, target as never, type, si)

    // aeon: attack → stacking ATK% (cap 4); break → DMG% buff
    const ae = LT('aeon')
    const aeA = recSim(), aeB = recSim()
    atk(ae, aeA, mkUnit(), 'basic', 1)
    ae.onAfterBreak!(aeB.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('aeon: onAfterAttack stacking ATK% (cap 4) + onAfterBreak DMG% buff (SI-scaled)',
      buffOf(aeA, 'aeon_atk')?.mods[0]?.value === 0.08 && buffOf(aeA, 'aeon_atk')?.maxStacks === 4 && buffOf(aeB, 'aeon_break')?.mods[0]?.value === 0.12))

    // amber: HP drop below 50% → DEF% buff; heal back to ≥50% → removed
    const am = LT('amber')
    const amLow = mkUnit({ hp: 40, maxHp: 100 }), amHigh = mkUnit({ hp: 80, maxHp: 100 }), amHeal = mkUnit({ hp: 60, maxHp: 100 })
    const amA = recSim(), amB = recSim(), amC = recSim()
    am.onAllyHpLoss!(amA.sim, amLow, amLow, 30, 1)
    am.onAllyHpLoss!(amB.sim, amHigh, amHigh, 10, 1)
    am.onAllyHeal!(amC.sim, amHeal, amHeal, 20, 1)
    cases.push(t.ok('amber: onAllyHpLoss below 50% adds DEF% buff; onAllyHeal at ≥50% removes it',
      buffOf(amA, 'amber_low')?.mods[0]?.value === 0.16 && !buffOf(amB, 'amber_low') && amC.argsOf('removeBuff').some(a => a[1] === 'amber_low')))

    // flames_afar: cumulative HP loss ≥25% MaxHP → heal 15% + DMG% buff, once per 3 turns; onTurnStart resets accumulator
    const fa = LT('flames_afar')
    const faU = mkUnit({ hp: 100, maxHp: 100 }), faS = recSim()
    fa.onAllyHpLoss!(faS.sim, faU, faU, 20, 1)
    const faAcc = faS.rt(faU)['flamesLoss']
    fa.onTurnStart!(faS.sim, faU, 1)
    const faReset = faS.rt(faU)['flamesLoss']
    fa.onAllyHpLoss!(faS.sim, faU, faU, 30, 1)
    const faHeals = faS.argsOf('heal').length
    fa.onAllyHpLoss!(faS.sim, faU, faU, 30, 1)
    cases.push(t.ok('flames_afar: onAllyHpLoss heal+DMG% only after ≥25% MaxHP cumulative loss; onTurnStart resets; 3-turn CD',
      faAcc === 20 && faReset === 0 && faHeals === 1 && faS.argsOf('heal')[0]?.[1] === 15 &&
      buffOf(faS, 'flames_afar')?.mods[0]?.value === 0.25 && faS.argsOf('heal').length === 1))

    // life_flames: turn start → flat energy; attack → DEF-reduction on target
    const lf = LT('life_flames')
    const lfS = recSim()
    lf.onTurnStart!(lfS.sim, mkUnit(), 1)
    atk(lf, lfS, mkUnit(), 'basic', 1)
    cases.push(t.ok('life_flames: onTurnStart flat energy + onAfterAttack target DEF-reduction (SI-scaled)',
      lfS.argsOf('gainEnergyFlat')[0]?.[1] === 10 && buffOf(lfS, 'flames_def')?.mods[0]?.value === 0.12))

    // reforged_hellfire: skill → Purgatory on enemies; turn start → energy; hitMods CRIT-DMG-taken while Purgatory
    const rf = LT('reforged_hellfire')
    const rfS = recSim(), rfT = recSim()
    rf.onAfterSkill!(rfS.sim, mkUnit({ side: 'ally' }), mkUnit({ side: 'enemy' }), 1, {})
    rf.onTurnStart!(rfT.sim, mkUnit(), 1)
    const rfHm = rf.hitMods!(recSim({ hasBuff: () => true }).sim, mkUnit({ side: 'ally' }), mkUnit({ side: 'enemy' }), 'skill', 1)
    cases.push(t.ok('reforged_hellfire: onAfterSkill Purgatory on enemies + onTurnStart energy + hitMods CRIT-DMG-taken',
      buffOf(rfS, 'purgatory')?.mods.length === 6 && rfT.argsOf('gainEnergyFlat')[0]?.[1] === 20 &&
      rfHm[0]?.stat === 'critDmgTaken:skill' && rfHm[0]?.value === 0.30))

    // star_lights_night: skill → energy + Sail stack; hitMods Ult boost only at 3 Sail stacks
    const sl = LT('star_lights_night')
    const slS = recSim()
    sl.onAfterSkill!(slS.sim, mkUnit({ buffs: [] }), mkUnit(), 1, {})
    const sl0 = sl.hitMods!(recSim().sim, mkUnit({ buffs: [{ id: 'sail', stacks: 2, mods: [] }] }), mkUnit(), 'ult', 1)
    const sl3 = sl.hitMods!(recSim().sim, mkUnit({ buffs: [{ id: 'sail', stacks: 3, mods: [] }] }), mkUnit(), 'ult', 1)
    cases.push(t.ok('star_lights_night: onAfterSkill energy+Sail; hitMods Ult boost only at 3 Sail stacks (SI-scaled)',
      slS.argsOf('gainEnergyFlat')[0]?.[1] === 6 && buffOf(slS, 'sail')?.mods[0]?.value === 0.20 && buffOf(slS, 'sail')?.maxStacks === 3 &&
      sl0.length === 0 && sl3[0]?.stat === 'boost:ult' && Math.abs((sl3[0]?.value ?? 0) - 0.60) < 1e-9))

    // ninjutsu_inscription: start → energy; ult → Raiton armed; two Basics → 50% advance
    const nj = LT('ninjutsu_inscription')
    const njU = mkUnit(), njS = recSim()
    nj.onStart!(njS.sim, njU, 1)
    nj.onAfterUlt!(njS.sim, njU, 1, {})
    nj.onAfterAttack!(njS.sim, njU, mkUnit(), 'basic', 1)
    const njOne = njS.argsOf('advance').length
    nj.onAfterAttack!(njS.sim, njU, mkUnit(), 'basic', 1)
    cases.push(t.ok('ninjutsu_inscription: onStart energy + onAfterUlt arms Raiton; 2 post-Ult Basics → 50% advance',
      njS.argsOf('gainEnergyFlat')[0]?.[1] === 30 && njOne === 0 && njS.argsOf('advance')[0]?.[1] === 0.5))

    // yet_hope_priceless: start/basic → DEF-ignore buff; hitMods FUA boost from CRIT DMG stacks
    const yh = LT('yet_hope_priceless')
    const yhS = recSim(), yhB = recSim(), yhK = recSim()
    yh.onStart!(yhS.sim, mkUnit(), 1)
    atk(yh, yhB, mkUnit(), 'basic', 1)
    atk(yh, yhK, mkUnit(), 'skill', 1)
    const yhU = mkUnit({ base: { hp: 1, atk: 1, def: 1, spd: 1, critDmg: 1.6 } })
    const yhHm = yh.hitMods!(recSim({ hasBuff: () => true }).sim, yhU, mkUnit(), 'fua', 1)
    const yhNo = yh.hitMods!(recSim({ hasBuff: () => false }).sim, yhU, mkUnit(), 'fua', 1)
    cases.push(t.ok('yet_hope_priceless: onStart/Basic DEF-ignore buff; hitMods FUA boost scaled by CRIT DMG stacks',
      buffOf(yhS, 'hope_defignore')?.mods[0]?.value === 0.20 && buffOf(yhB, 'hope_defignore')?.mods[0]?.value === 0.20 && !buffOf(yhK, 'hope_defignore') &&
      yhHm[0]?.stat === 'boost:fua' && Math.abs((yhHm[0]?.value ?? 0) - 0.24) < 1e-9 && yhHm.some(m => m.stat === 'defIgnore') && !yhNo.some(m => m.stat === 'defIgnore')))

    // dream_montage: broken-target attack → energy, cap 2 per turn, reset on turn start
    const dm = LT('dream_montage')
    const dmU = mkUnit(), dmS = recSim()
    dm.onAfterAttack!(dmS.sim, dmU, mkUnit({ broken: false }), 'basic', 1)
    dm.onAfterAttack!(dmS.sim, dmU, mkUnit({ broken: true }), 'basic', 1)
    dm.onAfterAttack!(dmS.sim, dmU, mkUnit({ broken: true }), 'basic', 1)
    const dmCap = dmS.argsOf('gainEnergyFlat').length
    dm.onAfterAttack!(dmS.sim, dmU, mkUnit({ broken: true }), 'basic', 1)
    dm.onTurnStart!(dmS.sim, dmU, 1)
    dm.onAfterAttack!(dmS.sim, dmU, mkUnit({ broken: true }), 'basic', 1)
    cases.push(t.ok("dream_montage: onAfterAttack energy vs broken target (cap 2/turn), onTurnStart reset",
      dmS.argsOf('gainEnergyFlat')[0]?.[1] === 3 && dmCap === 2 && dmS.argsOf('gainEnergyFlat').length === 3))

    // incessant_rain: hitMods CRIT Rate at ≥3 target debuffs; attack applies Aether Code vulnerability
    const ir = LT('incessant_rain')
    const d3 = mkUnit({ buffs: [{ debuff: true, mods: [] }, { debuff: true, mods: [] }, { debuff: true, mods: [] }] })
    const irHm = hm(ir, mkUnit(), d3, 'basic', 1)
    const irHm1 = hm(ir, mkUnit(), mkUnit({ buffs: [{ debuff: true, mods: [] }] }), 'basic', 1)
    const irS = recSim()
    atk(ir, irS, mkUnit(), 'basic', 1)
    cases.push(t.ok('incessant_rain: hitMods CRIT Rate at ≥3 target debuffs; onAfterAttack Aether Code vulnerability',
      irHm[0]?.value === 0.12 && irHm1.length === 0 && irS.argsOf('applyDebuff').length === 1))
  }

  // ================================================================ batch 7: onAfterSkill / onKill / onAfterBreak / hitMods
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, mkUnit(), target as never, type, si)
    const hm = (c: (typeof LIGHT_CONES)[number], u: unknown, target: unknown, type: DmgType, si: number) => c.hitMods!(recSim().sim, u as never, target as never, type, si)

    // before_dawn: skill/ult → stacking Somnus FUA-boost token (cap 3)
    const bd = LT('before_dawn')
    const bdS = recSim(), bdU = recSim()
    bd.onAfterSkill!(bdS.sim, mkUnit(), mkUnit(), 1, {})
    bd.onAfterUlt!(bdU.sim, mkUnit(), 1, {})
    cases.push(t.ok('before_dawn: onAfterSkill/onAfterUlt grant stacking Somnus FUA boost (cap 3)',
      buffOf(bdS, 'somnus')?.mods[0]?.value === 0.48 && buffOf(bdS, 'somnus')?.maxStacks === 3 && buffOf(bdU, 'somnus')?.mods[0]?.value === 0.48))

    // whereabouts: break → Routed (vulnerability + SPD down) on the target
    const wb = LT('whereabouts')
    const wbS = recSim()
    wb.onAfterBreak!(wbS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('whereabouts: onAfterBreak applies Routed (vulnerability + SPD down) to the target',
      buffOf(wbS, 'routed')?.mods[0]?.value === 0.24 && buffOf(wbS, 'routed')?.mods[1]?.value === 0.20))

    // cruising: kill → ATK% buff
    const cr = LT('cruising')
    const crS = recSim()
    cr.onKill!(crS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('cruising: onKill grants ATK% buff', buffOf(crS, 'cruise_atk')?.mods[0]?.value === 0.20))

    // resolution: attack → Ensnared DEF-down on an un-debuffed living enemy only
    const rs = LT('resolution')
    const rsOk = recSim(), rsDup = recSim(), rsAlly = recSim()
    atk(rs, rsOk, mkUnit({ side: 'enemy' }), 'basic', 1)
    atk(rs, rsDup, mkUnit({ side: 'enemy', buffs: [{ id: 'ensnared', mods: [] }] }), 'basic', 1)
    atk(rs, rsAlly, mkUnit({ side: 'ally' }), 'basic', 1)
    cases.push(t.ok('resolution: onAfterAttack applies Ensnared only vs an un-Ensnared living enemy',
      rsOk.argsOf('applyDebuff').length === 1 && rsDup.argsOf('applyDebuff').length === 0 && rsAlly.argsOf('applyDebuff').length === 0))

    // ddd: ult → advances every living character on both sides
    const ddd = LT('ddd')
    const dddS = recSim({ allies: (s: string) => (s === 'ally' ? [mkUnit(), mkUnit({ dead: true })] : [mkUnit({ side: 'enemy' })]) })
    ddd.onAfterUlt!(dddS.sim, mkUnit(), 1, {})
    cases.push(t.ok('ddd: onAfterUlt advances every living character on both sides (SI-scaled)',
      dddS.argsOf('advance').length === 2 && dddS.argsOf('advance').every(a => a[1] === 0.16)))

    // fermata: +DMG only vs Shock/WindShear-afflicted targets
    const fm = LT('fermata')
    cases.push(t.ok('fermata: hitMods DMG bonus only vs Shock/WindShear-afflicted targets',
      hm(fm, mkUnit(), mkUnit({ dots: [{ kind: 'Shock' }] }), 'basic', 1)[0]?.value === 0.16 &&
      hm(fm, mkUnit(), mkUnit({ dots: [{ kind: 'WindShear' }] }), 'basic', 1)[0]?.value === 0.16 &&
      hm(fm, mkUnit(), mkUnit({ dots: [] }), 'basic', 1).length === 0))

    // day_one: start → RES mitigation buff on every living ally character
    const d1 = LT('day_one')
    const d1S = recSim({ allies: () => [mkUnit(), mkUnit(), mkUnit({ kind: 'summon' }), mkUnit({ dead: true })] })
    d1.onStart!(d1S.sim, mkUnit(), 1)
    const d1Res = d1S.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'day_one_res')
    cases.push(t.ok('day_one: onStart grants RES-mitigation to living ally characters only',
      d1Res.length === 2 && (d1Res[0][1] as { mods: { value: number }[] }).mods[0].value === 0.08))

    // patience: every attack stacks self SPD% (cap 3); hit vs non-Shocked enemy → Erode Shock DoT
    const pt = LT('patience')
    const ptS = recSim({ effAtk: () => 500 })
    atk(pt, ptS, mkUnit({ side: 'enemy', dots: [] }), 'basic', 1)
    ;(ptS.argsOf('applyDebuff')[0]?.[3] as (() => void) | undefined)?.()
    const ptS2 = recSim()
    atk(pt, ptS2, mkUnit({ side: 'enemy', dots: [{ kind: 'Shock' }] }), 'basic', 1)
    cases.push(t.ok('patience: onAfterAttack stacks self SPD% (cap 3) + Erode Shock DoT vs non-Shocked enemy',
      buffOf(ptS, 'patience_spd')?.mods[0]?.value === 0.048 && buffOf(ptS, 'patience_spd')?.maxStacks === 3 &&
      ptS.argsOf('applyDebuff').length === 1 && (ptS.argsOf('applyDot')[0]?.[1] as { baseDmg: number })?.baseDmg === 300 &&
      ptS2.argsOf('applyDebuff').length === 0))

    // post_op: ult → OutHeal buff
    const po = LT('post_op')
    const poS = recSim()
    po.onAfterUlt!(poS.sim, mkUnit(), 1, {})
    cases.push(t.ok('post_op: onAfterUlt grants OutHeal buff (SI-scaled)',
      buffOf(poS, 'post_op')?.mods[0]?.value === 0.12))

    // only_silence: CRIT Rate while ≤2 enemies alive
    const os = LT('only_silence')
    cases.push(t.ok('only_silence: hitMods CRIT Rate while ≤2 enemies alive (SI-scaled)',
      os.hitMods!(recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit()] }).sim, mkUnit(), mkUnit(), 'basic', 1)[0]?.value === 0.12 &&
      os.hitMods!(recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit(), mkUnit()] }).sim, mkUnit(), mkUnit(), 'basic', 1).length === 0))

    // genius_repose: kill → CRIT DMG buff
    const gr = LT('genius_repose')
    const grS = recSim()
    gr.onKill!(grS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('genius_repose: onKill grants CRIT DMG buff (SI-scaled)',
      buffOf(grS, 'genius_cd')?.mods[0]?.value === 0.24))

    // wildfire: start → mitigation + heal-to-full fraction on every living ally character
    const wf = LT('wildfire')
    const wfS = recSim({ allies: () => [mkUnit({ hp: 50, maxHp: 100 }), mkUnit({ kind: 'summon' })] })
    wf.onStart!(wfS.sim, mkUnit(), 1)
    const wfMit = wfS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'wildfire_mit')
    cases.push(t.ok('wildfire: onStart grants mitigation + restores a MaxHP-fraction to living ally characters',
      wfMit.length === 1 && (wfMit[0][1] as { mods: { value: number }[] }).mods[0].value === 0.08 && wfS.argsOf('heal')[0]?.[1] === 15))

    // perfect_timing: start → OutHeal derived from effRes, capped
    const ptm = LT('perfect_timing')
    const ptmS = recSim()
    ptm.onStart!(ptmS.sim, mkUnit({ buffs: [{ mods: [{ stat: 'effRes', value: 1.0 }] }] }), 1)
    cases.push(t.ok('perfect_timing: onStart OutHeal = 33%×effRes, capped',
      Math.abs(((buffOf(ptmS, 'perfect_timing_ohb')?.mods[0]?.value) ?? 0) - 0.15) < 1e-9))

    // subscribe: Basic/Skill boost, doubled at full Energy
    const sub = LT('subscribe')
    const sbBasic = sub.hitMods!(recSim().sim, mkUnit({ energy: 0, maxEnergy: 100 }), mkUnit(), 'basic', 1)
    const sbFull = sub.hitMods!(recSim().sim, mkUnit({ energy: 100, maxEnergy: 100 }), mkUnit(), 'basic', 1)
    const sbFua = sub.hitMods!(recSim().sim, mkUnit(), mkUnit(), 'fua', 1)
    cases.push(t.ok('subscribe: hitMods Basic/Skill boost, doubled at full Energy (SI-scaled)',
      sbBasic[0]?.stat === 'boost:basic' && sbBasic[0]?.value === 0.24 && Math.abs((sbFull[0]?.value ?? 0) - 0.48) < 1e-9 && sbFua.length === 0))
  }

  // ================================================================ batch 8: onAfterUlt / onAllyHpLoss / onShieldProvide / onSpSpend
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number; stacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, u as never, target as never, type, si)

    // night_of_fright: ult → ATK% buff on the lowest-HP-ratio ally char
    const nof = LT('night_of_fright')
    const lo = mkUnit({ hp: 10, maxHp: 100 }), hi = mkUnit({ hp: 80, maxHp: 100 })
    const nofS = recSim({ allies: () => [hi, lo] })
    nof.onAfterUlt!(nofS.sim, mkUnit(), 1, {})
    cases.push(t.ok('night_of_fright: onAfterUlt buffs the lowest-HP-ratio ally (cap 5 stacks)',
      nofS.argsOf('addBuff')[0]?.[0] === lo && buffOf(nofS, 'nof_atk')?.mods[0]?.value === 0.024 && buffOf(nofS, 'nof_atk')?.maxStacks === 5))

    // earthly_escapade: ult → Mask on the ally with the highest CRIT DMG
    const ee = LT('earthly_escapade')
    const e1 = mkUnit(), e2 = mkUnit()
    const eeS = recSim({ allies: () => [e1, e2], effCritDmg: (x: unknown) => (x === e2 ? 2 : 1) })
    ee.onAfterUlt!(eeS.sim, mkUnit(), 1, {})
    cases.push(t.ok('earthly_escapade: onAfterUlt gives Mask (CRIT DMG + Rate) to the highest-CRIT-DMG ally',
      eeS.argsOf('addBuff')[0]?.[0] === e2 && buffOf(eeS, 'mask')?.mods[0]?.value === 0.28 && buffOf(eeS, 'mask')?.mods[1]?.value === 0.10))

    // planetary: start → DMG% buff to same-element allies other than the wearer
    const pl = LT('planetary')
    const plMatch = mkUnit({ id: 'x', elem: 'Fire' }), plSelf = mkUnit({ id: 'me', elem: 'Fire' }), plDiff = mkUnit({ id: 'y', elem: 'Ice' })
    const plS = recSim({ allies: () => [plMatch, plDiff, plSelf] })
    pl.onStart!(plS.sim, plSelf, 1)
    cases.push(t.ok('planetary: onStart grants DMG% to same-element allies excluding the wearer',
      plS.argsOf('addBuff').length === 1 && plS.argsOf('addBuff')[0]?.[0] === plMatch && buffOf(plS, 'rendezvous')?.mods[0]?.value === 0.12))

    // though_worlds_apart: ult → heal all ally chars (lowest gets double) + Redoubt DMG%, extra if an ally owns a summon
    const twa = LT('though_worlds_apart')
    const twaA = mkUnit({ id: 'A', hp: 50, maxHp: 100 }), twaB = mkUnit({ id: 'B', hp: 90, maxHp: 100 })
    const twaSumm = mkUnit({ side: 'ally', kind: 'summon', dead: false })
    const twaS = recSim({ allies: () => [twaA, twaB], effAtk: () => 1000, units: () => [twaSumm], rt: (x: unknown) => (x === twaSumm ? { ownerId: 'A' } : {}) })
    twa.onAfterUlt!(twaS.sim, mkUnit(), 1, {})
    const twaRedoubt = twaS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'twa_redoubt')
    const redoubtOf = (unit: unknown) => (twaRedoubt.find(a => a[0] === unit)?.[1] as { mods: { value: number }[] } | undefined)?.mods[0].value
    cases.push(t.ok('though_worlds_apart: onAfterUlt heals ally chars (lowest doubled) + Redoubt, extra for summon owner',
      twaRedoubt.length === 2 && redoubtOf(twaA) === 0.36 && redoubtOf(twaB) === 0.24 &&
      twaS.argsOf('heal').find(a => a[0] === twaA)?.[1] === 200 && twaS.argsOf('heal').find(a => a[0] === twaB)?.[1] === 100))

    // shut_her_eyes: HP loss tracked per ally; wearer's loss → party DMG% buff; wave start → heal fraction of tracked loss
    const she = LT('shut_her_eyes')
    const sheW = mkUnit({ id: 'W', side: 'ally' }), sheX = mkUnit({ id: 'X', side: 'ally' })
    const sheS = recSim({ allies: () => [sheW, sheX] })
    she.onAllyHpLoss!(sheS.sim, sheW, sheX, 40.4, 1)
    she.onAllyHpLoss!(sheS.sim, sheW, sheW, 20.6, 1)
    const sheAcc = ((sheS as unknown as { rt: (u: object) => Record<string, number> }).rt(sheX).sheLost) === 40 && ((sheS as unknown as { rt: (u: object) => Record<string, number> }).rt(sheW).sheLost) === 21
    const sheThe = sheS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'she_the')
    she.onWaveStart!(sheS.sim, sheW, 1)
    const sheHeals = sheS.argsOf('heal').map(a => a[1])
    cases.push(t.ok('shut_her_eyes: onAllyHpLoss tracks per-ally loss, buffs party on wearer loss; onWaveStart heals tracked fraction',
      sheAcc && sheThe.length === 2 && (sheThe[0][1] as { mods: { value: number }[] }).mods[0].value === 0.09 &&
      sheHeals.includes(32) && sheHeals.includes(17)))

    // unjust_destiny: shield → CRIT DMG buff; FUA → Unfair Advantage vulnerability on target only
    const ud = LT('unjust_destiny')
    const udS = recSim()
    ud.onShieldProvide!(udS.sim, mkUnit(), mkUnit(), 1)
    const udF = recSim(), udB = recSim()
    atk(ud, udF, mkUnit(), mkUnit({ side: 'enemy' }), 'fua', 1)
    atk(ud, udB, mkUnit(), mkUnit({ side: 'enemy' }), 'basic', 1)
    cases.push(t.ok('unjust_destiny: onShieldProvide CRIT DMG buff; onAfterAttack FUA applies Unfair Advantage only',
      buffOf(udS, 'unjust_cd')?.mods[0]?.value === 0.40 && udF.argsOf('applyDebuff').length === 1 && udB.argsOf('applyDebuff').length === 0))

    // time_woven_gold: Basic boost at 6 Brocade stacks; owner attack stacks Brocade (capped 6)
    const twg = LT('time_woven_gold')
    const hmB = twg.hitMods!(recSim().sim, mkUnit({ buffs: [{ id: 'brocade', stacks: 6, mods: [] }] }), mkUnit(), 'basic', 1)
    const hmS = twg.hitMods!(recSim().sim, mkUnit({ buffs: [{ id: 'brocade', stacks: 6, mods: [] }] }), mkUnit(), 'skill', 1)
    const twgU = mkUnit({ id: 'W', buffs: [] })
    const twgS = recSim({ units: () => [] })
    twg.onAllyAttack!(twgS.sim, twgU, twgU, mkUnit(), 'basic', 1)
    cases.push(t.ok('time_woven_gold: hitMods Basic boost at 6 Brocade stacks; onAllyAttack (owner) stacks Brocade',
      Math.abs((hmB[0]?.value ?? 0) - 0.54) < 1e-9 && hmS.length === 0 && twgS.argsOf('removeBuff').some(a => a[1] === 'brocade') &&
      buffOf(twgS, 'brocade')?.stacks === 1 && Math.abs(((buffOf(twgS, 'brocade')?.mods[0]?.value) ?? 0) - 0.09) < 1e-9))

    // in_the_name: hitMods vs DoT/debuffed target; SP spend → EHR buff; skill consumes EHR buff for ATK%
    const itn = LT('in_the_name')
    const hmDot = itn.hitMods!(recSim().sim, mkUnit(), mkUnit({ dots: [{ kind: 'Burn' }] }), 'basic', 1)
    const hmDeb = itn.hitMods!(recSim().sim, mkUnit(), mkUnit({ buffs: [{ mods: [{ stat: 'defRed', value: -0.1 }] }] }), 'basic', 1)
    const hmNo = itn.hitMods!(recSim().sim, mkUnit(), mkUnit({ buffs: [{ mods: [{ stat: 'atkPct', value: 0.1 }] }] }), 'basic', 1)
    const itnS = recSim(), itnK = recSim()
    itn.onSpSpend!(itnS.sim, mkUnit(), 1, 1)
    itn.onAfterSkill!(itnK.sim, mkUnit(), mkUnit(), 1, {})
    cases.push(t.ok('in_the_name: hitMods vs DoT/debuffed target + onSpSpend EHR buff + onAfterSkill converts it to ATK%',
      hmDot[0]?.value === 0.24 && hmDeb[0]?.value === 0.24 && hmNo.length === 0 &&
      buffOf(itnS, 'itnw_ehr')?.mods[0]?.value === 0.18 && itnK.argsOf('removeBuff').some(a => a[1] === 'itnw_ehr') && buffOf(itnK, 'itnw_atk')?.mods[0]?.value === 0.24))

    // worrisome: FUA → Tame (CRIT-DMG-taken) on target
    const wo = LT('worrisome')
    const woF = recSim(), woB = recSim()
    atk(wo, woF, mkUnit(), mkUnit({ side: 'enemy' }), 'fua', 1)
    atk(wo, woB, mkUnit(), mkUnit({ side: 'enemy' }), 'basic', 1)
    ;(woF.argsOf('applyDebuff')[0]?.[3] as (() => void) | undefined)?.()
    const woBuff = woF.argsOf('addBuff')[0]?.[1] as { mods: { stat: string; value: number }[] } | undefined
    cases.push(t.ok('worrisome: onAfterAttack (FUA) applies Tame CRIT-DMG-taken to the target',
      woF.argsOf('applyDebuff').length === 1 && woB.argsOf('applyDebuff').length === 0 && woBuff?.mods[0]?.stat === 'critDmgTaken:basic' && woBuff?.mods[0]?.value === 0.12))

    // reforged in hellfire (reforged): unique DoT kinds → stacking ATK% (cap 4)
    const re = LT('reforged')
    const reU = mkUnit(), reS = recSim()
    re.onAfterAttack!(reS.sim, reU, mkUnit({ dots: [{ kind: 'Burn' }] }), 'basic', 1)
    const reOne = buffOf(reS, 'prophet_atk')?.mods[0]?.value
    re.onAfterAttack!(reS.sim, reU, mkUnit({ dots: [{ kind: 'Burn' }] }), 'basic', 1)
    re.onAfterAttack!(reS.sim, reU, mkUnit({ dots: [{ kind: 'Bleed' }] }), 'basic', 1)
    const reAdds = reS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'prophet_atk')
    cases.push(t.ok('reforged: onAfterAttack counts unique DoT kinds into a stacking ATK% buff (cap 4)',
      reOne === 0.072 && reAdds.length === 2 && Math.abs(((reAdds[1][1] as { mods: { value: number }[] }).mods[0].value) - 0.144) < 1e-9))

    // if_time: start → energy + Presage CRIT DMG to allies; FUA → energy + Presage again
    const ift = LT('if_time')
    const iftS = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    ift.onStart!(iftS.sim, mkUnit(), 1)
    const iftF = recSim({ allies: () => [mkUnit()] })
    atk(ift, iftF, mkUnit(), mkUnit(), 'fua', 1)
    atk(ift, iftF, mkUnit(), mkUnit(), 'basic', 1)
    cases.push(t.ok('if_time: onStart energy+Presage; onAfterAttack FUA → energy + Presage to ally chars',
      iftS.argsOf('gainEnergyFlat')[0]?.[1] === 21 && buffOf(iftS, 'presage')?.mods[0]?.value === 0.48 &&
      iftF.argsOf('gainEnergyFlat')[0]?.[1] === 12 && iftF.argsOf('gainEnergyFlat').length === 1 && buffOf(iftF, 'presage')?.mods[0]?.value === 0.48))

    // flame_blood: Skill/Ult hit gains DMG%, doubled when MaxHP consumption exceeds 500
    const fb = LT('flame_blood')
    const fbS = fb.hitMods!(recSim().sim, mkUnit({ maxHp: 1000 }), mkUnit(), 'skill', 1)
    const fbB = fb.hitMods!(recSim().sim, mkUnit({ maxHp: 10000 }), mkUnit(), 'skill', 1)
    const fbX = fb.hitMods!(recSim().sim, mkUnit({ maxHp: 10000 }), mkUnit(), 'basic', 1)
    cases.push(t.ok('flame_blood: hitMods Skill/Ult DMG%, doubled when MaxHP consumption exceeds 500',
      fbS[0]?.value === 0.30 && fbB[0]?.value === 0.60 && fbX.length === 0))

    // lies_breeze: attack → Bamboozle on all enemies; +Theft when SPD ≥ 170
    const lb = LT('lies_breeze')
    const lbSlow = mkUnit({ base: { hp: 1, atk: 1, def: 1, spd: 100 } })
    const lbFast = mkUnit({ base: { hp: 1, atk: 1, def: 1, spd: 200 } })
    const lbS = recSim({ allies: (s: string) => (s === 'enemy' ? [mkUnit({ side: 'enemy' }), mkUnit({ side: 'enemy' })] : []) })
    const lbS2 = recSim({ allies: (s: string) => (s === 'enemy' ? [mkUnit({ side: 'enemy' })] : []) })
    lb.onAfterAttack!(lbS.sim, lbSlow, mkUnit(), 'basic', 1)
    lb.onAfterAttack!(lbS2.sim, lbFast, mkUnit(), 'basic', 1)
    cases.push(t.ok('lies_breeze: onAfterAttack Bamboozle on all enemies, +Theft when wearer SPD ≥ 170',
      lbS.argsOf('applyDebuff').length === 2 && lbS2.argsOf('applyDebuff').length === 2))

    // thus_burns: ult → Blazing Sun DMG% buff; turn start removes it
    const tb = LT('thus_burns')
    const tbS = recSim()
    tb.onAfterUlt!(tbS.sim, mkUnit(), 1, {})
    const tbT = recSim(), tbT2 = recSim()
    tb.onTurnStart!(tbT.sim, mkUnit({ buffs: [{ id: 'blazing_sun', mods: [] }] }), 1)
    tb.onTurnStart!(tbT2.sim, mkUnit({ buffs: [] }), 1)
    cases.push(t.ok('thus_burns: onAfterUlt grants Blazing Sun DMG%; onTurnStart removes it',
      buffOf(tbS, 'blazing_sun')?.mods[0]?.value === 0.60 && tbT.argsOf('removeBuff').some(a => a[1] === 'blazing_sun') && tbT2.argsOf('removeBuff').length === 0))
  }

  // ================================================================ batch 9: onAfterBreak / onAllyHeal / onNonCrit / onElationSkill
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number; stacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, u as never, target as never, type, si)

    // milkyway: attack re-counts living enemies into an ATK% buff (cap 5); break → DMG% buff
    const mw = LT('milkyway')
    const mwS = recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit(), mkUnit()] })
    atk(mw, mwS, mkUnit(), mkUnit(), 'basic', 1)
    const mwBr = recSim()
    mw.onAfterBreak!(mwBr.sim, mkUnit(), mkUnit({ side: 'enemy' }), 1)
    cases.push(t.ok('milkyway: onAfterAttack counts living enemies into ATK% (cap 5); onAfterBreak grants DMG%',
      buffOf(mwS, 'milkyway_atk')?.mods[0]?.value === 0.27 && mwS.argsOf('removeBuff').some(a => a[1] === 'milkyway_atk') &&
      buffOf(mwBr, 'milkyway_break')?.mods[0]?.value === 0.30))

    // milkyway (cap): 6 living enemies clamp to 5 stacks
    const mwS2 = recSim({ livingEnemiesOf: () => [mkUnit(), mkUnit(), mkUnit(), mkUnit(), mkUnit(), mkUnit()] })
    atk(mw, mwS2, mkUnit(), mkUnit(), 'basic', 1)
    cases.push(t.ok('milkyway: hit-cap clamps enemy count to 5',
      Math.abs((buffOf(mwS2, 'milkyway_atk')?.mods[0]?.value ?? 0) - 0.45) < 1e-9))

    // echo_coffin: ult → SPD to ally chars; attack → energy per NEW enemy hit (once per turn)
    const ec = LT('echo_coffin')
    const ecU = mkUnit({ id: 'E' })
    const ecE1 = mkUnit({ side: 'enemy', id: 'e1' }), ecE2 = mkUnit({ side: 'enemy', id: 'e2' })
    const ecS1 = recSim({ allies: () => [], turnCount: { get: () => 1 } as never })
    ec.onAfterAttack!(ecS1.sim, ecU, ecE1, 'basic', 1)
    ec.onAfterAttack!(ecS1.sim, ecU, ecE1, 'basic', 1)
    ec.onAfterAttack!(ecS1.sim, ecU, ecE2, 'basic', 1)
    const ecS2 = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    ec.onAfterUlt!(ecS2.sim, ecU, 1, {})
    cases.push(t.ok('echo_coffin: onAfterAttack grants Energy per new enemy hit only (once per turn); onAfterUlt SPD to ally chars',
      ecS1.argsOf('gainEnergyFlat').length === 2 && ecS1.argsOf('gainEnergyFlat').every(a => a[1] === 3) &&
      ecS2.argsOf('addBuff').length === 1 && buffOf(ecS2, 'coffin_spd')?.mods[0]?.value === 12))

    // epoch_etched: skill on ally char → Skill DMG buff; ult → +1 SP
    const ep = LT('epoch_etched')
    const epAlly = mkUnit({ side: 'ally', kind: 'char' })
    const epS = recSim()
    ep.onAfterSkill!(epS.sim, mkUnit({ side: 'ally' }), epAlly, 1, {})
    const epS2 = recSim()
    ep.onAfterSkill!(epS2.sim, mkUnit({ side: 'ally' }), mkUnit({ side: 'enemy' }), 1, {})
    const epU = recSim()
    ep.onAfterUlt!(epU.sim, mkUnit(), 1, {})
    cases.push(t.ok('epoch_etched: onAfterSkill Skill-DMG buff only when targeting an ally char; onAfterUlt gains 1 SP',
      epS.argsOf('addBuff').length === 1 && buffOf(epS, 'epoch_sb')?.mods[0]?.value === 0.54 && epS2.argsOf('addBuff').length === 0 && epU.argsOf('gainSp').length === 1))

    // grounded_ascent: Skill OR Ult on ONE ally char → Hymn (DMG buff) + wearer energy, every 2nd SP refund.
    // Regression: onAfterSkill used to receive sim.lastHitTarget (DamagePipeline sets it to a hit ENEMY only),
    // so the ally-target branch never fired in a real battle. Now it resolves the actual ally target.
    const ga = (gear?: GearConfig) => run({
      team: [
        party('bronya', gear, { path: 'Harmony', skillPriority: 2 }),
        party('seele', undefined, { stats: S() }),
      ],
      enemy: mob(), cycles: 6,
    })
    const gaCone = ga({ coneId: 'grounded_ascent', si: 1 })
    const gaNone = ga()
    cases.push(t.ok('grounded_ascent onAfterSkill: Skilling an ally char grants Hymn (DMG buff) in a real battle',
      (ids(gaCone)['hymn'] ?? 0) >= 1 && (ids(gaNone)['hymn'] ?? 0) === 0,
      `cone=${ids(gaCone)['hymn'] ?? 0} bare=${ids(gaNone)['hymn'] ?? 0}`))
    cases.push(t.ok('grounded_ascent SI scales the Hymn buff (S1 0.15 → S5 0.24)',
      val(gaCone, 'hymn', 'dmgAll') === 0.15 && val(ga({ coneId: 'grounded_ascent', si: 5 }), 'hymn', 'dmgAll') === 0.24,
      `S1=${val(gaCone, 'hymn', 'dmgAll')} S5=${val(ga({ coneId: 'grounded_ascent', si: 5 }), 'hymn', 'dmgAll')}`))
    {
      const hook = LIGHT_CONES.find(c => c.id === 'grounded_ascent')!
      const ctx: Record<string, unknown> = {}
      const sp: number[] = []
      const stub = { rt: (_u: unknown) => ctx, addBuff: (_t: unknown) => {}, gainEnergyFlat: (_u: unknown, n: number) => ctx.energy = n, gainSp: (n: number) => sp.push(n) }
      hook.onStart!(stub as never, {} as never, 1)
      const seeded = ctx.groundedUses
      hook.onAfterSkill!(stub as never, mkUnit({ side: 'ally' }), mkUnit({ side: 'ally', kind: 'char' }), 1, {})
      hook.onAfterSkill!(stub as never, mkUnit({ side: 'ally' }), mkUnit({ side: 'ally', kind: 'char' }), 1, {})
      cases.push(t.ok('grounded_ascent onStart/grAsc counter: every 2nd ally-target cast refunds 1 SP',
        seeded === 0 && ctx.groundedUses === 2 && sp.join(',') === '1',
        `seed=${seeded} uses=${ctx.groundedUses} sp=${sp.join('|')}`))
    }
    {
      const hook = LIGHT_CONES.find(c => c.id === 'grounded_ascent')!
      const allyTarget = recSim({ lastAbilityTarget: { kind: 'char', side: 'ally' } })
      hook.onAfterUlt!(allyTarget.sim, mkUnit({ side: 'ally' }), 1, {})
      const enemyTarget = recSim({ lastAbilityTarget: { kind: 'char', side: 'enemy' } })
      hook.onAfterUlt!(enemyTarget.sim, mkUnit({ side: 'ally' }), 1, {})
      const teamTarget = recSim({ lastAbilityTarget: 'team' })
      hook.onAfterUlt!(teamTarget.sim, mkUnit({ side: 'ally' }), 1, {})
      const noneTarget = recSim({ lastAbilityTarget: undefined })
      hook.onAfterUlt!(noneTarget.sim, mkUnit({ side: 'ally' }), 1, {})
      cases.push(t.ok('grounded_ascent onAfterUlt: Hymn on an ally char only, not enemy/team/undefined target',
        allyTarget.argsOf('addBuff').length === 1 && buffOf(allyTarget, 'hymn')?.mods[0]?.value === 0.15 &&
        enemyTarget.argsOf('addBuff').length === 0 && teamTarget.argsOf('addBuff').length === 0 && noneTarget.argsOf('addBuff').length === 0))
    }

    // long_road: break → Charring vulnerability (cap 2 stacks)
    const lr = LT('long_road')
    const lrS = recSim()
    lr.onAfterBreak!(lrS.sim, mkUnit(), mkUnit({ side: 'enemy' }), 1)
    ;(lrS.argsOf('applyDebuff')[0]?.[3] as (() => void) | undefined)?.()
    cases.push(t.ok('long_road: onAfterBreak applies Charring vulnerability (cap 2 stacks)',
      lrS.argsOf('applyDebuff').length === 1 && buffOf(lrS, 'charring')?.mods[0]?.value === 0.18 && buffOf(lrS, 'charring')?.maxStacks === 2))

    // what_is_real: Basic → self heal (2% MaxHP + 800)
    const wr = LT('what_is_real')
    const wrS = recSim()
    atk(wr, wrS, mkUnit({ maxHp: 2000 }), mkUnit(), 'basic', 1)
    cases.push(t.ok('what_is_real: onAfterAttack (Basic) self-heals 2% MaxHP + 800',
      wrS.argsOf('heal').length === 1 && wrS.argsOf('heal')[0]?.[1] === 840))

    // past_future: skill → DMG% buff to the next ally char (lowest AV, excluding wearer)
    const pf = LT('past_future')
    const pfU = mkUnit({ id: 'W', side: 'ally' })
    const pfNext = mkUnit({ id: 'N', side: 'ally', kind: 'char', av: 42, dead: false })
    const pfFar = mkUnit({ id: 'F', side: 'ally', kind: 'char', av: 9, dead: false })
    const pfS = recSim({ units: () => [pfU, pfNext, pfFar] })
    pf.onAfterSkill!(pfS.sim, pfU, mkUnit(), 1, {})
    cases.push(t.ok('past_future: onAfterSkill buffs the next ally char by lowest AV (excludes wearer)',
      pfS.argsOf('addBuff')[0]?.[0] === pfFar && buffOf(pfS, 'past_future')?.mods[0]?.value === 0.16))

    // sleep_like_dead: non-crit hit → CRIT Rate buff
    const sld = LT('sleep_like_dead')
    const sldS = recSim()
    sld.onNonCrit!(sldS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('sleep_like_dead: onNonCrit replaces its CRIT Rate buff',
      sldS.argsOf('removeBuff').some(a => a[1] === 'sld_cr') && buffOf(sldS, 'sld_cr')?.mods[0]?.value === 0.36))

    // time_waits: outgoing heal tallied; next ally attack → Additional DMG (once per battle turn)
    const tw = LT('time_waits')
    const twU = mkUnit({ id: 'W', side: 'ally', elem: 'Ice' })
    const twEnemy = mkUnit({ side: 'enemy' })
    const twS = recSim({ allies: (s: string) => (s === 'enemy' ? [twEnemy] : []), battleTurn: 1, rngPick: (p: unknown[]) => p[0] })
    tw.onAllyHeal!(twS.sim, twU, mkUnit(), 100, 1, twU)
    tw.onAllyHeal!(twS.sim, twU, mkUnit(), 50, 1, mkUnit())
    tw.onAllyAttack!(twS.sim, twU, mkUnit(), mkUnit(), 'basic', 1)
    tw.onAllyAttack!(twS.sim, twU, mkUnit(), mkUnit(), 'basic', 1)
    const twHit = twS.argsOf('hit')[0]?.[2] as { flat: number } | undefined
    cases.push(t.ok('time_waits: onAllyHeal (own) tallies; onAllyAttack fires one Additional-DMG hit per battle turn',
      twS.argsOf('hit').length === 1 && Math.abs((twHit?.flat ?? 0) - 36) < 1e-9))

    // secret_vow: hitMods DMG% when the target has a higher HP ratio than the wearer
    const sv = LT('secret_vow')
    const svU = mkUnit({ hp: 50, maxHp: 100 })
    const svHi = sv.hitMods!(recSim().sim, svU, mkUnit({ hp: 90, maxHp: 100 }), 'basic', 1)
    const svLo = sv.hitMods!(recSim().sim, svU, mkUnit({ hp: 10, maxHp: 100 }), 'basic', 1)
    cases.push(t.ok('secret_vow: hitMods DMG% only when the target HP ratio exceeds the wearer\'s',
      svHi[0]?.value === 0.20 && svLo.length === 0))

    // victory_blink: memosprite (owned by wearer) heals → party DMG% buff
    const vb = LT('victory_blink')
    const vbU = mkUnit({ id: 'W', side: 'ally' })
    const vbSumm = mkUnit({ kind: 'summon' })
    const vbS = recSim({ allies: (s: string) => (s === 'ally' ? [mkUnit(), mkUnit({ kind: 'summon' })] : []), rt: (x: unknown) => (x === vbSumm ? { ownerId: 'W' } : {}) })
    vb.onAllyHeal!(vbS.sim, vbU, mkUnit(), 10, 1, vbSumm)
    const vbOther = recSim({ allies: () => [mkUnit()], rt: () => ({ ownerId: 'X' }) })
    vb.onAllyHeal!(vbOther.sim, vbU, mkUnit(), 10, 1, vbSumm)
    cases.push(t.ok('victory_blink: onAllyHeal from a wearer-owned summon buffs ally chars; foreign summon does not',
      vbS.argsOf('addBuff').length === 1 && buffOf(vbS, 'blink_dmg')?.mods[0]?.value === 0.08 && vbOther.argsOf('addBuff').length === 0))

    // today_good_luck: Elation skill → stacking Elation DMG buff (cap 2)
    const tgl = LT('today_good_luck')
    const tglS = recSim()
    tgl.onElationSkill!(tglS.sim, mkUnit(), 1)
    cases.push(t.ok('today_good_luck: onElationSkill grants a stacking Elation DMG buff (cap 2)',
      buffOf(tglS, 'tgl_elation')?.mods[0]?.value === 0.12 && buffOf(tglS, 'tgl_elation')?.maxStacks === 2))

    // passkey: skill → Energy
    const pk = LT('passkey')
    const pkS = recSim()
    pk.onAfterSkill!(pkS.sim, mkUnit(), mkUnit(), 1, {})
    cases.push(t.ok('passkey: onAfterSkill grants Energy', pkS.argsOf('gainEnergyFlat')[0]?.[1] === 8))

    // hidden_shadow: skill primes a multiplier; next Basic consumes it for Additional DMG
    const hs = LT('hidden_shadow')
    const hsU = mkUnit()
    const hsS = recSim()
    hs.onAfterSkill!(hsS.sim, hsU, mkUnit(), 1, {})
    hs.onAfterAttack!(hsS.sim, hsU, mkUnit({ side: 'enemy' }), 'basic', 1)
    hs.onAfterAttack!(hsS.sim, hsU, mkUnit({ side: 'enemy' }), 'basic', 1)
    cases.push(t.ok('hidden_shadow: onAfterSkill primes a mult; next Basic consumes it for Additional DMG',
      hsS.argsOf('hit').length === 1 && (hsS.argsOf('hit')[0]?.[2] as { mult: number }).mult === 0.60))

    // mediation: start → SPD buff to ally chars
    const md = LT('mediation')
    const mdS = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    md.onStart!(mdS.sim, mkUnit(), 1)
    cases.push(t.ok('mediation: onStart grants SPD to ally chars only',
      mdS.argsOf('addBuff').length === 1 && buffOf(mdS, 'mediation_spd')?.mods[0]?.value === 12))
  }

  // ================================================================ batch 10: onMemosprite* / onKill / hitMods (Burn/Bleed, HP-gated)
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number; stacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, u as never, target as never, type, si)
    const hm = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.hitMods!(sim.sim, u as never, target as never, type, si)

    // sagacity: ult → ATK% buff
    const sg = LT('sagacity'), sgS = recSim()
    sg.onAfterUlt!(sgS.sim, mkUnit(), 1, {})
    cases.push(t.ok('sagacity: onAfterUlt grants a 2-turn ATK% buff', buffOf(sgS, 'sag_atk')?.mods[0]?.value === 0.24))

    // shadowburn: first memosprite summon only → +1 SP + Energy
    const sb = LT('shadowburn'), sbU = mkUnit(), sbS = recSim()
    sb.onMemospriteSummon!(sbS.sim, sbU, 1)
    sb.onMemospriteSummon!(sbS.sim, sbU, 1)
    cases.push(t.ok('shadowburn: onMemospriteSummon fires once (+1 SP + Energy), not on later summons',
      sbS.argsOf('gainSp').length === 1 && sbS.argsOf('gainEnergyFlat').length === 1 && sbS.argsOf('gainEnergyFlat')[0]?.[1] === 12))

    // reminiscence: memosprite turn start → Commemoration on wearer + owned summons; disappear → removed
    const rm = LT('reminiscence')
    const rmU = mkUnit({ id: 'W', side: 'ally' })
    const rmOwn = mkUnit({ side: 'ally', kind: 'summon', dead: false })
    const rmOther = mkUnit({ side: 'ally', kind: 'summon', dead: false })
    const rmS = recSim({ units: () => [rmOwn, rmOther], rt: (x: unknown) => (x === rmOwn ? { ownerId: 'W' } : { ownerId: 'X' }) })
    rm.onMemospriteTurnStart!(rmS.sim, rmU, 1)
    const rmS2 = recSim({ units: () => [rmOwn, rmOther], rt: (x: unknown) => (x === rmOwn ? { ownerId: 'W' } : { ownerId: 'X' }) })
    rm.onMemospriteDisappear!(rmS2.sim, rmU, 1)
    cases.push(t.ok('reminiscence: memosprite turn start stacks Commemoration on wearer + owned summon; disappear removes it',
      rmS.argsOf('addBuff').length === 2 && buffOf(rmS, 'remem_comm')?.mods[0]?.value === 0.08 && buffOf(rmS, 'remem_comm')?.maxStacks === 4 &&
      rmS2.argsOf('removeBuff').length === 2 && rmS2.argsOf('removeBuff').every(a => a[1] === 'remem_comm')))

    // lingering_tear: hitMods gated on Punchline pool ≥ 10
    const lgr = LT('lingering_tear')
    const lgrHi = hm(lgr, recSim({ punchlinePool: () => 10 }), mkUnit(), mkUnit(), 'basic', 1)
    const lgrLo = hm(lgr, recSim({ punchlinePool: () => 9 }), mkUnit(), mkUnit(), 'basic', 1)
    cases.push(t.ok('lingering_tear: hitMods CRIT DMG only when the Punchline pool reaches 10',
      lgrHi[0]?.value === 0.20 && lgrLo.length === 0))

    // memories_past: Basic → Energy
    const mp = LT('memories_past'), mpS = recSim()
    atk(mp, mpS, mkUnit(), mkUnit(), 'basic', 1)
    atk(mp, mpS, mkUnit(), mkUnit(), 'skill', 1)
    cases.push(t.ok('memories_past: onAfterAttack (Basic only) grants Energy', mpS.argsOf('gainEnergyFlat').length === 1 && mpS.argsOf('gainEnergyFlat')[0]?.[1] === 4))

    // moles: Basic/Skill/Ult → stacking ATK% (cap 3)
    const mo = LT('moles'), moS = recSim()
    atk(mo, moS, mkUnit(), mkUnit(), 'basic', 1)
    atk(mo, moS, mkUnit(), mkUnit(), 'skill', 1)
    atk(mo, moS, mkUnit(), mkUnit(), 'add', 1)
    cases.push(t.ok('moles: onAfterAttack stacks ATK% for Basic/Skill/Ult only (cap 3)',
      moS.argsOf('addBuff').length === 2 && buffOf(moS, 'moles_atk')?.mods[0]?.value === 0.12 && buffOf(moS, 'moles_atk')?.maxStacks === 3))

    // birth_self: hitMods FUA vs target at ≤50% HP
    const bs = LT('birth_self')
    const bsLow = hm(bs, recSim(), mkUnit(), mkUnit({ hp: 40, maxHp: 100 }), 'fua', 1)
    const bsHigh = hm(bs, recSim(), mkUnit(), mkUnit({ hp: 90, maxHp: 100 }), 'fua', 1)
    const bsSkill = hm(bs, recSim(), mkUnit(), mkUnit({ hp: 40, maxHp: 100 }), 'skill', 1)
    cases.push(t.ok('birth_self: hitMods FUA DMG% only when the target is at ≤50% HP',
      bsLow[0]?.value === 0.24 && bsHigh.length === 0 && bsSkill.length === 0))

    // shared_feeling: after skill → Energy to each ally char
    const sf = LT('shared_feeling'), sfS = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    sf.onAfterSkill!(sfS.sim, mkUnit(), mkUnit(), 1, {})
    cases.push(t.ok('shared_feeling: onAfterSkill grants Energy to each ally char only',
      sfS.argsOf('gainEnergyFlat').length === 1 && sfS.argsOf('gainEnergyFlat')[0]?.[1] === 2))

    // clamor: start → Energy
    const cl = LT('clamor'), clS = recSim()
    cl.onStart!(clS.sim, mkUnit(), 1)
    cases.push(t.ok('clamor: onStart grants Energy', clS.argsOf('gainEnergyFlat')[0]?.[1] === 20))

    // blue_sky: kill → CRIT Rate buff
    const bl = LT('blue_sky'), blS = recSim()
    bl.onKill!(blS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('blue_sky: onKill grants a CRIT Rate buff', buffOf(blS, 'blue_sky_cr')?.mods[0]?.value === 0.12))

    // woof: hitMods vs Burn/Bleed target
    const wf = LT('woof')
    const wfBurn = hm(wf, recSim(), mkUnit(), mkUnit({ dots: [{ kind: 'Burn' }] }), 'basic', 1)
    const wfBleed = hm(wf, recSim(), mkUnit(), mkUnit({ dots: [{ kind: 'Bleed' }] }), 'basic', 1)
    const wfNone = hm(wf, recSim(), mkUnit(), mkUnit({ dots: [{ kind: 'Shock' }] }), 'basic', 1)
    cases.push(t.ok('woof: hitMods DMG% vs Burn/Bleed targets only',
      wfBurn[0]?.value === 0.16 && wfBleed[0]?.value === 0.16 && wfNone.length === 0))

    // breakfast: kill → stacking ATK% (cap 3)
    const bk = LT('breakfast'), bkS = recSim()
    bk.onKill!(bkS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('breakfast: onKill grants a stacking ATK% buff (cap 3)',
      buffOf(bkS, 'breakfast_atk')?.mods[0]?.value === 0.04 && buffOf(bkS, 'breakfast_atk')?.maxStacks === 3))

    // warmth: Basic/Skill → heal each ally char 2% MaxHP
    const wa = LT('warmth')
    const waAlly = mkUnit({ maxHp: 2000 })
    const waS = recSim({ allies: () => [waAlly, mkUnit({ kind: 'summon' })] })
    atk(wa, waS, mkUnit({ side: 'ally' }), mkUnit(), 'basic', 1)
    atk(wa, waS, mkUnit({ side: 'ally' }), mkUnit(), 'skill', 1)
    atk(wa, waS, mkUnit({ side: 'ally' }), mkUnit(), 'ult', 1)
    cases.push(t.ok('warmth: onAfterAttack (Basic/Skill) heals each ally char 2% MaxHP',
      waS.argsOf('heal').length === 2 && waS.argsOf('heal').every(a => a[0] === waAlly && a[1] === 40)))

    // meet_again: Basic/Skill → Additional DMG to a living enemy
    const ma = LT('meet_again')
    const maS = recSim({ livingEnemiesOf: () => [mkUnit({ side: 'enemy' })] })
    atk(ma, maS, mkUnit(), mkUnit(), 'basic', 1)
    atk(ma, maS, mkUnit(), mkUnit(), 'ult', 1)
    const maHit = maS.argsOf('hit')[0]?.[2] as { mult: number } | undefined
    cases.push(t.ok('meet_again: onAfterAttack (Basic/Skill) deals Additional DMG to a living enemy',
      maS.argsOf('hit').length === 1 && maHit?.mult === 0.48))
  }

  // ================================================================ batch 11: onCrit / onDebuffInflict / onHitTaken / onElationSkill / onTurnEnd
  {
    const buffOf = (r: ReturnType<typeof recSim>, id: string) => r.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number; stacks?: number }).find(b => b.id === id)
    const atk = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.onAfterAttack!(sim.sim, u as never, target as never, type, si)
    const hm = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.hitMods!(sim.sim, u as never, target as never, type, si)

    // this_is_me: hitMods Ult → DMG% from the wearer's DEF
    const tim = LT('this_is_me')
    const timU = mkUnit({ base: { hp: 1, atk: 1, def: 1000, spd: 100 }, defPct: 0 })
    const timUlt = hm(tim, recSim(), timU, mkUnit(), 'ult', 1)
    const timBasic = hm(tim, recSim(), timU, mkUnit(), 'basic', 1)
    cases.push(t.ok('this_is_me: hitMods Ult grants DMG% scaled by the wearer\'s DEF; non-Ult none',
      Math.abs((timUlt[0]?.value ?? 0) - 6) < 1e-9 && timBasic.length === 0))

    // return_dark: CRIT vs enemy → 16% chance dispels one buff, once per attack
    const rd = LT('return_dark')
    const rdS = recSim({ rng: () => 0, attackNo: () => 1 })
    const rdU = mkUnit()
    const rdTarget = mkUnit({ side: 'enemy', buffs: [{ id: 'b1', debuff: false, mods: [] }] })
    rd.onCrit!(rdS.sim, rdU, rdTarget, 1)
    rd.onCrit!(rdS.sim, rdU, rdTarget, 1)
    const rdFail = recSim({ rng: () => 0.99 })
    rd.onCrit!(rdFail.sim, mkUnit(), mkUnit({ side: 'enemy', buffs: [{ id: 'b1', debuff: false, mods: [] }] }), 1)
    cases.push(t.ok('return_dark: onCrit dispels one enemy buff on a successful roll, once per attack',
      rdS.argsOf('removeBuff').length === 1 && rdS.argsOf('removeBuff')[0]?.[1] === 'b1' && rdFail.argsOf('removeBuff').length === 0))

    // nowhere_run: kill → heal scaled by ATK
    const nr = LT('nowhere_run'), nrS = recSim({ effAtk: () => 1000 })
    nr.onKill!(nrS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('nowhere_run: onKill heals scaled by the wearer\'s ATK', nrS.argsOf('heal')[0]?.[1] === 120))

    // dreamville: Basic/Skill/Ult → each ally char gets a same-type DMG buff (non-stacking, most recent type)
    const dv = LT('dreamville')
    const dvS = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    atk(dv, dvS, mkUnit(), mkUnit(), 'skill', 1)
    cases.push(t.ok('dreamville: onAfterAttack grants allies a same-type DMG buff (replaces prior)',
      dvS.argsOf('removeBuff').some(a => a[1] === 'dreamville_child') && buffOf(dvS, 'dreamville_child')?.mods[0]?.stat === 'boost:skill' &&
      Math.abs((buffOf(dvS, 'dreamville_child')?.mods[0]?.value ?? 0) - 0.12) < 1e-9))

    // final_victor: crit → Good Fortune stacks (cap 4); cleared on turn start
    const fv = LT('final_victor'), fvS = recSim()
    fv.onCrit!(fvS.sim, mkUnit(), mkUnit(), 1)
    const fvT = recSim()
    fv.onTurnStart!(fvT.sim, mkUnit({ buffs: [{ id: 'good_fortune', mods: [] }] }), 1)
    cases.push(t.ok('final_victor: onCrit stacks Good Fortune CD (cap 4); onTurnStart clears it',
      buffOf(fvS, 'good_fortune')?.mods[0]?.value === 0.08 && buffOf(fvS, 'good_fortune')?.maxStacks === 4 && fvT.argsOf('removeBuff').some(a => a[1] === 'good_fortune')))

    // showtime: debuff inflict → Trick DMG buff (cap 3, 1 turn)
    const st = LT('showtime'), stS = recSim()
    st.onDebuffInflict!(stS.sim, mkUnit(), mkUnit(), 1)
    cases.push(t.ok('showtime: onDebuffInflict grants a stacking Trick DMG buff (cap 3)',
      buffOf(stS, 'showtime_trick')?.mods[0]?.value === 0.06 && buffOf(stS, 'showtime_trick')?.maxStacks === 3))

    // story_page: memosprite of wearer attacks → Outgoing-Heal buff on wearer + that summon
    const spg = LT('story_page')
    const spgU = mkUnit({ id: 'W', side: 'ally' })
    const spgSumm = mkUnit({ side: 'ally', kind: 'summon', dead: false })
    const spgS = recSim({ rt: (x: unknown) => (x === spgSumm ? { ownerId: 'W' } : {}) })
    spg.onAllyAttack!(spgS.sim, spgU, spgSumm, mkUnit(), 'basic', 1)
    const spgOther = recSim({ rt: () => ({ ownerId: 'X' }) })
    spg.onAllyAttack!(spgOther.sim, spgU, mkUnit({ kind: 'summon' }), mkUnit(), 'basic', 1)
    cases.push(t.ok('story_page: onAllyAttack from a wearer-owned summon buffs wearer + summon Outgoing Healing',
      spgS.argsOf('addBuff').length === 2 && spgS.argsOf('addBuff').every(a => (a[1] as { id: string }).id === 'story_ohb') && spgOther.argsOf('addBuff').length === 0))

    // mushy_shroomy: Elation skill → Elation-vulnerability on enemies
    const ms = LT('mushy_shroomy')
    const msS = recSim({ livingEnemiesOf: () => [mkUnit({ side: 'enemy' }), mkUnit({ side: 'enemy' })] })
    ms.onElationSkill!(msS.sim, mkUnit({ side: 'ally' }), 1)
    const msAdd = msS.argsOf('addBuff')
    cases.push(t.ok('mushy_shroomy: onElationSkill applies Elation-vulnerability to each enemy',
      msAdd.length === 2 && msAdd.every(a => (a[1] as { id: string }).id === 'shroomy_vuln') && (msAdd[0][1] as { mods: { stat: string }[] }).mods[0].stat === 'vulnElation'))

    // trend_universal_market: hit taken from enemy → Burn DoT scaled by wearer DEF
    const tum = LT('trend_universal_market')
    const tumU = mkUnit({ base: { hp: 1, atk: 1, def: 1000, spd: 100 } })
    const tumAtk = mkUnit({ side: 'enemy', dots: [] })
    const tumS = recSim()
    tum.onHitTaken!(tumS.sim, tumU, 1, tumAtk)
    ;(tumS.argsOf('applyDebuff')[0]?.[3] as (() => void) | undefined)?.()
    const tumNo = recSim()
    tum.onHitTaken!(tumNo.sim, tumU, 1, mkUnit({ side: 'ally' }))
    cases.push(t.ok('trend_universal_market: onHitTaken from an enemy applies a DEF-scaled Burn DoT',
      tumS.argsOf('applyDebuff').length === 1 && tumS.argsOf('applyDot').length === 1 && (tumS.argsOf('applyDot')[0]?.[1] as { baseDmg: number }).baseDmg === 400 && tumNo.argsOf('applyDebuff').length === 0))

    // fly_pink_tomorrow: only TB(Remembrance) gets party DMG + Basic boost
    const fpt = LT('fly_pink_tomorrow')
    const fptTB = mkUnit({ id: 'W', side: 'ally', kitId: 'trailblazer_remembrance', elem: 'Ice' })
    const fptS = recSim({ allies: () => [mkUnit(), mkUnit()] })
    fpt.onStart!(fptS.sim, fptTB, 1)
    const fptNon = recSim({ allies: () => [mkUnit(), mkUnit()] })
    fpt.onStart!(fptNon.sim, mkUnit({ kitId: 'other' }), 1)
    const fptHmTB = hm(fpt, recSim(), fptTB, mkUnit(), 'basic', 1)
    const fptHmOther = hm(fpt, recSim(), mkUnit({ kitId: 'other' }), mkUnit(), 'basic', 1)
    cases.push(t.ok('fly_pink_tomorrow: party DMG% (onStart) + Basic DMG% (hitMods) only for TB(Remembrance)',
      fptS.argsOf('addBuff').some(a => (a[1] as { id: string }).id === 'pink_dmg') && fptNon.argsOf('addBuff').length === 0 &&
      fptHmTB[0]?.value === 0.60 && fptHmOther.length === 0))

    // baptism_pure_thought: hitMods CRIT DMG from target debuff count; FUA + Disputation → DEF ignore
    const bpt = LT('baptism_pure_thought')
    const bptTarget = mkUnit({ buffs: [{ debuff: true, mods: [] }, { debuff: true, mods: [] }] })
    const bptPlain = hm(bpt, recSim({ hasBuff: () => false }), mkUnit(), bptTarget, 'ult', 1)
    const bptDisp = hm(bpt, recSim({ hasBuff: () => true }), mkUnit(), bptTarget, 'fua', 1)
    const bptS = recSim()
    bpt.onAfterUlt!(bptS.sim, mkUnit(), 1, {})
    cases.push(t.ok('baptism_pure_thought: hitMods CRIT DMG per target debuff (cap 3); FUA + Disputation → DEF ignore; onAfterUlt grants Disputation',
      bptPlain[0]?.value === 0.16 && bptPlain.length === 1 && bptDisp.length === 2 && bptDisp[1]?.value === 0.24 && buffOf(bptS, 'disputation')?.mods[0]?.value === 0.36))

    // flowing_nightglow: ally attack → Cantillation ER stacks; ult → Cadenza ATK + party DMG
    const fn = LT('flowing_nightglow')
    const fnS = recSim()
    fn.onAllyAttack!(fnS.sim, mkUnit(), mkUnit(), mkUnit(), 'basic', 1)
    const fnS2 = recSim({ allies: () => [mkUnit(), mkUnit()] })
    fn.onAfterUlt!(fnS2.sim, mkUnit(), 1, {})
    cases.push(t.ok('flowing_nightglow: onAllyAttack stacks Cantillation ER (cap 5); onAfterUlt removes it, grants Cadenza ATK% + party DMG%',
      buffOf(fnS, 'cantillation')?.mods[0]?.value === 0.03 && buffOf(fnS, 'cantillation')?.maxStacks === 5 &&
      fnS2.argsOf('removeBuff').some(a => a[1] === 'cantillation') && buffOf(fnS2, 'cadenza_atk')?.mods[0]?.value === 0.48 && fnS2.argsOf('addBuff').some(a => (a[1] as { id: string }).id === 'cadenza_dmg')))

    // venture_forth_hunt: FUA → Luminflux stacks (cap 2); Ult DEF ignore per stack; turn end −1
    const vf = LT('venture_forth_hunt')
    const vfU = mkUnit({ id: 'W', side: 'ally' })
    const vfS = recSim()
    vf.onAllyAttack!(vfS.sim, vfU, vfU, mkUnit(), 'fua', 1)
    vf.onAllyAttack!(vfS.sim, vfU, vfU, mkUnit(), 'fua', 1)
    vf.onAllyAttack!(vfS.sim, vfU, vfU, mkUnit(), 'fua', 1)
    vf.onAllyAttack!(vfS.sim, vfU, mkUnit(), mkUnit(), 'fua', 1)
    const vfUlt2 = hm(vf, vfS, vfU, mkUnit(), 'ult', 1)
    const vfBasic = hm(vf, vfS, vfU, mkUnit(), 'basic', 1)
    vf.onTurnEnd!(vfS.sim, vfU, 1)
    const vfUlt1 = hm(vf, vfS, vfU, mkUnit(), 'ult', 1)
    cases.push(t.ok('venture_forth_hunt: FUA stacks Luminflux (cap 2); Ult DEF ignore per stack; onTurnEnd decrements',
      Math.abs((vfUlt2[0]?.value ?? 0) - 0.54) < 1e-9 && vfBasic.length === 0 && Math.abs((vfUlt1[0]?.value ?? 0) - 0.27) < 1e-9))
  }

  // ---------------------------------------------------------------- batch 12
  {
    const buffOf = (sim: ReturnType<typeof recSim>, id: string) => sim.argsOf('addBuff').map(a => a[1] as { id: string; mods: { stat: string; value: number }[]; maxStacks?: number }).filter(b => b.id === id).pop()
    const hm = (c: (typeof LIGHT_CONES)[number], sim: ReturnType<typeof recSim>, u: unknown, target: unknown, type: DmgType, si: number) => c.hitMods!(sim.sim, u as never, target as never, type, si)

    // hell_ideals_burn: wave-1 SP-limit ATK buff; Skill stacking ATK buff (cap 4)
    const hib = LT('hell_ideals_burn')
    const hibS = recSim({ wave: 1, maxSp: 6 })
    hib.onWaveStart!(hibS.sim, mkUnit(), 1)
    const hibS2 = recSim({ wave: 2, maxSp: 6 })
    hib.onWaveStart!(hibS2.sim, mkUnit(), 1)
    const hibS3 = recSim()
    hib.onAfterSkill!(hibS3.sim, mkUnit(), mkUnit(), 1, {})
    cases.push(t.ok('hell_ideals_burn: onWaveStart SP-limit ATK% (wave 1, maxSp≥6); onAfterSkill stacking ATK% (cap 4)',
      buffOf(hibS, 'ideals_limit')?.mods[0]?.value === 0.40 && hibS2.argsOf('addBuff').length === 0 && buffOf(hibS3, 'ideals_atk')?.mods[0]?.value === 0.10 && buffOf(hibS3, 'ideals_atk')?.maxStacks === 4))

    // ocean_sing: 80% Enthrallment per wearer-debuff (DoT-taken stacks cap 6); ally attacking Enthralled → SPD%
    const os = LT('ocean_sing')
    const osU = mkUnit({ side: 'ally', base: { hp: 1, atk: 1, def: 1, spd: 100, ehr: 0 } })
    const osT = mkUnit({ side: 'enemy', id: 'E1', effectRes: 0 })
    const osS = recSim({ rng: () => 0 })
    os.onDebuffInflict!(osS.sim, osU, osT, 1)
    os.onDebuffInflict!(osS.sim, osU, osT, 1)
    const osFail = recSim({ rng: () => 0.99 })
    os.onDebuffInflict!(osFail.sim, osU, osT, 1)
    const osEnt = (s: ReturnType<typeof recSim>) => s.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'ocean_enthrall').map(a => (a[1] as { mods: { value: number }[] }).mods[0].value)
    const osA = recSim({ hasBuff: () => true })
    os.onAllyAttack!(osA.sim, osU, mkUnit(), mkUnit({ side: 'enemy' }), 'basic', 1)
    cases.push(t.ok('ocean_sing: onDebuffInflict 80% (fail on high roll) Enthrallment DoT-taken stacks cap 6; onAllyAttack SPD% vs Enthralled',
      osEnt(osS).length === 2 && Math.abs(osEnt(osS)[0] - 0.05) < 1e-9 && Math.abs(osEnt(osS)[1] - 0.10) < 1e-9 && osFail.argsOf('addBuff').length === 0 && buffOf(osA, 'ocean_spd')?.mods[0]?.value === 0.10))

    // evernight_stars: onStart enemy DEF-ignore; onMemospriteDisappear flat energy
    const es = LT('evernight_stars')
    const esS = recSim({ livingEnemiesOf: () => [mkUnit({ side: 'enemy' }), mkUnit({ side: 'enemy' })] })
    es.onStart!(esS.sim, mkUnit(), 1)
    const esD = recSim()
    es.onMemospriteDisappear!(esD.sim, mkUnit(), 1)
    cases.push(t.ok('evernight_stars: onStart DEF-ignore to every enemy; onMemospriteDisappear flat energy',
      esS.argsOf('addBuff').length === 2 && (esS.argsOf('addBuff')[0][1] as { mods: { stat: string }[] }).mods[0].stat === 'defIgnore' && esD.argsOf('gainEnergyFlat')[0]?.[1] === 8))

    // this_love_forever: memosprite Skill heal → Blank; memosprite Skill attack → Verse; both → ×1.6
    const tlf = LT('this_love_forever')
    const tlfU = mkUnit({ id: 'W', side: 'ally' })
    const summ = mkUnit({ side: 'ally', kind: 'summon' })
    const tlfSim = recSim({ allies: () => [mkUnit()], livingEnemiesOf: () => [mkUnit({ side: 'enemy' })] })
    tlfSim.rt(summ).ownerId = 'W'
    tlf.onAllyHeal!(tlfSim.sim, tlfU, mkUnit(), 100, 1, summ)
    const blank1 = buffOf(tlfSim, 'love_blank')?.mods[0]?.value
    tlf.onAllyAttack!(tlfSim.sim, tlfU, summ, mkUnit({ side: 'enemy' }), 'basic', 1, true)
    const blank2 = buffOf(tlfSim, 'love_blank')?.mods[0]?.value
    const verse = buffOf(tlfSim, 'love_verse')?.mods[0]?.value
    cases.push(t.ok('this_love_forever: memosprite-Skill heal→Blank vuln, memosprite-Skill attack→Verse CD, both ×1.6',
      Math.abs((blank1 ?? 0) - 0.10) < 1e-9 && Math.abs((blank2 ?? 0) - 0.16) < 1e-9 && Math.abs((verse ?? 0) - 0.256) < 1e-9))

    // when_she_decided_to_see: wave CR/R CD buff to party + flat energy; ult on ally re-applies
    const wsd = LT('when_she_decided_to_see')
    const wsdS = recSim({ allies: () => [mkUnit(), mkUnit({ kind: 'summon' })] })
    wsd.onWaveStart!(wsdS.sim, mkUnit({ side: 'ally' }), 1)
    const wsdS2 = recSim({ allies: () => [mkUnit()], lastAbilityTarget: { kind: 'char', side: 'ally' } })
    wsd.onAfterUlt!(wsdS2.sim, mkUnit({ side: 'ally' }), 1, {})
    const wsdS3 = recSim({ allies: () => [mkUnit()], lastAbilityTarget: { kind: 'char', side: 'enemy' } })
    wsd.onAfterUlt!(wsdS3.sim, mkUnit({ side: 'ally' }), 1, {})
    cases.push(t.ok('when_she_decided_to_see: onWaveStart party CRIT buff + 15 energy; onAfterUlt re-applies only for an ally target',
      (buffOf(wsdS, 'great_fortune')?.mods.length ?? 0) === 2 && wsdS.argsOf('gainEnergyFlat')[0]?.[1] === 15 && wsdS2.argsOf('addBuff').length > 0 && wsdS3.argsOf('addBuff').length === 0))

    // finale_of_a_lie: onStart Umbra; every 4th wearer FUA re-applies
    const fol = LT('finale_of_a_lie')
    const folS = recSim({ allies: () => [mkUnit()], livingEnemiesOf: () => [mkUnit({ side: 'enemy' })] })
    fol.onStart!(folS.sim, mkUnit({ side: 'ally' }), 1)
    const folU = mkUnit({ id: 'W', side: 'ally' })
    const folS2 = recSim({ allies: () => [mkUnit()], livingEnemiesOf: () => [mkUnit({ side: 'enemy' })] })
    for (let i = 0; i < 3; i++) fol.onAllyAttack!(folS2.sim, folU, folU, mkUnit({ side: 'enemy' }), 'fua', 1)
    const before4 = folS2.argsOf('addBuff').length
    fol.onAllyAttack!(folS2.sim, folU, folU, mkUnit({ side: 'enemy' }), 'fua', 1)
    fol.onAllyAttack!(folS2.sim, folU, folU, mkUnit({ side: 'enemy' }), 'basic', 1)
    cases.push(t.ok('finale_of_a_lie: onStart Umbra Devourer; every 4th wearer FUA re-applies (non-FUA ignored)',
      buffOf(folS, 'umbra_dev')?.mods[0]?.value === 0.40 && folS2.argsOf('addBuff').length === before4 + 2))

    // welcome_cosmic_city: hitMods Elation DEF-ignore; onAfterUlt Punchline
    const wcc = LT('welcome_cosmic_city')
    const wccS = recSim()
    wcc.onAfterUlt!(wccS.sim, mkUnit(), 1, {})
    cases.push(t.ok('welcome_cosmic_city: hitMods DEF-ignore only on Elation; onAfterUlt adds Punchline',
      hm(wcc, recSim(), mkUnit(), mkUnit(), 'elation', 1)[0]?.value === 0.20 && hm(wcc, recSim(), mkUnit(), mkUnit(), 'basic', 1).length === 0 && wccS.argsOf('gainPunchline')[0]?.[0] === 20))

    // until_flowers: mods CD + energyMax-scaled ERR; onElationSkill enemy vulnAll
    const uf = LT('until_flowers')
    const ufM1 = uf.mods!(1, { energyMax: 120 } as never)
    const ufM2 = uf.mods!(1, { energyMax: 480 } as never)
    const ufErr1 = ufM1.find(m => m.stat === 'err')?.value ?? 0
    const ufErr2 = ufM2.find(m => m.stat === 'err')?.value ?? 0
    const ufS = recSim({ livingEnemiesOf: () => [mkUnit({ side: 'enemy' })] })
    uf.onElationSkill!(ufS.sim, mkUnit(), 1)
    cases.push(t.ok('until_flowers: mods CD + ERR scaled by energyMax above 120; onElationSkill enemy vulnAll',
      (ufM1.find(m => m.stat === 'critDmg')?.value ?? 0) === 0.60 && Math.abs(ufErr1 - 0.10) < 1e-9 && Math.abs(ufErr2 - 0.208) < 1e-9 && buffOf(ufS, 'flowers_vuln')?.mods[0]?.value === 0.15))

    // flickering_stars: ally spends ≥4 SP → party DEF-ignore + wearer Skill DMG (3 turns)
    const fs = LT('flickering_stars')
    const fsS = recSim({ allies: () => [mkUnit(), mkUnit()] })
    fs.onTurnSpHigh!(fsS.sim, mkUnit({ side: 'ally' }), 4, 1)
    cases.push(t.ok('flickering_stars: onTurnSpHigh grants party DEF-ignore + wearer Skill DMG buff',
      fsS.argsOf('addBuff').some(a => (a[1] as { id: string }).id === 'crown_def') && buffOf(fsS, 'crown_skill')?.mods[0]?.value === 0.72))

    // rise_and_sing: onStart advance + party SPD%; onAfterUlt refund 1 SP
    const ras = LT('rise_and_sing')
    const rasS = recSim({ allies: () => [mkUnit()] })
    ras.onStart!(rasS.sim, mkUnit({ id: 'W', side: 'ally' }), 1)
    const rasU = recSim()
    ras.onAfterUlt!(rasU.sim, mkUnit(), 1, {})
    cases.push(t.ok('rise_and_sing: onStart self advance + party SPD%; onAfterUlt refunds 1 SP',
      rasS.argsOf('advance').length === 1 && Math.abs((rasS.argsOf('advance')[0]?.[1] as number) - 0.30) < 1e-9 && rasS.argsOf('addBuff').some(a => (a[1] as { id: string }).id === 'new_melody') && rasU.argsOf('gainSp')[0]?.[0] === 1))

    // summer_rides_surf: wave +1 SP; Elation Skill Updraft SPD%, on type change Uptrend Elation%, every 3rd +1 SP
    const srs = LT('summer_rides_surf')
    const srsW = recSim()
    srs.onWaveStart!(srsW.sim, mkUnit(), 1)
    const srsU = mkUnit({ id: 'W', side: 'ally' })
    const srsS = recSim()
    srs.onElationSkill!(srsS.sim, srsU, 1, 'a')
    srs.onElationSkill!(srsS.sim, srsU, 1, 'a')
    srs.onElationSkill!(srsS.sim, srsU, 1, 'b')
    cases.push(t.ok('summer_rides_surf: onWaveStart +1 SP; Elation Skill Updraft, Uptrend on new type, every 3rd +1 SP',
      srsW.argsOf('gainSp')[0]?.[0] === 1 && srsS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'summer_updraft').length === 3 && srsS.argsOf('addBuff').filter(a => (a[1] as { id: string }).id === 'summer_uptrend').length === 2 && srsS.argsOf('gainSp')[0]?.[0] === 1))

    // elation_brimming: Skill/Ult on an ally char → Elation% buff (2 turns)
    const eb = LT('elation_brimming')
    const ebS = recSim()
    eb.onAfterSkill!(ebS.sim, mkUnit({ side: 'ally' }), mkUnit({ side: 'ally', kind: 'char' }), 1, {})
    const ebNon = recSim()
    eb.onAfterSkill!(ebNon.sim, mkUnit({ side: 'ally' }), mkUnit({ side: 'enemy', kind: 'char' }), 1, {})
    const ebS2 = recSim({ lastAbilityTarget: { kind: 'char', side: 'ally' } })
    eb.onAfterUlt!(ebS2.sim, mkUnit({ side: 'ally' }), 1, {})
    cases.push(t.ok('elation_brimming: onAfterSkill/onAfterUlt Elation% only when the target is an ally char',
      buffOf(ebS, 'brimming')?.mods[0]?.value === 0.12 && ebNon.argsOf('addBuff').length === 0 && buffOf(ebS2, 'brimming')?.mods[0]?.value === 0.12))
  }

  return cases
}
