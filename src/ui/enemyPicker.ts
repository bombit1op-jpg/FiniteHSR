/**
 * §Enemy Picker — searchable, filterable catalog of enemy variants.
 *
 * Uses the canonical catalog from `src/core/enemy` and presents variants with
 * search, filters, and preview. Opens as an overlay like the character/cone pickers.
 */
import { el } from './dom'
import { iconNode } from './icons'
import { DEFINITIONS as ENEMY_DEFINITIONS, enemyBehavior, ELEMS } from '../core/enemy'
import { enemyIconUrl, elemIconUrl } from './icons'
import { openOverlay, RANK_LABELS } from './pickers'

export function openEnemyPicker(opts: { current?: string; onSelect: (variant: any, definition: any) => void }): { close: () => void } {
  const filter = {
    search: '',
    rank: 'all' as 'all' | 'mob' | 'elite' | 'boss',
    faction: 'all' as 'all' | string,
    element: 'all' as 'all' | string,
    aiStatus: 'all' as 'all' | 'implemented' | 'unimplemented',
  }

  let resolve!: (v: null) => void
  const ov = openOverlay('ВЫБОР ПРОТИВНИКА', () => resolve(null))
  ov.root.classList.add('enemyPickerOverlay')

  // --- Header: search + filters ---
  const search = el('input', 'pickerSearch') as HTMLInputElement
  search.type = 'search'
  search.placeholder = 'Поиск по названию...'
  search.setAttribute('aria-label', 'Поиск противника')

  // Rank filter
  const rankRow = el('div', 'pickerBtnRow')
  const rankBtns = new Map<string, HTMLButtonElement>()
  for (const [val, label] of Object.entries(RANK_LABELS)) {
    const b = el('button', 'pickerToggle pickerBtn' + (val === 'all' ? ' active' : '')) as HTMLButtonElement
    b.type = 'button'
    b.textContent = label
    rankBtns.set(val, b)
    rankRow.append(b)
  }

  // Faction filter
  const factionRow = el('div', 'pickerBtnRow')
  const factionBtns = new Map<string, HTMLButtonElement>()
  const allFactions = ['all', ...Array.from(new Set(ENEMY_DEFINITIONS.flatMap(d => d.faction))).sort()]
  for (const f of allFactions) {
    const b = el('button', 'pickerToggle pickerBtn' + (f === 'all' ? ' active' : '')) as HTMLButtonElement
    b.type = 'button'
    b.textContent = f === 'all' ? 'Все' : f
    factionBtns.set(f, b)
    factionRow.append(b)
  }

  // Element filter
  const elemRow = el('div', 'pickerBtnRow')
  const elemBtns = new Map<string, HTMLButtonElement>()
  for (const e of ['all', ...ELEMS]) {
    const b = el('button', 'pickerToggle pickerBtn' + (e === 'all' ? ' active' : '')) as HTMLButtonElement
    b.type = 'button'
    const icon = e === 'all' ? null : iconNode(e, e, { cls: 'miniIcon', size: 16, fit: 'contain', fallbackText: e.charAt(0), tint: '#7fb3ff', title: e })
    const txt = el('span'); txt.textContent = e === 'all' ? 'Все' : e
    if (icon) b.append(icon)
    b.append(txt)
    elemBtns.set(e, b)
    elemRow.append(b)
  }

  // AI Status filter
  const aiRow = el('div', 'pickerBtnRow')
  const aiBtns = new Map<string, HTMLButtonElement>()
  for (const [val, label] of Object.entries({ all: 'Все', implemented: 'Реализован', unimplemented: 'Не реализован' })) {
    const b = el('button', 'pickerToggle pickerBtn' + (val === 'all' ? ' active' : '')) as HTMLButtonElement
    b.type = 'button'
    b.textContent = label
    aiBtns.set(val, b)
    aiRow.append(b)
  }

  const grid = el('div', 'enemyPickerGrid')
  ov.body.append(search, rankRow, factionRow, elemRow, aiRow, grid)

  let curRank = 'all'
  let curFaction = 'all'
  let curElement = 'all'
  let curAI = 'all'

  for (const [k, b] of rankBtns) b.onclick = () => { curRank = k; for (const [kk, bb] of rankBtns) bb.classList.toggle('active', kk === k); paint() }
  for (const [k, b] of factionBtns) b.onclick = () => { curFaction = k; for (const [kk, bb] of factionBtns) bb.classList.toggle('active', kk === k); paint() }
  for (const [k, b] of elemBtns) b.onclick = () => { curElement = k; for (const [kk, bb] of elemBtns) bb.classList.toggle('active', kk === k); paint() }
  for (const [k, b] of aiBtns) b.onclick = () => { curAI = k; for (const [kk, bb] of aiBtns) bb.classList.toggle('active', kk === k); paint() }

  const paint = () => {
    grid.innerHTML = ''
    const q = search.value.trim().toLowerCase()

    // Collect all variants with their definitions
    const variants: Array<{ variant: any; definition: any }> = []
    for (const def of ENEMY_DEFINITIONS) {
      for (const v of def.variants) {
        variants.push({ variant: v, definition: def })
      }
    }

    let index = 0
    for (const { variant, definition } of variants) {
      if (q && !variant.title.toLowerCase().includes(q)) continue
      if (curRank !== 'all' && variant.rank !== curRank) continue
      if (curFaction !== 'all' && !definition.faction.includes(curFaction)) continue
      if (curElement !== 'all' && !variant.weaknesses.includes(curElement)) continue

      // AI status filter
      const hasBehavior = enemyBehavior(variant.title) !== undefined
      if (curAI === 'implemented' && !hasBehavior) continue
      if (curAI === 'unimplemented' && hasBehavior) continue

      const btn = el('button', 'enemyPickerCard animate__animated animate__fadeInUp') as HTMLButtonElement
      btn.style.animationDelay = `${index * 10}ms`
      btn.style.animationDuration = '150ms'
      btn.type = 'button'
      btn.dataset.variantId = variant.variantId
      if (variant.variantId === opts.current) btn.classList.add('current')
      btn.title = `${variant.title} (${definition.baseName})`

      const iconUrl = enemyIconUrl(variant.title)
      const art = iconNode(iconUrl, variant.title, {
        cls: 'enemyPickIcon', size: 56, fit: 'cover',
        fallbackText: variant.title.trim().charAt(0).toUpperCase() || '?',
        tint: '#7fb3ff', title: variant.title,
      })

      const info = el('div', 'enemyPickInfo')
      const name = el('div', 'enemyPickName')
      name.textContent = variant.title
      const meta = el('div', 'enemyPickMeta')
      const elemIcon = iconNode(elemIconUrl ? elemIconUrl(variant.weaknesses[0] ?? 'Physical') : undefined, variant.weaknesses[0] ?? 'Physical', {
        cls: 'miniIcon', size: 14, fit: 'contain', fallbackText: variant.weaknesses[0]?.charAt(0) ?? '?', tint: '#7fb3ff', title: variant.weaknesses[0] ?? 'Physical'
      })
      const rankBadge = el('span', `enemyRankBadge rank-${variant.rank}`)
      rankBadge.textContent = RANK_LABELS[variant.rank]
      meta.append(elemIcon, rankBadge)
      info.append(name, meta)

      const preview = el('div', 'enemyPickPreview')
      const rankText = el('span', 'enemyRankText')
      rankText.textContent = RANK_LABELS[variant.rank]
      const factionText = el('span', 'enemyFactionText')
      factionText.textContent = definition.faction.join(', ')
      preview.append(rankText, factionText)

      btn.append(art, info, preview)
      btn.onclick = () => { ov.close(); resolve(variant); opts.onSelect(variant, definition) }
      grid.append(btn)
      index++
    }

    if (!grid.childElementCount) {
      const empty = el('em', 'dim')
      empty.textContent = 'Нет противников под фильтр'
      grid.append(empty)
    }
  }

  search.oninput = () => { filter.search = search.value; paint() }
  paint()

  return { close: ov.close }
}