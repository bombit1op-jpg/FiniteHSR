/** §84.6.1 pre-combat Technique resolution — the RULE-INTERPRETATION stage between the
 *  configured `techniques` list and the battle-entry effects that actually apply.
 *
 *  Two distinct facts are tracked: (a) which Techniques were USED (an ordered activation list;
 *  a use counts even when the activation itself is later cancelled) and (b) which activations
 *  SURVIVE to battle entry (their effects carry into the fight). A cancelled/replaced Technique
 *  still contributes to use-based counters (M7H "Feast in One Go" #122407).
 *
 *  Rule-driven, no hardcoded kit ids — the rules come from TechniqueDef tags:
 *   - repeat-cap:      more uses of one kit than its TechniqueDef.maxUses (default 1)
 *   - attack-conflict: at most ONE attack-kind Technique initiates the encounter (first wins,
 *                      pinned by check.ts + tests/golden/techniques/prefight.ts)
 *   - zone-replaced:   at most ONE zone Technique survives (last wins, earlier marked replaced)
 *   - switch-cancelled: a switchSensitive effect is lost when a later activation switches to a
 *                      different character (the last surviving activation's character is the
 *                      active one at battle entry)
 *
 *  Deliberate simplification (ponytail): Technique Point costs and the shared TP budget are NOT
 *  modeled — no kit defines a cost today. Upgrade path: optional `cost` on TechniqueDef plus a
 *  budget check here once raw data provides costs. */

export type CancelReason = 'repeat-cap' | 'attack-conflict' | 'zone-replaced' | 'switch-cancelled'

/** one configured Technique activation, resolved against TechniqueDef rule tags */
export interface PreCombatInput {
  kitId: string
  name: string
  kind: 'buff' | 'attack'
  zone?: boolean
  switchSensitive?: boolean
  maxUses?: number
}

export interface PreCombatActivation extends PreCombatInput {
  /** 0-based index of this use among the same kitId's uses */
  useIndex: number
  survives: boolean
  cancelledBy?: CancelReason
  /** display name the cancellation names (the replacement technique / the character switched to) */
  replacedBy?: string
}

export interface PreCombatPlan {
  /** ordered activations — config order IS the activation (selection) order */
  activations: PreCombatActivation[]
  /** use count per kitId; every use counts, even cancelled ones */
  useCounts: Record<string, number>
  /** activations whose effects survive to battle entry */
  survivors: PreCombatActivation[]
  /** activations cancelled by a rule (attack conflict / zone replaced / switch / repeat cap) */
  cancelled: PreCombatActivation[]
}

export const EMPTY_PRECOMBAT: PreCombatPlan = { activations: [], useCounts: {}, survivors: [], cancelled: [] }

/** resolve the ordered activation list into used-vs-surviving facts (pure, no Simulator) */
export function resolvePreCombat(inputs: readonly PreCombatInput[]): PreCombatPlan {
  const activations: PreCombatActivation[] = []
  const useCounts: Record<string, number> = {}
  for (const inp of inputs) {
    const useIndex = useCounts[inp.kitId] ?? 0
    useCounts[inp.kitId] = useIndex + 1
    activations.push({ ...inp, useIndex, survives: true })
  }
  const cancel = (a: PreCombatActivation, by: CancelReason, replacedBy?: string): void => {
    a.survives = false
    a.cancelledBy = by
    a.replacedBy = replacedBy
  }
  // repeat-cap: uses beyond maxUses (default 1) never apply, but stay counted uses
  for (const a of activations) if (a.useIndex >= (a.maxUses ?? 1)) cancel(a, 'repeat-cap')
  // attack-conflict: first surviving attack-kind Technique initiates the encounter
  let attack: PreCombatActivation | undefined
  for (const a of activations) {
    if (!a.survives || a.kind !== 'attack') continue
    if (attack) cancel(a, 'attack-conflict', attack.name)
    else attack = a
  }
  // zone-replaced: the LAST surviving zone Technique remains; earlier ones are marked replaced
  let zone: PreCombatActivation | undefined
  for (const a of activations) {
    if (!a.survives || !a.zone) continue
    if (zone) cancel(zone, 'zone-replaced', a.name)
    zone = a
  }
  // switch-cancelled: the last surviving activation's character is the active one at battle
  // entry — a switchSensitive effect from a different character is lost on the switch
  const survivors = activations.filter(a => a.survives)
  const active = survivors[survivors.length - 1]
  if (active) {
    for (const a of survivors) {
      if (a !== active && a.switchSensitive && a.kitId !== active.kitId) cancel(a, 'switch-cancelled', active.name)
    }
  }
  return {
    activations,
    useCounts,
    survivors: activations.filter(a => a.survives),
    cancelled: activations.filter(a => !a.survives),
  }
}
