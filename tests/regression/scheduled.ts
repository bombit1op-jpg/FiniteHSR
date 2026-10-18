/**
 * §10/§17 Scheduled countdown entity.
 *
 * Pins the factory defaults (inert timer unit: hp 1, toughness 0, no dots) and the end-to-end
 * lifecycle: `scheduleCountdown` builds + registers the timer with the OWNER's name as the
 * SUMMON_CREATED source (proves ownership binding), and the timer despawns when its turn fires.
 */

import { makeCountdown } from '../../src/core/combat/Scheduled'
import { run, raw, name, mob } from '../_helpers/battle'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  // ---- pure factory ----
  const cd = makeCountdown({ id: 'cd', name: 'X', side: 'ally', elem: 'Fire', spd: 70 })
  cases.push(t.eq('kind is timer', cd.kind, 'timer'))
  cases.push(t.eq('hp is 1', cd.hp, 1))
  cases.push(t.eq('maxEnergy is 0', cd.maxEnergy, 0))
  cases.push(t.eq('spd carried into base', cd.base.spd, 70))
  cases.push(t.eq('weaknesses default empty', cd.weaknesses.length, 0))
  cases.push(t.eq('av starts 0', cd.av, 0))
  cases.push(t.eq('toughness starts 0', cd.toughness, 0))

  const cd2 = makeCountdown({ id: 'cd2', name: 'Y', side: 'enemy', elem: 'Ice', spd: 90, weaknesses: ['Physical'], kitId: 'k' })
  cases.push(t.eq('side copied', cd2.side, 'enemy'))
  cases.push(t.eq('kitId copied', cd2.kitId, 'k'))
  cases.push(t.eq('weaknesses copied', cd2.weaknesses[0], 'Physical'))

  // ---- lifecycle: Firefly Complete Combustion owns a CC Countdown (SPD 70) ----
  const c = run({
    team: [{ kitId: 'firefly', stats: { hp: 4000, atk: 2500, def: 1000, spd: 134, critRate: 0.8, critDmg: 1.4 }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: mob({ hp: 5_000_000, atk: 100 }),
  })
  const ff = name(c, 'firefly')
  const created = c.nodes.find(n => n.type === 'SUMMON_CREATED' && n.target === 'CC Countdown')
  cases.push(raw('CC countdown is scheduled', !!created))
  cases.push(t.eq('countdown attributed to its owner', created?.source, ff))
  cases.push(t.eq('countdown kind is timer', created?.payload.kind, 'timer'))
  const gone = c.nodes.find(n => n.type === 'SUMMON_DESPAWNED' && n.target === 'CC Countdown')
  cases.push(raw('CC countdown despawns after firing', !!gone))

  return cases
}
