import { ENEMY_PRESETS } from '../core/battle'
import { el, fillSelect } from './dom'
import { store } from './store'
import type { ModState } from './store'

const STAT_OPTIONS = [
  'atkPct', 'hpPct', 'defPct', 'spdPct', 'critRate', 'critDmg', 'be', 'ehr', 'err',
  'dmgAll', 'resPenAll', 'defIgnore', 'weaken',
  // target-side
  'vulnAll', 'dotVuln', 'defRed', 'spdDown', 'mitigation',
]

let modSeq = 0

export function addManualModRow(): void {
  const box = document.getElementById('modRows')!
  const id = `m${modSeq++}`
  const row = el('div', 'modRow')
  const stat = el('select') as HTMLSelectElement
  fillSelect(stat, STAT_OPTIONS.map(s => [s, s]))
  const value = el('input') as HTMLInputElement
  value.type = 'number'; value.step = 'any'; value.value = '0.3'; value.title = 'доля: 0.3 = +30%'
  const side = el('select') as HTMLSelectElement
  fillSelect(side, [['ally', 'отряду'], ['enemy', 'врагам']])
  const x = el('button', 'del')
  x.textContent = '✕'
  x.onclick = () => {
    store.dispatch({ type: 'mods/remove', id })
    row.remove()
  }
  const sync = () => store.dispatch({ type: 'mods/update', id, patch: { stat: stat.value, value: Number(value.value) || 0, side: side.value } })
  stat.onchange = sync
  value.oninput = sync
  side.onchange = sync
  row.append(stat, value, side, x)
  box.append(row)
  store.dispatch({ type: 'mods/add', mod: { id, stat: stat.value, value: Number(value.value) || 0, side: side.value } as ModState })
}

export function enemyFormInit(): void {
  const box = document.getElementById('enemyCfg')!
  const st = store.getState().enemy

  const presetSel = el('select') as HTMLSelectElement
  const groups: Array<[string, string[]]> = [
    ['Базовые', ['mob', 'elite', 'boss']],
    ['Memory of Chaos', ['moc12_boss', 'moc12_add']],
    ['Pure Fiction', ['pf_swarm', 'pf_elite']],
    ['Apocalyptic Shadow', ['as_boss']],
  ]
  for (const [g, keys] of groups) {
    const og = el('optgroup'); og.label = g
    for (const k of keys) {
      const o = el('option'); o.value = k; o.textContent = ENEMY_PRESETS[k].name
      og.append(o)
    }
    presetSel.append(og)
  }
  presetSel.value = st.preset
  const countInp = el('input') as HTMLInputElement
  countInp.type = 'number'; countInp.value = String(st.count); countInp.min = '1'; countInp.max = '5'
  const weakInp = el('input') as HTMLInputElement
  weakInp.value = st.weaknesses.join(',')
  weakInp.title = 'Слабости через запятую: Physical,Fire,Ice,Lightning,Wind,Quantum,Imaginary'
  const effResInp = el('input') as HTMLInputElement
  effResInp.type = 'number'; effResInp.step = 'any'; effResInp.value = String(st.effRes)
  effResInp.title = 'Effect RES врагов (0–0.8)'

  const wrap = el('label'); wrap.textContent = 'Пресет'; wrap.append(presetSel)
  const w2 = el('label'); w2.textContent = 'Кол-во'; w2.append(countInp)
  const w3 = el('label'); w3.textContent = 'Weaknesses'; w3.append(weakInp)
  const w4 = el('label'); w4.textContent = 'Eff.RES'; w4.append(effResInp)
  presetSel.onchange = () => {
    const p = ENEMY_PRESETS[presetSel.value]
    weakInp.value = p.weaknesses.join(',')
    effResInp.value = String(p.effectRes ?? 0)
    store.dispatch({ type: 'enemy/set', patch: { preset: presetSel.value, weaknesses: p.weaknesses, effRes: p.effectRes ?? 0 } })
  }
  countInp.oninput = () => store.dispatch({ type: 'enemy/set', patch: { count: Number(countInp.value) || 1 } })
  weakInp.oninput = () => store.dispatch({ type: 'enemy/set', patch: { weaknesses: weakInp.value.split(',').map(s => s.trim()).filter(Boolean) } })
  effResInp.oninput = () => store.dispatch({ type: 'enemy/set', patch: { effRes: Number(effResInp.value) || 0 } })
  box.append(wrap, w2, w3, w4)
}