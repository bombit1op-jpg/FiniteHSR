/**
 * Event predicate: which normalized nodes an assertion is talking about (guide §46).
 *
 * Was inline in the assertion executor; split out because matching is a separate concern from
 * deciding pass/fail, and the same predicate is what `ordering` / `noEventBetween` reuse.
 */

import type { Node } from './TraceMatcher'

/** predicate over a normalized event node */
export interface EventMatch {
  type?: string
  source?: string
  target?: string
  /** ability label as emitted by the kit (HIT_START/DAMAGE_DEALT payload.label) */
  label?: string
  /** ABILITY_USED payload.action: 'basic' | 'skill' | 'ultimate' | 'attack' | ... */
  action?: string
  element?: string
  attackType?: string
  /** extra damage tag a dual-typed hit carries (matches membership in payload.tags) */
  tags?: string
  /** regex over this node's own pretty log line (the NOTE `raw`); a structured event without a
   *  line never matches — position-sensitive checks (ordering/noEventBetween) stay node-scoped */
  log?: string
  /** exact-match filter over node payload entries (buff id, energy amount, ...) */
  payload?: Record<string, unknown>
}

export function matches(n: Node, m: EventMatch): boolean {
  if (m.type && n.type !== m.type) return false
  if (m.source && n.source !== m.source) return false
  if (m.target && n.target !== m.target) return false
  if (m.label && n.label !== m.label) return false
  if (m.action && n.payload.action !== m.action) return false
  if (m.element && n.element !== m.element) return false
  if (m.attackType && n.attackType !== m.attackType) return false
  if (m.tags && !(Array.isArray(n.payload.tags) && (n.payload.tags as unknown[]).includes(m.tags))) return false
  if (m.log && !(n.log && new RegExp(m.log).test(n.log))) return false
  if (m.payload) {
    for (const [k, want] of Object.entries(m.payload)) {
      if (n.payload[k] !== want) return false
    }
  }
  return true
}

export function firstIndex(nodes: Node[], m: EventMatch): number {
  return nodes.findIndex(n => matches(n, m))
}
