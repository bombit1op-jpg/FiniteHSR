/**
 * §Party Setup — anchored pickers (character / Light Cone / party list).
 *
 * Every picker opens as a popover next to the control that triggered it (portrait, cone icon,
 * party name), filters live and resolves with the chosen id (or null when dismissed). They own no
 * state — the caller passes the current selection and the excluded ids, and applies the result.
 */
import { KITS, KIT_PATH } from '../core/kits'
import { LIGHT_CONES } from '../core/gear'
import { coneOptions, signatureCone } from '../core/gearOrder'
import { el } from './dom'
import { charIconUrl, gearIconUrl, iconNode, elemIconUrl, pathIconUrl } from './icons'
import type { Party } from '../core/party'

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
  const panel = el('div', 'pickerPanel')
  const head = el('div', 'pickerHead')
  const t = el('div', 'pickerTitle')
  t.textContent = title
  const x = el('button', 'pickerClose') as HTMLButtonElement
  x.type = 'button'
  x.textContent = '✕'
  x.title = 'Закрыть'
  head.append(t, x)
  const body = el('div', 'pickerBody')
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
    for (const k of KITS) {
      if (exclude.has(k.id)) continue
      const p = KIT_PATH[k.id] ?? ''
      if (curPath !== '*' && p !== curPath) continue
      if (curElem !== '*' && k.elem !== curElem) continue
      if (q && !k.name.toLowerCase().includes(q)) continue
      const btn = el('button', 'pickerCharIcon') as HTMLButtonElement
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
    for (const id of order) {
      const cone = LIGHT_CONES.find(c => c.id === id)
      if (!cone) continue
      if (curPath !== '*' && cone.path !== curPath) continue
      if (curRare !== '*' && String(cone.rarity) !== curRare) continue
      if (q && !cone.name.toLowerCase().includes(q)) continue
      const btn = el('button', 'pickConeCard') as HTMLButtonElement
      btn.type = 'button'
      btn.dataset.coneId = id
      if (cone.path !== path) btn.classList.add('offPath')
      if (id === opts.current) btn.classList.add('current')
      if (id === sig) btn.classList.add('sig')
      const name = el('div', 'pickConeName')
      name.textContent = cone.name
      const rarity = el('div', 'pickConeRarity')
      rarity.textContent = `★${cone.rarity}`
      const art = iconNode(gearIconUrl('cone', id), cone.name, {
        cls: 'gearIcon', size: 120, fit: 'contain',
        fallbackText: cone.name.trim().charAt(0).toUpperCase() || '?',
        tint: '#7fb3ff', title: cone.name,
      })
      btn.append(name, art, rarity)
      btn.onclick = () => { ov.close(); resolve(id) }
      grid.append(btn)
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

/** Party list picker for the header: one wide row per party — 4 small portraits, then its name. */
export function openPartyListPicker(opts: { parties: Party[]; activeId: string | null; anchor?: HTMLElement }): Promise<string | null> {
  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>(r => { resolve = r })
  const ov = openOverlay('ВЫБОР ОТРЯДА', () => resolve(null), opts.anchor)
  const list = el('div', 'pickerList partyListPicker')
  ov.body.append(list)
  for (const p of opts.parties) {
    const btn = el('button', 'pickerParty') as HTMLButtonElement
    btn.type = 'button'
    if (p.id === opts.activeId) btn.classList.add('current')
    const row = el('div', 'partyPickRow')
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
    row.append(icons, name)
    btn.append(row)
    btn.onclick = () => { ov.close(); resolve(p.id) }
    list.append(btn)
  }
  return promise
}
