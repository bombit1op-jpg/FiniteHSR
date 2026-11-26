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
  const { renderEffectSummary, snapshotEffectModTotals, initSimulationPanel, renderSupportLog, vitalLabelsForSnapshot } = await import('../../src/ui/simulationPanel')
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

  const cards = [...uiHost.querySelectorAll<HTMLElement>('.simCombatActionCard')]
  const enemyAttackCard = cards.find(c => c.classList.contains('enemyAttack'))
  const spDeltaLabels = cards.map(c => c.querySelector('.simActionSpDelta')?.textContent ?? '').filter(Boolean)
  const fuaCard = cards.find(c => c.textContent?.includes('Kafka') && c.textContent?.includes('Gentle but Cruel') && !!c.querySelector('.simActionHitsSummary'))
  fuaCard?.click()
  const stateTab = [...uiHost.querySelectorAll<HTMLButtonElement>('.simInspectorTab')]
    .find(b => b.textContent === 'Состояние')
  const actionTabGridCount = uiHost.querySelectorAll('.simLogInspectorGrid').length
  const encounterPreview = uiHost.querySelector('.encounterIconPreview')
  const encounterSelect = encounterPreview?.querySelector('select')
  const encounterIcons = [...uiHost.querySelectorAll<HTMLImageElement>('.encounterEnemyIcon img')].map(img => img.getAttribute('src') ?? '')
  const vitalCard = cards.find(c => !!c.querySelector('.simActionVitals'))
  const vitalLabels = [...(vitalCard?.querySelectorAll<HTMLElement>('.simVitalBar') ?? [])]
    .map(bar => bar.querySelector('.simVitalLabel')?.textContent ?? '')
  const shieldBadges = [...uiHost.querySelectorAll<HTMLElement>('.simActionShieldDamage')]
    .map(badge => badge.textContent ?? '')
  const shieldHitLabels = [...uiHost.querySelectorAll<HTMLElement>('.simInspectorHitShieldDamage')]
    .map(label => label.textContent ?? '')

  const { effectIconUrl, enemyIconUrl, statIconUrlForKey, summonIconUrl } = await import('../../src/ui/icons')

  const summonNames = [
    'Demiurge', 'Evey', 'Fuyuan', 'Garmentmaker', 'Lightning-Lord',
    'Little Ica', 'Mem', 'Netherwing: Pollux', 'Numby', 'Souldragon', 'Summer Songbirds',
  ]
  const missingSummonIcons = summonNames.filter(name => !summonIconUrl(name))

  const allies = sim.roster.filter(u => u.side === 'ally')
  const enemy = sim.roster.find(u => u.side === 'enemy')!
  const allyA = allies[0]
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
        makeEffect('atk_up', 'ATK Up', allyA, allyB, { mods: [{ stat: 'atkPct', value: 0.2 }] }),
        makeEffect('cipher', 'Cipher', allyA, allyB, { mods: [{ stat: 'critDmg', value: 0.1 }] }),
        makeEffect('flat_atk', 'Flat ATK', allyB, allyB, { mods: [{ stat: 'atkFlat', value: 100 }] }),
        makeEffect('cond_cd', 'Conditional CD', allyA, allyB, { mods: [{ stat: 'critDmg', value: 0.3, whenAbility: ['skill'] }] }),
        makeEffect('shield_buff', 'March Shield Buff', allyA, allyB, { shield: 500 }),
        makeEffect('atk_up', 'ATK Up', allyB, allyB, { mods: [{ stat: 'atkPct', value: 0.2 }] }),
        makeEffect('stacked_total', 'Stacked Total', allyA, allyB, { stacks: 3, mods: [{ stat: 'atkPct', value: 0.04 }] }),
        makeEffect('stat_fallback', 'Stat Fallback', allyA, allyB, { stacks: 2, mods: [{ stat: 'defPct', value: 0.06 }] }),
        makeEffect('mirror', 'Mirror', allyA, allyA),
        makeEffect('mirror', 'Mirror', allyA, allyB),
        makeEffect('last_wins', 'Last Wins', allyA, allyB, { stacks: 1 }),
        makeEffect('last_wins', 'Last Wins', allyA, allyB, { stacks: 3 }),
        makeEffect('no_max', 'No Max', allyA, allyB, { stacks: 2 }),
        makeEffect('no_max', 'No Max', allyA, allyB, { stacks: 1 }),
        makeEffect('gear', 'Gear', allyA, allyB, { provenance: { sourceKind: 'relic' }, mods: [{ stat: 'atkPct', value: 0.15 }] }),
        makeEffect('traces', 'Traces', allyA, allyB, { provenance: { sourceKind: 'trace' }, mods: [{ stat: 'critDmg', value: 0.2 }] }),
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
      shields: [{
        id: 'march_shield',
        name: 'March Shield',
        targetId: allyB.id,
        targetName: allyB.name,
        amount: 500,
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
  const memoSpriteHost = doc.createElement('div')
  const supportHost = doc.createElement('div')
  doc.body.append(effectHost, enemyEffectHost, memoSpriteHost, supportHost)
  const supportEl = renderSupportLog(syntheticAction as any)
  if (supportEl) supportHost.append(supportEl)
  const supportText = supportHost.textContent ?? ''
  const trueSummonVitalLabels = vitalLabelsForSnapshot({ kind: 'summon', sharesOwnerBuffs: true })
  const memoSpriteVitalLabels = vitalLabelsForSnapshot({ kind: 'summon' })
  const charVitalLabels = vitalLabelsForSnapshot({ kind: 'char' })
  renderEffectSummary(syntheticAction, sim, effectHost, allyB.id)
  renderEffectSummary(syntheticAction, sim, enemyEffectHost, enemy.id)
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
    raw('attack actions keep real hits', actions.every(a => a.category !== 'attack' || a.attacks.length > 0), `empty=${actions.filter(a => a.category === 'attack' && a.attacks.length === 0).map(a => a.abilityName).join(',')}`),
    raw('enemy technique and summon actions typed', enemyCategory === 'enemyAttack' && techniqueCategory === 'technique' && summonCategory === 'summon', `enemy=${enemyCategory} technique=${techniqueCategory} summon=${summonCategory}`),
    raw('state tab removed', !stateTab, String(!!stateTab)),
    raw('SP delta shown with ability', spDeltaLabels.some(t => /^[+-]?\d+ ОД$/.test(t)), spDeltaLabels.join('|') || 'none'),
    raw('single encounter replaces preset picker', !encounterSelect && encounterIcons.length >= 3, `select=${!!encounterSelect} icons=${encounterIcons.length}`),
    raw('enemy icons resolve aliases', enemyIconUrl('Ice Edge') === enemyIconUrl('Ice Edge (1)') && enemyIconUrl('Sting') === enemyIconUrl('Gnaw Sting'), `${enemyIconUrl('Ice Edge')} | ${enemyIconUrl('Sting')}`),
    raw('numbered Ice Edge icon resolves', enemyIconUrl('Ice Edge #1') === enemyIconUrl('Ice Edge (1)'), `${enemyIconUrl('Ice Edge #1')} | ${enemyIconUrl('Ice Edge (1)')}`),
    raw('authored Ice Edge uses Icy Wind', enemyBehavior('Ice Edge (1)')?.abilities.some(a => a.name === 'Icy Wind') === true, enemyBehavior('Ice Edge (1)')?.abilities.map(a => a.name).join(',') ?? 'missing'),
    raw('summons excluded from enemy targets', targetPick.targets[0]?.id === 'char_probe', targetPick.targets.map(t => t.id).join(',')),
    raw('memosprite stays targetable while true summon excluded', memoSpritePick.targets.some(t => t.id === 'memo_probe') && !memoSpritePick.targets.some(t => t.id === 'summon_probe'), memoSpritePick.targets.map(t => t.id).join(',')),
    raw('support log shows heal and shield with source target amount', supportText.includes(`${allyA.name} → ${allyB.name}: 500 щит`) && supportText.includes(`${allyA.name} → ${allyB.name}: 350 HP`), supportText),
    raw('snapshot carries summon ownership flag', Object.values(stateSnapshot.units).every(u => 'sharesOwnerBuffs' in u), Object.values(stateSnapshot.units).map(u => `${u.id}:${u.sharesOwnerBuffs}`).join(',')),
    raw('vitals hide true summon HP/EN and memosprite EN', trueSummonVitalLabels.join(',') === 'ОД' && memoSpriteVitalLabels.join(',') === 'HP,ОД' && charVitalLabels.join(',') === 'HP,EN,ОД', `${trueSummonVitalLabels.join(',')} | ${memoSpriteVitalLabels.join(',')} | ${charVitalLabels.join(',')}`),
    raw('encounter art uses enemy icons', encounterIcons.includes(enemyIconUrl('Ice Edge') ?? '') && encounterIcons.some(src => decodeURIComponent(src).includes('Ice Edge (1)')), encounterIcons.join(' | ')),
    raw('hit rows omit damage breakdown', uiHost.querySelectorAll('.simInspectorHitBreakdown').length === 0, `breakdowns=${uiHost.querySelectorAll('.simInspectorHitBreakdown').length}`),
    raw('action inspector omits duplicated metadata grid', actionTabGridCount === 0, `grids=${actionTabGridCount}`),
    raw('battle log shows HP energy and OD vitals', vitalLabels.join(',') === 'HP,EN,ОД', vitalLabels.join(',') || 'none'),
    raw('battle log labels targets explicitly', [...uiHost.querySelectorAll('.simActionTargetsLabel')].some(label => label.textContent === 'Targets:'), `labels=${uiHost.querySelectorAll('.simActionTargetsLabel').length}`),
    raw('effect summary carries stable source id', actions.some(a => a.effects.buffs.some(b => !!b.sourceId)), `withSource=${actions.filter(a => a.effects.buffs.some(b => !!b.sourceId)).length}`),
    raw('E0 renders in simulation party card', e0Text === 'E0', e0Text),
    raw('Memosprite source uses own icon', (rowsNamed('ATK Up', memoSpriteHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? '').includes('Memosprite.png'), rowsNamed('ATK Up', memoSpriteHost)[0]?.querySelector('.simInspectorEffectSourceIcon img')?.getAttribute('src') ?? ''),
    raw('effect source from stable sourceId not acting unit', sourceOf(rowsNamed('ATK Up')[0]).includes(allyA.name) && !sourceOf(rowsNamed('ATK Up')[0]).includes(allyB.name), `${sourceOf(rowsNamed('ATK Up')[0])} | actor=${allyB.name}`),
    raw('effect row shows recipient', targetOf(rowsNamed('ATK Up')[0]).includes(allyB.name), `${targetOf(rowsNamed('ATK Up')[0])} | ${textOf(rowsNamed('ATK Up')[0]).slice(0, 120)}`),
    raw('same effect id from different sources stays separate', rowsNamed('ATK Up').length === 2, `rows=${rowsNamed('ATK Up').length}`),
    raw('other-target effect stays outside selected inspector', rowsNamed('Mirror').length === 1 && targetOf(rowsNamed('Mirror')[0]).includes(allyB.name) && !hostText(enemyEffectHost).includes('Mirror'), `ally=${rowsNamed('Mirror').length} enemy=${hostText(enemyEffectHost).includes('Mirror')}`),
    raw('merge keeps last event stacks', rowsNamed('Last Wins').length === 1 && /Стаки:\s*3/.test(textOf(rowsNamed('Last Wins')[0])), textOf(rowsNamed('Last Wins')[0]).slice(0, 120)),
    raw('merge does not use max stacks', rowsNamed('No Max').length === 1 && /Стаки:\s*1/.test(textOf(rowsNamed('No Max')[0])), textOf(rowsNamed('No Max')[0]).slice(0, 120)),
    raw('expired buff keeps identity', removalRows().some(r => /Expired Buff/.test(textOf(r)) && sourceOf(r).includes(allyA.name) && targetOf(r).includes(allyB.name)), removalRows().map(textOf).join(' | ').slice(0, 180)),
    raw('dispel keeps identity', removalRows().some(r => /Dispel Debuff/.test(textOf(r)) && sourceOf(r).includes(allyA.name) && targetOf(r).includes(allyB.name)), removalRows().map(textOf).join(' | ').slice(0, 180)),
    raw('dot source id retained in summary', [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.debuff')].some(r => /Shock/.test(textOf(r)) && sourceOf(r).includes(allyA.name)), [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.debuff')].map(textOf).join(' | ').slice(0, 180)),
    raw('dot source id retained in snapshot', !!dotWithSource, dotWithSource ? `${dotWithSource.unit.id}/${dotWithSource.dot.id}/${dotWithSource.dot.sourceId}` : 'missing'),
    raw('shield not duplicated as normal buff', rowsNamed('March Shield Buff').length === 0 && [...effectHost.querySelectorAll<HTMLElement>('.simInspectorEffect.shield')].some(r => /March Shield/.test(textOf(r))), `buffRows=${rowsNamed('March Shield Buff').length}`),
    raw('gear and traces render as neutral', hostText(effectHost).includes('Снаряжение и следы') && rowsNamed('Gear').length === 0 && rowsNamed('Traces').length === 0, hostText(effectHost).slice(0, 220)),
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
    raw('enemy attack cards carry enemy label', enemyAttackCard?.querySelector('.simActionCategory')?.textContent === 'Атака врага', enemyAttackCard?.querySelector('.simActionCategory')?.textContent ?? 'missing'),
    raw('shield damage recorded on hit and action', shieldHitAction?.shieldDamage === 320 && shieldHitAction?.attacks[0]?.shieldDamage === 320 && shieldHit?.shieldDamage === 320 && shieldHit?.damage === 100 && shieldHitAction?.totalDamage === 100, `action=${shieldHitAction?.shieldDamage} attack=${shieldHitAction?.attacks[0]?.shieldDamage} hit=${shieldHit?.shieldDamage} hp=${shieldHit?.damage}`),
    raw('shield-only attack keeps enemy category with zero HP damage', shieldOnlyAction?.category === 'enemyAttack' && shieldOnlyAction?.shieldDamage === 250 && shieldOnlyAction?.totalDamage === 0 && shieldOnlyHit?.shieldDamage === 250 && shieldOnlyHit?.damage === 0, `category=${shieldOnlyAction?.category} shield=${shieldOnlyAction?.shieldDamage} hit=${shieldOnlyHit?.shieldDamage}`),
    raw('combat cards show shield damage total', shieldBadges.some(text => /[\d,]+\s+по щиту/.test(text)), shieldBadges.join(',') || 'none'),
    raw('hit rows show shield damage', shieldHitLabels.some(text => /\+[\d,]+\s+щит/.test(text)), shieldHitLabels.join(',') || 'none'),
    raw('empty system actions hidden from log', hiddenSystemAction === undefined, String(hiddenSystemAction?.category)),
    raw('combat log drops category headers', uiHost.querySelectorAll('.simLogCategoryHeader').length === 0, `headers=${uiHost.querySelectorAll('.simLogCategoryHeader').length}`),
    raw('combat log drops system filter', ![...uiHost.querySelectorAll<HTMLOptionElement>('.simLogFilter option')].some(o => o.value === 'system'), 'system filter'),
    raw('combat log drops system rows', !cards.some(c => c.classList.contains('system')), `systemCards=${cards.filter(c => c.classList.contains('system')).length}`),
    raw('technique events keep damage healing and SP in one action', techniqueEffects?.category === 'technique' && techniqueEffects?.totalDamage === 333 && techniqueEffects?.effects.heals.some(h => h.amount === 222) === true && techniqueEffects?.spDelta === 1, `category=${techniqueEffects?.category} dmg=${techniqueEffects?.totalDamage} heals=${techniqueEffects?.effects.heals.length} sp=${techniqueEffects?.spDelta}`),
    raw('technique target selection populates Targets', techniqueEffects?.targetIds.includes(allyA.id) === true, `targets=${techniqueEffects?.targetIds.join(',')}`),
    raw('Dan Heng Bondmate target emitted and shown', !!bondTargetId && dhTechnique?.targetIds.includes(bondTargetId) === true, `bond=${bondTargetId} targets=${dhTechnique?.targetIds.join(',')}`),
    raw('all Dan Heng shield targets shown', dhShieldTargets.size >= 4 && dhSupportRows.length >= 4, `targets=${dhShieldTargets.size} rows=${dhSupportRows.length}`),
  ]
}
