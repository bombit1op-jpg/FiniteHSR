/**
 * Coverage roll-up is the gate's failure list, so a failing row must stay actionable.
 *
 * `requirementCoverage()` groups by kit/slot#requirement, but one requirement runs in several
 * fixtures — `#id` alone cannot say which battle failed. Each CovRow therefore carries its
 * `fixture` and the line names it. This pins that: the fixture id survives to the rendered
 * failure line instead of being dropped at the CovRow boundary.
 */

import { requirementCoverage, type CovRow } from '../../src/verification/Coverage'
import { t } from '../suites'
import type { Case } from '../suites'

const row = (over: Partial<CovRow>): CovRow => ({
  kit: 'boothill', slot: 'skill', fixture: 'standoff',
  requirement: 'skill_enters_standoff', layer: 'ordering', ok: true, ...over,
})

export default async (): Promise<Case[]> => {
  const cases: Case[] = []

  // a hard failure names the fixture it came from
  const fail = requirementCoverage([row({ ok: false }), row({ ok: true })])
  cases.push(t.truthy('failed row names the fixture', fail.includes('boothill/skill#skill_enters_standoff @ standoff')))
  cases.push(t.truthy('failed row keeps its layer tag', fail.includes('FAIL [ordering]')))
  cases.push(t.truthy('total counts rows, not fixtures', fail.includes('2 rows, 1 passed, 1 failed')))

  // a second fixture on the same requirement id must not collapse into the first
  const two = requirementCoverage([row({ ok: false, fixture: 'standoff' }), row({ ok: false, fixture: 'ult_standalone' })])
  cases.push(t.eq('two fixtures = two failures counted', two.includes('2 failed'), true))
  cases.push(t.truthy('both fixture ids surface', two.includes('@ standoff') && two.includes('@ ult_standalone')))

  // declared non-fatal rows keep their fixture too (they are the documented-gap list)
  const gap = requirementCoverage([row({ status: 'gap', fixture: 'el5_window' })])
  cases.push(t.truthy('gap row names its fixture', gap.includes('[GAP] boothill/skill#skill_enters_standoff @ el5_window')))
  cases.push(t.truthy('non-fatal row never counted as failed', gap.includes('0 failed, 1 non-fatal')))

  // a passing run renders the same totals with no per-row lines
  const ok = requirementCoverage([row({})])
  cases.push(t.eq('all-pass has no detail lines', ok.split('\n').length, 1))

  return cases
}
