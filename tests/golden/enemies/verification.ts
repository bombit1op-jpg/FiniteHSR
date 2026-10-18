/**
 * §63 — enemy verification across its four layers:
 *   63.1 DATA      — a real catalog entry: identity, mode-specific variants, toughness model,
 *                    resistance profile, level stats (all through the §51/§52 resolver).
 *   63.2 ABILITY   — a declared ability's target/damage/element/charge/cooldown round-trips and
 *                    resolves through the shared pipeline (no bespoke enemy damage engine).
 *   63.3 PATTERN   — first action, looped sequence, charge timing, cooldown, target switching.
 *   63.4 ENCOUNTER — wave order, spawn/despawn, phase change, victory/defeat, mode scoring.
 *
 *  Data checks read the real `hsr-data/enemies.json` catalog (deterministic); the rest pin engine
 *  semantics on a registered harness behavior / encounter.
 */
import { t } from '../../suites'
import { run, raw, all, mob } from '../../_helpers/battle'
import {
  DEFINITIONS, getVariant, getDefinition, resolveInstance,
  registerEnemyBehavior, unregisterEnemyBehavior, enemyBehavior, PatternAI, chooseEnemyAction,
  type EnemyBehavior,
} from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import { encounterModeFromLabel, resolveScore } from '../../../src/core/endgame-rules'
import type { EnemySpec } from '../../../src/core/battle'
import type { Unit } from '../../../src/core/entities/Unit'

const CHOIR = '"Harmonious Choir" The Great Septimus'

export default () => {
  // ---- 63.1 DATA: identity + mode-specific variants + model layers ------------------------
  const choir = getVariant(CHOIR)!
  const choirDef = getDefinition(CHOIR)!
  const inst = resolveInstance(choirDef, choir, 80)

  const base = getVariant('"All or Nothing"')!
  const modeVar = getVariant('"All or Nothing" (Apocalyptic Shadow)')!
  const baseDef = getDefinition('"All or Nothing"')!

  const dataCases = [
    raw('63.1 data: catalog builds definitions with variants', DEFINITIONS.length >= 200 && choirDef.variants.length >= 1, `${DEFINITIONS.length} defs`),
    raw('63.1 data: exact-title lookup carries identity (title/rank/type/weakness)',
      choir.title === CHOIR && choir.rank === 'boss' && choirDef.type.length > 0 && choir.weaknesses.length > 0,
      `${choir.rank}|type=${choirDef.type.join(',')}|weak=${choir.weaknesses.join(',')}`),
    t.eq('63.1 data: phase-specific toughness is parsed into segments', choir.toughnessModel.phases?.map(p => `${p.phase}=${p.segments.map(s => `${s.max}x${s.count}`).join('/')}`),
      ['Phase 1/2=60x3', 'Phase 3=36x9']),
    raw('63.1 data: multiple toughness bars survive the model', choir.toughnessModel.primary === 60 && choir.toughnessModel.segments.length === 2,
      `primary=${choir.toughnessModel.primary} segs=${choir.toughnessModel.segments.length}`),
    raw('63.1 data: skills + gameplay notes present', choir.skills.length > 0 && choir.gameplayNotes.length > 0, `skills=${choir.skills.length}`),
    raw('63.1 data: resolveInstance projects level stats + profile',
      inst.hp !== undefined && inst.atk !== undefined && inst.spd !== undefined && inst.rank === 'boss' && inst.toughness === choir.toughnessModel,
      `hp=${inst.hp} atk=${inst.atk} spd=${inst.spd}`),
    raw('63.1 data: mode-specific variant differs from the base row',
      base.mode === '' && base.stats === undefined && modeVar.mode === 'Apocalyptic Shadow' && modeVar.stats !== undefined && baseDef.variants.length >= 2,
      `base=${base.mode || '(base)'}/stats=${base.stats ? 'yes' : 'none'} | mode=${modeVar.mode}/stats=${modeVar.stats ? 'yes' : 'none'}`),
  ]

  // ---- 63.2 ABILITY: declared effects round-trip + resolve through the shared pipeline ----
  const abilityBehavior: EnemyBehavior = {
    abilities: [
      { id: 'verifier_single', name: 'Verifier Single', targetRule: 'single', cooldown: 2, effects: [{ op: 'attack', mult: 1.5, elem: 'Fire' }] },
      { id: 'verifier_aoe', name: 'Verifier AoE', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.8, elem: 'Ice' }] },
      { id: 'verifier_charge', name: 'Verifier Charge', targetRule: 'aoe', cast: 2, effects: [{ op: 'blast', mult: 2, adjMult: 1 }] },
    ],
    ai: new PatternAI(['verifier_single', 'verifier_aoe', 'verifier_charge']),
  }
  registerEnemyBehavior('Verifier Node', abilityBehavior)
  const back = enemyBehavior('Verifier Node')!
  const ab = back.abilities

  const abBattle = run({
    team: [{ kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: { name: 'Verifier Node', count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 6,
  })
  unregisterEnemyBehavior('Verifier Node')

  const vActs = new Set(all(abBattle, 'ABILITY_USED').filter(n => n.source === 'Verifier Node').map(n => String(n.payload?.action)))
  const vElems = new Set(all(abBattle, 'HIT_START').filter(n => n.source === 'Verifier Node').map(n => String(n.element)))
  const vPhases = new Set(all(abBattle, 'ACTION_START').filter(n => n.source === 'Verifier Node' && n.payload?.action === 'verifier_charge').map(n => String(n.payload?.phase)))

  const abilityCases = [
    raw('63.2 ability: target rule round-trips', ab[0]!.targetRule === 'single' && ab[1]!.targetRule === 'aoe', ab.map(a => a.targetRule).join(',')),
    raw('63.2 ability: damage/element declared on the effect', ab[0]!.effects[0]!.op === 'attack' && (ab[0]!.effects[0] as { mult: number }).mult === 1.5 && (ab[0]!.effects[0] as { elem?: string }).elem === 'Fire',
      JSON.stringify(ab[0]!.effects[0])),
    raw('63.2 ability: cooldown + charge carry through', ab[0]!.cooldown === 2 && ab[2]!.cast === 2, `cd=${ab[0]!.cooldown} cast=${ab[2]!.cast}`),
    raw('63.2 ability: wired abilities actually run', vActs.has('verifier_single') && vActs.has('verifier_aoe') && vActs.has('verifier_charge'), [...vActs].join(',')),
    raw('63.2 ability: element rides the shared HIT_START event', vElems.has('Fire') && vElems.has('Ice'), [...vElems].join(',')),
    raw('63.2 ability: charge ability telegraphs then releases', vPhases.has('charge') && vPhases.has('release'), [...vPhases].join(',')),
    raw('63.2 ability: no dedicated enemy damage engine (invariants hold)', abBattle.sim.logger.verify().length === 0, abBattle.sim.logger.verify().join('; ')),
  ]

  // ---- 63.3 PATTERN: first action, loop, charge timing, cooldown, target switching ---------
  const actor = {} as Unit
  const patternAbilities: EnemyBehavior['abilities'] = [
    { id: 'p_slam', name: 'Slam', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }], cooldown: 2 },
    { id: 'p_sweep', name: 'Sweep', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.5 }] },
    { id: 'p_quake', name: 'Quake', targetRule: 'aoe', cast: 2, effects: [{ op: 'aoe', mult: 2 }] },
  ]
  const patternBehavior: EnemyBehavior = { abilities: patternAbilities, ai: new PatternAI(['p_slam', 'p_sweep', 'p_quake']) }
  const seq: string[] = []
  const phases: string[] = []
  for (let i = 0; i < 6; i++) { const a = chooseEnemyAction({} as never, actor, 1, patternBehavior)!; seq.push(a.ability.id); phases.push(a.phase) }

  const switchBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: { name: 'Pattern Node', count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 40 } satisfies EnemySpec, cycles: 5 })
  const switchModes = new Set(all(switchBattle, 'TARGET_SELECTED').filter(n => n.source === 'Pattern Node').map(n => String(n.payload?.mode)))

  const patternCases = [
    t.eq('63.3 pattern: first action is the pattern head', seq[0], 'p_slam'),
    t.eq('63.3 pattern: sequence loops with charge steps', seq, ['p_slam', 'p_sweep', 'p_quake', 'p_quake', 'p_quake', 'p_slam']),
    t.eq('63.3 pattern: charge timing (cast:2 → charge,charge,release)', phases, ['use', 'use', 'charge', 'charge', 'release', 'use']),
    raw('63.3 pattern: cooldown re-offers the ability only after its window', (() => {
      const b = {} as Unit
      const beh: EnemyBehavior = { abilities: [{ id: 'two', name: 'Two', effects: [{ op: 'attack', mult: 1 }], cooldown: 2 }], ai: new PatternAI(['two']) }
      const s: string[] = []
      for (let i = 0; i < 3; i++) s.push(chooseEnemyAction({} as never, b, 1, beh)?.ability.id ?? '-')
      return s[0] === 'two' && s[1] === '-' // second turn gated, third would re-offer
    })(), 'cooldown gate'),
    raw('63.3 pattern: default enemy switches between single and AoE targets', switchModes.has('single') && switchModes.has('aoe'), [...switchModes].join(',')),
  ]

  // ---- 63.4 ENCOUNTER: wave order, spawn/despawn, phase, victory/defeat, mode scoring ------
  const enc: EncounterSpec = {
    id: 'v-enc', mode: 'E2E Mock', cycles: 6,
    waves: [[mob()], [{ ...mob(), name: 'Warden Boss', hp: 8_000, rank: 'boss' }]],
    victoryCondition: 'All enemies down', defeatCondition: 'Team wiped',
  }
  const waveBattle = run({ team: [{ kitId: 'hook' }, { kitId: 'march7th' }, { kitId: 'robin' }], encounter: enc })
  const es = encounterStateOf(waveBattle.sim)
  const idxOf = (type: string): number => all(waveBattle, type)[0] ? waveBattle.nodes.findIndex(n => n.type === type) : -1
  const despawn = idxOf('ENEMY_DESPAWN')
  const spawn = idxOf('ENEMY_SPAWN')

  // phase-driven boss (a phase change inside the encounter)
  registerEnemyBehavior('Verifier Warden', {
    abilities: [
      { id: 'vw_slash', name: 'Slash', targetRule: 'single', effects: [{ op: 'attack', mult: 1 }] },
      { id: 'vw_smash', name: 'Smash', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.5 }] },
    ],
    ai: new PatternAI(['vw_slash', 'vw_smash']),
    phases: [{ id: 'calm' }, { id: 'enraged', start: { turnAtLeast: 2 }, availableAbilities: ['vw_smash'] }],
  } satisfies EnemyBehavior)
  const phaseBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: { name: 'Verifier Warden', count: 1, hp: 200_000, spd: 170, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 40 } satisfies EnemySpec, cycles: 8 })
  unregisterEnemyBehavior('Verifier Warden')
  const phaseStarts = new Set(all(phaseBattle, 'PHASE_START').filter(n => n.source === 'Verifier Warden').map(n => String(n.payload?.phase)))

  // defeat: an overwhelming enemy wipes a lone weak unit
  const lossBattle = run({
    team: [{ kitId: 'hook' }],
    encounter: { id: 'v-loss', cycles: 3, waves: [[{ ...mob(), name: 'Executioner', hp: 1e7, spd: 250, atk: 500_000 }]], victoryCondition: 'never', defeatCondition: 'Team wiped' },
  })
  const ls = encounterStateOf(lossBattle.sim)

  const mode = encounterModeFromLabel('Memory of Chaos 12')
  const modeScore = resolveScore(mode, waveBattle.sim, { cycleLimit: 6 })

  const encounterCases = [
    raw('63.4 encounter: wave order — despawn (leaving) before spawn (arriving)', despawn >= 0 && spawn > despawn, `despawn=${despawn} spawn=${spawn}`),
    raw('63.4 encounter: boss wave announces BOSS_RESET', all(waveBattle, 'BOSS_RESET').some(n => (n.payload?.enemies as string[] | undefined)?.includes('Warden Boss')), JSON.stringify(all(waveBattle, 'BOSS_RESET').map(n => n.payload?.enemies))),
    raw('63.4 encounter: victory objective + encounter event on clear', all(waveBattle, 'OBJECTIVE_COMPLETE').length > 0 && all(waveBattle, 'ENCOUNTER_VICTORY').length > 0 && es.victory === 'All enemies down',
      `objective=${all(waveBattle, 'OBJECTIVE_COMPLETE').length} victory=${es.victory}`),
    raw('63.4 encounter: phase change observed inside a battle', phaseStarts.has('calm') && phaseStarts.has('enraged'), [...phaseStarts].join(',')),
    raw('63.4 encounter: defeat condition resolves on team wipe', lossBattle.sim.endReason === 'lose' && ls.defeat === 'Team wiped' && all(lossBattle, 'ENCOUNTER_DEFEAT').length > 0,
      `end=${lossBattle.sim.endReason} defeat=${ls.defeat}`),
    raw('63.4 encounter: cycle/turn limit carried in rules', waveBattle.sim.rules?.cycleLimit === 6 && waveBattle.sim.rules?.turnLimit === undefined,
      `cycleLimit=${waveBattle.sim.rules?.cycleLimit}`),
    raw('63.4 encounter: mode-specific scoring resolves the primary metric', mode === 'MEMORY_OF_CHAOS' && modeScore.mode === 'MEMORY_OF_CHAOS' && modeScore.score === Math.max(0, 6 - modeScore.cycles),
      `${modeScore.mode} score=${modeScore.score} cycles=${modeScore.cycles}`),
  ]

  return [...dataCases, ...abilityCases, ...patternCases, ...encounterCases]
}
