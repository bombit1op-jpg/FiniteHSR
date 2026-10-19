import { Window } from 'happy-dom'
import { renderRecommendationReport } from '../../src/ui/optimizerPage'
import type { RecommendationReport } from '../../src/optimizer/recommend'

/**
 * Phase F — the recommendations surface renders exactly what the engine report says:
 * baseline, honest completeness badge, warnings, ranked rows, and an explicit empty state.
 * No battle is run here (the engine side is covered by tests/golden/optimizer/recommend.ts);
 * this suite pins the §9.8 rendering contract against a fabricated report object.
 */

const mkValues = (totalDamage: number): RecommendationReport['baselineValues'] => ({
  totalDamage, dps: totalDamage, dpa: totalDamage, burstDamage: totalDamage,
  cycles: 2, turns: 4, variance: NaN, survival: 1, healing: 0, shielding: 0,
  resourceEfficiency: 1, consistency: NaN,
})

const row = (rank: number, feasible: boolean, label: string, delta: number): RecommendationReport['rows'][number] => ({
  rank, label, kitId: label.split(' ')[0]!, team: [{ kitId: 'hook' }],
  metrics: { totalDamage: 1000 * rank, cycles: 2, spFinal: 3, survival: 1, events: 10 },
  values: mkValues(1000 * rank), constraints: [], feasible, delta,
  reason: feasible ? `изменение суммарный урон +${delta} — выше базового варианта` : 'не проходит ограничение cycles <= 0 (факт 2)',
})

export default () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.Event = (win as unknown as { Event: unknown }).Event

  doc.body.innerHTML = '<div id="fOut"></div>'
  const mount = () => doc.getElementById('fOut') as HTMLElement

  const full: RecommendationReport = {
    baselineLabel: 'hook [0|||musketeer|salsotto]',
    baselineValues: mkValues(3000), baselineTotalDamage: 3000,
    rows: [row(1, true, 'hook [1|secret_vow|2|musketeer||salsotto]', 500), row(2, false, 'hook [0|||||]', -100)],
    exhaustive: true, candidatesConsidered: 4, evaluated: 4, warnings: [],
  }
  renderRecommendationReport(full, mount(), 'totalDamage')

  const fullText = mount().textContent ?? ''
  const trs = mount().querySelectorAll('table:not(.kvTable) tbody tr').length
  const badged = mount().querySelector('.badge[data-s="pass"]') !== null
  const passBadge = fullText.includes('исследовано всё объявленное пространство')
  const warnDivs = mount().querySelectorAll('.warn').length

  // incomplete run: the honest "not a global optimum" badge + warning text must be visible
  const partial: RecommendationReport = {
    ...full,
    exhaustive: false, evaluated: 3, candidatesConsidered: 8,
    warnings: ['пространство ограничено maxCandidates=3: исследовано 3 из 8 кандидатов — рейтинг относится только к исследованному подмножеству, это не глобальный оптимум'],
    rows: [row(1, true, 'hook [1]', 50)],
  }
  renderRecommendationReport(partial, mount(), 'totalDamage')
  const partText = mount().textContent ?? ''
  const failBadge = partText.includes('НЕ полный поиск') && partText.includes('не глобальный оптимум')
  const warnShown = partText.includes('исследовано 3 из 8')

  // empty candidate set: explicit empty state, never a canned recommendation
  const empty: RecommendationReport = {
    ...full, rows: [], warnings: ['нет допустимых кандидатов для замены'], evaluated: 0, candidatesConsidered: 0,
  }
  renderRecommendationReport(empty, mount(), 'totalDamage')
  const emptyShown = (mount().querySelector('.emptyState')?.textContent ?? '').includes('Нет кандидатов') && mount().querySelector('table:not(.kvTable)') === null

  const checks: Array<[boolean, string]> = [
    [trs === 2, `ranked table has 2 rows (got ${trs})`],
    [passBadge, 'exhaustive run shows the pass badge'],
    [warnDivs === 0, 'no warnings on an exhaustive clean run'],
    [fullText.includes('Δ 500') || fullText.includes('+500'), 'delta visible in the variant cell'],
    [fullText.includes('не проходит ограничение'), 'infeasible row shows its failed constraint'],
    [badged, 'feasible badge class present'],
    [failBadge, 'incomplete run shows the honest fail badge'],
    [warnShown, 'incomplete run shows the exact "explored N of M" warning'],
    [emptyShown, 'empty candidate set renders the explicit empty state, no table'],
  ]
  return checks.map(([ok, label]) => ({ name: label, ok }))
}
