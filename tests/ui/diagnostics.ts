import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { runBattle } from '../../src/core/battle'
import { store, type TeamRowState } from '../../src/ui/store'
import { collect } from '../../src/ui/team'
import { initDiagnostics } from '../../src/ui/diagnostics'
import { ROUTES } from '../../src/ui/shell'
import manifest from '../../verification/interactions/manifest.json'

/**
 * Phase I — Diagnostics screen: the one workspace that shows run internals (eventId/traceId/
 * payload ids) and the committed deviation registry with its real gate statuses; plus the
 * honest empty state when no run exists.
 */
export default () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event

  doc.body.innerHTML = '<div id="diagnosticsWs"></div>'
  const root = () => doc.getElementById('diagnosticsWs') as HTMLElement

  // no run yet -> honest empty state, no fabricated rows
  initDiagnostics()
  const emptyMsg = root().querySelector('.emptyState')?.textContent ?? ''

  const route = ROUTES.find(r => r.id === 'diagnostics')

  const row: TeamRowState = {
    id: 'd1', kitId: 'danheng', stats: { atk: 3000, spd: 134, critRate: 0.75, critDmg: 2 },
    coneId: '', si: 1, relic1: '', relic2: '', planar: '',
    eidolon: 0, levels: { basic: 6, skill: 8, ult: 8, talent: 6 }, traces: false,
    techniqueUses: 0, skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [],
  }
  store.dispatch({ type: 'team/add', row })
  const setup = collect()
  store.dispatch({ type: 'team/remove', id: row.id })
  const sim = runBattle({ ...setup, log: { debug: 5 as const } })
  store.dispatch({ type: 'results/set', sim, setup })
  initDiagnostics()

  const evTable = root().querySelector('table.diagEvents')
  const evRows = evTable?.querySelectorAll('tbody tr').length ?? 0
  const headers = [...(evTable?.querySelectorAll('th') ?? [])].map(t => t.textContent)
  const devTable = root().querySelector('table.diagDeviations')
  const devRows = devTable?.querySelectorAll('tbody tr').length ?? 0
  const badges = [...(devTable?.querySelectorAll('.badge') ?? [])].map(b => b.textContent)
  const kvText = root().querySelector('.kvTable')?.textContent ?? ''

  const cases = [
    raw('diagnostics route registered in ENGINEERING', route?.group === 'ENGINEERING', route?.group ?? 'absent'),
    raw('no run -> honest empty state (no fabricated data)', /Нет запуска/.test(emptyMsg), emptyMsg),
    raw('event internals table renders (eventId column)', evRows > 0 && headers.includes('#'), `${evRows} rows`),
    raw('traceId column present (internals live only here)', headers.includes('traceId'), headers.join('|')),
    raw('run metadata shows seed + hashes', kvText.includes(String(setup.seed)) && kvText.includes('eventHash') && kvText.includes('stateHash'), kvText.slice(0, 160)),
    raw('deviation registry rows = committed manifest (no invention)', devRows === manifest.kits.length, `${devRows}/${manifest.kits.length}`),
    raw('statuses carry badges from the real gate vocabulary', badges.length === manifest.kits.length && badges.every(b => b === 'promoted' || b === 'blocked' || b === 'gap'), badges.slice(0, 5).join(',')),
    raw('eventHash present = logger API actually called', /eventHash/.test(kvText), kvText.slice(0, 160)),
  ]

  store.dispatch({ type: 'results/clear' })
  return cases
}
