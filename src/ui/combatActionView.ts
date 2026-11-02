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
}

/**
 * Aggregates BattleEvent[] into CombatActionRecord[].
 * Uses the ACT/ATK/HIT/DMG identity chain from BattleLogger.
 */
export function aggregateCombatActions(
  events: BattleEvent[],
  sim: Simulator,
  snapshots: StateSnapshot[]
): CombatActionRecord[] {
  // Group events by actionId (ACT level)
  const eventsByAction = new Map<number, BattleEvent[]>()
  for (const e of events) {
    if (!eventsByAction.has(e.actionId)) eventsByAction.set(e.actionId, [])
    eventsByAction.get(e.actionId)!.push(e)
  }

  const actions: CombatActionRecord[] = []

  for (const [actionId, actionEvents] of eventsByAction) {
    if (actionEvents.length === 0) continue

    // Determine the category of this action
    const category = categorizeAction(actionEvents)

    // Skip pure system actions unless they have meaningful content
    if (category === 'system' && !hasMeaningfulContent(actionEvents)) continue

    // Find the primary attack within this action
    const attacks = groupEventsByAttack(actionEvents)

    for (const [attackId, attackEvents] of attacks) {
      const action = buildCombatAction(
        attackEvents,
        actionId,
        attackId,
        category,
        sim,
        snapshots
      )
      if (action) actions.push(action)
    }
  }

  return actions
}

function categorizeAction(events: BattleEvent[]): CombatActionCategory {
  // Check for ultimate first (highest priority)
  const hasUlt = events.some(e => e.attackType === 'ult' || e.payload.action === 'ult')
  if (hasUlt) return 'ultimate'

  // Check for extra turn
  const extraTurnEvent = events.find(e => e.type === 'EXTRA_TURN')
  if (extraTurnEvent) return 'extraTurn'

  // Check for bonus attack (FUA)
  const hasFua = events.some(e => e.attackType === 'fua' || e.payload.type === 'fua')
  if (hasFua) return 'bonusAttack'

  // Check for normal attack/skill/enhance
  const hasAttack = events.some(e =>
    e.type === 'ABILITY_USED' ||
    e.type === 'DAMAGE_DEALT' ||
    e.type === 'HIT_START'
  )
  if (hasAttack) return 'attack'

  // Check for other meaningful events
  const hasContent = events.some(e =>
    e.type === 'BUFF_APPLIED' ||
    e.type === 'DEBUFF_APPLIED' ||
    e.type === 'HEAL_APPLIED' ||
    e.type === 'SHIELD_APPLIED' ||
    e.type === 'ENERGY_GAIN' ||
    e.type === 'SP_GAIN'
  )
  if (hasContent) return 'attack'

  return 'system'
}

function hasMeaningfulContent(events: BattleEvent[]): boolean {
  return events.some(e =>
    e.type === 'BUFF_APPLIED' ||
    e.type === 'DEBUFF_APPLIED' ||
    e.type === 'HEAL_APPLIED' ||
    e.type === 'SHIELD_APPLIED' ||
    e.type === 'ENERGY_GAIN' ||
    e.type === 'SP_GAIN' ||
    e.type === 'DOT_APPLIED' ||
    e.type === 'WEAKNESS_BREAK'
  )
}

function groupEventsByAttack(events: BattleEvent[]): Map<string, BattleEvent[]> {
  const attacks = new Map<string, BattleEvent[]>()

  // Group by traceId ATK level (e.g., "123.1")
  for (const e of events) {
    let attackKey = e.traceId
    if (!attackKey && e.actionId) {
      // Fallback: use actionId + attack sequence
      const atkSeq = (e.payload.atkSeq ?? e.payload.attackSeq ?? 1) as number
      attackKey = `${e.actionId}.${atkSeq}`
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
  snapshots: StateSnapshot[]
): CombatActionRecord | null {
  if (attackEvents.length === 0) return null

  const firstEvent = attackEvents[0]

  // Find source unit
  const sourceId = attackEvents.find(e => e.sourceId)?.sourceId ?? firstEvent.sourceId
  const sourceUnit = sourceId ? sim.roster.find(u => u.id === sourceId) : undefined
  const sourceName = sourceUnit?.name ?? firstEvent.source ?? 'Unknown'

  // Find ability info
  attackEvents.find(e => e.type === 'ABILITY_USED')

  // Determine targets
  const targetIds = [...new Set(attackEvents.map(e => e.targetId).filter(Boolean))] as string[]
  const targetNames = targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown')

  // Build hits from DAMAGE_DEALT events
  const hits = buildHits(attackEvents, sim)

  // Calculate total damage
  const totalDamage = hits.reduce((sum, h) => sum + h.damage, 0)

  // Build effects summary
  const effects = buildEffectsSummary(attackEvents)

  // Determine if out-of-turn
  const isOutOfTurn = attackEvents.some(e => e.payload.extra === true || e.payload.outOfTurn === true)

  // Get provenance from first event that has it
  const provenance = attackEvents.find(e => e.provenance)?.provenance

  const abilityId = (firstEvent.payload.abilityId ?? firstEvent.payload.ability_id) as string | undefined
  const abilityName = (firstEvent.payload.abilityName ?? firstEvent.payload.ability_name ?? firstEvent.attackType ?? 'Attack') as string
  const abilitySlot = (firstEvent.payload.slot ?? firstEvent.payload.abilitySlot) as string | undefined

  return {
    id: `${actionId}-${attackId}`,
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
    parentActionId: undefined,
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

    // Find corresponding DmgTrace for breakdown
    const trace = sim.logger.damage.find(t => t.whoId === e.sourceId && t.foeId === e.targetId && Math.abs(t.dmg - (Number(payload.amount) ?? 0)) < 1)

    hits.push({
      hitIndex: i,
      targetId,
      targetName: targetUnit?.name ?? e.target ?? 'Unknown',
      damage: Math.round(Number(payload.amount) ?? 0),
      crit: payload.crit === true,
      element: e.element ?? 'Physical',
      attackType: e.attackType ?? 'unknown',
      traceId: e.traceId,
      breakdown: trace ? {
        stat: trace.stat,
        mult: trace.mult,
        flat: trace.flat,
        final: trace.final,
        dmg: trace.dmg,
        critRate: trace.critRate,
        critDmg: trace.critDmg,
        critBonus: trace.critBonus,
        boost: trace.boost,
        weaken: trace.weaken,
        defPen: trace.defPen,
        res: trace.res,
        resPen: trace.resPen,
        vuln: trace.vuln,
        mit: trace.mit,
        broken: trace.broken,
      } : undefined,
    })
  }

return hits
  }

  function buildEffectsSummary(attackEvents: BattleEvent[]): CombatEffectSummary {
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
      switch (e.type) {
      case 'BUFF_REFRESHED': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        const isDebuff = payload.debuff === true
        const effect = {
          id: payload.id as string,
          name: payload.name as string,
          targetId,
          targetName: targetName ?? 'Unknown',
          stacks: (payload.stacks as number) ?? 1,
          turns: (payload.turns as number) ?? Infinity,
          sourceId: payload.sourceId as string | undefined,
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
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.debuffs.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName: targetName ?? 'Unknown',
          stacks: payload.stacks ?? 1,
          turns: payload.turns ?? Infinity,
          sourceId: payload.sourceId,
          mods: payload.mods ?? [],
        })
        break
      }
      case 'DOT_APPLIED': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.dots.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName: targetName ?? 'Unknown',
          element: payload.element ?? 'Physical',
          damage: payload.baseDmg ?? payload.damage ?? 0,
          turns: payload.turns ?? 0,
          stacks: payload.stacks ?? 1,
          sourceId: payload.sourceId,
        })
        break
      }
      case 'SHIELD_APPLIED': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.shields.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName: targetName ?? 'Unknown',
          amount: payload.amount ?? 0,
          sourceId: payload.sourceId,
        })
        break
      }
      case 'HEAL_APPLIED': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.heals.push({
          id: payload.id,
          name: payload.name,
          targetId,
          targetName: targetName ?? 'Unknown',
          amount: payload.amount ?? 0,
          sourceId: payload.sourceId,
        })
        break
      }
      case 'ENERGY_GAIN':
      case 'ENERGY_LOSS': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.energyChanges.push({
          targetId,
          targetName: targetName ?? 'Unknown',
          delta: payload.amount ?? 0,
          reason: payload.reason ?? e.type,
        })
        break
      }
      case 'SP_GAIN':
      case 'SP_LOSS': {
        const targetId = e.sourceId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.source
        summary.spChanges.push({
          targetId,
          targetName: targetName ?? 'Unknown',
          delta: payload.amount ?? 0,
          reason: payload.reason ?? e.type,
        })
        break
      }
      case 'WEAKNESS_BREAK': {
        const targetId = e.targetId ?? payload.targetId
        const targetName = targetId ? 'Unit' : e.target
        summary.breaks.push({
          targetId,
          targetName: targetName ?? 'Unknown',
          element: payload.element ?? e.element ?? 'Physical',
          breakDamage: payload.breakDamage ?? payload.amount ?? 0,
        })
        break
      }
      default:
        if (e.type !== 'NOTE' && e.type !== 'ACTION_START' && e.type !== 'ACTION_END') {
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