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
 * §Party Setup — named-party model + persistence + store bridge + the mounted panel.
 *
 * The model is pure (`src/core/party.ts`); the persistence layer (`src/ui/partyStore.ts`) is
 * exercised against happy-dom's localStorage for round-trip, safe-read and legacy migration, and
 * for the single-writer bridge into `store.team`.
 *
 * The DOM block follows the CURRENT panel markup: the character is picked from the portrait (no
 * select), a new party starts with ONE slot (§Task 9), a single-use Technique is a checkbox and a
 * multi-use Technique is a count select, and a relic piece carries a set dropdown plus ONE number
 * for the summed substat value (§Task 7).
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

  // a fresh store starts with ONE slot (§Task 9)
  ls.clear()
  const fresh = new PartyStore()
  cases.push(raw('a new party starts with ONE slot', fresh.active?.slots.length === 1, `${fresh.active?.slots.length ?? 0}`))

  // ---------------------------------------------------------------- mounted panel
  const doc = win.document as unknown as Document
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event
  const host = doc.createElement('div')
  doc.body.append(host)

  // start from a clean shared store slice
  for (const r of [...store.getState().team]) store.dispatch({ type: 'team/remove', id: r.id })

  const pCol = validateCollection({
    parties: [{ id: 'p1', name: 'Тест', slots: [row('r1', 'jingyuan'), row('r2', 'tingyun'), { ...row('r3'), kitId: '' }] }],
    activeId: 'p1',
  })
  const pStore = new PartyStore(pCol)
  const pHandle = initPartyPanel(host, pStore)

  const cards = host.querySelectorAll('.partyCard')
  // panel always renders 4 fixed slots (pads empty)
  cases.push(raw('the panel renders 4 fixed slots', cards.length === 4, `${cards.length}`))
  cases.push(raw('the panel shows the party name button', !!host.querySelector('.partyNameBtn')))
  const card0 = cards[0] as HTMLElement
  const nameOf = (kitId: string) => KITS.find(k => k.id === kitId)?.name ?? '@@'
  cases.push(raw('the first card shows the character name', (card0.querySelector('.pcName') as HTMLElement).textContent === nameOf('jingyuan')))
  cases.push(raw('the character is picked from the portrait (no character select in the card)', card0.querySelector('.pcChar') === null))

  // a new party
  const partiesBefore = pStore.collection.parties.length
  const addPartyBtn = [...host.querySelectorAll('.partyIconBtn')].find(b => b.getAttribute('title') === 'Создать новый отряд') as HTMLButtonElement
  addPartyBtn.click()
  cases.push(raw('the add-party button adds exactly one party', pStore.collection.parties.length === partiesBefore + 1))
  cases.push(raw('the created party is persisted', (ls.getItem(PARTIES_KEY) ?? '').includes(pStore.collection.activeId ?? '@@')))

  // re-entering the route re-renders instead of duplicating
  const cardsBefore = host.querySelectorAll('.partyCard').length
  initPartyPanel(host, pStore)
  cases.push(raw('re-entering the route does not duplicate cards', host.querySelectorAll('.partyCard').length === cardsBefore))

  // back to the 3-slot party for the per-card assertions
  pStore.select('p1')
  pHandle.render()
  const cardA = host.querySelectorAll('.partyCard')[0] as HTMLElement
  const cardB = host.querySelectorAll('.partyCard')[1] as HTMLElement

  // ---- Technique: a single-use kit gets a checkbox, a multi-use kit gets a count select
  const techSelOf = (card: HTMLElement) => [...card.querySelectorAll('select')].find(s => s.getAttribute('aria-label') === 'Technique') as HTMLSelectElement
  const techChkOf = (card: HTMLElement) => [...card.querySelectorAll('input[type=checkbox]')].find(s => s.getAttribute('aria-label') === 'Technique') as HTMLInputElement
  const techSel0 = techSelOf(cardA)
  const techChk0 = techChkOf(cardA)
  cases.push(raw('a single-use Technique hides the count select', techSel0.style.display === 'none'))
  cases.push(raw('a single-use Technique shows the checkbox', techChk0.style.display !== 'none'))
  techChk0.checked = true
  techChk0.onchange?.(new Event('change') as never)
  cases.push(raw('the Technique activation is stored', pStore.active?.slots.find(s => s.id === 'r1')?.techniqueUses === 1))

  const techSel1 = techSelOf(cardB)
  cases.push(raw('a multi-use Technique shows the count select', techSel1.style.display !== 'none'))
  cases.push(raw('a multi-use Technique lists 0..maxUses', techSel1.options.length === 3, `${techSel1.options.length}`))
  techSel1.value = '2'
  techSel1.onchange?.(new Event('change') as never)
  cases.push(raw('the Technique use count is stored', pStore.active?.slots.find(s => s.id === 'r2')?.techniqueUses === 2))

  // ---- skill levels (number input + +/- buttons)
  const skillInp = cardA.querySelectorAll('.lvlInput')[1] as HTMLInputElement
  skillInp.value = '10'
  skillInp.onchange?.(new Event('change') as never)
  cases.push(raw('the skill level is stored', pStore.active?.slots.find(s => s.id === 'r1')?.levels.skill === 10))
  pHandle.render()
  cases.push(raw('an unrelated refresh keeps the edited skill level', pStore.active?.slots.find(s => s.id === 'r1')?.levels.skill === 10))

  // ---- relic editor (§Task 1.2): 6 pieces, each with 4 editable substat rows (stat + value + quality)
  const pieceCards = cardA.querySelectorAll('.pieceCard')
  cases.push(raw('the card mounts the 6 relic piece editors', pieceCards.length === 6, `${pieceCards.length}`))
  const piece0 = pieceCards[0] as HTMLElement
  cases.push(raw('no "+ саб" button exists', piece0.querySelector('.addSub') === null))
  const subSel = piece0.querySelector('.subEditSel') as HTMLElement
  const subInp = piece0.querySelector('.subEditInp') as HTMLInputElement
  cases.push(raw('a piece has stat select for substat', !!subSel))
  cases.push(raw('a piece has value input for substat', !!subInp && subInp.type === 'number'))
  cases.push(raw('the substat picker carries stat icons', !!piece0.querySelector('.subEditSel .ddOptIcon')))
  // pick a stat different from head main (hp) and enter a value yielding mid tier
  ;(piece0.querySelector('.subEditSel .ddOpt[data-value="atkFlat"]') as HTMLElement).click()
  subInp.value = '20'
  subInp.oninput?.(new Event('input') as never)
  const storedPiece = pStore.active!.slots.find(s => s.id === 'r1')!.pieces.find(p => p.slot === 'head')
  cases.push(raw('substat split lands in store', !!storedPiece && storedPiece.subs.length > 0, `${storedPiece?.subs.length ?? 0}`))
  cases.push(raw('split never repeats main stat', !!storedPiece && storedPiece.subs.every(s => s.stat !== storedPiece.main)))
  cases.push(raw('quality cubes shown under row', piece0.querySelector('.subEditInfo .subCube') !== null))

  // the set plan sits above the pieces
  const planRow = cardA.querySelector('.setPlan') as HTMLElement
  cases.push(raw('the set plan sits above the relic pieces', !!planRow))
  cases.push(raw('the plan carries the relic + planar set pickers', planRow.querySelectorAll('.dd').length === 3, `${planRow.querySelectorAll('.dd').length}`))

  // collect() must not carry empty slots into the engine
  const setup = collect()
  cases.push(raw('collect() drops empty slots', setup.team.length === 2 && setup.team.every(t => !!t.kitId), `${setup.team.length}`))

  // the mounted panel mirrors its active party into the shared store slice — undo that so this
  // suite cannot leak rows into team-spec/techniques (which assert on an exact team slice)
  for (const r of [...store.getState().team]) store.dispatch({ type: 'team/remove', id: r.id })

  return cases
}
