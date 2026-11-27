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
  g.innerWidth = 1280
  g.innerHeight = 900
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number
  doc.body.innerHTML = '<div id="simulationRoot"></div><div id="uiSimulationRoot"></div><div id="statusBar"></div>'

  const { store } = await import('../../src/ui/store')
  const { PartyStore } = await import('../../src/ui/partyStore')
  const { renderEffectSummary, snapshotEffectModTotals, initSimulationPanel, renderSupportLog, renderEventLog, renderEnergyLog, actionTargetGroups, renderActionTargets, vitalLabelsForSnapshot, damageDisplay, damageElementParts, supportSummaryParts } = await import('../../src/ui/simulationPanel')
  const { runBattle, ENEMY_PRESETS, presetTeam } = await import('../../src/core/battle')
  const { aggregateCombatActions, collectSnapshots } = await import('../../src/ui/combatActionView')
  const { isDebuff } = await import('../../src/core/combat/StatResolver')
  const { enemyBehavior } = await import('../../src/core/enemy/behaviors')
  const { resolveTargets } = await import('../../src/core/combat/TargetResolver')
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
  const hiddenSystemAction = aggregateCombatActions([
    { eventId: -5, time: 0, turn: 0, actionId: 0, type: 'ACTION_START', source: 'System', payload: {}, combatActionId: 'probe_system' },
  ] as any, sim, [])[0]
  const summonAfterHitAction = aggregateCombatActions([
    { eventId: -40, time: 0, turn: 0, actionId: 1, type: 'ACTION_START', source: sim.roster.find(u => u.side === 'ally')!.name, sourceId: sim.roster.find(u => u.side === 'ally')!.id, payload: { action: 'skill' }, actionCategory: 'attack', combatActionId: 'probe_summon_after_hit' },
    { eventId: -41, time: 0, turn: 0, actionId: 1, type: 'ABILITY_USED', source: sim.roster.find(u => u.side === 'ally')!.name, sourceId: sim.roster.find(u => u.side === 'ally')!.id, attackId: 'probe_summon_after_hit_atk', payload: { action: 'skill', abilityName: 'Probe AoE' }, combatActionId: 'probe_summon_after_hit' },
    { eventId: -42, time: 0, turn: 0, actionId: 1, type: 'HIT_START', source: sim.roster.find(u => u.side === 'ally')!.name, sourceId: sim.roster.find(u => u.side === 'ally')!.id, target: sim.roster.find(u => u.side === 'enemy')!.name, targetId: sim.roster.find(u => u.side === 'enemy')!.id, attackId: 'probe_summon_after_hit_atk', payload: { abilityName: 'Probe AoE' }, combatActionId: 'probe_summon_after_hit' },
    { eventId: -43, time: 0, turn: 0, actionId: 1, type: 'DAMAGE_DEALT', source: sim.roster.find(u => u.side === 'ally')!.name, sourceId: sim.roster.find(u => u.side === 'ally')!.id, target: sim.roster.find(u => u.side === 'enemy')!.name, targetId: sim.roster.find(u => u.side === 'enemy')!.id, attackId: 'probe_summon_after_hit_atk', payload: { amount: 100, abilityName: 'Probe AoE' }, combatActionId: 'probe_summon_after_hit' },
    { eventId: -44, time: 0, turn: 0, actionId: 1, type: 'SUMMON_CREATED', source: sim.roster.find(u => u.side === 'ally')!.name, sourceId: sim.roster.find(u => u.side === 'ally')!.id, target: 'Late Summon', targetId: 'probe_late_summon', payload: { kind: 'summon', name: 'Late Summon' }, combatActionId: 'probe_summon_after_hit' },
  ] as any, sim, [])[0]
  const probeEnemy = sim.roster.find(u => u.side === 'enemy')!
  const probeEnemy2 = { ...probeEnemy, id: 'probe_enemy_2', name: 'Probe Enemy 2' } as any
  const probeMemo = {
    ...sim.roster.find(u => u.side === 'ally')!,
    id: 'probe_memo', name: 'Probe Memo', kind: 'summon', sharesOwnerBuffs: false,
  } as any
  sim.roster.push(probeEnemy2, probeMemo)
  const probeAllyA = sim.roster.find(u => u.side === 'ally')!
  const probeAllyB = sim.roster.filter(u => u.side === 'ally')[1] ?? probeAllyA
  const effectTargetsAction = aggregateCombatActions([
    { eventId: -50, time: 0, turn: 0, actionId: 2, type: 'ACTION_START', source: probeAllyA.name, sourceId: probeAllyA.id, payload: { action: 'ult' }, actionCategory: 'ultimate', combatActionId: 'probe_effect_targets' },
    { eventId: -51, time: 0, turn: 0, actionId: 2, type: 'BUFF_APPLIED', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeAllyB.name, targetId: probeAllyB.id, payload: { id: 'probe_buff', name: 'Probe Buff', mods: [] }, combatActionId: 'probe_effect_targets' },
    { eventId: -52, time: 0, turn: 0, actionId: 2, type: 'HEAL_APPLIED', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeAllyA.name, targetId: probeAllyA.id, payload: { id: 'probe_heal', name: 'Probe Heal', amount: 10 }, combatActionId: 'probe_effect_targets' },
  ] as any, sim, [])[0]
  const multiToughnessAction = aggregateCombatActions([
    { eventId: -60, time: 0, turn: 0, actionId: 3, type: 'ACTION_START', source: probeAllyA.name, sourceId: probeAllyA.id, payload: { action: 'skill' }, actionCategory: 'attack', combatActionId: 'probe_multi_toughness' },
    { eventId: -61, time: 0, turn: 0, actionId: 3, type: 'ABILITY_USED', source: probeAllyA.name, sourceId: probeAllyA.id, attackId: 'probe_multi_toughness_atk', payload: { action: 'skill', abilityName: 'Probe AoE' }, combatActionId: 'probe_multi_toughness' },
    { eventId: -62, time: 0, turn: 0, actionId: 3, type: 'DAMAGE_DEALT', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy.name, targetId: probeEnemy.id, attackId: 'probe_multi_toughness_atk', payload: { amount: 100 }, combatActionId: 'probe_multi_toughness' },
    { eventId: -63, time: 0, turn: 0, actionId: 3, type: 'DAMAGE_DEALT', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy2.name, targetId: probeEnemy2.id, attackId: 'probe_multi_toughness_atk', payload: { amount: 50 }, combatActionId: 'probe_multi_toughness' },
    { eventId: -64, time: 0, turn: 0, actionId: 3, type: 'TOUGHNESS_DAMAGE', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy2.name, targetId: probeEnemy2.id, payload: { amount: 7 }, combatActionId: 'probe_multi_toughness' },
    { eventId: -65, time: 0, turn: 0, actionId: 3, type: 'TOUGHNESS_DAMAGE', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy.name, targetId: probeEnemy.id, payload: { amount: 12 }, combatActionId: 'probe_multi_toughness' },
    { eventId: -66, time: 0, turn: 0, actionId: 3, type: 'TOUGHNESS_DAMAGE', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy2.name, targetId: probeEnemy2.id, payload: { amount: 3 }, combatActionId: 'probe_multi_toughness' },
  ] as any, sim, [])[0]
  const memoSpriteAction = aggregateCombatActions([
    { eventId: -70, time: 0, turn: 0, actionId: 4, type: 'ACTION_START', source: probeMemo.name, sourceId: probeMemo.id, payload: { action: 'skill', abilityName: 'Memo Skill' }, combatActionId: 'probe_memo_action' },
    { eventId: -71, time: 0, turn: 0, actionId: 4, type: 'ABILITY_USED', source: probeMemo.name, sourceId: probeMemo.id, payload: { action: 'skill', abilityName: 'Memo Skill' }, combatActionId: 'probe_memo_action' },
    { eventId: -72, time: 0, turn: 0, actionId: 4, type: 'BUFF_APPLIED', source: probeMemo.name, sourceId: probeMemo.id, target: probeAllyA.name, targetId: probeAllyA.id, payload: { id: 'memo_buff', name: 'Memo Buff', mods: [] }, combatActionId: 'probe_memo_action' },
  ] as any, sim, [])[0]
  sim.roster.splice(sim.roster.indexOf(probeMemo), 1)
  const eventLogAction = aggregateCombatActions([
    { eventId: -80, time: 0, turn: 0, actionId: 5, type: 'ACTION_START', source: probeEnemy.name, sourceId: probeEnemy.id, payload: { action: 'state' }, combatActionId: 'probe_event_log' },
    { eventId: -81, time: 0, turn: 0, actionId: 5, type: 'NOTE', raw: 'Sanction Mode', payload: {}, combatActionId: 'probe_event_log' },
    { eventId: -82, time: 0, turn: 0, actionId: 5, type: 'PHASE_START', source: probeEnemy.name, sourceId: probeEnemy.id, target: probeEnemy.name, targetId: probeEnemy.id, payload: { phase: 'phase_2', index: 1 }, combatActionId: 'probe_event_log' },
  ] as any, sim, [])[0]
  const eventLogText = renderEventLog(eventLogAction)?.textContent ?? ''
  const onKillEnergyAction = aggregateCombatActions([
    { eventId: -90, time: 0, turn: 0, actionId: 6, type: 'ACTION_START', source: probeAllyA.name, sourceId: probeAllyA.id, payload: { action: 'attack' }, actionCategory: 'attack', combatActionId: 'probe_on_kill_energy' },
    { eventId: -91, time: 0, turn: 0, actionId: 6, type: 'ENERGY_GAIN', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeAllyA.name, targetId: probeAllyA.id, payload: { n: 10, reason: 'on_kill' }, combatActionId: 'probe_on_kill_energy' },
  ] as any, sim, [])[0]
  const groupedTargetsAction = aggregateCombatActions([
    { eventId: -100, time: 0, turn: 0, actionId: 7, type: 'ACTION_START', source: probeAllyA.name, sourceId: probeAllyA.id, payload: { action: 'skill' }, actionCategory: 'attack', combatActionId: 'probe_grouped_targets' },
    { eventId: -101, time: 0, turn: 0, actionId: 7, type: 'ABILITY_USED', source: probeAllyA.name, sourceId: probeAllyA.id, attackId: 'probe_grouped_targets_atk', payload: { action: 'skill', abilityName: 'Probe Grouped Skill' }, combatActionId: 'probe_grouped_targets' },
    { eventId: -102, time: 0, turn: 0, actionId: 7, type: 'DAMAGE_DEALT', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy.name, targetId: probeEnemy.id, attackId: 'probe_grouped_targets_atk', payload: { amount: 100 }, combatActionId: 'probe_grouped_targets' },
    { eventId: -103, time: 0, turn: 0, actionId: 7, type: 'BUFF_APPLIED', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeAllyA.name, targetId: probeAllyA.id, payload: { id: 'probe_group_buff', name: 'Probe Group Buff', mods: [] }, combatActionId: 'probe_grouped_targets' },
    { eventId: -104, time: 0, turn: 0, actionId: 7, type: 'DEBUFF_APPLIED', source: probeAllyA.name, sourceId: probeAllyA.id, target: probeEnemy2.name, targetId: probeEnemy2.id, payload: { id: 'probe_group_debuff', name: 'Probe Group Debuff', mods: [] }, combatActionId: 'probe_grouped_targets' },
  ] as any, sim, [])[0]
  const groupedTargetGroups = actionTargetGroups(groupedTargetsAction)
  const groupedTargetLabels = [...(renderActionTargets(groupedTargetsAction, sim)?.querySelectorAll<HTMLElement>('.simActionTargetGroupLabel') ?? [])]
    .map(label => label.textContent ?? '')
  const energyLogText = renderEnergyLog(onKillEnergyAction)?.textContent ?? ''

  const uiHost = doc.getElementById('uiSimulationRoot') as HTMLElement
  const uiStore = new PartyStore()
  const firstSlot = uiStore.active!.slots[0]
  uiStore.patchSlot(firstSlot.id, { kitId: 'robin_summeretto', skillPriority: 2 })
  const secondSlot = uiStore.addSlot()!
  uiStore.patchSlot(secondSlot.id, { kitId: 'sparkle', eidolon: 2, skillPriority: 2 })
  const thirdSlot = uiStore.addSlot()!
  uiStore.patchSlot(thirdSlot.id, { kitId: 'kafka', skillPriority: 2 })
  const fourthSlot = uiStore.addSlot()!
  uiStore.patchSlot(fourthSlot.id, { kitId: 'march7th', eidolon: 2, skillPriority: 2 })
  const uiHandle = initSimulationPanel(uiHost, uiStore)
  uiHandle.refresh()
  const e0Text = uiHost.querySelector('.simPartySlot .simSlotEidolon')?.textContent ?? ''
  const seedInp = [...uiHost.querySelectorAll<HTMLLabelElement>('label')]
    .find(l => l.textContent === 'Seed')?.querySelector('input') as HTMLInputElement
  seedInp.value = '0'
  const uiRunBtn = uiHost.querySelector<HTMLButtonElement>('.simRunBtn')!
  await uiRunBtn.onclick?.call(uiRunBtn, undefined as unknown as PointerEvent)
  const traceCopyBtn = uiHost.querySelector<HTMLButtonElement>('.simTraceCopyBtn')!
  const traceText = uiHost.querySelector('.simTrace')?.textContent ?? ''
  const copied: string[] = []
  const originalNavigator = Object.getOwnPropertyDescriptor(g, 'navigator')
  Object.defineProperty(g, 'navigator', { configurable: true, value: { clipboard: { writeText: async (text: string) => { copied.push(text) } } } })
  await traceCopyBtn.onclick?.call(traceCopyBtn, undefined as unknown as PointerEvent)
  if (originalNavigator) Object.defineProperty(g, 'navigator', originalNavigator)

  const deltaHost = doc.createElement('div')
  doc.body.append(deltaHost)
  const deltaStore = new PartyStore()
  const deltaKits = ['robin_summeretto', 'sparkle', 'kafka', 'march7th']
  deltaStore.active!.slots.forEach((slot, i) => deltaStore.patchSlot(slot.id, {
    kitId: deltaKits[i], eidolon: 2, skillPriority: 2, energyStartFrac: 1,
  }))
  initSimulationPanel(deltaHost, deltaStore).refresh()
  const deltaCustomRadio = deltaHost.querySelector<HTMLInputElement>('input[type="radio"][value="custom"]')!
  deltaCustomRadio.checked = true
  deltaCustomRadio.onchange?.call(deltaCustomRadio, new Event('change'))
  const setDeltaInput = (text: string, value: string) => {
    const input = [...deltaHost.querySelectorAll<HTMLLabelElement>('label')]
      .find(l => l.textContent?.trim() === text)?.querySelector('input') as HTMLInputElement | undefined
    if (!input) throw new Error(`missing input ${text}`)
    input.value = value
    input.onchange?.call(input, new Event('change'))
  }
  deltaHost.querySelector<HTMLButtonElement>('.encounterPickBtn')!.click()
  const deltaPickerSearch = doc.querySelector<HTMLInputElement>('.pickerSearch')!
  deltaPickerSearch.value = 'Ice Edge (1)'
  deltaPickerSearch.oninput?.call(deltaPickerSearch, new Event('input'))
  const deltaPickerCard = [...doc.querySelectorAll<HTMLButtonElement>('.enemyPickerCard')]
    .find(b => b.dataset.variantId === 'Ice Edge (1)')!
  deltaPickerCard.click()
  const deltaPickedEnemy = deltaHost.querySelector<HTMLButtonElement>('.encounterPickBtn')?.textContent ?? ''
  setDeltaInput('Кол-во', '1')
  setDeltaInput('HP', '500000')
  setDeltaInput('Ур', '80')
  setDeltaInput('Жест', '30')
  setDeltaInput('DEF', '0')
  const deltaSeedInp = [...deltaHost.querySelectorAll<HTMLLabelElement>('label')]
    .find(l => l.textContent === 'Seed')?.querySelector('input') as HTMLInputElement
  deltaSeedInp.value = '0'
  const deltaRunBtn = deltaHost.querySelector<HTMLButtonElement>('.simRunBtn')!
  await deltaRunBtn.onclick?.call(deltaRunBtn, undefined as unknown as PointerEvent)
  const deltaCards = [...deltaHost.querySelectorAll<HTMLElement>('.simCombatActionCard')]

  const cards = [...uiHost.querySelectorAll<HTMLElement>('.simCombatActionCard')]
  const tagBadges = [...uiHost.querySelectorAll<HTMLElement>('.simActionTag')]
  const multiTagCards = cards.filter(c => c.querySelectorAll('.simActionTag').length > 1)
  const enemyAttackCard = cards.find(c => c.classList.contains('enemyAttack'))
  const spDeltaLabels = deltaCards.map(c => c.querySelector('.simActionSpDelta')?.textContent ?? '').filter(Boolean)
  const spSquareCounts = deltaCards.map(c => c.querySelectorAll('.simVitalTrack.squares .simVitalSquare').length)
  const spDeltaColors = deltaCards.map(c => (c.querySelector('.simActionSpDelta') as HTMLElement | null)?.style.color ?? '').filter(Boolean)
  const abilityLabels = [...deltaHost.querySelectorAll<HTMLElement>('.simActionHeader .simActionAbility')]
  const abilityIconBeforeName = abilityLabels.some(label => label.firstElementChild?.classList.contains('simActionAbilityIconImg') && label.lastElementChild?.classList.contains('simActionAbilityName'))
  const metaTexts = [...uiHost.querySelectorAll<HTMLElement>('.simActionMeta')].map(n => n.textContent ?? '')
  const metaColors = [...uiHost.querySelectorAll<HTMLElement>('.simActionMeta')].map(n => n.style.color)
  const weaknessIconCount = uiHost.querySelectorAll('.simWeaknessIcon').length
  const duplicateHitPrefix = [...uiHost.querySelectorAll<HTMLElement>('.simActionHitsSummary')].some(n => (n.textContent ?? '').startsWith('Попадания:'))
  const fuaCard = cards.find(c => c.textContent?.includes('Kafka') && c.textContent?.includes('Gentle but Cruel') && !!c.querySelector('.simActionHitsSummary'))
  fuaCard?.click()
  enemyAttackCard?.click()
  const actionInspectorText = uiHost.querySelector('.simLogInspector')?.textContent ?? ''
  const toughnessBars = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorUnitState .simToughnessBar')]
  const toughnessText = toughnessBars.map(bar => bar.textContent ?? '').join(' | ')
  const stateTab = [...uiHost.querySelectorAll<HTMLButtonElement>('.simInspectorTab')]
    .find(b => b.textContent === 'Состояние')
  const actionTabGridCount = uiHost.querySelectorAll('.simLogInspectorGrid').length
  const encounterPreview = uiHost.querySelector('.encounterIconPreview')
  const encounterSelect = encounterPreview?.querySelector('select')
  const encounterIcons = [...uiHost.querySelectorAll<HTMLImageElement>('.encounterEnemyIcon img')].map(img => img.getAttribute('src') ?? '')
  const enemyCardVitalLabels = [...(enemyAttackCard?.querySelectorAll<HTMLElement>('.simVitalLabel') ?? [])]
    .map(label => label.textContent ?? '')
  const shieldBadges = [...uiHost.querySelectorAll<HTMLElement>('.simActionShieldDamage')]
    .map(badge => badge.textContent ?? '')
  const shieldHitLabels = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorHitShieldDamage')]
    .map(label => label.textContent ?? '')

  const { effectIconUrl, enemyIconUrl, gearIconUrl, statIconUrlForKey, summonIconUrl } = await import('../../src/ui/icons')

  const summonNames = [
    'Demiurge', 'Evey', 'Fuyuan', 'Garmentmaker', 'Lightning-Lord',
    'Little Ica', 'Mem', 'Netherwing: Pollux', 'Numby', 'Souldragon', 'Summer Songbirds',
  ]
  const missingSummonIcons = summonNames.filter(name => !summonIconUrl(name))

  const allies = sim.roster.filter(u => u.side === 'ally')
  const enemy = sim.roster.find(u => u.side === 'enemy')!
  const allyA = allies[0]
  sim.gearMap.set(allyA.id, {
    cone: { id: 'secret_vow' }, coneSi: 1, mods: [], pieces: [],
    relicSets: [], relicSets4: [{ id: 'musketeer', name: 'Musketeer' }], planar: undefined, post: [],
  } as any)
  const targetPick = resolveTargets({
    actorId: enemy.id,
    rule: 'single',
    candidates: [
      { id: 'summon_probe', name: 'Souldragon', side: 'ally', kind: 'summon', sharesOwnerBuffs: true, hp: 100, aggro: 999, dead: false } as any,
      { id: 'char_probe', name: 'Character', side: 'ally', kind: 'char', hp: 100, aggro: 1, dead: false } as any,
    ],
    rng: () => 0,
  })
  const memoSpritePick = resolveTargets({
    actorId: enemy.id,
    rule: 'aoe',
    candidates: [
      { id: 'memo_probe', name: 'Summer Songbirds', side: 'ally', kind: 'summon', hp: 100, dead: false } as any,
      { id: 'summon_probe', name: 'Souldragon', side: 'ally', kind: 'summon', sharesOwnerBuffs: true, hp: 100, dead: false } as any,
    ],
    rng: () => 0,
  })
  const taggedAction = (id: string, seed: number, payload: Record<string, unknown>, actionCategory: string | undefined, tail: any[]): any => aggregateCombatActions([
    { eventId: -200 - seed * 10, time: 0, turn: 0, actionId: seed, type: 'ACTION_START', source: allyA.name, sourceId: allyA.id, payload, actionCategory, combatActionId: id },
    ...tail.map((e, i) => ({ eventId: -201 - seed * 10 - i, time: 0, turn: 0, actionId: seed, source: allyA.name, sourceId: allyA.id, combatActionId: id, ...e })),
  ] as any, sim, [])[0]
  const taggedAttackTail = (attackId: string, abilityName: string): any[] => [
    { type: 'ABILITY_USED', attackId, payload: { abilityName } },
    { type: 'HIT_START', attackId, target: enemy.name, targetId: enemy.id, payload: { abilityName } },
    { type: 'DAMAGE_DEALT', attackId, target: enemy.name, targetId: enemy.id, payload: { amount: 100, abilityName } },
  ]
  const seeleTags = taggedAction('probe_tag_extra', 10, { action: 'skill', abilityName: 'Seele Skill' }, 'attack', [
    ...taggedAttackTail('probe_tag_extra_atk', 'Seele Skill'),
    { type: 'EXTRA_TURN', payload: {} },
  ])
  const souldragonTags = taggedAction('probe_tag_bonus', 11, { action: 'skill', abilityName: 'Souldragon Strike' }, 'followUpAttack',
    taggedAttackTail('probe_tag_bonus_atk', 'Souldragon Strike'))
  const yunliTags = taggedAction('probe_tag_counter', 12, { action: 'ult', abilityName: 'Enhanced Counter', counter: true, actionKind: 'followUpAttack' }, 'followUpAttack', [
    ...taggedAttackTail('probe_tag_counter_atk', 'Enhanced Counter'),
    { type: 'BUFF_APPLIED', target: allyA.name, targetId: allyA.id, payload: { id: 'yunli_buff', name: 'Enhanced Counter' } },
  ])
  const castoriceTags = taggedAction('probe_tag_summon', 13, { action: 'ult', abilityName: 'Castorice Ult' }, undefined, [
    { type: 'SUMMON_CREATED', target: 'Pollux', targetId: 'probe_tag_pollux', payload: { kind: 'summon', name: 'Pollux' } },
  ])
  const dotBreakTags = taggedAction('probe_tag_dot', 14, { action: 'skill', abilityName: 'Break Restore' }, 'effect', [
    { type: 'DOT_APPLIED', target: enemy.name, targetId: enemy.id, payload: { kind: 'Bleed', name: 'Bleed' } },
    { type: 'DOT_TICK', target: enemy.name, targetId: enemy.id, payload: { kind: 'Bleed', name: 'Bleed', amount: 50 } },
    { type: 'BUFF_APPLIED', target: allyA.name, targetId: allyA.id, payload: { id: 'hp_restore', name: 'HP Restore', reason: 'break_restore' } },
  ])
  const dotTopLevelAction = taggedAction('probe_dot_top_level', 15, { action: 'skill' }, 'effect', [
    { type: 'DOT_APPLIED', target: enemy.name, targetId: enemy.id, element: 'Fire', payload: { kind: 'Burn', turns: 3, stacks: 2, baseDmg: 77 }, provenance: { abilityName: 'Burn Skill' } },
  ])
  const shieldDedupeAction = taggedAction('probe_shield_dedupe', 16, { action: 'skill' }, 'effect', [
    { type: 'BUFF_APPLIED', target: allyA.name, targetId: allyA.id, payload: { id: 'probe_dupe_shield', name: 'Probe Dupe Shield', shield: 42 } },
    { type: 'SHIELD_APPLIED', target: allyA.name, targetId: allyA.id, payload: { id: 'probe_dupe_shield', name: 'Probe Dupe Shield', amount: 42 } },
  ])
  const controlStateAction = taggedAction('probe_control_state', 17, { action: 'skill' }, 'effect', [
    { type: 'CONTROL_APPLIED', target: enemy.name, targetId: enemy.id, payload: { id: 'Freeze', name: 'Freeze', turns: 2, stacks: 1 } },
    { type: 'DOT_TICK', target: enemy.name, targetId: enemy.id, element: 'Ice', payload: { kind: 'Shock', name: 'Shock', amount: 55 } },
    { type: 'CONTROL_EXPIRED', target: enemy.name, targetId: enemy.id, payload: { id: 'Freeze', name: 'Freeze' } },
  ])
  const enemyCategory = aggregateCombatActions([
    { eventId: -1, time: 0, turn: 0, actionId: 0, type: 'ACTION_START', source: enemy.name, sourceId: enemy.id, payload: { action: 'attack' }, combatActionId: 'probe_enemy' },
    { eventId: -2, time: 0, turn: 0, actionId: 0, type: 'ABILITY_USED', source: enemy.name, sourceId: enemy.id, payload: { action: 'attack' }, combatActionId: 'probe_enemy' },
    { eventId: -3, time: 0, turn: 0, actionId: 0, type: 'HIT_START', source: enemy.name, sourceId: enemy.id, target: allyA.name, targetId: allyA.id, attackId: 'probe_enemy_hit', payload: { abilityName: 'Icy Wind' }, combatActionId: 'probe_enemy' },
    { eventId: -4, time: 0, turn: 0, actionId: 0, type: 'DAMAGE_DEALT', source: enemy.name, sourceId: enemy.id, target: allyA.name, targetId: allyA.id, attackId: 'probe_enemy_hit', payload: { amount: 100, abilityName: 'Icy Wind' }, combatActionId: 'probe_enemy' },
  ] as any, sim, [])[0]?.category
  const techniqueCategory = aggregateCombatActions([
    { eventId: -3, time: 0, turn: 0, actionId: 0, type: 'TECHNIQUE_APPLIED', source: allyA.name, sourceId: allyA.id, payload: { technique: 'Probe Technique' }, provenance: { sourceKind: 'technique' } },
  ] as any, sim, [])[0]?.category
  const effectAllyB = allies[1] ?? allies[0]
  const techniqueEffects = aggregateCombatActions([
    { eventId: -30, time: 0, turn: 0, actionId: 0, type: 'TECHNIQUE_APPLIED', source: allyA.name, sourceId: allyA.id, payload: { technique: 'Probe Effects' }, provenance: { sourceKind: 'technique' } },
    { eventId: -31, time: 0, turn: 0, actionId: 0, type: 'TARGET_SELECTED', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: {} },
    { eventId: -32, time: 0, turn: 0, actionId: 0, type: 'DAMAGE_DEALT', source: allyA.name, sourceId: allyA.id, target: enemy.name, targetId: enemy.id, payload: { amount: 333 } },
    { eventId: -33, time: 0, turn: 0, actionId: 0, type: 'HEAL_APPLIED', source: allyA.name, sourceId: allyA.id, target: effectAllyB.name, targetId: effectAllyB.id, payload: { amount: 222, id: 'probe_heal', name: 'Probe Heal' } },
    { eventId: -34, time: 0, turn: 0, actionId: 0, type: 'SP_GAIN', source: allyA.name, sourceId: allyA.id, payload: { n: 1 } },
    { eventId: -35, time: 0, turn: 0, actionId: 0, type: 'SHIELD_APPLIED', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: { amount: 111, id: 'probe_shield', name: 'Probe Shield' } },
  ] as any, sim, [])[0]
  const fullHpHealAction = aggregateCombatActions([
    { eventId: -36, time: 0, turn: 0, actionId: 0, type: 'HEAL_APPLIED', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: { amount: 0, requested: 777, applied: 0, id: 'probe_full_hp_heal', name: 'Probe Full HP Heal' }, combatActionId: 'probe_full_hp_heal' },
  ] as any, sim, [])[0]
  const fullHpHealText = renderSupportLog(fullHpHealAction as any)?.textContent ?? ''
  const fullHpHealParts = supportSummaryParts(fullHpHealAction as any)
  const dhSim = runBattle({
    team: presetTeam('danhengperman'),
    enemy: { ...ENEMY_PRESETS.mob, count: 1 },
    cycles: 1,
    seed: 7,
    techniques: ['danhengperman'],
    log: { debug: 4, captureUiHistory: true, snapshotOn: ['ACTION_START', 'ACTION_END', 'DAMAGE_DEALT'] },
  } as any)
  const dhActions = aggregateCombatActions(dhSim.logger.events, dhSim, collectSnapshots(dhSim.logger))
  const dhTechnique = dhActions.find(a => a.category === 'technique' && a.abilityName === 'Earthrend')
  const bondTargetId = dhSim.logger.events.find(e => e.type === 'TARGET_SELECTED' && e.payload.role === 'bondmate')?.targetId ?? ''
  const dhShieldTargets = new Set(dhTechnique?.effects.shields.map(s => s.targetId) ?? [])
  const dhSupportRows = dhTechnique ? [...(renderSupportLog(dhTechnique)?.querySelectorAll('.simActionSupportRow') ?? [])] : []
  const summonCategory = aggregateCombatActions([
    { eventId: -4, time: 0, turn: 0, actionId: 0, type: 'SUMMON_CREATED', source: allyA.name, sourceId: allyA.id, target: 'Souldragon', targetId: 'probe_summon', payload: { kind: 'summon', name: 'Souldragon' }, combatActionId: 'probe_summon' },
  ] as any, sim, [])[0]?.category
  const shieldHitAction = aggregateCombatActions([
    { eventId: -6, time: 0, turn: 0, actionId: 0, type: 'ACTION_START', source: enemy.name, sourceId: enemy.id, payload: { action: 'attack' }, actionCategory: 'attack', combatActionId: 'probe_shield_hit' },
    { eventId: -7, time: 0, turn: 0, actionId: 0, type: 'ABILITY_USED', source: enemy.name, sourceId: enemy.id, attackId: 'probe_shield_atk', payload: { action: 'attack', abilityName: 'Icy Wind' }, combatActionId: 'probe_shield_hit' },
    { eventId: -8, time: 0, turn: 0, actionId: 0, type: 'SHIELD_ABSORBED', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, attackId: 'probe_shield_atk', payload: { id: 'march_shield', name: 'March Shield', amount: 320, incoming: 800, remaining: 180 }, combatActionId: 'probe_shield_hit' },
    { eventId: -9, time: 0, turn: 0, actionId: 0, type: 'DAMAGE_DEALT', source: enemy.name, sourceId: enemy.id, target: allyA.name, targetId: allyA.id, attackId: 'probe_shield_atk', payload: { amount: 100, abilityName: 'Icy Wind' }, combatActionId: 'probe_shield_hit' },
  ] as any, sim, [])[0]
  const shieldHit = shieldHitAction?.attacks[0]?.hits[0]
  const shieldOnlyAction = aggregateCombatActions([
    { eventId: -10, time: 0, turn: 0, actionId: 0, type: 'ACTION_START', source: enemy.name, sourceId: enemy.id, payload: { action: 'attack' }, actionCategory: 'attack', combatActionId: 'probe_shield_only' },
    { eventId: -11, time: 0, turn: 0, actionId: 0, type: 'ABILITY_USED', source: enemy.name, sourceId: enemy.id, attackId: 'probe_shield_only_atk', payload: { action: 'attack', abilityName: 'Icy Wind' }, combatActionId: 'probe_shield_only' },
    { eventId: -12, time: 0, turn: 0, actionId: 0, type: 'SHIELD_ABSORBED', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, attackId: 'probe_shield_only_atk', payload: { id: 'march_shield', name: 'March Shield', amount: 250 }, combatActionId: 'probe_shield_only' },
  ] as any, sim, [])[0]
  const shieldOnlyHit = shieldOnlyAction?.attacks[0]?.hits[0]
  const allyB = allies[1] ?? allies[0]
  sim.addBuff(allyB, {
    id: 'scope_ally_buff', name: 'Scope Ally Buff', mods: [{ stat: 'atkPct', value: 0.12 }],
    turns: 2, stacks: 2, maxStacks: 5, sourceId: allyA.id,
  })
  sim.addBuff(enemy, {
    id: 'scope_enemy_debuff', name: 'Scope Enemy Debuff', mods: [{ stat: 'defPct', value: -0.1 }],
    turns: 2, debuff: true, sourceId: allyA.id,
  })
  const stateSnapshot = sim.logger.snapshot()
  const makeEffect = (id: string, name: string, source: { id: string; name: string }, target: { id: string; name: string }, extra: Record<string, unknown> = {}): any => ({
    id,
    name,
    targetId: target.id,
    targetName: target.name,
    stacks: 1,
    turns: 2,
    sourceId: source.id,
    sourceName: source.name,
    appliedById: source.id,
    mods: [],
    ...extra,
  })
  const syntheticAction = {
    id: 'test',
    combatActionId: 'test',
    order: 0,
    category: 'effect',
    sourceId: allyB.id,
    sourceName: allyB.name,
    abilityName: 'Attribution Test',
    av: 0,
    turn: 0,
    actionId: 0,
    targetIds: [],
    targetNames: [],
    attacks: [],
    totalDamage: 0,
    events: [],
    beforeSnapshot: stateSnapshot,
    afterSnapshot: stateSnapshot,
    effects: {
      buffs: [
        makeEffect('atk_up', 'ATK Up', allyA, allyB, { mods: [{ stat: 'atkPct', value: 0.2 }], provenance: { abilityName: 'Probe Ult' } }),
        makeEffect('cipher', 'Cipher', allyA, allyB, { mods: [{ stat: 'critDmg', value: 0.1 }] }),
        makeEffect('flat_atk', 'Flat ATK', allyB, allyB, { mods: [{ stat: 'atkFlat', value: 100 }] }),
        makeEffect('cond_cd', 'Conditional CD', allyA, allyB, { mods: [{ stat: 'critDmg', value: 0.3, whenAbility: ['skill'] }] }),
        makeEffect('shield_buff', 'March Shield Buff', allyA, allyB, { shield: 500.75 }),
        makeEffect('atk_up', 'ATK Up', allyB, allyB, { mods: [{ stat: 'atkPct', value: 0.2 }] }),
        makeEffect('stacked_total', 'Stacked Total', allyA, allyB, { stacks: 3, mods: [{ stat: 'atkPct', value: 0.04 }] }),
        makeEffect('stat_fallback', 'Stat Fallback', allyA, allyB, { stacks: 2, mods: [{ stat: 'defPct', value: 0.06 }] }),
        makeEffect('mirror', 'Mirror', allyA, allyA),
        makeEffect('mirror', 'Mirror', allyA, allyB),
        makeEffect('last_wins', 'Last Wins', allyA, allyB, { stacks: 1 }),
        makeEffect('last_wins', 'Last Wins', allyA, allyB, { stacks: 3 }),
        makeEffect('no_max', 'No Max', allyA, allyB, { stacks: 2 }),
        makeEffect('no_max', 'No Max', allyA, allyB, { stacks: 1 }),
        makeEffect('capped_stack', 'Capped Stack', allyA, allyB, { stacks: 3, maxStacks: 5, mods: [{ stat: 'atkPct', value: 0.04 }] }),
        makeEffect('aggro_up', 'Probe Aggro', allyA, allyB, { mods: [{ stat: 'aggro', value: 150 }] }),
        makeEffect('fire_vuln', 'Fire Vulnerability', allyA, allyB, { mods: [{ stat: 'vuln:Fire', value: 0.3 }] }),
        makeEffect('gear', 'Gear', allyA, allyB, { provenance: { sourceKind: 'relic' }, mods: [{ stat: 'atkPct', value: 0.15 }] }),
        makeEffect('musketeer_set', 'Musketeer ATK', allyA, allyB, { sourceId: 'gear', appliedById: allyA.id, provenance: { sourceKind: 'relic' }, mods: [{ stat: 'atkPct', value: 0.12 }] }),
        makeEffect('cone_crit', 'Cone Crit', allyA, allyB, { sourceId: 'gear', appliedById: allyA.id, provenance: { sourceKind: 'lightCone' }, mods: [{ stat: 'critDmg', value: 0.24 }] }),
        makeEffect('traces', 'Traces', allyA, allyB, { provenance: { sourceKind: 'trace' }, mods: [{ stat: 'critDmg', value: 0.2 }] }),
        makeEffect('genius_def', 'Genius DEF Ignore', enemy, allyB, { sourceId: 'gear', appliedById: allyA.id, mods: [{ stat: 'defIgnore', value: 0.2 }] }),
        makeEffect('gear_atk', 'Gear ATK', allyA, allyB, { sourceId: 'gear', appliedById: allyA.id, mods: [{ stat: 'atkPct', value: 0.12 }] }),
      ],
      debuffs: [makeEffect('enemy_only', 'Enemy Only Debuff', enemy, enemy, { mods: [{ stat: 'defPct', value: -0.1 }] })],
      dots: [{
        id: 'Shock',
        name: 'Shock',
        targetId: allyB.id,
        targetName: allyB.name,
        element: 'Lightning',
        damage: 100,
        turns: 2,
        stacks: 1,
        sourceId: allyA.id,
        sourceName: allyA.name,
      }],
      controls: [makeEffect('Freeze', 'Probe Freeze', allyA, allyB, { turns: 2 })],
      ticks: [{
        id: 'Shock',
        name: 'Shock',
        targetId: allyB.id,
        targetName: allyB.name,
        element: 'Lightning',
        amount: 55,
        sourceId: allyA.id,
        sourceName: allyA.name,
      }],
      shields: [{
        id: 'march_shield',
        name: 'March Shield',
        targetId: allyB.id,
        targetName: allyB.name,
        amount: 500.75,
        sourceId: allyA.id,
        sourceName: allyA.name,
      }],
      shieldDamage: [{
        id: 'march_shield',
        name: 'March Shield',
        targetId: allyB.id,
        targetName: allyB.name,
        amount: 320,
        incoming: 800,
        remaining: 180,
        sourceId: allyA.id,
        sourceName: allyA.name,
      }],
      heals: [{
        id: 'probe_heal',
        name: 'Probe Heal',
        targetId: allyB.id,
        targetName: allyB.name,
        amount: 350,
        sourceId: allyA.id,
        sourceName: allyA.name,
      }],
      removals: [
        { kind: 'buff', id: 'expired', name: 'Expired Buff', targetId: allyB.id, targetName: allyB.name, stacks: 2, sourceId: allyA.id, sourceName: allyA.name },
        { kind: 'debuff', id: 'dispel', name: 'Dispel Debuff', targetId: allyB.id, targetName: allyB.name, stacks: 1, sourceId: allyA.id, sourceName: allyA.name },
      ],
      energyChanges: [],
      spChanges: [],
      breaks: [],
      other: [],
    },
  } as unknown as Parameters<typeof renderEffectSummary>[0]

  const effectHost = doc.createElement('div')
  const enemyEffectHost = doc.createElement('div')
  const allEffectsHost = doc.createElement('div')
  const stackHost = doc.createElement('div')
  const memoSpriteHost = doc.createElement('div')
  const supportHost = doc.createElement('div')
  doc.body.append(effectHost, enemyEffectHost, allEffectsHost, stackHost, memoSpriteHost, supportHost)
  const supportEl = renderSupportLog(syntheticAction as any)
  if (supportEl) supportHost.append(supportEl)
  const supportText = supportHost.textContent ?? ''
  const supportParts = supportSummaryParts(syntheticAction as any)
  const windDamage = damageDisplay({ attacks: [{ hits: [{ element: 'Wind', attackType: 'basic' }] }] } as any)
  const elationDamage = damageDisplay({ attacks: [{ hits: [{ element: 'Wind', attackType: 'elation' }] }] } as any)
  const trueDamage = damageDisplay({ attacks: [{ hits: [{ element: 'Ice', attackType: 'true', damage: 100 }] }] } as any)
  const trueDamageParts = damageElementParts({ attacks: [{ hits: [{ element: 'Ice', attackType: 'true', damage: 100 }] }] } as any)
  const multiElementDamage = damageElementParts({ attacks: [{ hits: [
    { element: 'Physical', damage: 10, attackType: 'add' },
    { element: 'Quantum', damage: 100, attackType: 'add' },
  ] }] } as any)
  const multiElementColors = multiElementDamage.map(p => p.color)
  const enemyVitalLabels = vitalLabelsForSnapshot({ kind: 'char', side: 'enemy' } as any)
  const trueSummonVitalLabels = vitalLabelsForSnapshot({ kind: 'summon', sharesOwnerBuffs: true })
  const memoSpriteVitalLabels = vitalLabelsForSnapshot({ kind: 'summon' })
  const charVitalLabels = vitalLabelsForSnapshot({ kind: 'char' })
  renderEffectSummary(syntheticAction, sim, effectHost, allyB.id)
  renderEffectSummary(syntheticAction, sim, enemyEffectHost, enemy.id)
  renderEffectSummary(syntheticAction, sim, allEffectsHost)
  const stackBefore = JSON.parse(JSON.stringify(stateSnapshot)) as typeof stateSnapshot
  const stackAfter = JSON.parse(JSON.stringify(stateSnapshot)) as typeof stateSnapshot
  stackBefore.units[allyB.id].buffs.push({ id: 'refund_stack', name: 'Refund Stack', stacks: 1, turns: 2, mods: [] } as any)
  stackAfter.units[allyB.id].buffs.push({ id: 'refund_stack', name: 'Refund Stack', stacks: 3, turns: 2, mods: [] } as any)
  renderEffectSummary({ ...syntheticAction, beforeSnapshot: stackBefore, afterSnapshot: stackAfter } as any, sim, stackHost, allyB.id)
  const namedSummonHost = doc.createElement('div')
  doc.body.append(namedSummonHost)
  const memoSpriteProbe = allyA as { kind?: string; name?: string }
  const originalKind = memoSpriteProbe.kind
  const originalName = memoSpriteProbe.name
  memoSpriteProbe.kind = 'summon'
  renderEffectSummary(syntheticAction, sim, memoSpriteHost, allyB.id)
  memoSpriteProbe.name = 'Souldragon'
  renderEffectSummary(syntheticAction, sim, namedSummonHost, allyB.id)
  memoSpriteProbe.kind = originalKind
  memoSpriteProbe.name = originalName

  const buffRows = (host: HTMLElement = effectHost) => [...host.querySelectorAll<HTMLElement>('.simInspectorEffect.buff')]
  const rowsNamed = (name: string, host: HTMLElement = effectHost) => buffRows(host).filter(row => row.querySelector('.simInspectorEffectName')?.textContent === name)
  const textOf = (row?: HTMLElement) => row?.textContent ?? ''
  const hostText = (host: HTMLElement) => host.textContent ?? ''
  const sourceOf = (row?: HTMLElement) => row?.querySelector('.simInspectorEffectSource')?.textContent ?? ''
  const targetOf = (row?: HTMLElement) => row?.querySelector('.simInspectorEffectTarget')?.textContent ?? ''
  const removalRows = () => [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.removal')]
  const shieldEffectRow = [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.shield')]
    .find(row => /March Shield/.test(textOf(row)))

  const dotWithSource = Object.values(stateSnapshot.units)
    .flatMap(u => u.dots.map(d => ({ unit: u, dot: d })))
    .find(x => !!x.dot.sourceId)
  const engineDebuffIds = sim.units().flatMap(u => u.buffs.filter(isDebuff).map(b => b.id))
  const snapshotDebuffIds = new Set(Object.values(stateSnapshot.units).flatMap(u => u.debuffs.map(d => d.id)))
  const snapshotBuffIds = new Set(Object.values(stateSnapshot.units).flatMap(u => u.buffs.map(b => b.id)))
  const totals = snapshotEffectModTotals({
    buffs: [
      { id: 'flat1', name: 'Flat1', stacks: 2, turns: 2, mods: [{ stat: 'atkFlat', value: 100 }] },
      { id: 'flat2', name: 'Flat2', stacks: 1, turns: 2, mods: [{ stat: 'atkFlat', value: 50 }] },
      { id: 'pct', name: 'Pct', stacks: 1, turns: 2, mods: [{ stat: 'atkPct', value: 0.25 }] },
      { id: 'cond', name: 'Cond', stacks: 3, turns: 2, mods: [{ stat: 'critDmg', value: 0.3, whenAbility: ['skill'] }] },
    ],
    debuffs: [],
  } as unknown as Parameters<typeof snapshotEffectModTotals>[0])

  const gate = sim.addEnemy({ name: 'Aurumaton Gatekeeper', hp: 100_000, spd: 100, level: 95, toughness: 90, weaknesses: ['Imaginary'] as any, atk: 800 })
  const enemyCountBeforeSanction = sim.units().filter(u => u.side === 'enemy').length
  const gatePassive = enemyBehavior('Aurumaton Gatekeeper')?.passive
  for (let i = 0; i < 3; i++) gatePassive?.onHitTaken?.(sim, gate, allyA, 'skill')
  const dragonfish = sim.units().filter(u => u.side === 'enemy' && u.name.includes('Illumination Dragonfish'))
  const robinSim = runBattle({
    team: presetTeam('robin_summeretto'),
    enemy: { ...ENEMY_PRESETS.mob, count: 1 },
    cycles: 1,
    seed: 7,
    log: { debug: 0 },
  })
  const robinBird = robinSim.units().find(u => u.name === 'Summer Songbirds')
  const requestedSim = runBattle({
    team: [
      { kitId: 'seele', skillPriority: 2 },
      { kitId: 'danhengperman', skillPriority: 2 },
      { kitId: 'robin_summeretto', skillPriority: 2 },
      { kitId: 'sparkle', skillPriority: 2 },
    ],
    enemy: { ...ENEMY_PRESETS.mob, count: 1, hp: 500_000 },
    cycles: 4,
    seed: 7,
    log: { debug: 4, captureUiHistory: true, snapshotOn: ['ACTION_START', 'ACTION_END', 'DAMAGE_DEALT'] },
  })
  const requestedActions = aggregateCombatActions(
    requestedSim.logger.events,
    requestedSim,
    collectSnapshots(requestedSim.logger)
  )
  const requestedRoster = new Map(requestedSim.roster.map(u => [u.id, u] as const))
  const requestedSide = (id?: string) => id ? requestedRoster.get(id)?.side ?? '?' : '?'
  const requestedCharActions = requestedActions.filter(a => {
    const unit = a.sourceId ? requestedRoster.get(a.sourceId) : undefined
    return unit?.side === 'ally' && unit?.kind === 'char'
  })
  const requestedRawSlotNames = requestedCharActions
    .map(a => a.abilityName.toLowerCase())
    .filter(name => ['attack', 'ability', 'basic', 'skill', 'ult', 'ultimate', 'technique'].includes(name))
  const requestedEnemyBuffsFromAllies = requestedSim.logger.events.filter(e =>
    /^BUFF_(APPLIED|STACKED|REFRESHED)$/.test(e.type)
    && requestedSide(e.sourceId) === 'ally'
    && requestedSide(e.targetId) === 'enemy'
  )
  const rsuDebuffApplied = requestedSim.logger.events.some(e =>
    e.type === 'DEBUFF_APPLIED'
    && String((e.payload as Record<string, unknown>).id) === 'rsu_member'
    && requestedSide(e.sourceId) === 'ally'
    && requestedSide(e.targetId) === 'enemy'
  )
  const energyDeltaLabels = deltaCards.map(c => c.querySelector('.simActionEnergyDelta')?.textContent ?? '').filter(Boolean)
  const inlineSpDeltaCount = deltaCards.filter(c => !!c.querySelector('.simVitalBar .simActionSpDelta')).length
  const ultimateCard = deltaCards.find(c => [...c.querySelectorAll('.simActionTag')].some(t => t.textContent === 'Ультимейт'))
  const ultimateEnergyVital = [...(ultimateCard?.querySelectorAll<HTMLElement>('.simVitalBar') ?? [])]
    .find(bar => bar.querySelector('.simVitalLabel')?.textContent === 'EN')
  const ultimateEnergyText = ultimateEnergyVital?.querySelector('.simVitalValue')?.textContent ?? ''
  const ultimateEnergyDelta = ultimateCard?.querySelector('.simActionEnergyDelta')?.textContent ?? ''
  const toughnessDamageLabels = [...deltaHost.querySelectorAll<HTMLElement>('.simActionToughnessDamage')]
    .map(label => label.textContent ?? '')
  const energyProbeAction = aggregateCombatActions([
    { eventId: -300, time: 0, turn: 0, actionId: 300, type: 'ACTION_START', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: { action: 'effect' }, actionCategory: 'effect', combatActionId: 'probe_energy' },
    { eventId: -301, time: 0, turn: 0, actionId: 300, type: 'ENERGY_GAIN', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: { n: 30, reason: 'Probe' }, combatActionId: 'probe_energy' },
    { eventId: -302, time: 0, turn: 0, actionId: 300, type: 'ENERGY_LOSS', source: allyA.name, sourceId: allyA.id, target: allyA.name, targetId: allyA.id, payload: { amount: 12, reason: 'Probe' }, combatActionId: 'probe_energy' },
  ] as any, sim, [])[0]

  for (const row of store.getState().team) store.dispatch({ type: 'team/remove', id: row.id })
  for (const row of originalTeam) store.dispatch({ type: 'team/add', row })

  return [
    raw('simulation panel renders run button', !!runBtn, runBtn?.textContent ?? 'missing'),
    raw('run button disabled without active party', runBtn?.disabled === true, String(runBtn?.disabled)),
    raw('custom encounter builder renders', !!addWaveBtn, addWaveBtn?.textContent ?? 'missing'),
    raw('enemy picker selection configures custom encounter', deltaPickedEnemy === 'Ice Edge (1)', deltaPickedEnemy || 'missing'),
    raw('initSimulationPanel returns handle', typeof handle?.refresh === 'function', String(typeof handle?.refresh)),
    raw('trace copy button copies the whole trace', !!traceText && copied[0] === traceText && traceCopyBtn.textContent === 'Скопировано', `${copied.length}`),
    raw('UI history captures snapshots at debug 4', snapshots.length > 0, `snapshots=${snapshots.length}`),
    raw('actions link to captured snapshots', actions.some(a => !!a.beforeSnapshot), `with before=${actions.filter(a => !!a.beforeSnapshot).length}`),
    raw('actions have sequential order', actions.every((a, i) => a.order === i + 1), `actions=${actions.length}`),
    raw('requested team resolves character ability names', requestedCharActions.length > 0 && requestedRawSlotNames.length === 0 && ['Sheathed Blade', 'Terra Omnibus', 'Summer Strums the Soul', 'Monodrama'].every(name => requestedCharActions.some(a => a.abilityName === name)), `raw=${requestedRawSlotNames.join(',') || 'none'} names=${[...new Set(requestedCharActions.map(a => a.abilityName))].join('|')}`),
    raw('requested team keeps enemy vulnerability as debuff', requestedEnemyBuffsFromAllies.length === 0 && rsuDebuffApplied, `buffs=${requestedEnemyBuffsFromAllies.length} debuff=${rsuDebuffApplied}`),
    raw('attacks resolve action ability names', actions.some(a => a.attacks.some(x => !!x.abilityName && x.abilityName !== 'Attack')), `attacks=${actions.reduce((n, a) => n + a.attacks.length, 0)}`),
    raw('attack actions keep real hits', actions.every(a => a.category !== 'attack' || a.attacks.length > 0), `empty=${actions.filter(a => a.category === 'attack' && a.attacks.length === 0).map(a => a.abilityName).join(',')}`),
    raw('enemy technique and summon actions typed', enemyCategory === 'enemyAttack' && techniqueCategory === 'technique' && summonCategory === 'summon', `enemy=${enemyCategory} technique=${techniqueCategory} summon=${summonCategory}`),
    raw('state tab removed', !stateTab, String(!!stateTab)),
    raw('SP delta shown with ability', spDeltaLabels.some(t => /^[+-]?\d+ ОД$/.test(t)), spDeltaLabels.join('|') || 'none'),
    raw('SP delta rendered inline with SP value', inlineSpDeltaCount > 0 && inlineSpDeltaCount === spDeltaLabels.length, `inline=${inlineSpDeltaCount} total=${spDeltaLabels.length}`),
    raw('energy delta rendered inline with EN bar', energyDeltaLabels.some(t => /^[+-]?[\d,]+\s+EN$/.test(t)) && deltaCards.some(c => !!c.querySelector('.simVitalBar .simActionEnergyDelta')), energyDeltaLabels.join('|') || 'none'),
    raw('SP uses square track and SP color', spSquareCounts.some(n => n > 0) && spDeltaColors.includes('#f2c94c'), `squares=${spSquareCounts.join(',')} colors=${spDeltaColors.join(',')}`),
    raw('ability icon sits left of ability name', abilityIconBeforeName, `labels=${abilityLabels.length}`),
    raw('action meta uses action turn and light color', metaTexts.some(t => /\| ACT \d+$/.test(t)) && metaColors.every(c => c === '#e6ebf2'), `${metaTexts[0] ?? 'none'} | ${metaColors.join(',')}`),
    raw('enemy weakness icons render by toughness value', weaknessIconCount > 0, `icons=${weaknessIconCount}`),
    raw('hit summary omits duplicate Попадания label', !duplicateHitPrefix, `cards=${uiHost.querySelectorAll('.simActionHitsSummary').length}`),
    raw('ultimate energy displays actual charge and refund', !!ultimateCard && /^\d+\//.test(ultimateEnergyText) && !/^0\//.test(ultimateEnergyText) && /^\+\d+ EN$/.test(ultimateEnergyDelta), `${ultimateEnergyText || 'missing'} delta=${ultimateEnergyDelta || 'missing'}`),
    raw('toughness damage aggregated and rendered under damage', actions.some(a => a.toughnessDamage > 0) && toughnessDamageLabels.some(t => /^Tgh:\s*[\d,]+$/.test(t)), `aggregate=${actions.reduce((n, a) => n + a.toughnessDamage, 0)} labels=${toughnessDamageLabels.join('|') || 'none'}`),
    raw('single encounter replaces preset picker', !encounterSelect && encounterIcons.length >= 3, `select=${!!encounterSelect} icons=${encounterIcons.length}`),
    raw('enemy icons resolve aliases', enemyIconUrl('Ice Edge') === enemyIconUrl('Ice Edge (1)') && enemyIconUrl('Sting') === enemyIconUrl('Gnaw Sting'), `${enemyIconUrl('Ice Edge')} | ${enemyIconUrl('Sting')}`),
    raw('numbered Ice Edge icon resolves', enemyIconUrl('Ice Edge #1') === enemyIconUrl('Ice Edge (1)'), `${enemyIconUrl('Ice Edge #1')} | ${enemyIconUrl('Ice Edge (1)')}`),
    raw('authored Ice Edge uses Icy Wind', enemyBehavior('Ice Edge (1)')?.abilities.some(a => a.name === 'Icy Wind') === true, enemyBehavior('Ice Edge (1)')?.abilities.map(a => a.name).join(',') ?? 'missing'),
    raw('summons excluded from enemy targets', targetPick.targets[0]?.id === 'char_probe', targetPick.targets.map(t => t.id).join(',')),
    raw('memosprite stays targetable while true summon excluded', memoSpritePick.targets.some(t => t.id === 'memo_probe') && !memoSpritePick.targets.some(t => t.id === 'summon_probe'), memoSpritePick.targets.map(t => t.id).join(',')),
    raw('support log shows heal and shield with source target amount', supportText.includes(`${allyA.name} → ${allyB.name}: 500 щит`) && supportText.includes(`${allyA.name} → ${allyB.name}: 350 HP`), supportText),
    raw('shield values floor decimals in effects and support', /Значение:\s*500(?!\.)/.test(textOf(shieldEffectRow)) && !textOf(shieldEffectRow).includes('500.75') && !supportText.includes('500.75') && supportParts[1]?.amount === 500, `${textOf(shieldEffectRow)} | ${supportText} | ${JSON.stringify(supportParts)}`),
    raw('snapshot carries summon ownership flag', Object.values(stateSnapshot.units).every(u => 'sharesOwnerBuffs' in u), Object.values(stateSnapshot.units).map(u => `${u.id}:${u.sharesOwnerBuffs}`).join(',')),
    raw('vitals hide true summon HP/EN and memosprite EN', trueSummonVitalLabels.join(',') === 'ОД' && memoSpriteVitalLabels.join(',') === 'HP,ОД' && charVitalLabels.join(',') === 'HP,EN,ОД', `${trueSummonVitalLabels.join(',')} | ${memoSpriteVitalLabels.join(',')} | ${charVitalLabels.join(',')}`),
    raw('enemy vitals omit energy and SP', enemyVitalLabels.join(',') === 'HP', enemyVitalLabels.join(',') || 'none'),
    raw('enemy action card hides energy and SP vitals', !!enemyAttackCard && enemyCardVitalLabels.every(label => label !== 'EN' && label !== 'ОД'), enemyCardVitalLabels.join(',') || 'missing'),
    raw('encounter art uses enemy icons', encounterIcons.includes(enemyIconUrl('Ice Edge') ?? '') && encounterIcons.some(src => decodeURIComponent(src).includes('Ice Edge (1)')), encounterIcons.join(' | ')),
    raw('hit rows omit damage breakdown', uiHost.querySelectorAll('.simInspectorHitBreakdown').length === 0, `breakdowns=${uiHost.querySelectorAll('.simInspectorHitBreakdown').length}`),
    raw('action inspector omits duplicated metadata grid', actionTabGridCount === 0, `grids=${actionTabGridCount}`),
    raw('battle log shows HP energy and OD vitals', charVitalLabels.join(',') === 'HP,EN,ОД', charVitalLabels.join(',') || 'none'),
    raw('battle log labels targets by role', [...uiHost.querySelectorAll('.simActionTargetGroupLabel')].some(label => ['Attack Targets:', 'Buff Targets:', 'Debuff Targets:'].includes(label.textContent ?? '')), `labels=${[...uiHost.querySelectorAll('.simActionTargetGroupLabel')].map(label => label.textContent).join('|')}`),
    raw('effect summary carries stable source id', actions.some(a => a.effects.buffs.some(b => !!b.sourceId)), `withSource=${actions.filter(a => a.effects.buffs.some(b => !!b.sourceId)).length}`),
    raw('E0 renders in simulation party card', e0Text === 'E0', e0Text),
    raw('Memosprite source uses own icon', (rowsNamed('ATK Up', memoSpriteHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? '').includes('Memosprite.png'), rowsNamed('ATK Up', memoSpriteHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? ''),
    raw('effect source from stable sourceId not acting unit', sourceOf(rowsNamed('ATK Up')[0]).includes(allyA.name) && !sourceOf(rowsNamed('ATK Up')[0]).includes(allyB.name), `${sourceOf(rowsNamed('ATK Up')[0])} | actor=${allyB.name}`),
    raw('effect row shows recipient', targetOf(rowsNamed('ATK Up')[0]).includes(allyB.name), `${targetOf(rowsNamed('ATK Up')[0])} | ${textOf(rowsNamed('ATK Up')[0]).slice(0, 120)}`),
    raw('effect source and target labeled explicitly', sourceOf(rowsNamed('ATK Up')[0]).includes('Источник:') && targetOf(rowsNamed('ATK Up')[0]).includes('Получатель:'), `${sourceOf(rowsNamed('ATK Up')[0])} | ${targetOf(rowsNamed('ATK Up')[0])}`),
    raw('same effect id from different sources stays separate', rowsNamed('ATK Up').length === 2, `rows=${rowsNamed('ATK Up').length}`),
    raw('other-target effect stays outside selected inspector', rowsNamed('Mirror').length === 1 && targetOf(rowsNamed('Mirror')[0]).includes(allyB.name) && !hostText(enemyEffectHost).includes('Mirror'), `ally=${rowsNamed('Mirror').length} enemy=${hostText(enemyEffectHost).includes('Mirror')}`),
    raw('merge keeps last event stacks', rowsNamed('Last Wins').length === 1 && /Стаки:\s*3/.test(textOf(rowsNamed('Last Wins')[0])), textOf(rowsNamed('Last Wins')[0]).slice(0, 120)),
    raw('merge does not use max stacks', rowsNamed('No Max').length === 1 && /Стаки:\s*1/.test(textOf(rowsNamed('No Max')[0])), textOf(rowsNamed('No Max')[0]).slice(0, 120)),
    raw('expired buff keeps identity', removalRows().some(r => /Expired Buff/.test(textOf(r)) && sourceOf(r).includes(allyA.name) && targetOf(r).includes(allyB.name)), removalRows().map(textOf).join(' | ').slice(0, 180)),
    raw('dispel keeps identity', removalRows().some(r => /Dispel Debuff/.test(textOf(r)) && sourceOf(r).includes(allyA.name) && targetOf(r).includes(allyB.name)), removalRows().map(textOf).join(' | ').slice(0, 180)),
    raw('dot source id retained in summary', [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.debuff')].some(r => /Shock/.test(textOf(r)) && sourceOf(r).includes(allyA.name)), [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.debuff')].map(textOf).join(' | ').slice(0, 180)),
    raw('dot source id retained in snapshot', !!dotWithSource, dotWithSource ? `${dotWithSource.unit.id}/${dotWithSource.dot.id}/${dotWithSource.dot.sourceId}` : 'missing'),
    raw('shield not duplicated as normal buff', rowsNamed('March Shield Buff').length === 0 && [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.shield')].some(r => /March Shield/.test(textOf(r))), `buffRows=${rowsNamed('March Shield Buff').length}`),
    raw('gear and traces omitted from buff list', !hostText(effectHost).includes('Снаряжение и следы') && rowsNamed('Gear').length === 0 && rowsNamed('Traces').length === 0, hostText(effectHost).slice(0, 220)),
    raw('genius def-ignore effect hidden from UI', !hostText(effectHost).includes('Genius DEF Ignore') && !hostText(allEffectsHost).includes('Genius DEF Ignore'), hostText(allEffectsHost).slice(0, 220)),
    raw('gear effect source names wearer and shows cone and stat icons', sourceOf(rowsNamed('Gear ATK')[0]).includes(allyA.name)
      && rowsNamed('Gear ATK')[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') === gearIconUrl('cone', 'secret_vow')
      && rowsNamed('Gear ATK')[0]?.querySelector('.simInspectorEffectIconImg img')?.getAttribute('src') === statIconUrlForKey('atkPct'),
      `${sourceOf(rowsNamed('Gear ATK')[0])} | ${rowsNamed('Gear ATK')[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src')}`),
    raw('effects tab defaults to all effects', hostText(allEffectsHost).includes('Scope Ally Buff') && hostText(allEffectsHost).includes('Scope Enemy Debuff'), hostText(allEffectsHost).slice(0, 220)),
    raw('stack changes shown from before and after snapshots', hostText(stackHost).includes('Изменение стаков') && hostText(stackHost).includes('Refund Stack 1→3'), hostText(stackHost).slice(0, 220)),
    raw('shield damage rendered separately', hostText(effectHost).includes('Урон по щитам') && hostText(effectHost).includes('320'), hostText(effectHost).slice(0, 260)),
    raw('debuff classified via isDebuff in snapshot', engineDebuffIds.length > 0 && engineDebuffIds.every(id => snapshotDebuffIds.has(id) && !snapshotBuffIds.has(id)), `engine=${engineDebuffIds.join(',')} buffs=${[...snapshotBuffIds].join(',')}`),
    raw('ally inspector shows own effects only', hostText(effectHost).includes('Scope Ally Buff') && !hostText(effectHost).includes('Scope Enemy Debuff') && !hostText(effectHost).includes('Enemy Only Debuff'), hostText(effectHost).slice(0, 200)),
    raw('enemy inspector shows enemy debuffs in effects', hostText(enemyEffectHost).includes('Scope Enemy Debuff') && hostText(enemyEffectHost).includes('Enemy Only Debuff') && !hostText(enemyEffectHost).includes('Scope Ally Buff'), hostText(enemyEffectHost).slice(0, 200)),
    raw('unknown effect falls back to stat icon', rowsNamed('Stat Fallback')[0]?.querySelector('.simInspectorEffectIconImg img')?.getAttribute('src') === statIconUrlForKey('defPct'), `${rowsNamed('Stat Fallback')[0]?.querySelector('.simInspectorEffectIconImg img')?.getAttribute('src')}`),
    raw('effect mods show stacked totals', /atkPct:\s*\+12%/.test(textOf(rowsNamed('Stacked Total')[0])) && /defPct:\s*\+12%/.test(textOf(rowsNamed('Stat Fallback')[0])), `${textOf(rowsNamed('Stacked Total')[0]).slice(0, 120)} | ${textOf(rowsNamed('Stat Fallback')[0]).slice(0, 120)}`),
    raw('strict effect icon returns undefined for unknown name', effectIconUrl('Definitely Unknown Effect') === undefined, String(effectIconUrl('Definitely Unknown Effect'))),
    raw('known effect icons still resolve', effectIconUrl('Cipher')?.includes('Cipher.png') === true && effectIconUrl('Memosprite')?.includes('Memosprite.png') === true, `${effectIconUrl('Cipher')} | ${effectIconUrl('Memosprite')}`),
    raw('flat mods absolute and conditional mods separate', /atkFlat:\s*\+100(?!\.)/.test(textOf(rowsNamed('Flat ATK')[0])) && !!effectHost.querySelector('.simInspectorEffectMods.conditional'), textOf(rowsNamed('Flat ATK')[0]).slice(0, 160)),
    raw('stat sum multiplies stacks and skips conditional', totals.atkFlat === 250 && totals.atkPct === 0.25 && totals.critDmg === undefined, JSON.stringify(totals)),
    raw('summon and memosprite icons resolve', missingSummonIcons.length === 0, missingSummonIcons.join(',') || `icons=${summonNames.length}`),
    raw('summon aliases use owner art', summonIconUrl('Souldragon')?.includes('Character Blade Icon.png') === true && summonIconUrl('Fuyuan')?.includes('Character Lingsha Icon.png') === true && summonIconUrl('Numby')?.includes('Character Topaz & Numby Icon.png') === true, `${summonIconUrl('Souldragon')} | ${summonIconUrl('Fuyuan')} | ${summonIconUrl('Numby')}`),
    raw('memosprite icons use dedicated art', summonIconUrl('Demiurge')?.includes('/memosprites/Demiurge.png') === true && summonIconUrl('Summer Songbirds')?.includes('/memosprites/Summer Songbirds.png') === true, `${summonIconUrl('Demiurge')} | ${summonIconUrl('Summer Songbirds')}`),
    raw('direct summon and memosprite art resolves', summonIconUrl('Lightning-Lord')?.includes('/summons/Lightning-Lord.png') === true && summonIconUrl('Netherwing: Pollux')?.includes('/memosprites/Netherwing_ Pollux.png') === true && summonIconUrl('Evey')?.includes('/memosprites/Evey.png') === true, `${summonIconUrl('Lightning-Lord')} | ${summonIconUrl('Netherwing: Pollux')} | ${summonIconUrl('Evey')}`),
    raw('named summon source uses own icon', (rowsNamed('ATK Up', namedSummonHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? '').includes('Character Blade Icon.png'), rowsNamed('ATK Up', namedSummonHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? ''),
    raw('real enemy actions categorized as enemy attack', actions.some(a => a.sourceId === enemy.id && a.category === 'enemyAttack'), actions.filter(a => a.sourceId === enemy.id).map(a => a.category).join(',')),
    raw('enemy attack cards use red accent', !!enemyAttackCard && enemyAttackCard.style.borderLeftColor === '#ef4444', enemyAttackCard?.style.borderLeftColor ?? 'missing'),
    raw('enemy attack cards carry enemy label', enemyAttackCard?.querySelector('.simActionCategory')?.textContent === 'Атака Врага', enemyAttackCard?.querySelector('.simActionCategory')?.textContent ?? 'missing'),
    raw('action card shows ability name in header', [...uiHost.querySelectorAll<HTMLElement>('.simActionHeader .simActionAbilityName')].some(n => (n.textContent ?? '').length > 0), `headers=${uiHost.querySelectorAll('.simActionHeader .simActionAbilityName').length}`),
    raw('damage summary labels damage explicitly', [...uiHost.querySelectorAll<HTMLElement>('.simActionDamage')].some(n => (n.textContent ?? '').startsWith('Урон:')), `damage=${[...uiHost.querySelectorAll<HTMLElement>('.simActionDamage')].map(n => n.textContent).join('|')}`),
    raw('damage summary shows heal and shield together', supportParts.length === 2 && supportParts[0].label === 'Лечение' && supportParts[0].amount === 350 && supportParts[1].label === 'Щит' && supportParts[1].amount === 500, JSON.stringify(supportParts)),
    raw('damage colors distinguish elements and mark elation', windDamage.color === '#5eead4' && elationDamage.elation && supportParts[0].color !== windDamage.color && supportParts[1].color !== '#67e8f9', `${windDamage.color} | ${JSON.stringify(elationDamage)} | ${JSON.stringify(supportParts)}`),
    raw('multi-element damage groups by element largest first', multiElementDamage.map(p => `${p.element}:${p.amount}`).join('|') === 'Quantum:100|Physical:10', JSON.stringify(multiElementDamage)),
    raw('multi-element damage parts keep element-specific colors', multiElementColors.length === 2 && multiElementColors[0] !== multiElementColors[1] && multiElementColors.every(color => /^#[0-9a-f]{6}$/i.test(color)), multiElementColors.join('|')),
    raw('true damage marked as light-purple damage type', trueDamage.color === '#d8b4fe' && trueDamageParts.length === 1 && trueDamageParts[0].element === 'True DMG' && trueDamageParts[0].color === '#d8b4fe', `${trueDamage.color} | ${JSON.stringify(trueDamageParts)}`),
    raw('damage summary shows element icons after numbers', [...uiHost.querySelectorAll<HTMLElement>('.simActionDamageElement')].some(n => !!n.dataset.element && !!n.querySelector('img')), `icons=${uiHost.querySelectorAll('.simActionDamageElement').length}`),
    raw('enemy inspector shows toughness bar', toughnessBars.length > 0 && /Tgh/.test(toughnessText) && /\d+\/\d+/.test(toughnessText), toughnessText || 'none'),
    raw('shield damage recorded on hit and action', shieldHitAction?.shieldDamage === 320 && shieldHitAction?.attacks[0]?.shieldDamage === 320 && shieldHit?.shieldDamage === 320 && shieldHit?.damage === 100 && shieldHitAction?.totalDamage === 100, `action=${shieldHitAction?.shieldDamage} attack=${shieldHitAction?.attacks[0]?.shieldDamage} hit=${shieldHit?.shieldDamage} hp=${shieldHit?.damage}`),
    raw('shield-only attack keeps enemy category with zero HP damage', shieldOnlyAction?.category === 'enemyAttack' && shieldOnlyAction?.shieldDamage === 250 && shieldOnlyAction?.totalDamage === 0 && shieldOnlyHit?.shieldDamage === 250 && shieldOnlyHit?.damage === 0, `category=${shieldOnlyAction?.category} shield=${shieldOnlyAction?.shieldDamage} hit=${shieldOnlyHit?.shieldDamage}`),
    raw('combat cards show shield damage total', shieldBadges.some(text => /[\d,]+\s+по щиту/.test(text)), shieldBadges.join(',') || 'none'),
    raw('hit rows show shield damage', shieldHitLabels.some(text => /\+[\d,]+\s+щит/.test(text)), shieldHitLabels.join(',') || 'none'),
    raw('empty system actions hidden from log', hiddenSystemAction === undefined, String(hiddenSystemAction?.category)),
    raw('combat log drops category headers', uiHost.querySelectorAll('.simLogCategoryHeader').length === 0, `headers=${uiHost.querySelectorAll('.simLogCategoryHeader').length}`),
    raw('combat log drops filter and search bar', !uiHost.querySelector('.simLogFilterBar') && !uiHost.querySelector('.simLogSearch'), `filterBar=${!!uiHost.querySelector('.simLogFilterBar')} search=${!!uiHost.querySelector('.simLogSearch')}`),
    raw('combat log drops system filter', ![...uiHost.querySelectorAll<HTMLOptionElement>('.simLogFilter option')].some(o => o.value === 'system'), 'system filter'),
    raw('combat log drops system rows', !cards.some(c => c.classList.contains('system')), `systemCards=${cards.filter(c => c.classList.contains('system')).length}`),
    raw('technique events keep damage healing and SP in one action', techniqueEffects?.category === 'technique' && techniqueEffects?.totalDamage === 333 && techniqueEffects?.effects.heals.some(h => h.amount === 222) === true && techniqueEffects?.spDelta === 1, `category=${techniqueEffects?.category} dmg=${techniqueEffects?.totalDamage} heals=${techniqueEffects?.effects.heals.length} sp=${techniqueEffects?.spDelta}`),
    raw('technique target selection populates Targets', techniqueEffects?.targetIds.includes(allyA.id) === true, `targets=${techniqueEffects?.targetIds.join(',')}`),
    raw('energy gain payload uses n field', energyProbeAction?.effects.energyChanges.some(c => c.delta === 30) === true && energyProbeAction?.effects.energyChanges.some(c => c.delta === -12) === true, JSON.stringify(energyProbeAction?.effects.energyChanges ?? [])),
    raw('summons created during an attack are not shown as targets', summonAfterHitAction?.targetIds.includes(enemy.id) === true && summonAfterHitAction?.targetIds.includes('probe_late_summon') === false, `targets=${summonAfterHitAction?.targetIds.join(',')}`),
    raw('effect actions show effect recipients as targets', effectTargetsAction?.targetIds.includes(probeAllyB.id) === true && effectTargetsAction?.targetIds.includes(probeAllyA.id) === true, `targets=${effectTargetsAction?.targetIds.join(',')}`),
    raw('multi-target toughness follows target order', multiToughnessAction?.targetIds.join(',') === `${probeEnemy.id},${probeEnemy2.id}` && multiToughnessAction?.toughnessDamageByTarget.map(t => `${t.targetId}:${t.damage}`).join(',') === `${probeEnemy.id}:12,${probeEnemy2.id}:10`, `targets=${multiToughnessAction?.targetIds.join(',')} tgh=${multiToughnessAction?.toughnessDamageByTarget.map(t => `${t.targetId}:${t.damage}`).join(',')}`),
    raw('summons created during an attack do not add summon tag', summonAfterHitAction?.tags.includes('summon') === false, `tags=${summonAfterHitAction?.tags.join(',')}`),
    raw('memosprite action is not categorized as summon', memoSpriteAction?.category === 'effect' && memoSpriteAction?.tags.includes('summon') === false, `category=${memoSpriteAction?.category} tags=${memoSpriteAction?.tags.join(',')}`),
    raw('notes and phase events visible in event log', eventLogText.includes('Заметка: Sanction Mode') && eventLogText.includes('Фаза: phase: phase_2'), eventLogText),
    raw('kill energy reason retained', onKillEnergyAction?.effects.energyChanges[0]?.reason === 'on_kill', JSON.stringify(onKillEnergyAction?.effects.energyChanges ?? [])),
    raw('energy gain rendered as labeled log', energyLogText.includes('Energy Gain: +10 EN') && energyLogText.includes('убийство'), energyLogText),
    raw('targets split into attack buff and debuff groups', groupedTargetGroups.find(g => g.role === 'attack')?.ids.join(',') === probeEnemy.id && groupedTargetGroups.find(g => g.role === 'buff')?.ids.join(',') === probeAllyA.id && groupedTargetGroups.find(g => g.role === 'debuff')?.ids.join(',') === probeEnemy2.id, JSON.stringify(groupedTargetGroups)),
    raw('target groups render explicit labels', groupedTargetLabels.join('|') === 'Attack Targets:|Buff Targets:|Debuff Targets:', groupedTargetLabels.join('|')),
    raw('Dan Heng Bondmate target emitted and shown', !!bondTargetId && dhTechnique?.targetIds.includes(bondTargetId) === true, `bond=${bondTargetId} targets=${dhTechnique?.targetIds.join(',')}`),
    raw('all Dan Heng shield targets shown', dhShieldTargets.size >= 4 && dhSupportRows.length >= 4, `targets=${dhShieldTargets.size} rows=${dhSupportRows.length}`),
    raw('Gatekeeper sanction summons Dragonfish', dragonfish.length === 2 && dragonfish.every(u => !u.dead), `${dragonfish.map(u => u.name).join(',')} before=${enemyCountBeforeSanction}`),
    raw('Summer Songbirds summoned at full HP', !!robinBird && robinBird.hp === robinBird.maxHp, robinBird ? `${robinBird.hp}/${robinBird.maxHp}` : 'missing'),
    raw('combat actions carry multiple mechanic tags',
      seeleTags?.tags.join(',') === 'attack,extraTurn'
      && souldragonTags?.tags.join(',') === 'attack,bonusAttack'
      && yunliTags?.tags.join(',') === 'effect,ultimate,attack,bonusAttack,counter'
      && castoriceTags?.tags.join(',') === 'ultimate,summon'
      && dotBreakTags?.tags.join(',') === 'effect,dot,breakRestore',
      `seele=${seeleTags?.tags.join(',')} dragon=${souldragonTags?.tags.join(',')} yunli=${yunliTags?.tags.join(',')} castorice=${castoriceTags?.tags.join(',')} dot=${dotBreakTags?.tags.join(',')}`),
    raw('action cards render mechanic tag badges', tagBadges.length > 0 && cards.length > 0 && cards.every(c => !!c.querySelector('.simActionTags') && !!c.querySelector('.simActionTag')), `badges=${tagBadges.length} multi=${multiTagCards.length} cards=${cards.length}`),
    raw('full HP heal stays visible with requested amount', fullHpHealText.includes('777 HP') && fullHpHealParts.length === 1 && fullHpHealParts[0].amount === 777, `${fullHpHealText} | ${JSON.stringify(fullHpHealParts)}`),
    raw('shield applied via buff and event counted once', shieldDedupeAction?.effects.shields.length === 1 && shieldDedupeAction?.effects.buffs.length === 0, JSON.stringify(shieldDedupeAction?.effects.shields ?? [])),
    raw('DOT_APPLIED uses top-level element and payload kind', dotTopLevelAction?.effects.dots[0]?.id === 'Burn' && dotTopLevelAction?.effects.dots[0]?.name === 'Burn' && dotTopLevelAction?.effects.dots[0]?.element === 'Fire' && dotTopLevelAction?.effects.dots[0]?.damage === 77, JSON.stringify(dotTopLevelAction?.effects.dots ?? [])),
    raw('control, tick, and expiration recorded', controlStateAction?.effects.controls.length === 1 && controlStateAction?.effects.ticks[0]?.amount === 55 && controlStateAction?.effects.removals.some((r: any) => r.kind === 'debuff' && r.id === 'Freeze'), JSON.stringify({ controls: controlStateAction?.effects.controls, ticks: controlStateAction?.effects.ticks, removals: controlStateAction?.effects.removals })),
    raw('effect inspector separates before after and changes', hostText(effectHost).includes('Состояние до действия') && hostText(effectHost).includes('Состояние после действия') && hostText(effectHost).includes('Изменения за действие'), hostText(effectHost).slice(0, 220)),
    raw('action inspector shows before and after stats', actionInspectorText.includes('Характеристики до действия') && actionInspectorText.includes('Характеристики после действия'), actionInspectorText.slice(0, 220)),
    raw('effect row describes human-readable modifier', /Увеличивает ATK на 20%/.test(textOf(rowsNamed('ATK Up')[0])), textOf(rowsNamed('ATK Up')[0]).slice(0, 220)),
    raw('effect row names ability from provenance', textOf(rowsNamed('ATK Up')[0]).includes('Способность: Probe Ult'), textOf(rowsNamed('ATK Up')[0]).slice(0, 220)),
    raw('effect row shows current and max stacks', /Стаки:\s*3\/5/.test(textOf(rowsNamed('Capped Stack')[0])), textOf(rowsNamed('Capped Stack')[0]).slice(0, 220)),
    raw('aggro stays absolute in effect mods', /aggro:\s*\+150(?!%)/.test(textOf(rowsNamed('Probe Aggro')[0])) && !textOf(rowsNamed('Probe Aggro')[0]).includes('+150%'), textOf(rowsNamed('Probe Aggro')[0]).slice(0, 220)),
    raw('vulnerability described in human-readable text', /Уязвимость к Fire урону \+30%/.test(textOf(rowsNamed('Fire Vulnerability')[0])), textOf(rowsNamed('Fire Vulnerability')[0]).slice(0, 220)),
    raw('conditional effect states activation window', /Условие: во время Skill/.test(textOf(rowsNamed('Conditional CD')[0])), textOf(rowsNamed('Conditional CD')[0]).slice(0, 260)),
    raw('relic set icon wins over cone and names source kind', sourceOf(rowsNamed('Musketeer ATK')[0]).includes('Набор реликвий') && rowsNamed('Musketeer ATK')[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') === gearIconUrl('relic', 'musketeer'), `${sourceOf(rowsNamed('Musketeer ATK')[0])} | ${rowsNamed('Musketeer ATK')[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src')}`),
    raw('light cone provenance names source kind', sourceOf(rowsNamed('Cone Crit')[0]).includes('Световой конус'), sourceOf(rowsNamed('Cone Crit')[0])),
    raw('control and tick rows render with dispel hint', hostText(effectHost).includes('Probe Freeze') && hostText(effectHost).includes('Тики DoT') && hostText(effectHost).includes('55') && !!effectHost.querySelector('.simInspectorEffectDispel'), hostText(effectHost).slice(0, 320)),
  ]
}
