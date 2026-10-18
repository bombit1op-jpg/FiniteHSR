import type { Elem, Unit } from '../entities/Unit'
import type { SimApi } from '../kit'

/** §57 — optional per-enemy reaction hooks, attached to an `EnemyBehavior`.
 *
 *  The enemy engine had no seam for "this enemy reacts when attacked / at its turn boundary":
 *  `EnemyEffect` ops are active on the enemy's own turn only, and `EnemyDefenseState` is a static
 *  profile. War Armor (a Titankin status shared by many bosses) needs both, so this is the minimal
 *  declarative hook set — a status is authored data, never an `if (name === ...)`.
 *
 *  All hooks fire through the one shared pipeline (never a private damage formula):
 *    - `onSpawn`   once per unit, after the wave is built (arming / opening state).
 *    - `onHitTaken` once per (attack, target), from `DamagePipeline.hitPost` — the same window the
 *      enemy Counter reacts in. Attacker is the other side's unit.
 *    - `onTurnStart` once at the start of this unit's own turn, from `TurnManager.enemyTurn`
 *      (before the behavior runs) — the recurring self-maintenance window (Abundance Lotus "Mend").
 *    - `onTurnEnd` once at the end of this unit's own turn, from `TurnManager.enemyTurn`.
 *    - `onKilled`  once when the unit is knocked down, from `Lifecycle.kill` — the "on receiving a
 *      killing blow" window (death-rattle effects: Automaton Spider's Chains of Destruction, Mara
 *      Rejuvenate, Golden Hound's Rebound Roar). Killer is the unit whose hit emptied HP.
 *    - `onBreak`   once when the unit's Weakness breaks, from `BreakResolver.fullBreak` — the
 *      "on receiving Weakness Break" window (Safeguard's intact→broken transition).
 */
export interface EnemyPassive {
  onSpawn?(sim: SimApi, self: Unit): void
  onHitTaken?(sim: SimApi, self: Unit, attacker: Unit): void
  onTurnStart?(sim: SimApi, self: Unit): void
  onTurnEnd?(sim: SimApi, self: Unit): void
  onKilled?(sim: SimApi, self: Unit, killer: Unit): void
  /** once when this unit's Weakness is (first) Broken, from `BreakResolver.fullBreak` — the
   *  "on receiving Weakness Break" window (Safeguard's intact→broken transition). `elem` is the
   *  breaking element. Not fired for damage-only intermediate bars. */
  onBreak?(sim: SimApi, self: Unit, elem: Elem): void
}

/** The living units immediately next to `self` on its own side — the death-rattle "adjacent units"
 *  target (Automaton Spider "Chains of Destruction" hits its neighbours, not the whole team).
 *
 *  Authored decision (no coordinates exist in the enemy data): adjacency = order in the side's
 *  roster (spawn/formation order), matching the index±1 the existing random-splash already uses.
 *  `sim.units()` is the full roster, so the anchor keeps its slot even after it has died. */
export function adjacentFriendlyUnits(sim: SimApi, self: Unit): Unit[] {
  const side = sim.units().filter(u => u.side === self.side)
  const i = side.indexOf(self)
  if (i < 0) return []
  const out: Unit[] = []
  for (const j of [i - 1, i + 1]) {
    const u = side[j]
    if (u && !u.dead) out.push(u)
  }
  return out
}

/** §57 countdown-entity timer (Treasure Trotter family). The unit leaves the battle after `turns`
 *  of its OWN turns elapse (`sim.flee`, no kill rewards). The decrement lives in `onTurnStart`, so
 *  a Frozen trotter (turn skipped before `enemyTurn` runs) does not tick — freezing genuinely stops
 *  the escape, exactly the in-game counter. The final tick enters the "Run... Run!" panic (the unit
 *  still acts that turn — canon: it panics instead of attacking, so the authored ability must be a
 *  no-op) and the next one flees. */
export function fleeCountdown(turns: number): EnemyPassive {
  return {
    onSpawn(sim, self) {
      sim.rt(self).fleeTurns = turns
      sim.log(`${self.name} is startled — will flee in ${turns} turn${turns === 1 ? '' : 's'}`)
    },
    onTurnStart(sim, self) {
      const left = (sim.rt(self).fleeTurns as number | undefined) ?? turns
      if (left <= 1) {
        sim.flee(self)
        return
      }
      sim.rt(self).fleeTurns = left - 1
      sim.log(`${self.name} is panicking — will flee in ${left - 1} turn${left - 1 === 1 ? '' : 's'} (${left - 1 > 1 ? 'S—S—S—Scared' : 'Run... Run!'} state)`)
    },
  }
}

/** War Armor (Polis Protector / Titankin): data from `docs/combat_mechanics/War Armor.md`.
 *  The unit starts with N stacks and takes −R DMG. Every time it is attacked it loses one stack;
 *  at 0 the armor SHATTERS — the unit takes S% of its Max HP as Imaginary damage, is delayed by D,
 *  and the attacker regenerates E% of its Max Energy. After shattering, each further attack deals
 *  B% of Max HP; the armor is restored to maximum at the end of the unit's own turn.
 *
 *  State is carried by buffs (no new runtime field): a stack-counter buff (`warArmor`, no mods) plus
 *  a one-stack mitigation buff (`warArmorMit`) — they are separate because `buffSum` multiplies a
 *  mod by its stack count, so a single 7-stack buff with a `mitigation` mod would give −70%.
 *
 *  Authored decisions (no canonical value, see TODO.md):
 *    - "per attack" = once per attack-target (`hitPost`), matching the Counter window; multi-digit
 *      hits drain one stack, not one per digit.
 *    - the N%/B% self-damage is applied as flat `true`-kind HP change (it is a %Max-HP figure, not
 *      an attack that should roll DEF/RES/crit), with its own NOTE for observability. */
export interface WarArmorOpts {
  stacks?: number
  dmgReduction?: number
  shatterPct?: number
  brokenPct?: number
  delayPct?: number
  energyPct?: number
}

const ARMOR = 'warArmor'
const MIT = 'warArmorMit'
const BROKEN = 'warArmorBroken'

export function warArmor(opt: WarArmorOpts = {}): EnemyPassive {
  const stacks = opt.stacks ?? 7
  const dmgReduction = opt.dmgReduction ?? 0.10
  const shatterPct = opt.shatterPct ?? 0.10
  const brokenPct = opt.brokenPct ?? 0.01
  const delayPct = opt.delayPct ?? 0.10
  const energyPct = opt.energyPct ?? 0.15

  const counter = (self: Unit) => self.buffs.find(b => b.id === ARMOR)

  const arm = (sim: SimApi, self: Unit): boolean => {
    if (counter(self)) return false
    sim.addBuff(self, { id: ARMOR, name: 'War Armor', mods: [], stacks, maxStacks: stacks, turns: Infinity, sourceId: self.id })
    if (!self.buffs.some(b => b.id === MIT)) {
      sim.addBuff(self, { id: MIT, name: `War Armor (DMG taken -${Math.round(dmgReduction * 100)}%)`, mods: [{ stat: 'mitigation', value: dmgReduction }], turns: Infinity, sourceId: self.id })
    }
    return true
  }

  const selfDamage = (sim: SimApi, self: Unit, pct: number, why: string): void => {
    const amt = Math.max(0, Math.floor(self.maxHp * pct))
    if (amt <= 0) return
    sim.hpChange(self, -amt, 'true')
    sim.log(`${self.name} takes ${amt} Imaginary DMG (${why})`)
    if (self.hp <= 0) sim.kill(self, self)
  }

  const shatter = (sim: SimApi, self: Unit, attacker: Unit): void => {
    sim.removeBuff(self, ARMOR)
    sim.removeBuff(self, MIT)
    if (!self.buffs.some(b => b.id === BROKEN)) sim.addBuff(self, { id: BROKEN, name: 'War Armor destroyed', mods: [], turns: Infinity, sourceId: self.id })
    sim.log(`${self.name} War Armor destroyed`)
    selfDamage(sim, self, shatterPct, 'War Armor destroyed')
    sim.delay(self, delayPct)
    if (attacker.kind === 'char' && attacker.maxEnergy > 0) sim.gainEnergy(attacker, attacker.maxEnergy * energyPct)
  }

  return {
    onSpawn(sim, self) { arm(sim, self) },
    onHitTaken(sim, self, attacker) {
      const c = counter(self)
      if (c) {
        const before = c.stacks ?? stacks
        c.stacks = before - 1
        sim.log(`${self.name} War Armor ${before} -> ${c.stacks}`, { type: 'STAT_CHANGED', target: self.name, targetId: self.id, payload: { stat: 'warArmor', before, after: c.stacks } })
        if (c.stacks <= 0) shatter(sim, self, attacker)
        return
      }
      if (self.buffs.some(b => b.id === BROKEN)) selfDamage(sim, self, brokenPct, 'War Armor destroyed')
    },
    onTurnEnd(sim, self) {
      if (self.buffs.some(b => b.id === BROKEN)) sim.removeBuff(self, BROKEN)
      if (arm(sim, self)) sim.log(`${self.name} War Armor restored`)
    },
  }
}

/** Safeguard (Planeshred Claws / Nebula Devourer / Worldpurge Tail / Memory Zone Meme "Heartbreaker" /
 *  "Shell of Faded Rage" talent): while NOT Weakness-Broken the unit takes −R DMG; the moment its
 *  Weakness breaks it is action-delayed and thereafter takes +V DMG. Modelled with the shared stat
 *  machinery only — a `mitigation` buff for the intact reduction, removed on break and replaced by a
 *  `vulnAll` buff (`routeEnemyDamage`/`mitigationMult` do the rest, no private damage path).
 *
 *  Authored decisions (see TODO.md): the raw text of the Wind trio omits the numbers, and Memory
 *  Zone Meme "Heartbreaker" states 60%/75%/50% — those are the defaults. The transition is
 *  once-per-battle (guarded by the runtime flag) so a re-Break on an exo bar does not re-apply it. */
export interface SafeguardOpts {
  reduction?: number
  delayPct?: number
  vuln?: number
}

const SAFEGUARD_MIT = 'safeguardMit'
const SAFEGUARD_BROKEN = 'safeguardBroken'

export function safeguard(opt: SafeguardOpts = {}): EnemyPassive {
  const reduction = opt.reduction ?? 0.60
  const delayPct = opt.delayPct ?? 0.75
  const vuln = opt.vuln ?? 0.50
  return {
    onSpawn(sim, self) {
      sim.addBuff(self, { id: SAFEGUARD_MIT, name: `Safeguard (DMG taken -${Math.round(reduction * 100)}%)`, mods: [{ stat: 'mitigation', value: reduction }], turns: Infinity, sourceId: self.id })
      sim.log(`${self.name} enters the Safeguard state`)
    },
    onBreak(sim, self) {
      if (sim.rt(self).safeguardBroken) return
      sim.rt(self).safeguardBroken = true
      sim.removeBuff(self, SAFEGUARD_MIT)
      sim.addBuff(self, { id: SAFEGUARD_BROKEN, name: `Safeguard broken (DMG taken +${Math.round(vuln * 100)}%)`, mods: [{ stat: 'vulnAll', value: vuln }], turns: Infinity, sourceId: self.id })
      sim.delay(self, delayPct)
      sim.log(`${self.name} Safeguard shatters — delayed ${Math.round(delayPct * 100)}%, now takes +${Math.round(vuln * 100)}% DMG`)
    },
  }
}

/** Moon Rage (Wolftrooper pack / Howling Casket / Borisin Warhead: Hoolay talent "Lupine Maw").
 *  All "Moon Rage-capable" allies share one Bloodlust counter: after a capable ally acts, every
 *  capable ally gains +1 Bloodlust. At the threshold (canon 6) the whole pack enters Moon Rage
 *  (SPD up); a countdown then dispels it pack-wide, as does an individual unit's Weakness Break.
 *  Modelled with the shared stat/buff machinery only — no private damage path.
 *
 *  Authored decisions (see TODO.md): the data omits the Moon Rage SPD value and the countdown's
 *  length → SPD +20% and a 2-own-turn timer. The countdown entity on the Action Order is
 *  approximated by each raging unit ticking its own timer (the first to elapse clears the pack);
 *  Bloodlust is fed only by capable allies' turns (a non-capable ally's attack does not count) and
 *  resets to 0 when the pack rages. */
export interface MoonRageOpts {
  threshold?: number
  spdPct?: number
  turns?: number
}

export const MOON_RAGE = 'moonRage'
const BLOODLUST = 'bloodlust'
const MOON_RAGE_CAPABLE = 'moonRageCapable'

export function moonRage(opt: MoonRageOpts = {}): EnemyPassive {
  const threshold = opt.threshold ?? 6
  const spdPct = opt.spdPct ?? 0.20
  const turns = opt.turns ?? 2

  const capable = (sim: SimApi, self: Unit): Unit[] =>
    sim.units().filter(u => u.side === self.side && !u.dead && sim.rt(u)[MOON_RAGE_CAPABLE] === true)

  return {
    onSpawn(sim, self) {
      sim.rt(self)[MOON_RAGE_CAPABLE] = true
      if (sim.rt(self)[BLOODLUST] === undefined) sim.rt(self)[BLOODLUST] = 0
    },
    onTurnEnd(sim, self) {
      const pack = capable(sim, self)
      for (const u of pack) sim.rt(u)[BLOODLUST] = ((sim.rt(u)[BLOODLUST] as number) ?? 0) + 1
      const count = Math.max(0, ...pack.map(u => (sim.rt(u)[BLOODLUST] as number) ?? 0))
      const raging = pack.some(u => u.buffs.some(b => b.id === MOON_RAGE))
      if (count >= threshold && !raging) {
        for (const u of pack) {
          sim.rt(u)[BLOODLUST] = 0
          sim.rt(u).moonRageTurns = turns
          sim.addBuff(u, { id: MOON_RAGE, name: 'Moon Rage', mods: [{ stat: 'spdPct', value: spdPct }], turns: Infinity, sourceId: u.id })
        }
        sim.log(`Bloodlust reaches ${threshold} — the pack enters Moon Rage (+${Math.round(spdPct * 100)}% SPD)`)
      }
    },
    onTurnStart(sim, self) {
      if (!self.buffs.some(b => b.id === MOON_RAGE)) return
      const left = ((sim.rt(self).moonRageTurns as number) ?? turns) - 1
      sim.rt(self).moonRageTurns = left
      if (left > 0) return
      for (const u of capable(sim, self)) {
        if (u.buffs.some(b => b.id === MOON_RAGE)) {
          sim.removeBuff(u, MOON_RAGE)
          sim.rt(u)[BLOODLUST] = 0
        }
      }
      sim.log('Moon Rage subsides across the pack')
    },
    onBreak(sim, self) {
      if (!self.buffs.some(b => b.id === MOON_RAGE)) return
      sim.removeBuff(self, MOON_RAGE)
      sim.log(`${self.name}'s Moon Rage is dispelled by Weakness Break`)
    },
  }
}
