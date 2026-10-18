import type { Unit } from '../entities/Unit'
import type { Simulator, DoTWithSource } from '../simulator'
import { enemyControlImmune } from '../enemy/defense'

/** DoT ownership: the single application path, so DOT_APPLIED always has a choke point. */
export class DotSystem {
  constructor(private s: Simulator) {}

  /** the one DoT application path. 19 kit/gear call sites used to `unit.dots.push(...)` directly,
   *  which left DOT_APPLIED with no choke point and every control debuff invisible until it ticked;
   *  they all go through here now. CONTROL_APPLIED rides along for the three control debuffs
   *  (Freeze / Imprisonment / Entanglement), which DO gate actions rather than deal damage. */
  apply(target: Unit, dot: DoTWithSource): DoTWithSource {
    // §58 control-immune: no DoT lands (no DOT_APPLIED/CONTROL_APPLIED), one NOTE. Same gate that
    // keeps debuff-buffs off an immune enemy — profiles are per-enemy data, so everything else
    // keeps its pre-§58 behavior.
    if (enemyControlImmune(target)) {
      this.s.log(`${target.name} is immune to ${dot.kind} (control-immune)`)
      this.s.logger.emit({ type: 'NOTE', raw: `${target.name} is immune to ${dot.kind}`, minDebug: 2 })
      return dot
    }
    target.dots.push(dot as NonNullable<Unit['dots']>[number])
    const src = dot.sourceUnit
    this.s.logger.emit({ type: 'DOT_APPLIED', source: src?.name, target: target.name, sourceId: src?.id, targetId: target.id, element: dot.elem, payload: { kind: dot.kind, turns: dot.turns, stacks: dot.stacks ?? 1, baseDmg: Math.round(dot.baseDmg) } })
    if (dot.kind === 'Freeze' || dot.kind === 'Imprisonment' || dot.kind === 'Entanglement')
      this.s.logger.emit({ type: 'CONTROL_APPLIED', source: src?.name, target: target.name, sourceId: src?.id, targetId: target.id, payload: { kind: dot.kind, turns: dot.turns, stacks: dot.stacks ?? 1 } })
    return dot
  }
}
