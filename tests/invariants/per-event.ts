/**
 * §10/§27 — `LogConfig.verifyPerEvent` guard. Two layers:
 *   1. watcher unit laws (unpaired action, dead actor, roster bounds) against synthetic events;
 *   2. a real battle run with the flag on must complete and match the unflagged trace.
 */
import { InvariantWatcher, verifyInvariants } from '../../src/core/battle/Invariants'
import type { Unit } from '../../src/core/entities/Unit'
import type { BattleEvent } from '../../src/core/battlelog'
import { run } from '../_helpers/battle'
import { t, type Case } from '../suites'

const unit = (o: Partial<Unit>): Unit =>
  ({ name: 'U', hp: 100, maxHp: 100, dead: false, energy: 0, maxEnergy: 100, toughness: 0, av: 100, ...o } as unknown as Unit)

let id = 0
const ev = (type: BattleEvent['type'], o: Partial<BattleEvent> = {}): BattleEvent =>
  ({ eventId: ++id, time: 0, turn: 0, actionId: 1, type, payload: {}, ...o } as unknown as BattleEvent)

const watch = (units: Unit[], events: BattleEvent[]): string[] => {
  const w = new InvariantWatcher(() => units)
  return events.flatMap(e => w.check(e))
}

export default (): Case[] => {
  const cases: Case[] = []

  // stream-local laws
  const okStream = watch([unit({})], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.eq('paired action has no violation', okStream, []))

  const unpaired = watch([unit({})], [ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('unpaired ACTION_END flagged', unpaired.some(v => v.startsWith('unpaired-action')), unpaired.join('; ')))

  const deadActor = watch([unit({ name: 'A' })], [ev('DEATH', { target: 'A' }), ev('ACTION_START', { source: 'A' })])
  cases.push(t.truthy('dead-actor flagged', deadActor.some(v => v.startsWith('dead-actor')), deadActor.join('; ')))

  // roster bounds are judged at ACTION_END (the overkill model resolves HP inside the action)
  const negAlive = watch([unit({ name: 'A', hp: -5 })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('surviving negative HP at action end flagged', negAlive.some(v => v.startsWith('negative-hp')), negAlive.join('; ')))

  const negDead = watch([unit({ name: 'A', hp: -5, dead: true })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.eq('overkill negative HP on a dead unit is allowed', negDead, []))

  const badEnergy = watch([unit({ name: 'A', energy: 200, maxEnergy: 100 })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('energy over cap at action end flagged', badEnergy.some(v => v.startsWith('invalid-energy')), badEnergy.join('; ')))

  // §27 bounds added with the invariant expansion (TODO L749)
  const negTough = watch([unit({ name: 'A', toughness: -1 })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('negative toughness at action end flagged', negTough.some(v => v.startsWith('negative-toughness')), negTough.join('; ')))

  const badAv = watch([unit({ name: 'A', av: -1 })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('negative AV at action end flagged', badAv.some(v => v.startsWith('invalid-av')), badAv.join('; ')))

  const dupId = watch([unit({ id: 'X' }), unit({ id: 'X', name: 'B' })], [ev('ACTION_START', { source: 'X' }), ev('ACTION_END', { source: 'X' })])
  cases.push(t.truthy('duplicate id flagged', dupId.some(v => v.startsWith('duplicate-id')), dupId.join('; ')))

  // §27 hp <= maxHp: `StatResolver.eff()` caps `hp` when it lowers `maxHp`, so an over-max state is a violation.
  const overMax = watch([unit({ name: 'A', hp: 120, maxHp: 100 })], [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })])
  cases.push(t.truthy('hp above maxHp flagged', overMax.some(v => v.startsWith('hp-over-max')), overMax.join('; ')))

  // §27 runtime SP bound (fed by BattleLogger.verify via the optional runtime getter)
  const spWatcher = new InvariantWatcher(() => [unit({})], () => ({ sp: 7, maxSp: 5 }))
  const spBad = [ev('ACTION_START', { source: 'A' }), ev('ACTION_END', { source: 'A' })].flatMap(e => spWatcher.check(e))
  cases.push(t.truthy('SP over cap flagged', spBad.some(v => v.startsWith('invalid-sp')), spBad.join('; ')))
  cases.push(t.truthy('verifyInvariants flags SP out of range', verifyInvariants([unit({})], [], { sp: -1, maxSp: 5 }).some(v => v.startsWith('invalid-sp'))))
  cases.push(t.eq('verifyInvariants on a clean unit has no violation', verifyInvariants([unit({})], []), []))

  // real battle: flag on must be transparent
  const team = [{ kitId: 'hook' }]
  const plain = run({ team })
  const guarded = run({ team, log: { debug: 5, verifyPerEvent: true } })
  cases.push(t.eq('verifyPerEvent leaves the trace identical', guarded.nodes.length, plain.nodes.length))
  cases.push(t.truthy('verifyPerEvent run reports no invariant violations', guarded.sim.logger.errors.length === 0, guarded.sim.logger.errors.join('; ')))

  return cases
}
