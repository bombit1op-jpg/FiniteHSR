import { TriggerQueue } from '../../src/core/battle/TriggerQueue'
import { case_, type Case } from '../suites'

/**
 * Regression for §13 trigger windows. A per-ATTACK reaction (Yao Guang Great Boon) must NOT resolve
 * during the per-HIT drain: on a Blast that would let its AoE kill a neighbour before the neighbour's
 * own hit lands (the y_basic_adj failure). The engine pins: `hit` resolves immediately, `attack`
 * only at the outermost attack boundary, and draining one window leaves the other queued.
 */
export default (): Case[] => {
  const cases: Case[] = []

  const q = new TriggerQueue()
  const order: string[] = []
  q.enterAttack()
  q.push(() => order.push('hit:main'), 'hit')
  q.drain('hit') // per-hit drain: only the hit window runs
  q.push(() => order.push('attack:boon'), 'attack')
  q.drain('hit') // an attack-window reaction must survive a hit drain
  q.push(() => order.push('hit:adj'), 'hit')
  q.drain('hit')
  q.exitAttack() // outermost boundary → attack window resolves LAST, after both hits
  cases.push(case_(
    'hit window drains per-hit, attack window defers to the boundary',
    order.join(',') === 'hit:main,hit:adj,attack:boon', order.join(','),
  ))

  const q2 = new TriggerQueue()
  const o2: string[] = []
  q2.enterAttack()
  q2.enterAttack() // a Blast nests its hits inside one attack scope
  q2.push(() => o2.push('attack'), 'attack')
  q2.exitAttack() // inner exit: depth 1 → still deferred
  cases.push(case_('nested attack does not resolve the outer attack window', o2.length === 0, o2.join(',')))
  q2.exitAttack() // outer exit → resolves
  cases.push(case_('outermost exit resolves the attack window', order.length >= 0 && o2.join(',') === 'attack', o2.join(',')))

  const q3 = new TriggerQueue()
  let ran = false
  q3.push(() => { ran = true })
  q3.drain()
  cases.push(case_('push defaults to the hit window', ran, String(ran)))

  const q4 = new TriggerQueue()
  const loop = (): void => q4.push(loop, 'hit')
  q4.push(loop, 'hit')
  let threw = ''
  try { q4.drain('hit') } catch (e) { threw = e instanceof Error ? e.message : String(e) }
  cases.push(case_('runaway chain throws instead of hanging', /reaction chain exceeded/.test(threw), threw.slice(0, 64)))

  return cases
}
