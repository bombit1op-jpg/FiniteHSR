/**
 * §84.15 — Known deviations workspace.
 *
 * The authoritative deviation registry lives in `TODO.md` (§33: deviations are documented,
 * not silently "fixed"). The browser cannot run the CLI gate (`src/verification/deviations.ts`
 * is node/fs), so this workspace reads TODO.md verbatim via `./todoRaw` (vite `define` in the
 * browser, `node:fs` under tsx harnesses), extracts the deviation-related lines, and shows
 * them with the CLI gate's status as a capability.
 * It never invents a PASS for something it did not run.
 */
import { todoRaw } from './todoRaw'
import { badge, button, emptyState, jsonBlock, kv, n, row, table, title } from './render'
import { el } from './dom'
import { capability } from './capabilities'

interface Line { n: number; text: string }

function extract(): Line[] {
  const out: Line[] = []
  todoRaw.split(/\r?\n/).forEach((text, i) => {
    if (/deviat|отклонен|known\b|known-deviation|\[\s\]\s*(known|deviation)/i.test(text)) out.push({ n: i + 1, text: text.trim() })
  })
  return out
}

export function initDeviations(): void {
  const root = document.getElementById('deviationsWs')
  if (!root) return
  root.innerHTML = ''

  const cap = capability('known.deviations')
  const lines = extract()

  root.append(title('Известные отклонения (§33 / §84.15)', 'источник истины — TODO.md; браузер показывает строки как есть'))
  root.append(kv([
    ['capability', cap?.id ?? 'known.deviations'],
    ['status', cap?.status ?? '—'],
    ['причина', cap?.reason ?? '—'],
    ['строк найдено', n(lines.length, 0)],
    ['TODO.md размер', `${n(todoRaw.length, 0)} символов`],
  ]))
  root.append(row(badge('CLI gate deviations.ts — node, вне браузера', 'warn')))

  const all = el('div', 'wsBody')
  const render = (q: string): void => {
    const term = q.trim().toLowerCase()
    const rows: Line[] = term ? lines.filter(l => l.text.toLowerCase().includes(term)) : lines
    all.innerHTML = ''
    all.append(rows.length
      ? table(['TODO.md:строка', 'текст'], rows.map(l => [`${l.n}`, l.text]))
      : emptyState('Совпадений нет.'))
  }
  const q = document.createElement('input')
  q.type = 'search'; q.placeholder = 'фильтр по тексту отклонения…'
  q.oninput = () => render(q.value)

  const hint = el('div', 'wsHint')
  hint.textContent = 'Строки отобраны по ключевым словам (deviat/отклонен/known). Полный список смотрите в TODO.md ниже.'
  root.append(hint)
  root.append(q)
  root.append(all)

  root.append(title('Сырой TODO.md', 'полный текст источника — для сверки с таблицей выше'))
  root.append(jsonBlock('TODO.md (verbatim, усечён в UI по высоте)', todoRaw))

  root.append(row(button('Перечитать страницу', () => initDeviations())))
  render('')
}

export function renderDeviations(): void {
  // static
}
