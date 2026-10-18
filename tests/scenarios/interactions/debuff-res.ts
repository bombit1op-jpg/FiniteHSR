/**
 * §11 Debuff RES — scenario-level engagement. The unit/regression suite proves the resolver and
 * the `addEnemy` plumbing; this proves a *real battle* gates a rolled debuff through it.
 *
 * Hook's Skill applies a Burn at base chance 1.0 (destruction.ts `applyBurn` → `applyDebuff(..., 'Burn')`).
 * On a plain dummy that is a guaranteed land (1.0 × (1+EHR) ≥ 1 → capped); on a Burn-immune one the
 * `debuffResMult` factor is 0, so it is a guaranteed resist. Holding team/seed fixed isolates the
 * Debuff RES gate from EHR / Effect RES / RNG — the only variable is the target's debuffRes.
 *
 * No Weakness is set: a Fire Weakness Break applies its Burn UNCONDITIONALLY (break debuffs bypass
 * the roll), which would mask the gate. Without a break the only Burn source is Hook's Skill.
 */
import { run, raw, all, mob, type Ctx } from '../../_helpers/battle'

const BURN_IMMUNE = [0, 1, 0, 0, 0, 0, 0, 0]

/** Burn DOT_APPLIED events (kind lives in the payload, not the event type). */
const burns = (c: Ctx) => all(c, 'DOT_APPLIED').filter(n => String(n.payload.kind) === 'Burn')
const ticks = (c: Ctx) => all(c, 'DOT_TICK').filter(n => String(n.payload.kind) === 'Burn').length
const foe = (c: Ctx) => c.sim.roster.find(u => u.side === 'enemy')!

export default () => {
  const team = [{ kitId: 'hook', skillPriority: 1 }]
  const normal = run({ team, enemy: mob({ hp: 400_000, weaknesses: [] }), cycles: 3 })
  const immune = run({ team, enemy: mob({ hp: 400_000, weaknesses: [], debuffRes: BURN_IMMUNE }), cycles: 3 })
  const iFoe = foe(immune)

  return [
    raw('control: Hook Burn lands on a plain enemy (base 1.0)',
      burns(normal).length > 0, `burns=${burns(normal).length}`),
    raw('Debuff RES: a Burn-immune enemy never receives Burn',
      burns(immune).length === 0, `burns=${burns(immune).length}`),
    raw('Debuff RES gates only Burn — the immune enemy still takes HP damage',
      iFoe.hp < 400_000, `hp=${iFoe.hp}`),
    raw('the applied Burn ticks DoT damage on the plain enemy only',
      ticks(normal) > 0 && ticks(immune) === 0,
      `normal=${ticks(normal)} immune=${ticks(immune)}`),
  ]
}
