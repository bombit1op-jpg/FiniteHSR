import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { badge, statusBadge, table, kv, jsonBlock, title, emptyState } from '../../src/ui/render'
import { fillSelect } from '../../src/ui/dom'
import { initShell, showStatus, withBusy, ROUTES } from '../../src/ui/shell'
import { initCatalog } from '../../src/ui/catalog'
import { capability } from '../../src/ui/capabilities'
import { KITS } from '../../src/core/kits'

/**
 * §84 G6 — DOM render-state coverage on the main path. happy-dom stands in for the browser so the
 * shell status surface (loading/error), the capability notice/badge (§84.1), the catalog page
 * (happy path + empty-filter state) and the shared render primitives are exercised as rendered DOM,
 * not hand-checked. Pure logic lives in the sibling suites; this one owns the DOM edges.
 */
export default async () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event
  g.location = (win as unknown as { location: unknown }).location

  const cases = [
    // ---------------------------------------------------------------- primitives
    raw('badge carries a text label, never colour alone (§84.2)', badge('FAIL', 'fail').textContent === 'FAIL', badge('FAIL', 'fail').textContent ?? ''),
    raw('badge sets its semantic state on the data-attribute', badge('x', 'warn').dataset.s === 'warn', String(badge('x', 'warn').dataset.s)),
    raw('statusBadge maps PASS to pass', statusBadge('PASS').dataset.s === 'pass'),
    raw('statusBadge maps FAIL to fail', statusBadge('FAIL').dataset.s === 'fail'),
    raw('statusBadge maps BLOCKED / UNAVAILABLE to blocked', statusBadge('BLOCKED').dataset.s === 'blocked' && statusBadge('UNAVAILABLE').dataset.s === 'blocked'),
    raw('statusBadge maps PARTIAL to warn', statusBadge('PARTIAL').dataset.s === 'warn'),
    raw('statusBadge maps UNKNOWN to neutral', statusBadge('UNKNOWN').dataset.s === 'neutral'),
    raw('statusBadge maps an unrecognised status to info', statusBadge('WEIRD').dataset.s === 'info'),
    raw('table renders N/A for a missing cell (§84.2 honesty)', table(['A'], [[null]]).querySelector('td')?.textContent === 'N/A'),
    raw('table marks a missing cell dim', !!table(['A'], [[null]]).querySelector('td.dim')),
    raw('kv skips undefined rows', kv([['a', '1'], ['b', undefined]]).querySelectorAll('tbody tr').length === 1),
    raw('jsonBlock keeps the exact payload, no re-derivation', jsonBlock('p', { x: 1 }).querySelector('pre')?.textContent === JSON.stringify({ x: 1 }, null, 2)),
    raw('title with a hint wraps heading + hint', !!title('T', 'h').querySelector('h3') && !!title('T', 'h').querySelector('.wsHint')),
    raw('emptyState carries its message', emptyState('пусто').textContent === 'пусто'),
  ]

  const sel = doc.createElement('select')
  fillSelect(sel as HTMLSelectElement, [['a', 'A'], ['b', 'B']])
  cases.push(raw('fillSelect emits one option per entry', sel.querySelectorAll('option').length === 2, String(sel.querySelectorAll('option').length)))

  // ---------------------------------------------------------------- shell status surface
  doc.body.innerHTML = '<div id="navRail"></div><div id="versionBar"></div><div id="statusBar"></div>'
  initShell()
  const bar = doc.getElementById('statusBar') as HTMLElement
  const expectBadges = ROUTES.filter(r => r.capability && capability(r.capability)?.status !== 'available').length

  cases.push(
    raw('nav rail renders one button per route', doc.querySelectorAll('#navRail .nav-btn').length === ROUTES.length, `${doc.querySelectorAll('#navRail .nav-btn').length}/${ROUTES.length}`),
    raw('version bar shows engine/rules/data chips (§84.1.5)', doc.querySelectorAll('#versionBar .verChip').length === 3),
    raw('routes backed by a non-available capability get a status badge', doc.querySelectorAll('#navRail .nav-badge').length === expectBadges, `${doc.querySelectorAll('#navRail .nav-badge').length}/${expectBadges}`),
  )

  showStatus('Загрузка…', 'loading')
  cases.push(raw('showStatus sets text + kind=loading', bar.textContent === 'Загрузка…' && bar.dataset.kind === 'loading', `${bar.textContent}/${bar.dataset.kind}`))
  showStatus('')
  cases.push(raw('empty status hides the bar', bar.style.display === 'none', bar.style.display))

  const okOut = await withBusy('Работа…', () => 42)
  cases.push(raw('withBusy returns the work result', okOut === 42, String(okOut)))
  cases.push(raw('withBusy clears the status on success', bar.style.display === 'none', bar.style.display))
  const failOut = await withBusy('Работа…', () => { throw new Error('boom') })
  cases.push(raw('withBusy surfaces errors as an error status', failOut === undefined && bar.dataset.kind === 'error' && /ОШИБКА/.test(bar.textContent), `${bar.dataset.kind}/${bar.textContent}`))
  cases.push(raw('withBusy restores the busy class', !doc.body.classList.contains('busy')))

  // ---------------------------------------------------------------- catalog page: happy path + empty
  doc.body.innerHTML = '<div id="catalogWs"></div>'
  initCatalog()
  const cat = doc.getElementById('catalogWs') as HTMLElement
  const tables = cat.querySelectorAll('table')
  const rows = tables[1]?.querySelectorAll('tbody tr').length ?? 0
  cases.push(
    raw('catalog renders the summary + entry tables', tables.length === 2, `${tables.length} tables`),
    raw('catalog lists every kit in the default view', rows === KITS.length, `${rows}/${KITS.length}`),
    raw('catalog shows its read-only badge', cat.querySelector('.badge')?.textContent === 'только чтение', cat.querySelector('.badge')?.textContent ?? ''),
    raw('catalog dumps the first entry as an exact raw object', !!cat.querySelector('details.jsonBlock pre')?.textContent),
  )

  const search = cat.querySelector('input[type="search"]') as HTMLInputElement
  search.value = 'zzz-no-such-entry'
  search.dispatchEvent(new (win as unknown as { Event: new (t: string) => Event }).Event('input'))
  cases.push(raw('catalog shows the empty-filter state', cat.querySelector('.emptyState')?.textContent === 'Нет записей под фильтром.', cat.querySelector('.emptyState')?.textContent ?? ''))

  return cases
}
