import type { Simulator } from '../core/simulator'
import type { BattleEvent } from '../core/battlelog'
import type { TeamSpec } from '../core/battle'

/**
 * §35 TEAM AUDIT — run ONE real team to completion, then report its health by category:
 * DATA / EQUIPMENT / TEAM INTERACTIONS / COMBAT / INVARIANTS / DETERMINISM / GOLDEN TRACE.
 *
 * Reuses the engine's own invariant verifier (`battle/Invariants.ts` via `logger.verify()`) rather
 * than re-deriving roster bounds, and reads the single event stream — no parallel combat logic.
 * Detailed per-effect coverage stays in the dedicated gear/kit suites; this is the aggregate gate.
 */
export type CheckStatus = 'PASS' | 'N/A' | 'FAIL'

export interface AuditCheck { name: string; status: CheckStatus; detail?: string }
export interface AuditSection { name: string; checks: AuditCheck[] }
export interface AuditReport { sections: AuditSection[]; ok: boolean; text: string }

export interface AuditInput {
  sim: Simulator
  /** declared team (so EQUIPMENT can see what gear was requested); optional */
  team?: readonly TeamSpec[]
  /** fingerprints from an independent identical run — turns DETERMINISM from N/A into a real check */
  rerun?: { eventHash: string; stateHash: string }
}

const pass = (name: string, detail?: string): AuditCheck => ({ name, status: 'PASS', detail })
const fail = (name: string, detail?: string): AuditCheck => ({ name, status: 'FAIL', detail })
const na = (name: string): AuditCheck => ({ name, status: 'N/A' })
const gate = (name: string, ok: boolean, detail?: string): AuditCheck => (ok ? pass(name, detail) : fail(name, detail))
const applicable = (name: string, fired: boolean): AuditCheck => (fired ? pass(name) : na(name))

/** Aggregate audit over a completed battle. */
export function auditTeam(input: AuditInput): AuditReport {
  const { sim, team, rerun } = input
  const events: readonly BattleEvent[] = sim.logger.events
  const allies = sim.roster.filter(u => u.side !== 'enemy')
  const has = (t: string): boolean => events.some(e => e.type === t)
  const count = (t: string): number => events.filter(e => e.type === t).length

  const finite = (n: number): boolean => Number.isFinite(n) && n > 0
  const totalDamage = [...sim.ownerDamage.values()].reduce((a, b) => a + b, 0)
  const axesSumOk = [...sim.ownerAxis].every(([id, m]) =>
    Math.abs([...m.values()].reduce((a, b) => a + b, 0) - (sim.ownerDamage.get(id) ?? 0)) < 1e-6)

  const fuaDamage = [...sim.ownerAxis.values()].reduce((a, m) => a + (m.get('fua') ?? 0), 0)
  const geared = (team ?? []).some(t => t.gear && (t.gear.coneId || t.gear.planarId || (t.gear.relicSets?.length ?? 0) > 0))
  const allFinite = allies.every(u =>
    Number.isFinite(u.hp) && Number.isFinite(u.maxHp) && Number.isFinite(u.base.atk) && Number.isFinite(u.base.def))

  const violations = sim.logger.verify()
  const actionIds = events.map(e => e.actionId)
  const actionMono = actionIds.every((v, i) => i === 0 || v >= (actionIds[i - 1] ?? 0))
  const lastEvent = events[events.length - 1]?.type
  const eventIdMono = events.every((e, i) => i === 0 || e.eventId > (events[i - 1]?.eventId ?? 0))
  const deterministic = rerun
    ? gate('Re-run identical (event + state hash)', rerun.eventHash === sim.logger.eventHash() && rerun.stateHash === sim.logger.hash(),
      `event ${rerun.eventHash === sim.logger.eventHash() ? '=' : '≠'} · state ${rerun.stateHash === sim.logger.hash() ? '=' : '≠'}`)
    : na('Re-run identical (event + state hash)')

  const sections: AuditSection[] = [
    { name: 'DATA', checks: [
      gate('Character data (finite base stats, elem, kitId)', allies.every(u => finite(u.maxHp) && finite(u.base.atk) && finite(u.base.def) && finite(u.base.spd) && !!u.elem && !!u.kitId)),
      team ? gate('Eidolon in range 0..6', team.every(t => (t.eidolon ?? 0) >= 0 && (t.eidolon ?? 0) <= 6)) : na('Eidolon in range 0..6 (no team declared)'),
    ] },
    { name: 'EQUIPMENT', checks: [
      geared ? gate('Stats (gear folded, no NaN)', allFinite) : na('Stats (no gear declared)'),
      geared ? applicable('Passives (gear buff applied)', has('BUFF_APPLIED')) : na('Passives (no gear declared)'),
    ] },
    { name: 'TEAM INTERACTIONS', checks: [
      gate('Buff/debuff interaction', count('BUFF_APPLIED') + count('DEBUFF_APPLIED') > 0, `buff=${count('BUFF_APPLIED')} debuff=${count('DEBUFF_APPLIED')}`),
      gate('SP economy', has('SP_GAIN') || has('SP_LOSS'), `gain=${count('SP_GAIN')} loss=${count('SP_LOSS')}`),
      gate('Energy interaction', has('ENERGY_GAIN') || has('ENERGY_FULL'), `gain=${count('ENERGY_GAIN')}`),
    ] },
    { name: 'COMBAT', checks: [
      gate('Timeline (actions opened and closed, ordered)', count('ACTION_START') > 0 && count('ACTION_END') > 0 && actionMono),
      gate('Damage', totalDamage > 0, `${Math.round(totalDamage)}`),
      gate('Damage attribution (axes sum to owner total)', axesSumOk),
      applicable('Break', has('TOUGHNESS_DAMAGE')),
      applicable('FUA', fuaDamage > 0),
      gate('Buffs', count('BUFF_APPLIED') > 0),
      applicable('Summons', has('SUMMON_CREATED')),
    ] },
    { name: 'INVARIANTS', checks: [
      gate(`${events.length} event checks`, violations.length === 0, violations.slice(0, 3).join('; ')),
    ] },
    { name: 'DETERMINISM', checks: [deterministic] },
    { name: 'GOLDEN TRACE', checks: [
      gate('Bounded, monotonic stream, BATTLE_START..BATTLE_END', events.length > 0 && events.some(e => e.type === 'BATTLE_START') && lastEvent === 'BATTLE_END' && eventIdMono, `${events.length} events`),
    ] },
  ]

  const ok = sections.every(s => s.checks.every(c => c.status !== 'FAIL'))
  const text = ['TEAM AUDIT', '', ...sections.flatMap(s => [
    `  ${s.name}`,
    ...s.checks.map(c => `    ${c.name.padEnd(52)}${c.status}${c.detail ? `  (${c.detail})` : ''}`),
    '',
  ]), ok ? 'RESULT: PASS' : 'RESULT: FAIL'].join('\n')
  return { sections, ok, text }
}
