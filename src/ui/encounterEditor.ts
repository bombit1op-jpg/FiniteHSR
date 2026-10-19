/**
 * §84.7 — Enemy Catalog / Encounter Editor.
 *
 * Edits a canonical `EncounterSpec` (rule 84.1: engine types only) and validates it with the
 * engine's own `validateEncounter` — the UI does not re-implement the structural checks.
 * Waves are editable structurally; the canonical JSON is import/exportable for anything the
 * structured view does not surface (res tables, startingRules, stage modifiers).
 */
import { ENEMY_PRESETS, ENCOUNTER_PRESETS } from '../core/battle'
import type { EnemySpec } from '../core/battle'
import { validateEncounter } from '../core/encounter'
import type { EncounterSpec } from '../core/encounter'
import { el } from './dom'
import { specToJson, specFromJson, downloadJson, pickJsonFile, readFileText } from './specs'
import { showStatus, withBusy, navigate } from './shell'
import { store } from './store'
// Loaded on demand: endgame.json is a large historical archive and should not slow initial app startup.

type Elem = EnemySpec['weaknesses'][number]

function cloneGroup(e: EnemySpec): EnemySpec {
  return {
    name: e.name, count: e.count, hp: e.hp, spd: e.spd, level: e.level,
    toughness: e.toughness, weaknesses: [...e.weaknesses],
    res: e.res ? { ...e.res } : undefined, atk: e.atk, effectRes: e.effectRes, debuffRes: e.debuffRes ? [...e.debuffRes] : undefined, rank: e.rank,
  }
}

function freshGroup(): EnemySpec {
  return cloneGroup({ ...(ENEMY_PRESETS.mob as EnemySpec), count: 1 })
}

export function initEncounterEditor(): void {
  const root = document.getElementById('encounterEditor')
  if (!root) return
  root.innerHTML = ''

  const cur: EncounterSpec = {
    id: 'custom', mode: 'Open field', cycles: 6,
    waves: [[cloneGroup({ ...(ENEMY_PRESETS.mob as EnemySpec), count: 1 })]],
  }

  const archiveRoot = el('div', 'mocArchive')
  const archiveTitle = el('h3')
  archiveTitle.textContent = 'Исторический Memory of Chaos'
  const archiveDescription = el('p', 'dim')
  archiveDescription.textContent = 'Выбери версию, этап и комнату. Состав противников берётся из hsr-data/endgame.json и связывается с существующими профилями врагов.'
  const archiveButton = el('button', 'btn-secondary')
  archiveButton.textContent = 'Открыть архив MoC'
  const archiveControls = el('div', 'mocArchiveControls')
  archiveControls.style.display = 'none'
  archiveRoot.append(archiveTitle, archiveDescription, archiveButton, archiveControls)
  let archiveModule: typeof import('../core/endgame') | undefined
  let archiveInitialized = false

  const idInp = text(cur.id)
  const modeInp = text(cur.mode ?? '')
  const cyclesInp = num(cur.cycles ?? 6)
  const wavesBox = el('div', 'encWaves')
  const validation = el('div', 'encValidation')

  const validate = (): void => {
    const bad = validateEncounter(cur)
    validation.dataset.ok = bad.length ? '0' : '1'
    const groups = cur.waves.reduce((n, w) => n + w.length, 0)
    validation.textContent = bad.length
      ? '✗ ' + bad.join(', ')
      : `✓ валидно · волн: ${cur.waves.length}, групп: ${groups}`
  }

  // ---------------------------------------------------------------- wave / group editing

  const renderWaves = (): void => {
    wavesBox.innerHTML = ''
    cur.waves.forEach((wave, wi) => {
      const w = el('div', 'encWave')
      const head = el('div', 'encWaveHead')
      const title = el('h4'); title.textContent = `Волна ${wi + 1}`
      const addG = el('button', 'btn-secondary'); addG.textContent = '+ группа'
      addG.onclick = () => { wave.push(freshGroup()); renderWaves() }
      const delW = el('button', 'del'); delW.textContent = '✕ волна'
      delW.onclick = () => { if (cur.waves.length > 1) { cur.waves.splice(wi, 1); renderWaves() } }
      head.append(title, addG, delW)
      w.append(head)
      wave.forEach((g, gi) => w.append(groupCard(g, () => { wave.splice(gi, 1); renderWaves() })))
      wavesBox.append(w)
    })
    validate()
  }

  const groupCard = (g: EnemySpec, onRemove: () => void): HTMLElement => {
    const card = el('div', 'encGroup')
    const fields = el('div', 'row')
    const set = (k: keyof EnemySpec, v: unknown): void => { (g as unknown as Record<string, unknown>)[k] = v; validate() }
    const nameI = text(g.name, v => set('name', v))
    const countI = num(g.count, v => set('count', Math.max(1, v)))
    const hpI = num(g.hp, v => set('hp', v))
    const spdI = num(g.spd, v => set('spd', v))
    const lvlI = num(g.level, v => set('level', v))
    const toughI = num(g.toughness, v => set('toughness', v))
    const weakI = text(g.weaknesses.join(','), v =>
      set('weaknesses', v.split(',').map(s => s.trim()).filter(Boolean) as Elem[]))
    const atkI = num(g.atk ?? 0, v => set('atk', v || undefined))
    fields.append(
      lab('Имя', nameI), lab('Кол-во', countI), lab('HP', hpI), lab('SPD', spdI),
      lab('Ур.', lvlI), lab('Toughness', toughI), lab('Слабости', weakI), lab('ATK', atkI),
    )
    const del = el('button', 'del'); del.textContent = '✕'; del.onclick = onRemove
    fields.append(del)
    card.append(fields)
    return card
  }

  // ---------------------------------------------------------------- historical MoC archive (lazy-load the large dataset)

  archiveButton.onclick = () => {
    if (archiveInitialized) {
      const hidden = archiveControls.style.display !== 'none'
      archiveControls.style.display = hidden ? 'none' : ''
      archiveButton.textContent = hidden ? 'Показать архив MoC' : 'Скрыть архив MoC'
      return
    }

    archiveButton.disabled = true
    void withBusy('Загрузка исторического архива MoC…', async () => {
      if (!archiveModule) archiveModule = await import('../core/endgame')
      const api = archiveModule
      const versionSel = el('select') as HTMLSelectElement
      const stageSel = el('select') as HTMLSelectElement
      const effectSel = el('select') as HTMLSelectElement
      const effectInfo = el('div', 'mocEffectInfo')
      const roomsPreview = el('div', 'mocRoomsPreview')
      const loadStageButton = el('button', 'btn-primary')
      loadStageButton.textContent = 'Загрузить весь этап'

      const fields = el('div', 'row')
      fields.append(
        lab('Версия MoC', versionSel),
        lab('Этап', stageSel),
        lab('Бафф периода (справочно)', effectSel),
      )
      const warning = el('p', 'dim')
      warning.textContent = 'Бафф показывается из архива как описание. Его игровая механика не применяется к боевой математике автоматически; это требует отдельной реализации.'
      archiveControls.replaceChildren(fields, effectInfo, roomsPreview, warning, loadStageButton)

      const setOptions = (select: HTMLSelectElement, entries: Array<[string, string]>): void => {
        select.innerHTML = ''
        for (const entry of entries) {
          const option = el('option') as HTMLOptionElement
          option.value = entry[0]
          option.textContent = entry[1]
          select.append(option)
        }
      }

      const selectedEffect = () => api.endgameEffects('MoC', versionSel.value)
        .find(effect => effect.id === effectSel.value)

      const refreshEffects = (): void => {
        const effects = api.endgameEffects('MoC', versionSel.value)
        setOptions(effectSel, effects.map(effect => [
          effect.id,
          effect.label + ' — ' + effect.description.slice(0, 76) + (effect.description.length > 76 ? '…' : ''),
        ]))
        effectSel.disabled = effects.length === 0
        if (!effects.length) {
          const empty = el('option') as HTMLOptionElement
          empty.value = ''
          empty.textContent = 'Описание эффекта отсутствует'
          effectSel.append(empty)
        }
      }

      const refreshStage = (): void => {
        const stage = api.endgameStage('MoC', versionSel.value, stageSel.value)
        roomsPreview.replaceChildren()
        if (!stage || !stage.rooms.length) {
          roomsPreview.textContent = 'Для выбранного этапа нет распознанных комнат или врагов.'
          loadStageButton.disabled = true
          return
        }

        const cycles = Array.isArray(stage.maxCycles)
          ? stage.maxCycles.reduce((sum, value) => sum + value, 0)
          : stage.maxCycles
        const summary = el('p')
        summary.textContent = stage.title + ' · комнат: ' + stage.rooms.length +
          ' · уровни врагов: ' + (stage.enemyLevels.length ? stage.enemyLevels.join(' / ') : 'по умолчанию') +
          ' · общий лимит этапа: ' + (cycles || 'не указан') + ' циклов'
        roomsPreview.append(summary)

        let groupCount = 0
        stage.rooms.forEach((room, roomIndex) => {
          const roomCard = el('section', 'mocRoomCard')
          const heading = el('h4')
          heading.textContent = 'Комната ' + (roomIndex + 1) + ' — ' + room.id
          roomCard.append(heading)

          if (!room.enemies.length) {
            const missing = el('p', 'dim')
            missing.textContent = 'Не удалось сопоставить врагов этой комнаты с каталогом.'
            roomCard.append(missing)
          }
          room.enemies.forEach(enemy => {
            groupCount += 1
            const line = el('p')
            line.textContent = enemy.name + ' ×' + enemy.count +
              ' · ур. ' + enemy.level +
              ' · HP ' + enemy.hp.toLocaleString('ru-RU') +
              ' · ATK ' + (enemy.atk ?? 0).toLocaleString('ru-RU') +
              ' · SPD ' + enemy.spd
            roomCard.append(line)
            const details = el('p', 'dim')
            details.textContent = 'Слабости: ' + (enemy.weaknesses?.join(', ') || 'не указаны')
            roomCard.append(details)
          })
          roomsPreview.append(roomCard)
        })
        loadStageButton.disabled = groupCount === 0
        const effect = selectedEffect()
        effectInfo.textContent = effect
          ? effect.label + ': ' + effect.description
          : 'В архиве нет описания баффа для выбранной версии.'
      }

      const refreshStages = (): void => {
        const stages = api.endgameSections('MoC', versionSel.value)
        setOptions(stageSel, stages.map(stage => [stage.id, stage.title]))
        stageSel.disabled = stages.length === 0
        refreshStage()
      }

      const versions = api.endgameVersions('MoC').slice().reverse()
      setOptions(versionSel, versions.map(version => [version, 'MoC ' + version]))
      versionSel.onchange = () => {
        refreshEffects()
        refreshStages()
      }
      stageSel.onchange = refreshStage
      effectSel.onchange = refreshStage

      loadStageButton.onclick = () => {
        const stage = api.endgameStage('MoC', versionSel.value, stageSel.value)
        const battle = stage?.battles[0]
        if (!stage || !battle || !battle.waves.some(wave => wave.length > 0)) {
          showStatus('Не удалось загрузить этап: в нём нет распознанных врагов.', 'error')
          return
        }
        const effect = selectedEffect()
        const cycles = Array.isArray(stage.maxCycles)
          ? stage.maxCycles.reduce((sum, value) => sum + value, 0)
          : stage.maxCycles
        cur.id = ('moc-' + versionSel.value + '-' + stage.id).replace(/[^a-zA-Z0-9_-]+/g, '_')
        cur.mode = 'MoC ' + versionSel.value + ' · ' + stage.title + (effect ? ' · ' + effect.label : '')
        cur.stageId = stage.id
        cur.cycles = cycles > 0 ? cycles : 10
        cur.waves = battle.waves.map(wave => wave.map(cloneGroup))
        cur.effects = undefined
        cur.stageModifiers = undefined
        cur.startingRules = undefined
        idInp.value = cur.id
        modeInp.value = cur.mode
        cyclesInp.value = String(cur.cycles)
        renderWaves()
        const enemyCount = cur.waves.reduce((sum, wave) =>
          sum + wave.reduce((n, enemy) => n + enemy.count, 0), 0)
        showStatus(
          'Загружен MoC ' + versionSel.value + ' · ' + stage.title +
          ' · комнат: ' + stage.rooms.length + ' · врагов: ' + enemyCount +
          '. Общий лимит циклов сохранён; выбранный бафф пока справочный.',
          'info',
        )
      }

      refreshEffects()
      refreshStages()
      archiveControls.style.display = ''
      archiveButton.textContent = 'Скрыть архив MoC'
      archiveInitialized = true
    }).finally(() => { archiveButton.disabled = false })
  }

  // ---------------------------------------------------------------- header wiring

  idInp.oninput = () => { cur.id = idInp.value; validate() }
  modeInp.oninput = () => { cur.mode = modeInp.value || undefined; validate() }
  cyclesInp.oninput = () => { cur.cycles = Number(cyclesInp.value) || undefined; validate() }

  const presetSel = el('select') as HTMLSelectElement
  for (const [k, v] of Object.entries(ENCOUNTER_PRESETS)) {
    const o = el('option'); o.value = k; o.textContent = `${v.id} (${v.mode ?? k})`; presetSel.append(o)
  }
  const loadBtn = el('button', 'btn-secondary'); loadBtn.textContent = 'Загрузить пресет'
  loadBtn.onclick = () => {
    const p = ENCOUNTER_PRESETS[presetSel.value]
    if (!p) return
    cur.id = p.id; cur.mode = p.mode; cur.cycles = p.cycles
    cur.waves = p.waves.map(w => w.map(cloneGroup))
    idInp.value = cur.id; modeInp.value = cur.mode ?? ''; cyclesInp.value = String(cur.cycles ?? 6)
    renderWaves()
    showStatus(`Пресет "${p.id}" загружен`)
  }

  // ---------------------------------------------------------------- import / export

  const exportJson = (): void => downloadJson(`encounter-${cur.id || 'custom'}.json`, specToJson('encounter', cur))
  const importJson = (): void =>
    void withBusy('Чтение столкновения…', async () => {
      const file = await pickJsonFile()
      if (!file) return
      const data = specFromJson<EncounterSpec>(await readFileText(file), 'encounter')
      cur.id = data.id; cur.mode = data.mode; cur.cycles = data.cycles
      cur.waves = (data.waves ?? []).map(w => w.map(cloneGroup))
      if (data.effects) cur.effects = data.effects
      idInp.value = cur.id; modeInp.value = cur.mode ?? ''; cyclesInp.value = String(cur.cycles ?? 6)
      renderWaves()
      showStatus('Столкновение загружено')
    })
  const useInBattle = (): void => {
    store.dispatch({ type: 'encounterSpec/set', spec: { ...cur } })
    if (cur.cycles) store.dispatch({ type: 'run/set', patch: { cycles: cur.cycles } })
    navigate('battle')
  }

  // ---------------------------------------------------------------- assemble

  const header = el('div', 'row')
  header.append(lab('ID', idInp), lab('Режим', modeInp), lab('Циклы', cyclesInp))
  const tools = el('div', 'row')
  const addWave = el('button', 'btn-secondary'); addWave.textContent = '+ волна'
  addWave.onclick = () => { cur.waves.push([freshGroup()]); renderWaves() }
  const expBtn = el('button', 'btn-secondary'); expBtn.textContent = 'Экспорт JSON'; expBtn.onclick = exportJson
  const impBtn = el('button', 'btn-secondary'); impBtn.textContent = 'Импорт JSON'; impBtn.onclick = importJson
  const useBtn = el('button', 'btn-primary'); useBtn.textContent = 'Использовать в бою'; useBtn.onclick = useInBattle
  tools.append(presetSel, loadBtn, addWave, expBtn, impBtn, useBtn)

  root.append(archiveRoot, header, tools, wavesBox, validation)
  renderWaves()
}

// ---------------------------------------------------------------- tiny dom helpers

function text(value: string, onInput?: (v: string) => void): HTMLInputElement {
  const i = el('input') as HTMLInputElement
  i.type = 'text'; i.value = value
  if (onInput) i.oninput = () => onInput(i.value)
  return i
}
function num(value: number, onInput?: (v: number) => void): HTMLInputElement {
  const i = el('input') as HTMLInputElement
  i.type = 'number'; i.step = 'any'; i.value = String(value)
  if (onInput) i.oninput = () => onInput(Number(i.value) || 0)
  return i
}
function lab(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label'); l.textContent = text; l.append(control); return l
}
