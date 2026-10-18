/**
 * ponytail-debt closed (2026-10-12).
 *
 * The §33/L244 registry tracked every `ponytail:` marker in `src/`. All 45 markers have been
 * resolved — each was either an engine mechanic now implemented, a stale note corrected against the
 * code, or a documented intentional decision / known deviation (the still-open mechanics live in
 * TODO.md §11). The registry file is gone; this guard keeps the debt at zero: a new `ponytail:`
 * marker in `src/` fails here and must be resolved (implement, or record as a deviation) rather than
 * re-accumulated.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { t, type Case } from '../suites'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

interface Marker { file: string; line: number; text: string }

function discover(): Marker[] {
  const out: Marker[] = []
  const rootAbs = ROOT.replace(/\\/g, '/')
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) { walk(p); continue }
      if (!e.name.endsWith('.ts')) continue
      const rel = p.replace(/\\/g, '/').replace(rootAbs + '/', '')
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/ponytail\s*:/i.test(l)) out.push({ file: rel, line: i + 1, text: l.trim() })
      })
    }
  }
  walk(join(ROOT, 'src'))
  return out
}

export default function (): Case[] {
  const markers = discover()
  return [
    t.ok('no ponytail: debt markers remain in src/',
      markers.length === 0,
      markers.map(m => `${m.file}:${m.line}`).join(', ')),
  ]
}
