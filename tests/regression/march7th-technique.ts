import { prepareBattle } from '../../src/core/battle'
import { case_, type Case } from '../suites'

/** §11 pre-fight Technique completeness — March 7th • The Hunt "Feast in One Go" (#122407).
 *  Canon: at the start of the next battle she gains 1 Charge per OTHER teammate that used a
 *  Technique (max #1=3) and regenerates #2=30 Energy. The Charge half gates her Ascended
 *  rotation, so it must reach `rt.charge`, not just the Energy.
 *  Invariants:
 *   1. No teammate Technique → no starting Charge, but her own Technique still gives 30 Energy.
 *   2. Each teammate whose kitId is in the active Technique set adds exactly 1 Charge.
 *   3. 3 Charge (the team-size cap) is below the Ascended threshold (Talent need = 7). */

const stats = { hp: 8000, atk: 3000, def: 1000, spd: 120 } as const

const foe = () => ({
  name: 'Foe', count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 180,
  weaknesses: ['Imaginary'] as never, atk: 60,
})

/** debug:3 records ENERGY_GAIN (MIN_DEBUG 3). */
const battle = (mates: string[], techniques: string[]) => prepareBattle({
  team: [{ kitId: 'march7th_the_hunt', ...stats }, ...mates.map(k => ({ kitId: k, ...stats }))],
  enemy: foe(), techniques, cycles: 1, seed: 7, log: { debug: 3 },
})

type S = ReturnType<typeof prepareBattle>

export default (): Case[] => {
  const cases: Case[] = []
  const m7 = (s: S) => s.roster.find(u => u.kitId === 'march7th_the_hunt')!
  const energy30 = (s: S, name: string) =>
    s.logger.events.filter(e => e.type === 'ENERGY_GAIN' && e.target === name && ((e.payload as { n?: number })?.n ?? 0) >= 30).length

  // ---- 1. only her own Technique: no Charge, Energy still granted ----
  {
    const s = battle(['danheng'], ['march7th_the_hunt'])
    s.initBattle()
    const m = m7(s)
    cases.push(case_('no teammate Technique → no starting Charge', Number(s.rt(m).charge ?? 0) === 0, `charge=${s.rt(m).charge}`))
    cases.push(case_('own Technique still grants 30 Energy', energy30(s, m.name) >= 1))
  }

  // ---- 2. one teammate Technique → exactly 1 Charge ----
  {
    const s = battle(['welt'], ['march7th_the_hunt', 'welt'])
    s.initBattle()
    const m = m7(s)
    cases.push(case_('one teammate Technique → 1 Charge', Number(s.rt(m).charge) === 1, `charge=${s.rt(m).charge}`))
    cases.push(case_('30 Energy still granted alongside the Charge', energy30(s, m.name) >= 1))
  }

  // ---- 3. three teammate Techniques → 3 Charge, below Ascended threshold ----
  {
    const s = battle(['welt', 'jade', 'sampo'], ['march7th_the_hunt', 'welt', 'jade', 'sampo'])
    s.initBattle()
    const m = m7(s)
    cases.push(case_('three teammate Techniques → 3 Charge', Number(s.rt(m).charge) === 3, `charge=${s.rt(m).charge}`))
    cases.push(case_('3 Charge does not reach the Ascended threshold (7)', s.rt(m).ascended !== true))
  }

  return cases
}
