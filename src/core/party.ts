/**
 * §Party Setup — pure party model (rule 84.1: no DOM, no domain logic, no engine calls).
 *
 * A `Party` is a named configuration of up to four character slots. A slot IS a `TeamRowState`
 * (the existing battle-store row type) — the party layer does not invent a parallel build format;
 * it groups the rows the engine already consumes. `PartyCollection` holds the saved parties plus
 * the active party id.
 *
 * Everything here is a pure `prev -> next` transform so the UI can render from state and the
 * persistence layer can serialize the exact same objects. Identity is the stable `id`; the
 * user-facing `name` is editable and never used as an identifier.
 */
import type { TeamRowState } from '../ui/store'

export const MAX_SLOTS = 4

export interface Party {
  /** stable internal id — never derived from the name */
  id: string
  name: string
  slots: TeamRowState[]
}

export interface PartyCollection {
  parties: Party[]
  activeId: string | null
}

export const emptyCollection = (): PartyCollection => ({ parties: [], activeId: null })

/** next free `p<N>` id; monotonic over existing ids so ids never collide across a session */
function nextId(c: PartyCollection): string {
  let n = 1
  const used = new Set(c.parties.map(p => p.id))
  while (used.has(`p${n}`)) n++
  return `p${n}`
}

/** next default name that does not clash with an existing one (name is a label, not identity) */
function nextName(c: PartyCollection): string {
  const used = new Set(c.parties.map(p => p.name))
  let n = 1
  while (used.has(`Отряд ${n}`)) n++
  return `Отряд ${n}`
}

export function activeParty(c: PartyCollection): Party | undefined {
  return c.parties.find(p => p.id === c.activeId)
}

export function partyById(c: PartyCollection, id: string): Party | undefined {
  return c.parties.find(p => p.id === id)
}

/**
 * Create a new, independent party (fresh empty slots) and make it active. Repeated calls always
 * return a NEW party — the caller must not call twice for one user action (guarded in the UI too).
 */
export function createParty(c: PartyCollection, slots: TeamRowState[] = []): PartyCollection {
  const party: Party = { id: nextId(c), name: nextName(c), slots: slots.slice(0, MAX_SLOTS) }
  return { parties: [...c.parties, party], activeId: party.id }
}

/** select an existing party; unknown id is a no-op (keeps the current active party) */
export function selectParty(c: PartyCollection, id: string): PartyCollection {
  return partyById(c, id) ? { ...c, activeId: id } : c
}

/** rename the active (or given) party — never creates a party, never changes its id */
export function renameParty(c: PartyCollection, name: string, id = c.activeId ?? ''): PartyCollection {
  const trimmed = name.trim()
  return {
    ...c,
    parties: c.parties.map(p => (p.id === id ? { ...p, name: trimmed || p.name } : p)),
  }
}

export function deleteParty(c: PartyCollection, id: string): PartyCollection {
  const parties = c.parties.filter(p => p.id !== id)
  const activeId = c.activeId === id ? (parties[0]?.id ?? null) : c.activeId
  return { parties, activeId }
}

/** apply a transform to ONE party's slots (immutably) — other parties are untouched */
export function updatePartySlots(c: PartyCollection, id: string, fn: (slots: TeamRowState[]) => TeamRowState[]): PartyCollection {
  if (!partyById(c, id)) return c
  return { ...c, parties: c.parties.map(p => (p.id === id ? { ...p, slots: fn(p.slots).slice(0, MAX_SLOTS) } : p)) }
}

/** replace one slot by row id; no-op when the row is not in the party or the patch is empty */
export function patchSlot(c: PartyCollection, id: string, rowId: string, patch: Partial<TeamRowState>): PartyCollection {
  return updatePartySlots(c, id, slots => slots.map(s => (s.id === rowId ? { ...s, ...patch } : s)))
}

/** add a slot (respects MAX_SLOTS); duplicates by row id are ignored */
export function addSlot(c: PartyCollection, id: string, row: TeamRowState): PartyCollection {
  return updatePartySlots(c, id, slots =>
    slots.length >= MAX_SLOTS || slots.some(s => s.id === row.id) ? slots : [...slots, row])
}

export function removeSlot(c: PartyCollection, id: string, rowId: string): PartyCollection {
  return updatePartySlots(c, id, slots => slots.filter(s => s.id !== rowId))
}
