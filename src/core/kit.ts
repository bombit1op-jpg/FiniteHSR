import type { AbilityLevels, AbilityType, BaseStats, DmgType, Elem, Unit } from './entities/Unit'
import type { Buff, DoT } from './effects/Buff'
import type { TriggerWindow } from './battle/TriggerQueue'
import type { HpChangeKind, HpChangeOpts } from './combat/HpChange'
import type { AvailabilityState } from './combat/Availability'
import type { CountdownSpec } from './combat/Scheduled'
import type { ToughnessBarSpec } from './combat/ToughnessBars'
import type { DebuffCategory } from './combat/StatResolver'
import type { EventType } from './battlelog'
export  type { DmgType }
export type { AbilityType }
export type { TriggerWindow }
export type { HpChangeKind, HpChangeOpts }
export type { AbilityKind, AbilityVariants, AvailabilityState } from './combat/Availability'

/** Moved to engine battle Timeline — compat re-export. */
export { BASE_AV } from './timeline/Timeline'

/** default ability levels = max without eidolons */
export const DEFAULT_LEVELS: AbilityLevels = { basic: 6, skill: 10, ult: 10, talent: 10 }

export type Action = { kind: 'basic' } | { kind: 'skill'; targetId?: string } | { kind: 'ult' } | { kind: 'enhance' } | { kind: 'assist' }

/** damage category reaching an ally through a loss interceptor (Arlan A6 Repel ignores DoTs).
 *  'dot' = DoT tick, 'add' = Additional DMG (Entanglement), 'attack' = direct hit / bounce. */
export type LossKind = 'dot' | 'add' | 'attack'

/** Primitives a kit may call. Implemented by Simulator. */
export interface SimApi {
  units(): Unit[]
  allies(side: 'ally' | 'enemy' | 'neutral'): Unit[]
  livingEnemiesOf(u: Unit): Unit[]
  rng(): number
  /** §28 typed draws over `rng()`. `rngInt(n)` = `Math.floor(rng()*n)`, `rngPick(a)` = a random
   *  element. Each consumes exactly one roll, so it is a drop-in for the inline form. */
  rngInt(n: number): number
  rngPick<T>(arr: readonly T[]): T
  /** current attack sequence number — shared by all hits of one multi-hit attack; increments per new attack */
  attackNo(): number
  /** identity of the current *activation* (`attacker|avElapsed`) — unlike `attackNo()` it does
   *  NOT change when a chain switches dmg type (skill→FUA), so "once per attack" gates that must
   *  survive a mid-chain retype (Mortenax Talent) use this instead */
  attackAct(): string
  /** close the current attack so the next hit opens a new sequence — for an ability re-activated several times
   *  inside one turn (Netherwing pressing "Breath Scorches the Shadow"). One activation hitting several targets
   *  must NOT call it: those hits share the sequence on purpose */
  newAttack(): void
  /** open a fresh attack identity for an attack that bypasses the damage pipeline (the built-in enemy
   *  attack) so once-per-attack gates (`attackNo()`) dedup within one enemy action instead of leaking
   *  a stale sequence. Emits no logger attack (an enemy default attack has no HIT/DAMAGE events). */
  mintEnemyAttack(e: Unit): void
  /** legacy pretty line + optional structured event (mirrors `Simulator.log`); used by engine
   *  reactions (enemy passives) so a state change is both human- and machine-observable. */
  log(msg: string, evt?: { type: EventType; source?: string; target?: string; sourceId?: string; targetId?: string; ownerId?: string; payload?: Record<string, unknown> }): void
  baseAv(u: Unit): number
  hit(attacker: Unit, target: Unit, opts: HitOpts, scope?: 'single' | 'blast' | 'aoe' | 'random'): number
  hitAoe(attacker: Unit, opts: HitOpts): void
  hitBlast(attacker: Unit, primary: Unit, optsMain: HitOpts, optsAdjacent: HitOpts): void
  hitRandom(attacker: Unit, n: number, opts: HitOpts, adjacentRatio?: number): void
  /** current action targets ally/allies (sets gear ally-ult/target gates, fires target's gear onAllyAbility) */
  markAlliedTarget(t: Unit | 'team'): void
  /** ally (or 'team') targeted by the current action, reset per ultimate */
  lastAbilityTarget?: Unit | 'team'
  /** unit currently mid-turn (drives own-turn-only gate hooks, e.g. Death Flower HP-loss trigger) */
  currentActor?: Unit
  /** toughness actually reduced by the current/most recent hit (reset per hit, read in onAfterAttack) */
  toughRed: number
  /** toughness damage the current attack inflicts, including already-Broken targets (reset per attack) */
  attackToughRed: number
  /** absorb-amplification from the given unit's relic sets (Knight/Self-Enshrouded), 0 when none */
  shieldMultOf(unitId: string): number

  /** §19 the unit's current mode + active ability variants (see combat/Availability). Default =
   *  `DEFAULT_AVAILABILITY` (normal basic/skill/ult) for kits without an `availability` hook. */
  availableAbilities(u: Unit): AvailabilityState
  /** §17 schedule a countdown entity owned by `owner` (see combat/Scheduled): builds the timer,
   *  binds ownership, registers it on the timeline. Returns the live unit; `onCcEnd` fires on it. */
  scheduleCountdown(owner: Unit, spec: CountdownSpec): Unit
  /** §25 Taunt / forced-target (see combat/TargetOverride): forces `attacker` to pick `forced` for
   *  single-target selection for `turns` of the attacker's own turns (re-applying refreshes the
   *  window). Only affects single-target attacks; AoE stays unredirected. */
  addTargetOverride(attacker: Unit, forced: Unit, turns: number): void
  /** clear any forced-target mark on `attacker` before it expires */
  removeTargetOverride(attacker: Unit): void
  addBuff(u: Unit, b: Buff): void
  /** the single DoT application path (DOT_APPLIED + CONTROL_APPLIED). Kits MUST NOT push into
   *  `unit.dots` directly — that leaves the events unemitted and the log blind until first tick. */
  applyDot(target: Unit, dot: DoT & { sourceUnit?: Unit }): DoT & { sourceUnit?: Unit }
  removeBuff(u: Unit, id: string): void
  hasBuff(u: Unit, id: string): boolean
  /** decrement a unit's timed buffs by `by`, firing onBuffExpire for each that ends; returns the count
   *  decremented. The single expiry path — also used for units without a turn timer (Little Ica). */
  expireBuffs(u: Unit, by?: number): number
  advance(u: Unit, pct: number): void
  delay(u: Unit, pct: number): void
  setSpeedDynamic(u: Unit, spd: number): void

  gainEnergy(u: Unit, base: number): void
  /** flat energy regen — NOT multiplied by ERR (light cones / sets / wave-start / techniques) */
  gainEnergyFlat(u: Unit, base: number): void
  /** §7 energy drain: remove up to `base` Energy (clamped at 0) through the shared resource path
   *  (enemy "drain %Max Energy" abilities). Emits ENERGY_LOSS when any is removed. */
  loseEnergy(u: Unit, base: number): void
  heal(u: Unit, amount: number, src?: Unit): void
  /** §8 typed HP mutation for cost/drain/redirect/set/restore semantics: signed delta (negative =
   *  loss) with explicit bounds, returns the applied delta. Replaces raw `unit.hp -= x` in kits/gear. */
  hpChange(target: Unit, delta: number, kind: HpChangeKind, opts?: HpChangeOpts): number

  /** Weakness-break debuff application (after a real Weakness Break). */
  applyBreakDebuff(source: Unit, target: Unit, elem: Elem): void
  /** reduce toughness on a target (weakness-typed or pierced); triggers a Weakness Break at 0 */
  applyToughness(attacker: Unit, target: Unit, elem: Elem, toughDmg: number, wbeBonus: number, pierceRatio?: number): void
  superBreak(attacker: Unit, target: Unit, toughnessReduced: number, abilityMult: number): void
  /** apply a pre-computed Break-DMG-style number to an enemy (Boothill Pocket Trickshot Break) */
  applyTargetBreak(attacker: Unit, target: Unit, amount: number, label: string): number

  /** register a temporary Exo toughness bar owned by `owner` (Fugue Cloudflame): drains only on
   *  already-Broken targets, empties into a full Weakness Break. See combat/ToughnessBars. */
  registerExoBar(owner: Unit, spec: ToughnessBarSpec): void
  clearExoBars(owner: Unit): void

  /**
   * Roll a debuff to land: chance = baseChance × (1+EHR) × (1−Effect RES) × (1−Debuff RES), capped at 1.
   * `kind` opts the roll into the target's Debuff RES for that category (Bleed/Burn/Shock/WindShear/
   * Freeze/Entanglement/Imprisonment); omit it for debuffs outside those categories. applyFn runs only
   * on success.
   */
  applyDebuff(source: Unit, target: Unit, baseChance: number, applyFn: () => void, name: string, kind?: DebuffCategory): void

  /** add an elemental weakness (no-op if already present) and fire ally gear weakness-apply hooks */
  applyWeakness(source: Unit, target: Unit, elem: Elem): void

  /** damage bookkeeping (custom damage sources) */
  account(name: string, skill: string, dmg: number): void

  spendSp(n: number): boolean
  gainSp(n: number): void
  sp(): number
  /** gain shared team Punchline (Path of Elation) */
  gainPunchline(n: number): void
  /** current shared team Punchline pool */
  punchlinePool(): number
  /** highest the shared pool reached this battle (Aha drains it back to 0) */
  punchlinePeak(): number
  /** Certified Banger (cached Punchline, 2-turn states tracked independently, summed) */
  cbOf(u: Unit): number
  /** grant a Certified Banger state of `pts` Punchline, 2 turns by default (Aha Instant) */
  addCb(u: Unit, pts: number, turns?: number): void
  /** register a kill (DoT detonation, etc.); `blow` records the killing-blow attack type when known */
  kill(killer: Unit, victim: Unit, blow?: DmgType): void
  revive(target: Unit, hp: number, source?: Unit): void
  /** a live unit leaves the battle on its own (countdown entity: Trotter "fled in 1 turn").
   *  Marks it dead WITHOUT the kill path — no DEATH event, no killer energy, no onKilled/onKill
   *  hooks — and flags `fled` so the exit is distinguishable from a defeat. */
  flee(u: Unit): void

  /** effective combat values (with buffs) */
  effBe(u: Unit): number
  effCritDmg(u: Unit): number
  effAtk(u: Unit): number
  effDef(u: Unit): number
  /** lowest HP-ratio living ally char (Pearl skill heal target), or undefined if none */
  lowestHpAlly(u: Unit): Unit | undefined
  effDef(u: Unit): number
  /** lowest HP-ratio living ally char (Pearl skill heal target) */
  lowestHpAlly(u: Unit): Unit | undefined

  /** force an ally to take their action right now (Bronya skill) */
  immediateTurn(u: Unit): void

  /** kit runtime bag */
  rt(u: Unit): KitRuntime

  /** immediate extra action without consuming the timeline slot (Seele) */
  grantExtraTurn(u: Unit): void
  /** §P5 cross-kit action deferral: re-issue an ALREADY-DECIDED action at the current point of the
   *  timeline, classified as an Extra Turn (`ctx.extraRelease`) without granting a further timeline
   *  action. Distinct from `grantExtraTurn`, whose self-granted Extra Turns carry kit-specific
   *  free-action semantics (Seele Resurgence: no SP, no energy) that a re-issued action must not
   *  inherit — a deferred original still pays its own SP/energy. Cerydra Coup de Main. */
  releaseAsExtraTurn(u: Unit, action: Action): void

  /** announce an ally HP loss (kit drains, self-costs) — fires cone onAllyHpLoss hooks */
  fireAllyHpLoss(target: Unit, amt: number): void

  /** redirect part of an ally's incoming damage elsewhere; ALL registered interceptors run in order
   *  against the hit's remaining damage and return what each absorbs (Castorice Mooncocoon, Mydei A1).
   *  Each receives the damage `kind` it is consuming (dot / add / attack). */
  addLossInterceptor(fn: (u: Unit, dmg: number, kind: LossKind) => number, kind?: 'intercept' | 'redirect'): void
  removeLossInterceptor(fn: (u: Unit, dmg: number, kind: LossKind) => number): void
  /** run every loss interceptor sequentially (each sees the hit's remaining damage); total absorbed */
  interceptLoss(u: Unit, dmg: number, kind?: LossKind): number

  /** remove the first debuff on u; emits DISPELLED + log; returns true if one was removed (Arlan E2, Sunday A6) */
  dispel(u: Unit): boolean

  /** deal fixed **True DMG** that ignores DEF/RES/mitigation/vuln (Tribbie E1 etc.).
   *  Applies hp directly, logs, runs kill check; does NOT fire onAfterAttack (no recursion). */
  trueDamage(attacker: Unit, target: Unit, amount: number): void

  /** true while an Ultimate cast triggered outside any unit's turn is resolving */
  ultCastOutOfTurn(): boolean

  /** register extra timeline entity (Lightning-Lord, CC timer) */
  registerUnit(u: Unit): void
  unregisterUnit(id: string): void
  turnCount: Map<string, number>
  /** global monotonic turn counter (increments for every unit's turn incl. enemies) */
  battleTurn: number
  find(id: string): Unit | undefined
  /** kitIds whose pre-fight Technique is active this battle (`cfg.techniques`). A Technique reads
   *  it to react to how MANY teammates used one — e.g. M7H "Feast in One Go" (#122407) gains 1
   *  Charge per other teammate that used a Technique. */
  activeTechniques(): readonly string[]

  /** Fire onAfterAttack hooks across all kits; atkToughRed = attack's toughness damage incl. Broken targets */
  fireAfterAttack(attacker: Unit, target: Unit, dmgType: DmgType, dmg?: number, atkToughRed?: number, abilityType?: AbilityType, memoSkill?: boolean): void
  /** Fire the wearer's gear onElationSkill hooks (Diviner once-per-battle team Elation buff); identity = which Elation Skill (sim standard 'great_encore') */
  fireElationSkill(u: Unit, identity?: string): void
  /** Fire the cone onAhaInstant hooks for every living ally char at the start of an Aha Instant */
  fireAhaInstant(): void
  /** Fire onAllyTurnStart hooks across all kits (except the acting unit) */
  fireAllyTurnStart(ally: Unit): void
  /** Fire onAllyUlt hooks across all kits (except the caster) */
  fireAllyUlt(ally: Unit): void
  /** Fire onBreak hooks across all kits. `dmg` = Break DMG just applied (for %-of-original procs) */
  fireBreak(breaker: Unit, victim: Unit, dmg?: number): void
  /** Fire onWaveStart hooks across all kits + cone gear */
  fireWaveStart(): void
  /** Fire onWaveEnd hooks across all kits + cone gear */
  fireWaveEnd(): void
  /** Fire the owner's cone memosprite-event hooks (Shadowburn SP/energy, Reminiscence, Evernight) */
  fireMemospriteSummon(owner: Unit): void
  fireMemospriteTurnStart(owner: Unit): void
  fireMemospriteDisappear(owner: Unit): void
  /** An ally casts its Ultimate out of turn (Cyrene 141503 "activates all teammates' Ultimate").
   *  Only a READY char fires: the energy gate is the sim's own auto-ult condition, so a partially
   *  charged ally is never pushed into a kit whose own energy check is looser than its cap. */
  activateAllyUlt(ally: Unit): boolean
}

/**
 * Manual-mode target override: honor action.targetId chosen in the UI,
 * fall back to the kit's automatic selection otherwise.
 */
export function manualTarget(sim: SimApi, action: { kind?: string; targetId?: string }, fallback: Unit): Unit {
  if (action.targetId) {
    const t = sim.find(action.targetId)
    if (t && !t.dead) return t
  }
  return fallback
}

/** resolve effective ability levels given eidolon rank */
export function levelsOf(ctx: KitRuntime): AbilityLevels {
  return (ctx.levels as AbilityLevels) ?? DEFAULT_LEVELS
}

/**
 * Point a MEMOSPRITE's CRIT Rate/DMG at its Memomaster (`Memosprite.md`: a memosprite crits
 * with its owner's current CRIT). Without this a memosprite falls through `stats.ts` to the
 * 0.05/0.5 baseline and crits far below its owner.
 *
 * This only records the link — `eff()` resolves it live, so owner buffs gained or expired
 * after the summon are followed automatically, and the memosprite's own buffs add on top
 * without the subtract-the-overlap dance (which Mem never did, double-counting them).
 *
 * NOT for summons — Lightning-Lord, Numby, Souldragon and Fuyuan set `sharesOwnerBuffs`, and
 * `Simulator.hitDigit` merges the owner's whole buff list in per hit, so their CRIT (and
 * everything else) is live with no link.
 */
export function mirrorOwnerCrit(owner: Unit, summon: Unit): void {
  summon.critOwner = owner
}

function parseRotation(rot: string): Array<'basic' | 'skill' | 'ult'> {
  return rot.trim().split(/\s+/).map(t => {
    const tl = t.toLowerCase()
    if (tl.startsWith('b')) return 'basic'
    if (tl.startsWith('s')) return 'skill'
    if (tl.startsWith('u')) return 'ult'
    return 'basic'
  })
}

/** generic AI from skillPattern/skillRotation; allowUlt lets rotation emit ult (Seele/Firefly) */
export function decideByPattern(sim: SimApi, u: Unit, ctx: KitRuntime, allowUlt = false): Action {
  const pattern = (ctx.skillPattern as string) ?? 'auto'
  const rotation = (ctx.skillRotation as string) ?? ''
  const sp = sim.sp()

  if (pattern === 'rotation' && rotation) {
    const seq = parseRotation(rotation)
    const turn = ((sim.rt(u).turnIndex as number) ?? 0) % seq.length
    const want = seq[turn]
    if (want === 'skill' && sp >= 1) return { kind: 'skill' }
    if (want === 'ult' && allowUlt && u.energy >= u.maxEnergy) return { kind: 'ult' }
    return { kind: 'basic' }
  }

  if (pattern === 'skill->basic' || pattern === 'basic->skill') return { kind: sp >= 1 ? 'skill' : 'basic' }
  if (pattern === 'normal->skill->normal') {
    const ti = ((sim.rt(u).turnIndex as number) ?? 0)
    return { kind: (ti % 3 === 1 && sp >= 1) ? 'skill' : 'basic' }
  }

  return { kind: sp >= 1 ? 'skill' : 'basic' }
}

export interface HitOpts {  type: DmgType
  /** extra damage tags on a dual-typed hit (e.g. a Skill whose DMG also counts as a Follow-Up
   *  ATK, an Ultimate whose DMG counts as FUA). Type-keyed boosts/vuln/critDMG of every tag
   *  apply; `type` stays the primary tag for gates, action identity and event `attackType`. */
  also?: DmgType[]
  /** the pressed ability this hit belongs to (Basic ATK / Skill / Ult / …), overriding the
   *  engine's context/derivation. Set it on a hit whose damage type was retyped away from the
   *  ability that produced it (e.g. an Enhanced Basic dealing `fua` DMG still counts as `basic`). */
  abilityType?: AbilityType
  /** marks this hit as coming from a MEMOSPRITE SKILL (a memosprite's own Skill ability — not a
   *  basic, talent or joint attack its owner drags it into). Threaded to the gear `onAllyAttack`
   *  hook so memosprite-Skill-keyed cone passives gate on the exact ability. */
  memoSkill?: boolean
  mult?: number
  flat?: number
  scaleStat?: 'atk' | 'hp' | 'def'
  /** fixed base stat value (Elation: Base = Level Multiplier × Ability Mult, so
   *  statValue = 1 and the LM is folded into `mult` by the caller) */
  statValue?: number
  elem?: Elem            // default attacker.elem
  toughDmg?: number
  /** extra Weakness Break Efficiency for this hit (Firefly CC +50%) */
  wbeBonus?: number
  /** reduce toughness even without matching weakness at this ratio (FF Module α = 0.55) */
  pierceRatio?: number
  canCrit?: boolean
  forceCrit?: boolean
  label?: string
  /** fires when the hit lands a critical strike (Dan Heng skill Slow) */
  onCrit?: (target: Unit) => void
  /** damage distribution across the attack's visible digits (sums to 1); each digit
   *  rolls its own crit. digit i deals `mult × split[i]` (flat goes to the last digit).
   *  Toughness is applied once on the first digit; `onAfterAttack` and other
   *  once-per-attack effects fire for the whole attack. */
  split?: number[]
  /** pure-damage-formula strike: ignore ALL DMG% boosts (Time Waits for No One) */
  noDmgBoost?: boolean
  /** follow-up strike fired by another unit's attack: stays inside the triggering attack's
   *  sequence, so once-per-attack gates on the trigger (Moze Talent) still hold */
  noSeq?: boolean
  /** extra DEF-ignore on this hit (DoT detonations keep their dot's own defIgnore, e.g. Arcana) */
  defIgnore?: number
  /** allow a hit whose source is already flagged dead — the enemy on-killing-blow death-rattle
   *  (Automaton Spider "Chains of Destruction", Illumination Dragonfish "Candle Flame") resolves
   *  through the normal pipeline while its own HP is already 0. Every other hit on a dead attacker
   *  is still dropped. */
  fromDeadAttacker?: boolean
}

/** Pre-fight "Technique" (Maze): applied once at battle start, before any turn.
 *  `'buff'` techniques (self/team buffs) stack freely; `'attack'` techniques start the
 *  fight (deal damage, inflict enemy debuffs, drop a zone) — only ONE may activate per
 *  battle (canon: one combat-starting Technique / one field zone).
 *  §84.6.1 rule tags (optional; resolved generically by battle/PreCombat, no hardcoded kits):
 *   - `zone`: a field/zone effect — at most one zone survives to battle entry (last wins)
 *   - `switchSensitive`: effect lost when a later activation switches the active character
 *   - `maxUses`: how many times this Technique may be activated pre-fight (default 1) */
export interface TechniqueDef {
  name: string
  kind: 'buff' | 'attack'
  zone?: boolean
  switchSensitive?: boolean
  maxUses?: number
  apply(sim: SimApi, u: Unit, ctx: KitRuntime): void
}

/** How a kit's Ultimate becomes available — the single engine gate (all four: auto-ult,
 *  out-of-turnUlts, departedUlt, activateAllyUlt). Default (field absent) = energy >= maxEnergy.
 *  Reference `docs` (Energy.md): Argenti/Evanescia/Yunli fire at HALF Max Energy;
 *  Acheron/Castorice/Cyrene/Feixiao/Phainon/SW LV.999 do not use the Energy system at all. */
export type UltimateActivation =
  /** threshold on `u.energy`: number = absolute, 'half' = maxEnergy/2, undefined = maxEnergy */
  | { kind: 'energy'; at?: number | 'half' }
  /** custom readiness (special gauges in `rt`, conjunctions, state-dependent thresholds) */
  | { kind: 'ready'; check: (sim: SimApi, u: Unit, ctx: KitRuntime) => boolean }

export interface KitDef {
  id: string
  name: string
  elem: Elem
  energyMax: number
  base: BaseStats
  /** pre-fight Technique (optional) */
  technique?: TechniqueDef
  /** Ultimate readiness gate; absent = `energy >= maxEnergy` */
  ultActivation?: UltimateActivation
  /** How castUlt treats the cast. 'energy' (default): kit zeroes `u.energy`, engine detects the
   *  drop, logs ENERGY_LOSS and refunds +5 (sp_base). 'none': kit pays its own non-Energy gauge
   *  (SD/Newbud/Coreflame/Aureus/Recollection/MMR); no ENERGY_LOSS, no +5 refund, but
   *  onAfterUlt/onAllyUlt hooks still fire. */
  ultConsumption?: 'energy' | 'none'
  /** choose basic/skill/ult AFTER ult opportunity was handled */
  decide(sim: SimApi, u: Unit, ctx: KitRuntime): Action
  /** Mortenax Blade A0: withhold the Ult at full Energy to bank the 80 overflow Energy pool
   *  (the sim auto-casts the Ult at full Energy, so `decide` never gets the chance). */
  holdUlt?(sim: SimApi, u: Unit, ctx: KitRuntime): boolean
  /** Moze: "Moze can still use his Ultimate during his Departed state" (Talent 122304 note). A
   *  Departed char has no turns at all, so the sim resolves the full-Energy Ult off-order instead
   *  (no turnPrologue/endTick: DoT ticks and buff decay stay frozen while Departed). */
  ultWhileDeparted?: boolean
  /** §10/§19 mode-dependent ability availability (e.g. Firefly Complete Combustion, which turns
   *  Basic/Skill into their enhanced variants and suppresses the Ult). Absent = always
   *  `DEFAULT_AVAILABILITY` (normal basic/skill/ult). Derived from the kit's own runtime state. */
  availability?(sim: SimApi, u: Unit, ctx: KitRuntime): AvailabilityState
  perform(sim: SimApi, u: Unit, action: Action, ctx: KitRuntime): void
  onStart?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  onTurnStart?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  onKill?(sim: SimApi, u: Unit, victim: Unit, ctx: KitRuntime): void
  onTurnEnd?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** Firefly: Complete Combustion countdown expired */
  onCcEnd?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** §P5 cross-kit action interception. Fires for EVERY living ally kit BEFORE the acting unit's
   *  ability resolves. Return true to HIJACK the action: the actor's `perform` is then skipped and
   *  the hijacking kit resolves it itself (Cerydra Coup de Main: cast the copy, then
   *  `releaseAsExtraTurn(actor, action)` for the original). */
  onBeforeAction?(sim: SimApi, actor: Unit, action: Action, ctx: KitRuntime): boolean
  /** §P4 Assist Skill offer. Fires for EVERY living ally kit BEFORE `actor`'s turn is decided;
   *  return true if this kit offers `actor` a granted Assist Skill right now (Himeko • Nova Talent
   *  151004). The engine then replaces the actor's chosen ability with an `{kind:'assist'}` action,
   *  which consumes the actor's turn and dispatches to this kit's `runAssist`. `provider` = the
   *  offering kit's own unit (Nova), `actor` = the ally about to use it. */
  assistReady?(sim: SimApi, provider: Unit, actor: Unit, ctx: KitRuntime): boolean
  /** §P4 resolve `actor`'s Assist Skill. Called on the provider kit once the engine has routed an
   *  `{kind:'assist'}` action to it. `actor` = the ally spending its turn; the attack itself is
   *  attributed to `provider` (Nova) and is typed as a Skill. */
  runAssist?(sim: SimApi, provider: Unit, actor: Unit, ctx: KitRuntime): void
  /** After any unit deals damage (fires for ALL kits, not just attacker's) */
  onAfterAttack?(sim: SimApi, attacker: Unit, target: Unit, dmgType: DmgType, ctx: KitRuntime, dmg?: number, atkToughRed?: number, abilityType?: AbilityType): void
  /** Resolution window for this kit's `onAfterAttack` (§13). Default `hit` = per-hit (historical
   *  order). `attack` = defer to the end of the whole attack, so the attack's own remaining hits
   *  land before an AoE after-attack proc (Yao Guang Great Boon on a Blast). */
  afterAttackWindow?: TriggerWindow
  /** When an ally's turn begins (fires for OTHER kits, not the acting unit's) */
  onAllyTurnStart?(sim: SimApi, ally: Unit, ctx: KitRuntime): void
  /** fired on EVERY unit's action end (ally or enemy) — canon <after any target takes action> (Hyacine Take Sky) */
  onAllyActionEnd?(sim: SimApi, actor: Unit, ctx: KitRuntime): void
  /** An ALLY MEMOSPRITE finished an action — both paths: its AV-timeline turn and an inline Extra
   *  Turn. Broadcast to EVERY living ally char kit; `u` is the listening char, `summon` the acting
   *  memosprite (Evernight A1 "when Evernight or an ally memosprite uses an ability", TB Remembrance
   *  E2 "when ally memosprites aside from Mem take action"). Not fired for true summons
   *  (`sharesOwnerBuffs`), and not for a memosprite the loop merely passes over. */
  onAllyMemospriteAct?(sim: SimApi, u: Unit, summon: Unit, ctx: KitRuntime): void
  /** When an ally casts Ultimate (fires for OTHER kits) */
  onAllyUlt?(sim: SimApi, ally: Unit, ctx: KitRuntime): void
  /** When an ally defeats an enemy (fires for OTHER kits, not the killer's) */
  onAllyKill?(sim: SimApi, killer: Unit, victim: Unit, ctx: KitRuntime): void
  /** When the kit's own unit is defeated (owner-death cleanup: state, summons) */
  onUnitDeath?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** When any ally character is defeated (knocked down). Fires for other allies' kits; `ally` is the defeated ally. */
  onAllyDeath?(sim: SimApi, ally: Unit, ctx: KitRuntime): void
  /** When a weakness break occurs. `dmg` = the Break DMG applied (optional; 4-arg impls stay valid) */
  onBreak?(sim: SimApi, breaker: Unit, victim: Unit, ctx: KitRuntime, dmg?: number): void
  /** When an ally character takes damage from an enemy attack (fires for ALL kits) */
  onAllyHit?(sim: SimApi, attacker: Unit, target: Unit, dmg: number, ctx: KitRuntime): void
  /** When a unit's action is skipped because it is Frozen (fires for ALL kits) */
  onFrozenTurn?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /**
   * When a DoT on an enemy deals its tick damage. Fires for EVERY living ally char kit, not just the
   * DoT source's: `attacker` is the DoT's own source (may be another kit or a breaker), `owner` is the
   * unit whose kit this is — resolve buffs/energy/ATK scaling from `owner`, gate source-specific
   * effects on `attacker`. `dmg` = damage the tick actually applied (post-interception).
   * 4/5/6-parameter implementations stay valid (extra param is ignored).
   */
  onDoTTick?(sim: SimApi, attacker: Unit, target: Unit, dot: DoT, ctx: KitRuntime, owner: Unit, dmg?: number): void
  /** The wearer lands a non-CRIT hit on a crit-eligible attack (Sleep Like the Dead crit-rate window) */
  onNonCrit?(sim: SimApi, u: Unit, target: Unit, ctx: KitRuntime): void
  /** An enemy begins its turn (the missing enemy-turn hook — Erode-style per-enemy-turn effects) */
  onEnemyTurnStart?(sim: SimApi, u: Unit, enemy: Unit, ctx: KitRuntime): void
  /** An enemy finishes its turn (fires for ALL kits after the enemy acted — Phainon Soulscorch Edict counters) */
  onEnemyTurnEnd?(sim: SimApi, u: Unit, enemy: Unit, ctx: KitRuntime): void
  /** When an ally character is healed (fires for ALL kits; Himeko A6 re-apply). `src` = healer */
  onAllyHeal?(sim: SimApi, target: Unit, amount: number, ctx: KitRuntime, src?: Unit): void
  /** When an ally character receives a Shield buff (fires for ALL kits; Phainon A2 shield half). `src` = shield provider */
  onAllyShield?(sim: SimApi, target: Unit, amount: number, ctx: KitRuntime, src?: Unit): void
  /** An ally character lost HP by ANY cause (combat damage, DoT, kit drains/costs). Fires for ALL kits
   *  after `fireAllyHpLoss`; canon 140704 (Castorice Newbud) is fed from here. */
  onAllyHpLoss?(sim: SimApi, u: Unit, target: Unit, amt: number, ctx: KitRuntime): void
  /** When one of the owner's buffs expires naturally (Fu Xuan Knowledge unwind) */
  onBuffExpire?(sim: SimApi, u: Unit, b: Buff, ctx: KitRuntime): void
  /** §6 `onApply`: a buff/debuff landed on ANY unit — fresh, re-stacked or refreshed. Fires for
   *  ALL kits right after the `BUFF_/DEBUFF_APPLIED|STACKED|REFRESHED` emit, so the effect is
   *  already on the unit when the hook reads it. `b.debuff` splits OnBuffApplied / OnDebuffApplied
   *  from the spec's list (one hook, not two). `src` = applier via `b.sourceId`, undefined when the
   *  applier is dead or unset. The mirror image of `onBuffExpire`. */
  onBuffApplied?(sim: SimApi, u: Unit, b: Buff, ctx: KitRuntime, src?: Unit): void
  /** When an owner-controlled summon (e.g. Numby) acts — replaces the built-in LL logic */
  onSummonTurn?(sim: SimApi, summon: Unit, owner: Unit, ctx: KitRuntime): void
  /** When a new battle wave starts (wave 1 fires at battle start) */
  onWaveStart?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** the current wave's enemies are all defeated (multi-wave only) */
  onWaveEnd?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** a new cycle begins (MoC: first cycle of a wave = 150 AV, then 100) */
  onCycleStart?(sim: SimApi, u: Unit, cycle: number, ctx: KitRuntime): void
  onCycleEnd?(sim: SimApi, u: Unit, cycle: number, ctx: KitRuntime): void
  /** When a debuff is successfully applied via applyDebuff (Acheron talent triggers from any debuff) */
  onDebuffInflict?(sim: SimApi, source: Unit, target: Unit, ctx: KitRuntime): void
  /** Aha Instant battle event: this character uses their Elation Skill 1 time (Sparxie Great Encore).
   *  Fired by Aha's turn for every Elation-Skill-capable unit, in roster (participant-ID) order. */
  onAhaInstant?(sim: SimApi, u: Unit, ctx: KitRuntime): void
  /** When an ally character regenerates Energy (fires for ALL kits; Remembrance TB Mem Charge) */
  onAllyEnergy?(sim: SimApi, unit: Unit, base: number, ctx: KitRuntime): void
  /** When a unit gains Certified Banger (fires for ALL kits; Evanescia CB<->Energy exchange) */
  onCbGain?(sim: SimApi, gainer: Unit, pts: number, ctx: KitRuntime): void
  /** When a unit's Certified Banger state expires (fires for ALL kits; Evanescia A6 conversion) */
  onCbEnd?(sim: SimApi, holder: Unit, pts: number, ctx: KitRuntime): void
}

/** mutable per-unit runtime bag owned by the kit */
export type KitRuntime = Record<string, unknown>
