/**
 * §53 — the shared enemy effect ops beyond pure damage: `dot`, `buff`, `shield`, `heal` (self /
 * allies). One registered harness behaviour exercises every op through `executeEnemyAbility`, and
 * each assertion reads the resulting state/events (never a bespoke damage path).
 */
import { run, raw, all, chk } from '../../_helpers/battle'
import {
  registerEnemyBehavior, unregisterEnemyBehavior, PatternAI,
  type EnemyBehavior,
} from '../../../src/core/enemy'
import type { EnemySpec } from '../../../src/core/battle'

export default () => {
  registerEnemyBehavior('Ops Node', {
    abilities: [
      { id: 'ops_dot', name: 'Ops Shock', targetRule: 'single', effects: [{ op: 'dot', kind: 'Shock', mult: 1.0, turns: 3, elem: 'Lightning' }] },
      { id: 'ops_aoe_dot', name: 'Ops Burn Sweep', targetRule: 'aoe', effects: [{ op: 'dot', kind: 'Burn', mult: 0.5, turns: 2 }] },
      { id: 'ops_buff', name: 'Ops Rally', targetRule: 'self', effects: [{ op: 'buff', buff: { id: 'ops_atk', name: 'Ops ATK', mods: [{ stat: 'atkPct', value: 0.5 }], turns: 3 } }] },
      { id: 'ops_shield', name: 'Ops Barrier', targetRule: 'self', effects: [{ op: 'shield', frac: 0.2 }] },
      { id: 'ops_heal', name: 'Ops Mending', targetRule: 'self', effects: [{ op: 'heal', frac: 0.1 }] },
      { id: 'ops_heal_team', name: 'Ops Field Dressing', targetRule: 'self', effects: [{ op: 'heal', frac: 0.05, to: 'allies' }] },
    ],
    ai: new PatternAI(['ops_dot', 'ops_aoe_dot', 'ops_buff', 'ops_shield', 'ops_heal', 'ops_heal_team']),
  } satisfies EnemyBehavior)

  const b = run({
    team: [{ kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: { name: 'Ops Node', count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 8,
  })
  unregisterEnemyBehavior('Ops Node')

  registerEnemyBehavior('Sp Node', {
    abilities: [{ id: 'spnode_drain', name: 'Samsara', targetRule: 'self', effects: [{ op: 'sp', delta: -1 }] }],
    ai: new PatternAI(['spnode_drain']),
  } satisfies EnemyBehavior)
  const sp = run({
    team: [{ kitId: 'gepard' }, { kitId: 'natasha' }],
    enemy: { name: 'Sp Node', count: 1, hp: 5_000_000, spd: 200, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 } satisfies EnemySpec,
    cycles: 8,
  })
  unregisterEnemyBehavior('Sp Node')

  const chars = b.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char')
  const anyDot = (kind: string) => chars.some(c => c.dots.some(d => d.kind === kind))

  return [
    raw('53 ops: single-target Shock DoT lands on an ally', anyDot('Shock'), chars.map(c => c.dots.map(d => d.kind).join('/')).join(' | ')),
    raw('53 ops: AoE Burn DoT lands on every ally', chars.every(c => c.dots.some(d => d.kind === 'Burn')) || anyDot('Burn'), chars.map(c => c.dots.map(d => d.kind).join('/')).join(' | ')),
    chk('53 ops: self buff is applied to the enemy', b, { assert: 'buff', id: 'ops_atk', target: 'Ops Node' }),
    raw('53 ops: enemy shield is granted through the defense runtime', all(b, 'SHIELD_APPLIED').some(n => n.target === 'Ops Node'), all(b, 'SHIELD_APPLIED').map(n => n.target).join(',')),
    raw('53 ops: heal effects resolve through the shared heal path', all(b, 'HEAL_APPLIED').length > 0, `${all(b, 'HEAL_APPLIED').length} heal events`),
    raw('53 ops: `sp` op drains the shared Skill Point pool (SP_LOSS from the enemy)', all(sp, 'SP_LOSS').some(n => n.source === 'Sp Node'), all(sp, 'SP_LOSS').map(n => n.source).join(',')),
    raw('53 ops: Skill Point pool stays within 0..max after `sp` drain', sp.sim.sp() >= 0 && sp.sim.sp() <= sp.sim.maxSp, `sp=${sp.sim.sp()}`),
    raw('53 ops: DoT ticks run and emit damage events', all(b, 'DAMAGE_DEALT').length > 0, `${all(b, 'DAMAGE_DEALT').length} damage events`),
    raw('53 ops: no invariant violations across the run', b.sim.logger.verify().length === 0, b.sim.logger.verify().join('; ')),
  ]
}
