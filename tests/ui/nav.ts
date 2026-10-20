import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { initShell, navigate, currentRoute, ROUTES, GROUP_LABELS } from '../../src/ui/shell'

/**
 * Single-tab shell: the shipped nav exposes exactly the Party Setup route. The route id stays
 * `team` (deep link `#/team` unchanged) and its group header renders under one collapsed-capable
 * section. All other UI pages were removed from the shell.
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
  const railIds = [...rail.querySelectorAll('.nav-btn')].map(b => (b as HTMLElement).dataset.route)
  const headers = [...rail.querySelectorAll<HTMLButtonElement>('.nav-group')]

  const onlyTeam = JSON.stringify(railIds) === JSON.stringify(ROUTES.map(r => r.id)) && railIds.length === 1 && railIds[0] === 'team'
  const oneGroup = headers.length === 1 && headers[0].textContent === GROUP_LABELS.PARTY

  // navigation still targets the single route; unknown ids fall back to it (no crash)
  navigate('team')
  const teamOk = currentRoute() === 'team'
  navigate('dashboard')
  const fallbackOk = currentRoute() === 'team'

  return [
    raw('nav renders exactly the team route', onlyTeam, railIds.join(',')),
    raw('nav renders the single Отряд group header', oneGroup, headers.map(h => h.textContent).join('|')),
    raw('#/team resolves to the team route', teamOk, currentRoute()),
    raw('an unknown route id falls back to team', fallbackOk, currentRoute()),
  ]
}
