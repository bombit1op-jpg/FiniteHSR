import ENEMIES from '../../../hsr-data/enemies.json'
import type { Elem } from '../entities/Unit'
import type {
  EffectResistanceProfile,
  EnemyDefinition,
  EnemyRank,
  EnemySkillData,
  EnemyStatTable,
  EnemyVariant,
  ResistanceProfile,
  ToughnessModel,
  ToughnessSegment,
} from './types'

/** standard elemental order — must match the raw Damage RES column order and `endgame.ELEMS` */
export const ELEMS: Elem[] = ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary']

export interface RawEnemy {
  title: string
  mode: string
  baseName: string
  url?: string
  infobox?: {
    tier?: string[]
    type?: string[]
    weakness?: string[]
    tough?: string
    faction?: string[]
  }
  damageRes?: { headers?: string[]; values?: string[][] } | null
  debuffRes?: { headers?: string[]; values?: string[][] } | null
  stats?: Record<string, { level?: number; hp?: string; atk?: string; def?: string; spd?: string; ehr?: string; effRes?: string }> | null
  skills?: { name?: string; tag?: string; description?: string }[]
  gameplayNotes?: string
}

const RAW = ENEMIES as RawEnemy[]

export function parseNum(s: unknown): number {
  if (typeof s === 'number') return s
  const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  return m ? Number(m[0]) : 0
}

export function parsePct(s: unknown): number {
  if (s === undefined || s === null || s === '') return 0
  const n = parseNum(String(s).replace('%', ''))
  return String(s).includes('%') ? n / 100 : n
}

function parseStats(raw: RawEnemy['stats']): EnemyStatTable | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: EnemyStatTable = {}
  let any = false
  for (const [k, row] of Object.entries(raw)) {
    const level = Number(row.level ?? k)
    if (!Number.isFinite(level)) continue
    out[level] = {
      level,
      hp: parseNum(row.hp),
      atk: parseNum(row.atk),
      def: parseNum(row.def),
      spd: parseNum(row.spd),
      effectHitRate: parsePct(row.ehr),
      effectRes: parsePct(row.effRes),
    }
    any = true
  }
  return any ? out : undefined
}

function parseResistance(table: RawEnemy['damageRes']): ResistanceProfile {
  const res: ResistanceProfile = {}
  const row = table?.values?.[0]
  if (Array.isArray(row)) {
    ELEMS.forEach((el, i) => {
      const v = row[i]
      if (v !== undefined && v !== null && String(v) !== '0%') res[el] = parsePct(v)
    })
  }
  return res
}

function parseEffectRes(table: RawEnemy['debuffRes']): EffectResistanceProfile | undefined {
  const row = table?.values?.[0]
  if (!Array.isArray(row)) return undefined
  return { headers: Array.isArray(table?.headers) ? table!.headers! : [], values: row.map(parsePct) }
}

const SEG_RE = /(\d+(?:\.\d+)?)(?:\s*[×x]\s*(\d+))?/g
function segmentsIn(chunk: string): ToughnessSegment[] {
  const out: ToughnessSegment[] = []
  const re = new RegExp(SEG_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk))) out.push({ max: Number(m[1]), count: m[2] ? Number(m[2]) : 1 })
  return out
}

/** §52.1 parse the wiki toughness string; phase label follows its segments
 *  ("60 ×3 (Phase 1/2) 36 ×9 (Phase 3)") so chunk[i] belongs to phaseMatches[i]. */
export function parseToughness(s: unknown): ToughnessModel {
  const raw = String(s ?? '').trim()
  // wiki also writes the bar count in brackets after the max ("80 (×10)"); normalize only for
  // parsing, keep `raw` verbatim. Without this the "(×10)" digits parse as a second bare bar.
  const norm = raw.replace(/\(\s*[×x]\s*(\d+)\s*\)/g, ' ×$1')
  const phaseMatches = [...norm.matchAll(/\(Phase[^)]*\)/g)].map(m => m[0].slice(1, -1))
  const chunks = norm.split(/\(Phase[^)]*\)/)
  const phases = phaseMatches.map((phase, i) => ({ phase, segments: segmentsIn(chunks[i] ?? '') }))
  const trailing = segmentsIn(chunks[phaseMatches.length] ?? '')
  const segments = [...phases.flatMap(p => p.segments), ...trailing]
  return {
    raw,
    primary: segments[0]?.max ?? 0,
    segments,
    ...(phases.length ? { phases } : {}),
    unknown: segments.length === 0,
  }
}

export function rankOf(tier0: string | undefined): EnemyRank {
  return tier0 === 'Boss' || tier0 === 'Echo of War' ? 'boss' : tier0 === 'Elite' ? 'elite' : 'mob'
}

function skillsOf(skills: RawEnemy['skills']): EnemySkillData[] {
  return (skills ?? []).map(s => ({ name: s.name ?? '', tag: s.tag ?? '', description: s.description ?? '' }))
}

/** group the 379 raw variant rows into definitions (by `baseName`) + their variants */
export function buildCatalog(): EnemyDefinition[] {
  const defs: EnemyDefinition[] = []
  const byBase = new Map<string, EnemyDefinition>()
  for (const e of RAW) {
    const base = e.baseName || e.title
    let def = byBase.get(base)
    if (!def) {
      def = {
        id: base,
        baseName: base,
        faction: e.infobox?.faction ?? [],
        type: (e.infobox?.type ?? []) as Elem[],
        defaultRank: rankOf(e.infobox?.tier?.[0]),
        weaknesses: (e.infobox?.weakness ?? []) as Elem[],
        resistanceProfile: parseResistance(e.damageRes),
        effectResistanceProfile: parseEffectRes(e.debuffRes),
        baseSkills: skillsOf(e.skills),
        baseToughnessModel: parseToughness(e.infobox?.tough),
        variants: [],
      }
      byBase.set(base, def)
      defs.push(def)
    }
    const variant: EnemyVariant = {
      variantId: e.title,
      title: e.title,
      baseName: base,
      mode: e.mode ?? '',
      url: e.url,
      rank: rankOf(e.infobox?.tier?.[0]),
      stats: parseStats(e.stats),
      weaknesses: (e.infobox?.weakness ?? []) as Elem[],
      resistanceProfile: parseResistance(e.damageRes),
      effectResistanceProfile: parseEffectRes(e.debuffRes),
      toughnessModel: parseToughness(e.infobox?.tough),
      skills: skillsOf(e.skills),
      gameplayNotes: e.gameplayNotes ?? '',
    }
    def.variants.push(variant)
  }
  return defs
}
