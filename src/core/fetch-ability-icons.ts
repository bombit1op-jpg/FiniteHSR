/**
 * Fetch skill icons from HSR Fandom and save to public/icons/abilities/
 * Run: npx tsx src/core/fetch-ability-icons.ts
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ABILITY_NAMES } from './abilityNames'

const ROOT = join(import.meta.dirname, '..', '..')
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json')
const ABILITIES_DIR = join(ROOT, 'public', 'icons', 'abilities')

if (!existsSync(ABILITIES_DIR)) mkdirSync(ABILITIES_DIR, { recursive: true })

// collect unique ability names from ABILITY_NAMES
const names = new Set<string>()
for (const m of Object.values(ABILITY_NAMES)) {
  for (const n of Object.values(m)) if (n) names.add(n)
}
console.log(`Unique ability names: ${names.size}`)

// sanitize filename for Windows
function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

// Fandom API fetch
async function fetchImageUrl(name: string): Promise<string | null> {
  const title = `File:Ability ${encodeURIComponent(name)}.png`
  const url = `https://honkai-star-rail.fandom.com/api.php?action=query&titles=${title}&prop=imageinfo&iiprop=url&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0 (https://github.com/bombit1op-jpg/FiniteHSR)' } })
  const data = await res.json()
  const pages = data.query?.pages
  if (!pages) return null
  for (const page of Object.values(pages)) {
    if ((page as any).imageinfo?.[0]?.url) return (page as any).imageinfo[0].url
  }
  return null
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } })
  if (!res.ok) throw new Error(`Download failed ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  writeFileSync(dest, buf)
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const abilitiesCat = manifest.abilities || { label: 'Иконки навыков', count: 0, icons: [] }
  const existingFiles = new Set(abilitiesCat.icons.map((i: any) => i.file))

  let added = 0
  let skipped = 0
  let errors = 0

  const nameArray = [...names].sort()
  for (let i = 0; i < nameArray.length; i += 50) {
    const batch = nameArray.slice(i, i + 50)
    console.log(`Batch ${i / 50 + 1}/${Math.ceil(nameArray.length / 50)} (${batch.length})`)

    // fetch urls in parallel
    const results = await Promise.allSettled(batch.map(async name => {
      const url = await fetchImageUrl(name)
      if (!url) return { name, url: null }
      const safeName = sanitize(name)
      const dest = join(ABILITIES_DIR, `${safeName}.png`)
      if (existsSync(dest)) {
        skipped++
        return { name, url, dest, skipped: true }
      }
      try {
        await download(url, dest)
        return { name, url, dest }
      } catch (e) {
        errors++
        console.error(`  ✗ ${name}: ${e}`)
        return { name, url, error: e }
      }
    }))

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const v = r.value
        if (v.skipped) continue
        if (v.url && v.dest && !existingFiles.has(`abilities/${sanitize(v.name)}.png`)) {
          abilitiesCat.icons.push({ file: `abilities/${sanitize(v.name)}.png`, name: v.name })
          existingFiles.add(`abilities/${sanitize(v.name)}.png`)
          added++
        }
      }
    }
    // polite delay
    await new Promise(r => setTimeout(r, 500))
  }

  abilitiesCat.count = abilitiesCat.icons.length
  abilitiesCat.label = 'Иконки навыков'
  manifest.abilities = abilitiesCat
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`Done. Added: ${added}, Skipped (existing): ${skipped}, Errors: ${errors}`)
}

main().catch(e => { console.error(e); process.exit(1) })