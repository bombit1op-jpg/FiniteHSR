import type { AbilityType, DmgType, Unit } from '../entities/Unit'
import type { Mod } from '../effects/Buff'
import type { HitOpts } from '../kit'
import { dealDamage, dealElationDamage } from './DamageCalculator'
import { buffSum, eff, isDebuff, runtimeString } from './StatResolver'
import { enemyToughnessImmune, routeEnemyDamage } from '../enemy/defense'
import { fireEnemyCounter } from '../enemy/ability'
import { enemyBehavior } from '../enemy/behaviors'
import { dmgBucket, type Simulator } from '../simulator'
import { absorbWithShields } from './ShieldResolver'

/** Fallback pressed-ability for a hit with no explicit tag and no perform context: map the damage
 *  type back onto the ability that most likely produced it. `fua`/`add` hits are their own ability
 *  axis; `dot`/`break`/`elation` are not authored abilities, so they stay `other` (a Basic/Skill
 *  gate must not treat them as one). Unset type follows the pipeline's `?? 'skill'` convention. */
function deriveAbility(type: DmgType | undefined): AbilityType {
  switch (type) {
    case 'basic': return 'basic'
    case 'skill': return 'skill'
    case 'ult': return 'ult'
    case 'fua': return 'fua'
    case 'add': return 'add'
    case undefined: return 'skill'
    default: return 'other'
  }
}

/** the attack shape the hit belongs to — the Counter gate needs the *attack's* scope, not the
 *  hit's (a lone hit is single; Blast/AoE/Random wrap their hits and carry the outer shape). */
export type AttackScope = 'single' | 'blast' | 'aoe' | 'random'

/** One attack landing on one target, threaded through the digit pipeline: who attacks
 *  (attacker), how (HitOpts), and which visible digit of a possibly multi-digit attack
 *  this resolution is (frac/first/last/multi). Attack-IDENTITY state (atkKey/attackSeq/
 *  attackAct) stays on Simulator — kits read it via `sim.attackNo()`/`attackAct()`. */
interface AttackContext {
  attacker: Unit
  target: Unit
  o: HitOpts
  frac: number
  first: boolean
  last: boolean
  multi: boolean
  scope: AttackScope
  /** pressed ability this hit belongs to — captured at the attack boundary so a nested attack's
   *  context swap mid-chain cannot leak into the outer attack's `onAfterAttack` window (§13) */
  ability: AbilityType
}

/** Damage orchestration: turns one ability declaration into resolved hits.
 *
 *  The FORMULAS live in combat/DamageCalculator.ts (pure); this class owns everything impure about landing a
 *  hit — attack sequencing (attackSeq/atkAct/toughRed), gear per-hit conditionals applied as
 *  transient `_gearhm`/`_ic` buffs around the roll, crit/non-crit cone+kit hooks, damage
 *  accounting, and the toughness/break resolution order (hit and Break DMG both land while the
 *  enemy is still intact at ×0.9; `broken` is set only after). Simulator owns the state it
 *  mutates; this class drives it. */
export class DamagePipeline {
  constructor(private s: Simulator) {}

  /** gear per-hit conditionals (Fermata/Wastelander/Pioneer/Prisoner); consumed as transient buffs in hit(). defIgnore lands on the target, the rest on the attacker */
  gearHitMods(attacker: Unit, target: Unit, type: DmgType): { att: Mod[]; tgt: Mod[] } {
    const g = this.s.gearOfAttacker(attacker)
    const out = { att: [] as Mod[], tgt: [] as Mod[] }
    if (!g) return out
    const push = (m: Mod): void => { (m.stat === 'defIgnore' || m.stat.startsWith('critDmgTaken') ? out.tgt : out.att).push(m) }
    ;(g.relicSets4 ?? g.relicSets).forEach(s => s.hitMods?.(this.s, attacker, target, type)?.forEach(push))
    g.planar?.hitMods?.(this.s, attacker, target, type)?.forEach(push)
    g.cone?.hitMods?.(this.s, attacker, target, type, g.coneSi)?.forEach(push)
    return out
  }

  /** Iron Cavalry 4pc: Break DMG ignores 10% DEF at BE>=150%; Super Break adds 15% more at BE>=250% (relicsets.json) */
  ironCavPen(attacker: Unit, superBreak: boolean): number {
    const g = this.s.gearOfAttacker(attacker)
    if (!g || !(g.relicSets4 ?? []).some(s => s.id === 'iron_cavalry')) return 0
    const be = eff(attacker).be
    if (be < 1.5) return 0
    return superBreak ? (be >= 2.5 ? 0.25 : 0.10) : 0.10
  }

  hit(attacker: Unit, target: Unit, o: HitOpts, scope: AttackScope = 'single'): number {
    // attack boundary: a lone hit is the whole attack; a Blast/AoE nests its hits inside so the
    // attack window only resolves once every hit landed (§13).
    this.s.triggers.enterAttack()
    try { return this.hitInner(attacker, target, o, scope) } finally { this.s.triggers.exitAttack() }
  }

  private hitInner(attacker: Unit, target: Unit, o: HitOpts, scope: AttackScope): number {
if (!target || target.dead || (attacker.dead && !o.fromDeadAttacker)) return 0
    this.s.toughRed = 0
    const atkKey = `${attacker.id}|${o.type ?? 'skill'}|${this.s.avElapsed}`
    const actKey = `${attacker.id}|${this.s.avElapsed}`
    if (!o.noSeq && atkKey !== this.s.atkKey) { this.s.atkKey = atkKey; this.s.attackSeq++; if (this.s.logger.on) this.s.logger.beginAttack() }
    this.s.atkAct = actKey
    if (atkKey !== this.s.toughKey) { this.s.toughKey = atkKey; this.s.attackToughRed = 0 }
    this.s.lastHitTarget = target
    const ability = o.abilityType ?? this.s.pressedAbility(attacker.id) ?? deriveAbility(o.type)
    const frac = o.split
    if (frac && frac.length > 1) return this.hitSplit(attacker, target, o, frac, scope, ability)
    const ctx: AttackContext = { attacker, target, o, frac: 1, first: true, last: true, multi: false, scope, ability }
    const part = this.hitDigit(ctx)
    this.hitPost(ctx, part.dmg, part.crit)
    return part.dmg
  }

  hitSplit(attacker: Unit, target: Unit, o: HitOpts, frac: number[], scope: AttackScope, ability: AbilityType): number {
    let dmg = 0
    let crit = false
    for (let i = 0; i < frac.length; i++) {
      if (target.dead) break
      const part = this.hitDigit({ attacker, target, o, frac: frac[i], first: i === 0, last: i === frac.length - 1, multi: true, scope, ability })
      dmg += part.dmg
      crit = crit || part.crit
    }
    this.hitPost({ attacker, target, o, frac: 1, first: true, last: true, multi: true, scope, ability }, dmg, crit)
    return dmg
  }

  /** compact stack/B/D tail appended to FUA/Additional/Elation hit lines */
  private actTag(attacker: Unit, type: string | undefined): string {
    if (type !== 'fua' && type !== 'add' && type !== 'elation') return ''
    const nb = attacker.buffs.filter(b => !isDebuff(b)).length
    const nd = attacker.buffs.length - nb
    const rt = runtimeString(this.s.rt(attacker))
    return ` | ${attacker.name} B:${nb} D:${nd}${rt ? ' R:{' + rt + '}' : ''}`
  }

  /** resolve a single visible digit of an attack (base + frac, its own crit roll). */
  private hitDigit(ctx: AttackContext): { dmg: number; crit: boolean } {
    const { attacker } = ctx
    // A buff-inheriting summon uses ALL of its owner's buffs and stats while it deals damage.
    // Swap the merged array in for the duration of the computation so every read inside
    // dealDamage/dealElationDamage/eff() sees it - one concat per hit, not one per buffSum.
    // The two lists are disjoint by construction: team-wide effects only reach kind === 'char'
    // (addBuff, gearParty), so the owner's buffs live only on the owner and buffs aimed at the
    // summon (Lingsha E6, Sunday E6) live only on the summon. No double counting.
    // merge is per-hit, so eff(summon) read OUTSIDE a hit sees only the summon's own
    // buffs. No sim or game mechanic reads a summon outside its hit, so this is indistinguishable
    // from full inheritance today. Upgrade: mirror the owner's list in addBuff/removeBuff/expireBuffs
    // if a summon ever needs its stats off-turn.
    const ownBuffs = attacker.buffs
    const owner = attacker.sharesOwnerBuffs ? this.s.find(String(this.s.rt(attacker).ownerId ?? '')) : undefined
    if (owner) attacker.buffs = [...ownBuffs, ...owner.buffs]
    try { return this.hitDigitInner(ctx) }
    finally { attacker.buffs = ownBuffs }
  }

  private hitDigitInner(ctx: AttackContext): { dmg: number; crit: boolean } {
    const { attacker, target, o, frac, first, last, multi } = ctx
    const elem = o.elem ?? attacker.elem
    const scaleStat = o.scaleStat ?? 'atk'
    const statValue = o.statValue ?? (scaleStat === 'atk' ? eff(attacker).atk : scaleStat === 'hp' ? attacker.maxHp : eff(attacker).def)
    const L = this.s.logger
    if (L.on) L.beginHit()
    L.emit({ type: 'HIT_START', trace: 'HIT', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, attackType: o.type ?? 'skill', element: elem, payload: { label: o.label ?? o.type, frac, statValue, hpBefore: target.hp, maxToughness: target.maxToughness, toughDmg: o.toughDmg ?? 0 } })
    const hm = this.gearHitMods(attacker, target, o.type ?? 'skill')
    if (hm.att.length) this.s.addBuff(attacker, { id: '_gearhm', name: 'Gear hit mods', mods: hm.att, turns: Infinity })
    if (hm.tgt.length) this.s.addBuff(target, { id: '_gearhm', name: 'Gear hit mods', mods: hm.tgt, turns: Infinity })
    const dctx = {
      attacker, target, elem, type: o.type, also: o.also,
      statValue, mult: frac * (o.mult ?? 1), flat: last ? o.flat : 0, canCrit: o.canCrit, forceCrit: o.forceCrit,
      noDmgBoost: o.noDmgBoost,
      scaleStat,
      defIgnore: o.defIgnore,
    }
    const r = o.type === 'elation' ? dealElationDamage(dctx, () => this.s.rng()) : dealDamage(dctx, () => this.s.rng())
    if (hm.tgt.length) this.s.removeBuff(target, '_gearhm')
    if (hm.att.length) this.s.removeBuff(attacker, '_gearhm')
    if (r.crit) {
      o.onCrit?.(target)
      const cg = this.s.gearOfAttacker(attacker)
      cg?.cone?.onCrit?.(this.s, attacker, target, cg.coneSi)
    } else if (dctx.canCrit !== false) {
      const cg = this.s.gearOfAttacker(attacker)
      cg?.cone?.onNonCrit?.(this.s, attacker, target, cg.coneSi)
      const kt = attacker.kitId ? this.s.kits.get(attacker.kitId) : undefined
      kt?.onNonCrit?.(this.s, attacker, target, this.s.rt(attacker))
    }
    // §57/§58: enemy defensive state routes incoming damage before it lands on HP
    // (redirect/redistribute mutate recipients inside routeEnemyDamage; it returns what THIS unit
    // actually takes — invulnerable→0, shield/partial absorb the rest). Character targets instead run
    // the shared shield hull, so a data-driven enemy ability/counter hitting an ally is absorbed by
    // March 7th-style shields exactly like a basic attack (TurnManager.enemyHit).
    const applied = target.side === 'enemy' ? routeEnemyDamage(this.s, target, r.dmg) : absorbWithShields(this.s, target, r.dmg)
    target.hp -= applied
    if (L.on) {
      L.beginDamage()
      L.emit({
        type: 'DAMAGE_DEALT', trace: 'DMG', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, attackType: o.type ?? 'skill', element: elem,
        payload: {
          label: o.label, amount: applied, crit: r.crit, mult: frac * (o.mult ?? 1),
          statValue, scaleStat, hpAfter: target.hp, maxHp: target.maxHp, first, last,
          ...(o.also ? { tags: [o.type ?? 'skill', ...o.also] } : {}),
          breakdown: L.lastDamage,
        },
      })
    }
    this.s.account(attacker, o.label ?? o.type, r.dmg, dmgBucket(attacker, o.type), elem)
    if (multi) {
      const critTag = r.crit ? ' (CRIT)' : ''
      this.s.log(`${attacker.name} → ${target.name}: ${applied}${critTag} [${o.label ?? o.type}]${this.actTag(attacker, o.type)}`)
    }
    const toughImmune = target.side === 'enemy' && enemyToughnessImmune(target)
    if (first && target.maxToughness > 0 && o.toughDmg && !toughImmune) {
      const wbe = buffSum(attacker.buffs, 'wbe')
      // buff-driven weakless-ignore toughness (Fugue Foxian Prayer 122502 #6) adds to a kit's own
      // pierceRatio; pass undefined when the sum is zero so non-weak hits keep dealing 0 toughness
      const pierce = (o.pierceRatio ?? 0) + buffSum(attacker.buffs, 'toughPierce') || undefined
      this.s.breaks.applyToughness(attacker, target, elem, o.toughDmg, (o.wbeBonus ?? 0) + wbe, pierce)
    }
    L.emit({ type: 'HIT_END', source: attacker.name, target: target.name, sourceId: attacker.id, targetId: target.id, attackType: o.type ?? 'skill', element: elem, payload: { amount: r.dmg, hpAfter: target.hp, dead: target.hp <= 0 } })
    return { dmg: r.dmg, crit: r.crit }
  }

  /** once-per-attack effects run once after the (possibly multi-digit) hit resolves. */
  private hitPost(ctx: AttackContext, dmg: number, crit: boolean): void {
    const { attacker, target, o, multi } = ctx
    const ent = target.dots.find(d => d.kind === 'Entanglement')
    if (ent && !target.dead) ent.stacks = Math.min(5, (ent.stacks ?? 1) + 1)

    // Gallagher Besotted: attacking ally heals for the stored flat amount
    const besot = target.buffs.find(b => b.id === 'besotted')
    if (besot?.payload && attacker.side === 'ally' && attacker.kind === 'char') {
      const src = this.s.find(besot.sourceId ?? '')
      if (src) this.s.heal(attacker, besot.payload)
    }

    if (!multi) {
      const critTag = crit ? ' (CRIT)' : ''
      this.s.log(`${attacker.name} → ${target.name}: ${dmg}${critTag} [${o.label ?? o.type}]${this.actTag(attacker, o.type)}`)
    }

if (target.side === 'ally' && target.kind === 'char') this.s.gainEnergy(target, 10)
    if (target.hp <= 0) this.s.kill(attacker, target, o.type)
    if (attacker.side === 'ally' && (attacker.kind === 'char' || attacker.kind === 'summon' || attacker.kind === 'transformed')) this.s.fireAfterAttack(attacker, target, o.type, dmg, this.s.attackToughRed, ctx.ability, o.memoSkill)
    // §61 — enemy Counter state: a SINGLE-target ally-character attack on a countering enemy
    // makes it act immediately on the attacker (canon: Silvermane Lieutenant "Shield Reflect").
    // Blast/AoE/Random shapes are excluded (they are not "an attack by a single character").
    if (ctx.scope === 'single' && target.side === 'enemy' && attacker.side === 'ally' && attacker.kind === 'char' && !target.dead)
      fireEnemyCounter(this.s, target, attacker)
    // §57 enemy passive: a "reacts when attacked" status (War Armor). Once per attack-target, in the
    // same window as the Counter. Skipped when the attack is a unit hitting itself (no self-reaction).
    if (target.side === 'enemy' && !target.dead && attacker !== target)
      enemyBehavior(target.name)?.passive?.onHitTaken?.(this.s, target, attacker)
  }

  hitAoe(attacker: Unit, o: HitOpts): void {
    this.s.triggers.enterAttack()
    try { for (const e of [...this.s.livingEnemiesOf(attacker)]) this.hit(attacker, e, { ...o }, 'aoe') }
    finally { this.s.triggers.exitAttack() }
  }

  hitBlast(attacker: Unit, primary: Unit, main: HitOpts, adj: HitOpts): void {
    this.s.triggers.enterAttack()
    try {
      for (const e of [...this.s.livingEnemiesOf(attacker)]) {
        if (e === primary) this.hit(attacker, e, { ...main }, 'blast')
        else this.hit(attacker, e, { ...adj }, 'blast')
      }
    } finally { this.s.triggers.exitAttack() }
  }

  hitRandom(attacker: Unit, n: number, o: HitOpts, adjacentRatio?: number): void {
    this.s.triggers.enterAttack()
    try { this.hitRandomInner(attacker, n, o, adjacentRatio) } finally { this.s.triggers.exitAttack() }
  }

  private hitRandomInner(attacker: Unit, n: number, o: HitOpts, adjacentRatio?: number): void {
    for (let i = 0; i < n; i++) {
      const pool = [...this.s.livingEnemiesOf(attacker)]
      if (!pool.length) return
      const primary = this.s.rngPick(pool)
      const dmg = this.hit(attacker, primary, { ...o }, 'random')
      if (!adjacentRatio || dmg <= 0) continue
      const after = this.s.livingEnemiesOf(attacker)
      const idx = after.indexOf(primary)
      if (idx < 0) continue // primary died; skip adjacent splash
      for (const [j, e] of after.entries()) {
        if (Math.abs(j - idx) !== 1) continue
        const subRaw = Math.floor(dmg * adjacentRatio)
        const sub = e.side === 'enemy' ? routeEnemyDamage(this.s, e, subRaw) : subRaw
        e.hp -= sub
        this.s.account(attacker, (o.label ?? o.type) + ' (adj)', sub, dmgBucket(attacker, o.type), o.elem ?? attacker.elem)
        this.s.log(`${attacker.name} → ${e.name}: ${sub} [adjacent]`)
        this.s.logger.emit({ type: 'DAMAGE_DEALT', source: attacker.name, target: e.name, sourceId: attacker.id, targetId: e.id, attackType: o.type ?? 'skill', element: o.elem ?? attacker.elem, payload: { label: o.label, amount: sub, adjacent: true, adjacentRatio, mainTarget: primary.name, mainTargetId: primary.id, hpAfter: e.hp } })
        if (e.hp <= 0) this.s.kill(attacker, e, o.type)
      }
    }
  }
}