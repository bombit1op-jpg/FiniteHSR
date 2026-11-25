import { runBattle, ENEMY_PRESETS } from '../../../src/core/battle'
import { BattleLogger, type BattleEvent } from '../../../src/core/battlelog'
import { Simulator } from '../../../src/core/simulator'
import { InvariantWatcher, verifyInvariants } from '../../../src/core/battle/Invariants'
import { aggregateCombatActions } from '../../../src/ui/combatActionView'
import { case_, type Case } from '../../suites'

const stubSim = () => ({ avElapsed: 0, units: () => [], sp: () => 5, maxSp: 5, cfg: { seed: 42 }, roster: [] })

const emitHit = (logger: BattleLogger, amount: number): void => {
  logger.beginHit()
  logger.beginDamage()
  logger.emit({ type: 'HIT_START', source: logger.getActionContext()?.source, sourceId: logger.getActionContext()?.sourceId, target: 'Foe', targetId: 'e', attackType: 'skill', trace: 'HIT' })
  logger.emit({ type: 'DAMAGE_CALCULATED', source: logger.getActionContext()?.source, sourceId: logger.getActionContext()?.sourceId, target: 'Foe', targetId: 'e', attackType: 'skill', trace: 'DMG', payload: { amount } })
  logger.emit({ type: 'DAMAGE_DEALT', source: logger.getActionContext()?.source, sourceId: logger.getActionContext()?.sourceId, target: 'Foe', targetId: 'e', attackType: 'skill', trace: 'DMG', payload: { amount } })
}

const nestedTrace = () => {
  const logger = new BattleLogger(stubSim() as any, { debug: 5 })
  logger.turnStart('Parent', 'skill', { actionKind: 'skill' }, 'p')
  const parent = logger.getActionContext()!
  logger.beginAttack()
  emitHit(logger, 10)
  logger.startFollowUpAttack(parent.combatActionId, { source: 'FUA Source', sourceId: 'fua-source', abilityName: 'Test FUA' })
  const fua = logger.getActionContext()!
  logger.beginAttack()
  emitHit(logger, 20)
  logger.endFollowUpAttack()
  const resumed = logger.getActionContext()!
  logger.beginAttack()
  emitHit(logger, 30)
  logger.turnEnd('Parent', 'skill', 'p')
  return { logger, parent, fua, resumed, events: logger.events }
}

const pairBySource = (events: BattleEvent[]): string[] => {
  const open = new Map<string, number[]>()
  const bad: string[] = []
  for (const e of events) {
    const src = e.sourceId ?? e.source ?? ''
    if (e.type === 'ACTION_START') {
      const stack = open.get(src) ?? []
      stack.push(e.actionId)
      open.set(src, stack)
    } else if (e.type === 'ACTION_END') {
      const expected = open.get(src)?.pop()
      if (expected !== e.actionId) bad.push(`${src}: expected ACT ${expected}, received ACT ${e.actionId}`)
    }
  }
  return [...bad, ...[...open].filter(([, s]) => s.length).map(([src, s]) => `${src}: ${s.length} unclosed`)]
}

let eventSeq = 0
const mkEvent = (type: BattleEvent['type'], o: Partial<BattleEvent> = {}): BattleEvent =>
  ({ eventId: ++eventSeq, time: 0, turn: 0, actionId: 1, type, payload: {}, ...o } as BattleEvent)

export default async (): Promise<Case[]> => {
  const trace = nestedTrace()
  const cases: Case[] = [
    case_('A: parent action keeps its own combatActionId after FUA', trace.resumed.combatActionId === trace.parent.combatActionId && trace.resumed.actionId === trace.parent.actionId),
    case_('A: FUA gets distinct combatActionId and parentActionId', trace.fua.combatActionId !== trace.parent.combatActionId && trace.fua.parentActionId === trace.parent.combatActionId),
    case_('A: FUA allocation advances ACT without touching parent ACT', trace.fua.actionId === trace.parent.actionId + 1 && trace.logger.actNoValue === trace.parent.actionId + 1),
    case_('A: FUA opens and closes with its own actionId', (() => {
      const start = trace.events.find(e => e.type === 'ACTION_START' && e.sourceId === 'fua-source')
      const end = trace.events.find(e => e.type === 'ACTION_END' && e.sourceId === 'fua-source')
      return start?.actionId === trace.fua.actionId && end?.actionId === trace.fua.actionId && end?.payload.action === 'Test FUA'
    })()),
    case_('A: parent closes with stored actionId, not global ACT', (() => {
      const end = trace.events.find(e => e.type === 'ACTION_END' && e.sourceId === 'p')
      return end?.actionId === trace.parent.actionId && trace.logger.getActionContext() === undefined
    })()),
    case_('B: global ACT counter is monotonic across nested FUA', trace.logger.actNoValue === 2 && trace.fua.actionId === 2),
    case_('C: ATK/HIT/DMG sub-counters are restored after FUA', (() => {
      const traces = trace.events.filter(e => e.type === 'HIT_START').map(e => e.traceId)
      const dmg = trace.events.filter(e => e.type === 'DAMAGE_CALCULATED').map(e => e.traceId)
      return JSON.stringify(traces) === JSON.stringify(['1.1.1', '2.2.1', '1.2.1'])
        && JSON.stringify(dmg) === JSON.stringify(['1.1.1.1', '2.2.1.2', '1.2.1.2'])
    })()),
  ]

  const stray = new BattleLogger(stubSim() as any, { debug: 5 })
  stray.turnStart('Parent', 'skill', { actionKind: 'skill' }, 'p')
  const strayFrame = stray.getActionContext()!
  const strayLen = stray.events.length
  stray.endFollowUpAttack()
  cases.push(case_('D: stray FUA end neither emits nor pops parent', stray.events.length === strayLen && stray.getActionContext() === strayFrame))

  const runtime: Record<string, unknown> = {}
  const unit = { id: 'u', name: 'U', kitId: 'fake', av: 100 } as any
  const throwingSim = {
    logger: stray,
    rt: () => runtime,
    kits: new Map([['fake', { decide: () => ({ kind: 'basic' }) }]]),
    log: () => {},
    performAbility: () => { throw new Error('boom') },
    fireAllyMemospriteAct: () => {},
  }
  const actBeforeThrow = stray.actNoValue
  let threw = false
  try { Simulator.prototype.grantExtraTurn.call(throwingSim as any, unit) } catch { threw = true }
  cases.push(case_('D: exception in Extra Turn closes context and clears flag', threw && runtime.inExtraTurn === false && stray.getActionContext() === strayFrame && stray.actNoValue === actBeforeThrow + 1))

  const parentEvents = trace.events.filter(e => e.combatActionId === trace.parent.combatActionId)
  const aggregated = aggregateCombatActions(parentEvents, stubSim() as any, [])
  const record = aggregated[0]
  cases.push(case_('E: one combatActionId aggregates into one action record', aggregated.length === 1 && record?.combatActionId === trace.parent.combatActionId))
  cases.push(case_('E: action record holds only real attacks, no synthetic IDs', JSON.stringify(record?.attacks.map(a => a.attackId)) === JSON.stringify(['1', '3']) && record?.attacks.every(a => !a.attackId.includes('.'))))
  cases.push(case_('E: action record damage/category/provenance follow the action', record?.totalDamage === 40 && record?.category === 'attack' && record?.sourceName === 'Parent'))
  cases.push(case_('E: FUA combatActionId is not merged into parent record', parentEvents.every(e => e.parentActionId === undefined || e.parentActionId === trace.parent.combatActionId) && aggregated.length === 1))

  const mismatched = [mkEvent('ACTION_START', { actionId: 1, source: 'P', sourceId: 'p' }), mkEvent('ACTION_START', { actionId: 2, source: 'P', sourceId: 'p' }), mkEvent('ACTION_END', { actionId: 1, source: 'P', sourceId: 'p' })]
  const expected = 'action-order-mismatch: expected ACT 2, received ACT 1 for p'
  const batchBad = verifyInvariants([], mismatched)
  const watcher = new InvariantWatcher(() => [])
  const liveBad = mismatched.flatMap(e => watcher.check(e))
  const pairedStream = [mkEvent('ACTION_START', { actionId: 1, source: 'P', sourceId: 'p' }), mkEvent('ACTION_END', { actionId: 1, source: 'P', sourceId: 'p' })]
  cases.push(case_('F: batch verifier detects LIFO action mismatch', batchBad.includes(expected), batchBad.join('; ')))
  cases.push(case_('F: per-event watcher detects same LIFO action mismatch', liveBad.includes(expected), liveBad.join('; ')))
  cases.push(case_('F: paired action stream stays clean', verifyInvariants([], pairedStream).length === 0))

  const c = runBattle({ cycles: 4, seed: 42, log: { debug: 5 }, team: [{ kitId: 'yanqing', skillPriority: 1 }], enemy: { ...ENEMY_PRESETS.mob, count: 1 } })
  const evs = c.logger.events
  const starts = evs.filter(e => e.type === 'ACTION_START')
  const ends = evs.filter(e => e.type === 'ACTION_END')
  const byCombat = new Map<string, Set<number>>()
  for (const e of evs) {
    if (!e.combatActionId) continue
    const set = byCombat.get(e.combatActionId) ?? new Set<number>()
    set.add(e.actionId)
    byCombat.set(e.combatActionId, set)
  }
  const badPairs = pairBySource(evs)
  const violations = verifyInvariants(c.units(), evs, { sp: c.sp(), maxSp: c.maxSp })
  cases.push(case_('G: real battle pairs every ACTION_START with ACTION_END', badPairs.length === 0, badPairs.join('; ')))
  cases.push(case_('G: real battle has no invariant violations', violations.length === 0, violations.join('; ')))
  cases.push(case_('G: one actionId per combatActionId', [...byCombat.values()].every(s => s.size === 1)))
  cases.push(case_('G: action starts carry unique combatActionId and attackId', new Set(starts.map(e => e.combatActionId)).size === starts.length && new Set(starts.map(e => e.attackId)).size === starts.length))
  cases.push(case_('G: hit and damage events carry a real attackId', evs.filter(e => e.type === 'HIT_START' || e.type === 'HIT_END' || e.type === 'DAMAGE_DEALT').every(e => !!e.attackId)))
  cases.push(case_('G: action counts match and logger reports no errors', starts.length === ends.length && c.logger.errors.length === 0, c.logger.errors.join('; ')))

  return cases
}
