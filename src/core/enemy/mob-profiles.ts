import { PatternAI, type EnemyBehavior } from './ai'
import { warArmor, adjacentFriendlyUnits, fleeCountdown, safeguard, moonRage, MOON_RAGE } from './passive'
import { enemyDefenseOf } from './defense'
import type { EnemyAbilityDefinition } from './ability'
import type { HitOpts, SimApi } from '../kit'
import type { Unit } from '../entities/Unit'

/** §54 — production behaviors for ORDINARY enemies (rank `mob`), keyed by base name.
 *
 *  Values are read from `hsr-data/enemies.json` skills (name + tag + description); only mechanics
 *  the engine can express are modelled and every omission is a recorded deviation (`TODO.md` /
 *  the implementation matrix). A single authored behavior covers each enemy's base + mode variants
 *  (e.g. "Aether Spirit Enemy" / "Illusion"), which differ only in stats/mode — never behavior.
 *
 *  Batch 1 deliberately spans the shared op-set: plain single attack, Blast, AoE, ATK/%MaxHP DoT
 *  (Bleed/Shock/Wind Shear), stat debuffs (DEF down / DMG taken up), team heal, control
 *  (Imprisonment/Entanglement) and a War Armor carrier — proving the ops, not one enemy.
 *
 *  Known deviations (see TODO.md):
 *    - Debuff RES (parser/model — `parse.ts` / `types.ts` / `resolve.ts`, every rank): the raw
 *      per-enemy `debuffRes` table is parsed into `effectResistanceProfile` and now flows into combat
 *      (`Unit.debuffRes` via `endgame.ts` → `EnemySpec` → `Simulator.addEnemy`), where `debuffResMult`
 *      (StatResolver) multiplies the landing chance of a rolled DoT/CC by (1−category RES) ×
 *      (1−Control RES) before the cap: `Base × (1+EHR) × (1−Effect RES) × (1−Debuff RES)`. Raw columns
 *      (headers empty in the dataset) are the wiki order Bleed / Burn / Frozen / Shock / Wind Shear /
 *      Entanglement / Imprisonment / Control Effects RES (Control multiplies on top for
 *      action-preventing debuffs); 157 / 379 records carry non-zero values. Residual deviation: (a)
 *      DoTs applied UNCONDITIONALLY (no `applyDebuff` roll — e.g. Jiaoqiu Ashen-Roast Burn, Hysilens
 *      zone-DoT) and (b) a rolled DoT whose kind is chosen at runtime (`applyTalentDot`, Hysilens
 *      Talent/Technique — 1–2 of WindShear/Bleed/Burn/Shock per roll) bypass Debuff RES, since the
 *      kind is unknown at the `rngf()` roll and gating it would resequence the seeded RNG; (c)
 *      break-inflicted debuffs bypass Debuff RES (guaranteed in canon too); (d) enemy→ally `control`
 *      ops target allies, who carry no profile. The per-level `effRes` stat remains the separate
 *      Effect RES term. Covered by
 *      `tests/regression/debuff-res.ts` + `tests/scenarios/interactions/debuff-res.ts`. Wiki source:
 *      `honkai-star-rail.fandom.com/wiki/Debuff_RES`.
 *    - Silvermane Cannoneer "Covering Support" (friendly follow-up on this unit's attack) and
 *      Automaton Beetle "Barrier" (nullify all non-DoT DMG on a friendly) need an on-attack reaction
 *      / a non-shield immunity state — not modelled.
 *    - Grunt "Performance Boost", Voidranger: Eliminator "Detonated"/Overloaded, Voidranger:
 *      Distorter "Lock On", Imaginary Weaver "Defensive Position" charge and the War Armor buffs'
 *      conditional branches are not modelled.
 *    - Mara-Struck Soldier "Rejuvenate" (on-killing-blow 50% Max HP self-restore, once/battle) is
 *      modelled via the §57 `onKilled` hook (revive cancels the death).
 *    - Entanglement / Imprisonment use the shared §18 break-application shapes (delay + DoT), not
 *      their full per-stack delayed-damage formulas.
 *    - Batch 2: Astropolis Sentinel "Execute Justice" state is folded into a plain 2-step rotation;
 *      Grunt: Field Personnel "Performance Boost/Points" and Aggressive Reading Material
 *      "Book-Smart"/"Curse of Knowledge" talents (stateful DMG-taken/received modifiers keyed on
 *      team Punchline) are not modelled. Outrage/Safeguard/flee/summon mobs (Twig of Wintry
 *      Wind, Planeshred Claws, Worldpurge Tail, Nebula Devourer, Warp Trotter family, Twig of
 *      Marple Leaf / Lavish Fruits) are deferred to a later batch — they need Outrage control, a
 *      not-broken DMG-reduction state or flee/summon mechanics. (Twig of Glorious Blooms is now
 *      modelled in batch 3.)
 *    - Batch 3: Abundance Sprite: Golden Hound "Rebound Roar" (advance adjacent friendly units on a
 *      killing blow) — the advance magnitude is not in the raw data, so only Horn Gore is modelled.
 *      Lordly Trashcan "The Can's Tribulations" (stackable ATK buff, value hidden in a wiki Note)
 *      and "The Can's Creed" (weakness-implant / leave-on-break) are not modelled. Vagrant
 *      "Inspire" (friendly ATK +30% and act immediately) is not modelled (buff duration + the
 *      immediate-action primitive are treated as a later support batch). Automaton Spider "Timed
 *      Module" → "Self-Exploding Module" charge is not modelled (the release skill is absent from
 *      the data); its "Chains of Destruction" killing-blow Fire burst IS modelled.
 *    - Batch 4: Elation "Punchline" talents ("Alloy Pommy" Circuit Malfunction, Mask-like drove) are
 *      a later Elation-support batch — not modelled. Entranced Ingenium: Obedient Dracolion
 *      "Lion's Roar" Weaken magnitude is absent from the data → 10% (the shared Weakness-Break
 *      value) is used. Echo of Faded Dreams "Come In Incubo" (all DMG re-routed to Harmonious
 *      Choir) is a damage-redirect link → not modelled. Twig of Marple Leaf's two variant "Leaf
 *      Hinging" ladders (250% vs 150% + Shock) collapse to the 250% strike. "The Honored" "Honors of
 *      the Red Queen" canon-buffs one named ally; the shared buff op can only reach the whole
 *      friendly side, so it buffs all allies. Ice Edge (Illusion) / Lance of
 *      the Eternal Freeze (Illusion) carry no multiplier in the data → authored (see Batch 17).
 *    - Batch 5: the death-rattle family's non-burst halves are deferred — Dreamjolt Troupe's Bubble
 *      Hound "Hearty Revelry" DoT-taken stacks are not counted (only attacks drive `onHitTaken`), so
 *      the Libation Bleed stack count is capped at an authored 10; Furiae Philosopher "Just War"
 *      duration is absent from the data → 2 turns; Gnaw Sting "Horn Clash" Entanglement-stack
 *      preference, Juvenile Sting "Meiotic Division" summon, Servant of Tides "Black Tide Fever" /
 *      "Respite By The Waters", Mirage Fizzle Kid "Mirage Rush" lock-on, "Speartip" "Soulfreed"
 *      state, Gnaw/Juvenile Sting stacking DMG-taken values are not modelled. Lesser Sting (Charge →
 *      absent "Bursting Detonation"), Hallucinogenic Mermaid (value-less Ice burst + "Glacial
 *      Erosion"), Abundance/Destruction Lotus and Disciples of Sanctus Medicus: Internal Alchemist
 *      (SP/Energy ops + external-entity targets + conditional marks) are deferred.
 *    - Batch 6 (lotus family + SP primitive): adds the shared `sp {delta}` op (drains/restores the
 *      team Skill Point pool, clamped 0..max) and the `onTurnStart` passive hook. Abundance Lotus
 *      "Non-Living" (target Energy −5) and Destruction Lotus "Bloom"/"Repose"/"Black Prana's
 *      Return"/"Safeguard" are not modelled; "Prana-Siphon" is modelled as an incoming-heal
 *      reduction (`inHeal`). Dreamjolt Troupe's Spring Loader's Effect-RES reduction is now modelled
 *      as an `effRes` debuff (closed 17-10-2026): `applyDebuff`/`effectResOf` (StatResolver) resolve
 *      Effect RES from the static field PLUS `effRes` buff mods. Black Tide's Corroded Axe "Fire of
 *      Vengeance" (even split) / "Bitter Fracture" (on-ally-defeat), and Daythunder Raven "Heat It
 *      Up"/"Polarization" (temperature / Thunderclouds) are not modelled.
 *    - Batch 7 (Trotter family + flee primitive): the shared `fleeCountdown` passive (one count per
 *      OWN turn → `sim.flee`, a leave-battle that is NOT a kill) models the whole "Scared → Run →
 *      Escaped" ladder. The flavor talents are not modelled (they need team-reaction infra):
 *      Trotter of Abundance "C—Cure You" (own-HP-share heal of an attacked friendly), Trotter of
 *      Destruction "T—Taking Revenge" (AoE counter at 55% ATK per friendly unit attacked, max 5),
 *      Trotter of Preservation "P—Protect You" (team-wide damage-nullifying stacks at battle start),
 *      and the panic-turn "Toughness cannot be reduced + CC immune" hardening (the trotter flees on
 *      the Run state's turn anyway).
 *    - Batch 8 (Lock-On + self-cleanse + ally-target family): adds the shared `lockon` op (pin one
 *      random living character as the forced target of every living attacker + vulnerability mark,
 *      via `addTargetOverride`) and the `dispelSelf` op ("Thermal Barrier"). Voidranger:
 *      Distorter "Detonated" (75% debuff marker) and Voidranger: Eliminator "Detonated (3 uses)" are
 *      modelled as inert marker debuffs (no described effect). Commerce Trotter SPD boost magnitude
 *      is absent from the raw data → authored 10% ×1 turn; Automaton Beetle "Barrier to ANOTHER
 *      friendly" is approximated as a shield on the whole friendly side (the shared `shield` op has
 *      no single-friendly recipient); Furiae Archer has no multiplier in the data → 100%/round stand-in
*      and the "hit more than once → +200% ATK" and "armor 0 → next Weeping Arrow uses 1 round" branches
*      are not modelled.
*    - Batch 9 (state/telegraph + death-shield family): Mara-Struck Warden "Maddening" starts the
*      battle Maddened (infinite marker buff gating the Sever-only rotation); the Chop (200%) mode
*      that returns after a dispel is not modelled (the revert needs a buff-removal hook). The
*      Corrosion conversions ("Fated End" on Black Tide's Decrepit Bow and Tide-Eroded Blade) are
*      not modelled. SD Civilian Mechatron "Boosting Strength" → "Windmill Defacer" is modelled as
*      the §55 cast telegraph; "IFF Systems Malfunction" (act immediately after being attacked) and
*      the Punchline granted to the target team are not modelled. Comediologist "Tragic Core"
*      (death-rattle shield for all allies) has no magnitude in the data → authored 50% Max HP;
 *      "Comedian Ensemble" (shared action order) is not modelled.
 *    - Batch 10 (Dreamjolt Troupe channel/kill-reward family): Fortune Seller "Dreamjolt Prizepool"
 *      is modelled via the §54 killing-blow type (Basic/DoT → +2 SP; Skill/FUA → +20 team Energy;
 *      Ultimate → +20 Energy and +2 SP); the reward numbers are authored (the data gives the type
 *      table, not the magnitudes). Mr. Domescreen and Ternary Assimilation Unit run an explicit
 *      2-channel state machine (Surprise/Fright marker buffs) keyed by the new §54 `require` AI gate;
 *      "Channel Crossover" (counter-switch when attacked) is approximated as a plain flip on any
 *      incoming hit — the "switch to the opposite of the attacker's expectation" branch is not
 *      modelled. Ternary spawns in the Fright channel (its kit has no Surprise ability; the extra
 *      Channel Switch step is a recorded deviation). Abundance Sprite: Wooden Lupus "Wolf Predation"
 *      = Lightning strike + Shock; "Rallying Howl" (summon a Shadow Jackhyache) is not modelled
 *      (enemy-side summon unsupported) and the Aether Spirit "Wolf Consumption" DoT-accelerate
 *      variant is deferred.
 *    - Batch 12 (Safeguard family — mob): adds the §57 `onBreak` enemy passive hook (fired from
 *      `BreakResolver.fullBreak` after the Weakness-Break transition) and the shared `safeguard(...)`
 *      helper — while NOT Weakness-Broken the unit takes −R DMG (a `mitigation` buff), and on the
 *      break it is action-delayed and thereafter takes +V DMG (a `vulnAll` buff). Carriers:
 *      Planeshred Claws (Blast Wind 300%), Nebula Devourer (AoE Wind 240%), Worldpurge Tail (AoE Wind
 *      240%) and Memory Zone Meme "Heartbreaker" (single Physical 300%). Deviation: the Wind trio's
 *      raw text omits the R/D/V numbers → the authored defaults 60%/75%/50% (the values Memory Zone
 *      Meme "Heartbreaker" states) are used. Memory Zone Meme "Shell of Faded Rage" (same Safeguard,
 *      plus an "Obscure Blaze" stack accumulator and an AoE) is deferred to a later batch.
 *    - Batch 14 (Wolftrooper pack — Moon Rage / Bloodlust): adds the shared `moonRage(...)` passive.
 *      "Lupine Maw" is one shared Bloodlust counter across every "Moon Rage-capable" ally (each
 *      capable ally's turn adds a stack to the whole pack); at 6 the pack enters Moon Rage (SPD up),
 *      a countdown later dispels it pack-wide, and a unit's own Weakness Break also clears its Rage.
 *      Carriers: Eclipse Wolftrooper (Gnaw 280% Physical; +self-heal 40% Max HP while raging) and
 *      Sableclaw Wolftrooper (Massacre Blast 180%; guaranteed Bleed while raging). Deviation: the
 *      Moon Rage SPD value and the countdown length are absent from the data → +20% / 2 own turns;
 *      the Action-Order countdown entity is approximated by a per-unit timer, and Bloodlust is fed
 *      only by capable allies' turns (non-capable allies' attacks do not count).
 *    - Batch 15 (diverse reuse): Dreamjolt Troupe's Winder Goon (Charge → advance every OTHER ally
 *      100% + single 250%), Wraith Warden (single 250% + 35% Reverberation marker), Hallucinogenic
 *      Mermaid (AoE Ice 100% + Ice death-rattle that also inflicts Glacial Erosion), and Furiae
 *      Troupe (Blast Imaginary 300%/200% + War Song marker + the shared `warArmor` Polis Protector).
 *      New primitive: `advance {to:'alliesOther'}` (allies except the actor).
 *    - Batch 16: The Long Arms of Sorrow (single/Blast Quantum rotation), Lesser Sting (charge →
 *      Wind strike + all-allies death-rattle), Ichor Memosprite: Canine (Imaginary 260% + spawn /
 *      adjacency "Hemotort Stain" marker). The elite Memory Zone Meme "Shell of Faded Rage"
 *      (Safeguard + Obscure Blaze rotation) lives in `profiles.ts`.
 *    - Batch 17 (Illusion variants + support/redirect/death-state markers): adds the shared
 *      `buff { to:'allyRandom' }` recipient (one random living ally). Carriers: Ice Edge (Illusion)
 *      1/2 and Lance of the Eternal Freeze (Illusion) 1/2 (AoE Ice, multiplier authored to match their
 *      non-Illusion counterparts), Meteoric Eagle (single Wind 200% + a Stormride marker on one ally —
 *      the end-of-turn extra action is not modelled), Ichor Memosprite: Pheasant (single Imaginary 280%
 *      + a side-wide "Hemotort Resonance" marker — the reactive follow-up attack is not modelled),
 *      Security Doggo (single Physical 250% + a Fealty marker on one ally — the DMG-redirect is not
 *      modelled), and Magical Girl Troupe (single Lightning 280% + the Rainy/Sunny death-states; the
 *      Elation switch is not modelled so it always dies Rainy and runs the 5-bounce + Shock death-rattle,
 *      Shock chance authored 100% from "high chance").
 *    - Batch 18 (arena/Khaslana adds + elemental status + support markers): adds the `oneOf` effect
 *      (seeded random pick of one sub-effect) and the `alliesOther` recipient. Carriers: Shadow of
 *      "Hatred" (AoE Physical, "minor" → 150%; the Khaslana HP-loss-on-create is not modelled), Twig of
 *      Wintry Wind (single Wind 200% + Wind Shear 50%/2t + an "Outrage" marker — the Outrage control is
 *      not modelled, duration authored 2t), Furbo Journalist (single Imaginary 200%; "Ugly Close-Up"
 *      Punchline is not modelled), Illwish Lotus (Wicked Grin `dmgAll` +10%/stack max 10 to one ally,
 *      magnitude authored; recipient approximated as a random ally; "Fatal Mockery" not modelled),
 *      Autonomous Wand (single Quantum 200% + a `oneOf` Happiness Charm: self ATK +50% / advance all
 *      allies 50% / Strong Reverberation on the other allies; "Magic of Smiles" is not modelled),
 *      Memory Zone Meme "Insatiable Vanity" (Deception's Crown marker on one ally, dispelled on the
 *      unit's death; the possession effects are not modelled), and the skill-less Dried Lacrimal Bone /
 *      Languid Ethmoid Bone (authored default single Physical 150%).
 *    - Batch 19 (state/resource supports, sub-field ports, summon adds): no new primitives — reuse of
 *      `require`, `cast`, `control`, `guard`-style `controlImmune`, `dispelSelf`, `buff.to`. Carriers:
 *      Black Tide Council (Lurking self-marker + Physical 250% + a `require`-gated Physical 450% that
 *      dispels Lurking; the "cannot be primary target" stealth and "Flawed" are not modelled),
 *      Auxiliary Robot Arm Unit (Restrain ≈ `control` Imprisonment + Physical 50% + a 50% hit + a
 *      charge telegraph; the %Target-Max-HP DMG is authored as ATK 50%, and the Overload→Controlled
 *      Blasting and Restrain-cleanse are not modelled), "The Shield" (self Shield 15% Max HP + a Barrier
 *      marker on one ally; the killing-blow Barrier and Soulfreed branch are not modelled),
 *      Long-Shattered Vessel (Blast 50%/25% + AoE 50%, CC-resist via onSpawn `controlImmune`; the
 *      Corrosion / Flame-Reaver summon interactions are not modelled), Twig of Lavish Fruits (Crude /
 *      Mellow Fruits charge → a stackable marker; the Energy feed to the Ebon Deer is not modelled),
 *      Shoot of Hundred Eyes / Twig of Hundred Eyes (skill-less → authored single Physical 150%),
 *      Output Port 1 (Ally Gratuity `resPenAll` +5%/stack max 4 to its own allies; the "Ally
 *      Popularity" sub-field trigger is not modelled), Output Port 2 (Bleeding Followers modelled as a
 *      −10% DMG-dealt debuff on one target; the Enemy Gratuity removal is not modelled).
 *    - Batch 20 (final ordinary mobs — Talent-only / special-state residuals): "All or Nothing"
 *      (self `mitigation` 1.0 immune-to-DMG; the Gamble / random roll and "Bet" are not modelled),
 *      "All or Nothing: Double Fortune" (`fleeCountdown(1)`; "Double Bet" not modelled), "Spirithief"
 *      Bartholos (self `mitigation` 0.90 + brainteaser marker + onKilled +20% DMG to the player team;
 *      the ATK-type response, delay-on-solve and 35%-Max-HP self-damage are not modelled), Conquer or
 *      Be Conquered (no-op turn + self `vulnAll` 1.0; the conditional gate and the killing-blow HP
 *      drain of "The Giver..." are not modelled), Imprisoned Mythos / Manipulated Logos (real attack
 *      rotations + an "Immortal" onKilled that revives full HP and advances all targets 20% / grants
 *      15% Max Energy; the "Anti-Creator" charge resolution and Action-Lock dispel are not modelled),
 *      Memory Zone Meme "Something In The Mirror" (self-transform marker; the ability/stat copy is not
 *      modelled), Sombrous Sepulcher (no-op turn; the 5-HP-bar lifecycle and Morbid-Dream restoration
 *      are not modelled), and The Conquered (no-op turn + shared `warArmor`; the Glory-stack depletion
 *      and killing-blow branch are not modelled). */

/** a panic turn that deals nothing — the trotter "acts" by spooking instead of attacking */
const trotterPanic = (id: string, name: string): EnemyAbilityDefinition => ({ id, name, targetRule: 'self', effects: [] })

/** the two Mr. Domescreen / Ternary channel marker-buff ids */
const CH_SURPRISE = 'domescreen_surprise_channel'
const CH_FRIGHT = 'domescreen_fright_channel'

/** §54 Banacademic Office channel marker-buff ids — shared by the three advisor mobs (`mob-profiles`)
 *  AND the Charmony BananAdvisor elite (`profiles.ts`), which is why they are exported. */
export const BANACADEMIC_CLASSROOM = 'banacademic_classroom'
export const BANACADEMIC_OFFCLASS = 'banacademic_offclass'

/** §54 "Disrupt Banasyllabus": a Banacademic Office unit switches Classroom → Off-Class when it is
 *  attacked (the Classroom → Off reaction; the Off → Classroom return is the explicit "Change
 *  Banasyllabus" ability). Shared by all four advisor profiles. */
export function banacademicDisrupt(sim: SimApi, self: Unit): void {
  if (!self.buffs.some(b => b.id === BANACADEMIC_CLASSROOM)) return
  sim.removeBuff(self, BANACADEMIC_CLASSROOM)
  sim.addBuff(self, { id: BANACADEMIC_OFFCLASS, name: 'Off-Class Channel', mods: [], turns: Infinity, sourceId: self.id })
  sim.log(`${self.name}'s Disrupt Banasyllabus - switches to the Off-Class Channel`)
}

/** §57 War Song marker (Furiae Troupe "Praise Nikador"), shared by the profile's onSpawn and skill. */
const FURIAE_WARSONG = 'furiae_warsong'

export const MOB_BEHAVIORS: Record<string, EnemyBehavior> = {
  // ---- Physical single-attack family (Solwarn/Jarilo-VI) -----------------------------------
  'Silvermane Soldier': {
    abilities: [
      {
        id: 'soldier_charge', name: 'Tireless Charge', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Physical' },
          { op: 'debuff', chance: 1.0, buff: { id: 'soldier_defdown', name: 'DEF Reduced', mods: [{ stat: 'defRed', value: 0.5 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['soldier_charge']),
  },
  'Silvermane Gunner': {
    abilities: [
      {
        id: 'gunner_grenade', name: 'Piercing Grenade', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Physical' },
          { op: 'dot', kind: 'Bleed', fromMaxHp: 0.15, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['gunner_grenade']),
  },
  'Silvermane Cannoneer': {
    abilities: [
      { id: 'cannoneer_barrage', name: 'Barrage', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.3, adjMult: 1.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['cannoneer_barrage']),
  },

  // ---- Imaginary Voidrangers ---------------------------------------------------------------
  'Voidranger: Reaver': {
    abilities: [
      { id: 'reaver_blade', name: 'Hunting Blade', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'reaver_vortex', name: 'Vortex Leap', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.5, adjMult: 1.5, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['reaver_blade', 'reaver_vortex']),
  },

  // ---- Wind / DoT family -------------------------------------------------------------------
  'Mara-Struck Soldier': {
    abilities: [
      {
        id: 'mara_tailwind', name: 'Callous Tailwind', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Wind' },
          { op: 'dot', kind: 'WindShear', mult: 0.5, stacks: 2, turns: 3, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['mara_tailwind']),
    // Rejuvenate: on a killing blow, restore 50% Max HP instead of dying — once per battle. The
    // §57 onKilled hook revives the unit, so Lifecycle.kill sees it survive and grants no kill
    // credit (the flag lives in the per-battle runtime bag, which survives the death/revive).
    passive: {
      onKilled(sim, self) {
        const bag = sim.rt(self)
        if (bag.rejuvenated) return
        bag.rejuvenated = true
        const hp = Math.floor(self.maxHp * 0.5)
        sim.revive(self, hp, self)
        sim.log(`${self.name} Rejuvenate restores ${hp} HP (once per battle)`)
      },
    },
  },
  'Cloud Knights Patroller': {
    abilities: [
      {
        id: 'ckp_cloudedge', name: 'Cloud Edge', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.5, elem: 'Wind' },
          { op: 'debuff', chance: 1.0, buff: { id: 'ckp_vuln', name: 'DMG taken up', mods: [{ stat: 'vulnAll', value: 0.25 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['ckp_cloudedge']),
  },

  // ---- Elemental spawns --------------------------------------------------------------------
  Flamespawn: {
    abilities: [{ id: 'flamespawn_distract', name: 'Distract', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Fire' }] }],
    ai: new PatternAI(['flamespawn_distract']),
  },
  Frostspawn: {
    abilities: [{ id: 'frostspawn_distract', name: 'Distract', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Ice' }] }],
    ai: new PatternAI(['frostspawn_distract']),
  },
  Windspawn: {
    abilities: [
      {
        id: 'windspawn_windpath', name: 'Windpath', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.5, elem: 'Wind' },
          { op: 'dot', kind: 'WindShear', mult: 0.8, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['windspawn_windpath']),
  },
  Thunderspawn: {
    abilities: [
      {
        id: 'thunderspawn_flash', name: 'Thunderflash', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.5, elem: 'Lightning' },
          { op: 'dot', kind: 'Shock', mult: 0.8, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['thunderspawn_flash']),
  },

  // ---- Quantum / Imaginary control family --------------------------------------------------
  "Dawn's Left Hand": {
    abilities: [
      { id: 'dawn_hammer', name: 'Fallen Forge Hammer', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }] },
      {
        id: 'dawn_visit', name: "Fallen Star's Visit", targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.15, elem: 'Quantum' },
          { op: 'control', kind: 'Entanglement', chance: 0.30, turns: 1 },
        ],
      },
    ],
    ai: new PatternAI(['dawn_hammer', 'dawn_visit']),
  },
  "Disaster's Right Hand": {
    abilities: [
      { id: 'disaster_tear', name: 'Calamity Tear', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.35, elem: 'Imaginary' }] },
      {
        id: 'disaster_cuts', name: 'Tough Cuts', targetRule: 'aoe',
        effects: [
          { op: 'aoe', mult: 1.5, elem: 'Imaginary' },
          { op: 'control', kind: 'Imprisonment', chance: 0.20, turns: 1 },
        ],
      },
      {
        id: 'disaster_tyranny', name: 'The Breakdown of Tyranny', targetRule: 'aoe',
        effects: [
          { op: 'aoe', mult: 1.0, elem: 'Imaginary' },
          { op: 'aoe', mult: 1.0, elem: 'Imaginary' },
          { op: 'control', kind: 'Imprisonment', chance: 0.25, turns: 1 },
        ],
      },
    ],
    ai: new PatternAI(['disaster_tear', 'disaster_cuts', 'disaster_tyranny']),
  },
  'Imaginary Weaver': {
    abilities: [
      { id: 'weaver_carolbeam', name: 'Carolbeam', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'weaver_carolburst', name: 'Carolburst', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'weaver_reverberating', name: 'Reverberating Carol', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.8, adjMult: 1.8, elem: 'Imaginary' }] },
    ],
    ai: new PatternAI(['weaver_carolbeam', 'weaver_carolburst', 'weaver_reverberating']),
  },

  // ---- Support / healer --------------------------------------------------------------------
  'Automaton Hound': {
    abilities: [
      { id: 'hound_strike', name: 'Vertical Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] },
      { id: 'hound_heal', name: 'Self-Healing Module', targetRule: 'self', effects: [{ op: 'heal', frac: 0.25, of: 'actor', to: 'allies' }] },
    ],
    ai: new PatternAI(['hound_strike', 'hound_strike', 'hound_heal']),
  },
  'Grunt: Security Personnel': {
    abilities: [
      { id: 'grunt_security', name: 'Appeal', targetRule: 'blast', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['grunt_security']),
  },

  // ---- War Armor carrier (Polis Protector) -------------------------------------------------
  'Furiae Warrior': {
    abilities: [
      {
        id: 'furiae_collision', name: 'Collision of the Third Orbit', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Physical' },
          { op: 'debuff', chance: 0.40, buff: { id: 'reverberation', name: 'Reverberation', mods: [], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['furiae_collision']),
    passive: warArmor({ stacks: 3, dmgReduction: 0.10, shatterPct: 0.30, brokenPct: 0.10, delayPct: 0.30, energyPct: 0.06 }),
  },

  // ---- Batch 2 — element-specific strikers (plain single attack / delay / single DoT) --------
  Antibaryon: {
    abilities: [{ id: 'antibaryon_obliterate', name: 'Obliterate', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }] }],
    ai: new PatternAI(['antibaryon_obliterate']),
  },
  Baryon: {
    abilities: [{ id: 'baryon_obliterate', name: 'Obliterate', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Quantum' }] }],
    ai: new PatternAI(['baryon_obliterate']),
  },
  'Flying Sword': {
    abilities: [{ id: 'flyingsword_jadecarve', name: 'Jadecarve Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 2.4, elem: 'Ice' }] }],
    ai: new PatternAI(['flyingsword_jadecarve']),
  },
  'Everwinter Shadewalker': {
    abilities: [
      {
        id: 'everwinter_frostcrush', name: 'Frost Crush', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Ice' },
          { op: 'delay', pct: 0.50 },
        ],
      },
    ],
    ai: new PatternAI(['everwinter_frostcrush']),
  },
  'Incineration Shadewalker': {
    abilities: [
      {
        id: 'incineration_scorching', name: 'Scorching Crush', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Fire' },
          { op: 'dot', kind: 'Burn', mult: 0.5, turns: 3, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['incineration_scorching']),
  },
  'Shadow Jackhyena': {
    abilities: [
      {
        id: 'jackhyena_wolfpredation', name: 'Wolf Predation', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Lightning' },
          { op: 'dot', kind: 'Shock', mult: 1.5, turns: 3, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['jackhyena_wolfpredation']),
  },

  // ---- Batch 2 — Assistant Graffiti trio (single attack + element-tied debuff/DoT) ----------
  'Assistant Graffiti: Slacker': {
    abilities: [
      {
        id: 'graffiti_slacker_delay', name: 'Go On, Delay More!', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Ice' },
          { op: 'debuff', chance: 1.0, buff: { id: 'graffiti_vuln', name: 'DMG taken up', mods: [{ stat: 'vulnAll', value: 0.30 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['graffiti_slacker_delay']),
  },
  'Assistant Graffiti: Rusher': {
    abilities: [
      {
        id: 'graffiti_rusher_doubletime', name: 'Quick, Double Time!', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Wind' },
          { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['graffiti_rusher_doubletime']),
  },
  'Assistant Graffiti: Demander': {
    abilities: [
      {
        id: 'graffiti_demander_work', name: 'Move It, Get to Work!', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Lightning' },
          { op: 'dot', kind: 'Shock', mult: 0.7, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['graffiti_demander_work']),
  },

  // ---- Batch 2 — AoE debuffer --------------------------------------------------------------
  'Entranced Ingenium: Illumination Dragonfish': {
    abilities: [
      {
        id: 'dragonfish_luminosity', name: 'Nightly Luminosity', targetRule: 'aoe',
        effects: [
          { op: 'aoe', mult: 1.5, elem: 'Fire' },
          { op: 'debuff', chance: 0.80, buff: { id: 'dragonfish_defdown', name: 'DEF Reduced', mods: [{ stat: 'defRed', value: 0.30 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['dragonfish_luminosity']),
    // Candle Flame: on a killing blow, deal Fire DMG (40% of this unit's Max HP, 10 Toughness) and
    // a 30% DEF-down (2 turns) to ALL friendly units — the enemy side's own team (§57 onKilled).
    passive: {
      onKilled(sim, self) {
        const opts: HitOpts = { type: 'basic', scaleStat: 'hp', mult: 0.4, elem: 'Fire', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Candle Flame' }
        for (const t of sim.allies(self.side)) {
          sim.hit(self, t, opts)
          if (!t.dead) sim.applyDebuff(self, t, 1.0, () => sim.addBuff(t, { id: 'dragonfish_candle_defdown', name: 'DEF Reduced', mods: [{ stat: 'defRed', value: 0.30 }], turns: 2, sourceId: self.id, debuff: true }), 'Candle Flame')
        }
      },
    },
  },

  // ---- Batch 2 — state-rotation striker ----------------------------------------------------
  // Canon "Unyielding, Relentless" alternates "What Descends From On High?" (150%) with
  // "Justice! Justice! Justice!" (200%) once in the "Execute Justice" state; modelled as the
  // observable 2-step damage rotation (the state flag itself is a recorded deviation).
  'Astropolis Sentinel': {
    abilities: [
      { id: 'astropolis_descends', name: 'What Descends From On High?', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Physical' }] },
      { id: 'astropolis_justice', name: 'Justice! Justice! Justice!', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['astropolis_descends', 'astropolis_justice']),
  },

  // ---- Batch 2 — plain Physical strikers ---------------------------------------------------
  'Grunt: Field Personnel': {
    abilities: [{ id: 'grunt_field_clockin', name: 'Clock In', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] }],
    ai: new PatternAI(['grunt_field_clockin']),
  },
  'Aggressive Reading Material': {
    abilities: [{ id: 'reading_readordie', name: 'Read Or Die!', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] }],
    ai: new PatternAI(['reading_readordie']),
  },

  // ---- Batch 3 — on-killing-blow (death-rattle) family --------------------------------------
  'Automaton Spider': {
    abilities: [{ id: 'spider_ram', name: 'Ram', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Physical' }] }],
    ai: new PatternAI(['spider_ram']),
    // Chains of Destruction: on a killing blow, deal Fire DMG (120% of this unit's Max HP, 20
    // Toughness) to the ADJACENT friendly units (its own neighbours).
    passive: {
      onKilled(sim, self) {
        const opts: HitOpts = { type: 'basic', scaleStat: 'hp', mult: 1.2, elem: 'Fire', toughDmg: 20, canCrit: false, fromDeadAttacker: true, label: 'Chains of Destruction' }
        for (const t of adjacentFriendlyUnits(sim, self)) sim.hit(self, t, opts)
      },
    },
  },
  'Abundance Sprite: Golden Hound': {
    abilities: [{ id: 'goldenhound_horngore', name: 'Horn Gore', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Wind' }] }],
    ai: new PatternAI(['goldenhound_horngore']),
  },

  // ---- Batch 3 — support healer -------------------------------------------------------------
  'Twig of Glorious Blooms': {
    abilities: [{ id: 'twigblooms_lastspring', name: 'Last Spring', targetRule: 'self', effects: [{ op: 'heal', frac: 0.25, of: 'actor', to: 'allies' }] }],
    ai: new PatternAI(['twigblooms_lastspring']),
  },

  // ---- Batch 3 — plain Physical strikers ----------------------------------------------------
  // Lordly Trashcan "The Can's Tribulations" (stackable self-ATK buff, value in a wiki Note) and
  // "The Can's Creed" (weakness-implant / leave-on-break) are deviations; the single-target hit is
  // the observable attack.
  'Lordly Trashcan': {
    abilities: [{ id: 'trashcan_trials', name: "The Can's Trials", targetRule: 'single', effects: [{ op: 'attack', mult: 4.0, elem: 'Physical' }] }],
    ai: new PatternAI(['trashcan_trials']),
  },
  // Vagrant "Inspire" (friendly ATK +30% + act immediately) is a deviation; Shovel Attack is the
  // observable attack.
  Vagrant: {
    abilities: [{ id: 'vagrant_shovel', name: 'Shovel Attack', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] }],
    ai: new PatternAI(['vagrant_shovel']),
  },

  // ---- Batch 4 — single strike + elemental stat debuff / DoT --------------------------------
  'Entranced Ingenium: Golden Cloud Toad': {
    abilities: [
      {
        id: 'goldentoad_densefog', name: 'Dense Fog', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Imaginary' },
          { op: 'debuff', chance: 1.0, buff: { id: 'goldentoad_spddown', name: 'SPD Reduced', mods: [{ stat: 'spdDown', value: 0.30 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['goldentoad_densefog']),
  },
  // "Lion's Roar" (200%) applies Weaken (2 Turns); the raw data omits the magnitude → 10%.
  'Entranced Ingenium: Obedient Dracolion': {
    abilities: [
      {
        id: 'dracolion_lionroar', name: "Lion's Roar", targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Fire' },
          { op: 'debuff', chance: 1.0, buff: { id: 'dracolion_weaken', name: 'Weakened', mods: [{ stat: 'weaken', value: 0.10 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['dracolion_lionroar']),
  },
  // "Dance Invite" (250%) + 50% chance to inflict Bleed (20% Target Max HP, 2 Turns).
  "Dreamjolt Troupe's Birdskull": {
    abilities: [
      {
        id: 'birdskull_dance', name: 'Dance Invite', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.5, elem: 'Physical' },
          { op: 'dot', kind: 'Bleed', fromMaxHp: 0.20, turns: 2, chance: 0.5 },
        ],
      },
    ],
    ai: new PatternAI(['birdskull_dance']),
  },
  // "Dirt Water Slinging" (Impair, 200%) + DEF −50% (2 Turns); "Housecleaning" is the plain strike.
  '"Alloy Pommy"': {
    abilities: [
      { id: 'pommy_housecleaning', name: 'Housecleaning', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Quantum' }] },
      {
        id: 'pommy_dirtwater', name: 'Dirt Water Slinging', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.0, elem: 'Quantum' },
          { op: 'debuff', chance: 1.0, buff: { id: 'pommy_defdown', name: 'DEF Reduced', mods: [{ stat: 'defRed', value: 0.50 }], turns: 2 } },
        ],
      },
    ],
    ai: new PatternAI(['pommy_housecleaning', 'pommy_dirtwater']),
  },

  // ---- Batch 4 — single strike + action delay -----------------------------------------------
  'Echo of Faded Dreams': {
    abilities: [
      {
        id: 'echofaded_afflitto', name: 'Afflitto', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 3.0, elem: 'Imaginary' },
          { op: 'delay', pct: 0.05 },
        ],
      },
    ],
    ai: new PatternAI(['echofaded_afflitto']),
  },
  'Memory Zone Meme "Allseer"': {
    abilities: [
      {
        id: 'allseer_glare', name: 'Glare of the Other', targetRule: 'single',
        effects: [
          { op: 'attack', mult: 2.5, elem: 'Quantum' },
          { op: 'delay', pct: 0.20 },
        ],
      },
    ],
    ai: new PatternAI(['allseer_glare']),
  },

  // ---- Batch 4 — bounce ----------------------------------------------------------------------
  'Disciples of Sanctus Medicus: Ballistarius': {
    abilities: [
      { id: 'ballistarius_crossbow', name: 'Mounted Crossbow', targetRule: 'single', effects: [{ op: 'bounce', mult: 1.0, hits: 6, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['ballistarius_crossbow']),
  },

  // ---- Batch 4 — elemental AoE strikers ------------------------------------------------------
  'Ice Edge (1)': {
    abilities: [{ id: 'iceedge1_icywind', name: 'Icy Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Ice' }] }],
    ai: new PatternAI(['iceedge1_icywind']),
  },
  'Ice Edge (2)': {
    abilities: [{ id: 'iceedge2_icywind', name: 'Icy Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Ice' }] }],
    ai: new PatternAI(['iceedge2_icywind']),
  },
  'Lance of the Eternal Freeze (1)': {
    abilities: [{ id: 'lance1_eternalfreeze', name: 'Eternal Freeze', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }] }],
    ai: new PatternAI(['lance1_eternalfreeze']),
  },
  'Lance of the Eternal Freeze (2)': {
    abilities: [{ id: 'lance2_eternalfreeze', name: 'Eternal Freeze', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }] }],
    ai: new PatternAI(['lance2_eternalfreeze']),
  },

  // ---- Batch 4 — buffer + killing-blow support -----------------------------------------------
  // "Iridescent Beam" (250%) + "Focused Charge" (friendly ATK +30%, 2 Turns). On a killing blow the
  // enemy team's Energy is regenerated (15) for the targets (the player team) — §57 onKilled.
  'Mask of No Thought': {
    abilities: [
      { id: 'mask_beam', name: 'Iridescent Beam', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Imaginary' }] },
      { id: 'mask_charge', name: 'Focused Charge', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'mask_atkup', name: 'ATK Up', mods: [{ stat: 'atkPct', value: 0.30 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['mask_beam', 'mask_charge']),
    passive: {
      onKilled(sim) {
        for (const a of sim.allies('ally')) sim.gainEnergyFlat(a, 15)
      },
    },
  },
  // "Honors of the Red Queen" (friendly DMG +12%, 3 Turns). On a killing blow the attacker is
  // granted DMG +20% (3 Turns) — §57 onKilled. Canon names a single ally; the shared buff op covers
  // the whole friendly side.
  '"The Honored"': {
    abilities: [
      { id: 'honored_redqueen', name: 'Honors of the Red Queen', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'honored_dmgup', name: 'DMG Boost', mods: [{ stat: 'dmgAll', value: 0.12 }], turns: 3 } }] },
    ],
    ai: new PatternAI(['honored_redqueen']),
    passive: {
      onKilled(sim, self, killer) {
        if (killer.dead === true) return
        sim.addBuff(killer, { id: 'honored_stone', name: 'DMG Boost', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: 3, sourceId: self.id })
      },
    },
  },

  // ---- Batch 4 — buffer + counter ------------------------------------------------------------
  // "Engender" (friendly ATK +20%, 2 Turns) + "Retaliation" (enters Counter: a Lightning "Leaf
  // Hinging" strike, 250%). The two variant Leaf Hinging ladders collapse to the 250% strike.
  'Twig of Marple Leaf': {
    abilities: [
      { id: 'marple_engender', name: 'Engender', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'marple_atkup', name: 'ATK Up', mods: [{ stat: 'atkPct', value: 0.20 }], turns: 2 } }] },
      {
        id: 'marple_retaliation', name: 'Retaliation', targetRule: 'self',
        effects: [{ op: 'counter', ability: { id: 'marple_leafhinging', name: 'Leaf Hinging', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }] }, exit: 'once' }],
      },
    ],
    ai: new PatternAI(['marple_engender', 'marple_retaliation']),
  },

  // ---- Batch 5 — death-rattle family (onKilled) ----------------------------------------------
  // "Drink Invite" single Physical 250%. "Hearty Revelry" grants a SoulGlad Revel stack (+50% DMG
  // dealt) on every attack taken; "Libation of Sweetness" on a killing blow hits adjacent friendly
  // units (Physical 1% Max HP + 10 Toughness), grants +30% SPD (2 Turns) and a Bleed (2.5% Target
  // Max HP per stack, stacks = SoulGlad Revel count, 2 Turns). Buffs clear before onKilled, so the
  // Revel count is carried in the runtime bag; DoT-taken does not drive onHitTaken (deviation).
  "Dreamjolt Troupe's Bubble Hound": {
    abilities: [{ id: 'bubblehound_invite', name: 'Drink Invite', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] }],
    ai: new PatternAI(['bubblehound_invite']),
    passive: {
      onHitTaken(sim, self) {
        const bag = sim.rt(self)
        bag.revel = Math.min(10, ((bag.revel as number) ?? 0) + 1)
        sim.addBuff(self, { id: 'bubblehound_revel', name: 'SoulGlad Revel', mods: [{ stat: 'dmgAll', value: 0.50 }], turns: Infinity, stacks: 1, maxStacks: 10, sourceId: self.id })
      },
      onKilled(sim, self) {
        const stacks = Math.max(1, (sim.rt(self).revel as number) ?? 1)
        for (const t of adjacentFriendlyUnits(sim, self)) {
          sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.01, elem: 'Physical', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Libation of Sweetness' })
          if (t.dead) continue
          sim.addBuff(t, { id: 'bubblehound_spdup', name: 'SPD Up', mods: [{ stat: 'spdPct', value: 0.30 }], turns: 2, sourceId: self.id })
          sim.applyDot(t, { kind: 'Bleed', elem: 'Physical', turns: 2, baseDmg: Math.floor(t.maxHp * 0.025 * stacks), stacks, sourceUnit: self })
        }
      },
    },
  },
  // "War, Father of All" single Physical 300%; "Just War" buffs one friendly unit (SPD +30%, DMG
  // +30% — duration absent from the data → 2 Turns; canon names one ally, the buff op covers the
  // side). War Armor as Furiae Warrior; "Proselytize" on a killing blow grants the attacker SPD
  // +30% and DMG +30% (2 Turns).
  'Furiae Philosopher': {
    abilities: [
      { id: 'philosopher_father', name: 'War, Father of All', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] },
      { id: 'philosopher_justwar', name: 'Just War', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'philosopher_justwar_buff', name: 'Proselytize', mods: [{ stat: 'spdPct', value: 0.30 }, { stat: 'dmgAll', value: 0.30 }], turns: 2 } }] },
    ],
    ai: new PatternAI(['philosopher_justwar', 'philosopher_father']),
    passive: {
      ...warArmor({ stacks: 3, dmgReduction: 0.10, shatterPct: 0.30, brokenPct: 0.10, delayPct: 0.30, energyPct: 0.06 }),
      onKilled(sim, self, killer) {
        if (killer.dead === true) return
        sim.addBuff(killer, { id: 'philosopher_spdup', name: 'SPD Up', mods: [{ stat: 'spdPct', value: 0.30 }], turns: 2, sourceId: self.id })
        sim.addBuff(killer, { id: 'philosopher_dmgup', name: 'DMG Boost', mods: [{ stat: 'dmgAll', value: 0.30 }], turns: 2, sourceId: self.id })
      },
    },
  },
  // "Horn Clash" single Quantum 320% (Entanglement-stack preference not modelled). "Decay Eulogy"
  // on a killing blow hits all friendly units (Quantum 60% Max HP + 10 Toughness) and, at 100% base
  // chance, increases their DMG taken (+10%, 3 Turns).
  'Gnaw Sting': {
    abilities: [{ id: 'gnawsting_hornclash', name: 'Horn Clash', targetRule: 'single', effects: [{ op: 'attack', mult: 3.2, elem: 'Quantum' }] }],
    ai: new PatternAI(['gnawsting_hornclash']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.6, elem: 'Quantum', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Decay Eulogy' })
          if (t.dead) continue
          sim.applyDebuff(self, t, 1.0, () => sim.addBuff(t, { id: 'gnawsting_vuln', name: 'DMG taken up', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 3, sourceId: self.id, debuff: true }), 'Decay Eulogy')
        }
      },
    },
  },
  // "Wingflap" single Wind 200% + Wind Shear; "Entomon Eulogy" on a killing blow hits all friendly
  // units (Wind 50% Max HP + 10 Toughness) and increases their DMG taken (+10%, 3 Turns). "Meiotic
  // Division" (Summon) is not modelled.
  'Juvenile Sting': {
    abilities: [{
      id: 'juvenile_wingflap', name: 'Wingflap', targetRule: 'single',
      effects: [
        { op: 'attack', mult: 2.0, elem: 'Wind' },
        { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 3, chance: 1.0 },
      ],
    }],
    ai: new PatternAI(['juvenile_wingflap']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.5, elem: 'Wind', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Entomon Eulogy' })
          if (t.dead) continue
          sim.applyDebuff(self, t, 1.0, () => sim.addBuff(t, { id: 'juvenile_vuln', name: 'DMG taken up', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 3, sourceId: self.id, debuff: true }), 'Entomon Eulogy')
        }
      },
    },
  },
  // "Undine's Fluttering Hem" AoE Ice 180%; "River of Souls' Intolerable Solitude" on a killing
  // blow hits all friendly units (Ice 15% Max HP + 10 Toughness). "Black Tide Fever" and "Respite
  // By The Waters" are not modelled.
  'Servant of Tides': {
    abilities: [{ id: 'servant_undine', name: "Undine's Fluttering Hem", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.8, elem: 'Ice' }] }],
    ai: new PatternAI(['servant_undine']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.15, elem: 'Ice', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: "River of Souls' Intolerable Solitude" })
      },
    },
  },
  // "Rumination of Putrid Dream" single Quantum 200%; "Such Is the Fate of Bubbles" on a killing
  // blow hits adjacent friendly units (Quantum 20% Max HP + 10 Toughness). "Mirage Rush" is not
  // modelled.
  'Mirage Fizzle Kid': {
    abilities: [{ id: 'miragekid_rumination', name: 'Rumination of Putrid Dream', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Quantum' }] }],
    ai: new PatternAI(['miragekid_rumination']),
    passive: {
      onKilled(sim, self) {
        for (const t of adjacentFriendlyUnits(sim, self)) sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.20, elem: 'Quantum', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Such Is the Fate of Bubbles' })
      },
    },
  },
  // "So Cometh Beauty's Knight" AoE Physical 240%; "Amor of Destined Death" on a killing blow hits
  // all friendly units (Physical 60% Max HP + 10 Toughness). The "Soulfreed" state (boosted values,
  // variant ladders 60/40/20% Max HP) is not modelled — the base 60% variant is used.
  '"Speartip"': {
    abilities: [{ id: 'speartip_knight', name: "So Cometh Beauty's Knight", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.4, elem: 'Physical' }] }],
    ai: new PatternAI(['speartip_knight']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.6, elem: 'Physical', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Amor of Destined Death' })
      },
    },
  },

  // ---- Batch 6 — lotus family + shared `sp` op ------------------------------------------------
  // "Samsara" reduces the team Skill Point pool by 1 (shared `sp` op). "Mend" heals 50% Max HP at
  // the start of each turn (`onTurnStart`). "Moksha" on a killing blow restores 3 Skill Points;
  // "Non-Destructing" regenerates 10 Energy for the player team. "Non-Living" (target Energy −5) is
  // not modelled.
  'Abundance Lotus': {
    abilities: [{ id: 'lotus_samsara', name: 'Samsara', targetRule: 'self', effects: [{ op: 'sp', delta: -1 }] }],
    ai: new PatternAI(['lotus_samsara']),
    passive: {
      onTurnStart(sim, self) { if (self.hp < self.maxHp) sim.heal(self, Math.floor(self.maxHp * 0.5), self) },
      onKilled(sim) {
        sim.gainSp(3)
        for (const a of sim.allies('ally')) sim.gainEnergyFlat(a, 10)
      },
    },
  },
  // "Black Prana's Snare": 100% base chance to inflict Prana-Siphon (Recoverable HP Reduction 40%,
  // 2 Turns) — modelled as an incoming-heal reduction. "Bloom"/"Repose"/"Black Prana's Return"/
  // "Safeguard" are not modelled.
  'Destruction Lotus': {
    abilities: [{
      id: 'lotus_snare', name: "Black Prana's Snare", targetRule: 'single',
      effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'lotus_pranasiphon', name: 'Prana-Siphon', mods: [{ stat: 'inHeal', value: -0.40 }], turns: 2 } }],
    }],
    ai: new PatternAI(['lotus_snare']),
  },
  // "Throw Die" single Physical 250% with 100% Base Chance to reduce the target's Effect RES 20%.
  // The reduction is a `debuff` op on `effRes` (2 turns, the shared duration default), now that
  // `applyDebuff`/`effectResOf` resolve Effect RES from the static field PLUS `effRes` buff mods.
  "Dreamjolt Troupe's Spring Loader": {
    abilities: [{
      id: 'springloader_throwdie', name: 'Throw Die', targetRule: 'single',
      effects: [
        { op: 'attack', mult: 2.5, elem: 'Physical' },
        { op: 'debuff', chance: 1.0, buff: { id: 'springloader_effres', name: 'Effect RES Reduced', mods: [{ stat: 'effRes', value: -0.20 }], turns: 2 } },
      ],
    }],
    ai: new PatternAI(['springloader_throwdie']),
  },
  // "Seeding Core" marks a target with Spur of Thunderwoe (inert debuff); "Thundering Reign" single
  // Lightning 250%; "Core Rupture" on a killing blow deals Lightning 450% to every target carrying
  // the mark, then removes it.
  'Disciples of Sanctus Medicus: Internal Alchemist': {
    abilities: [
      { id: 'alchemist_seed', name: 'Seeding Core', targetRule: 'single', effects: [{ op: 'debuff', chance: 1.0, buff: { id: 'spur_thunderwoe', name: 'Spur of Thunderwoe', mods: [], turns: Infinity } }] },
      { id: 'alchemist_reign', name: 'Thundering Reign', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }] },
    ],
    ai: new PatternAI(['alchemist_seed', 'alchemist_reign']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies('ally')) {
          if (!t.buffs.some(b => b.id === 'spur_thunderwoe')) continue
          sim.hit(self, t, { type: 'basic', mult: 4.5, elem: 'Lightning', canCrit: false, fromDeadAttacker: true, label: 'Core Rupture' })
          sim.removeBuff(t, 'spur_thunderwoe')
        }
      },
    },
  },
  // "Wrathful Blazing Axe" single Fire 300%. "Fire of Vengeance" (even-split 1400%) and "Bitter
  // Fracture" (act on an ally's defeat) are not modelled.
  "Black Tide's Corroded Axe": {
    abilities: [{ id: 'corrodedaxe_wrathful', name: 'Wrathful Blazing Axe', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Fire' }] }],
    ai: new PatternAI(['corrodedaxe_wrathful']),
  },
  // "Discharge" single Lightning 250%. "Heat It Up" / "Polarization" (battlefield Temperature /
  // Thundercloud stacks) are not modelled.
  'Daythunder Raven': {
    abilities: [{ id: 'raven_discharge', name: 'Discharge', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Lightning' }] }],
    ai: new PatternAI(['raven_discharge']),
  },

  // ---- Batch 7: flee countdown-entity family (Treasure Trotters) ---------------------------
  // Trotter identity is the panic timer, not combat: "S—S—S—Scared" (flee in 2 turns) →
  // "Run... Run!" (panic, flee in 1) → "Phew... Escaped" (flees). Shared `fleeCountdown` passive
  // decrements one count per OWN turn and calls the new `sim.flee` (a leave-battle that is NOT a
  // kill — no DEATH, no killer energy, no death-rattle). A Frozen trotter skips its turn before
  // `onTurnStart` runs, so its timer stalls — freezing genuinely stops the escape.
  // Flavor talents need team-reaction infra and are NOT modelled: Trotter of Abundance "C—Cure You"
  // (consume own HP to heal an attacked friendly), Trotter of Destruction "T—Taking Revenge" (AoE
  // 55% ATK counter per friendly unit attacked, max 5), Trotter of Preservation "P—Protect You"
  // (team-wide damage-nullifying stacks on battle start). Deviation: the panic-turn "Toughness
  // cannot be reduced + CC immune" hardening is dropped — the trotter flees on that very turn.
  'Sequence Trotter': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  'Trot Tri': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  'Warp Trotter': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  'Trotter of Abundance': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  'Trotter of Destruction': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  'Trotter of Preservation': {
    abilities: [trotterPanic('trotter_scared', 'S—S—S—Scared')],
    ai: new PatternAI(['trotter_scared']),
    passive: fleeCountdown(2),
  },
  // enters battle already panicking (Run... Run! state) — flees on its first own turn
  'Trot Deuce': {
    abilities: [trotterPanic('trotter_run', 'Run... Run!')],
    ai: new PatternAI(['trotter_run']),
    passive: fleeCountdown(1),
  },
  'Trot Prime': {
    abilities: [trotterPanic('trotter_escaped', 'Phew... Escaped')],
    ai: new PatternAI(['trotter_escaped']),
    passive: fleeCountdown(1),
  },

  // ---- Batch 8: Lock-On + self-cleanse + ally-target family -----------------------------------
  // "Nihility's Command" (Lock On) pins a random character as the forced single-target of every
  // living enemy via `addTargetOverride` and marks it with a vulnerability debuff (`enemy_lockon`).
  // "Shadowless Void Strike" is a plain Quantum single — on a locked battle field the resolver sends
  // it straight at the pinned unit (§62 forced level beats weighted-aggro).
  'Voidranger: Distorter': {
    abilities: [
      { id: 'distorter_lock', name: "Nihility's Command", targetRule: 'random', effects: [{ op: 'lockon', vuln: 0.1, turns: 4 }] },
      { id: 'distorter_strike', name: 'Shadowless Void Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 5.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['distorter_lock', 'distorter_strike']),
  },
  // "Void Cannon" imag 400% + 75% Detonated (3 uses, inert marker — no described effect) and then
  // the unit becomes Overloaded (self buff until cleansed). "Thermal Barrier" strips it via the
  // shared `dispelSelf` op. Rotation: cannon twice, then the cleanse.
  'Voidranger: Eliminator': {
    abilities: [
      {
        id: 'eliminator_cannon', name: 'Void Cannon', targetRule: 'single', effects: [
          { op: 'attack', mult: 4.0, elem: 'Imaginary' },
          { op: 'debuff', chance: 0.75, buff: { id: 'eliminator_detonated', name: 'Detonated (3 uses)', mods: [], turns: 3 } },
          { op: 'buff', to: 'self', buff: { id: 'eliminator_overloaded', name: 'Overloaded', mods: [], turns: Infinity } },
        ],
      },
      { id: 'eliminator_barrier', name: 'Thermal Barrier', targetRule: 'self', effects: [{ op: 'dispelSelf', id: 'eliminator_overloaded' }] },
    ],
    ai: new PatternAI(['eliminator_cannon', 'eliminator_cannon', 'eliminator_barrier']),
  },
  // "Unstable Forcefield": single Phys 300% and a Barrier to allies. Canon targets ONE friendly;
  // the shared `shield` op has no single-friendly recipient so it shields the whole side (deviation).
  'Automaton Beetle': {
    abilities: [
      {
        id: 'beetle_forcefield', name: 'Unstable Forcefield', targetRule: 'single', effects: [
          { op: 'attack', mult: 3.0, elem: 'Physical' },
          { op: 'shield', frac: 1.0, to: 'allies' },
        ],
      },
    ],
    ai: new PatternAI(['beetle_forcefield']),
  },
  // Commerce Trotter: talent-only (no attack skill in raw data → authored basic strike stands in for
  // the enemy default). "Entrepreneurial Spirit": every time the unit is attacked, a random OTHER
  // friendly unit's SPD rises (magnitude not in data → authored +10% × 1 turn, deviation).
  'Commerce Trotter': {
    abilities: [{ id: 'commerce_basic', name: 'Jostle', targetRule: 'single', effects: [{ op: 'attack', mult: 1.0, elem: 'Physical' }] }],
    ai: new PatternAI(['commerce_basic']),
    passive: {
      onHitTaken(sim, self) {
        const friends = sim.units().filter(u => u.side === self.side && !u.dead && u.id !== self.id)
        if (!friends.length) return
        sim.addBuff(sim.rngPick(friends), { id: 'commerce_spd', name: 'Entrepreneurial Spirit', mods: [{ stat: 'spdPct', value: 0.1 }], turns: 1, sourceId: self.id })
        sim.log(`◆ ${self.name} boosts a friendly unit's SPD (Entrepreneurial Spirit)`)
      },
    },
  },
  // Furiae Archer: "Weeping Arrow" Barrage (5 rounds, Lightning 100% ATK each). Canon splits into a
  // 1-per-target priority phase + random repeats and stacks +200% on repeat hits; no numbers are in
  // the data, so it is modelled as a 5-hit shared `bounce` (deviation). "Polis Protector" = War
  // Armor 3 exactly: 10% DR, 30% MaxHP shatter, 30% delay, 6% attacker energy, 10%/hit after broken.
  'Furiae Archer': {
    abilities: [{ id: 'archer_weeping', name: 'Weeping Arrow', targetRule: 'random', effects: [{ op: 'bounce', mult: 1.0, hits: 5, elem: 'Lightning' }] }],
    ai: new PatternAI(['archer_weeping']),
    passive: warArmor({ stacks: 3, shatterPct: 0.30, delayPct: 0.30, energyPct: 0.06, brokenPct: 0.10 }),
  },

  // ---- Batch 9: state-gated rotation + telegraph charge + death-shield family ------------------
  // "Maddening" starts the battle Maddened (infinite, dispellable marker buff) and, while Maddened,
  // the warden uses only "Sawing Evil: Sever". The Chop (200%) mode that returns after a dispel is
  // not modelled (buff-removal hook missing) — the Maddened state is permanent here.
  'Mara-Struck Warden': {
    abilities: [{ id: 'warden_sever', name: 'Sawing Evil: Sever', targetRule: 'single', effects: [{ op: 'attack', mult: 4.4, elem: 'Wind' }] }],
    ai: new PatternAI(['warden_sever']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'mara_maddening', name: 'Maddening', mods: [], turns: Infinity, sourceId: self.id })
        sim.log(`${self.name} enters the Maddened state — will use Sawing Evil: Sever`)
      },
    },
  },
  // "Arrow of the Foul Tide" AoE; "Fated End" (Corrosion conversion) is not modelled.
  "Black Tide's Decrepit Bow": {
    abilities: [{ id: 'bow_foultide', name: 'Arrow of the Foul Tide', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Physical' }] }],
    ai: new PatternAI(['bow_foultide']),
  },
  // "Tip of Destruction" Blast; "Fated End" (Corrosion conversion) is not modelled.
  'Tide-Eroded Blade': {
    abilities: [{ id: 'blade_destruction', name: 'Tip of Destruction', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.5, adjMult: 2.4, elem: 'Physical' }] }],
    ai: new PatternAI(['blade_destruction']),
  },
  // "Boosting Strength" (enter Strength Boost! → Windmill Defacer next turn) is the §55 cast
  // telegraph: the charged hit resolves at release. "IFF Systems Malfunction" (act immediately when
  // attacked) and the team Punchline gain are not modelled.
  'SD Civilian Mechatron': {
    abilities: [{ id: 'mechatron_windmill', name: 'Windmill Defacer', targetRule: 'single', cast: 1, effects: [{ op: 'attack', mult: 3.5, elem: 'Physical' }] }],
    ai: new PatternAI(['mechatron_windmill']),
  },
  // "Punchline Analysis" single Quantum; "Curtain Call" on a killing blow shields ALL friendly
  // units ("Tragic Core"). The shield magnitude is absent from the data → authored 50% Max HP
  // (deviation). "Comedian Ensemble" (shared action order) is not modelled.
  Comediologist: {
    abilities: [{ id: 'comedio_punchline', name: 'Punchline Analysis', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Quantum' }] }],
    ai: new PatternAI(['comedio_punchline']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          if (t.dead || t.id === self.id) continue
          const amount = Math.round(t.maxHp * 0.5)
          if (amount <= 0) continue
          const rt = enemyDefenseOf(t)
          rt.shield += amount
          sim.log(`${t.name} gains ${amount} Shield`, { type: 'SHIELD_APPLIED', source: t.name, target: t.name, sourceId: t.id, targetId: t.id, payload: { amount, id: 'enemy_shield', name: 'Defense Shield', remaining: rt.shield } })
        }
      },
    },
  },
  // ---- Batch 10: channel state machine + killing-blow reward + DoT striker ----------------------
  // "Lottery Warmup" single Physical; "Dreamjolt Prizepool" rewards the player TEAM on this unit's
  // death according to the §54 killing-blow type: Basic/DoT → +2 SP; Skill/FUA → +20 Energy;
  // Ultimate → +20 Energy and +2 SP. The magnitudes are authored (data gives the type table only).
  "Dreamjolt Troupe's Fortune Seller": {
    abilities: [{ id: 'fortune_lottery', name: 'Lottery Warmup', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] }],
    ai: new PatternAI(['fortune_lottery']),
    passive: {
      onKilled(sim, self) {
        const blow = (sim.rt(self) as { killingBlow?: string }).killingBlow
        const team = sim.allies('ally').filter(u => u.kind === 'char' && !u.dead)
        if (blow === 'basic' || blow === 'dot') {
          sim.gainSp(2)
          sim.log("◆ Fortune Seller's Dreamjolt Prizepool: the team gains 2 Skill Points")
        } else if (blow === 'ult') {
          sim.gainSp(2)
          for (const c of team) sim.gainEnergyFlat(c, 20)
          sim.log("◆ Fortune Seller's Dreamjolt Prizepool: Jackpot - 2 Skill Points and 20 Energy for the team")
        } else if (blow === 'skill' || blow === 'fua') {
          for (const c of team) sim.gainEnergyFlat(c, 20)
          sim.log("◆ Fortune Seller's Dreamjolt Prizepool: the team regenerates 20 Energy")
        }
      },
    },
  },
  // Mr. Domescreen alternates two broadcast channels. Each channel is a marker buff and the switch
  // pair is `require`-gated, so the rotation self-corrects: Switch-to-Fright needs Surprise, its
  // broadcast then needs Fright (and vice-versa). "Channel Crossover" flips the channel whenever the
  // unit is hit (§57 onHitTaken). Spawns in the Surprise channel.
  "Dreamjolt Troupe's Mr. Domescreen": {
    abilities: [
      { id: 'domescreen_to_fright', name: 'Channel Switch (Fright)', targetRule: 'self', require: { buff: CH_SURPRISE }, effects: [{ op: 'dispelSelf', id: CH_SURPRISE }, { op: 'buff', to: 'self', buff: { id: CH_FRIGHT, name: 'Fright Channel', mods: [], turns: Infinity } }] },
      { id: 'domescreen_fright', name: 'Startling Broadcast', targetRule: 'aoe', require: { buff: CH_FRIGHT }, effects: [{ op: 'aoe', mult: 1.6, elem: 'Quantum' }, { op: 'drainEnergyPct', pct: 0.2 }] },
      { id: 'domescreen_to_surprise', name: 'Channel Switch (Surprise)', targetRule: 'self', require: { buff: CH_FRIGHT }, effects: [{ op: 'dispelSelf', id: CH_FRIGHT }, { op: 'buff', to: 'self', buff: { id: CH_SURPRISE, name: 'Surprise Channel', mods: [], turns: Infinity } }] },
      { id: 'domescreen_surprise', name: 'Surprise Variety Show', targetRule: 'self', require: { buff: CH_SURPRISE }, effects: [{ op: 'allyEnergyPct', pct: 0.5 }] },
    ],
    ai: new PatternAI(['domescreen_to_fright', 'domescreen_fright', 'domescreen_to_surprise', 'domescreen_surprise']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: CH_SURPRISE, name: 'Surprise Channel', mods: [], turns: Infinity, sourceId: self.id })
        sim.log(`${self.name} enters the Surprise Channel`)
      },
      onHitTaken(sim, self) { flipChannel(sim, self) },
    },
  },
  // Ternary Assimilation Unit = Mr. Domescreen without Surprise Variety Show: it still switches
  // channels and broadcasts. Spawns in the Fright channel (deviation: no Surprise ability in kit).
  'Ternary Assimilation Unit': {
    abilities: [
      { id: 'ternary_to_fright', name: 'Channel Switch (Fright)', targetRule: 'self', require: { buff: CH_SURPRISE }, effects: [{ op: 'dispelSelf', id: CH_SURPRISE }, { op: 'buff', to: 'self', buff: { id: CH_FRIGHT, name: 'Fright Channel', mods: [], turns: Infinity } }] },
      { id: 'ternary_fright', name: 'Startling Broadcast', targetRule: 'aoe', require: { buff: CH_FRIGHT }, effects: [{ op: 'aoe', mult: 1.6, elem: 'Quantum' }, { op: 'drainEnergyPct', pct: 0.2 }] },
      { id: 'ternary_to_surprise', name: 'Channel Switch (Surprise)', targetRule: 'self', require: { buff: CH_FRIGHT }, effects: [{ op: 'dispelSelf', id: CH_FRIGHT }, { op: 'buff', to: 'self', buff: { id: CH_SURPRISE, name: 'Surprise Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['ternary_to_fright', 'ternary_fright', 'ternary_to_surprise']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: CH_FRIGHT, name: 'Fright Channel', mods: [], turns: Infinity, sourceId: self.id })
        sim.log(`${self.name} enters the Fright Channel`)
      },
      onHitTaken(sim, self) { flipChannel(sim, self) },
    },
  },
  // "Wolf Predation" single Lightning + Shock. "Rallying Howl" (summon a Shadow Jackhyache) is not
  // modelled (enemy-side summon unsupported); the Aether Spirit "Wolf Consumption" variant is
  // deferred.
  'Abundance Sprite: Wooden Lupus': {
    abilities: [{
      id: 'lupus_predation', name: 'Wolf Predation', targetRule: 'single',
      effects: [
        { op: 'attack', mult: 2.0, elem: 'Lightning' },
        { op: 'dot', kind: 'Shock', mult: 1.5, turns: 3, chance: 1.0 },
      ],
    }],
    ai: new PatternAI(['lupus_predation']),
  },
  // ---- Batch 12: Safeguard family (intact DMG reduction → break delay + vulnerability) ----------
  // "Plane Shred" Blast Wind; talent "Safeguard": −60% DMG taken while intact, delayed 75% and
  // +50% DMG taken once Weakness-Broken. The attributes are the §57 `safeguard` passive.
  'Planeshred Claws': {
    abilities: [{ id: 'claws_plane_shred', name: 'Plane Shred', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 2.4, elem: 'Wind' }] }],
    ai: new PatternAI(['claws_plane_shred']),
    passive: safeguard(),
  },
  // "Nebula Eater" AoE Wind + the same Safeguard talent.
  'Nebula Devourer': {
    abilities: [{ id: 'devourer_nebula', name: 'Nebula Eater', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.4, elem: 'Wind' }] }],
    ai: new PatternAI(['devourer_nebula']),
    passive: safeguard(),
  },
  // "Worldpurge" AoE Wind + the same Safeguard talent.
  'Worldpurge Tail': {
    abilities: [{ id: 'tail_worldpurge', name: 'Worldpurge', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.4, elem: 'Wind' }] }],
    ai: new PatternAI(['tail_worldpurge']),
    passive: safeguard(),
  },
  // "Structural Deviation" single Physical + the same Safeguard talent (its raw text states the
  // canonical 60%/75%/50% used as the `safeguard` defaults).
  'Memory Zone Meme "Heartbreaker"': {
    abilities: [{ id: 'heartbreaker_deviation', name: 'Structural Deviation', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Physical' }] }],
    ai: new PatternAI(['heartbreaker_deviation']),
    passive: safeguard({ reduction: 0.60, delayPct: 0.75, vuln: 0.50 }),
  },
  // ---- Batch 13: Banacademic Office advisor family (channel state machine) ----------------------
  // Three advisor mobs + the Charmony BananAdvisor elite (in `profiles.ts`) run one shared §54
  // Classroom / Off-Class state machine, reusing the Mr. Domescreen pattern: two marker buffs,
  // `require`-gated abilities so the rotation self-corrects, and "Disrupt Banasyllabus" (an
  // `onHitTaken` flip Classroom → Off-Class). In the Off-Class state the unit uses its support skill
  // and returns via "Change Banasyllabus"; in the Classroom state it uses its attack/support skill.
  // Deviation: the canon "be granted an Extra Action to revert" is modelled as the switch simply
  // being the unit's next action, and the possible spawn channel is not published → spawn Classroom.
  'Banacademic Office\'s Assistanana': {
    abilities: [
      { id: 'assist_banascary', name: 'Banascary Semester', targetRule: 'aoe', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'aoe', mult: 1.5, elem: 'Quantum' }, { op: 'drainEnergyFlat', amount: 15 }] },
      { id: 'assist_banappiness', name: 'Banappiness Holiday', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'allyEnergyPct', pct: 0.5 }] },
      { id: 'assist_change', name: 'Change Banasyllabus', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'dispelSelf', id: BANACADEMIC_OFFCLASS }, { op: 'buff', to: 'self', buff: { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['assist_banappiness', 'assist_change', 'assist_banascary']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity, sourceId: self.id }) },
      onHitTaken(sim, self) { banacademicDisrupt(sim, self) },
    },
  },
  "Banacademic Office's Dreamweaver BananAdvisor": {
    abilities: [
      { id: 'dream_sitdown', name: 'Class Time! Sit Down!', targetRule: 'self', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'advance', pct: 0.5, to: 'allies' }] },
      { id: 'dream_charge', name: 'Break Time! Chaaarge!', targetRule: 'aoe', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'advance', pct: 0.5, to: 'targets' }] },
      { id: 'dream_change', name: 'Change Banasyllabus', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'dispelSelf', id: BANACADEMIC_OFFCLASS }, { op: 'buff', to: 'self', buff: { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['dream_charge', 'dream_change', 'dream_sitdown']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity, sourceId: self.id }) },
      onHitTaken(sim, self) { banacademicDisrupt(sim, self) },
    },
  },
  "Banacademic Office's Fortune BananAdvisor": {
    abilities: [
      { id: 'fortune_demerits', name: 'Bad Monkeys Get Demerits', targetRule: 'self', require: { buff: BANACADEMIC_CLASSROOM }, effects: [{ op: 'sp', delta: -1 }] },
      { id: 'fortune_grades', name: 'Good Monkeys Get Grades', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'sp', delta: 2 }] },
      { id: 'fortune_change', name: 'Change Banasyllabus', targetRule: 'self', require: { buff: BANACADEMIC_OFFCLASS }, effects: [{ op: 'dispelSelf', id: BANACADEMIC_OFFCLASS }, { op: 'buff', to: 'self', buff: { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['fortune_grades', 'fortune_change', 'fortune_demerits']),
    passive: {
      onSpawn(sim, self) { sim.addBuff(self, { id: BANACADEMIC_CLASSROOM, name: 'Classroom Channel', mods: [], turns: Infinity, sourceId: self.id }) },
      onHitTaken(sim, self) { banacademicDisrupt(sim, self) },
    },
  },
  // ---- Batch 14: Moon Rage / Bloodlust pack (Wolftrooper family) --------------------------------
  // "Lupine Maw" is a SHARED Bloodlust counter across every "Moon Rage-capable" ally: each capable
  // ally's turn adds a stack to the whole pack, and at 6 the pack enters Moon Rage (SPD up). A
  // 2-own-turn countdown then dispels it pack-wide, as does a unit's own Weakness Break. The
  // rage-state attack variants are `require`-gated, so the PatternAI swaps them in automatically.
  // Deviation: the Moon Rage SPD value and countdown length are absent from the data → +20% / 2 turns.
  'Eclipse Wolftrooper': {
    abilities: [
      { id: 'wolf_gnaw', name: 'Gnaw', targetRule: 'single', effects: [{ op: 'attack', mult: 2.8, elem: 'Physical' }] },
      {
        id: 'wolf_gnaw_rage', name: 'Gnaw (Moon Rage)', targetRule: 'single', require: { buff: MOON_RAGE },
        effects: [
          { op: 'attack', mult: 2.8, elem: 'Physical' },
          { op: 'heal', frac: 0.40, of: 'actor', to: 'self' },
        ],
      },
    ],
    ai: new PatternAI(['wolf_gnaw_rage', 'wolf_gnaw']),
    passive: moonRage(),
  },
  'Sableclaw Wolftrooper': {
    abilities: [
      { id: 'wolf_massacre', name: 'Massacre', targetRule: 'blast', effects: [{ op: 'blast', mult: 1.8, adjMult: 1.8, elem: 'Physical' }] },
      {
        id: 'wolf_massacre_rage', name: 'Massacre (Moon Rage)', targetRule: 'blast', require: { buff: MOON_RAGE },
        effects: [
          { op: 'blast', mult: 1.8, adjMult: 1.8, elem: 'Physical' },
          { op: 'dot', kind: 'Bleed', mult: 0.5, turns: 2, chance: 1.0 },
        ],
      },
    ],
    ai: new PatternAI(['wolf_massacre_rage', 'wolf_massacre']),
    passive: moonRage(),
  },
  // ---- Batch 15: charge/support, Reverberation, Ice death-rattle, War-Armor buffer --------------
  // "Set Alarm" (Charge) is a telegraphed cast whose release, "Wake-Up Alarm", makes every OTHER
  // friendly unit act immediately — modelled as a full Action Advance that excludes the actor
  // (`advance {to:'alliesOther'}`). "Wake-Up Punch" is the plain single physical attack.
  // Deviation: the charge/release pair shares one ability (shown as Wake-Up Alarm) and the
  // "immediately act" amount is authored as 100% (the data gives no percentage).
  "Dreamjolt Troupe's Winder Goon": {
    abilities: [
      { id: 'winder_alarm', name: 'Wake-Up Alarm', targetRule: 'self', cast: 1, effects: [{ op: 'advance', to: 'alliesOther', pct: 1.0 }] },
      { id: 'winder_punch', name: 'Wake-Up Punch', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['winder_alarm', 'winder_punch']),
  },
  // "Sawing Evil" single Physical 250% + 35% base chance Reverberation (2 Turns). Reuses the
  // `reverberation` marker debuff (same id as Aurumaton Spectral Envoy); the canon follow-up — a
  // Reverberated target that receives an attack entering Strong Reverberation (70% Action Delay,
  // 1 Turn, cannot act) and losing Reverberation — is not modelled (no "on-target-attacked" hook).
  'Wraith Warden': {
    abilities: [{
      id: 'warden_sawing', name: 'Sawing Evil', targetRule: 'single',
      effects: [
        { op: 'attack', mult: 2.5, elem: 'Physical' },
        { op: 'debuff', chance: 0.35, buff: { id: 'reverberation', name: 'Reverberation', mods: [], turns: 2 } },
      ],
    }],
    ai: new PatternAI(['warden_sawing']),
  },
  // "Undine's Fluttering Hem" AoE Ice 100%. "River of Souls' Intolerable Solitude" on a killing blow
  // hits all friendly units (Ice, +10 Toughness) and inflicts Glacial Erosion. Deviation: "massive
  // Ice DMG" is authored as 50% of the caster's Max HP, and Glacial Erosion as an Ice-RES −20% debuff
  // (2 Turns) — the data gives neither value.
  'Hallucinogenic Mermaid': {
    abilities: [{ id: 'mermaid_undine', name: "Undine's Fluttering Hem", targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.0, elem: 'Ice' }] }],
    ai: new PatternAI(['mermaid_undine']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.5, elem: 'Ice', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: "River of Souls' Intolerable Solitude" })
          if (t.dead) continue
          sim.applyDebuff(self, t, 1.0, () => sim.addBuff(t, { id: 'mermaid_glacial', name: 'Glacial Erosion', mods: [{ stat: 'resRed:Ice', value: 0.20 }], turns: 2, sourceId: self.id, debuff: true }), 'Glacial Erosion')
        }
      },
    },
  },
  // "Praise Nikador" enters the "War Song" state (a battle-start team marker buff; the canon "+2 max
  // War Armor stacks for allies" is not modelled — no API mutates another unit's War Armor cap).
  // "Into the Supple Fire" Blast Imaginary 300%/200%. Polis Protector = the shared `warArmor` passive
  // (2 stacks, −10% DMG taken, 1 stack lost per attack taken). Deviation: only the −10%/2-stack
  // values are authored; the shatter leak uses `warArmor` defaults (the data states none).
  'Furiae Troupe': {
    abilities: [
      { id: 'troupe_supplefire', name: 'Into the Supple Fire', targetRule: 'blast', effects: [{ op: 'blast', mult: 3.0, adjMult: 2.0, elem: 'Imaginary' }] },
      { id: 'troupe_praise', name: 'Praise Nikador', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: FURIAE_WARSONG, name: 'War Song', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['troupe_supplefire', 'troupe_praise']),
    passive: (() => {
      const wa = warArmor({ stacks: 2, dmgReduction: 0.10 })
      return {
        ...wa,
        onSpawn(sim, self) {
          wa.onSpawn?.(sim, self)
          sim.addBuff(self, { id: FURIAE_WARSONG, name: 'War Song', mods: [], turns: Infinity, sourceId: self.id })
        },
      }
    })(),
  },
  // ---- Batch 16: two-ability rotation, charge death-rattle, spawn/adjacent marker, elite Safeguard
  // "The Living Shan't Flee" single Quantum 150% and "The Dead Shan't Avoid" Blast Quantum 100%/100%.
  // Deviation: the "Overdue Obituary" state that upgrades Living → Dead is not modelled (both rotate),
  // and the Atrophy-DMG conversion (target HP > 50%) is not modelled.
  'The Long Arms of Sorrow': {
    abilities: [
      { id: 'sorrow_living', name: "The Living Shan't Flee", targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Quantum' }] },
      { id: 'sorrow_dead', name: "The Dead Shan't Avoid", targetRule: 'blast', effects: [{ op: 'blast', mult: 1.0, adjMult: 1.0, elem: 'Quantum' }] },
    ],
    ai: new PatternAI(['sorrow_living', 'sorrow_dead']),
  },
  // "Prepare to Fight" (Charge) → "Bursting Detonation". Modelled as one `cast:1` Wind strike (same
  // pattern as SD Civilian Mechatron); the "Bursting Detonation" multiplier is absent from the data →
  // authored 300%. Death-rattle "Entomon Eulogy": on a killing blow, Wind 60% of the caster's Max HP
  // + 10 Toughness to all friendly units, plus 2 stacks of +10% DMG-taken (3 Turns, max 10).
  'Lesser Sting': {
    abilities: [{ id: 'lesser_detonation', name: 'Bursting Detonation', targetRule: 'single', cast: 1, effects: [{ op: 'attack', mult: 3.0, elem: 'Wind' }] }],
    ai: new PatternAI(['lesser_detonation']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          sim.hit(self, t, { type: 'basic', scaleStat: 'hp', mult: 0.6, elem: 'Wind', toughDmg: 10, canCrit: false, fromDeadAttacker: true, label: 'Entomon Eulogy' })
          if (t.dead) continue
          sim.applyDebuff(self, t, 1.0, () => sim.addBuff(t, { id: 'sting_vuln', name: 'DMG Taken Up', mods: [{ stat: 'vulnAll', value: 0.10 }], turns: 3, stacks: 2, maxStacks: 10, sourceId: self.id, debuff: true }), 'Entomon Eulogy')
        }
      },
    },
  },
  // "Hemotort Gnaw" single Imaginary 260% + a spawn "Hemotort Stain" marker. Death-rattle "Hemotort
  // Entrustment": a killing blow passes the marker to adjacent friendly units. Deviation: the canon
  // "Hemotort Corruption on hit (based on DMG not offset by a Shield)" and the Stain's own on-attack
  // corruption are not modelled — the Stain is a marker only.
  'Ichor Memosprite: Canine': {
    abilities: [{ id: 'canine_gnaw', name: 'Hemotort Gnaw', targetRule: 'single', effects: [{ op: 'attack', mult: 2.6, elem: 'Imaginary' }] }],
    ai: new PatternAI(['canine_gnaw']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'canine_stain', name: 'Hemotort Stain', mods: [], turns: Infinity, sourceId: self.id })
      },
      onKilled(sim, self) {
        for (const t of adjacentFriendlyUnits(sim, self)) {
          sim.addBuff(t, { id: 'canine_stain', name: 'Hemotort Stain', mods: [], turns: Infinity, sourceId: self.id })
        }
      },
    },
  },
  // ---- Batch 17 — Illusion variants, support/redirect markers, death-state family --------------
  // Illusion elemental strikers: the raw text says only "minor Ice DMG" (no multiplier) → authored to
  // match their non-Illusion counterparts (Ice Edge 200%, Lance 250%). Their weakness/mode differ from
  // the base Ice Edge / Lance entries, which is why they are separate base names.
  'Ice Edge (Illusion) (1)': {
    abilities: [{ id: 'iceedgeillus1_icywind', name: 'Icy Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Ice' }] }],
    ai: new PatternAI(['iceedgeillus1_icywind']),
  },
  'Ice Edge (Illusion) (2)': {
    abilities: [{ id: 'iceedgeillus2_icywind', name: 'Icy Wind', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.0, elem: 'Ice' }] }],
    ai: new PatternAI(['iceedgeillus2_icywind']),
  },
  'Lance of the Eternal Freeze (Illusion) (1)': {
    abilities: [{ id: 'lanceillus1_everwinter', name: 'Everwinter Reverberance', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }] }],
    ai: new PatternAI(['lanceillus1_everwinter']),
  },
  'Lance of the Eternal Freeze (Illusion) (2)': {
    abilities: [{ id: 'lanceillus2_everwinter', name: 'Everwinter Reverberance', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 2.5, elem: 'Ice' }] }],
    ai: new PatternAI(['lanceillus2_everwinter']),
  },
  // "Pierce the Night Sky" single Wind 200% + "Shine Like Meteors" (1 Stormride stack on ONE friendly
  // unit). New primitive carried: `buff { to:'allyRandom' }`. Deviation: Stormride's "immediately take
  // action at the end of their turn" is a marker only.
  'Meteoric Eagle': {
    abilities: [
      { id: 'eagle_pierce', name: 'Pierce the Night Sky', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Wind' }] },
      { id: 'eagle_storm', name: 'Shine Like Meteors', targetRule: 'self', effects: [{ op: 'buff', to: 'allyRandom', buff: { id: 'stormride', name: 'Stormride', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['eagle_storm', 'eagle_pierce']),
  },
  // "Hemotort Graze" single Imaginary 280% + "Hemotort Resonance" (self + other Pheasants enter the
  // Resonance state). Deviation: the reactive "another Resonance Pheasant attacks → this unit also
  // attacks" trigger is not modelled (marker), and the marker is applied to the whole friendly side
  // rather than only fellow Pheasants.
  'Ichor Memosprite: Pheasant': {
    abilities: [
      { id: 'pheasant_graze', name: 'Hemotort Graze', targetRule: 'single', effects: [{ op: 'attack', mult: 2.8, elem: 'Imaginary' }] },
      { id: 'pheasant_resonance', name: 'Hemotort Resonance', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'pheasant_resonance', name: 'Hemotort Resonance', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['pheasant_resonance', 'pheasant_graze']),
  },
  // "Arrest" single Physical 250% + "Guard" (applies "Fealty" to ONE friendly unit). Deviation: Fealty's
  // DMG-redirect ("transfer the attack's DMG to the Doggo") and the granted Punchline are marker-only.
  'Security Doggo': {
    abilities: [
      { id: 'doggo_arrest', name: 'Arrest', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] },
      { id: 'doggo_guard', name: 'Guard', targetRule: 'self', effects: [{ op: 'buff', to: 'allyRandom', buff: { id: 'doggo_fealty', name: 'Fealty', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['doggo_arrest', 'doggo_guard']),
  },
  // "Love Stormfall Day" single Lightning 280% + the Rainy/Sunny death-states. Spawns Rainy (marker).
  // Deviation: the "Elation DMG / Elation Skill → Sunny" switch (25% action delay + Punchline) is not
  // modelled, so the unit always dies Rainy and runs the 5-bounce death-rattle (100% ATK + a guaranteed
  // Shock, authored — the data only says "high chance"); the Sunny branch (allies +25% CRIT DMG, 2 Turns)
  // is implemented but unreachable without the switch.
  'Magical Girl Troupe (Enemy)': {
    abilities: [{ id: 'mg_dayfall', name: 'Love Stormfall Day', targetRule: 'single', effects: [{ op: 'attack', mult: 2.8, elem: 'Lightning' }] }],
    ai: new PatternAI(['mg_dayfall']),
    passive: {
      onSpawn(sim, self) {
        // the state lives in `rt` because Lifecycle.kill wipes `self.buffs` before `onKilled` runs.
        sim.rt(self).mg_state = 'rainy'
        sim.addBuff(self, { id: 'mg_rainy', name: 'Rainy Day', mods: [], turns: Infinity, sourceId: self.id })
      },
      onKilled(sim, self) {
        if (sim.rt(self).mg_state === 'rainy') {
          const foes = sim.units().filter(u => u.side !== self.side && !u.dead)
          for (let i = 0; i < 5 && foes.length; i++) {
            const t = sim.rngPick(foes)
            sim.hit(self, t, { type: 'skill', mult: 1.0, elem: 'Lightning', canCrit: false, fromDeadAttacker: true, label: 'Gentle Rains' })
            if (t.dead) continue
            sim.applyDot(t, { kind: 'Shock', elem: 'Lightning', turns: 2, baseDmg: Math.floor(sim.effAtk(self) * 1.0), stacks: 1, sourceUnit: self })
          }
        } else {
          for (const a of sim.allies(self.side)) {
            if (a.dead) continue
            sim.addBuff(a, { id: 'mg_sunnycrit', name: 'Sunny Skies', mods: [{ stat: 'critDmg', value: 0.25 }], turns: 2, sourceId: self.id })
          }
        }
      },
    },
  },
  // ---- Batch 18 — arena/Khaslana adds, elemental status, support-marker family ------------------
  // "Let Blank Wishes Become Whole" AoE Physical ("minor" → authored 150%). Deviation: "Let Not Gold
  // Flow For Naught" (Khaslana loses HP per Shadow created) is not modelled.
  'Shadow of "Hatred"': {
    abilities: [{ id: 'hatred_wishes', name: 'Let Blank Wishes Become Whole', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 1.5, elem: 'Physical' }] }],
    ai: new PatternAI(['hatred_wishes']),
  },
  // "Outrage" single Wind 200% + Wind Shear (50% ATK, 2 Turns) + an "Outrage" mark. Deviation: the
  // Outrage control ("cannot act N turns, attacks a random ally") is a marker debuff only; its
  // duration is authored 2 turns (the data says "a number of turns").
  'Twig of Wintry Wind': {
    abilities: [{ id: 'twig_outrage', name: 'Outrage', targetRule: 'single', effects: [
      { op: 'attack', mult: 2.0, elem: 'Wind' },
      { op: 'dot', kind: 'WindShear', mult: 0.5, turns: 2 },
      { op: 'debuff', buff: { id: 'twig_outrage', name: 'Outrage', mods: [], turns: 2 }, chance: 1.0 },
    ] }],
    ai: new PatternAI(['twig_outrage']),
  },
  // "Capture" single Imaginary ("minor" → authored 200%). Deviation: "Ugly Close-Up" (Elation photo
  // rating + Punchline to the target team) is not modelled (no enemy-side Punchline resource).
  'Furbo Journalist': {
    abilities: [{ id: 'furbo_capture', name: 'Capture', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Imaginary' }] }],
    ai: new PatternAI(['furbo_capture']),
  },
  // "First Bloom" (support): 1 stack of "Wicked Grin" (DMG dealt up, max 10) to ONE ally. `dmgAll`
  // per-stack is authored 10% (the data gives no magnitude). Deviation: the canon recipient is
  // specifically "Paramount Bliss Inverted: Illwish Archlotus" (approximated as a random ally) and
  // "Fatal Mockery" (Punchline on kill) is not modelled.
  'Illwish Lotus': {
    abilities: [{ id: 'illwish_bloom', name: 'First Bloom', targetRule: 'self', effects: [{ op: 'buff', to: 'allyRandom', buff: { id: 'wicked_grin', name: 'Wicked Grin', mods: [{ stat: 'dmgAll', value: 0.10 }], turns: Infinity, maxStacks: 10 } }] }],
    ai: new PatternAI(['illwish_bloom']),
  },
  // "Crackle Shot" single Quantum 200% + "Happiness Charm" (ONE random of: self ATK +50%, advance all
  // allies 50%, or Strong Reverberation on the OTHER allies). New primitives carried: `oneOf` (seeded
  // random pick) + the `alliesOther` recipient. Deviation: "Magic of Smiles" (first-hit Punchline +
  // Charm) is not modelled — the Charm just runs in the rotation.
  'Autonomous Wand': {
    abilities: [
      { id: 'wand_crackle', name: 'Crackle Shot', targetRule: 'single', effects: [{ op: 'attack', mult: 2.0, elem: 'Quantum' }] },
      { id: 'wand_charm', name: 'Happiness Charm', targetRule: 'self', effects: [{ op: 'oneOf', effects: [
        { op: 'buff', buff: { id: 'wand_atk', name: 'Happiness Charm (ATK up)', mods: [{ stat: 'atkPct', value: 0.5 }], turns: 2 } },
        { op: 'advance', to: 'allies', pct: 0.5 },
        { op: 'buff', to: 'alliesOther', buff: { id: 'reverberation', name: 'Strong Reverberation', mods: [], turns: 2, debuff: true } },
      ] }] },
    ],
    ai: new PatternAI(['wand_crackle', 'wand_charm']),
  },
  // "Crowned in Mortal Name" (support): Deception's Crown marker on ONE ally. Deviation: the
  // possession (heal-on-attacked, control-dispel, Toughness restore) is not modelled; the unit's
  // killing blow dispels the Crown from its holder.
  'Memory Zone Meme "Insatiable Vanity"': {
    abilities: [{ id: 'vanity_crown', name: 'Crowned in Mortal Name', targetRule: 'self', effects: [{ op: 'buff', to: 'allyRandom', buff: { id: 'deception_crown', name: "Deception's Crown", mods: [], turns: Infinity } }] }],
    ai: new PatternAI(['vanity_crown']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.allies(self.side)) {
          if (t.buffs.some(b => b.id === 'deception_crown')) sim.removeBuff(t, 'deception_crown')
        }
      },
    },
  },
  // The Lacrimal / Ethmoid "Bones" carry NO skills in the data → an authored default single Physical
  // attack so the catalog entry is playable (Toughness 120 tanky add).
  'Dried Lacrimal Bone': {
    abilities: [{ id: 'bone_strike', name: 'Bone Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Physical' }] }],
    ai: new PatternAI(['bone_strike']),
  },
  'Languid Ethmoid Bone': {
    abilities: [{ id: 'bone_strike2', name: 'Bone Strike', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Physical' }] }],
    ai: new PatternAI(['bone_strike2']),
  },
  // ---- Batch 19 — state/resource supports, sub-field ports, summon adds ------------------------
  // Lurking [Enhance] (self "Lurking" marker; cannot be primary target — not modelled → marker
  // deviation), Broken Rationality [Single] Physical 250%, Insidious Agitation [Single] Physical
  // 450% (only while Lurking → `require`, then dispels Lurking). "Flawed" [Talent] not modelled.
  'Black Tide Council': {
    abilities: [
      { id: 'btc_lurking', name: 'Lurking', targetRule: 'self', effects: [{ op: 'buff', buff: { id: 'btc_lurking', name: 'Lurking', mods: [], turns: Infinity } }] },
      { id: 'btc_broken', name: 'Broken Rationality', targetRule: 'single', effects: [{ op: 'attack', mult: 2.5, elem: 'Physical' }] },
      { id: 'btc_insidious', name: 'Insidious Agitation', targetRule: 'single', require: { buff: 'btc_lurking' }, effects: [
        { op: 'attack', mult: 4.5, elem: 'Physical' }, { op: 'dispelSelf', id: 'btc_lurking' },
      ] },
    ],
    ai: new PatternAI(['btc_lurking', 'btc_insidious', 'btc_broken']),
  },
  // Oppressive Embrace [Impair] (Restrain ≈ `control` Imprisonment + a 50% hit — %Target-Max-HP
  // authored as ATK 50%, deviation), Disabling Field [Single] 50% hit (Restrained-only gate not
  // modelled), Overload Warning [Charge] (self Overload marker; the Restrain-cleanse on friendlies
  // and "Controlled Blasting" are not modelled — the charge just telegraphs).
  'Auxiliary Robot Arm Unit': {
    abilities: [
      { id: 'arm_embrace', name: 'Oppressive Embrace', targetRule: 'single', effects: [{ op: 'control', kind: 'Imprisonment', turns: 2 }, { op: 'attack', mult: 0.5, elem: 'Physical' }] },
      { id: 'arm_field', name: 'Disabling Field', targetRule: 'single', effects: [{ op: 'attack', mult: 0.5, elem: 'Physical' }] },
      { id: 'arm_overload', name: 'Overload Warning', targetRule: 'self', cast: 1, effects: [{ op: 'buff', buff: { id: 'arm_overload', name: 'Overload', mods: [], turns: Infinity } }] },
    ],
    ai: new PatternAI(['arm_embrace', 'arm_field', 'arm_overload']),
  },
  // Diadem of the Stale [Defense] (self Shield 15% Max HP + a Barrier marker on one ally — the canon
  // Barrier target is the enemy "Argenti", approximated as a random ally). "Imitation of Alacritous
  // Desire" (killing-blow Barrier) and the Soulfreed branch are not modelled.
  '"The Shield"': {
    abilities: [{ id: 'shield_diadem', name: 'Diadem of the Stale', targetRule: 'self', effects: [
      { op: 'shield', frac: 0.15, to: 'self' },
      { op: 'buff', to: 'allyRandom', buff: { id: 'shield_barrier', name: 'Barrier', mods: [], turns: Infinity } },
    ] }],
    ai: new PatternAI(['shield_diadem']),
  },
  // Mutual Sacrifice: Demise's Storm [Blast] Physical 50%/25%, Mutual Sacrifice: Fading Fate [AoE]
  // Physical 50%. "Prayers For Me" (CC resist → `controlImmune`) modelled in onSpawn; the Corrosion /
  // Flame-Reaver summon interactions are not modelled.
  'Long-Shattered Vessel': {
    abilities: [
      { id: 'lsv_storm', name: "Mutual Sacrifice: Demise's Storm", targetRule: 'single', effects: [{ op: 'blast', mult: 0.5, adjMult: 0.25, elem: 'Physical' }] },
      { id: 'lsv_fate', name: 'Mutual Sacrifice: Fading Fate', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 0.5, elem: 'Physical' }] },
    ],
    ai: new PatternAI(['lsv_storm', 'lsv_fate']),
    passive: {
      onSpawn(sim, self) {
        const rt = enemyDefenseOf(self)
        rt.defense = { ...rt.defense, controlImmune: true }
      },
    },
  },
  // Crude / Mellow Fruits [Charge] — produce "Lavish Fruits" for the Abundant Ebon Deer. The Energy
  // transfer to the Deer and "Flamboyant Gore" are not modelled → the charge is a stackable marker.
  'Twig of Lavish Fruits': {
    abilities: [
      { id: 'lavish_crude', name: 'Crude Fruits', targetRule: 'self', cast: 1, effects: [{ op: 'buff', buff: { id: 'lavish_fruit', name: 'Lavish Fruits', mods: [], turns: Infinity, maxStacks: 99 } }] },
      { id: 'lavish_mellow', name: 'Mellow Fruits', targetRule: 'self', cast: 1, effects: [{ op: 'buff', buff: { id: 'lavish_fruit', name: 'Lavish Fruits', mods: [], turns: Infinity, maxStacks: 99 } }] },
    ],
    ai: new PatternAI(['lavish_crude', 'lavish_mellow']),
  },
  // Skill-less beholders → an authored default single Physical attack so the catalog entry is playable.
  'Shoot of Hundred Eyes': {
    abilities: [{ id: 'eyes_strike', name: 'Gaze', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Physical' }] }],
    ai: new PatternAI(['eyes_strike']),
  },
  'Twig of Hundred Eyes': {
    abilities: [{ id: 'eyes_strike2', name: 'Gaze', targetRule: 'single', effects: [{ op: 'attack', mult: 1.5, elem: 'Physical' }] }],
    ai: new PatternAI(['eyes_strike2']),
  },
  // Follower Growth [Enhance] — "Ally Gratuity" (All-Type RES PEN +5%/stack, max 4) to the unit's OWN
  // allies. The "Ally Popularity" / sub-field trigger is not modelled (grants on cast).
  'Output Port 1': {
    abilities: [{ id: 'port1_growth', name: 'Follower Growth', targetRule: 'self', effects: [{ op: 'buff', to: 'allies', buff: { id: 'ally_gratuity', name: 'Ally Gratuity (RES PEN up)', mods: [{ stat: 'resPenAll', value: 0.05 }], turns: Infinity, maxStacks: 4 } }] }],
    ai: new PatternAI(['port1_growth']),
  },
  // Bleeding Followers [Impair] — removes "Enemy Gratuity" (DMG +10%/stack) from the player team; the
  // removal is modelled as a −10% DMG-dealt debuff on one resolved target (sub-field gratuity itself
  // is not modelled).
  'Output Port 2': {
    abilities: [{ id: 'port2_bleed', name: 'Bleeding Followers', targetRule: 'single', effects: [{ op: 'buff', to: 'targets', buff: { id: 'enemy_gratuity', name: 'Enemy Gratuity (DMG down)', mods: [{ stat: 'dmgAll', value: -0.10 }], turns: Infinity, maxStacks: 4, debuff: true } }] }],
    ai: new PatternAI(['port2_bleed']),
  },
  // ---- Batch 20 — Talent-only / special-state residuals (final ordinary mobs) -------------------
  // "Fickle Fortune" [Talent]: Immune to DMG (self `mitigation` 1.0). Deviation: the Gamble / random
  // 1–6 number and "Bet" (Points on defeat) interactions are not modelled.
  '"All or Nothing"': {
    abilities: [{ id: 'aon_fickle', name: 'Fickle Fortune', targetRule: 'self', effects: [{ op: 'buff', buff: { id: 'aon_immune', name: 'Fickle Fortune (immune to DMG)', mods: [{ stat: 'mitigation', value: 1.0 }], turns: Infinity } }] }],
    ai: new PatternAI(['aon_fickle']),
  },
  // "Temporary Good Fortune" [Others]: on taking action this unit leaves the battle → `fleeCountdown(1)`
  // (no attack). Deviation: "Double Bet" (Points double on defeat) is not modelled.
  '"All or Nothing: Double Fortune"': {
    abilities: [trotterPanic('aon_df_wait', 'Temporary Good Fortune')],
    ai: new PatternAI(['aon_df_wait']),
    passive: fleeCountdown(1),
  },
  // "Brainteaser-Repeating Pun" [Others]: the brainteaser state is a marker (the ATK-type response is
  // not modelled). Takes 90% less DMG from characters (self `mitigation` 0.90). "Looping Explanation":
  // leaving the battle grants all targets +20% DMG. Deviation: the delay-on-solve and 35%-Max-HP
  // self-damage on a correct response are not modelled.
  '"Spirithief" Bartholos': {
    abilities: [trotterPanic('barth_pun', 'Brainteaser-Repeating Pun')],
    ai: new PatternAI(['barth_pun']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'barth_ward', name: 'Reduced DMG (90%)', mods: [{ stat: 'mitigation', value: 0.90 }], turns: Infinity, sourceId: self.id })
      },
      onKilled(sim, self) {
        for (const a of sim.allies('ally')) sim.addBuff(a, { id: 'barth_dmgup', name: 'DMG Boost', mods: [{ stat: 'dmgAll', value: 0.20 }], turns: Infinity, sourceId: self.id })
      },
    },
  },
  // "Tyrant of the Vanquished" [Talent]: cannot take action → a no-op turn. "Bearing All Wounds":
  // DMG taken greatly increased (self `vulnAll` +100%) when attacked by a "Conquered"-state target.
  // Deviation: the conditional gate and the killing-blow HP drain of "The Giver..." are not modelled.
  'Conquer or Be Conquered': {
    abilities: [trotterPanic('cobc_idle', 'Tyrant of the Vanquished')],
    ai: new PatternAI(['cobc_idle']),
    passive: {
      onSpawn(sim, self) {
        sim.addBuff(self, { id: 'cobc_vuln', name: 'DMG taken +100%', mods: [{ stat: 'vulnAll', value: 1.0 }], turns: Infinity, sourceId: self.id })
      },
    },
  },
  // Imaginary 300% + 25% delay; a charge telegraph; "Immortal" [Talent]: on a killing blow it enters
  // "Grave Wound" instead of dying (revives full HP) and advances all targets 20% (dispel Action Lock).
  // Deviation: the "Anti-Creator" charge resolution and the Action-Lock interaction are not modelled.
  'Imprisoned Mythos': {
    abilities: [
      { id: 'mythos_induce', name: 'Induce Frenzy', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }, { op: 'delay', pct: 0.25 }] },
      { id: 'mythos_curse', name: 'Blasphemous Curse', targetRule: 'self', cast: 1, effects: [{ op: 'buff', buff: { id: 'mythos_relief', name: 'Deliverance of Relief', mods: [], turns: Infinity } }] },
      { id: 'mythos_echoes', name: 'Echoes of Tragedy', targetRule: 'single', effects: [{ op: 'attack', mult: 3.0, elem: 'Imaginary' }, { op: 'delay', pct: 0.25 }] },
    ],
    ai: new PatternAI(['mythos_induce', 'mythos_curse', 'mythos_echoes']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.livingEnemiesOf(self)) sim.advance(t, 0.2)
        sim.revive(self, self.maxHp, self)
        sim.log(`${self.name} enters Grave Wound — advances all targets 20% and revives`)
      },
    },
  },
  // Blast Quantum 250%/200%, AoE 400% + SP −1, a charge telegraph; "Immortal" [Talent]: on a killing
  // blow (Grave Wound) all targets regenerate 15% Max Energy and the unit revives full HP.
  // Deviation: the Action-Lock dispel and "Rebellious" charge resolution are not modelled.
  'Manipulated Logos': {
    abilities: [
      { id: 'logos_hail', name: 'Hail Chaos', targetRule: 'single', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.0, elem: 'Quantum' }] },
      { id: 'logos_defiance', name: "A Fool's Defiance", targetRule: 'self', cast: 1, effects: [{ op: 'buff', buff: { id: 'logos_rebellious', name: 'Rebellious', mods: [], turns: Infinity } }] },
      { id: 'logos_eradicate', name: 'Eradication of Falsehood', targetRule: 'single', effects: [{ op: 'blast', mult: 2.5, adjMult: 2.0, elem: 'Quantum' }] },
      { id: 'logos_break', name: 'Break the Old, Build the New', targetRule: 'aoe', effects: [{ op: 'aoe', mult: 4.0, elem: 'Quantum' }, { op: 'sp', delta: -1 }] },
    ],
    ai: new PatternAI(['logos_hail', 'logos_defiance', 'logos_eradicate', 'logos_break']),
    passive: {
      onKilled(sim, self) {
        for (const t of sim.livingEnemiesOf(self)) sim.gainEnergyFlat(t, t.maxEnergy * 0.15)
        sim.revive(self, self.maxHp, self)
      },
    },
  },
  // "Mirror Cognition" [Others]: transforms into another friendly unit and copies its abilities → a
  // self-transform marker. Deviation: the copy (abilities + Base Stats) is not modelled.
  'Memory Zone Meme "Something In The Mirror"': {
    abilities: [{ id: 'mirror_cognition', name: 'Mirror Cognition', targetRule: 'self', effects: [{ op: 'buff', buff: { id: 'mirror_form', name: 'Mirror Cognition (transform)', mods: [], turns: Infinity } }] }],
    ai: new PatternAI(['mirror_cognition']),
  },
  // "Slumber Awakening" / "Eternal Continuation" [Talents]: a fixed 5-HP-bar entity that cannot act.
  // Deviation: the multi-bar lifecycle and the Morbid-Dream heal/Energy restoration are not modelled
  // (modelled as a no-op turn).
  'Sombrous Sepulcher': {
    abilities: [trotterPanic('sepulcher_wait', 'Slumber Awakening')],
    ai: new PatternAI(['sepulcher_wait']),
  },
  // "Victor Upon Billions of Bones" [Talent]: cannot take action, spawned with War Armor (shared
  // `warArmor`). Deviation: the Glory-stack depletion, shatter Imaginary DMG, and "A Home After
  // Countless Scars" (killing-blow branch) are not modelled.
  'The Conquered': {
    abilities: [trotterPanic('conquered_wait', 'Victor Upon Billions of Bones')],
    ai: new PatternAI(['conquered_wait']),
    passive: warArmor(),
  },
}

/** §57 "Channel Crossover": flip the broadcast channel on any incoming hit */
function flipChannel(sim: SimApi, self: Unit): void {
  const has = (id: string): boolean => self.buffs.some(b => b.id === id)
  if (has(CH_SURPRISE)) {
    sim.removeBuff(self, CH_SURPRISE)
    sim.addBuff(self, { id: CH_FRIGHT, name: 'Fright Channel', mods: [], turns: Infinity, sourceId: self.id })
    sim.log(`${self.name}'s Channel Crossover - switches to the Fright Channel`)
  } else if (has(CH_FRIGHT)) {
    sim.removeBuff(self, CH_FRIGHT)
    sim.addBuff(self, { id: CH_SURPRISE, name: 'Surprise Channel', mods: [], turns: Infinity, sourceId: self.id })
    sim.log(`${self.name}'s Channel Crossover - switches to the Surprise Channel`)
  }
}
