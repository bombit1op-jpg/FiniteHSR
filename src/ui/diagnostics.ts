/**
 * §84.9/§84.15 — Diagnostics workspace (audit Phase I).
 *
 * Holds what the normal UI deliberately hides:
 *  - per-run internals of the typed event stream: eventId / actionId / traceId / payload ids
 *    (the human action log in results.ts shows none of them — Phase E);
 *  - the committed deviation registry (verification/interactions/manifest.json) with its REAL
 *    statuses. Gate vocabulary is PASS/GAP/BLOCKED/FAIL/PROMOTE (`npm run verify:deviations`);
 *    no other lifecycle labels exist in the codebase and none are invented here.
 *
 * Browser-safe only: store state + statically bundled manifest JSON (rule 84.1 — no fs, no CLI).
 */
import manifest from '../../verification/interactions/manifest.json'
import { emptyState, jsonBlock, kv, statusBadge, table, title } from './render'
import { store } from './store'

/** a debug-5 run can hold thousands of events; the cap is stated in the UI, never silent */
const MAX_EVENT_ROWS = 1000

function runBlock(): HTMLElement {
  const res = store.getState().results
  if (!res) return emptyState('Нет запуска — сделайте бой (вкладка «Симулятор»), здесь появится его event-stream.')
  const { sim, setup } = res
  const events = sim.logger.events
  const types = new Set(events.map(e => e.type))
  const traced = events.filter(e => e.traceId).length

  const wrap = document.createElement('div')
  wrap.append(title('Последний запуск — internals', 'eventId / actionId / traceId и полные payload видны только здесь (§84.9)'))
  wrap.append(kv([
    ['seed', setup.seed],
    ['cycles', setup.cycles],
    ['endReason', sim.endReason],
    ['AV', Math.round(sim.avElapsed)],
    ['events', `${events.length} (${types.size} типов)`],
    ['traceId stamped', `${traced}/${events.length}`],
    ['eventHash', sim.logger.eventHash()],
    ['stateHash', sim.logger.hash()],
  ]))

  if (!events.length) {
    wrap.append(emptyState('События не записаны: в настройках debug level = 0.'))
    return wrap
  }

  const shown = events.slice(0, MAX_EVENT_ROWS)
  const rows = shown.map(e => [
    e.eventId,
    e.time.toFixed(2),
    e.turn,
    e.actionId,
    e.traceId ?? null,
    e.type,
    `${e.source ?? ''}${e.target ? ` → ${e.target}` : ''}`.trim() || null,
    JSON.stringify(e.payload),
  ])
  wrap.append(table(
    ['#', 'AV', 'turn', 'act', 'traceId', 'type', 'source → target', 'payload'],
    rows,
    'diagEvents',
  ))
  if (events.length > shown.length) {
    const more = document.createElement('div')
    more.className = 'wsHint'
    more.textContent = `Показаны первые ${shown.length} из ${events.length} событий (лимит MAX_EVENT_ROWS).`
    wrap.append(more)
  }
  return wrap
}

function deviationBlock(): HTMLElement {
  const kits = manifest.kits
  const byStatus = new Map<string, number>()
  for (const k of kits) byStatus.set(k.status ?? '—', (byStatus.get(k.status ?? '—') ?? 0) + 1)

  const wrap = document.createElement('div')
  wrap.append(title(
    'Реестр документированных отклонений',
    'источник: verification/interactions/manifest.json (коммит, browser-bundled); статусы — реальный словарь gate',
  ))
  wrap.append(kv([
    ['kits', kits.length],
    ['manifest count', manifest.count],
    ...[...byStatus.entries()].map(([s, c]): [string, string] => [s, String(c)]),
  ]))
  wrap.append(table(
    ['Kit', 'Status', 'Evidence'],
    kits.map(k => [
      k.kit,
      statusBadge(k.status ?? 'unknown'),
      jsonBlock(`${k.evidence.length} запись(и)`, k.evidence),
    ]),
    'diagDeviations',
  ))
  return wrap
}

export function initDiagnostics(): void {
  const root = document.getElementById('diagnosticsWs')
  if (!root) return
  root.innerHTML = ''
  root.append(title('Диагностика (§84.9 / §84.15)', 'внутренности запуска и реестр отклонений; обычный UI эти поля скрывает'))
  root.append(runBlock())
  root.append(deviationBlock())
}

export function renderDiagnostics(): void {
  initDiagnostics()
}
