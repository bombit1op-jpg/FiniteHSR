// Cross-check the HunterKee damage sheet against the sim and against the sim's own
// wiki source (hsr-data/characters.json). Three-way diff: the sheet is an independent
// hand-maintained copy, so a sim-vs-sheet disagreement is either a sheet typo or a
// real sim bug — the wiki column decides which.
//   rtk npx tsx src/core/audit-sheet.ts
import { readFileSync } from 'node:fs'
import { PROG } from './progression'
import { KITS, KIT_PATH } from './kits'

// regenerate: python sheets/HunterKee/hsr_xlsx.py "sheets/HunterKee/<book>.xlsx" --csv sheets/HunterKee/csv
const SHEET = process.env.AUDIT_SHEET ?? 'sheets/HunterKee/CharData.csv'
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** sheet UNIT name -> sim kitId, for every case where they differ */
const ALIAS: Record<string, string> = {
  pmc: 'trailblazer_destruction', danil: 'danhengil', danpt: 'danhengperman',
  fmc: 'trailblazer_preservation', imc: 'trailblazer_harmony', rmc: 'trailblazer_remembrance',
  emc: 'trailblazer_elation', marchh: 'march7th_the_hunt', robins: 'robin_summeretto',
  blademort: 'mortenax_blade', blademorty: 'mortenax_blade', ruanmei: 'ruanmei',
  theherta: 'the_herta', hysilens: 'hysilens', avenw: 'aventurine_waveflair',
  aventurin: 'aventurine', himekonov: 'himeko_nova', himekonova: 'himeko_nova',
  sw999: 'silver_wolf_lv999', pearls: 'pearl', drratio: 'dr_ratio', yaoguang: 'yao_guang',
  dahlia: 'the_dahlia', march: 'march7th', jingyuan: 'jingyuan', blackswan: 'blackswan',
  rin: 'rin', welt: 'welt',
}
/** sheet trace column -> sim StatKey suffix (`dmg` is element-keyed) */
const TRACE: Record<string, string> = {
  'HP%': 'hpPct', 'ATK%': 'atkPct', 'DEF%': 'defPct', CR: 'critRate', CD: 'critDmg',
  'EHR%': 'ehr', 'Effect RES': 'effRes', 'BE%': 'be', 'ERR%': 'err', 'Heal%': 'outHeal', SPD: 'spdFlat',
}
/** wiki stat_bonus property -> sim StatKey */
const WIKI: Record<string, string> = {
  HPAddedRatio: 'hpPct', AttackAddedRatio: 'atkPct', DefenceAddedRatio: 'defPct',
  CriticalChanceBase: 'critRate', CriticalDamageBase: 'critDmg', StatusProbabilityBase: 'ehr',
  StatusResistanceBase: 'effRes', BreakDamageAddedRatioBase: 'be',
  ElationDamageAddedRatioBase: 'elation', SpeedDelta: 'spdFlat',
}
/** the sheet writes Lightning, hsr-data writes Thunder for the same element */
const ELEM: Record<string, string> = { Physical: 'Physical', Fire: 'Fire', Ice: 'Ice', Lightning: 'Lightning', Thunder: 'Lightning', Wind: 'Wind', Quantum: 'Quantum', Imaginary: 'Imaginary' }
const TOL = 0.005 // the sheet rounds traces to 3 decimals (0.144 -> 0.14)

const raw = JSON.parse(readFileSync('hsr-data/characters.json', 'utf8')) as any
const chs: any[] = Array.isArray(raw) ? raw : raw.characters
// several characters appear twice (March 7th, Silver Wolf, Sparxie) and every Trailblazer
// form is `{NICKNAME}` — key on name+path+element, fall back to name-only
const wkey = (c: any): string => `${norm(c.name)}|${c.base_type}|${ELEM[c.damage_type] ?? c.damage_type}`
const byKey = new Map(chs.map(c => [wkey(c), c]))
const byName = new Map<string, any[]>()
for (const c of chs) {
  const k = norm(c.name)
  const list = byName.get(k) ?? []
  list.push(c)
  byName.set(k, list)
}
const pickWiki = (n: string, path: string, el: string): any => byKey.get(`${n}|${path}|${el}`) ?? byName.get(n)?.[0]

/** no consumer reads these — a trace parked under one of them is silently dropped */
const DEAD_STATS = new Set(['res:All'])

// --- sheet ---
const lines = readFileSync(SHEET, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
const split = (l: string): string[] => {
  const out: string[] = []
  let cur = ''
  for (const ch of l) {
    if (ch === '"') { cur += '\u0001'; continue }
    if (ch === ',') { out.push(cur.replace(/\u0001/g, '')); cur = ''; continue }
    cur += ch
  }
  out.push(cur.replace(/\u0001/g, ''))
  return out
}
const cells = lines.map(split)
const col = (r: string[], name: string): number => cells[0].indexOf(name)
const C = Object.fromEntries(['UNIT', 'Element', 'Path', 'BaseHP', 'BaseATK', 'BaseDEF', 'BaseSPD', 'DMG%', 'Energy'].map(k => [k, col(cells[0], k)]))
const num = (s: string | undefined): number => { const v = parseFloat((s ?? '').replace(/"/g, '')); return Number.isFinite(v) ? v : NaN }

const byId = new Map(KITS.map(k => [k.id, k]))
let diffs = 0
const unmatched: string[] = []
const seen = new Set<string>()

for (const r of cells.slice(1)) {
  const name = (r[C.UNIT] ?? '').trim()
  const hp = num(r[C.BaseHP])
  if (!name || !Number.isFinite(hp)) continue // header echo, enemy templates, summon/timer rows
  const n = norm(name)
  if (seen.has(n)) { console.log(`DUP   sheet row repeated: ${name}`); diffs++; continue }
  seen.add(n)
  const id = ALIAS[n] ?? (byId.has(n) ? n : undefined)
  const path = (r[C.Path] ?? '').trim()
  const el = ELEM[(r[C.Element] ?? '').trim()] ?? ''
  // the wiki stores every Trailblazer form as `{NICKNAME}` — resolve it by path+element
  const w = pickWiki(n, path, el) ?? (/^trailblazer_/.test(id ?? '') ? pickWiki('nickname', path, el) : undefined) ??
    (id ? pickWiki(norm(byId.get(id)?.name ?? ''), path, el) : undefined)
  if (!id || !byId.has(id)) { unmatched.push(`sheet "${name}" -> ${id ?? 'NO KIT'}`); continue }
  const kit = byId.get(id)!
  const prog = PROG[id]?.base
  if (!prog) { unmatched.push(`sheet "${name}" -> ${id} (no PROG entry)`); continue }
  const e = el

  const out: string[] = []
  const base = (field: 'hp' | 'atk' | 'def', ci: number): void => {
    const s = num(r[ci]); const p = prog[field] as number; const wv = w?.byLevel?.[80]?.[field]
    if (Math.abs(s - p) > 1) out.push(`${field} sheet=${s} sim=${p} wiki=${wv ?? '?'}`)
  }
  base('hp', C.BaseHP); base('atk', C.BaseATK); base('def', C.BaseDEF)
  const spd = num(r[C.BaseSPD])
  if (Math.abs(spd - prog.spd) > 0.01) out.push(`spd sheet=${spd} sim=${prog.spd} wiki=${w?.byLevel?.[80]?.spd ?? '?'}`)

  // traces: compare every stat any of the three sources mentions
  const simT = new Map<string, number>()
  for (const t of PROG[id].traces ?? []) {
    if (DEAD_STATS.has(t.stat as string)) out.push(`dead trace stat "${t.stat}" (nothing reads it)`)
    simT.set(t.stat as string, t.value)
  }
  const wikiT = new Map<string, number>()
  for (const b of w?.stat_bonus ?? []) {
    const k = WIKI[b.property] ?? (/AddedRatio$/.test(b.property) ? `dmg:${ELEM[b.property.replace('AddedRatio', '')] ?? b.property.replace('AddedRatio', '')}` : b.property)
    wikiT.set(k, b.value)
  }
  const sheetT = new Map<string, number>()
  for (const [colName, key] of Object.entries(TRACE)) {
    const i = col(cells[0], colName)
    const v = num(r[i])
    // the sheet has no Elation column: Elation-path characters park that trace in Heal%
    if (Number.isFinite(v)) sheetT.set(key === 'outHeal' && KIT_PATH[id] === 'Elation' ? 'elation' : key, v)
  }
  const dv = num(r[C['DMG%']])
  if (Number.isFinite(dv) && e) sheetT.set(`dmg:${e}`, dv)
  for (const k of new Set([...sheetT.keys(), ...simT.keys(), ...wikiT.keys()])) {
    const a = sheetT.get(k); const b = simT.get(k); const c = wikiT.get(k)
    const bad = (a !== undefined && b === undefined) || (c !== undefined && b === undefined) ||
      (a !== undefined && b !== undefined && Math.abs(a - b) > TOL) ||
      (b !== undefined && c !== undefined && Math.abs(b - c) > TOL)
    if (bad) out.push(`trace ${k} sheet=${a ?? '-'} sim=${b ?? '-'} wiki=${c ?? '-'}`)
  }

  const en = num(r[C.Energy])
  if (Number.isFinite(en) && en !== kit.energyMax) out.push(`energy sheet=${en} sim=${kit.energyMax} wiki=${w?.sp_need ?? '?'}`)

  if (out.length) { console.log(`\n${id}  (sheet "${name}"${w ? '' : ', NO WIKI MATCH'})`); for (const o of out) console.log('   ' + o); diffs += out.length }
}

console.log(`\n=== ${diffs} field diffs across ${seen.size} sheet characters`)
if (unmatched.length) console.log('unmatched:\n  ' + unmatched.join('\n  '))
const noSheet = KITS.filter(k => ![...seen].some(s => (ALIAS[s] ?? s) === k.id)).map(k => k.id)
console.log(`kits with no sheet row: ${noSheet.length}\n  ${noSheet.join(' ')}`)
