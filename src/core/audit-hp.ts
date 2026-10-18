// HP-write audit (guide №17 / AGENTS §8, §35). Enumerates every direct `.hp` mutation under
// src/ and classifies it, so an HP-change that bypasses the damage/heal pipeline is visible.
//
// Two things it surfaces:
//   1. DEAD kit files — .ts files under src/core/kits/ unreachable from kits/index.ts. These still
//      carry the OLD raw `target.hp -= dmg` bypasses, but nothing imports them, so they are inert.
//   2. LIVE hp-write sites — grouped by category. All live enemy/ally damage already routes through
//      DamagePipeline / HealingPipeline / BreakResolver / TurnManager or fires fireAllyHpLoss; a NEW
//      live file with hp-writes that is not allowlisted below fails the guard (review needed).
//
// Run: rtk npx tsx src/core/audit-hp.ts
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const KITS_DIR = join(SRC, 'core', 'kits')

const HP_WRITE = /\.hp\s*(?:[-+]=|=)/

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) { if (!/node_modules|\.git/.test(e.name)) walk(p, acc) }
    else if (e.name.endsWith('.ts')) acc.push(p)
  }
  return acc
}

const all = walk(SRC).map(p => resolve(p))
const allSet = new Set(all)

function importsOf(file: string): string[] {
  const t = readFileSync(file, 'utf8')
  const out: string[] = []
  const re = /from\s+['"](\.[^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(t))) {
    const base = resolve(dirname(file), m[1])
    for (const c of [base + '.ts', base + '.js', join(base, 'index.ts')]) if (allSet.has(c)) { out.push(c); break }
  }
  return out
}

/** kit files reachable from the KITS registry (index.ts) */
const reachable = new Set<string>()
const stack = [join(KITS_DIR, 'index.ts')]
while (stack.length) {
  const f = stack.pop()!
  if (reachable.has(f)) continue
  reachable.add(f)
  for (const n of importsOf(f)) stack.push(n)
}

const deadKits = all.filter(f => dirname(f) === KITS_DIR && basename(f) !== 'index.ts' && !reachable.has(f))
const deadSet = new Set(deadKits)

/** live, non-debug files expected to hold direct hp writes (all legit HP-change / init semantics) */
const ALLOW = new Set([
  'autoai.ts', 'battle.ts', 'BattleEngine.ts', 'Lifecycle.ts', 'TurnManager.ts',
  'BreakResolver.ts', 'DamagePipeline.ts', 'HealingPipeline.ts', 'gear.ts',
  'destruction.ts', 'preservation.ts', 'remembrance.ts', 'simulator.ts',
  'HpChange.ts', 'kit.ts', 'defense.ts',
])
const isDebug = (b: string) => /^(debug-|probe-|audit-)/.test(b)

function category(b: string): string {
  switch (b) {
    case 'DamagePipeline.ts': return 'damage app (C: DAMAGE_DEALT)'
    case 'HealingPipeline.ts': return 'heal app (C)'
    case 'BreakResolver.ts': return 'break / superbreak (C)'
    case 'TurnManager.ts': return 'DoT tick / Entanglement / enemyHit / Aha (C)'
    case 'simulator.ts': return 'True DMG (C)'
    case 'Lifecycle.ts': return 'revive / kill (C: REVIVAL/DEATH)'
    case 'HpChange.ts': return 'typed HP mutation choke-point (C)'
    case 'defense.ts': return 'enemy redirect / redistribute (C: HP_REDIRECT)'
    case 'kit.ts': return 'SimApi hpChange signature + doc (interface)'
    case 'gear.ts': return 'gear HP-cost + stat aggregate (C/E)'
    case 'battle.ts':
    case 'BattleEngine.ts': return 'battle/wave init + base-stat resolve (E)'
    case 'autoai.ts': return 'AI self-check fixture (test)'
    case 'destruction.ts':
    case 'preservation.ts':
    case 'remembrance.ts': return 'kit self-cost / drain / redirect / spawn (C/E)'
    default: return 'UNCLASSIFIED'
  }
}

const live: { file: string; cat: string; lines: string[] }[] = []
const unexpected: string[] = []
for (const f of all) {
  const b = basename(f)
  if (isDebug(b) || deadSet.has(f)) continue
  const hits: string[] = []
  const ls = readFileSync(f, 'utf8').split(/\r?\n/)
  ls.forEach((l, i) => { if (HP_WRITE.test(l)) hits.push(`${i + 1}: ${l.trim()}`) })
  if (!hits.length) continue
  live.push({ file: f.slice(ROOT.length + 1), cat: category(b), lines: hits })
  if (!ALLOW.has(b)) unexpected.push(f.slice(ROOT.length + 1))
}

const total = live.reduce((n, x) => n + x.lines.length, 0)
console.log(`HP-write audit — live lines: ${total} across ${live.length} files (debug harness + dead kits excluded)`)
console.log(`dead kit files (unreachable from kits/index.ts): ${deadKits.length}`)
for (const x of live.sort((a, b) => a.file.localeCompare(b.file)))
  console.log(`  [${x.cat}] ${x.file} (${x.lines.length})`)

if (deadKits.length) {
  console.log('\nWARN — dead kit files still present (old raw-hp bypasses, inert):')
  for (const f of deadKits.map(f => f.slice(ROOT.length + 1)).sort()) console.log(`  ${f}`)
}

if (unexpected.length) {
  console.error('\nFAIL — live hp-write in a non-allowlisted file (possible pipeline bypass):')
  for (const f of unexpected) console.error(`  ${f}`)
  process.exitCode = 1
} else {
  console.log('\nPASS — every live hp-write site is an allowlisted HP-change / init path.')
}
