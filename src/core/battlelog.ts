/**
 * BattleLogger — the event system behind the two log views required by
 * `reference/hsr_log_format.txt` (§41: one event -> combat formatter + JSON event writer).
 *
 * Design notes (why this shape, not a rewrite of `Simulator.log`):
 *  - 1408 `log(...)` call sites across 46 files exist and ~600 `debug-kits.ts` assertions parse
 *    `sim.logLines` by exact string. Rewriting them into typed emitters would change every
 *    transcript and break every check, so `Simulator.log(msg)` keeps pushing the identical
 *    legacy line; the logger receives it as a `NOTE` event and additionally accepts an optional
 *    structured payload at the engine choke points where real data exists.
 *  - `DEBUG=0` (default) short-circuits every emit before any work: a normal sweep pays one
 *    comparison per event and behaves exactly as before.
 *  - SHA-256 is implemented in-file (K/H derived from prime roots at load) instead of importing
 *    `node:crypto`: the simulator also runs in the vite browser UI, where `node:crypto` does not
 *    exist, and state hashing must be identical in both.
 */
import { traceDamage, type DmgTrace } from './combat/DamageCalculator'
import { auditSummary, verifyInvariants, InvariantWatcher } from './battle/Invariants'
import type { Simulator } from './simulator'
import { eff, effectResOf, buffSum } from './combat/StatResolver'

/** DEBUG levels (§32). 0 = OFF, 1 = SUMMARY, 2 = ACTIONS, 3 = EFFECTS, 4 = DAMAGE,
 *  5 = FULL EVENT TRACE, 6 = STATE SNAPSHOT + DIFF, 7 = RNG + EVERYTHING. */
export type DebugLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

/** §42 run manifest. A 7-level battle takes a few hundred thousand rolls; cap the recording so a
 *  broken loop cannot grow this without bound (the raw LCG stream re-derives from the seed). */
const MAX_ROLLS = 200000

/** event vocabulary (§31). */
export type EventType =
  | 'BATTLE_START' | 'BATTLE_END'
  | 'WAVE_START' | 'WAVE_END'
  | 'CYCLE_START' | 'CYCLE_END'
  | 'ACTION_SCHEDULED' | 'ACTION_START' | 'ACTION_END' | 'ACTION_CANCELLED' | 'ACTION_SKIPPED'
  | 'ABILITY_USED' | 'TECHNIQUE_APPLIED'
  | 'HIT_START' | 'HIT_END'
  | 'DAMAGE_CALCULATED' | 'DAMAGE_DEALT'
  | 'HEAL_APPLIED'
  | 'BUFF_APPLIED' | 'BUFF_STACKED' | 'BUFF_REFRESHED' | 'BUFF_EXPIRED'
  | 'DEBUFF_APPLIED' | 'DEBUFF_STACKED' | 'DEBUFF_REFRESHED' | 'DEBUFF_EXPIRED' | 'DISPELLED'
  | 'ENERGY_GAIN' | 'ENERGY_LOSS' | 'ENERGY_FULL'
  | 'SP_GAIN' | 'SP_LOSS'
  | 'TOUGHNESS_DAMAGE' | 'WEAKNESS_BREAK' | 'BREAK_DAMAGE' | 'SUPERBREAK' | 'SECONDARY_BAR_EMPTIED' | 'TOUGHNESS_BAR_DEPLETED'
  | 'DOT_APPLIED' | 'DOT_TICK' | 'DOT_EXPIRED'
  | 'ACTION_ADVANCE' | 'ACTION_DELAY' | 'EXTRA_TURN'
  | 'SUMMON_CREATED' | 'SUMMON_DESPAWNED'
  | 'PHASE_START' | 'PHASE_END'
  | 'BOSS_RESET' | 'ENEMY_SPAWN' | 'ENEMY_DESPAWN'
  | 'OBJECTIVE_COMPLETE' | 'ENCOUNTER_VICTORY' | 'ENCOUNTER_DEFEAT'
  | 'SHIELD_APPLIED' | 'SHIELD_ABSORBED' | 'SHIELD_BROKEN'
  | 'HP_INTERCEPT' | 'HP_REDIRECT'
  | 'CONTROL_APPLIED' | 'CONTROL_EXPIRED'
  | 'DEATH' | 'REVIVAL' | 'FLEE'
  | 'TARGET_SELECTED'
  | 'STAT_CHANGED'
  | 'STATE_SNAPSHOT'
  | 'NOTE'

/** minimum DEBUG level that records an event type (§32). */
const MIN_DEBUG: Partial<Record<EventType, DebugLevel>> = {
  BATTLE_START: 1, BATTLE_END: 1,
  ACTION_START: 2, ACTION_END: 2, ACTION_SCHEDULED: 2, ACTION_CANCELLED: 2, ACTION_SKIPPED: 2,
  ABILITY_USED: 2, TECHNIQUE_APPLIED: 2, EXTRA_TURN: 2, HIT_START: 2, HIT_END: 2, TARGET_SELECTED: 2,
  DAMAGE_CALCULATED: 4, DAMAGE_DEALT: 4, TOUGHNESS_DAMAGE: 4, WEAKNESS_BREAK: 4,
  BREAK_DAMAGE: 4, SUPERBREAK: 4, TOUGHNESS_BAR_DEPLETED: 4,
  BUFF_APPLIED: 3, BUFF_STACKED: 3, BUFF_REFRESHED: 3, BUFF_EXPIRED: 3,
  DEBUFF_APPLIED: 3, DEBUFF_STACKED: 3, DEBUFF_REFRESHED: 3, DEBUFF_EXPIRED: 3, DISPELLED: 3,
  ENERGY_GAIN: 3, ENERGY_LOSS: 3, ENERGY_FULL: 3, SP_GAIN: 3, SP_LOSS: 3,
  DOT_APPLIED: 3, DOT_TICK: 3, DOT_EXPIRED: 3, HEAL_APPLIED: 3,
  SHIELD_APPLIED: 3, SHIELD_ABSORBED: 3, SHIELD_BROKEN: 3, HP_INTERCEPT: 3, HP_REDIRECT: 3,
  SUMMON_CREATED: 3, SUMMON_DESPAWNED: 3,
  PHASE_START: 2, PHASE_END: 2,
  BOSS_RESET: 2, ENEMY_SPAWN: 2, ENEMY_DESPAWN: 2,
  OBJECTIVE_COMPLETE: 2, ENCOUNTER_VICTORY: 1, ENCOUNTER_DEFEAT: 1,
  CONTROL_APPLIED: 3, CONTROL_EXPIRED: 3, DEATH: 3, REVIVAL: 3, FLEE: 3,
  ACTION_ADVANCE: 3, ACTION_DELAY: 3, STAT_CHANGED: 3, NOTE: 2,
  STATE_SNAPSHOT: 6,
}

/** COMBAT LOG section banner per event type (§5-§29). */
const SECTION: Partial<Record<EventType, string>> = {
  BATTLE_START: 'BATTLE', BATTLE_END: 'BATTLE',
  WAVE_START: 'WAVE', WAVE_END: 'WAVE',
  CYCLE_START: 'TIMELINE', CYCLE_END: 'TIMELINE',
  ACTION_START: 'ACTION', ACTION_END: 'ACTION', ACTION_SCHEDULED: 'TIMELINE',
  ACTION_ADVANCE: 'TIMELINE', ACTION_DELAY: 'TIMELINE', EXTRA_TURN: 'ACTION',
  HIT_START: 'HIT', HIT_END: 'HIT', ABILITY_USED: 'ACTION', TECHNIQUE_APPLIED: 'BATTLE',
  DAMAGE_CALCULATED: 'DAMAGE', DAMAGE_DEALT: 'DAMAGE',
  TOUGHNESS_DAMAGE: 'TOUGHNESS',
  WEAKNESS_BREAK: 'BREAK', BREAK_DAMAGE: 'BREAK', SUPERBREAK: 'BREAK', TOUGHNESS_BAR_DEPLETED: 'BREAK',
  BUFF_APPLIED: 'BUFF', BUFF_STACKED: 'BUFF', BUFF_REFRESHED: 'BUFF', BUFF_EXPIRED: 'BUFF',
  DEBUFF_APPLIED: 'DEBUFF', DEBUFF_STACKED: 'DEBUFF', DEBUFF_REFRESHED: 'DEBUFF',
  DEBUFF_EXPIRED: 'DEBUFF',
  ENERGY_GAIN: 'ENERGY', ENERGY_LOSS: 'ENERGY', ENERGY_FULL: 'ENERGY',
  SP_GAIN: 'SKILL POINTS', SP_LOSS: 'SKILL POINTS',
  DOT_APPLIED: 'DoT', DOT_TICK: 'DoT', DOT_EXPIRED: 'DoT',
  SHIELD_APPLIED: 'SHIELD', SHIELD_ABSORBED: 'SHIELD', SHIELD_BROKEN: 'SHIELD',
  HP_INTERCEPT: 'HP LOSS INTERCEPTOR', HP_REDIRECT: 'HP LOSS INTERCEPTOR',
  SUMMON_CREATED: 'SUMMON', SUMMON_DESPAWNED: 'SUMMON',
  PHASE_START: 'PHASE', PHASE_END: 'PHASE',
  BOSS_RESET: 'WAVE', ENEMY_SPAWN: 'WAVE', ENEMY_DESPAWN: 'WAVE',
  OBJECTIVE_COMPLETE: 'OBJECTIVE',
  ENCOUNTER_VICTORY: 'ENCOUNTER', ENCOUNTER_DEFEAT: 'ENCOUNTER',
  DEATH: 'DEATH', REVIVAL: 'DEATH', FLEE: 'FLEE', HEAL_APPLIED: 'HEAL',
  TARGET_SELECTED: 'TARGET SELECTION', STAT_CHANGED: 'STAT',
  CONTROL_APPLIED: 'CONTROL', CONTROL_EXPIRED: 'CONTROL',
  NOTE: 'NOTE',
}

/** `--event=` groups (§33). */
const EVENT_GROUPS: Record<string, EventType[]> = {
  damage: ['DAMAGE_CALCULATED', 'DAMAGE_DEALT', 'TOUGHNESS_DAMAGE'],
  break: ['WEAKNESS_BREAK', 'BREAK_DAMAGE', 'SUPERBREAK', 'TOUGHNESS_BAR_DEPLETED'],
  buff: ['BUFF_APPLIED', 'BUFF_STACKED', 'BUFF_REFRESHED', 'BUFF_EXPIRED'],
  debuff: ['DEBUFF_APPLIED', 'DEBUFF_STACKED', 'DEBUFF_REFRESHED', 'DEBUFF_EXPIRED'],
  energy: ['ENERGY_GAIN', 'ENERGY_LOSS', 'ENERGY_FULL'],
  sp: ['SP_GAIN', 'SP_LOSS'],
  timeline: ['ACTION_ADVANCE', 'ACTION_DELAY', 'ACTION_START', 'ACTION_END', 'EXTRA_TURN'],
  dot: ['DOT_APPLIED', 'DOT_TICK', 'DOT_EXPIRED'],
  heal: ['HEAL_APPLIED', 'SHIELD_APPLIED', 'SHIELD_ABSORBED'],
  shield: ['SHIELD_APPLIED', 'SHIELD_ABSORBED', 'SHIELD_BROKEN'],
  death: ['DEATH', 'REVIVAL', 'FLEE'],
  summon: ['SUMMON_CREATED', 'SUMMON_DESPAWNED'],
  wave: ['WAVE_START', 'WAVE_END', 'BOSS_RESET', 'ENEMY_SPAWN', 'ENEMY_DESPAWN'],
  encounter: ['OBJECTIVE_COMPLETE', 'ENCOUNTER_VICTORY', 'ENCOUNTER_DEFEAT'],
  target: ['TARGET_SELECTED'],
  state: ['STATE_SNAPSHOT', 'STAT_CHANGED'],
}

/** command-line-shaped filter (§33). */
export interface LogFilter {
  character?: string
  enemy?: string
  event?: string[]
  ability?: string
  turn?: number
  fromAv?: number
  toAv?: number
  action?: number
  seed?: number
}

export interface LogConfig {
  /** §32. Default 0 = OFF, i.e. a plain sweep pays one comparison and changes nothing. */
  debug?: DebugLevel
  filter?: LogFilter
  /** emit a state snapshot + diff after these event types (§29). Needs debug >= 6. */
  snapshotOn?: EventType[]
  /** §10/§27: run the invariant watcher after EVERY event and throw on the first violation that
   *  event produces, so a broken state fails next to its cause instead of at battle end. Opt-in —
   *  off by default so a mass sweep pays nothing. */
  verifyPerEvent?: boolean
  /** write the §40 file tree on flush. */
  dir?: string
  /** file sink for `dir`. Required when there is no CJS `require` (ESM/tsx): pass
   *  `write: (path, body) => writeFileSync(path, body)`. Injected rather than imported so the
   *  simulator still bundles for the vite browser UI, where `node:fs` does not exist. */
  write?: (path: string, body: string) => void
}

/** one event (§41). `payload` carries whatever the emitter had; `raw` is the legacy log line. */
export interface BattleEvent {
  eventId: number
  time: number
  turn: number
  actionId: number
  /** §6 dotted trace chain, stamped only where the emitter knows its own level:
   *  ACT `182`, HIT `182.3`, DMG `182.3.1`. Absent when logging is off, and for event types with
   *  no level of their own (buffs, energy, SP...). The `TRG` level of the spec is deliberately not
   *  stamped: the engine has no trigger events to number, and inventing one here would fake the
   *  chain - it belongs to the trigger queue (§27). */
  traceId?: string
  type: EventType
  source?: string
  target?: string
  sourceId?: string
  targetId?: string
  attackType?: string
  element?: string
  /** Provenance information for effects and abilities */
  provenance?: {
    sourceKind: 'ability' | 'technique' | 'talent' | 'passive' | 'trace' | 'lightCone' | 'relic' | 'enemyAbility' | 'manual' | 'preCombat' | 'environment' | 'unknown'
    abilityId?: string
    abilityName?: string
    abilitySlot?: 'basic' | 'skill' | 'ult' | 'talent' | 'technique' | 'memo'
    triggeredByUnitId?: string
    triggeredByUnitName?: string
  }
  payload: Record<string, unknown>
  raw?: string
}

export interface StateSnapshot {
  turn: number
  actionId: number
  time: number
  sp: number
  maxSp: number
  units: Record<string, {
    id: string
    name: string
    side: string
    kind: string
    level: number
    hp: number
    maxHp: number
    shield: number
    energy: number
    maxEnergy: number
    av: number
    toughness: number
    maxToughness: number
    broken: boolean
    dead: boolean
    buffs: Array<{ id: string; name: string; stacks: number; turns: number; mods: any[]; sourceId?: string }>
    debuffs: Array<{ id: string; name: string; stacks: number; turns: number; mods: any[]; sourceId?: string }>
    dots: Array<{ id: string; name: string; element: string; damage: number; turns: number; sourceId?: string }>
    controls: Array<{ id: string; name: string; turns: number; sourceId?: string }>
    atk: number
    def: number
    spd: number
    critRate: number
    critDmg: number
    be: number
    ehr: number
    effRes: number
    wave: number
  }>
}

// ---------------------------------------------------------------- SHA-256 (§38)

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))
const frac32 = (x: number): number => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0

/** SHA-256 round constants: fractional parts of the cube roots of the first 64 primes, and the
 *  initial state: fractional parts of the square roots of the first 8 primes. Derived instead of
 *  hard-coded — 72 magic numbers with no source beats 72 magic numbers without one. */
const SHA_K = ((): Uint32Array => {
  const isPrime = (n: number): boolean => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true }
  const out = new Uint32Array(64)
  let n = 2
  for (let i = 0; i < 64; n++) if (isPrime(n)) out[i++] = frac32(Math.cbrt(n))
  return out
})()
const SHA_H = ((): Uint32Array => {
  const isPrime = (n: number): boolean => { for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true }
  const out = new Uint32Array(8)
  let n = 2
  for (let i = 0; i < 8; n++) if (isPrime(n)) out[i++] = frac32(Math.sqrt(n))
  return out
})()

export function sha256Hex(msg: string): string {
  const bytes = new TextEncoder().encode(msg)
  const blocks = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6)
  blocks.set(bytes)
  blocks[bytes.length] = 0x80
  const dv = new DataView(blocks.buffer)
  dv.setUint32(blocks.length - 8, Math.floor((bytes.length * 8) / 4294967296))
  dv.setUint32(blocks.length - 4, (bytes.length * 8) >>> 0)
  const H = SHA_H.slice()
  const w = new Uint32Array(64)
  for (let off = 0; off < blocks.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2]
      w[i] = (w[i - 16] + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3))
        + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7]
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0
  }
  let hex = ''
  for (const x of H) hex += x.toString(16).padStart(8, '0')
  return hex.toUpperCase()
}

/** key-sorted JSON so a hash does not depend on property insertion order. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(',')}}`
}

const num = (n: number): string => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2))
const pad = (n: number, w = 3): string => String(n).padStart(w, '0')
const BAR = '═'.repeat(60)
const THIN = '─'.repeat(60)

// ---------------------------------------------------------------- the logger

export class BattleLogger {
  readonly events: BattleEvent[] = []
  /** §12 raw multiplier chains, filled only while the engine's damage trace sink is ours. */
  readonly damage: DmgTrace[] = []
  readonly errors: string[] = []

  private eventId = 0
  private turnNo = 0
  private actNo = 0
  private atkNo = 0
  private hitNo = 0
  private dmgNo = 0
  private trgNo = 0
  private lastSnapshot?: StateSnapshot
  /** §10/§27 per-event invariant checker; present only when `cfg.verifyPerEvent`. */
  private watcher?: InvariantWatcher
  /** installed by `attachDamageTrace`; released in flush() so a second battle re-registers. */
  private ownTrace = false
  private detachTrace: () => void = () => {}

  private counts: Record<string, number> = {}
  private spSpent = 0
  private spGained = 0
  private spStart = 0

  constructor(private sim: Simulator, readonly cfg: LogConfig = {}) {
    this.spStart = sim.sp()
    if (this.cfg.verifyPerEvent) this.watcher = new InvariantWatcher(() => sim.units(), () => ({ sp: sim.sp(), maxSp: sim.maxSp }))
    if (this.on && this.cfg.debug! >= 4) this.attachDamageTrace()
  }

  /** §32: 0 = OFF. Everything else returns early before allocating an event. */
  get on(): boolean { return (this.cfg.debug ?? 0) > 0 }
  get debug(): DebugLevel { return this.cfg.debug ?? 0 }
  /** true only when `Simulator.rng` must append to the §28 roll array */
  get traceRng(): boolean { return this.debug >= 7 }
  get turn(): number { return this.turnNo }
  get actionId(): number { return this.actNo }

  /** Route the engine's `DmgTrace` recorder into this logger. DamageCalculator fans every trace out
   *  to all registered consumers, so this coexists with probe-damage-chain instead of losing to it. */
  private attachDamageTrace(): void {
    this.damage.length = 0
    this.detachTrace = traceDamage(this.damage, t => this.emit({
      type: 'DAMAGE_CALCULATED', source: t.who, target: t.foe, sourceId: t.whoId, targetId: t.foeId, element: t.elem, attackType: t.type,
      payload: {
        dmg: t.dmg, crit: t.crit, stat: Math.round(t.stat), mult: Number(t.mult.toFixed(4)),
        critRate: Number(t.critRate.toFixed(4)), boost: Number(t.boost.toFixed(4)),
        defPen: Number(t.defPen.toFixed(4)), res: Number(t.res.toFixed(4)), resPen: Number(t.resPen.toFixed(4)),
        vuln: Number(t.vuln.toFixed(4)), mit: Number(t.mit.toFixed(4)), weaken: Number(t.weaken.toFixed(4)),
        broken: t.broken, noBoost: t.noBoost, trace: this.damage.length,
      },
    }))
    this.ownTrace = true
  }

  /** §11/§42 determinism: the raw 32-bit LCG stream in draw order, plus each roll's outcome. */
  readonly rolls: { n: number; raw: number }[] = []
  recordRng(raw: number, n: number): void {
    if (this.rolls.length < MAX_ROLLS) this.rolls.push({ n, raw })
  }

  // ---------- ID system (§3): ACT -> ATK -> HIT -> DMG / TRG

  beginAction(): number { return ++this.actNo }
  /** A unit's action begins: new turn number, new ACT id, per-attack/hit/damage counters reset. */
  turnStart(source: string, action: string, payload?: Record<string, unknown>, sourceId?: string): void {
    this.turnNo++
    this.beginAction()
    this.atkNo = 0; this.hitNo = 0; this.dmgNo = 0; this.trgNo = 0
    this.emit({ type: 'ACTION_START', source, sourceId, trace: 'ACT', payload: { action, ...payload } })
    this.emit({ type: 'ABILITY_USED', source, sourceId, trace: 'ACT', payload: { action } })
  }
  /** A unit's action ends (all effects resolved). */
  turnEnd(source: string, action: string, sourceId?: string): void {
    this.emit({ type: 'ACTION_END', source, sourceId, payload: { action } })
  }
  beginAttack(): number { this.atkNo++; this.hitNo = 0; return this.atkNo }
  beginHit(): number { return ++this.hitNo }
  beginDamage(): number { return ++this.dmgNo }
  beginTrigger(): number { return ++this.trgNo }

  id(kind: 'ACT' | 'ATK' | 'HIT' | 'DMG' | 'TRG'): string {
    switch (kind) {
      case 'ACT': return `${this.actNo}`
      case 'ATK': return `${this.actNo}.${this.atkNo}`
      case 'HIT': return `${this.actNo}.${this.atkNo}.${this.hitNo}`
      case 'DMG': return `${this.actNo}.${this.atkNo}.${this.hitNo}.${this.dmgNo}`
      case 'TRG': return `${this.actNo}.${this.atkNo}.${this.hitNo}.T${pad(this.trgNo, 2)}`
    }
  }

  /** §2 the permanent prefix: `[AV 012.453][T014][ACT 183][EVT 492]`. */
  prefix(e: BattleEvent): string {
    return `[AV ${e.time.toFixed(3).padStart(8)}][T${pad(e.turn)}][ACT ${e.actionId}][EVT ${e.eventId}]`
  }

  // ---------- emit

  /** One event, fanned out to the combat formatter and the JSON writer (§41). */
  emit(e: {
    type: EventType
    source?: string
    target?: string
    /** §43 stable unit ids: identity, not the display name above. Merged into the payload as
     *  `sourceId`/`targetId`/`ownerId` (string keys — the golden numeric fingerprint ignores them). */
    sourceId?: string
    targetId?: string
    ownerId?: string
    attackType?: string
    element?: string
    payload?: Record<string, unknown>
    raw?: string
    /** override the level gate (rare: a NOTE forced out at debug 2, a BATTLE_END at debug 1). */
    minDebug?: DebugLevel
    /** §6 chain level, when the emitter knows it (see `BattleEvent.traceId`). */
    trace?: 'ACT' | 'ATK' | 'HIT' | 'DMG'
  }): BattleEvent | undefined {
    if (!this.on) return undefined
    const gate = e.minDebug ?? MIN_DEBUG[e.type] ?? 2
    if (this.debug < gate) return undefined
    // filter before the id is burned, so a filtered run's EVT sequence has no gaps
    const ids: Record<string, unknown> = {}
    if (e.sourceId !== undefined) ids.sourceId = e.sourceId
    if (e.targetId !== undefined) ids.targetId = e.targetId
    if (e.ownerId !== undefined) ids.ownerId = e.ownerId
    const ev: BattleEvent = {
      eventId: this.eventId + 1,
      time: this.sim.avElapsed,
      turn: this.turnNo,
      actionId: this.actNo,
      traceId: e.trace ? this.id(e.trace) : undefined,
      type: e.type,
      source: e.source, target: e.target,
      attackType: e.attackType, element: e.element,
      payload: (e.sourceId !== undefined || e.targetId !== undefined || e.ownerId !== undefined)
        ? { ...ids, ...(e.payload ?? {}) }
        : (e.payload ?? {}),
      raw: e.raw,
    }
    if (this.filtered(ev)) return undefined
    ev.eventId = ++this.eventId
    this.events.push(ev)
    this.counts[e.type] = (this.counts[e.type] ?? 0) + 1
    const n = Number(ev.payload.n ?? 0)
    if (ev.type === 'SP_LOSS') this.spSpent += n
    if (ev.type === 'SP_GAIN') this.spGained += n
    if (this.cfg.snapshotOn?.includes(e.type)) this.snapshot()
    if (this.watcher) {
      const bad = this.watcher.check(ev)
      if (bad.length) {
        const prev = this.events[this.events.length - 2]
        throw new Error(
          `invariant violation after EVT ${ev.eventId} (${ev.type} ${ev.source ?? ''}${ev.target ? ' -> ' + ev.target : ''}): ${bad.join('; ')}` +
          `\n  seed=${this.sim.cfg.seed} turn=${ev.turn} act=${ev.actionId} prev=${prev ? prev.type : '(none)'}`,
        )
      }
    }
    return ev
  }

  /** §33. Filtered events are dropped entirely — the views must not lie about what they show. */
  private filtered(e: BattleEvent): boolean {
    const f = this.cfg.filter
    if (!f) return false
    if (f.seed !== undefined && f.seed !== this.sim.cfg.seed) return true
    if (f.turn !== undefined && f.turn !== e.turn) return true
    if (f.action !== undefined && f.action !== e.actionId) return true
    if (f.fromAv !== undefined && e.time < f.fromAv) return true
    if (f.toAv !== undefined && e.time > f.toAv) return true
    if (f.ability && e.attackType !== f.ability) return true
    if (f.character && e.source !== f.character && e.target !== f.character) return true
    if (f.enemy && e.target !== f.enemy && e.source !== f.enemy) return true
    if (f.event?.length) {
      const wanted = new Set(f.event.flatMap(g => EVENT_GROUPS[g] ?? [g as EventType]))
      if (!wanted.has(e.type)) return true
    }
    return false
  }

  /** legacy free-text line from `Simulator.log` — the 1408 kit call sites land here. */
  note(msg: string): void { this.emit({ type: 'NOTE', raw: msg, minDebug: 2 }) }

  /** §28 RNG trace. `Simulator.rng()` appends to `rolls` directly (`recordRng`); this renders it.
   *  A per-roll EVENT was pruned — 200k events dwarf every other type and the array already holds
   *  the whole sequence, so it ships as its own `rng.json` / trace section instead. */
  rngTrace(): string {
    const out = [THIN, `RNG TRACE (${this.rolls.length} of ${MAX_ROLLS} rolls, seed ${this.sim.cfg.seed})`, THIN]
    for (const r of this.rolls) out.push(`#${r.n}\t${r.raw}`)
    return out.join('\n')
  }

  // ---------- §29 state snapshot / diff / §38 hash

  snapshot(): StateSnapshot {
    const units: StateSnapshot['units'] = {}
    for (const u of this.sim.units()) {
      // Build detailed buff/debuff/dot info
      const buffs = u.buffs.filter(b => !b.debuff).map(b => ({
        id: b.id,
        name: b.name,
        stacks: b.stacks ?? 1,
        turns: b.turns ?? Infinity,
        mods: b.mods ?? [],
        sourceId: b.sourceId,
        shield: b.shield,
      }))
      const debuffs = u.buffs.filter(b => b.debuff).map(b => ({
        id: b.id,
        name: b.name,
        stacks: b.stacks ?? 1,
        turns: b.turns ?? Infinity,
        mods: b.mods ?? [],
        sourceId: b.sourceId,
      }))
      const dots = u.dots.map(d => ({
        id: d.kind,
        name: d.kind,
        element: d.elem,
        damage: d.baseDmg,
        turns: d.turns,
        stacks: d.stacks,
        sourceBe: d.sourceBe,
        defIgnore: d.defIgnore,
      }))
      const controls = u.buffs.filter(b => b.debuff && (b.id.includes('control') || b.id.includes('imprison') || b.id.includes('freeze') || b.id.includes('shock') || b.id.includes('entangle') || b.id.includes('wind'))).map(b => ({
        id: b.id,
        name: b.name,
        turns: b.turns ?? 0,
        sourceId: b.sourceId,
      }))

      // Get final stats using the sim's eff function
      const stats = eff(u)

      units[u.id] = {
        id: u.id,
        name: u.name,
        side: u.side,
        kind: u.kind,
        level: u.base.level,
        hp: Math.round(u.hp * 100) / 100,
        maxHp: u.maxHp,
        shield: u.buffs.reduce((sum, b) => sum + (b.shield ?? 0), 0),
        energy: Math.round(u.energy * 100) / 100,
        maxEnergy: u.maxEnergy,
        av: Math.round(u.av * 1000) / 1000,
        toughness: Math.round(u.toughness * 100) / 100,
        maxToughness: u.maxToughness,
        broken: !!u.broken,
        dead: !!u.dead,
        buffs,
        debuffs,
        dots,
        controls,
        atk: Math.round(stats.atk ?? u.base.atk ?? 0),
        def: Math.round(stats.def ?? u.base.def ?? 0),
        spd: Math.round((stats.spd ?? u.base.spd ?? 0) * 10) / 10,
        critRate: stats.critRate ?? 0,
        critDmg: stats.critDmg ?? 0,
        be: stats.be ?? 0,
        ehr: (u.base.ehr ?? 0) + buffSum(u.buffs, 'ehr'),
        effRes: effectResOf(u),
        wave: u.wave ?? 1,
      }
    }
    const s: StateSnapshot = {
      turn: this.turnNo, actionId: this.actNo, time: this.sim.avElapsed,
      sp: this.sim.sp(), maxSp: this.sim.maxSp, units,
    }
    // diff() stores `next` as the new baseline, so it must run BEFORE this snapshot is published
    const changes = this.debug >= 6 ? this.diff(s) : (this.lastSnapshot = s, [] as string[])
    if (this.debug >= 6) this.emit({ type: 'STATE_SNAPSHOT', payload: { state: s, hash: this.hash(s), diff: changes }, minDebug: 6 })
    return s
  }

  /** the trace of the damage instance just resolved, when the trace sink is ours (§12) */
  get lastDamage(): DmgTrace | undefined { return this.ownTrace ? this.damage[this.damage.length - 1] : undefined }

  /** field-by-field change list between the previous snapshot and `next`. */
  diff(next: StateSnapshot): string[] {
    const prev = this.lastSnapshot
    this.lastSnapshot = next
    if (!prev) return []
    const out: string[] = []
    const cmp = (path: string, a: unknown, b: unknown): void => {
      if (stableJson(a) !== stableJson(b)) out.push(`${path}: ${stableJson(a)} -> ${stableJson(b)}`)
    }
    for (const [name, u] of Object.entries(next.units)) {
      const p = prev.units[name]
      if (!p) { out.push(`${name}: <new unit>`); continue }
      for (const k of ['hp', 'energy', 'av', 'toughness', 'broken', 'dead'] as const) cmp(`${name}.${k}`, p[k], u[k])
      cmp(`${name}.buffs`, p.buffs, u.buffs)
      cmp(`${name}.dots`, p.dots, u.dots)
    }
    for (const name of Object.keys(prev.units)) if (!next.units[name]) out.push(`${name}: <removed>`)
    if (prev.sp !== next.sp) out.push(`team.sp: ${prev.sp} -> ${next.sp}`)
    return out
  }

  /** §38 state hash over the key-sorted snapshot. */
  hash(s: StateSnapshot = this.snapshot()): string { return sha256Hex(stableJson(s)) }

  /** §29.7/§38 event-stream hash over the key-sorted event list: same config + seed must
   *  reproduce the same stream, so the same hash. Empty when the log is off (nothing recorded). */
  eventHash(): string { return sha256Hex(stableJson(this.events)) }

  /** `ownerDamage`/`ownerAxis` are keyed by owner UNIT ID; reports want names. A despawned
   *  owner is gone from the roster, so fall back to the id. */
  private ownerName(id: string): string {
    return this.sim.units().find(u => u.id === id)?.name ?? id
  }

  // ---------- §4 COMBAT LOG

  /** Readable top-to-bottom battle view (§4-§29): what happened, no arithmetic. */
  combatLog(): string {
    const out: string[] = []
    let block: BattleEvent[] = []
    const flush = (): void => {
      if (!block.length) return
      const head = block[0]
      const who = head.source ?? '—'
      const kind = String(head.payload.action ?? '').toUpperCase()
      out.push(BAR)
      out.push(`${this.prefix(head)} ${who}${kind ? ' — ' + kind : ''}`)
      out.push(BAR)
      let lastTarget: string | undefined
      for (const e of block) {
        if (e.type === 'ACTION_START' || e.type === 'HIT_START' || e.type === 'NOTE') continue
        // §2: every body line carries the same prefix as the header, so one regex finds any moment.
        const px = this.prefix(e) + ' '
        if (e.type === 'DAMAGE_DEALT') {
          const t = e.target ?? '—'
          if (t !== lastTarget) { out.push('', `${px}${t}`); lastTarget = t }
          out.push(`${px}  ${num(Number(e.payload.amount ?? 0))}${e.payload.crit ? ' CRIT' : ''}${e.element ? ' ' + e.element : ''} DMG`)
          if (e.payload.hpBefore !== undefined) {
            out.push(`${px}    HP: ${num(Number(e.payload.hpBefore))} -> ${num(Number(e.payload.hpAfter))}`)
          }
          continue
        }
        const s = SECTION[e.type]
        if (s) out.push(`${px}  ${s}: ${describe(e)}`)
      }
      out.push(BAR, '')
      block = []
    }
    for (const e of this.events) {
      if (e.type === 'ACTION_START' || e.type === 'BATTLE_START') flush()
      if (e.type === 'ACTION_END' || e.type === 'BATTLE_END') { block.push(e); flush(); continue }
      if (e.type === 'NOTE' && !block.length) continue
      block.push(e)
    }
    flush()
    return out.join('\n')
  }

  // ---------- §30 DEBUG TRACE

  /** Full technical trace: why it happened (§30, §42). */
  debugTrace(): string {
    const out: string[] = []
    for (const e of this.events) {
      out.push(THIN)
      out.push(`${this.prefix(e)} ${e.type}`)
      out.push(THIN)
      if (e.source) out.push(`actor=${e.source}`)
      if (e.target) out.push(`target=${e.target}`)
      if (e.attackType) out.push(`type=${e.attackType}`)
      if (e.element) out.push(`element=${e.element}`)
      for (const [k, v] of Object.entries(e.payload)) out.push(`${k}=${flat(v)}`)
      if (e.raw) out.push(`log=${e.raw}`)
      out.push('')
    }
    return out.join('\n')
  }

  // ---------- §11 DAMAGE BREAKDOWN

  /** Damage breakdown (§11): the multiplier chain, opened by its own level, never in the combat log. */
  damageBreakdown(): string {
    const out: string[] = []
    for (const d of this.damage) {
      out.push(THIN, `DMG ${d.who} -> ${d.foe} (${d.type}/${d.elem})`, THIN)
      out.push('Base:', `  ATK = ${num(Math.round(d.stat))}`, `  Multiplier = ${d.mult.toFixed(3)}`,
        `  Raw = ${num(Math.round(d.stat * d.mult + d.flat))}`)
      out.push('Crit:', `  Crit Rate = ${(d.critRate * 100).toFixed(1)}%`,
        `  Result = ${d.crit ? 'CRIT' : 'no crit'}`, `  Crit DMG = ${(1 + d.critDmg + d.critBonus).toFixed(3)}`)
      out.push('Modifiers:',
        `  DMG Boost   = ${(1 + d.boost).toFixed(3)}${d.noBoost ? '  (boost skipped: noDmgBoost)' : ''}`,
        `  Weaken      = ${(1 - d.weaken).toFixed(3)}`,
        `  DEF Pen     = ${(d.defPen * 100).toFixed(1)}%`,
        `  RES         = base ${(d.res * 100).toFixed(0)}% pen ${(d.resPen * 100).toFixed(0)}% -> ${(1 - Math.min(0.9, Math.max(-1, d.res - d.resPen))).toFixed(3)}`,
        `  Vulnerability= ${(1 + d.vuln).toFixed(3)}`,
        `  Mitigation  = ${(1 - d.mit).toFixed(3)}`,
        `  Broken      = ${d.broken ? 1 : 0.9}`)
      out.push(`Final: ${num(d.dmg)}`, '')
    }
    return out.join('\n')
  }

  // ---------- §34/§35/§36/§37

  /** §34 combat summary. */
  summary(): string {
    const sim = this.sim
    const dur = sim.avElapsed
    const byOwner = [...sim.ownerDamage].map(([id, total]) => ({ name:this.ownerName(id), total }))
      .sort((a, b) => b.total - a.total)
    const byType = new Map<string, number>()
    for (const axis of sim.ownerAxis.values()) for (const [k, v] of axis) byType.set(k, (byType.get(k) ?? 0) + v)
    const total = byOwner.reduce((a, o) => a + o.total, 0)
    const out = [BAR, 'BATTLE SUMMARY', BAR, '',
      'Result:', `  ${(sim.endReason ?? 'running').toUpperCase()}`, '',
      'Duration:', `  ${dur.toFixed(2)} AV`, '',
      'Actions:', `  ${this.actNo}`, '', 'Turns:', `  ${this.turnNo}`, '',
      'Total Damage:', `  ${num(Math.round(total))}`, '',
      'DPS:', `  ${total > 0 ? num(Math.round(total / Math.max(dur, 0.01))) : '0'}`, '',
      THIN, '', 'Damage by Owner', '']
    for (const o of byOwner) out.push(`${o.name.padEnd(16)}${num(Math.round(o.total)).padStart(10)}   ${pct(o.total, total)}`)
    out.push('', THIN, '', 'Damage by Type', '')
    for (const [k, v] of [...byType].sort((a, b) => b[1] - a[1])) out.push(`${k.padEnd(16)}${num(Math.round(v)).padStart(10)}`)
    out.push('', THIN, '',
      `Breaks:          ${this.counts.WEAKNESS_BREAK ?? 0}`,
      `Deaths:          ${this.counts.DEATH ?? 0}`, '',
      'Skill Points:', `  Started: ${this.spStart}`, `  Spent: ${this.spSpent}`,
      `  Generated: ${this.spGained}`, `  Final: ${sim.sp()}`, '', BAR)
    return out.join('\n')
  }

  /** §35 audit summary — invariant checks (extracted to battle/Invariants.ts, L88). */
  auditSummary(golden?: { passed: number; total: number }): string {
    return auditSummary(this.sim.units(), this.events, golden)
  }

  /** Invariant violations — delegates to battle/Invariants.ts (§35/§36 feed). */
  verify(): string[] {
    return verifyInvariants(this.sim.units(), this.events, { sp: this.sim.sp(), maxSp: this.sim.maxSp })
  }

  /** §36 error log: seed, time, action, event, character, previous event, state — enough to replay. */
  errorLog(): string {
    const bad = this.verify()
    if (!bad.length) return ''
    const out: string[] = ['╔' + BAR + '╗', '║ SIMULATION ERROR'.padEnd((BAR.length+1)) + '║', '╚' + BAR + '╝', '',
      'Seed:', `  ${this.sim.cfg.seed}`, '', 'Time:', `  ${this.sim.avElapsed.toFixed(3)}`, '',
      'Action:', `  ACT ${this.actNo}`, '', 'Event:', `  EVT ${this.eventId}`, '',
      'State hash:', `  SHA256 ${this.hash()}`, '', 'Failures:', ...bad.map(b => '  ' + b), '']
    this.errors.push(...bad)
    return out.join('\n')
  }

  /** §37 replay file: version + seed + config + failure point. */
  replay(): string {
    const sim = this.sim
    return JSON.stringify({
      version: 'engine-0.42.1',
      seed: sim.cfg.seed,
      config: {
        cycles: sim.cfg.cycles,
        techniques: sim.cfg.techniques ?? [],
        team: sim.units().filter(u => u.side !== 'enemy')
          .map(u => ({ id: u.kitId ?? u.id, name: u.name, side: u.side, kind: u.kind, elem: u.elem })),
        enemies: sim.units().filter(u => u.side === 'enemy')
          .map(u => ({ name: u.name, level: u.base.level, hp: u.maxHp, spd: u.base.spd, toughness: u.maxToughness, weaknesses: u.weaknesses, wave: u.wave ?? 1 })),
      },
      failAt: { event: this.eventId, action: this.actNo, av: Math.round(sim.avElapsed * 1000) / 1000 },
      stateHash: this.hash(),
    }, null, 2)
  }

  // ---------- §39 JSONL / §40 file tree

  /** §39 one event per line. */
  jsonl(): string {
    return this.events.map(e => JSON.stringify({
      id: e.eventId, time: e.time, turn: e.turn, actionId: e.actionId, type: e.type,
      source: e.source, target: e.target, attackType: e.attackType, element: e.element,
      ...e.payload, ...(e.raw !== undefined ? { log: e.raw } : {}),
    })).join('\n')
  }

  damageJsonl(): string { return this.damage.map(d => JSON.stringify(d)).join('\n') }
  statesJsonl(): string {
    return this.events.filter(e => e.type === 'STATE_SNAPSHOT')
      .map(e => JSON.stringify({ id: e.eventId, ...(e.payload as Record<string, unknown>) })).join('\n')
  }
  summaryJson(): string {
    return JSON.stringify({
      seed: this.sim.cfg.seed, cycles: this.sim.cfg.cycles, result: this.sim.endReason ?? 'running',
      avElapsed: this.sim.avElapsed, actions: this.actNo, turns: this.turnNo,
      totalDamage: Math.round([...this.sim.ownerDamage.values()].reduce((a, b) => a + b, 0)),
      counts: this.counts,
      ownerDamage: Object.fromEntries([...this.sim.ownerDamage].map(([id, v]) => [this.ownerName(id), Math.round(v)])),
      ownerAxis: Object.fromEntries([...this.sim.ownerAxis].map(([id, m]) => [this.ownerName(id), Object.fromEntries(m)])),
      stateHash: this.hash(), failures: this.verify(),
    }, null, 2)
  }

  /** §40 file tree. Debug levels are chosen by the caller, so a sweep writes summaries only. */
  flush(): string[] {
    const written: string[] = []
    const dir = this.cfg.dir
    if (!dir) return written
    const sink = this.sinkFn()
    const put = (name: string, body: string): void => { sink(`${dir}/${name}`, body); written.push(`${dir}/${name}`) }
    put('config.json', this.replay())
    if (this.debug >= 2) put('combat.log', this.combatLog())
    if (this.debug >= 3) put('debug.jsonl', this.jsonl())
    if (this.debug >= 4) put('damage.jsonl', this.damageJsonl())
    if (this.debug >= 6) put('states.jsonl', this.statesJsonl())
    if (this.debug >= 7) put('rng.json', JSON.stringify({ seed: this.sim.cfg.seed, rolls: this.rolls.length, sequence: this.rolls }))
    put('summary.json', this.summaryJson())
    put('errors.json', JSON.stringify({ seed: this.sim.cfg.seed, failures: this.verify(), log: this.errorLog() }, null, 2))
    return written
  }

  /** release the shared damage-trace sink so another consumer can take it. */
  dispose(): void {
    if (this.ownTrace) { this.detachTrace(); this.ownTrace = false }
  }

  /** the configured writer, the injected one, or a CJS `require` as a fallback. */
  private sinkFn(): (path: string, body: string) => void {
    const req = (globalThis as { require?: (m: string) => { writeFileSync(p: string, b: string): void } }).require
    const w = this.cfg.write ?? (req ? (p: string, b: string) => req('node:fs').writeFileSync(p, b) : undefined)
    if (!w) throw new Error('flush(): no filesystem sink — pass LogConfig.write (tsx/ESM) or set LogConfig.dir only under CJS')
    return w
  }
}

// ---------------------------------------------------------------- helpers

const pct = (part: number, all: number): string => (all > 0 ? ((part / all) * 100).toFixed(1) + '%' : '0.0%')

function flat(v: unknown): string {
  if (v === null || typeof v !== 'object') return String(v)
  return stableJson(v)
}

/** one readable line for the combat view's non-damage events. */
function describe(e: BattleEvent): string {
  const p = e.payload
  const who = e.source ?? ''
  switch (e.type) {
    case 'ABILITY_USED': return `${who} used ${String(p.action ?? '')}`
    case 'TECHNIQUE_APPLIED': return `${who} Technique: ${String(p.technique ?? '')}`
    case 'TOUGHNESS_DAMAGE': return `${e.target ?? ''} Toughness -${num(Number(p.damage ?? 0))} (${p.before} -> ${p.after})`
    case 'WEAKNESS_BREAK': return `${e.target ?? ''} is Weakness Broken`
    case 'TOUGHNESS_BAR_DEPLETED': return `${e.target ?? ''} layer ${String(p.bar ?? '')}/${String(p.bars ?? '')} depleted (+${num(Number(p.breakDamage ?? 0))} Break DMG)`
    case 'BREAK_DAMAGE': return `${e.target ?? ''} took ${num(Number(p.amount ?? 0))} Break DMG`
    case 'SUPERBREAK': return `${e.target ?? ''} took ${num(Number(p.amount ?? 0))} Super Break DMG`
    case 'BUFF_APPLIED': case 'BUFF_STACKED': case 'BUFF_REFRESHED': case 'DEBUFF_APPLIED':
    case 'DEBUFF_STACKED': case 'DEBUFF_REFRESHED':
      return `${e.target ?? who} gained ${String(p.name ?? p.id ?? '')}${p.stacks ? ` x${p.stacks}` : ''}${p.turns ? ` (${p.turns}t)` : ''}`
    case 'BUFF_EXPIRED': case 'DEBUFF_EXPIRED':
      return `${e.target ?? who} lost ${String(p.name ?? p.id ?? '')}`
    case 'ENERGY_GAIN': return `${who} gained ${num(Number(p.amount ?? 0))} Energy (${p.before} -> ${p.after})`
    case 'ENERGY_LOSS': return `${who} spent ${num(Number(p.amount ?? 0))} Energy`
    case 'SP_GAIN': return `Team recovered ${Number(p.n ?? 0)} Skill Point(s) (${p.before} -> ${p.after})`
    case 'SP_LOSS': return `Team spent ${Number(p.n ?? 0)} Skill Point(s) (${p.before} -> ${p.after})`
    case 'DOT_TICK': return `${e.target ?? ''} took ${num(Number(p.amount ?? 0))} ${String(p.dot ?? 'DoT')} DMG`
    case 'DOT_APPLIED': return `${e.target ?? ''} afflicted by ${String(p.dot ?? '')}`
    case 'HEAL_APPLIED': return `${e.target ?? ''} healed ${num(Number(p.amount ?? 0))} HP`
    case 'SHIELD_APPLIED': return `${e.target ?? ''} gained ${num(Number(p.amount ?? 0))} Shield`
    case 'SHIELD_ABSORBED': return `${e.target ?? ''} absorbed ${num(Number(p.amount ?? 0))}`
    case 'DEATH': return `${e.target ?? ''} defeated`
    case 'REVIVAL': return `${e.target ?? ''} revived`
    case 'FLEE': return `${e.target ?? ''} fled the battle`
    case 'SUMMON_CREATED': return `${who} summoned ${String(p.name ?? e.target ?? '')}`
    case 'SUMMON_DESPAWNED': return `${who} despawned ${String(p.name ?? e.target ?? '')}`
    case 'ACTION_ADVANCE': return `${e.target ?? who} advanced ${pctv(Number(p.pct ?? 0))}`
    case 'ACTION_DELAY': return `${e.target ?? who} delayed ${pctv(Number(p.pct ?? 0))}`
    case 'EXTRA_TURN': return `${who} gains an Extra Turn`
    case 'TARGET_SELECTED': return `${who} targeted ${e.target ?? ''}`
    case 'HP_INTERCEPT': return `${e.target ?? ''} lost ${num(Number(p.amount ?? 0))} HP to ${String(p.by ?? 'interceptor')}`
    case 'HP_REDIRECT': return `${e.source ? e.source + ' ' : ''}redirected ${num(Number(p.amount ?? 0))} → ${String(p.to ?? e.target ?? '')}`
    case 'STAT_CHANGED': return `${who} ${String(p.stat ?? '')} ${p.before} -> ${p.after}`
    case 'NOTE': return e.raw ?? ''
    default: return `${SECTION[e.type] ?? e.type}: ${who}${e.target ? ' -> ' + e.target : ''}`
  }
}

const pctv = (p: number): string => `${(p * 100).toFixed(0)}%`
