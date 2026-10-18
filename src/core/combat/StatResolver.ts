import type { Buff, DmgType, Elem, StatKey, Unit } from '../entities/Unit'

export function buffSum(buffs: Buff[], key: StatKey): number {
  let v = 0
  for (const b of buffs) {
    const st = b.stacks ?? 1
    for (const m of b.mods) if (m.stat === key) v += m.value * st
  }
  return v
}

/** Combat stats of a unit including active buffs. */
export interface EffStats {
  atk: number
  def: number
  spd: number
  hp: number
  critRate: number
  critDmg: number
  be: number
  elation: number
  merrymake: number
}
export function eff(u: Unit): EffStats {
  const b = u.buffs
  const maxHp = Math.round(u.base.hp * (1 + buffSum(b, 'hpPct')) + buffSum(b, 'hpFlat'))
  u.maxHp = maxHp
  // §27: current HP can never exceed Max HP. This is the single site that lowers `maxHp`, so cap
  // `hp` here: a Max-HP buff expiring (or a Max-HP stack dropping) recomputes `maxHp` below `hp`
  // when the unit healed up to the buffed cap, and the cap keeps the invariant without a fake
  // event. Overkill's deliberately sub-zero `hp` (§18) is untouched — only the upper bound moves.
  if (u.hp > maxHp) u.hp = maxHp

  // A memosprite crits with its Memomaster's CURRENT CRIT (Memosprite.md), so resolve the
  // owner's live values instead of a snapshot taken at summon time. `kind === 'char'` is
  // both canon (only Memomasters own memosprites) and the recursion stop.
  const co = u.critOwner && u.critOwner.kind === 'char' ? u.critOwner : undefined
  return {
    atk: u.base.atk * (1 + buffSum(b, 'atkPct')) + buffSum(b, 'atkFlat'),
    def: u.base.def * (1 + buffSum(b, 'defPct')) + buffSum(b, 'defFlat'),
    spd: Math.max(1, u.base.spd * (1 + buffSum(b, 'spdPct') - buffSum(b, 'spdDown')) + buffSum(b, 'spdFlat')),
    hp: maxHp,
    critRate: (co ? eff(co).critRate : (u.base.critRate ?? 0.05)) + buffSum(b, 'critRate'),
    critDmg: (co ? eff(co).critDmg : (u.base.critDmg ?? 0.5)) + buffSum(b, 'critDmg'),
    be: buffSum(b, 'be'),
    elation: buffSum(b, 'elation'),
    merrymake: buffSum(b, 'merrymake'),
  }
}

/** Resolved Effect RES (§16) — the single value a debuff-landing roll checks against.
 *  Static base (enemies carry it in `Unit.effectRes` from the raw stat table) plus any active
 *  `effRes` buff mods (traces/cones/kits and Effect-RES-reduction debuffs like Spring Loader's
 *  "Effect RES −20%"). Without the buff term the engine has no path to LOWER a target's Effect RES. */
export function effectResOf(u: Unit): number {
  return (u.effectRes ?? 0) + buffSum(u.buffs, 'effRes')
}

/** Debuff RES categories the engine can gate a debuff-landing roll on. */
export type DebuffCategory = 'Bleed' | 'Burn' | 'Shock' | 'WindShear' | 'Freeze' | 'Entanglement' | 'Imprisonment'
/** category → raw column index in the target's `Unit.debuffRes` table. */
const DEBUFF_RES_COL: Record<DebuffCategory, number> = {
  Bleed: 0, Burn: 1, Freeze: 2, Shock: 3, WindShear: 4, Entanglement: 5, Imprisonment: 6,
}
/** Action-preventing debuffs additionally check the Control Effects RES column (col 7); per canon an
 *  overlap with the type column multiplies (docs/combat_mechanics/Debuff RES.md). */
const CONTROL_DEBUFFS: ReadonlySet<DebuffCategory> = new Set(['Freeze', 'Entanglement', 'Imprisonment'])

/** Debuff RES landing multiplier (§16) for a debuff `kind`: 1 = unaffected. Product of the
 *  type-specific column and — for control debuffs — the Control Effects RES column. Most enemies
 *  carry no profile and allies never do, so this returns 1 for them and for unlisted debuffs. */
export function debuffResMult(u: Unit, kind?: DebuffCategory): number {
  const dr = u.debuffRes
  if (!dr || !kind) return 1
  const spec = dr[DEBUFF_RES_COL[kind]] ?? 0
  const ctrl = CONTROL_DEBUFFS.has(kind) ? (dr[7] ?? 0) : 0
  return (1 - spec) * (1 - ctrl)
}

/** `also`: extra damage tags on a dual-typed hit (e.g. a Skill that also counts as a Follow-Up
 *  ATK). Type-keyed boosts of every tag apply; the primary `type` drives gates and event identity. */
export function dmgBoostMult(attackerBuffs: Buff[], elem: Elem, type: DmgType, also?: DmgType[]): number {
  let v = 1 + buffSum(attackerBuffs, `boost:${type}`) + buffSum(attackerBuffs, `dmg:${elem}`) + buffSum(attackerBuffs, 'dmgAll')
  if (also) for (const t of also) v += buffSum(attackerBuffs, `boost:${t}`)
  return v
}

export function resFactor(target: Unit, attackerBuffs: Buff[], elem: Elem): number {
  const pen = buffSum(attackerBuffs, 'resPenAll') + buffSum(attackerBuffs, `resPen:${elem}`)
  const red = buffSum(target.buffs, `resRed:${elem}`)
  const resAll = buffSum(target.buffs, 'resAll')
  // RES reduction caps at 90%; RES PEN bottoms out at -100% (max 2.0x). No floor at 0.
  return 1 - Math.min(0.9, Math.max(-1, (target.res[elem] ?? 0) + resAll - pen - red))
}

/** Vulnerability bonus caps at +250% (max 3.5x taken) and cannot go below 0. */
export function vulnFactor(bonus: number): number {
  return 1 + Math.min(2.5, Math.max(0, bonus))
}

export function rawDefMult(attackerLevel: number, defenderLevel: number, mod = 1): number {
  const a = attackerLevel * 10 + 200
  return a / ((200 + 10 * defenderLevel) * Math.max(0, mod) + a)
}

export function defMultiplier(attackerLevel: number, defenderLevel: number, defender: Unit, extraDefIgnore = 0): number {
  const mod = Math.max(0, 1 + buffSum(defender.buffs, 'defBonus') - buffSum(defender.buffs, 'defRed') - buffSum(defender.buffs, 'defIgnore') - extraDefIgnore)
  return rawDefMult(attackerLevel, defenderLevel, mod)
}

export function vulnMult(target: Unit, elem: Elem, type: DmgType, also?: DmgType[]): number {
  let v = buffSum(target.buffs, 'vulnAll') + buffSum(target.buffs, `vuln:${elem}`)
    + buffSum(target.buffs, `vulnType:${type}`)
  if (also) for (const t of also) v += buffSum(target.buffs, `vulnType:${t}`)
  if (type === 'dot' || also?.includes('dot')) v += buffSum(target.buffs, 'dotVuln')
  return vulnFactor(v)
}

export function mitigationMult(target: Unit): number {
  return Math.max(0, 1 - buffSum(target.buffs, 'mitigation'))
}

/** combined DEF × RES × vulnerability × mitigation multiplier (Simulator.stdMultipliers). */
export function stdMultipliers(attacker: Unit, target: Unit, elem: Elem, type: DmgType, also?: DmgType[]): number {
  return defMultiplier(attacker.base.level, target.base.level, target)
    * resFactor(target, attacker.buffs, elem)
    * vulnMult(target, elem, type, also)
    * mitigationMult(target)
}

export function isDebuff(b: Buff): boolean {
  return b.debuff === true || b.mods.some(m => m.value < 0 || m.stat === 'defRed' || m.stat === 'spdDown')
}

// kit runtime bag: stacks/counters/timers that change through battle
const RT_SKIP = new Set(['levels', 'eidolon', 'skillPriority', 'skillPattern', 'skillRotation', 'strategy', 'inExtraTurn', 'turnIndex'])
export function runtimeString(rt: Record<string, unknown>): string {
  return Object.entries(rt)
    .filter(([k, v]) => !RT_SKIP.has(k) && v !== undefined && v !== null && typeof v !== 'function')
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(' ')
}