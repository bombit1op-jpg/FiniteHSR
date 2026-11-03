/**
 * BattleLogger Attack ID Tests
 * 
 * Tests for independent attackId generation in BattleLogger.
 */

import { runBattle, ENEMY_PRESETS } from '../../../src/core/battle'
import { case_ } from '../../suites'

// Nested context test - uses BattleLogger directly with minimal stub
async function nestedContextTest(): Promise<{ name: string; ok: boolean; detail?: string }[]> {
  const { BattleLogger } = await import('../../../src/core/battlelog')
  
  // Minimal stub for Simulator
  const stubSim = {
    avElapsed: 0,
    units: () => [],
    sp: () => 5,
    maxSp: 5,
  }
  
  const logger = new BattleLogger(stubSim as any, { debug: 5 })
  
  // 1. Create parent context (normal action)
  logger.turnStart('Parent', 'attack', { actionKind: 'skill' }, 'parent')
  const parentCombatActionId = logger.getActionContext()?.combatActionId
  
  // 2. First attack in parent context
  logger.beginAttack()
  const firstAttackId = logger.getActionContext()?.attackId
  
  // 2b. End first attack (simulate)
  // (in real usage, hits would happen here)
  
  // 3. Create nested context (FUA) using proper API
  logger.startFollowUpAttack(parentCombatActionId)
  
  // 4. Attack in nested context (FUA)
  logger.beginAttack()
  const nestedAttackId = logger.getActionContext()?.attackId
  
  // 5. End nested context
  logger.endFollowUpAttack()
  
  // 6. Continue parent context - second attack
  logger.beginAttack()
  const secondParentAttackId = logger.getActionContext()?.attackId
  
  // 7. End parent
  logger.turnEnd('Parent', 'attack', 'parent')
  
  const allAttackIds = [firstAttackId, nestedAttackId, secondParentAttackId].filter(Boolean)
  
  return [
    case_('nested context: parent first attack uses reserved ID', 
      firstAttackId === '1',
      `Expected "1", got "${firstAttackId}"`),
    
    case_('nested context: nested attack gets unique ID', 
      nestedAttackId === '2',
      `Expected "2", got "${nestedAttackId}"`),
    
    case_('nested context: parent second attack gets new ID', 
      secondParentAttackId === '3',
      `Expected "3", got "${secondParentAttackId}"`),
    
    case_('nested context: all attackIds unique', 
      new Set(allAttackIds).size === allAttackIds.length,
      `Duplicate IDs found: ${allAttackIds.join(', ')}`),
    
    case_('nested context: parent context restored after pop', 
      logger.getActionContext() === undefined,
      'Parent context should be popped'),
  ]
}

export default async () => {
  const c = runBattle({ 
    cycles: 4, 
    seed: 42, 
    log: { debug: 5 },
    team: [{ kitId: 'yanqing', skillPriority: 1 }], 
    enemy: ENEMY_PRESETS.mob 
  })
  
  const nodes = c.logger.events
  const actionStarts = nodes.filter(n => n.type === 'ACTION_START')
  const attackEvents = nodes.filter(n => n.type === 'HIT_START' || n.type === 'HIT_END')
  
  // Group attack events by attackId to find actual attacks
  const attacksById = new Map<string, typeof attackEvents[0][]>()
  for (const e of attackEvents) {
    if (!e.attackId) continue
    if (!attacksById.has(e.attackId)) attacksById.set(e.attackId, [])
    attacksById.get(e.attackId)!.push(e)
  }
  
  // Group attacks by combatActionId to find actions
  const actionsByCombatActionId = new Map<string, string[]>()
  for (const [attackId, events] of attacksById) {
    const combatActionId = events[0].combatActionId
    if (!combatActionId) continue
    if (!actionsByCombatActionId.has(combatActionId)) actionsByCombatActionId.set(combatActionId, [])
    actionsByCombatActionId.get(combatActionId)!.push(attackId)
  }
  
  // Two sequential actions should have different combatActionId and attackId
  const sequentialActionsUniqueCombatActionId = new Set(actionStarts.map(n => n.combatActionId)).size === actionStarts.length
  
  const sequentialActionsUniqueAttackId = new Set(actionStarts.map(n => n.attackId)).size === actionStarts.length
  
  // Multiple attacks within one action should have unique attackId
  let multipleAttacksUnique = true
  for (const attackIds of actionsByCombatActionId.values()) {
    if (new Set(attackIds).size !== attackIds.length) {
      multipleAttacksUnique = false
      break
    }
  }
  
  // Multiple hits within one attack should share same attackId
  let hitsShareSameAttackId = true
  for (const events of attacksById.values()) {
    const attackIds = events.map(e => e.attackId).filter(Boolean)
    if (new Set(attackIds).size !== 1) {
      hitsShareSameAttackId = false
      break
    }
  }
  
  // All attackIds should be unique across the entire battle
  const allAttackIds = Array.from(attacksById.keys())
  const allAttackIdsUnique = new Set(allAttackIds).size === allAttackIds.length
  
  // Each action should have combatActionId and attackId defined
  const eachActionHasIds = actionStarts.every(n => n.combatActionId !== undefined && n.attackId !== undefined)
  
  // No logger errors
  const noLoggerErrors = c.logger.errors.length === 0
  
  return [
    case_('sequential actions have unique combatActionId', 
      sequentialActionsUniqueCombatActionId,
      `Expected ${actionStarts.length} unique, got ${new Set(actionStarts.map(n => n.combatActionId)).size}`),
    
    case_('sequential actions have unique attackId', 
      sequentialActionsUniqueAttackId,
      `Expected ${actionStarts.length} unique, got ${new Set(actionStarts.map(n => n.attackId)).size}`),
    
    case_('multiple attacks within action have unique attackId', 
      multipleAttacksUnique,
      'Some actions have duplicate attackIds'),
    
    case_('multiple hits within attack share same attackId', 
      hitsShareSameAttackId,
      'Some attacks have different attackIds for different hits'),
    
    case_('all attackIds are unique across battle', 
      allAttackIdsUnique,
      `Expected ${allAttackIds.length} unique attackIds, got ${new Set(allAttackIds).size}`),
    
    case_('each action has combatActionId and attackId', 
      eachActionHasIds,
      `Some actions missing combatActionId or attackId`),
    
    case_('no logger errors', 
      noLoggerErrors,
      c.logger.errors.join('; ')),
    
    ...await nestedContextTest(),
  ]
}