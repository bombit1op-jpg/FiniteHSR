import type { AbilityType, Elem, StatKey } from '../entities/Unit'

export interface Mod {
  stat: StatKey
  value: number
  /** count this mod only while the owner is performing one of these abilities (Cornucopia: heal
   *  from a Skill/Ultimate). Undefined = always counts. Read at heal time via `pressedAbility`. */
  whenAbility?: AbilityType[]
}

export interface Buff {
  id: string
  name: string
  mods: Mod[]
  /** turns left; decremented at end of owner's turn; Infinity = permanent */
  turns?: number
  stacks?: number
  maxStacks?: number
  /** when true, removed when source's turn ends instead of owner's (exempt from expireBuffs) */
  tickOnSource?: boolean
  sourceId?: string
  /** true for enemy-side debuffs (Slow, Imprison, Weaken...) — dispel targets */
  debuff?: boolean
  /** free-form payload (e.g. Gallagher Besotted heal amount) */
  payload?: number
  /** remaining damage absorbed by this shield buff (March 7th Skill) */
  shield?: number
}

export interface DoT {
  kind: 'Bleed' | 'Burn' | 'Freeze' | 'Shock' | 'WindShear' | 'Entanglement' | 'Imprisonment' | 'Arcana'
  elem: Elem
  /** pre-multiplier "Base DMG" per wiki formula */
  baseDmg: number
  turns: number
  stacks?: number
  sourceBe?: number
  /** the DoT's own defense ignore (Black Swan Arcana 20%) — applies only to this DoT */
  defIgnore?: number
}