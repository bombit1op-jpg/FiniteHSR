/**
 * §Combat Action View — aggregates technical BattleEvents into gameplay actions.
 *
 * Transforms the raw event stream into 4 categories of player-facing actions:
 * - attack: normal character/enemy attacks (basic, skill, enhanced)
 * - bonusAttack: follow-up attacks (FUA), separate from the triggering action
 * - extraTurn: granted extra turns (via grantExtraTurn, etc.)
 * - ultimate: ultimate activations (in-turn or out-of-turn)
 *
 * This is a pure data transformation layer; it does not mutate engine state.
 */
import type { BattleEvent, StateSnapshot, EventType } from '../core/battlelog'
import type { Simulator } from '../core/simulator'
import { abilityName as abilityDisplayName } from '../core/abilityNames'

export type CombatActionCategory =
  | 'attack' | 'bonusAttack' | 'extraTurn' | 'ultimate'
  | 'enemyAttack' | 'technique' | 'summon' | 'timer' | 'effect' | 'system'

export type CombatActionTag = Exclude<CombatActionCategory, 'system'>
  | 'counter' | 'dot' | 'breakRestore'

export interface CombatHitRecord {
  hitIndex: number
  targetId: string
  targetName: string
  damage: number
  shieldDamage: number
  crit: boolean
  element: string
  attackType: string
  traceId?: string
  breakdown?: {
    stat: number
    mult: number
    flat: number
    final: number
    dmg: number
    critRate: number
    critDmg: number
    critBonus: number
    boost: number
    weaken: number
    defPen: number
    res: number
    resPen: number
    vuln: number
    mit: number
    broken: boolean
  }
}

export interface CombatAttackRecord {
  attackId: string
  targetIds: string[]
  targetNames: string[]
  hits: CombatHitRecord[]
  totalDamage: number
  shieldDamage: number
  abilityId?: string
  abilityName: string
  abilitySlot?: string
  category: CombatActionCategory
  provenance?: CombatActionRecord['provenance']
  parentActionId?: string
}

export interface CombatEffectSummary {
  buffs: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    stacks: number
    turns: number
    sourceId?: string
    sourceName?: string
    appliedById?: string
    provenance?: BattleEvent['provenance']
    mods: Array<{ stat: string; value: number }>
    maxStacks?: number
    shield?: number
  }>
  debuffs: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    stacks: number
    maxStacks?: number
    turns: number
    sourceId?: string
    sourceName?: string
    appliedById?: string
    provenance?: BattleEvent['provenance']
    mods: Array<{ stat: string; value: number }>
  }>
  dots: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    element: string
    damage: number
    turns: number
    stacks: number
    sourceId?: string
    sourceName?: string
    provenance?: BattleEvent['provenance']
  }>
  controls: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    turns: number
    stacks: number
    sourceId?: string
    sourceName?: string
    provenance?: BattleEvent['provenance']
  }>
  ticks: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    element: string
    sourceId?: string
    sourceName?: string
    provenance?: BattleEvent['provenance']
  }>
  shields: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    sourceId?: string
    sourceName?: string
    appliedById?: string
    provenance?: BattleEvent['provenance']
  }>
  shieldDamage: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    incoming: number
    remaining: number
    sourceId?: string
    sourceName?: string
    provenance?: BattleEvent['provenance']
  }>
  heals: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    requested?: number
    applied?: number
    sourceId?: string
    sourceName?: string
    provenance?: BattleEvent['provenance']
  }>
  removals: Array<{
    kind: 'buff' | 'debuff' | 'dot' | 'shield'
    id: string
    name: string
    targetId: string
    targetName: string
    stacks: number
    sourceId?: string
    sourceName?: string
    appliedById?: string
    provenance?: BattleEvent['provenance']
  }>
  energyChanges: Array<{
    targetId: string
    targetName: string
    delta: number
    reason: string
  }>
  spChanges: Array<{
    targetId: string
    targetName: string
    delta: number
    reason: string
  }>
  breaks: Array<{
    targetId: string
    targetName: string
    element: string
    breakDamage: number
  }>
  other: Array<{
    type: EventType
    targetId: string
    targetName: string
    description: string
  }>
}

export interface CombatToughnessRecord {
  targetId: string
  targetName: string
  damage: number
}

export interface CombatActionRecord {
  id: string
  combatActionId: string
  parentActionId?: string
  order: number

  category: CombatActionCategory
  tags: CombatActionTag[]

  sourceId?: string
  sourceName: string

  abilityId?: string
  abilityName: string
  abilitySlot?: string

  av: number
  turn: number
  actionId: number

  targetIds: string[]
  targetNames: string[]

  attacks: CombatAttackRecord[]

  totalDamage: number
  shieldDamage: number
  toughnessDamage: number
  toughnessDamageByTarget: CombatToughnessRecord[]
  spDelta: number
  effects: CombatEffectSummary
  events: BattleEvent[]

  beforeSnapshot?: StateSnapshot
  afterSnapshot?: StateSnapshot

  provenance?: {
    sourceKind: string
    abilityId?: string
    abilityName?: string
    abilitySlot?: string
    triggeredByUnitId?: string
    triggeredByUnitName?: string
  }
  isOutOfTurn?: boolean
}



function effectTargetIds(effects: CombatEffectSummary): string[] {
  return [...new Set([
    ...effects.buffs.map(e => e.targetId),
    ...effects.debuffs.map(e => e.targetId),
    ...effects.dots.map(e => e.targetId),
    ...effects.shields.map(e => e.targetId),
    ...effects.heals.map(e => e.targetId),
    ...effects.breaks.map(e => e.targetId),
  ].filter((id): id is string => !!id))]
}

function buildToughnessDamageByTarget(events: BattleEvent[], sim: Simulator, targetOrder: string[]): CombatToughnessRecord[] {
  const byTarget = new Map<string, CombatToughnessRecord>()
  for (const e of events) {
    if (e.type !== 'TOUGHNESS_DAMAGE') continue
    const targetId = e.targetId ?? ''
    if (!targetId) continue
    const amount = Math.max(0, Number(e.payload.amount ?? e.payload.damage ?? 0) || 0)
    const existing = byTarget.get(targetId)
    if (existing) existing.damage += amount
    else byTarget.set(targetId, {
      targetId,
      targetName: sim.roster.find(u => u.id === targetId)?.name ?? e.target ?? 'Unknown',
      damage: amount,
    })
  }
  const ordered = targetOrder.map(id => byTarget.get(id)).filter((t): t is CombatToughnessRecord => !!t)
  const orderedIds = new Set(ordered.map(t => t.targetId))
  return [...ordered, ...[...byTarget.values()].filter(t => !orderedIds.has(t.targetId))]
}

/**
 * Aggregates BattleEvent[] into CombatActionRecord[].
 * Uses the combatActionId/attackId from BattleLogger action context.
 * Groups all attacks under one action per combatActionId.
 */
export function aggregateCombatActions(
  events: BattleEvent[],
  sim: Simulator,
  snapshots: StateSnapshot[]
): CombatActionRecord[] {
  const eventsByCombatAction = new Map<string, BattleEvent[]>()
  let techniqueKey: string | undefined
  for (const e of events) {
    if (e.type === 'TECHNIQUE_APPLIED') techniqueKey = `technique:${e.eventId}`
    else if (techniqueKey && (e.combatActionId || TECHNIQUE_BOUNDARY_EVENTS.has(e.type))) techniqueKey = undefined
    const key = e.combatActionId ?? techniqueKey
    if (!key) continue
    const event = techniqueKey && SHIELD_ATTACK_EVENTS.has(e.type) && !e.attackId
      ? { ...e, attackId: `${techniqueKey}:attack` }
      : e
    const bucket = eventsByCombatAction.get(key) ?? []
    bucket.push(event)
    eventsByCombatAction.set(key, bucket)
  }

  const actions: CombatActionRecord[] = []
  for (const [combatActionId, actionEvents] of eventsByCombatAction) {
    const boundary = actionEvents.find(e => e.type === 'ACTION_START') ?? actionEvents[0]
    if (!boundary) continue
    const abilityEvent = actionEvents.find(e => e.type === 'ABILITY_USED' || e.type === 'TECHNIQUE_APPLIED') ?? boundary
    const sourceId = boundary.sourceId ?? actionEvents.find(e => e.sourceId)?.sourceId
    const sourceUnit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
    const baseCategory = categorizeAction(actionEvents, sourceUnit)
    const abilityId = (abilityEvent.payload.abilityId ?? abilityEvent.payload.ability_id) as string | undefined
    const abilitySlot = (abilityEvent.payload.slot ?? abilityEvent.payload.abilitySlot ??
      (abilityEvent.type === 'TECHNIQUE_APPLIED' ? 'technique' : undefined)) as string | undefined
    const abilityName = resolveAbilityName(abilityNameOf(abilityEvent), abilityId, abilitySlot, sourceUnit, sim)
    const ability = { abilityId, abilityName, abilitySlot }
    const rawAttacks = [...groupEventsByAttack(actionEvents)]
      .map(([attackId, attackEvents]) => buildAttackRecord(attackEvents, attackId, sim, baseCategory, ability))
      .filter((a): a is CombatAttackRecord => a !== null)
    const hasRealAttack = rawAttacks.some(a => a.hits.length > 0 || a.totalDamage > 0)
    const attacksArray = rawAttacks.filter(a => a.hits.length > 0 || a.totalDamage > 0 || a.shieldDamage > 0)
    const category = !hasRealAttack && baseCategory === 'attack'
      ? (hasMeaningfulContent(actionEvents) ? 'effect' : 'system')
      : baseCategory
    if (category === 'system') continue
    const tags = categorizeTags(actionEvents, category, abilityName, hasRealAttack)

    const sourceName = sourceUnit?.name ?? boundary.source ?? 'Unknown'
    const effects = buildEffectsSummary(actionEvents, sim)
    const effectTargets = effectTargetIds(effects)
    const attackTargetIds = attacksArray.flatMap(a => a.targetIds)
    const targetIds = [...new Set([
      ...attackTargetIds,
      ...effectTargets,
      ...actionEvents
        .filter(e => e.type === 'TARGET_SELECTED' ||
          (e.type === 'SUMMON_CREATED' && attackTargetIds.length === 0 && effectTargets.length === 0))
        .map(e => e.targetId).filter((id): id is string => !!id),
    ])]
    const beforeSnapshot = snapshots.find(s => s.actionId === boundary.actionId && s.turn === boundary.turn)
    const afterSnapshot = snapshots.find(s => s.actionId === boundary.actionId + 1 && s.turn === boundary.turn)
      ?? snapshots.find(s => s.actionId === boundary.actionId && s.turn > boundary.turn)
    const toughnessDamageByTarget = buildToughnessDamageByTarget(actionEvents, sim, targetIds)
    const toughnessDamage = toughnessDamageByTarget.reduce((sum, t) => sum + t.damage, 0)
    const spFromEvents = effects.spChanges.reduce((sum, change) => sum + change.delta, 0)
    const spDelta = spFromEvents !== 0 ? spFromEvents
      : beforeSnapshot && afterSnapshot ? afterSnapshot.sp - beforeSnapshot.sp : 0

    actions.push({
      id: combatActionId,
      combatActionId,
      parentActionId: actionEvents.find(e => e.parentActionId !== undefined)?.parentActionId,
      order: 0,
      category,
      tags,
      sourceId,
      sourceName,
      abilityId,
      abilityName,
      abilitySlot,
      av: boundary.time,
      turn: boundary.turn,
      actionId: boundary.actionId,
      targetIds,
      targetNames: targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown'),
      attacks: attacksArray,
      totalDamage: attacksArray.reduce((sum, a) => sum + a.totalDamage, 0),
      shieldDamage: actionEvents.reduce((sum, e) => sum + (e.type === 'SHIELD_ABSORBED' ? Number(e.payload.amount ?? 0) : 0), 0),
      toughnessDamage,
      toughnessDamageByTarget,
      spDelta,
      effects,
      events: actionEvents,
      beforeSnapshot,
      afterSnapshot,
      provenance: actionEvents.find(e => e.provenance)?.provenance,
      isOutOfTurn: actionEvents.some(e => e.payload.extra === true || e.payload.outOfTurn === true) || category === 'extraTurn',
    })
  }

  actions.sort((a, b) => {
    if (a.av !== b.av) return a.av - b.av
    const aFirstEventId = a.events[0]?.eventId ?? 0
    const bFirstEventId = b.events[0]?.eventId ?? 0
    if (aFirstEventId !== bFirstEventId) return aFirstEventId - bFirstEventId
    return a.id.localeCompare(b.id)
  })
  actions.forEach((a, i) => { a.order = i + 1 })
  return actions
}

function abilityNameOf(e: BattleEvent): string {
  const p = e.payload
  if (typeof p.technique === 'string' && p.technique) return p.technique
  return String(p.abilityName ?? p.ability_name ?? p.action ?? e.attackType ?? 'Attack')
}

const GENERIC_ABILITY_SLOTS = new Set([
  'attack', 'ability', 'basic', 'skill', 'ult', 'technique',
  'enhance', 'enhanced', 'assist', 'mem_skill', 'mem_talent',
])

function normalizeAbilitySlot(value: unknown): string {
  const slot = String(value ?? '').trim().toLowerCase()
  if (slot === 'ultimate') return 'ult'
  if (slot === 'memo' || slot === 'memosprite') return 'mem_skill'
  return slot
}

function isGenericAbilityName(value: unknown): boolean {
  return GENERIC_ABILITY_SLOTS.has(normalizeAbilitySlot(value))
}

function resolveAbilityName(
  raw: string,
  abilityId: string | undefined,
  abilitySlot: string | undefined,
  sourceUnit: { kitId?: string; ownerId?: string } | undefined,
  sim: Simulator
): string {
  const text = String(raw ?? '').trim()
  const ownerId = sourceUnit?.ownerId
  const kitId = sourceUnit?.kitId ?? (ownerId ? sim.roster.find(u => u.id === ownerId)?.kitId : undefined)
  if (!kitId || (text && !isGenericAbilityName(text))) return text
  const candidates = [abilitySlot, text, abilityId, text === 'ability' ? 'mem_skill' : undefined]
  for (const candidate of candidates) {
    if (!candidate) continue
    const found = abilityDisplayName(kitId, normalizeAbilitySlot(candidate))
    if (found) return found
  }
  return text
}

function categorizeAction(events: BattleEvent[], sourceUnit?: { kind?: string; side?: string; sharesOwnerBuffs?: boolean }): CombatActionCategory {
  const explicit = events.find(e => e.actionCategory)?.actionCategory
    ?? events.find(e => typeof e.payload.actionKind === 'string')?.payload.actionKind as string | undefined
  if (explicit) {
    if (explicit === 'followUpAttack') return 'bonusAttack'
    if (explicit === 'attack' && sourceUnit?.side === 'enemy') return 'enemyAttack'
    if (explicit === 'attack' || explicit === 'extraTurn' || explicit === 'ultimate' || explicit === 'bonusAttack' ||
        explicit === 'enemyAttack' || explicit === 'technique' || explicit === 'summon' || explicit === 'timer' ||
        explicit === 'effect' || explicit === 'system') return explicit
  }

  if (events.some(e => e.type === 'TECHNIQUE_APPLIED')) return 'technique'
  if (sourceUnit?.kind === 'timer') return 'timer'
  if (sourceUnit?.kind === 'summon' && sourceUnit.sharesOwnerBuffs === true) return 'summon'

  const ability = events.find(e => e.type === 'ABILITY_USED') ?? events[0]
  if (ability && (ability.payload.action === 'ult' || ability.payload.actionKind === 'ult')) return 'ultimate'
  if (events.some(e => e.type === 'EXTRA_TURN' || e.payload.extra === true || e.payload.outOfTurn === true)) return 'extraTurn'
  const hasAttack = events.some(e => ATTACK_EVENTS.has(e.type))
  if (events.some(e => e.type === 'SUMMON_CREATED') && !hasAttack) return 'summon'
  if (sourceUnit?.side === 'enemy' && (hasAttack || events.some(e => e.type === 'ABILITY_USED' || e.type === 'ACTION_START'))) return 'enemyAttack'
  if (hasAttack) return 'attack'
  return hasMeaningfulContent(events) ? 'effect' : 'system'
}

const TAG_ORDER: CombatActionTag[] = [
  'effect', 'technique', 'enemyAttack', 'ultimate', 'attack', 'extraTurn',
  'bonusAttack', 'counter', 'dot', 'breakRestore', 'summon', 'timer',
]

function categorizeTags(
  events: BattleEvent[],
  category: CombatActionCategory,
  abilityName: string,
  hasRealAttack: boolean
): CombatActionTag[] {
  const tags = new Set<CombatActionTag>()
  if (category !== 'system') tags.add(category)
  const text = [abilityName, ...events.flatMap(e => [
    String(e.payload.abilityName ?? ''),
    String(e.payload.action ?? ''),
    String(e.provenance?.abilityName ?? ''),
  ])].join(' ').toLowerCase()
  const followUp = events.some(e => e.actionCategory === 'followUpAttack' || e.payload.actionKind === 'followUpAttack')
  const counter = events.some(e =>
    e.payload.counter === true || e.payload.counterAttack === true || e.payload.isCounter === true) ||
    /counter(?:attack)?/.test(text)
  const dot = events.some(e => e.type === 'DOT_TICK' && Number(e.payload.amount ?? 0) > 0)
  const breakRestore = events.some(e =>
    e.payload.breakRestore === true || e.payload.restoreToughness === true ||
    e.payload.toughnessRestore === true || e.payload.reason === 'break_restore') ||
    /(?:break|weakness)[^|]{0,24}(?:restore|recover)|(?:restore|recover)[^|]{0,24}(?:toughness|break)/.test(text)
  const summon = category === 'summon' ||
    (!hasRealAttack && category !== 'attack' && events.some(e => e.type === 'SUMMON_CREATED'))
  const ultimate = events.some(e =>
    e.payload.action === 'ult' || e.payload.actionKind === 'ult' ||
    e.payload.actionKind === 'ultimate' || e.payload.ult === true ||
    e.provenance?.abilitySlot === 'ult') || /\bult(?:imate)?\b/.test(text)
  const extraTurn = events.some(e =>
    e.type === 'EXTRA_TURN' || (e.payload.extra === true && !followUp) || e.payload.outOfTurn === true)
  const effect = hasMeaningfulContent(events) ||
    events.some(e => e.type === 'BUFF_EXPIRED' || e.type === 'DEBUFF_EXPIRED' || e.type === 'DISPELLED')
  if (hasRealAttack && category !== 'enemyAttack') tags.add('attack')
  if (followUp) tags.add('bonusAttack')
  if (counter) tags.add('counter')
  if (dot) tags.add('dot')
  if (breakRestore) tags.add('breakRestore')
  if (summon) tags.add('summon')
  if (ultimate && category !== 'enemyAttack') tags.add('ultimate')
  if (extraTurn) tags.add('extraTurn')
  if (effect && category !== 'enemyAttack') tags.add('effect')
  return TAG_ORDER.filter(tag => tags.has(tag))
}

function hasMeaningfulContent(events: BattleEvent[]): boolean {
  return events.some(e =>
    e.type === 'BUFF_APPLIED' ||
    e.type === 'BUFF_STACKED' ||
    e.type === 'BUFF_REFRESHED' ||
    e.type === 'DEBUFF_APPLIED' ||
    e.type === 'DEBUFF_STACKED' ||
    e.type === 'DEBUFF_REFRESHED' ||
    e.type === 'HEAL_APPLIED' ||
    e.type === 'SHIELD_APPLIED' ||
    e.type === 'ENERGY_GAIN' ||
    e.type === 'ENERGY_LOSS' ||
    e.type === 'SP_GAIN' ||
    e.type === 'SP_LOSS' ||
    e.type === 'DOT_APPLIED' ||
    e.type === 'WEAKNESS_BREAK' ||
    e.type === 'ENEMY_SPAWN' ||
    e.type === 'PHASE_START' ||
    e.type === 'PHASE_END' ||
    e.type === 'STAT_CHANGED' ||
    e.type === 'NOTE'
  )
}

const ATTACK_EVENTS = new Set<BattleEvent['type']>(['HIT_START', 'HIT_END', 'DAMAGE_CALCULATED', 'DAMAGE_DEALT'])
const SHIELD_ATTACK_EVENTS = new Set<BattleEvent['type']>(['HIT_START', 'HIT_END', 'DAMAGE_CALCULATED', 'DAMAGE_DEALT', 'SHIELD_ABSORBED'])
const TECHNIQUE_BOUNDARY_EVENTS = new Set<BattleEvent['type']>(['ACTION_START', 'ABILITY_USED', 'ACTION_END', 'BATTLE_START', 'BATTLE_END', 'WAVE_START', 'WAVE_END', 'STATE_SNAPSHOT'])

/** Only real attackIds become attacks; action-level and effect events stay on the action record. */
function groupEventsByAttack(events: BattleEvent[]): Map<string, BattleEvent[]> {
  const attacks = new Map<string, BattleEvent[]>()
  for (const e of events) {
    if (!e.attackId || !SHIELD_ATTACK_EVENTS.has(e.type)) continue
    const bucket = attacks.get(e.attackId) ?? []
    bucket.push(e)
    attacks.set(e.attackId, bucket)
  }
  return attacks
}

function buildAttackRecord(
  attackEvents: BattleEvent[],
  attackId: string,
  sim: Simulator,
  category: CombatActionCategory,
  actionAbility: { abilityId?: string; abilityName: string; abilitySlot?: string }
): CombatAttackRecord | null {
  const first = attackEvents[0]
  if (!first) return null
  const targetIds = [...new Set(attackEvents.map(e => e.targetId).filter((id): id is string => !!id))]
  const abilityEvent = attackEvents.find(e => e.type === 'ABILITY_USED') ?? first
  const localName = abilityNameOf(abilityEvent)
  const resolvedName = isGenericAbilityName(localName) ? actionAbility.abilityName : localName
  return {
    attackId,
    targetIds,
    targetNames: targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown'),
    hits: buildHits(attackEvents, sim),
    totalDamage: attackEvents.reduce((sum, e) => sum + (e.type === 'DAMAGE_DEALT' ? Number(e.payload.amount ?? 0) : 0), 0),
    shieldDamage: attackEvents.reduce((sum, e) => sum + (e.type === 'SHIELD_ABSORBED' ? Number(e.payload.amount ?? 0) : 0), 0),
    abilityId: ((abilityEvent.payload.abilityId ?? abilityEvent.payload.ability_id) as string | undefined) ?? actionAbility.abilityId,
    abilityName: resolvedName,
    abilitySlot: ((abilityEvent.payload.slot ?? abilityEvent.payload.abilitySlot) as string | undefined) ?? actionAbility.abilitySlot,
    category,
    provenance: attackEvents.find(e => e.provenance)?.provenance,
    parentActionId: attackEvents.find(e => e.parentActionId !== undefined)?.parentActionId,
  }
}

function buildHits(attackEvents: BattleEvent[], sim: Simulator): CombatHitRecord[] {
  const hits: CombatHitRecord[] = []
  const pendingShield = new Map<string, number>()

  for (const e of attackEvents) {
    if (e.type === 'SHIELD_ABSORBED') {
      const targetId = e.targetId ?? (e.payload.targetId as string | undefined) ?? ''
      pendingShield.set(targetId, (pendingShield.get(targetId) ?? 0) + Number(e.payload.amount ?? 0))
      continue
    }
    if (e.type !== 'DAMAGE_DEALT') continue

    const targetId = e.targetId ?? ''
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    const payload = e.payload as Record<string, unknown>
    const breakdown = payload.breakdown as any

    hits.push({
      hitIndex: hits.length,
      targetId,
      targetName: targetUnit?.name ?? e.target ?? 'Unknown',
      damage: Math.round(Number(payload.amount) ?? 0),
      shieldDamage: Math.round(pendingShield.get(targetId) ?? 0),
      crit: payload.crit === true,
      element: e.element ?? 'Physical',
      attackType: e.attackType ?? 'unknown',
      traceId: e.traceId,
      breakdown: breakdown ? {
        stat: breakdown.stat,
        mult: breakdown.mult,
        flat: breakdown.flat,
        final: breakdown.final,
        dmg: breakdown.dmg,
        critRate: breakdown.critRate,
        critDmg: breakdown.critDmg,
        critBonus: breakdown.critBonus,
        boost: breakdown.boost,
        weaken: breakdown.weaken,
        defPen: breakdown.defPen,
        res: breakdown.res,
        resPen: breakdown.resPen,
        vuln: breakdown.vuln,
        mit: breakdown.mit,
        broken: breakdown.broken,
      } : undefined,
    })
    pendingShield.delete(targetId)
  }

  for (const [targetId, amount] of pendingShield) {
    if (amount <= 0) continue
    const shieldEvent = [...attackEvents].reverse()
      .find(e => e.type === 'SHIELD_ABSORBED' && (e.targetId ?? (e.payload.targetId as string | undefined) ?? '') === targetId)
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    hits.push({
      hitIndex: hits.length,
      targetId,
      targetName: targetUnit?.name ?? shieldEvent?.target ?? 'Unknown',
      damage: 0,
      shieldDamage: Math.round(amount),
      crit: false,
      element: shieldEvent?.element ?? 'Physical',
      attackType: shieldEvent?.attackType ?? 'shield',
      traceId: shieldEvent?.traceId,
    })
  }

  return hits
}

function buildEffectsSummary(
  attackEvents: BattleEvent[],
  sim: Simulator
): CombatEffectSummary {
  const summary: CombatEffectSummary = {
    buffs: [],
    debuffs: [],
    dots: [],
    controls: [],
    ticks: [],
    shields: [],
    shieldDamage: [],
    heals: [],
    removals: [],
    energyChanges: [],
    spChanges: [],
    breaks: [],
    other: [],
  }

  const shieldKey = (id: unknown, targetId: string, amount: unknown): string =>
    `${String(id ?? '')}|${targetId}|${Math.round(Number(amount) || 0)}`
  const explicitShieldKeys = new Set(
    attackEvents
      .filter(e => e.type === 'SHIELD_APPLIED')
      .map(e => shieldKey((e.payload as any)?.id, e.targetId ?? (e.payload as any)?.targetId ?? '', (e.payload as any)?.amount))
  )
  const emittedShieldKeys = new Set<string>()

  for (const e of attackEvents) {
    const payload = e.payload as any
    const targetId = e.targetId ?? payload.targetId ?? ''
    const sourceId = e.sourceId ?? payload.sourceId
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    const targetName = targetUnit?.name ?? e.target ?? payload.targetName ?? 'Unknown'
    const sourceUnit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
    const sourceName = sourceUnit?.name ?? e.source ?? (typeof payload.sourceName === 'string' ? payload.sourceName : undefined)

    switch (e.type) {
      case 'BUFF_APPLIED':
      case 'BUFF_STACKED':
      case 'BUFF_REFRESHED': {
        const isDebuff = payload.debuff === true
        const shieldAmount = payload.shield as number | undefined
        if (shieldAmount !== undefined) {
          const key = shieldKey(payload.id, targetId, shieldAmount)
          if (!explicitShieldKeys.has(key) && !emittedShieldKeys.has(key)) {
            emittedShieldKeys.add(key)
            summary.shields.push({
              id: payload.id as string,
              name: payload.name as string,
              targetId,
              targetName,
              amount: shieldAmount,
              sourceId,
              sourceName,
              appliedById: payload.appliedById,
              provenance: e.provenance,
            })
          }
        } else if (isDebuff) {
          summary.debuffs.push({
            id: payload.id as string,
            name: payload.name as string,
            targetId,
            targetName,
            stacks: (payload.stacks as number) ?? 1,
            maxStacks: payload.maxStacks as number | undefined,
            turns: (payload.turns as number) ?? Infinity,
            sourceId,
            sourceName,
            appliedById: payload.appliedById,
            provenance: e.provenance,
            mods: (payload.mods as Array<{ stat: string; value: number }>) ?? [],
          })
        } else {
          summary.buffs.push({
            id: payload.id as string,
            name: payload.name as string,
            targetId,
            targetName,
            stacks: (payload.stacks as number) ?? 1,
            maxStacks: payload.maxStacks as number | undefined,
            turns: (payload.turns as number) ?? Infinity,
            sourceId,
            sourceName,
            appliedById: payload.appliedById,
            provenance: e.provenance,
            mods: (payload.mods as Array<{ stat: string; value: number }>) ?? [],
          })
        }
        break
      }
      case 'DEBUFF_APPLIED':
      case 'DEBUFF_STACKED':
      case 'DEBUFF_REFRESHED': {
        summary.debuffs.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName,
          stacks: payload.stacks ?? 1,
          maxStacks: payload.maxStacks as number | undefined,
          turns: payload.turns ?? Infinity,
          sourceId,
          sourceName,
          appliedById: payload.appliedById,
          provenance: e.provenance,
          mods: payload.mods ?? [],
        })
        break
      }
      case 'DOT_APPLIED': {
        summary.dots.push({
          id: payload.id ?? payload.kind ?? 'dot',
          name: payload.name ?? payload.kind ?? e.source ?? 'DoT',
          targetId,
          targetName,
          element: payload.element ?? e.element ?? 'Physical',
          damage: payload.baseDmg ?? payload.damage ?? 0,
          turns: payload.turns ?? 0,
          stacks: payload.stacks ?? 1,
          sourceId,
          sourceName: sourceName ?? e.source ?? payload.sourceName,
          provenance: e.provenance,
        })
        break
      }
      case 'CONTROL_APPLIED': {
        summary.controls.push({
          id: payload.id ?? payload.kind ?? 'control',
          name: payload.name ?? payload.kind ?? 'Control',
          targetId,
          targetName,
          turns: payload.turns ?? 0,
          stacks: payload.stacks ?? 1,
          sourceId,
          sourceName: sourceName ?? e.source ?? payload.sourceName,
          provenance: e.provenance,
        })
        break
      }
      case 'DOT_TICK': {
        summary.ticks.push({
          id: payload.id ?? payload.kind ?? 'dot',
          name: payload.name ?? payload.kind ?? 'DoT',
          targetId,
          targetName,
          amount: payload.amount ?? 0,
          element: payload.element ?? e.element ?? 'Physical',
          sourceId,
          sourceName: sourceName ?? e.source ?? payload.sourceName,
          provenance: e.provenance,
        })
        break
      }
      case 'SHIELD_APPLIED': {
        const key = shieldKey(payload.id, targetId, payload.amount)
        if (!emittedShieldKeys.has(key)) {
          emittedShieldKeys.add(key)
          summary.shields.push({
            id: payload.id,
            name: payload.name,
            targetId,
            targetName,
            amount: payload.amount ?? 0,
            sourceId,
            sourceName,
            appliedById: payload.appliedById,
            provenance: e.provenance,
          })
        }
        break
      }
      case 'SHIELD_ABSORBED': {
        summary.shieldDamage.push({
          id: payload.id ?? 'shield',
          name: payload.name ?? 'Shield',
          targetId,
          targetName,
          amount: payload.amount ?? 0,
          incoming: payload.incoming ?? payload.amount ?? 0,
          remaining: payload.remaining ?? 0,
          sourceId,
          sourceName,
          provenance: e.provenance,
        })
        break
      }
      case 'HEAL_APPLIED': {
        summary.heals.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName,
          amount: payload.amount ?? 0,
          requested: payload.requested ?? payload.amount ?? 0,
          applied: payload.applied ?? payload.amount ?? 0,
          sourceId,
          sourceName,
          provenance: e.provenance,
        })
        break
      }
      case 'ENERGY_GAIN': {
        summary.energyChanges.push({
          targetId,
          targetName,
          delta: Math.abs(Number(payload.n ?? payload.amount ?? 0) || 0),
          reason: payload.reason ?? 'energy_gain',
        })
        break
      }
      case 'ENERGY_LOSS': {
        summary.energyChanges.push({
          targetId,
          targetName,
          delta: -Math.abs(payload.amount ?? 0),
          reason: payload.reason ?? 'energy_loss',
        })
        break
      }
      case 'SP_GAIN': {
        summary.spChanges.push({
          targetId,
          targetName,
          delta: Math.abs(payload.n ?? payload.amount ?? 0),
          reason: payload.reason ?? 'sp_gain',
        })
        break
      }
      case 'SP_LOSS': {
        summary.spChanges.push({
          targetId,
          targetName,
          delta: -Math.abs(payload.n ?? payload.amount ?? 0),
          reason: payload.reason ?? 'sp_loss',
        })
        break
      }
      case 'WEAKNESS_BREAK': {
        summary.breaks.push({
          targetId,
          targetName,
          element: payload.element ?? e.element ?? 'Physical',
          breakDamage: payload.breakDamage ?? payload.amount ?? 0,
        })
        break
      }
      case 'BUFF_EXPIRED':
      case 'DEBUFF_EXPIRED':
      case 'CONTROL_EXPIRED':
      case 'DISPELLED':
      case 'DOT_EXPIRED':
      case 'SHIELD_BROKEN': {
        const kind: CombatEffectSummary['removals'][number]['kind'] =
          e.type === 'DOT_EXPIRED' ? 'dot'
          : e.type === 'SHIELD_BROKEN' ? 'shield'
          : (e.type === 'DEBUFF_EXPIRED' || e.type === 'CONTROL_EXPIRED' || e.type === 'DISPELLED' || payload.debuff === true) ? 'debuff'
          : 'buff'
        summary.removals.push({
          kind,
          id: payload.id ?? payload.kind ?? '',
          name: payload.name ?? payload.kind ?? '',
          targetId,
          targetName,
          stacks: payload.stacks ?? 1,
          sourceId,
          sourceName,
          appliedById: payload.appliedById,
          provenance: e.provenance,
        })
        break
      }
      case 'NOTE':
        summary.other.push({
          type: e.type,
          targetId,
          targetName,
          description: e.raw || JSON.stringify(e.payload),
        })
        break
      default:
        if (e.type !== 'ACTION_START' && e.type !== 'ACTION_END' &&
            e.type !== 'HIT_START' && e.type !== 'HIT_END' && e.type !== 'DAMAGE_DEALT' &&
            e.type !== 'DAMAGE_CALCULATED') {
          summary.other.push({
            type: e.type,
            targetId: e.targetId ?? '',
            targetName: e.target ?? 'Unknown',
            description: JSON.stringify(e.payload),
          })
        }
    }
  }

  return summary
}

/**
 * Collects snapshots from a battle for historical replay.
 * Call this after battle completes with appropriate LogConfig.
 */
export function collectSnapshots(logger: { events: BattleEvent[] }): StateSnapshot[] {
  return logger.events
    .filter(e => e.type === 'STATE_SNAPSHOT' && e.payload.state)
    .map(e => e.payload.state as StateSnapshot)
}