/**
 * Test corpus (§44): `golden/ scenarios/ invariants/ regression/ replays/ property/`.
 *
 * A suite is a function returning named boolean checks — no framework, no test runner
 * dependency. `npm test` discovers files by convention, so a new suite is one new file, no wiring.
 *
 * Suites read the corpus through the *verification layer* (`src/verification`): a fixture battle +
 * a JSON spec of requirements IS a test case, which is exactly why specs exist as data. The
 * per-category golden directories under `tests/golden/` are therefore the same format the
 * per-kit goldens use — see `tests/README.md` for which categories have data yet.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export interface Case {
  name: string
  ok: boolean
  detail?: string
}

export interface Suite {
  /** suite name, shown in the report */
  name: string
  /** file the suite lives in, relative to `tests/`, for `npm test -- <suite>` */
  file: string
  cases(): Case[] | Promise<Case[]>
}

export const case_ = (name: string, ok: boolean, detail = ''): Case => ({ name, ok, detail })

/** every helper a suite needs, so suites stay one-liners */
export const t = {
  ok: case_,
  eq: (name: string, actual: unknown, expected: unknown): Case =>
    case_(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`),
  near: (name: string, actual: number, expected: number, tol: number): Case =>
    case_(name, Math.abs(actual - expected) <= tol, `${actual} vs ${expected} ±${tol}`),
  truthy: (name: string, v: unknown, detail = ''): Case => case_(name, !!v, detail),
} as const

/** `tests/` itself; a pathToFileURL import works on Windows, a bare `import('C:/..')` does not */
export const TESTS_DIR = fileURLToPath(new URL('.', import.meta.url))
export const REPO_ROOT = join(TESTS_DIR, '..')

/** `tests/<dir>/<name>.ts` -> suite. Discovery is convention-only, no registry to forget.
 *  A missing directory is loud (stderr), not swallowed — an empty category and a *missing* one are
 *  different things, and the latter used to pass silently as "0 suites". */
export function discover(dir: string): Suite[] {
  const full = join(TESTS_DIR, dir)
  const out: Suite[] = []
  let files: string[]
  try {
    files = readdirSync(full).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  } catch {
    console.warn(`WARN  ${dir} (${full}): no such directory — 0 suites, category still listed in CATEGORIES`)
    return out
  }
  for (const f of files) {
    out.push({ name: f.replace(/\.ts$/, ''), file: join(dir, f), async cases() {
      const m = await import(pathToFileURL(join(full, f)).href)
      return m.default() as Case[]
    } })
  }
  return out
}

export const CATEGORIES = [
  'golden/damage', 'golden/timeline', 'golden/energy', 'golden/sp',
  'golden/buffs', 'golden/debuffs', 'golden/optimizer', 'golden/fua', 'golden/break',
  'golden/dot', 'golden/shields', 'golden/summons', 'golden/death',
  'golden/targeting', 'golden/gear', 'golden/eidolons', 'golden/teams',
  'golden/enemies',
  'golden/special-resources', 'golden/hp-changes', 'golden/reactions', 'golden/additional-dmg',
  'golden/countdowns', 'golden/transformations', 'golden/marks', 'golden/techniques',
  'scenarios/minimal', 'scenarios/interactions', 'scenarios/endgame', 'scenarios/adversarial',
] as const

export async function runAll(filter?: string): Promise<number> {
  const suites: Suite[] = []
  for (const dir of ['ui', 'invariants', 'regression', 'property', 'replays', 'verification', ...CATEGORIES])
    suites.push(...discover(dir))

  let total = 0
  let failed = 0
  const lines: string[] = []
  for (const s of suites) {
    if (filter && !s.name.includes(filter) && !s.file.includes(filter)) continue
    let cases: Case[] = []
    try {
      cases = await s.cases()
    } catch (e) {
      cases = [case_(`${s.name} threw`, false, e instanceof Error ? e.message : String(e))]
    }
    const bad = cases.filter(c => !c.ok)
    total += cases.length
    failed += bad.length
    lines.push(`${bad.length ? 'FAIL' : 'ok  '} ${s.file.padEnd(34)} ${cases.length - bad.length}/${cases.length}`)
    for (const c of bad) lines.push(`     FAIL ${c.name}${c.detail ? ' :: ' + c.detail : ''}`)
  }
  console.log(lines.join('\n'))
  console.log(`\n${total} cases, ${failed} failed`)
  return failed
}
