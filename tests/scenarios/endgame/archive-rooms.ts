import { endgameEffects, endgameSections, endgameStage } from '../../../src/core/endgame'
import { t } from '../../suites'

export default () => {
  const oldFloor = endgameStage('MoC', '1.0', 'Stage_1')
  const oldLayout44 = endgameStage('MoC', '4.4', 'Stage_12__layout_1')
  const currentFloor44 = endgameStage('MoC', '4.4', 'Stage_12__layout_2')
  const stage12Variants = endgameSections('MoC', '4.4').filter(stage => stage.id.startsWith('Stage_12'))
  const oldStages = endgameSections('MoC', '1.0')
  const effects = endgameEffects('MoC', '1.0')

  return [
    t.eq('historical MoC floor has two named rooms', oldFloor?.rooms.map(room => room.id), ['Node 1', 'Node 2']),
    t.eq('the older 4.4 Stage 12 layout has two rooms', oldLayout44?.rooms.map(room => room.id), ['Node 1', 'Node 2']),
    t.eq('the newer 4.4 Stage 12 layout has three rooms', currentFloor44?.rooms.map(room => room.id), ['Node 1', 'Node 2', 'Node 3']),
    t.eq('archive exposes both Stage 12 layouts separately', stage12Variants.map(stage => stage.id), ['Stage_12__layout_2', 'Stage_12__layout_1']),
    t.eq('three-room MoC keeps one stage run with three sequential waves', currentFloor44?.battles[0]?.waves.length, 3),
    t.eq('two-room historical MoC uses two sequential waves', oldFloor?.battles[0]?.waves.length, 2),
    t.eq('MoC stage has one run with a shared cycle budget', currentFloor44?.battles.length, 1),
    t.ok('archive stage selector excludes Memory Turbulence metadata', !oldStages.some(stage => stage.id === 'Memory_Turbulence')),
    t.ok('historical MoC effect descriptions are available', effects.length > 0 && effects.every(effect => !!effect.description)),
    t.ok('each selected room carries resolved enemy profiles', !!currentFloor44?.rooms.every(room => room.enemies.length > 0)),
  ]
}
