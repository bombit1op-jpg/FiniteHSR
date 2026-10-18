import { chk, run, raw, all, mob } from '../../_helpers/battle'

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN)

/**
 * HP change semantics are not one thing: a kit's self-drain is a direct HP loss, not a damage
 * event. Castorice's Skill drains 30% of her own HP into the Newbud pool, so with a huge Max HP
 * the caster drops below full while the battle lands ZERO DAMAGE_DEALT on her — proving the loss
 * did not travel through the damage pipeline. Her Netherwing then emits HEAL_APPLIED.
 */
export default () => {
  const c = run({
    team: [{ kitId: 'castorice', stats: { hp: 100000, atk: 1000, def: 600, spd: 200 } }],
    enemy: mob({ name: 'Elite', hp: 6000000, atk: 8000, spd: 120 }),
    cycles: 5,
  })
  const caster = c.sim.roster.find(u => u.kitId === 'castorice')!
  const dmgOnCaster = all(c, 'DAMAGE_DEALT').filter(n => n.target === 'Castorice')
  const heals = all(c, 'HEAL_APPLIED').filter(n => n.target === 'Castorice')
  const bounded = c.sim.roster.every(u => u.hp >= 0 && u.hp <= u.maxHp)
  return [
    raw('self-drain is HP loss, not a damage event', caster.hp < caster.maxHp && dmgOnCaster.length === 0,
      `hp=${Math.round(caster.hp)}/${caster.maxHp} dmgOnCaster=${dmgOnCaster.length}`),
    chk('heal event reaches the caster', c, { assert: 'present', of: { type: 'HEAL_APPLIED', target: 'Castorice' } }),
    raw('heal carries a positive amount', heals.length > 0 && heals.every(n => num(n.payload.amount) > 0),
      heals.map(n => String(n.payload.amount)).join(',')),
    raw('0 <= HP <= maxHP holds for every unit', bounded),
  ]
}
