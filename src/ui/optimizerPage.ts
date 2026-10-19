/**
 * §84.12 — Optimizer workspace.
 *
 * §84.12 non-negotiables encoded here:
 *  - the problem is shown BEFORE running: exact search space + candidate count, objective,
 *    constraints, algorithm, every explicit option, seed — nothing hidden in a UI default;
 *  - the algorithm's effective options (beam width, shortlist, sample counts) are echoed before the
 *    run AND in the saved result;
 *  - a "global optimum" claim is only allowed with an exhaustive run, or a correctness report
 *    (mcReport / jointReport `match`) against the same space;
 *  - search limitations / pruning are shown, not glossed.
 *
 * All scoring is engine-backed (`evaluateSpace` / `beamSearch` / `mcReport` / `jointReport` /
 * `teamRankTable`); the workspace only assembles the `SearchSpace` and renders the returned objects.
 */
import {
  candidateCount, OBJECTIVE_DIRECTION, memberBuilds,
  type SearchSpace, type CharacterPool, type Objective, type ObjectiveMetric, type ObjectiveConstraint,
  type FullTeamConfig,
} from '../optimizer/space'
import { ENCOUNTER_PRESETS } from '../core/battle'
import type { EncounterSpec } from '../core/encounter'
import { evaluateSpace, rank, bruteForce, type ScoredCandidate } from '../optimizer/search'
import { beamSearch, pruningReport } from '../optimizer/beam'
import { mcReport, objectiveUsesMultiRun } from '../optimizer/mc'
import { jointReport } from '../optimizer/joint'
import { teamRankTable } from '../optimizer/encounter'
import { buildRecommendations, replacementRecommendations, type RecommendationContext, type RecommendationReport } from '../optimizer/recommend'
import { collect } from './team'
import { KITS } from '../core/kits'
import { withBusy } from './shell'
import { button, emptyState, jsonBlock, kv, n, label, row, select, table, title, badge, type Status } from './render'
import { el } from './dom'

type Algorithm = 'exhaustive' | 'topk' | 'beam' | 'mcReport' | 'jointReport' | 'crossEncounter'

const METRICS = Object.keys(OBJECTIVE_DIRECTION) as ObjectiveMetric[]
const OPS: ObjectiveConstraint['op'][] = ['>=', '<=', '>', '<']

const ALGORITHMS: Array<[Algorithm, string]> = [
  ['exhaustive', 'exhaustive (bruteForce) — глобальный оптимум по объявленному пространству'],
  ['topk', 'top-K (exhaustive, первые K)'],
  ['beam', 'beam search (ширина задаётся явно, не дефолт)'],
  ['mcReport', 'MC-assisted (2 стадии) + отчёт о корректности против brute force'],
  ['jointReport', 'joint build-optimization + отчёт о корректности'],
  ['crossEncounter', 'кросс-столкновенческий ранкинг (teamRankTable)'],
]

const teamKey = (c: FullTeamConfig): string =>
  c.members.map(m => {
    const b = m.build ?? {}
    const gear = [b.eidolon ? `E${b.eidolon}` : '', b.cone ? `${b.cone}${b.si ? `@S${b.si}` : ''}` : '', b.relic ?? '', b.planar ?? ''].filter(Boolean).join('/')
    return `${m.kitId}${gear ? `[${gear}]` : ''}`
  }).join(' + ')

/** §84.12/phase F — render one recommendation report: baseline, honesty badges, ranked table. */
export function renderRecommendationReport(report: RecommendationReport, mount: HTMLElement, primary: string): void {
  mount.innerHTML = ''
  mount.append(
    kv([
      ['baseline', `${report.baselineLabel} — ${primary} ${n((report.baselineValues as Record<string, number>)[primary] ?? 0, 2)}, суммарный урон ${n(report.baselineTotalDamage, 0)}`],
      ['кандидатов объявлено / оценено', `${report.candidatesConsidered} / ${report.evaluated}`],
    ]),
    report.exhaustive
      ? badge('исследовано всё объявленное пространство', 'pass')
      : badge('НЕ полный поиск: рейтинг относится только к исследованному подмножеству — не глобальный оптимум', 'fail'),
  )
  for (const w of report.warnings) {
    const d = el('div', 'warn')
    d.textContent = `⚠ ${w}`
    mount.append(d)
  }
  if (!report.rows.length) {
    mount.append(emptyState('Нет кандидатов для сравнения — см. предупреждения выше.'))
    return
  }
  mount.append(table(
    ['#', 'feasible', `вариант (Δ ${primary})`, 'totalDamage', 'причина'],
    report.rows.map(r => [
      r.rank,
      badge(r.feasible ? 'feasible' : 'pruned', r.feasible ? 'pass' : 'warn'),
      `${r.label}  [Δ ${n(r.delta, 2)}]`,
      n(r.metrics.totalDamage, 0),
      r.reason,
    ]),
  ))
}

export function initOptimizer(): void {
  const root = document.getElementById('optimizerWs')
  if (!root) return
  root.innerHTML = ''

  // ---------------- problem inputs (explicit, nothing hidden)
  const memberBox = el('div', 'listBox')
  const checks = new Map<string, HTMLInputElement>()
  for (const k of KITS) {
    const l = el('label', 'chk')
    const c = el('input') as HTMLInputElement
    c.type = 'checkbox'; c.value = k.id
    c.checked = ['seele', 'sparkle', 'bronya', 'fu_xuan'].includes(k.id)
    const t = el('span'); t.textContent = `${k.name} (${k.id})`
    l.append(c, t); memberBox.append(l); checks.set(k.id, c)
  }
  const teamSizeIn = el('input') as HTMLInputElement
  teamSizeIn.type = 'number'; teamSizeIn.min = '1'; teamSizeIn.max = '4'; teamSizeIn.value = '4'

  const encSel = select(Object.keys(ENCOUNTER_PRESETS).map(id => [id, `${id} — ${ENCOUNTER_PRESETS[id]!.mode ?? ''} (cycles ${ENCOUNTER_PRESETS[id]!.cycles ?? '—'})`]))

  const seedIn = el('input') as HTMLInputElement
  seedIn.type = 'number'; seedIn.value = '7'

  const primarySel = select(METRICS.map(m => [m, `${m} (${OBJECTIVE_DIRECTION[m]})`]))
  primarySel.value = 'totalDamage'

  const maxCandIn = el('input') as HTMLInputElement
  maxCandIn.type = 'number'; maxCandIn.value = '5000'
  const kIn = el('input') as HTMLInputElement
  kIn.type = 'number'; kIn.value = '10'; kIn.min = '1'
  const widthIn = el('input') as HTMLInputElement
  widthIn.type = 'number'; widthIn.value = '8'; widthIn.min = '1'
  const shortlistIn = el('input') as HTMLInputElement
  shortlistIn.type = 'number'; shortlistIn.value = '8'; shortlistIn.min = '1'
  const screenIn = el('input') as HTMLInputElement
  screenIn.type = 'number'; screenIn.value = '2'; screenIn.min = '1'
  const finalIn = el('input') as HTMLInputElement
  finalIn.type = 'number'; finalIn.value = '6'; finalIn.min = '1'
  const algSel = select(ALGORITHMS)
  const teamIdsIn = el('input') as HTMLInputElement
  teamIdsIn.placeholder = 'kitId,kitId (для jointReport)'
  const crossEncs = select(Object.keys(ENCOUNTER_PRESETS).map(id => [id, id]))
  crossEncs.multiple = true
  for (const o of Array.from(crossEncs.options)) o.selected = o.value === 'mob' || o.value === 'boss'

  // constraints editor
  const cMetric = select(METRICS.map(m => [m, m]))
  const cOp = select(OPS.map(o => [o, o]))
  const cVal = el('input') as HTMLInputElement
  cVal.type = 'number'; cVal.value = '1'
  const constraints: ObjectiveConstraint[] = []
  const cList = el('div', 'listBox')
  const drawConstraints = (): void => {
    cList.innerHTML = ''
    if (!constraints.length) {
      const d = el('span', 'dim'); d.textContent = 'нет ограничений'; cList.append(d); return
    }
    constraints.forEach((c, i) => {
      const s = el('span', 'chip')
      s.textContent = `${c.metric} ${c.op} ${c.value}`
      const x = button('×', () => { constraints.splice(i, 1); drawConstraints() }, 'btn-mini')
      s.append(x); cList.append(s)
    })
  }
  drawConstraints()

  const inputs = el('div')
  inputs.append(
    title('Пространство поиска (§80.4)', 'объявляется явно: участники + их билд-оболочка, столкновение, seed, цель'),
    row(label('Участники (пул)', el('div'))),
    memberBox,
    row(
      label('teamSize', teamSizeIn),
      label('Столкновение', encSel),
      label('seed', seedIn),
      label('maxCandidates', maxCandIn),
    ),
    title('Цель (§74)', 'ГЛАВНАЯ метрика и направление — не UI-дефолт, а часть задачи'),
    row(label('primary', primarySel)),
    row(label('constraint metric', cMetric), label('op', cOp), label('value', cVal), button('Добавить ограничение', () => {
      constraints.push({ metric: cMetric.value as ObjectiveMetric, op: cOp.value as ObjectiveConstraint['op'], value: Number(cVal.value) })
      drawConstraints()
    })),
    cList,
    title('Алгоритм и его эффективные опции', 'beam width / shortlist / sample counts показываются до запуска и в результате'),
    row(
      label('Алгоритм', algSel),
      label('K (topk)', kIn),
      label('beam width', widthIn),
      label('MC shortlist', shortlistIn),
      label('MC screenSamples', screenIn),
      label('MC finalSamples', finalIn),
    ),
    row(label('jointReport teamIds', teamIdsIn), label('cross-encounters', crossEncs)),
  )

  const preBox = el('div', 'wsBody')
  const outBox = el('div', 'wsBody')
  const runBtn = button('Запустить поиск', async () => { await withBusy('Оптимизация…', () => run()) }, 'btn-primary')
  const validateBtn = button('Проверка против brute force (то же пространство)', async () => {
    await withBusy('brute force reference…', () => validateAgainstBrute())
  })

  root.append(inputs, row(runBtn, validateBtn), preBox, outBox)

  // ---------------- phase F: recommendations (F1 build / F2 replacement) on this page
  const fSlot = el('select') as HTMLSelectElement
  const fEid = el('input') as HTMLInputElement; fEid.value = '0,1'; fEid.placeholder = 'напр. 0,1,2'
  const fCones = el('input') as HTMLInputElement; fCones.placeholder = 'cone ids через запятую'
  const fSi = el('input') as HTMLInputElement; fSi.value = '1,2'; fSi.placeholder = 'напр. 1,2'
  const fRelics = el('input') as HTMLInputElement; fRelics.placeholder = 'relic set ids через запятую'
  const fPlanars = el('input') as HTMLInputElement; fPlanars.placeholder = 'planar set ids через запятую'
  const fCands = el('input') as HTMLInputElement; fCands.value = 'pela,luocha'; fCands.placeholder = 'kitId,kitId кандидатов на замену'
  const fOut = el('div', 'wsBody')
  const parseList = (s: string): string[] => s.split(',').map(x => x.trim()).filter(Boolean)
  const numList = (s: string): number[] => parseList(s).map(Number).filter(x => Number.isFinite(x))
  function refreshSlot(): void {
    const team = collect().team
    fSlot.innerHTML = ''
    team.forEach((m, i) => {
      const o = el('option') as HTMLOptionElement
      o.value = String(i); o.textContent = `${i}: ${m.kitId}`
      fSlot.append(o)
    })
  }
  function fContext(): RecommendationContext {
    return {
      team: collect().team,
      slot: Math.max(0, Math.min(Number(fSlot.value) || 0, collect().team.length - 1)),
      encounter: ENCOUNTER_PRESETS[encSel.value] as EncounterSpec,
      seed: Number(seedIn.value) || 0,
      objective: { primary: primarySel.value as ObjectiveMetric },
      maxCandidates: Number(maxCandIn.value) || undefined,
    }
  }
  const fNoTeam = (): void => { fOut.innerHTML = ''; fOut.append(emptyState('Соберите команду в Team Builder — рекомендации сравнивают её с вариантами.')) }
  const runF1 = async (): Promise<void> => {
    await withBusy('F1: подбор сборки (production-симуляция каждого кандидата)…', () => {
      const team = collect().team
      if (!team.length) { fNoTeam(); return }
      refreshSlot()
      const ctx = fContext()
      const pool: CharacterPool = {
        id: team[ctx.slot]!.kitId,
        eidolons: numList(fEid.value), cones: parseList(fCones.value), si: numList(fSi.value),
        relicSets: parseList(fRelics.value), planarSets: parseList(fPlanars.value),
      }
      fOut.innerHTML = ''
      renderRecommendationReport(buildRecommendations(ctx, pool), fOut, ctx.objective.primary)
    })
  }
  const runF2 = async (): Promise<void> => {
    await withBusy('F2: ранжирование замен (production-симуляция каждого кандидата)…', () => {
      const team = collect().team
      if (!team.length) { fNoTeam(); return }
      refreshSlot()
      const ctx = fContext()
      const candidates: CharacterPool[] = parseList(fCands.value).filter(id => id !== team[ctx.slot]!.kitId).map(id => ({ id }))
      fOut.innerHTML = ''
      renderRecommendationReport(replacementRecommendations(ctx, candidates), fOut, ctx.objective.primary)
    })
  }
  const fHint = el('span', 'dim')
  fHint.textContent = 'пул кандидатов = разрешённый каталог (CharacterPool), не инвентарь аккаунта; для F2 кандидат участвует со своим дефолтным билдом из пула'
  root.append(
    title('Рекомендации (фаза F)', 'F1 — билд одного персонажа; F2 — замены в слоте. Кандидаты оцениваются production-симулятором на ОДНИХ И ТЕХ ЖЕ encounter/seed/правилах; baseline — текущая команда из Team Builder'),
    row(label('слот', fSlot), label('eidolons', fEid), label('cones', fCones), label('SI', fSi), label('relicSets', fRelics), label('planarSets', fPlanars)),
    row(button('F1: подобрать сборку', runF1, 'btn-primary')),
    row(label('кандидаты (F2)', fCands), button('F2: ранжировать замены', runF2, 'btn-primary')),
    row(fHint),
    fOut,
  )
  refreshSlot()

  // ---------------- space assembly
  function buildSpace(): SearchSpace {
    const ids = [...checks.entries()].filter(([, c]) => c.checked).map(([id]) => id)
    const members: CharacterPool[] = ids.map(id => ({ id }))
    const enc = ENCOUNTER_PRESETS[encSel.value] as EncounterSpec
    const objective: Objective = { primary: primarySel.value as ObjectiveMetric }
    if (constraints.length) objective.constraints = constraints.map(c => ({ ...c }))
    return {
      members,
      teamSize: Math.max(1, Math.min(Number(teamSizeIn.value) || 1, Math.max(1, members.length))),
      encounter: enc,
      seed: Number(seedIn.value) || 0,
      objective,
      maxCandidates: Number(maxCandIn.value) || undefined,
    }
  }

  /** the exact options that will be used — rendered before AND after the run (§84.12) */
  function effectiveOptions(space: SearchSpace): Array<[string, string]> {
    const alg = algSel.value as Algorithm
    const rows: Array<[string, string]> = [
      ['algorithm', alg],
      ['objective', `${space.objective.primary} (${OBJECTIVE_DIRECTION[space.objective.primary]})`],
      ['constraints', space.objective.constraints?.map(c => `${c.metric} ${c.op} ${c.value}`).join('; ') || 'нет'],
      ['seed', String(space.seed)],
      ['encounter', `${space.encounter.id} (cycles ${space.encounter.cycles ?? '—'}, waves ${space.encounter.waves.length})`],
      ['teamSize', String(space.teamSize)],
      ['пул участников', String(space.members.length)],
      ['builds на участника', space.members.map(m => `${m.id}:${memberBuilds(m).length}`).join(', ')],
      ['log', 'off (search не пишет события — массовый прогон)'],
    ]
    if (alg === 'topk') rows.push(['K', kIn.value])
    if (alg === 'beam') rows.push(['beam width', widthIn.value])
    if (alg === 'mcReport') rows.push(['shortlist', shortlistIn.value], ['screenSamples', screenIn.value], ['finalSamples', finalIn.value], ['objectiveUsesMultiRun', String(objectiveUsesMultiRun(space.objective))])
    if (alg === 'jointReport') rows.push(['teamIds', teamIdsIn.value || '(из пула, первые teamSize)'])
    if (alg === 'crossEncounter') rows.push(['encounters', selectedEncounters().join(', ')])
    return rows
  }

  function selectedEncounters(): string[] {
    return Array.from(crossEncs.selectedOptions).map(o => o.value)
  }

  function drawPre(): SpaceOrNull | null {
    preBox.innerHTML = ''
    const space = buildSpace()
    if (!space.members.length) { preBox.append(emptyState('Выберите хотя бы одного участника пула.')); return null }
    const tooBig = space.members.length > 14
    const count = tooBig ? null : candidateCount(space)
    const max = space.maxCandidates
    const over = count !== null && max !== undefined && count > max
    preBox.append(
      kv(effectiveOptions(space)),
      kv([
        ['candidateCount (точно)', count === null ? 'не считаю: пул >14 (C(n,k) слишком велик для UI)' : n(count, 0)],
        ['maxCandidates', max === undefined ? 'не задан' : String(max)],
      ]),
      row(over
        ? badge('превышает maxCandidates — стадии (bruteForce/evaluateSpace) откажут', 'fail')
        : count === 0
          ? badge('candidateCount = 0: teamSize больше пула или пул пуст', 'fail')
          : badge('пространство объявлено явно', 'pass')),
    )
    return { space, count: count ?? -1 }
  }
  interface SpaceOrNull { space: SearchSpace; count: number }

  function candidatesTable(rows: ScoredCandidate[]): HTMLElement {
    return table(
      ['#', 'feasible', 'отряд / билд', `value:${primarySel.value}`, 'totalDamage', 'cycles', 'ограничения'],
      rows.map((c, i) => [
        i + 1,
        badge(c.feasible ? 'feasible' : 'pruned', c.feasible ? 'pass' : 'warn'),
        teamKey(c.config),
        n((c.values as Record<string, number>)[primarySel.value], 4),
        n(c.metrics.totalDamage, 0),
        n(c.metrics.cycles, 0),
        c.constraints.length ? c.constraints.map(x => `${x.metric}${x.ok ? '✓' : '✗'}`).join(', ') : '—',
      ]),
    )
  }

  async function run(): Promise<void> {
    const pre = drawPre()
    outBox.innerHTML = ''
    if (!pre) return
    const { space } = pre
    const alg = algSel.value as Algorithm

    let globalOptimum = false
    let correctness: Status = 'warn'
    const extra = el('div')

    try {
      if (alg === 'exhaustive' || alg === 'topk') {
        const all = rank(evaluateSpace(space), space.objective)
        outBox.append(title('Результат: exhaustive', 'evaluateSpace(space) — все кандидаты пространства'))
        outBox.append(candidatesTable(alg === 'topk' ? all.slice(0, Math.max(1, Number(kIn.value) || 10)) : all.slice(0, 50)))
        if (all.length > 50 && alg === 'exhaustive') {
          const d = el('div', 'dim'); d.textContent = `показаны первые 50 из ${all.length}`; outBox.append(d)
        }
        globalOptimum = true
        correctness = 'pass'
        outBox.append(kv([['globalOptimum', 'true (exhaustive по объявленному пространству)']]))
      } else if (alg === 'beam') {
        const bw = Math.max(1, Number(widthIn.value) || 8)
        const res = beamSearch(space, { width: bw })
        const pr = pruningReport(space, { width: bw })
        outBox.append(title('Результат: beam search', `width=${bw}; evaluated=${res.evaluated}; frontierPeak=${res.frontierPeak}`))
        outBox.append(res.ranked.length ? candidatesTable(res.ranked) : emptyState('beam не вернул кандидатов.'))
        outBox.append(jsonBlock('BeamResult', res))
        outBox.append(title('Pruning report (§80.2)', 'что отсечено и как это измеряется'), jsonBlock('PruningReport', pr))
        outBox.append(badge('globalOptimum НЕ утверждается: beam — приближённый алгоритм (см. pruning report и валидацию)', 'fail'))
      } else if (alg === 'mcReport') {
        const opts = {
          shortlist: Math.max(1, Number(shortlistIn.value) || 8),
          screenSamples: Math.max(1, Number(screenIn.value) || 2),
          finalSamples: Math.max(1, Number(finalIn.value) || 6),
        }
        const rep = mcReport(space, opts)
        correctness = rep.match ? 'pass' : 'fail'
        globalOptimum = rep.match
        outBox.append(title('Результат: MC-assisted + отчёт о корректности (§80.2)', 'сравнение с exhaustive reference на том же пространстве'))
        outBox.append(kv([
          ['match (равен brute-force оптимуму)', String(rep.match)],
          ['shortlistHasOptimum', String(rep.shortlistHasOptimum)],
          ['candidates', n(rep.candidates, 0)],
          ['screened', n(rep.screened, 0)],
          ['shortlisted', n(rep.shortlisted, 0)],
        ]))
        if (rep.mc) outBox.append(candidatesTable([rep.mc]))
        if (rep.oracle) outBox.append(candidatesTable([rep.oracle]))
        outBox.append(jsonBlock('McReport', rep))
      } else if (alg === 'jointReport') {
        const ids = teamIdsIn.value.split(',').map(s => s.trim()).filter(Boolean)
        const idsFinal = ids.length ? ids : space.members.slice(0, space.teamSize).map(m => m.id)
        const rep = jointReport(idsFinal, space)
        correctness = rep.match ? 'pass' : 'fail'
        globalOptimum = rep.match
        outBox.append(title('Результат: joint build-optimization + отчёт (§80.1/§80.2)', `teamIds=${idsFinal.join(', ')}; rounds against brute`))
        outBox.append(kv([
          ['match (равен brute-force по билдам)', String(rep.match)],
          ['jointEvaluated', n(rep.jointEvaluated, 0)],
          ['bruteCandidates', n(rep.bruteCandidates, 0)],
        ]))
        if (rep.joint) outBox.append(candidatesTable([rep.joint]))
        if (rep.brute) outBox.append(candidatesTable([rep.brute]))
        outBox.append(jsonBlock('JointReport', rep))
      } else {
        const encs = selectedEncounters().map(id => ENCOUNTER_PRESETS[id]!).filter(Boolean) as EncounterSpec[]
        if (!encs.length) { outBox.append(emptyState('Выберите хотя бы одно столкновение для кросс-ранкинга.')); return }
        const tbl = teamRankTable(space, encs)
        outBox.append(title('Результат: кросс-столкновенческий ранкинг (§81)', 'один отряд — разные ранги под разные столкновения'))
        outBox.append(table(
          ['отряд', ...encs.map(e => `${e.id} (rank/score)`), 'feasible'],
          tbl.map(r => [r.key, ...r.ranks.map(x => `#${x.rank} ${n(x.score, 4)}${x.feasible ? '' : ' ✗'}`), r.ranks.some(x => x.feasible) ? 'да' : 'нет']),
        ))
        outBox.append(badge('exhaustive по каждому столкновению — ранг глобальный в рамках объявленного пространства', 'pass'))
        globalOptimum = true
        correctness = 'pass'
      }
    } catch (e) {
      const d = el('div', 'error'); d.textContent = `Ошибка: ${(e as Error).message}`
      outBox.append(d)
      outBox.append(badge('Запуск не состоялся (см. ошибку) — никаких чисел не публикуется', 'fail'))
    }

    outBox.append(title('Эффективные параметры запуска (сохранённые в результат)', 'то же, что показано до старта — ничего скрытого'), kv(effectiveOptions(space)))
    extra.append(
      kv([
        ['globalOptimum', globalOptimum ? 'да (доказано: exhaustive или correctness-report match)' : 'нет — приближённый результат'],
      ]),
      row(badge(globalOptimum ? 'global optimum подтверждён' : 'global optimum НЕ утверждается', globalOptimum ? 'pass' : 'fail')),
    )
    outBox.append(extra)
    const lim = el('div', 'wsHint')
    lim.textContent = correctness === 'pass'
      ? 'Корректность подтверждена exhaustive-прогоном или отчётом match=true против brute force на том же пространстве.'
      : 'Приближённый алгоритм: без match=true числа не являются гарантированным оптимумом. Запустите «Проверка против brute force».'
    outBox.append(title('Ограничения поиска (§84.12)', 'pruning / approximation / validation — показаны, а не скрыты'), lim)
  }

  async function validateAgainstBrute(): Promise<void> {
    const pre = drawPre()
    outBox.innerHTML = ''
    if (!pre) return
    outBox.append(title('Валидация против brute force', 'выделенный reference-прогон того же пространства (§80.1)'))
    try {
      const ref = bruteForce(pre.space)
      outBox.append(ref ? candidatesTable([ref]) : emptyState('brute force не нашёл feasible кандидата.'))
      outBox.append(jsonBlock('bruteForce', ref))
    } catch (e) {
      const d = el('div', 'error'); d.textContent = `Ошибка: ${(e as Error).message}`
      outBox.append(d)
    }
  }

  for (const c of [teamSizeIn, seedIn, maxCandIn, kIn, widthIn, shortlistIn, screenIn, finalIn]) c.oninput = () => drawPre()
  for (const c of [encSel, primarySel, algSel, crossEncs]) c.onchange = () => drawPre()
  for (const c of checks.values()) c.onchange = () => drawPre()
  const rebuild = (): void => { drawPre() }
  ;(window as unknown as { __rebuildOptimizer?: () => void }).__rebuildOptimizer = rebuild
  drawPre()
}

/** shell enter-hook */
export function renderOptimizer(): void {
  ;(window as unknown as { __rebuildOptimizer?: () => void }).__rebuildOptimizer?.()
}
