import { t } from '../../suites'
import { SLOT_MAINS, SUBSTAT_TIERS, validMain, RELIC_SETS, PLANAR_SETS, LIGHT_CONES } from '../../../src/core/gear'
import type { RelicPiece } from '../../../src/core/entities/Unit'

export default () => {
  const cases: ReturnType<typeof t.ok>[] = []

  // 1) SLOT_MAINS keys are the 6 legal slots
  const slotKeys = Object.keys(SLOT_MAINS) as RelicPiece['slot'][]
  cases.push(t.eq('SLOT_MAINS has 6 slots', slotKeys.length, 6))
  for (const sk of slotKeys) cases.push(t.truthy(`slot ${sk} defined`, Array.isArray(SLOT_MAINS[sk])))

  // 2) fixed mains
  cases.push(t.eq('head mains', SLOT_MAINS.head.slice().sort().join(','), 'hpFlat'))
  cases.push(t.eq('hands mains', SLOT_MAINS.hands.slice().sort().join(','), 'atkFlat'))

  // 3) every main key is a known flat stat or dmg:<elem>
  const dmgRe = /^dmg:(Physical|Fire|Ice|Wind|Lightning|Quantum|Imaginary)$/
  const flatSet = new Set(['hpFlat', 'atkFlat', 'spd', 'hpPct', 'atkPct', 'defPct', 'ehr', 'outHeal', 'critRate', 'critDmg', 'be', 'err'])
  let badMain = ''
  for (const sk of slotKeys)
    for (const mk of SLOT_MAINS[sk])
      if (!flatSet.has(mk) && !dmgRe.test(mk)) badMain = `${sk}:${mk}`
  cases.push(t.truthy('all mains valid', badMain === '', badMain))

  // 4) SUBSTAT_TIERS structure: 12 pool keys, 3 ascending tiers each
  const subKeys = Object.keys(SUBSTAT_TIERS)
  cases.push(t.eq('SUBSTAT_TIERS has 12 keys', subKeys.length, 12))
  for (const s of ['spd', 'hpFlat', 'atkFlat', 'defFlat', 'hpPct', 'atkPct', 'defPct', 'be', 'ehr', 'effRes', 'critRate', 'critDmg'])
    cases.push(t.truthy(`SUBSTAT_TIERS has ${s}`, s in SUBSTAT_TIERS))
  for (const k of subKeys) {
    const v = SUBSTAT_TIERS[k]!
    cases.push(t.eq(`${k} tiers length`, v.length, 3))
    cases.push(t.truthy(`${k} ascending tiers`, v[0] <= v[1] && v[1] <= v[2]))
  }

  // 5) validMain accepts legal mains and rejects illegal ones
  cases.push(t.truthy('validMain head hpFlat', validMain('head', 'hpFlat')))
  cases.push(t.truthy('validMain hands atkFlat', validMain('hands', 'atkFlat')))
  cases.push(t.truthy('validMain head atkPct false', !validMain('head', 'atkPct')))
  cases.push(t.truthy('validMain hands critRate false', !validMain('hands', 'critRate')))
  cases.push(t.truthy('validMain body spd false', !validMain('body', 'spd')))

  // 6) set id uniqueness + no relic/planar overlap
  const checkIds = (arr: { id: string }[], label: string) => {
    const ids = arr.map(x => x.id)
    cases.push(t.eq(`${label} unique ids`, new Set(ids).size, ids.length))
    cases.push(t.truthy(`${label} non-empty`, arr.length > 0))
  }
  checkIds(RELIC_SETS, 'RELIC_SETS')
  checkIds(PLANAR_SETS, 'PLANAR_SETS')
  checkIds(LIGHT_CONES, 'LIGHT_CONES')
  const p = new Set(PLANAR_SETS.map(x => x.id))
  let inter = 0
  for (const id of RELIC_SETS) if (p.has(id.id)) inter++
  cases.push(t.eq('relic/planar id overlap', inter, 0))

  return cases
}
