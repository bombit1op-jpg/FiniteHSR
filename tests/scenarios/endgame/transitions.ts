import { run, raw, all, mob, type Ctx } from '../../_helpers/battle'

const first = (c: Ctx, type: string): number => all(c, type)[0] ? c.nodes.indexOf(all(c, type)[0]!) : -1

export default () => {
  const wave2Boss = { ...mob({ hp: 6_000 }), name: 'Wave Two Boss', rank: 'boss' as const }

  // A: two-wave encounter with explicit conditions — full §61 transition sequence
  const win = run({
    team: [{ kitId: 'hook', skillPriority: 1 }, { kitId: 'ruanmei', skillPriority: 1 }],
    encounter: {
      id: 'tr_win', mode: 'MoC', stageId: 'Stage_Test', cycles: 6,
      waves: [[mob({ hp: 6_000 })], [wave2Boss]],
      victoryCondition: 'All enemies defeated', defeatCondition: 'Team wiped',
    },
  })
  const starts = all(win, 'WAVE_START')
  const s1 = starts.length > 1 ? win.nodes.indexOf(starts[1]!) : -1
  const we = first(win, 'WAVE_END')
  const despawn = first(win, 'ENEMY_DESPAWN')
  const spawn = first(win, 'ENEMY_SPAWN')
  const boss = first(win, 'BOSS_RESET')
  const victory = first(win, 'ENCOUNTER_VICTORY')
  const complete = first(win, 'OBJECTIVE_COMPLETE')
  const end = first(win, 'BATTLE_END')

  // B: single-wave run with NO encounter conditions — plain setup, no §61 events (golden-safe)
  const plain = run({ team: [{ kitId: 'hook', skillPriority: 1 }], enemy: mob({ hp: 6_000 }) })
  const plainHas = ['ENEMY_SPAWN', 'ENEMY_DESPAWN', 'BOSS_RESET', 'OBJECTIVE_COMPLETE', 'ENCOUNTER_VICTORY', 'ENCOUNTER_DEFEAT'] as const

  // C: defeat — unbounded enemy, tiny cycle budget, no kill ⇒ ENCOUNTER_DEFEAT, no victory
  const loss = run({
    team: [{ kitId: 'hook', skillPriority: 1 }],
    cycles: 1,
    encounter: {
      id: 'tr_loss', mode: 'MoC', cycles: 1,
      waves: [[{ ...mob({ hp: 1_000_000_000, atk: 200 }) }]],
      victoryCondition: 'All enemies defeated', defeatCondition: 'Team wiped',
    },
  })

  return [
    // ---------- A: transition order
    raw('two waves announced', starts.length === 2, `starts=${starts.length}`),
    raw('WAVE_END before wave 2 WAVE_START', we >= 0 && s1 >= 0 && we < s1, `we=${we} s1=${s1}`),
    raw('ENEMY_DESPAWN emitted on transition', despawn >= 0, `despawn=${despawn}`),
    raw('ENEMY_SPAWN emitted on transition', spawn >= 0, `spawn=${spawn}`),
    raw('transition order WAVE_END < DESPAWN < SPAWN < WAVE_START(2)',
      we < despawn && despawn < spawn && spawn < s1, `we=${we} d=${despawn} s=${spawn} s1=${s1}`),
    raw('BOSS_RESET fires for the arriving boss', boss >= 0, `boss=${boss}`),
    raw('BOSS_RESET after SPAWN, before WAVE_START(2)', spawn < boss && boss < s1, `spawn=${spawn} boss=${boss} s1=${s1}`),
    raw('wave-1 enemy marked despawned (wave===2 roster)', win.sim.roster.some(u => u.side === 'enemy' && u.wave === 2), 'wave2 unit'),
    // ---------- A: encounter resolution
    raw('ENCOUNTER_VICTORY before BATTLE_END', victory >= 0 && end >= 0 && victory < end, `v=${victory} end=${end}`),
    raw('OBJECTIVE_COMPLETE before BATTLE_END', complete >= 0 && complete < end, `c=${complete} end=${end}`),
    raw('no ENCOUNTER_DEFEAT on a win', all(win, 'ENCOUNTER_DEFEAT').length === 0, 'defeats'),
    raw('no logger errors (win)', win.sim.logger.errors.length === 0, win.sim.logger.errors.join('; ')),
    // ---------- B: golden-safe plain setup
    raw('plain single-wave setup emits no §61 encounter/transition events',
      plainHas.every(t => all(plain, t).length === 0),
      plainHas.filter(t => all(plain, t).length > 0).join(',') || 'none'),
    // ---------- C: defeat
    raw('defeat ⇒ ENCOUNTER_DEFEAT, not victory', all(loss, 'ENCOUNTER_DEFEAT').length === 1 && all(loss, 'ENCOUNTER_VICTORY').length === 0,
      `def=${all(loss, 'ENCOUNTER_DEFEAT').length} vic=${all(loss, 'ENCOUNTER_VICTORY').length}`),
    raw('defeat emits no OBJECTIVE_COMPLETE', all(loss, 'OBJECTIVE_COMPLETE').length === 0, 'obj'),
    raw('no logger errors (loss)', loss.sim.logger.errors.length === 0, loss.sim.logger.errors.join('; ')),
  ]
}
