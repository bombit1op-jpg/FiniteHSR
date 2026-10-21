/**
 * §Party Setup — modal pickers (character / Light Cone).
 *
 * Both pickers are overlay panels built from plain DOM: they open over the page, filter live, and
 * resolve with the chosen id (or null when dismissed). They own no state — the caller passes the
 * current selection and the excluded ids, and applies the result.
 */
import { KITS, KIT_PATH } from '../core/kits'
import { LIGHT_CONES } from '../core/gear'
import { coneOptions, signatureCone } from '../core/gearOrder'
import { el, fillSelect } from './dom'
import { charPortraitUrl, gearIconUrl, iconNode, elemIconUrl } from './icons'
import type { Party } from '../core/party'

interface Overlay {
  root: HTMLElement
  body: HTMLElement
  /** tear down the overlay (no promise resolution — the caller resolves) */
  close: () => void
}

function openOverlay(title: string, onDismiss: () => void): Overlay {
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

  let done = false
  const close = () => {
    if (done) return
    done = true
    root.remove()
    document.removeEventListener('keydown', onKey)
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); onDismiss() } }
  document.addEventListener('keydown', onKey)
  x.onclick = () => { close(); onDismiss() }
  root.addEventListener('click', (e) => { if (e.target === root) { close(); onDismiss() } })
  return { root, body, close }
}

const PATHS = [...new Set(Object.values(KIT_PATH))].filter(Boolean).sort()
const ELEMS = [...new Set(KITS.map(k => k.elem))].sort()

/**
 * Character picker: portraits of every character, filtered by path and element.
 * `exclude` holds the kit ids already taken by teammates — they are hidden from the list.
 */
export function openCharacterPicker(opts: { exclude?: string[]; current?: string } = {}): Promise<string | null> {
  const exclude = new Set(opts.exclude ?? [])
  let resolve!: (v: string | null) => void
  const promise = new Promise<string | null>(r => { resolve = r })
  const ov = openOverlay('ВЫБОР ПЕРСОНАЖА', () => resolve(null))

  const filters = el('div', 'pickerFilters')
  const pathSel = el('select', 'pickerFilter') as HTMLSelectElement
  fillSelect(pathSel, [['*', 'Все пути'], ...PATHS.map(p => [p, p] as [string, string])])
  const elemSel = el('select', 'pickerFilter') as HTMLSelectElement
  fillSelect(elemSel, [['*', 'Все элементы'], ...ELEMS.map(e => [e, e] as [string, string])])
  pathSel.setAttribute('aria-label', 'Фильтр по пути')
  elemSel.setAttribute('aria-label', 'Фильтр по элементу')
  filters.append(pathSel, elemSel)
  const grid = el('div', 'pickerGrid')
  ov.body.append(filters, grid)

  const paint = () => {
    grid.innerHTML = ''
    const path = pathSel.value
    const elem = elemSel.value
    for (const k of KITS) {
      if (exclude.has(k.id)) continue
      const p = KIT_PATH[k.id] ?? ''
      if (path !== '*' && p !== path) continue
      if (elem !== '*' && k.elem !== elem) continue
      const btn = el('button', 'pickerChar') as HTMLButtonElement
      btn.type = 'button'
      btn.dataset.kitId = k.id
      if (k.id === opts.current) btn.classList.add('current')
      btn.title = `${k.name} · ${p} · ${k.elem}`
      const art = iconNode(charPortraitUrl(k.id), k.name, {
        cls: 'pickPortrait', size: 96, fit: 'contain',
        fallbackText: k.name.trim().charAt(0).toUpperCase() || '?',
        tint: '#7fb3ff', title: k.name,
      })
      const name = el('div', 'pickName')
      name.textContent = k.name
      const meta = el('div', 'pickMeta')
      const elemIcon = iconNode(elemIconUrl(k.elem), k.elem, {
        cls: 'metaIcon', size: 16, fit: 'contain',
        fallbackText: k.elem.charAt(0), tint: '#7fb3ff', title: k.elem,
      })
      meta.append(document.createTextNode(`${p} · `), elemIcon)
      btn.append(art, name, meta)
      btn.onclick = () => { ov.close(); resolve(k.id) }
      grid.append(btn)
    }
    if (!grid.childElementCount) {
      const empty = el('em', 'dim')
      empty.textContent = 'Нет персонажей под фильтр'
      grid.append(empty)
    }
  }
  pathSel.onchange = paint
  elemSel.onchange = paint
  paint()
  return promise
}

  /**
   * Light Cone picker: the cone list in setup order (signature -> own path 5* -> own path 4* ->
   * other 5* -> other 4* -> rest). Cones of another path are dimmed: their stats still apply,
   * but the passive does not.
   */
  export function openConePicker(opts: { kitId: string; current?: string }): Promise<string | null> {
    const path = KIT_PATH[opts.kitId] ?? ''
    const sig = signatureCone(opts.kitId)
    let resolve!: (v: string | null) => void
    const promise = new Promise<string | null>(r => { resolve = r })
    const ov = openOverlay('ВЫБОР СВЕТОВОГО КОНУСА', () => resolve(null))
  
    const list = el('div', 'pickerList')
    ov.body.append(list)
    for (const [id] of coneOptions(opts.kitId, path)) {
      if (!id) continue
      const cone = LIGHT_CONES.find(c => c.id === id)
      if (!cone) continue
      const btn = el('button', 'pickerCone') as HTMLButtonElement
      btn.type = 'button'
      btn.dataset.coneId = id
      if (cone.path !== path) btn.classList.add('offPath')
      if (id === opts.current) btn.classList.add('current')
      if (id === sig) btn.classList.add('sig')
      const art = iconNode(gearIconUrl('cone', id), cone.name, {
        cls: 'gearIcon', size: 56, fit: 'contain',
        fallbackText: cone.name.trim().charAt(0).toUpperCase() || '?',
        tint: '#7fb3ff', title: cone.name,
      })
      const name = el('div', 'pickName')
      name.textContent = cone.name
      const meta = el('div', 'pickMeta')
      meta.textContent = `★${cone.rarity} · ${cone.path}${id === sig ? ' · сигнатура' : ''}`
      btn.append(art, name, meta)
      btn.onclick = () => { ov.close(); resolve(id) }
      list.append(btn)
    }
    return promise
  }
  
  /** Party list picker for header: shows up to 4 small portraits + party name */
  export function openPartyListPicker(opts: { parties: Party[]; activeId: string | null }): Promise<string | null> {
    let resolve!: (v: string | null) => void
    const promise = new Promise<string | null>(r => { resolve = r })
    const ov = openOverlay('ВЫБОР ОТРЯДА', () => resolve(null))
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
        const ic = iconNode(k ? charPortraitUrl(k.id) : undefined, k?.name ?? '—', {
          cls: 'partyPickIcon', size: 26, fit: 'cover',
          fallbackText: k ? (k.name.trim().charAt(0).toUpperCase() || '?') : '—',
          tint: k ? '#7fb3ff' : '#55606f', title: k?.name ?? '',
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
