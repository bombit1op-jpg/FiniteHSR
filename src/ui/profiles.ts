/**
 * §84.11 — Profiling / Compatibility / Valuation workspace.
 *
 * Sections (all backend, no UI-side analysis):
 *  - Behavior Profile  — `behaviorProfile(sim)` §65/§66 (cheap, on run change)
 *  - Need / Provide    — `needProfile(carry)` §67/§68 is SIM-BASED (explicit button + cost hint),
 *                        `provideProfile(sim)` is telemetry-derived (cheap)
 *  - Compatibility     — `predictCompatibility(need, provide)` pure scoring over the two above
 *  - Valuation         — `scoreKits` / `pairInteraction` §69 (sim-based → button)
 *  - Character probes  — `probeCharacter(kitId)` §65 scenario matrix (sim-based → button)
 */
import { behaviorProfile } from '../analysis/profile'
import { needProfile, provideProfile } from '../analysis/causal'
import { predictCompatibility, scoreKits, pairInteraction, PROVIDE_TO_FEATURES } from '../analysis/team'
import { probeCharacter, PROBE_SCENARIOS } from '../analysis/probe'
import { KITS } from '../core/kits'
import type { Simulator } from '../core/simulator'
import type { BattleSetup } from '../core/battle'
import { store } from './store'
import { withBusy } from './shell'
import { button, emptyState, jsonBlock, kv, label, n, row, select, table, title } from './render'
import { el } from './dom'

interface Entry { id: string; label: string; sim: Simulator; setup: BattleSetup }

function entries(): Entry[] {
  const s = store.getState()
  const out: Entry[] = []
  for (const r of s.history) out.push({ id: `h${r.id}`, label: `#${r.id} ${r.label}`, sim: r.sim, setup: r.setup })
  if (s.results) out.unshift({ id: 'latest', label: 'последний прогон', sim: s.results.sim, setup: s.results.setup })
  return out
}

function kitOptions(): Array<[string, string]> {
  return KITS.map(k => [k.id, `${k.name} (${k.id})`])
}

function pickRun(sel: HTMLSelectElement): Simulator | null {
  const list = entries()
  const hit = list.find(e => e.id === sel.value) ?? list[0]
  return hit ? hit.sim : null
}

function axesTable(sections: Array<[string, Record<string, number>]>): HTMLElement {
  const rows: Array<Array<string | number | HTMLElement>> = []
  for (const [name, rec] of sections)
    for (const [k, v] of Object.entries(rec).sort((a, b) => b[1] - a[1])) rows.push([name, k, n(v, 3)])
  return table(['ось', 'категория', 'скор'], rows)
}

/** normalize the §66 axis records into `axesTable` sections (role only when a team context exists) */
function sectionsOf(arch: {
  delivery: Record<string, number>; tempo: Record<string, number>; target: Record<string, number>
  role?: Partial<Record<string, number>>
}): Array<[string, Record<string, number>]> {
  const out: Array<[string, Record<string, number>]> = [['delivery', arch.delivery], ['tempo', arch.tempo], ['target', arch.target]]
  if (arch.role && Object.keys(arch.role).length) out.push(['role', arch.role as Record<string, number>])
  return out
}

/** reverse index: which provide keys feed a need feature (PROVIDE_TO_FEATURES is provide→features) */
function providersOf(feature: string): string[] {
  return Object.entries(PROVIDE_TO_FEATURES)
    .filter(([, feats]) => (feats as readonly string[]).includes(feature))
    .map(([k]) => k)
}

export function initProfiles(): void {
  const root = document.getElementById('profilesWs')
  if (!root) return
  root.innerHTML = ''

  // ---- §65/§66 behavior profile (cheap)
  const pRun = select([])
  const pBox = el('div', 'wsBody')
  const drawProfile = (): void => {
    pBox.innerHTML = ''
    const sim = pickRun(pRun)
    if (!sim) { pBox.append(emptyState('Прогонов нет — запустите бой в «Симуляторе».')); return }
    const prof = behaviorProfile(sim)
    pBox.append(
      kv([
        ['dominant delivery', prof.dominant.delivery],
        ['dominant tempo', prof.dominant.tempo],
        ['dominant target', prof.dominant.target],
        ['dominant role', prof.dominant.role ?? 'N/A (нет team-контекста)'],
      ]),
      axesTable(sectionsOf(prof.archetypes)),
      jsonBlock('features (verbatim)', prof.features),
    )
  }
  pRun.onchange = drawProfile
  root.append(title('Behavior profile (§65/§66)', 'behaviorProfile(sim) — по событиям прогона, дёшево'))
  root.append(row(label('Прогон', pRun)))
  root.append(pBox)

  // ---- §67/§68 need + provide + compatibility
  const cCarry = select(kitOptions())
  const cRun = select([])
  const needBtn = button('Посчитать Need profile (≈8 симуляций × сценарии)', async () => {
    await withBusy('needProfile: прогон сценариев…', () => {
      needBox.innerHTML = ''
      const need = needProfile(cCarry.value)
      const sim = pickRun(cRun)
      if (!sim) { needBox.append(emptyState('Нужен прогон для Provide-профиля.')); return }
      const provide = provideProfile(sim)
      const compat = predictCompatibility(need, provide)
      needBox.append(
        table(['feature', 'need mean ± σ', 'samples', 'provide через'],
          need.map(ns => [
            ns.feature, `${n(ns.mean, 3)} ± ${n(ns.stddev, 3)}`,
            `${ns.samples} (${ns.scenarios} сцен.)`,
            providersOf(ns.feature).join(', ') || '—',
          ])),
        kv([
          ['needsSatisfied', n(compat.needsSatisfied, 0)],
          ['providedBenefits', n(compat.providedBenefits, 3)],
          ['conflicts', n(compat.conflicts, 0)],
          ['compatibility score', n(compat.score, 3)],
        ]),
        jsonBlock('need / provide / predictCompatibility', { need, provide, compat }),
      )
    })
  }, 'btn-primary')
  const pBtn = button('Только Provide profile (дёшево)', async () => {
    await withBusy('provideProfile…', () => {
      needBox.innerHTML = ''
      const sim = pickRun(cRun)
      if (!sim) { needBox.append(emptyState('Прогонов нет.')); return }
      const provide = provideProfile(sim)
      needBox.append(kv(Object.entries(provide).map(([k, v]) => [k, n(v, 3)] as [string, string])))
      needBox.append(jsonBlock('provideProfile', provide))
    })
  })
  const needBox = el('div', 'wsBody')
  root.append(title('Need / Provide / Compatibility (§67–§68)', 'Need = симуляции (дорого); Provide = телеметрия прогона (дёшево)'))
  root.append(row(label('Carry', cCarry), label('Provide из прогона', cRun), needBtn, pBtn))
  root.append(needBox)

  // ---- §69 valuation
  const vBtn = button('Оценить текущий отряд (scoreKits, симуляции)', async () => {
    await withBusy('scoreKits: оценка отряда…', () => {
      vBox.innerHTML = ''
      const team = store.getState().team.filter(r => r.kitId)
      if (!team.length) { vBox.append(emptyState('Отряд пуст — соберите команду на вкладке «Отряд».')); return }
      const ids = team.map(r => r.kitId)
      const score = scoreKits(ids)
      const pairs: Array<Array<string | number>> = []
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++)
        pairs.push([ids[i]!, ids[j]!, n(pairInteraction(ids[i]!, ids[j]!), 3)])
      vBox.append(
        kv([['scoreKits(отряд)', n(score, 3)], ['участников', ids.length]]),
        pairs.length ? table(['A', 'B', 'pairInteraction'], pairs) : emptyState('Нужно ≥2 участника для парных взаимодействий.'),
      )
    })
  })
  const vBox = el('div', 'wsBody')
  root.append(title('Valuation (§69)', 'scoreKits / pairInteraction — симуляционная оценка, не пересчёт UI'))
  root.append(row(vBtn))
  root.append(vBox)

  // ---- §65 archetype probes
  const kSel = select(kitOptions())
  const kBtn = button('Проба персонажа (§65 матрица сценариев, дорого)', async () => {
    await withBusy(`probeCharacter(${kSel.value}): ${Object.keys(PROBE_SCENARIOS).length} сценариев × 2 уровня…`, () => {
      kBox.innerHTML = ''
      const res = probeCharacter(kSel.value)
      kBox.append(
        kv([
          ['coverage (проб)', n(res.aggregate.coverage, 0)],
          ['dominant delivery', Object.entries(res.aggregate.delivery).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'],
          ['dominant tempo', Object.entries(res.aggregate.tempo).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'],
          ['dominant target', Object.entries(res.aggregate.target).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'],
        ]),
        axesTable(sectionsOf(res.aggregate)),
        table(['уровень', 'сценарий', 'delivery', 'tempo', 'target'],
          res.probes.map(p => [p.level, p.scenario, p.profile.dominant.delivery, p.profile.dominant.tempo, p.profile.dominant.target])),
        jsonBlock('CharacterProbeResult', res),
      )
    })
  }, 'btn-primary')
  const kBox = el('div', 'wsBody')
  root.append(title('Character probes (§65)', 'PROBE_BUILDS + стандартные сценарии; benchmark-уровень не используется для архетипов'))
  root.append(row(label('Персонаж', kSel), kBtn))
  root.append(kBox)

  // ---- initial fill
  const refill = (): void => {
    const list = entries()
    for (const sel of [pRun, cRun]) {
      sel.innerHTML = ''
      for (const e of list) { const o = el('option') as HTMLOptionElement; o.value = e.id; o.textContent = e.label; sel.append(o) }
      if (!list.length) { const o = el('option') as HTMLOptionElement; o.value = ''; o.textContent = 'нет прогонов'; sel.append(o) }
    }
    drawProfile()
  }
  rebuildProfiles = refill
  refill()
}

/** shell enter-hook — refresh run list on activation */
let rebuildProfiles: (() => void) | null = null
export function renderProfiles(): void {
  rebuildProfiles?.()
}
