/**
 * Verification CLI.
 *
 *   npx tsx src/verification/index.ts              # every spec + coverage
 *   npx tsx src/verification/index.ts acheron     # one kit
 *   npx tsx src/verification/index.ts --golden     # also record/refresh golden traces
 */

import { readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { skel, key } from './TraceMatcher'
import { loadSlot, type SlotSpec } from './Spec'
import { runSlot, report, render } from './GoldenRunner'
import { coverage, requirementCoverage, abilityCoverage, lightconeCoverage, relicCoverage, planarCoverage, missingKits, type CovRow } from './Coverage'
import { baseFidelity } from './BaseStats'
import { gearCoverageReport } from './gearCoverage'
import { gearSpecs } from './gearSpecs'
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from '../core/gear'
import { KITS } from '../core/kits/index'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const SPEC_DIR = join(ROOT, 'verification', 'characters')
const INTER_DIR = join(ROOT, 'verification', 'interactions')
const GOLDEN = join(ROOT, 'verification', 'golden')

function discover(filter?: string): string[] {
  const files: string[] = []
  for (const root of [SPEC_DIR, INTER_DIR]) {
    if (!existsSync(root)) continue
    for (const kit of readdirSync(root)) {
      if (filter && kit !== filter) continue
      const dir = join(root, kit)
      if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
      for (const f of readdirSync(dir)) if (f.endsWith('.json')) files.push(join(dir, f))
    }
  }
  return files
}

const args = process.argv.slice(2)
const slotIdx = args.indexOf('--slot')
const slotFilter = slotIdx >= 0 ? args[slotIdx + 1] : undefined
const filter = args.find((a, i) => !a.startsWith('-') && (slotIdx < 0 || i !== slotIdx + 1))
const record = args.includes('--golden')

const allFiles = discover()
const allSpecs: SlotSpec[] = allFiles.map(f => loadSlot(f))
const files = allFiles.filter(f => !filter || f.includes(`${filter}\\`))
let specs: SlotSpec[] = files.map(f => loadSlot(f))
if (slotFilter) specs = specs.filter(s => s.slot === slotFilter)
// generated gear fixtures ride the full run (and target the gear slot explicitly), never a kit slice
const gearSpecsList = ((!filter && !slotFilter) || filter === 'gear') ? gearSpecs() : []
if (!specs.length && !gearSpecsList.length) {
  console.log(filter || slotFilter ? `no specs for ${filter ?? ''} ${slotFilter ?? ''}`.trim() : `no specs in ${SPEC_DIR}`)
  process.exit(0)
}
let failed = 0
const covRows: CovRow[] = []

for (const spec of specs) {
  // interaction specs are verified against assertions only, never recorded as golden traces
  const runs = runSlot(spec, spec.slot === 'interactions' ? undefined : GOLDEN)
  const r = report(runs, spec.kit, spec.slot)
  failed += r.failed + r.divergences
  for (const run of runs) for (const x of run.rows) covRows.push({ kit: spec.kit, slot: spec.slot, fixture: x.fixture, requirement: x.requirement, layer: x.layer, ok: x.result.ok, status: x.status })
  console.log(render(r))
  if (record && spec.slot !== 'interactions') {
    for (const run of runs) {
      const dir = join(GOLDEN, spec.kit)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${run.fixture.id}.json`), JSON.stringify({
        input: { kit: spec.kit, slot: spec.slot, env: run.fixture.env, seed: run.sim.cfg.seed, cycles: run.sim.cfg.cycles },
        expectedKeys: skel(run.ctx.nodes).map(key),
      }, null, 1))
    }
    console.log(`  recorded ${runs.length} golden trace(s) for ${spec.kit}`)
  }
  console.log('')
}

// gear fixtures are generated in bulk: print only what fails, plus a roll-up line
let gearFailed = 0
for (const spec of gearSpecsList) {
  const runs = runSlot(spec)
  const r = report(runs, spec.kit, spec.slot)
  failed += r.failed
  gearFailed += r.failed
  for (const run of runs) for (const x of run.rows) covRows.push({ kit: spec.kit, slot: spec.slot, fixture: x.fixture, requirement: x.requirement, layer: x.layer, ok: x.result.ok, status: x.status })
  if (r.failed) console.log(render(r))
}
if (gearSpecsList.length) console.log(`GEAR FIXTURES — ${gearSpecsList.length} specs, ${gearFailed} failing requirement(s)\n`)

// guide §30 "Base stats": not battle-observable, so data-fidelity-verified (kit.base ← PROG ← dataset)
const baseChecks = baseFidelity()
const baseKits = new Set(baseChecks.filter(c => c.ok).map(c => c.kit))
console.log(coverage(specs))
console.log(requirementCoverage(covRows))
console.log(abilityCoverage(specs, baseKits))
console.log(`\nBASE STATS COVERAGE — ${baseKits.size}/${baseChecks.length} kits match hsr-data/characters.json`)
for (const c of baseChecks) if (!c.ok) console.log(`  FAIL ${c.kit}: ${c.reason}`)
const every = [...allSpecs, ...gearSpecsList]
console.log(lightconeCoverage(every, LIGHT_CONES.map(c => c.id)))
console.log(relicCoverage(every, RELIC_SETS.map(s => s.id)))
console.log(planarCoverage(every, PLANAR_SETS.map(p => p.id)))
console.log(gearCoverageReport())
// roster gate always walks the FULL spec set, not the --filter/--slot slice
const roster = KITS.map(k => k.id)
const missing = missingKits(allSpecs, roster)
console.log(`\nKIT ROSTER: ${roster.length - missing.length}/${roster.length} covered${missing.length ? `, missing: ${missing.join(' ')}` : ''}`)
if (missing.length) failed += missing.length
console.log(failed ? `\nFAILURES: ${failed}` : '\nALL SPECS PASSED')
process.exit(failed ? 1 : 0)