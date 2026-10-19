/**
 * §84.15 — Settings workspace.
 *
 * UI-level preferences only (rule 84.1: no domain logic, no hidden engine defaults). These are
 * convenience defaults for the editors (seed / debug level). Whatever they are, the effective
 * value is shown again at run time — the run's RulesSnapshot remains the source of truth (§32).
 * Persisted in localStorage under `FiniteHSR.settings`.
 */
import { button, kv, label, row, select, title } from './render'
import { el } from './dom'
import { ENGINE_VERSION, RULES_VERSION, DATASET_VERSION } from '../verification/meta/rules'

export interface UiSettings {
  defaultSeed: number
  debugLevel: number
}

const KEY = 'FiniteHSR.settings'
/** debugLevel 4 (damage) by default: an interactive UI run must record typed events so the
 *  Results/Analysis workspaces can render a structured log (§84.6/E); sweeps keep their own
 *  LogConfig at 0 and never read this. Set 0 to get the old off behavior for UI runs too. */
const DEFAULTS: UiSettings = { defaultSeed: 1, debugLevel: 4 }

export function loadSettings(): UiSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<UiSettings>
    return { ...DEFAULTS, ...p }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(s: UiSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable: ignore */ }
}

export function initSettings(): void {
  const root = document.getElementById('settingsWs')
  if (!root) return
  root.innerHTML = ''

  let cur = loadSettings()

  root.append(title('Настройки (§84.15)', 'значения по умолчанию для редакторов; эффективные значения всегда показываются при запуске'))
  root.append(kv([
    ['ENGINE_VERSION', ENGINE_VERSION],
    ['RULES_VERSION', RULES_VERSION],
    ['DATASET_VERSION', DATASET_VERSION],
  ]))

  const seed = document.createElement('input')
  seed.type = 'number'; seed.min = '0'; seed.step = '1'; seed.value = String(cur.defaultSeed)
  const dbg = select([['0', '0 — off (Monte-Carlo default)'], ['1', '1 — summary'], ['2', '2 — actions'], ['3', '3 — effects'], ['4', '4 — damage'], ['5', '5 — full trace'], ['6', '6 — state diff']])
  dbg.value = String(cur.debugLevel)

  const status = el('div', 'wsHint')
  const persist = (): void => {
    cur = { defaultSeed: Math.max(0, Math.floor(Number(seed.value) || 0)), debugLevel: Number(dbg.value) || 0 }
    save(cur)
    status.textContent = `Сохранено: seed=${cur.defaultSeed}, debug=${cur.debugLevel}.`
  }
  seed.onchange = persist
  dbg.onchange = persist

  root.append(row(label('Seed по умолчанию', seed), label('Debug level', dbg)))
  root.append(status)
  root.append(row(
    button('Сбросить к значениям по умолчанию', () => {
      cur = { ...DEFAULTS }; seed.value = String(cur.defaultSeed); dbg.value = String(cur.debugLevel); save(cur)
      status.textContent = 'Сброшено к значениям по умолчанию.'
    }),
  ))

  const costHint = el('div', 'wsHint')
  costHint.textContent = 'Debug ≥5 дорогой по объёму лога: для Monte-Carlo/sweep не включать без необходимости (§29, §31).'
  root.append(title('Логирование (§29 / §84.13)', 'уровень лога влияет на стоимость и объём вывода'))
  root.append(costHint)
}

export function renderSettings(): void {
  // static; re-init on reload
}
