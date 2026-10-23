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
import { el, fillSelect, STAT_LABELS } from './dom'
import { Dropdown } from './dropdown'
import { relicOptions, planarOptions, signatureCone } from '../core/gearOrder'
import { LIGHT_CONES } from '../core/gear'
import type { TeamRowState } from './store'
import {
  metaBadge, updateMetaBadges, gearBadge, updateGearBadge, statBadge, ratingTierClass,
  charPortrait, updateCharPortrait, abilityBadge, gearIconUrl,
} from './icons'
import { ABILITY_NAMES } from '../core/abilityNames'
import { buildPieceEditors, pieceOf, toTeamSpec, type PieceEditor } from './team'
import { scoreRelic } from '../core/relicScore'
import { charFinalStats, SKILL_LABELS } from '../core/charStats'
import { traceMods } from '../core/progression'
import { PartyStore } from './partyStore'
import { MAX_SLOTS } from '../core/party'
import { openCharacterPicker, openConePicker, openPartyListPicker } from './pickers'
import { survivingTechniqueUses } from './store'

interface CardView {
  rowId: string
  root: HTMLElement
  portrait: HTMLElement
  elemChip: HTMLElement
  pathChip: HTMLElement
  nameEl: HTMLElement
  charLevelInp: HTMLInputElement
  coneBadge: HTMLElement
  coneNameEl: HTMLElement
  siSel: HTMLSelectElement
  coneLevelInp: HTMLInputElement
  eidButtons: HTMLButtonElement[]
  lvBtns: Record<string, { dec: HTMLButtonElement, val: HTMLElement, inc: HTMLButtonElement }>
  tracesWrap: HTMLElement
  /** one checkbox per minor-trace stat, in `traceMods(kitId)` order */
  traceChecks: HTMLInputElement[]
  energySel: HTMLSelectElement
  techniqueSel: HTMLSelectElement
  techniqueWrap: HTMLLabelElement
  techniqueChk: HTMLInputElement
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

  const titleRow = el('div', 'partyTitleRow')
  const partyHeader = el('div', 'partyHeader')
  const partyNameBtn = el('button', 'partyNameBtn') as HTMLButtonElement
  partyNameBtn.type = 'button'
  partyNameBtn.title = 'Открыть список отрядов'
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
  titleRow.append(partyHeader)
  headText.append(eyebrow, titleRow)
  head.append(headText)
  root.append(head)

  const cardsHost = el('div', 'partyCards')
  root.append(cardsHost)

  // slots are fixed to 4 by design; no add button

  const cards = new Map<string, CardView>()

  // -------------------------------------------------------------- party actions

  partyNameBtn.onclick = async () => {
    const col = store.collection
    const id = await openPartyListPicker({ parties: col.parties, activeId: col.activeId, anchor: partyNameBtn })
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
    store.create()
    render()
    addPartyBtn.disabled = false
  }
  delPartyBtn.onclick = () => {
    if (store.collection.parties.length <= 1) return
    store.remove(store.collection.activeId ?? '')
    render()
  }
  // fixed 4 slots (no add button)

  // -------------------------------------------------------------- card

  function makeCard(row: TeamRowState): CardView {
    const root = el('div', 'partyCard')

    // --- hero art + identity (pick character by clicking the portrait ONLY — no select, no dropdown)
    const portrait = charPortrait(row.kitId || '')
    portrait.style.cursor = 'pointer'
    portrait.title = 'Выбрать персонажа'
    const pickChar = async () => {
      const active = store.active
      const exclude = (active?.slots.map(s => s.kitId).filter(Boolean) as string[]) ?? []
      // Can't select same character twice - exclude all already in team except current slot
      const chosen = await openCharacterPicker({ exclude: exclude.filter(id => id !== row.kitId), current: row.kitId || undefined })
      if (chosen === null) return
      if (chosen === '') { clearSlot(row.id); render(); return }
      patch({ kitId: chosen, coneId: '', relic1: '', relic2: '', planar: '', pieces: [], techniqueUses: 0 })
      render()
    }
    portrait.onclick = pickChar
    const clearSlotBtn = el('button', 'pcClear') as HTMLButtonElement
    clearSlotBtn.type = 'button'
    clearSlotBtn.textContent = '✕'
    clearSlotBtn.title = 'Удалить персонажа из слота'
    clearSlotBtn.onclick = (e) => { e.stopPropagation(); clearSlot(row.id); render() }
    clearSlotBtn.style.display = row.kitId ? '' : 'none'
    const identity = el('div', 'pcIdentity')
    const nameRow = el('div', 'pcNameRow')
    const nameEl = el('div', 'pcName')
    const chips = el('div', 'pcChips')
    const elemChip = metaBadge('elem', '')
    const pathChip = metaBadge('path', '')
    chips.append(elemChip, pathChip)
    const charLevelInp = el('input') as HTMLInputElement
    charLevelInp.type = 'number'
    charLevelInp.min = '0'
    charLevelInp.max = '80'
    charLevelInp.className = 'lvlInputNum'
    charLevelInp.setAttribute('aria-label', 'Уровень персонажа')
    charLevelInp.value = String(row.level ?? 80)
    const charLevelWrap = el('div', 'charLevelWrap')
    charLevelWrap.append(charLevelInp)
    nameRow.append(charLevelWrap, nameEl, chips)
    identity.append(nameRow)
    const portraitWrap = el('div', 'pcPortraitWrap')
    portraitWrap.append(portrait, clearSlotBtn)
    root.append(portraitWrap, identity)

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
    const coneTitle = el('div', 'coneTitle')
    const coneNameEl = el('span', 'coneName')
    const coneRarityEl = el('span', 'coneRarity')
    coneTitle.append(coneNameEl, coneRarityEl)
    const coneArt = el('div', 'coneArt')
    const coneBadge = gearBadge('cone', row.coneId)
    const siSel = el('select') as HTMLSelectElement
    fillSelect(siSel, [1, 2, 3, 4, 5].map(n => [String(n), `S${n}`] as [string, string]))
    siSel.value = String(row.si || 1)
    siSel.setAttribute('aria-label', 'Суперимпозиция')
    const coneLevelInp = el('input') as HTMLInputElement
    coneLevelInp.type = 'number'
    coneLevelInp.min = '0'
    coneLevelInp.max = '80'
    coneLevelInp.className = 'lvlInputNum coneLevelInp'
    coneLevelInp.setAttribute('aria-label', 'Уровень конуса')
    coneLevelInp.value = String(row.coneLevel ?? 80)
    const coneControls = el('div', 'coneControls')
    coneControls.append(coneLevelInp, siSel)
    const pickCone = async () => {
      const kitId = liveRow().kitId
      if (!kitId) return
      const chosen = await openConePicker({ kitId, current: liveRow().coneId || undefined })
      if (chosen === null) return
      patch({ coneId: chosen })
      view.refresh()
    }
    coneArt.append(coneBadge)
    coneArt.style.cursor = 'pointer'
    coneArt.title = 'Выбрать световой конус'
    coneArt.onclick = pickCone
    coneNameEl.textContent = ''
    coneRarityEl.textContent = ''
    coneArt.classList.add('empty')
    coneWrap.append(coneTitle, coneArt, coneControls)
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

    // ---------------------------------------------------------- patch helpers

    const patch = (p: Partial<TeamRowState>) => store.patchSlot(row.id, p)
    /** the store replaces the row object on every patch — always read the live one, never the snapshot */
    const liveRow = (): TeamRowState => store.active?.slots.find(s => s.id === row.id) ?? row
    /** the kit the kit-dependent controls (cone list, Technique) were last built for */
    let renderedKit = row.kitId

    // --- traces + energy + technique
    const miscSection = section('ТРЕЙСЫ И РЕСУРСЫ')
    const misc = el('div', 'pcMisc')
    const tracesWrap = el('div', 'tracesWrap')
    /** "+28% ATK" / "+5 SPD" / "+10% Fire DMG" for a trace mod (engine stat key + raw value) */
    const traceLabel = (stat: string, value: number): string => {
      const pct = stat.endsWith('Pct') || stat.startsWith('dmg:') || ['critRate', 'critDmg', 'be', 'ehr', 'effRes', 'elation'].includes(stat)
      const name = STAT_LABELS[stat] ?? stat
      return `+${pct ? Math.round(value * 1000) / 10 + '%' : value} ${name}`.trim()
    }
    /** per-trace checkbox rows, in `traceMods(kitId)` order; `tracesSel(i)` = this trace is on */
    const traceChecks: HTMLInputElement[] = []
    const buildTraces = (kitId: string) => {
      tracesWrap.innerHTML = ''
      traceChecks.length = 0
      const mods = traceMods(kitId)
      const cur = liveRow().traces
      mods.forEach((m, i) => {
        const chk = el('input') as HTMLInputElement
        chk.type = 'checkbox'
        chk.checked = cur === false ? false : Array.isArray(cur) ? cur[i] !== false : true
        chk.setAttribute('aria-label', 'Трейс ' + traceLabel(m.stat, m.value))
        traceChecks[i] = chk
        const rowEl = el('label', 'traceRow')
        rowEl.append(chk, statBadge(m.stat), el('span', 'traceVal'))
        rowEl.lastElementChild!.textContent = traceLabel(m.stat, m.value)
        tracesWrap.append(rowEl)
      })
      tracesWrap.style.display = mods.length ? '' : 'none'
    }
    buildTraces(row.kitId)
    const energySel = el('select') as HTMLSelectElement
    fillSelect(energySel, [0, 25, 50, 75, 100].map(n => [String(n), `${n}%`] as [string, string]))
    energySel.value = String(Math.round((row.energyStartFrac ?? 0.5) * 100))
    energySel.setAttribute('aria-label', 'Стартовая энергия')
    const techniqueSel = el('select') as HTMLSelectElement
    const techniqueChk = el('input') as HTMLInputElement
    techniqueChk.type = 'checkbox'
    const techniqueWrap = lab('Техника', techniqueSel)
    const techniqueChkWrap = lab('Техника', techniqueChk)
    /** single-activation kits get a checkbox; multi-use kits get a count select */
    const fillTechnique = (kitId: string) => {
      const t = KITS.find(k => k.id === kitId)?.technique
      const uses = t ? (t.maxUses ?? 1) : 0
      const multi = uses > 1
      techniqueSel.style.display = multi ? '' : 'none'
      techniqueChk.style.display = !multi && uses === 1 ? '' : 'none'
      if (!t) {
        techniqueWrap.style.display = 'none'
        techniqueChkWrap.style.display = 'none'
        if ((liveRow().techniqueUses ?? 0) !== 0) patch({ techniqueUses: 0 })
        return
      }
      const title = `Претехника: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})`
      if (multi) {
        techniqueWrap.style.display = ''
        techniqueChkWrap.style.display = 'none'
        techniqueSel.title = title
        fillSelect(techniqueSel, [['0', '—'], ...Array.from({ length: uses }, (_, i) => [String(i + 1), `${i + 1}×`] as [string, string])])
      } else {
        techniqueWrap.style.display = 'none'
        techniqueChkWrap.style.display = ''
        techniqueChk.title = title
      }
    }
    fillTechnique(row.kitId)
    techniqueSel.value = String(row.techniqueUses ?? 0)
    techniqueSel.setAttribute('aria-label', 'Техника')
    techniqueChk.checked = (row.techniqueUses ?? 0) > 0
    techniqueChk.setAttribute('aria-label', 'Техника')
    misc.append(tracesWrap, lab('Энергия', energySel), techniqueWrap, techniqueChkWrap)
    miscSection.append(misc)
    body.append(miscSection)

    root.append(body)

    const lvBtns = {} as CardView['lvBtns']
    const view: CardView = {
      rowId: row.id, root, portrait, elemChip, pathChip, nameEl, charLevelInp,
      coneBadge, coneNameEl, siSel, coneLevelInp, eidButtons,
      lvBtns,
      tracesWrap, traceChecks, energySel, techniqueSel, techniqueWrap, techniqueChk, pieces: [] as PieceEditor[], statsBox, skillsBox, tracesBox: tracesWrap, refresh: () => {},
    }

  // --- 6 relic/planar piece editors (SAME widget as the battle page).
    // `persistPieces` fires on every mutation (incl. the split) → store + live restat.
    const persistPieces = () => {
      patch({ pieces: view.pieces.map(pieceOf) })
      view.refresh()
    }
    const pieces = buildPieceEditors(persistPieces, () => liveRow().kitId)
    view.pieces = pieces
    for (const p of pieces) {
      const saved = row.pieces?.find(s => s.slot === p.slot)
      if (saved) p.restore(saved)
    }
    const relicSection = section('РЕЛИКВИИ', '6 слотов')

    // set plan: 4-piece / 2+2 relic sets + the 2-piece planar set.
    // The plan is a shortcut — it writes the per-piece set dropdowns, which stay editable.
    const planRow = el('div', 'setPlan planRow')
    const planSel = el('select') as HTMLSelectElement
    fillSelect(planSel, [['4', '4 сета'], ['2+2', '2+2']])
    planSel.title = 'Набор сетов реликвий: один 4-сет или два 2-сета'
    const setA = new Dropdown('setDrop')
    const setB = new Dropdown('setDrop')
    const planarSet = new Dropdown('setDrop')
    const fillPlan = (kitId: string): void => {
      const relicEntries = relicOptions(kitId, '')
      const planarEntries = planarOptions(kitId)
      const relicIcons: Record<string, string> = {}
      for (const [id] of relicEntries) { const u = gearIconUrl('relic', id); if (u) relicIcons[id] = u }
      const planarIcons: Record<string, string> = {}
      for (const [id] of planarEntries) { const u = gearIconUrl('planar', id); if (u) planarIcons[id] = u }
      setA.setEntries(relicEntries, { icons: relicIcons })
      setB.setEntries(relicEntries, { icons: relicIcons })
      planarSet.setEntries(planarEntries, { icons: planarIcons })
    }
    fillPlan(row.kitId)
    const applyPlan = (): void => {
      const mode = planSel.value
      for (const p of view.pieces) {
        const planar = p.slot === 'sphere' || p.slot === 'rope'
        if (planar) {
          p.setSet(planarSet.value)
        } else if (mode === '2+2') {
          p.setSet(p.slot === 'head' || p.slot === 'hands' ? setA.value : setB.value)
        } else {
          p.setSet(setA.value)
        }
      }
      persistPieces()
    }
    const syncPlanMode = (): void => {
      const two = planSel.value === '2+2'
      row2.style.display = two ? '' : 'none'
      const first = setALab.firstChild
      if (first) first.textContent = two ? 'Сет 1' : 'Сет'
    }
    planSel.onchange = () => { syncPlanMode(); applyPlan() }
    setA.onchange = applyPlan
    setB.onchange = applyPlan
    planarSet.onchange = applyPlan
    const planLab = (text: string, node: HTMLElement): HTMLElement => {
      const l = el('label')
      const t = el('span', 'planLabel')
      t.textContent = text
      l.append(t, node)
      return l
    }
    const setALab = planLab('Сет', setA.root)
    const setBLab = planLab('Сет 2', setB.root)
    const planarLab = planLab('Планарка', planarSet.root)
    const modeLab = planLab('Сеты', planSel)
    const row1 = el('div', 'planRowLine')
    const row2 = el('div', 'planRowLine')
    row1.append(modeLab, setALab)
    row2.append(setBLab)
    const planarBlock = el('div', 'planarBlock')
    planarBlock.append(planarLab)
    planRow.append(row1, row2, planarBlock)
    syncPlanMode()
    {
      const rel = pieces.filter(p => p.slot !== 'sphere' && p.slot !== 'rope')
      const ids = [...new Set(rel.map(p => p.setDrop.value).filter(Boolean))]
      const top = rel.find(p => p.slot === 'head')?.setDrop.value ?? ''
      const bottom = rel.find(p => p.slot === 'body')?.setDrop.value ?? ''
      if (ids.length === 1) {
        planSel.value = '4'
        setA.value = ids[0]
      } else if (ids.length === 2 && top && top !== bottom) {
        planSel.value = '2+2'
        setA.value = top
        setB.value = bottom
      }
      syncPlanMode()
      const ord = pieces.find(p => p.slot === 'sphere')?.setDrop.value ?? pieces.find(p => p.slot === 'rope')?.setDrop.value ?? ''
      if (ord) planarSet.value = ord
    }

    const relicRoot = el('div', 'relicGrid')
    for (const p of pieces) relicRoot.append(p.card)
    relicSection.append(planRow, relicRoot)
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

    siSel.onchange = () => { patch({ si: Number(siSel.value) || 1 }); view.refresh() }

    // tech list for conflict resolution — only kits that define a Technique
    const techniqueDefs = KITS.filter(k => k.technique).map(k => {
      const t = k.technique!
      return { kitId: k.id, name: t.name, kind: t.kind, zone: t.zone, switchSensitive: t.switchSensitive, maxUses: t.maxUses }
    })
    /** drop Techniques the engine's own `resolvePreCombat` rules would cancel (attack/zone/switch/repeat). */
    const pruneTechniques = (): void => {
      const rows = store.active?.slots ?? []
      const live = survivingTechniqueUses(rows, techniqueDefs)
      rows.forEach((r, i) => { if ((r.techniqueUses ?? 0) > live[i]) store.patchSlot(r.id, { techniqueUses: live[i] }) })
    }
    for (const chk of traceChecks) {
      chk.onchange = () => { patch({ traces: traceChecks.map(c => c.checked) }); view.refresh() }
    }
    charLevelInp.oninput = () => {
      if (charLevelInp.value === '') return
      patch({ level: Math.max(0, Math.min(80, Number(charLevelInp.value) || 0)) })
      paintStats(view, liveRow(), liveRow().kitId)
    }
    coneLevelInp.oninput = () => {
      if (coneLevelInp.value === '') return
      patch({ coneLevel: Math.max(0, Math.min(80, Number(coneLevelInp.value) || 0)) })
      paintStats(view, liveRow(), liveRow().kitId)
    }
    energySel.onchange = () => { patch({ energyStartFrac: (Number(energySel.value) || 0) / 100 }); view.refresh() }
    techniqueSel.onchange = () => { patch({ techniqueUses: Number(techniqueSel.value) || 0 }); pruneTechniques(); view.refresh() }
    techniqueChk.onchange = () => { patch({ techniqueUses: techniqueChk.checked ? 1 : 0 }); pruneTechniques(); view.refresh() }

    view.refresh = () => {
      const kitId = liveRow().kitId
      if (kitId !== renderedKit) {
        renderedKit = kitId
        // the trace set and the Technique count are kit-dependent — re-resolve them
        buildTraces(kitId)
        fillTechnique(kitId)
        fillPlan(kitId)
        techniqueSel.value = '0'
        resetPieces(view)
      }
      const kit = KITS.find(k => k.id === kitId)
      updateCharPortrait(portrait, kitId)
      updateMetaBadges(elemChip, pathChip, kit?.elem ?? '', KIT_PATH[kitId] ?? '')
      nameEl.textContent = kit?.name ?? '—'
      const live = liveRow()
      updateGearBadge(coneBadge, 'cone', live.coneId)
      const cone = live.coneId ? LIGHT_CONES.find(c => c.id === live.coneId) : null
      coneNameEl.textContent = cone?.name ?? ''
      coneNameEl.classList.toggle('dim', !cone)
      coneRarityEl.textContent = cone ? `${cone.rarity}★` : ''
      coneArt.classList.toggle('empty', !cone)
      coneArt.classList.toggle('signature', !!cone && live.coneId === signatureCone(live.kitId))
      siSel.value = String(live.si || 1)
      coneLevelInp.value = String(live.coneLevel ?? 80)
      // reflect the live row into the trace checkboxes + Technique controls (idempotent)
      const tr = live.traces
      view.traceChecks.forEach((c, i) => { c.checked = tr === false ? false : Array.isArray(tr) ? tr[i] !== false : true })
      const uses = live.techniqueUses ?? 0
      techniqueSel.value = String(uses)
      techniqueChk.checked = uses > 0
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
    delPartyBtn.disabled = col.parties.length <= 1
  }

  function paintSkills(view: CardView, row: TeamRowState, kitId: string): void {
    view.skillsBox.innerHTML = ''
    const addLine = (
      labelText: string,
      abilityName: string,
      lvl: number | null,
      cap: number,
      onChange?: (next: number) => void,
    ): void => {
      const line = el('div', 'skillLine')
      const label = el('span', 'skillLabel')
      label.textContent = labelText
      const left = el('div', 'skillLeft')
      left.append(abilityBadge(abilityName), label)
      if (lvl === null || !onChange) {
        const ro = el('span', 'lvlVal')
        ro.textContent = lvl === null ? '—' : String(lvl)
        line.append(left, ro)
      } else {
        const dec = el('button') as HTMLButtonElement
        dec.type = 'button'
        dec.textContent = '-'
        dec.className = 'lvlBtn'
        const val = el('span', 'lvlVal')
        val.textContent = String(lvl)
        const inc = el('button') as HTMLButtonElement
        inc.type = 'button'
        inc.textContent = '+'
        inc.className = 'lvlBtn'
        const setLvl = (next: number): void => {
          const v = Math.max(1, Math.min(cap, next))
          val.textContent = String(v)
          onChange(v)
        }
        dec.onclick = (e) => { e.preventDefault(); setLvl(lvl - 1) }
        inc.onclick = (e) => { e.preventDefault(); setLvl(lvl + 1) }
        const inp = el('input', 'lvlInput') as HTMLInputElement
        inp.type = 'number'
        inp.min = '1'
        inp.max = String(cap)
        inp.value = String(lvl)
        inp.onchange = () => setLvl(Number(inp.value) || 1)
        const ctrl = el('div', 'lvlInputWrap')
        ctrl.append(dec, inp, inc)
        line.append(left, ctrl)
      }
      view.skillsBox.append(line)
    }

    for (const slot of ['basic', 'skill', 'ult', 'talent'] as const) {
      const cap = slotCap(kitId, slot)
      const lvl = Math.max(1, Math.min(cap, row.levels?.[slot] ?? (slot === 'basic' ? 6 : 10)))
      addLine(SKILL_LABELS[slot], ABILITY_NAMES[kitId]?.[slot] ?? '', lvl, cap, (v) => {
        const levels = { ...row.levels, [slot]: v }
        store.patchSlot(row.id, { levels })
        paintSkills(view, { ...row, levels }, kitId)
        paintStats(view, { ...row, levels }, kitId)
      })
    }

    // Extra rows: Elation Skill is its own editable level; memosprite rows mirror the owner's
    // skill/talent level (the engine reads those); el_skill2 / talent2 have no separate level.
    const names = ABILITY_NAMES[kitId] ?? {}
    const extras: Array<{ key: string; label: string }> = [
      { key: 'el_skill', label: 'Доп. навык' },
      { key: 'el_skill2', label: 'Доп. навык 2' },
      { key: 'mem_skill', label: 'Навык духа' },
      { key: 'mem_talent', label: 'Талант духа' },
      { key: 'talent2', label: 'Доп. талант' },
    ]
    for (const { key, label } of extras) {
      const abilityName = names[key]
      if (!abilityName) continue
      if (key === 'el_skill') {
        const cap = slotCap(kitId, 'el_skill')
        const lvl = Math.max(1, Math.min(cap, row.levels?.el_skill ?? row.levels?.skill ?? 10))
        addLine(label, abilityName, lvl, cap, (v) => {
          const levels = { ...row.levels, el_skill: v }
          store.patchSlot(row.id, { levels })
          paintSkills(view, { ...row, levels }, kitId)
          paintStats(view, { ...row, levels }, kitId)
        })
      } else if (key === 'mem_skill') {
        addLine(label, abilityName, Math.max(1, Math.min(slotCap(kitId, 'skill'), row.levels?.skill ?? 10)), 0)
      } else if (key === 'mem_talent') {
        addLine(label, abilityName, Math.max(1, Math.min(slotCap(kitId, 'talent'), row.levels?.talent ?? 10)), 0)
      } else {
        addLine(label, abilityName, null, 0)
      }
    }
  }

  function paintPieces(view: CardView, kitId: string): void {
    for (const p of view.pieces) {
      const subs = p.subs
        .filter(s => s.stat && s.rolls > 0)
        .map(s => ({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread }))
      const { rating } = scoreRelic(kitId, p.slot, p.mainSel.value, subs)
      p.ratingEl.textContent = rating
      p.ratingEl.className = 'pieceRating ' + ratingTierClass(rating)
    }
  }

  /** a character change drops the old build — clear the piece editors (sets + substats) */
  function resetPieces(view: CardView): void {
    for (const p of view.pieces) p.reset()
  }

  function paintStats(view: CardView, row: TeamRowState, kitId: string): void {
    view.statsBox.innerHTML = ''
    if (!kitId) { view.statsBox.append(dim('Пустой слот — выберите персонажа')); return }
    const lr = store.active?.slots.find(s => s.id === row.id) ?? row
    // gather the card's CURRENT control state so the preview tracks unsaved edits (cone, levels,
    // traces, pieces) — the engine resolves the real numbers from these, never UI-side math
    const live: TeamRowState = {
      ...lr, kitId,
      coneId: lr.coneId,
      si: Number(view.siSel.value) || 1,
      level: Math.max(0, Math.min(80, Number(view.charLevelInp.value) || 0)),
      coneLevel: Math.max(0, Math.min(80, Number(view.coneLevelInp.value) || 0)),
      eidolon: Number(lr.eidolon ?? 0),
      traces: view.traceChecks.map(c => c.checked),
      pieces: view.pieces.map(pieceOf),
      levels: lr.levels,
    }
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
      ['ehr', pct(s.ehr)],
      ['effRes', pct(s.effRes)],
      ['be', pct(s.be)],
      ['err', pct(s.err)],
      ['energyMax', String(Math.round(s.energyMax))],
      ['outHeal', pct(s.outHeal)],
      ['elemDmgBoost', pct(s.elemDmgBoost)],
    ]
    const grid = el('div', 'statGrid')
    for (const [key, val] of rows) {
      const cell = el('div', 'statCell')
      const name = el('span', 'statName')
      name.textContent = STAT_LABELS[key] ?? key
      const b = el('b')
      b.textContent = val
      cell.append(statBadge(key), name, b)
      grid.append(cell)
    }
    view.statsBox.append(grid)
  }

  // -------------------------------------------------------------- full render

  function render(): void {
    paintPicker()
    // party has up to MAX_SLOTS; ensure slots exist
    const activeParty = store.active
    if (activeParty && activeParty.slots.length < MAX_SLOTS) {
      for (let i = activeParty.slots.length; i < MAX_SLOTS; i++) store.addSlot()
    } else if ((activeParty?.slots.length ?? 0) < 1) {
      store.addSlot()
    }
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
        const clearBtn = v.root.querySelector('.pcClear') as HTMLElement | null
        if (clearBtn) clearBtn.style.display = row.kitId ? '' : 'none'
        v.siSel.value = String(row.si || 1)
        v.charLevelInp.value = String(row.level ?? 80)
        v.coneLevelInp.value = String(row.coneLevel ?? 80)
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

function dim(text: string): HTMLElement {
  const e = el('em', 'dim')
  e.textContent = text
  return e
}

function pct(v: number): string {
  return (Math.round(v * 1000) / 10) + '%'
}

/** per-kit ability-level ceiling, mirroring `resolveLevels`' caps (default 7/12/12/12) */
type LevelSlot = 'basic' | 'skill' | 'ult' | 'talent' | 'el_skill'

const CAPS: Record<string, Partial<Record<LevelSlot, number>>> = {
  silver_wolf_lv999: { basic: 10, skill: 15, ult: 15, talent: 15, el_skill: 15 },
  robin_summeretto: { basic: 10, skill: 15, ult: 15, talent: 15, el_skill: 15 },
  march7th_the_hunt: { basic: 10, skill: 15, ult: 15, talent: 15 },
  cyrene: { basic: 10, skill: 15, ult: 15, talent: 15 },
  aglaea: { basic: 10, skill: 15, ult: 15, talent: 15 },
}

function slotCap(kitId: string, slot: LevelSlot): number {
  return CAPS[kitId]?.[slot] ?? (slot === 'basic' ? 7 : 12)
}
