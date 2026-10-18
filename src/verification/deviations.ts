/**
 * Phase 3.5 — Paired / Allies Verification CLI.
 *
 *   npx tsx src/verification/deviations.ts            # all registered interaction fixtures
 *   npx tsx src/verification/deviations.ts arlan      # one kit
 *
 * Runs interaction fixtures (verification/interactions/<kit>/interactions.json) that exercise a
 * documented deviation requiring ally state / ally actions / team resources / cross-character
 * triggers. Every check ends in exactly one of: PASS, GAP, BLOCKED, FAIL (or PROMOTE when a
 * declared GAP starts passing — a signal to move it into the mandatory `npm run verify` gate).
 *
 * A GAP/BLOCKED is a visible, non-fatal outcome; only FAIL (an untagged assertion that diverges)
 * fails the run. The existing npm test / check / verify gates are untouched — interactions live
 * in their own tree and are never discovered by `src/verification/index.ts`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadSlot, type SlotSpec } from './Spec'
import { runSlot, type FixtureRun } from './GoldenRunner'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const INT_DIR = join(ROOT, 'verification', 'interactions')
const MANIFEST = join(INT_DIR, 'manifest.json')

interface ManifestKit { kit: string }
interface Manifest { kits: ManifestKit[] }

type Outcome = 'PASS' | 'GAP' | 'BLOCKED' | 'FAIL' | 'PROMOTE'

interface Finding { kit: string; fixture: string; requirement: string; outcome: Outcome; detail: string; stateAfter?: string }

const filter = process.argv.slice(2).find(a => !a.startsWith('-'))

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const targets = manifest.kits.map(k => k.kit).filter(k => !filter || k === filter)
if (!targets.length) { console.log(`no manifest kit matches ${filter ?? ''}`); process.exit(0) }

const withFixtures: string[] = []
const missing: string[] = []
const findings: Finding[] = []
let failed = 0

for (const kit of targets) {
  const file = join(INT_DIR, kit, 'interactions.json')
  if (!existsSync(file)) { missing.push(kit); continue }
  withFixtures.push(kit)
  const spec: SlotSpec = loadSlot(file)
  const runs: FixtureRun[] = runSlot(spec) // no golden dir: interactions have no recorded trace
  const statusOf = new Map(spec.requirements.map(r => [r.id, r.status]))
  const reasonOf = new Map(spec.requirements.map(r => [r.id, r.blockReason]))
  const rows: Finding[] = []
  for (const run of runs) {
    for (const row of run.rows) {
      const st = statusOf.get(row.requirement)
      let outcome: Outcome
      let detail = row.result.detail
      if (st === 'blocked') { outcome = 'BLOCKED'; detail = reasonOf.get(row.requirement) ?? detail }
      else if (st === 'gap') outcome = row.result.ok ? 'PROMOTE' : 'GAP'
      else outcome = row.result.ok ? 'PASS' : 'FAIL'
      if (outcome === 'FAIL') failed++
      rows.push({ kit, fixture: run.fixture.id, requirement: row.requirement, outcome, detail, stateAfter: run.stateAfter })
    }
  }
  findings.push(...rows)
  const n = (o: Outcome) => rows.filter(r => r.outcome === o).length
  console.log(`${kit.padEnd(20)} ${runs.length} fx  PASS ${n('PASS')}  GAP ${n('GAP')}  BLOCKED ${n('BLOCKED')}  PROMOTE ${n('PROMOTE')}  FAIL ${n('FAIL')}`)
}

const interesting = findings.filter(f => f.outcome === 'FAIL' || f.outcome === 'GAP' || f.outcome === 'PROMOTE')
if (interesting.length) {
  console.log('\n--- findings (FAIL / GAP / PROMOTE) ---')
  for (const f of interesting) {
    console.log(`[${f.outcome}] ${f.kit}/${f.fixture} ${f.requirement}: ${f.detail}`)
    if (f.stateAfter) console.log(`         ${f.stateAfter.trim()}`)
  }
}

const blocked = findings.filter(f => f.outcome === 'BLOCKED')
if (blocked.length) {
  console.log(`\n--- blocked (${blocked.length}) ---`)
  for (const f of blocked) console.log(`[BLOCKED] ${f.kit}/${f.fixture} ${f.requirement}: ${f.detail}`)
}

console.log(`\nCOVERAGE: ${withFixtures.length}/${targets.length} target kits have interaction fixtures`)
if (missing.length) console.log(`MISSING (no interactions.json): ${missing.join(' ')}`)
console.log(`\nTOTALS: PASS ${findings.filter(f => f.outcome === 'PASS').length}  GAP ${findings.filter(f => f.outcome === 'GAP').length}  BLOCKED ${blocked.length}  PROMOTE ${findings.filter(f => f.outcome === 'PROMOTE').length}  FAIL ${failed}`)
console.log(failed ? `\nFAILURES: ${failed}` : '\nNO FAILURES')
process.exit(failed ? 1 : 0)
