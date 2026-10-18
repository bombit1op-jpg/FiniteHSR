import { t } from '../../suites'
import { run, raw, mob } from '../../_helpers/battle'
import { chooseEnemyAction, SimpleAI, PatternAI, registerEnemyBehavior, unregisterEnemyBehavior, type EnemyBehavior } from '../../../src/core/enemy'
import type { EnemySpec } from '../../../src/core/battle'
import type { Unit } from '../../../src/core/entities/Unit'

/** §85.E5 — enemy NEGATIVE behavior + EVENT ORDER.
 *
 *  Positives (an ability fires, an effect lands) are pinned across §53/§63/§85.E3; this suite pins
 *  what must NOT happen and the causal ordering: the AI's `require`/`noBuff` gates, dead units
 *  never acting, and the ACTION→ABILITY→HIT→DAMAGE nesting an enemy turn must obey. Counter
 *  negatives (blast/AoE never counter) live in `tests/regression/enemy-counter.ts`. */

const stub = (buffs: { id: string }[] = []): Unit => ({ id: 'e', buffs } as unknown as Unit)
const atk = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, targetRule: 'single', effects: [{ op: 'attack', mult: 1 }], ...extra }) as never

export default () => {
  const cases = []

  // ---- AI gates: require / noBuff (unit-level, no battle) -------------------------
  cases.push((() => {
    const beh: EnemyBehavior = { abilities: [atk('gated', { require: { buff: 'state' }, aiPriority: 5 }), atk('plain', { aiPriority: 1 })], ai: new SimpleAI() }
    const without = chooseEnemyAction({} as never, stub(), 1, beh)?.ability.id
    const withB = chooseEnemyAction({} as never, stub([{ id: 'state' }]), 1, beh)?.ability.id
    return t.ok('require: state-gated ability is withheld until its buff exists', without === 'plain' && withB === 'gated', `${without}/${withB}`)
  })())
  cases.push((() => {
    const beh: EnemyBehavior = { abilities: [atk('onlyOpen', { require: { noBuff: 'blocked' }, aiPriority: 5 }), atk('fallback', { aiPriority: 1 })], ai: new SimpleAI() }
    const open = chooseEnemyAction({} as never, stub(), 1, beh)?.ability.id
    const blocked = chooseEnemyAction({} as never, stub([{ id: 'blocked' }]), 1, beh)?.ability.id
    return t.ok('noBuff: an ability is withheld while the forbidden buff is present', open === 'onlyOpen' && blocked === 'fallback', `${open}/${blocked}`)
  })())
  cases.push((() => {
    const beh: EnemyBehavior = { abilities: [atk('gated', { require: { buff: 'state' } }), atk('plain')], ai: new PatternAI(['gated', 'plain']) }
    const picked = chooseEnemyAction({} as never, stub(), 1, beh)?.ability.id
    return t.ok('PatternAI: a gated pattern step is skipped to the next ready id', picked === 'plain', String(picked))
  })())

  // ---- integration: a dead enemy never acts again + enemy-turn event nesting ------
  registerEnemyBehavior('Neg Sentry', { abilities: [atk('neg_strike')], ai: new PatternAI(['neg_strike']) } satisfies EnemyBehavior)
  registerEnemyBehavior('Neg Ward', { abilities: [atk('neg_sweep', { targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.5 }] })], ai: new PatternAI(['neg_sweep']) } satisfies EnemyBehavior)
  const c = run({
    team: [{ kitId: 'jingliu' }, { kitId: 'robin' }, { kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: [[mob({ name: 'Neg Sentry', hp: 400 }), mob({ name: 'Neg Ward', hp: 400 })]] as unknown as EnemySpec[][],
    cycles: 4,
  })
  unregisterEnemyBehavior('Neg Sentry')
  unregisterEnemyBehavior('Neg Ward')

  const nodes = c.nodes
  const idxAll = (type: string, source?: string): number[] => nodes.map((n, i) => [n.type, n.source] as const).reduce<number[]>((acc, [ty, src], i) => (ty === type && (source === undefined || src === source) ? (acc.push(i), acc) : acc), [])

  const deadActedAfter: string[] = []
  for (const nm of ['Neg Sentry', 'Neg Ward']) {
    const death = idxAll('DEATH', nm)[0]
    if (death === undefined) continue
    const uses = idxAll('ABILITY_USED', nm)
    const starts = idxAll('ACTION_START', nm)
    if (uses.some(i => i > death) || starts.some(i => i > death)) deadActedAfter.push(nm)
  }
  const anyDeath = nodes.some(n => n.type === 'DEATH')
  cases.push(raw('dead: a fallen enemy emits no further ABILITY_USED / ACTION_START', anyDeath && deadActedAfter.length === 0, `deaths=${anyDeath} offenders=${deadActedAfter.join(',')}`))

  // ---- event order: ACTION_START before its ABILITY_USED before its ACTION_END -----
  const orderViolations: string[] = []
  nodes.forEach((n, i) => {
    if (n.type !== 'ABILITY_USED') return
    const start = idxAll('ACTION_START', n.source).filter(x => x < i).pop()
    const end = idxAll('ACTION_END', n.source).find(x => x > i)
    if (start === undefined || end === undefined || !(start < i && i < end)) orderViolations.push(`${n.source}@${i}`)
  })
  cases.push(raw('order: every ABILITY_USED is enclosed by its ACTION_START < … < ACTION_END', orderViolations.length === 0, orderViolations.slice(0, 5).join(' ')))

  // ---- event order: calculation precedes dealing, hit opens before it closes -------
  const dmgCalc = idxAll('DAMAGE_CALCULATED')
  const dmgDealt = idxAll('DAMAGE_DEALT')
  cases.push(raw('order: DAMAGE_CALCULATED precedes DAMAGE_DEALT', dmgCalc.length > 0 && dmgDealt.length > 0 && Math.min(...dmgCalc) < Math.min(...dmgDealt), `calc=${dmgCalc.length} dealt=${dmgDealt.length}`))

  const badHit = nodes.filter((n, i) => n.type === 'HIT_START' && !idxAll('HIT_END', n.source).some(x => x > i)).length
  cases.push(raw('order: every HIT_START has a later HIT_END for the same source', badHit === 0, `${badHit} unmatched`))

  // ---- invariant: the negative scenario still produces a clean event stream --------
  cases.push(raw('invariants: no logger violations in the negative-order battle', c.sim.logger.verify().length === 0, c.sim.logger.verify().join('; ')))

  return cases
}
