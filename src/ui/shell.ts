/**
 * §84.3 — app shell: grouped left nav rail, hash routing, loading/error surface.
 *
 * UI-only orchestration (rule 84.1): navigation, route activation, and the status/busy
 * surface. It owns no domain logic — panels render themselves. Routes whose backing
 * capability is not fully available show the capability's STATUS + REASON instead of a
 * stub (rule 84.1), sourced from `capabilities.ts`.
 */
import { capability, unavailableReason } from './capabilities'
import { ENGINE_VERSION, RULES_VERSION, DATASET_VERSION } from '../verification/meta/rules'

export interface Route {
  id: string
  label: string
  group: 'WORKSPACE' | 'ANALYSIS' | 'ENGINEERING' | 'SETTINGS'
  /** capability id this route is backed by; when its status !== 'available' the panel shows why */
  capability?: string
  /** refreshed every time the route becomes active (pages render their own empty/loading states) */
  enter?: () => void
}

/** every route owns exactly one `<div class="route-panel" id="panel-<id>">` */
export function panelOf(r: Route): string { return `panel-${r.id}` }

export const ROUTES: Route[] = [
  { id: 'dashboard', label: 'Dashboard', group: 'WORKSPACE' },
  { id: 'team', label: 'Отряд', group: 'WORKSPACE' },
  { id: 'build', label: 'Билд', group: 'WORKSPACE', capability: 'build.editor' },
  { id: 'encounter', label: 'Противники', group: 'WORKSPACE', capability: 'encounter.editor' },
  { id: 'battle', label: 'Симулятор', group: 'WORKSPACE' },
  { id: 'gear', label: 'Экипировка', group: 'WORKSPACE' },
  { id: 'results', label: 'Результаты', group: 'WORKSPACE' },
  { id: 'calc', label: 'Калькулятор', group: 'WORKSPACE' },
  { id: 'reference', label: 'Справочник', group: 'WORKSPACE' },

  { id: 'analysis', label: 'Анализ боя', group: 'ANALYSIS', capability: 'analysis.run' },
  { id: 'compare', label: 'Сравнение', group: 'ANALYSIS', capability: 'analysis.compare' },
  { id: 'profiles', label: 'Профили отряда', group: 'ANALYSIS', capability: 'analysis.profile' },
  { id: 'optimizer', label: 'Оптимизатор', group: 'ANALYSIS', capability: 'optimize.search' },

  { id: 'verification', label: 'Проверка и покрытие', group: 'ENGINEERING', capability: 'verification.specs' },
  { id: 'catalog', label: 'Каталог данных', group: 'ENGINEERING' },
  { id: 'deviations', label: 'Отклонения', group: 'ENGINEERING', capability: 'known.deviations' },

  { id: 'settings', label: 'Настройки', group: 'SETTINGS' },
]

const DEFAULT_ROUTE = ROUTES[0].id

/** pages register their refresh hook here — avoids shell → page → shell import cycles */
const ENTER_HOOKS: Record<string, () => void> = {}
export function setRouteEnter(id: string, fn: () => void): void { ENTER_HOOKS[id] = fn }

function routeOf(id: string): Route | undefined {
  return ROUTES.find(r => r.id === id)
}

export function currentRoute(): string {
  const id = location.hash.replace(/^#\/?/, '')
  return routeOf(id) ? id : DEFAULT_ROUTE
}

export function navigate(id: string): void {
  if (location.hash === `#/${id}`) activate(id)
  else location.hash = `#/${id}`
}

/** activate a route's nav button + panel; render the capability notice when not available */
function activate(id: string): void {
  const route = routeOf(id) ?? routeOf(DEFAULT_ROUTE)!
  for (const b of document.querySelectorAll<HTMLButtonElement>('#navRail .nav-btn'))
    b.classList.toggle('active', b.dataset.route === route.id)
  for (const p of document.querySelectorAll('.route-panel'))
    p.classList.toggle('active', p.id === panelOf(route))
  renderCapabilityNotice(route)
  const enter = ENTER_HOOKS[route.id] ?? route.enter
  if (enter) enter()
}

/** rule 84.1: a route backed by an unavailable/partial capability states its status + reason. */
function renderCapabilityNotice(route: Route): void {
  const panel = document.getElementById(panelOf(route))
  if (!panel) return
  let notice = panel.querySelector<HTMLElement>(':scope > .cap-notice')
  if (!route.capability) { notice?.remove(); return }
  const cap = capability(route.capability)
  const reason = unavailableReason(route.capability)
  if (!cap || cap.status === 'available') { notice?.remove(); return }
  if (!notice) {
    notice = document.createElement('div')
    notice.className = 'cap-notice'
    panel.prepend(notice)
  }
  notice.dataset.status = cap.status
  notice.innerHTML =
    `<strong>${cap.status === 'partial' ? 'Частичная поддержка' : 'Недоступно'}</strong> — ` +
    `${route.label}: ${reason ?? 'backend не подключён'}`
}

// ---------------------------------------------------------------- status / busy surface

export type StatusKind = 'info' | 'loading' | 'error'

export function showStatus(msg: string, kind: StatusKind = 'info'): void {
  const bar = document.getElementById('statusBar')
  if (!bar) return
  bar.textContent = msg
  bar.dataset.kind = kind
  bar.style.display = msg ? '' : 'none'
}

export function clearStatus(): void {
  showStatus('')
}

/** run work behind the status surface; loading → result/error, always restores the busy class */
export async function withBusy<T>(label: string, fn: () => Promise<T> | T): Promise<T | undefined> {
  document.body.classList.add('busy')
  showStatus(label, 'loading')
  try {
    const out = await fn()
    clearStatus()
    return out
  } catch (e) {
    showStatus('ОШИБКА: ' + String(e), 'error')
    return undefined
  } finally {
    document.body.classList.remove('busy')
  }
}

// ---------------------------------------------------------------- init

/** §84.15/§84.8 — engine/rules/dataset versions visible at all times (reproducibility, rule 84.1.5) */
function renderVersionBar(): void {
  const bar = document.getElementById('versionBar')
  if (!bar) return
  bar.title = 'Версии движка, правил и датасета — входят в RulesSnapshot каждого прогона'
  bar.innerHTML = ''
  for (const [k, v] of [['engine', ENGINE_VERSION], ['rules', RULES_VERSION], ['data', DATASET_VERSION]] as const) {
    const s = document.createElement('span')
    s.className = 'verChip'
    s.innerHTML = `<i>${k}</i><b>${v}</b>`
    bar.append(s)
  }
}

export function initShell(): void {
  const rail = document.getElementById('navRail')
  if (!rail) return
  rail.innerHTML = ''
  let lastGroup = ''
  for (const r of ROUTES) {
    if (r.group !== lastGroup) {
      lastGroup = r.group
      const h = document.createElement('div')
      h.className = 'nav-group'
      h.textContent = r.group
      rail.append(h)
    }
    const b = document.createElement('button')
    b.className = 'nav-btn'
    b.dataset.route = r.id
    b.textContent = r.label
    const cap = r.capability ? capability(r.capability) : undefined
    if (cap && cap.status !== 'available') {
      const badge = document.createElement('span')
      badge.className = 'nav-badge'
      badge.dataset.status = cap.status
      badge.textContent = cap.status === 'partial' ? '~' : '!'
      b.append(badge)
    }
    b.onclick = () => navigate(r.id)
    rail.append(b)
  }
  renderVersionBar()
  window.addEventListener('hashchange', () => activate(currentRoute()))
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`
  else activate(currentRoute())
}
