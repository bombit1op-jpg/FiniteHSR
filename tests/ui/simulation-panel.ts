import { Window } from 'happy-dom'
import { raw } from '../_helpers/battle'

export default async () => {
  const win = new Window({ url: 'http://localhost/' })
  const doc = win.document as unknown as Document
  const g = globalThis as unknown as Record<string, unknown>
  g.window = win
  g.document = doc
  g.HTMLElement = (win as unknown as { HTMLElement: unknown }).HTMLElement
  g.HTMLInputElement = (win as unknown as { HTMLInputElement: unknown }).HTMLInputElement
  g.HTMLSelectElement = (win as unknown as { HTMLSelectElement: unknown }).HTMLSelectElement
  g.Event = (win as unknown as { Event: unknown }).Event
  g.location = (win as unknown as { location: unknown }).location
  g.localStorage = (win as unknown as { localStorage: unknown }).localStorage
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number
  doc.body.innerHTML = '<div id="simulationRoot"></div><div id="uiSimulationRoot"></div><div id="statusBar"></div>'

  const { store } = await import('../../src/ui/store')
  const { PartyStore } = await import('../../src/ui/partyStore')
  const { initSimulationPanel } = await import('../../src/ui/simulationPanel')
  const { runBattle, ENEMY_PRESETS, presetTeam } = await import('../../src/core/battle')
  const { aggregateCombatActions, collectSnapshots } = await import('../../src/ui/combatActionView')
  const originalTeam = [...store.getState().team]
  const host = doc.getElementById('simulationRoot') as HTMLElement
  const handle = initSimulationPanel(host, new PartyStore())
  const runBtn = host.querySelector<HTMLButtonElement>('.simRunBtn')
  const addWaveBtn = host.querySelector<HTMLButtonElement>('.addWaveBtn')

  const sim = runBattle({
    team: presetTeam('serval'),
    enemy: { ...ENEMY_PRESETS.mob, count: 1 },
    cycles: 4,
    seed: 7,
    log: { debug: 4, captureUiHistory: true, snapshotOn: ['ACTION_START', 'ACTION_END', 'DAMAGE_DEALT'] },
  })
  const snapshots = collectSnapshots(sim.logger)
  const actions = aggregateCombatActions(sim.logger.events, sim, snapshots)

  const uiHost = doc.getElementById('uiSimulationRoot') as HTMLElement
  const uiStore = new PartyStore()
  const firstSlot = uiStore.active!.slots[0]
  uiStore.patchSlot(firstSlot.id, { kitId: 'robin_summeretto', skillPriority: 2 })
  const secondSlot = uiStore.addSlot()!
  uiStore.patchSlot(secondSlot.id, { kitId: 'sparkle', eidolon: 2, skillPriority: 2 })
  const thirdSlot = uiStore.addSlot()!
  uiStore.patchSlot(thirdSlot.id, { kitId: 'kafka', skillPriority: 2 })
  const fourthSlot = uiStore.addSlot()!
  uiStore.patchSlot(fourthSlot.id, { kitId: 'hyacine', skillPriority: 2 })
  const uiHandle = initSimulationPanel(uiHost, uiStore)
  uiHandle.refresh()
  const e0Text = uiHost.querySelector('.simPartySlot .simSlotEidolon')?.textContent ?? ''
  const seedInp = [...uiHost.querySelectorAll<HTMLLabelElement>('label')]
    .find(l => l.textContent === 'Seed')?.querySelector('input') as HTMLInputElement
  seedInp.value = '0'
  const uiRunBtn = uiHost.querySelector<HTMLButtonElement>('.simRunBtn')!
  await uiRunBtn.onclick?.call(uiRunBtn, undefined as unknown as PointerEvent)

  const cards = [...uiHost.querySelectorAll<HTMLElement>('.simCombatActionCard')]
  const memoSpriteSourceCard = cards.find(c => c.querySelector('.simActionSourceName')?.textContent === 'Little Ica')
  const memoSpriteIconSrc = memoSpriteSourceCard?.querySelector('.simActionSourceIcon img')?.getAttribute('src') ?? ''
  const clickStateTab = () => [...uiHost.querySelectorAll<HTMLButtonElement>('.simInspectorTab')]
    .find(b => b.textContent === 'Состояние')?.click()
  const timerCard = cards.find(c => c.classList.contains('timer'))
  timerCard?.click()
  clickStateTab()
  const timerStateText = uiHost.querySelector('.simInspectorContent')?.textContent ?? ''
  const fuaCard = cards.find(c => c.textContent?.includes('Kafka') && c.textContent?.includes('Gentle but Cruel') && !!c.querySelector('.simActionHitsSummary'))
  fuaCard?.click()
  const actionTabGridCount = uiHost.querySelectorAll('.simLogInspectorGrid').length
  let stateUnitNames: string[] = []
  let debuffListCount = 0
  for (const card of cards.filter(c => /Kafka|Sparkle/.test(c.querySelector('.simActionSourceName')?.textContent ?? ''))) {
    card.click()
    clickStateTab()
    stateUnitNames = [...uiHost.querySelectorAll('.simInspectorUnitState')].map(u => u.querySelector('.simInspectorUnitName')?.textContent ?? '')
    debuffListCount = uiHost.querySelectorAll('.simUnitDebuffs').length
    if (debuffListCount > 0) break
  }

  const clickEffectsTab = () => [...uiHost.querySelectorAll<HTMLButtonElement>('.simInspectorTab')]
    .find(b => b.textContent === 'Эффекты')?.click()
  let stackedEffectRow: HTMLElement | undefined
  for (const card of cards) {
    card.click()
    clickEffectsTab()
    stackedEffectRow = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorEffect.buff')]
      .find(row => {
        const m = /Стаки:\s*(\d+)/.exec(row.textContent ?? '')
        return !!m && Number(m[1]) > 1
      })
    if (stackedEffectRow) break
  }
  const stackedEffectName = stackedEffectRow?.querySelector('.simInspectorEffectName')?.textContent ?? ''
  const sameNameRows = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorEffect.buff')]
    .filter(row => row.querySelector('.simInspectorEffectName')?.textContent === stackedEffectName)
  const effectText = stackedEffectRow?.textContent ?? ''
  let cipherRow: HTMLElement | undefined
  let sparkleE2Row: HTMLElement | undefined
  let sparkleE2InBuffs = false
  for (const card of cards.filter(c => c.querySelector('.simActionSourceName')?.textContent?.includes('Sparkle'))) {
    card.click()
    clickEffectsTab()
    const buffRows = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorEffect.buff')]
    const debuffRows = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorEffect.debuff')]
    cipherRow ??= buffRows.find(row => row.querySelector('.simInspectorEffectName')?.textContent === 'Cipher')
    sparkleE2Row ??= debuffRows.find(row => row.querySelector('.simInspectorEffectName')?.textContent === 'Purely Fictitious')
    sparkleE2InBuffs ||= buffRows.some(row => row.querySelector('.simInspectorEffectName')?.textContent === 'Purely Fictitious')
    if (cipherRow && sparkleE2Row) break
  }
  const cipherSourceText = cipherRow?.querySelector('.simInspectorEffectSource')?.textContent ?? ''
  const sparkleE2SourceText = sparkleE2Row?.querySelector('.simInspectorEffectSource')?.textContent ?? ''
  const { effectIconUrl } = await import('../../src/ui/icons')

  for (const row of store.getState().team) store.dispatch({ type: 'team/remove', id: row.id })
  for (const row of originalTeam) store.dispatch({ type: 'team/add', row })

  return [
    raw('simulation panel renders run button', !!runBtn, runBtn?.textContent ?? 'missing'),
    raw('run button disabled without active party', runBtn?.disabled === true, String(runBtn?.disabled)),
    raw('custom encounter builder renders', !!addWaveBtn, addWaveBtn?.textContent ?? 'missing'),
    raw('initSimulationPanel returns handle', typeof handle?.refresh === 'function', String(typeof handle?.refresh)),
    raw('UI history captures snapshots at debug 4', snapshots.length > 0, `snapshots=${snapshots.length}`),
    raw('actions link to captured snapshots', actions.some(a => !!a.beforeSnapshot), `with before=${actions.filter(a => !!a.beforeSnapshot).length}`),
    raw('actions have sequential order', actions.every((a, i) => a.order === i + 1), `actions=${actions.length}`),
    raw('attacks resolve action ability names', actions.some(a => a.attacks.some(x => !!x.abilityName && x.abilityName !== 'Attack')), `attacks=${actions.reduce((n, a) => n + a.attacks.length, 0)}`),
    raw('countdown entities get separate action color', !!timerCard, `timerCards=${cards.filter(c => c.classList.contains('timer')).length}`),
    raw('countdown is not a character state', !/cdId|cdSeq|Fever Countdown|timer/i.test(timerStateText), timerStateText.slice(0, 120)),
    raw('hit rows omit damage breakdown', uiHost.querySelectorAll('.simInspectorHitBreakdown').length === 0, `breakdowns=${uiHost.querySelectorAll('.simInspectorHitBreakdown').length}`),
    raw('action inspector omits duplicated metadata grid', actionTabGridCount === 0, `grids=${actionTabGridCount}`),
    raw('state inspector limited to acting unit and enemy target', stateUnitNames.length > 0 && stateUnitNames.every(n => (n.includes('Kafka') || n.includes('MoC') || n.includes('Sparkle')) && !n.includes('Robin') && !n.includes('Hyacine')), stateUnitNames.join(' | ').slice(0, 120)),
    raw('enemy target exposes debuff list', debuffListCount > 0, `debuffLists=${debuffListCount}`),
    raw('effect summary carries source name', actions.some(a => a.effects.buffs.some(b => !!b.sourceName)), `withSource=${actions.filter(a => a.effects.buffs.some(b => !!b.sourceName)).length}`),
    raw('stacked buffs render one row with total stacks', !!stackedEffectRow && sameNameRows.length === 1, `name=${stackedEffectName} rows=${sameNameRows.length}`),
    raw('effect rows omit recipient', !/Получатель/.test(effectText), effectText.slice(0, 120)),
    raw('effect row shows source name and icon', !!stackedEffectRow?.querySelector('.simInspectorEffectSource') && !!stackedEffectRow?.querySelector('.simInspectorEffectSourceIcon img') && !/Источник:\s*—/.test(effectText), effectText.slice(0, 120)),
    raw('missing effect aliases resolve to public icons', effectIconUrl('Pain & Anger DMG+13%')?.startsWith('/icons/') === true && effectIconUrl('A4 Effect RES')?.startsWith('/icons/') === true, `${effectIconUrl('Pain & Anger DMG+13%')} | ${effectIconUrl('A4 Effect RES')}`),
    raw('E0 renders in simulation party card', e0Text === 'E0', e0Text),
    raw('Memosprite source uses own icon', memoSpriteIconSrc.includes('Memosprite.png'), memoSpriteIconSrc),
    raw('Sparkle talent buff shows Cipher source', !!cipherRow && /Sparkle/.test(cipherSourceText), cipherSourceText),
    raw('Sparkle E2 debuff shows Sparkle source outside buffs', !!sparkleE2Row && !sparkleE2InBuffs && /Sparkle/.test(sparkleE2SourceText), sparkleE2SourceText),
    raw('Cipher and Memosprite icons resolve to public icons', effectIconUrl('Cipher')?.includes('Cipher.png') === true && effectIconUrl('Memosprite')?.includes('Memosprite.png') === true, `${effectIconUrl('Cipher')} | ${effectIconUrl('Memosprite')}`),
  ]
}
