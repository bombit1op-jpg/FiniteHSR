import { run, raw, name, all } from '../../_helpers/battle'
import { buffSum } from '../../../src/core/combat/StatResolver'

/**
 * Ablation (guide §16 / Phase-B item 17): turn one input off and pin the delta. Each case changes
 * exactly one variable against a fixed seed, so the effect is attributable. (CRIT-rate ablation is
 * deliberately not asserted — the RNG stream reorders, so the delta is not sign-stable.)
 */
export default () => {
  const carry = (over: Record<string, number>) =>
    run({ team: [{ kitId: 'hook', stats: { atk: 4000, hp: 8000, def: 600, spd: 100, ...over } }] })
  const dmg = (c: ReturnType<typeof run>): number =>
    all(c, 'DAMAGE_DEALT').reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)
  const acts = (c: ReturnType<typeof run>): number => {
    const h = name(c, 'hook')
    return all(c, 'ACTION_START').filter(n => n.source === h).length
  }

  const base = carry({})
  const lowAtk = carry({ atk: 2000 })
  const fast = carry({ spd: 200 })

  // disable one member: trio → duo, and watch the carry's DMG% drop
  const trio = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'bronya', skillPriority: 2 }, { kitId: 'hook' }] })
  const duo = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'hook' }] })
  const hook = name(trio, 'hook')
  const dmgAll = (c: typeof trio): number => buffSum(c.sim.roster.find(u => u.name === hook)!.buffs, 'dmgAll')

  return [
    raw('halving ATK lowers the carry damage', dmg(base) > dmg(lowAtk), `${Math.round(dmg(base))} vs ${Math.round(dmg(lowAtk))}`),
    raw('raising SPD gives the carry more actions', acts(fast) > acts(base), `${acts(fast)} vs ${acts(base)}`),
    raw('disabling a supporter removes its DMG% from the carry', dmgAll(trio) > dmgAll(duo), `${dmgAll(trio)} vs ${dmgAll(duo)}`),
  ]
}
