import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { coneOptions, relicOptions, planarOptions, signatureCone } from '../../src/core/gearOrder'
import { GEAR_PREFS } from '../../src/core/gearPrefs'
import { LIGHT_CONES } from '../../src/core/gear'
import { KIT_PATH } from '../../src/core/kits'
import { Dropdown } from '../../src/ui/dropdown'

/**
 * Gear select ordering + the signature-cone highlight contract:
 *  - cones: signature -> same-path 5* -> same-path 4* -> other 5* -> other 4* -> rest
 *  - relics/planar: recommended (Fribbels priority order) first, then the rest alphabetically
 *  - Dropdown exposes value/onchange and marks the signature row (ddSig)
 */
export default () => {
  // signature cone comes first; own-path (Hunt) cones precede all other-path cones
  const pathOf = new Map(LIGHT_CONES.map(c => [c.id, c.path]))
  const sig = signatureCone('seele')!
  const seelePath = KIT_PATH['seele'] ?? ''
  const coneList = coneOptions('seele', seelePath).slice(1)
  const cones = coneList.map(([id]) => id)
  const sigFirst = cones[0] === sig
  const paths = cones.map(id => pathOf.get(id) ?? '')
  const firstOtherIdx = paths.findIndex(p => p !== seelePath)
  const ownPathBlockFirst = firstOtherIdx > 0 &&
    paths.slice(0, firstOtherIdx).every(p => p === seelePath) &&
    paths.slice(firstOtherIdx).every(p => p !== seelePath)

  // recommended relics listed first, in the exact Fribbels order
  const rec = GEAR_PREFS['acheron']?.relics ?? []
  const relicOpts = relicOptions('acheron').slice(1)
  const relics = relicOpts.map(([id]) => id)
  const recFirst = rec.length > 0 && rec.every((id, i) => relics[i] === id)

  // remaining (non-recommended) relic sets are alphabetical (by name) after the recommended block
  const tailNames = relicOpts.slice(rec.length).map(([, name]) => name)
  const tailSorted = tailNames.every((n, i) => i === 0 || tailNames[i - 1].localeCompare(n, 'en') <= 0)

  // recommended ornaments first, same shape
  const orec = GEAR_PREFS['acheron']?.ornaments ?? []
  const orns = planarOptions('acheron').slice(1).map(([id]) => id)
  const orecFirst = orec.length > 0 && orec.every((id, i) => orns[i] === id)

  // no kit: blank + everything alphabetical, no recommendation, no throw
  let threw = false
  let plainNames: string[] = []
  try { plainNames = relicOptions('no_such_kit').slice(1).map(([, name]) => name) } catch { threw = true }
  const plainSorted = plainNames.length === 0 || plainNames.every((n, i) => i === 0 || plainNames[i - 1].localeCompare(n, 'en') <= 0)

  // Dropdown contract: value + onchange + signature row carries ddSig
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event

  const dd = new Dropdown()
  dd.setEntries(coneOptions('seele', KIT_PATH['seele'] ?? ''), { sig })
  const sigOpt = dd.root.querySelector('.ddOpt.ddSig') as HTMLElement | null
  const sigRowMarked = sigOpt?.dataset.value === sig
  dd.value = sig
  const btnSig = dd.root.querySelector('.ddBtn')?.classList.contains('ddSig') === true
  let fired = 0
  dd.onchange = () => { fired++ }
  dd.value = ''
  const valueRoundtrip = dd.value === ''

  return [
    raw('signature cone is listed first', sigFirst, `${sig} vs ${cones[0]}`),
    raw('own-path cones form one block ahead of other-path cones', ownPathBlockFirst, `firstOther@${firstOtherIdx}`),
    raw('recommended relics listed first in Fribbels order', recFirst, `${rec.join(',')} vs ${relics.slice(0, rec.length).join(',')}`),
    raw('remaining relic sets are alphabetical after the recommended block', tailSorted, tailNames.slice(0, 4).join(',')),
    raw('recommended ornaments listed first', orecFirst, `${orec.join(',')} vs ${orns.slice(0, orec.length).join(',')}`),
    raw('a kit without a preference list degrades to plain alphabetical', !threw && plainSorted, `${plainNames.slice(0, 3).join(',')}`),
    raw('dropdown marks the signature row', sigRowMarked, String(sigOpt?.dataset.value)),
    raw('selected signature value paints the button highlight', btnSig, String(btnSig)),
    raw('dropdown value round-trips and onchange is assignable', valueRoundtrip && fired === 0, `fired=${fired}`),
    raw('cone options keep the blank placeholder first', coneOptions('seele', seelePath)[0][0] === '', coneOptions('seele', seelePath)[0][1]),
  ]
}
