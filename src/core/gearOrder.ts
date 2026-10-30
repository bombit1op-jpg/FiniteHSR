// Pure ordering helpers for the gear selects in the team setup flow.
//
// Rule (user spec):
//   Cones:  signature -> same-path 5* -> same-path 4* -> other 5* -> other 4* -> (rest: 3*)
//   Relics: recommended sets first (in Fribbels priority order) -> the rest alphabetically
//   Planar: recommended ornaments first -> the rest alphabetically
//
// Static data lives in gear.ts (LIGHT_CONES / RELIC_SETS / PLANAR_SETS) and the
// generated gearPrefs.ts (signature cone id + recommended set ids per kit slug).
import { LIGHT_CONES, RELIC_SETS, PLANAR_SETS } from './gear'
import { GEAR_PREFS } from './gearPrefs'

export type Opt = [string, string]

const byName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, 'en')

const coneLabel = (c: { rarity: number; name: string }): string => `★${c.rarity} ${c.name}`

/** Named groups in priority order; ties broken alphabetically within a group. */
function partition<T extends { name: string }>(
  items: T[],
  match: Array<(x: T) => boolean>,
): T[] {
  const used = new Set<T>()
  const out: T[] = []
  for (const m of match) {
    const grp = items.filter(x => !used.has(x) && m(x)).sort(byName)
    for (const x of grp) { used.add(x); out.push(x) }
  }
  for (const x of items.filter(x => !used.has(x)).sort(byName)) out.push(x)
  return out
}

/** Ordered cone options for a kit: blank + signature/own-path first. */
export function coneOptions(slug: string, path: string): Opt[] {
  const sig = GEAR_PREFS[slug]?.signature
  const order = partition(LIGHT_CONES, [
    c => c.id === sig,
    c => c.path === path && c.rarity === 5,
    c => c.path === path && c.rarity === 4,
    c => c.path === path,
    c => c.rarity === 5,
    c => c.rarity === 4,
  ])
  return [['', '— Light Cone —'], ...order.map(c => [c.id, coneLabel(c)] as Opt)]
}

/** Ordered relic-set options: recommended first, rest alphabetical. */
export function relicOptions(slug: string, blank = '— None —'): Opt[] {
  const rec = GEAR_PREFS[slug]?.relics ?? []
  const rank = new Map(rec.map((id, i) => [id, i]))
  const order = [...RELIC_SETS].sort((a, b) => {
    const ra = rank.get(a.id) ?? Infinity
    const rb = rank.get(b.id) ?? Infinity
    return ra !== rb ? ra - rb : byName(a, b)
  })
  return [['', blank], ...order.map(s => [s.id, s.name] as Opt)]
}

/** Ordered planar-set options: recommended first, rest alphabetical. */
export function planarOptions(slug: string): Opt[] {
  const rec = GEAR_PREFS[slug]?.ornaments ?? []
  const rank = new Map(rec.map((id, i) => [id, i]))
  const order = [...PLANAR_SETS].sort((a, b) => {
    const ra = rank.get(a.id) ?? Infinity
    const rb = rank.get(b.id) ?? Infinity
    return ra !== rb ? ra - rb : byName(a, b)
  })
  return [['', '— None —'], ...order.map(s => [s.id, s.name] as Opt)]
}

/** The signature cone id for a kit, if any. */
export function signatureCone(slug: string): string | undefined {
  return GEAR_PREFS[slug]?.signature
}
