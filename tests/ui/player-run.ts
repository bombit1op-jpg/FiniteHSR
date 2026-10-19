import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { REPO_ROOT } from '../suites'
import { runBattle, ENEMY_PRESETS } from '../../src/core/battle'
import { render } from '../../src/ui/results'
import { initShell, navigate, currentRoute } from '../../src/ui/shell'

/**
 * Player-page run transition (docs/gui/PLAYER_FLOW_AND_ASSETS.md §5): pressing Run must show the
 * real simulator output on the SAME page (`#panel-player`) without navigating to the separate
 * results route. The results containers live inside the player panel, so after `render()` they are
 * populated while `player` stays active and the old `results` route stays an empty pointer.
 */
export default () => {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8')
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event
  g.location = (win as unknown as { location: unknown }).location

  doc.body.innerHTML = html + '<div id="navRail"></div><div id="versionBar"></div><div id="statusBar"></div>'
  initShell()
  navigate('player')

  const setup: Parameters<typeof runBattle>[0] = {
    team: [{ kitId: 'seele', stats: { atk: 2600, spd: 140, critRate: 1, critDmg: 1.8 } }],
    enemy: { ...ENEMY_PRESETS.mob, count: 1, weaknesses: ['Quantum'], hp: 1_000_000 },
    cycles: 2, seed: 7,
  }
  const sim = runBattle(setup)
  render(sim, setup)

  const player = doc.getElementById('panel-player') as HTMLElement
  const filled = (id: string): boolean => (player.querySelector(`#${id}`)?.innerHTML ?? '').trim().length > 0

  return [
    raw('run stays on the player route (no forced navigation to results)', currentRoute() === 'player', currentRoute()),
    raw('player panel is the active panel after a run', player.classList.contains('active') === true),
    raw('damage summary renders inside the player panel', filled('summary'), (player.querySelector('#summary')?.innerHTML ?? '').slice(0, 60)),
    raw('action log renders inside the player panel', filled('log')),
    raw('team stats render inside the player panel', filled('statPanel')),
    raw('HP-after-battle renders inside the player panel', filled('hpPanel')),
    raw('the old results route stays an empty pointer (no live results)', !(doc.getElementById('panel-results')?.querySelector('#summary')), 'pointer only'),
  ]
}
