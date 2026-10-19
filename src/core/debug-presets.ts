// Preset sweeps: run each preset kit at E0/E2/E6 with full gear (mains+subs+sets),
// a full 4-character team, 3 enemy targets, and a step-by-step audit log + duration
// tracking dumped to debug/. Run: rtk npx tsx src/core/debug-presets.ts
import { prepareBattle } from './battle'
import type { TeamSpec } from './battle'
import { PRESETS, presetTeams, presetTeamOrder } from './presets'
import { KIT_PATH, kitById } from './kits'
import { eff } from './combat/StatResolver'
import { createAudit } from './audit'
import { roleOf } from './autoai'
import { PLANAR_SETS, RELIC_MAIN_VALUES, RELIC_SETS, SUBSTAT_TIERS, validMain, type GearAggregate } from './gear'
import type { Simulator } from './simulator'
import type { Elem, GearConfig, RelicPiece } from './entities/Unit'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const ELEMS = ['Physical', 'Fire', 'Ice', 'Wind', 'Lightning', 'Quantum', 'Imaginary'] as const
// substat labels in presets map directly to SUBSTAT_TIERS keys (CRIT Rate -> critRate, etc.)
function subKey(label: string): string {
  return SUB_KEYS[label] ?? label
}
const SUB_KEYS: Record<string, string> = {
  'ATK%': 'atkPct', 'DEF%': 'defPct', 'HP%': 'hpPct', 'SPD': 'spd',
  'CRIT Rate': 'critRate', 'CRIT DMG': 'critDmg', 'Effect Hit Rate': 'ehr',
  'Effect RES': 'effRes', 'Break Effect': 'be', 'ATK Flat': 'atkFlat',
  'DEF Flat': 'defFlat', 'HP Flat': 'hpFlat',
}


// ---------------------------------------------------------------------------
// Gear generation: every kit goes through the sheet allocator (sheetSubs), so
// substat layout follows the real relic roll rules. Kits whose workbook block is
// missing get a synthesized one from the preset (see synthBlock).
// ---------------------------------------------------------------------------

// deterministic PRNG (mulberry32) so a kit+relic+planar combo always yields the same gear
function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rngOf(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SUBSTAT_POOL = Object.keys(SUBSTAT_TIERS) as string[]

// build full gear for one kit: 4 cavern + 2 planar pieces with main/substats, sets from preset
// relic/planar override the preset's best-first sets (undefined = preset default)
export function buildGear(kid: string, relic?: string, planar?: string): GearConfig {
  return buildSheetGear(kid, sheetBlockFor(kid) ?? synthBlock(kid), relic, planar)
}

// ---------------------------------------------------------------------------
// Sheet-driven gear (HunterKee "RelicsStats"/Desire allocator).
// `sheet-stats.json` (regenerated: python sheets/HunterKee/dump_stats.py) holds one
// stat-gain block per unit workbook: mains row (body/feet/sphere/rope, cols A-D at
// block+17) and per-stat Desire (col E) = the substat rolls the sheet budgets for.
// Main rules: heads/hands fixed flat mains, 4 variable slots come from the sheet's
// mains row. Substats: exactly the Desire roll counts, distributed per statistically
// realistic piece (a piece may hold at most 4 substat slots, no main-on-main).
// ---------------------------------------------------------------------------

let SHEET_BLOCKS: Array<SheetBlock> | null = null
interface SheetBlock { name: string; mains: string[]; desire: Record<string, number> }
function sheetData(): Array<SheetBlock> {
  if (SHEET_BLOCKS) return SHEET_BLOCKS
  try {
    const raw = JSON.parse(readFileSync('debug/sheet-diff/sheet-stats.json', 'utf8')) as Array<{
      name: string; mains?: string[]; gain?: Record<string, { E?: number | null; D?: number | null }>; desire?: Record<string, number>
    }>
    SHEET_BLOCKS = raw.map(b => {
      const want: Record<string, number> = {}
      for (const [stat, row] of Object.entries(b.gain ?? {})) {
        const e = row?.E
        // E is the sheet's roll count. It is left blank on lines that only carry the
        // two baseline rolls, so fall back to 0 whenever D shows the stat actually rolled.
        if (typeof e === 'number' && e > 0) want[stat] = e
        else if (e == null && (row?.D ?? 0) > 0) want[stat] = 0
      }
      // legacy Boothill block carries its desire as a top-level key, not gain rows
      for (const [stat, e] of Object.entries(b.desire ?? {})) if (e > 0) want[stat] = e
      return { name: b.name, mains: b.mains ?? [], desire: want }
    })
  } catch {
    SHEET_BLOCKS = []
  }
  return SHEET_BLOCKS
}

// sheet substat labels include full names (Effect RES, Break Effect, flat stat keys)
const SHEET_MAIN: Record<string, string> = {
  'CR': 'critRate', 'CD': 'critDmg', 'SPD': 'spd', 'ATK%': 'atkPct', 'HP%': 'hpPct',
  'DEF%': 'defPct', 'EHR%': 'ehr', 'ERR%': 'err', 'BE%': 'be', 'Heal%': 'outHeal',
  'CRIT Rate': 'critRate', 'CRIT DMG': 'critDmg', 'Effect Hit Rate': 'ehr',
  'Outgoing Healing': 'outHeal', 'Break Effect': 'be', 'Energy Regen': 'err',
}
/** sheet block whose block.name == this kit's unit name (workbook home), else undefined */
export function sheetBlockFor(kid: string): SheetBlock | undefined {
  const unit = SHEET_UNIT[kid]
  return sheetData().find(b => b.name === unit)
}
/** the block buildGear actually lays out: the workbook block when it exists, else the
 *  preset-synthesized one. exported so probe-roll-budget.ts can assert the col-E budget
 *  is fully placed on BOTH paths. */
export function blockFor(kid: string): SheetBlock { return sheetBlockFor(kid) ?? synthBlock(kid) }
const SHEET_UNIT: Record<string, string> = {
  aglaea: 'Aglaea', pela: 'Pela', sunday: 'Sunday', gallagher: 'Gallagher', anaxa: 'Anaxa',
  archer: 'Archer', ashveil: 'Ashveil',
  aventurine_waveflair: 'AvenW', mortenax_blade: 'BladeMorty', cyrene: 'Cyrene',
  the_dahlia: 'Dahlia', evanescia: 'Evanescia', evernight: 'Evernight', firefly: 'Firefly',
  hysilens: 'Hysilens', mydei: 'Mydei', phainon: 'Phainon', saber: 'Saber',
  seele: 'Seele', silver_wolf_lv999: 'SW999', sparkle: 'Sparkle', sparxie: 'Sparxie',
  the_herta: 'TheHerta', boothill: 'Boothill',
}

// Synthesized budget: the pre-allocator legacy path gave every kit exactly 25 useful
// rolls, and the real workbook blocks land at 16..24 (Aglaea/Anaxa/Seele top out at
// 24), so 25 sits in the sheet's own range and keeps current numbers.
const SYNTH_BUDGET = 25
/** Sheet block for a kit without a workbook: the preset's 4 variable mains as sheet
 *  labels, and its `subs` list as the Desire budget, split as evenly as possible
 *  (remainder to the earlier = higher-priority entries). Deterministic, no RNG. */
function synthBlock(kid: string): SheetBlock {
  const p = PRESETS[kid]
  const toLabel = (label: string | undefined, fallback: string): string => {
    if (!label) return fallback
    // an elemental DMG main becomes 'DMG%', which buildSheetGear resolves against the kit's elem
    if (ELEMS.some(e => label === `${e} DMG`)) return 'DMG%'
    return SHEET_MAIN[label] ? label : fallback
  }
  const mains = [
    toLabel(p?.main.body, 'ATK%'),
    toLabel(p?.main.foot, 'SPD'),
    toLabel(p?.main.neck, 'DMG%'),
    toLabel(p?.main.object, 'ATK%'),
  ]
  const stats = [...new Set((p?.subs ?? []).map(subKey))].filter(s => s !== 'dmgPct')
  const per = stats.length ? Math.floor(SYNTH_BUDGET / stats.length) : 0
  const extra = SYNTH_BUDGET - per * stats.length
  const desire: Record<string, number> = {}
  stats.forEach((s, i) => { desire[s] = per + (i < extra ? 1 : 0) })
  return { name: kid, mains, desire }
}

/** Lay out the substat rolls of a whole 6-piece set the way the game does.
 *
 * Rules enforced (spec: reference lib/worker/maxima/validator/substatDistributionValidator.ts):
 *  - a +0 piece starts with 3 or 4 lines; +15 adds 5 rolls, but a 3-line start opens its
 *    4th line on the first of them -> 8 rolls (3-start) or 9 (4-start) per piece;
 *  - a set therefore holds 48..54 rolls, and 24 stat lines (6 x 4) is NOT the roll budget;
 *  - no line is empty, so one line tops out at T-3 rolls (5 or 6) and the 4 lines of a
 *    piece always sum to exactly T;
 *  - a substat is never the piece's own main;
 *  - desired stats take exactly the rolls the sheet budgets (col E); the remainder of the
 *    48..54 budget goes to filler stats. Col E is used as-is -- no invented "+2 baseline";
 *  - every roll has its own quality (0 low / 1 mid / 2 high), so a line's value is the sum of
 *    independent rolls, not tier x rolls.
 */
function sheetSubs(rng: () => number, mains: Record<RelicPiece['slot'], string>, desire: Record<string, number>): RelicPiece['subs'][] {
  const slots: RelicPiece['slot'][] = ['head', 'hands', 'body', 'feet', 'sphere', 'rope']
  const fillers = SUBSTAT_POOL.filter(s => s !== 'dmgPct' && s !== 'outHeal' && s !== 'err')
  const total = slots.map(() => (rng() < 0.5 ? 9 : 8))
  const lines: Record<string, number[]>[] = slots.map(() => ({}))
  const used = slots.map(() => 0)
  const cap = (i: number) => total[i] - 3
  const rollsOf = (i: number, stat: string) => lines[i][stat]?.length ?? 0
  const distinct = (i: number) => Object.keys(lines[i]).length
  // reserving one roll per still-empty line is what keeps a piece at 4 lines; it also
  // subsumes the T-3 per-line cap, since the other 3 lines each hold at least 1
  const free = (i: number, stat: string) => mains[slots[i]] !== stat
    && distinct(i) < 4 && used[i] + (4 - distinct(i)) < total[i]
  const add = (i: number, stat: string) => {
    ;(lines[i][stat] ??= []).push(Math.floor(rng() * 3))
    used[i]++
  }

  // most constrained first: a stat that is main-blocked on many slots (e.g. DEF% on an
  // all-DEF% sheet) claims its line slots before stats that are legal everywhere; ties
  // break by budget, and each stat concentrates on as few pieces as the cap allows.
  const want = Object.entries(desire)
    .filter(([s, n]) => n > 0 && fillers.includes(s))
    .map(([s, n]) => {
      let places = 0
      for (let i = 0; i < slots.length; i++) if (mains[slots[i]] !== s) places++
      return { stat: s, n: Math.round(n), places }
    })
    .sort((a, b) => a.places - b.places || b.n - a.n)
  for (const w of want) {
    for (let left = w.n; left > 0; left--) {
      let withStat = -1, newStat = -1
      for (let i = 0; i < slots.length; i++) {
        if (!free(i, w.stat)) continue
        if (lines[i][w.stat] !== undefined) { if (withStat < 0) withStat = i } else if (newStat < 0) newStat = i
      }
      const pick = withStat >= 0 ? withStat : newStat
      // no legal piece left for this stat: the rest of its budget cannot be placed.
      // probe-roll-budget.ts catches this by comparing placed rolls against blockFor().desire
      if (pick < 0) break
      add(pick, w.stat)
    }
  }
  for (let i = 0; i < slots.length; i++) {
    while (distinct(i) < 4) { // a line is never empty at +15
      const open = fillers.filter(s => s !== mains[slots[i]] && !(s in lines[i]))
      if (!open.length) break
      add(i, open[Math.floor(rng() * open.length)])
    }
    while (used[i] < total[i]) { // dump the rest of the piece budget under the T-3 cap
      const open = Object.keys(lines[i]).filter(s => rollsOf(i, s) < cap(i))
      if (!open.length) break
      add(i, open[Math.floor(rng() * open.length)])
    }
  }
  return lines.map(p => Object.entries(p)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([stat, spread]) => ({ stat, spread, tier: spread[0] as 0 | 1 | 2, rolls: spread.length })))
}

function buildSheetGear(kid: string, sheet: SheetBlock, relic?: string, planar?: string): GearConfig {
  const p = PRESETS[kid]
  const elem = kitById(kid)?.elem
  const relicId = relic ?? p?.relic4[0]
  const planarId = planar ?? p?.planar[0]
  const rng = rngOf(hashSeed(`${kid}|${relicId}|${planarId}`))
  const slots: RelicPiece['slot'][] = ['head', 'hands', 'body', 'feet', 'sphere', 'rope']
  const mainOf = (slot: RelicPiece['slot'], i: number): string => {
    if (slot === 'head') return 'hpFlat'
    if (slot === 'hands') return 'atkFlat'
    const label = sheet.mains[i - 2]
    if (label === 'DMG%') return `dmg:${elem}`
    return SHEET_MAIN[label] ?? 'atkPct'
  }
  const mains = {} as Record<RelicPiece['slot'], string>
  slots.forEach((slot, i) => { mains[slot] = mainOf(slot, i) })
  const allSubs = sheetSubs(rng, mains, sheet.desire)
  const pieces: RelicPiece[] = []
  slots.forEach((slot, i) => {
    const main = mains[slot]
    const s: RelicPiece = {
      setId: (slot === 'sphere' || slot === 'rope' ? planarId : relicId) ?? 'none',
      slot, main, subs: allSubs[i], level: 15, quality: 5,
    }
    if (validMain(slot, main)) pieces.push(s)
  })
  if (!pieces.length) pieces.push({ setId: relicId ?? 'none', slot: 'head', main: 'hpFlat', subs: [], level: 15, quality: 5 })
  return { coneId: recCone(kid), pieces }
}

// Cone policy for the sweep ladder: a light cone is ALWAYS equipped.
//   S0  = best-fitting 4★ alternative at max SI (S5, path default);
//   S1+ = preset recommended cone (preset.lc[0]); path-standard 5★ fallback when the preset declares none.
const S4_CONE: Record<string, string> = {
  Abundance: 'shared_feeling', Destruction: 'secret_vow', Elation: 'little_getaway',
  Erudition: 'tapd', Harmony: 'memories_past', Hunt: 'swordplay',
  Nihility: 'gnsw', Preservation: 'day_one', Remembrance: 'victory_blink',
}
const S5_CONE: Record<string, string> = {
  Abundance: 'echo_coffin', Destruction: 'aeon', Elation: 'summer_rides_surf',
  Erudition: 'instant_before_gaze', Harmony: 'past_self_mirror', Hunt: 'cruising',
  Nihility: 'patience', Preservation: 'moment_victory', Remembrance: 'time_woven_gold',
}
/** the fitting 4★ cone for a kit's path (S0 pack) */
export function s0Cone(kid: string): string | undefined { return S4_CONE[KIT_PATH[kid] ?? ''] }
/** the preset's recommended cone, falling back to a path-standard 5★ when the preset declares none */
export function recCone(kid: string): string | undefined {
  return PRESETS[kid]?.lc[0] ?? S5_CONE[KIT_PATH[kid] ?? '']
}

// fill-only kit pool for team completion (keeps teams at exactly 4 characters)
const FILL_ORDER = ['tingyun', 'pela', 'gallagher', 'luocha', 'fuxuan', 'huohuo', 'bronya', 'sparkle', 'sunday', 'march7th', 'lynx', 'yukong', 'guinaifen', 'topaz', 'silverwolf', 'kafka', 'welt', 'himeko', 'jingyuan', 'seele', 'blade', 'jingliu', 'danheng', 'luka', 'fugue', 'aventurine', 'hyacine', 'tribbie', 'cerydra', 'castorice', 'phainon', 'aglaea', 'sparxie', 'silver_wolf_lv999', 'cipher', 'blackswan', 'bailu', 'xueyi', 'hanya', 'misha', 'ruanmei', 'argenti', 'moze', 'acheron', 'robin', 'jade', 'boothill', 'rappa', 'dr_ratio', 'the_herta', 'mydei', 'anaxa', 'hysilens', 'evernight', 'cyrene', 'firefly', 'archer', 'arlan', 'asta', 'clara', 'danhengil', 'danhengperman', 'feixiao', 'gepard', 'gilgamesh', 'herta', 'hook', 'jiaoqiu', 'lingsha', 'natasha', 'qingque', 'rin', 'saber', 'sampo', 'serval', 'yanqing', 'yunli', 'pearl', 'ashveil', 'the_dahlia', 'sushang', 'evanescia', 'mortenax_blade', 'aventurine_waveflair', 'himeko_nova', 'robin_summeretto', 'march7th_the_hunt']

/** exactly 4 characters: preset team (carrier may already sit in it), padded from FILL_ORDER (no dupes).
 *  Every member gets a real buildGear() set — this is the same team the sweep runs, so audit
 *  probes that compare kits must use this, not presetTeam() (set bonuses only, no pieces/cone). */
export function gearForTeam(kitId: string): TeamSpec[] {
  const mates = presetTeamOrder(kitId, presetTeams(kitId)[0] ?? [])
  const used = new Set(mates)
  for (const f of FILL_ORDER) {
    if (mates.length >= 4) break
    if (used.has(f)) continue
    mates.push(f)
    used.add(f)
  }
  const isCarrierDps = roleOf(kitId) === 'dps'
  const team: TeamSpec[] = mates.slice(0, 4).map((m) => ({ kitId: m, gear: buildGear(m), mainDpsId: isCarrierDps && m !== kitId ? kitId : undefined }))
  return team
}

// 3 enemy targets (count=3 spawns 3 copies of MoC 12 boss)
function enemySpec(): { name: string; count: number; hp: number; spd: number; level: number; toughness: number; weaknesses: Elem[]; atk: number } {
  return { name: 'MoC 12 Boss', count: 3, hp: 1_200_000, spd: 158, level: 95, toughness: 240, weaknesses: ['Fire', 'Quantum', 'Ice', 'Lightning', 'Wind', 'Imaginary', 'Physical'], atk: 1600 }
}

function fmtPct(v: number): string { return (v * 100).toFixed(1) + '%' }

function fmtMainVal(main: string): string {
  if (main === 'hpFlat') return 'HP 705'
  if (main === 'atkFlat') return 'ATK 353'
  if (main === 'spd') return 'SPD 25.0'
  if (main.startsWith('dmg:')) return `${main.slice(4)} DMG 38.9%`
  return `${main} ${fmtPct(RELIC_MAIN_VALUES[main] ?? 0)}`
}

const TIER_LABEL = ['lo', 'mid', 'hi'] as const
function subVal(stat: string, tier: number): number {
  return SUBSTAT_TIERS[stat]?.[tier] ?? 0
}
function isNumberStat(stat: string): boolean { return stat === 'spd' || stat.endsWith('Flat') }
function fmtSub(s: { stat: string; tier: 0 | 1 | 2; rolls: number; spread?: number[] }): string {
  if (s.spread) {
    // per-proc values: critRate 3.2%lo +2.9%lo +3.2%hi = 9.3%
    const num = isNumberStat(s.stat)
    const parts = s.spread.map(t => `${num ? subVal(s.stat, t).toFixed(1) : fmtPct(subVal(s.stat, t))}${TIER_LABEL[t]}`)
    const total = s.spread.reduce((a, t) => a + subVal(s.stat, t), 0)
    const totalS = num ? total.toFixed(1) : fmtPct(total)
    return `${s.stat} = ${totalS} (${parts.join(' + ')})`
  }
  const per = subVal(s.stat, s.tier)
  const num = isNumberStat(s.stat)
  return `${s.stat} ×${s.rolls}(${TIER_LABEL[s.tier]}${num ? ` ${per}` : ` ${fmtPct(per)}`}=${num ? (per * s.rolls).toFixed(1) : fmtPct(per * s.rolls)})`
}

function setOrPlanarName(id: string): string {
  return RELIC_SETS.find(r => r.id === id)?.name ?? PLANAR_SETS.find(p => p.id === id)?.name ?? id
}

function gearDesc(g: GearAggregate | undefined): string[] {
  const out: string[] = []
  if (!g) return ['    GEAR: —']
  const cone = g.cone ? `${g.cone.name} (SI ${g.coneSi})` : '—'
  out.push(`    CONE: ${cone}`)
  for (const p of g.pieces ?? []) {
    const set = setOrPlanarName(p.setId)
    const subs = p.subs?.length ? p.subs.map(fmtSub).join(', ') : '—'
    const lvl = p.level !== undefined ? ` L${p.level}` : ''
    const ql = p.quality !== undefined ? `★${p.quality}` : ''
    out.push(`      ${p.slot}: [${set}${lvl}${ql}] ${p.main} (${fmtMainVal(p.main)}) | subs: ${subs}`)
  }
  const sets: string[] = []
  for (const s of g.relicSets4 ?? []) sets.push(`4pc ${s.name}`)
  for (const s of g.relicSets) if (!(g.relicSets4 ?? []).includes(s)) sets.push(`2pc ${s.name}`)
  if (g.planar?.name) sets.push(`[planar] ${g.planar.name}`)
  if (sets.length) out.push(`    SETS: ${sets.join(', ')}`)
  return out
}

// capture ALL allies' effective stats at battle start (after onStart hooks applied).
// reads sim.roster (includes dead) so every char shows regardless of fight outcome.
export function preStats(sim: Simulator): string[] {
  const out: string[] = ['--- PRE-BATTLE STATS ---']
  for (const u of sim.roster.filter(a => a.side === 'ally' && a.kind === 'char')) {
    const e = eff(u)
    out.push(`  [${u.kitId}] ${u.name} E${(sim as any).rt(u).eidolon ?? 0}`)
    out.push(`    HP:${Math.round(e.hp)} ATK:${Math.round(e.atk)} DEF:${Math.round(e.def)} SPD:${e.spd.toFixed(2)}`)
    out.push(`    CR:${fmtPct(e.critRate)} CD:${fmtPct(e.critDmg)} BE:${fmtPct(e.be ?? 0)}`)
    out.push(...gearDesc(sim.gearOf(u)))
  }
  for (const en of sim.roster.filter(a => a.side === 'enemy')) {
    out.push(`  [Enemy] ${en.name} HP:${en.maxHp} DEF:${en.base.def} SPD:${en.base.spd} Tough:${en.maxToughness}`)
  }
  return out
}

// generic runtime snapshot: non-function fields (stacks/counters per kit)
function rtSnapshot(sim: Simulator): string[] {
  const out: string[] = ['--- RUNTIME STATE (per unit, non-function) ---']
  for (const u of sim.allies('ally')) {
    const rt = (sim as any).rt(u)
    const entries = Object.entries(rt).filter(([, v]) => v !== undefined && v !== null && typeof v !== 'function')
    out.push(`  [${u.name}] ${entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`)
  }
  return out
}

function accounts(sim: Simulator): string[] {
  const out: string[] = ['--- DMG ACCOUNTS ---']
  for (const [n, a] of sim.accounts) {
    const parts = Object.entries(a.bySkill).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${Math.round(v)}`)
    out.push(`  ${n}: ${Math.round(a.total)}  [${parts.join('  ')}]`)
  }
  return out
}

function run(kid: string): string[] {
  const out: string[] = []
  out.push(`============ PRESET: ${kid} ============`)
  const p = PRESETS[kid]
  if (!p) { out.push('  NO PRESET'); return out }
  const teamMembers = gearForTeam(kid)
  out.push(`  relic4=${p.relic4[0]} planar=${p.planar[0]} lc=${p.lc[0]} main=${p.main.body}/${p.main.foot}/${p.main.neck}/${p.main.object} subs=${p.subs.join(',')}`)
  out.push(`  TEAM(${teamMembers.length}): ${teamMembers.map(t => t.kitId).join(', ')}  | enemies=${enemySpec().count}`)
  for (const e of [0, 2, 6]) {
    const team = teamMembers.map(t => ({ ...t, eidolon: t.kitId === kid ? e : 0 }))
    const sim = prepareBattle({ team: team as TeamSpec[], enemy: enemySpec(), cycles: 6, seed: 1234 })
    const audit = createAudit(sim)
    // apply battle-start (onStart/gear) hooks first so pre-battle stats reflect real
    // battle values (e.g. Castorice A2 SPD+40%, planar SPD gates), not raw base
    sim.initBattle()
    const pre = preStats(sim)
    sim.loop()
    const won = sim.allies('enemy').length === 0
    out.push(`\n=== E${e} === ${won ? 'WIN' : 'lose'} ${Math.round(sim.avElapsed)}AV`)
    out.push(...pre)
    out.push('--- STEP-BY-STEP AUDIT (STATE + DURATION EVENTS) ---')
    out.push(...audit.flush(sim))
    out.push(...accounts(sim))
    out.push(...rtSnapshot(sim))
  }
  return out
}

function main() {
  const out: string[] = []
  const dir = join(process.cwd(), 'debug')
  mkdirSync(dir, { recursive: true })
  const only = process.env.KIT_ONLY
  const keys = only ? [only] : Object.keys(PRESETS)
  for (const kid of keys) {
    if (!PRESETS[kid]) { console.log(`no preset ${kid}`); continue }
    const r = run(kid)
    out.push(...r)
    const fname = join(dir, `${kid}.txt`)
    writeFileSync(fname, r.join('\n') + '\n', 'utf-8')
    console.log(`${kid} written ${fname}`)
  }
  console.log('\nDone.')
}

if (process.argv[1]?.endsWith('debug-presets.ts')) main()