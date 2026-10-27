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
import type { RelicPiece } from '../core/entities/Unit'
import {
  CHARACTERS_ICONS, LIGHTCONES_ICONS, RELICSETS_ICONS, PLANARSETS_ICONS,
  ELEMENTS_ICONS, PATHS_ICONS, STATS_ICONS, ENEMIES_ICONS, RELICPIECES_ICONS,
  CHARACTER_PORTRAITS, ABILITIES_ICONS,
} from './iconManifest'

type RelicSlot = RelicPiece['slot']

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

/** full-character art path for a kit id (376x512, undefined when unknown / no committed art) */
export function charPortraitUrl(kitId: string): string | undefined {
  const name = kitName(kitId)
  return name ? CHARACTER_PORTRAITS[name] : undefined
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
export function enemyIconUrl(name: string): string | undefined { return ENEMIES_ICONS[name] }

/** display-name keys of the stat/mechanic icon set (`public/icons/stats`) */
export type StatIconKey =
  | 'ATK' | 'HP' | 'DEF' | 'SPD' | 'CRIT Rate' | 'CRIT DMG' | 'Break Effect'
  | 'Effect Hit Rate' | 'Effect RES' | 'Energy Regeneration Rate' | 'DMG Boost'
  | 'Toughness' | 'Trace' | 'Eidolon' | 'Skill Point' | 'Energy' | 'Path'
  | 'Outgoing Healing Boost'
  | 'Elation (Stat)'

export function statIconUrl(name: StatIconKey | string): string | undefined { return STATS_ICONS[name] }

/** engine stat key -> display name used by the stat icon manifest (undefined = no committed art) */
const STAT_ICON_KEY: Record<string, StatIconKey> = {
  atk: 'ATK', hp: 'HP', def: 'DEF', spd: 'SPD',
  atkFlat: 'ATK', hpFlat: 'HP', defFlat: 'DEF',
  atkPct: 'ATK', hpPct: 'HP', defPct: 'DEF', spdFlat: 'SPD',
  critRate: 'CRIT Rate', critDmg: 'CRIT DMG', be: 'Break Effect',
  ehr: 'Effect Hit Rate', effRes: 'Effect RES',
  err: 'Energy Regeneration Rate', outHeal: 'Outgoing Healing Boost',
  elemDmgBoost: 'DMG Boost', energyMax: 'Energy',
  elation: 'Elation (Stat)',
}

/** icon art URL for an engine stat key (undefined = no committed art) */
export function statIconUrlForKey(stat: string): string | undefined {
  const key = stat.startsWith('dmg:') ? 'DMG Boost' : STAT_ICON_KEY[stat] ?? stat
  return key === 'SPD' ? '/icons/buffs/SPD%20Boost.png' : statIconUrl(key)
}

/** small stat icon chip (real art or a neutral letter chip); `stat` is an engine stat key or display name */
export function statBadge(stat: string): HTMLElement {
  const key = stat.startsWith('dmg:') ? 'DMG Boost' : STAT_ICON_KEY[stat] ?? stat
  // SPD has no `stats/` art; the game keeps it under `buffs/`
  const url = key === 'SPD' ? '/icons/buffs/SPD%20Boost.png' : statIconUrl(key)
  const node = el('span', 'metaBadge statBadge')
  node.dataset.stat = key
  node.title = `Stat: ${key}`
  node.append(iconNode(url, key, {
    cls: 'statIcon', size: 18, fit: 'contain',
    fallbackText: key.slice(0, 3).toUpperCase(), tint: '#7fb3ff', title: node.title,
  }))
  return node
}

// ---------------------------------------------------------------- ability icons

/** manifest keys are display names; normalize so "Possession: Ethereal Metaflow" finds
 *  "Possession Ethereal Metaflow" (the raw game text differs in punctuation). */
function normIconKey(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '') }

let ABILITY_ICON_INDEX: Map<string, string> | null = null

/** ability art path by display name (undefined when the ability has no committed art) */
export function abilityIconUrl(name: string): string | undefined {
  if (!name) return undefined
  if (!ABILITY_ICON_INDEX) {
    ABILITY_ICON_INDEX = new Map()
    for (const [k, v] of Object.entries(ABILITIES_ICONS)) {
      const n = normIconKey(k)
      if (!ABILITY_ICON_INDEX.has(n)) ABILITY_ICON_INDEX.set(n, v)
    }
  }
  return ABILITY_ICON_INDEX.get(normIconKey(name))
}

/** ability icon chip (real art or a neutral text chip) */
export function abilityBadge(name: string): HTMLElement {
  const node = el('span', 'metaBadge abilityBadge')
  node.title = name || 'способность'
  node.append(iconNode(abilityIconUrl(name), name, {
    cls: 'abilityIcon', size: 20, fit: 'contain',
    fallbackText: (name.trim().charAt(0) || '?').toUpperCase(), tint: '#8fd694', title: node.title,
  }))
  return node
}

/**
 * Slot -> index within a set's piece list. Cavern relic pieces are HEAD/HAND/BODY/FOOT (0-3);
 * planar pieces are sphere(NECK)/rope(OBJECT) (0-1). Must match the order the generator and
 * `fetch-relic-piece-icons.ts` used (both derive it from `relicsets.json` part order).
 */
const RELIC_SLOT_INDEX: Record<RelicSlot, number> = {
  head: 0, hands: 1, body: 2, feet: 3, sphere: 0, rope: 1,
}
const SPHERE_SLOTS = new Set<RelicSlot>(['sphere', 'rope'])

/** relic/planar piece art path for a set id + slot, or undefined when the piece is unknown */
export function relicPieceIconUrl(setId: string, slot: RelicSlot): string | undefined {
  if (!setId) return undefined
  // cavern relics only have piece art for the 4 armor slots, planar sets only for sphere/rope
  const isPlanarSet = PLANAR_SETS.some(s => s.id === setId)
  if (isPlanarSet !== SPHERE_SLOTS.has(slot)) return undefined
  return RELICPIECES_ICONS[setId]?.[String(RELIC_SLOT_INDEX[slot])]
}

// ---------------------------------------------------------------- relic roll cubes

/**
 * Green quality cubes: one cube per substat roll (1..6). Custom design (not Fribbels' chevrons).
 * The node reuses a single element; `updateSubCubes` repaints the count without re-mounting.
 */
export function subCubes(rolls: number, tier: 0 | 1 | 2 = 2): HTMLElement {
  const node = el('span', 'subCubes')
  updateSubCubes(node, rolls, tier)
  return node
}

export function updateSubCubes(node: HTMLElement, rolls: number, tier: 0 | 1 | 2 = 2): void {
  const n = Math.max(0, Math.min(6, Math.floor(rolls) || 0))
  node.dataset.tier = String(tier)
  node.title = `${n} ${n === 1 ? 'roll' : 'rolls'}` + (tier === 0 ? ' (low)' : tier === 1 ? ' (mid)' : ' (high)')
  node.textContent = ''
  for (let i = 0; i < 6; i++) {
    const cube = el('span', 'subCube' + (i < n ? ' on' : ''))
    node.append(cube)
  }
}

/** one cube per roll, each cube carrying its own tier — the color gradation marks roll quality */
export function rollCubes(spread: readonly number[]): HTMLElement {
  const node = el('span', 'subCubes')
  node.textContent = ''
  for (let i = 0; i < 6; i++) {
    const tier = spread[i]
    const cube = el('span', 'subCube' + (tier === undefined ? '' : ' on'))
    if (tier !== undefined) cube.dataset.tier = String(tier)
    node.append(cube)
  }
  node.title = spread.length ? `${spread.length} ${spread.length === 1 ? 'ролл' : 'роллов'}` : ''
  return node
}

/** piece rating letter -> tier class, for coloring the badge. */
export function ratingTierClass(rating: string): string {
  if (rating === '?' || rating === '' || rating === 'F' || rating === 'F+' || rating === 'D' || rating === 'D+') return 'r-low'
  if (rating === 'C' || rating === 'C+' || rating === 'B' || rating === 'B+' || rating === 'A') return 'r-mid'
  if (rating === 'A+' || rating === 'S' || rating === 'S+') return 'r-good'
  if (rating === 'SS' || rating === 'SS+' || rating === 'SSS' || rating === 'SSS+') return 'r-great'
  if (rating === 'CHETAH') return 'r-chetah'
  return 'r-perfect' // WTF, WTF+, AEON
}

// ---------------------------------------------------------------- reusable image node

export type IconFit = 'contain' | 'cover'

/**
 * Build a `<span class="gameIcon">` holding an `<img>` (when a path resolves) and a fallback chip
 * shown only if the image is missing or fails to load. `fallbackText`/`tint` paint the chip.
 * The node is the reusable unit shared by every caller; `alt` is always set.
 */
export function iconNode(url: string | undefined, alt: string, opts: {
  cls?: string
  size?: number
  fit?: IconFit
  fallbackText: string
  tint?: string
  title: string
}): HTMLElement {
  const isPiece = opts.cls?.includes('pieceIcon')
  const wrap = el('span', 'gameIcon' + (opts.cls ? ' ' + opts.cls : ''))
  if (isPiece) wrap.classList.add('pieceIconWrap')
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
    img.onload = () => { chip.style.display = 'none' }
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

// ---------------------------------------------------------------- full-character card art

function paintPortrait(node: HTMLElement, kitId: string): void {
  const kit = KITS.find(k => k.id === kitId)
  const tint = ELEM_COLOR[kit?.elem ?? ''] ?? '#55606f'
  const title = kit ? kit.name : 'персонаж не выбран'
  node.dataset.elem = kit?.elem ?? ''
  node.dataset.empty = kit ? 'false' : 'true'
  node.title = title
  node.innerHTML = ''
  const url = kit ? charPortraitUrl(kitId) : undefined
  node.append(iconNode(url, kit ? kit.name : '—', {
    cls: 'portraitImg',
    fit: 'contain',
    fallbackText: kit ? (kit.name.trim().charAt(0).toUpperCase() || '?') : '+',
    tint,
    title,
  }))
}

/** big full-character art panel (fills its container; element-tinted chip when unknown/none) */
export function charPortrait(kitId: string): HTMLElement {
  const b = el('div', 'charPortrait')
  paintPortrait(b, kitId)
  return b
}

/** point the card art at another kit — same node, no re-mount */
export function updateCharPortrait(node: HTMLElement, kitId: string): void { paintPortrait(node, kitId) }

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
    fallbackText: !id && kind === 'cone' ? '+' : !id ? '—' : (name?.trim().charAt(0).toUpperCase() || '?'),
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

// ---------------------------------------------------------------- relic/planar piece icon

function paintPiece(node: HTMLElement, setId: string, slot: RelicSlot): void {
  const setName_ = !setId ? undefined : setName(setId)
  const url = relicPieceIconUrl(setId, slot)
  const label = setName_ ? `${setName_} — ${slot}` : 'часть'
  const title = !setId ? 'Часть: сет не выбран' : url ? `${label}` : `нет изображения: ${label}`
  node.dataset.elem = ''
  node.title = title
  node.innerHTML = ''
  node.append(iconNode(url, label, {
    cls: 'pieceIcon',
    size: 34,
    fit: 'contain',
    fallbackText: !setId ? '?' : (setName_?.trim().charAt(0).toUpperCase() || '?'),
    tint: setId ? tintOf(setId) : '#55606f',
    title,
  }))
}

/** icon for one relic/planar piece (set id + slot); ''/unknown renders a neutral chip */
export function pieceBadge(setId: string, slot: RelicSlot): HTMLElement {
  const b = el('span', 'charBadge pieceBadge')
  paintPiece(b, setId, slot)
  return b
}

/** point the piece badge at another set (slot select changed) — same node, no re-mount */
export function updatePieceBadge(b: HTMLElement, setId: string, slot: RelicSlot): void { paintPiece(b, setId, slot) }

// ---------------------------------------------------------------- element / path chips (§1)

function paintMeta(node: HTMLElement, kind: 'elem' | 'path', key: string): void {
  const url = kind === 'elem' ? elemIconUrl(key) : pathIconUrl(key)
  const text = key || '—'
  const title = kind === 'elem' ? `Элемент: ${text}` : `Путь: ${text}`
  node.dataset.elem = ''
  node.title = title
  node.innerHTML = ''
  node.append(iconNode(url, text, {
    cls: 'metaIcon',
    size: 18,
    fit: 'contain',
    fallbackText: text.charAt(0).toUpperCase(),
    tint: ELEM_COLOR[key] ?? '#55606f',
    title,
  }))
}

/** element / path icon chip; unknown key renders a letter chip instead of a broken image */
export function metaBadge(kind: 'elem' | 'path', key: string): HTMLElement {
  const b = el('span', 'metaBadge')
  paintMeta(b, kind, key)
  return b
}

/** point both chips at another kit (character select changed) — same nodes, no re-mount */
export function updateMetaBadges(elemNode: HTMLElement, pathNode: HTMLElement, elem: string, path: string): void {
  paintMeta(elemNode, 'elem', elem)
  paintMeta(pathNode, 'path', path)
}
