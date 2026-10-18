// Safely prune expendable debug artifacts (per-battle transcripts, regenerable reports).
// DRY-RUN by default — pass `--apply` to actually delete. See debug/README.md.
//
//   npx tsx src/core/clean-debug.ts                  # list what WOULD be removed (with sizes)
//   npx tsx src/core/clean-debug.ts --only=audit      # scope to one group: logs | reports | audit
//   npx tsx src/core/clean-debug.ts --apply --only=audit   # actually delete that group
//
// Only explicitly enumerated, regenerable targets are touched. Source data, CSVs,
// `.done` summaries, crashes, fixtures, `debug/audit/pre-repair/` and `debug/lab/`
// are never in scope.
import { existsSync, readdirSync, statSync, rmSync } from 'fs'
import { join, relative, sep } from 'path'
import { KITS } from './kits'

const DEBUG = join(process.cwd(), 'debug')
const APPLY = process.argv.includes('--apply')
const KIT_IDS = new Set(KITS.map(k => k.id))

/** trees that must survive untouched even if a pattern would match inside them */
const PROTECTED = ['audit/pre-repair', 'lab', 'sheet-diff', 'sweep/logs-keep']

type Group = 'logs' | 'reports' | 'audit'
interface Target { path: string; reason: string; dir: boolean; group: Group }
const targets: Target[] = []

const onlyArg = process.argv.find(a => a.startsWith('--only='))
const ONLY: Set<Group> | undefined = onlyArg ? new Set(onlyArg.slice('--only='.length).split(',').map(s => s.trim()) as Group[]) : undefined

function addDir(path: string, reason: string, group: Group): void {
  if (existsSync(path)) targets.push({ path, reason, dir: true, group })
}

function addFiles(dir: string, match: (name: string) => boolean, reason: string, group: Group): void {
  if (!existsSync(dir)) return
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && match(e.name)) targets.push({ path: join(dir, e.name), reason, dir: false, group })
  }
}

// 1. per-battle transcripts (the ~875 KB/battle tree) — expendable once the audit is done
addDir(join(DEBUG, 'sweep', 'logs'), 'per-battle transcripts (SWEEP_LOGS), expendable after audit', 'logs')
// 2. debug-presets step reports at the debug root (named <kitId>.txt) — regenerable
addFiles(DEBUG, n => n.endsWith('.txt') && KIT_IDS.has(n.slice(0, -4)),
  'debug-presets step report (regenerate: npx tsx src/core/debug-presets.ts)', 'reports')
// 3. audit scratch captures — regenerable. 00_all.txt is excluded: cited as evidence in TODO.md:783.
addFiles(join(DEBUG, 'audit'),
  n => n !== '00_all.txt' && (/^eidolon-.*\.txt$/.test(n) || /^tsc-.*\.txt$/.test(n)),
  'audit scratch capture (regenerate: npx tsx src/core/audit-abils.ts / probe-eidolon-ladder.ts)', 'audit')

function sizeOf(p: string): number {
  let total = 0
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const c = join(d, e.name)
      if (e.isDirectory()) walk(c)
      else if (e.isFile()) total += statSync(c).size
    }
  }
  const st = statSync(p)
  if (st.isDirectory()) walk(p)
  else total = st.size
  return total
}

function isProtected(p: string): boolean {
  const rel = relative(DEBUG, p).split(sep).join('/')
  return PROTECTED.some(pr => rel === pr || rel.startsWith(pr + '/'))
}

let totalBytes = 0
let removed = 0
let skipped = 0
let candidates = 0

console.log(APPLY ? 'MODE: APPLY (deleting)' : 'MODE: DRY-RUN (no changes; pass --apply to delete)')
if (ONLY) console.log(`SCOPE: --only=${[...ONLY].join(',')}`)
console.log('')

let lastReason = ''
for (const t of targets.sort((a, b) => a.reason.localeCompare(b.reason) || a.path.localeCompare(b.path))) {
  if (ONLY && !ONLY.has(t.group)) { skipped++; continue }
  if (!t.path.startsWith(DEBUG) || isProtected(t.path)) { skipped++; continue }
  const bytes = sizeOf(t.path)
  candidates++
  totalBytes += bytes
  if (t.reason !== lastReason) { console.log(`# ${t.reason}`); lastReason = t.reason }
  console.log(`  ${(bytes / 1048576).toFixed(2).padStart(8)} MB  ${relative(process.cwd(), t.path).split(sep).join('/')}`)
  if (APPLY) { try { rmSync(t.path, { recursive: true, force: true }); removed++ } catch { skipped++ } }
}

console.log('')
console.log(`${candidates} candidate(s), ${(totalBytes / 1048576).toFixed(1)} MB total` +
  (APPLY ? `, removed ${removed}` : ' (dry-run: nothing deleted)'))
if (skipped) console.log(`skipped/protected/out-of-scope: ${skipped}`)
console.log('Kept: *.csv, *.done, crashes.tsv, debug/audit/pre-repair/, debug/lab/, debug/sheet-diff/, debug/verification/, debug/order/.')
