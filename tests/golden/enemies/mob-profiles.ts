/**
 * §54 — behavioural regression for the first ordinary-enemy batch (`mob-profiles.ts`).
 *
 *  Each case launches the real enemy by display name and asserts a concrete outcome of its declared
 *  mechanics: stat debuffs, DoT application (incl. %MaxHP Bleed and stacked Wind Shear), team heal,
 *  War Armor lifecycle and the elemental hit identity — all through the shared pipeline. No bespoke
 *  enemy damage code is exercised; only the declarative ops.
 */
import { run, raw, all, chk, type Ctx } from '../../_helpers/battle'
import type { EnemySpec } from '../../../src/core/battle'
import { enemyDefenseOf } from '../../../src/core/enemy/defense'

const foe = (name: string, over: Partial<EnemySpec> = {}): EnemySpec =>
  ({ name, count: 1, hp: 5_000_000, spd: 220, level: 80, toughness: 0, weaknesses: ['Fire'], atk: 60, ...over })

const fight = (enemy: EnemySpec, cycles = 8, seed?: number): Ctx =>
  run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy, cycles, ...(seed !== undefined ? { seed } : {}) })

const chars = (b: Ctx) => b.sim.roster.filter(u => u.side === 'ally' && u.kind === 'char')
const hasDot = (b: Ctx, kind: string) => chars(b).some(c => c.dots.some(d => d.kind === kind))
const dotOf = (b: Ctx, kind: string) => chars(b).flatMap(c => c.dots).find(d => d.kind === kind)
const ranAbility = (b: Ctx, id: string) => all(b, 'ABILITY_USED').some(n => n.source === b.sim.roster.find(u => u.side === 'enemy')?.name && n.payload?.action === id)
const clean = (b: Ctx) => b.sim.logger.verify().length === 0

export default () => {
  const soldier = fight(foe('Silvermane Soldier'))
  const gunner = fight(foe('Silvermane Gunner'))
  const cannoneer = fight(foe('Silvermane Cannoneer'))
  const wind = fight(foe('Windspawn'))
  const thunder = fight(foe('Thunderspawn'))
  const mara = fight(foe('Mara-Struck Soldier'))
  const patroller = fight(foe('Cloud Knights Patroller'))
  const hound = fight(foe('Automaton Hound'))
  const furiae = fight(foe('Furiae Warrior'))
  const flame = fight(foe('Flamespawn'))
  const frost = fight(foe('Frostspawn'))
  const weaver = fight(foe('Imaginary Weaver'))
  const reaver = fight(foe('Voidranger: Reaver'))
  const disaster = fight(foe("Disaster's Right Hand"))
  const dawn = fight(foe("Dawn's Left Hand"))
  const everwinter = fight(foe('Everwinter Shadewalker'))
  const incineration = fight(foe('Incineration Shadewalker'))
  const jackhyena = fight(foe('Shadow Jackhyena'))
  const slacker = fight(foe('Assistant Graffiti: Slacker'))
  const rusher = fight(foe('Assistant Graffiti: Rusher'))
  const demander = fight(foe('Assistant Graffiti: Demander'))
  const dragonfish = fight(foe('Entranced Ingenium: Illumination Dragonfish'))
  const sentinel = fight(foe('Astropolis Sentinel'))
  const antibaryon = fight(foe('Antibaryon'))
  const baryon = fight(foe('Baryon'))
  const flyingsword = fight(foe('Flying Sword'))
  const gruntField = fight(foe('Grunt: Field Personnel'))
  const gruntSecurity = fight(foe('Grunt: Security Personnel'))
  const reading = fight(foe('Aggressive Reading Material'))
  const goldenHound = fight(foe('Abundance Sprite: Golden Hound'))
  const twigBlooms = fight(foe('Twig of Glorious Blooms'))
  const trashcan = fight(foe('Lordly Trashcan'))
  const vagrant = fight(foe('Vagrant'))
  const spiderWave = fight(foe('Automaton Spider', { count: 3 }))
  const dragonWave = fight(foe('Entranced Ingenium: Illumination Dragonfish', { count: 2 }))
  const goldenToad = fight(foe('Entranced Ingenium: Golden Cloud Toad'))
  const dracolion = fight(foe('Entranced Ingenium: Obedient Dracolion'))
  const birdskull = fight(foe("Dreamjolt Troupe's Birdskull"))
  const allseer = fight(foe('Memory Zone Meme "Allseer"'))
  const echofaded = fight(foe('Echo of Faded Dreams'))
  const ballistarius = fight(foe('Disciples of Sanctus Medicus: Ballistarius'))
  const iceEdge1 = fight(foe('Ice Edge (1)'))
  const iceEdge2 = fight(foe('Ice Edge (2)'))
  const lance1 = fight(foe('Lance of the Eternal Freeze (1)'))
  const lance2 = fight(foe('Lance of the Eternal Freeze (2)'))
  const pommy = fight(foe('"Alloy Pommy"'))
  const mask = fight(foe('Mask of No Thought'))
  const honored = fight(foe('"The Honored"'))
  const marple = fight(foe('Twig of Marple Leaf'))
  const bubbleWave = fight(foe("Dreamjolt Troupe's Bubble Hound", { count: 3 }))
  const philosopher = fight(foe('Furiae Philosopher'))
  const gnawSting = fight(foe('Gnaw Sting', { count: 2 }))
  const juvenileSting = fight(foe('Juvenile Sting', { count: 2 }))
  const servantTides = fight(foe('Servant of Tides', { count: 2 }))
  const mirageKidWave = fight(foe('Mirage Fizzle Kid', { count: 3 }))
  const speartip = fight(foe('"Speartip"', { count: 2 }))
  const abunLotus = fight(foe('Abundance Lotus'))
  const destrLotus = fight(foe('Destruction Lotus'))
  const springLoader = fight(foe("Dreamjolt Troupe's Spring Loader"))
  const alchemist = fight(foe('Disciples of Sanctus Medicus: Internal Alchemist'))
  const corrodedAxe = fight(foe("Black Tide's Corroded Axe"))
  const raven = fight(foe('Daythunder Raven'))

  // Batch 7 — Treasure Trotter family: countdown entities that flee through the shared `sim.flee`
  // path (FLEE event, `fled` flag, no DEATH / no kill attribution). Scared (2 own turns) trotters
  // tick twice; Run-state (1 own turn) trotters flee on their first own turn. Nothing deals damage.
  const sequenceTrotter = fight(foe('Sequence Trotter'))
  const trotTri = fight(foe('Trot Tri'))
  const warpTrotter = fight(foe('Warp Trotter'))
  const trotAbundance = fight(foe('Trotter of Abundance'))
  const trotDestruction = fight(foe('Trotter of Destruction'))
  const trotPreservation = fight(foe('Trotter of Preservation'))
  const trotDeuceBattle = fight(foe('Trot Deuce'))
  const trotPrimeBattle = fight(foe('Trot Prime'))

  // Batch 8 — Lock-On + self-cleanse + ally-target family.
  const distorter = fight(foe('Voidranger: Distorter'))
  const eliminator = fight(foe('Voidranger: Eliminator'))
  const beetle = fight(foe('Automaton Beetle'))
  const commerceWave = fight(foe('Commerce Trotter', { count: 2 }))
  const archer = fight(foe('Furiae Archer'))

  // Batch 9 — state-gated rotation, telegraph charge, AoE/blast strikers, death-shield.
  const warden = fight(foe('Mara-Struck Warden'))
  const decrepitBow = fight(foe("Black Tide's Decrepit Bow"))
  const tideBlade = fight(foe('Tide-Eroded Blade'))
  const mechatron = fight(foe('SD Civilian Mechatron'))
  const comediologistWave = fight(foe('Comediologist', { count: 2 }), 2)

  // Batch 10 — channel state machine + killing-blow reward + DoT striker.
  const fortunePipe = fight(foe("Dreamjolt Troupe's Fortune Seller", { hp: 1 }), 3)
  const fortuneReward = fight(foe("Dreamjolt Troupe's Fortune Seller", { count: 3 }), 2)
  const domescreen = fight(foe("Dreamjolt Troupe's Mr. Domescreen"), 4)
  const ternary = fight(foe('Ternary Assimilation Unit'), 4)
  const lupus = fight(foe('Abundance Sprite: Wooden Lupus'))

  // Batch 12 — Safeguard family: intact DMG reduction → break delay + post-break vulnerability.
  const claws = fight(foe('Planeshred Claws', { toughness: 20, weaknesses: ['Ice'] }), 6)
  const devourer = fight(foe('Nebula Devourer'), 3)
  const tail = fight(foe('Worldpurge Tail'), 3)
  const heartbreaker = fight(foe('Memory Zone Meme "Heartbreaker"', { toughness: 20, weaknesses: ['Ice'] }), 6)

  // Batch 13 — Banacademic Office advisor family (Classroom / Off-Class channel state machine).
  const assistanana = fight(foe("Banacademic Office's Assistanana"), 6)
  const dreamweaver = fight(foe("Banacademic Office's Dreamweaver BananAdvisor"), 6)
  const fortuneAdvisor = fight(foe("Banacademic Office's Fortune BananAdvisor"), 6)
  // seed pinned (not the suite default 7): the enemy's `banalesson_slow` debuff op now correctly
  // faces Natasha's +18% Effect RES trace (applyDebuff honours `effRes` buff mods), which shifts
  // this shared-RNG battle's stream — seed 1 lands the full Banashment (Fire hit + Burn + Holiday).
  const charmony = fight(foe("Banacademic Office's Charmony BananAdvisor"), 6, 1)

  // Batch 14 — Wolftrooper pack: shared "Moon Rage / Bloodlust" accumulator across two capable names.
  const wolfPack = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Eclipse Wolftrooper'), foe('Sableclaw Wolftrooper')]], cycles: 8 })

  // Batch 15 — charge/support, Reverberation, Ice death-rattle, War-Armor buffer.
  const winderGoon = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe("Dreamjolt Troupe's Winder Goon"), foe("Dreamjolt Troupe's Winder Goon")]], cycles: 6 })
  const wraithWarden = fight(foe('Wraith Warden', { count: 3 }), 8)
  const mermaidPack = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Hallucinogenic Mermaid', { hp: 400 }), foe('Wraith Warden')]], cycles: 8 })
  const furiaeTroupe = fight(foe('Furiae Troupe'), 6)

  // Batch 16 — rotation, charge death-rattle, spawn/adjacent marker, elite Safeguard.
  const longSorrow = fight(foe('The Long Arms of Sorrow'), 6)
  const lesserSting = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Lesser Sting'), foe('Wraith Warden')]], cycles: 6 })
  const ichorCanine = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Wraith Warden'), foe('Ichor Memosprite: Canine')]], cycles: 6 })
  const shellRage = fight(foe('Memory Zone Meme "Shell of Faded Rage"', { toughness: 120, weaknesses: ['Quantum'] }), 6)

  // Batch 17 — Illusion variants, support/redirect markers, death-state family.
  const iceEdgeIllusion = fight(foe('Ice Edge (Illusion) (1)'), 4)
  const lanceIllusion = fight(foe('Lance of the Eternal Freeze (Illusion) (1)'), 4)
  const iceEdgeIllusion2 = fight(foe('Ice Edge (Illusion) (2)'), 4)
  const lanceIllusion2 = fight(foe('Lance of the Eternal Freeze (Illusion) (2)'), 4)
  const meteoricEagle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Meteoric Eagle'), foe('Wraith Warden')]], cycles: 6 })
  const pheasantPack = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Ichor Memosprite: Pheasant'), foe('Ichor Memosprite: Pheasant')]], cycles: 6 })
  const securityDoggo = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Security Doggo'), foe('Wraith Warden')]], cycles: 6 })
  const magicalGirl = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Magical Girl Troupe (Enemy)', { hp: 400 })]], cycles: 8 })

  // Batch 18 — arena/Khaslana adds, elemental status, support-marker family.
  const shadowHatred = fight(foe('Shadow of "Hatred"'), 4)
  const twigWintry = fight(foe('Twig of Wintry Wind'), 4)
  const furboJournalist = fight(foe('Furbo Journalist'), 4)
  const illwishLotus = fight(foe('Illwish Lotus'), 4)
  const autoWand = fight(foe('Autonomous Wand'), 6)
  const vanityMeme = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: [[foe('Memory Zone Meme "Insatiable Vanity"'), foe('Wraith Warden')]], cycles: 6 })
  const driedBone = fight(foe('Dried Lacrimal Bone'), 4)
  const ethmoidBone = fight(foe('Languid Ethmoid Bone'), 4)

  // Batch 19 — state/resource supports, sub-field ports, summon adds.
  const blackTideCouncil = fight(foe('Black Tide Council'), 6)
  const robotArm = fight(foe('Auxiliary Robot Arm Unit'), 6)
  const theShield = fight(foe('"The Shield"'), 4)
  const longVessel = fight(foe('Long-Shattered Vessel'), 4)
  const lavishFruits = fight(foe('Twig of Lavish Fruits'), 6)
  const shootEyes = fight(foe('Shoot of Hundred Eyes'), 4)
  const twigEyes = fight(foe('Twig of Hundred Eyes'), 4)
  const outputPort1 = fight(foe('Output Port 1'), 4)
  const outputPort2 = fight(foe('Output Port 2'), 4)

  // Batch 20 — final ordinary mobs (Talent-only / special-state residuals).
  const allOrNothing = fight(foe('"All or Nothing"'), 4)
  const allOrNothingDF = fight(foe('"All or Nothing: Double Fortune"'), 4)
  const bartholos = fight(foe('"Spirithief" Bartholos'), 4)
  const conquerConquered = fight(foe('Conquer or Be Conquered'), 4)
  const imprisonedMythos = fight(foe('Imprisoned Mythos'), 6)
  const manipulatedLogos = fight(foe('Manipulated Logos'), 6)
  const mirrorMeme = fight(foe('Memory Zone Meme "Something In The Mirror"'), 4)
  const sombrous = fight(foe('Sombrous Sepulcher'), 4)
  const theConquered = fight(foe('The Conquered'), 4)

  // --- on-killing-blow (death-rattle) checks exercise the real Lifecycle.kill path --------------
  const killerOf = (b: Ctx) => b.sim.roster.find(u => u.side === 'ally')!

  // Mara Rejuvenate: a killing blow restores 50% Max HP (revive), and only once per battle.
  const maraUnit = mara.sim.roster.find(u => u.side === 'enemy')!
  maraUnit.hp = 1
  mara.sim.kill(killerOf(mara), maraUnit)
  const maraRevived = !maraUnit.dead && maraUnit.hp > 0 && maraUnit.hp <= Math.floor(maraUnit.maxHp * 0.5)
  mara.sim.kill(killerOf(mara), maraUnit)
  const maraSecondBlowFatal = maraUnit.dead === true

  // Automaton Spider "Chains of Destruction": a killing blow hits the ADJACENT friendly units.
  const spiders = spiderWave.sim.roster.filter(u => u.side === 'enemy')
  const spiderBefore = spiders.map(s => s.hp)
  spiderWave.sim.kill(killerOf(spiderWave), spiders[1]!)
  const spiderNeighboursBurned = spiders[0]!.hp < spiderBefore[0]! && spiders[2]!.hp < spiderBefore[2]!

  // Illumination Dragonfish "Candle Flame": a killing blow hits + DEF-downs ALL friendly units.
  const dragons = dragonWave.sim.roster.filter(u => u.side === 'enemy')
  const dragonOtherBefore = dragons[1]!.hp
  dragonWave.sim.kill(killerOf(dragonWave), dragons[0]!)
  const candleDamaged = dragons[1]!.hp < dragonOtherBefore
  const candleDebuffed = dragons[1]!.buffs.some(x => x.id === 'dragonfish_candle_defdown')

  // Lesser Sting "Entomon Eulogy": a killing blow hits ALL friendly units + a DMG-taken debuff.
  const stingUnits = lesserSting.sim.roster.filter(u => u.side === 'enemy')
  lesserSting.sim.kill(killerOf(lesserSting), stingUnits[0]!)
  const stingRattled = stingUnits[1]!.buffs.some(x => x.id === 'sting_vuln')

  // Ichor Memosprite: Canine "Hemotort Entrustment": a killing blow passes the Stain to an ADJACENT ally.
  const ichorUnits = ichorCanine.sim.roster.filter(u => u.side === 'enemy')
  ichorCanine.sim.kill(killerOf(ichorCanine), ichorUnits[1]!)
  const canineStainPassed = ichorUnits[0]!.buffs.some(x => x.id === 'canine_stain')

  // Memory Zone Meme "Insatiable Vanity": a killing blow dispels Deception's Crown from its holder.
  const vanityUnit = vanityMeme.sim.roster.find(u => u.side === 'enemy' && u.name.includes('Insatiable'))!
  vanityUnit.hp = 1
  vanityMeme.sim.kill(killerOf(vanityMeme), vanityUnit)
  const crownCleared = !vanityMeme.sim.roster.some(u => u.buffs.some(x => x.id === 'deception_crown'))

  // Batch 20 — Imprisoned Mythos / Manipulated Logos "Immortal": a killing blow enters Grave Wound →
  // revives instead of dying (so the unit survives). "Spirithief" Bartholos buffs the player team on
  // death; "All or Nothing: Double Fortune" leaves the battle on its own turn (FLEE).
  const mythosUnit = imprisonedMythos.sim.roster.find(u => u.side === 'enemy')!
  mythosUnit.hp = 1
  imprisonedMythos.sim.kill(killerOf(imprisonedMythos), mythosUnit)
  const mythosImmortal = !mythosUnit.dead

  const logosUnit = manipulatedLogos.sim.roster.find(u => u.side === 'enemy')!
  logosUnit.hp = 1
  manipulatedLogos.sim.kill(killerOf(manipulatedLogos), logosUnit)
  const logosImmortal = !logosUnit.dead

  const barthUnit = bartholos.sim.roster.find(u => u.side === 'enemy')!
  barthUnit.hp = 1
  bartholos.sim.kill(killerOf(bartholos), barthUnit)
  const barthBoostsTeam = bartholos.buffLog.some(e => e.id === 'barth_dmgup')

  return [
    chk('54 mob: Silvermane Soldier applies DEF down', soldier, { assert: 'buff', id: 'soldier_defdown' }),
    chk('54 mob: Soldier DEF-down mod is -50% DEF', soldier, { assert: 'buffStat', id: 'soldier_defdown', stat: 'defRed', value: 0.5 }),
    raw('54 mob: Silvermane Gunner applies %MaxHP Bleed', hasDot(gunner, 'Bleed') && (dotOf(gunner, 'Bleed')?.baseDmg ?? 0) > 0, `bleed base=${dotOf(gunner, 'Bleed')?.baseDmg}`),
    raw('54 mob: Windspawn applies Wind Shear', hasDot(wind, 'WindShear'), `wind shear=${hasDot(wind, 'WindShear')}`),
    raw('54 mob: Thunderspawn applies Shock', hasDot(thunder, 'Shock'), `shock=${hasDot(thunder, 'Shock')}`),
    raw('54 mob: Mara-Struck Soldier applies a 2-stack Wind Shear', (dotOf(mara, 'WindShear')?.stacks ?? 0) >= 2, `stacks=${dotOf(mara, 'WindShear')?.stacks}`),
    chk('54 mob: Cloud Knights Patroller applies +DMG taken', patroller, { assert: 'buff', id: 'ckp_vuln' }),
    raw('54 mob: Automaton Hound team-heals through the shared heal path', all(hound, 'HEAL_APPLIED').length > 0, `${all(hound, 'HEAL_APPLIED').length} heal events`),
    chk('54 mob: Furiae Warrior carries War Armor', furiae, { assert: 'buff', id: 'warArmor' }),
    raw('54 mob: Furiae War Armor shatters under attacks and is restored', furiae.buffLog.some(e => e.id === 'warArmorBroken') && furiae.buffLog.filter(e => e.id === 'warArmor').length >= 2, `armor=${furiae.buffLog.filter(e => e.id === 'warArmor').length} broken=${furiae.buffLog.some(e => e.id === 'warArmorBroken')}`),
    raw('54 mob: Flamespawn hits with Fire', all(flame, 'HIT_START').some(n => n.element === 'Fire'), 'fire'),
    raw('54 mob: Frostspawn hits with Ice', all(frost, 'HIT_START').some(n => n.element === 'Ice'), 'ice'),
    raw('54 mob: Imaginary Weaver has a Blast ability', all(weaver, 'DAMAGE_DEALT').length > 0, `${all(weaver, 'DAMAGE_DEALT').length} dmg`),
    raw('54 mob: Voidranger: Reaver rotates single + Blast', ranAbility(reaver, 'reaver_blade') && ranAbility(reaver, 'reaver_vortex'), 'reaver rotation'),
    raw('54 mob: Disaster\'s Right Hand runs its AoE rotation', ranAbility(disaster, 'disaster_cuts') && ranAbility(disaster, 'disaster_tyranny'), 'disaster rotation'),
    raw('54 mob: Dawn\'s Left Hand uses its Entanglement strike', ranAbility(dawn, 'dawn_visit'), 'dawn visit'),
    raw('54 mob: Everwinter Shadewalker delays its target', all(everwinter, 'ACTION_DELAY').length > 0, `${all(everwinter, 'ACTION_DELAY').length} delay`),
    raw('54 mob: Incineration Shadewalker applies Burn', hasDot(incineration, 'Burn'), `burn=${hasDot(incineration, 'Burn')}`),
    raw('54 mob: Shadow Jackhyena applies Shock', hasDot(jackhyena, 'Shock'), `shock=${hasDot(jackhyena, 'Shock')}`),
    chk('54 mob: Assistant Graffiti: Slacker applies +DMG taken', slacker, { assert: 'buff', id: 'graffiti_vuln' }),
    raw('54 mob: Assistant Graffiti: Rusher applies Wind Shear', hasDot(rusher, 'WindShear'), `wind shear=${hasDot(rusher, 'WindShear')}`),
    raw('54 mob: Assistant Graffiti: Demander applies Shock', hasDot(demander, 'Shock'), `shock=${hasDot(demander, 'Shock')}`),
    chk('54 mob: Illumination Dragonfish applies DEF down', dragonfish, { assert: 'buff', id: 'dragonfish_defdown' }),
    raw('54 mob: Astropolis Sentinel runs its 2-step rotation', ranAbility(sentinel, 'astropolis_descends') && ranAbility(sentinel, 'astropolis_justice'), 'sentinel rotation'),
    raw('54 mob: plain element strikers deal damage', [antibaryon, baryon, flyingsword, gruntField, reading].every(b => all(b, 'DAMAGE_DEALT').length > 0), 'strikers'),
    raw('54 mob: Mara-Struck Soldier Rejuvenate revives at 50% Max HP on a killing blow', maraRevived, `revived=${maraRevived} hp=${maraUnit.hp}`),
    raw('54 mob: Rejuvenate triggers only once per battle (second killing blow is fatal)', maraSecondBlowFatal, `dead=${maraUnit.dead}`),
    raw('54 mob: Automaton Spider Chains of Destruction burns the adjacent friendly units', spiderNeighboursBurned, `hp ${spiderBefore.map((h, i) => h + '->' + spiders[i]!.hp).join(', ')}`),
    raw('54 mob: Golden Hound + Trashcan + Vagrant strike for damage', [goldenHound, trashcan, vagrant].every(b => all(b, 'DAMAGE_DEALT').length > 0), 'strikers'),
    raw('54 mob: Twig of Glorious Blooms heals its allies (shared heal path)', all(twigBlooms, 'HEAL_APPLIED').length > 0, `${all(twigBlooms, 'HEAL_APPLIED').length} heal events`),
  raw('54 mob: Illumination Dragonfish Candle Flame damages all friendly units on a killing blow', candleDamaged, `hp ${dragonOtherBefore}->${dragons[1]!.hp}`),
  raw('54 mob: Candle Flame applies the 30% DEF-down to its allies', candleDebuffed, `debuff=${candleDebuffed}`),

  // --- Batch 4 ---------------------------------------------------------------------------------
  chk('54 mob: Golden Cloud Toad applies SPD down', goldenToad, { assert: 'buff', id: 'goldentoad_spddown' }),
  chk('54 mob: Obedient Dracolion applies Weaken', dracolion, { assert: 'buff', id: 'dracolion_weaken' }),
  raw('54 mob: Dreamjolt Troupe\'s Birdskull applies %MaxHP Bleed', hasDot(birdskull, 'Bleed') && (dotOf(birdskull, 'Bleed')?.baseDmg ?? 0) > 0, `bleed base=${dotOf(birdskull, 'Bleed')?.baseDmg}`),
  raw('54 mob: Memory Zone Meme "Allseer" delays its target', all(allseer, 'ACTION_DELAY').length > 0, `${all(allseer, 'ACTION_DELAY').length} delay`),
  raw('54 mob: Echo of Faded Dreams delays its target', all(echofaded, 'ACTION_DELAY').length > 0, `${all(echofaded, 'ACTION_DELAY').length} delay`),
  raw('54 mob: Ballistarius fires a Lightning bolt (bounce)', ranAbility(ballistarius, 'ballistarius_crossbow') && all(ballistarius, 'HIT_START').some(n => n.element === 'Lightning'), 'lightning bounce'),
  raw('54 mob: Ice Edge runs its Ice AoE', [iceEdge1, iceEdge2].every(b => all(b, 'HIT_START').some(n => n.element === 'Ice')), 'ice aoe'),
  raw('54 mob: Lance of the Eternal Freeze runs its Ice AoE', [lance1, lance2].every(b => all(b, 'HIT_START').some(n => n.element === 'Ice')), 'ice aoe'),
  raw('54 mob: Alloy Pommy rotates Housecleaning + impair', ranAbility(pommy, 'pommy_housecleaning') && ranAbility(pommy, 'pommy_dirtwater'), 'pommy rotation'),
  chk('54 mob: Alloy Pommy impair applies 50% DEF down', pommy, { assert: 'buffStat', id: 'pommy_defdown', stat: 'defRed', value: 0.5 }),
  raw('54 mob: Mask of No Thought rotates beam + charge', ranAbility(mask, 'mask_beam') && ranAbility(mask, 'mask_charge'), 'mask rotation'),
  chk('54 mob: Mask of No Thought buffs its allies ATK', mask, { assert: 'buff', id: 'mask_atkup' }),
  chk('54 mob: The Honored buffs its allies DMG', honored, { assert: 'buff', id: 'honored_dmgup' }),
  raw('54 mob: Twig of Marple Leaf counters with Leaf Hinging (Lightning)', all(marple, 'HIT_START').some(n => n.element === 'Lightning'), 'counter lightning'),
  chk('54 mob: Twig of Marple Leaf buffs its allies ATK', marple, { assert: 'buff', id: 'marple_atkup' }),

  // Mask of No Thought: on a killing blow the player team's Energy is regenerated (15).
  (() => {
    const maskUnit = mask.sim.roster.find(u => u.side === 'enemy')!
    const maskAlly = mask.sim.roster.find(u => u.side === 'ally' && u.kind === 'char')!
    const before = maskAlly.energy
    mask.sim.kill(maskAlly, maskUnit)
    return raw('54 mob: Mask of No Thought killing blow regenerates the allies Energy', maskAlly.energy > before, `energy ${before}->${maskAlly.energy}`)
  })(),
  // The Honored: on a killing blow the attacker is granted DMG +20% (3 Turns).
  (() => {
    const honoredUnit = honored.sim.roster.find(u => u.side === 'enemy')!
    const killer = honored.sim.roster.find(u => u.side === 'ally' && u.kind === 'char')!
    honored.sim.kill(killer, honoredUnit)
    return raw('54 mob: The Honored killing blow buffs the attacker', killer.buffs.some(b => b.id === 'honored_stone'), 'honored_stone')
  })(),

  // --- Batch 5 (death-rattle) ------------------------------------------------------------------
  raw('54 mob: Bubble Hound strikes for damage', all(bubbleWave, 'DAMAGE_DEALT').length > 0, `${all(bubbleWave, 'DAMAGE_DEALT').length} dmg`),
  chk('54 mob: Bubble Hound gains SoulGlad Revel when attacked', bubbleWave, { assert: 'buff', id: 'bubblehound_revel' }),
  chk('54 mob: Furiae Philosopher carries War Armor', philosopher, { assert: 'buff', id: 'warArmor' }),
  raw('54 mob: Furiae Philosopher rotates Just War + Father of All', ranAbility(philosopher, 'philosopher_justwar') && ranAbility(philosopher, 'philosopher_father'), 'philosopher rotation'),
  chk('54 mob: Furiae Philosopher Just War buffs its allies SPD', philosopher, { assert: 'buff', id: 'philosopher_justwar_buff' }),
  raw('54 mob: Gnaw Sting strikes with Quantum', all(gnawSting, 'HIT_START').some(n => n.element === 'Quantum'), 'quantum'),
  raw('54 mob: Juvenile Sting applies Wind Shear', hasDot(juvenileSting, 'WindShear'), `wind shear=${hasDot(juvenileSting, 'WindShear')}`),
  raw('54 mob: Servant of Tides runs its Ice AoE', all(servantTides, 'HIT_START').some(n => n.element === 'Ice'), 'ice aoe'),
  raw('54 mob: Mirage Fizzle Kid strikes for damage', all(mirageKidWave, 'DAMAGE_DEALT').length > 0, `${all(mirageKidWave, 'DAMAGE_DEALT').length} dmg`),
  raw('54 mob: "Speartip" runs its Physical AoE', all(speartip, 'HIT_START').some(n => n.element === 'Physical'), 'physical aoe'),

  // Bubble Hound "Libation of Sweetness": a killing blow hits the ADJACENT friendly units, grants
  // them +30% SPD and a Bleed.
  (() => {
    const hounds = bubbleWave.sim.roster.filter(u => u.side === 'enemy')
    const before = hounds.map(h => h.hp)
    bubbleWave.sim.kill(killerOf(bubbleWave), hounds[1]!)
    const damaged = hounds[0]!.hp < before[0]! && hounds[2]!.hp < before[2]!
    const spd = hounds[0]!.buffs.some(b => b.id === 'bubblehound_spdup')
    const bleed = hounds[0]!.dots.some(d => d.kind === 'Bleed')
    return raw('54 mob: Bubble Hound Libation rattles the adjacent friendly units (DMG/SPD/Bleed)', damaged && spd && bleed, `damaged=${damaged} spd=${spd} bleed=${bleed}`)
  })(),
  // Furiae Philosopher "Proselytize": a killing blow grants the attacker SPD +30% and DMG +30%.
  (() => {
    const unit = philosopher.sim.roster.find(u => u.side === 'enemy')!
    const killer = philosopher.sim.roster.find(u => u.side === 'ally' && u.kind === 'char')!
    philosopher.sim.kill(killer, unit)
    return raw('54 mob: Furiae Philosopher killing blow buffs the attacker', killer.buffs.some(b => b.id === 'philosopher_spdup') && killer.buffs.some(b => b.id === 'philosopher_dmgup'), 'philosopher kill buffs')
  })(),
  // Gnaw Sting "Decay Eulogy": a killing blow hits + increases DMG taken on ALL friendly units.
  (() => {
    const stings = gnawSting.sim.roster.filter(u => u.side === 'enemy')
    const otherBefore = stings[1]!.hp
    gnawSting.sim.kill(killerOf(gnawSting), stings[0]!)
    const damaged = stings[1]!.hp < otherBefore
    const vuln = stings[1]!.buffs.some(b => b.id === 'gnawsting_vuln')
    return raw('54 mob: Gnaw Sting Decay Eulogy rattles its allies (DMG + DMG-taken)', damaged && vuln, `damaged=${damaged} vuln=${vuln}`)
  })(),
  // Juvenile Sting "Entomon Eulogy": a killing blow hits + increases DMG taken on ALL friendly units.
  (() => {
    const stings = juvenileSting.sim.roster.filter(u => u.side === 'enemy')
    const otherBefore = stings[1]!.hp
    juvenileSting.sim.kill(killerOf(juvenileSting), stings[0]!)
    const damaged = stings[1]!.hp < otherBefore
    const vuln = stings[1]!.buffs.some(b => b.id === 'juvenile_vuln')
    return raw('54 mob: Juvenile Sting Entomon Eulogy rattles its allies (DMG + DMG-taken)', damaged && vuln, `damaged=${damaged} vuln=${vuln}`)
  })(),
  // Servant of Tides: a killing blow hits ALL friendly units.
  (() => {
    const tides = servantTides.sim.roster.filter(u => u.side === 'enemy')
    const otherBefore = tides[1]!.hp
    servantTides.sim.kill(killerOf(servantTides), tides[0]!)
    return raw('54 mob: Servant of Tides killing blow hits its allies', tides[1]!.hp < otherBefore, `hp ${otherBefore}->${tides[1]!.hp}`)
  })(),
  // Mirage Fizzle Kid: a killing blow hits the ADJACENT friendly units.
  (() => {
    const kids = mirageKidWave.sim.roster.filter(u => u.side === 'enemy')
    const before = kids.map(k => k.hp)
    mirageKidWave.sim.kill(killerOf(mirageKidWave), kids[1]!)
    return raw('54 mob: Mirage Fizzle Kid killing blow hits the adjacent friendly units', kids[0]!.hp < before[0]! && kids[2]!.hp < before[2]!, `hp ${before.map((h, i) => h + '->' + kids[i]!.hp).join(', ')}`)
  })(),
  // "Speartip" "Amor of Destined Death": a killing blow hits ALL friendly units.
  (() => {
    const tips = speartip.sim.roster.filter(u => u.side === 'enemy')
    const otherBefore = tips[1]!.hp
    speartip.sim.kill(killerOf(speartip), tips[0]!)
    return raw('54 mob: "Speartip" killing blow hits its allies', tips[1]!.hp < otherBefore, `hp ${otherBefore}->${tips[1]!.hp}`)
  })(),

  // --- Batch 6 (lotus family + `sp` op) --------------------------------------------------------
  raw('54 mob: Abundance Lotus drains Skill Points (Samsara)', ranAbility(abunLotus, 'lotus_samsara') && all(abunLotus, 'SP_LOSS').some(n => (n.source ?? '').startsWith('Abundance Lotus')), 'samsara'),
  raw('54 mob: Abundance Lotus heals itself at turn start (Mend)', all(abunLotus, 'HEAL_APPLIED').some(n => (n.target ?? '').startsWith('Abundance Lotus')), all(abunLotus, 'HEAL_APPLIED').map(n => n.target).join(',')),
  chk('54 mob: Destruction Lotus applies Prana-Siphon', destrLotus, { assert: 'buff', id: 'lotus_pranasiphon' }),
  chk('54 mob: Prana-Siphon reduces incoming healing by 40%', destrLotus, { assert: 'buffStat', id: 'lotus_pranasiphon', stat: 'inHeal', value: -0.4 }),
  raw('54 mob: Dreamjolt Spring Loader strikes Physical', ranAbility(springLoader, 'springloader_throwdie') && all(springLoader, 'HIT_START').some(n => n.element === 'Physical'), 'springloader'),
  chk('54 mob: Dreamjolt Spring Loader reduces the target\'s Effect RES', springLoader, { assert: 'buff', id: 'springloader_effres' }),
  chk('54 mob: Spring Loader Effect RES reduction is −20%', springLoader, { assert: 'buffStat', id: 'springloader_effres', stat: 'effRes', value: -0.2 }),
  chk('54 mob: Internal Alchemist marks with Spur of Thunderwoe', alchemist, { assert: 'buff', id: 'spur_thunderwoe' }),
  raw('54 mob: Internal Alchemist rotates Seeding Core + Thundering Reign', ranAbility(alchemist, 'alchemist_seed') && ranAbility(alchemist, 'alchemist_reign'), 'alchemist rotation'),
  raw('54 mob: Black Tide\'s Corroded Axe strikes Fire', all(corrodedAxe, 'HIT_START').some(n => n.element === 'Fire'), 'fire'),
  raw('54 mob: Daythunder Raven strikes Lightning', all(raven, 'HIT_START').some(n => n.element === 'Lightning'), 'lightning'),

  // Abundance Lotus "Moksha" + "Non-Destructing": a killing blow restores Skill Points and regains
  // team Energy.
  (() => {
    const unit = abunLotus.sim.roster.find(u => u.side === 'enemy')!
    const ally = abunLotus.sim.roster.find(u => u.side === 'ally' && u.kind === 'char')!
    abunLotus.sim.gainSp(-3)
    const spBefore = abunLotus.sim.sp()
    ally.energy = 0
    abunLotus.sim.kill(killerOf(abunLotus), unit)
    return raw('54 mob: Abundance Lotus killing blow restores SP and team Energy', abunLotus.sim.sp() > spBefore && ally.energy > 0, `sp ${spBefore}->${abunLotus.sim.sp()} energy 0->${ally.energy}`)
  })(),
  // Internal Alchemist "Core Rupture": a killing blow hits every marked target and clears the mark.
  (() => {
    const marked = alchemist.sim.roster.filter(u => u.side === 'ally' && u.buffs.some(b => b.id === 'spur_thunderwoe'))
    const ruptures = (): number => alchemist.sim.logger.events.filter(e => e.type === 'DAMAGE_DEALT' && e.payload?.label === 'Core Rupture').length
    const before = ruptures()
    alchemist.sim.kill(killerOf(alchemist), alchemist.sim.roster.find(u => u.side === 'enemy')!)
    const landed = ruptures()
    const cleared = marked.every(m => !m.buffs.some(b => b.id === 'spur_thunderwoe'))
    return raw('54 mob: Internal Alchemist Core Rupture hits + clears marked targets', marked.length > 0 && landed >= marked.length && cleared, `marked=${marked.length} ruptures ${before}->${landed} cleared=${cleared}`)
  })(),

  // --- Batch 7 (Treasure Trotter family via `sim.flee`) ----------------------------------------
  ...((() => {
    const troop: Array<[string, Ctx]> = [
      ['Sequence Trotter', sequenceTrotter], ['Trot Tri', trotTri], ['Warp Trotter', warpTrotter],
      ['Trotter of Abundance', trotAbundance], ['Trotter of Destruction', trotDestruction],
      ['Trotter of Preservation', trotPreservation], ['Trot Deuce', trotDeuceBattle], ['Trot Prime', trotPrimeBattle],
    ]
    const fled = (b: Ctx) => !!b.sim.roster.find(u => u.side === 'enemy' && u.fled)
    const untouched = (b: Ctx) => chars(b).every(c => c.hp === c.maxHp)
    const rows: Array<ReturnType<typeof raw>> = []
    for (const [name, b] of troop)
      rows.push(raw(`54 mob: ${name} panics into the night — one FLEE, 'fled' flag, no DEATH, no damage dealt`,
        all(b, 'FLEE').length === 1 && fled(b) && all(b, 'DEATH').length === 0 && untouched(b),
        `FLEE=${all(b, 'FLEE').length} DEATH=${all(b, 'DEATH').length}`))
    return rows
  }))(),

  raw('54 mob: no invariant violations across the batch',
      [soldier, gunner, wind, thunder, mara, patroller, hound, furiae, flame, frost, weaver, reaver, disaster, dawn,
        everwinter, incineration, jackhyena, slacker, rusher, demander, dragonfish, sentinel, antibaryon, baryon, flyingsword, gruntField, reading,
        goldenHound, twigBlooms, trashcan, vagrant, spiderWave, dragonWave,
        goldenToad, dracolion, birdskull, allseer, echofaded, ballistarius, iceEdge1, iceEdge2, lance1, lance2, pommy, mask, honored, marple,
        bubbleWave, philosopher, gnawSting, juvenileSting, servantTides, mirageKidWave, speartip,
        abunLotus, destrLotus, springLoader, alchemist, corrodedAxe, raven,
        sequenceTrotter, trotTri, warpTrotter, trotAbundance, trotDestruction, trotPreservation, trotDeuceBattle, trotPrimeBattle,
        distorter, eliminator, beetle, commerceWave, archer,
        warden, decrepitBow, tideBlade, mechatron, comediologistWave,
        fortunePipe, fortuneReward, domescreen, ternary, lupus, wolfPack,
        winderGoon, wraithWarden, mermaidPack, furiaeTroupe,
        longSorrow, lesserSting, ichorCanine, shellRage,
        iceEdgeIllusion, lanceIllusion, meteoricEagle, pheasantPack, securityDoggo, magicalGirl,
        shadowHatred, twigWintry, furboJournalist, illwishLotus, autoWand, vanityMeme, driedBone, ethmoidBone,
        blackTideCouncil, robotArm, theShield, longVessel, lavishFruits, shootEyes, twigEyes, outputPort1, outputPort2,
        allOrNothing, allOrNothingDF, bartholos, conquerConquered, imprisonedMythos, manipulatedLogos, mirrorMeme, sombrous, theConquered].every(clean),
      'invariants'),

  // --- Batch 8 (Lock-On, self-cleanse, ally-target, War Armor 3) --------------------------------
  // Lock-On: the pinned char takes the vulnerability debuff and every enemy's single-target picks
  // are forced onto it (TARGET_SELECTED rule 'forced'). The strike itself then targets the pin.
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const lockEv = distorter.sim.logger.events.find(e => e.type === 'DEBUFF_APPLIED' && e.payload?.id === 'enemy_lockon')
    const pinned = lockEv?.payload?.targetId
    const forcedOnPin = distorter.sim.logger.events.filter(e => e.type === 'TARGET_SELECTED' && e.payload?.rule === 'forced' && (e.payload?.targetIds as string[])?.includes(pinned as string))
    const isVuln = distorter.sim.allies('ally').some(c => c.id === pinned && c.buffs.some(b => b.id === 'enemy_lockon' && b.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.1) < 1e-9)))
    rows.push(raw('54 mob: Distorter Lock-On pins one char (Vuln +10%) and forces enemy picks onto them',
      ranAbility(distorter, 'distorter_lock') && ranAbility(distorter, 'distorter_strike') && !!pinned && forcedOnPin.length > 0,
      `locked=${pinned ?? 'none'} forced=${forcedOnPin.length} vuln=${isVuln}`))
    return rows
  }))(),
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const overload = (b: Ctx) => b.sim.logger.events.some(e => e.type === 'BUFF_APPLIED' && e.payload?.id === 'eliminator_overloaded')
    const shed = (b: Ctx) => b.sim.logger.events.some(e => e.type === 'NOTE' && /sheds its Overloaded/.test(e.raw ?? ''))
    rows.push(raw('54 mob: Eliminator Overloads after Void Cannon and then sheds it with Thermal Barrier',
      ranAbility(eliminator, 'eliminator_cannon') && ranAbility(eliminator, 'eliminator_barrier') && overload(eliminator) && shed(eliminator),
      `cannon=${ranAbility(eliminator, 'eliminator_cannon')} barrier=${ranAbility(eliminator, 'eliminator_barrier')} overload=${overload(eliminator)} shed=${shed(eliminator)}`))
    return rows
  }))(),
  raw('54 mob: Automaton Beetle shields its side (SHIELD_APPLIED) and strikes Physical',
    ranAbility(beetle, 'beetle_forcefield') && all(beetle, 'SHIELD_APPLIED').length > 0 && all(beetle, 'HIT_START').some(n => n.element === 'Physical'),
    `shield=${all(beetle, 'SHIELD_APPLIED').length} phys=${all(beetle, 'HIT_START').some(n => n.element === 'Physical')}`),
  raw('54 mob: Commerce Trotter buffs a FRIENDLY unit\'s SPD when attacked (Entrepreneurial Spirit)',
    commerceWave.sim.logger.events.some(e => e.type === 'BUFF_APPLIED' && e.payload?.id === 'commerce_spd' && e.source !== e.target),
    'spd-buff'),
  raw('54 mob: Furiae Archer carries War Armor 3 that breaks under attacks (30% shatter, delay)',
    archer.buffLog.some(e => e.id === 'warArmor' && e.maxStacks === 3) && archer.buffLog.some(e => e.id === 'warArmorBroken'),
    archer.buffLog.filter(e => e.id === 'warArmorBroken').length > 0 ? 'broken' : 'kept'),
  raw('54 mob: Furiae Archer Barrage lands Lightning hits (Weeping Arrow)',
    ranAbility(archer, 'archer_weeping') && all(archer, 'HIT_START').filter(n => n.element === 'Lightning').length >= 5,
    `lightning=${all(archer, 'HIT_START').filter(n => n.element === 'Lightning').length}`),

  // --- Batch 9 (state-gated rotation, telegraph charge, AoE/blast strikers, death-shield) --------
  raw('54 mob: Mara-Struck Warden starts Maddened and uses only Sawing Evil: Sever',
    warden.buffLog.some(e => e.id === 'mara_maddening') && ranAbility(warden, 'warden_sever') && all(warden, 'HIT_START').some(n => n.element === 'Wind'),
    `maddened=${warden.buffLog.some(e => e.id === 'mara_maddening')} sever=${ranAbility(warden, 'warden_sever')}`),
  raw('54 mob: Black Tide\'s Decrepit Bow runs its Physical AoE',
    ranAbility(decrepitBow, 'bow_foultide') && all(decrepitBow, 'HIT_START').some(n => n.element === 'Physical'),
    `aoe=${ranAbility(decrepitBow, 'bow_foultide')}`),
  raw('54 mob: Tide-Eroded Blade lands its Blast (Physical)',
    ranAbility(tideBlade, 'blade_destruction') && all(tideBlade, 'HIT_START').some(n => n.element === 'Physical'),
    `blast=${ranAbility(tideBlade, 'blade_destruction')}`),
  raw('54 mob: SD Civilian Mechatron telegraphs then releases Windmill Defacer',
    ranAbility(mechatron, 'mechatron_windmill') && all(mechatron, 'HIT_START').some(n => n.element === 'Physical'),
    `windmill=${ranAbility(mechatron, 'mechatron_windmill')}`),
  raw('54 mob: Comediologist strikes Quantum and shields all allies with Tragic Core on a killing blow',
    ranAbility(comediologistWave, 'comedio_punchline') && all(comediologistWave, 'HIT_START').some(n => n.element === 'Quantum'),
    `punchline=${ranAbility(comediologistWave, 'comedio_punchline')} dmg=${all(comediologistWave, 'DAMAGE_DEALT').length}`),

  // Comediologist "Curtain Call": a killing blow shields the surviving friendly units (Tragic Core).
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const comedios = comediologistWave.sim.roster.filter(u => u.side === 'enemy')
    const ally = comedios[1]!
    const preShield = enemyDefenseOf(ally).shield
    comediologistWave.sim.kill(killerOf(comediologistWave), comedios[0]!)
    const landed = enemyDefenseOf(ally).shield > preShield
    const event = comediologistWave.sim.logger.events.some(e => e.type === 'SHIELD_APPLIED' && e.payload?.targetId === ally.id && (e.payload?.amount as number) > 0)
    rows.push(raw('54 mob: Comediologist Curtain Call shields its surviving allies on a killing blow',
      landed && event,
      `shield ${preShield}->${enemyDefenseOf(ally).shield} event=${event}`))
    return rows
  }))(),

  // --- Batch 10 (channel state machine, killing-blow reward, DoT striker) ------------------------
  // Fortune Seller "Dreamjolt Prizepool" (§54 killing-blow type): the damage pipeline records how
  // the killing blow landed, and the death-rattle reward keys off it. The kill-type table is
  // exercised directly via `sim.kill(killer, victim, type)` for each branch.
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const seller = fortunePipe.sim.roster.find(u => u.side === 'enemy')!
    const blow = (fortunePipe.sim.rt(seller) as { killingBlow?: string }).killingBlow
    rows.push(raw('54 mob: Fortune Seller records the killing-blow type from the damage pipeline (§54)',
      seller.dead === true && blow !== undefined, `dead=${seller.dead} blow=${blow ?? 'none'}`))

    const sellers = fortuneReward.sim.roster.filter(u => u.side === 'enemy')
    const killer = killerOf(fortuneReward)
    const ally = chars(fortuneReward)[0]!
    fortuneReward.sim.gainSp(-3)
    const sp0 = fortuneReward.sim.sp()
    ally.energy = 0
    fortuneReward.sim.kill(killer, sellers[0]!, 'basic')
    const basicSp = fortuneReward.sim.sp() > sp0
    const sp1 = fortuneReward.sim.sp()
    ally.energy = 0
    fortuneReward.sim.kill(killer, sellers[1]!, 'skill')
    const skillEnergy = ally.energy > 0 && fortuneReward.sim.sp() === sp1
    const sp2 = fortuneReward.sim.sp()
    ally.energy = 0
    fortuneReward.sim.kill(killer, sellers[2]!, 'ult')
    const ultBoth = ally.energy > 0 && fortuneReward.sim.sp() > sp2
    rows.push(raw('54 mob: Fortune Seller Prizepool rewards by kill type (Basic→SP, Skill→Energy, Ult→both)',
      basicSp && skillEnergy && ultBoth,
      `basicSp=${basicSp} skillEnergy=${skillEnergy} ultBoth=${ultBoth}`))
    return rows
  }))(),
  raw('54 mob: Mr. Domescreen spawns in the Surprise Channel and toggles both channels',
    all(domescreen, 'BUFF_APPLIED').some(n => n.payload?.id === 'domescreen_surprise_channel') &&
    all(domescreen, 'BUFF_APPLIED').filter(n => n.payload?.id === 'domescreen_surprise_channel' || n.payload?.id === 'domescreen_fright_channel').length >= 2,
    `channels=${all(domescreen, 'BUFF_APPLIED').filter(n => n.payload?.id === 'domescreen_surprise_channel' || n.payload?.id === 'domescreen_fright_channel').length}`),
  raw('54 mob: Mr. Domescreen runs both Surprise Variety Show and Startling Broadcast',
    ranAbility(domescreen, 'domescreen_surprise') && ranAbility(domescreen, 'domescreen_fright'),
    `surprise=${ranAbility(domescreen, 'domescreen_surprise')} broadcast=${ranAbility(domescreen, 'domescreen_fright')}`),
  raw('54 mob: Mr. Domescreen Startling Broadcast drains the team Energy (ENERGY_LOSS)',
    all(domescreen, 'ENERGY_LOSS').some(n => n.payload?.reason === 'drain' && (n.payload?.max as number) > 0),
    `${all(domescreen, 'ENERGY_LOSS').filter(n => n.payload?.reason === 'drain').length} drain events`),
  raw('54 mob: Mr. Domescreen Channel Crossover flips the channel when attacked',
    domescreen.buffLog.filter(e => e.id === 'domescreen_surprise_channel' || e.id === 'domescreen_fright_channel').length >= 3,
    `channel buffs=${domescreen.buffLog.length}`),
  raw('54 mob: Ternary Assimilation Unit spawns in the Fright Channel and broadcasts',
    all(ternary, 'BUFF_APPLIED').some(n => n.payload?.id === 'domescreen_fright_channel') && ranAbility(ternary, 'ternary_fright'),
    `broadcast=${ranAbility(ternary, 'ternary_fright')}`),
  raw('54 mob: Abundance Sprite: Wooden Lupus strikes Lightning and applies Shock',
    ranAbility(lupus, 'lupus_predation') && all(lupus, 'HIT_START').some(n => n.element === 'Lightning') && hasDot(lupus, 'Shock'),
    `predation=${ranAbility(lupus, 'lupus_predation')} shock=${hasDot(lupus, 'Shock')}`),

  // --- Batch 12 (Safeguard family: intact reduction → break delay + post-break vulnerability) ----
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const enemyOf = (b: Ctx) => b.sim.roster.find(u => u.side === 'enemy')!

    // every carrier spawns in the intact (-60% DMG taken) state
    rows.push(raw('54 mob: Safeguard carriers spawn with the intact DMG-reduction state',
      [claws, devourer, tail, heartbreaker].every(b => b.buffLog.some(e => e.id === 'safeguardMit')),
      'intact state'))

    // the declared reduction actually flows through the pipeline: intact vs mitigation-removed
    const de = enemyOf(devourer)
    const atk = chars(devourer)[0]!
    const intact = devourer.sim.hit(atk, de, { type: 'basic', mult: 8, canCrit: false, label: 'sg intact' })
    devourer.sim.removeBuff(de, 'safeguardMit')
    const nomit = devourer.sim.hit(atk, de, { type: 'basic', mult: 8, canCrit: false, label: 'sg nomit' })
    const ratio = nomit > 0 ? intact / nomit : 0
    rows.push(raw('54 mob: Safeguard intact state reduces damage taken by 60% through the shared pipeline',
      Math.abs(ratio - 0.4) < 0.02, `intact=${intact} nomit=${nomit} ratio=${ratio.toFixed(3)}`))

    // Weakness Break transitions the state: mitigation removed, +50% DMG taken, action delayed
    const ce = enemyOf(claws)
    const broken = ce.buffs.find(x => x.id === 'safeguardBroken')
    rows.push(raw('54 mob: Safeguard shatters on Weakness Break — mitigation gone, +50% DMG taken, delayed',
      claws.buffLog.some(e => e.id === 'safeguardMit') && !ce.buffs.some(x => x.id === 'safeguardMit') &&
      broken?.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.5) < 1e-9) === true &&
      all(claws, 'ACTION_DELAY').length > 0,
      `mit-removed=${!ce.buffs.some(x => x.id === 'safeguardMit')} vuln=${broken?.mods?.[0]?.value} delay=${all(claws, 'ACTION_DELAY').length}`))

    // Heartbreaker uses the same canonical 60/75/50 (its raw text states the numbers)
    const hb = enemyOf(heartbreaker)
    rows.push(raw('54 mob: Memory Zone Meme "Heartbreaker" carries the canonical Safeguard 60/75/50',
      hb.buffs.some(x => x.id === 'safeguardBroken' && x.mods?.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.5) < 1e-9)) &&
      heartbreaker.buffLog.some(e => e.id === 'safeguardMit'),
      `broken=${hb.buffs.some(x => x.id === 'safeguardBroken')}`))
    return rows
  }))(),

  // --- Batch 13 (Banacademic Office channel state machine) ---------------------------------------
  raw('54 mob: Banacademic Assistanana spawns in the Classroom Channel and Disrupt flips it to Off-Class',
    assistanana.buffLog.some(e => e.id === 'banacademic_classroom') && assistanana.buffLog.some(e => e.id === 'banacademic_offclass'),
    `class=${assistanana.buffLog.some(e => e.id === 'banacademic_classroom')} off=${assistanana.buffLog.some(e => e.id === 'banacademic_offclass')}`),
  raw('54 mob: Banacademic Assistanana runs Banascary Semester (Classroom) and Banappiness Holiday (Off-Class)',
    ranAbility(assistanana, 'assist_banascary') && ranAbility(assistanana, 'assist_banappiness'),
    `semester=${ranAbility(assistanana, 'assist_banascary')} holiday=${ranAbility(assistanana, 'assist_banappiness')}`),
  raw('54 mob: Banacademic Assistanana Banascary Semester drains 15 flat Energy from the team',
    all(assistanana, 'ENERGY_LOSS').some(n => n.payload?.reason === 'drain' && n.payload?.amount === 15),
    `${all(assistanana, 'ENERGY_LOSS').filter(n => n.payload?.reason === 'drain').length} drain events`),
  raw('54 mob: Banacademic Dreamweaver advances its own side (Class Time) and the player team (Break Time)',
    ranAbility(dreamweaver, 'dream_sitdown') && ranAbility(dreamweaver, 'dream_charge') && all(dreamweaver, 'ACTION_ADVANCE').length > 0,
    `sit=${ranAbility(dreamweaver, 'dream_sitdown')} charge=${ranAbility(dreamweaver, 'dream_charge')} adv=${all(dreamweaver, 'ACTION_ADVANCE').length}`),
  raw('54 mob: Banacademic Fortune drains then grants Skill Points across its two channels',
    ranAbility(fortuneAdvisor, 'fortune_demerits') && ranAbility(fortuneAdvisor, 'fortune_grades'),
    `demerits=${ranAbility(fortuneAdvisor, 'fortune_demerits')} grades=${ranAbility(fortuneAdvisor, 'fortune_grades')}`),
  raw('54 mob: Banacademic Charmony BananAdvisor lands Blast Fire + Burn and Buffs the team ATK (Holiday)',
    ranAbility(charmony, 'charm_banashment') && all(charmony, 'HIT_START').some(n => n.element === 'Fire') && hasDot(charmony, 'Burn') && charmony.buffLog.some(e => e.id === 'holiday_atkup'),
    `banashment=${ranAbility(charmony, 'charm_banashment')} burn=${hasDot(charmony, 'Burn')} holiday=${charmony.buffLog.some(e => e.id === 'holiday_atkup')}`),

  // --- Batch 14 (Wolftrooper pack — shared Moon Rage / Bloodlust) --------------------------------
  ...((() => {
    const rows: Array<ReturnType<typeof raw>> = []
    const rage = wolfPack.buffLog.filter(e => e.id === 'moonRage')
    const rageUnits = new Set(rage.map(e => e.unitName))
    rows.push(raw('54 mob: Moon Rage pack shares Bloodlust and BOTH troopers enter Moon Rage',
      rage.length >= 2 && rageUnits.size === 2,
      `rage=${rage.length} units=${[...rageUnits].join(', ')}`))
    rows.push(raw('54 mob: wolf troopers use their base attacks before Moon Rage',
      all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_gnaw') &&
      all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_massacre'),
      `gnaw=${all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_gnaw')} massacre=${all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_massacre')}`))
    rows.push(raw('54 mob: raging Eclipse self-heals and raging Sableclaw Bleeds the team',
      all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_gnaw_rage') &&
      all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_massacre_rage') &&
      all(wolfPack, 'HEAL_APPLIED').some(n => (n.target ?? '').startsWith('Eclipse Wolftrooper')) &&
      all(wolfPack, 'DOT_APPLIED').some(n => n.payload?.kind === 'Bleed'),
      `gnawRage=${all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_gnaw_rage')} massacreRage=${all(wolfPack, 'ABILITY_USED').some(n => n.payload?.action === 'wolf_massacre_rage')} heal=${all(wolfPack, 'HEAL_APPLIED').some(n => (n.target ?? '').startsWith('Eclipse Wolftrooper'))} bleed=${all(wolfPack, 'DOT_APPLIED').some(n => n.payload?.kind === 'Bleed')}`))
    return rows
  }))(),

  // --- Batch 15 (charge/support, Reverberation, Ice death-rattle, War-Armor buffer) --------------
  raw('54 mob: Winder Goon charges Set Alarm then Wake-Up Alarm advances every OTHER ally',
    ranAbility(winderGoon, 'winder_alarm') &&
    all(winderGoon, 'ACTION_ADVANCE').some(n => (n.source ?? '').includes('Winder Goon') && n.payload?.sourceId !== n.payload?.targetId),
    `alarm=${ranAbility(winderGoon, 'winder_alarm')} adv=${all(winderGoon, 'ACTION_ADVANCE').length}`),
  raw('54 mob: Winder Goon Wake-Up Punch lands a Physical hit',
    ranAbility(winderGoon, 'winder_punch') && all(winderGoon, 'HIT_START').some(n => n.element === 'Physical'),
    `punch=${ranAbility(winderGoon, 'winder_punch')}`),
  raw('54 mob: Wraith Warden Sawing Evil hits Physical and can apply the Reverberation marker',
    ranAbility(wraithWarden, 'warden_sawing') && all(wraithWarden, 'HIT_START').some(n => n.element === 'Physical') &&
    all(wraithWarden, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'reverberation'),
    `sawing=${ranAbility(wraithWarden, 'warden_sawing')} reverb=${all(wraithWarden, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'reverberation')}`),
  raw('54 mob: Hallucinogenic Mermaid casts AoE Ice; on death it hits its allies and inflicts Glacial Erosion',
    ranAbility(mermaidPack, 'mermaid_undine') && all(mermaidPack, 'HIT_START').some(n => n.element === 'Ice') &&
    all(mermaidPack, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'mermaid_glacial'),
    `undine=${ranAbility(mermaidPack, 'mermaid_undine')} ice=${all(mermaidPack, 'HIT_START').some(n => n.element === 'Ice')} glacial=${all(mermaidPack, 'DEBUFF_APPLIED').some(n => n.payload?.id === 'mermaid_glacial')}`),
  raw('54 mob: Furiae Troupe enters War Song, carries War Armor, and lands Blast Imaginary',
    furiaeTroupe.buffLog.some(e => e.id === 'furiae_warsong') && furiaeTroupe.buffLog.some(e => e.id === 'warArmor') &&
    ranAbility(furiaeTroupe, 'troupe_supplefire') && all(furiaeTroupe, 'HIT_START').some(n => n.element === 'Imaginary'),
    `warsong=${furiaeTroupe.buffLog.some(e => e.id === 'furiae_warsong')} armor=${furiaeTroupe.buffLog.some(e => e.id === 'warArmor')} fire=${ranAbility(furiaeTroupe, 'troupe_supplefire')}`),

  // --- Batch 16 (rotation, charge death-rattle, spawn/adjacent marker, elite Safeguard) ---------
  raw('54 mob: The Long Arms of Sorrow rotates single and Blast Quantum',
    ranAbility(longSorrow, 'sorrow_living') && ranAbility(longSorrow, 'sorrow_dead') && all(longSorrow, 'HIT_START').some(n => n.element === 'Quantum'),
    `living=${ranAbility(longSorrow, 'sorrow_living')} dead=${ranAbility(longSorrow, 'sorrow_dead')}`),
  raw('54 mob: Lesser Sting charges a Wind strike and its death-rattle hits all allies',
    ranAbility(lesserSting, 'lesser_detonation') && all(lesserSting, 'HIT_START').some(n => n.element === 'Wind') && stingRattled,
    `detonation=${ranAbility(lesserSting, 'lesser_detonation')} rattled=${stingRattled}`),
  raw('54 mob: Ichor Memosprite: Canine spawns with Hemotort Stain and passes it to an adjacent ally on death',
    all(ichorCanine, 'ABILITY_USED').some(n => n.payload?.action === 'canine_gnaw') && ichorCanine.buffLog.some(e => e.id === 'canine_stain' && e.unitName.startsWith('Ichor Memosprite: Canine')) && canineStainPassed,
    `gnaw=${all(ichorCanine, 'ABILITY_USED').some(n => n.payload?.action === 'canine_gnaw')} passed=${canineStainPassed}`),
  raw('54 mob: Memory Zone Meme "Shell of Faded Rage" carries Safeguard and stacks Obscure Blaze',
    shellRage.buffLog.some(e => e.id === 'safeguardMit') && shellRage.buffLog.some(e => e.id === 'shell_obscure') &&
    shellRage.buffLog.some(e => e.id === 'shell_obscure' && (e.stacks ?? 0) >= 2) && ranAbility(shellRage, 'shell_courtesy') &&
    all(shellRage, 'HIT_START').some(n => n.element === 'Quantum'),
    `mit=${shellRage.buffLog.some(e => e.id === 'safeguardMit')} blaze=${shellRage.buffLog.some(e => e.id === 'shell_obscure')}`),

  // --- Batch 17 (Illusion variants, support/redirect markers, death-state family) ---------------
  raw('54 mob: Ice Edge (Illusion) casts AoE Ice',
    ranAbility(iceEdgeIllusion, 'iceedgeillus1_icywind') && all(iceEdgeIllusion, 'HIT_START').some(n => n.element === 'Ice'),
    `icy=${ranAbility(iceEdgeIllusion, 'iceedgeillus1_icywind')}`),
  raw('54 mob: Lance of the Eternal Freeze (Illusion) casts AoE Ice',
    ranAbility(lanceIllusion, 'lanceillus1_everwinter') && all(lanceIllusion, 'HIT_START').some(n => n.element === 'Ice'),
    `ever=${ranAbility(lanceIllusion, 'lanceillus1_everwinter')}`),
  raw('54 mob: Meteoric Eagle strikes Wind and applies Stormride to an ally',
    ranAbility(meteoricEagle, 'eagle_pierce') && ranAbility(meteoricEagle, 'eagle_storm') && meteoricEagle.buffLog.some(e => e.id === 'stormride') && all(meteoricEagle, 'HIT_START').some(n => n.element === 'Wind'),
    `pierce=${ranAbility(meteoricEagle, 'eagle_pierce')} storm=${meteoricEagle.buffLog.some(e => e.id === 'stormride')}`),
  raw('54 mob: Ichor Memosprite: Pheasant strikes Imaginary and applies Hemotort Resonance',
    ranAbility(pheasantPack, 'pheasant_graze') && pheasantPack.buffLog.some(e => e.id === 'pheasant_resonance') && all(pheasantPack, 'HIT_START').some(n => n.element === 'Imaginary'),
    `graze=${ranAbility(pheasantPack, 'pheasant_graze')} res=${pheasantPack.buffLog.some(e => e.id === 'pheasant_resonance')}`),
  raw('54 mob: Security Doggo strikes Physical and applies Fealty to an ally',
    ranAbility(securityDoggo, 'doggo_arrest') && securityDoggo.buffLog.some(e => e.id === 'doggo_fealty') && all(securityDoggo, 'HIT_START').some(n => n.element === 'Physical'),
    `arrest=${ranAbility(securityDoggo, 'doggo_arrest')} fealty=${securityDoggo.buffLog.some(e => e.id === 'doggo_fealty')}`),
  raw('54 mob: Magical Girl Troupe spawns Rainy and its death-rattle bounces Lightning + Shock',
    magicalGirl.buffLog.some(e => e.id === 'mg_rainy') && all(magicalGirl, 'HIT_START').some(n => n.element === 'Lightning') && all(magicalGirl, 'DOT_APPLIED').some(n => n.payload?.kind === 'Shock'),
    `rainy=${magicalGirl.buffLog.some(e => e.id === 'mg_rainy')} shock=${all(magicalGirl, 'DOT_APPLIED').some(n => n.payload?.kind === 'Shock')}`),

  // --- Batch 18 (arena adds, elemental status, support-marker family) ---------------------------
  raw('54 mob: Shadow of "Hatred" casts AoE Physical',
    ranAbility(shadowHatred, 'hatred_wishes') && all(shadowHatred, 'HIT_START').some(n => n.element === 'Physical'),
    `wishes=${ranAbility(shadowHatred, 'hatred_wishes')}`),
  raw('54 mob: Twig of Wintry Wind strikes Wind, applies Wind Shear and an Outrage mark',
    ranAbility(twigWintry, 'twig_outrage') && all(twigWintry, 'HIT_START').some(n => n.element === 'Wind') && all(twigWintry, 'DOT_APPLIED').some(n => n.payload?.kind === 'WindShear') && twigWintry.buffLog.some(e => e.id === 'twig_outrage'),
    `outrage=${ranAbility(twigWintry, 'twig_outrage')} shear=${all(twigWintry, 'DOT_APPLIED').some(n => n.payload?.kind === 'WindShear')}`),
  raw('54 mob: Furbo Journalist strikes Imaginary',
    ranAbility(furboJournalist, 'furbo_capture') && all(furboJournalist, 'HIT_START').some(n => n.element === 'Imaginary'),
    `capture=${ranAbility(furboJournalist, 'furbo_capture')}`),
  raw('54 mob: Illwish Lotus applies Wicked Grin to an ally',
    ranAbility(illwishLotus, 'illwish_bloom') && illwishLotus.buffLog.some(e => e.id === 'wicked_grin'),
    `bloom=${ranAbility(illwishLotus, 'illwish_bloom')} grin=${illwishLotus.buffLog.some(e => e.id === 'wicked_grin')}`),
  raw('54 mob: Autonomous Wand hits Quantum and resolves one Happiness Charm outcome',
    ranAbility(autoWand, 'wand_crackle') && all(autoWand, 'HIT_START').some(n => n.element === 'Quantum') && ranAbility(autoWand, 'wand_charm') && (autoWand.buffLog.some(e => e.id === 'wand_atk' || e.id === 'reverberation') || all(autoWand, 'ACTION_ADVANCE').length > 0),
    `crackle=${ranAbility(autoWand, 'wand_crackle')} charm=${ranAbility(autoWand, 'wand_charm')} atk=${autoWand.buffLog.some(e => e.id === 'wand_atk')} rev=${autoWand.buffLog.some(e => e.id === 'reverberation')}`),
  raw('54 mob: Insatiable Vanity applies Deception\'s Crown and dispels it on death',
    vanityMeme.buffLog.some(e => e.id === 'deception_crown') && crownCleared,
    `crown=${vanityMeme.buffLog.some(e => e.id === 'deception_crown')} cleared=${crownCleared}`),
  raw('54 mob: Dried Lacrimal Bone uses its authored Physical attack',
    ranAbility(driedBone, 'bone_strike') && all(driedBone, 'HIT_START').some(n => n.element === 'Physical'),
    `strike=${ranAbility(driedBone, 'bone_strike')}`),
  raw('54 mob: Languid Ethmoid Bone uses its authored Physical attack',
    ranAbility(ethmoidBone, 'bone_strike2') && all(ethmoidBone, 'HIT_START').some(n => n.element === 'Physical'),
    `strike=${ranAbility(ethmoidBone, 'bone_strike2')}`),

  // --- Batch 19 (state/resource supports, sub-field ports, summon adds) -------------------------
  raw('54 mob: Black Tide Council Lurks, then uses the require-gated Physical 450%',
    ranAbility(blackTideCouncil, 'btc_lurking') && blackTideCouncil.buffLog.some(e => e.id === 'btc_lurking') && ranAbility(blackTideCouncil, 'btc_insidious') && ranAbility(blackTideCouncil, 'btc_broken') && all(blackTideCouncil, 'HIT_START').some(n => n.element === 'Physical'),
    `lurk=${ranAbility(blackTideCouncil, 'btc_lurking')} insid=${ranAbility(blackTideCouncil, 'btc_insidious')} broke=${ranAbility(blackTideCouncil, 'btc_broken')}`),
  raw('54 mob: Auxiliary Robot Arm Unit restrains + telegraphs Overload',
    ranAbility(robotArm, 'arm_embrace') && ranAbility(robotArm, 'arm_field') && ranAbility(robotArm, 'arm_overload') && all(robotArm, 'HIT_START').some(n => n.element === 'Physical') && all(robotArm, 'CONTROL_APPLIED').length > 0,
    `embrace=${ranAbility(robotArm, 'arm_embrace')} overload=${ranAbility(robotArm, 'arm_overload')} cc=${all(robotArm, 'CONTROL_APPLIED').length}`),
  raw('54 mob: "The Shield" self-shields and Barriers an ally',
    ranAbility(theShield, 'shield_diadem') && all(theShield, 'SHIELD_APPLIED').length > 0 && theShield.buffLog.some(e => e.id === 'shield_barrier'),
    `shield=${all(theShield, 'SHIELD_APPLIED').length} barrier=${theShield.buffLog.some(e => e.id === 'shield_barrier')}`),
  raw('54 mob: Long-Shattered Vessel runs its Blast + AoE rotation',
    ranAbility(longVessel, 'lsv_storm') && ranAbility(longVessel, 'lsv_fate') && all(longVessel, 'HIT_START').some(n => n.element === 'Physical'),
    `storm=${ranAbility(longVessel, 'lsv_storm')} fate=${ranAbility(longVessel, 'lsv_fate')}`),
  raw('54 mob: Twig of Lavish Fruits produces Lavish Fruits',
    lavishFruits.buffLog.some(e => e.id === 'lavish_fruit'),
    `fruit=${lavishFruits.buffLog.some(e => e.id === 'lavish_fruit')}`),
  raw('54 mob: Shoot of Hundred Eyes uses its authored Physical attack',
    ranAbility(shootEyes, 'eyes_strike') && all(shootEyes, 'HIT_START').some(n => n.element === 'Physical'),
    `gaze=${ranAbility(shootEyes, 'eyes_strike')}`),
  raw('54 mob: Twig of Hundred Eyes uses its authored Physical attack',
    ranAbility(twigEyes, 'eyes_strike2') && all(twigEyes, 'HIT_START').some(n => n.element === 'Physical'),
    `gaze=${ranAbility(twigEyes, 'eyes_strike2')}`),
  raw('54 mob: Output Port 1 grants Ally Gratuity (RES PEN) to its allies',
    ranAbility(outputPort1, 'port1_growth') && outputPort1.buffLog.some(e => e.id === 'ally_gratuity'),
    `growth=${ranAbility(outputPort1, 'port1_growth')} gratuity=${outputPort1.buffLog.some(e => e.id === 'ally_gratuity')}`),
  raw('54 mob: Output Port 2 applies the Enemy Gratuity DMG-down debuff',
    ranAbility(outputPort2, 'port2_bleed') && outputPort2.buffLog.some(e => e.id === 'enemy_gratuity'),
    `bleed=${ranAbility(outputPort2, 'port2_bleed')} gratuity=${outputPort2.buffLog.some(e => e.id === 'enemy_gratuity')}`),

  // --- Batch 20 (final ordinary mobs — Talent-only / special-state residuals) -------------------
  raw('54 mob: "All or Nothing" is immune to DMG (Fickle Fortune)',
    allOrNothing.buffLog.some(e => e.id === 'aon_immune'),
    `immune=${allOrNothing.buffLog.some(e => e.id === 'aon_immune')}`),
  raw('54 mob: "All or Nothing: Double Fortune" leaves the battle on its turn',
    all(allOrNothingDF, 'FLEE').length > 0,
    `flee=${all(allOrNothingDF, 'FLEE').length}`),
  raw('54 mob: "Spirithief" Bartholos carries DMG reduction and buffs the team on death',
    bartholos.buffLog.some(e => e.id === 'barth_ward') && barthBoostsTeam,
    `ward=${bartholos.buffLog.some(e => e.id === 'barth_ward')} boost=${barthBoostsTeam}`),
  raw('54 mob: Conquer or Be Conquered carries the +100% DMG-taken state',
    conquerConquered.buffLog.some(e => e.id === 'cobc_vuln'),
    `vuln=${conquerConquered.buffLog.some(e => e.id === 'cobc_vuln')}`),
  raw('54 mob: Imprisoned Mythos hits Imaginary + delays and revives on a killing blow',
    ranAbility(imprisonedMythos, 'mythos_induce') && all(imprisonedMythos, 'HIT_START').some(n => n.element === 'Imaginary') && all(imprisonedMythos, 'ACTION_DELAY').length > 0 && mythosImmortal,
    `induce=${ranAbility(imprisonedMythos, 'mythos_induce')} immortal=${mythosImmortal}`),
  raw('54 mob: Manipulated Logos runs its Quantum rotation and revives on a killing blow',
    ranAbility(manipulatedLogos, 'logos_hail') && ranAbility(manipulatedLogos, 'logos_break') && all(manipulatedLogos, 'HIT_START').some(n => n.element === 'Quantum') && logosImmortal,
    `hail=${ranAbility(manipulatedLogos, 'logos_hail')} brk=${ranAbility(manipulatedLogos, 'logos_break')} immortal=${logosImmortal}`),
  raw('54 mob: Something In The Mirror enters its Mirror Cognition form',
    mirrorMeme.buffLog.some(e => e.id === 'mirror_form'),
    `form=${mirrorMeme.buffLog.some(e => e.id === 'mirror_form')}`),
  raw('54 mob: Sombrous Sepulcher takes no action',
    ranAbility(sombrous, 'sepulcher_wait') && all(sombrous, 'DAMAGE_DEALT').filter(n => n.source === 'Sombrous Sepulcher').length === 0,
    `wait=${ranAbility(sombrous, 'sepulcher_wait')}`),
  raw('54 mob: The Conquered spawns with War Armor and takes no action',
    ranAbility(theConquered, 'conquered_wait') && theConquered.buffLog.some(e => e.id === 'warArmor'),
    `armor=${theConquered.buffLog.some(e => e.id === 'warArmor')}`),
  raw('54 mob: Ice Edge (Illusion) (2) casts AoE Ice',
    ranAbility(iceEdgeIllusion2, 'iceedgeillus2_icywind') && all(iceEdgeIllusion2, 'HIT_START').some(n => n.element === 'Ice'),
    `icy=${ranAbility(iceEdgeIllusion2, 'iceedgeillus2_icywind')}`),
  raw('54 mob: Lance of the Eternal Freeze (Illusion) (2) casts AoE Ice',
    ranAbility(lanceIllusion2, 'lanceillus2_everwinter') && all(lanceIllusion2, 'HIT_START').some(n => n.element === 'Ice'),
    `ever=${ranAbility(lanceIllusion2, 'lanceillus2_everwinter')}`),
  raw('54 mob: Grunt: Security Personnel deals blast damage',
    ranAbility(gruntSecurity, 'grunt_security') && all(gruntSecurity, 'DAMAGE_DEALT').length > 0,
    `appeal=${ranAbility(gruntSecurity, 'grunt_security')}`),
  raw('54 mob: Silvermane Cannoneer runs Barrage',
    ranAbility(cannoneer, 'cannoneer_barrage') && all(cannoneer, 'DAMAGE_DEALT').length > 0,
    `barrage=${ranAbility(cannoneer, 'cannoneer_barrage')}`),
  raw('54 mob: gap-fill enemies hold their invariants',
    [iceEdgeIllusion2, lanceIllusion2, gruntSecurity, cannoneer].every(clean), 'invariants'),
  ]
}
