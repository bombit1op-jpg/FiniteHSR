/**
 * §10/§19 AvailabilityState — per-unit mode + active ability variants (Firefly Complete Combustion).
 *
 * Pins the derive contract: an absent key keeps the 'normal' variant, an explicit variant wins,
 * `null` suppresses the ability, and kits without an `availability` hook always resolve to the
 * all-normal default. The Firefly section wires the hook to its real `cc_state` buff.
 */

import { DEFAULT_AVAILABILITY, abilityAvailable, abilityVariant } from '../../src/core/combat/Availability'
import { run, raw } from '../_helpers/battle'
import { t, type Case } from '../suites'

export default (): Case[] => {
  const cases: Case[] = []

  // ---- pure contract ----
  cases.push(t.eq('default mode is normal', DEFAULT_AVAILABILITY.mode, 'normal'))
  cases.push(t.eq('absent key defaults to the normal variant', abilityVariant(DEFAULT_AVAILABILITY, 'ult'), 'normal'))
  cases.push(t.eq('default ability is available', abilityAvailable(DEFAULT_AVAILABILITY, 'skill'), true))
  cases.push(t.eq('explicit variant wins', abilityVariant({ mode: 'm', variant: { basic: 'enhanced' } }, 'basic'), 'enhanced'))
  cases.push(t.eq('untouched kind keeps normal', abilityVariant({ mode: 'm', variant: { basic: 'enhanced' } }, 'skill'), 'normal'))
  cases.push(t.eq('null variant suppresses the ability', abilityAvailable({ mode: 'm', variant: { ult: null } }, 'ult'), false))
  cases.push(t.eq('suppressed ability reports null variant', abilityVariant({ mode: 'm', variant: { ult: null } }, 'ult'), null))

  // ---- Firefly Complete Combustion wiring ----
  const c = run({ team: [{ kitId: 'firefly', stats: { hp: 4000, atk: 2500, def: 1000, spd: 134, critRate: 0.8, critDmg: 1.4 }, energyStartFrac: 1, skillPriority: 2 }] })
  const ff = c.sim.roster.find(u => u.kitId === 'firefly')
  cases.push(raw('firefly present in roster', !!ff))
  if (ff) {
    if (c.sim.hasBuff(ff, 'cc_state')) c.sim.removeBuff(ff, 'cc_state')
    cases.push(t.eq('out of CC: mode normal', c.sim.availableAbilities(ff).mode, 'normal'))
    cases.push(t.eq('out of CC: basic is normal', abilityVariant(c.sim.availableAbilities(ff), 'basic'), 'normal'))
    cases.push(t.eq('out of CC: ult available', abilityAvailable(c.sim.availableAbilities(ff), 'ult'), true))

    c.sim.addBuff(ff, { id: 'cc_state', name: 'Complete Combustion', mods: [] })
    const av = c.sim.availableAbilities(ff)
    cases.push(t.eq('CC: mode is complete_combustion', av.mode, 'complete_combustion'))
    cases.push(t.eq('CC: basic -> enhanced', abilityVariant(av, 'basic'), 'enhanced'))
    cases.push(t.eq('CC: skill -> enhanced', abilityVariant(av, 'skill'), 'enhanced'))
    cases.push(t.eq('CC: ult suppressed', abilityAvailable(av, 'ult'), false))
  }

  // ---- kits without a hook fall back to the all-normal default ----
  const e = c.sim.roster.find(u => u.kind === 'enemy')
  if (e) cases.push(t.eq('kitless unit is always normal', c.sim.availableAbilities(e).mode, 'normal'))

  return cases
}
