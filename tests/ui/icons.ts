import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'
import { charBadge, updateCharBadge, gearBadge, updateGearBadge, gearIconUrl, pieceBadge, updatePieceBadge, relicPieceIconUrl } from '../../src/ui/icons'
import { KITS } from '../../src/core/kits'
import { CHARACTERS_ICONS, LIGHTCONES_ICONS, RELICSETS_ICONS, RELICPIECES_ICONS } from '../../src/ui/iconManifest'

/**
 * PLAYER_FLOW_AND_ASSETS — local game-art icons: the badge resolves a real `<img>` through the
 * generated manifest (stable id -> name -> committed path), falls back to a chip for unknown ids,
 * and never invents a URL. Selection/keyboard/submit must not block on a missing asset.
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

  const b = charBadge('pela')
  const img = b.querySelector('img')
  const expectedPela = CHARACTERS_ICONS[pela.name]
  const imgSrc = img?.getAttribute('src') ?? ''
  const hasRealIcon = !!expectedPela && imgSrc === expectedPela && imgSrc.startsWith('/icons/characters/')
  const altOk = img?.getAttribute('alt') === pela.name
  const lazyOk = img?.getAttribute('loading') === 'lazy'

  updateCharBadge(b, 'hook')
  const hookImg = b.querySelector('img')
  const switched = hookImg?.getAttribute('src') === CHARACTERS_ICONS[hook.name] && b.title?.includes(hook.name) === true

  let threw = false
  let unk: HTMLElement | undefined
  try { unk = charBadge('no_such_kit') } catch { threw = true }
  const unknownFallback = !threw && unk !== undefined
    && unk.querySelector('img') === null
    && (unk.textContent ?? '').includes('?')

  // known id that resolves to a path + a grep that every emitted path is local
  const coneOk = gearIconUrl('cone', 'in_the_night') === LIGHTCONES_ICONS['In the Night']
  const relicOk = gearIconUrl('relic', 'passerby') === RELICSETS_ICONS['Passerby of Wandering Cloud']
  const gearBadgeImg = gearBadge('cone', 'in_the_night').querySelector('img')?.getAttribute('src') ?? ''
  const gearHasIcon = gearBadgeImg === LIGHTCONES_ICONS['In the Night']

  const gb = gearBadge('relic', 'passerby')
  updateGearBadge(gb, 'relic', '')
  const emptyGearFallback = gb.querySelector('img') === null && (gb.textContent ?? '').includes('—')

  // 5-star cone should resolve and carry the exact committed path (no invented URL)
  const noInvented = [imgSrc, gearBadgeImg].every(s => s === '' || s.startsWith('/icons/'))

  // relic/planar piece art: setId + slot resolves to a committed piece name -> path
  const slotUrl = relicPieceIconUrl('passerby', 'head')
  const slotOk = slotUrl !== undefined && slotUrl.startsWith('/icons/relicpieces/')
    && slotUrl === `${RELICPIECES_ICONS['passerby']?.['0']}`
  const planarUrl = relicPieceIconUrl('passerby', 'sphere')
  const planarUndefined = planarUrl === undefined
  const unknownSet = relicPieceIconUrl('no_such_set', 'body') === undefined
  const emptySet = relicPieceIconUrl('', 'body') === undefined

  const pb = pieceBadge('passerby', 'head')
  const pieceImg = pb.querySelector('img')?.getAttribute('src') ?? ''
  const pieceHasIcon = pieceImg === slotUrl && pieceImg.startsWith('/icons/relicpieces/')
  updatePieceBadge(pb, '', 'head')
  const pieceEmptyFallback = pb.querySelector('img') === null && (pb.textContent ?? '').includes('—')
  const pieceNoInvented = pieceImg === '' || pieceImg.startsWith('/icons/relicpieces/')

  return [
    raw('portrait badge resolves a real <img> from the manifest', hasRealIcon, `${pela.name} -> ${imgSrc}`),
    raw('img carries alt text and lazy loading', altOk && lazyOk, `${img?.getAttribute('alt')}/${img?.getAttribute('loading')}`),
    raw('character switch repaints the same badge to the new portrait', switched, String(hookImg?.getAttribute('src'))),
    raw('unknown kit id falls back to a chip, no <img>, no throw', unknownFallback, String(threw)),
    raw('cone + relic ids resolve through the gear tables to manifest paths', coneOk && relicOk, `${coneOk}/${relicOk}`),
    raw('gear badge renders the resolved icon', gearHasIcon, gearBadgeImg),
    raw('empty gear id renders the neutral dash chip, no <img>', emptyGearFallback, gb.textContent ?? ''),
    raw('no invented / hotlinked URLs — every src is a local /icons path', noInvented, [imgSrc, gearBadgeImg].join(' ')),
    raw('piece art resolves for a set+slot, planar slot unknown on a cavern set', slotOk && planarUndefined, `${slotUrl}/${planarUrl}`),
    raw('unknown or empty set id yields no piece url, no throw', unknownSet && emptySet, `${unknownSet}/${emptySet}`),
    raw('piece badge renders the resolved icon; empty set falls back to a chip', pieceHasIcon && pieceEmptyFallback, pieceImg),
    raw('piece art never invents a URL — every src is a local /icons/relicpieces path', pieceNoInvented, pieceImg),
  ]
}
