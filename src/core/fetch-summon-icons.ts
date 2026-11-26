import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '..', '..')
const MANIFEST_PATH = join(ROOT, 'public', 'icons', '_manifest.json')
const ICON_ROOT = join(ROOT, 'public', 'icons')

type Target = {
  name: string
  file?: string
  alias?: string
  hash?: string
}

type Group = {
  key: 'summons' | 'memosprites'
  label: string
  targets: Target[]
}

const GROUPS: Group[] = [
  {
    key: 'summons',
    label: 'Иконки призывов',
    targets: [
      { name: 'Fuyuan', alias: 'characters/Character Lingsha Icon.png' },
      { name: 'Lightning-Lord', file: 'File:NPC Lightning Lord Icon.png' },
      { name: 'Numby', alias: 'characters/Character Topaz & Numby Icon.png' },
      { name: 'Souldragon', alias: 'characters/Character Blade Icon.png' },
    ],
  },
  {
    key: 'memosprites',
    label: 'Иконки мемоспрайтов',
    targets: [
      { name: 'Demiurge', hash: 'da0121fb9b3ff5f6c507c317b057cadf' },
      { name: 'Evey', hash: 'b17e1c291b40b394c419f8413580085c' },
      { name: 'Garmentmaker', hash: '6d8902c134c7081bff8bb612706cc2a6' },
      { name: 'Little Ica', hash: '2ed31ff4b19918fa4da53189a6e470a6' },
      { name: 'Mem', hash: 'aeb4fcbb86feea32f9d1ec9b48a3efcb' },
      { name: 'Netherwing: Pollux', hash: '4c18de01a63a1f08cb26600200e16fac' },
      { name: 'Summer Songbirds', hash: 'd2677b7fdfd845f7737555cc557c6502' },
    ],
  },
]

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

async function fetchImageUrl(fileTitle: string): Promise<string | null> {
  const url = `https://honkai-star-rail.fandom.com/api.php?action=query&titles=${encodeURIComponent(fileTitle)}&prop=imageinfo&iiprop=url&redirects=1&format=json`
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0 (https://github.com/bombit1op-jpg/FiniteHSR)' } })
  if (!res.ok) throw new Error(`API failed ${res.status}: ${fileTitle}`)
  const data = await res.json() as {
    query?: { pages?: Record<string, { imageinfo?: Array<{ url: string }> }> }
  }
  for (const page of Object.values(data.query?.pages ?? {})) {
    const imageUrl = page.imageinfo?.[0]?.url
    if (imageUrl) return imageUrl
  }
  return null
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'FiniteHSR/1.0' } })
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Record<string, { label: string; count: number; icons: Array<{ file: string; name: string }> }>

  let downloaded = 0
  let skipped = 0

  for (const group of GROUPS) {
    const dir = join(ICON_ROOT, group.key)
    mkdirSync(dir, { recursive: true })
    const icons: Array<{ file: string; name: string }> = []

    for (const target of group.targets) {
      if (target.hash) {
        const rel = `${group.key}/${sanitize(target.name)}.png`
        const dest = join(ICON_ROOT, rel)
        await download(`https://cdn.gachabase.net/hsr/assets/${target.hash}.png`, dest)
        icons.push({ file: rel, name: target.name })
        downloaded++
        await new Promise(resolve => setTimeout(resolve, 150))
        continue
      }
      if (target.alias) {
        if (!existsSync(join(ICON_ROOT, target.alias))) throw new Error(`Alias missing: ${target.alias}`)
        icons.push({ file: target.alias, name: target.name })
        skipped++
        continue
      }
      if (!target.file) throw new Error(`No source for ${target.name}`)

      const rel = `${group.key}/${sanitize(target.name)}.png`
      const dest = join(ICON_ROOT, rel)
      if (existsSync(dest)) {
        icons.push({ file: rel, name: target.name })
        skipped++
        continue
      }

      const imageUrl = await fetchImageUrl(target.file)
      if (!imageUrl) throw new Error(`Image not found: ${target.file}`)
      await download(imageUrl, dest)
      icons.push({ file: rel, name: target.name })
      downloaded++
      await new Promise(resolve => setTimeout(resolve, 150))
    }

    icons.sort((a, b) => a.name.localeCompare(b.name))
    manifest[group.key] = { label: group.label, count: icons.length, icons }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

  const result = spawnSync('npx', ['tsx', 'src/core/gen-icon-manifest.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) throw new Error('gen-icon-manifest.ts failed')

  console.log(`Done. Downloaded: ${downloaded}, reused: ${skipped}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
