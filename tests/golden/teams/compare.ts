import { run, mob, raw } from '../../_helpers/battle'
import { compareTeams, teamMetrics, buildMetrics, buildReportOf } from '../../../src/analysis/compare'

/**
 * §77 TEAM COMPARISON REPORT (roadmap item 20): two Acheron teams differing by one support slot,
 * same seed + tanky encounter, so the delta isolates the swap. Checks the metric set (not only
 * final damage), a consistent winner + reasons, and the self-comparison invariant (a team vs itself
 * → identical values, winner tie).
 *
 * §77 canonical-spec additions: typed metrics carry status + a B−A delta (absence → `missing`, not a
 * silent 0), the input-parity audit marks control fields SAME/CONTROLLED, the report renders the
 * RESULT + INPUT PARITY sections from the same typed result, the §77.2 build report resolves gear
 * slot-by-slot, and the §77.5 core table carries the SP/HP ledger + support metrics.
 */
const ROW_METRICS = ['Total Damage', 'Cycles', 'Ultimates', 'FUA', 'Breaks', 'SP Final', 'Survival']
const sameMetrics = (x: ReturnType<typeof teamMetrics>, y: ReturnType<typeof teamMetrics>): boolean =>
  x.totalDamage === y.totalDamage && x.events === y.events && x.actions === y.actions && x.ultimates === y.ultimates && x.fua === y.fua

/** a minimal TeamMetrics with an empty event stream, for the §77.14 "missing, not 0" check */
const emptyRun = (): ReturnType<typeof teamMetrics> => ({
  totalDamage: 100, cycles: 1, ultimates: 0, fua: 0, breaks: 0, spFinal: 3, survival: 1,
  actions: 0, turns: 0, energyGained: 0, events: 0,
  damageByOwner: {}, damageByAxis: {}, damageByAttackType: {},
  basicCount: 0, skillCount: 0, ultCount: 0, fuaCount: 0, overkillApprox: 0, healsApplied: 0, shieldsProvided: 0,
  spSpent: 0, spGained: 0, hpRemoved: 100, deaths: 0,
})

export default () => {
  const tanky = mob({ hp: 400_000, toughness: 160, spd: 110 })
  const teamA = [{ kitId: 'acheron', skillPriority: 1 }, { kitId: 'pela', skillPriority: 2 }, { kitId: 'guinaifen', skillPriority: 2 }, { kitId: 'bronya', skillPriority: 3 }]
  const teamB = [{ kitId: 'acheron', skillPriority: 1 }, { kitId: 'pela', skillPriority: 2 }, { kitId: 'guinaifen', skillPriority: 2 }, { kitId: 'sparkle', skillPriority: 3 }]
  const a = run({ team: teamA, enemy: tanky })
  const b = run({ team: teamB, enemy: tanky })
  const cmp = compareTeams(a.sim, b.sim, {
    aLabel: 'Team A', bLabel: 'Team B', encounter: 'Boss / 1 target / 4 cycles',
    seed: 42, teamA, teamB, intendedDifferences: ['roster'],
  })

  // self-comparison: same team twice → every row has identical values, winner tie
  const s1 = run({ team: teamA, enemy: tanky })
  const s2 = run({ team: teamA, enemy: tanky })
  const self = compareTeams(s1.sim, s2.sim)

  // §77.4 detail levels: summary omits heavy sections, full adds per-slot build + signatures
  const cmpFull = compareTeams(a.sim, b.sim, {
    aLabel: 'Team A', bLabel: 'Team B', encounter: 'Boss / 1 target / 4 cycles',
    seed: 42, teamA, teamB, intendedDifferences: ['roster'], detail: 'full',
  })
  const cmpSummary = compareTeams(a.sim, b.sim, { aLabel: 'Team A', bLabel: 'Team B', detail: 'summary' })
  const cmpMulti = compareTeams(a.sim, b.sim, { mode: 'multi-seed' })

  // §77.1/§77.8/§77.14 A/B: runtime actors (summon) classified separately + owner folding + final stats
  const sumCfg = { teamA: [{ kitId: 'jingyuan' }, { kitId: 'pela' }], teamB: [{ kitId: 'jingyuan' }, { kitId: 'guinaifen' }] }
  const sumA = run({ team: [{ kitId: 'jingyuan', skillPriority: 1 }, { kitId: 'pela' }], enemy: tanky })
  const sumB = run({ team: [{ kitId: 'jingyuan', skillPriority: 1 }, { kitId: 'guinaifen' }], enemy: tanky })
  const sumCmp = compareTeams(sumA.sim, sumB.sim, { aLabel: 'JY A', bLabel: 'JY B', seed: 7, intendedDifferences: ['roster'], teamA: sumCfg.teamA, teamB: sumCfg.teamB })

  // §77.5/§77.14 metric absence → `missing`, not a silent 0; delta is B−A
  const emptyB = emptyRun()
  emptyB.totalDamage = 200
  const dmgM = buildMetrics(emptyRun(), emptyB).find(m => m.key === 'total-damage')!
  const fuaM = buildMetrics(emptyRun(), emptyB).find(m => m.key === 'fua')!
  const fuaWithEvents = buildMetrics({ ...emptyRun(), events: 1 }, emptyRun()).find(m => m.key === 'fua')!
  const seedField = cmp.inputAudit.fields.find(f => f.field === 'seed')

  // §77.2 build report: explicit per-slot gear (4pc + planar) resolves names, active sets and diff
  const mkGear = (si: number) => ({
    coneId: 'in_the_night', si,
    pieces: [
      { slot: 'head', setId: 'musketeer', main: 'hpFlat', subs: [{ stat: 'critRate', tier: 0, rolls: 3 }] },
      { slot: 'hands', setId: 'musketeer', main: 'atkFlat', subs: [] },
      { slot: 'body', setId: 'musketeer', main: 'critRate', subs: [] },
      { slot: 'feet', setId: 'musketeer', main: 'spd', subs: [] },
      { slot: 'sphere', setId: 'fleet', main: 'atkPct', subs: [] },
      { slot: 'rope', setId: 'fleet', main: 'energyRegen', subs: [] },
    ],
  })
  const rpt = buildReportOf({
    teamA: [{ kitId: 'archer', name: 'Archer', eidolon: 0, gear: mkGear(5) }] as any,
    teamB: [{ kitId: 'archer', name: 'Archer', eidolon: 1, gear: mkGear(1) }] as any,
  })
  const mA = rpt.a[0]

  return [
    raw('compare: report carries the full §77 metric set', ROW_METRICS.every(m => cmp.rows.some(r => r.metric === m)), cmp.rows.map(r => r.metric).join(',')),
    raw('compare: both teams actually fought (damage on both sides)', cmp.a.totalDamage > 0 && cmp.b.totalDamage > 0, `A=${Math.round(cmp.a.totalDamage)} B=${Math.round(cmp.b.totalDamage)}`),
    raw('compare: one-different-support swap produces a non-trivial delta', cmp.a.totalDamage !== cmp.b.totalDamage),
    raw('compare: a winner is named with reasons', (cmp.winner === 'A' || cmp.winner === 'B') && cmp.why.length > 0, `${cmp.winner}: ${cmp.why.join(' | ')}`),
    raw('compare: total-damage delta sign matches the winner', (cmp.winner === 'A') === (cmp.a.totalDamage > cmp.b.totalDamage)),
    raw('compare: report is non-empty text with WINNER/WHY', /WINNER:/.test(cmp.text) && /WHY:/.test(cmp.text)),
    raw('compare: self-comparison → identical values, winner tie', self.winner === 'tie' && self.rows.every(r => r.a === r.b), self.why.join(',')),
    raw('compare: metrics are a pure read (re-run identical → identical metrics)', sameMetrics(teamMetrics(s1.sim), teamMetrics(s2.sim))),

    // §77 typed result
    raw('compare: §77 metric carries unit + status + source', dmgM.unit === 'damage' && dmgM.statusA === 'ok' && dmgM.source.length > 0, `${dmgM.unit}/${dmgM.statusA}/${dmgM.source}`),
    raw('compare: §77 delta is B − A', dmgM.delta === 200 - 100, `${dmgM.delta}`),
    raw('compare: §77 empty event stream → FUA missing, delta null (not 0)', fuaM.statusA === 'missing' && fuaM.a === null && fuaM.delta === null, `${fuaM.statusA}/${fuaM.a}/${fuaM.delta}`),
    raw('compare: §77 with events, FUA is observable (ok)', fuaWithEvents.statusA === 'ok' && fuaWithEvents.a === 0, `${fuaWithEvents.statusA}/${fuaWithEvents.a}`),
    raw('compare: §77 input parity marks seed SAME/CONTROLLED', !!seedField && seedField.parity === 'SAME' && seedField.classification === 'CONTROLLED', JSON.stringify(seedField)),
    raw('compare: §77 no confounding differences on a clean control', cmp.inputAudit.confounding.length === 0, cmp.inputAudit.confounding.join(',')),
    raw('compare: §77 report renders INPUT PARITY + RESULT sections', /INPUT PARITY/.test(cmp.text) && /RESULT/.test(cmp.text)),
    raw('compare: §77 objective result matches the winner', cmp.objective.winner === cmp.winner, `${cmp.objective.winner}/${cmp.winner}`),

    // §77.2 build report
    raw('compare: §77.2 explicit gear → 6 pieces, provenance EXPLICIT', mA.provenance === 'EXPLICIT' && mA.pieces.length === 6, `${mA.provenance}/${mA.pieces.length}`),
    raw('compare: §77.2 active sets resolved (4pc cavern + 2pc planar)', mA.activeSets.includes('4pc Musketeer of Wild Wheat') && mA.activeSets.includes('2pc Fleet of the Ageless'), mA.activeSets.join(' | ')),
    raw('compare: §77.2 cone resolved with name/path/si', mA.cone?.id === 'in_the_night' && mA.cone.si === 5 && mA.cone.name.length > 0, JSON.stringify(mA.cone)),
    raw('compare: §77.2 pieces are slot-ordered with resolved set names', mA.pieces[0].slot === 'head' && mA.pieces[0].setName === 'Musketeer of Wild Wheat' && mA.pieces[5].slot === 'rope', mA.pieces.map(p => p.slot).join(',')),
    raw('compare: §77.2 build diff isolates the changed fields', rpt.diff.includes('archer.eidolon: 0 -> 1') && rpt.diff.includes('archer.cone: in_the_night(si5) -> in_the_night(si1)'), rpt.diff.join(' | ')),
    raw('compare: §77.2 gearless team → provenance NONE', cmp.build.a[0].provenance === 'NONE', cmp.build.a[0].provenance),
    raw('compare: §77.2 report renders BUILD A/B + slot-by-slot', /BUILD A:/.test(cmpFull.text) && /BUILD DIFF:/.test(cmpFull.text) && /BUILD B:/.test(cmpFull.text)),

    // §77.5 widened core-table
    raw('compare: §77.5 widened rows present (SP ledger/heals/shields/overkill)', ['SP Spent', 'SP Gained', 'Heals Applied', 'Shields', 'Overkill', 'Deaths'].every(l => cmp.rows.some(r => r.metric === l)), cmp.rows.map(r => r.metric).join(',')),
    raw('compare: §77.5 Basic/Skill count rows present', ['Basic Attacks', 'Skills'].every(l => cmp.rows.some(r => r.metric === l)), cmp.rows.map(r => r.metric).join(',')),
    raw('compare: §77.5 count metrics read the event stream (with events → ok)', buildMetrics(teamMetrics(s1.sim), teamMetrics(s2.sim)).find(m => m.key === 'sp-spent')?.statusA === 'ok'),
    raw('compare: §77.5 empty stream → widened metrics missing, not 0', buildMetrics(emptyRun(), emptyRun()).filter(m => ['sp-spent', 'deaths', 'shields'].includes(m.key)).every(m => m.statusA === 'missing' && m.a === null)),

    // §77.9 resource economy + §77.10 event/state diff
    raw('compare: §77.9 SP ledger measured, cap/start left unavailable (no base-5 assertion)', cmp.resources.a.spGained !== null && cmp.resources.a.spStart === null && cmp.resources.a.spEffectiveMax === null, `gain=${cmp.resources.a.spGained} start=${cmp.resources.a.spStart}`),
    raw('compare: §77.10 self-comparison → identical event stream + equal hashes', self.eventDiff.status === 'identical' && self.eventDiff.firstDivergence === null && self.eventDiff.aHash === self.eventDiff.bHash, `${self.eventDiff.status}/${self.eventDiff.aHash}`),
    raw('compare: §77.10 divergent teams → compared up to a first divergence with prior context', cmp.eventDiff.status === 'compared' && cmp.eventDiff.firstDivergence !== null && cmp.eventDiff.prevContext !== null, `matched=${cmp.eventDiff.matched} div=${cmp.eventDiff.firstDivergence}`),
    raw('compare: §77.9/§77.10 report renders RESOURCE ECONOMY + EVENT DIFF', /RESOURCE ECONOMY:/.test(cmp.text) && /EVENT DIFF:/.test(cmp.text)),

    // §77.7 damage axes + §77.8 per-owner share
    raw('compare: §77.7 views labelled partition vs cross-tab (no cross-view summing)', cmp.damage.views.filter(v => v.axis === 'owner' || v.axis === 'attacker').every(v => v.kind === 'partition') && cmp.damage.views.filter(v => ['action', 'mechanic', 'element'].includes(v.axis)).every(v => v.kind === 'cross-tab'), cmp.damage.views.map(v => `${v.axis}:${v.kind}`).join(',')),
    raw('compare: §77.7 owner partition reconciles to the engine total', cmp.damage.reconciledA && cmp.damage.reconciledB, `${cmp.damage.reconciledA}/${cmp.damage.reconciledB}`),
    raw('compare: §77.8 owner-attributed shares sum to 100%', Math.abs(Object.values(cmp.damage.ownerShareA).reduce((x, y) => x + y, 0) - 1) < 1e-6, JSON.stringify(cmp.damage.ownerShareA)),
    raw('compare: §77.8 report renders DAMAGE BY OWNER + convention note', /DAMAGE BY OWNER/.test(cmp.text) && /owner-attributed/.test(cmp.text)),

    // §77.14 validation / reconciliation audit
    raw('compare: §77.14 audit runs all 17 checks', cmp.validation.checks.length === 17, `${cmp.validation.checks.length}`),
    raw('compare: §77.14 clean control → no FAIL, overall VALID', cmp.validation.valid && cmp.validation.failed.length === 0, cmp.validation.checks.filter(c => c.status === 'FAIL').map(c => c.id).join(',')),
    raw('compare: §77.14 each check carries a status', cmp.validation.checks.every(c => ['PASS', 'FAIL', 'NOT CHECKED', 'NOT APPLICABLE'].includes(c.status)), cmp.validation.checks.map(c => c.status).join(',')),
    raw('compare: §77.14 report renders AUDIT with overall status', /AUDIT:/.test(cmp.text) && /overall: VALID/.test(cmp.text)),

    // §77.4 detail levels + §77.12 mode labelling
    raw('compare: §77.4 summary keeps the verdict, drops heavy sections', /RESULT/.test(cmpSummary.text) && /WINNER:/.test(cmpSummary.text) && !/INPUT PARITY/.test(cmpSummary.text) && !/BUILD/.test(cmpSummary.text), cmpSummary.metadata.detail),
    raw('compare: §77.4 standard keeps parity/rules/audit but no per-slot build', /INPUT PARITY/.test(cmp.text) && /AUDIT:/.test(cmp.text) && /BUILD DIFF:/.test(cmp.text) && !/BUILD A:/.test(cmp.text), cmp.metadata.detail),
    raw('compare: §77.4 full adds per-slot build and event signatures', /BUILD A:/.test(cmpFull.text) && /A\[/.test(cmpFull.text) === (cmpFull.eventDiff.firstDivergence !== null), cmpFull.metadata.detail),
    raw('compare: §77.4 detail level is surfaced in metadata', cmp.metadata.detail === 'standard' && cmpFull.metadata.detail === 'full' && cmpSummary.metadata.detail === 'summary'),
    raw('compare: §77.12 mode is labelled and multi-seed is flagged unimplemented', cmpMulti.metadata.mode === 'multi-seed' && cmpMulti.explanation.limitations.some(l => /multi-seed requested but not implemented/.test(l)), cmpMulti.explanation.limitations[0]),

    // §77.1.2 / §77.2 / §77.14.2 / §77.14.5 / §77.14.9 roster-from-config + runtime actors + final runtime stats
    raw('compare: §77.1.2 roster comes from the team config, not the runtime roster', cmp.actors.rosterA.length === 4 && cmp.actors.rosterB.length === 4, `A=${cmp.actors.rosterA.join(',')}`),
    raw('compare: §77.1.2 characters-only team has no separate runtime actors', cmp.actors.actorsA.length === 0 && cmp.actors.actorsB.length === 0),
    raw('compare: §77.14.2 roster-from-config check passes', cmp.validation.checks.find(c => c.id === 2)?.status === 'PASS', JSON.stringify(cmp.validation.checks.find(c => c.id === 2))),
    raw('compare: §77.8 summon appears as a separate runtime actor with owner + stat source', sumCmp.actors.actorsA.some(x => x.kind === 'summon' && !!x.owner && x.statSource.length > 0), sumCmp.actors.actorsA.map(x => `${x.name}[${x.kind}]<-${x.owner}`).join(',')),
    raw('compare: §77.14.9 summon damage folds to the owner, no non-character owner bucket', sumCmp.validation.checks.find(c => c.id === 9)?.status === 'PASS' && sumCmp.actors.ownerBucketErrors.a.length === 0 && sumCmp.actors.ownerBucketErrors.b.length === 0, JSON.stringify(sumCmp.actors.ownerBucketErrors)),
    raw('compare: §77.14.9 NOT APPLICABLE when no summon is present', cmp.validation.checks.find(c => c.id === 9)?.status === 'NOT APPLICABLE', cmp.validation.checks.find(c => c.id === 9)?.status),
    raw('compare: §77.2 report renders RUNTIME ACTORS + FINAL RUNTIME STATS', /RUNTIME ACTORS/.test(cmp.text) && /FINAL RUNTIME STATS/.test(cmp.text)),
    raw('compare: §77.2 final runtime stats resolve for every declared member', ['acheron', 'pela', 'guinaifen', 'bronya'].every(k => !!cmp.runtimeStats.a[k]), JSON.stringify(cmp.runtimeStats.a)),
    raw('compare: §77.14.5 final-stats-are-runtime-resolved check passes', cmp.validation.checks.find(c => c.id === 5)?.status === 'PASS', JSON.stringify(cmp.validation.checks.find(c => c.id === 5))),
  ]
}
