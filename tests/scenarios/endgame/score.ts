import { run, raw, mob } from '../../_helpers/battle'
import { resolveScore, encounterModeFromLabel, MODE_DEFINITIONS } from '../../../src/core/endgame-rules'

export default () => {
  // fast deterministic win vs one small mob
  const win = run({ team: [{ kitId: 'hook', skillPriority: 1 }, { kitId: 'ruanmei', skillPriority: 1 }], enemy: mob({ hp: 6_000 }) })
  const sim = win.sim
  const totalDamage = Math.round([...sim.ownerDamage.values()].reduce((a, b) => a + b, 0))
  const kills = sim.roster.filter(u => u.side === 'enemy' && u.dead).length
  const cycles = sim.cycle + 1
  const turns = sim.logger.turn

  const normal = resolveScore('NORMAL', sim)
  const moc = resolveScore('MEMORY_OF_CHAOS', sim, { cycleLimit: 10 })
  const pf = resolveScore('PURE_FICTION', sim)
  const as = resolveScore('APOCALYPTIC_SHADOW', sim)
  const other = resolveScore('OTHER_MODE', sim)

  // defeat / timeout: unbounded enemy, tiny budget, no kill
  const loss = run({ team: [{ kitId: 'hook', skillPriority: 1 }], cycles: 1, enemy: mob({ hp: 1_000_000_000, atk: 200 }) })
  const lostSim = loss.sim
  const mocLost = resolveScore('MEMORY_OF_CHAOS', lostSim, { cycleLimit: 10 })
  const asLost = resolveScore('APOCALYPTIC_SHADOW', lostSim)
  const dmgLost = [...lostSim.ownerDamage.values()].reduce((a, b) => a + b, 0)

  return [
    // ---------- victory: structure + per-mode score
    raw('NORMAL score == totalDamage', normal.score === totalDamage, `${normal.score} vs ${totalDamage}`),
    raw('victory flag true on a cleared fight', normal.victory === true, `victory=${normal.victory}`),
    raw('kills counted', normal.kills === kills && kills >= 1, `kills=${normal.kills}`),
    raw('PURE_FICTION score = kills*1000 + damage', pf.score === kills * 1000 + totalDamage, `${pf.score} vs ${kills * 1000 + totalDamage}`),
    raw('PURE_FICTION ≠ NORMAL (not reduced to totalDamage)', pf.score !== normal.score, `${pf.score} vs ${normal.score}`),
    raw('MEMORY_OF_CHAOS rewards unused cycles', moc.score === Math.max(0, 10 - cycles), `${moc.score} vs limit10 - ${cycles}`),
    raw('APOCALYPTIC_SHADOW win = 1000 + speed bonus', as.score === 1000 + Math.max(0, 1000 - turns), `${as.score}`),
    raw('OTHER_MODE win = max(0,1000-turns)', other.score === Math.max(0, 1000 - turns), `${other.score} vs ${Math.max(0, 1000 - turns)}`),
    raw('declared objectives met only on victory', resolveScore('NORMAL', sim, { objectives: ['Clear'] }).objectives.join(',') === 'Clear', 'objectives'),
    // ---------- defeat
    raw('defeat flag false overall', mocLost.victory === false, `victory=${mocLost.victory}`),
    raw('MEMORY_OF_CHAOS defeat ⇒ score 0', mocLost.score === 0, `score=${mocLost.score}`),
    raw('APOCALYPTIC_SHADOW defeat scores on boss HP chunked', asLost.score > 0 && dmgLost > 0, `score=${asLost.score} dmg=${dmgLost}`),
    raw('defeat ⇒ no objectives met', mocLost.objectives.length === 0, 'objectives'),
    raw('remainingHP = hp still standing on timeout', mocLost.remainingHP > 0, `rem=${mocLost.remainingHP}`),
    // ---------- label mapping + mode table
    raw('label map MoC', encounterModeFromLabel('MoC') === 'MEMORY_OF_CHAOS', encounterModeFromLabel('MoC')),
    raw('label map "Pure Fiction"', encounterModeFromLabel('Pure Fiction') === 'PURE_FICTION', encounterModeFromLabel('Pure Fiction')),
    raw('label map "Apocalyptic Shadow"', encounterModeFromLabel('Apocalyptic Shadow') === 'APOCALYPTIC_SHADOW', encounterModeFromLabel('Apocalyptic Shadow')),
    raw('label map AA → OTHER_MODE', encounterModeFromLabel('AA') === 'OTHER_MODE', encounterModeFromLabel('AA')),
    raw('label map "Memory of Chaos 12"', encounterModeFromLabel('Memory of Chaos 12') === 'MEMORY_OF_CHAOS', encounterModeFromLabel('Memory of Chaos 12')),
    raw('label map undefined → NORMAL', encounterModeFromLabel(undefined) === 'NORMAL', encounterModeFromLabel(undefined)),
    raw('each mode declares a distinct primary metric',
      new Set(Object.values(MODE_DEFINITIONS).map(d => d.primary)).size === 5,
      Object.values(MODE_DEFINITIONS).map(d => d.primary).join(',')),
  ]
}
