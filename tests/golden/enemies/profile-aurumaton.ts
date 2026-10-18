/**
 * §64 — second production boss profile: "Aurumaton Spectral Envoy" (Elite, Physical, 100 Toughness).
 *
 * Shipping in `src/core/enemy/profiles.ts` and seeded into the registry at import, so the battle
 * below wires NOTHING test-side. Unlike "Dark Sun Gryphon" this profile exercises the `debuff`
 * operator (Reverberation on the team). Covers: registration, declared abilities + data values,
 * first action, full rotation, the debuff landing through the shared Effect-RES path, real
 * resolution through the shared damage pipeline, determinism, and a real encounter.
 *
 * Known deviations (see TODO.md): the Reverberation → Strong Reverberation on-attack reaction and
 * the Soul Warrant "Heaven's Fall" follow-up are NOT modelled (no enemy reaction/lock-on trigger,
 * and "Heaven's Fall" has no damage data).
 */
import { run, raw, all } from '../../_helpers/battle'
import { enemyBehavior } from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import type { EnemySpec } from '../../../src/core/battle'

const NAME = 'Aurumaton Spectral Envoy'

const SPEC: EnemySpec = {
  name: NAME, count: 1, hp: 3_000_000, spd: 150, level: 80,
  toughness: 100, weaknesses: ['Physical', 'Lightning', 'Imaginary'], atk: 300,
}

export default () => {
  // ---- registration: production profile, no test-side registerEnemyBehavior -----------------
  const beh = enemyBehavior(NAME)
  const abs = beh?.abilities ?? []
  const adj = abs.find(a => a.id === 'envoy_adjudicate')
  const sub = abs.find(a => a.id === 'envoy_subdue')
  const yin = abs.find(a => a.id === 'envoy_yin_yang')
  const debuffOf = (a?: { effects: readonly unknown[] }) =>
    a?.effects.find((e): e is { op: string; chance?: number; buff?: { id: string; turns?: number } } => (e as { op: string }).op === 'debuff')

  const subDeb = debuffOf(sub)
  const yinDeb = debuffOf(yin)

  const regCases = [
    raw('envoyProfile: "Aurumaton Spectral Envoy" is registered in production', beh !== undefined && abs.length === 3, `abilities=${abs.length}`),
    raw('envoyProfile: Adjudicate — Single Target 300% Physical (data value)',
      adj?.targetRule === 'single' && adj?.name === 'Adjudicate'
        && (adj!.effects[0] as { op: string; mult: number }).op === 'attack'
        && (adj!.effects[0] as { mult: number }).mult === 3.0 && (adj!.effects[0] as { elem?: string }).elem === 'Physical',
      JSON.stringify(adj?.effects[0])),
    raw('envoyProfile: Subdue — 360% Physical + 70% Reverberation (2 Turns), one target',
      sub?.targetRule === 'single' && (sub!.effects[0] as { mult: number }).mult === 3.6
        && subDeb?.chance === 0.70 && subDeb.buff?.id === 'reverberation' && subDeb.buff?.turns === 2,
      JSON.stringify(sub?.effects)),
    raw('envoyProfile: Revert Yin and Yang — AoE 300% Physical + 35% Reverberation (2 Turns)',
      yin?.targetRule === 'aoe' && (yin!.effects[0] as { op: string; mult: number }).op === 'aoe' && (yin!.effects[0] as { mult: number }).mult === 3.0
        && yinDeb?.chance === 0.35 && yinDeb.buff?.id === 'reverberation',
      JSON.stringify(yin?.effects)),
  ]

  // ---- real battle through the normal EnemySpec path ---------------------------------------
  const battle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: SPEC, cycles: 6 })

  const acts = all(battle, 'ABILITY_USED').filter(n => n.source === NAME)
  const actIds = acts.map(n => String(n.payload?.action))
  const hits = all(battle, 'HIT_START').filter(n => n.source === NAME)
  const hitLabels = new Set(hits.map(n => String(n.label)))
  const hitElems = new Set(hits.map(n => String(n.element)))
  const dmgDealt = all(battle, 'DAMAGE_DEALT').filter(n => n.source === NAME).reduce((s, n) => s + Number(n.payload?.amount ?? 0), 0)
  const reverbApplied = all(battle, 'DEBUFF_APPLIED').filter(n => n.source === NAME && n.payload?.id === 'reverberation').length
  const reverbOnAlly = battle.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char' && battle.sim.hasBuff(u, 'reverberation')).length

  const battleCases = [
    raw('envoyProfile: first action is the pattern head (Adjudicate)', actIds[0] === 'envoy_adjudicate', actIds.slice(0, 4).join(',')),
    raw('envoyProfile: the rotation develops through all three abilities',
      new Set(actIds).size === 3, [...new Set(actIds)].join(',')),
    raw('envoyProfile: all three abilities resolve through the shared pipeline',
      hitLabels.has('Adjudicate') && hitLabels.has('Subdue') && hitLabels.has('Revert Yin and Yang'), [...hitLabels].join(',')),
    raw('envoyProfile: element rides the shared HIT_START event', hitElems.has('Physical') && hitElems.size === 1, [...hitElems].join(',')),
    raw('envoyProfile: damage lands as a real battle result (not just an id)', dmgDealt > 0, `dealt=${dmgDealt}`),
    raw('envoyProfile: Reverberation lands on the team through the shared Effect-RES path',
      reverbApplied >= 1, `applied=${reverbApplied} onAlly=${reverbOnAlly}`),
    raw('envoyProfile: invariants hold — no dedicated enemy damage engine', battle.sim.logger.verify().length === 0, battle.sim.logger.verify().join('; ')),
  ]

  // ---- determinism: same seed → same enemy action trace ------------------------------------
  const sig = (c: ReturnType<typeof run>): string =>
    all(c, 'ACTION_START').filter(n => n.source === NAME).map(n => `${n.payload?.action}:${String(n.payload?.phase ?? '')}`).join('|')
  const battle2 = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: SPEC, cycles: 6 })
  const detCases = [
    raw('envoyProfile: deterministic across runs (same seed → same enemy trace)', sig(battle) === sig(battle2) && sig(battle).length > 0, sig(battle).slice(0, 40)),
  ]

  // ---- real encounter: the boss spawns and acts inside a wave-based encounter ---------------
  const enc: EncounterSpec = {
    id: 'envoy-enc', mode: 'E2E Mock', cycles: 6,
    waves: [[{ ...SPEC, rank: 'elite' }]],
    victoryCondition: 'All enemies down', defeatCondition: 'Team wiped',
  }
  const encBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], encounter: enc })
  const encState = encounterStateOf(encBattle.sim)
  const encActs = all(encBattle, 'ABILITY_USED').filter(n => n.source === NAME).map(n => String(n.payload?.action))
  const encCases = [
    raw('envoyProfile: boss spawns + acts inside a real encounter', encActs.includes('envoy_adjudicate'), `${encActs.length} acts`),
    raw('envoyProfile: encounter state tracks the wave', encState.currentWave >= 1, `wave=${encState.currentWave}`),
  ]

  return [...regCases, ...battleCases, ...detCases, ...encCases]
}
