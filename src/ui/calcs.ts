import { KITS } from '../core/kits'
import {
  CalcProfile, CalcEnemy,
  hitBreakdown, statGrid, critOptimal,
  minSpdFor, actionsIn, advanceAsSpeed,
  resGain, vulnEquivDefShred, breakDamage, superBreakHit,
  GRID_KEYS, GRID_KEY_LABELS,
} from '../core/calcs'
import { rawDefMult } from '../core/combat/StatResolver'
import { store } from './store'
import type { CalcsState } from './store'

const MOCTHRESHOLDS = [100, 110, 118.182, 120, 125, 133.334, 134, 142.858, 143, 155.556, 160, 171.429, 175, 200]

const EL = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T

function readProfile(): CalcProfile {
  const c = store.getState().calcs
  return {
    atk: c.cAtk || 1000,
    atkPct: (c.cAtkPct || 0) / 100,
    attLevel: c.cAttLvl || 80,
    critRate: (c.cCR || 5) / 100,
    critDmg: (c.cCD || 50) / 100,
    dmgPct: (c.cDMG || 0) / 100,
    be: (c.cBE || 0) / 100,
    spd: c.cSPD || 100,
  }
}

function readEnemy(): CalcEnemy {
  const c = store.getState().calcs
  return {
    level: c.eLvl || 95,
    res: (c.eRES || 0) / 100,
    vuln: (c.eVuln || 0) / 100,
    defShred: (c.eDEF || 0) / 100,
    broken: c.eBroken,
  }
}

function fmtPct(v: number): string {
  return (v * 100).toFixed(1) + '%'
}

function fmtN(v: number): string {
  return v < 10 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v < 1000 ? v.toFixed(1) : Math.round(v).toLocaleString()
}

function renderHit(p: CalcProfile, e: CalcEnemy): string {
  const b = hitBreakdown(p, e)
  return `<table class="calcTable">
    <tr><th>Множитель</th><th>Значение</th></tr>
    <tr><td>База (АТК × АТК% × множитель)</td><td class="num">${fmtN(b.base)}</td></tr>
    <tr><td>× DMG% (${fmtPct(p.dmgPct)})</td><td class="num">×${b.boost.toFixed(3)}</td></tr>
    <tr><td>× DEF (att ${p.attLevel} → def ${e.level})</td><td class="num">×${b.defM.toFixed(4)}</td></tr>
    <tr><td>× RES (${fmtPct(e.res)})</td><td class="num">×${b.resM.toFixed(3)}</td></tr>
    <tr><td>× Vuln (${fmtPct(e.vuln)})</td><td class="num">×${b.vulnM.toFixed(3)}</td></tr>
    <tr><td>× Broken (${e.broken ? 'да' : 'нет'})</td><td class="num">×${b.brokenM.toFixed(3)}</td></tr>
    <tr class="total"><td>Без крита</td><td class="num">${fmtN(b.noCrit)}</td></tr>
    <tr class="total"><td>С критом</td><td class="num">${fmtN(b.crit)}</td></tr>
    <tr class="total"><td>Средний (ожидание)</td><td class="num">${fmtN(b.expected)}</td></tr>
  </table>`
}

function renderGrid(p: CalcProfile, e: CalcEnemy): string {
  const c = store.getState().calcs
  const kA = c.gKeyA as typeof GRID_KEYS[number]
  const kB = c.gKeyB as typeof GRID_KEYS[number]
  const steps = 10, stepSize = 0.10
  const grid = statGrid(p, e, kA, kB, steps, stepSize)

  let html = '<table class="calcTable"><tr><th></th>'
  for (let j = 0; j <= steps; j++)
    html += `<th class="num">${GRID_KEY_LABELS[kB]} +${j * 10}%</th>`
  html += '</tr>'
  for (let i = 0; i <= steps; i++) {
    html += `<tr><td>${GRID_KEY_LABELS[kA]} +${i * 10}%</td>`
    for (let j = 0; j <= steps; j++) {
      const v = grid[i][j]
      const cls = v > 1.001 ? ' class="num best"' : v < 0.999 ? ' class="num dim"' : ' class="num"'
      html += `<td${cls}>×${v.toFixed(3)}</td>`
    }
    html += '</tr>'
  }
  html += '</table>'
  html += `<div class="dim" style="margin-top:6px">Базовое значение (×1.000) — ячейка [0][0]. Жёлтым — больше базы.</div>`
  return html
}

function renderCrit(): string {
  const c = store.getState().calcs
  const cr = (c.crCR || 5) / 100
  const cd = (c.crCD || 50) / 100
  const n = c.crRolls || 10
  const r = critOptimal(cr, cd, n)
  return `<table class="calcTable">
    <tr><th>Параметр</th><th>Значение</th></tr>
    <tr><td>Сейчас: CR / CD</td><td class="num">${fmtPct(cr)} / ${fmtPct(cd)}</td></tr>
    <tr><td>CV сейчас (CR×CD)</td><td class="num">${(r.cvNow * 100).toFixed(2)}%</td></tr>
    <tr><td>Оптимально: КШ → ${r.crRolls.toFixed(1)} подкотов</td><td class="num">${fmtPct(cr + r.crRolls * 0.0324)}</td></tr>
    <tr><td>Оптимально: КУ → ${r.cdRolls.toFixed(1)} подкотов</td><td class="num">${fmtPct(cd + r.cdRolls * 0.0648)}</td></tr>
    <tr><td>CV после</td><td class="num">${(r.cvAfter * 100).toFixed(2)}%</td></tr>
    <tr class="total"><td>Множитель крита после</td><td class="num">×${r.multAfter.toFixed(3)}</td></tr>
  </table>
  <div class="dim" style="margin-top:6px">Roll'ы: КШ +3.24%, КУ +6.48% (высокий тир). Максимизация CV = CR × CD.</div>`
}

function renderSpeed(): string {
  const c = store.getState().calcs
  const spd = c.sSPD || 120
  const cycles = c.sCycles || 4
  const budget = 150 * cycles // MoC standard

  let html = '<table class="calcTable"><tr><th>Метрика</th><th>Значение</th></tr>'
  html += `<tr><td>SPD</td><td class="num">${spd}</td></tr>`
  html += `<tr><td>Действий за ${cycles} циклов (MoC ${budget} AV)</td><td class="num">${actionsIn(spd, budget)}</td></tr>`

  // action advance
  const advPct = c.sAdv || 0
  if (advPct > 0) {
    const eff = spd * advanceAsSpeed(advPct / 100)
    html += `<tr><td>Эффективная SPD (после +${advPct}%)</td><td class="num">${eff.toFixed(1)}</td></tr>`
    html += `<tr><td>Действий за ${cycles} циклов (с advance)</td><td class="num">${actionsIn(eff, budget)}</td></tr>`
  }

  html += '</table>'

  // breakpoint table
  html += '<div style="margin-top:12px"><b>SPD breakpoints (MoC, 150 AV/цикл)</b></div>'
  html += '<table class="calcTable"><tr><th>Действий</th><th>Цикл 1</th><th>Цикл 2</th><th>Цикл 3</th><th>Цикл 4</th></tr>'
  for (let n = 1; n <= 8; n++) {
    const b1 = minSpdFor(n, 150), b2 = minSpdFor(n, 250), b3 = minSpdFor(n, 350), b4 = minSpdFor(n, 450)
    html += `<tr><td>${n}</td><td class="num">${b1}</td><td class="num">${b2}</td><td class="num">${b3}</td><td class="num">${b4}</td></tr>`
  }
  html += '</table>'

  // threshold list
  html += '<div style="margin-top:8px" class="dim">'
  html += MOCTHRESHOLDS.map(s => `<span style="display:inline-block;margin:0 6px 4px 0;padding:2px 6px;background:#1b2230;border-radius:4px;font-family:monospace;font-size:12px">${s}</span>`).join(' ')
  html += '</div>'

  return html
}

function renderDefSection(): string {
  const c = store.getState().calcs
  const attLvl = c.cAttLvl || 80
  const eLvl = c.eLvl || 95
  const vuln = (c.eVuln || 0) / 100

  let html = '<table class="calcTable"><tr><th>−DEF%</th><th>Множитель</th><th>Прирост</th></tr>'
  const baseD = rawDefMult(attLvl, eLvl, 1)
  for (let i = 0; i <= 10; i++) {
    const shred = i * 10
    const m = rawDefMult(attLvl, eLvl, 1 - shred / 100)
    const gain = m / baseD
    html += `<tr><td>${shred}%</td><td class="num">${m.toFixed(4)}</td><td class="num">${gain > 1 ? '+' : ''}${((gain - 1) * 100).toFixed(1)}%</td></tr>`
  }
  html += '</table>'

  if (vuln > 0) {
    const eq = vulnEquivDefShred(vuln, attLvl, eLvl)
    html += `<div style="margin-top:8px">Vuln ${fmtPct(vuln)} ≈ −DEF ${fmtPct(eq)}</div>`
  }

  // RES section
  html += '<div style="margin-top:16px"><b>RES шред</b></div>'
  html += '<table class="calcTable"><tr><th>Баз. RES</th><th>Шред</th><th>Множитель</th><th>Прирост</th></tr>'
  const resSteps = [0, 0.10, 0.20, 0.30, 0.40, 0.60]
  const shredSteps = [0, 0.10, 0.20, 0.30, 0.40]
  for (const rs of resSteps) {
    for (const sh of shredSteps) {
      const b = Math.max(0.001, 1 - rs)
      const mult = (b + sh) / b
      const gain = resGain(rs, sh)
      html += `<tr><td>${fmtPct(rs)}</td><td>-${fmtPct(sh)}</td><td class="num">×${mult.toFixed(3)}</td><td class="num">+${((gain - 1) * 100).toFixed(1)}%</td></tr>`
    }
  }
  html += '</table>'

  // Broken
  html += '<div style="margin-top:16px"><b>Broken state</b></div>'
  html += '<table class="calcTable"><tr><th>Состояние</th><th>Множитель</th><th>Прирост</th></tr>'
  html += '<tr><td>Не broken</td><td class="num">×0.900</td><td class="num">—</td></tr>'
  html += '<tr><td>Broken</td><td class="num">×1.000</td><td class="num">+11.1%</td></tr>'
  html += '</table>'

  return html
}

function renderSuperBreak(p: CalcProfile, e: CalcEnemy): string {
  const c = store.getState().calcs
  const tough = c.sbTough || 10
  const abilMult = (c.sbAbil || 100) / 100
  const dmg = superBreakHit(p, e, tough, abilMult)
  const breakDmg = breakDamage('Fire', p.attLevel, c.eMaxTough || 180, p.be)

  let html = '<table class="calcTable"><tr><th>Параметр</th><th>Значение</th></tr>'
  html += `<tr><td>Super Break DMG</td><td class="num">${fmtN(dmg)}</td></tr>`
  html += `<tr><td>Break DMG (Fire, max toughness, LM=${p.attLevel})</td><td class="num">${fmtN(breakDmg)}</td></tr>`
  html += '</table>'
  html += `<div class="dim" style="margin-top:6px">Super Break: (tough/10) × LM × abilityMult × (1+BE) × defM × resM × vulnM</div>`
  return html
}

// input id → store key (number/string/boolean variants)
const NUM_FIELDS: Record<string, keyof CalcsState> = {
  cAttLvl: 'cAttLvl', cAtk: 'cAtk', cAtkPct: 'cAtkPct', cSPD: 'cSPD',
  cCR: 'cCR', cCD: 'cCD', cDMG: 'cDMG', cBE: 'cBE',
  eLvl: 'eLvl', eRES: 'eRES', eVuln: 'eVuln', eDEF: 'eDEF', eMaxTough: 'eMaxTough',
  hMult: 'hMult', crCR: 'crCR', crCD: 'crCD', crRolls: 'crRolls',
  sSPD: 'sSPD', sCycles: 'sCycles', sAdv: 'sAdv', sbTough: 'sbTough', sbAbil: 'sbAbil',
}
const SEL_FIELDS: Record<string, keyof CalcsState> = { cKit: 'cKit', gKeyA: 'gKeyA', gKeyB: 'gKeyB' }

export function initCalcs(): void {
  const root = document.getElementById('calcRoot')
  if (!root) return
  const c = store.getState().calcs

  // build profile + enemy + section shells
  let kitOpts = KITS.map(k => `<option value="${k.id}">${k.name}</option>`).join('')
  let gridOptsA = GRID_KEYS.map(k => `<option value="${k}">${GRID_KEY_LABELS[k]}</option>`).join('')
  let gridOptsB = gridOptsA

  const V = (k: keyof CalcsState) => String(c[k])
  const CHK = (k: 'eBroken') => c[k] ? ' checked' : ''
  root.innerHTML = [
    '<section class="panel-section">',
    '  <h2>Профиль атакующего</h2>',
    '  <div class="row">',
    `    <label>Кит: <select id="cKit"><option value="">—</option>${kitOpts}</select></label>`,
    `    <label>Уровень: <input id="cAttLvl" type="number" value="${V('cAttLvl')}" min="1" max="95"></label>`,
    `    <label>АТК (база): <input id="cAtk" type="number" value="${V('cAtk')}" min="0"></label>`,
    `    <label>АТК %: <input id="cAtkPct" type="number" value="${V('cAtkPct')}" min="0" max="999" step="0.1"></label>`,
    `    <label>SPD: <input id="cSPD" type="number" value="${V('cSPD')}" min="1"></label>`,
    '  </div>',
    '  <div class="row">',
    `    <label>Крит. шанс %: <input id="cCR" type="number" value="${V('cCR')}" min="0" max="100" step="0.1"></label>`,
    `    <label>Крит. урон %: <input id="cCD" type="number" value="${V('cCD')}" min="0" max="999" step="0.1"></label>`,
    `    <label>Урон % (DMG): <input id="cDMG" type="number" value="${V('cDMG')}" min="0" max="999" step="0.1"></label>`,
    `    <label>Break Effect %: <input id="cBE" type="number" value="${V('cBE')}" min="0" max="999" step="0.1"></label>`,
    '  </div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Враг</h2>',
    '  <div class="row">',
    `    <label>Уровень: <input id="eLvl" type="number" value="${V('eLvl')}" min="1" max="120"></label>`,
    `    <label>RES %: <input id="eRES" type="number" value="${V('eRES')}" min="0" max="100" step="0.1"></label>`,
    `    <label>Vuln %: <input id="eVuln" type="number" value="${V('eVuln')}" min="0" max="999" step="0.1"></label>`,
    `    <label>−DEF %: <input id="eDEF" type="number" value="${V('eDEF')}" min="0" max="100" step="0.1"></label>`,
    `    <label><input id="eBroken" type="checkbox"${CHK('eBroken')}> Broken</label>`,
    '  </div>',
    '  <div class="row">',
    `    <label>Max Toughness: <input id="eMaxTough" type="number" value="${V('eMaxTough')}" min="0"></label>`,
    '  </div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Разбор урона</h2>',
    '  <div class="row">',
    `    <label>Множитель способности: <input id="hMult" type="number" value="${V('hMult')}" min="0" step="1" style="width:80px"> %</label>`,
    '  </div>',
    '  <div id="hitResult"></div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Сравнение статов (× от базы)</h2>',
    '  <div class="row">',
    `    <label>Ось A: <select id="gKeyA">${gridOptsA}</select></label>`,
    `    <label>Ось B: <select id="gKeyB">${gridOptsB}</select></label>`,
    '  </div>',
    '  <div id="gridResult"></div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Оптимизация критов</h2>',
    '  <div class="row">',
    `    <label>КШ %: <input id="crCR" type="number" value="${V('crCR')}" min="0" max="100" step="0.1"></label>`,
    `    <label>КУ %: <input id="crCD" type="number" value="${V('crCD')}" min="0" max="999" step="0.1"></label>`,
    `    <label>Подкотов: <input id="crRolls" type="number" value="${V('crRolls')}" min="0" max="100"></label>`,
    '  </div>',
    '  <div id="critResult"></div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Скорость (MoC)</h2>',
    '  <div class="row">',
    `    <label>SPD: <input id="sSPD" type="number" value="${V('sSPD')}" min="1"></label>`,
    `    <label>Циклов: <input id="sCycles" type="number" value="${V('sCycles')}" min="1" max="20"></label>`,
    `    <label>Advance %: <input id="sAdv" type="number" value="${V('sAdv')}" min="0" max="100" step="0.1"></label>`,
    '  </div>',
    '  <div id="spdResult"></div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Защита / RES / Vulnerability</h2>',
    '  <div id="defResult"></div>',
    '</section>',
    '<section class="panel-section">',
    '  <h2>Break / Super Break</h2>',
    '  <div class="row">',
    `    <label>Toughness reduced: <input id="sbTough" type="number" value="${V('sbTough')}" min="0"></label>`,
    `    <label>Ability mult %: <input id="sbAbil" type="number" value="${V('sbAbil')}" min="0" step="1"></label>`,
    '  </div>',
    '  <div id="sbResult"></div>',
    '</section>',
  ].join('\n')

  // cKit value restore (not part of build loop above)
  EL<HTMLSelectElement>('cKit').value = c.cKit
  EL<HTMLSelectElement>('gKeyA').value = c.gKeyA
  EL<HTMLSelectElement>('gKeyB').value = c.gKeyB

  // kit defaults
  EL('cKit').onchange = () => {
    const sel = EL<HTMLSelectElement>('cKit')
    const kit = KITS.find(k => k.id === sel.value)
    if (!kit) return
    const bases: Partial<CalcsState> = {
      cAtk: kit.base.atk, cSPD: kit.base.spd,
      cCR: (kit.base.critRate ?? 0.05) * 100, cCD: (kit.base.critDmg ?? 1) * 100,
    }
    for (const k of ['cAtk', 'cSPD', 'cCR', 'cCD'] as const) EL(k).value = String(bases[k])
    for (const [k, v] of Object.entries(bases)) store.dispatch({ type: 'calcs/set', key: k as keyof CalcsState, value: v })
  }

  const render = () => {
    const p = readProfile(), e = readEnemy()
    const mult = (store.getState().calcs.hMult || 100) / 100
    EL('hitResult')!.innerHTML = renderHit({ ...p, atk: p.atk * mult }, e)
    EL('gridResult')!.innerHTML = renderGrid(p, e)
    EL('critResult')!.innerHTML = renderCrit()
    EL('spdResult')!.innerHTML = renderSpeed()
    EL('defResult')!.innerHTML = renderDefSection()
    EL('sbResult')!.innerHTML = renderSuperBreak(p, e)
  }

  const onEvt = (e: Event) => {
    const t = e.target as HTMLInputElement
    let key: keyof CalcsState | undefined
    let value: number | string | boolean
    if (t.type === 'checkbox') { key = 'eBroken'; value = t.checked }
    else if (t.id in SEL_FIELDS) { key = SEL_FIELDS[t.id]; value = t.value }
    else if (t.id in NUM_FIELDS) { key = NUM_FIELDS[t.id]; value = parseFloat(t.value) || 0 }
    else return
    store.dispatch({ type: 'calcs/set', key, value })
    render()
  }

  root.addEventListener('input', onEvt)
  root.addEventListener('change', onEvt)
  render()
}