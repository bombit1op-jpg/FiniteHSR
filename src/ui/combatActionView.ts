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

export type CombatActionCategory =
  | 'attack' | 'bonusAttack' | 'extraTurn' | 'ultimate'
  | 'enemyAttack' | 'technique' | 'summon' | 'timer' | 'effect' | 'system'

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
    sourceName?: string
    appliedById?: string
    provenance?: BattleEvent['provenance']
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

export interface CombatActionRecord {
  id: string
  combatActionId: string
  parentActionId?: string
  order: number

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
  for (const e of events) {
    const key = e.combatActionId ?? (e.type === 'TECHNIQUE_APPLIED' ? `technique:${e.eventId}` : undefined)
    if (!key) continue
    const bucket = eventsByCombatAction.get(key) ?? []
    bucket.push(e)
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
    const abilityName = abilityNameOf(abilityEvent)
    const abilitySlot = (abilityEvent.payload.slot ?? abilityEvent.payload.abilitySlot ??
      (abilityEvent.type === 'TECHNIQUE_APPLIED' ? 'technique' : undefined)) as string | undefined
    const ability = { abilityId, abilityName, abilitySlot }
    const attacksArray = [...groupEventsByAttack(actionEvents)]
      .map(([attackId, attackEvents]) => buildAttackRecord(attackEvents, attackId, sim, baseCategory, ability))
      .filter((a): a is CombatAttackRecord => a !== null && (a.hits.length > 0 || a.totalDamage > 0))
    const category = attacksArray.length === 0 && (baseCategory === 'attack' || baseCategory === 'enemyAttack')
      ? (hasMeaningfulContent(actionEvents) ? 'effect' : 'system')
      : baseCategory

    const sourceName = sourceUnit?.name ?? boundary.source ?? 'Unknown'
    const targetIds = [...new Set([
      ...attacksArray.flatMap(a => a.targetIds),
      ...actionEvents.filter(e => e.type === 'SUMMON_CREATED').map(e => e.targetId).filter((id): id is string => !!id),
    ])]
    const beforeSnapshot = snapshots.find(s => s.actionId === boundary.actionId && s.turn === boundary.turn)
    const afterSnapshot = snapshots.find(s => s.actionId === boundary.actionId + 1 && s.turn === boundary.turn)
      ?? snapshots.find(s => s.actionId === boundary.actionId && s.turn > boundary.turn)
    const effects = buildEffectsSummary(actionEvents, sim)
    const spFromEvents = effects.spChanges.reduce((sum, change) => sum + change.delta, 0)
    const spDelta = spFromEvents !== 0 ? spFromEvents
      : beforeSnapshot && afterSnapshot ? afterSnapshot.sp - beforeSnapshot.sp : 0

    actions.push({
      id: combatActionId,
      combatActionId,
      parentActionId: actionEvents.find(e => e.parentActionId !== undefined)?.parentActionId,
      order: 0,
      category,
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

function categorizeAction(events: BattleEvent[], sourceUnit?: { kind?: string; side?: string }): CombatActionCategory {
  const explicit = events.find(e => e.actionCategory)?.actionCategory
    ?? events.find(e => typeof e.payload.actionKind === 'string')?.payload.actionKind as string | undefined
  if (explicit) {
    if (explicit === 'followUpAttack') return 'bonusAttack'
    if (explicit === 'attack' || explicit === 'extraTurn' || explicit === 'ultimate' || explicit === 'bonusAttack' ||
        explicit === 'enemyAttack' || explicit === 'technique' || explicit === 'summon' || explicit === 'timer' ||
        explicit === 'effect' || explicit === 'system') return explicit
  }

  if (events.some(e => e.type === 'TECHNIQUE_APPLIED')) return 'technique'
  if (sourceUnit?.kind === 'timer') return 'timer'
  if (sourceUnit?.kind === 'summon') return 'summon'

  const ability = events.find(e => e.type === 'ABILITY_USED') ?? events[0]
  if (ability && (ability.payload.action === 'ult' || ability.payload.actionKind === 'ult')) return 'ultimate'
  if (events.some(e => e.type === 'EXTRA_TURN' || e.payload.extra === true || e.payload.outOfTurn === true)) return 'extraTurn'
  const hasAttack = events.some(e => ATTACK_EVENTS.has(e.type))
  if (events.some(e => e.type === 'SUMMON_CREATED') && !hasAttack) return 'summon'
  if (sourceUnit?.side === 'enemy' && (hasAttack || events.some(e => e.type === 'ABILITY_USED' || e.type === 'ACTION_START'))) return 'enemyAttack'
  if (hasAttack) return 'attack'
  return hasMeaningfulContent(events) ? 'effect' : 'system'
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

const ATTACK_EVENTS = new Set<BattleEvent['type']>(['HIT_START', 'HIT_END', 'DAMAGE_CALCULATED', 'DAMAGE_DEALT'])

/** Only real attackIds become attacks; action-level and effect events stay on the action record. */
function groupEventsByAttack(events: BattleEvent[]): Map<string, BattleEvent[]> {
  const attacks = new Map<string, BattleEvent[]>()
  for (const e of events) {
    if (!e.attackId || !ATTACK_EVENTS.has(e.type)) continue
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
  return {
    attackId,
    targetIds,
    targetNames: targetIds.map(id => sim.roster.find(u => u.id === id)?.name ?? 'Unknown'),
    hits: buildHits(attackEvents, sim),
    totalDamage: attackEvents.reduce((sum, e) => sum + (e.type === 'DAMAGE_DEALT' ? Number(e.payload.amount ?? 0) : 0), 0),
    abilityId: ((abilityEvent.payload.abilityId ?? abilityEvent.payload.ability_id) as string | undefined) ?? actionAbility.abilityId,
    abilityName: localName === 'Attack' ? actionAbility.abilityName : localName,
    abilitySlot: ((abilityEvent.payload.slot ?? abilityEvent.payload.abilitySlot) as string | undefined) ?? actionAbility.abilitySlot,
    category,
    provenance: attackEvents.find(e => e.provenance)?.provenance,
    parentActionId: attackEvents.find(e => e.parentActionId !== undefined)?.parentActionId,
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

function buildEffectsSummary(
  attackEvents: BattleEvent[],
  sim: Simulator
): CombatEffectSummary {
  const summary: CombatEffectSummary = {
    buffs: [],
    debuffs: [],
    dots: [],
    shields: [],
    shieldDamage: [],
    heals: [],
    removals: [],
    energyChanges: [],
    spChanges: [],
    breaks: [],
    other: [],
  }

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
        } else if (isDebuff) {
          summary.debuffs.push({
            id: payload.id as string,
            name: payload.name as string,
            targetId,
            targetName,
            stacks: (payload.stacks as number) ?? 1,
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
          id: payload.id,
          name: payload.name,
          targetId,
          targetName,
          element: payload.element ?? 'Physical',
          damage: payload.baseDmg ?? payload.damage ?? 0,
          turns: payload.turns ?? 0,
          stacks: payload.stacks ?? 1,
          sourceId,
          sourceName,
          provenance: e.provenance,
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
          sourceName,
          appliedById: payload.appliedById,
          provenance: e.provenance,
        })
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
      case 'BUFF_EXPIRED':
      case 'DEBUFF_EXPIRED':
      case 'DISPELLED':
      case 'DOT_EXPIRED':
      case 'SHIELD_BROKEN': {
        const kind: CombatEffectSummary['removals'][number]['kind'] =
          e.type === 'DOT_EXPIRED' ? 'dot'
          : e.type === 'SHIELD_BROKEN' ? 'shield'
          : (e.type === 'DEBUFF_EXPIRED' || e.type === 'DISPELLED' || payload.debuff === true) ? 'debuff'
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