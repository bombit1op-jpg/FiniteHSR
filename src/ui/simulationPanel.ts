/**
 * §Simulation — Battle simulation panel.
 *
 * Reads the active party from PartyStore, builds BattleSetup, runs the engine,
 * and renders results using existing engine APIs (runBattle, BattleLogger).
 */
import { PartyStore } from './partyStore'
import { KITS, KIT_PATH } from '../core/kits'
import { runBattle, ENEMY_PRESETS } from '../core/battle'
import { resolveEncounter, type EncounterSpec, validateEncounter } from '../core/encounter'
import { toTeamSpec } from './team'
import { techniquesForRows } from './store'
import { charIconUrl, iconNode, metaBadge, enemyIconUrl, charPortraitUrl, gearBadge, effectIconUrl, abilityIconUrl, statIconUrlForKey, summonIconUrl, elemIconUrl } from './icons'
import { el } from './dom'

import { withBusy, showStatus } from './shell'
import { openEnemyPicker } from './enemyPicker'
import { aggregateCombatActions, collectSnapshots, type CombatActionRecord, type CombatActionCategory, type CombatHitRecord } from './combatActionView'
import type { DebugLevel, StateSnapshot } from '../core/battlelog'
import type { Party } from '../core/party'
import type { Simulator } from '../core/simulator'
import { type EndgameMode, endgameVersions, endgameSetup, endgameSections, endgameStage } from '../core/endgame'
import { getEnemyStatRow, type EnemyVariant, type EnemyDefinition } from '../core/enemy'

const SIM_ENCOUNTER: EncounterSpec = {
  id: 'enemy-icons',
  mode: 'Иконки врагов',
  cycles: 8,
  waves: [[
    { ...ENEMY_PRESETS.mob, name: 'Ice Edge (1)', hp: 200_000, count: 1 },
    { ...ENEMY_PRESETS.mob, name: 'Ice Edge (2)', hp: 200_000, count: 1 },
    { ...ENEMY_PRESETS.elite, hp: 2_000_000, count: 1 },
  ]],
}

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

type SnapshotUnit = StateSnapshot['units'][string]

export function vitalLabelsForSnapshot(unit: Pick<SnapshotUnit, 'kind' | 'sharesOwnerBuffs'>): string[] {
  const trueSummon = !!unit.sharesOwnerBuffs
  const memoSprite = unit.kind === 'summon' && !trueSummon
  return [
    ...(trueSummon ? [] : ['HP']),
    ...(trueSummon || memoSprite ? [] : ['EN']),
    'ОД',
  ]
}

export function renderSupportLog(action: CombatActionRecord): HTMLElement | undefined {
  const seen = new Set<string>()
  const rows: HTMLElement[] = []
  for (const s of action.effects.shields) {
    const key = `shield|${s.sourceId ?? s.sourceName ?? ''}|${s.targetId}|${Math.round(s.amount)}|${s.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const row = el('div', 'simActionSupportRow')
    row.textContent = `${s.sourceName ?? '?'} → ${s.targetName}: ${s.amount.toLocaleString()} щит`
    rows.push(row)
  }
  for (const h of action.effects.heals) {
    const key = `heal|${h.sourceId ?? h.sourceName ?? ''}|${h.targetId}|${Math.round(h.amount)}|${h.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const row = el('div', 'simActionSupportRow')
    row.textContent = `${h.sourceName ?? '?'} → ${h.targetName}: ${h.amount.toLocaleString()} HP`
    rows.push(row)
  }
  if (!rows.length) return undefined
  const details = el('details', 'simActionSupport')
  const summary = el('summary')
  summary.textContent = `Лечение/щиты: ${rows.length}`
  details.append(summary, ...rows)
  details.onclick = e => e.stopPropagation()
  return details
}

function ownerKitId(unit: { kitId?: string; ownerId?: string }, sim: Simulator): string | undefined {
  return unit.kitId ?? (unit.ownerId ? sim.roster.find(u => u.id === unit.ownerId)?.kitId : undefined)
}

function allyIconUrl(unit: { kitId?: string; ownerId?: string } | undefined, sim: Simulator): string | undefined {
  if (!unit) return undefined
  return charIconUrl(ownerKitId(unit, sim) ?? 'unknown')
}

function unitIconUrl(unit: { name?: string; side?: string; kind?: string; kitId?: string; ownerId?: string } | undefined, sim: Simulator): string | undefined {
  if (!unit) return undefined
  if (unit.side === 'ally' && unit.kind === 'summon') {
    return summonIconUrl(unit.name ?? '') ?? effectIconUrl('Memosprite') ?? effectIconUrl('Summon')
  }
  return allyIconUrl(unit, sim)
}

function formatStateValue(value: unknown): string {
  if (value === null || value === undefined || value === '' || value === false || value === 0) return ''
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const ACTION_ENTITY_COLORS = { timer: '#14b8a6', summon: '#e879f9' } as const
const DAMAGE_ELEMENT_COLORS: Record<string, string> = {
  Physical: '#d1d5db',
  Fire: '#ff7a59',
  Ice: '#67e8f9',
  Lightning: '#c084fc',
  Wind: '#5eead4',
  Quantum: '#a5b4fc',
  Imaginary: '#facc15',
}
const HEAL_COLOR = '#b6ff3d'
const SHIELD_COLOR = '#5f83ff'
const COUNTDOWN_STATE_KEY = /countdown|timer|cd(?:id|seq)/i

export function supportSummaryParts(action: CombatActionRecord): Array<{ label: string; amount: number; color: string }> {
  const heal = action.effects.heals.reduce((sum, e) => sum + Math.max(0, Number(e.amount) || 0), 0)
  const shield = action.effects.shields.reduce((sum, e) => sum + Math.max(0, Number(e.amount) || 0), 0)
  return [
    ...(heal > 0 ? [{ label: 'Лечение', amount: heal, color: HEAL_COLOR }] : []),
    ...(shield > 0 ? [{ label: 'Щит', amount: shield, color: SHIELD_COLOR }] : []),
  ]
}

export function damageElementParts(action: CombatActionRecord, fallbackElement?: string): Array<{ element: string; amount: number; color: string }> {
  const byElement = new Map<string, number>()
  for (const hit of action.attacks.flatMap(a => a.hits)) {
    const amount = Math.max(0, Number(hit.damage) || 0)
    if (amount <= 0) continue
    const element = hit.element || fallbackElement || ''
    byElement.set(element, (byElement.get(element) ?? 0) + amount)
  }
  return [...byElement.entries()]
    .map(([element, amount]) => ({ element, amount, color: DAMAGE_ELEMENT_COLORS[element] ?? '#f2c94c' }))
    .sort((a, b) => b.amount - a.amount || a.element.localeCompare(b.element))
}

export function damageDisplay(action: CombatActionRecord, fallbackElement?: string): { color: string; elation: boolean } {
  const hit = action.attacks.flatMap(a => a.hits).find(h => h.element)
  const parts = damageElementParts(action, fallbackElement)
  return {
    color: parts[0]?.color ?? DAMAGE_ELEMENT_COLORS[hit?.element ?? fallbackElement ?? ''] ?? '#f2c94c',
    elation: action.attacks.some(a => a.hits.some(h => h.attackType === 'elation')),
  }
}

function actionEntityKind(action: CombatActionRecord): keyof typeof ACTION_ENTITY_COLORS | undefined {
  if (action.category === 'timer') return 'timer'
  if (action.category === 'summon') return 'summon'
  return undefined
}

function formatSpDelta(delta: number | undefined): string {
  const value = Math.round(Number(delta ?? 0))
  return `${value >= 0 ? '+' : ''}${value}`
}

function isNeutralEffect(effect: any): boolean {
  const provenance = String(effect?.provenance?.sourceKind ?? '')
  const label = `${effect?.id ?? ''} ${effect?.name ?? ''}`.toLowerCase()
  return provenance === 'trace' || provenance === 'lightCone' || provenance === 'relic' || /\b(gear|traces)\b/.test(label)
}

let renderEffectsTabImpl: ((action: CombatActionRecord, sim: Simulator, content: HTMLElement, scopeId?: string) => void) | undefined

export function renderEffectSummary(action: CombatActionRecord, sim: Simulator, content: HTMLElement, scopeId?: string): void {
  if (renderEffectsTabImpl) renderEffectsTabImpl(action, sim, content, scopeId)
}

export function snapshotEffectModTotals(unit: SnapshotUnit): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const effect of [...unit.buffs, ...unit.debuffs]) {
    for (const mod of effect.mods ?? []) {
      const conditional = Array.isArray((mod as { whenAbility?: unknown }).whenAbility)
      if (conditional) continue
      totals[mod.stat] = (totals[mod.stat] ?? 0) + mod.value * (effect.stacks ?? 1)
    }
  }
  return totals
}

type EffectKind = 'buff' | 'debuff' | 'dot' | 'shield' | 'neutral' | 'removal'

interface EffectIdentity {
  id?: string
  name?: string
  targetId?: string
  targetName?: string
  sourceId?: string
  sourceName?: string
  appliedById?: string
}

function effectIconFor(effect: { name: string; kind?: EffectKind; mods?: Array<{ stat: string; value: number }> }): string | undefined {
  const direct = effectIconUrl(effect.name)
  if (direct) return direct
  const mod = effect.mods?.[0]
  if (mod) {
    const statIcon = statIconUrlForKey(mod.stat)
    if (statIcon) return statIcon
  }
  if (effect.kind === 'shield') return effectIconUrl('Shield')
  if (effect.kind === 'debuff' || effect.kind === 'dot' || effect.kind === 'removal') return effectIconUrl('DoT')
  return effectIconUrl('Buff')
}

function entityIconUrl(unit: { name?: string; side?: string; kitId?: string; ownerId?: string } | undefined, sim: Simulator): string | undefined {
  if (!unit) return undefined
  return unit.side === 'enemy' ? enemyIconUrl(unit.name ?? '') : unitIconUrl(unit, sim)
}

function effectSourceFor(effect: EffectIdentity, sim: Simulator): { name: string; url?: string } {
  const sourceId = effect.sourceId ?? effect.appliedById
  const unit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
  const gearName = sourceId === 'gear' && effect.name ? `Снаряжение · ${effect.name}` : ''
  const name = unit?.name ?? effect.sourceName ?? gearName
  return { name: name || '—', url: entityIconUrl(unit, sim) }
}

function effectTargetFor(effect: EffectIdentity, sim: Simulator): { name: string; url?: string } {
  const unit = effect.targetId ? sim.roster.find(u => u.id === effect.targetId) : undefined
  const name = unit?.name ?? effect.targetName ?? ''
  return { name: name || '—', url: entityIconUrl(unit, sim) }
}

function formatEffectMod(mod: { stat: string; value: number; whenAbility?: string[] }): string {
  const flat = /flat/i.test(mod.stat)
  const value = flat ? mod.value : mod.value * 100
  const suffix = flat ? '' : '%'
  const sign = value > 0 ? '+' : ''
  const condition = mod.whenAbility?.length ? ` [${mod.whenAbility.join('/')}]` : ''
  const number = Number.isInteger(value) ? String(value) : value.toFixed(1)
  return `${mod.stat}: ${sign}${number}${suffix}${condition}`
}

function formatEffectModTotal(mod: { stat: string; value: number; whenAbility?: string[] }, stacks: number): string {
  return formatEffectMod({ ...mod, value: mod.value * Math.max(1, stacks || 1) })
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

  const encounterLabel = el('div', 'encounterSelectLabel')
  encounterLabel.textContent = SIM_ENCOUNTER.mode ?? ''
  const encounterPreview = el('div', 'encounterIconPreview')
  for (const group of SIM_ENCOUNTER.waves.flat()) {
    for (let i = 0; i < Math.min(group.count, 6); i++) {
      encounterPreview.append(iconNode(enemyIconUrl(group.name), group.name, {
        cls: 'encounterEnemyIcon', size: 32, fit: 'contain',
        fallbackText: safeInitial(group.name), tint: '#f5d76e', title: group.name,
      }))
    }
  }
  encounterLabel.append(encounterPreview)
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

  // Battle selector for PF/AS (multiple battles per stage)
  const endgameBattleLabel = el('label', 'encounterSelectLabel')
  endgameBattleLabel.textContent = 'Бой'
  const endgameBattleSel = el('select') as HTMLSelectElement
  endgameBattleLabel.append(endgameBattleSel)
  endgameContainer.append(endgameBattleLabel)
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

  function _renderBuilder(): void {
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
        _renderBuilder()
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
              _renderBuilder()
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
        removeGroupBtn.onclick = () => { wave.splice(gi, 1); _renderBuilder() }
        groupDiv.append(removeGroupBtn)

        waveDiv.append(groupDiv)
      }

      const addGroupBtn = el('button', 'addGroupBtn')
      addGroupBtn.textContent = '+ Добавить группу'
      addGroupBtn.onclick = () => {
        wave.push({ name: '', count: 1, hp: 25000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] })
        _renderBuilder()
      }
      waveDiv.append(addGroupBtn)
      builderContainer.append(waveDiv)
    }

    const addWaveBtn = el('button', 'addWaveBtn')
    addWaveBtn.textContent = '+ Добавить волну'
    addWaveBtn.onclick = () => {
      customEncounter.waves.push([{ name: '', count: 1, hp: 25000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] }])
      _renderBuilder()
    }
    builderContainer.append(addWaveBtn)
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
    updateEndgameBattles()
  }

  function updateEndgameBattles() {
    const mode = endgameModeSel.value as EndgameMode
    const version = endgameVersionSel.value
    const stageId = endgameStageSel.value
    if (!version || !stageId) return
    const stage = endgameStage(mode, version, stageId)
    if (!stage) return
    endgameBattleSel.innerHTML = ''
    for (let i = 0; i < stage.battles.length; i++) {
      const battle = stage.battles[i]
      const opt = el('option')
      opt.value = String(i)
      opt.textContent = `${battle.id} (${battle.waves.length} волн${battle.waves.length > 1 ? 'ы' : ''})`
      endgameBattleSel.append(opt)
    }
    // Show/hide battle selector based on number of battles
    endgameBattleSel.style.display = stage.battles.length > 1 ? '' : 'none'
    const battleLabel = endgameBattleSel.closest('label')
    if (battleLabel) battleLabel.style.display = stage.battles.length > 1 ? '' : 'none'
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

  // Cycles (preset mode)
  const cyclesLabel = el('label')
  cyclesLabel.textContent = 'Циклы'
  const cyclesInp = el('input') as HTMLInputElement
  cyclesInp.type = 'number'
  cyclesInp.min = '1'
  cyclesInp.max = '20'
  cyclesInp.value = String(SIM_ENCOUNTER.cycles ?? 8)
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
          const eidolonEl = el('div', 'simSlotEidolon')
          eidolonEl.textContent = `E${slot.eidolon}`
          slotEl.append(eidolonEl)

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
      // Determine which battle to run (for PF/AS with multiple battles)
      const battleIndex = endgameBattleSel ? endgameBattleSel.selectedIndex : 0
      const battleSetup = endgameSetup(mode, version, stageId, team, { battle: battleIndex, seed: parseInt(seedInp.value) || 0 })
      if (!battleSetup || !battleSetup.encounter) {
        showStatus('Не удалось построить эндгейм энкаунтер', 'error')
        return
      }
      // Use the actual EncounterSpec object for endgame
      encounterSpec = resolveEncounter(battleSetup.encounter as EncounterSpec)
      encounterId = `${mode}_${version}_${stageId}_battle${battleIndex}`
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
      encounterSpec = resolveEncounter(SIM_ENCOUNTER)
      encounterId = SIM_ENCOUNTER
    }
    if (!encounterSpec) {
      showStatus('Не удалось построить энкаунтер', 'error')
      return
    }

    // Cycles handling
    const cyclesInputVal = parseInt(cyclesInp.value)
    const cycles = Number.isFinite(cyclesInputVal) && cyclesInputVal > 0 ? cyclesInputVal : (SIM_ENCOUNTER.cycles ?? 8)
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

      const result = await withBusy('Симуляция боя', async () => {
        await new Promise(r => requestAnimationFrame(r))
        return runBattle({
          ...setup,
          log: {
            debug: debugLevel,
            captureUiHistory: true,
            // Configure snapshots for historical replay - only essential events to avoid snapshot spam
            snapshotOn: [
              'ACTION_START',
              'ACTION_END',
              'DAMAGE_DEALT',
              'WEAKNESS_BREAK',
              'DEATH',
              'REVIVAL',
            ],
          },
        })
      })

      loading.remove()
      if (result) {
        renderResults(result, currentParty)
      }
      runBtn.disabled = false
      runBtn.textContent = 'Запустить симуляцию'
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
      ['enemyAttack', 'Атаки врагов'],
      ['bonusAttack', 'Бонус-атаки'],
      ['extraTurn', 'Доп. ходы'],
      ['ultimate', 'Ультимейты'],
      ['technique', 'Техники'],
      ['summon', 'Призывы'],
      ['timer', 'Таймеры'],
      ['effect', 'Эффекты'],
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

    function selectedInspectorUnitId(action: CombatActionRecord): string | undefined {
      return currentFilters.character !== 'all' ? currentFilters.character : action.sourceId
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

      for (const action of filteredActions) {
        const actionEl = createActionCard(action, sim, () => selectAction(action))
        timeline.append(actionEl)
      }
    }

    function createHitEl(hit: CombatHitRecord, sim: Simulator): HTMLElement {
      const hitEl = el('div', 'simInspectorHit')
      const header = el('div', 'simInspectorHitHeader')
      const target = el('span', 'simInspectorHitTarget')
      target.textContent = (sim.roster.find(u => u.id === hit.targetId)?.name ?? hit.targetName) || hit.targetId
      const damage = el('span', 'simInspectorHitDamage')
      damage.textContent = hit.damage.toLocaleString()
      if (hit.shieldDamage > 0) {
        const shield = el('span', 'simInspectorHitShieldDamage')
        shield.textContent = ` +${hit.shieldDamage.toLocaleString()} щит`
        damage.append(shield)
      }
      if (hit.crit) {
        const crit = el('span', 'crit')
        crit.textContent = ' CRIT'
        damage.append(crit)
      }
      header.append(target, damage)
      hitEl.append(header)
      return hitEl
    }

    function vitalBar(label: string, value: number, max: number, color: string, shieldText?: string): HTMLElement {
      const row = el('div', 'simVitalBar')
      const labelEl = el('span', 'simVitalLabel')
      labelEl.textContent = label
      const track = el('div', 'simVitalTrack')
      const fill = el('div', 'simVitalFill')
      const pct = max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0
      fill.style.width = `${pct}%`
      fill.style.background = color
      track.append(fill)
      const valueEl = el('span', 'simVitalValue')
      valueEl.textContent = `${value.toLocaleString()}/${value === 0 && max === 0 ? '0' : max.toLocaleString()}`
      row.append(labelEl, track, valueEl)
      if (shieldText) {
        const shieldEl = el('span', 'simVitalShield')
        const shieldValue = el('span')
        shieldValue.textContent = shieldText
        shieldEl.append(iconNode(effectIconUrl('Shield'), 'Shield', {
          cls: 'simVitalShieldIcon', size: 14, fit: 'contain',
          fallbackText: 'S', tint: '#7ec8ff', title: 'Щит',
        }), shieldValue)
        row.append(shieldEl)
      }
      return row
    }

    function createActionVitals(action: CombatActionRecord, sourceUnit: ReturnType<Simulator['roster']['find']>): HTMLElement | undefined {
      if (!sourceUnit || !action.sourceId) return undefined
      const before = action.beforeSnapshot
      const after = action.afterSnapshot
      const snap = before?.units[action.sourceId] ?? after?.units[action.sourceId]
      if (!snap) return undefined
      const teamSnapshot = after ?? before
      const shield = Number(snap.shield ?? 0) ||
        (snap.buffs ?? []).reduce((sum, buff) => sum + Number(buff.shield ?? 0), 0)
      const labels = new Set(vitalLabelsForSnapshot(snap))
      const vitals = el('div', 'simActionVitals')
      if (labels.has('HP')) vitals.append(vitalBar('HP', snap.hp, snap.maxHp, '#4ade80', shield > 0 ? shield.toLocaleString() : undefined))
      if (labels.has('EN')) vitals.append(vitalBar('EN', snap.energy, snap.maxEnergy, '#60a5fa'))
      vitals.append(vitalBar('ОД', teamSnapshot?.sp ?? 0, teamSnapshot?.maxSp ?? 5, '#f2c94c'))
      return vitals
    }

    function createActionCard(action: CombatActionRecord, sim: Simulator, onClick: () => void): HTMLElement {
      const entityKind = actionEntityKind(action)
      const card = el('div', `simCombatActionCard ${action.category}${entityKind ? ` ${entityKind}` : ''}`)
      card.dataset.actionId = action.combatActionId
      const accent = entityKind ? ACTION_ENTITY_COLORS[entityKind] : getCategoryColor(action.category)
      card.style.borderLeftColor = accent
      card.style.cursor = 'pointer'

      const sourceUnit = action.sourceId ? sim.roster.find(u => u.id === action.sourceId) : undefined
      const sourceIcon = sourceUnit
        ? (sourceUnit.side === 'ally' ? unitIconUrl(sourceUnit, sim) : enemyIconUrl(sourceUnit.name))
        : undefined
      const abilityIcon = abilityIconUrl(action.abilityName || action.abilityId || '')

      const header = el('div', 'simActionHeader')
      const categoryBadge = el('span', 'simActionCategory')
      categoryBadge.style.background = accent
      categoryBadge.textContent = categoryLabels[action.category] || action.category
      const abilityName = el('span', 'simActionAbilityName')
      abilityName.textContent = action.abilityName || 'Атака'
      abilityName.title = abilityName.textContent
      if (entityKind) {
        const entityBadge = el('span', 'simActionEntity')
        entityBadge.style.color = accent
        entityBadge.textContent = entityKind === 'timer' ? 'Таймер' : 'Призыв'
        header.append(categoryBadge, abilityName, entityBadge)
      } else {
        header.append(categoryBadge, abilityName)
      }
      const meta = el('span', 'simActionMeta')
      meta.textContent = `№${action.order} | AV ${action.av.toFixed(1)} | ACT ${action.actionId}`
      header.append(meta)

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
      const vitals = createActionVitals(action, sourceUnit)
      if (vitals) sourceInfo.append(vitals)
      if (abilityIcon) {
        const abilityIconSpan = el('span', 'simActionAbilityIcon')
        abilityIconSpan.append(iconNode(abilityIcon, action.abilityName || action.abilityId || '?', { cls: 'simActionAbilityIconImg', size: 20, fit: 'contain', fallbackText: safeInitial(action.abilityName || action.abilityId || '?'), tint: '#8fd694', title: action.abilityName || action.abilityId || '?' }))
        sourceInfo.append(abilityIconSpan)
      }
      const spDeltaEl = el('span', 'simActionSpDelta')
      spDeltaEl.textContent = `${formatSpDelta(action.spDelta)} ОД`
      sourceInfo.append(spDeltaEl)
      sourceDiv.append(sourceInfo)

      const targetsDiv = el('div', 'simActionTargets')
      const targetsLabel = el('span', 'simActionTargetsLabel')
      targetsLabel.textContent = 'Targets:'
      targetsDiv.append(targetsLabel)
      for (const id of action.targetIds) {
        const unit = sim.roster.find(u => u.id === id)
        if (!unit) continue
        const iconUrl = unit.side === 'ally' ? unitIconUrl(unit, sim) : enemyIconUrl(unit.name)
        targetsDiv.append(iconNode(iconUrl, unit.name, {
          cls: 'simActionTargetIcon', size: 24, fit: 'contain',
          fallbackText: safeInitial(unit.name), tint: unit.side === 'ally' ? '#7fb3ff' : '#f5d76e', title: unit.name,
        }))
      }

      // Aggregate hits from all attacks for display
      const allHits = action.attacks.flatMap(a => a.hits)
      const totalDamage = allHits.reduce((sum, h) => sum + h.damage, 0)
      const totalShieldDamage = action.shieldDamage
      const critHits = allHits.filter(h => h.crit).length
      const hasBreak = allHits.some(h => h.breakdown?.broken)

      const summary = el('div', 'simActionSummary')
      const display = damageDisplay(action, sourceUnit?.elem)
      const damageParts = damageElementParts(action, sourceUnit?.elem)
      const damageGroup = el('span', 'simActionDamageGroup')
      const dmgSpan = el('span', 'simActionDamage')
      if (display.elation) dmgSpan.classList.add('elation')
      dmgSpan.style.color = display.color
      dmgSpan.title = damageParts.map(p => `${p.element || 'Урон'}: ${p.amount.toLocaleString()}`).join(' / ')
      if (damageParts.length === 0) {
        dmgSpan.textContent = `Урон: ${totalDamage > 0 ? totalDamage.toLocaleString() : '—'}`
      } else {
        dmgSpan.append(document.createTextNode('Урон: '))
        damageParts.forEach((part, i) => {
          if (i > 0) {
            const slash = el('span', 'simActionDamageSlash')
            slash.textContent = '/'
            dmgSpan.append(slash)
          }
          const value = el('span', 'simActionDamageValue')
          value.textContent = part.amount.toLocaleString()
          const icon = el('span', 'simActionDamageElement')
          icon.dataset.element = part.element
          icon.append(iconNode(elemIconUrl(part.element), part.element || '?', {
            cls: 'simActionDamageElementIcon', size: 14, fit: 'contain',
            fallbackText: safeInitial(part.element), tint: part.color, title: part.element || 'Урон',
          }))
          dmgSpan.append(value, icon)
        })
      }
      damageGroup.append(dmgSpan)
      const supportParts = supportSummaryParts(action)
      if (supportParts.length > 0) {
        const supportLine = el('span', 'simActionSupportSummary')
        supportParts.forEach((part, i) => {
          if (i > 0) {
            const slash = el('span', 'simActionSupportSlash')
            slash.textContent = ' / '
            supportLine.append(slash)
          }
          const partSpan = el('span', part.label === 'Лечение' ? 'simActionHealSummary' : 'simActionShieldSummary')
          partSpan.style.color = part.color
          partSpan.textContent = `${part.label}: ${part.amount.toLocaleString()}`
          supportLine.append(partSpan)
        })
        damageGroup.append(supportLine)
      }
      const hitsSpan = el('span', 'simActionHitsSummary')
      hitsSpan.textContent = `${allHits.length} попад.${critHits > 0 ? ` (${critHits} крит)` : ''}${hasBreak ? ' | Пробитие' : ''}`
      const effectsSpan = el('span', 'simActionEffects')
      effectsSpan.textContent = `${action.effects.buffs.length + action.effects.debuffs.length + action.effects.dots.length + action.effects.shields.length + action.effects.shieldDamage.length + action.effects.heals.length} эфф.`
      summary.append(damageGroup, hitsSpan, effectsSpan)
      if (totalShieldDamage > 0) {
        const shieldSpan = el('span', 'simActionShieldDamage')
        shieldSpan.textContent = `${totalShieldDamage.toLocaleString()} по щиту`
        summary.append(shieldSpan)
      }
      card.append(header, sourceDiv, targetsDiv, summary)

      if (allHits.length > 0) {
        const details = el('details', 'simActionHits')
        const hitSummary = el('summary')
        hitSummary.textContent = `Попадания: ${allHits.length}${critHits > 0 ? ` · ${critHits} крит` : ''} · ${totalDamage.toLocaleString()} урона${totalShieldDamage > 0 ? ` · ${totalShieldDamage.toLocaleString()} по щиту` : ''}`
        details.append(hitSummary)
        for (const attack of action.attacks) {
          if (attack.hits.length === 0) continue
          const attackBlock = el('div', 'simActionAttack')
          const attackTitle = el('div', 'simActionAttackTitle')
          attackTitle.textContent = `${attack.abilityName} · ${attack.hits.length} попад. · ${attack.totalDamage.toLocaleString()}${attack.shieldDamage > 0 ? ` · ${attack.shieldDamage.toLocaleString()} по щиту` : ''}`
          attackBlock.append(attackTitle)
          for (const hit of attack.hits) attackBlock.append(createHitEl(hit, sim))
          details.append(attackBlock)
        }
        details.onclick = e => e.stopPropagation()
        card.append(details)
      }
      const supportLog = renderSupportLog(action)
      if (supportLog) card.append(supportLog)

      card.onclick = onClick
      return card
    }

    function getCategoryColor(category: CombatActionCategory): string {
      const colors: Partial<Record<CombatActionCategory, string>> = {
        attack: '#3b82f6',
        enemyAttack: '#ef4444',
        bonusAttack: '#f59e0b',
        extraTurn: '#22c55e',
        ultimate: '#a855f7',
        technique: '#14b8a6',
        summon: '#e879f9',
        timer: '#0ea5e9',
        effect: '#8b5cf6',
      }
      return colors[category] || '#6b7280'
    }

    const categoryLabels: Partial<Record<CombatActionCategory, string>> = {
      attack: 'Атака',
      bonusAttack: 'Бонус-атака',
      extraTurn: 'Доп. ход',
      ultimate: 'Ультимейт',
      enemyAttack: 'Атака врага',
      technique: 'Техника',
      summon: 'Призыв',
      timer: 'Таймер',
      effect: 'Эффект',
    }

    function selectAction(action: CombatActionRecord): void {
      renderActionInspector(action, sim, inspectorPanel)
      inspectorPanel.style.display = ''

      // Highlight selected action
      for (const card of timeline.querySelectorAll<HTMLElement>('.simCombatActionCard')) {
        card.classList.toggle('selected', card.dataset.actionId === action.combatActionId)
      }
    }

    function renderActionInspector(action: CombatActionRecord, sim: Simulator, inspectorPanel: HTMLElement): void {
      inspectorPanel.innerHTML = ''

      const header = el('div', 'simLogInspectorHeader')
      const h4 = el('h4')
      h4.textContent = 'Инспектор действия'
      const idSpan = el('span', 'simLogInspectorId')
      idSpan.textContent = `№${action.order} | ${action.category} | AV ${action.av.toFixed(1)} | ACT ${action.actionId} | ${formatSpDelta(action.spDelta)} ОД`
      header.append(h4, idSpan)
      inspectorPanel.append(header)

      const tabs = el('div', 'simInspectorTabs')
      const tabAction = el('button', 'simInspectorTab active')
      tabAction.textContent = 'Действие'
      const tabEffects = el('button', 'simInspectorTab')
      tabEffects.textContent = 'Эффекты'
      tabs.append(tabAction, tabEffects)
      inspectorPanel.append(tabs)

      const content = el('div', 'simInspectorContent')
      inspectorPanel.append(content)

      function showTab(tab: string): void {
        tabAction.classList.toggle('active', tab === 'action')
        tabEffects.classList.toggle('active', tab === 'effects')
        content.innerHTML = ''
        if (tab === 'action') renderActionTab(action, sim, content)
        else if (tab === 'effects') renderEffectsTab(action, sim, content)
      }

      tabAction.onclick = () => showTab('action')
      tabEffects.onclick = () => showTab('effects')

      showTab('action')
    }

    function relevantSnapshotUnitIds(action: CombatActionRecord, snapshot: StateSnapshot | undefined, sim: Simulator): string[] {
      void sim
      const id = selectedInspectorUnitId(action)
      if (!id) return []
      return snapshot?.units[id] ? [id] : []
    }

    function createSnapshotUnitEl(unit: SnapshotUnit, sim: Simulator, options: { stats: boolean; statuses: boolean; effects: boolean; debuffs?: boolean }): HTMLElement {
      const owner = unit.ownerId ? sim.roster.find(u => u.id === unit.ownerId) : undefined
      const iconUrl = unit.side === 'enemy'
        ? enemyIconUrl(unit.name)
        : unitIconUrl(unit, sim)

      const unitEl = el('div', 'simInspectorUnitState')
      const nameEl = el('div', 'simInspectorUnitName')
      nameEl.append(iconNode(iconUrl, unit.name, {
        cls: 'simUnitIcon', size: 20, fit: 'cover',
        fallbackText: safeInitial(unit.name), tint: unit.side === 'enemy' ? '#f5d76e' : '#7fb3ff', title: unit.name,
      }))
      const label = el('span')
      label.textContent = owner ? `${unit.name} · ${owner.name}` : unit.name
      nameEl.append(label)
      unitEl.append(nameEl)
      if (options.stats && unit.side === 'enemy' && unit.maxToughness > 0) {
        const toughBar = vitalBar('Tgh', unit.toughness, unit.maxToughness, '#c9a7ff')
        toughBar.classList.add('simToughnessBar')
        unitEl.append(toughBar)
      }

      if (options.stats) {
        const labels = new Set(vitalLabelsForSnapshot(unit))
        const stats: Array<[string, string]> = [
          ...(labels.has('HP') ? [['HP', `${unit.hp.toLocaleString()} / ${unit.maxHp.toLocaleString()}`] as [string, string]] : []),
          ...(labels.has('EN') ? [['Energy', `${unit.energy.toLocaleString()} / ${unit.maxEnergy.toLocaleString()}`] as [string, string]] : []),
          ['AV', unit.av.toFixed(1)],
          ['Toughness', `${unit.toughness.toLocaleString()} / ${unit.maxToughness.toLocaleString()}`],
          ['ATK', unit.atk.toLocaleString()],
          ['DEF', unit.def.toLocaleString()],
          ['SPD', unit.spd.toFixed(1)],
          ['CRIT Rate', `${(unit.critRate * 100).toFixed(1)}%`],
          ['CRIT DMG', `${(unit.critDmg * 100).toFixed(1)}%`],
          ['Break Effect', `${(unit.be * 100).toFixed(1)}%`],
          ['EHR', `${(unit.ehr * 100).toFixed(1)}%`],
          ['Eff RES', `${(unit.effRes * 100).toFixed(1)}%`],
        ]
        const statsEl = el('div', 'simInspectorUnitStats')
        for (const [key, value] of stats) {
          const row = el('div', 'simStatMini')
          const keyEl = el('span')
          keyEl.textContent = key
          const valueEl = el('span')
          valueEl.textContent = value
          row.append(keyEl, valueEl)
          statsEl.append(row)
        }
        unitEl.append(statsEl)
      }

      if (options.statuses) {
        const statuses: string[] = []
        if (unit.broken) statuses.push('Сломан')
        if (unit.dead) statuses.push('Мёртв')
        if (unit.shield > 0) statuses.push(`Щит ${unit.shield.toLocaleString()}`)
        for (const control of unit.controls) statuses.push(`${control.name} (${control.turns})`)
        if (statuses.length > 0) {
          const statusEl = el('div', 'simInspectorUnitStatuses')
          statusEl.textContent = statuses.join(' · ')
          unitEl.append(statusEl)
        }

        const states: Array<[string, string]> = []
        for (const [key, value] of Object.entries(unit.runtime ?? {})) {
          if (COUNTDOWN_STATE_KEY.test(key)) continue
          const text = formatStateValue(value)
          if (text) states.push([key, text])
        }
        if (states.length > 0) {
          const statesEl = el('div', 'simInspectorUnitStates')
          for (const [key, value] of states) {
            const chip = el('span', 'simStateChip')
            chip.append(iconNode(effectIconUrl(key), key, {
              cls: 'simStateIcon', size: 16, fit: 'contain',
              fallbackText: safeInitial(key), tint: '#b8a1ff', title: `${key}: ${value}`,
            }))
            const text = el('span')
            text.textContent = `${key}: ${value}`
            chip.append(text)
            statesEl.append(chip)
          }
          unitEl.append(statesEl)
        }

        if (options.debuffs) {
          const debuffRows: Array<{ name: string; stacks: number; turns: number }> = []
          const seen = new Set<string>()
          for (const debuff of unit.debuffs) {
            if (seen.has(debuff.name)) continue
            seen.add(debuff.name)
            debuffRows.push({ name: debuff.name, stacks: debuff.stacks, turns: debuff.turns })
          }
          for (const dot of unit.dots) {
            if (seen.has(dot.name)) continue
            seen.add(dot.name)
            debuffRows.push({ name: dot.name, stacks: 1, turns: dot.turns })
          }
          if (debuffRows.length > 0) {
            const details = el('details', 'simUnitDebuffs')
            details.open = true
            const summary = el('summary')
            summary.textContent = `Дебаффы: ${debuffRows.length}`
            details.append(summary)
            for (const debuff of debuffRows) {
              const row = el('div', 'simUnitDebuffRow')
              row.append(iconNode(effectIconUrl(debuff.name), debuff.name, {
                cls: 'simUnitDebuffIcon', size: 16, fit: 'contain',
                fallbackText: safeInitial(debuff.name), tint: '#ff9d9d', title: debuff.name,
              }))
              const text = el('span')
              text.textContent = `${debuff.name} x${debuff.stacks} · ${debuff.turns === Infinity ? '∞' : `${debuff.turns} ход.`}`
              row.append(text)
              details.append(row)
            }
            unitEl.append(details)
          }
        }
      }

      if (options.effects) {
        const groups: Array<[string, typeof unit.buffs | typeof unit.debuffs, string]> = [
          ['Баффы', unit.buffs, 'buffs'],
          ['Дебаффы', unit.debuffs, 'debuffs'],
          ['DoT', unit.dots as unknown as typeof unit.buffs, 'dots'],
        ]
        for (const [title, list, cls] of groups) {
          if (list.length === 0) continue
          const groupEl = el('div', `simInspectorUnitEffects ${cls}`)
          const text = el('span')
          text.textContent = `${title}: ${list.map(e => `${e.name}x${'stacks' in e ? e.stacks : 1}@${'turns' in e ? e.turns : '∞'}`).join(', ')}`
          groupEl.append(text)
          unitEl.append(groupEl)
        }
      }

      return unitEl
    }

    function appendSnapshotSection(
      content: HTMLElement,
      label: string,
      snapshot: StateSnapshot | undefined,
      unitIds: string[],
      sim: Simulator,
      options: { stats: boolean; statuses: boolean; effects: boolean; debuffs?: boolean }
    ): void {
      if (!snapshot) return
      const section = el('div', 'simInspectorSnapshotSection')
      const title = el('h4', 'simInspectorSnapshotTitle')
      title.textContent = `${label} · SP ${snapshot.sp}/${snapshot.maxSp}`
      section.append(title)
      let rendered = 0
      for (const id of unitIds) {
        const unit = snapshot.units[id]
        if (!unit) continue
        section.append(createSnapshotUnitEl(unit, sim, { ...options }))
        rendered++
      }
      if (rendered > 0) content.append(section)
    }

    function renderActionTab(action: CombatActionRecord, sim: Simulator, content: HTMLElement): void {
      appendSnapshotSection(
        content,
        'Характеристики в момент действия',
        action.beforeSnapshot,
        relevantSnapshotUnitIds(action, action.beforeSnapshot, sim),
        sim,
        { stats: true, statuses: false, effects: false }
      )
    }

    function renderEffectsTab(action: CombatActionRecord, sim: Simulator, content: HTMLElement, scopeId?: string): void {
      const grid = el('div', 'simLogInspectorGrid')
      const effectNameFor = (effect: any): string => effect.name || ''
      const selectedId = scopeId ?? selectedInspectorUnitId(action)
      const selectedUnit = selectedId ? (action.afterSnapshot?.units[selectedId] ?? action.beforeSnapshot?.units[selectedId]) : undefined
      const selectedName = selectedUnit?.name ?? sim.roster.find(u => u.id === selectedId)?.name ?? ''
      const inScope = (effect: any): boolean => !selectedId || effect.targetId === selectedId || (!effect.targetId && effect.sourceId === selectedId)

      const snapshotRows = (() => {
        if (!selectedUnit || !selectedId) return undefined
        const rows: { buff: any[]; debuff: any[]; shield: any[] } = { buff: [], debuff: [], shield: [] }
        for (const buff of selectedUnit.buffs) {
          const row = { ...buff, targetId: selectedId, targetName: selectedName }
          if (buff.shield) rows.shield.push(row)
          else rows.buff.push(row)
        }
        for (const debuff of selectedUnit.debuffs) rows.debuff.push({ ...debuff, targetId: selectedId, targetName: selectedName })
        for (const dot of selectedUnit.dots) rows.debuff.push({ ...dot, targetId: selectedId, targetName: selectedName })
        return rows
      })()

      const mergeStacked = (effects: any[], kind: EffectKind): any[] => {
        const merged = new Map<string, any>()
        for (const effect of effects) {
          const key = `${kind}|${effect.targetId ?? ''}|${effect.id ?? ''}|${effect.sourceId ?? ''}`
          merged.set(key, { ...effect })
        }
        return [...merged.values()]
      }

      const addEffectSection = (label: string, effects: any[], kind: EffectKind, stacked = false) => {
        const rows = stacked ? mergeStacked(effects, kind) : effects
        if (rows.length === 0) return
        const section = el('div', 'simInspectorEffectSection')
        const title = el('h4', `simInspectorEffectTitle ${kind}`)
        title.textContent = label
        section.append(title)

        const list = el('div', 'simInspectorEffectList')
        for (const effect of rows) {
          const name = effectNameFor(effect)
          const iconUrl = effectIconFor({ ...effect, name, kind })
          const tint = kind === 'debuff' ? '#ff9d9d' : '#7fb3ff'

          const el_effect = el('div', `simInspectorEffect ${kind === 'neutral' ? '' : kind}`.trim())
          const iconEl = el('div', 'simInspectorEffectIcon')
          iconEl.append(iconNode(iconUrl, name, { cls: 'simInspectorEffectIconImg', size: 24, fit: 'contain', fallbackText: safeInitial(name), tint, title: name }))
          const infoEl = el('div', 'simInspectorEffectInfo')
          const nameEl = el('div', 'simInspectorEffectName')
          nameEl.textContent = name
          const source = effectSourceFor(effect, sim)
          const sourceEl = el('div', 'simInspectorEffectSource')
          sourceEl.append(iconNode(source.url, source.name, { cls: 'simInspectorEffectSourceIcon', size: 18, fit: 'contain', fallbackText: safeInitial(source.name), tint, title: `Источник: ${source.name}` }))
          const sourceNameEl = el('span')
          sourceNameEl.textContent = `Источник: ${source.name}`
          sourceEl.append(sourceNameEl)

          const target = effectTargetFor(effect, sim)
          const targetEl = el('div', 'simInspectorEffectTarget')
          targetEl.append(iconNode(target.url, target.name, { cls: 'simInspectorEffectTargetIcon', size: 18, fit: 'contain', fallbackText: safeInitial(target.name), tint, title: `Получатель: ${target.name}` }))
          const targetNameEl = el('span')
          targetNameEl.textContent = `Получатель: ${target.name}`
          targetEl.append(targetNameEl)

          infoEl.append(nameEl, sourceEl, targetEl)
          const metaEl = el('div', 'simInspectorEffectMeta')
          const meta: Array<[string, string]> = []
          if ('stacks' in effect) meta.push(['Стаки', String(effect.stacks)])
          if ('turns' in effect) meta.push(['Ходы', effect.turns === Infinity ? '∞' : String(effect.turns)])
          if ('amount' in effect) meta.push(['Значение', effect.amount.toLocaleString()])
          if ('damage' in effect) meta.push(['Урон', effect.damage.toLocaleString()])
          if ('breakDamage' in effect) meta.push(['Урон слома', effect.breakDamage.toLocaleString()])
          for (const [key, value] of meta) {
            const span = el('span')
            span.textContent = `${key}: ${value}`
            metaEl.append(span)
          }
          infoEl.append(metaEl)
          const mods: Array<{ stat: string; value: number; whenAbility?: string[] }> = effect.mods ?? []
          const alwaysMods = mods.filter(m => !m.whenAbility?.length)
          const conditionalMods = mods.filter(m => m.whenAbility?.length)
          if (alwaysMods.length > 0) {
            const modsEl = el('div', 'simInspectorEffectMods')
            for (const m of alwaysMods) {
              const modEl = el('span', 'simMod')
              modEl.textContent = formatEffectModTotal(m, effect.stacks ?? 1)
              modsEl.append(modEl)
            }
            infoEl.append(modsEl)
          }
          if (conditionalMods.length > 0) {
            const modsEl = el('div', 'simInspectorEffectMods conditional')
            const condLabel = el('span')
            condLabel.textContent = 'Условно'
            modsEl.append(condLabel)
            for (const m of conditionalMods) {
              const modEl = el('span', 'simMod')
              modEl.textContent = formatEffectModTotal(m, effect.stacks ?? 1)
              modsEl.append(modEl)
            }
            infoEl.append(modsEl)
          }
          if (effect.shield) {
            const shieldEl = el('div', 'simInspectorEffectShield')
            shieldEl.textContent = `Щит: ${effect.shield.toLocaleString()}`
            infoEl.append(shieldEl)
          }
          el_effect.append(iconEl, infoEl)
          list.append(el_effect)
        }
        section.append(list)
        grid.append(section)
      }

      const buffRows = [...action.effects.buffs.filter(e => e.shield === undefined), ...(snapshotRows?.buff ?? [])]
      const debuffRows = [...action.effects.debuffs, ...action.effects.dots, ...(snapshotRows?.debuff ?? [])]
      const shieldRows = [...action.effects.shields, ...(snapshotRows?.shield ?? [])]
      addEffectSection('Баффы', buffRows.filter(e => !isNeutralEffect(e) && inScope(e)), 'buff', true)
      addEffectSection('Дебаффы', debuffRows.filter(e => !isNeutralEffect(e) && inScope(e)), 'debuff', true)
      addEffectSection('Щиты', shieldRows.filter(inScope), 'shield')
      addEffectSection('Урон по щитам', action.effects.shieldDamage.filter(inScope), 'shield')
      addEffectSection('Лечение', action.effects.heals.filter(inScope), 'buff')
      addEffectSection('Снятие эффектов', action.effects.removals.filter(inScope), 'removal')

      const summons = action.effects.other.filter(e => (e.type === 'SUMMON_CREATED' || e.type === 'SUMMON_DESPAWNED') && inScope(e))
      if (summons.length > 0) {
        const section = el('div', 'simInspectorEffectSection')
        const title = el('h4', 'simInspectorEffectTitle neutral')
        title.textContent = 'Призывы'
        section.append(title)
        const list = el('div', 'simInspectorEffectList')
        for (const summon of summons) {
          let name = summon.targetName
          try {
            const payload = JSON.parse(summon.description) as Record<string, unknown>
            name = String(payload.name ?? payload.summonName ?? payload.unitName ?? name)
          } catch {}
          const item = el('div', 'simInspectorEffect buff')
          const text = el('span')
          text.textContent = `${summon.type === 'SUMMON_CREATED' ? 'Призыв' : 'Исчезновение'}: ${name}`
          item.append(iconNode(effectIconUrl(name), name, { cls: 'simInspectorEffectIconImg', size: 24, fit: 'contain', fallbackText: safeInitial(name), tint: '#7fb3ff', title: name }), text)
          list.append(item)
        }
        section.append(list)
        grid.append(section)
      }

      const changes: Array<[string, typeof action.effects.energyChanges]> = [
        ['Изменение энергии', action.effects.energyChanges.filter(inScope)],
        ['Изменение SP', action.effects.spChanges.filter(inScope)],
      ]
      for (const [label, rows] of changes) {
        if (rows.length === 0) continue
        const section = el('div', 'simInspectorEffectSection')
        const title = el('h4', 'simInspectorEffectTitle neutral')
        title.textContent = label
        section.append(title)
        const list = el('div', 'simInspectorEffectList')
        for (const row of rows) {
          const targetUnit = row.targetId ? sim.roster.find(u => u.id === row.targetId) : undefined
          const item = el('div', 'simInspectorEffect')
          const target = el('span')
          target.textContent = targetUnit?.name || row.targetId
          const delta = el('span', row.delta >= 0 ? 'positive' : 'negative')
          delta.textContent = `${row.delta >= 0 ? '+' : ''}${row.delta}`
          const reason = el('span', 'reason')
          reason.textContent = row.reason
          item.append(target, delta, reason)
          list.append(item)
        }
        section.append(list)
        grid.append(section)
      }

      addEffectSection('Пробития', action.effects.breaks.filter(inScope), 'debuff')

      content.append(grid)
    }
    renderEffectsTabImpl = renderEffectsTab

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

  _renderBuilder()

  // Initial render
  refresh()

  const handle = { root, refresh }
  mounted.set(host, handle)
  return handle
} // Explicit return to satisfy TypeScript

function section(title: string): HTMLElement {
  const sec = el('section', 'simSection')
  const h = el('h2')
  h.textContent = title
  sec.append(h)
  return sec
}
