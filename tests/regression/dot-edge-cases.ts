/**
 * §13 DoT pipeline — tick order and lifetime are order-/state-sensitive, and past bugs lived here.
 * Pins: Arcana always ticks last regardless of insertion order; equal DoTs tick in insertion order;
 * two Shocks tick twice; expiration after `turns` fires DOT_EXPIRED; remaining DoTs do NOT tick on a
 * lethal hit; DoT ignores source CRIT (docs/combat_mechanics/DoT.md); target `dotVuln`/`dotRes` and
 * source `dmgAll` stage the tick; a break-sourced DoT uses the kind's base (baseDmg 0); Arcana
 * `defIgnore` is per-DoT, not shared with a co-existing Shock.
 */
import { prepareBattle } from '../../src/core/battle'
import type { Unit } from '../../src/core/entities/Unit'
import type { DoT } from '../../src/core/effects/Buff'
import { case_, type Case } from '../suites'

const SUP = { hp: 30000, atk: 2000, def: 1000, spd: 100 }
const foe = (hp: number) => ({ name: 'Test Foe', count: 1, hp, spd: 100, level: 80, toughness: 120, weaknesses: ['Fire','Lightning','Wind','Physical','Quantum'] as never, atk: 600 })

const mk = (hp = 5_000_000, log = true) => {
  const s = prepareBattle({
    team: [{ kitId: 'hook', stats: { ...SUP }, skillPriority: 0 }],
    enemy: foe(hp),
    cycles: 1, seed: 7,
    log: log ? { debug: 7 } : undefined,
  })
  s.initBattle()
  const a = s.roster.find(u => u.kitId === 'hook')!
  const t = s.livingEnemiesOf(a)[0]
  return { s, a, t }
}
type W = DoT & { sourceUnit?: Unit }
const dot = (kind: DoT['kind'], elem: DoT['elem'], turns: number, baseDmg: number, src: Unit): W => ({ kind, elem, turns, baseDmg, sourceUnit: src })

export default (): Case[] => {
  const cases: Case[] = []

  // A: insertion order Shock then Burn
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
    s.turnPrologue(t)
    const ticks = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
      .map(e => (e.payload as { kind?: string }).kind)
    cases.push(case_('dot: A Shock then Burn', ticks[0] === 'Shock' && ticks[1] === 'Burn', ticks.join(',')))
  }
  // B: Arcana in middle → must tick last
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, dot('Arcana', 'Wind', 900, 1000, a))
    s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
    s.turnPrologue(t)
    const ticks = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
      .map(e => (e.payload as { kind?: string }).kind)
    cases.push(case_('dot: B Arcana last when inserted middle', ticks[0]==='Shock' && ticks[1]==='Burn' && ticks[2]==='Arcana', ticks.join(',')))
  }
  // C: Arcana first → must tick last
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Arcana', 'Wind', 900, 1000, a))
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
    s.turnPrologue(t)
    const ticks = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
      .map(e => (e.payload as { kind?: string }).kind)
    cases.push(case_('dot: C Arcana last when inserted first', ticks[0]==='Shock' && ticks[1]==='Burn' && ticks[2]==='Arcana', ticks.join(',')))
  }
  // D: multi-source same kind
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, dot('Shock', 'Lightning', 3, 2000, a))
    s.turnPrologue(t)
    const ticks = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
    cases.push(case_('dot: D two Shocks tick', ticks.length === 2, String(ticks.length)))
  }
  // E: expiration
  {
    const { s, a, t } = mk()
    const res: string[] = []
    s.applyDot(t, dot('Burn', 'Fire', 2, 1000, a))
    let from = s.logger.events.length
    s.turnPrologue(t); res.push(s.logger.events.slice(from).filter(e=>e.type==='DOT_TICK').length + ',' + s.logger.events.slice(from).filter(e=>e.type==='DOT_EXPIRED').length)
    from = s.logger.events.length
    s.turnPrologue(t); res.push(s.logger.events.slice(from).filter(e=>e.type==='DOT_TICK').length + ',' + s.logger.events.slice(from).filter(e=>e.type==='DOT_EXPIRED').length)
    from = s.logger.events.length
    s.turnPrologue(t); res.push(s.logger.events.slice(from).filter(e=>e.type==='DOT_TICK').length + ',' + s.logger.events.slice(from).filter(e=>e.type==='DOT_EXPIRED').length)
    cases.push(case_('dot: E expiration (turns=2)', res[0]==='1,0' && res[1]==='1,1' && res[2]==='0,0', res.join(';')))
  }
  // F: death
  {
    const { s, a, t } = mk(500)
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 100000, a))
    s.applyDot(t, dot('Burn', 'Fire', 3, 100000, a))
    s.turnPrologue(t)
    const ticks = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
    cases.push(case_('dot: F remaining not dealt on death', ticks.length === 1 && !!t.dead, ticks.length + ',' + t.dead))
  }
  // G: DoT cannot crit (docs/combat_mechanics/DoT.md) — crit buffs on the source change nothing
  {
    const plain = mk()
    const fp = plain.s.logger.events.length
    plain.s.applyDot(plain.t, dot('Burn', 'Fire', 3, 1000, plain.a))
    plain.s.turnPrologue(plain.t)
    const p = (plain.s.logger.events.slice(fp).find(e => e.type === 'DOT_TICK')!.payload as { amount: number }).amount
    const crit = mk()
    crit.s.addBuff(crit.a, { id: 'critup', name: 'crit', mods: [{ stat: 'critRate', value: 1.0 }, { stat: 'critDmg', value: 2.0 }] })
    const fc = crit.s.logger.events.length
    crit.s.applyDot(crit.t, dot('Burn', 'Fire', 3, 1000, crit.a))
    crit.s.turnPrologue(crit.t)
    const c = (crit.s.logger.events.slice(fc).find(e => e.type === 'DOT_TICK')!.payload as { amount: number }).amount
    cases.push(case_('dot: G crit-invariant', p > 0 && p === c, p + '=' + c))
  }
  // H: DoT damage stages — dotVuln (target) ×2, dotRes (target) ×0.5, dmgAll (source) ×2
  {
    const first = () => {
      const { s, a, t } = mk()
      const f = s.logger.events.length
      s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
      s.turnPrologue(t)
      return (s.logger.events.slice(f).find(e => e.type === 'DOT_TICK')!.payload as { amount: number }).amount
    }
    const base = first()
    const near = (x: number, y: number) => Math.abs(x - y) <= 1
    const mod = (stat: 'dotVuln' | 'dotRes' | 'dmgAll', value: number, on: 'a' | 't'): number => {
      const { s, a, t } = mk()
      s.addBuff(on === 'a' ? a : t, { id: 'm', name: 'm', mods: [{ stat, value }] })
      const f = s.logger.events.length
      s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
      s.turnPrologue(t)
      return (s.logger.events.slice(f).find(e => e.type === 'DOT_TICK')!.payload as { amount: number }).amount
    }
    const vuln = mod('dotVuln', 1.0, 't')
    const res = mod('dotRes', 0.5, 't')
    const dmgAll = mod('dmgAll', 1.0, 'a')
    cases.push(case_('dot: H stages vuln/res/dmgAll', near(vuln, base * 2) && near(res, base / 2) && near(dmgAll, base * 2),
      `${base}/${vuln}/${res}/${dmgAll}`))
  }
  // I: break-sourced DoT is computed from kind (baseDmg 0), not the kit baseDmg path
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyBreakDebuff(a, t, 'Fire')
    s.turnPrologue(t)
    const ev = s.logger.events.slice(from).find(e => e.type === 'DOT_TICK')
    const k = (ev?.payload as { kind?: string }).kind
    const amt = (ev?.payload as { amount?: number }).amount
    cases.push(case_('dot: I fire-break Burn ticks kind-based', k === 'Burn' && (amt ?? 0) > 0, k + ',' + amt))
  }
  // J: 4 non-Arcana DoTs tick in chronological infliction order
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, dot('Burn', 'Fire', 3, 1000, a))
    s.applyDot(t, dot('WindShear', 'Wind', 3, 1000, a))
    s.applyDot(t, dot('Bleed', 'Physical', 3, 1000, a))
    s.turnPrologue(t)
    const order = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
      .map(e => (e.payload as { kind?: string }).kind).join(',')
    cases.push(case_('dot: J chronological 4 DoTs', order === 'Shock,Burn,WindShear,Bleed', order))
  }
  // K: Arcana defIgnore applies to the Arcana tick only (not a co-existing Shock)
  {
    const { s, a, t } = mk()
    const from = s.logger.events.length
    s.applyDot(t, dot('Shock', 'Lightning', 3, 1000, a))
    s.applyDot(t, { ...dot('Arcana', 'Wind', 3, 1000, a), defIgnore: 0.5 } as W)
    s.turnPrologue(t)
    const evs = s.logger.events.slice(from).filter(e => e.type === 'DOT_TICK')
    const shock = (evs.find(e => (e.payload as { kind?: string }).kind === 'Shock')!.payload as { amount: number }).amount
    const arc = (evs.find(e => (e.payload as { kind?: string }).kind === 'Arcana')!.payload as { amount: number }).amount
    cases.push(case_('dot: K Arcana defIgnore is per-DoT', arc > shock, shock + '/' + arc))
  }

  return cases
}
