import { KITS } from '../core/kits'
import { ENEMY_PRESETS } from '../core/battle'
import type { BattleSetup, ManualMod, TeamSpec } from '../core/battle'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS, SLOT_MAINS, SUBSTAT_TIERS, RELIC_MAIN_VALUES, SPHERE_DMG_MAIN } from '../core/gear'
import type { GearConfig, RelicPiece } from '../core/entities/Unit'
import { el, fillSelect, fmtStatVal, escapeHtml, STAT_LABELS } from './dom'
import { Dropdown } from './dropdown'
import { coneOptions, relicOptions, planarOptions, signatureCone } from '../core/gearOrder'
import { store, techniquesForRows } from './store'
import type { PieceState, TeamRowState } from './store'
import { loadSettings } from './settings'
import { charBadge, gearBadge, updateCharBadge, updateGearBadge, metaBadge, updateMetaBadges, pieceBadge, updatePieceBadge, statBadge, rollCubes, ratingTierClass, gearIconUrl } from './icons'
import { KIT_PATH } from '../core/kits'
import { scoreRelic } from '../core/relicScore'
import { splitSubValues, type SplitSub } from '../core/relicSplit'
import type { DebugLevel } from '../core/battlelog'

export interface PieceEditor {
  slot: RelicPiece['slot']
  card: HTMLElement
  /** per-piece set picker — name + set icon */
  setDrop: Dropdown
  pieceBadgeEl: HTMLElement
  ratingEl: HTMLElement
  mainSel: HTMLSelectElement
  mainVal: HTMLElement
  /** ONE number per piece: the summed substat value; the script splits it into `subs` */
  valueInp: HTMLInputElement
  /** the current split — read-only rows painted under the input */
  subs: SplitSub[]
  subRows: HTMLElement
  /** set the piece's set (programmatic — no change event) */
  setSet: (id: string) => void
  /** clear the piece (set + value + split) */
  reset: () => void
  /** restore a persisted piece into the editor (no change event) */
  restore: (p: PieceState) => void
}

export interface CharRow {
  id: string
  root: HTMLElement
  kitId: string
  stats: Record<string, HTMLInputElement>
  coneSel: Dropdown
  siSel: HTMLSelectElement
  relic1: Dropdown
  relic2: Dropdown
  planarSel: Dropdown
  eidSel: HTMLSelectElement
  levels: Record<'basic' | 'skill' | 'ult' | 'talent', HTMLInputElement>
  tracesChk: HTMLInputElement
  energyFracSel: HTMLSelectElement
  techniqueSel: HTMLSelectElement
  pieces: PieceEditor[]
  relicRoot: HTMLElement
  // strategy controls
  skillPriorityInp: HTMLInputElement
  skillPatternSel: HTMLSelectElement
  skillRotationInp: HTMLInputElement
  strategyChks: Record<string, HTMLInputElement>
}

export const teamRows: CharRow[] = []
let rowSeq = 0

const DEFAULT_STATS: Record<string, Record<string, number | undefined>> = {
  seele:      { atk: 2600, spd: 140, critRate: 0.70, critDmg: 1.80 },
  jingyuan:   { atk: 2800, spd: 112, critRate: 0.55, critDmg: 1.90 },
  firefly:    { atk: 3000, spd: 150, critRate: 0.30, critDmg: 1.50, be: 3.6 },
  bronya:     { atk: 2200, spd: 134, critRate: 0.50, critDmg: 2.00 },
  pela:       { atk: 2400, spd: 134, critRate: 0.40, critDmg: 1.20 },
  guinaifen:  { atk: 2800, spd: 130, critRate: 0.45, critDmg: 1.30 },
  sparkle:    { atk: 2000, spd: 125, critRate: 0.35, critDmg: 2.60 },
  gallagher:  { spd: 145, be: 2.80 },
}
const DEFAULT_CONE: Record<string, string> = {
  seele: 'in_the_night', jingyuan: 'before_dawn', firefly: 'whereabouts', bronya: 'bbibo',
  pela: 'resolution', guinaifen: 'fermata', sparkle: 'earthly_escapade', gallagher: '',
}

const SLOT_TITLES: Array<[RelicPiece['slot'], string]> = [
  ['head', 'Голова'], ['hands', 'Руки'], ['body', 'Тело'], ['feet', 'Ноги'], ['sphere', 'Планарная сфера'], ['rope', 'Связующий канат'],
]

const STRATEGY_FLAGS: Record<string, Record<string, string>> = {
  seele: { useSkillWhenPossible: 'Use Skill when SP≥1' },
  jingyuan: { useSkillWhenPossible: 'Use Skill when SP≥1' },
  firefly: { useSkillWhenPossible: 'Use Skill when SP≥1' },
  bronya: { useSkillWhenPossible: 'Use Skill on Main DPS' },
  pela: { useSkillWhenPossible: 'Use Skill when SP≥1' },
  guinaifen: { useSkillWhenPossible: 'Use Skill when SP≥1' },
  sparkle: { prioritizeSkillOnHighSP: 'Prioritize Skill at SP≥2' },
  gallagher: { useSkillWhenPossible: 'Use Skill when SP≥1' },
}

// ---------------------------------------------------------------- helpers

function applyDefault(inp: HTMLInputElement, kitId: string, key: string): void {
  const d = DEFAULT_STATS[kitId]?.[key]
  inp.value = d === undefined ? '' : String(d)
}

/** sync one DOM row into the store */
export function syncRow(r: CharRow): void {
  const num = (i: HTMLInputElement): number | undefined => (i.value.trim() === '' ? undefined : Number(i.value))
  const strategy: Record<string, boolean> = {}
  for (const [key, inp] of Object.entries(r.strategyChks)) strategy[key] = inp.checked
  const patch: Partial<TeamRowState> = {
    kitId: r.kitId,
    stats: {
      atk: num(r.stats.atk), spd: num(r.stats.spd),
      critRate: num(r.stats.critRate), critDmg: num(r.stats.critDmg), be: num(r.stats.be),
    },
    coneId: r.coneSel.value,
    si: Number(r.siSel.value) || 1,
    relic1: r.relic1.value, relic2: r.relic2.value, planar: r.planarSel.value,
    eidolon: Number(r.eidSel.value) || 0,
    levels: rowLevels(r),
    traces: r.tracesChk.checked,
    energyStartFrac: (Number(r.energyFracSel.value) || 0) / 100,
    techniqueUses: Number(r.techniqueSel.value) || 0,
    skillPriority: Number(r.skillPriorityInp.value) || 0,
    skillPattern: (r.skillPatternSel.value as TeamSpec['skillPattern']) || 'auto',
    skillRotation: r.skillRotationInp.value || '',
    strategy,
    pieces: r.pieces.map(pieceOf),
  }
  store.dispatch({ type: 'team/update', id: r.id, patch })
}

export const pieceOf = (p: PieceEditor): PieceState => ({
  slot: p.slot,
  setId: p.setDrop.value,
  main: p.mainSel.value,
  subs: p.subs.map(s => ({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread })),
})

// ---------------------------------------------------------------- team cards

export function addCharRow(): void {
  if (store.getState().team.length >= 4) return
  const used = new Set(store.getState().team.map(r => r.kitId))
  const free = KITS.find(k => !used.has(k.id)) ?? KITS[0]
  const id = `r${rowSeq++}`

  const card = el('div', 'charCard')

  const head = el('div', 'charHead')
  const badge = charBadge(free.id)
  const elemChip = metaBadge('elem', free.elem)
  const pathChip = metaBadge('path', KIT_PATH[free.id] ?? '')
  const sel = el('select') as HTMLSelectElement
  fillSelect(sel, KITS.map(k => [k.id, `${k.name} (${k.elem})`]))
  sel.value = free.id

  const del = el('button', 'del')
  del.textContent = '✕'
  const onDelete = () => {
    store.dispatch({ type: 'team/remove', id })
    const idx = teamRows.findIndex(x => x.id === id)
    if (idx >= 0) teamRows.splice(idx, 1)
    card.remove()
  }
  del.onclick = onDelete
  head.append(badge, sel, elemChip, pathChip, del)
  card.append(head)

  // stat inputs
  const row = el('div', 'row')
  const fields: Array<[string, string]> = [
    ['atk', 'ATK'], ['spd', 'SPD'], ['critRate', 'CR'], ['critDmg', 'CD'], ['be', 'BE'],
  ]
  const stats: Record<string, HTMLInputElement> = {}
  for (const [key, label] of fields) {
    const lab = el('label')
    lab.title = label
    const ic = statBadge(key)
    const inp = el('input')
    inp.type = 'number'
    inp.step = 'any'
    inp.setAttribute('aria-label', label)
    applyDefault(inp, free.id, key)
    stats[key] = inp
    lab.append(ic, inp)
    row.append(lab)
  }
  // stats row is appended later (after build/gear) to follow the §2 order: gear → slots → stats

  // gear selects
  const gear = el('div', 'gear')
  const mkGearLabel = (text: string, s: HTMLElement) => {
    const l = el('label'); l.textContent = text; l.append(s); return l
  }

  const coneSel = new Dropdown()
  const path = KIT_PATH[free.id] ?? ''
  coneSel.setEntries(coneOptions(free.id, path), { sig: signatureCone(free.id) })
  coneSel.value = DEFAULT_CONE[free.id] ?? signatureCone(free.id) ?? ''
  const coneBadge = gearBadge('cone', coneSel.value)

  const siSel = el('select') as HTMLSelectElement
  fillSelect(siSel, [1, 2, 3, 4, 5].map(n => [String(n), `S${n}`] as [string, string]))

  const relic1 = new Dropdown()
  relic1.setEntries(relicOptions(free.id, '— Relic A —'))
  const relic1Badge = gearBadge('relic', relic1.value)
  const relic2 = new Dropdown()
  relic2.setEntries(relicOptions(free.id, '— Relic B —'))
  const relic2Badge = gearBadge('relic', relic2.value)

  const planarSel = new Dropdown()
  planarSel.setEntries(planarOptions(free.id))
  const planarBadge = gearBadge('planar', planarSel.value)

  gear.append(mkGearLabel('Cone', coneBadge), mkGearLabel('Cone', coneSel.root), mkGearLabel('SI', siSel), mkGearLabel('Relics', relic1Badge), mkGearLabel('Relics', relic1.root), mkGearLabel('+', relic2Badge), mkGearLabel('+', relic2.root), mkGearLabel('Planar', planarBadge), mkGearLabel('Planar', planarSel.root))
  card.append(gear)

  // eidolon + ability levels + traces
  const progRow = el('div', 'row progRow')
  const eidSel = el('select') as HTMLSelectElement
  fillSelect(eidSel, [0, 1, 2, 3, 4, 5, 6].map(n => [String(n), `E${n}`] as [string, string]))
  const levels = {} as CharRow['levels']
  const lvWrap = (key: 'basic' | 'skill' | 'ult' | 'talent', label: string, max: number): HTMLLabelElement => {
    const l = el('label'); l.textContent = label
    const i = el('input') as HTMLInputElement
    i.type = 'number'; i.min = '1'; i.max = String(max); i.value = key === 'basic' ? '6' : '10'
    i.title = `${label} 1–${max}`
    levels[key] = i
    l.append(i)
    return l
  }
  const tracesChk = el('input') as HTMLInputElement
  tracesChk.type = 'checkbox'; tracesChk.checked = true; tracesChk.title = 'Минорные трейсы'
  const trLab = el('label'); trLab.textContent = 'Трейсы'; trLab.append(tracesChk)
  const energyFracSel = el('select') as HTMLSelectElement
  fillSelect(energyFracSel, [0, 25, 50, 75, 100].map(n => [String(n), `${n}%`] as [string, string]))
  energyFracSel.value = '50'
  energyFracSel.title = 'Старт боя: энергия в % от максимума (движок по умолчанию 50%)'
  const enLab = el('label'); enLab.textContent = 'Энергия'; enLab.append(energyFracSel)
  eidSel.title = 'Эйдолон'
  progRow.append(mkGearLabel('Eidolon', eidSel),
    lvWrap('basic', 'BAS', 7), lvWrap('skill', 'SKL', 12), lvWrap('ult', 'ULT', 12), lvWrap('talent', 'TAL', 12), trLab, enLab)
  card.append(progRow)

  // technique (§84.6.1): 0 = off; N = N uses of this kit's Technique in activation order.
  // Kept visible — it is part of the normal per-character setup, not advanced tuning.
  const techniqueSel = el('select') as HTMLSelectElement
  const techniqueLab = el('label'); techniqueLab.textContent = 'Техника'; techniqueLab.append(techniqueSel)
  const fillTechniqueOpts = (kitId: string): void => {
    const t = KITS.find(k => k.id === kitId)?.technique
    fillSelect(techniqueSel, [['0', '—'], ...Array.from({ length: t?.maxUses ?? 1 }, (_, i) => [String(i + 1), `${i + 1}×`] as [string, string])])
    techniqueSel.title = t ? `Претехника: ${t.name} (${t.kind}${t.zone ? ', zone' : ''})` : 'У персонажа нет претехники'
  }
  fillTechniqueOpts(free.id)
  const techRow = el('div', 'row stratRow')
  techRow.append(techniqueLab)
  card.append(techRow)

  // relic slots — the 6 piece editors live inside the character card (§2 order), collapsed by default
  const pieces = buildPieceEditors(undefined, () => free.id)
  const relicRoot = el('div', 'relicGrid')
  for (const p of pieces) relicRoot.append(p.card)
  const relicDetails = el('details', 'advSection')
  const relicSum = el('summary'); relicSum.textContent = 'Реликвии (6 слотов)'
  relicDetails.append(relicSum, relicRoot)
  card.append(relicDetails)

  // stats (§2: after gear/slots)
  card.append(row)

  // advanced strategy (§3) — skill priority/pattern/rotation + kit flags, collapsed by default
  const stratRow = el('div', 'row stratRow')
  const skillPriorityInp = el('input') as HTMLInputElement
  skillPriorityInp.type = 'number'; skillPriorityInp.min = '0'; skillPriorityInp.max = '10'; skillPriorityInp.value = '0'; skillPriorityInp.title = 'Skill Priority: higher = prefers skill when SP available'
  const skillPriorityLab = el('label'); skillPriorityLab.textContent = 'Skill Pri'; skillPriorityLab.append(skillPriorityInp)

  const skillPatternSel = el('select') as HTMLSelectElement
  fillSelect(skillPatternSel, [
    ['auto', 'Auto (SP≥1→Skill)'],
    ['skill->basic', 'Skill→Basic'],
    ['normal->skill->normal', 'B→S→B'],
    ['rotation', 'Custom Rotation'],
  ] as [string, string][])
  const skillPatternLab = el('label'); skillPatternLab.textContent = 'Pattern'; skillPatternLab.append(skillPatternSel)

  const skillRotationInp = el('input') as HTMLInputElement
  skillRotationInp.type = 'text'; skillRotationInp.placeholder = 'B S B S U'; skillRotationInp.title = 'Rotation (space-separated): B=Basic, S=Skill, U=Ult'
  const skillRotationLab = el('label'); skillRotationLab.textContent = 'Rotation'; skillRotationLab.append(skillRotationInp)

  stratRow.append(skillPriorityLab, skillPatternLab, skillRotationLab)

  // character-specific strategy flags (per kit)
  const strategyChks: Record<string, HTMLInputElement> = {}
  const stratFlagsRow = el('div', 'row stratFlagsRow')
  const kitFlags = STRATEGY_FLAGS[free.id] ?? {}
  for (const [key, label] of Object.entries(kitFlags)) {
    const inp = el('input') as HTMLInputElement
    inp.type = 'checkbox'
    inp.checked = false
    inp.title = label
    strategyChks[key] = inp
    const lab = el('label'); lab.style.fontSize = '11px'; lab.style.marginRight = '8px'; lab.append(inp, document.createTextNode(' ' + label))
    stratFlagsRow.append(lab)
  }
  const stratDetails = el('details', 'advSection')
  const stratSum = el('summary'); stratSum.textContent = 'Advanced strategy'
  stratDetails.append(stratSum, stratRow, stratFlagsRow)
  card.append(stratDetails)

  const preview = el('div', 'gearPreview')
  card.append(preview)

  const r: CharRow = { id, root: card, kitId: free.id, stats, coneSel, siSel, relic1, relic2, planarSel, eidSel, levels, tracesChk, energyFracSel, techniqueSel, pieces, relicRoot, skillPriorityInp, skillPatternSel, skillRotationInp, strategyChks }
  const refresh = () => {
    syncRow(r)
    updateGearBadge(coneBadge, 'cone', coneSel.value)
    updateGearBadge(relic1Badge, 'relic', relic1.value)
    updateGearBadge(relic2Badge, 'relic', relic2.value)
    updateGearBadge(planarBadge, 'planar', planarSel.value)
    paintPieceRatings(r)
    preview.innerHTML = gearPreviewHtml(storeRow(r))
  }

  for (const s of [coneSel, siSel, relic1, relic2, planarSel]) s.onchange = refresh
  for (const p of pieces) {
    const setPrev = p.setDrop.onchange
    p.setDrop.onchange = () => { setPrev?.(); refresh() }
    const mainPrev = p.mainSel.onchange as (() => void) | null
    p.mainSel.onchange = () => { mainPrev?.(); refresh() }
    const valPrev = p.valueInp.oninput as (() => void) | null
    if (valPrev) p.valueInp.oninput = () => { valPrev?.(); refresh() }
  }
  for (const [k] of Object.entries(stats)) stats[k].oninput = refresh
  for (const k of Object.keys(levels)) (levels[k as keyof CharRow['levels']] as HTMLInputElement).oninput = refresh
  tracesChk.onchange = refresh
  energyFracSel.onchange = refresh
  techniqueSel.onchange = refresh
  eidSel.onchange = refresh
  skillPriorityInp.oninput = refresh
  skillPatternSel.onchange = refresh
  skillRotationInp.oninput = refresh
  for (const k of Object.keys(strategyChks)) strategyChks[k].onchange = refresh

  sel.onchange = () => {
    r.kitId = sel.value
    const kit = KITS.find(k => k.id === sel.value)
    updateCharBadge(badge, sel.value)
    updateMetaBadges(elemChip, pathChip, kit?.elem ?? '', KIT_PATH[sel.value] ?? '')
    for (const [k] of Object.entries(stats)) applyDefault(stats[k], sel.value, k)
    const path = KIT_PATH[sel.value] ?? ''
    coneSel.setEntries(coneOptions(sel.value, path), { sig: signatureCone(sel.value) })
    relic1.setEntries(relicOptions(sel.value, '— Relic A —'))
    relic2.setEntries(relicOptions(sel.value, '— Relic B —'))
    planarSel.setEntries(planarOptions(sel.value))
    coneSel.value = DEFAULT_CONE[sel.value] ?? signatureCone(sel.value) ?? ''
    updateGearBadge(coneBadge, 'cone', coneSel.value)
    fillTechniqueOpts(sel.value)
    techniqueSel.value = '0'
    refresh()
  }

  document.getElementById('team')!.append(card)
  teamRows.push(r)
  store.dispatch({ type: 'team/add', row: { id, kitId: free.id, stats: rowStatsOf(r), coneId: coneSel.value, si: 1, relic1: '', relic2: '', planar: '', eidolon: 0, levels: { basic: 6, skill: 10, ult: 10, talent: 10 }, traces: true, techniqueUses: 0, skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: pieces.map(pieceOf) } as TeamRowState })
  refresh()
}

function rowStatsOf(r: CharRow): TeamRowState['stats'] {
  const out: TeamRowState['stats'] = {}
  for (const [k, i] of Object.entries(r.stats)) {
    if (i.value.trim() !== '') out[k as keyof typeof out] = Number(i.value)
  }
  return out
}

/** re-read a row's current DOM into the store (drift safety before collect) */
export function syncAllRows(): void {
  for (const r of teamRows) syncRow(r)
}

export function getTeamRow(id: string): CharRow | undefined {
  return teamRows.find(x => x.id === id)
}

const storeRow = (r: CharRow): TeamRowState =>
  store.getState().team.find(t => t.id === r.id) ?? { id: r.id, kitId: r.kitId, stats: {}, coneId: '', si: 1, relic1: '', relic2: '', planar: '', eidolon: 0, levels: { basic: 6, skill: 10, ult: 10, talent: 10 }, traces: true, techniqueUses: 0, skillPriority: 0, skillPattern: 'auto', skillRotation: '', strategy: {}, pieces: [] }

/** aggregate a row's gear config from the store */
export function gearOfRow(tr: TeamRowState): GearConfig | undefined {
  const pieces: RelicPiece[] = []
  for (const p of tr.pieces) {
    if (!p.setId) continue
    pieces.push({
      setId: p.setId,
      slot: p.slot,
      main: p.main,
      subs: p.subs.filter(s => s.stat && s.rolls > 0).map(s => ({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread })),
    })
  }
  const sets = [tr.relic1, tr.relic2].filter(Boolean)
  if (!tr.coneId && !sets.length && !tr.planar && !pieces.length) return undefined
  return {
    coneId: tr.coneId || undefined,
    si: tr.si,
    coneLevel: tr.coneLevel,
    relicSets: sets,
    planarId: tr.planar || undefined,
    pieces: pieces.length ? pieces : undefined,
  }
}

/** one team row → battle TeamSpec */
export function toTeamSpec(tr: TeamRowState): TeamSpec {
  return {
    kitId: tr.kitId,
    stats: {
      atk: tr.stats.atk, spd: tr.stats.spd,
      critRate: tr.stats.critRate, critDmg: tr.stats.critDmg,
      be: tr.stats.be,
    },
    gear: gearOfRow(tr),
    eidolon: tr.eidolon,
    levels: tr.levels,
    level: tr.level,
    traces: tr.traces,
    energyStartFrac: tr.energyStartFrac,
    skillPriority: tr.skillPriority,
    skillPattern: tr.skillPattern,
    skillRotation: tr.skillRotation,
    strategy: tr.strategy,
  }
}

/** paint the per-piece relic rating badge (WTF/AEON/...) for the current kit */
function paintPieceRatings(r: CharRow): void {
  for (const p of r.pieces) {
    const subs = p.subs
      .filter(s => s.stat && s.rolls > 0)
      .map(s => ({ stat: s.stat, tier: s.tier, rolls: s.rolls, spread: s.spread }))
    const { rating } = scoreRelic(r.kitId, p.slot, p.mainSel.value, subs)
    p.ratingEl.textContent = rating
    p.ratingEl.className = 'pieceRating ' + ratingTierClass(rating)
  }
}

const TIER_WORD: Record<0 | 1 | 2, string> = { 0: 'низкое', 1: 'среднее', 2: 'высокое' }

/** 5 decimals — the same rounding the engine uses for substat values */
const round5 = (n: number): number => Math.round(n * 1e5) / 1e5; void round5

/**
 * 6 piece editors: set picker (name + set icon), main stat, and ONE number for
 * the summed substat value — the script splits it into the substats below.
 */
export function buildPieceEditors(onChange?: () => void, kitIdOf?: () => string): PieceEditor[] {
  const out: PieceEditor[] = []
  for (const [slot, title] of SLOT_TITLES) {
    const card = el('div', 'pieceCard')
    const h = el('h4'); h.textContent = title
    const pieceBadgeEl = pieceBadge('', slot)
    const ratingEl = el('span', 'pieceRating'); ratingEl.textContent = '?'
    const head = el('div', 'pieceHead'); head.append(pieceBadgeEl, h, ratingEl)

    const isPlanar = slot === 'sphere' || slot === 'rope'
    const pool = isPlanar ? PLANAR_SETS : RELIC_SETS
    const setDrop = new Dropdown('setDrop')
    const setIcons: Record<string, string> = {}
    for (const s of pool) {
      const url = gearIconUrl(isPlanar ? 'planar' : 'relic', s.id)
      if (url) setIcons[s.id] = url
    }
    setDrop.setEntries([['', '— не выбран —'], ...pool.map(s => [s.id, s.name] as [string, string])], { icons: setIcons })

    const mainSel = el('select') as HTMLSelectElement
    const mains = SLOT_MAINS[slot] || []
    fillSelect(mainSel, mains.map(m => [m, STAT_LABELS[m] ?? m] as [string, string]))
    const mainVal = el('div', 'pieceMain')
    const updateMainVal = (): void => {
      const m = mainSel.value
      if (!m) { mainVal.textContent = ''; return }
      const v = m.startsWith('dmg:') ? SPHERE_DMG_MAIN : (RELIC_MAIN_VALUES[m] ?? 0)
      mainVal.textContent = fmtStatVal(m, v)
    }
    updateMainVal()
    // For head/hands main stat is fixed by slot
    if (slot === 'head' || slot === 'hands') {
      mainSel.disabled = true
    }

    // Manual substat entry: pick stat + enter value, script splits into rolls/quality
    const subStatSel = el('select') as HTMLSelectElement
    const subValInp = el('input', 'pieceSubVal') as HTMLInputElement
    subValInp.type = 'number'
    subValInp.step = '0.01'
    subValInp.min = '0'
    subValInp.placeholder = 'значение'
    const addSubBtn = el('button', 'addSubBtn') as HTMLButtonElement
    addSubBtn.type = 'button'
    addSubBtn.textContent = '+ саб'
    const subEntry = el('div', 'subEntry')
    subEntry.append(subStatSel, subValInp, addSubBtn)
    const subRows = el('div', 'subRows')

    const ed: PieceEditor = {
      slot, card, setDrop, pieceBadgeEl, ratingEl, mainSel, mainVal,
      valueInp: subValInp, subs: [], subRows,
      setSet: (id: string) => {
        setDrop.value = id
        updatePieceBadge(pieceBadgeEl, id, slot)
      },
      reset: () => {
        setDrop.value = ''
      ed.subs = []
      subRows.innerHTML = ''
      subValInp.value = ''
      addSubBtn.disabled = false
      fillSubStats()
      updatePieceBadge(pieceBadgeEl, '', slot)
      },
      restore: (p: PieceState) => {
        setDrop.value = p.setId ?? ''
        updatePieceBadge(pieceBadgeEl, p.setId ?? '', slot)
        if (mains.includes(p.main)) mainSel.value = p.main
        updateMainVal()
        ed.subs = (p.subs ?? []).map(s => ({
          stat: s.stat,
          tier: s.tier,
          rolls: s.rolls,
          spread: s.spread ?? [],
        }))
        const total = ed.subs.reduce((a, s) => a + s.spread.reduce((x, t) => x + (SUBSTAT_TIERS[s.stat]?.[t] ?? 0), 0), 0)
        subValInp.value = total ? String(Math.round(total * 100) / 100) : ''
        paintSubs()
      },
    }

    const paintSubs = (): void => {
      subRows.innerHTML = ''
      for (const s of ed.subs) {
        const v = s.spread.reduce((a, t) => a + SUBSTAT_TIERS[s.stat][t], 0)
        const row = el('div', 'subRow')
        row.append(statBadge(s.stat))
        const name = el('span', 'subStatName'); name.textContent = STAT_LABELS[s.stat] ?? s.stat
        const val = el('span', 'subVal'); val.textContent = '+ ' + fmtStatVal(s.stat, v)
        row.append(name, val)
        const barWrap = el('div', 'subBarWrap')
        const bar = el('div', 'subBar')
        bar.append(rollCubes(s.spread))
        const q = el('div', 'subQuality'); q.textContent = TIER_WORD[s.tier]
        bar.append(q)
        barWrap.append(bar)
        row.append(barWrap)
        subRows.append(row)
      }
      if (ed.subs.length >= 4) addSubBtn.disabled = true
      else addSubBtn.disabled = false
      fillSubStats()
    }

    const getMain = () => (slot === 'head' || slot === 'hands') ? mains[0] || '' : mainSel.value
    const fillSubStats = () => {
      const main = getMain()
      const used = new Set([main].filter(Boolean))
      const cand = Object.keys(SUBSTAT_TIERS).filter(s => !used.has(s))
      fillSelect(subStatSel, cand.map(s => [s, STAT_LABELS[s] ?? s] as [string, string]))
    }
    setDrop.onchange = () => { updatePieceBadge(pieceBadgeEl, setDrop.value, slot); onChange?.(); showFixed?.(); fillSubStats() }
    mainSel.onchange = () => { updateMainVal(); fillSubStats() }
    fillSubStats()
    addSubBtn.onclick = () => {
      if (ed.subs.length >= 4) return
      const main = getMain()
      const stat = subStatSel.value
      if (!stat || stat === main) return
      const total = Number(subValInp.value) || 0
      if (total <= 0) return
      const kitId = kitIdOf?.() ?? ''
      const splits = kitId ? splitSubValues(kitId, main, total) : []
      const pick = splits.find(s => s.stat === stat) || splits[0]
      if (pick) {
        ed.subs.push({ ...pick, stat })
        paintSubs()
        onChange?.()
      }
      subValInp.value = ''
      fillSubStats()
    }

    mainSel.onchange = () => { updateMainVal(); fillSubStats() }

    // For head/hands main is fixed text, only shown after set is chosen
      if (slot === 'head' || slot === 'hands') {
        const fixed = el('div', 'pieceMainFixed')
        const m = mains[0] ?? ''
        const v = m ? (RELIC_MAIN_VALUES[m] ?? 0) : 0
        fixed.textContent = ''
        const showFixedFn = () => {
          if (setDrop.value && m) fixed.textContent = `${STAT_LABELS[m] || m}: ${fmtStatVal(m, v)}`
          else fixed.textContent = ''
          fillSubStats()
        }
        setDrop.onchange = () => { updatePieceBadge(pieceBadgeEl, setDrop.value, slot); onChange?.(); showFixedFn() }
        showFixedFn()
        card.append(head, setDrop.root, fixed, subEntry, subRows)
      } else {
      setDrop.onchange = () => { updatePieceBadge(pieceBadgeEl, setDrop.value, slot); onChange?.() }
      card.append(head, setDrop.root, mainSel, mainVal, subEntry, subRows)
    }
    out.push(ed)
  }
  return out
}

export function rowLevels(r: CharRow) {
  const num = (i: HTMLInputElement, max: number) =>
    Math.max(1, Math.min(max, Number(i.value) || (max === 7 ? 6 : 10)))
  return {
    basic: num(r.levels.basic, 7),
    skill: num(r.levels.skill, 12),
    ult: num(r.levels.ult, 12),
    talent: num(r.levels.talent, 12),
  }
}

// ---------------------------------------------------------------- collect

export function collect(): BattleSetup {
  syncAllRows()
  const s = store.getState()

  const team: TeamSpec[] = s.team.map(toTeamSpec).filter(t => !!t.kitId)

  const p = ENEMY_PRESETS[s.enemy.preset]
  const manualMods: ManualMod[] = s.mods
    .filter(m => m.value !== 0)
    .map(m => ({ stat: m.stat, value: m.value, side: m.side }))

  const setup: BattleSetup = {
    team,
    enemy: { ...p, count: s.enemy.count, weaknesses: s.enemy.weaknesses as typeof p.weaknesses, effectRes: s.enemy.effRes || undefined },
    cycles: s.run.cycles || 4,
    seed: s.run.seed || 42,
    manualMods,
  }
  if (s.encounterSpec) setup.encounter = s.encounterSpec
  const techniques = techniquesForRows(s.team)
  if (techniques.length) setup.techniques = techniques
  const dbg = loadSettings().debugLevel
  if (dbg > 0) setup.log = { debug: dbg as DebugLevel }
  return setup
}

// ---------------------------------------------------------------- gear preview

export function gearPreviewHtml(tr: TeamRowState): string {
  const g = gearOfRow(tr)
  if (!g) return '<em class="dim">без экипировки</em>'
  const parts: string[] = []
  const cone = LIGHT_CONES.find(c => c.id === g.coneId)
  if (cone) parts.push(`★${cone.rarity} ${escapeHtml(cone.name)} S${g.si ?? 1}`)
  if (g.pieces?.length) {
    const counts = new Map<string, number>()
    for (const p of g.pieces) counts.set(p.setId, (counts.get(p.setId) ?? 0) + 1)
    for (const [id, n] of counts) {
      const pool = [...RELIC_SETS, ...PLANAR_SETS]
      const st = pool.find(x => x.id === id)
      if (st) parts.push(`${escapeHtml(st.name)} ×${n}`)
    }
    parts.push(...g.pieces.map(p => `${p.slot}: ${p.main}${p.subs.length ? ' +' + p.subs.length : ''}`))
  } else {
    const counts = new Map<string, number>()
    for (const id of g.relicSets ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const [id, n] of counts) {
      const st = RELIC_SETS.find(x => x.id === id)
      if (st) parts.push(`${escapeHtml(st.name)} ×${n * 2}pc`)
    }
  }
  const pl = PLANAR_SETS.find(p => p.id === g.planarId)
  if (pl) parts.push(escapeHtml(pl.name))
  return parts.join(' · ')
}