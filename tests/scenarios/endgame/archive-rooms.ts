import { endgameEffects, endgameSections, endgameStage } from '../../../src/core/endgame'
import { t } from '../../suites'

export default () => {
  const oldFloor = endgameStage('MoC', '1.0', 'Stage_1')
  const currentFloor = endgameStage('MoC', '4.4', 'Stage_12')
  const oldStages = endgameSections('MoC', '1.0')
  const effects = endgameEffects('MoC', '1.0')

  return [
    t.eq('historical MoC floor has two named rooms', oldFloor?.rooms.map(room => room.id), ['Node 1', 'Node 2']),
    t.eq('MoC 4.4 Stage 12 has three named rooms', currentFloor?.rooms.map(room => room.id), ['Node 1', 'Node 2', 'Node 3']),
    t.eq('MoC rooms are simulated as sequential stage waves', currentFloor?.battles[0]?.waves.length, 3),
    t.eq('the two-room historical floor uses two waves', oldFloor?.battles[0]?.waves.length, 2),
    t.eq('MoC stage remains one run with a shared cycle budget', currentFloor?.battles.length, 1),
    t.ok('archive stage selector excludes Memory Turbulence metadata', !oldStages.some(stage => stage.id === 'Memory_Turbulence')),
    t.ok('historical MoC effect descriptions are available', effects.length > 0 && effects.every(effect => !!effect.description)),
    t.ok('each room carries resolved enemy profiles', !!currentFloor?.rooms.every(room => room.enemies.length > 0)),
  ]
}
