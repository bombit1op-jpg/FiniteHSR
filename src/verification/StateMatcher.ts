/**
 * Before / after state diff (guide: "Для каждого effect я бы делал Before / Event / After").
 *
 * The engine already hashes whole-battle state (§38); what was missing was a human-readable
 * "what actually changed" list per requirement, so a failed check can say which stat moved.
 *
 * Field shape and rounding mirror `battlelog.snapshot()` so both views of the same battle agree
 * to the decimal. Buffs/dots are qualitative (`id x stacks @ turns`), not counts — a stack or
 * duration change must show up in the diff, not vanish into a +1.
 */

import type { Simulator } from '../core/simulator'
import type { Unit } from '../core/entities/Unit'
import { eff } from '../core/combat/StatResolver'
import type { StateClause } from './Requirement'

export interface UnitState {
  kitId?: string
  name: string
  hp: number
  energy: number
  buffs: string[]
  broken: boolean
  dead: boolean
  spd: number
  av: number
  toughness: number
  dots: string[]
}

const r2 = (v: number): number => Math.round(v * 100) / 100
const r3 = (v: number): number => Math.round(v * 1000) / 1000
const tags = (v: { id?: string; kind?: string; stacks?: number; turns?: number }[], key: 'id' | 'kind'): string[] =>
  v.map(b => `${b[key]}x${b.stacks ?? 1}@${b.turns ?? 'perm'}`).sort()

const of = (u: Unit): UnitState => {
  const b = u.buffs as unknown as { id: string; stacks?: number; turns?: number }[]
  const d = u.dots as unknown as { kind: string; stacks?: number; turns?: number }[]
  return {
    kitId: u.kitId,
    name: u.name,
    hp: r2(u.hp),
    energy: r2(u.energy),
    buffs: tags(b, 'id'),
    broken: !!u.broken,
    dead: !!u.dead,
    spd: r2(eff(u).spd),
    av: r3(u.av),
    toughness: r2(u.toughness),
    dots: tags(d, 'kind'),
  }
}

export function snapshot(sim: Simulator): Map<string, UnitState> {
  return new Map(sim.roster.map(u => [u.name, of(u)]))
}

/** per-fixture state available to requirement clauses: every unit + the team SP pool. */
export interface StateView {
  units: Map<string, UnitState>
  sp: number
}

export const stateView = (sim: Simulator): StateView => ({ units: snapshot(sim), sp: sim.sp() })

/** what a single `StateClause` needs from the view. Resolves the unit the same way Assertion does
 *  (kitId beats name), reads the stat, then applies the op. */
export function clause(c: StateClause, v: StateView): { ok: boolean; detail: string } {
  const u = (c.kitId ? [...v.units.values()].find(x => x.kitId === c.kitId) : undefined) ?? (c.unit ? v.units.get(c.unit) : undefined)
  if (!u) return { ok: false, detail: `unit ${c.unit ?? c.kitId ?? '?'} not in view` }
  const num = (got: boolean | number): number => (typeof got === 'boolean' ? (got ? 1 : 0) : got)
  const got = c.stat === 'sp' ? v.sp
    : c.stat === 'buffs' ? u.buffs.length
    : num(u[c.stat])
  const want = c.value
  const ok = c.op === 'eq' ? got === want : c.op === 'atLeast' ? got >= want : got <= want
  return { ok, detail: `${u.name}.${c.stat} = ${got} ${c.op} ${want}` }
}

/** run a clause list; first failure wins (like an AND over the clauses). */
export function clauses(list: StateClause[], view: StateView): { ok: boolean; detail: string } {
  for (const c of list) {
    const r = clause(c, view)
    if (!r.ok) return r
  }
  return { ok: true, detail: `${list.length} clause(s)` }
}

const join = (a: string[], b: string[]): boolean => a.join(',') === b.join(',')

export function diff(before: Map<string, UnitState>, sim: Simulator): string[] {
  const out: string[] = []
  for (const u of sim.roster) {
    const a = before.get(u.name)
    const b = of(u)
    if (!a) { out.push(`${u.name} appeared hp=${b.hp}`); continue }
    for (const k of ['hp', 'energy', 'broken', 'dead', 'spd', 'av', 'toughness'] as const) {
      if (a[k] !== b[k]) out.push(`${u.name}.${k}: ${a[k]} -> ${b[k]}`)
    }
    if (!join(a.buffs, b.buffs)) out.push(`${u.name}.buffs: ${a.buffs.join(', ')} -> ${b.buffs.join(', ')}`)
    if (!join(a.dots, b.dots)) out.push(`${u.name}.dots: ${a.dots.join(', ')} -> ${b.dots.join(', ')}`)
  }
  for (const name of before.keys()) {
    if (!sim.roster.some(x => x.name === name)) out.push(`${name}: <removed>`)
  }
  return out
}