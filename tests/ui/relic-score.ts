import { Window } from 'happy-dom'
import { case_ as ok } from '../suites'
import { scoreRelic, pctToRating, buildMeta, computeOptimalScore } from '../../src/core/relicScore'
import { RELIC_WEIGHTS } from '../../src/core/relicWeights'
import { subCubes, updateSubCubes, ratingTierClass } from '../../src/ui/icons'
import { KITS } from '../../src/core/kits'

/**
 * Relic rating (ported from Fribbels): per-relic percent score -> letter grade (F..AEON), plus the
 * green quality cubes. Weights are imported verbatim into RELIC_WEIGHTS; scoring must stay scale-free
 * and gate AEON / wrong-main correctly.
 */
export default () => {
  const cases: ReturnType<typeof ok>[] = []
  const c = (name: string, cond: boolean, detail = '') => cases.push(ok(name, cond, detail))

  // ---- weights table covers every kit
  c('weights cover all kits', KITS.every(k => !!RELIC_WEIGHTS[k.id]), `${KITS.length} kits`)
  c('weights are 0..1', Object.values(RELIC_WEIGHTS).every(m =>
    Object.values(m.stats).every(w => w >= 0 && w <= 1)))

  // ---- known meta: Seele (cd/cr/spd at 1, atkPct 0.75); flat derived = pct*0.4
  const seeleMeta = buildMeta('seele')!
  c('seele critDmg weight = 1', seeleMeta.stats['critDmg'] === 1)
  c('seele atkPct weight = 0.75', seeleMeta.stats['atkPct'] === 0.75)
  c('seele flat atk derived = 0.3', Math.abs((seeleMeta.stats['atkFlat'] ?? 0) - 0.3) < 1e-9)

  // ---- perfect high-roll relic scores > 0 and grades above S
  const perfect = [
    { stat: 'critRate', tier: 2 as const, rolls: 1 },
    { stat: 'critDmg', tier: 2 as const, rolls: 1 },
    { stat: 'spd', tier: 2 as const, rolls: 1 },
    { stat: 'atkPct', tier: 2 as const, rolls: 1 },
  ]
  const s = scoreRelic('seele', 'body', 'critDmg', perfect)
  c('perfect seele pct in (0,100]', s.pct > 0 && s.pct <= 100, `${s.pct}`)
  c('perfect seele rating is a letter', /^[A-Z]+[+]?$/.test(s.rating), s.rating)

  // ---- empty relic -> '?'
  c('no subs -> ?', scoreRelic('seele', 'body', 'critDmg', []).rating === '?')

  // ---- wrong main gate: body/hp main is not a Seele ideal -> '?'
  const wrongMain = scoreRelic('seele', 'body', 'hpPct', perfect).rating
  c('wrong main -> ?', wrongMain === '?', wrongMain)

  // ---- head/hands have no selectable main -> never gated by main
  const headScore = scoreRelic('seele', 'head', 'hpFlat', [
    { stat: 'critRate', tier: 2, rolls: 1 },
    { stat: 'critDmg', tier: 2, rolls: 1 },
  ])
  c('head not main-gated', headScore.rating !== '?', headScore.rating)

  // ---- AEON requires verified; WTF+ otherwise
  c('unverified 95% -> WTF+', pctToRating(95, 'body', true, false) === 'WTF+')
  c('verified 95% -> AEON', pctToRating(95, 'body', true, true) === 'AEON')

  // ---- CHETAH: overflow tier above AEON at pct >= 100 (verified only)
  c('verified 100% -> CHETAH', pctToRating(100, 'body', true, true) === 'CHETAH')
  c('verified 99% -> AEON', pctToRating(99, 'body', true, true) === 'AEON')
  c('unverified 100% -> WTF+', pctToRating(100, 'body', true, false) === 'WTF+')

  // ---- tier boundaries (each grade = 5%)
  c('pct 30 -> B', pctToRating(30, 'body', true) === 'B')
  c('pct 45 -> A+', pctToRating(45, 'body', true) === 'A+')
  c('pct 80 -> WTF', pctToRating(80, 'body', true) === 'WTF')

  // ---- optimal score is finite when substats exist
  const opt = computeOptimalScore('body', 'critDmg', seeleMeta)
  c('optimal score finite', Number.isFinite(opt) && opt > 0, `${opt}`)

  // ---- cubes: DOM + reduced count
  const win = new Window({ url: 'http://localhost/' })
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = win.document as unknown as Document
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement

  const cubes = subCubes(3, 2)
  const on = cubes.querySelectorAll('.subCube.on').length
  c('cubes: 6 cells', cubes.querySelectorAll('.subCube').length === 6)
  c('cubes: 3 lit for 3 rolls', on === 3, `${on}`)
  updateSubCubes(cubes, 6, 0)
  c('cubes: clamp/recolor', cubes.querySelectorAll('.subCube.on').length === 6 && cubes.dataset.tier === '0')

  c('ratingTierClass AEON = perfect', ratingTierClass('AEON') === 'r-perfect')
  c('ratingTierClass CHETAH = chetah', ratingTierClass('CHETAH') === 'r-chetah')
  c('ratingTierClass ? = low', ratingTierClass('?') === 'r-low')

  return cases
}
