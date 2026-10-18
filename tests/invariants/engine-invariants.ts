/**
 * §44 `invariants/` — the engine-level invariant suite that already exists, reached from `tests/`.
 *
 * Bridge, not a copy. `src/core/check.ts` owns the asserts (break ordering, DMG boost
 * folding, memosprite CRIT mirroring, ...); this suite only reports its verdict as cases, so
 * `npm test` and `npm run check` can never drift apart.
 */

import { runChecks } from '../../src/core/check'
import { t, type Case } from '../suites'

export default async function (): Promise<Case[]> {
  const r = await runChecks()
  if (!r.failed) return [t.truthy('src/core/check.ts: ALL CHECKS PASSED', r.text.includes('ALL CHECKS PASSED'))]
  const fails = r.text.split('\n').filter(l => l.startsWith('FAIL')).join(' | ')
  return [t.ok('src/core/check.ts', false, `${r.failed} failed: ${fails}`)]
}
