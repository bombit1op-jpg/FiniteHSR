import { buildGear, blockFor, sheetBlockFor } from '../../../src/core/debug-presets'
import { aggregateGear, SLOT_MAINS, SUBSTAT_TIERS } from '../../../src/core/gear'
import { KIT_PATH } from '../../../src/core/kits'
import { t, type Case } from '../../suites'
import type { BaseStats } from '../../../src/core/entities/Unit'

/**
 * Relic generation verification (guide §34.1 / §19.2 "Generation"): the allocator must emit six
 * legal pieces in slot order, each with a slot-legal main, four substat lines, an in-range roll
 * budget, no main-on-substat, and the sheet's Desire rolls fully placed; the 4pc cavern set and
 * the 2pc planar set must activate. These are STRUCTURAL rules, so they hold for all 93 kits on
 * both the HunterKee-workbook path and the synthesized 25-roll fallback — not hand-pinned numbers.
 */
const SLOTS = ['head', 'hands', 'body', 'feet', 'sphere', 'rope'] as const

const stats = (path?: string): BaseStats => ({ level: 80, hp: 8000, atk: 4000, def: 600, spd: 100, path })

export default (): Case[] => {
  const kids = Object.keys(KIT_PATH)
  const cases: Case[] = []

  let six = true, order = true, main = true, mainSub = true, lines = true
  let legal = true, budget = true, sets = true, synth = true
  const note: string[] = []
  const bad = (rule: string, msg: string) => { note.push(`${rule}:${msg}`) }

  for (const kid of kids) {
    const g = buildGear(kid)
    const pieces = g.pieces ?? []
    if (pieces.length !== 6) { six = false; bad('six', `${kid}=${pieces.length}`) }
    if (JSON.stringify(pieces.map(p => p.slot)) !== JSON.stringify(SLOTS)) { order = false; bad('order', kid) }

    const placed: Record<string, number> = {}
    for (const p of pieces) {
      if (!SLOT_MAINS[p.slot].includes(p.main)) { main = false; bad('main', `${kid} ${p.slot}=${p.main}`) }
      if (p.subs.some(s => s.stat === p.main)) { mainSub = false; bad('mainSub', `${kid} ${p.slot}=${p.main}`) }
      if (p.subs.length !== 4) { lines = false; bad('lines', `${kid} ${p.slot}=${p.subs.length}`) }
      let pr = 0
      for (const s of p.subs) {
        const spread = s.spread ?? []
        if (!(s.stat in SUBSTAT_TIERS) || (spread.length && (spread.length !== s.rolls || spread.some(x => x !== 0 && x !== 1 && x !== 2))))
          { legal = false; bad('legal', `${kid} ${s.stat}`) }
        pr += s.rolls
        placed[s.stat] = (placed[s.stat] ?? 0) + s.rolls
      }
      if (pr !== 8 && pr !== 9) { budget = false; bad('rolls', `${kid} ${p.slot}=${pr}`) }
    }
    const total = pieces.reduce((a, p) => a + p.subs.reduce((b, s) => b + s.rolls, 0), 0)
    if (total < 48 || total > 54) { budget = false; bad('total', `${kid}=${total}`) }

    const desire = blockFor(kid).desire
    for (const [stat, n] of Object.entries(desire))
      if (n > 0 && stat in SUBSTAT_TIERS && (placed[stat] ?? 0) < n) { budget = false; bad('desire', `${kid} ${stat}=${placed[stat] ?? 0}<${n}`) }
    if (sheetBlockFor(kid) === undefined && Object.values(desire).reduce((a, b) => a + b, 0) !== 25)
      { synth = false; bad('synth25', kid) }

    const agg = aggregateGear(g, stats(KIT_PATH[kid]))
    const cavern = pieces[0].setId
    if (!agg.relicSets.some(s => s.id === cavern) || !(agg.relicSets4 ?? []).some(s => s.id === cavern))
      { sets = false; bad('4pc', `${kid}=${cavern}`) }
    const planar = pieces[4].setId
    if (agg.planar?.id !== planar) { sets = false; bad('planar', `${kid} ${agg.planar?.id}!=${planar}`) }
  }

  const where = `${kids.length} kits` + (note.length ? `; e.g. ${note.slice(0, 3).join(', ')}` : ' — all pass')
  cases.push(t.ok('six legal pieces, slots in order head→rope', six && order, where))
  cases.push(t.ok('every main stat is legal for its slot', main, where))
  cases.push(t.ok('a piece main is never also one of its substats', mainSub, where))
  cases.push(t.ok('exactly four substat lines per piece', lines, where))
  cases.push(t.ok('substat legality (known stat, tier 0/1/2 per-roll spread)', legal, where))
  cases.push(t.ok('per-piece roll budget 8|9 (48..54 rolls per set)', budget, where))
  cases.push(t.ok("sheet Desire rolls fully placed (occurrence budget)", budget && synth, where))
  cases.push(t.ok('4pc cavern set + 2pc planar set both activate', sets, where))
  cases.push(t.ok('synthesized path budgets exactly 25 rolls', synth, where))

  const hook = buildGear('hook')
  const hookPieces = hook.pieces ?? []
  const one = aggregateGear({ ...hook, pieces: [hookPieces[0]] }, stats(KIT_PATH['hook']))
  const full = aggregateGear(hook, stats(KIT_PATH['hook']))
  cases.push(t.ok('one cavern piece does not activate the 4pc bonus', (one.relicSets4 ?? []).length === 0, `${(one.relicSets4 ?? []).length}`))
  cases.push(t.ok('four cavern pieces activate the 4pc bonus', (full.relicSets4 ?? []).length === 1, `${(full.relicSets4 ?? []).length}`))

  return cases
}
