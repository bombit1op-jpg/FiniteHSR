/**
 * One-shot asset fetch: relic/planar piece icons -> `public/icons/relicpieces/<pieceName>.png`.
 *
 * The committed set-level icons (`relicsets/`, `planarsets/`) are one image per set; the game also
 * ships one image per piece. Raw `hsr-data/data/relicsets.json` enumerates the pieces but carries no
 * per-piece icon id, so the source is the StarRailRes datamine, whose per-relic `icon` field names
 * the file as `icon/relic/<setId>_<slot>.png` (relic: 0=HEAD 1=HAND 2=BODY 3=FOOT;
 * planar: 0=NECK 1=OBJECT). This script re-derives that deterministic slot order from the LOCAL set
 * ids (so it only fetches sets this project actually models) and saves each file under its READABLE
 * piece name (same convention as `relicsets/`), served at `/icons/relicpieces/...`.
 *
 * Not part of the build. Run manually after data/assets change:
 *   npx tsx src/core/fetch-relic-piece-icons.ts
 * Idempotent: existing files are skipped unless `--force` is passed.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const DATA = join(ROOT, 'hsr-data', 'data', 'relicsets.json')
const OUT_DIR = join(ROOT, 'public', 'icons', 'relicpieces')
const BASE = 'https://raw.githubusercontent.com/Mar-7th/StarRailRes/master/icon/relic'

interface RelicSet { id: string; parts: Record<string, { name: string }> }

const force = process.argv.includes('--force')

async function fetchWithRetry(url: string, tries = 5): Promise<Buffer> {
  let last = ''
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return Buffer.from(await r.arrayBuffer())
      last = `HTTP ${r.status}`
    } catch (e) { last = e instanceof Error ? e.message : String(e) }
    await new Promise(res => setTimeout(res, 300 * (i + 1)))
  }
  throw new Error(`fetch failed: ${url} (${last})`)
}

async function main(): Promise<void> {
  const sets = JSON.parse(readFileSync(DATA, 'utf8')) as Record<string, RelicSet>
  const ids = Object.keys(sets).sort()
  mkdirSync(OUT_DIR, { recursive: true })

  const jobs: Array<{ setId: string; slot: number; name: string; file: string }> = []
  for (const setId of ids) {
    const parts = Object.values(sets[setId].parts)
    parts.forEach((p, slot) => {
      jobs.push({ setId, slot, name: p.name, file: join(OUT_DIR, `${p.name}.png`) })
    })
  }

  let fetched = 0, skipped = 0, failed = 0
  // modest concurrency; the host enforces no rate limit but the network is flaky
  const CONC = 6
  for (let i = 0; i < jobs.length; i += CONC) {
    const batch = jobs.slice(i, i + CONC)
    await Promise.all(batch.map(async j => {
      if (!force && existsSync(j.file)) { skipped++; return }
      try {
        const buf = await fetchWithRetry(`${BASE}/${j.setId}_${j.slot}.png`)
        writeFileSync(j.file, buf)
        fetched++
      } catch (e) {
        failed++
        console.error(`FAIL ${j.setId}_${j.slot} (${j.name}): ${e instanceof Error ? e.message : e}`)
      }
    }))
    process.stdout.write(`\r${Math.min(i + CONC, jobs.length)}/${jobs.length}  fetched ${fetched} skipped ${skipped} failed ${failed}`)
  }
  process.stdout.write('\n')
  console.log(`done — sets ${ids.length}, files ${jobs.length} (fetched ${fetched}, skipped ${skipped}, failed ${failed})`)
  if (failed > 0) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exitCode = 1 })
