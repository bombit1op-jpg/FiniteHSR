import type { AbilityType, BaseStats, DmgType, Elem, GearConfig, Unit } from './entities/Unit'
import type { Buff, DoT } from './effects/Buff'
import { eff, effectResOf, isDebuff, debuffResMult, type DebuffCategory } from './combat/StatResolver'
import { isElation, type CBStack } from './elation'
import { applyOverride, type TargetOverride } from './combat/TargetOverride'
import { type Action, type HitOpts, type KitDef, type KitRuntime, type LossKind, type SimApi } from './kit'
import { baseAv as timelineBaseAv, advance as timelineAdvance, delay as timelineDelay, rescaleAv as timelineRescaleAv } from './timeline/Timeline'
import { ActionQueue } from './timeline/ActionQueue'
import { TurnManager } from './battle/TurnManager'
import { BattleState } from './battle/BattleState'
import { BattleEngine } from './battle/BattleEngine'
import { DamagePipeline } from './combat/DamagePipeline'
import { EventBus } from './battle/EventBus'
import { TriggerQueue } from './battle/TriggerQueue'
import { Lifecycle } from './battle/Lifecycle'
import { BuffSystem } from './effects/BuffSystem'
import { DotSystem } from './effects/DotSystem'
import { BreakResolver } from './combat/BreakResolver'
import type { ToughnessBarSpec } from './combat/ToughnessBars'
import { HealingPipeline } from './combat/HealingPipeline'
import { ResourceSystem } from './combat/ResourceSystem'
import { applyHpChange, type HpChangeKind, type HpChangeOpts } from './combat/HpChange'
import { enemyDelayImmune } from './enemy/defense'
import { DEFAULT_AVAILABILITY, type AvailabilityState } from './combat/Availability'
import { makeCountdown, type CountdownSpec } from './combat/Scheduled'
import { aggregateGear, type GearAggregate } from './gear'
import type { BattleIO, BattleView } from './battle'
import { BattleLogger, type EventType, type LogConfig } from './battlelog'
import type { RulesSnapshot } from './battle/BattleRules'
import { EMPTY_PRECOMBAT, type PreCombatPlan } from './battle/PreCombat'

export interface SimConfig {
  cycles: number
  seed: number
  /** kitIds whose pre-fight Technique is activated at battle start. Order = activation order;
   *  a repeated kitId is an additional use (subject to the Technique's maxUses, default 1). */
  techniques?: string[]
  /** full battle log: level, filters and sink paths (§31-§42). Unset or level 0 = off. */
  log?: LogConfig
}

export interface DamageAccount { total: number; bySkill: Record<string, number> }

/** one recorded buff application; used by debug-kits checks to verify transient buffs */
export interface BuffLogEntry {
  unitName: string
  av: number
  id: string
  name: string
  turns?: number
  maxStacks?: number
  stacks?: number
  shield?: number
  mods?: { stat: string; value: number }[]
}

export class Simulator implements SimApi {
  roster: Unit[] = []
  kits = new Map<string, KitDef>()
  runtimes = new Map<string, KitRuntime>()
  /** battle state — av/wave/cycle, attack identity, actor/target, damage accounting (L87);
   *  all fields below are exposed through thin get/set accessors (see "BattleState accessors") */
  readonly state = new BattleState()
  /** current attack sequence number (for once-per-attack gates) */
  attackNo(): number { return this.state.attackSeq }
  /** current activation identity — stable across a mid-chain dmg-type switch, unlike attackNo() */
  attackAct(): string { return this.atkAct }
  /** Close the current attack so the next hit opens a new sequence (and activation id). The attack key is
   *  attacker|type|avElapsed, so two ACTIVATIONS of the same type inside one turn share one seq; for kits that
   *  re-activate an ability mid-turn this is the boundary. Netherwing pressing "Breath Scorches the Shadow" is the
   *  case in point: 1140702 lets it re-launch the ability, i.e. one attack per press. Multi-HIT attacks (one
   *  activation hitting several targets) must NOT call this.
   *  per-activation attack ids are opt-in per kit; other in-turn re-activations still share a seq. */
  newAttack(): void { this.state.atkKey = '' }
  /** Open a fresh attack identity for an attack that never enters the damage pipeline — the built-in
   *  enemy attack (`TurnManager.enemyHit`) fires ally-hit reactions but bypasses `hit`, so it must mint
   *  its own sequence here. Once-per-attack gates (`attackNo()`: Mortenax A1, Jingliu talent tally) then
   *  dedup within one enemy action instead of leaking a stale sequence across the whole battle. The
   *  logger's human attack grouping is untouched — an enemy default attack emits no HIT/DAMAGE events. */
  mintEnemyAttack(e: Unit): void {
    this.state.attackSeq++
    this.state.atkKey = `${e.id}|enemy|${this.avElapsed}`
    this.state.atkAct = `${e.id}|${this.avElapsed}`
  }
  /** pressed ability currently being performed by `id`, or undefined off-turn (DamagePipeline
   *  falls back to deriving it from the hit's damage type). */
  pressedAbility(id: string): AbilityType | undefined { return this.pressedAbilityByUnit.get(id) }
  /** Run a kit ability with its pressed-ability context set, so the damage pipeline can tag every
   *  hit it produces (even one retyped away from the ability). Save/restore so a nested perform of
   *  the same unit keeps the outer context. Always route engine ability execution through here. */
  performAbility(kit: KitDef, u: Unit, action: Action, ctx: KitRuntime): void {
    // §P4: an Assist Skill consumes the actor's turn but is resolved by the provider kit (Himeko •
    // Nova). The engine tagged the ability as a Skill (canon "considered as using her Skill").
    if (action.kind === 'assist') {
      const prevA = this.pressedAbilityByUnit.get(u.id)
      this.pressedAbilityByUnit.set(u.id, 'skill')
      try { this.events.runAssist(u) }
      finally {
        if (prevA === undefined) this.pressedAbilityByUnit.delete(u.id)
        else this.pressedAbilityByUnit.set(u.id, prevA)
      }
      return
    }
    // §P5: a kit may intercept and re-issue this action (Cerydra Coup de Main). The hijack resolves
    // the original itself through `releaseAsExtraTurn`, so the normal perform must not also run.
    if (this.events.resolveBeforeAction(u, action)) return
    const prev = this.pressedAbilityByUnit.get(u.id)
    this.pressedAbilityByUnit.set(u.id, action.kind === 'enhance' ? 'basic' : action.kind)
    try { kit.perform(this, u, action, ctx) }
    finally {
      if (prev === undefined) this.pressedAbilityByUnit.delete(u.id)
      else this.pressedAbilityByUnit.set(u.id, prev)
    }
  }
cfg: SimConfig
  /** §59 RulesSnapshot (frozen config digest) attached pre-battle by setupSim — replay identity
   *  without a run; undefined only for hand-rolled sims that skip `prepareBattle`. */
  rules?: RulesSnapshot
  /** §84.6.1 resolved pre-combat Technique plan (used vs surviving activations); set in
   *  initBattle before any Technique applies, so counters read the full use set. */
  preCombat: PreCombatPlan = EMPTY_PRECOMBAT
  /** §59 engine-owned encounter storage (PF score, AS counters, wave flags…) */
  encounterFlags: Record<string, unknown> = {}
  encounterResources: Record<string, number> = {}
  /** full battle log (§2-§42 of reference/hsr_log_format.txt). Off by default: with no `cfg.log`
   *  every emit is gated by one boolean, so an unconfigured sim pays nothing. */
  readonly logger: BattleLogger
  rngf: () => number
  private uid = 0
  /** pressed-ability context per acting unit, set around `performAbility` and read by the damage
   *  pipeline to tag hits that belong to a specific ability even after a damage-type retype. */
  private pressedAbilityByUnit = new Map<string, AbilityType>()
  gearMap = new Map<string, GearAggregate>()
  /** manual decision provider, set only during startInteractive */
  io?: BattleIO

  readonly queue = new ActionQueue()
  /** §4.3 reaction queue — collects after-attack/break/ally-hit reactions and resolves them
   *  one-by-one (FIFO) instead of recursing; carries each reaction's attack identity. */
  readonly triggers = new TriggerQueue({
    read: () => ({ attackNo: this.attackNo(), attackAct: this.attackAct() }),
    write: (a) => { this.attackSeq = a.attackNo; this.atkAct = a.attackAct },
  })
  /** turn execution — who acts, what they do, how the turn unwinds (Simulator owns the state) */
  readonly turns = new TurnManager(this)
  /** battle flow — battle-start phase and the run loop (Simulator owns the state) */
  private engine = new BattleEngine(this)
  /** damage orchestration — hit sequencing, gear per-hit mods, toughness/break resolution */
  readonly dmg = new DamagePipeline(this)
  /** event dispatch — one battle fact fanned out to every kit/gear hook that listens for it */
  readonly events = new EventBus(this)
  /** unit lifecycle — damage bookkeeping, HP-loss redirect, death */
  readonly life = new Lifecycle(this)
  /** buff + debuff ownership — the single apply path and the single countdown path */
  readonly buffs = new BuffSystem(this)
  /** DoT ownership — the single apply path (DOT_APPLIED choke point) */
  readonly dots = new DotSystem(this)
  /** toughness + break state machine - break DMG resolves while the enemy is still intact */
  readonly breaks = new BreakResolver(this, this.dmg)
  /** healing — the one application path, OHB/IHB and MaxHP cap live there */
  readonly heal_ = new HealingPipeline(this)
  /** team resources — SP pool, per-turn SP counters, Energy regen (extracted from Simulator) */
  readonly res = new ResourceSystem(this)

  constructor(cfg: SimConfig) {
    this.cfg = cfg
    this.logger = new BattleLogger(this, cfg.log)
    let s = cfg.seed >>> 0
    this.rngf = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  }

  // ---------- BattleState accessors (L87) ----------
  // The fields live on `this.state`; these keep the SimApi surface and every
  // `sim.X` / `this.s.X` call site (kits, gear, engine files, debug scripts) unchanged.
  get avElapsed(): number { return this.state.avElapsed }
  set avElapsed(v: number) { this.state.avElapsed = v }
  get wave(): number { return this.state.wave }
  set wave(v: number) { this.state.wave = v }
  get waveCount(): number { return this.state.waveCount }
  set waveCount(v: number) { this.state.waveCount = v }
  get attackSeq(): number { return this.state.attackSeq }
  set attackSeq(v: number) { this.state.attackSeq = v }
  get atkKey(): string { return this.state.atkKey }
  set atkKey(v: string) { this.state.atkKey = v }
  get atkAct(): string { return this.state.atkAct }
  set atkAct(v: string) { this.state.atkAct = v }
  get cycle(): number { return this.state.cycle }
  set cycle(v: number) { this.state.cycle = v }
  /** number of RNG rolls taken so far (§11/§42 determinism replay) */
  get rollCount(): number { return this.state.rollCount }
  set rollCount(v: number) { this.state.rollCount = v }
  get logLines(): string[] { return this.state.logLines }
  set logLines(v: string[]) { this.state.logLines = v }
  get accounts(): Map<string, DamageAccount> { return this.state.accounts }
  set accounts(v: Map<string, DamageAccount>) { this.state.accounts = v }
  get ownerDamage(): Map<string, number> { return this.state.ownerDamage }
  set ownerDamage(v: Map<string, number>) { this.state.ownerDamage = v }
  get ownerSkill(): Map<string, Map<string, number>> { return this.state.ownerSkill }
  set ownerSkill(v: Map<string, Map<string, number>>) { this.state.ownerSkill = v }
  get ownerAxis(): Map<string, Map<string, number>> { return this.state.ownerAxis }
  set ownerAxis(v: Map<string, Map<string, number>>) { this.state.ownerAxis = v }
  get ownerElem(): Map<string, Map<string, number>> { return this.state.ownerElem }
  set ownerElem(v: Map<string, Map<string, number>>) { this.state.ownerElem = v }
  get endReason(): string | undefined { return this.state.endReason }
  set endReason(v: string | undefined) { this.state.endReason = v }
  get lastHitTarget(): Unit | undefined { return this.state.lastHitTarget }
  set lastHitTarget(v: Unit | undefined) { this.state.lastHitTarget = v }
  get lastUltOutOfTurn(): boolean { return this.state.lastUltOutOfTurn }
  set lastUltOutOfTurn(v: boolean) { this.state.lastUltOutOfTurn = v }
  get pendingImmediate(): Set<string> { return this.state.pendingImmediate }
  set pendingImmediate(v: Set<string>) { this.state.pendingImmediate = v }
  get inBattleStart(): boolean { return this.state.inBattleStart }
  set inBattleStart(v: boolean) { this.state.inBattleStart = v }
  get punchline(): number { return this.state.punchline }
  set punchline(v: number) { this.state.punchline = v }
  private get _punchlinePeak(): number { return this.state._punchlinePeak }
  private set _punchlinePeak(v: number) { this.state._punchlinePeak = v }
  get currentActor(): Unit | undefined { return this.state.currentActor }
  set currentActor(v: Unit | undefined) { this.state.currentActor = v }
  get toughRed(): number { return this.state.toughRed }
  set toughRed(v: number) { this.state.toughRed = v }
  get attackToughRed(): number { return this.state.attackToughRed }
  set attackToughRed(v: number) { this.state.attackToughRed = v }
  get toughKey(): string { return this.state.toughKey }
  set toughKey(v: string) { this.state.toughKey = v }
  get lastAbilityTarget(): Unit | 'team' | undefined { return this.state.lastAbilityTarget }
  set lastAbilityTarget(v: Unit | 'team' | undefined) { this.state.lastAbilityTarget = v }
  get buffLog(): BuffLogEntry[] { return this.state.buffLog }
  set buffLog(v: BuffLogEntry[]) { this.state.buffLog = v }
  /** global monotonic turn counter (increments for every unit's turn, incl. enemies) — cone once-per-turn gates (Time Waits) */
  get battleTurn(): number { return this.state.battleTurn }
  set battleTurn(v: number) { this.state.battleTurn = v }
  get turnCount(): Map<string, number> { return this.state.turnCount }
  set turnCount(v: Map<string, number>) { this.state.turnCount = v }
  /** forced-target / Taunt marks keyed by attacker id (see combat/TargetOverride) */
  get targetOverrides(): Map<string, TargetOverride> { return this.state.targetOverrides }
  set targetOverrides(v: Map<string, TargetOverride>) { this.state.targetOverrides = v }

  // ---------- SimApi ----------
  units(): Unit[] { return this.roster }
  allies(side: 'ally' | 'enemy' | 'neutral'): Unit[] { return this.roster.filter(u => u.side === side && !u.dead) }
  livingEnemiesOf(u: Unit): Unit[] { return this.allies(u.side === 'ally' ? 'enemy' : 'ally') }
  /** raw LCG output, in draw order — the 32-bit stream a seed reproduces exactly */
  rng(): number {
    const r = this.rngf()
    this.rollCount++
    // only the full RNG trace pays for the array append; below debug 7 the counter is enough
    if (this.logger.traceRng) this.logger.recordRng(r, this.rollCount)
    return r
  }
  /** §28 RNG helpers. Flat names, not `rng.int()` — our API is flat like `rng()` itself. Both
   *  consume exactly ONE roll, so call sites stay stream-compatible with the raw `rng()`.
   *  Semantics are deliberately identical to the `Math.floor(rng() * n)` they replace, empty
   *  array included (`arr[0]` -> undefined): a guard here would silently mask a real bug. */
  rngInt(n: number): number { return Math.floor(this.rng() * n) }
  rngPick<T>(arr: readonly T[]): T { return arr[Math.floor(this.rng() * arr.length)] }
  /** legacy line list — byte-compatible, consumed by debug-kits assertions and the UI.
   *  `evt` is the optional structured payload (§5): it feeds the combat/debug/JSONL views only.
   *  Without it the line still becomes a NOTE event (§13), so free text survives into the
   *  combat/debug/JSONL views instead of living only in `logLines`. */
  log(msg: string, evt?: { type: EventType; source?: string; target?: string; sourceId?: string; targetId?: string; ownerId?: string; payload?: Record<string, unknown> }): void {
    this.logLines.push(`[${this.avElapsed.toFixed(1)}] ${msg}`)
    this.logger.emit(evt
      ? { type: evt.type, source: evt.source, target: evt.target, sourceId: evt.sourceId, targetId: evt.targetId, ownerId: evt.ownerId, payload: evt.payload, raw: msg }
      : { type: 'NOTE', payload: {}, raw: msg })
  }
  baseAv(u: Unit): number { return timelineBaseAv(u) }
  find(id: string): Unit | undefined { return this.roster.find(x => x.id === id && !x.dead) }
  activeTechniques(): readonly string[] { return this.cfg.techniques ?? [] }
  sp(): number { return this.res.sp() }
  maxSp = 5
  /** gain shared Punchline (team resource) */
  gainPunchline(n: number): void { this.punchline += n; if (this.punchline > this._punchlinePeak) this._punchlinePeak = this.punchline }
  /** current shared Punchline pool */
  punchlinePool(): number { return this.punchline }
  /** highest the shared pool reached this battle */
  punchlinePeak(): number { return this._punchlinePeak }

  /** the Aha battle-event unit (added when the team has an Elation char, or setup.aha) */
  aha?: Unit

  /** Certified Banger total = sum of the character's cached-Punchline states */
  cbOf(u: Unit): number {
    const arr = this.rt(u).cbStacks as CBStack[] | undefined
    if (!arr) return 0
    return arr.reduce((a, s) => a + s.pts, 0)
  }
  /** grant one Certified Banger state (2 turns by default, tracked independently; summed with others) */
  addCb(u: Unit, pts: number, turns = 2): void {
    if (pts <= 0) return
    const arr = (this.rt(u).cbStacks as CBStack[] | undefined) ?? []
    arr.push({ pts, turns })
    this.rt(u).cbStacks = arr
    this.log(`${u.name} gains Certified Banger (${pts} pts, ${turns} turns) — total ${this.cbOf(u)}`)
    if (u.side === 'ally' && u.kind === 'char') {
      for (const [kid, kit] of this.kits) {
        kit.onCbGain?.(this, u, pts, this.runtimes.get(kid) ?? {})
      }
    }
  }
  gainSp(n: number): void { this.res.gain(n) }
  spendSp(n: number): boolean { return this.res.spend(n) }

  // see Lifecycle: account/interceptLoss/revive/kill are delegates kept for the SimApi; buff and DoT apply/expire delegate to BuffSystem/DotSystem
  // surface all 93 kits code against.
  account(who: Unit | string, skill: string, dmg: number, bucket?: string, elem?: string): void { this.life.account(who, skill, dmg, bucket, elem) }

  /** Summoner of a summon/timer: runtime `ownerId` is set by every kit before `registerUnit`
   *  (verified across all 17 call sites), so no extra parameter is needed at the call sites. */
  private summonerName(u: Unit): string | undefined {
    const oid = this.runtimes.get(u.id)?.ownerId
    return oid ? this.roster.find(x => x.id === oid)?.name : undefined
  }
  registerUnit(u: Unit): void {
    // §27 id-based identity: one id = one roster entry. A re-spawn of an already-present id
    // (kit re-summon without a prior despawn, or after a natural death that kits forgot to
    // clean up) retires the old instance first — SUMMON_DESPAWNED then SUMMON_CREATED, and the
    // old corpse never shadows the new unit in `find(id)` (first non-dead wins today).
    const prev = this.roster.findIndex(x => x.id === u.id)
    if (prev >= 0) this.unregisterUnit(u.id)
    this.roster.push(u); u.av = this.baseAv(u)
    if (u.kind !== 'char') {
      const oid = this.runtimes.get(u.id)?.ownerId as string | undefined
      this.logger.emit({ type: 'SUMMON_CREATED', source: this.summonerName(u) ?? u.name, target: u.name, sourceId: oid, targetId: u.id, ownerId: oid, payload: { kind: u.kind, side: u.side, spd: Math.round(u.base.spd * 10) / 10, hp: u.hp, maxHp: u.maxHp, av: u.av, element: u.elem } })
    }
  }
  unregisterUnit(id: string): void {
    const u = this.roster.find(x => x.id === id)
    if (u && u.kind !== 'char') {
      const oid = this.runtimes.get(u.id)?.ownerId as string | undefined
      this.logger.emit({ type: 'SUMMON_DESPAWNED', source: this.summonerName(u) ?? u.name, target: u.name, sourceId: oid, targetId: u.id, ownerId: oid, payload: { kind: u.kind, side: u.side, hp: u.hp } })
    }
    this.roster = this.roster.filter(u => u.id !== id)
  }

  addBuff(u: Unit, b: Buff): void { this.buffs.add(u, b) }
  /** the single DoT application path (DOT_APPLIED + CONTROL_APPLIED); kits must not push into
   *  `unit.dots` directly or the events go missing. */
  applyDot(target: Unit, dot: DoTWithSource): DoTWithSource { return this.dots.apply(target, dot) }
  removeBuff(u: Unit, id: string): void { u.buffs = u.buffs.filter(b => b.id !== id) }
  hasBuff(u: Unit, id: string): boolean { return u.buffs.some(b => b.id === id) }
  /** §19 current mode + ability variants for a unit (kit-derived; default = all-normal) */
  availableAbilities(u: Unit): AvailabilityState {
    const kit = u.kitId ? this.kits.get(u.kitId) : undefined
    return kit?.availability?.(this, u, this.rt(u)) ?? DEFAULT_AVAILABILITY
  }
  /** §17 schedule a countdown entity owned by `owner` (see combat/Scheduled) */
  scheduleCountdown(owner: Unit, spec: CountdownSpec): Unit {
    const t = makeCountdown(spec)
    this.rt(t).ownerId = owner.id
    this.registerUnit(t)
    return t
  }
  /** §25 apply a forced-target (Taunt) mark on `attacker` (see combat/TargetOverride); the
   *  taunter and the forced target are the same unit (`forced`) for current kits */
  addTargetOverride(attacker: Unit, forced: Unit, turns: number): void {
    this.targetOverrides.set(attacker.id, applyOverride(turns, forced.id, forced.id))
  }
  removeTargetOverride(attacker: Unit): void {
    this.targetOverrides.delete(attacker.id)
  }

  /** remove the first debuff on u (Arlan E2, Sunday A6); emits DISPELLED + debug line.
   *  Debug identity: debuffs are Buffs tagged by isDebuff() (§12), so no separate removal queue. */
  dispel(u: Unit): boolean {
    const i = u.buffs.findIndex(isDebuff)
    if (i < 0) { this.log(`${u.name}: no debuff to dispel`); return false }
    const b = u.buffs[i]
    u.buffs.splice(i, 1)
    this.logger.emit({ type: 'DISPELLED', target: u.name, targetId: u.id, payload: { id: b.id, name: b.name, stacks: b.stacks ?? 1 } })
    this.log(`${u.name} dispelled ${b.name}`)
    return true
  }

  advance(u: Unit, pct: number): void { timelineAdvance(u, pct); this.logger.emit({ type: 'ACTION_ADVANCE', source: this.currentActor?.name ?? u.name, target: u.name, sourceId: this.currentActor?.id ?? u.id, targetId: u.id, payload: { pct, av: u.av } }) }
  delay(u: Unit, pct: number): void {
    // §58 delay-immune enemies: the delay command is a no-op (no ACTION_DELAY / AV change), one
    // NOTE so it stays observable. Data-driven: only registered `delayImmune` profiles opt in.
    if (u.side === 'enemy' && enemyDelayImmune(u)) {
      this.log(`${u.name} is immune to Action Delay (delay-immune)`)
      this.logger.emit({ type: 'NOTE', raw: `${u.name} is immune to Action Delay`, minDebug: 2 })
      return
    }
    timelineDelay(u, pct); this.logger.emit({ type: 'ACTION_DELAY', source: this.currentActor?.name ?? u.name, target: u.name, sourceId: this.currentActor?.id ?? u.id, targetId: u.id, payload: { pct, av: u.av } })
  }
  /** spdNew is the new BASE spd (buffs are untouched by this call). See core/timeline/Timeline. */
  setSpeedDynamic(u: Unit, spdNew: number): void {
    const before = u.base.spd
    timelineRescaleAv(u, spdNew)
    this.logger.emit({ type: 'STAT_CHANGED', source: u.name, sourceId: u.id, payload: { stat: 'spdBase', from: before, to: spdNew } })
  }

  gainEnergy(u: Unit, base: number): void { this.res.gainEnergy(u, base) }
  gainEnergyFlat(u: Unit, base: number): void { this.res.gainEnergyFlat(u, base) }
  loseEnergy(u: Unit, base: number): void { this.res.loseEnergy(u, base) }

  heal(u: Unit, amount: number, src?: Unit): void { this.heal_.apply(u, amount, src) }

  /** §8 typed HP mutation for kit/gear cost/drain/redirect/set/restore semantics (pure: no hook/kill) */
  hpChange(target: Unit, delta: number, kind: HpChangeKind, opts?: HpChangeOpts): number {
    return applyHpChange(target, delta, kind, opts)
  }

  effBe(u: Unit): number { return eff(u).be }
  effCritDmg(u: Unit): number { return eff(u).critDmg }
  effAtk(u: Unit): number { return eff(u).atk }
  effDef(u: Unit): number { return eff(u).def }
  /** lowest HP-ratio living ally char (pearl heal target); undefined if none living */
  lowestHpAlly(u: Unit): Unit | undefined {
    let best: Unit | undefined
    let bestR = 2
    for (const a of this.allies(u.side)) {
      if (a.dead || a.hp <= 0) continue
      const r = a.maxHp > 0 ? a.hp / a.maxHp : 2
      if (r < bestR) { bestR = r; best = a }
    }
    return best
  }

immediateTurn(t: Unit): void {
    if (t.dead || t.kind !== 'char') return
    // previously auto-mode called takeTurn(t) here — a NESTED turn inside
    // the acting kit's perform (Robin advances all allies, Bronya/Sunday advance a target), which
    // recurses. Both modes now defer the same way: av=0 wins the next timeline slot.
    if (t.av <= 0) { this.log(`>> ${t.name} already queued/an acting — no re-advance`); return }
    this.currentActor = t
    t.av = 0
    if (this.io) this.pendingImmediate.add(t.id)
    this.log(`>> ${t.name} will act immediately`, { type: 'EXTRA_TURN', target: t.name, payload: { av: t.av } })
  }

// ---------- damage ----------
// see DamagePipeline: hit/hitSplit/hitAoe/hitBlast/hitRandom/applyToughness/applyBreakDebuff/
// superBreak/applyTargetBreak are delegates kept for the SimApi surface all 93 kits code against.
  hit(attacker: Unit, target: Unit, o: HitOpts, scope?: 'single' | 'blast' | 'aoe' | 'random'): number { return this.dmg.hit(attacker, target, o, scope) }
  hitAoe(attacker: Unit, o: HitOpts): void { this.dmg.hitAoe(attacker, o) }
  hitBlast(attacker: Unit, primary: Unit, main: HitOpts, adj: HitOpts): void { this.dmg.hitBlast(attacker, primary, main, adj) }
  hitRandom(attacker: Unit, n: number, o: HitOpts, adjacentRatio?: number): void { this.dmg.hitRandom(attacker, n, o, adjacentRatio) }
  applyToughness(attacker: Unit, target: Unit, elem: Elem, toughDmg: number, wbeBonus: number, pierceRatio?: number): void { this.breaks.applyToughness(attacker, target, elem, toughDmg, wbeBonus, pierceRatio) }
  applyBreakDebuff(source: Unit, target: Unit, elem: Elem): void { this.breaks.applyBreakDebuff(source, target, elem) }

applyDebuff(source: Unit, target: Unit, baseChance: number, applyFn: () => void, name: string, kind?: DebuffCategory): void {
    if (target.dead) return
    const ehrTotal = (source.base.ehr ?? 0) + buffVal(source, 'ehr')
    const res = effectResOf(target)
    const chance = baseChance * (1 + ehrTotal) * (1 - res) * debuffResMult(target, kind)
    if (this.rngf() < Math.min(1, Math.max(0, chance))) {
      const hadDef = target.buffs.some(b => b.mods.some(m => m.stat === 'defRed'))
      applyFn()
      this.log(`в—€ ${name} lands on ${target.name}`)
      // wearer inflicted a NEW DEF-reduction -> smith Comburent re-trigger
      if (!hadDef && target.buffs.some(b => b.mods.some(m => m.stat === 'defRed')))
        this.gearMap.get(source.id)?.relicSets?.forEach(s => s.onDefRedInflict?.(this, source))
      // wearer landed any debuff -> pioneer keystone double / etc.
      if (source.side === 'ally' && source.kind === 'char') {
        const sg = this.gearMap.get(source.id)
        sg?.relicSets?.forEach(s => s.onDebuffInflict?.(this, source))
        sg?.cone?.onDebuffInflict?.(this, source, target, sg.coneSi)
      }
      // kit hook: ANY ally debuff lands -> Acheron talent (Slashed Dream +1, Crimson Knot +1)
      // battle-start debuffs are NOT ability-enclosed actions (#18) → no Acheron feed
      // enemy-inflicted debuffs (EnemyEffect 'debuff') are not "ally lands a debuff" → no feed
      if (source.side === 'ally')
        for (const u of this.roster) {
          if (this.inBattleStart || u.dead || u.side !== 'ally' || u.kind !== 'char' || !u.kitId) continue
          this.kits.get(u.kitId)?.onDebuffInflict?.(this, source, target, this.rt(u))
        }
    } else {
      this.log(`вњ• ${target.name} RESISTS ${name} (${Math.round(chance * 100)}% chance)`)
    }
  }

applyWeakness(source: Unit, target: Unit, elem: Elem): void {
  if (target.dead || target.side !== 'enemy' || target.weaknesses.includes(elem)) return
  target.weaknesses.push(elem)
  this.log(`>> ${target.name} gains ${elem} weakness (${source.name})`)
  for (const u of this.roster) {
    if (u.dead || u.side !== 'ally' || u.kind !== 'char') continue
    const g = this.gearMap.get(u.id)
    g?.cone?.onWeaknessApply?.(this, u, source, target, g.coneSi)
  }
}

/** attach equipment: aggregates stats/mods and stores hooks */
  attachGear(u: Unit, cfg: GearConfig, extraBe?: number): GearAggregate {
    const agg = aggregateGear(cfg, u.base, extraBe)
    for (const fn of agg.post) fn()
    this.gearMap.set(u.id, agg)
    return agg
  }

  gearOf(u: Unit): GearAggregate | undefined { return this.gearMap.get(u.id) }

  /**
   * Gear that applies to `u` as an ATTACKER. A buff-inheriting summon has no gear of its own,
   * and since it uses all of its wearer's buffs, the wearer's set bonuses apply to it too —
   * e.g. Valorous 4pc "after the wearer's FUA -> Ultimate DMG +36%" fires for a Numby Souldragon
   * FUA. Falls back to the owner's aggregate only for `sharesOwnerBuffs` units, so memosprites
   * (own stats, no wearer gear) are unaffected.
   */
  gearOfAttacker(u: Unit): GearAggregate | undefined {
    const own = this.gearMap.get(u.id)
    if (own) return own
    if (!u.sharesOwnerBuffs) return undefined
    return this.gearMap.get(String(this.rt(u).ownerId ?? ''))
  }


  ultCastOutOfTurn(): boolean { return this.lastUltOutOfTurn }

  // ---------- events ----------
  // dispatch lives in EventBus; these one-liners keep the SimApi surface kits/gear/probes code against
  fireGear(kind: 'onAfterSkill' | 'onAfterUlt' | 'onKill', u: Unit, extra?: Unit, outOfTurn = false): void { this.events.fireGear(kind, u, extra, outOfTurn) }
  fireAfterAttack(attacker: Unit, target: Unit, dmgType: DmgType, dmg?: number, atkToughRed?: number, abilityType?: AbilityType, memoSkill?: boolean): void { this.events.fireAfterAttack(attacker, target, dmgType, dmg, atkToughRed, abilityType, memoSkill) }
  fireElationSkill(u: Unit, identity?: string): void { this.events.fireElationSkill(u, identity) }
  fireAhaInstant(): void { this.events.fireAhaInstant() }
  fireAllyTurnStart(ally: Unit): void { this.events.fireAllyTurnStart(ally) }
  fireAllyUlt(ally: Unit): void { this.events.fireAllyUlt(ally) }
  fireBreak(breaker: Unit, victim: Unit, dmg?: number): void { this.events.fireBreak(breaker, victim, dmg) }
  fireAllyHit(src: Unit, target: Unit, dmg: number): void { this.events.fireAllyHit(src, target, dmg) }
  fireAllyHpLoss(target: Unit, amt: number): void { this.events.fireAllyHpLoss(target, amt) }
  fireMemospriteSummon(u: Unit): void { this.events.fireMemospriteSummon(u) }
  fireMemospriteTurnStart(u: Unit): void { this.events.fireMemospriteTurnStart(u) }
  fireMemospriteDisappear(u: Unit): void { this.events.fireMemospriteDisappear(u) }
  fireWaveStart(): void { this.events.fireWaveStart() }
  fireWaveEnd(): void { this.events.fireWaveEnd() }
  fireCycle(kind: 'start' | 'end', cycle: number): void { this.events.fireCycle(kind, cycle) }
  fireFrozenTurn(u: Unit): void { this.events.fireFrozenTurn(u) }
  fireAllyActionEnd(actor: Unit): void { this.events.fireAllyActionEnd(actor) }
  fireAllyMemospriteAct(summon: Unit): void { this.events.fireAllyMemospriteAct(summon) }
  fireBuffExpire(u: Unit, b: Buff): void { this.events.fireBuffExpire(u, b) }
  fireBuffApplied(u: Unit, b: Buff, src?: Unit): void { this.events.fireBuffApplied(u, b, src) }
  /** living enemies belonging to the current wave (later waves stay dead until spawned) */
  currentWaveEnemies(): Unit[] {
    return this.roster.filter(u => u.side === 'enemy' && !u.dead && (u.wave ?? 1) === this.wave)
  }

  /** immediate extra action without consuming timeline slot */
  grantExtraTurn(u: Unit): void {
    const ctx = this.rt(u)
    ctx.inExtraTurn = true
    this.currentActor = u
    u.av = 0
    this.log(`>> ${u.name} gains an Extra Turn!`, { type: 'EXTRA_TURN', target: u.name })
    const kit = this.kits.get(u.kitId!)!
    const action = kit.decide(this, u, ctx)
    this.performAbility(kit, u, action, ctx)
    // memosprites acting inline (Demiurge, Garmentmaker, Evey) never reach endTick — fire here too
    this.fireAllyMemospriteAct(u)
    ctx.inExtraTurn = false
  }

  /** §P5 re-issue an already-decided action as an Extra Turn, at the current timeline point.
   *  No further timeline action is granted (`av` untouched) and the kit-specific free-action
   *  semantics of `inExtraTurn` are deliberately NOT inherited — the re-issued action pays its own
   *  SP/energy. Callers must pass the action they intercepted. */
  releaseAsExtraTurn(u: Unit, action: Action): void {
    const ctx = this.rt(u)
    const kit = this.kits.get(u.kitId!)!
    ctx.extraRelease = true
    try { this.performAbility(kit, u, action, ctx) }
    finally { ctx.extraRelease = false }
    this.fireAllyMemospriteAct(u)
  }

  shieldMultOf(unitId: string): number {
    return this.gearMap.get(unitId)?.shieldMult ?? 0
  }

  superBreak(attacker: Unit, target: Unit, toughnessReduced: number, abilityMult: number): void { this.breaks.superBreak(attacker, target, toughnessReduced, abilityMult) }

  applyTargetBreak(attacker: Unit, target: Unit, amount: number, label: string, bucket = 'break'): number { return this.breaks.applyTargetBreak(attacker, target, amount, label, bucket) }
  /** refill a unit's toughness after Weakness Break recovery — the full intrinsic multi-layer stack,
   *  not just the current bar (a broken multi-layer enemy regenerates all layers). */
  refillToughness(u: Unit): void { this.breaks.refillToughness(u) }
  /** delegate for SimApi.registerExoBar — Exo toughness bar source registration (Fugue Cloudflame) */
  registerExoBar(owner: Unit, spec: ToughnessBarSpec): void { this.breaks.bars.register(owner, spec) }
  /** delegate for SimApi.clearExoBars — drop a source's exo bars (kit onUnitDeath cleanup) */
  clearExoBars(owner: Unit): void { this.breaks.bars.clear(owner.id) }

  kill(killer: Unit, victim: Unit, blow?: DmgType): void { this.life.kill(killer, victim, blow) }

  revive(target: Unit, hp: number, source?: Unit): void { this.life.revive(target, hp, source) }

  /** §57 countdown-entity exit (Trotter "fled"): the unit leaves the battle on its own.
   *  Deliberately NOT `kill` — no DEATH event, killer energy, onKilled/death-rattle or onKill
   *  hooks. Sets dead (all targeting/turn gates already key off it) + fled (distinguishable exit). */
  flee(u: Unit): void {
    if (u.dead) return
    u.dead = true
    u.fled = true
    this.log(`.. ${u.name} fled the battle`)
    this.logger.emit({ type: 'FLEE', target: u.name, targetId: u.id, payload: { side: u.side, kind: u.kind } })
  }

  rt(u: Unit): KitRuntime {
    let r = this.runtimes.get(u.id)
    if (!r) { r = {}; this.runtimes.set(u.id, r) }
    return r
  }

  // ---------- setup ----------
  addChar(kitId: string, name?: string, statsPatch: Partial<BaseStats> = {}, energyStartFrac = 0.5, hpFrac = 1, baseOverride?: Partial<BaseStats>): Unit {
    const kit = this.kits.get(kitId)!
    const base: BaseStats = { ...kit.base, ...baseOverride, ...statsPatch }
    const u: Unit = {
      id: `a${++this.uid}`, name: name ?? kit.name, side: 'ally', kind: 'char', elem: kit.elem,
      base, hp: Math.max(1, Math.round(base.hp * hpFrac)), maxHp: base.hp, startHp: hpFrac,
      energy: Math.floor(kit.energyMax * energyStartFrac),
      maxEnergy: kit.energyMax, av: 0, buffs: [], dots: [],
      toughness: 0, maxToughness: 0, broken: false, weaknesses: [], res: {}, kitId,
    }
    this.roster.push(u)
    return u
  }

  addEnemy(o: {
    name: string, hp: number, spd: number, level: number, toughness: number,
    weaknesses: Elem[], res?: Partial<Record<Elem, number>>, atk?: number,
    effectRes?: number, debuffRes?: number[], wave?: number, rank?: 'mob' | 'elite' | 'boss',
    toughnessBars?: number[],
    def?: number,
  }): Unit {
    const u: Unit = {
      id: `e${++this.uid}`, name: o.name, side: 'enemy', kind: 'enemy', elem: 'Physical',
      base: { level: o.level, hp: o.hp, atk: o.atk ?? 800, def: o.def ?? (200 + 10 * o.level), spd: o.spd },
      hp: o.hp, maxHp: o.hp, energy: 0, maxEnergy: 0, av: 0, buffs: [], dots: [],
      toughness: o.toughness, maxToughness: o.toughness, broken: false,
      toughnessBars: o.toughnessBars, toughBarIndex: o.toughnessBars?.length ? 0 : undefined,
      weaknesses: [...o.weaknesses], res: o.res ?? {}, effectRes: o.effectRes, debuffRes: o.debuffRes,
      // waves after the first spawn dormant (dead) and awaken on wave transition
      wave: o.wave ?? 1, dead: (o.wave ?? 1) > 1,
    }
    ;(u as EnemyExt).atkPower = o.atk ?? 800
      // difficulty tier from name when not given by the caller (foe() names 'Boss'/'Elite'/'Mob')
      u.rank = o.rank ?? (/\bboss/i.test(o.name) ? 'boss' : /elite/i.test(o.name) ? 'elite' : 'mob')
    this.roster.push(u)
    return u
  }

  /** register the Aha battle-event unit (side 'neutral', own AV timeline).
   *  Base SPD 80; with Elation teammates its SPD adds 20%/10%/5%/2.5% of the
   *  fastest→slowest Elation char's speed (ahaSync recomputes each loop pass). */
  addAha(): Unit {
    const a: Unit = {
      id: 'aha', name: 'Aha', side: 'neutral', kind: 'aha', elem: 'Quantum',
      base: { level: 80, hp: 1e9, atk: 0, def: 0, spd: 80 }, // unkillable battle event
      hp: 1e9, maxHp: 1e9, energy: 0, maxEnergy: 0, av: 0, buffs: [], dots: [],
      toughness: 0, maxToughness: 0, broken: false, weaknesses: [], res: {},
    }
    this.roster.push(a)
    this.aha = a
    // Aha's Let There Be Laughter carries a fixed +200% Elation (100% base + 200 → (1+2))
    this.addBuff(a, { id: 'aha_elation', name: 'Aha Elation +200%', mods: [{ stat: 'elation', value: 2.0 }], turns: Infinity })
    return a
  }

  // ---------- battle flow ----------
  initBattle(): void { this.triggers.clear(); this.engine.initBattle() }

  start(): void { this.engine.start() }

  /** manual step-by-step run: ult window before every unit's turn + action choice on every char turn */
  startInteractive(io: BattleIO): Promise<void> { return this.engine.startInteractive(io) }

  loop(): void { this.engine.loop() }

  /** live snapshot for the manual-mode UI */
  view(nextId?: string): BattleView {
    return {
      units: this.roster.filter(u => u.kind !== 'timer').map(u => ({
        id: u.id, name: u.name, side: u.side, kind: u.kind,
        hp: Math.round(u.hp), maxHp: u.maxHp,
        energy: Math.floor(u.energy), maxEnergy: u.maxEnergy,
        av: Math.round(u.av * 10) / 10, dead: !!u.dead, broken: u.broken,
      })),
      avElapsed: Math.round(this.avElapsed * 10) / 10,
      sp: this.sp(),
      maxSp: this.maxSp,
      nextActorId: nextId,
    }
  }

  outOfTurnUlts(alive: Unit[], next: Unit): Promise<void> { return this.turns.outOfTurnUlts(alive, next) }
  takeTurn(u: Unit): void { this.turns.takeTurn(u) }

  /** ally-damage redirectors (Castorice Mooncocoon, Mydei A1, Arlan A6): run in order vs the hit's remaining damage */
  hpLossInterceptors: Array<(u: Unit, dmg: number, kind: LossKind) => number> = []
  /** 'redirect' = the damage MOVES somewhere (Mooncocoon → Netherwing), 'intercept' (default) = it is
   *  absorbed. Only changes which event Lifecycle logs; both consume the same return value. */
  hpLossRedirectors = new WeakSet<(u: Unit, dmg: number, kind: LossKind) => number>()
  addLossInterceptor(fn: (u: Unit, dmg: number, kind: LossKind) => number, kind: 'intercept' | 'redirect' = 'intercept'): void {
    this.hpLossInterceptors.push(fn)
    if (kind === 'redirect') this.hpLossRedirectors.add(fn)
  }
  removeLossInterceptor(fn: (u: Unit, dmg: number, kind: LossKind) => number): void {
    this.hpLossInterceptors = this.hpLossInterceptors.filter(f => f !== fn)
  }
  interceptLoss(u: Unit, dmg: number, kind: LossKind = 'attack'): number { return this.life.interceptLoss(u, dmg, kind) }

  /** deal fixed True DMG that ignores DEF/RES/mitigation/vuln (Tribbie E1, Cyrene zone, Robin E1, ...).
   *  Emits a structured DAMAGE_DEALT (attackType 'true') so the instance is trace/golden-observable,
   *  not just a NOTE line. */
  trueDamage(attacker: Unit, target: Unit, amount: number): void {
    if (!target || target.dead || amount <= 0) return
    target.hp -= amount
    this.logger.beginDamage()
    this.logger.emit({
      type: 'DAMAGE_DEALT', trace: 'DMG', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id,
      attackType: 'true', element: attacker.elem,
      payload: { label: 'True DMG', amount, hpAfter: target.hp, maxHp: target.maxHp, first: true, last: true },
    })
    this.account(attacker, 'True DMG', amount, 'true', attacker.elem)
    this.log(`${attacker.name} → ${target.name}: ${Math.round(amount)} [True DMG]`)
    if (target.hp <= 0) this.kill(attacker, target)
  }

  /** shared pre-turn resolution: DoTs, Freeze skip, enemy break recovery */
  turnPrologue(u: Unit): 'go' | 'done' | 'frozen' { return this.turns.turnPrologue(u) }
  takeTurnI(u: Unit): Promise<void> { return this.turns.takeTurnI(u) }

  endTick(u: Unit): void { this.turns.endTick(u) }

  /** the one countdown path: tick every timed buff, fire onBuffExpire as each ends, return the count
   *  decremented. endTick uses it for turn-end ticks; units that never take a turn (event-driven
   *  memosprites like Little Ica, whose Continuous Effects tick per her own ability) reuse it too. */
  expireBuffs(u: Unit, by = 1): number { return this.buffs.expire(u, by) }

  charTurn(u: Unit): void { this.turns.charTurn(u) }

  /** An ALLY casts its Ultimate out of turn, right now (Cyrene 141503 "activates all teammates'
   *  Ultimate"). Gated on FULL energy, the same condition the auto-ult uses: a partially charged
   *  ally must not be pushed into a kit whose own energy check is looser than its cap (Castorice's
   *  Newbud, Robin's Concerto lock). */
  activateAllyUlt(ally: Unit): boolean { return this.turns.activateAllyUlt(ally) }

  /** kits call this when their current skill/ult targets ally/allies; fires the target's gear onAllyAbility */
  markAlliedTarget(t: Unit | 'team'): void {
    this.lastAbilityTarget = t
    const caster = this.currentActor
    if (t && t !== 'team' && caster) this.gearMap.get(t.id)?.relicSets?.forEach(s => s.onAllyAbility?.(this, t, caster))
  }

  enemyTurn(e: Unit, tc: number): void { this.turns.enemyTurn(e, tc) }

  /** recompute Aha's SPD (80 base + 20/10/5/2.5% of fastest→slowest Elation char
   *  speeds) and level (no-Elation case inherits the enemy level), rescaling AV
   *  proportionally so mid-combat SPD changes affect Aha like other units */
  ahaSync(a: Unit): void {
    const foes = this.currentWaveEnemies()
    const lvl = foes.length ? foes.reduce((m, e) => Math.max(m, e.base.level), 0) : 80
    a.base.level = lvl
    const elationChars = this.roster
      .filter(u => u.side === 'ally' && u.kind === 'char' && !u.dead && isElation(this, u))
      .sort((x, y) => eff(y).spd - eff(x).spd)
    const ratios = [0.20, 0.10, 0.05, 0.025]
    let spd = 80
    elationChars.forEach((u, i) => { if (i < ratios.length) spd += eff(u).spd * ratios[i] })
    const old = eff(a).spd
    if (old <= 0) { a.base.spd = spd; return }
    if (old === spd) return
    a.base.spd = spd
    a.av = a.av * (old / spd)
  }
}

export interface DoTWithSource extends DoT { sourceUnit?: Unit }
export interface EnemyExt { atkPower?: number }

/** Sum of one raw stat across ALL the unit's buffs, ignoring stacks (a 2-stack buff counts once,
 *  not twice). Distinct from `buffSum`, which multiplies by stacks. */
export function buffVal(u: Unit, key: string): number {
  return u.buffs.flatMap(b => b.mods)
    .filter(m => (m.stat as string) === key)
    .reduce((a, m) => a + m.value, 0)
}

/** Is this unit a MEMOSPRITE? A `kind:'summon'` unit is one unless it is flagged
 *  `sharesOwnerBuffs` — that flag marks a true SUMMON, which fights with its wearer's stats and
 *  deals its own Follow-Up Attack. Only memosprite skills get the dedicated `mem_skill` damage
 *  axis; a true summon reports its real DmgType like any other attacker. Classification is
 *  data-driven: a `memosprite` block in characters.json means memosprite, no block means summon. */
export function isMemosprite(u: Unit): boolean {
  return u.kind === 'summon' && !u.sharesOwnerBuffs
}

/** damage axis of a normal hit: Aha's Elation Skill (Let There Be Laughter) and memosprite
 *  skills are their own types, everything else uses its DmgType (basic/skill/ult/fua/add/elation). */
export function dmgBucket(attacker: Unit, type?: string): string {
  if (attacker.kind === 'aha') return 'aha'
  if (isMemosprite(attacker)) return 'mem_skill'
  return type ?? 'unknown'
}
