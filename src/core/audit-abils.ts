// Ability/trace/eidolon audit harness.
// For each implemented kit: what mechanics characters.json says the character has
// (skills, E1-E6, traces, stat_bonus, memosprite) vs static markers found in the
// kit file (eid-gates, buff ids, hit labels, hooks, ponytail notes) vs what actually
// fired in a real battle run (E0/E2/E6) via accounts.bySkill / buffLog / rt fields.
// Run: rtk npx tsx src/core/audit-abils.ts
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { KITS } from './kits'
import { prepareBattle } from './battle'
import { gearForTeam } from './debug-presets'
import type { TeamSpec } from './battle'
import { normElem } from './entities/Unit'

const CHAR_JSON = join(process.cwd(), 'hsr-data', 'characters.json')
const KIT_DIR = join(process.cwd(), 'src', 'core', 'kits')
const OUT_DIR = join(process.cwd(), 'debug', 'audit')

interface WikiSkill {
  id: string
  name: string
  type: string
  type_name: string
  tag: string
  desc: string
}
interface WikiRank {
  num: number
  name: string
  desc: string
}
interface WikiTrace {
  name: string
  desc: string
}
interface WikiChar {
  name: string
  base_type: string
  damage_type: string
  sp_need: number
  skills: WikiSkill[]
  ranks: WikiRank[]
  traces: WikiTrace[]
  statBonus: Array<{ property: string; value: number }>
  memoName?: string
  memoSkills: WikiSkill[]
}
interface KitStatic {
  file: string
  eidGates: number[]
  buffIds: string[]
  labels: string[]
  tankeys: string[]
  hooks: string[]
  ponytails: string[]
  hitCount: number
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^a-z0-9]+/g, '')

const tryRead = (p: string): string | null => {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

// ---------------------------------------------------------------- wiki side
type CharRec = {
  name: string; id: null; base_type: string; damage_type: string; sp_need: number
  skills: Record<string, Omit<WikiSkill, 'id'> & { id: number }>
  ranks: Record<string, { id: number; name: string; desc: string }>
  bonus_abilities: Array<{ name: string; desc: string }>
  stat_bonus: Array<{ property: string; value: number }>
  memosprite?: {
    name: string
    // у мемо-скиллов поля `id` в characters.json НЕТ вообще (только у мейн-скиллов/ranks) —
    // идентификатор лежит в ключе записи, как и у остальных скиллов
    skills: Record<string, { id?: number; name: string; desc: string; type_name: string; tag: string; type: string }>
  }
}
let CHARS: CharRec[] | null = null
// тёзки (в characters.json две записи `name: "March 7th"` — Preservation и The Hunt, `id` у
// всех null) разводятся порядком KITS: первому киту достаётся первая свободная запись с
// тем же именем, следующему — вторая. `march7th` в KITS раньше `march7th_the_hunt`.
const CLAIMED = new Set<CharRec>()
// json не различает формы одного персонажа по имени: у The Hunt запись с именем «March 7th»
// (вторая среди тёзок), тогда как имя кита — «March 7th • The Hunt».
const ALIAS: Record<string, string> = { march7th_the_hunt: 'March 7th' }

function wikiOf(kid: string, name: string): WikiChar | null {
  if (!CHARS) {
    const raw = tryRead(CHAR_JSON)
    if (!raw) return null
    CHARS = JSON.parse(raw) as CharRec[]
  }
  const c = CHARS.find(x => !CLAIMED.has(x) && norm(x.name) === norm(ALIAS[kid] ?? name))
  if (!c) return null
  CLAIMED.add(c)
  const skills = Object.values(c.skills ?? {}).map(s => ({
    id: String(s.id), name: s.name, type: String(s.type), type_name: s.type_name, tag: s.tag, desc: s.desc,
  }))
  const ranks = Object.entries(c.ranks ?? {})
    .map(([k, r]) => ({ num: Number(k), name: r.name, desc: r.desc }))
    .sort((a, b) => a.num - b.num)
  const memo = c.memosprite
  const memoSkills = memo
    ? Object.entries(memo.skills ?? {}).map(([key, s]) => ({
        id: String(s.id ?? key), name: s.name, type: String(s.type), type_name: s.type_name, tag: s.tag, desc: s.desc,
      }))
    : []
  return {
    name: c.name, base_type: c.base_type, damage_type: c.damage_type, sp_need: c.sp_need,
    skills, ranks,
    traces: (c.bonus_abilities ?? []).map(b => ({ name: b.name, desc: b.desc })),
    statBonus: c.stat_bonus ?? [],
    memoName: memo?.name, memoSkills,
  }
}

// ---------------------------------------------------------------- static side
function kitFileOf(kid: string): { src: string; file: string } | null {
  const bare = kid.replace(/[^a-z0-9_]/g, '')
  // export const name may be camelCase (silver_wolf_lv999 -> silverWolfLv999Kit)
  const camel = bare.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
  const primary = new RegExp(`(?:id|export const \\w*(?:${bare}|${camel})Kit|const (?:${bare}|${camel})Kit):\\s*.*'${bare}'`)
  // kits may route the id through a const (const PID = 'kit_id'; id: PID)
  const viaConst = new RegExp(`(?:const\\s+\\w+\\s*=\\s*|id:\\s*)'${bare}'`)
  for (const f of readdirSync(KIT_DIR)) {
    if (!f.endsWith('.ts')) continue
    const src = tryRead(join(KIT_DIR, f))
    if (src && (primary.test(src) || viaConst.test(src))) return { src, file: f }
  }
  return null
}
function staticOf(kid: string, name: string): KitStatic {
  const found = kitFileOf(kid)
  const src = found?.src ?? ''
  const file = found?.file ?? `${name}.ts`
  const eidGates = new Set<number>()
  for (const m of src.matchAll(/\beid\s*>\s*=\s*(\d)/g)) eidGates.add(Number(m[1]))
  for (const m of src.matchAll(/\beidolon[^\n]{0,50}?>\s*=\s*(\d)/g)) eidGates.add(Number(m[1]))
  const buffIds = new Set<string>()
  for (const m of src.matchAll(/id:\s*'([a-z0-9_]+)'/g)) {
    const sid = m[1]
    if (sid !== kid) buffIds.add(sid)
  }
  const labels = new Set<string>()
  for (const m of src.matchAll(/label:\s*'([^']+)'/g)) labels.add(m[1])
  const tankeys = new Set<string>()
  for (const m of src.matchAll(/rt\.([A-Za-z][A-Za-z0-9]*)/g)) tankeys.add(m[1])
  for (const m of src.matchAll(/rt\([^)]*\)\.([A-Za-z][A-Za-z0-9]*)/g)) tankeys.add(m[1])
  const hooks = new Set<string>()
  for (const m of src.matchAll(/^\s{2}(on[A-Za-z]+)\?/gm)) hooks.add(m[1])
  // markers: match inline forms too, not just the dedicated comment style,
  // and keep file:line so the debt registry can be diffed against the code
  const ponytails: string[] = []
  for (const [i, line] of src.split('\n').entries()) {
    if (!/ponytail\s*:/i.test(line)) continue
    const text = line.replace(/^\s*(?:\/\/|\*|\/\*)?\s*/, '').replace(/\*+\/\s*$/, '').trim()
    ponytails.push(`${file}:${i + 1} — ${text}`)
  }
  return {
    file, eidGates: [...eidGates].sort((a, b) => a - b),
    buffIds: [...buffIds], labels: [...labels], tankeys: [...tankeys],
    hooks: [...hooks].sort(), ponytails, hitCount: (src.match(/sim\.hit/g) ?? []).length,
  }
}

// ---------------------------------------------------------------- battle evidence
interface BattleEv {
  accountLabels: string[]
  bufferIds: string[]
  rtKeys: string[]
  fierceness: Record<string, number>
  logE: Set<number>
  logA: Set<number>
  won: boolean
  av: number
}
function battleOf(kid: string, eid: number): BattleEv {
  const team: TeamSpec[] = gearForTeam(kid).map(t => t.kitId === kid ? { ...t, eidolon: eid } : { ...t, eidolon: 0 })
  if (!team.length) return { accountLabels: [], bufferIds: [], rtKeys: [], fierceness: {}, logE: new Set(), logA: new Set(), won: false, av: 0 }
  const sim = prepareBattle({
    team, enemy: { name: 'MoC 12 Boss', count: 3, hp: 1_200_000, spd: 158, level: 95, toughness: 240, weaknesses: ['Fire', 'Quantum', 'Ice', 'Lightning', 'Wind', 'Imaginary', 'Physical'], atk: 1600 },
    cycles: 5, seed: 1234,
  })
  sim.initBattle()
  sim.loop()
  const fierceness: Record<string, number> = {}
  for (const [who, a] of sim.accounts) {
    for (const [sk, v] of Object.entries(a.bySkill)) fierceness[`${who}:${sk}`] = Number(v)
  }
  const logE = new Set<number>()
  const logA = new Set<number>()
  for (const l of sim.logLines) {
    const mE = l.match(/\bE([1-6])\b/)
    const mA = l.match(/\bA([246])\b/)
    if (mE) logE.add(Number(mE[1]))
    if (mA) logA.add(Number(mA[1]))
  }
  return {
    accountLabels: [...sim.accounts.keys()],
    bufferIds: [...new Set(sim.buffLog.map(b => b.id))],
    rtKeys: [...new Set(sim.roster.flatMap(u => Object.keys(sim.rt(u))))],
    fierceness, logE, logA,
    won: sim.allies('enemy').length === 0, av: Math.round(sim.avElapsed),
  }
}

// ---------------------------------------------------------------- report
function matchStatus(wikiName: string, src: string, ev: BattleEv): { static: boolean; battle: string | null } {
  const clean = wikiName.replace(/<\/?unbreak>/g, '')
  const w = clean.toLowerCase()
  let stat = src.toLowerCase().includes(w)
  let b: string | null = Object.entries(ev.fierceness).find(([k]) => k.toLowerCase().includes(w))?.[0] ?? null
  // token-based fallback: drop punctuation, match any 4+ char word of the name
  if (!stat || !b) {
    const toks = w.split(/[^a-z0-9']+/).filter(t => t.length >= 4)
    if (!stat) {
      for (const t of toks) if (src.toLowerCase().includes(t)) { stat = true; break }
    }
    if (!b && toks.length) {
      const all = Object.entries(ev.fierceness)
      for (const t of toks) {
        const hit = all.find(([k]) => k.toLowerCase().includes(t))
        if (hit) { b = hit[0]; break }
      }
    }
  }
  return { static: stat, battle: b }
}

/** wiki skills that are pure out-of-combat / field mechanics — audit N/A */
function isTech(s: WikiSkill): boolean {
  if (s.type_name === 'Technique') return true
  if (/[Mm]aze/.test(s.type_name || s.type)) return true
  if (/Maze/.test(s.type || '')) return true
  return false
}

function report(kid: string, w: WikiChar, st: KitStatic): string[] {
  const out: string[] = []
  const e6 = battleOf(kid, 6)
  const evLine = `battle E6: ${e6.won ? 'WIN' : 'lose'} ${e6.av}AV`
  out.push(`\n======================== ${kid} ========================`)
  out.push(`wiki: ${w.name}  ${w.base_type}/${normElem(w.damage_type)}  SP need ${w.sp_need}`)
  out.push(`stat_bonus: ${w.statBonus.map(s => `${s.property}=${s.value}`).join('  ')}`)
  out.push(`static: ${st.file}  eidGates[${st.eidGates.join(',')}]  hits=${st.hitCount}`)
  out.push(`hooks: ${st.hooks.join(',')}`)
  out.push(evLine)
  // skills
  const src = kitFileOf(kid)?.src ?? ''
  out.push('-- skills --')
  for (const s of w.skills) {
    if (isTech(s)) {
      out.push(`  ${s.type_name || s.type || '?'}\t"${s.name}"\t(N/A out-of-combat)`)
      continue
    }
    const ms = matchStatus(s.name, src, e6)
    const line = `  ${s.type_name || s.type || '?'}\t"${s.name}"\tstatic:${ms.static ? 'Y' : 'N'}`
      + (s.tag ? `\ttag=${s.tag}` : '')
      + (ms.battle ? `\tbattle:${ms.battle}` : '')
    out.push(line)
  }
  if (w.memoName) {
    out.push(`-- memosprite "${w.memoName}" --`)
    for (const s of w.memoSkills) {
      const ms = matchStatus(s.name, src, e6)
      out.push(`  ${s.type_name || '?'}\t"${s.name}"\tstatic:${ms.static ? 'Y' : 'N'}${ms.battle ? `\tbattle:${ms.battle}` : ''}`)
    }
  }
  // eidolons
  out.push('-- eidolons (E1-E6) --')
  for (const r of w.ranks) {
    const gate = st.eidGates.includes(r.num)
    const buff = st.buffIds.some(b => /_e\d$/.test(b) && b.endsWith(`_e${r.num}`))
    const inBattle = e6.logE.has(r.num) || st.buffIds.some(id => id.endsWith(`_e${r.num}`) && e6.bufferIds.includes(id))
    out.push(`  E${r.num}\t"${r.name}"\tgate:${gate ? 'Y' : 'N'}${buff ? '/buff' : ''}${inBattle ? '\tbattle:Y' : ''}`)
    out.push(`      ${r.desc.slice(0, 140)}`)
  }
  // traces
  out.push('-- traces (bonus_abilities) --')
  for (const t of w.traces) {
    const ms = matchStatus(t.name, src, e6)
    const inBattle = e6.logA.size > 0
    out.push(`  "${t.name}"\tstatic:${ms.static ? 'Y' : 'N'}${ms.battle ? `\tbattle:${ms.battle}` : ''}${inBattle ? '\t(A-log seen)' : ''}`)
    out.push(`      ${t.desc.slice(0, 140)}`)
  }
  // eid/buff/rt inventory
  out.push('-- runtime keys seen --')
  out.push(`  ${e6.rtKeys.slice(0, 40).join(', ') || '(none)'}`)
  out.push('-- buff ids (static) --')
  out.push(`  ${st.buffIds.join(', ') || '(none)'}`)
  out.push('-- labels (static) --')
  out.push(`  ${st.labels.join(' | ') || '(no hit labels)'}`)
  out.push('-- battle fierceness (who:skill = dmg) --')
  const fem1 = Object.entries(e6.fierceness).sort((a, b) => b[1] - a[1]).slice(0, 12)
  out.push(`  ${fem1.map(([k, v]) => `${k}=${Math.round(v)}`).join('  ') || '(no dmg accounts)'}`)
  if (st.ponytails.length > 0) {
    out.push(`-- ponytail notes (${st.ponytails.length}) --`)
    for (const p of st.ponytails) out.push(`  ${p}`)
  }
  return out
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true })
  const lines: string[] = []
  const missing: string[] = []
  let withStats = 0
  for (const k of KITS) {
    const w = wikiOf(k.id, k.name)
    if (!w) { missing.push(k.id); continue }
    withStats++
    const st = staticOf(k.id, k.name)
    lines.push(...report(k.id, w, st))
  }
  const fname = join(OUT_DIR, '00_all.txt')
  writeFileSync(fname, lines.join('\n') + '\n', 'utf-8')
  console.log(`audit written: ${fname}  (${lines.length} lines)`)
  console.log(`kits with wiki data: ${withStats}/${KITS.length}`)
  if (missing.length) console.log(`no chars.json entry: ${missing.join(', ')}`)
}

main()