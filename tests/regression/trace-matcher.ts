/**
 * §44 `regression/` — the verification layer must not digest a real divergence.
 *
 * The comparable identity of a trace node carries the payload's numeric fingerprint. Without it,
 * "expected damage 38214, actual 42191" passed as a match: the event shape was identical and only
 * `payload.dmg` moved. These three cases pin the property both ways.
 */

import { normalize, key, type Node } from '../../src/verification/TraceMatcher'
import { matches, firstIndex } from '../../src/verification/EventMatcher'
import { t, type Case } from '../suites'

const ev = (type: string, payload: Record<string, unknown>): Node => normalize([
  { eventId: 1, turn: 1, actionId: 1, type, source: 'A', target: 'E', payload },
])[0]

export default (): Case[] => {
  const cases: Case[] = []

  cases.push(t.truthy('TraceMatcher: re-rolled damage diverges (38214 vs 42191)',
    key(ev('DAMAGE_DEALT', { dmg: 38214 })) !== key(ev('DAMAGE_DEALT', { dmg: 42191 }))))

  cases.push(t.truthy('TraceMatcher: energy grant drift diverges (3 vs 5)',
    key(ev('ENERGY_GAIN', { n: 3, total: 45 })) !== key(ev('ENERGY_GAIN', { n: 5, total: 47 }))))

  cases.push(t.eq('TraceMatcher: identical amounts match (float noise tolerated)',
    key(ev('DAMAGE_CALCULATED', { mult: 0.3, dmg: 38214 })),
    key(ev('DAMAGE_CALCULATED', { mult: 0.30000000000000004, dmg: 38214 }))))

  const note = (msg: string): Node => normalize([
    { eventId: 2, turn: 1, actionId: 2, type: 'NOTE', raw: msg },
  ])[0]
  cases.push(t.truthy('EventMatcher: log matches node-scoped (ordering via NOTE raw)',
    firstIndex([note('Misha Ult: 5 hits'), ev('DAMAGE_DEALT', {}), note('is Frozen — turn skipped')],
      { log: 'is Frozen' }) === 2))

  cases.push(t.truthy('EventMatcher: structured event has no log line, never matches log',
    !matches(ev('DAMAGE_DEALT', { dmg: 1 }), { log: 'Frozen' })))

  return cases
}