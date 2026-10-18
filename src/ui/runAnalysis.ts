/**
 * §84.9 — Run Analysis workspace: run summary, damage attribution, Team Audit, Damage Inspector,
 * reproducibility metadata.
 *
 * Everything rendered here is read from the selected completed `Simulator` through the analysis
 * API (`analyzeRun`, `auditTeam`, `attributeDamage`, `teamMetrics`) or straight from the single
 * event stream. Nothing is recomputed with a UI-side formula (rule 84.1); the Damage Inspector
 * filters `DAMAGE_DEALT`-family events and shows each event's exact payload behind a disclosure.
 */
import { analyzeRun } from '../analysis/run'
import { auditTeam } from '../analysis/audit'
import { attributeDamage } from '../analysis/attribution'
import { teamMetrics } from '../analysis/compare'
import { rulesHash, rulesSnapshot } from '../verification/meta/rules'
import { store, type RunRecord } from './store'
import { navigate, withBusy } from './shell'
import { button, dmg, emptyState, jsonBlock, kv, label, n, row, select, table, title } from './render'
import { el } from './dom'

/** damage-carrying event families the inspector can list (the engine's own damage paths §14) */
const DAMAGE_EVENTS = ['DAMAGE_DEALT', 'BREAK_DAMAGE', 'SUPERBREAK', 'DOT_TICK'] as const

function candidates(): Array<{ id: string; label: string; sim: RunRecord['sim']; setup: RunRecord['setup'] }> {
  const s = store.getState()
  const out: Array<{ id: string; label: string; sim: RunRecord['sim']; setup: RunRecord['setup'] }> = []
  for (const r of s.history) out.push({ id: `h${r.id}`, label: `#${r.id} ${r.label}`, sim: r.sim, setup: r.setup })
  if (s.results) out.unshift({ id: 'latest', label: 'последний прогон', sim: s.results.sim, setup: s.results.setup })
  return out
}

function pick(sel: HTMLSelectElement): { sim: RunRecord['sim']; setup: RunRecord['setup'] } | null {
  const list = candidates()
  const hit = list.find(c => c.id === sel.value) ?? list[0]
  return hit ? { sim: hit.sim, setup: hit.setup } : null
}

function damageInspector(sim: RunRecord['sim']): HTMLElement {
  const wrap = el('div')
  const all = sim.logger.events.filter(e => (DAMAGE_EVENTS as readonly string[]).includes(e.type))
  if (!all.length) {
    wrap.append(emptyState('В трассе нет damage-событий (лог выключен или бой пуст).'))
    return wrap
  }
  const kindSel = select([['all', 'все damage-события'], ...DAMAGE_EVENTS.map(t => [t, t] as [string, string])])
  const limit = el('input') as HTMLInputElement
  limit.type = 'number'; limit.value = '200'; limit.min = '10'; limit.max = '5000'
  const body = el('div')

  const draw = (): void => {
    const kind = kindSel.value
    const max = Math.max(1, Number(limit.value) || 200)
    const rows = all.filter(e => kind === 'all' || e.type === kind)
    body.innerHTML = ''
    if (!rows.length) { body.append(emptyState('Нет событий выбранного типа.')); return }
    const shown = rows.slice(-max)
    let total = 0
    for (const e of rows) { const a = e.payload?.amount; if (typeof a === 'number') total += a }
    body.append(
      kv([
        ['всего событий', n(rows.length, 0)],
        ['сумма payload.amount', dmg(total)],
        ['показано (последние)', n(shown.length, 0)],
      ]),
      table(
        ['#', 'turn', 'AV', 'тип', 'источник → цель', 'ось', 'элем', 'amount'],
        shown.map(e => [
          e.eventId, e.turn, n(e.time, 2), e.type,
          `${e.source ?? '?'} → ${e.target ?? '?'}`,
          e.attackType ?? '—', e.element ?? '—',
          typeof e.payload?.amount === 'number' ? dmg(e.payload.amount) : null,
        ]),
        'kvTable',
      ),
    )
    // exact payload of the last event — the inspector must not re-derive undocumented fields
    body.append(jsonBlock('payload последнего показанного события (verbatim)', shown[shown.length - 1]?.payload))
  }
  kindSel.onchange = draw
  limit.onchange = draw
  wrap.append(row(labelled('Тип события', kindSel), labelled('Показать', limit)))
  wrap.append(body)
  draw()
  return wrap
}

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  return label(text, control)
}

export function initRunAnalysis(): void {
  const root = document.getElementById('runAnalysis')
  if (!root) return
  root.innerHTML = ''
  const head = el('div')
  const sel = select([])
  const refresh = button('Пересчитать', async () => {
    await withBusy('Анализ прогона…', () => renderBody())
  }, 'btn-primary')
  const openAudit = button('Открыть Team Audit →', () => navigate('verification'))
  head.append(row(labelled('Прогон', sel), refresh, openAudit))
  root.append(head)
  root.append(el('div', 'wsBody'))

  if (!root) return
  async function renderBody(): Promise<void> {
    const picked = pick(sel)
    const body = root?.querySelector<HTMLElement>('.wsBody')
    if (!body) return
    body.innerHTML = ''
    if (!picked) { body.append(emptyState('Прогонов нет: запустите бой в «Симуляторе».')); return }

    const { sim, setup } = picked
    const run = analyzeRun({ sim })
    const m = teamMetrics(sim)
    const attr = attributeDamage(sim)
    const audit = auditTeam({ sim })
    const snap = rulesSnapshot(setup)

    body.append(title('Run summary (§37 метрики)', 'источник — teamMetrics(sim), не пересчёт UI'))
    body.append(kv([
      ['Total Damage', dmg(m.totalDamage)],
      ['Cycles', n(m.cycles, 0)],
      ['Actions / Turns', `${n(m.actions, 0)} / ${n(m.turns, 0)}`],
      ['Ultimates', n(m.ultimates, 0)],
      ['FUA', n(m.fua, 0)],
      ['Breaks', n(m.breaks, 0)],
      ['SP final', n(m.spFinal, 0)],
      ['Survival', m.survival === undefined ? undefined : n(m.survival, 2)],
      ['Energy gained', n(m.energyGained, 0)],
      ['Events', n(m.events, 0)],
      ['heals / shields', `${n(m.healsApplied, 0)} / ${n(m.shieldsProvided, 0)}`],
      ['deaths', n(m.deaths, 0)],
    ]))

    body.append(title('Damage attribution (§43)', 'attributeDamage(sim) — по источникам, владельцам, осям, элементам'))
    body.append(kv([
      ['totalApplied', dmg(attr.totalApplied)],
      ...Object.entries(attr.byOwner).map(([k, v]) => [`owner: ${k}`, dmg(v)] as [string, string]),
      ...Object.entries(attr.byAttackType).map(([k, v]) => [`ось: ${k}`, dmg(v)] as [string, string]),
      ...Object.entries(attr.byElement).map(([k, v]) => [`элем: ${k}`, dmg(v)] as [string, string]),
    ]))

    body.append(title('Team Audit (§35)', 'auditTeam({sim}) — реальные проверки движка, N/A не прячется'))
    body.append(table(
      ['Секция', 'Проверка', 'Статус', 'Детали'],
      audit.sections.flatMap(s => s.checks.map(c => [s.name, c.name, badgeFor(c.status), c.detail ?? '—'])),
    ))

    body.append(title('Damage Inspector (§84.9)', 'фильтр по событиям боевого потока; payload — verbatim'))
    body.append(damageInspector(sim))

    body.append(title('Reproducibility', 'то, что нужно для повтора того же прогона'))
    body.append(kv([
      ['seed', snap.overrides.seed],
      ['cycles', snap.stage.cycles],
      ['encounter', snap.stage.encounter ?? 'setup'],
      ['rulesHash', rulesHash(snap)],
      ['eventHash', sim.logger.eventHash()],
      ['stateHash', sim.logger.hash()],
    ]))

    body.append(title('analyzeRun', 'сырой отчёт backend (без пересчёта)'))
    body.append(jsonBlock('RunAnalysis', run))
    if (run.text) {
      const pre = el('pre', 'log')
      pre.textContent = run.text
      body.append(pre)
    }
  }

  const rebuild = (): void => {
    const list = candidates()
    sel.innerHTML = ''
    for (const c of list) { const o = el('option') as HTMLOptionElement; o.value = c.id; o.textContent = c.label; sel.append(o) }
    void renderBody()
  }
  ;(window as unknown as { __rebuildRunAnalysis?: () => void }).__rebuildRunAnalysis = rebuild
  rebuild()
}

function badgeFor(status: string): HTMLElement {
  const s = el('span', 'badge')
  s.dataset.s = status === 'PASS' ? 'pass' : status === 'FAIL' ? 'fail' : 'neutral'
  s.textContent = status
  return s
}

/** called by the shell on every activation — rebuild so a fresh run appears immediately */
export function renderRunAnalysis(): void {
  const w = (window as unknown as { __rebuildRunAnalysis?: () => void }).__rebuildRunAnalysis
  w?.()
}
