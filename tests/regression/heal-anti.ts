import { prepareBattle } from '../../src/core/battle'
import type { Unit } from '../../src/core/entities/Unit'
import type { Mod } from '../../src/core/effects/Buff'
import { case_, type Case } from '../suites'

/** L184 Anti-Heal + Healing Boost canon (hsr-data combat_mechanics.json "Healing"):
 *  Healing Boost Multiplier = 1 + OHB_Healer + IHB_Target − IHR_Target — ADDITIVE, floored at 0.
 *  IHR (Incoming Healing Reduction) rides `inHeal` as a negative value. */
const SUP = { hp: 30000, atk: 2000, def: 1000, spd: 100 }
const foe = (hp: number) => ({ name: 'Test Foe', count: 1, hp, spd: 100, level: 80, toughness: 120, weaknesses: ['Fire'] as never, atk: 600 })

const mk = (targetHp = 5_000_000) => {
  const s = prepareBattle({
    team: [{ kitId: 'hook', stats: { ...SUP }, skillPriority: 0 }],
    enemy: foe(targetHp),
    cycles: 1, seed: 7,
    log: { debug: 7 },
  })
  s.initBattle()
  const h = s.roster.find(u => u.kitId === 'hook')!
  const t = s.livingEnemiesOf(h)[0]
  return { s, h, t }
}
const healer = (u: Unit) => u.side === 'ally' && u.kind === 'char'

export default (): Case[] => {
  const cases: Case[] = []
  const healAmt = (s: ReturnType<typeof mk>['s'], from: number): number => {
    const evs = s.logger.events.slice(from)
    const ev = evs[evs.length - 1]?.type === 'HEAL_APPLIED' ? evs[evs.length - 1] : undefined
    return (ev?.payload as { amount?: number }).amount ?? -1
  }
  const healOf = (mods: Mod[], on: 'h' | 't' = 'h', amount = 1000) => {
    const { s, h, t } = mk()
    const u = on === 'h' ? h : t
    s.addBuff(u, { id: 'm', name: 'm', mods })
    h.hp = h.maxHp - 20000
    const from = s.logger.events.length
    s.heal(h, amount, healer(h) ? h : undefined)
    return healAmt(s, from)
  }

  // A: no boosts -> base heal
  cases.push(case_('heal: A base', healOf([]) === 1000, String(healOf([]))))
  // B: OHB only (healer) -> ×1.0 boost additive
  cases.push(case_('heal: B outHeal 0.2', healOf([{ stat: 'outHeal', value: 0.2 }]) === 1200, String(healOf([{ stat: 'outHeal', value: 0.2 }]))))
  // C: IHB only (target) -> 1300
  cases.push(case_('heal: C inHeal 0.3', healOf([{ stat: 'inHeal', value: 0.3 }]) === 1300, String(healOf([{ stat: 'inHeal', value: 0.3 }]))))
  // D: OHB + IHB stack ADDITIVELY (1+0.2+0.3=1.5 → 1500, NOT 1.2×1.3=1560)
  cases.push(case_('heal: D OHB+IHB additive 1.5',
    healOf([{ stat: 'outHeal', value: 0.2 }, { stat: 'inHeal', value: 0.3 }]) === 1500,
    String(healOf([{ stat: 'outHeal', value: 0.2 }, { stat: 'inHeal', value: 0.3 }]))))
  // E: anti-heal (IHR −0.3) -> 700
  cases.push(case_('heal: E anti inHeal −0.3', healOf([{ stat: 'inHeal', value: -0.3 }]) === 700, String(healOf([{ stat: 'inHeal', value: -0.3 }]))))
  // F: anti-heal + OHB add (1−0.3+0.2=0.9) -> 900
  cases.push(case_('heal: F OHB 0.2 + anti −0.3', healOf([{ stat: 'outHeal', value: 0.2 }, { stat: 'inHeal', value: -0.3 }]) === 900, String(healOf([{ stat: 'outHeal', value: 0.2 }, { stat: 'inHeal', value: -0.3 }]))))
  // G: 100% anti-heal -> heal nullified, no HP change, no damage
  {
    const { s, h } = mk()
    s.addBuff(h, { id: 'ab', name: 'anti', mods: [{ stat: 'inHeal', value: -1.0 }] })
    const before = h.hp
    const from = s.logger.events.length
    s.heal(h, 1000, h)
    const amt = healAmt(s, from)
    cases.push(case_('heal: G 100% anti-heal nulls, deals nothing', amt === 0 && h.hp === before && !s.logger.events.slice(from).some(e => e.type === 'DAMAGE_DEALT'), `${amt},hpΔ=${h.hp - before}`))
  }
  // H: heal caps at maxHP and floor: negative mult clamped at 0
  {
    const { s, h } = mk(5_000_000)
    s.addBuff(h, { id: 'ah', name: 'anti', mods: [{ stat: 'inHeal', value: -2.0 }] })
    s.logger.events.length
    h.hp = h.maxHp - 100
    const from = s.logger.events.length
    s.heal(h, 1000, h)
    cases.push(case_('heal: H overflow-ant-heal → avg heal 0 (floor)', healAmt(s, from) === 0 && h.hp === h.maxHp - 100, `${healAmt(s, from)},hp=${h.hp}`))
    const { s: s2, h: h2 } = mk(5_000_000)
    h2.hp = h2.maxHp - 5000
    const f2 = s2.logger.events.length
    s2.heal(h2, 100000, h2)
    cases.push(case_('heal: H2 caps at maxHP', healAmt(s2, f2) === 5000, String(healAmt(s2, f2))))
  }

  // I/J: per-mod ability gate (Cornucopia): OHB counts only for a heal produced by a Skill/Ult.
  // I — off-ability heal: the gated mod is skipped (base 1000).
  cases.push(case_('heal: I gated OHB skipped off-ability',
    healOf([{ stat: 'outHeal', value: 0.2, whenAbility: ['skill', 'ult'] }]) === 1000,
    String(healOf([{ stat: 'outHeal', value: 0.2, whenAbility: ['skill', 'ult'] }]))))
  // J — same heal inside a Skill perform: pressedAbility='skill' → mod counts (1200).
  {
    const { s, h } = mk()
    const mini = {
      id: 'mini', name: 'mini', elem: 'Fire', energyMax: 100, base: h.base,
      decide: () => ({ kind: 'basic' } as const),
      perform: (_s: unknown, u: Unit) => s.heal(u, 1000, u),
    } as never
    s.addBuff(h, { id: 'm', name: 'm', mods: [{ stat: 'outHeal', value: 0.2, whenAbility: ['skill', 'ult'] }] })
    h.hp = h.maxHp - 20000
    const from = s.logger.events.length
    s.performAbility(mini, h, { kind: 'skill' }, s.rt(h))
    cases.push(case_('heal: J gated OHB counted during Skill', healAmt(s, from) === 1200, String(healAmt(s, from))))
  }

  return cases
}