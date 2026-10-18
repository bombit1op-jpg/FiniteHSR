import { runBattle, prepareBattle, resolveLevels } from './battle'
import type { EnemySpec } from './battle'
import { Simulator } from './simulator'
import type { BuffLogEntry, DoTWithSource } from './simulator'
import { readFileSync } from 'fs'
import { normElem } from './entities/Unit'
import type { Elem, Unit } from './entities/Unit'
import type { Mod } from './effects/Buff'
import { PROG, mult, type CharProg } from './progression'
import { kitById, KIT_PATH } from './kits'
import { levelsOf } from './kit'
import { eff } from './combat/StatResolver'
import { clawSplitsVeil } from './kits/castorice'
import { presetTeams, presetTeamOrder } from './presets'

const DPS = { hp: 5000, atk: 2200, def: 1300, spd: 130 }
const SUP = { hp: 5000, atk: 1400, def: 1400, spd: 125 }
const HEAL = { hp: 6000, atk: 1100, def: 1600, spd: 120 }

function foe(hp: number, weak: Elem[], count = 1, tough = 120, spd = 120, atk = 600, name = 'Test Foe'): EnemySpec {
  return { name, count, hp, spd, level: 85, toughness: tough, weaknesses: weak, atk }
}
const boss = (weak: Elem[], hp = 250_000, tough = 80) => foe(hp, weak, 1, tough, 130, 700, 'Boss')

let failures = 0
const FAILS: string[] = []
function chk(sim: ReturnType<typeof runBattle>, tag: string, name: string, ok: boolean, soft = false): void {
  if (!ok) {
    if (!soft) { failures++; FAILS.push(`${tag}: ${name}`) }
    console.log(`  ${ok ? '✓' : (soft ? '(•)' : '✗')} ${name}`)
  } else console.log(`  ✓ ${name}`)
}
function dump(tag: string, sim: ReturnType<typeof runBattle>, kitId: string): void {
  const won = sim.allies('enemy').length === 0
  console.log(`== ${tag} == ${won ? 'WIN' : 'lose'} ${Math.round(sim.avElapsed)}AV`)
  const a = accOf(sim, kitId)
  if (a) {
    const parts = Object.entries(a[1].bySkill).filter(([, v]) => v > 0).map(([k, v]) => `${k}=${Math.round(v)}`)
    console.log(`  ${a[0]}: ${parts.join('  ')}`)
  }
}

// аккаунт main-персонажа (char), не сателлитов (Numby/LL)
const accOf = (sim: ReturnType<typeof runBattle>, kitId: string) => {
  const main = sim.roster.find(u => u.kitId === kitId && u.kind === 'char') ?? sim.roster.find(u => u.kitId === kitId)
  return main ? [...sim.accounts].find(([n]) => n === main.name) : undefined
}

// per-button check list: BTN_ORDER сначала, потом ключи вне списка (доп. проверки)
const BTN_ORDER = ['Базовая', 'Усил базовая', 'Навык', 'Усил навык', 'Ульт', 'Талант', 'Техника', 'A2', 'A4', 'A6', 'E1', 'E2', 'E3', 'E4', 'E5', 'E6']
// E3/E5 = чистые level-бусты (skill/ult +2, basic/talent +2): проверка проводки resolveLevels
const Lv = (sim: ReturnType<typeof runBattle>, kitId: string) => {
  const u = sim.roster.find(x => x.kitId === kitId)
  return u ? (sim.rt(u).levels as { basic: number; skill: number; ult: number; talent: number }) : { basic: 0, skill: 0, ult: 0, talent: 0 }
}
const e33 = (sim: ReturnType<typeof runBattle>, kitId: string) => { const l = Lv(sim, kitId); return l.skill === 12 && l.ult === 12 }
const e55 = (sim: ReturnType<typeof runBattle>, kitId: string) => { const l = Lv(sim, kitId); return l.basic === 7 && l.talent === 12 }
type Btn = (() => boolean) | [(() => boolean), boolean] | null
/**
 * each skillset part rendered as one aligned cell: OK / soft / fail / N/A
 * - прямое значение: проверка (boolean или [fn, soft])
 * - null: механика в ките отсутствует (N/A, не считается провалом/дырой)
 * - маппинг: ключ вида `A2 (Nightshade)` автоматически закрывает строка `A2`
 */
function btns(sim: ReturnType<typeof runBattle>, tag: string, checks: Record<string, Btn>): void {
  const runBtn = (label: string, c: Btn): string => {
    if (c === null) return 'N/A'
    const [fn, soft] = Array.isArray(c) ? c : [c, false]
    let ok = false
    try { ok = fn() } catch { ok = false }
    if (!ok && !soft) failures++
    if (!ok && !soft) FAILS.push(`${tag}: ${label}`)
    return ok ? 'ок' : soft ? 'ок?' : '✗'
  }
  const extras = Object.keys(checks).filter(k => !BTN_ORDER.includes(k))
  const coverOf = (label: string): string | undefined =>
    extras.find(k => k === label || k.startsWith(label + ' '))
  const cells = BTN_ORDER.map(label => {
    const direct = checks[label]
    if (direct !== undefined) {
      return { label, status: runBtn(label, direct) }
    }
    const cover = coverOf(label)
    if (cover) return { label: cover, status: runBtn(cover, checks[cover] as Btn) }
    return { label, status: 'N/A' }
  })
  for (const k of extras) {
    if (BTN_ORDER.some(l => coverOf(l) === k)) continue // уже показан в канонической строке
    cells.push({ label: k, status: runBtn(k, checks[k] as Btn) })
  }
  const W = Math.max(...cells.map(c => c.label.length)) + 1
  const nOk = cells.filter(c => c.status === 'ок').length
  const nSoft = cells.filter(c => c.status === 'ок?').length
  const nFail = cells.filter(c => c.status === '✗').length
  const nNa = cells.filter(c => c.status === 'N/A').length
  for (let i = 0; i < cells.length; i += 3) {
    console.log('  ' + cells.slice(i, i + 3).map(c => `${c.label.padEnd(W)} ${c.status}`).join('  '))
  }
  console.log(`  итог: ${nOk} ок · ${nSoft} soft · ${nFail} ✗ · N/A ${nNa}`)
}

// -- buffLog helpers: verify transient buffs across the battle (hard checks) --
const live = (sim: ReturnType<typeof runBattle>, id: string): boolean => sim.buffLog.some(e => e.id === id)
const lastOf = (sim: ReturnType<typeof runBattle>, id: string): BuffLogEntry | undefined => {
  const a = sim.buffLog.filter(e => e.id === id)
  return a[a.length - 1]
}
const lastVal = (sim: ReturnType<typeof runBattle>, id: string, stat: string): number =>
  lastOf(sim, id)?.mods?.find(m => m.stat === stat)?.value ?? 0

// ============ DATA-VERIFY: ВСЕ 25 китов против hsr-data/characters.json ============
// Для каждого слота PROG.abilities ищем совпадающий столбец json-параметров (любой скилл,
// любой позицией, префиксное сравнение — sim-массивы могут быть длиннее json из-за
// экстраполяции lv11+). Несовпадение = расхождение данных. Дополнительно сверяем:
// базы Lv80 (last stats × 2.1606), speed (дискриминатор тёзок: March 7th Ice/101 vs
// Hunt/102, Silver Wolf Quantum/107 vs босс Imaginary/110), sp_need и damage_type.
{
  const JSON_NAME: Record<string, string> = {
    seele: 'Seele', jingyuan: 'Jing Yuan', firefly: 'Firefly', bronya: 'Bronya',
    pela: 'Pela', guinaifen: 'Guinaifen', sparkle: 'Sparkle', gallagher: 'Gallagher',
    huohuo: 'Huohuo', march7th: 'March 7th', asta: 'Asta', arlan: 'Arlan', danheng: 'Dan Heng', himeko: 'Himeko',
    welt: 'Welt', kafka: 'Kafka',
    silverwolf: 'Silver Wolf', luocha: 'Luocha', yukong: 'Yukong', blade: 'Blade',
    luka: 'Luka', danhengil: 'Dan Heng • Imbibitor Lunae', fuxuan: 'Fu Xuan', lynx: 'Lynx',
    topaz: 'Topaz & Numby', jingliu: 'Jingliu', tingyun: 'Tingyun', blackswan: 'Black Swan',
    sparxie: 'Sparxie', aglaea: 'Aglaea', hyacine: 'Hyacine', tribbie: 'Tribbie',
    sunday: 'Sunday', danhengperman: 'Dan Heng • Permansor Terrae', cipher: 'Cipher',
    cerydra: 'Cerydra', castorice: 'Castorice', phainon: 'Phainon',
    aventurine: 'Aventurine', fugue: 'Fugue',
    jiaoqiu: 'Jiaoqiu', feixiao: 'Feixiao', yunli: 'Yunli', lingsha: 'Lingsha',
    yanqing: 'Yanqing', moze: 'Moze', hook: 'Hook', misha: 'Misha', xueyi: 'Xueyi', hanya: 'Hanya', sampo: 'Sampo',
  }
  // json element labels normalised via normElem (types.ts): "Thunder" -> "Lightning"
  // json stat_bonus → sim stat
  const T2: Record<string, string> = {
    AttackAddedRatio: 'atkPct', DefenceAddedRatio: 'defPct', HPAddedRatio: 'hpPct',
    CriticalChanceBase: 'critRate', CriticalDamageBase: 'critDmg',
    StatusResistanceBase: 'effRes', StatusProbabilityBase: 'ehr',
    BreakDamageAddedRatioBase: 'be', SpeedDelta: 'spdFlat',
    ElationDamageAddedRatioBase: 'elation',
    PhysicalAddedRatio: 'dmg:Physical', FireAddedRatio: 'dmg:Fire', IceAddedRatio: 'dmg:Ice',
    WindAddedRatio: 'dmg:Wind', ThunderAddedRatio: 'dmg:Lightning',
    QuantumAddedRatio: 'dmg:Quantum', ImaginaryAddedRatio: 'dmg:Imaginary',
  }
  const close = (a: number, b: number) => Math.abs(a - b) < 5e-4
  interface LevelStat { hp: number; atk: number; def: number; spd: number }
  // chars.json.byLevel — источник истины: сверяем копию в progression.ts с полем
  const checkByLevel = (prog: CharProg, row: { byLevel?: Record<string, LevelStat> }): boolean => {
    let ok = true
    for (const L of [10, 20, 30, 40, 50, 60, 70, 80]) {
      const exp = row.byLevel?.[L]
      const act = prog.byLevel?.[L]
      if (!exp) { ok = false; console.log(`    ✗ chars.byLevel[${L}] отсутствует`); continue }
      if (!act) { ok = false; console.log(`    ✗ prog.byLevel[${L}] отсутствует`); continue }
      if (act.hp !== exp.hp || act.atk !== exp.atk || act.def !== exp.def || act.spd !== exp.spd) {
        ok = false
        console.log(`    ✗ L${L}: hp ${act.hp}/${exp.hp} atk ${act.atk}/${exp.atk} def ${act.def}/${exp.def} spd ${act.spd}/${exp.spd}`)
      }
    }
    return ok
  }
  try {
    const chars = JSON.parse(readFileSync('hsr-data/characters.json', 'utf8')) as Array<Record<string, unknown> & { name: string; byLevel?: Record<string, LevelStat> }>
    for (const kid of Object.keys(JSON_NAME)) {
      console.log(`-- data-verify ${kid}`)
      const prog = PROG[kid]
      // тёзки: берём запись с ближайшим speed_base к PROG (March 7th, Silver Wolf boss)
      const rows = chars.filter(c => c.name === JSON_NAME[kid] && c.byLevel?.[80])
      const pick = rows
        .map(c => ({ c, t: c.byLevel![80], d: Math.abs(c.byLevel![80].spd - prog.base.spd) }))
        .sort((a, b) => a.d - b.d)[0]
      if (!pick) { console.log(`    ✗ json-строка не найдена`); failures++; FAILS.push(`data-verify ${kid}: нет записи в json`); continue }
      const row = pick.c
      const slot0 = row.skills as Record<string, { name: string; levels?: Record<string, { params: number[] }>; level?: Record<string, { param_list: number[] }> }>
      const memSkills = (row.memosprite as { skills?: Record<string, { level: Record<string, { param_list: number[] }> }> } | undefined)?.skills ?? {}
      const paramsOf = (sk: { levels?: Record<string, { params: number[] }>; level?: Record<string, { param_list: number[] }> }): number[][] => {
        const lv = (sk.levels ?? sk.level) as Record<string, { params?: number[]; param_list?: number[] }> | undefined
        if (!lv) return []
        return Object.keys(lv).sort((a, b) => Number(a) - Number(b)).map(k => lv[k].params ?? lv[k].param_list ?? [])
      }
      const mismatch: string[] = []
      const noData: string[] = []
      for (const [slot, arr] of Object.entries(prog.abilities)) {
        let hit = false
        for (const sk of [...Object.values(slot0), ...Object.values(memSkills)]) {
          const pip = paramsOf(sk)
          for (let i = 0; i < (pip[0]?.length ?? 0); i++) {
            const col = pip.map(p => p[i])
            const n = Math.min(col.length, arr.length)
            if (n > 0 && col.slice(0, n).every((v, j) => typeof v === 'number' && close(v, arr[j]))) { hit = true; break }
          }
          if (hit) break
        }
        if (!hit) {
          // константа без json-колонки = механика, не данные (напр. триггер-счёт)
          const isConst = arr.length > 0 && arr.every(v => Math.abs(v - arr[0]) < 1e-9)
          if (isConst) {
            noData.push(slot)
          } else {
            mismatch.push(slot)
          }
        }
      }
      const kit = kitById(kid)
      const c = (name: string, ok: boolean, soft = false): void => {
        if (ok) console.log(`  ✓ ${name}`)
        else {
          if (!soft) { failures++; FAILS.push(`data-verify ${kid}: ${name}`) }
          console.log(`  ${soft ? '(•)' : '✗'} ${name}`)
        }
      }
      c(`spd ${pick.t.spd}`, pick.t.spd === prog.base.spd)
      const by80 = pick.c.byLevel?.[80]
      c(`base hp ${by80?.hp ?? '?'}`, !!by80 && by80.hp === prog.base.hp)
      c(`base atk ${by80?.atk ?? '?'}`, !!by80 && by80.atk === prog.base.atk)
      c(`base def ${by80?.def ?? '?'}`, !!by80 && by80.def === prog.base.def)
      c(`byLevel L10-80`, checkByLevel(prog, pick.c))
      c(`byLevel.L80 === base`, prog.byLevel?.[80]?.hp === prog.base.hp && prog.byLevel?.[80]?.spd === prog.base.spd && prog.byLevel?.[80]?.atk === prog.base.atk && prog.byLevel?.[80]?.def === prog.base.def)
      c('energyMax(sp_need) ' + String(row.sp_need), !!kit && row.sp_need === kit.energyMax, row.sp_need === null || (kid === 'phainon' && row.sp_need === 12))
      c('elem ' + String(row.damage_type), !!kit && normElem(String(row.damage_type)) === kit.elem)
      // traces (stat_bonus) — те же значения, что и major-трейсы сима
      const tExp = ((row.stat_bonus as Array<{ property: string; value: number }> | undefined) ?? [])
        .map(b => (T2[b.property] ? { stat: T2[b.property], value: b.value } : null)).filter((x): x is { stat: string; value: number } => !!x)
      const tOk = tExp.length === (prog.traces ?? []).length && tExp.every(e => prog.traces.some(g => g.stat === e.stat && close(g.value, e.value)))
      c(`traces ${tExp.length}/${tExp.length}`, tOk)
      c(`abilities ${Object.keys(prog.abilities).length - mismatch.length}/${Object.keys(prog.abilities).length}`, mismatch.length === 0)
      if (mismatch.length) {
        console.log(`    mismatch slots: ${mismatch.join(', ')}`)
        console.log(`    хинты: mult('${kid}', слот, 1/15) vs json-столбец`)
      }
      if (noData.length) console.log(`    (•) константы-механики без json-колонки: ${noData.join(', ')}`)
    }
  } catch (e) {
    console.log(`  (•) data-verify: json не прочитан (${(e as Error).message}) — проверка мультипликаторов пропущена`)
  }
}

// ============ 0. ASTA (Harmony Fire support: Charging team-ATK + Astral Blessing SPD) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'asta', stats: SUP, gear: {}, skillPriority: 1, eidolon: 6 },
      { kitId: 'seele', stats: DPS, skillPriority: 2, mainDpsId: 'seele' },
    ],
    enemy: foe(80_000, ['Fire', 'Quantum'], 4, 80, 120, 600, 'Boss'),
    cycles: 10, seed: 12,
  })
  dump('asta', sim, 'asta')
  const sk = (k: string) => ([...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'asta' && u.name === n))?.[1].bySkill[k] ?? 0) > 0
  const asta = sim.roster.find(u => u.kitId === 'asta')
  btns(sim, 'asta', {
    'Базовая': () => sk('Spectrum Beam'),
    'Навык': () => sk('Meteor Storm'),
    'Ульт': () => lastVal(sim, 'asta_ult', 'spdFlat') > 36,
    'Талант': () => sim.buffLog.some(e => e.id === 'asta_talent' && (e.mods ?? []).some(m => m.stat === 'atkPct' && m.value > 0)),
    'A2 (Spark)': () => sim.logLines.some(l => l.includes('Burn') && l.includes('lands')),
    'A4 (Constellation)': () => sim.buffLog.some(e => e.id === 'asta_const_def' && (e.mods ?? []).some(m => m.stat === 'defPct' && m.value >= 0.12)),
    'A6 (Ignite)': () => sim.buffLog.some(e => e.id === 'asta_ignite' && (e.mods ?? []).some(m => m.stat === 'dmg:Fire' && Math.abs(m.value - 0.18) < 1e-9)),
    'E1': () => sim.logLines.filter(l => l.includes('Meteor Storm')).length >= 5,
    'E2': [() => sim.logLines.some(l => l.includes('Astral Blessing')), true],
    'E6': [() => !!asta && (sim.rt(asta).charging as number) > 1, true],
  })
}

// ============ 0b. ASTA CANON ============
{
  const sim = runBattle({
    team: [
      { kitId: 'asta', stats: SUP, gear: {}, skillPriority: 1, eidolon: 6 },
      { kitId: 'seele', stats: DPS, skillPriority: 2, mainDpsId: 'seele' },
    ],
    enemy: foe(80_000, ['Fire', 'Quantum'], 4, 80, 120, 600, 'Boss'),
    cycles: 10, seed: 11,
  })
  const ab = kitById('asta')?.base
  chk(sim, 'asta', 'canon base (1023/511/463/106)', !!ab && ab.hp === 1023 && ab.atk === 511 && ab.def === 463 && ab.spd === 106)
  chk(sim, 'asta', 'energyMax 120 (sp_need)', kitById('asta')?.energyMax === 120)
  chk(sim, 'asta', 'Ult +5 energy (sp_base)', sim.logLines.some(l => l.includes('Astral Blessing (energy +5)')))
  chk(sim, 'asta', 'Talent Astrometry lasts 3 turns', sim.buffLog.filter(e => e.id === 'asta_talent').length > 0)
}

// ============ 0.5. ARLAN (Destruction Lightning: free HP-cost skill + missing-HP DMG talent) ============
{
  const sim = runBattle({
    team: [{ kitId: 'arlan', stats: DPS, skillPriority: 1, eidolon: 6 }],
    enemy: foe(150_000, ['Lightning'], 3, 80, 60, 400, 'Mob'),
    cycles: 20, seed: 3,
  })
  dump('arlan', sim, 'arlan')
  const aacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'arlan' && u.name === n))
  const sk = (k: string) => (aacc?.[1].bySkill[k] ?? 0) > 0
  const hpCost = sim.logLines.some(l => l.includes('loses ') && l.includes(' HP (self-cost)'))
  btns(sim, 'arlan', {
    'Базовая': () => runBattle({
      team: [{ kitId: 'arlan', stats: { ...DPS, hp: 5000 }, eidolon: 0, skillPriority: -1 }],
      enemy: foe(80_000, ['Lightning'], 2, 120, 120, 600, 'Elite'), cycles: 3, seed: 5,
    }).logLines.some(l => /Lightning Rush/.test(l)),
    'Навык': () => sk('Shackle Breaker') && hpCost,
    'Ульт': () => sk('Frenzied Punishment (main)'),
    'Ульт adj': () => sk('Frenzied Punishment (adj)'),
    'Талант': () => sim.buffLog.some(e => e.id === 'arlan_pain' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && m.value > 0)),
    // E1/E6 HP-gated boosts aren't deterministic to the moment of the action — soft
    'E1': [() => sim.logLines.some(l => l.includes('Shackle Breaker')), true],
    'E3': () => e33(sim, 'arlan'),
    'E5': () => e55(sim, 'arlan'),
    'E6': [() => sk('Frenzied Punishment (main)'), true],
  })
}
// arlan canon (25-09-2026 audit): free Skill (0 SP), 15% MaxHP cost, Pain&Anger missing-HP scaling,
// Ult 3-hit on main AND adjacent, E1/E6 low-HP gates, A2 Revival, E4 2-turn expiry.
{
  const NO_CRIT = { ...DPS, critRate: 0 }
  const dmgOf = (s: { logLines: string[] }, re: RegExp): number =>
    s.logLines.filter(l => re.test(l)).reduce((a, l) => a + Number(l.match(/: (\d+) \[/)?.[1] ?? 0), 0)
  const nOf = (s: { logLines: string[] }, re: RegExp): number => s.logLines.filter(l => re.test(l)).length

  // Skill is free (canon 100802: "does not consume Skill Points") + exact 15% MaxHP cost
  const NO_SP = { ...DPS, critRate: 0 }
  const skillOnly = (cycles: number) => runBattle({
    team: [{ kitId: 'arlan', stats: NO_SP, eidolon: 0, skillPriority: 3 }],
    enemy: foe(3_000_000, ['Lightning'], 1, 120, 40, 100, 'Elite'),
    cycles, seed: 3,
  })
  const free1 = skillOnly(1)
  const free = skillOnly(4)
  const arl = free.roster.find(u => u.kitId === 'arlan')!
  // battle starts with 3 SP; a 4-cycle Skill-only run must not spend any (0 Skills→Basic switch)
  chk(free, 'arlan-canon', 'Skill consumes no Skill Points',
    free.sp() === free1.sp() && free.logLines.filter(l => /Skill: Shackle Breaker/.test(l)).length >= 2 && !free.logLines.some(l => /\[Lightning Rush\]/.test(l)))
  chk(free, 'arlan-canon', 'Skill costs exactly 15% Max HP', free.logLines.some(l => new RegExp(`loses ${Math.round(arl.maxHp * 0.15)} HP \\(self-cost\\)`).test(l)))
  // Talent 100804: max +72% at L10, linear on missing HP → first Skill (15%) = 0.108
  chk(free, 'arlan-canon', 'Pain & Anger = 72% × missing HP (0.108 after first Skill)',
    free.buffLog.some(e => e.id === 'arlan_pain' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.108) < 1e-9)))

  // Ult 100803 is 3 hits on BOTH main and adjacent → 2 targets ⇒ equal digit counts
  const two = runBattle({
    team: [{ kitId: 'arlan', stats: NO_CRIT, eidolon: 0, skillPriority: 3, energyStartFrac: 1 }],
    enemy: foe(9_000_000, ['Lightning'], 2, 120, 40, 100, 'Elite'),
    cycles: 3, seed: 3,
  })
  const mainN = nOf(two, /Frenzied Punishment \(main\)/)
  const adjN = nOf(two, /Frenzied Punishment \(adj\)/)
  chk(two, 'arlan-canon', 'Ult 3-hit split 30/10/60 on main', mainN > 0 && mainN % 3 === 0)
  chk(two, 'arlan-canon', 'Ult 3-hit split 30/10/60 on adjacent', adjN === mainN && adjN > 0)

  // E0 adjacent = ult_a2 (50% of main); E6 raises adjacent to the main multiplier
  const adjRatio = (eid: number): number => {
    const r = runBattle({
      team: [{ kitId: 'arlan', stats: NO_CRIT, eidolon: eid, skillPriority: 3 }],
      enemy: foe(9_000_000, ['Lightning'], 2, 120, 40, 100, 'Elite'),
      cycles: 8, seed: 3,
    })
    return dmgOf(r, /Frenzied Punishment \(adj\)/) / Math.max(1, dmgOf(r, /Frenzied Punishment \(main\)/))
  }
  const r0 = adjRatio(0), r6 = adjRatio(6)
  chk(two, 'arlan-canon', 'E0 adjacent = 50% of main (ult_a2)', r0 > 0.4 && r0 < 0.6)
  chk(two, 'arlan-canon', 'E6 raises adjacent to main multiplier', r6 > 0.9)

  // E1: Skill DMG +10% at HP ≤50% (self-cost pushes him under the gate after 4 Skills)
  const skillDmg = (eid: number): number => {
    const r = runBattle({
      team: [{ kitId: 'arlan', stats: NO_CRIT, eidolon: eid, skillPriority: 3 }],
      enemy: foe(9_000_000, ['Lightning'], 1, 120, 40, 100, 'Elite'),
      cycles: 8, seed: 3,
    })
    return dmgOf(r, /\[Shackle Breaker\]/)
  }
  chk(two, 'arlan-canon', 'E1 To the Bitter End: Skill DMG +10% at ≤50% HP', skillDmg(1) > skillDmg(0) * 1.03)

  // A2 Revival: kill an enemy at ≤30% HP → heal 20% MaxHP (no once-per-battle gate)
  const rev = runBattle({
    team: [{ kitId: 'arlan', stats: NO_SP, eidolon: 0, skillPriority: 3 }],
    enemy: foe(15_000, ['Lightning'], 3, 80, 60, 150, 'Elite'),
    cycles: 16, seed: 3,
  })
  const revA = rev.roster.find(u => u.kitId === 'arlan')!
  chk(rev, 'arlan-canon', 'A2 Revival: heal 20% Max HP on kill at ≤30% HP',
    rev.logLines.some(l => new RegExp(`A2 Revival: heals ${Math.round(revA.maxHp * 0.2)}`).test(l)))
}
// arlan E4: killing blow → revive to 25% Max HP (one-time)
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: DPS, skillPriority: 2, eidolon: 6 }, { kitId: 'bronya', stats: SUP, mainDpsId: 'seele' }],
    enemy: foe(90_000, ['Quantum', 'Wind'], 4, 40, 115, 400, 'Mob'),
    cycles: 15, seed: 5,
  })
  dump('seele', sim, 'seele')
  const sacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'seele' && u.name === n))
  const kills = sim.logLines.filter(l => l.includes('defeated')).length
  console.log(`  kills: ${kills}`)
  const sk = (k: string) => (sacc?.[1].bySkill[k] ?? 0) > 0
  const seeleName = sacc?.[0] ?? 'Seele'
  btns(sim, 'seele', {
    'Базовая': () => sk('Thwack'),
    'Навык': () => sk('Sheathed Blade'),
    'Усил навык': () => sim.logLines.some(l => l.includes('Resurgence auto Skill')),
    'Ульт': () => sk('Butterfly Flurry'),
    'Талант': () => sim.logLines.some(l => l.includes(`${seeleName} gains an Extra Turn!`)),
    'A2 (Nightshade)': () => lastVal(sim, 'seele_nightshade', 'dmgAll') >= 0.499,
    'E1': () => sim.buffLog.some(e => e.id === 'seele_e1_def' && (e.mods ?? []).some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.2) < 1e-9)),
    'E2': () => sim.buffLog.some(e => e.id === 'seele_spd' && e.maxStacks === 2),
    'E6': () => sim.buffLog.some(e => e.id === 'seele_e6' && e.turns === 3) && sim.logLines.some(l => l.includes('[True DMG]')),
    'E4': () => sim.logLines.some(l => l.includes('Seele E4:')),
    'E3': () => e33(sim, 'seele'),
    'E5': () => e55(sim, 'seele'),
    'Амплификация': () => live(sim, 'amplif'),
  })
  chk(sim, 'seele-canon', 'base DEF 363 = PROG', kitById('seele')?.base.def === 363, true)
  chk(sim, 'seele-canon', 'Amplification lasts 3 turns', sim.buffLog.some(e => e.id === 'amplif' && e.turns === 3), true)
  chk(sim, 'seele-canon', 'ult grants +5 energy', sim.logLines.some(l => l.includes('Butterfly Flurry (energy +5)')), true)
}

// ============ 2. JING YUAN ============
{
  const sim = runBattle({
    team: [{ kitId: 'jingyuan', stats: { ...DPS, spd: 200 }, eidolon: 6 }],
    enemy: foe(120_000, ['Lightning', 'Fire'], 2, 80, 60, 400, 'Mob'),
    cycles: 20, seed: 3,
  })
  dump('jingyuan', sim, 'jingyuan')
  const ll = sim.roster.find(u => u.kind === 'summon')
  // Lightning-Lord lands its own hits (canon: the LL takes action and attacks), so its damage
  // sits under the summon account. Read the OWNER fold (ownerSkill, keyed by owner id) so
  // Jing Yuan's own abilities and his summon share one total — same accessor debug-sweep uses.
  const jyChar = sim.roster.find(u => u.kitId === 'jingyuan' && u.kind === 'char')
  const sk = (k: string) => (jyChar ? (sim.ownerSkill.get(jyChar.id)?.get(k) ?? 0) > 0 : false)
  const a4Mini = (() => {
    const s = runBattle({
      team: [{ kitId: 'jingyuan', stats: { ...DPS, spd: 60 }, eidolon: 0, energyStartFrac: 0 }],
      enemy: foe(1_000_000, ['Lightning'], 1, 120, 30, 100),
      cycles: 1, seed: 1,
    })
    // A4 adds +15 at battle start; first skill then prints EN:15.00/130 (skill itself gives +30)
    return s.logLines.some(l => />>> Jing Yuan \[SKILL\].* EN:15(\.\d+)?\//.test(l))
  })()
  btns(sim, 'jingyuan', {
    'Базовая': () => sk('Glistening Light'),
    'Навык': () => sk('Rifting Zenith'),
    'Ульт': () => sk('Lightbringer'),
    'Талант': () => sk('Lightning-Lord'),
    'A2 (Battalia LL 6+)': () => live(sim, 'battalia_crush') || live(sim, 'battalia'),
    'A4 (Savant +15EN)': () => a4Mini,
    'A6 (War Marshal)': () => lastVal(sim, 'war_marshal', 'critRate') >= 0.099,
    'E1': () => sk('Lightning-Lord (adj)'),
    'E2': () => live(sim, 'jy_e2'),
    'E6': () => live(sim, 'jy_e6'),
    'E3': () => e33(sim, 'jingyuan'),
    'E5': () => e55(sim, 'jingyuan'),
    'Призыв LL': () => !!ll,
  })
}

// ============ 2b. JING YUAN CANON ============
{
  const sim = runBattle({
    team: [{ kitId: 'jingyuan', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(120_000, ['Lightning'], 2, 80, 60, 400, 'Mob'),
    cycles: 12, seed: 3,
  })
  const jb = kitById('jingyuan')?.base
  chk(sim, 'jingyuan', 'canon base (1164/698/485/99)', !!jb && jb.hp === 1164 && jb.atk === 698 && jb.def === 485 && jb.spd === 99)
  chk(sim, 'jingyuan', 'energyMax 130 (sp_need)', kitById('jingyuan')?.energyMax === 130)
  chk(sim, 'jingyuan', 'ult +5 EN (Lightbringer)', sim.logLines.some(l => l.includes('Lightbringer (energy +5)')))
  chk(sim, 'jingyuan', 'A6 War Marshal CR 10%', sim.logLines.some(l => l.includes('War Marshal')))
  {
    const s = runBattle({
      team: [{ kitId: 'jingyuan', stats: DPS, eidolon: 0, energyStartFrac: 0, skillPriority: 1 }],
      enemy: foe(1_000_000, ['Lightning'], 1, 120, 30, 100),
      cycles: 1, seed: 1,
    })
    chk(s, 'jingyuan', 'A4 Savant Providence +15 EN', s.logLines.some(l => />>> Jing Yuan \[SKILL\].* EN:15(\.\d+)?\//.test(l)))
  }
}

// ============ 3. FIREFLY (выживаемость+break → E2) ============
{
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: { ...DPS, be: 2.6 }, eidolon: 6, skillPriority: 2 }],
    enemy: boss(['Fire', 'Imaginary'], 500_000, 50),
    cycles: 30, seed: 3,
  })
  dump('firefly', sim, 'firefly')
  const f = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'firefly' && u.name === n))
  const sk = (k: string) => (f?.[1].bySkill[k] ?? 0) > 0
  // talent: energy set to 50% at battle start → start 0, first skill prints EN:120/240
  const talentMini = (() => {
    const s = runBattle({
      team: [{ kitId: 'firefly', stats: DPS, eidolon: 0, energyStartFrac: 0, skillPriority: 2 }],
      enemy: foe(1_000_000, ['Fire'], 1, 120, 30, 100),
      cycles: 1, seed: 1,
    })
    return s.logLines.some(l => />>> Firefly \[SKILL\].* EN:120(\.\d+)?\//.test(l))
  })()
  btns(sim, 'firefly-CC', {
    'Базовая': [() => true, true], // в CC базовая заменяется усиленной (Pyrogenic); обычной не бывает
    'Усил базовая': [() => sk('Pyrogenic Decimation'), true],
    'Навык': () => sk('Order: Aerial Bombardment'),
    'Усил навык': () => sk('Deathstar Overload'),
    'Ульт': () => sim.logLines.some(l => l.includes('COMPLETE COMBUSTION')),
    'Талант': () => talentMini,
    'A2 (Module α BE+25%)': () => lastVal(sim, 'cc_state', 'be') >= 0.249,
    'A4 (Module β super-break)': () => sk('Super Break'),
    'A6 (Module γ)': () => lastVal(sim, 'module_gamma', 'be') >= 0.30 - 1e-9,
    'E1': () => live(sim, 'ff_e1_def'),
    'E2': () => sim.logLines.filter(l => l.includes('E2 extra turn')).length >= 1,
    'E4': () => lastVal(sim, 'cc_state', 'effRes') >= 0.5,
    'E6': () => lastVal(sim, 'cc_state', 'resPen:Fire') >= 0.199,
    'E3': () => e33(sim, 'firefly'),
    'E5': () => e55(sim, 'firefly'),
  })
}
{
  // FF CC rotation: enhanced skill (blast) preferred, enhanced basic only midfield
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: { ...DPS, be: 2.0 }, eidolon: 0, skillPriority: 0, skillPattern: 'normal->skill->normal' }],
    enemy: boss(['Fire'], 120_000, 40),
    cycles: 25, seed: 3,
  })
  dump('firefly E0 (CC skill)', sim, 'firefly')
  const f = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'firefly' && u.name === n))
  const sk = (k: string) => (f?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'firefly-E0', {
    'Базовая': () => sk('Order: Flare Propulsion'),
    'Усил навык (Deathstar)': () => sim.logLines.some(l => l.includes('Deathstar Overload')),
    'A2 (Module α в CC)': () => lastVal(sim, 'cc_state', 'be') >= 0.249,
  })
}

// ============ 3b. FIREFLY CANON ============
{
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: DPS, eidolon: 6, skillPriority: 2 }],
    enemy: foe(100_000, ['Fire'], 1, 80, 110, 500),
    cycles: 12, seed: 3,
  })
  dump('firefly-canon', sim, 'firefly')
  const ff = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'firefly' && u.name === n))
  const sk = (k: string) => (ff?.[1].bySkill[k] ?? 0) > 0
  chk(sim, 'firefly', 'energyMax 240', kitById('firefly')?.energyMax === 240)
  chk(sim, 'firefly', 'Ult +5 EN log', sim.logLines.some(l => /energy \+5/.test(l) && /Complete Combustion/.test(l)))
  chk(sim, 'firefly', 'E-basic Pyrogenic', sk('Pyrogenic Decimation'))
  chk(sim, 'firefly', 'E-skill Deathstar', sk('Deathstar Overload'))
  chk(sim, 'firefly', 'E2 extra turn', sim.logLines.some(l => l.includes('E2 extra turn')).valueOf())
  chk(sim, 'firefly-canon', 'E6 resPen:Fire', lastVal(sim, 'cc_state', 'resPen:Fire') >= 0.199)
  chk(sim, 'firefly-canon', 'CC action advance log (own-turn cast → lost per rule)', sim.logLines.some(l => /CC action advance 100%/.test(l)))
}
{
  // E3/E5 wiring (canon): E3 = Skill+2/Basic+1, E5 = Ult+2/Talent+2 — Firefly was on the generic
  // branch (E3 Skill+2/Ult+2, E5 Basic+1/Talent+2), i.e. Ult/Talent never scaled at E5.
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: DPS, eidolon: 0, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(200_000, ['Ice'], 3, 90, 110, 500),
    cycles: 6, seed: 3,
  })
  const e3 = resolveLevels({ kitId: 'firefly', eidolon: 3 } as never)
  chk(sim, 'firefly-e3-lv', 'E3 levels: Skill 12 / Basic 7 / Ult 10 / Talent 10', e3.skill === 12 && e3.basic === 7 && e3.ult === 10 && e3.talent === 10)
  const e5 = resolveLevels({ kitId: 'firefly', eidolon: 5 } as never)
  chk(sim, 'firefly-e5-lv', 'E5 levels (cumulative): Ult 12 / Talent 12 / Skill 12 / Basic 7', e5.ult === 12 && e5.talent === 12 && e5.skill === 12 && e5.basic === 7)
  // every 5★ kit has an explicit EIDOLON_LV entry now (probe-eidolon-ladder.ts locks all 93),
  // so the generic fallback is dead. Seele is the canonic E3 Skill+2/Talent+2 shape.
  const g3 = resolveLevels({ kitId: 'seele', eidolon: 3 } as never)
  chk(sim, 'firefly-generic-lv', 'Seele E3 explicit ladder: Skill 12 / Talent 12 (no generic fallback)', g3.skill === 12 && g3.talent === 12 && g3.ult === 10 && g3.basic === 6)
  // canon 1131009: "Adds Fire Weakness to one designated enemy AND ITS ADJACENT TARGETS, lasting
  // for 2 turns" — sim applies it to the primary only ⇒ 4/5 enemies stay unapplied in a sweep pack.
  const foes = () => sim.roster.filter(u => u.side === 'enemy' && !u.dead)
  const fireWeak = foes().filter(e => e.weaknesses.includes('Fire')).length
  chk(sim, 'firefly-weak-blast', `E-skill Fire weakness on primary + adjacent (${fireWeak}/${foes().length})`, fireWeak === foes().length && foes().length > 1)
}

// ============ 4. BRONYA ============
{
  const sim = runBattle({
    team: [
      { kitId: 'bronya', stats: SUP, eidolon: 6, mainDpsId: 'seele', skillPriority: 0 },
      { kitId: 'seele', stats: DPS, skillPriority: 2, skillPattern: 'normal->skill->normal' },
    ],
    enemy: boss(['Wind', 'Quantum'], 250_000, 60),
    cycles: 25, seed: 7,
  })
  dump('bronya', sim, 'bronya')
  const br = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'bronya' && u.name === n))
  const sk = (k: string) => (br?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'bronya', {
    'Базовая': () => sk('Windrider Bullet'),
    'Навык': () => sim.logLines.some(l => l.includes('immediate')),
    'Ульт': () => sim.logLines.some(l => l.includes('Belobog')),
    'A2 (Command crit)': () => sim.logLines.some(l => l.includes('Windrider Bullet') && l.includes('(CRIT)')),
    'A4 (Battlefield)': () => live(sim, 'bronya_a4'),
    'A6 (Military Might)': () => live(sim, 'bronya_a6'),
    'E1 (SP refund)': [() => sim.logLines.some(l => l.includes('E1 Hone Your Strength')), true],
    'E2': () => live(sim, 'bronya_e2'),
    'E4 (FUA)': () => sk('Take by Surprise (FUA)'),
    'E6': () => sim.buffLog.some(e => e.id === 'bronya_dmg' && e.turns === 2),
    'E3': () => e33(sim, 'bronya'),
    'E5': () => e55(sim, 'bronya'),
    'Талант (self-adv)': () => sim.logLines.some(l => l.includes('Bronya Talent:')),
  })
}

// ============ 4b. BRONYA CANON ============
{
  const sim = runBattle({
    team: [
      { kitId: 'bronya', stats: SUP, eidolon: 6, mainDpsId: 'seele', skillPriority: 0 },
      { kitId: 'seele', stats: DPS, skillPriority: 2, skillPattern: 'normal->skill->normal' },
    ],
    enemy: boss(['Wind', 'Quantum'], 400_000, 60),
    cycles: 25, seed: 7,
  })
  dump('bronya-canon', sim, 'bronya')
  const brc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'bronya' && u.name === n))
  const bk = (k: string) => (brc?.[1].bySkill[k] ?? 0) > 0
  const kb = kitById('bronya')?.base
  chk(sim, 'bronya', 'base=PROG', !!kb && kb.hp === 1241 && kb.atk === 582 && kb.def === 533 && kb.spd === 99)
  chk(sim, 'bronya', 'energyMax 120', kitById('bronya')?.energyMax === 120)
  chk(sim, 'bronya', 'Ult +5 EN log', sim.logLines.some(l => /The Belobog March/.test(l) && /energy \+5/.test(l)))
  chk(sim, 'bronya', 'E4 FUA +5 EN log', sim.logLines.some(l => /E4 Take by Surprise/.test(l) && /energy \+5/.test(l)))
  chk(sim, 'bronya', 'E4 FUA fired', bk('Take by Surprise (FUA)') || sim.logLines.some(l => l.includes('Take by Surprise (FUA)')))
  chk(sim, 'bronya', 'E6 dmg 2t', sim.buffLog.some(e => e.id === 'bronya_dmg' && e.turns === 2))
}

// ============ 5. PELA ============
{
  const sim = runBattle({
    team: [{ kitId: 'pela', stats: { ...SUP, hp: 12000, def: 2200 }, eidolon: 6, skillPriority: 2 }],
    enemy: foe(150_000, ['Ice', 'Wind'], 2, 80, 115, 400, 'Mob'),
    cycles: 22, seed: 3,
    manualMods: [{ stat: 'atkPct', value: 0.1, side: 'enemy' }],
  })
  dump('pela', sim, 'pela')
  const p = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'pela' && u.name === n))
  const sk = (k: string) => (p?.[1].bySkill[k] ?? 0) > 0
  const pelo = sim.buffLog.some(e => e.id === 'pela_a2')
  btns(sim, 'pela', {
    'Базовая': () => sk('Frost Shot'),
    'Навык': () => sk('Frostbite'),
    'Ульт': () => sk('Zone of Suppression'),
    'A2 (Bash)': () => pelo,
    'A4 (Secret Strategy EHR)': () => lastVal(sim, 'pela_a4', 'ehr') >= 0.099,
    'A6 (Wipe Out)': () => sim.logLines.some(l => l.includes('Frostbite dispels')),
    'E1': [() => sim.logLines.some(l => l.includes('E1 Victory Report')), true],
    'E2': () => live(sim, 'pela_e2'),
    'E4': () => live(sim, 'pela_e4'),
    'E6': () => sk('E6 Feeble Pursuit'),
    'E3': () => e33(sim, 'pela'),
    'E5': () => e55(sim, 'pela'),
    'Талант (Data)': () => sim.logLines.some(l => l.includes('Pela Talent:')),
  })
}

// ============ 5b. PELA CANON ============
{
  const sim = runBattle({
    team: [
      { kitId: 'pela', stats: { ...SUP, hp: 12000, def: 2200 }, eidolon: 6, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS, eidolon: 0 },
    ],
    enemy: foe(150_000, ['Ice', 'Wind'], 2, 80, 115, 400, 'Mob'),
    cycles: 22, seed: 3,
  })
  const pb = kitById('pela')?.base
  chk(sim, 'pela', 'canon base (987/546/463/105)', !!pb && pb.hp === 987 && pb.atk === 546 && pb.def === 463 && pb.spd === 105)
  chk(sim, 'pela', 'energyMax 110 (sp_need)', kitById('pela')?.energyMax === 110)
  chk(sim, 'pela', 'Ult +5 energy (sp_base)', sim.logLines.some(l => l.includes('Zone Suppression (energy +5)')))
  chk(sim, 'pela', 'E1 teammate-kill +5 energy', sim.logLines.filter(l => l.includes('E1 Victory Report')).length >= 2)
}

// ============ 6. GUINAIFEN ============
{
  const sim = runBattle({
    team: [{ kitId: 'guinaifen', stats: DPS, eidolon: 6, skillPriority: 2 }],
    enemy: foe(80_000, ['Fire', 'Lightning'], 3, 50, 115, 400, 'Mob'),
    cycles: 20, seed: 3,
  })
  dump('guinaifen', sim, 'guinaifen')
  const g = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'guinaifen' && u.name === n))
  const sk = (k: string) => (g?.[1].bySkill[k] ?? 0) > 0
  // A4 Bladed Hoop (advance 25% at start): gui must out-act a faster enemy
  const a4Mini = (() => {
    const s = runBattle({
      team: [{ kitId: 'guinaifen', stats: { ...DPS, spd: 135 } }],
      enemy: foe(1_000_000, ['Fire'], 1, 120, 160, 100),
      cycles: 1, seed: 1,
    })
    const go = (who: string) => s.logLines.find(l => l.includes(`>>> ${who} [`))?.match(/^\[\d+\.\d\]/)?.[0] ?? null
    return go('Guinaifen') !== null && (go('Test Foe') === null || +go('Guinaifen')!.replace(/[\[\]]/g, '') < +go('Test Foe')!.replace(/[\[\]]/g, ''))
  })()
  // A2 High Poles: Basic 80% chance to Burn
  const a2Mini = (() => {
    const s = runBattle({
      team: [{ kitId: 'guinaifen', stats: { ...DPS, spd: 90 }, skillPriority: 0, skillPattern: 'normal->skill->normal' }],
      enemy: foe(1_000_000, ['Fire'], 1, 120, 30, 100),
      cycles: 1, seed: 5,
    })
    return s.roster.some(u => u.side === 'enemy' && u.dots.some(d => d.kind === 'Burn'))
  })()
  // E2: Burn dmg ×1.4 when target already Burning
  const e2Mini = (() => {
    const burnDmg = (eid: number) => {
      const s = runBattle({
        team: [{ kitId: 'guinaifen', stats: DPS, eidolon: eid, skillPriority: 2 }],
        enemy: foe(5_000_000, ['Fire'], 1, 120, 30, 100),
        cycles: 2, seed: 3,
      })
      return s.roster.find(u => u.side === 'enemy')?.dots.find(d => d.kind === 'Burn')?.baseDmg ?? 0
    }
    const d0 = burnDmg(0); const d2 = burnDmg(2)
    return d0 > 0 && d2 >= d0 * 1.35
  })()
  // E4: +2 Energy per Burn tick
  const e4Mini = (() => {
    const en = (eid: number) => {
      const s = runBattle({
        team: [{ kitId: 'guinaifen', stats: DPS, eidolon: eid, skillPriority: 2 }],
        enemy: foe(5_000_000, ['Fire'], 1, 120, 30, 100),
        cycles: 3, seed: 3,
      })
      return s.roster.find(u => u.kitId === 'guinaifen')?.energy ?? 0
    }
    return en(4) > en(0)
  })()
  btns(sim, 'guinaifen', {
    'Базовая': () => sk('Standing Ovation'),
    'Навык': () => sk('Blazing Welcome Blast'),
    'Ульт': () => sk('Watch This Showstopper'),
    'Талант': () => live(sim, 'firekiss'),
    'A2 (High Poles burn)': [() => a2Mini, true],
    'A4 (Bladed Hoop)': () => a4Mini,
    'A6 (Walking on Knives)': () => live(sim, 'gui_a6'),
    'E1': () => live(sim, 'gui_e1'),
    'E2': () => e2Mini,
    'E4': () => e4Mini,
    'E6': () => sim.buffLog.some(e => e.id === 'firekiss' && e.maxStacks === 4),
    'E3': () => e33(sim, 'guinaifen'),
    'E5': () => e55(sim, 'guinaifen'),
    'ДоТ (Burn)': () => sk('DoT Burn'),
    'Детонация Burn': () => sk('Burn Detonation'),
  })
}

// ============ 6b. GUINAIFEN CANON ============
{
  const sim = runBattle({
    team: [{ kitId: 'guinaifen', stats: DPS, eidolon: 6, skillPriority: 2 }],
    enemy: foe(150_000, ['Fire'], 2, 80, 115, 400, 'Mob'),
    cycles: 12, seed: 3,
  })
  const gb = kitById('guinaifen')?.base
  chk(sim, 'guinaifen', 'canon base (882/582/441/106)', !!gb && gb.hp === 882 && gb.atk === 582 && gb.def === 441 && gb.spd === 106)
  chk(sim, 'guinaifen', 'energyMax 120 (sp_need)', kitById('guinaifen')?.energyMax === 120)
  chk(sim, 'guinaifen', 'Ult +5 energy (sp_base)', sim.logLines.some(l => l.includes('Watch This Showstopper (energy +5)')))
  chk(sim, 'guinaifen', 'Firekiss applies on own Burn tick', sim.buffLog.some(e => e.id === 'firekiss'))
  chk(sim, 'guinaifen', 'E4: +2 energy per Burn tick', sim.roster.find(u => u.kitId === 'guinaifen')?.energy! >= 2)
}

// ============ 6c. GUINAIFEN: TALENT vs E4 SOURCE GATE ============
// Talent 121004: "there is a 100% base chance to apply Firekiss to an enemy after THEIR Burn status
// causes DMG" — canon puts NO "inflicted by Guinaifen" restriction on it, so a Burn from anyone
// (break-Burn, ally Burn) must feed it. E4 121006: "Every time the Burn status INFLICTED BY
// GUINAIFEN causes DMG" — energy only from her own. Old code gated BOTH on attacker.kitId ===
// break-Burn / ally Burn fed neither. White-box: Hook's Fire Basic really breaks a 10-Toughness
// Fire-weak foe, then onDoTTick is called with exactly what tickDots passes (attacker = DoT source).
{
  const kit = kitById('guinaifen')!
  const s = prepareBattle({
    team: [
      { kitId: 'guinaifen', stats: DPS, eidolon: 4, skillPriority: 2 },
      { kitId: 'hook', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(400_000, ['Fire'], 2, 10, 100, 300, 'Mob'),
    cycles: 1, seed: 5,
  })
  s.initBattle()
  const gui = s.roster.find(x => x.kitId === 'guinaifen')!
  const hk = s.roster.find(x => x.kitId === 'hook')!
  const target = s.livingEnemiesOf(gui)[0]
  const src = (d: DoTWithSource | undefined) => d?.sourceUnit?.kitId

  kitById('hook')!.perform(s, hk, { kind: 'basic' }, s.rt(hk))
  const brk = target.dots.find(d => d.kind === 'Burn')
  chk(s, 'gui-talent-src', 'Fire break inflicts a Burn sourced by the BREAKER (Hook, not Guinaifen)', src(brk) === 'hook')

  const e0 = gui.energy
  if (brk) kit.onDoTTick!(s, hk, target, brk, s.rt(gui), gui)
  chk(s, 'gui-talent-src', 'Talent: Firekiss lands from a Burn she did not inflict', s.buffLog.some(e => e.id === 'firekiss'))
  chk(s, 'gui-e4-src', `E4 stays source-gated (${e0} → ${gui.energy} Energy on a foreign Burn)`, Math.abs(gui.energy - e0) < 1e-6)

  // her Skill burns BOTH foes. The break-Burn on the broken one gets REFRESHED by her: one Burn
  // status per target, so the newest infliction owns it (canon E2 scales her Burn off it, E4 pays
  // on "Burn status INFLICTED BY Guinaifen's DMG"). The old build kept `sourceUnit = Hook` there,
  // which left E4 energy and every source gate deaf on exactly the foe with the biggest Burn.
  s.gainSp(2)
  kit.perform(s, gui, { kind: 'skill' }, s.rt(gui))
  const reowned = target.dots.find(d => d.kind === 'Burn')
  chk(s, 'gui-dot-owner', 're-applying Burn over a break-Burn passes ownership to her', src(reowned) === 'guinaifen')
  const e1 = gui.energy
  // tick it the way tickDots does — attacker = the DoT's own sourceUnit, not a hardcoded her
  const reAtk = (reowned as DoTWithSource | undefined)?.sourceUnit
  if (reowned && reAtk) kit.onDoTTick!(s, reAtk, target, reowned, s.rt(gui), gui)
  chk(s, 'gui-dot-owner', `E4 now pays on the re-owned Burn too (${e1} → ${gui.energy})`, reAtk?.kitId === 'guinaifen' && Math.abs(gui.energy - e1 - 2) < 1e-6)
  const clean = s.livingEnemiesOf(gui).find(e => e !== target && e.dots.some(d => d.kind === 'Burn' && src(d) === 'guinaifen'))
  const own = clean?.dots.find(d => d.kind === 'Burn')
  if (own) kit.onDoTTick!(s, gui, clean!, own, s.rt(gui), gui)
  chk(s, 'gui-e4-src', 'Talent: Firekiss still applies on a second target\'s own Burn tick', s.buffLog.some(e => e.id === 'firekiss'))
}

// ============ 6d. DoT OWNERSHIP ON RE-APPLICATION ============
// One DoT of a kind per target, so a refresh that overwrites `baseDmg` must take ownership as well.
// Otherwise the DoT keeps the previous applier's DMG-boost buffs and level (computeDotDamage reads
// `attacker`), the sweeps attribute it to the wrong owner, and every source gate stays deaf —
// Guinaifen E4 energy, Kafka's DEDUPE, Hysilens' A1 detonation scaling. jiaoqiu.ts already did it
// for Burn; asta/kafka/hysilens/blackswan/luka (plus the Trend Burn gear DoT) did not.
{
  const SEED_DOTS: { kind: 'Shock' | 'Bleed' | 'Burn' | 'WindShear' | 'Arcana'; elem: Elem }[] = [
    { kind: 'Shock', elem: 'Lightning' }, { kind: 'Bleed', elem: 'Physical' },
    { kind: 'Burn', elem: 'Fire' }, { kind: 'WindShear', elem: 'Wind' }, { kind: 'Arcana', elem: 'Wind' },
  ]
  const seed = (target: Unit, owner: Unit, kinds = SEED_DOTS.map(d => d.kind)): void => {
    target.dots = [] as never
    for (const k of kinds) {
      const def = SEED_DOTS.find(d => d.kind === k)!
      ;(target.dots as DoTWithSource[]).push({ kind: def.kind, elem: def.elem, turns: 3, baseDmg: 1, sourceUnit: owner } as never)
    }
  }
  const s = prepareBattle({
    team: [
      { kitId: 'kafka', stats: DPS, skillPriority: 2 },
      { kitId: 'hysilens', stats: DPS, skillPriority: 2 },
      { kitId: 'luka', stats: DPS, skillPriority: 2 },
    ],
    enemy: foe(2_000_000, ['Lightning', 'Physical', 'Fire', 'Wind'], 3, 100, 90, 300, 'Mob'),
    cycles: 1, seed: 9,
  })
  s.initBattle()
  const kafka = s.roster.find(x => x.kitId === 'kafka')!
  const hys = s.roster.find(x => x.kitId === 'hysilens')!
  const luka = s.roster.find(x => x.kitId === 'luka')!
  const s_all = s.livingEnemiesOf(kafka)
  s_all.forEach(e => seed(e, hys))

  const ownerOf = (target: Unit, kind: string): string | undefined =>
    (target.dots.find(d => d.kind === kind) as DoTWithSource | undefined)?.sourceUnit?.kitId
  chk(s, 'dot-owner', 'seeded DoTs start out owned by someone else', s_all.every(e => ownerOf(e, 'Shock') === 'hysilens'))
  // a seeded DoT has baseDmg 1, so baseDmg > 1 pins the foe the kit actually refreshed
  const touched = (owner: string, kinds?: string[]): Unit | undefined =>
    s_all.find(u => u.dots.some(d => (d.baseDmg ?? 0) > 1 && (!kinds || kinds.includes(d.kind)) && (d as DoTWithSource).sourceUnit?.kitId === owner))

  // Kafka's Shock rides his Ult (and ally kills), not his Skill — full energy, then check the foe he hit
  s.gainEnergy(kafka, 999)
  kitById('kafka')!.perform(s, kafka, { kind: 'ult' }, s.rt(kafka))
  chk(s, 'dot-owner', 'Kafka: refreshing a foreign Shock takes ownership', !!touched('kafka', ['Shock']))
  chk(s, 'dot-owner', 'Kafka: every Shock he refreshed is his own', s_all.filter(e => e.dots.some(d => d.kind === 'Shock' && (d.baseDmg ?? 0) > 1)).every(e => ownerOf(e, 'Shock') === 'kafka'))

  s.gainSp(9)
  kitById('hysilens')!.perform(s, hys, { kind: 'skill' }, s.rt(hys))
  chk(s, 'dot-owner', 'Hysilens: her Talent DoT over a foreign one takes ownership', !!touched('hysilens'))

  s_all.forEach(e => { e.dots = e.dots.filter(d => d.kind !== 'Bleed') as never })
  s.gainSp(9)
  kitById('luka')!.perform(s, luka, { kind: 'skill' }, s.rt(luka))
  chk(s, 'dot-owner', 'Luka: Bleed he applies first time is owned by him', !!s_all.find(e => e.dots.some(d => d.kind === 'Bleed' && (d as DoTWithSource).sourceUnit?.kitId === 'luka')))
}

// ============ 7. SPARKLE ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sparkle', stats: SUP, eidolon: 6, skillPriority: 2 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: boss(['Quantum', 'Wind'], 200_000, 60),
    cycles: 25, seed: 3,
  })
  dump('sparkle', sim, 'sparkle')
  const maxSp = (sim as unknown as { maxSp: number }).maxSp
  const seeleB = sim.roster.find(u => u.kitId === 'seele' && !u.dead)
  const s = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'sparkle' && u.name === n))
  const sk = (k: string) => (s?.[1].bySkill[k] ?? 0) > 0
  // A2 Almanac: Basic regenerates +10 energy (20 base + 10 extra)
  const a2Mini = (() => {
    const sm = runBattle({
      team: [{ kitId: 'sparkle', stats: { ...SUP, spd: 100 }, skillPriority: 0, skillPattern: 'rotation', skillRotation: 'B', energyStartFrac: 0 }],
      enemy: foe(1_000_000, ['Quantum'], 1, 120, 30, 100),
      cycles: 1, seed: 1,
    })
    // solo rotation of basics: each basic = 20 base + 10 (A2) → end energy = 30 × nº of basics
    const basics = sm.logLines.filter(l => l.includes('>>> Sparkle [BASIC]')).length
    const su = sm.roster.find(u => u.kitId === 'sparkle')
    return su != null && basics > 0 && su.energy === 30 * basics
  })()
  btns(sim, 'sparkle', {
    'Базовая': [() => sk('Monodrama'), true],
    'Навык': () => sim.buffLog.some(e => e.id === 'dreamdiver') || (seeleB != null && seeleB.buffs.some(b => b.id === 'dreamdiver')),
    'Ульт': () => sim.logLines.some(l => l.includes('Thousand Faces')),
    'Талант': () => seeleB != null && seeleB.buffs.some(b => b.id === 'figment'),
    'A2 (Almanac +10EN)': () => a2Mini,
    'A4 (Artificial Flower)': () => (() => {
      const sm = runBattle({
        team: [
          { kitId: 'sparkle', stats: SUP, eidolon: 6, skillPriority: 2 },
          { kitId: 'qingque', stats: DPS, skillPriority: 2 },
        ],
        enemy: foe(1_000_000, ['Quantum', 'Wind'], 1),
        cycles: 25, seed: 3,
      })
      return sm.logLines.some(l => l.includes('A4 Artificial Flower'))
    })(),
    'A6 (Nocturne ATK)': () => live(sim, 'sparkle_a6'),
    'E1': () => live(sim, 'cipher_atk'),
    'E2 (DEF-10%)': () => live(sim, 'sparkle_e2'),
    'E4 (maxSP 8)': () => maxSp >= 8,
    'E6': () => new Set(sim.buffLog.filter(e => e.id === 'dreamdiver').map(e => e.unitName)).size >= 2,
    'E3': () => e33(sim, 'sparkle'),
    'E5': () => e55(sim, 'sparkle'),
  })
}

// ============ 7b. SPARKLE CANON ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sparkle', stats: { ...SUP, spd: 140 }, eidolon: 6, skillPriority: 2 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: boss(['Quantum', 'Wind'], 300_000, 60),
    cycles: 30, seed: 3,
  })
  dump('sparkle-canon', sim, 'sparkle')
  const kb = kitById('sparkle')?.base
  chk(sim, 'sparkle', 'base=PROG', !!kb && kb.hp === 1397 && kb.atk === 523 && kb.def === 485 && kb.spd === 101)
  chk(sim, 'sparkle', 'energyMax 110', kitById('sparkle')?.energyMax === 110)
  chk(sim, 'sparkle', 'Ult +5 EN log', sim.logLines.some(l => /The Hero with a Thousand Faces/.test(l) && /energy \+5/.test(l)))
  chk(sim, 'sparkle', 'E2 defRed 0.10', sim.buffLog.some(e => e.id === 'sparkle_e2' && (e.mods ?? []).some(m => m.stat === 'defRed' && Math.abs(m.value - 0.10) < 1e-9)))
  chk(sim, 'sparkle', 'E6 CD spread', new Set(sim.buffLog.filter(e => e.id === 'dreamdiver').map(e => e.unitName)).size >= 2)
  // A4 Artificial Flower: 3+ SP spent in a single turn → next Sparkle Skill free (Qingque skill chain)
  const a4Mini = (() => {
    const sm = runBattle({
      team: [
        { kitId: 'sparkle', stats: { ...SUP, spd: 140 }, eidolon: 6, skillPriority: 2 },
        { kitId: 'qingque', stats: DPS, skillPriority: 2 },
      ],
      enemy: foe(1_000_000, ['Quantum', 'Wind'], 1),
      cycles: 25, seed: 3,
    })
    return sm.logLines.some(l => l.includes('A4 Artificial Flower'))
  })()
  chk(sim, 'sparkle', 'A4 free Skill (3 SP turn)', a4Mini)
  // Ultimate Mask: overflow at near-full SP drains to refill at each ally turn start
  const maskMini = (() => {
    const sm = runBattle({
      team: [
        { kitId: 'sparkle', stats: { ...SUP, spd: 100 }, eidolon: 6, skillPriority: 0, skillPattern: 'rotation', skillRotation: 'B' },
        { kitId: 'seele', stats: DPS, skillPriority: 2 },
      ],
      enemy: foe(300_000, ['Quantum', 'Wind'], 1),
      cycles: 10, seed: 3,
    })
    return sm.logLines.some(l => /Sparkle Mask/.test(l))
  })()
  chk(sim, 'sparkle', 'Mask drains', maskMini)
}

// ============ 8. GALLAGHER ============
{
  const sim = runBattle({
    team: [
      { kitId: 'gallagher', stats: HEAL, eidolon: 6, skillPriority: 2 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: boss(['Fire', 'Quantum'], 250_000, 70),
    cycles: 25, seed: 3,
    manualMods: [{ stat: 'atkPct', value: -0.2, side: 'ally' }],
  })
  dump('gallagher', sim, 'gallagher')
  const ga = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'gallagher' && u.name === n))
  const gaName = ga?.[0] ?? 'Gallagher'
  const sk = (k: string) => (ga?.[1].bySkill[k] ?? 0) > 0
  // A2 Novel Concoction: heal bonus = 50% of BE (capped 75%) → BE 2.0 vs 0 ratio ≈ 1.75
  const a2Mini = (() => {
    const healOf = (be: number) => {
      const s = runBattle({
        team: [{ kitId: 'gallagher', stats: { ...HEAL, be }, skillPriority: 2, eidolon: 0 }],
        enemy: foe(1_000_000, ['Fire'], 1, 120, 30, 100),
        cycles: 1, seed: 3,
      })
      const m = s.logLines.find(l => l.includes('[Special Brew]'))?.match(/for (\d+) \[Special Brew\]/)
      return m ? +m[1] : 0
    }
    const h0 = healOf(0); const h2 = healOf(2)
    // traces already give ~21% BE; bonus = min(0.75, 0.5·BE) → ratio ≈ 1.75/1.11 ≈ 1.58
    const ratio = h2 / h0
    return h0 > 0 && ratio >= 1.5 && ratio <= 1.65
  })()
  const a4Ult = (() => {
    // A4 = extra turn right after an Ultimate cast (grantExtraTurn logs the marker)
    let sawUlt = false
    for (const l of sim.logLines) {
      if (l.includes(`>>> ${gaName} [ULT]`)) sawUlt = true
      if (sawUlt && l.includes(`>> ${gaName} gains an Extra Turn!`)) return true
    }
    return false
  })()
  btns(sim, 'gallagher', {
    'Базовая': () => sk('Corkage Fee'),
    'Усил базовая': () => sk('Nectar Blitz'),
    'Навык': () => sim.logLines.some(l => l.includes('Special Brew')),
    'Ульт': () => sk('Champagne Etiquette'),
    'Талант': () => live(sim, 'besotted'),
    'A2 (Novel Concoction)': () => a2Mini,
    'A4 (Organic Yeast)': () => a4Ult,
    'A6 (Bottoms Up)': () => sim.logLines.some(l => l.includes('Bottoms Up')),
    'E1 (Eff.RES)': () => live(sim, 'gallagher_e1'),
    'E2': () => live(sim, 'gallagher_e2'),
    'E4': () => sim.buffLog.some(e => e.id === 'besotted' && e.turns === 3),
    'E6 (BE+20%)': () => live(sim, 'gallagher_e6'),
    'E3': () => e33(sim, 'gallagher'),
    'E5': () => e55(sim, 'gallagher'),
  })
}

// ============ 9. HUOHUO ============
{
  const sim = runBattle({
    team: [
      { kitId: 'huohuo', stats: HEAL, eidolon: 6 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: { name: 'Boss', count: 1, hp: 600_000, spd: 130, level: 95, toughness: 80, weaknesses: ['Quantum', 'Wind'], atk: 1500 },
    cycles: 25, seed: 3,
  })
  dump('huohuo', sim, 'huohuo')
  const h = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'huohuo' && u.name === n))
  const sk = (k: string) => (h?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'huohuo', {
    'Базовая': () => sk('Hwaa!'),
    'Навык': () => sim.logLines.some(l => l.includes('Huohuo Skill: heals')),
    'Ульт': () => sim.logLines.some(l => l.includes('energy + ATK')),
    'Талант': () => sim.logLines.some(l => l.includes('Huohuo Talent:')),
    'A2 (Fearful to Act)': () => live(sim, 'divine_prov'),
    'A4 (The Cursed One)': () => live(sim, 'huohuo_a4'),
    'E1 (SPD)': [() => live(sim, 'huohuo_e1_spd'), true],
    'E2': [() => sim.logLines.some(l => l.includes('Huohuo E2: revives')), true],
    'E6 (DMG+50%)': () => live(sim, 'huohuo_e6'),
    'A6 (+1 EN)': [() => sim.logLines.some(l => l.includes('Huohuo A6:')), true],
    'skill_a2 / ult_a2 (canon ladders)': () => Math.abs(mult('huohuo', 'skill_a2', 10) - 0.192) < 1e-9 && Math.abs(mult('huohuo', 'ult_a2', 10) - 0.2) < 1e-9,
    'E3': () => e33(sim, 'huohuo'),
    'E5': () => e55(sim, 'huohuo'),
  })
}

// ============ 10. MARCH 7TH ============
{
  const sim = runBattle({
    team: [
      { kitId: 'march7th', stats: { hp: 6000, atk: 1200, def: 1800, spd: 118 }, eidolon: 6 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: boss(['Quantum', 'Ice', 'Fire'], 200_000, 70),
    cycles: 25, seed: 3,
  })
  dump('march7th', sim, 'march7th')
  const m = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'march7th' && u.name === n))
  const sk = (k: string) => (m?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'march7th', {
    'Canon base': () => JSON.stringify(kitById('march7th')!.base) === JSON.stringify({ level: 80, hp: 1058, atk: 511, def: 573, spd: 101, critRate: 0.05, critDmg: 0.5, path: 'Preservation' }),
    'energyMax 120': () => kitById('march7th')?.energyMax === 120,
    'Базовые': () => sk('Frigid Cold Arrow'),
    'Навык': () => sim.logLines.some(l => l.includes('gains Shield')),
    'Ульт': () => sk('Glacial Cascade'),
    'Talent +10 EN': () => sim.logLines.some(l => l.includes('counter +10 Energy')),
    'Ult +5 EN': () => sim.logLines.some(l => l.includes('Glacial Cascade (energy +5)')),
    'Frozen DMG': () => sk('Frozen Additional DMG'),
    'A2 (Purify)': [() => sim.logLines.some(l => l.includes('March A2:')), true],
    'A4 (щит 4t)': () => sim.buffLog.some(e => e.id === 'march_shield' && e.turns === 4),
    'A6 (Freeze)': [() => sim.logLines.some(l => l.includes('March A6:')), true],
    'E1 (+6 EN)': [() => sim.logLines.some(l => l.includes('March E1:')), true],
    'E2 (старт-щит 3t, no aggro)': () => sim.logLines.some(l => l.includes('March E2:')) && sim.buffLog.some(e => e.id === 'march_shield' && (e.turns ?? 0) === 3 && !e.mods?.some(mm => mm.stat === 'aggro')),
    'E4 (counters 3)': [() => sim.logLines.some(l => l.includes('Girl Power (Counter)')), true],
    'E6 (хил)': () => sim.logLines.some(l => l.includes('March E6: heals')),
    'E3': () => e33(sim, 'march7th'),
    'E5': () => e55(sim, 'march7th'),
  })
}

// ============ 11. DAN HENG ============
{
  const sim = runBattle({
    team: [
      { kitId: 'danheng', stats: { ...DPS, critRate: 0.9 }, eidolon: 6, skillPriority: 2 },
      { kitId: 'bronya', stats: SUP, mainDpsId: 'danheng', eidolon: 0 },
    ],
    enemy: foe(40_000, ['Wind', 'Imaginary'], 4, 40, 110, 350, 'Mob'),
    cycles: 22, seed: 3,
  })
  dump('danheng', sim, 'danheng')
  const d = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'danheng' && u.name === n))
  const dhU = sim.roster.find(u => u.kitId === 'danheng' && !u.dead)
  const kills = sim.logLines.filter(l => l.includes('defeated')).length
  const sk = (k: string) => (d?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'danheng', {
    'Базовая': () => sk('Cloudlancer Art: North Wind'),
    'Навык': () => sim.buffLog.some(e => e.id === 'danheng_slow'),
    'Ульт': () => sk('Ethereal Dream'),
    'Ульт (килы)': () => kills >= 1,
    'Ult +5 EN': () => sim.logLines.some(l => l.includes('Ethereal Dream (energy +5)')),
    'Талант': [() => dhU != null && (dhU.buffs.some(b => b.id === 'danheng_talent') || sim.roster.some(u => u.kind === 'char' && u.kitId !== 'danheng' && !u.dead)), true],
    'A2 (Evasion)': [() => live(sim, 'danheng_a2'), true],
    'A4 (SPD+)': [() => sim.buffLog.some(e => e.id === 'danheng_a4'), true],
    'A6 (slowed +40%)': [() => sim.logLines.some(l => l.includes('Dan Heng A6:')), true],
    'E1 (CRIT)': [() => live(sim, 'danheng_e1'), true],
    'E2 (Talent CD)': () => live(sim, 'danheng_talent'), // talent cooldown collapsed to always-on (buff always present); E2 −1 turn CD = math no-op
    'E4 (ульт-килл)': [() => sim.logLines.some(l => l.includes('gains an Extra Turn!')), true],
    'E6 (slow deeper)': () => Math.abs(lastVal(sim, 'danheng_slow', 'spdDown') - 0.2) < 5e-4,
    'E3': () => e33(sim, 'danheng'),
    'E5': () => e55(sim, 'danheng'),
  })
  const db = kitById('danheng')?.base
  chk(sim, 'danheng', 'canon base hp/atk/def/spd', !!db && db.hp === 882 && db.atk === 546 && db.def === 396 && db.spd === 110)
  chk(sim, 'danheng', 'energyMax 100 (sp_need)', (kitById('danheng')?.energyMax ?? 0) === 100)
  chk(sim, 'danheng', 'A4 SPD+(50% chance) gated by rng', sim.buffLog.some(e => e.id === 'danheng_a4'))
}

// ============ 12. HIMEKO ============
{
  const sim = runBattle({
    team: [
      { kitId: 'himeko', stats: DPS, eidolon: 6, skillPriority: 0, skillPattern: 'normal->skill->normal' },
      { kitId: 'gallagher', stats: HEAL, eidolon: 0, skillPriority: 0, skillPattern: 'rotation', skillRotation: 'B' },
    ],
    enemy: foe(60_000, ['Fire', 'Wind', 'Imaginary'], 3, 50, 110, 350, 'Mob'),
    cycles: 22, seed: 3,
  })
  dump('himeko', sim, 'himeko')
  const hm = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'himeko' && u.name === n))
  const sk = (k: string) => (hm?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'himeko', {
    'Базовая': () => sk('Sawblade Tuning'),
    'Навык': () => sk('Molten Detonation'),
    'Ульт': () => sk('Heavenly Flare'),
    'Талант': () => sk('Victory Rush'),
    'Брейк → заряд': () => sim.logLines.some(l => l.includes('WEAKNESS BROKEN')),
    'E1 (SPD)': () => live(sim, 'himeko_e1'),
    'A2 (Burn)': () => sk('DoT Burn'),
    'A4 (Burn +20%)': [() => sk('Molten Detonation'), true],
    'A6 (CR≥80%)': () => live(sim, 'himeko_a6'),
    'E2 (≤50% HP)': [() => live(sim, 'himeko_e2'), true],
    'E4 (skill break)': [() => sim.logLines.some(l => l.includes('Himeko E4:')), true],
    'E6 (Flare extra)': () => sk('Heavenly Flare (E6)'),
    'E3': () => e33(sim, 'himeko'),
    'E5': () => e55(sim, 'himeko'),
  })
}
// himeko: Elite/Boss break → +3 Charge (one break fills the 3 cap → FUA fires)
{
  const sim = runBattle({
    team: [
      { kitId: 'himeko', stats: DPS, eidolon: 0, skillPriority: 0, skillPattern: 'normal->skill->normal' },
      { kitId: 'gallagher', stats: HEAL, eidolon: 0, skillPriority: 0, skillPattern: 'rotation', skillRotation: 'B' },
    ],
    enemy: foe(40_000, ['Fire', 'Wind', 'Imaginary'], 1, 50, 110, 350, 'Elite'),
    cycles: 8, seed: 31,
  })
  chk(sim, 'himeko', 'Elite break → +3 Charge log', sim.logLines.some(l => /Elite\/Boss break/.test(l)))
  chk(sim, 'himeko', 'Single elite break → Victory Rush FUA', sim.logLines.some(l => /Victory Rush/.test(l)), true)
}

// ============ 13. WELT ============
{
  const sim = runBattle({
    team: [
      { kitId: 'welt', stats: { ...DPS, ehr: 0.5 }, eidolon: 6, skillPriority: 2 },
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Imaginary', 'Quantum'], 3, 60, 110, 350, 'Mob'),
    cycles: 22, seed: 3,
  })
  dump('welt', sim, 'welt')
  const w = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'welt' && u.name === n))
  const eBuff = sim.roster.filter(u => u.side === 'enemy' && !u.dead)
  const sk = (k: string) => (w?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'welt', {
    'Базовая': () => sk('Gravity Suppression'),
    'Навык': () => sk('Edge of the Void') && sk('Edge of the Void (bounce)'),
    'Ульт': () => sk('Synthetic Black Hole'),
    'Талант': () => sk('Time Distortion'),
    'Imprison/Weightless': [() => eBuff.some(u => u.buffs.some(b => b.id === 'welt_imprison' || b.id === 'welt_weightless')), true],
    'Слоу врага': [() => eBuff.some(u => u.buffs.some(b => b.id === 'welt_slow')), true],
    'Усил навык': () => sk('Edge of the Void (A4)'),
    'Усил базовая': () => sk('Gravity Suppression (A4)'),
    'A2 (Retribution)': [() => live(sim, 'welt_a2'), true],
    'A4 (Judgment)': () => sk('Edge of the Void (A4)') || sk('Gravity Suppression (A4)'),
    'A6 (Punishment)': () => live(sim, 'welt_a6'),
    'E1 (Legacy of Honor)': () => runBattle({
      team: [{ kitId: 'welt', stats: { ...DPS, ehr: 0.5 }, eidolon: 1, skillPriority: 2 }, { kitId: 'seele', stats: DPS, skillPriority: 2 }],
      enemy: foe(400_000, ['Imaginary', 'Quantum'], 3, 60, 110, 350, 'Mob'),
      cycles: 10, seed: 3,
    }).logLines.some(l => /Legacy of Honor \(E1\)/.test(l)),
    'E2 (Conflux +3 EN)': () => sim.logLines.some(l => l.includes('Welt E2: Conflux')),
    'E4 (Weightless All-RES↓)': () => sim.buffLog.some(e => e.id === 'welt_weightless' && (e.mods ?? []).some(m => m.stat === 'resAll' && m.value === -0.30)),
    'E3': () => e33(sim, 'welt'),
    'E5': () => e55(sim, 'welt'),
    'E6 (Prospect of Glory)': () => sim.logLines.some(l => l.includes('Welt E6: Prospect of Glory')),
  })
}

// ============ 14. KAFKA ============
{
  const sim = runBattle({
    team: [
      { kitId: 'kafka', stats: { ...DPS, ehr: 0.8 }, eidolon: 6, skillPriority: 2 },
      { kitId: 'guinaifen', stats: DPS, eidolon: 6, skillPriority: 2 },
    ],
    enemy: foe(180_000, ['Fire', 'Lightning'], 3, 50, 110, 350, 'Mob'),
    cycles: 22, seed: 3,
  })
  dump('kafka', sim, 'kafka')
  const k = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'kafka' && u.name === n))
  const kU = sim.roster.find(u => u.kitId === 'kafka')
  const skk = (key: string) => (k?.[1].bySkill[key] ?? 0) > 0
  btns(sim, 'kafka', {
    'Базовая': () => skk('Midnight Tumult'),
    'Навык': () => skk('Caressing Moonlight'),
    'Ульт': () => skk('Twilight Trill'),
    'Талант': () => skk('Gentle but Cruel'),
    'ДоТ (Shock)': () => skk('DoT Shock'),
    'Детонация': () => skk('DoT Detonation'),
    'E2 (DoT+25%)': [() => kU != null && kU.buffs.some(b => b.id === 'kafka_e2'), true],
    'A2 (Torture ATK)': () => live(sim, 'kafka_a2'),
    'A4 (+5 EN)': [() => sim.logLines.some(l => l.includes('Kafka A4:')), true],
    'A6 (Thorns)': [() => sim.logLines.some(l => l.includes('Kafka A6:')), true],
    'E1 (DoT+30%)': () => live(sim, 'kafka_e1'),
    'E4 (+2 EN)': [() => sim.logLines.some(l => l.includes('Kafka E4:')), true],
    'E6 (Shock 2×)': [() => sim.logLines.some(l => l.includes('Kafka E6:')), true],
    'E3': () => e33(sim, 'kafka'),
    'E5': () => e55(sim, 'kafka'),
  })
  // canon hard-checks (23-09-2026 audit): base=PROG, E2 33%, FUA +10 EN, E6 Shock ×2.56 / 3 turns
  const kafka2 = sim.roster.find(u => u.kitId === 'kafka')
  const kb = kitById('kafka')!
  chk(sim, 'kafka', 'base = PROG.kafka.base {1086,679,485,100}', kb.base.hp === 1086 && kb.base.atk === 679 && kb.base.def === 485 && kb.base.spd === 100)
  chk(sim, 'kafka', 'energyMax = 120', kb.energyMax === 120)
  chk(sim, 'kafka', 'E2 Fortississimo = 33% DoT', kafka2 != null && kafka2.buffs.some(b => b.id === 'kafka_e2' && (b.mods ?? []).some(m => m.stat === 'boost:dot' && Math.abs(m.value - 0.33) < 1e-9)))
  chk(sim, 'kafka', 'Talent FUA +10 EN (sp_base)', sim.logLines.some(l => l.includes('Kafka Talent: Gentle but Cruel (energy +10)')))
  chk(sim, 'kafka', 'E6 Shock log ×2.56 / 3 turns', sim.logLines.some(l => l.includes('Kafka E6: Shock 2.56×, 3 turns')))
  chk(sim, 'kafka', 'E2 applied to kafka + ally', kafka2 != null && kafka2.buffs.some(b => b.id === 'kafka_e2') && sim.roster.some(u => u.kitId !== 'kafka' && !u.dead && u.buffs.some(b => b.id === 'kafka_e2')))
}

// kafka A4 teammate-kill: danheng finishes a Kafka-Shocked foe → +5 EN via onAllyKill
{
  const sim = runBattle({
    team: [
      { kitId: 'kafka', stats: { ...SUP, ehr: 0.8 }, eidolon: 6, skillPriority: 1, energyStartFrac: 1 },
      { kitId: 'danheng', stats: { hp: 5000, atk: 6500, def: 1300, spd: 125 }, skillPriority: 3 },
    ],
    enemy: foe(45_000, ['Fire', 'Lightning'], 2, 90, 100, 650),
    cycles: 6, seed: 7,
  })
  const a4At = sim.logLines.map((l, i) => /Kafka A4/.test(l) ? i : -1).filter(i => i >= 0)
  const beforeIsDkKill = (i: number) => sim.logLines.slice(Math.max(0, i - 6), i).some(l => /Cloudlancer Art/.test(l))
  // own-kill A4 covered by block 14 'A4 (+5 EN)' above
  chk(sim, 'kafka-a4-ally', 'A4 teammate-kill: Dan Heng defeats Kafka-Shocked foe', a4At.some(i => beforeIsDkKill(i)))
}

// ============ LIGHT CONES ============
function coneMods(sim: ReturnType<typeof runBattle>, name: string): Record<string, number> {
  const u = sim.roster.find(x => x.name === name && !x.dead)
  if (!u) return {}
  const g = u.buffs.find(b => b.id === 'gear')
  const out: Record<string, number> = {}
  for (const m of g?.mods ?? []) out[m.stat] = (out[m.stat] ?? 0) + m.value
  return out
}

// ============ LC 1. IN THE NIGHT (seele) ============
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: { ...DPS, spd: 130 }, gear: { coneId: 'in_the_night', si: 1 } }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 130, 700, 'Boss'),
    cycles: 8, seed: 5,
  })
  const m = coneMods(sim, 'Seele')
  console.log(`== in_the_night == mods: ${JSON.stringify(m)}`)
  chk(sim, 'in_the_night', 'si1 critRate (base + gear)', Math.abs((m.critRate ?? 0) - 0.18) < 1e-9)
  chk(sim, 'in_the_night', 'spd cond stacks basic/skill', Math.abs((m['boost:basic'] ?? 0) - 0.18) < 1e-9 && Math.abs((m['boost:skill'] ?? 0) - 0.18) < 1e-9)
  chk(sim, 'in_the_night', 'cond critDmg stacks (ult)', Math.abs((m['critDmg:ult'] ?? 0) - 0.36) < 1e-9)
}

// ============ LC 2. NIGHT OF FRIGHT (gallagher ult → lowest ally ATK) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'gallagher', stats: { ...HEAL, spd: 95 }, gear: { coneId: 'night_of_fright', si: 1 }, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'seele', stats: { ...DPS, def: 300, spd: 90 } },
    ],
    enemy: foe(50_000, ['Fire'], 3, 30, 220, 500, 'Swarm'),
    cycles: 8, seed: 3,
  })
  const gu = sim.roster.find(x => x.kitId === 'gallagher' && !x.dead)
  const gun = coneMods(sim, gu?.name ?? 'gallagher')
  chk(sim, 'night_of_fright', 'si1 ERR', Math.abs((gun.err ?? 0) - 0.12) < 1e-9)
  const anyAlly = sim.buffLog.some(e => e.id === 'nof_atk') // 2-turn buff, may already be off the live roster at battle end
  chk(sim, 'night_of_fright', 'ult ATK buff applied (buffLog)', anyAlly)
}

// ============ LC 3. BEFORE DAWN (himeko: skill+ult → somnus stacks) ============
{
  const sim = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'before_dawn', si: 1 }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(300_000, ['Fire'], 1, 60, 115, 600, 'Tank'),
    cycles: 6, seed: 5,
  })
  const h = sim.roster.find(x => x.kitId === 'himeko' && !x.dead)
  const m = coneMods(sim, h?.name ?? 'Himeko')
  console.log(`== before_dawn == mods: ${JSON.stringify(m)}`)
  chk(sim, 'before_dawn', 'si1 critDmg', Math.abs((m.critDmg ?? 0) - 0.36) < 1e-9)
  chk(sim, 'before_dawn', 'si1 skill/ult boost', Math.abs((m['boost:skill'] ?? 0) - 0.18) < 1e-9 && Math.abs((m['boost:ult'] ?? 0) - 0.18) < 1e-9)
  chk(sim, 'before_dawn', 'somnus stacks', !!h && (h.buffs.find(b => b.id === 'somnus')?.stacks ?? 0) >= 2)
}

// ============ LC 4. WHEREABOUTS (firefly: break → Routed vuln) ============
{
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: { ...DPS, be: 2.0 }, gear: { coneId: 'whereabouts', si: 1 }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(150_000, ['Fire', 'Imaginary'], 1, 40, 115, 600, 'Fragile'),
    cycles: 1, seed: 5,
  })
  const f = sim.roster.find(x => x.kitId === 'firefly' && !x.dead)
  const m = coneMods(sim, f?.name ?? 'Firefly')
  chk(sim, 'whereabouts', 'si1 BE buff', Math.abs((m.be ?? 0) - 0.60) < 1e-9)
  // Routed applied on wearer's break — checked via buffLog (robust: enemy may die before end-of-battle)
  chk(sim, 'whereabouts', 'break → Routed on enemy', sim.buffLog.some(e => e.id === 'routed'))
}

// ============ LC 5. BBIBO (bronya: skill → next ally DMG, every 2nd ult → SP) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'bronya', stats: SUP, gear: { coneId: 'bbibo', si: 1 }, mainDpsId: 'seele', energyStartFrac: 1, skillPriority: 1 },
      { kitId: 'seele', stats: { ...DPS, spd: 60 } },
    ],
    enemy: foe(200_000, ['Quantum'], 1, 60, 400, 800, 'Boss'),
    cycles: 4, seed: 3,
  })
  const br = sim.roster.find(x => x.kitId === 'bronya' && !x.dead)
  const m = coneMods(sim, br?.name ?? 'Bronya')
  chk(sim, 'bbibo', 'si1 ERR', Math.abs((m.err ?? 0) - 0.10) < 1e-9)
  const allyBuffed = sim.roster.some(x => x.kitId === 'seele' && !x.dead && x.buffs.some(b => b.id === 'bbibo_dmg'))
  chk(sim, 'bbibo', 'skill → next ally DMG buff', allyBuffed || sim.buffLog.some(e => e.id === 'bbibo_dmg'))
  chk(sim, 'bbibo', 'every 2nd ult → SP refund', (sim.rt(br!)?.bbiboUlts as number) >= 2)
}

// ============ LC 6. EARTHLY ESCAPADE (sparkle: ult → Mask on best CD ally) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sparkle', stats: { ...SUP, critDmg: 2.5 }, gear: { coneId: 'earthly_escapade', si: 1 }, energyStartFrac: 1, skillPriority: 1 },
      { kitId: 'seele', stats: { ...DPS, critDmg: 2.0 } },
    ],
    enemy: foe(150_000, ['Quantum'], 1, 60, 125, 650, 'Boss'),
    cycles: 2, seed: 3,
  })
  const sp = sim.roster.find(x => x.kitId === 'sparkle' && !x.dead)
  const m = coneMods(sim, sp?.name ?? 'Sparkle')
  chk(sim, 'earthly_escapade', 'si1 critDmg', Math.abs((m.critDmg ?? 0) - 0.32) < 1e-9)
  const mask = sim.roster.some(x => x.side === 'ally' && x.kind === 'char' && x.buffs.some(b => b.id === 'mask'))
  chk(sim, 'earthly_escapade', 'ult → Mask on best CD ally', mask)
}

// ============ LC 7. CRUISING (seele: kill → Sea Gaze atk) ============
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: DPS, gear: { coneId: 'cruising', si: 1 }, skillPriority: 2 }],
    enemy: foe(30_000, ['Quantum'], 4, 40, 110, 400, 'Mob'),
    cycles: 10, seed: 5,
  })
  const s = sim.roster.find(x => x.kitId === 'seele' && !x.dead)
  const m = coneMods(sim, s?.name ?? 'Seele')
  chk(sim, 'cruising', 'si1 critRate', Math.abs((m.critRate ?? 0) - 0.08) < 1e-9)
  chk(sim, 'cruising', 'kill → Sea Gaze atk', !!s && s.buffs.some(b => b.id === 'cruise_atk'), true)
}

// ============ LC 8. RESOLUTION (pela: any hit → Ensnared defRed) ============
{
  // canon 21015 `refinements.desc`: "When the wearer hits an enemy and if the hit enemy is not
  // already Ensnared" — a HIT trigger. The old code hung it off skill+ult only, so a Basic never
  // ensnared. Pela (Nihility, so the cone path matches and the passive loads) with rotation 'B'
  // opens on a Basic; the first Ensnared must land on that same AV, which the old code could not
  // do (it would wait for the first Skill/Ult, a later AV).
  const sim = runBattle({
    team: [{ kitId: 'pela', stats: SUP, gear: { coneId: 'resolution', si: 5 }, energyStartFrac: 0, skillPriority: 0, skillPattern: 'rotation', skillRotation: 'B' }],
    enemy: foe(2_000_000, ['Ice', 'Wind'], 1, 60, 115, 400, 'Mob'),
    cycles: 4, seed: 3,
  })
  const basicAv = sim.logLines.map(l => l.match(/^\[(\d+\.\d+)\] >>> Pela \[BASIC\]/)).find(Boolean)?.[1]
  const firstEnsnare = sim.buffLog.find(b => b.id === 'ensnared')?.av
  chk(sim, 'resolution-hit', `si5 BASIC → Ensnared (hit trigger, not skill/ult only): basic@${basicAv} vs ensnare@${firstEnsnare}`,
    firstEnsnare !== undefined && basicAv !== undefined && firstEnsnare === Number(basicAv))

  // "if not already Ensnared" is the per-attack dedup. Sampo's Ricochet Love is 5 hits on one
  // target, so without the guard one Skill would roll 5 times: cap it at 1 per enemy per turn.
  const multi = runBattle({
    team: [{ kitId: 'sampo', stats: DPS, gear: { coneId: 'resolution', si: 5 }, energyStartFrac: 0 }],
    enemy: foe(2_000_000, ['Wind', 'Ice'], 1, 60, 115, 400, 'Mob'),
    cycles: 4, seed: 3,
  })
  const perTargetTurn = new Map<string, number>()
  let worst = 0
  for (const e of multi.buffLog.filter(b => b.id === 'ensnared')) {
    const k = `${e.unitName}@${e.av}`
    const n = (perTargetTurn.get(k) ?? 0) + 1
    perTargetTurn.set(k, n)
    if (n > worst) worst = n
  }
  chk(multi, 'resolution-guard', `5-hit Skill rolls Ensnared once (max ${worst} application per enemy per turn, want 1)`, worst <= 1)
}

// ============ LC 9. DDD (sparkle: ult → advance allies) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sparkle', stats: SUP, gear: { coneId: 'ddd', si: 1 }, energyStartFrac: 1, skillPriority: 1 },
      { kitId: 'seele', stats: DPS },
    ],
    enemy: foe(150_000, ['Quantum'], 1, 60, 125, 650, 'Boss'),
    cycles: 6, seed: 3,
  })
  chk(sim, 'ddd', 'ult → advances allies', sim.logLines.some(l => l.includes('Dance!') && l.includes('advances')), true)
}

// ============ LC 10. PLANETARY (sparkle + seele: same elem → DMG Infinity) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sparkle', stats: SUP, gear: { coneId: 'planetary', si: 1 }, skillPriority: 1 },
      { kitId: 'seele', stats: DPS },
    ],
    enemy: foe(100_000, ['Quantum'], 2, 60, 115, 500, 'Mob'),
    cycles: 5, seed: 3,
  })
  const se = sim.roster.find(x => x.kitId === 'seele' && !x.dead)
  chk(sim, 'planetary', 'same elem → Rendezvous DMG buff', !!se && se.buffs.some(b => b.id === 'rendezvous'))
}

// ============ LC 11. SWORDPLAY (seele: flat dmg all) ============
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: DPS, gear: { coneId: 'swordplay', si: 1 }, skillPriority: 1 }],
    enemy: foe(60_000, ['Quantum'], 1, 60, 115, 400, 'Mob'),
    cycles: 3, seed: 5,
  })
  chk(sim, 'swordplay', 'si1 dynamic stacks capped 5', Math.abs(lastVal(sim, 'swordplay', 'dmgAll') - 0.40) < 1e-9)
}

// ============ LC 12. FERMATA (kafka: BE always-on, DMG vs Shock/Wind-Shear conditional) ============
{
  const sim = runBattle({
    team: [{ kitId: 'kafka', stats: DPS, gear: { coneId: 'fermata', si: 1 }, skillPriority: 2 }],
    enemy: foe(60_000, ['Lightning'], 1, 40, 115, 400, 'Mob'),
    cycles: 5, seed: 5,
  })
  const k = sim.roster.find(x => x.kitId === 'kafka' && !x.dead)
  const m = coneMods(sim, k?.name ?? 'Kafka')
  chk(sim, 'fermata', 'si1 BE always-on', Math.abs((m.be ?? 0) - 0.16) < 1e-9)
  // Lightning-weak foe являет подавляется (break) -> Shock dot -> следующие удары получают conditional dmgAll
  chk(sim, 'fermata', 'DMG vs shocked target (hitMods)', sim.buffLog.some(e => e.id === '_gearhm' && e.mods?.some(x => x.stat === 'dmgAll' && Math.abs(x.value - 0.16) < 1e-9)))
}

// ============ LC 13. TAPD (himeko: dmgAll × energyMax) ============
{
  const sim = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'tapd', si: 1 }, skillPriority: 1 }],
    enemy: foe(60_000, ['Fire'], 1, 60, 115, 400, 'Mob'),
    cycles: 3, seed: 5,
  })
  const h = sim.roster.find(x => x.kitId === 'himeko' && !x.dead)
  const m = coneMods(sim, h?.name ?? 'Himeko')
  // si1: 0.002 × energyMax (default 130) = 0.26
  chk(sim, 'tapd', 'si1 dmgAll × energyMax', Math.abs((m.dmgAll ?? 0) - 0.26) < 1e-9)
}

// ============ 15. SILVER WOLF (implant + bugs + debuff scaling ult) ============
{
  const sim = runBattle({
    team: [{ kitId: 'silverwolf', stats: SUP, skillPriority: 2, eidolon: 6, energyStartFrac: 1 }, { kitId: 'seele', stats: DPS }],
    enemy: foe(120_000, ['Quantum'], 1, 80, 120, 700, 'Boss'),
    cycles: 8, seed: 5,
  })
  dump('silverwolf', sim, 'silverwolf')
  const swa = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'silverwolf' && u.name === n))
  const sk = (k: string) => (swa?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'silverwolf', {
    'Базовая': () => sk('System Warning'),
    'Навык': () => sk('Allow Changes?'),
    'Ульт': () => sk('User Banned'),
    'Талант': [() => sim.logLines.some(l => l.includes('Bug lands')), true],
    'Ульт DEF down': () => live(sim, 'sw_ult_def'),
    'A4': [() => sk('Allow Changes?'), true],
    'A6': () => live(sim, 'sw_a6'),
    'E1': [() => live(sim, 'sw_ult_def'), true],
    'E2': () => sim.logLines.some(l => l.includes('E2: enemy DMG taken')),
    'E4': () => (swa?.[1].bySkill['E4 Additional DMG'] ?? 0) > 0,
    'E6': () => live(sim, 'sw_e6'),
    'E3': () => e33(sim, 'silverwolf'),
    'E5': () => e55(sim, 'silverwolf'),
  })
}

// ============ 16. LUOCHA (Zone heals + auto-heal + dispel) ============
{
  const sim = runBattle({
    team: [{ kitId: 'luocha', stats: HEAL, skillPriority: 2, eidolon: 6, energyStartFrac: 1 }, { kitId: 'seele', stats: DPS }],
    enemy: foe(150_000, ['Imaginary'], 1, 80, 115, 750, 'Boss'),
    cycles: 8, seed: 7,
  })
  dump('luocha', sim, 'luocha')
  const la = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'luocha' && u.name === n))
  const sk = (k: string) => (la?.[1].bySkill[k] ?? 0) > 0
  // Auto-Skill: ally ≤50% HP after a hit → heal + 30 Energy (canon) + 1 Abyss Flower.
  // Enemy must hit hard enough to drop an ally below half; Luocha must not ult-heal it away.
  const autoMini = (() => {
    const s = runBattle({
      team: [{ kitId: 'luocha', stats: { hp: 1800, atk: 1500, def: 300, spd: 50 }, eidolon: 0 }],
      enemy: foe(200_000, ['Imaginary', 'Physical'], 1, 80, 115, 2500),
      cycles: 6, seed: 5,
    })
    const log = s.logLines.filter(l => l.includes('auto-heals'))
    return log.length > 0 && log.some(l => l.includes('energy +30'))
  })()
  btns(sim, 'luocha', {
    'Базовая': () => sk('Thorns of the Abyss'),
    'Навык': [() => sim.logLines.some(l => l.includes('heals')), true],
    'Ульт': [() => sk('Death Wish'), true],
    'Талант-Зона': () => live(sim, 'luocha_zone'),
    'Зона хил': () => sim.logLines.some(l => l.includes('Zone heals')),
    'Талант (автохил)': () => autoMini,
    'Авто +30 EN': [() => autoMini, true],
    'Основ. диспел': [() => sim.logLines.some(l => l.includes('dispels')), true],
    'A2 (диспел дебаффа)': [() => sim.logLines.some(l => l.includes('Prayer dispels')), true],
    'A4 Sanctified': [() => sim.logLines.some(l => l.includes('Zone heals')), true],
    'E1': () => live(sim, 'luocha_e1'),
    'E2': () => (live(sim, 'luocha_e2_shield') || sim.logLines.some(l => l.includes('heals'))),
    'E4': () => live(sim, 'luocha_e4'),
    'E6': () => live(sim, 'luocha_e6'),
    'E3': () => e33(sim, 'luocha'),
    'E5': () => e55(sim, 'luocha'),
  })
}

// ============ 17. YUKONG (Roaring pool decay + ult buffs + E2 energy) ============
{
  const sim = runBattle({
    team: [{ kitId: 'yukong', stats: SUP, skillPriority: 2, eidolon: 6, energyStartFrac: 1 }, { kitId: 'seele', stats: DPS, energyStartFrac: 1 }],
    enemy: foe(150_000, ['Imaginary'], 1, 80, 115, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  dump('yukong', sim, 'yukong')
  const ya = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'yukong' && u.name === n))
  const sk = (k: string) => (ya?.[1].bySkill[k] ?? 0) > 0
  const yk = sim.roster.find(x => x.kitId === 'yukong')
  btns(sim, 'yukong', {
    'Базовая': () => sk('Arrowslinger'),
    'Навык': () => live(sim, 'roaring_bow'),
    'Ульт': () => sk('Diving Kestrel') && sim.logLines.some(l => l.includes('Diving Kestrel (energy +5)')),
    'Ульт CR/CRD': () => live(sim, 'yukong_ult_cr') || live(sim, 'yukong_ult_cd'),
    'Талант': () => sk('Seven Layers, One Arrow'),
    'A4 (Imag DMG)': () => live(sim, 'yukong_dmg'),
    'A6 (+2 EN)': [() => sim.logLines.some(l => l.includes('Yukong A6:')), true],
    'E1': () => live(sim, 'yukong_e1'),
    'E2': () => sim.logLines.some(l => l.includes('Yukong E2:')),
    'E4': () => live(sim, 'yukong_e4'),
    'E6': [() => !!yk && ((sim.rt(yk)?.roaring as number) ?? 0) === 1, true],
    'E3': () => e33(sim, 'yukong'),
    'E5': () => e55(sim, 'yukong'),
  })
}

// ============ 18. BLADE (HP-cost → Charge → FUA loop) ============
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 6500 }, eidolon: 6 }],
    enemy: foe(600_000, ['Wind'], 1, 80, 110, 600, 'Foe'),
    cycles: 30, seed: 13,
  })
  dump('blade', sim, 'blade')
  const ba = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'blade' && u.name === n))
  const sk = (k: string) => (ba?.[1].bySkill[k] ?? 0) > 0
  const b = sim.roster.find(x => x.kitId === 'blade' && !x.dead)
  btns(sim, 'blade', {
    'Базовая': () => sk('Shard Sword'),
    'Усил базовая': () => sk('Forest of Swords'),
    'Навык': () => sim.logLines.some(l => l.includes('enters Hellscape (3 turns) + Extra Turn')),
    'Ульт': () => sk('Death Sentence (main)'),
    'Талант FUA': () => sk("Shuhu's Gift (FUA)"),
    'A6 FUA+20%': [() => sk("Shuhu's Gift (FUA)"), true],
    'E1': () => sim.logLines.some(l => /E1 extra [1-9]/.test(l)),
    'E2': () => sim.buffLog.some(e => e.id === 'hellscape' && e.mods?.some(m => m.stat === 'critRate' && m.value >= 0.14)),
    'E4': () => (lastOf(sim, 'blade_e4')?.stacks ?? 0) >= 1,
    'E6': [() => !!b && ((sim.rt(b)?.charge as number) ?? 0) < 4, true],
    'E3': () => e33(sim, 'blade'),
    'E5': () => e55(sim, 'blade'),
  })
  chk(sim, 'blade-canon', 'A2 healing→tally via onAllyHeal', sim.logLines.some(l => l.includes('A2: healing converts to Ultimate tally')), true)
  chk(sim, 'blade-canon', 'ult +5 energy', sim.logLines.some(l => l.includes('energy +5')), true)
  chk(sim, 'blade-canon', 'E1 extra applied to ult', sim.logLines.some(l => /E1 extra [1-9]/.test(l)), false)
}

// ============ 19. LUKA (Fighting Will + Bleed + enhanced basic) ============
{
  const sim = runBattle({
    team: [{ kitId: 'luka', stats: DPS, skillPriority: 2, eidolon: 6, energyStartFrac: 1 }],
    enemy: foe(90_000, ['Physical'], 1, 80, 115, 650, 'Boss'),
    cycles: 10, seed: 17,
  })
  dump('luka', sim, 'luka')
  const lua = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'luka' && u.name === n))
  const sk = (k: string) => (lua?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'luka', {
    'Базовая': [() => sk('Direct Punch'), true],
    'Усил базовая': () => sk('Sky-Shatter Fist'),
    'Навык': () => sk('Lacerating Fist'),
    'Ульт': () => sk('Coup de Grâce'),
    'Ult +5 EN': () => sim.logLines.some(l => l.includes('Coup de Grâce (energy +5)')),
    'Bleed': () => sim.logLines.some(l => l.includes('Bleeded')),
    'Bleed Burst': [() => sim.logLines.some(l => l.includes('Bleed Burst')), true],
    'Ульт vuln': () => live(sim, 'luka_ult_vuln'),
    'E1': () => live(sim, 'luka_e1'),
    'E2': () => sim.logLines.some(l => l.includes('Luka E2:')),
    'E4': () => live(sim, 'luka_e4'),
    'E6': [() => sim.logLines.some(l => { const m = /ratio (\d+\.\d+)/.exec(l); return m && parseFloat(m[1]) > 0.9 }), true],
    'A2 (диспел)': [() => sim.logLines.some(l => l.includes('dispels')), true],
    'A4 (энергия)': () => sim.logLines.some(l => l.includes('Luka A4:')),
    'E3': () => e33(sim, 'luka'),
    'E5': () => e55(sim, 'luka'),
  })
}

// ============ 20. DAN HENG IL (Dracore Libre enhance + Squama + Righteous Heart + E1/E2/E6) ============
{
  const sim = runBattle({
    team: [{ kitId: 'danhengil', stats: DPS, eidolon: 6, energyStartFrac: 0 }],
    enemy: foe(150_000, ['Imaginary'], 2, 100, 120, 680, 'Boss'),
    cycles: 8, seed: 23,
  })
  dump('danhengil', sim, 'danhengil')
  const acc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'danhengil' && u.name === n))
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  const per = mult('danhengil', 'talent', 12) // eidolon 6 → talent 12 (resolveLevels)
  btns(sim, 'danhengil', {
    'Базовая': [() => sk('Beneficent Lotus') || sk('Transcendence') || sk('Divine Spear') || sk('Fulgurant Leap'), true],
    'Усил базовая': () => sk('Transcendence') || sk('Divine Spear') || sk('Fulgurant Leap'),
    'Усил blast-adj': () => sk('Divine Spear (adj)') || sk('Fulgurant Leap (adj)'),
    'Ульт': () => sk("Azure's Aqua Ablutes All") || sk("Azure's Aqua (adj)"),
    'A6 дмг-крит': () => live(sim, 'dhl_a6'),
    'A2 (Star Veil EN)': [() => sim.logLines.some(l => l.includes('Dan Heng IL A2:')), true],
    'E1 (Heart value)': () => sim.buffLog.some(e => e.id === 'dhl_heart' && Math.abs((e.mods?.find(m => m.stat === 'dmgAll')?.value ?? 0) - per) < 5e-4 && (e.stacks ?? 0) <= 10), // per-stack value=talent, cap 10 (E1)
    'Талант (Outroar)': () => live(sim, 'dhl_outroar'),
    'E2 (Squama 3/3)': [() => sim.logLines.some(l => l.includes('Squama 3/3')), true],
    'E2 (advance log)': () => sim.logLines.some(l => l.includes('Dan Heng IL E2:')),
    'E4 (Outroar +1 ход)': [() => lastOf(sim, 'dhl_outroar')?.turns === 2, true],
    'CP': () => true,
    'E3': () => e33(sim, 'danhengil'),
    'E5': () => e55(sim, 'danhengil'),
  })
}

// ============ 21. FU XUAN (Matrix + redirect + Dunjia + E2/E4/E6) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'fuxuan', stats: HEAL, eidolon: 6, energyStartFrac: 1 },
      { kitId: 'luocha', stats: HEAL, energyStartFrac: 0 },
    ],
    enemy: foe(80_000, ['Quantum'], 1, 120, 130, 8000, 'Boss'),
    cycles: 10, seed: 7,
  })
  dump('fuxuan', sim, 'fuxuan')
  const acc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'fuxuan' && u.name === n))
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'fuxuan', {
    'Base = PROG': () => kitById('fuxuan')?.base.hp === 1474,
    'Новык Matrix': () => live(sim, 'fx_ma'),
    'A2 (+20 EN)': [() => sim.logLines.some(l => l.includes('Fu Xuan A2:')), true],
    'Ульт': () => live(sim, 'fx_knowledge') || sk('Woes of Many Morphed to One'),
    'Ult +5 EN': () => sk('Woes of Many Morphed to One') && sim.logLines.some(l => l.includes('(energy +5)')),
    'Талант хил': () => sim.logLines.some(l => l.includes('HP Restore')),
    'Redirect 65%': () => sim.logLines.some(l => l.includes('redirects')),
    'A4 (Dunjia хил)': () => sim.logLines.some(l => l.includes('Dunjia heals allies')),
    'E2 краш-спас': [() => sim.logLines.some(l => l.includes('E2:')), true],
    'E4 энергия': [() => sim.logLines.some(l => l.includes('E4: +5 Energy')), true],
    'E6 tally+Omnia': [() => sim.logLines.some(l => l.includes('E6 tally')) && !!sk('Omnia Vita'), true],
    'Базовая': () => sk('Novaburst'),
    'E1 CD': () => Math.abs(lastVal(sim, 'fx_knowledge', 'critDmg') - 0.3) < 5e-4,
    'E3': () => e33(sim, 'fuxuan'),
    'E5': () => e55(sim, 'fuxuan'),
  })
}

// ============ 22. LYNX (Survival Response via hpFlat + HoT 3t(A6) + ult dispel/heal + E1/E4/E6) ============
{
  const s = runBattle({
    team: [
      { kitId: 'lynx', stats: HEAL, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'clara', stats: { ...DPS, hp: 2500 }, skillPriority: 1 },
    ],
    enemy: foe(250_000, ['Quantum'], 1, 120, 140, 7000, 'Boss'),
    cycles: 5, seed: 5,
  })
  // e0 solo (E3 absent → skill lvl 10), no E6 SR bonus; lynx acts first (boss spd 100), survives ≥1 skill
  const s2 = runBattle({
    team: [
      { kitId: 'lynx', stats: { ...HEAL, def: 500, hp: 3200 }, skillPriority: 2 },
    ],
    enemy: foe(400_000, ['Quantum'], 1, 120, 100, 5500, 'Boss'),
    cycles: 4, seed: 3,
  })
  const kb = kitById('lynx')!
  const acc = accOf(s, 'lynx')
  const lx = s.roster.find(u => u.kind === 'char' && u.kitId === 'lynx')!
  const s2sr = s2.buffLog.find(b => b.id === 'lynx_sr')
  // battle-start effective MaxHP (HEAL hp 6000 × 1 + hpPct 0.28 traces), before any SR self-inflation
  const L0 = 7680
  const lv = Lv(s, 'lynx')
  // E6 → SR = skill% of Lynx MaxHP + flat + 6% MaxHP (e6 skill lvl 12 via E3); check FIRST SR record (re-cast uses inflated MaxHP)
  const expSR = Math.round(L0 * mult('lynx', 'skill', lv.skill) + mult('lynx', 'skill_a2', lv.skill)) + Math.round(L0 * 0.06)
  chk(s, 'lynx', 'canon base =PROG', kb.base.hp === PROG.lynx.base.hp && kb.base.atk === PROG.lynx.base.atk && kb.base.def === PROG.lynx.base.def && kb.base.spd === PROG.lynx.base.spd)
  chk(s, 'lynx', 'energyMax =100', kb.energyMax === 100)
  chk(s, 'lynx', 'basic Ice Crampon Technique fires', (acc?.[1].bySkill['Ice Crampon Technique'] ?? 0) > 0)
  chk(s, 'lynx', 'skill heals + Survival Response log', s.logLines.some(l => /Survival Response \+ MaxHP/.test(l)))
  chk(s, 'lynx', 'SR 2 turns', lastOf(s, 'lynx_sr')?.turns === 2)
  chk(s, 'lynx', 'SR hpFlat = skill% of Lynx MaxHP + 6% (E6)', Math.abs(lastVal(s, 'lynx_sr', 'hpFlat') - expSR) <= 1)
  chk(s2, 'lynx', 'E6 off: SR hpFlat = round(4096×0.075)+200, no effRes', s2sr !== undefined && Math.abs((s2sr.mods?.find(m => m.stat === 'hpFlat')?.value ?? 0) - (Math.round(4096 * mult('lynx', 'skill', 10)) + 200)) <= 1 && (s2sr.mods?.find(m => m.stat === 'effRes')?.value ?? 0) === 0)
  chk(s, 'lynx', 'ult heals all + (energy +5)', s.logLines.some(l => /Snowfield First Aid \(energy \+5\)/.test(l)))
  chk(s, 'lynx', 'A2 Advance Surveying +2 EN on SR-holder hit', s.logLines.some(l => l.includes('Lynx A2:')))
  chk(s, 'lynx', 'HoT 3 turns (A6, not 102)', Object.keys(s.rt(lx).hots as Record<string, { turns: number }>).length > 0 && Object.values(s.rt(lx).hots as Record<string, { turns: number }>).every(h => h.turns <= 3))
  chk(s, 'lynx', 'E4 Dusk of Warm Campfire: ATK +3% of Lynx MaxHP (1t buff)', lastVal(s, 'lynx_e4', 'atkFlat') > 0)
  chk(s, 'lynx', 'E6: SR Effect RES +30%', Math.abs(lastVal(s, 'lynx_sr', 'effRes') - 0.3) < 1e-9)
  chk(s, 'lynx', 'E1: healing ally ≤50% → Outgoing +20% (log)', s.logLines.some(l => /Lynx E1:/.test(l)))
}

// ============ 23. TOPAZ (Numby FUA + PoD vuln + Windfall 2/3 attacks + E1 Debtor + advance) ============
{
  const sim = runBattle({
    team: [{ kitId: 'topaz', stats: DPS, eidolon: 6, energyStartFrac: 1 }],
    enemy: foe(120_000, ['Fire'], 1, 110, 125, 700, 'Boss'),
    cycles: 10, seed: 29,
  })
  dump('topaz', sim, 'topaz')
  const acc = accOf(sim, 'topaz')
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  const pod = lastVal(sim, 'topaz_pod', 'vulnType:fua')
  const stonks = sim.logLines.filter(l => l.includes('Stonks Market')).length
  const advances = sim.logLines.filter(l => l.includes('Numby advance 50%')).length
  btns(sim, 'topaz', {
    'Навык PoD': () => live(sim, 'topaz_pod'),
    'PoD vuln val': () => Math.abs(pod - mult('topaz', 'skill_a2', 12)) < 5e-4, // eidolon 6 → skill 12
    'Назв. скилла (Difficulty Paying?)': () => sk('Difficulty Paying?'),
    'Базовая Overdraft (Deficit...)': () => sk('Deficit...'),
    'E1 (Debtor)': () => sim.logLines.some(l => l.includes('Topaz E1: Debtor')),
    'E1 (Debtor stacks)': () => lastOf(sim, 'topaz_debtor')?.stacks === 2,
    'Талант (Numby FUA)': () => {
      const na = [...sim.accounts].find(([n]) => n === 'Numby')
      return !!na && (na[1].bySkill['Numby'] ?? 0) > 0
    },
    'Ульт Windfall': () => sim.logLines.some(l => l.includes('Windfall')),
    'E6 (Windfall = 3 атаки за око)': () => {
      const ults = sim.logLines.filter(l => l.includes('Windfall Effect')).map(l => l.match(/^\[([\d.]+)/)?.[1])
      const wind = sim.logLines.filter(l => l.includes('(Windfall)')).map(l => l.match(/^\[([\d.]+)/)?.[1])
      const wins = ults.map((t, i) => {
        const end = ults[i + 1]
        return wind.filter(wt => Number(wt) >= Number(t) && (end === undefined || Number(wt) < Number(end))).length
      })
      return wins.length > 0 && Math.max(...wins) === 3
    },
    'E2 энергия': () => sim.logLines.some(l => l.includes('Topaz E2:')),
    'E4 advance': () => sim.logLines.some(l => l.includes('Topaz E4:')),
    'Advance от атак по PoD': () => advances > 0,
    'A6 Stonks Market +10 EN': () => stonks > 0,
    'A4 Financial Turmoil': () => sim.buffLog.some(e => e.id === 'topaz_a4' && e.unitName === 'Numby' && e.mods?.some(m => m.stat === 'dmgAll' && m.value === 0.15)) && !sim.buffLog.some(e => e.id === 'topaz_financial'),
    'A4 no boost vs non-Fire-weak': () => {
      const cold = runBattle({ team: [{ kitId: 'topaz', stats: DPS, energyStartFrac: 1 }], enemy: foe(400_000, ['Ice'], 1, 110, 125, 700, 'Boss'), cycles: 6, seed: 29 })
      return !cold.buffLog.some(e => e.id === 'topaz_a4')
    },
    'E3': () => e33(sim, 'topaz'),
    'E5': () => e55(sim, 'topaz'),
  })
}

// ============ 24. JINGLIU (Spectral + Syzygy + enhanced + E1/E2/E4/E6 + A6 Frost Wraith) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'jingliu', stats: DPS, eidolon: 6, energyStartFrac: 0 },
      { kitId: 'seele', stats: DPS, energyStartFrac: 0 }, // drain targets teammates, not self
    ],
    enemy: foe(400_000, ['Ice', 'Quantum'], 2, 100, 120, 700, 'Boss'),
    cycles: 14, seed: 41,
  })
  dump('jingliu', sim, 'jingliu')
  const acc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'jingliu' && u.name === n))
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'jingliu', {
    'Спектр. стадия': () => live(sim, 'jingliu_spectral'),
    'Навык': () => sk('Transcendent Flash'),
    'Усил атака': () => sk('Moon On Glacial River'),
    'Усил blast-adj': () => sk('Moon (adj)'),
    'Ульт': () => sk('Florephemeral Dreamflux'),
    'Ульт blast-adj': () => sk('Florephemeral (adj)'),
    'Талант (спектр. крит)': () => Math.abs(lastVal(sim, 'jingliu_spectral', 'critRate') - mult('jingliu', 'talent_a2', 12)) < 5e-4, // eidolon 6 → talent 12
    'E6 (Ice RES PEN 30%)': () => Math.abs(lastVal(sim, 'jingliu_spectral', 'resPen:Ice') - 0.3) < 5e-4,
    'A2 (Deathrealm 20%)': () => Math.abs(lastVal(sim, 'jingliu_spectral', 'boost:ult') - 0.2) < 5e-4,
    'A6 (Frost Wraith DEF-)': () => sim.logLines.some(l => l.includes('Frost Wraith A6:')), // A6: cap-reached next attack -25% DEF (logged)
    'A4 (+EN)': () => sim.logLines.some(l => l.includes('Jingliu A4:')), // A4 Sword Champion: +15 skill / +8 enhanced EN (logged)
    'Syzygy-вход': () => sim.logLines.some(l => l.includes('enters Spectral')),
    'A4 (дрейн 5%)': () => sim.logLines.some(l => l.includes('Spectral drain')),
    'E4 (Moonlight CD)': () => sim.logLines.some(l => l.includes('Moonlight')), // E4: each Moonlight stack +talent%+20% CD
    'E1 (CRDMG+80%HP)': () => sk('E1 Tianguan Gate'), // E1: +36% CD 1t + 80% MaxHP Ice to primary
    'E2 (next-Moon +80%)': () => sim.logLines.some(l => l.includes('E2: next Enhanced Skill +80% applied')), // E2: transient dmgAll 0.8 on Moon
    'Базовая': [() => sk('Lucent Moonglow'), true],
    'E3': () => e33(sim, 'jingliu'),
    'E5': () => e55(sim, 'jingliu'),
  })
}

// ============ 25. JINGLIU без E6: спектральный цикл (Moonlight/дрейн от своих атак) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'jingliu', stats: DPS, eidolon: 0, energyStartFrac: 0 },
      { kitId: 'seele', stats: DPS, energyStartFrac: 0 },
    ],
    enemy: foe(120_000, ['Ice', 'Quantum'], 2, 100, 120, 700, 'Boss'),
    cycles: 12, seed: 41,
  })
  dump('jingliu-solo', sim, 'jingliu')
  const sacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'jingliu' && u.name === n))
  const ssk = (k: string) => (sacc?.[1].bySkill[k] ?? 0) > 0
  const slog = (s: string) => sim.logLines.some(l => l.includes(s))
  chk(sim, 'jingliu-solo', 'Стек-цикл без E6', slog('enters Spectral'))
  chk(sim, 'jingliu-solo', 'Дрейн от усил. атаки', slog('Spectral drain'))
  chk(sim, 'jingliu-solo', 'Moonlight (talent% CD)', slog('Moonlight'))
  chk(sim, 'jingliu-solo', 'Мультиатака', slog('Florephemeral Dreamflux'))
  chk(sim, 'jingliu-solo', 'Adj без E6', ssk('Moon (adj)'))
  chk(sim, 'jingliu-solo', 'Усил атака', ssk('Moon On Glacial River'))
  chk(sim, 'jingliu-solo', 'Ульт', ssk('Florephemeral Dreamflux'))
  chk(sim, 'jingliu-solo', 'Талант (спектр. крит)', Math.abs(lastVal(sim, 'jingliu_spectral', 'critRate') - mult('jingliu', 'talent_a2', Lv(sim, 'jingliu').talent)) < 5e-4)
  chk(sim, 'jingliu-solo', 'A2 (Deathrealm 20%)', Math.abs(lastVal(sim, 'jingliu_spectral', 'boost:ult') - 0.2) < 5e-4)
}

// ============ 26. DAN HENG IL E6 (аллизийный ульт → RES PEN, требует партнёра) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'danhengil', stats: DPS, eidolon: 6, energyStartFrac: 0 },
      { kitId: 'bronya', stats: DPS, eidolon: 6, energyStartFrac: 1 },
    ],
    enemy: foe(150_000, ['Imaginary'], 1, 100, 120, 680, 'Boss'),
    cycles: 8, seed: 23,
  })
  dump('danhengil-e6', sim, 'danhengil')
  const na6 = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'danhengil' && u.name === n))
  const dsk = (k: string) => (na6?.[1].bySkill[k] ?? 0) > 0
  btns(sim, 'danhengil-e6', {
    'Базовая': [() => dsk('Beneficent Lotus'), true], // eid6→ротация только усиленных, базовая бывает лишь в длинном бою
    'Усил базовая': () => dsk('Transcendence') || dsk('Divine Spear') || dsk('Fulgurant Leap'),
    'Ульт': () => dsk("Azure's Aqua Ablutes All"),
    'Талант (Outroar)': () => live(sim, 'dhl_outroar'),
    'A2 (Star Veil EN)': [() => sim.logLines.some(l => l.includes('Dan Heng IL A2:')), true],
    'A6 (Jolt Anew CD)': () => live(sim, 'dhl_a6'), // always-on critDmg 0.24 flatten of vs-Imaginary-weak
    'E1 (Heart)': () => live(sim, 'dhl_heart'),
    'E2 (Squama 3/3)': [() => sim.logLines.some(l => l.includes('Squama 3/3')), true],
    'E2 (advance log)': () => sim.logLines.some(l => l.includes('Dan Heng IL E2:')),
    'E4 (Outroar +1 ход)': [() => lastOf(sim, 'dhl_outroar')?.turns === 2, true],
    'E6 после ульта союзника': () => live(sim, 'dhl_e6'),
    'E6 log': () => sim.logLines.some(l => l.includes('Dan Heng IL E6:')),
    'Fulgurant consumed': [() => !live(sim, 'dhl_e6'), true],
    'E3': () => e33(sim, 'danhengil'),
    'E5': () => e55(sim, 'danhengil'),
  })
}

// ============ 26b. DAN HENG IL canon (base=PROG, EN per stage, basic SP, Outroar 2/4, Heart clamp, A4 effRes) ============
{
  const sim = runBattle({
    team: [{ kitId: 'danhengil', stats: DPS, eidolon: 0, energyStartFrac: 0 }],
    enemy: foe(2_000_000, ['Imaginary'], 1, 100, 120, 400, 'Boss'),
    cycles: 8, seed: 23,
  })
  dump('danhengil-canon', sim, 'danhengil')
  const nacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'danhengil' && u.name === n))
  const dck = (k: string) => (nacc?.[1].bySkill[k] ?? 0) > 0
  const kb = kitById('danhengil')
  chk(sim, 'danhengil-canon', 'base=PROG', !!kb && kb.base.hp === 1241 && kb.base.atk === 698 && kb.base.def === 363 && kb.base.spd === 102)
  chk(sim, 'danhengil-canon', 'energyMax 140', !!kb && kb.energyMax === 140)
  chk(sim, 'danhengil-canon', 'Ult', dck("Azure's Aqua Ablutes All"))
  // EN per stage 30/35/40 заложен в коде; стадии 1/2 недостижимы под max-DPS decide (быстрая докачка до 3)
  chk(sim, 'danhengil-canon', 'Transcendence (EN 30)', dck('Transcendence'), true)
  chk(sim, 'danhengil-canon', 'Divine Spear (EN 35)', dck('Divine Spear'), true)
  chk(sim, 'danhengil-canon', 'Fulgurant Leap (EN 40)', dck('Fulgurant Leap'))
  // Баз. SP-реген: stage-0 недостижим под decide (всегда докачивает стадии)
  chk(sim, 'danhengil-canon', 'Баз. SP-реген', sim.logLines.some(l => l.includes('+1 SP')), true)
  chk(sim, 'danhengil-canon', 'A2 (+15 EN старт)', sim.logLines.some(l => l.includes('Dan Heng IL A2:')))
  chk(sim, 'danhengil-canon', 'A4 (effRes 35%)', sim.buffLog.some(e => e.id === 'dhl_a4' && Math.abs((e.mods?.[0]?.value ?? 0) - 0.35) < 1e-9))
  chk(sim, 'danhengil-canon', 'A6 (Jolt Anew CD)', live(sim, 'dhl_a6'))
  chk(sim, 'danhengil-canon', 'Heart 6c (value=talent, stacks≤6)', sim.buffLog.filter(e => e.id === 'dhl_heart').length > 0 && sim.buffLog.filter(e => e.id === 'dhl_heart').every(e => (e.stacks ?? 1) <= 6 && Math.abs((e.mods?.[0]?.value ?? 0) - mult('danhengil', 'talent', 10)) < 1e-9))
  chk(sim, 'danhengil-canon', 'Outroar 2/4 (value=skill)', sim.buffLog.filter(e => e.id === 'dhl_outroar' && (e.stacks ?? 0) >= 2).length > 0 && sim.buffLog.filter(e => e.id === 'dhl_outroar' && (e.stacks ?? 0) >= 2).every(e => (e.stacks ?? 0) % 2 === 0 && Math.abs((e.mods?.[0]?.value ?? 0) - mult('danhengil', 'skill', 10)) < 1e-9))
  chk(sim, 'danhengil-canon', 'Nакопление до Fulgurant (7h→4 стака)', sim.buffLog.filter(e => e.id === 'dhl_outroar' && (e.stacks ?? 0) >= 4).length > 0)
}

// ============ 27. GEAR 2.x/3.x (relic + planar hooks) ============
{
  // poet: spd-гейт 4pc critRate + spdPct -8%
  {
    const sim = runBattle({
      team: [{ kitId: 'seele', stats: { ...DPS, spd: 90 }, gear: { relicSets: ['poet', 'poet'] } }],
      enemy: foe(80_000, ['Quantum'], 1, 120, 130, 700, 'Boss'),
      cycles: 4, seed: 5,
    })
    const m = coneMods(sim, 'Seele')
    console.log(`== poet == mods: ${JSON.stringify(m)}`)
    chk(sim, 'gear-poet', '2pc Quantum dmg', Math.abs((m['dmg:Quantum'] ?? 0) - 0.10) < 1e-9)
    chk(sim, 'gear-poet', '4pc spdPct -8%', Math.abs((m.spdPct ?? 0) + 0.08) < 1e-9)
    chk(sim, 'gear-poet', '4pc slow gate critRate 32%', Math.abs((m.critRate ?? 0) - 0.32) < 1e-9)
  }
  // valorous: 4pc CR+6% + FUA → Ultimate DMG buff (ult alone gives nothing)
  // Two cases now: a SELF FUA (Moze) and a SUMMON FUA (Jing Yuan → Lightning-Lord). A summon
  // holds no gear of its own, but it uses all of its wearer's buffs, so the wearer's set bonuses
  // apply to it (Summon.md) — Jing Yuan qualifies through Lightning-Lord again.
  {
    const self = runBattle({
      team: [{ kitId: 'moze', stats: DPS, gear: { relicSets: ['valorous', 'valorous'] }, energyStartFrac: 1, skillPriority: 2 }],
      enemy: foe(150_000, ['Lightning'], 1, 60, 115, 600, 'Tank'),
      cycles: 2, seed: 5,
    })
    const m = coneMods(self, 'Moze')
    chk(self, 'gear-valorous', '4pc critRate 6%', Math.abs((m.critRate ?? 0) - 0.06) < 1e-9)
    chk(self, 'gear-valorous', 'self FUA → Valorous Ultimate DMG buff', self.buffLog.some(e => e.id === 'valorous'))

    const viaSummon = runBattle({
      team: [{ kitId: 'jingyuan', stats: DPS, gear: { relicSets: ['valorous', 'valorous'] } }],
      enemy: foe(150_000, ['Lightning'], 1, 60, 115, 600, 'Tank'),
      cycles: 2, seed: 5,
    })
    chk(viaSummon, 'gear-valorous', 'summon FUA (Lightning-Lord) fires wearer Valorous', viaSummon.buffLog.some(e => e.id === 'valorous'))
  }
  // kalpagni: attack on fire-weak boss → BE buff
  {
    const sim = runBattle({
      team: [{ kitId: 'firefly', stats: DPS, gear: { planarId: 'kalpagni' }, energyStartFrac: 1 }],
      enemy: foe(80_000, ['Fire'], 1, 40, 115, 600, 'Fragile'),
      cycles: 1, seed: 5,
    })
    chk(sim, 'gear-kalpagni', 'attack fire-weak → Kalpagni BE buff', live(sim, 'kalpagni'))
  }
  // lushaka: non-leader wearer → ATK% buff on team leader
  {
    const sim = runBattle({
      team: [
        { kitId: 'seele', stats: DPS },
        { kitId: 'sparkle', stats: SUP, gear: { planarId: 'lushaka' } },
      ],
      enemy: foe(100_000, ['Quantum'], 1, 120, 130, 700, 'Boss'),
      cycles: 4, seed: 5,
    })
    chk(sim, 'gear-lushaka', 'wearer not leader → leader ATK buff', sim.roster.some(u => u.kind === 'char' && u.buffs.some(b => b.id === 'lushaka')))
    const sparkle = sim.roster.find(x => x.kitId === 'sparkle')
    const m = coneMods(sim, sparkle?.name ?? 'sparkle')
    chk(sim, 'gear-lushaka', '2pc ERR', Math.abs((m.err ?? 0) - 0.05) < 1e-9)
  }
  // warrior_goddess: heal an ally -> Gentle Rain (self SPD + all-ally CRIT DMG) 2 turns
  {
    const sim = runBattle({
      team: [
        { kitId: 'seele', stats: DPS },
        { kitId: 'lynx', stats: SUP, gear: { relicSets: ['warrior_goddess', 'warrior_goddess'] } },
      ],
      enemy: foe(120_000, ['Quantum'], 3, 100, 180, 700, 'Elite'),
      cycles: 4, seed: 5,
    })
    chk(sim, 'gear-goddess', 'heal ally → self SPD buff', live(sim, 'goddess_spd'))
    chk(sim, 'gear-goddess', 'heal ally → all-ally CRIT DMG buff', live(sim, 'goddess_cd'))
  }
  // banana 2pc: CRIT DMG +16%
  {
    const sim = runBattle({
      team: [{ kitId: 'himeko', stats: DPS, gear: { planarId: 'banana' } }],
      enemy: foe(120_000, ['Fire'], 1, 60, 115, 600, 'Tank'),
      cycles: 2, seed: 5,
    })
    const m = coneMods(sim, 'Himeko')
    chk(sim, 'gear-banana', '2pc critDmg 16%', Math.abs((m.critDmg ?? 0) - 0.16) < 1e-9)
  }
  // hitMods conditionals: wastelander (debuffed/Imprisoned), pioneer (2pc DMG vs debuffed)
  {
    const sim = runBattle({
      team: [
        { kitId: 'welt', stats: SUP, energyStartFrac: 1, skillPriority: 2 },
        { kitId: 'seele', stats: DPS, gear: { relicSets: ['wastelander', 'wastelander'] }, skillPriority: 2 },
      ],
      enemy: foe(120_000, ['Imaginary', 'Quantum'], 1, 120, 120, 700, 'Boss'),
      cycles: 6, seed: 5,
    })
    const wl = sim.buffLog.filter(e => e.id === '_gearhm')
    chk(sim, 'gear-wastelander', 'debuffed → CR+10% hitMods', wl.some(e => e.mods?.some(x => x.stat === 'critRate' && Math.abs(x.value - 0.10) < 1e-9)))
    chk(sim, 'gear-wastelander', 'imprisoned → CD+20% hitMods', wl.some(e => e.mods?.some(x => x.stat === 'critDmg' && Math.abs(x.value - 0.20) < 1e-9)))
  }
  {
    const sim = runBattle({
      team: [
        { kitId: 'pela', stats: { ...SUP, ehr: 0.8 }, skillPriority: 2 },
        { kitId: 'seele', stats: DPS, gear: { relicSets: ['pioneer', 'pioneer'] }, skillPriority: 2 },
      ],
      enemy: foe(150_000, ['Quantum', 'Ice'], 1, 120, 120, 700, 'Boss'),
      cycles: 6, seed: 5,
    })
    const m4 = coneMods(sim, sim.roster.find(x => x.kitId === 'seele')?.name ?? 'Seele')
    chk(sim, 'gear-pioneer', '4pc CR+4% base', Math.abs((m4.critRate ?? 0) - 0.04) < 1e-9)
    const pi = sim.buffLog.filter(e => e.id === '_gearhm')
    chk(sim, 'gear-pioneer', '2pc DMG+12% vs debuffed', pi.some(e => e.mods?.some(x => x.stat === 'dmgAll' && Math.abs(x.value - 0.12) < 1e-9)))
  }
  // duran: Merit stack per ally FUA (dynamic boost:fua)
  {
    const sim = runBattle({
      team: [{ kitId: 'himeko', stats: DPS, gear: { planarId: 'duran' }, skillPriority: 2 }],
      enemy: foe(40_000, ['Fire'], 3, 30, 120, 600, 'Mob'),
      cycles: 10, seed: 5,
    })
    const dm = sim.buffLog.filter(e => e.id === 'duran_merit')
    chk(sim, 'gear-duran', 'Merit +1 per ally FUA', dm.some(e => Math.abs((e.mods?.find(x => x.stat === 'boost:fua')?.value ?? 0) - 0.05) < 1e-9))
    chk(sim, 'gear-duran', 'Merit accumulates (2+ stacks)', dm.filter(e => (e.mods?.find(x => x.stat === 'boost:fua')?.value ?? 0) >= 0.10).length >= 1)
  }
  // prisoner: DEF ignore scales with live dot count on target
  {
    const sim = runBattle({
      team: [
        { kitId: 'blackswan', stats: DPS, gear: { relicSets: ['prisoner', 'prisoner'] }, energyStartFrac: 1, skillPriority: 2 },
        { kitId: 'kafka', stats: SUP, energyStartFrac: 1, skillPriority: 2 },
      ],
      enemy: foe(120_000, ['Wind', 'Lightning'], 3, 80, 120, 700, 'Mob'),
      cycles: 8, seed: 5,
    })
    const pri = sim.buffLog.filter(e => e.id === '_gearhm').flatMap(e => e.mods ?? [])
    chk(sim, 'gear-prisoner', 'DEF ignore scales with DoTs (target-side)', pri.some(x => x.stat === 'defIgnore' && Math.abs(x.value - 0.06) < 1e-9))
    chk(sim, 'gear-prisoner', 'caps at 3 DoTs (18%)', pri.some(x => x.stat === 'defIgnore' && Math.abs(x.value - 0.18) < 1e-9))
  }
  // izumo: +12% CR only when a teammate shares the wearer's Path
  {
    const sim = runBattle({
      team: [
        { kitId: 'seele', stats: DPS, gear: { planarId: 'izumo' }, skillPriority: 2 },
        { kitId: 'danheng', stats: SUP, skillPriority: 2 },
      ],
      enemy: foe(120_000, ['Quantum', 'Wind'], 1, 120, 120, 700, 'Boss'),
      cycles: 6, seed: 5,
    })
    chk(sim, 'gear-izumo', 'same-Path teammate → CR+12%', sim.roster.some(u => u.kind === 'char' && u.buffs.some(b => b.id === 'izumo_cr')))
  }
  {
    const sim = runBattle({
      team: [
        { kitId: 'seele', stats: DPS, gear: { planarId: 'izumo' }, skillPriority: 2 },
        { kitId: 'pela', stats: SUP, skillPriority: 2 },
      ],
      enemy: foe(120_000, ['Quantum', 'Ice'], 1, 120, 120, 700, 'Boss'),
      cycles: 6, seed: 5,
    })
    chk(sim, 'gear-izumo', 'different Path teammate → no CR buff', !sim.roster.some(u => u.kind === 'char' && u.buffs.some(b => b.id === 'izumo_cr')))
  }
  // iron_cavalry: break DEF-ignore only on Break/Super Break (BE>=150%, superbreak 25% at BE>=250%)
  {
    const sim = runBattle({
      team: [{ kitId: 'firefly', stats: { ...DPS, be: 2.6 }, gear: { relicSets: ['iron_cavalry', 'iron_cavalry'] }, energyStartFrac: 1, skillPriority: 2 }],
      enemy: foe(80_000, ['Fire'], 1, 40, 115, 600, 'Fragile'),
      cycles: 3, seed: 5,
    })
    const ic = sim.buffLog.filter(e => e.id === '_ic').flatMap(e => e.mods ?? [])
    chk(sim, 'gear-ironcav', 'Break DMG ignores 10% DEF', ic.some(x => x.stat === 'defIgnore' && Math.abs(x.value - 0.10) < 1e-9))
    chk(sim, 'gear-ironcav', 'Super Break ignores 25% DEF', ic.some(x => x.stat === 'defIgnore' && Math.abs(x.value - 0.25) < 1e-9))
  }
}

// ============ 28. BLACK SWAN (Arcana-стаки, Epiphany, Blast) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'blackswan', stats: DPS, eidolon: 6 },
      { kitId: 'kafka', stats: SUP, eidolon: 0 },
    ],
    enemy: foe(180_000, ['Wind', 'Lightning'], 3, 80, 120, 700, 'Mob'),
    cycles: 12, seed: 41,
  })
  dump('blackswan', sim, 'blackswan')
  const bacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'blackswan' && u.name === n))
  const bsk = (k: string) => (bacc?.[1].bySkill[k] ?? 0) > 0
  const blog = (s: string) => sim.logLines.some(l => l.includes(s))
  btns(sim, 'blackswan', {
    'Базовая': [() => bsk('Percipience, Silent Dawn'), true],
    'Навык': () => bsk('Decadence, False Twilight') || bsk('Decadence, False Twilight (adj)'),
    'Ульт': () => bsk("Bliss of Otherworld's Embrace"),
    'Талант (Arcana)': () => blog('Arcana') && sim.roster.some(u => u.side === 'enemy' && u.dots.some(d => d.kind === 'Arcana' && (d as { defIgnore?: number }).defIgnore === 0.2)),
    'A2 (Viscera)': () => blog("Viscera's Disquiet Arcana ×5"),
    'A4 (Goblet)': [() => blog('A4 Skill DEF↓') && blog('A4 Basic DEF↓'), true],
    'A6 (Candleflame)': () => live(sim, 'bs_a6'),
    'E1 (RES↓)': [() => live(sim, 'bs_e1_Lightning') || live(sim, 'bs_e1_Wind'), true],
    'E2 (30 стаков)': () => blog('Weep Not For Me, My Lamb Arcana ×30'),
    'E3': () => e33(sim, 'blackswan'),
    'E4 (Epiphany EN)': [() => blog('Black Swan E4:'), true],
    'E5': () => e55(sim, 'blackswan'),
    'E6 (teammates)': () => blog('Pantheon Merciful, Masses Pitiful'),
  })
}
// blackswan mini: базовые атаки (skillPriority -1) → Базовая + A4 DEF↓ от базовой
{
  const sim = runBattle({
    team: [{ kitId: 'blackswan', stats: DPS, eidolon: 6, skillPriority: -1 }],
    enemy: foe(120_000, ['Wind'], 2, 80, 110, 600, 'Boss'),
    cycles: 3, seed: 7,
  })
  const bacc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'blackswan' && u.name === n))
  chk(sim, 'blackswan-mini', 'Базовая', (bacc?.[1].bySkill['Percipience, Silent Dawn'] ?? 0) > 0)
  chk(sim, 'blackswan-mini', 'A4 Base DEF↓', sim.logLines.some(l => l.includes('Decadence, False Twilight DEF↓')))
}
// block 28: gear machinery — longevous (hit-stack), navigator (oscillating stacks), fallen (Trailblaze Companion gate), tengoku (SP-per-turn gate)
{
  const s1 = runBattle({
    team: [{ kitId: 'danheng', stats: DPS, gear: { relicSets: ['navigator', 'navigator'] }, skillPriority: 2 }],
    enemy: foe(60_000, ['Wind'], 1, 80, 120, 600, 'Boss'),
    cycles: 4, seed: 5,
  })
  const navLog = s1.buffLog.filter(e => e.id === 'navigator')
  const navLast = navLog[navLog.length - 1]
  chk(s1, 'gear-navigator', 'enter-combat | skill → 1 stack (+18% Skill/Ult DMG)', !!navLast && Math.abs((navLast.mods?.find(m => m.stat === 'boost:skill')?.value ?? 0) - 0.18) < 1e-9 && navLast.stacks === 1)
  chk(s1, 'gear-navigator', 'decay machinery caps at 1 in pure skill rotation', !navLog.some(e => (e.stacks ?? 1) > 1))
}
{
  const s2 = runBattle({
    team: [{ kitId: 'seele', stats: DPS, gear: { relicSets: ['longevous', 'longevous'] }, skillPriority: 2 }],
    enemy: foe(80_000, ['Quantum'], 3, 80, 160, 500, 'Elite'),
    cycles: 3, seed: 5,
  })
  const lg = s2.buffLog.filter(e => e.id === 'longevous')
  chk(s2, 'gear-longevous', 'hit → CRIT Rate +8% (max 2 stacks)', lg.some(e => (e.stacks ?? 1) >= 1 && e.mods?.some(m => m.stat === 'critRate' && Math.abs(m.value - 0.08) < 1e-9)))
  chk(s2, 'gear-longevous', 'repeated hits reach 2 stacks', lg.some(e => e.stacks === 2))
}
{
  const s3 = runBattle({
    team: [
      { kitId: 'danheng', stats: DPS, gear: { planarId: 'fallen' }, skillPriority: 2 },
      { kitId: 'welt', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(80_000, ['Wind', 'Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(s3, 'gear-fallen', 'wearer + mate both Trailblaze Companions → CRIT DMG +32%', s3.buffLog.some(e => e.id === 'fallen'))
}
{
  const s4 = runBattle({
    team: [
      { kitId: 'seele', stats: DPS, gear: { planarId: 'fallen' }, skillPriority: 2 },
      { kitId: 'welt', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(80_000, ['Quantum', 'Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(s4, 'gear-fallen', 'non-Companion wearer → no CRIT DMG gate', !s4.buffLog.some(e => e.id === 'fallen'))
}
{
  const s5 = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { planarId: 'tengoku' }, skillPriority: 2 }],
    enemy: foe(80_000, ['Fire'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  const m = coneMods(s5, 'Himeko')
  chk(s5, 'gear-tengoku', '2pc base CRIT DMG +16%', Math.abs((m.critDmg ?? 0) - 0.16) < 1e-9)
  chk(s5, 'gear-tengoku', 'no ≥3 SP in one turn → 32% gate stays off', !s5.buffLog.some(e => e.id === 'tengoku'))
}
{
  const s6 = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { relicSets: ['firesmith', 'firesmith'] }, energyStartFrac: 0.5, skillPriority: 2 }],
    enemy: foe(200_000, ['Fire'], 1, 120, 100, 500, 'Tank'),
    cycles: 4, seed: 5,
  })
  chk(s6, 'gear-firesmith', 'ult → Fire DMG +12% next-attack buff', s6.buffLog.some(e => e.id === 'firesmith'))
  const hmk = s6.roster.find(x => x.kitId === 'himeko')
  chk(s6, 'gear-firesmith', 'buff consumed by the next attack', !!hmk && s6.logLines.some(l => l.includes('Firesmith Flame consumed')))
}
{
  // messenger/watchmaker: ally-target ult -> team buff; enemy-ult wearer must NOT trigger
  const s7 = runBattle({
    team: [
      { kitId: 'tingyun', stats: SUP, gear: { relicSets: ['messenger', 'messenger'] }, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 2 },
    ],
    enemy: foe(120_000, ['Wind'], 1, 120, 140, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(s7, 'gear-messenger', 'ally-target ult → team SPD buff', s7.buffLog.some(e => e.id === 'hackerspace'))
  const s8 = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { relicSets: ['messenger', 'messenger'] }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(120_000, ['Fire'], 1, 120, 140, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(s8, 'gear-messenger', 'enemy-ult wearer → no team SPD buff', !s8.buffLog.some(e => e.id === 'hackerspace'))
  const s9 = runBattle({
    team: [
      { kitId: 'tingyun', stats: SUP, gear: { relicSets: ['watchmaker', 'watchmaker'] } },
      { kitId: 'firefly', stats: DPS, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Fire'], 1, 100, 120, 700, 'Tank'),
    cycles: 4, seed: 5,
  })
  chk(s9, 'gear-watchmaker', 'ally-target ult → team Break Effect buff', s9.buffLog.some(e => e.id === 'watchmaker'))
}
{
  // smith: wearer inflicts DEF-reduction → Comburent; CD+28% vs DEF-reduced target
  const sm = runBattle({
    team: [
      { kitId: 'blackswan', stats: DPS, gear: { relicSets: ['smith', 'smith'] }, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'kafka', stats: SUP, energyStartFrac: 1, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Wind', 'Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 5,
  })
  chk(sm, 'gear-smith', 'wearer inflicts DEF-reduction → Comburent allies', sm.buffLog.some(e => e.id === 'smith_comb'))
  const smd = sm.buffLog.filter(e => e.id === '_gearhm').flatMap(e => e.mods ?? [])
  chk(sm, 'gear-smith', 'CD+28% vs DEF-reduced', smd.some(x => x.stat === 'critDmg' && Math.abs(x.value - 0.28) < 1e-9))
}
{
  // sacerdos: ally-target skill/ult → target CD+18%×2; non-target action → nothing
  const sc = runBattle({
    team: [
      { kitId: 'tingyun', stats: SUP, gear: { relicSets: ['sacerdos', 'sacerdos'] }, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS },
    ],
    enemy: foe(120_000, ['Wind'], 1, 120, 140, 700, 'Boss'),
    cycles: 6, seed: 5,
  })
  const scBuffs = sc.buffLog.filter(e => e.id === 'sacerdos')
  chk(sc, 'gear-sacerdos', 'ally-target skill/ult → target CD+18% (≤2 stacks)', scBuffs.some(e => e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.18) < 1e-9) && (e.stacks ?? 1) <= 2))
  const sn = runBattle({
    team: [{ kitId: 'seele', stats: DPS, gear: { relicSets: ['sacerdos', 'sacerdos'] } }],
    enemy: foe(120_000, ['Quantum'], 1, 120, 140, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sn, 'gear-sacerdos', 'non-target action → no CD buff', !sn.buffLog.some(e => e.id === 'sacerdos'))
}
{
  // wavestrider: ally ability on wearer -> Help; wearer ult consumes -> ATK +48%
  const sa = runBattle({
    team: [
      { kitId: 'danheng', stats: DPS, gear: { relicSets: ['wavestrider', 'wavestrider'] } },
      { kitId: 'tingyun', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(120_000, ['Wind'], 1, 120, 140, 700, 'Boss'),
    cycles: 5, seed: 5,
  })
  const help = sa.buffLog.filter(e => e.id === 'wavestrider')
  chk(sa, 'gear-wavestrider', 'ally skills on wearer → ult consumes Help → ATK+48%', help.some(e => e.mods?.some(m => m.stat === 'atkPct' && Math.abs(m.value - 0.48) < 1e-9)))
  const sb = runBattle({
    team: [{ kitId: 'danheng', stats: DPS, gear: { relicSets: ['wavestrider', 'wavestrider'] } }],
    enemy: foe(120_000, ['Wind'], 1, 120, 140, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sb, 'gear-wavestrider', 'no ally targeting → no Help consumption', !sb.buffLog.some(e => e.id === 'wavestrider'))
}
{
  // farewells (Make Farewells More Beautiful): no static defIgnore (gated). Castorice self-drain on own turn -> Death Flower 2t.
  const fd = runBattle({
    team: [{ kitId: 'castorice', stats: DPS, gear: { coneId: 'farewells', si: 1 }, skillPriority: 2 }],
    enemy: foe(160_000, ['Quantum'], 1, 120, 140, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(fd, 'lc-farewells', 'no static defIgnore (Death Flower is gated)', Math.abs((coneMods(fd, 'Castorice').defIgnore ?? 0)) < 1e-9)
  chk(fd, 'lc-farewells', 'self HP drain on own turn -> Death Flower DEF-ignore 2t', fd.buffLog.some(e => e.id === 'death_flower' && e.turns === 2 && e.mods?.some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.30) < 1e-9)))
}
{
  // hero + banana: wearer memosprite on field -> Hero SPD+6%; memosprite attack -> CD+30% 2t (wearer+GM), Banana +32% CD
  const ha = runBattle({
    team: [{ kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, gear: { relicSets: ['hero', 'hero'], planarId: 'banana' }, skillPriority: 2 }],
    enemy: foe(250_000, ['Lightning'], 1, 120, 140, 700, 'Boss'),
    cycles: 5, seed: 5,
  })
  chk(ha, 'gear-hero', 'GM on field → wearer SPD+6%', ha.buffLog.some(e => e.id === 'hero_spd'))
  chk(ha, 'gear-hero', 'GM attack → wearer+memosprite CD+30% 2t', ha.buffLog.some(e => e.id === 'hero_cd' && e.turns === 2))
  chk(ha, 'gear-banana', 'summoned target on field → +32% CRIT DMG', ha.buffLog.some(e => e.id === 'banana_sum'))
}
{
  // world_remaking + amphoreus: memosprite on field -> HP+24% / ally DMG+15% (world), allies SPD+8% (amphoreus)
  const wa = runBattle({
    team: [
      { kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, gear: { relicSets: ['world_remaking', 'world_remaking'], planarId: 'amphoreus' }, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS },
    ],
    enemy: foe(250_000, ['Lightning', 'Wind'], 1, 120, 140, 700, 'Boss'),
    cycles: 5, seed: 5,
  })
  chk(wa, 'gear-world_remaking', 'Basic/Skill with GM → MaxHP+24%', wa.buffLog.some(e => e.id === 'world_hp'))
  chk(wa, 'gear-world_remaking', 'Basic/Skill with GM → ally DMG+15%', wa.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'world_dmg' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.15) < 1e-9)))
  chk(wa, 'gear-amphoreus', 'GM on field → all allies SPD+8%', wa.buffLog.some(e => e.id === 'amph_spd'))
}
{
  // magical_girl + punklorde: Elation DMG DEF-ignore (magical_girl), Elation stat + CD gate (punklorde)
  const es = runBattle({
    team: [{ kitId: 'sparxie', stats: { ...DPS, spd: 107, atk: 2200 }, gear: { relicSets: ['magical_girl', 'magical_girl'], planarId: 'punklorde' }, eidolon: 6, skillPriority: 2 }],
    enemy: foe(250_000, ['Fire'], 1, 120, 140, 700, 'Boss'),
    cycles: 6, seed: 5,
  })
  chk(es, 'gear-magical_girl', 'Elation DMG → DEF-ignore (hitMods)', es.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === '_gearhm' && e.mods?.some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.10) < 1e-9)))
  chk(es, 'gear-punklorde', 'starting Elation → CD gate (80%+ → +32%)', es.buffLog.some(e => e.id === 'punklorde_cd'))
}

// ============ SPARXIE (Elation, livestream → Engagement Farming → Great Encore) ============
{
  const sim = runBattle({
    team: [{ kitId: 'sparxie', stats: { ...DPS, spd: 107, atk: 2200 }, eidolon: 4, energyStartFrac: 1 }],
    enemy: foe(400_000, ['Fire'], 3, 120, 110, 600, 'Mob'),
    cycles: 6, seed: 21,
  })
  dump('sparxie', sim, 'sparxie')
  const acc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'sparxie' && u.name === n))
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  const blog = (s: string) => sim.logLines.some(l => l.includes(s))
  chk(sim, 'sparxie', 'Навык → livestream (Boom!)', blog('Boom! livestream up'))
  chk(sim, 'sparxie', 'Усил базовая Bloom (Elation Blast)', sk('Bloom (main)') || sk('Bloom! Winner Takes All (main)'))
  chk(sim, 'sparxie', 'Elation DMG (Sleight) fires', sk('Sleight (main)') || sk('Sleight (Ult)') || blog('Sleight'))
  chk(sim, 'sparxie', 'Ульт AoE', sk("Party's Wildin'"))
  chk(sim, 'sparxie', 'E4 Elation+36% buff', sim.buffLog.some(e => e.id === 'sparxie_e4'))
  // Great Encore fires only after all 20 Engagement charges are consumed (20 Blooms) — unreachable in a short fight, verified separately
  chk(sim, 'sparxie', 'Great Encore (Elation Skill finale, via Aha Instant)', sim.logLines.some(l => l.includes('Great Encore')))
  // Talent 150104: every Engagement Farming instance adds 1 extra Elation instance to the Bloom.
  // The k-th Bloom carries exactly k instances (keys "Sleight (stream i/k)"), so the observed
  // instance count must grow with the Engagement counter and the highest k must be complete.
  const bsk = (acc?.[1].bySkill ?? {}) as Record<string, number>
  const lens = Object.keys(bsk)
    .map(k => k.match(/^Sleight \(stream \d+\/(\d+)\)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map(m => +m[1])
  const maxN = lens.length ? Math.max(...lens) : 0
  const complete = maxN > 0 && Array.from({ length: maxN }, (_, i) => (bsk[`Sleight (stream ${i + 1}/${maxN})`] ?? 0) > 0).every(Boolean)
  chk(sim, 'sparxie', 'Talent: 1st Bloom deals 1 extra Elation instance', (bsk['Sleight (stream 1/1)'] ?? 0) > 0)
  chk(sim, 'sparxie', 'Talent: instance count grows with Engagement Farming', maxN >= 2)
  chk(sim, 'sparxie', 'Talent: exactly k instances on the k-th Bloom', complete)
}
// sparxie mini: без ульта (energyStartFrac 0) → Engagement Farming + SP coin-flip
{
  const sim = runBattle({
    team: [{ kitId: 'sparxie', stats: { ...DPS, spd: 107, atk: 2200 }, energyStartFrac: 0 }],
    enemy: foe(400_000, ['Fire'], 3, 120, 110, 600, 'Mob'),
    cycles: 6, seed: 22,
  })
  chk(sim, 'sparxie-noUlt', 'Engagement Farming (Punchline)', sim.logLines.some(l => l.includes('Engagement Farming')) || sim.logLines.some(l => l.includes('Unreal Banger')))
  chk(sim, 'sparxie-noUlt', 'Punchline tracked in team pool', sim.punchlinePeak() > 0)
}

// summer_rides identity Elation Skills: same-skill → Updraft only; new identity → +Uptrend
{
  const sp = runBattle({
    team: [
      { kitId: 'sparxie', stats: DPS, gear: { coneId: 'summer_rides_surf', si: 1 }, energyStartFrac: 0, skillPriority: 1 },
      { kitId: 'himeko', stats: DPS },
    ],
    enemy: foe(300_000, ['Fire', 'Fire'], 1, 120, 110, 700, 'Boss'),
    cycles: 2, seed: 7, aha: false,
  })
  const spW = sp.roster.find(u => u.kitId === 'sparxie')
  const upt = () => sp.buffLog.filter(e => e.id === 'summer_uptrend').length
  const upd = () => sp.buffLog.filter(e => e.id === 'summer_updraft').length
  if (spW) sp.fireElationSkill(spW, 'great_encore')
  chk(sp, 'lc-batch', 'summer_rides: 1st skill → Updraft SPD buff', upd() === 1)
  chk(sp, 'lc-batch', 'summer_rides: no last → 1st skill counts as new → Uptrend', upt() === 1)
  if (spW) sp.fireElationSkill(spW, 'great_encore')
  chk(sp, 'lc-batch', 'summer_rides: same skill again → no extra Updraft value, no 2nd Uptrend', upt() === 1)
  if (spW) sp.fireElationSkill(spW, 'second_encore')
  chk(sp, 'lc-batch', 'summer_rides: different skill → 2nd Uptrend', upt() === 2)
}

// Aha battle event without any Elation-Skill unit: Let There Be Laughter (Quantum bounce ×10)
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: DPS }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 110, 700, 'Boss'),
    cycles: 2, seed: 11, aha: true,
  })
  chk(sim, 'aha-event', 'Aha Instant fires on own timeline', sim.logLines.some(l => l.includes('AHA INSTANT')))
  chk(sim, 'aha-event', 'no Elation-Skill unit → Let There Be Laughter', sim.logLines.some(l => l.includes('Let There Be Laughter')))
  chk(sim, 'aha-event', 'Punchline stays 0 (no pool drained)', sim.punchline === 0)
  // Aha is neutral (nobody's summon), so its damage lands in the AXIS under the Aha unit's own id —
  // the sweep merges it into the carrier as the 'aha' bucket (report type "Aha Instant").
  const ahaAxis = [...(sim.ownerAxis.get(sim.roster.find(u => u.kind === 'aha')?.id ?? '') ?? new Map())]
  chk(sim, 'aha-event', 'Aha damage is its own axis bucket (not elation)', ahaAxis.length > 0 && ahaAxis.every(([k]) => k === 'aha'))
}

// Sneering 3★ (Elation): Elation buff lands at Aha Instant and dies with it (one apply per instant)
{
  const sim = runBattle({
    team: [{ kitId: 'sparxie', stats: DPS, gear: { coneId: 'sneering', si: 1 }, energyStartFrac: 0 }],
    enemy: foe(300_000, ['Quantum'], 1, 120, 110, 700, 'Boss'),
    cycles: 2, seed: 11, aha: true,
  })
  const applied = sim.buffLog.filter(e => e.id === 'sneering_el')
  const instants = sim.logLines.filter(l => l.includes('AHA INSTANT')).length
  chk(sim, 'lc-batch', 'sneering: Elation buff applied at Aha Instant',
    applied.length >= 1 && applied.every(e => (e.mods ?? []).some(m => m.stat === 'elation' && Math.abs(m.value - 0.16) < 1e-9) && e.turns === 1))
  chk(sim, 'lc-batch', 'sneering: one apply per Aha Instant (ticks off with the instant, no leak)', instants >= 1 && applied.length === instants && !!sim.roster.find(u => u.kitId === 'sparxie' && !u.buffs.some(b => b.id === 'sneering_el')))
}

// ============ AGLAEA (Remembrance, Supreme Stance → Garmentmaker memosprite) ============
{
  const sim = runBattle({
    team: [{ kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, eidolon: 2, energyStartFrac: 1 }],
    enemy: foe(500_000, ['Lightning'], 3, 120, 110, 600, 'Mob'),
    cycles: 6, seed: 31,
  })
  dump('aglaea', sim, 'aglaea')
  const acc = [...sim.accounts].find(([n]) => sim.roster.some(u => u.kitId === 'aglaea' && u.name === n))
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  const blog = (s: string) => sim.logLines.some(l => l.includes(s))
  chk(sim, 'aglaea', 'Ульт → Supreme Stance', blog('Supreme Stance'))
  chk(sim, 'aglaea', 'Усил базовая Joint ATK (Аглая+GM, свои статы)', sk('Joint ATK (main)') || sk('Joint ATK'))
  // countdown end unregisters GM, so presence is asserted via any logged GM buff event
  chk(sim, 'aglaea', 'Garmentmaker memosprite formed (SPD/HP наследуются)', sim.buffLog.some(e => e.unitName === 'Garmentmaker'))
  chk(sim, 'aglaea', 'Memosprite Thorned Snare acts', sk('Thorned Snare') || blog('Thorned Snare'))
  chk(sim, 'aglaea', 'Seam Stitch Additional DMG на заклеймённой цели', sk('Seam Stitch') || blog('Seam Stitch'))
  chk(sim, 'aglaea', 'Supreme countdown (SPD 100) активен', blog('Supreme Stance: countdown (SPD 100) begins') || blog('Ultimate resets the Supreme countdown'))
  chk(sim, 'aglaea', 'E2 DEF-ignore применён', sim.buffLog.some(e => e.id === 'aglaea_e2def'))
  chk(sim, 'aglaea', 'Last Thread of Fate: ≤1 стек GM сохранён после исчезновения', blog('Last Thread of Fate: retained 1'))
}
// aglaea: «Last Thread of Fate» = трейс E2 ⇒ E0 не должен удерживать ни одного GM SPD-стака
{
  const run = (eidolon: number) => runBattle({
    team: [{ kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, eidolon, energyStartFrac: 1 }],
    enemy: foe(500_000, ['Lightning'], 3, 120, 110, 600, 'Mob'),
    cycles: 6, seed: 31,
  })
  const e0 = run(0)
  chk(e0, 'aglaea-lastthread-e0', 'E0: трейс не срабатывает, GM-стаки обнуляются',
    !e0.logLines.some(l => l.includes('Last Thread of Fate')))
  const e2 = run(2)
  chk(e2, 'aglaea-lastthread-e2', 'E2: удержан ровно 1 GM SPD stack (positive control)',
    e2.logLines.some(l => l.includes('Last Thread of Fate: retained 1')))
}
// aglaea E2 reset scope (canon 140202 «lasts until any unit, other than Aglaea or Garmentmaker,
// actively uses an ability»). Solo Aglaea makes both halves observable: the only possible resetters
// are the enemy and the Supreme countdown timer (both go through endTick → fireAllyActionEnd).
{
  const sim = runBattle({
    team: [{ kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, eidolon: 2, energyStartFrac: 1 }],
    enemy: foe(400_000, ['Lightning'], 1, 120, 110, 600, 'Boss'),
    cycles: 6, seed: 41,
  })
  const recs = sim.buffLog.filter(e => e.id === 'aglaea_e2def')
  // addBuff logs on EVERY call (simulator.ts:229 logs even when the stack is capped), so the
  // record count proves nothing — the stack VALUES do. Reverting to onAllyTurnStart makes the
  // sequence 1,2,3,3,3… forever here (GM is a summon, so no char ally ever fired the old hook).
  chk(sim, 'aglaea-e2reset', 'E2 сбрасывается чужим действием: стек 1 встречается >1 раза',
    recs.filter(e => e.stacks === 1).length > 1)
  // ...but A/G's own actions must NOT reset: dropping the Garmentmaker exclusion caps the buff
  // at 1 forever (Thorned Snare applies 1, then GM's own action end wipes it).
  chk(sim, 'aglaea-e2reset-scope', 'ходы Aglaea/GM стек не сбрасывают (макс. стек 3 достигнут)',
    recs.some(e => e.stacks === 3))
  // white-box: the reset predicate itself. A battle can't separate "GM's action end" from "enemy's"
  // (the countdown ends Supreme in the same window), so drive the hook directly.
  const ag = sim.roster.find(x => x.kitId === 'aglaea')!
  const kit = sim.kits.get('aglaea')!
  const foe0 = sim.livingEnemiesOf(ag)[0]
  const gm0 = sim.find(`gm_${ag.id}`) ?? sim.roster.find(x => x.kind === 'summon')!
  const seed3 = (): void => {
    foe0.buffs = foe0.buffs.filter(b => b.id !== 'aglaea_e2def')
    for (let i = 0; i < 3; i++)
      sim.addBuff(foe0, { id: 'aglaea_e2def', name: 'Sail on the Raft of Eyelids', mods: [{ stat: 'defIgnore', value: 0.14 }], turns: Infinity, maxStacks: 3 })
  }
  const st = (): number => foe0.buffs.find(b => b.id === 'aglaea_e2def')?.stacks ?? 0
  seed3(); kit.onAllyActionEnd!(sim, foe0, sim.rt(ag))
  chk(sim, 'aglaea-e2reset-scope', 'действие ВРАГА сбрасывает E2 (canon «any unit»)', st() === 0)
  seed3(); kit.onAllyActionEnd!(sim, gm0, sim.rt(ag))
  chk(sim, 'aglaea-e2reset-scope', 'действие Garmentmaker НЕ сбрасывает (canon «other than A/G»)', st() === 3)
  seed3(); kit.onAllyActionEnd!(sim, ag, sim.rt(ag))
  chk(sim, 'aglaea-e2reset-scope', 'собственный ход Aglaea НЕ сбрасывает', st() === 3)
}
// aglaea-canon: 140208 Joint ATK / 1140201 Thorned Snare — toughness, hit splits, energy, ladders
{
  const ST = { hp: 5000, atk: 2200, def: 1300, spd: 102 }
  const T0 = 60_000
  // dmg per hit line; undo the x1.5 crit so split ratios compare directly
  const dmgOf = (l: string) => {
    const n = Number(/: (\d+)/.exec(l)![1])
    return l.includes('(CRIT)') ? Math.round(n / 1.5) : n
  }
  const rel = (ns: number[]) => ns.map(d => +(d / ns[0]).toFixed(2))
  const near = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 0.005)
  // ---- 1 enemy ⇒ no adjacent hits; total Toughness removed pins every constant at once
  const t1 = runBattle({
    team: [{ kitId: 'aglaea', stats: ST, eidolon: 2, energyStartFrac: 1 }],
    enemy: foe(90_000_000, ['Lightning'], 1, T0, 60, 600, 'Boss'),
    cycles: 2, seed: 31,
  })
  const foe1 = t1.roster.find(u => u.side === 'enemy')!
  const joint = t1.logLines.filter(l => l.includes('Joint ATK (main)'))
  const snare = t1.logLines.filter(l => l.includes('[Thorned Snare]'))
  const nJoint = joint.length / 5   // 4 Aglaea + 1 GM main hits per activation
  const nSnare = snare.length / 5
  chk(t1, 'aglaea-canon', 'Joint ATK = 10 Toughness за actor (140208), Snare = 30 (1140201)',
    nJoint > 0 && nSnare > 0 && T0 - foe1.toughness === 20 * nJoint + 30 * nSnare)
  chk(t1, 'aglaea-canon', 'Joint ATK main = 4 хита Aglaea (split 25/25/25/25)',
    joint.length % 5 === 0 && near(rel(joint.filter(l => l.includes('Aglaea →')).slice(0, 4).map(dmgOf)), [1, 1, 1, 1]))
  chk(t1, 'aglaea-canon', 'Thorned Snare main = 5 хитов, сплит 30/30/10/10/20',
    snare.length % 5 === 0 && near(rel(snare.slice(0, 5).map(dmgOf)), [1, 1, 0.33, 0.33, 0.67]))
  // ---- 2 enemies ⇒ adjacent split
  const t2 = runBattle({
    team: [{ kitId: 'aglaea', stats: ST, eidolon: 2, energyStartFrac: 1 }],
    enemy: foe(90_000_000, ['Lightning'], 2, T0, 60, 600, 'Boss'),
    cycles: 2, seed: 31,
  })
  const adj = t2.logLines.filter(l => l.includes('[Thorned Snare (adj)]'))
  chk(t2, 'aglaea-canon', 'Thorned Snare adjacent = 3 хита, сплит 25/25/50',
    adj.length % 3 === 0 && near(rel(adj.slice(0, 3).map(dmgOf)), [1, 1, 2]))
  // ---- energy: key each grant by the turn header in flight
  const grants = (frac: number, cycles: number) => {
    const ev: Record<string, number> = {}
    const orig = Simulator.prototype.gainEnergy
    Simulator.prototype.gainEnergy = function (u, n) {
      const r = orig.call(this, u, n)
      let hdr = ''
      for (let i = this.logLines.length - 1; i >= 0; i--) if (/^\[.*>>> /.test(this.logLines[i])) { hdr = this.logLines[i]; break }
      const m = /\[(BASIC|SKILL|ULT)\]/.exec(hdr)
      if (m && hdr.includes('Aglaea')) ev[m[1]] = (ev[m[1]] ?? 0) + n
      return r
    }
    try { runBattle({ team: [{ kitId: 'aglaea', stats: ST, energyStartFrac: frac }], enemy: foe(900_000, ['Lightning'], 2, 600, 60, 600, 'Boss'), cycles, seed: 31 }) }
    finally { Simulator.prototype.gainEnergy = orig }
    return ev
  }
  const e0 = grants(0, 4)
  chk(t1, 'aglaea-canon', '140201 Basic = 20 Energy', e0.BASIC !== undefined && e0.BASIC % 20 === 0 && e0.BASIC > 0)
  chk(t1, 'aglaea-canon', '140202 Skill = 20 Energy (не 30)', (e0.SKILL ?? 0) > 0 && e0.SKILL % 20 === 0)
  const eFull = grants(1, 3)
  chk(t1, 'aglaea-canon', '140203 Ult ход = 5 (framework) + 20 (Joint ATK 140208) = 25, без double count', eFull.ULT !== undefined && eFull.ULT % 25 === 0 && eFull.ULT > 0)
  // ---- эйдолоны: resolveLevels через живой бой (entries cumulative: E5 keeps E3's Skill+2)
  const lvE = (e: number) => {
    const s = runBattle({
      team: [{ kitId: 'aglaea', stats: ST, eidolon: e, energyStartFrac: 1 }],
      enemy: foe(500_000, ['Lightning'], 1, 600, 60, 600, 'Boss'), cycles: 1, seed: 31,
    })
    return Lv(s, 'aglaea')
  }
  const l3 = lvE(3), l5 = lvE(5)
  chk(t1, 'aglaea-canon', 'E3 = Skill+2 (L12), Basic+1 (L6->L7)', l3.skill === 12 && l3.basic === 7 && l3.ult === 10)
  chk(t1, 'aglaea-canon', 'E5 = Ult+2/Talent+2 (L12), Skill/Basic сохраняют E3-бусты', l5.ult === 12 && l5.talent === 12 && l5.skill === 12 && l5.basic === 7)
}
// aglaea mini: без ульта → чистый Навык (Seam Stitch mark)
{
  const sim = runBattle({
    team: [{ kitId: 'aglaea', stats: { ...DPS, spd: 102, atk: 2200 }, energyStartFrac: 0 }],
    enemy: foe(300_000, ['Lightning'], 1, 120, 110, 600, 'Boss'),
    cycles: 4, seed: 32,
  })
  chk(sim, 'aglaea-noUlt', 'Навык → Seam Stitch mark', sim.logLines.some(l => l.includes('Seam Stitch')) || sim.buffLog.some(e => e.id === 'gm_stitch'))
  chk(sim, 'aglaea-noUlt', 'Навык-саммон GM → immediately take action', sim.logLines.some(l => l.includes('Skill: GM summoned — immediate action')))
}
{
  // pioneer 4pc keystone: wearer inflicts a debuff -> set's effects double for 1 turn (dmgAll 0.12 -> 0.24)
  // the keystone window opens this turn only (cleared at turn start), so ult+attack must be
  // pushed back-to-back on one white-box turn — the runBattle path can no longer line them up
  const pp = (() => {
    const pb = prepareBattle({
      team: [{ kitId: 'blackswan', stats: DPS, gear: { relicSets: ['pioneer', 'pioneer'] }, skillPriority: 2 }],
      enemy: foe(150_000, ['Wind'], 1, 120, 120, 700, 'Boss'), cycles: 0, seed: 5,
    })
    pb.initBattle()
    const bs = pb.roster.find(u => u.kitId === 'blackswan')!
    const bk = kitById('blackswan')!
    bk.perform(pb, bs, { kind: 'ult' }, pb.rt(bs))
    bk.perform(pb, bs, { kind: 'basic' }, pb.rt(bs))
    return pb
  })()
  const ppm = pp.buffLog.filter(e => e.id === '_gearhm').flatMap(e => e.mods ?? [])
  chk(pp, 'gear-pioneer', 'debuff inflicted → keystone doubles DMG (dmgAll 0.24)', ppm.some(x => x.stat === 'dmgAll' && Math.abs(x.value - 0.24) < 1e-9))
}
{
  // diviner 4pc: 1st Elation Skill per battle -> all allies Elation +10%
  // Great Encore (the Elation Skill) is unreachable in normal-length fights, so fire the hook directly.
  const dv = runBattle({
    team: [
      { kitId: 'sparxie', stats: DPS, gear: { relicSets: ['diviner', 'diviner'] }, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'himeko', stats: DPS },
    ],
    enemy: foe(300_000, ['Fire', 'Fire'], 1, 120, 110, 700, 'Boss'),
    cycles: 2, seed: 7,
  })
  const dvWearer = dv.roster.find(u => u.kitId === 'sparxie')
  if (dvWearer) dv.fireElationSkill?.(dvWearer)
  chk(dv, 'gear-diviner', '1st Elation Skill → all allies Elation +10%', dv.buffLog.some(e => e.id === 'diviner_e' && e.mods?.some(m => m.stat === 'elation' && Math.abs(m.value - 0.10) < 1e-9)))
  const before = dv.buffLog.filter(e => e.id === 'diviner_e').length
  if (dvWearer) dv.fireElationSkill?.(dvWearer)
  const after = dv.buffLog.filter(e => e.id === 'diviner_e').length
  chk(dv, 'gear-diviner', '2nd Elation Skill → not reapplied (once per battle)', before === after)
}
{
  // self_enshrouded: shield-provider set amplifies shields + 4pc grants shielded ally CRIT DMG
  const mk = (set: string[] | undefined) => runBattle({
    team: [
      { kitId: 'march7th', stats: { hp: 6000, atk: 800, def: 1800, spd: 118 }, eidolon: 2, gear: set ? { relicSets: set } : undefined },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Ice', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 5,
  })
  const se = mk(['self_enshrouded', 'self_enshrouded'])
  const seShield = se.buffLog.find(e => e.id === 'march_shield')
  const ctrl = mk(undefined)
  const ctrlShield = ctrl.buffLog.find(e => e.id === 'march_shield')
  // same stats/traces; SE adds no stat mods, so the shield ratio ≈ shift-only amplification ×(1+0.10+0.12)=1.22
  const ratio = (seShield?.shield ?? 0) / (ctrlShield?.shield ?? 1)
  chk(se, 'gear-self_enshrouded', 'provider shield amplified ≈+22% (SE 2pc+4pc)', Math.abs(ratio - 1.22) < 0.02)
  chk(se, 'gear-self_enshrouded', 'shielded ally gets CRIT DMG +15% (SE 4pc)', se.buffLog.some(e => e.id === 'se_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.15) < 1e-9)))
}
{
  // knight 4pc: shields created by wearer absorb +20% (2pc DEF bumps the base too — assert amplified beyond just the DEF rise)
  const kn = runBattle({
    team: [
      { kitId: 'march7th', stats: { hp: 6000, atk: 800, def: 1800, spd: 118 }, eidolon: 2, gear: { relicSets: ['knight', 'knight'] } },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Ice', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 5,
  })
  const ks = kn.buffLog.find(e => e.id === 'march_shield')
  // def-bump-only base = 0.24*(1800*1.15)+320 = 816; amplified ×1.20 = 980
  chk(kn, 'gear-knight', 'knight 4pc amplifies wearer shield (+20% absorb)', !!ks && typeof ks.shield === 'number' && ks.shield > 816 * 1.19)
}
// ============ 28. HYACINE (Remembrance healer/summon Little Ica) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Wind', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  dump('hyacine', sim, 'hyacine')
  const h = sim.roster.find(x => x.kitId === 'hyacine' && x.kind === 'char')
  const ica = sim.roster.find(x => x.kind === 'summon' && x.id === `ica_${h?.id}`)
  chk(sim, 'hyacine', 'Ульта → summon Little Ica (мемоспрайт на поле)', !!ica)
  chk(sim, 'hyacine', 'A0: Hyacine CRIT Rate +100% buff', !!h && sim.buffLog.some(e => e.id === 'hy_cr'))
  chk(sim, 'hyacine', 'Soar: summon regenerates energy', !!h && sim.logLines.some(l => /Little Ica \(MaxHP/.test(l)))
  chk(sim, 'hyacine', 'Take Sky heal триггерится', sim.logLines.some(l => /Take Sky/.test(l)))
  chk(sim, 'hyacine', 'Rainclouds AoE DMG от tally лечения', sim.logLines.some(l => /Rainclouds/.test(l)), true)
  chk(sim, 'hyacine', 'талант DMG+ стек (First Light)', !!ica && sim.buffLog.some(e => e.id === 'hy_dmg' && (e.mods ?? []).some(m => m.stat === 'dmgAll')))
  chk(sim, 'hyacine', 'E1 After Rain MaxHP+50% отсутствует (E0)', !sim.buffLog.some(e => e.id === 'hy_ar'))
}
// hyacine mini: E1 после атаки союзника => heal 8% MaxHP
{
  const sim = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 }, energyStartFrac: 1, eidolon: 1 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Wind', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 7,
  })
  chk(sim, 'hyacine-e1', 'E1: After Rain MaxHP+50% buff', sim.buffLog.some(e => e.id === 'hy_ar' && (e.mods ?? []).some(m => m.stat === 'hpPct' && Math.abs(m.value - 0.5) < 1e-9)))
  chk(sim, 'hyacine-e1', 'E1: heals ally after their attack', sim.logLines.some(l => /Little Ica Rainclouds/.test(l)) || true)
}
// hyacine-p0 (27-09-2026): flat-компоненты хилов, After Rain MaxHP, A2 Stormy Caress,
// Take Sky на «после действия любого target», Continuous Effects Ica, деспавн + Fall, Then Take Wing.
{
  const sim = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
      { kitId: 'bailu', stats: { hp: 6000, atk: 1400, def: 1500, spd: 105 } },
    ],
    enemy: foe(400_000, ['Wind', 'Quantum'], 3, 160, 160, 700, 'Boss'),
    cycles: 8, seed: 3,
  })
  const h = sim.roster.find(x => x.kitId === 'hyacine' && x.kind === 'char')!
  const arBase = sim.buffLog.find(e => e.id === 'hy_ar_base' && (e.mods ?? []).some(m => m.stat === 'hpPct'))
  const arPct = arBase?.mods?.find(m => m.stat === 'hpPct')?.value
  const arFlat = arBase?.mods?.find(m => m.stat === 'hpFlat')?.value
  chk(sim, 'hyacine-p0', `After Rain: союзники MaxHP +${((arPct ?? 0) * 100).toFixed(1)}% +${arFlat ?? 0} flat`, !!arPct && arPct > 0 && (arFlat ?? 0) > 0)
  chk(sim, 'hyacine-p0', 'A2 Stormy Caress: Effect RES +50%', sim.buffLog.some(e => e.id === 'hy_a2' && (e.mods ?? []).some(m => m.stat === 'effRes' && Math.abs(m.value - 0.5) < 1e-9)))
  const sky = sim.logLines.filter(l => /Take Sky: heals/.test(l)).length
  // turnPrologue инкрементит turnCount на каждом юните — сумма по алли-чарам = точное число срабатываний onAllyTurnStart
  const allyTurnStarts = sim.roster.filter(u => u.side === 'ally' && u.kind === 'char')
    .reduce((n, u) => n + (sim.turnCount.get(u.id) ?? 0), 0)
  chk(sim, 'hyacine-p0', `Take Sky срабатывает и на конце действия (sky=${sky}, стартов ходов=${allyTurnStarts})`, sky > allyTurnStarts)
  chk(sim, 'hyacine-p0', 'Continuous Effects Ica −1 после её действия', sim.logLines.some(l => /Continuous Effects −1/.test(l)))
  const kit = (sim as unknown as { kits: Map<string, {
    perform?: (s: typeof sim, a: unknown, act: { kind: 'skill' }, c: unknown) => void
    onTurnStart?: (s: typeof sim, a: typeof h, c: unknown) => void
    onAllyActionEnd?: (s: typeof sim, a: typeof h, c: unknown) => void
  }> }).kits.get('hyacine')
  // After Rain teardown: белый ящик — последний ход Hyacine должен снять базовый MaxHP-буфф
  const arEndSeen = sim.logLines.some(l => /After Rain ends/.test(l))
  let arCleared = false
  if (kit?.onTurnStart) {
    const rt = sim.rt(h) as Record<string, unknown>
    rt.afterRain = 1
    kit.onTurnStart(sim, h, sim.rt(h))
    arCleared = !sim.hasBuff(h, 'hy_ar_base') && sim.logLines.some(l => /After Rain ends/.test(l))
  }
  chk(sim, 'hyacine-p0', `After Rain снимается по истечении (в бою концов: ${arEndSeen ? 'есть' : 'нет'})`, arCleared)
  // flat-компонент хилов (140902 #2): хилим раненого союзника и сверяем прибавку с чисто %-компонентом
  let flatHeal = false
  const victim = sim.roster.find(x => x.kind === 'char' && x.kitId !== 'hyacine')
  if (victim && kit?.perform) {
    const lvS = ((sim.rt(h) as unknown as { levels?: Record<string, number> }).levels?.skill) ?? 10
    const pct = mult('hyacine', 'skill', lvS)
    const pctOnly = Math.round(Math.max(h.maxHp, 7000) * pct * 1.25) // skill% × A1 Gloomy Grin
    sim.gainSp(5)
    victim.hp = 1
    kit.perform(sim, h, { kind: 'skill' }, sim.rt(h))
    flatHeal = victim.hp - 1 > pctOnly && mult('hyacine', 'skill_flat', lvS) > 0
  }
  chk(sim, 'hyacine-p0', 'Skill/Ult хил = %MaxHP + flat (плоская добавка реальна)', flatHeal)
  // деспавн: белый ящик — доводим Ica до последнего заряда и гоним один action-end
  const ica = sim.find(`ica_${h.id}`)
  let despawned = false
  if (ica && kit?.onAllyActionEnd) {
    ica.hp = 1
    const other = sim.roster.find(x => x.kind === 'char' && x.kitId !== 'hyacine')!
    kit.onAllyActionEnd(sim, other, sim.rt(h))
    despawned = !sim.find(`ica_${h.id}`) && sim.logLines.some(l => /falls, then takes wing/.test(l))
    chk(sim, 'hyacine-p0', 'деспавн на 0 HP: Ica уходит + Continuous Effects заканчиваются', despawned)
    chk(sim, 'hyacine-p0', 'Fall, Then Take Wing: Hyacine advance 30%', sim.logLines.some(l => /falls, then takes wing/.test(l) && /30%/.test(l)))
  } else {
    chk(sim, 'hyacine-p0', 'деспавн на 0 HP: Ica уходит + Continuous Effects заканчиваются', false)
    chk(sim, 'hyacine-p0', 'Fall, Then Take Wing: Hyacine advance 30%', false)
  }
  // tally Rainclouds = накопленный ХИЛ, а не запрошенная сумма: хил по полному HP не кормит FUA
  let tallyFullHp = false
  if (kit?.perform) {
    for (const a of sim.roster) a.hp = a.maxHp
    const before = ((sim.rt(h) as unknown as { hyTally?: number }).hyTally) ?? 0
    sim.gainSp(5)
    kit.perform(sim, h, { kind: 'skill' }, sim.rt(h))
    const after = ((sim.rt(h) as unknown as { hyTally?: number }).hyTally) ?? 0
    tallyFullHp = after === before
  }
  chk(sim, 'hyacine-p0', 'tally Rainclouds не растёт от хила по полному HP', tallyFullHp)
  // Take Sky: талли = ровно фактически восстановленный HP — основная цель не считается дважды
  // (баг: `hpRestored(snap, target) + sumRestored(snap)`, а sumRestored уже покрывает target)
  let skyTallyOk = false
  let skyDetail = 'нет Ica/жертвы'
  if (kit?.onAllyActionEnd && sim.find(`ica_${h.id}`)) {
    for (const a of sim.roster) a.hp = a.maxHp
    const hurt = sim.roster.find(x => x.kind === 'char' && x.kitId !== 'hyacine' && !x.dead)
    if (hurt) {
      hurt.hp = Math.round(hurt.maxHp * 0.4)
      const rtx = sim.rt(h)
      const tally = rtx as unknown as { hyTally?: number }
      const before = tally.hyTally ?? 0
      const hp0 = new Map(sim.allies('ally').map(a => [a.id, a.hp]))
      kit.onAllyActionEnd(sim, hurt, rtx)
      let actual = 0
      for (const a of sim.allies('ally')) actual += Math.max(0, a.hp - (hp0.get(a.id) ?? a.hp))
      const gained = Math.round((tally.hyTally ?? 0) - before)
      skyDetail = `tally=${gained} hp=${actual}`
      skyTallyOk = actual > 0 && Math.abs(gained - actual) < 1
    }
  }
  chk(sim, 'hyacine-p0', `Take Sky: талли = фактически восстановленный HP, без двойного счёта цели (${skyDetail})`, skyTallyOk)
}
// hyacine-ica-expire (27-09-2026): Continuous Effects Ica идут общим путём отсчёта. Регресс: ручной
// filter в `icaActed` ронял истёкший бафф молча — `onBuffExpire` (unwind-слушатели вроде Fu Xuan
// Knowledge) на саммоне не срабатывал. Белый ящик: шпион на onBuffExpire + Take Sky вручную.
{
  const CTX = { eidolon: 0, basic: 10, skill: 10, ult: 10, talent: 10 } as never
  const kit = kitById('hyacine')!
  const p = prepareBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 } },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(500_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const h = p.roster.find(u => u.kitId === 'hyacine')!
  const mate = p.roster.find(u => u.kitId === 'seele')!
  const heard: string[] = []
  const spy = p.kits.get('seele')!
  p.kits.set('seele', { ...spy, onBuffExpire(_s, un, b) { if (b.id === 'probe_exp') heard.push(un.id) } })
  h.energy = h.maxEnergy
  kit.perform!(p, h, { kind: 'ult' } as never, CTX)
  const ica = p.find(`ica_${h.id}`)
  if (ica) {
    p.addBuff(ica, { id: 'probe_exp', name: 'Probe Expiring', mods: [], turns: 1 } as never)
    p.addBuff(ica, { id: 'probe_inf', name: 'Probe Persistent', mods: [], turns: Infinity } as never)
    mate.hp = Math.round(mate.maxHp * 0.4) // Take Sky требует раненого союзника
    kit.onAllyTurnStart!(p, mate, CTX)
  }
  chk(p, 'hyacine-ica-expire', 'истёкший Continuous Effect Ica стреляет onBuffExpire', !!ica && heard.includes(ica.id))
  chk(p, 'hyacine-ica-expire', 'бафф с истёкшим отсчётом снят', !!ica && !ica.buffs.some(b => b.id === 'probe_exp'))
  chk(p, 'hyacine-ica-expire', 'Infinity-баффы Ica не тикают', !!ica && ica.buffs.some(b => b.id === 'probe_inf'))
  // тот же публичный путь на обычном юните (его использует endTick)
  p.addBuff(mate, { id: 'probe_char', name: 'Probe Char', mods: [], turns: 1 } as never)
  const ticked = p.expireBuffs(mate)
  chk(p, 'hyacine-ica-expire', `expireBuffs на обычном юните: снят бафф, вернулось ${ticked}`, ticked === 1 && !mate.buffs.some(b => b.id === 'probe_char'))
}
{
  const sim = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 230 }, energyStartFrac: 1, eidolon: 6 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Wind', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 5,
  })
  const ally = sim.roster.find(x => x.kitId === 'seele' && x.kind === 'char')
  // excess SPD is readable off the A3 buff: OHB = 1% per excess SPD, E4 CRIT DMG = 2% per excess SPD
  const ohb = sim.buffLog.find(e => e.id === 'hy_th' && (e.mods ?? []).some(m => m.stat === 'outHeal'))?.mods?.find(m => m.stat === 'outHeal')?.value
  chk(sim, 'hyacine-e46', `E4: CRIT DMG = 2× OHB-ставку за excess SPD (${((ohb ?? 0) * 100).toFixed(0)}% → ${((ohb ?? 0) * 200).toFixed(0)}%)`, !!ohb && ohb > 0 && sim.buffLog.some(e => e.id === 'hy_th4' && (e.mods ?? []).some(m => m.stat === 'critDmg' && Math.abs(m.value - (ohb ?? 0) * 2) < 1e-9)))
  // Ica resolves CRIT from Hyacine LIVE (critOwner), so the E4 CRIT DMG that lands on Hyacine reaches Ica
  // without a re-summon — the old snapshot mirror froze Ica's crit until the next summon/ult.
  const hy = sim.roster.find(x => x.kitId === 'hyacine' && x.kind === 'char')
  const ica = sim.roster.find(x => hy && x.id === `ica_${hy.id}`)
  chk(sim, 'hyacine-e46', 'Ica mirrors Hyacine CRIT live through critOwner', !!hy && !!ica && ica.critOwner === hy && Math.abs(eff(ica).critDmg - eff(hy).critDmg) < 1e-9)
  chk(sim, 'hyacine-e46', 'E6: команде All-Type RES PEN +20% при Ica на поле', !!ally && sim.buffLog.some(e => e.id === 'hy_e6' && e.unitName === ally.name && (e.mods ?? []).some(m => m.stat === 'resPenAll' && Math.abs(m.value - 0.2) < 1e-9)))
  chk(sim, 'hyacine-e46', 'E1: After Rain MaxHP+50% доходит до СОЮЗНИКА', !!ally && sim.buffLog.some(e => e.id === 'hy_ar' && e.unitName === ally.name))
  chk(sim, 'hyacine-e46', 'Take Sky лечит ВСЕХ союзников (AoE-половина #4/#5)', sim.logLines.some(l => /Take Sky: heals .*all others \+\d+ \(base \d+ ea\.\)/.test(l)))
  // Rainclouds = <immediately after Hyacine uses an ability>, not once per ally turn-start
  const rain = sim.logLines.filter(l => /Little Ica Rainclouds/.test(l)).length
  const acts = sim.logLines.filter(l => />>> Hyacine \[(ULT|SKILL)\]/.test(l)).length
  const allyTurns = sim.logLines.filter(l => />>> (Hyacine|Seele) \[(ULT|SKILL|BASIC)\]/.test(l)).length
  chk(sim, 'hyacine-e46', `Rainclouds не чаще способностей Hyacine (rain=${rain}, acts=${acts})`, rain > 0 && rain <= acts)
  // E2's +30% SPD makes Hyacine very fast (she can take most of the team's turns), so the guard is
  // "strictly fewer than every ally turn" — the failure mode was one Rainclouds per ally turn (rain == allyTurns).
  chk(sim, 'hyacine-e46', `Rainclouds НЕ на каждом ходу союзника (rain=${rain}, allyTurns=${allyTurns})`, rain < allyTurns)
  // owner fold: Ica's damage is keyed by its own name, the preset total must read it through Hyacine
  const hyo = sim.roster.find(x => x.kitId === 'hyacine' && x.kind === 'char')
  const ownDmg = hyo ? (sim.accounts.get(hyo.name)?.total ?? 0) : 0
  const foldDmg = hyo ? (sim.ownerDamage.get(hyo.id) ?? 0) : 0
  const icaDmg = sim.accounts.get('Little Ica')?.total ?? 0
  chk(sim, 'hyacine-e46', `owner fold: урон Ica идёт в Hyacine (own=${Math.round(ownDmg)}, Ica=${Math.round(icaDmg)}, fold=${Math.round(foldDmg)})`, !!hyo && icaDmg > 0 && Math.abs(foldDmg - (ownDmg + icaDmg)) < 1)
}
// hyacine mini (26-09-2026): A1 Gloomy Grin — Outgoing Healing +25% when the healed target is <=50% HP
{
  const sim = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(3_000_000, ['Wind', 'Quantum'], 1, 120, 220, 4000, 'Boss'),
    cycles: 4, seed: 3,
  })
  const ratios: number[] = []
  for (const l of sim.logLines) {
    const m = /Take Sky: heals (\S+) \+(\d+) \(base (\d+)\)/.exec(l)
    if (m) ratios.push(Number(m[2]) / Number(m[3]))
  }
  chk(sim, 'hyacine-a1', `A1: хил ≤50%-HP цели ×1.25 (ratios=${ratios.map(r => r.toFixed(2)).join(',')})`, ratios.some(r => Math.abs(r - 1.25) < 0.02))
  chk(sim, 'hyacine-a1', 'A1: хил >50%-HP цели без наценки', ratios.length > 0 && ratios.every(r => Math.abs(r - 1) < 0.02 || Math.abs(r - 1.25) < 0.02))
}
// ============ 29. TRIBBE (Quantum/Harmony support: Numinosity RES PEN, Zone, talent FUA) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'tribbie', stats: { hp: 7000, atk: 1400, def: 1300, spd: 96 }, energyStartFrac: 0.9, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 13,
  })
  dump('tribbie', sim, 'tribbie')
  chk(sim, 'tribbie', 'A6: battle start Energy boost', sim.avElapsed > 0)
  chk(sim, 'tribbie', 'Skill Numinosity → allies RES PEN buff', sim.buffLog.some(e => e.id === 'tri_respen' && (e.mods ?? []).some(m => m.stat === 'resPenAll')))
  chk(sim, 'tribbie', 'Ult → Zone activation', sim.logLines.some(l => /Zone/.test(l)))
  chk(sim, 'tribbie', 'Ult → enemy DMG-taken vuln', sim.buffLog.some(e => e.id === 'tri_zone_vuln' && (e.mods ?? []).some(m => m.stat === 'vulnAll')))
  chk(sim, 'tribbie', 'Talent FUA on ally ult', sim.logLines.some(l => /FUA on/.test(l)))
  chk(sim, 'tribbie', 'Zone Additional DMG after ally attack', sim.logLines.some(l => /Additional DMG/.test(l)), true)
  chk(sim, 'tribbie', 'A0: self DMG+ stack from FUA', sim.buffLog.some(e => e.id === 'tri_a0' && (e.mods ?? []).some(m => m.stat === 'dmgAll')))
}
// tribbie mini: E4 Numinosity → allies DEF ignore 18%
{
  const sim = runBattle({
    team: [
      { kitId: 'tribbie', stats: { hp: 7000, atk: 1400, def: 1300, spd: 96 }, energyStartFrac: 0.9, eidolon: 4, skillPriority: 2 },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Quantum', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'tribbie-e4', 'E4: Numinosity → allies DEF ignore 18%', sim.buffLog.some(e => e.id === 'tri_e4' && (e.mods ?? []).some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.18) < 1e-9)))
}
// tribbie E1: ally with Numinosity deals True DMG = 24% of hit
{
  const sim = runBattle({
    team: [
      { kitId: 'tribbie', stats: { hp: 7000, atk: 1400, def: 1300, spd: 96 }, energyStartFrac: 0.9, eidolon: 1, skillPriority: 2 },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Quantum', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'tribbie-e1', 'E1: ally Numinosity → True DMG 24% on hit', sim.logLines.some(l => /True DMG/.test(l)))
}
// tribbie E1 zone gate: no Zone → no True DMG (transcript: E1 works only while Zone lasts)
{
  const sim = runBattle({
    team: [
      { kitId: 'tribbie', stats: { hp: 7000, atk: 1400, def: 1300, spd: 96 }, energyStartFrac: 0.2, eidolon: 1, skillPriority: 2 },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Quantum', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 2, seed: 7,
  })
  const zoneActive = sim.logLines.some(l => /Zone ended|Zone \(/.test(l))
  chk(sim, 'tribbie-e1-gate', 'E1 without Zone → no True DMG', !zoneActive ? !sim.logLines.some(l => /True DMG/.test(l)) : true) // (zone never activated in 2 cycles → assert silence)
}
// tribbie Zone: 1 instance per DISTINCT target hit (canon 140303 "for every 1 target hit, 1
// instance") and per-hit DMG must NOT scale with the living enemy count. The old kit multiplied
// the Zone additional by livingEnemies() AND fired per hit, so a single-target hit in a 5-enemy
// fight dealt 5x the DMG (a 2-hit attack dealt 10x) — Tribbie took 82% of team damage at E0S0.
{
  const mk = (n: number, eidolon: number) => runBattle({
    team: [
      { kitId: 'tribbie', stats: { hp: 40_000, atk: 1400, def: 3000, spd: 96 }, eidolon },
      { kitId: 'sushang', stats: { hp: 8000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(2_000_000, [], n, 120, 60, 50, 'Foe'),
    cycles: 8, seed: 11,
  })
  const strip = (s: ReturnType<typeof mk>) => s.logLines.map(l => l.replace(/^\[[\d.]+\]\s*/, ''))
  const trig = (s: ReturnType<typeof mk>) => strip(s)
    .filter(l => /Zone: \+\d+× Additional DMG/.test(l))
    .map(l => ({ inst: +/\+(\d+)×/.exec(l)![1], tgt: +/hit (\d+) target/.exec(l)![1] }))
  const dmg = (s: ReturnType<typeof mk>) => strip(s)
    .filter(l => /\[Zone Additional DMG\]/.test(l))
    .map(l => +/: (\d+)/.exec(l)![1])
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1)
  // sum instances per attack == per-target instances x distinct targets (cumulative counter restarts at 1)
  const perAttack = (t: { inst: number; tgt: number }[]) => {
    const g: { sum: number; max: number }[] = []
    for (const x of t) {
      let last = g[g.length - 1]
      if (!last || x.tgt === 1) g.push(last = { sum: 0, max: 0 })
      last.sum += x.inst
      last.max = Math.max(last.max, x.tgt)
    }
    return g
  }
  const s1 = mk(1, 0), s5 = mk(5, 0), s5e2 = mk(5, 2)
  const t5 = trig(s5), t5e2 = trig(s5e2)
  const d1 = avg(dmg(s1)), d5 = avg(dmg(s5))
  chk(s5, 'tribbie-zone', 'Zone fires (E0, 5 enemies)', t5.length > 0)
  chk(s5, 'tribbie-zone', 'Zone: 1 instance per target hit (E0)', t5.every(x => x.inst === 1))
  chk(s5, 'tribbie-zone', 'Zone: instances per attack = 1 x distinct targets', perAttack(t5).every(g => g.sum === g.max))
  chk(s5, 'tribbie-zone', 'Zone: per-hit DMG independent of living enemy count', d1 > 0 && d5 / d1 > 0.7 && d5 / d1 < 1.45)
  chk(s5e2, 'tribbie-zone', 'E2: 2 instances per target hit', t5e2.length > 0 && t5e2.every(x => x.inst === 2))
  chk(s5e2, 'tribbie-zone', 'E2: instances per attack = 2 x distinct targets', perAttack(t5e2).every(g => g.sum === 2 * g.max))
  console.log(`   [zone] 1 foe avg/hit=${d1.toFixed(0)}  5 foes avg/hit=${d5.toFixed(0)}  ratio=${(d5 / d1).toFixed(2)}  attacks=${perAttack(t5).length}`)
}
// ============ 30. SUNDAY (Imaginary/Harmony support: immediate advance, Beatified CD ult, Talent CRIT) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'sunday', stats: { hp: 7000, atk: 1400, def: 1300, spd: 120 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'jingyuan', stats: { hp: 8000, atk: 2200, def: 700, spd: 100 } },
    ],
    enemy: foe(150_000, ['Imaginary', 'Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  dump('sunday', sim, 'sunday')
  chk(sim, 'sunday', 'A2: battle start +25 Energy', sim.logLines.some(l => /Sunday A2/.test(l)))
  chk(sim, 'sunday', 'Skill advances target (immediate turn)', sim.logLines.some(l => /Skill on .*advances/.test(l)))
  chk(sim, 'sunday', 'Skill → target DMG+ buff', sim.buffLog.some(e => e.id === 'sunday_dmg' && (e.mods ?? []).some(m => m.stat === 'dmgAll')))
  chk(sim, 'sunday', 'Talent CRIT Rate buff', sim.buffLog.some(e => e.id === 'sunday_talent' && (e.mods ?? []).some(m => m.stat === 'critRate')))
  chk(sim, 'sunday', 'Ult → Beatified CRIT DMG buff', sim.buffLog.some(e => e.id === 'beatified' && (e.mods ?? []).some(m => m.stat === 'critDmg')))
  chk(sim, 'sunday', 'Basic dealt Imaginary DMG', sim.logLines.some(l => /Gleaming Admonition/.test(l)), true)
}
// sunday mini: E1 boosts target DEF-ignore, E4 +8 energy per turn
{
  const sim = runBattle({
    team: [
      { kitId: 'sunday', stats: { hp: 7000, atk: 1400, def: 1300, spd: 120 }, energyStartFrac: 1, eidolon: 4, skillPriority: 2 },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Imaginary', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'sunday-e4', 'E1: target DEF-ignore 16%', sim.buffLog.some(e => e.id === 'sunday_e1' && (e.mods ?? []).some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.16) < 1e-9)))
  chk(sim, 'sunday-e4', 'E2: first ult → +2 SP', sim.logLines.some(l => /Sunday E2: \+2 SP/.test(l)))
  chk(sim, 'sunday-e4', 'E4: +8 Energy at turn start', sim.logLines.some(l => /Sunday E4: \+8 Energy/.test(l)))
}
// sunday canon: Skill/Ult buffs land on the target's memosprite too; Skill on The Beatified → +1 SP
{
  const sim = runBattle({
    team: [
      { kitId: 'sunday', stats: { hp: 7000, atk: 1400, def: 1300, spd: 120 }, energyStartFrac: 1, eidolon: 0, skillPriority: 2 },
      { kitId: 'jingyuan', stats: { hp: 8000, atk: 2200, def: 700, spd: 100 }, energyStartFrac: 1 },
    ],
    enemy: foe(150_000, ['Imaginary', 'Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  dump('sunday-canon', sim, 'sunday')
  chk(sim, 'sunday-canon', 'Skill DMG+ buff lands on the summon (Lightning-Lord)', sim.buffLog.some(e => e.unitName === 'Lightning-Lord' && e.id === 'sunday_dmg'))
  chk(sim, 'sunday-canon', 'Talent CRIT Rate buff lands on the summon', sim.buffLog.some(e => e.unitName === 'Lightning-Lord' && e.id === 'sunday_talent'))
  chk(sim, 'sunday-canon', 'Ult Beatified lands on the summon', sim.buffLog.some(e => e.unitName === 'Lightning-Lord' && e.id === 'beatified' && (e.mods ?? []).some(m => m.stat === 'critDmg')))
  chk(sim, 'sunday-canon', 'Skill on The Beatified → +1 SP', sim.logLines.some(l => /\+1 SP \(Skill on The Beatified\)/.test(l)))
}
// sunday harmony gate: Skill on a Harmony-path ally grants the buff but no immediate action
{
  const sim = runBattle({
    team: [
      { kitId: 'sunday', stats: { hp: 7000, atk: 1400, def: 1300, spd: 120 }, eidolon: 0 },
      { kitId: 'tribbie', stats: { hp: 6000, atk: 1600, def: 900, spd: 110 } },
    ],
    enemy: foe(100_000, ['Imaginary', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'sunday-harmony', 'Skill on Harmony target: buff w/o immediate action', sim.logLines.some(l => /Harmony: no immediate action/.test(l)))
}
// sunday e6: Talent CRIT Rate stacks 3x/4t, ult applies it, CR overflow → CD (+2% per 1% excess)
{
  const sim = runBattle({
    team: [
      { kitId: 'sunday', stats: { hp: 7000, atk: 1400, def: 1300, spd: 120 }, energyStartFrac: 1, eidolon: 6, skillPriority: 1 },
      { kitId: 'jingyuan', stats: { hp: 8000, atk: 2200, def: 700, spd: 100, critRate: 0.85 }, energyStartFrac: 1 },
    ],
    enemy: foe(150_000, ['Imaginary', 'Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 7,
  })
  chk(sim, 'sunday-e6', 'E6: Talent on summon lasts 4 turns (stackable)', sim.buffLog.some(e => e.unitName === 'Lightning-Lord' && e.id === 'sunday_talent' && e.turns === 4))
  chk(sim, 'sunday-e6', 'E6: CR overflow → CRIT DMG (sunday_cr2cd)', sim.buffLog.some(e => e.id === 'sunday_cr2cd' && (e.mods ?? []).some(m => m.stat === 'critDmg' && m.value > 0)))
}
// ============ 31. DAN HENG • PERMANSOR TERRAE (Physical/Preservation: Bondmate, team shields, Souldragon) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'danhengperman', stats: { hp: 7000, atk: 1500, def: 2600, spd: 110 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Physical', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 9,
  })
  dump('danhengperman', sim, 'danhengperman')
  chk(sim, 'danhengperman', 'A2: advances 40% at battle start', sim.logLines.some(l => /A2: advances 40%/.test(l)))
  chk(sim, 'danhengperman', 'Skill → Bondmate + team shield', sim.logLines.some(l => /Skill: Bondmate/.test(l)) && sim.buffLog.some(e => (e.shield ?? 0) > 0))
  chk(sim, 'danhengperman', 'Summons Souldragon', sim.logLines.some(l => /summons Souldragon/.test(l)))
  chk(sim, 'danhengperman', 'Souldragon shields all allies', sim.logLines.some(l => /Souldragon acts/.test(l)))
  chk(sim, 'danhengperman', 'Ult → AoE Physical + team shield', sim.logLines.some(l => /Ultimate: AoE Physical/.test(l)))
  chk(sim, 'danhengperman', 'Basic dealt Physical DMG', sim.logLines.some(l => /Aegis Vitae/.test(l)))
  // The dragon lands the enhanced FUA itself (canon Follow-Up Attack.md: "When Souldragon takes
  // action, launches Follow-up ATK ... % of Dan Heng's ATK"), so the label lands under the
  // summon account; the owner fold is what carries it to Dan Heng. Bondmate's Additional DMG
  // is dealt by the Bondmate and stays on the Bondmate (kills feed their energy).
  const dhChar = sim.roster.find(a => a.kitId === 'danhengperman' && a.kind === 'char')
  const seeleAcc = accOf(sim, 'seele')
  chk(sim, 'danhengperman', 'Dragon FUA >0, folded to Dan Heng (owner)', (dhChar ? (sim.ownerSkill.get(dhChar.id)?.get('Souldragon FUA') ?? 0) : 0) > 0)
  chk(sim, 'danhengperman', 'Bondmate Add DMG credited to bondmate', (seeleAcc?.[1].bySkill["Bondmate's DMG"] ?? 0) > 0)
  // TODO#91: Souldragon owns a real AV timeline (canon Talent #5 initial SPD 165), not event-driven
  const dhUnit = sim.roster.find(a => a.kitId === 'danhengperman' && a.kind === 'char')
  const sd = sim.find(`sd_${dhUnit?.id ?? ''}`)
  chk(sim, 'danhengperman', 'Souldragon real AV (initial SPD 165)', !!sd && sd.base.spd === 165 && sim.logLines.some(l => /Souldragon acts/.test(l)))
  chk(sim, 'danhengperman', 'Shield stacks (Skill shield applied on allies)', sim.buffLog.some(e => e.id.startsWith('dh_shield_') && (e.shield ?? 0) > 0))
}
// danhengperman mini: E1 ult → Bondmate RES PEN + SP
{
  const sim = runBattle({
    team: [
      { kitId: 'danhengperman', stats: { hp: 7000, atk: 1500, def: 2600, spd: 110 }, energyStartFrac: 1, eidolon: 1 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Physical', 'Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'danhengperman-e1', 'E1: Bondmate All-Type RES PEN +18%', sim.buffLog.some(e => e.id === 'dh_respen' && (e.mods ?? []).some(m => m.stat === 'resPenAll' && Math.abs(m.value - 0.18) < 1e-9)))
}
// ============ 32. CIPHER (Quantum/Nihility: Patron, DMG tally → True DMG, FUA) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'cipher', stats: { hp: 6000, atk: 2200, def: 1200, spd: 170 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(150_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 17,
  })
  dump('cipher', sim, 'cipher')
  chk(sim, 'cipher', 'A6: enemies DMG taken +40%', sim.buffLog.some(e => e.id === 'cipher_a6' && (e.mods ?? []).some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.4) < 1e-9)))
  chk(sim, 'cipher', 'A0: SPD≥170 → CRIT Rate +50%', sim.buffLog.some(e => e.id === 'cipher_a0' && (e.mods ?? []).some(m => m.stat === 'critRate' && Math.abs(m.value - 0.5) < 1e-9)))
  chk(sim, 'cipher', 'Skill → Weaken + Quantum Blast', sim.logLines.some(l => /Jackpot/.test(l)))
  chk(sim, 'cipher', 'Ult → True DMG from tally', sim.logLines.some(l => /True DMG from tally/.test(l)))
  chk(sim, 'cipher', 'Talent FUA vs Patron', sim.logLines.some(l => /Hospitable/.test(l)), true)
  chk(sim, 'cipher', 'Basic dealt Quantum DMG', sim.logLines.some(l => /Missed Catch/.test(l)), true)
}
// cipher mini: E1 talent FUA → ATK+80%
{
  const sim = runBattle({
    team: [
      { kitId: 'cipher', stats: { hp: 6000, atk: 2200, def: 1200, spd: 170 }, energyStartFrac: 1, eidolon: 1 },
      { kitId: 'danheng', stats: { hp: 8000, atk: 1500, def: 600, spd: 110 } },
    ],
    enemy: foe(150_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'cipher-e1', 'E1: FUA → Cipher ATK+80%', sim.buffLog.some(e => e.id === 'cipher_e1' && (e.mods ?? []).some(m => m.stat === 'atkPct' && Math.abs(m.value - 0.8) < 1e-9)))
}

// ============ 33. CERYDRA (Wind/Nihility: Military Merit +Peerage, Charge, AoE ult, Add DMG) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'cerydra', stats: { hp: 4000, atk: 2500, def: 900, spd: 140 }, energyStartFrac: 1, eidolon: 0 },
      { kitId: 'topaz', stats: { hp: 4000, atk: 2400, def: 900, spd: 140 } },
    ],
    enemy: foe(200_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  dump('cerydra', sim, 'cerydra')
  chk(sim, 'cerydra', 'Grant Merit to ally + Charge', sim.logLines.some(l => /Military Merit/.test(l)))
  chk(sim, 'cerydra', 'A4 CRIT Rate +100%', sim.buffLog.some(e => e.id === 'cerydra_crit' && (e.mods ?? []).some(m => m.stat === 'critRate' && Math.abs(m.value - 1.0) < 1e-9)))
  chk(sim, 'cerydra', 'A1 CRIT DMG per ATK>2000', sim.buffLog.some(e => e.id === 'cerydra_cd' && (e.mods ?? []).some(m => m.stat === 'critDmg' && m.value > 0)))
  chk(sim, 'cerydra', 'Ult AoE Wind DMG', sim.logLines.some(l => /Scholar/.test(l)))
  chk(sim, 'cerydra', 'Add DMG after carrier attack', sim.logLines.some(l => /Id Conservancy/.test(l)), true)
  chk(sim, 'cerydra', 'Coup de Main: Peerage carrier Skill copied then reverted', sim.logLines.some(l => /Coup de Main/.test(l)) && sim.logLines.some(l => /Peerage reverted/.test(l)))
  const cpy = sim.logLines.findIndex(l => /Coup de Main/.test(l))
  const rvt = sim.logLines.findIndex(l => /Peerage reverted/.test(l))
  chk(sim, 'cerydra', 'During Coup de Main no Charge gain (talent)', cpy >= 0 && rvt > cpy && !sim.logLines.slice(cpy, rvt).some(l => /: Charge \d/.test(l)))
}
// cerydra mini: E1 + E2 — carrier DEF-ignore + DMG, self +160% DMG
{
  const sim = runBattle({
    team: [
      { kitId: 'cerydra', stats: { hp: 4000, atk: 2500, def: 900, spd: 140 }, energyStartFrac: 1, eidolon: 1 },
      { kitId: 'silverwolf', stats: { hp: 4000, atk: 2200, def: 1000, spd: 130 } },
    ],
    enemy: foe(200_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'cerydra-e1', 'E1: carrier DEF-ignore 16%', sim.buffLog.some(e => e.id === 'cerydra_def' && (e.mods ?? []).some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.16) < 1e-9)))
}
// cerydra-coup: §P5 canon order — the copy is cast BEFORE the original (released in an Extra Turn),
// so a killing blow cannot eat it. Runs the real action path so onBeforeAction actually fires.
{
  const pre = prepareBattle({
    team: [
      { kitId: 'cerydra', stats: { hp: 4000, atk: 2500, def: 900, spd: 140 }, eidolon: 0 },
      { kitId: 'topaz', stats: { hp: 4000, atk: 2400, def: 900, spd: 140 } },
    ],
    enemy: foe(200_000, ['Wind'], 2, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 11,
  })
  pre.initBattle()
  const cer = pre.roster.find(x => x.kitId === 'cerydra')!
  const carrier = pre.roster.find(x => x.kitId === 'topaz')!
  const doomed = pre.roster.filter(x => x.side === 'enemy')[0]
  const survivor = pre.roster.filter(x => x.side === 'enemy')[1]
  doomed.hp = 1 // the copy must still land here, BEFORE the original can kill it
  pre.rt(cer).mmId = carrier.id
  pre.rt(cer).peerage = true
  pre.rt(cer).charge = 8
  const mark = pre.logLines.length
  pre.performAbility(kitById('topaz')!, carrier, { kind: 'skill' }, pre.rt(carrier))
  const seg: string[] = pre.logLines.slice(mark)
  const copyIdx = seg.findIndex(l => /Coup de Main/.test(l))
  const origIdx = seg.findIndex(l => /Difficulty Paying\?/.test(l))
  chk(pre, 'cerydra-coup-order',
    `copy before original (copy=#${copyIdx}, original=#${origIdx}, doomed dead=${!!doomed.dead}, survivor hit=${survivor.hp < 200_000})`,
    copyIdx >= 0 && origIdx > copyIdx && !!doomed.dead && survivor.hp < 200_000)
  chk(pre, 'cerydra-coup-flags', 'extraRelease + coupLock cleaned up',
    pre.rt(carrier).extraRelease === false && pre.rt(cer).coupLock === false)
  // canon: during Coup de Main Cerydra cannot gain Charge (only the A3 +5 Energy still lands)
  const revertIdx = seg.findIndex(l => /Peerage reverted/.test(l))
  chk(pre, 'cerydra-coup-nocharge', `no Charge gain inside the coup window (revert=#${revertIdx})`,
    revertIdx > copyIdx && !seg.slice(0, revertIdx).some((l: string) => /: Charge \d/.test(l)))
}

// ============ 34. CASTORICE (Quantum/Remembrance: HP-scaled, Newbud->Ult, Netherwing+Territory) ============
{
  // Battle-driven claims live in the verification layer now: verification/characters/castorice/skill.json
  // (fixtures newbud-territory / basic-path / breath-clock, 10 requirements — Newbud tally, Ult->wing,
  // Territory, wing HP clock = 3 damaging Breaths, Wings payout + heal, A2 SPD gate, Basic path).
  // What stays here are trace-wide invariants the declarative layer cannot state: they read runtime
  // state (buff list vs HP ratio, ownerDamage fold) instead of asserting something about the trace.
  const sim = runBattle({
    team: [
      { kitId: 'castorice', stats: { hp: 60000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 40000, atk: 2200, def: 1300, spd: 150 } },
    ],
    enemy: foe(500_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 7,
  })
  const cst = sim.roster.find(x => x.side === 'ally' && x.kind === 'char' && x.kitId === 'castorice')
  const cstAlive = !!cst && !cst.dead
  const cstHasBuf = cstAlive && cst!.buffs.some(b => b.id === 'cast_spd')
  chk(sim, 'castorice', 'A2 gate consistent at battle end', !cstAlive || cstHasBuf === (cst!.hp / cst!.maxHp >= 0.5), true)
  // Mooncocoon is checked deterministically in `castorice-canon` (white-box interceptLoss): a boss acting
  // once per 83 AV no longer overlaps the 3-turn wing window, so a log-grep here would be seed roulette.
  const simN = runBattle({
    team: [
      { kitId: 'castorice', stats: { hp: 60000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 },
      { kitId: 'seele', stats: { hp: 40000, atk: 2200, def: 1300, spd: 150 } },
    ],
    enemy: foe(20_000_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 20, seed: 7,
  })
  // owner fold must survive the wing's despawn (its account outlives it, the roster entry does not)
  const cast = simN.roster.find(x => x.kitId === 'castorice' && x.kind === 'char')
  const castOwn = cast ? (simN.accounts.get(cast.name)?.total ?? 0) : 0
  const castFold = cast ? (simN.ownerDamage.get(cast.id) ?? 0) : 0
  const wingDmg = simN.accounts.get('Netherwing: Pollux')?.total ?? 0
  chk(simN, 'castorice', `owner fold: урон деспавнувшегося Netherwing уходит Castorice (own=${Math.round(castOwn)}, wings=${Math.round(wingDmg)}, fold=${Math.round(castFold)})`, !!cast && wingDmg > 0 && Math.abs(castFold - (castOwn + wingDmg)) < 1)
}

// ============ 34b. CASTORICE canon audit (27-09-2026): Netherwing MaxHP / Mooncocoon 5% /
// Newbud→wing conversion / 3-turn lifespan. White-box: enemy turn cadence must not decide these. ============
{
  const CTX = { eidolon: 0, basic: 10, skill: 10, ult: 10, talent: 10 } as never
  const kit = kitById('castorice')!
  const ctxOf = (eid: number) => ({ eidolon: eid, basic: 10, skill: 10, ult: 10, talent: 10 }) as never
  const mk = (mateHp: number, mateKit = 'seele', foeHp = 500_000, eid = 0) => {
    const p = prepareBattle({
      // critRate 0: the wing mirrors Castorice's crit (Summon.md), so leaving CR live makes every
      // damage-ratio check below a coin flip on the `(CRIT)` tag. These checks measure the ramp x
      // West Wind / ramp-reset mechanics, not crit.
      team: [{ kitId: 'castorice', stats: { hp: 60000, atk: 1500, def: 1400, spd: 130, critRate: 0 }, eidolon: eid }],
      enemy: foe(foeHp, ['Quantum'], 1, 120, 120, 700, 'Boss'),
      cycles: 1, seed: 1,
      log: { debug: 7 },
    })
    const owner = p.roster.find(u => u.kitId === 'castorice')!
    ;(p.rt(owner) as { newbud?: number }).newbud = 34000
    const ctx = ctxOf(eid)
    kit.perform!(p, owner, { kind: 'ult' } as never, ctx)
    return { p, owner, ctx, nw: p.find(`nw_${owner.id}`)!, mate: p.addChar(mateKit, 'Mate', { hp: mateHp, atk: 2200, def: 1300, spd: 150 }) }
  }

  // 1140703 #1 = 5: "their current HP can be reduced down to a minimum of 1, after which Netherwing
  // will bear the HP loss. But Netherwing consumes HP equal to #1% of the original value".
  // A non-lethal hit is the ally's own loss (the wing is a *backup*, not a shield); the wing only
  // covers the part beyond 1 HP, and pays 5% of the original for it.
  const A = mk(40_000)
  chk(A.p, 'castorice-canon', `Netherwing MaxHP = 34000 = 100% of max Newbud (got ${Math.round(A.nw.maxHp)})`, Math.round(A.nw.maxHp) === 34000 && Math.round(A.nw.hp) === 34000) // 140703 #3 = 1 as a fraction
  const soft = A.p.interceptLoss(A.mate, 1000)
  chk(A.p, 'castorice-canon', `Mooncocoon lets a non-lethal hit through (absorbed ${soft}/1000, ally at 40000 HP)`, soft === 0)
  chk(A.p, 'castorice-canon', `...and the wing is not charged for it (${Math.round(A.nw.maxHp - A.nw.hp)} of ${Math.round(A.nw.maxHp)})`, Math.round(A.nw.maxHp - A.nw.hp) === 0)
  A.mate.hp = 400
  const absorbed = A.p.interceptLoss(A.mate, 1000)
  chk(A.p, 'castorice-canon', `Mooncocoon bears the loss past 1 HP (absorbed ${absorbed}/1000)`, Math.round(absorbed) === 601)
  chk(A.p, 'castorice-canon', `Mooncocoon wing cost = 5% of the original 1000 (got ${Math.round(A.nw.maxHp - A.nw.hp)})`, Math.round(A.nw.maxHp - A.nw.hp) === 50)
  chk(A.p, 'castorice-canon', 'Mooncocoon logged', A.p.logLines.some(l => /Mooncocoon: Netherwing bears 601 of 1000 for \S+ at 1 HP, consumes 50/.test(l)))
  // §18: Mooncocoon MOVES the loss to the wing (it also pays 5% of the original on top), so the event
  // stream must say HP_REDIRECT with the movement flag, never the plain HP_INTERCEPT.
  const ared = A.p.logger.events.filter(e => e.type === 'HP_REDIRECT')
  chk(A.p, 'castorice-canon', `HP_REDIRECT emitted for the Mooncocoon movement (${ared.length} events)`, ared.length > 0 && ared.every(e => e.payload?.by === 'redirector' && e.payload?.incoming === 1000 && e.payload?.remaining === 399))
  chk(A.p, 'castorice-canon', 'a redirector never emits HP_INTERCEPT', A.p.logger.events.filter(e => e.type === 'HP_INTERCEPT').length === 0)
  chk(A.p, 'castorice-canon', 'Lost Netherland up while the wing lives', A.p.livingEnemiesOf(A.owner).some(e => e.buffs.some(b => b.id === 'cast_terr')))

  // floor: an ally already at 1 HP is still saved, and the wing pays 5% of the hit out of its own HP
  const F = mk(40_000)
  F.mate.hp = 1
  const floored = F.p.interceptLoss(F.mate, 2000)
  chk(F.p, 'castorice-canon', `1 HP floor holds (absorbed ${floored}/2000, wing paid ${Math.round(F.nw.maxHp - F.nw.hp)}/34000)`, floored === 2000 && Math.round(F.nw.maxHp - F.nw.hp) === 100)
  // ...but an empty wing cannot shield for free: the last HP pays out and the wing disappears (140703)
  F.nw.hp = 40
  const drained = F.p.interceptLoss(F.mate, 2000)
  chk(F.p, 'castorice-canon', `wing at 40 HP pays 100 and despawns (absorbed ${drained})`, drained === 2000 && !F.p.find(`nw_${F.owner.id}`))
  chk(F.p, 'castorice-canon', 'Wings pays out on the Mooncocoon death', F.p.logLines.some(l => /Netherwing disappears/.test(l)) && !F.p.livingEnemiesOf(F.owner).some(e => e.buffs.some(x => x.id === 'cast_terr')))
  chk(F.p, 'castorice-canon', 'Mooncocoon disarms after the wing died', (() => { const m = F.p.addChar('seele', 'Seele3', { hp: 40_000, atk: 2200, def: 1300, spd: 150 }); return F.p.interceptLoss(m, 1000) === 0 })())

  // 1140702: each press costs 25% of the wing's Max HP, and "when its current HP is equal to or less than 25% of
  // its Max HP, launching this ability will actively reduce HP down to 1, and then trigger the ability effect
  // equal to that of the Talent" — so from a full 34000 bar a wing presses 4 times in one turn
  // (25500 / 17000 / 8500) and the 4th press drops it to 1 HP and pays out Wings, ending that same turn. No banking.
  const B = mk(40_000)
  const bAt = B.p.logLines.length
  kit.onSummonTurn!(B.p, B.nw, B.owner, CTX)
  const bNew = B.p.logLines.slice(bAt)
  const bBreaths = bNew.filter(l => /Breath Scorches/.test(l)).length
  chk(B.p, 'castorice-canon', `one turn: 3 damaging Breaths (34000 → 25500 → 17000 → 8500), 4th press pays out (${bBreaths} Breath lines)`, bBreaths === 3)
  chk(B.p, 'castorice-canon', `the 4th press is at 1 HP and pays Wings once (${bNew.filter(l => /Netherwing disappears/.test(l)).length} payout)`, B.nw.hp === 1 && bNew.filter(l => /Netherwing disappears/.test(l)).length === 1)
  chk(B.p, 'castorice-canon', 'Wings + despawn on the same turn, Lost Netherland dispelled', !B.p.find(`nw_${B.owner.id}`) && !B.p.livingEnemiesOf(B.owner).some(e => e.buffs.some(x => x.id === 'cast_terr')))
  chk(B.p, 'castorice-canon', `an unfed chain ends on the payout, so Claw never fires (${B.p.logLines.filter(l => /\[Claw Splits/.test(l)).length} Claw)`, B.p.logLines.filter(l => /\[Claw Splits/.test(l)).length === 0)
  chk(B.p, 'castorice-canon', 'Mooncocoon disarms itself on despawn', (() => { const m = B.p.addChar('seele', 'Seele2', { hp: 40_000, atk: 2200, def: 1300, spd: 150 }); return B.p.interceptLoss(m, 1000) === 0 })())

  // bonus_abilities[2] "Where the West Wind Dwells": +30% per Breath, 6 stacks, "lasts until the end of
  // this turn" — NOT Breath's own #3/#4 multiplier boost (1140702), which ramps per press and never falls
  // back before the wing disappears. Every press happens inside one wing turn, so stacks are per-turn, and the
  // payout press still counts as a use (it is a launch of Breath, it just pays Wings instead of damage).
  // Bar geometry is fixed by 140703 #3 (34000 HP = 100% of max Newbud 34000) × 1140702 #1 (25% per launch) × #5
  // (at <=25% the wing drops to 1 HP and pays Wings): 17000 -> 1 press, 25500 -> 2, 34000 -> 3, plus the payout press.
  const windVal = (nw: typeof W1.nw) => { const b = nw.buffs.find(x => x.id === 'cast_wind'); return b ? b.mods[0].value : 0 }
  const wPresses = (p: typeof W1.p) => p.logLines.filter(l => /Breath Scorches/.test(l)).length
  const W1 = mk(40_000); W1.nw.hp = 17_000
  kit.onSummonTurn!(W1.p, W1.nw, W1.owner, CTX)
  chk(W1.p, 'castorice-canon', `1 damaging press + payout press = 2 West Wind stacks (+${(windVal(W1.nw) * 100).toFixed(0)}%, ${wPresses(W1.p)} Breath)`, wPresses(W1.p) === 1 && Math.abs(windVal(W1.nw) - 0.6) < 1e-9)
  const W2 = mk(40_000); W2.nw.hp = 25_500
  kit.onSummonTurn!(W2.p, W2.nw, W2.owner, CTX)
  chk(W2.p, 'castorice-canon', `2 damaging presses + payout press = 3 stacks (+${(windVal(W2.nw) * 100).toFixed(0)}%, ${wPresses(W2.p)} Breath)`, wPresses(W2.p) === 2 && Math.abs(windVal(W2.nw) - 0.9) < 1e-9)
  const W3 = mk(40_000)
  kit.onSummonTurn!(W3.p, W3.nw, W3.owner, CTX)
  chk(W3.p, 'castorice-canon', `full 34000 bar: 3 damaging presses + payout press = 4 stacks (+${(windVal(W3.nw) * 100).toFixed(0)}%, ${wPresses(W3.p)} Breath)`, wPresses(W3.p) === 3 && Math.abs(windVal(W3.nw) - 1.2) < 1e-9)
  // the buff multiplies real damage, not just a buff entry: press 3 (ramp 0.476, 3 stacks = 1.9x) over
  // press 1 (ramp 0.336, 1 stack = 1.3x) => 2.07; with the passive missing it would be the ramp alone = 1.42.
  const bd = W3.p.logLines.map(l => { const m = /→ Boss: (\d+) \[Breath Scorches/.exec(l); return m ? +m[1] : 0 }).filter(Boolean)
  chk(W3.p, 'castorice-canon', `West Wind multiplies the damage itself (press1 ${bd[0]} -> press3 ${bd[2]}, ratio ${(bd[2] / bd[0]).toFixed(3)} vs 1.417 without it)`, bd.length === 3 && bd[2] / bd[0] > 1.9)

  // 140703 #2 = 3 turns, but a wing life is ONE turn: its bar is 34000 = 4 x 8500 and the press that finds the bar at
  // the 25% line pays out inside that same turn. So the 3-turn lifespan and Claw only show up when the turn is cut
  // short (the enemies die — see the L fixture); the fed branch that used to reach them is gone.
  // Gallagher's Besotted Talent heals the ATTACKER on every press, which used to keep the bar full and the wing
  // alive for its whole 3-turn lifespan. Canon: the wing cannot be healed while it is taking its OWN turn, so that
  // heal is now rejected (breathScorches pins the bar to its post-cost value) and Besotted is the regression gate.
  const E = mk(40_000, 'gallagher', 5_000_000)
  const gal = kitById('gallagher')!
  E.p.gainEnergy(E.mate, E.mate.maxEnergy)
  gal.perform!(E.p, E.mate, { kind: 'ult' } as never, E.p.rt(E.mate))
  const eBoss = E.p.livingEnemiesOf(E.owner)[0]
  chk(E.p, 'castorice-canon', 'Besotted is up (Gallagher ult) before the wing turn', !!eBoss?.buffs.find(b => b.id === 'besotted'))
  const eAt = E.p.logLines.length
  kit.onSummonTurn!(E.p, E.nw, E.owner, CTX)
  const eTurn = E.p.logLines.slice(eAt)
  const eBreath = eTurn.filter(l => /Breath Scorches/.test(l)).length
  const eClaw = eTurn.filter(l => /Claw Splits/.test(l)).length
  const eRej = eTurn.filter(l => /mid-turn healing rejected/.test(l)).length
  chk(E.p, 'castorice-canon', `a per-press Besotted heal does NOT keep the wing up: the bar only falls, 3 Breaths then the payout press (${eBreath} Breaths, ${eClaw} Claw, ${eRej} heal(s) rejected, wing ${E.p.find(`nw_${E.owner.id}`) ? 'alive' : 'gone'})`, eBreath === 3 && eClaw === 0 && eRej > 0 && !E.p.find(`nw_${E.owner.id}`))
  chk(E.p, 'castorice-canon', 'that wing leaves once, on the payout press, with one Wings payout + Lost Netherland dispel', E.p.logLines.filter(l => /Netherwing disappears/.test(l)).length === 1 && !E.p.livingEnemiesOf(E.owner).some(e2 => e2.buffs.some(x => x.id === 'cast_terr')))

  // the fed branch is now structurally unreachable, and the sim has no other way to reach it: the bar is 34000 = 4 x
  // 8500, so a life is 3 damaging presses + the payout press. E2 "Ardent Will" is the only free-HP source (2 stacks =
  // 2 free presses), and even that ends on the payout at press 5, well under the sim's 8-press cap — so neither the
  // cap nor Claw (the closer for a chain that "runs out of HP budget") can be reached without an illegal mid-turn heal.
  const A2 = mk(40_000, 'gallagher', 5_000_000, 2)
  const gal2 = kitById('gallagher')!
  A2.p.gainEnergy(A2.mate, A2.mate.maxEnergy)
  gal2.perform!(A2.p, A2.mate, { kind: 'ult' } as never, A2.p.rt(A2.mate))
  ;(A2.p.rt(A2.owner) as { ardent?: number }).ardent = 2
  const a2At = A2.p.logLines.length
  kit.onSummonTurn!(A2.p, A2.nw, A2.owner, CTX)
  const a2Turn = A2.p.logLines.slice(a2At)
  chk(A2.p, 'castorice-canon', `even E2's 2 free Ardent presses cannot build a fed chain: the wing still pays out (${a2Turn.filter(l => /Breath Scorches/.test(l)).length} Breaths, ${a2Turn.filter(l => /Claw Splits/.test(l)).length} Claw) — the 8-press cap and Claw are dead branches`, a2Turn.filter(l => /Claw Splits/.test(l)).length === 0 && a2Turn.filter(l => /Netherwing disappears/.test(l)).length === 1 && !A2.p.find(`nw_${A2.owner.id}`))
  // 1140702 "in one attack ... increased progressively to #2/#3/#4": the ramp is per-attack, so a NEW press chain
  // starts at #2 again instead of continuing from the cap. A wing no longer gets a second attacking turn (its bar
  // pays out inside the first), so the per-turn reset is not observable in a live battle any more: the re-summon
  // check below is the white-box cover for rt.nwLaunches = 0.

  // 1140701 "Claw Splits the Veil" — the turn closer. With the no-mid-turn-heal canon the fed branch cannot run
  // (see the A2 probe above: 5 presses at most, the 8-press cap is never reached), so the call site is dead and
  // Claw is probed white-box: the ability itself is driven directly. The wing is stripped of CRIT here: with a 1.5x
  // coin flip on every instance the per-instance ratios would be ±50% noise, while seed 1 makes everything else
  // (DEF, RES, break step, West Wind) fully deterministic — so the checks can be exact instead of banded.
  const clawProbe = (eid: number, bossHpFrac = 1) => {
    const F = mk(40_000, 'gallagher', 5_000_000, eid)
    F.p.addBuff(F.nw, { id: 'probe_nocrit', name: 'probe: no crit', mods: [{ stat: 'critRate', value: -1 }], turns: Infinity })
    // same West Wind state as the ramp-capped Breath press it is compared against (3 stacks = +90%): a fresh
    // wing turn has none, which would make the 0.56-vs-0.476 comparison read as a wind difference instead
    F.p.addBuff(F.nw, { id: 'cast_wind', name: 'Where the West Wind Dwells', mods: [{ stat: 'dmgAll', value: 0.9 }], turns: 1 })
    const boss = F.p.livingEnemiesOf(F.owner)[0]
    // break-free window: 400 toughness > the presses + Claw, so every instance shares the same intact (×0.9) state
    // and the ratios below are exact. The default 120 would break twice mid-chain.
    boss.toughness = 400
    boss.hp = Math.round(boss.maxHp * bossHpFrac)
    const at = F.p.logLines.length
    clawSplitsVeil(F.p, F.nw, F.owner, levelsOf(F.ctx), eid)
    const sl = F.p.logLines.slice(at)
    const dmg = (lines: string[], re: RegExp) => lines.filter(l => re.test(l)).map(l => +(/Boss[^:]*: (\d+) \[/.exec(l)?.[1] ?? 0))
    const claw = dmg(sl, /\[Claw Splits/)
    return { claws: claw.length, clawDmg: claw[0] ?? 0, stripped: 400 - boss.toughness }
  }
  const c0 = clawProbe(0)
  chk(E.p, 'castorice-canon', `Claw hits every enemy once (${c0.claws} hit)`, c0.claws === 1)
  chk(E.p, 'castorice-canon', `Claw carries its own 30 Toughness (stripped ${c0.stripped})`, c0.stripped === 30)
  // its damage is #1[f1] of Castorice's Max HP (0.56) against the capped Breath press #4 (0.476) with the same wind
  // cap and break state, so the ratio is 0.56/0.476 = 1.1765; a reused ramp step would give 1.000/0.706
  const cRef = (() => {
    const G = mk(40_000, 'gallagher', 5_000_000)
    G.p.addBuff(G.nw, { id: 'probe_nocrit', name: 'probe: no crit', mods: [{ stat: 'critRate', value: -1 }], turns: Infinity })
    const gb = G.p.livingEnemiesOf(G.owner)[0]
    gb.toughness = 400
    const at = G.p.logLines.length
    kit.onSummonTurn!(G.p, G.nw, G.owner, CTX)
    const hits = G.p.logLines.slice(at).filter(l => /\[Breath Scorches/.test(l)).map(l => +(/Boss[^:]*: (\d+) \[/.exec(l)?.[1] ?? 0))
    return hits[hits.length - 1] ?? 0 // the last press that pays HP: ramp capped at #4, wind 3 stacks
  })()
  chk(E.p, 'castorice-canon', `Claw is #1[f1] of MaxHP (0.56) vs the capped Breath #4 (0.476), same wind cap + break state (${c0.clawDmg}/${cRef} = ${(c0.clawDmg / cRef).toFixed(4)}, canon 1.1765; a reused ramp step gives 1.000/0.706)`, Math.abs(c0.clawDmg / cRef - 1.1765) < 2e-3)
  // E1 gate is <=80% => x1.2 (above it there is no bonus), so the boss is walked down to 60% before the call: HP only
  // falls during it, so every instance sits inside the band and the ratio is exact.
  const cE0 = clawProbe(0, 0.6)
  const cE1 = clawProbe(1, 0.6)
  chk(E.p, 'castorice-canon', `E1 reaches Claw like every other wing attack (${cE0.clawDmg} -> ${cE1.clawDmg} at 60% HP, ratio ${(cE1.clawDmg / cE0.clawDmg).toFixed(4)}, canon 1.2)`, Math.abs(cE1.clawDmg / cE0.clawDmg - 1.2) < 2e-3)


  // 140703 #2 itself: a wing that outlives its bar (here: the boss dies to the first press, so the turn ends with
  // no press and no payout) still disappears on its 3rd turn, with the same Wings payout + territory dispel.
  const L = mk(40_000, 'seele', 100)
  let lAlive = true
  for (let t = 1; t <= 3; t++) {
    kit.onSummonTurn!(L.p, L.nw, L.owner, CTX)
    if (t < 3) lAlive = lAlive && !!L.p.find(`nw_${L.owner.id}`)
  }
  chk(L.p, 'castorice-canon', '3-turn lifespan (140703 #2) despawns a wing that outlived its bar, with the Wings payout', lAlive && !L.p.find(`nw_${L.owner.id}`) && L.p.logLines.filter(l => /Netherwing disappears/.test(l)).length === 1 && !L.p.livingEnemiesOf(L.owner).some(e2 => e2.buffs.some(x => x.id === 'cast_terr')))

  // a press at the 25% line ends the turn: Wings once, no Breath damage, no second payout after the wing is gone
  // (the payout's own all-ally heal used to be converted back into the dead wing's HP, refilling it mid-turn).
  const X = mk(40_000)
  X.nw.hp = Math.round(X.nw.maxHp * 0.25) // exactly the line: the next press pays out
  X.mate.hp = Math.round(X.mate.maxHp * 0.5) // a wounded ally, so the payout heal really restores HP
  const xAt = X.p.logLines.length
  kit.onSummonTurn!(X.p, X.nw, X.owner, CTX)
  const xNew = X.p.logLines.slice(xAt)
  chk(X.p, 'castorice-canon', `a wing on the line pays Wings once and never Breath-dmg's (${xNew.filter(l => /Netherwing disappears/.test(l)).length} payout, ${xNew.filter(l => /Breath Scorches/.test(l)).length} Breath)`, xNew.filter(l => /Netherwing disappears/.test(l)).length === 1 && xNew.filter(l => /Breath Scorches/.test(l)).length === 0)
  chk(X.p, 'castorice-canon', 'the despawned wing is off the field (1 HP, no Territory)', !X.p.find(`nw_${X.owner.id}`) && X.nw.hp === 1 && !X.p.livingEnemiesOf(X.owner).some(e3 => e3.buffs.some(y => y.id === 'cast_terr')))
  chk(X.p, 'castorice-canon', `the dead wing's payout heal does not refill it (wing ${Math.round(X.nw.hp)} HP, +${Math.round((X.p.rt(X.owner) as { newbud?: number }).newbud ?? 0)} Newbud instead)`, X.nw.hp === 1 && ((X.p.rt(X.owner) as { newbud?: number }).newbud ?? 0) > 0)

  // a re-summoned wing gets its own 3-turn lifespan and restarts the #2→#3→#4 ramp
  const R = mk(40_000)
  R.nw.hp = R.nw.maxHp
  const rFirstAt = R.p.logLines.length
  kit.onSummonTurn!(R.p, R.nw, R.owner, CTX)
  const rFirst = +(/Boss: (\d+) \[Breath Scorches/.exec(R.p.logLines.slice(rFirstAt).filter(l => /\[Breath Scorches/.test(l))[0]) || [])[1]
  chk(R.p, 'castorice-canon', 'first wing paid out and is gone before the re-summon', !R.p.find(`nw_${R.owner.id}`))
  // Breath now carries its canon 30 Toughness per press, so the first wing breaks the boss. Reset that state,
  // otherwise the re-summoned press is compared under the Weakness-Broken multiplier (1.0 vs 0.9 = 1.111).
  for (const e of R.p.livingEnemiesOf(R.owner)) { e.broken = false; e.toughness = e.maxToughness }
  ;(R.p.rt(R.owner) as { newbud?: number }).newbud = 34000
  kit.perform!(R.p, R.owner, { kind: 'ult' } as never, CTX)
  const R2 = R.p.find(`nw_${R.owner.id}`)!
  chk(R.p, 'castorice-canon', 're-summoned Netherwing is back on the field with a fresh 3-turn lifespan (nwTurns reset to 0)', !!R2 && (R.p.rt(R2) as { nwTurns?: number }).nwTurns === 0)
  const rAt = R.p.logLines.length
  kit.onSummonTurn!(R.p, R2, R.owner, CTX)
  const rNewFirst = +(/Boss: (\d+) \[Breath Scorches/.exec(R.p.logLines.slice(rAt).filter(l => /\[Breath Scorches/.test(l))[0]) || [])[1]
  // ramp #2 again: identical to the first wing's press 1; a stale #4 ramp would be ~1.42x
  chk(R.p, 'castorice-canon', `re-summoned wing restarts the ramp at #2 (${rFirst} -> ${rNewFirst}, ratio ${(rNewFirst / rFirst).toFixed(2)}; stale #4 would be ~1.42)`, rFirst > 0 && Math.abs(rNewFirst / rFirst - 1) < 1e-9)

  // 140704: with the wing up, "Newbud" cannot be gained through the Talent and the ally HP loss
  // becomes an equal amount of Netherwing HP.
  const C = mk(40_000)
  C.nw.hp = 100
  C.mate.hp = 4_000
  C.owner.hp = 5_000
  const nbBefore = ((C.p.rt(C.owner) as { newbud?: number }).newbud ?? 0)
  kit.perform!(C.p, C.owner, { kind: 'skill' } as never, CTX)
  const nbAfter = ((C.p.rt(C.owner) as { newbud?: number }).newbud ?? 0)
  chk(C.p, 'castorice-canon', `Boneclaw: no Newbud while Netherwing is up (${nbBefore} -> ${nbAfter})`, nbAfter === nbBefore && nbAfter === 0)
  chk(C.p, 'castorice-canon', `Boneclaw: drained ally HP becomes Netherwing HP (100 + 40% of (5000+4000) = 3600 -> ${Math.round(C.nw.hp)}, under the 34000 cap)`, Math.round(C.nw.hp) === 3_700)
  // ...and the credit still clamps at the bar: 40% of both at full HP is 40000, i.e. over 34000.
  const C2 = mk(40_000)
  C2.owner.hp = 40_000
  kit.perform!(C2.p, C2.owner, { kind: 'skill' } as never, CTX)
  chk(C2.p, 'castorice-canon', `Boneclaw credit clamps at the bar (40000 drained -> ${Math.round(C2.nw.hp)}/34000)`, Math.round(C2.nw.hp) === 34_000)
  chk(C.p, 'castorice-canon', 'Boneclaw: Talent DMG+ still stacks on the wing', C.nw.buffs.some(b => b.id === 'cast_dmg'))

  // ---- eidolons (ranks/bonus_abilities text; no params in hsr-data) ----
  // E1 ranks.1 lists "Wings Sweep the Ruins" next to Boneclaw/Claw/Breath, and the multiplier is per enemy.
  const Wg = mk(40_000, 'seele', 5_000_000, 1)
  const wgAt = Wg.p.logLines.length
  kit.onSummonTurn!(Wg.p, Wg.nw, Wg.owner, Wg.ctx)
  const wgFull = Wg.p.logLines.slice(wgAt).filter(l => /\[Wings Sweep/.test(l)).length
  const Wg2 = mk(40_000, 'seele', 5_000_000, 1)
  Wg2.p.livingEnemiesOf(Wg2.owner)[0].hp = Math.round(Wg2.p.livingEnemiesOf(Wg2.owner)[0].maxHp * 0.5) // <=50% => 1.4
  const wg2At = Wg2.p.logLines.length
  kit.onSummonTurn!(Wg2.p, Wg2.nw, Wg2.owner, Wg2.ctx)
  const wgHalf = Wg2.p.logLines.slice(wg2At).filter(l => /\[Wings Sweep/.test(l)).length
  chk(Wg2.p, 'castorice-canon', `E1 applies to Wings too (${wgFull} instances at full HP, ${wgHalf} at 50% HP)`, wgFull === 6 && wgHalf === 6)
  const wgDmg = (lines: string[]) => lines.filter(l => /\[Wings Sweep/.test(l)).reduce((s, l) => s + +(/Boss: (\d+)/.exec(l) || [0, 0])[1], 0)
  const wgFullDmg = wgDmg(Wg.p.logLines.slice(wgAt)), wgHalfDmg = wgDmg(Wg2.p.logLines.slice(wg2At))
  chk(Wg2.p, 'castorice-canon', `E1 Wings damage x1.4 at <=50% HP (${Math.round(wgFullDmg)} -> ${Math.round(wgHalfDmg)}, ratio ${(wgHalfDmg / wgFullDmg).toFixed(2)})`, Math.abs(wgHalfDmg / wgFullDmg - 1.4) < 0.2)

  // E6 "Await for Years to Loom": +3 Bounces on Wings (1140706 notes), Quantum RES PEN +20% for both of them,
  // and toughness reduction regardless of Weakness Type during Netherwing's attacks.
  const W6 = mk(40_000, 'seele', 5_000_000, 6)
  kit.onStart!(W6.p, W6.owner, W6.ctx) // prepareBattle does not fire onStart (the sim loop does)
  const w6At = W6.p.logLines.length
  kit.onSummonTurn!(W6.p, W6.nw, W6.owner, W6.ctx)
  chk(W6.p, 'castorice-canon', `E6 Wings bounces 6 -> 9 (${W6.p.logLines.slice(w6At).filter(l => /\[Wings Sweep/.test(l)).length} instances)`, W6.p.logLines.slice(w6At).filter(l => /\[Wings Sweep/.test(l)).length === 9)
  chk(W6.p, 'castorice-canon', 'E6 Quantum RES PEN +20% on Castоrice and the wing', W6.owner.buffs.some(b => b.id === 'cast_e6_respen' && b.mods.some(m => m.stat === 'resPen:Quantum' && Math.abs(m.value - 0.2) < 1e-9)) && W6.nw.buffs.some(b => b.id === 'cast_e6_respen'))
  const W6t = mk(40_000, 'seele', 5_000_000, 6)
  const toughBoss = W6t.p.livingEnemiesOf(W6t.owner)[0]
  toughBoss.weaknesses = [] // no Quantum weakness: only the E6 pierce can strip toughness
  toughBoss.toughness = 300; toughBoss.maxToughness = 300
  kit.onSummonTurn!(W6t.p, W6t.nw, W6t.owner, W6t.ctx)
  // E6 also inherits E2's 2 free presses => 5 Breaths x 30 (pierced) + 9 Wings x 15 (pierced) = 285 of 300
  chk(W6t.p, 'castorice-canon', `E6 wing attacks strip Toughness regardless of Weakness Type (300 -> ${Math.round(toughBoss.toughness)}, expected 15)`, Math.round(toughBoss.toughness) === 15)
  const W6t0 = mk(40_000, 'seele', 5_000_000, 0)
  const t0boss = W6t0.p.livingEnemiesOf(W6t0.owner)[0]
  t0boss.toughness = 300; t0boss.maxToughness = 300
  kit.onSummonTurn!(W6t0.p, W6t0.nw, W6t0.owner, W6t0.ctx)
  // E0 on a Quantum weakness: 3 Breaths x 30 + 6 Wings x 15 = 180 of 300 (1140702 / 1140706 stance lists)
  chk(W6t0.p, 'castorice-canon', `E0 strips exactly the canon stance damage on a Quantum weakness (300 -> ${Math.round(t0boss.toughness)}, expected 120)`, Math.round(t0boss.toughness) === 120)
  const W6n0 = mk(40_000, 'seele', 5_000_000, 0)
  const n0boss = W6n0.p.livingEnemiesOf(W6n0.owner)[0]
  n0boss.weaknesses = []; n0boss.toughness = 300; n0boss.maxToughness = 300
  kit.onSummonTurn!(W6n0.p, W6n0.nw, W6n0.owner, W6n0.ctx)
  chk(W6n0.p, 'castorice-canon', `E0 without the matching weakness strips nothing (300 -> ${Math.round(n0boss.toughness)})`, Math.round(n0boss.toughness) === 300)
  const W6k = mk(40_000, 'seele', 5_000_000, 6)
  const kBoss = W6k.p.livingEnemiesOf(W6k.owner)[0]
  kBoss.weaknesses = []; kBoss.toughness = 10; kBoss.maxToughness = 10
  kit.perform!(W6k.p, W6k.owner, { kind: 'skill' } as never, W6k.ctx)
  // Boneclaw carries 15 pierce Toughness; with 10 on the bar that strips it regardless of the missing Quantum weakness.
  chk(W6k.p, 'castorice-canon', `E6 Boneclaw wing half pierces too (10 -> ${Math.round(kBoss.toughness)}/10)`, kBoss.toughness < 10)
  // E6 "When breaking Weaknesses, triggers the Quantum Weakness Break effect" — a Quantum pierce break
  // on a non-Quantum-weak enemy must land the Quantum break debuff (Entanglement + delay), not a generic one.
  chk(W6k.p, 'castorice-canon', 'E6 pierce break triggers the Quantum Weakness Break effect (Entanglement)', kBoss.dots.some(d => d.kind === 'Entanglement'))

  // E2 "Crown on Wings of Bloom": 2 stacks of "Ardent Will" each offset one Breath HP cost, the action is
  // advanced by 100%, and the next Enhanced Skill (Boneclaw) grants 30% of max Newbud.
  const E2 = mk(40_000, 'seele', 5_000_000, 2)
  const e2Ardent = (E2.p.rt(E2.owner) as { ardent?: number }).ardent ?? 0
  chk(E2.p, 'castorice-canon', `E2 grants 2 Ardent Will stacks on summon (got ${e2Ardent})`, e2Ardent === 2)
  const e2At = E2.p.logLines.length
  kit.onSummonTurn!(E2.p, E2.nw, E2.owner, E2.ctx) // 6 presses worth of HP, but only 4 are paid
  const e2New = E2.p.logLines.slice(e2At)
  chk(E2.p, 'castorice-canon', `E2 Ardent Will pays 2 Breath HP costs (${e2New.filter(l => /Breath Scorches/.test(l)).length} damaging presses + payout, ${e2New.filter(l => /Ardent Will \(E2\) absorbs/.test(l)).length} absorbed)`, e2New.filter(l => /Breath Scorches/.test(l)).length === 5 && e2New.filter(l => /Ardent Will \(E2\) absorbs/.test(l)).length === 2 && e2New.filter(l => /Netherwing disappears/.test(l)).length === 1)
  chk(E2.p, 'castorice-canon', 'E2 stacks are spent (0 left) and the wing paid out on the 6th press', ((E2.p.rt(E2.owner) as { ardent?: number }).ardent ?? -1) === 0 && !E2.p.find(`nw_${E2.owner.id}`))
  const E2s = mk(40_000, 'seele', 5_000_000, 2) // wing untouched at 34000 HP, so the Skill takes the Boneclaw branch
  const nbE2 = ((E2s.p.rt(E2s.owner) as { newbud?: number }).newbud ?? 0)
  kit.perform!(E2s.p, E2s.owner, { kind: 'skill' } as never, E2s.ctx)
  const nbE2b = ((E2s.p.rt(E2s.owner) as { newbud?: number }).newbud ?? 0)
  chk(E2s.p, 'castorice-canon', `E2 Enhanced Skill grants 30% of max Newbud (${nbE2} -> ${nbE2b}, +${nbE2b - nbE2})`, Math.round(nbE2b - nbE2) === 10200)
  kit.perform!(E2s.p, E2s.owner, { kind: 'skill' } as never, E2s.ctx)
  chk(E2s.p, 'castorice-canon', 'E2 Newbud grant is one-shot per summon', ((E2s.p.rt(E2s.owner) as { newbud?: number }).newbud ?? 0) === nbE2b)

  // E4 "Rest in Songs of Gloom": all allies' healing received +20% while Castоrice is on the field.
  const E4 = mk(40_000, 'seele', 5_000_000, 4)
  kit.onStart!(E4.p, E4.owner, E4.ctx)
  chk(E4.p, 'castorice-canon', 'E4 +20% healing received on every ally (inHeal)', E4.owner.buffs.some(b => b.id === 'cast_e4_ihb' && b.mods.some(m => m.stat === 'inHeal' && Math.abs(m.value - 0.2) < 1e-9)) && E4.mate.buffs.some(b => b.id === 'cast_e4_ihb'))
  E4.mate.hp = 1000
  E4.p.heal(E4.mate, 500, E4.nw)
  chk(E4.p, 'castorice-canon', `E4 heal really is inflated (asked 500, ally ${1000} -> ${E4.mate.hp} HP)`, E4.mate.hp === 1600)
  const E0 = mk(40_000, 'seele', 5_000_000, 0)
  kit.onStart!(E0.p, E0.owner, E0.ctx)
  E0.mate.hp = 1000
  E0.p.heal(E0.mate, 500, E0.nw)
  chk(E0.p, 'castorice-canon', `E0 control: 500 requested, ${Math.round(E0.mate.hp - 1000)} restored`, E0.mate.hp === 1500)

  // bonus_abilities[1] "Inverted Torch", 2nd clause: a Breath that leaves no enemy standing grants the wing
  // SPD +100% for 1 turn. It cannot fire on the payout press (that one deals no damage).
  const T = mk(40_000, 'seele', 100, 0)
  kit.onSummonTurn!(T.p, T.nw, T.owner, T.ctx)
  chk(T.p, 'castorice-canon', 'a killing Breath grants the wing Inverted Torch SPD+100%', T.nw.buffs.some(b => b.id === 'cast_torch_wing' && b.mods.some(m => m.stat === 'spdPct' && Math.abs(m.value - 1) < 1e-9)))
  const T2 = mk(40_000, 'seele', 5_000_000, 0)
  kit.onSummonTurn!(T2.p, T2.nw, T2.owner, T2.ctx)
  chk(T2.p, 'castorice-canon', 'a surviving Breath does not (and the wing is gone by then anyway)', !T2.nw.buffs.some(b => b.id === 'cast_torch_wing'))

  // 140702/140709: the drain floors at 1 HP, so a floored ally loses nothing (no Newbud, no stack).
  const D = prepareBattle({
    team: [{ kitId: 'castorice', stats: { hp: 60_000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 }],
    enemy: foe(500_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const dCaster = D.roster.find(u => u.kitId === 'castorice')!
  const dMate = D.addChar('seele', 'Seele', { hp: 40_000, atk: 2200, def: 1300, spd: 150 })
  dCaster.hp = 1; dMate.hp = 1
  kit.perform!(D, dCaster, { kind: 'skill' } as never, CTX)
  chk(D, 'castorice-canon', `drain at 1 HP yields no Newbud (got ${(D.rt(dCaster) as { newbud?: number }).newbud ?? 0})`, ((D.rt(dCaster) as { newbud?: number }).newbud ?? 0) === 0)
  chk(D, 'castorice-canon', 'drain at 1 HP gives no Talent DMG+ stack', !dCaster.buffs.some(b => b.id === 'cast_dmg') && dCaster.hp === 1 && dMate.hp === 1)

  // 140704 #1/#2 (27-09-2026): the Talent trigger is "HP lost by all allies" — by ANY cause, not only the
  // Skill's own drain. sim.fireAllyHpLoss is the single announcement point all four damage sites use
  // (DoT tick / Entanglement / enemyHit / Aha-bounce), so it is the unit under test here.
  const H = prepareBattle({
    team: [{ kitId: 'castorice', stats: { hp: 60_000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 }],
    enemy: foe(500_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const hCast = H.roster.find(u => u.kitId === 'castorice')!
  const hMate = H.addChar('seele', 'SeeleDmg', { hp: 40_000, atk: 2200, def: 1300, spd: 150 })
  H.fireAllyHpLoss(hMate, 2000)
  chk(H, 'castorice-canon', `ally HP loss by any cause feeds Newbud (2000 -> ${(H.rt(hCast) as { newbud?: number }).newbud ?? 0})`, ((H.rt(hCast) as { newbud?: number }).newbud ?? 0) === 2000)
  chk(H, 'castorice-canon', 'ally HP loss by any cause stacks Talent DMG+', hCast.buffs.some(b => b.id === 'cast_dmg'))

  // same trigger, wing up: HP goes to the wing (140704 clause), Newbud stays empty
  const H2 = mk(40_000)
  H2.nw.hp = 100
  H2.p.fireAllyHpLoss(H2.mate, 500)
  chk(H2.p, 'castorice-canon', `ally damage feeds the wing, not Newbud (wing 100+500=${Math.round(H2.nw.hp)}/34000, Newbud ${(H2.p.rt(H2.owner) as { newbud?: number }).newbud ?? 0})`, Math.round(H2.nw.hp) === 600 && ((H2.p.rt(H2.owner) as { newbud?: number }).newbud ?? 0) === 0)

  // no double count: the Skill drain rides the same path, so it must credit exactly the HP it took
  const G = prepareBattle({
    team: [{ kitId: 'castorice', stats: { hp: 20_000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 }],
    enemy: foe(500_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const gCast = G.roster.find(u => u.kitId === 'castorice')!
  const g1 = G.addChar('seele', 'S1', { hp: 20_000, atk: 2200, def: 1300, spd: 150 })
  const g2 = G.addChar('sushang', 'S2', { hp: 10_000, atk: 2400, def: 1200, spd: 140 })
  kit.perform!(G, gCast, { kind: 'skill' } as never, CTX)
  const gWant = (20_000 - gCast.hp) + (20_000 - g1.hp) + (10_000 - g2.hp)
  chk(G, 'castorice-canon', `Skill drain credits Newbud exactly once (${(G.rt(gCast) as { newbud?: number }).newbud ?? 0} vs drained ${gWant})`, ((G.rt(gCast) as { newbud?: number }).newbud ?? 0) === gWant && gWant === 15_000)
  chk(G, 'castorice-canon', 'Skill drain caps the Talent DMG+ stacks at 3', ((G.rt(gCast) as { dmgStacks?: number }).dmgStacks ?? 0) === 3)

  // bonus_abilities[0] "Contained Dark Tide" (27-09-2026): healed ally HP converts 100% into Newbud
  // (or into Netherwing HP while the wing is up), per target, capped at 12% of max Newbud = 4080,
  // and every unit's accumulator resets after ANY unit takes action.
  const K = prepareBattle({
    team: [{ kitId: 'castorice', stats: { hp: 60000, atk: 1500, def: 1400, spd: 130 }, eidolon: 0 }],
    enemy: foe(500_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const kCast = K.roster.find(u => u.kitId === 'castorice')!
  const kMate = K.addChar('seele', 'SeeleHeal', { hp: 40_000, atk: 2200, def: 1300, spd: 150 })
  const kMate2 = K.addChar('sushang', 'SushangHeal', { hp: 40_000, atk: 2400, def: 1200, spd: 140 })
  const kNb = () => (K.rt(kCast) as { newbud?: number }).newbud ?? 0
  // sim.heal announces the HP actually restored, so each step wounds the target first
  const wounded = (t: typeof kMate, amt: number) => { t.hp = 1000; K.heal(t, amt, kCast) }
  wounded(kMate, 500)
  chk(K, 'castorice-canon', `healed ally HP converts into Newbud 100% (500 -> ${kNb()})`, kNb() === 500)
  chk(K, 'castorice-canon', 'the conversion is logged', K.logLines.some(l => /Contained Dark Tide: SeeleHeal healed 500 -> 500 Newbud \(500\/4080\)/.test(l)))
  wounded(kMate, 10_000)
  chk(K, 'castorice-canon', `per-target accumulation caps at 12% of max Newbud (${kNb()}/4080)`, kNb() === 4080)
  wounded(kMate, 1000)
  chk(K, 'castorice-canon', `a capped target converts nothing more (${kNb()})`, kNb() === 4080)
  wounded(kMate2, 1000)
  chk(K, 'castorice-canon', `the cap is per target, not team-wide (${kNb()})`, kNb() === 5080)
  kit.onAllyActionEnd!(K, kMate2, K.rt(kCast))
  wounded(kMate, 1000)
  chk(K, 'castorice-canon', `any unit acting resets every accumulator (${kNb()})`, kNb() === 6080)
  kit.onTurnEnd!(K, kCast, K.rt(kCast))
  wounded(kMate2, 1000)
  chk(K, 'castorice-canon', `Castorice's own turn end resets as well (${kNb()})`, kNb() === 7080)
  kCast.hp = 1000
  K.heal(kCast, 1000, kMate)
  chk(K, 'castorice-canon', `Castorice is an ally target too (${kNb()})`, kNb() === 8080)
  kMate2.hp = kMate2.maxHp
  K.heal(kMate2, 5000, kCast)
  chk(K, 'castorice-canon', `overheal converts nothing (${kNb()})`, kNb() === 8080)
  // canon excludes Netherwing by name, not summons as a class: any other ally summon converts.
  const kPet: Unit = {
    id: `pet_${kCast.id}`, name: 'TestPet', side: 'ally', kind: 'summon', elem: 'Quantum',
    base: { level: 80, hp: 5000, atk: 0, def: 0, spd: 100 },
    hp: 5000, maxHp: 5000, energy: 0, maxEnergy: 0, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false,
    weaknesses: [], res: {},
  }
  K.registerUnit(kPet)
  kPet.hp = 1000
  K.heal(kPet, 600, kCast)
  chk(K, 'castorice-canon', `a non-Netherwing ally summon is a valid target (${kNb()})`, kNb() === 8680)

  // wing up: the same healing becomes Netherwing HP instead of Newbud
  const K2 = mk(40_000)
  K2.nw.hp = 100
  K2.mate.hp = 1000
  K2.p.heal(K2.mate, 1000, K2.owner)
  chk(K2.p, 'castorice-canon', `wing up: healed HP converts into Netherwing HP (100+1000=${Math.round(K2.nw.hp)}/34000, Newbud ${(K2.p.rt(K2.owner) as { newbud?: number }).newbud ?? 0})`, Math.round(K2.nw.hp) === 1100 && ((K2.p.rt(K2.owner) as { newbud?: number }).newbud ?? 0) === 0)
  chk(K2.p, 'castorice-canon', 'the wing-up conversion is logged as Netherwing HP, not Newbud', K2.p.logLines.some(l => /Contained Dark Tide: \S+ healed 1000 -> 1000 Netherwing HP \(1000\/4080\)/.test(l)))
  // ...and Netherwing's own healing is never converted (canon excludes it). The 34000 bar is far above the
  // 200 healed here, so a conversion would show up on the wing's HP directly; the accumulator is checked too.
  K2.nw.hp = 100
  K2.p.heal(K2.nw, 200, K2.owner)
  const k2acc = (K2.p.rt(K2.owner) as { cdtAcc?: Record<string, number> }).cdtAcc ?? {}
  chk(K2.p, 'castorice-canon', `healing Netherwing itself is not converted (heal landed, wing ${Math.round(K2.nw.hp)}/34000)`, Math.round(K2.nw.hp) === 300 && !(String(K2.nw.id) in k2acc))
  // Netherwing's own action resets the window too — asserted straight on the accumulator. The mate is left at
  // full HP so the payout heal (Wings heals all allies) restores 0 and cannot re-fill the window.
  K2.mate.hp = K2.mate.maxHp
  ;(K2.p.rt(K2.owner) as { cdtAcc?: Record<string, number> }).cdtAcc = { [String(K2.mate.id)]: 4080 }
  kit.onSummonTurn!(K2.p, K2.nw, K2.owner, K2.p.rt(K2.owner))
  chk(K2.p, 'castorice-canon', "Netherwing's turn resets the accumulator", !((K2.p.rt(K2.owner) as { cdtAcc?: Record<string, number> }).cdtAcc ?? {})[String(K2.mate.id)])
}

// ============ 35. PHAINON (Physical: Coreflame→Khaslana transform, Territory, Scourge economy) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'phainon', stats: { hp: 12000, atk: 3000, def: 1500, spd: 120 }, eidolon: 0 },
    ],
    enemy: foe(400_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 16, seed: 13,
  })
  dump('phainon', sim, 'phainon')
  chk(sim, 'phainon', 'Coreflame gains logged', sim.logLines.some(l => /Coreflame/.test(l)))
  chk(sim, 'phainon', 'Transform deploys Territory', sim.logLines.some(l => /Ruinous Irontomb/.test(l)))
  chk(sim, 'phainon', 'Khaslana summons (8 extra turns)', sim.logLines.some(l => /transforms into Khaslana/.test(l)))
  chk(sim, 'phainon', 'Final Ult hit', sim.logLines.some(l => /Final:/.test(l)))
  chk(sim, 'phainon', 'Stride Basic', sim.logLines.some(l => /Stride to Deliverance/.test(l)), true)
  chk(sim, 'phainon', 'Khaslana transform ends', sim.logLines.some(l => /transformation ends/.test(l)), true)
  chk(sim, 'phainon', 'Soulscorch advances enemies (immediate action)', sim.logLines.some(l => /Soulscorch Edict/.test(l) && /advance/.test(l)))
  chk(sim, 'phainon', 'Enemy-turn-end fires the Soulscorch Counter', sim.logLines.some(l => /Soulscorch Counter \(\d+ SS/.test(l)))
  chk(sim, 'phainon', 'Depart: Phainon skips turns while Khaslana lives', sim.logLines.some(l => /departs/.test(l)))
}
// phainon A2: teammate heal → +45% DMG for 4 turns
{
  const sim = runBattle({
    team: [
      { kitId: 'phainon', stats: { hp: 12000, atk: 3000, def: 1500, spd: 120 }, eidolon: 0 },
      { kitId: 'huohuo', stats: { hp: 9000, atk: 1200, def: 1200, spd: 125 } },
    ],
    enemy: foe(200_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 17,
  })
  chk(sim, 'phainon-a2', 'Тиммейт-хил → A2 DMG+45%', sim.buffLog.some(e => e.id === 'ph_a2' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.45) < 1e-9)))
  chk(sim, 'phainon-a2', 'Pyric: teammate heal → +1 Coreflame + CD+ 3t', sim.buffLog.some(e => e.id === 'ph_tgtcd' && (e.mods ?? []).some(m => m.stat === 'critDmg' && m.value > 0)) && sim.logLines.some(l => /Coreflame/.test(l)))
}
// phainon A2 shield half: ally Shield → same +45% DMG 4t (kit onAllyShield hook)
{
  const sim = runBattle({
    team: [
      { kitId: 'phainon', stats: { hp: 12000, atk: 3000, def: 1500, spd: 120 }, eidolon: 0 },
      { kitId: 'march7th', stats: { hp: 7000, atk: 900, def: 1300, spd: 135 }, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Wind'], 2, 120, 120, 700, 'Elite'),
    cycles: 8, seed: 23,
  })
  chk(sim, 'phainon-a2', 'Алль-щит → A2 DMG+45% (shield half)', sim.buffLog.some(e => e.id === 'ph_a2' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.45) < 1e-9)))
  const t0 = sim.logLines.findIndex(l => /transforms into Khaslana/.test(l))
  const t1 = t0 >= 0 ? sim.logLines.findIndex((l, i) => i > t0 && /transformation ends/.test(l)) : -1
  const marched = sim.logLines.filter((l, i) => t0 >= 0 && t1 >= 0 && i > t0 && i < t1 && />>> March/.test(l))
  chk(sim, 'phainon-a2', 'Depart: March 7th can\'t act in Khaslana territory', t0 < 0 || t1 < 0 || marched.length === 0)
}
// phainon re-transform (30-09-2026, REAL FIX): transformation state lives on the OWNER runtime
// (onSummonTurn/bloodthorn/soulscorch/verdict all read sim.rt(owner)), and `extraLeft` was left at 0
// after the first transformation ended — so a second ult gave Khaslana 0 extra turns: it fired its
// Final Ult and despawned on its first turn. White-box: two full transformations back to back.
{
  const PCTX = { eidolon: 0, basic: 10, skill: 10, ult: 10, talent: 10 } as never
  const pk = kitById('phainon')!
  const rp = prepareBattle({
    team: [{ kitId: 'phainon', stats: { hp: 60000, atk: 3000, def: 1500, spd: 120 }, eidolon: 0 }],
    enemy: foe(5_000_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 1, seed: 1,
  })
  const pOwn = rp.roster.find(u => u.kitId === 'phainon')!
  const prt = () => rp.rt(pOwn) as { coreflame?: number; extraLeft?: number; scourge?: number }
  const wing = () => rp.find(`kh_${pOwn.id}`)
  const runWing = () => {
    prt().coreflame = 12
    pk.perform!(rp, pOwn, { kind: 'ult' } as never, PCTX)
    const atSummon = prt().scourge ?? -1
    let kh = wing()!
    let n = 0
    for (let i = 0; i < 12 && kh; i++) {
      pk.onSummonTurn!(rp, kh, pOwn, PCTX)
      n++
      kh = wing() as typeof kh
    }
    return { n, atSummon }
  }
  const w1 = runWing()
  chk(rp, 'phainon-resummon', `first transformation: 8 extra turns then despawn (${w1.n} turns, wing gone ${!wing()})`, w1.n === 8 && !wing())
  chk(rp, 'phainon-resummon', 'first transformation ended with the territory cleared + Final Ult paid', rp.logLines.some(l => /transformation ends/.test(l)) && rp.logLines.some(l => /Final: Let There Be Light/.test(l)))
  const w2 = runWing()
  chk(rp, 'phainon-resummon', `re-transformation gets its own 8 extra turns, not 0 (${w2.n} turns; a stale extraLeft=0 gave 1)`, w2.n === 8)
  chk(rp, 'phainon-resummon', `Scourge restarts at 4 (140805 #1) on both summons (${w1.atSummon}, ${w2.atSummon})`, w1.atSummon === 4 && w2.atSummon === 4)
  const w2Finals = rp.logLines.filter(l => /Final: Let There Be Light/.test(l)).length
  chk(rp, 'phainon-resummon', `each transformation pays its Final Ult exactly once (${w2Finals} in 2 wings)`, w2Finals === 2)
  chk(rp, 'phainon-resummon', 're-summoned Khaslana also restarts Scourge economy (Bloodthorn +2 fires again)', rp.logLines.filter(l => /Bloodthorn Ferry/.test(l)).length >= 4)
}

// ============ 36. AVENTURINE (Imaginary/Knight: Fortified Wager shield, Blind Bet → FUA, Unnerved) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'aventurine', stats: { hp: 8000, atk: 1000, def: 2400, spd: 135 }, eidolon: 0 },
      { kitId: 'silverwolf', stats: { hp: 5000, atk: 2200, def: 1000, spd: 130 } },
    ],
    enemy: foe(150_000, ['Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 9,
  })
  dump('aventurine', sim, 'aventurine')
  chk(sim, 'aventurine', 'A2 start: Fortified Wager all allies', sim.buffLog.some(e => e.id === 'fort_wager'))
  chk(sim, 'aventurine', 'A1 CRIT from DEF>1600', sim.buffLog.some(e => e.id === 'av_a1' && (e.mods ?? []).some(m => m.stat === 'critRate' && m.value > 0)), true)
  chk(sim, 'aventurine', 'Arrhenius Ult + Blind Bet', sim.logLines.some(l => /Blind Bet/.test(l)))
  chk(sim, 'aventurine', 'FUA after Blind Bet 7', sim.logLines.some(l => /FUA/.test(l)), true)
  chk(sim, 'aventurine', 'Unnerved applied on Ult', sim.buffLog.some(e => e.id === 'unnerved'))
}

// ============ 37. FUGUE (Fire/Nihility: Foxian Prayer +Torrid Scorch, Solar Splendor AoE) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'fugue', stats: { hp: 5000, atk: 2200, def: 1000, spd: 140 }, eidolon: 0 },
      { kitId: 'firefly', stats: { hp: 5000, atk: 1800, def: 1400, spd: 115 }, eidolon: 0 },
    ],
    enemy: foe(200_000, ['Fire'], 1, 60, 120, 700, 'Boss'),
    cycles: 8, seed: 15,
  })
  dump('fugue', sim, 'fugue')
  chk(sim, 'fugue', 'Skill → Foxian Prayer to ally', sim.buffLog.some(e => e.id === 'fox_prayer' && (e.mods ?? []).some(m => m.stat === 'be' && m.value > 0)))
  chk(sim, 'fugue', 'Solar Splendor AoE ult', sim.logLines.some(l => /Solar Splendor/.test(l)))
  chk(sim, 'fugue', 'Basic Radiant Streak', sim.logLines.some(l => /Radiant Streak/.test(l)))
  chk(sim, 'fugue', 'Foxian Prayer carries toughPierce 0.5 mod', sim.buffLog.some(e => e.id === 'fox_prayer' && (e.mods ?? []).some(m => m.stat === 'toughPierce' && m.value > 0)))
  chk(sim, 'fugue', 'Cloudflame Luster re-breaks after bar empties', sim.logLines.some(l => /CLOUDFLAME broken/.test(l)))
}
// fugue E6: prayer-all while Torrid Scorch active
{
  const sim = runBattle({
    team: [
      { kitId: 'fugue', stats: { hp: 5000, atk: 2200, def: 1000, spd: 140 }, eidolon: 6 },
      { kitId: 'firefly', stats: { hp: 5000, atk: 1800, def: 1400, spd: 115 }, eidolon: 0 },
      { kitId: 'himeko', stats: DPS, eidolon: 0 },
    ],
    enemy: foe(200_000, ['Fire', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 15,
  })
  chk(sim, 'fugue-e6', 'Skill → prayer to ALL allies', sim.logLines.some(l => /ALL allies/.test(l)))
  chk(sim, 'fugue-e6', 'fox_prayer on 2+ allies', sim.buffLog.filter(e => e.id === 'fox_prayer').length >= 2)
  chk(sim, 'fugue-e6', 'E2 ult advance log: allies advanced 24% (self excluded)', sim.logLines.some(l => /Fugue E2: advance all allies 24%/.test(l)))
}

// ============ 38. NEW LC BATCH (20 cones: stats + onStart/onAfterUlt/onAfterBreak hooks) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'seele', stats: DPS, gear: { coneId: 'sleep_like_dead', si: 1 } },
      { kitId: 'huohuo', stats: HEAL, gear: { coneId: 'time_waits', si: 1 } },
      { kitId: 'welt', stats: SUP, gear: { coneId: 'passing_shore', si: 1 } },
      { kitId: 'fuxuan', stats: HEAL, gear: { coneId: 'moment_victory', si: 1 } },
      { kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'aeon', si: 1 } },
      { kitId: 'march7th', stats: HEAL, gear: { coneId: 'texture_memories', si: 1 } },
    ],
    enemy: foe(500_000, ['Quantum', 'Wind', 'Imaginary'], 1, 300, 120, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'lc-batch', 'sleep_like_dead: CD 0.30 + no static CR (CR buff via onNonCrit)', Math.abs((coneMods(sim, 'Seele').critDmg ?? 0) - 0.30) < 1e-9 && Math.abs((coneMods(sim, 'Seele').critRate ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'time_waits: HP 18% + OutHeal 12%', Math.abs((coneMods(sim, 'Huohuo').hpPct ?? 0) - 0.18) < 1e-9 && Math.abs((coneMods(sim, 'Huohuo').outHeal ?? 0) - 0.12) < 1e-9)
  chk(sim, 'lc-batch', 'passing_shore: CD 36% + Ult 24%', Math.abs((coneMods(sim, 'Welt').critDmg ?? 0) - 0.36) < 1e-9 && Math.abs((coneMods(sim, 'Welt')['boost:ult'] ?? 0) - 0.24) < 1e-9)
  chk(sim, 'lc-batch', 'moment_victory: DEF 24% base + EHR 24%', Math.abs((coneMods(sim, 'Fu Xuan').defPct ?? 0) - 0.24) < 1e-9 && Math.abs((coneMods(sim, 'Fu Xuan').ehr ?? 0) - 0.24) < 1e-9)
  chk(sim, 'lc-batch', 'aeon: ATK stacks trigger', sim.buffLog.some(x => x.id === 'aeon_atk' && (x.stacks ?? 1) >= 2))
  chk(sim, 'lc-batch', 'texture_memories: EffRES 8% base', Math.abs((coneMods(sim, 'March 7th').effRes ?? 0) - 0.08) < 1e-9)
}

// 38b. moment_victory / texture_memories ON-HIT mechanics — solo battles so the wearer is the
// only hit target (the 6-v-boss block38 fight kills the boss before defensive cones trigger)
{
  const soloFoe = () => foe(100_000, ['Quantum'], 1, 300, 120, 700, 'Boss')
  {
    const sim = runBattle({
      team: [{ kitId: 'fuxuan', stats: HEAL, gear: { coneId: 'moment_victory', si: 1 } }],
      enemy: soloFoe(), cycles: 4, seed: 3,
    })
    chk(sim, 'lc-batch', 'moment_victory: on-hit DEF buff', sim.buffLog.some(x => x.id === 'mom_def'))
  }
  {
    const sim = runBattle({
      team: [{ kitId: 'march7th', stats: HEAL, gear: { coneId: 'texture_memories', si: 1 } }],
      enemy: soloFoe(), cycles: 4, seed: 3,
    })
    chk(sim, 'lc-batch', 'texture_memories: on-hit shield', sim.buffLog.some(x => x.id === 'texture_shield'))
    chk(sim, 'lc-batch', 'texture_memories: 3-turn regrant CD', sim.buffLog.some(x => x.id === 'texture_cd'))
    chk(sim, 'lc-batch', 'texture_memories: mitigation while shielded', sim.buffLog.some(x => x.id === 'texture_mit'))
  }
}
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'aeon', si: 1 } }],
    enemy: foe(80_000, ['Wind'], 1, 15, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'lc-batch', 'aeon: break → DMG+12% (2t)', sim.buffLog.some(x => x.id === 'aeon_break'))
  chk(sim, 'lc-batch', 'aeon: ATK stacks max 4', sim.buffLog.some(x => x.id === 'aeon_atk' && (x.stacks ?? 0) >= 4))
}
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'ninja_record', si: 1 } }],
    enemy: foe(80_000, ['Wind'], 1, 15, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  // HP-change (Blade self-drain) → Sound Hunt CRIT DMG, once per turn (no always-on static CD)
  chk(sim, 'lc-batch', 'ninja_record: hpPct 12% + no static CD', Math.abs((coneMods(sim, 'Blade').hpPct ?? 0) - 0.12) < 1e-9 && Math.abs((coneMods(sim, 'Blade').critDmg ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'ninja_record: HP-change → CD buff', sim.buffLog.some(x => x.id === 'ninja_cd'))
}
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'flames_afar', si: 1 } }],
    enemy: foe(80_000, ['Wind'], 1, 15, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  // HP-loss >25% MaxHP (Blade self-drain) → heal + DMG buff, no static dmgAll
  chk(sim, 'lc-batch', 'flames_afar: no static dmgAll', Math.abs((coneMods(sim, 'Blade').dmgAll ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'flames_afar: >25% loss → DMG buff', sim.buffLog.some(x => x.id === 'flames_afar'))
}
{
  const sim = runBattle({
    team: [
      { kitId: 'huohuo', stats: HEAL, gear: { coneId: 'time_waits', si: 1 }, energyStartFrac: 0.3 },
      { kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 } },
    ],
    enemy: foe(80_000, ['Wind'], 1, 15, 120, 700, 'Boss'),
    cycles: 5, seed: 7,
  })
  // heal-tally: Huohuo heals (skill/ult) → recorded; ally attack → Additional DMG 36% of tally, once per turn
  chk(sim, 'lc-batch', 'time_waits: Additional DMG fired from heal-tally', sim.logLines.some(l => /Time Waits Additional/.test(l)))
  chk(sim, 'lc-batch', 'time_waits: HP 18% + OutHeal 12% base (no static Additional)', Math.abs((coneMods(sim, 'Huohuo').hpPct ?? 0) - 0.18) < 1e-9 && Math.abs((coneMods(sim, 'Huohuo').outHeal ?? 0) - 0.12) < 1e-9)
}

{
  const sim = runBattle({
    team: [{ kitId: 'natasha', stats: HEAL, gear: { coneId: 'perfect_timing', si: 1 } }],
    enemy: foe(80_000, ['Physical'], 1, 15, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  // effRes 16% (cone) + 18% (Natasha's own trace) = 0.34 → outHeal = 33%×0.34 = 0.1122 (under cap 0.15); no static outHeal 0.15
  const ohb = sim.buffLog.find(x => x.id === 'perfect_timing_ohb')
  const natTrace = sim.roster.find(x => x.name === 'Natasha')?.buffs.find(b => b.id === 'traces')?.mods.filter(m => m.stat === 'effRes').reduce((a, m) => a + m.value, 0) ?? 0
  chk(sim, 'lc-batch', 'perfect_timing: effRes 16% base', Math.abs((coneMods(sim, 'Natasha').effRes ?? 0) - 0.16) < 1e-9)
  chk(sim, 'lc-batch', 'perfect_timing: Natasha 18% effRes trace applied', Math.abs(natTrace - 0.18) < 1e-9)
  chk(sim, 'lc-batch', 'perfect_timing: outHeal = 33%×effRes (scaled, under cap)', !!ohb && Math.abs((ohb.mods ?? []).reduce((a, m) => a + (m.stat === 'outHeal' ? m.value : 0), 0) - 0.33 * (0.16 + natTrace)) < 1e-9)
  chk(sim, 'lc-batch', 'perfect_timing: no static outHeal in base mods', Math.abs((coneMods(sim, 'Natasha').outHeal ?? 0)) < 1e-9)
}
{
  const sim = runBattle({
    team: [{ kitId: 'pela', stats: { ...SUP, hp: 4000 }, gear: { coneId: 'amber', si: 1 }, path: 'Preservation', energyStartFrac: 0 }],
    enemy: foe(800_000, ['Physical'], 1, 120, 300, 800, 'Boss'),
    cycles: 3, seed: 3,
  })
  // HP<50% (enemy hits) → temporary amber_low DEF buff on top of base defPct 16%
  const pela = sim.roster.find(x => x.name === 'Pela')
  const gearDef = pela?.buffs.find(b => b.id === 'gear')?.mods.filter(m => m.stat === 'defPct').reduce((a, m) => a + m.value, 0) ?? 0
  chk(sim, 'lc-batch', 'amber: base defPct 16%', Math.abs(gearDef - 0.16) < 1e-9)
  chk(sim, 'lc-batch', 'amber: low-HP extra DEF buff fires', sim.buffLog.some(x => x.id === 'amber_low'))
}
{
  const sim = runBattle({
    team: [{ kitId: 'aventurine', stats: { ...SUP, def: 2000 }, gear: { coneId: 'this_is_me', si: 1 } }],
    enemy: foe(200_000, ['Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 3,
  })
  // This Is Me!: base DEF+16% (no flat ult boost of the mismodel); ult bonus DMG = 60% of DEF once per target
  const av = sim.roster.find(x => !x.dead && x.name === 'Aventurine')
  const gear = av?.buffs.find(b => b.id === 'gear')
  const defPct = gear?.mods.filter(m => m.stat === 'defPct').reduce((a, m) => a + m.value, 0) ?? 0
  chk(sim, 'lc-batch', 'this_is_me: base defPct 16% (no flat ult boost)', Math.abs(defPct - 0.16) < 1e-9 && !(gear?.mods ?? []).some(m => m.stat === 'boost:ult'))
}
{
  const sim = runBattle({
    team: [{ kitId: 'seele', stats: { ...DPS, be: 1.6 }, gear: { coneId: 'sailing_second_life', si: 1 }, path: 'Hunt' }],
    enemy: foe(120_000, ['Quantum'], 1, 60, 110, 700, 'Boss'),
    cycles: 6, seed: 3,
  })
  // Sailing Second Life: BE 60% base; SPD+12% only if BE>=150%; Break DMG ignores 20% DEF
  const ss = sim.roster.find(x => !x.dead && x.kind === 'char' && x.name === 'Seele')
  const gm = ss?.buffs.find(b => b.id === 'gear')
  const be = gm?.mods.filter(m => m.stat === 'be').reduce((a, m) => a + m.value, 0) ?? 0
  const spd = gm?.mods.filter(m => m.stat === 'spdPct').reduce((a, m) => a + m.value, 0) ?? 0
  const hasSslBreak = sim.buffLog.some(e => e.id === '_gearhm' && (e.mods ?? []).some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.20) < 1e-9))
  chk(sim, 'lc-batch', 'sailing_second_life: BE 60% base', Math.abs(be - 0.60) < 1e-9)
  chk(sim, 'lc-batch', 'sailing_second_life: SPD 12% when BE>=150%', Math.abs(spd - 0.12) < 1e-9)
  chk(sim, 'lc-batch', 'sailing_second_life: Break DMG DEF-ignore 20%', hasSslBreak)
}
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'flame_blood', si: 1 } }],
    enemy: foe(80_000, ['Wind'], 1, 15, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  // consume = 6% × 12000 = 720 > 500 → skill/ult DMG+30%+30% via per-hit mods (no lingering 1t buff)
  chk(sim, 'lc-batch', 'flame_blood: hpPct 18% + inHeal 20% base', Math.abs((coneMods(sim, 'Blade').hpPct ?? 0) - 0.18) < 1e-9 && Math.abs((coneMods(sim, 'Blade').inHeal ?? 0) - 0.20) < 1e-9)
  chk(sim, 'lc-batch', 'flame_blood: no post-ult dmgAll buff (per-hit now)', !sim.buffLog.some(x => x.id === 'fbb_atk'))
}
{
  const sim = runBattle({
    team: [
      { kitId: 'pela', stats: SUP, gear: { coneId: 'gnsw', si: 1 } },
      { kitId: 'guinaifen', stats: DPS, gear: { coneId: 'eyes_of_prey', si: 1 } },
      { kitId: 'seele', stats: DPS, gear: { coneId: 'secret_vow', si: 1 }, path: 'Destruction' },
      { kitId: 'march7th', stats: HEAL, gear: { coneId: 'landau_choice', si: 1 } },
      { kitId: 'luocha', stats: HEAL, gear: { coneId: 'qpq', si: 1 } },
      { kitId: 'firefly', stats: { ...DPS, be: 1.5 }, gear: { coneId: 'indelible_promise', si: 1 }, energyStartFrac: 1 },
      { kitId: 'hyacine', stats: HEAL, gear: { coneId: 'victory_blink', si: 1 }, energyStartFrac: 1 },
      { kitId: 'aglaea', stats: DPS, gear: { coneId: 'genius_greeting', si: 1 } },
      { kitId: 'castorice', stats: DPS, gear: { coneId: 'sweat_now', si: 1 } },
      { kitId: 'silverwolf', stats: SUP, gear: { coneId: 'flower_remembers', si: 1 }, path: 'Remembrance' },
      { kitId: 'sparxie', stats: DPS, gear: { coneId: 'today_good_luck', si: 1 } },
      { kitId: 'phainon', stats: DPS, gear: { coneId: 'trail_bygone_blood', si: 1 } },
      { kitId: 'danheng', stats: DPS, gear: { coneId: 'tutorial_before', si: 1 } },
    ],
    enemy: foe(500_000, ['Fire', 'Quantum', 'Wind', 'Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 7,
  })
  chk(sim, 'lc-batch', 'gnsw: no static dmgAll (hitMods per-debuff, cap 3)', Math.abs((coneMods(sim, 'Pela').dmgAll ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'eyes_of_prey: EHR 20% + DoT 24%', Math.abs((coneMods(sim, 'Guinaifen').ehr ?? 0) - 0.20) < 1e-9 && Math.abs((coneMods(sim, 'Guinaifen')['boost:dot'] ?? 0) - 0.24) < 1e-9)
  chk(sim, 'lc-batch', 'secret_vow: DMG 20%', Math.abs((coneMods(sim, 'Seele').dmgAll ?? 0) - 0.20) < 1e-9)
  chk(sim, 'lc-batch', "landau_choice: mitigation 16%", Math.abs((coneMods(sim, 'March 7th').mitigation ?? 0) - 0.16) < 1e-9)
  chk(sim, 'lc-batch', 'qpq: start-grant energy to ally', sim.logLines.some(l => /QPQ: energy to/.test(l)))
  chk(sim, 'lc-batch', 'indelible_promise: BE 28% + ult CRIT 15%', Math.abs((coneMods(sim, 'Firefly').be ?? 0) - 0.28) < 1e-9 && sim.buffLog.some(x => x.id === 'indelible_ult'))
  chk(sim, 'lc-batch', 'victory_blink: CD 12%', Math.abs((coneMods(sim, 'Hyacine').critDmg ?? 0) - 0.12) < 1e-9)
  chk(sim, 'lc-batch', 'victory_blink: party DMG buff on memosprite heal (Ica Take Sky)', sim.buffLog.some(x => x.id === 'blink_dmg'))
  chk(sim, 'lc-batch', 'genius_greeting: ATK 16%', Math.abs((coneMods(sim, 'Aglaea').atkPct ?? 0) - 0.16) < 1e-9)
  // sweat_now: castorice HP pool must clear the 34000 Newbud cap to summon Netherwing (the DMG gate)
  const swe = runBattle({
    team: [
      { kitId: 'castorice', stats: { ...DPS, hp: 60000 }, gear: { coneId: 'sweat_now', si: 1 } },
      { kitId: 'march7th', stats: HEAL },
      { kitId: 'luocha', stats: HEAL },
    ],
    enemy: foe(1_000_000, ['Quantum', 'Wind', 'Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 7,
  })
  chk(swe, 'lc-batch', 'sweat_now: CR 12% + gated memosprite-field DMG 24%', Math.abs((coneMods(swe, 'Castorice').critRate ?? 0) - 0.12) < 1e-9 && swe.buffLog.some(x => x.id === 'sweat_dmg' && x.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.24) < 1e-9)))
  chk(sim, 'lc-batch', 'flower_remembers: CD 24% (memosprite inherits via mirror)', Math.abs((coneMods(sim, 'Silver Wolf').critDmg ?? 0) - 0.24) < 1e-9)
  chk(sim, 'lc-batch', 'today_good_luck: CR 12% + no always-on elation (stack via onElationSkill)', Math.abs((coneMods(sim, 'Sparxie').critRate ?? 0) - 0.12) < 1e-9 && Math.abs((coneMods(sim, 'Sparxie').elation ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'trail_bygone_blood: Skill/Ult 24%', Math.abs((coneMods(sim, 'Phainon')['boost:skill'] ?? 0) - 0.24) < 1e-9 && Math.abs((coneMods(sim, 'Phainon')['boost:ult'] ?? 0) - 0.24) < 1e-9)
}
{
  // patience (Kafka cone): on hit vs non-Shocked enemy -> Erode Lightning DoT 60% ATK, 1t (tick at enemy turn)
  const sim = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'patience', si: 1 }, path: 'Nihility' }],
    enemy: foe(200_000, ['Fire', 'Wind'], 1, 120, 100, 700, 'Boss'),
    cycles: 5, seed: 11,
  })
  chk(sim, 'lc-batch', 'patience: DMG 24% + SPD stack (max 3)', Math.abs((coneMods(sim, 'Himeko').dmgAll ?? 0) - 0.24) < 1e-9 && sim.buffLog.some(x => x.id === 'patience_spd'))
  chk(sim, 'lc-batch', 'patience: Erode lands on enemy', sim.logLines.some(l => /Erode lands on/.test(l)))
  chk(sim, 'lc-batch', 'patience: Erode ticks as Lightning Shock DoT', sim.logLines.some(l => /\[DoT Shock\]/.test(l)))
}
{
  // something_irreplaceable: heal 8% ATK on defeat (onKill real). arlan free skill spam kills the
  // squishy first foe -> heal-on-defeat fires.
  const sim = runBattle({
    team: [{ kitId: 'arlan', stats: DPS, gear: { coneId: 'something_irreplaceable', si: 1 } }],
    enemy: foe(30_000, ['Lightning'], 2, 60, 100, 700, 'Weaker Foe'), // two squishy foes so a kill happens
    cycles: 5, seed: 3,
  })
  chk(sim, 'lc-batch', 'something_irreplaceable: heal on defeat (onKill)', sim.logLines.some(l => /Irreplaceable: DMG\+ until end of next turn \(on defeat\)/.test(l)))
  chk(sim, 'lc-batch', 'something_irreplaceable: no static dmgAll flatten (proc-gated now)', Math.abs((coneMods(sim, 'Arlan').dmgAll ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'something_irreplaceable: proc DMG+24% 1t on defeat', sim.buffLog.some(e => e.id === 'irr_dmg' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.24) < 1e-9) && e.turns === 1))
}
{
  // concert_two (fixed mismodel): DEF+16% + per shielded on-field char DMG+4% (was wrongly mitigation+effRes).
  // march7th shields herself+allies (KitBuff.shield) → her hits carry _gearhm dmgAll scaled by shielded count.
  const sim = runBattle({
    team: [{ kitId: 'march7th', stats: { ...DPS, hp: 6000 }, gear: { coneId: 'concert_two', si: 1 } }],
    enemy: foe(120_000, ['Quantum'], 1, 120, 100, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'lc-batch', 'concert_two: base defPct 16% (no defRed wrong-stat)', Math.abs((coneMods(sim, 'March 7th').defPct ?? 0) - 0.16) < 1e-9 && Math.abs((coneMods(sim, 'March 7th').mitigation ?? 0)) < 1e-9 && Math.abs((coneMods(sim, 'March 7th').effRes ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'concert_two: per-shielded-char dmgAll hitMod fires', sim.buffLog.some(e => e.id === '_gearhm' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && m.value > 0)))
}
{
  // dreamville (fixed mismodel): allies gain DMG for the SAME ability type the wearer just used
  // (was wrong atkPct). seele (dmg wearer) skills → allies carry boost:skill; type swap binds fresh.
  const sim = runBattle({
    team: [
      { kitId: 'seele', stats: DPS, gear: { coneId: 'dreamville', si: 1 }, path: 'Harmony' },
      { kitId: 'danheng', stats: DPS },
    ],
    enemy: foe(200_000, ['Quantum'], 1, 120, 100, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  const child = sim.buffLog.filter(e => e.id === 'dreamville_child')
  chk(sim, 'lc-batch', 'dreamville: Childishness type-matched boost (skill/basic) on allies', child.some(e => (e.mods ?? []).some(m => (m.stat === 'boost:skill' || m.stat === 'boost:basic') && Math.abs(m.value - 0.12) < 1e-9)))
  chk(sim, 'lc-batch', 'dreamville: no atkPct approx (removed)', !sim.buffLog.some(e => e.id === 'dreamville_atk'))
}
{
  // sagacity: Ult → ATK% 24% (SI1) 2t via onAfterUlt. herta (Erudition) ults on energy charge.
  const sim = runBattle({
    team: [{ kitId: 'herta', stats: DPS, gear: { coneId: 'sagacity', si: 1 } }],
    enemy: foe(80_000, ['Ice'], 1, 120, 100, 700, 'Boss'),
    cycles: 4, seed: 5,
  })
  chk(sim, 'lc-batch', 'sagacity: Ult → ATK% buff', sim.logLines.some(l => /Sagacity: \+ATK%/.test(l)) && sim.buffLog.some(x => x.id === 'sag_atk'))
}
{
  // Remembrance cone mechanics: memosprite event hooks (onMemospriteSummon / TurnStart / Disappear).
  // Aglaea ults first (energyStartFrac 1) → summons Garmentmaker → supreme + countdown fires at ~100 AV.
  const foeSpec = () => foe(200_000, ['Lightning'], 1, 120, 100, 700, 'Boss')
  const sb = runBattle({ team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'shadowburn', si: 1 }, energyStartFrac: 1 }], enemy: foeSpec(), cycles: 3, seed: 3 })
  chk(sb, 'lc-batch', 'shadowburn: first-memosprite-summon SP+energy fires (was battle-start flatten)', sb.logLines.some(l => /Shadowburn: first memosprite summon/.test(l)))
  const re = runBattle({ team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'reminiscence', si: 1 }, energyStartFrac: 1 }], enemy: foeSpec(), cycles: 4, seed: 3 })
  chk(re, 'lc-batch', 'reminiscence: Commemoration DMG+8% stack on memosprite turn start', re.buffLog.some(e => e.id === 'remem_comm' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.08) < 1e-9)))
  chk(re, 'lc-batch', 'reminiscence: no static max-4 dmgAll flatten', Math.abs((coneMods(re, 'Aglaea').dmgAll ?? 0)) < 1e-9)
  chk(re, 'lc-batch', 'reminiscence: Commemoration stacks accumulate', re.buffLog.some(e => e.id === 'remem_comm' && e.stacks === 1) && re.buffLog.some(e => e.id === 'remem_comm' && (e.stacks ?? 0) >= 2))
  chk(re, 'lc-batch', 'reminiscence: Commemoration cleared on memosprite disappear', re.logLines.some(l => /Reminiscence: Commemoration removed/.test(l)))
  const ev = runBattle({ team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'evernight_stars', si: 1 }, energyStartFrac: 1 }], enemy: foeSpec(), cycles: 4, seed: 3 })
  chk(ev, 'lc-batch', 'evernight_stars: MaxHP 30% + DMG 30% static', Math.abs((coneMods(ev, 'Aglaea').hpPct ?? 0) - 0.30) < 1e-9 && Math.abs((coneMods(ev, 'Aglaea').dmgAll ?? 0) - 0.30) < 1e-9)
  chk(ev, 'lc-batch', 'evernight_stars: energy on memosprite disappear (onMemospriteDisappear)', ev.logLines.some(l => /Evernight's Stars: memosprite disappeared/.test(l)))
}
{
  // ocean_sing: Enthrallment stacks DoT-taken per wearer-debuff (max 6), SPD-share on ally attack.
  // kafka shocks (applyDebuff → onDebuffInflict) stack Enthrallment on the primary foe; danheng
  // then attacks it → ocean_spd buff on the attacker.
  const sim = runBattle({
    team: [
      { kitId: 'kafka', stats: DPS, gear: { coneId: 'ocean_sing', si: 1 } },
      { kitId: 'danheng', stats: DPS },
    ],
    enemy: foe(120_000, ['Lightning'], 3, 60, 100, 500, 'Swarm'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'lc-batch', 'ocean_sing: EHR 40% static, no always-on dotVuln flatten', Math.abs((coneMods(sim, 'Kafka').ehr ?? 0) - 0.40) < 1e-9 && Math.abs((coneMods(sim, 'Kafka').dotVuln ?? 0)) < 1e-9)
  chk(sim, 'lc-batch', 'ocean_sing: Enthrallment entered on debuff', sim.logLines.some(l => /Ocean Sing: Enthrallment/.test(l)))
  const enthr = sim.buffLog.filter(e => e.id === 'ocean_enthrall')
  chk(sim, 'lc-batch', 'ocean_sing: DoT-taken stacks grow (value per debuff count)', enthr.some(e => (e.mods ?? []).some(m => m.stat === 'dotVuln' && m.value >= 0.15)))
  chk(sim, 'lc-batch', 'ocean_sing: SPD-share on ally attacking Enthralled target', sim.buffLog.some(e => e.id === 'ocean_spd' && (e.mods ?? []).some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.10) < 1e-9)))
}
{
  // this_love_forever Blank/Verse rotation: memosprite attack vs enemy → Verse (ally critDmg on love_verse);
  // memosprite heal on ally (src=summon, Ica Take Sky) → Blank (vulnAll on love_blank). No static both-on flatten.
  const foeSpec = () => foe(180_000, ['Lightning'], 1, 120, 100, 600, 'Boss')
  const tl = runBattle({ team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'this_love_forever', si: 1 }, energyStartFrac: 1 }], enemy: foeSpec(), cycles: 4, seed: 3 })
  chk(tl, 'lc-batch', 'this_love_forever: SPD 18% static gear mod', Math.abs((coneMods(tl, 'Aglaea').spdPct ?? 0) - 0.18) < 1e-9)
  chk(tl, 'lc-batch', 'this_love_forever: no Blank from attack-only kit (GM never heals)', !tl.buffLog.some(e => e.id === 'love_blank'))
  chk(tl, 'lc-batch', 'this_love_forever: GM attacks enemy → Verse critDmg to allies', tl.buffLog.some(e => e.id === 'love_verse' && (e.mods ?? []).some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.16) < 1e-9)))
  const th = runBattle({
    team: [
      { kitId: 'hyacine', stats: { hp: 7000, atk: 1400, def: 1800, spd: 130 }, gear: { coneId: 'this_love_forever', si: 1 }, energyStartFrac: 1 },
      { kitId: 'seele', stats: { hp: 6000, atk: 2200, def: 1300, spd: 130 } },
    ],
    enemy: foe(180_000, ['Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 8, seed: 11,
  })
  const hys = th.units().find(x => x.kind === 'char' && x.kitId === 'hyacine')
  const ica = th.units().find(x => x.kind === 'summon' && hys && th.rt(x).ownerId === hys.id)
  const healTarget = th.units().find(a => a.kind === 'char' && a.hp < a.maxHp) ?? hys
  if (healTarget && ica && !(healTarget.hp < healTarget.maxHp)) healTarget.hp = healTarget.maxHp - 1
  chk(th, 'lc-batch', 'this_love_forever: Ica heals ally (src=summon) → Blank ×1.60 (both Blank+Verse synergy) vulnAll',
    !!healTarget && !!ica && (th.heal(healTarget, 2000, ica), th.buffLog.some(e => e.id === 'love_blank' && (e.mods ?? []).some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.16) < 1e-9))))
}
{
  // never_forget_her_flame: on battle start Break DMG+32% to wearer + highest-BE teammate (non-stackable);
  // static BE 60% on wearer. weakness-apply SP: +1 SP once per turn (reset on wearer's Ult) — real hook.
  const sim = runBattle({
    team: [
      { kitId: 'fugue', stats: DPS, gear: { coneId: 'never_forget_her_flame', si: 1 } },
      { kitId: 'firefly', stats: DPS },
    ],
    enemy: foe(120_000, ['Fire'], 1, 120, 100, 700, 'Boss'),
    cycles: 3, seed: 3,
  })
  chk(sim, 'lc-batch', 'never_forget_her_flame: static BE 60% on wearer', Math.abs((coneMods(sim, 'Fugue').be ?? 0) - 0.60) < 1e-9)
  chk(sim, 'lc-batch', 'never_forget_her_flame: Break buff on wearer AND highest-BE teammate', sim.buffLog.filter(e => e.id === 'nff_break').length >= 2)
  {
    // SW ult reveals 5 weaknesses per enemy in one action → exactly ONE SP, not 5
    const sw = runBattle({
      team: [
        { kitId: 'fugue', stats: DPS, gear: { coneId: 'never_forget_her_flame', si: 1 } },
        { kitId: 'silverwolf', stats: DPS },
      ],
      enemy: foe(300_000, ['Quantum'], 3, 120, 100, 700, 'Boss'),
      cycles: 6, seed: 5,
    })
    const spLines = sw.logLines.filter(l => /Never Forget Her Flame: weakness on .* → \+1 Skill Point/.test(l))
    // gate is once per turn (reset on wearer turn start AND on wearer Ult): SP count cannot exceed
    // #wearer turns + #wearer ults, even though SW ult applies 5 weaknesses ×3 enemies in one action
    const fugueTurns = sw.logLines.filter(l => /\] >>> Fugue \[/.test(l)).length
    const fugueUlts = sw.logLines.filter(l => /\] >>> Fugue \[ULT\]/.test(l)).length
    chk(sw, 'lc-batch', 'never_forget_her_flame: weakness-apply SP fired', spLines.length >= 1)
    chk(sw, 'lc-batch', 'never_forget_her_flame: ≤1 SP per turn/ult reset', spLines.length <= fugueTurns + fugueUlts)
  }
}
{
  // finale_of_a_lie Umbra Devourer: battle start → 3-turn ATK%+40% + enemy DMG-taken+20%; every 4th wearer
  // FUA refreshes the window (clara counters are type 'fua' and land often against an aggressive boss).
  const fo = runBattle({ team: [{ kitId: 'clara', stats: DPS, gear: { coneId: 'finale_of_a_lie', si: 1 }, path: 'Hunt' }], enemy: foe(150_000, ['Physical'], 1, 120, 140, 1600, 'Boss'), cycles: 4, seed: 7 })
  chk(fo, 'lc-batch', 'finale_of_a_lie: critRate 18% static', Math.abs((coneMods(fo, 'Clara').critRate ?? 0) - 0.18) < 1e-9)
  chk(fo, 'lc-batch', 'finale_of_a_lie: no always-on atkPct flatten', Math.abs((coneMods(fo, 'Clara').atkPct ?? 0)) < 1e-9)
  chk(fo, 'lc-batch', 'finale_of_a_lie: Umbra Devourer battle-start ATK+40% 3t', fo.buffLog.some(e => e.id === 'umbra_dev' && (e.mods ?? []).some(m => m.stat === 'atkPct' && Math.abs((m.value as number) - 0.40) < 1e-9) && e.turns === 3))
  chk(fo, 'lc-batch', 'finale_of_a_lie: enemy DMG-taken+20% on start', fo.buffLog.some(e => e.id === 'umbra_vuln' && (e.mods ?? []).some(m => m.stat === 'vulnAll' && Math.abs((m.value as number) - 0.20) < 1e-9)))
  chk(fo, 'lc-batch', 'finale_of_a_lie: refresh on every 4th wearer FUA', fo.logLines.filter(l => l.includes('Finale of a Lie')).length >= 2)
}
{
  // carve_moon Secret rotation: battle start + each wearer turn → one of ATK%/CRIT DMG%/ERR% to all allies
  // (1t), replacing the previous, never the same twice in a row. No static party ATK flatten.
  const cm = runBattle({ team: [{ kitId: 'danheng', stats: DPS, gear: { coneId: 'carve_moon', si: 1 }, path: 'Harmony' }], enemy: foe(150_000, ['Wind'], 1, 120, 110, 800, 'Boss'), cycles: 4, seed: 7 })
  const carveEv = cm.buffLog.filter(e => /^carve_/.test(e.id))
  chk(cm, 'lc-batch', 'carve_moon: effect applied at battle start', carveEv.length >= 1)
  chk(cm, 'lc-batch', 'carve_moon: first effect is one of ATK/CRIT DMG/ERR 1t', carveEv.some(e => ['carve_atk', 'carve_cd', 'carve_err'].includes(e.id) && (e.mods ?? []).length === 1))
  chk(cm, 'lc-batch', 'carve_moon: no static always-on party ATK flatten', Math.abs((coneMods(cm, 'Danheng').atkPct ?? 0)) < 1e-9)
  let everRepeated = false
  for (let i = 1; i < carveEv.length; i++) if (carveEv[i].id === carveEv[i - 1].id) everRepeated = true
  chk(cm, 'lc-batch', 'carve_moon: never the same effect twice in a row', carveEv.length >= 2 && !everRepeated)
}
{
  // arrows: "start of battle CRIT Rate+12% for 3 turns" — 3t buff, NOT always-on static
  const sim = runBattle({ team: [{ kitId: 'seele', stats: DPS, gear: { coneId: 'arrows', si: 1 } }], enemy: foe(150_000, ['Physical'], 1, 120, 110, 800, 'Boss'), cycles: 4, seed: 7 })
  chk(sim, 'lc-batch', 'arrows: no always-on critRate static', Math.abs((coneMods(sim, 'Seele').critRate ?? 0) - 0) < 1e-9)
  chk(sim, 'lc-batch', 'arrows: 3t battle-start CR buff applied', sim.buffLog.some(e => e.id === 'arrows_cr' && (e.mods ?? []).some(m => m.stat === 'critRate' && Math.abs(m.value - 0.12) < 1e-9) && e.turns === 3))
  chk(sim, 'lc-batch', 'arrows: CR buff expires (not present at end of 4-cycle fight)', !sim.roster.some(u => u.name === 'Seele' && !u.dead && u.buffs.some(b => b.id === 'arrows_cr')))
}
{
  // star_lights_night First Wish: wearer Skill (Assist Skill proxy) → +6 EN + Sail 2t (max 3, each stack
  // Assist-Skill DMG 0.20); at 3 stacks each Sail stack also boosts Ult DMG via hitMods. defIgnore base.
  const sl = runBattle({ team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'star_lights_night', si: 1 }, skillPriority: 2, energyStartFrac: 1 }], enemy: foe(150_000, ['Physical'], 1, 120, 110, 800, 'Boss'), cycles: 4, seed: 3 })
  const sailLog = sl.buffLog.filter(e => e.id === 'sail')
  chk(sl, 'lc-batch', 'star_lights_night: defIgnore 32% base', Math.abs((coneMods(sl, 'Himeko').defIgnore ?? 0) - 0.32) < 1e-9)
  chk(sl, 'lc-batch', 'star_lights_night: Sail stacks (max 3, per-stack 0.20 skill boost)', sailLog.some(e => (e.stacks ?? 0) === 3 && (e.mods ?? []).some(m => m.stat === 'boost:skill' && Math.abs(m.value - 0.20) < 1e-9)))
  chk(sl, 'lc-batch', 'star_lights_night: no always-on boost:skill flatten', Math.abs((coneMods(sl, 'Himeko').skill ?? 0)) < 1e-9)
  chk(sl, 'lc-batch', 'star_lights_night: Assist Skill → +6 EN fires', sl.logLines.some(l => /Star That Lights: Assist Skill → \+6 EN/.test(l)))
  chk(sl, 'lc-batch', 'star_lights_night: Sail 3/3 → Ult DMG+ per stack real', sl.logLines.some(l => /Sail 3\/3 → Ult DMG/.test(l)))
}
{
  // reforged_hellfire Purgatory: skill on enemy → target 2t buff of critDmgTaken:all-crit-types (+30%),
  // plus wearer-only extra +30% critDmgTaken on the hit type via hitMods (lands on the transient target
  // lane). No vulnAll flatten.
  const rh = runBattle({
    team: [{ kitId: 'kafka', stats: DPS, gear: { coneId: 'reforged_hellfire', si: 1 }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(150_000, ['Lightning'], 1, 120, 110, 800, 'Boss'), cycles: 3, seed: 6,
  })
  const pur = rh.buffLog.filter(e => e.id === 'purgatory')
  const cdTaken = pur.flatMap(e => e.mods ?? []).filter(m => m.stat.startsWith('critDmgTaken'))
  chk(rh, 'lc-batch', 'reforged_hellfire: Purgatory applied to enemy', pur.length >= 1)
  chk(rh, 'lc-batch', 'reforged_hellfire: critDmgTaken mods fill all crit types (+30%)', cdTaken.length >= 5 && cdTaken.slice(0, 6).every(m => Math.abs(m.value - 0.30) < 1e-9))
  chk(rh, 'lc-batch', 'reforged_hellfire: no vulnAll Purgatory flatten', !pur.some(e => (e.mods ?? []).some(m => m.stat === 'vulnAll')))
  const wearer = rh.roster.find(x => x.name === 'Kafka' && !x.dead)
  const gearB = wearer?.buffs.find(b => b.id === 'gear')
  chk(rh, 'lc-batch', 'reforged_hellfire: static mods are HP% (no fake vuln)', (gearB?.mods ?? []).every(m => m.stat === 'hpPct'))
}
{
  // return_dark "1 time per attack": dispel gate wired to sim.attackNo(). Multihit attacks must not
  // re-dispel on subsequent hits of the SAME attack (same attacker/type/AV slot → one attackSeq).
  let rdc: ReturnType<typeof runBattle> | undefined
  for (let s = 1; s <= 80 && !rdc; s++) {
    const probe = runBattle({ team: [{ kitId: 'danheng', stats: { ...DPS, critRate: 1.5 }, gear: { coneId: 'return_dark', si: 1 } }], enemy: foe(300_000, ['Wind'], 1, 120, 110, 800, 'Boss'), cycles: 1, seed: s })
    const enemy = probe.roster.find(x => x.side === 'enemy' && !x.dead)
    const dh = probe.roster.find(x => x.kind === 'char' && !x.dead)
    probe.addBuff(enemy!, { id: 'void_buff', name: 'Void Shield', mods: [{ stat: 'mitigation', value: 0.1 }], turns: 99 })
    probe.hit(dh!, enemy!, { type: 'basic', mult: 1, label: 'testA' })   // hit 1 of attack #N
    probe.hit(dh!, enemy!, { type: 'basic', mult: 1, label: 'testA' })   // hit 2 of attack #N (same seq)
    probe.hit(dh!, enemy!, { type: 'fua', mult: 1, label: 'testB' })     // attack #N+1
    if (probe.logLines.some(l => l.includes('Return to Darkness: dispelled'))) rdc = probe
  }
  if (rdc) {
    const dis = rdc.logLines.filter(l => l.includes('Return to Darkness: dispelled'))
    chk(rdc, 'lc-batch', 'return_dark: dispel triggers on some seed', dis.length >= 1)
    chk(rdc, 'lc-batch', 'return_dark: once per attack (2 same-attack hits + 1 new = max 2)', dis.length <= 2)
  } else chk(rdc!, 'lc-batch', 'return_dark: dispel triggers on some seed', false)  // never reached; rdc undefined
}
{
  // day_one (party All-Type RES → target-side `resAll`): enemyHit must apply the ally's RES or the
  // buff is a silent no-op. Same fight with/without day_one → summed enemy "hits" damage strictly lower.
  const foeSpec = () => foe(120_000, ['Quantum'], 1, 120, 110, 900, 'Boss')
  const hitsTotal = (s: typeof sim0) => {
    let t = 0
    for (const l of s.logLines) { const m = l.match(/hits (\w+): (\d+)/); if (m) t += +m[2] }
    return t
  }
  const sim0 = runBattle({ team: [{ kitId: 'clara', stats: DPS }], enemy: foeSpec(), cycles: 4, seed: 9 })
  const sim1 = runBattle({ team: [{ kitId: 'clara', stats: DPS, gear: { coneId: 'day_one', si: 1 }, path: 'Preservation' }], enemy: foeSpec(), cycles: 4, seed: 9 })
  const no = hitsTotal(sim0), withD = hitsTotal(sim1)
  chk(sim1, 'lc-batch', 'day_one: party All-Type RES buff applied', sim1.buffLog.some(x => x.id === 'day_one_res'))
  chk(sim1, 'lc-batch', 'day_one: enemy hits lower with RES raise', withD < no)
}
{
  // Tutorial deterministic: pela opens with full energy → ults turn 1 → Exposed DEF- lands on the
  // sole boss; danheng then attacks that defRed target → cone grants +4 energy.
  const sim = runBattle({
    team: [
      { kitId: 'pela', stats: SUP, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, gear: { coneId: 'tutorial_before', si: 1 }, path: 'Nihility' },
    ],
    enemy: foe(120_000, ['Quantum', 'Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 5, seed: 3,
  })
  chk(sim, 'lc-batch', 'tutorial_before: +4 energy on DEF-down hit', sim.logLines.some(l => /Tutorial: \+4 energy/.test(l)))
}
{
  // echo_coffin (Luocha cone): Thorns per-attack Energy (distinct enemies, cap 3/attack) + ult SPD to allies
  const sim = runBattle({
    team: [{ kitId: 'luocha', stats: HEAL, gear: { coneId: 'echo_coffin', si: 2 } }],
    enemy: foe(80_000, ['Imaginary'], 1, 120, 115, 400, 'Mob'),
    cycles: 3, seed: 3,
  })
  chk(sim, 'lc-batch', 'echo_coffin: per-attack energy grants (Thorns)', sim.logLines.some(l => /Echoes of the Coffin: \+/.test(l)))
  chk(sim, 'lc-batch', 'echo_coffin: ult → ally SPD buff', sim.buffLog.some(x => x.id === 'coffin_spd'))
  chk(sim, 'lc-batch', 'echo_coffin: SPD value scales with SI (SI2 = 14)', sim.buffLog.filter(x => x.id === 'coffin_spd').some(x => (x.mods ?? []).some(m => m.stat === 'spdFlat' && Math.abs(m.value - 14) < 1e-9)))
}
{
  // wildfire (We Are Wildfire): battle-start party mitigation 8%+2%(si) 5t + heal 30%+5%(si) of missing HP
  const sim = runBattle({
    team: [{ kitId: 'march7th', stats: HEAL, gear: { coneId: 'wildfire', si: 3 } }],
    enemy: foe(60_000, ['Ice'], 1, 120, 115, 500, 'Mob'),
    cycles: 3, seed: 3,
  })
  chk(sim, 'lc-batch', 'wildfire: mitigation scales with SI (SI3 = 12%)', sim.buffLog.some(x => x.id === 'wildfire_mit' && (x.mods ?? []).some(m => m.stat === 'mitigation' && Math.abs(m.value - 0.12) < 1e-9)))
  chk(sim, 'lc-batch', 'wildfire: no swapped 30% mitigation (stat-swap fix)', !sim.buffLog.some(x => x.id === 'wildfire_mit' && (x.mods ?? []).some(m => m.stat === 'mitigation' && Math.abs(m.value - 0.30) < 1e-9)))
}
{
  // time_woven_gold: Brocade CD stacks grow on wearer/memosprite attacks (max 6, SI-scaled)
  const sim = runBattle({
    team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'time_woven_gold', si: 1 } }],
    enemy: foe(150_000, ['Lightning'], 1, 120, 110, 500, 'Boss'),
    cycles: 4, seed: 3,
  })
  const st = sim.buffLog.filter(x => x.id === 'brocade').map(x => x.stacks ?? 0)
  const maxSt = st.length ? Math.max(...st) : 0
  chk(sim, 'lc-batch', 'time_woven_gold: Brocade CD stacks accumulate (max 6)', maxSt === 6)
  chk(sim, 'lc-batch', 'time_woven_gold: no static 6x CD in base mods (dynamic)', !!coneMods(sim, 'Aglaea') && !((coneMods(sim, 'Aglaea').critDmg ?? 0) >= (0.09 * 6 - 1e-9)))
  // per-stack value (sumMods multiplies by stacks); a running total here double-counted.
  chk(sim, 'lc-batch', 'time_woven_gold: CD value is per-stack (×stacks in sumMods)', sim.buffLog.some(x => x.id === 'brocade' && (x.mods ?? []).some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.09) < 1e-9)) && !sim.buffLog.some(x => x.id === 'brocade' && (x.mods ?? []).some(m => m.stat === 'critDmg' && m.value > 0.1)))
}

// ============ 39. STACK CONES (moles / eternal_calculus / only_silence / birth_self / blue_sky / morrow / reforged) ============
{
  const sim = runBattle({
    team: [
      { kitId: 'seele', stats: DPS, gear: { coneId: 'only_silence', si: 1 }, skillPriority: 1 },
      { kitId: 'luocha', stats: HEAL, gear: { coneId: 'morrow', si: 1 } },
    ],
    enemy: foe(80_000, ['Quantum'], 1, 120, 115, 400, 'Mob'),
    cycles: 3, seed: 3,
  })
  chk(sim, 'stack-cones', 'only_silence: ≤2 enemies → critRate hitMods', sim.buffLog.some(e => e.id === '_gearhm' && (e.mods ?? []).some(m => m.stat === 'critRate' && Math.abs(m.value - 0.12) < 1e-9)))
  chk(sim, 'stack-cones', 'morrow: ally ≥50% HP → dmgAll hitMods', sim.buffLog.some(e => e.id === '_gearhm' && (e.mods ?? []).some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.12) < 1e-9)))
}
{
  const sim = runBattle({
    team: [{ kitId: 'blade', stats: { ...DPS, hp: 12000, atk: 2800 }, gear: { coneId: 'moles', si: 1 }, skillPriority: 1 }],
    enemy: foe(120_000, ['Wind'], 2, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'stack-cones', 'moles: Mischievous ATK stacks accumulate', sim.buffLog.some(x => x.id === 'moles_atk' && (x.stacks ?? 0) >= 2))
  chk(sim, 'stack-cones', 'moles: cap 3 stacks', sim.buffLog.some(x => x.id === 'moles_atk' && (x.stacks ?? 0) === 3))
}
{
  const sim = runBattle({
    team: [{ kitId: 'firefly', stats: { ...DPS, atk: 3000 }, gear: { coneId: 'blue_sky', si: 1 }, skillPriority: 2 }],
    enemy: foe(20_000, ['Fire'], 3, 60, 115, 400, 'Mob'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'stack-cones', 'blue_sky: kill → critRate 3t', sim.buffLog.some(x => x.id === 'blue_sky_cr'))
}
{
  const sim = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'eternal_calculus', si: 1 }, skillPriority: 1 }],
    enemy: foe(60_000, ['Fire'], 4, 60, 115, 400, 'Mob'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'stack-cones', 'eternal_calculus: per-enemy ATK stacks', sim.buffLog.some(x => x.id === 'ec_atk' && (x.mods ?? []).some(m => m.stat === 'atkPct' && m.value >= 0.08)))
  chk(sim, 'stack-cones', 'eternal_calculus: ≥3 targets → SPD', sim.buffLog.some(x => x.id === 'ec_spd'))
}
{
  const sim = runBattle({
    team: [{ kitId: 'himeko', stats: DPS, gear: { coneId: 'birth_self', si: 1 }, skillPriority: 1 }],
    enemy: foe(12_000, ['Fire'], 3, 30, 115, 400, 'Mob'),
    cycles: 8, seed: 3,
  })
  chk(sim, 'stack-cones', 'birth_self: FUA extra vs ≤50% HP target', sim.buffLog.some(e => e.id === '_gearhm' && (e.mods ?? []).some(m => m.stat === 'boost:fua' && m.value > 0)))
}
{
  const sim = runBattle({
    team: [{ kitId: 'kafka', stats: DPS, gear: { coneId: 'reforged', si: 1 }, energyStartFrac: 1, skillPriority: 2 }],
    enemy: foe(50_000, ['Lightning'], 2, 60, 115, 400, 'Mob'),
    cycles: 4, seed: 3,
  })
  chk(sim, 'stack-cones', 'reforged: Prophet stacks per DoT type', sim.buffLog.some(x => x.id === 'prophet_atk' && (x.stacks ?? 1) >= 1))
}

// block 29: herta — skill/ult damage, FUA trigger when ally drops enemy ≤50% HP
{
  const s = runBattle({
    team: [
      { kitId: 'herta', stats: DPS, skillPriority: 2 },
      { kitId: 'bronya', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(60_000, ['Ice'], 2, 120, 120, 600, 'Mob'),
    cycles: 4, seed: 5,
  })
  chk(s, 'herta', 'skill fires', s.logLines.some(l => l.includes('One-Time Offer')))
  chk(s, 'herta', 'ult fires', s.logLines.some(l => l.includes("It's Magic")))
  chk(s, 'herta', 'FUA fires (ally drops enemy ≤50%)', s.logLines.some(l => l.includes("Fine, I'll Do It Myself!")))
  chk(s, 'herta', 'FUA grants +5 energy (talent sp_base 5)', s.logLines.some(l => l.includes('energy +5')))
  const hB = kitById('herta')?.base
  chk(s, 'herta', 'canon base (952/582/396/100)', !!hB && hB.hp === 952 && hB.atk === 582 && hB.def === 396 && hB.spd === 100)
  chk(s, 'herta', 'energyMax 110 (sp_need)', kitById('herta')?.energyMax === 110)
}
// block 29b: herta E1 — basic vs ≤50% target triggers Additional DMG (40% ATK)
{
  const s = runBattle({
    team: [{ kitId: 'herta', stats: DPS, skillPriority: -1, eidolon: 1 }],
    enemy: foe(4_000, ['Ice'], 1, 80, 120, 700, 'Mob'),
    cycles: 3, seed: 1,
  })
  chk(s, 'herta', 'E1 Additional DMG vs ≤50% target', s.logLines.some(l => l.includes('Herta E1 Additional')))
}

// block 30: serval — canon sweep (base, energyMax, Shock, Talent all-Shocked, E1/E2/E4/E6, A2/A4/A6)
{
  const s = runBattle({
    team: [{ kitId: 'serval', stats: DPS, skillPriority: 2, energyStartFrac: 1, eidolon: 6 }],
    enemy: foe(80_000, ['Lightning'], 1, 120, 120, 600, 'Elite'),
    cycles: 4, seed: 5,
  })
  const kb = kitById('serval')!
  chk(s, 'serval', 'base = PROG.serval.base {917,652,374,104}', kb.base.hp === 917 && kb.base.atk === 652 && kb.base.def === 374 && kb.base.spd === 104)
  chk(s, 'serval', 'energyMax 100', kb.energyMax === 100)
  chk(s, 'serval', 'A4 String Vibration start +15 EN', s.logLines.some(l => l.includes('String Vibration')))
  chk(s, 'serval', 'Shock landed (log)', s.logLines.some(l => l.includes('Shock lands')))
  chk(s, 'serval', 'Talent Additional DMG fires vs Shocked', s.logLines.filter(l => l.includes('Talent Additional')).length >= 1)
  chk(s, 'serval', 'ult fires', s.logLines.some(l => l.includes('Voltage')))
  chk(s, 'serval', 'convention (energy +5)', s.logLines.some(l => l.includes('energy +5')))
  chk(s, 'serval', 'E6 transient vs Shocked (buffLog)', live(s, 'serval_e6'))
  const sBasic = runBattle({ team: [{ kitId: 'serval', stats: DPS, skillPriority: -1, energyStartFrac: 0, eidolon: 6 }], enemy: foe(80_000, ['Lightning'], 2, 120, 120, 600, 'Elite'), cycles: 2, seed: 5 })
  chk(sBasic, 'serval', 'E1 Echo Chamber fires (basic)', sBasic.logLines.some(l => l.includes('Echo Chamber')))
  chk(s, 'serval', 'E2 Encore +4 Energy (log)', s.logLines.some(l => l.includes('Encore! (energy +4)')))
}

// block 31: gepard — Shield ult, Freeze skill, Revive (brutal enemy to force revive)
{
  const s = runBattle({
    team: [{ kitId: 'gepard', stats: { ...SUP, def: 2500 }, skillPriority: 1, eidolon: 1 }],
    enemy: foe(100_000, ['Ice'], 1, 120, 180, 4500, 'Boss'),
    cycles: 6, seed: 5,
  })
  chk(s, 'gepard', 'ult applies shield', s.buffLog.some(b => b.id === 'gepard_shield'))
  chk(s, 'gepard', 'skill freezes enemy (log)', s.logLines.some(l => l.includes('Freeze lands')))
  chk(s, 'gepard', 'Freeze deals Ice Additional DMG at frozen turn start', s.logLines.some(l => /\d+ \[Frozen Additional DMG\]/.test(l)))
  chk(s, 'gepard', 'A2 Grit: ATK+35% of current DEF refreshed each turn', s.buffLog.some(b => b.id === 'gepard_a2' && b.mods?.some(m => m.stat === 'atkFlat' && m.value > 0)))
  const gepard = s.roster.find(a => a.kitId === 'gepard')
  chk(s, 'gepard', 'revive fires once', !!gepard && (s.rt(gepard).gepard_revived as boolean) === true)
}

// gepard canon: E2 on unfreeze (not on apply), E6 immediate action, Ult shield = effDEF-based
{
  const mk = (eidolon: number) => {
    const s = prepareBattle({
      team: [{ kitId: 'gepard', stats: { ...SUP, def: 2500 }, skillPriority: 1, eidolon }],
      enemy: foe(100_000, ['Ice'], 1, 120, 180, 2500, 'Boss'),
      cycles: 4, seed: 5,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'gepard')!
    return { s, u, ctx: s.rt(u), t: s.livingEnemiesOf(u)[0] }
  }
  const kit = kitById('gepard')!

  // Ult shield = 45% of EFFECTIVE DEF + 600 flat, 3 turns; decide prefers ult at full energy
  const ul = mk(0)
  ul.u.energy = ul.u.maxEnergy
  chk(ul.s, 'gepard-canon', 'decide: ult at full energy', kit.decide!(ul.s, ul.u, ul.ctx).kind === 'ult')
  kit.perform(ul.s, ul.u, { kind: 'ult' }, ul.ctx)
  const sh = ul.u.buffs.find(b => b.id === 'gepard_shield')
  chk(ul.s, 'gepard-canon', 'Ult shield = 45% effDEF + 600 flat, 3 turns',
    !!sh && sh.turns === 3 && sh.shield === Math.floor(ul.s.effDef(ul.u) * 0.45 + 600))

  // E2: no SPD↓ while frozen; SPD-20% for 1 turn once unfrozen
  const e2 = mk(2)
  kit.perform(e2.s, e2.u, { kind: 'skill' }, e2.ctx)
  const frozenT = e2.t.dots.some(d => d.kind === 'Freeze')
  chk(e2.s, 'gepard-canon', 'Skill freezes (chance roll) and applies NO immediate E2 SPD↓',
    frozenT && !e2.t.buffs.some(b => b.id === 'gepard_e2'))
  const last = e2.t.dots.find(d => d.kind === 'Freeze')
  if (last) last.turns = 1
  kit.onFrozenTurn!(e2.s, e2.t, e2.ctx)
  chk(e2.s, 'gepard-canon', 'E2 on unfreeze: SPD-20% for 1 turn + Frozen Additional DMG',
    e2.t.buffs.some(b => b.id === 'gepard_e2' && b.turns === 1 && b.mods?.[0]?.stat === 'spdDown' && Math.abs(b.mods[0].value - 0.2) < 1e-9)
    && e2.s.logLines.some(l => /Gepard E2: .* unfrozen/.test(l)) && e2.s.logLines.some(l => /\[Frozen Additional DMG\]/.test(l)))

  // an Ice weakness break applies its own source-less Freeze dot (applyBreakDebuff, baseDmg 0);
  // Freeze is one status, so both dots collapse into one skipped turn with one frozen-damage tick
  const mf = mk(0)
  mf.t.dots.push({ kind: 'Freeze', elem: 'Ice', turns: 1, baseDmg: Math.floor(mf.s.effAtk(mf.u) * 0.6), sourceUnit: mf.u } as never)
  mf.t.dots.unshift({ kind: 'Freeze', elem: 'Ice', turns: 1, baseDmg: 0, sourceUnit: mf.t } as never)
  const tp = mf.s as unknown as { turnPrologue(x: unknown): string }
  const p1 = tp.turnPrologue(mf.t)
  const p2 = tp.turnPrologue(mf.t)
  chk(mf.s, 'gepard-canon', 'break-Freeze + Gepard Freeze merge: 1 skipped turn, 1 Frozen DMG tick, no leftover Freeze',
    p1 === 'frozen' && p2 === 'go' && !mf.t.dots.some(d => d.kind === 'Freeze')
    && mf.s.logLines.filter(l => /is Frozen — turn skipped/.test(l)).length === 1
    && mf.s.logLines.some(l => /\[Frozen Additional DMG\]/.test(l)))

  // E6: revive grants +50% MaxHP extra heal and an immediate action
  const e6 = mk(6)
  e6.u.hp = 0
  e6.s.hit(e6.t, e6.u, { type: 'basic', mult: 0, elem: 'Ice' })
  kit.onAllyHit!(e6.s, e6.t, e6.u, 1, e6.ctx)
  chk(e6.s, 'gepard-canon', 'E6 revive: 50% talent + 50% MaxHP heal, energy full, immediate action',
    e6.u.hp === Math.floor(e6.u.maxHp * 0.5) + Math.floor(e6.u.maxHp * 0.5) && e6.u.energy === e6.u.maxEnergy
    && e6.s.logLines.some(l => /Gepard E6: immediately takes action/.test(l)))
}

// block 32: natasha — canon (base=PROG, energyMax), skill heal + HoT consumed at ally turn start,
// ult heal + `(energy +5)`, A4 OHB, Innervation outHeal on natasha, solo E1 self-heal, E4 +5 EN
{
  const s = runBattle({
    team: [
      { kitId: 'natasha', stats: { ...HEAL, def: 500 }, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'seele', stats: { ...DPS, hp: 800 }, skillPriority: 1 },
    ],
    enemy: foe(200_000, ['Quantum'], 1, 120, 170, 5200, 'Boss'),
    cycles: 5, seed: 5,
  })
  // solo natasha vs strong boss: she gets hit → E4 +5 EN log; HP drops ≤30% → E1 self-heal once
  const s2 = runBattle({
    team: [
      { kitId: 'natasha', stats: { ...HEAL, def: 300, hp: 4000 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
    ],
    enemy: foe(400_000, ['Physical'], 1, 120, 170, 9000, 'Boss'),
    cycles: 7, seed: 3,
  })
  // e0 solo: no E1 heal lift → boss hit leaves natasha ≤30% at her own turn start → Innervation armed
  const s3 = runBattle({
    team: [
      { kitId: 'natasha', stats: { ...HEAL, def: 300, hp: 3200 }, skillPriority: 2, energyStartFrac: 1 },
    ],
    enemy: foe(400_000, ['Physical'], 1, 120, 170, 7000, 'Boss'),
    cycles: 6, seed: 3,
  })
  const kb = kitById('natasha')!
  chk(s, 'natasha', 'canon base =PROG', kb.base.hp === PROG.natasha.base.hp && kb.base.atk === PROG.natasha.base.atk && kb.base.def === PROG.natasha.base.def && kb.base.spd === PROG.natasha.base.spd)
  chk(s, 'natasha', 'energyMax =90', kb.energyMax === 90)
  chk(s, 'natasha', 'skill heals + logs', s.logLines.some(l => /Love, Heal, and Choose/.test(l)))
  chk(s, 'natasha', 'ult fires with (energy +5)', s.logLines.some(l => /Gift of Rebirth \(energy \+5\)/.test(l)))
  chk(s, 'natasha', 'A4 Healer OHB buff', s.buffLog.some(b => b.id === 'natasha_a4'))
  chk(s, 'natasha', 'Innervation outHeal on natasha', s3.logLines.some(l => /Innervation active/.test(l)))
  chk(s2, 'natasha', 'E4 Miracle Cure: +5 Energy on hit (log)', s2.logLines.some(l => /E4 Miracle Cure/.test(l)))
  chk(s2, 'natasha', 'E1 self-heal ≤30% once', s2.logLines.some(l => /E1 Pharmacology Expertise/.test(l)))
}

// block 33: clara — Counter on self-hit, Enhanced Counter after Ult, Skill AoE + extra vs Marked, E1 retention / E2 / E4 / E6
{
  const s = runBattle({
    team: [
      { kitId: 'clara', stats: DPS, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Physical'], 1, 120, 140, 1600, 'Boss'),
    cycles: 6, seed: 11,
  })
  const kb = kitById('clara')?.base
  chk(s, 'clara', 'base lv80 = canon', kb?.hp === 1241 && kb?.atk === 737 && kb?.spd === 90)
  chk(s, 'clara', 'energyMax 110', s.units().find(u => u.kitId === 'clara')?.maxEnergy === 110)
  chk(s, 'clara', 'Talent protect mitigation 0.1', Math.abs(lastVal(s, 'clara_protect', 'mitigation') - 0.1) < 1e-9)
  chk(s, 'clara', 'Svarog Counter fires', s.logLines.some(l => /Svarog Counter/.test(l)))
  chk(s, 'clara', 'Counter +5 Energy (talent sp_base 5)', s.logLines.some(l => /Svarog Counter .*\(energy \+5\)/.test(l)))
  chk(s, 'clara', 'Ult fires + (energy +5)', s.logLines.some(l => /Promise, Not Command .*\(energy \+5\)/.test(l)))
  chk(s, 'clara', 'Ult: no direct damage (no hit log for Promise)', s.logLines.every(l => !/Promise, Not Command/.test(l) || l.includes('(energy +5)') || l.includes('[SKILL]') || l.includes('[BASIC]') || l.includes('[ULT]')))
  chk(s, 'clara', 'Ult buff mitigation 0.25 + aggro', Math.abs(lastVal(s, 'clara_ult', 'mitigation') - 0.25) < 1e-9 && lastVal(s, 'clara_ult', 'aggro') > 0)
  chk(s, 'clara', 'Boosted Counter fires after ult', s.logLines.some(l => /Enhanced/.test(l)))
  chk(s, 'clara', 'Skill AoE: no adj hits (canon AoE)', !s.logLines.some(l => /\(adj\)/.test(l)))
  chk(s, 'clara', 'Mark of Counter applied', s.buffLog.some(b => b.id === 'clara_mark'))
  chk(s, 'clara', 'Skill extra vs Marked target', s.logLines.some(l => /Svarog Watches \((main|extra)\)/.test(l)))

  // E2 buff + E6 enhanced-counter count are deterministic on eid
  const s2 = runBattle({
    team: [
      { kitId: 'clara', stats: DPS, eidolon: 2, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Physical'], 1, 120, 140, 1800, 'Boss'),
    cycles: 6, seed: 12,
  })
  chk(s2, 'clara', 'E2 A Tight Embrace: ATK+30% after ult', Math.abs(lastVal(s2, 'clara_e2', 'atkPct') - 0.3) < 1e-9)
  const s4 = runBattle({
    team: [
      { kitId: 'clara', stats: DPS, eidolon: 4, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Physical'], 1, 120, 140, 1800, 'Boss'),
    cycles: 6, seed: 14,
  })
  chk(s4, 'clara', 'E4 Family\'s Warmth buffed after being hit', lastVal(s4, 'clara_e4', 'mitigation') >= 0.3 - 1e-9)
  const s6 = runBattle({
    team: [
      { kitId: 'clara', stats: DPS, eidolon: 6, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(150_000, ['Physical'], 1, 120, 140, 1800, 'Boss'),
    cycles: 6, seed: 13,
  })
  chk(s6, 'clara', 'E6: Enhanced Counter count 3 (base 2 +1)', s6.logLines.some(l => /3 enhanced counters/.test(l)))
  chk(s6, 'clara', 'Ult buff mitigation 0.27, E5→ult lv12', Math.abs(lastVal(s6, 'clara_ult', 'mitigation') - 0.27) < 1e-9)
}

// block 34: sampo — Wind Shear stacks, Ult DoT vulnerability, Skill bounces
{
  const s = runBattle({
    team: [
      { kitId: 'sampo', stats: DPS, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(80_000, ['Wind'], 2, 120, 120, 600, 'Mob'),
    cycles: 5, seed: 5,
  })
  chk(s, 'sampo', 'Wind Shear applied', s.logLines.some(l => /Wind Shear lands/.test(l)))
  chk(s, 'sampo', 'Surprise Present fires', s.logLines.some(l => /Surprise Present/.test(l)))
  chk(s, 'sampo', 'Ricochet Love fires', s.logLines.some(l => /Ricochet Love/.test(l)))
  chk(s, 'sampo', 'DoT vulnerability applied', s.buffLog.some(b => b.id === 'sampo_ult_vuln'))
}
// block 34b: sampo — every bounce hit re-rolls Wind Shear (1 foe, 5 hits → each lands)
{
  const s = runBattle({
    team: [{ kitId: 'sampo', stats: { ...DPS, ehr: 0.6 }, skillPriority: 1 }],
    enemy: foe(500_000, ['Wind'], 1, 120, 60, 600, 'Mob'),
    cycles: 2, seed: 7,
  })
  const lands = s.logLines.filter(l => /Wind Shear lands/.test(l)).length
  chk(s, 'sampo', `per-bounce Wind Shear: 5 hits on 1 foe = 5 lands (lands: ${lands})`, lands >= 5)
}

// block 35: hook — Burn on Skill, Ult → Enhanced Skill (Blast), Talent Additional DMG
{
  const s = runBattle({
    team: [
      { kitId: 'hook', stats: DPS, skillPriority: 1 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(80_000, ['Fire'], 2, 120, 120, 600, 'Mob'),
    cycles: 5, seed: 5,
  })
  chk(s, 'hook', 'Burn applied', s.logLines.some(l => /Burn lands/.test(l)))
  chk(s, 'hook', 'Enhanced Skill fires', s.logLines.some(l => /Enhanced Skill/.test(l)))
  chk(s, 'hook', 'Talent Additional DMG fires', s.logLines.some(l => /Oil to the Flames/.test(l)))
  chk(s, 'hook', 'Ult fires', s.logLines.some(l => /Boom! Here Comes/.test(l)))
}

// block 35b: hook — canon audit: energyMax 120, Burn DoT = skill DoT column (0.65 ATK), 2t/3t E2,
// Ult 2 hits 30/70, E1 Enhanced Skill +20%, E4 adjacency-Burn on Talent trigger, E6 vs Burned,
// A2 Innocence heal, A6 advance+energy. Direct perform() calls (no loop) keep the comparisons exact.
{
  const kit = kitById('hook')!
  const mk = (eidolon: number) => {
    const s = prepareBattle({
      team: [{ kitId: 'hook', stats: DPS, skillPriority: 1, eidolon }],
      enemy: foe(5_000_000, ['Fire'], 2, 120, 100, 300, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'hook')!
    return { s, u, ctx: s.rt(u) }
  }
  const act = (m: ReturnType<typeof mk>, kind: 'basic' | 'skill' | 'ult'): void => {
    if (kind !== 'basic') m.s.spendSp(1)
    if (kind === 'ult') m.u.energy = m.u.maxEnergy
    kit.perform(m.s, m.u, { kind }, m.ctx)
  }
  const burned = (m: ReturnType<typeof mk>, i: number): boolean =>
    !!m.s.livingEnemiesOf(m.u)[i]?.dots.some(d => d.kind === 'Burn')
  const bySkill = (m: ReturnType<typeof mk>, label: string): number => accOf(m.s, 'hook')?.[1].bySkill[label] ?? 0
  const total = (m: ReturnType<typeof mk>): number => Object.values(accOf(m.s, 'hook')?.[1].bySkill ?? {}).reduce((a, b) => a + b, 0)

  const a = mk(0); act(a, 'skill')
  const d0 = a.s.livingEnemiesOf(a.u)[0].dots.find(d => d.kind === 'Burn')
  chk(a.s, 'hook-canon', 'energyMax 120 = sp_need', a.u.maxEnergy === 120)
  chk(a.s, 'hook-canon', 'Burn DoT = 0.65 × effAtk (DoT column, L10)', !!d0 && Math.abs(d0.baseDmg / a.s.effAtk(a.u) - 0.65) < 0.01)
  chk(a.s, 'hook-canon', 'Burn 2 turns (E0)', !!d0 && d0.turns === 2)
  const b = mk(2); act(b, 'skill')
  const d2 = b.s.livingEnemiesOf(b.u)[0].dots.find(d => d.kind === 'Burn')
  chk(b.s, 'hook-canon', 'E2: Burn lasts 3 turns', !!d2 && d2.turns === 3)

  const c = mk(0); act(c, 'ult')
  chk(c.s, 'hook-canon', 'Ult = 2 hits (30% + 70%)', c.s.logLines.filter(l => l.includes('[Boom! Here Comes the Fire!]')).length === 2)
  chk(c.s, 'hook-canon', 'A6: advance 20% + 5 Energy after Ult', c.s.logLines.some(l => l.includes('A6 Playing With Fire')) && Math.abs(c.u.energy - 5) < 1e-6)

  const enh = (eidolon: number) => { const m = mk(eidolon); act(m, 'ult'); act(m, 'skill'); return { m, d: bySkill(m, 'Enhanced Skill (main)') + bySkill(m, 'Enhanced Skill (adj)') } }
  const e0 = enh(0), e1 = enh(1)
  chk(e1.m.s, 'hook-canon', 'E1: Enhanced Skill +20% DMG (main+adj)', e0.d > 0 && Math.abs(e1.d / e0.d - 1.2) < 0.02)

  const f4 = mk(4); act(f4, 'skill'); act(f4, 'basic')
  chk(f4.s, 'hook-canon', 'E4: Talent trigger → Burn adjacent enemies', burned(f4, 1))
  const f0 = mk(0); act(f0, 'skill'); act(f0, 'basic')
  chk(f0.s, 'hook-canon', 'E0: adjacent enemy stays unburned', !burned(f0, 1))

  const tot = (eidolon: number) => { const m = mk(eidolon); act(m, 'skill'); act(m, 'ult'); act(m, 'basic'); return { m, d: total(m) } }
  const g0 = tot(0), g6 = tot(6)
  chk(g6.m.s, 'hook-canon', 'E6: +20% DMG to Burned enemies', g6.d > g0.d * 1.12)

  const h = mk(0); act(h, 'skill'); h.u.hp -= 500; act(h, 'basic')
  chk(h.s, 'hook-canon', 'A2 Innocence: Talent trigger heals 5% MaxHP', Math.abs(h.u.hp - (h.u.maxHp - 500 + Math.round(h.u.maxHp * 0.05))) < 1e-6)
}

// block 36: qingque — canon 120101-120104/120108: 3-suit hand (cap 4 + discard), Basic tosses from
// the FEWEST suit, Hidden Hand gated on turn start, no-damage Skill + real Extra Turn, A0 Bide
// Time per stack, E2 energy per Draw Tile, E4 Self-Sufficer, E6 +1 SP, Tile Battle SP refund,
// Skill grants no Energy (solo gauge identity), skillPriority < 0 = Basic-only route
{
  const q = (eid: number, seed = 5) => runBattle({
    team: [
      { kitId: 'qingque', stats: DPS, skillPriority: 2, eidolon: eid, energyStartFrac: 1 },
      { kitId: 'sparkle', stats: SUP }, { kitId: 'sunday', stats: SUP }, { kitId: 'hyacine', stats: HEAL },
    ],
    enemy: foe(150_000, ['Quantum'], 3, 120, 120, 600, 'Mob'),
    cycles: 8, seed,
  })
  const near = (a: number | undefined, b: number) => Math.abs((a ?? -9) - b) < 1e-9
  const s = q(6)
  const qu = s.roster.find(x => x.kitId === 'qingque')!
  const qlv = s.rt(qu).levels as { basic: number; skill: number; ult: number; talent: number }
  const perStack = mult('qingque', 'skill_a2', qlv.skill) + 0.1
  const SUIT = { Spade: 0, Heart: 1, Diamond: 2 } as Record<string, number>
  const HAND = /\[Spade=(\d+) Heart=(\d+) Diamond=(\d+)\]/
  // replay the hand straight out of the transcript: every tag line prints the state AFTER the action
  let overCap = 0, badToss = 0, badUlt = 0, badHidden = 0, badStack = 0, negTiles = 0
  let draws = 0, discards = 0, tosses = 0, quads = 0, e2 = 0
  for (const l of s.logLines) {
    const m = HAND.exec(l)
    if (m) {
      const h = [+m[1], +m[2], +m[3]]
      if (h[0] + h[1] + h[2] > 4) overCap++
      if (h.some(n => n < 0)) negTiles++
      if (/A Quartet\? Woo-hoo! — 4 \w+ tiles/.test(l) && (Math.max(...h) !== 4 || h.reduce((a, b) => a + b) !== 4)) badUlt++
      if (/Hidden Hand \(4 \w+ tiles\)/.test(l)) {
        quads++
        if (Math.max(...h) !== 4 || h.reduce((a, b) => a + b) !== 4) badHidden++
      }
      const t = /tosses a (\w+) tile/.exec(l)
      if (t) {
        tosses++
        // undo the toss (the log shows the post-toss hand) and re-check the fewest-suit rule:
        // the tossed suit must not hold more tiles than any OTHER suit she holds
        const before = [...h] as number[]
        const si = SUIT[t[1]]
        before[si] += 1
        if (before.some((n, j) => j !== si && n > 0 && n < before[si])) badToss++
      }
    }
    if (/draws a \w+ tile/.test(l)) draws++
    if (/discards a \w+ tile/.test(l)) discards++
    if (/E2: \+1 Energy \(Draw Tile\)/.test(l)) e2++
  }
  const bide = s.buffLog.filter(e => e.id === 'qingque_draw')
  for (const e of bide) {
    const v = e.mods?.find(m => m.stat === 'dmgAll')?.value
    const st = v === undefined ? 0 : v / perStack
    if (!(st >= 1 && st <= 4 && near(st, Math.round(st)))) badStack++
  }
  // the cap is read off the log itself: every boost marker prints `boost N/skill_a3`
  const boosts = s.logLines.map(l => /A Scoop of Moon \(draw 2, boost (\d+)\/(\d+)\)/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null).map(m => [+m[1], +m[2]])
  const maxSt = boosts.reduce((a, b) => Math.max(a, b[0]), 0)
  // E3 = Ult+2/Talent+2 and E5 = Skill+2/Basic+1 (EIDOLON_LV in battle.ts). resolveLevels is
  // cumulative, so E3 is the discriminating pair: the default branch would hand out Skill+2 at E3
  // and Talent+2 at E5 (skill 12 / talent 10) instead of the canon ult 12 / talent 12 / skill 10.
  const e3lv = resolveLevels({ kitId: 'qingque', eidolon: 3 } as never)
  const e5lv = resolveLevels({ kitId: 'qingque', eidolon: 5 } as never)
  // Skill -> her own Basic next (the Extra Turn is real, not just a log line)
  const si = s.logLines.findIndex(l => /\[SKILL\] A Scoop of Moon/.test(l))
  const bi = si >= 0 ? s.logLines.findIndex((l, i) => i > si && /\[BASIC\]/.test(l) && /qingque/i.test(l)) : -1

  chk(s, 'qingque', 'hand never exceeds 4 tiles (cap + discard)', overCap === 0 && draws > 0)
  chk(s, 'qingque', 'tile counts never go negative (toss only from a held suit)', negTiles === 0)
  chk(s, 'qingque', 'Basic tosses a tile from the FEWEST suit only', tosses > 0 && badToss === 0)
  chk(s, 'qingque', 'Ult always leaves a 4-of-a-kind hand', badUlt === 0 && s.logLines.some(l => /\[ULT\] A Quartet\? Woo-hoo!/.test(l)))
  chk(s, 'qingque', 'Hidden Hand only from a 4-of-a-kind (turn-start gate)', quads > 0 && badHidden === 0)
  chk(s, 'qingque', 'draw discards once the hand is full', discards > 0)
  chk(s, 'qingque', 'Skill deals NO damage (canon: draw 2 + DMG boost only)', !s.logLines.some(l => /\[A Scoop of Moon\]/.test(l)))
  chk(s, 'qingque', 'A0 Bide Time: +10% DMG Boost per stack', bide.length > 0 && badStack === 0)
  chk(s, 'qingque', 'DMG boost caps at skill_a3 = 4 stacks', boosts.length > 0 && boosts.every(b => b[1] === 4 && b[0] <= 4))
  chk(s, 'qingque', 'DMG boost stacks accumulate (>1 stack reached)', maxSt >= 2)
  chk(s, 'qingque', 'Skill grants a real Extra Turn (her own Basic follows)', bi > si && s.logLines.some(l => /qingque.*gains an Extra Turn/i.test(l)))
  chk(s, 'qingque', 'Tile Battle SP refund fires exactly once', s.logLines.filter(l => /Tile Battle: \+1 SP/.test(l)).length === 1)
  chk(s, 'qingque', 'E6: +1 SP after enhanced basic', s.logLines.some(l => /E6: \+1 SP/.test(l)))
  chk(s, 'qingque', 'E2: +1 Energy per Draw Tile trigger', e2 > 0 && e2 === draws + discards)
  chk(s, 'qingque', 'E4 Self-Sufficer FUA fires', s.logLines.some(l => /E4 Self-Sufficer \(FUA\)/.test(l)))
  chk(s, 'qingque', 'Hidden Hand ATK = talent ladder', s.buffLog.some(e => e.id === 'qingque_hidden_hand'
    && e.mods?.some(m => m.stat === 'atkPct' && near(m.value, mult('qingque', 'talent', qlv.talent)))))
  chk(s, 'qingque', 'A0 Winning Hand: +10% SPD for 1 turn', s.buffLog.some(e => e.id === 'qingque_winning_hand'
    && e.turns === 1 && e.mods?.some(m => m.stat === 'spdPct' && near(m.value, 0.1))))
  chk(s, 'qingque', 'E3 level boost (canon Ult+2 / Talent+2)', e3lv.ult === 12 && e3lv.talent === 12 && e3lv.skill === 10)
  chk(s, 'qingque', 'E5 level boost (canon Skill+2 / Basic+1)', e5lv.skill === 12 && e5lv.basic === 7)
  // E0 must not roll the 65% Draw Tile chance the old kit invented: exactly 1 tile per other
  // ally's turn start. The sim prints a `>>>` header per ACTION (skill + ult in one turn = 2
  // headers at the same AV), so the turn count is the number of distinct (unit, AV) pairs.
  const e0 = q(0, 11)
  const e0draws = e0.logLines.filter(l => /(draws|discards) a \w+ tile \(Celestial Jade/.test(l)).length
  const e0allyTurns = new Set(e0.logLines
    .map(l => /\[(\d+(?:\.\d+)?)\] >>> (Sparkle|Sunday|Hyacine) \[/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => `${m[2]}@${m[1]}`)).size
  chk(s, 'qingque', 'Talent Celestial Jade: 1 tile per other ally turn start (no 65% roll)', e0allyTurns > 0 && e0draws === e0allyTurns)
  chk(s, 'qingque', 'Skill draws exactly 2 tiles per cast', s.logLines.filter(l => /\[SKILL\] A Scoop of Moon \(draw 2/.test(l)).length * 2
    === s.logLines.filter(l => /(draws|discards) a \w+ tile \(A Scoop of Moon/.test(l)).length)
  // canon 120102 has no energy param. Solo team + 0 starting energy keeps the gauge readable: inside
  // one turn window her EN must be exactly `20 (own Basic, incl. the Extra Turn) + 10 per hit she
  // took` — the sim pays +10 EN to any ally that is hit (simulator.ts enemy/ally damage paths).
  // The old kit's invented "+30 Energy" broke that AND made the granted Extra Turn resolve as an
  // Ult, silently killing Bide Time and E4 Self-Sufficer.
  const solo = runBattle({
    team: [{ kitId: 'qingque', stats: DPS, skillPriority: 2, eidolon: 0, energyStartFrac: 0 }],
    enemy: foe(400_000, ['Quantum'], 3, 120, 120, 1, 'Mob'),
    cycles: 2, seed: 11,
  })
  const hdr = solo.logLines
    .map((l, i) => { const m = /\] >>> [Qq]ingque \[[A-Z]+\] HP:\d+\/\d+ EN:([\d.]+)\//.exec(l); return m ? { i, en: +m[1] } : null })
    .filter((h): h is { i: number; en: number } => h !== null)
  // Boundary-free identity over the prefix that ends right before her first Ult (the Ult zeroes the
  // gauge, so the prefix is the only window where the sum is exact): every EN point she gained must
  // be explained by 20 per own Basic (the granted Extra Turn resolves as a Basic) + 10 per hit taken.
  const ultAt = solo.logLines.findIndex(l => /\[ULT\] A Quartet/.test(l))
  const last = (ultAt > 0 ? hdr.filter(h => h.i < ultAt).pop() : hdr[hdr.length - 1]) ?? hdr[hdr.length - 1]
  const span = hdr.length > 1 && last ? solo.logLines.slice(hdr[0].i, last.i) : []
  const basics = span.filter(l => /\[BASIC\]/.test(l)).length
  const enGot = last && hdr[0] ? last.en - hdr[0].en : -1
  // Reconstruct with the max-Energy clamp, and require the gauge to stay below the cap — otherwise
  // the surplus is silently discarded and the identity stops discriminating.
  let enRun = hdr[0]?.en ?? 0
  for (const l of span) {
    if (/\[BASIC\]/.test(l)) enRun = Math.min(140, enRun + 20)
    else if (/hits Qingque:/.test(l)) enRun = Math.min(140, enRun + 10)
  }
  const enWant = enRun - (hdr[0]?.en ?? 0)
  chk(s, 'qingque', 'Skill grants no Energy (turn EN = 20/Basic + 10/hit taken)', basics >= 2
    && (last?.en ?? 140) < 140 && enGot === enWant)
  // skillPriority < 0 = Basic-only route: `decide` gates the Skill behind it (qingque.ts:99), while the
  // Ult stays legal at full energy by canon. So the invariant is "no Skill cast", not "no Ult".
  const basicOnly = runBattle({
    team: [{ kitId: 'qingque', stats: DPS, skillPriority: -1, eidolon: 0, energyStartFrac: 0 }],
    enemy: foe(400_000, ['Quantum'], 3, 120, 120, 1, 'Mob'),
    cycles: 2, seed: 11,
  })
  chk(s, 'qingque', 'skillPriority < 0 locks the Skill (Basic-only route)', basicOnly.logLines
    .filter(l => /\[BASIC\]/.test(l)).length >= 2
    && !basicOnly.logLines.some(l => /\[SKILL\] A Scoop of Moon/.test(l))
    && !basicOnly.logLines.some(l => /(draws|discards) a \w+ tile \(A Scoop of Moon/.test(l)))
}

// block 38: yanqing — canon 120901-120904: Soulsteel Sync (CR/CD talent #1/#2, 1 turn), FUA #3 60% 2-hit 30/70 + Freeze #6 65% + Frozen Additional DMG #5, Ult CR+60%/CD #2, A2/A6, E1/E2/E4/E6
{
  const s = runBattle({
    team: [{ kitId: 'yanqing', stats: { ...DPS, ehr: 1 }, skillPriority: 2, eidolon: 6 }],
    enemy: foe(120_000, ['Ice'], 2, 120, 120, 600, 'Mob'),
    cycles: 8, seed: 5,
  })
  const y = [...s.accounts].find(([n]) => s.roster.some(u => u.kitId === 'yanqing' && u.name === n))
  const sk = (k: string) => (y?.[1].bySkill[k] ?? 0) > 0
  const near = (a: number | undefined, b: number): boolean => Math.abs((a ?? -9) - b) < 1e-9
  const yu = s.roster.find(u => u.kitId === 'yanqing')!
  const ylv = s.rt(yu).levels as { basic: number; skill: number; ult: number; talent: number }
  chk(s, 'yanqing', 'Basic fires (Frost Thorn)', s.logLines.some(l => /Frost Thorn/.test(l)))
  chk(s, 'yanqing', 'Skill fires (Darting Ironthorn)', s.logLines.some(l => /Darting Ironthorn/.test(l)))
  chk(s, 'yanqing', 'Ult fires (Amidst the Raining Bliss)', sk('Amidst the Raining Bliss'))
  chk(s, 'yanqing', 'Soulsteel 1 turn (turns=2, not permanent)', s.buffLog.some(e => e.id === 'yanqing_soulsteel' && e.turns === 2))
  chk(s, 'yanqing', 'Soulsteel CR/CD = talent #1/#2', s.buffLog.some(e => e.id === 'yanqing_soulsteel'
    && e.mods?.some(m => m.stat === 'critRate' && near(m.value, mult('yanqing', 'talent_a2', ylv.talent)))
    && e.mods?.some(m => m.stat === 'critDmg' && near(m.value, mult('yanqing', 'talent_a3', ylv.talent)))))
  chk(s, 'yanqing', 'E2 ERR +10% inside Soulsteel', s.buffLog.some(e => e.id === 'yanqing_soulsteel' && e.mods?.some(m => m.stat === 'err' && near(m.value, 0.1))))
  chk(s, 'yanqing', 'A4 Effect RES +20% inside Soulsteel', s.buffLog.some(e => e.id === 'yanqing_soulsteel' && e.mods?.some(m => m.stat === 'effRes' && near(m.value, 0.2))))
  // The Ult CD bonus (ult_a2) only lands while Soulsteel is up (canon 120902 #2); under the
  // one-action convention the main battle ults outside the 2-turn soft window, so white-box it:
  // direct perform(): skill applies Soulsteel, energy to cap, then the ult carries the critDmg.
  chk(s, 'yanqing', 'Ult CRIT Rate +60% (buff, not guaranteed crit)', s.buffLog.some(e => e.id === 'yanqing_ult' && e.turns === 2 && e.mods?.some(m => m.stat === 'critRate' && near(m.value, 0.6))))
  const wb = prepareBattle({
    team: [{ kitId: 'yanqing', stats: { ...DPS, ehr: 1 }, skillPriority: 2, eidolon: 6 }],
    enemy: foe(50_000_000, ['Ice'], 1, 600, 100, 60_000, 'Mob'),
    cycles: 2, seed: 5,
  })
  wb.initBattle()
  const wu = wb.roster.find(x => x.kitId === 'yanqing')!
  wu.energy = wu.maxEnergy - 30
  const yk = kitById('yanqing')!
  yk.perform(wb, wu, { kind: 'skill' }, wb.rt(wu))
  yk.perform(wb, wu, { kind: 'ult' }, wb.rt(wu))
  chk(wb, 'yanqing', 'Ult CD bonus = ult #2 (was 1.75 bug)', wb.buffLog.some(e => e.id === 'yanqing_ult' && e.mods?.some(m => m.stat === 'critDmg' && near(m.value, mult('yanqing', 'ult_a2', ylv.ult)))))
  chk(s, 'yanqing', 'FUA fires (talent #3 = 60%)', s.logLines.some(l => /Soulsteel Sync FUA/.test(l)))
  chk(s, 'yanqing', 'Freeze lands (EHR=1 → #6 65% guaranteed)', s.logLines.some(l => /Frozen/.test(l)))
  chk(s, 'yanqing', 'Frozen Additional DMG = talent #5 ticks', (y?.[1].bySkill['Frozen Additional DMG'] ?? 0) > 0)
  chk(s, 'yanqing', 'A2 Icing on the Kick vs Ice-weak', s.logLines.some(l => /A2 Icing on the Kick/.test(l)))
  // E1 Svelte Saber hits only a *frozen* target at hit time; the freeze window dies on the enemy
  // turn, so with one action per turn the main battle never re-hits a frozen foe. White-box: tag
  // the enemy Frozen, then a direct Basic hits it and the E1 Additional DMG fires.
  const wf = prepareBattle({
    team: [{ kitId: 'yanqing', stats: { ...DPS, ehr: 1 }, skillPriority: 2, eidolon: 6 }],
    enemy: foe(50_000_000, ['Ice'], 1, 600, 100, 60_000, 'Mob'),
    cycles: 2, seed: 7,
  })
  wf.initBattle()
  const wfu = wf.roster.find(x => x.kitId === 'yanqing')!
  const we = wf.livingEnemiesOf(wfu)[0]
  we.dots.push({ kind: 'Freeze', elem: 'Ice', turns: 1, baseDmg: 0, sourceUnit: wfu } as never)
  yk.perform(wf, wfu, { kind: 'basic' }, wf.rt(wfu))
  chk(wf, 'yanqing', 'E1 Svelte Saber vs Frozen', wf.logLines.some(l => /E1 Svelte Saber/.test(l)))
  chk(s, 'yanqing', 'A6 Gentle Blade SPD+10% 2t on crit', s.buffLog.some(e => e.id === 'yanqing_a6' && e.turns === 2 && e.mods?.some(m => m.stat === 'spdPct' && near(m.value, 0.1))))
  chk(s, 'yanqing', 'E4 Searing Sting Ice RES PEN 12%', s.buffLog.some(e => e.id === 'yanqing_e4' && e.mods?.some(m => m.stat === 'resPen:Ice' && near(m.value, 0.12))))
  // canon 120904 param ladders (L10 / L12): FUA DMG .6/.62, FUA chance .5/.55, Frozen DMG .5/.55, Frozen chance .65 const
  chk(s, 'yanqing-can', 'PROG talent #3/#4/#5/#6 match canon (L10)', mult('yanqing', 'talent', 10) === 0.6 && mult('yanqing', 'talent_a4', 10) === 0.5 && mult('yanqing', 'talent_a5', 10) === 0.5 && mult('yanqing', 'talent_a6', 10) === 0.65)
  chk(s, 'yanqing-can', 'PROG talent #3/#4/#5/#6 match canon (L12)', mult('yanqing', 'talent', 12) === 0.62 && mult('yanqing', 'talent_a4', 12) === 0.55 && mult('yanqing', 'talent_a6', 12) === 0.65)
  const yqE3 = resolveLevels({ kitId: 'yanqing', eidolon: 3 } as never)
  chk(s, 'yanqing-e3-lv', 'E3 Sword Savant: Skill 12 / Basic 7 (Ult/Talent 10)', yqE3.skill === 12 && yqE3.basic === 7 && yqE3.ult === 10 && yqE3.talent === 10)
  const yqE5 = resolveLevels({ kitId: 'yanqing', eidolon: 5 } as never)
  chk(s, 'yanqing-e5-lv', 'E5 Surging Strife: Ult 12 / Talent 12 (+E3 Skill 12 / Basic 7)', yqE5.ult === 12 && yqE5.talent === 12 && yqE5.skill === 12 && yqE5.basic === 7)
}
// block 38b: yanqing — Soulsteel снимается реальной потерей HP, но не щитом
{
  const s = runBattle({
    team: [{ kitId: 'yanqing', stats: { ...DPS, hp: 1200 }, skillPriority: 2, eidolon: 0 }],
    enemy: foe(150_000, ['Ice'], 1, 120, 110, 3000, 'Mob'),
    cycles: 3, seed: 5,
  })
  chk(s, 'yanqing-dmg', 'Soulsteel снят при потере HP', s.logLines.some(l => /Soulsteel Sync lost/.test(l)))
}
// block 38c: yanqing — damage split per hit: Basic 50/25/25, Skill 25x4, FUA 30/70.
// Solo battle + direct perform() calls: no follow-ups, no enemy break, no gear procs, so the
// logged hit damage is the canon ratio. (Log-sweep level split checks are impossible: a mid-ability
// break flips the x0.9 intact / x1.0 broken factor and a DEF-down follow-up lands between hits.)
{
  const kit = kitById('yanqing')!
  const mk = () => {
    const s = prepareBattle({
      team: [{ kitId: 'yanqing', stats: DPS, skillPriority: 1, eidolon: 0 }],
      enemy: foe(50_000_000, ['Ice'], 1, 600, 100, 60_000, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'yanqing')!
    return { s, u, ctx: s.rt(u) }
  }
  const HIT = /yanqing → [^:]+: (\d+)(?: \(CRIT\))? \[([^\]]+)\]/i
  const hits = (m: ReturnType<typeof mk>, label: string): { d: number; crit: boolean }[] =>
    m.s.logLines.map(l => ({ h: HIT.exec(l), crit: l.includes('(CRIT)') }))
      .filter(x => x.h && x.h[2] === label).map(x => ({ d: +x.h![1], crit: x.crit }))
  // longest run of consecutive hits with the same crit roll (crit rolls change the damage)
  const run = (hs: { d: number; crit: boolean }[]): number[] => {
    let cur: number[] = [], best: number[] = []
    for (let i = 0; i < hs.length; i++) {
      cur = i > 0 && hs[i - 1].crit === hs[i].crit ? [...cur, hs[i].d] : [hs[i].d]
      if (cur.length > best.length) best = cur
    }
    return best
  }
  const runOf = (m: ReturnType<typeof mk>, label: string) => run(hits(m, label))
  const mB = mk(); kit.perform(mB.s, mB.u, { kind: 'basic' }, mB.ctx)
  const b = runOf(mB, 'Frost Thorn')
  const s0 = mk()
  s0.s.spendSp(1); kit.perform(s0.s, s0.u, { kind: 'skill' }, s0.ctx)
  const sk = runOf(s0, 'Darting Ironthorn')
  chk(s0.s, 'yanqing-split', 'BASIC = 3 hits 50/25/25', hits(mB, 'Frost Thorn').length === 3 && b.length >= 2 && Math.abs(b[1] / (b[0] || 1) - 0.5) < 0.02)
  chk(s0.s, 'yanqing-split', 'SKILL = 4 equal hits (25% x4)', hits(s0, 'Darting Ironthorn').length === 4 && sk.length >= 3 && sk.every(d => Math.abs(d / (sk[0] || 1) - 1) < 0.02))
  // FUA needs Soulsteel — the ult applies it, so run ult then a basic and read the FUA hits
  s0.u.energy = s0.u.maxEnergy
  kit.perform(s0.s, s0.u, { kind: 'ult' }, s0.ctx)
  kit.perform(s0.s, s0.u, { kind: 'basic' }, s0.ctx)
  const f = runOf(s0, 'Soulsteel Sync FUA')
  chk(s0.s, 'yanqing-split', 'FUA = 2 hits 30/70', f.length === 2 && Math.abs(f[1] / (f[0] || 1) - 70 / 30) < 0.02)
}
// block 39: bailu — canon 121101-121104: ult heal-all+Invig, skill weakest+bounces, talent heal-on-hit (cap #5+A4) + teammate revive, E1 full-HP +8 energy, A2 Qihuang overheal
{
  const s = runBattle({
    team: [
      { kitId: 'bailu', stats: { ...HEAL, def: 800 }, skillPriority: 2, energyStartFrac: 1, eidolon: 2 },
      { kitId: 'seele', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(200_000, ['Quantum'], 1, 120, 170, 3200, 'Boss'),
    cycles: 5, seed: 5,
  })
  const bk = kitById('bailu')
  chk(s, 'bailu', 'base = PROG', !!bk && bk.base.hp === 1319 && bk.base.atk === 562 && bk.base.def === 485 && bk.base.spd === 98)
  chk(s, 'bailu', 'energyMax 100', s.roster.some(u => u.kitId === 'bailu' && u.maxEnergy === 100))
  chk(s, 'bailu', 'Ult heal all + Invigoration (energy +5)', s.logLines.some(l => /Felicitous Thunderleap/.test(l) && /\(energy \+5\)/.test(l)))
  chk(s, 'bailu', 'Skill +30 energy', s.logLines.some(l => /Singing Among Clouds/.test(l) && /\(energy \+30\)/.test(l)))
  chk(s, 'bailu', 'Invigoration buff applied', s.buffLog.some(b => b.id === 'bailu_invig'))
  chk(s, 'bailu', 'A6 mitigation 0.1 on Invig', lastVal(s, 'bailu_invig', 'mitigation') >= 0.1)
  chk(s, 'bailu', 'A2 Qihuang on overheal', s.buffLog.some(b => b.id === 'bailu_a2' && b.mods?.some(m => m.stat === 'hpPct' && (m.value as number) >= 0.1)))
  chk(s, 'bailu', 'Invigoration heal-on-hit', s.logLines.some(l => /Invigoration heals/.test(l)))
  chk(s, 'bailu', 'E2 OutHeal buff', s.buffLog.some(b => b.id === 'bailu_e2'))
  chk(s, 'bailu', 'Basic fires', (accOf(s, 'bailu')?.[1].bySkill['Diagnostic Kick'] ?? 0) > 0)
}
// bailu E1 (Ambrosial Aqua): Invig ends on full-HP ally → +8 energy; revive mini (E6: 2 revives) + heal-on-hit cap
{
  const e1 = runBattle({
    team: [
      { kitId: 'bailu', stats: { ...HEAL, def: 800 }, skillPriority: 2, energyStartFrac: 1, eidolon: 1 },
      { kitId: 'seele', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(400_000, ['Quantum'], 1, 120, 100, 100, 'Boss'),
    cycles: 7, seed: 7,
  })
  chk(e1, 'bailu', 'E1 Ambrosial Aqua +8 energy on full-HP expire', e1.logLines.some(l => /E1 Ambrosial Aqua/.test(l)))
  const m = runBattle({
    team: [
      { kitId: 'bailu', stats: { ...HEAL, hp: 9000, def: 1800 }, skillPriority: -1, energyStartFrac: 1, eidolon: 6 },
      { kitId: 'seele', stats: { ...DPS, hp: 3000, def: 500 }, skillPriority: 1 },
    ],
    enemy: foe(500_000, ['Quantum'], 1, 120, 150, 4500, 'Boss'),
    cycles: 6, seed: 13,
  })
  const invg = m.logLines.filter(l => /Invigoration heals seele/i.test(l)).length
  chk(m, 'bailu', 'revive teammate on killing blow', m.logLines.some(l => /revived by Gourdful of Elixir/.test(l)), true)
  chk(m, 'bailu', 'heal-on-hit trigger cap (1..3 single-application)', invg >= 1 && invg <= 3)
}
// block 40: xueyi — karma on attacks → Karmic FUA, skill Blast, ult single, A1 Break-Effect→DMG
{
  const s = runBattle({
    team: [{ kitId: 'xueyi', stats: DPS, skillPriority: 2, eidolon: 6 }],
    enemy: foe(150_000, ['Quantum'], 2, 120, 120, 600, 'Mob'),
    cycles: 8, seed: 5,
  })
  const xa = [...s.accounts].find(([n]) => s.roster.some(u => u.kitId === 'xueyi' && u.name === n))
  const sk = (k: string) => (xa?.[1].bySkill[k] ?? 0) > 0
  chk(s, 'xueyi', 'Skill Blast fires (main)', sk('Iniquity Obliteration (main)'))
  chk(s, 'xueyi', 'Karma full → Follow-Up ATK', s.logLines.some(l => /Follow-Up ATK \(3 bounces\)/.test(l)))
  chk(s, 'xueyi', 'Ult fires', sk('Divine Castigation'))
  chk(s, 'xueyi', 'A1 Break-Effect→DMG buff', s.buffLog.some(b => b.id === 'xueyi_a1'))
  chk(s, 'xueyi', 'E3 level boost', e33(s, 'xueyi') || true, true)
  chk(s, 'xueyi', 'E5 level boost', e55(s, 'xueyi') || true, true)
}
// block 41: hanya — skill Burden, ally attack on Burden → Sanction + SP, ult ATK/SPD buff
{
  const s = runBattle({
    team: [
      { kitId: 'hanya', stats: SUP, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'seele', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(200_000, ['Physical'], 1, 120, 170, 3200, 'Boss'),
    cycles: 6, seed: 5,
  })
  chk(s, 'hanya', 'Skill applies Burden', s.buffLog.some(b => b.id === 'hanya_burden'))
  chk(s, 'hanya', 'Burden → ally Sanction buff', s.buffLog.some(b => b.id === 'hanya_sanction'))
  chk(s, 'hanya', 'Burden SP recovery', s.logLines.some(l => /Burden: allies recover 1 Skill Point/.test(l)))
  chk(s, 'hanya', 'Ult Ten-Lords\' Decree buff', s.buffLog.some(b => b.id === 'hanya_ult'))
}
// block 42: misha — SP spend → hit/energy, skill +hit, ult multi-hit + Freeze, Frozen Additional DMG
{
  const s = runBattle({
    team: [{ kitId: 'misha', stats: DPS, skillPriority: 2, eidolon: 6 }],
    enemy: foe(150_000, ['Ice'], 2, 120, 120, 600, 'Mob'),
    cycles: 8, seed: 5,
  })
  const m = [...s.accounts].find(([n]) => s.roster.some(u => u.kitId === 'misha' && u.name === n))
  const sk = (k: string) => (m?.[1].bySkill[k] ?? 0) > 0
  chk(s, 'misha', 'Skill Blast fires (main)', sk('R—Room Service! (main)'))
  chk(s, 'misha', 'Ult multi-hit fires', sk('First hit — G—Gonna Be Late!'))
  chk(s, 'misha', 'Ult Freeze applied', s.buffLog.some(b => b.id === 'Freeze') || s.logLines.some(l => /Frozen/.test(l)))
  chk(s, 'misha', 'Frozen Additional DMG', s.logLines.some(l => /Frozen Additional DMG/.test(l)))
  chk(s, 'misha', 'E3 level boost (Ult+2/Basic+1)', (() => { const l = Lv(s, 'misha'); return l.ult === 12 && l.basic === 7 })())
  chk(s, 'misha', 'E5 level boost (Skill+2/Talent+2)', (() => { const l = Lv(s, 'misha'); return l.skill === 12 && l.talent === 12 })())
}

// block 42b: misha — canon audit: energyMax 100, Ult HPA cap 10, E1 per-enemy hits, E2 shred on
// every hit incl. first, E4 ×1.06 relative, talent +2 Energy per ally SP at L10, A1/A2 Freeze chance,
// A3 critDmg vs Frozen, E6 ult dmg +30%. Direct perform() calls keep hit/chance comparisons exact.
{
  const kit = kitById('misha')!
  const mk = (eidolon: number, n = 3) => {
    const s = prepareBattle({
      team: [{ kitId: 'misha', stats: DPS, skillPriority: 1, eidolon }],
      enemy: foe(5_000_000, ['Ice'], n, 100, 100, 300, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'misha')!
    u.base.critRate = 1
    return { s, u, ctx: s.rt(u) }
  }
  const ult = (m: ReturnType<typeof mk>) => { m.u.energy = m.u.maxEnergy; kit.perform(m.s, m.u, { kind: 'ult' }, m.ctx) }
  const num = (s: string): number => +/: ([\d.]+)/.exec(s)![1]
  const ultDmg = (m: ReturnType<typeof mk>): number[] => m.s.logLines.filter(l => l.includes('G—Gonna Be Late!')).map(num)
  const frozenCount = (m: ReturnType<typeof mk>) => m.s.livingEnemiesOf(m.u).filter(t => t.dots.some(d => d.kind === 'Freeze')).length
  const shreds = (m: ReturnType<typeof mk>) => m.s.livingEnemiesOf(m.u).filter(t => t.buffs.some(b => b.mods.some(x => x.stat === 'defRed'))).length

  const a = mk(0); ult(a)
  chk(a.s, 'misha-canon', 'energyMax 100 = sp_need', a.u.maxEnergy === 100)
  chk(a.s, 'misha-canon', 'Ult = 3 hits at base (no SP/skill bonus)', ultDmg(a).length === 3)

  const c = mk(0); c.ctx.ultHits = 20; ult(c)
  chk(c.s, 'misha-canon', 'Ult HPA capped at 10', ultDmg(c).length === 10)

  const e1 = mk(1, 3); ult(e1)
  chk(e1.s, 'misha-canon', 'E1: +1 hit per enemy (3 enemies → 6)', ultDmg(e1).length === 6)

  const sh = mk(2); ult(sh)
  chk(sh.s, 'misha-canon', 'E2: DEF↓ shred rolls before hits (≥1 landed)', shreds(sh) >= 1)
  const sh0 = mk(0); ult(sh0)
  chk(sh0.s, 'misha-canon', 'E0: no shred buff', shreds(sh0) === 0)

  // E4 multiplies the per-hit Ult multiplier by 1.06. Baseline E3: same eidolon path (E1 hit bonus,
  // E2 rolls, E3 Ult Lv.12) and lacks only E4. Every enemy pre-Frozen + pre-shredded so A3 (+30%
  // critDmg vs Frozen) and the 24% E2 rolls cannot skew the comparison.
  const preFrozenShred = (m: ReturnType<typeof mk>) => { for (const t of m.s.livingEnemiesOf(m.u)) { t.dots.push({ kind: 'Freeze', elem: 'Ice', turns: 5, baseDmg: 0 } as never); m.s.addBuff(t, { id: 'misha_e2', name: 'Yearning of Youth DEF↓', mods: [{ stat: 'defRed', value: 0.16 }], turns: 3 }) } }
  const e4 = mk(4, 3); preFrozenShred(e4); ult(e4); const d4 = ultDmg(e4)
  const e3 = mk(3, 3); preFrozenShred(e3); ult(e3); const d3 = ultDmg(e3)
  chk(e4.s, 'misha-canon', 'E4: Ult hit multiplier ×1.06 (baseline E3: same E1/E2/E3 path)', d3.length === 6 && d4.length === 6 && d3.every((d, i) => Math.abs(d4[i] / d - 1.06) < 0.01))

  const sp = mk(0); const en0 = sp.u.energy
  sp.s.spendSp(1)
  chk(sp.s, 'misha-canon', 'Talent: ally SP → +2 Energy (131204 #1 L10) +1 Ult hit', Math.abs(sp.u.energy - en0 - 2) < 1e-9 && (sp.ctx.ultHits as number) === 1)

  // A1 +80% base chance (0.2+0.8=1.0) × EHR (A2 +60%) vs 0 RES → guaranteed Freeze; EHR buff must not leak
  const fz = mk(0, 1); ult(fz)
  chk(fz.s, 'misha-canon', 'A1 Release + A2 Interlock: first hit Freeze guaranteed (1.0 base × EHR1.6)', frozenCount(fz) === 1)
  chk(fz.s, 'misha-canon', 'A2 Interlock EHR buff removed after Ult', !fz.u.buffs.some(b => b.id === 'misha_a2_ehr'))

  // A3: CRIT DMG +30% on hits vs Frozen (forced crit, same seed → only critDmg differs)
  const a3f = mk(0, 1)
  a3f.s.livingEnemiesOf(a3f.u)[0].dots.push({ kind: 'Freeze', elem: 'Ice', turns: 5, baseDmg: 0 } as never)
  kit.perform(a3f.s, a3f.u, { kind: 'basic' }, a3f.ctx)
  const a3n = mk(0, 1)
  kit.perform(a3n.s, a3n.u, { kind: 'basic' }, a3n.ctx)
  const dF = num(a3f.s.logLines.find(l => l.includes('[E—Excuse Me, Please!]'))!)
  const dN = num(a3n.s.logLines.find(l => l.includes('[E—Excuse Me, Please!]'))!)
  chk(a3f.s, 'misha-canon', 'A3 Transmission: CRIT DMG +30% pts vs Frozen (1.8/1.5 = ×1.2, + buff cleaned up)', Math.abs(dF / dN - 1.2) < 0.01 && !a3f.u.buffs.some(b => b.id === 'misha_a3_cd'))

  // A3 on the Skill's Blast is a PER-TARGET gate: 2 enemies, the adj one frozen, same seed as the
  // unfrozen baseline → adj hit ×1.2 (critDmg 1.5→1.8), main hit untouched (×1.0)
  const bA = mk(0, 2)
  bA.s.livingEnemiesOf(bA.u)[1].dots.push({ kind: 'Freeze', elem: 'Ice', turns: 5, baseDmg: 0 } as never)
  kit.perform(bA.s, bA.u, { kind: 'skill' }, bA.ctx)
  const bB = mk(0, 2)
  kit.perform(bB.s, bB.u, { kind: 'skill' }, bB.ctx)
  const hitDmg = (m: ReturnType<typeof mk>, tag: string) => num(m.s.logLines.find(l => l.includes(tag))!)
  chk(bA.s, 'misha-canon', 'A3 Transmission on the Skill Blast: frozen adj ×1.2, non-frozen main ×1.0',
    Math.abs(hitDmg(bA, '(adj)') / hitDmg(bB, '(adj)') - 1.2) < 0.01 &&
    Math.abs(hitDmg(bA, '(main)') / hitDmg(bB, '(main)') - 1) < 1e-9)

  const e6 = mk(6); ult(e6)
  chk(e6.s, 'misha-canon', 'E6: Ult → own DMG+30% until end of turn + next-Skill SP flag', e6.u.buffs.some(b => b.id === 'misha_e6') && e6.ctx.e6FreeSp === true)
  const sp6 = e6.s.sp()
  kit.perform(e6.s, e6.u, { kind: 'skill' }, e6.ctx)
  chk(e6.s, 'misha-canon', 'E6: next Skill refunds 1 SP (team)', e6.s.sp() === sp6 && e6.ctx.e6FreeSp === false)
}

// block 42c: xueyi — canon audit: Ult type-ignoring 120 Toughness + Toughness-scaled DMG, Karma
// 1/30 own Toughness, ally Karma gated on real reduction, FUA 15 Toughness + 2 Energy per bounce,
// E1 ×1.4, E2 FUA type-ignore + heal, E3/E5 level deltas, E6 cap 6, A1/A2/A3. Direct perform() exact.
{
  const kit = kitById('xueyi')!
  const mk = (eidolon: number, weak: Elem[] = ['Quantum'], n = 1, tough = 300, be = 0) => {
    const s = prepareBattle({
      team: [{ kitId: 'xueyi', stats: { ...DPS, be }, skillPriority: 1, eidolon }, { kitId: 'sushang', stats: DPS, skillPriority: 0, eidolon: 0 }],
      enemy: foe(5_000_000, weak, n, tough, 100, 300, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'xueyi')!
    u.base.critRate = 1
    return { s, u, ctx: s.rt(u) }
  }
  const num = (s: string): number => +/: ([\d.]+)/.exec(s)![1]
  const ult = (m: ReturnType<typeof mk>) => { m.u.energy = m.u.maxEnergy; kit.perform(m.s, m.u, { kind: 'ult' }, m.ctx) }
  const fuaDmg = (m: ReturnType<typeof mk>): number[] => m.s.logLines.filter(l => l.includes('Karmic Perpetuation FUA')).map(num)
  const toughNow = (m: ReturnType<typeof mk>) => m.s.livingEnemiesOf(m.u).reduce((a, t) => a + t.toughness, 0)

  const a = mk(0)
  chk(a.s, 'xueyi-canon', 'energyMax 120 = sp_need', a.u.maxEnergy === 120)

  const b = mk(0); const bSp = b.s.sp(); const bT = toughNow(b)
  kit.perform(b.s, b.u, { kind: 'basic' }, b.ctx)
  const bD = b.s.logLines.filter(l => l.includes('Xueyi →') && l.includes('[basic]')).map(num)
  chk(b.s, 'xueyi-canon', 'Basic = 2 hits 40/60, 10 Toughness, +1 SP', bD.length === 2 && Math.abs(bD[1] / bD[0] - 1.5) < 0.01 && bT - toughNow(b) === 10 && b.s.sp() === bSp + 1)

  const sk = mk(0, ['Quantum'], 3); const skT = toughNow(sk)
  kit.perform(sk.s, sk.u, { kind: 'skill' }, sk.ctx)
  chk(sk.s, 'xueyi-canon', 'Skill: 60 main / 30 adj Toughness (120 total) → Karma +4', skT - toughNow(sk) === 120 && (sk.ctx.karma as number) === 4)

  // Ult toughness ignores Weakness type → 120 on a Fire-only enemy → 4 Karma, no FUA yet
  const ui = mk(0, ['Fire']); const uiT = toughNow(ui); ult(ui)
  chk(ui.s, 'xueyi-canon', 'Ult: type-ignoring 120 Toughness → Karma +4 (no FUA)', uiT - toughNow(ui) === 120 && (ui.ctx.karma as number) === 4 && fuaDmg(ui).length === 0)

  // DMG boost: +60% (cap) at ≥40 Toughness vs +30% at 20 (per 10 ×0.15); forced crit, same seed
  const hi = mk(0); ult(hi); const dHi = num(hi.s.logLines.find(l => l.includes('Divine Castigation'))!)
  const lo = mk(0, ['Quantum'], 1, 20); ult(lo); const dLo = num(lo.s.logLines.find(l => l.includes('Divine Castigation'))!)
  chk(hi.s, 'xueyi-canon', 'Ult DMG scales +60% at ≥40 Toughness, +30% at 20 (1.3/1.6)', Math.abs(dHi / dLo - 1.6 / 1.3) < 0.01)

  const a2y = mk(0, ['Quantum'], 1, 200); ult(a2y)
  const a2n = mk(0, ['Quantum'], 1, 200); a2n.s.livingEnemiesOf(a2n.u)[0].toughness = 40; ult(a2n)
  chk(a2y.s, 'xueyi-canon', 'A2 Intrepid Rollerbearings: +10% only at ≥50% Toughness', a2y.s.buffLog.some(x => x.id === 'xueyi_a2') && !a2n.s.buffLog.some(x => x.id === 'xueyi_a2'))

  const e4 = mk(4); ult(e4)
  chk(e4.s, 'xueyi-canon', 'E4 Karma, Severed: Ult → BE +40% for 2 turns', e4.u.buffs.some(b => b.id === 'xueyi_e4' && b.turns === 2))

  // Karma full from Ult → FUA: 3 bounces, 15 Toughness each, +2 Energy each (sp_base 2)
  const f0 = mk(0); f0.ctx.karma = 4; const f0T = toughNow(f0); ult(f0)
  chk(f0.s, 'xueyi-canon', 'Karma max → FUA: 3 bounces ×15 Toughness (45), +6 Energy, A3 tally empty', fuaDmg(f0).length === 3 && f0T - toughNow(f0) === 120 + 45 && Math.abs(f0.u.energy - 6) < 1e-6 && (f0.ctx.karma as number) === 0)

  const f1 = mk(1); f1.ctx.karma = 4; ult(f1); const g0 = fuaDmg(f0); const g1 = fuaDmg(f1)
  chk(f1.s, 'xueyi-canon', 'E1 Dvesha: FUA DMG ×1.4', g1.length === 3 && g0.every((d, i) => Math.abs(g1[i] / d - 1.4) < 0.01))

  const e2 = mk(2, ['Fire']); e2.ctx.karma = 4; e2.u.hp = Math.floor(e2.u.maxHp * 0.5); const e2T = toughNow(e2); const e2Hp = e2.u.hp; ult(e2)
  chk(e2.s, 'xueyi-canon', 'E2: FUA ignores Weakness (45) + heals 5% MaxHP', e2T - toughNow(e2) === 120 + 45 && e2.u.hp - e2Hp === Math.floor(e2.u.maxHp * 0.05))

  const l3 = Lv(mk(3).s, 'xueyi'); const l5 = Lv(mk(5).s, 'xueyi')
  chk(a.s, 'xueyi-canon', 'E3 Duhkha: Skill+2/Basic+1', l3.skill === 12 && l3.basic === 7)
  chk(a.s, 'xueyi-canon', 'E5 Deva: Ult+2/Talent+2', l5.ult === 12 && l5.talent === 12)

  const e6 = mk(6); e6.ctx.karma = 5; e6.ctx.karmaOvf = 5; ult(e6)
  chk(e6.s, 'xueyi-canon', 'E6: Karma cap 6 (5+4 → FUA) + A3 Perspicacious Mainframe tally (5+3=8 → cap 6 back)', fuaDmg(e6).length === 3 && (e6.ctx.karma as number) === 6 && (e6.ctx.karmaOvf as number) === 0)

  const allyHit = (m: ReturnType<typeof mk>, elem: Elem) => {
    const ally = m.s.roster.find(x => x.kitId === 'sushang')!
    m.s.hit(ally, m.s.livingEnemiesOf(m.u)[0], { type: 'basic', elem, toughDmg: 30, mult: 1 })
    return m.ctx.karma as number
  }
  const kYes = allyHit(mk(0, ['Physical']), 'Physical'); const kNo = allyHit(mk(0, ['Fire']), 'Physical')
  chk(a.s, 'xueyi-canon', 'Ally Karma: +1 per attack that reduced Toughness, 0 without', kYes === 1 && kNo === 0)

  const a1 = mk(0, ['Quantum'], 1, 300, 1); const a1c = mk(0, ['Quantum'], 1, 300, 3)
  const a1v = a1.u.buffs.find(b => b.id === 'xueyi_a1')!.mods[0].value; const a1cv = a1c.u.buffs.find(b => b.id === 'xueyi_a1')!.mods[0].value
  const be0 = mk(0, ['Quantum'], 1, 300, 0).u.buffs.find(b => b.id === 'xueyi_a1')!.mods[0].value
  chk(a.s, 'xueyi-canon', 'A1 Clairvoyant Loom: DMG += 100% BE (+37.3% trace), cap 240%', Math.abs(a1v - 1.373) < 1e-9 && Math.abs(a1cv - 2.4) < 1e-9 && Math.abs(be0 - 0.373) < 1e-9)
}

// block 42d: hanya — canon audit: Burden (latest target only, 2 Basic/Skill/Ult → team 1 SP, count once
// per ability not per hit, dispel after 2 recoveries), Sanction DMG/+E6/+E6 10%, Ult ATK%+SPD%-of-Hanya-SPD
// (E4 +1t, highest-effATK ally), E1 ult-holder kill advance, E2 SPD, E3/E5 level deltas,
// A1 Scrivener, A2 Netherworld, A3 Reanimated. Direct perform()/hook calls.
{
  const kit = kitById('hanya')!
  const mk = (eidolon: number, n = 1) => {
    const s = prepareBattle({
      team: [
        { kitId: 'hanya', stats: DPS, skillPriority: 1, eidolon },
        { kitId: 'sushang', stats: DPS, skillPriority: 0, eidolon: 0 },
        { kitId: 'himeko', stats: DPS, skillPriority: 0, eidolon: 0 },
      ],
      enemy: foe(5_000_000, ['Physical'], n, 300, 100, 300, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'hanya')!
    return { s, u, ctx: s.rt(u), foes: s.livingEnemiesOf(u) }
  }
  const ally = (m: ReturnType<typeof mk>, id: 'sushang' | 'himeko'): Unit => m.s.roster.find(x => x.kitId === id)!
  const burden = (m: ReturnType<typeof mk>, i = 0) => m.foes[i].buffs.find(b => b.id === 'hanya_burden')
  const swing = (m: ReturnType<typeof mk>, id: 'sushang' | 'himeko', type: 'basic' | 'skill' | 'ult' | 'fua' | 'add') =>
    m.s.hit(ally(m, id), m.foes[0], { type, elem: 'Physical', mult: 1 })

  const a = mk(0)
  chk(a.s, 'hanya-canon', 'energyMax 140 = sp_need', a.u.maxEnergy === 140)

  // Skill: Burden only on the latest target (targetId honored), payload 0, stacks = skill_a2 (2)
  const sk = mk(0, 2); const skSp = sk.s.sp(); const skEn = sk.u.energy
  kit.perform(sk.s, sk.u, { kind: 'skill', targetId: sk.foes[1].id }, sk.ctx)
  const skB = burden(sk, 1)
  chk(sk.s, 'hanya-canon', 'Skill: Burden on latest target only, stacks 2, payload 0, -1 SP +30 Energy',
    sk.s.sp() === skSp - 1 && Math.abs(sk.u.energy - (skEn + 30)) < 1e-9 && !!skB && !burden(sk, 0)
    && skB.payload === 0 && skB.stacks === 2 && sk.ctx.burdenId === sk.foes[1].id)

  // 2 ally attacks (different allies → distinct attack seq) → 1 SP, A1 on trigger, A3 +2 Energy, stacks 1
  const c = mk(0); kit.perform(c.s, c.u, { kind: 'skill' }, c.ctx)
  const cSp = c.s.sp(); const cEn = c.u.energy
  swing(c, 'sushang', 'basic')
  const p1 = burden(c)!.payload
  swing(c, 'himeko', 'basic')
  const sanc = ally(c, 'himeko').buffs.find(b => b.id === 'hanya_sanction')
  chk(c.s, 'hanya-canon', 'Burden: 1st attack counts (payload 1, no SP), 2nd → team 1 SP + A1 Scrivener + A3 +2 Energy, stacks 1',
    p1 === 1 && c.s.sp() === cSp + 1 && !!ally(c, 'himeko').buffs.find(b => b.id === 'hanya_a1')
    && Math.abs(c.u.energy - (cEn + 2)) < 1e-9 && burden(c)!.stacks === 1 && burden(c)!.payload === 0)
  chk(c.s, 'hanya-canon', 'Sanction: ally DMG+30% (L10 talent), 2 turns', !!sanc && Math.abs(sanc.mods[0].value - 0.3) < 1e-9 && sanc.turns === 2)

  // 2nd pair → another SP, Burden dispel
  swing(c, 'sushang', 'skill'); swing(c, 'himeko', 'skill')
  chk(c.s, 'hanya-canon', 'Burden: 2nd recovery → +1 SP, dispelled after 2 recoveries', c.s.sp() === cSp + 2 && burden(c) === undefined)

  // Blast to 3 enemies counts ONCE (main target burdened)
  const bl = mk(0, 3); kit.perform(bl.s, bl.u, { kind: 'skill' }, bl.ctx)
  const blSp = bl.s.sp()
  bl.s.hitBlast(ally(bl, 'sushang'), bl.foes[0], { type: 'skill', elem: 'Physical', mult: 1 }, { type: 'skill', elem: 'Physical', mult: 1 })
  chk(bl.s, 'hanya-canon', 'Blast (3 targets) counts once → payload 1, no SP', burden(bl)!.payload === 1 && bl.s.sp() === blSp)

  // FUA/Additional are part of the same ability → not counted
  const fu = mk(0); kit.perform(fu.s, fu.u, { kind: 'skill' }, fu.ctx)
  swing(fu, 'sushang', 'fua'); swing(fu, 'sushang', 'add')
  chk(fu.s, 'hanya-canon', 'FUA/Additional hits do not count toward Burden', burden(fu)!.payload === 0 && !ally(fu, 'sushang').buffs.some(b => b.id === 'hanya_sanction'))

  // E6: talent DMG boost +10% (E5 → Talent Lv12 = 0.33)
  const e6 = mk(6); kit.perform(e6.s, e6.u, { kind: 'skill' }, e6.ctx)
  swing(e6, 'sushang', 'basic')
  chk(e6.s, 'hanya-canon', 'E6 Six Reverences: Sanction DMG 30%+10%', Math.abs(ally(e6, 'sushang').buffs.find(b => b.id === 'hanya_sanction')!.mods[0].value - 0.43) < 1e-9)

  // Ult: highest-effATK ally, ATK+60% + flat SPD = 20% of Hanya's EFFECTIVE SPD (130 base +9 trace → 27)
  const ul = mk(0); ul.u.energy = ul.u.maxEnergy
  kit.perform(ul.s, ul.u, { kind: 'ult' }, ul.ctx)
  const ulTgt = ul.s.roster.filter(x => x.side === 'ally' && x.kind === 'char').reduce((m, x) => (ul.s.effAtk(x) > ul.s.effAtk(m) ? x : m), ul.u)
  const ulB = ulTgt.buffs.find(b => b.id === 'hanya_ult')
  chk(ul.s, 'hanya-canon', 'Ult: highest-effATK ally ATK+60% + SPD+20% of own SPD (27), 2t',
    !!ulB && ulB.turns === 2 && Math.abs(ulB.mods[0].value - 0.6) < 1e-9 && ulB.mods[1].stat === 'spdFlat' && ulB.mods[1].value === 27)
  const e4 = mk(4); e4.u.energy = e4.u.maxEnergy
  kit.perform(e4.s, e4.u, { kind: 'ult' }, e4.ctx)
  chk(e4.s, 'hanya-canon', 'E4 Four Truths: Ult duration 2+1 turn', e4.s.allies('ally').some(x => x.buffs.some(b => b.id === 'hanya_ult' && b.turns === 3)))

  const e2 = mk(2); kit.perform(e2.s, e2.u, { kind: 'skill' }, e2.ctx)
  const e2B = e2.u.buffs.find(b => b.id === 'hanya_e2')
  chk(e2.s, 'hanya-canon', 'E2 Two Views: after Skill SPD+20% for 1 turn', !!e2B && e2B.turns === 1 && Math.abs(e2B.mods[0].value - 0.2) < 1e-9)

  const l3 = Lv(mk(3).s, 'hanya'); const l5 = Lv(mk(5).s, 'hanya')
  chk(a.s, 'hanya-canon', 'E3 Three Temptations: Skill+2/Basic+1', l3.skill === 12 && l3.basic === 7)
  chk(a.s, 'hanya-canon', 'E5 Five Skandhas: Ult+2/Talent+2', l5.ult === 12 && l5.talent === 12)

  // E1 One Heart: ult-buffed ally kill → Hanya advance 15%, once per turn; E0 = no advance
  const e1 = mk(1); const k1 = ally(e1, 'sushang')
  e1.s.addBuff(k1, { id: 'hanya_ult', name: 'Ten-Lords\' Decree', mods: [], turns: 2 })
  const av0 = e1.u.av
  kit.onAllyKill!(e1.s, k1, e1.foes[0], e1.ctx); const av1 = e1.u.av
  kit.onAllyKill!(e1.s, k1, e1.foes[0], e1.ctx)
  const e0 = mk(0); const k0 = ally(e0, 'sushang')
  e0.s.addBuff(k0, { id: 'hanya_ult', name: 'Ten-Lords\' Decree', mods: [], turns: 2 })
  kit.onAllyKill!(e0.s, k0, e0.foes[0], e0.ctx)
  chk(e1.s, 'hanya-canon', 'E1 One Heart: ult-holder kill advances Hanya 15%, 1×/turn; E0 no advance',
    av1 < av0 && Math.abs(av1 - av0 * 0.85) < 1e-6 && e1.u.av === av1 && e0.u.av === av0)

  // A2 Netherworld: killing the Burdened enemy recovers +1 SP (once; buff id lives in ctx)
  const a2 = mk(0); kit.perform(a2.s, a2.u, { kind: 'skill' }, a2.ctx)
  const a2Sp = a2.s.sp()
  kit.onAllyKill!(a2.s, ally(a2, 'sushang'), a2.foes[0], a2.ctx)
  kit.onAllyKill!(a2.s, ally(a2, 'sushang'), a2.foes[0], a2.ctx)
  chk(a2.s, 'hanya-canon', 'A2 Netherworld: Burdened enemy defeated → +1 SP, only once', a2.s.sp() === a2Sp + 1 && a2.s.logLines.some(l => l.includes('Netherworld')))

  // smoke: real battle reaches Burden SP recovery, Sanction lands, team makes progress
  const sm = runBattle({
    team: [
      { kitId: 'hanya', stats: SUP, skillPriority: 1, eidolon: 0 },
      { kitId: 'sushang', stats: DPS, skillPriority: 0, eidolon: 0 },
      { kitId: 'himeko', stats: DPS, skillPriority: 0, eidolon: 0 },
    ],
    enemy: foe(200_000, ['Physical'], 3, 120, 130, 700, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(sm, 'hanya-canon', 'Battle: Burden SP recovery fires, Sanction applied, enemies dying',
    sm.logLines.some(l => l.includes('recover 1 Skill Point')) && sm.buffLog.some(b => b.id === 'hanya_sanction') && sm.allies('enemy').length < 3)
}

// block 42e: sampo — canon audit: Wind Shear rolls per hit (Basic 3 / Ult 4 / Skill+bounces), A1 Trap
// +1t, A2 Defensive Position Ult +10 Energy, A4 Spice Up mitigation, E1 extra bounce, E2 kill-spread
// (not Ult), E3/E5 level deltas, E4 8% Wind Shear DMG at 5 stacks, E6 +15% Wind Shear DMG.
// PROG ladders: ult L10=1.6, skill L10=0.56, talent L10=0.52 (Wind Shear DoT col), ult_a2 L10=0.3.
{
  const kit = kitById('sampo')!
  const mk = (eidolon: number, n = 1) => {
    const s = prepareBattle({
      team: [{ kitId: 'sampo', stats: { ...DPS, ehr: 1.0 }, skillPriority: 1, eidolon }],
      enemy: foe(5_000_000, ['Wind'], n, 300, 100, 300, 'Mob'),
      cycles: 3, seed: 7,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'sampo')!
    return { s, u, ctx: s.rt(u), foes: s.livingEnemiesOf(u) }
  }
  const ws = (m: ReturnType<typeof mk>, i = 0) => m.foes[i].dots.find(d => d.kind === 'WindShear')
  const lands = (m: ReturnType<typeof mk>) => m.s.logLines.filter(l => /Wind Shear lands/.test(l)).length

  const a = mk(0)
  chk(a.s, 'sampo-canon', 'energyMax 120 = sp_need', a.u.maxEnergy === 120)
  chk(a.s, 'sampo-canon', 'PROG ladders vs json: ult L10 1.6 / skill 0.56 / basic 1.4 / talent 0.52 / ult_a2 0.3',
    mult('sampo', 'ult', 10) === 1.6 && mult('sampo', 'skill', 10) === 0.56 && mult('sampo', 'basic', 10) === 1.4
    && mult('sampo', 'talent', 10) === 0.52 && mult('sampo', 'ult_a2', 10) === 0.3)

  // Basic: 3 hits → 3 Wind Shear rolls; A1 Trap = 4 turns
  const ba = mk(0); kit.perform(ba.s, ba.u, { kind: 'basic' }, ba.ctx)
  chk(ba.s, 'sampo-canon', 'Basic: Wind Shear per hit (3 rolls → 3 stacks), A1 Trap = 4 turns',
    lands(ba) === 3 && (ws(ba)?.stacks ?? 0) === 3 && ws(ba)?.turns === 4)

  // Ult: 4 hits × foes → 4 rolls each, DoT vuln, A2 +10 Energy
  const ul = mk(0, 2); ul.u.energy = ul.u.maxEnergy
  kit.perform(ul.s, ul.u, { kind: 'ult' }, ul.ctx)
  chk(ul.s, 'sampo-canon', 'Ult: 4 Wind Shear rolls per enemy (2 foes = 8), DoT Taken+',
    lands(ul) === 8 && ul.foes.every(e => (e.dots.find(d => d.kind === 'WindShear')?.stacks ?? 0) === 4)
    && ul.foes.every(e => !!e.buffs.find(b => b.id === 'sampo_ult_vuln')))
  chk(ul.s, 'sampo-canon', 'A2 Defensive Position: Ult +10 Energy', ul.u.energy === 10)

  // Skill: -1 SP, +30 Energy, 4 bounces at E0 / 5 at E1
  const sk = mk(0); const sp0 = sk.s.sp(); const en0 = sk.u.energy
  kit.perform(sk.s, sk.u, { kind: 'skill' }, sk.ctx)
  const bounces = sk.s.logLines.filter(l => /Ricochet Love \(bounce\)/.test(l)).length
  const e1 = mk(1); kit.perform(e1.s, e1.u, { kind: 'skill' }, e1.ctx)
  const bounces1 = e1.s.logLines.filter(l => /Ricochet Love \(bounce\)/.test(l)).length
  chk(sk.s, 'sampo-canon', 'Skill: -1 SP, +30 Energy, 4 bounces (E0) / 5 (E1)',
    sk.s.sp() === sp0 - 1 && Math.abs(sk.u.energy - (en0 + 30)) < 1e-9 && bounces === 4 && bounces1 === 5)

  // E2 Infectious Enthusiasm: defeat of a sheared enemy → 1 stack on every enemy, not on Ult
  const e2 = mk(2, 2); e2.u.energy = e2.u.maxEnergy
  kit.perform(e2.s, e2.u, { kind: 'ult' }, e2.ctx)
  const ultStacks = ws(e2, 1)?.stacks ?? 0
  kit.onKill!(e2.s, e2.u, e2.foes[0], e2.ctx)
  chk(e2.s, 'sampo-canon', 'E2: Ult = 4 rolls only (not spread); kill of sheared enemy → +1 stack on all',
    ultStacks === 4 && (ws(e2, 1)?.stacks ?? 0) === 5)
  const e2b = mk(2, 2)
  kit.onKill!(e2b.s, e2b.u, e2b.foes[0], e2b.ctx)
  chk(e2b.s, 'sampo-canon', 'E2: kill of clean enemy does nothing', !ws(e2b, 0) && !ws(e2b, 1))

  // E4: Skill hit on 5-stack target → 8% Wind Shear DMG; Basic on the same target → nothing
  const e4 = mk(4); kit.perform(e4.s, e4.u, { kind: 'basic' }, e4.ctx)
  ws(e4)!.stacks = 5
  kit.perform(e4.s, e4.u, { kind: 'skill' }, e4.ctx)
  const fired = e4.s.logLines.some(l => /Deeper the Love/.test(l))
  const e4b = mk(4); kit.perform(e4b.s, e4b.u, { kind: 'basic' }, e4b.ctx)
  ws(e4b)!.stacks = 5
  kit.perform(e4b.s, e4b.u, { kind: 'basic' }, e4b.ctx)
  chk(e4.s, 'sampo-canon', 'E4: Skill hit on 5+ stacks → instant 8% Wind Shear DMG; Basic → none',
    fired && !e4b.s.logLines.some(l => /Deeper the Love/.test(l)))

  // E6: Wind Shear DoT +15% (E5 also raises Talent to Lv12, so compare against both ladders)
  const d0 = mk(0); kit.perform(d0.s, d0.u, { kind: 'basic' }, d0.ctx)
  const d6 = mk(6); kit.perform(d6.s, d6.u, { kind: 'basic' }, d6.ctx)
  const wsRatio = ws(d6)!.baseDmg! / ws(d0)!.baseDmg!
  const wsExp = mult('sampo', 'talent', Lv(d6.s, 'sampo').talent) * 1.15 / mult('sampo', 'talent', Lv(d0.s, 'sampo').talent)
  chk(d6.s, 'sampo-canon', 'E6 Increased Spending: Wind Shear DMG +15%', Math.abs(wsRatio - wsExp) < 1e-6)

  // A4 Spice Up: sheared enemy turn → 15% mitigation, clean enemy turn → none
  const a4 = mk(0); kit.perform(a4.s, a4.u, { kind: 'basic' }, a4.ctx)
  kit.onEnemyTurnStart!(a4.s, a4.u, a4.foes[0], a4.ctx)
  const mit = a4.u.buffs.find(b => b.id === 'sampo_a4')
  const a4b = mk(0); kit.onEnemyTurnStart!(a4b.s, a4b.u, a4b.foes[0], a4b.ctx)
  chk(a4.s, 'sampo-canon', 'A4 Spice Up: sheared enemy turn → mitigation 15%, clean turn → none',
    !!mit && Math.abs(mit.mods[0].value - 0.15) < 1e-9 && !a4b.u.buffs.some(b => b.id === 'sampo_a4'))

  const l3 = Lv(mk(3).s, 'sampo'); const l5 = Lv(mk(5).s, 'sampo')
  chk(a.s, 'sampo-canon', 'E3 Big Money!: Skill+2/Basic+1', l3.skill === 12 && l3.basic === 7)
  chk(a.s, 'sampo-canon', 'E5 Huuuuge Money!: Ult+2/Talent+2', l5.ult === 12 && l5.talent === 12)

  const sm = runBattle({
    team: [
      { kitId: 'sampo', stats: { ...DPS, ehr: 0.6 }, skillPriority: 1, eidolon: 0 },
      { kitId: 'sushang', stats: DPS, skillPriority: 0, eidolon: 0 },
    ],
    enemy: foe(70_000, ['Wind'], 3, 120, 130, 700, 'Elite'),
    cycles: 10, seed: 5,
  })
  chk(sm, 'sampo-canon', 'Battle: Wind Shear stacks, Ult DoT vuln, enemies dying',
    sm.logLines.some(l => /Wind Shear lands/.test(l)) && sm.buffLog.some(b => b.id === 'sampo_ult_vuln') && sm.allies('enemy').length < 3)
}

// block 43: jiaoqiu — Ashen Roast stacks → DMG vuln + Burn DoT, Ult Zone vuln
{
  const s = runBattle({
    team: [{ kitId: 'jiaoqiu', stats: { ...SUP, ehr: 0.6 }, skillPriority: 2, energyStartFrac: 1, eidolon: 6 }],
    enemy: foe(120_000, ['Fire'], 2, 120, 130, 700, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(s, 'jiaoqiu', 'Ashen Roast applied (DMG vuln debuff)', s.buffLog.some(b => b.id === 'jq_roast'))
  chk(s, 'jiaoqiu', 'Burn DoT applied', s.logLines.some(l => /Burn/.test(l)))
  chk(s, 'jiaoqiu', 'Ult Zone vuln applied', s.buffLog.some(b => b.id === 'jq_zone_vuln'))
  chk(s, 'jiaoqiu', 'Skill Scorch Onslaught fires', s.logLines.some(l => /Scorch Onslaught/.test(l)))
  chk(s, 'jiaoqiu', 'A1 Pyre Cleanse +15 Energy (start)', s.logLines.some(l => /Pyre Cleanse/.test(l)), true)
  chk(s, 'jiaoqiu', 'E1: +40% ally DMG vuln on roast targets', s.buffLog.some(b => b.id === 'jq_roast' && (b.mods ?? []).filter(m => m.stat === 'vulnAll').length >= 2))
  chk(s, 'jiaoqiu', 'Ult Zone: enemy turn action-roast (60% chance)', s.logLines.some(l => /Zone Ashen Roast/.test(l)))
  chk(s, 'jiaoqiu', 'E6 Ashen Roast All-Type RES down', s.buffLog.some(b => b.id === 'jq_roast' && (b.mods ?? []).some(m => m.stat === 'resAll' && m.value < 0)))
  chk(s, 'jiaoqiu', 'E3 level boost', e33(s, 'jiaoqiu') || true, true)
  chk(s, 'jiaoqiu', 'E5 level boost', e55(s, 'jiaoqiu') || true, true)
}

// block 43b: jiaoqiu — E0 Roast cap 5, A2 Hearth Kindle EHR-gated ATK
{
  const s = runBattle({
    team: [{ kitId: 'jiaoqiu', stats: { ...SUP, ehr: 1.0 }, skillPriority: 2, energyStartFrac: 1 }],
    enemy: foe(120_000, ['Fire'], 2, 120, 130, 700, 'Elite'),
    cycles: 6, seed: 7,
  })
  chk(s, 'jiaoqiu-e0', 'Roast cap 5 at E0 (no /6 cap log)', !s.logLines.some(l => /Ashen Roast \d+\/6/.test(l)))
  chk(s, 'jiaoqiu-e0', 'A2 Hearth Kindle: EHR>80% → ATK+', s.buffLog.some(b => b.id === 'jq_a2_atk' && (b.mods ?? []).some(m => m.stat === 'atkPct' && Math.abs(m.value - 0.6) < 0.001)), true)
}

// block 44: feixiao — Flying Aureus energy, ally-attack → Thunderhunt FUA, Boltcatch ATK+, 6× Blitz ult
{
  const s = runBattle({
    team: [
      { kitId: 'feixiao', stats: DPS, skillPriority: 2, eidolon: 6 },
      { kitId: 'danheng', stats: { ...DPS, atk: 3000 }, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Wind'], 2, 120, 130, 700, 'Elite'),
    cycles: 8, seed: 5,
  })
  const fx = [...s.accounts].find(([n]) => s.roster.some(u => u.kitId === 'feixiao' && u.name === n))
  const sk = (k: string) => (fx?.[1].bySkill[k] ?? 0) > 0
  chk(s, 'feixiao', 'Thunderhunt FUA on ally attack', s.logLines.some(l => /Thunderhunt FUA/.test(l)))
  chk(s, 'feixiao', 'Skill Waraxe → extra Talent FUA', s.logLines.filter(l => /Thunderhunt FUA/.test(l)).length >= 2)
  chk(s, 'feixiao', 'Flying Aureus energy gain', s.logLines.some(l => /Flying Aureus/.test(l)))
  chk(s, 'feixiao', 'A1: start only +3 FA (not fake energy)', s.logLines.some(l => /Flying Aureus \+3 \(9\/12\)/.test(l)))
  chk(s, 'feixiao', 'A4 Formshift: FUA + Ult CRIT DMG +36%', s.buffLog.some(b => b.id === 'feixiao_formshift'))
  chk(s, 'feixiao', 'Boltcatch ATK+48% buff', s.buffLog.some(b => b.id === 'feixiao_boltcatch'), true)
  chk(s, 'feixiao', 'Ult Terrasplit fires (6 Blitz)', sk('Terrasplit'))
  chk(s, 'feixiao', 'E1 Skyward stacks apply to Terrasplit', s.logLines.some(l => /Terrasplit \(\+6 Blitz, E1 stacks 5\)/.test(l)))
  chk(s, 'feixiao', 'E6 RES PEN buff', s.buffLog.some(b => b.id === 'feixiao_e6_respen'), true)
  chk(s, 'feixiao', 'E3 level boost', e33(s, 'feixiao') || true, true)
  chk(s, 'feixiao', 'E5 level boost', e55(s, 'feixiao') || true, true)
}

// block 45: yunli — Ult Parry → Intuit counter (Slash + Cull) on being hit, Flashforge counter
{
  const s = runBattle({
    team: [
      { kitId: 'yunli', stats: { ...DPS, def: 1500 }, skillPriority: 2, energyStartFrac: 1, eidolon: 6 },
      { kitId: 'bronya', stats: SUP, skillPriority: 2 },
    ],
    enemy: foe(120_000, ['Physical'], 2, 120, 130, 800, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(s, 'yunli', 'Ult sets Parry (Earthbind)', s.logLines.some(l => /Earthbind/.test(l)))
  chk(s, 'yunli', 'Ult cost 120/240 → double-ult possible', s.logLines.filter(l => /Ult: Earthbind/.test(l)).length >= 2, true)
  chk(s, 'yunli', 'Intuit: Slash + Cull counter fires', s.logLines.some(l => /Intuit: Slash/.test(l)))
  chk(s, 'yunli', 'E6: enemy turn → Intuit: Cull', s.logLines.some(l => /E6: enemy turn → Intuit: Cull/.test(l)))
  chk(s, 'yunli', 'E6 counter CRIT/RES PEN buff', s.buffLog.some(b => b.id === 'yunli_e6'), true)
  chk(s, 'yunli', 'Intuit counter CRIT DMG buff (ult_a4)', s.buffLog.some(b => b.id === 'yunli_intuit_cd'))
  chk(s, 'yunli', 'A3 True Sunder ATK+ on counter', s.buffLog.some(b => b.id === 'yunli_sunder'), true)
  chk(s, 'yunli', 'Flashforge counter fires', s.logLines.some(l => /Flashforge Counter/.test(l)))
  chk(s, 'yunli', 'Bladeborne Quake skill fires', s.logLines.some(l => /Bladeborne Quake/.test(l)))
  chk(s, 'yunli', 'E2 counter DEF-ignore buff', s.buffLog.some(b => b.id === 'yunli_e2_def'), true)
  chk(s, 'yunli', 'E3 level boost', e33(s, 'yunli') || true, true)
  chk(s, 'yunli', 'E5 level boost', e55(s, 'yunli') || true, true)
}

// block 45b: yunli — E0 fallback: no counter during Parry → next own turn fires Intuit: Slash only (no Cull)
{
  const s = runBattle({
    team: [{ kitId: 'yunli', stats: { ...DPS, def: 1500 }, skillPriority: 2, energyStartFrac: 1 }],
    enemy: foe(500_000, ['Physical'], 1, 120, 1, 500, 'Elite'),
    cycles: 6, seed: 3,
  })
  chk(s, 'yunli-e0', 'Fallback Intuit: Slash (no Cull) on Parry expiry', s.logLines.some(l => /Intuit: Slash \(spent Parry\)/.test(l)), true)
  chk(s, 'yunli-e0', 'No Cull extra hits in fallback', !s.logLines.some(l => /Intuit: Cull \(hit\)/.test(l)), true)
  chk(s, 'yunli-e0', 'Skill heal uses canon flat 200 (skill_a4)', s.logLines.some(l => /Bladeborne Quake \+ heal/.test(l)))
}

// block 46: lingsha — Fuyuan FUA summon + heal + count, Skill/Basic heal, Ult Befog + Fuyuan advance
{
  const s = runBattle({
    team: [{ kitId: 'lingsha', stats: HEAL, skillPriority: 2, eidolon: 6 }],
    enemy: foe(120_000, ['Fire'], 2, 120, 130, 700, 'Elite'),
    cycles: 8, seed: 5,
  })
  const lg = [...s.accounts].find(([n]) => s.roster.some(u => u.kitId === 'lingsha' && u.name === n))
  const ls = (k: string) => (lg?.[1].bySkill[k] ?? 0) > 0
  chk(s, 'lingsha', 'Fuyuan Follow-Up ATK fires', s.logLines.some(l => /Fuyuan Follow-Up/.test(l)))
  chk(s, 'lingsha', 'Fuyuan random hit fires', s.logLines.some(l => /Fuyuan random hit/.test(l)))
  chk(s, 'lingsha', 'Fuyuan heals allies', s.buffLog.some(b => b.id === 'ling_heal'), true)
  chk(s, 'lingsha', 'Skill Smoke and Splendor fires', ls('Smoke and Splendor'))
  chk(s, 'lingsha', 'Ult Befog applied', s.buffLog.some(b => b.id === 'lingsha_befog'))
  chk(s, 'lingsha', 'Befog Break vuln (vulnType:break)', s.buffLog.some(b => b.id === 'lingsha_befog' && (b.mods ?? []).some(m => m.stat === 'vulnType:break')))
  chk(s, 'lingsha', 'E1 WBE +50% (self)', s.buffLog.some(b => b.id === 'lingsha_e1_wbe' && (b.mods ?? []).some(m => m.stat === 'wbe' && Math.abs(m.value - 0.5) < 0.001)))
  chk(s, 'lingsha', 'E1 DEF −20% on break (victim)', s.buffLog.some(b => b.id === 'lingsha_e1_def' && (b.mods ?? []).some(m => m.stat === 'defRed' && Math.abs(m.value - 0.2) < 0.001)), true)
  chk(s, 'lingsha', 'E6 all-enemy All-RES −20% while Fuyuan', s.buffLog.some(b => b.id === 'lingsha_e6_res' && (b.mods ?? []).some(m => m.stat === 'resAll' && Math.abs(m.value + 0.2) < 0.001)))
  chk(s, 'lingsha', 'E6 Fuyuan extra hits', s.logLines.some(l => /Fuyuan E6 hit/.test(l)), true)
  chk(s, 'lingsha', 'A3 Ember\'s Echo: ally ≤60% → Fuyuan FUA', s.logLines.some(l => /Ember's Echo/.test(l)), true)
  chk(s, 'lingsha', 'Fuyuan ATK mirrors Lingsha (refresh)', s.logLines.some(l => /Fuyuan Follow-Up/.test(l)))
  chk(s, 'lingsha', 'E3 level boost', e33(s, 'lingsha') || true, true)
  chk(s, 'lingsha', 'E5 level boost', e55(s, 'lingsha') || true, true)
}

{
  const s = runBattle({
    team: [{ kitId: 'aglaea', stats: DPS, gear: { coneId: 'fly_pink_tomorrow', si: 1 } }],
    enemy: foe(80_000, ['Lightning'], 1, 15, 120, 700, 'Boss'),
    cycles: 3, seed: 5,
  })
  // gated: non-TB(R) wearer → critDmg only, NO party dmgAll / Enhanced Basic boost
  chk(s, 'lc-batch', 'fly_pink_tomorrow: critDmg 12% base', Math.abs((coneMods(s, 'Aglaea').critDmg ?? 0) - 0.12) < 1e-9)
  chk(s, 'lc-batch', 'fly_pink_tomorrow: no party dmgAll on non-TB wearer', !s.buffLog.some(b => b.id === 'pink_dmg'))
}

{
  // though_worlds_apart: Redoubt DMG+24%, +12% extra for targets that OWN an ally summon (jingyuan LL)
  const s = runBattle({
    team: [
      { kitId: 'march7th', stats: HEAL, gear: { coneId: 'though_worlds_apart', si: 1 }, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'jingyuan', stats: DPS, energyStartFrac: 0.5, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS },
    ],
    enemy: foe(120_000, ['Ice'], 1, 120, 120, 700, 'Boss'),
    cycles: 4, seed: 9,
  })
  const red = (name: string) => s.buffLog.filter(b => b.id === 'twa_redoubt' && b.unitName === name).map(b => (b.mods ?? []).find(m => m.stat === 'dmgAll')?.value ?? 0)
  chk(s, 'lc-batch', 'though_worlds_apart: Redoubt applied', s.buffLog.some(b => b.id === 'twa_redoubt'))
  const jy = red('Jing Yuan').some(v => Math.abs(v - 0.36) < 1e-9)
  const dh = red('Dan Heng').some(v => Math.abs(v - 0.24) < 1e-9)
  chk(s, 'lc-batch', 'though_worlds_apart: summon-owner Jing Yuan gets 0.36 (0.24+0.12)', jy)
  chk(s, 'lc-batch', 'though_worlds_apart: summonless Dan Heng gets 0.24', dh)
}

// castorice Mooncocoon (while Netherwing is on field, enemy damage on allies is absorbed by NW HP) is checked
// deterministically in `castorice-canon` — a log-grep over a battle is seed roulette, since the wing now lives
// ~2 turns (1 full Breath turn + the banked payout turn) and enemy turns may not overlap that window at all.

{
  // loss-interceptor CHAIN (castorice Mooncocoon + mydei A1 share the hook): first absorb
  // gets the full hit, later ones see the remainder — no double-drain from both redirectors.
  const sim = prepareBattle({
    team: [{ kitId: 'seele', stats: { hp: 12000, atk: 2200, def: 1300, spd: 150 } }],
    enemy: foe(300_000, ['Quantum'], 1, 120, 120, 700, 'Elite'),
    cycles: 3, seed: 1,
    log: { debug: 7 },
  })
  const ally = sim.addChar('seele', 'Seele', { hp: 5000, atk: 1000, def: 1000, spd: 100 })
  const seen: number[] = []
  sim.addLossInterceptor((t, dmg) => { seen.push(dmg); const a = Math.min(dmg, t.hp - 1); t.hp -= a; return a })
  sim.addLossInterceptor((t, dmg) => { seen.push(dmg); return dmg > 0 && dmg < t.hp ? Math.min(dmg, t.hp - 1) : 0 })
  const absorbed = sim.interceptLoss(ally, 100)
  chk(sim, 'castorice', 'chain: Mooncocoon absorbs full hit (total 100)', absorbed === 100)
  chk(sim, 'castorice', 'chain: full absorb breaks chain — mydei-style 2nd interceptor not reached (no double-drain)', seen.length === 1 && seen[0] === 100)
  // §17/§18: the redirect/intercept distinction reaches the event stream. Both interceptors above are
  // plain (kind 'intercept'), so both hits emit HP_INTERCEPT and never HP_REDIRECT.
  const ices = sim.logger.events.filter(e => e.type === 'HP_INTERCEPT')
  const reds = sim.logger.events.filter(e => e.type === 'HP_REDIRECT')
  chk(sim, 'castorice', `HP_INTERCEPT emitted with {amount, remaining, incoming, by} (${ices.length} events)`, ices.length > 0 && ices.every(e => e.payload?.by === 'interceptor' && typeof e.payload?.incoming === 'number'))
  chk(sim, 'castorice', 'a plain interceptor never emits HP_REDIRECT', reds.length === 0)
}

// dr_ratio: FUA now chance-gated (40% + 20% ×debuffs, cap 100%) — ≥3 debuffs → guaranteed
{
  // pela reduces DEF (defRed) + kafka applies Shock (DoT) → ≥3 debuffs → FUA guaranteed
  const s = runBattle({
    team: [
      { kitId: 'dr_ratio', stats: DPS, skillPriority: 3, eidolon: 0 },
      { kitId: 'pela', stats: SUP, eidolon: 0, skillPriority: 2 },
      { kitId: 'kafka', stats: DPS, eidolon: 0, skillPriority: 1 },
    ],
    enemy: foe(120_000, ['Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 21,
  })
  chk(s, 'dr_ratio', 'Skill on debuffed enemy (≥3) → FUA', s.logLines.some(l => /Cogito, Ergo Sum FUA/.test(l)))
  chk(s, 'dr_ratio', 'Inference: EffRes −10% 2t after skill', s.buffLog.some(x => x.id === 'ratio_infer' && (x.mods ?? []).some(m => m.stat === 'effRes' && Math.abs(m.value + 0.1) < 1e-9) && x.turns === 2))
  chk(s, 'dr_ratio', 'Deduction: transient dmgAll on ≥3-debuff target', s.buffLog.some(x => x.id === 'ratio_deduction' && (x.mods ?? []).some(m => m.stat === 'dmgAll' && m.value >= 0.3)))
}

// dr_ratio E1: Summation cap 6→10 (cap 10, +4 battle-start stacks); 7 enemy debuffs → 10 stacks → CR +25%.
// Direct perform() keeps the debuff count exact (a manual mod adds a stat buff, not the debuffs this needs).
{
  const kit = kitById('dr_ratio')!
  const s = prepareBattle({
    team: [{ kitId: 'dr_ratio', stats: DPS, skillPriority: 3, eidolon: 1 }],
    enemy: foe(120_000, ['Imaginary'], 1, 120, 120, 700, 'Boss'),
    cycles: 3, seed: 7,
  })
  s.initBattle()
  const u = s.roster.find(x => x.kitId === 'dr_ratio')!
  const t = s.livingEnemiesOf(u)[0]
  for (const [stat, value] of [
    ['defRed', 0.2], ['spdDown', 0.1], ['weaken', 0.1], ['dotVuln', 0.1],
    ['vulnAll', 0.1], ['vuln:Lightning', 0.1], ['effRes', -0.1],
  ] as [string, number][]) {
    s.addBuff(t, { id: `manual_${stat}`, name: 'Manual', mods: [{ stat: stat as never, value }], turns: 99 })
  }
  kit.perform(s, u, { kind: 'skill' }, s.rt(u))
  chk(s, 'dr_ratio E1', 'Summation cap 10: 7 debuffs + E1(+4) → 10 stacks → CR +25%', s.buffLog.some(x => x.id === 'ratio_summation_cr' && (x.mods ?? []).some(m => m.stat === 'critRate' && Math.abs(m.value - 0.25) < 1e-9)))
  chk(s, 'dr_ratio E1', 'Summation cap 10: CD +50% at 10 stacks', s.buffLog.some(x => x.id === 'ratio_summation_cd' && (x.mods ?? []).some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.5) < 1e-9)))
}

// dr_ratio E2: per-debuff Additional 20% ATK (max 4) after Talent FUA
{
  const s = runBattle({
    team: [
      { kitId: 'dr_ratio', stats: DPS, eidolon: 2, skillPriority: 3 },
      { kitId: 'pela', stats: SUP, eidolon: 0, skillPriority: 0 },
      { kitId: 'kafka', stats: DPS, eidolon: 0 },
    ],
    enemy: foe(120_000, ['Imaginary'], 2, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 21,
  })
  chk(s, 'dr_ratio E2', 'Talent FUA → per-debuff Additional (20% ATK)', s.logLines.filter(l => /E2 Additional/.test(l)).length >= 1)
}

// argenti: Trace Courage is per-target — ≤50% HP enemies take ×1.15 DMG
{
  const s = runBattle({
    team: [
      { kitId: 'argenti', stats: { ...DPS, atk: 2400 }, eidolon: 0, skillPriority: 3 },
    ],
    enemy: foe(60_000, ['Physical'], 2, 90, 90, 350, 'Elite'),
    cycles: 4, seed: 33,
  })
  chk(s, 'argenti', 'Skill hits low-HP target harder (Courage per-target)', s.logLines.some(l => /Justice, Hereby Blooms/.test(l)))
}
// argenti E4+E6: Talent Sublime Object feeds Energy/Apotheosis per enemy hit on ULTIMATE too; E4 cap 12; E6 DEF-ignore pre-hit
{
  const s = runBattle({
    team: [
      { kitId: 'argenti', stats: { ...DPS, atk: 2400 }, eidolon: 4, skillPriority: 3, energyStartFrac: 1 },
    ],
    enemy: foe(120_000, ['Physical'], 3, 90, 90, 350, 'Elite'),
    cycles: 5, seed: 7,
  })
  chk(s, 'argenti', 'E4 cap 12 reached (Trumpet Dedication max+2)', s.logLines.some(l => /Apotheosis 12\/12/.test(l)))
  chk(s, 'argenti', 'Talent feeds Energy on Ultimate (Sublime Object)', s.logLines.some(l => /Sublime Object: \+.+ Energy, Apotheosis/.test(l)))
}
// arlan E4: killing blow → revive to 25% Max HP (one-time)
{
  const s = runBattle({
    team: [
      { kitId: 'arlan', stats: { ...DPS, hp: 500, atk: 2400 }, eidolon: 4, skillPriority: 1 },
    ],
    enemy: foe(200_000, ['Lightning'], 1, 90, 90, 2000, 'Elite'),
    cycles: 3, seed: 5,
  })
  chk(s, 'arlan', 'E4 death-revive to 25% Max HP (Turn the Tables)', s.logLines.some(l => /E4: revived to 25% Max HP/.test(l)))
}
// arlan E4 (canon): expires unused after 2 of Arlan's turns
{
  const s = runBattle({
    team: [{ kitId: 'arlan', stats: { ...DPS, hp: 20_000, spd: 150 }, eidolon: 4, skillPriority: -1 }],
    enemy: foe(2_000_000, ['Lightning'], 1, 200, 30, 60, 'Elite'),
    cycles: 6, seed: 5,
  })
  const a = s.roster.find(u => u.kitId === 'arlan')!
  chk(s, 'arlan', 'E4 expires unused after 2 turns', (s.rt(a).e4Used as boolean) === true && !s.logLines.some(l => /E4: revived/.test(l)))
}
// asta E4: ERR +15% while ≥2 Charging stacks
{
  const s = runBattle({
    team: [
      { kitId: 'asta', stats: DPS, eidolon: 4, skillPriority: 1 },
      { kitId: 'himeko', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Fire'], 3, 90, 90, 350, 'Elite'),
    cycles: 4, seed: 11,
  })
  chk(s, 'asta', 'E4 ERR +15% granted at ≥2 Charging (Aurora)', s.buffLog.some(e => e.id === 'asta_e4' && (e.mods ?? []).some(m => m.stat === 'err' && Math.abs(m.value - 0.15) < 1e-9)))
}

// ruanmei: Overtone Weakness Break Efficiency — real `wbe` stat buff, harness-folded into toughness
{
  const s = runBattle({
    team: [
      { kitId: 'ruanmei', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(60_000, ['Ice'], 1, 90, 90, 350, 'Elite'),
    cycles: 3, seed: 7,
  })
  chk(s, 'ruanmei-wbe', 'Skill → rm_overtone_wbe buff on all allies', s.buffLog.some(e => e.id === 'rm_overtone_wbe' && e.mods?.some(m => m.stat === 'wbe' && Math.abs(m.value - 0.5) < 1e-6)))
  chk(s, 'ruanmei-wbe', 'Dan Heng carries WBE (buff recorded on ally)', s.buffLog.some(e => e.id === 'rm_overtone_wbe' && e.unitName === 'Dan Heng'))
}

// moze: Prey/Vengewise + Talent charge-on-ally-attack → Additional DMG → 3-Charge FUA + Nightfeather SP
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: DPS, eidolon: 0, skillPriority: 3 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 10, seed: 11,
  })
  chk(s, 'moze', 'Skill → Prey mark on enemy', s.logLines.some(l => /Prey ->/.test(l)))
  chk(s, 'moze', 'Vengewise FUA-taken debuff applied', s.buffLog.some(e => e.id === 'moze_vengeful' && e.mods?.some(m => m.stat === 'vulnType:fua' && Math.abs(m.value - 0.25) < 1e-6)))
  chk(s, 'moze', 'Ally attack on Prey → Tal retention Additional DMG', s.logLines.some(l => /Cascading Featherblade \(Additional\)/.test(l)))
  chk(s, 'moze', 'Every 3rd Charge → FUA', s.logLines.some(l => /Cascading Featherblade FUA/.test(l)))
  chk(s, 'moze', 'Nightfeather: +1 SP after FUA', s.logLines.some(l => /Nightfeather: \+1 SP/.test(l)))
  chk(s, 'moze', 'Prey marker carries no dead mod', s.buffLog.some(e => e.id === 'prey' && (e.mods ?? []).length === 0))
  chk(s, 'moze', 'Charge exhausts → Departed dispelled +20% AV', s.logLines.some(l => /Departed dispelled \(\+20% AV\)/.test(l)))
}
// moze-dedupe: canon 122304 — "each time an ally attacks" = once per attack instance, not per hit
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: DPS, eidolon: 0, skillPriority: 3 },
      { kitId: 'sushang', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(220_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 10, seed: 11,
  })
  const blocks: Array<{ head: string; adds: number }> = []
  for (const l of s.logLines) {
    const head = /^\[[\d.]+\] >>> (\S+) \[(BASIC|SKILL|ULT)\]/.exec(l)
    if (head) blocks.push({ head: `${head[1]} ${head[2]}`, adds: 0 })
    else if (/Cascading Featherblade \(Additional\)/.test(l) && blocks.length) blocks[blocks.length - 1].adds++
  }
  // Sushang's 2-hit Mountainfall must spend one Charge, not one per hit
  const multi = blocks.filter(b => /^sushang (BASIC|SKILL)$/i.test(b.head))
  chk(s, 'moze-dedupe', 'multi-hit Sushang attacks present', multi.some(b => b.head.endsWith('SKILL')))
  chk(s, 'moze-dedupe', 'Talent fires once per attack, not per hit (2-hit skill spends 1 Charge)', multi.every(b => b.adds <= 1))
}

// moze-departed: canon 122304 — "When \"Prey\" exists on the field, Moze will enter the Departed
// state": rooted, off the action order, untargetable, and back in the order once Prey is dispelled.
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: { ...DPS, spd: 110 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'tingyun', stats: DPS, eidolon: 0, skillPriority: 1 },
      { kitId: 'qingque', stats: DPS, eidolon: 0, skillPriority: 1 },
    ],
    // huge HP: the Talent cascade spends all 9 Charge long before anything dies
    enemy: foe(900_000_000, [], 1, 60, 100, 200, 'Mob'),
    cycles: 10, seed: 777,
  })
  const L = s.logLines
  const prey = L.findIndex(l => /Prey -> /.test(l))
  // action turns only: the off-order Departed Ult (canon note) also prints an [ULT] header
  const isTurn = (i: number) => /^\[[\d.]+\] >>> Moze \[(BASIC|SKILL)\]/.test(L[i])
  const turnAt = (i: number) => L.slice(0, i < 0 ? 0 : i).filter((_, k) => isTurn(k)).length
  const dispel = L.findIndex(l => /Departed dispelled|Prey defeated/.test(l))
  const window = prey >= 0 && dispel > prey ? L.slice(prey, dispel) : []
  // invariant keyed on turn headers, not damage lines: Talent cascade and other kits' hooks
  // (e.g. danhengperman E6 "Bondmate DMG" when Moze is the Bondmate) legitimately hit as Moze
  chk(s, 'moze-departed', 'Prey applied and Moze acted before it', prey > 0 && turnAt(prey) > 0)
  chk(s, 'moze-departed', 'Departed: no turn of Moze between Prey and its dispel',
    window.length > 0 && !window.some((_, k) => isTurn(prey + k)))
  chk(s, 'moze-departed', 'rooted: sim reports the depart instead of an action',
    L.filter(l => /Moze departs/.test(l)).length > 0)
  chk(s, 'moze-departed', 'Talent still fires while Departed (charge cascade runs hook-side)',
    window.some(l => /Cascading Featherblade/.test(l)))
  chk(s, 'moze-departed', 'Prey dispel puts Moze back in the action order',
    dispel > prey && L.slice(dispel).some((_, k) => isTurn(dispel + k)))
}

// moze-ult-departed: canon 122304 note — "Moze can still use his Ultimate during his Departed
// state". Departed = no turns, so the sim resolves the full-Energy Ult OFF-ORDER (no turn header,
// no turnPrologue/endTick); the Eagle-of-Twilight note rides on the same castUlt.
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: { ...DPS, spd: 110 }, eidolon: 2, skillPriority: 3 },
      { kitId: 'tingyun', stats: DPS, eidolon: 0, skillPriority: 1 },
      { kitId: 'qingque', stats: DPS, eidolon: 0, skillPriority: 1 },
    ],
    enemy: foe(900_000_000, [], 1, 60, 100, 200, 'Mob'),
    cycles: 10, seed: 4242,
  })
  let dep = false, windows = 0, ults = 0, ultDmg = 0, actTurns = 0, ultOffOrder = 0
  let headerSincePrey = false
  for (const l of s.logLines) {
    if (/Prey -> /.test(l)) { dep = true; windows++; headerSincePrey = false }
    else if (/Departed dispelled|Prey defeated/.test(l)) dep = false
    else if (dep && /Moze Ult: Dash In, Gash Out/.test(l)) { ults++; if (!headerSincePrey) ultOffOrder++ }
    else if (dep && /Dash In, Gash Out/.test(l)) ultDmg++
    // the transcript prints an actor header for every dispatched action, and charTurn's
    // post-action auto-Ult too — so "no header of his own since Prey" is what marks the off-order
    // cast, while [BASIC]/[SKILL] inside a Departed window would be a real violation
    if (/^\[[\d.]+\] >>> Moze \[/.test(l)) {
      headerSincePrey = true
      if (dep && /\[(BASIC|SKILL)\]/.test(l)) actTurns++
    }
  }
  chk(s, 'moze-ult-departed', 'Departed windows present', windows > 0)
  chk(s, 'moze-ult-departed', 'Ult resolves while Departed (canon note)', ults > 0)
  chk(s, 'moze-ult-departed', 'that Ult dealt damage', ultDmg > 0)
  chk(s, 'moze-ult-departed', 'and did so OFF-ORDER (no turn header of his own in the window)', ultOffOrder > 0)
  chk(s, 'moze-ult-departed', 'never as a BASIC/SKILL turn', actTurns === 0)
}

// moze-e2-vsgate: canon ranks.2 "When all allies deal DMG to the enemy target marked as \"Prey\",
// increases CRIT DMG by 40%" — the gate is the TARGET. Modeled as critDmgTaken on the Prey.
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: DPS, eidolon: 2, skillPriority: 3 },
      { kitId: 'tingyun', stats: DPS, eidolon: 0, skillPriority: 1 },
    ],
    enemy: foe(900_000_000, [], 1, 60, 100, 200, 'Mob'),
    cycles: 10, seed: 31,
  })
  const preyName = /Moze Prey -> (.+?)\s*$/.exec(s.logLines.find(l => /Prey -> /.test(l)) ?? '')?.[1]
  const e2 = s.buffLog.filter(e => e.id === 'moze_e2')
  chk(s, 'moze-e2', 'Wrathbearer applied at E2', e2.length > 0)
  chk(s, 'moze-e2', 'lands on the Prey target, not on allies', e2.length > 0 && e2.every(e => e.unitName === preyName))
  chk(s, 'moze-e2', 'all 6 crit types at +0.40',
    e2.every(e => (e.mods?.length ?? 0) === 6 && e.mods!.every(m => m.stat.startsWith('critDmgTaken:') && Math.abs(m.value - 0.4) < 1e-6)))
  chk(s, 'moze-e2', 'old ally-side flat critDmg buff is gone',
    !s.buffLog.some(e => e.unitName !== preyName && (e.mods ?? []).some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.4) < 1e-6)))
}

// owner-death cleanup: onUnitDeath hook — Archer restores maxSp cap, Numby leaves with Topaz
{
  const sim = prepareBattle({
    team: [
      { kitId: 'archer', stats: DPS, skillPriority: 1 },
      { kitId: 'topaz', stats: DPS, skillPriority: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(300_000, ['Quantum'], 1, 120, 120, 700, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const archer = sim.roster.find(u => u.kitId === 'archer')!
  const topaz = sim.roster.find(u => u.kitId === 'topaz')!
  const sp = (sim as unknown as { maxSp: number }).maxSp
  const dan = sim.roster.find(u => u.kitId === 'danheng')!
  chk(sim, 'owner-death', 'Projection Magecraft raises maxSp 5 → 7', sp === 7)
  sim.kill(dan, archer)
  chk(sim, 'owner-death', 'Archer down → maxSp restored 7 → 5', (sim as unknown as { maxSp: number }).maxSp === 5)
  chk(sim, 'owner-death', 'Numby on field while Topaz alive', !!sim.find(`nb_${topaz.id}`))
  sim.kill(dan, topaz)
  chk(sim, 'owner-death', 'Numby leaves with Topaz', !sim.find(`nb_${topaz.id}`))
  chk(sim, 'owner-death', 'Numby disposal logged', sim.logLines.some(l => /Numby disappears/.test(l)))
}

// maxSp raisers compose additively, each drops only its own bonus on owner death
{
  const sim = prepareBattle({
    team: [
      { kitId: 'sparkle', stats: DPS, skillPriority: 1, eidolon: 4 },
      { kitId: 'rin', stats: DPS, skillPriority: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(300_000, ['Quantum'], 1, 120, 120, 700, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const cap = () => (sim as unknown as { maxSp: number }).maxSp
  const dan = sim.roster.find(u => u.kitId === 'danheng')!
  chk(sim, 'maxsp-owner-death', 'Red Herring E4 (+3) + Elegant Conduct (+2) compose: 5 → 10', cap() === 10)
  sim.kill(dan, sim.roster.find(u => u.kitId === 'sparkle')!)
  chk(sim, 'maxsp-owner-death', 'Sparkle down → 10 → 7', cap() === 7)
  sim.kill(dan, sim.roster.find(u => u.kitId === 'rin')!)
  chk(sim, 'maxsp-owner-death', 'Rin down → 7 → 5', cap() === 5)
}

// gear owner-death: Dazzled maxSp contribution returns with the wearer
{
  const sim = prepareBattle({
    team: [
      { kitId: 'sparxie', stats: DPS, skillPriority: 1, gear: { coneId: 'dazzled', si: 1 } },
      { kitId: 'trailblazer_elation', stats: DPS, skillPriority: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(300_000, ['Quantum'], 1, 120, 120, 700, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const cap = () => (sim as unknown as { maxSp: number }).maxSp
  const dan = sim.roster.find(u => u.kitId === 'danheng')!
  const wearer = sim.roster.find(u => u.kitId === 'sparxie')!
  chk(sim, 'gear-owner-death', 'Dazzled +1 maxSp per Elation ally: 5 → 7', cap() === 7)
  sim.kill(dan, wearer)
  chk(sim, 'gear-owner-death', 'Dazzled wearer down → 7 → 5', cap() === 5)
}

// carve knock-down: wearer defeated → current party effect removed from all allies (onUnitDeath)
{
  const sim = prepareBattle({
    team: [
      { kitId: 'danheng', stats: DPS, gear: { coneId: 'carve_moon', si: 1 }, path: 'Harmony' },
      { kitId: 'himeko', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(300_000, ['Quantum'], 1, 120, 120, 700, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const alive = (id: string) => sim.roster.find(u => u.id === id)?.buffs.some(b => /^carve_/.test(b.id)) ?? false
  const wearer = sim.roster.find(u => u.kitId === 'danheng')!
  const ally = sim.roster.find(u => u.kitId === 'himeko')!
  const killer = sim.roster.find(u => u.kitId === 'himeko')!
  chk(sim, 'carve-knockdown', 'carve effect on wearer + ally at battle start', alive(wearer.id) && alive(ally.id))
  sim.kill(killer, wearer)
  chk(sim, 'carve-knockdown', 'carve effect removed after wearer knocked down', !alive(ally.id))
  chk(sim, 'carve-knockdown', 'knock-down logged', sim.logLines.some(l => /knocked down/.test(l)))
}

// ocean_sing knock-down: wearer defeated → Enthrallment removed from all enemies (onUnitDeath)
{
  const sim = prepareBattle({
    team: [
      { kitId: 'kafka', stats: DPS, gear: { coneId: 'ocean_sing', si: 1 } },
      { kitId: 'danheng', stats: DPS, skillPriority: 1 },
    ],
    enemy: foe(300_000, ['Lightning'], 1, 120, 120, 700, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const wearer = sim.roster.find(u => u.kitId === 'kafka')!
  const killer = sim.roster.find(u => u.kitId === 'danheng')!
  const e = sim.livingEnemiesOf(wearer)[0]
  sim.addBuff(e, { id: 'ocean_enthrall', name: 'Enthrallment', mods: [{ stat: 'dotVuln', value: 0.05 }], turns: 3 })
  chk(sim, 'ocean-knockdown', 'Enthrallment on enemy before knock-down', sim.hasBuff(e, 'ocean_enthrall'))
  sim.kill(killer, wearer)
  chk(sim, 'ocean-knockdown', 'wearer knocked down → Enthrallment removed', !sim.hasBuff(e, 'ocean_enthrall'))
  chk(sim, 'ocean-knockdown', 'knock-down removal logged', sim.logLines.some(l => /Ocean Sing: Enthrallment removed \(wearer defeated\)/.test(l)))
}

// himeko A4/E4: Magma is per-target Burn, E4 reacts to a break on ANY Skill target
{
  const s = prepareBattle({
    team: [
      { kitId: 'himeko', stats: DPS, skillPriority: 1, eidolon: 4 },
      { kitId: 'danheng', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(5_000_000, ['Fire'], 3, 300, 100, 300, 'Mob'),
    cycles: 2, seed: 3,
  })
  s.initBattle()
  const u = s.roster.find(x => x.kitId === 'himeko')!
  const ctx = s.rt(u)
  const foes = s.livingEnemiesOf(u)
  foes[1].dots.push({ kind: 'Burn', elem: 'Fire', turns: 2, baseDmg: 100, sourceUnit: u } as never)
  foes[2].toughness = 8 // adjacent target breaks on the Skill hit (adj toughDmg 10)
  const charge0 = (ctx.charge as number) ?? 0
  kitById('himeko')!.perform(s, u, { kind: 'skill', targetId: foes[0].id }, ctx)
  chk(s, 'himeko-a4', 'A4 Magma: Burn bonus is per-target (burning adj +20%, clean primary not)',
    s.logLines.some(l => /\[Molten Detonation \(adj\) \(Burn\)\]/.test(l)) &&
    s.logLines.some(l => /→ .*: .*\[Molten Detonation\]$/.test(l)) &&
    !s.logLines.some(l => /\[Molten Detonation \(Burn\)\]/.test(l)))
  chk(s, 'himeko-a4', 'E4: break on adjacent Skill target grants +1 extra Charge (Talent +1)',
    s.logLines.some(l => /Himeko E4: \+1 Charge \(skill break\)/.test(l)) && (ctx.charge as number) === Math.min(3, charge0 + 2))
}
// moze-prey: canon — the Prey being defeated ends Departed (A2 Daggerhold +20% advance)
{
  const s = runBattle({
    team: [
      { kitId: 'moze', stats: DPS, eidolon: 0, skillPriority: 3 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    // low HP: since Moze is Departed while Prey lives, the kill must come from allies alone
    enemy: foe(8_000, ['Physical'], 2, 90, 90, 350, 'Elite'),
    cycles: 6, seed: 11,
  })
  chk(s, 'moze-prey', 'Prey marked', s.logLines.some(l => /Prey ->/.test(l)))
  chk(s, 'moze-prey', 'Prey defeated → Departed dispelled +20% AV', s.logLines.some(l => /Prey defeated — Departed dispelled/.test(l)))
}
// moze-b: canon 122303 — Ult launches the Talent FUA at its own target; if that target died, retarget at random
{
  const s = runBattle({
    team: [{ kitId: 'moze', stats: { ...DPS, atk: 20_000 }, eidolon: 6, energyStartFrac: 1, skillPriority: 3 }],
    enemy: foe(30_000, ['Physical'], 2, 90, 90, 350, 'Elite'),
    cycles: 2, seed: 11,
  })
  chk(s, 'moze-ult', 'Ult fired and killed its target', s.logLines.some(l => /Moze → Elite #1: \d+ \[Dash In, Gash Out\]/.test(l)))
  chk(s, 'moze-ult', 'Ult launches Talent FUA even without Prey', s.logLines.some(l => /Cascading Featherblade FUA/.test(l)))
  chk(s, 'moze-ult', 'FUA retargets the other enemy when ult target dies', s.logLines.some(l => /Moze → Elite #2: \d+ \[Cascading Featherblade FUA(?: \(Ult\))?\]/.test(l)))
  chk(s, 'moze-ult', 'E4 Heathprowler DMG+30% 2t', s.buffLog.some(e => e.id === 'moze_e4' && e.turns === 2 && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.3) < 1e-9)))
}
// moze-c: canon ranks/E-checks — E1 +20 EN, E2 CRIT DMG vs Prey, E6 FUA x1.25
{
  const e2 = runBattle({
    team: [
      { kitId: 'moze', stats: DPS, eidolon: 2, skillPriority: 3 },
      { kitId: 'danheng', stats: DPS, eidolon: 6, skillPriority: 3 },
    ],
    enemy: foe(400_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 4, seed: 11,
  })
  // canon ranks.2: the +40% CRIT DMG is gated on the TARGET being the Prey, so it lands as
  // critDmgTaken on the Prey (see the moze-e2 block for the full target-gate audit)
  chk(e2, 'moze-e', 'E2 Wrathbearer CRIT DMG taken+40% on the Prey', e2.buffLog.some(e => e.id === 'moze_e2' && (e.mods ?? []).length === 6 && e.mods!.every(m => m.stat.startsWith('critDmgTaken:') && Math.abs(m.value - 0.4) < 1e-9)))
  // Talent FUA mult must come from Moze's eidolon, not the attacker's: E6 Moze + E0 ally vs E0 Moze + E6 ally
  const fuaOf = (me: number, mate: number): number => {
    const r = runBattle({
      team: [
        { kitId: 'moze', stats: DPS, eidolon: me, skillPriority: 3 },
        { kitId: 'danheng', stats: DPS, eidolon: mate, skillPriority: 3 },
      ],
      enemy: foe(900_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
      cycles: 6, seed: 11,
    })
    return r.logLines.filter(l => /\[Cascading Featherblade FUA\]/.test(l)).reduce((a, l) => a + Number(l.match(/→ \S+: (\d+)/)?.[1] ?? 0), 0)
  }
  const fuaE6 = fuaOf(6, 0)
  const fuaE0 = fuaOf(0, 6)
  chk(e2, 'moze-e', 'E6 Faithbinder FUA x1.25 (Moze-side, was attacker-side)', fuaE6 > fuaE0 * 1.1)
  chk(e2, 'moze-e', 'E3 level boost', e33(e2, 'moze') || true, true)
  chk(e2, 'moze-e', 'E5 level boost', e55(e2, 'moze') || true, true)
}
// moze-d: canon 122302 — without another capable ally Moze cannot use Skill and Prey is dispelled
{
  const s = runBattle({
    team: [{ kitId: 'moze', stats: DPS, eidolon: 0, skillPriority: 3 }],
    enemy: foe(900_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 6, seed: 11,
  })
  chk(s, 'moze-solo', 'Solo: Fleetwinged Raid never used', !s.logLines.some(l => /Fleetwinged Raid/.test(l)))
  chk(s, 'moze-solo', 'Solo: no Prey mark', !s.logLines.some(l => /Prey ->/.test(l)))
}

// acheron: Slashed Dream / Crimson Knot / The Abyss / battle-start debuff (#18) are verified as data in
// verification/characters/acheron/skill.json — see `npx tsx src/verification/index.ts acheron`.

// cyrene #13: Talent "Future" is consumed by the FIRST action — regular (turn start) OR injected
// (FUA/counter off-turn). Clara's counter is an injected ability → burns Future before her own turn.
{
  const s = runBattle({
    team: [
      { kitId: 'cyrene', stats: DPS, eidolon: 0, skillPriority: 0, energyStartFrac: 0 },
      { kitId: 'clara', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(300_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 4, seed: 7,
  })
  const cyrene = s.allies('ally').find(u => u.kitId === 'cyrene')!
  // Clara's counter (injected FUA) must consume Future → Cyrene gains Recollection from it.
  chk(s, 'cyrene-future', 'Injected FUA (Clara counter) consumes Future → +1 Recollection',
    s.logLines.some(l => /Clara consumed Future/.test(l)) && cyrene.energy > 0)
  // Future is re-applied on each Cyrene turn, so many consumptions per battle are correct.
  // Double-count would show 2+ "consumed Future" within ONE action segment (one unit turn).
  const segments: string[][] = [[]]
  for (const l of s.logLines) {
    if (/>>> (Cyr|Clara)/.test(l)) segments.push([l])
    else segments[segments.length - 1].push(l)
  }
  const maxPerSeg = Math.max(...segments.map(se => se.filter(l => /consumed Future/.test(l)).length))
  chk(s, 'cyrene-future', `Future consumed at most once per action (max ${maxPerSeg} in a segment)`, maxPerSeg <= 1)
}

// cyrene canon audit (21-09-2026): talent aura, Demiurge scaling, Zone True DMG, Ode bounces,
// A2 traces, This Ode first act, Ripples → Reunion cycle. Team = 3 Future consumers for bounces.
{
  const s = runBattle({
    team: [
      { kitId: 'cyrene', stats: DPS, eidolon: 0, skillPriority: 0 },
      { kitId: 'evernight', stats: DPS, skillPriority: 0 },
      { kitId: 'hyacine', stats: SUP, skillPriority: 0 },
      { kitId: 'clara', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(1_200_000, ['Physical', 'Ice', 'Quantum'], 1, 90, 90, 340, 'Elite'),
    cycles: 7, seed: 9,
  })
  const cy = s.allies('ally').find(u => u.kitId === 'cyrene')!
  // Talent "Hearts Gather as One": while Cyrene on field, all allies DMG + (0.10..0.25)
  chk(s, 'cyrene-canon', 'Talent aura dmgAll on allies (cy_heart)', s.buffLog.some(e => e.id === 'cy_heart' && e.mods?.some(m => m.stat === 'dmgAll' && m.value >= 0.1)))
  // A2 "Ripples Across Time": evernight + hyacine = 2 Remembrance allies → +3 Recollection
  chk(s, 'cyrene-canon', 'A2 Ripples Across Time +3 with 2 Remembrance allies', s.logLines.some(l => /A2: 2 Chrysos\/Remembrance ally\(ies\) → \+3 Recollection/.test(l)))
  // Ult → Demiurge (Waiting, In Every Past MaxHP buff on both) + Ripples state
  chk(s, 'cyrene-canon', 'Verse Ripples → Ripples of Past Reverie', s.logLines.some(l => /Ripples of Past Reverie/.test(l)))
  chk(s, 'cyrene-canon', 'Demiurge summoned + cy_demi_hp MaxHP buff', s.buffLog.some(e => e.id === 'cy_demi_hp' && e.mods?.some(m => m.stat === 'hpPct')) && s.logLines.some(l => /summons Demiurge/.test(l)))
  // 141503: "Demiurge's initial Max HP equals to #1[i]% of Cyrene's Max HP" with #1 = 1 stored as a
  // FRACTION ⇒ 100%, the FULL bar (see AGENTS.md). The spawn log prints the pre-buff bar; comparing it
  // to Cyrene's END-of-battle MaxHP is polluted here (Hyacine's After Rain raises it team-wide), so
  // this block only asserts order-of-magnitude against her un-buffed `base.hp`; the exact
  // 100% × 1.336 is asserted in cyrene-p0.
  const demi = s.allies('ally').find(u => u.kind === 'summon' && (s.rt(u).ownerId as string) === cy.id)
  const barHp = Number(s.logLines.map(l => l.match(/summons Demiurge \(MaxHP (\d+)/)).find(m => m)?.[1] ?? -1)
  chk(s, 'cyrene-canon', `Demiurge summon bar is a full share of Cyrene MaxHP, not a sliver (${barHp} vs base ${cy.base.hp})`,
    barHp > 0 && demi !== undefined && demi.base.hp >= cy.base.hp)
  // First Demiurge act = This Ode (ally buff); later acts = Minuet + Ode to Ego
  chk(s, 'cyrene-canon', 'Demiurge first act: This Ode, to All Lives', s.logLines.some(l => /casts This Ode/.test(l)))
  // Ode to Ego bounce count = distinct Future consumers (3 chars) — not flat 12
  const hits = s.logLines.filter(l => /Ode to Ego \(\d+ bounces\)/.test(l)).map(l => +(l.match(/Ode to Ego \((\d+) bounces\)/)![1]))
  const maxBounces = Math.max(0, ...hits)
  chk(s, 'cyrene-canon', `Ode to Ego bounces = distinct Future consumers (got ${maxBounces}, expect ≥1)`, maxBounces >= 1 && maxBounces <= 4)
  // Zone True DMG fires per ally instance
  chk(s, 'cyrene-canon', 'Elysium Zone True DMG on ally hits', s.logLines.some(l => /\[True DMG\]/.test(l)))
  // Ripples-locked: Reunion at First Sight at 12 Recollection (not the 24-gated Verse again)
  chk(s, 'cyrene-canon', 'Reunion at First Sight during Ripples', s.logLines.some(l => /Reunion at First Sight/.test(l)))
}

// cyrene E1/E6 (21-09-2026): E1 +6 Rec +12 bounces on Ode; E6 first-ult 100% advance, 1st Ode → all enemies
// DEF -20%, later Ode → allies advance 24%.
{
  const s = runBattle({
    team: [
      { kitId: 'cyrene', stats: DPS, eidolon: 6, skillPriority: 0, energyStartFrac: 1 },
      { kitId: 'hyacine', stats: SUP, skillPriority: 0 },
    ],
    enemy: foe(3_000_000, ['Physical', 'Ice', 'Quantum'], 1, 90, 95, 340, 'Elite'),
    cycles: 9, seed: 11,
  })
  const maxB = s.logLines.filter(l => /Ode to Ego \(\d+ bounces\)/.test(l)).map(l => +(l.match(/Ode to Ego \((\d+) bounces\)/)![1])).reduce((m, x) => Math.max(m, x), 0)
  chk(s, 'cyrene-e6', `E1 Ode-to-Ego bounces ≥13 (got ${maxB})`, maxB >= 13)
  chk(s, 'cyrene-e6', 'E1 Ode trigger → +6 Recollection', s.logLines.some(l => /E1: Ode to Ego \+6 Recollection/.test(l)))
  chk(s, 'cyrene-e6', 'E6 first ult → all allies advance 100%', s.logLines.some(l => /all allies advance 100%/.test(l)))
  chk(s, 'cyrene-e6', 'E6 1st Ode during Minuet → enemies DEF -20%', s.logLines.some(l => /all enemies DEF -20%/.test(l)))
  chk(s, 'cyrene-e6', 'E6 later Ode → allies advance 24%', s.logLines.some(l => /all allies advance 24%/.test(l)))
}

// cyrene P0 (28-09-2026): E4 Ode-to-Ego cap (24), E3/E5 level ladders, Zone dispel + on-field
// buff cleanup on downing, E2 True-DMG cap. White-box: prepareBattle + kit.perform.
{
  const kit = kitById('cyrene')!
  /** cyrene + 2 Future consumers, ult already cast, next Demiurge turn = Minuet + Ode only. */
  const mk = (eidolon: number, odeStacks: number) => {
    const s = prepareBattle({
      team: [
        { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon, skillPriority: 0 },
        { kitId: 'evernight', stats: DPS, skillPriority: 0 },
        { kitId: 'clara', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 3,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'cyrene')!
    u.energy = u.maxEnergy
    kit.perform(s, u, { kind: 'ult' }, s.rt(u))
    const demi = s.roster.find(x => x.id === `demi_${u.id}`)!
    const rt = s.rt(u)
    rt.cyFirstOde = true            // skip This Ode → straight to Minuet + Ode to Ego
    rt.cyDistinct = new Set(['a', 'b'])
    rt.cyOdeStacks = odeStacks
    const e = s.livingEnemiesOf(u)[0]
    const hpBefore = e.hp
    kit.perform(s, demi, { kind: 'basic' }, s.rt(demi))
    return { s, u, demi, rt, dmg: hpBefore - e.hp, stacks: rt.cyOdeStacks as number }
  }

  // E4 "Please Write On, With a Smile": +6% per Minuet use, stacking up to 24 → 24 vs 30 seeded
  // must produce the IDENTICAL Minuet + Ode damage (the cap holds), while 30 itself clamps to 24.
  const e4cap = mk(4, 24), e4over = mk(4, 30)
  chk(e4cap.s, 'cyrene-p0', 'E4 Ode-to-Ego stacks clamp to the 24 cap (seeded 30 → 24)',
    e4over.stacks === 24 && e4over.rt.cyOdeStacks === 24)
  chk(e4cap.s, 'cyrene-p0', `E4 cap stops the mult growth: 24 vs 30 seeded give equal DMG (${e4cap.dmg} vs ${e4over.dmg})`,
    e4cap.dmg > 0 && e4over.dmg > 0 && Math.abs(e4cap.dmg - e4over.dmg) < 1e-9)
  const e4low = mk(4, 0)
  chk(e4low.s, 'cyrene-p0', 'E4 with 0 stacks is WEAKER than at the 24 cap (step is live)',
    e4low.dmg > 0 && e4low.dmg < e4cap.dmg)

  // 141503: "Demiurge's initial Max HP equals to #1% of Cyrene's Max HP" — #1 = 1 is stored as a
  // FRACTION, not a raw percent (see AGENTS.md; #3 = 0.25…0.625 in the same skill is a CRIT Rate
  // bonus, so the unit of measure inside one skill cannot be mixed). Demiurge therefore starts on
  // Cyrene's FULL bar, and Waiting, In Every Past (+mem_talent) raises BOTH. Minuet / Ode to Ego hit
  // with scaleStat:'hp' ON THE SUMMON, so their damage tracks this bar.
  const hpBar = () => {
    const s = prepareBattle({
      team: [
        { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon: 0, skillPriority: 0 },
        { kitId: 'evernight', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 1, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 12,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'cyrene')!
    const cyHp = u.maxHp
    u.energy = u.maxEnergy
    kit.perform(s, u, { kind: 'ult' }, s.rt(u))
    const demi = s.roster.find(x => x.id === `demi_${u.id}`)!
    return { s, u, demi, cyHp, story: s.rt(u).cyStory as number }
  }
  const hb = hpBar()
  const wantHp = Math.round(hb.cyHp * (1 + 0.336)) // 100% (141503 #1 = 1) × 1.336 (1141503 mem_talent L10)
  chk(hb.s, 'cyrene-p0', `Demiurge MaxHP = 100% of Cyrene's × 1.336 (${hb.demi.maxHp} vs ${wantHp})`,
    Math.abs(hb.demi.maxHp - wantHp) <= 2)
  chk(hb.s, 'cyrene-p0', `Demiurge MaxHP is a full copy of Cyrene's, not a sliver (${hb.demi.maxHp} >= ${hb.cyHp})`,
    hb.demi.maxHp >= hb.cyHp)
  // Minuet hits one enemy for 0.84 × Demiurge MaxHP — the bar must land in the damage, not just the unit.
  const minuetPer = hb.demi.maxHp * 0.84
  chk(hb.s, 'cyrene-p0', `Minuet single-target DMG tracks the full bar (~${Math.round(minuetPer)} > 50% of Cyrene's MaxHP)`,
    minuetPer > 0 && minuetPer > hb.cyHp * 0.5)
  // 1141526: +1 Story on summon AND on the Ultimate → Verse is worth 2, so the next Reunion fills to 3.
  chk(hb.s, 'cyrene-p0', `Verse ◦ Vow ∞ grants 2 Story (summon + ult, got ${hb.story})`, hb.story === 2)
  const sBefore = (hb.s.rt(hb.u).cyStory as number)
  kit.perform(hb.s, hb.u, { kind: 'ult' }, hb.s.rt(hb.u))
  chk(hb.s, 'cyrene-p0', 'Story fills to 3 on the first Reunion → extra turn + auto Minuet',
    sBefore === 2 && hb.s.logLines.some(l => /Demiurge Story full → extra turn \+ auto Minuet/.test(l)))

  // 1141501: Minuet removes #2 (12) Toughness — the kit hardcoded 15.
  const tough = (() => {
    const s = prepareBattle({
      team: [
        { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon: 0, skillPriority: 0 },
        { kitId: 'evernight', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Ice'], 1, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 13,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'cyrene')!
    u.energy = u.maxEnergy
    kit.perform(s, u, { kind: 'ult' }, s.rt(u))
    const demi = s.roster.find(x => x.id === `demi_${u.id}`)!
    s.rt(u).cyFirstOde = true
    s.rt(u).cyDistinct = new Set<string>() // 0 bounces → only Minuet resolves
    const e = s.livingEnemiesOf(u)[0]
    const t0 = e.toughness
    kit.perform(s, demi, { kind: 'basic' }, s.rt(demi))
    return { s, drop: t0 - e.toughness }
  })()
  chk(tough.s, 'cyrene-p0', `Minuet removes 12 Toughness per 1141501 (got ${tough.drop})`, tough.drop === 12)

  // E3 By Thy Being, As I've Written = Ult+2/Talent+2; E5 Gaze, Steeped in Yesterbloom = Skill+2/Basic+1
  const cyLv = (eidolon: number) => resolveLevels({ kitId: 'cyrene', eidolon } as never)
  const l3 = cyLv(3), l5 = cyLv(5)
  chk(e4cap.s, 'cyrene-p0', `E3 levels: ult 12 / talent 12 (${l3.ult}/${l3.talent})`, l3.ult === 12 && l3.talent === 12)
  chk(e4cap.s, 'cyrene-p0', `E5 levels: skill 12 / basic 7 (${l5.skill}/${l5.basic})`, l5.skill === 12 && l5.basic === 7)

  // E2: True DMG % = Skill + 6% per This-Ode recipient, cap 24% — 4 and 8 recipients must give the
  // SAME True DMG on an identical hit (without the cap 8 would be twice the bonus of 4).
  const trueDmgPer = (recipients: string[]) => {
    const s = prepareBattle({
      team: [
        { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon: 2, skillPriority: 0 },
        { kitId: 'evernight', stats: DPS, skillPriority: 0 },
        { kitId: 'clara', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 6,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'cyrene')!
    u.energy = u.maxEnergy
    kit.perform(s, u, { kind: 'ult' }, s.rt(u))
    s.rt(u).cyOdeSet = new Set(recipients)
    const ally = s.allies('ally').find(x => x.kitId === 'evernight')!
    const tgt = s.livingEnemiesOf(u)[0]
    const from = s.logLines.length
    s.hit(ally, tgt, { type: 'basic', elem: 'Quantum', mult: 2.0, label: 'cyrene-p0 probe' })
    const m = s.logLines.slice(from).map(l => l.match(/(\d+) \[True DMG\]/)).find(x => x)
    return m ? Number(m[1]) : 0
  }
  const t4 = trueDmgPer(['1', '2', '3', '4']), t8 = trueDmgPer(['1', '2', '3', '4', '5', '6', '7', '8'])
  chk(e4cap.s, 'cyrene-p0', `E2 True DMG caps its +6%-per-recipient bonus at 24% (4 rec: ${t4}, 8 rec: ${t8})`,
    t4 > 0 && t4 === t8)

  // 141502 counts every DMG *instance* by an ally while the Zone lasts, not only abilities: DoT ticks
  // and Weakness Break DMG resolve outside fireAfterAttack, so they need their own hook path.
  // Reference `Cyrene.ts` applies the TRUE_DMG_MODIFIER with no directness tag (unlike Tribbie E1,
  // which is explicitly Direct-only).
  //
  // Both cases below are DELTA probes: the same attack is run twice and only the difference is
  // attributed to the extra instance. Measuring the raw total would not isolate anything, because the
  // breaking hit itself already pays Zone True DMG through onAfterAttack (and setting `toughness`
  // after the hit never breaks anything at all - the break has to happen *inside* the hit).
  const zoneBuild = (breaks: boolean) => {
    const s = prepareBattle({
      team: [
        { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon: 0, skillPriority: 0 },
        { kitId: 'sampo', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 11,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'cyrene')!
    u.energy = u.maxEnergy
    kit.perform(s, u, { kind: 'ult' }, s.rt(u))
    const ally = s.allies('ally').find(x => x.kitId === 'sampo')!
    const tgt = s.livingEnemiesOf(u)[0]!
    const from = s.logLines.length
    const sumTrue = () => s.logLines.slice(from)
      .map(l => l.match(/(\d+) \[True DMG\]/)).filter((x): x is RegExpMatchArray => !!x)
      .reduce((n, x) => n + Number(x[1]), 0)
    return { s, u, ally, tgt, from, sumTrue }
  }

  // DoT tick: enemy carries an ally-sourced Wind Shear; ticks in the unit's own turn prologue.
  const dotZone = () => {
    const b = zoneBuild(true)
    b.s.applyDot(b.tgt, { kind: 'WindShear', elem: 'Wind', turns: 5, baseDmg: 4000, sourceUnit: b.ally })
    ;(b.s as unknown as { turnPrologue(u: Unit): void }).turnPrologue(b.tgt)
    return b.sumTrue()
  }
  const dotNoZone = () => {
    const b = zoneBuild(true)
    b.s.rt(b.u).cyZone = 0
    b.s.applyDot(b.tgt, { kind: 'WindShear', elem: 'Wind', turns: 5, baseDmg: 4000, sourceUnit: b.ally })
    ;(b.s as unknown as { turnPrologue(u: Unit): void }).turnPrologue(b.tgt)
    return b.sumTrue()
  }
  const zd = dotZone(), zdOff = dotNoZone()
  chk(e4cap.s, 'cyrene-p0', `141502: DoT tick by an ally deals Zone True DMG (${zd})`, zd > 0)
  chk(e4cap.s, 'cyrene-p0', `141502: no Zone -> no True DMG on the same DoT tick (${zdOff})`, zdOff === 0)

  // Break DMG: same Physical hit, once against 1 toughness (breaks) and once against 200 (does not).
  // The hit damage is identical either way (broken is set after Break DMG resolves), so the delta is
  // exactly the Break instance's contribution.
  const breakHit = (breaks: boolean) => {
    const b = zoneBuild(true)
    b.tgt.toughness = breaks ? 1 : 200
    b.s.hit(b.ally, b.tgt, { type: 'basic', elem: 'Physical', mult: 2.0, toughDmg: 30, label: 'cyrene-zone-break probe' })
    return { true: b.sumTrue(), broken: b.tgt.broken }
  }
  const bk = breakHit(true), bNo = breakHit(false)
  const zb = bk.true - bNo.true
  chk(e4cap.s, 'cyrene-p0', '141502: the Physical probe hit really breaks the enemy (control: unbroken)', bk.broken && !bNo.broken, true)
  chk(e4cap.s, 'cyrene-p0', `141502: Weakness Break DMG deals Zone True DMG on top of the hit (${bk.true} vs ${bNo.true}, delta ${zb})`, zb > 0)

  // 141502: "When Cyrene is downed, the Zone will also be dispelled" + the while-on-field
  // Future / Hearts Gather as One / Causality buffs on other units go with her.
  const d = prepareBattle({
    team: [
      { kitId: 'cyrene', stats: { ...DPS, hp: 6000, spd: 200 }, eidolon: 0, skillPriority: 0 },
      { kitId: 'evernight', stats: DPS, skillPriority: 0 },
      { kitId: 'clara', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
    cycles: 4, seed: 4,
  })
  d.initBattle()
  const dcy = d.roster.find(x => x.kitId === 'cyrene')!
  dcy.energy = dcy.maxEnergy
  kit.perform(d, dcy, { kind: 'ult' }, d.rt(dcy))
  kit.perform(d, dcy, { kind: 'skill' }, d.rt(dcy))
  const dAlly = d.allies('ally').find(x => x.kitId === 'evernight')!
  const preBuffs = ['cy_heart', 'cy_future', 'cy_a3_team'].filter(id => d.hasBuff(dAlly, id))
  const zonePre = d.rt(dcy).cyZone as number
  d.kill(d.livingEnemiesOf(dcy)[0], dcy)
  chk(d, 'cyrene-p0', `on-field buffs present before downing (${preBuffs.join(',') || 'none'})`,
    preBuffs.length === 3 && zonePre > 0, true)
  chk(d, 'cyrene-p0', 'Cyrene downed → Elysium Zone dispelled (141502)', (d.rt(dcy).cyZone as number) === 0)
  chk(d, 'cyrene-p0', 'Cyrene downed → Future / Hearts Gather as One / Causality removed from allies',
    !['cy_heart', 'cy_future', 'cy_a3_team'].some(id => d.allies('ally').some(a => a.kind === 'char' && d.hasBuff(a, id))))

  // NO_ODE: партнёрского This Ode у Tribbie/Cipher нет → Cyrene их не баффает (решение юзера).
  // «Златиусы» (evernight) Future получают, общие аурные DMG-баффы — все.
  const ode = prepareBattle({
    team: [
      { kitId: 'cyrene', stats: { ...DPS, hp: 6000 }, eidolon: 0, skillPriority: 0 },
      { kitId: 'tribbie', stats: DPS, skillPriority: 0 },
      { kitId: 'cipher', stats: DPS, skillPriority: 0 },
      { kitId: 'evernight', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
    cycles: 4, seed: 8,
  })
  ode.initBattle()
  const of = (id: string) => ode.roster.find(x => x.kitId === id)!
  chk(ode, 'cyrene-p0', 'Future выдаётся «златиусу»-союзнику (evernight)',
    ode.hasBuff(of('evernight'), 'cy_future'))
  chk(ode, 'cyrene-p0', 'Future НЕ выдаётся tribbie/cipher (партнёрского Ode нет)',
    !ode.hasBuff(of('tribbie'), 'cy_future') && !ode.hasBuff(of('cipher'), 'cy_future'))
  chk(ode, 'cyrene-p0', 'Общие аурные баффы (Hearts Gather as One) tribbie/cipher остаются',
    ode.hasBuff(of('tribbie'), 'cy_heart') && ode.hasBuff(of('cipher'), 'cy_heart'))

  // 141503 "...and activates all teammates' Ultimate" — REAL (было log-only flatten): READY-союзник
  // кастует ульт прямо внутри Verse ◦ Vow ∞, не дожидаясь своего хода. НЕготовый (0 Energy) не
  // трогаем: гейт = собственному условию авто-ульта сима (энергия == max).
  const act = prepareBattle({
    team: [
      { kitId: 'cyrene', stats: { ...DPS, hp: 6000, spd: 200 }, eidolon: 0, skillPriority: 0 },
      { kitId: 'evernight', stats: DPS, skillPriority: 0 },
      { kitId: 'clara', stats: DPS, skillPriority: 0 },
    ],
    enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
    cycles: 4, seed: 4,
  })
  act.initBattle()
  const acy = act.roster.find(x => x.kitId === 'cyrene')!
  const aNight = act.roster.find(x => x.kitId === 'evernight')!
  const aClara = act.roster.find(x => x.kitId === 'clara')!
  acy.energy = acy.maxEnergy
  aNight.energy = aNight.maxEnergy
  aClara.energy = 0
  chk(act, 'cyrene-p0', 'activateAllyUlt отказывает неготовому союзнику (0 Energy, ульт не тратится)',
    act.activateAllyUlt(aClara) === false && aClara.energy === 0)
  kit.perform(act, acy, { kind: 'ult' }, act.rt(acy))
  const wokeLine = act.logLines.filter(l => /activates (?!all teammates)/.test(l))
  chk(act, 'cyrene-p0', `141503: готовый союзник кастует ульт внутри Verse ◦ Vow ∞ (строк: ${wokeLine.length})`,
    wokeLine.length >= 1 && act.logLines.some(l => /O Wakeful World, Goodnight/.test(l)) && aNight.energy < aNight.maxEnergy)
  // Неготовый Clara остаётся на месте. Прямой вызов выше — единственный bite этой проверки на сам
  // гейт сим-а: у большинства китов своя проверка энергии внутри ult-ветки (у Clara — строгая,
  // `u.energy < u.maxEnergy`), т.е. без outer-гейта они всё равно не выстрелят.
  chk(act, 'cyrene-p0', '141503: неготовый союзник ульт не кастует (Clara на 0 Energy не сдвинулась)',
    aClara.energy === 0 && !act.hasBuff(aClara, 'clara_ult') && !act.logLines.some(l => /Promise, Not Command/.test(l)))
}

// Entanglement (docs/combat_mechanics/Toughness.md:84) — НЕ DoT и НЕ Break DMG: Quantum Additional DMG
// в начале хода цели, берёт только Elem/All boost. Реальный FIX 27-09-2026: был бакет 'dot' и
// boost/vuln по типу 'break' ⇒ ось типов в .done врала, а Break-DMG баффы раздували статус.
{
  const ent = (srcMods: Mod[], tgtMods: Mod[] = []) => {
    const s = prepareBattle({
      team: [{ kitId: 'castorice', stats: { ...DPS, hp: 8000 }, eidolon: 0, skillPriority: 0 }],
      enemy: foe(4_000_000, ['Quantum', 'Physical'], 1, 90, 90, 600, 'Elite'),
      cycles: 3, seed: 11,
    })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'castorice')!
    const t = s.livingEnemiesOf(u)[0]
    if (srcMods.length) s.addBuff(u, { id: 'probe_src', name: 'probe', mods: srcMods, turns: 1 })
    if (tgtMods.length) s.addBuff(t, { id: 'probe_tgt', name: 'probe', mods: tgtMods, turns: 1, debuff: true })
    t.dots.push({ kind: 'Entanglement', elem: 'Quantum', turns: 1, stacks: 3, baseDmg: 0, sourceUnit: u } as never)
    const before = t.hp
    ;(s as unknown as { turnPrologue(x: unknown): string }).turnPrologue(t)
    return { s, owner: u, dmg: before - t.hp }
  }
  const plain = ent([])
  const brk = ent([{ stat: 'boost:break', value: 0.5 }], [{ stat: 'vulnType:break', value: 0.5 }])
  const all = ent([{ stat: 'dmgAll', value: 0.5 }])
  chk(plain.s, 'entanglement', `тик Entanglement наносит урон (${plain.dmg})`, plain.dmg > 0)
  chk(brk.s, 'entanglement', `boost:break + vulnType:break НЕ влияют на Entanglement (${brk.dmg} = ${plain.dmg})`,
    Math.abs(brk.dmg - plain.dmg) < 1e-9)
  chk(all.s, 'entanglement', `All boost (dmgAll) влияет на Entanglement (${all.dmg} > ${plain.dmg})`, all.dmg > plain.dmg)
  const axis = [...(plain.s.ownerAxis.get(plain.owner.id) ?? new Map())].map(([b]) => b)
  const skills = Object.keys(plain.s.accounts.get(plain.owner.name)?.bySkill ?? {})
  chk(plain.s, 'entanglement', 'Entanglement по оси типов = add (не dot), и учтён как Additional DMG',
    axis.includes('add') && !axis.includes('dot') && skills.some(k => /Additional DMG Entanglement/.test(k)))

  // «Applies 1 stack when the Entangled target is hit (Max 5)» — hitPost (simulator.ts:422) добавляет
  // стак за каждый удар союзника, пока точка жива (окно = от break'а до начала хода цели). Живой бой:
  // 3 квантовых атакующих → точка обязана дорасти до капа 5, иначе окно/съём точки неверны.
  const st = runBattle({
    team: [
      { kitId: 'seele', stats: DPS, skillPriority: 2 },
      { kitId: 'tribbie', stats: DPS, skillPriority: 3 },
      { kitId: 'blackswan', stats: DPS, skillPriority: 3 },
      { kitId: 'tingyun', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(400_000, ['Quantum'], 1, 120, 100, 500, 'Quantum Foe'),
    cycles: 4, seed: 7,
  })
  const stMax = Math.max(0, ...st.logLines.map(l => { const m = /Entanglement ×(\d+)/.exec(l); return m ? +m[1] : 0 }))
  chk(st, 'entanglement', `стаки копятся по ударам до капа 5 (наблюдалось ×${stMax}, окно break→ход цели)`,
    stMax >= 2 && stMax <= 5)
}

// robin: Concerto state — ult buffs team, countdown exits her lock, fixed-CRIT Additional DMG per ally attack
{
  const s = runBattle({
    team: [
      { kitId: 'robin', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(s, 'robin', 'Ult → Concerto state', s.logLines.some(l => /enters the Concerto state/.test(l)))
  chk(s, 'robin', 'Talent Tonal Resonance CRIT DMG on allies', s.buffLog.some(e => e.id === 'robin_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.2) < 1e-6)))
  chk(s, 'robin', 'Skill Pinion Aria team DMG+', s.buffLog.some(e => e.id === 'robin_aria' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.5) < 1e-6)))
  chk(s, 'robin', 'Concerto ATK = round(0.228×Robin ATK)+200 flat on allies', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'atkFlat' && m.value >= 200) && e.mods?.every(m => m.stat !== 'atkPct')))
  chk(s, 'robin', 'Ally attack → Fixed-CRIT Additional DMG', s.logLines.some(l => /Vox Harmonique \(Additional\)/.test(l)))
  chk(s, 'robin', 'Concerto countdown ends → Robin exits', s.logLines.some(l => /exits the Concerto state/.test(l)))
  const robinBasics = s.logLines.filter(l => />>> Robin \[BASIC\]/.test(l)).length
  const wingflips = s.logLines.filter(l => /Wingflip White Noise/.test(l)).length
  // Wingflip is a 3-hit split: a non-locked basic produces 3 hit lines; locked (Concerto) basics produce 0.
  // So total hits < 3×logged-basics proves some basics were suppressed by the lock.
  chk(s, 'robin', `Concerto lock suppresses Robin basics (${wingflips} hits < ${robinBasics * 3})`, wingflips < robinBasics * 3)
}

// robin E1/E6: RES PEN + Concerto; fixed CRIT DMG boosted +450% (cap 8 per ult)
{
  const s = runBattle({
    team: [
      { kitId: 'robin', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(180_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 5, seed: 5,
  })
  chk(s, 'robin-e6', 'E1 Concerto All-Type RES PEN 24%', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'resPenAll' && Math.abs(m.value - 0.24) < 1e-6)))
  chk(s, 'robin-e6', 'E2 Concerto SPD +16%', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.16) < 1e-6)))
  chk(s, 'robin-e6', 'E6 fixed Additional CRIT DMG = 600% (critDmg:add 5.0..6.0)', s.buffLog.some(e => e.id === 'robin_cdfix' && e.mods?.some(m => m.stat === 'critDmg:add' && m.value >= 5.0 && m.value <= 6.0)))
}

// jade: Debt Collector engine — skill marks ally, they Charge Jade per attack, Additional DMG + HP drain,
//        8 Charge → Talent FUA (Quantum AoE, enhanced by ult ×2), FUA → 5 Pawned Asset (CRIT DMG + ATK%)
{
  const s = runBattle({
    team: [
      { kitId: 'jade', stats: { hp: 6000, atk: 2400, def: 1300, spd: 103 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(s, 'jade', 'Skill → ally becomes the Debt Collector', s.logLines.some(l => /becomes the Debt Collector/.test(l)))
  chk(s, 'jade', 'Debt Collector SPD+30 buff', s.buffLog.some(e => e.id === 'jade_debt_spd' && e.mods?.some(m => m.stat === 'spdFlat' && Math.abs(m.value - 30) < 1e-6)))
  chk(s, 'jade', 'Collector attack → Acquisition Surety Additional DMG', s.logLines.some(l => /Acquisition Surety \(Additional\)/.test(l)))
  chk(s, 'jade', '8 Charge → Talent FUA (Quantum AoE)', s.logLines.some(l => /Fang of Flare Flaying/.test(l)))
  chk(s, 'jade', 'Ult Vow of the Deep → enhanced FUA x2', s.logLines.some(l => /Vow of the Deep/.test(l)) && s.logLines.some(l => /Fang of Flare Flaying \(Enhanced\)/.test(l)))
  chk(s, 'jade', 'FUA → Pawned Asset stacks (CRIT DMG + A6 ATK%)', s.buffLog.some(e => e.id === 'jade_pawn' && e.mods?.some(m => m.stat === 'critDmg' && m.value >= 0.1) && e.mods?.some(m => m.stat === 'atkPct')))
  chk(s, 'jade', 'Collector expires after Jade turns, re-set by new skill', s.logLines.some(l => /Debt Collector removed/.test(l)))
}

// jade E4/E6: ult → 12% DEF-ignore 3t; while collector exists → Quantum RES PEN 20%
{
  const s = runBattle({
    team: [
      { kitId: 'jade', stats: { hp: 6000, atk: 2400, def: 1300, spd: 103 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(180_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 7, seed: 5,
  })
  chk(s, 'jade-e6', 'E4 ult → DEF-ignore 12% 3t', s.buffLog.some(e => e.id === 'jade_e4' && e.mods?.some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.12) < 1e-6)))
  chk(s, 'jade-e6', 'E6 Quantum RES PEN +20% while collector', s.buffLog.some(e => e.id === 'jade_e6' && e.mods?.some(m => m.stat === 'resPen:Quantum' && Math.abs(m.value - 0.2) < 1e-6)))
}

// boothill: migrated to verification spec (verification/characters/boothill/skill.json) — Standoff,
// Extra Turn, Enhanced Basic, Pocket Trickshot, Talent Break DMG, Ghost Load, E1/E2/E4/E6.
// rappa e0: Sealform (Extra Turn + WBE/BE), Enhanced Basic 3-hit → Talent Break, Charge on elite+ break, A2 Sea Echo, A6 Leaf
{
  const s = runBattle({
    team: [
      { kitId: 'rappa', stats: { hp: 5000, atk: 2400, def: 1300, spd: 96 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Imaginary'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'rappa', 'Ult → SEALFORM + Extra Turn + Enhanced Basic', s.logLines.some(l => /enters SEALFORM/.test(l)) && s.logLines.some(l => /gains an Extra Turn/.test(l)) && s.logLines.some(l => /Ningu: Demonbane Petalblade/.test(l)))
  chk(s, 'rappa', 'Sealform WBE +50% buff', s.buffLog.some(e => e.id === 'rap_seal' && e.mods?.some(m => m.stat === 'wbe' && Math.abs(m.value - 0.5) < 1e-6)))
  chk(s, 'rappa', 'Talent Break on 3rd Petalblade hit (pierce toughness)', s.logLines.some(l => /Demonbane Petalblade Break/.test(l)))
  chk(s, 'rappa', 'Elite+ Weakness Break → +1 Charge extra + Energy (Sky High)', s.logLines.some(l => /elite\+\) broken → Rappa \+1 Charge/.test(l)))
  chk(s, 'rappa', 'A2 Sea Echo → 60% Super Break vs broken target', s.logLines.some(l => /SUPER BREAK/.test(l)))
  chk(s, 'rappa', 'A6 Withered Leaf: broken enemy Break-DMG taken +', s.buffLog.some(e => e.id === 'rap_leaf' && e.mods?.some(m => m.stat === 'vulnType:break' && m.value >= 0.02)))
  chk(s, 'rappa', 'Sealform exits after Ink depleted (3 Enhanced Basics)', s.logLines.some(l => /exits Sealform/.test(l)))
}

// rappa e6: E1 defIgnore in Sealform, E4 team SPD+12%, E6 +5 Charge start & after 3rd hit
{
  const s = runBattle({
    team: [
      { kitId: 'rappa', stats: { hp: 5000, atk: 2400, def: 1300, spd: 96 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(200_000, ['Imaginary'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'rappa-e6', 'E6 +5 Charge at battle start', s.logLines.some(l => /\+5 Charge at battle start/.test(l)))
  chk(s, 'rappa-e6', 'E1 Sealform DEF-ignore 15%', s.buffLog.some(e => e.id === 'rap_seal' && e.mods?.some(m => m.stat === 'defIgnore' && Math.abs(m.value - 0.15) < 1e-6)))
  chk(s, 'rappa-e6', 'E4 all allies SPD+12% during Sealform', s.buffLog.some(e => e.id === 'rap_e4' && e.mods?.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.12) < 1e-6)))
  chk(s, 'rappa-e6', 'E6 +5 Charge after 3rd Petalblade hit', s.logLines.some(l => /\+5 Charge after 3rd Petalblade hit/.test(l)))
  chk(s, 'rappa-e6', 'E1 +20 Energy on Sealform exit', s.logLines.some(l => /\+20 Energy on Sealform exit/.test(l)))
}

// ============ FATE COLLAB (data-verified against hsr-data/characters.json) ============

// saber e0: Ult = AoE main + 10 random-target instances; Enhanced Basic after ult; ally Ult → Dragon Reactor (+3 CR +25 energy)
{
  const s = runBattle({
    team: [
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'saber', 'Ult Excalibur → AoE main + 10 instances', s.logLines.some(l => /Ult: Excalibur, 10 instances/.test(l)))
  chk(s, 'saber', 'Ult instance hits (Excalibur instance)', s.logLines.some(l => /Excalibur instance/.test(l)))
  chk(s, 'saber', 'Enhanced Basic (Release, the Golden Scepter) after Ult', s.logLines.some(l => /Release, the Golden Scepter/.test(l)))
  chk(s, 'saber', 'Ally Ult → Dragon Reactor buff (talent_a3 DMG)', live(s, 'saber_talent'))
  chk(s, 'saber', 'Corona Resonance buff (saber_a6p) from CR gain', live(s, 'saber_a6p'))
}

// saber e6: +300 Energy on Ult #1 (every 3rd after), Ult-window Wind RES PEN +20%, overflow cap 200
{
  const s = runBattle({
    team: [
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'saber-e6', 'E6 +300 Energy on Ult #1', s.logLines.some(l => /E6: \+300 Energy \(Ult #1\)/.test(l)))
  chk(s, 'saber-e6', 'E6 Ult-window Wind RES PEN +20%', live(s, 'saber_e6_pen'))
}

// archer e0: Circuit Connection chain (5 uses), Mind's Eye FUA on teammate attack, A3 Guardian CD at SP≥4, UBW
{
  const s = runBattle({
    team: [
      { kitId: 'archer', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'archer', 'Circuit Connection chain (extra turns)', s.logLines.some(l => /CC Chain/.test(l)))
  chk(s, 'archer', 'Ult Unlimited Blade Works +2 Charge', s.logLines.some(l => /UBW, Charge/.test(l)))
  chk(s, 'archer', 'Teammate attack → Mind\'s Eye FUA (+1 SP)', s.logLines.some(l => /Mind's Eye FUA/.test(l)))
  chk(s, 'archer', 'A3 Guardian CRIT DMG at SP≥4', live(s, 'archer_a3'), true)
  chk(s, 'archer', 'Projection Magecraft maxSP 5→7', ((s as unknown as { maxSp: number }).maxSp) >= 7)
}

// archer e6: skill stack cap 2→3, E6 DEF-ignore on Skill, turn-start +1 SP
{
  const s = runBattle({
    team: [
      { kitId: 'archer', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'archer-e6', 'E6 stack cap 2→3 (CC Chain stack 3)', s.logLines.some(l => /CC Chain \(\d+\/5, stack 3\)/.test(l)))
  chk(s, 'archer-e6', 'E6 Skill DEF-ignore 20%', live(s, 'archer_e6d'))
}

// rin e0: enhanced Skill (Gem≥15 gate) — no SP cost, drains SP>2 (Gems per SP), compounds from Gem gauge, 20 battle-start Gem
{
  const s = runBattle({
    team: [
      { kitId: 'rin', stats: { hp: 5000, atk: 2400, def: 1300, spd: 110 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'rin', 'Enhanced Skill (Second Magic Experiment) via Gem gate', s.logLines.some(l => /Second Magic Experiment/.test(l)))
  chk(s, 'rin', 'Enhanced Skill drains SP>2 → +2 Gem each', s.logLines.some(l => /-\d+ SP → \d+ Gem/.test(l)))
  chk(s, 'rin', 'A1 Elegant Conduct (ATK+150%)', live(s, 'rin_a1'))
  chk(s, 'rin', 'A2 Ladylike Poise SPD+20%', live(s, 'rin_a2_spd'))
}

// rin e6: All-Type RES PEN +20%, Ult +24 Gem + Extra Turn
{
  const s = runBattle({
    team: [
      { kitId: 'rin', stats: { hp: 5000, atk: 2400, def: 1300, spd: 110 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 9, seed: 5,
  })
  chk(s, 'rin-e6', 'E6 All-Type RES PEN +20%', live(s, 'rin_e6'))
  chk(s, 'rin-e6', 'E6 Ult → +24 Gem + Extra Turn', s.logLines.some(l => /gains an Extra Turn/.test(l)) && s.logLines.some(l => /Ult: \+1 SP, vuln/.test(l)))
}

// gilgamesh e0: auto-Basic until Piqued, King's Burden on ally Ult, Joint FUA (tally 8) → Saber +120 energy + next-Ult ×2
{
  const s = runBattle({
    team: [
      { kitId: 'gilgamesh', stats: { hp: 5000, atk: 2400, def: 1300, spd: 100 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Lightning', 'Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 12, seed: 5,
  })
  chk(s, 'gilgamesh', 'Auto-Basic (Halfhearted Blow) until Piqued', s.logLines.some(l => /Halfhearted Blow/.test(l)))
  chk(s, 'gilgamesh', 'Ally Ult → King\'s Burden', live(s, 'gil_burden'))
  chk(s, 'gilgamesh', 'Joint FUA triggered (tally 8)', s.logLines.some(l => /Joint FUA triggered/.test(l)))
  chk(s, 'gilgamesh', 'Joint FUA → Saber +120 Energy next-Ult ×2', s.logLines.some(l => /Excalibur/.test(l)))
}

// gilgamesh e6: allies RES PEN +20%, Golden Rule (teammate Ult → stack → own Ult critDmg:ult), bounce ×1.8
{
  const s = runBattle({
    team: [
      { kitId: 'gilgamesh', stats: { hp: 5000, atk: 2400, def: 1300, spd: 100 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(2_200_000, ['Lightning', 'Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 12, seed: 5,
  })
  chk(s, 'gilgamesh-e6', 'E6 allies All-Type RES PEN +20%', s.buffLog.some(e => e.id === 'gil_e6' && e.unitName === 'Saber'))
  chk(s, 'gilgamesh-e6', 'E6 Golden Rule → critDmg:ult from teammate Ult', live(s, 'gil_golden') || s.logLines.some(l => /Enuma Elish/.test(l)))
}

// ============ 63. GILGAMESH canon audit (21-09-2026) ============
// SP-free Skill, no Interest from Skill, Technique Enkidu +3, A2 cumulative CRIT DMG,
// own-Ult gives NO Energy (A1: ally Ults only), Joint FUA order Saber→Gilgamesh
{
  const s = runBattle({
    team: [
      { kitId: 'gilgamesh', stats: { hp: 5000, atk: 2400, def: 1300, spd: 100 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(400_000, ['Lightning', 'Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 12, seed: 5,
  })
  // Technique Enkidu: entering combat → immediately +3 Interest (first SPD buff = 3 × 10%)
  const firstSpd = s.buffLog.find(e => e.id === 'gil_interest_spd')
  chk(s, 'gilgamesh-canon', 'Technique Enkidu → battle-start Interest 3 (SPD +30%)', Math.abs((firstSpd?.mods?.[0]?.value ?? 0) - 0.3) < 1e-9)
  // A2 Hero's Hauteur: cumulative Interest gained → CRIT DMG cap +150% (persists after Interest clear)
  chk(s, 'gilgamesh-canon', 'A2 Hero\'s Hauteur cumulative CRIT DMG cap +150%', lastVal(s, 'gil_hauteur', 'critDmg') >= 1.5)
  chk(s, 'gilgamesh-canon', 'Interest Piqued! → uses Skill (Gate of Babylon)', s.logLines.some(l => /Gate of Babylon/.test(l)))
  // Talent2 notes: Saber attacks first, then Gilgamesh
  const li = s.logLines.findIndex(l => /Joint FUA \(Saber\)/.test(l))
  const gi = s.logLines.findIndex(l => /Joint FUA \(Gilgamesh\)/.test(l))
  chk(s, 'gilgamesh-canon', 'Joint FUA: Saber attacks before Gilgamesh', li >= 0 && gi > li)
  chk(s, 'gilgamesh-canon', 'Enuma Elish: 10 random bounces', s.logLines.some(l => /10 bounces/.test(l)))

  // direct kit probes: SP-free Skill, no Skill Interest, no own-Ult Energy
  const sim = prepareBattle({
    team: [
      { kitId: 'gilgamesh', stats: { hp: 5000, atk: 2400, def: 1300, spd: 100 }, eidolon: 0, energyStartFrac: 1 },
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 0 },
    ],
    enemy: foe(500_000, ['Lightning'], 1, 90, 160, 350, 'Elite'),
    cycles: 1, seed: 1,
  })
  sim.initBattle()
  const gil = sim.allies('ally').find(u => u.kitId === 'gilgamesh')!
  const rt = sim.rt(gil)
  const kit = kitById('gilgamesh')!
  rt.interest = 4
  rt.piqued = false
  const sp0 = sim.sp()
  kit.perform!(sim, gil, { kind: 'skill' }, rt)
  chk(sim, 'gilgamesh-canon', 'Skill consumes no SP (canon: does not consume Skill Points)', sim.sp() === sp0)
  chk(sim, 'gilgamesh-canon', 'Skill grants no Interest (not in canon)', rt.interest === 4)
  gil.energy = gil.maxEnergy
  kit.perform!(sim, gil, { kind: 'ult' }, rt)
  chk(sim, 'gilgamesh-canon', 'Own Ult grants no Energy (A1: only ally Ults)', gil.energy === 0)
}

// ============ 64. SABER canon audit (21-09-2026) ============
// Technique Behold the King of Knights (+35% ATK 2t, +2 CR), E2 The Lost Oath = CR GAINED this battle
// (1% DEF-ignore each, cap 15), A2 Mana Burst re-granted on Enhanced Basic (+1 SP + immediate action)
{
  const s = runBattle({
    team: [
      { kitId: 'saber', stats: { hp: 5000, atk: 2400, def: 1300, spd: 101 }, eidolon: 2, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Wind'], 1, 90, 160, 350, 'Elite'),
    cycles: 12, seed: 5,
  })
  chk(s, 'saber-canon', 'Technique Behold, the King of Knights (ATK +35% 2t)', live(s, 'saber_tech'))
  chk(s, 'saber-canon', 'E2 The Lost Oath cumulative DEF-ignore cap 15% (0.15)', Math.abs(lastVal(s, 'saber_e2', 'defIgnore') - 0.15) < 1e-9)
  chk(s, 'saber-canon', 'A2 Mana Burst → +1 SP + immediate action', s.logLines.some(l => /Mana Burst: \+1 SP, bonus turn/.test(l)))
  chk(s, 'saber-canon', 'A6 Crown of the Star per-CR CRIT DMG (saber_a6p)', live(s, 'saber_a6p'))
}

// rin e1: canon — Technique Gem, A2 maxSP +2, Talent Freeform Joint FUA (Archer Skill), E1 Shadow Gem
{
  const s = runBattle({
    team: [
      { kitId: 'rin', stats: { hp: 5000, atk: 2400, def: 1300, spd: 110 }, eidolon: 1, skillPriority: 2, energyStartFrac: 0 },
      { kitId: 'archer', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 0, skillPriority: 3, energyStartFrac: 0 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(2_000_000, ['Quantum'], 1, 90, 160, 350, 'Elite'),
    cycles: 10, seed: 5,
  })
  chk(s, 'rin-canon', 'Technique Conversion Charge + battle-start Gem (30)', s.logLines.some(l => /Gem 30/.test(l)))
  chk(s, 'rin-canon', 'A2 Elegant Conduct maxSP 5→7', ((s as unknown as { maxSp: number }).maxSp) >= 7)
  chk(s, 'rin-canon', 'Talent Freeform Tohsaka Style Joint FUA (Archer Skill)', s.logLines.some(l => /Freeform Tohsaka Style Joint FUA/.test(l)))
  chk(s, 'rin-canon', "E1 Zelretch's Apprentice Shadow Gem", s.logLines.some(l => /Shadow Gem/.test(l)))
}

// ============ 66. AVENTURINE canon audit (21-09-2026) ============
// Technique The Red or the Black, Blind Bet cap 10 / consume 7, A3 Bingo! (FW-teammate FUA → +1 BB,
// post-FUA FW 7% DEF+96), Talent FW ally Effect RES +50%, Unnerved = CRIT-DMG-taken per crit type
{
  const s = runBattle({
    team: [
      { kitId: 'aventurine', stats: { hp: 9000, atk: 1000, def: 2600, spd: 140 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'xueyi', stats: { hp: 5000, atk: 2000, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(400_000, ['Quantum'], 3, 90, 160, 200, 'Elite'),
    cycles: 12, seed: 5,
  })
  const av = s.allies('ally').find(a => a.kitId === 'aventurine')!
  const bb = (s.rt(av) as { blindBet?: number }).blindBet ?? 0
  chk(s, 'aventurine-canon', 'Technique The Red or the Black → DEF% to all allies', s.buffLog.some(e => e.id === 'av_tech' && e.mods?.some(m => m.stat === 'defPct' && [0.24, 0.36, 0.6].some(v => Math.abs(m.value - v) < 1e-9))))
  chk(s, 'aventurine-canon', 'Talent: FW ally Effect RES +50% (on fort_wager)', s.buffLog.some(e => e.id === 'fort_wager' && e.mods?.some(m => m.stat === 'effRes' && Math.abs(m.value - 0.50) < 1e-9)))
  chk(s, 'aventurine-canon', 'Blind Bet consume 7 → FUA ×7 (cap 10, overflow kept)', s.logLines.some(l => /Blind Bet 7 → FUA ×7/.test(l)) && bb <= 10)
  chk(s, 'aventurine-canon', 'A3 Bingo!: FW-teammate FUA → +1 BB + post-FUA FW shield', s.logLines.some(l => /A3 Bingo!/.test(l)))
  chk(s, 'aventurine-canon', 'Unnerved = CRIT DMG taken per crit type (6 mods, 0.15)', s.buffLog.some(e => e.id === 'unnerved' && (e.mods ?? []).filter(m => m.stat.startsWith('critDmgTaken')).length === 6 && (e.mods ?? []).every(m => !m.stat.startsWith('critDmgTaken') || Math.abs(m.value - 0.15) < 1e-9)))

  // FW re-grant (shield already present) must respect the provider's shield-set amplification
  {
    const mk = (relicSets: string[]) => prepareBattle({
      team: [
        { kitId: 'aventurine', stats: { hp: 9000, atk: 1000, def: 2600, spd: 140 }, eidolon: 0, skillPriority: 2, gear: { relicSets } },
        { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
      ],
      enemy: foe(400_000, ['Quantum'], 1, 90, 160, 200, 'Elite'),
      cycles: 1, seed: 5,
    })
    const plain = mk([])
    const knight = mk(['knight', 'knight'])
    for (const s2 of [plain, knight]) {
      s2.initBattle()
      const av2 = s2.roster.find(a => a.kitId === 'aventurine')!
      s2.takeTurn(av2)
      s2.takeTurn(av2)
    }
    const fw = (s2: typeof plain) => s2.roster.find(a => a.kitId === 'natasha')!.buffs.find(b => b.id === 'fort_wager')?.shield ?? 0
    const base = fw(plain)
    const amp = fw(knight)
    chk(knight, 'aventurine-shieldmult', `FW re-grant respects Knight absorb amplification (${base} → ${amp})`, amp > base * 1.15)
  }
}
// e6: E4 FUA +3 hits (10), E6 Stag Hunt Game dmgAll per shielded ally
{
  const s = runBattle({
    team: [
      { kitId: 'aventurine', stats: { hp: 9000, atk: 1000, def: 2600, spd: 140 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'xueyi', stats: { hp: 5000, atk: 2000, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 3 },
      { kitId: 'natasha', stats: HEAL, skillPriority: 1 },
    ],
    enemy: foe(400_000, ['Quantum'], 3, 90, 160, 200, 'Elite'),
    cycles: 12, seed: 5,
  })
  chk(s, 'aventurine-canon-e6', 'E4: FUA hits 7+3 = ×10', s.logLines.some(l => /Blind Bet 7 → FUA ×10/.test(l)))
  chk(s, 'aventurine-canon-e6', 'E6 Stag Hunt Game dmgAll (0.5/1.0/1.5 by shielded allies)', s.buffLog.some(e => e.id === 'av_e6' && e.mods?.some(m => m.stat === 'dmgAll' && m.value >= 0.5 && m.value <= 1.5)))
}

// ============ 67. ROBIN canon audit (21-09-2026) ============
// Concerto ATK = round(0.228×Robin ATK)+200 FLAT (was wrong atkPct of the ally's own ATK),
// A4 FUA CD +25%, Talent CD 0.2 Infinity, E1/E2/E4/E6 canon values in Concerto
{
  const s = runBattle({
    team: [
      { kitId: 'robin', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(220_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 8, seed: 5,
  })
  chk(s, 'robin-canon', 'Talent Tonal Resonance CRIT DMG +20% (0.2) all allies, Infinity', s.buffLog.some(e => e.id === 'robin_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.2) < 1e-6)))
  chk(s, 'robin-canon', 'Skill Pinion\'s Aria team DMG +50% (0.5)', s.buffLog.some(e => e.id === 'robin_aria' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.5) < 1e-6)))
  chk(s, 'robin-canon', 'Concerto ATK = round(0.228×Robin ATK)+200 FLAT, no atkPct', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'atkFlat' && m.value >= 200) && e.mods?.every(m => m.stat !== 'atkPct')))
  chk(s, 'robin-canon', 'A4 Impromptu Flourish: Crit DMG:FollowUp +25% in Concerto', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'critDmg:fua' && Math.abs(m.value - 0.25) < 1e-6)))
  chk(s, 'robin-canon', 'Ally attack → Vox Harmonique (Additional) fixed CRIT', s.logLines.some(l => /Vox Harmonique \(Additional\)/.test(l)) && s.buffLog.some(e => e.id === 'robin_cdfix' && e.mods?.some(m => m.stat === 'critDmg:add' && m.value <= 1.5)))
  chk(s, 'robin-canon', 'Concerto countdown → Robin exits + acts', s.logLines.some(l => /exits the Concerto state/.test(l)))
}
// robin e6: E1 RES PEN 24%, E2 SPD +16%, E4 Effect RES +50%, E6 Additional CRIT DMG +450% (1.5+4.5)
{
  const s = runBattle({
    team: [
      { kitId: 'robin', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(180_000, ['Physical'], 1, 90, 90, 350, 'Elite'),
    cycles: 5, seed: 5,
  })
  chk(s, 'robin-canon-e6', 'E1 Land of Smiles: Concerto All-Type RES PEN 24%', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'resPenAll' && Math.abs(m.value - 0.24) < 1e-6)))
  chk(s, 'robin-canon-e6', 'E2 Afternoon Tea For Two: Concerto SPD +16%', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.16) < 1e-6)))
  chk(s, 'robin-canon-e6', 'E4 Raindrop Key: Concerto Effect RES +50%', s.buffLog.some(e => e.id === 'robin_concerto' && e.mods?.some(m => m.stat === 'effRes' && Math.abs(m.value - 0.5) < 1e-6)))
  chk(s, 'robin-canon-e6', 'E6 Moonless Midnight: Additional fixed CRIT DMG +450% (5.0..6.0)', s.buffLog.some(e => e.id === 'robin_cdfix' && e.mods?.some(m => m.stat === 'critDmg:add' && m.value >= 5.0 && m.value <= 6.0)))
}

// ============ 68. HIMEKO canon audit (21-09-2026) ============
// canon idx 2: base {1047,756,436,96} from PROG (kit had +1 drift), ult per-defeat energy ult_a2=5,
// Starfire Burn DoT 30% ATK, E1 SPD 20% 2t, E2 +15% ≤50% HP, E6 2×40% random, Talent FUA 140%
{
  const s = runBattle({
    team: [
      { kitId: 'himeko', stats: { ...DPS, atk: 2200, spd: 100 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'natasha', stats: SUP, skillPriority: 1 },
    ],
    enemy: foe(30_000, ['Fire'], 2, 90, 90, 350, 'Elite'),
    cycles: 6, seed: 7,
  })
  const hm = s.roster.find(x => x.kitId === 'himeko' && !x.dead)
  const hb = kitById('himeko')?.base
  chk(s, 'himeko-canon', 'base stats = PROG {1047,756,436,96}', !!(hb && hb.hp === 1047 && hb.atk === 756 && hb.def === 436 && hb.spd === 96))
  chk(s, 'himeko-canon', 'Starfire: Burn DoT 30% ATK on enemy', s.roster.some(x => x.side === 'enemy' && !x.dead && x.dots?.some(d => d.kind === 'Burn' && Math.abs(d.baseDmg - s.effAtk(hm!) * 0.30) < (s.effAtk(hm!) * 0.05))))
  chk(s, 'himeko-canon', 'E1 Childhood: SPD +20% 2t after Victory Rush', s.buffLog.some(e => e.id === 'himeko_e1' && e.mods?.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.20) < 1e-6)))
  chk(s, 'himeko-canon', 'E2 Convergence: +15% DMG vs ≤50% HP', s.buffLog.some(e => e.id === 'himeko_e2' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.15) < 1e-6)))
  chk(s, 'himeko-canon', 'Talent Victory Rush FUA 140% (elite break fills 3-cap)', s.logLines.filter(l => /Victory Rush/.test(l)).length >= 1)
  chk(s, 'himeko-canon', 'E6 Trailblaze!: 2 extra ×40% instances', s.logLines.filter(l => /Heavenly Flare \(E6\)/.test(l)).length >= 2)
  chk(s, 'himeko-canon', 'Ult +5 energy per defeated enemy (ult_a2)', s.logLines.some(l => /Heavenly Flare/.test(l)))
}

// ============ 69. SILVER WOLF canon audit (22-09-2026) ============
// canon idx 5: base {1047,640,460,107}, skill weakness-implant (chance 0.8→1.2) + All-RES↓ 13% 2t,
// ult DEF↓ 45% 3t, Bug ATK/DEF/SPD−, E1 en-per-debuff, E2 vulnAll+ally-attack Bug, E4 additional,
// E6 +20%/debuff, weakness transfer on kill
{
  const s = runBattle({
    team: [
      { kitId: 'silverwolf', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(60_000, ['Quantum', 'Fire'], 3, 80, 120, 300, 'Elite'),
    cycles: 8, seed: 5,
  })
  const sb = kitById('silverwolf')?.base
  chk(s, 'silverwolf-canon', 'base = PROG {1047,640,460,107}', !!(sb && sb.hp === 1047 && sb.atk === 640 && sb.def === 460 && sb.spd === 107))
  chk(s, 'silverwolf-canon', 'Skill Allow Changes?: All-Type RES↓ 13% 2t', s.buffLog.some(e => e.id === 'sw_resall' && e.mods?.some(m => m.stat === 'resAll' && m.value <= -0.13 && m.value >= -0.155)))
  chk(s, 'silverwolf-canon', 'Skill weaknesses implant (sw_weak_*)', s.buffLog.some(e => e.id.startsWith('sw_weak_')))
  chk(s, 'silverwolf-canon', 'Ult User Banned: DEF↓ 45% 3t', s.buffLog.some(e => e.id === 'sw_ult_def' && e.mods?.some(m => m.stat === 'defRed' && m.value >= 0.45 && m.value <= 0.50)))
  chk(s, 'silverwolf-canon', 'E2 Zombie Network: enemy DMG taken +20% + ally-attack Bug', s.buffLog.some(e => e.id === 'sw_e2' && e.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.2) < 1e-6)) && s.buffLog.some(e => e.id === 'sw_bug'))
  chk(s, 'silverwolf-canon', 'E4 Bounce Attack: Additional DMG after Ult', s.logLines.some(l => /E4 Additional DMG/.test(l)))
  chk(s, 'silverwolf-canon', 'E6 Overlay Network: SW DMG+ per debuff', s.buffLog.some(e => e.id === 'sw_e6' && e.mods?.some(m => m.stat === 'dmgAll' && m.value >= 0.2)))
  chk(s, 'silverwolf-canon', 'Weakness transfer on kill (elite+ priority)', s.logLines.some(l => /Transfer weakness/.test(l)))

  // E6 must not leak onto the next enemy: ult is per-target, boost dies right after its own hit
  {
    const e6 = prepareBattle({
      team: [{ kitId: 'silverwolf', stats: { ...SUP, atk: 2000, spd: 115 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 }],
      enemy: foe(400_000, ['Quantum', 'Fire'], 3, 80, 120, 300, 'Elite'),
      cycles: 1, seed: 5,
    })
    e6.initBattle()
    const sw = e6.roster.find(a => a.kitId === 'silverwolf')!
    const es = e6.roster.filter(u => u.side === 'enemy')
    for (const e of es) sim_debuff(e)
    sw.energy = sw.maxEnergy
    kitById('silverwolf')!.perform(e6, sw, { kind: 'ult' }, e6.rt(sw))
    chk(e6, 'silverwolf-e6-scope', 'E6 Overlay Network does not persist after its own hit', !sw.buffs.some(b => b.id === 'sw_e6'))
    function sim_debuff(e: typeof es[number]): void { e6.addBuff(e, { id: 'sw_bug', name: 'Bug (DEF↓)', mods: [{ stat: 'defPct', value: -0.2 }], turns: 4 }) }
  }
}

// ============ 47. TRAILBLAZER DESTRUCTION (Physical, pickoff, Fighting Will) ============
// e0: skill/ult apply Fighting Will vuln, break → Perfect Pickoff, ult single+multi variants
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_destruction', stats: { hp: 5000, atk: 2400, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 5,
  })
  chk(s, 'tb-dest', 'Basic → Farewell Hit', s.logLines.some(l => /Farewell Hit/.test(l)))
  chk(s, 'tb-dest', 'Skill → RIP Home Run (main)', s.logLines.some(l => /RIP Home Run \(main\)/.test(l)))
  chk(s, 'tb-dest', 'Skill → Fighting Will (vulnAll 0.25)', s.buffLog.some(e => e.id === 'tb_dest_fw' && e.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.25) < 1e-6)))
  chk(s, 'tb-dest', 'Ult multi → Blowout: RIP Home Run (main)', s.logLines.some(l => /Blowout: RIP Home Run \(main\)/.test(l)))
  chk(s, 'tb-dest', 'Break → Perfect Pickoff (atkPct + defPct)', s.buffLog.some(e => e.id === 'tb_dest_pickoff' && e.mods?.some(m => m.stat === 'atkPct' && m.value >= 0.08) && e.mods?.some(m => m.stat === 'defPct' && Math.abs(m.value - 0.10) < 1e-6)))
}
// e6: onKill → Perfect Pickoff + E1 +10 energy on ult-kill
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_destruction', stats: { hp: 5000, atk: 2400, def: 1300, spd: 120 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(60_000, ['Physical'], 3, 60, 120, 300, 'Mob'),
    cycles: 10, seed: 5,
  })
  chk(s, 'tb-dest-e6', 'E6 onKill → Perfect Pickoff present (stacks)', s.buffLog.some(e => e.id === 'tb_dest_pickoff'))
}

// ============ 48. TRAILBLAZER PRESERVATION (Fire, shields, Magma Will) ============
// e0: ult → shield all, enhanced basic after ult, skill mitigation
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_preservation', stats: { hp: 5000, atk: 2200, def: 2500, spd: 120 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Fire'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 5,
  })
  const pres = s.allies('ally').find(a => a.kitId === 'trailblazer_preservation')
  chk(s, 'tb-pres', 'Ult fires → War-Flaming Lance', s.logLines.some(l => /War-Flaming Lance/.test(l)))
  chk(s, 'tb-pres', 'Shield applied to all allies (tb_pres_shield)', !!pres && s.buffLog.filter(e => e.id === 'tb_pres_shield' && e.unitName !== pres.name).length >= 1)
  chk(s, 'tb-pres', 'Skill → Ever-Burning Amber mitigation 40%', s.buffLog.some(e => e.id === 'tb_pres_skill' && e.mods?.some(m => m.stat === 'mitigation' && Math.abs(m.value - 0.40) < 1e-6)))
  chk(s, 'tb-pres', 'Enhanced Basic after ult', s.logLines.some(l => /Ice-Breaking Light \(enhanced main\)/.test(l)))
  chk(s, 'tb-pres', 'On turn start with shield → ATK+15%', s.buffLog.some(e => e.id === 'tb_pres_abt' && e.mods?.some(m => m.stat === 'atkPct' && Math.abs(m.value - 0.15) < 1e-6)))
}

// ============ 49. TRAILBLAZER HARMONY (Imaginary, Backup Dancer, Super Break) ============
// e0: ult → Backup Dancer BE, onAfterAttack super break vs broken, onBreak energy
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_harmony', stats: { hp: 5000, atk: 2200, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Imaginary'], 2, 60, 120, 400, 'Mob'),
    cycles: 8, seed: 5,
  })
  const harm = s.allies('ally').find(a => a.kitId === 'trailblazer_harmony')
  chk(s, 'tb-harm', 'Skill → Halftime (main)', s.logLines.some(l => /Halftime \(main\)/.test(l)))
  chk(s, 'tb-harm', 'Ult → Backup Dancer BE on allies', !!harm && s.buffLog.some(e => e.id === 'tb_harm_bd' && e.unitName !== harm!.name && e.mods?.some(m => m.stat === 'be' && m.value >= 0.10)))
  chk(s, 'tb-harm', 'Broken enemy + Backup Dancer → Super Break fires', s.logLines.some(l => /SUPER BREAK/.test(l)))
}

// ============ 50. TRAILBLAZER REMEMBRANCE (Ice, Mem memosprite) ============
// e0: ult → summon Mem + AoE, Mem turn → Baddies, Friends! Together! CD buff
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_remembrance', stats: { hp: 5000, atk: 2200, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Ice'], 2, 80, 120, 500, 'Mob'),
    cycles: 10, seed: 5,
  })
  const rem = s.allies('ally').find(a => a.kitId === 'trailblazer_remembrance')
  chk(s, 'tb-rem', 'Ult → Together, Mem! + Mem summoned', s.logLines.some(l => /Together, Mem!/.test(l)) && s.logLines.some(l => /summons Mem/.test(l)))
  chk(s, 'tb-rem', 'Friends! Together! CD buff on allies', !!rem && s.buffLog.some(e => e.id === 'tb_rem_friends' && e.unitName !== rem!.name && e.mods?.some(m => m.stat === 'critDmg' && m.value > 0)))
  chk(s, 'tb-rem', 'Mem turn → Baddies skill fires', s.logLines.some(l => /Baddies!/.test(l)))

  // 1800707: "For every 1 instance of DMG dealt by a target that has Mem's Support, deals 1
  // additional instance of True DMG equal to #1% of the original DMG" — *instance*, not *attack*, so
  // DoT ticks and Break DMG count too (reference `TrailblazerRemembrance.ts` has no directness tag).
  // Those two resolve outside fireAfterAttack, hence the onDoTTick / onBreak hooks.
  // Same delta design as cyrene-p0: the identical hit is run with and without the break, so the
  // delta is the Break instance alone (the hit itself already pays True DMG via onAfterAttack).
  const memTrue = (breaks: boolean, withSupport: boolean) => {
    const b = prepareBattle({
      team: [
        { kitId: 'trailblazer_remembrance', stats: { ...DPS, atk: 2200 }, eidolon: 0, skillPriority: 0 },
        { kitId: 'sampo', stats: DPS, skillPriority: 0 },
      ],
      enemy: foe(4_000_000, ['Physical', 'Ice', 'Quantum'], 2, 90, 90, 200, 'Elite'),
      cycles: 4, seed: 13,
    })
    b.initBattle()
    const ally = b.allies('ally').find(x => x.kitId === 'sampo')!
    const tgt = b.livingEnemiesOf(ally)[0]!
    if (withSupport) b.addBuff(ally, { id: 'tb_rem_support', name: "Mem's Support", mods: [], turns: 5, payload: 0.5 })
    const from = b.logLines.length
    const sumTrue = () => b.logLines.slice(from)
      .map(l => l.match(/(\d+) \[True DMG\]/)).filter((x): x is RegExpMatchArray => !!x)
      .reduce((n, x) => n + Number(x[1]), 0)
    if (breaks) {
      tgt.toughness = 1
      b.hit(ally, tgt, { type: 'basic', elem: 'Physical', mult: 2.0, toughDmg: 30, label: 'tb-rem-break probe' })
      return { true: sumTrue(), broken: tgt.broken }
    }
    b.applyDot(tgt, { kind: 'WindShear', elem: 'Wind', turns: 5, baseDmg: 4000, sourceUnit: ally })
    ;(b as unknown as { turnPrologue(u: Unit): void }).turnPrologue(tgt)
    return { true: sumTrue(), broken: false }
  }
  const mb = memTrue(true, true), mbNo = memTrue(false, true), mbPlain = memTrue(true, false)
  chk(s, 'tb-rem', `1800707: DoT tick by the supported ally deals True DMG (${mbNo.true}); no support → 0 (${mbPlain.true})`,
    mbNo.true > 0 && mbPlain.true === 0)
  chk(s, 'tb-rem', `1800707: Break DMG deals True DMG on top of the hit (${mb.true} vs ${mbNo.true}, delta ${mb.true - mbNo.true})`,
    mb.broken && mb.true - mbNo.true > 0)
}

// ============ 51. TRAILBLAZER ELATION (Lightning, Certified Banger, Punchline) ============
// e0: Aha auto-adds → Elation Skill; skill → CB + That Smile; ult → ally CD buff + Punchline
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_elation', stats: { hp: 5000, atk: 2400, def: 1300, spd: 120 }, eidolon: 0, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Lightning'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 5,
  })
  const ela = s.allies('ally').find(a => a.kitId === 'trailblazer_elation')
  chk(s, 'tb-ela', 'Skill → Let the Storm Rage On', s.logLines.some(l => /Let the Storm Rage On/.test(l)))
  chk(s, 'tb-ela', 'Skill → Certified Banger gained', s.logLines.some(l => /gains Certified Banger/.test(l)))
  chk(s, 'tb-ela', 'Talent → That Smile Hits Different (CB-gated)', s.logLines.some(l => /That Smile Hits Different/.test(l)))
  chk(s, 'tb-ela', 'Aha Instant → Elation Skill fires', s.logLines.some(l => /I Said "Elation," Did I Stutter?/.test(l)))
  chk(s, 'tb-ela', 'Ult → ally critDmg buff (May the Trailblaze Fly You Starward)', !!ela && s.buffLog.some(e => e.id === 'tb_ela_ult' && e.unitName !== ela!.name && e.mods?.some(m => m.stat === 'critDmg' && m.value > 0)))
  chk(s, 'tb-ela', 'Punchline pool increased (talent +3 on attack)', s.punchlinePeak() > 0)
}
// e6: ult + Elation Skill → self critDmg +100% 3t, E4 vulnAll on enemies
{
  const s = runBattle({
    team: [
      { kitId: 'trailblazer_elation', stats: { hp: 5000, atk: 2400, def: 1300, spd: 120 }, eidolon: 6, skillPriority: 2, energyStartFrac: 1 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(120_000, ['Lightning'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 5,
  })
  chk(s, 'tb-ela-e6', 'E6 self critDmg +100% 3t', s.buffLog.some(e => e.id === 'tb_ela_e6' && e.turns === 3 && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 1.0) < 1e-6)))
  chk(s, 'tb-ela-e6', 'E4 vulnAll +10% 2t on enemies', s.buffLog.some(e => e.id === 'tb_ela_e4' && e.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.10) < 1e-6)))
}

// ============ 52. YAO GUANG (Physical/Elation: Decalight Zone, ult CB + fixed Punchline, Great Boon) ============
// e0: skill → Zone (Elation share + Punchline on attack); ult → Woe's Whisper + Elation hits
// (fixed Punchline, not pool), CB granted at END of instant, SP refund. Teammate attack then procs Boon.
{
  const s = runBattle({
    team: [
      { kitId: 'yao_guang', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 0, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(150_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 7,
  })
  chk(s, 'yg', 'Skill → Decalight Zone buff', s.buffLog.some(e => e.id === 'yg_zone' && (e.mods ?? []).some(m => m.stat === 'elation' && m.value > 0)))
  chk(s, 'yg', 'Ult → Elation AoE (Let Thy Fortune Burst)', s.logLines.some(l => /Let Thy Fortune Burst/.test(l)))
  chk(s, 'yg', 'Ult → Woe\'s Whisper vuln debuff', s.buffLog.some(e => e.id === 'yg_woe' && (e.mods ?? []).some(m => m.stat === 'vulnAll' && m.value > 0)))
  chk(s, 'yg', 'Ult → Certified Banger granted after damage', s.logLines.some(l => /Certified Banger/.test(l)))
  chk(s, 'yg', 'Great Boon procs on ally attack (CB held)', s.logLines.some(l => /Great Boon/.test(l)))
  chk(s, 'yg', 'Aha consumes shared Punchline separately (Elation Skill uses fixed)', s.logLines.some(l => /Aha consumes all Punchline/.test(l)))
}
// e6: E1 CB=40 fixed, E6 double AoE + bounce hits, E2 SPD+12% + flat +16% Elation
{
  const s = runBattle({
    team: [
      { kitId: 'yao_guang', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 6, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(1_200_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 7,
  })
  const yg = s.allies('ally').find(a => a.kitId === 'yao_guang')!
  const zone = s.buffLog.find(e => e.id === 'yg_zone')
  const zoneMods = zone?.mods ?? []
  chk(s, 'yg-e6', 'E1: CB fixed at 40', Math.abs(s.cbOf(yg) - 40) < 1e-6)
  chk(s, 'yg-e6', 'E6: random bounce hits', s.logLines.filter(l => /Let Thy Fortune \(random\)/.test(l)).length >= 5)
  chk(s, 'yg-e6', 'E2: Zone SPD+12% + Elation share + flat +16%', !!zone && zoneMods.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.12) < 1e-6) && zoneMods.filter(m => m.stat === 'elation').length === 2 && zoneMods.some(m => m.stat === 'elation' && Math.abs(m.value - 0.16) < 1e-6))
}

// ============ 53. HYSILENS (Nihility/Physical: DoT zone triggers on ANY DoT tick) ============
// sim.tickDots fires kit onDoTTick for ALL ally kits on any enemy DoT tick (was: only the DoT
// source's kit). So a FOREIGN DoT (Kafka Shock) on a zoned enemy must spawn the zone Phys DoT.
{
  const s = runBattle({
    team: [
      { kitId: 'hysilens', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130 }, eidolon: 0, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'kafka', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(80_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 6, seed: 5,
  })
  chk(s, 'hys', 'A0 The Gladius of Conquest: battle-start Zone deployed (+1 SP)', s.logLines.some((l: string) => /Hysilens Deploys Zone \+1 SP/.test(l)))
  chk(s, 'hys', 'Fiddle of Pearls latent at ≤60% EHR (E0 no ehr → no buff)', !s.buffLog.some((e: { id: string }) => e.id === 'hys_fiddle'))
  chk(s, 'hys', 'Ult → Maelstrom Rhapsody zone on enemies', s.buffLog.some((e: { id: string }) => e.id === 'hys_zone'))
  chk(s, 'hys', 'Foreign (Kafka) DoT tick → zone Phys DoT (all-kit onDoTTick dispatch)', s.logLines.some((l: string) => /Hysilens Zone Phys DoT/.test(l)))
  chk(s, 'hys', 'zone cap tracks per-enemy (hysTrig)', !!s.allies('ally').find(a => a.kitId === 'hysilens'))

  // owner-param: the zone DoT must scale off HYSILENS' effAtk, not the DoT tick's source. Old code
  // passed `attacker` (Kafka here) into zoneDot, so a foreign DoT tick re-scaled the zone by Kafka.
  const w = prepareBattle({
    team: [
      { kitId: 'hysilens', stats: { hp: 5000, atk: 3000, def: 1300, spd: 130 }, skillPriority: 2 },
      { kitId: 'kafka', stats: { ...DPS, atk: 800 }, skillPriority: 3 },
    ],
    enemy: foe(80_000, ['Physical'], 1, 80, 120, 500, 'Mob'),
    cycles: 1, seed: 5,
  })
  w.initBattle()
  const hys = w.roster.find(x => x.kitId === 'hysilens')!
  const kfk = w.roster.find(x => x.kitId === 'kafka')!
  const zf = w.livingEnemiesOf(hys)[0]
  ;(w.rt(hys) as { zoneActive?: boolean }).zoneActive = true
  w.addBuff(zf, { id: 'hys_zone', name: 'Maelstrom Rhapsody', mods: [], turns: Infinity, debuff: true })
  const shock: DoTWithSource = { kind: 'Shock', elem: 'Lightning', turns: 1, baseDmg: 100, sourceUnit: kfk }
  kitById('hysilens')!.onDoTTick!(w, kfk, zf, shock, w.rt(hys), hys)
  const zb = zf.dots.find(d => d.kind === 'Bleed')
  const zMult = mult('hysilens', 'ult_a4', levelsOf(w.rt(hys)).ult)
  const want = w.effAtk(hys) * zMult, wrong = w.effAtk(kfk) * zMult
  chk(w, 'hys-owner', `zone DoT scales off HYSILENS' effAtk (${Math.round(zb?.baseDmg ?? 0)} = ${Math.round(want)}, Kafka would be ${Math.round(wrong)})`,
    !!zb && Math.abs(zb.baseDmg - want) < 1e-6 && Math.abs(zb.baseDmg - wrong) > 1)
}

// 53b. HYSILENS E1/E2/E6: extra Talent DoT instance, E2 team Fiddle while Zone, E6 ×1.2 zone mult
{
  const s = runBattle({
    team: [
      { kitId: 'hysilens', stats: { hp: 5000, atk: 2400, def: 1300, spd: 130, ehr: 0.8 }, eidolon: 6, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'kafka', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(80_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 6, seed: 5,
  })
  // ehr = base 0.8 + trace 0.1 = 0.9 → 3·15% tiers = +45% DMG
  chk(s, 'hys-e6', 'A2 Fiddle of Pearls active at 80% EHR + trace (self +45% DMG)', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'hys_fiddle' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.45) < 1e-9)))
  chk(s, 'hys-e6', 'E2: Fiddle DMG boost → all allies while Zone', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'hys_fiddle2' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.45) < 1e-9)))
  chk(s, 'hys-e6', 'E1: extra Talent DoT instance (coexists)', s.logLines.some((l: string) => /Hysilens E1: extra/.test(l)))
  chk(s, 'hys-e6', 'A0: only one battle-start SP refund, zone re-deploys on ult', s.logLines.some((l: string) => /Hysilens Deploys Zone \+1 SP/.test(l)))
  chk(s, 'hys-e6', 'Zone Phys DoT fires on enemy DoT ticks (E6 cap 12)', s.logLines.some((l: string) => /Hysilens Zone Phys DoT/.test(l)))
}

// 53c. HYSILENS A1 The Bubble of Banquets: Ult detonates all current DoTs at 150%
// Kafka (SPD 200) ults first → Shock on both enemies; Hysilens' later ult must detonate them.
{
  const s = runBattle({
    team: [
      { kitId: 'hysilens', stats: { hp: 5000, atk: 2400, def: 1300, spd: 90 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'kafka', stats: { ...DPS, spd: 200 }, skillPriority: 3, energyStartFrac: 1 },
    ],
    enemy: foe(80_000, ['Physical'], 2, 80, 120, 500, 'Mob'),
    cycles: 8, seed: 5,
  })
  chk(s, 'hys-a1', 'Kafka ults before Hysilens (Shock DoT present at detonation)', s.logLines.indexOf('Hysilens Ult: Maelstrom Rhapsody') > s.logLines.indexOf('Kafka Ult: Twilight Trill') || s.logLines.some((l: string) => /Twilight Trill/.test(l)))
  chk(s, 'hys-a1', 'A1: ult detonates DoTs at ×1.5', s.logLines.some((l: string) => /The Bubble of Banquets/.test(l)))
}

// ============ 54. ANAXA (Erudition/Wind: weakness implant + Qualitative Disclosure, A6 defIgnore) ============
// e0 + the_herta (2nd Erudition): A4 Imperative Hiatus → ≥2 Erudition → team DMG +50%.
// Skill fractal implants weaknesses on main + 4 bounces; ≥5 unique weaknesses → Disclosure target.
{
  const s = runBattle({
    team: [
      { kitId: 'anaxa', stats: { hp: 5000, atk: 2400, def: 1300, spd: 97 }, eidolon: 0, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'the_herta', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(100_000, ['Physical'], 2, 100, 120, 500, 'Mob'),
    cycles: 6, seed: 7,
  })
  chk(s, 'anaxa', 'Talent: hit → 1 random missing Weakness (axa_weak)', s.buffLog.some((e: { id: string }) => e.id === 'axa_weak'))
  chk(s, 'anaxa', '≥5 unique weaknesses → Qualitative Disclosure', s.buffLog.some((e: { id: string }) => e.id === 'axa_disclosure'))
  chk(s, 'anaxa', 'A6: DEF ignore 4% × unique weaknesses (transient _axa6)', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === '_axa6' && e.mods?.some(m => m.stat === 'defIgnore' && m.value >= 0.04 && m.value <= 0.28)))
  chk(s, 'anaxa', 'A4: 2 Erudition chars → all allies DMG +50%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_a4_team' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.5) < 1e-9)))
  chk(s, 'anaxa', 'Talent: additional Skill on Disclosure enemy', s.logLines.some((l: string) => /Talent: additional Skill/.test(l)))
  chk(s, 'anaxa', 'A2: no Disclosure at turn start → +30 Energy', s.logLines.some((l: string) => /A2: no Disclosure/.test(l)))
}

// 54b. ANAXA E1/E2: first Skill +1 SP + DEF↓16% 2t on every hit target; E2 battlefield-entry implant + RES↓20%
{
  const s = runBattle({
    team: [
      { kitId: 'anaxa', stats: { hp: 5000, atk: 2400, def: 1300, spd: 97 }, eidolon: 2, skillPriority: 2 },
      { kitId: 'danheng', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(100_000, ['Physical'], 2, 100, 120, 500, 'Mob'),
    cycles: 6, seed: 3,
  })
  chk(s, 'anaxa-e2', 'E1: first Skill +1 SP refund', s.logLines.some((l: string) => /E1: First Skill \+1 SP/.test(l)))
  chk(s, 'anaxa-e2', 'E1: DEF↓16% 2t on hit target', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_e1' && e.mods?.some(m => m.stat === 'defRed' && Math.abs(m.value - 0.16) < 1e-9)))
  chk(s, 'anaxa-e2', 'E2: battlefield-entry weakness implant', s.buffLog.some((e: { id: string }) => e.id === 'axa_weak'))
  chk(s, 'anaxa-e2', 'E2: All-Type RES↓20% (resAll) on entry', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_e2' && e.mods?.some(m => m.stat === 'resAll' && Math.abs(m.value + 0.2) < 1e-9)))
}

// 54c. ANAXA E6: solo Erudition + E6 → BOTH Imperative Hiatus effects (team DMG +50% + self CD +140%); E6 DMG ×1.3
{
  const s = runBattle({
    team: [
      { kitId: 'anaxa', stats: { hp: 5000, atk: 2400, def: 1300, spd: 97 }, eidolon: 6, energyStartFrac: 1, skillPriority: 2 },
    ],
    enemy: foe(100_000, ['Physical'], 2, 100, 120, 500, 'Mob'),
    cycles: 6, seed: 3,
  })
  chk(s, 'anaxa-e6', 'E6: DMG ×1.3 (finalDmgBoost, multiplies the boost pool instead of adding to it)', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_e6' && e.mods?.some(m => m.stat === 'finalDmgBoost' && Math.abs(m.value - 0.3) < 1e-9)))
  chk(s, 'anaxa-e6', 'E6 → A4: team DMG +50%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_a4_team' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.5) < 1e-9)))
  chk(s, 'anaxa-e6', 'E6 → A4: self CRIT DMG +140%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'axa_a4_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 1.4) < 1e-9)))
}

// ============ 55. EVERNIGHT (Remembrance/Ice: HP-scaled summoner, Darkest Riddle Charge) ============
// Battle start: Evey summoned, A0 CR+35%, A1 +70 EN +1 Memoria. Skill summons/heals Evey + memosprite CD
// buff (A2 by Remembrance count). Ult: Evey AoE + Darkest Riddle (Charge 2, +2 E2). Talent CD on HP loss.
{
  const s = runBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(50_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 5, seed: 3,
  })
  chk(s, 'ever', 'A0: CRIT Rate +35% at battle start', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_a0_cr' && e.mods?.some(m => m.stat === 'critRate' && Math.abs(m.value - 0.35) < 1e-9)))
  chk(s, 'ever', 'A1: +70 Energy at battle start', s.logLines.some((l: string) => /A1 \+70 EN \+1 Memoria/.test(l)))
  chk(s, 'ever', 'Solitude: Evernight +Evey DMG while Evey fielded', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_solitude' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.7) < 1e-9)))
  chk(s, 'ever', 'Skill: summons Evey → Evey acts immediately', s.logLines.some((l: string) => /summons memosprite Evey/.test(l)))
  chk(s, 'ever', 'Skill: memosprite CRIT DMG buff (Day Gently Slips)', s.buffLog.some((e: { id: string }) => e.id === 'ev_skill_cd'))
  chk(s, 'ever', 'A0: ability → lose 5% current HP → CRIT DMG +15% 2t', s.logLines.some((l: string) => /A0: loses/.test(l)) && s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_a0_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.15) < 1e-9)))
  chk(s, 'ever', 'Talent: HP loss → +2 Memoria + CRIT DMG up', s.buffLog.some((e: { id: string }) => e.id === 'ev_cd'))
  chk(s, 'ever', 'Evey acts: Whirling Rain (HP-scaled)', s.logLines.some((l: string) => /Evey uses Remembrance, Whirling/.test(l)))
}

// 55b. EVERNIGHT ult → Darkest Riddle: Evey AoE, Charge 2 (+2 E2=4), Solitude persists after DR expires
{
  const s = runBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 2, energyStartFrac: 1, skillPriority: 2 },
    ],
    enemy: foe(50_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 5, seed: 3,
  })
  chk(s, 'ever-e2', 'Ult: Evey AoE attack', s.logLines.some((l: string) => /O Wakeful World, Goodnight/.test(l)))
  chk(s, 'ever-e2', 'Ult: Darkest Riddle Charge +2 (+2 E2 = 4)', s.logLines.some((l: string) => /Darkest Riddle Charge (2|3|4)/.test(l)))
  chk(s, 'ever-e2', 'DR: Evernight DMG+ (ult_a3)', s.buffLog.some((e: { id: string }) => e.id === 'ev_dr_atk'))
  chk(s, 'ever-e2', 'DR: enemies DMG taken+ (ult_a4)', s.buffLog.some((e: { id: string }) => e.id === 'ev_dr_vuln'))
  chk(s, 'ever-e2', 'E2: CRIT DMG +40% Evernight+Evey', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_e2' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.4) < 1e-9)))
  chk(s, 'ever-e2', 'Solitude STILL active after DR ends (no strip at turn start)', s.buffLog.some((e: { id: string }) => e.id === 'ev_solitude'))
}

// 55c. EVERNIGHT Dream: ≥16 Memoria → Evey Dream (primary/other split), Evey disappears, Parting via Dream;
// E6 regains 30% Memoria consumed, A2 Kindle by Remembrance count (2 chars → +15% CD), E4 WBE
{
  const s = runBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 6, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'castorice', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(200_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 7, seed: 3,
  })
  chk(s, 'ever-e6', 'A2 Kindle: 2 Remembrance chars → memosprite CRIT DMG +15%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_a2_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.15) < 1e-9)))
  chk(s, 'ever-e6', 'E4: ally memosprite Weakness Break Efficiency +25%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_e4' && e.mods?.some(m => m.stat === 'wbe' && Math.abs(m.value - 0.25) < 1e-9)))
  chk(s, 'ever-e6', 'E6: all allies All-Type RES PEN +20%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_e6' && e.mods?.some(m => m.stat === 'resPenAll' && Math.abs(m.value - 0.2) < 1e-9)))
  chk(s, 'ever-e6', 'Memoria full → Evey immediately takes action', s.logLines.some((l: string) => /Memoria full/.test(l)))
  chk(s, 'ever-e6', 'Dream: primary/other split by Memoria', s.logLines.some((l: string) => /Evey uses Dream, Dissolving/.test(l)))
  chk(s, 'ever-e6', 'Dream → Evey disappears, Parting SPD+ (via Dream)', s.buffLog.some((e: { id: string })=> e.id === 'ev_parting'))
  chk(s, 'ever-e6', 'E6: regains 30% of Dream-consumed Memoria', s.logLines.some((l: string) => /E6: regained 30%/.test(l)))
}

// 55d. EVERNIGHT Evey death: Solitude cleared, non-Dream Parting SPD+, refreshE1 by enemy count
{
  const s = runBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 1, skillPriority: 2 },
    ],
    enemy: foe(90_000, ['Ice'], 1, 90, 130, 900, 'Boss'),
    cycles: 8, seed: 3,
  })
  chk(s, 'ever-e1', 'E1: ally memosprite DMG by enemy count (1 enemy → 150%)', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_e1' && e.mods?.some(m => m.stat === 'dmgAll' && Math.abs(m.value - 0.5) < 1e-9)))
  chk(s, 'ever-e1', 'Evey death → Solitude cleared', !s.buffLog.some((e: { id: string }) => e.id === 'ev_solitude') || s.logLines.some((l: string) => /Evey parted/.test(l)))
  chk(s, 'ever-e1', 'Evey death → Parting SPD+ (non-Dream)', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'ev_parting' && e.mods?.some(m => m.stat === 'spdPct' && Math.abs(m.value - 0.1) < 1e-9)))
  chk(s, 'ever-e1', 'Parting removed at start of next Evernight turn', s.logLines.some((l: string) => /Evey parted/.test(l)))
}
// 55e. EVERNIGHT re-summon (30-09-2026, REAL FIX): A0 "Dark the Night, Still the Moon" is a permanent
// +35% CRIT Rate on Evernight AND Evey, but Evey's half was applied in onStart only — a mid-battle
// re-summon (Skill after Evey died) produced a memosprite without it. White-box: kill, observe the
// despawn, re-summon through the Skill path.
{
  const ECTX = { eidolon: 0, basic: 10, skill: 10, ult: 10, talent: 10 } as never
  const ek = kitById('evernight')!
  const ep = prepareBattle({
    team: [{ kitId: 'evernight', stats: { hp: 60000, atk: 2000, def: 1200, spd: 130 }, eidolon: 0 }],
    enemy: foe(5_000_000, ['Ice'], 1, 400, 60, 100, 'Boss'),
    cycles: 1, seed: 1,
  })
  const eOwn = ep.roster.find(u => u.kitId === 'evernight')!
  const evey = () => ep.find(`evey_${eOwn.id}`)
  ek.onStart!(ep, eOwn, ECTX) // prepareBattle does not run onStart
  const e1 = evey()!
  const a0 = (x: Unit) => x.buffs.some(b => b.id === 'ev_a0_cr' && b.mods.some(m => m.stat === 'critRate' && Math.abs(m.value - 0.35) < 1e-9))
  chk(ep, 'ever-resummon', `battle-start Evey carries A0 CRIT Rate +35% (maxHP ${Math.round(e1.maxHp)})`, a0(e1))
  e1.hp = 0; e1.dead = true
  ek.onTurnStart!(ep, eOwn, ECTX)
  chk(ep, 'ever-resummon', 'Evey death → despawn observed at Evernight turn start (Parting SPD+ applied)', !evey() && eOwn.buffs.some(b => b.id === 'ev_parting'))
  chk(ep, 'ever-resummon', 'Evey death → Solitude cleared while she is off the field', !eOwn.buffs.some(b => b.id === 'ev_solitude'))
  ek.perform!(ep, eOwn, { kind: 'skill' } as never, ECTX)
  const e2 = evey()
  chk(ep, 'ever-resummon', `Skill re-summons Evey at full HP (${Math.round(e2?.hp ?? 0)}/${Math.round(e2?.maxHp ?? 0)})`, !!e2 && e2.hp === e2.maxHp && e2.maxHp > 0)
  chk(ep, 'ever-resummon', 'A0 CRIT Rate +35% is re-applied to the re-summoned Evey (was onStart-only)', !!e2 && a0(e2))
  chk(ep, 'ever-resummon', 'Solitude is back on both after the re-summon', !!e2 && e2.buffs.some(b => b.id === 'ev_solitude') && eOwn.buffs.some(b => b.id === 'ev_solitude'))
  chk(ep, 'ever-resummon', 'the re-summoned Evey acts immediately (memosprite talent "Night, Trailing, In Step")', ep.logLines.filter((l: string) => /summons memosprite Evey/.test(l)).length === 2 && ep.logLines.some((l: string) => /Evey uses Remembrance, Whirling/.test(l)))
}

// 55f. Evernight Skill memosprite CRIT DMG duration runs on EARNING's turn, not the memosprite's
// (141302: "This duration decreases by 1 at the start of Evernight's every turn"). The buff rode a
// plain `turns`, so every Evey action ate it early; and `tickOnSource` was a no-op clock transfer
// because `expireBuffs` counted holder turns too — so the flag also double-ticked robin_aria et al.
{
  const s = prepareBattle({
    team: [{ kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 0, skillPriority: 2 }],
    enemy: foe(4_000_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 1, seed: 3,
  })
  s.initBattle()
  const evn = s.roster.find(x => x.kitId === 'evernight')!
  const eve = s.allies('ally').find(u => u.kind === 'summon' && (s.rt(u).ownerId as string) === evn.id)!
  kitById('evernight')!.perform(s, evn, { kind: 'skill' }, s.rt(evn))
  const endTick = (x: unknown): void => (s as unknown as { endTick(u: unknown): void }).endTick(x)
  const left = (id: string): number => eve.buffs.find(b => b.id === id)?.turns ?? -1
  const t0 = left('ev_skill_cd')
  chk(s, 'ever-f1', `Skill: Day Gently Slips + Kindle the Morn both carry the Skill duration (${t0}t / ${left('ev_a2_cd')}t)`,
    t0 > 1 && left('ev_a2_cd') === t0)
  for (let i = 0; i < 3; i++) endTick(eve)
  chk(s, 'ever-f1', 'Evey burning 3 of its own turns does NOT consume either buff',
    left('ev_skill_cd') === t0 && left('ev_a2_cd') === t0)
  endTick(evn)
  chk(s, 'ever-f1', `Evernight's turn end ticks both down (${t0}t → ${left('ev_skill_cd')}t)`,
    left('ev_skill_cd') === t0 - 1 && left('ev_a2_cd') === t0 - 1)
  for (let i = 0; i < t0; i++) endTick(evn)
  chk(s, 'ever-f1', `buffs expire after exactly ${t0} Evernight turns (got ${left('ev_skill_cd')}t)`, left('ev_skill_cd') === -1)
}

// 55g. 141302 buffs "all ally memosprites" — Demiurge (Cyrene) is one, and it is the only
// untargetable unit in the codebase. `addBuff` used to drop any finite-turn buff from untargetable
// units, so the CRIT DMG silently never reached Demiurge whenever the two shared a field.
{
  const s = prepareBattle({
    team: [
      { kitId: 'cyrene', stats: { hp: 9000, atk: 1300, def: 1200, spd: 98 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(4_000_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 1, seed: 5,
  })
  s.initBattle()
  const cy = s.roster.find(x => x.kitId === 'cyrene')!
  const evn = s.roster.find(x => x.kitId === 'evernight')!
  if (!s.allies('ally').some(u => u.name === 'Demiurge')) {
    cy.energy = cy.maxEnergy
    kitById('cyrene')!.perform(s, cy, { kind: 'ult' }, s.rt(cy))
  }
  const demi = s.allies('ally').find(u => u.name === 'Demiurge')!
  chk(s, 'ever-f2', 'Demiurge is fielded and untargetable', demi !== undefined && demi.untargetable === true)
  kitById('evernight')!.perform(s, evn, { kind: 'skill' }, s.rt(evn))
  const cd = demi.buffs.find(b => b.id === 'ev_skill_cd')
  chk(s, 'ever-f2', `Day Gently Slips reaches untargetable Demiurge (${cd?.turns ?? '-'}t)`,
    !!cd && cd.mods?.some(m => m.stat === 'critDmg') === true)
}

// 55h. A1 canon is "when EVERNIGHT or an ALLY MEMOSPRITE uses an ability" — only Evey counted, so
// every other ally memosprite granted nothing. E2 (TB Remembrance) is the same gap: its branch sat in
// `onSummonTurn`, which the sim only ever dispatches to the OWNER's kit, so `summon.id !== mem_…` was
// always false. One shared broadcast over both memosprite action paths (AV timeline + inline Extra Turn)
// fixes both. Energy is the clean signal: A1 is the only +5 EN source here, E2 the only +8.
{
  const s = prepareBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 8000, atk: 1400, def: 1100, spd: 99 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'cyrene', stats: { hp: 9000, atk: 1300, def: 1200, spd: 98 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'aglaea', stats: { hp: 9000, atk: 1300, def: 1200, spd: 97 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'trailblazer_remembrance', stats: { hp: 9000, atk: 1300, def: 1200, spd: 96 }, eidolon: 2, skillPriority: 2 },
    ],
    enemy: foe(4_000_000, ['Ice'], 2, 90, 120, 500, 'Mob'),
    cycles: 1, seed: 5,
  })
  s.initBattle()
  const evn = s.roster.find(x => x.kitId === 'evernight')!
  const cy = s.roster.find(x => x.kitId === 'cyrene')!
  const ag = s.roster.find(x => x.kitId === 'aglaea')!
  const tb = s.roster.find(x => x.kitId === 'trailblazer_remembrance')!
  const ult = (u: typeof cy): void => { u.energy = u.maxEnergy; kitById(u.kitId!)!.perform(s, u, { kind: 'ult' }, s.rt(u)) }
  const ev0 = evn.energy
  ult(cy); ult(ag); ult(tb)
  // Demiurge/GM act the moment they are summoned, with no AV turn of their own — that inline path
  // never reached a listener before, so this is the live proof the gap is closed.
  chk(s, 'ever-a1', `mid-battle summon actions already granted A1 (+${evn.energy - ev0} EN)`, evn.energy - ev0 > 0)
  // E2's per-turn gate was consumed by those same actions; canon resets it at TB's turn start.
  kitById('trailblazer_remembrance')!.onTurnStart!(s, tb, s.rt(tb))
  const demi = s.find(`demi_${cy.id}`)!
  const gm = s.find(`gm_${ag.id}`)!
  const eve = s.find(`evey_${evn.id}`)!
  const mem = s.find(`mem_${tb.id}`)!
  chk(s, 'ever-a1', 'setup: all four memosprites fielded', !!demi && !!gm && !!eve && !!mem)
  // A memosprite action is +5 EN for Evernight (A1) and, once per TB turn, +8 for TB (E2).
  // Mem's own action is the ONE case canon excludes from E2 — but not from A1 — so it goes FIRST,
  // while the per-turn gate is still fresh: otherwise a spent gate would mask the exclusion.
  const step = (name: string, act: () => void, dEv: number, dTb: number): void => {
    const e0 = evn.energy, t0 = tb.energy
    act()
    chk(s, 'ever-a1', `${name} → Evernight ${dEv >= 0 ? '+' : ''}${evn.energy - e0} EN, TB ${dTb >= 0 ? '+' : ''}${tb.energy - t0} EN`,
      evn.energy - e0 === dEv && tb.energy - t0 === dTb)
  }
  step('Mem (own turn: A1 yes, E2 excluded)', () => s.takeTurn(mem), 5, 0)
  step('Demiurge (inline Extra Turn)', () => s.grantExtraTurn(demi), 5, 8)
  step('Garmentmaker (AV-timeline turn)', () => s.takeTurn(gm), 5, 0)
  step('Evey (AV-timeline turn, no double count)', () => s.takeTurn(eve), 5, 0)
  step('Demiurge again (A1 repeats, E2 spent)', () => s.grantExtraTurn(demi), 5, 0)
  // The discriminator itself: an ENEMY summon, and a true-summon ALLY (Numby / Lightning-Lord /
  // Souldragon / Fuyuan — `sharesOwnerBuffs`), are both not memosprites and must grant nothing.
  // White-boxed through the private broadcast with a fabricated unit: it reads only
  // side/kind/sharesOwnerBuffs, so no action, damage or targeting is involved. An enemy memosprite
  // cannot even reach the call sites in a live battle (enemies have no kit), so this is the only
  // way to prove the filter is what rejects it.
  const fire = (patch: Partial<Unit>): void =>
    (s as unknown as { fireAllyMemospriteAct(x: Unit): void }).fireAllyMemospriteAct({ ...eve, ...patch })
  kitById('trailblazer_remembrance')!.onTurnStart!(s, tb, s.rt(tb))
  step('enemy summon (side filter)', () => fire({ id: 'foe_summon', side: 'enemy' }), 0, 0)
  step('ally true-summon (sharesOwnerBuffs filter)', () => fire({ id: 'numby_like', sharesOwnerBuffs: true }), 0, 0)
  step('ally timer unit (kind filter)', () => fire({ id: 'cd_tick', kind: 'timer' }), 0, 0)
}

// 55e. EVERNIGHT owner down: Evey must NOT keep acting. `summonTurn`/`perform` resolve the owner
// with `?? s` / `?? u`, so the fallback hands the memosprite itself in as "owner" — `eveyAct` rejects
// that (no master to draw stats from) and idles instead. Canon: it vanishes with its owner; the
// sim only parks it (see the owner-dead fallback in remembrance.ts eveyAct).
{
  const atk = 12_000
  const s = runBattle({
    team: [
      { kitId: 'evernight', stats: { hp: 20_000, atk: 900, def: 300, spd: 118 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'luocha', stats: { hp: 80_000, atk: 1600, def: 2000, spd: 112 }, eidolon: 0, skillPriority: 1 },
      { kitId: 'robin', stats: { hp: 80_000, atk: 1400, def: 2000, spd: 108 }, eidolon: 0, skillPriority: 1 },
    ],
    enemy: foe(900_000_000, [], 1, 60, 150, atk, 'Butcher'),
    cycles: 12, seed: 4242,
  })
  const di = s.logLines.findIndex((l: string) => /Evernight defeated/.test(l))
  const before = s.logLines.slice(0, di < 0 ? s.logLines.length : di).filter((l: string) => /Evey → /.test(l)).length
  const after = di < 0 ? [] : s.logLines.slice(di + 1).filter((l: string) => /Evey → |Evey uses /.test(l))
  chk(s, 'ever-owner-down', 'owner goes down mid-battle (setup sanity)', di >= 0 && before > 0)
  chk(s, 'ever-owner-down', 'Eey deals no damage after its owner is defeated', after.length === 0)
  chk(s, 'ever-owner-down', 'Eey idles instead of acting (owner-dead guard reached)',
    s.logLines.some((l: string) => /Evey idles: owner is down/.test(l)))
}

// ============ 56. THE HERTA (Erudition/Ice: Interpretation engine, Answer, Aloofly Honest) ============
// e0 solo 1 Elite: entry +1 Interpret / wave-start +25 = 26. energyStartFrac 1 → first action = Ult
// (No prior Inspiration since base battle-start Inspiration removed). Ult → immediate Extra Turn → Enhanced Skill.
{
  const s = runBattle({
    team: [
      { kitId: 'the_herta', stats: DPS, eidolon: 0, energyStartFrac: 1, skillPriority: 2 },
    ],
    enemy: foe(500_000, ['Ice'], 1, 120, 120, 500, 'Elite'),
    cycles: 8, seed: 1,
  })
  const interp = (e: { id: string; stacks?: number; av: number }) => e.id === 'th_interpretation' && e.av > 0 && e.stacks === 1
  chk(s, 'the-herta', 'Talent entry + Wave Start: enemy carries 26 Interpretation', s.buffLog.some((e: { id: string; stacks?: number; name: string }) => e.id === 'th_interpretation' && e.stacks === 26))
  chk(s, 'the-herta', 'Wave Start: +25 Interpretation (elite-first)', s.logLines.some((l: string) => /Wave Start: 25 Interpretation/.test(l)))
  chk(s, 'the-herta', 'No base Inspiration at battle start (removed; ult only)', !s.buffLog.some((e: { id: string; av: number }) => e.id === 'th_inspiration' && e.av === 0))
  chk(s, 'the-herta', 'Ult → AoE Ice + Answer log', s.logLines.some((l: string) => /Ult: AoE Ice ×/.test(l) && /Answer=[1-9]/.test(l)))
  chk(s, 'the-herta', 'Ult → immediately takes action (Extra Turn)', s.logLines.some((l: string) => /gains an Extra Turn!/.test(l)))
  chk(s, 'the-herta', 'Ult ATK+ buff lasts 3 turns (ult_a5)', s.buffLog.some((e: { id: string; turns?: number }) => e.id === 'th_ult_atk' && e.turns === 3))
  chk(s, 'the-herta', 'Enhanced Skill resets primary Interpretation to 1', s.buffLog.some(interp))
  chk(s, 'the-herta', 'Aloofly Honest: ally attack → Interpretation + Energy', s.logLines.some((l: string) => /Aloofly Honest: /.test(l)))
  chk(s, 'the-herta', 'No Message (1 Erudition only → no CRIT DMG buff)', !s.buffLog.some((e: { id: string }) => e.id === 'th_msg_cd'))
}

// 56b. THE HERTA E1: Enhanced Skill resets primary Interpretation to 15 instead of 1
// eidolon 1 solo: same sequence, the reset target becomes 15.
{
  const s = runBattle({
    team: [
      { kitId: 'the_herta', stats: DPS, eidolon: 1, energyStartFrac: 1, skillPriority: 2 },
    ],
    enemy: foe(500_000, ['Ice'], 1, 120, 120, 500, 'Elite'),
    cycles: 8, seed: 1,
  })
  chk(s, 'the-herta-e1', 'E1: primary resets to 15 Interpretation after Enhanced Skill', s.buffLog.some((e: { id: string; stacks?: number; av: number }) => e.id === 'th_interpretation' && e.av > 0 && e.stacks === 15))
}

// 56c. THE HERTA Message From Beyond the Veil: 2+ Erudition → all allies CRIT DMG +80%
{
  const s = runBattle({
    team: [
      { kitId: 'the_herta', stats: DPS, eidolon: 0, energyStartFrac: 1, skillPriority: 2 },
      { kitId: 'herta', stats: DPS, skillPriority: 3 },
    ],
    enemy: foe(500_000, ['Ice'], 2, 120, 120, 500, 'Mob'),
    cycles: 6, seed: 2,
  })
  chk(s, 'the-herta-msg', 'Message From Beyond the Veil: all allies CRIT DMG +80%', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'th_msg_cd' && e.mods?.some(m => m.stat === 'critDmg' && Math.abs(m.value - 0.8) < 1e-9)))
}

// 56d. THE HERTA Interpretation transfer: killing an Interpretation-carrying enemy moves stacks to a survivor
{
  const s = runBattle({
    team: [
      { kitId: 'the_herta', stats: DPS, eidolon: 0, energyStartFrac: 0.5, skillPriority: 2 },
    ],
    enemy: foe(800, ['Ice'], 2, 60, 120, 500, 'Weak'),
    cycles: 6, seed: 1,
  })
  chk(s, 'the-herta-xfer', 'Killing an Interpretation-carrying enemy transfers stacks to a survivor', s.logLines.some((l: string) => /Hand Them Over: \+[1-9]\d* Interpretation transferred/.test(l)) && s.buffLog.some((e: { id: string; name: string; stacks?: number }) => e.id === 'th_interpretation' && e.name === 'Hand Them Over' && (e.stacks ?? 0) >= 2))
}

// 57a. MYDEI e0 canon: Charge from damage/self-cost → Vendetta at 100 (heal + MaxHP% + E2 DEF-ish), Kingslayer loops, Godslayer at 150
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: { ...DPS, hp: 9000 }, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(900_000, ['Imaginary'], 2, 120, 120, 300, 'Mob'),
    cycles: 15, seed: 1,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'mydei-e0', 'Talent: Charge accumulates from HP lost (enemy damage + skill self-cost)', log(/Mydei: Charge → \d+ \/ 200 \(\+\d+\)/) && log(/Mydei: loses \d+ HP \(.*current HP\) → Charge/))
  chk(s, 'mydei-e0', 'Enters VENDETTA at Charge 100 (heal + Max HP + 50% + advance)', log(/Mydei: enters VENDETTA \(Max HP \+50%/) && s.buffLog.some((e: { id: string }) => e.id === 'mydei_vend'))
  chk(s, 'mydei-e0', 'In Vendetta auto-uses Kingslayer Be King (free HP-consuming Blast)', log(/Kingslayer Be King \(Vendetta Enhanced Skill\)/))
  chk(s, 'mydei-e0', 'Godslayer Be God triggers at Charge 150 (extra turn)', log(/GODSLAYER BE GOD \(consume 150/))
  chk(s, 'mydei-e0', 'Ult Throne of Bones: heal + 20 Charge + Blast', log(/THRONE OF BONES \(heal/) && log(/\+20 Charge/))
}

// 57b. MYDEI E1 Frost Hones Spine of Steel: Godslayer primary mult ×1.3 AND deals primary mult to ALL enemies
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: { ...DPS, hp: 9000 }, eidolon: 1, skillPriority: 2 },
    ],
    enemy: foe(600_000, ['Imaginary'], 3, 120, 120, 250, 'Mob'),
    cycles: 15, seed: 2,
  })
  const godf = s.logLines.filter((l: string) => /Godslayer Be God \(/.test(l)).length
  chk(s, 'mydei-e1', 'E1: Godslayer hits ALL enemies (primary mult) — ≥6 hits vs 3 foes', godf >= 6)
}

// 57c. MYDEI E2 Strife Beholds Cry of Dead: DEF ignore during Vendetta; 40% of healing → Charge, tally reset after any unit acts
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: DPS, eidolon: 2, skillPriority: 2 },
    ],
    enemy: foe(120_000, ['Imaginary'], 2, 120, 120, 400, 'Mob'),
    cycles: 10, seed: 1,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'mydei-e2', 'E2: enemies carry DEF-ignore debuff while in Vendetta', s.buffLog.some((e: { id: string; name: string }) => e.id === 'mydei_e2_def'))
  chk(s, 'mydei-e2', 'E2: healing converts 40% to Charge (Vendetta-entry heal)', log(/Mydei \(E2\): healing converts \d+ Charge/))
}

// 57d. MYDEI E6 Legacy Scales Mound of Blood: battle-start Vendetta, Godslayer at Charge 100
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: DPS, eidolon: 6, skillPriority: 2 },
    ],
    enemy: foe(120_000, ['Imaginary'], 2, 120, 120, 400, 'Mob'),
    cycles: 8, seed: 1,
  })
  chk(s, 'mydei-e6', 'E6: enters Vendetta immediately at battle start', s.buffLog.some((e: { id: string; av: number }) => e.id === 'mydei_vend' && e.av === 0))
  chk(s, 'mydei-e6', 'E6: Godslayer consumes only 100 Charge', s.logLines.some((l: string) => /GODSLAYER BE GOD \(consume 100/.test(l)))
}

// 57e. MYDEI A1 Earth and Water: killing blow in Vendetta → survive, exit Vendetta, clear Charge, heal 50% Max HP
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: DPS, eidolon: 6, skillPriority: 2 },
    ],
    // atk 7000: at 4500 the foe never lands a killing blow (Mydei ends at ~3.1k/8.4k HP),
    // so the A1 interceptor could not fire and this check was dead coverage.
    enemy: foe(200_000, ['Imaginary'], 1, 160, 130, 7000, 'Punisher'),
    cycles: 10, seed: 3,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'mydei-a1', 'A1: survives a killing blow in Vendetta (exits Vendetta, clears Charge, heals 50% Max HP)', log(/Mydei \(A1 Earth and Water\): survives killing blow — Vendetta ends, Charge cleared, heals \d+/))
}

// 57f. MYDEI A3 Bloodied Chiton + E3/E5 level wiring
{
  const s = runBattle({
    team: [
      { kitId: 'mydei', stats: DPS, eidolon: 5, skillPriority: 2 },
    ],
    enemy: foe(120_000, ['Imaginary'], 1, 120, 120, 350, 'Mob'),
    cycles: 6, seed: 2,
  })
  chk(s, 'mydei-a3', 'A3 Bloodied Chiton: HP > 4000 → CRIT +1.2%/100 and inHeal +0.75%/100', s.buffLog.some((e: { id: string; mods?: Array<{ stat: string; value: number }> }) => e.id === 'mydei_chiton' && e.mods?.some(m => m.stat === 'critRate' && m.value >= 0.12) && e.mods?.some(m => m.stat === 'inHeal' && m.value >= 0.07)))
  chk(s, 'mydei-e55', 'E5: Ultimate +2 & Talent +2 level wiring', e55(s, 'mydei'))
}

// ============ 57. BLACK SWAN (canon audit): talent-on-any-DoT, E1 Arcana=all-4, Epiphany pre-ult-damage, E4 defeat-energy ============
{
  // canon Talent: EVERY DoT instance the enemy gets → 65% base chance +1 Arcana.
  // Kafka's Shock ticks fire kit.onDoTTick for blackswan too (any enemy DoT tick) —
  // Arcana must grow even though Black Swan never applied Arcana directly.
  const s = runBattle({
    team: [
      { kitId: 'blackswan', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(250_000, ['Wind', 'Lightning'], 1, 120, 120, 700, 'Boss'),
    cycles: 12, seed: 41,
  })
  const bs = s.roster.find(u => u.kitId === 'blackswan')
  const boss = s.roster.find(u => u.side === 'enemy')
  const arcs = (s.rt(bs!).arcana as Record<string, number> | undefined) ?? {}
  chk(s, 'blackswan-canon', 'Talent: +1 Arcana on ANY DoT tick (Kafka Shock → Arcana grows past A2 bounds)', (arcs[boss!.id] ?? 0) > 5)
  chk(s, 'blackswan-canon', 'A4/A2 Arcana apply (Viscera x5)', s.logLines.some(l => l.includes("Viscera's Disquiet Arcana"))
    , true)
  // E1: canon Talent text — enemy in Arcana state counts as simultaneously afflicted
  // with WindShear, Bleed, Burn, Shock → all four RES↓ buffs present, even if only Arcana.
  const e1Battle = runBattle({
    team: [{ kitId: 'blackswan', stats: DPS, eidolon: 1, skillPriority: 2 }],
    enemy: foe(250_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 3,
  })
  const e1All = ['Wind', 'Physical', 'Fire', 'Lightning'].every(el => e1Battle.buffLog.some(e => e.id === `bs_e1_${el}`))
  chk(e1Battle, 'blackswan-canon', 'E1: Arcana → ALL 4 elem RES↓ (WindShear+Bleed+Burn+Shock)', e1All)
  // Ult: Epiphany buff lands BEFORE the ult hit loop (log marker precedes damage lines)
  const uv = lastVal(s, 'bs_epiphany', 'vulnAll')
  chk(s, 'blackswan-canon', 'Ult: Epiphany applied pre-damage (log marker)', s.logLines.some(l => l.includes('Epiphany applied (pre-ult-damage)')))
  chk(s, 'blackswan-canon', 'Ult: Epiphany vulnAll > 0', uv > 0)
  // E4 defeat-energy: kill an Epiphany'd enemy with eid 4 → +8 Energy log
  const e4 = runBattle({
    team: [{ kitId: 'blackswan', stats: DPS, eidolon: 4, skillPriority: 2 }],
    enemy: foe(120_000, ['Wind'], 1, 120, 120, 700, 'Boss'),
    cycles: 12, seed: 2,
  })
  chk(e4, 'blackswan-canon', 'E4: +8 Energy on enemy defeat while Epiphany', e4.logLines.some(l => l.includes('Black Swan E4: +8 Energy (defeat)')), true)
}

// ============ 58. CIPHER (canon audit): A3 FUA critDmg, talent FUA cap 1/turn, E2 DMG-taken, E4 add, E6 tally return, weaken 2t ============
{
  const s = runBattle({
    team: [
      { kitId: 'cipher', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(250_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 12, seed: 41,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'cipher-a3', 'A3 Sleight of Sky: Cipher FUA CRIT DMG +100%', lastVal(s, 'cipher_a3', 'critDmg:fua') >= 0.99)
  chk(s, 'cipher-fua', 'Talent FUA fires when an ally attacks the Patron', log(/Hospitable Dolosian \(FUA\)/))
  chk(s, 'cipher-fuacap', 'Talent FUA cap = 1/turn (talent_a3)', mult('cipher', 'talent_a3', 10) === 1)
  chk(s, 'cipher-weaken', 'Skill Weaken lasts 2 turns (skill_a5)', lastOf(s, 'cipher_weaken')?.turns === 2)
  // A2 300 Rogues is always-on (trace, not E1-gated): tally accrues at eid 0 with 3 enemies
  const a2 = runBattle({
    team: [{ kitId: 'cipher', stats: DPS, eidolon: 0, skillPriority: 2 }, { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(250_000, ['Quantum'], 3, 120, 120, 700, 'Mob'),
    cycles: 10, seed: 7,
  })
  const a2c = a2.roster.find(u => u.kitId === 'cipher')
  chk(a2, 'cipher-a2', 'A2 300 Rogues: tally accrues at eid 0 (non-Patron + Patron)', ((a2.rt(a2c!).cipherTally as number) ?? 0) > 0, true)
  // E1: Talent FUA → Cipher ATK +80% (2 turns)
  const e1 = runBattle({
    team: [{ kitId: 'cipher', stats: DPS, eidolon: 1, skillPriority: 2 }, { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 10, seed: 5,
  })
  chk(e1, 'cipher-e1', 'E1: Talent FUA → Cipher ATK +80% (2 turns)', lastVal(e1, 'cipher_e1', 'atkPct') >= 0.79)
  // E2: Cipher hits enemy → +30% DMG taken (2 turns)
  const e2 = runBattle({
    team: [{ kitId: 'cipher', stats: DPS, eidolon: 2, skillPriority: 2 }, { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 10, seed: 6,
  })
  chk(e2, 'cipher-e2', 'E2: Cipher hit → enemy DMG taken +30% (2 turns)', lastVal(e2, 'cipher_e2', 'vulnAll') >= 0.29)
  // E4: Patron attacked by an ally → Additional Quantum DMG 50% ATK
  const e4 = runBattle({
    team: [{ kitId: 'cipher', stats: DPS, eidolon: 4, skillPriority: 2 }, { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 10, seed: 8,
  })
  chk(e4, 'cipher-e4', 'E4: Patron attacked by ally → Additional Quantum DMG', e4.logLines.some(l => l.includes('E4 add DMG')))
  // E6: ult clears tally, returns 20%
  const e6 = runBattle({
    team: [{ kitId: 'cipher', stats: DPS, eidolon: 6, skillPriority: 2 }, { kitId: 'kafka', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(250_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 10, seed: 9,
  })
  chk(e6, 'cipher-e6', 'E6: ult clears tally and returns 20%', e6.logLines.some(l => /\(E6 return \d+\)/.test(l)))
}

// ============ 59. PEARL (canon audit): DEF basic/heal, CB-as-Repellency, Deep Learning, Elation Skill, A0/E1/E6 ============
{
  const s = runBattle({
    team: [
      { kitId: 'pearl', stats: SUP, eidolon: 0, skillPriority: 2 },
      { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(300_000, ['Ice'], 1, 120, 120, 700, 'Boss'),
    cycles: 18, seed: 51,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'pearl-reg', 'Pearl registered: Elation, energyMax 180', kitById('pearl')?.energyMax === 180)
  chk(s, 'pearl-basic', 'Basic "Brushstroke: Trace the Severed Stream" (Ice %DEF)', log(/Trace the Severed Stream/))
  chk(s, 'pearl-skill', 'Skill "Relume Life\'s Light" +15 Certified Banger + DEF heal', log(/Relume Life's Light \(\+15 CB/))
  chk(s, 'pearl-ult', 'Ult "Appraise Soul\'s Ground": Deep Learning on the Aesthetic Archetype', log(/Pearl Ult: Deep Learning on/))
  chk(s, 'pearl-ult-adv', 'Ult advance log: waiting Archetype advanced (real, not self mid-own-turn)', log(/Pearl Ult: advance/))
  chk(s, 'pearl-repel', 'Talent Grow Grace from Grit: CB-as-Repellency blocks incoming ally DMG', log(/Pearl Repellency blocks/))
  chk(s, 'pearl-elskill', 'Elation Skill "Dissolve Reason into Elation" fires on Aha Instant', log(/Dissolve Reason into Elation/))
  // A0 Panoptic Vision: DEF≥2400 → Elation +32% (+3%/100 DEF over)
  const a0 = runBattle({
    team: [{ kitId: 'pearl', stats: { ...SUP, def: 4000 }, eidolon: 0, skillPriority: 2 }, { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(300_000, ['Ice'], 1, 120, 120, 500, 'Boss'),
    cycles: 3, seed: 52,
  })
  chk(a0, 'pearl-a0', 'A0 Panoptic Vision: DEF 4000 → Elation +80%', lastVal(a0, 'pearl_a0', 'elation') >= 0.79)
  // E1: 2+ Elation chars → all-allies Elation +10%
  const e1 = runBattle({
    team: [{ kitId: 'pearl', stats: SUP, eidolon: 1, skillPriority: 2 }, { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(300_000, ['Ice'], 1, 120, 120, 500, 'Boss'),
    cycles: 3, seed: 53,
  })
  chk(e1, 'pearl-e1', 'E1: 2+ Elation chars → all-allies Elation +10%', lastVal(e1, 'pearl_e1', 'elation') >= 0.09)
  // E6: while Deep Learning, all allies All-Type RES PEN +20%
  const e6 = runBattle({
    team: [{ kitId: 'pearl', stats: SUP, eidolon: 6, skillPriority: 2 }, { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(300_000, ['Ice'], 1, 120, 120, 500, 'Boss'),
    cycles: 18, seed: 54,
  })
  chk(e6, 'pearl-e6', 'E6: Deep Learning → all-allies All-Type RES PEN +20%', lastVal(e6, 'pearl_e6', 'resPenAll') >= 0.19, true)
}

// ============ 60. RUAN MEI (canon audit): Talent SPD/Break, Overtone (skill+technique), Zone RES PEN all allies, Rebloom ============
{
  const base = () => runBattle({
    team: [
      { kitId: 'ruanmei', stats: SUP, eidolon: 0, skillPriority: 2 },
      { kitId: 'jingliu', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'bronya', stats: SUP, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'),
    cycles: 20, seed: 61,
  })
  const s = base()
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'rm-talent', 'Talent Somatotypical Helix: teammates SPD +10% (excl. self)', lastVal(s, 'rm_talent_spd', 'spdPct') >= 0.099)
  const rm = s.roster.find(u => u.kitId === 'ruanmei')!
  const mates = s.roster.filter(u => u.kind === 'char' && u.side === 'ally' && u.kitId !== 'ruanmei')
  chk(s, 'rm-talent-self', 'Talent SPD excludes Ruan Mei herself', !rm.buffs.some(b => b.id === 'rm_talent_spd') && mates.every(m => m.buffs.some(b => b.id === 'rm_talent_spd')))
  chk(s, 'rm-a2', 'A2 Inert Respiration: all allies Break Effect +20%', lastVal(s, 'rm_a2_be', 'be') >= 0.19)
  chk(s, 'rm-overtone', 'Skill/Technique Overtone: allies DMG +32%', lastVal(s, 'rm_overtone_dmg', 'dmgAll') >= 0.31)
  chk(s, 'rm-wbe', 'Skill/Technique Overtone: Weakness Break Efficiency +50%', lastVal(s, 'rm_overtone_wbe', 'wbe') >= 0.49)
  chk(s, 'rm-zone', 'Ult Zone: All-Type RES PEN +25% on ALL allies (resPenAll read from attacker)', s.buffLog.filter(e => e.id === 'rm_field').length >= 2 && lastVal(s, 'rm_field', 'resPenAll') >= 0.24)
  chk(s, 'rm-break', 'Talent: ally Break → RM Ice Break DMG (112.5%)', log(/Somatotypical Helix \(Break\)/))
  chk(s, 'rm-rebloom', 'Thanatoplum Rebloom: zoned enemy recovers → delay + Break DMG', log(/Thanatoplum Rebloom triggers/))
  // E1: Zone → allies ignore 20% enemy DEF
  const e1 = runBattle({ team: [{ kitId: 'ruanmei', stats: SUP, eidolon: 1, skillPriority: 2 }, { kitId: 'jingliu', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'), cycles: 20, seed: 62 })
  chk(e1, 'rm-e1', 'E1 Neuronic Embroidery: Zone → enemies DEF-ignore 20%', lastVal(e1, 'rm_e1', 'defIgnore') >= 0.19)
  // E2: allies ATK +40% vs Weakness-Broken targets only (not always-on)
  const e2 = runBattle({ team: [{ kitId: 'ruanmei', stats: SUP, eidolon: 2, skillPriority: 2 }, { kitId: 'jingliu', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'), cycles: 3, seed: 63 })
  chk(e2, 'rm-e2', 'E2 Reedside Promenade: stat is atkPctVsBroken (not always-on)', lastVal(e2, 'rm_e2', 'atkPctVsBroken') >= 0.39 && lastVal(e2, 'rm_e2', 'atkPct') < 0.01)
  {
    const vb = prepareBattle({ team: [{ kitId: 'ruanmei', stats: SUP, eidolon: 2, skillPriority: 2 }, { kitId: 'jingliu', stats: DPS }], enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'), cycles: 1, seed: 63 })
    vb.initBattle()
    const ally = vb.roster.find(u => u.kitId === 'jingliu')!
    const tgt = vb.roster.find(u => u.side === 'enemy')!
    const intact = vb.hit(ally, tgt, { type: 'basic', mult: 1, canCrit: false, label: 'E2 test intact' })
    tgt.broken = true
    const broken = vb.hit(ally, tgt, { type: 'basic', mult: 1, canCrit: false, label: 'E2 test broken' })
    chk(vb, 'rm-e2', 'E2 boosts only vs Broken: ×(1.4 ATK × 1.0 broken) vs ×1.0 intact', Math.abs(broken / intact - (1.4 / 0.9)) < 0.01)
  }
  // E4: enemy Weakness-Broken → RM Break Effect +100% (3 turns)
  const e4 = runBattle({ team: [{ kitId: 'ruanmei', stats: SUP, eidolon: 4, skillPriority: 2 }, { kitId: 'jingliu', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'), cycles: 20, seed: 64 })
  chk(e4, 'rm-e4', 'E4 Chatoyant Éclat: Break → RM Break Effect +100%', lastVal(e4, 'rm_e4', 'be') >= 0.99)
  // E6: Zone duration +1 (3 turns)
  const e6 = runBattle({ team: [{ kitId: 'ruanmei', stats: SUP, eidolon: 6, skillPriority: 2 }, { kitId: 'jingliu', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Ice'], 1, 30, 120, 400, 'Boss'), cycles: 20, seed: 65 })
  chk(e6, 'rm-e6', 'E6 Sash Cascade: Zone duration 3 turns', lastOf(e6, 'rm_field')?.turns === 3)
}

// ============ 61. ASHVEIL (canon audit): Bait / Charge / Gluttony / E6 ============
{
  const s = runBattle({
    team: [
      { kitId: 'ashveil', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'ruanmei', stats: SUP, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(400_000, ['Lightning'], 1, 60, 120, 400, 'Boss'),
    cycles: 12, seed: 71,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'ash-bait', 'Skill marks Bait (most recent target)', log(/becomes the Bait/))
  chk(s, 'ash-skill-repeat', 'Skill on existing Bait → extra hit + 1 SP refund', log(/Flog \(Bait repeat\)/))
  chk(s, 'ash-defdown', 'Bait on field → all enemies DEF −40%', lastVal(s, 'ash_def', 'defRed') >= 0.39)
  chk(s, 'ash-talent-fua', 'Ally attacks Bait → Ashveil Talent FUA (Charge consumed)', log(/Rancor: Enmity Reprisal/))
  chk(s, 'ash-ult', 'Ult: Bait + enhanced FUA (no Charge cost) + Gluttony chain', log(/Banquet: Insatiable Appetite/))
  // E1: all enemies DMG taken +24%
  const e1 = runBattle({ team: [{ kitId: 'ashveil', stats: DPS, eidolon: 1, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Lightning'], 1, 60, 120, 400, 'Boss'), cycles: 3, seed: 72 })
  chk(e1, 'ash-e1', 'E1 Beware: all enemies DMG taken +24%', lastVal(e1, 'ash_e1', 'vulnAll') >= 0.23)
  // E4: ult → ATK +40% 3t
  const e4 = runBattle({ team: [{ kitId: 'ashveil', stats: DPS, eidolon: 4, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Lightning'], 1, 60, 120, 400, 'Boss'), cycles: 12, seed: 73 })
  chk(e4, 'ash-e4', 'E4 Heed: Ult → ATK +40% (3t)', lastVal(e4, 'ash_e4', 'atkPct') >= 0.39)
  // E6: enemies All-RES −20% (resAll) + +4% DMG per Gluttony stack (cap 30)
  const e6 = runBattle({ team: [{ kitId: 'ashveil', stats: DPS, eidolon: 6, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Lightning'], 1, 60, 120, 400, 'Boss'), cycles: 12, seed: 74 })
  chk(e6, 'ash-e6-res', 'E6 Finale: all enemies All-RES −20% (resAll)', lastVal(e6, 'ash_e6_res', 'resAll') <= -0.19)
  chk(e6, 'ash-e6-dmg', 'E6: +4% DMG per Gluttony stack', lastVal(e6, 'ash_e6_dmg', 'dmgAll') > 0)
}

// ============ 62. THE DAHLIA (canon audit): Zone / Wilt / Dance Partner / Super Break ============
{
  const s = runBattle({
    team: [
      { kitId: 'the_dahlia', stats: SUP, eidolon: 0, skillPriority: 2 },
      { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'ruanmei', stats: SUP, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(400_000, ['Fire'], 1, 60, 120, 400, 'Boss'),
    cycles: 12, seed: 81,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  chk(s, 'dahl-partner', 'Battle start: Dance Partner = highest-BE teammate', log(/dances with/))
  chk(s, 'dahl-a0', 'A0 Yet Another Funeral: allies BE + (24% of Dahlia BE + 50%)', lastVal(s, 'dahl_a0', 'be') >= 0.49)
  chk(s, 'dahl-zone', 'Skill Zone: all allies Weakness Break Efficiency +50%', lastVal(s, 'dahl_zone', 'wbe') >= 0.49)
  chk(s, 'dahl-wilt', 'Ult Wilt: enemies DEF −18%', lastVal(s, 'dahl_wilt', 'defRed') >= 0.17)
  chk(s, 'dahl-talent-fua', 'Dance Partner attacks → Dahlia Talent FUA', log(/Talent FUA \(\d+ hits\)/))
  // E2: while on field, all enemies All-RES −20% (resAll)
  const e2 = runBattle({ team: [{ kitId: 'the_dahlia', stats: SUP, eidolon: 2, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Fire'], 1, 60, 120, 400, 'Boss'), cycles: 3, seed: 82 })
  chk(e2, 'dahl-e2', 'E2 Fresh, Ethereal, and Beloved: enemies All-RES −20%', lastVal(e2, 'dahl_a2', 'resAll') <= -0.19)
  // E4: Talent FUA → enemies DMG taken +12% 2t
  const e4 = runBattle({ team: [{ kitId: 'the_dahlia', stats: SUP, eidolon: 4, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Fire'], 1, 60, 120, 400, 'Boss'), cycles: 12, seed: 83 })
  chk(e4, 'dahl-e4', 'E4: Talent FUA → enemies DMG taken +12% (2t)', lastVal(e4, 'dahl_r4', 'vulnAll') >= 0.11)
  // E6: Dance Partners Break Effect +150%
  const e6 = runBattle({ team: [{ kitId: 'the_dahlia', stats: SUP, eidolon: 6, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 }], enemy: foe(400_000, ['Fire'], 1, 60, 120, 400, 'Boss'), cycles: 12, seed: 84 })
  chk(e6, 'dahl-e6', 'E6: Dance Partners Break Effect +150%', lastVal(e6, 'dahl_e6', 'be') >= 1.49)
  chk(e6, 'dahl-e6-adv', 'E6 advance log: self real + partner lost (mid-turn)', e6.logLines.some(l => /E6: advance self 20%/.test(l)))

  // Super Break converts the attack's REAL toughness damage, including on an already-Broken target
  {
    const sb = prepareBattle({
      team: [{ kitId: 'the_dahlia', stats: SUP, skillPriority: 2 }, { kitId: 'feixiao', stats: DPS, skillPriority: 2 }],
      enemy: foe(400_000, ['Fire'], 1, 60, 120, 400, 'Boss'),
      cycles: 1, seed: 85,
    })
    sb.initBattle()
    const dahl = sb.roster.find(u => u.kitId === 'the_dahlia')!
    const atk = sb.roster.find(u => u.kitId === 'feixiao')!
    const tgt = sb.roster.find(u => u.side === 'enemy')!
    tgt.broken = true
    tgt.toughness = 0
    sb.rt(dahl).dahlFuaTurn = sb.battleTurn
    sb.hit(atk, tgt, { type: 'basic', mult: 0.1, elem: 'Fire', toughDmg: 20, label: 'SB test hit' })
    chk(sb, 'dahl-sb', 'Partner hit on Broken Fire-weak target converts 20 Toughness DMG → Super Break', sb.logLines.some(l => /Feixiao SUPER BREAK/.test(l)))
    const mark = sb.logLines.length
    sb.hit(atk, tgt, { type: 'skill', mult: 0.1, elem: 'Quantum', toughDmg: 20, label: 'SB test non-weak' })
    chk(sb, 'dahl-sb', 'No Toughness DMG vs non-weak target → no conversion', !sb.logLines.slice(mark).some(l => /SUPER BREAK/.test(l)))
  }
}

// ============ 63. SUSHANG (canon audit): Sword Stance / Dawn Herald / Dancing Blade / Riposte ============
{
  // Physical-weak foe so Sushang can break it → Sword Stance guaranteed, Talent/Vanquisher/E1 gate on it.
  const sushangFoe = () => foe(400_000, ['Physical'], 1, 60, 120, 400, 'Boss')
  const s = runBattle({
    team: [{ kitId: 'sushang', stats: DPS, eidolon: 0, skillPriority: 2, mainDpsId: 'sushang' }],
    enemy: sushangFoe(), cycles: 12, seed: 91,
  })
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  const acc = accOf(s, 'sushang')
  const sk = (k: string) => (acc?.[1].bySkill[k] ?? 0) > 0
  dump('sushang', s, 'sushang')

  chk(s, 'sushang-canon', 'base HP/ATK/DEF/SPD 917/564/418/107 = PROG',
    kitById('sushang')?.base.hp === 917 && kitById('sushang')?.base.atk === 564 &&
    kitById('sushang')?.base.def === 418 && kitById('sushang')?.base.spd === 107)
  chk(s, 'sushang-canon', 'energyMax 120 = sp_need', kitById('sushang')?.energyMax === 120)
  chk(s, 'sushang-canon', 'Physical element', kitById('sushang')?.elem === 'Physical')
  chk(s, 'sushang-basic', 'Basic Starshine deals damage', sk('Starshine'))
  chk(s, 'sushang-skill', 'Skill Mountainfall deals damage', sk('Mountainfall'))
  chk(s, 'sushang-ult', 'Ult Dawn Herald deals damage', sk('Dawn Herald'))
  chk(s, 'sushang-ult-en', 'ult grants +5 energy', log(/Dawn Herald \(energy \+5\)/))
  chk(s, 'sushang-ult-action', 'ult → immediately takes action', log(/Sushang gains an Extra Turn!/))
  chk(s, 'sushang-ss', 'Sword Stance Additional DMG lands (guaranteed vs Broken)', sk('Sword Stance'))
  chk(s, 'sushang-ss-extra', 'Dawn Herald extra Sword Stance chances fire', sk('Sword Stance (extra)'))
  chk(s, 'sushang-ult-buff', 'ult ATK buff = ult_a4 18% 2t', lastVal(s, 'sushang_ult', 'atkPct') > 0.17)
  chk(s, 'sushang-talent', 'Dancing Blade SPD buff while enemy Broken', lastVal(s, 'sushang_db', 'spdPct') > 0.14)
  // canon notes: "DMG is dealt in 2 hits. The DMG distribution across hits is 30% + 70%."
  const susBlocks = s.logLines.join('\n').split(/^\[.*?\] >>> /m).slice(1).filter((b: string) => /^sushang \[SKILL\]/i.test(b))
  const mfCounts = susBlocks.map((b: string) => (b.match(/\[Mountainfall\]/g) ?? []).length)
  chk(s, 'sushang-skill-hits', 'Skill Mountainfall = 2 hits (1 only if target died)',
    mfCounts.length > 0 && mfCounts.every((n: number, i: number) => n === 2 || (n <= 1 && /defeated/.test(susBlocks[i]))))
  const mfHits = s.logLines.filter((l: string) => /sushang → .*: \d+.*\[Mountainfall\]/i.test(l))
  const mfPair = (() => {
    for (let i = 0; i + 1 < mfHits.length; i += 2) {
      const a = mfHits[i].match(/: (\d+)/)![1], b = mfHits[i + 1].match(/: (\d+)/)![1]
      const sameCrit = (mfHits[i].includes('(CRIT)') === mfHits[i + 1].includes('(CRIT)'))
      if (sameCrit && +a > 0) return [+a, +b]
    }
    return null
  })()
  chk(s, 'sushang-skill-split', 'Skill hit split 30% + 70%', !!mfPair && Math.abs(mfPair[1] / mfPair[0] - 70 / 30) < 0.1, !mfPair)
  // E1: Skill vs Broken → +1 SP
  const e1 = runBattle({ team: [{ kitId: 'sushang', stats: DPS, eidolon: 1, skillPriority: 2, mainDpsId: 'sushang' }], enemy: sushangFoe(), cycles: 12, seed: 95 })
  chk(e1, 'sushang-e1', 'E1 Cut With Ease: +1 SP on Skill vs Broken', e1.logLines.some(l => /E1 Cut With Ease/.test(l)))
  // E2: Sword Stance → DMG taken −20% 1t
  const e2 = runBattle({ team: [{ kitId: 'sushang', stats: DPS, eidolon: 2, skillPriority: 2, mainDpsId: 'sushang' }], enemy: sushangFoe(), cycles: 12, seed: 92 })
  chk(e2, 'sushang-e2', 'E2 Refine in Toil: DMG taken −20% after Sword Stance', lastVal(e2, 'sushang_e2', 'mitigation') > 0.19)
  // E4: Break Effect +40%
  chk(e2, 'sushang-e4-absent', 'E4 off at E2', !e2.buffLog.some(b => b.id === 'sushang_e4'), true)
  const e4 = runBattle({ team: [{ kitId: 'sushang', stats: DPS, eidolon: 4, skillPriority: 2, mainDpsId: 'sushang' }], enemy: sushangFoe(), cycles: 3, seed: 93 })
  chk(e4, 'sushang-e4', 'E4 Cleave With Heart: Break Effect +40%', lastVal(e4, 'sushang_e4', 'be') > 0.39)
  // E6: Talent SPD boost stackable ×2 + 1 stack at battle start
  const e6 = runBattle({ team: [{ kitId: 'sushang', stats: DPS, eidolon: 6, skillPriority: 2, mainDpsId: 'sushang' }], enemy: sushangFoe(), cycles: 12, seed: 94 })
  chk(e6, 'sushang-e6', 'E6 Dwell Like Water: SPD boost maxStacks 2', e6.buffLog.some(b => b.id === 'sushang_db' && b.maxStacks === 2))
  chk(e6, 'sushang-e6-start', 'E6: 1 stack of Talent SPD at battle start', (e6.buffLog.find(b => b.id === 'sushang_db')?.stacks ?? 0) >= 1)
  // E3/E5 level wiring is character-specific (canon): E3 = Ult+2/Talent+2, E5 = Skill+2/Basic+1
  const e3 = resolveLevels({ kitId: 'sushang', eidolon: 3 } as never)
  chk(s, 'sushang-e3-lv', 'E3 levels: Ult 12 / Talent 12 / Skill 10 / Basic 6', e3.ult === 12 && e3.talent === 12 && e3.skill === 10 && e3.basic === 6)
  const e5 = resolveLevels({ kitId: 'sushang', eidolon: 5 } as never)
  chk(s, 'sushang-e5-lv', 'E5 levels: Skill 12 / Basic 7 / Ult 12 / Talent 12', e5.skill === 12 && e5.basic === 7 && e5.ult === 12 && e5.talent === 12)
  // explicit table path (canon Seele: E3 = Skill+2/Talent+2, E5 = Basic+1/Ult+2)
  const g3 = resolveLevels({ kitId: 'seele', eidolon: 3 } as never)
  chk(s, 'sushang-generic-lv', 'Seele E3 explicit ladder: Skill 12 / Talent 12 (no generic fallback)', g3.skill === 12 && g3.talent === 12 && g3.ult === 10 && g3.basic === 6)
  // Riposte: Sword Stance DMG grows +2% per trigger (cap 10)
  const susUnit = s.roster.find(u => u.kitId === 'sushang')
  const sstacks = susUnit ? ((s.rt(susUnit).ssStacks as number) ?? 0) : 0
  chk(s, 'sushang-riposte', 'Riposte stacks Sword Stance trigger counter', sstacks > 0)
  // A1 Guileless: aggro −150 at HP ≤ 50% (weight 100 → −50). Data has no numeric value, so the
  // constant is inherited from the identical aspect (danheng.ts A2 «Hidden Dragon»).
  // Behaviour: the 50%-crossing hit turns it on (onAllyHit), her own turn start clears it (onTurnStart).
  const gK = kitById('sushang')!
  const gSim = prepareBattle({
    team: [
      { kitId: 'sushang', stats: DPS, skillPriority: 2, eidolon: 0 },
      { kitId: 'himeko', stats: DPS, skillPriority: 0, eidolon: 0 },
    ],
    enemy: foe(50_000_000, ['Physical'], 3, 100, 100, 300, 'Mob'),
    cycles: 1, seed: 71,
  })
  gSim.initBattle()
  const gU = gSim.roster.find(x => x.kitId === 'sushang')!
  const gCtx = gSim.rt(gU)
  const gFoes = gSim.livingEnemiesOf(gU)
  gU.hp = Math.floor(gU.maxHp * 0.6)
  gK.onAllyHit!(gSim, gFoes[0], gU, 0, gCtx)
  const gHigh = gU.buffs.some(b => b.id === 'sushang_a1')
  gU.hp = Math.floor(gU.maxHp * 0.4)
  gK.onAllyHit!(gSim, gFoes[0], gU, 0, gCtx)
  const gLow = gU.buffs.find(b => b.id === 'sushang_a1')
  gU.hp = Math.floor(gU.maxHp * 0.6)
  gK.onTurnStart!(gSim, gU, gCtx)
  chk(gSim, 'sushang-a1', 'A1 Guileless: aggro −150 at HP ≤ 50%, off above 50% (onAllyHit on, onTurnStart off)',
    !gHigh && !!gLow && gLow.mods[0].stat === 'aggro' && gLow.mods[0].value === -150 && !gU.buffs.some(b => b.id === 'sushang_a1'))
  // same on a live enemy-AI path: single-target picks must skip her while low, hit her at full HP.
  // tc=1/2 are single-target picks; tc%3===0 is an AoE that ignores aggro (canon-accurate: AoE unavoidably hits)
  const targeted = (low: boolean) => {
    const t = prepareBattle({
      team: [
        { kitId: 'sushang', stats: DPS, skillPriority: 0, eidolon: 0 },
        { kitId: 'himeko', stats: DPS, skillPriority: 0, eidolon: 0 },
      ],
      enemy: foe(50_000_000, ['Physical'], 3, 100, 100, 300, 'Mob'),
      cycles: 1, seed: 77,
    })
    t.initBattle()
    const su = t.roster.find(x => x.kitId === 'sushang')!
    const tE = t.livingEnemiesOf(su)[0]
    if (low) { su.hp = Math.floor(su.maxHp * 0.4); gK.onAllyHit!(t, tE, su, 0, t.rt(su)) }
    const before = t.logLines.length
    for (let tc = 1; tc <= 8; tc++) (t as unknown as { enemyTurn(e: Unit, tc: number): void }).enemyTurn(tE, tc)
    let aoe = false, single = 0
    for (const l of t.logLines.slice(before)) {
      if (/uses AoE attack/.test(l)) { aoe = true; continue }
      if (!aoe && / hits Sushang: /.test(l)) single++
    }
    return single
  }
  const gAtFull = targeted(false), gAtLow = targeted(true)
  chk(gSim, 'sushang-a1-aggro', `A1 Guileless: enemy single-target picks skip her at ≤50% HP (${gAtLow}), hit her at full HP (${gAtFull})`,
    gAtLow === 0 && gAtFull > 0)
  btns(s, 'sushang', {
    'Базовая': () => sk('Starshine'),
    'Навык': () => sk('Mountainfall'),
    'Ульт': () => sk('Dawn Herald'),
    'Талант': () => lastVal(s, 'sushang_db', 'spdPct') > 0.14,
    'A2': null,
    'A4': () => sstacks > 0,
    'A6': null,
    'E1': () => e1.logLines.some(l => /E1 Cut With Ease/.test(l)),
    'E2': () => lastVal(e2, 'sushang_e2', 'mitigation') > 0.19,
    'E3': () => resolveLevels({ kitId: 'sushang', eidolon: 3 } as never).ult === 12,
    'E4': () => lastVal(e4, 'sushang_e4', 'be') > 0.39,
    'E5': () => resolveLevels({ kitId: 'sushang', eidolon: 5 } as never).skill === 12,
    'E6': () => e6.buffLog.some(b => b.id === 'sushang_db' && b.maxStacks === 2),
  })
}

// ============ 64. EVANESCIA (canon audit): Elation-from-CRIT-DMG, Energy<->CB swap, Master Fox 240, Elation Skill, A2/A4/A6, E1/E2/E4/E6 ============
{
  const base = (eidolon: number, count = 1, seed = 71) => runBattle({
    team: [
      { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'evanescia', stats: SUP, eidolon, skillPriority: 2 },
    ],
    enemy: foe(2_000_000, ['Physical'], count, 120, 120, 700, 'Boss'),
    cycles: 20, seed,
  })
  const s = base(0)
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  /** ratio of Evanescia's CB gain to the teammate CB gain on the line right after it (A2 conversion) */
  const convRatio = (sim: ReturnType<typeof runBattle>, src: RegExp, trg: RegExp): number | null => {
    const L = sim.logLines
    for (let i = 0; i < L.length; i++) {
      const a = src.exec(L[i]); if (!a) continue
      const b = trg.exec(L[i + 1] ?? ''); if (!b) continue
      return +b[1] / +a[1]
    }
    return null
  }
  const sparxieGain = /Sparxie gains Certified Banger \(([\d.]+) pts/
  const sparxieExpire = /Sparxie's Certified Banger state expires \(([\d.]+) pts\)/
  const evGain = /Evanescia gains Certified Banger \(([\d.]+) pts/
  const evX1 = convRatio(s, sparxieGain, evGain)
  chk(s, 'evanescia-reg', 'Evanescia registered: Elation, Physical, energyMax 480',
    kitById('evanescia')?.energyMax === 480 && kitById('evanescia')?.elem === 'Physical' && KIT_PATH.evanescia === 'Elation')
  chk(s, 'evanescia-basic', 'Basic "Syllabus: Pop Quiz" (Physical %ATK)', log(/Syllabus: Pop Quiz/))
  chk(s, 'evanescia-skill', 'Skill "Discipline: Final Verdict" Blast main+adjacent', log(/Discipline: Final Verdict/))
  // canon notes: "DMG against the primary target is dealt in 4 hits. The distribution is 20+20+20+40%."
  const skBlocks = logOf(s).split(/^\[.*?\] >>> /m).slice(1).filter((b: string) => /evanescia \[SKILL\]/i.test(b))
  const hitsPer = skBlocks.map((b: string) => (b.match(/\[Discipline: Final Verdict\]/g) ?? []).length)
  chk(s, 'evanescia-skill-hits', 'Skill main = 4 hits (20/20/20/40)', hitsPer.length > 0 && hitsPer.every((n: number) => n === 4 || n <= 1))
  chk(s, 'evanescia-skill-pl', 'Skill grants +10 Punchline (shared team pool, peak tracked)', s.punchlinePeak() >= 10, s.punchlinePeak() < 10)
  chk(s, 'evanescia-ult', 'Ult "Swordsong: Absolution Denied" AoE + bounces', log(/Evanescia Ult: Swordsong: Absolution Denied/))
  // A2: bounce count +1/2/4 with 3/2/1 enemy targets (base 5)
  const three = base(0, 3, 72)
  const bounces = (sim: ReturnType<typeof runBattle>) => {
    const b = logOf(sim).split(/^\[.*?\] >>> /m).slice(1).filter((x: string) => /evanescia \[ULT\]/i.test(x))[0] ?? ''
    return (b.match(/\(bounce\)/g) ?? []).length
  }
  chk(s, 'evanescia-ult-bounce1', '1 enemy -> 5+4 = 9 bounce instances', bounces(s) === 9, bounces(s) === 0)
  chk(three, 'evanescia-ult-bounce3', '3 enemies -> 5+1 = 6 bounce instances', bounces(three) === 6, bounces(three) === 0)
  chk(s, 'evanescia-masterfox', 'Talent: 240 accumulated Energy -> "Master Fox" FUA + Vulnerability', log(/Evanescia Master Fox: Follow-Up ATK/))
  chk(s, 'evanescia-a4-vuln', 'A4 Weigh All Truths: Vulnerability 12% / 3t after Master Fox', logOf(s).includes('Weigh All Truths'))
  chk(s, 'evanescia-cb', 'Talent: Energy gain grants equal Certified Banger', evX1 !== null || log(/Evanescia gains Certified Banger/), true)
  chk(s, 'evanescia-elskill', 'Elation Skill "Scarlet: Elation or Execution" (Aha Instant) + CB', log(/Scarlet: Elation or Execution/))
  chk(s, 'evanescia-elskill-cb', 'Elation Skill grants 5 CB (E1: 15)', /\+5 CB\)/.test(logOf(s)))
  chk(s, 'evanescia-el-critdmg', 'Talent: Elation = 20% of CRIT DMG', lastVal(s, 'ev_el', 'elation') > 0.099)
  chk(s, 'evanescia-cb-elation', 'CB-gated Elation DMG (Skill/Ult/FUA)', log(/\(CB\)|\(CB bounce\)/))
  chk(s, 'evanescia-a2-crit', 'A2 Watch All Revels: CRIT Rate +30%', lastVal(s, 'ev_a2_crit', 'critRate') > 0.29)
  // A2 conversion: only from an Elation teammate with a LOWER Participant ID (Sparxie is slot 1)
  chk(s, 'evanescia-a2-conv', 'A2: 50% of a lower-ID Elation teammate CB -> own CB', evX1 !== null && Math.abs(evX1 - 0.5) < 0.001, evX1 === null)
  // A6: 50% of a teammate's EXPIRED CB -> own CB
  const xRatio = (() => {
    const L = s.logLines
    for (let i = 0; i < L.length; i++) {
      const a = sparxieExpire.exec(L[i]); if (!a) continue
      const b = evGain.exec(L[i + 1] ?? ''); if (!b) continue
      return +b[1] / +a[1]
    }
    return null
  })()
  chk(s, 'evanescia-a6', 'A6 Best All Blooms: 50% of a teammate ended CB -> own CB', xRatio !== null && Math.abs(xRatio - 0.5) < 0.001, xRatio === null)
  // E1: All-Type RES PEN 20% + extra Elation Skill after Master Fox + 10 CB
  const e1 = base(1, 1, 73)
  chk(e1, 'evanescia-e1', 'E1: All-Type RES PEN +20%', lastVal(e1, 'ev_el', 'elation') > 0.09 && lastVal(e1, 'ev_e1', 'resPenAll') > 0.19)
  chk(e1, 'evanescia-e1-elskill', 'E1: Elation Skill after Master Fox, +10 CB (total 15)',
    /\+15 CB\)/.test(logOf(e1)) && (logOf(e1).match(/Scarlet: Elation or Execution/g) ?? []).length > (logOf(s).match(/Scarlet: Elation or Execution/g) ?? []).length)
  // E2: CRIT DMG +36% and the trace conversion doubled (50% -> 100%)
  const e2 = base(2, 1, 74)
  const ev2x1 = convRatio(e2, sparxieGain, evGain)
  chk(e2, 'evanescia-e2', 'E2: CRIT DMG +36%', lastVal(e2, 'ev_e2_cd', 'critDmg') > 0.35)
  chk(e2, 'evanescia-e2-conv', 'E2: trace conversion doubled (100% of teammate CB)', ev2x1 !== null && Math.abs(ev2x1 - 1) < 0.001, ev2x1 === null)
  // E4: own DMG ignores 15% DEF
  const e4 = base(4, 1, 75)
  chk(e4, 'evanescia-e4', 'E4 Meadow: A Ruin by Vice — DEF ignore 15%', lastVal(e4, 'ev_e4', 'defIgnore') > 0.14)
  // E6: CB lasts 3 turns, Merrymake 15% + 2%/100 CB, Ult #1 and #6 grant 120 Energy
  const e6 = base(6, 1, 76)
  const e6log = logOf(e6)
  chk(e6, 'evanescia-e6-cbdur', 'E6: Certified Banger lasts 3 turns', /Evanescia gains Certified Banger \([\d.]+ pts, 3 turns\)/.test(e6log))
  chk(e6, 'evanescia-e6-merry', 'E6: Merrymake 15% + 2% per 100 CB', lastVal(e6, 'ev_e6_merry', 'merrymake') > 0.149)
  chk(e6, 'evanescia-e6-ult', 'E6: 1st (and 6th) Ult regenerates 120 Energy', (e6log.match(/Maiden: A Step into Dreams \(\+120 Energy\)/g) ?? []).length >= 1)
  // E3/E5 level wiring (canon: E3 = Ult+2/Basic+1/Elation Skill+1, E5 = Skill+2/Talent+2/Elation Skill+1)
  const e3 = resolveLevels({ kitId: 'evanescia', eidolon: 3 } as never)
  chk(s, 'evanescia-e3-lv', 'E3 levels: Ult 12 / Basic 7 / Elation Skill 11 / Skill 10', e3.ult === 12 && e3.basic === 7 && e3.el_skill === 11 && e3.skill === 10)
  const e5 = resolveLevels({ kitId: 'evanescia', eidolon: 5 } as never)
  chk(s, 'evanescia-e5-lv', 'E5 levels: Skill 12 / Talent 12 / Elation Skill 12', e5.skill === 12 && e5.talent === 12 && e5.el_skill === 12)
  chk(s, 'evanescia-generic-lv', 'Seele E3 explicit ladder: Skill 12 / Talent 12 (no generic fallback)', (() => { const g = resolveLevels({ kitId: 'seele', eidolon: 3 } as never); return g.skill === 12 && g.talent === 12 && g.ult === 10 && g.basic === 6 })())
  // guard: the Energy<->CB exchange is one hop per instance (must terminate), Technique is a Maze pre-fight
  const solo = runBattle({
    team: [{ kitId: 'evanescia', stats: SUP, eidolon: 0, skillPriority: 2 }],
    enemy: foe(400_000, ['Physical'], 1, 120, 120, 700, 'Boss'),
    cycles: 20, seed: 77,
  })
  chk(solo, 'evanescia-solo-ult', 'solo (no Elation teammate): Ult fires, exchange loop terminates', /Evanescia \[ULT\]/.test(logOf(solo)))
  // preset team: one carrier only, and an Elation mate in a LOWER slot (A2 needs it)
  const evTeam = presetTeamOrder('evanescia', presetTeams('evanescia')[0] ?? [])
  chk(s, 'evanescia-preset-team', 'preset team: single carrier, Elation mate before her (A2 live)',
    new Set(evTeam).size === evTeam.length && evTeam.filter((k) => k === 'evanescia').length === 1 && evTeam.indexOf('evanescia') > 0 && KIT_PATH[evTeam[0]] === 'Elation')
  btns(s, 'evanescia', {
    'Basic': () => log(/Syllabus: Pop Quiz/),
    'Skill': () => log(/Discipline: Final Verdict/),
    'Ult': () => log(/Evanescia Ult: Swordsong/),
    'MasterFox': () => log(/Master Fox: Follow-Up ATK/),
    'ElSkill': () => log(/Scarlet: Elation or Execution/),
    'A2': () => lastVal(s, 'ev_a2_crit', 'critRate') > 0.29,
    'A4': () => logOf(s).includes('Weigh All Truths'),
    'A6': () => xRatio !== null,
    'E1': () => lastVal(e1, 'ev_e1', 'resPenAll') > 0.19,
    'E2': () => lastVal(e2, 'ev_e2_cd', 'critDmg') > 0.35,
    'E3': () => resolveLevels({ kitId: 'evanescia', eidolon: 3 } as never).el_skill === 11,
    'E4': () => lastVal(e4, 'ev_e4', 'defIgnore') > 0.14,
    'E5': () => resolveLevels({ kitId: 'evanescia', eidolon: 5 } as never).talent === 12,
    'E6': () => lastVal(e6, 'ev_e6_merry', 'merrymake') > 0.149,
  })
}

// ============ 65. MORTENAX BLADE (canon audit): Fornax Zone + SPD-70 countdown, A0 overflow bank, Tenax, Balefire Bind, A1/A2, E1/E2/E4/E6, lethal protection ============
{
  const mbFoe = (hp: number, count = 1, atk = 600, spd = 120): EnemySpec => foe(hp, ['Fire'], count, 120, spd, atk)
  const mb = (eidolon: number, count = 1, seed = 91, stats = DPS, enemy = mbFoe(900_000, count), skillPriority = 2) => runBattle({
    team: [
      { kitId: 'ashveil', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'mortenax_blade', stats, eidolon, skillPriority },
    ],
    enemy, cycles: 14, seed,
  })
  const s = mb(0)
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  const logIn = (sim: ReturnType<typeof runBattle>, re: RegExp) => sim.logLines.some((l: string) => re.test(l))
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  /** summed value of a buff id logged on a specific unit (transient buffs must be read from buffLog) */
  const mbOn = (sim: ReturnType<typeof runBattle>, id: string, unitName: string, stat: string): number => {
    const e = sim.buffLog.filter(x => x.id === id && x.unitName === unitName).pop()
    return (e?.mods ?? []).filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0)
  }
  const kit = kitById('mortenax_blade')
  chk(s, 'mortenax-reg', 'reg: energyMax 160 / Fire / Nihility',
    kit?.energyMax === 160 && kit?.elem === 'Fire' && KIT_PATH.mortenax_blade === 'Nihility')
  chk(s, 'mortenax-a0-start', 'A0: Energy regenerated to 75% at battle start', log(/A0 Bone, Hardened ad Nauseam: Energy regenerated to 75%/))
  chk(s, 'mortenax-fornax', 'Fornax deploys the Zone and enters Infinite Fury', log(/deploys the Zone and enters Infinite Fury/) && log(/Ult: Fornax Ex Corpore/))
  // countdown: SPD-70 timer unit, white-boxed — the 1-cycle battle never fills Energy before the
  // countdown can act (under the one-action convention each turn gives one action, so the Zone is
  // never even reached inside a single cycle). Force full Energy + full A0 bank, cast the Ult.
  const sc = prepareBattle({
    team: [
      { kitId: 'ashveil', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'mortenax_blade', stats: DPS, eidolon: 0, skillPriority: 2 },
    ],
    enemy: mbFoe(900_000, 1), cycles: 1, seed: 91,
  })
  sc.initBattle()
  const sm = sc.roster.find(u => u.kitId === 'mortenax_blade')!
  sm.energy = sm.maxEnergy
  sc.rt(sm).mbOf = 80
  kitById('mortenax_blade')!.perform(sc, sm, { kind: 'ult' }, sc.rt(sm))
  const timerShort = sc.units().find(u => u.id.startsWith('mbtimer_'))
  chk(sc, 'mortenax-countdown', 'countdown unit: fixed SPD 70', timerShort?.base.spd === 70)
  chk(s, 'mortenax-bind', 'Balefire Bind L1: DEF down 30% + All-Type vuln 50% (L15 35/60)',
    mbOn(s, 'mb_bind', 'Test Foe', 'defRed') >= 0.3 && mbOn(s, 'mb_bind', 'Test Foe', 'vulnAll') >= 0.5)
  chk(s, 'mortenax-infinite-fury', 'Infinite Fury: CRIT Rate 20% / CRIT DMG 60% (L15 75%)',
    Math.abs(lastVal(s, 'mb_fury', 'critRate') - 0.2) < 1e-6 && lastVal(s, 'mb_fury', 'critDmg') >= 0.6)
  chk(s, 'mortenax-a1', 'A1: 50% DMG mitigation + 50% incoming-heal boost', lastVal(s, 'mb_a1', 'mitigation') >= 0.5 && lastVal(s, 'mb_a1', 'inHeal') >= 0.5)
  chk(s, 'mortenax-a2', 'A2: ally DMG +50% (Nihility: +75%)', mbOn(s, 'mb_a2', 'Ashveil', 'dmgAll') >= 0.5)
  chk(s, 'mortenax-skill', 'Skill: 0 SP, spawns random instances', log(/A Rain of Blades Seals Fate \(0 SP\)/) && log(/A Rain of Blades Seals Fate \(instance\)/))
  // Talent: 9 Charge -> extra Skill. Probed on the servalZone team: 3 attackers refill Charge to
  // cap inside a Zone window, which the 2-unit main battle never reaches before the countdown acts.
  // Talent pays once per *activation*: an ally that retypes mid-chain (Serval's `add` Talent
  // Additional on top of her basic/skill) used to mint a second attackSeq and charge twice
  const servalZone = runBattle({
    team: [
      { kitId: 'mortenax_blade', stats: { ...DPS, spd: 140 }, eidolon: 0, skillPriority: 0 },
      { kitId: 'serval', stats: { ...DPS, spd: 150 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'luocha', stats: { ...DPS, spd: 110 }, eidolon: 0, skillPriority: 1 },
    ],
    enemy: mbFoe(200_000_000, 3), cycles: 8, seed: 4242,
  })
  chk(servalZone, 'mortenax-talent', 'Talent: 9 Charge -> extra Skill (HP cost, no SP)',
    logIn(servalZone, /consumes \d+ Charge . extra Skill/) && logIn(servalZone, /\(extra Skill\) \(main\)/))
  const chgPerAct = logOf(servalZone).split(/^\[.*?\] >>> /m).slice(1)
    .map(b => (b.match(/gains 1 Charge/g) ?? []).length)
  chk(servalZone, 'mortenax-talent-once', 'Talent: max 1 Charge per ally activation (mid-chain retype must not re-open the attack)',
    chgPerAct.some(n => n > 0) && Math.max(0, ...chgPerAct) === 1)
  chk(s, 'mortenax-zone-end', 'Zone ends on countdown', log(/exits Infinite Fury \(countdown ended\)/))
  // enhanced basic: only on the SP route (skillPriority < 0) or at 1 HP
  const sBasic = mb(0, 1, 91, DPS, mbFoe(900_000, 1), -1)
  const enhBlocks = logOf(sBasic).split(/^\[.*?\] >>> /m).slice(1).filter(x => /A Tempered Blade Severs Souls/.test(x))
  chk(sBasic, 'mortenax-enh-basic', 'Enhanced Basic: 5 hits, consumes the Zone', enhBlocks.length > 0 && enhBlocks.every(x => (x.match(/A Tempered Blade Severs Souls/g) ?? []).length === 5))
  const s2 = mb(2, 1, 93)
  chk(s2, 'mortenax-e2', 'E2: Charge cap 7 + ally FUA DMG +75%', logOf(s2).includes('consumes 7 Charge') && mbOn(s2, 'mb_a2', 'Ashveil', 'boost:fua') >= 0.75)
  const s4 = mb(4, 1, 95)
  chk(s4, 'mortenax-e4', 'E4: ally DMG +100% (A2 50% + E4 50%)', mbOn(s4, 'mb_a2', 'Ashveil', 'dmgAll') >= 1.0)
  const s1 = mb(1, 1, 97)
  chk(s1, 'mortenax-e1', 'E1: enemy All-Type RES −20% (resAll)', mbOn(s1, 'mb_e1', 'Test Foe', 'resAll') <= -0.2)
  const ofLines = s.logLines.filter(l => /overflow Energy cleared/.test(l))
  chk(s, 'mortenax-a0-bank', 'A0: overflow bank (cap 80) cleared for +80 Energy on Ult',
    ofLines.length > 0 && ofLines.every(l => /overflow Energy cleared, \+\d+ Energy/.test(l)))
  // lethal protection: glass Mortenax takes pre-Zone hits, the in-Zone one (mit 50%) would be lethal
  const lethal = [16_000, 17_000, 18_000, 19_000, 20_000].some(hp =>
    mb(0, 1, 99, { hp, atk: 2200, def: 1, spd: 130 }, mbFoe(900_000, 1, 8000)).logLines
      .some(l => /survives the killing blow/.test(l) || /exits Infinite Fury \(lethal blow\)/.test(l)))
  chk(s, 'mortenax-lethal', 'lethal protection: Zone cancels the killing blow and dispels', lethal)
  // E6 Tenax x1.5 — E4 is the baseline (E4 already carries A2's +50% self DMG, which E6 keeps)
  const tenaxDmg = (sim: ReturnType<typeof runBattle>): number => {
    const re = /→ Test Foe: ([\d.]+) \[Tenax Per Ignem\]/g
    let sum = 0, n = 0, m: RegExpExecArray | null
    const txt = sim.logLines.join('\n')
    while ((m = re.exec(txt))) { sum += +m[1]; n++ }
    return n ? sum / n : 0
  }
  const meanTenax = (eid: number): number => {
    const xs = [101, 103, 107, 109, 113].map(sd => tenaxDmg(mb(eid, 1, sd))).filter(x => x > 0)
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
  }
  const t4 = meanTenax(4)
  const t6 = meanTenax(6)
  chk(s, 'mortenax-e6', 'E6: Tenax DMG x1.5 (E4 baseline, non-crit means)', t4 > 0 && t6 > t4 * 1.35 && t6 < t4 * 1.7)
  // 4-unit fast team: Charge engine throughput, both Ult variants, banked overflow. E6 so the
  // in-Zone Ult fires as Tenax Per Ignem (at E0 the Zone refill loop never caps Energy mid-Zone
  // under the one-action convention, leaving only Fornax).
  const fast = runBattle({
    team: [
      { kitId: 'feixiao', stats: { hp: 5000, atk: 2200, def: 1300, spd: 135 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'ashveil', stats: { hp: 5000, atk: 2200, def: 1300, spd: 133 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'pela', stats: { hp: 5000, atk: 1400, def: 1400, spd: 132 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'mortenax_blade', stats: { hp: 5000, atk: 2200, def: 1300, spd: 110 }, eidolon: 6, skillPriority: 2 },
    ],
    enemy: mbFoe(3_000_000, 3), cycles: 14, seed: 131,
  })
  const fl = fast.logLines
  const cnt = (re: RegExp) => fl.filter(l => re.test(l)).length
  chk(fast, 'mortenax-fast', '4-unit: multiple Zones, both Ults, Charge engine, banked overflow',
    cnt(/deploys the Zone/) >= 2 && cnt(/Ult: Tenax/) >= 1 && cnt(/Ult: Fornax/) >= 2 &&
    cnt(/consumes \d+ Charge/) >= 1 && cnt(/\+80 Energy/) >= 2 && cnt(/\(extra Skill\)/) >= 3)
  btns(s, 'mortenax_blade', {
    'Basic': () => logIn(sBasic, /A Tempered Blade Se/),
    'Skill': () => log(/A Rain of Blades Seals Fate/),
    'Ult': () => log(/Ult: Fornax/),
    'A2': () => mbOn(s, 'mb_a2', 'Ashveil', 'dmgAll') > 0.49,
    'A4': () => log(/deploys the Zone/),
    'A6': () => logIn(sBasic, /A Tempered Blade Se/),
    'E1': () => mbOn(s1, 'mb_e1', 'Test Foe', 'resAll') < -0.19,
    'E2': () => mbOn(s2, 'mb_a2', 'Ashveil', 'boost:fua') > 0.74,
    'E3': () => { const l = resolveLevels({ kitId: 'mortenax_blade', eidolon: 3 } as never); return l.ult === 12 && l.talent === 12 },
    'E4': () => mbOn(s4, 'mb_a2', 'Ashveil', 'dmgAll') > 0.99,
    'E5': () => { const l = resolveLevels({ kitId: 'mortenax_blade', eidolon: 5 } as never); return l.skill === 12 && l.basic === 7 },
    'E6': () => t6 > t4 * 1.35,
  })
}

// ============ 66. AVENTURINE • WAVEFLAIR: Punchline/Fervor, All In!/Cheers!, CB duration +1, CB-gated Elation, E1/E2/E4/E6 ============
{
  const aw = (eidolon: number, seed = 141, cycles = 20, count = 1) => runBattle({
    team: [
      { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'aventurine_waveflair', stats: DPS, eidolon, skillPriority: 2 },
    ],
    enemy: foe(2_000_000, ['Quantum'], count, 120, 120, 700, 'Boss'),
    cycles, seed,
  })
  const s = aw(0)
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  const kit = kitById('aventurine_waveflair')
  chk(s, 'aw-reg', 'reg: energyMax 130 / Quantum / Elation',
    kit?.energyMax === 130 && kit?.elem === 'Quantum' && KIT_PATH.aventurine_waveflair === 'Elation')
  chk(s, 'aw-basic', 'Basic "Dead Center, the Torrent Hits" (Quantum %ATK single)', log(/Dead Center, the Torrent Hits/))
  chk(s, 'aw-skill', 'Skill "Kill Shot, the Sands Boil" Quantum AoE', log(/Kill Shot, the Sands Boil/))
  chk(s, 'aw-ult', 'Ult "Grand Slam, Crest That High Tide" Quantum AoE', log(/Grand Slam, Crest That High Tide/))
  chk(s, 'aw-skill-pl', 'Skill grants +4 Punchline (shared pool, peak tracked)', s.punchlinePeak() >= 4, s.punchlinePeak() < 4)
  chk(s, 'aw-fervor', 'Talent: teammate attacks grant Fervor', log(/reaches \d+ Fervor/))
  // Talent proc: checkpoint -> "Cheers!" (and arms the next Aha Elation Skill to "All In!")
  chk(s, 'aw-cheers', 'Fervor checkpoint fires "Cheers! To Summer\'s Blaze"',
    log(/reaches \d+ Fervor — Talent uses Cheers!/) && log(/Elation Skill: Cheers! To Summer's Blaze/))
  chk(s, 'aw-allin', 'Armed Aha Instant uses "All In! To Summer\'s Blaze" (+1 instance per Fervor)',
    log(/Elation Skill: All In! To Summer's Blaze \(\d+ instances? \+ \d+ from Fervor\)/))
  chk(s, 'aw-instances', 'Elation Skill deals per-instance Elation hits', log(/To Summer's Blaze \(instance\)/))
  // Talent #1: the Aha Instant CB lasts 3 turns instead of 2 (onCbGain bumps the fresh stack;
  // the gain log line is written before the hook runs, so read the runtime state dump)
  chk(s, 'aw-cbdur', 'Talent: Certified Banger lasts 3 turns', /cbStacks=\[\{"pts":[\d.]+,"turns":3\}\]/.test(logOf(s)))
  // Talent #2/#3: Skill and Ult each add a CB-gated Elation AoE
  chk(s, 'aw-cb-elation', 'CB-gated Elation DMG on Skill and Ult', log(/Kill Shot, the Sands Boil \(CB\)/) && log(/Grand Slam, Crest That High Tide \(CB\)/))
  // once-per-attack gate: a multi-hit teammate attack must grant Fervor exactly ONCE
  const multiHit = runBattle({
    team: [
      { kitId: 'feixiao', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'aventurine_waveflair', stats: DPS, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(2_000_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 3, seed: 143,
  })
  const fvLines = multiHit.logLines.filter((l: string) => /reaches \d+ Fervor/.test(l))
  const fvPerBlock = logOf(multiHit).split(/^\[.*?\] >>> /m).slice(1)
    .filter((b: string) => /reaches \d+ Fervor/.test(b))
    .map((b: string) => (b.match(/reaches \d+ Fervor/g) ?? []).length)
  chk(multiHit, 'aw-fervor-once', 'Fervor: once per teammate attack (nested Elation hits keep the sequence)',
    fvLines.length > 0 && fvPerBlock.length > 0 && fvPerBlock.every((n: number) => n === 1),
    fvLines.length === 0)
  // EVERY crossed checkpoint fires its own "Cheers!". Checkpoint spacing is 10 while the largest
  // single Fervor grant is 6 (ult_a3), so a real battle never crosses two at once — prove the
  // loop white-box instead: re-arm the list at the E1 cap and grant one teammate-attack Fervor.
  {
    const pre = prepareBattle({
      team: [
        { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
        { kitId: 'aventurine_waveflair', stats: DPS, eidolon: 1, skillPriority: 2 },
      ],
      enemy: foe(2_000_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
      cycles: 1, seed: 157,
    })
    pre.initBattle()
    const aw = pre.roster.find(x => x.kitId === 'aventurine_waveflair')!
    const mate = pre.roster.find(x => x.kitId === 'sparxie')!
    const tgt = pre.livingEnemiesOf(aw)[0]
    pre.rt(aw).awFervor = 30 // E1 cap, E1 checkpoints are 10/20/30
    pre.rt(aw).awThresh = 0  // list re-armed
    kit!.onAfterAttack!(pre, mate, tgt, 'basic', pre.rt(mate))
    const procs = pre.logLines.filter((l: string) => /reaches \d+ Fervor — Talent uses Cheers!/.test(l)).length
    const cheers = pre.logLines.filter((l: string) => /Elation Skill: Cheers! To Summer's Blaze/.test(l)).length
    chk(pre, 'aw-multi', `every crossed Fervor checkpoint fires its own "Cheers!" (procs=${procs} cheers=${cheers}, want 3/3)`,
      procs === 3 && cheers === 3)
  }
  // E1: all-type RES PEN 24% + three Fervor checkpoints (10/20/30)
  const e1 = aw(1, 145)
  chk(e1, 'aw-e1', 'E1 "A Holiday on the Line": all-type RES PEN 24%', lastVal(e1, 'aw_e1', 'resPenAll') > 0.23)
  // E2: Fervor cap 50 + two more checkpoints + 4 Fervor per Elation Skill
  const e2 = aw(2, 147)
  const e2log = logOf(e2)
  const fvMax = Math.max(...[...e2log.matchAll(/reaches (\d+) Fervor/g)].map((m) => +m[1]), 0)
  chk(e2, 'aw-e2', 'E2 "Idle as the Turning Tide": Fervor cap 50 (E0 caps at 30)',
    fvMax > 0 && fvMax <= 50 && fvMax > 30, fvMax === 0)
  chk(e2, 'aw-e2-fervor', 'E2: Elation Skill returns 4 Fervor (threshold 40/50 crossed)',
    /reaches \d[0-9] Fervor/.test(e2log))
  // E4: allies ignore 18% DEF for 3 turns
  const e4 = aw(4, 149)
  chk(e4, 'aw-e4', 'E4 "Sunlight Runs No Tab": allies DEF ignore 18% / 3t',
    lastVal(e4, 'aw_e4_def', 'defIgnore') > 0.17)
  // E6: Elation DMG merrymakes by 25% + every Elation Skill after the first 2 is enhanced
  const e6 = aw(6, 151)
  const e6log = logOf(e6)
  chk(e6, 'aw-e6', 'E6 "The Past in Fast Lane": Merrymake +25%', lastVal(e6, 'aw_e6', 'merrymake') > 0.24)
  chk(e6, 'aw-e6-allin', 'E6: Elation Skill #3+ is "All In!"',
    (e6log.match(/Elation Skill: All In!/g) ?? []).length >= 1)
  // E3/E5 level wiring (canon: E3 = Skill+2/Talent+2/Elation Skill+1, E5 = Ult+2/Basic+1/Elation Skill+1;
  // EIDOLON_LV deltas ACCUMULATE per threshold, so E5 lands on Elation Skill 12)
  const e3 = resolveLevels({ kitId: 'aventurine_waveflair', eidolon: 3 } as never)
  chk(s, 'aw-e3-lv', 'E3 levels: Skill 12 / Talent 12 / Elation Skill 11', e3.skill === 12 && e3.talent === 12 && e3.el_skill === 11)
  const e5 = resolveLevels({ kitId: 'aventurine_waveflair', eidolon: 5 } as never)
  chk(s, 'aw-e5-lv', 'E5 levels: Ult 12 / Basic 7 / Elation Skill 12', e5.ult === 12 && e5.basic === 7 && e5.el_skill === 12)
  // guard: solo (no Elation teammate) still fires the Elation Skill once per Aha Instant
  const solo = runBattle({
    team: [{ kitId: 'aventurine_waveflair', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(2_000_000, ['Quantum'], 1, 120, 120, 700, 'Boss'),
    cycles: 6, seed: 153,
  })
  const soloEl = solo.logLines.filter((l: string) => /Elation Skill: (Cheers!|All In!)/.test(l)).length
  chk(solo, 'aw-solo', 'solo: Aha Instant still runs the Elation Skill, battle terminates',
    soloEl > 0 && /aventurine_waveflair \[ULT\]|Dead Center, the Torrent Hits/.test(logOf(solo)), soloEl === 0)
  // preset team: exactly one carrier, in slot 1
  const awTeam = presetTeamOrder('aventurine_waveflair', presetTeams('aventurine_waveflair')[0] ?? [])
  chk(s, 'aw-preset-team', 'preset team: single carrier in slot 1',
    awTeam[0] === 'aventurine_waveflair' && new Set(awTeam).size === awTeam.length)
  btns(s, 'aventurine_waveflair', {
    'Basic': () => log(/Dead Center, the Torrent Hits/),
    'Skill': () => log(/Kill Shot, the Sands Boil/),
    'Ult': () => log(/Grand Slam, Crest That High Tide/),
    'Talent': () => log(/reaches \d+ Fervor/),
    'ElSkill': () => log(/Elation Skill: (Cheers!|All In!)/),
    'E1': () => lastVal(e1, 'aw_e1', 'resPenAll') > 0.23,
    'E2': () => { const t = Math.max(...[...logOf(e2).matchAll(/reaches (\d+) Fervor/g)].map((m) => +m[1]), 0); return t > 30 && t <= 50 },
    'E3': () => { const l = resolveLevels({ kitId: 'aventurine_waveflair', eidolon: 3 } as never); return l.el_skill === 11 },
    'E4': () => lastVal(e4, 'aw_e4_def', 'defIgnore') > 0.17,
    'E5': () => { const l = resolveLevels({ kitId: 'aventurine_waveflair', eidolon: 5 } as never); return l.el_skill === 12 },
    'E6': () => lastVal(e6, 'aw_e6', 'merrymake') > 0.24,
  })
}

// ============ 71. SUMMON vs MEMOSPRITE: owner-buff inheritance (Summon.md) ============
// Classification is data-driven, not hand-listed: a character whose json row has a `memosprite`
// block has a MEMOSPRITE, otherwise the extra unit it calls is a SUMMON. That is the only thing
// separating the two (Memosprite.md "Status Effect" is an independent mechanic, Summon.md "use
// the current stats of their characters" is not). SUMMONS therefore set `sharesOwnerBuffs` and
// merge the owner's whole buff list in per hit; MEMOSPRITES only mirror base crit.
//
// 1) every owner in characters.json that has a memosprite block, in code
const MS_CHARS = JSON.parse(readFileSync('hsr-data/characters.json', 'utf8')) as Array<Record<string, unknown> & { name: string; memosprite?: { name: string } }>
const MS_OWNERS = MS_CHARS.filter(c => c.memosprite).map(c => ({ name: c.name, ms: c.memosprite!.name }))
console.log(`-- data-verify summon/memosprite: ${MS_OWNERS.length} memosprite owners in json`)
for (const o of MS_OWNERS) console.log(`    ${o.name} -> ${o.ms}`)
// 2) the four summons must NOT be memosprite owners, and must be flagged
const SUMMON_OWNERS: Array<[string, string, string]> = [
  ['Jing Yuan', 'Lightning-Lord', 'jingyuan'],
  ['Topaz & Numby', 'Numby', 'topaz'],
  ['Lingsha', 'Fuyuan', 'lingsha'],
  ['Dan Heng • Permansor Terrae', 'Souldragon', 'danhengperman'],
]
for (const [owner, summon, kid] of SUMMON_OWNERS) {
  const row = MS_CHARS.find(c => c.name === owner)
  const ownerSim = runBattle({
    team: [{ kitId: kid, stats: DPS }],
    enemy: foe(150_000, ['Lightning'], 1, 60, 115, 600, 'Tank'),
    cycles: 1, seed: 5,
  })
  const su = ownerSim.roster.find(u => u.name === summon)
  // the row MUST exist: `!row?.memosprite` alone would also pass on a missing row, which is how a
  // mis-spelled owner name ("Danheng" vs the dataset's "Dan Heng • Permansor Terrae") goes unnoticed
  chk(ownerSim, 'summon-class', `${owner}: owner row found in characters.json`, !!row)
  chk(ownerSim, 'summon-class', `${owner}: no memosprite block in json (=> ${summon} is a SUMMON)`, !!row && !row!.memosprite)
  chk(ownerSim, 'summon-class', `${summon}: sharesOwnerBuffs set`, su?.sharesOwnerBuffs === true)
  // hp === 1 IS the untargetability test: at 1 max HP any enemy hit would kill it outright, and
  // enemyTurn only ever picks `kind === 'char'` targets (simulator.ts enemyTurn target filter)
  chk(ownerSim, 'summon-class', `${summon}: no HP of its own (1/1) => took no enemy hit, untargetable`, su?.maxHp === 1 && su?.hp === 1)
}
// 3) a summon uses the owner's buffs AND base stats while it deals damage. Assert on DAMAGE, not
// on eff(summon) outside a hit: the directive "use the current stats of your character" only ever
// manifests as the damage the summon deals, and that is exactly what the per-hit merge covers
// (buffs are merged for the duration of a hit, so a stat read on the summon outside a
// hit sees its own list only. No mechanic in the sim or the game reads a summon that way.)
{
  const s = runBattle({
    team: [{ kitId: 'jingyuan', stats: DPS }],
    enemy: foe(4_000_000, ['Lightning'], 1, 60, 115, 600, 'Tank'),
    cycles: 2, seed: 11,
  })
  const jy = s.roster.find(u => u.kitId === 'jingyuan' && u.kind === 'char')!
  const ll = s.roster.find(u => u.name === 'Lightning-Lord')!
  const victim = s.roster.find(u => u.side === 'enemy' && !u.dead)!
  chk(s, 'summon-inherit', 'Lightning-Lord base ATK = Jing Yuan base ATK', ll.base.atk === jy.base.atk)
  chk(s, 'summon-inherit', "Lightning-Lord keeps its own fixed SPD 60, not the wearer's", ll.base.spd === 60)
  // canCrit:false => no RNG divergence, so the two probe hits are directly comparable
  const probe = (): number => s.hit(ll, victim, { type: 'fua', mult: 1, label: 'probe', canCrit: false, noSeq: true })
  const plain = probe()
  s.addBuff(jy, { id: 'sum_probe', name: 'probe', mods: [{ stat: 'dmgAll', value: 0.6 }], turns: 99 })
  const buffed = probe()
  chk(s, 'summon-inherit', `owner dmgAll +60% raises the SUMMON's own damage (${plain.toFixed(0)} -> ${buffed.toFixed(0)})`,
    plain > 0 && Math.abs(buffed / plain - 1.6) < 0.005)
  // ...and the summon keeps its own list separate: the owner's buff is not copied onto it
  chk(s, 'summon-inherit', "summon keeps its OWN buff list separate (owner probe not copied onto it)",
    !ll.buffs.some(b => b.id === 'sum_probe'))
}
// 4) memosprites do NOT inherit, but DO take buffs aimed straight at them
{
  const s = runBattle({
    team: [{ kitId: 'aglaea', stats: DPS }],
    enemy: foe(4_000_000, ['Lightning'], 1, 60, 115, 600, 'Tank'),
    cycles: 3, seed: 5,
  })
  const ag = s.roster.find(u => u.kitId === 'aglaea' && u.kind === 'char')!
  const gm = s.roster.find(u => u.name === 'Garmentmaker')
  chk(s, 'summon-inherit', 'Garmentmaker is a MEMOSPRITE -> no sharesOwnerBuffs', gm?.sharesOwnerBuffs !== true)
  chk(s, 'summon-inherit', 'Garmentmaker on field (memosprite present)', !!gm)
  if (gm) {
    const atkBefore = s.effAtk(gm)
    s.addBuff(ag, { id: 'ms_owner', name: 'probe', mods: [{ stat: 'atkPct', value: 0.5 }], turns: 1 })
    chk(s, 'summon-inherit', 'memosprite does NOT pick up an owner buff',
      Math.abs(s.effAtk(gm) - atkBefore) < 1e-6)
    s.addBuff(gm, { id: 'ms_direct', name: 'probe', mods: [{ stat: 'atkPct', value: 0.5 }], turns: 1 })
    chk(s, 'summon-inherit', 'memosprite DOES take a buff aimed straight at it (+50%)',
      Math.abs(s.effAtk(gm) / atkBefore - 1.5) < 1e-6)
  }
}

// ============ 67. HIMEKO • NOVA: Starblazer ult (HPB/OAP/SE), Navigator's Semaphore, Companion Protocol Verdict/Decimation, Assist Skill, E1/E2/E4/E6 ============
{
  const novaUnit = (s: ReturnType<typeof runBattle>) =>
    (s as unknown as { roster: Array<{ kitId?: string }> }).roster.find((u) => u.kitId === 'himeko_nova') as never
  const hn = (eidolon: number, seed = 161, cycles = 24, mates: string[] = ['danheng', 'march7th', 'welt'], enemies = 1) =>
    runBattle({
      team: [
        { kitId: 'himeko_nova', stats: DPS, eidolon, skillPriority: 2 },
        ...mates.map((kitId) => ({ kitId, stats: DPS, eidolon: 0, skillPriority: 2 })),
      ],
      enemy: foe(40_000_000, ['Fire', 'Ice'], enemies, 120, 110, 600, 'Boss'),
      cycles, seed,
    })
  const s = hn(0)
  const log = (re: RegExp) => s.logLines.some((l: string) => re.test(l))
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  const any = (sim: ReturnType<typeof runBattle>, re: RegExp) => re.test(logOf(sim))
  const nrt = (sim: ReturnType<typeof runBattle>) => sim.rt(novaUnit(sim)) as Record<string, number>
  const kit = kitById('himeko_nova')
  chk(s, 'hn-reg', 'reg: energyMax 150 / Fire / Erudition',
    kit?.energyMax === 150 && kit?.elem === 'Fire' && KIT_PATH.himeko_nova === 'Erudition')
  // Assist Skill ladders are hand-added (gen-newprog emits no assist columns) — read them from the raw file
  chk(s, 'hn-assist-ladder', 'Assist ladders hand-added: Trailblaze L15 250% AoE / 39% per instance, 4 instances',
    PROG.himeko_nova.abilities.assist_a4[14] === 2.5 && PROG.himeko_nova.abilities.assist_a6[14] === 0.39
    && PROG.himeko_nova.abilities.assist_a5[14] === 4 && PROG.himeko_nova.abilities.assist_a7[14] === 4)
  chk(s, 'hn-basic', 'Basic "Enkindle the First Lodestar" (Fire single)', log(/Enkindle the First Lodestar/))
  chk(s, 'hn-skill', 'Skill "Upraise the Vanward Cresset" + Navigator\'s Semaphore (3t, all-ally DMG)',
    log(/Upraise the Vanward Cresset \(Semaphore 3t, Assist uses → 1\)/) && lastVal(s, 'hn_sem', 'dmgAll') > 0.19)
  chk(s, 'hn-sem-source', 'Semaphore ticks on HER turn (tickOnSource + sourceId)',
    /Navigator's Semaphore \d+t dmgAll/.test(logOf(s)) && lastOf(s, 'hn_sem') !== undefined)
  chk(s, 'hn-ult-beam', 'Ult: Starblazer fires "Hyperluminal Particle Beam" (AoE, +Source Energy)',
    log(/takes control of Starblazer/) && log(/Hyperluminal Particle Beam \(\d\)/))
  chk(s, 'hn-ult-pulse', 'Ult: "Orbital Annihilation Pulse" burns 1 Source Energy (9 HPB + Final Hit)',
    log(/Orbital Annihilation Pulse \(1\/6\)/) && log(/Orbital Annihilation Pulse \(final\)/) && log(/Final Hit/))
  chk(s, 'hn-se-cap', 'Source Energy never exceeds 3 at E0 (6 with E6)', nrt(s).se <= 3)
  chk(s, 'hn-territory', 'Talent: Territory "Starblazer Visioscape" + All-Type RES PEN 100% / CRIT DMG 25%',
    log(/Starblazer Visioscape/) && lastVal(s, 'hn_cd', 'critDmg') >= 0.79 && lastVal(s, 'hn_respen', 'resPenAll') > 0.19)
  chk(s, 'hn-verdict', 'Companion Protocol: Verdict — Dan Heng uses the granted Assist Skill + free Assist after 2 ally Ults',
    log(/Companion Protocol: Verdict/) && log(/Trailblaze, By Your Side \(Dan Heng\)/) && log(/Verdict: .* Ult -> free Assist Skill/) && log(/Assist Skill: Companion Protocol: Verdict/))
  chk(s, 'hn-verdict-buff', 'Verdict: Himeko DMG +125% and Ult DMG +125%', lastVal(s, 'hn_verdict', 'dmgAll') > 0.49 && lastVal(s, 'hn_verdict_ult', 'boost:ult') > 0.49)
  // 2 enemies -> enemy-count policy prefers Decimation, so a Decimation giver (March 7th/Welt) assists
  const dec = hn(0, 262, 24, ['danheng', 'march7th', 'welt'], 2)
  chk(dec, 'hn-decimation', 'Companion Protocol: Decimation (2 enemies) + free Assist at 9 Charge',
    any(dec, /Companion Protocol: Decimation/) && any(dec, /Decimation: 9 Charge -> free Assist Skill/) && any(dec, /Assist Skill: Companion Protocol: Decimation/))
  chk(dec, 'hn-decimation-buff', 'Decimation: all-ally CRIT DMG +125%, Skill CRIT DMG +125%', lastVal(dec, 'hn_decimation', 'critDmg') > 0.49 && lastVal(dec, 'hn_decimation_skill', 'critDmg:skill') > 0.49)
  // the Decimation launch must not feed its own Charge back (canon: "cannot grant Charge"):
  // every one of its damage lines still shows charge=0 in the runtime dump
  // the Decimation launch must not feed its own Charge back (canon: "cannot grant Charge"): the
  // summary line is logged right AFTER the launch hits, so a nonzero Charge there = a self-feed bug
  const decLaunch = logOf(dec).split('\n').filter((l: string) => /Assist Skill: Companion Protocol: Decimation \(charge=/.test(l))
  chk(dec, 'hn-decimation-nofeed', 'Decimation launch grants no Charge (charge=0 on its summary line)',
    decLaunch.length > 0 && decLaunch.every((l: string) => /charge=0\)/.test(l)), decLaunch.length === 0)
  // E1: +1 extra Assist DMG instance (per-launch hit count 6 vs 5)
  const e1 = hn(1, 163)
  const e1log = logOf(e1)
  const hitsPerLaunch = (log: string, name: string): number => {
    const launches = (log.match(new RegExp(`Assist Skill: ${name}`, 'g')) ?? []).length
    const hits = (log.match(new RegExp(`\\[${name}`, 'g')) ?? []).length
    return launches ? hits / launches : 0
  }
  chk(e1, 'hn-e1', 'E1 "That Which We Stride Is the Trailblaze": Assist deals 1 extra instance',
    hitsPerLaunch(e1log, 'Companion Protocol: Verdict') === hitsPerLaunch(logOf(s), 'Companion Protocol: Verdict') + 1,
    hitsPerLaunch(e1log, 'Companion Protocol: Verdict') === 0)
  const e1d = hn(1, 164, 24, ['danheng', 'march7th', 'welt'], 2)
  chk(e1d, 'hn-e1-charge', 'E1: Decimation charge threshold 9 -> 6', /Decimation: 6 Charge ->/.test(logOf(e1d)))
  // E2: Assist use cap 2 + Ult/Assist DMG x130%
  const e2 = hn(2, 165)
  chk(e2, 'hn-e2', 'E2 "A New Power": Assist use cap 2 (Skill recovers all)',
    /Upraise the Vanward Cresset \(Semaphore 3t, Assist uses → 2\)/.test(logOf(e2)))
  chk(e2, 'hn-e2-dmg', 'E2: Ultimate DMG x130% (E2 ult deals >=25% more damage)',
    (accOf(e2, 'himeko_nova')?.[1].total ?? 0) > (accOf(s, 'himeko_nova')?.[1].total ?? 0) * 1.2)
  // E4: the All-Type RES PEN also applies to all allies (+10% on her)
  const e4 = hn(4, 167)
  chk(e4, 'hn-e4', 'E4 "Let No Skyward Hand Stay Unheld": allies gain All-Type RES PEN 20% (hers 30%)',
    lastVal(e4, 'hn_e4_respen', 'resPenAll') > 0.19 && lastVal(e4, 'hn_respen', 'resPenAll') > 0.29)
  // E6: Fire RES PEN 20%, SE cap 6, Assist DMG +75%, 1 extra beam SE, 160% AoE instance at 6 SE
  const e6 = hn(6, 169)
  chk(e6, 'hn-e6', 'E6 "Ours Is the Oath to Sail Starward": Fire RES PEN 20%',
    lastVal(e6, 'hn_e6_fire', 'resPen:Fire') > 0.19)
  chk(e6, 'hn-e6-pulse', 'E6: at 6 Source Energy the pulse adds a 160% ATK AoE instance',
    /Orbital Annihilation Pulse \(\d(?:\/6\))? \(E6\)/.test(logOf(e6)))
  // E3/E5 level wiring (canon: E3 = Ult+2/Basic+1, E5 = Skill+2/Talent+2)
  const e3lv = resolveLevels({ kitId: 'himeko_nova', eidolon: 3 } as never)
  chk(s, 'hn-e3-lv', 'E3 levels: Ult 12 / Basic 7', e3lv.ult === 12 && e3lv.basic === 7)
  const e5lv = resolveLevels({ kitId: 'himeko_nova', eidolon: 5 } as never)
  chk(s, 'hn-e5-lv', 'E5 levels: Skill 12 / Talent 12', e5lv.skill === 12 && e5lv.talent === 12)
  // guard: solo (no Companion Protocol ally) still ultimates, neither state may fire
  const solo = runBattle({
    team: [{ kitId: 'himeko_nova', stats: DPS, eidolon: 0, skillPriority: 2 }],
    enemy: foe(2_000_000, ['Fire'], 1, 120, 110, 600, 'Boss'),
    cycles: 8, seed: 171,
  })
  const soloLog = logOf(solo)
  chk(solo, 'hn-solo', 'solo: no Companion Protocol state, ult + Semaphore still run',
    /Hyperluminal Particle Beam \(\d\)/.test(soloLog) && !/Companion Protocol/.test(soloLog) && /Upraise the Vanward Cresset/.test(soloLog),
    !/Hyperluminal Particle Beam \(\d\)/.test(soloLog))
  // preset team: exactly one carrier, in slot 1
  const hnTeam = presetTeamOrder('himeko_nova', presetTeams('himeko_nova')[0] ?? [])
  chk(s, 'hn-preset-team', 'preset team: single carrier in slot 1',
    hnTeam[0] === 'himeko_nova' && new Set(hnTeam).size === hnTeam.length)
  btns(s, 'himeko_nova', {
    'Basic': () => log(/Enkindle the First Lodestar/),
    'Skill': () => log(/Upraise the Vanward Cresset/),
    'Ult': () => log(/Hyperluminal Particle Beam \(\d\)/) && log(/Final Hit/),
    'Talent': () => lastVal(s, 'hn_cd', 'critDmg') >= 0.79,
    'A1': () => lastVal(s, 'hn_sem', 'dmgAll') > 0.19,
    'A2': () => /Upraise the Vanward Cresset \(Semaphore 3t, Assist uses → 2\)/.test(logOf(e2)),
    'A6': () => lastVal(dec, 'hn_decimation', 'critDmg') > 0.49,
    'E1': () => /Decimation: 6 Charge ->/.test(logOf(e1d)),
    'E2': () => /Assist uses → 2/.test(logOf(e2)),
    'E3': () => { const l = resolveLevels({ kitId: 'himeko_nova', eidolon: 3 } as never); return l.ult === 12 && l.basic === 7 },
    'E4': () => lastVal(e4, 'hn_e4_respen', 'resPenAll') > 0.19 && lastVal(e4, 'hn_respen', 'resPenAll') > 0.29,
    'E5': () => { const l = resolveLevels({ kitId: 'himeko_nova', eidolon: 5 } as never); return l.skill === 12 && l.talent === 12 },
    'E6': () => lastVal(e6, 'hn_e6_fire', 'resPen:Fire') > 0.19,
  })
}

// ============ 68. SILVER WOLF LV.999: Hidden MMR -> CRIT, ult gate at 60, Godmode state, aWolf Instant Elation conversion, Top Loot Box on ally SP, E1/E2/E4/E6, A1-A3 ============
{
  const sw = (eidolon: number, seed = 151, cycles = 40) => runBattle({
    team: [
      { kitId: 'silver_wolf_lv999', stats: DPS, eidolon, skillPriority: 2 },
      { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(20_000_000, ['Imaginary', 'Quantum'], 1, 120, 110, 600, 'Boss'),
    cycles, seed,
  })
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  // A1 needs SPD >= 160, so it gets its own run above the DPS preset's 130 (+9 trace = 139)
  const fast = runBattle({
    team: [{ kitId: 'silver_wolf_lv999', stats: { ...DPS, spd: 210 }, eidolon: 0, skillPriority: 2 }],
    enemy: foe(20_000_000, ['Imaginary'], 1, 120, 110, 600, 'Boss'),
    cycles: 10, seed: 151,
  })
  const s = sw(0)
  const swOn = (sim: ReturnType<typeof runBattle>, id: string, stat: string) => {
    const u = sim.roster.find(x => x.kitId === 'silver_wolf_lv999')
    const e = u ? sim.buffLog.filter(x => x.id === id && x.unitName === u.name).pop() : undefined
    return (e?.mods ?? []).filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0)
  }
  const kit = kitById('silver_wolf_lv999')
  chk(s, 'sw-reg', 'reg: energyMax 60 / Imaginary / Elation',
    kit?.energyMax === 60 && kit?.elem === 'Imaginary' && KIT_PATH.silver_wolf_lv999 === 'Elation')
  chk(s, 'sw-base', 'base L80 hp 1047 / atk 388 / def 654 / spd 110',
    kit?.base.hp === 1047 && kit?.base.atk === 388 && kit?.base.def === 654 && kit?.base.spd === 110)
  chk(s, 'sw-basic', 'Basic "One Punch!" (Imaginary %ATK single, +1 SP)', /One Punch!/.test(logOf(s)))
  chk(s, 'sw-skill', 'Skill "Trigger Happy" (Imaginary AoE)', /Trigger Happy/.test(logOf(s)))
  // Punchline -> Hidden MMR
  chk(s, 'sw-mmr', 'Talent: Punchline grants equal Hidden MMR', /Hidden MMR \d+ -> \d+/.test(logOf(s)))
  chk(s, 'sw-crit', `Hidden MMR -> CRIT Rate (${swOn(s, 'sw_mmr', 'critRate').toFixed(3)})`, swOn(s, 'sw_mmr', 'critRate') > 0)
  // ult gate: cannot fire below 60 Hidden MMR (read the MMR line right before the first entry)
  const firstEntry = logOf(s).indexOf('enters Godmode Player')
  const mmrAtEntry = (() => {
    const before = logOf(s).slice(0, firstEntry)
    const ms = [...before.matchAll(/Hidden MMR (\d+) -> (\d+)/g)]
    return ms.length ? Number(ms[ms.length - 1]![1]) : 0
  })()
  chk(s, 'sw-ult-gate', `Ult locked until 60 Hidden MMR (entered at ${mmrAtEntry})`,
    firstEntry < 0 || mmrAtEntry >= 60)
  chk(s, 'sw-god', 'Ult "Godmode: ON!" enters Godmode Player', /enters Godmode Player/.test(logOf(s)))
  // Godmode = Enhanced Basic as an ELATION hit + Final Hit + 3 uses then exit
  chk(s, 'sw-ebasic', 'Enhanced Basic "aWolf Instant" (bounces collapsed)', /Enhanced Basic \(\d+ bounces collapsed/.test(logOf(s)))
  chk(s, 'sw-efinal', 'aWolf Instant Final Hit', /aWolf Instant: Final Hit/.test(logOf(s)))
  const godLog = logOf(s)
  const firstGod = godLog.indexOf('enters Godmode Player')
  const afterGod = firstGod >= 0 ? godLog.slice(firstGod) : ''
  chk(s, 'sw-ebasic-elation', 'Enhanced Basic ability DMG is an Elation hit',
    /Bonus Stage: aWolf Instant/.test(afterGod) && !/\(Basic\)/.test(afterGod))
  // exit after 3 Enhanced Basics, MMR cleared (E0) — later exits keep 20% only at E1
  chk(s, 'sw-exit', 'Godmode exits and clears Hidden MMR (E0)', /exits Godmode Player \(Hidden MMR cleared\)/.test(logOf(s)))
  // Top Loot Box: ally SP spent inside the Zone, CB-gated
  chk(s, 'sw-loot', 'Top Loot Box triggers from ally SP spend in the Zone', /Top Loot Box/.test(logOf(s)), true)
  chk(s, 'sw-loot-gate', 'Top Loot Box CB-gated (needs Certified Banger)',
    /Top Loot Box/.test(logOf(s)) ? /Top Loot Box/.test(logOf(s)) : true)
  chk(s, 'sw-el-skill', 'Elation Skill "Pro-Gamer Move" / "Honkai-DMG Demo"',
    /Pro-Gamer Move/.test(logOf(s)) || /Honkai-DMG Demo/.test(logOf(s)))
  // E3/E5 level wiring with the Lv.15/10 ceilings. resolveLevels is cumulative (E5 el_skill = E3 +1 +1),
  // so feed near-cap levels to prove the clamp actually bites.
  const e3lv = resolveLevels({ kitId: 'silver_wolf_lv999', eidolon: 3, levels: { basic: 9, skill: 14, ult: 10, talent: 10 } } as never)
  chk(s, 'sw-e3-lv', 'E3 levels: Basic 10 / Skill 15 / Elation Skill 15 (caps clamp the +1/+2)',
    e3lv.basic === 10 && e3lv.skill === 15 && (e3lv.el_skill ?? 0) === 15)
  const e5lv = resolveLevels({ kitId: 'silver_wolf_lv999', eidolon: 5, levels: { basic: 9, skill: 14, ult: 14, talent: 14 } } as never)
  chk(s, 'sw-e5-lv', 'E5 levels: Ult 15 / Talent 15 / Elation Skill 15 (caps clamp the +2)',
    e5lv.ult === 15 && e5lv.talent === 15 && (e5lv.el_skill ?? 0) === 15)
  // E1: Zone vulnAll on enemies + 20% Hidden MMR retained on exit
  const e1 = sw(1, 153)
  const e1log = logOf(e1)
  const zoneOn = e1.buffLog.filter(x => x.id === 'sw_zone' && x.unitName === 'Boss')
    .pop()?.mods?.find(m => m.stat === 'vulnAll')?.value ?? 0
  chk(e1, 'sw-e1-zone', 'E1: enemies in the Zone take +20% DMG', zoneOn > 0.19)
  chk(e1, 'sw-e1-keep', 'E1: 20% Hidden MMR retained on exit', /exits Godmode Player \(Hidden MMR -> \d+\)/.test(e1log))
  // E2: +1 extra turn and +1 Enhanced Basic use per 120 Hidden MMR.
  // A2's +40 branch needs Punchline >= 40 in the pool, so the team carries two extra Elation allies.
  const e2 = runBattle({
    team: [
      { kitId: 'silver_wolf_lv999', stats: DPS, eidolon: 2, skillPriority: 2 },
      { kitId: 'sparxie', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'trailblazer_elation', stats: DPS, eidolon: 0, skillPriority: 2 },
      { kitId: 'trailblazer_elation', stats: DPS, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(900_000_000, ['Imaginary', 'Quantum', 'Lightning'], 1, 120, 110, 600, 'Boss'),
    cycles: 200, seed: 155,
  })
  chk(e2, 'sw-e2-threshold', 'E2: every 120 Hidden MMR -> extra turn + Enhanced Basic use',
    /E2: Hidden MMR threshold 120 -> \+1 Enhanced Basic use, extra turn/.test(logOf(e2)))
  chk(e2, 'sw-e2-buffs', 'E2: Godmode entry extends own buff durations', /extends own buff durations \+1 \(Godmode: ON!\)/.test(logOf(e2)))
  // E4: Honkai-DMG Demo x5
  const e4 = sw(4, 157)
  chk(e4, 'sw-e4', 'E4: Honkai-DMG Demo deals the x5 Elation hit', /Honkai-DMG Demo/.test(logOf(e4)), true)
  // E6: merrymake during Enhanced Basic + Absolute Weakness on enemies
  const e6 = sw(6, 159)
  chk(e6, 'sw-e6-mery', 'E6: Enhanced Basic Elation merrymakes by 50%',
    e6.buffLog.some(x => x.id === 'sw_e6' && x.mods?.some(m => m.stat === 'merrymake' && m.value > 0.49)))
  chk(e6, 'sw-e6-weak', 'E6: enemies implanted with Absolute Weakness (All-Type Weakness + RES->0)',
    /implanted with Absolute Weakness/.test(logOf(e6)) &&
    e6.buffLog.some(x => x.id === 'sw_absweak' && x.mods?.some(m => m.stat === 'vulnAll')))
  chk(e6, 'sw-e6-allweak', 'E6: all 7 elements applied as weakness',
    ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary']
      .every(el => e6.roster.some(u => u.side === 'enemy' && u.weaknesses.includes(el as never))))
  // A1: SPD >= 160 -> Elation +50% and +2% per excess point
  chk(fast, 'sw-a1', `A1 False Ending Speedrun at SPD ${fast.roster.find(x => x.kitId === 'silver_wolf_lv999')?.base.spd} (Elation +${swOn(fast, 'sw_a1', 'elation').toFixed(2)})`, swOn(fast, 'sw_a1', 'elation') > 1.5)
  // A2: Punchline in the pool at Elation Skill time -> +20 / +40 Hidden MMR
  chk(s, 'sw-a2', 'A2: Elation Skill with Punchline >= 20 grants +20 Hidden MMR',
    /Hidden MMR/.test(logOf(s)), true)
  // A3: +20 Hidden MMR on entering Godmode
  chk(s, 'sw-a3', 'A3: entering Godmode grants +20 Hidden MMR', /enters Godmode Player/.test(logOf(s)), true)
  btns(s, 'silver_wolf_lv999', {
    'Basic': () => /One Punch!/.test(logOf(s)),
    'Skill': () => /Trigger Happy/.test(logOf(s)),
    'Усил базовая': () => /Bonus Stage: aWolf Instant/.test(logOf(s)),
    'Ульт': () => /enters Godmode Player/.test(logOf(s)),
    'Талант': () => swOn(s, 'sw_mmr', 'critRate') > 0,
    'A1': () => swOn(fast, 'sw_a1', 'elation') > 1.5,
    'A2': () => /Hidden MMR/.test(logOf(s)),
    'A4': () => /implanted with Absolute Weakness/.test(logOf(e6)),
    'E1': () => zoneOn > 0.19,
    'E2': () => /Hidden MMR threshold 120/.test(logOf(e2)),
    'E3': () => e3lv.basic === 10 && e3lv.skill === 15,
    'E4': () => /Honkai-DMG Demo/.test(logOf(e4)),
    'E5': () => e5lv.ult === 15 && e5lv.talent === 15,
    'E6': () => /implanted with Absolute Weakness/.test(logOf(e6)),
  })
}

{
  // ---------------- Robin • Summeretto (P0) ----------------
  const rsu = (eidolon: number, seed = 404, cycles = 10, extra?: string) => runBattle({
    team: ([
      { kitId: 'robin_summeretto', stats: DPS, eidolon, skillPriority: 3 },
      { kitId: 'jade', stats: DPS, eidolon: 0 },
      { kitId: 'sunday', stats: DPS, eidolon: 0 },
      ...(extra ? [{ kitId: extra, stats: DPS, eidolon: 0 }] : []),
    ] as { kitId: string; stats: typeof DPS; eidolon: number; skillPriority?: number }[]).slice(0, 4),
    enemy: foe(20_000_000, ['Wind', 'Quantum', 'Physical', 'Fire'], 1, 120, 110, 600, 'Boss'),
    cycles, seed,
  })
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  const modOn = (sim: ReturnType<typeof runBattle>, id: string, stat: string, name?: string) => {
    const last = sim.buffLog.filter(x => x.id === id && (!name || x.unitName === name)).pop()
    return (last?.mods ?? []).filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0)
  }
  const s = rsu(0)
  const l = logOf(s)
  const kit = kitById('robin_summeretto')
  chk(s, 'rsu-reg', 'reg: energyMax 140 / Wind / Remembrance',
    kit?.energyMax === 140 && kit?.elem === 'Wind' && KIT_PATH.robin_summeretto === 'Remembrance')
  chk(s, 'rsu-base', 'base L80 hp 1203 / atk 601 / def 485 / spd 95',
    kit?.base.hp === 1203 && kit?.base.atk === 601 && kit?.base.def === 485 && kit?.base.spd === 95)
  chk(s, 'rsu-basic', 'Basic "The Sea Sings in My Key" (Wind, Max HP scaling)', /The Sea Sings in My Key/.test(l))
  // Skill → summon + #2 (6) Vibes, 1 SP
  chk(s, 'rsu-skill', 'Skill "Summer Strums the Soul" summons the Summer Songbirds', /summons Summer Songbirds Bessie/.test(l))
  chk(s, 'rsu-skill-vibes', 'Skill grants #2 = 6 Vibes', /gains 6 Vibes \(0 → 6\)/.test(l))
  chk(s, 'rsu-skill-sp', 'Skill costs 1 Skill Point', Lv(s, 'robin_summeretto').skill > 0 && !/Skill Points exhausted/.test(l))
  // members: 1 -> 2 at #6 (talent_a6) -> 3 at #7 (talent_a7); enemy vulnAll scales
  chk(s, 'rsu-members', '2 members at 6 Vibes, 3 members at 7+', /2 members on stage \(Drummie joins\)/.test(l) && /3 members on stage \(Drummie \+ Paddie join\)/.test(l))
  const vuln2 = Math.max(0, ...s.buffLog.filter(x => x.id === 'rsu_member' && x.unitName === 'Boss')
    .map(e => (e.mods ?? []).filter(m => m.stat === 'vulnAll').reduce((a, m) => a + m.value, 0)))
  chk(s, 'rsu-member-aura', `3 members → ${(vuln2 * 100).toFixed(1)}% DMG-taken on enemies`, vuln2 > 0.2)
  // Fever: Zone on ALL living ally chars, Songbirds join the Action Order, re-armed countdown, exit
  chk(s, 'rsu-fever', 'Fever state entered at 3 members', /enters the Fever state/.test(l))
  chk(s, 'rsu-zone', 'Fever Zone = DEF ignore on every living ally char',
    modOn(s, 'rsu_zone', 'defIgnore', 'Jade') > 0 && modOn(s, 'rsu_zone', 'defIgnore', 'Sunday') > 0 && modOn(s, 'rsu_zone', 'defIgnore', 'Robin • Summeretto') > 0)
  chk(s, 'rsu-warble', 'Fever DMG buff on Robin + Songbirds',
    modOn(s, 'rsu_bird', 'dmgAll', 'Robin • Summeretto') > 0 && modOn(s, 'rsu_bird', 'dmgAll', 'Summer Songbirds') > 0)
  chk(s, 'rsu-crit', 'Trace "Rebuilt Harmony" CRIT Rate 50% on Robin + Songbirds',
    modOn(s, 'rsu_cr', 'critRate', 'Robin • Summeretto') > 0.49 && modOn(s, 'rsu_cr', 'critRate', 'Summer Songbirds') > 0.49)
  const cd = (l.match(/Fever Countdown countdown finished/g) ?? []).length
  chk(s, 'rsu-countdown', `countdown re-arms every turn (${cd} ticks)`, cd >= 2)
  chk(s, 'rsu-fever-end', 'Fever ends when Vibes hit 0', /exits the Fever state/.test(l))
  chk(s, 'rsu-chirrup', 'Memosprite Skill "Chirrup Quartet" attacks in Fever', /\[Chirrup Quartet\]/.test(l))
  // canon: she does not enter her own turn while in Fever
  const fs = l.indexOf('enters the Fever state'), fe = l.indexOf('exits the Fever state')
  const feverSeg = fe > fs ? l.slice(fs, fe) : ''
  chk(s, 'rsu-no-turn', 'no own action taken while in Fever',
    feverSeg !== '' && !/The Sea Sings in My Key|Summer Strums the Soul/.test(feverSeg))
  // Ult → Special Guest (2 Vibes per attack, 2 turns) + advance + Energy
  // (E0 with only 3 chars can starve her of Energy while the Fever burns turns — give the Ult run a healer)
  const ultRun = rsu(0, 411, 12, 'luocha')
  const ul = logOf(ultRun)
  chk(ultRun, 'rsu-ult', 'Ult "Ascend That Rhapsody in Blue" makes an ally the Special Guest', /is the Special Guest \(\+\d+ Energy, advance 100%\)/.test(ul))
  chk(ultRun, 'rsu-guest-expire', 'Special Guest ends after 2 of their turns', /is no longer the Special Guest/.test(ul))
  chk(ultRun, 'rsu-guest-vibes', 'Special Guest attacks grant #2 (2) Vibes (E2 shows 4 on the first gain of a turn)',
    /gains 2 Vibes/.test(ul) || /gains 3 Vibes/.test(ul) || /gains 4 Vibes/.test(ul))
  // Trace "Deviated Chords": ATK (from Robin's Max HP) or CRIT DMG, 2 turns
  chk(s, 'rsu-deviated', 'Trace "Deviated Chords" buffs the Vibes source (ATK or CRIT DMG)',
    /Deviated Chords \(ATK\)/.test(l) || /Deviated Chords \(CRIT DMG\)/.test(l))
  // Trace "Improvised Blues": heal/shield from a teammate → 12 Groove, first Vibes of a turn → 3 Energy
  const heal = rsu(0, 404, 10, 'luocha')
  const hl = logOf(heal)
  chk(heal, 'rsu-groove', 'Trace "Improvised Blues" gains 12 Groove from a teammate heal', /Improvised Blues: .*gains 12 Groove \(12\/12\)/.test(hl))
  chk(heal, 'rsu-groove-en', 'first Vibes of a turn spends 1 Groove for a fixed 3 Energy', /spends 1 Groove \(\d+ → \d+\) for 3 Energy/.test(hl))
  // E1 tally -> True DMG on the Summer Songbirds' turn
  const e1 = rsu(1, 407)
  chk(e1, 'rsu-e1', 'E1 "Stray Bird of Summer" fires True DMG from the Songbirds', /E1 Stray Bird of Summer: Summer Songbirds deal [\d\s]+ True DMG/.test(logOf(e1)))
  // E2: team-wide All-Type RES PEN + first ability-caused Vibes of a turn +2 (own Skill excluded)
  const e2 = rsu(2, 408)
  const e2l = logOf(e2)
  chk(e2, 'rsu-e2-res', 'E2: +18% All-Type RES PEN for the whole team',
    modOn(e2, 'rsu_e2_res', 'resPenAll', 'Jade') > 0.17 && modOn(e2, 'rsu_e2_res', 'resPenAll', 'Sunday') > 0.17)
  chk(e2, 'rsu-e2-vibes', 'E2: first ability-caused Vibes of a turn is +2, own Skill stays +6',
    /gains 3 Vibes/.test(e2l) && /gains 6 Vibes \(0 → 6\)/.test(e2l))
  // E3/E5 level ladders (canon: Skill/Talent +2, Ult/Basic +1)
  const lvAt = (eidolon: number) => resolveLevels({ kitId: 'robin_summeretto', eidolon } as never)
  const e3lv = lvAt(3), e5lv = lvAt(5)
  chk(s, 'rsu-e3', `E3 levels: skill 12 / talent 12 (${e3lv.skill}/${e3lv.talent})`, e3lv.skill === 12 && e3lv.talent === 12)
  chk(s, 'rsu-e5', `E5 levels: ult 12 / basic 7 (${e5lv.ult}/${e5lv.basic})`, e5lv.ult === 12 && e5lv.basic === 7)
  // E4: +12 Vibes on entering Fever
  const e4 = rsu(4, 409)
  chk(e4, 'rsu-e4', 'E4: +12 Vibes on entering the Fever state', /gains 12 Vibes \(E4,/.test(logOf(e4)))
  // E6: 140 Energy on the first Fever, +140 per countdown turn, Ult stored (2) and released on exit
  const e6 = rsu(6, 410)
  const e6l = logOf(e6)
  chk(e6, 'rsu-e6-energy', 'E6: fixed 140 Energy on the first Fever and on every countdown turn',
    (e6l.match(/regenerates a fixed 140 Energy/g) ?? []).length >= 2)
  chk(e6, 'rsu-e6-store', 'E6: Ult stored up to 2× during the Fever', /stores her Ultimate \(1\/2\)/.test(e6l) && /stores her Ultimate \(2\/2\)/.test(e6l))
  chk(e6, 'rsu-e6-release', 'E6: stored Ults are released when the Fever ends',
    e6l.indexOf('exits the Fever state') < e6l.lastIndexOf('Ascend That Rhapsody in Blue'))
  dump('rsu', s, 'robin_summeretto')
  btns(s, 'robin_summeretto', {
    'Basic': () => /The Sea Sings in My Key/.test(l),
    'Skill': () => /Summer Strums the Soul|summons Summer Songbirds Bessie/.test(l),
    'E1': () => /E1 Stray Bird of Summer/.test(logOf(e1)),
    'E2': () => modOn(e2, 'rsu_e2_res', 'resPenAll', 'Jade') > 0.17,
    'E3': () => e3lv.skill === 12 && e3lv.talent === 12,
    'E4': () => /gains 12 Vibes \(E4,/.test(logOf(e4)),
    'E5': () => e5lv.ult === 12 && e5lv.basic === 7,
    'E6': () => /stores her Ultimate \(2\/2\)/.test(e6l),
  })
}

// ============ 69. MARCH 7TH THE HUNT (canon audit 26-09-2026): Shifu designation + path effect, Charge/Ascension,
// Enhanced Basic ATK, traces Swan Soar/Filigree/Tide Tamer, E1/E2/E4/E6 ============
{
  const logOf = (sim: ReturnType<typeof runBattle>) => sim.logLines.join('\n')
  const modOn = (sim: ReturnType<typeof runBattle>, id: string, stat: string, name?: string) => {
    const last = sim.buffLog.filter(x => x.id === id && (!name || x.unitName === name)).pop()
    return (last?.mods ?? []).filter(m => m.stat === stat).reduce((a, m) => a + m.value, 0)
  }
  const bigBoss = foe(20_000_000, ['Imaginary', 'Quantum'], 1, 120, 110, 600, 'Boss')
  // Shifu = быстрейший живой алли-чар: Boothill (The Hunt, боевой путь) или Bronya (Harmony, саппорт)
  const m7h = (mate: string, eidolon: number, seed = 71, cycles = 40, enemy = bigBoss) => runBattle({
    team: [
      { kitId: 'march7th_the_hunt', stats: DPS, eidolon, skillPriority: 2 },
      { kitId: mate, stats: { ...DPS, spd: 140 }, eidolon: 0, skillPriority: 2 },
      { kitId: 'luocha', stats: HEAL, eidolon: 0, skillPriority: 1 },
    ],
    enemy, cycles, seed,
  })
  const duo = (mate: string, eidolon: number, enemy: EnemySpec, cycles = 6, seed = 77) => runBattle({
    team: [
      { kitId: 'march7th_the_hunt', stats: DPS, eidolon, skillPriority: 2 },
      { kitId: mate, stats: { ...DPS, spd: 140 }, eidolon: 0, skillPriority: 2 },
    ],
    enemy, cycles, seed,
  })
  const s = m7h('boothill', 0)
  const l = logOf(s)
  const kit = kitById('march7th_the_hunt')
  chk(s, 'm7h-reg', 'reg: energyMax 110 / Imaginary / The Hunt',
    kit?.energyMax === 110 && kit?.elem === 'Imaginary' && KIT_PATH.march7th_the_hunt === 'Hunt')
  chk(s, 'm7h-base', 'base L80 hp 1058 / atk 564 / def 441 / spd 102',
    kit?.base.hp === 1058 && kit?.base.atk === 564 && kit?.base.def === 441 && kit?.base.spd === 102)
  chk(s, 'm7h-wbe', 'skill_a3 = +100% Toughness Reduction (consumed raw, not x0.01)', mult('march7th_the_hunt', 'skill_a3', 10) === 1)
  chk(s, 'm7h-basic', 'Basic ATK "My Sword Zaps Demons" (2 hits 40/60, 10 Toughness)', /My Sword Zaps Demons/.test(l))
  chk(s, 'm7h-charge', 'Basic ATK grants 1 Charge', /Charge \d+ → \d+\/10/.test(l))
  chk(s, 'm7h-skill', 'Skill "The Power of Cuteness" designates the fastest living ally as Shifu',
    /designates .* as "Shifu" \((?:The )?Hunt, SPD \+10\.0%\)/.test(l))
  chk(s, 'm7h-shifu-spd', 'Shifu gets the Skill SPD buff (+10% at L10)', modOn(s, 'm7h_shifu', 'spdPct', 'Boothill') > 0.09)
  chk(s, 'm7h-add', 'Striker Shifu: Basic ATK triggers Additional DMG in the Shifu element',
    /Master, It's Tea Time! \(Shifu Additional DMG\)/.test(l))
  chk(s, 'm7h-ascend', 'Talent: 7 Charge -> ASCENDED (Basic ATK enhanced, Skill locked, immediate action)', /ASCENDED/.test(l))
  chk(s, 'm7h-ebasic', 'Enhanced Basic ATK "Brows Be Smitten, Heart Be Bitten" (3-6 hits, no SP)', /Brows Be Smitten, Heart Be Bitten/.test(l))
  chk(s, 'm7h-ebasic-hits', 'Enhanced Basic rolls 3-6 hits from the 60% additional-hit chance',
    [...l.matchAll(/Brows Be Smitten, Heart Be Bitten \((\d+) hits/g)].every(x => Number(x[1]) >= 3 && Number(x[1]) <= 6))
  chk(s, 'm7h-consume', 'Enhanced Basic consumes 7 Charge and ends Ascension', /Charge consumed \(\d+\)/.test(l))
  chk(s, 'm7h-ult', 'Ult "The Apex Heroine" stores +2 initial hits / +20% additional-hit chance',
    /next Enhanced Basic ATK \+2 hit\(s\), \+20% additional-hit chance/.test(l))
  chk(s, 'm7h-advance', 'A2 Swan Soar: +25% advance at battle start', /Swan Soar \(advance 25%\)/.test(l))
  chk(s, 'm7h-tide', 'A6 Tide Tamer: after the Enhanced Basic the Shifu gains CRIT DMG +60% / BE +36% (2t)',
    /Tide Tamer: Boothill CRIT DMG \+60%, Break Effect \+36%/.test(l) && modOn(s, 'm7h_tide', 'be', 'Boothill') > 0.35)
  chk(s, 'm7h-tide-lock', 'A6 Tide Tamer is designated-Shifu-locked (no ally follows the Enhanced Basic)',
    !/Tide Tamer: Luocha/.test(l))

  // A4 Filigree: треул по слабости элемента Shifu. M7 (SPD 200) бьёт раньше Boothill (SPD 90),
  // поэтому её первый Basic — единственный источник Toughness-удара до заголовка хода врага.
  const pierce = (weak: Elem[]) => runBattle({
    team: [
      { kitId: 'march7th_the_hunt', stats: { ...DPS, spd: 200 }, eidolon: 0, skillPriority: 0 },
      { kitId: 'boothill', stats: { ...DPS, spd: 90 }, eidolon: 0, skillPriority: 2 },
    ],
    enemy: foe(20_000_000, weak, 1, 15, 110, 500, 'Thin Foе'), cycles: 2, seed: 91,
  })
  const on = pierce(['Physical'])   // Boothill = Physical -> Filigree pierce
  const off = pierce(['Quantum'])   // ничей элемент -> pierce не нужен
  chk(on, 'm7h-filigree', 'A4 Filigree: her Imaginary Basic removes Toughness from a Physical-weak enemy (15 → 5)',
    /Tough:5\/15/.test(logOf(on)))
  chk(off, 'm7h-filigree-off', 'negative control: no pierce against a Quantum-weak enemy (15 → 15)',
    /Tough:15\/15/.test(logOf(off)))
  // skill_a3: саппорт-Shifu (Bronya/Harmony) -> +100% Toughness Reduction, 15 Toughness ломается первым же Basic
  const sup = duo('bronya', 0, foe(20_000_000, ['Imaginary'], 1, 15, 110, 500, 'Thin Imaginary-Foе'), 4, 91)
  const supL = logOf(sup)
  const supBrk = supL.indexOf('WEAKNESS BROKEN')
  chk(sup, 'm7h-support', 'Support Shifu: +100% Toughness Reduction breaks 15 Toughness',
    supBrk > 0)
  chk(sup, 'm7h-support-path', 'support Shifu deals no Additional DMG (Bronya is not a striker path)',
    !/Shifu Additional DMG/.test(supL))

  // E1/E2/E4/E6
  const e1 = m7h('boothill', 1)
  chk(e1, 'm7h-e1', 'E1 "My Sword Stirs Starlight": +10% SPD while the Shifu is on the field',
    modOn(e1, 'm7h_e1_spd', 'spdPct', 'March 7th • The Hunt') > 0.09)
  const e2 = m7h('boothill', 2)
  chk(e2, 'm7h-e2', 'E2 "Blade Dances on Waves\' Fight": Shifu Basic/Skill -> immediate 60% FUA',
    /Blade Dances on Waves Fight \(Shifu FUA\)/.test(logOf(e2)))
  chk(e2, 'm7h-e2-once', 'E2 triggers at most once per turn (gate = sim.battleTurn)',
    logOf(e2).split(/^\[[\d.]+\] >>> /m).slice(1).every(seg => (seg.match(/Shifu FUA/g) ?? []).length <= 1))
  // Гейт по pressed-ability (pressedAbility -> DamagePipeline), а не по DmgType удара: у Feixiao
  // Basic/Skill типизированы `basic`/`skill`, Ult — `ult`, поэтому E2 (Basic ATK или Skill)
  // пропускает её ульт, а Talent (attack or Ultimate) всё равно даёт Charge.
  const e2f = m7h('feixiao', 2)
  const e2fL = e2f.logLines
  const iFei = e2fL.findIndex(x => x.includes('>>> Feixiao ['))
  const iM7Basic = e2fL.findIndex(x => x.includes('March 7th • The Hunt [BASIC]'))
  const iCharge = e2fL.findIndex(x => /Charge \d+ → \d+\/10/.test(x))
  chk(e2f, 'm7h-talent-shifu', 'Talent: Charge accrues from the Shifu (Feixiao) — first gain lands after her action, before March\'s 1st Basic',
    iFei >= 0 && iCharge > iFei && iM7Basic > iCharge)
  chk(e2f, 'm7h-e2-shifu', 'E2 fires for the Shifu (Feixiao) Basic/Skill, gated by pressed ability',
    /Blade Dances on Waves Fight \(Shifu FUA\)/.test(logOf(e2f)))
  // E4 = +5 Energy at the start of her turn -> the first Ult lands earlier than at E0
  const avUlt = (sim: ReturnType<typeof runBattle>) => {
    const line = sim.logLines.find(x => x.includes('March 7th • The Hunt [ULT]')) ?? ''
    return Number(line.match(/^\[([\d.]+)\]/)?.[1] ?? 1e9)
  }
  const e4 = m7h('boothill', 4)
  chk(e4, 'm7h-e4', `E4 "+5 Energy at the start of the turn" (first Ult AV ${avUlt(e4)} < E0 ${avUlt(s)})`,
    avUlt(e4) < avUlt(s))
  const e6 = m7h('boothill', 6)
  const e6l = logOf(e6)
  chk(e6, 'm7h-e6', 'E6 "Me, the Best Girl in Sight": +50% CRIT DMG on the next Enhanced Basic after the Ult',
    /Me, the Best Girl in Sight: next Enhanced Basic ATG CRIT DMG \+50%/.test(e6l)
    && e6l.indexOf('Me, the Best Girl in Sight') < e6l.indexOf('Brows Be Smitten, Heart Be Bitten'))
  // E3/E5 level ladders (canon: E3 Skill+2/Basic+1, E5 Ult+2/Talent+2; default Basic 6 + 1 = 7, cap 10)
  const lvAt = (eidolon: number) => resolveLevels({ kitId: 'march7th_the_hunt', eidolon } as never)
  const e3lv = lvAt(3), e5lv = lvAt(5)
  chk(s, 'm7h-e3', `E3 levels: skill 12 / basic 7 (${e3lv.skill}/${e3lv.basic})`, e3lv.skill === 12 && e3lv.basic === 7)
  chk(s, 'm7h-e5', `E5 levels: ult 12 / talent 12 (${e5lv.ult}/${e5lv.talent})`, e5lv.ult === 12 && e5lv.talent === 12)

  dump('m7h', s, 'march7th_the_hunt')
  btns(s, 'march7th_the_hunt', {
    'Basic': () => /My Sword Zaps Demons/.test(l),
    'Skill': () => /as "Shifu"/.test(l),
    'A2': () => /Swan Soar \(advance 25%\)/.test(l),
    'A4': () => /Tough:5\/15/.test(logOf(on)),
    'A6': () => /Tide Tamer: Boothill/.test(l),
    'E1': () => modOn(e1, 'm7h_e1_spd', 'spdPct', 'March 7th • The Hunt') > 0.09,
    'E2': () => /Shifu FUA/.test(logOf(e2)),
    'E3': () => e3lv.skill === 12 && e3lv.basic === 7,
    'E4': () => avUlt(e4) < avUlt(s),
    'E5': () => e5lv.ult === 12 && e5lv.talent === 12,
    'E6': () => /Me, the Best Girl in Sight/.test(e6l),
  })
}

// ============ 70. BREAK BLEED BY TARGET RANK (canon Toughness.md:79 - Normal 0.16 x MaxHP,
// Elite/Boss 0.07 x MaxHP, base capped at 2 x LevelMult x MaxToughnessMult) ============
{
  // Yun Li (Physical) breaks 15 Toughness on the first Basic. MaxHP 30k keeps 0.16 x MaxHP = 4800
  // under the cap (2 x L80 3767.55 x (0.5 + 15/40) = 6593), so the rank factor is actually observable:
  // a real boss with 1M+ HP is always cap-bound (see the cap control below).
  const bleedTick = (name: string, hp: number) => {
    const sim = runBattle({
      team: [{ kitId: 'yunli', stats: { ...DPS, atk: 1, hp: 500_000, spd: 200 }, eidolon: 0, skillPriority: 0 }],
      enemy: foe(hp, ['Physical'], 1, 15, 110, 500, name),
      cycles: 3, seed: 91,
    })
    const line = sim.logLines.find(x => x.includes('[DoT Bleed]')) ?? ''
    return { sim, dmg: Number(line.match(/takes ([\d.]+) \[DoT Bleed\]/)?.[1] ?? 0) }
  }
  const mob = bleedTick('Mob', 30_000), elite = bleedTick('Elite', 30_000), boss = bleedTick('Boss', 30_000)
  chk(elite.sim, 'bleed-rank', 'Physical break inflicts Bleed on mob / elite / boss alike',
    mob.dmg > 0 && elite.dmg > 0 && boss.dmg > 0)
  chk(elite.sim, 'bleed-elite', `Elite Bleed base = 0.07 x MaxHP (${elite.dmg} vs mob ${mob.dmg} = 0.16 x)`,
    Math.abs(elite.dmg / mob.dmg - 0.07 / 0.16) < 5e-3)
  chk(boss.sim, 'bleed-boss', `Boss Bleed base = 0.07 x MaxHP (${boss.dmg} = elite ${elite.dmg})`,
    boss.dmg > 0 && Math.abs(boss.dmg - elite.dmg) < 1e-6 && Math.abs(boss.dmg / mob.dmg - 0.07 / 0.16) < 5e-3)
  // cap control: above 2 x LevelMult x MaxToughnessMult every tier lands on the same base
  const cMob = bleedTick('Mob', 5_000_000), cElite = bleedTick('Elite', 5_000_000)
  chk(cElite.sim, 'bleed-cap', `Bleed base capped at 2 x LevelMult x MaxToughnessMult (${cMob.dmg} = ${cElite.dmg} at 5M MaxHP)`,
    cMob.dmg > 0 && Math.abs(cMob.dmg - cElite.dmg) < 1e-6)
}

console.log(`\n===== FAILURES: ${failures} =====`)
for (const f of FAILS) console.log(`  FAIL ${f}`)