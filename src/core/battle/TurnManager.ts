import type { Unit } from '../entities/Unit'
import type { Mod } from '../effects/Buff'
import { computeDotDamage } from '../combat/DamageCalculator'
import { defMultiplier, dmgBoostMult, eff, isDebuff, mitigationMult, resFactor, runtimeString, vulnMult } from '../combat/StatResolver'
import { levelMultiplier } from '../combat/LevelMultiplier'
import { elationHit, type CBStack } from '../../core/elation'
import { autoDecide } from '../../core/autoai'
import type { Action, KitDef, KitRuntime } from '../../core/kit'
import { buffVal, type DoTWithSource, type EnemyExt, type Simulator } from '../../core/simulator'
import { tickOverride } from '../combat/TargetOverride'
import { resolveTargets, type TargetSelection } from '../combat/TargetResolver'
import { absorbWithShields } from '../combat/ShieldResolver'
import { chooseEnemyAction, type EnemyBehavior } from '../enemy/ai'
import { executeEnemyAbility, type EnemyTargetRule } from '../enemy/ability'
import { evaluateEnemyPhase, filterPhaseAbilities } from '../enemy/phase'
import { enemyBehavior } from '../enemy/behaviors'

/** Turn execution: who acts, what they do, and how the turn unwinds. Owns every method that
 *  consumes or mutates the action order (takeTurn/takeTurnI, ult resolution, DoT ticks, end-of-turn
 *  bookkeeping, enemy AI). Simulator keeps the state and the event bus; this class drives them. */
export class TurnManager {
  constructor(private s: Simulator) {}

  async outOfTurnUlts(alive: Unit[], next: Unit): Promise<void> {
    const ready = alive.filter(u => u.kind === 'char' && !u.dead && u.kitId && this.canUltimate(this.s.kits.get(u.kitId)!, u))
    if (!ready.length) return
    const picked = await this.s.io!.pickUlts(ready, this.s.view(next.id))
    for (const p of picked) {
      if (p.dead || !this.canUltimate(this.s.kits.get(p.kitId!)!, p)) { this.s.logger.emit({ type: 'ACTION_CANCELLED', source: p.name, sourceId: p.id, payload: { reason: p.dead ? 'died' : 'not_ready', action: 'ult_out_of_turn' } }); continue }
      this.castUlt(this.s.kits.get(p.kitId!)!, p, this.s.rt(p), true)
    }
  }

  /** Single Ultimate readiness gate — every activation path (auto-ult, out-of-turnUlts,
   *  departedUlt, activateAllyUlt) routes through it. Default = energy >= maxEnergy; kits with
   *  half-thresholds (Argenti/Yunli/Evanescia), partial gauges (Feixiao) or non-Energy
   *  resources (Castorice Newbud, Phainon Coreflame, Cyrene Recollection, SW LV.999, Acheron
   *  Slashed Dream) declare `KitDef.ultActivation`. */
  canUltimate(kit: KitDef, u: Unit): boolean {
    const act = kit.ultActivation
    if (!act) return u.maxEnergy > 0 && u.energy >= u.maxEnergy
    if (act.kind === 'energy') {
      const at = act.at === 'half' ? u.maxEnergy / 2 : act.at ?? u.maxEnergy
      return u.maxEnergy > 0 && u.energy >= at
    }
    return act.check(this.s, u, this.s.rt(u))
  }

/** A char is off the action order while either (a) an ally 'transformed' unit (Phainon's Khaslana)
 *  is on the field (Ruinous Irontomb) or (b) its own kit parks it there (Moze: "Prey" on the field).
 *  Departed chars stay rooted (no turns, no buff/DoT ticks), are not valid enemy targets, and
 *  re-enter at their SPD position once the state ends. */
  departed(u: Unit): boolean {
    if (u.side !== 'ally' || u.kind !== 'char') return false
    if (u.departedFlag) return true
    return this.s.roster.some(v => v !== u && !v.dead && v.side === 'ally' && v.kind === 'transformed')
  }

  /** Departed char whose kit opts into off-order Ult (Moze). Resolves the Ult without a turn:
   *  no turnPrologue (DoT ticks stay frozen), no endTick (buffs/CB keep their counters). */
  departedUlt(u: Unit): boolean {
    if (u.dead || !this.departed(u)) return false
    const kit = u.kitId ? this.s.kits.get(u.kitId) : undefined
    return kit?.ultWhileDeparted === true && this.canUltimate(kit, u)
  }

  takeTurn(u: Unit): void {
    if (u.dead) return
    if (this.departed(u)) {
      if (this.departedUlt(u)) { this.castUlt(this.s.kits.get(u.kitId!)!, u, this.s.rt(u), true); return }
      this.s.log(`.. ${u.name} departs — cannot act`)
      this.s.logger.emit({ type: 'ACTION_SKIPPED', target: u.name, targetId: u.id, payload: { reason: 'departed', action: 'turn' } })
      if (u.av <= 0) u.av = this.s.baseAv(u)
      return
    }
const p = this.turnPrologue(u)
    // DPAV metric: divisor = AV at the unit's last actual action (auto-ult counts as the
    // turn's action). Unset for units that never acted (departed/frozen skips).
    u.lastActAv = this.s.avElapsed
    if (p === 'done') { this.s.logger.emit({ type: 'ACTION_CANCELLED', target: u.name, targetId: u.id, payload: { reason: 'died_in_prologue', action: 'turn' } }); this.endTick(u); return }
    if (p === 'frozen') return
    this.dispatchTurn(u)
    this.endTick(u)
  }

  /** shared pre-turn resolution: DoTs, Freeze skip, enemy break recovery */
  turnPrologue(u: Unit): 'go' | 'done' | 'frozen' {
    this.s.currentActor = u
    this.s.battleTurn++
    this.s.turnCount.set(u.id, (this.s.turnCount.get(u.id) ?? 0) + 1)
    // per-turn SP spend counter (Tengoku planar gate)
    if (u.side === 'ally' && u.kind === 'char') this.s.res.spThisTurn = 0
    if (u.side === 'ally' && u.kind === 'char') this.s.res.spHigh = false
    // action-target signal resets each turn (ally-target gear gates)
    this.s.lastAbilityTarget = undefined

    // fire kit onTurnStart hook
    const kit = u.kitId ? this.s.kits.get(u.kitId) : undefined
    kit?.onTurnStart?.(this.s, u, this.s.rt(u))
// fire gear onTurnStart hooks (Guard etc.)
    this.s.gearMap.get(u.id)?.relicSets?.forEach(s => s.onTurnStart?.(this.s, u))
    this.s.gearMap.get(u.id)?.cone?.onTurnStart?.(this.s, u, this.s.gearMap.get(u.id)!.coneSi)

    // fire onAllyTurnStart for other kits when an ally's turn begins
    if (u.side === 'ally' && u.kind === 'char') this.s.fireAllyTurnStart(u)

    if (u.dots.length) this.tickDots(u)
    this.tickEntanglement(u)
    if (u.dead) return 'done'

    const frozenAll = u.dots.filter(d => d.kind === 'Freeze')
    if (frozenAll.length) {
      // Freeze is one status: a break debuff (applyBreakDebuff) and a kit freeze can land on the
      // same target in one action, so collapse duplicates into the dot that carries frozen
      // damage (latest applier) — one status = one skipped turn = one frozen-damage tick
      const frozen = frozenAll.filter(d => d.baseDmg > 0).pop() ?? frozenAll[frozenAll.length - 1]
      const dropped = frozenAll.length - 1
      u.dots = u.dots.filter(d => d.kind !== 'Freeze' || d === frozen)
      if (dropped > 0) this.s.logger.emit({ type: 'DOT_EXPIRED', target: u.name, targetId: u.id, payload: { kind: 'Freeze', reason: 'merged_duplicate' } })
      this.s.log(`.. ${u.name} is Frozen — turn skipped`)
      this.s.fireFrozenTurn(u)
      this.s.logger.emit({ type: 'ACTION_SKIPPED', target: u.name, targetId: u.id, payload: { reason: 'frozen', action: 'turn', turns: frozen.turns } })
      if (--frozen.turns <= 0) {
        u.dots = u.dots.filter(d => d.kind !== 'Freeze')
        this.s.logger.emit({ type: 'DOT_EXPIRED', target: u.name, targetId: u.id, payload: { kind: 'Freeze', turns: frozen.turns, reason: 'turns_elapsed' } })
        this.s.logger.emit({ type: 'CONTROL_EXPIRED', target: u.name, targetId: u.id, payload: { kind: 'Freeze', reason: 'turns_elapsed' } })
      }
      u.av = this.s.baseAv(u) * 0.5
      return 'frozen'
    }

    if (u.side === 'enemy' && u.broken) {
      u.broken = false
      this.s.refillToughness(u)
      this.s.log(`.. ${u.name} recovered from Weakness Break`)
    }
    return 'go'
  }

  private dispatchTurn(u: Unit): void {
    if (u.kind === 'char') this.charTurn(u)
    else if (u.kind === 'enemy') this.enemyTurn(u, this.s.turnCount.get(u.id)!)
    else if (u.kind === 'summon' || u.kind === 'transformed') this.summonTurn(u)
    else if (u.kind === 'timer') this.timerTurn(u)
    else if (u.kind === 'aha') this.ahaTurn()
  }

  async takeTurnI(u: Unit): Promise<void> {
    if (u.dead) return
    if (this.departed(u)) {
      if (this.departedUlt(u)) { this.castUlt(this.s.kits.get(u.kitId!)!, u, this.s.rt(u), true); return }
      this.s.log(`.. ${u.name} departs — cannot act in Khaslana's territory`)
      this.s.logger.emit({ type: 'ACTION_SKIPPED', target: u.name, targetId: u.id, payload: { reason: 'departed', action: 'turn' } })
      if (u.av <= 0) u.av = this.s.baseAv(u)
      return
    }
const p = this.turnPrologue(u)
    // DPAV metric: divisor = AV at the unit's last actual action (auto-ult counts as the
    // turn's action). Unset for units that never acted (departed/frozen skips).
    u.lastActAv = this.s.avElapsed
    if (p === 'done') { this.s.logger.emit({ type: 'ACTION_CANCELLED', target: u.name, targetId: u.id, payload: { reason: 'died_in_prologue', action: 'turn' } }); this.endTick(u); return }
    if (p === 'frozen') return
    // nested immediateTurn (Bronya skill) resolves via auto AI — sync kits can't await prompts
    if (u.kind === 'char') await this.charTurnI(u)
    else this.dispatchTurn(u)
    this.endTick(u)
  }

  private async charTurnI(u: Unit): Promise<void> {
    const kit = this.s.kits.get(u.kitId!)!
    const ctx = this.s.rt(u)
    const seq = await this.s.io!.planTurn(u, this.s.view(u.id))
    for (const c of seq) {
      if (u.dead) break
      if (c.kind === 'ult') { this.castUlt(kit, u, ctx, false); continue }
      this.s.lastAbilityTarget = undefined
      this.s.performAbility(kit, u, c, ctx)
      if (c.kind === 'skill') this.s.fireGear('onAfterSkill', u, this.skillGearTarget())
    }
    ctx.inExtraTurn = false
  }

  endTick(u: Unit): void {
    // tickOnSource buffs: duration counts down on the SOURCE's turn end, not the holder's
    // (Robin Pinion's Aria "decreases by 1 at the start of Robin's every turn")
    if (!u.dead) {
      for (const v of this.s.roster) {
        if (v.dead || v === u) continue
        const expiring = v.buffs.filter(b => b.tickOnSource && b.sourceId === u.id && b.turns !== undefined && b.turns !== Infinity)
        for (const b of expiring) {
          b.turns!--
          if (b.turns! <= 0) {
            v.buffs = v.buffs.filter(x => x !== b)
            this.s.fireBuffExpire(v, b)
          }
        }
      }
    }
    // end-of-turn hooks: the unit's own kit + gear (Venture Forth Luminflux removal, DH Permanent, Hyacine After Rain)
    if (!u.dead) {
      this.s.kits.get(u.kitId ?? '')?.onTurnEnd?.(this.s, u, this.s.rt(u))
      const eg = this.s.gearMap.get(u.id)
      eg?.cone?.onTurnEnd?.(this.s, u, eg.coneSi)
    }
    this.s.fireAllyActionEnd(u)
    this.s.expireBuffs(u)
    // Certified Banger stacks tick at the end of the HOLDER's own turn (independent durations)
    const cbArr = this.s.rt(u).cbStacks as CBStack[] | undefined
    if (cbArr?.length) {
      const keep: CBStack[] = []
      const spent: number[] = []
      for (const s of cbArr) {
        if (s.turns - 1 > 0) keep.push({ pts: s.pts, turns: s.turns - 1 })
        else spent.push(s.pts)
      }
      this.s.rt(u).cbStacks = keep
      // hooks after the swap, so a listener's own addCb on another unit can't be overwritten
      for (const pts of spent) {
        this.s.log(`${u.name}'s Certified Banger state expires (${pts} pts)`)
        if (u.side !== 'ally' || u.kind !== 'char') continue
        for (const [kid, kit] of this.s.kits) {
          kit.onCbEnd?.(this.s, u, pts, this.s.runtimes.get(kid) ?? {})
        }
      }
    }
    if (u.dead) return
    if (u.av <= 0) u.av = this.s.baseAv(u)
  }

  private tickDots(u: Unit): void {
    const all = [...u.dots]
    const ticks = [
      ...all.filter(d => d.kind !== 'Arcana' && d.kind !== 'Freeze' && d.kind !== 'Imprisonment' && d.kind !== 'Entanglement'),
      ...all.filter(d => d.kind === 'Arcana'), // Arcana last (canon)
    ]
    for (const d of ticks) {
      const attacker = (d as DoTWithSource).sourceUnit ?? u
      const lvlM = levelMultiplier(attacker.base.level)
      const maxToughM = 0.5 + u.maxToughness / 40
      let base: number
      if (d.baseDmg) base = d.baseDmg
      else switch (d.kind) {
        case 'Bleed': base = Math.min((u.rank === 'elite' || u.rank === 'boss' ? 0.07 : 0.16) * u.maxHp, 2 * lvlM * maxToughM); break

        case 'Burn': base = lvlM; break
        case 'Shock': base = 2 * lvlM; break
        case 'WindShear': base = lvlM; break
        default: base = d.baseDmg || lvlM
      }
	const dmg = computeDotDamage(attacker, u, { ...d, baseDmg: base })
      let real = dmg
	if (u.side === 'ally') {
        real = absorbWithShields(this.s, u, dmg)
        real = Math.max(0, real - this.s.interceptLoss(u, real, 'add'))
      }
      u.hp -= real
      this.s.account(attacker, `DoT ${d.kind}`, real, 'dot', d.elem)
      this.s.log(`${u.name} takes ${real} [DoT ${d.kind}]`)
      this.s.logger.emit({ type: 'DOT_TICK', source: attacker.name, target: u.name, sourceId: attacker.id, targetId: u.id, element: d.elem, payload: { kind: d.kind, amount: real, computed: dmg, stacks: d.stacks ?? 1, hpAfter: u.hp, intercepted: dmg - real } })
      this.s.fireAllyHpLoss(u, real)
      if (u.side === 'enemy')
        for (const a of this.s.roster) {
          if (a.dead || a.side !== 'ally' || a.kind !== 'char' || !a.kitId) continue
          this.s.kits.get(a.kitId)?.onDoTTick?.(this.s, attacker, u, d, this.s.rt(a), a, real)
        }
      const cg = this.s.gearMap.get(attacker.id)
      cg?.cone?.onDoTTick?.(this.s, attacker, u, d, cg.coneSi)
      if (u.hp <= 0) { this.s.kill(attacker, u, 'dot'); break }
    }
    u.dots = u.dots.filter(d => {
      if (d.kind === 'Entanglement' || d.kind === 'Freeze') return true
      if (--d.turns > 0) return true
      this.s.logger.emit({ type: 'DOT_EXPIRED', target: u.name, targetId: u.id, payload: { kind: d.kind, stacks: d.stacks ?? 1, reason: 'turns_elapsed' } })
      return false
    })
    if (!u.dots.some(d => d.kind === 'Imprisonment')) this.s.removeBuff(u, 'imprisonSpd')
  }

  private tickEntanglement(u: Unit): void {
    const ent = u.dots.find(d => d.kind === 'Entanglement')
    if (!ent) return
    const attacker = (ent as DoTWithSource).sourceUnit ?? u
    const stacks = ent.stacks ?? 1
    const lvlM = levelMultiplier(attacker.base.level)
    const maxToughM = 0.5 + u.maxToughness / 40
    const baseDmg = 0.6 * stacks * lvlM * maxToughM
    const be = eff(attacker).be
    // Entanglement is NOT Break DMG and NOT a DoT (docs/combat_mechanics/Toughness.md:84, "Is DoT: No";
    // it is a Quantum Additional DMG instance at the target's turn start). So it must NOT pick up
    // Break-DMG boosts (boost:break — NFF cone, Firefly) or Break-taken debuffs (vulnType:break —
    // Gallagher, Lingsha, Rappa A6) and must NOT be mitigated by DoT-taken debuffs (dotVuln):
    // Additional DMG uses only Elem/All boost => dmgBoostMult(..., 'add') keeps dmg:<elem> + dmgAll
    // and drops boost:<type>. Break Effect itself IS part of the 20% delay, not the damage.
    const boostM = dmgBoostMult(attacker.buffs, ent.elem, 'add')
    const defM = defMultiplier(attacker.base.level, u.base.level, u)
    const resM = resFactor(u, attacker.buffs, ent.elem)
    const vulnM = vulnMult(u, ent.elem, 'add')
    const mitM = mitigationMult(u)
    const brokenM = u.maxToughness > 0 ? (u.broken ? 1.0 : 0.9) : 1.0
    const dmg = Math.floor(baseDmg * (1 + be) * boostM * defM * resM * vulnM * mitM * brokenM)
    let real = dmg
if (u.side === 'ally') {
      real = absorbWithShields(this.s, u, dmg)
      real = Math.max(0, real - this.s.interceptLoss(u, real, 'dot'))
    }
    u.hp -= real
    this.s.account(attacker, 'Additional DMG Entanglement', real, 'add', ent.elem)
    this.s.log(`${u.name} takes ${real} [Entanglement ×${stacks}]`)
    this.s.fireAllyHpLoss(u, real)
    u.dots = u.dots.filter(d => d.kind !== 'Entanglement')
    this.s.logger.emit({ type: 'DOT_EXPIRED', target: u.name, targetId: u.id, payload: { kind: 'Entanglement', stacks, reason: 'tick_resolved' } })
    if (u.hp <= 0) this.s.kill(attacker, u)
  }

/** full state suffix for turn headers: eff stats + B/D counters + kit runtime + buffs/debuffs/DoTs with name, stacks, turns, source */
  private fmtMods(mods?: Mod[]): string {
    if (!mods?.length) return ''
    return mods.map(m => `${m.stat}=${Math.abs(m.value) >= 1 ? Math.round(m.value) : (m.value * 100).toFixed(1) + '%'}`).join(',')
  }
  private stateSuffix(u: Unit): string {
    const e = eff(u)
    const stats = `ATK:${Math.round(e.atk)} DEF:${Math.round(e.def)} SPD:${e.spd.toFixed(2)} CR:${(e.critRate * 100).toFixed(1)} CD:${(e.critDmg * 100).toFixed(1)} BE:${(e.be * 100).toFixed(1)}`
    const nb = u.buffs.filter(b => !isDebuff(b)).length
    const nd = u.buffs.length - nb
    const parts: string[] = []
    for (const b of u.buffs) {
      const src = b.sourceId ? this.s.roster.find(x => x.id === b.sourceId)?.name ?? b.sourceId : ''
      const st = (b.stacks ?? 1) > 1 ? `×${b.stacks}` : ''
      const tr = b.turns === Infinity || b.turns === undefined ? '' : ` ${b.turns}t`
      const mods = (b.mods?.length ?? 0) ? ` ${this.fmtMods(b.mods)}` : ''
      const sh = b.shield !== undefined ? `|sh${Math.round(b.shield)}` : ''
      parts.push(src ? `${b.name}${st}${tr}${mods}${sh}(${src})` : `${b.name}${st}${tr}${mods}${sh}`)
    }
    for (const d of u.dots) {
      parts.push(`DoT:${d.kind}${(d.stacks ?? 1) > 1 ? `×${d.stacks}` : ''} ${d.turns}t`)
    }
    const rt = runtimeString(this.s.rt(u))
    return ` ${stats} B:${nb} D:${nd}${rt ? ' R:{' + rt + '}' : ''}${parts.length ? ' | ' + parts.join(', ') : ''}`
  }

  /** the target an ally-targeting Skill actually hit: the ability target the kit recorded via
   *  markAlliedTarget (a single ally char), falling back to the last battle hit (enemy) for
   *  enemy-targeting Skills. lastHitTarget is DamagePipeline's per-hit record and only ever holds
   *  an enemy, so cones gated on "Skill used on an ally char" (A Grounded Ascent, Epoch Etched)
   *  would never fire in real combat without this lookup. */
  private skillGearTarget(): Unit | undefined {
    const t = this.s.lastAbilityTarget
    if (t && t !== 'team') return t
    return this.s.lastHitTarget
  }

  charTurn(u: Unit): void {
    const kit = this.s.kits.get(u.kitId!)!
    const ctx = this.s.rt(u)
    const isExtra = !!ctx.inExtraTurn

    const holdUlt = kit.holdUlt ? kit.holdUlt(this.s, u, ctx) : false
    // canon 30-09-2026: a turn is ONE action. The Ultimate REPLACES that action instead of stacking
    // on top of a Basic/Skill, and energy reaching max mid-action does not buy an extra action
    // either (the Ult fires at the start of the NEXT turn; an explicitly granted Extra Turn is a
    // separate action and still goes through here with isExtra set).
    if (this.canUltimate(kit, u) && !isExtra && !holdUlt) {
      this.s.logger.turnStart(u.name, 'ultimate', { hp: u.hp, maxHp: u.maxHp, energy: u.energy, maxEnergy: u.maxEnergy, extra: isExtra }, u.id)
      this.s.log(`>>> ${u.name} [ULT] HP:${Math.round(u.hp)}/${u.maxHp} EN:${u.energy.toFixed(2)}/${u.maxEnergy}${this.stateSuffix(u)}`)
      this.castUlt(kit, u, ctx, false)
      this.s.logger.turnEnd(u.name, 'ultimate', u.id)
    } else if (!u.dead) {
      const chosen = autoDecide(this.s, u, ctx, kit) ?? kit.decide(this.s, u, ctx)
      // §P4: a granted Assist Skill replaces the actor's own ability for this turn (Himeko • Nova
      // Talent 151004 — an ally may spend its turn using the Assist Skill instead of acting).
      const action: Action = chosen.kind !== 'ult' && this.s.events.assistOffered(u) ? { kind: 'assist' } : chosen
      if (action.kind === 'ult') {
        // ready-but-not-auto window (isExtra/holdUlt): decide picked the Ult itself — route
        // through castUlt so ENERGY_LOSS/refund/onAfterUlt/onAllyUlt match the auto path
        this.s.logger.turnStart(u.name, 'ultimate', { hp: u.hp, maxHp: u.maxHp, energy: u.energy, maxEnergy: u.maxEnergy, extra: isExtra }, u.id)
        this.s.log(`>>> ${u.name} [ULT] HP:${Math.round(u.hp)}/${u.maxHp} EN:${u.energy.toFixed(2)}/${u.maxEnergy}${this.stateSuffix(u)}`)
        this.castUlt(kit, u, ctx, false)
        this.s.logger.turnEnd(u.name, 'ultimate', u.id)
      } else {
        const label = action.kind === 'skill' ? 'SKILL' : action.kind === 'enhance' ? 'ENHANCE' : action.kind === 'assist' ? 'ASSIST' : 'BASIC'
        this.s.logger.turnStart(u.name, action.kind, { hp: u.hp, maxHp: u.maxHp, energy: u.energy, maxEnergy: u.maxEnergy, extra: isExtra, sp: this.s.sp() }, u.id)
        this.s.log(`>>> ${u.name} [${label}] HP:${Math.round(u.hp)}/${u.maxHp} EN:${u.energy.toFixed(2)}/${u.maxEnergy}${this.stateSuffix(u)}`)
        this.s.performAbility(kit, u, action, ctx)
        if (action.kind === 'skill') this.s.fireGear('onAfterSkill', u, this.skillGearTarget())
        this.s.logger.turnEnd(u.name, action.kind, u.id)
      }
    }
    ctx.inExtraTurn = false
    // rotation/phases are indexed by this; extra turns don't advance it
    ctx.turnIndex = ((ctx.turnIndex as number) ?? 0) + 1
  }

  /** resolve one Ultimate; fires gear hooks with the out-of-turn marker (gates advance-forward effects) */
private castUlt(kit: KitDef, u: Unit, ctx: KitRuntime, outOfTurn: boolean): void {
    const before = u.energy
    this.s.lastUltOutOfTurn = outOfTurn
    this.s.lastAbilityTarget = undefined
    this.s.performAbility(kit, u, { kind: 'ult' }, ctx)
    this.s.lastUltOutOfTurn = false
    // fired = kit paid Energy, OR a non-Energy kit flipped its own readiness gate (Newbud /
    // Coreflame / Slashed Dream → 0). ENERGY_LOSS + the sp_base +5 refund follow Energy payment
    // only (`ultConsumption: 'none'` = no refund, canon: the 6 non-Energy kits per Energy.md);
    // onAfterUlt/onAllyUlt fire whenever the cast actually happened.
    const paid = u.energy < before
    if (!paid && this.canUltimate(kit, u)) return
    if (paid) this.s.logger.emit({ type: 'ENERGY_LOSS', source: u.name, sourceId: u.id, payload: { amount: Number((before - u.energy).toFixed(2)), energy: Number(u.energy.toFixed(2)), reason: 'ult_cost' } })
    if (paid && kit.ultConsumption !== 'none') this.s.gainEnergy(u, 5)
    this.s.fireGear('onAfterUlt', u, undefined, outOfTurn)
    if (u.side === 'ally' && u.kind === 'char') this.s.fireAllyUlt(u)
  }

  /** An ALLY casts its Ultimate out of turn, right now (Cyrene 141503 "activates all teammates'
   *  Ultimate"). Gated on the same readiness the auto-ult uses (`canUltimate` — Energy kits
   *  need a full pool, special-resource kits their own gauge), so a not-ready ally must not be
   *  pushed into a kit whose own check is looser than its cap. `holdUlt` is deliberately
   *  bypassed — it suppresses the automatic ult, not an explicit activation. `currentActor` is
   *  restored so the caster's own ability (still resolving) keeps the actor.
   *  canon does not say whether a NOT-ready ally's ult fires; we require readiness
   *  (sim convention). If the wiki confirms "regardless of energy", drop the gate and give kits
   *  an explicit `forced` flag instead of relying on their own checks. */
  activateAllyUlt(ally: Unit): boolean {
    if (ally.dead || ally.side !== 'ally' || ally.kind !== 'char' || !ally.kitId) return false
    const kit = this.s.kits.get(ally.kitId)
    if (!kit || !this.canUltimate(kit, ally)) return false
    if (this.departed(ally)) return false
    const prevActor = this.s.currentActor
    this.s.currentActor = ally
    this.castUlt(this.s.kits.get(ally.kitId!)!, ally, this.s.rt(ally), true)
    this.s.currentActor = prevActor
    return true
  }

  enemyTurn(e: Unit, tc: number): void {
    // departed chars are off-field (untargetable) — the real "depart" gate: skip them as targets
    const targets = this.s.allies('ally').filter(a => a.kind === 'char' && !this.departed(a))
    if (!targets.length) return
    for (const u of this.s.roster) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char') continue
      const cg = this.s.gearMap.get(u.id)
      cg?.cone?.onEnemyTurnStart?.(this.s, u, e, cg.coneSi)
      if (u.kitId) this.s.kits.get(u.kitId)?.onEnemyTurnStart?.(this.s, u, e, this.s.rt(u))
    }
    const behavior = enemyBehavior(e.name)
    if (!e.dead) behavior?.passive?.onTurnStart?.(this.s, e)
    // a countdown entity that reached 0 in its own onTurnStart leaves the battle now (Trotter flee) —
    // it must not take its turn afterwards
    if (e.dead) return
    if (behavior) this.runEnemyBehavior(e, tc, targets, behavior)
    else this.defaultEnemyAttack(e, tc, targets)
    this.fireEnemyTurnEnd(e)
    if (!e.dead) behavior?.passive?.onTurnEnd?.(this.s, e)
  }

  /** built-in enemy action: single attack each turn, AoE every third turn against 2+ targets */
  private defaultEnemyAttack(e: Unit, tc: number, targets: Unit[]): void {
    // mint a fresh attack identity: this path bypasses `hit`/DamagePipeline, so without it a
    // once-per-attack gate (Mortenax A1, Jingliu tally) would leak one stale seq across the battle
    this.s.mintEnemyAttack(e)
    const atkPower = (e as EnemyExt).atkPower ?? 800
this.s.log(`>>> ${e.name} [ENEMY] HP:${Math.round(e.hp)}/${e.maxHp} Tough:${Math.round(e.toughness)}/${e.maxToughness}${this.stateSuffix(e)}`)
    this.s.logger.turnStart(e.name, 'attack', { hp: e.hp, maxHp: e.maxHp, toughness: e.toughness, maxToughness: e.maxToughness, turnCount: tc }, e.id)
    if (tc % 3 === 0 && targets.length > 1) {
      this.s.log(`${e.name} uses AoE attack`)
      this.emitTargetSelected(e, this.enemyTarget(e, targets, 'aoe'), 'aoe')
      for (const t of [...targets]) this.enemyHit(e, t, atkPower * 0.65)
    } else {
      const sel = this.enemyTarget(e, targets, 'single')
      this.emitTargetSelected(e, sel, sel.rule === 'forced' ? 'forced' : 'single')
      this.enemyHit(e, sel.targets[0]!, atkPower)
    }
    this.s.logger.turnEnd(e.name, 'attack', e.id)
  }

  /** §54 — one enemy turn driven by a declarative behavior: AI picks an ability (or charges a
   *  §55 telegraph), targets resolve by the ability's `targetRule`, effects run through the shared
   *  pipeline. Falls back to the built-in attack when the AI yields nothing. */
  private runEnemyBehavior(e: Unit, tc: number, targets: Unit[], behavior: EnemyBehavior): void {
    let active = behavior
    if (behavior.phases?.length) {
      const rt = evaluateEnemyPhase(this.s, this.s.logger, e, behavior.phases, tc)
      active = { ...behavior, abilities: filterPhaseAbilities(behavior.abilities, behavior.phases, rt) }
    }
    const action = chooseEnemyAction(this.s, e, targets.length, active)
    if (!action) { this.defaultEnemyAttack(e, tc, targets); return }
    const ab = action.ability
    this.s.log(`>>> ${e.name} [ENEMY] HP:${Math.round(e.hp)}/${e.maxHp} Tough:${Math.round(e.toughness)}/${e.maxToughness} [${ab.name}]${this.stateSuffix(e)}`)
    this.s.logger.turnStart(e.name, ab.id, { hp: e.hp, maxHp: e.maxHp, toughness: e.toughness, maxToughness: e.maxToughness, turnCount: tc, phase: action.phase, ability: ab.name }, e.id)
    if (action.phase === 'charge') {
      this.s.logger.note(`${e.name} is charging ${ab.name}`)
    } else {
      const chosen = this.selectBehaviorTargets(e, targets, ab.targetRule)
      executeEnemyAbility(this.s, e, ab, chosen)
    }
    this.s.logger.turnEnd(e.name, ab.id, e.id)
  }

  /** resolve the ability's targets by rule, reusing the §62 target resolver (forced-target + aggro) */
  private selectBehaviorTargets(e: Unit, pool: Unit[], rule: EnemyTargetRule = 'single'): Unit[] {
    if (rule === 'self') return []
    // [Bounce] resolves its own random targets inside the hit primitive — a pre-picked primary would
    // only emit a misleading TARGET_SELECTED for a unit the ability may never touch.
    if (rule === 'random') return []
    if (rule === 'aoe') {
      this.emitTargetSelected(e, this.enemyTarget(e, pool, 'aoe'), 'aoe')
      return [...pool]
    }
    const sel = this.enemyTarget(e, pool, 'single')
    this.emitTargetSelected(e, sel, sel.rule === 'forced' ? 'forced' : 'single')
    return sel.targets
  }

  /** §62 — run the targeting pipeline for one enemy action. `aoe`/`self` ignore Taunt; single-target
   *  rules consult the forced-target mark first (which ticks on use), then fall to the weighted draw. */
  private enemyTarget(e: Unit, pool: Unit[], rule: 'single' | 'aoe' | 'self'): TargetSelection {
    if (rule === 'single') {
      const forced = this.forcedTargetFor(e, pool)
      const weights = pool.map(t => (t.aggro ?? 100) + buffVal(t, 'aggro'))
      return resolveTargets({ actorId: e.id, rule, candidates: pool, weights, forcedTarget: forced, rng: () => this.s.rng() })
    }
    return resolveTargets({ actorId: e.id, rule, candidates: pool, rng: () => this.s.rng() })
  }

  /** §62 debug trail: `mode` keeps the legacy label; `rule`/`reason`/`candidates`/`weights` are the
   *  resolver's decision. Payload numbers stay in arrays so golden keys (scalar-number fingerprint)
   *  are unchanged. */
  private emitTargetSelected(e: Unit, sel: TargetSelection, mode: string): void {
    const first = mode === 'aoe' ? undefined : sel.targets[0]
    this.s.logger.emit({
      type: 'TARGET_SELECTED', source: e.name, target: first?.name, sourceId: e.id, targetId: first?.id,
      payload: {
        mode, targets: sel.targets.map(t => t.name), targetIds: sel.targets.map(t => t.id),
        rule: sel.rule, reason: sel.reason, candidates: sel.candidates, weights: sel.weights,
      },
    })
  }

  private fireEnemyTurnEnd(e: Unit): void {
    for (const u of this.s.roster) {
      if (u.dead || u.side !== 'ally' || u.kind !== 'char') continue
      if (u.kitId) this.s.kits.get(u.kitId)?.onEnemyTurnEnd?.(this.s, u, e, this.s.rt(u))
    }
  }

  /** §25 forced-target (Taunt): the attacker's mark (if any) pins its single-target selection onto
   *  the marked unit. Ticks one of the attacker's turns per use and expires at 0; a mark whose
   *  forced unit is dead / off-field / filtered out is dropped and selection falls back to aggro. */
  private forcedTargetFor(e: Unit, pool: Unit[]): Unit | undefined {
    const ov = this.s.targetOverrides.get(e.id)
    if (!ov) return undefined
    const live = this.s.find(ov.targetId)
    if (!live || !pool.includes(live)) {
      this.s.targetOverrides.delete(e.id)
      return undefined
    }
    // the mark forces the CURRENT attacker turn, then one arm is consumed; an N-turn taunt therefore
    // forces N picks and only expires after the last arm is spent (guide: "for N turns" = N forced picks)
    const next = tickOverride(ov)
    if (next) this.s.targetOverrides.set(e.id, next)
    else this.s.targetOverrides.delete(e.id)
    this.s.log(`${e.name} attacks ${live.name} instead [Taunt by ${this.s.find(ov.sourceId)?.name ?? ov.sourceId}, ${next ? next.turns : 0} turn(s) left]`)
    return live
  }

  private enemyHit(src: Unit, target: Unit, baseDmg: number): void {
    const defM = defMultiplier(src.base.level, target.base.level, target)
    const resM = resFactor(target, src.buffs, src.elem)
    const mitM = mitigationMult(target)
    let dmg = Math.floor(baseDmg * defM * resM * mitM)
    // shield absorbs damage first (shared character-shield hull — March 7th Skill et al.)
    dmg = absorbWithShields(this.s, target, dmg, baseDmg)
    // Castorice Mooncocoon / Mydei A1: redirect damage before it lands
    if (target.side === 'ally') dmg = Math.max(0, dmg - this.s.interceptLoss(target, dmg, 'attack'))
    target.hp -= dmg
    this.s.account(`ENEMY ${src.name}`, 'Attack', dmg, undefined, src.elem)
    this.s.log(`${src.name} hits ${target.name}: ${dmg}`)
    // non-Energy Ultimate resources (ultConsumption 'none': Aureus/Severed/Newbud/Coreflame/…) gain
    // nothing from being hit — only standard-Energy characters get energy on enemy attacks
    if (this.s.kits.get(target.kitId!)?.ultConsumption !== 'none') this.s.gainEnergy(target, 10)
// fire before the death check so kits can intercept a killing blow (Huohuo E2 revive)
    this.s.fireAllyHit(src, target, dmg)
    this.s.fireAllyHpLoss(target, dmg)
    if (target.hp <= 0) this.s.kill(src, target)
  }

  /** Aha's turn: an Aha Instant. Every unit capable of an Elation Skill uses it 1
   *  time (roster = participant-ID order); each then gains Certified Banger for the
   *  Punchline taken into the instant (2 turns). With NO Elation-Skill units Aha
   *  uses "Let There Be Laughter" instead. After his action all Punchline is consumed. */
  private ahaTurn(): void {
    const a = this.s.aha!
    this.s.ahaSync(a)
    const users = this.s.roster.filter(u =>
      u.side === 'ally' && u.kind === 'char' && !u.dead && u.kitId && this.s.kits.get(u.kitId)?.onAhaInstant)
    this.s.log(`>>> Aha [AHA INSTANT] SPD:${Math.round(eff(a).spd * 10) / 10}${this.stateSuffix(a)}`)
    this.s.logger.turnStart('Aha', 'aha_instant', { punchline: this.s.punchline, users: users.map(u => u.name), userIds: users.map(u => u.id) }, a.id)
    // Aha-tied cone buffs (Sneering) go up before any Elation Skill, and expire at Aha's endTick
    this.s.fireAhaInstant()
    if (users.length) {
      const pool = this.s.punchline
      for (const u of users) {
        this.s.kits.get(u.kitId!)!.onAhaInstant!(this.s, u, this.s.rt(u))
        this.s.addCb(u, pool)
      }
    } else {
      this.letThereBeLaughter(a)
    }
    if (this.s.punchline > 0) {
      this.s.log(`Aha consumes all Punchline (${this.s.punchline})`)
      this.s.punchline = 0
    }
    this.s.logger.turnEnd('Aha', 'aha_instant', a.id)
  }

  /** Aha's Elation Skill when no unit can use one: up to 10 Quantum Elation bounce
   *  hits shared across both sides. Ally hits deal 1 damage and grant +2 Energy
   *  (modified by ERR). Hit mult 300%; Aha carries +200% Elation → 9× total. */
  private letThereBeLaughter(a: Unit): void {
    this.s.log(`Aha uses Let There Be Laughter (Quantum Elation bounce ×10)`)
    for (let i = 0; i < 10; i++) {
      const pool = this.s.roster.filter(u => !u.dead && (u.side === 'enemy' || (u.side === 'ally' && u.kind === 'char')))
      if (!pool.length) break
      const t = this.s.rngPick(pool)
      if (t.side === 'enemy') {
        elationHit(this.s, a, t, 3.0, 'Let There Be Laughter', 'Quantum', false)
      } else {
        let one = absorbWithShields(this.s, t, 1)
        one = Math.max(0, one - this.s.interceptLoss(t, one, 'attack'))
        t.hp -= one
        this.s.account('Aha', 'Let There Be Laughter', one, 'aha', 'Quantum')
        this.s.log(`Aha → ${t.name}: 1 [Let There Be Laughter]`)
        this.s.fireAllyHpLoss(t, one)
        this.s.gainEnergy(t, 2)
        if (t.hp <= 0) this.s.kill(a, t)
      }
    }
  }

  private summonTurn(s: Unit): void {
    const ctx = this.s.rt(s)
    const owner = this.s.find(ctx.ownerId as string) ?? s
    this.s.fireMemospriteTurnStart(owner)
    const ownerKit = this.s.kits.get(owner.kitId!)
    // Summons own their turn via their kit's onSummonTurn (Lightning-Lord, Numby, Garmentmaker, ...).
    if (ownerKit?.onSummonTurn) {
      this.s.logger.turnStart(s.name, 'ability', { kind: s.kind, owner: owner.name, ownerId: ctx.ownerId }, s.id)
      ownerKit.onSummonTurn(this.s, s, owner, this.s.rt(owner))
      this.s.fireAllyMemospriteAct(s)
      this.s.logger.turnEnd(s.name, 'ability', s.id)
      return
    }
    // a summon without a turn hook is a passive/event-driven entity (e.g. Hyacine's Ica, SPD 0)
    // — it never meaningfully acts on its own, so it just stays out of the way.
    this.s.log(`-- ${s.name} has no summon turn`)
  }

  private timerTurn(t: Unit): void {
    const ctx = this.s.rt(t)
    const owner = this.s.find(ctx.ownerId as string)
    this.s.log(`-- ${t.name} countdown finished`)
    // no ACTION_END: a countdown resolves inside its owner's action, so it must not claim an ACT of
    // its own, and an END without a START breaks the §3 ID pairing. SUMMON_DESPAWNED (unregisterUnit,
    // next line) already carries the fact that the timer unit is gone. verify() enforces the pairing.
    if (owner) {
      const kit = this.s.kits.get(owner.kitId!)
      ;(kit as KitDef & { onCcEnd?: (sim: Simulator, u: Unit, ctx: KitRuntime) => void })?.onCcEnd?.(this.s, owner, this.s.rt(owner))
    }
    t.dead = true
    this.s.unregisterUnit(t.id)
  }
}
