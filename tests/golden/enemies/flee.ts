/**
 * Batch 7 — flee countdown-entity primitive (Treasure Trotter family).
 *
 *  A trotter is a countdown entity, not a fighter: it "acts" by panicking (no-op ability) and the
 *  shared `fleeCountdown` passive ticks `fleeTurns` down on its OWN turns; at zero the new `sim.flee`
 *  leaves the battle. `flee` deliberately bypasses the kill path — no DEATH, no killer energy,
 *  no death-rattle — and marks `fled` so the exit is distinguishable from a defeat.
 *
 *  The key engine gate: the countdown decrements in `onTurnStart`, which `TurnManager` only reaches
 *  AFTER the Freeze skip in `turnPrologue`. A Frozen trotter skips its turn without ever reaching
 *  `enemyTurn`, so the timer stalls — freezing genuinely stops the escape (the in-game counter).
 */
import { run, raw, all, type Ctx } from '../../_helpers/battle'
import type { EnemySpec } from '../../../src/core/battle'
import { fleeCountdown } from '../../../src/core/enemy/passive'
import {
  PatternAI, registerEnemyBehavior, unregisterEnemyBehavior,
  type EnemyAbilityDefinition,
} from '../../../src/core/enemy'

const foe = (name: string, over: Partial<EnemySpec> = {}): EnemySpec =>
  ({ name, count: 1, hp: 5_000_000, spd: 220, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60, ...over })

const panic = (id: string): EnemyAbilityDefinition => ({ id, name: 'Panic', targetRule: 'self', effects: [] })
const fed = (b: Ctx) => b.sim.roster.find(u => u.side === 'enemy' && u.fled)
const turnsOf = (b: Ctx) => b.sim.turnCount.get(b.sim.roster.find(u => u.side === 'enemy')!.id) ?? 0

export default (): unknown[] => {
  const seq = run({ team: [{ kitId: 'natasha' }], enemy: foe('Sequence Trotter'), cycles: 6 })
  const deuce = run({ team: [{ kitId: 'natasha' }], enemy: foe('Trot Deuce'), cycles: 6 })

  // Frozen twin of Trot Deuce: spawn Frozen (1 turn) → its first own-turn is SKIPPED before
  // onTurnStart, so the timer can't tick; it flees on the next own turn instead (2 turns total).
  const FROZEN = 'Frozen Trotter'
  const frozenBase = fleeCountdown(1)
  registerEnemyBehavior(FROZEN, {
    abilities: [panic('trot_run')],
    ai: new PatternAI(['trot_run']),
    passive: {
      onSpawn(sim, self) {
        sim.applyDot(self, { kind: 'Freeze', elem: 'Ice', turns: 1, baseDmg: 0, sourceUnit: self })
        frozenBase.onSpawn?.(sim, self)
      },
      onTurnStart(sim, self) { frozenBase.onTurnStart!(sim, self) },
    },
  })
  const frz = run({ team: [{ kitId: 'natasha' }], enemy: foe(FROZEN, { spd: 220 }), cycles: 6 })
  unregisterEnemyBehavior(FROZEN)

  const seqUnit = seq.sim.roster.find(u => u.side === 'enemy')!
  const deuceUnit = deuce.sim.roster.find(u => u.side === 'enemy')!
  const frzUnit = frz.sim.roster.find(u => u.side === 'enemy')!
  const allysOk = (b: Ctx) => b.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char').every(c => c.hp === c.maxHp)

  const cases: Array<ReturnType<typeof raw>> = []
  // --- unos owned turn countdown ---------------------------------------------------------------
  cases.push(raw('flee: Sequence Trotter (Scared, 2) leaves AFTER 2 own turns — exactly one FLEE, no DEATH, no damage dealt',
    all(seq, 'FLEE').length === 1 && all(seq, 'DEATH').filter(n => n.target === 'Sequence Trotter').length === 0
      && seqUnit.fled === true && turnsOf(seq) === 2 && allysOk(seq),
    `FLEE=${all(seq, 'FLEE').length} DEATH=${all(seq, 'DEATH').filter(n => n.target === 'Sequence Trotter').length} turnCount=${turnsOf(seq)} fled=${seqUnit.fled}`))
  cases.push(raw('flee: Trot Deuce (Run... Run! state, 1) flees on its FIRST own turn',
    all(deuce, 'FLEE').length === 1 && deuceUnit.fled === true && turnsOf(deuce) === 1 && allysOk(deuce),
    `FLEE=${all(deuce, 'FLEE').length} turnCount=${turnsOf(deuce)} fled=${deuceUnit.fled}`))
  // --- frozen stall ---------------------------------------------------------------------------
  cases.push(raw('flee: a Frozen trotter skips its turn (before onTurnStart) so the timer stalls — falls one own-turn behind',
    all(frz, 'ACTION_SKIPPED').some(n => n.target === FROZEN && n.payload?.reason === 'frozen')
      && all(frz, 'FLEE').length === 1 && frzUnit.fled === true
      && turnsOf(frz) === 2 && turnsOf(frz) > turnsOf(deuce),
    `skips=${all(frz, 'ACTION_SKIPPED').filter(n => n.target === FROZEN).length} turnCount=${turnsOf(frz)} vs deuce=${turnsOf(deuce)}`))
  // --- flee is not a kill ---------------------------------------------------------------------
  cases.push(raw('flee: no DEATH emitted at all — the exit skipped the kill path (no killer energy/onKilled)',
    all(seq, 'DEATH').length === 0 && all(deuce, 'DEATH').length === 0 && all(frz, 'DEATH').length === 0,
    `DEATH seq=${all(seq, 'DEATH').length} deuce=${all(deuce, 'DEATH').length} frz=${all(frz, 'DEATH').length}`))
  cases.push(raw('flee: invariant check passes after both flights',
    seq.sim.logger.verify().length === 0 && deuce.sim.logger.verify().length === 0 && frz.sim.logger.verify().length === 0,
    seq.sim.logger.verify().join('; ') || deuce.sim.logger.verify().join('; ') || frz.sim.logger.verify().join('; ')))

  void fed
  return cases
}