import ENDGAME from '../../hsr-data/endgame.json'
import { getVariant, ELEMS } from './enemy'
import type { Elem } from './entities/Unit'
import type { BattleSetup, EnemySpec, TeamSpec } from './battle'

export type EndgameMode = 'MoC' | 'PF' | 'AS' | 'AA'

export const ENDGAME_MODES: EndgameMode[] = ['MoC', 'PF', 'AS', 'AA']

export { ELEMS }

export interface EndgameCard {
  name: string
  count: number
  weaknesses?: Elem[]
}

export interface EndgameNode {
  label: string
  cards: EndgameCard[]
  types?: Elem[]
}

export interface EndgameSection {
  id: string
  title: string
  url: string
  blocks: EndgameBlock[]
}

export interface EndgameBlock {
  label: string
  list?: string[]
  content?: string
  types?: Elem[]
  cards?: EndgameCard[]
  nodes?: EndgameNode[]
}

export interface EndgameStage {
  mode: EndgameMode
  version: string
  id: string
  title: string
  maxCycles: number | number[]
  enemyLevels: number[]
  objectives: string[]
  /** Named rooms in source order; MoC rooms are sequential waves of one stage run. */
  rooms: EndgameRoom[]
  battles: EndgameBattle[]
}

export interface EndgameRoom {
  id: string
  /** Existing enemy profiles with the archive's level curve applied. */
  enemies: EnemySpec[]
  types?: Elem[]
}

export interface EndgameBattle {
  /** Independently selectable room/fight, e.g. 'Node 1'. */
  id: string
  /** Enemy level of this room (AS: chosen stage level). */
  level: number
  /** Sequential waves inside this room; a Node is not itself a wave. */
  waves: EnemySpec[][]
  types?: Elem[]
}

export interface EndgameEffect {
  id: string
  label: string
  description: string
  types?: Elem[]
}

function plainText(html: string): string {
  return html
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------- sources

const data = (ENDGAME as any).modes as Record<EndgameMode, any[]>

// ---------------------------------------------------------------- level curves
// HP/ATK/SPD share a global growth curve across all enemies (wiki table); the raw
// data carries levels 80..100 and 120. Levels 55..79 (old MoC/PF floors) are
// extrapolated downward from the measured 80→81 ratio; 101..119 interpolate the
// 100→120 log-slope; >120 continues it.

const CURVE_HP = new Map<number, number>()
const CURVE_ATK = new Map<number, number>()
{
  const ref = getVariant('Stellaron Hunter: Sam')!.stats! // has full 80..100,120 table
  const s80 = ref[80]
  for (const k of [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 120]) {
    const s = ref[k]
    if (!s) continue
    CURVE_HP.set(k, s.hp / s80.hp)
    CURVE_ATK.set(k, s.atk / s80.atk)
  }
}
const HP_BELOW80 = CURVE_HP.get(80)! / CURVE_HP.get(81)! // 1/1.0505 per level
const HP_LOG_SLOPE_101_120 = Math.log(CURVE_HP.get(120)! / CURVE_HP.get(100)!) / 20
const ATK_GROWTH = CURVE_ATK.get(81)! / CURVE_ATK.get(80)! // ~1.017/level

function hpMult(level: number): number {
  const h = CURVE_HP
  if (level >= 80 && level <= 100 && h.has(level)) return h.get(level)!
  if (level <= 120 && level >= 101) {
    const t = (level - 100) / 20
    return h.get(100)! * Math.exp(HP_LOG_SLOPE_101_120 * 20 * t)
  }
  if (level > 120) return h.get(120)! * Math.exp(HP_LOG_SLOPE_101_120 * (level - 120))
  // below 80
  return HP_BELOW80 ** (80 - level)
}

function atkMult(level: number): number {
  const a = CURVE_ATK
  if (level >= 80 && level <= 100 && a.has(level)) return a.get(level)!
  if (level >= 101) return a.get(100)! * Math.pow(a.get(120)! / a.get(100)!, (level - 100) / 20)
  return Math.pow(ATK_GROWTH, level - 80)
}

function spdAt(level: number): number {
  // 80-85 base; 86+ ×1.1; 120+ ×1.25 (piecewise from raw data)
  if (level >= 120) return 1.25
  if (level >= 86) return 1.1
  return 1.0
}

// ---------------------------------------------------------------- EnemySpec build

export function enemyAtLevel(name: string, level: number, count = 1, weaknesses?: Elem[]): EnemySpec | undefined {
  const v = getVariant(name)
  if (!v) return undefined
  const s80 = v.stats?.[80]
  let baseSpd = s80?.spd ?? 0
  if (baseSpd <= 0) baseSpd = 100 // wiki has no SPD for composite-boss pages ("The Past, Present, and Eternal Show")
  const baseAtk = s80?.atk ?? 0
  const rank = v.rank
  const segs = v.toughnessModel.segments
  // multi-layer intrinsic bars: flatten every segment in order (e.g. Cacophonic Conductor 80 ×10 →
  // ten 80-bars). Single-segment/count-1 stays scalar so the common path keeps one bar. Phase-gated
  // segment lists are flattened too (no per-phase toughness override exists in the runtime yet).
  const toughnessBars = segs && segs.length > 0 && (segs.length > 1 || (segs[0]!.count ?? 1) > 1)
    ? segs.flatMap(s => Array(s.count ?? 1).fill(s.max))
    : undefined
  let toughness = toughnessBars ? toughnessBars[0]! : v.toughnessModel.primary
  if (toughness <= 0) toughness = rank === 'boss' ? 180 : rank === 'elite' ? 90 : 30 // wiki omits it for summon/construct entries
  const w = weaknesses ?? v.weaknesses
  return {
    name,
    count,
    hp: Math.round((s80?.hp ?? 0) * hpMult(level)),
    spd: Math.round(baseSpd * spdAt(level) * 10) / 10,
    level,
    toughness,
    toughnessBars,
    weaknesses: w as Elem[],
    res: v.resistanceProfile,
    atk: Math.round(baseAtk * atkMult(level)),
    effectRes: s80?.effectRes ?? 0,
    debuffRes: v.effectResistanceProfile?.values,
    rank,
  }
}

export function buildEnemies(cards: EndgameCard[], level: number): EnemySpec[] {
  const out: EnemySpec[] = []
  for (const c of cards) {
    const spec = enemyAtLevel(c.name, level, c.count ?? 1, c.weaknesses)
    if (spec) out.push(spec)
  }
  return out
}

// ---------------------------------------------------------------- GI helpers

function blocksOf(sec: any): EndgameBlock[] {
  const layouts = sec.layouts
  if (layouts?.length) {
    const cur = layouts.find((l: any) => l.current)
    return (cur ?? layouts[layouts.length - 1]).blocks
  }
  return sec.blocks ?? []
}

function endgameSectionId(mode: EndgameMode, version: string, secId: string): EndgameSection | undefined {
  const ver = data[mode].find((v: any) => v.version === version)
  if (!ver) return undefined
  const sec = (ver.sections ?? []).find((s: any) => s.id === secId)
  if (!sec || !blocksOf(sec).length) return undefined
  return { id: sec.id, title: sec.title ?? '', url: sec.url ?? '', blocks: blocksOf(sec) }
}

export function endgameSections(mode: EndgameMode, version: string): { id: string; title: string }[] {
  const ver = data[mode].find((v: any) => v.version === version)
  if (!ver) return []
  // Metadata-only sections (e.g. Memory Turbulence / PF Cacophony) are not rooms/floors.
  return (ver.sections ?? [])
    .filter((s: any) => (blocksOf(s) as EndgameBlock[]).some(b => b.label === 'Enemies' || b.label.startsWith('Enemies ')))
    .map((s: any) => ({ id: s.id, title: s.title ?? s.id }))
}

export function endgameVersions(mode: EndgameMode): string[] {
  return data[mode].map((v: any) => v.version)
}

/** Archive effect descriptions are display metadata, not proof of executable engine support. */
export function endgameEffects(mode: EndgameMode, version: string): EndgameEffect[] {
  const ver = data[mode].find((v: any) => v.version === version)
  if (!ver) return []
  const meta = (ver.sections ?? []).find((s: any) => {
    const blocks = blocksOf(s) as EndgameBlock[]
    return !blocks.some(b => b.label === 'Enemies' || b.label.startsWith('Enemies ')) &&
      blocks.some(b => !!b.content && b.label !== 'Duration')
  })
  if (!meta) return []
  return (blocksOf(meta) as EndgameBlock[])
    .filter(b => !!b.content && b.label !== 'Duration')
    .map((b, i) => ({
      id: meta.id + ':' + i,
      label: b.label || meta.title || 'Effect',
      description: plainText(b.content!),
      types: b.types,
    }))
}

// ---------------------------------------------------------------- stage assembly

function giList(sec: EndgameSection): string[] {
  return [...(sec.blocks.find(b => b.label === 'General Information')?.list ?? [])]
}

function extract(enemiesBlock: EndgameBlock | undefined): EndgameNode[] {
  if (!enemiesBlock) return []
  if (enemiesBlock.nodes?.length) return enemiesBlock.nodes
  if (enemiesBlock.cards?.length) return [{ label: 'Wave 1', cards: enemiesBlock.cards, types: enemiesBlock.types }]
  return []
}

function parseLevels(gi: string[]): number[] {
  const line = gi.find(x => x.includes('Enemy Levels'))
  if (!line) return []
  const m = line.match(/: ?([\d/]+)/)
  if (!m) return []
  const parts = m[1].split('/').filter(Boolean)
  const lv = parts.map(Number).sort((a, b) => a - b)
  if (lv.length > 2 && lv[lv.length - 1] === lv[0]) return [lv[0]]
  return lv
}

/** one stage per battlable second: MoC/AA sequential Node/Wave groups = waves of one
 *  fight; PF and AS treat each Node as an independent fight (choose a side/boss). */
export function endgameStage(mode: EndgameMode, version: string, secId: string, opts?: { stage?: number }): EndgameStage | undefined {
  const sec = endgameSectionId(mode, version, secId)
  if (!sec) return undefined
  const gi = giList(sec)
  const cycles = parseCycles(gi, mode)
  const levels = parseLevels(gi)
  const objectives = [...(sec.blocks.find(b => b.label === 'Objectives')?.list ?? [])]
  const en = sec.blocks.find(b => b.label === 'Enemies' || b.label.startsWith('Enemies '))
  const nodes = extract(en)
  if (!nodes.length) return undefined // season-trait page (Duration/Effect/Cacophony), not a combat stage

  // AS: boss roster per Node is level-agnostic; level comes from the chosen stage.
  const stagePick = opts?.stage
  const stageLevel = levels.length > 1 && stagePick !== undefined
    ? levels[Math.min(stagePick, levels.length - 1)]
    : levels.length ? levels[levels.length - 1] : 80

  // Keep the variable room count and names from endgame.json. A room contains enemy groups;
  // for MoC, rooms are sequential parts of one stage and share its total cycle budget.
  const rooms: EndgameRoom[] = nodes.map((node, i) => ({
    id: node.label || 'Room ' + (i + 1),
    enemies: buildEnemies(node.cards, stageLevel),
    types: node.types,
  }))

  if (mode === 'MoC') {
    const waves = rooms.map(room => room.enemies)
    return {
      mode, version, id: sec.id, title: sec.title,
      maxCycles: cycles, enemyLevels: levels, objectives, rooms,
      battles: [{ id: sec.title || sec.id, level: stageLevel, waves }],
    }
  }

  if (mode === 'PF' || mode === 'AS') {
    const battles: EndgameBattle[] = rooms.map(room => ({
      id: room.id,
      level: stageLevel,
      waves: [room.enemies],
      types: room.types,
    }))
    return { mode, version, id: sec.id, title: sec.title, maxCycles: cycles, enemyLevels: levels, objectives, rooms, battles }
  }

  // Arbitral Arena retains its mode-specific wave interpretation for now.
  const waves = rooms.map(room => room.enemies)
  return {
    mode, version, id: sec.id, title: sec.title,
    maxCycles: cycles, enemyLevels: levels, objectives, rooms,
    battles: [{ id: rooms[0]?.id ?? 'Stage', level: stageLevel, waves }],
  }
}

function parseCycles(gi: string[], mode: EndgameMode): number | number[] {
  const line = gi.find(x => x.includes('Maximum Cycles'))
  if (!line) return 0
  const m = line.match(/: ?([\d+\s]+)/)
  if (!m) return 0
  const parts = m[1].split('+').map(x => Number(x.trim()))
  const nums = parts.map(Number).filter(n => !isNaN(n))
  if (nums.length === 1) return nums[0]
  // PF-style split "5 + 5" / "5 + 5 + 5" — keep per-wave split
  return nums
}

// ---------------------------------------------------------------- BattleSetup bridge

/** assemble a runnable BattleSetup from an endgame stage: one stage → one fight.
 *  `battle` selects which of the stage's independent fights (PF/AS Node) to run;
 *  MoC/AA have a single fight (all waves sequential). */
export function endgameSetup(
  mode: EndgameMode, version: string, secId: string,
  team: TeamSpec[], opts?: { battle?: number; stage?: number; seed?: number }
): BattleSetup | undefined {
  const st = endgameStage(mode, version, secId, opts)
  if (!st) return undefined
  const b = st.battles[Math.min(opts?.battle ?? 0, st.battles.length - 1)]
  const cycles = Array.isArray(st.maxCycles) ? st.maxCycles.reduce((a, x) => a + x, 0) : st.maxCycles
  return {
    team,
    enemy: b.waves[0][0],
    enemyWaves: b.waves,
    cycles: cycles || 10,
    seed: opts?.seed ?? 1,
    // §59/§61: an endgame run is a real encounter — it carries mode/stage identity and explicit
    // victory/defeat conditions, so the engine resolves §61 encounter events for it.
    encounter: {
      id: `${mode}_${version}_${secId}_${b.id}`,
      mode,
      stageId: secId,
      waves: b.waves,
      cycles: cycles || 10,
      victoryCondition: 'All enemies defeated',
      defeatCondition: 'Team wiped or cycles expired',
    },
  }
}