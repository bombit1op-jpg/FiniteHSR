/**
 * §84.14 — Verification / Coverage workspace.
 *
 * Shows what the BROWSER can honestly show:
 *  - gear coverage registry (`gearRegistry` / `gearCoverageReport`) — real project data, filterable;
 *  - the capability table (which backends exist and their status + reason);
 *  - a determinism check that re-runs the last setup and compares the §38 event/state hashes;
 *  - the versions/rules snapshot a replay needs.
 * Requirement/spec-suite coverage (needs disk fixtures) is reported as a capability with a reason,
 * never estimated (rule 84.1).
 */
import { gearRegistry, gearCoverageReport, type GearEntry, type GearStatus } from '../verification/gearCoverage'
import { KITS } from '../core/kits'
import { runBattle } from '../core/battle'
import { CAPABILITIES, type CapabilityStatus } from './capabilities'
import { navigate } from './shell'
import { rulesHash, rulesSnapshot, ENGINE_VERSION, RULES_VERSION, DATASET_VERSION } from '../verification/meta/rules'
import { store } from './store'
import { withBusy } from './shell'
import { badge, button, emptyState, jsonBlock, kv, label, n, row, select, table, title, type Status } from './render'
import { el } from './dom'

const STATUS_UI: Record<CapabilityStatus, Status> = { available: 'pass', partial: 'warn', unavailable: 'fail' }

export function initVerification(): void {
  const root = document.getElementById('verificationWs')
  if (!root) return
  root.innerHTML = ''

  // ---------------------------------------------------------------- capabilities
  root.append(title('Возможности backend (§84.1)', 'статус + причина; partial/unavailable не подменяются stub-числами'))
  root.append(table(
    ['id', 'группа', 'статус', 'backend', 'причина / ограничение'],
    CAPABILITIES.map(c => [c.id, c.group, badge(c.status, STATUS_UI[c.status]), c.backend.join(' , '), c.reason ?? '—']),
  ))

  // ---------------------------------------------------------------- gear coverage
  const reg = gearRegistry()
  const statusLine = (rows: GearEntry[]): string => {
    const by: Record<GearStatus, number> = { verified: 0, partial: 0, unverified: 0, blocked: 0 }
    for (const r of rows) by[r.status] += 1
    return `${by.verified} verified · ${by.partial} partial · ${by.unverified} unverified · ${by.blocked} blocked`
  }
  const kind = (k: GearEntry['kind']): GearEntry[] => reg.filter(e => e.kind === k)
  root.append(title('Покрытие экипировки (реестр)', 'gearRegistry() — реальные данные проекта'))
  root.append(kv([
    ['KITS (roster)', n(KITS.length, 0)],
    ['Light Cones', `${kind('cone').length} — ${statusLine(kind('cone'))}`],
    ['Реликвии', `${kind('relic').length} — ${statusLine(kind('relic'))}`],
    ['Планары', `${kind('planar').length} — ${statusLine(kind('planar'))}`],
  ]))

  const kindSel = select([['all', 'все'], ['cone', 'cone'], ['relic', 'relic'], ['planar', 'planar']])
  const statusSel = select([['all', 'любой status'], ['verified', 'verified'], ['partial', 'partial'], ['unverified', 'unverified'], ['blocked', 'blocked']])
  const gearBody = el('div', 'wsBody')
  const drawGear = (): void => {
    const rows = reg.filter(e => (kindSel.value === 'all' || e.kind === kindSel.value) && (statusSel.value === 'all' || e.status === statusSel.value))
    gearBody.innerHTML = ''
    gearBody.append(
      row(badge(`показано: ${rows.length} из ${reg.length}`, 'neutral')),
      rows.length ? table(['id', 'kind', 'status'], rows.map(e => [e.id, e.kind, badge(e.status, e.status === 'verified' ? 'pass' : e.status === 'blocked' ? 'fail' : 'warn')])) : emptyState('Нет записей под фильтром.'),
    )
  }
  kindSel.onchange = drawGear
  statusSel.onchange = drawGear
  root.append(title('Реестр экипировки (с фильтром)', 'gearRegistry()'))
  root.append(row(label('Тип', kindSel), label('Статус', statusSel)))
  root.append(gearBody)

  root.append(title('Отчёт покрытия (verbatim)', 'gearCoverageReport() — текст backend, не пересчёт'))
  const pre = el('pre', 'log'); pre.textContent = gearCoverageReport(reg); root.append(pre)
  root.append(jsonBlock('gearRegistry (verbatim)', reg))

  // ---------------------------------------------------------------- determinism
  const detBox = el('div', 'wsBody')
  const check = button('Проверить детерминизм (повторный прогон последнего setup)', async () => {
    await withBusy('Детерминизм: повторный прогон…', () => {
      detBox.innerHTML = ''
      const s = store.getState()
      const rec = s.results ?? s.history[s.history.length - 1]
      if (!rec) { detBox.append(emptyState('Прогонов нет: запустите бой в «Симуляторе».')); return }
      const a = rec.sim
      const b = runBattle(rec.setup)
      const aEvents = a.logger.eventHash(); const bEvents = b.logger.eventHash()
      const aState = a.logger.hash(); const bState = b.logger.hash()
      const ok = aEvents === bEvents && aState === bState
      detBox.append(kv([
        ['seed', String(rec.setup.seed)],
        ['eventHash (original)', aEvents],
        ['eventHash (re-run)', bEvents],
        ['stateHash (original)', aState],
        ['stateHash (re-run)', bState],
        ['rulesHash', rulesHash(rulesSnapshot(rec.setup))],
      ]))
      detBox.append(row(badge(ok ? 'ДЕТЕРМИНИЗМ OK: повторный прогон совпал' : 'РАСХОЖДЕНИЕ: хэши отличаются', ok ? 'pass' : 'fail')))
      if (!ok) {
        const h = el('div', 'wsHint')
        h.textContent = 'Смотрите «Сравнение» → firstDivergence (§77.10): первое расхождение по сигнатурам событий.'
        detBox.append(h)
      }
    })
  }, 'btn-primary')
  root.append(title('Детерминизм (§80.3 / §32)', 'тот же setup + seed → тот же eventHash/stateHash'))
  root.append(row(check))
  root.append(detBox)

  // ---------------------------------------------------------------- versions / replay metadata
  root.append(title('Версии и реплей-метаданные (§21.4 / §32)', 'то, что делает прогон воспроизводимым'))
  root.append(kv([
    ['ENGINE_VERSION', ENGINE_VERSION],
    ['RULES_VERSION', RULES_VERSION],
    ['DATASET_VERSION', DATASET_VERSION],
    ['KITS', n(KITS.length, 0)],
    ['gear записей', n(reg.length, 0)],
  ]))
  root.append(row(
    button('Открыть «Отклонения» →', () => navigate('deviations')),
    button('Открыть «Каталог данных» →', () => navigate('catalog')),
  ))

  drawGear()
}

export function renderVerification(): void {
  // static workspace; no per-activation refresh needed
}
