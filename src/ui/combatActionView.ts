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

export type CombatActionCategory = 'attack' | 'bonusAttack' | 'extraTurn' | 'ultimate' | 'system'

export interface CombatHitRecord {
  hitIndex: number
  targetId: string
  targetName: string
  damage: number
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
    mods: Array<{ stat: string; value: number }>
    shield?: number
  }>
  debuffs: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    stacks: number
    turns: number
    sourceId?: string
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
  }>
  shields: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    sourceId?: string
  }>
  heals: Array<{
    id: string
    name: string
    targetId: string
    targetName: string
    amount: number
    sourceId?: string
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

export interface CombatActionRecord {
  id: string
  combatActionId: string
  parentActionId?: string

  category: CombatActionCategory

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
  // Group events by combatActionId (gameplay action level)
  const eventsByCombatAction = new Map<string, BattleEvent[]>()
  for (const e of events) {
    const key = e.combatActionId ?? `${e.actionId}`
    if (!eventsByCombatAction.has(key)) eventsByCombatAction.set(key, [])
    eventsByCombatAction.get(key)!.push(e)
  }

  const actions: CombatActionRecord[] = []

  for (const [combatActionId, actionEvents] of eventsByCombatAction) {
    if (actionEvents.length === 0) continue

    // Group by attackId within this combat action
    const attacks = groupEventsByAttack(actionEvents)

    // Build all attacks for this combat action
    const attacksArray: CombatAttackRecord[] = []
    let totalDamage = 0
    let overallCategory: CombatActionCategory = 'system'
    let abilityEvent: BattleEvent | undefined
    let provenance: CombatActionRecord['provenance']
    let firstEvent: BattleEvent | undefined

    for (const [attackId, attackEvents] of attacks) {
      const category = categorizeAttack(attackEvents)
      if (category === 'system' && !hasMeaningfulContent(attackEvents)) continue

      // Track the first event for metadata
      if (!firstEvent) firstEvent = attackEvents[0]

      // Track overall category priority: ultimate > extraTurn > bonusAttack > attack > system
      const catPriority = { ultimate: 4, extraTurn: 3, bonusAttack: 2, attack: 1, system: 0 }
      if (catPriority[category] > catPriority[overallCategory]) {
        overallCategory = category
      }

      // Track ability event
      if (!abilityEvent) {
        abilityEvent = attackEvents.find(e => e.type === 'ABILITY_USED')
      }

      // Track provenance
      if (!provenance) {
        provenance = attackEvents.find(e => e.provenance)?.provenance
      }

      const attack = buildAttackRecord(attackEvents, attackId, sim)
      if (attack) {
        // Override category with the actual attack category
        attack.category = category
        attacksArray.push(attack)
        totalDamage += attack.totalDamage
      }
    }

    if (attacksArray.length === 0) continue

    // Use firstEvent for metadata
    if (!firstEvent) continue

    // Find source unit
    const sourceId = actionEvents.find(e => e.sourceId)?.sourceId ?? firstEvent.sourceId
    const sourceUnit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
    const sourceName = sourceUnit?.name ?? firstEvent.source ?? 'Unknown'

    // Determine targets across all attacks
    const targetIds = [...new Set(attacksArray.flatMap(a => a.targetIds))] as string[]
    const targetNames = targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown')

    // Build effects summary from all action events
    const effects = buildEffectsSummary(actionEvents, sim)

    // Get ability info from ABILITY_USED event
    const abilitySource = abilityEvent ?? firstEvent
    const abilityId = (abilitySource.payload.abilityId ?? abilitySource.payload.ability_id) as string | undefined
    const abilityName = (abilitySource.payload.abilityName ?? abilitySource.payload.ability_name ?? abilitySource.attackType ?? 'Attack') as string
    const abilitySlot = (abilitySource.payload.slot ?? abilitySource.payload.abilitySlot) as string | undefined

    // Get provenance
    if (!provenance) {
      provenance = actionEvents.find(e => e.provenance)?.provenance
    }

    // Determine if out-of-turn
    const isOutOfTurn = actionEvents.some(e => e.payload.extra === true || e.payload.outOfTurn === true)

    // Snapshots
    const beforeSnapshot = snapshots.find(s => s.actionId === firstEvent!.actionId && s.turn === firstEvent!.turn)
    const afterSnapshot = snapshots.find(s => s.actionId === firstEvent!.actionId + 1 && s.turn === firstEvent!.turn) ?? snapshots.find(s => s.actionId === firstEvent!.actionId && s.turn > firstEvent!.turn)

    // Determine parentActionId from the first attack's parentActionId
    const parentActionId = actionEvents.find(e => e.parentActionId)?.parentActionId

    actions.push({
      id: combatActionId,
      combatActionId,
      parentActionId,
      category: overallCategory,
      sourceId,
      sourceName,
      abilityId,
      abilityName,
      abilitySlot,
      av: firstEvent!.time,
      turn: firstEvent!.turn,
      actionId: firstEvent!.actionId,
      targetIds,
      targetNames,
      attacks: attacksArray,
      totalDamage,
      effects,
      events: actionEvents,
      beforeSnapshot,
      afterSnapshot,
      provenance,
      isOutOfTurn,
    })
  }

  // Sort by AV time for chronological display
  // Tie-breakers: 1) AV, 2) first event's eventId, 3) stable action ID
  actions.sort((a, b) => {
    if (a.av !== b.av) return a.av - b.av
    const aFirstEventId = a.events[0]?.eventId ?? 0
    const bFirstEventId = b.events[0]?.eventId ?? 0
    if (aFirstEventId !== bFirstEventId) return aFirstEventId - bFirstEventId
    return a.id.localeCompare(b.id)
  })
  return actions
}

function categorizeAttack(events: BattleEvent[]): CombatActionCategory {
  // Use actionCategory from events if available (set by BattleLogger context)
  const explicitCategory = events.find(e => e.actionCategory)?.actionCategory
  if (explicitCategory && explicitCategory !== 'system') {
    // Engine uses 'followUpAttack' internally; map to UI 'bonusAttack'
    if (explicitCategory === 'followUpAttack') return 'bonusAttack'
    return explicitCategory as CombatActionCategory
  }

  // Fallback heuristics
  const hasUlt = events.some(e => e.attackType === 'ult' || e.payload.action === 'ult' || e.payload.actionKind === 'ult')
  if (hasUlt) return 'ultimate'

  const extraTurnEvent = events.find(e => e.type === 'EXTRA_TURN')
  if (extraTurnEvent) return 'extraTurn'

  const hasFua = events.some(e => e.attackType === 'fua' || e.payload.type === 'fua' || e.payload.abilityType === 'fua')
  if (hasFua) return 'bonusAttack'

  const hasAttack = events.some(e =>
    e.type === 'ABILITY_USED' ||
    e.type === 'DAMAGE_DEALT' ||
    e.type === 'HIT_START'
  )
  if (hasAttack) return 'attack'

  const hasContent = events.some(e =>
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
    e.type === 'WEAKNESS_BREAK'
  )
  if (hasContent) return 'attack'

  return 'system'
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
    e.type === 'WEAKNESS_BREAK'
  )
}

function groupEventsByAttack(events: BattleEvent[]): Map<string, BattleEvent[]> {
  const attacks = new Map<string, BattleEvent[]>()

  for (const e of events) {
    let attackKey = e.attackId
    if (!attackKey && e.actionId) {
      if (e.traceId) {
        const parts = e.traceId.split('.')
        if (parts.length >= 2) attackKey = `${parts[0]}.${parts[1]}`
      }
      if (!attackKey) {
        const atkSeq = (e.payload.atkSeq ?? e.payload.attackSeq ?? 1) as number
        attackKey = `${e.actionId}.${atkSeq}`
      }
    }
    if (!attackKey) attackKey = `${e.actionId}.1`

    if (!attacks.has(attackKey)) attacks.set(attackKey, [])
    attacks.get(attackKey)!.push(e)
  }

  return attacks
}



function buildHits(attackEvents: BattleEvent[], sim: Simulator): CombatHitRecord[] {
  const damageEvents = attackEvents.filter(e => e.type === 'DAMAGE_DEALT')
  const hits: CombatHitRecord[] = []

  for (let i = 0; i < damageEvents.length; i++) {
    const e = damageEvents[i]
    const targetId = e.targetId ?? ''
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    const payload = e.payload as Record<string, unknown>

    // Use breakdown directly from payload (set by DamagePipeline.ts)
    const breakdown = payload.breakdown as any

    hits.push({
      hitIndex: i,
      targetId,
      targetName: targetUnit?.name ?? e.target ?? 'Unknown',
      damage: Math.round(Number(payload.amount) ?? 0),
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
  }

  return hits
}

function buildEffectsSummary(attackEvents: BattleEvent[], sim: Simulator): CombatEffectSummary {
  const summary: CombatEffectSummary = {
    buffs: [],
    debuffs: [],
    dots: [],
    shields: [],
    heals: [],
    energyChanges: [],
    spChanges: [],
    breaks: [],
    other: [],
  }

  for (const e of attackEvents) {
    const payload = e.payload as any
    const targetId = e.targetId ?? payload.targetId ?? ''
    const sourceId = e.sourceId ?? payload.sourceId ?? ''
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    const targetName = targetUnit?.name ?? e.target ?? payload.targetName ?? 'Unknown'

    switch (e.type) {
      case 'BUFF_APPLIED':
      case 'BUFF_STACKED':
      case 'BUFF_REFRESHED': {
        const isDebuff = payload.debuff === true
        const effect = {
          id: payload.id as string,
          name: payload.name as string,
          targetId,
          targetName,
          stacks: (payload.stacks as number) ?? 1,
          turns: (payload.turns as number) ?? Infinity,
          sourceId,
          mods: (payload.mods as Array<{ stat: string; value: number }>) ?? [],
          shield: payload.shield as number | undefined,
        }
        if (isDebuff) {
          summary.debuffs.push(effect)
        } else {
          summary.buffs.push(effect)
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
          turns: payload.turns ?? Infinity,
          sourceId,
          mods: payload.mods ?? [],
        })
        break
      }
      case 'DOT_APPLIED': {
        summary.dots.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName,
          element: payload.element ?? 'Physical',
          damage: payload.baseDmg ?? payload.damage ?? 0,
          turns: payload.turns ?? 0,
          stacks: payload.stacks ?? 1,
          sourceId,
        })
        break
      }
      case 'SHIELD_APPLIED': {
        summary.shields.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName,
          amount: payload.amount ?? 0,
          sourceId,
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
          sourceId,
        })
        break
      }
      case 'ENERGY_GAIN': {
        summary.energyChanges.push({
          targetId,
          targetName,
          delta: Math.abs(payload.amount ?? 0),
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
      default:
        if (e.type !== 'NOTE' && e.type !== 'ACTION_START' && e.type !== 'ACTION_END' &&
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