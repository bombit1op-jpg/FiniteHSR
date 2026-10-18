/**
 * §27 `hp <= maxHP` — `StatResolver.eff()` must cap current HP when it lowers `maxHp`.
 *
 * This was a documented §33 known deviation: an HP%-buff expiring (Hyacine Technique "+20% Max HP
 * for 2 turn(s)", her Ultimate, Fu Xuan / Lynx) recomputed `maxHp` while `hp` stayed at the buffed
 * cap when the unit had healed to it, leaving `hp > maxHp` until the next recompute. `eff()` is the
 * single site that lowers `maxHp`, so the cap belongs there. This pins both the cap and its absence
 * while the buff is still live (a Max-HP change never scales current HP).
 */
import { eff } from '../../src/core/combat/StatResolver'
import { verifyInvariants } from '../../src/core/battle/Invariants'
import type { Buff } from '../../src/core/effects/Buff'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const unit = (): Unit => ({
  id: 'A', name: 'A', side: 'ally', kind: 'char', elem: 'Physical',
  base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100, critRate: 0.05, critDmg: 0.5 },
  hp: 1000, maxHp: 1000, energy: 0, maxEnergy: 100, av: 100,
  buffs: [], dots: [], weaknesses: [], res: {},
} as unknown as Unit)

const hpPct = (v: number): Buff => ({ id: 'hpBuff', mods: [{ stat: 'hpPct', value: v }] } as unknown as Buff)

export default (): Case[] => {
  const cases: Case[] = []

  const u = unit()
  eff(u)
  cases.push(t.eq('base: maxHp = base HP, current hp untouched', [u.hp, u.maxHp], [1000, 1000]))

  u.buffs = [hpPct(0.5)]
  eff(u)
  cases.push(t.eq('+50% Max HP raises maxHp, current hp unchanged (no free heal)', [u.hp, u.maxHp], [1000, 1500]))

  u.hp = 1500 // healed up to the buffed cap, as HealingPipeline would
  eff(u)
  cases.push(t.eq('hp at the buffed cap stays put while the buff is live', [u.hp, u.maxHp], [1500, 1500]))

  u.buffs = [] // buff expires
  eff(u)
  cases.push(t.eq('buff expiry caps hp down to the recomputed maxHp', [u.hp, u.maxHp], [1000, 1000]))

  const over = unit()
  over.hp = 120
  over.maxHp = 100
  cases.push(t.truthy('verifyInvariants flags hp above maxHp', verifyInvariants([over], []).some(v => v.startsWith('hp-over-max'))))

  const clean = unit()
  eff(clean)
  cases.push(t.eq('a settled unit has no hp/maxHp violation', verifyInvariants([clean], []).filter(v => v.startsWith('hp-over-max')), []))

  return cases
}