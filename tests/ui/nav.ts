import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { initShell, ROUTES, GROUP_LABELS } from '../../src/ui/shell'

/**
 * UX-slice 1 — nav regrouping: the 4 user-facing sections are collapsible headers, every route
 * keeps its id (deep links `#/<id>` unchanged), all route buttons stay in the DOM, and entering
 * a collapsed section auto-expands it. Rarely-used ENGINEERING starts collapsed.
 */
export default () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event
  g.location = (win as unknown as { location: unknown }).location

  const boot = (): HTMLElement => {
    doc.body.innerHTML = '<div id="navRail"></div><div id="versionBar"></div><div id="statusBar"></div>'
    initShell()
    return doc.getElementById('navRail') as HTMLElement
  }

  const rail = boot()
  const headers = [...rail.querySelectorAll<HTMLButtonElement>('.nav-group')]
  const bodies = () => [...rail.querySelectorAll<HTMLElement>('.nav-group-body')]
  const engBody = () => bodies().find(b => b.dataset.group === 'ENGINEERING')

  // deep links: the 18 original route ids are kept, plus the new `player` composition route
  const railIds = [...rail.querySelectorAll('.nav-btn')].map(b => (b as HTMLElement).dataset.route)
  const deepLinksOk = JSON.stringify(railIds) === JSON.stringify(ROUTES.map(r => r.id)) && railIds.length === 19

  // 4 sections with the target labels
  const labelsOk = headers.length === 4 && headers.every(h => Object.values(GROUP_LABELS).includes(h.textContent ?? ''))

  // rarely-used technical section starts collapsed; its buttons still exist in the DOM
  const defCollapsed = engBody()?.classList.contains('collapsed') === true
    && rail.querySelectorAll('.nav-group-body[data-group="ENGINEERING"] .nav-btn').length === 5

  // clicking a group header toggles it (round-trip restores state)
  const engHeader = headers.find(h => h.dataset.group === 'ENGINEERING') as HTMLButtonElement
  engHeader.click()
  const opened = engBody()?.classList.contains('collapsed') === false
  engHeader.click()
  const reclosed = engBody()?.classList.contains('collapsed') === true

  // active route auto-expands its own section: boot straight into a collapsed-section deep link
  ;(win as unknown as { location: { hash: string } }).location.hash = '#/diagnostics'
  const rail2 = boot()
  const engBody2 = rail2.querySelector('.nav-group-body[data-group="ENGINEERING"]')
  const autoExpanded = engBody2?.classList.contains('collapsed') !== true
    && rail2.querySelector('.nav-btn[data-route="diagnostics"]') !== null

  return [
    raw('nav renders the known route ids incl. new player route (deep links unchanged)', deepLinksOk, railIds.join(',')),
    raw('nav has the 4 user-facing section headers', labelsOk, headers.map(h => h.textContent).join('|')),
    raw('ENGINEERING starts collapsed but keeps its 5 route buttons in the DOM', defCollapsed, String(defCollapsed)),
    raw('group header click expands the collapsed section', opened, String(opened)),
    raw('group header click again re-collapses it', reclosed, String(reclosed)),
    raw('entering a collapsed-section route auto-expands that section', autoExpanded, String(autoExpanded)),
  ]
}
