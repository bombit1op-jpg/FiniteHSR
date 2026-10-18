import { runBattle, type EnemySpec } from './battle'
import type { Elem } from './entities/Unit'

let pass = 0, fail = 0
function chk(k: string, ok: boolean, extra = '') {
  if (ok) { pass++; console.log(`ok  ${k} ${extra}`) }
  else { fail++; console.log(`FAIL  ${k} ${extra}`) }
}
const foe = (hp: number, weak: Elem[], count = 1, tough = 120, spd = 120, atk = 600, name = 'Boss'): EnemySpec =>
  ({ name, count, hp, spd, level: 85, toughness: tough, weaknesses: weak, atk })

const LOW = { critRate: 0, atk: 5000, spd: 300, hp: 30000 } as const

// onNonCrit fires for a low-CRIT wearer of sleep_like_dead -> sld_cr buff logged
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: LOW as never, gear: { coneId: 'sleep_like_dead', si: 1 } }],
    enemy: foe(999999, ['Quantum'], 3, 700, 300, 700, 'Boss'),
    cycles: 8, seed: 1,
  })
  chk('onNonCrit -> sld_cr buff logged', sim.buffLog.some(x => x.id === 'sld_cr'))
}

// enemy turns + enemy DoT ticks occur (onEnemyTurnStart infra has a real firing point)
{
  const sim = runBattle({
    team: [{ kitId: 'kafka', stats: { ...LOW, critRate: 0.5 } as never }],
    enemy: foe(99999999, ['Lightning'], 2, 700, 60, 600, 'Boss'),
    cycles: 12, seed: 2,
  })
  const enemyTurns = sim.logLines.filter(l => l.includes('[ENEMY]')).length
  chk('enemy turns occur (enemyTurn runs)', enemyTurns > 0, `(${enemyTurns})`)
  const shockTicks = sim.logLines.filter(l => l.includes('[DoT Shock]')).length
  chk('enemy DoT ticks fire (DoT on enemy turn)', shockTicks > 0, `(${shockTicks})`)
}

console.log(`===== HOOK DEBUG: FAILURES: ${fail} =====`)
