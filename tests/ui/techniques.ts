import { raw } from '../_helpers/battle'
import { runBattle } from '../../src/core/battle'
import { store, type TeamRowState } from '../../src/ui/store'
import { collect } from '../../src/ui/team'

/**
 * §84.6.1 Phase C — the team editor's per-character Technique selection (`techniqueUses`) must
 * reach the engine: collect() turns rows into the ordered `BattleSetup.techniques` list, and the
 * engine resolves exactly that list. Pins the UI→engine handoff the audit flagged as missing.
 */
export default () => {
  const row = (id: string, kitId: string, techniqueUses?: number): TeamRowState => ({
    id, kitId, stats: {}, coneId: '', si: 1, relic1: '', relic2: '', planar: '',
    eidolon: 0, levels: { basic: 1, skill: 1, ult: 1, talent: 1 }, traces: false,
    techniqueUses, skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [],
  })

  const rows = [row('c1', 'danheng', 1), row('c2', 'tingyun', 2), row('c3', 'bronya', 0)]
  for (const r of rows) store.dispatch({ type: 'team/add', row: r })
  const setup = collect()
  for (const r of rows) store.dispatch({ type: 'team/remove', id: r.id })
  const bare = collect()

  // tingyun's Technique is the only maxUses-2 one: two uses must arrive as two activations
  const sim = runBattle({ ...setup, log: { debug: 5 as const } })
  const start = sim.logger.events.find(e => e.type === 'BATTLE_START')
  const applied = sim.logger.events.filter(e => e.type === 'TECHNIQUE_APPLIED')

  return [
    raw('collect() passes technique selection in row order with repeats', JSON.stringify(setup.techniques) === JSON.stringify(['danheng', 'tingyun', 'tingyun']), JSON.stringify(setup.techniques)),
    raw('collect() omits techniques when none selected', bare.techniques === undefined, JSON.stringify(bare.techniques)),
    raw('engine receives the selection (BATTLE_START payload)', JSON.stringify(start?.payload.techniques) === JSON.stringify(['danheng', 'tingyun', 'tingyun']), JSON.stringify(start?.payload.techniques)),
    raw('every surviving activation applies (2 uses of the maxUses-2 Technique)', applied.length === 3, `${applied.length}`),
  ]
}
