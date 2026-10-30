/**
 * §Enemy Picker — searchable, filterable catalog of enemy variants.
 *
 * Uses the canonical catalog from `src/core/enemy` and presents variants with
 * search, filters, and preview. Opens as an overlay like the character/cone pickers.
 */
import { el } from './dom'
import { iconNode } from './icons'
import { DEFINITIONS as ENEMY_DEFINITIONS, enemyBehavior, ELEMS, getEnemyStatRow } from '../core/enemy'
import { enemyIconUrl, elemIconUrl } from './icons'
import { openOverlay, RANK_LABELS } from './pickers'

interface EnemyPickerOptions {
  current?: string
  onSelect: (variant: any, definition: any) => void
}

export function openEnemyPicker(opts: EnemyPickerOptions): { close: () => void } {
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
  ov.root.style.maxWidth = '1200px'

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

  // Main content area with grid + preview panel
  const contentRow = el('div', 'enemyPickerContent')
  const grid = el('div', 'enemyPickerGrid')
  const previewPanel = el('div', 'enemyPickerPreview')
  previewPanel.style.display = 'none'
  contentRow.append(grid, previewPanel)
  ov.body.append(search, rankRow, factionRow, elemRow, aiRow, contentRow)

  let curRank = 'all'
  let curFaction = 'all'
  let curElement = 'all'
  let curAI = 'all'
  let selectedVariant: any = null
  let selectedDefinition: any = null
  // Suppress unused - written in click handlers
  void selectedVariant
  void selectedDefinition

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

      // Click to select
      btn.onclick = () => {
        selectedVariant = variant
        selectedDefinition = definition
        ov.close()
        resolve(variant)
        opts.onSelect(variant, definition)
      }

      // Hover to show preview
      btn.onmouseenter = () => showPreview(variant, definition)
      btn.onmouseleave = () => hidePreview()

      grid.append(btn)
      index++
    }

    if (!grid.childElementCount) {
      const empty = el('em', 'dim')
      empty.textContent = 'Нет противников под фильтр'
      grid.append(empty)
    }
  }

  function showPreview(variant: any, definition: any): void {
    previewPanel.innerHTML = ''
    previewPanel.style.display = ''

    // Get stats at level 80 (or default level)
    const level = variant.level ?? 80
    const statRow = getEnemyStatRow(variant, level)

    // Header with large icon
    const header = el('div', 'enemyPreviewHeader')
    const iconUrl = enemyIconUrl(variant.title)
    header.append(iconNode(iconUrl, variant.title, {
      cls: 'enemyPreviewIcon', size: 96, fit: 'cover',
      fallbackText: variant.title.trim().charAt(0).toUpperCase() || '?',
      tint: '#7fb3ff', title: variant.title,
    }))

    const nameWrap = el('div', 'enemyPreviewNameWrap')
    const name = el('h3', 'enemyPreviewName')
    name.textContent = variant.title
    nameWrap.append(name)

    const meta = el('div', 'enemyPreviewMeta')
    const rankBadge = el('span', `enemyRankBadge rank-${variant.rank}`)
    rankBadge.textContent = RANK_LABELS[variant.rank]
    const factionText = el('span', 'enemyFactionText')
    factionText.textContent = definition.faction.join(', ')
    meta.append(rankBadge, factionText)
    nameWrap.append(meta)
    header.append(nameWrap)
    previewPanel.append(header)

    // Stats grid
    if (statRow) {
      const statsSection = el('div', 'enemyPreviewSection')
      const statsTitle = el('h4', 'enemyPreviewSectionTitle')
      statsTitle.textContent = `Характеристики (ур. ${level})`
      statsSection.append(statsTitle)

      const statsGrid = el('div', 'enemyPreviewStatsGrid')
      const stats = [
        ['HP', statRow.hp.toLocaleString()],
        ['ATK', statRow.atk.toLocaleString()],
        ['DEF', statRow.def.toLocaleString()],
        ['SPD', statRow.spd.toFixed(1)],
        ['EHR', (statRow.effectHitRate * 100).toFixed(1) + '%'],
        ['Eff RES', (statRow.effectRes * 100).toFixed(1) + '%'],
      ]
      for (const [label, value] of stats) {
        const row = el('div', 'enemyPreviewStatRow')
        const labelEl = el('span', 'enemyPreviewStatLabel')
        labelEl.textContent = label
        const valueEl = el('span', 'enemyPreviewStatValue')
        valueEl.textContent = value
        row.append(labelEl, valueEl)
        statsGrid.append(row)
      }
      statsSection.append(statsGrid)
      previewPanel.append(statsSection)
    }

    // Toughness
    const toughnessSection = el('div', 'enemyPreviewSection')
    const toughnessTitle = el('h4', 'enemyPreviewSectionTitle')
    toughnessTitle.textContent = 'Жесткость'
    toughnessSection.append(toughnessTitle)

    const toughnessGrid = el('div', 'enemyPreviewStatsGrid')
    const toughness = variant.toughnessModel
    if (toughness) {
      const rows: [string, string][] = [
        ['Основная', toughness.primary.toLocaleString()],
        ['Мульти-бар', toughness.segments.map((s: any) => `${s.max}×${s.count}`).join(', ') || '—'],
        ['Неизвестно', toughness.unknown ? 'Да' : 'Нет'],
      ]
      if (toughness.phases?.length) {
        rows.push(['Фазы', toughness.phases.map((p: any) => `${p.phase}: ${p.segments.map((s: any) => `${s.max}×${s.count}`).join(', ')}`).join('; ')])
      }
      for (const [label, value] of rows) {
        const row = el('div', 'enemyPreviewStatRow')
        const labelEl = el('span', 'enemyPreviewStatLabel')
        labelEl.textContent = label
        const valueEl = el('span', 'enemyPreviewStatValue')
        valueEl.textContent = value
        row.append(labelEl, valueEl)
        toughnessGrid.append(row)
      }
    }
    toughnessSection.append(toughnessGrid)
    previewPanel.append(toughnessSection)

    // Weaknesses
    const weakSection = el('div', 'enemyPreviewSection')
    const weakTitle = el('h4', 'enemyPreviewSectionTitle')
    weakTitle.textContent = 'Слабости'
    weakSection.append(weakTitle)

    const weakGrid = el('div', 'enemyPreviewWeaknesses')
    for (const elem of variant.weaknesses) {
      weakGrid.append(iconNode(elemIconUrl(elem), elem, {
        cls: 'enemyPreviewWeaknessIcon', size: 32, fit: 'contain',
        fallbackText: elem.charAt(0), tint: '#7fb3ff', title: elem,
      }))
    }
    weakSection.append(weakGrid)
    previewPanel.append(weakSection)

    // Resistances
    if (variant.resistanceProfile && Object.keys(variant.resistanceProfile).length > 0) {
      const resSection = el('div', 'enemyPreviewSection')
      const resTitle = el('h4', 'enemyPreviewSectionTitle')
      resTitle.textContent = 'Сопротивления'
      resSection.append(resTitle)

      const resGrid = el('div', 'enemyPreviewStatsGrid')
      for (const [elem, value] of Object.entries(variant.resistanceProfile) as [string, number][]) {
        const row = el('div', 'enemyPreviewStatRow')
        const labelEl = el('span', 'enemyPreviewStatLabel')
        labelEl.append(iconNode(elemIconUrl(elem), elem, { cls: 'miniIcon', size: 14, fit: 'contain', fallbackText: elem.charAt(0), tint: '#7fb3ff', title: elem }))
        labelEl.append(' ' + elem)
        const valueEl = el('span', 'enemyPreviewStatValue')
        valueEl.textContent = (value >= 0 ? '+' : '') + (value * 100).toFixed(0) + '%'
        valueEl.style.color = value >= 0 ? '#e08a8a' : '#7fd18a'
        row.append(labelEl, valueEl)
        resGrid.append(row)
      }
      resSection.append(resGrid)
      previewPanel.append(resSection)
    }

    // Debuff RES
    if (variant.effectResistanceProfile?.values?.length) {
      const debuffSection = el('div', 'enemyPreviewSection')
      const debuffTitle = el('h4', 'enemyPreviewSectionTitle')
      debuffTitle.textContent = 'Debuff RES'
      debuffSection.append(debuffTitle)

      const debuffGrid = el('div', 'enemyPreviewStatsGrid')
      const headers = variant.effectResistanceProfile.headers
      for (let i = 0; i < variant.effectResistanceProfile.values.length; i++) {
        const row = el('div', 'enemyPreviewStatRow')
        const labelEl = el('span', 'enemyPreviewStatLabel')
        labelEl.textContent = headers[i] ?? `Debuff ${i + 1}`
        const valueEl = el('span', 'enemyPreviewStatValue')
        valueEl.textContent = (variant.effectResistanceProfile.values[i] * 100).toFixed(0) + '%'
        row.append(labelEl, valueEl)
        debuffGrid.append(row)
      }
      debuffSection.append(debuffGrid)
      previewPanel.append(debuffSection)
    }

    // Skills
    if (variant.skills?.length) {
      const skillsSection = el('div', 'enemyPreviewSection')
      const skillsTitle = el('h4', 'enemyPreviewSectionTitle')
      skillsTitle.textContent = 'Способности'
      skillsSection.append(skillsTitle)

      const skillsList = el('div', 'enemyPreviewSkills')
      for (const skill of variant.skills) {
        const skillEl = el('div', 'enemyPreviewSkill')
        const skillName = el('span', 'enemyPreviewSkillName')
        skillName.textContent = skill.name
        const skillTag = el('span', 'enemyPreviewSkillTag')
        skillTag.textContent = skill.tag
        skillEl.append(skillName, skillTag)
        if (skill.description) {
          const skillDesc = el('span', 'enemyPreviewSkillDesc')
          skillDesc.textContent = skill.description
          skillEl.append(skillDesc)
        }
        skillsList.append(skillEl)
      }
      skillsSection.append(skillsList)
      previewPanel.append(skillsSection)
    }

    // Gameplay notes
    if (variant.gameplayNotes) {
      const notesSection = el('div', 'enemyPreviewSection')
      const notesTitle = el('h4', 'enemyPreviewSectionTitle')
      notesTitle.textContent = 'Заметки'
      notesSection.append(notesTitle)

      const notesText = el('div', 'enemyPreviewNotes')
      notesText.textContent = variant.gameplayNotes
      notesSection.append(notesText)
      previewPanel.append(notesSection)
    }

    // Select button
    const selectBtn = el('button', 'enemyPreviewSelectBtn btn-primary')
    selectBtn.textContent = 'Выбрать'
    selectBtn.onclick = () => {
      selectedVariant = variant
      selectedDefinition = definition
      ov.close()
      resolve(variant)
      opts.onSelect(variant, definition)
    }
    previewPanel.append(selectBtn)
  }

  function hidePreview(): void {
    previewPanel.style.display = 'none'
  }

  search.oninput = () => { filter.search = search.value; paint() }
  paint()

  return { close: ov.close }
}