/**
 * §85.E3 — per-ability behavioural coverage for the abilities flagged `enemy-only` in the §85.E1
 * inventory (`docs/enemies/verification-inventory.md`).
 *
 *  `implementation-matrix.md` proves each enemy is *authored*; `mob-profiles.ts` / `profile-elites.ts`
 *  assert a SUBSET of each enemy's abilities by hand. This suite closes the measured gap: every
 *  ability listed below is launched in a real battle (production profile, no test-side wiring) and
 *  asserted to (a) actually be SELECTED by the enemy AI (`ABILITY_USED action == id`) and (b) produce
 *  the outcome its declared effect implies (buff/debuff id, DoT kind, control kind, heal/delay/
 *  advance/SP/energy by source, counter/guard state). Damage-only abilities are evidenced by their
 *  element through the shared hit pipeline (the damage math itself is pinned by the damage goldens).
 *
 *  Test linkage in the E1 report is a string heuristic; this suite is the real assertion layer.
 *  Three kinds of exception are handled explicitly, never silently:
 *    - FLEE_ONLY   : a no-op "wait/escape" ability whose only observable outcome is the flee path
 *                    (`fled` state / FLEE event); it never reaches ABILITY_USED.
 *    - STATE_GATED : reachable only once the enemy's own state machine applies its gate buff
 *                    (e.g. `banacademic_classroom`); needs more cycles to reach the gate.
 *    - KNOWN_GAP   : declared in the profile but never referenced by the behavior's AI pattern, so
 *                    it can never be selected. Pinned here (and in TODO.md) so fixing the content
 *                    flips the case instead of passing silently.
 */
import { run, raw, all, type Ctx } from '../../_helpers/battle'
import type { EnemySpec } from '../../../src/core/battle'
import { BOSS_BEHAVIORS } from '../../../src/core/enemy/profiles'
import { MOB_BEHAVIORS } from '../../../src/core/enemy/mob-profiles'
import type { EnemyEffect } from '../../../src/core/enemy/ability'
import { enemyCounterOf, counterFiredSeq } from '../../../src/core/enemy/counter'

/** every ability flagged `enemy-only` by `src/core/enemy/inventory-report.ts` (E1) */
const GAP: Array<{ enemy: string; id: string }> = [
  { enemy: "Abundance Sprite: Golden Hound", id: "goldenhound_horngore" },
  { enemy: "Abundant Ebon Deer", id: "deer_engender" },
  { enemy: "Abundant Ebon Deer", id: "deer_lastspring" },
  { enemy: "Abundant Ebon Deer", id: "deer_retaliation" },
  { enemy: "Abundant Ebon Deer", id: "deer_sheath" },
  { enemy: "Aggressive Reading Material", id: "reading_readordie" },
  { enemy: "\"All or Nothing: Double Fortune\"", id: "aon_df_wait" },
  { enemy: "Anti-Creator, Hatred Inundate", id: "anticreator_resist" },
  { enemy: "Antibaryon", id: "antibaryon_obliterate" },
  { enemy: "Automaton Hound", id: "hound_heal" },
  { enemy: "Automaton Hound", id: "hound_strike" },
  { enemy: "Baryon", id: "baryon_obliterate" },
  { enemy: "Black Tide's Corroded Axe", id: "corrodedaxe_wrathful" },
  { enemy: "Cacophonic Conductor", id: "caco_afflitto" },
  { enemy: "Cacophonic Conductor", id: "caco_phonation" },
  { enemy: "Cacophonic Conductor", id: "caco_variation" },
  { enemy: "Cocolia", id: "cocolia_cascade" },
  { enemy: "Cocolia", id: "cocolia_hoarfrost" },
  { enemy: "Cocolia, Mother of Deception", id: "cocoliaM_prelude" },
  { enemy: "Cocolia, Mother of Deception", id: "cocoliaM_reverb" },
  { enemy: "Commerce Trotter", id: "commerce_basic" },
  { enemy: "Conquer or Be Conquered", id: "cobc_idle" },
  { enemy: "Daring Diceroller", id: "dicer_goallin" },
  { enemy: "Dawn's Left Hand", id: "dawn_hammer" },
  { enemy: "Daythunder Raven", id: "raven_discharge" },
  { enemy: "Doomsday Beast", id: "doomsday_toughcuts" },
  { enemy: "Dreamjolt Troupe's Bubble Hound", id: "bubblehound_invite" },
  { enemy: "Dreamjolt Troupe's Fortune Seller", id: "fortune_lottery" },
  { enemy: "Echo of Faded Dreams", id: "echofaded_afflitto" },
  { enemy: "First Genius, Entelechy, Zandar", id: "zandar_antinomy" },
  { enemy: "First Genius, Entelechy, Zandar", id: "zandar_inference" },
  { enemy: "Flamespawn", id: "flamespawn_distract" },
  { enemy: "Frostspawn", id: "frostspawn_distract" },
  { enemy: "Fulminating Wolflord", id: "wolflord_going_solo" },
  { enemy: "Gepard", id: "gepard_garrison" },
  { enemy: "Grunt: Field Personnel", id: "grunt_field_clockin" },
  { enemy: "Guide of Withering and Decay", id: "guide_bitterness" },
  { enemy: "Harbinger of Death: Swarm Nightmare", id: "swarm_primal" },
  { enemy: "Hellcharred Shadow General", id: "shadow_binds" },
  { enemy: "Imaginary Weaver", id: "weaver_carolbeam" },
  { enemy: "Imaginary Weaver", id: "weaver_carolburst" },
  { enemy: "Imaginary Weaver", id: "weaver_reverberating" },
  { enemy: "Imprisoned Mythos", id: "mythos_curse" },
  { enemy: "Imprisoned Mythos", id: "mythos_echoes" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad", id: "asat_ballgame" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad", id: "asat_nihility" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad", id: "asat_triple" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad: \"Decay\"", id: "decay_ballgame" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad: \"Decay\"", id: "decay_nihility" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad: \"Decay\"", id: "decay_triple" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad: \"Existence\"", id: "exist_nihility" },
  { enemy: "Lord of Saṃvartasthāyi, Asat Pramad: \"Existence\"", id: "exist_triple" },
  { enemy: "Lordly Trashcan", id: "trashcan_trials" },
  { enemy: "Maddened Feixiao", id: "feixiao_binds" },
  { enemy: "Magical Girl Troupe (Enemy)", id: "mg_dayfall" },
  { enemy: "Manipulated Logos", id: "logos_defiance" },
  { enemy: "Manipulated Logos", id: "logos_eradicate" },
  { enemy: "Memory Zone Meme \"Allseer\"", id: "allseer_glare" },
  { enemy: "Memory Zone Meme \"Heartbreaker\"", id: "heartbreaker_deviation" },
  { enemy: "Mirage Fizzle Kid", id: "miragekid_rumination" },
  { enemy: "Nebula Devourer", id: "devourer_nebula" },
  { enemy: "Opportunistic Provocateur", id: "prov_nonliving" },
  { enemy: "Opportunistic Provocateur", id: "prov_writhe" },
  { enemy: "Phantylia the Undying", id: "phantylia_kalpa" },
  { enemy: "Planeshred Claws", id: "claws_plane_shred" },
  { enemy: "Pollux, Netherwing Husk, Ferry of Souls", id: "pollux_bitterness" },
  { enemy: "Sequence Trotter", id: "trotter_scared" },
  { enemy: "Servant of Tides", id: "servant_undine" },
  { enemy: "@SparxiConOfficial", id: "sparxi_promo" },
  { enemy: "\"Speartip\"", id: "speartip_knight" },
  { enemy: "\"Spirithief\" Bartholos", id: "barth_pun" },
  { enemy: "Sublime, Radiant, Avatar of the Sky", id: "sublime_discharge" },
  { enemy: "Sublime, Radiant, Avatar of the Sky", id: "sublime_exhalation" },
  { enemy: "Sublime, Radiant, Avatar of the Sky", id: "sublime_illumination" },
  { enemy: "Sublime, Radiant, Avatar of the Sky", id: "sublime_splendor" },
  { enemy: "Sublime, Radiant, Avatar of the Sky", id: "sublime_thunderclap" },
  { enemy: "Ten Stonehearts: Aventurine of Stratagems", id: "avent_loser" },
  { enemy: "Ten Stonehearts: Aventurine of Stratagems", id: "avent_winner" },
  { enemy: "The Giver, Master of Legions, Lance of Fury", id: "giver_woe" },
  { enemy: "Trot Prime", id: "trotter_escaped" },
  { enemy: "Trot Tri", id: "trotter_scared" },
  { enemy: "Trotter of Abundance", id: "trotter_scared" },
  { enemy: "Trotter of Destruction", id: "trotter_scared" },
  { enemy: "Trotter of Preservation", id: "trotter_scared" },
  { enemy: "Twig of Glorious Blooms", id: "twigblooms_lastspring" },
  { enemy: "Twig of Marple Leaf", id: "marple_retaliation" },
  { enemy: "Unwaning Ageless Immortal", id: "immortal_sheath" },
  { enemy: "Vagrant", id: "vagrant_shovel" },
  { enemy: "Warp Trotter", id: "trotter_scared" },
  { enemy: "Wonder Forest's Banacademic Office Staff", id: "staff_charge" },
  { enemy: "Wonder Forest's Banacademic Office Staff", id: "staff_demerits" },
  { enemy: "Wonder Forest's Banacademic Office Staff", id: "staff_grades" },
  { enemy: "Wonder Forest's Banacademic Office Staff", id: "staff_sitdown" },
]

/** no-op "wait/escape" abilities: the observable outcome is the flee path, not ABILITY_USED */
const FLEE_ONLY = new Set(['aon_df_wait', 'trotter_escaped'])
/** abilities reachable only after the enemy's own state machine opens its gate (need more cycles) */
const STATE_GATED = new Set(['staff_demerits', 'staff_sitdown'])
/** declared but never referenced by the behavior's AI pattern — cannot be selected (documented gap) */
const KNOWN_GAP = new Set(['deer_lastspring', 'anticreator_resist', 'prov_nonliving', 'phantylia_kalpa'])

const behaviors: Record<string, { abilities: Array<{ id: string; effects: EnemyEffect[] }>; ai?: { pattern?: string[] } }> =
  { ...BOSS_BEHAVIORS, ...MOB_BEHAVIORS } as never

const foe = (name: string, count = 1): EnemySpec =>
  ({ name, count, hp: 5_000_000, spd: 220, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60 })
const fight = (enemy: string, cycles: number, count = 1): Ctx =>
  run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: foe(enemy, count), cycles })

const enemyOf = (c: Ctx) => c.sim.roster.find(u => u.side === 'enemy')!

/** did the enemy SELECT this ability? action id is unique, so this is collision-safe (a hero can
 *  share the enemy's display name — e.g. the enemy "Gepard" — without a false positive). */
const ranAbility = (c: Ctx, id: string): boolean =>
  all(c, 'ABILITY_USED').some(n => String(n.payload?.action) === id)

/** an effect with `chance < 1` (or a probabilistic DoT) may legitimately not land in one seed: the
 *  usage assertion stands in for it, and the roll/landing is covered by the control/dot goldens. */
const probabilistic = (e: EnemyEffect): boolean => {
  const ch = (e as { chance?: number }).chance
  return typeof ch === 'number' && ch < 1
}

/** evidence that the ability's declared effect actually fired (element-level for damage) */
function evidence(c: Ctx, enemy: string, effects: EnemyEffect[], used: boolean): { ok: boolean; why: string } {
  const u = enemyOf(c)
  // source-side checks match the actual ENEMY units by roster name, not the raw profile name:
  // a multi-enemy fight suffixes names ("Doomsday Beast #1"), and a hero can share the enemy's
  // display name (ally "Gepard" vs enemy "Gepard") — roster+side resolves both.
  const eNames = new Set(c.sim.roster.filter(x => x.side === 'enemy').map(x => x.name))
  const src = (t: string, pred: (n: { source?: string; target?: string; element?: string; payload: Record<string, unknown> }) => boolean) => all(c, t).some(pred as never)
  const en = (n: { source?: string }) => eNames.has(n.source ?? '')
  for (const e of effects) {
    if (probabilistic(e)) continue
    switch (e.op) {
      case 'attack':
      case 'blast':
      case 'aoe':
      case 'bounce': {
        const el = (e as { elem?: string }).elem
        const hit = el
          ? src('HIT_START', n => n.element === el && en(n))
          : src('DAMAGE_DEALT', n => en(n))
        if (!hit) return { ok: false, why: `${e.op} ${el ?? ''}: no ${el ? 'HIT_START element' : 'DAMAGE_DEALT'} by ${enemy}` }
        break
      }
      case 'buff':
      case 'debuff': {
        const id = e.buff.id
        if (!src('BUFF_APPLIED', n => n.payload?.id === id) && !src('DEBUFF_APPLIED', n => n.payload?.id === id))
          return { ok: false, why: `${e.op} ${id} never applied` }
        break
      }
      case 'dot': {
        const kind = (e as { kind?: string }).kind
        if (!src('DOT_APPLIED', n => n.payload?.kind === kind)) return { ok: false, why: `dot ${kind} never applied` }
        break
      }
      case 'control': {
        const kind = (e as { kind?: string }).kind
        if (!src('CONTROL_APPLIED', n => n.payload?.kind === kind)) return { ok: false, why: `control ${kind} never applied` }
        break
      }
      case 'heal':
        if (!src('HEAL_APPLIED', n => en(n))) return { ok: false, why: `no HEAL_APPLIED by ${enemy}` }
        break
      case 'delay':
        if (!src('ACTION_DELAY', n => en(n))) return { ok: false, why: `no ACTION_DELAY by ${enemy}` }
        break
      case 'advance':
      case 'advanceSelf':
        if (!src('ACTION_ADVANCE', n => en(n))) return { ok: false, why: `no ACTION_ADVANCE by ${enemy}` }
        break
      case 'sp':
        if (!src('SP_GAIN', n => en(n)) && !src('SP_LOSS', n => en(n)))
          return { ok: false, why: `no SP change by ${enemy}` }
        break
      case 'drainEnergyFlat':
      case 'drainEnergyPct':
        if (!src('ENERGY_LOSS', n => en(n))) return { ok: false, why: `no ENERGY_LOSS by ${enemy}` }
        break
      case 'allyEnergyPct':
        if (!src('ENERGY_GAIN', n => en(n))) return { ok: false, why: `no ENERGY_GAIN by ${enemy}` }
        break
      case 'counter':
        // armed by the arming ability (arity of the §61 primitive's firing is pinned by
        // tests/regression/enemy-counter.ts); if the state is gone it already fired ('once')
        if (!used && enemyCounterOf(u) === undefined && counterFiredSeq(u) < 0) return { ok: false, why: 'counter state never armed' }
        break
      case 'shield':
        if (!src('SHIELD_APPLIED', () => true)) return { ok: false, why: 'no SHIELD_APPLIED' }
        break
      default:
        break
    }
  }
  return { ok: true, why: 'effect observed' }
}

export default () => {
  const cases: ReturnType<typeof raw>[] = []
  const byEnemy = new Map<string, string[]>()
  for (const g of GAP) byEnemy.set(g.enemy, [...(byEnemy.get(g.enemy) ?? []), g.id])

  for (const [enemy, ids] of byEnemy) {
    const gated = ids.some(id => STATE_GATED.has(id))
    // abilities that buff/advance the enemy's OWN other allies need a second enemy to observe
    const needsAlly = (behaviors[enemy]?.abilities ?? []).some(a =>
      a.effects.some((e: EnemyEffect) => (e as { to?: string }).to === 'alliesOther'))
    const c = fight(enemy, gated ? 20 : 8, needsAlly ? 2 : 1)
    for (const id of ids) {
      const effects = behaviors[enemy]?.abilities.find(a => a.id === id)?.effects ?? []
      const label = `E3 ${enemy} :: ${id}`
      if (KNOWN_GAP.has(id)) {
        const pattern = behaviors[enemy]?.ai?.pattern ?? []
        cases.push(raw(`${label} — KNOWN GAP: declared but NOT in AI pattern (unreachable)`,
          !pattern.includes(id), `pattern=[${pattern.join(',')}]`))
        continue
      }
      if (FLEE_ONLY.has(id)) {
        const fled = enemyOf(c).fled === true || all(c, 'FLEE').length > 0
        cases.push(raw(`${label} — FLEE_ONLY: escapes via the flee path (no ABILITY_USED)`, fled, `fled=${enemyOf(c).fled} FLEE=${all(c, 'FLEE').length}`))
        continue
      }
      const used = ranAbility(c, id)
      const ev = evidence(c, enemy, effects, used)
      cases.push(raw(`${label} — selected + effect observed`, used && ev.ok, `used=${used} effect=${ev.why}`))
    }
    // invariants per enemy run
    cases.push(raw(`E3 ${enemy} — no invariant violations`, c.sim.logger.verify().length === 0, c.sim.logger.verify().join('; ')))
  }
  return cases
}
