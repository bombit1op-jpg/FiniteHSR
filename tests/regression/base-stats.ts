/**
 * guide §30 "Base stats" per-character coverage.
 *
 * Base stats are not battle-observable (every fixture overrides `stats`), so they are verified
 * here against the dataset, not through a battle requirement. One case per kit so a data drift
 * names the offending kit. Chain: KitDef.base ← PROG[kit] ← hsr-data/characters.json `byLevel`.
 */

import { baseFidelity } from '../../src/verification/BaseStats'
import { case_, type Case } from '../suites'

export default function (): Case[] {
  return baseFidelity().map(c => case_(`base stats ${c.kit}`, c.ok, c.reason ?? ''))
}
