/**
 * §64 — first production boss profile: "Dark Sun Gryphon" (Elite, Wind, 160 Toughness).
 *
 * Unlike the harness behaviors registered inline by `tests/golden/enemies/verification.ts`, this
 * profile ships in `src/core/enemy/profiles.ts` and is seeded into the registry at import — so the
 * battle below wires NOTHING test-side; it just names the enemy and the engine's `enemyTurn` finds
 * the behavior. Covers: registration, declared abilities, first action, rotation with a §55
 * telegraph, real resolution through the shared damage pipeline, determinism, and a real encounter.
 */
import { run, raw, all } from '../../_helpers/battle'
import { enemyBehavior } from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import type { EnemySpec } from '../../../src/core/battle'

const NAME = 'Dark Sun Gryphon'

const SPEC: EnemySpec = {
  name: NAME, count: 1, hp: 3_000_000, spd: 150, level: 80,
  toughness: 160, weaknesses: ['Physical', 'Fire', 'Quantum'], atk: 300,
}

export default () => {
  // ---- registration: production profile, no test-side registerEnemyBehavior -----------------
  const beh = enemyBehavior(NAME)
  const abs = beh?.abilities ?? []
  const bl = abs.find(a => a.id === 'gryphon_blacklight')
  const carol = abs.find(a => a.id === 'gryphon_carol')

  const regCases = [
    raw('bossProfile: "Dark Sun Gryphon" is registered in production', beh !== undefined && abs.length === 2, `abilities=${abs.length}`),
    raw('bossProfile: Blacklight Emission — AoE 300% Wind (data value)',
      bl?.targetRule === 'aoe' && bl?.name === 'Blacklight Emission' && bl?.effects[0]!.op === 'aoe'
        && (bl!.effects[0] as { mult: number }).mult === 3.0 && (bl!.effects[0] as { elem?: string }).elem === 'Wind',
      JSON.stringify(bl?.effects[0])),
    raw('bossProfile: Carol of Heat Death — AoE 450% Wind, telegraphed (cast:1)',
      carol?.targetRule === 'aoe' && carol?.name === 'Carol of Heat Death' && carol?.cast === 1
        && (carol!.effects[0] as { mult: number }).mult === 4.5 && (carol!.effects[0] as { elem?: string }).elem === 'Wind',
      `cast=${carol?.cast} ${JSON.stringify(carol?.effects[0])}`),
  ]

  // ---- real battle through the normal EnemySpec path ---------------------------------------
  const battle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: SPEC, cycles: 6 })

  const acts = all(battle, 'ABILITY_USED').filter(n => n.source === NAME)
  const actIds = acts.map(n => String(n.payload?.action))
  const carolPhases = new Set(all(battle, 'ACTION_START').filter(n => n.source === NAME && n.payload?.action === 'gryphon_carol').map(n => String(n.payload?.phase)))
  const hits = all(battle, 'HIT_START').filter(n => n.source === NAME)
  const hitLabels = new Set(hits.map(n => String(n.label)))
  const hitElems = new Set(hits.map(n => String(n.element)))
  const dmgDealt = all(battle, 'DAMAGE_DEALT').filter(n => n.source === NAME).reduce((s, n) => s + Number(n.payload?.amount ?? 0), 0)

  // first two rotations are the pattern head then the charged nuke: blacklight, (charge) …
  const firstCarol = actIds.indexOf('gryphon_carol')

  const battleCases = [
    raw('bossProfile: first action is the pattern head (Blacklight Emission)', actIds[0] === 'gryphon_blacklight', actIds.slice(0, 4).join(',')),
    raw('bossProfile: rotation develops head → charged nuke', firstCarol > 0 && actIds.includes('gryphon_blacklight'), actIds.slice(0, 6).join(',')),
    raw('bossProfile: the telegraph spans charge then release', carolPhases.has('charge') && carolPhases.has('release'), [...carolPhases].join(',')),
    raw('bossProfile: both abilities resolve through the shared pipeline',
      hitLabels.has('Blacklight Emission') && hitLabels.has('Carol of Heat Death'), [...hitLabels].join(',')),
    raw('bossProfile: element rides the shared HIT_START event', hitElems.has('Wind'), [...hitElems].join(',')),
    raw('bossProfile: damage lands as a real battle result (not just an id)', dmgDealt > 0, `dealt=${dmgDealt}`),
    raw('bossProfile: invariants hold — no dedicated enemy damage engine', battle.sim.logger.verify().length === 0, battle.sim.logger.verify().join('; ')),
  ]

  // ---- determinism: same seed → same enemy action/phase trace ------------------------------
  const sig = (c: ReturnType<typeof run>): string =>
    all(c, 'ACTION_START').filter(n => n.source === NAME).map(n => `${n.payload?.action}:${String(n.payload?.phase ?? '')}`).join('|')
  const battle2 = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: SPEC, cycles: 6 })
  const detCases = [
    raw('bossProfile: deterministic across runs (same seed → same enemy trace)', sig(battle) === sig(battle2) && sig(battle).length > 0, sig(battle).slice(0, 40)),
  ]

  // ---- real encounter: the boss spawns and acts inside a wave-based encounter ---------------
  const enc: EncounterSpec = {
    id: 'gryphon-enc', mode: 'E2E Mock', cycles: 6,
    waves: [[{ ...SPEC, rank: 'elite' }]],
    victoryCondition: 'All enemies down', defeatCondition: 'Team wiped',
  }
  const encBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], encounter: enc })
  const encState = encounterStateOf(encBattle.sim)
  const encActs = all(encBattle, 'ABILITY_USED').filter(n => n.source === NAME).map(n => String(n.payload?.action))
  const encCases = [
    raw('bossProfile: boss spawns + acts inside a real encounter', encActs.includes('gryphon_blacklight') && encActs.includes('gryphon_carol'), `${encActs.length} acts`),
    raw('bossProfile: encounter state tracks the wave', encState.currentWave >= 1, `wave=${encState.currentWave}`),
  ]

  return [...regCases, ...battleCases, ...detCases, ...encCases]
}
