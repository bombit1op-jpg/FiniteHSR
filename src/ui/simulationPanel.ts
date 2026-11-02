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
import { charIconUrl, iconNode, metaBadge, enemyIconUrl, charPortraitUrl, gearBadge, effectIconUrl, abilityIconUrl } from './icons'
import { el } from './dom'

import { withBusy, showStatus } from './shell'
import { openEnemyPicker } from './enemyPicker'
import { aggregateCombatActions, collectSnapshots, type CombatActionRecord, type CombatActionCategory } from './combatActionView'
import type { DebugLevel, StateSnapshot } from '../core/battlelog'
import type { Party } from '../core/party'
import type { Simulator } from '../core/simulator'
import { type EndgameMode, endgameVersions, endgameSetup, endgameSections } from '../core/endgame'
import { getEnemyStatRow, type EnemyVariant, type EnemyDefinition } from '../core/enemy'

/**
 * Safe helper to get first character of a string for fallback icons.
 * Handles undefined, null, empty strings, and non-string values.
 */
function safeInitial(value: unknown, fallback = '?'): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return trimmed.charAt(0).toUpperCase()
}

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

  // Mode toggle: preset vs custom vs endgame
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

  const endgameRadio = el('input') as HTMLInputElement
  endgameRadio.type = 'radio'
  endgameRadio.name = 'encounterMode'
  endgameRadio.value = 'endgame'
  const endgameLabel = el('label')
  endgameLabel.textContent = 'Эндгейм (MoC/PF/AS/AA)'
  endgameLabel.prepend(endgameRadio)

  modeRow.append(presetLabel, customLabel, endgameLabel)
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

  // Endgame stage select (endgame mode)
  const endgameContainer = el('div', 'endgameStageContainer')
  endgameContainer.style.display = 'none'
  const endgameModeLabel = el('label', 'encounterSelectLabel')
  endgameModeLabel.textContent = 'Режим'
  const endgameModeSel = el('select') as HTMLSelectElement
  for (const mode of ['MoC', 'PF', 'AS', 'AA']) {
    const opt = el('option')
    opt.value = mode
    opt.textContent = mode
    endgameModeSel.append(opt)
  }
  endgameModeLabel.append(endgameModeSel)
  endgameContainer.append(endgameModeLabel)

  const endgameStageLabel = el('label', 'encounterSelectLabel')
  endgameStageLabel.textContent = 'Стадия'
  const endgameStageSel = el('select') as HTMLSelectElement
  endgameStageLabel.append(endgameStageSel)
  endgameContainer.append(endgameStageLabel)
  paramsContainer.append(endgameContainer)

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
            onSelect: (variant: EnemyVariant, definition: EnemyDefinition) => {
              const level = group.level ?? 80
              const statRow = getEnemyStatRow(variant, level)
              // Extract simple effectRes from effectResistanceProfile (average or first value)
              const simpleEffectRes = variant.effectResistanceProfile?.values?.[0] ?? 0
              group.name = variant.title
              group.hp = statRow?.hp ?? 25000
              group.spd = statRow?.spd ?? 132
              group.level = level
              group.toughness = variant.toughnessModel?.primary ?? 30
              group.weaknesses = variant.weaknesses ?? ['Fire', 'Lightning']
              group.res = variant.resistanceProfile
              group.effectRes = simpleEffectRes
              group.atk = statRow?.atk
              group.def = statRow?.def
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
    const isEndgame = endgameRadio.checked
    encounterLabel.style.display = (isCustom || isEndgame) ? 'none' : ''
    endgameContainer.style.display = isEndgame ? '' : 'none'
    builderSection.style.display = isCustom ? '' : 'none'
  }
  presetRadio.onchange = customRadio.onchange = endgameRadio.onchange = toggleBuilder

  // Version selector (declared early for closure)
  const endgameVersionLabel = el('label', 'encounterSelectLabel')
  endgameVersionLabel.textContent = 'Версия'
  const endgameVersionSel = el('select') as HTMLSelectElement
  endgameVersionLabel.append(endgameVersionSel)
  endgameContainer.insertBefore(endgameVersionLabel, endgameStageLabel)

  // Endgame mode/version change handler
  function updateEndgameStages() {
    const mode = endgameModeSel.value as EndgameMode
    const version = endgameVersionSel.value
    if (!version) return
    const sections = endgameSections(mode, version)
    endgameStageSel.innerHTML = ''
    for (const section of sections) {
      const opt = el('option')
      opt.value = section.id
      opt.textContent = section.title
      endgameStageSel.append(opt)
    }
  }

  function updateEndgameVersions() {
    const mode = endgameModeSel.value as EndgameMode
    const versions = endgameVersions(mode)
    endgameVersionSel.innerHTML = ''
    for (const v of versions) {
      const opt = el('option')
      opt.value = v
      opt.textContent = v
      endgameVersionSel.append(opt)
    }
    endgameVersionSel.value = versions[0] || ''
    updateEndgameStages()
  }
  endgameModeSel.onchange = updateEndgameVersions
  endgameVersionSel.onchange = updateEndgameStages
  // Initial populate
  updateEndgameVersions()

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
fallbackText: safeInitial(kit.name), tint: '#7fb3ff', title: kit.name,
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
    let encounterId: string | EncounterSpec
    let isEndgame = endgameRadio.checked
    if (isEndgame) {
      const mode = endgameModeSel.value as EndgameMode
      const version = endgameVersionSel.value
      const stageId = endgameStageSel.value
      if (!version || !stageId) {
        showStatus('Выберите версию и стадию эндгейма', 'error')
        return
      }
      const battleSetup = endgameSetup(mode, version, stageId, team, { seed: parseInt(seedInp.value) || 42 })
      if (!battleSetup || !battleSetup.encounter) {
        showStatus('Не удалось построить эндгейм энкаунтер', 'error')
        return
      }
      const enc = battleSetup.encounter
      encounterSpec = resolveEncounter(typeof enc === 'string' ? { id: enc, mode: 'Endgame', waves: [[]], cycles: battleSetup.cycles } : enc)
      encounterId = `${mode}_${version}_${stageId}`
      // Override cycles from endgame setup
      cyclesInp.value = String(battleSetup.cycles)
    } else if (customRadio.checked) {
      const errs = validateCustomEncounter(customEncounter)
      if (errs.length > 0) {
        showStatus('Ошибка в энкаунтере: ' + errs.join('; '), 'error')
        return
      }
      encounterSpec = resolveEncounter(customEncounter)
      encounterId = customEncounter
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
    if (!customRadio.checked && !isEndgame) {
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
          newSim = runBattle({
            ...setup,
            log: {
              debug: debugLevel,
              captureUiHistory: true,
              // Configure snapshots for historical replay
              snapshotOn: [
                'ACTION_START',
                'ACTION_END',
                'DAMAGE_DEALT',
                'BUFF_APPLIED',
                'DEBUFF_APPLIED',
                'HEAL_APPLIED',
                'SHIELD_APPLIED',
                'WEAKNESS_BREAK',
                'DEATH',
                'REVIVAL',
              ],
            },
          })
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

    // Aggregate combat actions
    const snapshots = collectSnapshots(sim.logger)
    const combatActions = aggregateCombatActions(sim.logger.events, sim, snapshots)

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
      ['Действий', combatActions.length.toString()],
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
    thead.innerHTML = '<tr><th>Персонаж</th><th>Урон</th><th>Доля</th><th>Действий</th></tr>'
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
      // Action count from CombatActionRecord
      let actionCount = 0
      for (const action of combatActions) {
        if (action.sourceId === ownerId) actionCount++
      }
      const attacksCell = el('td')
      attacksCell.textContent = actionCount.toString()
      row.append(nameCell, dmgCell, shareCell, attacksCell)
      tbody.append(row)
    }
    dmgTable.append(tbody)
    dmgSection.append(dmgTable)
    resultsContainer.append(dmgSection)
    // Combat Log - Interactive with 4 categories
    const logSection = section('Боевой журнал')
    const logContainer = el('div', 'simLogContainer')
    renderCombatActionLog(sim, combatActions, snapshots, logContainer)
    logSection.append(logContainer)
    resultsContainer.append(logSection)

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

  // Interactive Combat Log with filters and event inspector
  function renderCombatActionLog(sim: Simulator, combatActions: CombatActionRecord[], snapshots: StateSnapshot[], container: HTMLElement): void {
    container.innerHTML = ''

    // Filter bar
    const filterBar = el('div', 'simLogFilterBar')
    const searchInput = el('input', 'simLogSearch') as HTMLInputElement
    searchInput.type = 'search'
    searchInput.placeholder = 'Поиск по журналу...'
    searchInput.setAttribute('aria-label', 'Поиск по журналу')

    const filterSelect = el('select', 'simLogFilter') as HTMLSelectElement
    const filterOptions = [
      ['all', 'Все действия'],
      ['attack', 'Атаки'],
      ['bonusAttack', 'Бонус-атаки'],
      ['extraTurn', 'Доп. ходы'],
      ['ultimate', 'Ультимейты'],
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

    const clearFiltersBtn = el('button', 'simLogClearBtn btn-secondary')
    clearFiltersBtn.textContent = 'Сбросить фильтры'

    filterBar.append(searchInput, filterSelect, characterFilter, clearFiltersBtn)
    container.append(filterBar)

    // Main content area - two columns
    const workspace = el('div', 'simLogWorkspace')
    container.append(workspace)

    // Left: Timeline
    const timelinePane = el('div', 'simLogTimelinePane')
    const timeline = el('div', 'simLogTimeline')
    timelinePane.append(timeline)
    workspace.append(timelinePane)

    // Right: Inspector
    const inspectorPane = el('div', 'simLogInspectorPane')
    const inspectorPanel = el('div', 'simLogInspector')
    inspectorPanel.style.display = 'none'
    inspectorPane.append(inspectorPanel)
    workspace.append(inspectorPane)

    // State for filters
    let currentFilters = {
      search: '',
      type: 'all' as string,
      character: 'all' as string,
    }

    function applyFilters(): void {
      timeline.innerHTML = ''

      const filteredActions = combatActions.filter(action => {
        if (currentFilters.search) {
          const searchLower = currentFilters.search.toLowerCase()
          const abilityName = action.abilityName?.toLowerCase() || ''
          const sourceName = action.sourceName?.toLowerCase() || ''
          const targetNames = action.targetNames?.join(' ').toLowerCase() || ''
          if (!abilityName.includes(searchLower) && !sourceName.includes(searchLower) && !targetNames.includes(searchLower)) {
            return false
          }
        }
        if (currentFilters.type !== 'all' && action.category !== currentFilters.type) {
          return false
        }
        if (currentFilters.character !== 'all' &&
            action.sourceId !== currentFilters.character &&
            !action.targetIds.includes(currentFilters.character)) {
          return false
        }
        return true
      })

      // Display in chronological order (combatActions already sorted by AV)
      const categoryLabels: Record<CombatActionCategory, string> = {
        attack: 'Атака',
        bonusAttack: 'Бонус-атака',
        extraTurn: 'Доп. ход',
        ultimate: 'Ультимейт',
        system: 'Система',
      }
      const categoryColors: Record<CombatActionCategory, string> = {
        attack: '#3b82f6',
        bonusAttack: '#f59e0b',
        extraTurn: '#22c55e',
        ultimate: '#a855f7',
        system: '#6b7280',
      }

      let lastCategory: CombatActionCategory | null = null
      for (const action of filteredActions) {
        // Add category header when category changes
        if (action.category !== lastCategory) {
          const categoryHeader = el('div', 'simLogCategoryHeader')
          categoryHeader.style.borderLeftColor = categoryColors[action.category]
          const badge = el('span', 'simLogCategoryBadge')
          badge.style.background = categoryColors[action.category]
          badge.textContent = categoryLabels[action.category] || action.category
          const count = el('span', 'simLogCategoryCount')
          count.textContent = filteredActions.filter(a => a.category === action.category).length.toString()
          categoryHeader.append(badge, count)
          timeline.append(categoryHeader)
          lastCategory = action.category
        }

        const actionEl = createActionCard(action, sim, () => selectAction(action))
        timeline.append(actionEl)
      }
    }

    function createActionCard(action: CombatActionRecord, sim: Simulator, onClick: () => void): HTMLElement {
      const card = el('div', `simCombatActionCard ${action.category}`)
      card.style.borderLeftColor = getCategoryColor(action.category)
      card.style.cursor = 'pointer'

      const sourceUnit = action.sourceId ? sim.roster.find(u => u.id === action.sourceId) : undefined
      const sourceIcon = sourceUnit ? (sourceUnit.side === 'ally'
        ? charIconUrl(sourceUnit.kitId!)
        : enemyIconUrl(sourceUnit.name)) : undefined

      // Determine ability icon
      let abilityIconUrl_: string | undefined
      if (action.abilityId) {
        abilityIconUrl_ = abilityIconUrl(action.abilityName || action.abilityId)
      }

      const header = el('div', 'simActionHeader')
      const categoryBadge = el('span', 'simActionCategory')
      categoryBadge.style.background = getCategoryColor(action.category)
      categoryBadge.textContent = categoryLabels[action.category] || action.category
      const meta = el('span', 'simActionMeta')
      meta.textContent = `AV ${action.av.toFixed(1)} | Turn ${action.turn}`
      header.append(categoryBadge, meta)

      const sourceDiv = el('div', 'simActionSource')
      if (sourceIcon) {
        const iconSpan = el('span', 'simActionSourceIcon')
        iconSpan.append(iconNode(sourceIcon, action.sourceName, { cls: 'simActionIcon', size: 32, fit: 'contain', fallbackText: safeInitial(action.sourceName), tint: '#7fb3ff', title: action.sourceName }))
        sourceDiv.append(iconSpan)
      }
      const sourceInfo = el('div', 'simActionSourceInfo')
      const sourceName = el('span', 'simActionSourceName')
      sourceName.textContent = action.sourceName
      sourceInfo.append(sourceName)
      if (abilityIconUrl_) {
        const abilityIconSpan = el('span', 'simActionAbilityIcon')
        abilityIconSpan.append(iconNode(abilityIconUrl_, action.abilityName || action.abilityId || '?', { cls: 'simActionAbilityIconImg', size: 20, fit: 'contain', fallbackText: safeInitial(action.abilityName || action.abilityId || '?'), tint: '#8fd694', title: action.abilityName || action.abilityId || '?' }))
        sourceInfo.append(abilityIconSpan)
      }
      const abilityName = el('span', 'simActionAbilityName')
      abilityName.textContent = action.abilityName || 'Атака'
      sourceInfo.append(abilityName)
      sourceDiv.append(sourceInfo)

      const targetsDiv = el('div', 'simActionTargets')
      for (const id of action.targetIds) {
        const unit = sim.roster.find(u => u.id === id)
        if (!unit) continue
        const iconUrl = unit.side === 'ally' ? charIconUrl(unit.kitId!) : enemyIconUrl(unit.name)
        targetsDiv.append(iconNode(iconUrl, unit.name, {
          cls: 'simActionTargetIcon', size: 24, fit: 'contain',
          fallbackText: safeInitial(unit.name), tint: unit.side === 'ally' ? '#7fb3ff' : '#f5d76e', title: unit.name,
        }))
      }

      const totalDamage = action.hits.reduce((sum, h) => sum + h.damage, 0)
      const critHits = action.hits.filter(h => h.crit).length
      const hasBreak = action.hits.some(h => h.breakdown?.broken)

      const summary = el('div', 'simActionSummary')
      const dmgSpan = el('span', 'simActionDamage')
      dmgSpan.textContent = totalDamage > 0 ? totalDamage.toLocaleString() : '—'
      const hitsSpan = el('span', 'simActionHits')
      hitsSpan.textContent = `${action.hits.length} попад.${critHits > 0 ? ` (${critHits} крит)` : ''}${hasBreak ? ' | Пробитие' : ''}`
      const effectsSpan = el('span', 'simActionEffects')
      effectsSpan.textContent = `${action.effects.buffs.length + action.effects.debuffs.length + action.effects.dots.length + action.effects.shields.length + action.effects.heals.length} эфф.`
      summary.append(dmgSpan, hitsSpan, effectsSpan)

      card.append(header, sourceDiv, targetsDiv, summary)

      card.onclick = onClick
      return card
    }

    function getCategoryColor(category: CombatActionCategory): string {
      const colors: Record<CombatActionCategory, string> = {
        attack: '#3b82f6',
        bonusAttack: '#f59e0b',
        extraTurn: '#22c55e',
        ultimate: '#a855f7',
        system: '#6b7280',
      }
      return colors[category] || '#6b7280'
    }

    const categoryLabels: Record<CombatActionCategory, string> = {
      attack: 'Атака',
      bonusAttack: 'Бонус-атака',
      extraTurn: 'Доп. ход',
      ultimate: 'Ультимейт',
      system: 'Система',
    }

    function selectAction(action: CombatActionRecord): void {
      renderActionInspector(action, sim, inspectorPanel)
      inspectorPanel.style.display = ''

      // Highlight selected action
      for (const el of timeline.querySelectorAll('.simCombatActionCard')) {
        el.classList.toggle('selected', (el as any).__action === action)
      }
    }

    function renderActionInspector(action: CombatActionRecord, sim: Simulator, inspectorPanel: HTMLElement): void {
      inspectorPanel.innerHTML = ''

      const header = el('div', 'simLogInspectorHeader')
      const h4 = el('h4')
      h4.textContent = 'Инспектор действия'
      const idSpan = el('span', 'simLogInspectorId')
      idSpan.textContent = `${action.category} | AV ${action.av.toFixed(1)} | Turn ${action.turn} | ACT ${action.actionId}`
      header.append(h4, idSpan)
      inspectorPanel.append(header)

      const tabs = el('div', 'simInspectorTabs')
      const tabAction = el('button', 'simInspectorTab active')
      tabAction.textContent = 'Действие'
      const tabState = el('button', 'simInspectorTab')
      tabState.textContent = 'Состояние'
      const tabEffects = el('button', 'simInspectorTab')
      tabEffects.textContent = 'Эффекты'
      tabs.append(tabAction, tabState, tabEffects)
      inspectorPanel.append(tabs)

      const content = el('div', 'simInspectorContent')
      inspectorPanel.append(content)

      function showTab(tab: string): void {
        tabAction.classList.toggle('active', tab === 'action')
        tabState.classList.toggle('active', tab === 'state')
        tabEffects.classList.toggle('active', tab === 'effects')
        content.innerHTML = ''
        if (tab === 'action') renderActionTab(action, sim, content)
        else if (tab === 'state') renderStateTab(action, sim, content)
        else if (tab === 'effects') renderEffectsTab(action, sim, content)
      }

      tabAction.onclick = () => showTab('action')
      tabState.onclick = () => showTab('state')
      tabEffects.onclick = () => showTab('effects')

      showTab('action')
    }

    function renderActionTab(action: CombatActionRecord, sim: Simulator, content: HTMLElement): void {
      const grid = el('div', 'simLogInspectorGrid')

      const fields = [
        ['Категория', action.category],
        ['AV', action.av.toFixed(1)],
        ['Ход', action.turn.toString()],
        ['Исполнитель', action.sourceName],
        ['Способность', action.abilityName || '—'],
        ['Слот', action.abilitySlot || '—'],
        ['Всего урона', action.hits.reduce((s, h) => s + h.damage, 0).toLocaleString()],
        ['Попаданий', action.hits.length.toString()],
        ['Критические', action.hits.filter(h => h.crit).length.toString()],
        ['Пробитий', action.hits.filter(h => h.breakdown?.broken).length.toString()],
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
      if (action.provenance) {
        const provRow = el('div', 'simLogInspectorRow')
        const provLabel = el('span', 'simLogInspectorLabel')
        provLabel.textContent = 'Источник'
        const provValue = el('span', 'simLogInspectorValue')
        provValue.textContent = `${action.provenance.sourceKind} ${action.provenance.abilityId ? `(${action.provenance.abilityId})` : ''} ${action.provenance.abilitySlot ? `[${action.provenance.abilitySlot}]` : ''} ${action.provenance.triggeredByUnitName ? `→ ${action.provenance.triggeredByUnitName}` : ''}`
        provRow.append(provLabel, provValue)
        grid.append(provRow)
      }

      // Targets
      if (action.targetNames.length > 0) {
        const targetRow = el('div', 'simLogInspectorRow')
        const targetLabel = el('span', 'simLogInspectorLabel')
        targetLabel.textContent = 'Цели'
        const targetValue = el('span', 'simLogInspectorValue')
        targetValue.textContent = action.targetNames.join(', ')
        targetRow.append(targetLabel, targetValue)
        grid.append(targetRow)
      }

      // Hits detail
      if (action.hits.length > 0) {
        const hitsRow = el('div', 'simLogInspectorRow')
        hitsRow.style.gridColumn = '1 / -1'
        const hitsLabel = el('span', 'simLogInspectorLabel')
        hitsLabel.textContent = 'Попадания'
        const hitsContainer = el('div', 'simInspectorHits')

        for (let i = 0; i < action.hits.length; i++) {
          const hit = action.hits[i]
          const targetUnit = hit.targetId ? sim.roster.find(u => u.id === hit.targetId) : undefined
          const hitEl = el('div', 'simInspectorHit')
          hitEl.innerHTML = `
            <div class="simInspectorHitHeader">
              <span class="simInspectorHitTarget">${targetUnit?.name || hit.targetName || hit.targetId}</span>
              <span class="simInspectorHitDamage">${hit.damage.toLocaleString()}${hit.crit ? ' <span class="crit">CRIT</span>' : ''}</span>
            </div>
          `
          if (hit.breakdown) {
            const breakdownEl = el('div', 'simInspectorHitBreakdown')
            breakdownEl.innerHTML = `
              <div class="simInspectorBreakdownRow"><span>Базовая стата</span><span>${Math.round(hit.breakdown.stat).toLocaleString()}</span></div>
              <div class="simInspectorBreakdownRow"><span>Множитель</span><span>${hit.breakdown.mult.toFixed(4)}</span></div>
              <div class="simInspectorBreakdownRow"><span>Плоское</span><span>${hit.breakdown.flat.toLocaleString()}</span></div>
              <div class="simInspectorBreakdownRow"><span>Крит. шанс</span><span>${(hit.breakdown.critRate * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Крит. урон</span><span>${(hit.breakdown.critDmg * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Буст</span><span>${(hit.breakdown.boost * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Ослабление</span><span>${(hit.breakdown.weaken * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Пробив. DEF</span><span>${(hit.breakdown.defPen * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>RES</span><span>${(hit.breakdown.res * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Пробив. RES</span><span>${(hit.breakdown.resPen * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Уязвимость</span><span>${(hit.breakdown.vuln * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Митигация</span><span>${(hit.breakdown.mit * 100).toFixed(1)}%</span></div>
              <div class="simInspectorBreakdownRow"><span>Сломан</span><span>${hit.breakdown.broken ? 'Да' : 'Нет'}</span></div>
              <div class="simInspectorBreakdownRow"><span>Итог</span><span>${hit.breakdown.dmg.toLocaleString()}</span></div>
            `
            hitEl.append(breakdownEl)
          }
          hitsContainer.append(hitEl)
        }
        hitsRow.append(hitsLabel, hitsContainer)
        grid.append(hitsRow)
      }

      content.append(grid)
    }

    function renderStateTab(action: CombatActionRecord, sim: Simulator, content: HTMLElement): void {
      // Show before/after snapshots
      if (action.beforeSnapshot || action.afterSnapshot) {
        const grid = el('div', 'simLogInspectorGrid')

        const addSnapshotSection = (label: string, snapshot: StateSnapshot | undefined, unitIds: string[]) => {
          if (!snapshot) return
          const section = el('div', 'simInspectorSnapshotSection')
          const title = el('h4', 'simInspectorSnapshotTitle')
          title.textContent = label
          section.append(title)

          for (const id of unitIds) {
            const unit = snapshot.units[id]
            if (!unit) continue
            const unitEl = el('div', 'simInspectorUnitState')
            unitEl.innerHTML = `
              <div class="simInspectorUnitName">
                ${unit.side === 'ally'
                  ? `<span class="simUnitIcon">${iconNode(charIconUrl((unit as any).kind === 'char' && (unit as any).kitId ? (unit as any).kitId : 'unknown'), unit.name, { cls: 'simUnitIcon', size: 20, fit: 'cover', fallbackText: safeInitial(unit.name), tint: '#7fb3ff', title: unit.name })}</span>`
                  : `<span class="simUnitIcon">${iconNode(enemyIconUrl(unit.name), unit.name, { cls: 'simUnitIcon', size: 20, fit: 'cover', fallbackText: safeInitial(unit.name), tint: '#f5d76e', title: unit.name })}</span>`}
                <span>${unit.name}</span>
              </div>
              <div class="simInspectorUnitStats">
                <div class="simStatMini"><span>HP</span><span>${unit.hp.toLocaleString()} / ${unit.maxHp.toLocaleString()}</span></div>
                <div class="simStatMini"><span>Energy</span><span>${unit.energy.toLocaleString()} / ${unit.maxEnergy.toLocaleString()}</span></div>
                <div class="simStatMini"><span>AV</span><span>${unit.av.toFixed(1)}</span></div>
                <div class="simStatMini"><span>Toughness</span><span>${unit.toughness.toLocaleString()} / ${unit.maxToughness.toLocaleString()} ${unit.broken ? ' <span class="broken">BROKEN</span>' : ''}</span></div>
                <div class="simStatMini"><span>ATK</span><span>${unit.atk.toLocaleString()}</span></div>
                <div class="simStatMini"><span>DEF</span><span>${unit.def.toLocaleString()}</span></div>
                <div class="simStatMini"><span>SPD</span><span>${unit.spd.toFixed(1)}</span></div>
                <div class="simStatMini"><span>CRIT Rate</span><span>${(unit.critRate * 100).toFixed(1)}%</span></div>
                <div class="simStatMini"><span>CRIT DMG</span><span>${(unit.critDmg * 100).toFixed(1)}%</span></div>
                <div class="simStatMini"><span>Break Effect</span><span>${(unit.be * 100).toFixed(1)}%</span></div>
                <div class="simStatMini"><span>EHR</span><span>${(unit.ehr * 100).toFixed(1)}%</span></div>
                <div class="simStatMini"><span>Eff RES</span><span>${(unit.effRes * 100).toFixed(1)}%</span></div>
              </div>
            `
            if (unit.buffs.length > 0) {
              const buffsEl = el('div', 'simInspectorUnitBuffs')
              buffsEl.innerHTML = `<strong>Баффы:</strong> ${unit.buffs.map(b => `${b.name}x${b.stacks}@${b.turns}`).join(', ')}`
              unitEl.append(buffsEl)
            }
            if (unit.debuffs.length > 0) {
              const debuffsEl = el('div', 'simInspectorUnitDebuffs')
              debuffsEl.innerHTML = `<strong>Дебаффы:</strong> ${unit.debuffs.map(b => `${b.name}x${b.stacks}@${b.turns}`).join(', ')}`
              unitEl.append(debuffsEl)
            }
            if (unit.dots.length > 0) {
              const dotsEl = el('div', 'simInspectorUnitDots')
              dotsEl.innerHTML = `<strong>DoT:</strong> ${unit.dots.map((d: any) => `${d.name}x${d.stacks}@${d.turns}`).join(', ')}`
              unitEl.append(dotsEl)
            }
            section.append(unitEl)
          }
        }

        const allUnitIds = [...new Set([
          ...action.targetIds,
          action.sourceId
        ].filter(Boolean))] as string[]

        if (action.beforeSnapshot) {
          addSnapshotSection('До действия', action.beforeSnapshot, allUnitIds)
        }
        if (action.afterSnapshot) {
          addSnapshotSection('После действия', action.afterSnapshot, allUnitIds)
        }

        content.append(grid)
      } else {
        content.innerHTML = '<p class="dim">Нет исторических снимков для этого действия</p>'
      }
    }

    function renderEffectsTab(action: CombatActionRecord, sim: Simulator, content: HTMLElement): void {
      const grid = el('div', 'simLogInspectorGrid')

      const addEffectSection = (label: string, effects: any[], isDebuff: boolean) => {
        if (effects.length === 0) return
        const section = el('div', 'simInspectorEffectSection')
        const title = el('h4', 'simInspectorEffectTitle')
        title.textContent = label
        section.append(title)

        const list = el('div', 'simInspectorEffectList')
        for (const effect of effects) {
          const targetUnit = effect.targetId ? sim.roster.find(u => u.id === effect.targetId) : undefined
          const sourceUnit = effect.sourceId ? sim.roster.find(u => u.id === effect.sourceId) : undefined
          const iconUrl = effectIconUrl(effect.name)

          const el_effect = el('div', `simInspectorEffect ${isDebuff ? 'debuff' : 'buff'}`)
          el_effect.innerHTML = `
            <div class="simInspectorEffectIcon">${iconNode(iconUrl, effect.name, { cls: 'simInspectorEffectIconImg', size: 24, fit: 'contain', fallbackText: safeInitial(effect.name), tint: isDebuff ? '#e08a8a' : '#7fd18a', title: effect.name })}</div>
            <div class="simInspectorEffectInfo">
              <div class="simInspectorEffectName">${effect.name}</div>
              <div class="simInspectorEffectMeta">
                <span>Получатель: ${targetUnit?.name || effect.targetId}</span>
                <span>Источник: ${sourceUnit?.name || effect.sourceId || '—'}</span>
                <span>Стаки: ${effect.stacks}</span>
                <span>Ходы: ${effect.turns === Infinity ? '∞' : effect.turns}</span>
              </div>
            `
            if (effect.mods && effect.mods.length > 0) {
              const modsEl = el('div', 'simInspectorEffectMods')
              modsEl.innerHTML = effect.mods.map((m: any) => `<span class="simMod">${m.stat}: ${m.value >= 0 ? '+' : ''}${(m.value * 100).toFixed(1)}%</span>`).join(' ')
              el_effect.append(modsEl)
            }
            if (effect.shield) {
              const shieldEl = el('div', 'simInspectorEffectShield')
              shieldEl.textContent = `Щит: ${effect.shield.toLocaleString()}`
              el_effect.append(shieldEl)
            }
            list.append(el_effect)
          }
          section.append(list)
        }

        addEffectSection('Баффы', action.effects.buffs, false)
        addEffectSection('Дебаффы', action.effects.debuffs, true)
        addEffectSection('DoT', action.effects.dots, true)
        addEffectSection('Щиты', action.effects.shields, false)
        addEffectSection('Лечение', action.effects.heals, false)
        addEffectSection('Пробития', action.effects.breaks, true)

        if (action.effects.energyChanges.length > 0) {
          const section = el('div', 'simInspectorEffectSection')
          const title = el('h4', 'simInspectorEffectTitle')
          title.textContent = 'Изменение энергии'
          section.append(title)
          const list = el('div', 'simInspectorEffectList')
          for (const ec of action.effects.energyChanges) {
            const targetUnit = ec.targetId ? sim.roster.find(u => u.id === ec.targetId) : undefined
            const el_ec = el('div', 'simInspectorEffect')
            el_ec.innerHTML = `<span>${targetUnit?.name || ec.targetId}</span><span class="${ec.delta >= 0 ? 'positive' : 'negative'}">${ec.delta >= 0 ? '+' : ''}${ec.delta}</span><span class="reason">${ec.reason}</span>`
            list.append(el_ec)
          }
          section.append(list)
          grid.append(section)
        }

        if (action.effects.spChanges.length > 0) {
          const section = el('div', 'simInspectorEffectSection')
          const title = el('h4', 'simInspectorEffectTitle')
          title.textContent = 'Изменение SP'
          section.append(title)
          const list = el('div', 'simInspectorEffectList')
          for (const sc of action.effects.spChanges) {
            const targetUnit = sc.targetId ? sim.roster.find(u => u.id === sc.targetId) : undefined
            const el_sc = el('div', 'simInspectorEffect')
            el_sc.innerHTML = `<span>${targetUnit?.name || sc.targetId}</span><span class="${sc.delta >= 0 ? 'positive' : 'negative'}">${sc.delta >= 0 ? '+' : ''}${sc.delta}</span><span class="reason">${sc.reason}</span>`
            list.append(el_sc)
          }
          section.append(list)
          grid.append(section)
        }

        content.append(grid)
      }

    // Event listeners
    searchInput.oninput = () => { currentFilters.search = searchInput.value; applyFilters() }
    filterSelect.onchange = () => { currentFilters.type = filterSelect.value; applyFilters() }
    characterFilter.onchange = () => { currentFilters.character = characterFilter.value; applyFilters() }
    clearFiltersBtn.onclick = () => {
      searchInput.value = ''
      filterSelect.value = 'all'
      characterFilter.value = 'all'
      currentFilters = { search: '', type: 'all', character: 'all' }
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