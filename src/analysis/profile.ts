import type { Simulator } from '../core/simulator'
import type { BattleEvent } from '../core/battlelog'

/**
 * §65 CHARACTER BEHAVIOR PROFILING + §66 ARCHETYPE MODEL (foundation).
 *
 * Pipeline step delivered here: `Run → Telemetry → Feature Vector → Behavior Profile → Archetype Scores`.
 * Everything is a PURE read of one finished battle (public sim state + event stream): no kit-specific
 * branching, no final DPS as the answer. Absolute counts are returned alongside normalized rates —
 * §65.3: absolute counts are not comparable without normalization.
 *
 * Not here on purpose:
 *   - §65.1 probe-build ladder (CONTROL/FUNCTIONAL/BENCHMARK) and §65.2 scenario matrix need a probe
 *     runner that drives several standardized battles; that is the next layer, not this pure extractor.
 *   - §66 dependency axes (`*_dependent`) and §67 Need/Provide/Conflict require COUNTERFACTUAL runs
 *     (baseline / +provider / -provider, §68). They are NOT inferred from a single run, so they are not
 *     faked here. `roleScores` is the one team-relative axis and only fires when the caller supplies a
 *     team context; otherwise it stays empty.
 *   - §69: every score below is a continuous seed of a formula to be calibrated against actual sim
 *     outcomes, not an authority. All scores are in [0, 1] and multi-label.
 */

/** clamp to [0,1]; NaN → 0 and +Infinity → 1 (invariant: no NaN in a profile). */
const clamp01 = (x: number): number => (x > 1 ? 1 : x > 0 ? x : 0)
const add = (rec: Record<string, number>, key: string, v: number): void => { rec[key] = (rec[key] ?? 0) + v }
const finite = (x: number): number => (Number.isFinite(x) ? x : 0)

// ============================================================================================
// §65.3 FEATURE VECTOR
// ============================================================================================

export interface FeatureVector {
  actions: number
  turns: number
  cycles: number
  avElapsed: number
  totalDamage: number

  /** `ABILITY_USED.payload.action` → uses */
  abilityCounts: Record<string, number>
  /** DmgType axis → number of DAMAGE_DEALT hits (`attackType`) */
  attackTypeCounts: Record<string, number>
  /** DmgType axis → damage dealt (`sim.ownerAxis`; includes break/add/mem_skill/aha/elation) */
  damageByAttackType: Record<string, number>
  /** element → applied damage */
  damageByElement: Record<string, number>

  ultimates: number
  fua: number
  dotTicks: number
  breaks: number
  superbreaks: number
  toughnessDamage: number

  extraTurns: number
  actionAdvances: number
  actionDelays: number

  spSpent: number
  spGained: number
  spFinal: number
  energyGained: number

  buffApplied: number
  debuffApplied: number
  controlApplied: number

  healing: number
  shielding: number
  shieldAbsorbed: number

  summons: number
  /** DAMAGE_DEALT hits */
  hits: number
  /** hit-groups (keyed by actionId) that touched > 1 distinct target */
  multiTargetHits: number
  /** hit-groups that landed at all */
  hitGroups: number
  /** largest number of distinct targets a single action hit */
  maxTargets: number

  deaths: number
  allies: number
  aliveAllies: number
}

const sumField = (events: BattleEvent[], type: string, field: string): number => {
  let s = 0
  for (const e of events) if (e.type === type) s += finite(Number((e.payload as Record<string, unknown>)[field] ?? 0))
  return s
}
const countType = (events: BattleEvent[], type: string): number => { let n = 0; for (const e of events) if (e.type === type) n++; return n }
const amountOf = (e: BattleEvent): number => finite(Number((e.payload as { amount?: unknown }).amount ?? 0))

/** Raw telemetry of one finished battle (§65.3 `Telemetry` + `Feature Vector`). Pure read. */
export function featureVector(sim: Simulator): FeatureVector {
  const events = sim.logger.events
  const allies = sim.roster.filter(u => u.side !== 'enemy')

  const abilityCounts: Record<string, number> = {}
  const attackTypeCounts: Record<string, number> = {}
  const damageByAttackType: Record<string, number> = {}
  const damageByElement: Record<string, number> = {}

  const groups = new Map<number, Set<string>>()
  for (const e of events) {
    if (e.type === 'ABILITY_USED') add(abilityCounts, String((e.payload as { action?: unknown }).action ?? 'unknown'), 1)
    if (e.type !== 'DAMAGE_DEALT') continue
    add(attackTypeCounts, e.attackType ?? 'unknown', 1)
    add(damageByElement, e.element ?? 'unknown', amountOf(e))
    const tid = (e.payload as { targetId?: unknown }).targetId
    if (typeof tid === 'string') {
      let set = groups.get(e.actionId)
      if (!set) { set = new Set(); groups.set(e.actionId, set) }
      set.add(tid)
    }
  }
  for (const inner of sim.ownerAxis.values()) for (const [k, v] of inner) add(damageByAttackType, k, v)

  let multiTargetHits = 0, maxTargets = 0
  for (const set of groups.values()) { if (set.size > 1) multiTargetHits++; if (set.size > maxTargets) maxTargets = set.size }

  const end = events.find(e => e.type === 'BATTLE_END')
  return {
    actions: countType(events, 'ACTION_START'),
    turns: sim.battleTurn,
    cycles: finite(Number((end?.payload as { cycle?: unknown }).cycle ?? 0)) + 1,
    avElapsed: finite(sim.avElapsed),
    totalDamage: finite([...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)),

    abilityCounts,
    attackTypeCounts,
    damageByAttackType,
    damageByElement,

    ultimates: abilityCounts['ultimate'] ?? 0,
    fua: attackTypeCounts['fua'] ?? 0,
    dotTicks: countType(events, 'DOT_TICK'),
    breaks: countType(events, 'WEAKNESS_BREAK'),
    superbreaks: countType(events, 'SUPERBREAK'),
    toughnessDamage: sumField(events, 'TOUGHNESS_DAMAGE', 'damage'),

    extraTurns: countType(events, 'EXTRA_TURN'),
    actionAdvances: countType(events, 'ACTION_ADVANCE'),
    actionDelays: countType(events, 'ACTION_DELAY'),

    spSpent: sumField(events, 'SP_LOSS', 'n'),
    spGained: sumField(events, 'SP_GAIN', 'n'),
    spFinal: finite(sim.sp()),
    energyGained: sumField(events, 'ENERGY_GAIN', 'amount'),

    buffApplied: countType(events, 'BUFF_APPLIED'),
    debuffApplied: countType(events, 'DEBUFF_APPLIED'),
    controlApplied: countType(events, 'CONTROL_APPLIED'),

    healing: sumField(events, 'HEAL_APPLIED', 'amount'),
    shielding: sumField(events, 'SHIELD_APPLIED', 'amount'),
    shieldAbsorbed: sumField(events, 'SHIELD_ABSORBED', 'amount'),

    summons: countType(events, 'SUMMON_CREATED'),
    hits: countType(events, 'DAMAGE_DEALT'),
    multiTargetHits,
    hitGroups: groups.size,
    maxTargets,

    deaths: countType(events, 'DEATH'),
    allies: allies.length,
    aliveAllies: allies.filter(u => u.hp > 0).length,
  }
}

/** §65.3 normalized view. Absolute counts are meaningless across kits/encounters; these rates are the
 *  comparable form. Per-100-AV uses `avElapsed` (falls back to 1 so a degenerate run does not divide by 0). */
export interface NormalizedFeatures {
  /** counts per action */
  perAction: Record<string, number>
  /** counts per turn */
  perTurn: Record<string, number>
  /** counts per 100 AV */
  per100Av: Record<string, number>
  actionsPerCycle: number
  hitsPerAction: number
  multiTargetFraction: number
  /** attack-type damage share, sums to 1 over the axes that dealt damage */
  damageShareByAttackType: Record<string, number>
  /** element damage share, sums to 1 */
  damageShareByElement: Record<string, number>
  survival: number
  /** fraction of total damage dealt in the second half of the AV timeline */
  lateDamageShare: number
}

const shares = (by: Record<string, number>): Record<string, number> => {
  const total = Object.values(by).reduce((a, b) => a + b, 0)
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(by)) out[k] = total ? v / total : 0
  return out
}

export function normalizeFeatures(fv: FeatureVector, lateDamageShare = 0): NormalizedFeatures {
  const per = (n: number): number => n / Math.max(1, fv.actions)
  const perTurn = (n: number): number => n / Math.max(1, fv.turns)
  const per100Av = (n: number): number => (n * 100) / Math.max(1, fv.avElapsed)
  const src: Record<string, number> = {
    ultimates: fv.ultimates, fua: fv.fua, dotTicks: fv.dotTicks, breaks: fv.breaks,
    extraTurns: fv.extraTurns, actionAdvances: fv.actionAdvances, actionDelays: fv.actionDelays,
    spSpent: fv.spSpent, energyGained: fv.energyGained, healing: fv.healing, shielding: fv.shielding,
    buffApplied: fv.buffApplied, debuffApplied: fv.debuffApplied, summons: fv.summons,
  }
  const pa: Record<string, number> = {}, pt: Record<string, number> = {}, pv: Record<string, number> = {}
  for (const [k, v] of Object.entries(src)) { pa[k] = per(v); pt[k] = perTurn(v); pv[k] = per100Av(v) }
  return {
    perAction: pa,
    perTurn: pt,
    per100Av: pv,
    actionsPerCycle: fv.actions / Math.max(1, fv.cycles),
    hitsPerAction: fv.hits / Math.max(1, fv.actions),
    multiTargetFraction: fv.hitGroups ? fv.multiTargetHits / fv.hitGroups : 0,
    damageShareByAttackType: shares(fv.damageByAttackType),
    damageShareByElement: shares(fv.damageByElement),
    survival: fv.allies ? fv.aliveAllies / fv.allies : 1,
    lateDamageShare,
  }
}

/** Fraction of applied damage dealt after the halfway AV point of the battle (tempo `ramp` signal).
 *  Kept separate from `featureVector` because it needs the per-event timeline, not just the totals. */
export function lateDamageShare(sim: Simulator): number {
  const events = sim.logger.events
  const reap = events.find(e => e.type === 'BATTLE_END')?.time ?? sim.avElapsed
  const half = reap / 2
  let late = 0, total = 0
  for (const e of events) {
    if (e.type !== 'DAMAGE_DEALT') continue
    const a = amountOf(e)
    total += a
    if (e.time >= half) late += a
  }
  return total ? late / total : 0
}

// ============================================================================================
// §66 ARCHETYPE MODEL — continuous, multi-label scores in [0, 1]
// ============================================================================================

export type DeliveryAxis = 'direct_damage' | 'ultimate' | 'fua' | 'dot' | 'break' | 'summon' | 'counter' | 'hybrid'
export type RoleAxis = 'hypercarry' | 'sub_dps' | 'support' | 'sustain'
export type TempoAxis = 'burst' | 'fast_cycle' | 'ramp' | 'action_driven' | 'slow_scaling'
export type TargetAxis = 'single_target' | 'blast' | 'aoe'

export interface ArchetypeScores {
  delivery: Record<DeliveryAxis, number>
  tempo: Record<TempoAxis, number>
  target: Record<TargetAxis, number>
  /** only populated when a team context is supplied (`roleScores`) */
  role: Partial<Record<RoleAxis, number>>
}

/** Map a DmgType/axis bucket onto a §66 delivery axis. elation/add fold into direct damage; a
 *  memosprite skill counts as summon delivery; DoT and break keep their own axes. */
const DELIVERY_OF: Record<string, DeliveryAxis> = {
  basic: 'direct_damage', skill: 'direct_damage', add: 'direct_damage', elation: 'direct_damage', aha: 'direct_damage',
  ult: 'ultimate',
  fua: 'fua', counter: 'counter',
  dot: 'dot',
  break: 'break', superbreak: 'break',
  mem_skill: 'summon', summon: 'summon',
}

/** §66 delivery axis = damage share per delivery mechanism. `hybrid` = 1 − dominant share, i.e. how
 *  spread the kit's damage is across mechanisms (a pure single-axis kit scores 0). */
export function deliveryScores(nf: NormalizedFeatures): Record<DeliveryAxis, number> {
  const out: Record<DeliveryAxis, number> = { direct_damage: 0, ultimate: 0, fua: 0, dot: 0, break: 0, summon: 0, counter: 0, hybrid: 0 }
  for (const [axis, share] of Object.entries(nf.damageShareByAttackType)) {
    const d = DELIVERY_OF[axis] ?? 'direct_damage'
    out[d] += share
  }
  const max = Math.max(...Object.values(out))
  out.hybrid = clamp01(1 - max)
  return out
}

/** §66 tempo axis. Formulas are first-pass (§69: calibrate against actual outcomes). References:
 *  `fast_cycle` saturates at 6 actions/cycle; `action_driven` at 0.5 extra actions per action;
 *  `burst` peaks when damage is an ultimate that also dominates the kit; `ramp` = late damage share. */
export function tempoScores(nf: NormalizedFeatures): Record<TempoAxis, number> {
  const ultShare = nf.damageShareByAttackType['ult'] ?? 0
  const fastCycle = clamp01(nf.actionsPerCycle / 6)
  const actionDriven = (nf.perAction['extraTurns'] ?? 0) + (nf.perAction['actionAdvances'] ?? 0)
  return {
    burst: clamp01(ultShare * 1.5),
    fast_cycle: fastCycle,
    ramp: clamp01(nf.lateDamageShare),
    action_driven: clamp01(actionDriven / 0.5),
    slow_scaling: clamp01(1 - fastCycle),
  }
}

/** §66 target axis from per-action target fan-out: 1 target = single, 2–3 = blast, 4+ = AoE. Uses the
 *  largest single-action fan-out as the dominant signal of the kit's intended shape. */
export function targetScores(fv: FeatureVector): Record<TargetAxis, number> {
  const groups = Math.max(1, fv.hitGroups)
  const single = (groups - fv.multiTargetHits) / groups
  const max = fv.maxTargets
  const blast = clamp01((max >= 2 && max <= 3 ? fv.multiTargetHits : 0) / groups)
  const aoe = clamp01((max >= 4 ? fv.multiTargetHits : 0) / groups)
  return { single_target: clamp01(single), blast, aoe }
}

/** §66 role axis — relative to a team, so it needs a context: `teamDamage` is required, the rest are
 *  optional teammates' totals. No context ⇒ empty axis (no fake solo role). support = buff/debuff
 *  share weighted toward low personal damage; sustain = healing+shielding share weighted the same way;
 *  hypercarry = damage share; sub_dps peaks at an even damage split. */
export function roleScores(fv: FeatureVector, ctx?: { teamDamage?: number; teamHealing?: number; teamShielding?: number; teamBuffApplications?: number }): Partial<Record<RoleAxis, number>> {
  if (!ctx || !ctx.teamDamage) return {}
  const share = clamp01(fv.totalDamage / ctx.teamDamage)
  const util = fv.healing + fv.shielding
  const teamUtil = (ctx.teamHealing ?? 0) + (ctx.teamShielding ?? 0)
  const utilShare = teamUtil ? clamp01(util / teamUtil) : 0
  const buffShare = ctx.teamBuffApplications ? clamp01((fv.buffApplied + fv.debuffApplied) / ctx.teamBuffApplications) : 0
  return {
    hypercarry: share,
    sub_dps: clamp01(share * (1 - share) * 4),
    support: clamp01(buffShare * (1 - share)),
    sustain: clamp01(utilShare * (1 - share)),
  }
}

export interface ProfileOptions {
  /** team context enables §66 role scores; `teamDamage` is required, the rest optional */
  role?: { teamDamage: number; teamHealing?: number; teamShielding?: number; teamBuffApplications?: number }
}

/** Full §65/§66 profile of one finished battle. */
export interface BehaviorProfile {
  features: FeatureVector
  normalized: NormalizedFeatures
  archetypes: ArchetypeScores
  dominant: { delivery: DeliveryAxis; tempo: TempoAxis; target: TargetAxis; role?: RoleAxis }
}

const argmax = <T extends string>(rec: Record<T, number>): T =>
  (Object.entries(rec) as [T, number][]).reduce((a, b) => (b[1] > a[1] ? b : a))[0]

export function behaviorProfile(sim: Simulator, opts: ProfileOptions = {}): BehaviorProfile {
  const features = featureVector(sim)
  const normalized = normalizeFeatures(features, lateDamageShare(sim))
  const archetypes: ArchetypeScores = {
    delivery: deliveryScores(normalized),
    tempo: tempoScores(normalized),
    target: targetScores(features),
    role: roleScores(features, opts.role),
  }
  const dominant: BehaviorProfile['dominant'] = {
    delivery: argmax(archetypes.delivery),
    tempo: argmax(archetypes.tempo),
    target: argmax(archetypes.target),
  }
  if (Object.keys(archetypes.role).length) dominant.role = argmax(archetypes.role as Record<RoleAxis, number>)
  return { features, normalized, archetypes, dominant }
}
