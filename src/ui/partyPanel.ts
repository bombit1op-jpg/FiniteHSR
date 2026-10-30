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
import { resolveLevels, EIDOLON_LV, LEVEL_CAPS } from '../core/battle'
import type { AbilityLevels } from '../core/entities/Unit'
import { EIDOLON_ICONS } from './iconManifest'
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

const KIT_TO_EIDOLON_NAME: Record<string, string> = {
  'tb_dest_fw': 'Trailblazer (Destruction)',
  'trailblazer_preservation': 'Trailblazer (Preservation)',
  'trailblazer_harmony': 'Trailblazer (Harmony)',
  'trailblazer_remembrance': 'Trailblazer (Remembrance)',
  'tb_el_tech': 'Trailblazer (Elation)',
  'sw_e6': 'Silver Wolf LV.999',
  'm7h_e2_shield': 'March 7th • The Hunt',
  'mortenax_blade': 'Mortenax',
  'rin': 'Rin Tohsaka',
  'hn_respen': 'Himeko Nova',
  'aw_e1': 'Aventurine • Waveflair',
  'rsu_tech_dmg': 'Robin • Summeretto',
}

function getEidolonIcon(kitId: string, eidolonNum: number): string | undefined {
  const charName = KIT_TO_EIDOLON_NAME[kitId] ?? KITS.find(k => k.id === kitId)?.name ?? ''
  return charName ? EIDOLON_ICONS[charName]?.[eidolonNum - 1] : undefined
}

// Compute current level caps based on eidolon (base cap + eidolon bonuses up to current eidolon)
function currentLevelCaps(kitId: string, eidolon: number): AbilityLevels {
  const base = { basic: 6, skill: 10, ult: 10, talent: 10, el_skill: 10 }
  const per = EIDOLON_LV[kitId] ?? {}
  const add = { basic: 0, skill: 0, ult: 0, talent: 0, el_skill: 0 }
  for (const [threshold, d] of Object.entries(per)) {
    if (eidolon < Number(threshold)) continue
    add.basic += d.basic ?? 0
    add.skill += d.skill ?? 0
    add.ult += d.ult ?? 0
    add.talent += d.talent ?? 0
    add.el_skill += d.el_skill ?? 0
  }
  const absCap = LEVEL_CAPS[kitId] ?? {}
  return {
    basic: Math.min(base.basic + add.basic, absCap.basic ?? 7),
    skill: Math.min(base.skill + add.skill, absCap.skill ?? 12),
    ult: Math.min(base.ult + add.ult, absCap.ult ?? 12),
    talent: Math.min(base.talent + add.talent, absCap.talent ?? 12),
    el_skill: Math.min(base.el_skill + add.el_skill, absCap.el_skill ?? 12),
  }
}

// Compute eidolon bonus for a specific slot at given eidolon level
function eidolonBonusForSlot(kitId: string, eidolon: number, slot: 'basic' | 'skill' | 'ult' | 'talent' | 'el_skill' | 'mem_skill' | 'mem_talent'): number {
  // mem_skill and mem_talent are not in EIDOLON_LV (handled in kit-specific effMemoLevels)
  if (slot === 'mem_skill' || slot === 'mem_talent') return 0
  const per = EIDOLON_LV[kitId] ?? {}
  let bonus = 0
  for (const [threshold, d] of Object.entries(per)) {
    if (eidolon < Number(threshold)) continue
    bonus += d[slot] ?? 0
  }
  return bonus
}

// Characters whose memosprite levels use the shared memLevels logic (E3: mem_talent+1, E5: mem_skill+1)
const MEMOSPRITE_EIDOLON_BONUS: ReadonlySet<string> = new Set([
  'robin_summeretto',
  'aglaea',
  'cyrene',
  'evernight',
  'hyacine',
  'robin',
  'castorice',
  'tribbie',
  'sunday',
  'trailblazer_remembrance',
])

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
  headText.append(titleRow)
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
    // ---------------------------------------------------------- patch helpers (must be before any inner functions)
    const patch = (p: Partial<TeamRowState>) => store.patchSlot(row.id, p)
    /** the store replaces the row object on every patch — always read the live one, never the snapshot */
    const liveRow = (): TeamRowState => store.active?.slots.find(s => s.id === row.id) ?? row
    /** the kit the kit-dependent controls (cone list, Technique) were last built for */
    let renderedKit = row.kitId

    const root = el('div', 'partyCard')

    // --- hero art + identity (pick character by clicking the portrait ONLY — no select, no dropdown)
    const portrait = charPortrait(row.kitId || '')
    portrait.style.cursor = 'pointer'
    portrait.title = 'Выбрать персонажа'
    const isTrailblazer = (kitId: string) => kitId.startsWith('trailblazer_')
    const pickChar = async () => {
      const active = store.active
      // Start with all characters in the team (including current slot)
      const allTeamCharacters = (active?.slots.map(s => s.kitId).filter(Boolean) as string[]) ?? []
      
      // Use liveRow() to get current kitId from store (important for in-place Trailblazer path switching)
      const currentKitId = liveRow().kitId
      const isCurrentTrailblazer = currentKitId && isTrailblazer(currentKitId)
      
      // Check if there's a Trailblazer in OTHER slots
      const hasOtherTrailblazer = allTeamCharacters.some(id => id !== currentKitId && isTrailblazer(id))
      
      // For Trailblazer in current slot: allow switching to other Trailblazer paths
      // For non-Trailblazer with other Trailblazer in team: exclude ALL Trailblazers
      // For no Trailblazer in team: normal exclusion (only team chars)
      let filteredExclude = [...allTeamCharacters]
      if (isCurrentTrailblazer) {
        // Allow other Trailblazer paths by removing them from exclude
        // But keep current Trailblazer path excluded
        const otherTrailblazers = KITS
          .filter(k => isTrailblazer(k.id) && k.id !== currentKitId)
          .map(k => k.id)
        filteredExclude = filteredExclude.filter(id => !otherTrailblazers.includes(id))
      } else if (hasOtherTrailblazer) {
        // Another slot has a Trailblazer - exclude ALL Trailblazers
        const allTrailblazers = KITS.filter(k => isTrailblazer(k.id)).map(k => k.id)
        filteredExclude = [...new Set([...filteredExclude, ...allTrailblazers])]
      }
      const chosen = await openCharacterPicker({ exclude: filteredExclude, current: row.kitId || undefined })
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

    // --- character details: cone + traces/resources on the left, final stats on the right.
    // Keep the existing portrait, identity, eidolons, skills and relic sections in their original flow.
    const detailsGrid = el('div', 'pcDetailsGrid')
    detailsGrid.classList.add('pcBody-details')
    const leftColumn = el('div', 'pcLeftColumn')
    const rightColumn = el('div', 'pcRightColumn')
    detailsGrid.append(leftColumn, rightColumn)

    // --- eidolons: E1..E6 toggle buttons (unselected grey, E6 gets shimmer when active)
    const eidSection = section('ЭЙДОЛОНЫ')
    const eidRow = el('div', 'eidolons')
    const eidButtons: HTMLButtonElement[] = []
    for (let e = 1; e <= 6; e++) {
      const b = el('button', 'eidolon') as HTMLButtonElement
      b.type = 'button'
      b.dataset.eidolon = String(e)
      const iconWrap = el('div', 'eidolonIcon')
      const img = document.createElement('img')
      img.className = 'eidolonImg'
      img.alt = ''
      const iconUrl = getEidolonIcon(row.kitId ?? '', e)
      if (iconUrl) img.src = iconUrl
      iconWrap.append(img)
      const textWrap = el('span', 'eidolonText')
      textWrap.textContent = `E${e}`
      b.append(iconWrap, textWrap)
      b.onclick = () => {
        const current = Number(store.active?.slots.find(s => s.id === row.id)?.eidolon ?? 0)
        // Clicking the highest active eidolon: disable all (set to 0)
        // Clicking any other eidolon: set to that level (enable it and all below)
        const next = (current === e) ? 0 : e
        patch({ eidolon: next })
        view.refresh()
      }
      eidButtons.push(b)
      eidRow.append(b)
    }
    eidSection.append(eidRow)
    eidSection.classList.add('pcBody-eidolons')
    // Keep eidolons in their existing full-width position above the three detail areas.
    body.append(eidSection, detailsGrid)

    // --- gear: cone + SI + level (LEFT COLUMN - top)
    const coneSection = section('СВЕТОВОЙ КОНУС')
    const coneWrap = el('div', 'coneRow')
    const coneTitle = el('div', 'coneTitle')
    const coneNameEl = el('span', 'coneName')
    const coneRarityEl = el('span', 'coneRarity')
    coneTitle.append(coneNameEl, coneRarityEl)
    const coneArt = el('div', 'coneArt')
    const coneBadge = gearBadge('cone', row.coneId)
    coneBadge.style.display = row.coneId ? '' : 'none'
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
      const current = liveRow().coneId
      const chosen = await openConePicker({ kitId, current: current || undefined })
      if (chosen === null) return
      // Toggle: selecting the same cone clears it
      patch({ coneId: chosen === current ? '' : chosen })
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
    leftColumn.append(coneSection)

    // --- traces + energy + technique (LEFT COLUMN - bottom)
    const miscSection = section('ТРЕЙСЫ И РЕСУРСЫ')
    const misc = el('div', 'pcMisc')
    misc.style.display = 'flex'
    misc.style.flexDirection = 'column'
    misc.style.gap = '11px'
    misc.style.flex = '1'
    const tracesWrap = el('div', 'tracesWrap')
    /** value string for a trace mod (engine stat key + raw value) */
    const traceVal = (stat: string, value: number): string => {
      const pct = stat.endsWith('Pct') || stat.startsWith('dmg:') || ['critRate', 'critDmg', 'be', 'ehr', 'effRes', 'elation'].includes(stat)
      return `+${pct ? Math.round(value * 1000) / 10 + '%' : value}`
    }
    /** per-trace checkbox rows, in `traceMods(kitId)` order; `tracesSel(i)` = this trace is on */
    const traceChecks: HTMLInputElement[] = []
    const buildTraces = (kitId: string) => {
      tracesWrap.innerHTML = ''
      traceChecks.length = 0
      const mods = traceMods(kitId)
      const cur = liveRow().traces
      const empty = !kitId
      mods.forEach((m, i) => {
        const chk = el('input') as HTMLInputElement
        chk.type = 'checkbox'
        chk.checked = cur === false ? false : Array.isArray(cur) ? cur[i] !== false : true
        chk.disabled = empty
        chk.setAttribute('aria-label', 'Trace ' + (empty ? '—' : traceVal(m.stat, m.value)))
        traceChecks[i] = chk
        const rowEl = el('label', 'traceRow')
        rowEl.append(chk, statBadge(m.stat), el('span', 'traceVal'))
        rowEl.lastElementChild!.textContent = empty ? '—' : traceVal(m.stat, m.value)
        tracesWrap.append(rowEl)
      })
      // If no character selected, show 3 placeholder trace rows with dashes (empty circle, no icon)
      if (empty) {
        for (let i = 0; i < 3; i++) {
          const chk = el('input') as HTMLInputElement
          chk.type = 'checkbox'
          chk.disabled = true
          traceChecks[i] = chk
          const rowEl = el('label', 'traceRow')
          const emptyBadge = el('span', 'statBadge')
          emptyBadge.style.width = '16px'
          emptyBadge.style.height = '16px'
          emptyBadge.style.borderRadius = '50%'
          emptyBadge.style.border = '1px solid #3a4656'
          emptyBadge.style.background = '#1a2029'
          emptyBadge.style.display = 'inline-flex'
          emptyBadge.style.alignItems = 'center'
          emptyBadge.style.justifyContent = 'center'
          rowEl.append(chk, emptyBadge, el('span', 'traceVal'))
          rowEl.lastElementChild!.textContent = '—'
          tracesWrap.append(rowEl)
        }
      }
      tracesWrap.style.display = ''
    }
    buildTraces(row.kitId)
    const techniqueSel = el('select') as HTMLSelectElement
    const techniqueChk = el('input') as HTMLInputElement
    techniqueChk.type = 'checkbox'
    const techniqueWrap = lab('Technique', techniqueSel)
    const techniqueChkWrap = lab('Technique', techniqueChk)
    /** single-activation kits get a checkbox; multi-use kits get a count select */
    const fillTechnique = (kitId: string) => {
      const empty = !kitId
      const t = empty ? null : KITS.find(k => k.id === kitId)?.technique
      const uses = t ? (t.maxUses ?? 1) : 0
      const multi = uses > 1
      techniqueSel.disabled = empty
      techniqueChk.disabled = empty
      if (empty) {
        techniqueSel.style.display = ''
        techniqueChk.style.display = 'none'
        techniqueWrap.style.display = ''
        techniqueChkWrap.style.display = 'none'
        techniqueSel.innerHTML = '<option value="0">—</option>'
        techniqueSel.value = '0'
      } else if (!t) {
        techniqueSel.style.display = 'none'
        techniqueChk.style.display = 'none'
        techniqueWrap.style.display = 'none'
        techniqueChkWrap.style.display = 'none'
        if ((liveRow().techniqueUses ?? 0) !== 0) patch({ techniqueUses: 0 })
        return
      } else if (multi) {
        techniqueSel.style.display = ''
        techniqueChk.style.display = 'none'
        techniqueWrap.style.display = ''
        techniqueChkWrap.style.display = 'none'
        techniqueSel.title = `Technique: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})`
        fillSelect(techniqueSel, [['0', '—'], ...Array.from({ length: uses }, (_, i) => [String(i + 1), `${i + 1}×`] as [string, string])])
      } else {
        techniqueSel.style.display = 'none'
        techniqueChk.style.display = ''
        techniqueWrap.style.display = 'none'
        techniqueChkWrap.style.display = ''
        techniqueChk.title = `Technique: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})`
      }
    }
    fillTechnique(row.kitId)
    techniqueSel.value = String(row.techniqueUses ?? 0)
    techniqueSel.setAttribute('aria-label', 'Technique')
    techniqueChk.checked = (row.techniqueUses ?? 0) > 0
    techniqueChk.setAttribute('aria-label', 'Technique')

    const energySel = el('select') as HTMLSelectElement
    const empty = !row.kitId
    energySel.disabled = empty
    if (empty) {
      energySel.innerHTML = '<option value="50">—</option>'
      energySel.value = '50'
    } else {
      fillSelect(energySel, [0, 25, 50, 75, 100].map(n => [String(n), `${n}%`] as [string, string]))
      energySel.value = String(Math.round((row.energyStartFrac ?? 0.5) * 100))
    }
    energySel.setAttribute('aria-label', 'Starting Energy')
    const energyWrap = lab('Energy', energySel)

    // technique + energy horizontal row — Technique left, Energy right
    const techEnergyRow = el('div', 'techEnergyRow')
    techEnergyRow.style.marginTop = 'auto'
    techEnergyRow.append(techniqueWrap, techniqueChkWrap, energyWrap)
    misc.append(tracesWrap, techEnergyRow)
    miscSection.append(misc)
    leftColumn.append(miscSection)

    // --- stats (final, engine-resolved) (RIGHT COLUMN)
    const statsSection = section('ХАРАКТЕРИСТИКИ')
    const statsBox = el('div', 'pcStats')
    statsSection.append(statsBox)
    rightColumn.append(statsSection)

    // --- skills (labels + level inputs) - stays full width
    const skillsSection = section('УРОВНИ НАВЫКОВ')
    skillsSection.classList.add('pcBody-skills')
    const skillsBox = el('div', 'pcSkills')
    skillsSection.append(skillsBox)
    body.append(skillsSection)

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
    relicSection.classList.add('pcBody-relics')

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

    siSel.onchange = () => { patch({ si: Number(siSel.value) || 1 }); view.refresh(); syncSectionHeights() }

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
      chk.onchange = () => { patch({ traces: traceChecks.map(c => c.checked) }); view.refresh(); syncSectionHeights() }
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
    energySel.onchange = () => { patch({ energyStartFrac: (Number(energySel.value) || 0) / 100 }); view.refresh(); syncSectionHeights() }
    techniqueSel.onchange = () => { patch({ techniqueUses: Number(techniqueSel.value) || 0 }); pruneTechniques(); view.refresh(); syncSectionHeights() }
    techniqueChk.onchange = () => { patch({ techniqueUses: techniqueChk.checked ? 1 : 0 }); pruneTechniques(); view.refresh(); syncSectionHeights() }

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
      coneBadge.style.display = live.coneId ? '' : 'none'
      const cone = live.coneId ? LIGHT_CONES.find(c => c.id === live.coneId) : null
      coneNameEl.textContent = cone?.name ?? '-None-'
      coneNameEl.classList.toggle('dim', !cone)
      coneRarityEl.textContent = cone ? `${cone.rarity}★` : ''
      coneRarityEl.classList.remove('r5', 'r4', 'r3')
      if (cone) {
        if (cone.rarity === 5) coneRarityEl.classList.add('r5')
        else if (cone.rarity === 4) coneRarityEl.classList.add('r4')
        else if (cone.rarity === 3) coneRarityEl.classList.add('r3')
      }
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
        const img = b.querySelector('.eidolonImg') as HTMLImageElement | null
        if (img) {
          const iconUrl = getEidolonIcon(kitId, n)
          if (iconUrl) img.src = iconUrl
        }
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

  // Compute effective memosprite levels (base + eidolon bonuses) mirroring engine's memLevels()
  function effMemoLevels(kitId: string, eidolon: number, baseLevels: AbilityLevels): { mem_skill: number; mem_talent: number } {
    if (!MEMOSPRITE_EIDOLON_BONUS.has(kitId)) {
      // No memosprite eidolon bonuses for this character
      const ext = baseLevels as AbilityLevels & { mem_skill?: number; mem_talent?: number }
      return { mem_skill: ext.mem_skill ?? 6, mem_talent: ext.mem_talent ?? 6 }
    }
    const eid = eidolon
    const baseSkill = (baseLevels as AbilityLevels & { mem_skill?: number }).mem_skill ?? 6
    const baseTalent = (baseLevels as AbilityLevels & { mem_talent?: number }).mem_talent ?? 6
    // Mirror engine's memLevels: E3 -> mem_talent +1, E5 -> mem_skill +1
    return {
      mem_skill: Math.min(10, baseSkill + (eid >= 5 ? 1 : 0)),
      mem_talent: Math.min(10, baseTalent + (eid >= 3 ? 1 : 0)),
    }
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

    // Compute effective levels (base + eidolon bonuses) for display using engine's resolveLevels
    const effLevels = resolveLevels({ kitId, eidolon: row.eidolon ?? 0, levels: row.levels })
    const caps = currentLevelCaps(kitId, row.eidolon ?? 0)

    type ExtraType = 'elation' | 'memosprite' | 'none'
    const addLine = (
      labelText: string,
      abilityName: string,
      slot: 'basic' | 'skill' | 'ult' | 'talent' | 'el_skill' | 'mem_skill' | 'mem_talent',
      displayLvl: number | null,
      cap: number,
      onChange?: (next: number) => void,
      type?: ExtraType,
    ): void => {
      const line = el('div', 'skillLine')
      if (type === 'elation') { line.style.borderLeft = '3px solid #B12020'; line.classList.add('elation') }
      if (type === 'memosprite') { line.style.borderLeft = '3px solid #4663E0'; line.classList.add('memosprite') }
      const label = el('span', 'skillLabel')
      label.textContent = labelText
      const left = el('div', 'skillLeft')
      left.append(abilityBadge(abilityName))
      const content = el('div', 'skillContent')
      if (displayLvl === null || !onChange) {
        const ro = el('span', 'lvlVal')
        ro.textContent = displayLvl === null ? '—' : String(displayLvl)
        content.append(left, ro)
        line.append(label, content)
      } else {
        const dec = el('button') as HTMLButtonElement
        dec.type = 'button'
        dec.textContent = '-'
        dec.className = 'lvlBtn'
        const val = el('span', 'lvlVal')
        val.textContent = String(displayLvl)
        const inc = el('button') as HTMLButtonElement
        inc.type = 'button'
        inc.textContent = '+'
        inc.className = 'lvlBtn'
        const setLvl = (next: number): void => {
          const v = Math.max(1, Math.min(cap, next))
          val.textContent = String(v)
          onChange(v)
        }
        dec.onclick = (e) => { e.preventDefault(); setLvl(displayLvl - 1) }
        inc.onclick = (e) => { e.preventDefault(); setLvl(displayLvl + 1) }
        const inp = el('input', 'lvlInput') as HTMLInputElement
        inp.type = 'number'
        inp.min = '1'
        inp.max = String(cap)
        inp.value = String(displayLvl)
        inp.onchange = () => setLvl(Number(inp.value) || 1)
        const ctrl = el('div', 'lvlInputWrap')
        ctrl.append(dec, inp, inc)
        content.append(left, ctrl)
        line.append(label, content)
      }
      view.skillsBox.append(line)
    }

    for (const slot of ['basic', 'skill', 'ult', 'talent'] as const) {
      const baseLvl = row.levels?.[slot] ?? (slot === 'basic' ? 6 : 10)
      const effLvl = effLevels[slot] ?? baseLvl
      const cap = caps[slot] ?? (slot === 'basic' ? 7 : 12)
      const bonus = eidolonBonusForSlot(kitId, row.eidolon ?? 0, slot)
      addLine(SKILL_LABELS[slot], ABILITY_NAMES[kitId]?.[slot] ?? '', slot, effLvl, cap, (v) => {
        const baseV = Math.max(1, Math.min(cap, v - bonus))
        const levels = { ...row.levels, [slot]: baseV }
        store.patchSlot(row.id, { levels })
        paintSkills(view, { ...row, levels }, kitId)
        paintStats(view, { ...row, levels }, kitId)
      })
    }

    // Extra rows: Elation Skill is its own editable level; memosprite skills have their own
    // independent levels (up to 10); el_skill2 / talent2 have no separate level.
    const names = ABILITY_NAMES[kitId] ?? {}
    const isAventurineWaveflair = kitId === 'aventurine_waveflair'
    const extras: Array<{ key: string; label: string; slot: 'el_skill' | 'mem_skill' | 'mem_talent' | 'talent'; cap: number | 'memo'; type: ExtraType }> = [
      { key: 'el_skill', label: 'Elation Skill', slot: 'el_skill', cap: caps.el_skill ?? 12, type: 'elation' },
      { key: 'el_skill2', label: 'Elation Skill 2', slot: 'el_skill', cap: 0, type: 'elation' },
      { key: 'mem_skill', label: 'Memosprite Skill', slot: 'mem_skill', cap: 7, type: 'memosprite' },
      { key: 'mem_talent', label: 'Memosprite Talent', slot: 'mem_talent', cap: 7, type: 'memosprite' },
      { key: 'talent2', label: 'Extra Talent', slot: 'talent', cap: 0, type: 'none' },
    ]
    for (const { key, label, slot, cap, type } of extras) {
      const abilityName = names[key]
      if (!abilityName) continue
      // Aventurine Waveflair: el_skill2 is just an enhanced version of el_skill with linked levels — hide it
      if (isAventurineWaveflair && key === 'el_skill2') continue
      if (key === 'el_skill') {
        const baseLvl = row.levels?.el_skill ?? row.levels?.skill ?? 10
        const effLvl = effLevels.el_skill ?? baseLvl
        const bonus = eidolonBonusForSlot(kitId, row.eidolon ?? 0, 'el_skill')
        addLine(label, abilityName, slot, effLvl, cap as number, (v) => {
          const baseV = Math.max(1, Math.min(cap as number, v - bonus))
          const levels = { ...row.levels, el_skill: baseV }
          store.patchSlot(row.id, { levels })
          paintSkills(view, { ...row, levels }, kitId)
          paintStats(view, { ...row, levels }, kitId)
        }, type)
      } else if (key === 'mem_skill' || key === 'mem_talent') {
        // Compute effective memosprite levels with eidolon bonuses (mirroring engine's memLevels)
        const memoEff = effMemoLevels(kitId, row.eidolon ?? 0, row.levels)
        const effLvl = key === 'mem_skill' ? memoEff.mem_skill : memoEff.mem_talent
        // Eidolon bonus for memosprite skills (from effMemoLevels): E3 -> mem_talent+1, E5 -> mem_skill+1
        const eidolon = row.eidolon ?? 0
        const memoBonus = key === 'mem_skill' ? (eidolon >= 5 ? 1 : 0) : (eidolon >= 3 ? 1 : 0)
        addLine(label, abilityName, slot, effLvl, cap as number, (v) => {
          const baseV = Math.max(1, Math.min(cap as number, v - memoBonus))
          const levels = { ...row.levels, [key]: baseV }
          store.patchSlot(row.id, { levels })
          paintSkills(view, { ...row, levels }, kitId)
          paintStats(view, { ...row, levels }, kitId)
        }, type)
      } else {
        addLine(label, abilityName, slot, null, 0, undefined, type)
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
    if (!kitId) {
      // Show dashes for all stats when no character selected
      const statKeys = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg', 'ehr', 'effRes', 'be', 'err', 'energyMax', 'outHeal', 'elemDmgBoost', 'elation']
      const grid = el('div', 'statGrid')
      for (const key of statKeys) {
        const cell = el('div', 'statCell')
        const name = el('span', 'statName')
        name.textContent = STAT_LABELS[key] ?? key
        const b = el('b')
        b.textContent = '—'
        cell.append(statBadge(key), name, b)
        grid.append(cell)
      }
      view.statsBox.append(grid)
      return
    }
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
      ['elation', pct(s.elation)],
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
    syncSectionHeights()
  }

  /** Synchronize section heights across all 4 cards by measuring each section type and applying the max */
  function syncSectionHeights(): void {
    if (cards.size === 0) return
    const sectionClasses = ['pcBody-eidolons', 'pcBody-details', 'pcBody-skills', 'pcBody-relics']
    const maxHeights = new Map<string, number>()
    for (const cls of sectionClasses) {
      let maxH = 0
      for (const v of cards.values()) {
        const el = v.root.querySelector('.' + cls) as HTMLElement | null
        if (el) maxH = Math.max(maxH, el.offsetHeight)
      }
      if (maxH > 0) maxHeights.set(cls, maxH)
    }
    for (const [cls, h] of maxHeights) {
      for (const v of cards.values()) {
        const el = v.root.querySelector('.' + cls) as HTMLElement | null
        if (el) el.style.minHeight = h + 'px'
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
