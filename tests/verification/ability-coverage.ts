/**
 * guide §30 ability matrix: `abilityOf` resolves a requirement's ability slot (explicit tag or the
 * event `action` matcher) and `abilityCoverage` reports which slots each kit pins. Pure functions —
 * no battle runs here; the matrix is a report over spec data.
 */
import { abilityOf, abilityCoverage } from '../../src/verification/Coverage'
import type { Requirement } from '../../src/verification/Requirement'
import type { SlotSpec } from '../../src/verification/Spec'
import { t, type Case } from '../suites'

const req = (o: Partial<Requirement>): Requirement =>
  ({ id: 'r', layer: 'structure', claim: 'c', assertion: { assert: 'custom', note: '' }, ...o })

const actionReq = (action: string): Requirement =>
  req({ assertion: { assert: 'count', of: { type: 'ABILITY_USED', action }, value: 1 } })

const spec = (kit: string, slot: SlotSpec['slot'], requirements: Requirement[]): SlotSpec =>
  ({ kit, slot, fixtures: [{ id: 'f', env: 'e', battle: {} }], requirements })

export default function (): Case[] {
  const cases: Case[] = []
  cases.push(t.ok('explicit ability tag wins over the matcher',
    abilityOf(req({ ability: 'technique', assertion: { assert: 'count', of: { type: 'ABILITY_USED', action: 'skill' }, value: 1 } })) === 'technique'))
  cases.push(t.ok('derives ultimate from of.action', abilityOf(actionReq('ultimate')) === 'ultimate'))
  cases.push(t.ok('derives basic from of.action', abilityOf(actionReq('basic')) === 'basic'))
  cases.push(t.ok('generic attack action → undefined', abilityOf(actionReq('attack')) === undefined))
  cases.push(t.ok('no matcher → undefined', abilityOf(req({})) === undefined))

  const report = abilityCoverage([
    spec('alpha', 'skill', [actionReq('skill'), actionReq('ultimate'), req({ id: 'a3', ability: 'talent' })]),
    spec('beta', 'skill', [req({ id: 'b1' })]),
    spec('alpha', 'eidolons', [actionReq('basic')]),
  ])
  cases.push(t.ok('matrix lists every skill kit, incl. uncovered',
    /^alpha\b/m.test(report) && /^beta\b/m.test(report), report))
  cases.push(t.ok('counts skill/talent/ultimate from matcher + tag',
    /covering: base 0 · basic 0 · skill 1 · talent 1 · ultimate 1 · technique 0/.test(report), report))
  cases.push(t.ok('non-skill slot contributes nothing',
    /basic 0/.test(report), report))

  // `base` is not a spec tag: the column is fed by the data-fidelity layer's verified kit set
  const withBase = abilityCoverage([
    spec('alpha', 'skill', [actionReq('skill')]),
    spec('beta', 'skill', [req({ id: 'b1' })]),
  ], new Set(['alpha']))
  cases.push(t.ok('baseKits feeds the base column',
    /covering: base 1 · basic 0/.test(withBase) && /^alpha\s+Y/m.test(withBase), withBase))
  return cases
}
