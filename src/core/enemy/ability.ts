import type { DmgType, Elem, Unit } from '../entities/Unit'
import type { Mod, DoT } from '../effects/Buff'
import type { SimApi } from '../kit'
import { counterFiredSeq, enterEnemyCounter, enemyCounterOf, markCounterFired, resetEnemyCounter } from './counter'
import { enemyDefenseOf } from './defense'
import { effectResOf } from '../combat/StatResolver'

/** §53 — an enemy ability is a declared list of effects, not a bespoke action method.
 *
 *  Every effect maps onto a primitive the character side already uses (`sim.hit` /
 *  `sim.hitAoe` / `sim.delay` / `sim.advance` / `sim.heal`), so an enemy runs through the
 *  same damage pipeline, event bus and loss/interceptor layer as a kit — there is no
 *  second damage engine hiding inside enemy code (`Не создавать отдельный damage engine`). */

export type EnemyTargetRule = 'single' | 'aoe' | 'blast' | 'self' | 'random'

export type EnemyEffect =
  /** one direct hit on a resolved single target (uses the shared damage pipeline) */
  | { op: 'attack'; mult: number; hits?: number; type?: DmgType; elem?: Elem }
  /** primary + neighbouring targets (Blast shape), all through the shared pipeline */
  | { op: 'blast'; mult: number; adjMult: number; type?: DmgType; elem?: Elem }
  /** every living ally of the actor (AoE shape) */
  | { op: 'aoe'; mult: number; type?: DmgType; elem?: Elem }
  /** N individually-resolved hits, each on a RANDOM living target (canon [Bounce], e.g. Sky-Piercing
   *  Lance). Ignores the resolved `targets` and re-reads the live pool per hit; the character-side
   *  random multi-hit already carries this shape (no adjacent splash passed). */
  | { op: 'bounce'; mult: number; hits: number; type?: DmgType; elem?: Elem }
  /** Action Delay on the resolved targets */
  | { op: 'delay'; pct: number }
  /** Action Advance on the actor itself (charge wind-up, enrage) */
  | { op: 'advanceSelf'; pct: number }
  /** Action Advance on a set: the actor's living allies (`allies`, default; includes the actor),
   *  the actor's living allies EXCEPT the actor (`alliesOther`), or the resolved targets
   *  (`targets`) — canon: Dreamweaver BananAdvisor "Class Time! Sit Down!" advances its own side,
   *  "Break Time! Chaaarge!" advances the player team, Winder Goon "Wake-Up Alarm" makes every
   *  friendly unit *apart from itself* act immediately. */
  | { op: 'advance'; pct: number; to?: 'allies' | 'alliesOther' | 'targets' }
  /** heal a fraction of Max HP — the actor (`self`, default) or the actor's living allies. `of`
   *  picks the denominator: the recipient's Max HP (default) or the actor's (e.g. Automaton Hound's
   *  "25% of this unit's Max HP" team heal). */
  | { op: 'heal'; frac: number; of?: 'target' | 'actor'; to?: 'self' | 'allies' }
  /** apply an ATK- and/or target-Max-HP-scaled damage-over-time (Burn/Bleed/Shock/Wind Shear)
   *  through the shared DoT path. Per-turn base = `effAtk(actor)*mult + target.maxHp*fromMaxHp`
   *  (Bleed is typically the latter); `stacks` seeds a multi-stack DoT (Wind Shear). `chance`
   *  (default 1) is a BASE chance rolled once per target against the target's Effect RES
   *  (`effectResOf`), mirroring `applyDebuff`. Element defaults from the kind. */
  | { op: 'dot'; kind: 'Burn' | 'Bleed' | 'Shock' | 'WindShear'; mult?: number; fromMaxHp?: number; stacks?: number; turns?: number; chance?: number; elem?: Elem }
  /** grant a stat buff (ATK/SPD/DEF up, DMG reduction, ...) to the actor (`self`, default), the
   *  actor's living allies, or the resolved targets (`targets`, e.g. an enemy that GRANTS the player
   *  team a stat — Banacademic Charmony BananAdvisor "Monkey Yes! Holiday Activities!") — the
   *  enemy-side counterpart of `debuff`, applied without an EHR roll */
  | { op: 'buff'; buff: { id: string; name: string; mods: Mod[]; turns?: number; stacks?: number; maxStacks?: number; debuff?: boolean }; to?: 'self' | 'allies' | 'alliesOther' | 'targets' | 'allyRandom' }
  /** grant a damage-absorbing HP shield (fraction of the recipient's Max HP) to the actor
   *  (`self`, default) or the actor's living allies (§57 `routeEnemyDamage` absorbs it) */
  | { op: 'shield'; frac: number; to?: 'self' | 'allies' }
  /** §61 enter a Counter state: the next single-target ally attack on the actor makes it act
   *  immediately on the attacker (canon: Silvermane Lieutenant "Shield Reflect"). */
  | { op: 'counter'; ability: EnemyAbilityDefinition; exit?: 'once' | 'manual' }
  /** inflict a DoT-kind control on the target through the shared DoT path (CONTROL_APPLIED +
   *  control-immune gate stay intact). Freeze skips the target's next turn via TurnManager;
   *  Imprisonment and Entanglement mirror their Weakness-Break application (apply-time delay).
   *  `chance` (default 1) is a BASE chance rolled once per target against the target's Effect RES
   *  (`effectResOf`), mirroring `applyDebuff`. */
  | { op: 'control'; kind: 'Freeze' | 'Imprisonment' | 'Entanglement'; turns?: number; chance?: number; elem?: Elem }
  /** inflict a stat debuff through the shared applyDebuff path: one Effect-RES roll per target,
   *  success adds the buff (`isDebuff` grouping ⇒ DEBUFF_APPLIED). Enemy sources never feed the
   *  ally `onDebuffInflict` kit hooks. */
  | { op: 'debuff'; buff: { id: string; name: string; mods: Mod[]; turns?: number; stacks?: number; maxStacks?: number }; chance?: number }
  /** change the shared Skill Point pool by `delta` (clamped to 0..max) — enemy SP drain/restore
   *  (canon: Abundance Lotus "Samsara" −1). Targets are ignored; the pool is team-wide. */
  | { op: 'sp'; delta: number }
  /** §62 Lock-On (Voidranger: Distorter "Nihility's Command"): pin one random living character as
   *  the FORCED single-target of every living attacker-side enemy (`addTargetOverride`, §25 — ticks
   *  per forced pick) and apply a vulnerability debuff to that unit. `vuln` (default 10%) is the
   *  DMG-taken-increase amount; `turns` (default 4) is the mark window in forced picks. */
  | { op: 'lockon'; vuln?: number; turns?: number; chance?: number }
  /** strip one of the actor's OWN buffs (Voidranger: Eliminator "Thermal Barrier" clears its
   *  Overloaded state). `id` removes exactly that buff, nothing else. */
  | { op: 'dispelSelf'; id: string }
  /** §54 enemy support: grant `pct` × Max Energy to ONE random living player character through the
   *  ERR-scaled regen path (canon: Mr. Domescreen "Surprise Variety Show" +50%). No-op when the
   *  player side has no living character. */
  | { op: 'allyEnergyPct'; pct: number }
  /** §54 enemy drain: remove `pct` × Max Energy from each resolved target (clamped at 0) through the
   *  shared `loseEnergy` path (canon: Mr. Domescreen "Startling Broadcast" −20%). */
  | { op: 'drainEnergyPct'; pct: number }
  /** §54 enemy drain (flat): remove a fixed `amount` of Energy from each resolved target through the
   *  shared `loseEnergy` path (canon: Banacademic Assistanana "Banascary Semester" −15 per target). */
  | { op: 'drainEnergyFlat'; amount: number }
  /** §57 per-unit defensive state toggle: set this actor's own `controlImmune` and/or
   *  `toughnessImmune` flags (canon: Daybreak Squadron "Daybreak Forcefield" — CC-immune and
   *  Toughness cannot be reduced while the field is up). Reads/writes the unit's resolved defense
   *  runtime through `enemyDefenseOf`, never the shared authored profile, so state stays per-unit. */
  | { op: 'guard'; controlImmune?: boolean; toughnessImmune?: boolean }
  /** §57 random-outcome ability (canon: Autonomous Wand "Happiness Charm"): pick ONE of `effects` at
   *  random (seeded `rngInt`) and execute it against the already-resolved targets. */
  | { op: 'oneOf'; effects: EnemyEffect[] }

/** §53 ability definition. `cast > 0` marks a §55 telegraphed ability: the enemy spends
 *  `cast` turns charging before the listed effects resolve (`phase: 'release'`). */
export interface EnemyAbilityDefinition {
  id: string
  name: string
  targetRule?: EnemyTargetRule
  effects: EnemyEffect[]
  /** SimpleAI picks the highest ready priority (ties → declaration order). */
  aiPriority?: number
  /** turns after use before the ability is ready again */
  cooldown?: number
  /** total uses for the whole battle (omit = unlimited) */
  charges?: number
  /** §55 charge-up: number of telegraph turns before this ability's effects land */
  cast?: number
  /** §54 state gate: the ability is only ready while the actor has (`buff`) / lacks (`noBuff`) the
   *  given buff id. A gated-but-unmet ability is skipped by the AI (PatternAI advances to the next
   *  ready step), so a channel state machine self-corrects through the rotation. */
  require?: { buff?: string; noBuff?: string }
}

/** Effect-RES-aware resist roll for the `dot` / `control` ops. Mirrors `applyDebuff`'s
 *  `baseChance × (1 − Effect RES)` (enemies carry no Effect Hit Rate, so the source term is 1); a
 *  resolved chance ≥ 1 never rolls, so an Effect-RES-free target behaves exactly as the former flat
 *  gate did (RNG-preserving — one roll only when the chance is below 1). */
function rollsResist(sim: SimApi, target: Unit, baseChance: number): boolean {
  const p = baseChance * (1 - effectResOf(target))
  return p < 1 && sim.rng() >= p
}

/** run one ability's effects against `targets` (resolved by the caller per `targetRule`).
 *  AoE ignores `targets` and re-reads the live ally list, so it never hits a stale snapshot. */
export function executeEnemyAbility(sim: SimApi, actor: Unit, ability: EnemyAbilityDefinition, targets: Unit[]): void {
  for (const e of ability.effects) {
    switch (e.op) {
      case 'attack': {
        const t = targets[0]
        if (!t) break
        for (let i = 0; i < (e.hits ?? 1); i++) sim.hit(actor, t, hitOpts(e.mult, ability, e.type, e.elem))
        break
      }
      case 'blast': {
        const t = targets[0]
        if (!t) break
        sim.hitBlast(actor, t, hitOpts(e.mult, ability, e.type, e.elem), hitOpts(e.adjMult, ability, e.type, e.elem))
        break
      }
      case 'aoe':
        sim.hitAoe(actor, hitOpts(e.mult, ability, e.type, e.elem))
        break
      case 'bounce':
        sim.hitRandom(actor, e.hits, hitOpts(e.mult, ability, e.type, e.elem))
        break
      case 'delay':
        for (const t of targets) sim.delay(t, e.pct)
        break
      case 'advanceSelf':
        sim.advance(actor, e.pct)
        break
      case 'advance':
        for (const t of e.to === 'targets' ? targets : sim.allies(actor.side).filter(u => !u.dead && (e.to !== 'alliesOther' || u.id !== actor.id))) sim.advance(t, e.pct)
        break
      case 'heal': {
        for (const t of recipients(sim, actor, e.to, targets)) {
          const basis = (e.of === 'actor' ? actor.maxHp : t.maxHp) * e.frac
          sim.heal(t, basis, actor)
        }
        break
      }
      case 'dot': {
        const elem = e.elem ?? DOT_ELEM[e.kind]
        for (const t of targets) {
          if (t.dead) continue
          if (rollsResist(sim, t, e.chance ?? 1)) { sim.log(`${t.name} resists ${e.kind}`); continue }
          const baseDmg = Math.max(0, Math.floor(sim.effAtk(actor) * (e.mult ?? 0) + t.maxHp * (e.fromMaxHp ?? 0)))
          sim.applyDot(t, { kind: e.kind, elem, turns: e.turns ?? 2, baseDmg, stacks: e.stacks ?? 1, sourceUnit: actor })
        }
        break
      }
      case 'buff':
        for (const t of recipients(sim, actor, e.to, targets)) {
          if (t.dead) continue
          sim.addBuff(t, { ...e.buff, sourceId: actor.id })
        }
        break
      case 'shield':
        for (const t of recipients(sim, actor, e.to, targets)) {
          if (t.dead) continue
          const amount = Math.round(t.maxHp * e.frac)
          if (amount <= 0) continue
          const rt = enemyDefenseOf(t)
          rt.shield += amount
          sim.log(`${t.name} gains ${amount} Shield`, { type: 'SHIELD_APPLIED', source: t.name, target: t.name, sourceId: t.id, targetId: t.id, payload: { amount, id: 'enemy_shield', name: 'Defense Shield', remaining: rt.shield } })
        }
        break
      case 'control': {
        const kind = e.kind
        const elem = e.elem ?? (kind === 'Freeze' ? 'Ice' : kind === 'Imprisonment' ? 'Imaginary' : 'Quantum')
        for (const t of targets) {
          if (t.dead) continue
          if (rollsResist(sim, t, e.chance ?? 1)) { sim.log(`${t.name} resists ${kind}`); continue }
          const dot: DoT & { sourceUnit?: Unit } = { kind, elem, turns: e.turns ?? 1, baseDmg: 0, sourceUnit: actor }
          sim.applyDot(t, dot)
          // mirror the Weakness-Break application of the same DoT-kinds (BreakResolver §18)
          if (kind === 'Imprisonment') {
            sim.delay(t, 0.30)
            sim.addBuff(t, { id: 'imprisonSpd', name: 'Imprisoned SPD-10%', mods: [{ stat: 'spdDown', value: 0.1 }], sourceId: actor.id })
          } else if (kind === 'Entanglement') {
            sim.delay(t, 0.20)
          }
        }
        break
      }
      case 'debuff':
        for (const t of targets) {
          if (t.dead) continue
          sim.applyDebuff(actor, t, e.chance ?? 1, () => sim.addBuff(t, { ...e.buff, sourceId: actor.id, debuff: true }), e.buff.name)
        }
        break
      case 'counter':
        enterEnemyCounter(actor, { ability: e.ability, exit: e.exit ?? 'once' })
        sim.log(`${actor.name} enters a Counter state — the next single-target attack is countered (${e.ability.name})`)
        break
      case 'sp':
        sim.gainSp(e.delta)
        break
      case 'dispelSelf':
        sim.removeBuff(actor, e.id)
        sim.log(`${actor.name} sheds its Overloaded state (${e.id})`, { type: 'NOTE' })
        break
      case 'allyEnergyPct': {
        const chars = sim.allies('ally').filter(u => u.kind === 'char' && !u.dead)
        if (!chars.length) break
        const t = sim.rngPick(chars)
        sim.gainEnergy(t, t.maxEnergy * e.pct)
        sim.log(`${actor.name} regenerates ${Math.round(e.pct * 100)}% Energy for ${t.name}`)
        break
      }
      case 'drainEnergyPct':
        for (const t of targets) {
          if (t.dead) continue
          sim.loseEnergy(t, t.maxEnergy * e.pct)
          sim.log(`${actor.name} drains ${Math.round(e.pct * 100)}% Energy from ${t.name}`)
        }
        break
      case 'drainEnergyFlat':
        for (const t of targets) {
          if (t.dead) continue
          sim.loseEnergy(t, e.amount)
          sim.log(`${actor.name} drains ${e.amount} Energy from ${t.name}`)
        }
        break
      case 'guard': {
        const rt = enemyDefenseOf(actor)
        rt.defense = { ...rt.defense, controlImmune: e.controlImmune ?? false, toughnessImmune: e.toughnessImmune ?? false }
        sim.log(`${actor.name} ${e.toughnessImmune ? 'raises' : 'lowers'} a protective field`)
        break
      }
      case 'lockon': {
        const foes = sim.livingEnemiesOf(actor).filter(u => u.kind === 'char' && !u.dead)
        if (!foes.length) break
        const pinned = sim.rngPick(foes)
        const turns = e.turns ?? 4
        const vuln = e.vuln ?? 0.1
        sim.applyDebuff(actor, pinned, e.chance ?? 1, () => {
          sim.addBuff(pinned, { id: ENEMY_LOCK, name: 'Nihility Lock-On (DMG taken up)', mods: [{ stat: 'vulnAll', value: vuln }], turns, sourceId: actor.id, debuff: true })
          for (const atk of sim.units()) {
            if (atk.dead || atk.side !== actor.side) continue
            sim.addTargetOverride(atk, pinned, turns)
          }
          sim.log(`${actor.name} locks onto ${pinned.name} — all enemy attacks target them (Vuln +${Math.round(vuln * 100)}%)`)
        }, 'Nihility\'s Command')
        break
      }
      case 'oneOf':
        if (e.effects.length) executeEnemyAbility(sim, actor, { ...ability, effects: [e.effects[sim.rngInt(e.effects.length)]] }, targets)
        break
    }
  }
}

/** §61 — the single engine-level counter trigger, wired once in DamagePipeline after a hit. The
 *  gate mirrors canon: only a *single-target* ally attack on the countering enemy fires, once per
 *  attack (`attackSeq`, §5 — a multi-digit split is one attack), and the counter casts its ability
 *  at the attacker immediately. Exit rule: 'once' clears after firing; 'manual' persists. */
export function fireEnemyCounter(sim: SimApi, actor: Unit, attacker: Unit): void {
  const def = enemyCounterOf(actor)
  if (!def || attacker.dead || actor.dead) return
  const seq = sim.attackNo()
  if (counterFiredSeq(actor) === seq) return
  markCounterFired(actor, seq)
  sim.log(`◆ ${actor.name} Counter state triggers — casts ${def.ability.name} on ${attacker.name}`)
  executeEnemyAbility(sim, actor, def.ability, [attacker])
  if (def.exit === 'once') resetEnemyCounter(actor)
}

function hitOpts(mult: number, ability: EnemyAbilityDefinition, type?: DmgType, elem?: Elem) {
  return { type: type ?? 'basic', mult, scaleStat: 'atk' as const, elem, canCrit: false, label: ability.name }
}

/** effects that act on the actor's own side rather than the resolved enemy targets */
const DOT_ELEM: Record<'Burn' | 'Bleed' | 'Shock' | 'WindShear', Elem> = {
  Burn: 'Fire', Bleed: 'Physical', Shock: 'Lightning', WindShear: 'Wind',
}

/** §62 Lock-On debuff id (Voidranger: Distorter + the `lockon` op) — vuln mark that also pins every
 *  attacker's forced target. Shared so kits/tests can reference it without magic strings. */
export const ENEMY_LOCK = 'enemy_lockon'

function recipients(sim: SimApi, actor: Unit, to: 'self' | 'allies' | 'alliesOther' | 'targets' | 'allyRandom' = 'self', targets: Unit[] = []): Unit[] {
  if (to === 'allies') return sim.allies(actor.side).filter(u => !u.dead)
  if (to === 'alliesOther') return sim.allies(actor.side).filter(u => !u.dead && u.id !== actor.id)
  if (to === 'allyRandom') {
    const alive = sim.allies(actor.side).filter(u => !u.dead)
    return alive.length ? [sim.rngPick(alive)] : []
  }
  if (to === 'targets') return targets.filter(u => !u.dead)
  return [actor]
}
