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
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'

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

// ---------------------------------------------------------------- gear badges

export type GearKind = 'cone' | 'relic' | 'planar'

const RARITY_COLOR: Record<number, string> = { 5: '#f5c651', 4: '#a78bfa', 3: '#5ea9d6' }
const GEAR_TINTS = ['#7fb3ff', '#7fe3c2', '#f5d76e', '#ff9d7f', '#c9a7ff', '#8fd694']
const GEAR_LABELS: Record<GearKind, string> = { cone: 'Light Cone', relic: 'реликвия', planar: 'планарный сет' }

/** stable tint for a set id (no asset → deterministic hash, same id keeps same colour) */
function tintOf(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return GEAR_TINTS[(h >>> 0) % GEAR_TINTS.length]
}

function gearName(kind: GearKind, id: string): string | undefined {
  if (kind === 'cone') return LIGHT_CONES.find(c => c.id === id)?.name
  const pool = kind === 'relic' ? RELIC_SETS : PLANAR_SETS
  return pool.find(s => s.id === id)?.name
}

function paintGear(b: HTMLElement, kind: GearKind, id: string): void {
  const label = GEAR_LABELS[kind]
  const gname = gearName(kind, id)
  b.dataset.elem = ''
  b.title = !id
    ? `${label}: не выбрано`
    : gname
      ? `${gname} (${label}) — локальных иконок экипировки в репозитории нет, показан цветовой бейдж`
      : `неизвестный id ${label}: ${id}`
  b.style.setProperty('--elem', !id ? '#55606f' : (kind === 'cone' && RARITY_COLOR[LIGHT_CONES.find(c => c.id === id)?.rarity ?? 0]) || tintOf(id))
  b.textContent = !id ? '—' : gname?.trim().charAt(0).toUpperCase() || '?'
}

/** first-letter chip for a Light Cone / relic set / planar set; empty id renders a neutral dash */
export function gearBadge(kind: GearKind, id: string): HTMLElement {
  const b = el('span', 'charBadge gearBadge')
  paintGear(b, kind, id)
  return b
}

/** point the badge at another gear id (select changed) — same node, no re-mount */
export function updateGearBadge(b: HTMLElement, kind: GearKind, id: string): void { paintGear(b, kind, id) }
