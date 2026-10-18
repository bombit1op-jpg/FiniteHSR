/**
 * §84.10 — Compare workspace: two saved runs → `compareTeams` (§77). Renders the canonical
 * `TeamComparisonResult` — metric rows, input parity, event diff (first divergence), damage
 * breakdown, validation, objective/winner + `why`. The full backend `text` is available verbatim.
 *
 * Rule 84.1: no comparison math here — deltas/winner come from `compareTeams` only.
 */
import { compareTeams } from '../analysis/compare'
import { rulesHash, rulesSnapshot } from '../verification/meta/rules'
import type { Simulator } from '../core/simulator'
import type { BattleSetup } from '../core/battle'
import { store } from './store'
import { withBusy } from './shell'
import { button, emptyState, jsonBlock, kv, label, row, select, table, title, n } from './render'
import { el } from './dom'

interface Entry { id: string; label: string; sim: Simulator; setup: BattleSetup }

function entries(): Entry[] {
  const s = store.getState()
  const out: Entry[] = []
  for (const r of s.history) out.push({ id: `h${r.id}`, label: `#${r.id} ${r.label}`, sim: r.sim, setup: r.setup })
  if (s.results) out.unshift({ id: 'latest', label: 'последний прогон', sim: s.results.sim, setup: s.results.setup })
  return out
}

function fill(sel: HTMLSelectElement, list: Entry[]): void {
  sel.innerHTML = ''
  for (const e of list) { const o = el('option') as HTMLOptionElement; o.value = e.id; o.textContent = e.label; sel.append(o) }
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  return label(text, control)
}

function parityBadge(p: string): HTMLElement {
  const s = el('span', 'badge')
  s.dataset.s = p === 'SAME' ? 'pass' : p === 'DIFFERENT' ? 'warn' : 'neutral'
  s.textContent = p
  return s
}

export function initCompare(): void {
  const root = document.getElementById('compareWs')
  if (!root) return
  root.innerHTML = ''
  const selA = select([]); const selB = select([])
  const run = button('Сравнить', async () => { await withBusy('Сравнение прогонов…', () => render()) }, 'btn-primary')
  const warn = el('p', 'wsHint')
  root.append(row(labelled('Прогон A', selA), labelled('Прогон B', selB), run), warn)
  root.append(el('div', 'wsBody'))

  async function render(): Promise<void> {
    const body = root?.querySelector<HTMLElement>('.wsBody')
    if (!body) return
    const list = entries()
    const a = list.find(e => e.id === selA.value) ?? list[0]
    const b = list.find(e => e.id === selB.value) ?? list[1] ?? list[0]
    body.innerHTML = ''
    if (!a || !b) { body.append(emptyState('Нужно минимум два прогона: запустите бой в «Симуляторе»')); return }

    const sameHash = rulesHash(rulesSnapshot(a.setup)) === rulesHash(rulesSnapshot(b.setup))
    const sameSeed = a.setup.seed === b.setup.seed
    warn.textContent = !sameHash
      ? 'Правила/seed/encounter прогонов РАЗЛИЧАЮТСЯ (rulesHash отличается) — сравнение может быть загрязнено (§77.1).'
      : !sameSeed
        ? 'rulesHash совпадает, но seed отличается — сравнение мульти-сид, а не контролируемая пара.'
        : 'Паритет входов: одинаковые правила, encounter и seed — контролируемое сравнение.'

    const res = compareTeams(a.sim, b.sim, {
      aLabel: a.label, bLabel: b.label,
      seed: a.setup.seed, detail: 'full',
    })

    body.append(title('Metrics (§77.5)', 'compareTeams(...) — строки и дельты из backend, не из UI'))
    body.append(table(['Метрика', 'A', 'B', 'Δ'], res.rows.map(r => [r.metric, r.a, r.b, r.delta]), 'kvTable'))

    body.append(title('Verdict', 'objective + winner + почему'))
    body.append(kv([
      ['objective', res.objective.objective],
      ['победитель', res.winner === 'tie' ? 'ничья' : res.winner],
      ['score A → B', `${n(res.objective.a, 3)} → ${n(res.objective.b, 3)}`],
      ['tolerance', n(res.objective.tolerance, 4)],
    ]))
    if (res.why.length) {
      const ul = el('ul', 'list')
      for (const w of res.why) { const li = el('li'); li.textContent = w; ul.append(li) }
      body.append(ul)
    }

    body.append(title('Input parity (§77.1)', 'field-by-field SAME/DIFFERENT + confounding'))
    body.append(table(
      ['Поле', 'A', 'B', 'паритет', 'класс'],
      res.inputAudit.fields.map(f => [f.field, f.a, f.b, parityBadge(f.parity), f.classification]),
    ))
    if (res.inputAudit.confounding.length) {
      const p = el('p', 'wsHint')
      p.textContent = `Confounding: ${res.inputAudit.confounding.join(', ')}`
      body.append(p)
    }

    body.append(title('Event diff (§77.10)', 'first divergence по стабильной сигнатуре'))
    const ed = res.eventDiff
    body.append(kv([
      ['status', ed.status],
      ['matched', n(ed.matched, 0)],
      ['firstDivergence', ed.firstDivergence === null ? '—' : `#${ed.firstDivergence}`],
      ['prevContext', ed.prevContext ?? '—'],
      ['A hash', ed.aHash], ['B hash', ed.bHash],
    ]))
    if (ed.status === 'identical') {
      const p = el('p', 'wsHint')
      p.textContent = 'Потоки событий идентичны.'
      body.append(p)
    }

    body.append(title('Damage breakdown (§77.7)', 'сравнение урона по источникам/осям/элементам'))
    body.append(jsonBlock('damage', res.damage))

    body.append(title('Validation', 'предупреждения валидации сравнения'))
    body.append(jsonBlock('validation', res.validation))

    body.append(title('Build / runtime stats / actors (§77.2)', 'input gear vs runtime-статы vs состав'))
    body.append(jsonBlock('build', res.build))
    body.append(jsonBlock('runtimeStats', res.runtimeStats))
    body.append(jsonBlock('actors', res.actors))

    body.append(title('Reproducibility (§84.1)', 'что нужно для повтора обеих половин'))
    body.append(kv([
      ['seed A / B', `${a.setup.seed} / ${b.setup.seed}`],
      ['rulesHash A', rulesHash(rulesSnapshot(a.setup))],
      ['rulesHash B', rulesHash(rulesSnapshot(b.setup))],
      ['eventHash A', a.sim.logger.eventHash()],
      ['eventHash B', b.sim.logger.eventHash()],
      ['metadata', `${res.metadata.mode} / ${res.metadata.detail}`],
    ]))

    body.append(title('compareTeams text', 'сырой отчёт backend (verbatim)'))
    const pre = el('pre', 'log'); pre.textContent = res.text; body.append(pre)
    body.append(jsonBlock('TeamComparisonResult', res))
  }

  const rebuild = (): void => {
    const list = entries()
    fill(selA, list); fill(selB, list)
    if (list.length > 1) selB.selectedIndex = 1
    warn.textContent = list.length < 2
      ? 'Для сравнения нужно два прогона: запустите хотя бы два боя (результаты сохраняются в history).'
      : ''
  }
  ;(window as unknown as { __rebuildCompare?: () => void }).__rebuildCompare = rebuild
  rebuild()
}

/** shell enter-hook — refresh the run list when the route activates */
export function renderCompare(): void {
  ;(window as unknown as { __rebuildCompare?: () => void }).__rebuildCompare?.()
}
