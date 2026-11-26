import { prepareBattle } from '../../src/core/battle'
import { eff, buffSum } from '../../src/core/combat/StatResolver'
import { resolveTargets } from '../../src/core/combat/TargetResolver'
import { isFieldUnit, type Unit } from '../../src/core/entities/Unit'
import { case_, type Case } from '../suites'

/** L186 adversarial summon/memosprite lifecycle (AGENTS.md §11). Pins the engine contract that
 *  kits build on, at engine level (probe units registered directly into a battle):
 *  - one id = one roster entry (re-spawn retires the old instance, §27 identity),
 *  - natural death of a summon/timer = DEATH then SUMMON_DESPAWNED + roster removal,
 *  - SUMMON_CREATED/DESPAWNED carry stable owner attribution (ownerId/sourceId/targetId),
 *  - owner damage fold: a summon's hits land on the owner id (ownerDamage/ownerSkill/ownerAxis)
 *    resolved at deal time, so a despawned summon still folds,
 *  - sharesOwnerBuffs summons fuse their owner's whole buff list LIVE per hit (no leak),
 *  - memosprites inherit only CRIT live via critOwner (no ATK/Buff fusion),
 *  - a dead owner leaves the summon engine-tolerant (stat source gone, summon still acts;
 *    kit-level cleanup is a kit decision, the engine does not auto-touch it).
 *  Timeline/turn pairing (ACTION_START with ownerId + onSummonTurn) stays covered by debug-kits
 *  (aglaea/robin/firefly canon) — not re-pinned here. */

const SUP = { hp: 30000, atk: 2000, def: 1000, spd: 100 }

const probe = (id: string, name: string, owner: Unit, kind: 'summon' | 'timer', extra: Partial<Unit> = {}): Unit => ({
  id, name, side: 'ally', kind, elem: 'Fire',
  base: { level: 80, hp: 1, atk: 100, def: 0, spd: 0 },
  hp: 1, maxHp: 1, energy: 0, maxEnergy: 0, av: 0,
  buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
  weaknesses: [], res: {}, ...extra,
})

const c = (sim: ReturnType<typeof prepareBattle>, type: string) =>
  sim.logger.events.filter(ev => ev.type === type)
const hit = (s: ReturnType<typeof prepareBattle>, src: Unit, tgt: Unit, mult = 1) =>
  s.hit(src, tgt, { type: 'skill', mult, elem: 'Fire', canCrit: false, label: 'probe' })
/** register a probe owned by `owner` (rt.ownerId is set by kits today — the probe must mirror that) */
const own = (s: ReturnType<typeof prepareBattle>, owner: Unit, sm: Unit): void => {
  s.rt(sm).ownerId = owner.id
  s.registerUnit(sm)
}

export default (): Case[] => {
  const cases: Case[] = []
  // prepared battle: hook (owner h) + one dummy enemy e on the roster
  const base = () => {
    const s = prepareBattle({
      team: [{ kitId: 'hook', stats: { ...SUP }, skillPriority: 0 }],
      enemy: { name: 'Dummy', count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 0, weaknesses: ['Fire'] as never, atk: 60 },
      cycles: 1, seed: 7, log: { debug: 7 },
    })
    s.initBattle()
    const owner = s.roster.find(u => u.kitId === 'hook')!
    const e = s.allies('enemy')[0]
    return { s, owner, e }
  }

  // A — SUMMON_CREATED contract: owner attribution + payload
  {
    const { s, owner } = base()
    const sm = probe('probe_a', 'Probe', owner, 'summon')
    const before = c(s, 'SUMMON_CREATED').length
    own(s, owner, sm)
    const created = c(s, 'SUMMON_CREATED').at(-1)!
    cases.push(case_('summon: A created event owns + payloads the summon',
      created.payload.ownerId === owner.id && created.payload.sourceId === owner.id && created.payload.targetId === sm.id &&
      created.source === owner.name && created.target === sm.name &&
      created.payload.kind === 'summon' && created.payload.side === 'ally' &&
      created.payload.hp === 1 && created.payload.maxHp === 1 && created.payload.av === s.baseAv(sm),
      JSON.stringify(created)))
    cases.push(case_('summon: A2 non-char register emits exactly one SUMMON_CREATED',
      c(s, 'SUMMON_CREATED').length - before === 1, `${c(s, 'SUMMON_CREATED').length - before}`))
    cases.push(case_('summon: A3 registered summon is findable and rosters live',
      s.find(sm.id) === sm && s.roster.filter(u => u.id === sm.id).length === 1, `roster=${s.roster.filter(u => u.id === sm.id).length}`))
  }
  // B — SUMMON_DESPAWNED + roster removal
  {
    const { s, owner } = base()
    const sm = probe('probe_b', 'Probe', owner, 'summon')
    own(s, owner, sm)
    s.unregisterUnit(sm.id)
    const d = c(s, 'SUMMON_DESPAWNED').at(-1)!
    cases.push(case_('summon: B despawn owners + removes from roster',
      d.payload.ownerId === owner.id && d.payload.sourceId === owner.id && d.payload.targetId === sm.id &&
      d.payload.kind === sm.kind && c(s, 'SUMMON_DESPAWNED').length === 1 &&
      s.find(sm.id) === undefined && s.roster.filter(u => u.id === sm.id).length === 0,
      `despawned=${c(s, 'SUMMON_DESPAWNED').length} roster=${s.roster.filter(u => u.id === sm.id).length}`))
  }
  // C — re-summon same id after despawn: fresh instance, no zombie
  {
    const { s, owner } = base()
    const a = probe('probe_c', 'Probe', owner, 'summon')
    own(s, owner, a)
    s.unregisterUnit(a.id)
    const b = probe('probe_c', 'Probe', owner, 'summon')
    own(s, owner, b)
    cases.push(case_('summon: C re-spawn after despawn = one live instance, find hits the new',
      c(s, 'SUMMON_CREATED').length === 2 && c(s, 'SUMMON_DESPAWNED').length === 1 &&
      s.roster.filter(u => u.id === 'probe_c').length === 1 && s.find('probe_c') === b,
      `created=${c(s, 'SUMMON_CREATED').length} desp=${c(s, 'SUMMON_DESPAWNED').length}`))
  }
  // D — duplicate-id guard: a re-spawn without despawn retires the old (id = identity, §27)
  {
    const { s, owner } = base()
    const a = probe('probe_d', 'Probe', owner, 'summon')
    own(s, owner, a)
    const b = probe('probe_d', 'Probe', owner, 'summon')
    own(s, owner, b)
    const evs = s.logger.events.slice(-2)
    const ok = c(s, 'SUMMON_DESPAWNED').length === 1 && c(s, 'SUMMON_CREATED').length === 2 &&
      s.roster.filter(u => u.id === 'probe_d').length === 1 && s.find('probe_d') === b &&
      evs[0].type === 'SUMMON_DESPAWNED' && evs[1].type === 'SUMMON_CREATED'
    cases.push(case_('summon: D duplicate id retired before re-spawn', ok,
      `desp=${c(s, 'SUMMON_DESPAWNED').length} created=${c(s, 'SUMMON_CREATED').length} roster=${s.roster.filter(u => u.id === 'probe_d').length} tail=${evs.map(e => e.type).join(',')}`))
  }
  // E — owner damage fold: hits land on the owner id, resolved at deal time (survives despawn)
  {
    const { s, owner, e } = base()
    const sm = probe('probe_e', 'Probe', owner, 'summon')
    own(s, owner, sm)
    s.addBuff(owner, { id: 'ow_atk', name: 'Ow ATK', mods: [{ stat: 'atkPct', value: 1 }], turns: Infinity } as never)
    const pre = s.ownerDamage.get(owner.id) ?? 0
    hit(s, sm, e)
    const after = s.ownerDamage.get(owner.id) ?? 0
    const skill = s.ownerSkill.get(owner.id)?.get('probe')
    const axis = s.ownerAxis.get(owner.id)?.get('probe')
    const named = s.accounts.get(sm.name)?.total
    s.unregisterUnit(sm.id)
    const postDespawn = s.ownerDamage.get(owner.id) ?? 0
    cases.push(case_('summon: E owner fold keyed by owner id + survives despawn',
      after > pre && after === postDespawn && (skill ?? 0) > 0 && axis === undefined && (named ?? 0) > 0,
      `dmg ${pre}→${after} (post-despawn ${postDespawn}) skill=${skill} axis=${axis} named=${named}`))
  }
  // F — sharesOwnerBuffs fusion is LIVE per hit + restores the summon's buff list (no leak)
  {
    const { s, owner, e } = base()
    const sm = probe('probe_f', 'Probe', owner, 'summon', { sharesOwnerBuffs: true as never })
    own(s, owner, sm)
    const p0 = buffSum(owner.buffs, 'atkPct')
    const d0 = hit(s, sm, e)
    s.addBuff(owner, { id: 'ow_atk8', name: 'ATK x2', mods: [{ stat: 'atkPct', value: 4 }], turns: Infinity } as never)
    const d1 = hit(s, sm, e)
    const buffsBefore = sm.buffs.length
    hit(s, sm, e)
    const target = (1 + 4 + p0) / (1 + p0)
    cases.push(case_('summon: F1 owner buffs fused live + full (ratio tracks owner atkPct)',
      Math.abs(d1 - d0 * target) <= 2 && d1 > d0, `${d0} → ${d1} target ${(d0 * target).toFixed(1)} p0=${p0.toFixed(3)}`))
    cases.push(case_('summon: F2 per-hit fusion restores the summon buff list (no leak)',
      sm.buffs.length === buffsBefore, `buffs ${buffsBefore} → ${sm.buffs.length}`))
  }
  // G — memosprite: CRIT mirrored live, ATK/buffs NOT fused
  {
    const { s, owner, e } = base()
    const memo = probe('probe_g', 'Memo', owner, 'summon', { critOwner: owner })
    own(s, owner, memo)
    const crit0 = eff(memo).critRate
    const d0 = hit(s, memo, e)
    s.addBuff(owner, { id: 'ow_cr', name: 'CR +', mods: [{ stat: 'critRate', value: 0.5 }], turns: Infinity } as never)
    s.addBuff(owner, { id: 'ow_atk9', name: 'ATK x9', mods: [{ stat: 'atkPct', value: 8 }], turns: Infinity } as never)
    const crit1 = eff(memo).critRate
    const d1 = hit(s, memo, e)
    cases.push(case_('summon: G1 memosprite CRIT mirrors owner LIVE',
      crit1 === eff(owner).critRate && crit1 > crit0 + 0.3, `CRIT ${crit0.toFixed(3)} → ${crit1.toFixed(3)}`))
    cases.push(case_('summon: G2 memosprite does NOT inherit owner ATK/buffs (only CRIT)',
      d0 === d1, `${d0} vs ${d1}`))
  }
  // H — death of a summon/timer = DEATH then SUMMON_DESPAWNED + roster removal
  {
    const { s, owner, e } = base()
    const sm = probe('probe_h', 'Probe', owner, 'summon')
    own(s, owner, sm)
    const from = s.logger.events.length
    s.kill(e, sm)
    const tail = s.logger.events.slice(from)
    const di = tail.findIndex(t => t.type === 'DEATH')
    const pi = tail.findIndex(t => t.type === 'SUMMON_DESPAWNED')
    cases.push(case_('summon: H death despawns the summon (DEATH then SUMMON_DESPAWNED)',
      di >= 0 && pi > di && tail.filter(t => t.type === 'DEATH').length === 1 &&
      tail.at(pi)!.payload.kind === 'summon' &&
      s.find(sm.id) === undefined && s.roster.filter(u => u.id === sm.id).length === 0, JSON.stringify(tail.map(t => t.type))))
  }
  {
    const { s, owner, e } = base()
    const t = probe('probe_h2', 'Timer', owner, 'timer')
    own(s, owner, t)
    const from = s.logger.events.length
    s.kill(e, t)
    const tail = s.logger.events.slice(from)
    const di = tail.findIndex(x => x.type === 'DEATH')
    const pi = tail.findIndex(x => x.type === 'SUMMON_DESPAWNED')
    cases.push(case_('summon: H2 same for a timer entity',
      di >= 0 && pi > di && tail.filter(x => x.type === 'DEATH').length === 1 &&
      s.find(t.id) === undefined, JSON.stringify(tail.map(x => x.type))))
  }
  // I — dead owner: engine-tolerant (stat source gone, summon still acts/folds); kit cleanup is a kit decision
  {
    const { s, owner, e } = base()
    const sm = probe('probe_i', 'Probe', owner, 'summon')
    own(s, owner, sm)
    s.kill(e, owner)
    const d = hit(s, sm, e)
    cases.push(case_('summon: I dead owner tolerated — summon still hits + folds to owner id',
      s.find(owner.id) === undefined && s.find(sm.id) === sm && d > 0 && (s.ownerDamage.get(owner.id) ?? 0) > 0,
      `owner=${s.find(owner.id) === undefined} dmg=${d} ownerDmg=${s.ownerDamage.get(owner.id) ?? 0}`))
  }
  // J — field eligibility: true summons are off-field, memosprites are field targets/support recipients
  {
    const { s, owner, e } = base()
    const trueSummon = probe('probe_j_true', 'True Summon', owner, 'summon', { sharesOwnerBuffs: true, hp: 0.4 })
    const memo = probe('probe_j_memo', 'Memo', owner, 'summon', { hp: 0.4 })
    own(s, owner, trueSummon)
    own(s, owner, memo)
    const sel = resolveTargets({ actorId: e.id, rule: 'aoe', candidates: [trueSummon, memo, owner], rng: () => 0 })
    cases.push(case_('summon: J true summon is off-field, memosprite stays targetable',
      isFieldUnit(memo) && !isFieldUnit(trueSummon) &&
      sel.targets.includes(memo) && !sel.targets.includes(trueSummon) && sel.targets.includes(owner),
      `field=${isFieldUnit(memo)}/${isFieldUnit(trueSummon)} targets=${sel.targets.map(t => t.id).join(',')}`))

    s.addBuff(trueSummon, { id: 'probe_shield_true', name: 'Probe Shield True', mods: [], turns: 2, shield: 100 } as never)
    s.addBuff(memo, { id: 'probe_shield_memo', name: 'Probe Shield Memo', mods: [], turns: 2, shield: 100 } as never)
    cases.push(case_('summon: J2 shield reaches memosprite but not true summon',
      trueSummon.buffs.length === 0 && memo.buffs.some(b => b.shield === 100),
      `buffs=${trueSummon.buffs.length}/${memo.buffs.length} shield=${memo.buffs.map(b => b.shield).join(',')}`))

    const healEvents = s.logger.events.length
    s.heal(trueSummon, 0.5, owner)
    s.heal(memo, 0.5, owner)
    cases.push(case_('summon: J3 heal reaches memosprite but not true summon',
      trueSummon.hp === 0.4 && memo.hp > 0.4 && s.logger.events.slice(healEvents).some(ev => ev.type === 'HEAL_APPLIED' && ev.targetId === memo.id)
      && !s.logger.events.slice(healEvents).some(ev => ev.type === 'HEAL_APPLIED' && ev.targetId === trueSummon.id),
      `hp=${trueSummon.hp}/${memo.hp} events=${s.logger.events.slice(healEvents).filter(ev => ev.type === 'HEAL_APPLIED').map(ev => ev.targetId).join(',')}`))
  }
  {
    const { s, owner, e } = base()
    const timer = probe('probe_k', 'Fever Countdown', owner, 'timer')
    own(s, owner, timer)
    const from = s.logLines.length
    const hp0 = timer.hp
    s.turns.enemyTurn(e, 3)
    const lines = s.logLines.slice(from)
    const pool = s.livingEnemiesOf(e)
    cases.push(case_('summon: K timer is off-field and never hit by enemy AoE',
      !isFieldUnit(timer) && !pool.includes(timer) && hp0 === timer.hp &&
      !lines.some(l => l.includes(`hits ${timer.name}:`)),
      `field=${isFieldUnit(timer)} pool=${pool.map(u => u.id).join(',')} hp=${hp0}→${timer.hp} lines=${lines.filter(l => l.includes('hits ')).join(' / ')}`))
  }
  {
    const { s, owner } = base()
    const timer = probe('probe_k2', 'Fever Countdown', owner, 'timer')
    own(s, owner, timer)
    s.addBuff(timer, { id: 'probe_shield_timer', name: 'Probe Shield Timer', mods: [], turns: 2, shield: 614 } as never)
    const heals0 = c(s, 'HEAL_APPLIED').length
    s.heal(timer, 100, owner)
    cases.push(case_('summon: K2 timer receives no shield or heal',
      timer.buffs.length === 0 && timer.hp === 1 && c(s, 'HEAL_APPLIED').length === heals0,
      `buffs=${timer.buffs.length} hp=${timer.hp} heals=${c(s, 'HEAL_APPLIED').length - heals0}`))
  }
  return cases
}