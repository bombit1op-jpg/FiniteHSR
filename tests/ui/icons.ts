import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { charBadge, updateCharBadge } from '../../src/ui/icons'
import { KITS } from '../../src/core/kits'

/**
 * UX-slice 2 — character fallback badges: no image resources exist (verified gap, PHASE_G.md),
 * so the badge must be data-driven (KitDef.elem tint + name initial), must survive a character
 * switch, and must never throw on an unknown id — the UI must not block on a missing asset.
 */
export default () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event

  const pela = KITS.find(k => k.id === 'pela')!
  const hook = KITS.find(k => k.id === 'hook')!
  const ELEM_COLOR: Record<string, string> = {
    Physical: '#9fa9b3', Fire: '#ff7a5c', Ice: '#7ec8ff', Lightning: '#c9a7ff',
    Wind: '#7fe3c2', Quantum: '#7f7fff', Imaginary: '#f5d76e',
  }

  const b = charBadge('pela')
  const initial = b.textContent === pela.name.charAt(0).toUpperCase()
  const tinted = b.dataset.elem === pela.elem && b.style.getPropertyValue('--elem') === ELEM_COLOR[pela.elem]
  const named = b.title.includes(pela.name) && b.title.includes(pela.elem)
  const noImg = b.tagName === 'SPAN' && b.querySelector('img') === null

  updateCharBadge(b, 'hook')
  const switched = b.dataset.elem === hook.elem
    && b.style.getPropertyValue('--elem') === ELEM_COLOR[hook.elem]
    && b.textContent === hook.name.charAt(0).toUpperCase()
    && b.title.includes(hook.name)

  let threw = false
  let unk: HTMLElement | undefined
  try { unk = charBadge('no_such_kit') } catch { threw = true }
  const unknownOk = !threw && unk !== undefined && unk.textContent === '?' && unk.dataset.elem === ''

  return [
    raw('badge shows the kit name initial', initial, b.textContent ?? ''),
    raw('badge tints by KitDef.elem with the documented palette', tinted, `${b.dataset.elem}/${b.style.getPropertyValue('--elem')}`),
    raw('badge tooltip states name, element and the honest icon gap', named, b.title),
    raw('badge is a plain span — no <img>, no invented URL', noImg, b.tagName),
    raw('character switch repaints the same badge node', switched, `${b.dataset.elem}/${b.textContent}`),
    raw('unknown kit id degrades to "?" without throwing', unknownOk, String(threw)),
  ]
}
