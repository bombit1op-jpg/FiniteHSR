import { raw } from '../_helpers/battle'
import { createStore, subscribeSlice, store, rootReducer, initialState, type TeamRowState } from '../../src/ui/store'

/**
 * §84 G6 — store slice-reducer semantics. The store is the GUI's only state owner
 * (rule 84.1: no domain logic in state); these checks pin the reducer contract the
 * workspaces rely on — id-scoped updates, slice-scoped subscriptions, bounded history.
 */
export default () => {
  const fresh = () => createStore(rootReducer, structuredClone(initialState))

  const row = (id: string, patch: Partial<TeamRowState> = {}): TeamRowState => ({
    id, kitId: 'hook', stats: {}, coneId: '', si: 1, relic1: '', relic2: '', planar: '',
    eidolon: 0, levels: { basic: 1, skill: 1, ult: 1, talent: 1 }, traces: false,
    skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [], ...patch,
  })

  // createStore keeps the exact object it was handed
  const given = structuredClone(initialState)
  const probe = createStore(rootReducer, given)

  const s0 = fresh()
  s0.dispatch({ type: 'team/add', row: row('a') })
  const one = s0.getState()
  s0.dispatch({ type: 'team/update', id: 'a', patch: { kitId: 'seele' } })
  const two = s0.getState()
  s0.dispatch({ type: 'team/remove', id: 'a' })
  const three = s0.getState()

  // an unknown action leaves every slice value unchanged (root object may still be fresh)
  const beforeUnknown = s0.getState()
  let notified = 0
  const unsub = s0.subscribe(() => notified++)
  s0.dispatch({ type: 'nope/unknown' })
  const afterUnknown = s0.getState()
  const notifiedUnknown = notified
  s0.dispatch({ type: 'team/add', row: row('b') })
  const notifiedAdd = notified
  unsub()
  s0.dispatch({ type: 'team/add', row: row('c') })

  // subscribeSlice is bound to the singleton store; fires only when its slice ref changes
  let enemyHits = 0, teamHits = 0
  const u1 = subscribeSlice('enemy', () => enemyHits++)
  const u2 = subscribeSlice('team', () => teamHits++)
  store.dispatch({ type: 'run/set', patch: { cycles: 9 } })
  store.dispatch({ type: 'enemy/set', patch: { count: 5 } })
  u1(); u2()

  // history is bounded to 12 (HISTORY_LIMIT) so comparison cannot retain unbounded sims
  const s2 = fresh()
  for (let i = 0; i < 15; i++) s2.dispatch({ type: 'history/add', sim: {} as never, setup: {} as never, label: `run${i}` })
  const hist = s2.getState().history

  return [
    raw('createStore returns the exact object it was given', probe.getState() === given),
    raw('team/add appends a row', one.team.length === 1 && one.team[0].id === 'a'),
    raw('team/update patches the matching row only', two.team[0].kitId === 'seele'),
    raw('team/update keeps other rows intact', one.team[0].kitId === 'hook'),
    raw('team/remove drops the row', three.team.length === 0),
    raw('unknown action leaves slice values unchanged', JSON.stringify(beforeUnknown) === JSON.stringify(afterUnknown)),
    raw('a real change notifies subscribers once', notifiedAdd === notifiedUnknown + 1, `${notifiedUnknown} -> ${notifiedAdd}`),
    raw('unsubscribe stops notifications', notified === notifiedAdd, `notified=${notified}`),
    raw('unsubscribed dispatch still mutates state', s0.getState().team.length === 2, 'b+c present'),
    raw('subscribeSlice fires only on its own slice', enemyHits === 1 && teamHits === 0, `enemy=${enemyHits} team=${teamHits}`),
    raw('history is capped at 12 records', hist.length === 12, `${hist.length}`),
    raw('history keeps the most recent records', hist[hist.length - 1].label === 'run14', hist[hist.length - 1].label),
  ]
}
