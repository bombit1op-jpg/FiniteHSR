/** Auto-role smoke: central role AI + main-DPS targeting for supports.
 *  Run: rtk npx tsx src/core/debug-autorole.ts
 */
import { runBattle, type BattleSetup } from './battle'
import type { Simulator } from './simulator'

let fails = 0
const t = (name: string, cond: boolean, extra = ''): void => {
  if (cond) console.log('ok   ' + name)
  else { fails++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')) }
}

/** sparkle team: Seele = declared main DPS but LOW base ATK; Jing(yuan) = high-ATK decoy.
 *  The support (Sparkle) declares mainDpsId=Seele and must buff Seele, NOT the higher-ATK decoy. */
const sparkleSetup = (mainDpsId: string | undefined): BattleSetup => ({
  team: [
    { kitId: 'seele', name: 'Seele', stats: { atk: 800 } },
    { kitId: 'jingyuan', name: 'Jingyuan', stats: { atk: 1200 } },
    { kitId: 'sparkle', name: 'Sparkle', mainDpsId: mainDpsId === 'seele' ? 'seele' : undefined },
    { kitId: 'gallagher', name: 'Gallagher' },
  ],
  enemy: { name: 'Trottler', count: 1, hp: 80000, atk: 600, spd: 100, level: 85, toughness: 120, weaknesses: ['Quantum', 'Lightning', 'Fire'] },
  cycles: 6,
  seed: 7,
})

function dreamdiverHolder(sim: Simulator): string {
  const rows = sim.buffLog.filter(b => b.id === 'dreamdiver')
  return rows.length ? rows[rows.length - 1].unitName : 'NONE'
}

// 1) mainDpsId declared → sparkle buffs the declared DPS (Seele) over the higher-ATK decoy
const a = runBattle(sparkleSetup('seele'))
t('sparkle targets declared main DPS Seele', dreamdiverHolder(a) === 'Seele', `holder=${dreamdiverHolder(a)}`)
t('sparkle battle completes', a.avElapsed > 0, `av=${a.avElapsed}`)

// 2) no mainDpsId → fallback to highest-effATK (decoy Jingyuan)
const b = runBattle(sparkleSetup(undefined))
t('sparkle fallback targets strongest ally (Jingyuan)', dreamdiverHolder(b) === 'Jingyuan', `holder=${dreamdiverHolder(b)}`)
t('fallback battle completes', b.avElapsed > 0, `av=${b.avElapsed}`)

// 3) sustain role-AI: Gallagher (SP-free skill) heals a wounded teammate, not just self.
// Blade gets a big HP pool + no aggro; strong-ish enemy wears the team down over a few cycles.
const hurt = runBattle({
  team: [
    { kitId: 'blade', name: 'Blade', stats: { hp: 6000, def: 300 } },
    { kitId: 'jingyuan', name: 'Jingyuan', stats: { atk: 1200 } },
    { kitId: 'gallagher', name: 'Gallagher' },
    { kitId: 'tingyun', name: 'Tingyun' },
  ],
  enemy: { name: 'Wear-Down', count: 1, hp: 60000, atk: 1800, spd: 140, level: 95, toughness: 120, weaknesses: ['Fire', 'Lightning'] },
  cycles: 6,
  seed: 9,
})
const healedTeammate = hurt.logLines.some(l => /Gallagher heals (?!Gallagher)/.test(l))
const healedAny = hurt.logLines.some(l => /Gallagher heals/.test(l))
t('sustain heals a wounded teammate (not just self)',
  healedTeammate,
  healedAny ? 'teammates healed:' + hurt.logLines.filter(l => /Gallagher heals/.test(l)).join(' | ') : 'no heal line')
t('sustain battle completes', hurt.avElapsed > 0, `av=${hurt.avElapsed}`)

console.log(`\nautorole smoke: FAILURES: ${fails}`)
process.exitCode = fails ? 1 : 0
