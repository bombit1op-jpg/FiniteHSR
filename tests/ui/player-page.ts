import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { REPO_ROOT } from '../suites'

/**
 * Single-page player flow (docs/gui/PLAYER_FLOW_AND_ASSETS.md): the normal setup lives on ONE
 * route panel (`#panel-player`) in the spec order — team → build/relics → enemies → pre-battle
 * mods → run mode/Start → results below. The existing editors keep their singleton container ids;
 * those containers are *relocated* into the player panel, and the old BATTLE routes become pointers,
 * so there is exactly one live copy of each control (no parallel state, no duplicate DOM).
 */
export default () => {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8')
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  doc.body.innerHTML = html

  const main = doc.querySelector('main') as HTMLElement
  const panels = [...main.querySelectorAll<HTMLElement>('.route-panel')]
  const player = doc.getElementById('panel-player') as HTMLElement

  const SINGLETONS = [
    'team', 'addChar', 'enemyCfg', 'modRows', 'addMod',
    'runMode', 'cycles', 'seed', 'run', 'check',
    'manualPanel', 'summary', 'statPanel', 'hpPanel', 'log',
  ]
  const OLD = ['panel-team', 'panel-battle', 'panel-gear', 'panel-results', 'panel-build']

  const inPlayer = (id: string): boolean => !!player?.querySelector(`#${id}`)
  const counts = (id: string): number => main.querySelectorAll(`#${id}`).length

  // spec order of the section headings inside the player panel
  const headings = [...(player?.querySelectorAll('h2') ?? [])].map(h => (h.textContent ?? '').trim())
  const ordered = headings[0]?.startsWith('1.') === true
    && headings[1]?.startsWith('2.') === true
    && headings[2]?.startsWith('3.') === true
    && headings[3] === 'Результаты'

  return [
    raw('player panel exists and is the first route panel', panels[0]?.id === 'panel-player', panels[0]?.id ?? 'none'),
    raw('player panel is active by default', player?.classList.contains('active') === true),
    raw('player sections follow the spec order (team→enemies→run→results)', ordered, headings.join(' | ')),
    raw('team grid is a 4-column party layout', doc.getElementById('team')?.classList.contains('cardGrid') === true),
    raw('encounter mode/stage/room editor lives on its own tab', !!doc.getElementById('panel-encounter')?.querySelector('#encounterEditor')),
    raw('player panel links to the encounter tab', !!player?.querySelector('[data-go="encounter"]')),
    raw('every setup control lives inside the player panel', SINGLETONS.every(inPlayer),
      SINGLETONS.filter(id => !inPlayer(id)).join(',') || 'all present'),
    raw('each setup control id is unique in <main> (no parallel copy)', SINGLETONS.every(id => counts(id) === 1),
      SINGLETONS.filter(id => counts(id) !== 1).map(id => `${id}×${counts(id)}`).join(',') || 'unique'),
    raw('old BATTLE panels no longer own the setup controls', OLD.every(pid => {
      const p = doc.getElementById(pid)
      return p && SINGLETONS.every(id => !p.querySelector(`#${id}`))
    }), OLD.join(',')),
    raw('replaced BATTLE routes point to the player page', OLD.every(pid => !!doc.getElementById(pid)?.querySelector('[data-go="player"]')),
      OLD.filter(pid => !doc.getElementById(pid)?.querySelector('[data-go="player"]')).join(',') || 'all point'),
    raw('Start is the single prominent primary action', doc.getElementById('run')?.classList.contains('btn-primary') === true
      && doc.getElementById('run')?.classList.contains('btn-large') === true),
    raw('setup inputs are wrapped by a label (accessible name)', ['cycles', 'seed', 'runMode'].every(id => !!doc.getElementById(id)?.closest('label'))),
    raw('build editor (BuildSpec import/export) is mounted inside the player panel', inPlayer('buildEditor')),
    raw('no separate relic tab panel remains', !doc.getElementById('relicTabs') && !doc.getElementById('relicPanel')),
  ]
}
