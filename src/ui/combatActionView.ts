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

  totalDamage: number
  hits: CombatHitRecord[]

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
  parentActionId?: string
  combatActionId?: string
  attackId?: string
}

/**
 * Aggregates BattleEvent[] into CombatActionRecord[].
 * Uses the combatActionId/attackId from BattleLogger action context.
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

    // Determine the category from actionCategory field (set by BattleLogger context)
    // Fall back to heuristics if not present
    const category = categorizeAction(actionEvents)

    // Skip pure system actions unless they have meaningful content
    if (category === 'system' && !hasMeaningfulContent(actionEvents)) continue

    // Group by attackId within this combat action
    const attacks = groupEventsByAttack(actionEvents)

    for (const [attackId, attackEvents] of attacks) {
      const action = buildCombatAction(
        attackEvents,
        actionEvents[0].actionId,
        attackId,
        category,
        sim,
        snapshots,
        combatActionId
      )
      if (action) actions.push(action)
    }
  }

  // Sort by AV time for chronological display
  actions.sort((a, b) => a.av - b.av)
  return actions
}

function categorizeAction(events: BattleEvent[]): CombatActionCategory {
  // Use actionCategory from events if available (set by BattleLogger context)
  const explicitCategory = events.find(e => e.actionCategory)?.actionCategory
  if (explicitCategory && explicitCategory !== 'system') return explicitCategory

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
    // Use attackId from the event (set by BattleLogger context)
    let attackKey = e.attackId
    if (!attackKey && e.actionId) {
      // Fallback: derive from traceId ATK level (e.g., "123.1")
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

function buildCombatAction(
  attackEvents: BattleEvent[],
  actionId: number,
  attackId: string,
  category: CombatActionCategory,
  sim: Simulator,
  snapshots: StateSnapshot[],
  combatActionId: string
): CombatActionRecord | null {
  if (attackEvents.length === 0) return null

  const firstEvent = attackEvents[0]

  // Find source unit - use top-level sourceId (now properly set in BattleEvent)
  const sourceId = attackEvents.find(e => e.sourceId)?.sourceId ?? firstEvent.sourceId
  const sourceUnit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
  const sourceName = sourceUnit?.name ?? firstEvent.source ?? 'Unknown'

  // Find ability info from ABILITY_USED event
  const abilityEvent = attackEvents.find(e => e.type === 'ABILITY_USED')

  // Determine targets - use top-level targetId
  const targetIds = [...new Set(attackEvents.map(e => e.targetId).filter(Boolean))] as string[]
  const targetNames = targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown')

  // Build hits from DAMAGE_DEALT events
  const hits = buildHits(attackEvents, sim)

  // Calculate total damage
  const totalDamage = hits.reduce((sum, h) => sum + h.damage, 0)

  // Build effects summary
  const effects = buildEffectsSummary(attackEvents, sim)

  // Determine if out-of-turn
  const isOutOfTurn = attackEvents.some(e => e.payload.extra === true || e.payload.outOfTurn === true)

  // Get provenance from first event that has it
  const provenance = attackEvents.find(e => e.provenance)?.provenance

  // Get ability info from ABILITY_USED event or fallback to first event
  const abilitySource = abilityEvent ?? firstEvent
  const abilityId = (abilitySource.payload.abilityId ?? abilitySource.payload.ability_id) as string | undefined
  const abilityName = (abilitySource.payload.abilityName ?? abilitySource.payload.ability_name ?? abilitySource.attackType ?? 'Attack') as string
  const abilitySlot = (abilitySource.payload.slot ?? abilitySource.payload.abilitySlot) as string | undefined

  // Get parentActionId if this is a nested action
  const parentActionId = attackEvents[0].parentActionId

  return {
    id: `${combatActionId}-${attackId}`,
    category,
    sourceId,
    sourceName,
    abilityId,
    abilityName,
    abilitySlot,
    av: firstEvent.time,
    turn: firstEvent.turn,
    actionId,
    targetIds,
    targetNames,
    totalDamage,
    hits,
    effects,
    events: attackEvents,
    provenance,
    isOutOfTurn,
    parentActionId,
    combatActionId,
    attackId,
    beforeSnapshot: snapshots.find(s => s.actionId === actionId && s.turn === firstEvent.turn),
    afterSnapshot: snapshots.find(s => s.actionId === actionId + 1 && s.turn === firstEvent.turn) ?? snapshots.find(s => s.actionId === actionId && s.turn > firstEvent.turn),
  }
}

function buildHits(attackEvents: BattleEvent[], sim: Simulator): CombatHitRecord[] {
  const damageEvents = attackEvents.filter(e => e.type === 'DAMAGE_DEALT')
  const hits: CombatHitRecord[] = []

  for (let i = 0; i < damageEvents.length; i++) {
    const e = damageEvents[i]
    const targetId = e.targetId ?? ''
    const targetUnit = targetId ? sim.roster.find(u => u.id === targetId) : undefined
    const payload = e.payload as Record<string, unknown>

    // Use breakdown directly from payload (set by DamagePipeline.ts line 195)
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