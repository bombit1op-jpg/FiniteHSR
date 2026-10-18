import { run, raw } from '../../_helpers/battle'

/**
 * Attribution (guide §16 / Phase-B item 18): every point of damage is attributed to a stable OWNER
 * id — a summon's hits fold into its owner, an ally's break/DoT land on that ally — and the damage
 * axis partition sums back to the owner total (one map, no double counting).
 */
export default () => {
  // summon case: Jing Yuan owns the Lightning-Lord memosprite
  const jy = run({ team: [{ kitId: 'jingyuan', skillPriority: 1 }] })
  const jyChar = jy.sim.roster.find(u => u.kitId === 'jingyuan')!
  const jySkills = jy.sim.ownerSkill.get(jyChar.id)
  const summon = jy.sim.roster.find(u => u.side === 'ally' && u.kind !== 'char')

  // team case: two allies, each with its own attribution
  const trio = run({ team: [{ kitId: 'ruanmei', skillPriority: 1 }, { kitId: 'bronya', skillPriority: 2 }, { kitId: 'hook' }] })
  const rm = trio.sim.roster.find(u => u.kitId === 'ruanmei')!
  const hook = trio.sim.roster.find(u => u.kitId === 'hook')!
  const axisSumOk = [...trio.sim.ownerAxis].every(([id, m]) =>
    Math.abs([...m.values()].reduce((a, b) => a + b, 0) - (trio.sim.ownerDamage.get(id) ?? 0)) < 1e-6)

  return [
    raw('a non-character ally (summon) is present', !!summon, summon?.name),
    raw('summon ability folds under its owner', !!jySkills?.has('Lightning-Lord'), [...(jySkills?.keys() ?? [])].join('+')),
    raw('summon has no separate owner bucket', !summon || !jy.sim.ownerDamage.has(summon.id), summon?.id),
    raw('each ally attributes its own damage', (trio.sim.ownerDamage.get(rm.id) ?? 0) > 0 && (trio.sim.ownerDamage.get(hook.id) ?? 0) > 0,
      `rm=${Math.round(trio.sim.ownerDamage.get(rm.id) ?? 0)} hook=${Math.round(trio.sim.ownerDamage.get(hook.id) ?? 0)}`),
    raw('break damage is attributed to the breaker', (trio.sim.ownerAxis.get(rm.id)?.get('break') ?? 0) > 0,
      `break=${Math.round(trio.sim.ownerAxis.get(rm.id)?.get('break') ?? 0)}`),
    raw('damage axis buckets sum to the owner total', axisSumOk),
  ]
}
