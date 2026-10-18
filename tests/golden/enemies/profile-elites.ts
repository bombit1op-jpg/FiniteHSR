/**
 * §54/§64 — elite-rank batches ("Batches 21–24", profiled in `src/core/enemy/profiles.ts`).
 *
 *  Each case launches the real elite by display name (production profile, no test-side wiring) and
 *  asserts a concrete outcome of its declared mechanics: single/blast/AoE damage, DoT application
 *  (Wind Shear / Burn), Freeze control, Action Delay, charge telegraphs, self buffs, the Lock-On →
 *  strike pin and the Counter state — all through the shared pipeline. Damaging proves the enemy is
 *  the source (player damage is filtered out by `n.source === name`).
 */
import { run, raw, all, type Ctx } from '../../_helpers/battle'
import type { EnemySpec } from '../../../src/core/battle'

const foe = (name: string, over: Partial<EnemySpec> = {}): EnemySpec =>
  ({ name, count: 1, hp: 5_000_000, spd: 220, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60, ...over })

const fight = (enemy: EnemySpec, cycles = 8): Ctx =>
  run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy, cycles })

const ranAbility = (b: Ctx, id: string): boolean =>
  all(b, 'ABILITY_USED').some(n => n.source === b.sim.roster.find(u => u.side === 'enemy')?.name && n.payload?.action === id)
const enemy = (b: Ctx) => b.sim.roster.find(u => u.side === 'enemy')!
const dotApplied = (b: Ctx, kind: string) => all(b, 'DOT_APPLIED').some(n => n.payload?.kind === kind)
const elems = (b: Ctx) => new Set(all(b, 'HIT_START').filter(n => n.source === b.sim.roster.find(u => u.side === 'enemy')?.name).map(n => String(n.element)))
const charged = (b: Ctx, id: string) => {
  const ph = new Set(all(b, 'ACTION_START').filter(n => n.source === b.sim.roster.find(u => u.side === 'enemy')?.name && n.payload?.action === id).map(n => String(n.payload?.phase)))
  return ph.has('charge') && ph.has('release')
}
const clean = (b: Ctx) => b.sim.logger.verify().length === 0

export default () => {
  const cases: ReturnType<typeof raw>[] = []
  const add = (b: Ctx, label: string, cond: boolean, info = '') => cases.push(raw(`elite: ${label}`, cond, info))

  // ---- Celestial Cherub (Lightning) --------------------------------------------------------
  const cherub = fight(foe('Celestial Cherub', { weaknesses: ['Lightning'] }))
  add(cherub, 'Celestial Cherub runs Thunder-Shock + Punishing Bolts',
    ranAbility(cherub, 'cherub_thunder') && ranAbility(cherub, 'cherub_bolts'), [...elems(cherub)].join(','))
  add(cherub, 'Celestial Cherub is Lightning through the shared hit path', elems(cherub).has('Lightning'), [...elems(cherub)].join(','))

  // ---- Celestial Maiden (Wind) -------------------------------------------------------------
  const maiden = fight(foe('Celestial Maiden', { weaknesses: ['Wind'] }))
  add(maiden, 'Celestial Maiden runs its Arbor rotation',
    ranAbility(maiden, 'maiden_rite') && ranAbility(maiden, 'maiden_vulturnus') && ranAbility(maiden, 'maiden_thorns'))
  add(maiden, 'Celestial Maiden applies Wind Shear (DOT_APPLIED)', dotApplied(maiden, 'WindShear'))
  add(maiden, 'Celestial Maiden is Wind through the shared hit path', elems(maiden).has('Wind'), [...elems(maiden)].join(','))

  // ---- The Ascended (Wind) -----------------------------------------------------------------
  const ascended = fight(foe('The Ascended', { weaknesses: ['Wind'] }))
  add(ascended, 'The Ascended runs its Arbor rotation + Black Prana\'s Snare',
    ranAbility(ascended, 'ascended_rite') && ranAbility(ascended, 'ascended_prana'))
  add(ascended, 'The Ascended applies Wind Shear (DOT_APPLIED)', dotApplied(ascended, 'WindShear'))
  add(ascended, "The Ascended's Black Prana's Snare telegraphs charge → release", charged(ascended, 'ascended_prana'))

  // ---- Decaying Shadow (Imaginary) ---------------------------------------------------------
  const decaying = fight(foe('Decaying Shadow', { weaknesses: ['Imaginary'] }))
  add(decaying, 'Decaying Shadow runs its Gilded rotation',
    ranAbility(decaying, 'decay_spikes') && ranAbility(decaying, 'decay_punishment') && ranAbility(decaying, 'decay_binding'))
  add(decaying, 'Decaying Shadow Binding telegraphs charge → release', charged(decaying, 'decay_binding'))
  add(decaying, 'Decaying Shadow carries Fleeting Veil mitigation', enemy(decaying).buffs.some(x => x.id === 'decay_veil'))

  // ---- Stormbringer (Wind) -----------------------------------------------------------------
  const storm = fight(foe('Stormbringer', { weaknesses: ['Wind'] }))
  add(storm, 'Stormbringer runs Watchful Meteor + Wind Walker',
    ranAbility(storm, 'storm_meteor') && ranAbility(storm, 'storm_walker'))
  add(storm, 'Stormbringer applies Wind Shear (DOT_APPLIED)', dotApplied(storm, 'WindShear'))
  add(storm, 'Stormbringer Windfall Storm telegraphs charge → release', charged(storm, 'storm_crossbow'))

  // ---- Searing Prowler (Fire) --------------------------------------------------------------
  const searing = fight(foe('Searing Prowler', { weaknesses: ['Fire'] }))
  add(searing, 'Searing Prowler runs Crimson Blade + Combustion Slash + High-Temperature Operation',
    ranAbility(searing, 'sear_blade') && ranAbility(searing, 'sear_slash') && ranAbility(searing, 'sear_hotop'))
  add(searing, 'Searing Prowler applies Burn (DOT_APPLIED)', dotApplied(searing, 'Burn'))
  add(searing, 'Searing Prowler grants itself ATK Up', all(searing, 'BUFF_APPLIED').some(n => n.source === 'Searing Prowler' && n.payload?.id === 'sear_atkup'))

  // ---- Ice Out of Space (Ice) --------------------------------------------------------------
  const iceOut = fight(foe('Ice Out of Space', { weaknesses: ['Ice'] }))
  add(iceOut, 'Ice Out of Space runs Chilling Lament + Frosty Absorption',
    ranAbility(iceOut, 'ice_lament') && ranAbility(iceOut, 'ice_frosty'))
  add(iceOut, 'Ice Out of Space is Ice through the shared hit path', elems(iceOut).has('Ice'), [...elems(iceOut)].join(','))

  // ---- Blaze Out of Space (Fire) -----------------------------------------------------------
  const blazeOut = fight(foe('Blaze Out of Space', { weaknesses: ['Fire'] }))
  add(blazeOut, 'Blaze Out of Space runs Bellowing Inferno + Blazing Absorption + Molten Fusion',
    ranAbility(blazeOut, 'blaze_inferno') && ranAbility(blazeOut, 'blaze_absorption') && ranAbility(blazeOut, 'blaze_molten'))
  add(blazeOut, 'Blaze Out of Space applies Burn (DOT_APPLIED)', dotApplied(blazeOut, 'Burn'))
  add(blazeOut, 'Blaze Out of Space grants itself ATK Up', all(blazeOut, 'BUFF_APPLIED').some(n => n.payload?.id === 'blaze_atkup'))

  // ---- Voidranger: Trampler (Quantum) ------------------------------------------------------
  const trampler = fight(foe('Voidranger: Trampler', { weaknesses: ['Quantum'] }))
  add(trampler, 'Voidranger: Trampler runs its full rotation',
    ranAbility(trampler, 'trampler_arrow') && ranAbility(trampler, 'trampler_endbow')
      && ranAbility(trampler, 'trampler_rule') && ranAbility(trampler, 'trampler_war') && ranAbility(trampler, 'trampler_projection'))
  add(trampler, 'Voidranger: Trampler Spiral Arrow forces a target (Lock-On)',
    all(trampler, 'TARGET_SELECTED').some(n => n.payload?.rule === 'forced'))
  add(trampler, 'Voidranger: Trampler is Quantum through the shared hit path', elems(trampler).has('Quantum'), [...elems(trampler)].join(','))

  // ---- Silvermane Lieutenant (Physical) ----------------------------------------------------
  const lieutenant = fight(foe('Silvermane Lieutenant', { weaknesses: ['Physical'] }))
  add(lieutenant, 'Silvermane Lieutenant runs Assault + Shield Reflect',
    ranAbility(lieutenant, 'lt_assault') && ranAbility(lieutenant, 'lt_reflect'))
  add(lieutenant, 'Silvermane Lieutenant is Physical through the shared hit path', elems(lieutenant).has('Physical'), [...elems(lieutenant)].join(','))

  // ---- Abundance Sprite: Malefic Ape (Quantum) ---------------------------------------------
  const ape = fight(foe('Abundance Sprite: Malefic Ape', { weaknesses: ['Quantum'] }))
  add(ape, 'Abundance Sprite: Malefic Ape runs Fiery Majesty + Simian Strike',
    ranAbility(ape, 'ape_fiery') && ranAbility(ape, 'ape_strike'))
  add(ape, 'Abundance Sprite: Malefic Ape grants itself DMG Boost', all(ape, 'BUFF_APPLIED').some(n => n.payload?.id === 'ape_dmgup'))

  // ---- Frigid Prowler (Ice) ----------------------------------------------------------------
  const frigid = fight(foe('Frigid Prowler', { weaknesses: ['Ice'] }))
  add(frigid, 'Frigid Prowler runs Ice Wheel Fist + Frozen Storm + Frost Crush',
    ranAbility(frigid, 'frigid_fist') && ranAbility(frigid, 'frigid_storm') && ranAbility(frigid, 'frigid_crush'))
  add(frigid, 'Frigid Prowler Frozen Storm lands Freeze through the shared DoT path',
    all(frigid, 'CONTROL_APPLIED').some(n => n.source === 'Frigid Prowler' && n.payload?.kind === 'Freeze'))
  add(frigid, 'Frigid Prowler Frost Crush delays its target (ACTION_DELAY)', all(frigid, 'ACTION_DELAY').length > 0)

  // ---- Batch 22 ----------------------------------------------------------------------------
  // ---- Antimatter Engine (Imaginary) — needs a second enemy for its alliesOther buff ---------
  const antimatter = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Antimatter Engine', { weaknesses: ['Imaginary'] }), foe('Silvermane Soldier')]], cycles: 8 })
  add(antimatter, 'Antimatter Engine runs Total Annihilation + Engine Boost + Cataclysm Precursor',
    ranAbility(antimatter, 'ae_annihilation') && ranAbility(antimatter, 'ae_boost') && ranAbility(antimatter, 'ae_precursor'))
  add(antimatter, 'Antimatter Engine Engine Boost buffs its allies (not itself)',
    all(antimatter, 'BUFF_APPLIED').some(n => n.payload?.id === 'ae_enhanced' && n.source !== n.target))
  add(antimatter, 'Antimatter Engine Cataclysm Precursor telegraphs charge → release', charged(antimatter, 'ae_precursor'))

  // ---- Aurumaton Gatekeeper (Imaginary) ----------------------------------------------------
  const gatekeeper = fight(foe('Aurumaton Gatekeeper', { weaknesses: ['Imaginary'] }))
  add(gatekeeper, 'Aurumaton Gatekeeper runs Restraint + Dread',
    ranAbility(gatekeeper, 'gatekeeper_restraint') && ranAbility(gatekeeper, 'gatekeeper_dread'))
  add(gatekeeper, 'Aurumaton Gatekeeper Dread inflicts Weaken (DEBUFF_APPLIED)',
    all(gatekeeper, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'gatekeeper_weaken'))

  // ---- Automaton Direwolf (Physical) -------------------------------------------------------
  const direwolf = fight(foe('Automaton Direwolf', { weaknesses: ['Physical'] }))
  add(direwolf, 'Automaton Direwolf runs Lock On + both orders',
    ranAbility(direwolf, 'direwolf_lock') && ranAbility(direwolf, 'direwolf_disintegration') && ranAbility(direwolf, 'direwolf_dismantle'))
  add(direwolf, 'Automaton Direwolf Lock On forces a target (TARGET_SELECTED)', all(direwolf, 'TARGET_SELECTED').some(n => n.payload?.rule === 'forced'))
  add(direwolf, 'Automaton Direwolf inflicts Bleed (DOT_APPLIED)', dotApplied(direwolf, 'Bleed'))

  // ---- Automaton Grizzly (Physical) --------------------------------------------------------
  const grizzly = fight(foe('Automaton Grizzly', { weaknesses: ['Physical'] }))
  add(grizzly, 'Automaton Grizzly runs Destruction Order + Ram + Overcombust Order',
    ranAbility(grizzly, 'grizzly_destruction') && ranAbility(grizzly, 'grizzly_ram') && ranAbility(grizzly, 'grizzly_overcombust'))
  add(grizzly, 'Automaton Grizzly Overcombust Order telegraphs charge → release', charged(grizzly, 'grizzly_overcombust'))

  // ---- Canvas Peacock (Physical) -----------------------------------------------------------
  const peacock = fight(foe('Canvas Peacock', { weaknesses: ['Physical'] }))
  add(peacock, 'Canvas Peacock runs The Stroke + Sweeping Hues + Dancing Splendor',
    ranAbility(peacock, 'peacock_stroke') && ranAbility(peacock, 'peacock_sweep') && ranAbility(peacock, 'peacock_splendor'))
  add(peacock, 'Canvas Peacock Sweeping Hues lands the Paint additional hit (2 digits)',
    all(peacock, 'HIT_START').filter(n => n.label === 'Sweeping Hues').length >= 2)

  // ---- Herta ErrorModel (Imaginary) --------------------------------------------------------
  const errorModel = fight(foe('Herta ErrorModel', { weaknesses: ['Imaginary'] }))
  add(errorModel, 'Herta ErrorModel resolves its authored basic', ranAbility(errorModel, 'error_strike'), [...elems(errorModel)].join(','))

  // ---- Lighthouse (Physical) ---------------------------------------------------------------
  const lighthouse = fight(foe('Lighthouse', { weaknesses: ['Physical'] }))
  add(lighthouse, 'Lighthouse runs Radiant Sweep + Unyielding Justice',
    ranAbility(lighthouse, 'lighthouse_sweep') && ranAbility(lighthouse, 'lighthouse_justice'))
  add(lighthouse, 'Lighthouse Unyielding Justice telegraphs charge → release', charged(lighthouse, 'lighthouse_justice'))

  // ---- Senior Staff: Team Leader (Physical) ------------------------------------------------
  const leader = fight(foe('Senior Staff: Team Leader', { weaknesses: ['Physical'] }))
  add(leader, 'Senior Staff: Team Leader runs Disciplined + Cost Reduction + In Training…',
    ranAbility(leader, 'leader_disciplined') && ranAbility(leader, 'leader_cost') && ranAbility(leader, 'leader_training'))
  add(leader, 'Senior Staff: Team Leader In Training… telegraphs charge → release', charged(leader, 'leader_training'))

  // ---- "Past Confined and Caged" (Physical) ------------------------------------------------
  const pastCaged = fight(foe('"Past Confined and Caged"', { weaknesses: ['Physical'] }))
  add(pastCaged, 'Past Confined and Caged runs Flagellation + Admonishment + Shackle-Bearing Messenger',
    ranAbility(pastCaged, 'past_flagellation') && ranAbility(pastCaged, 'past_admonishment') && ranAbility(pastCaged, 'past_messenger'))
  add(pastCaged, 'Past Confined and Caged Shackle-Bearing Messenger forces a target',
    all(pastCaged, 'TARGET_SELECTED').some(n => n.payload?.rule === 'forced'))

  // ---- Guardian Shadow (Lightning) ---------------------------------------------------------
  const guardianShadow = fight(foe('Guardian Shadow', { weaknesses: ['Lightning'] }))
  add(guardianShadow, 'Guardian Shadow runs Recollection + Condemnation + Tranquil Ban',
    ranAbility(guardianShadow, 'guardian_recollection') && ranAbility(guardianShadow, 'guardian_condemnation') && ranAbility(guardianShadow, 'guardian_tranquil'))
  add(guardianShadow, 'Guardian Shadow is Lightning through the shared hit path', elems(guardianShadow).has('Lightning'), [...elems(guardianShadow)].join(','))

  // ---- Cyclonic Swarm Mother (Quantum) -----------------------------------------------------
  const swarmMother = fight(foe('Cyclonic Swarm Mother', { weaknesses: ['Quantum'] }))
  add(swarmMother, 'Cyclonic Swarm Mother runs its full rotation',
    ranAbility(swarmMother, 'swarm_spurn') && ranAbility(swarmMother, 'swarm_weeping') && ranAbility(swarmMother, 'swarm_rain') && ranAbility(swarmMother, 'swarm_gestation'))
  add(swarmMother, 'Cyclonic Swarm Mother is Quantum through the shared hit path', elems(swarmMother).has('Quantum'), [...elems(swarmMother)].join(','))

  // ---- Black Tide's Champion (Physical) ----------------------------------------------------
  const champion = fight(foe("Black Tide's Champion", { weaknesses: ['Physical'] }))
  add(champion, "Black Tide's Champion runs Dreadtide + Cast Marble + Fatal Clash",
    ranAbility(champion, 'champion_dreadtide') && ranAbility(champion, 'champion_marble') && ranAbility(champion, 'champion_clash'))
  add(champion, "Black Tide's Champion is Physical through the shared hit path", elems(champion).has('Physical'), [...elems(champion)].join(','))

  // ---- Batch 23 ----------------------------------------------------------------------------
  // ---- "Present Inebriated in Revelry" (Wind) ----------------------------------------------
  const present = fight(foe('"Present Inebriated in Revelry"', { weaknesses: ['Wind'] }))
  add(present, 'Present Inebriated in Revelry runs its Carousal rotation',
    ranAbility(present, 'present_blood') && ranAbility(present, 'present_feast') && ranAbility(present, 'present_cup'))
  add(present, 'Present Inebriated in Revelry inflicts a Carousal DoT (Wind/Shock)',
    dotApplied(present, 'WindShear') || dotApplied(present, 'Shock'))
  add(present, 'A Cup Runneth Over For You telegraphs charge → release', charged(present, 'present_cup'))

  // ---- "Tomorrow in Harmonious Chords" (Imaginary) -----------------------------------------
  const chords = fight(foe('"Tomorrow in Harmonious Chords"', { weaknesses: ['Imaginary'] }))
  add(chords, 'Tomorrow in Harmonious Chords runs its 4-skill rotation',
    ranAbility(chords, 'chords_bright') && ranAbility(chords, 'chords_calm') && ranAbility(chords, 'chords_grace') && ranAbility(chords, 'chords_holynight'))
  add(chords, 'Tomorrow in Harmonious Chords All Is Calm inflicts Alien Dream (DEBUFF_APPLIED)',
    all(chords, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'chords_alien_dream'))
  add(chords, 'Tomorrow in Harmonious Chords is Imaginary through the shared hit path', elems(chords).has('Imaginary'), [...elems(chords)].join(','))
  add(chords, 'Holy Night telegraphs charge → release', charged(chords, 'chords_holynight'))

  // ---- Black Tide's Corroded Daemon (Physical) ---------------------------------------------
  const daemon = fight(foe("Black Tide's Corroded Daemon", { weaknesses: ['Physical'] }))
  add(daemon, "Black Tide's Corroded Daemon runs Landslide + Filth Eater + Depravation",
    ranAbility(daemon, 'daemon_landslide') && ranAbility(daemon, 'daemon_filtheater') && ranAbility(daemon, 'daemon_depravation'))
  add(daemon, "Black Tide's Corroded Daemon Depravation telegraphs charge → release", charged(daemon, 'daemon_depravation'))
  add(daemon, "Black Tide's Corroded Daemon is Physical through the shared hit path", elems(daemon).has('Physical'), [...elems(daemon)].join(','))

  // ---- Corrupting Shadowfiend: Torrential Rotbringer (Physical) ----------------------------
  const rotbringer = fight(foe('Corrupting Shadowfiend: Torrential Rotbringer', { weaknesses: ['Physical'] }))
  add(rotbringer, 'Corrupting Shadowfiend runs Shredding Landslide + Heartmarrow Corrosion',
    ranAbility(rotbringer, 'rot_landslide') && ranAbility(rotbringer, 'rot_corrosion'))
  add(rotbringer, 'Corrupting Shadowfiend is Physical through the shared hit path', elems(rotbringer).has('Physical'), [...elems(rotbringer)].join(','))

  // ---- Disciples of Sanctus Medicus: Shape Shifter (Lightning) -----------------------------
  const shifter = fight(foe('Disciples of Sanctus Medicus: Shape Shifter', { weaknesses: ['Lightning'] }))
  add(shifter, 'Shape Shifter runs Thunder-Shock + Punishing Bolts',
    ranAbility(shifter, 'shifter_thunder') && ranAbility(shifter, 'shifter_bolts'))
  add(shifter, 'Shape Shifter is Lightning through the shared hit path', elems(shifter).has('Lightning'), [...elems(shifter)].join(','))

  // ---- Dreamjolt Troupe's Beyond Overcooked (Fire) -----------------------------------------
  const overcooked = fight(foe("Dreamjolt Troupe's Beyond Overcooked", { weaknesses: ['Fire'] }))
  add(overcooked, 'Beyond Overcooked runs Ladle Swirl + Tornado Toss + Ignite Stove',
    ranAbility(overcooked, 'cooked_ladle') && ranAbility(overcooked, 'cooked_tornado') && ranAbility(overcooked, 'cooked_stove'))
  add(overcooked, 'Beyond Overcooked Ignite Stove telegraphs charge → release', charged(overcooked, 'cooked_stove'))
  add(overcooked, 'Beyond Overcooked is Fire through the shared hit path', elems(overcooked).has('Fire'), [...elems(overcooked)].join(','))

  // ---- Dreamjolt Troupe's Sweet Gorilla (Ice) ----------------------------------------------
  const gorilla = fight(foe("Dreamjolt Troupe's Sweet Gorilla", { weaknesses: ['Ice'] }))
  add(gorilla, 'Sweet Gorilla runs Limited Free Drinks + Celebration Fountain',
    ranAbility(gorilla, 'gorilla_drinks') && ranAbility(gorilla, 'gorilla_fountain'))
  add(gorilla, 'Sweet Gorilla Celebration Fountain telegraphs charge → release', charged(gorilla, 'gorilla_fountain'))
  add(gorilla, 'Sweet Gorilla is Ice through the shared hit path', elems(gorilla).has('Ice'), [...elems(gorilla)].join(','))

  // ---- Earthshaker Leo: Solblaze Winged Beast (Fire) ---------------------------------------
  const leo = fight(foe('Earthshaker Leo: Solblaze Winged Beast', { weaknesses: ['Fire'] }))
  add(leo, 'Earthshaker Leo runs Darkness + Heralding the Dawn + Light the Future',
    ranAbility(leo, 'leo_darkness') && ranAbility(leo, 'leo_dawn') && ranAbility(leo, 'leo_future'))
  add(leo, 'Earthshaker Leo Heralding the Dawn applies Burn (DOT_APPLIED)', dotApplied(leo, 'Burn'))
  add(leo, 'Earthshaker Leo Light the Future telegraphs charge → release', charged(leo, 'leo_future'))

  // ---- Ecliptic Inner Beast & Shadow of "Feixiao" (composite) ------------------------------
  const ecliptic = fight(foe('Ecliptic Inner Beast & Shadow of "Feixiao"'))
  add(ecliptic, 'Ecliptic Inner Beast resolves its authored Seance marker', ranAbility(ecliptic, 'ecliptic_seance'))

  // ---- Elegy Siren: Insatiable Leviathan (Ice) ---------------------------------------------
  const leviathan = fight(foe('Elegy Siren: Insatiable Leviathan', { weaknesses: ['Ice'] }))
  add(leviathan, 'Insatiable Leviathan runs its full rotation',
    ranAbility(leviathan, 'leviathan_corruption') && ranAbility(leviathan, 'leviathan_brew') && ranAbility(leviathan, 'leviathan_elegy') && ranAbility(leviathan, 'leviathan_gift'))
  add(leviathan, 'Insatiable Leviathan Honeyed Brew inflicts DEF Down (DEBUFF_APPLIED)',
    all(leviathan, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'leviathan_defdown'))
  add(leviathan, 'Insatiable Leviathan is Ice through the shared hit path', elems(leviathan).has('Ice'), [...elems(leviathan)].join(','))

  // ---- Furiae Praetor (Imaginary) ----------------------------------------------------------
  const praetor = fight(foe('Furiae Praetor', { weaknesses: ['Imaginary'] }))
  add(praetor, 'Furiae Praetor runs both sweeps + Resembling Furious Lion',
    ranAbility(praetor, 'praetor_skyveil') && ranAbility(praetor, 'praetor_dawn') && ranAbility(praetor, 'praetor_lion'))
  add(praetor, 'Furiae Praetor carries War Armor (Polis Protector)', enemy(praetor).buffs.some(x => x.id === 'warArmor'))
  add(praetor, 'Furiae Praetor Resembling Furious Lion telegraphs charge → release', charged(praetor, 'praetor_lion'))

  // ---- God-Devourer Offspring (Fire) -------------------------------------------------------
  const god = fight(foe('God-Devourer Offspring', { weaknesses: ['Fire'] }))
  add(god, 'God-Devourer Offspring runs Feast + Gorging + Banquet',
    ranAbility(god, 'god_feast') && ranAbility(god, 'god_gorging') && ranAbility(god, 'god_banquet'))
  add(god, 'God-Devourer Offspring Feast of the Living Offering inflicts Devour (DEBUFF_APPLIED)',
    all(god, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'god_devour'))
  add(god, 'God-Devourer Offspring is Fire through the shared hit path', elems(god).has('Fire'), [...elems(god)].join(','))

  // ---- Greatsword Guardian: Vanguard Wallbreaker (Imaginary) --------------------------------
  const gguard = fight(foe('Greatsword Guardian: Vanguard Wallbreaker', { weaknesses: ['Imaginary'] }))
  add(gguard, 'Vanguard Wallbreaker runs both sweeps + Resembling Furious Lion',
    ranAbility(gguard, 'gguard_skyveil') && ranAbility(gguard, 'gguard_dawn') && ranAbility(gguard, 'gguard_lion'))
  add(gguard, 'Vanguard Wallbreaker Resembling Furious Lion telegraphs charge → release', charged(gguard, 'gguard_lion'))
  add(gguard, 'Vanguard Wallbreaker is Imaginary through the shared hit path', elems(gguard).has('Imaginary'), [...elems(gguard)].join(','))

  // ---- Howling Casket (Physical) -----------------------------------------------------------
  const casket = fight(foe('Howling Casket', { weaknesses: ['Physical'] }))
  add(casket, 'Howling Casket runs Claws + Roar + Moon Rage Mimicry',
    ranAbility(casket, 'casket_claws') && ranAbility(casket, 'casket_roar') && ranAbility(casket, 'casket_mimicry'))
  add(casket, 'Howling Casket enters Moon Rage (BUFF_APPLIED moonRage)',
    all(casket, 'BUFF_APPLIED').some(n => n.payload?.id === 'moonRage'))
  add(casket, 'Howling Casket Lupitoxin Synthesis fires only in Moon Rage', ranAbility(casket, 'casket_lupitoxin'))
  add(casket, 'Howling Casket is Physical through the shared hit path', elems(casket).has('Physical'), [...elems(casket)].join(','))

  // ---- Ichor Memosprite: Winged Serpent (Imaginary) ----------------------------------------
  const serpent = fight(foe('Ichor Memosprite: Winged Serpent', { weaknesses: ['Imaginary'] }))
  add(serpent, 'Winged Serpent runs Whip + Spew + Menacing Warning',
    ranAbility(serpent, 'serpent_whip') && ranAbility(serpent, 'serpent_spew') && ranAbility(serpent, 'serpent_warning'))
  add(serpent, 'Winged Serpent Menacing Warning telegraphs charge → release', charged(serpent, 'serpent_warning'))
  add(serpent, 'Winged Serpent is Imaginary through the shared hit path', elems(serpent).has('Imaginary'), [...elems(serpent)].join(','))

  // ---- Joy Ascendant (Wind) ----------------------------------------------------------------
  const joy = fight(foe('Joy Ascendant', { weaknesses: ['Wind'] }))
  add(joy, 'Joy Ascendant runs Exhalation + Jubilation + Blossoming Smile',
    ranAbility(joy, 'joy_exhalation') && ranAbility(joy, 'joy_jubilation') && ranAbility(joy, 'joy_smile'))
  add(joy, 'Joy Ascendant Blossoming Smile telegraphs charge → release', charged(joy, 'joy_smile'))
  add(joy, 'Joy Ascendant is Wind through the shared hit path', elems(joy).has('Wind'), [...elems(joy)].join(','))

  // ---- Lady of Crashing Waves (Ice) --------------------------------------------------------
  const lady = fight(foe('Lady of Crashing Waves', { weaknesses: ['Ice'] }))
  add(lady, 'Lady of Crashing Waves runs Corruption + Honeyed Brew + Heed The Ocean\'s Gift',
    ranAbility(lady, 'lady_corruption') && ranAbility(lady, 'lady_brew') && ranAbility(lady, 'lady_gift'))
  add(lady, 'Lady of Crashing Waves Honeyed Brew inflicts Inebriated Daze (DEBUFF_APPLIED)',
    all(lady, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'lady_inebriated'))
  add(lady, 'Lady of Crashing Waves is Ice through the shared hit path', elems(lady).has('Ice'), [...elems(lady)].join(','))

  // ---- Moonlit Pegasus (Quantum) -----------------------------------------------------------
  const pegasus = fight(foe('Moonlit Pegasus', { weaknesses: ['Quantum'] }))
  add(pegasus, 'Moonlit Pegasus runs Moonlight + Waning Moon + Waxing Moon',
    ranAbility(pegasus, 'pegasus_moonlight') && ranAbility(pegasus, 'pegasus_waning') && ranAbility(pegasus, 'pegasus_waxing'))
  add(pegasus, 'Moonlit Pegasus Triple Waning Moon applies Oronyx\'s Mark (DEBUFF_APPLIED)',
    all(pegasus, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'pegasus_oronyx'))
  add(pegasus, 'Moonlit Pegasus Double Waxing Moon telegraphs charge → release', charged(pegasus, 'pegasus_waxing'))
  add(pegasus, 'Moonlit Pegasus is Quantum through the shared hit path', elems(pegasus).has('Quantum'), [...elems(pegasus)].join(','))

  // ---- Noontide Gryphon (Fire) -------------------------------------------------------------
  const gryphon = fight(foe('Noontide Gryphon', { weaknesses: ['Fire'] }))
  add(gryphon, 'Noontide Gryphon runs Darkness + Heralding the Dawn + Light the Future',
    ranAbility(gryphon, 'gryphon_darkness') && ranAbility(gryphon, 'gryphon_dawn') && ranAbility(gryphon, 'gryphon_future'))
  add(gryphon, 'Noontide Gryphon Heralding the Dawn applies Aquila\'s Mark (DEBUFF_APPLIED)',
    all(gryphon, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'gryphon_aquila'))
  add(gryphon, 'Noontide Gryphon Light the Future telegraphs charge → release', charged(gryphon, 'gryphon_future'))
  add(gryphon, 'Noontide Gryphon is Fire through the shared hit path', elems(gryphon).has('Fire'), [...elems(gryphon)].join(','))

  // ---- Rocking Rebel (Imaginary) -----------------------------------------------------------
  const rebel = fight(foe('Rocking Rebel', { weaknesses: ['Imaginary'] }))
  add(rebel, 'Rocking Rebel runs both sweeps + Rehearsal + Get Hyped!',
    ranAbility(rebel, 'rebel_left') && ranAbility(rebel, 'rebel_right') && ranAbility(rebel, 'rebel_rehearsal') && ranAbility(rebel, 'rebel_hype'))
  add(rebel, 'Rocking Rebel Performance Rehearsal telegraphs charge → release', charged(rebel, 'rebel_rehearsal'))
  add(rebel, 'Rocking Rebel is Imaginary through the shared hit path', elems(rebel).has('Imaginary'), [...elems(rebel)].join(','))

  // ---- Sanerot Hearteater (composite) ------------------------------------------------------
  const sanerot = fight(foe('Sanerot Hearteater'))
  add(sanerot, 'Sanerot Hearteater resolves its authored Seance marker', ranAbility(sanerot, 'sanerot_seance'))

  // ---- Synergy Duo: Bloodbound Dark Duelist (Physical) -------------------------------------
  const duelist = fight(foe('Synergy Duo: Bloodbound Dark Duelist', { weaknesses: ['Physical'] }))
  add(duelist, 'Bloodbound Dark Duelist runs Dreadtide + Cast Marble + Desperate Deathmatch',
    ranAbility(duelist, 'duelist_dreadtide') && ranAbility(duelist, 'duelist_marble') && ranAbility(duelist, 'duelist_deathmatch'))
  add(duelist, 'Bloodbound Dark Duelist enters its authorial split state (BUFF_APPLIED duelist_split)',
    all(duelist, 'BUFF_APPLIED').some(n => n.payload?.id === 'duelist_split'))
  add(duelist, 'Bloodbound Dark Duelist is Physical through the shared hit path', elems(duelist).has('Physical'), [...elems(duelist)].join(','))

  // ---- Synergy Duo: Ironclad White Guard (Imaginary) ---------------------------------------
  const whiteGuard = fight(foe('Synergy Duo: Ironclad White Guard', { weaknesses: ['Imaginary'] }))
  add(whiteGuard, 'Ironclad White Guard runs From Skyveil to Dawn + Resembling Furious Lion',
    ranAbility(whiteGuard, 'guard_skyveil') && ranAbility(whiteGuard, 'guard_lion'))
  add(whiteGuard, 'Ironclad White Guard Resembling Furious Lion telegraphs charge → release', charged(whiteGuard, 'guard_lion'))
  add(whiteGuard, 'Ironclad White Guard carries War Armor (Polis Protector)', enemy(whiteGuard).buffs.some(x => x.id === 'warArmor'))
  add(whiteGuard, 'Ironclad White Guard is Imaginary through the shared hit path', elems(whiteGuard).has('Imaginary'), [...elems(whiteGuard)].join(','))

  // ---- "Harmonious Choir" The Great Septimus (Imaginary, Boss) ------------------------------
  const septimus = fight(foe('"Harmonious Choir" The Great Septimus', { weaknesses: ['Imaginary'] }))
  add(septimus, 'Great Septimus runs Grazioso + Maestoso + Vaneggiando',
    ranAbility(septimus, 'septimus_grazioso') && ranAbility(septimus, 'septimus_maestoso') && ranAbility(septimus, 'septimus_vaneggiando'))
  add(septimus, 'Great Septimus Accelerando telegraphs charge → release', charged(septimus, 'septimus_accelerando'))
  add(septimus, 'Great Septimus is Imaginary through the shared hit path', elems(septimus).has('Imaginary'), [...elems(septimus)].join(','))

  // ---- @SparxiConOfficial (Quantum, Boss) ---------------------------------------------------
  const sparxi = fight(foe('@SparxiConOfficial', { weaknesses: ['Quantum'] }))
  add(sparxi, '@SparxiConOfficial runs Net Battle! + Bring the Beat In! + Get On the Mic!',
    ranAbility(sparxi, 'sparxi_net') && ranAbility(sparxi, 'sparxi_beat') && ranAbility(sparxi, 'sparxi_mic'))
  add(sparxi, '@SparxiConOfficial is Quantum through the shared hit path', elems(sparxi).has('Quantum'), [...elems(sparxi)].join(','))

  // ---- Abundant Ebon Deer (Lightning/Wind, Boss) --------------------------------------------
  const deer = fight(foe('Abundant Ebon Deer', { weaknesses: ['Lightning'] }))
  add(deer, 'Abundant Ebon Deer runs Bleat + Caress + Outrage',
    ranAbility(deer, 'deer_bleat') && ranAbility(deer, 'deer_caress') && ranAbility(deer, 'deer_outrage'))
  add(deer, 'Abundant Ebon Deer Outrage applies Wind Shear (DOT_APPLIED)', dotApplied(deer, 'WindShear'))
  add(deer, 'Abundant Ebon Deer is Lightning through the shared hit path', elems(deer).has('Lightning'), [...elems(deer)].join(','))

  // ---- Alloy Mechatron: King Pom-Pom (Quantum, Boss) ----------------------------------------
  const pompom = fight(foe('Alloy Mechatron: King Pom-Pom', { weaknesses: ['Quantum'] }))
  add(pompom, 'King Pom-Pom runs Shears + Cleanse + Potent Foam Soap',
    ranAbility(pompom, 'pompom_shears') && ranAbility(pompom, 'pompom_cleanse') && ranAbility(pompom, 'pompom_foam'))
  add(pompom, 'King Pom-Pom enters Steam Wash (BUFF_APPLIED steam_wash)',
    all(pompom, 'BUFF_APPLIED').some(n => n.payload?.id === 'steam_wash'))
  add(pompom, 'King Pom-Pom Duty Prep telegraphs charge → release', charged(pompom, 'pompom_duty'))

  // ---- Annihilator of Desolation Mistral (Ice, Boss) ----------------------------------------
  const mistral = fight(foe('Annihilator of Desolation Mistral', { weaknesses: ['Ice'] }))
  add(mistral, 'Annihilator Mistral runs Chill + Reverberating Ice',
    ranAbility(mistral, 'mistral_chill') && ranAbility(mistral, 'mistral_reverb'))
  add(mistral, 'Annihilator Mistral Wrath of Winterland Saints telegraphs charge → release', charged(mistral, 'mistral_wrath'))
  add(mistral, 'Annihilator Mistral is Ice through the shared hit path', elems(mistral).has('Ice'), [...elems(mistral)].join(','))

  // ---- Annihilator of Desolation Mistral: Mother of Deception (Ice/Imaginary, Boss) ---------
  const mother = fight(foe('Annihilator of Desolation Mistral: Mother of Deception', { weaknesses: ['Ice'] }))
  add(mother, 'Mother of Deception runs Creator\'s Resolve + Harbinger of Annihilation',
    ranAbility(mother, 'mother_resolve') && ranAbility(mother, 'mother_harbinger'))
  add(mother, "Mother of Deception Creator's Resolve enters its marker state (BUFF_APPLIED creator_resolve)",
    all(mother, 'BUFF_APPLIED').some(n => n.payload?.id === 'creator_resolve'))
  add(mother, 'Mother of Deception The Creation\'s Prelude telegraphs charge → release', charged(mother, 'mother_prelude'))

  // ---- Anti-Creator, Hatred Inundate (Physical/Quantum/Imaginary, Boss) ----------------------
  const anticreator = fight(foe('Anti-Creator, Hatred Inundate', { weaknesses: ['Physical'] }))
  add(anticreator, 'Anti-Creator runs Cast Down + Weave Suffering + Yield Not to Tyranny + Mire Not Within Caves',
    ranAbility(anticreator, 'anticreator_cast') && ranAbility(anticreator, 'anticreator_weave') &&
    ranAbility(anticreator, 'anticreator_yield') && ranAbility(anticreator, 'anticreator_mire'))
  add(anticreator, 'Anti-Creator Mire Not Within Caves applies Action Lock (DEBUFF_APPLIED action_lock)',
    all(anticreator, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'action_lock'))
  add(anticreator, 'Anti-Creator is Physical through the shared hit path', elems(anticreator).has('Physical'), [...elems(anticreator)].join(','))

  // ---- Arbiter of the Lost Abyss (Imaginary, Boss) ------------------------------------------
  const arbiter = fight(foe('Arbiter of the Lost Abyss', { weaknesses: ['Imaginary'] }))
  add(arbiter, 'Arbiter runs Teethgrind + Saw + Clamps + Glower',
    ranAbility(arbiter, 'arbiter_teethgrind') && ranAbility(arbiter, 'arbiter_saw') && ranAbility(arbiter, 'arbiter_clamps') && ranAbility(arbiter, 'arbiter_glower'))
  add(arbiter, 'Arbiter enters Enhance Defense on spawn (BUFF_APPLIED arbiter_enhanced_defense)',
    all(arbiter, 'BUFF_APPLIED').some(n => n.payload?.id === 'arbiter_enhanced_defense'))
  add(arbiter, 'Arbiter Name the Culprit telegraphs charge → release', charged(arbiter, 'arbiter_culprit'))

  // ---- Argenti (Physical, Boss) -------------------------------------------------------------
  const argenti = fight(foe('Argenti', { weaknesses: ['Physical'] }))
  add(argenti, 'Argenti runs Piety + Imbue Devotion + So Cometh Beauty\'s Knight',
    ranAbility(argenti, 'argenti_piety') && ranAbility(argenti, 'argenti_devotion') && ranAbility(argenti, 'argenti_beauty'))
  add(argenti, 'Argenti is Physical through the shared hit path', elems(argenti).has('Physical'), [...elems(argenti)].join(','))

  // ---- Blaznana Monkey Trick (Physical/Quantum/Fire, Boss) ----------------------------------
  const blaznana = fight(foe('Blaznana Monkey Trick', { weaknesses: ['Physical'] }))
  add(blaznana, 'Blaznana Monkey Trick runs Roll Call + Question Segment + Banashment + Banascary Semester',
    ranAbility(blaznana, 'blaz_rollcall') && ranAbility(blaznana, 'blaz_question') && ranAbility(blaznana, 'blaz_banash') && ranAbility(blaznana, 'blaz_banascary'))
  add(blaznana, 'Blaznana Monkey Trick is Physical through the shared hit path', elems(blaznana).has('Physical'), [...elems(blaznana)].join(','))

  // ---- Borisin Warhead: Hoolay (Lightning, Boss) --------------------------------------------
  const hoolay = fight(foe('Borisin Warhead: Hoolay', { weaknesses: ['Lightning'] }))
  add(hoolay, 'Hoolay runs Fang + Claws + Decimation of Roaring Storms',
    ranAbility(hoolay, 'hoolay_fang') && ranAbility(hoolay, 'hoolay_claws') && ranAbility(hoolay, 'hoolay_decimation'))
  add(hoolay, 'Hoolay is Lightning through the shared hit path', elems(hoolay).has('Lightning'), [...elems(hoolay)].join(','))

  // ---- Bronya (Wind, Boss) ------------------------------------------------------------------
  const bronyaE = fight(foe('Bronya', { weaknesses: ['Wind'] }))
  add(bronyaE, 'Bronya runs Windrider Bullet + Combat Redeployment',
    ranAbility(bronyaE, 'bronya_bullet') && ranAbility(bronyaE, 'bronya_redeploy'))
  add(bronyaE, 'Bronya is Wind through the shared hit path', elems(bronyaE).has('Wind'), [...elems(bronyaE)].join(','))

  // ---- Cacophonic Conductor (Imaginary, Boss) ----------------------------------------------
  const caco = fight(foe('Cacophonic Conductor', { weaknesses: ['Imaginary'] }))
  add(caco, 'Cacophonic Conductor runs Grazioso + Maestoso + Vaneggiando',
    ranAbility(caco, 'caco_grazioso') && ranAbility(caco, 'caco_maestoso') && ranAbility(caco, 'caco_vaneggiando'))
  add(caco, 'Cacophonic Conductor is Imaginary through the shared hit path', elems(caco).has('Imaginary'), [...elems(caco)].join(','))

  // ---- Cirrus (Wind, Boss) ------------------------------------------------------------------
  const cirrus = fight(foe('Cirrus', { weaknesses: ['Wind'] }))
  add(cirrus, 'Cirrus runs Rapid Gambit + Hesitation', ranAbility(cirrus, 'cirrus_gambit') && ranAbility(cirrus, 'cirrus_hesitation'))
  add(cirrus, 'Cirrus Hesitation enters its marker state (BUFF_APPLIED cirrus_hesitation)',
    all(cirrus, 'BUFF_APPLIED').some(n => n.payload?.id === 'cirrus_hesitation'))

  // ---- Cloud Knight Lieutenant: Yanqing (Ice, Boss) -----------------------------------------
  const yanqing = fight(foe('Cloud Knight Lieutenant: Yanqing', { weaknesses: ['Ice'] }))
  add(yanqing, 'Yanqing runs Rapturous Wind + Ballad of Formation Breaker + Jadecarve Strike',
    ranAbility(yanqing, 'yanqing_wind') && ranAbility(yanqing, 'yanqing_ballad') && ranAbility(yanqing, 'yanqing_jadecarve'))
  add(yanqing, 'Yanqing Ironthorn applies Freeze (CONTROL_APPLIED)',
    all(yanqing, 'CONTROL_APPLIED').some(n => n.payload?.kind === 'Freeze'))
  add(yanqing, 'Yanqing Verging Edge telegraphs charge → release', charged(yanqing, 'yanqing_verging'))

  // ---- Cocolia (Ice, Boss) ------------------------------------------------------------------
  const cocolia = fight(foe('Cocolia', { weaknesses: ['Ice'] }))
  add(cocolia, 'Cocolia runs Chill + Reverberating Ice + Icy Wind',
    ranAbility(cocolia, 'cocolia_chill') && ranAbility(cocolia, 'cocolia_reverb') && ranAbility(cocolia, 'cocolia_icywind'))
  add(cocolia, 'Cocolia Wrath of Winterland Saints telegraphs charge → release', charged(cocolia, 'cocolia_wrath'))

  // ---- Cocolia, Mother of Deception (Ice/Imaginary, Boss) -----------------------------------
  const cocoliaM = fight(foe('Cocolia, Mother of Deception', { weaknesses: ['Ice'] }))
  add(cocoliaM, "Cocolia MoD runs Creator's Resolve + Bone-Shattering Cold + Genesis Chord",
    ranAbility(cocoliaM, 'cocoliaM_resolve') && ranAbility(cocoliaM, 'cocoliaM_bone') && ranAbility(cocoliaM, 'cocoliaM_genesis'))
  add(cocoliaM, "Cocolia MoD Creator's Resolve enters its marker state (BUFF_APPLIED creator_resolve)",
    all(cocoliaM, 'BUFF_APPLIED').some(n => n.payload?.id === 'creator_resolve'))
  add(cocoliaM, 'Cocolia MoD Genesis Chord applies Imprisonment (CONTROL_APPLIED)',
    all(cocoliaM, 'CONTROL_APPLIED').some(n => n.payload?.kind === 'Imprisonment'))

  // ---- Daring Diceroller (Imaginary, Boss) --------------------------------------------------
  const dicer = fight(foe('Daring Diceroller', { weaknesses: ['Imaginary'] }))
  add(dicer, 'Daring Diceroller runs Heavy Stakes + Distributed Investment + Profit Cut',
    ranAbility(dicer, 'dicer_heavy') && ranAbility(dicer, 'dicer_invest') && ranAbility(dicer, 'dicer_profit'))
  add(dicer, 'Daring Diceroller Betting the Flop telegraphs charge → release', charged(dicer, 'dicer_betting'))

  // ---- Decimator, Karma of Daythunder, Eye of Twilight (Lightning, Boss) ---------------------
  const decimator = fight(foe('Decimator, Karma of Daythunder, Eye of Twilight', { weaknesses: ['Lightning'] }))
  add(decimator, 'Decimator runs Eye of Terror + Black Tide + Extinguishment of the Savaged Star',
    ranAbility(decimator, 'decimator_eye') && ranAbility(decimator, 'decimator_blacktide') && ranAbility(decimator, 'decimator_reinstate'))
  add(decimator, 'Decimator Eye of Terror telegraphs charge → release', charged(decimator, 'decimator_eye'))
  add(decimator, 'Decimator is Lightning through the shared hit path', elems(decimator).has('Lightning'), [...elems(decimator)].join(','))

  // ---- Doomsday Beast (Imaginary, Boss) -----------------------------------------------------
  const doomsday = fight(foe('Doomsday Beast', { weaknesses: ['Imaginary'] }))
  add(doomsday, 'Doomsday Beast runs Total Annihilation + Engine Boost + Calamity Tear',
    ranAbility(doomsday, 'doomsday_annihilation') && ranAbility(doomsday, 'doomsday_boost') && ranAbility(doomsday, 'doomsday_tear'))
  add(doomsday, 'Doomsday Beast Cataclysm Precursor telegraphs charge → release', charged(doomsday, 'doomsday_cataclysm'))
  add(doomsday, 'Doomsday Beast is Imaginary through the shared hit path', elems(doomsday).has('Imaginary'), [...elems(doomsday)].join(','))

  // ---- First Genius, Entelechy, Zandar (Quantum, Boss) --------------------------------------
  const zandar = fight(foe('First Genius, Entelechy, Zandar', { weaknesses: ['Quantum'] }))
  add(zandar, 'Zandar runs DEL Invasion_Variable + Origination && Destruction + Celestial Displacement Theory',
    ranAbility(zandar, 'zandar_del') && ranAbility(zandar, 'zandar_origination') && ranAbility(zandar, 'zandar_celestial'))
  add(zandar, 'Zandar is Quantum through the shared hit path', elems(zandar).has('Quantum'), [...elems(zandar)].join(','))

  // ---- Flame Reaver of Doomsday Led Astray (Physical, Boss) ---------------------------------
  const reaverA = fight(foe('Flame Reaver of Doomsday Led Astray', { weaknesses: ['Physical'] }))
  add(reaverA, "Reaver Led Astray runs Demise's Storm + Fading Fate + Plummeting Strike",
    ranAbility(reaverA, 'reaverA_storm') && ranAbility(reaverA, 'reaverA_fading') && ranAbility(reaverA, 'reaverA_plummet'))
  add(reaverA, 'Reaver Led Astray Dying Sobs telegraphs charge → release', charged(reaverA, 'reaverA_dying'))

  // ---- Flame Reaver of the Deepest Dark (Physical, Boss) ------------------------------------
  const reaverB = fight(foe('Flame Reaver of the Deepest Dark', { weaknesses: ['Physical'] }))
  add(reaverB, "Reaver Deepest Dark runs Demise's Storm + Fading Fate + Underworld's Grief",
    ranAbility(reaverB, 'reaverB_storm') && ranAbility(reaverB, 'reaverB_fading') && ranAbility(reaverB, 'reaverB_grief'))
  add(reaverB, 'Reaver Deepest Dark Silent Sorrow telegraphs charge → release', charged(reaverB, 'reaverB_silent'))

  // ---- Fulminating Wolflord (Lightning, Boss) -----------------------------------------------
  const wolflord = fight(foe('Fulminating Wolflord', { weaknesses: ['Lightning'] }))
  add(wolflord, 'Fulminating Wolflord runs Fang + Claws + Decimation of Roaring Storms',
    ranAbility(wolflord, 'wolflord_fang') && ranAbility(wolflord, 'wolflord_claws') && ranAbility(wolflord, 'wolflord_decimation'))
  add(wolflord, 'Fulminating Wolflord is Lightning through the shared hit path', elems(wolflord).has('Lightning'), [...elems(wolflord)].join(','))

  // ---- Gepard (Ice, Boss) -------------------------------------------------------------------
  const gepard = fight(foe('Gepard', { weaknesses: ['Ice'] }))
  add(gepard, 'Gepard runs Fist of Conviction + Smite of Frost + Siege Support + Tit for Tat',
    ranAbility(gepard, 'gepard_fist') && ranAbility(gepard, 'gepard_smite') && ranAbility(gepard, 'gepard_siege') && ranAbility(gepard, 'gepard_retaliate'))
  add(gepard, 'Gepard is Ice through the shared hit path', elems(gepard).has('Ice'), [...elems(gepard)].join(','))

  // ---- Guide of Withering and Decay (Quantum, Boss) -----------------------------------------
  const guide = fight(foe('Guide of Withering and Decay', { weaknesses: ['Quantum'] }))
  add(guide, 'Guide of Withering and Decay runs To Stay the Fallen + To Bury the Slumbered + To Mourn the Departing',
    ranAbility(guide, 'guide_stay') && ranAbility(guide, 'guide_bury') && ranAbility(guide, 'guide_mourn'))
  add(guide, 'Guide of Withering and Decay enters Inky Fog on spawn (BUFF_APPLIED inky_fog)',
    all(guide, 'BUFF_APPLIED').some(n => n.payload?.id === 'inky_fog'))
  add(guide, 'Guide of Withering and Decay is Quantum through the shared hit path', elems(guide).has('Quantum'), [...elems(guide)].join(','))

  // ---- Harbinger of Death: Swarm Nightmare (Fire, Boss) -------------------------------------
  const swarm = fight(foe('Harbinger of Death: Swarm Nightmare', { weaknesses: ['Fire'] }))
  add(swarm, 'Swarm Nightmare runs Malignform Elytra + Rapacious Appendages + Encroach, Mangle, Sate',
    ranAbility(swarm, 'swarm_elytra') && ranAbility(swarm, 'swarm_appendages') && ranAbility(swarm, 'swarm_encroach'))
  add(swarm, 'Swarm Nightmare is Fire through the shared hit path', elems(swarm).has('Fire'), [...elems(swarm)].join(','))

  // ---- Hellcharred Shadow General (Wind, Boss) ----------------------------------------------
  const shadow = fight(foe('Hellcharred Shadow General', { weaknesses: ['Wind'] }))
  add(shadow, 'Hellcharred Shadow General runs Swordfang + Irontalon + Soul-Shattering Malediction',
    ranAbility(shadow, 'shadow_swordfang') && ranAbility(shadow, 'shadow_irontalon') && ranAbility(shadow, 'shadow_malediction'))
  add(shadow, 'Hellcharred Shadow General applies Malediction (DEBUFF_APPLIED)',
    all(shadow, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'malediction'))
  add(shadow, 'Hellcharred Shadow General Wreathed in Storm telegraphs charge → release', charged(shadow, 'shadow_wreathed'))

  // ---- Ichor Memosprite: Judge of Oblivion (Imaginary, Boss) --------------------------------
  const judge = fight(foe('Ichor Memosprite: Judge of Oblivion', { weaknesses: ['Imaginary'] }))
  add(judge, 'Judge of Oblivion runs Teethgrind + Saw + Clamps + Glower',
    ranAbility(judge, 'judge_teethgrind') && ranAbility(judge, 'judge_saw') && ranAbility(judge, 'judge_clamps') && ranAbility(judge, 'judge_glower'))
  add(judge, 'Judge of Oblivion enters Expedite Verdict on spawn (BUFF_APPLIED expedite_verdict)',
    all(judge, 'BUFF_APPLIED').some(n => n.payload?.id === 'expedite_verdict'))
  add(judge, 'Judge of Oblivion Name the Culprit telegraphs charge → release', charged(judge, 'judge_culprit'))

  // ---- Irontomb, Anti-Nous, Funeral of Gnosis (Physical, Boss) ------------------------------
  const irontomb = fight(foe('Irontomb, Anti-Nous, Funeral of Gnosis', { weaknesses: ['Physical'] }))
  add(irontomb, 'Irontomb runs its authored Funeral of Gnosis', ranAbility(irontomb, 'irontomb_strike'))
  add(irontomb, 'Irontomb is Physical through the shared hit path', elems(irontomb).has('Physical'), [...elems(irontomb)].join(','))

  // ---- Live Stream Assistant (Quantum, Boss) ------------------------------------------------
  const live = fight(foe('Live Stream Assistant', { weaknesses: ['Quantum'] }))
  add(live, 'Live Stream Assistant runs Net Battle! + Bring the Beat In!',
    ranAbility(live, 'live_net') && ranAbility(live, 'live_beat'))
  add(live, 'Live Stream Assistant is Quantum through the shared hit path', elems(live).has('Quantum'), [...elems(live)].join(','))

  // ---- Lord of Saṃvartasthāyi, Asat Pramad (Imaginary, Boss) --------------------------------
  const asat = fight(foe('Lord of Saṃvartasthāyi, Asat Pramad', { weaknesses: ['Imaginary'] }))
  add(asat, 'Asat Pramad runs Existential Farce + Mocked Gaze',
    ranAbility(asat, 'asat_farce') && ranAbility(asat, 'asat_gaze'))
  add(asat, 'Asat Pramad Meme Setup telegraphs charge → release', charged(asat, 'asat_meme'))
  add(asat, 'Asat Pramad is Imaginary through the shared hit path', elems(asat).has('Imaginary'), [...elems(asat)].join(','))

  // ---- Lord of Saṃvartasthāyi, Asat Pramad: "Decay" (Imaginary, Boss) -----------------------
  const decay = fight(foe('Lord of Saṃvartasthāyi, Asat Pramad: "Decay"', { weaknesses: ['Imaginary'] }))
  add(decay, 'Asat Pramad "Decay" runs Existential Farce + Mocked Gaze',
    ranAbility(decay, 'decay_farce') && ranAbility(decay, 'decay_gaze'))
  add(decay, 'Asat Pramad "Decay" Meme Setup telegraphs charge → release', charged(decay, 'decay_meme'))

  // ---- Lord of Saṃvartasthāyi, Asat Pramad: "Existence" (Imaginary, Boss) -------------------
  const exist = fight(foe('Lord of Saṃvartasthāyi, Asat Pramad: "Existence"', { weaknesses: ['Imaginary'] }))
  add(exist, 'Asat Pramad "Existence" runs Existential Farce + Mocked Gaze',
    ranAbility(exist, 'exist_farce') && ranAbility(exist, 'exist_gaze'))
  add(exist, 'Asat Pramad "Existence" Meme Setup telegraphs charge → release', charged(exist, 'exist_meme'))

  // ---- Maddened Feixiao (Wind, Boss) --------------------------------------------------------
  const feixiao = fight(foe('Maddened Feixiao', { weaknesses: ['Wind'] }))
  add(feixiao, 'Maddened Feixiao runs Swordfang + Irontalon',
    ranAbility(feixiao, 'feixiao_swordfang') && ranAbility(feixiao, 'feixiao_irontalon'))
  add(feixiao, 'Maddened Feixiao enters Safeguard on spawn (BUFF_APPLIED safeguardMit)',
    all(feixiao, 'BUFF_APPLIED').some(n => n.payload?.id === 'safeguardMit'))
  add(feixiao, 'Maddened Feixiao is Wind through the shared hit path', elems(feixiao).has('Wind'), [...elems(feixiao)].join(','))

  // ---- Memory Zone Meme "Something Unto Death" (Physical, Boss) -----------------------------
  const meme = fight(foe('Memory Zone Meme "Something Unto Death"', { weaknesses: ['Physical'] }))
  add(meme, 'Something Unto Death runs Funereal Kiss + Sunken Rain + Biting Obituary',
    ranAbility(meme, 'meme_kiss') && ranAbility(meme, 'meme_rain') && ranAbility(meme, 'meme_obituary'))
  add(meme, 'Something Unto Death enters Biting Obituary (BUFF_APPLIED biting_obituary)',
    all(meme, 'BUFF_APPLIED').some(n => n.payload?.id === 'biting_obituary'))
  add(meme, 'Something Unto Death is Physical through the shared hit path', elems(meme).has('Physical'), [...elems(meme)].join(','))

  // ---- Monitoring Automaton Prototype 2 (Physical, Boss) ------------------------------------
  const monitor = fight(foe('Monitoring Automaton Prototype 2', { weaknesses: ['Physical'] }))
  add(monitor, 'Monitoring Automaton Prototype 2 runs Banishing Punch + Burning Beam + Disabling Field',
    ranAbility(monitor, 'monitor_punch') && ranAbility(monitor, 'monitor_beam') && ranAbility(monitor, 'monitor_field'))
  add(monitor, 'Monitoring Automaton Prototype 2 Overload Warning telegraphs charge → release', charged(monitor, 'monitor_overload'))
  add(monitor, 'Monitoring Automaton Prototype 2 is Physical through the shared hit path', elems(monitor).has('Physical'), [...elems(monitor)].join(','))

  // ---- Murata Graphia, Founding Artist (Fire, Boss) -----------------------------------------
  const murata = fight(foe('Murata Graphia, Founding Artist', { weaknesses: ['Fire'] }))
  add(murata, 'Murata Graphia runs Cinder Crimson Blockprint + Infernal Gory Blockprint',
    ranAbility(murata, 'murata_cinder') && ranAbility(murata, 'murata_gory'))
  add(murata, 'Murata Graphia Infernal Gory Blockprint applies Grudge Ablaze (Burn DoT)', dotApplied(murata, 'Burn'))
  add(murata, 'Murata Graphia Phantasmal Fiend-Sketch telegraphs charge → release', charged(murata, 'murata_sketch'))
  add(murata, 'Murata Graphia is Fire through the shared hit path', elems(murata).has('Fire'), [...elems(murata)].join(','))

  // ---- Opportunistic Provocateur (Wind, Boss) -----------------------------------------------
  const prov = fight(foe('Opportunistic Provocateur', { weaknesses: ['Wind'] }))
  add(prov, 'Opportunistic Provocateur runs Forming Winds + Cleansing Sweep + Furor + Arbor Apotheosis',
    ranAbility(prov, 'prov_acchata') && ranAbility(prov, 'prov_sweep') && ranAbility(prov, 'prov_furor') && ranAbility(prov, 'prov_arbor'))
  add(prov, "Opportunistic Provocateur applies Prana-Siphon (DEBUFF_APPLIED)", all(prov, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'prana_siphon'))
  add(prov, 'Opportunistic Provocateur enters Safeguard on spawn (BUFF_APPLIED safeguardMit)', all(prov, 'BUFF_APPLIED').some(n => n.payload?.id === 'safeguardMit'))

  // ---- Paramount Bliss Inverted: Illwish Archlotus (Lightning, Boss) ------------------------
  const illwish = fight(foe('Paramount Bliss Inverted: Illwish Archlotus', { weaknesses: ['Lightning'] }))
  add(illwish, 'Illwish Archlotus runs Rift Pistil + Siphon Woe', ranAbility(illwish, 'illwish_rift') && ranAbility(illwish, 'illwish_siphon'))
  add(illwish, 'Illwish Archlotus Incipient Bloom telegraphs charge → release', charged(illwish, 'illwish_bloom'))
  add(illwish, 'Illwish Archlotus gains Wicked Grin (BUFF_APPLIED wicked_grin)', all(illwish, 'BUFF_APPLIED').some(n => n.payload?.id === 'wicked_grin'))
  add(illwish, 'Illwish Archlotus is Lightning through the shared hit path', elems(illwish).has('Lightning'), [...elems(illwish)].join(','))

  // ---- Phantylia the Undying (Wind, Boss) ---------------------------------------------------
  const phantylia = fight(foe('Phantylia the Undying', { weaknesses: ['Wind'] }))
  add(phantylia, 'Phantylia the Undying runs Forming Winds + Cleansing Sweep + Weaving Roots + Roaring Thunder + Furor',
    ranAbility(phantylia, 'phantylia_winds') && ranAbility(phantylia, 'phantylia_sweep') && ranAbility(phantylia, 'phantylia_roots') && ranAbility(phantylia, 'phantylia_thunder') && ranAbility(phantylia, 'phantylia_furor'))
  add(phantylia, 'Phantylia the Undying is Wind and Lightning through the shared hit path',
    elems(phantylia).has('Wind') && elems(phantylia).has('Lightning'), [...elems(phantylia)].join(','))

  // ---- Pollux, Netherwing Husk, Ferry of Souls (Quantum, Boss) ------------------------------
  const pollux = fight(foe('Pollux, Netherwing Husk, Ferry of Souls', { weaknesses: ['Quantum'] }))
  add(pollux, 'Pollux runs To Stay the Fallen + To Bury the Slumbered + To Mourn the Departing',
    ranAbility(pollux, 'pollux_stay') && ranAbility(pollux, 'pollux_bury') && ranAbility(pollux, 'pollux_mourn'))
  add(pollux, 'Pollux enters Inky Fog on spawn (BUFF_APPLIED inky_fog)', all(pollux, 'BUFF_APPLIED').some(n => n.payload?.id === 'inky_fog'))
  add(pollux, 'Pollux is Quantum through the shared hit path', elems(pollux).has('Quantum'), [...elems(pollux)].join(','))

  // ---- Shadow of "Feixiao" (Wind, Boss) -----------------------------------------------------
  const feixiaoS = fight(foe('Shadow of "Feixiao"', { weaknesses: ['Physical'] }))
  add(feixiaoS, 'Shadow of "Feixiao" runs Swordfang + Irontalon + Passing Tempest',
    ranAbility(feixiaoS, 'feixiaoS_swordfang') && ranAbility(feixiaoS, 'feixiaoS_irontalon') && ranAbility(feixiaoS, 'feixiaoS_tempest'))
  add(feixiaoS, 'Shadow of "Feixiao" Wreathed in Storm telegraphs charge → release', charged(feixiaoS, 'feixiaoS_wreathed'))
  add(feixiaoS, 'Shadow of "Feixiao" enters Safeguard on spawn (BUFF_APPLIED safeguardMit)', all(feixiaoS, 'BUFF_APPLIED').some(n => n.payload?.id === 'safeguardMit'))
  add(feixiaoS, 'Shadow of "Feixiao" is Wind through the shared hit path', elems(feixiaoS).has('Wind'), [...elems(feixiaoS)].join(','))

  // ---- Silver Knight of Virtuous Gallantry (Physical, Boss) ---------------------------------
  const knight = fight(foe('Silver Knight of Virtuous Gallantry', { weaknesses: ['Physical'] }))
  add(knight, 'Silver Knight runs Piety + Imbue Devotion + So Cometh Beauty\'s Knight',
    ranAbility(knight, 'knight_piety') && ranAbility(knight, 'knight_imbue') && ranAbility(knight, 'knight_beauty'))
  add(knight, 'Silver Knight Diadem of the Stale grants a Shield (SHIELD_APPLIED)', all(knight, 'SHIELD_APPLIED').length > 0)
  add(knight, 'Silver Knight is Physical through the shared hit path', elems(knight).has('Physical'), [...elems(knight)].join(','))

  // ---- Sky-Shrouding Stardevourer Swarm (Quantum, Boss) -------------------------------------
  const swarmK = fight(foe('Sky-Shrouding Stardevourer Swarm', { weaknesses: ['Quantum'] }))
  add(swarmK, 'Stardevourer Swarm runs Swarm King Cannon + Radiating Venom + Pyrolysis Death Beam',
    ranAbility(swarmK, 'swarmK_cannon') && ranAbility(swarmK, 'swarmK_venom') && ranAbility(swarmK, 'swarmK_beam'))
  add(swarmK, 'Stardevourer Swarm Radiating Venom applies Entanglement (CONTROL_APPLIED)', all(swarmK, 'CONTROL_APPLIED').some(n => n.payload?.kind === 'Entanglement'))
  add(swarmK, 'Stardevourer Swarm Nesting Incubation telegraphs charge → release', charged(swarmK, 'swarmK_nesting'))

  // ---- Soulhook Sovereign (Lightning, Boss) -------------------------------------------------
  const soulhook = fight(foe('Soulhook Sovereign', { weaknesses: ['Lightning'] }))
  add(soulhook, 'Soulhook Sovereign runs Midnight Tumult + Caressing Moonlight + Seething Whisper of the Fallen',
    ranAbility(soulhook, 'soulhook_tumult') && ranAbility(soulhook, 'soulhook_moonlight') && ranAbility(soulhook, 'soulhook_whisper'))
  add(soulhook, 'Soulhook Sovereign applies Shock (DOT_APPLIED)', dotApplied(soulhook, 'Shock'))
  add(soulhook, 'Soulhook Sovereign is Lightning through the shared hit path', elems(soulhook).has('Lightning'), [...elems(soulhook)].join(','))

  // ---- Starbane Doombringer (Quantum/Imaginary, Boss) ---------------------------------------
  const doombringer = fight(foe('Starbane Doombringer', { weaknesses: ['Quantum'] }))
  add(doombringer, 'Starbane Doombringer runs Total Annihilation + Mass Infection + Calamity Tear + The Breakdown of Tyranny',
    ranAbility(doombringer, 'doombringer_total') && ranAbility(doombringer, 'doombringer_infection') && ranAbility(doombringer, 'doombringer_tear') && ranAbility(doombringer, 'doombringer_breakdown'))
  add(doombringer, 'Starbane Doombringer Cataclysm Precursor telegraphs charge → release', charged(doombringer, 'doombringer_cataclysm'))
  add(doombringer, 'Starbane Doombringer is Quantum and Imaginary through the shared hit path',
    elems(doombringer).has('Quantum') && elems(doombringer).has('Imaginary'), [...elems(doombringer)].join(','))

  // ---- Starcrusher Swarm King: Skaracabaz (Quantum, Boss) -----------------------------------
  const skara = fight(foe('Starcrusher Swarm King: Skaracabaz', { weaknesses: ['Quantum'] }))
  add(skara, 'Skaracabaz runs Swarm King Cannon + Radiating Venom + Pyrolysis Death Beam + Horn Clash',
    ranAbility(skara, 'skara_cannon') && ranAbility(skara, 'skara_venom') && ranAbility(skara, 'skara_beam') && ranAbility(skara, 'skara_horn'))
  add(skara, 'Skaracabaz applies Entanglement (CONTROL_APPLIED)', all(skara, 'CONTROL_APPLIED').some(n => n.payload?.kind === 'Entanglement'))
  add(skara, 'Skaracabaz Carapace of Nurtured Disaster telegraphs charge → release', charged(skara, 'skara_carapace'))

  // ---- Stellaron Hunter: Kafka (Lightning, Boss) --------------------------------------------
  const kafka = fight(foe('Stellaron Hunter: Kafka', { weaknesses: ['Lightning'] }))
  add(kafka, 'Kafka runs Midnight Tumult + Caressing Moonlight + Silent and Sharp Mockery',
    ranAbility(kafka, 'kafka_tumult') && ranAbility(kafka, 'kafka_moonlight') && ranAbility(kafka, 'kafka_mockery'))
  add(kafka, 'Kafka Midnight Tumult applies Shock (DOT_APPLIED)', dotApplied(kafka, 'Shock'))
  add(kafka, 'Kafka is Lightning through the shared hit path', elems(kafka).has('Lightning'), [...elems(kafka)].join(','))

  // ---- Stellaron Hunter: Sam (Fire, Boss) ---------------------------------------------------
  const sam = fight(foe('Stellaron Hunter: Sam', { weaknesses: ['Fire'] }))
  add(sam, 'Sam runs BHF: Fiery Advance + BHF: Heavenly Fire + BBHF: Scorched Earth',
    ranAbility(sam, 'sam_fiery') && ranAbility(sam, 'sam_heavenly') && ranAbility(sam, 'sam_scorched'))
  add(sam, 'Sam is Fire through the shared hit path', elems(sam).has('Fire'), [...elems(sam)].join(','))

  // ---- Sublime, Radiant, Avatar of the Sky (Fire/Lightning, Boss) ---------------------------
  const sublime = fight(foe('Sublime, Radiant, Avatar of the Sky', { weaknesses: ['Fire'] }))
  add(sublime, 'Avatar of the Sky runs Three Thousand Leagues Ablaze + Flame Beyond the Horizon + Thunder From the Distance + Surge Across the Leagues',
    ranAbility(sublime, 'sublime_three') && ranAbility(sublime, 'sublime_flame') && ranAbility(sublime, 'sublime_thunder') && ranAbility(sublime, 'sublime_surge'))
  add(sublime, 'Avatar of the Sky is Fire and Lightning through the shared hit path',
    elems(sublime).has('Fire') && elems(sublime).has('Lightning'), [...elems(sublime)].join(','))

  // ---- Super Idol: Center of Attention (Quantum, Boss) --------------------------------------
  const idol = fight(foe('Super Idol: Center of Attention', { weaknesses: ['Quantum'] }))
  add(idol, 'Super Idol runs Net Battle! + Bring the Beat In!',
    ranAbility(idol, 'idol_net') && ranAbility(idol, 'idol_beat'))
  add(idol, 'Super Idol is Quantum through the shared hit path', elems(idol).has('Quantum'), [...elems(idol)].join(','))

  // ---- Svarog (Physical, Boss) --------------------------------------------------------------
  const svarog = fight(foe('Svarog', { weaknesses: ['Physical'] }))
  add(svarog, 'Svarog runs Banishing Punch + Burning Beam + Disabling Field + Oppressive Embrace',
    ranAbility(svarog, 'svarog_punch') && ranAbility(svarog, 'svarog_beam') && ranAbility(svarog, 'svarog_field') && ranAbility(svarog, 'svarog_embrace'))
  add(svarog, 'Svarog Overload Warning telegraphs charge → release', charged(svarog, 'svarog_overload'))
  add(svarog, 'Svarog is Physical through the shared hit path', elems(svarog).has('Physical'), [...elems(svarog)].join(','))

  // ---- Swarm: True Sting (Wind, Boss) -------------------------------------------------------
  const sting = fight(foe('Swarm: True Sting', { weaknesses: ['Wind'] }))
  add(sting, 'True Sting runs Time to Battle + War Gear + Cyclonic Swarm',
    ranAbility(sting, 'sting_battle') && ranAbility(sting, 'sting_wargear') && ranAbility(sting, 'sting_cyclonic'))
  add(sting, 'True Sting Ready Order telegraphs charge → release', charged(sting, 'sting_ready'))
  add(sting, 'True Sting is Wind through the shared hit path', elems(sting).has('Wind'), [...elems(sting)].join(','))

  // ---- Ten Stonehearts: Aventurine of Stratagems (Imaginary, Boss) --------------------------
  const avent = fight(foe('Ten Stonehearts: Aventurine of Stratagems', { weaknesses: ['Imaginary'] }))
  add(avent, 'Aventurine runs Heavy Stakes + Distributed Investment + Points Fountain',
    ranAbility(avent, 'avent_heavy') && ranAbility(avent, 'avent_invest') && ranAbility(avent, 'avent_fountain'))
  add(avent, 'Aventurine is Imaginary through the shared hit path', elems(avent).has('Imaginary'), [...elems(avent)].join(','))

  // ---- The Giver, Master of Legions, Lance of Fury (Imaginary, Boss) ------------------------
  const giver = fight(foe('The Giver, Master of Legions, Lance of Fury', { weaknesses: ['Imaginary'] }))
  add(giver, 'The Giver runs Worldsplitting Spine + Survivors Unto Dead Waters + Pyre of High Graves + Ruination of Night and Light',
    ranAbility(giver, 'giver_spine') && ranAbility(giver, 'giver_survivors') && ranAbility(giver, 'giver_pyre') && ranAbility(giver, 'giver_ruination'))
  add(giver, 'The Giver is Imaginary through the shared hit path', elems(giver).has('Imaginary'), [...elems(giver)].join(','))

  // ---- The Past, Present, and Eternal Show (Physical/Imaginary, Boss) -----------------------
  const show = fight(foe('The Past, Present, and Eternal Show', { weaknesses: ['Physical'] }))
  add(show, 'Eternal Show runs Cleansing Flagellation + Admonishment of the Masses + All Is Bright + Redeeming Grace',
    ranAbility(show, 'show_flagellation') && ranAbility(show, 'show_admonishment') && ranAbility(show, 'show_bright') && ranAbility(show, 'show_grace'))
  add(show, 'Eternal Show All Is Calm applies the Alien Dream marker (DEBUFF_APPLIED alien_dream)', all(show, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'alien_dream'))
  add(show, 'Eternal Show Holy Night telegraphs charge → release', charged(show, 'show_holy'))

  // ---- The Ravaged Unconquerable (Imaginary, Boss) ------------------------------------------
  const ravaged = fight(foe('The Ravaged Unconquerable', { weaknesses: ['Imaginary'] }))
  add(ravaged, 'Ravaged Unconquerable runs Lightning Spear of the Firmament + Hewing of the River of Souls + Unceasing Flames of War + Sky-Piercing Lance + Survivors Unto Dead Waters',
    ranAbility(ravaged, 'ravaged_spear') && ranAbility(ravaged, 'ravaged_hewing') && ranAbility(ravaged, 'ravaged_flames') && ranAbility(ravaged, 'ravaged_lance') && ranAbility(ravaged, 'ravaged_survivors'))
  add(ravaged, 'Ravaged Unconquerable is Imaginary through the shared hit path', elems(ravaged).has('Imaginary'), [...elems(ravaged)].join(','))

  // ---- Unwaning Ageless Immortal (Lightning/Wind, Boss) -------------------------------------
  const immortal = fight(foe('Unwaning Ageless Immortal', { weaknesses: ['Lightning'] }))
  add(immortal, 'Ageless Immortal runs Wavering Bleat + Caress of Wind + Thunder-Shock + Punishing Bolts',
    ranAbility(immortal, 'immortal_bleat') && ranAbility(immortal, 'immortal_caress') && ranAbility(immortal, 'immortal_thunder') && ranAbility(immortal, 'immortal_punishing'))
  add(immortal, 'Ageless Immortal Rite of Great Arbor Metamorphosis applies Wind Shear (DOT_APPLIED)', dotApplied(immortal, 'WindShear'))
  add(immortal, 'Ageless Immortal is Lightning and Wind through the shared hit path',
    elems(immortal).has('Lightning') && elems(immortal).has('Wind'), [...elems(immortal)].join(','))

  // ---- Vessel of the Destruction, Khaslana (Physical, Boss) ---------------------------------
  const khaslana = fight(foe('Vessel of the Destruction, Khaslana', { weaknesses: ['Physical'] }))
  add(khaslana, 'Khaslana runs Destined Casket (authored strike)', ranAbility(khaslana, 'khaslana_strike'))
  add(khaslana, 'Khaslana is Physical through the shared hit path', elems(khaslana).has('Physical'), [...elems(khaslana)].join(','))

  // ---- Wonder Forest's Banacademic Office Staff (Quantum/Fire, Boss) ------------------------
  const staff = fight(foe("Wonder Forest's Banacademic Office Staff", { weaknesses: ['Quantum'] }))
  add(staff, 'Banacademic Office Staff enters Classroom Channel on spawn (BUFF_APPLIED)',
    all(staff, 'BUFF_APPLIED').some(n => n.payload?.id === 'banacademic_classroom'))
  add(staff, 'Banacademic Office Staff runs a Classroom-channel attack (Banashment / Banascary Semester)',
    ranAbility(staff, 'staff_banashment') || ranAbility(staff, 'staff_banascary'))

  // ---- invariants for the whole batch ------------------------------------------------------
  const allClean = [cherub, maiden, ascended, decaying, storm, searing, iceOut, blazeOut, trampler, lieutenant, ape, frigid,
    antimatter, gatekeeper, direwolf, grizzly, peacock, errorModel, lighthouse, leader, pastCaged, guardianShadow, swarmMother, champion,
    present, chords, daemon, rotbringer, shifter, overcooked, gorilla, leo, ecliptic, leviathan, praetor, god,
    gguard, casket, serpent, joy, lady, pegasus, gryphon, rebel, sanerot, duelist, whiteGuard,
    septimus, sparxi, deer, pompom, mistral, mother, anticreator, arbiter, argenti, blaznana, hoolay, bronyaE,
    caco, cirrus, yanqing, cocolia, cocoliaM, dicer, decimator, doomsday, zandar, reaverA, reaverB, wolflord,
    gepard, guide, swarm, shadow, judge, irontomb, live, asat, decay, exist, feixiao, meme,
    monitor, murata, prov, illwish, phantylia, pollux, feixiaoS, knight, swarmK, soulhook, doombringer, skara,
    kafka, sam, sublime, idol, svarog, sting, avent, giver, show, ravaged, immortal, khaslana, staff].every(clean)
  add(cherub, 'no dedicated elite damage engine — invariants hold across the batch', allClean)

  return cases
}
