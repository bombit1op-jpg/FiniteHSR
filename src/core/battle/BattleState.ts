import type { Unit } from '../entities/Unit'
import type { BuffLogEntry, DamageAccount } from '../simulator'
import type { TargetOverride } from '../combat/TargetOverride'

/** Mutable battle state — one home for the primitive fields that used to sit directly on
 *  `Simulator` (TODO L87 BattleState). `Simulator` keeps thin get/set accessors for every
 *  field, so the SimApi surface kits/gear/debug code against (`sim.wave`, `sim.accounts`,
 *  `sim.currentActor`, …) is unchanged. Registries (roster/kits/runtimes/gearMap), infra
 *  (cfg/logger/rngf/uid) and hook arrays (hpLoss*) stay on `Simulator` by design. */
export class BattleState {
  avElapsed = 0
  /** current battle wave (1-indexed) and total wave count */
  wave = 1
  waveCount = 1
  /** attack grouping: increments when a NEW attack begins (distinct attacker/type/AV slot).
   *  Multi-hit attacks (split distributions) share one seq; skill→FUA chains get separate seqs. */
  attackSeq = 0
  atkKey = ''
  atkAct = ''
  /** current cycle (0-indexed; first cycle of a wave = 150 AV, then 100) */
  cycle = 0
  /** number of RNG rolls taken so far (§11/§42 determinism replay) */
  rollCount = 0
  /** legacy line list — byte-compatible, consumed by debug-kits assertions and the UI */
  logLines: string[] = []
  accounts = new Map<string, DamageAccount>()
  /** damage folded to the OWNER: key = owner unit id, value = that unit's own damage + all its summons' */
  ownerDamage = new Map<string, number>()
  /** same fold, split by damage label (kit ability name / 'dot Burn' / 'break' / …) */
  ownerSkill = new Map<string, Map<string, number>>()
  /** same fold, split by damage axis: attack type (basic/skill/ult/fua/add/mem_skill/elation)
   *  or damage source (break/superbreak/dot/true) — one map, buckets are disjoint */
  ownerAxis = new Map<string, Map<string, number>>()
  /** same fold, split by the ELEMENT of the damage (Physical/Fire/…); drives the per-source
   *  element report (§11 Attribute-разрез). Only hits that carry an element land here. */
  ownerElem = new Map<string, Map<string, number>>()
  endReason?: string
  lastHitTarget?: Unit
  lastUltOutOfTurn = false
  /** unit ids granted an immediate turn (manual mode): act first at the next zero-AV slot */
  pendingImmediate = new Set<string>()
  /** battle-start phase (initBattle): battle-start debuffs are NOT ability actions (transcript #18)
   *  — Acheron gains no Slashed Dream from them; only an action can wrap/enclose a debuff. */
  inBattleStart = false
  /** team-shared Punchline pool (Path of Elation) — scales Elation DMG */
  punchline = 0
  /** highest the shared pool reached this battle (Aha drains it back to 0) */
  _punchlinePeak = 0
  currentActor?: Unit
  /** toughness actually reduced by the current/most recent hit (Xueyi Karma reads it in onAfterAttack) */
  toughRed = 0
  /** toughness damage of the current attack incl. already-Broken targets (Dahlia Super Break conversion) */
  attackToughRed = 0
  /** toughness key of the current attack; DamagePipeline resets attackToughRed on a new attack */
  toughKey = ''
  /** ally targeted by the current action ('team' = every-ally cast); reset per ultimate */
  lastAbilityTarget?: Unit | 'team'
  /** every buff application, incl. re-applies; lets checks verify transient buffs after the battle */
  buffLog: BuffLogEntry[] = []
  battleTurn = 0
  turnCount = new Map<string, number>()
  /** forced-target / Taunt marks, keyed by the ATTACKER's unit id (see combat/TargetOverride) */
  targetOverrides = new Map<string, TargetOverride>()
}
