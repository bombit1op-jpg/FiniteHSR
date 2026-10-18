/**
 * Verification corpus gate: every spec under `verification/characters/*` and
 * `verification/interactions/*` must pass as part of `npm test` (guide Phase 1 №7).
 *
 * Runs the verification CLI in a child process (`node --import tsx src/verification/index.ts`)
 * and parses its per-spec report lines, so one Case = one spec slot — a failure names the kit,
 * the slot and the failing requirement instead of a single opaque "verify failed".
 *
 * The child isolates stdout from the test reporter and keeps the CLI's exit contract
 * (`ALL SPECS PASSED` / `FAILURES: n`) untouched for the standalone `npm run verify` gate.
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { case_, type Case, REPO_ROOT } from '../suites'

const SPEC_LINE = /^(\S+) \/ (\S+)\s+PASS (\d+)\s+FAIL (\d+)\s+DIVERGED (\d+)/gm

export default function (): Case[] {
  const cli = join(REPO_ROOT, 'src', 'verification', 'index.ts')
  const r = spawnSync(process.execPath, ['--import', 'tsx', cli], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 300_000,
  })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const tail = out.split(/\r?\n/).slice(-15).join('\n')

  if (r.error) return [case_('verification child process ran', false, r.error.message)]

  const cases: Case[] = []
  const specs: Array<{ kit: string; slot: string; pass: number; fail: number; diverged: number }> = []
  for (const m of out.matchAll(SPEC_LINE)) {
    specs.push({ kit: m[1], slot: m[2], pass: +m[3], fail: +m[4], diverged: +m[5] })
  }

  if (!specs.length) {
    // the CLI printed no report at all — crashed before the first spec, or discovered nothing
    return [case_('verification corpus produced a report', false, `exit ${r.status}\n${tail}`)]
  }

  for (const s of specs) {
    const ok = s.fail === 0 && s.diverged === 0
    const detail = ok
      ? ''
      : out.split(/\r?\n/)
          .filter(l => /^\s{4}(FAIL|\[)/.test(l))
          .slice(0, 3)
          .join(' | ')
    cases.push(case_(`${s.kit} / ${s.slot}`, ok, detail || `PASS ${s.pass} FAIL ${s.fail} DIVERGED ${s.diverged}`))
  }

  const roster = /KIT ROSTER: (\d+)\/(\d+) covered/.exec(out)
  cases.push(case_(
    'kit roster covered by specs',
    !!roster && roster[1] === roster[2],
    roster ? `${roster[1]}/${roster[2]}` : 'KIT ROSTER line missing',
  ))
  cases.push(case_(
    'ALL SPECS PASSED',
    out.includes('ALL SPECS PASSED') && r.status === 0,
    r.status === 0 ? '' : `exit ${r.status}\n${tail}`,
  ))

  // §30 ability matrix is content-driven: the slots below track requirement `ability` tags in the
  // spec JSON (see TODO L191), so a dropped tag silently lowers coverage. Pin a floor to catch that.
  // `base` is fed by the data-fidelity layer, not a spec tag.
  const abil = /(\d+) kits · covering: base (\d+) · basic (\d+) · skill (\d+) · talent (\d+) · ultimate (\d+) · technique (\d+)/.exec(out)
  const cov = abil && { base: +abil[2], basic: +abil[3], skill: +abil[4], talent: +abil[5], ultimate: +abil[6], technique: +abil[7] }
  cases.push(case_(
    '§30 ability matrix covers base/basic/skill/talent/ultimate/technique',
    !!cov && cov.base >= 93 && cov.basic >= 93 && cov.skill >= 93 && cov.talent >= 93 && cov.ultimate >= 93 && cov.technique >= 93,
    cov ? abil![0] : 'ABILITY COVERAGE line missing',
  ))
  const baseLine = /BASE STATS COVERAGE — (\d+)\/(\d+) kits match hsr-data\/characters\.json/.exec(out)
  cases.push(case_(
    '§30 base stats match hsr-data/characters.json',
    !!baseLine && baseLine[1] === baseLine[2],
    baseLine ? `${baseLine[1]}/${baseLine[2]}` : 'BASE STATS COVERAGE line missing',
  ))
  return cases
}
