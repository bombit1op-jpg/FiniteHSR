/**
 * §84 / PLAYER_FLOW_AND_ASSETS — local game-art images with a deterministic fallback.
 *
 * The committed PNGs under `public/icons/` are served at `/icons/...`; `iconManifest.ts` (generated
 * by `src/core/gen-icon-manifest.ts`) maps a stable display key to that path. This module is the
 * single reusable component: team cards, selectors, Light Cone fields and relic-set selectors all
 * resolve through here. An unknown id renders the deterministic letter/element chip instead of a
 * broken image — selection, keyboard nav and form submit never block on a missing asset.
 *
 * Identity is the stable engine id (`kitId`, cone/set id); the id -> display-name lookup goes
 * through the existing kit/gear tables, and the name -> path lookup through the manifest.
 */
import { el } from './dom'
import { KITS } from '../core/kits'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import {
  CHARACTERS_ICONS, LIGHTCONES_ICONS, RELICSETS_ICONS, PLANARSETS_ICONS,
  ELEMENTS_ICONS, PATHS_ICONS, STATS_ICONS, ENEMIES_ICONS,
} from './iconManifest'

const ELEM_COLOR: Record<string, string> = {
  Physical: '#9fa9b3',
  Fire: '#ff7a5c',
  Ice: '#7ec8ff',
  Lightning: '#c9a7ff',
  Wind: '#7fe3c2',
  Quantum: '#7f7fff',
  Imaginary: '#f5d76e',
}

// ---------------------------------------------------------------- id -> path resolution

function kitName(kitId: string): string | undefined { return KITS.find(k => k.id === kitId)?.name }
function coneName(id: string): string | undefined { return LIGHT_CONES.find(c => c.id === id)?.name }
function setName(id: string): string | undefined {
  return (RELIC_SETS.find(s => s.id === id) ?? PLANAR_SETS.find(s => s.id === id))?.name
}

/** data key for a Path icon: engine paths say `Hunt`, the manifest file says `The Hunt` */
const PATH_KEY: Record<string, string> = { Hunt: 'The Hunt', 'The Hunt': 'The Hunt' }

/** character portrait path for a kit id (undefined when unknown or no committed art) */
export function charIconUrl(kitId: string): string | undefined {
  const name = kitName(kitId)
  return name ? CHARACTERS_ICONS[name] : undefined
}

/** Light Cone / relic set / planar set icon path (undefined when unknown / none selected) */
export function gearIconUrl(kind: GearKind, id: string): string | undefined {
  if (!id) return undefined
  const name = kind === 'cone' ? coneName(id) : setName(id)
  if (!name) return undefined
  const table = kind === 'cone' ? LIGHTCONES_ICONS : kind === 'relic' ? RELICSETS_ICONS : PLANARSETS_ICONS
  return table[name]
}

export function elemIconUrl(elem: string): string | undefined { return ELEMENTS_ICONS[elem] }
export function pathIconUrl(path: string): string | undefined { return PATHS_ICONS[PATH_KEY[path] ?? path] }
export function statIconUrl(stat: string): string | undefined { return STATS_ICONS[stat] }
export function enemyIconUrl(name: string): string | undefined { return ENEMIES_ICONS[name] }

// ---------------------------------------------------------------- reusable image node

export type IconFit = 'contain' | 'cover'

/**
 * Build a `<span class="gameIcon">` holding an `<img>` (when a path resolves) and a fallback chip
 * shown only if the image is missing or fails to load. `fallbackText`/`tint` paint the chip.
 * The node is the reusable unit shared by every caller; `alt` is always set.
 */
function iconNode(url: string | undefined, alt: string, opts: {
  cls?: string
  size?: number
  fit?: IconFit
  fallbackText: string
  tint?: string
  title: string
}): HTMLElement {
  const wrap = el('span', 'gameIcon' + (opts.cls ? ' ' + opts.cls : ''))
  wrap.title = opts.title
  const chip = el('span', 'iconChip')
  chip.textContent = opts.fallbackText
  if (opts.tint) chip.style.setProperty('--elem', opts.tint)
  chip.style.display = 'none'
  if (url) {
    const img = el('img')
    img.src = url
    img.alt = alt
    if (opts.size) { img.width = opts.size; img.height = opts.size }
    img.loading = 'lazy'
    img.decoding = 'async'
    img.style.objectFit = opts.fit ?? 'contain'
    img.onerror = () => { img.style.display = 'none'; chip.style.display = '' }
    wrap.append(img)
  } else {
    chip.style.display = ''
  }
  wrap.append(chip)
  return wrap
}

// ---------------------------------------------------------------- character badge (contract preserved)

function paintChar(node: HTMLElement, kitId: string): void {
  const kit = KITS.find(k => k.id === kitId)
  const tint = ELEM_COLOR[kit?.elem ?? ''] ?? '#55606f'
  const title = kit ? `${kit.name} (${kit.elem})` : `неизвестный kitId: ${kitId}`
  node.dataset.elem = kit?.elem ?? ''
  node.title = title
  node.innerHTML = ''
  const url = kit ? charIconUrl(kitId) : undefined
  node.append(iconNode(url, kit ? kit.name : kitId, {
    cls: 'charIcon',
    size: 64,
    fit: 'cover',
    fallbackText: kit ? (kit.name.trim().charAt(0).toUpperCase() || '?') : '?',
    tint,
    title,
  }))
}

/** character portrait with a letter chip (coloured by the kit's element) as fallback */
export function charBadge(kitId: string): HTMLElement {
  const b = el('span', 'charBadge')
  paintChar(b, kitId)
  return b
}

/** point the badge at another kit (character select changed) — same node, no re-mount */
export function updateCharBadge(b: HTMLElement, kitId: string): void { paintChar(b, kitId) }

// ---------------------------------------------------------------- gear badge (contract preserved)

export type GearKind = 'cone' | 'relic' | 'planar'

const RARITY_COLOR: Record<number, string> = { 5: '#f5c651', 4: '#a78bfa', 3: '#5ea9d6' }
const GEAR_TINTS = ['#7fb3ff', '#7fe3c2', '#f5d76e', '#ff9d7f', '#c9a7ff', '#8fd694']
const GEAR_LABELS: Record<GearKind, string> = { cone: 'Light Cone', relic: 'реликвия', planar: 'планарный сет' }

/** stable tint for a set id (deterministic hash — same id keeps same colour) */
function tintOf(id: string): string {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return GEAR_TINTS[(h >>> 0) % GEAR_TINTS.length]
}

function paintGear(node: HTMLElement, kind: GearKind, id: string): void {
  const label = GEAR_LABELS[kind]
  const name = !id ? undefined : (kind === 'cone' ? coneName(id) : setName(id))
  const tint = !id ? '#55606f'
    : (kind === 'cone' && RARITY_COLOR[LIGHT_CONES.find(c => c.id === id)?.rarity ?? 0]) || tintOf(id)
  const title = !id ? `${label}: не выбрано` : name ? `${name} (${label})` : `неизвестный id ${label}: ${id}`
  node.dataset.elem = ''
  node.title = title
  node.innerHTML = ''
  node.append(iconNode(gearIconUrl(kind, id), name ?? label, {
    cls: 'gearIcon',
    size: 40,
    fit: 'contain',
    fallbackText: !id ? '—' : (name?.trim().charAt(0).toUpperCase() || '?'),
    tint,
    title,
  }))
}

/** icon for a Light Cone / relic set / planar set; empty id renders a neutral dash chip */
export function gearBadge(kind: GearKind, id: string): HTMLElement {
  const b = el('span', 'charBadge gearBadge')
  paintGear(b, kind, id)
  return b
}

/** point the gear badge at another id (select changed) — same node, no re-mount */
export function updateGearBadge(b: HTMLElement, kind: GearKind, id: string): void { paintGear(b, kind, id) }
