import { run, raw, all } from '../../_helpers/battle'
import { resolveLevels } from '../../../src/core/battle'

export default () => {
  const e0 = run({ team: [{ kitId: 'xueyi', eidolon: 0 }] })
  const e6 = run({ team: [{ kitId: 'xueyi', eidolon: 6 }] })
  const dmg = (c: typeof e0): number => c.nodes.filter(n => n.type === 'DAMAGE_DEALT')
    .reduce((s, n) => s + (typeof n.payload.amount === 'number' ? n.payload.amount : 0), 0)
  const lv0 = resolveLevels({ kitId: 'xueyi', eidolon: 0 })
  const lv3 = resolveLevels({ kitId: 'xueyi', eidolon: 3 })
  const lv5 = resolveLevels({ kitId: 'xueyi', eidolon: 5 })
  const lv6 = resolveLevels({ kitId: 'xueyi', eidolon: 6 })
  return [
    raw('E3 lifts skill level', lv3.skill > lv0.skill, `${lv3.skill} > ${lv0.skill}`),
    raw('E5 lifts ult level', lv5.ult > lv0.ult, `${lv5.ult} > ${lv0.ult}`),
    raw('E6 changes nothing structural', JSON.stringify(lv6) === JSON.stringify(lv5)),
    raw('eidolon changes damage output', dmg(e6) !== dmg(e0), `${dmg(e6)} vs ${dmg(e0)}`),
    raw('both runs dealt damage', dmg(e0) > 0 && dmg(e6) > 0),
    raw('events present in both runs', all(e0, 'DAMAGE_DEALT').length > 0 && all(e6, 'DAMAGE_DEALT').length > 0),
  ]
}
