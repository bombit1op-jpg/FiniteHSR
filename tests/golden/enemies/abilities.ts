import { t } from '../../suites'
import { run, raw, all } from '../../_helpers/battle'
import {
  SimpleAI, PatternAI, chooseEnemyAction, enemyRuntimeOf, resetEnemyRuntime,
  registerEnemyBehavior, unregisterEnemyBehavior,
  type EnemyBehavior, type EnemyAbilityDefinition,
} from '../../../src/core/enemy'
import type { SimApi } from '../../../src/core/kit'
import type { Unit } from '../../../src/core/entities/Unit'
import type { EnemySpec } from '../../../src/core/battle'

/** §53/§54/§55 — enemy abilities as declared effects + an AI chooser + charge telegraphs.
 *  Effects route through the shared pipeline (`sim.hit`/`delay`/…), so the enemy uses the same
 *  damage/event/loss machinery as a kit. The pure checks pin AI semantics; the battle check pins
 *  the wiring (a registered behavior overrides the default attack; an unregistered enemy keeps it). */

const fakeSim = {} as unknown as SimApi
const bare = (): Unit => ({} as unknown as Unit)

export default () => {
  // ---- §54.1 SimpleAI: highest ready priority, cooldown gates re-use ---------------------
  const simpleCases = (() => {
    const actor = bare()
    const abilities: EnemyAbilityDefinition[] = [
      { id: 'slam', name: 'Slam', effects: [{ op: 'attack', mult: 1 }], aiPriority: 1 },
      { id: 'roar', name: 'Roar', effects: [{ op: 'aoe', mult: 0.5 }], aiPriority: 5, cooldown: 2 },
    ]
    const behavior: EnemyBehavior = { abilities, ai: new SimpleAI() }
    const seq: string[] = []
    for (let i = 0; i < 3; i++) seq.push(chooseEnemyAction(fakeSim, actor, 1, behavior)!.ability.id)
    return [t.eq('SimpleAI: top priority → on cooldown → top priority', seq, ['roar', 'slam', 'roar'])]
  })()

  // ---- §53 charges: an exhausted ability is no longer offered -----------------------------
  const chargeCases = (() => {
    const actor = bare()
    const abilities: EnemyAbilityDefinition[] = [{ id: 'nova', name: 'Nova', effects: [{ op: 'aoe', mult: 1 }], aiPriority: 9, charges: 1 }]
    const behavior: EnemyBehavior = { abilities, ai: new SimpleAI() }
    const first = chooseEnemyAction(fakeSim, actor, 1, behavior)?.ability.id
    const second = chooseEnemyAction(fakeSim, actor, 1, behavior)
    return [t.eq('charges:1 → used once then unavailable', JSON.stringify([first, second === undefined]), JSON.stringify(['nova', true]))]
  })()

  // ---- §54.2 PatternAI + §55 charge lifecycle ---------------------------------------------
  const patternCases = (() => {
    const actor = bare()
    const abilities: EnemyAbilityDefinition[] = [
      { id: 'slam', name: 'Slam', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'quake', name: 'Quake', effects: [{ op: 'aoe', mult: 2 }], cast: 2 },
    ]
    const behavior: EnemyBehavior = { abilities, ai: new PatternAI(['slam', 'slam', 'quake']) }
    const ids: string[] = []
    const phases: string[] = []
    for (let i = 0; i < 6; i++) {
      const a = chooseEnemyAction(fakeSim, actor, 1, behavior)!
      ids.push(a.ability.id); phases.push(a.phase)
    }
    return [
      t.eq('PatternAI: looped sequence with a charge step', ids, ['slam', 'slam', 'quake', 'quake', 'quake', 'slam']),
      t.eq('§55: cast:2 → charge, charge, release', phases, ['use', 'use', 'charge', 'charge', 'release', 'use']),
      t.ok('runtime is per-unit and observable', enemyRuntimeOf(actor).casting === null && enemyRuntimeOf(actor).patternIndex === 1, JSON.stringify(enemyRuntimeOf(actor).patternIndex)),
      (() => { const b = bare(); resetEnemyRuntime(b); return t.ok('resetEnemyRuntime clears state', enemyRuntimeOf(b).patternIndex === 0) })(),
    ]
  })()

  // ---- end-to-end: a registered behavior drives the enemy turn ----------------------------
  const enemy = 'Training Automaton'
  registerEnemyBehavior(enemy, {
    abilities: [
      { id: 'automaton_slam', name: 'Slam', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'automaton_sweep', name: 'Sweep', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.3 }] },
      { id: 'automaton_quake', name: 'Quake', targetRule: 'aoe', cast: 1, cooldown: 3, effects: [{ op: 'aoe', mult: 1.5 }, { op: 'delay', pct: 0.3 }] },
    ],
    ai: new PatternAI(['automaton_slam', 'automaton_sweep', 'automaton_quake']),
  })
  const c = run({
    team: [{ kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: { name: enemy, count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 4,
  })
  unregisterEnemyBehavior(enemy)

  const acts = all(c, 'ABILITY_USED').filter(n => n.source === enemy)
  const ids = new Set(acts.map(n => String(n.payload?.action)))
  const starts = all(c, 'ACTION_START').filter(n => n.source === enemy)
  const quakePhases = new Set(starts.filter(n => n.payload?.action === 'automaton_quake').map(n => String(n.payload?.phase)))
  const delayFromEnemy = all(c, 'ACTION_DELAY').some(n => n.source === enemy)
  const aoeSelect = all(c, 'TARGET_SELECTED').some(n => n.source === enemy && n.payload?.mode === 'aoe')

  // ---- default fallback: an unregistered enemy keeps the built-in attack ------------------
  const def = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }] })
  const defaultActs = all(def, 'ABILITY_USED').filter(n => n.source === 'Ice Edge').map(n => String(n.payload?.action))

  return [
    ...simpleCases,
    ...chargeCases,
    ...patternCases,
    raw('wiring: registered behavior uses its abilities', ids.has('automaton_slam') && ids.has('automaton_sweep') && ids.has('automaton_quake'), [...ids].join(',')),
    raw('§55 wiring: charge then release phases observed', quakePhases.has('charge') && quakePhases.has('release'), [...quakePhases].join(',')),
    raw('effects reuse shared pipeline: enemy Action Delay emitted', delayFromEnemy, `${all(c, 'ACTION_DELAY').length} delay events`),
    raw('targeting: AoE ability selects all allies (mode aoe)', aoeSelect),
    raw('invariants: none after behavior-driven battle', c.sim.logger.verify().length === 0, c.sim.logger.verify().join('; ')),
    raw('default fallback: unregistered enemy still uses built-in attack', defaultActs.includes('attack'), defaultActs.join(',')),
  ]
}
