import { run, raw, all, mob } from '../../_helpers/battle'
import { ENEMY_PRESETS, ENCOUNTER_PRESETS } from '../../../src/core/battle'
import { resolveEncounter, validateEncounter } from '../../../src/core/encounter'
import type { EnemySpec } from '../../../src/core/battle'
import type { Ctx } from '../../_helpers/battle'

/**
 * EncounterSpec (guide §21.3, roadmap B #13): a fixture/config names an encounter (waves + cycle
 * limit + stage effects) instead of inlining `enemy`/`enemyWaves`/`cycles`. The family law: an
 * encounter compiles to exactly the runtime setup an explicit encounter produces, named presets
 * resolve to the same fight, and structural problems are reported by `validateEncounter`.
 */
export default () => {
  const dmg = (c: Ctx): number => all(c, 'DAMAGE_DEALT').reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)
  const team = [{ kitId: 'hook' }]
  const waves: EnemySpec[][] = [[{ ...ENEMY_PRESETS.mob, count: 2 }], [{ ...ENEMY_PRESETS.mob, count: 1, hp: 40_000 }]]

  const explicit = run({ team, enemy: waves, cycles: 6 })
  const viaObject = run({ team, encounter: { id: 'x', waves, cycles: 6 } })
  const viaName = run({ team, encounter: 'mob' })
  const nameExplicit = run({ team, enemy: [[{ ...ENEMY_PRESETS.mob, count: 1 }]], cycles: 6 })
  const withEffect = run({ team, encounter: { id: 'e', waves, cycles: 6, effects: [{ stat: 'atkPct', value: 0.5, side: 'ally' }] } })
  const noEffect = run({ team, encounter: { id: 'e', waves, cycles: 6 } })

  const r = resolveEncounter(ENCOUNTER_PRESETS.moc12!)
  let unknownThrew = false
  try { run({ team, encounter: 'definitely_not_an_encounter' }) } catch { unknownThrew = true }

  return [
    raw('resolveEncounter keeps both waves + cycle limit',
      r.enemyWaves?.length === 2 && r.cycles === 8 && r.enemy.name === ENEMY_PRESETS.moc12_add!.name,
      `waves=${r.enemyWaves?.length} cycles=${r.cycles} enemy=${r.enemy.name}`),
    raw('encounter object == explicit enemy/enemyWaves/cycles (same damage)', dmg(explicit) === dmg(viaObject), `${dmg(explicit)} vs ${dmg(viaObject)}`),
    raw('encounter object == explicit (same event count)', all(explicit, 'DAMAGE_DEALT').length === all(viaObject, 'DAMAGE_DEALT').length),
    raw('named preset == inline preset spec', dmg(viaName) === dmg(nameExplicit), `${dmg(viaName)} vs ${dmg(nameExplicit)}`),
    raw('stage effect (effects → manualMods) raises ally damage', dmg(withEffect) > dmg(noEffect), `${dmg(withEffect)} vs ${dmg(noEffect)}`),
    raw('unknown encounter name fails loudly', unknownThrew),
    raw('validateEncounter accepts a valid spec', validateEncounter({ id: 'ok', waves: [[mob()]], cycles: 6 }).length === 0),
    raw('validateEncounter flags empty waves / bad count / bad hp',
      validateEncounter({ id: 'bad', waves: [[{ ...mob(), count: 0, hp: 0 }]] }).length === 2,
      validateEncounter({ id: 'bad', waves: [[{ ...mob(), count: 0, hp: 0 }]] }).join(',')),
    raw('validateEncounter flags empty waves array', validateEncounter({ id: 'bad', waves: [] }).includes('waves:empty')),
  ]
}
