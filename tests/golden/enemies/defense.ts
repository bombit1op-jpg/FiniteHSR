import { t } from '../../suites'
import { raw, all, type Ctx } from '../../_helpers/battle'
import { prepareBattle, type EnemySpec } from '../../../src/core/battle'
import { registerEnemyDefense, unregisterEnemyDefense } from '../../../src/core/enemy'
import type { Simulator } from '../../../src/core/simulator'
import type { Unit } from '../../../src/core/entities/Unit'
import { normalize } from '../../../src/verification/TraceMatcher'

/** §57/§58 — enemy defense profile (data-driven) + linked-entity damage routing, pinned at the
 *  engine pressure points: DamagePipeline HP mutation (invulnerable/partial/shield/redirect),
 *  toughness accumulation gate, BuffSystem debuff gate, DotSystem control gate and sim.delay
 *  gate. Default behavior must be untouched when no profile is registered (last group verifies).
 *
 *  Imperative via prepareBattle: one roll in, exact numbers out — no ally turns, no RNG drift. */

const e = (over: Partial<EnemySpec> = {}): EnemySpec => ({
  name: 'Test Vessel', hp: 1e9, spd: 1, level: 80, toughness: 0, weaknesses: ['Fire', 'Lightning'], atk: 800,
  ...over, count: 1,
})

const mk = (waves: EnemySpec[][], team: string[] = ['march7th']) => {
  const sim = prepareBattle({ cycles: 3, seed: 7, log: { debug: 5 }, team: team.map(kitId => ({ kitId })), enemy: e(), enemyWaves: waves })
  const byName = (n: string): Unit => {
    const u = sim.roster.find(x => x.name === n)
    if (!u) throw new Error(`unit ${n} not spawned`)
    return u
  }
  return { sim, byName, ally: sim.roster.find(x => x.side === 'ally' && x.kind === 'char')! }
}

const nodesOf = (sim: Simulator): Ctx => ({ nodes: normalize(sim.logger.events), sim, buffLog: sim.buffLog, logLines: sim.logLines } as unknown as Ctx)

const hit = (sim: Simulator, from: Unit, to: Unit, toughDmg = 0): number =>
  sim.hit(from, to, { type: 'basic', mult: 1, canCrit: false, toughDmg })

export default () => {
  // ---- §58 shield: absorption eats damage before it lands --------------------------------
  const shieldCases = (() => {
    registerEnemyDefense('Test Vessel', { shield: 3000 })
    const { sim, byName, ally } = mk([[e()]])
    const enemy = byName('Test Vessel')
    const pre = enemy.hp
    const dmg = hit(sim, ally, enemy)
    const c = nodesOf(sim)
    unregisterEnemyDefense('Test Vessel')
    return [
      t.eq('shield: first hit fully absorbed (no HP loss)', pre - enemy.hp, 0),
      t.eq('shield: SHIELD_ABSORBED carries the absorbed amount', all(c, 'SHIELD_ABSORBED')[0]?.payload?.amount, dmg),
      t.eq('shield: SHIELD_ABSORBED targets the enemy', all(c, 'SHIELD_ABSORBED')[0]?.target, 'Test Vessel'),
      t.eq('shield: no SHIELD_BROKEN while charge remains', all(c, 'SHIELD_BROKEN').length, 0),
    ]
  })()

  // ---- §58 invulnerable: nothing lands ---------------------------------------------------
  const invulnCases = (() => {
    registerEnemyDefense('Test Vessel', { invulnerable: true })
    const { sim, byName, ally } = mk([[e()]])
    const enemy = byName('Test Vessel')
    const pre = enemy.hp
    hit(sim, ally, enemy)
    const c = nodesOf(sim)
    unregisterEnemyDefense('Test Vessel')
    return [
      t.eq('invulnerable: enemy HP untouched', pre - enemy.hp, 0),
      raw('invulnerable: HP_INTERCEPT pins reason', all(c, 'HP_INTERCEPT').some(n => n.payload?.reason === 'invulnerable')),
    ]
  })()

  // ---- §58 partial: the fraction lands ------------------------------------------------
  const partialCases = (() => {
    registerEnemyDefense('Test Vessel', { partial: 0.5 })
    const { sim, byName, ally } = mk([[e()]])
    const enemy = byName('Test Vessel')
    const pre = enemy.hp
    const dmg = hit(sim, ally, enemy)
    const c = nodesOf(sim)
    unregisterEnemyDefense('Test Vessel')
    return [
      t.eq('partial 0.5: exactly half lands', pre - enemy.hp, Math.floor(dmg * 0.5)),
      t.eq('partial: HP_INTERCEPT reports the absorbed half', all(c, 'HP_INTERCEPT').find(n => n.payload?.reason === 'partial')?.payload?.amount, dmg - Math.floor(dmg * 0.5)),
    ]
  })()

  // ---- §57 redirect_to: Echoes of Faded Dreams → Harmonious Choir -------------------------
  const redirectCases = (() => {
    registerEnemyDefense('Echo Shell', { links: [{ relationship: 'DAMAGE_REDIRECT', target: 'Choir Core', damageRouting: 'redirect_to' }] })
    const { sim, byName, ally } = mk([[e({ name: 'Choir Core' }), e({ name: 'Echo Shell' })]])
    const echo = byName('Echo Shell')
    const choir = byName('Choir Core')
    const preChoir = choir.hp
    const dmg = hit(sim, ally, echo)
    const redirects = all(nodesOf(sim), 'HP_REDIRECT')
    unregisterEnemyDefense('Echo Shell')
    return [
      t.eq('redirect_to: linked recipient takes the FULL hit', preChoir - choir.hp, dmg),
      t.eq('redirect_to: original target takes nothing', echo.hp, 1e9),
      t.eq('redirect_to: exactly one HP_REDIRECT emitted', redirects.length, 1),
      raw('redirect_to: event names the recipient + routing', redirects[0]?.payload?.to === 'Choir Core' && redirects[0]?.payload?.by === 'redirect_to'),
    ]
  })()

  // ---- §58 redistribute: split across linked recipients, remainder to the last ------------
  const redistributeCases = (() => {
    registerEnemyDefense('Echo Shell', {
      links: [
        { relationship: 'DAMAGE_REDIRECT', target: 'Minion One', damageRouting: 'redistribute' },
        { relationship: 'DAMAGE_REDIRECT', target: 'Minion Two', damageRouting: 'redistribute' },
      ],
    })
    const { sim, byName, ally } = mk([[e({ name: 'Minion One' }), e({ name: 'Minion Two' }), e({ name: 'Echo Shell' })]])
    const echo = byName('Echo Shell')
    const m1 = byName('Minion One')
    const m2 = byName('Minion Two')
    const pre1 = m1.hp
    const pre2 = m2.hp
    const dmg = hit(sim, ally, echo)
    const split = Math.floor(dmg / 2)
    unregisterEnemyDefense('Echo Shell')
    return [
      t.eq('redistribute: each recipient takes its share', [pre1 - m1.hp, pre2 - m2.hp], [split, dmg - split]),
      t.eq('redistribute: original target takes nothing', echo.hp, 1e9),
    ]
  })()

  // ---- §57 cycle guard: A→B→A loops collapse, one hop only -------------------------------
  const cycleCases = (() => {
    registerEnemyDefense('Node A', { links: [{ relationship: 'DAMAGE_REDIRECT', target: 'Node B', damageRouting: 'redirect_to' }] })
    registerEnemyDefense('Node B', { links: [{ relationship: 'DAMAGE_REDIRECT', target: 'Node A', damageRouting: 'redirect_to' }] })
    const { sim, byName, ally } = mk([[e({ name: 'Node A', hp: 1e9 }), e({ name: 'Node B', hp: 1e9 })]])
    const a = byName('Node A')
    const b = byName('Node B')
    const preB = b.hp
    const dmg = hit(sim, ally, a)
    const redirects = all(nodesOf(sim), 'HP_REDIRECT')
    unregisterEnemyDefense('Node A')
    unregisterEnemyDefense('Node B')
    return [
      t.eq('cycle guard: damage lands once on the far side of the loop', preB - b.hp, dmg),
      t.eq('cycle guard: starting node untouched', a.hp, 1e9),
      t.eq('cycle guard: no exponential cascade', redirects.length, 1),
    ]
  })()

  // ---- §58 delay-immune + control-immune: commands are no-ops -----------------------------
  const immunityCases = (() => {
    registerEnemyDefense('Test Vessel', { delayImmune: true, controlImmune: true })
    const { sim, byName, ally } = mk([[e()]])
    const enemy = byName('Test Vessel')
    const avBefore = enemy.av
    const hpBefore = enemy.hp
    sim.delay(enemy, 0.5)
    sim.addBuff(enemy, { id: 'slow_x', name: 'Slow X', mods: [{ stat: 'spdDown', value: 0.1 }], turns: 2, sourceId: ally.id, debuff: true })
    sim.applyDot(enemy, { kind: 'Freeze', elem: 'Ice', turns: 1, baseDmg: 5000, sourceUnit: ally })
    const ev = (type: string, fn: (p: Record<string, unknown> | undefined, t?: string) => boolean): number =>
      sim.logger.events.filter(x => x.type === type && fn(x.payload, x.target)).length
    const delayOnEnemy = ev('ACTION_DELAY', (p) => p?.pct === 0.5)
    const notes = ev('NOTE', () => true)
    unregisterEnemyDefense('Test Vessel')
    return [
      t.eq('delay-immune: AV untouched, no ACTION_DELAY', [enemy.av, delayOnEnemy], [avBefore, 0]),
      raw('control-immune: debuff-buff skipped', enemy.buffs.length === 0 && ev('DEBUFF_APPLIED', (p) => p?.id === 'slow_x') === 0),
      raw('control-immune: DoT skipped', enemy.dots.length === 0 && ev('DOT_APPLIED', () => true) === 0),
      t.eq('control-immune: HP untouched by both gates', hpBefore - enemy.hp, 0),
      raw('gates are observable: NOTE emitted per skip', notes >= 3, `${notes} notes`),
    ]
  })()

  // ---- §58 toughness-immune: no Weakness Break accumulation -------------------------------
  const toughCases = (() => {
    registerEnemyDefense('Test Vessel', { toughnessImmune: true })
    const { sim, byName, ally } = mk([[e({ toughness: 500 })]])
    const enemy = byName('Test Vessel')
    const preT = enemy.toughness
    hit(sim, ally, enemy, 400)
    unregisterEnemyDefense('Test Vessel')
    return [
      t.eq('toughness-immune: bar unchanged', enemy.toughness, preT),
      t.eq('toughness-immune: never breaks', enemy.broken, false),
    ]
  })()

  // ---- §58 default passthrough: no profile ⇒ engine behavior unchanged -------------------
  const defaultCases = (() => {
    const { sim, byName, ally } = mk([[e({ name: 'Plain Vessel' })]])
    const enemy = byName('Plain Vessel')
    const pre = enemy.hp
    const dmg = hit(sim, ally, enemy)
    const defenseTraces = nodesOf(sim).nodes.filter(n =>
      (n.type === 'SHIELD_ABSORBED' && n.payload?.id === 'enemy_shield') ||
      n.type === 'SHIELD_BROKEN' || n.type === 'HP_REDIRECT' ||
      (n.type === 'HP_INTERCEPT' && n.payload?.by === 'defense'))
    return [
      t.eq('passthrough: full damage lands on HP', pre - enemy.hp, dmg),
      t.eq('passthrough: zero defense traces emitted', defenseTraces.length, 0),
      t.eq('passthrough: logger invariants hold', nodesOf(sim).sim.logger.verify().length, 0),
    ]
  })()

  return [
    ...shieldCases,
    ...invulnCases,
    ...partialCases,
    ...redirectCases,
    ...redistributeCases,
    ...cycleCases,
    ...immunityCases,
    ...toughCases,
    ...defaultCases,
  ]
}