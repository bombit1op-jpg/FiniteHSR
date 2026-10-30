import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { initShell, navigate, currentRoute, ROUTES, GROUP_LABELS } from '../../src/ui/shell'

/**
 * Single-tab shell: the shipped nav exposes exactly the Party Setup route. The route id stays
 * `team` (deep link `#/team` unchanged) and its group header renders under one collapsed-capable
 * section. All other UI pages were removed from the shell.
 * 
 * Additionally, there is now a "Симуляция" route in the "Бой" group.
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
  g.ROUTES = ROUTES
  g.GROUP_LABELS = GROUP_LABELS

  const boot = (): HTMLElement => {
    doc.body.innerHTML = '<div id="navRail"></div><div id="versionBar"></div><div id="statusBar"></div>'
    initShell()
    return doc.getElementById('navRail') as HTMLElement
  }

  const rail = boot()
  const railIds = [...rail.querySelectorAll('.nav-btn')].map(b => (b as HTMLElement).dataset.route)
  const headers = [...rail.querySelectorAll<HTMLButtonElement>('.nav-group')]

  const expectedRoutes = ['team', 'simulation']
  const onlyTeam = JSON.stringify(railIds.sort()) === JSON.stringify(expectedRoutes.sort())
  const twoGroups = headers.length === 2
  const partyGroup = headers.some(h => h.textContent === GROUP_LABELS.PARTY)
  const battleGroup = headers.some(h => h.textContent === GROUP_LABELS.BATTLE)

  // navigation still targets the single route; unknown ids fall back to it (no crash)
  navigate('team')
  const teamOk = currentRoute() === 'team'
  navigate('simulation')
  const simOk = currentRoute() === 'simulation'
  navigate('dashboard')
  const fallbackOk = currentRoute() === 'team'

  return [
    raw('nav renders exactly the team and simulation routes', onlyTeam, railIds.join(',')),
    raw('nav renders two group headers: Отряд and Бой', twoGroups && partyGroup && battleGroup, headers.map(h => h.textContent).join('|')),
    raw('#/team resolves to the team route', teamOk, currentRoute()),
    raw('#/simulation resolves to the simulation route', simOk, currentRoute()),
    raw('an unknown route id falls back to team', fallbackOk, currentRoute()),
  ]
}
