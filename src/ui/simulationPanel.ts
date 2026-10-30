/**
 * §Simulation — Battle simulation panel.
 *
 * Reads the active party from PartyStore, builds BattleSetup, runs the engine,
 * and renders results using existing engine APIs (runBattle, BattleLogger).
 */
import { PartyStore } from './partyStore'
import { KITS } from '../core/kits'
import { runBattle, ENCOUNTER_PRESETS } from '../core/battle'
import { resolveEncounter, type EncounterSpec } from '../core/encounter'
import { toTeamSpec } from './team'
import { techniquesForRows } from './store'
import { el } from './dom'
import { charFinalStats } from '../core/charStats'
import { withBusy, showStatus } from './shell'
import { openEnemyPicker } from './enemyPicker'
import type { DebugLevel } from '../core/battlelog'

interface SimPanelHandle {
  root: HTMLElement
  refresh: () => void
}

const mounted = new WeakMap<HTMLElement, SimPanelHandle>()

export function initSimulationPanel(host: HTMLElement, store: PartyStore): SimPanelHandle {
  const prev = mounted.get(host)
  if (prev) { prev.refresh(); return prev }

  host.innerHTML = ''
  const root = el('div', 'simulationRoot')
  host.append(root)

  // State
  let currentSim: ReturnType<typeof runBattle> | null = null

  // --- Header ---
  const header = el('header', 'simHeader')
  const title = el('h1', 'simTitle')
  title.textContent = 'Симуляция боя'
  header.append(title)
  root.append(header)

  // --- Main content ---
  const main = el('div', 'simMain')
  root.append(main)

  // Left: Party summary + Battle params
  const leftCol = el('div', 'simLeft')
  root.append(leftCol)

  // Right: Results
  const rightCol = el('div', 'simRight')
  root.append(rightCol)

  // --- Party Summary ---
  const partySection = section('Активный отряд')
  root.append(partySection)

  const partySummary = el('div', 'simPartySummary')
  partySection.append(partySummary)

  // --- Battle Parameters ---
  const paramsSection = section('Параметры боя')
  const paramsContainer = el('div', 'simParams')
  root.append(paramsSection)
  paramsSection.append(paramsContainer)

  // Encounter select
  const encounterLabel = el('label')
  encounterLabel.textContent = 'Противник / Энкаунтер'
  const encounterSel = el('select') as HTMLSelectElement
  for (const [key, preset] of Object.entries(ENCOUNTER_PRESETS)) {
    const opt = el('option')
    opt.value = key
    const totalEnemies = preset.waves.reduce((sum, wave) => sum + wave.reduce((s, g) => s + g.count, 0), 0)
    const waveCount = preset.waves?.length ?? 1
    opt.textContent = `${preset.mode} (${totalEnemies} враг${totalEnemies > 1 ? 'а' : ''}, ${waveCount} волн${waveCount > 1 ? 'ы' : ''})`
    encounterSel.append(opt)
  }
  encounterSel.value = 'moc12'
  encounterLabel.append(encounterSel)
  paramsSection.append(encounterLabel)

  // --- Custom Encounter Builder ---
  const builderSection = section('Конструктор энкаунтера')
  builderSection.style.display = 'none'
  const builderContainer = el('div', 'encounterBuilder')
  builderSection.append(builderContainer)
  paramsSection.append(builderSection)

  // Toggle between preset and custom
  const modeRow = el('div', 'encounterModeRow')
  const presetRadio = el('input') as HTMLInputElement
  presetRadio.type = 'radio'
  presetRadio.name = 'encounterMode'
  presetRadio.value = 'preset'
  presetRadio.checked = true
  const presetLabel = el('label')
  presetLabel.textContent = 'Готовый энкаунтер'
  presetLabel.prepend(presetRadio)

  const customRadio = el('input') as HTMLInputElement
  customRadio.type = 'radio'
  customRadio.name = 'encounterMode'
  customRadio.value = 'custom'
  const customLabel = el('label')
  customLabel.textContent = 'Свой энкаунтер'
  customLabel.prepend(customRadio)

  modeRow.append(presetLabel, customLabel)
  paramsSection.insertBefore(modeRow, paramsSection.firstChild!)

  // State for custom encounter
  let customEncounter: EncounterSpec = {
    id: 'custom',
    mode: 'Custom',
    waves: [[{ name: '', count: 1, hp: 25000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] }]],
    cycles: 6,
  }

  function renderBuilder() {
    builderContainer.innerHTML = ''
    for (let wi = 0; wi < customEncounter.waves.length; wi++) {
      const wave = customEncounter.waves[wi]
      const waveDiv = el('div', 'encounterWave')
      const waveHeader = el('div', 'encounterWaveHeader')
      const waveTitle = el('span')
      waveTitle.textContent = `Волна ${wi + 1}`
      const removeWaveBtn = el('button', 'iconBtn danger small')
      removeWaveBtn.textContent = '×'
      removeWaveBtn.title = 'Удалить волну'
      removeWaveBtn.disabled = customEncounter.waves.length === 1
      removeWaveBtn.onclick = () => {
        customEncounter.waves.splice(wi, 1)
        renderBuilder()
      }
      waveHeader.append(waveTitle, removeWaveBtn)
      waveDiv.append(waveHeader)

      for (let gi = 0; gi < wave.length; gi++) {
        const group = wave[gi]
        const groupDiv = el('div', 'encounterGroup')
        const pickBtn = el('button', 'encounterPickBtn')
        pickBtn.textContent = group.name || 'Выбрать врага...'
        pickBtn.onclick = () => {
          openEnemyPicker({
            onSelect: (variant, definition) => {
              group.name = variant.name
              group.hp = variant.baseHP ?? variant.hp ?? 25000
              group.spd = variant.baseSPD ?? variant.spd ?? 132
              group.level = variant.level ?? 80
              group.toughness = variant.toughness ?? 30
              group.weaknesses = variant.weaknesses ?? ['Fire', 'Lightning']
              group.res = variant.res
              group.effectRes = variant.effectRes
              group.atk = variant.atk
              group.debuffRes = variant.debuffRes
              group.rank = variant.rank
              pickBtn.textContent = group.name
              renderBuilder()
            },
          })
        }
        groupDiv.append(pickBtn)

        // Count
        const countInp = el('input') as HTMLInputElement
        countInp.type = 'number'
        countInp.min = '1'
        countInp.max = '10'
        countInp.value = String(group.count)
        countInp.style.width = '60px'
        countInp.onchange = () => { group.count = Math.max(1, parseInt(countInp.value) || 1) }
        const countLabel = el('label')
        countLabel.textContent = ' Кол-во'
        countLabel.prepend(countInp)
        groupDiv.append(countLabel)

        // HP
        const hpInp = el('input') as HTMLInputElement
        hpInp.type = 'number'
        hpInp.min = '1'
        hpInp.value = String(group.hp)
        hpInp.style.width = '80px'
        hpInp.onchange = () => { group.hp = Math.max(1, parseInt(hpInp.value) || 1) }
        const hpLabel = el('label')
        hpLabel.textContent = ' HP'
        hpLabel.prepend(hpInp)
        groupDiv.append(hpLabel)

        // Level
        const lvlInp = el('input') as HTMLInputElement
        lvlInp.type = 'number'
        lvlInp.min = '1'
        lvlInp.max = '95'
        lvlInp.value = String(group.level)
        lvlInp.style.width = '60px'
        lvlInp.onchange = () => { group.level = Math.max(1, Math.min(95, parseInt(lvlInp.value) || 1)) }
        const lvlLabel = el('label')
        lvlLabel.textContent = ' Ур'
        lvlLabel.prepend(lvlInp)
        groupDiv.append(lvlLabel)

        // Toughness
        const touInp = el('input') as HTMLInputElement
        touInp.type = 'number'
        touInp.min = '0'
        touInp.value = String(group.toughness)
        touInp.style.width = '60px'
        touInp.onchange = () => { group.toughness = Math.max(0, parseInt(touInp.value) || 0) }
        const touLabel = el('label')
        touLabel.textContent = ' Жест'
        touLabel.prepend(touInp)
        groupDiv.append(touLabel)

        const removeGroupBtn = el('button', 'iconBtn danger small')
        removeGroupBtn.textContent = '×'
        removeGroupBtn.title = 'Удалить группу'
        removeGroupBtn.disabled = wave.length === 1
        removeGroupBtn.onclick = () => { wave.splice(gi, 1); renderBuilder() }
        groupDiv.append(removeGroupBtn)

        waveDiv.append(groupDiv)
      }

      const addGroupBtn = el('button', 'addGroupBtn')
      addGroupBtn.textContent = '+ Добавить группу'
      addGroupBtn.onclick = () => {
        wave.push({ name: '', count: 1, hp: 25000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] })
        renderBuilder()
      }
      waveDiv.append(addGroupBtn)
      builderContainer.append(waveDiv)
    }

    const addWaveBtn = el('button', 'addWaveBtn')
    addWaveBtn.textContent = '+ Добавить волну'
    addWaveBtn.onclick = () => {
      customEncounter.waves.push([{ name: '', count: 1, hp: 25000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] }])
      renderBuilder()
    }
    builderContainer.append(addWaveBtn)

    // Cycles input for custom
    const cyclesRow = el('div', 'builderCyclesRow')
    const cyclesLabel2 = el('label')
    cyclesLabel2.textContent = 'Циклы'
    const cyclesInp2 = el('input') as HTMLInputElement
    cyclesInp2.type = 'number'
    cyclesInp2.min = '1'
    cyclesInp2.max = '20'
    cyclesInp2.value = String(customEncounter.cycles ?? 6)
    cyclesInp2.onchange = () => { customEncounter.cycles = Math.max(1, Math.min(20, parseInt(cyclesInp2.value) || 6)) }
    cyclesLabel2.append(cyclesInp2)
    cyclesRow.append(cyclesLabel2)
    builderContainer.append(cyclesRow)
  }

  // Toggle handler
  function toggleBuilder() {
    const isCustom = customRadio.checked
    encounterLabel.style.display = isCustom ? 'none' : ''
    builderSection.style.display = isCustom ? '' : 'none'
  }
  presetRadio.onchange = customRadio.onchange = toggleBuilder

  // Initial render
  renderBuilder()

  // Cycles
  const cyclesLabel = el('label')
  cyclesLabel.textContent = 'Циклы'
  const cyclesInp = el('input') as HTMLInputElement
  cyclesInp.type = 'number'
  cyclesInp.min = '1'
  cyclesInp.max = '20'
  cyclesInp.value = '4'
  cyclesLabel.append(cyclesInp)
  paramsSection.append(cyclesLabel)

  // Seed
  const seedLabel = el('label')
  seedLabel.textContent = 'Seed'
  const seedInp = el('input') as HTMLInputElement
  seedInp.type = 'number'
  seedInp.min = '0'
  seedInp.max = '2147483647'
  seedInp.value = '42'
  seedLabel.append(seedInp)
  paramsSection.append(seedLabel)

  // Debug level
  const debugLabel = el('label')
  debugLabel.textContent = 'Детализация лога'
  const debugSel = el('select') as HTMLSelectElement
  const debugOptions = [
    ['0', '0 — только итог'],
    ['1', '1 — краткая сводка'],
    ['2', '2 — действия'],
    ['3', '3 — эффекты'],
    ['4', '4 — урон (по умолчанию)'],
    ['5', '5 — полный trace'],
    ['6', '6 — состояние + diff'],
    ['7', '7 — RNG + всё'],
  ]
  for (const [val, label] of debugOptions) {
    const opt = el('option')
    opt.value = val
    opt.textContent = label
    debugSel.append(opt)
  }
  debugSel.value = '4'
  debugLabel.append(debugSel)
  paramsSection.append(debugLabel)

  // Run button
  const runBtn = el('button', 'simRunBtn') as HTMLButtonElement
  runBtn.type = 'button'
  runBtn.textContent = 'Запустить симуляцию'
  runBtn.disabled = true
  paramsSection.append(runBtn)

  // --- Results Area ---
  const resultsContainer = el('div', 'simResults')
  rightCol.append(resultsContainer)

  // --- Party Store subscription ---
  const storeAny = store as any
  if (typeof storeAny.subscribe === 'function') {
    storeAny.subscribe((_prev: any, next: any) => {
      refresh()
    })
  }

  // --- Refresh function ---
  function refresh(): void {
    const party = store.active
    const filled = party?.slots.filter(s => s.kitId).length ?? 0

    // Update run button state
    runBtn.disabled = filled === 0
    runBtn.textContent = filled === 0 ? 'Сначала соберите отряд' : 'Запустить симуляцию'

    // Render party summary
    renderPartySummary(store.active)
  }

  function renderPartySummary(party: any): void {
    // Implementation would go here
    // This is a simplified version for now
  }

  // Validate custom encounter
  function validateCustomEncounter(enc: EncounterSpec): string[] {
    const errs: string[] = []
    if (!enc.waves.length) errs.push('Нет волн')
    enc.waves.forEach((wave, wi) => {
      if (!wave.length) errs.push(`Волна ${wi + 1}: нет групп врагов`)
      wave.forEach((group, gi) => {
        if (!group.name) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: не выбран враг`)
        if (!(group.count >= 1)) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: неверное кол-во`)
        if (!(group.hp > 0)) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: HP должен быть > 0`)
        if (!(group.level > 0)) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: Уровень должен быть > 0`)
        if (!(group.weaknesses?.length)) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: нет слабостей`)
      })
    })
    if (enc.cycles !== undefined && !(enc.cycles > 0)) errs.push('Циклы должны быть > 0')
    return errs
  }

  // --- Run Battle ---
  runBtn.onclick = async () => {
    const party = store.active
    if (!party || !party.slots.some(s => s.kitId)) return

    const rows = party.slots.filter(s => s.kitId)
    const team = rows.map(r => toTeamSpec(r))

    const techniques = techniquesForRows(rows)

    // Build encounter spec based on mode
    let encounterSpec: ReturnType<typeof resolveEncounter>
    let encounterId: string
    if (customRadio.checked) {
      // Validate custom encounter
      const errs = validateCustomEncounter(customEncounter)
      if (errs.length > 0) {
        showStatus('Ошибка в энкаунтере: ' + errs.join('; '), 'error')
        return
      }
      encounterSpec = resolveEncounter(customEncounter)
      encounterId = 'custom'
    } else {
      const encounterKey = encounterSel.value
      const encounterPreset = ENCOUNTER_PRESETS[encounterKey]
      if (!encounterPreset) {
        showStatus('Выбранный энкаунтер не найден', 'error')
        return
      }
      encounterSpec = resolveEncounter(encounterPreset)
      encounterId = encounterKey
    }
    if (!encounterSpec) {
      showStatus('Не удалось построить энкаунтер', 'error')
      return
    }

    // Override cycles if user changed it (for preset mode)
    const cycles = Math.max(1, Math.min(20, parseInt(cyclesInp.value) || 4))
    if (!customRadio.checked && cycles !== (ENCOUNTER_PRESETS[encounterSel.value]?.cycles ?? 4)) {
      encounterSpec.cycles = cycles
    }

    const debugLevel = parseInt(debugSel.value) as DebugLevel

    const setup = {
      team,
      encounter: encounterId,
      enemy: encounterSpec.enemy,
      enemyWaves: encounterSpec.enemyWaves,
      cycles: encounterSpec.cycles ?? cycles,
      seed: parseInt(seedInp.value) || 42,
      techniques: techniques.length ? techniques : undefined,
      manualMods: undefined,
      aha: undefined,
      log: { debug: debugLevel },
    }

    runBtn.disabled = true
    runBtn.textContent = 'Выполняется...'
    resultsContainer.innerHTML = ''
    const loading = el('div', 'simLoading')
    loading.textContent = 'Симуляция выполняется...'
    resultsContainer.append(loading)

    try {
      await withBusy('Симуляция боя', async () => {
        await new Promise(r => requestAnimationFrame(r))
        currentSim = runBattle({ ...setup, log: { debug: debugLevel } })
      })

      loading.remove()
      renderResults(currentSim!)
    } catch (e) {
      loading.remove()
      showStatus('Ошибка симуляции: ' + String(e), 'error')
      const err = el('div', 'simError')
      err.textContent = 'Ошибка: ' + String(e)
      resultsContainer.append(err)
    } finally {
      runBtn.disabled = false
      runBtn.textContent = 'Запустить симуляцию'
    }
  }

  function renderResults(sim: ReturnType<typeof runBattle>): void {
    resultsContainer.innerHTML = ''

    // Summary
    const summary = el('div', 'simSummary')
    const won = sim.endReason === 'win'
    const resultBadge = el('div', `simResultBadge ${won ? 'win' : 'lose'}`)
    resultBadge.textContent = won ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'
    summary.append(resultBadge)

    const stats = el('div', 'simStats')
    const totalDamage = [...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)
    const statsData = [
      ['Общий урон', Math.round(totalDamage).toLocaleString()],
      ['DPS', Math.round(totalDamage / Math.max(sim.avElapsed, 0.01)).toLocaleString()],
      ['Длительность (AV)', sim.avElapsed.toFixed(1)],
      ['Циклы', sim.cycle.toString()],
      ['Действий', sim.logger.actionId.toString()],
      ['Ходов', sim.logger.turn.toString()],
      ['Пробитий', sim.logger.events.filter(e => e.type === 'WEAKNESS_BREAK').length.toString()],
      ['Смертей', sim.logger.events.filter(e => e.type === 'DEATH').length.toString()],
      ['Остаток SP', sim.sp().toString()],
    ]
    for (const [label, value] of statsData) {
      const row = el('div', 'simStatRow')
      const labelEl = el('span', 'simStatLabel')
      labelEl.textContent = label
      const valEl = el('span', 'simStatValue')
      valEl.textContent = value
      row.append(labelEl, valEl)
      stats.append(row)
    }
    summary.append(stats)
    resultsContainer.append(summary)

    // Damage by character
    const dmgSection = section('Урон по персонажам')
    const dmgTable = el('table', 'simDmgTable')
    const thead = el('thead')
    thead.innerHTML = '<tr><th>Персонаж</th><th>Урон</th><th>Доля</th></tr>'
    dmgTable.append(thead)
    const tbody = el('tbody')
    const totalDmg = [...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)
    for (const [name, dmg] of Object.entries(sim.ownerDamage)) {
      const row = el('tr')
      const nameCell = el('td')
      nameCell.textContent = name
      const dmgCell = el('td')
      dmgCell.textContent = dmg.toLocaleString()
      const shareCell = el('td')
      shareCell.textContent = totalDmg > 0 ? ((dmg / totalDmg) * 100).toFixed(1) + '%' : '—'
      row.append(nameCell, dmgCell, shareCell)
      tbody.append(row)
    }
    dmgTable.append(tbody)
    dmgSection.append(dmgTable)
    resultsContainer.append(dmgSection)

    // Pre-battle stats
    const statsSection = section('Характеристики перед боем')
    const statsGrid = el('div', 'simStatsGrid')
    const party = store.active
    if (party) {
      for (const slot of party.slots.filter(s => s.kitId)) {
        const spec = toTeamSpec(slot)
        const stats = charFinalStats(spec)
        if (!stats) continue
        const card = el('div', 'simCharStatsCard')
        const name = el('div', 'simCharStatsName')
        name.textContent = KITS.find(k => k.id === slot.kitId)?.name ?? slot.kitId
        card.append(name)
        const grid = el('div', 'simCharStatsInner')
        const statsToShow = [
          ['HP', Math.round(stats.hp).toLocaleString()],
          ['ATK', Math.round(stats.atk).toLocaleString()],
          ['DEF', Math.round(stats.def).toLocaleString()],
          ['SPD', (stats.spd * 10 / 10).toFixed(1)],
          ['CRIT Rate', (stats.critRate * 100).toFixed(1) + '%'],
          ['CRIT DMG', (stats.critDmg * 100).toFixed(1) + '%'],
          ['Break Effect', (stats.be * 100).toFixed(1) + '%'],
          ['EHR', (stats.ehr * 100).toFixed(1) + '%'],
          ['Eff RES', (stats.effRes * 100).toFixed(1) + '%'],
          ['Max Energy', Math.round(stats.energyMax).toString()],
          ['Out Healing', (stats.outHeal * 100).toFixed(1) + '%'],
        ]
        if (stats.elation) statsToShow.push(['Elation DMG', (stats.elation * 100).toFixed(1) + '%'])
        for (const [label, value] of statsToShow) {
          const row = el('div', 'simCharStatRow')
          const labelEl = el('span', 'simCharStatLabel')
          labelEl.textContent = label
          const valEl = el('span', 'simCharStatValue')
          valEl.textContent = value
          row.append(labelEl, valEl)
          grid.append(row)
        }
        card.append(grid)
        statsGrid.append(card)
      }
    }
    statsSection.append(statsGrid)
    resultsContainer.append(statsSection)

    // Combat Log
    const logSection = section('Боевой журнал')
    const logContainer = el('div', 'simLogContainer')
    const logLines = sim.logger.combatLog()
    for (const line of logLines) {
      const lineEl = el('div', 'simLogLine')
      lineEl.textContent = line
      logContainer.append(lineEl)
    }
    logSection.append(logContainer)
    resultsContainer.append(logSection)

    // Damage Breakdown - use logger.damage array
    const dmgBreakSection = section('Разбивка урона')
    const dmgTraces = sim.logger.damage
    if (dmgTraces.length) {
      const list = el('div', 'simDmgBreakList')
      for (const entry of sim.logger.damage) {
        const item = el('div', 'simDmgBreakItem')
        const header = el('div', 'simDmgBreakHeader')
        header.textContent = `${entry.who} → ${entry.foe} (${entry.dmg.toLocaleString()})`
        item.append(header)
        const details = el('div', 'simDmgBreakDetails')
        const parts = [
          ['Base', entry.dmg?.toLocaleString()],
          ['Crit', entry.crit ? 'Да' : 'Нет'],
          ['Crit Rate', (entry.critRate * 100).toFixed(1) + '%'],
          ['Crit DMG', (entry.critDmg * 100).toFixed(1) + '%'],
          ['Boost', (entry.boost * 100).toFixed(1) + '%'],
          ['Weaken', (entry.weaken * 100).toFixed(1) + '%'],
          ['DEF Pen', (entry.defPen * 100).toFixed(1) + '%'],
          ['RES', (entry.res * 100).toFixed(1) + '%'],
          ['RES Pen', (entry.resPen * 100).toFixed(1) + '%'],
          ['Vuln', (entry.vuln * 100).toFixed(1) + '%'],
          ['Mitigation', (entry.mit * 100).toFixed(1) + '%'],
          ['Broken', entry.broken ? 'Да' : 'Нет'],
        ]
        for (const [label, value] of parts) {
          if (value === '—' || value === undefined) continue
          const row = el('div', 'simDmgBreakRow')
          const labelEl = el('span')
          labelEl.textContent = label
          const valEl = el('span')
          valEl.textContent = value
          row.append(labelEl, valEl)
          details.append(row)
        }
        item.append(details)
        list.append(item)
      }
      dmgBreakSection.append(list)
    } else {
      dmgBreakSection.append(el('em', 'dim'))
      dmgBreakSection.lastChild!.textContent = 'Нет данных'
    }
    resultsContainer.append(dmgBreakSection)

    // Debug Trace (collapsed)
    const traceSection = section('Технический trace')
    const traceContainer = el('div', 'simTraceContainer')
    const traceSummary = sim.logger.debugTrace()
    const traceEl = el('pre', 'simTrace')
    traceEl.textContent = traceSummary
    traceContainer.append(traceEl)
    traceSection.append(traceContainer)
    resultsContainer.append(traceSection)
  }

  // Initial render
  refresh()

  const handle = { root, refresh }
  mounted.set(host, handle)
  return handle
}

function section(title: string): HTMLElement {
  const sec = el('section', 'simSection')
  const h = el('h2')
  h.textContent = title
  sec.append(h)
  return sec
}