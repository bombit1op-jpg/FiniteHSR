/**
 * §45 lab — ponytail guard.
 * Requirement §45: the laboratory must stay free of `ponytail:` simplification markers (a lab is
 * a permanent invariant check, not a place to park "good enough for now" shortcuts). Scans every
 * sibling `debug/lab/*.ts` and fails if a marker is found. The marker is assembled at runtime so
 * this file's own source does not contain the literal it forbids.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { eq, isEntry, ok, report, type LabCase } from './harness'

export function guardLab(): LabCase[] {
  const dir = dirname(fileURLToPath(import.meta.url))
  const marker = new RegExp('pony' + 'tail\\s*:', 'i')
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && f !== 'guard.ts')
  const offenders: string[] = []
  for (const f of files) {
    const hits = readFileSync(join(dir, f), 'utf8').split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(x => marker.test(x.line))
    if (hits.length) offenders.push(`${f}:${hits[0].n}`)
  }
  return [
    ok('scans at least one lab file', files.length > 0),
    eq('no ponytail markers in debug/lab/', offenders.length, 0),
    ok('no offenders (detail)', offenders.length === 0, offenders.join(', '))
  ]
}

if (isEntry('guard.ts')) process.exitCode = report('Ponytail guard (§45)', guardLab())
