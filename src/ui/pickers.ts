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

function openOverlay(title: string, onDismiss: () => void, anchor?: HTMLElement): Overlay {
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

    // Party summary (left side)
    const summary = el('div', 'partyPickSummary')
    const icons = el('div', 'partyPickIcons')
    for (let i = 0; i < 4; i++) {
      const s = p.slots[i]
      const k = s?.kitId ? KITS.find(x => x.id === s.kitId) : null
      const ic = iconNode(k ? charIconUrl(k.id) : undefined, k?.name ?? '—', {
        cls: 'partyPickIcon', size: 36, fit: 'cover',
        fallbackText: k ? (k.name.trim().charAt(0).toUpperCase() || '?') : '—',
        tint: k ? '#7fb3ff' : '#3a4a3f', title: k?.name ?? '',
      })
      icons.append(ic)
    }
    const name = el('div', 'partyPickName')
    name.textContent = p.name
    summary.append(icons, name)

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

  // Header: portrait, name, element, path
  const header = el('div', 'partyPickMemberHeader')
  const portrait = charPortrait(slot.kitId)
  portrait.style.width = '64px'
  portrait.style.height = '64px'
  portrait.style.borderRadius = '8px'
  header.append(portrait)

  const identity = el('div', 'partyPickMemberIdentity')
  const nameEl = el('div', 'partyPickMemberName')
  nameEl.textContent = kit.name
  identity.append(nameEl)

  const meta = el('div', 'partyPickMemberMeta')
  const elemIcon = iconNode(elemIconUrl(kit.elem), kit.elem, { cls: 'miniIcon', size: 16, fit: 'contain', fallbackText: kit.elem.charAt(0), tint: '#7fb3ff', title: kit.elem })
  const pathIcon = iconNode(pathIconUrl(KIT_PATH[kit.id] ?? ''), KIT_PATH[kit.id] ?? '', { cls: 'miniIcon', size: 16, fit: 'contain', fallbackText: (KIT_PATH[kit.id] ?? '').charAt(0), tint: '#7fb3ff', title: KIT_PATH[kit.id] ?? '' })
  meta.append(elemIcon, pathIcon)
  identity.append(meta)
  header.append(identity)

  // Eidolons
  const eidolonSection = el('div', 'partyPickMemberEidolons')
  const eidolonLabel = el('span', 'partyPickMemberEidolonLabel')
  eidolonLabel.textContent = `E${slot.eidolon ?? 0}`
  eidolonSection.append(eidolonLabel)
  const eidolonIndicators = el('div', 'partyPickMemberEidolonIndicators')
  for (let e = 1; e <= 6; e++) {
    const ind = el('span', 'partyPickMemberEidolonIndicator')
    if (e <= (slot.eidolon ?? 0)) ind.classList.add('active')
    if (e === 6 && (slot.eidolon ?? 0) === 6) ind.classList.add('e6')
    ind.textContent = `E${e}`
    eidolonIndicators.append(ind)
  }
  eidolonSection.append(eidolonIndicators)

  // Relic sets
  const relicSection = el('div', 'partyPickMemberRelics')
  const relicSets = computeRelicSets(slot)
  for (const rs of relicSets) {
    const rsEl = el('div', 'partyPickMemberRelicSet')
    const icon = gearIconUrl('relic', rs.id)
    if (icon) {
      const img = el('img')
      img.src = icon
      img.alt = ''
      img.style.width = '20px'
      img.style.height = '20px'
      img.style.borderRadius = '4px'
      rsEl.append(img)
    }
    const label = el('span')
    label.textContent = `${rs.name} · ${rs.count}pc`
    rsEl.append(label)
    relicSection.append(rsEl)
  }
  // Planar set
  const planarId = slot.planar
  if (planarId) {
    const planarSet = PLANAR_SETS.find(s => s.id === planarId)
    if (planarSet) {
      const rsEl = el('div', 'partyPickMemberRelicSet planar')
      const icon = gearIconUrl('planar', planarId)
      if (icon) {
        const img = el('img')
        img.src = icon
        img.alt = ''
        img.style.width = '20px'
        img.style.height = '20px'
        img.style.borderRadius = '4px'
        rsEl.append(img)
      }
      const label = el('span')
      label.textContent = `${planarSet.name} · 2pc`
      rsEl.append(label)
      relicSection.append(rsEl)
    }
  }

  // Light Cone
  const coneSection = el('div', 'partyPickMemberCone')
  if (slot.coneId) {
    const cone = LIGHT_CONES.find(c => c.id === slot.coneId)
    if (cone) {
      const icon = gearIconUrl('cone', cone.id)
      if (icon) {
        const img = el('img')
        img.src = icon
        img.alt = ''
        img.style.width = '32px'
        img.style.height = '32px'
        img.style.borderRadius = '4px'
        coneSection.append(img)
      }
      const info = el('div', 'partyPickMemberConeInfo')
      const nameEl2 = el('div', 'partyPickMemberConeName')
      nameEl2.textContent = cone.name
      info.append(nameEl2)
      const details = el('div', 'partyPickMemberConeDetails')
      details.textContent = `Lv.${slot.coneLevel ?? 80} · S${slot.si ?? 1}`
      info.append(details)
      const rarity = el('div', 'partyPickMemberConeRarity')
      rarity.textContent = '★'.repeat(cone.rarity)
      info.append(rarity)
      coneSection.append(info)
    }
  } else {
    const empty = el('div', 'partyPickMemberConeEmpty')
    empty.textContent = '—'
    coneSection.append(empty)
  }

  card.append(header, eidolonSection, relicSection, coneSection)
  return card
}

/** Compute relic set configuration from pieces (4+2, 2+2+2, etc.). */
function computeRelicSets(slot: TeamRowState): Array<{ id: string; name: string; count: number }> {
  const counts = new Map<string, number>()
  for (const p of slot.pieces) {
    if (!p.setId) continue
    // Only count non-planar pieces (sphere and rope are planar)
    if (p.slot === 'sphere' || p.slot === 'rope') continue
    counts.set(p.setId, (counts.get(p.setId) ?? 0) + 1)
  }

  // Sort by count descending
  const sorted = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])

  return sorted.map(([id, count]) => {
    const set = RELIC_SETS.find(s => s.id === id)
    return { id, name: set?.name ?? id, count }
  })
}
