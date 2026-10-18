// Pack-ladder sweep: per kit, per team variant, 3 RNG battles per setup.
// Packs: E0S0 -> E0S1 -> E1S1 -> E2S1 -> E4S1 -> E6S1 -> E6S5.
// Each pack sweeps the kit's RECOMMENDED relic4 x planar sets (preset.relic4/planar)
// with FULL gear (mains + ~30 useful substat rolls via buildGear pieces).
// S0 = best-fitting 4★ cone at max SI (S5); S1/S5 = preset rec cone at SI 1/5
// (path-standard 4★/5★ fallback when the preset declares no cone).
// A light cone is ALWAYS equipped; the carrier keeps its rec cone, mates track their pack S-tier.
// Pack's E applies to the WHOLE team (character + mates eidolons together).
// Battle runs to ~1000 AV (cycles=10) so all mechanics see play; enemies tanky-but-soft.
// DPAV per character = char dmg / battle AV — one CSV row per (battle, char).
// Full battle log saved per battle to debug/sweep/logs/<kid>/ (SWEEP_LOGS=0 disables).
// Run:   rtk npx tsx src/core/debug-sweep.ts
// Shard: SWEEP_JOBS=N SWEEP_JOB=i  ...   Subset: SWEEP_ONLY=a,b   Cycles: SWEEP_CYCLES=3
import type { EnemySpec, TeamSpec } from './battle'
import { KITS } from './kits'
import { PRESETS, presetTeams, presetTeamOrder } from './presets'
import { buildGear, recCone, s0Cone } from './debug-presets'
import { runOne, flushLogs, Pacer, clearShare, fleetDuty, sysLoad, memLoad, type BattleSpec } from './sweep-battle'
import type { GearConfig } from './entities/Unit'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, writeSync } from 'fs'
import { join } from 'path'
import { spawn } from 'child_process'
import { availableParallelism } from 'os'
import { Worker } from 'worker_threads'
import { fanout } from './sweep-fanout'

const JOBS = parseInt(process.env.SWEEP_JOBS ?? '1', 10)
const JOB = parseInt(process.env.SWEEP_JOB ?? '0', 10)
// dynamic CPU/RAM caps: keep SYSTEM-wide load (this + other apps) under them. The
// pacer holds them adaptively — see sweep-battle.ts Pacer (shared duty factor).
const CPU_MAX = parseFloat(process.env.SWEEP_CPU_MAX ?? '0.8')
const MEM_MAX = parseFloat(process.env.SWEEP_MEM_MAX ?? '0.8')
// single process -> split battles over a thread pool (all cores); multi-process -> one thread each (cores already split)
const THREADS = (JOBS <= 1 && process.env.SWEEP_THREADS !== '1') ? Math.min(Math.max(1, Math.round(availableParallelism() * CPU_MAX)), availableParallelism() - 1) : 1
const WAVE = Math.max(16, parseInt(process.env.SWEEP_WAVE ?? '300', 10))
const ONLY = process.env.SWEEP_ONLY
const FORCE = process.env.SWEEP_FORCE === '1'
const SAVE_LOGS = (process.env.SWEEP_LOGS ?? '1') === '1'
// SWEEP_LOG_SEEDS=42,1234 keeps transcripts for those seeds only (writing is I/O-bound);
// SWEEP_LOG_STATE_EVERY=N thins the per-turn audit state block.
const LOG_SEEDS = (process.env.SWEEP_LOG_SEEDS ?? '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
const LOG_STATE_EVERY = Math.max(1, parseInt(process.env.SWEEP_LOG_STATE_EVERY ?? '1', 10))
const CYCLES = parseInt(process.env.SWEEP_CYCLES ?? '5', 10)
const DIR = join(process.cwd(), 'debug', 'sweep')
const LOGDIR = join(DIR, 'logs')
const SEEDS = [42, 1234, 98765]
const TARGETS = (process.env.SWEEP_TARGETS ?? '3').split(',').map(s => parseInt(s.trim(), 10)).filter(n => n > 0)

interface Pack { name: string; eid: number; si: number }
const PACKS: Pack[] = [
  { name: 'E0S0', eid: 0, si: 0 },
  { name: 'E0S1', eid: 0, si: 1 },
  { name: 'E1S1', eid: 1, si: 1 },
  { name: 'E2S1', eid: 2, si: 1 },
  { name: 'E4S1', eid: 4, si: 1 },
  { name: 'E6S1', eid: 6, si: 1 },
  { name: 'E6S5', eid: 6, si: 5 },
]
// 4★ chars are always tested at E6 (their E0-E5 ladder adds no value)
const FOUR_STAR = new Set(['pela', 'guinaifen', 'gallagher', 'march7th', 'danheng', 'yukong', 'luka', 'asta', 'arlan', 'herta', 'serval', 'natasha', 'lynx', 'tingyun', 'sampo', 'hook', 'qingque', 'xueyi', 'hanya', 'misha', 'moze', 'sushang'])
const PACKS_4STAR: Pack[] = [
  { name: 'E6S0', eid: 6, si: 0 },
  { name: 'E6S1', eid: 6, si: 1 },
  { name: 'E6S5', eid: 6, si: 5 },
]
const PACK_FILTER = (process.env.SWEEP_PACKS ?? '').split(',').map(s => s.trim()).filter(Boolean)

const ENEMY_BASE: Omit<EnemySpec, 'count'> = {
  name: 'EnemyBoss', hp: 650_000, spd: 158.4, level: 95, toughness: 140,
  weaknesses: ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'],
  res: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  atk: 800,
}
// Aglaea.xlsx verification setup (scenario tabs M/N block, TODO #74): boss params from the sheet.
// Summary!D19 "Toughness bar 480/300" is a stale label — the living model uses M5/N5 = 140/100.
// SWEEP_ENEMY=sheet runs sweeps against this base; default ENEMY_BASE untouched.
const ENEMY_SHEET: Omit<EnemySpec, 'count'> = {
  name: 'EnemyBoss', hp: 650_000, spd: 158.4, level: 95, toughness: 140,
  weaknesses: ['Physical', 'Fire', 'Ice', 'Lightning', 'Wind', 'Quantum', 'Imaginary'],
  res: { Physical: 0.2, Fire: 0.2, Ice: 0.2, Lightning: 0.2, Wind: 0.2, Quantum: 0.2, Imaginary: 0.2 },
  atk: 800,
}

const FILL: string[] = ['tingyun', 'pela', 'gallagher', 'luocha', 'fuxuan', 'huohuo', 'bronya', 'sparkle', 'sunday', 'march7th', 'lynx', 'yukong', 'guinaifen', 'topaz', 'silverwolf', 'kafka', 'welt', 'himeko', 'jingyuan', 'seele', 'blade', 'jingliu', 'danheng', 'luka', 'fugue', 'aventurine', 'hyacine', 'tribbie', 'cerydra', 'castorice', 'phainon', 'aglaea', 'sparxie', 'cipher', 'blackswan', 'bailu', 'xueyi', 'hanya', 'misha', 'ruanmei', 'argenti', 'moze', 'acheron', 'robin', 'jade', 'boothill', 'rappa', 'dr_ratio', 'the_herta', 'mydei', 'anaxa', 'hysilens', 'evernight', 'cyrene', 'firefly', 'sushang']

/** full gear for a mate: its own preset best-first sets+mains+subs, cone per pack
 *  (S0 = path 4★ at S5; S1+ = mate rec cone at SI1) */
function mateGear(kid: string, si: number): GearConfig | undefined {
  const g = buildGear(kid)
  if (!g.pieces?.length) return undefined
  g.coneId = si === 0 ? s0Cone(kid) : recCone(kid)
  g.si = si === 0 ? 5 : 1
  return g
}

function teamVariants(kid: string): string[][] {
  const variants = presetTeams(kid)
  if (!variants.length) return [fillTeam(kid)]
  return variants.map(t => {
    // a preset may already place the carrier itself (Participant-ID gates) — then it holds the order
    const pad: string[] = presetTeamOrder(kid, t)
    const used = new Set(pad)
    for (const f of FILL) {
      if (pad.length >= 4) break
      if (used.has(f)) continue
      pad.push(f)
      used.add(f)
    }
    return pad
  })
}

function fillTeam(kid: string): string[] {
  const out: string[] = []
  const used = new Set([kid])
  for (const f of FILL) {
    if (out.length >= 3) break
    if (used.has(f)) continue
    out.push(f)
    used.add(f)
  }
  return [kid, ...out]
}

function csvRow(parts: (string | number)[]): string {
  return parts.join(',')
}

const carriersInit = ONLY ? ONLY.split(',').map(s => s.trim()) : KITS.map(k => k.id)
const carriers = carriersInit.filter((_, i) => i % JOBS === JOB)

console.log(`sweep: packs=${PACKS.map(p => p.name).join(',')}${PACK_FILTER.length ? ` (only ${PACK_FILTER.join(',')})` : ''} jobs=${JOBS} job=${JOB} cycles=${CYCLES} carriers=${carriers.length} logs=${SAVE_LOGS}${LOG_SEEDS.length ? ` seeds[${LOG_SEEDS}]` : ''} stateEvery=${LOG_STATE_EVERY} threads=${THREADS}`)

function isDone(kid: string): boolean {
  return existsSync(join(DIR, `${kid}.done`)) && !FORCE
}

/** battles one kit will run — pure counting, mirrors planTotal in sweepKit. The reporter needs the
 *  whole run up front: it used to sum only the kits visible in prog/, i.e. one kit in solo mode,
 *  which is why the ETA read "2m" for a 65-minute sweep. */
function planTotalFor(kid: string): number {
  const p = PRESETS[kid]
  const packs = (FOUR_STAR.has(kid) ? PACKS_4STAR : PACKS).filter(pk => !PACK_FILTER.length || PACK_FILTER.includes(pk.name))
  return teamVariants(kid).length * packs.length * (p?.relic4 ?? []).length * (p?.planar ?? []).length * SEEDS.length * TARGETS.length
}

// Battle logs are written with writeFileSync and logKey is unique per battle
// (pack/team/relic/planar/targets/seed), so a rerun can never append onto a stale
// log. The tree is therefore wiped ONCE per run: 18 children each rmSync-ing
// their own kit dir used to serialise ~350k file deletes into the start-up.
function clearLogs(): void {
  if (!SAVE_LOGS || !FORCE) return
  const t = Date.now()
  try { rmSync(LOGDIR, { recursive: true, force: true }) } catch { /* none */ }
  console.log(`  logs: cleared ${LOGDIR} (${((Date.now() - t) / 1000).toFixed(1)}s)`)
}

let battleCount = 0
let t0 = Date.now()

interface SweepTask {
  meta: { pack: string; ti: number; relic: string; planar: string; seed: number; nb: number }
  team: TeamSpec[]
  seed: number
  logKey: string
  /** carrier kit id — owns the log subdir and the dmg account, not necessarily team[0] */
  carrier: string
  /** worker reads this name (sweep-worker.ts Task.targetCount) — must match or the count silently falls back to 3 */
  targetCount: number
}
type SweepResult = { win: boolean; av: number; avs: number[]; dmg: number[]; split: import('./sweep-battle').DmgSplit[]; err?: string }

const BATTLE_SPEC: BattleSpec = {
  cycles: CYCLES, enemy: process.env.SWEEP_ENEMY === 'sheet' ? ENEMY_SHEET : ENEMY_BASE, saveLogs: SAVE_LOGS, logDir: LOGDIR,
  logSeeds: LOG_SEEDS, stateEvery: LOG_STATE_EVERY,
}

// ---------------------------------------------------------------------------
// live reporter: SYSTEM load (ewma) + fleet duty factor + per-kit progress.
// One writer per process/thread -> debug/sweep/prog/<pid>.json (no write races),
// one reader (the fan-out parent, or the solo process) prints the whole fleet.
// Entries older than STALE_MS belong to a dead run and are ignored.
// ---------------------------------------------------------------------------
const PROGDIR = join(DIR, 'prog')
const REPORT_MS = parseInt(process.env.SWEEP_REPORT_MS ?? '5000', 10)
const PROG_STALE_MS = parseInt(process.env.SWEEP_PROG_STALE_MS ?? '30000', 10)
const PROG_EVERY = Math.max(25, parseInt(process.env.SWEEP_PROG_EVERY ?? '100', 10))
interface ProgEntry { kid: string; done: number; total: number; crashes: number; phase: string; fin?: boolean; at: number }

function progFile(): string { return join(PROGDIR, `${process.pid}.json`) }
function writeProg(p: ProgEntry | null): void {
  try {
    if (!p) { rmSync(progFile(), { force: true }); return }
    mkdirSync(PROGDIR, { recursive: true })
    writeFileSync(progFile(), JSON.stringify(p), 'utf-8')
  } catch { /* reporting must never break a sweep */ }
}
function readProg(): ProgEntry[] {
  const out: ProgEntry[] = []
  const now = Date.now()
  let files: string[] = []
  try { files = readdirSync(PROGDIR) } catch { return out }
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const p = JSON.parse(readFileSync(join(PROGDIR, f), 'utf-8')) as ProgEntry
      if (p?.kid && typeof p.done === 'number' && now - p.at < PROG_STALE_MS) out.push(p)
    } catch { /* partially written by a live worker */ }
  }
  return out
}

// A finished kit is NOT observable from prog/*.json: the file is per-process, and the next kit
// overwrites it with done=0 microseconds after pushProg(true) — so the reporter saw fin:false
// (or a stale entry) and `kits 0/93` never moved. Worse, the counter the rate was derived from
// was non-monotonic (a finished kit's whole count vanished from the sum), which is what made b/s
// and the ETA flicker. Finished kits therefore go to an append-only log: one line per kit, and the
// reporter folds them in, which makes battles-done monotonic in both solo and fan-out mode.
const FINLOG = join(PROGDIR, 'finished.tsv')
function logFinished(kid: string, battles: number): void {
  try {
    mkdirSync(PROGDIR, { recursive: true })
    appendFileSync(FINLOG, `${kid}\t${battles}\n`, 'utf-8')
  } catch { /* reporting must never break a sweep */ }
}
function readFinished(): Map<string, number> {
  const m = new Map<string, number>()
  let raw = ''
  try { raw = readFileSync(FINLOG, 'utf-8') } catch { return m }
  for (const line of raw.split('\n')) {
    const t = line.indexOf('\t')
    if (t < 0) continue
    const n = parseInt(line.slice(t + 1), 10)
    if (line.slice(0, t) && !isNaN(n)) m.set(line.slice(0, t), n)
  }
  return m
}

// Windows consoles only redraw ANSI blocks in a VT-capable host (Windows Terminal, pwsh 7+,
// ConEmu). The legacy PowerShell 5.1 host reports isTTY but renders cursor-up/clear-line as
// literal text, so the "live" block would never move — gate it on a known-VT host there.
function vtLikely(): boolean {
  if (process.platform !== 'win32') return true
  return !!(process.env.WT_SESSION || process.env.TERM_PROGRAM || process.env.ConEmuANSI === 'ON')
}
// TTY → redraw the whole block in place (cursor-up + clear-line, 2 Hz) so a long sweep reads as
// live; piped/redirected → keep appending one line per tick so CI/log files stay diffable.
// SWEEP_REPORT_TTY=1 forces live (test through a pipe), =0 forces line mode, unset = auto.
const LIVE = process.env.SWEEP_REPORT_TTY === '1'
  || (!!process.stdout.isTTY && vtLikely() && process.env.SWEEP_REPORT_TTY !== '0')
let liveRows = 0
/** call before printing anything outside the reporter, so the next redraw doesn't eat that line */
function reportBreak(): void { liveRows = 0 }

// Progress must reach the terminal NOW, not whenever libuv gets around to it: on Windows writes to
// a TTY/pipe go through the libuv threadpool, and a sweep saturating every core starves that pool —
// so process.stdout.write/console.error queued every tick and dumped them in one burst at exit
// (a progress bar that only appears once the sweep is over). writeSync hits the OS handle directly.
// no EAGAIN retry; the console/pipe handles here are blocking in practice.
function emit(fd: 1 | 2, s: string): void {
  try { writeSync(fd, s) } catch { /* reporting must never break a sweep */ }
}

// A piped/redirected run (or an agent harness) only sees the reporter's output AFTER the process
// exits, which looks exactly like "the progress bar is dead". The file is the observable channel:
// it is appended while the sweep runs, so `Get-Content -Wait debug\sweep\progress.log` (or a poll
// from a second shell) shows ticks live. Same rows as the terminal, minus the ANSI redraw.
// SWEEP_REPORT_FILE=<path> overrides; =0/off disables.
const REPORT_FILE = (() => {
  const v = process.env.SWEEP_REPORT_FILE
  if (v === '0' || v === 'off') return null
  return v ? v : join(DIR, 'progress.log')
})()
function fileTick(lines: string[], full: boolean): void {
  if (!REPORT_FILE) return
  try { appendFileSync(REPORT_FILE, (full ? lines.join('\n') : lines[0]) + '\n', 'utf-8') } catch { /* never break a sweep */ }
}

/** thousands separator, locale-independent: toLocaleString() emits U+00A0 on this host, which
 *  lands in the log as mojibake and breaks column alignment */
const fmtN = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function fmtEta(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '--'
  if (sec < 60) return `${Math.round(sec)}s`
  return `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, '0')}s`
}

let reportTimer: NodeJS.Timeout | null = null
let reportTick: (() => void) | null = null
function startReporter(kids: string[], fleet: boolean, grandTotal: number): void {
  if (REPORT_MS <= 0) return
  // fan-out children inherit this terminal (stdio: 'inherit'), so their prints would land inside a
  // redrawn block and be eaten by the next cursor-up - line mode only there
  const live = LIVE && !fleet
  const totalKits = kids.length
  // grandTotal covers ONLY the kits this run will sweep (SWEEP_ONLY shard), but readProg/readFinished
  // see every file in the dir: without this filter a stale foreign kit inflates `done` past
  // grandTotal (bar > 20 chars, pct > 100, negative ETA) and is drawn as a phantom kit.
  const scope = new Set(kids)
  const t0 = Date.now()
  let prevBattles = 0, prevAt = t0, rate = 0, tick = 0
  const hist: number[] = []
  // fresh file per run: a stale log from the previous sweep reads as live progress
  if (REPORT_FILE) { try { writeFileSync(REPORT_FILE, '', 'utf-8') } catch { /* never break a sweep */ } }
  const tickOnce = () => {
    const now = Date.now()
    const dt = (now - prevAt) / 1000
    const prog = readProg()
    const fin = readFinished()
    // monotonic: a kit's battles move from "current done" to "finished total", never disappear
    let done = 0
    for (const [kid, total] of fin) if (scope.has(kid)) done += total
    for (const p of prog) if (!fin.has(p.kid) && scope.has(p.kid)) done += p.done
    // progress files are rewritten every PROG_EVERY battles, so the per-tick delta is coarse and
    // spiky - smooth it, otherwise the display shows 0 b/s for most ticks then a huge spike
    const inst = (done - prevBattles) / Math.max(0.5, dt)
    rate = rate ? rate * 0.7 + inst * 0.3 : inst
    prevBattles = done; prevAt = now
    const load = sysLoad(), mem = memLoad(), duty = fleetDuty()
    hist.push(load)
    if (hist.length > 40) hist.shift()
    const sd = Math.sqrt(hist.reduce((a, b) => a + (b - load) ** 2, 0) / hist.length)
    const el = ((now - t0) / 60000).toFixed(1)
    const left = Math.max(0, grandTotal - done)
    const pctAll = grandTotal ? done / grandTotal : 0
    const barAll = '#'.repeat(Math.round(pctAll * 20)).padEnd(20)
    // wall clock on every line: without it a captured/redirected log cannot show whether a tick was
    // emitted live or dumped at exit (the whole "the progress bar is dead" question)
    const clock = new Date(now).toTimeString().slice(0, 8)
    const lines = [`${clock} [${el}m] ${barAll} ${(pctAll * 100).toFixed(0).padStart(3)}%  ${fmtN(done)}/${fmtN(grandTotal)}  ${Math.max(0, rate).toFixed(0)} b/s  eta ${fmtEta(rate > 0 ? left / rate : NaN)}  kits ${fin.size}/${totalKits}  cpu ${(load * 100).toFixed(0)}% sd ${(sd * 100).toFixed(1)} | ram ${(mem * 100).toFixed(0)}% | pacer ${duty.toFixed(2)}`]
    for (const p of prog.filter(x => scope.has(x.kid)).sort((a, b) => a.kid.localeCompare(b.kid))) {
      const pct = p.total ? (100 * p.done) / p.total : 0
      const bar = '#'.repeat(Math.round(pct / 5)).padEnd(20)
      lines.push(`${clock}   ${p.kid.padEnd(20)} ${bar} ${pct.toFixed(0).padStart(3)}%  ${String(p.done).padStart(6)}/${String(p.total).padEnd(6)} cr ${p.crashes} ${fin.has(p.kid) ? 'DONE' : p.phase}`)
    }
    if (live) {
      let out = liveRows ? `\x1b[${liveRows}A` : ''
      for (const l of lines) out += `\x1b[2K${l}\n`
      emit(1, out)
      liveRows = lines.length
      fileTick(lines, true)
    } else {
      // piped/redirected: a fan-out with 93 kits would print 93 lines per tick and bury the log.
      // summary line every tick (stderr, so a redirected stdout stays diff-able), per-kit only
      // every 5th tick + whenever a kit finishes.
      const kitLines = lines.slice(1)
      const full = tick % 5 === 0 || kitLines.some(l => l.includes('DONE'))
      if (full) {
        emit(2, lines[0] + '\n')
        for (const l of kitLines) emit(2, l + '\n')
      } else {
        emit(2, lines[0] + '\n')
      }
      // the file is polled, not watched: the full block is cheap at the 5s line-mode tick and is
      // what makes `Get-Content -Wait` show a moving bar per kit instead of one summary line
      fileTick(lines, true)
    }
    tick++
  }
  reportTick = tickOnce
  reportTimer = setInterval(tickOnce, live ? Math.min(REPORT_MS, 500) : REPORT_MS)
  reportTimer.unref?.()
}

/** Stop the reporter and print the FINAL state once. Without this the last block on screen is
 *  whatever the tick before the exit drew (e.g. 99% with the last kit still "in flight"). */
function stopReporter(): void {
  if (reportTimer) { clearInterval(reportTimer); reportTimer = null }
  const t = reportTick
  reportTick = null
  t?.()
}

let pool: Worker[] | null = null
const pacer = new Pacer(CPU_MAX, MEM_MAX)
function runTasks(tasks: SweepTask[]): Promise<{ r: SweepResult; task: SweepTask }[]> {
  if (THREADS <= 1) {
    return Promise.all(tasks.map(async task => {
      pacer.gate()
      return { r: await runOne(task.team, task.seed, task.logKey, task.targetCount, BATTLE_SPEC, task.carrier), task }
    }))
  }
  return new Promise((resolve, reject) => {
    const per = Math.max(1, Math.ceil(tasks.length / THREADS))
    const chunks: SweepTask[][] = []
    for (let i = 0; i < tasks.length; i += per) chunks.push(tasks.slice(i, i + per))
    const results = new Array<{ r: SweepResult; task: SweepTask }[]>(chunks.length)
    let cur = 0
    async function pump(w: Worker): Promise<void> {
      if (cur >= chunks.length) return
      const ci = cur++
      w.postMessage(chunks[ci])
      await new Promise<void>((res, rej) => {
        const onErr = (e: unknown) => { w.removeListener('error', onErr); rej(e) }
        const onMsg = (out: SweepResult[]) => { w.removeListener('error', onErr); results[ci] = chunks[ci].map((task, i) => ({ r: out[i], task })); res() }
        w.once('error', onErr)
        w.once('message', onMsg)
      })
      if (cur < chunks.length) return pump(w)
    }
    if (!pool) pool = Array.from({ length: THREADS }, () =>
      new Worker(new URL('./sweep-worker.ts', import.meta.url), {
        execArgv: ['--import', 'tsx'],
        workerData: { spec: BATTLE_SPEC, cpuMax: CPU_MAX, memMax: MEM_MAX },
      }))
    Promise.all(pool.map(w => pump(w)))
      .then(() => resolve(results.flat()))
      .catch(reject)
  })
}

async function sweepKit(kid: string): Promise<number> {
  const p = PRESETS[kid]
  const rel = p?.relic4 ?? []
  const pla = p?.planar ?? []
  const teams = teamVariants(kid)
  const packs = (FOUR_STAR.has(kid) ? PACKS_4STAR : PACKS).filter(pk => !PACK_FILTER.length || PACK_FILTER.includes(pk.name))
  const csvPath = join(DIR, `${kid}.csv`)
  if (existsSync(csvPath)) writeFileSync(csvPath, '', 'utf-8')
  const buf: string[] = ['pack,team,relic4,planar,seed,char,dmg,dpaV,win,av,err,targets,ability_dmg,axis_dmg,elem_dmg']
  const FLUSH_EVERY = parseInt(process.env.SWEEP_FLUSH ?? '2000', 10)
  let nCrashes = 0

  const flush = () => { appendFileSync(csvPath, buf.join('\n') + '\n', 'utf-8'); buf.length = 0 }

  const tasks: SweepTask[] = []
  const wave = async () => { if (!tasks.length) return; await writeWave(tasks.splice(0)) }
  const planTotal = teams.length * packs.length * rel.length * pla.length * SEEDS.length * TARGETS.length
  let kitBattles = 0
  const prog: ProgEntry = { kid, done: 0, total: planTotal, crashes: 0, phase: 'build', at: Date.now() }
  const pushProg = (fin = false) => { prog.done = kitBattles; prog.crashes = nCrashes; prog.at = Date.now(); if (fin) prog.fin = true; writeProg(prog) }
  pushProg()
  for (const nb of TARGETS) {
  for (const pack of packs) {
    for (let ti = 0; ti < teams.length; ti++) {
      for (const relic of rel) {
        for (const planar of pla) {
          for (const seed of SEEDS) {
            prog.phase = `${pack.name} x${nb} t${ti}`
const carrierGear = buildGear(kid, relic, planar)
    carrierGear.coneId = pack.si === 0 ? s0Cone(kid) : recCone(kid)
    carrierGear.si = pack.si === 0 ? 5 : pack.si
            // teams[ti] is the full order (a preset may place the carrier itself for Participant-ID gates)
            const team: TeamSpec[] = teams[ti].map(m => m === kid
              ? { kitId: kid, name: kid, eidolon: pack.eid, gear: carrierGear }
              : { kitId: m, name: m, eidolon: pack.eid, gear: mateGear(m, pack.si) })
            tasks.push({ meta: { pack: pack.name, ti, relic, planar, seed, nb }, team, seed, carrier: kid, logKey: `${pack.name}_t${ti}_${relic}_${planar}_n${nb}_s${seed}`, targetCount: nb })
            if (tasks.length >= WAVE) await wave()
          }
        }
      }
    }
  }
  }
  await wave()

  async function writeWave(wav: SweepTask[]) {
    let sinceFlush = 0
    for (const { r, task } of await runTasks(wav)) {
      // async transcript writes must land eventually, but flushing per row would
      // re-serialise the very I/O we moved off-thread -> drain in batches
      if (++sinceFlush >= 128) { await flushLogs(); sinceFlush = 0 }
      const { pack, ti, relic, planar, seed, nb } = task.meta
      const dmg = r.dmg
      task.team.forEach((t, i) => {
        const d = dmg[i] ?? 0
        // 13th/14th/15th columns: THIS character's damage split (every slot, not just the carrier) —
        // ability labels, the damage axis (attack type or break/superbreak/dot/true source), and the
        // element. Owner-folded like `dmg`, so a memosprite/Numby/LL lands on its owner. Commas are
        // stripped from labels (ability names contain them) so rows stay parseable.
        const sp = r.split[i]
        const enc = (m: [string, number][] | undefined): string =>
          (m ?? []).map(([k, v]) => `${k.replace(/,/g, "'").replace(/:/g, "'")}:${Math.round(v)}`).join(';')
        const a = r.avs[i] ?? r.av
        buf.push(csvRow([pack, ti, relic, planar, seed, t.name ?? kid, Math.round(d), +(a > 0 ? d / a : 0).toFixed(1), r.win ? 1 : 0, +a.toFixed(1), r.err ?? '', nb, enc(sp?.by), enc(sp?.axisBy), enc(sp?.elemBy)]))
      })
      if (r.err) {
        appendFileSync(join(DIR, 'crashes.tsv'), csvRow([kid, pack, ti, relic, planar, seed, nb, r.err]) + '\n', 'utf-8')
        nCrashes++
      }
      if (buf.length >= FLUSH_EVERY) flush()
      battleCount++
      prog.phase = `${pack} x${nb} t${ti}`
      if (++kitBattles % PROG_EVERY === 0) pushProg()
      if (battleCount % 10000 === 0) {
        const dt = (Date.now() - t0) / 60000
        reportBreak()
        console.log(`  ${fmtN(battleCount)} battles, ${dt.toFixed(1)}min, ${(battleCount / (dt || 0.05) / 60).toFixed(0)}/s, duty ${fleetDuty().toFixed(2)}`)
      }
    }
  }

  await flushLogs()
  flush()

  // mini-summary into the .done marker (user requirement): battles/crashes + per-pack
  // carrier DPAV ladder by target count, so the marker is a readable artifact, not empty.
  const summary = buildSummary(kid, csvPath)
  writeFileSync(join(DIR, `${kid}.done`), summary, 'utf-8')
  logFinished(kid, planTotal)
  pushProg(true)
  reportBreak()
  console.log(`  DONE ${kid}: ${fmtN(planTotal)} battles, ${nCrashes} crashes`)
  return nCrashes
}

type Sum = { dpaV: number[]; dmg: number[]; av: number[]; wins: number; n: number }
const newSum = (): Sum => ({ dpaV: [], dmg: [], av: [], wins: 0, n: 0 })

// ---------------------------------------------------------------------------
// .done report language: SWEEP_LANG=ru (default) | en
// ---------------------------------------------------------------------------
const LANG = (process.env.SWEEP_LANG ?? 'ru').toLowerCase().startsWith('en') ? 'en' : 'ru'
const TR: Record<string, [string, string]> = {
  battles: ['бои', 'battles'], crashes: ['краши', 'crashes'], win: ['винрейт', 'win'], av: ['AV', 'AV'],
  dmg: ['урон', 'dmg'], share: ['доля', 'share'], dpaV: ['урон/AV', 'dpaV'], med: ['медиана', 'med'],
  pack: ['пак', 'pack'], bestTeam: ['лучшая команда', 'best team'], targets: ['целей', 'targets'],
  teamSplit: ['разброс урона', 'team damage split'], medShare: ['медианная доля', 'median share'],
  carrier: ['кит', 'carrier'], barTeam: ['полоса нормирована на максимум команды', 'bar scaled to team max'],
  byAbility: ['урон по способностям', 'damage by ability'], byType: ['по типам/источникам', 'by type/source'],
  abilities: ['способности', 'abilities'], types: ['типы', 'types'], elements: ['по элементам', 'by element'], ladder: ['лестница', 'dpaV ladder'],
  noSplit: ['разбивки нет: CSV старше колонок 13/14/15 — нужен пересвип', 'no split data: CSV predates columns 13/14/15 — re-sweep to populate'],
  relicDelta: ['дельта 4 реликва', 'relic 4pc delta'], planarDelta: ['дельта планара', 'planar delta'],
  gear: ['вложения', 'gear'], teams: ['составов', 'teams'], deltaPack: ['дельта к медиане пака', 'delta vs pack median'],
  samples: ['выборок', 'samples'], teamDmg: ['урон/AV команды', 'team dpaV'], best: ['лучшая', 'best'],
}
/** report label in the selected language */
const t = (k: string): string => TR[k]?.[LANG === 'ru' ? 0 : 1] ?? k

/** damage-axis bucket → readable type. Attack types come from DmgType; the rest are damage sources.
 *  The three attack axes reuse the UI's own wording verbatim (`src/ui/reference.ts:6` — `Базовая` /
 *  `Навык` / `Ультимейт`); the UI has no label for the rest, so those are spelled out in Russian —
 *  an English term inside a Russian report column is unreadable. A sweep's CSVs carry exactly 12 axes
 *  (basic, skill, ult, fua, add, mem_skill, elation, aha, break, superbreak, dot, true) — the map
 *  covers all of them, so the `?? k` fallback should never fire. */
const AXIS_RU: Record<string, string> = {
  basic: 'Базовая', skill: 'Навык', ult: 'Ультимейт', fua: 'Доп. атака', add: 'Доп. урон',
  mem_skill: 'Навык мемоспрайта', elation: 'Элация', aha: 'Мгновение Аха', break: 'Слабость',
  superbreak: 'Сверхслабость', dot: 'Периодический урон', true: 'Истинный урон', unknown: 'Прочее',
}
const AXIS_EN: Record<string, string> = {
  basic: 'Basic Attack', skill: 'Skill', ult: 'Ultimate', fua: 'Follow-up', add: 'Additional DMG',
  mem_skill: 'Memosprite skill', elation: 'Elation', aha: 'Aha Instant', break: 'Weakness Break',
  superbreak: 'Super Break', dot: 'DoT', true: 'True DMG', unknown: 'other',
}
const axisName = (k: string): string => (LANG === 'ru' ? AXIS_RU : AXIS_EN)[k] ?? k

/** damage element → readable name. Keys are the engine's canonical `Elem` strings (`Physical`/…). */
const ELEM_RU: Record<string, string> = {
  Physical: 'Физический', Fire: 'Огонь', Ice: 'Лёд', Lightning: 'Электрический',
  Wind: 'Ветряной', Quantum: 'Квантовый', Imaginary: 'Мнимый',
}
const ELEM_EN: Record<string, string> = {
  Physical: 'Physical', Fire: 'Fire', Ice: 'Ice', Lightning: 'Lightning',
  Wind: 'Wind', Quantum: 'Quantum', Imaginary: 'Imaginary',
}
const elemName = (k: string): string => (LANG === 'ru' ? ELEM_RU : ELEM_EN)[k] ?? k

/** "Ability 42.1%  Other 3.0%" — a top-N share line for one character's damage-by-ability map */
const topNames = (m: Map<string, number>, lim: number, sep = ' · '): string => {
  const tot = [...m.values()].reduce((a, b) => a + b, 0)
  if (tot <= 0) return '-'
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, lim)
    .map(([k, v]) => `${k.slice(0, 30)} ${((100 * v) / tot).toFixed(1)}%`).join(sep)
}

/** CSV rows (12 col minimum; 13/14/15 add the damage-source split) → readable .done artifact (UTF-8; bars
 *  are U+2588, columns are padded to a file-wide name width so every table lines up):
 *  totals line, per-pack carrier DPAV ladder with bars + scaling ratios, relic/planar deltas,
 *  then per pack the FULL matrix — every gear variant, every team composition, each with the
 *  team damage split and per-character damage by ability + by type/source. */
function buildSummary(kid: string, csvPath: string): string {
  try {
    const rows = readFileSync(csvPath, 'utf8').split('\n').slice(1).filter(Boolean)
      .map(l => l.split(',')).filter(r => r.length >= 12)
    const mine = rows.filter(r => r[5] === kid)
    if (!mine.length) return `# ${kid}\n${t('battles')}: - (${LANG === 'ru' ? 'нет строк по киту' : 'no carrier rows'})\n`
    const f = (r: string[], i: number) => parseFloat(r[i] || '0') || 0

    const byPack = new Map<string, Sum>()
    let nCrash = 0, nWins = 0, sumDmg = 0
    for (const r of mine) {
      nWins += r[8] === '1' ? 1 : 0
      nCrash += r[10] ? 1 : 0
      sumDmg += f(r, 6)
      const e = byPack.get(`${r[0]} x${r[11]}`) ?? newSum()
      e.dpaV.push(f(r, 7)); e.dmg.push(f(r, 6)); e.av.push(f(r, 9)); e.wins += r[8] === '1' ? 1 : 0; e.n++
      byPack.set(`${r[0]} x${r[11]}`, e)
    }

    // per-battle team damage split: rows of one battle share pack/team/gear/seed/targets
    // share[] = carrier only (headline); byNameShare = every teammate, per pack x targets
    const share: number[] = []
    const byNameShare = new Map<string, number[]>()
    // per CONFIG (pack x targets x team x gear) x character: dpaV + ability labels + damage axis.
    // Keyed separately from byNameShare so a pack's best team can be picked first, then reported.
    const cfgChar = new Map<string, { dpaV: number[]; by: Map<string, number>; axis: Map<string, number>; elem: Map<string, number>; n: number }>()
    /** one team composition at one gear variant and target count — index for the full matrix */
    interface CfgInfo { nb: string; ti: string; gear: string; names: string[]; carrierDpaV: number[] }
    const packCfg = new Map<string, Map<string, CfgInfo>>()
    for (let i = 0; i < rows.length;) {
      const key = rows[i].slice(0, 5).join('|') + '|' + rows[i][11]
      const pk = `${rows[i][0]} x${rows[i][11]} t${rows[i][1]} ${rows[i][2]}+${rows[i][3]}`
      const cfg = pk
      let j = i, td = 0, cd = 0
      const parts: { name: string; d: number }[] = []
      const cv: number[] = []   // this config's carrier dpaV samples, one per battle
      while (j < rows.length && rows[j].slice(0, 5).join('|') + '|' + rows[j][11] === key) {
        const d = f(rows[j], 6)
        td += d
        if (rows[j][5] === kid) { cd += d; cv.push(f(rows[j], 7)) }
        const nm = rows[j][5]
        const e = cfgChar.get(`${cfg} x${nm}`) ?? { dpaV: [] as number[], by: new Map<string, number>(), axis: new Map<string, number>(), elem: new Map<string, number>(), n: 0 }
        cfgChar.set(`${cfg} x${nm}`, e)
        e.dpaV.push(f(rows[j], 7))
        e.n++
        const cols: [number, Map<string, number>][] = [[12, e.by], [13, e.axis], [14, e.elem]]
        for (const [col, map] of cols) {
          const cell = rows[j][col]
          if (!cell) continue
          for (const part of cell.split(';')) {
            const c = part.lastIndexOf(':')
            if (c <= 0) continue
            map.set(part.slice(0, c), (map.get(part.slice(0, c)) ?? 0) + (parseFloat(part.slice(c + 1)) || 0))
          }
        }
        parts.push({ name: nm, d })
        j++
      }
      if (td > 0) {
        share.push(cd / td)
        for (const p of parts) {
          const k = `${pk} x${p.name}`
          const e = byNameShare.get(k) ?? []
          e.push(p.d / td)
          byNameShare.set(k, e)
        }
        // index for the "every gear variant x every team" matrix the report prints
        const pack = rows[i][0]
        let gm = packCfg.get(pack)
        if (!gm) { gm = new Map(); packCfg.set(pack, gm) }
        const cKey = `${rows[i][11]} t${rows[i][1]} ${rows[i][2]}+${rows[i][3]}`
        if (!gm.has(cKey)) {
          gm.set(cKey, { nb: rows[i][11], ti: rows[i][1], gear: `${rows[i][2]}+${rows[i][3]}`, names: parts.map(p => p.name), carrierDpaV: [] })
        }
        gm.get(cKey)!.carrierDpaV.push(...cv)
      }
      i = j
    }

    // OnlyMainBreak (sheet $P$6): the sheet CREDITS the init Weakness Break hit to the carrier
    // (whoever really depleted the bar), not to the actual breaker. The sim attributes break damage
    // to the real attacker, so re-fold it in the REPORTED breakdown only — dpaV/shares/ownerDamage
    // keep real attribution (totals are unaffected either way). Teammate break → carrier.
    for (const [k, e] of cfgChar) {
      const cut = k.lastIndexOf(' x')
      if (cut <= 0) continue
      const cfg = k.slice(0, cut)
      const nm = k.slice(cut + 3)
      if (nm === kid) continue
      const br = e.axis.get('break') ?? 0
      if (br <= 0) continue
      e.axis.delete('break')
      e.by.delete('Weakness Break')
      const kc = `${cfg} x${kid}`
      const c = cfgChar.get(kc)
      if (c) {
        c.axis.set('break', (c.axis.get('break') ?? 0) + br)
        c.by.set('Weakness Break', (c.by.get('Weakness Break') ?? 0) + br)
      }
    }

    const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
    const packNames = [...new Set([...PACKS.map(p => p.name), ...PACKS_4STAR.map(p => p.name)])]
    // target counts and cycles are NOT in the CSV: read targets from the rows (so a summary-only
    // rebuild of an older sweep reports what it actually contains) and mark cycles as env-provided
    const tgs = [...new Set(rows.map(r => r[11]))].filter(Boolean).sort((a, b) => (+a) - (+b))
    if (!tgs.length) tgs.push(...TARGETS.map(String))
    const medOf = (pn: string, nb: string) => byPack.get(`${pn} x${nb}`)
    const maxV = Math.max(1, ...packNames.flatMap(pn => tgs.map(nb => { const e = medOf(pn, nb); return e ? med(e.dpaV) : 0 })))

    // best CONFIG per pack: highest median dpaV over (targets, team, relic4, planar) seeds.
    // Per PACK, not one global winner — each eidolon/SI variant gets its own best team reported.
    const byCfg = new Map<string, number[]>()
    for (const r of mine) {
      const k = `${r[0]} x${r[11]} team${r[1]} ${r[2]}+${r[3]}`
      const e = byCfg.get(k) ?? []
      e.push(f(r, 7))
      byCfg.set(k, e)
    }
    const bestOfPack = new Map<string, { key: string; v: number; n: number }>()
    for (const [k, v] of byCfg) {
      const pn = k.slice(0, k.indexOf(' x'))
      const m = med(v)
      const cur = bestOfPack.get(pn)
      if (!cur || m > cur.v) bestOfPack.set(pn, { key: k, v: m, n: v.length })
    }
    let mono = 0, monoN = 0
    for (const pn of packNames) {
      const m = tgs.map(nb => { const e = medOf(pn, nb); return e ? med(e.dpaV) : 0 })
      if (m.length < 2 || m.some(v => !v)) continue
      monoN++
      if (m.every((v, i) => i === 0 || v >= m[i - 1])) mono++
    }

    const BAR = '█'
    const bar = (v: number) => BAR.repeat(Math.max(1, Math.round((v / maxV) * 24)))
    const cell = (v: number) => v > 0 ? `${String(Math.round(v)).padStart(4)} ${bar(v).padEnd(24)}` : '   -                              '
    /** RU plural for counted nouns: 1 цель / 2 цели / 5 целей */
    const plural = (n: number, one: string, few: string, many: string): string =>
      LANG === 'en' ? many : n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many
    // one name column width for the whole report → every table's columns line up
    let nmW = 16
    for (const g of packCfg.values()) for (const c of g.values()) for (const nm of c.names) if (nm.length > nmW) nmW = nm.length
    const pad = (nm: string) => ((nm === kid ? '*' : ' ') + nm).padEnd(nmW + 1)
    // same for the `relic+planar` label: a fixed padEnd(24) swallowed the space on the longest combos
    let gearW = 24
    for (const g of packCfg.values()) for (const c of g.values()) if (c.gear.length > gearW) gearW = c.gear.length

    // reference pack = strongest carrier median at 3 targets (the comparison point for the tables below)
    let refPack = '', refV = -1
    for (const pn of packNames) { const e = medOf(pn, '3'); if (e && med(e.dpaV) > refV) { refV = med(e.dpaV); refPack = pn } }
    if (!refPack) { for (const pn of packNames) { const e = medOf(pn, '5'); if (e) { refPack = pn; break } } }

    // gear delta: median dpaV of one relic/planar vs the reference pack's own median (%)
    const gearDelta = (col: number): [string, number, number][] => {
      const by = new Map<string, number[]>()
      for (const r of mine) {
        if (r[0] !== refPack) continue
        const e = by.get(r[col]) ?? []
        e.push(f(r, 7))
        by.set(r[col], e)
      }
      if (!by.size) return []
      const base = med([...by.values()].flat())
      return [...by].map(([k, v]) => [k, base > 0 ? (100 * (med(v) - base)) / base : 0, v.length] as [string, number, number])
        .sort((a, b) => b[1] - a[1])
    }
    const gearLine = (title: string, col: number) => {
      const d = gearDelta(col)
      if (!d.length) return
      const fmt = (x: [string, number, number]) => `${x[0].slice(0, 18).padEnd(18)} ${(x[1] >= 0 ? '+' : '') + x[1].toFixed(1)}% (${LANG === 'ru' ? 'выборок' : 'n'}=${x[2]})`
      out.push(`${title} @${refPack} (${LANG === 'ru' ? 'медиана урон/AV против медианы пака' : 'median dpaV vs pack median'}):`)
      out.push(`  ${(LANG === 'ru' ? 'лучшие' : 'best').padEnd(8)}${d.slice(0, 3).map(fmt).join('   ')}`)
      const worst = d.slice(-2).filter(x => x[1] < 0)
      if (worst.length) out.push(`  ${(LANG === 'ru' ? 'худшие' : 'worst').padEnd(8)}${worst.map(fmt).join('   ')}`)
    }

    const out: string[] = []
    out.push(`# ${kid} - ${new Date().toISOString().slice(0, 10)}  ${LANG === 'ru' ? `свип ${CYCLES} циклов (env), цели ${tgs.join('/')}, сидов ${SEEDS.length}, логи ${SAVE_LOGS ? 'да' : 'нет'}` : `sweep ${CYCLES}c(env), targets ${tgs.join('/')}, seeds ${SEEDS.length}, logs ${SAVE_LOGS ? 'y' : 'n'}`}`)
    out.push(`${t('battles')} ${mine.length} (${LANG === 'ru' ? 'строк' : 'rows'} ${rows.length}) | ${t('crashes')} ${nCrash} | ${t('win')} ${((100 * nWins) / mine.length).toFixed(0)}% | ${t('av')} med ${med(mine.map(r => f(r, 9))).toFixed(0)} | ${t('dmg')} ${(sumDmg / 1e6).toFixed(1)}M | ${t('share')} med ${(100 * med(share)).toFixed(0)}%`)
    out.push(`${t('ladder')} (${LANG === 'ru' ? 'урон кита / AV боя, медиана на пак x цели' : 'carrier dmg / battle AV, median per pack x targets'}), ${LANG === 'ru' ? 'полоса нормирована на максимум пака' : 'bar scaled to pack max'}:`)
    for (const pn of packNames) {
      const e1 = medOf(pn, '1'), e3 = medOf(pn, '3'), e5 = medOf(pn, '5')
      if (!e1 && !e3 && !e5) continue
      const v = [e1 ? med(e1.dpaV) : 0, e3 ? med(e3.dpaV) : 0, e5 ? med(e5.dpaV) : 0]
      const r13 = v[0] ? (v[1] / v[0]).toFixed(2) : '-', r35 = v[1] ? (v[2] / v[1]).toFixed(2) : '-'
      out.push(`  ${pn.padEnd(5)} 1t ${cell(v[0])} 3t ${cell(v[1])} 5t ${cell(v[2])} x3/x1 ${r13} x5/x3 ${r35}`)
    }
    gearLine(t('relicDelta'), 2)
    gearLine(t('planarDelta'), 3)
    out.push(`${LANG === 'ru' ? 'монотонность ' + tgs.map(n => n + 't').join('<=') : 'monotonic ' + tgs.map(n => n + 't').join('<=')}: ${mono}/${monoN} ${LANG === 'ru' ? 'паков' : 'packs'} | ${LANG === 'ru' ? 'легенда: 1.0 урон/AV = ~1 ед. урона за AV; все доли и урон/AV — медианы по боям; доля = урон персонажа / урон команды; варианты эйдолона/SI — отдельные паки, у каждого своя полная матрица вложений и составов ниже' : 'legend: dpaV per 1.0 = ~1 dmg per AV; share = character dmg / team dmg; eidolon/SI variants are separate packs, each with its own best team below'}`)
    // ---- per-pack best team + per-character damage breakdown -------------------
    // one block per pack: the best team of THAT pack, its team damage split, and every
    // character's own damage by ability + by type/source (owner-folded: memosprites count)
    const shareLine = (m: Map<string, number>, lim: number, fn: (k: string) => string = axisName): string => {
      const tot = [...m.values()].reduce((a, b) => a + b, 0)
      if (tot <= 0) return '-'
      return [...m].sort((a, b) => b[1] - a[1]).slice(0, lim)
        .map(([k, v]) => `${fn(k)} ${((100 * v) / tot).toFixed(1)}%`).join(' · ')
    }
    for (const pn of packNames) {
      const b = bestOfPack.get(pn)
      if (!b) continue
      const gm = packCfg.get(pn)
      if (!gm || !gm.size) continue
      out.push('')
      out.push(`${t('pack')}: ${pn}  ${t('dpaV')} ${Math.round(b.v)} (${t('med')} ${b.n})  ${t('bestTeam')} ${b.key}`)
      // ---- full matrix: every gear variant x every team, ordered by the carrier's median dpaV ----
      // the old report printed ONE config per pack (the best), which hid both how a gear variant
      // ranks against its pack peers and how a team composition ranks against the same gear. The
      // carrier dpaV is comparable across target counts (damage per AV), so teams are ordered
      // straight by it; the pack median makes the gear delta a like-for-like number.
      const cfgV = (c: CfgInfo): number => med(c.carrierDpaV)
      // pack median PER TARGET COUNT. dpaV is comparable across nb, but a single pooled median puts
      // a 5t number next to a pile of 1t/3t ones, so a gear delta against it reads like +800% — a
      // delta is only meaningful inside its own nb bucket.
      const medByNb = (cs: CfgInfo[]): Map<string, number> => {
        const g = new Map<string, number[]>()
        for (const c of cs) { const a = g.get(c.nb) ?? []; a.push(...c.carrierDpaV); g.set(c.nb, a) }
        return new Map([...g].map(([nb, v]) => [nb, med(v)]))
      }
      const packNb = medByNb([...gm.values()])
      const byGear = new Map<string, CfgInfo[]>()
      for (const c of gm.values()) {
        const a = byGear.get(c.gear) ?? []
        a.push(c)
        byGear.set(c.gear, a)
      }
      const gears = [...byGear.entries()]
        .map(([gear, cs]) => ({ gear, cs, v: Math.max(...cs.map(cfgV)) }))
        .sort((a, z) => z.v - a.v || a.gear.localeCompare(z.gear))
      for (let gi = 0; gi < gears.length; gi++) {
        const g = gears[gi]
        // target count first (1t, then 3t, then 5t), damage descending INSIDE each target block —
        // dpaV stays comparable across target counts, but reading wants the blocks grouped
        const cs = g.cs.slice().sort((a, z) => (+a.nb - +z.nb) || (cfgV(z) - cfgV(a)) || (+a.ti - +z.ti))
        const gNb = medByNb(cs)
        const gLine = [...gNb.keys()].sort((a, z) => +a - +z)
          .map(nb => {
            const v = gNb.get(nb)!
            const b = packNb.get(nb) ?? 0
            const dl = b > 0 ? (100 * (v - b)) / b : 0
            return `${nb}t ${String(Math.round(v)).padStart(6)}  (${dl >= 0 ? '+' : ''}${dl.toFixed(1)}%)`
          }).join('   ')
        if (gi) out.push('')
        out.push(`  ${t('gear')} ${g.gear.padEnd(gearW)} ${t('dpaV') + ' (' + t('deltaPack') + ') '}${gLine}   ${cs.length} ${plural(cs.length, 'состав', 'состава', 'составов')}`)
        let lastNb = ''
        for (const c of cs) {
          const pre = `${pn} x${c.nb} t${c.ti} ${c.gear} x`
          const names = c.names.filter(nm => cfgChar.has(pre + nm))
          if (!names.length) continue
          const dpas = names.map(nm => med(cfgChar.get(pre + nm)!.dpaV))
          const tMax = Math.max(1, ...dpas)
          const sh = med(byNameShare.get(pre + kid) ?? [0])
          // bestOfPack keys use the `team<ti>` spelling (byCfg), the matrix uses `t<ti>`
          const isBest = b.key === `${pn} x${c.nb} team${c.ti} ${c.gear}`
          if (c.nb !== lastNb) { out.push(''); lastNb = c.nb }
          const targets = `${c.nb} ${plural(+c.nb, LANG === 'ru' ? 'цель' : 'target', LANG === 'ru' ? 'цели' : 'targets', LANG === 'ru' ? 'целей' : 'targets')}  t${c.ti}`
          out.push(`    ${targets.padEnd(18)}${isBest ? `[${t('best')}]`.padEnd(9) : ' '.repeat(9)}${t('dpaV')}${String(Math.round(cfgV(c))).padStart(8)}   ${t('share')}${(100 * sh).toFixed(0).padStart(4)}%   ${t('teamDmg')}${String(Math.round(dpas.reduce((x, y) => x + y, 0))).padStart(9)}   ${t('samples')}=${c.carrierDpaV.length}`)
          out.push(`      ${t('teamSplit').padEnd(nmW + 1)}${t('share').padStart(4)}  ${t('dpaV').padStart(9)}`)
          names.forEach((nm, i) => {
            const s2 = med(byNameShare.get(pre + nm) ?? [0])
            out.push(`      ${pad(nm)}${(100 * s2).toFixed(0).padStart(4)}%${String(Math.round(dpas[i])).padStart(9)}  ${BAR.repeat(Math.max(1, Math.round((dpas[i] / tMax) * 24)))}`)
          })
          const hasSplit = names.some(nm => cfgChar.get(pre + nm)!.by.size)
          if (hasSplit) {
            out.push(`      ${t('byAbility') + ' / ' + t('byType')}`)
            for (const nm of names) {
              const e = cfgChar.get(pre + nm)!
              out.push(`      ${pad(nm)} ${t('abilities')}: ${topNames(e.by, 5)}`)
              out.push(`      ${' '.repeat(nmW + 2)}${t('types')}: ${shareLine(e.axis, 8)}`)
              if (e.elem.size) out.push(`      ${' '.repeat(nmW + 2)}${t('elements')}: ${shareLine(e.elem, 8, elemName)}`)
            }
          } else if (rows.some(r => r.length <= 12)) {
            out.push(`      ${t('noSplit')}`)
          }
        }
      }
      out.push(`  (* = ${t('carrier')} ${kid}, ${t('barTeam')})`)
    }
    return out.join('\n') + '\n'
  } catch (e) {
    return `# ${kid}\n(${LANG === 'ru' ? 'сводка недоступна' : 'summary unavailable'}: ${e instanceof Error ? e.message : String(e)})\n`
  }
}

async function main() {
  mkdirSync(DIR, { recursive: true })
  // SWEEP_SUMMARY_ONLY=<kid|all> = rebuild .done from existing CSVs, no battles (format refresh)
  const sumOnly = process.env.SWEEP_SUMMARY_ONLY
  if (sumOnly) {
    const kids = sumOnly === 'all' ? carriers : sumOnly.split(',')
    let n = 0
    for (const k of kids) {
      const csv = join(DIR, `${k}.csv`)
      if (!existsSync(csv)) { console.log(`summary: ${k} - no csv`); continue }
      writeFileSync(join(DIR, `${k}.done`), buildSummary(k, csv), 'utf-8')
      n++
    }
    console.log(`summary: rebuilt ${n} .done file(s) from csv, no battles run`)
    return
  }
// auto-parallel: no explicit shard env -> fan out to ~90% of logical CPUs
if (process.env.SWEEP_JOB === undefined && process.env.SWEEP_JOBS === undefined) {
  const cpus = availableParallelism()
  const todo = carriers.filter(k => !isDone(k) && KITS.some(x => x.id === k) && PRESETS[k])
  const workers = Math.max(1, Math.min(Math.round(cpus * 0.9), cpus - 1, todo.length))
  if (workers > 1) {
    // seed the shared duty factor ONCE — children must inherit a fresh fleet state,
    // never wipe each other's (that would reset every process to full speed).
    clearShare()
    try { rmSync(PROGDIR, { recursive: true, force: true }) } catch { /* none */ }
    console.log(`auto-parallel: ${workers} workers on ${cpus} cpus, ${todo.length} kits to run, duty factor adaptive (<= ${(CPU_MAX * 100).toFixed(0)}% cpu / ${(MEM_MAX * 100).toFixed(0)}% ram)`)
    clearLogs() // BEFORE the fan-out: children must never race on the log tree
    startReporter(todo, true, carriersInit.reduce((a, k) => a + planTotalFor(k), 0))
    // Buffered fan-out (§78): each shard is piped and re-emitted one whole line at a time, so a
    // line can no longer be split by another shard's write (stdio:'inherit' let the console
    // interleave mid-line). Bounded retry (SWEEP_RETRY, default 1) re-launches a shard that exits
    // non-zero: sweepKit skips kits already marked `.done`, so a retry resumes, not restarts.
    const RETRY = Math.max(0, parseInt(process.env.SWEEP_RETRY ?? '1', 10))
    fanout({
      workers,
      start: (i) => {
        const c = spawn(process.execPath, ['--import', 'tsx', process.argv[1]], {
          env: { ...process.env, SWEEP_JOBS: String(workers), SWEEP_JOB: String(i) },
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return {
          stdout: c.stdout, stderr: c.stderr,
          on: (_ev, handler) => { c.on('exit', (code) => handler(code)) },
        }
      },
      maxRetry: RETRY,
      onRetry: (i, attempt, code) => {
        reportBreak()
        console.log(`  shard ${i}: exit ${code} — retry ${attempt + 1}/${RETRY}`)
      },
      onSettle: (bad, retried) => {
        stopReporter()
        if (retried) console.log(`  fan-out: ${retried} shard retr${retried === 1 ? 'y' : 'ies'} used`)
        process.exit(bad ? 1 : 0)
      },
    })
    return
  }
}
const noPreset = carriers.filter(k => !PRESETS[k])
const todo = carriers.filter(k => !isDone(k) && KITS.some(x => x.id === k) && PRESETS[k])
  console.log(`resume: ${todo.length} to run, no-preset(skip): ${noPreset.join(',') || '-'}`)
  if (JOBS <= 1) {
    clearLogs() // fan-out path already cleared it in the parent
    // purge the WHOLE prog dir, not just our own file: a previous run's <pid>.json survives
    // PROG_STALE_MS and the reporter then draws it as a phantom extra kit (and a premature
    // "kits 1/1"), since readProg only filters by age, not by liveness.
    try { rmSync(PROGDIR, { recursive: true, force: true }) } catch { /* none */ }
  }
  writeProg(null) // drop this process's stale progress from a previous run
  if (JOBS <= 1) startReporter(todo, false, todo.reduce((a, k) => a + planTotalFor(k), 0))

  let crashes = 0
  for (const kid of todo) crashes += await sweepKit(kid)
  if (pool) { for (const w of pool) await w.terminate(); pool = null }
  stopReporter()
  const dt = (Date.now() - t0) / 60000
  console.log(`\nSWEEP DONE job ${JOB}/${JOBS}: ${fmtN(battleCount)} battles, ${crashes} crashes, ${dt.toFixed(1)}min`)
}

await main()
