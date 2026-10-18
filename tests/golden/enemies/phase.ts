import { t } from '../../suites'
import { run, raw, all } from '../../_helpers/battle'
import {
  evaluateEnemyPhase, filterPhaseAbilities, enemyPhaseRuntimeOf, resetEnemyPhase,
  registerEnemyBehavior, unregisterEnemyBehavior, PatternAI,
  type EnemyBehavior, type EnemyPhaseDefinition,
} from '../../../src/core/enemy'
import type { SimApi } from '../../../src/core/kit'
import type { BattleLogger } from '../../../src/core/battlelog'
import type { Unit } from '../../../src/core/entities/Unit'
import type { EnemySpec } from '../../../src/core/battle'

/** §56 — boss phase controller. One principle: a phase transition is a state-machine step,
 *  NOT death. Conditions (HP / broken / timer / scripted) advance the phase forward; the actor
 *  keeps its identity and HP, while stats / resistances / weaknesses / ability set change and
 *  PHASE_START / PHASE_END ride the shared event bus. */

/** minimal harness: a bare Unit, a logging stub, and the two buff primitives the controller uses */
function harness() {
  const events: { type: string; payload: Record<string, unknown> }[] = []
  const logger = { emit: (e: { type: string; payload?: Record<string, unknown> }) => { events.push({ type: e.type, payload: e.payload ?? {} }) } } as unknown as BattleLogger
  const sim = {
    addBuff: (u: Unit, b: { id: string }) => { u.buffs.push(b as unknown as Unit['buffs'][number]) },
    removeBuff: (u: Unit, id: string) => { u.buffs = u.buffs.filter(b => b.id !== id) },
  } as unknown as SimApi
  const actor = (over: Partial<Unit> = {}): Unit => ({
    id: 'e1', name: 'Warden', maxHp: 1000, hp: 1000, broken: false,
    weaknesses: ['Fire'], res: { Physical: 0.2 }, buffs: [], ...over,
  } as unknown as Unit)
  return { events, logger, sim, actor }
}

export default () => {
  // ---- HP threshold: forward transition + stat buff + PHASE_START/PHASE_END ------------------
  const hpCases = (() => {
    const h = harness(); const a = h.actor()
    const phases: EnemyPhaseDefinition[] = [
      { id: 'p1', name: 'Phase 1' },
      { id: 'p2', name: 'Enraged', start: { hpBelow: 0.5 }, statModifiers: [{ stat: 'atkPct', value: 1 }] },
    ]
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    const idxFirst = enemyPhaseRuntimeOf(a).index
    a.hp = 400
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 1)
    const starts = h.events.filter(e => e.type === 'PHASE_START').map(e => String(e.payload.phase))
    const ends = h.events.filter(e => e.type === 'PHASE_END').map(e => String(e.payload.phase))
    return [
      t.eq('hp threshold: first phase entered unconditionally', idxFirst, 0),
      t.eq('hp threshold: HP<50% → phase 2', enemyPhaseRuntimeOf(a).index, 1),
      t.eq('PHASE_START emitted for both phases', starts, ['p1', 'p2']),
      t.eq('PHASE_END emitted for the exited phase', ends, ['p1']),
      t.ok('stat modifier applied as a phase buff', a.buffs.some(b => b.id === 'phase:p2'), a.buffs.map(b => b.id).join(',')),
    ]
  })()

  // ---- broken / toughness condition ----------------------------------------------------------
  const brokenCases = (() => {
    const h = harness(); const a = h.actor()
    const phases: EnemyPhaseDefinition[] = [{ id: 'a' }, { id: 'b', start: { broken: true } }]
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    const before = enemyPhaseRuntimeOf(a).index
    a.broken = true
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    return [t.eq('broken condition: intact → broken advances phase', `${before}→${enemyPhaseRuntimeOf(a).index}`, '0→1')]
  })()

  // ---- timer condition -----------------------------------------------------------------------
  const timerCases = (() => {
    const h = harness(); const a = h.actor()
    const phases: EnemyPhaseDefinition[] = [{ id: 'a' }, { id: 'b', start: { turnAtLeast: 3 } }]
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 2)
    const at2 = enemyPhaseRuntimeOf(a).index
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 3)
    return [t.eq('timer condition: turn>=3 advances phase', `${at2}→${enemyPhaseRuntimeOf(a).index}`, '0→1')]
  })()

  // ---- ability availability filtering --------------------------------------------------------
  const filterCases = (() => {
    const h = harness(); const a = h.actor()
    const abilities = [
      { id: 'slash', name: 'Slash', effects: [] },
      { id: 'smash', name: 'Smash', effects: [] },
    ] as unknown as EnemyBehavior['abilities']
    const phases: EnemyPhaseDefinition[] = [
      { id: 'a', availableAbilities: ['slash'] },
      { id: 'b', start: { hpBelow: 0.5 }, disabledAbilities: ['slash'] },
    ]
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    const p0 = filterPhaseAbilities(abilities, phases, enemyPhaseRuntimeOf(a)).map(x => x.id)
    a.hp = 1
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 1)
    const p1 = filterPhaseAbilities(abilities, phases, enemyPhaseRuntimeOf(a)).map(x => x.id)
    return [
      t.eq('availableAbilities whitelists the phase ability set', p0, ['slash']),
      t.eq('disabledAbilities removes the ability', p1, ['smash']),
    ]
  })()

  // ---- weaknesses / RES override, restored on exit ------------------------------------------
  const profileCases = (() => {
    const h = harness(); const a = h.actor()
    const phases: EnemyPhaseDefinition[] = [
      { id: 'a' },
      { id: 'b', start: { hpBelow: 0.5 }, weaknesses: ['Ice'], resistanceModifiers: { Fire: -0.5 } },
      { id: 'c', start: { broken: true } },
    ]
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    a.hp = 1
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    const inB = { weak: [...a.weaknesses].join(','), fire: a.res.Fire, phys: a.res.Physical }
    a.broken = true
    evaluateEnemyPhase(h.sim, h.logger, a, phases, 0)
    const inC = [...a.weaknesses].join(',')
    return [
      t.eq('phase overrides weaknesses + RES', JSON.stringify(inB), JSON.stringify({ weak: 'Ice', fire: -0.5, phys: 0.2 })),
      t.eq('weaknesses restored when the phase is exited', inC, 'Fire'),
    ]
  })()

  // ---- runtime reset -------------------------------------------------------------------------
  const resetCases = (() => {
    const h = harness(); const a = h.actor()
    evaluateEnemyPhase(h.sim, h.logger, a, [{ id: 'a' }], 0)
    resetEnemyPhase(a)
    return [t.eq('resetEnemyPhase clears phase state', enemyPhaseRuntimeOf(a).index, -1)]
  })()

  // ---- end-to-end: a phase-driven boss changes its ability set on transition -----------------
  registerEnemyBehavior('Phase Warden', {
    abilities: [
      { id: 'warden_slash', name: 'Slash', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'warden_smash', name: 'Smash', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.5 }] },
    ],
    ai: new PatternAI(['warden_slash', 'warden_smash']),
    phases: [
      { id: 'calm', availableAbilities: ['warden_slash'] },
      { id: 'enraged', start: { turnAtLeast: 2 }, statModifiers: [{ stat: 'atkPct', value: 0.5 }], availableAbilities: ['warden_smash'] },
    ],
  } satisfies EnemyBehavior)
  const c = run({
    team: [{ kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: { name: 'Phase Warden', count: 1, hp: 200_000, spd: 170, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 40 } satisfies EnemySpec,
    cycles: 8,
  })
  unregisterEnemyBehavior('Phase Warden')

  const phaseStarts = new Set(all(c, 'PHASE_START').filter(n => n.source === 'Phase Warden').map(n => String(n.payload?.phase)))
  const phaseBuff = all(c, 'BUFF_APPLIED').some(n => n.payload?.id === 'phase:enraged')
  const actIds = new Set(all(c, 'ABILITY_USED').filter(n => n.source === 'Phase Warden').map(n => String(n.payload?.action)))

  return [
    ...hpCases,
    ...brokenCases,
    ...timerCases,
    ...filterCases,
    ...profileCases,
    ...resetCases,
    raw('§56 wiring: phase 1 → phase 2 both announced', phaseStarts.has('calm') && phaseStarts.has('enraged'), [...phaseStarts].join(',')),
    raw('§56 wiring: phase stat buff applied through the shared buff system', phaseBuff),
    raw('§56 wiring: transition switched the usable ability set', actIds.has('warden_slash') && actIds.has('warden_smash'), [...actIds].join(',')),
    raw('invariants: none after a phase-driven battle', c.sim.logger.verify().length === 0, c.sim.logger.verify().join('; ')),
  ]
}
