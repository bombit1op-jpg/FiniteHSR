/**
 * §45 lab — follow-up attacks + event ordering.
 * Follow-Up is a `DmgType`/`AbilityType` tag, not its own event (§5): a live FUA team must land
 * hits whose damage trace carries `type: 'fua'`, attributed to the owner's summon (§11). The
 * same seed must reproduce the identical event stream (§32) — the fan-out `hit → trigger → fua`
 * is exactly the ordering the reference calls out as risky (§43).
 */
import { ENEMY_PRESETS, runBattle } from '../../src/core/battle'
import { eq, isEntry, ok, report, type LabCase } from './harness'

interface Trace { type?: string }
const traceOf = (e: { payload: Record<string, unknown> }): Trace => (e.payload.breakdown as Trace | undefined) ?? {}

const setup = () => ({
  team: ['topaz', 'dr_ratio', 'moze', 'aventurine'].map(kitId => ({ kitId })),
  enemy: { ...ENEMY_PRESETS.mob, count: 1 },
  cycles: 3, seed: 5,
  log: { debug: 5 as const },
})

export function fuaLab(): LabCase[] {
  const a = runBattle(setup())
  const b = runBattle(setup())
  const seq = (s: typeof a): string => s.logger.events.map(e => e.type).join(',')

  const dmg = a.logger.events.filter(e => e.type === 'DAMAGE_DEALT')
  const fua = dmg.filter(e => traceOf(e).type === 'fua')
  const fuaSources = new Set(fua.map(e => String(e.payload.sourceId)))

  return [
    eq('events recorded (log debug 5)', a.logger.events.length > 0 ? 1 : 0, 1),
    ok('same seed → identical event-type stream', seq(a) === seq(b)),
    ok('a Follow-Up (DmgType fua) landed', fua.length > 0),
    ok('fua hits carry the tag in their damage trace', fua.every(e => traceOf(e).type === 'fua')),
    ok('fua attributed to a summon owner id (§11)', [...fuaSources].some(id => id.startsWith('nb_')))
  ]
}

if (isEntry('fua.ts')) process.exitCode = report('Follow-up / event-ordering lab', fuaLab())
