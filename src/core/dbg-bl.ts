import * as fs from 'fs'
import * as path from 'path'

const lc = JSON.parse(fs.readFileSync(path.resolve('hsr-data/data/lightcones.json'), 'utf8'))
const arr = Array.isArray(lc) ? lc : ([lc] as any[])
let found: any = null
const walk = (o: any, k: string) => {
  if (found) return
  if (o && typeof o === 'object') {
    if (o.name && String(o.name).includes('Blink')) { found = o; return }
    if (o.id && String(o.id).includes('blink')) { found = o; return }
    for (const key of Object.keys(o)) walk(o[key], key)
  }
}
walk(arr, 'root')
console.log('FOUND:', found ? JSON.stringify(found) : 'none')
if (!found) {
  console.log('sample keys:', JSON.stringify(Object.keys(arr[0] ?? {})))
  console.log('sample:', JSON.stringify(arr[0] ?? {}).slice(0, 300))
  const names = arr.flatMap((c: any) => {
    const out: any[] = []
    if (c && c.skills) for (const a of Object.values(c.skills as any)) out.push(a)
    return out
  })
  const blink = names.find((s: any) => s?.name?.includes('Blink'))
  console.log('BLINK SKILL:', blink ? JSON.stringify(blink) : 'none')
}