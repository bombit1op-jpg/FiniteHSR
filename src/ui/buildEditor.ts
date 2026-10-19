/**
 * §84.5 — Character / Build Editor.
 *
 * Edits a canonical `BuildSpec` (rule 84.1: bind only to engine types). Validation and
 * compilation delegate to the engine (`validateBuild`, `resolveBuild`) — the UI never
 * re-checks gear ids itself. Import/export produces the canonical, versioned document.
 */
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import { KITS } from '../core/kits'
import { resolveBuild, validateBuild, type BuildSpec } from '../core/build'
import { el, fillSelect } from './dom'
import { specToJson, specFromJson, downloadJson, pickJsonFile, readFileText } from './specs'
import { showStatus, withBusy } from './shell'
import { charBadge, gearBadge, updateCharBadge, updateGearBadge } from './icons'
import { store } from './store'
import { syncRow, teamRows } from './team'

const DEFAULT_LEVELS = { basic: 6, skill: 10, ult: 10, talent: 10 }

export function initBuildEditor(): void {
  const root = document.getElementById('buildEditor')
  if (!root) return
  root.innerHTML = ''

  const cur: BuildSpec = { eidolon: 0, levels: { ...DEFAULT_LEVELS } }

  const kitSel = el('select') as HTMLSelectElement
  fillSelect(kitSel, KITS.map(k => [k.id, `${k.name} (${k.elem})`]))
  kitSel.value = KITS[0]?.id ?? ''

  const coneSel = el('select') as HTMLSelectElement
  fillSelect(coneSel, [['', '— нет —'], ...LIGHT_CONES.map(c => [c.id, `★${c.rarity} ${c.name}`] as [string, string])])

  const siSel = el('select') as HTMLSelectElement
  fillSelect(siSel, [1, 2, 3, 4, 5].map(n => [String(n), `S${n}`] as [string, string]))

  const relicSel = el('select') as HTMLSelectElement
  fillSelect(relicSel, [['', '— нет —'], ...RELIC_SETS.map(s => [s.id, s.name] as [string, string])])

  const countSel = el('select') as HTMLSelectElement
  fillSelect(countSel, [['4', '4pc'], ['2', '2pc']] as [string, string][])

  const relic2Sel = el('select') as HTMLSelectElement
  fillSelect(relic2Sel, [['', '— нет —'], ...RELIC_SETS.map(s => [s.id, s.name] as [string, string])])

  const planarSel = el('select') as HTMLSelectElement
  fillSelect(planarSel, [['', '— нет —'], ...PLANAR_SETS.map(s => [s.id, s.name] as [string, string])])

  const eidSel = el('select') as HTMLSelectElement
  fillSelect(eidSel, [0, 1, 2, 3, 4, 5, 6].map(n => [String(n), `E${n}`] as [string, string]))

  const lvl: Record<'basic' | 'skill' | 'ult' | 'talent', HTMLInputElement> = {
    basic: num(DEFAULT_LEVELS.basic, 1, 7),
    skill: num(DEFAULT_LEVELS.skill, 1, 12),
    ult: num(DEFAULT_LEVELS.ult, 1, 12),
    talent: num(DEFAULT_LEVELS.talent, 1, 12),
  }
  const tracesChk = el('input') as HTMLInputElement
  tracesChk.type = 'checkbox'; tracesChk.checked = true

  const validation = el('div', 'buildValidation')
  const resolved = el('pre', 'buildResolved')

  const coneBadge = gearBadge('cone', coneSel.value)
  const relicBadge = gearBadge('relic', relicSel.value)
  const relic2Badge = gearBadge('relic', relic2Sel.value)
  const planarBadge = gearBadge('planar', planarSel.value)

  // ---------------------------------------------------------------- sync + render

  const readForm = (): void => {
    cur.cone = coneSel.value || undefined
    cur.si = Number(siSel.value) || 1
    cur.relic = relicSel.value || undefined
    cur.relicCount = (Number(countSel.value) === 2 ? 2 : 4)
    cur.relic2 = relic2Sel.value || undefined
    cur.planar = planarSel.value || undefined
    cur.eidolon = Number(eidSel.value) || 0
    cur.levels = { basic: lv(lvl.basic, 7), skill: lv(lvl.skill, 12), ult: lv(lvl.ult, 12), talent: lv(lvl.talent, 12) }
    cur.traces = tracesChk.checked
  }

  const renderOut = (): void => {
    readForm()
    updateGearBadge(coneBadge, 'cone', coneSel.value)
    updateGearBadge(relicBadge, 'relic', relicSel.value)
    updateGearBadge(relic2Badge, 'relic', relic2Sel.value)
    updateGearBadge(planarBadge, 'planar', planarSel.value)
    const bad = validateBuild(cur)
    validation.dataset.ok = bad.length ? '0' : '1'
    validation.textContent = bad.length ? '✗ ' + bad.join(', ') : '✓ все id разрешаются'
    resolved.textContent = JSON.stringify(resolveBuild(cur), null, 2)
  }

  const applyToForm = (b: BuildSpec): void => {
    coneSel.value = b.cone ?? ''
    siSel.value = String(b.si ?? 1)
    relicSel.value = b.relic ?? ''
    countSel.value = String(b.relicCount ?? 4)
    relic2Sel.value = b.relic2 ?? ''
    planarSel.value = b.planar ?? ''
    eidSel.value = String(b.eidolon ?? 0)
    const lv0 = b.levels ?? DEFAULT_LEVELS
    lvl.basic.value = String(lv0.basic); lvl.skill.value = String(lv0.skill)
    lvl.ult.value = String(lv0.ult); lvl.talent.value = String(lv0.talent)
    tracesChk.checked = b.traces ?? true
    renderOut()
  }

  for (const inp of [coneSel, siSel, relicSel, countSel, relic2Sel, planarSel, eidSel, tracesChk]) inp.onchange = renderOut
  for (const inp of Object.values(lvl)) inp.oninput = renderOut

  // ---------------------------------------------------------------- import / export

  const exportJson = (): void => {
    readForm()
    downloadJson(`build-${kitSel.value}.json`, specToJson('build', cur))
  }

  const importJson = (): void =>
    void withBusy('Чтение билда…', async () => {
      const file = await pickJsonFile()
      if (!file) return
      const data = specFromJson<BuildSpec>(await readFileText(file), 'build')
      applyToForm(data)
      showStatus('Билд загружен')
    })

  // ---------------------------------------------------------------- assemble

  const badge = charBadge(kitSel.value)
  kitSel.onchange = () => updateCharBadge(badge, kitSel.value)

  const form = el('div', 'buildForm')
  form.append(
    row('Персонаж', badge, kitSel),
    row('Light Cone', coneBadge, coneSel), row('Superimposition', siSel),
    row('Реликвия', relicBadge, relicSel), row('Кол-во', countSel), row('Реликвия 2 (2+2)', relic2Badge, relic2Sel),
    row('Планарный', planarBadge, planarSel),
    row('Эйдолон', eidSel),
    row('Уровни', lvl.basic, lvl.skill, lvl.ult, lvl.talent, label('Трейсы', tracesChk)),
  )
  const actions = el('div', 'row')
  const expBtn = el('button', 'btn-secondary'); expBtn.textContent = 'Экспорт JSON'; expBtn.onclick = exportJson
  const impBtn = el('button', 'btn-secondary'); impBtn.textContent = 'Импорт JSON'; impBtn.onclick = importJson
  const applyBtn = el('button', 'btn-secondary'); applyBtn.textContent = 'Применить к отряду'
  const rowSel = el('select') as HTMLSelectElement

  const refreshRows = (): void => {
    rowSel.innerHTML = ''
    for (const t of store.getState().team) {
      const k = KITS.find(x => x.id === t.kitId)
      const o = el('option') as HTMLOptionElement
      o.value = t.id
      o.textContent = `${k?.name ?? t.kitId} #${t.id.slice(0, 4)}`
      rowSel.append(o)
    }
  }
  refreshRows()

  applyBtn.onclick = (): void => {
    const id = rowSel.value
    const r = teamRows.find(x => x.id === id)
    if (!r) return
    readForm()
    if (cur.cone) r.coneSel.value = cur.cone
    r.siSel.value = String(cur.si ?? 1)
    if (cur.relicCount === 4 && !cur.relic2 && cur.relic) {
      r.relic1.value = cur.relic
      r.relic2.value = cur.relic
    } else {
      if (cur.relic) r.relic1.value = cur.relic
      if (cur.relic2) r.relic2.value = cur.relic2
    }
    if (cur.planar) r.planarSel.value = cur.planar
    r.eidSel.value = String(cur.eidolon ?? 0)
    const lv = cur.levels ?? { basic: 6, skill: 10, ult: 10, talent: 10 }
    r.levels.basic.value = String(lv.basic)
    r.levels.skill.value = String(lv.skill)
    r.levels.ult.value = String(lv.ult)
    r.levels.talent.value = String(lv.talent)
    r.tracesChk.checked = cur.traces ?? true
    syncRow(r)
    showStatus('Билд применён к строке отряда')
  }

  actions.append(expBtn, impBtn, rowSel, applyBtn)

  root.append(form, actions,
    sectionTitle('Валидация (validateBuild)'), validation,
    sectionTitle('Компиляция (resolveBuild)'), resolved)

  renderOut()
}

// ---------------------------------------------------------------- tiny dom helpers

function num(value: number, min: number, max: number): HTMLInputElement {
  const i = el('input') as HTMLInputElement
  i.type = 'number'; i.min = String(min); i.max = String(max); i.value = String(value)
  return i
}
function lv(i: HTMLInputElement, max: number): number {
  return Math.max(1, Math.min(max, Number(i.value) || 1))
}
function label(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label'); l.textContent = text; l.append(control); return l
}
function row(text: string, ...controls: HTMLElement[]): HTMLElement {
  const r = el('div', 'row')
  r.append(label(text, controls[0]))
  for (const c of controls.slice(1)) r.append(c)
  return r
}
function sectionTitle(text: string): HTMLElement {
  const h = el('h3'); h.textContent = text; return h
}
