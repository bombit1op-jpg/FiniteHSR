/**
 * Normalized event graph (guide: "сравнивал не текст, а нормализованный event graph").
 *
 * The old debug layer recovered durations, counts and turn boundaries by regexing the human
 * combat.log. Everything here reads structured events instead, so a renamed log phrase can no
 * longer turn a passing check red.
 *
 * The comparable shape carries payload amounts: a re-rolled damage, an extra 2 energy or a bigger
 * shield MUST diverge the trace even though the event shape is unchanged — otherwise "expected
 * 38214, actual 42191" would still match. Amounts are a 4-decimal numeric fingerprint of the
 * payload, so deterministic drift can never hide in a structurally-identical event. The pointer to
 * the full state-snapshot payload is excluded from the fingerprint (it is a whole-battle dump, not
 * one quantity; state drift is the StateMatcher's job).
 */

export interface Node {
  eventId: number
  turn: number
  actionId: number
  traceId?: string
  type: string
  source?: string
  target?: string
  label?: string
  element?: string
  attackType?: string
  payload: Record<string, unknown>
  /** pretty line, only for mechanics the engine has no event for (explicit opt-in) */
  log?: string
}

export interface RawEvent {
  eventId: number
  turn: number
  actionId: number
  traceId?: string
  type: string
  source?: string
  target?: string
  element?: string
  attackType?: string
  payload?: Record<string, unknown>
  /** legacy pretty line, carried by NOTE events (`BattleLogger.emit` `raw`). */
  raw?: string
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export function normalize(events: readonly RawEvent[]): Node[] {
  return events.map(e => {
    const p = e.payload ?? {}
    return {
      eventId: e.eventId, turn: e.turn, actionId: e.actionId, traceId: e.traceId,
      type: e.type, source: e.source, target: e.target,
      label: str(p.label), element: e.element, attackType: e.attackType,
      payload: p,
      log: e.raw,
    }
  })
}

/** numeric fingerprint of a payload. Every emitted number is deterministic per seed, so ANY drift
 *  (re-rolled damage, flipped energy grant, bigger shield) must part the traces. Finite numbers are
 *  rounded to 4 decimals to shake float noise and sorted so payload key order never matters;
 *  non-finite values stay literal so a NaN in the trace diverges loudly instead of vanishing. */
function amountOf(p: Record<string, unknown>): string {
  const nums: string[] = []
  for (const v of Object.values(p)) {
    if (typeof v !== 'number') continue
    nums.push(Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : String(v))
  }
  return nums.sort().join(',')
}

/** comparable identity of a node — what "the same event" means when diffing two traces.
 *  The amount fingerprint rides the key: identical shape with a different number is a divergence. */
export function key(n: Node): string {
  const head = [n.type, n.source ?? '-', n.target ?? '-', n.label ?? '-', n.attackType ?? '-'].join('|')
  const amount = amountOf(n.payload)
  return amount ? `${head} [${amount}]` : head
}

/** NOTE is free text and STATE_SNAPSHOT a full dump: neither belongs in a golden skeleton. */
export function skel(nodes: readonly Node[]): Node[] {
  return nodes.filter(n => n.type !== 'NOTE' && n.type !== 'STATE_SNAPSHOT')
}

export interface Divergence {
  index: number
  expected: string
  actual: string
  /** last node before the divergence that matched on both sides */
  prevMatch?: string
  nextExpected?: string
}

export function firstDivergence(expectedKeys: readonly string[], actual: readonly Node[]): Divergence | undefined {
  const act = skel(actual).map(key)
  let last = ''
  for (let i = 0; i < Math.max(expectedKeys.length, act.length); i++) {
    const ek = expectedKeys[i] ?? '(none)', ak = act[i] ?? '(none)'
    if (ek === ak) { last = ek; continue }
    return {
      index: i + 1,
      expected: ek,
      actual: ak,
      prevMatch: last || undefined,
      nextExpected: expectedKeys[i + 1],
    }
  }
  return undefined
}

export function renderDivergence(d: Divergence): string {
  return [
    `  FIRST DIVERGENCE at event #${d.index}`,
    `    expected: ${d.expected}`,
    `    actual:   ${d.actual}`,
    d.prevMatch ? `    prev match: ${d.prevMatch}` : '',
    d.nextExpected ? `    next expected: ${d.nextExpected}` : '',
  ].filter(Boolean).join('\n')
}