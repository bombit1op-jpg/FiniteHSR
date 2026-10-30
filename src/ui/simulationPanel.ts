/**
 * §Simulation — Battle simulation panel.
 *
 * Reads the active party from PartyStore, builds BattleSetup, runs the engine,
 * and renders results using existing engine APIs (runBattle, BattleLogger).
 */
import { PartyStore } from './partyStore'
import { KITS, KIT_PATH } from '../core/kits'
import { runBattle, ENCOUNTER_PRESETS } from '../core/battle'
import { resolveEncounter, type EncounterSpec, validateEncounter } from '../core/encounter'
import { toTeamSpec } from './team'
import { techniquesForRows } from './store'
import { charIconUrl, elemIconUrl, iconNode, metaBadge, enemyIconUrl, charPortraitUrl, abilityIconUrl, gearBadge } from './icons'
import { el } from './dom'
import { charFinalStats } from '../core/charStats'
import { withBusy, showStatus } from './shell'
import { openEnemyPicker } from './enemyPicker'
import type { DebugLevel } from '../core/battlelog'
import type { Party } from '../core/party'
import type { Simulator } from '../core/simulator'

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
  main.append(leftCol)

  // Right: Results
  const rightCol = el('div', 'simRight')
  main.append(rightCol)

  // --- Party Summary ---
  const partySection = section('Активный отряд')
  leftCol.append(partySection)

  const partySummary = el('div', 'simPartySummary')
  partySection.append(partySummary)

  // --- Battle Parameters ---
  const paramsSection = section('Параметры боя')
  const paramsContainer = el('div', 'simParams')
  paramsSection.append(paramsContainer)
  leftCol.append(paramsSection)

  // Mode toggle: preset vs custom
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
  paramsContainer.append(modeRow)

  // Encounter select (preset mode)
  const encounterLabel = el('label', 'encounterSelectLabel')
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
  paramsContainer.append(encounterLabel)

  // --- Custom Encounter Builder ---
  const builderSection = section('Конструктор энкаунтера')
  builderSection.style.display = 'none'
  const builderContainer = el('div', 'encounterBuilder')
  builderSection.append(builderContainer)
  paramsContainer.append(builderSection)

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
              group.def = variant.def
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

        // DEF
        const defInp = el('input') as HTMLInputElement
        defInp.type = 'number'
        defInp.min = '0'
        defInp.value = String(group.def ?? '')
        defInp.placeholder = 'DEF'
        defInp.style.width = '70px'
        defInp.onchange = () => { group.def = parseInt(defInp.value) || undefined }
        const defLabel = el('label')
        defLabel.textContent = ' DEF'
        defLabel.prepend(defInp)
        groupDiv.append(defLabel)

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

  // Update cycles input when preset changes
  encounterSel.onchange = () => {
    const preset = ENCOUNTER_PRESETS[encounterSel.value]
    if (preset && preset.cycles) {
      cyclesInp.value = String(preset.cycles)
    }
  }

  // Cycles (preset mode)
  const cyclesLabel = el('label')
  cyclesLabel.textContent = 'Циклы'
  const cyclesInp = el('input') as HTMLInputElement
  cyclesInp.type = 'number'
  cyclesInp.min = '1'
  cyclesInp.max = '20'
  cyclesInp.value = String(ENCOUNTER_PRESETS.moc12?.cycles ?? 8)
  cyclesLabel.append(cyclesInp)
  paramsContainer.append(cyclesLabel)

  // Seed
  const seedLabel = el('label')
  seedLabel.textContent = 'Seed'
  const seedInp = el('input') as HTMLInputElement
  seedInp.type = 'number'
  seedInp.min = '0'
  seedInp.max = '2147483647'
  seedInp.value = '42'
  seedLabel.append(seedInp)
  paramsContainer.append(seedLabel)

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
  paramsContainer.append(debugLabel)

  // Run button
  const runBtn = el('button', 'simRunBtn btn-primary btn-large') as HTMLButtonElement
  runBtn.type = 'button'
  runBtn.textContent = 'Запустить симуляцию'
  runBtn.disabled = true
  paramsContainer.append(runBtn)

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

  function renderPartySummary(party: Party | undefined): void {
    partySummary.innerHTML = ''
    if (!party) {
      partySummary.textContent = 'Нет активного отряда'
      return
    }

    const partyName = el('div', 'simPartyName')
    partyName.textContent = party.name
    partySummary.append(partyName)

    const slotsInfo = el('div', 'simPartySlotsInfo')
    const filledCount = party.slots.filter(s => s.kitId).length
    slotsInfo.textContent = `Слотов: ${filledCount} / ${party.slots.length}`
    partySummary.append(slotsInfo)

    const slotsGrid = el('div', 'simPartySlotsGrid')
    for (const slot of party.slots) {
      const slotEl = el('div', 'simPartySlot')
      if (slot.kitId) {
        const kit = KITS.find(k => k.id === slot.kitId)
        if (kit) {
          // Portrait
          const portraitWrap = el('div', 'simSlotPortraitWrap')
          portraitWrap.append(iconNode(charPortraitUrl(slot.kitId), kit.name, {
            cls: 'simSlotPortrait', size: 80, fit: 'cover',
            fallbackText: kit.name.charAt(0).toUpperCase(), tint: '#7fb3ff', title: kit.name,
          }))
          slotEl.append(portraitWrap)

          // Name
          const nameEl = el('div', 'simSlotName')
          nameEl.textContent = kit.name
          slotEl.append(nameEl)

          // Element + Path
          const chips = el('div', 'simSlotChips')
          chips.append(metaBadge('elem', kit.elem))
          chips.append(metaBadge('path', KIT_PATH[slot.kitId] ?? ''))
          slotEl.append(chips)

          // Eidolon
          if (slot.eidolon > 0) {
            const eidolonEl = el('div', 'simSlotEidolon')
            eidolonEl.textContent = `E${slot.eidolon}`
            slotEl.append(eidolonEl)
          }

          // Light Cone
          if (slot.coneId) {
            const coneName = el('div', 'simSlotCone')
            const cone = gearBadge('cone', slot.coneId)
            cone.style.transform = 'scale(0.7)'
            cone.style.transformOrigin = 'left center'
            coneName.append(cone)
            slotEl.append(coneName)
          }

          // Relics summary
          if (slot.relic1 || slot.relic2) {
            const relicsEl = el('div', 'simSlotRelics')
            if (slot.relic1) relicsEl.append(gearBadge('relic', slot.relic1))
            if (slot.relic2) relicsEl.append(gearBadge('relic', slot.relic2))
            if (slot.planar) relicsEl.append(gearBadge('planar', slot.planar))
            slotEl.append(relicsEl)
          }
        }
      } else {
        slotEl.classList.add('empty')
        slotEl.textContent = '+ Пустой слот'
      }
      slotsGrid.append(slotEl)
    }
    partySummary.append(slotsGrid)
  }

  // Validate custom encounter
  function validateCustomEncounter(enc: EncounterSpec): string[] {
    const errs = validateEncounter(enc)
    if (errs.length) return errs
    // Additional custom validation
    enc.waves.forEach((wave, wi) => {
      wave.forEach((group, gi) => {
        if (!group.name) errs.push(`Волна ${wi + 1}, группа ${gi + 1}: не выбран враг`)
      })
    })
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

    // Cycles handling
    const cyclesInputVal = parseInt(cyclesInp.value)
    const cycles = Number.isFinite(cyclesInputVal) && cyclesInputVal > 0 ? cyclesInputVal : (ENCOUNTER_PRESETS[encounterSel.value]?.cycles ?? 8)
    if (!customRadio.checked) {
      encounterSpec.cycles = cycles
    }

    // Seed handling - allow 0
    const seedVal = parseInt(seedInp.value)
    const seed = Number.isFinite(seedVal) && seedVal >= 0 ? seedVal : 42

    const debugLevel = parseInt(debugSel.value) as DebugLevel

    const setup = {
      team,
      encounter: encounterId,
      enemy: encounterSpec.enemy,
      enemyWaves: encounterSpec.enemyWaves,
      cycles: encounterSpec.cycles ?? cycles,
      seed,
      techniques: techniques.length ? techniques : undefined,
      manualMods: undefined,
      aha: undefined,
      log: { debug: debugLevel },
    }
    const currentParty = store.active

    runBtn.disabled = true
    runBtn.textContent = 'Выполняется...'
    resultsContainer.innerHTML = ''
    const loading = el('div', 'simLoading')
    loading.textContent = 'Симуляция выполняется...'
    resultsContainer.append(loading)

    let newSim: Simulator | null = null
    try {
      await withBusy('Симуляция боя', async () => {
        await new Promise(r => requestAnimationFrame(r))
        newSim = runBattle({ ...setup, log: { debug: debugLevel } })
      })

      loading.remove()
      renderResults(newSim!, currentParty)
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

  function renderResults(sim: Simulator, party: Party | undefined): void {
    resultsContainer.innerHTML = ''

    // Summary
    const summary = el('div', 'simSummary')
    const endReason = sim.endReason
    let resultBadge: HTMLElement
    if (endReason === 'win') {
      resultBadge = el('div', 'simResultBadge win')
      resultBadge.textContent = 'ПОБЕДА'
    } else if (endReason === 'lose') {
      resultBadge = el('div', 'simResultBadge lose')
      resultBadge.textContent = 'ПОРАЖЕНИЕ'
    } else if (endReason === 'timeout') {
      resultBadge = el('div', 'simResultBadge timeout')
      resultBadge.textContent = 'ТАЙМАУТ'
    } else {
      resultBadge = el('div', 'simResultBadge unknown')
      resultBadge.textContent = 'НЕИЗВЕСТНО (' + endReason + ')'
    }
    summary.append(resultBadge)

    const stats = el('div', 'simStats')
    const totalDamage = [...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)
    const dmgPerAv = sim.avElapsed > 0 ? totalDamage / sim.avElapsed : 0
    const statsData = [
      ['Общий урон', Math.round(totalDamage).toLocaleString()],
      ['DMG / AV', Math.round(dmgPerAv).toLocaleString()],
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

    // Damage by character (owner)
    const dmgSection = section('Урон по персонажам')
    const dmgTable = el('table', 'simDmgTable')
    const thead = el('thead')
    thead.innerHTML = '<tr><th>Персонаж</th><th>Урон</th><th>Доля</th><th>Атак</th></tr>'
    dmgTable.append(thead)
    const tbody = el('tbody')
    const totalDmg = [...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)
    for (const [ownerId, dmg] of sim.ownerDamage) {
      const unit = sim.roster.find(u => u.id === ownerId)
      const name = unit?.name ?? ownerId
      const row = el('tr')
      const nameCell = el('td')
      nameCell.textContent = name
      const dmgCell = el('td')
      dmgCell.textContent = Math.round(dmg).toLocaleString()
      const shareCell = el('td')
      shareCell.textContent = totalDmg > 0 ? ((dmg / totalDmg) * 100).toFixed(1) + '%' : '0%'
      // Attack count from ownerSkill
      let attackCount = 0
      const skillMap = sim.ownerSkill.get(ownerId)
      if (skillMap) {
        attackCount = [...skillMap.values()].reduce((a, b) => a + b, 0)
      }
      const attacksCell = el('td')
      attacksCell.textContent = attackCount.toString()
      row.append(nameCell, dmgCell, shareCell, attacksCell)
      tbody.append(row)
    }
    dmgTable.append(tbody)
    dmgSection.append(dmgTable)
    resultsContainer.append(dmgSection)

    // Pre-battle stats
    const statsSection = section('Характеристики перед боем')
    const statsGrid = el('div', 'simStatsGrid')
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

    // Battlefield HUD
    const battlefieldSection = section('Поле боя')
    const battlefield = el('div', 'simBattlefield')
    battlefieldSection.append(battlefield)
    resultsContainer.append(battlefieldSection)
    renderBattlefield(sim, battlefield)

    // Combat Log - Interactive
    const logSection = section('Боевой журнал')
    const logContainer = el('div', 'simLogContainer')
    renderInteractiveCombatLog(sim, logContainer)
    logSection.append(logContainer)
    resultsContainer.append(logSection)

    // Damage Breakdown - use logger.damage array (DmgTrace)
    const dmgBreakSection = section('Разбивка урона')
    const dmgTraces = sim.logger.damage
    if (dmgTraces.length) {
      const list = el('div', 'simDmgBreakList')
      for (const entry of dmgTraces) {
        const item = el('div', 'simDmgBreakItem')
        const header = el('div', 'simDmgBreakHeader')
        header.textContent = `${entry.who} → ${entry.foe} (${entry.dmg.toLocaleString()})`
        item.append(header)
        const details = el('div', 'simDmgBreakDetails')
        const parts = [
          ['Base Stat', Math.round(entry.stat).toLocaleString()],
          ['Multiplier', entry.mult.toFixed(4)],
          ['Flat Addition', entry.flat.toLocaleString()],
          ['Final Damage', Math.round(entry.dmg).toLocaleString()],
          ['Crit', entry.crit ? 'Да' : 'Нет'],
          ['Crit Rate', (entry.critRate * 100).toFixed(1) + '%'],
          ['Crit DMG', (entry.critDmg * 100).toFixed(1) + '%'],
          ['Crit Bonus', (entry.critBonus * 100).toFixed(1) + '%'],
          ['DMG Boost', (entry.boost * 100).toFixed(1) + '%'],
          ['Weaken', (entry.weaken * 100).toFixed(1) + '%'],
          ['DEF Pen', (entry.defPen * 100).toFixed(1) + '%'],
          ['RES', (entry.res * 100).toFixed(1) + '%'],
          ['RES Pen', (entry.resPen * 100).toFixed(1) + '%'],
          ['Vulnerability', (entry.vuln * 100).toFixed(1) + '%'],
          ['Mitigation', (entry.mit * 100).toFixed(1) + '%'],
          ['Broken', entry.broken ? 'Да' : 'Нет'],
          ['vsBroken', (entry.vsBroken * 100).toFixed(1) + '%'],
          ['No Boost', entry.noBoost ? 'Да' : 'Нет'],
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

  function renderBattlefield(sim: ReturnType<typeof runBattle>, container: HTMLElement): void {
    const allies = sim.roster.filter(u => u.side === 'ally' && !u.dead)
    const enemies = sim.roster.filter(u => u.side === 'enemy' && !u.dead)
    const deadAllies = sim.roster.filter(u => u.side === 'ally' && u.dead)
    const deadEnemies = sim.roster.filter(u => u.side === 'enemy' && u.dead)

    // Allies
    const alliesSection = el('div', 'simBattlefieldSide')
    const alliesTitle = el('h3', 'simBattlefieldTitle')
    alliesTitle.textContent = 'СОЮЗНИКИ'
    alliesSection.append(alliesTitle)

    const alliesGrid = el('div', 'simBattlefieldGrid')
    for (const unit of allies) {
      alliesGrid.append(createUnitCard(unit, sim, true))
    }
    for (const unit of deadAllies) {
      alliesGrid.append(createUnitCard(unit, sim, true))
    }
    alliesSection.append(alliesGrid)

    // Resources bar
    const resourcesSection = el('div', 'simBattlefieldResources')
    resourcesSection.append(createResourceBar(sim))
    alliesSection.append(resourcesSection)

    // Enemies
    const enemiesSection = el('div', 'simBattlefieldSide')
    const enemiesTitle = el('h3', 'simBattlefieldTitle')
    enemiesTitle.textContent = 'ПРОТИВНИКИ'
    enemiesSection.append(enemiesTitle)

    const enemiesGrid = el('div', 'simBattlefieldGrid')
    for (const unit of enemies) {
      enemiesGrid.append(createUnitCard(unit, sim, false))
    }
    for (const unit of deadEnemies) {
      enemiesGrid.append(createUnitCard(unit, sim, false))
    }
    enemiesSection.append(enemiesGrid)

    container.append(alliesSection, enemiesSection)
  }

  function createUnitCard(unit: any, sim: ReturnType<typeof runBattle>, isAlly: boolean): HTMLElement {
    const card = el('div', `simUnitCard ${isAlly ? 'ally' : 'enemy'}${unit.dead ? ' dead' : ''}`)
    if (unit.broken) card.classList.add('broken')

    // Icon + Name
    const header = el('div', 'simUnitHeader')
    if (isAlly) {
      const kit = KITS.find(k => k.id === unit.kitId)
      if (kit) {
        header.append(iconNode(charIconUrl(unit.kitId), kit.name, {
          cls: 'simUnitIcon', size: 40, fit: 'cover',
          fallbackText: kit.name.charAt(0).toUpperCase(), tint: '#7fb3ff', title: kit.name,
        }))
      }
      const name = el('span', 'simUnitName')
      name.textContent = unit.name
      header.append(name)
      if (unit.eidolon > 0) {
        const eid = el('span', 'simUnitEidolon')
        eid.textContent = `E${unit.eidolon}`
        header.append(eid)
      }
    } else {
      header.append(iconNode(enemyIconUrl(unit.name), unit.name, {
        cls: 'simUnitIcon', size: 40, fit: 'cover',
        fallbackText: unit.name.charAt(0).toUpperCase(), tint: '#f5d76e', title: unit.name,
      }))
      const name = el('span', 'simUnitName')
      name.textContent = unit.name
      header.append(name)
      const rankBadge = el('span', `enemyRankBadge rank-${unit.rank}`)
      rankBadge.textContent = unit.rank === 'mob' ? 'Обычный' : unit.rank === 'elite' ? 'Элитный' : 'Босс'
      header.append(rankBadge)
    }
    card.append(header)

    // HP Bar
    const hpBarWrap = el('div', 'simStatBarWrap')
    const hpLabel = el('span', 'simStatBarLabel')
    hpLabel.textContent = 'HP'
    const hpBar = el('div', 'simStatBar hp')
    const hpFill = el('div', 'simStatBarFill')
    const hpPct = unit.maxHp > 0 ? Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100)) : 0
    hpFill.style.width = hpPct + '%'
    hpFill.textContent = `${Math.max(0, Math.round(unit.hp))} / ${unit.maxHp}`
    hpBar.append(hpFill)
    hpBarWrap.append(hpLabel, hpBar)
    card.append(hpBarWrap)

    // Shield Bar
    if (unit.shield > 0) {
      const shieldBarWrap = el('div', 'simStatBarWrap')
      const shieldLabel = el('span', 'simStatBarLabel')
      shieldLabel.textContent = 'Щит'
      const shieldBar = el('div', 'simStatBar shield')
      const shieldFill = el('div', 'simStatBarFill')
      shieldFill.style.width = '100%'
      shieldFill.textContent = Math.round(unit.shield).toString()
      shieldBar.append(shieldFill)
      shieldBarWrap.append(shieldLabel, shieldBar)
      card.append(shieldBarWrap)
    }

    if (isAlly) {
      // Energy Bar
      const energyBarWrap = el('div', 'simStatBarWrap')
      const energyLabel = el('span', 'simStatBarLabel')
      energyLabel.textContent = 'Energy'
      const energyBar = el('div', 'simStatBar energy')
      const energyFill = el('div', 'simStatBarFill')
      const energyPct = unit.maxEnergy > 0 ? Math.max(0, Math.min(100, (unit.energy / unit.maxEnergy) * 100)) : 0
      energyFill.style.width = energyPct + '%'
      energyFill.textContent = `${Math.round(unit.energy)} / ${unit.maxEnergy}`
      energyBar.append(energyFill)
      energyBarWrap.append(energyLabel, energyBar)
      card.append(energyBarWrap)

      // Ultimate ready indicator
      if (unit.energy >= unit.maxEnergy) {
        const ultReady = el('div', 'simUltReady')
        ultReady.textContent = 'ULT READY'
        card.append(ultReady)
      }
    } else {
      // Toughness Bar
      const toughBarWrap = el('div', 'simStatBarWrap')
      const toughLabel = el('span', 'simStatBarLabel')
      toughLabel.textContent = 'Жесткость'
      const toughBar = el('div', 'simStatBar toughness')
      const toughFill = el('div', 'simStatBarFill')
      const toughPct = unit.maxToughness > 0 ? Math.max(0, Math.min(100, (unit.toughness / unit.maxToughness) * 100)) : 0
      toughFill.style.width = toughPct + '%'
      toughFill.textContent = `${Math.round(unit.toughness)} / ${unit.maxToughness}`
      toughBar.append(toughFill)
      toughBarWrap.append(toughLabel, toughBar)
      card.append(toughBarWrap)

      // Weaknesses
      if (unit.weaknesses?.length) {
        const weakWrap = el('div', 'simUnitWeaknesses')
        for (const elem of unit.weaknesses) {
          weakWrap.append(iconNode(elemIconUrl(elem), elem, {
            cls: 'simWeaknessIcon', size: 20, fit: 'contain',
            fallbackText: elem.charAt(0), tint: '#7fb3ff', title: elem,
          }))
        }
        card.append(weakWrap)
      }
    }

    // AV
    const avWrap = el('div', 'simStatBarWrap')
    const avLabel = el('span', 'simStatBarLabel')
    avLabel.textContent = 'AV'
    const avVal = el('span', 'simStatBarValue')
    avVal.textContent = unit.av.toFixed(1)
    avWrap.append(avLabel, avVal)
    card.append(avWrap)

    // Buffs / Debuffs / DoT / Control
    if (unit.buffs?.length) {
      const buffsWrap = el('div', 'simUnitEffects')
      const buffsTitle = el('span', 'simEffectsTitle')
      buffsTitle.textContent = 'Баффы'
      buffsWrap.append(buffsTitle)
      const buffsGrid = el('div', 'simEffectsGrid')
      for (const buff of unit.buffs) {
        buffsGrid.append(createEffectIcon(buff, true))
      }
      buffsWrap.append(buffsGrid)
      card.append(buffsWrap)
    }
    if (unit.debuffs?.length || (unit.buffs?.some((b: any) => b.debuff))) {
      const debuffsWrap = el('div', 'simUnitEffects')
      const debuffsTitle = el('span', 'simEffectsTitle')
      debuffsTitle.textContent = 'Дебаффы'
      debuffsWrap.append(debuffsTitle)
      const debuffsGrid = el('div', 'simEffectsGrid')
      const debuffs = [...(unit.debuffs ?? []), ...(unit.buffs?.filter((b: any) => b.debuff) ?? [])]
      for (const debuff of debuffs) {
        debuffsGrid.append(createEffectIcon(debuff, false))
      }
      debuffsWrap.append(debuffsGrid)
      card.append(debuffsWrap)
    }
    if (unit.dots?.length) {
      const dotsWrap = el('div', 'simUnitEffects')
      const dotsTitle = el('span', 'simEffectsTitle')
      dotsTitle.textContent = 'DoT'
      dotsWrap.append(dotsTitle)
      const dotsGrid = el('div', 'simEffectsGrid')
      for (const dot of unit.dots) {
        dotsGrid.append(createEffectIcon(dot, false))
      }
      dotsWrap.append(dotsGrid)
      card.append(dotsWrap)
    }
    if (unit.controls?.length) {
      const ctrlWrap = el('div', 'simUnitEffects')
      const ctrlTitle = el('span', 'simEffectsTitle')
      ctrlTitle.textContent = 'Контроль'
      ctrlWrap.append(ctrlTitle)
      const ctrlGrid = el('div', 'simEffectsGrid')
      for (const ctrl of unit.controls) {
        ctrlGrid.append(createEffectIcon(ctrl, false))
      }
      ctrlWrap.append(ctrlGrid)
      card.append(ctrlWrap)
    }

    return card
  }

  function createEffectIcon(effect: any, isBuff: boolean): HTMLElement {
    const wrap = el('div', `simEffectIcon ${isBuff ? 'buff' : 'debuff'}`)
    wrap.title = `${effect.name} (стаков: ${effect.stacks ?? 1}, ходов: ${effect.turns ?? '∞'})`
    // Try to get icon
    const iconUrl = abilityIconUrl(effect.name) || enemyIconUrl(effect.name)
    wrap.append(iconNode(iconUrl, effect.name, {
      cls: 'simEffectIconImg', size: 24, fit: 'contain',
      fallbackText: effect.name.charAt(0).toUpperCase(), tint: isBuff ? '#7fd18a' : '#e08a8a', title: effect.name,
    }))
    if ((effect.stacks ?? 1) > 1) {
      const stackBadge = el('span', 'simEffectStack')
      stackBadge.textContent = String(effect.stacks)
      wrap.append(stackBadge)
    }
    if ((effect.turns ?? 0) > 0 && effect.turns !== Infinity) {
      const turnBadge = el('span', 'simEffectTurns')
      turnBadge.textContent = String(effect.turns)
      wrap.append(turnBadge)
    }
    return wrap
  }

  function createResourceBar(sim: ReturnType<typeof runBattle>): HTMLElement {
    const wrap = el('div', 'simResourceBar')

    // SP
    const spWrap = el('div', 'simResourceItem sp')
    const spLabel = el('span', 'simResourceLabel')
    spLabel.textContent = 'SP'
    const spValue = el('span', 'simResourceValue')
    spValue.textContent = `${sim.sp()} / ${sim.maxSp}`
    const spBar = el('div', 'simResourceBarFill')
    const spPct = sim.maxSp > 0 ? (sim.sp() / sim.maxSp) * 100 : 0
    spBar.style.width = spPct + '%'
    spWrap.append(spLabel, spValue, spBar)
    wrap.append(spWrap)

    // AV Elapsed
    const avWrap = el('div', 'simResourceItem av')
    const avLabel = el('span', 'simResourceLabel')
    avLabel.textContent = 'AV'
    const avValue = el('span', 'simResourceValue')
    avValue.textContent = sim.avElapsed.toFixed(1)
    avWrap.append(avLabel, avValue)
    wrap.append(avWrap)

    // Cycle
    const cycleWrap = el('div', 'simResourceItem cycle')
    const cycleLabel = el('span', 'simResourceLabel')
    cycleLabel.textContent = 'Цикл'
    const cycleValue = el('span', 'simResourceValue')
    cycleValue.textContent = `${sim.cycle} / ${sim.cfg.cycles ?? '?'}`
    cycleWrap.append(cycleLabel, cycleValue)
    wrap.append(cycleWrap)

    // Wave
    const waveWrap = el('div', 'simResourceItem wave')
    const waveLabel = el('span', 'simResourceLabel')
    waveLabel.textContent = 'Волна'
    const waveValue = el('span', 'simResourceValue')
    waveValue.textContent = `${sim.wave} / ${sim.waveCount}`
    waveWrap.append(waveLabel, waveValue)
    wrap.append(waveWrap)

    return wrap
  }

  // Interactive Combat Log with filters and event inspector
  function renderInteractiveCombatLog(sim: Simulator, container: HTMLElement): void {
    container.innerHTML = ''

    // Filter bar
    const filterBar = el('div', 'simLogFilterBar')
    const searchInput = el('input', 'simLogSearch') as HTMLInputElement
    searchInput.type = 'search'
    searchInput.placeholder = 'Поиск по журналу...'
    searchInput.setAttribute('aria-label', 'Поиск по журналу')

    const filterSelect = el('select', 'simLogFilter') as HTMLSelectElement
    const filterOptions = [
      ['all', 'Все события'],
      ['actions', 'Действия'],
      ['damage', 'Урон'],
      ['buffs', 'Баффы'],
      ['debuffs', 'Дебаффы'],
      ['dot', 'DoT'],
      ['heal', 'Лечение'],
      ['shield', 'Щиты'],
      ['break', 'Пробития'],
      ['energy', 'Энергия'],
      ['sp', 'Очки навыка'],
      ['timeline', 'Timeline'],
      ['summon', 'Призовы'],
      ['enemy', 'Враги'],
      ['state', 'Состояния'],
      ['death', 'Смерть/Воскрешение'],
    ]
    for (const [val, label] of filterOptions) {
      const opt = el('option')
      opt.value = val
      opt.textContent = label
      filterSelect.append(opt)
    }
    filterSelect.value = 'all'

    const characterFilter = el('select', 'simLogCharFilter') as HTMLSelectElement
    characterFilter.innerHTML = '<option value="all">Все персонажи</option>'
    for (const u of sim.roster.filter(u => u.side === 'ally')) {
      const opt = el('option')
      opt.value = u.id
      opt.textContent = u.name
      characterFilter.append(opt)
    }
    for (const u of sim.roster.filter(u => u.side === 'enemy')) {
      const opt = el('option')
      opt.value = u.id
      opt.textContent = u.name
      characterFilter.append(opt)
    }

    const actionIdFilter = el('input', 'simLogActionFilter') as HTMLInputElement
    actionIdFilter.type = 'number'
    actionIdFilter.placeholder = 'Action ID'
    actionIdFilter.min = '0'
    actionIdFilter.style.width = '100px'

    const avFromFilter = el('input', 'simLogAvFromFilter') as HTMLInputElement
    avFromFilter.type = 'number'
    avFromFilter.placeholder = 'AV от'
    avFromFilter.min = '0'
    avFromFilter.step = '0.1'
    avFromFilter.style.width = '80px'

    const avToFilter = el('input', 'simLogAvToFilter') as HTMLInputElement
    avToFilter.type = 'number'
    avToFilter.placeholder = 'AV до'
    avToFilter.min = '0'
    avToFilter.step = '0.1'
    avToFilter.style.width = '80px'

    const clearFiltersBtn = el('button', 'simLogClearBtn btn-secondary')
    clearFiltersBtn.textContent = 'Сбросить фильтры'

    filterBar.append(searchInput, filterSelect, characterFilter, actionIdFilter, avFromFilter, avToFilter, clearFiltersBtn)
    container.append(filterBar)

    // Event list
    const eventList = el('div', 'simLogEventList')
    container.append(eventList)

    // Event inspector panel
    const inspectorPanel = el('div', 'simLogInspector')
    inspectorPanel.style.display = 'none'
    container.append(inspectorPanel)

    // Build action groups
    const actionGroups = new Map<number, BattleEvent[]>()
    for (const event of sim.logger.events) {
      const actionId = event.actionId
      if (!actionGroups.has(actionId)) actionGroups.set(actionId, [])
      actionGroups.get(actionId)!.push(event)
    }

    // State for filters
    let currentFilters = {
      search: '',
      type: 'all' as string,
      character: 'all' as string,
      actionId: 0 as number,
      avFrom: 0 as number,
      avTo: Infinity as number,
    }
    let selectedEvent: BattleEvent | null = null

    function applyFilters(): void {
      eventList.innerHTML = ''
      inspectorPanel.style.display = 'none'
      selectedEvent = null

      for (const [actionId, events] of actionGroups) {
        // Filter action group
        const groupEvents = events.filter(e => {
          if (currentFilters.search && !JSON.stringify(e).toLowerCase().includes(currentFilters.search.toLowerCase())) return false
          if (currentFilters.type !== 'all') {
            const group = EVENT_GROUPS[currentFilters.type] ?? [currentFilters.type as any]
            if (!group.includes(e.type)) return false
          }
          if (currentFilters.character !== 'all' && e.sourceId !== currentFilters.character && e.targetId !== currentFilters.character) return false
          if (currentFilters.actionId && e.actionId !== currentFilters.actionId) return false
          if (e.time < currentFilters.avFrom || e.time > currentFilters.avTo) return false
          return true
        })

        if (groupEvents.length === 0) continue

        // Create action group header
        const groupEl = el('div', 'simLogActionGroup')
        const header = el('div', 'simLogActionHeader')
        const firstEvent = groupEvents[0]
        const sourceUnit = sim.roster.find(u => u.id === firstEvent.sourceId)
        const targetUnit = sim.roster.find(u => u.id === firstEvent.targetId)
        const sourceName = sourceUnit?.name ?? firstEvent.source ?? '—'
        const targetName = targetUnit?.name ?? firstEvent.target ?? '—'

        header.innerHTML = `
          <span class="simLogActionId">ACT ${actionId}</span>
          <span class="simLogActionAv">AV ${firstEvent.time.toFixed(1)}</span>
          <span class="simLogActionTurn">Turn ${firstEvent.turn}</span>
          <span class="simLogActionSource">${sourceName}</span>
          <span class="simLogActionArrow">→</span>
          <span class="simLogActionTarget">${targetName}</span>
          <span class="simLogActionType">${firstEvent.type}</span>
        `
        groupEl.append(header)

        // Events in this action
        const eventsContainer = el('div', 'simLogActionEvents')
        for (const event of groupEvents) {
          const eventEl = createEventElement(event, sim, () => selectEvent(event))
          eventsContainer.append(eventEl)
        }
        groupEl.append(eventsContainer)
        eventList.append(groupEl)
      }
    }

    function createEventElement(event: BattleEvent, sim: Simulator, onClick: () => void): HTMLElement {
      const sourceUnit = sim.roster.find(u => u.id === event.sourceId)
      const targetUnit = sim.roster.find(u => u.id === event.targetId)
      const sourceIcon = sourceUnit ? (sourceUnit.side === 'ally' ? charIconUrl(sourceUnit.kitId!) : enemyIconUrl(sourceUnit.name)) : undefined
      const targetIcon = targetUnit ? (targetUnit.side === 'ally' ? charIconUrl(targetUnit.kitId!) : enemyIconUrl(targetUnit.name)) : undefined

      const el_event = el('div', `simLogEvent ${event.type.toLowerCase().replace(/_/g, '-')}`)
      el_event.style.cursor = 'pointer'

      const payloadStr = event.payload ? JSON.stringify(event.payload) : ''
      const hasPayload = payloadStr.length > 2

      el_event.innerHTML = `
        <span class="simLogEventTime">[AV ${event.time.toFixed(1)}]</span>
        <span class="simLogEventId">EVT ${event.eventId}</span>
        ${sourceIcon ? `<span class="simLogEventSourceIcon">${iconNode(sourceIcon, sourceUnit!.name, { cls: 'simLogEventIcon', size: 16, fit: 'contain', fallbackText: sourceUnit!.name.charAt(0), tint: '#7fb3ff', title: sourceUnit!.name })}</span>` : ''}
        <span class="simLogEventSource">${sourceUnit?.name ?? event.source ?? '—'}</span>
        <span class="simLogEventArrow">→</span>
        ${targetIcon ? `<span class="simLogEventTargetIcon">${iconNode(targetIcon, targetUnit!.name, { cls: 'simLogEventIcon', size: 16, fit: 'contain', fallbackText: targetUnit!.name.charAt(0), tint: '#f5d76e', title: targetUnit!.name })}</span>` : ''}
        <span class="simLogEventTarget">${targetUnit?.name ?? event.target ?? '—'}</span>
        <span class="simLogEventType">${event.type}</span>
        ${event.attackType ? `<span class="simLogEventAbility">${event.attackType}</span>` : ''}
        ${event.element ? `<span class="simLogEventElement">${event.element}</span>` : ''}
        ${hasPayload ? `<span class="simLogEventPayload">${payloadStr.slice(0, 100)}${payloadStr.length > 100 ? '...' : ''}</span>` : ''}
      `

      el_event.onclick = onClick
      return el_event
    }

    function selectEvent(event: BattleEvent): void {
      selectedEvent = event
      renderInspector(event, sim)
      inspectorPanel.style.display = ''
      // Highlight selected event
      for (const el of eventList.querySelectorAll('.simLogEvent')) {
        el.classList.toggle('selected', el === event)
      }
    }

    function renderInspector(event: BattleEvent, sim: Simulator): void {
      inspectorPanel.innerHTML = ''
      const sourceUnit = sim.roster.find(u => u.id === event.sourceId)
      const targetUnit = sim.roster.find(u => u.id === event.targetId)

      const header = el('div', 'simLogInspectorHeader')
      header.innerHTML = `
        <h4>Event Inspector</h4>
        <span class="simLogInspectorId">EVT ${event.eventId} | ACT ${event.actionId} | Turn ${event.turn} | AV ${event.time.toFixed(1)}</span>
      `
      inspectorPanel.append(header)

      const grid = el('div', 'simLogInspectorGrid')

      const fields = [
        ['Type', event.type],
        ['Source', sourceUnit?.name ?? event.source ?? '—'],
        ['Target', targetUnit?.name ?? event.target ?? '—'],
        ['Attack Type', event.attackType ?? '—'],
        ['Element', event.element ?? '—'],
        ['Trace ID', event.traceId ?? '—'],
      ]

      for (const [label, value] of fields) {
        const row = el('div', 'simLogInspectorRow')
        const labelEl = el('span', 'simLogInspectorLabel')
        labelEl.textContent = label
        const valueEl = el('span', 'simLogInspectorValue')
        valueEl.textContent = String(value)
        row.append(labelEl, valueEl)
        grid.append(row)
      }

      // Provenance
      if (event.provenance) {
        const provRow = el('div', 'simLogInspectorRow')
        const provLabel = el('span', 'simLogInspectorLabel')
        provLabel.textContent = 'Provenance'
        const provValue = el('span', 'simLogInspectorValue')
        provValue.textContent = `${event.provenance.sourceKind} ${event.provenance.abilityId ? `(${event.provenance.abilityId})` : ''} ${event.provenance.abilitySlot ? `[${event.provenance.abilitySlot}]` : ''}`
        provRow.append(provLabel, provValue)
        grid.append(provRow)
      }

      // Payload
      if (event.payload && Object.keys(event.payload).length > 0) {
        const payloadRow = el('div', 'simLogInspectorRow')
        payloadRow.style.gridColumn = '1 / -1'
        const payloadLabel = el('span', 'simLogInspectorLabel')
        payloadLabel.textContent = 'Payload'
        const payloadValue = el('pre', 'simLogInspectorPayload')
        payloadValue.textContent = JSON.stringify(event.payload, null, 2)
        payloadRow.append(payloadLabel, payloadValue)
        grid.append(payloadRow)
      }

      // Find snapshot for this event
      const snapshotEvent = sim.logger.events.find(e => e.type === 'STATE_SNAPSHOT' && e.actionId === event.actionId && e.time <= event.time)
      if (snapshotEvent && snapshotEvent.payload.state) {
        const snapRow = el('div', 'simLogInspectorRow')
        snapRow.style.gridColumn = '1 / -1'
        const snapLabel = el('span', 'simLogInspectorLabel')
        snapLabel.textContent = 'State Snapshot (at this moment)'
        const snapValue = el('div', 'simLogInspectorSnapshot')
        const snap = snapshotEvent.payload.state as any
        if (sourceUnit && snap.units[sourceUnit.id]) {
          const u = snap.units[sourceUnit.id]
          snapValue.innerHTML = `
            <strong>Source (${sourceUnit.name}):</strong> HP ${u.hp}/${u.maxHp} | Energy ${u.energy}/${u.maxEnergy} | AV ${u.av} | Toughness ${u.toughness}/${u.maxToughness} | Broken: ${u.broken}
            <br>Buffs: ${u.buffs.map((b: any) => `${b.name}x${b.stacks}@${b.turns}`).join(', ') || '—'}
            <br>Debuffs: ${u.debuffs.map((b: any) => `${b.name}x${b.stacks}@${b.turns}`).join(', ') || '—'}
          `
        }
        if (targetUnit && snap.units[targetUnit.id]) {
          const u = snap.units[targetUnit.id]
          snapValue.innerHTML += `
            <br><strong>Target (${targetUnit.name}):</strong> HP ${u.hp}/${u.maxHp} | Energy ${u.energy}/${u.maxEnergy} | AV ${u.av} | Toughness ${u.toughness}/${u.maxToughness} | Broken: ${u.broken}
            <br>Buffs: ${u.buffs.map((b: any) => `${b.name}x${b.stacks}@${b.turns}`).join(', ') || '—'}
            <br>Debuffs: ${u.debuffs.map((b: any) => `${b.name}x${b.stacks}@${b.turns}`).join(', ') || '—'}
          `
        }
        snapRow.append(snapLabel, snapValue)
        grid.append(snapRow)
      }

      inspectorPanel.append(grid)
    }

    // Event listeners
    searchInput.oninput = () => { currentFilters.search = searchInput.value; applyFilters() }
    filterSelect.onchange = () => { currentFilters.type = filterSelect.value; applyFilters() }
    characterFilter.onchange = () => { currentFilters.character = characterFilter.value; applyFilters() }
    actionIdFilter.onchange = () => { currentFilters.actionId = parseInt(actionIdFilter.value) || 0; applyFilters() }
    avFromFilter.onchange = () => { currentFilters.avFrom = parseFloat(avFromFilter.value) || 0; applyFilters() }
    avToFilter.onchange = () => { currentFilters.avTo = parseFloat(avToFilter.value) || Infinity; applyFilters() }
    clearFiltersBtn.onclick = () => {
      searchInput.value = ''
      filterSelect.value = 'all'
      characterFilter.value = 'all'
      actionIdFilter.value = ''
      avFromFilter.value = ''
      avToFilter.value = ''
      currentFilters = { search: '', type: 'all', character: 'all', actionId: 0, avFrom: 0, avTo: Infinity }
      applyFilters()
    }

    // Initial render
    applyFilters()
  }

  // Initial render
  refresh()
  // Suppress unused warning - renderBuilder is called from onclick handlers
  void renderBuilder

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