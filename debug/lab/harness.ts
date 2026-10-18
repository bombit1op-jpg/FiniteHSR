/**
 * §45 Mechanics laboratory — shared harness.
 *
 * A fast, developer-only environment for isolating a single engine rule: craft a
 * deterministic TestCharacter/TestDummy, run the REAL pure function or a live battle, and
 * print expected vs actual. Faster than a sweep, and the place a formula-level change is
 * developed before it is promoted to full regression (tests/ + `npm run check`).
 *
 * Each lab (damage/timeline/break/buffs/energy/fua/gear/summons/teams) is a standalone
 * script (`npm run lab:<name>`); importing one must stay inert, so every lab self-executes
 * only through `isEntry` — the same guard `src/core/check.ts` uses.
 */
import type { Unit } from '../../src/core/entities/Unit'
import type { Buff } from '../../src/core/effects/Buff'
import type { StatKey } from '../../src/core/entities/Unit'

export interface LabCase { name: string; ok: boolean; detail: string }

const fmt = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : String(v))

/** assert |actual - expected| <= tol (default 1e-6; pass 0.5 for floored integer damage). */
export function eq(name: string, actual: number, expected: number, tol = 1e-6): LabCase {
  const ok = Math.abs(actual - expected) <= tol
  return { name, ok, detail: ok ? `= ${fmt(actual)}` : `got ${fmt(actual)}, want ${fmt(expected)}` }
}

/** assert a boolean predicate (non-numeric rules: ordering, presence, classification). */
export function ok(name: string, condition: boolean, detail = ''): LabCase {
  return { name, ok: condition, detail }
}

/** deterministic test unit (§45 TestCharacter/TestDummy): lvl80, 1000/1000/500/100. */
export function mkUnit(p: Partial<Unit> = {}): Unit {
  return {
    id: 't', name: 'T', side: 'ally', kind: 'char', elem: 'Quantum',
    base: { level: 80, hp: 1000, atk: 1000, def: 500, spd: 100 },
    hp: 1000, maxHp: 1000, energy: 0, maxEnergy: 120, av: 0,
    buffs: [], dots: [], toughness: 0, maxToughness: 0, broken: false, weaknesses: [], res: {},
    ...p,
  } as Unit
}

/** one mod-carrying 1-turn buff shortcut. */
export function mod(stat: StatKey, value: number, extra: Partial<Buff> = {}): Buff {
  return { id: `${stat}_${value}`, name: `${stat} ${value}`, turns: 1, mods: [{ stat, value }], ...extra }
}

/** print a lab result; returns the failure count (0 = pass). */
export function report(title: string, cases: LabCase[]): number {
  const failed = cases.filter(c => !c.ok)
  const out = [`\n=== ${title} (${cases.length}) ===`]
  for (const c of cases) out.push(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`)
  out.push(failed.length ? `${failed.length} FAILED` : 'ALL PASSED')
  console.log(out.join('\n'))
  return failed.length
}

/** true when this lab file is the process entry (`npm run lab:*`); importing stays inert. */
export function isEntry(file: string): boolean {
  const entry = (process.argv[1] ?? '').replace(/\\/g, '/')
  return entry.endsWith(`debug/lab/${file}`)
}
