import { PatternAI, type EnemyBehavior } from './ai'
import { warArmor, safeguard, moonRage, MOON_RAGE } from './passive'
import { BANACADEMIC_CLASSROOM, BANACADEMIC_OFFCLASS, banacademicDisrupt } from './mob-profiles'
import type { Elem } from '../entities/Unit'

/** §54 — production enemy behaviors (authored data), keyed by the enemy's exact display name.
 *
 *  A behavior binds an ability set to an AI (§54) and, optionally, a phase machine (§56). The
 *  registry in `behaviors.ts` seeds from this map, so a real enemy behaves through the declarative
 *  pipeline with no test-side wiring. Values come from `hsr-data/enemies.json` (skills + notes):
 *  only mechanics the engine can express are modelled — anything left out is a known deviation
 *  recorded in `TODO.md`.
 *
 *  Dark Sun Gryphon (Elite, Wind, 160 Toughness):
 *    - Blacklight Emission — AoE, 300% ATK Wind (its sole immediate attack).
 *    - Carol of Heat Death — AoE, 450% ATK Wind, telegraphed by "Prophecy of the Eclipse"
 *      (modelled as the engine `cast` charge on this ability — the telegraph is a separate
 *      canon ability but the engine charges the released ability itself).
 *
 *  Known deviations (see TODO.md):
 *    - The "Corrosion" sub-effect (post-attack self HP-restore, 20% per target hit — mechanics doc
 *      `Corrosion.md`) is not modelled; only each ability's damage portion.
 *    - The opener is not fixed by the data; the rotation leads with Blacklight Emission (its only
 *      non-charged ability).
 *
 *  Aurumaton Spectral Envoy (Elite, Physical, 100 Toughness):
 *    - Adjudicate — Single Target, 300% ATK Physical.
 *    - Subdue — Single Target, 360% ATK Physical + 70% Base Chance Reverberation (2 Turns).
 *    - Revert Yin and Yang — AoE, 300% ATK Physical + 35% Base Chance Reverberation (2 Turns).
 *
 *  Known deviations (see TODO.md):
 *    - Reverberation is applied as a debuff marker only. Its canon follow-up — a Reverberated target
 *      that *receives an attack* enters Strong Reverberation (70% Action Delay, 1 Turn, cannot act)
 *      and loses Reverberation — is not modelled: the enemy op-set has no "on-target-attacked"
 *      reaction trigger.
 *    - Soul Warrant (Talent): lock-on to a Strong-Reverberated target and use "Heaven's Fall" next
 *      action — not modelled; "Heaven's Fall" is absent from the skill list (no damage value), and
 *      the lock-on trigger does not exist.
 *    - gameplayNotes subset targeting (attempt Reverberation on only 2, or 1, non-Reverberated
 *      targets) is not modelled — the debuff hits the ability's resolved target(s).
 *    - The rotation is not fixed by the data; the PatternAI order follows the skill declaration
 *      order.
 *
 *  Savage God, Mad King, Incarnation of Strife (Boss, Imaginary, 240 Toughness):
 *    - Two in-game phases, each with its own attack set (enemies.json lists the skills twice,
 *      once per phase). Phase 1: Lightning Spear 240% single, Hewing of the River of Souls 360%
 *      single, Unceasing Flames of War 280% AoE, Sky-Piercing Lance 120% Bounce ×5. Phase 2:
 *      Worldsplitting Spine 220%/180% Blast, Survivors Unto Dead Waters 400% single, Pyre of
 *      High Graves 320% AoE, Ruination of Night and Light 120% Bounce ×10 — all Imaginary.
 *    - The phase transition swaps the usable ability set through §56 `availableAbilities`.
 *
 *  Known deviations (see TODO.md):
 *    - The phase trigger is not published by any canonical source (local data has no phase field;
 *      the DBs list Phase 1/2 with identical stats). It is encoded as the universal HSR rule —
 *      the single HP pool falling below 50% — recorded as an authored decision.
 *    - The War Armor talent (Polis Protector) is modelled via the §57 `passive` (see `passive.ts`):
 *      7 stacks, −10% DMG taken, one stack lost per attack, shatter at 0 (10% Max HP Imaginary
 *      self-damage + 10% delay + 15% Max Energy to the attacker), +1% Max HP per further attack,
 *      restored to full at the end of the unit's own turn. "per attack" and the self-damage kind
 *      are authored decisions (see `passive.ts` / TODO.md).
 *    - Calamity Eternal / "Glory" / "Titanic Corpus" are not modelled — the enemy op-set has no
 *      glory-accumulation state and Valorous Death publishes no trigger or damage value.
 *    - "Calamity Eternal" — Valorous Death's trigger — has no skill entry or damage value anywhere
 *      in hsr-data/enemies.json; modelling it would require inventing numbers.
 *
 *  Daybreak Squadron (Elite quartet — Azurewing / Blazeweaver / Cinderborne / Dawnlance;
 *  Quantum / Fire / Physical / Imaginary, 120 Toughness): one template, four elements. Daybreak
 *  Blade 400% single, Daybreak Flywheel 600%+300% Blast, Daybreak Will raises "Daybreak Forcefield"
 *  (CC-immune + Toughness-unreducible, via the `guard` op) and gates the rotation to "Shadow Dance
 *  of the Daybreak Blade" 800% single, then Daybreak Dispersal tears the field down and
 *  self-inflicts "Disheartened" (DMG taken +30% via `vulnAll`, element RES −40% via `resRed:<elem>`,
 *  2 Turns).
 *
 *  Known deviations (see TODO.md):
 *    - The number of Shadow Dances before Daybreak Dispersal and the rotation order are not
 *      published by the data → authored (two dances, then Dispersal). "Daybreak Dispersal" is
 *      modelled as a self-debuff because the data assigns the Disheartened penalty to this unit
 *      itself.
 *
 *  Banacademic Office's Charmony BananAdvisor (Elite, Fire, 120 Toughness):
 *    - Runs the shared §54 Banacademic Classroom / Off-Class channel state machine (see the advisor
 *      mobs in `mob-profiles.ts`): in the Classroom state it uses "Physical Banashment! Take This!"
 *      (Blast Fire 260%/200% + 80% Burn 50% ATK ×3 Turns, Max 3 Stacks), in the Off-Class state
 *      "Monkey Yes! Holiday Activities!" (grants the player team ATK +10% ×2 Stacks, 2 Turns), and
 *      "Change Banasyllabus" returns Off → Classroom. "Disrupt Banasyllabus" (its `onHitTaken`) flips
 *      Classroom → Off-Class when attacked.
 *
 *  Known deviations (see TODO.md):
 *    - The "Teach Monkeys a Banalesson" Slow is applied as a 50% Base Chance −20% SPD (2 Turns)
 *      rider on the Classroom attack (a per-target `debuff` op), not a separate talent resolution.
 *    - "Tutoring" (which prevents the Classroom → Off-Class swap) and the state-change Energy gift
 *      are not modelled; the Burn rider lands only on the primary Blast target, not its neighbours.
 */
export const DAYBREAK_FORCEFIELD = 'daybreak_forcefield'
export const DAYBREAK_DISHEARTENED = 'daybreak_disheartened'

/** §54 — Daybreak Squadron template (see the header note). Shared by all four members; only the
 *  damage element differs. `Daybreak Will` raises the Forcefield marker buff and toggles this
 *  unit's `controlImmune`/`toughnessImmune` defense flags; while the field is up the rotation is
 *  gated (`require`) to Shadow Dance, then Dispersal clears the field and self-inflicts
 *  Disheartened. */
function daybreakSquadron(elem: Elem): EnemyBehavior {
  return {
    abilities: [
      { id: 'daybreak_blade', name: 'Daybreak Blade', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem }] },
      { id: 'daybreak_flywheel', name: 'Daybreak Flywheel', targetRule: 'blast', effects: [{ op: 'blast', mult: 6.0, adjMult: 3.0, elem }] },
      {
        id: 'daybreak_will', name: 'Daybreak Will', targetRule: 'self', charges: 1,
        require: { noBuff: DAYBREAK_FORCEFIELD },
        effects: [
          { op: 'buff', buff: { id: DAYBREAK_FORCEFIELD, name: 'Daybreak Forcefield', mods: [] } },
          { op: 'guard', controlImmune: true, toughnessImmune: true },
        ],
      },
      {
        id: 'daybreak_shadow_dance', name: 'Shadow Dance of the Daybreak Blade', targetRule: 'single',
        require: { buff: DAYBREAK_FORCEFIELD },
        effects: [{ op: 'attack', mult: 8.0, elem }],
      },
      {
        id: 'daybreak_dispersal', name: 'Daybreak Dispersal', targetRule: 'self', charges: 1,
        require: { buff: DAYBREAK_FORCEFIELD },
        effects: [
          { op: 'dispelSelf', id: DAYBREAK_FORCEFIELD },
          { op: 'guard', controlImmune: false, toughnessImmune: false },
          {
            op: 'buff', to: 'self',
            buff: {
              id: DAYBREAK_DISHEARTENED, name: 'Disheartened', debuff: true, turns: 2,
              mods: [{ stat: 'vulnAll', value: 0.30 }, { stat: `resRed:${elem}`, value: 0.40 }],
            },
          },
        ],
      },
    ],
    ai: new PatternAI([
      'daybreak_will', 'daybreak_shadow_dance', 'daybreak_shadow_dance', 'daybreak_dispersal',
      'daybreak_blade', 'daybreak_flywheel',
    ]),
  }
}

export const BOSS_BEHAVIORS: Record<string, EnemyBehavior> = {
  'Dark Sun Gryphon': {
    abilities: [
      { id: 'gryphon_blacklight', name: 'Blacklight Emission', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Wind' }] },
      { id: 'gryphon_carol', name: 'Carol of Heat Death', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.5, elem: 'Wind' }] },
    ],
    ai: new PatternAI(['gryphon_blacklight', 'gryphon_carol']),
  },
  'Aurumaton Spectral Envoy': {
    abilities: [
      { id: 'envoy_adjudicate', name: 'Adjudicate', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      {
        id: 'envoy_subdue', name: 'Subdue', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.6, elem: 'Physical' },
          { op: 'debuff', chance: 0.70, buff: { id: 'reverberation', name: 'Reverberation', mods: [], turns: 2 } },
        ],
      },
      {
        id: 'envoy_yin_yang', name: 'Revert Yin and Yang', targetRule: 'aoe',
        effects: [
          { op: 'aoe', mult: 3.0, elem: 'Physical' },
          { op: 'debuff', chance: 0.35, buff: { id: 'reverberation', name: 'Reverberation', mods: [], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['envoy_adjudicate', 'envoy_subdue', 'envoy_yin_yang']),
  },
  'Savage God, Mad King, Incarnation of Strife': {
    abilities: [
      { id: 'savage_lightning_spear', name: 'Lightning Spear of the Firmament', targetRule: 'single', effects: [{ op: 'attack', mult: 2.4, elem: 'Imaginary' }] },
      { id: 'savage_hewing', name: 'Hewing of the River of Souls', targetRule: 'single', effects: [{ op: 'attack', mult: 3.6, elem: 'Imaginary' }] },
      { id: 'savage_unceasing_flames', name: 'Unceasing Flames of War', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.8, elem: 'Imaginary' }] },
      { id: 'savage_sky_piercing_lance', name: 'Sky-Piercing Lance', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.2, hits: 5, elem: 'Imaginary' }] },
      { id: 'savage_worldsplitting_spine', name: 'Worldsplitting Spine', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.2, adjMult: 1.8, elem: 'Imaginary' }] },
      { id: 'savage_survivors', name: 'Survivors Unto Dead Waters', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'savage_pyre', name: 'Pyre of High Graves', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.2, elem: 'Imaginary' }] },
      { id: 'savage_ruination', name: 'Ruination of Night and Light', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.2, hits: 10, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI([
      'savage_lightning_spear', 'savage_hewing', 'savage_unceasing_flames', 'savage_sky_piercing_lance',
      'savage_worldsplitting_spine', 'savage_survivors', 'savage_pyre', 'savage_ruination',
    ]),
    phases: [
      {
        id: 'savage_p1', name: 'Phase 1',
        availableAbilities: ['savage_lightning_spear', 'savage_hewing', 'savage_unceasing_flames', 'savage_sky_piercing_lance'],
      },
      {
        id: 'savage_p2', name: 'Phase 2', start: { hpBelow: 0.5 },
        availableAbilities: ['savage_worldsplitting_spine', 'savage_survivors', 'savage_pyre', 'savage_ruination'],
      },
    ],
    passive: warArmor(),
  },
  'Daybreak Squadron: Azurewing': daybreakSquadron('Quantum'),
  'Daybreak Squadron: Blazeweaver': daybreakSquadron('Fire'),
  'Daybreak Squadron: Cinderborne': daybreakSquadron('Physical'),
  'Daybreak Squadron: Dawnlance': daybreakSquadron('Imaginary'),
  "Banacademic Office's Charmony BananAdvisor": {
    abilities: [
      {
        id: 'charm_banashment', name: 'Physical Banashment! Take This!', targetRule: 'blast',
        require: { buff: BANACADEMIC_CLASSROOM },
        effects: [
          { op: 'blast', mult: 2.6, adjMult: 2.0, elem: 'Fire' },
          { op: 'dot', kind: 'Burn', mult: 0.5, turns: 3, chance: 0.8 },
          { op: 'debuff', chance: 0.5, buff: { id: 'banalesson_slow', name: 'Slow', mods: [{ stat: 'spdDown', value: 0.2 }], turns: 2 } },
        ],
      },
      {
        id: 'charm_holiday', name: 'Monkey Yes! Holiday Activities!', targetRule: 'aoe',
        require: { buff: BANACADEMIC_OFFCLASS },
        effects: [{ op: 'buff', to: 'targets', buff: { id: 'holiday_atkup', name: 'Holiday ATK Up', mods: [{ stat: 'atkPct', value: 0.1 }], turns: 2, stacks: 2, maxStacks: 2 } }],
      },
      { id: 'charm_change', name: 'Change Banasyllabus', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'dispelSelf', id: BANACADEMIC_OFFCLASS }, { op: 'buff', to: 'self', buff: { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['charm_holiday', 'charm_change', 'charm_banashment']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity, sourceId: self.id }) },
      onHitTaken(sim, self) { banacademicDisrupt(sim, self) },
    },
  },
  // Memory Zone Meme "Shell of Faded Rage" (Elite, Quantum, 120 Toughness). Faction "Memory Zone
  // Meme" shares the §57/§54 "Disembodied Shell" Safeguard with Heartbreaker and the wind trio (the
  // canonical 60% / 75% delay / +50% taken). Rotation: Grudging Courtesy (single 300% Quantum + 1
  // Obscure Blaze stack), Roar of Furious Thunder (self +3 stacks), Tide of Enduring Grudges (AoE 180%
  // Quantum + 1 stack). Deviation: "Obscure Blaze" fuels the un-modelled Exo-Toughness mechanic → it
  // is a stackable marker buff (max stack count authored 5; the data gives none).
  'Memory Zone Meme "Shell of Faded Rage"': {
    abilities: [
      {
        id: 'shell_courtesy', name: 'Grudging Courtesy', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Quantum' },
          { op: 'buff', to: 'self', buff: { id: 'shell_obscure', name: 'Obscure Blaze', mods: [], turns: Infinity, maxStacks: 5 } },
        ],
      },
      {
        id: 'shell_roar', name: 'Roar of Furious Thunder', targetRule: 'self',
        effects: [
          { op: 'buff', to: 'self', buff: { id: 'shell_obscure', name: 'Obscure Blaze', mods: [], turns: Infinity, maxStacks: 5 } },
          { op: 'buff', to: 'self', buff: { id: 'shell_obscure', name: 'Obscure Blaze', mods: [], turns: Infinity, maxStacks: 5 } },
          { op: 'buff', to: 'self', buff: { id: 'shell_obscure', name: 'Obscure Blaze', mods: [], turns: Infinity, maxStacks: 5 } },
        ],
      },
      {
        id: 'shell_tide', name: 'Tide of Enduring Grudges', targetRule: 'aoe',
        effects: [
          { op: 'aoe', mult: 1.8, elem: 'Quantum' },
          { op: 'buff', to: 'self', buff: { id: 'shell_obscure', name: 'Obscure Blaze', mods: [], turns: Infinity, maxStacks: 5 } },
        ],
      },
    ],
    ai: new PatternAI(['shell_courtesy', 'shell_roar', 'shell_tide']),
    passive: safeguard(),
  },

  // ---- Batch 21 — elite rank, part 1 (striker / DoT / charge families) ------------------------
  // Celestial Cherub (Elite, Lightning): Thunder-Shock single 350%; Punishing Bolts blast 300%.
  'Celestial Cherub': {
    abilities: [
      { id: 'cherub_thunder', name: 'Thunder-Shock', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] },
      { id: 'cherub_bolts', name: 'Punishing Bolts', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['cherub_thunder', 'cherub_bolts']),
  },
  // Celestial Maiden (Elite, Wind): Rite of Great Arbor Metamorphosis — bouncing Wind 100% + Wind
  // Shear (100%×3t, max 5); Guiding Vulturnus — blast Wind 150% + Wind Shear; Arboreal Thorns —
  // single Wind + Wind Shear (damage value absent in data → authored 200%). The bounce count is not
  // fixed by the data → authored 4. The Wind-Shear rider lands on the resolved primary target.
  'Celestial Maiden': {
    abilities: [
      { id: 'maiden_rite', name: 'Rite of Great Arbor Metamorphosis', targetRule: 'single', effects: [{ op: 'bounce', mult: 1.0, hits: 4, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 3, chance: 1.0 }] },
      { id: 'maiden_vulturnus', name: 'Guiding Vulturnus', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.5, adjMult: 1.5, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 3, chance: 1.0 }] },
      { id: 'maiden_thorns', name: 'Arboreal Thorns', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 3, chance: 1.0 }] },
    ],
    ai: new PatternAI(['maiden_rite', 'maiden_vulturnus', 'maiden_thorns']),
  },
  // The Ascended (Elite, Wind): the Arbor family as Celestial Maiden (Wind Shear 70%×3t, max 5);
  // Rite of Subduing Prana charges (Japa) then releases Black Prana's Snare (AoE Wind + incoming-
  // healing down). Bounce count authored 4; the Wind-Shear rider lands on the primary target.
  'The Ascended': {
    abilities: [
      { id: 'ascended_rite', name: 'Rite of Great Arbor Metamorphosis', targetRule: 'single', effects: [{ op: 'bounce', mult: 1.0, hits: 4, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.7, turns: 3, chance: 1.0 }] },
      { id: 'ascended_vulturnus', name: 'Guiding Vulturnus', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.0, adjMult: 2.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.7, turns: 3, chance: 1.0 }] },
      { id: 'ascended_thorns', name: 'Arboreal Thorns', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.7, turns: 3, chance: 1.0 }] },
      { id: 'ascended_prana', name: "Black Prana's Snare", targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Wind' }, { op: 'debuff', chance: 1.0, buff: { id: 'ascended_inheal', name: 'Incoming Healing Down', mods: [{ stat: 'inHeal', value: -0.4 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['ascended_rite', 'ascended_vulturnus', 'ascended_thorns', 'ascended_prana']),
  },
  // Decaying Shadow (Elite, Imaginary): Fleeting Gilded Spikes single 300%; Fleeting Punishment
  // single 500%; Binding of the Golden Age charges (Gauge Recollection marker). Passive Fleeting
  // Veil — flat 10% DMG reduction. Deviation: the 20% Imprisonment counter-attack and the
  // stack-drain charge-interrupt are not modelled.
  'Decaying Shadow': {
    abilities: [
      { id: 'decay_spikes', name: 'Fleeting Gilded Spikes', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'decay_punishment', name: 'Fleeting Punishment', targetRule: 'single', effects: [{ op: 'attack', mult: 5.0, elem: 'Imaginary' }] },
      { id: 'decay_binding', name: 'Binding of the Golden Age', targetRule: 'self', cast: 1, effects: [{ op: 'buff', to: 'self', buff: { id: 'decay_gauge', name: 'Gauge Recollection', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['decay_spikes', 'decay_punishment', 'decay_binding']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: 'decay_veil', name: 'Fleeting Veil', mods: [{ stat: 'mitigation', value: 0.10 }], turns: Infinity, sourceId: self.id }) },
    },
  },
  // Stormbringer (Elite, Wind): Watchful Meteor single 300% + Wind Shear (75%×2t, max 5); Wind
  // Walker blast 220% + Wind Shear; Wind-Twisting Crossbow charges, then Windfall Storm (AoE Wind).
  // Deviation: the Storm Cyclone ATK-up-on-Wind-Sheared passive is not modelled.
  Stormbringer: {
    abilities: [
      { id: 'storm_meteor', name: 'Watchful Meteor', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.75, turns: 2, chance: 1.0 }] },
      { id: 'storm_walker', name: 'Wind Walker', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.2, adjMult: 2.2, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.75, turns: 2, chance: 1.0 }] },
      { id: 'storm_crossbow', name: 'Windfall Storm', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Wind' }] },
    ],
    ai: new PatternAI(['storm_meteor', 'storm_walker', 'storm_crossbow']),
  },
  // Searing Prowler (Elite, Fire): Crimson Blade single 300% + Burn (50%×3t); Combustion Slash blast
  // 400%/250%; High-Temperature Operation self ATK +20% (+ SPD omitted). Deviation: the Melt
  // DMG-up-on-Burned passive is not modelled.
  'Searing Prowler': {
    abilities: [
      { id: 'sear_blade', name: 'Crimson Blade', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Fire' }, { op: 'dot', kind: 'Burn', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'sear_slash', name: 'Combustion Slash', targetRule: 'blast', effects: [{ op: 'blast', mult: 4.0, adjMult: 2.5, elem: 'Fire' }] },
      { id: 'sear_hotop', name: 'High-Temperature Operation', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'sear_atkup', name: 'ATK Up', mods: [{ stat: 'atkPct', value: 0.20 }], turns: 3 } }] },
    ],
    ai: new PatternAI(['sear_blade', 'sear_slash', 'sear_hotop']),
  },
  // Ice Out of Space (Elite, Ice): Chilling Lament single 250% (bonus vs a Frozen target →
  // deviation); Frosty Absorption enters the Freezing Point state (marker).
  'Ice Out of Space': {
    abilities: [
      { id: 'ice_lament', name: 'Chilling Lament', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Ice' }] },
      { id: 'ice_frosty', name: 'Frosty Absorption', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'ice_freezing', name: 'Freezing Point', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['ice_lament', 'ice_frosty']),
  },
  // Blaze Out of Space (Elite, Fire): Bellowing Inferno single 250% + Enkindle (Fire DoT 50%×2t,
  // modelled as Burn); Blazing Absorption enters Spontaneous Combustion (marker); Molten Fusion self
  // ATK +30%/stack (max 3, 2t).
  'Blaze Out of Space': {
    abilities: [
      { id: 'blaze_inferno', name: 'Bellowing Inferno', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Fire' }, { op: 'dot', kind: 'Burn', mult: 0.5, turns: 2, chance: 1.0 }] },
      { id: 'blaze_absorption', name: 'Blazing Absorption', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'blaze_combustion', name: 'Spontaneous Combustion', mods: [], turns: Infinity } }] },
      { id: 'blaze_molten', name: 'Molten Fusion', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'blaze_atkup', name: 'ATK Up', mods: [{ stat: 'atkPct', value: 0.30 }], turns: 2, maxStacks: 3 } }] },
    ],
    ai: new PatternAI(['blaze_inferno', 'blaze_absorption', 'blaze_molten']),
  },
  // Voidranger: Trampler (Elite, Quantum): Unreal Projection single 300%; Rule of Force single 400%;
  // War Trample blast 250%; Spiral Arrow locks on, then End of Bow (single 400%).
  'Voidranger: Trampler': {
    abilities: [
      { id: 'trampler_arrow', name: 'Spiral Arrow', targetRule: 'random', effects: [{ op: 'lockon' }] },
      { id: 'trampler_endbow', name: 'End of Bow', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Quantum' }] },
      { id: 'trampler_rule', name: 'Rule of Force', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Quantum' }] },
      { id: 'trampler_war', name: 'War Trample', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.5, elem: 'Quantum' }] },
      { id: 'trampler_projection', name: 'Unreal Projection', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['trampler_arrow', 'trampler_endbow', 'trampler_rule', 'trampler_war', 'trampler_projection']),
  },
  // Silvermane Lieutenant (Elite, Physical): Assault single 300%; Shield Reflect enters a Counter
  // (retaliates with Pierce on a single-target attack). Deviation: "Reinforcement" (summon) is not
  // modelled (no summon primitive).
  'Silvermane Lieutenant': {
    abilities: [
      { id: 'lt_assault', name: 'Assault', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'lt_reflect', name: 'Shield Reflect', targetRule: 'self', effects: [{ op: 'counter', ability: { id: 'lt_pierce', name: 'Pierce', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] } }] },
    ],
    ai: new PatternAI(['lt_assault', 'lt_reflect']),
  },
  // Abundance Sprite: Malefic Ape (Elite, Quantum): Fiery Majesty self DMG +20%/stack (max 3, 2t);
  // Simian Strike single Quantum 475%. Deviation: the Gusto resource / Wrathful Roar are not
  // modelled (the strike is not gated on a stack).
  'Abundance Sprite: Malefic Ape': {
    abilities: [
      { id: 'ape_fiery', name: 'Fiery Majesty', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'ape_dmgup', name: 'DMG Boost', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 2, maxStacks: 3 } }] },
      { id: 'ape_strike', name: 'Simian Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 4.75, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['ape_fiery', 'ape_strike']),
  },
  // Frigid Prowler (Elite, Ice): Ice Wheel Fist single 300%; Frozen Storm AoE 100% + Deep Freeze
  // (modelled as the Freeze control); Frost Crush single 300% + 50% delay. Deviation: "Summon
  // Otherling" / "Devour Otherling" are not modelled (no summon primitive).
  'Frigid Prowler': {
    abilities: [
      { id: 'frigid_fist', name: 'Ice Wheel Fist', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Ice' }] },
      { id: 'frigid_storm', name: 'Frozen Storm', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.0, elem: 'Ice' }, { op: 'control', kind: 'Freeze', chance: 1.0, turns: 1 }] },
      { id: 'frigid_crush', name: 'Frost Crush', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Ice' }, { op: 'delay', pct: 0.5 }] },
    ],
    ai: new PatternAI(['frigid_fist', 'frigid_storm', 'frigid_crush']),
  },

  // ---- Batch 22 — elite rank, part 2 (summoners / charge / support / duellists) ----------------
  // Antimatter Engine (Elite, Imaginary): Total Annihilation single 480%; Engine Boost — allies
  // (except self) ATK +60%×2t (Toughness restore → deviation); Cataclysm Precursor charges then
  // releases Impending Doom on all targets (released ability absent → authored AoE Imaginary 300%).
  // Phase-2 SPD +40% → deviation.
  'Antimatter Engine': {
    abilities: [
      { id: 'ae_annihilation', name: 'Total Annihilation', targetRule: 'single', effects: [{ op: 'attack', mult: 4.8, elem: 'Imaginary' }] },
      { id: 'ae_boost', name: 'Engine Boost', targetRule: 'self', effects: [{ op: 'buff', to: 'alliesOther', buff: { id: 'ae_enhanced', name: 'Enhanced', mods: [{ stat: 'atkPct', value: 0.60 }], turns: 2 } }] },
      { id: 'ae_precursor', name: 'Cataclysm Precursor', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['ae_precursor', 'ae_annihilation', 'ae_boost']),
  },
  // Aurumaton Gatekeeper (Elite, Imaginary): Restraint single 300%; Dread — AoE 150% + high-chance
  // Weaken (authored 10%×2t). Talent Sanction Rate / summoning Entranced Ingenium: Illumination
  // Dragonfish ×2 → deviation (no summon primitive).
  'Aurumaton Gatekeeper': {
    abilities: [
      { id: 'gatekeeper_restraint', name: 'Restraint', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'gatekeeper_dread', name: 'Dread', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Imaginary' }, { op: 'debuff', chance: 0.75, buff: { id: 'gatekeeper_weaken', name: 'Weaken', mods: [{ stat: 'weaken', value: 0.10 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['gatekeeper_dread', 'gatekeeper_restraint']),
  },
  // Automaton Direwolf (Elite, Physical): Lock On Target — pins a random character (the follow-up
  // "Felling Order" is absent → deviation); Disintegration Order / Dismantle — single 250% + high
  // chance 1 Bleed stack (authored 20% Max-HP×2t).
  'Automaton Direwolf': {
    abilities: [
      { id: 'direwolf_lock', name: 'Lock On Target', targetRule: 'random', effects: [{ op: 'lockon' }] },
      { id: 'direwolf_disintegration', name: 'Disintegration Order', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }, { op: 'dot', kind: 'Bleed', fromMaxHp: 0.20, turns: 2, chance: 0.75 }] },
      { id: 'direwolf_dismantle', name: 'Dismantle', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }, { op: 'dot', kind: 'Bleed', fromMaxHp: 0.20, turns: 2, chance: 0.75 }] },
    ],
    ai: new PatternAI(['direwolf_lock', 'direwolf_disintegration', 'direwolf_dismantle']),
  },
  // Automaton Grizzly (Elite, Physical): Destruction Order single 300%; Ram single 200%; Overcombust
  // Order charges then releases Purge Order on all targets (released ability absent → authored AoE
  // 300%). Deviation: Detonation Order (summon Automaton Spider ×2) and Enrage Order (Taunt all).
  'Automaton Grizzly': {
    abilities: [
      { id: 'grizzly_destruction', name: 'Destruction Order', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'grizzly_ram', name: 'Ram', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }] },
      { id: 'grizzly_overcombust', name: 'Overcombust Order', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['grizzly_overcombust', 'grizzly_destruction', 'grizzly_ram']),
  },
  // Canvas Peacock (Elite, Physical): The Stroke single 200%; Sweeping Hues single 200% + Paint
  // Additional DMG (100% ATK, modelled as a second hit); Dancing Splendor AoE 250% + Paint add
  // (modelled as a second AoE). Deviation: the Colorless→Color Paint state, gained Weaknesses/RES
  // down and Chromatic Threshold boosting are not modelled.
  'Canvas Peacock': {
    abilities: [
      { id: 'peacock_stroke', name: 'The Stroke', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }] },
      { id: 'peacock_sweep', name: 'Sweeping Hues', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }, { op: 'attack', mult: 1.0, elem: 'Physical' }] },
      { id: 'peacock_splendor', name: 'Dancing Splendor', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Physical' }, { op: 'aoe', mult: 1.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['peacock_splendor', 'peacock_sweep', 'peacock_stroke']),
  },
  // Herta ErrorModel (Elite, Imaginary): data carries only the Talent "Converted Duplication"
  // (transforms into up to 5 other friendly units). Transformation → deviation; an authored basic
  // single Imaginary 150% is provided so the unit resolves a non-empty behavior.
  'Herta ErrorModel': {
    abilities: [
      { id: 'error_strike', name: 'Error Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['error_strike']),
  },
  // Lighthouse (Elite, Physical): Radiant Sweep blast 200%/100%; Unyielding Justice charges into the
  // "Smite Evil" state (12 All Wishes stacks, Weakness Protected) then releases Smite All Evil on all
  // targets (released ability absent → authored AoE 300%). Deviation: Righteous Frontline (summon
  // Astropolis Sentinel ×4), the Navigation Guide stack/Inspire cycle and the entry action-advance.
  Lighthouse: {
    abilities: [
      { id: 'lighthouse_sweep', name: 'Radiant Sweep', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.0, adjMult: 1.0, elem: 'Physical' }] },
      { id: 'lighthouse_justice', name: 'Unyielding Justice', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['lighthouse_justice', 'lighthouse_sweep']),
  },
  // Senior Staff: Team Leader (Elite, Physical): Disciplined single 320%; Cost Reduction single 380%;
  // In Training… charges then releases Work Culture Shock on all targets (released ability absent →
  // authored AoE 300%). Deviation: Performance Points (seize/grant/Talent) and Team Building (summon).
  'Senior Staff: Team Leader': {
    abilities: [
      { id: 'leader_disciplined', name: 'Disciplined', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Physical' }] },
      { id: 'leader_cost', name: 'Cost Reduction', targetRule: 'single', effects: [{ op: 'attack', mult: 3.8, elem: 'Physical' }] },
      { id: 'leader_training', name: 'In Training…', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['leader_training', 'leader_cost', 'leader_disciplined']),
  },
  // "Past Confined and Caged" (Elite, Physical): Cleansing Flagellation single 360%; Admonishment of
  // the Masses blast 300%/300%; Shackle-Bearing Messenger charges + locks on (the released "Desmios
  // Evangelion" is absent → only the lock-on is modelled).
  '"Past Confined and Caged"': {
    abilities: [
      { id: 'past_flagellation', name: 'Cleansing Flagellation', targetRule: 'single', effects: [{ op: 'attack', mult: 3.6, elem: 'Physical' }] },
      { id: 'past_admonishment', name: 'Admonishment of the Masses', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Physical' }] },
      { id: 'past_messenger', name: 'Shackle-Bearing Messenger', targetRule: 'random', cast: 1, effects: [{ op: 'lockon' }] },
    ],
    ai: new PatternAI(['past_messenger', 'past_flagellation', 'past_admonishment']),
  },
  // Guardian Shadow (Elite, Lightning): Lightning Recollection single 300%; Lightning Condemnation
  // blast 200%/150%; Tranquil Ban — a ban state whose violation triggers Inevitable Punishment
  // (single Lightning 350%), approximated as a Counter (the Disarm/Silent Ban variants and the
  // CC-immunity guard are deviations).
  'Guardian Shadow': {
    abilities: [
      { id: 'guardian_recollection', name: 'Lightning Recollection', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Lightning' }] },
      { id: 'guardian_condemnation', name: 'Lightning Condemnation', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.0, adjMult: 1.5, elem: 'Lightning' }] },
      { id: 'guardian_tranquil', name: 'Tranquil Ban', targetRule: 'self', effects: [{ op: 'counter', ability: { id: 'guardian_punish', name: 'Inevitable Punishment', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] } }] },
    ],
    ai: new PatternAI(['guardian_tranquil', 'guardian_recollection', 'guardian_condemnation']),
  },
  // Cyclonic Swarm Mother (Elite, Quantum): Spurn the Abyssal Umbra single 350%; Weeping Upon the
  // Shore blast 300%/300%; Rain Is Born to Fall AoE 420%; Gestation of Tempest enters Breeding Frenzy
  // (marker). Deviation: the Incubation countdown entity, premature Mirage Fizzle Kid summons and the
  // Respite-by-the-Waters attack-count advance are not modelled.
  'Cyclonic Swarm Mother': {
    abilities: [
      { id: 'swarm_spurn', name: 'Spurn the Abyssal Umbra', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Quantum' }] },
      { id: 'swarm_weeping', name: 'Weeping Upon the Shore', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Quantum' }] },
      { id: 'swarm_rain', name: 'Rain Is Born to Fall', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.2, elem: 'Quantum' }] },
      { id: 'swarm_gestation', name: 'Gestation of Tempest', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'swarm_frenzy', name: 'Breeding Frenzy', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['swarm_gestation', 'swarm_rain', 'swarm_weeping', 'swarm_spurn']),
  },
  // Black Tide's Champion (Elite, Physical): Dreadtide blast 350%/300%; Cast Marble single 400%;
  // Fatal Clash enters the "Duel" state (marker). Deviation: the Duel progress bar / Morale / Honor
  // and the Fated End Corrosion cycle (with Spirit Breaker) are not modelled.
  "Black Tide's Champion": {
    abilities: [
      { id: 'champion_dreadtide', name: 'Dreadtide', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.5, adjMult: 3.0, elem: 'Physical' }] },
      { id: 'champion_marble', name: 'Cast Marble', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Physical' }] },
      { id: 'champion_clash', name: 'Fatal Clash', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'champion_duel', name: 'Duel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['champion_clash', 'champion_dreadtide', 'champion_marble']),
  },

  // ---- Batch 23 — elite rank, part 3 (DoT casters / charge / War-Armor / composite) -----------
  // "Present Inebriated in Revelry" (Elite, Wind): each skill inflicts ONE of two stackable DoTs —
  // Carousal of Wantonness (Wind) or Carousal of Revelry (Lightning) — modelled as `oneOf` between
  // Wind Shear and Shock. Precious Blood Shed For You single; Feast That Is Set For You all targets;
  // A Cup Runneth Over For You charges then releases. Deviation: the released "Wash Away All Sins For
  // You" and the lock-on of DoT-afflicted characters are not modelled (only the DoT infliction).
  '"Present Inebriated in Revelry"': {
    abilities: [
      { id: 'present_blood', name: 'Precious Blood Shed For You', targetRule: 'single', effects: [{ op: 'oneOf', effects: [
        { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 2, chance: 1.0 },
        { op: 'dot', kind: 'Shock', mult: 1.0, turns: 2, chance: 1.0 },
      ] }] },
      { id: 'present_feast', name: 'Feast That Is Set For You', targetRule: 'aoe', effects: [{ op: 'oneOf', effects: [
        { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 2, chance: 1.0 },
        { op: 'dot', kind: 'Shock', mult: 1.0, turns: 2, chance: 1.0 },
      ] }] },
      { id: 'present_cup', name: 'A Cup Runneth Over For You', targetRule: 'aoe', cast: 1, effects: [{ op: 'oneOf', effects: [
        { op: 'dot', kind: 'WindShear', mult: 1.0, turns: 2, chance: 1.0 },
        { op: 'dot', kind: 'Shock', mult: 1.0, turns: 2, chance: 1.0 },
      ] }] },
    ],
    ai: new PatternAI(['present_blood', 'present_feast', 'present_cup']),
  },
  // "Tomorrow in Harmonious Chords" (Elite, Imaginary): All Is Bright single 300%; All Is Calm
  // inflicts Alien Dream; Redeeming Grace single 420%; Holy Night charges then releases Sleep In
  // Heavenly Peace (absent → authored AoE Imaginary 300%). Deviation — Alien Dream's action-lock,
  // per-turn HP regen and dispel-on-attack are not modelled: it is a `vulnAll` marker only.
  '"Tomorrow in Harmonious Chords"': {
    abilities: [
      { id: 'chords_bright', name: 'All Is Bright', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'chords_calm', name: 'All Is Calm', targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'chords_alien_dream', name: 'Alien Dream', mods: [{ stat: 'vulnAll', value: 0.30 }], turns: 2 } }] },
      { id: 'chords_grace', name: 'Redeeming Grace', targetRule: 'single', effects: [{ op: 'attack', mult: 4.2, elem: 'Imaginary' }] },
      { id: 'chords_holynight', name: 'Holy Night', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['chords_holynight', 'chords_bright', 'chords_calm', 'chords_grace']),
  },
  // Black Tide's Corroded Daemon (Elite, Physical): Shredding Landslide single 300%; Filth Eater
  // absorbs Corrosion (modelled as a Filth marker buff); Depravation charges then releases Torrential
  // Surge (absent → authored AoE Physical 300%). Deviation: the Corrosion HP-conversion economy and
  // the Filth→Depravation (3-stack) trigger are not modelled.
  "Black Tide's Corroded Daemon": {
    abilities: [
      { id: 'daemon_landslide', name: 'Shredding Landslide', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'daemon_filtheater', name: 'Filth Eater', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'daemon_filth', name: 'Filth', mods: [], turns: Infinity, maxStacks: 3 } }] },
      { id: 'daemon_depravation', name: 'Depravation', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['daemon_depravation', 'daemon_landslide', 'daemon_filtheater']),
  },
  // Corrupting Shadowfiend: Torrential Rotbringer (Elite, Physical): Shredding Landslide single
  // (authored 300% — the "higher target HP, higher DMG" scaling is not modelled); Heartmarrow
  // Corrosion applies "Overloadable" (modelled as a self marker). Deviation: the HP-Overload /
  // Overload Settlement sub-battle, Absorb Impurity and the Black Tide Creature summon are omitted.
  'Corrupting Shadowfiend: Torrential Rotbringer': {
    abilities: [
      { id: 'rot_landslide', name: 'Shredding Landslide', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'rot_corrosion', name: 'Heartmarrow Corrosion', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'rot_overload', name: 'Overloadable', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['rot_corrosion', 'rot_landslide']),
  },
  // Disciples of Sanctus Medicus: Shape Shifter (Elite, Lightning): Thunder-Shock single 350%;
  // Punishing Bolts blast 300%. Deviation: Mara-Summon (10% Max-HP cost + summon Mara-Struck
  // Soldiers) is not modelled (no summon / self-HP-cost op), nor Vigor Draining (Draining Hit heal).
  'Disciples of Sanctus Medicus: Shape Shifter': {
    abilities: [
      { id: 'shifter_thunder', name: 'Thunder-Shock', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] },
      { id: 'shifter_bolts', name: 'Punishing Bolts', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['shifter_thunder', 'shifter_bolts']),
  },
  // Dreamjolt Troupe's Beyond Overcooked (Elite, Fire): Ladle Swirl single 320%; Tornado Toss blast
  // 280%/220%; Ignite Stove charges then releases Flaming Stir-Fry (absent → authored AoE Fire 300%).
  // Deviation: the Stove Heating stack economy and Kitchen Mishap / Flame-Forged Feast / Inferno
  // Stove talents are not modelled.
  "Dreamjolt Troupe's Beyond Overcooked": {
    abilities: [
      { id: 'cooked_ladle', name: 'Ladle Swirl', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Fire' }] },
      { id: 'cooked_tornado', name: 'Tornado Toss', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.2, elem: 'Fire' }] },
      { id: 'cooked_stove', name: 'Ignite Stove', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['cooked_stove', 'cooked_ladle', 'cooked_tornado']),
  },
  // Dreamjolt Troupe's Sweet Gorilla (Elite, Ice): Limited Free Drinks single 380%; Celebration
  // Fountain charges then releases Unlimited Free Drinks (absent → authored single Ice 400%).
  // Deviation: SoulGlad Party (summon Bubble Hounds ×2), the Toughness Protection guard, and the
  // shield-conditional self-DMG / self-DEF-down rider are not modelled.
  "Dreamjolt Troupe's Sweet Gorilla": {
    abilities: [
      { id: 'gorilla_drinks', name: 'Limited Free Drinks', targetRule: 'single', effects: [{ op: 'attack', mult: 3.8, elem: 'Ice' }] },
      { id: 'gorilla_fountain', name: 'Celebration Fountain', targetRule: 'single', cast: 1, effects: [{ op: 'attack', mult: 4.0, elem: 'Ice' }] },
    ],
    ai: new PatternAI(['gorilla_fountain', 'gorilla_drinks']),
  },
  // Earthshaker Leo: Solblaze Winged Beast (Elite, Fire): Through the Darkness single 250%;
  // Heralding the Dawn sweeps 3 consecutive targets (authored as blast) + Burn; Light the Future
  // locks on then releases Praise Aquila (absent → authored AoE Fire 300%). Deviation: the sweep
  // left-to-right shape, the lock-on-ALL and the Radiant Macrocosm back-row talent are not modelled.
  'Earthshaker Leo: Solblaze Winged Beast': {
    abilities: [
      { id: 'leo_darkness', name: 'Through the Darkness', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Fire' }] },
      { id: 'leo_dawn', name: 'Heralding the Dawn', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.5, elem: 'Fire' }, { op: 'dot', kind: 'Burn', mult: 0.8, turns: 2, chance: 1.0 }] },
      { id: 'leo_future', name: 'Light the Future', targetRule: 'aoe', cast: 1, effects: [{ op: 'lockon' }, { op: 'aoe', mult: 3.0, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['leo_future', 'leo_darkness', 'leo_dawn']),
  },
  // Ecliptic Inner Beast & Shadow of "Feixiao" (Elite, composite): hsr-data carries no stats and only
  // the Talent "Seance" (Nebula Devourer / Planeshred Claws / Worldpurge Tail share HP with the
  // Shadow). The shared-HP composite is not modelled → a self marker ability keeps the unit
  // resolvable. Deviation: the entire shared-HP multi-body encounter.
  'Ecliptic Inner Beast & Shadow of "Feixiao"': {
    abilities: [
      { id: 'ecliptic_seance', name: 'Seance', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'ecliptic_seance', name: 'Seance', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['ecliptic_seance']),
  },
  // Elegy Siren: Insatiable Leviathan (Elite, Ice): Intoxicating Corruption blast; Honeyed Brew
  // Sprinkled Like Stars AoE + DEF/RES down (modelled as `defRed`; all-type RES down has no generic
  // key → deviation); Psychedelic Elegy single (authored 250%); Heed The Ocean's Gift self marker.
  // Deviation: Phantom Illusion (Departed character + substitute Hallucinogenic Mermaid summon),
  // Revel in Destruction (Glacial Erosion DoT on hit) and Respite By The Waters auto-cast are omitted.
  'Elegy Siren: Insatiable Leviathan': {
    abilities: [
      { id: 'leviathan_corruption', name: 'Intoxicating Corruption', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 1.5, elem: 'Ice' }] },
      { id: 'leviathan_brew', name: 'Honeyed Brew Sprinkled Like Stars', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }, { op: 'debuff', chance: 1.0, buff: { id: 'leviathan_defdown', name: 'DEF Down', mods: [{ stat: 'defRed', value: 0.20 }], turns: 2 } }] },
      { id: 'leviathan_elegy', name: 'Psychedelic Elegy', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Ice' }] },
      { id: 'leviathan_gift', name: "Heed The Ocean's Gift", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'leviathan_dance', name: 'Yearning for a Shared Dance', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['leviathan_brew', 'leviathan_corruption', 'leviathan_elegy', 'leviathan_gift']),
  },
  // Furiae Praetor (Elite, Imaginary): From Skyveil to Dawn / From Dawn to Skyveil sweep 3
  // consecutive targets (authored as blast) 280%; Resembling Furious Lion charges then releases
  // Drowned in the Crimson Sea (absent → authored AoE Imaginary 300%). War Armor (Polis Protector)
  // → §57 passive, 6 stacks. Deviation: Rise from the Grave (summon Furiae Warrior ×2) and the
  // sweep left/right direction are not modelled.
  'Furiae Praetor': {
    abilities: [
      { id: 'praetor_skyveil', name: 'From Skyveil to Dawn', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'praetor_dawn', name: 'From Dawn to Skyveil', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'praetor_lion', name: 'Resembling Furious Lion', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['praetor_lion', 'praetor_skyveil', 'praetor_dawn']),
    passive: warArmor({ stacks: 6, shatterPct: 0.15, delayPct: 0.20, brokenPct: 0.03 }),
  },
  // God-Devourer Offspring (Elite, Fire): Rite of Gorging single 200% + DEF down (authored 20%×1t);
  // Feast of the Living Offering inflicts Devour (modelled as `inHeal` −50% + `atkPct` −30% — the ATK
  // "steal" and Max-Restorable-HP reduction are authored approximations); Banquet of Beasts AoE 240%.
  // Deviation: Rite of Expiation and Sacred Regurgitation (returning the stolen ATK / dispel cycle)
  // are not modelled.
  'God-Devourer Offspring': {
    abilities: [
      { id: 'god_gorging', name: 'Rite of Gorging', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Fire' }, { op: 'debuff', chance: 1.0, buff: { id: 'god_defdown', name: 'DEF Down', mods: [{ stat: 'defRed', value: 0.20 }], turns: 1 } }] },
      { id: 'god_feast', name: 'Feast of the Living Offering', targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'god_devour', name: 'Devour', mods: [{ stat: 'inHeal', value: -0.50 }, { stat: 'atkPct', value: -0.30 }], turns: 3 } }] },
      { id: 'god_banquet', name: 'Banquet of Beasts', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.4, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['god_feast', 'god_gorging', 'god_banquet']),
  },

  // ---- Batch 24 — elite rank, part 4 (sweep / Moon-Rage / charge / War-Armor / composite) ------
  // Greatsword Guardian: Vanguard Wallbreaker (Elite, Imaginary): From Skyveil to Dawn / From Dawn
  // to Skyveil sweep 3 consecutive targets (authored as blast) 280%; Resembling Furious Lion charges
  // then releases Drowned in the Crimson Sea (absent → authored AoE Imaginary 300%). Deviation: Rise
  // from the Grave (summon Titankin) and Military Might Unstoppable (HP Count on all units) omitted.
  'Greatsword Guardian: Vanguard Wallbreaker': {
    abilities: [
      { id: 'gguard_skyveil', name: 'From Skyveil to Dawn', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'gguard_dawn', name: 'From Dawn to Skyveil', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'gguard_lion', name: 'Resembling Furious Lion', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['gguard_lion', 'gguard_skyveil', 'gguard_dawn']),
  },
  // Howling Casket (Elite, Physical): Bionic Claws single 320%; Thunderous Roar blast 260%/180%;
  // Moon Rage Mimicry enters Moon Rage (the §57 `moonRage` passive, threshold lowered to 4 — canon
  // "decreases Bloodlust needed by 2"); Lupitoxin Synthesis AoE + Terror Grip, gated behind Moon
  // Rage. Deviation: Terror Grip's actual "Terrified"-at-second-turn / dispel-on-attack is a marker.
  'Howling Casket': {
    abilities: [
      { id: 'casket_claws', name: 'Bionic Claws', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Physical' }] },
      { id: 'casket_roar', name: 'Thunderous Roar', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.6, adjMult: 1.8, elem: 'Physical' }] },
      { id: 'casket_mimicry', name: 'Moon Rage Mimicry', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: MOON_RAGE, name: 'Moon Rage', mods: [{ stat: 'spdPct', value: 0.20 }], turns: Infinity } }] },
      { id: 'casket_lupitoxin', name: 'Lupitoxin Synthesis', targetRule: 'aoe', require: { buff: MOON_RAGE }, effects: [{ op: 'aoe', mult: 2.0, elem: 'Physical' }, { op: 'debuff', chance: 1.0, buff: { id: 'casket_terror_grip', name: 'Terror Grip', mods: [], turns: 2 } }] },
    ],
    ai: new PatternAI(['casket_mimicry', 'casket_lupitoxin', 'casket_claws', 'casket_roar']),
    passive: moonRage({ threshold: 4 }),
  },
  // Ichor Memosprite: Winged Serpent (Elite, Imaginary): Hemotort Whip single 350%; Hemotort Spew
  // blast 300%/250%; Menacing Warning charges then releases Hemotort Vortex (absent → authored AoE
  // Imaginary 200%). Deviation: the Whirl stack economy and the Corkscrew Charge reaction (Torque
  // Counter while Whirl > 0) plus the 50% post-charge delay are not modelled.
  'Ichor Memosprite: Winged Serpent': {
    abilities: [
      { id: 'serpent_whip', name: 'Hemotort Whip', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Imaginary' }] },
      { id: 'serpent_spew', name: 'Hemotort Spew', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 2.5, elem: 'Imaginary' }] },
      { id: 'serpent_warning', name: 'Menacing Warning', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['serpent_warning', 'serpent_whip', 'serpent_spew']),
  },
  // Joy Ascendant (Elite, Wind): Rapturous Exhalation single Wind 350% (authored); Jubilation bounce
  // Wind ×4 (authored 200% per bounce); Blossoming Smile charges then releases Euphoric Spiral
  // (absent → authored AoE Wind 300%). Deviation: the split/clone fan-out, the simultaneous Jubilation
  // and Paramount Bliss (marker) are not modelled.
  'Joy Ascendant': {
    abilities: [
      { id: 'joy_exhalation', name: 'Rapturous Exhalation', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Wind' }] },
      { id: 'joy_jubilation', name: 'Jubilation', targetRule: 'random', effects: [{ op: 'bounce', mult: 2.0, hits: 4, elem: 'Wind' }] },
      { id: 'joy_smile', name: 'Blossoming Smile', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Wind' }] },
    ],
    ai: new PatternAI(['joy_smile', 'joy_exhalation', 'joy_jubilation']),
  },
  // Lady of Crashing Waves (Elite, Ice): Intoxicating Corruption blast 250%/150%; Honeyed Brew
  // Sprinkled Like Stars AoE 200% + DEF/RES down (modelled as `defRed`; all-type RES down has no
  // generic key → deviation); Heed The Ocean's Gift self marker. Same "Revel in Destruction" family
  // as Elegy Siren. Deviation: Melody of Invitation (summon Servant of Tides ×2), Respite By The
  // Waters (attack-count action-advance) and the Revel in Destruction countdown are omitted.
  'Lady of Crashing Waves': {
    abilities: [
      { id: 'lady_corruption', name: 'Intoxicating Corruption', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 1.5, elem: 'Ice' }] },
      { id: 'lady_brew', name: 'Honeyed Brew Sprinkled Like Stars', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Ice' }, { op: 'debuff', chance: 1.0, buff: { id: 'lady_inebriated', name: 'Inebriated Daze', mods: [{ stat: 'defRed', value: 0.20 }], turns: 2 } }] },
      { id: 'lady_gift', name: "Heed The Ocean's Gift", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'lady_dance', name: 'Yearning for a Shared Dance', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['lady_brew', 'lady_corruption', 'lady_gift']),
  },
  // Moonlit Pegasus (Elite, Quantum): Creating Moonlight single 300%; Triple Waning Moon sweeps 3
  // consecutive targets (authored as blast) 260% + Oronyx's Mark (marker); Double Waxing Moon charges
  // and locks on then releases Sixfold Plenilune (absent → authored AoE Quantum 300%). Deviation: the
  // Oronyx/Aquila mark combo (True DMG + Entanglement), the lock-on-2 and the sweep direction.
  'Moonlit Pegasus': {
    abilities: [
      { id: 'pegasus_moonlight', name: 'Creating Moonlight', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }] },
      { id: 'pegasus_waning', name: 'Triple Waning Moon', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.6, adjMult: 2.6, elem: 'Quantum' }, { op: 'debuff', chance: 1.0, buff: { id: 'pegasus_oronyx', name: "Oronyx's Mark", mods: [], turns: 2 } }] },
      { id: 'pegasus_waxing', name: 'Double Waxing Moon', targetRule: 'aoe', cast: 1, effects: [{ op: 'lockon' }, { op: 'aoe', mult: 3.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['pegasus_waxing', 'pegasus_moonlight', 'pegasus_waning']),
  },
  // Noontide Gryphon (Elite, Fire): Through the Darkness single 300%; Heralding the Dawn sweeps 3
  // consecutive targets (authored as blast) 260% + Aquila's Mark (marker); Light the Future charges +
  // locks on then releases Praise Aquila (absent → authored AoE Fire 300%). On spawn its action is
  // advanced 50% (canon). Deviation: the mark combo, the Meteoric Eagle summon and sweep direction.
  'Noontide Gryphon': {
    abilities: [
      { id: 'gryphon_darkness', name: 'Through the Darkness', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Fire' }] },
      { id: 'gryphon_dawn', name: 'Heralding the Dawn', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.6, adjMult: 2.6, elem: 'Fire' }, { op: 'debuff', chance: 1.0, buff: { id: 'gryphon_aquila', name: "Aquila's Mark", mods: [], turns: 2 } }] },
      { id: 'gryphon_future', name: 'Light the Future', targetRule: 'aoe', cast: 1, effects: [{ op: 'lockon' }, { op: 'aoe', mult: 3.0, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['gryphon_future', 'gryphon_darkness', 'gryphon_dawn']),
    passive: { onSpawn(sim, self) { sim.advance(self, 0.5) } },
  },
  // Rocking Rebel (Elite, Imaginary): Sweep the Left! / Sweep the Right! sweep 3 consecutive targets
  // (authored as blast) 280%; Performance Rehearsal charges then releases Time to Rock! (absent →
  // authored AoE Imaginary 300%); Get Hyped! raises the SPD of its allies (except itself). Deviation:
  // the Charging exclusivity, Aha Instant / Punchline / Frenzied Rendition / Revelry are not modelled.
  'Rocking Rebel': {
    abilities: [
      { id: 'rebel_left', name: 'Sweep the Left!', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'rebel_right', name: 'Sweep the Right!', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.8, elem: 'Imaginary' }] },
      { id: 'rebel_rehearsal', name: 'Performance Rehearsal', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'rebel_hype', name: 'Get Hyped!', targetRule: 'self', effects: [{ op: 'buff', to: 'alliesOther', buff: { id: 'rebel_hype', name: 'Get Hyped!', mods: [{ stat: 'spdPct', value: 0.50 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['rebel_rehearsal', 'rebel_left', 'rebel_right', 'rebel_hype']),
  },
  // Sanerot Hearteater (Elite, composite): hsr-data carries only the Talents "Seance" (Nebula
  // Devourer / Planeshred Claws / Worldpurge Tail / Hellcharred Shadow General share HP) and
  // "Synchronization" (their Weakness Break reduces Sanerot's Toughness). No attack skills. The
  // shared-HP composite is not modelled → a self marker keeps the unit resolvable. Deviation: the
  // entire shared-HP / Toughness-sync multi-body encounter.
  'Sanerot Hearteater': {
    abilities: [
      { id: 'sanerot_seance', name: 'Seance', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'sanerot_seance', name: 'Seance', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['sanerot_seance']),
  },
  // Synergy Duo: Bloodbound Dark Duelist (Elite, Physical): Dreadtide AoE 350%; Cast Marble single
  // 400%; Desperate Deathmatch enters the "split battlefield" state (marker). Deviation: the split
  // battlefields, Blood-Sworn Alliance (summon Black Tide Creature), Fated End Corrosion and
  // Indomitable Battle (knockdown → Repose → revive) are not modelled.
  'Synergy Duo: Bloodbound Dark Duelist': {
    abilities: [
      { id: 'duelist_dreadtide', name: 'Dreadtide', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.5, elem: 'Physical' }] },
      { id: 'duelist_marble', name: 'Cast Marble', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Physical' }] },
      { id: 'duelist_deathmatch', name: 'Desperate Deathmatch', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'duelist_split', name: 'Desperate Deathmatch', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['duelist_deathmatch', 'duelist_dreadtide', 'duelist_marble']),
  },
  // Synergy Duo: Ironclad White Guard (Elite, Imaginary): From Skyveil to Dawn sweep 3 consecutive
  // targets (authored as blast) 300%; Resembling Furious Lion charges then releases Drowned in the
  // Crimson Sea (absent → authored AoE Imaginary 300%). War Armor (Polis Protector) → §57 passive.
  // Deviation: Rise from the Grave (summon Titankin), Indomitable Battle (knockdown/revive) and the
  // sweep direction are not modelled.
  'Synergy Duo: Ironclad White Guard': {
    abilities: [
      { id: 'guard_skyveil', name: 'From Skyveil to Dawn', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Imaginary' }] },
      { id: 'guard_lion', name: 'Resembling Furious Lion', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['guard_lion', 'guard_skyveil']),
    passive: warArmor(),
  },

  // ── Batch 25 — bosses ───────────────────────────────────────────────────────────────────────
  // "Harmonious Choir" The Great Septimus (Boss, Imaginary): Grazioso single 300%; Maestoso AoE
  // 400%; Vaneggiando applies Alien Dream (impair); Accelerando charges then releases Volteggiando
  // (absent → authored AoE Imaginary 400%). Deviation: the 4 Echoes of Faded Dreams summons and
  // their DMG redistribution + break-delay, the phase machine (Accrescendo/Tempestoso, Allargando
  // shield, "Im Anfang war das Wort", the Embryo of Philosophy Sunday body) and Alien Dream's
  // heal-on-tick are not modelled; Alien Dream is a marker debuff.
  '"Harmonious Choir" The Great Septimus': {
    abilities: [
      { id: 'septimus_grazioso', name: 'Grazioso', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'septimus_maestoso', name: 'Maestoso', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'septimus_vaneggiando', name: 'Vaneggiando', targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'alien_dream', name: 'Alien Dream', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 2 } }] },
      { id: 'septimus_accelerando', name: 'Accelerando', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['septimus_accelerando', 'septimus_maestoso', 'septimus_grazioso', 'septimus_vaneggiando']),
  },
  // @SparxiConOfficial (Boss, Quantum): Net Battle! single 350%; Bring the Beat In! AoE 350%; Get On
  // the Mic! enters Live Showdown (marker); Stream Promo advances its allies' actions 25% and gives
  // them +25% CRIT Rate. Deviation: the prime-field/sub-field battlefields, popularity stacks, the
  // Follower Growth / Bleeding Followers RES-PEN and DMG-Boost economies, Fan Frenzy, Aha Instant
  // and Elation skills are not modelled.
  '@SparxiConOfficial': {
    abilities: [
      { id: 'sparxi_net', name: 'Net Battle!', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Quantum' }] },
      { id: 'sparxi_beat', name: 'Bring the Beat In!', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.5, elem: 'Quantum' }] },
      { id: 'sparxi_mic', name: 'Get On the Mic!', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'sparxi_showdown', name: 'Live Showdown', mods: [], turns: Infinity } }] },
      { id: 'sparxi_promo', name: 'Stream Promo', targetRule: 'self', effects: [
        { op: 'advance', pct: 0.25, to: 'alliesOther' },
        { op: 'buff', to: 'alliesOther', buff: { id: 'sparxi_viewers', name: 'Flooding Viewers', mods: [{ stat: 'critRate', value: 0.25 }], turns: 1 } },
      ] },
    ],
    ai: new PatternAI(['sparxi_beat', 'sparxi_net', 'sparxi_promo', 'sparxi_mic']),
  },
  // Abundant Ebon Deer (Boss, Lightning/Wind): Wavering Bleat single 350%; Caress of Wind AoE 280%;
  // Outrage single 120% Wind + Wind Shear (50%/stack, max 5) + Outrage mark; Hardy Leaf Sheath
  // +200% DEF 1t (Toughness immune); Engender +30% ATK 2t; Retaliation counters with Leaf Hinging
  // (150% Lightning + Shock); Last Spring heals allies 25% Max HP. Deviation: the Pedicel summons
  // (Twigs), Rebirth/Everlife full restore, Vigor Overflow, Synwood Renewal, Flamboyant Gore charge,
  // Surrounded Protection, the Illusion mode and Pure Fiction are not modelled.
  'Abundant Ebon Deer': {
    abilities: [
      { id: 'deer_bleat', name: 'Wavering Bleat', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] },
      { id: 'deer_caress', name: 'Caress of Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.8, elem: 'Wind' }] },
      { id: 'deer_outrage', name: 'Outrage', targetRule: 'single', effects: [
        { op: 'attack', mult: 1.2, elem: 'Wind' },
        { op: 'dot', kind: 'WindShear', mult: 0.5, stacks: 5, turns: 2, chance: 1.0 },
        { op: 'debuff', chance: 1.0, buff: { id: 'deer_outrage', name: 'Outrage', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 2 } },
      ] },
      { id: 'deer_sheath', name: 'Hardy Leaf Sheath', targetRule: 'self', effects: [
        { op: 'guard', toughnessImmune: true },
        { op: 'buff', to: 'self', buff: { id: 'deer_sheath', name: 'Hardy Leaf Sheath', mods: [{ stat: 'defPct', value: 2.0 }], turns: 1 } },
      ] },
      { id: 'deer_engender', name: 'Engender', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'deer_engender', name: 'Engender', mods: [{ stat: 'atkPct', value: 0.30 }], turns: 2 } }] },
      { id: 'deer_retaliation', name: 'Retaliation', targetRule: 'self', effects: [{ op: 'counter', ability: { id: 'deer_leaf', name: 'Leaf Hinging', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Lightning' }, { op: 'dot', kind: 'Shock', mult: 0.5, turns: 2, chance: 1.0 }] } }] },
      { id: 'deer_lastspring', name: 'Last Spring', targetRule: 'self', effects: [{ op: 'heal', frac: 0.25, to: 'allies' }] },
    ],
    ai: new PatternAI(['deer_bleat', 'deer_caress', 'deer_outrage', 'deer_sheath', 'deer_engender', 'deer_retaliation']),
  },
  // Alloy Mechatron: King Pom-Pom (Boss, Quantum): Soulmend Shears single 300%; Zero-Blind-Spot
  // Cleanse AoE 300%; High-Temp Sterilization Mode enters Steam Wash (+30% DMG, +30% DMG reduction);
  // Potent Foam Soap AoE 150% + Work Is Bliss mark; Duty Prep charges then releases Saturation
  // Cleaning (absent → authored AoE Quantum 300%). Deviation: Scrubber's Mutiny (Venue Protocol
  // Enforcer + Alloy Pommy summons), Punchline, Lasting Antibac removal/exit, Weakness Protected
  // and the battle-start 50% advance are not modelled.
  'Alloy Mechatron: King Pom-Pom': {
    abilities: [
      { id: 'pompom_shears', name: 'Soulmend Shears', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }] },
      { id: 'pompom_cleanse', name: 'Zero-Blind-Spot Cleanse', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Quantum' }] },
      { id: 'pompom_sterilize', name: 'High-Temp Sterilization Mode', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'steam_wash', name: 'Steam Wash', mods: [{ stat: 'dmgAll', value: 0.30 }, { stat: 'mitigation', value: 0.30 }], turns: Infinity } }] },
      { id: 'pompom_foam', name: 'Potent Foam Soap', targetRule: 'aoe', effects: [
        { op: 'aoe', mult: 1.5, elem: 'Quantum' },
        { op: 'debuff', chance: 1.0, buff: { id: 'work_is_bliss', name: 'Work Is Bliss!', mods: [], turns: 2 } },
      ] },
      { id: 'pompom_duty', name: 'Duty Prep in Progress...', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['pompom_duty', 'pompom_sterilize', 'pompom_cleanse', 'pompom_shears', 'pompom_foam']),
  },
  // Annihilator of Desolation Mistral (Boss, Ice): Chill of Bone-Piercing Coagulation single 300%;
  // Wrath of Winterland Saints charges then releases Punishment of Endless Winter (absent → authored
  // AoE Ice 300%); Reverberating Ice blast 200%/100%; Tit for Tat counters with Smite of Frost (single
  // Ice). Deviation: the Ice Edges summon, Shield of the Winterlands (Gepard), Garrison Aura Field,
  // Reverberating Ice's Frozen removal, the phase-2 body (Mother of Deception) and the battle-start
  // 80% advance are not modelled.
  'Annihilator of Desolation Mistral': {
    abilities: [
      { id: 'mistral_chill', name: 'Chill of Bone-Piercing Coagulation', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Ice' }] },
      { id: 'mistral_wrath', name: 'Wrath of Winterland Saints', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Ice' }] },
      { id: 'mistral_reverb', name: 'Reverberating Ice', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.0, adjMult: 1.0, elem: 'Ice' }] },
      { id: 'mistral_titfortat', name: 'Tit for Tat', targetRule: 'self', effects: [{ op: 'counter', ability: { id: 'mistral_frost', name: 'Smite of Frost', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Ice' }] } }] },
    ],
    ai: new PatternAI(['mistral_wrath', 'mistral_chill', 'mistral_reverb']),
  },
  // Annihilator of Desolation Mistral: Mother of Deception (Boss, Ice→Imaginary): Harbinger of
  // Annihilation locks on then uses Soulrend Coldstream (authored single Ice 350%); Creator's Resolve
  // +25% SPD +20% DMG (marker); The Creation's Prelude charges then releases Last Choir of Genesis
  // (absent → authored AoE Imaginary 300%). Deviation: Creator's Resolve's element CONVERSION to
  // Imaginary is not modelled (only the stat buff), nor is the Lance of the Eternal Freeze summon or
  // the battlefield transfer.
  'Annihilator of Desolation Mistral: Mother of Deception': {
    abilities: [
      { id: 'mother_harbinger', name: 'Harbinger of Annihilation', targetRule: 'single', cast: 1, effects: [{ op: 'lockon' }, { op: 'attack', mult: 3.5, elem: 'Ice' }] },
      { id: 'mother_prelude', name: "The Creation's Prelude", targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'mother_resolve', name: "Creator's Resolve", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'creator_resolve', name: "Creator's Resolve", mods: [{ stat: 'spdPct', value: 0.25 }, { stat: 'dmgAll', value: 0.20 }], turns: Infinity } }] },
    ],
    ai: new PatternAI(['mother_resolve', 'mother_harbinger', 'mother_prelude']),
  },
  // Anti-Creator, Hatred Inundate (Boss, Physical/Quantum/Imaginary): Cast Down Blood and Scar single
  // Physical 450%; Weave Suffering and Death AoE Physical 450%; Yield Not to Tyranny single Quantum
  // 450% + drains 50% Max Energy; Mire Not Within Caves single Imaginary 500% + Action Lock mark;
  // Resist and Destroy charges then releases Immolate the Heavens (absent → authored AoE Physical
  // 450%). Deviation: Amphorean Hatred / Irontomb composite, Thirty Million Cycles of Sin (shared
  // DMG + Mythos/Logos/Grave Wound), Resist and Destroy full-heal, The Fall of Erudition.
  'Anti-Creator, Hatred Inundate': {
    abilities: [
      { id: 'anticreator_cast', name: 'Cast Down Blood and Scar', targetRule: 'single', effects: [{ op: 'attack', mult: 4.5, elem: 'Physical' }] },
      { id: 'anticreator_weave', name: 'Weave Suffering and Death', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.5, elem: 'Physical' }] },
      { id: 'anticreator_yield', name: 'Yield Not to Tyranny', targetRule: 'single', effects: [{ op: 'attack', mult: 4.5, elem: 'Quantum' }, { op: 'drainEnergyPct', pct: 0.5 }] },
      { id: 'anticreator_mire', name: 'Mire Not Within Caves', targetRule: 'single', effects: [
        { op: 'attack', mult: 5.0, elem: 'Imaginary' },
        { op: 'debuff', chance: 1.0, buff: { id: 'action_lock', name: 'Action Lock', mods: [], turns: 2 } },
      ] },
      { id: 'anticreator_resist', name: 'Resist and Destroy', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.5, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['anticreator_cast', 'anticreator_weave', 'anticreator_yield', 'anticreator_mire']),
  },
  // Arbiter of the Lost Abyss (Boss, Imaginary): Hemotort Teethgrind single 400%; Hemotort Saw single
  // 600%; Hemotort Clamps AoE 350%; Hemotort Glower locks on +50% SPD; Name the Culprit charges then
  // releases Hemotort Decapitation (absent → authored AoE Imaginary 400%). Thick-Skinned DEF +150% is
  // modelled as an onSpawn self-buff. Deviation: Singularity Split (Ichor Memosprite Pheasant/Canine/
  // Winged Serpent), Monoform Merger, Execution in Place summon, Barrier Recoil, the Corrosion economy,
  // Degraded Vessel, the extra action after Glower and Hemotort Corruption DoT are not modelled.
  'Arbiter of the Lost Abyss': {
    abilities: [
      { id: 'arbiter_teethgrind', name: 'Hemotort Teethgrind', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'arbiter_saw', name: 'Hemotort Saw', targetRule: 'single', effects: [{ op: 'attack', mult: 6.0, elem: 'Imaginary' }] },
      { id: 'arbiter_clamps', name: 'Hemotort Clamps', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.5, elem: 'Imaginary' }] },
      { id: 'arbiter_glower', name: 'Hemotort Glower', targetRule: 'self', effects: [
        { op: 'lockon' },
        { op: 'buff', to: 'self', buff: { id: 'arbiter_glower', name: 'Hemotort Glower', mods: [{ stat: 'spdPct', value: 0.50 }], turns: 3 } },
      ] },
      { id: 'arbiter_culprit', name: 'Name the Culprit', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['arbiter_culprit', 'arbiter_glower', 'arbiter_teethgrind', 'arbiter_saw', 'arbiter_clamps']),
    passive: { onSpawn(sim, self) { sim.addBuff(self, { id: 'arbiter_enhanced_defense', name: 'Enhance Defense', mods: [{ stat: 'defPct', value: 1.5 }], turns: Infinity, sourceId: self.id }) } },
  },
  // Argenti (Boss, Physical): Piety single 400%; Imbue Devotion blast 360%/180%; So Cometh Beauty's
  // Knight AoE 240%. Deviation: Spear & Shield / Knights summons (Speartip/The Shield/The Honored),
  // the killing-blow talents (Amor of Destined Death, Imitation of Alacritous Desire, Stone of
  // Plummeting Foundation), Diadem Barrier, Honors of the Red Queen, the Soulfreed state and the
  // phase machine are not modelled.
  'Argenti': {
    abilities: [
      { id: 'argenti_piety', name: 'Piety', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Physical' }] },
      { id: 'argenti_devotion', name: 'Imbue Devotion', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.6, adjMult: 1.8, elem: 'Physical' }] },
      { id: 'argenti_beauty', name: "So Cometh Beauty's Knight", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.4, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['argenti_piety', 'argenti_devotion', 'argenti_beauty']),
  },
  // Blaznana Monkey Trick (Boss, Physical/Quantum/Fire): Roll Call single Physical 200%; Question
  // Segment single Physical 300%; Physical Banashment! Take This! blast Fire 150%/100% + Burn
  // (50%/stack, max 3); Banascary Semester AoE Quantum 100% + drains 5 Energy per target. Deviation:
  // Pride of the Monkey Pack (shared HP), Banacademic Curriculum (End-of-Semester Dinner), the
  // Classroom/Off-Class channel state machine, Regular Examination, Banacademic Incident, Switch
  // Tally, the SP economy and the Slow rider are not modelled.
  'Blaznana Monkey Trick': {
    abilities: [
      { id: 'blaz_rollcall', name: 'Roll Call', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }] },
      { id: 'blaz_question', name: 'Question Segment', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'blaz_banash', name: 'Physical Banashment! Take This!', targetRule: 'blast', effects: [
        { op: 'blast', mult: 1.5, adjMult: 1.0, elem: 'Fire' },
        { op: 'dot', kind: 'Burn', mult: 0.5, stacks: 3, turns: 3, chance: 0.8 },
      ] },
      { id: 'blaz_banascary', name: 'Banascary Semester', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.0, elem: 'Quantum' }, { op: 'drainEnergyFlat', amount: 5 }] },
    ],
    ai: new PatternAI(['blaz_banash', 'blaz_rollcall', 'blaz_question', 'blaz_banascary']),
  },
  // Borisin Warhead: Hoolay (Boss, Lightning): Broken Blades as Fang single 200%; Severed Iron as
  // Claws blast 180%/150%; Decimation of Roaring Storms AoE 200%. Warhead Moon Rage (Bloodlust
  // stacks → Moon Rage) is modelled with the shared `moonRage` passive. Deviation: To My Howls the
  // Pack Obeys (Summon the Pack + Wolftrooper summons), Moonhowl Lupus enhanced state, Terror Grip
  // (Complete mode), Crimson Moon's Might and the phase machine are not modelled.
  'Borisin Warhead: Hoolay': {
    abilities: [
      { id: 'hoolay_fang', name: 'Broken Blades as Fang', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Lightning' }] },
      { id: 'hoolay_claws', name: 'Severed Iron as Claws', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.8, adjMult: 1.5, elem: 'Lightning' }] },
      { id: 'hoolay_decimation', name: 'Decimation of Roaring Storms', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['hoolay_decimation', 'hoolay_claws', 'hoolay_fang']),
    passive: moonRage(),
  },
  // Bronya (Boss, Wind): Windrider Bullet single 300%; Combat Redeployment grants a friendly unit
  // (except Bronya) +20% DMG for 1 turn and makes them act immediately. Deviation: the Coordinated
  // Reinforcement summon (Silvermane Soldiers/Gunners), Toughness Protection, Tacit Teamwork
  // (Gepard/Bronya swap), Carried By Inertia, the ally debuff-dispel portion of Combat Redeployment
  // (no friendly-dispel op) and the Illusion mode are not modelled.
  'Bronya': {
    abilities: [
      { id: 'bronya_bullet', name: 'Windrider Bullet', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] },
      { id: 'bronya_redeploy', name: 'Combat Redeployment', targetRule: 'self', effects: [
        { op: 'buff', to: 'alliesOther', buff: { id: 'bronya_redeploy', name: 'Combat Redeployment', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 1 } },
        { op: 'advance', pct: 1.0, to: 'alliesOther' },
      ] },
    ],
    ai: new PatternAI(['bronya_bullet', 'bronya_redeploy']),
  },

  // ── Batch 26 — bosses, part 2 ────────────────────────────────────────────────────────────────
  // Cacophonic Conductor (Boss, Imaginary): Grazioso single 300%; Maestoso AoE 400%; Vaneggiando
  // applies Alien Dream (marker); Variation charges then releases Dancing in Dreams (absent →
  // authored AoE Imaginary 300%); Afflitto single 250% + 5% Action Delay; Phonation Unbound grants
  // a 9% Max-HP Shield and +20% DMG. Deviation: the 4 Echoes of Faded Dreams summons + DMG
  // redistribution, the phase machine (Resonant Projection / Im Anfang war das Wort / the body),
  // Melisma's Toughness restore and Come In Incubo are not modelled.
  'Cacophonic Conductor': {
    abilities: [
      { id: 'caco_grazioso', name: 'Grazioso', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'caco_maestoso', name: 'Maestoso', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'caco_vaneggiando', name: 'Vaneggiando', targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'alien_dream', name: 'Alien Dream', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 2 } }] },
      { id: 'caco_variation', name: 'Variation', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'caco_afflitto', name: 'Afflitto', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }, { op: 'delay', pct: 0.05 }] },
      { id: 'caco_phonation', name: 'Phonation Unbound', targetRule: 'self', effects: [{ op: 'shield', frac: 0.09 }, { op: 'buff', to: 'self', buff: { id: 'caco_one_with_light', name: 'One With the Light', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: Infinity } }] },
    ],
    ai: new PatternAI(['caco_variation', 'caco_maestoso', 'caco_grazioso', 'caco_vaneggiando', 'caco_afflitto', 'caco_phonation']),
  },
  // Cirrus (Boss, Wind): Soulsplit makes it untargetable until its allies die; Rapid Gambit makes
  // every friendly unit act immediately; Hesitation is a stalled action (marker). Modelled as an
  // ally-wide Action Advance + a no-op marker. Deviation: Soulsplit's target-immunity + 5% Max-HP
  // loss per ally killed and the Complete-mode Rapid Gambit variants (Urge/Adapt/Slay) are not
  // modelled.
  'Cirrus': {
    abilities: [
      { id: 'cirrus_gambit', name: 'Rapid Gambit', targetRule: 'self', effects: [{ op: 'advance', pct: 1.0, to: 'allies' }] },
      { id: 'cirrus_hesitation', name: 'Hesitation', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'cirrus_hesitation', name: 'Hesitation', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['cirrus_gambit', 'cirrus_hesitation']),
  },
  // Cloud Knight Lieutenant: Yanqing (Boss, Ice): Rapturous Wind single 350%; Ironthorn single 400%
  // + Freeze; Ballad of Formation Breaker blast 400%/250%; Verging Edge charges then releases
  // Cascading Laceration (absent → authored AoE Ice 400%); Jadecarve Strike single 240%. Deviation:
  // the 4 Flying Swords summon + Sword Formation, Chilling Light, Qi Converge lock-on + Aethereal
  // Dreamflux, Frostthorn and the phase machine are not modelled.
  'Cloud Knight Lieutenant: Yanqing': {
    abilities: [
      { id: 'yanqing_wind', name: 'Rapturous Wind', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Ice' }] },
      { id: 'yanqing_ironthorn', name: 'Ironthorn', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Ice' }, { op: 'control', kind: 'Freeze', chance: 1.0, turns: 1 }] },
      { id: 'yanqing_ballad', name: 'Ballad of Formation Breaker', targetRule: 'blast', effects: [{ op: 'blast', mult: 4.0, adjMult: 2.5, elem: 'Ice' }] },
      { id: 'yanqing_verging', name: 'Verging Edge', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Ice' }] },
      { id: 'yanqing_jadecarve', name: 'Jadecarve Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 2.4, elem: 'Ice' }] },
    ],
    ai: new PatternAI(['yanqing_verging', 'yanqing_ballad', 'yanqing_ironthorn', 'yanqing_wind', 'yanqing_jadecarve']),
  },
  // Cocolia (Boss, Ice): Chill of Bone-Piercing Coagulation single 225%; Hoarfrost of Eternal
  // Isolation single 150% + Freeze; Wrath of Winterland Saints charges then releases Punishment of
  // Endless Winter (absent → authored AoE Ice 300%); Reverberating Ice blast 375%/150%; Icy Wind AoE
  // 150%; Doomsday Ice Cascade AoE 150% + Freeze a random target. Deviation: the Ice Edges summon,
  // Intensifying Cold, the Bronya-sourced Combat Redeployment / Windrider Bullet, the phase machine
  // and the Illusion mode are not modelled.
  'Cocolia': {
    abilities: [
      { id: 'cocolia_chill', name: 'Chill of Bone-Piercing Coagulation', targetRule: 'single', effects: [{ op: 'attack', mult: 2.25, elem: 'Ice' }] },
      { id: 'cocolia_hoarfrost', name: 'Hoarfrost of Eternal Isolation', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Ice' }, { op: 'control', kind: 'Freeze', chance: 1.0, turns: 1 }] },
      { id: 'cocolia_wrath', name: 'Wrath of Winterland Saints', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Ice' }] },
      { id: 'cocolia_reverb', name: 'Reverberating Ice', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.75, adjMult: 1.5, elem: 'Ice' }] },
      { id: 'cocolia_icywind', name: 'Icy Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Ice' }] },
      { id: 'cocolia_cascade', name: 'Doomsday Ice Cascade', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Ice' }, { op: 'control', kind: 'Freeze', chance: 1.0, turns: 1 }] },
    ],
    ai: new PatternAI(['cocolia_wrath', 'cocolia_reverb', 'cocolia_hoarfrost', 'cocolia_chill', 'cocolia_cascade', 'cocolia_icywind']),
  },
  // Cocolia, Mother of Deception (Boss, Ice/Imaginary): Bone-Shattering Cold single 350%; Harbinger
  // of Annihilation locks on then uses Soulrend Coldstream (authored single Ice 350%); Genesis Chord
  // single Imaginary 300% + Imprisonment; The Creation's Prelude charges then releases Last Choir of
  // Genesis (absent → authored AoE Imaginary 300%); Everwinter Reverberance AoE Ice 250%; Creator's
  // Resolve +40% SPD +20% DMG. Deviation: the Lance of the Eternal Freeze summon, Creator's Resolve's
  // element conversion + Toughness-Protection removal and Blizzardous Crisis are not modelled.
  'Cocolia, Mother of Deception': {
    abilities: [
      { id: 'cocoliaM_bone', name: 'Bone-Shattering Cold', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Ice' }] },
      { id: 'cocoliaM_harbinger', name: 'Harbinger of Annihilation', targetRule: 'single', cast: 1, effects: [{ op: 'lockon' }, { op: 'attack', mult: 3.5, elem: 'Ice' }] },
      { id: 'cocoliaM_genesis', name: 'Genesis Chord', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }, { op: 'control', kind: 'Imprisonment', chance: 1.0, turns: 1 }] },
      { id: 'cocoliaM_prelude', name: "The Creation's Prelude", targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'cocoliaM_reverb', name: 'Everwinter Reverberance', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }] },
      { id: 'cocoliaM_resolve', name: "Creator's Resolve", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'creator_resolve', name: "Creator's Resolve", mods: [{ stat: 'spdPct', value: 0.40 }, { stat: 'dmgAll', value: 0.20 }], turns: Infinity } }] },
    ],
    ai: new PatternAI(['cocoliaM_resolve', 'cocoliaM_prelude', 'cocoliaM_harbinger', 'cocoliaM_genesis', 'cocoliaM_bone', 'cocoliaM_reverb']),
  },
  // Daring Diceroller (Boss, Imaginary): Heavy Stakes single 350%; Distributed Investment bounce
  // 110%×5; Profit Cut AoE 250% + drains 10 Energy per target; Betting the Flop charges then locks on
  // (Daring Wager absent → authored AoE Imaginary 300%); Go All In charges (Doomed to Lose absent →
  // authored AoE Imaginary 300%). Deviation: the Points economy + Bet/Double Bet, the All or Nothing
  // summons, Temporary Good Fortune and the phase machine are not modelled.
  'Daring Diceroller': {
    abilities: [
      { id: 'dicer_heavy', name: 'Heavy Stakes', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Imaginary' }] },
      { id: 'dicer_invest', name: 'Distributed Investment', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.1, hits: 5, elem: 'Imaginary' }] },
      { id: 'dicer_profit', name: 'Profit Cut', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'drainEnergyFlat', amount: 10 }] },
      { id: 'dicer_betting', name: 'Betting the Flop', targetRule: 'aoe', cast: 1, effects: [{ op: 'lockon' }, { op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'dicer_goallin', name: 'Go All In', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['dicer_betting', 'dicer_goallin', 'dicer_heavy', 'dicer_invest', 'dicer_profit']),
  },
  // Decimator, Karma of Daythunder, Eye of Twilight (Boss, Lightning): Eye of Terror charges then
  // uses Unmaking Ashes: Godsfall (absent → authored AoE Lightning 300%); Extinguishment of the
  // Savaged Star reinstates (dispels CC / advances) its allies; Black Tide inflicts Rot. Modelled as
  // an ally Action Advance and a Rot marker debuff. Deviation: Remnants (shared HP with Languid
  // Ethmoid Bone / Dried Lacrimal Bone), the Black Tide Action-Order entity and Tides Below's sync
  // rate are not modelled.
  'Decimator, Karma of Daythunder, Eye of Twilight': {
    abilities: [
      { id: 'decimator_eye', name: 'Eye of Terror', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Lightning' }] },
      { id: 'decimator_reinstate', name: 'Extinguishment of the Savaged Star', targetRule: 'self', effects: [{ op: 'advance', pct: 0.20, to: 'allies' }] },
      { id: 'decimator_blacktide', name: 'Black Tide', targetRule: 'aoe', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'rot', name: 'Rot', mods: [], turns: 2 } }] },
    ],
    ai: new PatternAI(['decimator_eye', 'decimator_blacktide', 'decimator_reinstate']),
  },
  // Doomsday Beast (Boss, Imaginary/Quantum): Total Annihilation single 480%; Engine Boost grants
  // +60% ATK to its allies (except itself) for 2 turns; Cataclysm Precursor charges then releases
  // Impending Doom (absent → authored AoE Imaginary 400%); Calamity Tear AoE 135%; Tough Cuts AoE
  // 150% + Imprisonment. Deviation: Leviathan's Vestige Valor (untargetable until Antimatter Engine /
  // Disaster's Right Hand / Dawn's Left Hand are destroyed), the targeted Void Fission / Calamity
  // Strike supports and the Toughness restores are not modelled.
  'Doomsday Beast': {
    abilities: [
      { id: 'doomsday_annihilation', name: 'Total Annihilation', targetRule: 'single', effects: [{ op: 'attack', mult: 4.8, elem: 'Imaginary' }] },
      { id: 'doomsday_boost', name: 'Engine Boost', targetRule: 'self', effects: [{ op: 'buff', to: 'alliesOther', buff: { id: 'doomsday_enhanced', name: 'Enhanced', mods: [{ stat: 'atkPct', value: 0.60 }], turns: 2 } }] },
      { id: 'doomsday_cataclysm', name: 'Cataclysm Precursor', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'doomsday_tear', name: 'Calamity Tear', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.35, elem: 'Imaginary' }] },
      { id: 'doomsday_toughcuts', name: 'Tough Cuts', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Imaginary' }, { op: 'control', kind: 'Imprisonment', chance: 0.2, turns: 1 }] },
    ],
    ai: new PatternAI(['doomsday_boost', 'doomsday_cataclysm', 'doomsday_annihilation', 'doomsday_tear', 'doomsday_toughcuts']),
  },
  // First Genius, Entelechy, Zandar (Boss, Quantum): Celestial Displacement Theory blast 200%; DEL
  // Invasion_Variable blast 250%/200%; Origination && Destruction AoE 300% (2 targets); Antinomy of
  // Erudition single 200% + Antinomy mark; Imaginary Geometric Inference Method bounce 48%×10.
  // Deviation: the Evolution/Disputation mode machine (Mythos Axiom / Logos ALG), the Mythical Life
  // Evolution System / Titankin / Black Tide Creature summons, Stormride, Corporeal Formula and the
  // advance + control-dispel riders are not modelled.
  'First Genius, Entelechy, Zandar': {
    abilities: [
      { id: 'zandar_celestial', name: 'Celestial Displacement Theory', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.0, adjMult: 1.5, elem: 'Quantum' }] },
      { id: 'zandar_antinomy', name: 'Antinomy of Erudition', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Quantum' }, { op: 'debuff', chance: 1.0, buff: { id: 'antinomy', name: 'Antinomy', mods: [], turns: 2 } }] },
      { id: 'zandar_inference', name: 'Imaginary Geometric Inference Method', targetRule: 'random', effects: [{ op: 'bounce', mult: 0.48, hits: 10, elem: 'Quantum' }] },
      { id: 'zandar_del', name: 'DEL Invasion_Variable', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.0, elem: 'Quantum' }] },
      { id: 'zandar_origination', name: 'Origination && Destruction', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['zandar_del', 'zandar_origination', 'zandar_celestial', 'zandar_inference', 'zandar_antinomy']),
  },
  // Flame Reaver of Doomsday Led Astray (Boss, Physical): Demise's Storm blast 300%/100%; Fading Fate
  // AoE 200%; Dying Sobs charges then uses But Suffering is Essential (absent → authored AoE Physical
  // 300%); Silent Sorrow charges then uses Cry Not (absent → authored AoE Physical 300%); Plummeting
  // Strike single 300%. Deviation: the Long-Shattered Vessel summons + Mutual Sacrifice / absorb,
  // Calamity Power, the Corrosion economy, Shackle Shatter, Heed My Chants and Share In My Ritual are
  // not modelled.
  'Flame Reaver of Doomsday Led Astray': {
    abilities: [
      { id: 'reaverA_storm', name: "Demise's Storm", targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 1.0, elem: 'Physical' }] },
      { id: 'reaverA_fading', name: 'Fading Fate', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Physical' }] },
      { id: 'reaverA_dying', name: 'Dying Sobs', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
      { id: 'reaverA_silent', name: 'Silent Sorrow', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
      { id: 'reaverA_plummet', name: 'Plummeting Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['reaverA_dying', 'reaverA_silent', 'reaverA_storm', 'reaverA_fading', 'reaverA_plummet']),
  },
  // Flame Reaver of the Deepest Dark (Boss, Physical): Demise's Storm blast 400%/200%; Fading Fate AoE
  // 300%; Silent Sorrow charges then uses Cry Not (absent → authored AoE Physical 300%); Underworld's
  // Grief AoE 300%. Deviation: the Long-Shattered Vessel summons + absorb, Resolute Farewell DR-stacks,
  // Pain of Parting's HP-cost, Calamity Power, Prayers For Me / Libations For Me and the phases are not
  // modelled.
  'Flame Reaver of the Deepest Dark': {
    abilities: [
      { id: 'reaverB_storm', name: "Demise's Storm", targetRule: 'blast', effects: [{ op: 'blast', mult: 4.0, adjMult: 2.0, elem: 'Physical' }] },
      { id: 'reaverB_fading', name: 'Fading Fate', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
      { id: 'reaverB_silent', name: 'Silent Sorrow', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
      { id: 'reaverB_grief', name: "Underworld's Grief", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['reaverB_silent', 'reaverB_grief', 'reaverB_storm', 'reaverB_fading']),
  },
  // Fulminating Wolflord (Boss, Lightning): Broken Blades as Fang single 320%; Severed Iron as Claws
  // blast 240%/160%; Decimation of Roaring Storms AoE 260%; Going Solo single Lightning (300% DMG-up
  // stance). Sanguine Hunger Howls (Bloodlust → Moon Rage) is modelled with the shared `moonRage`
  // passive. Deviation: the Lunar Devourer state + Going Solo arena mechanic, Surrounded by Lupine
  // Shrieks, Pack's Edict Followed by Lightning and the Toughness-lock before Lunar Devourer are not
  // modelled.
  'Fulminating Wolflord': {
    abilities: [
      { id: 'wolflord_fang', name: 'Broken Blades as Fang', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Lightning' }] },
      { id: 'wolflord_claws', name: 'Severed Iron as Claws', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.4, adjMult: 1.6, elem: 'Lightning' }] },
      { id: 'wolflord_decimation', name: 'Decimation of Roaring Storms', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.6, elem: 'Lightning' }] },
      { id: 'wolflord_going_solo', name: 'Going Solo', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['wolflord_decimation', 'wolflord_claws', 'wolflord_fang', 'wolflord_going_solo']),
    passive: moonRage(),
  },

  // ── Batch 27 — bosses, part 3 ────────────────────────────────────────────────────────────────
  // Gepard (Boss, Ice): Fist of Conviction single 300%; Smite of Frost single 450%; Garrison Aura
  // Field grants a Barrier; Siege Support Locks On; Tit for Tat enters the Counter state and
  // retaliates with Smite of Frost. Deviation: the Silvermane Gunner/Cannoneer summons, the
  // Collective Shield (40% Max HP × allies) + Toughness protection, Will of Steel and the
  // Complete/Illusion phase machine (Balanced Warfare support state) are not modelled.
  'Gepard': {
    abilities: [
      { id: 'gepard_fist', name: 'Fist of Conviction', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Ice' }] },
      { id: 'gepard_smite', name: 'Smite of Frost', targetRule: 'single', effects: [{ op: 'attack', mult: 4.5, elem: 'Ice' }] },
      { id: 'gepard_siege', name: 'Siege Support', targetRule: 'single', effects: [{ op: 'lockon' }] },
      { id: 'gepard_retaliate', name: 'Tit for Tat', targetRule: 'self', effects: [{ op: 'counter', ability: { id: 'gepard_smite', name: 'Smite of Frost', targetRule: 'single', effects: [{ op: 'attack', mult: 4.5, elem: 'Ice' }] } }] },
      { id: 'gepard_garrison', name: 'Garrison Aura Field', targetRule: 'self', effects: [{ op: 'shield', frac: 0.10, to: 'allies' }] },
    ],
    ai: new PatternAI(['gepard_smite', 'gepard_fist', 'gepard_siege', 'gepard_retaliate', 'gepard_garrison']),
  },
  // Guide of Withering and Decay (Boss, Quantum): To Stay the Fallen single 400%; To Bury the
  // Slumbered distributes 1200% (authored AoE 600%); To Mourn the Departing Atrophy DMG to 3 random
  // targets (authored AoE); Bitterness Delivers Belated Evil News advances its allies. Inky Fog
  // grants 90% DMG reduction on spawn (Fragrance of Death removes it). Deviation: the Desperate
  // Bubble / Fragrance of Death state, the Pollux + The Long Arms of Sorrow partner entities, the
  // unremovable Hastened Death DoT, the Overloadable / Death Rattle target debuff, Atrophy true-HP
  // DMG, Corrosive Retaliation and Brilliance-Devouring Abyss weakness-sharing are not modelled.
  'Guide of Withering and Decay': {
    abilities: [
      { id: 'guide_stay', name: 'To Stay the Fallen', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Quantum' }] },
      { id: 'guide_bury', name: 'To Bury the Slumbered', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 6.0, elem: 'Quantum' }] },
      { id: 'guide_mourn', name: 'To Mourn the Departing', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Quantum' }] },
      { id: 'guide_bitterness', name: 'Bitterness Delivers Belated Evil News', targetRule: 'self', effects: [{ op: 'advance', pct: 0.50, to: 'allies' }] },
    ],
    ai: new PatternAI(['guide_bury', 'guide_stay', 'guide_mourn', 'guide_bitterness']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'inky_fog', name: 'Inky Fog of a Near-Death Dream', mods: [{ stat: 'mitigation', value: 0.90 }], turns: Infinity, sourceId: self.id })
      },
    },
  },
  // Harbinger of Death: Swarm Nightmare (Boss, Fire): Malignform Elytra single 240%; Rapacious
  // Appendages blast 240%/180%; Encroach, Mangle, Sate single 300%; Primal Hunger buffs its
  // Juvenile Sting summons (+20% SPD). Deviation: the Juvenile Sting summons + Gene Duplication
  // field (Combustion), the Corrosion economy (15% of reduced HP, converted back on Primordial
  // Tide, Swarm of Death), Mortal Instinct auto-action at 5 stacks and the per-phase SPD values are
  // not modelled.
  'Harbinger of Death: Swarm Nightmare': {
    abilities: [
      { id: 'swarm_elytra', name: 'Malignform Elytra', targetRule: 'single', effects: [{ op: 'attack', mult: 2.4, elem: 'Fire' }] },
      { id: 'swarm_appendages', name: 'Rapacious Appendages', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.4, adjMult: 1.8, elem: 'Fire' }] },
      { id: 'swarm_encroach', name: 'Encroach, Mangle, Sate', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Fire' }] },
      { id: 'swarm_primal', name: 'Primal Hunger', targetRule: 'self', effects: [{ op: 'buff', to: 'alliesOther', buff: { id: 'primal_hunger', name: 'Primal Hunger', mods: [{ stat: 'spdPct', value: 0.20 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['swarm_encroach', 'swarm_appendages', 'swarm_elytra', 'swarm_primal']),
  },
  // Hellcharred Shadow General (Boss, Wind): Gunblade: Swordfang single 300%; Great Ax: Irontalon
  // single 400% + Weaken; Heaven's Binds enhances self (modelled as a +30% SPD state); Wreathed in
  // Storm charges then uses Sweep the Heavens, Swallow the Earth (authored AoE 300%); Soul-Shattering
  // Malediction single 300% + Malediction mark. Deviation: the Bloodstained Lupine replacement of a
  // Departed character, Wreathed in Storm's untargetable window + Ecliptic Inner Beast resonance and
  // the true extra action are not modelled.
  'Hellcharred Shadow General': {
    abilities: [
      { id: 'shadow_swordfang', name: 'Gunblade: Swordfang', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] },
      { id: 'shadow_irontalon', name: 'Great Ax: Irontalon', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Wind' }, { op: 'debuff', chance: 1.0, buff: { id: 'shadow_weaken', name: 'Weaken', mods: [{ stat: 'weaken', value: 0.20 }], turns: 1 } }] },
      { id: 'shadow_binds', name: "Heaven's Binds", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'shadow_binds', name: "Heaven's Binds", mods: [{ stat: 'spdPct', value: 0.30 }], turns: 1 } }] },
      { id: 'shadow_wreathed', name: 'Wreathed in Storm', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Wind' }] },
      { id: 'shadow_malediction', name: 'Soul-Shattering Malediction', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }, { op: 'debuff', chance: 1.0, buff: { id: 'malediction', name: 'Malediction', mods: [], turns: 2 } }] },
    ],
    ai: new PatternAI(['shadow_wreathed', 'shadow_irontalon', 'shadow_swordfang', 'shadow_malediction', 'shadow_binds']),
  },
  // Ichor Memosprite: Judge of Oblivion (Boss, Imaginary): Hemotort Teethgrind single 450%; Hemotort
  // Glower Locks On + +50% SPD + extra action; Hemotort Saw single 600%; Hemotort Clamps AoE 400%;
  // Name the Culprit charges then uses Hemotort Decapitation (authored AoE 400%); Expedite Verdict
  // reduces DMG by 50% while intact (spawn mitigation). Deviation: the Ichor Memosprite: Pheasant
  // summons + Toughness-on-shield reduction, the Corrosion / Renewal economy, Hemotort Corruption DoT
  // and the broken-state delay/penalty are not modelled.
  'Ichor Memosprite: Judge of Oblivion': {
    abilities: [
      { id: 'judge_teethgrind', name: 'Hemotort Teethgrind', targetRule: 'single', effects: [{ op: 'attack', mult: 4.5, elem: 'Imaginary' }] },
      { id: 'judge_glower', name: 'Hemotort Glower', targetRule: 'single', effects: [{ op: 'lockon' }, { op: 'buff', to: 'self', buff: { id: 'judge_glower', name: 'Hemotort Glower', mods: [{ stat: 'spdPct', value: 0.50 }], turns: 3 } }, { op: 'advanceSelf', pct: 0.50 }] },
      { id: 'judge_saw', name: 'Hemotort Saw', targetRule: 'single', effects: [{ op: 'attack', mult: 6.0, elem: 'Imaginary' }] },
      { id: 'judge_clamps', name: 'Hemotort Clamps', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'judge_culprit', name: 'Name the Culprit', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'hemotort_corruption', name: 'Hemotort Corruption', mods: [], turns: 2 } }] },
    ],
    ai: new PatternAI(['judge_glower', 'judge_culprit', 'judge_saw', 'judge_teethgrind', 'judge_clamps']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'expedite_verdict', name: 'Expedite Verdict', mods: [{ stat: 'mitigation', value: 0.50 }], turns: Infinity, sourceId: self.id })
      },
    },
  },
  // Irontomb, Anti-Nous, Funeral of Gnosis (Boss): the dataset entry carries no skill list, so a
  // minimal authored strike stands in for the body. Deviation: Irontomb resolves through a scripted
  // multi-entity encounter (Anti-Nous / Gnosis phases) that the raw data does not expose; authored
  // element and coefficient only.
  'Irontomb, Anti-Nous, Funeral of Gnosis': {
    abilities: [
      { id: 'irontomb_strike', name: 'Funeral of Gnosis', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['irontomb_strike']),
  },
  // Live Stream Assistant (Boss, Quantum): Net Battle! single 250%; Bring the Beat In! AoE 350%. The
  // boss body has only these two authored attacks in the dataset.
  'Live Stream Assistant': {
    abilities: [
      { id: 'live_net', name: 'Net Battle!', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Quantum' }] },
      { id: 'live_beat', name: 'Bring the Beat In!', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.5, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['live_beat', 'live_net']),
  },
  // Lord of Saṃvartasthāyi, Asat Pramad (Boss, Imaginary): Existential Farce AoE; Mocked Gaze
  // single; Meme Setup charges then strikes (Meme'd); Nihility's Joy / Triple Contempt AoE; Board-
  // Clearing Ball Game AoE + Strong Reverberation mark. The dataset gives no coefficients → authored
  // values. Deviation: the Three-Faced Incarnation (three faces sharing HP, Formation/Existence
  // untargetable), the Take the Stage / The Game Is On Action-Order actors, Comediologist summons,
  // the Meme'd / Prana-Siphon marks, Strong Reverberation and the dice Gambit of Converging Fates
  // are not modelled.
  'Lord of Saṃvartasthāyi, Asat Pramad': {
    abilities: [
      { id: 'asat_farce', name: 'Existential Farce', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'asat_gaze', name: 'Mocked Gaze', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'asat_meme', name: 'Meme Setup', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'memed', name: "Meme'd", mods: [], turns: 3 } }] },
      { id: 'asat_nihility', name: "Nihility's Joy", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'asat_triple', name: 'Triple Contempt', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'asat_ballgame', name: 'Board-Clearing Ball Game', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'strong_reverberation', name: 'Strong Reverberation', mods: [], turns: 2 } }] },
    ],
    ai: new PatternAI(['asat_meme', 'asat_ballgame', 'asat_triple', 'asat_farce', 'asat_gaze', 'asat_nihility']),
  },
  // Lord of Saṃvartasthāyi, Asat Pramad: "Decay" (Boss, Imaginary): the Decay face — Existential
  // Farce / Mocked Gaze / Meme Setup / Nihility's Joy / Triple Contempt / Board-Clearing Ball Game.
  // Dataset gives no coefficients → authored values. Same face-machine deviation as the base Lord.
  'Lord of Saṃvartasthāyi, Asat Pramad: "Decay"': {
    abilities: [
      { id: 'decay_farce', name: 'Existential Farce', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'decay_gaze', name: 'Mocked Gaze', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'decay_meme', name: 'Meme Setup', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'memed', name: "Meme'd", mods: [], turns: 3 } }] },
      { id: 'decay_ballgame', name: 'Board-Clearing Ball Game', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'strong_reverberation', name: 'Strong Reverberation', mods: [], turns: 2 } }] },
      { id: 'decay_nihility', name: "Nihility's Joy", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'decay_triple', name: 'Triple Contempt', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['decay_meme', 'decay_ballgame', 'decay_triple', 'decay_farce', 'decay_gaze', 'decay_nihility']),
  },
  // Lord of Saṃvartasthāyi, Asat Pramad: "Existence" (Boss, Imaginary): the Existence face —
  // Existential Farce / Mocked Gaze / Meme Setup / Nihility's Joy / Triple Contempt. Dataset gives no
  // coefficients → authored values. Same face-machine deviation as the base Lord.
  'Lord of Saṃvartasthāyi, Asat Pramad: "Existence"': {
    abilities: [
      { id: 'exist_farce', name: 'Existential Farce', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'exist_gaze', name: 'Mocked Gaze', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'exist_meme', name: 'Meme Setup', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'debuff', chance: 1.0, buff: { id: 'memed', name: "Meme'd", mods: [], turns: 3 } }] },
      { id: 'exist_nihility', name: "Nihility's Joy", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Imaginary' }] },
      { id: 'exist_triple', name: 'Triple Contempt', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['exist_meme', 'exist_triple', 'exist_farce', 'exist_gaze', 'exist_nihility']),
  },
  // Maddened Feixiao (Boss, Wind): Gunblade: Swordfang single 350%; Great Ax: Irontalon single 400%
  // + Weaken; Heaven's Binds enhances self (modelled as a +30% SPD state). Safeguard talent is
  // modelled with the shared `safeguard` passive (DMG reduction while intact, delay + vulnerability
  // when broken). Deviation: the true extra action from Heaven's Binds is not modelled.
  'Maddened Feixiao': {
    abilities: [
      { id: 'feixiao_swordfang', name: 'Gunblade: Swordfang', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Wind' }] },
      { id: 'feixiao_irontalon', name: 'Great Ax: Irontalon', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Wind' }, { op: 'debuff', chance: 1.0, buff: { id: 'feixiao_weaken', name: 'Weaken', mods: [{ stat: 'weaken', value: 0.20 }], turns: 2 } }] },
      { id: 'feixiao_binds', name: "Heaven's Binds", targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'feixiao_binds', name: "Heaven's Binds", mods: [{ stat: 'spdPct', value: 0.30 }], turns: 1 } }] },
    ],
    ai: new PatternAI(['feixiao_irontalon', 'feixiao_swordfang', 'feixiao_binds']),
    passive: safeguard(),
  },
  // Memory Zone Meme "Something Unto Death" (Boss, Physical): Funereal Kiss single 400%; Sunken
  // Rain AoE 250%; Biting Obituary greatly increases its DMG (+100% for 1 turn). Deviation: the
  // Morbid Dream debuff + Sombrous Sepulcher summons (and the all-Dreamed defeat condition) and the
  // Complete-mode DMG-Boost stacks are not modelled.
  'Memory Zone Meme "Something Unto Death"': {
    abilities: [
      { id: 'meme_kiss', name: 'Funereal Kiss', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Physical' }] },
      { id: 'meme_rain', name: 'Sunken Rain', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Physical' }] },
      { id: 'meme_obituary', name: 'Biting Obituary', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'biting_obituary', name: 'Biting Obituary', mods: [{ stat: 'dmgAll', value: 1.0 }], turns: 1 } }] },
    ],
    ai: new PatternAI(['meme_obituary', 'meme_kiss', 'meme_rain']),
  },
  // ============================================================================================
  // Batch 28 — Bosses (part 3). All reuse existing primitives; no new ops. Values without a
  // dataset coefficient (summon "release" abilities, target-Max-HP riders) are authorial and
  // flagged as deviations in each entry's comment.
  // ============================================================================================
  // Monitoring Automaton Prototype 2 (Boss, Physical): Banishing Punch single 300%; Burning Beam
  // single 300% + 30% Action Delay; Overload Warning charge -> Controlled Blasting (authored AoE
  // 300%). Deviation: Auxiliary Robot Arm Unit summon + Overload/Controlled Blasting, Oppressive
  // Embrace Restrain + 50% Target Max HP DMG, and Disabling Field (target-Max-HP DMG) are not
  // modelled.
  'Monitoring Automaton Prototype 2': {
    abilities: [
      { id: 'monitor_punch', name: 'Banishing Punch', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'monitor_beam', name: 'Burning Beam', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }, { op: 'delay', pct: 0.30 }] },
      { id: 'monitor_field', name: 'Disabling Field', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'monitor_overload', name: 'Overload Warning', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['monitor_overload', 'monitor_beam', 'monitor_punch', 'monitor_field']),
  },
  // Murata Graphia, Founding Artist (Boss, Fire): Cinder Crimson Blockprint single 300%; Infernal
  // Gory Blockprint single 400% + Grudge Ablaze (modelled as Burn DoT); Phantasmal Fiend-Sketch
  // charge -> authored AoE 300%. Deviation: God-Devourer Offspring summons (cap 2, one advanced
  // 100%, one 50%), Beyond-Human Realm, Grudge Ablaze's Endure/Extinguish choice, Grand Vista:
  // Devourer, and the third Ceiling-phase variant are not modelled.
  'Murata Graphia, Founding Artist': {
    abilities: [
      { id: 'murata_cinder', name: 'Cinder Crimson Blockprint', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Fire' }] },
      { id: 'murata_gory', name: 'Infernal Gory Blockprint', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Fire' }, { op: 'dot', kind: 'Burn', mult: 0.5, turns: 1 }] },
      { id: 'murata_sketch', name: 'Phantasmal Fiend-Sketch', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['murata_sketch', 'murata_gory', 'murata_cinder']),
  },
  // Opportunistic Provocateur (Boss, Wind/Imaginary): Acchata: Forming Winds single Wind 300%;
  // Cleansing Sweep AoE Wind 150%; Furor blast Imaginary 250%/150%; Arbor Apotheosis AoE Imaginary
  // 250%; Entwining Roots: Paramount Writhe AoE Imaginary 250% + Action Delay; Null lock-on;
  // Black Prana's Snare Prana-Siphon marker; Non-Living drains 5 Energy. Safeguard talent uses the
  // shared passive. Deviation: Abundance/Destruction Lotus summons, Non-Destructing / Black Prana's
  // Return talents, Form switching, Toughness Protection, and the Abundance/Destruction buffs are
  // not modelled.
  'Opportunistic Provocateur': {
    abilities: [
      { id: 'prov_acchata', name: 'Acchata: Forming Winds', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] },
      { id: 'prov_sweep', name: 'Cleansing Sweep', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Wind' }] },
      { id: 'prov_furor', name: 'Furor', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 1.5, elem: 'Imaginary' }] },
      { id: 'prov_arbor', name: 'Arbor Apotheosis', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'prov_writhe', name: 'Entwining Roots: Paramount Writhe', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }, { op: 'delay', pct: 0.30 }] },
      { id: 'prov_null', name: 'Null', targetRule: 'random', effects: [{ op: 'lockon' }] },
      { id: 'prov_snare', name: "Black Prana's Snare", targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'prana_siphon', name: 'Prana-Siphon', mods: [], turns: 2 } }] },
      { id: 'prov_nonliving', name: 'Non-Living', targetRule: 'single', effects: [{ op: 'drainEnergyFlat', amount: 5 }] },
    ],
    ai: new PatternAI(['prov_writhe', 'prov_furor', 'prov_arbor', 'prov_acchata', 'prov_sweep', 'prov_null', 'prov_snare']),
    passive: safeguard(),
  },
  // Paramount Bliss Inverted: Illwish Archlotus (Boss, Lightning): Rift Pistil single 400%; Siphon
  // Woe AoE (authored 200% Lightning); Incipient Bloom charge -> Euphoric Embrace (authored AoE
  // 300%); First Bloom stacks Wicked Grin (+10% DMG, max 10). Deviation: Happiness / Happiness
  // Puppet, Illwish Lotus summons, Punchline, Laughter's End, the Wicked Grin economy, All Wishes,
  // and Inverted Severance are not modelled.
  'Paramount Bliss Inverted: Illwish Archlotus': {
    abilities: [
      { id: 'illwish_rift', name: 'Rift Pistil', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Lightning' }] },
      { id: 'illwish_siphon', name: 'Siphon Woe', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Lightning' }] },
      { id: 'illwish_bloom', name: 'Incipient Bloom', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Lightning' }] },
      { id: 'illwish_wicked', name: 'First Bloom', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'wicked_grin', name: 'Wicked Grin', mods: [{ stat: 'dmgAll', value: 0.10 }], stacks: 1, maxStacks: 10 } }] },
    ],
    ai: new PatternAI(['illwish_bloom', 'illwish_siphon', 'illwish_rift', 'illwish_wicked']),
  },
  // Phantylia the Undying (Boss, Wind/Lightning/Imaginary): Acchata: Forming Winds single Wind
  // 300%; Cleansing Sweep AoE Wind 280%; Weaving Roots single Wind 300% + 30% Delay; Acchata:
  // Roaring Thunder single Lightning 380%; Furor blast Imaginary 300%/200%; Kalpa Descend lock-on;
  // Samsara -1 SP; Mend heals 50% Max HP; Black Prana's Snare marker. Deviation: Abundance/
  // Destruction Lotus summons, Bloom/Havoc, Repose, per-phase Max HP +35%, Starfall Mooncry, and her
  // 2 extra actions per turn are not modelled.
  'Phantylia the Undying': {
    abilities: [
      { id: 'phantylia_winds', name: 'Acchata: Forming Winds', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] },
      { id: 'phantylia_sweep', name: 'Cleansing Sweep', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.8, elem: 'Wind' }] },
      { id: 'phantylia_roots', name: 'Weaving Roots', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }, { op: 'delay', pct: 0.30 }] },
      { id: 'phantylia_thunder', name: 'Acchata: Roaring Thunder', targetRule: 'single', effects: [{ op: 'attack', mult: 3.8, elem: 'Lightning' }] },
      { id: 'phantylia_furor', name: 'Furor', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 2.0, elem: 'Imaginary' }] },
      { id: 'phantylia_kalpa', name: 'Kalpa Descend', targetRule: 'random', effects: [{ op: 'lockon' }] },
      { id: 'phantylia_samsara', name: 'Samsara', targetRule: 'single', effects: [{ op: 'sp', delta: -1 }] },
      { id: 'phantylia_snare', name: "Black Prana's Snare", targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'prana_siphon', name: 'Prana-Siphon', mods: [], turns: 2 } }] },
      { id: 'phantylia_mend', name: 'Mend', targetRule: 'self', effects: [{ op: 'heal', frac: 0.50 }] },
    ],
    ai: new PatternAI(['phantylia_furor', 'phantylia_thunder', 'phantylia_sweep', 'phantylia_roots', 'phantylia_winds', 'phantylia_samsara', 'phantylia_mend']),
  },
  // Pollux, Netherwing Husk, Ferry of Souls (Boss, Quantum): To Stay the Fallen single 300%; To
  // Bury the Slumbered AoE 800%; To Mourn the Departing AoE (authored 300% Quantum); Bitterness
  // Delivers Belated Evil News advances allies. Inky Fog (DMG taken -90%) is modelled as an onSpawn
  // self-buff. Deviation: The Long Arms of Sorrow partner, Desperate Bubble, Fragrance of Death,
  // Hastened Death DoT, Atrophy true-HP DMG, and Indulging Slumber are not modelled.
  'Pollux, Netherwing Husk, Ferry of Souls': {
    abilities: [
      { id: 'pollux_stay', name: 'To Stay the Fallen', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Quantum' }] },
      { id: 'pollux_bury', name: 'To Bury the Slumbered', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 8.0, elem: 'Quantum' }] },
      { id: 'pollux_mourn', name: 'To Mourn the Departing', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Quantum' }] },
      { id: 'pollux_bitterness', name: 'Bitterness Delivers Belated Evil News', targetRule: 'self', effects: [{ op: 'advance', pct: 0.50, to: 'allies' }] },
    ],
    ai: new PatternAI(['pollux_bury', 'pollux_stay', 'pollux_mourn', 'pollux_bitterness']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'inky_fog', name: 'Inky Fog of a Near-Death Dream', mods: [{ stat: 'mitigation', value: 0.90 }], turns: Infinity, sourceId: self.id })
        sim.log(`${self.name} shrouds itself in Inky Fog (DMG taken -90%)`)
      },
    },
  },
  // Shadow of "Feixiao" (Boss, Wind): Gunblade: Swordfang single 350%; Great Ax: Irontalon single
  // 400% + Weaken; Passing Tempest AoE 360%; Wreathed in Storm charge -> Sweep the Heavens,
  // Swallow the Earth (authored AoE 360%). Safeguard talent uses the shared passive. Deviation:
  // the shared-HP parts (Nebula Devourer / Planeshred Claws / Worldpurge Tail), Seance, Heaven's
  // Binds' true extra action, and Wreathed in Storm's untargetable + Ecliptic resonance are not
  // modelled.
  'Shadow of "Feixiao"': {
    abilities: [
      { id: 'feixiaoS_swordfang', name: 'Gunblade: Swordfang', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Wind' }] },
      { id: 'feixiaoS_irontalon', name: 'Great Ax: Irontalon', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Wind' }, { op: 'debuff', chance: 1.0, buff: { id: 'feixiaoS_weaken', name: 'Weaken', mods: [{ stat: 'weaken', value: 0.20 }], turns: 2 } }] },
      { id: 'feixiaoS_tempest', name: 'Passing Tempest', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.6, elem: 'Wind' }] },
      { id: 'feixiaoS_wreathed', name: 'Wreathed in Storm', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.6, elem: 'Wind' }] },
    ],
    ai: new PatternAI(['feixiaoS_wreathed', 'feixiaoS_tempest', 'feixiaoS_irontalon', 'feixiaoS_swordfang']),
    passive: safeguard(),
  },
  // Silver Knight of Virtuous Gallantry (Boss, Physical): Piety single 360%; Imbue Devotion blast
  // 350%/250%; So Cometh Beauty's Knight AoE 120%; Diadem of the Stale self Shield 15% Max HP.
  // Deviation: the Speartip / Shield / The Honored statue summons, Soulfreed, the three Combat
  // Stances, Toughness Protection, killing-blow talents, and Apocalyptic Shadow toughness scaling
  // are not modelled.
  'Silver Knight of Virtuous Gallantry': {
    abilities: [
      { id: 'knight_piety', name: 'Piety', targetRule: 'single', effects: [{ op: 'attack', mult: 3.6, elem: 'Physical' }] },
      { id: 'knight_imbue', name: 'Imbue Devotion', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.5, adjMult: 2.5, elem: 'Physical' }] },
      { id: 'knight_beauty', name: "So Cometh Beauty's Knight", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.2, elem: 'Physical' }] },
      { id: 'knight_diadem', name: 'Diadem of the Stale', targetRule: 'self', effects: [{ op: 'shield', frac: 0.15 }] },
    ],
    ai: new PatternAI(['knight_beauty', 'knight_imbue', 'knight_piety', 'knight_diadem']),
  },
  // Sky-Shrouding Stardevourer Swarm (Boss, Quantum): Swarm King Cannon single 350%; Radiating
  // Venom single 300% + Entanglement; Pyrolysis Death Beam blast 450%/350%; Nesting Incubation
  // charge -> Ovum of Collapsed Star (authored AoE 400%). Deviation: Gnaw Sting / Lesser Sting
  // summons, the Insect Egg economy, Growth Hormones, Devoured by the Swarm, and the toughness
  // reduction triggers are not modelled.
  'Sky-Shrouding Stardevourer Swarm': {
    abilities: [
      { id: 'swarmK_cannon', name: 'Swarm King Cannon', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Quantum' }] },
      { id: 'swarmK_venom', name: 'Radiating Venom', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }, { op: 'control', kind: 'Entanglement', chance: 1.0 }] },
      { id: 'swarmK_beam', name: 'Pyrolysis Death Beam', targetRule: 'blast', effects: [{ op: 'blast', mult: 4.5, adjMult: 3.5, elem: 'Quantum' }] },
      { id: 'swarmK_nesting', name: 'Nesting Incubation', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['swarmK_nesting', 'swarmK_beam', 'swarmK_venom', 'swarmK_cannon']),
  },
  // Soulhook Sovereign (Boss, Lightning): Midnight Tumult single 250% + Shock; Caressing Moonlight
  // blast 250%/175%; Seething Whisper of the Fallen AoE 250% + Shock. Deviation: the Soulcaller
  // elite summons (Blaze/Ice Out of Space, Beyond Overcooked, Shell of Faded Rage), weakness
  // transfer + Sanguine Gaze, Soulcaller HP-share, and Tremble / Cruelty extra attacks are not
  // modelled.
  'Soulhook Sovereign': {
    abilities: [
      { id: 'soulhook_whisper', name: 'Seething Whisper of the Fallen', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Lightning' }, { op: 'dot', kind: 'Shock', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'soulhook_moonlight', name: 'Caressing Moonlight', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 1.75, elem: 'Lightning' }] },
      { id: 'soulhook_tumult', name: 'Midnight Tumult', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }, { op: 'dot', kind: 'Shock', mult: 0.5, turns: 3, chance: 1.0 }] },
    ],
    ai: new PatternAI(['soulhook_whisper', 'soulhook_moonlight', 'soulhook_tumult']),
  },
  // Starbane Doombringer (Boss, Quantum/Imaginary): Total Annihilation single Quantum 220% +
  // Imaginary 220%; Mass Infection AoE Quantum 180% + Imaginary 180%; Calamity Tear AoE Imaginary
  // 260%; The Breakdown of Tyranny AoE Imaginary 300%; Cataclysm Precursor charge -> Impending Doom
  // (authored AoE 300%). Safeguard uses the shared passive when broken apart. Deviation: the parts
  // (Antimatter Engine / Disaster's Right Hand / Dawn's Left Hand), Leviathan's Vestige Valor
  // untargetable, Quantum/Imaginary Infusion, Snarelock, Feigned Death, and Engine Boost are not
  // modelled.
  'Starbane Doombringer': {
    abilities: [
      { id: 'doombringer_total', name: 'Total Annihilation', targetRule: 'single', effects: [{ op: 'attack', mult: 2.2, elem: 'Quantum' }, { op: 'attack', mult: 2.2, elem: 'Imaginary' }] },
      { id: 'doombringer_infection', name: 'Mass Infection', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.8, elem: 'Quantum' }, { op: 'aoe', mult: 1.8, elem: 'Imaginary' }] },
      { id: 'doombringer_tear', name: 'Calamity Tear', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.6, elem: 'Imaginary' }] },
      { id: 'doombringer_breakdown', name: 'The Breakdown of Tyranny', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
      { id: 'doombringer_cataclysm', name: 'Cataclysm Precursor', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['doombringer_cataclysm', 'doombringer_breakdown', 'doombringer_infection', 'doombringer_total', 'doombringer_tear']),
    passive: safeguard(),
  },
  // Starcrusher Swarm King: Skaracabaz (Boss, Quantum): Swarm King Cannon single 350%; Radiating
  // Venom single 300% + Entanglement; Pyrolysis Death Beam blast 480%/400%; Horn Clash single 320%
  // + Entanglement; Carapace of Nurtured Disaster charge -> Ovum of Collapsed Star (authored AoE
  // 400%). Deviation: Gnaw Sting / Lesser Sting summons, the Multiply state, Decay/Entomon Eulogy
  // talents, toughness reduction, and the per-phase Max HP +40% are not modelled.
  'Starcrusher Swarm King: Skaracabaz': {
    abilities: [
      { id: 'skara_cannon', name: 'Swarm King Cannon', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Quantum' }] },
      { id: 'skara_venom', name: 'Radiating Venom', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }, { op: 'control', kind: 'Entanglement', chance: 1.0 }] },
      { id: 'skara_beam', name: 'Pyrolysis Death Beam', targetRule: 'blast', effects: [{ op: 'blast', mult: 4.8, adjMult: 4.0, elem: 'Quantum' }] },
      { id: 'skara_horn', name: 'Horn Clash', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Quantum' }, { op: 'control', kind: 'Entanglement', chance: 1.0 }] },
      { id: 'skara_carapace', name: 'Carapace of Nurtured Disaster', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 4.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['skara_carapace', 'skara_beam', 'skara_horn', 'skara_venom', 'skara_cannon']),
  },
  // ============================================================================================
  // Batch 29 — Bosses (part 4, FINAL). Closes the boss rank. All reuse existing primitives; no
  // new ops. Values without a dataset coefficient (charge "release" abilities, summon-driven or
  // target-Max-HP riders) are authorial and flagged as deviations in each entry's comment.
  // ============================================================================================
  // Stellaron Hunter: Kafka (Boss, Lightning): Midnight Tumult single 250% + Shock 75%×3; Caressing
  // Moonlight blast 300%/200%; Silent and Sharp Mockery AoE 250%. Deviation: Tremble, Cruelty,
  // Griever and the Dominated-target mechanics are not modelled.
  'Stellaron Hunter: Kafka': {
    abilities: [
      { id: 'kafka_tumult', name: 'Midnight Tumult', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }, { op: 'dot', kind: 'Shock', mult: 0.75, turns: 3, chance: 1.0 }] },
      { id: 'kafka_moonlight', name: 'Caressing Moonlight', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 2.0, elem: 'Lightning' }] },
      { id: 'kafka_mockery', name: 'Silent and Sharp Mockery', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['kafka_mockery', 'kafka_moonlight', 'kafka_tumult']),
  },
  // Stellaron Hunter: Sam (Boss, Fire): BHF: Fiery Advance single 200%; BHF: Heavenly Fire blast
  // 220%/160%; BBHF: Scorched Earth AoE 180%. Deviation: the Secondary Combustion state machine
  // (Molten Core / Molten Energy / SP combustion / Immolation / Thermobaric Field / blanks the
  // player's SP economy) is not modelled; only the direct-damage kit is.
  'Stellaron Hunter: Sam': {
    abilities: [
      { id: 'sam_fiery', name: 'BHF: Fiery Advance', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Fire' }] },
      { id: 'sam_heavenly', name: 'BHF: Heavenly Fire', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.2, adjMult: 1.6, elem: 'Fire' }] },
      { id: 'sam_scorched', name: 'BBHF: Scorched Earth', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.8, elem: 'Fire' }] },
    ],
    ai: new PatternAI(['sam_scorched', 'sam_heavenly', 'sam_fiery']),
  },
  // Sublime, Radiant, Avatar of the Sky (Boss, Fire/Lightning/Imaginary): barrage abilities modelled
  // as bounce (6 hits); Flame Beyond the Horizon / Exhalation AoE Fire 200%; Surge Across the
  // Leagues / Illumination AoE Lightning 250%; charge releases authored; Discharge single Lightning
  // 250%. Deviation: the Temperature / Helium Flash / Thundercloud weather economy, Daythunder Raven
  // and Hundred-Eyes summon parts (shared-HP + toughness-transfer), the phase-3 split, and
  // Extinguishment of the Savaged Star's even-distributed Black-Tide DMG are not modelled.
  'Sublime, Radiant, Avatar of the Sky': {
    abilities: [
      { id: 'sublime_three', name: 'Three Thousand Leagues Ablaze', targetRule: 'random', effects: [{ op: 'bounce', mult: 2.0, hits: 6, elem: 'Fire' }] },
      { id: 'sublime_flame', name: 'Flame Beyond the Horizon', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Fire' }] },
      { id: 'sublime_exhalation', name: 'Exhalation of the Month of Everday', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Fire' }, { op: 'delay', pct: 0.30 }] },
      { id: 'sublime_splendor', name: 'Splendor, Like Clouds Cresting the Sky', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Fire' }] },
      { id: 'sublime_thunder', name: 'Thunder From the Distance', targetRule: 'random', effects: [{ op: 'bounce', mult: 2.0, hits: 6, elem: 'Lightning' }] },
      { id: 'sublime_surge', name: 'Surge Across the Leagues', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Lightning' }] },
      { id: 'sublime_illumination', name: 'Illumination of the Month of Fortune', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Lightning' }] },
      { id: 'sublime_thunderclap', name: 'Thunderclap, Quake of Mount and Seas', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.5, elem: 'Lightning' }] },
      { id: 'sublime_discharge', name: 'Discharge', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['sublime_three', 'sublime_flame', 'sublime_exhalation', 'sublime_splendor', 'sublime_thunder', 'sublime_surge', 'sublime_illumination', 'sublime_thunderclap', 'sublime_discharge']),
  },
  // Super Idol: Center of Attention (Boss, Quantum): Net Battle! single 350%; Bring the Beat In!
  // AoE 350%; Get On the Mic! lock-on. Deviation: the Live Showdown sub-field split (prime/sub-field
  // targeting, Elation Skills, countdown) has no generic primitive and is not modelled; Stream Promo,
  // Fan Frenzy, Follower Growth and the SP/support talents are omitted.
  'Super Idol: Center of Attention': {
    abilities: [
      { id: 'idol_net', name: 'Net Battle!', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Quantum' }] },
      { id: 'idol_beat', name: 'Bring the Beat In!', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.5, elem: 'Quantum' }] },
      { id: 'idol_mic', name: 'Get On the Mic!', targetRule: 'random', effects: [{ op: 'lockon' }] },
    ],
    ai: new PatternAI(['idol_beat', 'idol_net', 'idol_mic']),
  },
  // Svarog (Boss, Physical): Banishing Punch single 300%; Burning Beam single 300% + 30% Delay;
  // Disabling Field / Oppressive Embrace single 300%; Overload Warning charge -> authored AoE 300%.
  // Deviation: Boost Deployment / Emergency / Tactical Support summons (Auxiliary Robot Arm,
  // Oppressive Embrace Restrain + 50% Target Max HP DMG) and Overload Counter are not modelled.
  'Svarog': {
    abilities: [
      { id: 'svarog_punch', name: 'Banishing Punch', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'svarog_beam', name: 'Burning Beam', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }, { op: 'delay', pct: 0.30 }] },
      { id: 'svarog_field', name: 'Disabling Field', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'svarog_embrace', name: 'Oppressive Embrace', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'svarog_overload', name: 'Overload Warning', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['svarog_overload', 'svarog_beam', 'svarog_punch', 'svarog_embrace', 'svarog_field']),
  },
  // Swarm: True Sting (Boss, Wind): Time to Battle single 250%; War Gear single 300%; Cyclonic
  // Swarm AoE 200%; Ready Order charge -> authored AoE 200%. Deviation: Propagation / Meiotic
  // Division summons (Lesser Sting / True Sting spawns) and Entomon Eulogy are not modelled.
  'Swarm: True Sting': {
    abilities: [
      { id: 'sting_battle', name: 'Time to Battle', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Wind' }] },
      { id: 'sting_wargear', name: 'War Gear', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] },
      { id: 'sting_cyclonic', name: 'Cyclonic Swarm', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Wind' }] },
      { id: 'sting_ready', name: 'Ready Order', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 2.0, elem: 'Wind' }] },
    ],
    ai: new PatternAI(['sting_ready', 'sting_cyclonic', 'sting_wargear', 'sting_battle']),
  },
  // Ten Stonehearts: Aventurine of Stratagems (Boss, Imaginary): Heavy Stakes single 350%;
  // Distributed Investment bounce 110%×5; Points Fountain AoE 250%; The Loser's Time Is Over single
  // 570%; The Winner Takes It All AoE 570%. Deviation: Stratagems' Wagering (blinded dice / debt /
  // coin-flip economy) and the Eyes Once/Twice/Thrice Closed for Lies/Trickery/Schemes talents are
  // not modelled.
  'Ten Stonehearts: Aventurine of Stratagems': {
    abilities: [
      { id: 'avent_heavy', name: 'Heavy Stakes', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Imaginary' }] },
      { id: 'avent_invest', name: 'Distributed Investment', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.1, hits: 5, elem: 'Imaginary' }] },
      { id: 'avent_fountain', name: 'Points Fountain', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'avent_loser', name: "The Loser's Time Is Over", targetRule: 'single', effects: [{ op: 'attack', mult: 5.7, elem: 'Imaginary' }] },
      { id: 'avent_winner', name: 'The Winner Takes It All', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 5.7, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['avent_winner', 'avent_loser', 'avent_fountain', 'avent_heavy', 'avent_invest']),
  },
  // The Giver, Master of Legions, Lance of Fury (Boss, Imaginary, all res 20%): Worldsplitting Spine
  // blast 160%/140%; Survivors Unto Dead Waters single 280%; Pyre of High Graves AoE 180%;
  // Ruination of Night and Light bounce 90%×4; The Vanquished Behold Woe vuln marker. Deviation:
  // Glory to All Honorable Dead, The Fallen Feeds My Might, Polis Protector, Tyrant of the Vanquished
  // and Bearing All Wounds' revive/phase mechanics are not modelled.
  'The Giver, Master of Legions, Lance of Fury': {
    abilities: [
      { id: 'giver_spine', name: 'Worldsplitting Spine', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.6, adjMult: 1.4, elem: 'Imaginary' }] },
      { id: 'giver_survivors', name: 'Survivors Unto Dead Waters', targetRule: 'single', effects: [{ op: 'attack', mult: 2.8, elem: 'Imaginary' }] },
      { id: 'giver_pyre', name: 'Pyre of High Graves', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.8, elem: 'Imaginary' }] },
      { id: 'giver_ruination', name: 'Ruination of Night and Light', targetRule: 'random', effects: [{ op: 'bounce', mult: 0.9, hits: 4, elem: 'Imaginary' }] },
      { id: 'giver_woe', name: 'The Vanquished Behold Woe', targetRule: 'single', effects: [{ op: 'debuff', chance: 0.5, buff: { id: 'giver_woe', name: 'Woe', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['giver_pyre', 'giver_spine', 'giver_survivors', 'giver_ruination', 'giver_woe']),
  },
  // The Past, Present, and Eternal Show (Boss, Physical/Imaginary): composite of the Harmonious
  // Choir trio — Cleansing Flagellation single Physical 320%; Admonishment of the Masses blast
  // Physical 280%/200%; All Is Bright single Imaginary 280%; All Is Calm Alien-Dream vuln marker;
  // Redeeming Grace single Imaginary 360%; A Cup Runneth Over For You charge (DoT); Holy Night charge
  // -> authored AoE Imaginary 300%. Deviation: Hearing Together As One, Appeal/Decree (element
  // switching + shared-state talents), and Shackle-Bearing Messenger are not modelled.
  'The Past, Present, and Eternal Show': {
    abilities: [
      { id: 'show_flagellation', name: 'Cleansing Flagellation', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Physical' }] },
      { id: 'show_admonishment', name: 'Admonishment of the Masses', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.8, adjMult: 2.0, elem: 'Physical' }] },
      { id: 'show_bright', name: 'All Is Bright', targetRule: 'single', effects: [{ op: 'attack', mult: 2.8, elem: 'Imaginary' }] },
      { id: 'show_calm', name: 'All Is Calm', targetRule: 'aoe', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'alien_dream', name: 'Alien Dream', mods: [{ stat: 'vulnAll', value: 0.30 }], turns: 2 } }] },
      { id: 'show_grace', name: 'Redeeming Grace', targetRule: 'single', effects: [{ op: 'attack', mult: 3.6, elem: 'Imaginary' }] },
      { id: 'show_cup', name: 'A Cup Runneth Over For You', targetRule: 'aoe', cast: 1, effects: [{ op: 'dot', kind: 'WindShear', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'show_holy', name: 'Holy Night', targetRule: 'aoe', cast: 1, effects: [{ op: 'aoe', mult: 3.0, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['show_holy', 'show_grace', 'show_admonishment', 'show_bright', 'show_flagellation', 'show_cup', 'show_calm']),
  },
  // The Ravaged Unconquerable (Boss, Imaginary; res 40% Physical/Wind/Imaginary): stronger sibling of
  // The Giver. Lightning Spear of the Firmament single 240%; Hewing of the River of Souls single
  // 360%; Unceasing Flames of War AoE 280%; Sky-Piercing Lance bounce 120%×4; Worldsplitting Spine
  // blast 220%/180%; Survivors Unto Dead Waters single 400%; Pyre of High Graves AoE 320%;
  // Ruination of Night and Light bounce 120%×4. Deviation: The Solitary Throne / The Last Monarch,
  // Submit or Die, Will of Strife and the phase mechanics are not modelled.
  'The Ravaged Unconquerable': {
    abilities: [
      { id: 'ravaged_spear', name: 'Lightning Spear of the Firmament', targetRule: 'single', effects: [{ op: 'attack', mult: 2.4, elem: 'Imaginary' }] },
      { id: 'ravaged_hewing', name: 'Hewing of the River of Souls', targetRule: 'single', effects: [{ op: 'attack', mult: 3.6, elem: 'Imaginary' }] },
      { id: 'ravaged_flames', name: 'Unceasing Flames of War', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.8, elem: 'Imaginary' }] },
      { id: 'ravaged_lance', name: 'Sky-Piercing Lance', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.2, hits: 4, elem: 'Imaginary' }] },
      { id: 'ravaged_spine', name: 'Worldsplitting Spine', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.2, adjMult: 1.8, elem: 'Imaginary' }] },
      { id: 'ravaged_survivors', name: 'Survivors Unto Dead Waters', targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Imaginary' }] },
      { id: 'ravaged_pyre', name: 'Pyre of High Graves', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.2, elem: 'Imaginary' }] },
      { id: 'ravaged_ruination', name: 'Ruination of Night and Light', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.2, hits: 4, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['ravaged_flames', 'ravaged_survivors', 'ravaged_pyre', 'ravaged_hewing', 'ravaged_spine', 'ravaged_spear', 'ravaged_lance', 'ravaged_ruination']),
  },
  // Unwaning Ageless Immortal (Boss, Lightning/Wind): the Abundant Ebon Deer kit re-skinned plus the
  // Celestial Arbor family. Wavering Bleat / Thunder-Shock single Lightning 350%; Caress of Wind AoE
  // Wind 280%; Punishing Bolts blast Lightning 300%/300%; Rite of Great Arbor Metamorphosis bounce
  // Wind 100%×3 + WindShear; Guiding Vulturnus blast 150%/100% + WindShear; Arboreal Thorns single
  // 100% + WindShear; Hardy Leaf Sheath self DEF +200% + Toughness Protection. Deviation: the Pedicel
  // summons (Wintry Wind / Marple Leaf / Glorious Blooms / Lavish Fruits), Back to Life, Power of
  // Ascension/Sustenance/Leak and Heavenbound One And All are not modelled.
  'Unwaning Ageless Immortal': {
    abilities: [
      { id: 'immortal_bleat', name: 'Wavering Bleat', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] },
      { id: 'immortal_caress', name: 'Caress of Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.8, elem: 'Wind' }] },
      { id: 'immortal_thunder', name: 'Thunder-Shock', targetRule: 'single', effects: [{ op: 'attack', mult: 3.5, elem: 'Lightning' }] },
      { id: 'immortal_punishing', name: 'Punishing Bolts', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 3.0, elem: 'Lightning' }] },
      { id: 'immortal_rite', name: 'Rite of Great Arbor Metamorphosis', targetRule: 'single', effects: [{ op: 'bounce', mult: 1.0, hits: 3, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'immortal_vulturnus', name: 'Guiding Vulturnus', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.5, adjMult: 1.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'immortal_thorns', name: 'Arboreal Thorns', targetRule: 'single', effects: [{ op: 'attack', mult: 1.0, elem: 'Wind' }, { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 3, chance: 1.0 }] },
      { id: 'immortal_sheath', name: 'Hardy Leaf Sheath', targetRule: 'self', effects: [{ op: 'buff', to: 'self', buff: { id: 'immortal_sheath_buff', name: 'Hardy Leaf Sheath', mods: [{ stat: 'defPct', value: 2.0 }], turns: 1 } }, { op: 'guard', toughnessImmune: true }] },
    ],
    ai: new PatternAI(['immortal_caress', 'immortal_punishing', 'immortal_bleat', 'immortal_thunder', 'immortal_vulturnus', 'immortal_rite', 'immortal_thorns', 'immortal_sheath']),
  },
  // Vessel of the Destruction, Khaslana (Boss, Physical): the dataset carries only the Talent
  // "Destined Casket" with no stats or coefficients. Covered by a single authored AoE strike for the
  // coverage gate. Deviation: entire kit authored; no canon coefficients available.
  'Vessel of the Destruction, Khaslana': {
    abilities: [
      { id: 'khaslana_strike', name: 'Destined Casket', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 3.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['khaslana_strike']),
  },
  // Wonder Forest's Banacademic Office Staff (Boss, Quantum/Fire): the boss of the Banacademic Office
  // advisor family — reuses the shared Classroom/Off-Class channel state machine and its constants.
  // Banascary Semester AoE Quantum 150% + Energy drain; Physical Banashment! Take This! blast Fire
  // 260%/200%; Banappiness Holiday / Break Time! Chaaarge! / Class Time! Sit Down! / Good Monkeys Get
  // Grades / Bad Monkeys Get Demerits / Change Banasyllabus mirror the advisor channels. Deviation:
  // Pride of the Monkey Pack, Banacademic Curriculum, Disrupt Banasyllabus' sub-field control and
  // Teach Monkeys a Banalesson are not modelled.
  "Wonder Forest's Banacademic Office Staff": {
    abilities: [
      { id: 'staff_banashment', name: 'Physical Banashment! Take This!', targetRule: 'blast', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'blast', mult: 2.6, adjMult: 2.0, elem: 'Fire' }] },
      { id: 'staff_banascary', name: 'Banascary Semester', targetRule: 'aoe', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'aoe', mult: 1.5, elem: 'Quantum' }, { op: 'drainEnergyFlat', amount: 15 }] },
      { id: 'staff_banappiness', name: 'Banappiness Holiday', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'allyEnergyPct', pct: 0.5 }] },
      { id: 'staff_demerits', name: 'Bad Monkeys Get Demerits', targetRule: 'self', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'sp', delta: -1 }] },
      { id: 'staff_grades', name: 'Good Monkeys Get Grades', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'sp', delta: 2 }] },
      { id: 'staff_sitdown', name: 'Class Time! Sit Down!', targetRule: 'self', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'advance', pct: 0.5, to: 'allies' }] },
      { id: 'staff_charge', name: 'Break Time! Chaaarge!', targetRule: 'aoe', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'advance', pct: 0.5, to: 'targets' }] },
      { id: 'staff_change', name: 'Change Banasyllabus', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'dispelSelf', id: BANACADEMIC_OFFCLASS }, { op: 'buff', to: 'self', buff: { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['staff_banashment', 'staff_banascary', 'staff_banappiness', 'staff_demerits', 'staff_grades', 'staff_sitdown', 'staff_charge', 'staff_change']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity, sourceId: self.id }) },
      onHitTaken(sim, self) { banacademicDisrupt(sim, self) },
    },
  },
}
