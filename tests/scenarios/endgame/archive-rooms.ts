import { endgameEffects, endgameSections, endgameStage } from '../../../src/core/endgame'
import { t } from '../../suites'

export default () => {
  const oldFloor = endgameStage('MoC', '1.0', 'Stage_1')
  const currentFloor = endgameStage('MoC', '4.4', 'Stage_12')
  const oldStages = endgameSections('MoC', '1.0')
  const effects = endgameEffects('MoC', '1.0')

  return [
    t.eq('historical MoC floor exposes two separate rooms', oldFloor?.battles.length, 2),
    t.eq('MoC 4.4 Stage 12 exposes three separate rooms', currentFloor?.battles.length, 3),
    t.eq('three-room floor keeps each Node as a separate battle', currentFloor?.battles.map(room => room.id), ['Node 1', 'Node 2', 'Node 3']),
    t.ok('archive stage selector excludes Memory Turbulence metadata', !oldStages.some(stage => stage.id === 'Memory_Turbulence')),
    t.ok('historical MoC effect descriptions are available', effects.length > 0 && effects.every(effect => !!effect.description)),
    t.ok('each selected MoC room contains its own wave list', !!currentFloor?.battles.every(room => Array.isArray(room.waves) && room.waves.length === 1)),
  ]
}
