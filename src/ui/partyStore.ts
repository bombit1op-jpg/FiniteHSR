/**
 * §Party Setup — persistence + the single bridge between the party collection and the battle store.
 *
 * The party collection is the source of truth for the SETUP tab; the battle store's `team` slice is
 * the source of truth for `collect()`/the engine. This module keeps them in sync: the ACTIVE party's
 * slots are mirrored into `store.team` so a run always uses exactly what the setup tab shows, and a
 * party switch replaces that slice wholesale (no row from the previous party leaks in).
 *
 * Persistence: versioned JSON in `localStorage` under `FiniteHSR.parties`. Reading is defensive —
 * an unparsable or older payload degrades to a valid empty collection instead of throwing, and the
 * legacy single-team array (if a future/older build ever wrote one) is migrated into one party.
 */
import { store, type TeamRowState } from './store'
import { DEFAULT_LEVELS } from '../core/kit'
import {
  type Party, type PartyCollection,
  emptyCollection, createParty, selectParty, renameParty, deleteParty,
  updatePartySlots, addSlot, removeSlot, activeParty, partyById, MAX_SLOTS,
} from '../core/party'

export const PARTIES_KEY = 'FiniteHSR.parties'
const SCHEMA = 1

interface Persisted { schema: number; collection: PartyCollection }

// ---------------------------------------------------------------- blank row

export const BLANK_STATS: TeamRowState['stats'] = {
  atk: undefined, spd: undefined, critRate: undefined, critDmg: undefined, be: undefined,
}

let rowSeq = 0
/** a fresh empty slot row (no character selected). id is unique per session. */
export function blankSlot(): TeamRowState {
  return {
    id: `s${rowSeq++}`,
    kitId: '',
    stats: { ...BLANK_STATS },
    coneId: '', si: 1, relic1: '', relic2: '', planar: '',
    eidolon: 0,
    levels: { ...DEFAULT_LEVELS },
    traces: true,
    energyStartFrac: undefined,
    techniqueUses: 0,
    skillPriority: 0, skillPattern: 'auto', skillRotation: '',
    strategy: {},
    pieces: [],
  }
}

/** re-key a restored row so it can never collide with a live session row id */
function rekey(s: TeamRowState): TeamRowState {
  return { ...s, id: `s${rowSeq++}` }
}

// ---------------------------------------------------------------- validation

function isRow(v: unknown): v is TeamRowState {
  return !!v && typeof v === 'object' && typeof (v as TeamRowState).id === 'string'
}

/** accept a persisted collection only when it structurally matches; otherwise empty */
function validate(v: unknown): PartyCollection {
  if (!v || typeof v !== 'object') return emptyCollection()
  const c = v as PartyCollection
  if (!Array.isArray(c.parties)) return emptyCollection()
  const parties: Party[] = []
  for (const p of c.parties) {
    if (!p || typeof p.id !== 'string' || !Array.isArray(p.slots)) continue
    parties.push({ id: p.id, name: typeof p.name === 'string' ? p.name : 'Отряд', slots: p.slots.filter(isRow).slice(0, MAX_SLOTS) })
  }
  const activeId = typeof c.activeId === 'string' && parties.some(p => p.id === c.activeId)
    ? c.activeId : (parties[0]?.id ?? null)
  return { parties, activeId }
}

// ---------------------------------------------------------------- load / save

export function loadCollection(): PartyCollection {
  const ls = globalThis.localStorage
  if (!ls) return emptyCollection()
  let raw: string | null = null
  try { raw = ls.getItem(PARTIES_KEY) } catch { return emptyCollection() }
  if (!raw) return emptyCollection()
  try {
    const parsed = JSON.parse(raw) as Persisted | TeamRowState[]
    // legacy shape: a bare array of team rows -> one party (safe migration, nothing dropped)
    if (Array.isArray(parsed)) {
      const slots = parsed.filter(isRow).map(rekey).slice(0, MAX_SLOTS)
      if (!slots.length) return emptyCollection()
      const created = createParty(emptyCollection(), slots)
      return { ...created, parties: created.parties.map(p => ({ ...p, name: 'Отряд 1' })) }
    }
    if (!parsed || typeof parsed !== 'object') return emptyCollection()
    const col = validate(parsed.collection)
    return { parties: col.parties.map(p => ({ ...p, slots: p.slots.map(rekey) })), activeId: col.activeId }
  } catch {
    return emptyCollection()
  }
}

export function saveCollection(c: PartyCollection): void {
  const ls = globalThis.localStorage
  if (!ls) return
  try { ls.setItem(PARTIES_KEY, JSON.stringify({ schema: SCHEMA, collection: c } satisfies Persisted)) } catch { /* quota/unavailable: ignore */ }
}

// ---------------------------------------------------------------- store bridge

/** replace the battle store's team slice with exactly these slots (drops any rows of the old party) */
export function pushSlotsToStore(slots: TeamRowState[]): void {
  const cur = store.getState().team
  for (const r of cur) store.dispatch({ type: 'team/remove', id: r.id })
  for (const s of slots) store.dispatch({ type: 'team/add', row: s })
}

/** refresh the store slice from a collection's active party (used on switch/create) */
export function syncActiveToStore(c: PartyCollection): void {
  pushSlotsToStore(activeParty(c)?.slots ?? [])
}

// ---------------------------------------------------------------- live controller

/**
 * Controls the live collection backed by the store. Every mutator persists immediately and mirrors
 * the active party into `store.team`, so the setup tab and a run never diverge.
 */
export class PartyStore {
  private col: PartyCollection

  constructor(col: PartyCollection = loadCollection()) {
    this.col = col
    if (!this.col.parties.length) this.col = createParty(this.col, Array.from({ length: MAX_SLOTS }, blankSlot))
    this.adoptLiveTeam()
    this.commit()
  }

  /**
   * One-time reconciliation with the battle store: if the active party is still all-blank but the
   * store already holds real rows (typed on the Настройка боя page), adopt those rows so both views
   * show the same team instead of the party tab silently starting empty. The store slice stays the
   * single source of truth for `collect()`; the party layer only mirrors it.
   */
  private adoptLiveTeam(): void {
    const p = activeParty(this.col)
    if (!p || p.slots.some(s => s.kitId)) return
    const live = store.getState().team.filter(r => r.kitId)
    if (!live.length) return
    const padded = [...live.slice(0, MAX_SLOTS), ...Array.from({ length: MAX_SLOTS - Math.min(live.length, MAX_SLOTS) }, blankSlot)]
    this.col = { ...this.col, parties: this.col.parties.map(x => x.id === p.id ? { ...x, slots: padded } : x) }
  }

  get collection(): PartyCollection { return this.col }
  get active(): Party | undefined { return activeParty(this.col) }

  private commit(): void {
    saveCollection(this.col)
    syncActiveToStore(this.col)
  }

  create(): Party {
    // guard: creating an empty party twice in one tick still yields distinct ids (nextId is monotonic)
    this.col = createParty(this.col, Array.from({ length: MAX_SLOTS }, blankSlot))
    this.commit()
    return activeParty(this.col)!
  }

  select(id: string): void { this.col = selectParty(this.col, id); this.commit() }
  rename(name: string, id?: string): void { this.col = renameParty(this.col, name, id ?? this.col.activeId ?? ''); this.commit() }
  remove(id: string): void { this.col = deleteParty(this.col, id); this.commit() }

  addSlot(): TeamRowState | null {
    const p = this.active
    if (!p || p.slots.length >= MAX_SLOTS) return null
    const row = blankSlot()
    this.col = addSlot(this.col, p.id, row)
    this.commit()
    return row
  }

  removeSlot(rowId: string): void { if (this.col.activeId) { this.col = removeSlot(this.col, this.col.activeId, rowId); this.commit() } }

  /** patch one slot in the active party (the row-editor's write path) */
  patchSlot(rowId: string, patch: Partial<TeamRowState>): void {
    const id = this.col.activeId
    if (!id) return
    this.col = updatePartySlots(this.col, id, slots => slots.map(s => (s.id === rowId ? { ...s, ...patch } : s)))
    this.commit()
  }

  /** merge a whole row (already-mutated) back into the active party by id */
  putSlot(row: TeamRowState): void { this.patchSlot(row.id, row) }

  byId(id: string): Party | undefined { return partyById(this.col, id) }
}

/** test/init helper: read the persisted collection without constructing a controller */
export { validate as validateCollection }
