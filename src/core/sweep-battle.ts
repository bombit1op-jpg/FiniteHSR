import { prepareBattle } from './battle'
import type { EnemySpec, TeamSpec } from './battle'
import { createAudit } from './audit'
import type { Unit } from './entities/Unit'
import { preStats } from './debug-presets'
import { mkdir, writeFile } from 'fs/promises'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { cpus, freemem, totalmem } from 'os'

export interface BattleSpec {
  cycles: number
  enemy: Omit<EnemySpec, 'count'>
  saveLogs: boolean
  logDir: string
  /** only battles with these seeds write a transcript (empty/undefined = all).
   *  Log writing is I/O-bound (~19 MB/s here) and dominated a full sweep. */
  logSeeds?: number[]
  /** audit state block every Nth turn (1 = every turn) */
  stateEvery?: number
}

// Log writes run on the libuv pool instead of blocking the worker thread: a 800 KB
// sync write stalled a whole thread for tens of ms, and 16 stalled threads left the
// machine mostly idle (logs were ~80% of sweep wall time). Callers await flushLogs()
// before exiting so no transcript is lost.
const pendingWrites: Promise<void>[] = []
export function flushLogs(): Promise<void> {
  return pendingWrites.length ? Promise.all(pendingWrites).then(() => {}) : Promise.resolve()
}

/** damage split of one unit: by ability label + by damage axis, both owner-folded, top-N each */
export interface DmgSplit { label: string; axis: string; by: [string, number][]; axisBy: [string, number][]; elemBy: [string, number][] }

export async function runOne(
  team: TeamSpec[], seed: number, logKey: string | undefined, targetCount: number | undefined, spec: BattleSpec, carrierId?: string,
): Promise<{ win: boolean; av: number; avs: number[]; dmg: number[]; split: DmgSplit[]; err?: string }> {
  const sim = prepareBattle({ team, enemy: { ...spec.enemy, count: targetCount ?? 3 }, cycles: spec.cycles, seed })
  const wantLog = !!logKey && spec.saveLogs && (!spec.logSeeds?.length || spec.logSeeds.includes(seed))
  try {
    const audit = createAudit(sim, { stateEvery: wantLog ? spec.stateEvery : 1 })
    sim.initBattle()
    const pre = preStats(sim)
    sim.loop()
    const win = sim.allies('enemy').length === 0
    // owner fold: a memosprite/Numby/LL deals damage under its own name in `accounts`, so reading
    // the char's own entry by name under-counts summon kits (Hyacine/Castorice/Aglaea/TB-Mem/Numby).
    const ownerOf = (t: TeamSpec): Unit | undefined =>
      sim.roster.find(u => u.side === 'ally' && u.name === (t.name ?? ''))
    const dmg = team.map(t => {
      const owner = ownerOf(t)
      return owner ? (sim.ownerDamage.get(owner.id) ?? 0) : (sim.accounts.get(t.name ?? '')?.total ?? 0)
    })
    if (dmg.some(d => !isFinite(d))) return { win: false, av: 0, avs: [], dmg, split: [], err: 'NaN/Inf in account' }
    // per-slot DPAV divisor = AV at that unit's last actual action (lastActAv), final AV
    // fallback when a unit never acted (dead/departed before its first turn)
    const avs = team.map(t => {
      const owner = ownerOf(t)
      return owner?.lastActAv ?? sim.avElapsed
    })
    // per-character damage split (every team slot, not just the carrier): ability labels + damage axis
    // Aha is a neutral battlefield unit, not anyone's summon, so its Elation-Skill damage has no
    // owner — attribute it to the carrier (the Elation kit under test) as its own axis bucket.
    const aha = sim.roster.find(u => u.kind === 'aha')
    const ahaAxis = aha ? [...(sim.ownerAxis.get(aha.id) ?? new Map<string, number>())] : []
    const cIdx = team.findIndex(t => (t.name ?? '') === (carrierId ?? team[0].name ?? ''))
    const split: DmgSplit[] = team.map(t => {
      const owner = ownerOf(t)
      const by = owner ? [...(sim.ownerSkill.get(owner.id) ?? new Map<string, number>())] : []
      const axisBy = owner ? [...(sim.ownerAxis.get(owner.id) ?? new Map<string, number>())] : []
      const elemBy = owner ? [...(sim.ownerElem.get(owner.id) ?? new Map<string, number>())] : []
      if (aha && t === team[cIdx]) for (const [k, v] of ahaAxis) axisBy.push([k, v])
      return {
        label: t.name ?? '',
        axis: owner ? `${owner.kind}:${owner.elem}` : 'none',
        by: by.sort((a, b) => b[1] - a[1]).slice(0, 8),
        axisBy: axisBy.sort((a, b) => b[1] - a[1]),
        elemBy: elemBy.sort((a, b) => b[1] - a[1]),
      }
    })
    if (wantLog) {
      // per-carrier dir (team[0] is not necessarily the carrier: presets may place it in slot 2)
      const ldir = join(spec.logDir, carrierId ?? team[0].name ?? '')
      const path = join(ldir, `${logKey}.log`)
      const text = pre.join('\n') + '\n\n--- BATTLE ---\n' + audit.flush(sim).join('\n') + '\n'
      pendingWrites.push(mkdir(ldir, { recursive: true }).then(() => writeFile(path, text, 'utf-8')).then(() => {}))
    }
    return { win, av: sim.avElapsed, avs, dmg, split }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const loc = e instanceof Error && e.stack ? e.stack.split('\n')[1]?.trim() ?? '' : ''
    return { win: false, av: 0, avs: [], dmg: [], split: [], err: `${msg} @ ${loc}` }
  }
}

// ---------------------------------------------------------------------------
// adaptive system-wide pacer
//
// A fan-out sweep runs N processes on the same machine. Each of them sees the
// SAME plant (system CPU load), so N independent "load > cap ? sleep" controllers
// herd: everybody sleeps together (load collapses), everybody resumes together
// (load spikes) -> the 80% <-> 10% sawtooth. Fixes, in order of impact:
//   1. one SHARED duty factor f (in debug/sweep/load.json) = fraction of wall
//      time this fleet is allowed to run. All processes trim the same f, so the
//      fleet decelerates as one body instead of 18 phase-shifted copies.
//   2. hysteresis band: cut duty above cap - 1/2 band, grow it only below
//      cap - band. Removes the limit cycle at the cap itself.
//   3. CPU signal is an EWMA over >= WINDOW ms, not a 30-80ms delta (that
//      window is pure quantisation noise on Windows and reads spikes as truth).
//   4. proportional steps sized to the overshoot + per-process jitter, so a big
//      spike is answered at once and a small deviation only trimmed.
// No absolute numbers anywhere: caps are the only tuning knobs, the controller
// finds the machine's real headroom on its own (any core count, any load).
// ---------------------------------------------------------------------------

const CPU_WINDOW_MS = 500 // min sample window folded into the CPU EWMA
const SHARE_READ_MS = 100 // fleet-state cache age before re-reading the file
const SHARE_WRITE_MS = 250 // min interval between fleet-state writes
const SHARE_STALE_MS = 5000 // a fleet state older than this is ignored
const MIN_F = 0.05 // never stop the fleet entirely
const MAX_SLEEP_MS = 500 // hard cap per gate: a process never stalls a full battle
const BAND = 0.05 // hysteresis half-width, in load fraction

export function cpuMaxDefault(): number { return parseFloat(process.env.SWEEP_CPU_MAX ?? '0.8') }
export function memMaxDefault(): number { return parseFloat(process.env.SWEEP_MEM_MAX ?? '0.8') }

const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
function sleep(ms: number): void { if (ms > 0) Atomics.wait(sleepBuf, 0, 0, ms) }

// CPU load EWMA over a >= CPU_WINDOW_MS window. Returns the last folded value
// when called more often than that (callers poll it continuously).
let _cpuPrev: { idle: number; total: number } | null = null
let _cpuAt = 0
let _cpuEma = 0
export function sysLoad(): number {
  let idle = 0, total = 0
  for (const c of cpus()) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle
  }
  const now = Date.now()
  if (!_cpuPrev) { _cpuPrev = { idle, total }; _cpuAt = now; return _cpuEma }
  if (now - _cpuAt < CPU_WINDOW_MS) return _cpuEma
  const di = idle - _cpuPrev.idle
  const dt = total - _cpuPrev.total
  if (dt <= 0) return _cpuEma
  _cpuPrev = { idle, total }; _cpuAt = now
  const s = Math.min(1, Math.max(0, 1 - di / dt))
  _cpuEma = _cpuEma > 0 ? _cpuEma * 0.5 + s * 0.5 : s
  return _cpuEma
}

// RAM gauge (already smooth — instantaneous and monotonic, no window needed)
export function memLoad(): number {
  return 1 - freemem() / totalmem()
}

export interface FleetState { load: number; mem: number; f: number; at: number }
const SHARE_FILE = 'load.json'
let _share: FleetState | null = null
let _readAt = 0
let _writeAt = 0

export function sharePath(): string { return join(process.cwd(), 'debug', 'sweep', SHARE_FILE) }
export function clearShare(): void { try { rmSync(sharePath(), { force: true }) } catch { /* none */ } _share = null }

function readShare(): FleetState {
  const now = Date.now()
  if (_share && now - _readAt < SHARE_READ_MS) return _share
  _readAt = now
  try {
    const j = JSON.parse(readFileSync(sharePath(), 'utf-8')) as FleetState
    if (typeof j?.f === 'number' && isFinite(j.f) && typeof j.at === 'number' && now - j.at < SHARE_STALE_MS) {
      _share = { load: +j.load || 0, mem: +j.mem || 0, f: Math.min(1, Math.max(MIN_F, j.f)), at: j.at }
    }
  } catch { /* no fleet state yet -> first process seeds it */ }
  if (!_share) _share = { load: 0, mem: 0, f: 1, at: 0 }
  return _share
}

function writeShare(s: FleetState): void {
  const now = Date.now()
  if (now - _writeAt < SHARE_WRITE_MS) return
  _writeAt = now
  s.at = now
  _share = s
  try { writeFileSync(`${sharePath()}.${process.pid}`, JSON.stringify(s), 'utf-8'); renameSync(`${sharePath()}.${process.pid}`, sharePath()) } catch { /* racing writers are fine */ }
}

/** Duty factor the fleet settled on (1 = full speed). For progress logging. */
export function fleetDuty(): number { return readShare().f }

/** Per-process view of the shared duty cycle. One instance per worker/process. */
export class Pacer {
  private last = Date.now()
  constructor(private cpuMax: number, private memMax: number) {}
  /** Call once per battle. Sleeps just enough to hold the fleet's duty factor. */
  gate(): void {
    const now = Date.now()
    const elapsed = Math.min(2000, Math.max(0, now - this.last))
    this.last = now
    if (this.cpuMax >= 1 && this.memMax >= 1) return
    const s = readShare()
    const load = sysLoad()
    const mem = memLoad()
    s.load = load; s.mem = mem
    // overshoot in 0..1+: 0 while inside the hysteresis band, >1 well over the cap
    const over = Math.max(
      (load - (this.cpuMax - BAND * 0.5)) / Math.max(0.05, this.cpuMax),
      (mem - (this.memMax - BAND)) / Math.max(0.05, this.memMax),
    )
    // `f` is a duty TARGET smoothed by a first-order lag, not a ratchet. The old update was
    // multiplicative-per-battle downward with recovery only while over <= 0, so any signal that
    // stays slightly over the band pinned f at MIN_F forever — and a system-wide signal never
    // clears on its own: this box sits at ram 76% with an 80% cap, i.e. over = 0.0125, so the
    // whole 93-kit fleet ran at the 0.2 duty floor (observed cpu 19%, sweep ~5x slower than the
    // caps allow). A lag toward (1 - over) always moves and always recovers.
    const fTarget = Math.max(MIN_F, Math.min(1, 1 - over))
    s.f += (fTarget - s.f) * Math.min(1, (elapsed / 1000) * 2)
    writeShare(s)
    if (over <= 0) return
    // duty-cycle pacing: long-run duty = f. Jitter keeps the fleet de-phased.
    const duty = Math.max(0.2, Math.min(1, s.f * (1 + Math.max(0, over))))
    const want = elapsed > 0 ? (elapsed * (1 - duty)) / duty : 0
    sleep(Math.min(MAX_SLEEP_MS, want) * (0.85 + Math.random() * 0.3))
  }
}
