/**
 * §Party Setup — anchored pickers (character / Light Cone / party list).
 *
 * Every picker opens as a popover next to the control that triggered it (portrait, cone icon,
 * party name), filters live and resolves with the chosen id (or null when dismissed). They own no
 * state — the caller passes the current selection and the excluded ids, and applies the result.
 */
import { KITS, KIT_PATH } from '../core/kits'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import { coneOptions, signatureCone } from '../core/gearOrder'
import { el } from './dom'
import { charIconUrl, charPortrait, gearIconUrl, iconNode, elemIconUrl, pathIconUrl } from './icons'
import type { Party } from '../core/party'
import type { TeamRowState } from './store'

// Shared rank labels used by pickers
export const RANK_LABELS: Record<string, string> = {
  all: 'Все',
  mob: 'Обычный',
  elite: 'Элитный',
  boss: 'Босс',
}

interface Overlay {
  root: HTMLElement
  body: HTMLElement
  /** tear down the overlay (no promise resolution — the caller resolves) */
  close: () => void
}

/** anchor the panel under the trigger, flipping above/clamping when it would leave the viewport */
function placePanel(panel: HTMLElement, anchor?: HTMLElement): void {
  const margin = 12
  if (anchor) {
    const a = anchor.getBoundingClientRect()
    const w = panel.offsetWidth
    const h = panel.offsetHeight
    let left = Math.min(Math.max(margin, a.left), Math.max(margin, innerWidth - w - margin))
    let top = a.bottom + 6
    if (top + h > innerHeight - margin) {
      const above = a.top - h - 6
      top = above >= margin ? above : Math.max(margin, innerHeight - h - margin)
    }
    panel.style.left = `${Math.round(left)}px`
    panel.style.top = `${Math.round(top)}px`
    panel.style.transform = 'none'
    return
  }
  const w = panel.offsetWidth || Math.min(880, innerWidth - 24)
  const h = panel.offsetHeight || Math.min(innerHeight * 0.8, 760)
  panel.style.left = `${Math.round((innerWidth - w) / 2)}px`
  panel.style.top = `${Math.round((innerHeight - h) / 2)}px`
  panel.style.transform = 'none'
}

export function openOverlay(title: string, onDismiss: () => void, anchor?: HTMLElement): Overlay {
  const root = el('div', 'pickerOverlay')
  const panel = el('div', 'pickerPanel animate__animated animate__fadeInUp')
  panel.style.height = '600px'
  panel.style.maxHeight = '90vh'
  panel.style.overflow = 'hidden'
  panel.style.display = 'flex'
  panel.style.flexDirection = 'column'
  panel.style.animationDuration = '150ms'
  const head = el('div', 'pickerHead')
  head.style.flexShrink = '0'
  const t = el('div', 'pickerTitle')
  t.textContent = title
  const x = el('button', 'pickerClose') as HTMLButtonElement
  x.type = 'button'
  x.textContent = '✕'
  x.title = 'Закрыть'
  head.append(t, x)
  const body = el('div', 'pickerBody')
  body.style.flex = '1'
  body.style.overflow = 'auto'
  body.style.minHeight = '0'
  panel.append(head, body)
  root.append(panel)
  document.body.append(root)
  placePanel(panel, anchor)

  let done = false
  const onResize = (): void => placePanel(panel, anchor)
  const close = () => {
    if (done) return
    done = true
    root.remove()
    document.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); onDismiss() } }
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResize)
  x.onclick = () => { close(); onDismiss() }
  root.addEventListener('click', (e) => { if (e.target === root) { close(); onDismiss() } })
  return { root, body, close }
}

const PATHS = [...new Set(Object.values(KIT_PATH))].filter(Boolean).sort()
const ELEMS = [...new Set(KITS.map(k => k.elem))].sort()

/**
 * Character picker: grid of cropped round icons, with search + element/path filter buttons like Fribbels.
 * `exclude` hides already-taken characters (one per slot). Opens centered on screen.
 */
export function openCharacterPicker(opts: { exclude?: string[]; current?: string } = {}): Promise<string | null> {
  const exclude = new Set(opts.exclude ?? [])
  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>(r => { resolve = r })
  const ov = openOverlay('ВЫБОР ПЕРСОНАЖА', () => resolve(null))

  const search = el('input', 'pickerSearch') as HTMLInputElement
  search.type = 'search'
  search.placeholder = 'Поиск'
  search.setAttribute('aria-label', 'Поиск персонажа')

  const elemRow = el('div', 'pickerBtnRow')
  const elemBtns = new Map<string, HTMLButtonElement>()
  const elemAll = el('button', 'pickerToggle active pickerBtn') as HTMLButtonElement
  elemAll.type = 'button'
  elemAll.textContent = 'Все'
  elemBtns.set('*', elemAll)
  elemRow.append(elemAll)
  for (const e of ELEMS) {
    const b = el('button', 'pickerToggle pickerBtn') as HTMLButtonElement
    b.type = 'button'
    const icon = iconNode(elemIconUrl ? elemIconUrl(e) : undefined, e, { cls:'miniIcon', size:16, fit:'contain', fallbackText:e.charAt(0), tint:'#7fb3ff', title:e })
    const txt = el('span'); txt.textContent = e
    b.append(icon, txt)
    elemBtns.set(e, b)
    elemRow.append(b)
  }

  const pathRow = el('div', 'pickerBtnRow')
  const pathBtns = new Map<string, HTMLButtonElement>()
  const pathAll = el('button', 'pickerToggle active pickerBtn') as HTMLButtonElement
  pathAll.type = 'button'
  pathAll.textContent = 'Все'
  pathBtns.set('*', pathAll)
  pathRow.append(pathAll)
  for (const p of PATHS) {
    const b = el('button', 'pickerToggle pickerBtn') as HTMLButtonElement
    b.type = 'button'
    const icon = iconNode(pathIconUrl ? pathIconUrl(p) : undefined, p, { cls:'miniIcon', size:16, fit:'contain', fallbackText:p.charAt(0), tint:'#7fb3ff', title:p })
    const txt = el('span'); txt.textContent = p
    b.append(icon, txt)
    pathBtns.set(p, b)
    pathRow.append(b)
  }

const grid = el('div', 'pickerGrid icons')
ov.body.append(search, elemRow, pathRow, grid)

  let curElem = '*'
  let curPath = '*'
  for (const [k, b] of elemBtns) {
    b.onclick = () => { curElem = k; for (const [kk, bb] of elemBtns) bb.classList.toggle('active', kk === k); paint() }
  }
  for (const [k, b] of pathBtns) {
    b.onclick = () => { curPath = k; for (const [kk, bb] of pathBtns) bb.classList.toggle('active', kk === k); paint() }
  }

const paint = () => {
  grid.innerHTML = ''
  const q = search.value.trim().toLowerCase()
  let index = 0
  for (const k of KITS) {
    if (exclude.has(k.id)) continue
    const p = KIT_PATH[k.id] ?? ''
    if (curPath !== '*' && p !== curPath) continue
    if (curElem !== '*' && k.elem !== curElem) continue
    if (q && !k.name.toLowerCase().includes(q)) continue
    const btn = el('button', 'pickerCharIcon animate__animated animate__fadeInUp') as HTMLButtonElement
    btn.style.animationDelay = `${index * 10}ms`
    btn.style.animationDuration = '150ms'
    btn.type = 'button'
    btn.dataset.kitId = k.id
    if (k.id === opts.current) btn.classList.add('current')
    btn.title = k.name
    const art = iconNode(charIconUrl(k.id), k.name, {
      cls: 'pickIcon', size: 56, fit: 'cover',
      fallbackText: k.name.trim().charAt(0).toUpperCase() || '?',
      tint: '#7fb3ff', title: k.name,
    })
    btn.append(art)
    btn.onclick = () => { ov.close(); resolve(k.id) }
    grid.append(btn)
    index++
  }
  if (!grid.childElementCount) {
    const empty = el('em', 'dim')
    empty.textContent = 'Нет персонажей под фильтр'
    grid.append(empty)
  }
}
search.oninput = paint
paint()
return promise
}

/**
 * Light Cone picker: list in setup order, centered with search + path/rarity filters.
 * Cones of another path are dimmed.
 */
export function openConePicker(opts: { kitId: string; current?: string } = {} as any): Promise<string | null> {
  const path = KIT_PATH[opts.kitId] ?? ''
  const sig = signatureCone(opts.kitId)
  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>(r => { resolve = r })
  const ov = openOverlay('ВЫБОР СВЕТОВОГО КОНУСА', () => resolve(null))

  const search = el('input', 'pickerSearch') as HTMLInputElement
  search.type = 'search'
  search.placeholder = 'Поиск'
  search.setAttribute('aria-label', 'Поиск конуса')

  const pathRow = el('div', 'pickerBtnRow')
  const pathBtns = new Map<string, HTMLButtonElement>()
  const pathAll = el('button', 'pickerToggle active pickerBtn') as HTMLButtonElement
  pathAll.type = 'button'
  pathAll.textContent = 'Все'
  pathBtns.set('*', pathAll)
  pathRow.append(pathAll)
  const paths = [...new Set(LIGHT_CONES.map(c => c.path))].sort()
  for (const p of paths) {
    const b = el('button', 'pickerToggle pickerBtn') as HTMLButtonElement
    b.type = 'button'
    const icon = iconNode(pathIconUrl ? pathIconUrl(p) : undefined, p, { cls:'miniIcon', size:16, fit:'contain', fallbackText:p.charAt(0), tint:'#7fb3ff', title:p })
    const txt = el('span'); txt.textContent = p === path ? `${p} (свой)` : p
    b.append(icon, txt)
    pathBtns.set(p, b)
    pathRow.append(b)
  }

  const rareRow = el('div', 'pickerBtnRow')
  const rareBtns = new Map<string, HTMLButtonElement>()
  const rareAll = el('button', 'pickerToggle active pickerBtn') as HTMLButtonElement
  rareAll.type = 'button'
  rareAll.textContent = 'Все'
  rareBtns.set('*', rareAll)
  rareRow.append(rareAll)
  for (const r of [5, 4, 3]) {
    const b = el('button', 'pickerToggle pickerBtn') as HTMLButtonElement
    b.type = 'button'
    const txt = el('span'); txt.textContent = `${r}★`
    b.append(txt)
    rareBtns.set(String(r), b)
    rareRow.append(b)
  }

const grid = el('div', 'pickerGrid cones')
ov.body.append(search, pathRow, rareRow, grid)

  let curPath = '*'
  let curRare = '*'
  for (const [k, b] of pathBtns) {
    b.onclick = () => { curPath = k; for (const [kk, bb] of pathBtns) bb.classList.toggle('active', kk === k); paint() }
  }
  for (const [k, b] of rareBtns) {
    b.onclick = () => { curRare = k; for (const [kk, bb] of rareBtns) bb.classList.toggle('active', kk === k); paint() }
  }

  const order = coneOptions(opts.kitId, path).map(([id]) => id).filter(Boolean)
  const paint = () => {
    grid.innerHTML = ''
    const q = search.value.trim().toLowerCase()
    let index = 0
    for (const id of order) {
      const cone = LIGHT_CONES.find(c => c.id === id)
      if (!cone) continue
      if (curPath !== '*' && cone.path !== curPath) continue
      if (curRare !== '*' && String(cone.rarity) !== curRare) continue
      if (q && !cone.name.toLowerCase().includes(q)) continue
      const btn = el('button', 'pickConeCard animate__animated animate__fadeInUp') as HTMLButtonElement
      btn.style.animationDelay = `${index * 10}ms`
      btn.style.animationDuration = '150ms'
      btn.type = 'button'
      btn.dataset.coneId = id
      if (cone.path !== path) btn.classList.add('offPath')
      if (id === opts.current) btn.classList.add('current')
      if (id === sig) btn.classList.add('sig')
      const name = el('div', 'pickConeName')
      name.textContent = cone.name
      const rarity = el('div', 'pickConeRarity')
      rarity.textContent = `★${cone.rarity}`
      if (cone.rarity === 5) rarity.classList.add('r5')
      else if (cone.rarity === 4) rarity.classList.add('r4')
      else if (cone.rarity === 3) rarity.classList.add('r3')
      const art = iconNode(gearIconUrl('cone', id), cone.name, {
        cls: 'gearIcon', size: 120, fit: 'contain',
        fallbackText: cone.name.trim().charAt(0).toUpperCase() || '?',
        tint: '#7fb3ff', title: cone.name,
      })
      btn.append(name, art, rarity)
      btn.onclick = () => { ov.close(); resolve(id) }
      grid.append(btn)
      index++
    }
  if (!grid.childElementCount) {
    const empty = el('em', 'dim')
    empty.textContent = 'Нет конусов под фильтр'
    grid.append(empty)
  }
}
search.oninput = paint
paint()
return promise
}

/** Party list picker for the header: detailed view with 4 character cards per party. */
export function openPartyListPicker(opts: { parties: Party[]; activeId: string | null; anchor?: HTMLElement }): Promise<string | null> {
  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>(r => { resolve = r })
  // Use a wider panel for the party picker without anchor positioning
  const ov = openOverlay('ВЫБОР ОТРЯДА', () => resolve(null))
  ov.root.classList.add('partyPickerOverlay')
  const list = el('div', 'pickerList partyListPicker partyPickerList')
  ov.body.append(list)

  for (const p of opts.parties) {
    const btn = el('button', 'pickerParty animate__animated animate__fadeInUp') as HTMLButtonElement
    btn.type = 'button'
    if (p.id === opts.activeId) btn.classList.add('current')
    btn.onclick = () => { ov.close(); resolve(p.id) }

    // Party summary (left side) - only name and slot count
    const summary = el('div', 'partyPickSummary')
    const name = el('div', 'partyPickName')
    name.textContent = p.name
    const slotCount = p.slots.filter(s => s.kitId).length
    const slotCountEl = el('div', 'partyPickSlotCount')
    slotCountEl.textContent = `${slotCount}/4`
    summary.append(name, slotCountEl)

    // Character cards (right side)
    const members = el('div', 'partyPickMembers')
    for (let i = 0; i < 4; i++) {
      const s = p.slots[i]
      members.append(buildMemberCard(s, i))
    }

    const row = el('div', 'partyPickRow')
    row.append(summary, members)
    btn.append(row)
    list.append(btn)
  }
  return promise
}

/** Build a single character card for the party picker. */
function buildMemberCard(slot: TeamRowState | undefined, index: number): HTMLElement {
  const card = el('div', 'partyPickMember')
  if (!slot || !slot.kitId) {
    card.classList.add('empty')
    const placeholder = el('div', 'partyPickMemberPlaceholder')
    placeholder.textContent = `Слот ${index + 1}`
    card.append(placeholder)
    return card
  }

  const kit = KITS.find(k => k.id === slot.kitId)
  if (!kit) {
    card.classList.add('empty')
    return card
  }

  // Three-column layout: Character | Light Cone | Relics
  const grid = el('div', 'partyPickMemberGrid')

  // Column 1: Character (portrait, name, element, path, eidolon)
  const charCol = el('div', 'partyPickCharacter')
  const portrait = charPortrait(slot.kitId)
  portrait.style.width = '60px'
  portrait.style.height = '76px'
  portrait.style.borderRadius = '8px'
  charCol.append(portrait)

  const identity = el('div', 'partyPickCharacterIdentity')
  const nameEl = el('div', 'partyPickCharacterName')
  nameEl.textContent = kit.name
  identity.append(nameEl)

  const meta = el('div', 'partyPickCharacterMeta')
  const elemIcon = iconNode(elemIconUrl(kit.elem), kit.elem, { cls: 'miniIcon', size: 14, fit: 'contain', fallbackText: kit.elem.charAt(0), tint: '#7fb3ff', title: kit.elem })
  const pathIcon = iconNode(pathIconUrl(KIT_PATH[kit.id] ?? ''), KIT_PATH[kit.id] ?? '', { cls: 'miniIcon', size: 14, fit: 'contain', fallbackText: (KIT_PATH[kit.id] ?? '').charAt(0), tint: '#7fb3ff', title: KIT_PATH[kit.id] ?? '' })
  meta.append(elemIcon, pathIcon)
  identity.append(meta)

  const eidolonEl = el('div', 'partyPickCharacterEidolon')
  eidolonEl.textContent = `E${slot.eidolon ?? 0}`
  identity.append(eidolonEl)

  charCol.append(identity)
  grid.append(charCol)

  // Column 2: Light Cone (centered tile with level/SI)
  const coneCol = el('div', 'partyPickLightCone')
  if (slot.coneId) {
    const cone = LIGHT_CONES.find(c => c.id === slot.coneId)
    if (cone) {
      const tile = el('div', 'partyPickLightConeTile')
      tile.append(iconNode(
        gearIconUrl('cone', cone.id),
        cone.name,
        { cls: 'partyPickGearIcon', size: 62, fit: 'contain', fallbackText: cone.name.charAt(0).toUpperCase(), tint: '#7fb3ff', title: cone.name }
      ))
      tile.title = cone.name
      coneCol.append(tile)

      const details = el('div', 'partyPickLightConeDetails')
      details.textContent = `Lv.${slot.coneLevel ?? 80} · S${slot.si ?? 1}`
      coneCol.append(details)
    }
  } else {
    const empty = el('div', 'partyPickLightConeEmpty')
    empty.textContent = '—'
    coneCol.append(empty)
  }
  grid.append(coneCol)

  // Column 3: Relic sets (vertical stack)
  const relicCol = el('div', 'partyPickRelics')
  const { relicSets, planarSets } = computeRelicAndPlanarSets(slot)

  // Regular relic sets
  for (const rs of relicSets) {
    const rsEl = el('div', 'partyPickRelicItem')
    rsEl.append(iconNode(
      gearIconUrl('relic', rs.id),
      rs.name,
      { cls: 'partyPickGearIcon', size: 32, fit: 'contain', fallbackText: rs.name.charAt(0).toUpperCase(), tint: '#7fb3ff', title: rs.name }
    ))
    const badge = el('span', 'partyPickRelicBadge')
    badge.textContent = `${rs.count}pc`
    rsEl.append(badge)
    rsEl.title = rs.name
    relicCol.append(rsEl)
  }

  // Planar sets (from pieces, not just slot.planar)
  for (const ps of planarSets) {
    const rsEl = el('div', 'partyPickRelicItem planar')
    rsEl.append(iconNode(
      gearIconUrl('planar', ps.id),
      ps.name,
      { cls: 'partyPickGearIcon', size: 32, fit: 'contain', fallbackText: ps.name.charAt(0).toUpperCase(), tint: '#7fb3ff', title: ps.name }
    ))
    const badge = el('span', 'partyPickRelicBadge')
    badge.textContent = `${ps.count}pc`
    rsEl.append(badge)
    rsEl.title = `${ps.name} (Планарный)`
    relicCol.append(rsEl)
  }

  if (!relicSets.length && !planarSets.length) {
    const empty = el('div', 'partyPickRelicsEmpty')
    empty.textContent = '—'
    relicCol.append(empty)
  }
  grid.append(relicCol)

  card.append(grid)
  return card
}

/** Compute relic and planar set configuration from pieces. */
function computeRelicAndPlanarSets(slot: TeamRowState): {
  relicSets: Array<{ id: string; name: string; count: number }>
  planarSets: Array<{ id: string; name: string; count: number }>
} {
  const relicCounts = new Map<string, number>()
  const planarCounts = new Map<string, number>()

  for (const p of slot.pieces) {
    if (!p.setId) continue
    // Planar pieces (sphere and rope) go to planar counts
    if (p.slot === 'sphere' || p.slot === 'rope') {
      planarCounts.set(p.setId, (planarCounts.get(p.setId) ?? 0) + 1)
    } else {
      relicCounts.set(p.setId, (relicCounts.get(p.setId) ?? 0) + 1)
    }
  }

  // Legacy fallback: if no pieces but slot.planar exists
  if (!planarCounts.size && slot.planar) {
    planarCounts.set(slot.planar, 2) // assume 2pc for legacy
  }

  // Regular relic sets: only show if >= 2 pieces (2pc or 4pc)
  const sortedRelics = Array.from(relicCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])

  const relicSets = sortedRelics.map(([id, count]) => {
    const set = RELIC_SETS.find(s => s.id === id)
    return { id, name: set?.name ?? id, count }
  })

  // Planar sets: show even 1pc
  const sortedPlanar = Array.from(planarCounts.entries())
    .sort((a, b) => b[1] - a[1])

  const planarSets = sortedPlanar.map(([id, count]) => {
    const set = PLANAR_SETS.find(s => s.id === id)
    return { id, name: set?.name ?? id, count }
  })

  return { relicSets, planarSets }
}
