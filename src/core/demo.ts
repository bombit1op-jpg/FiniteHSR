// Demo: DoT/break team with gear vs MoC-style boss — print battle log tail.
import { ENEMY_PRESETS, runBattle } from './battle'

const sim = runBattle({
  team: [
    {
      kitId: 'firefly', stats: { atk: 3200, spd: 150, be: 3.6 },
      gear: { coneId: 'whereabouts', si: 1, relicSets: ['iron_cavalry', 'iron_cavalry'], planarId: 'talia' },
    },
    { kitId: 'seele', stats: { atk: 2800, spd: 140, critRate: 0.7, critDmg: 2.0 }, gear: { coneId: 'in_the_night', si: 1 } },
    { kitId: 'guinaifen', stats: { atk: 2800, spd: 130 }, gear: { coneId: 'resolution', si: 5 } },
    { kitId: 'sparkle', stats: { spd: 125, critDmg: 2.8 }, gear: { coneId: 'earthly_escapade', si: 1 } },
  ],
  enemy: { ...ENEMY_PRESETS.moc12_boss, count: 1, hp: 900_000, effectRes: 0.1 },
  cycles: 6,
  seed: 11,
  manualMods: [{ stat: 'vulnAll', value: 0.15, side: 'enemy' }],
})

console.log(sim.logLines.slice(0, 45).join('\n'))
console.log('...')
console.log(`end=${sim.endReason} av=${sim.avElapsed.toFixed(0)} spCap=${sim.maxSp}`)
for (const [n, a] of sim.accounts) console.log(`${n}: ${a.total} | ${Object.entries(a.bySkill).map(([k, v]) => k + '=' + v).join(', ')}`)
