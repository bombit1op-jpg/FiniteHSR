import { runBattle, runBattleManual } from './core/battle'
import type { BattleSetup } from './core/battle'
import type { Simulator } from './core/simulator'
import { runChecks } from './core/check'
import { addCharRow, collect } from './ui/team'
import { addManualModRow, enemyFormInit } from './ui/enemy'
import { render, uiIO } from './ui/results'
import { renderReference } from './ui/reference'
import { initCalcs } from './ui/calcs'
import { store, subscribeSlice } from './ui/store'
import { initShell, navigate, showStatus, withBusy, clearStatus, setRouteEnter } from './ui/shell'
import { initBuildEditor } from './ui/buildEditor'
import { initEncounterEditor } from './ui/encounterEditor'
import { initDashboard } from './ui/dashboard'
import { initRunAnalysis, renderRunAnalysis } from './ui/runAnalysis'
import { initCompare, renderCompare } from './ui/compare'
import { initProfiles, renderProfiles } from './ui/profiles'
import { initOptimizer, renderOptimizer } from './ui/optimizerPage'
import { initVerification, renderVerification } from './ui/verificationPage'
import { initCatalog, renderCatalog } from './ui/catalog'
import { initDeviations, renderDeviations } from './ui/deviations'
import { initDiagnostics, renderDiagnostics } from './ui/diagnostics'
import { initSettings, renderSettings } from './ui/settings'

function wireInputs(): void {
  const s = store.getState().run
  const runMode = document.getElementById('runMode') as HTMLSelectElement
  runMode.value = s.mode
  runMode.onchange = () => store.dispatch({ type: 'run/set', patch: { mode: runMode.value } })

  const cycles = document.getElementById('cycles') as HTMLInputElement
  cycles.value = String(s.cycles)
  cycles.oninput = () => store.dispatch({ type: 'run/set', patch: { cycles: parseInt(cycles.value, 10) || 1 } })

  const seed = document.getElementById('seed') as HTMLInputElement
  seed.value = String(s.seed)
  seed.oninput = () => store.dispatch({ type: 'run/set', patch: { seed: parseInt(seed.value, 10) || 0 } })
}

function autoRerun(): void {
  let lastKey = ''
  subscribeSlice('run', r => {
    const key = `${r.cycles}|${r.seed}`
    if (r.mode === 'auto' && key !== lastKey) {
      lastKey = key
      setTimeout(() => {
        const setup = collect()
        const sim = runBattle(setup)
        render(sim, setup)
        recordRun(sim, setup, `Авто (rerun) · ${r.cycles} цикл(ов) · seed ${r.seed}`)
        navigate('results')
      }, 0)
    }
  })
  subscribeSlice('calcs', (c, prev) => {
    if (c.hMult !== prev.hMult) {
      setTimeout(() => {
        const setup = collect()
        render(runBattle(setup), setup)
      }, 0)
    }
  })
}

function recordRun(sim: Simulator, setup: BattleSetup, label: string): void {
  store.dispatch({ type: 'history/add', label, sim, setup })
}

document.getElementById('addChar')!.onclick = addCharRow
document.getElementById('addMod')!.onclick = addManualModRow
document.getElementById('run')!.onclick = () => {
  void withBusy('Симуляция боя…', async () => {
    const setup = collect()
    const mode = store.getState().run.mode
    let sim: Simulator
    if (mode === 'manual') {
      navigate('results')
      document.getElementById('summary')!.innerHTML = '<em>Бой идёт…</em>'
      sim = await runBattleManual(setup, uiIO())
      document.getElementById('manualPanel')!.style.display = 'none'
      render(sim, setup)
      store.dispatch({ type: 'results/set', sim, setup })
    } else {
      sim = runBattle(setup)
      render(sim, setup)
      store.dispatch({ type: 'results/set', sim, setup })
      navigate('results')
    }
    recordRun(sim, setup, `${mode === 'manual' ? 'Пошагово' : 'Авто'} · ${setup.cycles} цикл(ов) · seed ${setup.seed}`)
  })
}
document.getElementById('check')!.onclick = () => {
  void withBusy('Self-check формул…', async () => {
    const r = await runChecks()
    console.log(r.text)
    showStatus(r.failed ? `Self-check: ${r.failed} FAIL (см. консоль F12)` : 'Self-check: PASS (см. консоль F12)', r.failed ? 'error' : 'info')
  })
}

initShell()
wireInputs()
autoRerun()
initBuildEditor()
initEncounterEditor()
initDashboard()
initRunAnalysis()
initCompare()
initProfiles()
initOptimizer()
initVerification()
initCatalog()
initDeviations()
initDiagnostics()
initSettings()
setRouteEnter('dashboard', () => initDashboard())
setRouteEnter('analysis', () => renderRunAnalysis())
setRouteEnter('compare', () => renderCompare())
setRouteEnter('profiles', () => renderProfiles())
setRouteEnter('optimizer', () => renderOptimizer())
setRouteEnter('verification', () => renderVerification())
setRouteEnter('catalog', () => renderCatalog())
setRouteEnter('deviations', () => renderDeviations())
setRouteEnter('diagnostics', () => renderDiagnostics())
setRouteEnter('settings', () => renderSettings())
for (let i = 0; i < 4; i++) addCharRow()
enemyFormInit()
renderReference()
initCalcs()
document.addEventListener('teamChanged', () => { renderReference(); clearStatus() })
