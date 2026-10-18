/**
 * Assertion executor. One generic evaluator per assertion kind — the whole point is that a
 * requirement is data, so migrating a kit means writing a spec, not writing a bespoke probe.
 */

import type { Simulator, BuffLogEntry } from '../core/simulator'
import type { Unit } from '../core/entities/Unit'
import type { Node } from './TraceMatcher'
import { matches, firstIndex, type EventMatch } from './EventMatcher'

/** §46: the assertion vocabulary lives next to the evaluator that runs it. */
export type Assertion =
  | { assert: 'present'; of: EventMatch }
  | { assert: 'absent'; of: EventMatch }
  | { assert: 'count'; of: EventMatch; value: number }
  | { assert: 'payload'; of: EventMatch; field: string; value: number | string; tol?: number; pick?: 'first' | 'last' }
  | { assert: 'payloadAtLeast'; of: EventMatch; field: string; value: number; pick?: 'first' | 'last' }
  | { assert: 'buff'; id: string; target?: string; turns?: number; stacks?: number }
  | { assert: 'noBuff'; id: string; target?: string }
  | { assert: 'buffStat'; id: string; stat: string; value?: number; atLeast?: number; tol?: number }
  | { assert: 'energy'; who: string; atLeast?: number; atMost?: number }
  | { assert: 'unitState'; who?: string; kitId?: string; field: string; value?: number; tol?: number; atLeast?: number; atMost?: number }
  | { assert: 'ordering'; before: EventMatch[]; after: EventMatch[] }
  | { assert: 'noEventBetween'; between: [EventMatch, EventMatch]; forbidden: EventMatch }
  | { assert: 'custom'; note: string }

export interface Ctx {
  nodes: Node[]
  sim: Simulator
  buffLog: BuffLogEntry[]
  logLines: string[]
}

export interface Result {
  ok: boolean
  detail: string
}

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function find(n: Node, field: string): unknown {
  if (field in n.payload) return n.payload[field]
  return (n as unknown as Record<string, unknown>)[field]
}

function readField(u: Unit, field: string): number | undefined {
  const path = field.split('.')
  let cur: unknown = u
  for (const p of path) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return num(cur)
}

function unit(ctx: Ctx, who?: string, kitId?: string): Unit | undefined {
  if (kitId) return ctx.sim.roster.find(u => u.kitId === kitId)
  if (who) return ctx.sim.roster.find(u => u.name === who)
  return undefined
}

export function evaluate(a: Assertion, ctx: Ctx): Result {
  const { nodes, buffLog } = ctx
  switch (a.assert) {
    case 'present': {
      const i = firstIndex(nodes, a.of)
      return i < 0 ? { ok: false, detail: `no event matching ${JSON.stringify(a.of)}` }
        : { ok: true, detail: `#${nodes[i].eventId}` }
    }
    case 'absent': {
      const i = firstIndex(nodes, a.of)
      return i < 0 ? { ok: true, detail: 'absent' }
        : { ok: false, detail: `unexpected #${nodes[i].eventId} ${JSON.stringify(a.of)}` }
    }
    case 'count': {
      const got = nodes.filter(n => matches(n, a.of)).length
      return { ok: got === a.value, detail: `${got}/${a.value}` }
    }
    case 'payload':
    case 'payloadAtLeast': {
      const field = a.field
      const raw = nodes.filter(n => matches(n, a.of)).map(n => find(n, field))
      if (!raw.length) return { ok: false, detail: `no event with payload.${field}` }
      if (typeof a.value === 'string') {
        const last = String(raw[raw.length - 1])
        return { ok: last === a.value, detail: `${field}="${last}" want "${a.value}"` }
      }
      // per-hit payloads evolve during a fight (Boothill's Trick ladder) — `pick` says which one.
      const ordered = a.pick === 'first' ? raw.slice(0, 1) : raw
      const vals = ordered.map(num).filter((v): v is number => v !== undefined)
      if (!vals.length) return { ok: false, detail: `payload.${field} is not numeric` }
      if (a.assert === 'payloadAtLeast') {
        const max = Math.max(...vals)
        return { ok: max >= a.value, detail: `max ${field}=${max} >= ${a.value}` }
      }
      const v = vals[vals.length - 1]!
      const tol = a.tol ?? 1e-9
      return { ok: near(v, a.value as number, tol), detail: `${field}=${v} want ${a.value}` }
    }
    case 'buff': {
      const hits = buffLog.filter(e => e.id === a.id && (!a.target || e.unitName === a.target))
      if (!hits.length) return { ok: false, detail: `buff ${a.id} never applied` }
      if (a.turns !== undefined && !hits.some(e => e.turns === a.turns)) {
        return { ok: false, detail: `buff ${a.id} turns=${hits.map(e => e.turns).join('/')} want ${a.turns}` }
      }
      if (a.stacks !== undefined && !hits.some(e => e.stacks === a.stacks)) {
        return { ok: false, detail: `buff ${a.id} stacks=${hits.map(e => e.stacks).join('/')} want ${a.stacks}` }
      }
      return { ok: true, detail: `${hits.length}x` }
    }
    case 'noBuff': {
      const hits = buffLog.filter(e => e.id === a.id && (!a.target || e.unitName === a.target))
      return { ok: !hits.length, detail: hits.length ? `buff ${a.id} applied ${hits.length}x` : 'never applied' }
    }
    case 'buffStat': {
      const e = buffLog.filter(x => x.id === a.id).pop()
      const got = e?.mods?.find(m => m.stat === a.stat)?.value
      if (got === undefined) return { ok: false, detail: `buff ${a.id} has no mod ${a.stat}` }
      if (a.atLeast !== undefined) return { ok: got >= a.atLeast, detail: `${a.stat}=${got} >= ${a.atLeast}` }
      if (a.value === undefined) return { ok: false, detail: 'buffStat needs value or atLeast' }
      return { ok: near(got, a.value, a.tol ?? 0.01), detail: `${a.stat}=${got} want ${a.value}` }
    }
    case 'energy': {
      const sum = nodes.filter(n => n.type === 'ENERGY_GAIN' && n.target === a.who)
        .reduce((s, n) => s + (num(n.payload.n) ?? 0), 0)
      const lo = a.atLeast !== undefined && sum >= a.atLeast
      const hi = a.atMost !== undefined && sum <= a.atMost
      const ok = (a.atLeast === undefined || lo) && (a.atMost === undefined || hi)
      return { ok, detail: `${sum}${a.atLeast !== undefined ? ` >=${a.atLeast}` : ''}${a.atMost !== undefined ? ` <=${a.atMost}` : ''}` }
    }
    case 'unitState': {
      const u = unit(ctx, a.who, a.kitId)
      if (!u) return { ok: false, detail: `unit ${a.who ?? a.kitId} not found` }
      const got = readField(u, a.field)
      if (got === undefined) return { ok: false, detail: `field ${a.field} not numeric` }
      if (a.atLeast !== undefined || a.atMost !== undefined) {
        const lo = a.atLeast === undefined || got >= a.atLeast
        const hi = a.atMost === undefined || got <= a.atMost
        return {
          ok: lo && hi,
          detail: `${a.field}=${got}${a.atLeast !== undefined ? ` >=${a.atLeast}` : ''}${a.atMost !== undefined ? ` <=${a.atMost}` : ''}`,
        }
      }
      if (a.value === undefined) return { ok: false, detail: 'unitState needs value, atLeast or atMost' }
      return { ok: near(got, a.value, a.tol ?? 1e-9), detail: `${a.field}=${got} want ${a.value}` }
    }
    case 'ordering': {
      const before = a.before.map(m => firstIndex(nodes, m))
      const after = a.after.map(m => firstIndex(nodes, m))
      const bi = Math.min(...before), ai = Math.max(...after)
      if (bi < 0) return { ok: false, detail: `missing "before" event ${JSON.stringify(a.before[before.indexOf(bi)])}` }
      if (ai < 0) return { ok: false, detail: `missing "after" event ${JSON.stringify(a.after[after.indexOf(ai)])}` }
      return { ok: bi < ai, detail: `before #${bi + 1} < after #${ai + 1}` }
    }
    case 'noEventBetween': {
      const from = firstIndex(nodes, a.between[0])
      const to = firstIndex(nodes, a.between[1])
      if (from < 0 || to < 0) return { ok: false, detail: 'boundary event missing' }
      const hit = nodes.slice(from, to).find(n => matches(n, a.forbidden))
      return hit
        ? { ok: false, detail: `${hit.type} leaked between #${from + 1} and #${to + 1}` }
        : { ok: true, detail: 'clean' }
    }
    case 'custom':
      return { ok: true, detail: `skipped: ${a.note}` }
  }
}