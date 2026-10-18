/**
 * §62 enemy target resolver: the priority pipeline (geometry → forced → marked → locked →
 * HP rules → weighted aggro) and the TARGET_SELECTED debug trail it feeds.
 *
 * Pure cases drive `resolveTargets` with stub units and a counting rng so the roll contract is
 * pinned; the e2e cases assert the emitted payload stays golden-safe (no scalar numbers).
 */
import { resolveTargets, type TargetContext, type TargetRule } from '../../../src/core/combat/TargetResolver'
import { applyOverride, tickOverride } from '../../../src/core/combat/TargetOverride'
import type { Unit } from '../../../src/core/entities/Unit'
import { chk, run, raw, all, mob } from '../../_helpers/battle'

const u = (name: string, hp: number, aggro = 100): Unit => ({ name, id: `id_${name}`, hp, aggro } as unknown as Unit)

/** counting rng — resolver must consume exactly one roll for weighted/random and none otherwise */
const rngOf = (value = 0.5) => { let calls = 0; return { rng: () => { calls++; return value }, calls: () => calls } }

const sel = (rule: TargetRule, candidates: Unit[], extra: Partial<TargetContext> = {}) => {
  const r = rngOf()
  return { s: resolveTargets({ actorId: 'e', rule, candidates, ...extra, rng: r.rng }), calls: r.calls() }
}

export default () => {
  const a = u('A', 100, 100)
  const b = u('B', 100, 100)
  const c = u('C', 50, 300)
  const pool = [a, b, c]

  const aoe = sel('aoe', pool)
  const self = sel('self', pool)
  const forced = sel('single', pool, { forcedTarget: b })
  const marked = sel('single', pool, { markedTarget: a })
  const locked = sel('single', pool, { lockedTarget: c })
  const low = sel('lowest_hp', pool)
  const high = sel('highest_hp', pool)
  const rnd = sel('random', pool, {})
  const empty = sel('single', [])

  const one = rngOf(0)
  const weighted = resolveTargets({ actorId: 'e', rule: 'single', candidates: pool, weights: [100, 100, 300], rng: one.rng })

  const battle = run({ team: [{ kitId: 'hook' }, { kitId: 'pela' }], enemy: mob({ count: 3 }) })
  const picks = all(battle, 'TARGET_SELECTED')
  const singles = picks.filter(n => n.payload.mode === 'single')
  const scalarNumber = (p: Record<string, unknown>): boolean => Object.values(p).some(v => typeof v === 'number')

  return [
    raw('aoe returns every candidate, 0 rolls', aoe.s.targets.length === 3 && aoe.calls === 0, `n=${aoe.s.targets.length} rolls=${aoe.calls}`),
    raw('self returns none, 0 rolls', self.s.targets.length === 0 && self.calls === 0, `n=${self.s.targets.length}`),
    raw('forced (Taunt) wins, 0 rolls', forced.s.targets[0] === b && forced.s.rule === 'forced' && forced.calls === 0, forced.s.reason),
    raw('marked wins over aggro', marked.s.targets[0] === a && marked.s.rule === 'marked', marked.s.reason),
    raw('locked wins over aggro', locked.s.targets[0] === c && locked.s.rule === 'locked', locked.s.reason),
    raw('lowest_hp picks min hp', low.s.targets[0] === c && low.calls === 0, `${low.s.targets[0]?.name} hp=${low.s.targets[0]?.hp}`),
    raw('highest_hp picks max hp', high.s.targets[0] === a && high.calls === 0, `${high.s.targets[0]?.name} hp=${high.s.targets[0]?.hp}`),
    raw('random consumes exactly one roll', rnd.calls === 1 && rnd.s.rngRoll !== undefined && pool.includes(rnd.s.targets[0]!), `roll=${rnd.s.rngRoll}`),
    raw('weighted consumes exactly one roll', one.calls() === 1 && weighted.rule === 'weighted_aggro', `rule=${weighted.rule} roll=${weighted.rngRoll}`),
    raw('weighted honours weights (roll 0 → first)', weighted.targets[0] === a, weighted.targets[0]?.name),
    raw('weighted: equal weights, roll 0.51 crosses to the second', sel('single', [a, b], {}).s.targets[0] === a
      && resolveTargets({ actorId: 'e', rule: 'single', candidates: [a, b], rng: rngOf(0.51).rng }).targets[0] === b, ''),
    raw('weighted: explicit weights [0,100] force the second at roll 0.5', resolveTargets({ actorId: 'e', rule: 'single', candidates: [a, b], weights: [0, 100], rng: rngOf(0.5).rng }).targets[0] === b, ''),
    raw('weighted: absent aggro defaults to base 100', JSON.stringify(sel('aggro', [a, u('Z', 100, undefined as unknown as number)]).s.weights) === JSON.stringify([100, 100]), ''),
    raw('override: 2-turn mark survives one tick, 1-turn expires', (() => { const m = applyOverride(2, 'src', 'tgt'); const t1 = tickOverride(m); return t1?.turns === 1 && tickOverride(applyOverride(1, 'src', 'tgt')) === undefined })(), ''),
    raw('empty pool → no targets', empty.s.targets.length === 0 && empty.s.weights.length === 0, empty.s.reason),
    raw('reason + candidates recorded', forced.s.candidates.length === 3 && forced.s.reason.length > 0, forced.s.reason),

    chk('target selected', battle, { assert: 'present', of: { type: 'TARGET_SELECTED' } }),
    raw('single pick carries rule + target + candidates', singles.length > 0 && singles.every(n => typeof n.payload.rule === 'string'
      && n.target !== undefined && (n.payload.targets as unknown[])[0] === n.target
      && (n.payload.candidates as unknown[]).includes(n.target)),
      singles.slice(0, 2).map(n => `${n.target}|${n.payload.rule}`).join(' ')),
    raw('weights are an array in candidate order', singles.every(n => Array.isArray(n.payload.weights)
      && (n.payload.weights as number[]).length === (n.payload.candidates as unknown[]).length
      && (n.payload.weights as number[]).every(w => typeof w === 'number' && w > 0)),
      singles.slice(0, 1).map(n => JSON.stringify(n.payload.weights)).join('')),
    raw('GOLDEN-SAFE: no scalar number in TARGET_SELECTED payload', picks.every(n => !scalarNumber(n.payload)),
      picks.find(n => scalarNumber(n.payload)) ? JSON.stringify(picks.find(n => scalarNumber(n.payload))!.payload) : 'clean'),
  ]
}
