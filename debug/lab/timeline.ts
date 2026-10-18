/**
 * §45 lab — timeline.
 * Isolates the AV math (timeline/Timeline: base/advance/delay/rescale are the single source of
 * truth) and the queue ordering (timeline/ActionQueue: smallest AV, tie-broken by roster slot).
 */
import { ActionQueue } from '../../src/core/timeline/ActionQueue'
import { BASE_AV, advance, baseAv, cycleIndexOf, delay, rescaleAv, totalBudget } from '../../src/core/timeline/Timeline'
import { Simulator } from '../../src/core/simulator'
import { eq, isEntry, mkUnit, ok, report, type LabCase } from './harness'

export function timelineLab(): LabCase[] {
  const av115 = BASE_AV / 115
  const queue = new ActionQueue()

  const u = mkUnit({ base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 115 } })
  const advanceCase = (): LabCase => {
    const x = mkUnit({ base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 115 } })
    x.av = baseAv(x)
    advance(x, 0.5)
    return eq('advance 50% halves AV', x.av, av115 * 0.5, 1e-9)
  }
  const delayCase = (): LabCase => {
    const x = mkUnit({ base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 115 } })
    x.av = baseAv(x)
    delay(x, 0.5)
    return eq('delay 50% +half AV', x.av, av115 * 1.5, 1e-9)
  }

  // queue ordering
  const a = mkUnit({ name: 'A' }); a.av = 10
  const b = mkUnit({ name: 'B' }); b.av = 20
  const c = mkUnit({ name: 'C' }); c.av = 10
  const a2 = mkUnit({ name: 'A2' }); a2.av = 20
  const b2 = mkUnit({ name: 'B2' }); b2.av = 10

  const rs = mkUnit({ base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100 } })
  rs.av = 40
  rescaleAv(rs, 120)

  // immediateTurn: char → av=0 (wins next slot); non-char/queued → untouched
  const sim = new Simulator({ cycles: 1, seed: 1 })
  const ch = mkUnit({ name: 'Ch', kind: 'char' }); ch.av = 50; sim.roster.push(ch)
  const en = mkUnit({ side: 'enemy', kind: 'enemy' }); en.av = 50; sim.roster.push(en)
  sim.immediateTurn(ch)
  sim.immediateTurn(en)

  return [
    eq('baseAv = 10000/SPD (spd115)', baseAv(u), av115, 1e-9),
    advanceCase(),
    delayCase(),
    eq('queue: picks smallest AV', queue.next([a, b]) === a ? 1 : 0, 1),
    ok('queue: equal AV tie-breaks to earlier roster slot', queue.next([a, c]) === a && queue.next([c, a]) === c),
    eq('queue: smallest AV wins regardless of slot', queue.next([a2, b2]) === b2 ? 1 : 0, 1),
    eq('advanceTime pulls the next actor to 0', (() => { const d = queue.advanceTime([a, b], a); return d === 10 && a.av === 0 && b.av === 10 ? 1 : 0 })(), 1),
    eq('rescaleAv prorate AV×old/new (100→120)', rs.av, 40 * 100 / 120, 1e-9),
    eq('immediateTurn: char like av=50 → 0 (immediate)', ch.av, 0),
    eq('immediateTurn ignores non-char (enemy av untouched)', en.av, 50),
    eq('cycleIndexOf 149 = cycle 0', cycleIndexOf(149), 0),
    eq('cycleIndexOf 150 = cycle 1', cycleIndexOf(150), 1),
    eq('totalBudget 4 cycles = 450', totalBudget(4), 450)
  ]
}

if (isEntry('timeline.ts')) process.exitCode = report('Timeline lab', timelineLab())
