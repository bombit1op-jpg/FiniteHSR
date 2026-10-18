/** Trigger resolution windows (§13): a reaction's RESOLUTION POINT is mechanic-specific, not one
 *  global rule — mixing them (immediate per-hit execution) models the wrong battle.
 *  - `hit`    — fires per hit (default): per-hit procs / follow-ups (Serval talent, Xueyi FUA).
 *  - `attack` — fires once the WHOLE attack resolved: after-attack procs whose AoE must not
 *               pre-empt the attack's own remaining hits (Yao Guang Great Boon on a Blast).
 *  - `action` — reserved for action-scope reactions.
 *  Only reactions that OPT IN via `KitDef.afterAttackWindow` use a non-`hit` window; everything
 *  else keeps the historical per-hit order. */
export type TriggerWindow = 'hit' | 'attack' | 'action'

/** Causal attack identity a reaction was created under: the attack that CAUSED the reaction, not
 *  the (possibly newer) attack running when the deferred reaction finally resolves. */
export interface AttackIdentity {
  attackNo: number
  attackAct: string
}

/** Read/write the simulator's live attack-identity globals — the queue swaps them per trigger so a
 *  deferred reaction observes the attack it was queued under (§13). */
export interface IdentityAccess {
  read(): AttackIdentity
  write(id: AttackIdentity): void
}

/** A queued reaction plus the identity of the attack that spawned it (captured at `push`). */
interface PendingTrigger {
  window: TriggerWindow
  run: () => void
  ctx: AttackIdentity
}

/** Fallback identity for a queue with no `IdentityAccess` (unit tests): reactions see 0/''. */
const NO_IDENTITY: AttackIdentity = { attackNo: 0, attackAct: '' }

export class TriggerQueue {
  constructor(private id?: IdentityAccess) {}

  private q: PendingTrigger[] = []
  private draining = false
  /** nesting depth of the current attack; the outermost `exitAttack` resolves the `attack` window */
  private attackDepth = 0

  /** hard cap on reactions resolved in one drain — a runaway chain (A→B→C→…) fails loudly instead
   *  of hanging the battle; the message carries the count so the source loop is locatable. */
  private static readonly CHAIN_LIMIT = 1_000_000

  get pending(): number { return this.q.length }

  push(run: () => void, window: TriggerWindow = 'hit'): void {
    this.q.push({ window, run, ctx: this.id ? this.id.read() : NO_IDENTITY })
  }

  clear(): void { this.q.length = 0; this.draining = false; this.attackDepth = 0 }

  /** Enter an attack (DamagePipeline.hit/hitBlast/hitAoe). Nested attacks only bump depth; the
   *  OUTERMOST `exitAttack` resolves the `attack` window — so a Blast's main+adjacent hits land
   *  before any per-attack reaction (e.g. Great Boon) resolves. */
  enterAttack(): void { this.attackDepth++ }
  exitAttack(): void {
    if (this.attackDepth > 0) this.attackDepth--
    if (this.attackDepth === 0) this.drain('attack')
  }

  /** Resolve every queued reaction of `window` in FIFO order; reactions of other windows stay
   *  queued for their own boundary. A fire made while already draining just appends (bounded by
   *  CHAIN_LIMIT). */
  drain(window: TriggerWindow = 'hit'): void {
    if (this.draining) return
    this.draining = true
    try {
      let n = 0
      let i = 0
      while (i < this.q.length) {
        if (this.q[i].window !== window) { i++; continue }
        const p = this.q.splice(i, 1)[0]
        if (++n > TriggerQueue.CHAIN_LIMIT) {
          throw new Error(`[TriggerQueue] reaction chain exceeded ${TriggerQueue.CHAIN_LIMIT} in one drain (pending ${this.q.length}); probable infinite trigger loop`)
        }
        // scoped resolution context: expose the triggering attack's identity for the whole reaction,
        // then restore the pre-reaction identity (try/finally, so a throw can't leak the swap).
        const prev = this.id?.read()
        if (this.id) this.id.write(p.ctx)
        try {
          p.run()
        } finally {
          if (this.id && prev) this.id.write(prev)
        }
      }
    } finally {
      this.draining = false
    }
  }
}
