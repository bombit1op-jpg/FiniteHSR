/**
 * §45 — run every mechanics lab. Aggregates the failure count so `npm run lab` exits non-zero if
 * any single lab fails. Each lab is independently runnable via `npm run lab:<name>`.
 */
import { breakLab } from './break'
import { buffsLab } from './buffs'
import { damageLab } from './damage'
import { energyLab } from './energy'
import { fuaLab } from './fua'
import { gearLab } from './gear'
import { guardLab } from './guard'
import { report, type LabCase } from './harness'
import { summonsLab } from './summons'
import { teamsLab } from './teams'
import { timelineLab } from './timeline'

const labs: Array<[string, () => LabCase[]]> = [
  ['Damage', damageLab],
  ['Timeline', timelineLab],
  ['Break / toughness', breakLab],
  ['State / buff lifecycle', buffsLab],
  ['Resource / energy', energyLab],
  ['Follow-up / event ordering', fuaLab],
  ['Gear aggregation', gearLab],
  ['Summons / memosprite', summonsLab],
  ['Team + smoke', teamsLab],
  ['Ponytail guard (§45)', guardLab],
]

let failed = 0
for (const [title, fn] of labs) failed += report(title, fn())
console.log(failed === 0 ? '\nALL LABS PASSED' : `\n${failed} LAB CHECK(S) FAILED`)
process.exitCode = failed === 0 ? 0 : 1
