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

  root.append(header, tools, wavesBox, validation)
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
