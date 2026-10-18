/**
 * §43 stable unit ids in the event stream.
 *
 * Identity in events must be the roster id, not the display name: two units can legitimately
 * share a name (enemy groups spawn `Name #1`/`Name #2`, wave duplicates, same-kit allies), and
 * owner attribution keyed on the name would silently merge them. This pins that every unit-scoped
 * event carries `sourceId`/`targetId`/`ownerId` payload keys that resolve back to the exact roster
 * unit named by `source`/`target`, and that same-name units stay distinguishable by id.
 */

import { run, raw, all, mob } from '../_helpers/battle'
import type { Node } from '../../src/verification/TraceMatcher'
import type { Case } from '../suites'

const ids = (n: Node): string[] =>
  [n.payload.sourceId, n.payload.targetId, n.payload.ownerId].filter((v): v is string => typeof v === 'string')

export default (): Case[] => {
  const cases: Case[] = []
  // two enemy groups that share the display name 'Twin' (count:1 each) -> two roster units, one name
  const c = run({
    team: [
      { kitId: 'seele', stats: { hp: 4000, atk: 1500, spd: 130, critRate: 0.5, critDmg: 1.0 } },
      { kitId: 'asta', stats: { hp: 4000, atk: 1000, spd: 120 } },
    ],
    enemy: [[mob({ name: 'Twin', hp: 200_000 }), mob({ name: 'Twin', hp: 200_000 })]],
    cycles: 6,
  })

  const twins = c.sim.roster.filter(u => u.name === 'Twin')
  cases.push(raw('two units share the display name Twin', twins.length === 2))
  cases.push(raw('same-name units carry distinct ids', twins[0]!.id !== twins[1]!.id))

  // every event that carries an id must resolve to a roster unit with that display name
  const byId = new Map(c.sim.roster.map(u => [u.id, u]))
  const scoped = c.nodes.filter(n => ids(n).length > 0)
  cases.push(raw('unit-scoped events exist', scoped.length > 0))
  const mismatched = scoped.filter(n => {
    const s = n.payload.sourceId
    const t = n.payload.targetId
    if (typeof s === 'string' && byId.has(s) && n.source !== undefined && byId.get(s)!.name !== n.source) return true
    if (typeof t === 'string' && byId.has(t) && n.target !== undefined && byId.get(t)!.name !== n.target) return true
    return false
  })
  cases.push(raw('sourceId/targetId resolve to the unit behind source/target', mismatched.length === 0))

  // the two same-named enemies stayed distinguishable: both roster ids show up in the stream
  const twinIds = new Set(twins.map(u => u.id))
  const twinEvents = c.nodes.filter(n => n.source === 'Twin' || n.target === 'Twin')
  cases.push(raw('events reference the same-named units', twinEvents.length > 0))
  const usedTwinIds = new Set(twinEvents.flatMap(ids).filter(id => twinIds.has(id)))
  cases.push(raw('both same-name units appear as distinct ids (never merged by name)', usedTwinIds.size === 2))

  // ACTION_START carries the actor id (turn headers were name-only before §43)
  const starts = all(c, 'ACTION_START')
  cases.push(raw('ACTION_START carries sourceId', starts.length > 0 && starts.every(n => typeof n.payload.sourceId === 'string')))
  cases.push(raw('ACTION_START sourceId resolves to the actor', starts.every(n => byId.get(n.payload.sourceId as string)?.name === n.source)))

  return cases
}
