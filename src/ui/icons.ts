/**
 * §84/Phase-G-adjacent — element-tinted initial chip as the honest stand-in for character art.
 *
 * Verified gap (19-10-2026): no image files exist in the repo or `hsr-data/`, no image URLs exist
 * in `characters.json` (numeric `avatar_id` only), `lightcones.json` (no icon fields), or
 * `relicsets.json` (in-game `SpriteOutput/...` path strings with no resolvable base) — see
 * `docs/audit/PHASE_G.md`. So this module renders NO `<img>` and invents NO URLs: a badge built
 * from data the repo actually has (`KitDef.elem` + `name`). If local art ever lands under
 * `public/`, swap the `<img>` in here — callers keep the same contract.
 */
import { el } from './dom'
import { KITS } from '../core/kits'

const ELEM_COLOR: Record<string, string> = {
  Physical: '#9fa9b3',
  Fire: '#ff7a5c',
  Ice: '#7ec8ff',
  Lightning: '#c9a7ff',
  Wind: '#7fe3c2',
  Quantum: '#7f7fff',
  Imaginary: '#f5d76e',
}

function paint(b: HTMLElement, kitId: string): void {
  const kit = KITS.find(k => k.id === kitId)
  b.dataset.elem = kit?.elem ?? ''
  b.style.setProperty('--elem', ELEM_COLOR[kit?.elem ?? ''] ?? '#55606f')
  b.textContent = kit ? kit.name.trim().charAt(0).toUpperCase() || '?' : '?'
  b.title = kit ? `${kit.name} (${kit.elem}) — локальных иконок персонажей в репозитории нет, показан бейдж по элементу` : `неизвестный kitId: ${kitId}`
}

/** first-letter chip tinted by the kit's element; title states name + element */
export function charBadge(kitId: string): HTMLElement {
  const b = el('span', 'charBadge')
  paint(b, kitId)
  return b
}

/** point the badge at another kit (character select changed) — same node, no re-mount */
export function updateCharBadge(b: HTMLElement, kitId: string): void { paint(b, kitId) }
