/**
 * §84.15 — Data catalog workspace.
 *
 * A read-only index of the project's registries (kits, light cones, relic/planar sets,
 * encounter/enemy presets). It lists ids/fields straight from the source objects — no
 * re-derivation, no hidden defaults (rule 84.1). Search is client-side over the real arrays.
 */
import { KITS } from '../core/kits'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import { ENCOUNTER_PRESETS, ENEMY_PRESETS } from '../core/battle'
import { badge, button, emptyState, jsonBlock, kv, label, n, row, select, table, title } from './render'
import { el } from './dom'
import { navigate } from './shell'

type Cat = 'kit' | 'cone' | 'relic' | 'planar' | 'encounter' | 'enemy'

const CATS: Array<[string, string]> = [
  ['kit', 'Персонажи (KITS)'],
  ['cone', 'Light Cones'],
  ['relic', 'Реликвии'],
  ['planar', 'Планары'],
  ['encounter', 'Пресеты боёв'],
  ['enemy', 'Пресеты врагов'],
]

const HEADERS: Record<Cat, string[]> = {
  kit: ['id', 'имя', 'стихия', 'энергия'],
  cone: ['id', 'имя', 'редкость'],
  relic: ['id', 'имя'],
  planar: ['id', 'имя'],
  encounter: ['id', 'режим', 'волн'],
  enemy: ['id', 'имя', 'уровень', 'HP'],
}

interface Entry { id: string; kind: Cat; cols: string[]; raw: unknown }

export function initCatalog(): void {
  const root = document.getElementById('catalogWs')
  if (!root) return
  root.innerHTML = ''

  const entries: Entry[] = [
    ...KITS.map(k => ({ id: k.id, kind: 'kit' as Cat, cols: [k.name, k.elem, `E${k.energyMax}`], raw: k })),
    ...LIGHT_CONES.map(c => ({ id: c.id, kind: 'cone' as Cat, cols: [c.name, `${c.rarity}★`], raw: c })),
    ...RELIC_SETS.map(s => ({ id: s.id, kind: 'relic' as Cat, cols: [s.name], raw: s })),
    ...PLANAR_SETS.map(p => ({ id: p.id, kind: 'planar' as Cat, cols: [p.name], raw: p })),
    ...Object.entries(ENCOUNTER_PRESETS).map(([id, e]) => ({ id, kind: 'encounter' as Cat, cols: [e.mode ?? '—', String(e.waves.length)], raw: e })),
    ...Object.entries(ENEMY_PRESETS).map(([id, e]) => ({ id, kind: 'enemy' as Cat, cols: [e.name, String(e.level), String(e.hp)], raw: e })),
  ]

  root.append(title('Каталог данных (§84.15)', 'реестры проекта как есть; поиск по id/имени — только чтение'))
  root.append(kv([
    ['Персонажи', n(KITS.length, 0)],
    ['Light Cones', n(LIGHT_CONES.length, 0)],
    ['Реликвии', n(RELIC_SETS.length, 0)],
    ['Планары', n(PLANAR_SETS.length, 0)],
    ['Пресеты боёв', n(Object.keys(ENCOUNTER_PRESETS).length, 0)],
    ['Пресеты врагов', n(Object.keys(ENEMY_PRESETS).length, 0)],
  ]))

  const catSel = select(CATS)
  const q = document.createElement('input')
  q.type = 'search'; q.placeholder = 'поиск по id / имени…'
  const countBox = el('div', 'wsHint')
  const listBox = el('div', 'wsBody')
  const rawBox = el('div', 'wsBody')

  const draw = (): void => {
    const cat = catSel.value as Cat
    const term = q.value.trim().toLowerCase()
    const rows = entries.filter(e =>
      e.kind === cat && (!term || e.id.toLowerCase().includes(term) || e.cols.some(c => c.toLowerCase().includes(term))))
    countBox.textContent = `${rows.length} из ${entries.filter(e => e.kind === cat).length} записей (${cat})`
    listBox.innerHTML = ''
    listBox.append(rows.length ? table(HEADERS[cat], rows.map(e => [e.id, ...e.cols])) : emptyState('Нет записей под фильтром.'))
    rawBox.innerHTML = ''
    rawBox.append(jsonBlock(rows[0] ? `${rows[0].kind}:${rows[0].id}` : 'ничего не найдено', rows[0]?.raw ?? null))
  }
  catSel.onchange = draw
  q.oninput = draw

  root.append(row(label('Категория', catSel), label('Поиск', q)))
  root.append(countBox)
  root.append(listBox)
  root.append(title('Сырой объект записи', 'дамп первой строки результата — точный исходный объект'))
  root.append(rawBox)
  root.append(row(
    badge('только чтение', 'neutral'),
    button('Открыть «Сборку» →', () => navigate('build')),
    button('Открыть «Проверку» →', () => navigate('verification')),
  ))

  draw()
}

export function renderCatalog(): void {
  // static; re-init on reload
}
