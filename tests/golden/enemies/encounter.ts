import { t } from '../../suites'
import { run, raw, mob, type Ctx } from '../../_helpers/battle'
import { ENCOUNTER_PRESETS, type EnemySpec } from '../../../src/core/battle'
import {
  asDefinition, encounterStateOf, resolveEncounter, validateEncounter,
  type EncounterSpec,
} from '../../../src/core/encounter'
import { buildRulesSnapshot, type RulesSnapshot } from '../../../src/core/battle/BattleRules'

/**
 * §59 — EncounterModel (EncounterDefinition/WaveDefinition/EncounterState/RulesSnapshot).
 *
 * Two layers:
 *  - model: definition compilation (`asDefinition`), staged manualMod merge, structural
 *    validation, and the deterministic RULES SNAPSHOT digest (same inputs ⇒ same digest;
 *    id/mode/cycleLimit/victory-condition labels survive; seed or wave changes diverge).
 *  - battle binding: setupSim attaches `sim.rules` pre-battle; `encounterStateOf` projects a
 *    live §59 EncounterState from battle state (wave/cycle/time/activeEnemies/spawnedEntities/
 *    flags/resources/victory/defeat) with no second mutable copy to drift.
 */

const twoWaveEnc: EncounterSpec = {
  id: 'e2e', mode: 'E2E Mock', cycles: 6,
  waves: [[mob()], [{ ...mob(), name: 'Wave Two', hp: 8_000 }]],
  victoryCondition: 'All enemies down',
  defeatCondition: 'Team wiped',
}

const snap = (over: Partial<{ encounter?: EncounterSpec; enemyWaves: EnemySpec[][]; seed: number; cycles: number; techniques?: string[] }> & { encounter?: EncounterSpec }): RulesSnapshot =>
  buildRulesSnapshot({ enemyWaves: [[mob()]], seed: 7, cycles: 6, ...over })

const enemyIds = (c: Ctx): string[] => c.sim.roster.filter(u => u.side === 'enemy').map(u => u.id).sort()

export default () => {
  // ---- model: definition compilation ------------------------------------------------------
  const def = asDefinition({ id: 't', waves: [[mob()], [{ ...mob(), hp: 50_000 }]] })
  const staged = resolveEncounter({
    id: 't', waves: [[mob()]],
    effects: [{ stat: 'atkPct', value: 0.2, side: 'ally' }],
    stageModifiers: [{ stat: 'def', value: -0.2, side: 'enemy' }],
  })
  const cycleDef = asDefinition({ id: 't', cycles: 8, waves: [[mob()]] })
  const explicitLimit = asDefinition({ id: 't', cycles: 8, cycleLimit: 5, waves: [[mob()]] })
  const stagedMods = staged.manualMods ?? []

  // ---- model: validation ------------------------------------------------------------------
  const valid = validateEncounter({ id: 'ok', waves: [[mob()]], cycleLimit: 8, turnLimit: 20, victoryCondition: 'x', defeatCondition: 'y' })
  const badLimits = validateEncounter({ id: 'bad', waves: [[mob()]], cycleLimit: 0, turnLimit: -1 })

  // ---- model: rules snapshot ---------------------------------------------------------------
  const s1 = snap({ encounter: twoWaveEnc })
  const s2 = snap({ encounter: twoWaveEnc })
  const sDiffSeed = snap({ encounter: twoWaveEnc, seed: 8 })
  const sDiffWave = snap({ enemyWaves: [[{ ...mob(), hp: 50_000 }]] })
  const sOpen = snap({})
  const sUnsorted = snap({ encounter: twoWaveEnc, techniques: ['sunday', 'aster', undefined].filter(Boolean) as string[] })
  const moc = resolveEncounter(ENCOUNTER_PRESETS.moc12!)
  const mocSnap = buildRulesSnapshot({
    encounter: ENCOUNTER_PRESETS.moc12,
    enemyWaves: (moc.enemyWaves ?? [[moc.enemy]]) as EnemySpec[][],
    seed: 1, cycles: 8,
  })

  // ---- battle binding ----------------------------------------------------------------------
  const battle = run({
    team: [{ kitId: 'hook' }, { kitId: 'march7th' }, { kitId: 'robin' }],
    encounter: twoWaveEnc,
  })
  const es = encounterStateOf(battle.sim)
  const plain = run({ team: [{ kitId: 'hook' }], enemy: [[mob()]], cycles: 4 })
  const pes = encounterStateOf(plain.sim)

  // L245: enemy-side manual/stage mods used to be dropped (applied before the enemies spawned).
  // Now applied post-spawn — a `vulnAll` on the enemy must raise the damage it takes.
  const enemyHp = (c: Ctx): number => c.sim.roster.filter(u => u.side === 'enemy').reduce((s, u) => s + u.hp, 0)
  const baseEnemy = run({ team: [{ kitId: 'hook' }], enemy: mob({ hp: 1_000_000 }), cycles: 4 })
  const modEnemy = run({ team: [{ kitId: 'hook' }], enemy: mob({ hp: 1_000_000 }), cycles: 4, manualMods: [{ stat: 'vulnAll', value: 0.5, side: 'enemy' }] })
  const stagedEnemy = run({
    team: [{ kitId: 'hook' }],
    encounter: { id: 'enemyMod', waves: [[mob({ hp: 1_000_000 })]], stageModifiers: [{ stat: 'vulnAll', value: 0.5, side: 'enemy' }] },
    cycles: 4,
  })

  return [
    // ---- asDefinition: EncounterSpec → §59 definition --------------------------------------
    raw('asDefinition: waves [][] compile to WaveDefinition[] with stable ids',
      def.waves.length === 2 && def.waves[0]!.id === 't.w1' && def.waves[1]!.id === 't.w2',
      def.waves.map(w => w.id).join(',')),
    raw('asDefinition: enemy groups preserved per wave',
      def.waves[0]!.enemies.length === 1 && def.waves[1]!.enemies.length === 1),
    t.eq('asDefinition: cycles become cycleLimit when unspecified', cycleDef.cycleLimit, 8),
    t.eq('asDefinition: explicit cycleLimit wins', explicitLimit.cycleLimit, 5),
    raw('resolveEncounter: stageModifiers appended AFTER effects (staged order)',
      stagedMods.length === 2 && stagedMods[0]!.side === 'ally' && stagedMods[1]!.side === 'enemy',
      stagedMods.map(m => `${m.side}:${m.stat}`).join(',')),

    // ---- validateEncounter: §59 fields -----------------------------------------------------
    t.eq('validateEncounter: accepts valid spec with all §59 fields', valid.length, 0),
    raw('validateEncounter: flags bad cycleLimit/turnLimit',
      badLimits.includes('cycleLimit:<=0') && badLimits.includes('turnLimit:<=0'),
      badLimits.join(',')),

    // ---- buildRulesSnapshot: determinism ---------------------------------------------------
    t.eq('snapshot: same inputs ⇒ identical digest', JSON.stringify(s1), JSON.stringify(s2)),
    raw('snapshot: seed change diverges', JSON.stringify(s1) !== JSON.stringify(sDiffSeed)),
    raw('snapshot: wave change diverges waveSignatures', s1.waveSignatures[0] !== sDiffWave.waveSignatures[0]),
    raw('snapshot: techniques normalized (sorted, default empty)',
      JSON.stringify(sUnsorted.techniques) === JSON.stringify(['aster', 'sunday']) && sOpen.techniques.length === 0,
      sUnsorted.techniques.join(',')),
    t.eq('snapshot: no encounter ⇒ synthetic "setup" digest', sOpen.id, 'setup'),
    raw('snapshot: preset moc12 carries id/mode/cycleLimit + wave count',
      mocSnap.id === 'moc12' && mocSnap.mode === 'Memory of Chaos 12' && mocSnap.cycleLimit === 8 && mocSnap.waveSignatures.length === 2,
      `${mocSnap.id}/${mocSnap.mode}/limit=${mocSnap.cycleLimit}/waves=${mocSnap.waveSignatures.length}`),
    raw('snapshot: victory/defeat condition labels carried',
      s1.victoryCondition === 'All enemies down' && s1.defeatCondition === 'Team wiped'),

    // ---- battle binding: sim.rules + EncounterState ----------------------------------------
    t.eq('battle: sim.rules attached pre-battle (id/seed/condition)', [
      battle.sim.rules?.id, battle.sim.rules?.seed, battle.sim.rules?.victoryCondition,
    ], ['e2e', 7, 'All enemies down']),
    t.eq('battle: multi-wave win ⇒ wave 2, wave 1 completed',
      [es.currentWave, es.completedWaves], [2, [1]]),
    t.eq('battle: spawnedEntities cover all enemy units of both waves',
      es.spawnedEntities.sort(), enemyIds(battle)),
    t.eq('battle: activeEnemies empty after full clear', es.activeEnemies, []),
    t.eq('battle: live victory label from rules on win', es.victory, 'All enemies down'),
    raw('battle: defeat label absent on win', es.defeat === undefined),
    raw('battle: flags/resources are the engine-owned storage (identity, no copy)',
      encounterStateOf(battle.sim).encounterFlags === battle.sim.encounterFlags &&
      encounterStateOf(battle.sim).encounterResources === battle.sim.encounterResources),
    t.eq('battle: plain open-field setup ⇒ "setup" digest, wave 1, no condition labels',
      [plain.sim.rules?.id, pes.currentWave, pes.completedWaves, pes.victory], ['setup', 1, [], undefined]),

    // ---- L245: enemy-side manual/stage mods reach the enemies (applied after spawn) -----------
    raw('enemy manual mods reach enemies: vulnAll raises damage taken (lower enemy HP)',
      enemyHp(modEnemy) < enemyHp(baseEnemy), `${enemyHp(modEnemy)} < ${enemyHp(baseEnemy)}`),
    raw('enemy encounter stageModifiers reach enemies identically to manualMods',
      enemyHp(stagedEnemy) === enemyHp(modEnemy), `${enemyHp(stagedEnemy)} vs ${enemyHp(modEnemy)}`),
  ]
}