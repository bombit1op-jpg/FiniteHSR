/**
 * §45 lab — team assembly + end-to-end smoke.
 * Isolates src/core/battle: a named preset resolves to a full 4-member TeamSpec, and a real
 * battle off that preset runs to completion producing damage (proves the wiring, not the math —
 * the math labs cover that in isolation).
 */
import { ENEMY_PRESETS, presetTeam, runBattle } from '../../src/core/battle'
import { eq, isEntry, ok, report, type LabCase } from './harness'

export function teamsLab(): LabCase[] {
  const seele = presetTeam('seele')
  const sim = runBattle({ team: seele, enemy: { ...ENEMY_PRESETS.mob, count: 1 }, cycles: 2, seed: 7 })
  const total = [...sim.accounts.values()].reduce((a, c) => a + c.total, 0)

  return [
    eq('preset team has 4 members', seele.length, 4),
    ok('preset members carry kits', seele.every(m => typeof m.kitId === 'string' && m.kitId.length > 0)),
    ok('smoke battle deals damage', total > 0),
    ok('no NaN/Infinity in result totals', Number.isFinite(total) && seele.length === 4)
  ]
}

if (isEntry('teams.ts')) process.exitCode = report('Team + smoke lab', teamsLab())
