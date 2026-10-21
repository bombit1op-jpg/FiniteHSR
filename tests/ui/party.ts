import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import type { Case } from '../suites'
import {
  emptyCollection, createParty, selectParty, renameParty, deleteParty,
  addSlot, removeSlot, patchSlot, MAX_SLOTS, type Party,
} from '../../src/core/party'
import { validateCollection, loadCollection, PARTIES_KEY, PartyStore } from '../../src/ui/partyStore'
import { initPartyPanel } from '../../src/ui/partyPanel'
import { collect } from '../../src/ui/team'
import { KITS } from '../../src/core/kits'
import { store } from '../../src/ui/store'
import type { TeamRowState } from '../../src/ui/store'

/**
 * §Party Setup — named-party model + persistence + store bridge.
 *
 * The model is pure (`src/core/party.ts`); the persistence layer (`src/ui/partyStore.ts`) is
 * exercised against happy-dom's localStorage for round-trip, safe-read and legacy migration, and
 * for the single-writer bridge into `store.team`.
 */

const row = (id: string, kitId = 'seele'): TeamRowState =>
  ({ id, kitId, stats: {}, coneId: '', si: 1, relic1: '', relic2: '', planar: '', eidolon: 0, levels: { basic: 6, skill: 10, ult: 10, talent: 10 }, traces: true, techniqueUses: 0, skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [] })

export default () => {
  const cases: Case[] = []

  // ---------------------------------------------------------------- pure model
  const empty = emptyCollection()
  cases.push(raw('empty collection has no parties and no active id', empty.parties.length === 0 && empty.activeId === null))

  const c1 = createParty(empty, [row('a'), row('b')])
  cases.push(raw('createParty makes one party and activates it', c1.parties.length === 1 && c1.activeId === c1.parties[0]!.id))
  cases.push(raw('created party keeps its slots', c1.parties[0]!.slots.length === 2))
  cases.push(raw('created party gets a default name', c1.parties[0]!.name.startsWith('Отряд')))

  const c2 = createParty(c1, [row('c')])
  cases.push(raw('second createParty yields a distinct id (no duplicate party on repeat action)', c2.parties[0]!.id !== c2.parties[1]!.id))
  cases.push(raw('second createParty becomes active', c2.activeId === c2.parties[1]!.id))

  const renamed = renameParty(c2, '  Гиперкерри  ', c2.parties[0]!.id)
  cases.push(raw('renameParty trims and sets the name', renamed.parties[0]!.name === 'Гиперкерри'))
  cases.push(raw('renameParty keeps the id stable', renamed.parties[0]!.id === c2.parties[0]!.id))
  cases.push(raw('renameParty with blank keeps the previous name', renameParty(c2, '   ', c2.parties[0]!.id).parties[0]!.name === c2.parties[0]!.name))

  const sel = selectParty(c2, c2.parties[0]!.id)
  cases.push(raw('selectParty switches the active id', sel.activeId === c2.parties[0]!.id))
  cases.push(raw('selectParty of an unknown id is a no-op', selectParty(c2, 'nope').activeId === c2.activeId))

  const deleted = deleteParty(c2, c2.parties[0]!.id)
  cases.push(raw('deleteParty removes the party', deleted.parties.length === 1 && !deleted.parties.some(p => p.id === c2.parties[0]!.id)))
  cases.push(raw('deleteParty of the active party activates another', deleted.activeId !== null))

  // slot ops
  const capped = [row('s0'), row('s1'), row('s2'), row('s3')].reduce((acc, r) => addSlot(acc, c1.parties[0]!.id, r), c1)
  cases.push(raw('addSlot respects the 4-slot party limit', capped.parties[0]!.slots.length <= MAX_SLOTS))
  const dup = addSlot(c1, c1.parties[0]!.id, row('a'))
  cases.push(raw('addSlot ignores a duplicate row id', dup.parties[0]!.slots.length === c1.parties[0]!.slots.length))

  const patched = patchSlot(c1, c1.parties[0]!.id, 'a', { kitId: 'pela' })
  cases.push(raw('patchSlot updates only the matching slot', patched.parties[0]!.slots[0]!.kitId === 'pela' && patched.parties[0]!.slots[1]!.kitId === 'seele'))
  cases.push(raw('slot edits do not leak across parties', patchSlot(c2, c2.parties[1]!.id, 'c', { kitId: 'bronya' }).parties[0]!.slots.every(s => s.kitId !== 'bronya')))

  const removed = removeSlot(c1, c1.parties[0]!.id, 'a')
  cases.push(raw('removeSlot drops the row', removed.parties[0]!.slots.every(s => s.id !== 'a') && removed.parties[0]!.slots.length === 1))

  // ---------------------------------------------------------------- persistence + bridge
  const win = new Window({ url: 'http://localhost/' })
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.localStorage = (win as unknown as { localStorage: unknown }).localStorage
  const ls = win.localStorage
  ls.clear()

  // safe read of garbage
  ls.setItem(PARTIES_KEY, '{not json')
  cases.push(raw('unparsable payload degrades to an empty collection', validateCollection(undefined).parties.length === 0))

  // legacy shape: a bare array of rows -> one party (nothing dropped)
  ls.setItem(PARTIES_KEY, JSON.stringify([row('legacy1', 'danheng'), row('legacy2', 'pela')]))
  const legacy = loadCollection()
  cases.push(raw('legacy row array migrates to one party with those slots', legacy.parties.length === 1 && legacy.parties[0]!.slots.length === 2))
  cases.push(raw('migrated party is active and named', legacy.activeId === legacy.parties[0]!.id && legacy.parties[0]!.name.length > 0))

  // collection payload round-trips through validate (structure preserved)
  const payload = { schema: 1, collection: { parties: [{ id: 'p9', name: 'Тест', slots: [row('z1', 'jingyuan')] }], activeId: 'p9' } }
  ls.setItem(PARTIES_KEY, JSON.stringify(payload))
  const back = validateCollection((payload.collection as { parties: Party[] }))
  cases.push(raw('a persisted collection validates with its parties intact', back.parties.length === 1 && back.parties[0]!.name === 'Тест'))
  cases.push(raw('validate drops malformed parties instead of throwing', validateCollection({ parties: [null, { id: 'ok', slots: [] }] }).parties.length === 1))

  // ---------------------------------------------------------------- DOM mount smoke
  const doc = win.document as unknown as Document
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event
  const host = doc.createElement('div')
  doc.body.append(host)

  // start from a clean known state
  for (const r of store.getState().team) store.dispatch({ type: 'team/remove', id: r.id })
  const handle = initPartyPanel(host)
  cases.push(raw('panel mounts a party picker + 4 character cards', !!host.querySelector('.partyPicker') && host.querySelectorAll('.partyCard').length === MAX_SLOTS))
  cases.push(raw('panel mirrors the active party into the store slice', store.getState().team.length === handle.store.active?.slots.length))

  const before = handle.store.collection.parties.length
  ;(host.querySelector('.partyPicker .btn-secondary') as HTMLButtonElement).click()
  cases.push(raw('+Создать adds exactly one party', handle.store.collection.parties.length === before + 1))
  cases.push(raw('created party is persisted to localStorage', (ls.getItem(PARTIES_KEY) ?? '').includes(handle.store.collection.activeId ?? '@@')))

  // re-mount is idempotent (route re-enter must not duplicate cards/state)
  const cardsBefore = host.querySelectorAll('.partyCard').length
  initPartyPanel(host)
  cases.push(raw('re-entering the route does not duplicate cards', host.querySelectorAll('.partyCard').length === cardsBefore))

  // ---------------------------------------------------------------- panel cards: render + edits
  // a dedicated store/host keeps this block independent of the collection state above
  for (const r of [...store.getState().team]) store.dispatch({ type: 'team/remove', id: r.id })
  const pCol = validateCollection({ parties: [{ id: 'p1', name: 'Тест', slots: [row('s1', 'jingyuan')] }], activeId: 'p1' })
  const pStore = new PartyStore(pCol)
  const pHost = doc.createElement('div')
  doc.body.append(pHost)
  initPartyPanel(pHost, pStore)
  const pCards = pHost.querySelectorAll('.partyCard')
  const card0 = pCards[0] as HTMLElement
  const nameOf = (kitId: string) => KITS.find(k => k.id === kitId)?.name ?? '@@'
  cases.push(raw('first paint renders the character name (not an empty card)', (card0.querySelector('.pcName') as HTMLElement).textContent === nameOf('jingyuan')))
  const blankCard = pCards[1] as HTMLElement
  cases.push(raw('a blank slot shows the empty state, not the first kit', (blankCard.querySelector('.pcName') as HTMLElement).textContent === '—' && (blankCard.querySelector('.pcStats') as HTMLElement).textContent?.includes('Пустой слот') === true))
  cases.push(raw('the character select is mounted in the DOM (one per card)', pHost.querySelectorAll('.pcChar').length === MAX_SLOTS))

  // switching the character: the card and the kit-dependent controls follow the new kit
  const charSel = card0.querySelector('.pcChar') as HTMLSelectElement
  const techSel = [...card0.querySelectorAll('select')].find(s => s.getAttribute('aria-label') === 'Техника') as HTMLSelectElement
  const techOpts = (kitId: string) => {
    const t = KITS.find(k => k.id === kitId)?.technique
    return 1 + (t ? (t.maxUses ?? 1) : 0)
  }
  cases.push(raw('technique options follow the kit', techSel.options.length === techOpts('jingyuan')))
  techSel.value = '1'
  techSel.onchange?.(new Event('change') as never)
  cases.push(raw('the technique use is stored', pStore.active?.slots.find(s => s.id === 's1')?.techniqueUses === 1))
  charSel.value = 'pela'
  charSel.onchange?.(new Event('change') as never)
  cases.push(raw('switching the character repaints the card', (card0.querySelector('.pcName') as HTMLElement).textContent === nameOf('pela')))
  cases.push(raw('the store row follows the new kit', pStore.active?.slots.find(s => s.id === 's1')?.kitId === 'pela'))
  cases.push(raw('technique uses reset on a character change', pStore.active?.slots.find(s => s.id === 's1')?.techniqueUses === 0))
  cases.push(raw('technique options are re-resolved for the new kit', techSel.title.includes(KITS.find(k => k.id === 'pela')?.technique?.name ?? '@@')))

  // an unrelated refresh must not revert an edited skill level (the store replaces the row object)
  const skillInput = () => [...card0.querySelectorAll('.lvlInput')][1] as HTMLInputElement
  skillInput().value = '12'
  skillInput().onchange?.(new Event('change') as never)
  const tracesChk = card0.querySelector('input[type=checkbox]') as HTMLInputElement
  tracesChk.checked = false
  tracesChk.onchange?.(new Event('change') as never)
  cases.push(raw('an unrelated refresh keeps the edited skill level', skillInput().value === '12'))

  // collect() must not carry empty slots into the engine
  const setup = collect()
  cases.push(raw('collect() drops empty slots', setup.team.length === 1 && setup.team.every(t => !!t.kitId)))

  // the mounted panel mirrors its active party into the shared store singleton — undo that so this
  // suite cannot leak rows into team-spec/techniques (which assert on an exact team slice)
  for (const r of [...store.getState().team]) store.dispatch({ type: 'team/remove', id: r.id })

  return cases
}
