import { case_ as ok } from '../suites'
import { splitSubValues } from '../../src/core/relicSplit'
import { substatValue, SUBSTAT_TIERS } from '../../src/core/gear'
import { scoreRelic } from '../../src/core/relicScore'

/**
 * §Task7 — the whole-piece relic editor takes ONE number (the summed substat value) and the
 * script back-solves the substats. These checks pin the split contract: the main stat never
 * appears as a substat, percent and flat values are never mixed, the roll budget is respected,
 * and the split is deterministic.
 */
const FLAT = ['hpFlat', 'atkFlat', 'defFlat', 'spd']

export default () => {
  const cases: ReturnType<typeof ok>[] = []
  const c = (name: string, cond: boolean, detail = '') => cases.push(ok(name, cond, detail))

  const sum = (subs: ReturnType<typeof splitSubValues>): number =>
    subs.reduce((a, s) => a + substatValue({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread }), 0)
  const rolls = (subs: ReturnType<typeof splitSubValues>): number => subs.reduce((a, s) => a + s.rolls, 0)

  // ---- percent budget
  const pct = splitSubValues('seele', 'critDmg', 0.30)
  c('percent budget -> lines', pct.length > 0 && pct.length <= 4, `${pct.length}`)
  c('percent budget -> no flat stats', pct.every(s => !FLAT.includes(s.stat)), pct.map(s => s.stat).join(','))
  c('percent budget -> main excluded', pct.every(s => s.stat !== 'critDmg'))
  c('percent budget -> unique stats', new Set(pct.map(s => s.stat)).size === pct.length)
  c('percent budget -> roll cap', rolls(pct) <= 6, `${rolls(pct)}`)
  c('percent budget -> never overspends', sum(pct) <= 0.30 + 1e-9, `${sum(pct)}`)
  // the 6-roll ceiling of a 5★ piece can leave residue — but never more than one roll's worth
  c('percent budget -> residue within one roll', 0.30 - sum(pct) < 0.054, `${sum(pct)}`)

  // ---- a budget the 6-roll ceiling can reach lands almost exactly
  const exact = splitSubValues('seele', 'critDmg', 0.20)
  c('reachable budget -> value near target', Math.abs(sum(exact) - 0.20) < 0.03, `${sum(exact)} vs 0.20`)

  // ---- flat budget (>= 1) never mixes flat and percent
  const flat = splitSubValues('seele', 'atkFlat', 120)
  c('flat budget -> lines', flat.length > 0 && flat.length <= 4, `${flat.length}`)
  c('flat budget -> only flat stats', flat.every(s => FLAT.includes(s.stat)), flat.map(s => s.stat).join(','))
  c('flat budget -> main excluded', flat.every(s => s.stat !== 'atkFlat'))
  c('flat budget -> value near target', sum(flat) <= 120 + 1e-9 && 120 - sum(flat) < 25, `${sum(flat)} vs 120`)

  // ---- empty / zero budget
  c('zero budget -> no lines', splitSubValues('seele', 'critDmg', 0).length === 0)
  c('negative budget -> no lines', splitSubValues('seele', 'critDmg', -5).length === 0)

  // ---- determinism
  const a = splitSubValues('seele', 'critDmg', 0.30)
  const b = splitSubValues('seele', 'critDmg', 0.30)
  c('deterministic', JSON.stringify(a) === JSON.stringify(b))

  // ---- the engine reads the split as written (spread is the value model)
  const engine = pct.map(s => substatValue({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread }))
  const manual = pct.map(s => s.spread.reduce((acc, tier) => acc + SUBSTAT_TIERS[s.stat][tier], 0))
  c('engine value == spread sum', engine.every((v, i) => Math.abs(v - manual[i]) < 1e-9))
  c('tier is the start roll', pct.every(s => s.tier === s.spread[0]))

  // ---- the split is scorable (rating path accepts it)
  const score = scoreRelic('seele', 'body', 'critDmg', pct.map(s => ({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread })))
  c('split scores', score.rating !== '?', score.rating)

  return cases
}
