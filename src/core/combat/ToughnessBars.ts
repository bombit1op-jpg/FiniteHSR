import type { Elem, Unit } from '../entities/Unit'
import type { Simulator } from '../simulator'
import type { BreakResolver } from './BreakResolver'

export type ToughnessBarKind = 'intrinsic' | 'exo'
export type BreakPolicy = 'damage-only' | 'full-break'

/** one toughness bar in the unified resolver's terms. Intrinsic bars are the enemy's own multi-layer
 *  stack (the last layer is a full Weakness Break, earlier layers are damage-only breaks). Exo bars
 *  are source-bound secondary bars that cycle re-Breaks (canon: Fugue Cloudflame Luster) and ignore
 *  Weakness Type. The current intrinsic bar is mirrored in unit.toughness/maxToughness. */
export interface ToughnessBar {
  id: string
  kind: ToughnessBarKind
  current: number
  max: number
  breakPolicy: BreakPolicy
  /** exo bars ignore Weakness Type: any element drains them */
  ignoresWeakness?: boolean
}

export interface ToughnessBarSpec {
  /** bar id: identity in the SECONDARY_BAR_EMPTIED payload and the per-owner dedup key */
  id: string
  /** fraction of the target's Max Toughness the bar starts (and refills) at */
  pct: number
  /** label the re-Break DMG is booked and accounted under */
  label: string
}

/**
 * Toughness-bar state, unified: intrinsic multi-layer stacks live on the Unit
 * (toughnessBars/toughBarIndex) and are resolved inside BreakResolver.applyToughness while the
 * enemy is intact; this class holds the exo side — a "secondary toughness bar" bound to a source
 * character. Each source wears one bar per enemy, seeded lazily at the source's first drain. Exo
 * bars drain by the toughness-equivalent the hits deal regardless of Weakness Type, and only after
 * the main bar is emptied (canon: Fugue Cloudflame Luster, talent 122504 #2, 40% Max Toughness).
 * When an exo bar empties the enemy takes another full Weakness Break (shared consequence path
 * BreakResolver.fullBreak — same delay, break debuff and break hooks as the main bar) and the bar
 * refills, so re-breaks cycle while the source stays on the field.
 */
export class ToughnessBars {
  /** ownerId -> { owner, spec } */
  private sources = new Map<string, { owner: Unit; spec: ToughnessBarSpec }>()
  /** `ownerId:targetId` -> current bar value */
  private cur = new Map<string, number>()

  constructor(private s: Simulator, private breaks: BreakResolver) {}

  /** idempotent: a kit re-registers its spec on every activation, later call wins */
  register(owner: Unit, spec: ToughnessBarSpec): void {
    this.sources.set(owner.id, { owner, spec })
  }

  /** drop a source's exo bars (kit onUnitDeath cleanup — a dead Fugue leaves no Cloudflame Luster) */
  clear(ownerId: string): void {
    this.sources.delete(ownerId)
    for (const k of this.cur.keys()) if (k.startsWith(ownerId + ':')) this.cur.delete(k)
  }

  /** drain exo bars by the toughness-equivalent of a single hit on a Broken target. Weakness Type is
   *  irrelevant here; an emptied bar resolves as a full re-Break through the shared consequence path.
   *  A bar drains AT MOST ONCE per Broken state: once emptied it stays exhausted (value 0) until the
   *  target recovers (refillToughness → resetTarget), so repeated hits cannot chain re-Breaks. */
  consume(attacker: Unit, target: Unit, elem: Elem, drain: number): void {
    for (const [, { owner, spec }] of this.sources) {
      if (target.dead) return
      if (owner.dead || owner.kind !== 'char' || owner.side !== 'ally') continue
      if (!target.maxToughness) continue
      const key = owner.id + ':' + target.id
      let b = this.cur.get(key)
      if (b === undefined) b = Math.round(target.maxToughness * spec.pct)
      if (b <= 0) continue // exhausted this Broken state; the bar only comes back on recovery
      b -= drain
      if (b > 0) { this.cur.set(key, b); continue }
      this.cur.set(key, 0)
      const bdmg = this.breaks.fullBreak(attacker, target, elem, spec.label)
      this.s.log(`>> ${target.name} ${spec.id.toUpperCase()} broken — Break DMG ${bdmg}`)
      this.s.logger.emit({ type: 'SECONDARY_BAR_EMPTIED', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, element: elem, payload: { id: spec.id, breakDamage: bdmg, hpAfter: target.hp, toughness: 0 } })
    }
  }

  /** recovery / wave-respawn: each owner's exo bar on this target refills to full (lazy re-seed at the
   *  next drain, so a partially drained bar still comes back to 100% Max Toughness). */
  resetTarget(target: Unit): void {
    const suffix = ':' + target.id
    for (const k of [...this.cur.keys()]) if (k.endsWith(suffix)) this.cur.delete(k)
  }
}