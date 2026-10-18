import { run, all, raw } from '../../_helpers/battle'
import type { Case } from '../../suites'
import type { EnemySpec } from '../../../src/core/battle'
import {
  PatternAI, registerEnemyBehavior, unregisterEnemyBehavior,
  type EnemyAbilityDefinition,
} from '../../../src/core/enemy'

/** L179 missing CC — enemies could damage/delay/advance/heal/counter but had NO way to apply a
 *  control state, while the whole ally-side control machine (Freeze turn-skip in TurnManager,
 *  Entanglement tick, Imprisonment apply-time delay + SPD↓, buff-debuff path with Effect RES,
 *  §57/§58 control-immune gate) already existed. The two new `EnemyEffect` operators route
 *  through those shared chokepoints:
 *  - `{ op: 'control' }` inflicts a DoT-kind control (Freeze skips the target's next turn)
 *    through DotSystem → CONTROL_APPLIED, with the Weakness-Break apply-time semantics mirrored,
 *  - `{ op: 'debuff' }` inflicts a stat debuff through applyDebuff → DEBUFF_APPLIED, one Effect-RES
 *    roll per target, and enemy sources never feed the ally `onDebuffInflict` kit hooks
 *    (Acheron Slashed Dream etc. fire on debuffs an ALLY lands, not on control hitting the team). */

const jinx = (chance: number): EnemyAbilityDefinition => ({
  id: 'jinx', name: 'Jinx', targetRule: 'single',
  effects: [{ op: 'debuff', chance, buff: { id: 'jinx_def', name: 'Jinxed DEF↓', mods: [{ stat: 'defRed', value: 0.2 }], turns: 2 } }],
})

export default (): Case[] => {
  const cases: Case[] = []

  // ---- B1: control + debuff operators end-to-end ------------------------------------------
  const warder = 'Control Warder'
  registerEnemyBehavior(warder, {
    abilities: [
      { id: 'cryo', name: 'Cryo Burst', targetRule: 'aoe', effects: [{ op: 'control', kind: 'Freeze', turns: 1 }] },
      jinx(1.0),
      { id: 'shackle', name: 'Shackle', targetRule: 'single', effects: [{ op: 'control', kind: 'Imprisonment', turns: 1 }] },
    ],
    ai: new PatternAI(['cryo', 'cryo', 'jinx', 'shackle', 'cryo', 'jinx']),
  })
  const b1 = run({
    team: [{ kitId: 'arlan' }, { kitId: 'serval' }],
    enemy: { name: warder, count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 6,
  })
  unregisterEnemyBehavior(warder)

  const ctrlFreeze = all(b1, 'CONTROL_APPLIED').filter(n => n.source === warder && n.payload?.kind === 'Freeze').length
  const dotFreeze = all(b1, 'DOT_APPLIED').filter(n => n.source === warder && n.payload?.kind === 'Freeze').length
  const skips = all(b1, 'ACTION_SKIPPED').filter(n => n.payload?.reason === 'frozen').length
  const ctrlExpire = all(b1, 'CONTROL_EXPIRED').filter(n => n.payload?.kind === 'Freeze').length
  const injectCharged = all(b1, 'DEBUFF_APPLIED').filter(n => n.source === warder && n.payload?.id === 'jinx_def').length
  const ctrlImprison = all(b1, 'CONTROL_APPLIED').filter(n => n.source === warder && n.payload?.kind === 'Imprisonment').length
  const delays = all(b1, 'ACTION_DELAY').filter(n => n.source === warder).length
  const jinxedWho = b1.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char' && b1.sim.hasBuff(u, 'jinx_def')).map(u => u.name)
  const imprisonSpdApplied = all(b1, 'DEBUFF_APPLIED').filter(n => n.source === warder && n.payload?.id === 'imprisonSpd').length
  const strayDebuffs = all(b1, 'DEBUFF_APPLIED').filter(n => n.source !== warder)

  cases.push(raw('control: enemy Freeze lands via the shared DoT path (CONTROL_APPLIED + DOT_APPLIED)', ctrlFreeze >= 1 && dotFreeze >= 1, `${ctrlFreeze}/${dotFreeze}`))
  cases.push(raw("control: a Frozen ally's next turn is skipped (ACTION_SKIPPED) then the control expires", skips >= 1 && ctrlExpire >= 1, `skips=${skips} expired=${ctrlExpire}`))
  cases.push(raw('debuff: single-target debuff lands with Effect-RES roll → DEBUFF_APPLIED + buff on an ally', injectCharged >= 1 && jinxedWho.length >= 1, `${jinxedWho.join(',')}`))
  cases.push(raw('control: Imprisonment delays + SPD↓ buffs the ally (matches Weakness-Break semantics)', ctrlImprison >= 1 && delays >= 1 && imprisonSpdApplied >= 1, `imprison=${ctrlImprison} delay=${delays} spd=${imprisonSpdApplied}`))
  cases.push(raw('control: no other debuff source in the battle (ally kits applied nothing)', strayDebuffs.length === 0, `stray=${strayDebuffs.length}`))
  cases.push(raw('invariants: none after control battle', b1.sim.logger.verify().length === 0, b1.sim.logger.verify().join('; ')))

  // ---- B2: debuff Effect-RES resistance (deterministic chance 0 → never lands) ------------
  const resist = 'Resist Warder'
  registerEnemyBehavior(resist, {
    abilities: [jinx(0)],
    ai: new PatternAI(['jinx', 'jinx', 'jinx']),
  })
  const b2 = run({
    team: [{ kitId: 'arlan' }],
    enemy: { name: resist, count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 3,
  })
  unregisterEnemyBehavior(resist)
  const resistedLanded = all(b2, 'DEBUFF_APPLIED').filter(n => n.source === resist).length
  const resistedWho = b2.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char' && b2.sim.hasBuff(u, 'jinx_def')).length
  cases.push(raw('debuff: a failed Effect-RES roll lands nothing (no DEBUFF_APPLIED, no buff)', resistedLanded === 0 && resistedWho === 0, `applied=${resistedLanded}`))
  cases.push(raw('debuff: the failed roll is observable as a resist note', b2.sim.logLines.some(l => /RESISTS/i.test(l)), 'no log line'))

  // ---- B3: enemy-source debuffs must NOT feed ally onDebuffInflict hooks (Acheron stopwatch) —
  // twin battles: identical team/enemy stats/seed/timeline, the ONLY difference is whether the
  // enemy's ability applies a debuff. With the guard, Acheron's Slashed Dream is identical in both
  // (it can only come from her own actions, never from a control landing on the team).
  const mk = (enemyName: string, ability: EnemyAbilityDefinition): number => {
    registerEnemyBehavior(enemyName, { abilities: [ability], ai: new PatternAI([ability.id, ability.id]) })
    const b = run({
      team: [{ kitId: 'acheron', stats: { hp: 30000, atk: 1000, def: 500, spd: 40 } }, { kitId: 'natasha', stats: { hp: 20000, atk: 800, def: 500, spd: 100 } }],
      enemy: { name: enemyName, count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Lightning'], atk: 60 },
      cycles: 2,
    })
    unregisterEnemyBehavior(enemyName)
    const jdef = all(b, 'DEBUFF_APPLIED').filter(n => n.payload?.id === 'jinx_def').length
    return jdef * 1000 + (b.sim.roster.find(u => u.kitId === 'acheron')!.energy)
  }
  const withJinx = mk('Jinx Warder', jinx(1.0))
  const withoutJinx = mk('Plain Warder', { id: 'plain', name: 'Plain Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 0.001 }] })
  const jinxLanded = Math.floor(withJinx / 1000)
  cases.push(raw('control: enemy debuff on an ally does not feed ally onDebuffInflict (Acheron SD identical with/without enemy debuff)',
    jinxLanded >= 1 && (withJinx % 1000) === (withoutJinx % 1000),
    `jinxLanded=${jinxLanded} SD(jinx)=${withJinx % 1000} SD(plain)=${withoutJinx % 1000}`))

  return cases
}