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
  charPortrait, updateCharPortrait,
} from './icons'
import { buildPieceEditors, pieceOf, toTeamSpec, type PieceEditor } from './team'
import { scoreRelic } from '../core/relicScore'
import { charFinalStats, SKILL_LABELS } from '../core/charStats'
import { PartyStore } from './partyStore'
import { MAX_SLOTS } from '../core/party'

interface CardView {
  rowId: string
  root: HTMLElement
  portrait: HTMLElement
  elemChip: HTMLElement
  pathChip: HTMLElement
  nameEl: HTMLElement
  charSel: HTMLSelectElement
  charLevelSel: HTMLSelectElement
  coneBadge: HTMLElement
  coneSel: Dropdown
  siSel: HTMLSelectElement
  coneLevelSel: HTMLSelectElement
  eidButtons: HTMLButtonElement[]
  lvBtns: Record<'basic' | 'skill' | 'ult' | 'talent', { dec: HTMLButtonElement, val: HTMLElement, inc: HTMLButtonElement }>
  tracesChk: HTMLInputElement
  energySel: HTMLSelectElement
  techniqueSel: HTMLSelectElement
  pieces: PieceEditor[]
  statsBox: HTMLElement
  skillsBox: HTMLElement
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

  // top bar: eyebrow + heading (active party name) on the left, party actions on the right
  const head = el('header', 'partyHead')
  const headText = el('div', 'partyHeadText')
  const eyebrow = el('div', 'eyebrow')
  eyebrow.textContent = 'FINITE HSR / PARTY SETUP'
  const heading = el('h1', 'partyHeading')
  heading.textContent = 'PARTY'
  headText.append(eyebrow, heading)
  const actions = el('div', 'partyActions')

  const picker = el('div', 'partyPicker')
  const nameInput = el('input', 'partyName') as HTMLInputElement
  nameInput.type = 'text'
  nameInput.setAttribute('aria-label', 'Название отряда')
  const partySel = new Dropdown('partySelect')
  const createBtn = el('button', 'btn-secondary') as HTMLButtonElement
  createBtn.type = 'button'
  createBtn.textContent = '+ Создать'
  const delBtn = el('button', 'btn-secondary') as HTMLButtonElement
  delBtn.type = 'button'
  delBtn.textContent = 'Удалить'
  picker.append(partySel.root, plainLabel('Название', nameInput), createBtn, delBtn)
  actions.append(picker)
  head.append(headText, actions)
  root.append(head)

  const cardsHost = el('div', 'partyCards')
  root.append(cardsHost)

  const cards = new Map<string, CardView>()

  // -------------------------------------------------------------- picker actions

  createBtn.onclick = () => {
    // guard against a double-fire (keyboard + click) creating two parties for one action
    if (createBtn.disabled) return
    createBtn.disabled = true
    store.create()
    render()
    createBtn.disabled = false
  }
  delBtn.onclick = () => {
    if (store.collection.parties.length <= 1) return // keep at least one party
    store.remove(store.collection.activeId ?? '')
    render()
  }
  partySel.onchange = () => { store.select(partySel.value); render() }
  const commitName = () => { store.rename(nameInput.value); paintPicker() }
  nameInput.onchange = commitName
  nameInput.onblur = commitName

  // -------------------------------------------------------------- card

  function makeCard(row: TeamRowState): CardView {
    const root = el('div', 'partyCard')

    // --- hero art + identity (pick character by clicking portrait)
    const portrait = charPortrait(row.kitId || '')
    portrait.style.cursor = 'pointer'
    portrait.title = 'Выбрать персонажа'
    const charSel = el('select', 'pcChar') as HTMLSelectElement
    fillSelect(charSel, KITS.map(k => [k.id, `${k.name} (${k.elem})`]))
    charSel.value = row.kitId || KITS[0].id
    charSel.setAttribute('aria-label', 'Персонаж')
    charSel.style.display = 'none'
    portrait.onclick = () => charSel.click()
    const identity = el('div', 'pcIdentity')
    const nameRow = el('div', 'pcNameRow')
    const nameEl = el('div', 'pcName')
    nameEl.style.cursor = 'pointer'
    nameEl.title = 'Выбрать персонажа'
    nameEl.onclick = () => charSel.click()
    const chips = el('div', 'pcChips')
    const elemChip = metaBadge('elem', '')
    const pathChip = metaBadge('path', '')
    chips.append(elemChip, pathChip)
    nameRow.append(nameEl, chips)
    const charLevelSel = el('select') as HTMLSelectElement
    fillSelect(charLevelSel, Array.from({ length: 80 }, (_, i) => [String(i + 1), `Ур. ${i + 1}`] as [string, string]))
    charLevelSel.value = '80'
    charLevelSel.setAttribute('aria-label', 'Уровень персонажа')
    const delSlot = el('button', 'pcClear') as HTMLButtonElement
    delSlot.type = 'button'
    delSlot.textContent = '✕'
    delSlot.title = 'Очистить слот'
    delSlot.onclick = () => { clearSlot(row.id); render() }
    identity.append(nameRow, charLevelSel, delSlot)
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
    const coneFields = el('div', 'coneFields')
    const coneSel = new Dropdown()
    const path = KIT_PATH[row.kitId] ?? ''
    coneSel.setEntries(coneOptions(row.kitId, path), { sig: signatureCone(row.kitId) })
    coneSel.value = row.coneId
    const siSel = el('select') as HTMLSelectElement
    fillSelect(siSel, [1, 2, 3, 4, 5].map(n => [String(n), `S${n}`] as [string, string]))
    siSel.value = String(row.si || 1)
    siSel.setAttribute('aria-label', 'Суперимпозиция')
    const coneLevelSel = el('select') as HTMLSelectElement
    fillSelect(coneLevelSel, Array.from({ length: 80 }, (_, i) => [String(i + 1), `Ур. ${i + 1}`] as [string, string]))
    coneLevelSel.value = '80'
    coneLevelSel.setAttribute('aria-label', 'Уровень конуса')
    const coneSelects = el('div', 'coneSelects')
    coneSelects.append(siSel, coneLevelSel)
    coneFields.append(coneSel.root, coneSelects)
    coneWrap.append(coneBadge, coneFields)
    coneSection.append(coneWrap)
    body.append(coneSection)

    // --- stats (final, engine-resolved)
    const statsSection = section('ХАРАКТЕРИСТИКИ', 'до реликвий*')
    const statsBox = el('div', 'pcStats')
    statsSection.append(statsBox)
    body.append(statsSection)

    // --- skills (labels + level inputs; values from the engine's level caps)
    const skillsSection = section('УРОВНИ НАВЫКОВ')
    const skillsBox = el('div', 'pcSkills')
    skillsSection.append(skillsBox)
    body.append(skillsSection)

    // --- traces + energy + technique
    const miscSection = section('ТРЕЙСЫ И РЕСУРСЫ')
    const misc = el('div', 'pcMisc')
    const tracesChk = el('input') as HTMLInputElement
    tracesChk.type = 'checkbox'
    tracesChk.checked = row.traces !== false
    tracesChk.title = 'Минорные трейсы'
    const tracesLab = lab('Трейсы', tracesChk)
    const energySel = el('select') as HTMLSelectElement
    fillSelect(energySel, [0, 25, 50, 75, 100].map(n => [String(n), `${n}%`] as [string, string]))
    energySel.value = String(Math.round((row.energyStartFrac ?? 0.5) * 100))
    energySel.setAttribute('aria-label', 'Стартовая энергия')
    const techniqueSel = el('select') as HTMLSelectElement
    const fillTechnique = (kitId: string) => {
      const t = KITS.find(k => k.id === kitId)?.technique
      fillSelect(techniqueSel, [['0', '—'], ...Array.from({ length: t?.maxUses ?? 1 }, (_, i) => [String(i + 1), `${i + 1}×`] as [string, string])])
      techniqueSel.title = t ? `Претехника: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})` : 'Нет претехники'
    }
    fillTechnique(row.kitId)
    techniqueSel.value = String(row.techniqueUses ?? 0)
    techniqueSel.setAttribute('aria-label', 'Техника')
    misc.append(tracesLab, lab('Энергия', energySel), lab('Техника', techniqueSel))
    miscSection.append(misc)
    body.append(miscSection)

    root.append(body)

    // ---------------------------------------------------------- patch helpers

    const patch = (p: Partial<TeamRowState>) => store.patchSlot(row.id, p)

    const lvBtns = {} as CardView['lvBtns']
    const view: CardView = {
      rowId: row.id, root, portrait, elemChip, pathChip, nameEl, charSel, charLevelSel,
      coneBadge, coneSel, siSel, coneLevelSel, eidButtons,
      lvBtns,
      tracesChk, energySel, techniqueSel, pieces: [] as PieceEditor[], statsBox, skillsBox, refresh: () => {},
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
      patch({ kitId: charSel.value, coneId: '', relic1: '', relic2: '', planar: '', pieces: [] })
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
      const kit = KITS.find(k => k.id === kitId)
      updateCharPortrait(portrait, kitId)
      updateMetaBadges(elemChip, pathChip, kit?.elem ?? '', KIT_PATH[kitId] ?? '')
      nameEl.textContent = kit?.name ?? '—'
      updateGearBadge(coneBadge, 'cone', coneSel.value)
      const eid = Number(store.active?.slots.find(s => s.id === row.id)?.eidolon ?? row.eidolon ?? 0)
      for (const b of eidButtons) {
        const n = Number(b.dataset.eidolon)
        const active = n <= eid
        b.classList.toggle('active', active)
        b.classList.toggle('e6', active && n === 6)
        b.classList.toggle('unselected', !active)
      }
      paintSkills(view, row, kitId)
      paintStats(view, row, kitId)
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
    partySel.setEntries(col.parties.map(p => [p.id, p.name] as [string, string]))
    if (col.activeId) partySel.value = col.activeId
    const active = store.active
    nameInput.value = active?.name ?? ''
    heading.textContent = active?.name ?? 'PARTY'
    delBtn.disabled = col.parties.length <= 1
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
      }
    } else {
      for (const row of party.slots) {
        const v = cards.get(row.id)
        if (!v) continue
        v.charSel.value = row.kitId || v.charSel.value
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
