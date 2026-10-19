import { raw } from '../_helpers/battle'
import { store, type TeamRowState } from '../../src/ui/store'
import { collect, toTeamSpec } from '../../src/ui/team'

/**
 * §84.6.1 Phase D — per-node battle-entry knobs. `traces` (minor traces → permanent buff) and
 * `energyStartFrac` (start energy, engine default 0.5) are per-character, so a team row must map
 * both onto its own TeamSpec — not a team-wide setting.
 */
export default () => {
  const row = (id: string, kitId: string, patch: Partial<TeamRowState> = {}): TeamRowState => ({
    id, kitId, stats: {}, coneId: '', si: 1, relic1: '', relic2: '', planar: '',
    eidolon: 0, levels: { basic: 1, skill: 1, ult: 1, talent: 1 }, traces: true,
    skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [], ...patch,
  })

  const off = toTeamSpec(row('s1', 'danheng', { traces: false, energyStartFrac: 0 }))
  const quarter = toTeamSpec(row('s2', 'pela', { energyStartFrac: 0.25 }))
  const absent = toTeamSpec(row('s3', 'bronya'))

  const rows = [row('e1', 'seele', { traces: false, energyStartFrac: 0.75 }), row('e2', 'pela', { energyStartFrac: 0 })]
  for (const r of rows) store.dispatch({ type: 'team/add', row: r })
  const setup = collect()
  for (const r of rows) store.dispatch({ type: 'team/remove', id: r.id })

  return [
    raw('per-node traces reach TeamSpec (each row its own flag)', off.traces === false && quarter.traces === true, `${off.traces}/${quarter.traces}`),
    raw('per-node energyStartFrac reaches TeamSpec', off.energyStartFrac === 0 && quarter.energyStartFrac === 0.25, `${off.energyStartFrac}/${quarter.energyStartFrac}`),
    raw('absent energyStartFrac stays undefined (engine default 0.5)', absent.energyStartFrac === undefined, String(absent.energyStartFrac)),
    raw('collect() carries both knobs per row into BattleSetup.team', JSON.stringify(setup.team.map(t => [t.traces, t.energyStartFrac])) === JSON.stringify([[false, 0.75], [true, 0]]), JSON.stringify(setup.team.map(t => [t.traces, t.energyStartFrac]))),
  ]
}
