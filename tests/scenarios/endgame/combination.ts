/**
 * §64 — enemy golden combination scenarios: the eight canonical cases from the guide, each a real
 * battle (or an imperative `prepareBattle` hit) that combines several mechanics at once.
 *
 *   1 charge enemy            5 damage redistribution
 *   2 multi-phase boss        6 immunity window
 *   3 multiple toughness bars 7 mode-specific enemy variant
 *   4 linked adds             8 wave transition
 */
import { run, raw, all, mob, type Ctx } from '../../_helpers/battle'
import { prepareBattle, type EnemySpec } from '../../../src/core/battle'
import {
  registerEnemyBehavior, unregisterEnemyBehavior, PatternAI, registerEnemyDefense, unregisterEnemyDefense,
  resetEnemyDefense, getVariant, getDefinition, resolveInstance,
  type EnemyBehavior,
} from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import { normalize } from '../../../src/verification/TraceMatcher'
import type { Simulator } from '../../../src/core/simulator'
import type { Unit } from '../../../src/core/entities/Unit'

const nodesOf = (sim: Simulator): Ctx => ({ nodes: normalize(sim.logger.events), sim, buffLog: sim.buffLog, logLines: sim.logLines } as unknown as Ctx)
const ts = (c: Ctx, type: string): number[] => c.nodes.map((n, i) => (n.type === type ? i : -1)).filter(i => i >= 0)

export default () => {
  // ---- 1. charge enemy: telegraph turns, then release lands the AoE ------------------------
  registerEnemyBehavior('Combo Charger', {
    abilities: [
      { id: 'cc_jab', name: 'Jab', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'cc_nova', name: 'Nova Burst', targetRule: 'aoe', cast: 2, effects: [{ op: 'aoe', mult: 1.5 }] },
    ],
    ai: new PatternAI(['cc_jab', 'cc_nova']),
  } satisfies EnemyBehavior)
  const chargeRun = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: { name: 'Combo Charger', count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 50 } satisfies EnemySpec, cycles: 5 })
  unregisterEnemyBehavior('Combo Charger')
  const ccPhases = new Set(all(chargeRun, 'ACTION_START').filter(n => n.source === 'Combo Charger' && n.payload?.action === 'cc_nova').map(n => String(n.payload?.phase)))
  const ccReleaseHits = all(chargeRun, 'HIT_START').filter(n => n.source === 'Combo Charger' && n.label === 'Nova Burst')

  // ---- 2. multi-phase boss: ability set + stats switch on transition -----------------------
  registerEnemyBehavior('Combo Warden', {
    abilities: [
      { id: 'cw_slash', name: 'Slash', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'cw_doom', name: 'Doom', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.6 }] },
    ],
    ai: new PatternAI(['cw_slash', 'cw_doom']),
    phases: [{ id: 'p1' }, { id: 'p2', start: { turnAtLeast: 2 }, statModifiers: [{ stat: 'atkPct', value: 1 }], availableAbilities: ['cw_doom'] }],
  } satisfies EnemyBehavior)
  const phaseRun = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: { name: 'Combo Warden', count: 1, hp: 300_000, spd: 170, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 40 } satisfies EnemySpec, cycles: 8 })
  unregisterEnemyBehavior('Combo Warden')
  const cwPhases = new Set(all(phaseRun, 'PHASE_START').filter(n => n.source === 'Combo Warden').map(n => String(n.payload?.phase)))
  const cwActs = new Set(all(phaseRun, 'ABILITY_USED').filter(n => n.source === 'Combo Warden').map(n => String(n.payload?.action)))

  // ---- 3. multiple toughness bars: model carries N bars, runtime breaks the primary --------
  const cac = getVariant('Cacophonic Conductor')!
  const cacSegs = cac.toughnessModel.segments
  const breakRun = run({
    team: [{ kitId: 'firefly' }, { kitId: 'ruanmei' }],
    enemy: { name: 'Cacophonic Conductor', count: 1, hp: 4_000_000, spd: 100, level: 80, toughness: cac.toughnessModel.primary, weaknesses: ['Fire'], atk: 1 } satisfies EnemySpec,
    cycles: 8,
  })

  // ---- 4. boss with linked adds: damage redirects to the add -------------------------------
  const e = (name: string, over: Partial<EnemySpec> = {}): EnemySpec => ({ name, hp: 1e9, spd: 1, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 800, ...over, count: 1 })
  const mk = (waves: EnemySpec[][]) => {
    const sim = prepareBattle({ cycles: 3, seed: 7, log: { debug: 5 }, team: [{ kitId: 'march7th' }], enemy: waves[0]![0]!, enemyWaves: waves })
    const byName = (n: string): Unit => { const u = sim.roster.find(x => x.name === n); if (!u) throw new Error(`no ${n}`); return u }
    const ally = sim.roster.find(x => x.side === 'ally' && x.kind === 'char')!
    return { sim, byName, ally }
  }
  const hit = (sim: Simulator, from: Unit, to: Unit): number => sim.hit(from, to, { type: 'basic', mult: 1, canCrit: false })
  const linkCase = (() => {
    registerEnemyDefense('Combo Shell', { links: [{ relationship: 'DAMAGE_REDIRECT', target: 'Combo Core', damageRouting: 'redirect_to' }] })
    const { sim, byName, ally } = mk([[e('Combo Core'), e('Combo Shell')]])
    const core = byName('Combo Core'); const shell = byName('Combo Shell')
    const pre = core.hp; const dmg = hit(sim, ally, shell)
    const redirects = all(nodesOf(sim), 'HP_REDIRECT')
    unregisterEnemyDefense('Combo Shell')
    return [pre - core.hp === dmg && shell.hp === 1e9 && redirects.length === 1, `redirected=${pre - core.hp}/${dmg}`] as const
  })()

  // ---- 5. damage redistribution: split across adds, remainder to the last ------------------
  const redistCase = (() => {
    registerEnemyDefense('Combo Shell', { links: [
      { relationship: 'DAMAGE_REDIRECT', target: 'Add A', damageRouting: 'redistribute' },
      { relationship: 'DAMAGE_REDIRECT', target: 'Add B', damageRouting: 'redistribute' },
    ] })
    const { sim, byName, ally } = mk([[e('Add A'), e('Add B'), e('Combo Shell')]])
    const a = byName('Add A'); const b = byName('Add B'); const shell = byName('Combo Shell')
    const pa = a.hp; const pb = b.hp; const dmg = hit(sim, ally, shell)
    const split = Math.floor(dmg / 2)
    unregisterEnemyDefense('Combo Shell')
    return [[pa - a.hp, pb - b.hp], dmg, split, shell.hp === 1e9] as const
  })()

  // ---- 6. immunity window: invulnerable blocks, then the window closes and damage lands -----
  const immunityCase = (() => {
    registerEnemyDefense('Combo Ward', { invulnerable: true })
    const { sim, byName, ally } = mk([[e('Combo Ward')]])
    const ward = byName('Combo Ward')
    const pre = ward.hp
    hit(sim, ally, ward)
    const blocked = pre - ward.hp
    const invulnTrace = all(nodesOf(sim), 'HP_INTERCEPT').some(n => n.payload?.reason === 'invulnerable')
    unregisterEnemyDefense('Combo Ward')
    resetEnemyDefense(ward)
    const dmg = hit(sim, ally, ward)
    return [blocked === 0 && invulnTrace && dmg > 0 && pre - ward.hp === dmg, `blocked=${blocked} then=${dmg}`] as const
  })()

  // ---- 7. mode-specific enemy variant: different stats, used in battle ---------------------
  const baseVar = getVariant('"Past Confined and Caged"')!
  const modeVar = getVariant('"Past Confined and Caged" (Bug)')!
  const baseInst = resolveInstance(getDefinition('"Past Confined and Caged"')!, baseVar, 80)
  const modeInst = resolveInstance(getDefinition('"Past Confined and Caged"')!, modeVar, 80)
  const modeRun = run({ team: [{ kitId: 'hook' }], enemy: { name: modeVar.title, count: 1, hp: modeInst.hp!, spd: 150, level: 80, toughness: 0, weaknesses: [...modeVar.weaknesses] } satisfies EnemySpec, cycles: 2 })
  const modeEnemy = modeRun.sim.roster.find(u => u.side === 'enemy' && u.name === modeVar.title)

  // ---- 8. wave transition: despawn → spawn → wave start, boss announced --------------------
  const waveEnc: EncounterSpec = {
    id: 'combo-waves', mode: 'E2E Mock', cycles: 6,
    waves: [[{ ...mob(), name: 'Combo Grunt' }], [{ ...mob(), name: 'Combo Titan', hp: 9_000 }]],
    victoryCondition: 'All down', defeatCondition: 'Wiped',
  }
  const waveRun = run({ team: [{ kitId: 'hook' }, { kitId: 'march7th' }, { kitId: 'robin' }], encounter: waveEnc })
  const ws = ts(waveRun, 'WAVE_START'); const de = ts(waveRun, 'ENEMY_DESPAWN'); const sp = ts(waveRun, 'ENEMY_SPAWN'); const we = ts(waveRun, 'WAVE_END')
  const es = encounterStateOf(waveRun.sim)

  return [
    raw('1 charge: telegraphs then releases the AoE', ccPhases.has('charge') && ccPhases.has('release') && ccReleaseHits.length > 0, [...ccPhases].join(',') + ` hits=${ccReleaseHits.length}`),
    raw('2 multi-phase: both phases announced, ability set + stat buff switch',
      cwPhases.has('p1') && cwPhases.has('p2') && cwActs.has('cw_slash') && cwActs.has('cw_doom') && all(phaseRun, 'BUFF_APPLIED').some(n => n.payload?.id === 'phase:p2'),
      [...cwPhases].join(',') + '|' + [...cwActs].join(',')),
    raw('3 multi-bar toughness: model carries N bars', cacSegs.length === 1 && cacSegs[0]!.count === 10 && cac.toughnessModel.primary === 80, JSON.stringify(cac.toughnessModel.segments)),
    raw('3 multi-bar toughness: runtime breaks using the primary bar', all(breakRun, 'WEAKNESS_BREAK').length > 0 && breakRun.sim.logger.verify().length === 0, `${all(breakRun, 'WEAKNESS_BREAK').length} breaks`),
    raw('4 linked adds: redirected damage lands on the linked add', linkCase[0], linkCase[1]),
    raw('5 redistribution: split share + remainder to the last add', redistCase[0][0] === redistCase[2] && redistCase[0][1] === redistCase[1] - redistCase[2] && redistCase[3], JSON.stringify(redistCase[0])),
    raw('6 immunity window: blocked, then damage lands after the window', immunityCase[0], immunityCase[1]),
    raw('7 mode variant: data differs from the base row and drives the battle HP', baseInst.hp! < modeInst.hp! && modeEnemy !== undefined && modeEnemy.maxHp === modeInst.hp, `base=${baseInst.hp} mode=${modeInst.hp} spawned=${modeEnemy?.maxHp}`),
    raw('8 wave transition: WAVE_END → despawn → spawn → next WAVE_START', we.length >= 1 && de.length >= 1 && sp.length >= 1 && ws.length >= 2 && de[0]! > we[0]! && sp[0]! > de[0]! && ws[1]! > sp[0]!, `we=${we[0]} de=${de[0]} sp=${sp[0]} ws=${ws.join(',')}`),
    raw('8 wave transition: encounter leaves wave 1 completed, wave 2 active', es.completedWaves.includes(1) && es.currentWave === 2, `wave=${es.currentWave} done=${es.completedWaves.join(',')}`),
  ]
}
