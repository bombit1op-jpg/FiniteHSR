/**
 * §Party Setup — the "Отряд" tab: a named-party manager plus one card per character slot.
 *
 * UI-only (rule 84.1): this module renders from `PartyStore` and writes back through it, so every
 * edit is persisted and mirrored into `store.team` (the engine's input) in the same step. It owns
 * no stat/gear math — final stats come from `charFinalStats` (the engine's own setup path) and gear
 * pieces are edited with the SAME `buildPieceEditors` widget the battle page uses (no second gear
 * model, no duplicated controls).
 *
 * Container ids are distinct from the player page's singletons (`team`, `run`, …): the party tab
 * must not clone any control that already has exactly one canonical instance in `#panel-player`.
 */
import { KITS, KIT_PATH } from '../core/kits'
import type { TeamSpec } from '../core/battle'
import { el, fillSelect } from './dom'
import { Dropdown } from './dropdown'
import { coneOptions, signatureCone } from '../core/gearOrder'
import type { TeamRowState } from './store'
import {
  metaBadge, updateMetaBadges, gearBadge, updateGearBadge, statBadge, ratingTierClass,
  charPortrait, updateCharPortrait, updatePieceBadge, abilityBadge, abilityIconUrl,
} from './icons'
import { buildPieceEditors, pieceOf, toTeamSpec, type PieceEditor } from './team'
import { scoreRelic } from '../core/relicScore'
import { charFinalStats, SKILL_LABELS } from '../core/charStats'
import { PartyStore } from './partyStore'
import { MAX_SLOTS } from '../core/party'
import { openCharacterPicker, openConePicker, openPartyListPicker } from './pickers'
import { levelCaps } from '../core/battle'
import { ABILITY_NAMES } from '../core/abilityNames'
import { PROG } from '../core/progression'

interface CardView {
  rowId: string
  root: HTMLElement
  portrait: HTMLElement
  elemChip: HTMLElement
  pathChip: HTMLElement
  nameEl: HTMLElement
  charSel: HTMLSelectElement
  charLevelInp: HTMLInputElement
  coneBadge: HTMLElement
  coneNameEl: HTMLElement
  coneSel: Dropdown
  siSel: HTMLSelectElement
  coneLevelInp: HTMLInputElement
  eidButtons: HTMLButtonElement[]
  lvBtns: Record<string, { dec: HTMLButtonElement, val: HTMLElement, inc: HTMLButtonElement, inp: HTMLInputElement }>
  tracesWrap: HTMLElement
  energySel: HTMLSelectElement
  techniqueSel: HTMLSelectElement
  techniqueWrap: HTMLLabelElement
  pieces: PieceEditor[]
  statsBox: HTMLElement
  skillsBox: HTMLElement
  tracesBox: HTMLElement
  refresh: () => void
}



export interface PartyPanelHandle {
  store: PartyStore
  root: HTMLElement
  render: () => void
}

let sharedStore: PartyStore | null = null

/** mounted panel per host — a route re-enter re-renders instead of rebuilding/duplicating state */
const mounted = new WeakMap<HTMLElement, PartyPanelHandle>()

/** the live party store (one per app session); created lazily so tests can inject their own */
export function partyStore(): PartyStore {
  if (!sharedStore) sharedStore = new PartyStore()
  return sharedStore
}

/**
 * Mount the Party Setup UI into a host element. Idempotent per host (the route enter hook may fire
 * repeatedly): a second call reuses the existing instance and just re-renders from the live store.
 */
export function initPartyPanel(host: HTMLElement, existing?: PartyStore): PartyPanelHandle {
  const store = existing ?? partyStore()
  const prev = mounted.get(host)
  if (prev && prev.store === store) { prev.render(); return prev }
  host.innerHTML = ''
  const root = el('div', 'partyRoot')
  host.append(root)

  // top bar: compact party header (name + pencil/+/-), click name to pick party
  const head = el('header', 'partyHead')
  const headText = el('div', 'partyHeadText')
  const eyebrow = el('div', 'eyebrow')
  eyebrow.textContent = 'FINITE HSR / PARTY SETUP'
  const heading = el('h1', 'partyHeading')
  heading.textContent = 'PARTY'
  headText.append(eyebrow, heading)

  const partyHeader = el('div', 'partyHeader')
  const partyNameBtn = el('button', 'partyNameBtn') as HTMLButtonElement
  partyNameBtn.type = 'button'
  const partyNameText = el('span', 'partyNameText')
  partyNameBtn.append(partyNameText)
  const editNameBtn = el('button', 'partyIconBtn') as HTMLButtonElement
  editNameBtn.type = 'button'
  editNameBtn.textContent = '✎'
  editNameBtn.title = 'Переименовать отряд'
  const addPartyBtn = el('button', 'partyIconBtn') as HTMLButtonElement
  addPartyBtn.type = 'button'
  addPartyBtn.textContent = '+'
  addPartyBtn.title = 'Создать новый отряд'
  const delPartyBtn = el('button', 'partyIconBtn') as HTMLButtonElement
  delPartyBtn.type = 'button'
  delPartyBtn.textContent = '🗑'
  delPartyBtn.title = 'Удалить отряд'
  partyHeader.append(partyNameBtn, editNameBtn, addPartyBtn, delPartyBtn)
  head.append(headText, partyHeader)
  root.append(head)

  const cardsHost = el('div', 'partyCards')
  root.append(cardsHost)

  const addSlotBtn = el('button', 'addSlotBtn') as HTMLButtonElement
  addSlotBtn.type = 'button'
  addSlotBtn.textContent = '+ Слот'
  root.append(addSlotBtn)

  const cards = new Map<string, CardView>()

  // -------------------------------------------------------------- party actions

  partyNameBtn.onclick = async () => {
    const col = store.collection
    const id = await openPartyListPicker({ parties: col.parties, activeId: col.activeId })
    if (id) { store.select(id); render() }
  }
  editNameBtn.onclick = () => {
    const active = store.active
    if (!active) return
    const name = prompt('Название отряда', active.name)
    if (name === null) return
    store.rename(name)
    paintPicker()
    render()
  }
  addPartyBtn.onclick = () => {
    if (addPartyBtn.disabled) return
    addPartyBtn.disabled = true
    // ensure at least 1 slot
    const p = store.create()
    if (p && p.slots.length === 0) {
      for (let i = 0; i < 1; i++) store.addSlot()
    }
    render()
    addPartyBtn.disabled = false
  }
  delPartyBtn.onclick = () => {
    if (store.collection.parties.length <= 1) return
    store.remove(store.collection.activeId ?? '')
    render()
  }
  addSlotBtn.onclick = () => { if (store.addSlot()) render() }

  // -------------------------------------------------------------- card

  function makeCard(row: TeamRowState): CardView {
    const root = el('div', 'partyCard')

    // --- hero art + identity (pick character by clicking portrait)
    const portrait = charPortrait(row.kitId || '')
    portrait.style.cursor = 'pointer'
    portrait.title = 'Выбрать персонажа'
    const charSel = el('select', 'pcChar') as HTMLSelectElement
    fillSelect(charSel, [['', '— персонаж —'], ...KITS.map(k => [k.id, `${k.name} (${k.elem})`] as [string, string])])
    charSel.value = row.kitId || ''
    charSel.setAttribute('aria-label', 'Персонаж')
    const pickChar = async () => {
      const active = store.active
      const exclude = (active?.slots.map(s => s.kitId).filter(Boolean) as string[]) ?? []
      if (row.kitId) exclude.push(row.kitId) // allow keeping current
      const chosen = await openCharacterPicker({ exclude: exclude.filter(id => id !== row.kitId), current: row.kitId || undefined })
      if (chosen === null) return
      if (chosen === '') {
        clearSlot(row.id); render(); return
      }
      charSel.value = chosen
      charSel.classList.remove('open')
      patch({ kitId: chosen, coneId: '', relic1: '', relic2: '', planar: '', pieces: [], techniqueUses: 0 })
      render()
    }
    portrait.onclick = pickChar
    const identity = el('div', 'pcIdentity')
    const nameRow = el('div', 'pcNameRow')
    const nameEl = el('div', 'pcName')
    nameEl.style.cursor = 'pointer'
    nameEl.title = 'Выбрать персонажа'
    nameEl.onclick = pickChar
    const chips = el('div', 'pcChips')
    const elemChip = metaBadge('elem', '')
    const pathChip = metaBadge('path', '')
    chips.append(elemChip, pathChip)
    nameRow.append(nameEl, charSel, chips)
    const charLevelInp = el('input') as HTMLInputElement
    charLevelInp.type = 'number'
    charLevelInp.min = '1'
    charLevelInp.max = '80'
    charLevelInp.className = 'lvlInputNum'
    charLevelInp.setAttribute('aria-label', 'Уровень персонажа')
    charLevelInp.value = String(row.level ?? 80)
    const delSlot = el('button', 'pcClear') as HTMLButtonElement
    delSlot.type = 'button'
    delSlot.textContent = '✕'
    delSlot.title = 'Очистить слот'
    delSlot.onclick = () => { clearSlot(row.id); render() }
    identity.append(nameRow, charLevelInp, delSlot)
    root.append(portrait, identity)

    const body = el('div', 'pcBody')

    // --- eidolons: E1..E6 toggle buttons (unselected grey, E6 gets shimmer when active)
    const eidSection = section('ЭЙДОЛОНЫ')
    const eidRow = el('div', 'eidolons')
    const eidButtons: HTMLButtonElement[] = []
    for (let e = 1; e <= 6; e++) {
      const b = el('button', 'eidolon') as HTMLButtonElement
      b.type = 'button'
      b.dataset.eidolon = String(e)
      b.textContent = `E${e}`
      b.onclick = () => {
        const next = (Number(store.active?.slots.find(s => s.id === row.id)?.eidolon ?? 0) === e) ? e - 1 : e
        patch({ eidolon: next })
        view.refresh()
      }
      eidButtons.push(b)
      eidRow.append(b)
    }
    eidSection.append(eidRow)
    body.append(eidSection)

    // --- gear: cone + SI + level
    const coneSection = section('СВЕТОВОЙ КОНУС')
    const coneWrap = el('div', 'coneRow')
    const coneBadge = gearBadge('cone', row.coneId)
    const coneNameEl = el('div', 'coneName')
    const coneFields = el('div', 'coneFields')
    const coneSel = new Dropdown()
    const path = KIT_PATH[row.kitId] ?? ''
    coneSel.setEntries(coneOptions(row.kitId, path), { sig: signatureCone(row.kitId) })
    coneSel.value = row.coneId
    const siSel = el('select') as HTMLSelectElement
    fillSelect(siSel, [1, 2, 3, 4, 5].map(n => [String(n), `S${n}`] as [string, string]))
    siSel.value = String(row.si || 1)
    siSel.setAttribute('aria-label', 'Суперимпозиция')
    const coneLevelInp = el('input') as HTMLInputElement
    coneLevelInp.type = 'number'
    coneLevelInp.min = '1'
    coneLevelInp.max = '80'
    coneLevelInp.className = 'lvlInputNum'
    coneLevelInp.setAttribute('aria-label', 'Уровень конуса')
    coneLevelInp.value = String(row.coneLevel ?? 80)
    const coneSelects = el('div', 'coneSelects')
    coneSelects.append(siSel, coneLevelInp)
    const pickCone = async () => {
      const kitId = charSel.value
      if (!kitId) return
      const chosen = await openConePicker({ kitId, current: coneSel.value || undefined })
      if (chosen === null) return
      coneSel.value = chosen
      patch({ coneId: chosen })
      view.refresh()
    }
    coneBadge.style.cursor = 'pointer'
    coneBadge.title = 'Выбрать световой конус'
    coneBadge.onclick = pickCone
    coneFields.append(coneSel.root, coneSelects)
    coneWrap.append(coneBadge, coneNameEl, coneFields)
    coneSection.append(coneWrap)
    body.append(coneSection)

    // --- stats (final, engine-resolved)
    const statsSection = section('ХАРАКТЕРИСТИКИ')
    const statsBox = el('div', 'pcStats')
    statsSection.append(statsBox)
    body.append(statsSection)

    // --- skills (labels + level inputs)
    const skillsSection = section('УРОВНИ НАВЫКОВ')
    const skillsBox = el('div', 'pcSkills')
    skillsSection.append(skillsBox)
    body.append(skillsSection)

    // --- traces + energy + technique
    const miscSection = section('ТРЕЙСЫ И РЕСУРСЫ')
    const misc = el('div', 'pcMisc')
    const tracesWrap = el('div', 'tracesWrap')
    const energySel = el('select') as HTMLSelectElement
    fillSelect(energySel, [0, 25, 50, 75, 100].map(n => [String(n), `${n}%`] as [string, string]))
    energySel.value = String(Math.round((row.energyStartFrac ?? 0.5) * 100))
    energySel.setAttribute('aria-label', 'Стартовая энергия')
    const techniqueSel = el('select') as HTMLSelectElement
    const techniqueWrap = lab('Техника', techniqueSel)
    const fillTechnique = (kitId: string) => {
      const t = KITS.find(k => k.id === kitId)?.technique
      const uses = t ? (t.maxUses ?? 1) : 0
      if (uses <= 1) {
        techniqueWrap.style.display = 'none'
        techniqueSel.value = '0'
        if ((liveRow().techniqueUses ?? 0) !== 0) patch({ techniqueUses: 0 })
      } else {
        techniqueWrap.style.display = ''
        fillSelect(techniqueSel, [['0', '—'], ...Array.from({ length: uses }, (_, i) => [String(i + 1), `${i + 1}×`] as [string, string])])
        techniqueSel.title = t ? `Претехника: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})` : 'Нет претехники'
      }
    }
    fillTechnique(row.kitId)
    techniqueSel.value = String(row.techniqueUses ?? 0)
    techniqueSel.setAttribute('aria-label', 'Техника')
    misc.append(tracesWrap, lab('Энергия', energySel), techniqueWrap)
    miscSection.append(misc)
    body.append(miscSection)

    root.append(body)

    // ---------------------------------------------------------- patch helpers

    const patch = (p: Partial<TeamRowState>) => store.patchSlot(row.id, p)
    /** the store replaces the row object on every patch — always read the live one, never the snapshot */
    const liveRow = (): TeamRowState => store.active?.slots.find(s => s.id === row.id) ?? row
    /** the kit the kit-dependent controls (cone list, Technique) were last built for */
    let renderedKit = row.kitId

    const lvBtns = {} as CardView['lvBtns']
    const view: CardView = {
      rowId: row.id, root, portrait, elemChip, pathChip, nameEl, charSel, charLevelInp,
      coneBadge, coneNameEl, coneSel, siSel, coneLevelInp, eidButtons,
      lvBtns,
      tracesWrap, energySel, techniqueSel, techniqueWrap, pieces: [] as PieceEditor[], statsBox, skillsBox, tracesBox: tracesWrap, refresh: () => {},
    }

    // --- 6 relic/planar piece editors (SAME widget as the battle page).
    // `persistPieces` fires on every mutation (incl. added sub rows) → store + live restat.
    const persistPieces = () => {
      patch({ pieces: view.pieces.map(pieceOf) })
      view.refresh()
    }
    const pieces = buildPieceEditors(persistPieces)
    view.pieces = pieces
    const relicSection = section('РЕЛИКВИИ', '6 слотов')
    const relicRoot = el('div', 'relicGrid')
    for (const p of pieces) relicRoot.append(p.card)
    relicSection.append(relicRoot)
    body.append(relicSection)

    // skill level controls (+/-)
    for (const slot of ['basic', 'skill', 'ult', 'talent'] as const) {
      const dec = el('button') as HTMLButtonElement
      dec.type = 'button'
      dec.textContent = '-'
      dec.className = 'lvlBtn'
      const val = el('span', 'lvlVal')
      val.textContent = String(row.levels?.[slot] ?? (slot === 'basic' ? 6 : 10))
      const inc = el('button') as HTMLButtonElement
      inc.type = 'button'
      inc.textContent = '+'
      inc.className = 'lvlBtn'
      lvBtns[slot] = { dec, val, inc }
    }

    // ---------------------------------------------------------- wiring

    charSel.onchange = () => {
      charSel.classList.remove('open')
      // the kit decides the cone order and the Technique count — both must be re-resolved
      patch({ kitId: charSel.value, coneId: '', relic1: '', relic2: '', planar: '', pieces: [], techniqueUses: 0 })
      // full re-render: path/cone options/technique depend on the kit
      render()
    }
    coneSel.onchange = () => { patch({ coneId: coneSel.value }); view.refresh() }
    siSel.onchange = () => { patch({ si: Number(siSel.value) || 1 }); view.refresh() }

    tracesChk.onchange = () => { patch({ traces: tracesChk.checked }); view.refresh() }
    energySel.onchange = () => { patch({ energyStartFrac: (Number(energySel.value) || 0) / 100 }); view.refresh() }
    techniqueSel.onchange = () => { patch({ techniqueUses: Number(techniqueSel.value) || 0 }) }

    view.refresh = () => {
      const kitId = charSel.value
      if (kitId !== renderedKit) {
        renderedKit = kitId
        // the cone order and the Technique count are kit-dependent — re-resolve both
        coneSel.setEntries(coneOptions(kitId, KIT_PATH[kitId] ?? ''), { sig: signatureCone(kitId) })
        coneSel.value = ''
        fillTechnique(kitId)
        techniqueSel.value = '0'
        resetPieces(view)
      }
      const kit = KITS.find(k => k.id === kitId)
      updateCharPortrait(portrait, kitId)
      updateMetaBadges(elemChip, pathChip, kit?.elem ?? '', KIT_PATH[kitId] ?? '')
      nameEl.textContent = kit?.name ?? '—'
      updateGearBadge(coneBadge, 'cone', coneSel.value)
      const live = liveRow()
      const eid = Number(live.eidolon ?? 0)
      for (const b of eidButtons) {
        const n = Number(b.dataset.eidolon)
        const active = n <= eid
        b.classList.toggle('active', active)
        b.classList.toggle('e6', active && n === 6)
        b.classList.toggle('unselected', !active)
      }
      paintSkills(view, live, kitId)
      paintStats(view, live, kitId)
      paintPieces(view, kitId)
    }

    return view
  }

  // -------------------------------------------------------------- slot clearing

  function clearSlot(rowId: string): void {
    store.patchSlot(rowId, {
      kitId: '', coneId: '', si: 1, relic1: '', relic2: '', planar: '',
      eidolon: 0, pieces: [], energyStartFrac: undefined, techniqueUses: 0,
    })
  }

  // -------------------------------------------------------------- painting

  function paintPicker(): void {
    const col = store.collection
    const active = store.active
    partyNameText.textContent = active?.name ?? 'Отряд'
    heading.textContent = active?.name ?? 'PARTY'
    delPartyBtn.disabled = col.parties.length <= 1
    addSlotBtn.disabled = (active?.slots.length ?? 0) >= MAX_SLOTS
  }

  function paintSkills(view: CardView, row: TeamRowState, kitId: string): void {
    view.skillsBox.innerHTML = ''
    for (const slot of ['basic', 'skill', 'ult', 'talent'] as const) {
      const line = el('div', 'skillLine')
      const label = el('span', 'skillLabel')
      label.textContent = SKILL_LABELS[slot]
      const cap = slotCap(kitId, slot)
      const currentRow = { ...row }
      const lvl = Math.max(1, Math.min(cap, currentRow.levels?.[slot] ?? (slot === 'basic' ? 6 : 10)))
      const btns = view.lvBtns[slot]
      btns.val.textContent = String(lvl)
      const setLvl = (next: number) => {
        const v = Math.max(1, Math.min(cap, next))
        const nr = { ...row, levels: { ...row.levels, [slot]: v } }
        btns.val.textContent = String(v)
        store.patchSlot(row.id, { levels: nr.levels })
        paintSkills(view, nr, kitId)
        paintStats(view, nr, kitId)
      }
      btns.dec.onclick = (e) => { e.preventDefault(); setLvl(lvl - 1) }
      btns.inc.onclick = (e) => { e.preventDefault(); setLvl(lvl + 1) }
      const ctrl = el('div', 'lvlInputWrap')
      const inp = el('input') as HTMLInputElement
      inp.type = 'number'
      inp.min = '1'
      inp.max = String(cap)
      inp.value = String(lvl)
      inp.className = 'lvlInput'
      inp.onchange = () => setLvl(Number(inp.value) || 1)
      ctrl.append(btns.dec, inp, btns.inc)
      line.append(label, ctrl)
      view.skillsBox.append(line)
    }
  }

  function paintPieces(view: CardView, kitId: string): void {
    for (const p of view.pieces) {
      const subs = p.subs
        .map(s => ({ stat: s.statSel.value, tier: Number(s.tierSel.value) as 0 | 1 | 2, rolls: Number(s.rollsInp.value) || 0 }))
        .filter(s => s.stat && s.rolls > 0)
      const { rating } = scoreRelic(kitId, p.slot, p.mainSel.value, subs)
      p.ratingEl.textContent = rating
      p.ratingEl.className = 'pieceRating ' + ratingTierClass(rating)
    }
  }

  /** a character change drops the old build — clear the piece editors (sets + substats) */
  function resetPieces(view: CardView): void {
    for (const p of view.pieces) {
      p.setSel.value = ''
      p.subs.length = 0
      p.subRows.innerHTML = ''
      updatePieceBadge(p.pieceBadgeEl, '', p.slot)
    }
  }

  function paintStats(view: CardView, row: TeamRowState, kitId: string): void {
    view.statsBox.innerHTML = ''
    if (!kitId) { view.statsBox.append(dim('Пустой слот — выберите персонажа')); return }
    // gather current piece state so the preview reflects unsaved edits (persist is debounced by ref)
    const live: TeamRowState = { ...row, kitId, coneId: view.coneSel.value, si: Number(view.siSel.value) || 1, eidolon: Number(store.active?.slots.find(s => s.id === row.id)?.eidolon ?? row.eidolon ?? 0), traces: view.tracesChk.checked, pieces: view.pieces.map(pieceOf) }
    const spec: TeamSpec = toTeamSpec(live)
    const s = charFinalStats(spec)
    if (!s) { view.statsBox.append(dim('нет данных')); return }
    const rows: Array<[string, string]> = [
      ['hp', String(Math.round(s.hp))],
      ['atk', String(Math.round(s.atk))],
      ['def', String(Math.round(s.def))],
      ['spd', String(Math.round(s.spd * 10) / 10)],
      ['critRate', pct(s.critRate)],
      ['critDmg', pct(s.critDmg)],
      ['be', pct(s.be)],
    ]
    const grid = el('div', 'statGrid')
    for (const [key, val] of rows) {
      const cell = el('div', 'statCell')
      const b = el('b')
      b.textContent = val
      cell.append(statBadge(key), b)
      grid.append(cell)
    }
    view.statsBox.append(grid)
  }

  // -------------------------------------------------------------- full render

  function render(): void {
    paintPicker()
    // top up empty slots so the 4-card layout is always visible (store.addSlot persists + mirrors)
    while ((store.active?.slots.length ?? 0) < MAX_SLOTS) store.addSlot()
    const party = store.active
    if (!party) { cardsHost.innerHTML = ''; cards.clear(); return }

    // rebuild the cards region (slot set changed) or refresh in place (same slots)
    const ids = party.slots.map(s => s.id).join(',')
    const known = [...cards.keys()].join(',')
    if (ids !== known) {
      cardsHost.innerHTML = ''
      cards.clear()
      for (const row of party.slots) {
        const v = makeCard(row)
        cards.set(row.id, v)
        cardsHost.append(v.root)
        v.refresh()
      }
    } else {
      for (const row of party.slots) {
        const v = cards.get(row.id)
        if (!v) continue
        v.charSel.value = row.kitId
        v.coneSel.value = row.coneId
        v.siSel.value = String(row.si || 1)
        v.tracesChk.checked = row.traces !== false
        v.energySel.value = String(Math.round((row.energyStartFrac ?? 0.5) * 100))
        v.refresh()
      }
    }
  }

  render()
  const handle: PartyPanelHandle = { store, root, render }
  mounted.set(host, handle)
  return handle
}

// ---------------------------------------------------------------- small helpers

/** a titled card section; `head` exposes the title row so callers can add a right-hand value span */
function section(title: string, value = ''): HTMLElement & { head: HTMLElement } {
  const sec = el('section', 'pcSection') as HTMLElement & { head: HTMLElement }
  const head = el('div', 'sectionTitle')
  const t = el('span', 'sectionLabel')
  t.textContent = title
  const v = el('span', 'sectionValue')
  v.textContent = value
  head.append(t, v)
  sec.append(head)
  sec.head = head
  return sec
}

function lab(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label') as HTMLLabelElement
  const span = el('span', 'labText')
  span.textContent = text
  l.append(span, control)
  return l
}

/** a label with the given text wrapping a control (no extra span) */
function plainLabel(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label') as HTMLLabelElement
  l.append(document.createTextNode(text), control)
  return l
}

function dim(text: string): HTMLElement {
  const e = el('em', 'dim')
  e.textContent = text
  return e
}

function pct(v: number): string {
  return (Math.round(v * 1000) / 10) + '%'
}

/** per-kit ability-level ceiling, mirroring `resolveLevels`' caps (default 7/12/12/12) */
const CAPS: Record<string, Partial<Record<'basic' | 'skill' | 'ult' | 'talent', number>>> = {
  silver_wolf_lv999: { basic: 10, skill: 15, ult: 15, talent: 15 },
  robin_summeretto: { basic: 10, skill: 15, ult: 15, talent: 15 },
  march7th_the_hunt: { basic: 10, skill: 15, ult: 15, talent: 15 },
  cyrene: { basic: 10, skill: 15, ult: 15, talent: 15 },
  aglaea: { basic: 10, skill: 15, ult: 15, talent: 15 },
}

function slotCap(kitId: string, slot: 'basic' | 'skill' | 'ult' | 'talent'): number {
  return CAPS[kitId]?.[slot] ?? (slot === 'basic' ? 7 : 12)
}
