import type { DmgType, DoT, Elem, Unit } from '../entities/Unit'
import { BREAK_ELEM_MULT, levelMultiplier } from './LevelMultiplier'
import { buffSum, defMultiplier, dmgBoostMult, eff, mitigationMult, resFactor, vulnFactor, vulnMult } from './StatResolver'

export interface DmgContext {
  attacker: Unit
  target: Unit
  elem: Elem
  type: DmgType
  /** extra damage tags on a dual-typed hit (a Skill that also counts as a Follow-Up ATK, an
   *  Ultimate whose DMG counts as FUA). Type-keyed boosts/vuln/critDMG of every tag apply;
   *  `type` stays the primary tag for gates and event identity. */
  also?: DmgType[]
  statValue: number
  mult: number
  flat?: number
  canCrit?: boolean
  forceCrit?: boolean
  /** pure-damage-formula: skip the DMG Boost multiplier (Time Waits for No One) */
  noDmgBoost?: boolean
  /** which stat the hit scales off; only ATK-scaled hits take atkPctVsBroken (Ruan Mei E2) */
  scaleStat?: string
  /** extra DEF-ignore (DoT detonations pass their dot's defIgnore, e.g. Arcana 0.2) */
  defIgnore?: number
}

export interface DmgResult { dmg: number; crit: boolean }

/**
 * Per-hit multiplier chain, recorded only while a sink is installed
 * (`probe-damage-chain.ts`). Raw aggregated inputs, not resolved multipliers, so the probe can
 * re-derive every factor with the reference expressions
 * (reference/hsr-optimizer-main/.../damage/damageCalculator.ts:1004-1063) and catch drift.
 * `null` in every normal run — one branch per hit.
 */
export interface DmgTrace {
  who: string; foe: string; kind: 'dmg' | 'elation'; elem: Elem; type: DmgType
  /** stable unit ids of `who`/`foe` (§43: name is display only, never identity) */
  whoId: string; foeId: string
  atkLvl: number; foeLvl: number; stat: number; mult: number; flat: number
  vsBroken: number; noBoost: boolean
  critRate: number; critDmg: number; critBonus: number; crit: boolean
  boost: number; weaken: number; defPen: number; res: number; resPen: number
  vuln: number; mit: number; broken: boolean; final: number; dmg: number
}
/** Fans a trace out to every registered consumer. Was a single module-global sink, which meant the
 *  FIRST logger/probe kept the trace and every later battle went blind to `DAMAGE_CALCULATED` — the
 *  §12 "one owner" rule cost more than the list it saved. Consumers now register and drop out. */
const traceConsumers: { sink: DmgTrace[]; emit: ((t: DmgTrace) => void) | null }[] = []
/** register a trace consumer; returns a detach fn. `emit` fires per trace next to the push. */
export function traceDamage(sink: DmgTrace[], emit?: ((t: DmgTrace) => void) | null): () => void {
  const c = { sink, emit: emit ?? null }
  traceConsumers.push(c)
  return () => { const i = traceConsumers.indexOf(c); if (i >= 0) traceConsumers.splice(i, 1) }
}
function fanTrace(t: DmgTrace): void { for (const c of traceConsumers) { c.sink.push(t); c.emit?.(t) } }

function sumMods(buffs: Unit['buffs'], key: string): number {
  let v = 0
  for (const b of buffs) {
    const st = b.stacks ?? 1
    for (const m of b.mods) if (m.stat === key) v += m.value * st
  }
  return v
}

/** sumMods for every tag on a hit (primary `type` + optional `also`) */
function sumModsTypes(buffs: Unit['buffs'], base: string, type: DmgType, also?: DmgType[]): number {
  let v = sumMods(buffs, `${base}:${type}`)
  if (also) for (const t of also) v += sumMods(buffs, `${base}:${t}`)
  return v
}

/** sum of several mod keys in one pass (trace recording only) */
function buffSum3(buffs: Unit['buffs'], ...keys: string[]): number {
  let v = 0
  for (const b of buffs) {
    const st = b.stacks ?? 1
    for (const m of b.mods) if (keys.includes(m.stat)) v += m.value * st
  }
  return v
}

/**
 * Final multiplicative DMG bonus. Applied LAST — outside the additive DMG Boost pool and
 * after DEF/RES/vulnerability/mitigation — so it composes multiplicatively with the boost
 * pool instead of folding into it: 30% boost + 20% final = 1.56, not 1.50.
 * Canon counterpart: `StatKey.FINAL_DMG_BOOST` in hsr-optimizer. Only Anaxa E6 writes it
 * here; the other reference writers are ordinary boosts in our kits or already folded into
 * their own multiplier (Himeko Nova E2 → `ctx.mult`).
 */
function finalMult(buffs: Unit['buffs']): number {
  return 1 + sumMods(buffs, 'finalDmgBoost')
}

/**
 * General damage formula (fandom /wiki/Damage):
 * Base × Crit × DMGBoost × Weaken × DEF × RES × Vulnerability × Mitigation × Broken.
 * rng injected for determinism; final value floored like the game.
 */
export function dealDamage(ctx: DmgContext, rng: () => number): DmgResult {
  const { attacker, target } = ctx

  const vsBrokenM = ctx.scaleStat === 'atk' && target.broken ? 1 + sumMods(attacker.buffs, 'atkPctVsBroken') : 1
  const baseDmg = ctx.statValue * ctx.mult * vsBrokenM + (ctx.flat ?? 0)

  let critMult = 1
  let isCrit = false
  if (ctx.canCrit !== false) {
    if (ctx.forceCrit || (() => { const cr = eff(attacker).critRate; return rng() < Math.min(1, Math.max(0, cr)) })()) {
      isCrit = true
      critMult = 1 + eff(attacker).critDmg // critDmg stored as 1.0 = +100%
        + sumModsTypes(attacker.buffs, 'critDmg', ctx.type, ctx.also)
        + sumModsTypes(target.buffs, 'critDmgTaken', ctx.type, ctx.also)
    }
  }

  const boostM = ctx.noDmgBoost ? 1 : dmgBoostMult(attacker.buffs, ctx.elem, ctx.type, ctx.also)
  const weakenM = Math.max(0, 1 - sumMods(attacker.buffs, 'weaken'))
  const defM = defMultiplier(attacker.base.level, target.base.level, target, ctx.defIgnore ?? 0)
  const resM = resFactor(target, attacker.buffs, ctx.elem)
  const vulnM = vulnMult(target, ctx.elem, ctx.type, ctx.also)
  const mitM = mitigationMult(target)
  const brokenM = target.maxToughness > 0 ? (target.broken ? 1.0 : 0.9) : 1.0
  const finalM = finalMult(attacker.buffs)

  const dmg = Math.floor(baseDmg * critMult * boostM * weakenM * defM * resM * vulnM * mitM * brokenM * finalM)
  if (traceConsumers.length) {
    const a = attacker
    fanTrace({
      who: a.name, foe: target.name, kind: 'dmg', elem: ctx.elem, type: ctx.type,
      whoId: a.id, foeId: target.id, atkLvl: a.base.level, foeLvl: target.base.level, stat: ctx.statValue, mult: ctx.mult, flat: ctx.flat ?? 0,
      vsBroken: vsBrokenM, noBoost: !!ctx.noDmgBoost,
      critRate: eff(a).critRate, critDmg: eff(a).critDmg,
      critBonus: sumModsTypes(a.buffs, 'critDmg', ctx.type, ctx.also) + sumModsTypes(target.buffs, 'critDmgTaken', ctx.type, ctx.also),
      crit: isCrit,
      boost: buffSum3(a.buffs, `boost:${ctx.type}`, `dmg:${ctx.elem}`, 'dmgAll') + (ctx.also ? ctx.also.reduce((s, t) => s + sumMods(a.buffs, `boost:${t}`), 0) : 0),
      weaken: sumMods(a.buffs, 'weaken'),
      defPen: 1 - Math.max(0, 1 + sumMods(target.buffs, 'defBonus') - sumMods(target.buffs, 'defRed') - sumMods(target.buffs, 'defIgnore')),
      res: target.res[ctx.elem] ?? 0, resPen: buffSum3(a.buffs, 'resPenAll', `resPen:${ctx.elem}`),
      vuln: buffSum3(target.buffs, 'vulnAll', `vuln:${ctx.elem}`, `vulnType:${ctx.type}`) + (ctx.also ? ctx.also.reduce((s, t) => s + sumMods(target.buffs, `vulnType:${t}`), 0) : 0) + (ctx.type === 'dot' || ctx.also?.includes('dot') ? sumMods(target.buffs, 'dotVuln') : 0),
      mit: sumMods(target.buffs, 'mitigation'), broken: target.maxToughness <= 0 || target.broken,
      final: sumMods(a.buffs, 'finalDmgBoost'), dmg,
    })
  }
  return { dmg: Math.max(0, dmg), crit: isCrit }
}

/** Break DMG and Weakness-Break debuff damage (Toughness#Break_DMG). No crit, no DMG boost. */
export function computeBreakDamage(opts: {
  attacker: Unit
  target: Unit
  elem: Elem
  kind: 'break' | 'debuff'
  baseDmgOverride?: number
  stacks?: number
}): number {
  const { attacker, target, elem } = opts
  const be = eff(attacker).be
  const lvlM = levelMultiplier(attacker.base.level)

  let baseDmg: number
  if (opts.kind === 'break') {
    const maxToughM = 0.5 + target.maxToughness / 40
    baseDmg = BREAK_ELEM_MULT[elem] * lvlM * maxToughM
  } else {
    baseDmg = opts.baseDmgOverride! * (opts.stacks ?? 1)
  }

  const breakInc = sumMods(attacker.buffs, 'boost:break')
  const defM = defMultiplier(attacker.base.level, target.base.level, target)
  const resM = resFactor(target, attacker.buffs, elem)
  const vulnM = vulnMult(target, elem, opts.kind === 'break' ? 'break' : 'dot')
  const mitM = mitigationMult(target)
  const brokenM = opts.kind === 'break' && !target.broken && target.maxToughness > 0 ? 0.9 : 1.0
  const finalM = finalMult(attacker.buffs)

  return Math.floor(baseDmg * (1 + be) * (1 + breakInc) * defM * resM * vulnM * mitM * brokenM * finalM)
}

/** Elation DMG (Path of Elation). No DMG Boost; Elation×Punchline×Merrymake
 *  multipliers are pre-folded into `ctx.mult` by the caller (elation.ts).
 *  Vuln = 1 + All-Type + Elation-specific only. Standard DEF/RES/mitigation/broken. */
export function dealElationDamage(ctx: DmgContext, rng: () => number): DmgResult {
  const { attacker, target } = ctx

  const baseDmg = ctx.statValue * ctx.mult + (ctx.flat ?? 0)

  let critMult = 1
  let isCrit = false
  if (ctx.canCrit !== false) {
    if (ctx.forceCrit || (() => { const cr = eff(attacker).critRate; return rng() < Math.min(1, Math.max(0, cr)) })()) {
      isCrit = true
      critMult = 1 + eff(attacker).critDmg
        + sumMods(attacker.buffs, `critDmg:elation`)
        + sumMods(target.buffs, `critDmgTaken:elation`)
    }
  }

  const defM = defMultiplier(attacker.base.level, target.base.level, target)
  const resM = resFactor(target, attacker.buffs, ctx.elem)
  const vulnM = vulnFactor(sumMods(target.buffs, 'vulnAll') + sumMods(target.buffs, 'vulnElation'))
  const mitM = mitigationMult(target)
  const brokenM = target.maxToughness > 0 ? (target.broken ? 1.0 : 0.9) : 1.0
  const finalM = finalMult(attacker.buffs)

  const dmg = Math.floor(baseDmg * critMult * defM * resM * vulnM * mitM * brokenM * finalM)
  if (traceConsumers.length) {
    const a = attacker
    fanTrace({
      who: a.name, foe: target.name, kind: 'elation', elem: ctx.elem, type: ctx.type,
      whoId: a.id, foeId: target.id,
      atkLvl: a.base.level, foeLvl: target.base.level, stat: ctx.statValue, mult: ctx.mult, flat: ctx.flat ?? 0,
      vsBroken: 1, noBoost: true,
      critRate: eff(a).critRate, critDmg: eff(a).critDmg,
      critBonus: sumMods(a.buffs, 'critDmg:elation') + sumMods(target.buffs, 'critDmgTaken:elation'),
      crit: isCrit, boost: 0, weaken: sumMods(a.buffs, 'weaken'),
      defPen: 1 - Math.max(0, 1 + sumMods(target.buffs, 'defBonus') - sumMods(target.buffs, 'defRed') - sumMods(target.buffs, 'defIgnore')),
      res: target.res[ctx.elem] ?? 0, resPen: buffSum3(a.buffs, 'resPenAll', `resPen:${ctx.elem}`),
      vuln: buffSum3(target.buffs, 'vulnAll', 'vulnElation'),
      mit: sumMods(target.buffs, 'mitigation'), broken: target.maxToughness <= 0 || target.broken,
      final: sumMods(a.buffs, 'finalDmgBoost'), dmg,
    })
  }
  return { dmg: Math.max(0, dmg), crit: isCrit }
}

/** DoT tick on afflicted unit's turn start. Cannot crit. */
export function computeDotDamage(attacker: Unit, target: Unit, dot: DoT): number {
  const baseDmg = dot.baseDmg * (dot.stacks ?? 1)
  const boostM = dmgBoostMult(attacker.buffs, dot.elem, 'dot')
  const defM = defMultiplier(attacker.base.level, target.base.level, target, dot.defIgnore ?? 0)
  const resM = resFactor(target, attacker.buffs, dot.elem)
  const vulnM = vulnMult(target, dot.elem, 'dot')
  const mitM = mitigationMult(target)
  const dotResM = Math.max(0, 1 - buffSum(target.buffs, 'dotRes'))
  const brokenM = target.maxToughness > 0 ? (target.broken ? 1.0 : 0.9) : 1.0
  const finalM = finalMult(attacker.buffs)
  return Math.floor(baseDmg * boostM * defM * resM * vulnM * mitM * dotResM * brokenM * finalM)
}

/** Deterministic LCG rng. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}