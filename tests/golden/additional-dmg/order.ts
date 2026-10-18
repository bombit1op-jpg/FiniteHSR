import { run, raw, all, mob, type Node } from '../../_helpers/battle'

/**
 * Additional DMG ordering (§PHASE 5, guide "Additional DMG ordering").
 *
 * Canon: Additional DMG "is not considered an attack" and is "displayed as individual
 * damage numbers separated from other damage sources" (reference/docs/combat_mechanics/
 * Additional DMG.md). So an `add` hit is a separate DAMAGE_DEALT that is embedded in the
 * parent attack's resolution — NOT a queued timeline sub-action.
 *
 * The guide flags the OLD ActionQueue's "Additional DMG sub-action ordering" as a known
 * discrepancy but gives no target order. Current engine models Additional DMG inline (as
 * hits inside the parent attack, resolved at the attack's after-attack point), so the
 * discrepancy no longer applies; this family pins the behaviour so it stays that way.
 * Serval's Talent "Galvanic Chords" (erudition.ts) is the vehicle: an `onAfterAttack`
 * rider gated "once per attack" via sim.attackNo().
 */
export default () => {
  const c = run({ team: [{ kitId: 'serval' }], enemy: mob({ hp: 200_000 }), cycles: 8 })
  const dmg = all(c, 'DAMAGE_DEALT')
  const adds = dmg.filter(n => n.attackType === 'add')
  const firstAdd = adds[0]
  const idx = (n: Node) => c.nodes.indexOf(n)

  const c2 = run({ team: [{ kitId: 'serval' }], enemy: mob({ hp: 200_000 }), cycles: 8 })
  const sig = (nodes: readonly Node[]) => nodes.map(n => `${n.type}|${n.attackType ?? ''}|${n.payload.label ?? ''}`).join('\n')

  // TODO L181: an Additional-DMG rider must not split the parent attack's identity. Serval's Talent
  // "Galvanic Chords" (canon 110304 "After Serval attacks…") fires once per ATTACK, but its `add` hit
  // used to mint a new attackNo per hit, so the sim.attackNo() dedup gate re-fired for every Blast
  // target and the Talent triggered once per HIT+target (E2 Energy 27 vs 16). Fixed by giving the rider
  // `noSeq:true` (erudition.ts). Observable: within one Serval action the Talent-add hits form at most
  // ONE block; a per-hit split interleaves a second add block after the action's later hits. Two enemies
  // keeps the Blast × target stress behind the original split explicit.
  const c3 = run({ team: [{ kitId: 'serval' }], enemy: mob({ name: 'Dummy', count: 2, hp: 3_000_000, spd: 80, toughness: 300 }), cycles: 8 })
  const blocksPerAction: number[] = []
  let inAction = false
  let addBlocks = 0
  let inAddBlock = false
  for (const n of c3.nodes) {
    if (n.type === 'ABILITY_USED' && n.source === 'Serval') {
      if (inAction) blocksPerAction.push(addBlocks)
      inAction = true
      addBlocks = 0
      inAddBlock = false
      continue
    }
    if (!inAction || n.type !== 'HIT_START' || n.source !== 'Serval') continue
    const isAdd = n.attackType === 'add' && n.payload?.label === 'Talent Additional'
    if (isAdd && !inAddBlock) { addBlocks++; inAddBlock = true }
    else if (!isAdd) inAddBlock = false
  }
  if (inAction) blocksPerAction.push(addBlocks)

  // 2026-10 noSeq sweep, second vehicle: Welt's A4 extra instances + Talent "Time Distortion" rider
  // (nihility.ts). Same family contract — a rider is a typed `add` DAMAGE_DEALT inline in the parent
  // attack, never its own scheduled action. Broadens coverage beyond Serval to three newly-noSeq emitters.
  const w = run({
    team: [{ kitId: 'welt', stats: { hp: 10000, atk: 2000, def: 600, spd: 200 }, eidolon: 0 }],
    enemy: mob({ name: 'Elite', count: 3, hp: 2_000_000, spd: 50 }), cycles: 8,
  })
  const wAdds = all(w, 'DAMAGE_DEALT').filter(n => n.attackType === 'add')
  const wLabels = new Set(wAdds.map(n => String(n.payload.label)))

  return [
    raw('additional DMG is emitted as its own damage number', adds.length > 0, `adds=${adds.length}`),
    raw('additional DMG is typed "add" (not an attack type)', adds.every(n => n.attackType === 'add')),
    raw('additional DMG carries an explicit label', adds.every(n => typeof n.payload.label === 'string' && (n.payload.label as string).length > 0),
      adds.map(n => String(n.payload.label)).join(',')),
    raw('additional DMG resolves after its parent attack damage (inline, not a queued action)',
      firstAdd !== undefined && dmg.some(n => n.attackType !== 'add' && n.source === firstAdd.source && idx(n) < idx(firstAdd)),
      firstAdd ? `firstAdd@${idx(firstAdd)}` : 'no add'),
    raw('additional DMG is not scheduled as its own timeline action',
      all(c, 'ACTION_SCHEDULED').every(n => n.attackType !== 'add')),
    raw('additional DMG ordering is deterministic for a fixed seed',
      sig(c.nodes) === sig(c2.nodes)),
    raw('a once-per-attack rider fires once per attack, not per hit (no attackNo split)',
      blocksPerAction.length > 0 && blocksPerAction.every(b => b <= 1),
      `add-blocks/action=[${blocksPerAction.join(',')}]`),
    raw('the once-per-attack rider actually fired (non-vacuous)',
      blocksPerAction.some(b => b >= 1),
      `add-blocks/action=[${blocksPerAction.join(',')}]`),
    raw('Welt rider family: A4 instances + Time Distortion emit as typed add DAMAGE_DEALT',
      wAdds.length > 0 && ['Edge of the Void (A4)', 'Gravity Suppression (A4)', 'Time Distortion'].every(l => wLabels.has(l)),
      `adds=${wAdds.length} labels=[${[...wLabels].join(', ')}]`),
    raw('Welt add riders are never their own scheduled timeline action',
      all(w, 'ACTION_SCHEDULED').every(n => n.attackType !== 'add')),
  ]
}
