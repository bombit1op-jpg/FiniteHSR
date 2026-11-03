/**
 * BattleLogger Attack ID Tests
 * 
 * Tests for independent attackId generation in BattleLogger.
 */

import { runBattle, ENEMY_PRESETS, type TeamSpec } from '../../../src/core/battle'
import { case_, type Case } from '../../suites'

export default () => {
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
  
  return [
    // Two sequential actions should have different combatActionId and attackId
    case_('sequential actions have unique combatActionId', 
      new Set(actionStarts.map(n => n.combatActionId)).size === actionStarts.length,
      `Expected ${actionStarts.length} unique, got ${new Set(actionStarts.map(n => n.combatActionId)).size}`),
    
    case_('sequential actions have unique attackId', 
      new Set(actionStarts.map(n => n.attackId)).size === actionStarts.length,
      `Expected ${actionStarts.length} unique, got ${new Set(actionStarts.map(n => n.attackId)).size}`),
    
    // Multiple attacks within one action should have unique attackId
    case_('multiple attacks within action have unique attackId', 
      () => {
        // Group attack events by action
        const actionsWithAttacks: string[][] = []
        let currentActionId = ''
        const attackIds: string[] = []
        
        for (const n of attackEvents) {
          if (n.combatActionId !== currentActionId && currentActionId !== '') {
            actionsWithAttacks.push(attackIds)
            attackIds.length = 0
            currentActionId = n.combatActionId
          }
          if (n.attackId) attackIds.push(n.attackId)
        }
        if (attackIds.length > 0) actionsWithAttacks.push(attackIds)
        
        // Check each action has unique attackIds
        let allUnique = true
        for (const ids of actionsWithAttacks) {
          const unique = new Set(ids)
          if (unique.size !== ids.length) {
            allUnique = false
            break
          }
        }
        return allUnique
      },
      'Some actions have duplicate attackIds'),
    
    // Multiple hits within one attack should share same attackId
    case_('multiple hits within attack share same attackId', 
      () => {
        // Group hits by attack
        const attacksWithHits: string[][] = []
        let currentAttackId = ''
        const hitAttackIds: string[] = []
        
        for (const n of attackEvents) {
          if (n.combatActionId !== currentAttackId && currentAttackId !== '') {
            attacksWithHits.push(hitAttackIds)
            hitAttackIds.length = 0
            currentAttackId = n.combatActionId
          }
          if (n.attackId) hitAttackIds.push(n.attackId)
        }
        if (hitAttackIds.length > 0) attacksWithHits.push(hitAttackIds)
        
        // Check each attack has same attackId for all hits
        let allSame = true
        for (const ids of attacksWithHits) {
          if (new Set(ids).size !== 1) {
            allSame = false
            break
          }
        }
        return allSame
      },
      'Some attacks have different attackIds for different hits'),
    
    // All attackIds should be unique across the entire battle
    case_('all attackIds are unique across battle', 
      new Set(attackEvents.map(n => n.attackId).filter(Boolean)).size === attackEvents.length,
      `Expected ${attackEvents.length} unique attackIds, got ${new Set(attackEvents.map(n => n.attackId).filter(Boolean)).size}`),
    
    // Each action should have combatActionId and attackId defined
    case_('each action has combatActionId and attackId', 
      actionStarts.every(n => n.combatActionId !== undefined && n.attackId !== undefined),
      `Some actions missing combatActionId or attackId`),
    
    // No logger errors
    case_('no logger errors', 
      c.logger.errors.length === 0,
      c.logger.errors.join('; ')),
  ]
}
