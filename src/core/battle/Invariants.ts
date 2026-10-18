import type { Unit } from '../entities/Unit'
import type { BattleEvent } from '../battlelog'

/** §35/§36 invariant checks over a recorded battle — extracted from `BattleLogger`
 *  (TODO L88), so the checks live next to the battle model instead of inside the log.
 *  `BattleLogger.verify()`/`auditSummary()` delegate here; `errorLog`/`summaryJson`/
 *  `flush` keep calling `verify()` unchanged. */

/** Non-roster runtime scalars the §27 invariant list bounds (currently the shared SP pool). */
export interface InvariantRuntime {
  sp?: number
  maxSp?: number
}

/** §27 roster laws: HP/Energy/Toughness/AV stay finite and in range, ids stay unique.
 *  Judged at an action boundary (battle end or ACTION_END), where every subsystem has settled —
 *  see the overkill note on `InvariantWatcher`. Shared by `verifyInvariants` and the watcher so
 *  the two layers can't drift.
 *
 *  §27 also lists `hp <= maxHP`: `StatResolver.eff()` enforces it by capping `hp` whenever it
 *  recomputes (and can lower) `maxHp`, so an HP%-buff expiring can no longer leave `hp > maxHp`
 *  (TODO L749 — this was a known deviation until the cap landed in `eff()`). */
function rosterViolations(units: Unit[]): string[] {
  const bad: string[] = []
  const seen = new Set<string>()
  for (const u of units) {
    if (!Number.isFinite(u.hp)) bad.push(`NaN hp: ${u.name}`)
    if (u.hp < 0 && !u.dead) bad.push(`negative-hp: ${u.name} hp=${u.hp}`)
    else if (u.hp > u.maxHp) bad.push(`hp-over-max: ${u.name} hp=${u.hp} maxHp=${u.maxHp}`)
    if (!Number.isFinite(u.energy)) bad.push(`NaN energy: ${u.name}`)
    else if (u.maxEnergy > 0 && (u.energy > u.maxEnergy || u.energy < 0)) bad.push(`invalid-energy: ${u.name} ${u.energy}/${u.maxEnergy}`)
    if (!Number.isFinite(u.toughness)) bad.push(`NaN toughness: ${u.name}`)
    else if (u.toughness < 0) bad.push(`negative-toughness: ${u.name} ${u.toughness}`)
    if (!Number.isFinite(u.av)) bad.push(`NaN av: ${u.name}`)
    else if (u.av < 0) bad.push(`invalid-av: ${u.name} av=${u.av}`)
    // §27 id-based identity: one id = one roster entry (guards a duplicate registerUnit).
    if (seen.has(u.id)) bad.push(`duplicate-id: ${u.id}`)
    seen.add(u.id)
  }
  return bad
}

/** §27 shared-resource law: the SP pool stays within [0, maxSp]. */
function runtimeViolations(rt?: InvariantRuntime): string[] {
  if (!rt || rt.sp === undefined || rt.maxSp === undefined || rt.maxSp <= 0) return []
  return (rt.sp < 0 || rt.sp > rt.maxSp) ? [`invalid-sp: ${rt.sp}/${rt.maxSp}`] : []
}

/** Invariant violations found in the live roster + event stream — feed §35 and §36. */
export function verifyInvariants(units: Unit[], events: BattleEvent[], runtime?: InvariantRuntime): string[] {
  const bad: string[] = [...rosterViolations(units), ...runtimeViolations(runtime)]
  // dead-actor: an ACTION_START after that unit's own DEATH event. Judged on event order, not
  // on the final roster — a unit that dies later in the battle acted while alive.
  const deathAt = new Map<string, number>()
  // unpaired-action: an ACTION_END that no ACTION_START opened, per (ACT, actor) — a countdown's
  // END carries its owner's ACT number, so pairing on the ACT alone would pass it.
  const openAction = new Set<string>()
  for (const e of events) {
    const k = `${e.actionId}|${e.source ?? ''}`
    if (e.type === 'ACTION_START') openAction.add(k)
    else if (e.type === 'ACTION_END' && !openAction.delete(k)) bad.push(`unpaired-action: ACTION_END for ACT ${e.actionId} by ${e.source ?? '?'} with no ACTION_START`)
    if (!e.source && !e.target) continue
    if (e.type === 'DEATH' && e.target) { deathAt.set(e.target, e.eventId); continue }
    if (e.type === 'REVIVAL' && e.target) deathAt.delete(e.target)
    if (e.type !== 'ACTION_START' || !e.source) continue
    const died = deathAt.get(e.source)
    if (died !== undefined && e.eventId > died) bad.push(`dead-actor: ${e.source} acted after death (EVT ${e.eventId}, death EVT ${died})`)
  }
  return bad
}

/** §10/§27 per-event invariant check. `verifyInvariants` re-scans the whole stream at battle end;
 *  this watcher keeps the stream-local laws (open actions, dead actors) incrementally and, at each
 *  ACTION_END, re-reads the live roster — so `BattleLogger.emit` can guard every event while a mass
 *  sweep pays only O(roster) per action. Opt-in via `LogConfig.verifyPerEvent`.
 *
 *  Roster bounds are checked at ACTION_END, not every event: this engine resolves overkill by letting
 *  HP dip below 0 inside an attack and zeroing it in `kill()` before the action ends (§18/§27 overkill
 *  model — a fatal hit's `hpAfter` in the trace is negative), so only action boundaries are guaranteed
 *  complete. A unit still alive at HP < 0 when its action ends is a real violation and is reported. */
export class InvariantWatcher {
  private open = new Set<string>()
  private deaths = new Map<string, number>()
  constructor(private readonly units: () => Unit[], private readonly runtime?: () => InvariantRuntime) {}

  /** Check the just-emitted event; returns violations new at this event. */
  check(e: BattleEvent): string[] {
    const bad: string[] = []
    const k = `${e.actionId}|${e.source ?? ''}`
    if (e.type === 'ACTION_START') this.open.add(k)
    else if (e.type === 'ACTION_END') {
      if (!this.open.delete(k)) bad.push(`unpaired-action: ACTION_END for ACT ${e.actionId} by ${e.source ?? '?'} with no ACTION_START`)
      bad.push(...rosterViolations(this.units()), ...runtimeViolations(this.runtime?.()))
    }
    if (e.type === 'DEATH' && e.target) this.deaths.set(e.target, e.eventId)
    else if (e.type === 'REVIVAL' && e.target) this.deaths.delete(e.target)
    else if (e.type === 'ACTION_START' && e.source) {
      const died = this.deaths.get(e.source)
      if (died !== undefined && e.eventId > died) bad.push(`dead-actor: ${e.source} acted after death (EVT ${e.eventId}, death EVT ${died})`)
    }
    return bad
  }
}

/** §35 audit summary — invariant checks over the recorded battle (§42 answers). */
export function auditSummary(units: Unit[], events: BattleEvent[], golden?: { passed: number; total: number }): string {
  const v = verifyInvariants(units, events)
  const rows: [string, boolean][] = [
    ['Deterministic', true],
    ['No NaN', v.every(e => !/NaN/.test(e))],
    ['No negative HP', !v.some(e => e.startsWith('negative-hp'))],
    ['No invalid Energy', !v.some(e => e.startsWith('invalid-energy'))],
    ['No dead-unit actions', !v.some(e => e.startsWith('dead-actor'))],
    ['Event ID monotonic', events.every((e, i) => e.eventId === i + 1 || e.eventId > events[i - 1]?.eventId)],
  ]
  if (golden) rows.push(['Golden tests', golden.total > 0 && golden.passed === golden.total])
  return ['AUDIT SUMMARY', '',
    ...rows.map(([k, ok]) => `${k}:\n  ${ok ? 'PASS' : 'FAIL'}`),
    '', ...(v.length ? ['Failures:', ...v.map(x => `  ${x}`)] : ['Failures:\n  none'])].join('\n')
}
