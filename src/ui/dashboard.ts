/**
 * §84.4 — Dashboard / Overview.
 *
 * §84.4 is deliberately a *projection of real registries*, not a second coverage engine:
 * every tile reads a live project registry (`KITS`, `gearRegistry()`, `enemyCoverageSummary()`,
 * `CAPABILITIES`) and each tile deep-links to the screen that holds the full report — a summary
 * must open the underlying detailed report, never end there. Values that the browser genuinely
 * cannot compute (requirement/spec coverage, suite results) are shown as a named capability with
 * its status + reason instead of an estimate (rule 84.1).
 */
import { KITS } from '../core/kits'
import { gearRegistry, type GearEntry, type GearKind, type GearStatus } from '../verification/gearCoverage'
import { enemyCoverageSummary } from '../core/enemy/coverage'
import { CAPABILITIES, type CapabilityStatus } from './capabilities'
import { navigate } from './shell'
import { store } from './store'
import { rulesHash, rulesSnapshot } from '../verification/meta/rules'
import { button, dmg, emptyState, kv, n, row, table, title } from './render'
import { el } from './dom'

const GEAR_LABEL: Record<GearKind, string> = { cone: 'Light Cones', relic: 'Реликвии', planar: 'Планары' }
const GEAR_ROUTE: Record<GearKind, string> = { cone: 'gear', relic: 'gear', planar: 'gear' }

function tile(head: string, value: string, detail: string, onClick: () => void): HTMLElement {
  const t = el('button', 'tile')
  const h = el('div', 'tileValue'); h.textContent = value
  const l = el('div', 'tileLabel'); l.textContent = head
  const d = el('div', 'tileDetail'); d.textContent = detail
  t.append(l, h, d)
  t.onclick = onClick
  return t
}

function gearStatusLine(entries: GearEntry[]): string {
  const by: Record<GearStatus, number> = { verified: 0, partial: 0, unverified: 0, blocked: 0 }
  for (const e of entries) by[e.status] += 1
  return `${by.verified} verified · ${by.partial} partial · ${by.unverified} unverified · ${by.blocked} blocked`
}

function capabilitiesTable(): HTMLElement {
  const byStatus: Record<CapabilityStatus, number> = { available: 0, partial: 0, unavailable: 0 }
  for (const c of CAPABILITIES) byStatus[c.status] += 1
  const rows = CAPABILITIES.map(c => [c.label, c.status, c.reason ?? '—'])
  const wrap = el('div')
  wrap.append(
    row(
      tile('Available', String(byStatus.available), 'полный backend', () => navigate('verification')),
      tile('Partial', String(byStatus.partial), 'ограниченный запуск', () => navigate('verification')),
      tile('Unavailable', String(byStatus.unavailable), 'требуется CLI', () => navigate('verification')),
    ),
    table(['Возможность', 'Статус', 'Ограничение / причина'], rows),
  )
  return wrap
}

function reproBlock(): HTMLElement {
  const s = store.getState()
  const last = s.results ?? s.history[s.history.length - 1]
  const wrap = el('div')
  if (!last) {
    wrap.append(emptyState('Прогонов ещё нет — запустите бой в «Симуляторе».'))
    return wrap
  }
  const snap = rulesSnapshot(last.setup)
  const r: any = last
  wrap.append(kv([
    ['Прогон', s.results ? 'последний' : `#${r.id} ${r.label}`],
    ['seed', snap.overrides.seed],
    ['cycles', snap.stage?.cycles ?? last.setup.cycles],
    ['encounter', snap.stage?.encounter ?? 'setup'],
    ['rulesHash', rulesHash(snap)],
    ['engine', snap.engine],
    ['rules', snap.rules],
    ['dataset', snap.dataset],
    ['событий в трассе', n(last.sim.logger.events.length, 0)],
  ]))
  const go = button('Открыть в «Анализ боя»', () => navigate('analysis'))
  wrap.append(go)
  return wrap
}

export function initDashboard(): void {
  const root = document.getElementById('dashboard')
  if (!root) return
  root.innerHTML = ''

  root.append(title('С чего начать', 'Настройте отряд → выберите врагов → запустите бой → разберите результат'))
  root.append(row(
    tile('1 · Отряд и билды', `${KITS.length} персонажей`, 'Выберите персонажей и настройте их', () => navigate('team')),
    tile('2 · Враги', 'Волны', 'Настройте противников и условия боя', () => navigate('encounter')),
    tile('3 · Запустить бой', '▶', 'Автоматический или пошаговый режим', () => navigate('battle')),
    tile('4 · Результат', 'Урон и ходы', 'Лог, сводка и состояние после боя', () => navigate('results')),
    tile('Разобрать бой', 'Анализ', 'Причины урона и вклад персонажей', () => navigate('analysis')),
    tile('Подобрать билд', 'Оптимизация', 'Поиск с явными ограничениями', () => navigate('optimizer')),
  ))

  root.append(title('Каталог и покрытие', 'Сводные данные проекта; подробности доступны в соответствующих разделах'))
  const reg = gearRegistry()
  const cones = reg.filter(e => e.kind === 'cone')
  const relics = reg.filter(e => e.kind === 'relic')
  const planars = reg.filter(e => e.kind === 'planar')
  const enf = enemyCoverageSummary()
  root.append(row(
    tile('Киты (roster)', String(KITS.length), 'детально — Verification', () => navigate('verification')),
    tile(GEAR_LABEL.cone, String(cones.length), gearStatusLine(cones), () => navigate(GEAR_ROUTE.cone)),
    tile(GEAR_LABEL.relic, String(relics.length), gearStatusLine(relics), () => navigate(GEAR_ROUTE.relic)),
    tile(GEAR_LABEL.planar, String(planars.length), gearStatusLine(planars), () => navigate(GEAR_ROUTE.planar)),
    tile('Враги (behavior)', `${enf.behavioral}/${enf.bases}`, `${enf.records} записей каталога`, () => navigate('catalog')),
  ))

  root.append(title('Последний прогон', 'Параметры, по которым можно повторить симуляцию'))
  root.append(reproBlock())

  root.append(title('Технические возможности', 'Справка для продвинутой проверки; ограничения показаны явно'))
  root.append(capabilitiesTable())

  const dmgHint = el('div', 'wsHint')
  dmgHint.textContent = `Урон в плитках не показывается: сводка должна открывать отчёт, а не подменять его. Формат чисел: ${dmg(1234567)}.`
  root.append(dmgHint)
}
