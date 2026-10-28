// AUTO-GENERATED from honkai-star-rail.fandom.com wiki data. Do not edit by hand.
// Regenerate: node scripts/gen-progression.mjs

export interface CharProg {
  base: { hp: number; atk: number; def: number; spd: number }
  /** base stats at each ascension boundary — floor from hsr-data/characters.json */
  byLevel: Record<number, { hp: number; atk: number; def: number; spd: number }>
  /** slot -> multiplier per ability level (index = level-1) */
  abilities: Record<string, number[]>
  /** flat heal values (Gallagher skill) use these raw numbers */
  eidolons: string[]
  traces: Array<{ stat: string; value: number }>
}

const SEELE: CharProg = {
  base: { hp: 931, atk: 640, def: 363, spd: 115 },
  byLevel: {
    10: { hp: 183, atk: 126, def: 71, spd: 115 },
    20: { hp: 247, atk: 169, def: 96, spd: 115 },
    30: { hp: 361, atk: 248, def: 141, spd: 115 },
    40: { hp: 475, atk: 326, def: 185, spd: 115 },
    50: { hp: 589, atk: 405, def: 230, spd: 115 },
    60: { hp: 703, atk: 483, def: 274, spd: 115 },
    70: { hp: 817, atk: 561, def: 319, spd: 115 },
    80: { hp: 931, atk: 640, def: 363, spd: 115 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.8, 1.98, 2.16, 2.34, 2.52, 2.7, 2.925, 3.15, 3.375, 3.6, 3.78, 3.96, 4.14, 4.32, 4.5],
    ult: [3.6, 3.96, 4.32, 4.68, 5.04, 5.4, 5.85, 6.3, 6.75, 7.2, 7.56, 7.92, 8.28, 8.64, 9],
    talent: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1.0],
  },
  eidolons: [
    "E1: Extirpating Slash — When dealing DMG to an enemy whose HP percentage is 80% or lower, CRIT Rate increases by 15%.",
    "E2: Dancing Butterfly — The SPD Boost effect of Seele's Skill can stack up to 2 time(s).",
    "E3: Dazzling Tumult — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Flitting Phantasm — Seele regenerates 15 Energy when she defeats an enemy.",
    "E5: Piercing Shards — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Shattering Shambles — After Seele uses Ultimate, inflict the attacked enemy with \"Butterfly Flurry\" for 3 turn(s). Enemies in \"Butterfly Flurry\" will additionally take 1 instance of True DMG True DMG Causes the target being hit to take extra DMG, which is not considered an attack. equal to 30% of Seele's Ultimate DMG every time they are attacked. If the target is defeated by the \"Butterfly Flurry\" state's Additional DMG Additional DMG Causes the target being hit to take extra DMG, which is not con",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critDmg", value: 0.24 },
    { stat: "defPct", value: 0.125 },
  ],
}

const JINGYUAN: CharProg = {
  base: { hp: 1164, atk: 698, def: 485, spd: 99 },
  byLevel: {
    10: { hp: 229, atk: 137, def: 95, spd: 99 },
    20: { hp: 308, atk: 185, def: 128, spd: 99 },
    30: { hp: 451, atk: 270, def: 188, spd: 99 },
    40: { hp: 594, atk: 356, def: 247, spd: 99 },
    50: { hp: 736, atk: 441, def: 306, spd: 99 },
    60: { hp: 879, atk: 527, def: 366, spd: 99 },
    70: { hp: 1021, atk: 613, def: 425, spd: 99 },
    80: { hp: 1164, atk: 698, def: 485, spd: 99 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25],
    ult: [1.2,1.28,1.36,1.44,1.52,1.6,1.7,1.8,1.9,2,2.08,2.16,2.24,2.32,2.4],
    talent: [0.33,0.363,0.396,0.429,0.462,0.495,0.53625,0.5775,0.61875,0.66,0.693,0.726,0.759,0.792,0.825],
  },
  eidolons: [
    "E1: Slash, Seas Split — When Lightning-Lord attacks, the DMG multiplier on enemies adjacent to the target enemy increases by an extra amount equal to 25% of the DMG multiplier against the primary target enemy.",
    "E2: Swing, Skies Squashed — After Lightning-Lord takes action, DMG dealt by Jing Yuan's Basic ATK, Skill, and Ultimate increases by 20%, lasting for 2 turn(s).",
    "E3: Strike, Suns Subdued — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Spin, Stars Sieged — For each hit performed by the Lightning-Lord when it takes action, Jing Yuan regenerates 2 Energy.",
    "E5: Stride, Spoils Seized — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Sweep, Souls Slain — Each hit performed by the Lightning-Lord when it takes action will make the target enemy Vulnerable. While Vulnerable, enemies receive 12% more DMG until the end of the Lightning-Lord's current turn, stacking up to 3 time(s).",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.12 },
    { stat: "defPct", value: 0.125 },
  ],
}

const FIREFLY: CharProg = {
  base: { hp: 814, atk: 523, def: 776, spd: 104 },
  byLevel: {
    10: { hp: 160, atk: 103, def: 153, spd: 104 },
    20: { hp: 216, atk: 138, def: 205, spd: 104 },
    30: { hp: 316, atk: 203, def: 300, spd: 104 },
    40: { hp: 415, atk: 267, def: 396, spd: 104 },
    50: { hp: 515, atk: 331, def: 491, spd: 104 },
    60: { hp: 615, atk: 395, def: 586, spd: 104 },
    70: { hp: 715, atk: 459, def: 681, spd: 104 },
    80: { hp: 814, atk: 523, def: 776, spd: 104 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8],
    skill: [0.5,0.51,0.52,0.53,0.54,0.55,0.5625,0.575,0.5875,0.6,0.61,0.62,0.63,0.64,0.65],
    skill_a2: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5],
    skill_en: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5],
    skill_en_a2: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25],
    ult: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25],
    ult_a2: [30,33,36,39,42,45,48.75,52.5,56.25,60,63,66,69,72,75],
    talent: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5],
    talent_a2: [0.1,0.12,0.14,0.16,0.18,0.2,0.225,0.25,0.275,0.3,0.32,0.34,0.36,0.38,0.4],
  },
  eidolons: [
    "E1: In Reddened Chrysalis, I Once Rest — When using the Enhanced Skill, ignores 15% of the target's DEF. The Enhanced Skill does not consume Skill Points.",
    "E2: From Shattered Sky, I Free Fall — Description Gameplay Notes While in Complete Combustion, using the Enhanced Basic ATK or the Enhanced Skill to defeat an enemy target or to Break their Weakness Weakness Break State When enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. allows SAM to immediately gain 1 extra turn Extra Turn Gain 1 extra turn that won't expend your remaining turns when taking action. During this extra turn, no Ultimate can be used. . This effect can tr",
    "E3: Amidst Silenced Stars, I Deep Sleep — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Upon Lighted Fyrefly, I Soon Gaze — While in Complete Combustion, increases SAM's Effect RES by 50%.",
    "E5: From Undreamt Night, I Thence Shine — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: In Finalized Morrow, I Full Bloom — While in Complete Combustion, increases SAM's Fire RES PEN RES PEN When dealing DMG, ignore a part of the enemy target's resistance to the corresponding damage type. by 20%. When using the Enhanced Basic ATK or Enhanced Skill, increases Weakness Break Efficiency by 50%.",
  ],
  traces: [
    { stat: "effRes", value: 0.18 },
    { stat: "spdFlat", value: 5 },
    { stat: "be", value: 0.373 },
  ],
}

const BRONYA: CharProg = {
  base: { hp: 1241, atk: 582, def: 533, spd: 99 },
  byLevel: {
    10: { hp: 244, atk: 114, def: 105, spd: 99 },
    20: { hp: 329, atk: 154, def: 141, spd: 99 },
    30: { hp: 481, atk: 225, def: 206, spd: 99 },
    40: { hp: 633, atk: 297, def: 272, spd: 99 },
    50: { hp: 785, atk: 368, def: 337, spd: 99 },
    60: { hp: 937, atk: 439, def: 402, spd: 99 },
    70: { hp: 1089, atk: 510, def: 468, spd: 99 },
    80: { hp: 1241, atk: 582, def: 533, spd: 99 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.33,0.363,0.396,0.429,0.462,0.495,0.53625,0.5775,0.61875,0.66,0.693,0.726,0.759,0.792,0.825],
    ult: [0.33,0.352,0.374,0.396,0.418,0.44,0.4675,0.495,0.5225,0.55,0.572,0.594,0.616,0.638,0.66],
    ult_a2: [0.12,0.124,0.128,0.132,0.136,0.14,0.145,0.15,0.155,0.16,0.164,0.168,0.172,0.176,0.18],
    ult_a3: [0.12,0.128,0.136,0.144,0.152,0.16,0.17,0.18,0.19,0.2,0.208,0.216,0.224,0.232,0.24],
    talent: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375],
  },
  eidolons: [
    "E1: Hone Your Strength — When using Skill, there is a 50% fixed chance Fixed Chance Fixed chance will not be affected by any factor. of recovering 1 Skill Point. This effect has a 1-turn cooldown.",
    "E2: Quick March — When using Skill, the target ally's SPD increases by 30% after taking action, lasting for 1 turn.",
    "E3: Bombardment — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Take by Surprise — Description Gameplay Notes After any other ally character uses Basic ATK on an enemy target that has Wind Weakness, Bronya immediately launches 1 instance of Follow-up ATK Follow-Up ATK Unleashes an extra attack on the target. This effect is triggered automatically when requirements are met. , dealing Wind DMG to this target equal to 80% of her Basic ATK DMG. This effect can only trigger once per turn. This follow-up attack deals 10 Toughness Reduction and regenerates 5 Energy . Take by Surprise",
    "E5: Unstoppable — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Piercing Rainbow — The duration of the DMG Boost effect placed by the Skill on the target ally increases by 1 turn(s).",
  ],
  traces: [
    { stat: "effRes", value: 0.1 },
    { stat: "critDmg", value: 0.24 },
    { stat: "dmg:Wind", value: 0.224 },
  ],
}

const PELA: CharProg = {
  base: { hp: 987, atk: 546, def: 463, spd: 105 },
  byLevel: {
    10: { hp: 194, atk: 107, def: 91, spd: 105 },
    20: { hp: 262, atk: 145, def: 122, spd: 105 },
    30: { hp: 383, atk: 212, def: 179, spd: 105 },
    40: { hp: 504, atk: 279, def: 236, spd: 105 },
    50: { hp: 624, atk: 345, def: 292, spd: 105 },
    60: { hp: 745, atk: 412, def: 349, spd: 105 },
    70: { hp: 866, atk: 479, def: 406, spd: 105 },
    80: { hp: 987, atk: 546, def: 463, spd: 105 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.05,1.155,1.26,1.365,1.47,1.575,1.70625,1.8375,1.96875,2.1,2.205,2.31,2.415,2.52,2.625],
    ult: [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9, 0.95, 1.0, 1.04, 1.08, 1.12, 1.16, 1.2],
    ult_a2: [0.3, 0.31, 0.32, 0.33, 0.34, 0.35, 0.3625, 0.375, 0.3875, 0.4, 0.41, 0.42, 0.43, 0.44, 0.45],
    talent: [5,5.5,6,6.5,7,7.5,8.125,8.75,9.375,10,10.5,11,11.5,12,12.5],
  },
  eidolons: [
    "E1: Victory Report — When an enemy is defeated, Pela regenerates 5 Energy.",
    "E2: Adamant Charge — Using Skill to dispel buff(s) Buff Can buff combat ability for a period of time, which can be dispelled unless otherwise specified. increases SPD by 10% for 2 turn(s).",
    "E3: Suppressive Force — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Full Analysis — When using Skill, there is a 100% base chance Base Chance The base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to reduce the target enemy's Ice RES by 12% for 2 turn(s).",
    "E5: Absolute Jeopardy — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Feeble Pursuit — After Pela attacks, if the enemy target is debuffed Debuff Debuffs are negative status effects that render units weaker. Unless otherwise specified, debuffs can be dispelled. , deals Ice Additional DMG Additional DMG Causes the target being hit to take extra DMG, which is not considered an attack. equal to 40% of Pela's ATK to the enemy.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "ehr", value: 0.1 },
    { stat: "dmg:Ice", value: 0.224 },
  ],
}

const GUINAIFEN: CharProg = {
  base: { hp: 882, atk: 582, def: 441, spd: 106 },
  byLevel: {
    10: { hp: 174, atk: 114, def: 87, spd: 106 },
    20: { hp: 234, atk: 154, def: 117, spd: 106 },
    30: { hp: 342, atk: 225, def: 171, spd: 106 },
    40: { hp: 450, atk: 297, def: 225, spd: 106 },
    50: { hp: 558, atk: 368, def: 279, spd: 106 },
    60: { hp: 666, atk: 439, def: 333, spd: 106 },
    70: { hp: 774, atk: 510, def: 387, spd: 106 },
    80: { hp: 882, atk: 582, def: 441, spd: 106 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.6,0.66,0.72,0.78,0.84,0.9,0.975,1.05,1.125,1.2,1.26,1.32,1.38,1.44,1.5],
    skill_a2: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5],
    skill_a3: [0.83904,0.92298,1.00692,1.09086,1.1748,1.30071,1.46859,1.67844,1.93026,2.18208,2.291202,2.400324,2.509446,2.618568,2.72769],
    ult: [0.72,0.768,0.816,0.864,0.912,0.96,1.02,1.08,1.14,1.2,1.248,1.296,1.344,1.392,1.44],
    ult_a2: [0.72,0.74,0.76,0.78,0.8,0.82,0.845,0.87,0.895,0.92,0.94,0.96,0.98,1,1.02],
    talent: [0.04,0.043,0.046,0.049,0.052,0.055,0.05875,0.0625,0.06625,0.07,0.073,0.076,0.079,0.082,0.085],
  },
  eidolons: [
    "E1: Slurping Noodles During Handstand — When Skill is used, there is a 100% base chance Base Chance The base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to reduce the attacked target enemy's Effect RES by 10% for 2 turn(s).",
    "E2: Brushing Teeth While Whistling — When an enemy target is being Burned, the DMG multiplier of the Burn status applied by her Basic ATK or Skill increases by 40%.",
    "E3: Smashing Boulder on Chest — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Blocking Pike with Neck — Every time the Burn status inflicted by Guinaifen causes DMG, Guinaifen regenerates 2 Energy.",
    "E5: Swallowing Sword to Stomach — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Catching Bullet with Hands — Increases the stackable Firekiss count by 1.",
  ],
  traces: [
    { stat: "ehr", value: 0.1 },
    { stat: "be", value: 0.24 },
    { stat: "dmg:Fire", value: 0.224 },
  ],
}

const SPARKLE: CharProg = {
  base: { hp: 1397, atk: 523, def: 485, spd: 101 },
  byLevel: {
    10: { hp: 275, atk: 103, def: 95, spd: 101 },
    20: { hp: 370, atk: 138, def: 128, spd: 101 },
    30: { hp: 541, atk: 203, def: 188, spd: 101 },
    40: { hp: 712, atk: 267, def: 247, spd: 101 },
    50: { hp: 883, atk: 331, def: 306, spd: 101 },
    60: { hp: 1054, atk: 395, def: 366, spd: 101 },
    70: { hp: 1226, atk: 459, def: 425, spd: 101 },
    80: { hp: 1397, atk: 523, def: 485, spd: 101 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3],
    skill_a2: [0.27,0.288,0.306,0.324,0.342,0.36,0.3825,0.405,0.4275,0.45,0.468,0.486,0.504,0.522,0.54],
    ult: [0.036, 0.0384, 0.0408, 0.0432, 0.0456, 0.048, 0.051, 0.054, 0.057, 0.06, 0.0624, 0.0648, 0.0672, 0.0696, 0.072],
    talent: [0.02, 0.022, 0.024, 0.026, 0.028, 0.03, 0.0325, 0.035, 0.0375, 0.04, 0.042, 0.044, 0.046, 0.048, 0.05],
  },
  eidolons: [
    "E1: Suspension of Disbelief — The Cipher effect granted by the Ultimate lasts for 1 extra turn. All allies with Cipher have their ATK increased by 40%.",
    "E2: Purely Fictitious — Every stack of the Talent's effect allows allies to additionally ignore 8% of the target's DEF when dealing DMG.",
    "E3: Pipedream — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Life Is a Gamble — The Ultimate recovers 1 more Skill Point. The Talent additionally increases the Max Skill Points by 1.",
    "E5: Parallax Truth — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Narrative Polysemy — The CRIT DMG Boost effect provided by the Skill additionally increases by an amount equal to 30% of Sparkle's CRIT DMG. When Sparkle uses Skill, her Skill's CRIT DMG Boost effect will apply to all teammates with Cipher. When Sparkle uses her Ultimate, any single ally who benefits from her Skill's CRIT DMG Boost will spread that effect to teammates with Cipher.",
  ],
  traces: [
    { stat: "effRes", value: 0.1 },
    { stat: "critDmg", value: 0.24 },
    { stat: "hpPct", value: 0.28 },
  ],
}

const GALLAGHER: CharProg = {
  base: { hp: 1305, atk: 529, def: 441, spd: 98 },
  byLevel: {
    10: { hp: 257, atk: 104, def: 87, spd: 98 },
    20: { hp: 346, atk: 140, def: 117, spd: 98 },
    30: { hp: 506, atk: 205, def: 171, spd: 98 },
    40: { hp: 666, atk: 270, def: 225, spd: 98 },
    50: { hp: 825, atk: 334, def: 279, spd: 98 },
    60: { hp: 985, atk: 399, def: 333, spd: 98 },
    70: { hp: 1145, atk: 464, def: 387, spd: 98 },
    80: { hp: 1305, atk: 529, def: 441, spd: 98 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5],
    basic_en_a2: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19],
    skill: [200,340,480,676,830,984,1138,1292,1446,1600,1684,1768,1852,1936,2020],
    ult: [0.75,0.825,0.9,0.975,1.05,1.125,1.21875,1.3125,1.40625,1.5,1.575,1.65,1.725,1.8,1.875],
    talent: [0.06,0.066,0.072,0.078,0.084,0.09,0.0975,0.105,0.1125,0.12,0.126,0.132,0.138,0.144,0.15],
    talent_a2: [80,136,192,270.4,332,393.6,455.2,516.8,578.4,640,673.6,707.2,740.8,774.4,808],
  },
  eidolons: [
    "E1: Salty Dog — When entering the battle, Gallagher regenerates 20 Energy and increases Effect RES by 50%.",
    "E2: Lion's Tail — When using the Skill, dispels 1 debuff(s) Debuff Debuffs are negative status effects that render units weaker. Unless otherwise specified, debuffs can be dispelled. from the designated ally. At the same time, increases their Effect RES by 30% for 2 turn(s).",
    "E3: Corpse Reviver — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Last Word — Extends the duration of the Besotted state inflicted by Gallagher's Ultimate by 1 turn(s).",
    "E5: Death in the Afternoon — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Blood and Sand — Increases Gallagher's Break Effect by 20% and Weakness Break Efficiency by 20%.",
  ],
  traces: [
    { stat: "effRes", value: 0.28 },
    { stat: "be", value: 0.133 },
    { stat: "hpPct", value: 0.18 },
  ],
}

const HUOHUO: CharProg = {
  base: { hp: 1358, atk: 601, def: 509, spd: 98 },
  byLevel: {
    10: { hp: 267, atk: 118, def: 100, spd: 98 },
    20: { hp: 360, atk: 159, def: 135, spd: 98 },
    30: { hp: 526, atk: 233, def: 197, spd: 98 },
    40: { hp: 693, atk: 306, def: 259, spd: 98 },
    50: { hp: 859, atk: 380, def: 322, spd: 98 },
    60: { hp: 1025, atk: 454, def: 384, spd: 98 },
    70: { hp: 1191, atk: 527, def: 446, spd: 98 },
    80: { hp: 1358, atk: 601, def: 509, spd: 98 }
  },
  abilities: {
    basic: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
    skill: [0.16,0.17,0.18,0.19,0.2,0.208,0.216,0.224,0.232,0.24,0.248,0.256,0.264,0.272,0.28],
    skill_a2: [0.128,0.136,0.144,0.152,0.16,0.1664,0.1728,0.1792,0.1856,0.192,0.1984,0.2048,0.2112,0.2176,0.224],
    ult: [0.24,0.256,0.272,0.288,0.304,0.32,0.34,0.36,0.38,0.4,0.416,0.432,0.448,0.464,0.48],
    ult_a2: [0.15,0.155,0.16,0.165,0.17,0.175,0.18125,0.1875,0.19375,0.2,0.205,0.21,0.215,0.22,0.225],
    talent: [0.03,0.031875,0.03375,0.035625,0.0375,0.039,0.0405,0.042,0.0435,0.045,0.0465,0.048,0.0495,0.051,0.0525],
  },
  eidolons: [
    'E1: Anchored to Vessel, Specters Nestled — Divine Provision gains 1 extra turn. While Huohuo has Divine Provision, her Outgoing Healing increases by 20%, and all allies gain 12% SPD.',
    'E2: A Fully Outfitted Talisman — When an ally is hit by a killing blow while Divine Provision is active, they do not die, and are instead revived to 50% HP, while the duration of Divine Provision is reduced by 1 turn. Can trigger 2 times per battle.',
    'E3: Houttuynia Cordata — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.',
    'E4: Tangerine of War — When the Talent or Skill heals an ally, the healing is increased by up to 80% based on the target\'s missing HP.',
    'E5: Lively Wormwood — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.',
    'E6: Woven Together, Cohere Forever — The healing of characters affected by the Talent also increases their DMG dealt by 50% for 2 turns.',
  ],
  traces: [
    { stat: 'hpPct', value: 0.28 },
    { stat: 'effRes', value: 0.18 },
    { stat: 'spdFlat', value: 5 },
  ],
}

const MARCH7TH: CharProg = {
  base: { hp: 1058, atk: 511, def: 573, spd: 101 },
  byLevel: {
    10: { hp: 208, atk: 100, def: 113, spd: 101 },
    20: { hp: 280, atk: 135, def: 152, spd: 101 },
    30: { hp: 410, atk: 198, def: 222, spd: 101 },
    40: { hp: 540, atk: 261, def: 292, spd: 101 },
    50: { hp: 669, atk: 323, def: 362, spd: 101 },
    60: { hp: 799, atk: 386, def: 432, spd: 101 },
    70: { hp: 928, atk: 448, def: 503, spd: 101 },
    80: { hp: 1058, atk: 511, def: 573, spd: 101 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.38, 0.40375, 0.4275, 0.45125, 0.475, 0.494, 0.513, 0.532, 0.551, 0.57, 0.589, 0.608, 0.627, 0.646, 0.665],
    skill_a2: [190, 304, 389.5, 475, 532, 589, 631.75, 674.5, 717.25, 760, 802.75, 845.5, 888.25, 931, 973.75],
    ult: [0.9, 0.96, 1.02, 1.08, 1.14, 1.2, 1.275, 1.35, 1.425, 1.5, 1.56, 1.62, 1.68, 1.74, 1.8],
    ult_a2: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    talent: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8125, 0.875, 0.9375, 1, 1.05, 1.1, 1.15, 1.2, 1.25],
  },
  eidolons: [
    "E1: Every time March 7th's Ultimate Freezes a target, she regenerates 6 Energy.",
    "E2: Upon entering battle, grants a Shield equal to 24% of March 7th's DEF plus 320 to the ally with the lowest HP percentage, lasting for 3 turn(s).",
    "E3: Ultimate Lv. +2, up to a maximum of Lv. 15. | Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: The Talent's Counter effect can be triggered 1 more time in each turn. The DMG dealt by Counter increases by an amount that is equal to 30% of March 7th's DEF.",
    "E5: Skill Lv. +2, up to a maximum of Lv. 15. | Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Allies under the protection of the Shield granted by the Skill restore HP equal to 4% of their Max HP plus 106 at the beginning of each turn.",
  ],
  traces: [
    { stat: "defPct", value: 0.225 },
    { stat: "dmg:Ice", value: 0.224 },
    { stat: "effRes", value: 0.1 },
  ],
}

const DANHENG: CharProg = {
  base: { hp: 882, atk: 546, def: 396, spd: 110 },
  byLevel: {
    10: { hp: 174, atk: 107, def: 78, spd: 110 },
    20: { hp: 234, atk: 145, def: 105, spd: 110 },
    30: { hp: 342, atk: 212, def: 153, spd: 110 },
    40: { hp: 450, atk: 279, def: 202, spd: 110 },
    50: { hp: 558, atk: 345, def: 251, spd: 110 },
    60: { hp: 666, atk: 412, def: 299, spd: 110 },
    70: { hp: 774, atk: 479, def: 348, spd: 110 },
    80: { hp: 882, atk: 546, def: 396, spd: 110 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.3, 1.43, 1.56, 1.69, 1.82, 1.95, 2.1125, 2.275, 2.4375, 2.6, 2.73, 2.86, 2.99, 3.12, 3.25],
    ult: [2.4, 2.56, 2.72, 2.88, 3.04, 3.2, 3.4, 3.6, 3.8, 4, 4.16, 4.32, 4.48, 4.64, 4.8],
    ult_a2: [0.72, 0.768, 0.816, 0.864, 0.912, 0.96, 1.02, 1.08, 1.14, 1.2, 1.248, 1.296, 1.344, 1.392, 1.44],
    talent: [0.18, 0.198, 0.216, 0.234, 0.252, 0.27, 0.2925, 0.315, 0.3375, 0.36, 0.378, 0.396, 0.414, 0.432, 0.45],
  },
  eidolons: [
    "E1: When the target enemy's current HP percentage is greater than or equal to 50%, CRIT Rate increases by 12%.",
    "E2: Reduces Talent cooldown by 1 turn.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. | Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: When Dan Heng uses his Ultimate to defeat an enemy, he will immediately take action again.",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. | Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: The Slow state triggered by Skill reduces the enemy's SPD by an extra 8%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "defPct", value: 0.125 },
    { stat: "dmg:Wind", value: 0.224 },
  ],
}

const HIMEKO: CharProg = {
  base: { hp: 1047, atk: 756, def: 436, spd: 96 },
  byLevel: {
    10: { hp: 206, atk: 149, def: 86, spd: 96 },
    20: { hp: 277, atk: 200, def: 115, spd: 96 },
    30: { hp: 406, atk: 293, def: 169, spd: 96 },
    40: { hp: 534, atk: 386, def: 222, spd: 96 },
    50: { hp: 662, atk: 478, def: 276, spd: 96 },
    60: { hp: 791, atk: 571, def: 329, spd: 96 },
    70: { hp: 919, atk: 664, def: 383, spd: 96 },
    80: { hp: 1047, atk: 756, def: 436, spd: 96 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5],
    skill_a2: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1],
    ult: [1.38, 1.472, 1.564, 1.656, 1.748, 1.84, 1.955, 2.07, 2.185, 2.3, 2.392, 2.484, 2.576, 2.668, 2.76],
    ult_a2: Array(15).fill(5),
    talent: [0.7, 0.77, 0.84, 0.91, 0.98, 1.05, 1.1375, 1.225, 1.3125, 1.4, 1.47, 1.54, 1.61, 1.68, 1.75],
  },
  eidolons: [
    "E1: After \"Victory Rush\" is triggered, Himeko's SPD increases by 20% for 2 turn(s).",
    "E2: Deals 15% more DMG to enemies whose HP percentage is 50% or less.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. | Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: When Himeko's Skill inflicts Weakness Break on an enemy, she gains 100 extra point(s) of Charge.",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. | Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Ultimate deals 2 extra instances of Fire DMG equal to 40% of the original DMG to one random enemy.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "dmg:Fire", value: 0.224 },
    { stat: "effRes", value: 0.1 },
  ],
}

const WELT: CharProg = {
  base: { hp: 1125, atk: 620, def: 509, spd: 102 },
  byLevel: {
    10: { hp: 222, atk: 122, def: 100, spd: 102 },
    20: { hp: 298, atk: 164, def: 135, spd: 102 },
    30: { hp: 436, atk: 240, def: 197, spd: 102 },
    40: { hp: 574, atk: 316, def: 259, spd: 102 },
    50: { hp: 712, atk: 392, def: 322, spd: 102 },
    60: { hp: 849, atk: 468, def: 384, spd: 102 },
    70: { hp: 987, atk: 544, def: 446, spd: 102 },
    80: { hp: 1125, atk: 620, def: 509, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.36, 0.396, 0.432, 0.468, 0.504, 0.54, 0.585, 0.63, 0.675, 0.72, 0.756, 0.792, 0.828, 0.864, 0.9],
    skill_a1: [0.65, 0.66, 0.67, 0.68, 0.69, 0.7, 0.7125, 0.725, 0.7375, 0.75, 0.76, 0.77, 0.78, 0.79, 0.8],
    ult: [0.9, 0.96, 1.02, 1.08, 1.14, 1.2, 1.275, 1.35, 1.425, 1.5, 1.56, 1.62, 1.68, 1.74, 1.8],
    talent: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8125, 0.875, 0.9375, 1, 1.05, 1.1, 1.15, 1.2, 1.25],
  },
  eidolons: [
    "E1: After using a Skill or Ultimate to hit a target in the Weightless state, additionally deals 1 instance of Imaginary Additional DMG equal to 40% of the Ultimate's DMG multiplier. Once per target per attack.",
    "E2: When his Talent is triggered, Welt regenerates 3 Energy.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. | Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Enemy targets in the Weightless state have their All-Type RES reduced by 30%.",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. | Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: When using Skill or Ultimate to hit an enemy target in the Slow state, increases CRIT Rate by 30% and CRIT DMG by 60% for the DMG dealt.",
  ],
  traces: [
    { stat: "dmg:Imaginary", value: 0.144 },
    { stat: "ehr", value: 0.28 },
    { stat: "effRes", value: 0.1 },
  ],
}

const KAFKA: CharProg = {
  base: { hp: 1086, atk: 679, def: 485, spd: 100 },
  byLevel: {
    10: { hp: 214, atk: 133, def: 95, spd: 100 },
    20: { hp: 288, atk: 180, def: 128, spd: 100 },
    30: { hp: 421, atk: 263, def: 188, spd: 100 },
    40: { hp: 554, atk: 346, def: 247, spd: 100 },
    50: { hp: 687, atk: 429, def: 306, spd: 100 },
    60: { hp: 820, atk: 512, def: 366, spd: 100 },
    70: { hp: 953, atk: 595, def: 425, spd: 100 },
    80: { hp: 1086, atk: 679, def: 485, spd: 100 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.3, 1.4, 1.5, 1.6, 1.68, 1.76, 1.84, 1.92, 2],
    skill_a2: [0.6, 0.615, 0.63, 0.645, 0.66, 0.675, 0.69375, 0.7125, 0.73125, 0.75, 0.765, 0.78, 0.795, 0.81, 0.825],
    skill_a3: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    skill_a4: [0.4, 0.41, 0.42, 0.43, 0.44, 0.45, 0.4625, 0.475, 0.4875, 0.5, 0.51, 0.52, 0.53, 0.54, 0.55],
    ult: [0.48, 0.512, 0.544, 0.576, 0.608, 0.64, 0.68, 0.72, 0.76, 0.8, 0.832, 0.864, 0.896, 0.928, 0.96],
    ult_a2: [1, 1.02, 1.04, 1.06, 1.08, 1.1, 1.125, 1.15, 1.175, 1.2, 1.22, 1.24, 1.26, 1.28, 1.3],
    ult_a3: [1.16, 1.26875, 1.3775, 1.48625, 1.595, 1.758125, 1.975625, 2.2475, 2.57375, 2.9, 3.041375, 3.18275, 3.324125, 3.4655, 3.606875],
    talent: [0.42, 0.518, 0.616, 0.714, 0.812, 0.91, 1.0325, 1.155, 1.2775, 1.4, 1.498, 1.596, 1.694, 1.792, 1.89],
    talent_a2: Array(15).fill(1),
    talent_a3: Array(15).fill(2),
    talent_a4: Array(15).fill(1),
    talent_a5: Array(15).fill(2),
  },
  eidolons: [
    "E1: When using an attack, there is a 100% base chance to increase the DoT received by the target by 30% for 2 turn(s).",
    "E2: While Kafka is on the field, DoT dealt by all allies increases by 33%.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. | Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: When an enemy target takes DMG from the Shock status inflicted by Kafka, Kafka additionally regenerates 2 Energy.",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. | Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: The Shock state has a DMG multiplier increase of 156% and lasts 1 turn(s) longer.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "ehr", value: 0.18 },
  ],
}

const SILVERWOLF: CharProg = {
  base: { hp: 1047, atk: 640, def: 460, spd: 107 },
  byLevel: {
    10: { hp: 206, atk: 126, def: 90, spd: 107 },
    20: { hp: 277, atk: 169, def: 122, spd: 107 },
    30: { hp: 406, atk: 248, def: 178, spd: 107 },
    40: { hp: 534, atk: 326, def: 235, spd: 107 },
    50: { hp: 662, atk: 405, def: 291, spd: 107 },
    60: { hp: 791, atk: 483, def: 347, spd: 107 },
    70: { hp: 919, atk: 561, def: 404, spd: 107 },
    80: { hp: 1047, atk: 640, def: 460, spd: 107 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.98, 1.078, 1.176, 1.274, 1.372, 1.47, 1.5925, 1.715, 1.8375, 1.96, 2.058, 2.156, 2.254, 2.352, 2.45],
    skill_a2: [0.8, 0.84, 0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2],
    skill_a3: [0.105, 0.1075, 0.11, 0.1125, 0.115, 0.1175, 0.120625, 0.12375, 0.126875, 0.13, 0.1325, 0.135, 0.1375, 0.14, 0.1425],
    skill_a4: Array(15).fill(0.2),
    skill_a5: Array(15).fill(3),
    skill_a6: Array(15).fill(1),
    skill_a7: Array(15).fill(2),
    ult: [2.28, 2.432, 2.584, 2.736, 2.888, 3.04, 3.23, 3.42, 3.61, 3.8, 3.952, 4.104, 4.256, 4.408, 4.56],
    ult_a2: [0.36, 0.369, 0.378, 0.387, 0.396, 0.405, 0.41625, 0.4275, 0.43875, 0.45, 0.459, 0.468, 0.477, 0.486, 0.495],
    ult_a3: [0.8, 0.84, 0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12, 1.2, 1.2, 1.2, 1.2, 1.2, 1.2],
    talent: [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9, 0.95, 1, 1.04, 1.08, 1.12, 1.16, 1.2],
talent_a1: [0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08125, 0.0875, 0.09375, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125],
    talent_a2: [0.06, 0.066, 0.072, 0.078, 0.084, 0.09, 0.0975, 0.105, 0.1125, 0.12, 0.126, 0.132, 0.138, 0.144, 0.15],
    talent_a3: [0.03, 0.033, 0.036, 0.039, 0.042, 0.045, 0.04875, 0.0525, 0.05625, 0.06, 0.063, 0.066, 0.069, 0.072, 0.075],
  },
  eidolons: [
    "E1: After using Ultimate, regenerates 7 Energy per debuff on the target (max 5).",
    "E2: When an enemy enters combat, increases their DMG taken by 20%. When an enemy gets attacked by ally targets, Silver Wolf has a 100% base chance to implant 1 random Bug on that target.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: After using Ultimate, deals Quantum Additional DMG equal to 20% of ATK per debuff on the target (max 5).",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: DMG to a target increases by 20% per debuff, up to 100%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "dmg:Quantum", value: 0.08 },
    { stat: "ehr", value: 0.18 },
  ],
}

const LUOCHA: CharProg = {
  base: { hp: 1280, atk: 756, def: 363, spd: 101 },
  byLevel: {
    10: { hp: 252, atk: 149, def: 71, spd: 101 },
    20: { hp: 339, atk: 200, def: 96, spd: 101 },
    30: { hp: 496, atk: 293, def: 141, spd: 101 },
    40: { hp: 653, atk: 386, def: 185, spd: 101 },
    50: { hp: 810, atk: 478, def: 230, spd: 101 },
    60: { hp: 967, atk: 571, def: 274, spd: 101 },
    70: { hp: 1123, atk: 664, def: 319, spd: 101 },
    80: { hp: 1280, atk: 756, def: 363, spd: 101 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.4, 0.425, 0.45, 0.475, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.62, 0.64, 0.66, 0.68, 0.7],
    skill_a2: [200, 320, 410, 500, 560, 620, 665, 710, 755, 800, 845, 890, 935, 980, 1025],
    ult: [1.2, 1.28, 1.36, 1.44, 1.52, 1.6, 1.7, 1.8, 1.9, 2, 2.08, 2.16, 2.24, 2.32, 2.4],
    talent: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    talent_a2: [0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18, 0.186, 0.192, 0.198, 0.204, 0.21],
    talent_a3: [60, 96, 123, 150, 168, 186, 199.5, 213, 226.5, 240, 253.5, 267, 280.5, 294, 307.5],
  },
  eidolons: [
    "E1: While the Zone is active, ATK of all allies increases by 20%.",
    "E2: When the Skill triggers, the ally heals 30% more (HP<50%) or gains a shield (18% ATK + 240).",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: While the Zone is active, enemies are Weakened (deal 12% less DMG).",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: When Ultimate is used, reduces all enemies' All-Type RES by 20% for 2 turn(s).",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.125 },
    { stat: "hpPct", value: 0.18 },
  ],
}

const YUKONG: CharProg = {
  base: { hp: 917, atk: 599, def: 374, spd: 107 },
  byLevel: {
    10: { hp: 180, atk: 118, def: 73, spd: 107 },
    20: { hp: 243, atk: 159, def: 99, spd: 107 },
    30: { hp: 355, atk: 232, def: 145, spd: 107 },
    40: { hp: 468, atk: 306, def: 191, spd: 107 },
    50: { hp: 580, atk: 379, def: 237, spd: 107 },
    60: { hp: 692, atk: 452, def: 283, spd: 107 },
    70: { hp: 804, atk: 526, def: 328, spd: 107 },
    80: { hp: 917, atk: 599, def: 374, spd: 107 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1],
    ult: [2.28, 2.432, 2.584, 2.736, 2.888, 3.04, 3.23, 3.42, 3.61, 3.8, 3.952, 4.104, 4.256, 4.408, 4.56],
    ult_a2: [0.21, 0.217, 0.224, 0.231, 0.238, 0.245, 0.25375, 0.2625, 0.27125, 0.28, 0.287, 0.294, 0.301, 0.308, 0.315],
    ult_a3: [0.39, 0.416, 0.442, 0.468, 0.494, 0.52, 0.5525, 0.585, 0.6175, 0.65, 0.676, 0.702, 0.728, 0.754, 0.78],
    talent: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1],
  },
  eidolons: [
    "E1: At the start of battle, increases the SPD of all allies by 10% for 2 turn(s).",
    "E2: When an ally's energy equals the limit, Yukong regenerates an additional 5 energy (once per ally, resets on Ultimate).",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: While Roaring Bowstrings is active, Yukong deals 30% more DMG.",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: When Yukong uses her Ultimate, she immediately gains Roaring Bowstrings.",
  ],
  traces: [
    { stat: "atkPct", value: 0.1 },
    { stat: "hpPct", value: 0.18 },
    { stat: "dmg:Imaginary", value: 0.224 },
  ],
}

const BLADE: CharProg = {
  base: { hp: 1358, atk: 543, def: 485, spd: 97 },
  byLevel: {
    10: { hp: 267, atk: 107, def: 95, spd: 97 },
    20: { hp: 360, atk: 144, def: 128, spd: 97 },
    30: { hp: 526, atk: 210, def: 188, spd: 97 },
    40: { hp: 693, atk: 277, def: 247, spd: 97 },
    50: { hp: 859, atk: 343, def: 306, spd: 97 },
    60: { hp: 1025, atk: 410, def: 366, spd: 97 },
    70: { hp: 1191, atk: 476, def: 425, spd: 97 },
    80: { hp: 1358, atk: 543, def: 485, spd: 97 }
  },
  abilities: {
    basic: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
    skill: [0.12, 0.148, 0.176, 0.204, 0.232, 0.26, 0.295, 0.33, 0.365, 0.4, 0.428, 0.456, 0.484, 0.512, 0.54],
    basic_en: [0.65, 0.78, 0.91, 1.04, 1.17, 1.3, 1.43, 1.56, 1.69, 1.82],
    basic_en_a2: [0.26, 0.312, 0.364, 0.416, 0.468, 0.52, 0.572, 0.624, 0.676, 0.728],
    ult: [0.9, 0.96, 1.02, 1.08, 1.14, 1.2, 1.275, 1.35, 1.425, 1.5, 1.56, 1.62, 1.68, 1.74, 1.8],
    ult_a2: [0.72, 0.768, 0.816, 0.864, 0.912, 0.96, 1.02, 1.08, 1.14, 1.2, 1.248, 1.296, 1.344, 1.392, 1.44],
    ult_a3: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    ult_a4: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    talent: [0.65, 0.715, 0.78, 0.845, 0.91, 0.975, 1.05625, 1.1375, 1.21875, 1.3, 1.365, 1.43, 1.495, 1.56, 1.625],
  },
  eidolons: [
    "E1: Ultimate deals extra DMG equal to 1% of the tally of HP loss per tally (cap 90% Max HP).",
    "E2: While in Hellscape, CRIT Rate increases by 15%.",
    "E3: Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: When HP в‰¤ 50% of Max HP, Max HP increases by 20% (stacks up to 2).",
    "E5: Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Charge limit reduced to 4; Talent FUA deals extra DMG equal to 50% of Max HP.",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "hpPct", value: 0.28 },
    { stat: "effRes", value: 0.1 },
  ],
}

const LUKA: CharProg = {
  base: { hp: 917, atk: 582, def: 485, spd: 103 },
  byLevel: {
    10: { hp: 180, atk: 114, def: 95, spd: 103 },
    20: { hp: 243, atk: 154, def: 128, spd: 103 },
    30: { hp: 355, atk: 225, def: 188, spd: 103 },
    40: { hp: 468, atk: 297, def: 247, spd: 103 },
    50: { hp: 580, atk: 368, def: 306, spd: 103 },
    60: { hp: 692, atk: 439, def: 366, spd: 103 },
    70: { hp: 804, atk: 510, def: 425, spd: 103 },
    80: { hp: 917, atk: 582, def: 485, spd: 103 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28],
    basic_en_a2: [0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88, 0.96, 1.04, 1.12],
    skill: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    skill_cap: [1.3, 1.43, 1.56, 1.69, 1.82, 2.015, 2.275, 2.6, 2.99, 3.38, 3.549, 3.718, 3.887, 4.056, 4.225],
    ult: [1.98, 2.112, 2.244, 2.376, 2.508, 2.64, 2.805, 2.97, 3.135, 3.3, 3.432, 3.564, 3.696, 3.828, 3.96],
    ult_a2: [0.12, 0.128, 0.136, 0.144, 0.152, 0.16, 0.17, 0.18, 0.19, 0.2, 0.208, 0.216, 0.224, 0.232, 0.24],
    talent: [0.68, 0.697, 0.714, 0.731, 0.748, 0.765, 0.78625, 0.8075, 0.82875, 0.85, 0.867, 0.884, 0.901, 0.918, 0.935],
  },
  eidolons: [
    "E1: When Luka takes action and the target is Bleeding, DMG increases by 15% for 2 turn(s).",
    "E2: If the Skill hits a Physical-weak target, gain 1 stack(s) of Fighting Will.",
    "E3: Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: For every stack of Fighting Will, ATK increases by 5% (up to 4).",
    "E5: Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Enhanced Basic's Rising Uppercut on a Bleeding target deals extra Bleed DMG equal to 8% per Direct Punch hit.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.125 },
    { stat: "ehr", value: 0.18 },
  ],
}

const DANHENGIL: CharProg = {
  base: { hp: 1241, atk: 698, def: 363, spd: 102 },
  byLevel: {
    10: { hp: 244, atk: 137, def: 71, spd: 102 },
    20: { hp: 329, atk: 185, def: 96, spd: 102 },
    30: { hp: 481, atk: 270, def: 141, spd: 102 },
    40: { hp: 633, atk: 356, def: 185, spd: 102 },
    50: { hp: 785, atk: 441, def: 230, spd: 102 },
    60: { hp: 937, atk: 527, def: 274, spd: 102 },
    70: { hp: 1089, atk: 613, def: 319, spd: 102 },
    80: { hp: 1241, atk: 698, def: 363, spd: 102 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4],
    basic_en: [1.3,1.56,1.82,2.08,2.34,2.6,2.86,3.12,3.38,3.64],
    basic_en_a2: [1.9,2.28,2.66,3.04,3.42,3.8,4.18,4.56,4.94,5.32],
    basic_en_a2_adj: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84],
    basic_en_a3: [2.5,3,3.5,4,4.5,5,5.5,6,6.5,7],
    basic_en_a3_adj: [0.9,1.08,1.26,1.44,1.62,1.8,1.98,2.16,2.34,2.52],
    skill: [0.06,0.066,0.072,0.078,0.084,0.09,0.0975,0.105,0.1125,0.12,0.126,0.132,0.138,0.144,0.15],
    ult: [1.8,1.92,2.04,2.16,2.28,2.4,2.55,2.7,2.85,3,3.12,3.24,3.36,3.48,3.6],
    ult_a2: [0.84,0.896,0.952,1.008,1.064,1.12,1.19,1.26,1.33,1.4,1.456,1.512,1.568,1.624,1.68],
    talent: [0.05,0.055,0.06,0.065,0.07,0.075,0.0813,0.0875,0.0938,0.1,0.105,0.11,0.115,0.12,0.125],
  },
  eidolons: [
    "E1: Tethered to Sky — Righteous Heart max 10, +1 stack per hit.",
    "E2: Imperium on Cloud Nine — after Ultimate, action advanced 100% + 1 Squama.",
    "E3: Clothed in Clouds — Skill Lv. +2, Basic ATK Lv. +1.",
    "E4: Zephyr's Bliss — Outroar buff lasts until end of next turn.",
    "E5: Fall is the Pride — Ultimate Lv. +2, Talent Lv. +2.",
    "E6: Reign, Returned — after ally Ultimate, next Fulgurant Leap +20% Imaginary RES PEN (max 3).",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Imaginary", value: 0.224 },
  ],
}

const FUXUAN: CharProg = {
  base: { hp: 1474, atk: 465, def: 606, spd: 100 },
  byLevel: {
    10: { hp: 290, atk: 91, def: 119, spd: 100 },
    20: { hp: 391, atk: 123, def: 160, spd: 100 },
    30: { hp: 571, atk: 180, def: 235, spd: 100 },
    40: { hp: 752, atk: 237, def: 309, spd: 100 },
    50: { hp: 932, atk: 294, def: 383, spd: 100 },
    60: { hp: 1113, atk: 351, def: 457, spd: 100 },
    70: { hp: 1294, atk: 408, def: 532, spd: 100 },
    80: { hp: 1474, atk: 465, def: 606, spd: 100 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7],
    skill: [0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65,0.65],
    skill_a2: [0.03,0.033,0.036,0.039,0.042,0.045,0.0488,0.0525,0.0563,0.06,0.063,0.066,0.069,0.072,0.075],
    skill_a3: [0.06,0.066,0.072,0.078,0.084,0.09,0.0975,0.105,0.1125,0.12,0.126,0.132,0.138,0.144,0.15],
    ult: [0.6,0.64,0.68,0.72,0.76,0.8,0.85,0.9,0.95,1,1.04,1.08,1.12,1.16,1.2],
    talent: [0.1,0.108,0.116,0.124,0.132,0.14,0.15,0.16,0.17,0.18,0.188,0.196,0.204,0.212,0.22],
    talent_a2: [0.8,0.81,0.82,0.83,0.84,0.85,0.8625,0.875,0.8875,0.9,0.91,0.92,0.93,0.94,0.95],
  },
  eidolons: [
    "E1: Dominus Pacis — Knowledge CRIT DMG +30%.",
    "E2: Optimus Felix — killing blow under Matrix instead restores 70% Max HP (1 per battle).",
    "E3: Apex Nexus — Skill Lv. +2, Talent Lv. +2.",
    "E4: Fortuna Stellaris — allies hit under Matrix → Fu Xuan +5 Energy.",
    "E5: Arbiter Primus — Ultimate Lv. +2, Basic ATK Lv. +1.",
    "E6: Omnia Vita — Ultimate DMG +2% of team HP-loss tally (cap 120% of Max HP), resets after Ultimate.",
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "hpPct", value: 0.18 },
    { stat: "effRes", value: 0.1 },
  ],
}

const LYNX: CharProg = {
  base: { hp: 1058, atk: 493, def: 551, spd: 100 },
  byLevel: {
    10: { hp: 208, atk: 97, def: 108, spd: 100 },
    20: { hp: 280, atk: 131, def: 146, spd: 100 },
    30: { hp: 410, atk: 191, def: 213, spd: 100 },
    40: { hp: 540, atk: 252, def: 281, spd: 100 },
    50: { hp: 669, atk: 312, def: 348, spd: 100 },
    60: { hp: 799, atk: 372, def: 416, spd: 100 },
    70: { hp: 928, atk: 433, def: 483, spd: 100 },
    80: { hp: 1058, atk: 493, def: 551, spd: 100 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7],
    skill: [0.05,0.0525,0.055,0.0575,0.06,0.0625,0.0656,0.0688,0.0719,0.075,0.0775,0.08,0.0825,0.085,0.0875],
    skill_a2: [50,80,102.5,125,140,155,166.25,177.5,188.75,200,211.25,222.5,233.75,245,256.25],
    skill_a3: [0.08,0.085,0.09,0.095,0.1,0.104,0.108,0.112,0.116,0.12,0.124,0.128,0.132,0.136,0.14],
    skill_a4: [80,128,164,200,224,248,266,284,302,320,338,356,374,392,410],
    ult: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ult_a2: [0.09,0.0956,0.1013,0.1069,0.1125,0.117,0.1215,0.126,0.1305,0.135,0.1395,0.144,0.1485,0.153,0.1575],
    ult_a3: [90,144,184.5,225,252,279,299.25,319.5,339.75,360,380.25,400.5,420.75,441,461.25],
    talent: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2],
    talent_a2: [0.024,0.0255,0.027,0.0285,0.03,0.0312,0.0324,0.0336,0.0348,0.036,0.0372,0.0384,0.0396,0.0408,0.042],
    talent_a3: [24,38.4,49.2,60,67.2,74.4,79.8,85.2,90.6,96,101.4,106.8,112.2,117.6,123],
    talent_a4: [0.03,0.0319,0.0338,0.0356,0.0375,0.039,0.0405,0.042,0.0435,0.045,0.0465,0.048,0.0495,0.051,0.0525],
    talent_a5: [30,48,61.5,75,84,93,99.75,106.5,113.25,120,126.75,133.5,140.25,147,153.75],
  },
  eidolons: [
    "E1: Morning of Snow Hike — healing allies at в‰¤50% HP +20% Outgoing.",
    "E2: Noon of Portable Furnace — Survival Response target resists 1 debuff.",
    "E3: Afternoon of Avalanche Beacon — Skill Lv. +2, Basic ATK Lv. +1.",
    "E4: Dusk of Warm Campfire — Survival Response gives target ATK +3% of Lynx Max HP.",
    "E5: Night of Aurora Tea — Ultimate Lv. +2, Talent Lv. +2.",
    "E6: Dawn of Explorers' Chart — Survival Response Max HP bonus +6% of Lynx Max HP, Effect RES +30%.",
  ],
  traces: [
    { stat: "defPct", value: 0.225 },
    { stat: "hpPct", value: 0.28 },
    { stat: "effRes", value: 0.1 },
  ],
}

const TOPAZ: CharProg = {
  base: { hp: 931, atk: 620, def: 412, spd: 110 },
  byLevel: {
    10: { hp: 183, atk: 122, def: 81, spd: 110 },
    20: { hp: 247, atk: 164, def: 109, spd: 110 },
    30: { hp: 361, atk: 240, def: 159, spd: 110 },
    40: { hp: 475, atk: 316, def: 210, spd: 110 },
    50: { hp: 589, atk: 392, def: 260, spd: 110 },
    60: { hp: 703, atk: 468, def: 311, spd: 110 },
    70: { hp: 817, atk: 544, def: 361, spd: 110 },
    80: { hp: 931, atk: 620, def: 412, spd: 110 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4],
    skill: [0.75,0.825,0.9,0.975,1.05,1.125,1.2188,1.3125,1.4063,1.5,1.575,1.65,1.725,1.8,1.875],
    skill_a2: [0.25,0.275,0.3,0.325,0.35,0.375,0.4063,0.4375,0.4688,0.5,0.525,0.55,0.575,0.6,0.625],
    ult: [0.75,0.825,0.9,0.975,1.05,1.125,1.2188,1.3125,1.4063,1.5,1.575,1.65,1.725,1.8,1.875],
    ult_a2: [0.125,0.1375,0.15,0.1625,0.175,0.1875,0.2031,0.2188,0.2344,0.25,0.2625,0.275,0.2875,0.3,0.3125],
    talent: [0.75,0.825,0.9,0.975,1.05,1.125,1.2188,1.3125,1.4063,1.5,1.575,1.65,1.725,1.8,1.875],
    talent_a2: [0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5],
  },
  eidolons: [
    "E1: Future Market — FUA on Proof of Debt enemy gives Debtor (+25% FUA CRIT DMG, 2 stacks).",
    "E2: Bona Fide Acquisition — Numby attacks → Topaz +5 Energy.",
    "E3: Seize the Big and Free the Small — Skill Lv. +2, Basic ATK Lv. +1.",
    "E4: Agile Operation — Numby acts → Topaz +20% action advance.",
    "E5: Inflationary Demand — Ultimate Lv. +2, Talent Lv. +2.",
    "E6: Incentive Mechanism — Windfall attack count +1 (= 3), Numby Fire RES PEN +10%.",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "dmg:Fire", value: 0.224 },
    { stat: "hpPct", value: 0.1 },
  ],
}

const JINGLIU: CharProg = {
  base: { hp: 1435, atk: 679, def: 485, spd: 96 },
  byLevel: {
    10: { hp: 283, atk: 133, def: 95, spd: 96 },
    20: { hp: 380, atk: 180, def: 128, spd: 96 },
    30: { hp: 556, atk: 263, def: 188, spd: 96 },
    40: { hp: 732, atk: 346, def: 247, spd: 96 },
    50: { hp: 908, atk: 429, def: 306, spd: 96 },
    60: { hp: 1084, atk: 512, def: 366, spd: 96 },
    70: { hp: 1260, atk: 595, def: 425, spd: 96 },
    80: { hp: 1435, atk: 679, def: 485, spd: 96 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7],
    skill: [0.75,0.825,0.9,0.975,1.05,1.125,1.2188,1.3125,1.4063,1.5,1.575,1.65,1.725,1.8,1.875],
    skill_en: [0.75,0.825,0.9,0.975,1.05,1.125,1.2188,1.3125,1.4063,1.5,1.575,1.65,1.725,1.8,1.875],
    skill_en_a2: [0.375,0.4125,0.45,0.4875,0.525,0.5625,0.6094,0.6563,0.7031,0.75,0.7875,0.825,0.8625,0.9,0.9375],
    ult: [0.9,0.99,1.08,1.17,1.26,1.35,1.4625,1.575,1.6875,1.8,1.89,1.98,2.07,2.16,2.25],
    ult_a2: [0.45,0.495,0.54,0.585,0.63,0.675,0.7313,0.7875,0.8438,0.9,0.945,0.99,1.035,1.08,1.125],
    talent: [0.22,0.242,0.264,0.286,0.308,0.33,0.3575,0.385,0.4125,0.44,0.462,0.484,0.506,0.528,0.55],
    talent_a2: [0.4,0.41,0.42,0.43,0.44,0.45,0.4625,0.475,0.4875,0.5,0.51,0.52,0.53,0.54,0.55],
    talent_a3: [20,20,20,20,20,20,20,20,20,20,20,20,20,20,20],
  },
  eidolons: [
    "E1: Moon Crashes Tianguan Gate — Ult/Enhanced Skill CRIT DMG +36% (1 turn); also 1 instance Ice DMG = 80% of Max HP to primary target.",
    "E2: Crescent Shadows Qixing Dipper — after Ultimate, next Enhanced Skill DMG +80%.",
    "E3: Halfmoon Gapes Mercurial Haze — Ultimate Lv. +2, Talent Lv. +2.",
    "E4: Lunarlance Shines Skyward Dome — in Spectral state, each Moonlight stack additionally +20% CRIT DMG.",
    "E5: Night Shades Astral Radiance — Skill Lv. +2, Basic ATK Lv. +1.",
    "E6: Eclipse Hollows Corporeal Husk — Syzygy stack limit +1; entering Spectral +2 stacks; in state Ice RES PEN +30%.",
  ],
  traces: [
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.1 },
    { stat: "spdFlat", value: 9 },
  ],
}

const TINGYUN: CharProg = {
  base: { hp: 846, atk: 529, def: 396, spd: 112 },
  byLevel: {
    10: { hp: 167, atk: 104, def: 78, spd: 112 },
    20: { hp: 224, atk: 140, def: 105, spd: 112 },
    30: { hp: 328, atk: 205, def: 153, spd: 112 },
    40: { hp: 432, atk: 270, def: 202, spd: 112 },
    50: { hp: 535, atk: 334, def: 251, spd: 112 },
    60: { hp: 639, atk: 399, def: 299, spd: 112 },
    70: { hp: 743, atk: 464, def: 348, spd: 112 },
    80: { hp: 846, atk: 529, def: 396, spd: 112 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4],
    skill: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5],
    skill_a2: [0.25,0.275,0.3,0.325,0.35,0.375,0.40625,0.4375,0.46875,0.5,0.525,0.55,0.575,0.6,0.625],
    skill_a3: [0.15,0.16,0.17,0.18,0.19,0.2,0.2125,0.225,0.2375,0.25,0.26,0.27,0.28,0.29,0.3],
    ult: [0.2,0.23,0.26,0.29,0.32,0.35,0.3875,0.425,0.4625,0.5,0.53,0.56,0.59,0.62,0.65],
    talent: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75],
  },
  eidolons: [
    "E1: Windfall of Lucky Springs — After using their Ultimate, the ally with Benediction gains a 20% increase in SPD for 1 turn.",
    "E2: Gainfully Gives, Givingly Gains — The ally with Benediction regenerates 5 Energy after defeating an enemy. This effect can only be triggered once per turn.",
    "E3: Halcyon Bequest — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Jovial Versatility — The DMG multiplier provided by Benediction increases by 20%.",
    "E5: Sauntering Coquette — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Peace Brings Wealth to All — Ultimate regenerates 10 more Energy for the target ally.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.225 },
    { stat: "dmg:Lightning", value: 0.08 },
  ],
}

const BLACKSWAN: CharProg = {
  base: { hp: 1086, atk: 659, def: 485, spd: 102 },
  byLevel: {
    10: { hp: 214, atk: 130, def: 95, spd: 102 },
    20: { hp: 288, atk: 175, def: 128, spd: 102 },
    30: { hp: 421, atk: 255, def: 188, spd: 102 },
    40: { hp: 554, atk: 336, def: 247, spd: 102 },
    50: { hp: 687, atk: 417, def: 306, spd: 102 },
    60: { hp: 820, atk: 498, def: 366, spd: 102 },
    70: { hp: 953, atk: 578, def: 425, spd: 102 },
    80: { hp: 1086, atk: 659, def: 485, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.45, 0.495, 0.54, 0.585, 0.63, 0.675, 0.73125, 0.7875, 0.84375, 0.9, 0.945, 0.99, 1.035, 1.08, 1.125],
    skill_a2: [0.148, 0.154, 0.16, 0.166, 0.172, 0.178, 0.1855, 0.193, 0.2005, 0.208, 0.214, 0.22, 0.226, 0.232, 0.238],
    ult: [0.72, 0.768, 0.816, 0.864, 0.912, 0.96, 1.02, 1.08, 1.14, 1.2, 1.248, 1.296, 1.344, 1.392, 1.44],
    ult_a2: [0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3],
    talent: [0.96, 1.1184, 1.2768, 1.4352, 1.5936, 1.752, 1.896, 2.04, 2.22, 2.4, 2.52, 2.64, 2.76, 2.88, 3],
    talent_a2: [0.5, 0.515, 0.53, 0.545, 0.56, 0.575, 0.5937, 0.6125, 0.63125, 0.65, 0.665, 0.68, 0.695, 0.71, 0.725],
    talent_a3: [0.048, 0.05592, 0.06384, 0.07176, 0.07968, 0.0876, 0.0948, 0.102, 0.111, 0.12, 0.126, 0.132, 0.138, 0.144, 0.15],
    talent_a4: [0.72, 0.8388, 0.9576, 1.0764, 1.1952, 1.314, 1.422, 1.53, 1.665, 1.8, 1.89, 1.98, 2.07, 2.16, 2.25],
  },
  eidolons: [
    "E1: Seven Pillars of Wisdom — Enemies afflicted with Wind Shear, Bleed, Burn, or Shock have their corresponding Wind, Physical, Fire, or Lightning RES reduced by 25%.",
    "E2: Weep Not For Me, My Lamb — When enemy targets enter combat, 100% base chance to inflict 30 stacks of Arcana.",
    "E3: As Above, So Below — Skill Lv. +2, Talent Lv. +2.",
    "E4: In Tears We Gift — While in Epiphany, enemies take 20% increased DMG; at start of their turns or when defeated, Black Swan regenerates 8 Energy.",
    "E5: Linnutee Flyway — Ultimate Lv. +2, Basic ATK Lv. +1.",
    "E6: Pantheon Merciful, Masses Pitiful — Arcana stack cap +30; allies attacking the target: 65% base chance to inflict 1 Arcana stack; every Arcana stack Black Swan inflicts adds +1 extra.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "ehr", value: 0.1 },
    { stat: "dmg:Wind", value: 0.144 },
  ],
}

// base = round(row6 stat × 2.16), spd = row6.spd (wiki level-80 values)
const SPARXIE: CharProg = {
  base: { hp: 1047, atk: 640, def: 460, spd: 107 },
  byLevel: {
    10: { hp: 206, atk: 126, def: 90, spd: 107 },
    20: { hp: 277, atk: 169, def: 122, spd: 107 },
    30: { hp: 406, atk: 248, def: 178, spd: 107 },
    40: { hp: 534, atk: 326, def: 235, spd: 107 },
    50: { hp: 662, atk: 405, def: 291, spd: 107 },
    60: { hp: 791, atk: 483, def: 347, spd: 107 },
    70: { hp: 919, atk: 561, def: 404, spd: 107 },
    80: { hp: 1047, atk: 640, def: 460, spd: 107 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en_a2: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
    skill: Array(15).fill(20), // Boom!: Engagement Farming cap per livestream
    ult: [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.425, 0.45, 0.475, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6],
    ult_a2: Array(15).fill(0.6), // Elation coefficient on Ult
    talent: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25],
    talent_a2: [0.24, 0.264, 0.288, 0.312, 0.336, 0.36, 0.39, 0.42, 0.45, 0.48, 0.504, 0.528, 0.552, 0.576, 0.6],
    talent_a3: [0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.325, 0.35, 0.375, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5],
    talent_a4: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25],
    el_skill: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    el_skill_a2: [0.125, 0.1375, 0.15, 0.1625, 0.175, 0.1875, 0.203125, 0.21875, 0.234375, 0.25, 0.2625, 0.275, 0.2875, 0.3, 0.3125],
    el_skill_a3: Array(15).fill(20), // extra DMG instances
    engage: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25],
    engage_a2: [0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08125, 0.0875, 0.09375, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125],
  },
  eidolons: [
    "E1: Going Viral WhoIsShe — When Aha Instant ends, gains 5 Punchline. Per Punchline, all allies All-Type RES PEN +1.5% (max 15%).",
    "E2: AudienceKnows — When Aha Instant ends, +1 extra turn and 2 Thrill. Per Thrill consumed, CRIT DMG +10% for 2 turns (max 4 stacks).",
    "E4: LockedIn FaceCard — Ult additionally +5 Punchline and Elation +36% for 3 turns.",
    "E6: BuiltDifferent — All-Type RES PEN +20%. Per Punchline, +1 Elation Skill extra DMG instance (max 40).",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "critDmg", value: 0.133 },
    { stat: "elation", value: 0.28 },
  ],
}

const AGLAEA: CharProg = {
  base: { hp: 1241, atk: 698, def: 485, spd: 102 },
  byLevel: {
    10: { hp: 244, atk: 137, def: 95, spd: 102 },
    20: { hp: 329, atk: 185, def: 128, spd: 102 },
    30: { hp: 481, atk: 270, def: 188, spd: 102 },
    40: { hp: 633, atk: 356, def: 247, spd: 102 },
    50: { hp: 785, atk: 441, def: 306, spd: 102 },
    60: { hp: 937, atk: 527, def: 366, spd: 102 },
    70: { hp: 1089, atk: 613, def: 425, spd: 102 },
    80: { hp: 1241, atk: 698, def: 485, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8],
    basic_en_a2: [0.45, 0.54, 0.63, 0.72, 0.81, 0.9, 0.99, 1.08, 1.17, 1.26],
    basic_en_a3: [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8],
    basic_en_a4: [0.45, 0.54, 0.63, 0.72, 0.81, 0.9, 0.99, 1.08, 1.17, 1.26],
    skill: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    ult: [0.1, 0.105, 0.11, 0.115, 0.12, 0.125, 0.13125, 0.1375, 0.14375, 0.15, 0.155, 0.16, 0.165, 0.17, 0.175],
    ult_a2: Array(15).fill(100), // countdown SPD
    talent: [0.12, 0.138, 0.156, 0.174, 0.192, 0.21, 0.2325, 0.255, 0.2775, 0.3, 0.318, 0.336, 0.354, 0.372, 0.39],
    talent_a2: Array(15).fill(0.35), // mem SPD = % of Aglaea SPD
    talent_a3: [0.44, 0.4675, 0.495, 0.5225, 0.55, 0.572, 0.594, 0.616, 0.638, 0.66, 0.682, 0.704, 0.726, 0.748, 0.77],
    talent_a4: [180, 247.5, 315, 382.5, 450, 504, 558, 612, 666, 720, 774, 828, 882, 936, 990],
    mem_skill: [0.55, 0.66, 0.77, 0.88, 0.99, 1.1, 1.21, 1.32, 1.43, 1.54],
    mem_skill_a2: [0.33, 0.396, 0.462, 0.528, 0.594, 0.66, 0.726, 0.792, 0.858, 0.924],
    mem_talent: [44, 46.2, 48.4, 50.6, 52.8, 55, 57.2, 59.4, 61.6, 63.8], // SPD boost on Seam Stitch hit
  },
  eidolons: [
    "E1: Drift at the Whim of Venus — Seam Stitch target takes +15% DMG; Aglaea/Garmentmaker attack → +20 Energy.",
    "E2: Sail on the Raft of Eyelids — A/G action: 14% DEF ignore, stacks 3×.",
    "E4: Flicker Below the Surface of Marble — mem SPD boost max stacks +1.",
    "E6: Fluctuate in the Tapestry of Fates — Supreme Stance: A/G Lightning RES PEN +20%; SPD>160/240/320 → Joint ATK +10/30/60%.",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "defPct", value: 0.125 },
    { stat: "dmg:Lightning", value: 0.224 },
  ],
}

// Hyacine — Remembrance/Wind, Abundance-РєР»Р°СЃСЃРЅС‹Р№ С…РёР»РµСЂ+СЃСѓР±-DPS С‡РµСЂРµР· РјРµРјРѕСЃРїСЂР°Р№С‚ Little Ica.
// base = round(character.json lv80 stat × 2.16), spd = lv80 spd (110).
// Ica: 0 SPD, РќР• РІ Р±РѕРµРІРѕРј РїРѕСЂСЏРґРєРµ, РґРµР№СЃС‚РІСѓРµС‚ СЃРѕР±С‹С‚РёР№РЅРѕ (onAllyTurnStart/onAllyHeal/After Rain extra turn).
const HYACINE: CharProg = {
  base: { hp: 1086, atk: 388, def: 630, spd: 110 },
  byLevel: {
    10: { hp: 214, atk: 76, def: 124, spd: 110 },
    20: { hp: 288, atk: 102, def: 167, spd: 110 },
    30: { hp: 421, atk: 150, def: 244, spd: 110 },
    40: { hp: 554, atk: 198, def: 321, spd: 110 },
    50: { hp: 687, atk: 245, def: 398, spd: 110 },
    60: { hp: 820, atk: 293, def: 476, spd: 110 },
    70: { hp: 953, atk: 340, def: 553, spd: 110 },
    80: { hp: 1086, atk: 388, def: 630, spd: 110 }
  },
  abilities: {
    basic: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7], // %MaxHP
    skill: [0.04, 0.045, 0.05, 0.055, 0.06, 0.064, 0.068, 0.072, 0.076, 0.08, 0.084, 0.088, 0.092, 0.096, 0.1], // heal all %MaxHP
    skill_a2: [0.05, 0.05625, 0.0625, 0.06875, 0.075, 0.08, 0.085, 0.09, 0.095, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125], // heal Ica %MaxHP
    skill_flat: [40, 64, 82, 100, 112, 124, 133, 142, 151, 160, 169, 178, 187, 196, 205], // heal all flat (140902 #2)
    skill_a2_flat: [50, 80, 102.5, 125, 140, 155, 166.25, 177.5, 188.75, 200, 211.25, 222.5, 233.75, 245, 256.25], // heal Ica flat (140902 #4)
    ult: [0.05, 0.05625, 0.0625, 0.06875, 0.075, 0.08, 0.085, 0.09, 0.095, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125], // heal all %MaxHP
    ult_a2: [0.06, 0.0675, 0.075, 0.0825, 0.09, 0.096, 0.102, 0.108, 0.114, 0.12, 0.126, 0.132, 0.138, 0.144, 0.15], // heal Ica %MaxHP
    ult_flat: [50, 80, 102.5, 125, 140, 155, 166.25, 177.5, 188.75, 200, 211.25, 222.5, 233.75, 245, 256.25], // heal all flat (140903 #2)
    ult_a2_flat: [60, 96, 123, 150, 168, 186, 199.5, 213, 226.5, 240, 253.5, 267, 280.5, 294, 307.5], // heal Ica flat (140903 #7)
    ult_a3: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // After Rain: ally MaxHP % (140903 #3)
    ult_a4: [150, 240, 307.5, 375, 420, 465, 498.75, 532.5, 566.25, 600, 633.75, 667.5, 701.25, 735, 768.75], // After Rain: ally MaxHP flat (140903 #4)
    ult_turns: Array(15).fill(3), // After Rain duration (turns)
    talent: Array(15).fill(0.5), // Ica MaxHP = % of Hyacine MaxHP
    talent_a2: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1], // Ica DMG+ per heal stack
    talent_a3: Array(15).fill(2), // heal-stack turns
    talent_a4: Array(15).fill(3), // max DMG+ stacks
    mem_skill: [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28], // Rainclouds: % of healing tally
    mem_skill_a2: Array(10).fill(0.5), // % of tally cleared (E6 → 0.12, handled in kit)
    mem_talent: Array(10).fill(0.04), // Take Sky: Ica consumes % of own MaxHP
    mem_talent_a2: [0.01, 0.012, 0.014, 0.016, 0.018, 0.02, 0.022, 0.024, 0.026, 0.028], // Take Sky: heal % of Hyacine MaxHP
    mem_talent_a3: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28], // Take Sky: flat heal
    mem_talent_a4: [0.01, 0.012, 0.014, 0.016, 0.018, 0.02, 0.022, 0.024, 0.026, 0.028], // Take Sky: AoE heal % of Hyacine MaxHP (all other allies)
    mem_talent_a5: [10, 12, 14, 16, 18, 20, 22, 24, 26, 28], // Take Sky: AoE flat heal
    mem_skill2: Array(10).fill(15), // Soar: +Energy on summon
    mem_skill2_a2: Array(10).fill(30), // Soar: extra Energy on FIRST summon
    mem_talent_a6: Array(10).fill(0.3), // Fall, Then Take Wing: Hyacine action advance on Ica disappear (1140906 #1 = 0.3)
  },
  eidolons: [
    "E1: Cradle the Candle of Night — After Rain: all allies MaxHP+50%; after ally attack, restore 8% Hyacine MaxHP.",
    "E2: Come Sit in My Courtyard — ally HP drops → their SPD+30% for 2 turns.",
    "E3: Depart, Unto the Sun! — Ult Lv.+2, Basic Lv.+1, Memosprite Skill Lv.+1.",
    "E4: Sunlit Amber, Yours to Keep — Tempestuous Halt enhanced: excess SPD also +2% CRIT DMG.",
    "E5: Twilight Drapes the Tide — Skill Lv.+2, Talent Lv.+2, Memosprite Talent Lv.+1.",
    "E6: O Sky, Heed My Plea — Ica clears 12% of tally; while Ica on field, all allies All-Type RES PEN+20%.",
  ],
  traces: [
    { stat: "hpPct", value: 0.10 },
    { stat: "spdFlat", value: 14 },
    { stat: "effRes", value: 0.18 },
  ],
}

// Tribbie — Quantum/Shaman (Harmony). MaxHP-scaled support-DPS: skill Numinosity (all-ally RES PEN),
// ult Zone (enemy DMG-taken vuln + per-hit Additional DMG), talent FUA after ally ults.
// base = round(character.json lv80 stat × 2.16), spd = lv80 spd (96).
const TRIBBie: CharProg = {
  base: { hp: 1047, atk: 523, def: 727, spd: 96 },
  byLevel: {
    10: { hp: 206, atk: 103, def: 143, spd: 96 },
    20: { hp: 277, atk: 138, def: 193, spd: 96 },
    30: { hp: 406, atk: 203, def: 282, spd: 96 },
    40: { hp: 534, atk: 267, def: 371, spd: 96 },
    50: { hp: 662, atk: 331, def: 460, spd: 96 },
    60: { hp: 791, atk: 395, def: 549, spd: 96 },
    70: { hp: 919, atk: 459, def: 638, spd: 96 },
    80: { hp: 1047, atk: 523, def: 727, spd: 96 }
  },
  abilities: {
    basic: [0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.33, 0.36, 0.39, 0.42], // %MaxHP main
    basic_en: [0.075, 0.09, 0.105, 0.12, 0.135, 0.15, 0.165, 0.18, 0.195, 0.21], // %MaxHP adjacent
    skill: [0.12, 0.132, 0.144, 0.156, 0.168, 0.18, 0.195, 0.21, 0.225, 0.24, 0.252, 0.264, 0.276, 0.288, 0.3], // all-ally RES PEN
    skill_a2: Array(15).fill(3), // Numinosity duration (turns)
    ult: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // %MaxHP AoE
    ult_a2: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // enemy DMG-taken vuln
    ult_a3: [0.06, 0.066, 0.072, 0.078, 0.084, 0.09, 0.0975, 0.105, 0.1125, 0.12, 0.126, 0.132, 0.138, 0.144, 0.15], // Additional DMG %MaxHP per hit
    ult_turns: Array(15).fill(2), // Zone duration
    talent: [0.09, 0.099, 0.108, 0.117, 0.126, 0.135, 0.14625, 0.1575, 0.16875, 0.18, 0.189, 0.198, 0.207, 0.216, 0.225], // FUA %MaxHP AoE
  },
  eidolons: [
    "E1: While Zone lasts, ally attacks deal True DMG = 24% of this attack's total DMG to targets dealt Zone Additional DMG.",
    "E2: Zone Additional DMG ×120% + 1 extra instance.",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: While Numinosity, all allies ignore 18% DEF.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: After Tribbie Ult, launches Talent FUA, FUA DMG +729%.",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.1 },
  ],
}

// Sunday — Imaginary/Shaman (Harmony). Support: skill immediate-advances a target (+DMG, more with a
// summon, Talent CRIT Rate), ult turns target & summon "Beatified" (CRIT DMG = frac of Sunday's CD).
// base = round(character.json lv80 stat × 2.16), spd = lv80 spd (96).
const SUNDAY: CharProg = {
  base: { hp: 1241, atk: 640, def: 533, spd: 96 },
  byLevel: {
    10: { hp: 244, atk: 126, def: 105, spd: 96 },
    20: { hp: 329, atk: 169, def: 141, spd: 96 },
    30: { hp: 481, atk: 248, def: 206, spd: 96 },
    40: { hp: 633, atk: 326, def: 272, spd: 96 },
    50: { hp: 785, atk: 405, def: 337, spd: 96 },
    60: { hp: 937, atk: 483, def: 402, spd: 96 },
    70: { hp: 1089, atk: 561, def: 468, spd: 96 },
    80: { hp: 1241, atk: 640, def: 533, spd: 96 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Imaginary DMG %ATK
    skill: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // DMG+ %
    skill_a2: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625], // extra DMG+ w/ summon
    ult: Array(15).fill(0.2), // energy regen % of target max energy
    ult_a2: [0.12, 0.138, 0.156, 0.174, 0.192, 0.21, 0.2325, 0.255, 0.2775, 0.3, 0.318, 0.336, 0.354, 0.372, 0.39], // CRIT DMG = frac of Sunday CD
    ult_a3: [0.08, 0.084, 0.088, 0.092, 0.096, 0.1, 0.105, 0.11, 0.115, 0.12, 0.124, 0.128, 0.132, 0.136, 0.14], // flat CD added to The Beatified (ult #4)
    talent: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25], // Talent CRIT Rate %
  },
  eidolons: [
    "E1: Skill -> target ignores 16% DEF, their summon ignores 40% DEF, 2 turns.",
    "E2: First ult recovers 2 SP. The Beatified deal +30% DMG.",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: +8 Energy at turn start.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: Talent CRIT Rate stacks up to 3x, +1 turn. Ult also applies the Talent CRIT Rate boost.",
  ],
  traces: [
    { stat: "critDmg", value: 0.373 },
    { stat: "defPct", value: 0.125 },
    { stat: "effRes", value: 0.18 },
  ],
}

// Dan Heng вЂў Permansor Terrae — Physical/Shaman (Preservation). Bondmate + team shields + Souldragon
// guardian summon (event-driven). base = round(character.json lv80 stat × 2.16), spd = lv80 spd (97).
const DANHENGPERMAN: CharProg = {
  base: { hp: 1047, atk: 582, def: 776, spd: 97 },
  byLevel: {
    10: { hp: 206, atk: 114, def: 153, spd: 97 },
    20: { hp: 277, atk: 154, def: 205, spd: 97 },
    30: { hp: 406, atk: 225, def: 300, spd: 97 },
    40: { hp: 534, atk: 297, def: 396, spd: 97 },
    50: { hp: 662, atk: 368, def: 491, spd: 97 },
    60: { hp: 791, atk: 439, def: 586, spd: 97 },
    70: { hp: 919, atk: 510, def: 681, spd: 97 },
    80: { hp: 1047, atk: 582, def: 776, spd: 97 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Physical DMG %ATK
    skill: [0.14, 0.1475, 0.155, 0.1625, 0.17, 0.176, 0.182, 0.188, 0.194, 0.2, 0.206, 0.212, 0.218, 0.224, 0.23], // skill shield % DH ATK
    skill_a2: [100, 160, 205, 250, 280, 310, 332.5, 355, 377.5, 400, 422.5, 445, 467.5, 490, 512.5], // skill shield flat
    talent: [0.07, 0.07375, 0.0775, 0.08125, 0.085, 0.088, 0.091, 0.094, 0.097, 0.1, 0.103, 0.106, 0.109, 0.112, 0.115], // dragon shield % DH ATK
    talent_a2: [50, 80, 102.5, 125, 140, 155, 166.25, 177.5, 188.75, 200, 211.25, 222.5, 233.75, 245, 256.25], // dragon shield flat
    talent_a3: Array(15).fill(3), // dragon shield turns
    ult: [1.5, 1.65, 1.8, 1.95, 2.1, 2.25, 2.4375, 2.625, 2.8125, 3, 3.15, 3.3, 3.45, 3.6, 3.75], // AoE Physical %ATK
    ult_a2: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1], // enhanced dragon FUA Phys %ATK
    ult_a3: [0.14, 0.1475, 0.155, 0.1625, 0.17, 0.176, 0.182, 0.188, 0.194, 0.2, 0.206, 0.212, 0.218, 0.224, 0.23], // ult shield % DH ATK
    ult_a4: [100, 160, 205, 250, 280, 310, 332.5, 355, 377.5, 400, 422.5, 445, 467.5, 490, 512.5], // ult shield flat
    ult_a5: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1], // bondmate-type add DMG % bondmate ATK
  },
  eidolons: [
    "E1: Ult recovers 1 SP, Bondmate All-Type RES PEN +18% (3 turns).",
    "E2: Enhanced Souldragon actions +2; ult advances Souldragon 100%; enhanced dragon add-DMG & shield ×200%.",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: Bondmate takes 20% less DMG.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: Bondmate on field → all enemies take +20% DMG; Bondmate ignores 12% DEF; ult → Bondmate deals 330% ATK Additional DMG AoE.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.225 },
    { stat: "spdFlat", value: 5 },
  ],
}

// Cipher — Quantum/Shaman (Nihility). Patron + DMG tally → True DMG ult, FUA vs Patron.
// base = round(character.json lv80 stat × 2.16), spd = lv80 spd (106).
const CIPHER: CharProg = {
  base: { hp: 931, atk: 640, def: 509, spd: 106 },
  byLevel: {
    10: { hp: 183, atk: 126, def: 100, spd: 106 },
    20: { hp: 247, atk: 169, def: 135, spd: 106 },
    30: { hp: 361, atk: 248, def: 197, spd: 106 },
    40: { hp: 475, atk: 326, def: 259, spd: 106 },
    50: { hp: 589, atk: 405, def: 322, spd: 106 },
    60: { hp: 703, atk: 483, def: 384, spd: 106 },
    70: { hp: 817, atk: 561, def: 446, spd: 106 },
    80: { hp: 931, atk: 640, def: 509, spd: 106 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Quantum DMG %ATK
    skill: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5], // main Quantum %
    skill_a2: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8125, 0.875, 0.9375, 1, 1.05, 1.1, 1.15, 1.2, 1.25], // adj Quantum %
    skill_a3: Array(15).fill(0.1), // Weaken -DMG (tag only)
    skill_a4: Array(15).fill(0.3), // Cipher ATK+ %
    skill_a5: Array(15).fill(2), // Weaken duration (turns)
    ult: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5], // main Quantum %
    ult_a2: Array(15).fill(0.25), // True DMG % of tally (main)
    ult_a3: Array(15).fill(0.75), // True DMG % of tally (distributed adj)
    ult_a4: [0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.325, 0.35, 0.375, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5], // adj Quantum %
    talent: [0.75, 0.825, 0.9, 0.975, 1.05, 1.125, 1.21875, 1.3125, 1.40625, 1.5, 1.575, 1.65, 1.725, 1.8, 1.875], // FUA %ATK vs Patron
    talent_a2: Array(15).fill(0.12), // tally % of non-True DMG vs Patron
    talent_a3: Array(15).fill(1), // FUA cap per turn
  },
  eidolons: [
    "E1: Tally x1.5; Talent FUA -> Cipher ATK+80% (2 turns).",
    "E2: Cipher hits enemy → 120% base chance: enemy DMG taken +30% (2 turns).",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: Patron attacked by ally → Cipher Quantum Additional DMG 50% ATK.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: Talent FUA DMG +350%; tally an extra 16% non-Overflow DMG.",
  ],
  traces: [
    { stat: "dmg:Quantum", value: 0.144 },
    { stat: "spdFlat", value: 14 },
    { stat: "ehr", value: 0.1 },
  ],
}

// Cerydra — Wind/Shaman (Nihility). Support-hypercarry: Military Merit (+Peerage) on one ally,
// Charge system (cap 8, Peerage at 6), self AoE Ult, Wind Additional DMG after carrier attacks.
// base = round(character.json lv80 × 2.16), spd = lv80 (99).
const CERYDRA: CharProg = {
  base: { hp: 1358, atk: 620, def: 485, spd: 99 },
  byLevel: {
    10: { hp: 267, atk: 122, def: 95, spd: 99 },
    20: { hp: 360, atk: 164, def: 128, spd: 99 },
    30: { hp: 526, atk: 240, def: 188, spd: 99 },
    40: { hp: 693, atk: 316, def: 247, spd: 99 },
    50: { hp: 859, atk: 392, def: 306, spd: 99 },
    60: { hp: 1025, atk: 468, def: 366, spd: 99 },
    70: { hp: 1191, atk: 544, def: 425, spd: 99 },
    80: { hp: 1358, atk: 620, def: 485, spd: 99 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // King's Castling Wind %ATK
    skill: [0.36, 0.396, 0.432, 0.468, 0.504, 0.54, 0.585, 0.63, 0.675, 0.72, 0.756, 0.792, 0.828, 0.864, 0.9], // Peerage Skill CRIT DMG
    skill_a5: [0.08, 0.082, 0.084, 0.086, 0.088, 0.09, 0.0925, 0.095, 0.0975, 0.1, 0.102, 0.104, 0.106, 0.108, 0.11], // Peerage All RES PEN
    ult: [1.44, 1.536, 1.632, 1.728, 1.824, 1.92, 2.04, 2.16, 2.28, 2.4, 2.496, 2.592, 2.688, 2.784, 2.88], // Scholar's Mate AoE Wind %ATK
    talent: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75], // Add DMG %ATK after carrier attack
    talent_a2: [0.18, 0.186, 0.192, 0.198, 0.204, 0.21, 0.2175, 0.225, 0.2325, 0.24, 0.246, 0.252, 0.258, 0.264, 0.27], // Merit carrier ATK+ % of Cerydra ATK
  },
  eidolons: [
    "E1: Merit carrier ignores 16% DEF; Peerage → +20% more for Skill DMG.",
    "E2: Merit carrier +40% DMG; while carrier on field Cerydra +160% DMG.",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: Ult DMG ×3.4.",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: Merit carrier All RES PEN +20%; Add DMG ×4; Cerydra +... (Ave Imperator extra).",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "hpPct", value: 0.10 },
    { stat: "dmg:Wind", value: 0.224 },
  ],
}

// Castorice — Quantum/Remembrance. HP-scaled everything: flat = % of her Max HP.
// Newbud (HP-loss pool) gates Ult; Netherwing memosprite + Territory. base = lv80 × 2.16, spd 95.
const CASTORICE: CharProg = {
  base: { hp: 1629, atk: 523, def: 485, spd: 95 },
  byLevel: {
    10: { hp: 321, atk: 103, def: 95, spd: 95 },
    20: { hp: 432, atk: 138, def: 128, spd: 95 },
    30: { hp: 632, atk: 203, def: 188, spd: 95 },
    40: { hp: 831, atk: 267, def: 247, spd: 95 },
    50: { hp: 1031, atk: 331, def: 306, spd: 95 },
    60: { hp: 1230, atk: 395, def: 366, spd: 95 },
    70: { hp: 1430, atk: 459, def: 425, spd: 95 },
    80: { hp: 1629, atk: 523, def: 485, spd: 95 }
  },
  abilities: {
    basic: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7], // Nethersea Ripple main %MaxHP
    skill: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625], // Wraithfly main %MaxHP
    skill_a2: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // Wraithfly adj %MaxHP
    skill_a3: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // Boneclaw Castorice %MaxHP
    skill_a4: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625], // Boneclaw Netherwing %MaxHP
    ult: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25], // Lost Netherland enemy All-RES down
    talent: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25], // DMG+ per ally HP-loss stack
    talent_a3: Array(15).fill(3), // DMG+ duration turns
    mem_skill: Array(10).fill(0.25), // Breath HP cost % of Netherwing MaxHP (param#1, const)
    mem_skill_a2: [0.12, 0.144, 0.168, 0.192, 0.216, 0.24, 0.264, 0.288, 0.312, 0.336], // Breath all-enemies %MaxHP (1st launch)
    mem_skill_a3: [0.14, 0.168, 0.196, 0.224, 0.252, 0.28, 0.308, 0.336, 0.364, 0.392], // Breath all-enemies %MaxHP (2nd launch)
    mem_skill_a4: [0.17, 0.204, 0.238, 0.272, 0.306, 0.34, 0.374, 0.408, 0.442, 0.476], // Breath all-enemies %MaxHP (3rd launch+, cap)
    mem_skill_a5: Array(10).fill(0.25), // Breath self-destruct threshold % of Netherwing MaxHP (param#5, const)
    mem_claw: [0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48, 0.52, 0.56], // Claw Splits the Veil all-enemies %MaxHP (1140701 #1, 10-level ladder)
    mem_talent: [0.2, 0.24, 0.28, 0.32, 0.36, 0.4, 0.44, 0.48, 0.52, 0.56], // Wings bounce %MaxHP
    mem_talent_a2: Array(10).fill(6), // Wings bounce count
    mem_talent_a3: [0.03, 0.036, 0.042, 0.048, 0.054, 0.06, 0.066, 0.072, 0.078, 0.084], // Wings ally heal %MaxHP
    mem_talent_a4: [400, 480, 560, 640, 720, 800, 880, 960, 1040, 1120], // Wings ally heal flat
  },
  eidolons: [
    "E1: enemy HP≤80%/50% → Boneclaw/Claw/Breath/Wings DMG to it ×1.2/×1.4, resolved per enemy (random bounce targets included).",
    "E2: +2 Ardent Will after summoning Netherwing (offset Breath HP cost) + advance 100% + next Enhanced Skill grants 30% of max Newbud.",
    "E3: Ult Lv.+2, Basic Lv.+1, Memosprite Talent Lv.+1.",
    "E4: all allies healing received +20% (inHeal) while Castorice is on the field.",
    "E5: Skill Lv.+2, Talent Lv.+2, Memosprite Skill Lv.+1.",
    "E6: Castorice/Netherwing Quantum RES PEN +20%; Netherwing's attacks strip Toughness regardless of Weakness Type (pierceRatio 1) and Wings gets +3 Bounces.",
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "critDmg", value: 0.133 },
    { stat: "dmg:Quantum", value: 0.144 },
  ],
}

// Phainon — Physical/Warrior. Coreflame resource (cap 12) gates Khaslana transformation:
// Territory + summon Khaslana (8 extra turns, SPD-inherited), Scourge economy, Enhanced Basic /
// Soulscorch Edict (counter) / Stardeath Verdict (Scourge spend) / Final AoE hit. base = lv80 × 2.16, spd 94.
const PHAINON: CharProg = {
  base: { hp: 1435, atk: 582, def: 703, spd: 94 },
  byLevel: {
    10: { hp: 283, atk: 114, def: 138, spd: 94 },
    20: { hp: 380, atk: 154, def: 186, spd: 94 },
    30: { hp: 556, atk: 225, def: 272, spd: 94 },
    40: { hp: 732, atk: 297, def: 358, spd: 94 },
    50: { hp: 908, atk: 368, def: 445, spd: 94 },
    60: { hp: 1084, atk: 439, def: 531, spd: 94 },
    70: { hp: 1260, atk: 510, def: 617, spd: 94 },
    80: { hp: 1435, atk: 582, def: 703, spd: 94 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Stride to Deliverance single
    skill: [1.5, 1.65, 1.8, 1.95, 2.1, 2.25, 2.4375, 2.625, 2.8125, 3, 3.15, 3.3, 3.45, 3.6, 3.75], // Let There Be Light main
    skill_a2: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5], // adj
    ult: [4.8, 5.28, 5.76, 6.24, 6.72, 7.2, 7.8, 8.4, 9, 9.6, 10.08, 10.56, 11.04, 11.52, 12], // Final Ult hit (distributed)
    talent: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // CRIT DMG per teammate-target
    mem_basic: [1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5], // Bloodthorn main
    mem_basic_a2: [0.375, 0.45, 0.525, 0.6, 0.675, 0.75, 0.825, 0.9, 0.975, 1.05], // Bloodthorn adj
    mem_edict: [0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.325, 0.35, 0.375, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5], // Soulscorch counter AoE
    mem_edict_a2: Array(15).fill(4), // counter instances
    mem_edict_a3: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // counter per-instance
    mem_verdict: [2.25, 2.475, 2.7, 2.925, 3.15, 3.375, 3.65625, 3.9375, 4.21875, 4.5, 4.725, 4.95, 5.175, 5.4, 5.625], // Verdict even-AoE
    mem_verdict_a2: [0.225, 0.2475, 0.27, 0.2925, 0.315, 0.3375, 0.365625, 0.39375, 0.421875, 0.45, 0.4725, 0.495, 0.5175, 0.54, 0.5625], // Verdict per-instance
    mem_verdict_a3: Array(15).fill(4), // instances per Scourge
    mem_verdict_a4: Array(15).fill(4), // Scourge threshold for even-AoE
    mem_talent: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1], // Khaslana ATK+
    mem_talent_a5: [1.35, 1.485, 1.62, 1.755, 1.89, 2.025, 2.19375, 2.3625, 2.53125, 2.7, 2.835, 2.97, 3.105, 3.24, 3.375], // Khaslana MaxHP+
  },
  eidolons: [
    "E1: Khaslana extra-turn SPD inheritance 60→66%, +1.5%/kill (max 84%).",
    "E2: Khaslana Physical RES PEN +20%; Verdict consuming 4+ Scourge → extra turn.",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: Soulscorch Edict additionally +4 Soulscorch stacks.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: Coreflame overflow unlimited; battle start +6; Verdict → extra (truncated).",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "critDmg", value: 0.373 },
    { stat: "spdFlat", value: 5 },
  ],
}

// Aventurine — Imaginary/Knight. DEF-scaled FUA shield-tank: Fortified Wager (shield all allies),
// Blind Bet (7 → FUA poppy shots), Unnerved ult debuff. base = lv80 × 2.16, spd 106.
const AVENTURINE: CharProg = {
  base: { hp: 1203, atk: 446, def: 654, spd: 106 },
  byLevel: {
    10: { hp: 237, atk: 88, def: 129, spd: 106 },
    20: { hp: 319, atk: 118, def: 173, spd: 106 },
    30: { hp: 466, atk: 173, def: 253, spd: 106 },
    40: { hp: 613, atk: 227, def: 334, spd: 106 },
    50: { hp: 761, atk: 282, def: 414, spd: 106 },
    60: { hp: 908, atk: 336, def: 494, spd: 106 },
    70: { hp: 1055, atk: 391, def: 574, spd: 106 },
    80: { hp: 1203, atk: 446, def: 654, spd: 106 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Straight Bet DEF%
    skill: [0.16, 0.17, 0.18, 0.19, 0.2, 0.208, 0.216, 0.224, 0.232, 0.24, 0.248, 0.256, 0.264, 0.272, 0.28], // FW shield DEF%
    skill_a2: [80, 128, 164, 200, 224, 248, 266, 284, 302, 320, 338, 356, 374, 392, 410], // FW shield flat
    skill_a3: Array(15).fill(3), // FW duration
    ult: [1.62, 1.728, 1.836, 1.944, 2.052, 2.16, 2.295, 2.43, 2.565, 2.7, 2.808, 2.916, 3.024, 3.132, 3.24], // Roulette Shark DEF%
    ult_a2: [1.62, 1.728, 1.836, 1.944, 2.052, 2.16, 2.295, 2.43, 2.565, 2.7, 2.808, 2.916, 3.024, 3.132, 3.24], // (mirror, DEF main)
    ult_a3: [0.09, 0.096, 0.102, 0.108, 0.114, 0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18], // Unnerved CRIT taken
    ult_a4: Array(15).fill(3), // Unnerved turns
    talent: Array(15).fill(1), // Shot Loaded Right param#1: extra Blind Bet when Aventurine himself is attacked
    talent_a2: Array(15).fill(7), // Shot Loaded Right param#2: FUA hits per trigger
    talent_a3: [0.125, 0.1375, 0.15, 0.1625, 0.175, 0.1875, 0.203125, 0.21875, 0.234375, 0.25, 0.2625, 0.275, 0.2875, 0.3, 0.3125], // FUA per-hit DEF%
    talent_a4: Array(15).fill(0.5), // Shot Loaded Right param#4: Fortified Wager ally Effect RES
    technique: Array(15).fill(0.24), // The Red or the Black param#1: DEF+24% (30% odds)
    technique_a2: Array(15).fill(0.36), // param#2: DEF+36% (60% odds)
    technique_a3: Array(15).fill(0.6), // param#3: DEF+60% (10% odds)
    technique_a4: Array(15).fill(3), // param#4: duration (turns)
  },
  eidolons: [
    "E1: FW allies +20% CRIT DMG; ult also grants FW shield.",
    "E2: basic reduces target All-RES 12% (3 turns).",
    "E3: Ult Lv.+2, Basic Lv.+1.",
    "E4: FUA first → DEF+40% (2 turns) + more hits.",
    "E5: Skill Lv.+2, Talent Lv.+2.",
    "E6: +50% DMG per shielded teammate (max 150%) — not modeled.",
  ],
  traces: [
    { stat: "defPct", value: 0.35 },
    { stat: "dmg:Imaginary", value: 0.144 },
    { stat: "effRes", value: 0.1 },
  ],
}

// Fugue — Fire/Warlock. Break-support: Foxian Prayer (+Break Effect to ally, Torrid Scorch up),
// Solar Splendor Fire AoE ult. base = lv80 × 2.16, spd 102.
const HERTA: CharProg = {
  base: { hp: 952, atk: 582, def: 396, spd: 100 },
  byLevel: {
    10: { hp: 187, atk: 114, def: 78, spd: 100 },
    20: { hp: 252, atk: 154, def: 105, spd: 100 },
    30: { hp: 369, atk: 225, def: 153, spd: 100 },
    40: { hp: 486, atk: 297, def: 202, spd: 100 },
    50: { hp: 602, atk: 368, def: 251, spd: 100 },
    60: { hp: 719, atk: 439, def: 299, spd: 100 },
    70: { hp: 835, atk: 510, def: 348, spd: 100 },
    80: { hp: 952, atk: 582, def: 396, spd: 100 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1.0,1.05,1.1,1.15,1.2,1.25],
    skill_a2: Array(15).fill(0.5),
    skill_a3: Array(15).fill(0.2),
    ult: [1.2,1.28,1.36,1.44,1.52,1.6,1.7,1.8,1.9,2,2.08,2.16,2.24,2.32,2.4],
    talent: [0.25,0.265,0.28,0.295,0.31,0.325,0.34375,0.3625,0.38125,0.4,0.415,0.43,0.445,0.46,0.475], // FUA DMG (Fine, I'll Do It Myself #2)
  },
  eidolons: [
    "E1: When Basic ATK hits enemy ≤50% HP, deals 40% ATK Ice Additional DMG.",
    "E2: After triggering Talent, CRIT Rate +3% (max 5 stacks).",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: After triggering Talent, DMG +10% for 1 turn.",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: After using Ultimate, ATK +25% for 1 turn.",
  ],
  traces: [
    { stat: 'critRate', value: 0.067 },
    { stat: 'defPct', value: 0.225 },
    { stat: 'dmg:Ice', value: 0.224 },
  ],
}

const SERVAL: CharProg = {
  base: { hp: 917, atk: 652, def: 374, spd: 104 },
  byLevel: {
    10: { hp: 180, atk: 128, def: 73, spd: 104 },
    20: { hp: 243, atk: 173, def: 99, spd: 104 },
    30: { hp: 355, atk: 253, def: 145, spd: 104 },
    40: { hp: 468, atk: 333, def: 191, spd: 104 },
    50: { hp: 580, atk: 412, def: 237, spd: 104 },
    60: { hp: 692, atk: 492, def: 283, spd: 104 },
    70: { hp: 804, atk: 572, def: 328, spd: 104 },
    80: { hp: 917, atk: 652, def: 374, spd: 104 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [0.7,0.77,0.84,0.91,0.98,1.05,1.1375,1.225,1.3125,1.4,1.47,1.54,1.61,1.68,1.75], // main (#1)
    skill_a2: Array(15).fill(0.8), // Shock base chance (#3[2])
    skill_a3: [0.4,0.44,0.48,0.52,0.56,0.62,0.7,0.8,0.92,1.04,1.092,1.144,1.196,1.248,1.3], // Shock DoT (#5[4])
    skill_a4: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // adjacent (#2)
    ult: [1.08,1.152,1.224,1.296,1.368,1.44,1.53,1.62,1.71,1.8,1.872,1.944,2.016,2.088,2.16],
    talent: [0.36,0.396,0.432,0.468,0.504,0.54,0.585,0.63,0.675,0.72,0.756,0.792,0.828,0.864,0.90],
    ult_a2: Array(15).fill(2.0),
  },
  eidolons: [
    "E1: Echo Chamber — Basic ATK deals Lightning DMG equal to 60% of Basic ATK DMG to a random target adjacent to the target enemy.",
    "E2: Encore! — Every time Talent triggers to deal Additional DMG, Serval regenerates 4 Energy.",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: Make Some Noise! — Ultimate has a 100% base chance to apply Shock to any enemies not currently Shocked (same effects as Skill).",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: This Song Rocks to Heaven! — Serval deals 30% more DMG to Shocked enemies.",
  ],
  traces: [
    { stat: 'critRate', value: 0.187 },
    { stat: 'ehr', value: 0.18 },
    { stat: 'effRes', value: 0.1 },
  ],
}

const GEPARD: CharProg = {
  base: { hp: 1397, atk: 543, def: 654, spd: 92 },
  byLevel: {
    10: { hp: 275, atk: 107, def: 129, spd: 92 },
    20: { hp: 370, atk: 144, def: 173, spd: 92 },
    30: { hp: 541, atk: 210, def: 253, spd: 92 },
    40: { hp: 712, atk: 277, def: 334, spd: 92 },
    50: { hp: 883, atk: 343, def: 414, spd: 92 },
    60: { hp: 1054, atk: 410, def: 494, spd: 92 },
    70: { hp: 1226, atk: 476, def: 574, spd: 92 },
    80: { hp: 1397, atk: 543, def: 654, spd: 92 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [1.0,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2.0,2.1,2.2,2.3,2.4,2.5],
    skill_a2: Array(15).fill(0.65),
    skill_a4: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75],
    ult: [0.3,0.319,0.338,0.356,0.375,0.39,0.405,0.42,0.435,0.45,0.465,0.48,0.495,0.51,0.525],
    ult_a2: Array(15).fill(3),
    ult_a3: [150,240,308,375,420,465,499,533,566,600,634,668,701,735,769],
    talent: [0.25,0.275,0.3,0.325,0.35,0.375,0.406,0.438,0.469,0.5,0.525,0.55,0.575,0.6,0.625],
  },
  eidolons: [
    "E1: Skill +35% base chance to Freeze.",
    "E2: Frozen enemies SPD -20% for 1 turn after unfreezing.",
    "E3: Ult Lv.+2, Talent Lv.+2.",
    "E4: All allies Effect RES +20%.",
    "E5: Skill Lv.+2, Basic Lv.+1.",
    "E6: Revive +50% MaxHP extra heal, immediately takes action.",
  ],
  traces: [
    { stat: 'defPct', value: 0.125 },
    { stat: 'dmg:Ice', value: 0.224 },
    { stat: 'effRes', value: 0.18 },
  ],
}

const NATASHA: CharProg = {
  base: { hp: 1164, atk: 476, def: 507, spd: 98 },
  byLevel: {
    10: { hp: 229, atk: 93, def: 100, spd: 98 },
    20: { hp: 308, atk: 126, def: 134, spd: 98 },
    30: { hp: 451, atk: 184, def: 196, spd: 98 },
    40: { hp: 594, atk: 243, def: 258, spd: 98 },
    50: { hp: 736, atk: 301, def: 320, spd: 98 },
    60: { hp: 879, atk: 359, def: 382, spd: 98 },
    70: { hp: 1021, atk: 417, def: 445, spd: 98 },
    80: { hp: 1164, atk: 476, def: 507, spd: 98 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [0.07,0.074,0.079,0.083,0.088,0.091,0.095,0.098,0.102,0.105,0.109,0.112,0.116,0.119,0.123],
    skill_a2: [0.048,0.051,0.054,0.057,0.06,0.062,0.065,0.067,0.07,0.072,0.074,0.077,0.079,0.082,0.084],
    skill_a3: [70,112,144,175,196,217,233,249,264,280,296,312,327,343,359],
    skill_a4: [48,77,98,120,134,149,160,170,181,192,203,214,224,235,246],
    ult: [0.092,0.098,0.104,0.109,0.115,0.12,0.124,0.129,0.133,0.138,0.143,0.147,0.152,0.156,0.161],
    ult_a2: [92,147,189,230,258,285,306,327,347,368,389,409,430,451,472],
    talent: Array(15).fill(0.3), // Innervation HP threshold (#1[0])
    talent_a2: [0.25,0.275,0.3,0.325,0.35,0.375,0.406,0.438,0.469,0.5,0.525,0.55,0.575,0.6,0.625],
  },
  eidolons: [
    "E1: When HP ≤30% after being attacked, heal self 15% MaxHP + 400 (once per battle).",
    "E2: Ult applies Regeneration to allies ≤30% HP for 1 turn (6% MaxHP + 160 per turn).",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: After being attacked, +5 Energy.",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: Basic ATK +40% MaxHP Physical DMG.",
  ],
  traces: [
    { stat: 'defPct', value: 0.125 },
    { stat: 'hpPct', value: 0.28 },
    { stat: 'effRes', value: 0.18 },
  ],
}

const FUGUE: CharProg = {
  base: { hp: 1125, atk: 582, def: 557, spd: 102 },
  byLevel: {
    10: { hp: 222, atk: 114, def: 110, spd: 102 },
    20: { hp: 298, atk: 154, def: 148, spd: 102 },
    30: { hp: 436, atk: 225, def: 216, spd: 102 },
    40: { hp: 574, atk: 297, def: 284, spd: 102 },
    50: { hp: 712, atk: 368, def: 352, spd: 102 },
    60: { hp: 849, atk: 439, def: 421, spd: 102 },
    70: { hp: 987, atk: 510, def: 489, spd: 102 },
    80: { hp: 1125, atk: 582, def: 557, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4], // Radiant Streak (single)
    basic_a2: [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7], // Fiery Caress (enhanced Basic, adjacent #2)
    skill: Array(15).fill(3), // Torrid Scorch duration
    skill_a2: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // Foxian Prayer Break Effect+
    skill_a3: Array(15).fill(1), // Torrid Scorch DEF Reduction base chance (#3)
    skill_def: [0.08, 0.09, 0.1, 0.11, 0.12, 0.13, 0.1425, 0.155, 0.1675, 0.18, 0.19, 0.2, 0.21, 0.22, 0.23], // Torrid Scorch DEF Reduction value (#4)
    skill_a4: Array(15).fill(2), // Torrid Scorch DEF Reduction duration (#5)
    skill_a6: Array(15).fill(0.5), // Foxian Prayer weakness-ignore toughness (#6)
    talent: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8125, 0.875, 0.9375, 1, 1.05, 1.1, 1.15, 1.2, 1.25], // Talent #1: Super Break conversion
    ult: [1, 1.107, 1.214, 1.321, 1.429, 1.536, 1.643, 1.75, 1.857, 1.964, 2.071, 2.179, 2.286, 2.393, 2.5], // Solar Splendor AoE
  },
  eidolons: [
    "E1: Foxian Prayer ally weakness-break efficiency +50% (approx).",
    "E2: ult regenerates Fugue 3 Energy + advances all allies 24%.",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: Foxian Prayer ally Break DMG +20%.",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: Fugue weakness-break efficiency +50%; prayer applies to all allies while Torrid Scorch.",
  ],
  traces: [
    { stat: "be", value: 0.24 },
    { stat: "hpPct", value: 0.10 },
    { stat: "spdFlat", value: 14 },
  ],
}

const ASTA: CharProg = {
  base: { hp: 1023, atk: 511, def: 463, spd: 106 },
  byLevel: {
    10: { hp: 201, atk: 100, def: 91, spd: 106 },
    20: { hp: 271, atk: 135, def: 122, spd: 106 },
    30: { hp: 396, atk: 198, def: 179, spd: 106 },
    40: { hp: 522, atk: 261, def: 236, spd: 106 },
    50: { hp: 647, atk: 323, def: 292, spd: 106 },
    60: { hp: 772, atk: 386, def: 349, spd: 106 },
    70: { hp: 897, atk: 448, def: 406, spd: 106 },
    80: { hp: 1023, atk: 511, def: 463, spd: 106 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    ult: [36, 37.4, 38.8, 40.2, 41.6, 43, 44.75, 46.5, 48.25, 50, 51.4, 52.8, 54.2, 55.6, 57],
    talent: [0.07, 0.077, 0.084, 0.091, 0.098, 0.105, 0.11375, 0.1225, 0.13125, 0.14, 0.147, 0.154, 0.161, 0.168, 0.175],
  },
  eidolons: [
    "E1: Skill deals DMG 1 extra time to a random enemy.",
    "E2: After Ultimate, Charging stacks not reduced next turn.",
    "E3: Skill Lv.+2, Talent Lv.+2.",
    "E4: Energy Regeneration Rate +15% with 2+ Charging stacks.",
    "E5: Ult Lv.+2, Basic Lv.+1.",
    "E6: Charging stacks lost per turn reduced by 1.",
  ],
  traces: [
    { stat: "critRate", value: 0.067 },
    { stat: "defPct", value: 0.225 },
    { stat: "dmg:Fire", value: 0.224 },
  ],
}

const ARLAN: CharProg = {
  base: { hp: 1199, atk: 599, def: 330, spd: 102 },
  byLevel: {
    10: { hp: 236, atk: 118, def: 65, spd: 102 },
    20: { hp: 318, atk: 159, def: 87, spd: 102 },
    30: { hp: 465, atk: 232, def: 128, spd: 102 },
    40: { hp: 612, atk: 306, def: 168, spd: 102 },
    50: { hp: 758, atk: 379, def: 209, spd: 102 },
    60: { hp: 905, atk: 452, def: 249, spd: 102 },
    70: { hp: 1052, atk: 526, def: 290, spd: 102 },
    80: { hp: 1199, atk: 599, def: 330, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.2, 1.32, 1.44, 1.56, 1.68, 1.8, 1.95, 2.1, 2.25, 2.4, 2.52, 2.64, 2.76, 2.88, 3.0],
    ult: [1.92, 2.048, 2.176, 2.304, 2.432, 2.56, 2.72, 2.88, 3.04, 3.2, 3.328, 3.456, 3.584, 3.712, 3.84],
    ult_a2: [0.96, 1.024, 1.088, 1.152, 1.216, 1.28, 1.36, 1.44, 1.52, 1.6, 1.664, 1.728, 1.792, 1.856, 1.92],
    talent: [0.36, 0.396, 0.432, 0.468, 0.504, 0.54, 0.585, 0.63, 0.675, 0.72, 0.756, 0.792, 0.828, 0.864, 0.9],
  },
  eidolons: [
    "E1: HP ≤50% → Skill DMG +10%.",
    "E2: Using Skill or Ult removes 1 debuff from Arlan.",
    "E3: Skill Lv.+2, Basic Lv.+1.",
    "E4: On killing blow, revive to 25% Max HP (once / after 2 turns).",
    "E5: Ult Lv.+2, Talent Lv.+2.",
    "E6: HP ≤50% → Ult DMG +20%, adjacent targets DMG raised to main level.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "effRes", value: 0.18 },
  ],
}

const CLARA: CharProg = {
  base: { hp: 1241, atk: 737, def: 485, spd: 90 },
  byLevel: {
    10: { hp: 244, atk: 145, def: 95, spd: 90 },
    20: { hp: 329, atk: 195, def: 128, spd: 90 },
    30: { hp: 481, atk: 285, def: 188, spd: 90 },
    40: { hp: 633, atk: 376, def: 247, spd: 90 },
    50: { hp: 785, atk: 466, def: 306, spd: 90 },
    60: { hp: 937, atk: 556, def: 366, spd: 90 },
    70: { hp: 1089, atk: 647, def: 425, spd: 90 },
    80: { hp: 1241, atk: 737, def: 485, spd: 90 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [0.6,0.66,0.72,0.78,0.84,0.9,0.975,1.05,1.125,1.2,1.26,1.32,1.38,1.44,1.5],
    skill_a2: [0.6,0.66,0.72,0.78,0.84,0.9,0.975,1.05,1.125,1.2,1.26,1.32,1.38,1.44,1.5], // Mark of Counter extra DMG (#2) — identical ladder to #1
    ult: [0.96,1.04,1.12,1.2,1.28,1.36,1.44,1.52,1.6,1.68,1.76,1.84,1.92,1.92,1.92],
    ult_a2: [0.96,1.024,1.088,1.152,1.216,1.28,1.36,1.44,1.52,1.6,1.664,1.728,1.792,1.856,1.92], // enhanced counter +DMG (#2)
    talent: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2.0],
  },
  eidolons: [
    "E1: A Tall Figure — Skill does not remove Marks of Counter.",
    "E2: A Tight Embrace — After using Ultimate, ATK +30% for 2 turns.",
    "E3: Cold Steel Armor — Skill Lv.+2, Basic Lv.+1.",
    "E4: Family's Warmth — After Clara is hit, DMG taken -30% until next turn.",
    "E5: A Small Promise — Ult Lv.+2, Talent Lv.+2.",
    "E6: Long Company — After other allies are attacked, Svarog 50% fixed chance to counter + mark. Ult gains +1 enhanced counter.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Physical", value: 0.144 },
  ],
}

const SAMPO: CharProg = {
  base: { hp: 1023, atk: 617, def: 396, spd: 102 },
  byLevel: {
    10: { hp: 201, atk: 121, def: 78, spd: 102 },
    20: { hp: 271, atk: 163, def: 105, spd: 102 },
    30: { hp: 396, atk: 239, def: 153, spd: 102 },
    40: { hp: 522, atk: 315, def: 202, spd: 102 },
    50: { hp: 647, atk: 390, def: 251, spd: 102 },
    60: { hp: 772, atk: 466, def: 299, spd: 102 },
    70: { hp: 897, atk: 541, def: 348, spd: 102 },
    80: { hp: 1023, atk: 617, def: 396, spd: 102 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [0.28,0.308,0.336,0.364,0.392,0.42,0.455,0.49,0.525,0.56,0.588,0.616,0.644,0.672,0.7],
    ult: [0.96,1.024,1.088,1.152,1.216,1.28,1.36,1.44,1.52,1.6,1.664,1.728,1.792,1.856,1.92],
    ult_a2: [0.2,0.21,0.22,0.23,0.24,0.25,0.2625,0.275,0.2875,0.3,0.31,0.32,0.33,0.34,0.35],
    talent: [0.2,0.22,0.24,0.26,0.28,0.31,0.35,0.4,0.46,0.52,0.546,0.572,0.598,0.624,0.65], // Wind Shear DoT (Windtorn Dagger #2[1])
  },
  eidolons: [
    "E1: Rising Love — Skill deals 1 extra bounce.",
    "E2: Infectious Enthusiasm — Defeating Wind Shear enemy → 100% base chance to apply Wind Shear to all enemies.",
    "E3: Big Money! — Skill Lv.+2, Basic Lv.+1.",
    "E4: The Deeper the Love — When Skill hits enemy with 5+ Wind Shear stacks, immediately takes 8% of current Wind Shear DMG.",
    "E5: Huuuuge Money! — Ult Lv.+2, Talent Lv.+2.",
    "E6: Increased Spending — Talent Wind Shear DMG multiplier +15%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "ehr", value: 0.18 },
    { stat: "effRes", value: 0.1 },
  ],
}

const QINGQUE: CharProg = {
  base: { hp: 1023, atk: 652, def: 441, spd: 98 },
  byLevel: {
    10: { hp: 201, atk: 128, def: 87, spd: 98 },
    20: { hp: 271, atk: 173, def: 117, spd: 98 },
    30: { hp: 396, atk: 253, def: 171, spd: 98 },
    40: { hp: 522, atk: 333, def: 225, spd: 98 },
    50: { hp: 647, atk: 412, def: 279, spd: 98 },
    60: { hp: 772, atk: 492, def: 333, spd: 98 },
    70: { hp: 897, atk: 572, def: 387, spd: 98 },
    80: { hp: 1023, atk: 652, def: 441, spd: 98 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1.2, 1.44, 1.68, 1.92, 2.16, 2.4, 2.64, 2.88, 3.12, 3.36],
    basic_en_a2: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    // canon 120102 params: [tiles drawn=2 (const), DMG Boost per stack, max stacks=4 (const)]
    skill: Array(15).fill(2),
    skill_a2: [0.14, 0.154, 0.168, 0.182, 0.196, 0.21, 0.2275, 0.245, 0.2625, 0.28, 0.294, 0.308, 0.322, 0.336, 0.35],
    skill_a3: Array(15).fill(4),
    ult: [1.2, 1.28, 1.36, 1.44, 1.52, 1.6, 1.7, 1.8, 1.9, 2, 2.08, 2.16, 2.24, 2.32, 2.4],
    talent: [0.36, 0.396, 0.432, 0.468, 0.504, 0.54, 0.585, 0.63, 0.675, 0.72, 0.756, 0.792, 0.828, 0.864, 0.9],
  },
  eidolons: [
    "E1: Rise Through the Tiles — Ultimate deals 10% more DMG.",
    "E2: Sleep on the Tiles — Every time Draw Tile is triggered, Qingque immediately regenerates 1 Energy.",
    "E3: Read Between the Tiles — Ultimate Lv.+2, Talent Lv.+2.",
    "E4: Right on the Tiles — After Skill, 24% fixed chance to gain Self-Sufficer; Basic/Enhanced Basic launches 1 FUA on same target (100% Basic/Enhanced Basic DMG).",
    "E5: Gambit for the Tiles — Skill Lv.+2, Basic Lv.+1.",
    "E6: Prevail Beyond the Tiles — Recovers 1 SP after using Enhanced Basic ATK.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.125 },
    { stat: "dmg:Quantum", value: 0.144 },
  ],
}

const YANQING: CharProg = {
  base: { hp: 892, atk: 679, def: 412, spd: 109 },
  byLevel: {
    10: { hp: 176, atk: 133, def: 81, spd: 109 },
    20: { hp: 236, atk: 180, def: 109, spd: 109 },
    30: { hp: 346, atk: 263, def: 159, spd: 109 },
    40: { hp: 455, atk: 346, def: 210, spd: 109 },
    50: { hp: 564, atk: 429, def: 260, spd: 109 },
    60: { hp: 673, atk: 512, def: 311, spd: 109 },
    70: { hp: 783, atk: 595, def: 361, spd: 109 },
    80: { hp: 892, atk: 679, def: 412, spd: 109 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.1, 1.21, 1.32, 1.43, 1.54, 1.65, 1.7875, 1.925, 2.0625, 2.2, 2.31, 2.42, 2.53, 2.64, 2.75],
    ult: [2.1, 2.24, 2.38, 2.52, 2.66, 2.8, 2.975, 3.15, 3.325, 3.5, 3.64, 3.78, 3.92, 4.06, 4.2],
    ult_a2: [0.3, 0.32, 0.34, 0.36, 0.38, 0.4, 0.425, 0.45, 0.475, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6],
    // canon 120904 params order: p1 CRIT Rate / p2 CRIT DMG / p3 follow-up chance / p4 follow-up DMG / p5 Frozen DMG / p6 Frozen chance
    talent: [0.5, 0.51, 0.52, 0.53, 0.54, 0.55, 0.5625, 0.575, 0.5875, 0.6, 0.61, 0.62, 0.63, 0.64, 0.65],
    talent_a2: [0.15, 0.155, 0.16, 0.165, 0.17, 0.175, 0.18125, 0.1875, 0.19375, 0.2, 0.205, 0.21, 0.215, 0.22, 0.225],
    talent_a3: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375],
    talent_a4: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.4063, 0.4375, 0.4688, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    talent_a5: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    talent_a6: [0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65],
  },
  eidolons: [
    "E1: Svelte Saber — When attacking a Frozen enemy, deals Ice Additional DMG equal to 60% ATK.",
    "E2: Supine Serenade — When Soulsteel Sync is active, Energy Regeneration Rate +10%.",
    "E3: Sword Savant — Skill Lv.+2, Basic Lv.+1.",
    "E4: Searing Sting — HP≥80% → Ice RES PEN +12%.",
    "E5: Surging Strife — Ult Lv.+2, Talent Lv.+2.",
    "E6: Swift Swoop — When Soulsteel Sync or Ult buffs active, defeating an enemy extends their duration by 1 turn.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Ice", value: 0.144 },
  ],
}

const HOOK: CharProg = {
  base: { hp: 1340, atk: 617, def: 352, spd: 94 },
  byLevel: {
    10: { hp: 264, atk: 121, def: 69, spd: 94 },
    20: { hp: 355, atk: 163, def: 93, spd: 94 },
    30: { hp: 519, atk: 239, def: 136, spd: 94 },
    40: { hp: 684, atk: 315, def: 180, spd: 94 },
    50: { hp: 848, atk: 390, def: 223, spd: 94 },
    60: { hp: 1012, atk: 466, def: 266, spd: 94 },
    70: { hp: 1176, atk: 541, def: 309, spd: 94 },
    80: { hp: 1340, atk: 617, def: 352, spd: 94 },
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4],
    skill: [1.2,1.32,1.44,1.56,1.68,1.8,1.95,2.1,2.25,2.4,2.52,2.64,2.76,2.88,3.0],
    skill_a2: [0.25,0.275,0.3,0.325,0.35,0.3875,0.4375,0.5,0.575,0.65,0.6825,0.715,0.7475,0.78,0.8125],
    skill_en: [1.4,1.54,1.68,1.82,1.96,2.1,2.275,2.45,2.625,2.8,2.94,3.08,3.22,3.36,3.5],
    skill_en_a2: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1.0],
    ult: [2.4,2.56,2.72,2.88,3.04,3.2,3.4,3.6,3.8,4.0,4.16,4.32,4.48,4.64,4.8],
    talent: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1.0,1.05,1.1,1.15,1.2,1.25],
  },
  eidolons: [
    "E1: Early to Bed, Early to Rise — Enhanced Skill DMG +20%.",
    "E2: Happy Tummy, Happy Body — Burn from Skill lasts 1 extra turn.",
    "E3: Don't Be Picky — Skill Lv.+2, Basic Lv.+1.",
    "E4: It's Okay to Not Know — Talent trigger → 100% base chance to Burn adjacent enemies.",
    "E5: Let the Moles' Deeds Be Known — Ult Lv.+2, Talent Lv.+2.",
    "E6: Always Ready to Punch and Kick — Hook deals +20% DMG to Burned enemies.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critDmg", value: 0.133 },
    { stat: "hpPct", value: 0.18 },
  ],
}

const BAILU: CharProg = {
  base: { hp: 1319, atk: 562, def: 485, spd: 98 },
  byLevel: {
    10: { hp: 260, atk: 111, def: 95, spd: 98 },
    20: { hp: 350, atk: 149, def: 128, spd: 98 },
    30: { hp: 511, atk: 218, def: 188, spd: 98 },
    40: { hp: 673, atk: 287, def: 247, spd: 98 },
    50: { hp: 834, atk: 356, def: 306, spd: 98 },
    60: { hp: 996, atk: 424, def: 366, spd: 98 },
    70: { hp: 1157, atk: 493, def: 425, spd: 98 },
    80: { hp: 1319, atk: 562, def: 485, spd: 98 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.078, 0.082875, 0.08775, 0.092625, 0.0975, 0.1014, 0.1053, 0.1092, 0.1131, 0.117, 0.1209, 0.1248, 0.1287, 0.1326, 0.1365],
    skill_a2: [78, 124.8, 159.9, 195, 218.4, 241.8, 259.35, 276.9, 294.45, 312, 329.55, 347.1, 364.65, 382.2, 399.75],
    skill_a3: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15],
    ult: [0.09, 0.095625, 0.10125, 0.106875, 0.1125, 0.117, 0.1215, 0.126, 0.1305, 0.135, 0.1395, 0.144, 0.1485, 0.153, 0.1575],
    ult_a2: [90, 144, 184.5, 225, 252, 279, 299.25, 319.5, 339.75, 360, 380.25, 400.5, 420.75, 441, 461.25],
    talent: [0.036, 0.03825, 0.0405, 0.04275, 0.045, 0.0468, 0.0486, 0.0504, 0.0522, 0.054, 0.0558, 0.0576, 0.0594, 0.0612, 0.063],
    talent_a2: [36, 57.6, 73.8, 90, 100.8, 111.6, 119.7, 127.8, 135.9, 144, 152.1, 160.2, 168.3, 176.4, 184.5],
    talent_a3: [0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18, 0.186, 0.192, 0.198, 0.204, 0.21],
    talent_a4: [120, 192, 246, 300, 336, 372, 399, 426, 453, 480, 507, 534, 561, 588, 615],
    talent_a5: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    ult_a3: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },
  eidolons: [
    "E1: Ambrosial Aqua — If target ally's HP is full when Invigoration ends, regenerates 8 extra Energy for them.",
    "E2: Sylphic Slumber — After using Ult, Bailu's Outgoing Healing increases by 15% for 2 turns.",
    "E3: Omniscient Opulence — Skill Lv.+2, Talent Lv.+2.",
    "E4: Evil Excision — Every Skill heal makes the recipient deal 10% more DMG for 2 turns (stacks ×3).",
    "E5: Waning Worries — Ult Lv.+2, Basic Lv.+1.",
    "E6: Drooling Drop of Draconic Divinity — Bailu can heal allies who received a killing blow 1 more time per battle.",
  ],
  traces: [
    { stat: "defPct", value: 0.225 },
    { stat: "hpPct", value: 0.28 },
    { stat: "effRes", value: 0.1 },
  ],
}

const XUEYI: CharProg = {
  base: { hp: 1058, atk: 599, def: 396, spd: 103 },
  byLevel: {
    10: { hp: 208, atk: 118, def: 78, spd: 103 },
    20: { hp: 280, atk: 159, def: 105, spd: 103 },
    30: { hp: 410, atk: 232, def: 153, spd: 103 },
    40: { hp: 540, atk: 306, def: 202, spd: 103 },
    50: { hp: 669, atk: 379, def: 251, spd: 103 },
    60: { hp: 799, atk: 452, def: 299, spd: 103 },
    70: { hp: 928, atk: 526, def: 348, spd: 103 },
    80: { hp: 1058, atk: 599, def: 396, spd: 103 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.7, 0.77, 0.84, 0.91, 0.98, 1.05, 1.1375, 1.225, 1.3125, 1.4, 1.47, 1.54, 1.61, 1.68, 1.75],
    skill_a2: [0.35, 0.385, 0.42, 0.455, 0.49, 0.525, 0.56875, 0.6125, 0.65625, 0.7, 0.735, 0.77, 0.805, 0.84, 0.875],
    ult: [1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.125, 2.25, 2.375, 2.5, 2.6, 2.7, 2.8, 2.9, 3],
    ult_a2: [0.09, 0.096, 0.102, 0.108, 0.114, 0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18],
    ult_a3: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    talent: [0.45, 0.495, 0.54, 0.585, 0.63, 0.675, 0.73125, 0.7875, 0.84375, 0.9, 0.945, 0.99, 1.035, 1.08, 1.125],
  },
  eidolons: [
    "E1: Dvesha, Inhibited — Talent FUA DMG +40%.",
    "E2: Klesha, Breached — Talent FUA ignores Weakness types + heals 5% MaxHP.",
    "E3: Duḥkha, Ceased — Skill Lv.+2, Basic Lv.+1.",
    "E4: Karma, Severed — Using Ult increases Break Effect by 40% for 2 turns.",
    "E5: Deva, Enthralled — Ult Lv.+2, Talent Lv.+2.",
    "E6: Saṃsāra, Mastered — Max Karma stack limit decreases to 6.",
  ],
  traces: [
    { stat: "be", value: 0.373 },
    { stat: "hpPct", value: 0.18 },
    { stat: "dmg:Quantum", value: 0.08 },
  ],
}

const HANYA: CharProg = {
  base: { hp: 917, atk: 564, def: 352, spd: 110 },
  byLevel: {
    10: { hp: 180, atk: 111, def: 69, spd: 110 },
    20: { hp: 243, atk: 149, def: 93, spd: 110 },
    30: { hp: 355, atk: 218, def: 136, spd: 110 },
    40: { hp: 468, atk: 288, def: 180, spd: 110 },
    50: { hp: 580, atk: 357, def: 223, spd: 110 },
    60: { hp: 692, atk: 426, def: 266, spd: 110 },
    70: { hp: 804, atk: 495, def: 309, spd: 110 },
    80: { hp: 917, atk: 564, def: 352, spd: 110 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.2, 1.32, 1.44, 1.56, 1.68, 1.8, 1.95, 2.1, 2.25, 2.4, 2.52, 2.64, 2.76, 2.88, 3],
    skill_a2: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    ult: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    ult_a2: [0.15, 0.155, 0.16, 0.165, 0.17, 0.175, 0.18125, 0.1875, 0.19375, 0.2, 0.205, 0.21, 0.215, 0.22, 0.225],
    ult_a3: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    talent: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375],
    talent_a2: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  },
  eidolons: [
    "E1: One Heart — When an ally with Hanya's Ult effect defeats an enemy, Hanya's action advances 15% (1×/turn).",
    "E2: Two Views — After using Skill, Hanya's SPD increases by 20% for 1 turn.",
    "E3: Three Temptations — Skill Lv.+2, Basic Lv.+1.",
    "E4: Four Truths — Ultimate duration +1 turn.",
    "E5: Five Skandhas — Ult Lv.+2, Talent Lv.+2.",
    "E6: Six Reverences — Talent DMG Boost +10%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "spdFlat", value: 9 },
  ],
}

const JIAOQIU: CharProg = {
  base: { hp: 1358, atk: 601, def: 509, spd: 98 },
  byLevel: {
    10: { hp: 267, atk: 118, def: 100, spd: 98 },
    20: { hp: 360, atk: 159, def: 135, spd: 98 },
    30: { hp: 526, atk: 233, def: 197, spd: 98 },
    40: { hp: 693, atk: 306, def: 259, spd: 98 },
    50: { hp: 859, atk: 380, def: 322, spd: 98 },
    60: { hp: 1025, atk: 454, def: 384, spd: 98 },
    70: { hp: 1191, atk: 527, def: 446, spd: 98 },
    80: { hp: 1358, atk: 601, def: 509, spd: 98 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.75, 0.825, 0.9, 0.975, 1.05, 1.125, 1.21875, 1.3125, 1.40625, 1.5, 1.575, 1.65, 1.725, 1.8, 1.875],
    skill_a2: [0.45, 0.495, 0.54, 0.585, 0.63, 0.675, 0.73125, 0.7875, 0.84375, 0.9, 0.945, 0.99, 1.035, 1.08, 1.125],
    skill_a3: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ult: [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9, 0.95, 1, 1.04, 1.08, 1.12, 1.16, 1.2],
    ult_a2: [0.5, 0.51, 0.52, 0.53, 0.54, 0.55, 0.5625, 0.575, 0.5875, 0.6, 0.61, 0.62, 0.63, 0.64, 0.65],
    ult_a3: [0.09, 0.096, 0.102, 0.108, 0.114, 0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18],
    talent: [0.075, 0.0825, 0.09, 0.0975, 0.105, 0.1125, 0.121875, 0.13125, 0.140625, 0.15, 0.1575, 0.165, 0.1725, 0.18, 0.1875],
    talent_a2: [0.025, 0.0275, 0.03, 0.0325, 0.035, 0.0375, 0.040625, 0.04375, 0.046875, 0.05, 0.0525, 0.055, 0.0575, 0.06, 0.0625],
    talent_a3: [0.9, 0.99, 1.08, 1.17, 1.26, 1.35, 1.4625, 1.575, 1.6875, 1.8, 1.89, 1.98, 2.07, 2.16, 2.25],
  },
  eidolons: [
    "E1: Pentapathic Transference — Allies deal 40% increased DMG to Ashen Roast enemies.",
    "E2: From Savor Comes Suffer — Ashen Roast Fire DoT multiplier ×300%.",
    "E3: Flavored Euphony Reigns Supreme — Skill Lv.+2, Basic Lv.+1.",
    "E4: Leisure In, Luster Out — While Zone exists, enemy ATK −15%.",
    "E5: Duel in Dawn, Dash in Dusk — Ult Lv.+2, Talent Lv.+2.",
    "E6: Nonamorphic Pyrobind — Max Ashen Roast stacks 9, each stack −3% All RES.",
  ],
  traces: [
    { stat: "dmg:Fire", value: 0.144 },
    { stat: "spdFlat", value: 5 },
    { stat: "ehr", value: 0.28 },
  ],
}

const FEIXIAO: CharProg = {
  base: { hp: 1047, atk: 601, def: 388, spd: 112 },
  byLevel: {
    10: { hp: 206, atk: 118, def: 76, spd: 112 },
    20: { hp: 277, atk: 159, def: 102, spd: 112 },
    30: { hp: 406, atk: 233, def: 150, spd: 112 },
    40: { hp: 534, atk: 306, def: 198, spd: 112 },
    50: { hp: 662, atk: 380, def: 245, spd: 112 },
    60: { hp: 791, atk: 454, def: 293, spd: 112 },
    70: { hp: 919, atk: 527, def: 340, spd: 112 },
    80: { hp: 1047, atk: 601, def: 388, spd: 112 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5],
    ult: [0.96, 1.024, 1.088, 1.152, 1.216, 1.28, 1.36, 1.44, 1.52, 1.6, 1.664, 1.728, 1.792, 1.856, 1.92],
    ult_a2: [4.02, 4.318, 4.616, 4.914, 5.212, 5.51, 5.8825, 6.255, 6.6275, 7, 7.298, 7.596, 7.894, 8.192, 8.49],
    talent: [0.55, 0.605, 0.66, 0.715, 0.77, 0.825, 0.89375, 0.9625, 1.03125, 1.1, 1.155, 1.21, 1.265, 1.32, 1.375],
    talent_a2: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    blitz: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    blitz_a2: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375],
  },
  eidolons: [
    "E1: Skyward I Quell — After Blitz/Waraxe, Ultimate DMG +10% per stack, max 5.",
    "E2: Moonward I Wish — Each ally FUA grants +1 Flying Aureus (6×/turn).",
    "E3: Starward I Bode — Ult Lv.+2, Basic Lv.+1.",
    "E4: Stormward I Hear — Talent FUA Toughness Reduction +100%; launching it +8% SPD 2t.",
    "E5: Heavenward I Leap — Skill Lv.+2, Talent Lv.+2.",
    "E6: Homeward I Near — Ultimate All-Type RES PEN +20%; Talent FUA counted as Ult +140% mult.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.12 },
    { stat: "defPct", value: 0.125 },
  ],
}

const YUNLI: CharProg = {
  base: { hp: 1358, atk: 679, def: 460, spd: 94 },
  byLevel: {
    10: { hp: 267, atk: 133, def: 90, spd: 94 },
    20: { hp: 360, atk: 180, def: 122, spd: 94 },
    30: { hp: 526, atk: 263, def: 178, spd: 94 },
    40: { hp: 693, atk: 346, def: 235, spd: 94 },
    50: { hp: 859, atk: 429, def: 291, spd: 94 },
    60: { hp: 1025, atk: 512, def: 347, spd: 94 },
    70: { hp: 1191, atk: 595, def: 404, spd: 94 },
    80: { hp: 1358, atk: 679, def: 460, spd: 94 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    skill_a2: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    skill_a3: [0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3, 0.31, 0.32, 0.33, 0.34, 0.35],
    skill_a4: [50, 80, 102.5, 125, 140, 155, 166.25, 177.5, 188.75, 200, 211.25, 222.5, 233.75, 245, 256.25],
    ult: [1.32, 1.408, 1.496, 1.584, 1.672, 1.76, 1.87, 1.98, 2.09, 2.2, 2.288, 2.376, 2.464, 2.552, 2.64],
    ult_a2: [0.66, 0.704, 0.748, 0.792, 0.836, 0.88, 0.935, 0.99, 1.045, 1.1, 1.144, 1.188, 1.232, 1.276, 1.32],
    ult_a3: [0.432, 0.4608, 0.4896, 0.5184, 0.5472, 0.576, 0.612, 0.648, 0.684, 0.72, 0.7488, 0.7776, 0.8064, 0.8352, 0.864],
    ult_a4: [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9, 0.95, 1, 1.04, 1.08, 1.12, 1.16, 1.2],
    talent: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    talent_a2: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    talent_a3: [15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15],
  },
  eidolons: [
    "E1: Weathered Blade Does Not Sully — Intuit Slash/Cull DMG +20%, Cull +3 extra hits.",
    "E2: First Luster Breaks Dawn — Counter ignores 20% DEF.",
    "E3: Mastlength Twirls Mountweight — Ult Lv.+2, Basic Lv.+1.",
    "E4: Artisan's Ironsong — After Intuit, Effect RES +50% 1t.",
    "E5: Blade of Old Outlasts All — Skill Lv.+2, Talent Lv.+2.",
    "E6: Walk in Blade, Talk in Zither — Parry: any enemy active ability triggers Cull; Intuit CRIT Rate +15% + Physical RES PEN 20%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.067 },
    { stat: "hpPct", value: 0.18 },
  ],
}

const LINGSHA: CharProg = {
  base: { hp: 1358, atk: 679, def: 436, spd: 98 },
  byLevel: {
    10: { hp: 267, atk: 133, def: 86, spd: 98 },
    20: { hp: 360, atk: 180, def: 115, spd: 98 },
    30: { hp: 526, atk: 263, def: 169, spd: 98 },
    40: { hp: 693, atk: 346, def: 222, spd: 98 },
    50: { hp: 859, atk: 429, def: 276, spd: 98 },
    60: { hp: 1025, atk: 512, def: 329, spd: 98 },
    70: { hp: 1191, atk: 595, def: 383, spd: 98 },
    80: { hp: 1358, atk: 679, def: 436, spd: 98 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1],
    skill_a2: [0.1, 0.105, 0.11, 0.115, 0.12, 0.124, 0.128, 0.132, 0.136, 0.14, 0.144, 0.148, 0.152, 0.156, 0.16],
    skill_a3: [105, 168, 215.25, 262.5, 294, 325.5, 349.125, 372.75, 396.375, 420, 443.625, 467.25, 490.875, 514.5, 538.125],
    ult: [0.9, 0.96, 1.02, 1.08, 1.14, 1.2, 1.275, 1.35, 1.425, 1.5, 1.56, 1.62, 1.68, 1.74, 1.8],
    ult_a2: [0.08, 0.085, 0.09, 0.095, 0.1, 0.104, 0.108, 0.112, 0.116, 0.12, 0.124, 0.128, 0.132, 0.136, 0.14],
    ult_a3: [90, 144, 184.5, 225, 252, 279, 299.25, 319.5, 339.75, 360, 380.25, 400.5, 420.75, 441, 461.25],
    ult_a4: [0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3],
    talent: [0.375, 0.4125, 0.45, 0.4875, 0.525, 0.5625, 0.609375, 0.65625, 0.703125, 0.75, 0.7875, 0.825, 0.8625, 0.9, 0.9375],
    talent_a2: [0.375, 0.4125, 0.45, 0.4875, 0.525, 0.5625, 0.609375, 0.65625, 0.703125, 0.75, 0.7875, 0.825, 0.8625, 0.9, 0.9375],
    talent_a3: [0.08, 0.085, 0.09, 0.095, 0.1, 0.104, 0.108, 0.112, 0.116, 0.12, 0.124, 0.128, 0.132, 0.136, 0.14],
    talent_a4: [90, 144, 184.5, 225, 252, 279, 299.25, 319.5, 339.75, 360, 380.25, 400.5, 420.75, 441, 461.25],
  },
  eidolons: [
    "E1: Bloom on Vileward Bouquet — Weakness Break Efficiency +50%; broken enemies DEF −20%.",
    "E2: Leisure in Carmine Smokeveil — After Ult, all allies Break Effect +40% 3t.",
    "E3: Shine of Floral Wick — Ult Lv.+2, Talent Lv.+2.",
    "E4: Redolence from Canopied Banquet — When Fuyuan acts, heal lowest-HP ally 40% ATK.",
    "E5: Poise Atop Twists and Turns — Skill Lv.+2, Basic Lv.+1.",
    "E6: Arcadia Under Deep Seclusion — Fuyuan on field: all enemies All-RES −20%; Fuyuan attacks +4× 50% ATK hits.",
  ],
  traces: [
    { stat: "atkPct", value: 0.1 },
    { stat: "be", value: 0.373 },
    { stat: "hpPct", value: 0.18 },
  ],
}

const MISHA: CharProg = {
  base: { hp: 1270, atk: 599, def: 396, spd: 96 },
  byLevel: {
    10: { hp: 250, atk: 118, def: 78, spd: 96 },
    20: { hp: 336, atk: 159, def: 105, spd: 96 },
    30: { hp: 492, atk: 232, def: 153, spd: 96 },
    40: { hp: 648, atk: 306, def: 202, spd: 96 },
    50: { hp: 803, atk: 379, def: 251, spd: 96 },
    60: { hp: 959, atk: 452, def: 299, spd: 96 },
    70: { hp: 1114, atk: 526, def: 348, spd: 96 },
    80: { hp: 1270, atk: 599, def: 396, spd: 96 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5],
    skill_a2: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1],
    skill_a3: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ult: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    ult_a2: [0.12, 0.128, 0.136, 0.144, 0.152, 0.16, 0.17, 0.18, 0.19, 0.2, 0.208, 0.216, 0.224, 0.232, 0.24],
    ult_a3: [0.18, 0.192, 0.204, 0.216, 0.228, 0.24, 0.255, 0.27, 0.285, 0.3, 0.312, 0.324, 0.336, 0.348, 0.36],
    talent: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5],
    talent_a2: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  eidolons: [
    "E1: Whimsicality of Fancy — For every enemy on the field, Ult Hits Per Action +1 (max +5).",
    "E2: Yearning of Youth — Before each Ult hit lands, 24% base chance to reduce target's DEF by 16% for 3 turns.",
    "E3: Vestige of Happiness — Ult Lv.+2, Basic Lv.+1.",
    "E4: Visage of Kinship — Each Ult hit DMG multiplier +6%.",
    "E5: Genesis of First Love — Skill Lv.+2, Talent Lv.+2.",
    "E6: Estrangement of Dream — Using Ult increases own DMG by 30% until end of turn; next Skill recovers 1 SP.",
  ],
  traces: [
    { stat: "critRate", value: 0.067 },
    { stat: "defPct", value: 0.225 },
    { stat: "dmg:Ice", value: 0.224 },
  ],
}

const ACHERON: CharProg = {
  base: { hp: 1125, atk: 698, def: 436, spd: 101 },
  byLevel: {
    10: { hp: 222, atk: 137, def: 86, spd: 101 },
    20: { hp: 298, atk: 185, def: 115, spd: 101 },
    30: { hp: 436, atk: 270, def: 169, spd: 101 },
    40: { hp: 574, atk: 356, def: 222, spd: 101 },
    50: { hp: 712, atk: 441, def: 276, spd: 101 },
    60: { hp: 849, atk: 527, def: 329, spd: 101 },
    70: { hp: 987, atk: 613, def: 383, spd: 101 },
    80: { hp: 1125, atk: 698, def: 436, spd: 101 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.3, 1.4, 1.5, 1.6, 1.68, 1.76, 1.84, 1.92, 2],
    skill_a2: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    ult: [0.144, 0.1536, 0.1632, 0.1728, 0.1824, 0.192, 0.204, 0.216, 0.228, 0.24, 0.2496, 0.2592, 0.2688, 0.2784, 0.288],
    ult_a2: [0.09, 0.096, 0.102, 0.108, 0.114, 0.12, 0.1275, 0.135, 0.1425, 0.15, 0.156, 0.162, 0.168, 0.174, 0.18],
    ult_a3: [0.72, 0.768, 0.816, 0.864, 0.912, 0.96, 1.02, 1.08, 1.14, 1.2, 1.248, 1.296, 1.344, 1.392, 1.44],
    ult_a4: [0.36, 0.384, 0.408, 0.432, 0.456, 0.48, 0.51, 0.54, 0.57, 0.6, 0.624, 0.648, 0.672, 0.696, 0.72],
    talent: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25],
  },
  eidolons: [
    "E1: Silenced Sky Spake Sooth — CRIT Rate +18% vs debuffed enemies.",
    "E2: Mute Thunder in Still Tempest — Abyss Nihility requirement −1; turn start +1 SD/+1 CK.",
    "E3: Frost Bites in Death — Ult Lv.+2, Basic Lv.+1.",
    "E4: Shrined Fire for Mirrored Soul — enemies take +8% Ultimate DMG Vuln.",
    "E5: Strewn Souls on Erased Earths — Skill Lv.+2, Talent Lv.+2.",
    "E6: Apocalypse, the Emancipator — Ult All-RES PEN +20%; Basic/Skill count as Ult DMG; toughness ignore.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critDmg", value: 0.24 },
    { stat: "dmg:Lightning", value: 0.08 },
  ],
}

const MOZE: CharProg = {
  base: { hp: 811, atk: 599, def: 352, spd: 111 },
  byLevel: {
    10: { hp: 160, atk: 118, def: 69, spd: 111 },
    20: { hp: 215, atk: 159, def: 93, spd: 111 },
    30: { hp: 314, atk: 232, def: 136, spd: 111 },
    40: { hp: 414, atk: 306, def: 180, spd: 111 },
    50: { hp: 513, atk: 379, def: 223, spd: 111 },
    60: { hp: 612, atk: 452, def: 266, spd: 111 },
    70: { hp: 712, atk: 526, def: 309, spd: 111 },
    80: { hp: 811, atk: 599, def: 352, spd: 111 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.75, 0.825, 0.9, 0.975, 1.05, 1.125, 1.21875, 1.3125, 1.40625, 1.5, 1.575, 1.65, 1.725, 1.8, 1.875],
    ult: [1.62, 1.728, 1.836, 1.944, 2.052, 2.16, 2.295, 2.43, 2.565, 2.7, 2.808, 2.916, 3.024, 3.132, 3.24],
    talent: [0.8, 0.88, 0.96, 1.04, 1.12, 1.2, 1.3, 1.4, 1.5, 1.6, 1.68, 1.76, 1.84, 1.92, 2],
    talent_a2: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    talent_a3: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375],
  },
  eidolons: [
    "E1: Oathkeeper — Battle-start +20 Energy; Talent Additional DMG triggers +2 Energy.",
    "E2: Wrathbearer — All allies deal +40% CRIT DMG to the Prey target.",
    "E3: Deathchaser — Ult Lv.+2, Talent Lv.+2.",
    "E4: Heathprowler — After Ult, Moze DMG +30% 2t.",
    "E5: Truthbender — Skill Lv.+2, Basic Lv.+1.",
    "E6: Faithbinder — Talent FUA DMG multiplier +25%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.1 },
  ],
}

const ROBIN: CharProg = {
  base: { hp: 1280, atk: 640, def: 485, spd: 102 },
  byLevel: {
    10: { hp: 252, atk: 126, def: 95, spd: 102 },
    20: { hp: 339, atk: 169, def: 128, spd: 102 },
    30: { hp: 496, atk: 248, def: 188, spd: 102 },
    40: { hp: 653, atk: 326, def: 247, spd: 102 },
    50: { hp: 810, atk: 405, def: 306, spd: 102 },
    60: { hp: 967, atk: 483, def: 366, spd: 102 },
    70: { hp: 1123, atk: 561, def: 425, spd: 102 },
    80: { hp: 1280, atk: 640, def: 485, spd: 102 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    ult: [0.72, 0.768, 0.816, 0.864, 0.912, 0.96, 1.02, 1.08, 1.14, 1.2, 1.248, 1.296, 1.344, 1.392, 1.44],
    ult_a2: [0.152, 0.1596, 0.1672, 0.1748, 0.1824, 0.19, 0.1995, 0.209, 0.2185, 0.228, 0.2356, 0.2432, 0.2508, 0.2584, 0.266],
    ult_a3: [50, 65, 80, 95, 110, 125, 143.75, 162.5, 181.25, 200, 215, 230, 245, 260, 275],
    talent: [0.05, 0.065, 0.08, 0.095, 0.11, 0.125, 0.14375, 0.1625, 0.18125, 0.2, 0.215, 0.23, 0.245, 0.26, 0.275],
  },
  eidolons: [
    "E1: Land of Smiles — While Concerto active, all allies All-Type RES PEN +24%.",
    "E2: Afternoon Tea For Two — While Concerto active, all allies SPD +16%; Talent Energy Regeneration +1.",
    "E3: Inverted Tuning — Skill Lv. +2, Ultimate Lv. +2.",
    "E4: Raindrop Key — Ultimate dispels ally CC; while Concerto, all allies Effect RES +50%.",
    "E5: Lonestar's Lament — Basic ATK Lv. +1, Talent Lv. +2.",
    "E6: Moonless Midnight — Concerto Additional Physical DMG CRIT DMG +450%, trigger max 8 per Ult.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.18 },
    { stat: "spdFlat", value: 5 },
  ],
}

const JADE: CharProg = {
  base: { hp: 1086, atk: 659, def: 509, spd: 103 },
  byLevel: {
    10: { hp: 214, atk: 130, def: 100, spd: 103 },
    20: { hp: 288, atk: 175, def: 135, spd: 103 },
    30: { hp: 421, atk: 255, def: 197, spd: 103 },
    40: { hp: 554, atk: 336, def: 259, spd: 103 },
    50: { hp: 687, atk: 417, def: 322, spd: 103 },
    60: { hp: 820, atk: 498, def: 384, spd: 103 },
    70: { hp: 953, atk: 578, def: 446, spd: 103 },
    80: { hp: 1086, atk: 659, def: 509, spd: 103 },
  },
  abilities: {
    basic: [0.45, 0.54, 0.63, 0.72, 0.81, 0.9, 0.99, 1.08, 1.17, 1.26],
    basic_a2: [0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.33, 0.36, 0.39, 0.42],
    skill: [0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3],
    ult: [1.2, 1.32, 1.44, 1.56, 1.68, 1.8, 1.95, 2.1, 2.25, 2.4, 2.52, 2.64, 2.76, 2.88, 3.0],
    ult_a2: [0.4, 0.44, 0.48, 0.52, 0.56, 0.6, 0.65, 0.7, 0.75, 0.8, 0.84, 0.88, 0.92, 0.96, 1.0],
    talent: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    talent_a2: [0.012, 0.0132, 0.0144, 0.0156, 0.0168, 0.018, 0.0195, 0.021, 0.0225, 0.024, 0.0252, 0.0264, 0.0276, 0.0288, 0.03],
  },
  eidolons: [
    "E1: Altruism? Nevertheless Tradable — Talent FUA DMG +32%; after Debt Collector attacks, hitting 2/1 enemies grants +1/+2 extra Charge.",
    "E2: Morality? Herein Authenticated — At 15+ Pawned Asset stacks: CRIT Rate +18%.",
    "E3: Honesty? Soon Mortgaged — Skill Lv. +2, Talent Lv. +2.",
    "E4: Sincerity? Put Option Only — Ult: Jade ignores 12% enemy DEF for 3 turns.",
    "E5: Hope? Hitherto Forfeited — Ult Lv. +2, Basic ATK Lv. +1.",
    "E6: Equity? Pending Sponsorship — While Debt Collector exists: Quantum RES PEN +20%, Jade gains Debt Collector state.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "dmg:Quantum", value: 0.224 },
    { stat: "effRes", value: 0.1 },
  ],
}

const BOOTHILL: CharProg = {
  base: { hp: 1203, atk: 620, def: 436, spd: 107 },
  byLevel: {
    10: { hp: 237, atk: 122, def: 86, spd: 107 },
    20: { hp: 319, atk: 164, def: 115, spd: 107 },
    30: { hp: 466, atk: 240, def: 169, spd: 107 },
    40: { hp: 613, atk: 316, def: 222, spd: 107 },
    50: { hp: 761, atk: 392, def: 276, spd: 107 },
    60: { hp: 908, atk: 468, def: 329, spd: 107 },
    70: { hp: 1055, atk: 544, def: 383, spd: 107 },
    80: { hp: 1203, atk: 620, def: 436, spd: 107 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1.1, 1.32, 1.54, 1.76, 1.98, 2.2, 2.42, 2.64, 2.86, 3.08],
    skill: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375],
    ult: [2.4, 2.56, 2.72, 2.88, 3.04, 3.2, 3.4, 3.6, 3.8, 4, 4.16, 4.32, 4.48, 4.64, 4.8],
    ult_a2: [0.3, 0.31, 0.32, 0.33, 0.34, 0.35, 0.3625, 0.375, 0.3875, 0.4, 0.41, 0.42, 0.43, 0.44, 0.45],
    talent: [0.35, 0.385, 0.42, 0.455, 0.49, 0.525, 0.56875, 0.6125, 0.65625, 0.7, 0.735, 0.77, 0.805, 0.84, 0.875],
    talent_a2: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    talent_a3: [0.85, 0.935, 1.02, 1.105, 1.19, 1.275, 1.38125, 1.4875, 1.59375, 1.7, 1.785, 1.87, 1.955, 2.04, 2.125],
    talent_a4: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  },
  eidolons: [
    "E1: Dusty Trail's Lone Star — Battle start +1 Pocket Trickshot; DMG ignores 16% enemy DEF.",
    "E2: Milestonemonger — In Standoff, gaining Pocket Trickshot → +1 SP and BE+30% 2t (once/turn, incl. overflow).",
    "E3: Marble Orchard's Guard — Ult Lv.+2, Basic ATK Lv.+1.",
    "E4: Cold Cuts Chef — Standoff enemy takes +12% DMG from Boothill; Boothill's +15% taken offset by 12%.",
    "E5: Stump Speech — Skill Lv.+2, Talent Lv.+2.",
    "E6: Crowbar Hotel's Raccoon — Talent Break DMG: +40% to target, +70% to adjacent targets.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "be", value: 0.373 },
    { stat: "hpPct", value: 0.1 },
  ],
}

const RAPPA: CharProg = {
  base: { hp: 1086, atk: 717, def: 460, spd: 96 },
  byLevel: {
    10: { hp: 214, atk: 141, def: 90, spd: 96 },
    20: { hp: 288, atk: 190, def: 122, spd: 96 },
    30: { hp: 421, atk: 278, def: 178, spd: 96 },
    40: { hp: 554, atk: 366, def: 235, spd: 96 },
    50: { hp: 687, atk: 454, def: 291, spd: 96 },
    60: { hp: 820, atk: 542, def: 347, spd: 96 },
    70: { hp: 953, atk: 630, def: 404, spd: 96 },
    80: { hp: 1086, atk: 717, def: 460, spd: 96 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic_en: [1.5, 1.7, 1.9, 2.1, 2.3, 2.5, 2.7, 2.9, 3.1, 3.3],
    skill: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    ult: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    ult_a2: [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.225, 0.25, 0.275, 0.3, 0.32, 0.34, 0.36, 0.38, 0.4],
    talent: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75],
    talent_a2: [0.25, 0.275, 0.3, 0.325, 0.35, 0.375, 0.40625, 0.4375, 0.46875, 0.5, 0.525, 0.55, 0.575, 0.6, 0.625],
    talent_a3: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    talent_a4: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  eidolons: [
    "E1: Returned Is the Revenant With No Ferry Toll — In Sealform DMG ignores 15% DEF; +20 Energy on exiting Sealform.",
    "E2: Free Is the Mind Enlightened by Haikus — Enhanced Basic first 2 hits deal +50% toughness to the designated enemy.",
    "E3: Many Are the Shrines That Repel No Hell — Skill Lv.+2, Talent Lv.+2.",
    "E4: Lost Is the Nindō Devoured by Time — All allies SPD +12% while in Sealform.",
    "E5: Steady Is The Ranger With Unerring Arrows — Ult Lv.+2, Basic ATK Lv.+1.",
    "E6: Righteous Is the Wrath That Spares No Evil — Battle-start +5 Charge, cap +5; +5 Charge after 3rd Petalblade hit.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "be", value: 0.133 },
    { stat: "spdFlat", value: 9 },
  ],
}

const ARGENTI: CharProg = {
  base: { hp: 1047, atk: 737, def: 363, spd: 103 },
  byLevel: {
    10: { hp: 206, atk: 145, def: 71, spd: 103 },
    20: { hp: 277, atk: 195, def: 96, spd: 103 },
    30: { hp: 406, atk: 285, def: 141, spd: 103 },
    40: { hp: 534, atk: 376, def: 185, spd: 103 },
    50: { hp: 662, atk: 466, def: 230, spd: 103 },
    60: { hp: 791, atk: 556, def: 274, spd: 103 },
    70: { hp: 919, atk: 647, def: 319, spd: 103 },
    80: { hp: 1047, atk: 737, def: 363, spd: 103 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5],
    ult: [0.96, 1.024, 1.088, 1.152, 1.216, 1.28, 1.36, 1.44, 1.52, 1.6, 1.664, 1.728, 1.792, 1.856, 1.92],
    ult_a2: [1.68, 1.792, 1.904, 2.016, 2.128, 2.24, 2.38, 2.52, 2.66, 2.8, 2.912, 3.024, 3.136, 3.248, 3.36],
    ult_a3: [0.57, 0.608, 0.646, 0.684, 0.722, 0.76, 0.8075, 0.855, 0.9025, 0.95, 0.988, 1.026, 1.064, 1.102, 1.14],
    talent: [0.01, 0.0115, 0.013, 0.0145, 0.016, 0.0175, 0.019375, 0.02125, 0.023125, 0.025, 0.0265, 0.028, 0.0295, 0.031, 0.0325],
  },
  eidolons: [
    "E1: A Lacuna in Kingdom of Aesthetics — Each Apotheosis stack +4% CRIT DMG.",
    "E2: Agate's Humility — Ult used vs 3+ enemies: ATK +40% 1t.",
    "E3: Thorny Road's Glory — Skill Lv.+2, Talent Lv.+2.",
    "E4: Trumpet's Dedication — Battle-start +2 Apotheosis; stack cap +2.",
    "E5: Snow, From Somewhere in Cosmos — Ult Lv.+2, Basic Lv.+1.",
    "E6: Your Resplendence — Ult ignores 30% enemy DEF.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Physical", value: 0.144 },
  ],
}

const RUANMEI: CharProg = {
  base: { hp: 1086, atk: 659, def: 485, spd: 104 },
  byLevel: {
    10: { hp: 214, atk: 130, def: 95, spd: 104 },
    20: { hp: 288, atk: 175, def: 128, spd: 104 },
    30: { hp: 421, atk: 255, def: 188, spd: 104 },
    40: { hp: 554, atk: 336, def: 247, spd: 104 },
    50: { hp: 687, atk: 417, def: 306, spd: 104 },
    60: { hp: 820, atk: 498, def: 366, spd: 104 },
    70: { hp: 953, atk: 578, def: 425, spd: 104 },
    80: { hp: 1086, atk: 659, def: 485, spd: 104 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.16, 0.176, 0.192, 0.208, 0.224, 0.24, 0.26, 0.28, 0.3, 0.32, 0.336, 0.352, 0.368, 0.384, 0.4],
    skill_a2: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    skill_a3: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    ult: [0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.2125, 0.225, 0.2375, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3],
    talent: [0.08, 0.082, 0.084, 0.086, 0.088, 0.09, 0.0925, 0.095, 0.0975, 0.1, 0.102, 0.104, 0.106, 0.108, 0.11], // teammate SPD (#1[0])
    talent_a2: [0.6, 0.66, 0.72, 0.78, 0.84, 0.9, 0.975, 1.05, 1.125, 1.2, 1.26, 1.32, 1.38, 1.44, 1.5], // Ice Break DMG on ally break (#2[1])
    ult_a3: Array(15).fill(0.2), // Thanatoplum Rebloom delay = #3 x Break Effect
    ult_a4: Array(15).fill(0.1), // Thanatoplum Rebloom delay flat
    ult_a5: [0.32, 0.34, 0.36, 0.38, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6], // Thanatoplum Rebloom Break DMG (#5 x Ice Break DMG)
  },
  eidolons: [
    "E1: Neuronic Embroidery — Zone up: all allies ignore 20% enemy DEF.",
    "E2: Reedside Promenade — Allies deal +40% ATK to Weakness-Broken enemies.",
    "E3: Viridescent Pirouette — Ult Lv.+2, Talent Lv.+2.",
    "E4: Chatoyant Eclat — Enemy Weakness-Broken: Break Effect +100% 3t.",
    "E5: Languid Barrette — Skill Lv.+2, Basic Lv.+1.",
    "E6: Sash Cascade — Zone duration +1; Talent Break DMG multiplier +200%.",
  ],
  traces: [
    { stat: "be", value: 0.373 },
    { stat: "defPct", value: 0.225 },
    { stat: "spdFlat", value: 5 },
  ],
}

const DR_RATIO: CharProg = {
  base: { hp: 1047, atk: 776, def: 460, spd: 103 },
  byLevel: {
    10: { hp: 206, atk: 153, def: 90, spd: 103 },
    20: { hp: 277, atk: 205, def: 122, spd: 103 },
    30: { hp: 406, atk: 300, def: 178, spd: 103 },
    40: { hp: 534, atk: 396, def: 235, spd: 103 },
    50: { hp: 662, atk: 491, def: 291, spd: 103 },
    60: { hp: 791, atk: 586, def: 347, spd: 103 },
    70: { hp: 919, atk: 681, def: 404, spd: 103 },
    80: { hp: 1047, atk: 776, def: 460, spd: 103 },
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.75, 0.825, 0.9, 0.975, 1.05, 1.125, 1.21875, 1.3125, 1.40625, 1.5, 1.575, 1.65, 1.725, 1.8, 1.875],
    ult: [1.44, 1.536, 1.632, 1.728, 1.824, 1.92, 2.04, 2.16, 2.28, 2.4, 2.496, 2.592, 2.688, 2.784, 2.88],
    talent: [1.35, 1.485, 1.62, 1.755, 1.89, 2.025, 2.19375, 2.3625, 2.53125, 2.7, 2.835, 2.97, 3.105, 3.24, 3.375],
  },
  eidolons: [
    "E1: Pride Comes Before a Fall — Summation cap +4; battle-start 4 stacks.",
    "E2: The Divine Is in the Details — FUA hit: +20% ATK per debuff on target (max 4/FUA).",
    "E3: Know Thyself — Ult Lv.+2, Basic Lv.+1.",
    "E4: Ignorance Is Blight — Triggering Talent +15 Energy.",
    "E5: Sic Itur Ad Astra — Skill Lv.+2, Talent Lv.+2.",
    "E6: Vincit Omnia Veritas — Wiseman's Folly +1 trigger; Talent FUA DMG +50%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.12 },
    { stat: "defPct", value: 0.125 },
  ],
}




// The Herta — Mage (Ice). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const THE_HERTA: CharProg = {
  base: { hp: 1164, atk: 679, def: 485, spd: 99 },
  byLevel: {
    10: { hp: 229, atk: 133, def: 95, spd: 99 },
    20: { hp: 308, atk: 180, def: 128, spd: 99 },
    30: { hp: 451, atk: 263, def: 188, spd: 99 },
    40: { hp: 594, atk: 346, def: 247, spd: 99 },
    50: { hp: 736, atk: 429, def: 306, spd: 99 },
    60: { hp: 879, atk: 512, def: 366, spd: 99 },
    70: { hp: 1021, atk: 595, def: 425, spd: 99 },
    80: { hp: 1164, atk: 679, def: 485, spd: 99 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Did You Get It
    basic_a2: Array(10).fill(3), // Did You Get It param#2
    basic_a3: Array(10).fill(1), // Did You Get It param#3
    basic_a4: Array(10).fill(0.3), // Did You Get It param#4
    skill: [0.35,0.385,0.42,0.455,0.49,0.525,0.56875,0.6125,0.65625,0.7,0.735,0.77,0.805,0.84,0.875], // Big Brain Energy
    skill_a2: Array(15).fill(1), // Big Brain Energy param#2
    ult: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak>
    ult_a2: Array(15).fill(2), // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak> param#2
    ult_a3: Array(15).fill(1), // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak> param#3
    ult_a4: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak> param#4
    ult_a5: Array(15).fill(3), // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak> param#5
    ult_a6: Array(15).fill(4), // <unbreak>Told Ya!</unbreak> <unbreak>Magic Happens</unbreak> param#6
    talent: [0.04,0.044,0.048,0.052,0.056,0.06,0.065,0.07,0.075,0.08,0.084,0.088,0.092,0.096,0.1], // Hand Them Over
    talent_a2: [0.02,0.022,0.024,0.026,0.028,0.03,0.0325,0.035,0.0375,0.04,0.042,0.044,0.046,0.048,0.05], // Hand Them Over param#2
    talent_a3: Array(15).fill(42), // Hand Them Over param#3
    talent_a4: Array(15).fill(1), // Hand Them Over param#4
    talent_a5: Array(15).fill(42), // Hand Them Over param#5
    talent_a6: Array(15).fill(25), // Hand Them Over param#6
    skill_en: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // Hear Me Out
    skill_en_a2: Array(15).fill(1), // Hear Me Out param#2
    skill_en_a3: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // Hear Me Out param#3
  },
  eidolons: [
    "E1: Night at Shorefall — When the Enhanced Skill calculates the number of Interpretation stacks, additionally counts 50% of the number of Interpretation stacks on the 1 target",
    "E2: Wind Through Keyhole — After The Herta enters combat or uses Ultimate, additionally gains 1 Inspiration stack. After using Enhanced Skill, advances The Herta's next action b",
    "E3: Door into Summer — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: The Sixteenth Key — The SPD of Erudition characters in the team increases by 12%.",
    "E5: Bitter Pill of Truth — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Sweet Lure of Answer — The Herta's Ice RES PEN increases by 20%. When the number of enemy targets on the field is (≥3)/2/1, Ultimate's DMG multiplier increases by 140%/250%/"
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "dmg:Ice", value: 0.224 },
    { stat: "spdFlat", value: 5 }
  ],
}

// Mydei — Warrior (Imaginary). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const MYDEI: CharProg = {
  base: { hp: 1552, atk: 426, def: 194, spd: 95 },
  byLevel: {
    10: { hp: 306, atk: 84, def: 38, spd: 95 },
    20: { hp: 411, atk: 113, def: 51, spd: 95 },
    30: { hp: 601, atk: 165, def: 75, spd: 95 },
    40: { hp: 792, atk: 217, def: 99, spd: 95 },
    50: { hp: 982, atk: 270, def: 122, spd: 95 },
    60: { hp: 1172, atk: 322, def: 146, spd: 95 },
    70: { hp: 1362, atk: 374, def: 170, spd: 95 },
    80: { hp: 1552, atk: 426, def: 194, spd: 95 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // Vow of Voyage
    skill: [0.45,0.495,0.54,0.585,0.63,0.675,0.73125,0.7875,0.84375,0.9,0.945,0.99,1.035,1.08,1.125], // Deaths are Legion, Regrets are None
    skill_a2: [0.25,0.275,0.3,0.325,0.35,0.375,0.40625,0.4375,0.46875,0.5,0.525,0.55,0.575,0.6,0.625], // Deaths are Legion, Regrets are None param#2
    skill_a3: Array(15).fill(0.5), // Deaths are Legion, Regrets are None param#3
    ult: [0.96,1.024,1.088,1.152,1.216,1.28,1.36,1.44,1.52,1.6,1.664,1.728,1.792,1.856,1.92], // Throne of Bones
    ult_a2: [0.6,0.64,0.68,0.72,0.76,0.8,0.85,0.9,0.95,1,1.04,1.08,1.12,1.16,1.2], // Throne of Bones param#2
    ult_a3: [0.15,0.155,0.16,0.165,0.17,0.175,0.18125,0.1875,0.19375,0.2,0.205,0.21,0.215,0.22,0.225], // Throne of Bones param#3
    ult_a4: Array(15).fill(2), // Throne of Bones param#4
    ult_a5: Array(15).fill(20), // Throne of Bones param#5
    talent: [0.15,0.16,0.17,0.18,0.19,0.2,0.2125,0.225,0.2375,0.25,0.26,0.27,0.28,0.29,0.3], // Blood for Blood
    talent_a2: Array(15).fill(0), // Blood for Blood param#2
    talent_a3: Array(15).fill(150), // Blood for Blood param#3
    talent_a4: Array(15).fill(0.5), // Blood for Blood param#4
    talent_a5: Array(15).fill(0.5), // Blood for Blood param#5
    skill_en: [0.55,0.605,0.66,0.715,0.77,0.825,0.89375,0.9625,1.03125,1.1,1.155,1.21,1.265,1.32,1.375], // Kingslayer Be King
    skill_en_a2: [0.33,0.363,0.396,0.429,0.462,0.495,0.53625,0.5775,0.61875,0.66,0.693,0.726,0.759,0.792,0.825], // Kingslayer Be King param#2
    skill_en_a3: Array(15).fill(0.35), // Kingslayer Be King param#3
    skill_en2: [1.4,1.54,1.68,1.82,1.96,2.1,2.275,2.45,2.625,2.8,2.94,3.08,3.22,3.36,3.5], // Godslayer Be God
    skill_en2_a2: [0.84,0.924,1.008,1.092,1.176,1.26,1.365,1.47,1.575,1.68,1.764,1.848,1.932,2.016,2.1], // Godslayer Be God param#2
    skill_en2_a3: Array(15).fill(150), // Godslayer Be God param#3
  },
  eidolons: [
    "E1: Frost Hones Spine of Steel — Increases the DMG multiplier dealt by Godslayer Be God to the primary target by 30%. This ability now deals to all enemies Imaginary DMG equal to the ",
    "E2: Strife Beholds Cry of Dead — During Vendetta, the DMG dealt by Mydei ignores 15% of enemy targets' DEF. After he receives healing, converts 40% of the healed amount to Charge. The",
    "E3: Honor Exalts Feast of Faith — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Siren Jolts the Laconic Lion — While in Vendetta, increases CRIT DMG by 30% and restores HP by 10% of this unit's Max HP after receiving attacks from enemy targets.",
    "E5: War Chisels Flesh of Flame — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Legacy Scales Mound of Blood — When entering battle, immediately enters the Vendetta state, and lowers the Charge required for Godslayer Be God to 100 point(s)."
  ],
  traces: [
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.18 },
    { stat: "spdFlat", value: 5 }
  ],
}

// Anaxa — Mage (Wind). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const ANAXA: CharProg = {
  base: { hp: 970, atk: 756, def: 557, spd: 97 },
  byLevel: {
    10: { hp: 191, atk: 149, def: 110, spd: 97 },
    20: { hp: 257, atk: 200, def: 148, spd: 97 },
    30: { hp: 376, atk: 293, def: 216, spd: 97 },
    40: { hp: 495, atk: 386, def: 284, spd: 97 },
    50: { hp: 613, atk: 478, def: 352, spd: 97 },
    60: { hp: 732, atk: 571, def: 421, spd: 97 },
    70: { hp: 851, atk: 664, def: 489, spd: 97 },
    80: { hp: 970, atk: 756, def: 557, spd: 97 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Pain, Brews Truth
    skill: [0.35,0.385,0.42,0.455,0.49,0.525,0.56875,0.6125,0.65625,0.7,0.735,0.77,0.805,0.84,0.875], // Fractal, Exiles Fallacy
    skill_a2: Array(15).fill(4), // Fractal, Exiles Fallacy param#2
    skill_a3: Array(15).fill(0.2), // Fractal, Exiles Fallacy param#3
    ult: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2], // Sprouting Life Sculpts Earth
    talent: [0.18,0.192,0.204,0.216,0.228,0.24,0.255,0.27,0.285,0.3,0.312,0.324,0.336,0.348,0.36], // Tetrad Wisdom Reigns Thrice
    talent_a2: Array(15).fill(3), // Tetrad Wisdom Reigns Thrice param#2
    talent_a3: Array(15).fill(5), // Tetrad Wisdom Reigns Thrice param#3
  },
  eidolons: [
    "E1: Magician, Isolated by Stars — After using Skill for the first time, recovers 1 Skill Point(s). When using Skill to hit enemy targets, decreases the targets' DEF by 16%, lasting for",
    "E2: Soul, True to History — When enemy targets enter the battlefield, triggers 1 instance of the Talent's Weakness Implant effect, and reduces their All-Type RES by 20%.",
    "E3: Pupil, Etched into Cosmos — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Blaze, Plunged to Canyon — When using Skill, increases ATK by 30%, lasting for 2 turn(s). This effect can stack up to 2 time(s).",
    "E5: Embryo, Set Beyond Vortex — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Everything Is in Everything — The DMG dealt by Anaxa is 130% of the original DMG. The 2 effects in the Trace Imperative Hiatus will be triggered directly and will no longer depend "
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Wind", value: 0.224 }
  ],
}

// Hysilens — Warlock (Physical). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const HYSILENS: CharProg = {
  base: { hp: 1203, atk: 601, def: 485, spd: 102 },
  byLevel: {
    10: { hp: 237, atk: 118, def: 95, spd: 102 },
    20: { hp: 319, atk: 159, def: 128, spd: 102 },
    30: { hp: 466, atk: 233, def: 188, spd: 102 },
    40: { hp: 613, atk: 306, def: 247, spd: 102 },
    50: { hp: 761, atk: 380, def: 306, spd: 102 },
    60: { hp: 908, atk: 454, def: 366, spd: 102 },
    70: { hp: 1055, atk: 527, def: 425, spd: 102 },
    80: { hp: 1203, atk: 601, def: 485, spd: 102 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Aeolian Mode: Echoes in Still Waters
    basic_a2: Array(10).fill(1), // Aeolian Mode: Echoes in Still Waters param#2
    basic_a3: Array(10).fill(3), // Aeolian Mode: Echoes in Still Waters param#3
    skill: [0.7,0.77,0.84,0.91,0.98,1.05,1.1375,1.225,1.3125,1.4,1.47,1.54,1.61,1.68,1.75], // Overtone Hum: Chorus After Dark Tides
    skill_a2: Array(15).fill(1), // Overtone Hum: Chorus After Dark Tides param#2
    skill_a3: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Overtone Hum: Chorus After Dark Tides param#3
    skill_a4: Array(15).fill(3), // Overtone Hum: Chorus After Dark Tides param#4
    ult: [1.2,1.28,1.36,1.44,1.52,1.6,1.7,1.8,1.9,2,2.08,2.16,2.24,2.32,2.4], // Maelstrom Rhapsody
    ult_a2: Array(15).fill(3), // Maelstrom Rhapsody param#2
    ult_a3: [0.15,0.16,0.17,0.18,0.19,0.2,0.2125,0.225,0.2375,0.25,0.26,0.27,0.28,0.29,0.3], // Maelstrom Rhapsody param#3
    ult_a4: [0.32,0.3728,0.4256,0.4784,0.5312,0.584,0.632,0.68,0.74,0.8,0.84,0.88,0.92,0.96,1], // Maelstrom Rhapsody param#4
    ult_a5: Array(15).fill(8), // Maelstrom Rhapsody param#5
    ult_a6: Array(15).fill(0.15), // Maelstrom Rhapsody param#6
    talent: Array(15).fill(1), // Sirenic Serenade
    talent_a2: [0.1,0.1165,0.133,0.1495,0.166,0.1825,0.1975,0.2125,0.23125,0.25,0.2625,0.275,0.2875,0.3,0.3125], // Sirenic Serenade param#2
    talent_a3: Array(15).fill(0.2), // Sirenic Serenade param#3
    talent_a4: [0.1,0.1165,0.133,0.1495,0.166,0.1825,0.1975,0.2125,0.23125,0.25,0.2625,0.275,0.2875,0.3,0.3125], // Sirenic Serenade param#4
    talent_a5: Array(15).fill(2), // Sirenic Serenade param#5
  },
  eidolons: [
    "E1: You Ask Why Hearts Cry — While Hysilens is on the field, the DoT dealt by ally targets is equal to 116% of their original value. When Hysilens inflicts Wind Shear/Bleed/Burn/S",
    "E2: Tell Me Why Waves Roar High — While the Zone is active, the DMG Boost effect from Trace The Fiddle of Pearls applies to all allies.",
    "E3: Why Do Lights Bid Goodbye — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Lo, How Time Flows By — While the Zone is active, reduces All-Type RES of all enemies by 20%.",
    "E5: In Ablution, I Hum and Sigh — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: When to Return From Where You Lie — While the Zone is active, at the start of each turn or after one attack by an ally target, increases the maximum trigger count for Hysilens's Physical"
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "spdFlat", value: 14 },
    { stat: "ehr", value: 0.1 }
  ],
}

// Evernight — Memory (Ice). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const EVERNIGHT: CharProg = {
  base: { hp: 1319, atk: 543, def: 582, spd: 99 },
  byLevel: {
    10: { hp: 260, atk: 107, def: 114, spd: 99 },
    20: { hp: 350, atk: 144, def: 154, spd: 99 },
    30: { hp: 511, atk: 210, def: 225, spd: 99 },
    40: { hp: 673, atk: 277, def: 297, spd: 99 },
    50: { hp: 834, atk: 343, def: 368, spd: 99 },
    60: { hp: 996, atk: 410, def: 439, spd: 99 },
    70: { hp: 1157, atk: 476, def: 510, spd: 99 },
    80: { hp: 1319, atk: 543, def: 582, spd: 99 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // Time Thence Blurs
    skill: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3], // Day Gently Slips
    skill_a2: Array(15).fill(2), // Day Gently Slips param#2
    skill_a3: Array(15).fill(2), // Day Gently Slips param#3
    skill_a4: Array(15).fill(0.5), // Day Gently Slips param#4
    skill_a5: Array(15).fill(12), // Day Gently Slips param#5
    skill_a6: Array(15).fill(0.1), // Day Gently Slips param#6
    ult: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // O Wakeful World, Goodnight
    ult_a2: Array(15).fill(2), // O Wakeful World, Goodnight param#2
    ult_a3: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // O Wakeful World, Goodnight param#3
    ult_a4: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // O Wakeful World, Goodnight param#4
    talent: Array(15).fill(2), // With Me, This Night
    talent_a2: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // With Me, This Night param#2
    talent_a3: Array(15).fill(2), // With Me, This Night param#3
    talent_a4: Array(15).fill(160), // With Me, This Night param#4
    talent_a5: Array(15).fill(0.5), // With Me, This Night param#5
    talent_a6: Array(15).fill(16), // With Me, This Night param#6
    talent_a7: Array(15).fill(0.05), // With Me, This Night param#7
    skill_en: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // Day Gently Slips
    skill_en_a2: Array(15).fill(2), // Day Gently Slips param#2
    skill_en_a3: Array(15).fill(2), // Day Gently Slips param#3
    skill_en_a4: Array(15).fill(0.5), // Day Gently Slips param#4
    skill_en_a5: Array(15).fill(12), // Day Gently Slips param#5
    skill_en_a6: Array(15).fill(0.1), // Day Gently Slips param#6
    mem_skill: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // Remembrance, Whirling, Like Rain
    mem_skill_a2: [0.05,0.06,0.07,0.08,0.09,0.1,0.11,0.12,0.13,0.14], // Remembrance, Whirling, Like Rain param#2
    mem_skill_a3: Array(10).fill(4), // Remembrance, Whirling, Like Rain param#3
    mem_skill_a4: Array(10).fill(1), // Remembrance, Whirling, Like Rain param#4
    mem_talent: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // Solitude, Drifting, In Murk
    mem_talent_a2: Array(10).fill(3), // Solitude, Drifting, In Murk param#2
    mem_talent_en2: Array(10).fill(0.1), // You, Parting, Beyond Reach
    mem_talent_en2_a2: Array(10).fill(0.01), // You, Parting, Beyond Reach param#2
    mem_talent_en2_a3: Array(10).fill(40), // You, Parting, Beyond Reach param#3
    mem_skill_en: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Dream, Dissolving, as Dew
    mem_skill_en_a2: [0.03,0.036,0.042,0.048,0.054,0.06,0.066,0.072,0.078,0.084], // Dream, Dissolving, as Dew param#2
    mem_skill_en_a3: Array(10).fill(16), // Dream, Dissolving, as Dew param#3
  },
  eidolons: [
    "E1: Sleep Tight, the Night Dreams Long — When Evernight is on the field, if there are (≥4)/3/2/1 enemy targets on the field, ally memosprites deal DMG equal to 120%/125%/130%/150% of their or",
    "E2: Listen Up, the Slumber Speaks Soft — Increases Evernight's and the memosprite Evey's CRIT DMG by 40%. Each time Evernight gains Memoria, increases the amount of Memoria gain by 2 point(s)",
    "E3: Fear Not, the Nightmare Lies Past — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Memosprite Talent Lv. +1, up to a maximum of Lv. 10.",
    "E4: Wake Up, the Tomorrow is Yours — While Evernight is on the field, ally memosprites' Weakness Break Efficiency increases by 25%, and the memosprite Evey's Weakness Break Efficiency add",
    "E5: Let Go, the Me in Memories — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Memosprite Skill Lv. +1, up to a maximum of Lv. 10.",
    "E6: Like This, Always — While Evernight is on the field, all ally targets' All-Type RES PEN increases by 20%. After the memosprite Evey uses Dream, Dissolving, as Dew, Everni"
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "critDmg", value: 0.133 },
    { stat: "hpPct", value: 0.18 }
  ],
}

// Cyrene — Memory (Ice). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const CYRENE: CharProg = {
  base: { hp: 1397, atk: 446, def: 582, spd: 101 },
  byLevel: {
    10: { hp: 275, atk: 88, def: 114, spd: 101 },
    20: { hp: 370, atk: 118, def: 154, spd: 101 },
    30: { hp: 541, atk: 173, def: 225, spd: 101 },
    40: { hp: 712, atk: 227, def: 297, spd: 101 },
    50: { hp: 883, atk: 282, def: 368, spd: 101 },
    60: { hp: 1054, atk: 336, def: 439, spd: 101 },
    70: { hp: 1226, atk: 391, def: 510, spd: 101 },
    80: { hp: 1397, atk: 446, def: 582, spd: 101 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // Lo, Hope Takes Flight!
    basic_a2: Array(10).fill(1), // Lo, Hope Takes Flight! param#2
    skill: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3], // Bloom, Elysium of Beyond
    skill_a2: Array(15).fill(2), // Bloom, Elysium of Beyond param#2
    skill_a3: Array(15).fill(3), // Bloom, Elysium of Beyond param#3
    ult: Array(15).fill(1), // Verse ◦ Vow ∞
    ult_a2: Array(15).fill(24), // Verse ◦ Vow ∞ param#2
    ult_a3: [0.25,0.275,0.3,0.325,0.35,0.375,0.40625,0.4375,0.46875,0.5,0.525,0.55,0.575,0.6,0.625], // Verse ◦ Vow ∞ param#3
    ult_a4: Array(15).fill(12), // Verse ◦ Vow ∞ param#4
    talent: Array(15).fill(1), // Hearts Gather as One
    talent_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Hearts Gather as One param#2
    talent_a3: Array(15).fill(27), // Hearts Gather as One param#3
    talent_a4: Array(15).fill(24), // Hearts Gather as One param#4
    talent_a5: Array(15).fill(12), // Hearts Gather as One param#5
    basic_en: [0.15,0.18,0.21,0.24,0.27,0.3,0.33,0.36,0.39,0.42], // To Love and Tomorrow ♪
    basic_en_a2: Array(10).fill(3), // To Love and Tomorrow ♪ param#2
    basic_en_a3: [0.15,0.18,0.21,0.24,0.27,0.3,0.33,0.36,0.39,0.42], // To Love and Tomorrow ♪ param#3
    ult_en: Array(15).fill(12), // <unbreak>Reunion at</unbreak> <unbreak>First Sight</unbreak>
    mem_skill: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84], // Minuet of Blooms and Plumes
    mem_skill_a2: Array(10).fill(12), // Minuet of Blooms and Plumes param#2
    mem_skill_en: Array(10).fill(12), // This Ode, to All Lives
    mem_skill_en_a2: [0.2,0.24,0.28,0.32,0.36,0.4,0.44,0.48,0.52,0.56], // This Ode, to All Lives param#2
    mem_skill_en_a3: Array(10).fill(2), // This Ode, to All Lives param#3
    mem_talent: [0.12,0.144,0.168,0.192,0.216,0.24,0.264,0.288,0.312,0.336], // Waiting, In Every Past
    mem_talent_a2: Array(10).fill(0), // Waiting, In Every Past param#2
    mem_skill_en2: [0.08,0.096,0.112,0.128,0.144,0.16,0.176,0.192,0.208,0.224], // Ode to Genesis
    mem_skill_en2_a2: [0.36,0.432,0.504,0.576,0.648,0.72,0.792,0.864,0.936,1.008], // Ode to Genesis param#2
    mem_skill_en2_a3: Array(10).fill(1), // Ode to Genesis param#3
    mem_skill_en3: Array(10).fill(70), // Ode to Romance
    mem_skill_en3_a2: [0.36,0.432,0.504,0.576,0.648,0.72,0.792,0.864,0.936,1.008], // Ode to Romance param#2
    mem_skill_en3_a3: [0.18,0.216,0.252,0.288,0.324,0.36,0.396,0.432,0.468,0.504], // Ode to Romance param#3
    mem_skill_en4: Array(10).fill(1), // Ode to Passage
    mem_skill_en4_a2: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Ode to Passage param#2
    mem_skill_en4_a3: Array(10).fill(3), // Ode to Passage param#3
    mem_skill_en5: [1,1.2,1.4,1.6,1.8,2,2.2,2.4,2.6,2.8], // Ode to Strife
    mem_skill_en5_a2: Array(10).fill(1), // Ode to Strife param#2
    mem_skill_en6: Array(10).fill(0), // Ode to Life and Death
    mem_skill_en6_a2: [0.0012,0.00144,0.00168,0.00192,0.00216,0.0024,0.00264,0.00288,0.00312,0.00336], // Ode to Life and Death param#2
    mem_skill_en6_a3: Array(10).fill(2), // Ode to Life and Death param#3
    mem_skill_en6_a4: Array(10).fill(0), // Ode to Life and Death param#4
    mem_skill_en6_a5: [0.0024,0.00288,0.00336,0.00384,0.00432,0.0048,0.00528,0.00576,0.00624,0.00672], // Ode to Life and Death param#5
    mem_skill_en6_a6: Array(10).fill(2), // Ode to Life and Death param#6
    mem_skill_en7: Array(10).fill(3), // Ode to Reason
    mem_skill_en7_a2: [0.2,0.24,0.28,0.32,0.36,0.4,0.44,0.48,0.52,0.56], // Ode to Reason param#2
    mem_skill_en7_a3: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84], // Ode to Reason param#3
    mem_skill_en7_a4: Array(10).fill(1), // Ode to Reason param#4
    mem_skill_en8: [0.36,0.432,0.504,0.576,0.648,0.72,0.792,0.864,0.936,1.008], // Ode to Sky
    mem_skill_en8_a2: [12,14.4,16.8,19.2,21.6,24,26.4,28.8,31.2,33.6], // Ode to Sky param#2
    mem_skill_en9: [0.18,0.216,0.252,0.288,0.324,0.36,0.396,0.432,0.468,0.504], // Ode to Trickery
    mem_skill_en9_a2: [0.1,0.12,0.14,0.16,0.18,0.2,0.22,0.24,0.26,0.28], // Ode to Trickery param#2
    mem_skill_en9_a3: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Ode to Trickery param#3
    mem_skill_en10: [0.08,0.096,0.112,0.128,0.144,0.16,0.176,0.192,0.208,0.224], // Ode to Worldbearing
    mem_skill_en10_a2: Array(10).fill(0.15), // Ode to Worldbearing param#2
    mem_skill_en10_a3: Array(10).fill(5), // Ode to Worldbearing param#3
    mem_skill_en10_a4: [0.05,0.06,0.07,0.08,0.09,0.1,0.11,0.12,0.13,0.14], // Ode to Worldbearing param#4
    mem_skill_en10_a5: Array(10).fill(12), // Ode to Worldbearing param#5
    mem_skill_en10_a6: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Ode to Worldbearing param#6
    mem_skill_en10_a7: [0.36,0.432,0.504,0.576,0.648,0.72,0.792,0.864,0.936,1.008], // Ode to Worldbearing param#7
    mem_skill_en10_a8: Array(10).fill(6), // Ode to Worldbearing param#8
    mem_skill_en10_a9: Array(10).fill(4), // Ode to Worldbearing param#9
    mem_skill_en11: [0.6,0.72,0.84,0.96,1.08,1.2,1.32,1.44,1.56,1.68], // Ode to Ocean
    mem_skill_en11_a2: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84], // Ode to Ocean param#2
    mem_skill_en11_a3: [0.4,0.48,0.56,0.64,0.72,0.8,0.88,0.96,1.04,1.12], // Ode to Ocean param#3
    mem_skill_en11_a4: Array(10).fill(60), // Ode to Ocean param#4
    mem_skill_en12: [0.15,0.18,0.21,0.24,0.27,0.3,0.33,0.36,0.39,0.42], // Ode to Law
    mem_skill_en12_a2: Array(10).fill(1), // Ode to Law param#2
    mem_skill_en13: [0.09,0.108,0.126,0.144,0.162,0.18,0.198,0.216,0.234,0.252], // Ode to Time
    mem_skill_en13_a2: Array(10).fill(1), // Ode to Time param#2
    mem_skill_en13_a3: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Ode to Time param#3
    mem_skill_en14: [0.12,0.144,0.168,0.192,0.216,0.24,0.264,0.288,0.312,0.336], // Ode to Earth
    mem_skill_en14_a2: Array(10).fill(2), // Ode to Earth param#2
    mem_skill_en14_a3: Array(10).fill(3), // Ode to Earth param#3
    mem_skill_en14_a4: [0.4,0.48,0.56,0.64,0.72,0.8,0.88,0.96,1.04,1.12], // Ode to Earth param#4
    mem_skill_en14_a5: Array(10).fill(1.5), // Ode to Earth param#5
    mem_skill_en15: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84], // Ode to Ego
    mem_skill_en15_a2: Array(10).fill(3), // Ode to Ego param#2
  },
  eidolons: [
    "E1: Epics, Born on a Blank Slate — When Demiurge triggers the Memosprite Skill Ode to Ego during the use of Minuet of Blooms and Plumes, gains 6 Recollection point(s) and increases the ",
    "E2: A Tomorrow in Thirteen Shades — When entering combat, additionally gains 12 Recollection point(s). For every 1 different ally character that gains the Memosprite Skill buff from Demi",
    "E3: By Thy Being, As I've Written — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Memosprite Skill Lv. +1, up to a maximum of Lv. 10.",
    "E4: Please Write On, With a Smile — After every 1 use of Minuet of Blooms and Plumes by Demiurge, the Bounce DMG multiplier for the triggered Memosprite Skill Ode to Ego increases by 6% ",
    "E5: Gaze, Steeped in Yesterbloom — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Memosprite Talent Lv. +1, up to a maximum of Lv. 10.",
    "E6: Remembrance, Sung in Ripples ♪ — When Cyrene uses Ultimate for the first time, all allies advance action by 100%. Each time Demiurge triggers the Memosprite Skill Ode to Ego during th"
  ],
  traces: [
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.1 },
    { stat: "spdFlat", value: 9 }
  ],
}

// Fate/Stay Night collab kits (hsr-data/characters.json verbatim)
const SABER: CharProg = {
  base: { hp: 1241, atk: 601, def: 654, spd: 101 },
  byLevel: {
    10: { hp: 244, atk: 118, def: 129, spd: 101 },
    20: { hp: 329, atk: 159, def: 173, spd: 101 },
    30: { hp: 481, atk: 233, def: 253, spd: 101 },
    40: { hp: 633, atk: 306, def: 334, spd: 101 },
    50: { hp: 785, atk: 380, def: 414, spd: 101 },
    60: { hp: 937, atk: 454, def: 494, spd: 101 },
    70: { hp: 1089, atk: 527, def: 574, spd: 101 },
    80: { hp: 1241, atk: 601, def: 654, spd: 101 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.75, 0.825, 0.9, 0.975, 1.05, 1.125, 1.21875, 1.3125, 1.40625, 1.5, 1.575, 1.65, 1.725, 1.8, 1.875],
    skill_a2: [0.375, 0.4125, 0.45, 0.4875, 0.525, 0.5625, 0.609375, 0.65625, 0.703125, 0.75, 0.7875, 0.825, 0.8625, 0.9, 0.9375],
    skill_a3: Array(15).fill(3), // Core Resonance gained by normal Skill
    skill_a4: [0.07, 0.077, 0.084, 0.091, 0.098, 0.105, 0.11375, 0.1225, 0.13125, 0.14, 0.147, 0.154, 0.161, 0.168, 0.175], // per-CR Skill mult boost
    ult: [1.4, 1.54, 1.68, 1.82, 1.96, 2.1, 2.275, 2.45, 2.625, 2.8, 2.94, 3.08, 3.22, 3.36, 3.5], // Excalibur AoE
    ult_a2: [0.55, 0.605, 0.66, 0.715, 0.77, 0.825, 0.89375, 0.9625, 1.03125, 1.1, 1.155, 1.21, 1.265, 1.32, 1.375], // per random instance
    ult_a3: Array(15).fill(10), // instance count
    talent: Array(15).fill(3), // +CR on any ally Ultimate
    talent_a2: Array(15).fill(25), // +Energy on any ally Ultimate
    talent_a3: [0.3, 0.33, 0.36, 0.39, 0.42, 0.45, 0.4875, 0.525, 0.5625, 0.6, 0.63, 0.66, 0.69, 0.72, 0.75], // Saber DMG after ally ult (2t)
    talent_a4: Array(15).fill(2), // buff turns
    talent_a5: Array(15).fill(8), // Energy regenerated per Core Resonance consumed
    talent_a6: [0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08125, 0.0875, 0.09375, 0.1, 0.105, 0.11, 0.115, 0.12, 0.125], // unused param (#6 not in desc)
    talent_a7: Array(15).fill(99), // Core Resonance cap
    talent_a8: Array(15).fill(1), // battle-start Core Resonance
    basic_en: [0.75, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 1.95, 2.1], // Release, the Golden Scepter (AoE)
    basic_en_a2: Array(10).fill(2), // +CR
    basic_en_a3: [0.75, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 1.95, 2.1], // extra AoE when enemy targets are 2
    basic_en_a4: [1.1, 1.32, 1.54, 1.76, 1.98, 2.2, 2.42, 2.64, 2.86, 3.08], // extra AoE when 1 enemy target
  },
  eidolons: [
    "E1: The Lost White Walls: Increases the Ultimate DMG dealt by Saber by 60%. After Saber uses Basic ATK or Skill, gains 1 Core Resonance.",
    "E2: The Lost Oath of the Round Table: For every 1 Core Resonance gained, Saber's DMG ignores 1.0% DEF, stacking up to 15. When triggering the Core Resonance effect to boost Skill's multiplier, each point additionally increases the current instance's DMG multiplier by 7%.",
    "E3: A Wish Across Fifteen Centuries: Ultimate Lv. +2. Basic ATK Lv. +1.",
    "E4: The Saga of Sixteen Winter Days: Increases Saber's Wind RES PEN by 8%. After Ultimate, Wind RES PEN +4%, stacking up to 3.",
    "E5: The Dreamed Utopian Dawn: Skill Lv. +2. Talent Lv. +2.",
    "E6: The Long Fated Night: Ultimate Wind RES PEN +20%. Overflow Energy cap increases to 200. After using Ultimate for the first time upon entering combat, regenerates 300 Energy; triggers 1 time after every 3 Ultimate uses.",
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "hpPct", value: 0.1 },
    { stat: "dmg:Wind", value: 0.224 }
  ],
}

const ARCHER: CharProg = {
  base: { hp: 1164, atk: 620, def: 485, spd: 105 },
  byLevel: {
    10: { hp: 229, atk: 122, def: 95, spd: 105 },
    20: { hp: 308, atk: 164, def: 128, spd: 105 },
    30: { hp: 451, atk: 240, def: 188, spd: 105 },
    40: { hp: 594, atk: 316, def: 247, spd: 105 },
    50: { hp: 736, atk: 392, def: 306, spd: 105 },
    60: { hp: 879, atk: 468, def: 366, spd: 105 },
    70: { hp: 1021, atk: 544, def: 425, spd: 105 },
    80: { hp: 1164, atk: 620, def: 485, spd: 105 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3],
    skill: [1.8, 1.98, 2.16, 2.34, 2.52, 2.7, 2.925, 3.15, 3.375, 3.6, 3.78, 3.96, 4.14, 4.32, 4.5],
    skill_a2: [0.6, 0.64, 0.68, 0.72, 0.76, 0.8, 0.85, 0.9, 0.95, 1, 1.04, 1.08, 1.12, 1.16, 1.2],
    skill_a3: Array(15).fill(2), // Skill DMG boost stack cap per Circuit Connection
    skill_a4: Array(15).fill(1), // unused param (Insight)
    skill_a5: Array(15).fill(5), // active Skill uses per Circuit Connection
    ult: [6, 6.4, 6.8, 7.2, 7.6, 8, 8.5, 9, 9.5, 10, 10.4, 10.8, 11.2, 11.6, 12], // Unlimited Blade Works
    ult_a2: Array(15).fill(2), // Charge gained
    ult_a3: Array(15).fill(4), // Charge cap
    talent: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5], // Mind's Eye (True) FUA
  },
  eidolons: [
    "E1: The Unreached Dream: After using Skill 3 times within one turn, recovers 2 Skill Points.",
    "E2: The Unfulfilled Happiness: On Ultimate, reduces the enemy target's Quantum RES by 20% and applies Quantum Weakness, 2 turns.",
    "E3: The Untamed Will: Skill Lv. +2. Basic ATK Lv. +1.",
    "E4: The Unsung Life: Increases Ultimate DMG by 150%.",
    "E5: The Nameless Watch: Ultimate Lv. +2. Talent Lv. +2.",
    "E6: The Endless Pilgrimage: At turn start, recovers 1 Skill Point. Circuit Connection max stacks +1. Skill DMG ignores 20% DEF.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "critRate", value: 0.067 },
    { stat: "dmg:Quantum", value: 0.224 }
  ],
}

const RIN: CharProg = {
  base: { hp: 1047, atk: 698, def: 460, spd: 102 },
  byLevel: {
    10: { hp: 206, atk: 137, def: 90, spd: 102 },
    20: { hp: 277, atk: 185, def: 122, spd: 102 },
    30: { hp: 406, atk: 270, def: 178, spd: 102 },
    40: { hp: 534, atk: 356, def: 235, spd: 102 },
    50: { hp: 662, atk: 441, def: 291, spd: 102 },
    60: { hp: 791, atk: 527, def: 347, spd: 102 },
    70: { hp: 919, atk: 613, def: 404, spd: 102 },
    80: { hp: 1047, atk: 698, def: 460, spd: 102 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [0.9, 0.99, 1.08, 1.17, 1.26, 1.35, 1.4625, 1.575, 1.6875, 1.8, 1.89, 1.98, 2.07, 2.16, 2.25],
    ult: [3, 3.3, 3.6, 3.9, 4.2, 4.5, 4.875, 5.25, 5.625, 6, 6.3, 6.6, 6.9, 7.2, 7.5],
    ult_a2: [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.625, 1.75, 1.875, 2, 2.1, 2.2, 2.3, 2.4, 2.5], // other enemies
    ult_a3: Array(15).fill(12), // Gem Energy gained
    ult_a4: Array(15).fill(1), // Skill Points recovered for allies
    ult_a5: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25], // DMG taken boost
    ult_a6: Array(15).fill(3), // debuff turns
    talent: Array(15).fill(20), // battle-start Gem Energy
    talent_a2: Array(15).fill(2), // CRIT DMG buff turns
    talent_a3: [0.35, 0.385, 0.42, 0.455, 0.49, 0.525, 0.56875, 0.6125, 0.65625, 0.7, 0.735, 0.77, 0.805, 0.84, 0.875], // ally CRIT DMG share
    talent_a4: Array(15).fill(7), // SP threshold for Enhanced Skill (current SP ≥ this)
    talent_a5: Array(15).fill(15), // Gem Energy threshold for Enhanced Skill
    talent_a6: Array(15).fill(999),
    technique: Array(15).fill(10), // Conversion Charge: battle-start Gem Energy
    talent2: [1.5, 1.65, 1.8, 1.95, 2.1, 2.25, 2.4375, 2.625, 2.8125, 3, 3.15, 3.3, 3.45, 3.6, 3.75], // Freeform Tohsaka Style: Rin ATK%
    talent2_a2: Array(15).fill(4), // Freeform: SP recovered for allies
    talent2_a3: Array(15).fill(3), // Freeform: Skill Points ≤ this triggers
    talent2_a4: Array(15).fill(3), // Freeform: Archer ATK%
    skill_en: [0.45, 0.495, 0.54, 0.585, 0.63, 0.675, 0.73125, 0.7875, 0.84375, 0.9, 0.945, 0.99, 1.035, 1.08, 1.125], // Second Magic Experiment AoE
    skill_en_a2: Array(15).fill(3), // Gem Energy consumed per instance
    skill_en_a3: [0.45, 0.495, 0.54, 0.585, 0.63, 0.675, 0.73125, 0.7875, 0.84375, 0.9, 0.945, 0.99, 1.035, 1.08, 1.125], // per random instance
    skill_en_a4: Array(15).fill(2), // SP floor consumed down to
    skill_en_a5: Array(15).fill(2), // Gem per SP consumed
    skill_en_a6: Array(15).fill(33), // max instance cycles
    skill_en_a7: Array(15).fill(30), // E1 Zelretch's Apprentice: Shadow Gem threshold
  },
  eidolons: [
    "E1: Zelretch's Apprentice: If one Enhanced Skill instance consumes 30+ Gem Energy, gains Shadow Gem equal to the amount consumed, enhancing Skill to Second Magic Experiment.",
    "E2: Dimensional Traveler: Rin's Skill DMG +30%. While on field, all allies' Skill DMG becomes 130%.",
    "E3: Holy Grail War: Victory Memorial: Skill Lv. +2. Basic ATK Lv. +1.",
    "E4: Red Devil: Triple Speed: Gem Magecraft CRIT DMG buff on Rin can stack up to 2.",
    "E5: Goddess of Venus's Favor: Ultimate Lv. +2. Talent Lv. +2.",
    "E6: Nailed It This Time!: All-Type RES PEN +20%. On Ultimate, gains 24 Gem Energy and 1 extra turn.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "critDmg", value: 0.373 },
    { stat: "dmg:Quantum", value: 0.08 }
  ],
}

const GILGAMESH: CharProg = {
  base: { hp: 1125, atk: 717, def: 509, spd: 97 },
  byLevel: {
    10: { hp: 222, atk: 141, def: 100, spd: 97 },
    20: { hp: 298, atk: 190, def: 135, spd: 97 },
    30: { hp: 436, atk: 278, def: 197, spd: 97 },
    40: { hp: 574, atk: 366, def: 259, spd: 97 },
    50: { hp: 712, atk: 454, def: 322, spd: 97 },
    60: { hp: 849, atk: 542, def: 384, spd: 97 },
    70: { hp: 987, atk: 630, def: 446, spd: 97 },
    80: { hp: 1125, atk: 717, def: 509, spd: 97 }
  },
  abilities: {
    basic: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    basic2: [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4],
    skill: [1.4, 1.54, 1.68, 1.82, 1.96, 2.1, 2.275, 2.45, 2.625, 2.8, 2.94, 3.08, 3.22, 3.36, 3.5], // Gate of Babylon main
    skill_a2: [0.7, 0.77, 0.84, 0.91, 0.98, 1.05, 1.1375, 1.225, 1.3125, 1.4, 1.47, 1.54, 1.61, 1.68, 1.75], // adjacent
    skill_a3: [0.1, 0.11, 0.12, 0.13, 0.14, 0.15, 0.1625, 0.175, 0.1875, 0.2, 0.21, 0.22, 0.23, 0.24, 0.25], // unreferenced wiki param (not in Skill desc)
    skill_a4: Array(15).fill(10), // unreferenced wiki param (not in Skill desc)
    skill_a5: [0.15, 0.165, 0.18, 0.195, 0.21, 0.225, 0.24375, 0.2625, 0.28125, 0.3, 0.315, 0.33, 0.345, 0.36, 0.375], // King's Acknowledgement DEF-ignore
    skill_a6: Array(15).fill(3), // acknowledgement turns
    ult: [2, 2.2, 2.4, 2.6, 2.8, 3, 3.25, 3.5, 3.75, 4, 4.2, 4.4, 4.6, 4.8, 5], // Enuma Elish AoE
    ult_a2: [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8125, 0.875, 0.9375, 1, 1.05, 1.1, 1.15, 1.2, 1.25], // per random instance
    ult_a3: Array(15).fill(10), // instance count
    talent: Array(15).fill(3), // King's Burden turns
    talent_a2: Array(15).fill(10), // Interest threshold to enter "Interest Piqued!"
    talent_a3: [0.2, 0.22, 0.24, 0.26, 0.28, 0.3, 0.325, 0.35, 0.375, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5], // Ult DMG share
    talent_a4: Array(15).fill(0.1), // SPD% per Interest
    talent2: [2, 2.2, 2.4, 2.6, 2.8, 3, 3.25, 3.5, 3.75, 4, 4.2, 4.4, 4.6, 4.8, 5], // Joint FUA base (Lightning, all enemies)
    talent2_a2: [3, 3.3, 3.6, 3.9, 4.2, 4.5, 4.875, 5.25, 5.625, 6, 6.3, 6.6, 6.9, 7.2, 7.5], // Saber share (Wind, all enemies)
    talent2_a3: Array(15).fill(3), // Interest on Joint FUA trigger
    talent2_a4: Array(15).fill(120), // Saber Energy on Joint FUA
    talent2_a5: Array(15).fill(8), // attack tally threshold (Gilgamesh or Saber attacks)
    talent2_a6: [1.2, 1.28, 1.36, 1.44, 1.52, 1.6, 1.7, 1.8, 1.9, 2, 2.08, 2.16, 2.24, 2.32, 2.4], // Saber next-Ult DMG ×
  },
  eidolons: [
    "E1: He Who Saw the Deep: King's Acknowledgement DEF-ignore also applies to teammates; +60% ATK on Gilgamesh; Skill additionally regenerates Energy.",
    "E2: Wisdom That Encompassed All: +5 Interest at combat start; +5 on Ultimate; Gate of Babylon primary DMG multiplier +100%.",
    "E3: Journey That Spanned Far: Skill Lv. +2. Basic ATK Lv. +1.",
    "E4: King Who Bowed to None: Energy Regeneration Rate +20%.",
    "E5: Sword That Parted Gods from Man: Ultimate Lv. +2. Talent Lv. +2.",
    "E6: Soul That Bore Friendship: Enuma Elish bounce DMG multiplier +80%; allies' All-Type RES PEN +20%.",
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "critRate", value: 0.187 },
    { stat: "dmg:Lightning", value: 0.08 }
  ],
}


// Ashveil — The Hunt (Lightning). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const ASHVEIL: CharProg = {
  base: { hp: 853, atk: 776, def: 388, spd: 106 },
  byLevel: {
    10: { hp: 168, atk: 153, def: 76, spd: 106 },
    20: { hp: 226, atk: 205, def: 102, spd: 106 },
    30: { hp: 331, atk: 300, def: 150, spd: 106 },
    40: { hp: 435, atk: 396, def: 198, spd: 106 },
    50: { hp: 540, atk: 491, def: 245, spd: 106 },
    60: { hp: 644, atk: 586, def: 293, spd: 106 },
    70: { hp: 749, atk: 681, def: 340, spd: 106 },
    80: { hp: 853, atk: 776, def: 388, spd: 106 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Talons: Inculcate Decorum
    skill: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // Flog: Smite Evil
    skill_a2: Array(15).fill(1), // Flog: Smite Evil param#2
    skill_a3: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Flog: Smite Evil param#3
    skill_a4: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // Flog: Smite Evil param#4
    skill_a5: Array(15).fill(1), // Flog: Smite Evil param#5
    ult: [2,2.2,2.4,2.6,2.8,3,3.25,3.5,3.75,4,4.2,4.4,4.6,4.8,5], // Banquet: Insatiable Appetite
    ult_a2: Array(15).fill(3), // Banquet: Insatiable Appetite param#2
    ult_a3: Array(15).fill(4), // Banquet: Insatiable Appetite param#3
    ult_a4: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // Banquet: Insatiable Appetite param#4
    talent: Array(15).fill(2), // Rancor: Enmity Reprisal
    talent_a2: Array(15).fill(3), // Rancor: Enmity Reprisal param#2
    talent_a3: Array(15).fill(1), // Rancor: Enmity Reprisal param#3
    talent_a4: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // Rancor: Enmity Reprisal param#4
    talent_a5: Array(15).fill(2), // Rancor: Enmity Reprisal param#5
    talent_a6: Array(15).fill(12), // Rancor: Enmity Reprisal param#6
    talent_a7: Array(15).fill(8), // Rancor: Enmity Reprisal param#7
  },
  eidolons: [
    "E1: Beware: Venture Not at Full Moon — While Ashveil is on the field, increases DMG taken by all enemies by 24%. When an enemy target's current HP percentage is 50% or lower, the DMG they t",
    "E2: Knock: Where Snickers Echo — The max stack limit of Gluttony increases to 18. After each time Ashveil launches the enhanced Talent's Follow-Up ATK, refunds 35% of the removed Glut",
    "E3: Hush: Unsaid Between Friends — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Heed: Swallow Truth Whole — When Ashveil uses Ultimate, increases ATK by 40% for 3 turn(s).",
    "E5: Caution: Sleuth Turns Slayer — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Finale: And Then There Were None — When the Bait exists on the field, reduces all enemies' All-Type RES by 20%. For every 1 stack of Gluttony Ashveil has gained, the DMG dealt increases"
  ],
  traces: [
    { stat: "atkPct", value: 0.1 },
    { stat: "critDmg", value: 0.373 },
    { stat: "dmg:Lightning", value: 0.144 }
  ],
}

// The Dahlia — Nihility (Fire). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const THE_DAHLIA: CharProg = {
  base: { hp: 1086, atk: 679, def: 606, spd: 96 },
  byLevel: {
    10: { hp: 214, atk: 133, def: 119, spd: 96 },
    20: { hp: 288, atk: 180, def: 160, spd: 96 },
    30: { hp: 421, atk: 263, def: 235, spd: 96 },
    40: { hp: 554, atk: 346, def: 309, spd: 96 },
    50: { hp: 687, atk: 429, def: 383, spd: 96 },
    60: { hp: 820, atk: 512, def: 457, spd: 96 },
    70: { hp: 953, atk: 595, def: 532, spd: 96 },
    80: { hp: 1086, atk: 679, def: 606, spd: 96 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Fiddle... Fissured Memory
    skill: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2], // Lick... Enkindled Betrayal
    skill_a2: Array(15).fill(3), // Lick... Enkindled Betrayal param#2
    skill_a3: Array(15).fill(0.5), // Lick... Enkindled Betrayal param#3
    ult: [1.8,1.92,2.04,2.16,2.28,2.4,2.55,2.7,2.85,3,3.12,3.24,3.36,3.48,3.6], // Wallow... <unbreak>Entombed Ash</unbreak>
    ult_a2: Array(15).fill(4), // Wallow... <unbreak>Entombed Ash</unbreak> param#2
    ult_a3: [0.08,0.09,0.1,0.11,0.12,0.13,0.1425,0.155,0.1675,0.18,0.19,0.2,0.21,0.22,0.23], // Wallow... <unbreak>Entombed Ash</unbreak> param#3
    talent: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // Who's Afraid of Constance?
    talent_a2: Array(15).fill(5), // Who's Afraid of Constance? param#2
    talent_a3: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // Who's Afraid of Constance? param#3
    talent_a4: Array(15).fill(35), // Who's Afraid of Constance? param#4
    talent_a5: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // Who's Afraid of Constance? param#5
  },
  eidolons: [
    "E1: When a Bud Readies to Bloom — The Super Break DMG multiplier provided by Talent to Dance Partners now applies to all ally characters, with Dance Partners additionally receiving a 4",
    "E2: Fresh, Ethereal, and Beloved — When The Dahlia is on the field, decreases all enemies' All-Type RES by 20%. When an enemy target enters the field, immediately inflicts Wilt on them,",
    "E3: Pity Its Petals Thin as Mist — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Pity Its Heart Gnawed by Worms — Increases the number of DMG instances dealt by Talent's Follow-Up ATK by 5. Upon its use, the DMG taken by all enemy targets increases by 12%, lasting",
    "E5: Fallen, Decayed, and Despised — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: And Yet, Always, Deathly Beautiful — Increases Dance Partners' Break Effect by 150%. When using Talent's Follow-Up ATK, advances the next action of all Dance Partners by 20%."
  ],
  traces: [
    { stat: "spdFlat", value: 5 },
    { stat: "effRes", value: 0.18 },
    { stat: "be", value: 0.373 }
  ],
}

// Yao Guang — Elation (Physical). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const YAO_GUANG: CharProg = {
  base: { hp: 1241, atk: 465, def: 654, spd: 101 },
  byLevel: {
    10: { hp: 244, atk: 91, def: 129, spd: 101 },
    20: { hp: 329, atk: 123, def: 173, spd: 101 },
    30: { hp: 481, atk: 180, def: 253, spd: 101 },
    40: { hp: 633, atk: 237, def: 334, spd: 101 },
    50: { hp: 785, atk: 294, def: 414, spd: 101 },
    60: { hp: 937, atk: 351, def: 494, spd: 101 },
    70: { hp: 1089, atk: 408, def: 574, spd: 101 },
    80: { hp: 1241, atk: 465, def: 654, spd: 101 }
  },
  abilities: {
    basic: [0.45,0.54,0.63,0.72,0.81,0.9,0.99,1.08,1.17,1.26], // Whistlebolt Sings Joy
    basic_a2: [0.15,0.18,0.21,0.24,0.27,0.3,0.33,0.36,0.39,0.42], // Whistlebolt Sings Joy param#2
    skill: Array(15).fill(3), // Decalight Unveils All
    skill_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Decalight Unveils All param#2
    skill_a3: Array(15).fill(3), // Decalight Unveils All param#3
    ult: Array(15).fill(5), // Hexagram of Feathered Fortune
    ult_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Hexagram of Feathered Fortune param#2
    ult_a3: Array(15).fill(3), // Hexagram of Feathered Fortune param#3
    ult_a4: Array(15).fill(20), // Hexagram of Feathered Fortune param#4
    ult_a5: Array(15).fill(1), // Hexagram of Feathered Fortune param#5
    talent: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Behold Wherever Light Unfolds
    el_skill: Array(15).fill(1), // Let Thy Fortune Burst in Flames
    el_skill_a2: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Let Thy Fortune Burst in Flames param#2
    el_skill_a3: Array(15).fill(0.16), // Let Thy Fortune Burst in Flames param#3
    el_skill_a4: Array(15).fill(3), // Let Thy Fortune Burst in Flames param#4
    el_skill_a5: Array(15).fill(5), // Let Thy Fortune Burst in Flames param#5
    el_skill_a6: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Let Thy Fortune Burst in Flames param#6
  },
  eidolons: [
    "E1: Chuckle Chimes Where Jade Falls — In Aha's extra turn triggered by Ultimate, the fixed amount of Punchline taken into account increases to 40. When dealing Elation DMG, all ally target",
    "E2: Blind Arrows Guided by Feathers — While the Zone is active, increases all ally targets' SPD by 12%, and additionally increases Elation by 16%.",
    "E3: Auspices Mirrored In Decalight — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: Threads of Fate Colored by Plumes — In Aha's extra turn triggered by Yao Guang's Ultimate, the DMG dealt by all ally characters' Elation Skill becomes 150% of the original DMG.",
    "E5: Bejeweled in Radiant Grace — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: Ferried Along the Astral Arc — All ally targets' Elation DMG merrymakes by 25%. Increases the DMG multiplier of Yao Guang's Elation Skill by 100% of its original multiplier."
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "spdFlat", value: 9 },
    { stat: "elation", value: 0.1 }
  ],
}

// Pearl — Elation (Ice). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const PEARL: CharProg = {
  base: { hp: 1203, atk: 465, def: 727, spd: 99 },
  byLevel: {
    10: { hp: 237, atk: 91, def: 143, spd: 99 },
    20: { hp: 319, atk: 123, def: 193, spd: 99 },
    30: { hp: 466, atk: 180, def: 282, spd: 99 },
    40: { hp: 613, atk: 237, def: 371, spd: 99 },
    50: { hp: 761, atk: 294, def: 460, spd: 99 },
    60: { hp: 908, atk: 351, def: 549, spd: 99 },
    70: { hp: 1055, atk: 408, def: 638, spd: 99 },
    80: { hp: 1203, atk: 465, def: 727, spd: 99 }
  },
  abilities: {
    basic: [0.45,0.54,0.63,0.72,0.81,0.9,0.99,1.08,1.17,1.26], // Brushstroke: Trace the Severed Stream
    skill: Array(15).fill(15), // Relume Life's Light
    skill_a2: [0.06,0.066,0.072,0.078,0.084,0.09,0.0975,0.105,0.1125,0.12,0.126,0.132,0.138,0.144,0.15], // Relume Life's Light param#2
    skill_a3: [120,132,144,156,168,180,195,210,225,240,252,264,276,288,300], // Relume Life's Light param#3
    ult: Array(15).fill(3), // Appraise Soul's Ground
    ult_a2: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // Appraise Soul's Ground param#2
    ult_a3: Array(15).fill(20), // Appraise Soul's Ground param#3
    ult_a4: Array(15).fill(0.1), // Appraise Soul's Ground param#4
    ult_a5: Array(15).fill(0.15), // Appraise Soul's Ground param#5
    ult_a6: Array(15).fill(0.3), // Appraise Soul's Ground param#6
    ult_a7: Array(15).fill(60), // Appraise Soul's Ground param#7
    ult_a8: Array(15).fill(30), // Appraise Soul's Ground param#8
    talent: Array(15).fill(0.5), // Grow Grace from Grit
    talent_a2: Array(15).fill(0.6), // Grow Grace from Grit param#2
    talent_a3: Array(15).fill(50), // Grow Grace from Grit param#3
    talent_a4: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // Grow Grace from Grit param#4
    talent_a5: Array(15).fill(200), // Grow Grace from Grit param#5
    basic_en: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Brushstroke: Imagenate the Starry Night
    basic_en_a2: [0.04,0.048,0.056,0.064,0.072,0.08,0.088,0.096,0.104,0.112], // Brushstroke: Imagenate the Starry Night param#2
    basic_en_a3: Array(10).fill(1), // Brushstroke: Imagenate the Starry Night param#3
    basic_en_a4: [80,96,112,128,144,160,176,192,208,224], // Brushstroke: Imagenate the Starry Night param#4
    basic_en_a5: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2], // Brushstroke: Imagenate the Starry Night param#5
    basic_en2: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Brushstroke: Render the Great Wave
    basic_en2_a2: [0.04,0.048,0.056,0.064,0.072,0.08,0.088,0.096,0.104,0.112], // Brushstroke: Render the Great Wave param#2
    basic_en2_a3: Array(10).fill(1), // Brushstroke: Render the Great Wave param#3
    basic_en2_a4: [80,96,112,128,144,160,176,192,208,224], // Brushstroke: Render the Great Wave param#4
    el_skill: [0.05,0.055,0.06,0.065,0.07,0.075,0.08125,0.0875,0.09375,0.1,0.105,0.11,0.115,0.12,0.125], // Dissolve Reason into Elation
    el_skill_a2: [0.075,0.0825,0.09,0.0975,0.105,0.1125,0.121875,0.13125,0.140625,0.15,0.1575,0.165,0.1725,0.18,0.1875], // Dissolve Reason into Elation param#2
    el_skill_a3: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Dissolve Reason into Elation param#3
    el_skill_a4: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // Dissolve Reason into Elation param#4
  },
  eidolons: [
    "E1: Nestle That Pearl in Uninked Tides — When there are 2/3/4 or more Elation characters in the team, increases Elation for all allies by 10%/20%/60%. Fatal damage on an ally → restore 50% Max HP, 2x per battle.",
    "E2: Crop That Dappled Dawn — Merrymakes all ally targets' Elation DMG by 15%. When using Ultimate, causes other ally Elation characters (excluding Pearl and Aesthetic Archetype ) ",
    "E3: Sketch That Suspended Wave — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: Study That Veiled Smile — Increases the Elation DMG multiplier provided by the Elation Skill for all allies by 100%.",
    "E5: Render Those Starlit Swirls — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: Compute Life From One Shell — While in Deep Learning, all allies' All-Type RES PEN increases by 20%. Pearl's Enhanced Basic ATK additionally deals Ice Elation DMG equal to 240% of "
  ],
  traces: [
    { stat: "defPct", value: 0.225 },
    { stat: "spdFlat", value: 9 },
    { stat: "effRes", value: 0.1 },
    { stat: "elation", value: 0.1 }
  ],
}

// Evanescia — Elation (Physical). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const EVANESCIA: CharProg = {
  base: { hp: 1047, atk: 737, def: 460, spd: 104 },
  byLevel: {
    10: { hp: 206, atk: 145, def: 90, spd: 104 },
    20: { hp: 277, atk: 195, def: 122, spd: 104 },
    30: { hp: 406, atk: 285, def: 178, spd: 104 },
    40: { hp: 534, atk: 376, def: 235, spd: 104 },
    50: { hp: 662, atk: 466, def: 291, spd: 104 },
    60: { hp: 791, atk: 556, def: 347, spd: 104 },
    70: { hp: 919, atk: 647, def: 404, spd: 104 },
    80: { hp: 1047, atk: 737, def: 460, spd: 104 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Syllabus: Pop Quiz
    skill: Array(15).fill(1), // Discipline: Final Verdict
    skill_a2: [1.5,1.65,1.8,1.95,2.1,2.25,2.4375,2.625,2.8125,3,3.15,3.3,3.45,3.6,3.75], // Discipline: Final Verdict param#2
    skill_a3: [0.75,0.825,0.9,0.975,1.05,1.125,1.21875,1.3125,1.40625,1.5,1.575,1.65,1.725,1.8,1.875], // Discipline: Final Verdict param#3
    skill_a4: Array(15).fill(10), // Discipline: Final Verdict param#4
    ult: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2], // Swordsong: Absolution Denied
    ult_a2: Array(15).fill(5), // Swordsong: Absolution Denied param#2
    ult_a3: [0.72,0.768,0.816,0.864,0.912,0.96,1.02,1.08,1.14,1.2,1.248,1.296,1.344,1.392,1.44], // Swordsong: Absolution Denied param#3
    ult_a4: Array(15).fill(88), // Swordsong: Absolution Denied param#4
    talent: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Youth: Halcyon Evermore
    talent_a2: [0.125,0.1375,0.15,0.1625,0.175,0.1875,0.203125,0.21875,0.234375,0.25,0.2625,0.275,0.2875,0.3,0.3125], // Youth: Halcyon Evermore param#2
    talent_a3: Array(15).fill(240), // Youth: Halcyon Evermore param#3
    talent_a4: Array(15).fill(10), // Youth: Halcyon Evermore param#4
    talent_a5: Array(15).fill(0.2), // Youth: Halcyon Evermore param#5
    talent_a6: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3], // Youth: Halcyon Evermore param#6
    talent_a7: [0.08,0.088,0.096,0.104,0.112,0.12,0.13,0.14,0.15,0.16,0.168,0.176,0.184,0.192,0.2], // Youth: Halcyon Evermore param#7
    talent_a8: [0.14,0.154,0.168,0.182,0.196,0.21,0.2275,0.245,0.2625,0.28,0.294,0.308,0.322,0.336,0.35], // Youth: Halcyon Evermore param#8
    el_skill: Array(15).fill(5), // Scarlet: Elation or Execution
    el_skill_a2: [0.55,0.605,0.66,0.715,0.77,0.825,0.89375,0.9625,1.03125,1.1,1.155,1.21,1.265,1.32,1.375], // Scarlet: Elation or Execution param#2
  },
  eidolons: [
    "E1: Home: A Prayer in Dance — Increases All-Type RES PEN by 20%. After Master Fox uses an attack, additionally triggers 1 instance of Elation Skill. Elation Skill additionally gran",
    "E2: Voyage: A Wish for Everbloom — CRIT DMG increases by 36%. When triggering the Certified Banger gain effect from the Trace Watch All Revels / Best All Blooms , additionally gains Cer",
    "E3: Blade: A Feast on Evils — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: Meadow: A Ruin by Vice — Evanescia's DMG dealt ignores 15% of the enemy targets' DEF.",
    "E5: Arcadia: A Glimpse of Fates — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: Maiden: A Step into Dreams — The duration of Evanescia's Certified Banger increases by 1 turn(s). The Elation DMG dealt by Evanescia merrymakes by 15%. For every 100 points of Cer"
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "spdFlat", value: 5 },
    { stat: "elation", value: 0.18 }
  ],
}

// Mortenax Blade — Nihility (Fire). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const MORTENAX_BLADE: CharProg = {
  base: { hp: 1358, atk: 543, def: 485, spd: 107 },
  byLevel: {
    10: { hp: 267, atk: 107, def: 95, spd: 107 },
    20: { hp: 360, atk: 144, def: 128, spd: 107 },
    30: { hp: 526, atk: 210, def: 188, spd: 107 },
    40: { hp: 693, atk: 277, def: 247, spd: 107 },
    50: { hp: 859, atk: 343, def: 306, spd: 107 },
    60: { hp: 1025, atk: 410, def: 366, spd: 107 },
    70: { hp: 1191, atk: 476, def: 425, spd: 107 },
    80: { hp: 1358, atk: 543, def: 485, spd: 107 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // A Broken Blade Still Slays
    skill: [0.36,0.396,0.432,0.468,0.504,0.54,0.585,0.63,0.675,0.72,0.756,0.792,0.828,0.864,0.9], // A Rain of Blades Seals Fate
    skill_a2: Array(15).fill(4), // A Rain of Blades Seals Fate param#2
    skill_a3: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3], // A Rain of Blades Seals Fate param#3
    skill_a4: Array(15).fill(0.1), // A Rain of Blades Seals Fate param#4
    ult: Array(15).fill(0.2), // Fornax Ex Corpore
    ult_a2: Array(15).fill(0.2), // Fornax Ex Corpore param#2
    ult_a3: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // Fornax Ex Corpore param#3
    ult_a4: [0.3,0.32,0.34,0.36,0.38,0.4,0.425,0.45,0.475,0.5,0.52,0.54,0.56,0.58,0.6], // Fornax Ex Corpore param#4
    ult_a5: Array(15).fill(70), // Fornax Ex Corpore param#5
    ult_a6: Array(15).fill(0.5), // Fornax Ex Corpore param#6
    ult_a7: [0.2,0.21,0.22,0.23,0.24,0.25,0.2625,0.275,0.2875,0.3,0.31,0.32,0.33,0.34,0.35], // Fornax Ex Corpore param#7
    ult_a8: Array(15).fill(2), // Fornax Ex Corpore param#8
    talent: Array(15).fill(9), // All Karma Comes Due
    talent_a2: [15,16,17,18,19,20,21.25,22.5,23.75,25,26,27,28,29,30], // All Karma Comes Due param#2
    basic_en: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // A Tempered Blade Severs Souls
    skill_en: Array(15).fill(0.1), // A Rain of Blades Seals Fate
    ult_en: [2.1,2.24,2.38,2.52,2.66,2.8,2.975,3.15,3.325,3.5,3.64,3.78,3.92,4.06,4.2], // Tenax Per Ignem
  },
  eidolons: [
    "E1: Ere My Death, I Stood Unmade — While the Zone is active, decreases all enemies' All-Type RES by 20%. After using the extra Skill from Talent, the Infinite Fury countdown has its act",
    "E2: Ash Was My Heart, Yet the Flame Stayed — When an ally character uses Ultimate to deal DMG, it is considered as having launched Follow-Up ATK. And the Follow-Up ATK DMG dealt by ally targets i",
    "E3: Across the Shore, Wrath Laid Bare — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Odium I've Smitten, Thence Came the Blade — Heart, Refined ad Infinitum additionally increases ally targets' DMG dealt by 50%.",
    "E5: I Severed My Woes, Knowing Death Begets Life — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: If Immortality Could Die, I Swore THEM Slain — As the Zone persists, when Mortenax Blade takes DMG or consumes HP, he gains 1 Charge. This effect can trigger again after any target's turn ends. The"
  ],
  traces: [
    { stat: "critRate", value: 0.12 },
    { stat: "dmg:Fire", value: 0.224 },
    { stat: "hpPct", value: 0.1 }
  ],
}

// Himeko • Nova — Erudition (Fire). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const HIMEKO_NOVA: CharProg = {
  base: { hp: 1125, atk: 756, def: 485, spd: 98 },
  byLevel: {
    10: { hp: 222, atk: 149, def: 95, spd: 98 },
    20: { hp: 298, atk: 200, def: 128, spd: 98 },
    30: { hp: 436, atk: 293, def: 188, spd: 98 },
    40: { hp: 574, atk: 386, def: 247, spd: 98 },
    50: { hp: 712, atk: 478, def: 306, spd: 98 },
    60: { hp: 849, atk: 571, def: 366, spd: 98 },
    70: { hp: 987, atk: 664, def: 425, spd: 98 },
    80: { hp: 1125, atk: 756, def: 485, spd: 98 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Enkindle the First Lodestar
    skill: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Upraise the Vanward Cresset
    skill_a2: Array(15).fill(3), // Upraise the Vanward Cresset param#2
    ult: [0.16,0.176,0.192,0.208,0.224,0.24,0.26,0.28,0.3,0.32,0.336,0.352,0.368,0.384,0.4], // We, Too, Stride the Stars
    ult_a2: Array(15).fill(1), // We, Too, Stride the Stars param#2
    ult_a3: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // We, Too, Stride the Stars param#3
    ult_a4: Array(15).fill(1), // We, Too, Stride the Stars param#4
    ult_a5: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // We, Too, Stride the Stars param#5
    ult_a6: Array(15).fill(3), // We, Too, Stride the Stars param#6
    ult_a7: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // We, Too, Stride the Stars param#7
    ult_a8: Array(15).fill(3), // We, Too, Stride the Stars param#8
    ult_a9: [3.81,4.191,4.572,4.953,5.334,5.715,6.19125,6.6675,7.14375,7.62,8.001,8.382,8.763,9.144,9.525], // We, Too, Stride the Stars param#9
    ult_a10: [1.26,1.386,1.512,1.638,1.764,1.89,2.0475,2.205,2.3625,2.52,2.646,2.772,2.898,3.024,3.15], // We, Too, Stride the Stars param#10
    talent: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // Of Fire and Far Faring
    talent_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Of Fire and Far Faring param#2
    talent_a3: Array(15).fill(4), // Of Fire and Far Faring param#3
    ult_en: [0.16,0.176,0.192,0.208,0.224,0.24,0.26,0.28,0.3,0.32,0.336,0.352,0.368,0.384,0.4], // Hyperluminal Particle Beam
    ult_en_a2: Array(15).fill(1), // Hyperluminal Particle Beam param#2
    ult_en_a3: Array(15).fill(3), // Hyperluminal Particle Beam param#3
    ult_en2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Orbital Annihilation Pulse
    ult_en2_a2: Array(15).fill(1), // Orbital Annihilation Pulse param#2
    ult_en2_a3: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // Orbital Annihilation Pulse param#3
    ult_en3: Array(15).fill(3), // We, Too, Stride the Stars
    ult_en3_a2: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // We, Too, Stride the Stars param#2
    // Assist Skills (151022/151025/151026) are NOT emitted by gen-newprog (no damage in the standard ladder) — hand-added from characters.json
    assist: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2], // Trailblaze, By Your Side param#1 (non-Himeko user, AoE)
    assist_a2: Array(15).fill(3), // Trailblaze, By Your Side param#2 (extra instances, non-Himeko user)
    assist_a3: [0.12,0.132,0.144,0.156,0.168,0.18,0.195,0.21,0.225,0.24,0.252,0.264,0.276,0.288,0.3], // Trailblaze, By Your Side param#3
    assist_a4: [1,1.1,1.2,1.3,1.4,1.5,1.625,1.75,1.875,2,2.1,2.2,2.3,2.4,2.5], // Trailblaze, By Your Side param#4 (Himeko user, AoE)
    assist_a5: Array(15).fill(4), // Trailblaze, By Your Side param#5 (extra instances, Himeko user)
    assist_a6: [0.18,0.194,0.208,0.222,0.236,0.25,0.2675,0.285,0.3025,0.32,0.334,0.348,0.362,0.376,0.39], // Trailblaze, By Your Side param#6
    assist_a7: Array(15).fill(4), // Trailblaze, By Your Side param#7 (Special Effects count)
    assist_a8: Array(15).fill(2), // Trailblaze, By Your Side param#8 (extra Assists per battle)
    verdict_a2: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Companion Protocol: Verdict param#8 (Himeko DMG+)
    verdict_a3: Array(15).fill(2), // Companion Protocol: Verdict param#9 (ally Ult count -> free Assist)
    verdict_a4: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Companion Protocol: Verdict param#10 (Himeko Ult DMG+)
    decimation_a2: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Companion Protocol: Decimation param#8 (all-ally CRIT DMG+)
    decimation_a3: Array(15).fill(9), // Companion Protocol: Decimation param#9 (Charge -> free Assist)
    decimation_a4: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Companion Protocol: Decimation param#10 (Skill CRIT DMG+)
  },
  eidolons: [
    "E1: That Which We Stride Is the Trailblaze — The number of extra Assist Skill uses from Talent additionally increases by 1. While in the Companion Protocol: Verdict state, reduces the number of U",
    "E2: The Colors We Never Strike — The cap of Himeko • Nova's Assist Skill uses increases to 2, and the DMG dealt by Ultimate and Assist Skill becomes 130% of their original DMG. During",
    "E3: We Who Are Starborn Muse Starward — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Let No Skyward Hand Stay Unheld — When using Assist Skill via the Talent Of Fire and Far Faring, the All-Type RES PEN boost now applies to all allies. And when Himeko • Nova gains this",
    "E5: To Cross the Cosmos and Beyond — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Ours Is the Oath to Sail Starward — Himeko • Nova's Fire RES PEN increases by 20%. The cap of Source Energy increases to 6. When an ally uses or launches Assist Skill, DMG dealt by Assis"
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.12 },
    { stat: "dmg:Fire", value: 0.08 }
  ],
}

// Robin • Summeretto — Remembrance (Wind). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const ROBIN_SUMMERETTO: CharProg = {
  base: { hp: 1203, atk: 601, def: 485, spd: 95 },
  byLevel: {
    10: { hp: 237, atk: 118, def: 95, spd: 95 },
    20: { hp: 319, atk: 159, def: 128, spd: 95 },
    30: { hp: 466, atk: 233, def: 188, spd: 95 },
    40: { hp: 613, atk: 306, def: 247, spd: 95 },
    50: { hp: 761, atk: 380, def: 306, spd: 95 },
    60: { hp: 908, atk: 454, def: 366, spd: 95 },
    70: { hp: 1055, atk: 527, def: 425, spd: 95 },
    80: { hp: 1203, atk: 601, def: 485, spd: 95 }
  },
  abilities: {
    basic: [0.25,0.3,0.35,0.4,0.45,0.5,0.55,0.6,0.65,0.7], // The Sea Sings in My Key
    skill: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Summer Strums the Soul
    skill_a2: Array(15).fill(6), // Summer Strums the Soul param#2
    ult: Array(15).fill(1), // Ascend That Rhapsody in Blue
    ult_a2: Array(15).fill(2), // Ascend That Rhapsody in Blue param#2
    ult_a3: [0.12,0.128,0.136,0.144,0.152,0.16,0.17,0.18,0.19,0.2,0.208,0.216,0.224,0.232,0.24], // Ascend That Rhapsody in Blue param#3
    ult_a4: Array(15).fill(0), // Ascend That Rhapsody in Blue param#4
    talent: Array(15).fill(0.7), // Wings Heed No Borders
    talent_a2: Array(15).fill(1.8), // Wings Heed No Borders param#2
    talent_a3: Array(15).fill(0), // Wings Heed No Borders param#3
    talent_a4: Array(15).fill(0), // Wings Heed No Borders param#4
    talent_a5: Array(15).fill(50), // Wings Heed No Borders param#5
    talent_a6: Array(15).fill(6), // Wings Heed No Borders param#6
    talent_a7: Array(15).fill(12), // Wings Heed No Borders param#7
    talent_a8: [0.1,0.105,0.11,0.115,0.12,0.125,0.13125,0.1375,0.14375,0.15,0.155,0.16,0.165,0.17,0.175], // Wings Heed No Borders param#8
    talent_a9: Array(15).fill(0.005), // Wings Heed No Borders param#9
    mem_skill: Array(10).fill(0), // Chirrup Quartet
    mem_skill_a2: [0.75,0.9,1.05,1.2,1.35,1.5,1.65,1.8,1.95,2.1], // Chirrup Quartet param#2
    mem_talent: [0.3,0.36,0.42,0.48,0.54,0.6,0.66,0.72,0.78,0.84], // A Warble of Wings
    mem_talent_a2: [0.01,0.012,0.014,0.016,0.018,0.02,0.022,0.024,0.026,0.028], // A Warble of Wings param#2
    mem_talent_a3: [0.04,0.048,0.056,0.064,0.072,0.08,0.088,0.096,0.104,0.112], // A Warble of Wings param#3
    mem_talent_a4: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // A Warble of Wings param#4
    mem_talent_a5: [0.08,0.096,0.112,0.128,0.144,0.16,0.176,0.192,0.208,0.224], // A Warble of Wings param#5
    mem_talent_a6: Array(10).fill(12), // A Warble of Wings param#6
    mem_talent_a7: Array(10).fill(0), // A Warble of Wings param#7
    mem_talent_a8: Array(10).fill(0), // A Warble of Wings param#8
    mem_talent_a9: Array(10).fill(140), // A Warble of Wings param#9
    mem_talent_a10: Array(10).fill(0.5), // A Warble of Wings param#10
    mem_talent_en: Array(10).fill(20), // Near the Sea's Heartbeat
    mem_talent_en2: Array(10).fill(0.5), // Astride Summer's Nightwind
  },
  eidolons: [
    "E1: Stray Bird of Summer — Summer Songbirds will keep a tally of 100% of the non-True DMG dealt by ally targets. When using the Memosprite Skill, additionally deals True DMG to ",
    "E2: A Heart of Still Water — Ally targets' All-Type RES PEN increases by 18%. The upper limit of Robin • Summeretto's Vibes increases by 20. The first time an ally target uses an ",
    "E3: Echoes Left Along the Way — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Memosprite Talent Lv. +1, up to a maximum of Lv. 10.",
    "E4: Her Variation on the Theme — Upon entering the Fever state, immediately gains 12 Vibes, and increases the SPD of Summer Songbirds by an amount equal to (20% + current Vibes × 0.5%",
    "E5: To Chase the Dawn Anew — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Memosprite Skill Lv. +1, up to a maximum of Lv. 10.",
    "E6: A Song Yet Unnamed — Increases the Memosprite Skill's DMG multiplier by 100% of its original value. While in the Fever state, Robin • Summeretto can store her Ultimate up "
  ],
  traces: [
    { stat: "critRate", value: 0.067 },
    { stat: "hpPct", value: 0.18 },
    { stat: "spdFlat", value: 14 }
  ],
}

// Aventurine • Waveflair — Elation (Quantum). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const AVENTURINE_WAVEFLAIR: CharProg = {
  base: { hp: 1164, atk: 485, def: 606, spd: 107 },
  byLevel: {
    10: { hp: 229, atk: 95, def: 119, spd: 107 },
    20: { hp: 308, atk: 128, def: 160, spd: 107 },
    30: { hp: 451, atk: 188, def: 235, spd: 107 },
    40: { hp: 594, atk: 247, def: 309, spd: 107 },
    50: { hp: 736, atk: 306, def: 383, spd: 107 },
    60: { hp: 879, atk: 366, def: 457, spd: 107 },
    70: { hp: 1021, atk: 425, def: 532, spd: 107 },
    80: { hp: 1164, atk: 485, def: 606, spd: 107 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Dead Center, the Torrent Hits
    skill: [1.2,1.32,1.44,1.56,1.68,1.8,1.95,2.1,2.25,2.4,2.52,2.64,2.76,2.88,3], // Kill Shot, the Sands Boil
    skill_a2: Array(15).fill(4), // Kill Shot, the Sands Boil param#2
    skill_a3: Array(15).fill(4), // Kill Shot, the Sands Boil param#3
    ult: [2.4,2.56,2.72,2.88,3.04,3.2,3.4,3.6,3.8,4,4.16,4.32,4.48,4.64,4.8], // Grand Slam, Crest That High Tide
    ult_a2: Array(15).fill(8), // Grand Slam, Crest That High Tide param#2
    ult_a3: Array(15).fill(6), // Grand Slam, Crest That High Tide param#3
    ult_a4: [0.12,0.138,0.156,0.174,0.192,0.21,0.2325,0.255,0.2775,0.3,0.318,0.336,0.354,0.372,0.39], // Grand Slam, Crest That High Tide param#4
    ult_a5: Array(15).fill(4), // Grand Slam, Crest That High Tide param#5
    talent: Array(15).fill(10), // Ante Up, the Abyss Answers
    talent_a2: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // Ante Up, the Abyss Answers param#2
    talent_a3: [0.36,0.396,0.432,0.468,0.504,0.54,0.585,0.63,0.675,0.72,0.756,0.792,0.828,0.864,0.9], // Ante Up, the Abyss Answers param#3
    talent_a4: Array(15).fill(30), // Ante Up, the Abyss Answers param#4
    talent_a5: Array(15).fill(20), // Ante Up, the Abyss Answers param#5
    talent_a6: Array(15).fill(1), // Ante Up, the Abyss Answers param#6
    talent_a7: Array(15).fill(1), // Ante Up, the Abyss Answers param#7
    el_skill: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // All In! To Summer's Blaze
    el_skill_a2: [0.105,0.1155,0.126,0.1365,0.147,0.1575,0.170625,0.18375,0.196875,0.21,0.2205,0.231,0.2415,0.252,0.2625], // All In! To Summer's Blaze param#2
    el_skill_a3: Array(15).fill(10), // All In! To Summer's Blaze param#3
    el_skill_a4: [0.09,0.099,0.108,0.117,0.126,0.135,0.14625,0.1575,0.16875,0.18,0.189,0.198,0.207,0.216,0.225], // All In! To Summer's Blaze param#4
    el_skill2: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // Cheers! To Summer's Blaze
    el_skill2_a2: Array(15).fill(10), // Cheers! To Summer's Blaze param#2
    el_skill2_a3: [0.09,0.099,0.108,0.117,0.126,0.135,0.14625,0.1575,0.16875,0.18,0.189,0.198,0.207,0.216,0.225], // Cheers! To Summer's Blaze param#3
  },
  eidolons: [
    "E1: A Holiday on the Line — Increases All-Type RES PEN by 24%. Talent gets enhanced: When Fervor reaches 10/20/30 points, immediately uses Cheers! To Summer's Blaze.",
    "E2: Idle as the Turning Tide — Increases the upper limit of Fervor to 50 points. Fervor reaching 40/50 points can also trigger the Talent to use Cheers! To Summer's Blaze. After usi",
    "E3: A Rendezvous Served Chilled — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: Sunlight Runs No Tab — When Aventurine • Waveflair uses Skill, enables the DMG dealt by all allies to ignore 18% of enemy targets' DEF, lasting for 3 turn(s).",
    "E5: Into the Eye of the Jackpot — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: The Past in Fast Lane — Elation DMG dealt by Aventurine • Waveflair merrymakes by 25%. After Aventurine • Waveflair uses his Elation Skill 2 time(s), all subsequent Elation S"
  ],
  traces: [
    { stat: "critRate", value: 0.187 },
    { stat: "spdFlat", value: 9 },
    { stat: "elation", value: 0.1 }
  ],
}
// {NICKNAME} (Destruction) — Destruction (Physical). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const TRAILBLAZER_DESTRUCTION: CharProg = {
  base: { hp: 1203, atk: 620, def: 460, spd: 100 },
  byLevel: {
    10: { hp: 237, atk: 122, def: 90, spd: 100 },
    20: { hp: 319, atk: 164, def: 122, spd: 100 },
    30: { hp: 466, atk: 240, def: 178, spd: 100 },
    40: { hp: 613, atk: 316, def: 235, spd: 100 },
    50: { hp: 761, atk: 392, def: 291, spd: 100 },
    60: { hp: 908, atk: 468, def: 347, spd: 100 },
    70: { hp: 1055, atk: 544, def: 404, spd: 100 },
    80: { hp: 1203, atk: 620, def: 460, spd: 100 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Farewell Hit
    skill: [0.625,0.6875,0.75,0.8125,0.875,0.9375,1.015625,1.09375,1.171875,1.25,1.3125,1.375,1.4375,1.5,1.5625], // RIP Home Run
    ult: [3,3.15,3.3,3.45,3.6,3.75,3.9375,4.125,4.3125,4.5,4.65,4.8,4.95,5.1,5.25], // Stardust Ace
    ult_a2: [1.8,1.89,1.98,2.07,2.16,2.25,2.3625,2.475,2.5875,2.7,2.79,2.88,2.97,3.06,3.15], // Stardust Ace param#2
    ult_a3: [1.08,1.134,1.188,1.242,1.296,1.35,1.4175,1.485,1.5525,1.62,1.674,1.728,1.782,1.836,1.89], // Stardust Ace param#3
    talent: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Perfect Pickoff
    talent_a2: Array(15).fill(2), // Perfect Pickoff param#2
    ult_en: [3,3.15,3.3,3.45,3.6,3.75,3.9375,4.125,4.3125,4.5,4.65,4.8,4.95,5.1,5.25], // Blowout: Farewell Hit
    ult_en2: [1.8,1.89,1.98,2.07,2.16,2.25,2.3625,2.475,2.5875,2.7,2.79,2.88,2.97,3.06,3.15], // Blowout: RIP Home Run
    ult_en2_a2: [1.08,1.134,1.188,1.242,1.296,1.35,1.4175,1.485,1.5525,1.62,1.674,1.728,1.782,1.836,1.89], // Blowout: RIP Home Run param#2
  },
  eidolons: [
    "E1: A Falling Star — When enemies are defeated due to the Trailblazer's Ultimate, the Trailblazer regenerates 10 extra Energy. This effect can only be triggered once per a",
    "E2: An Unwilling Host — Attacking enemies with Physical Weakness restores the Trailblazer's HP equal to 5% of the Trailblazer's ATK.",
    "E3: A Leading Whisper — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: A Destructing Glance — When attacking an enemy that is Weakness Broken, increases CRIT Rate by 25%.",
    "E5: A Surviving Hope — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: A Trailblazing Will — The Trailblazer's Talent is also triggered when they defeat an enemy."
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.125 },
    { stat: "hpPct", value: 0.18 }
  ],
}

// {NICKNAME} (Preservation) — Preservation (Fire). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const TRAILBLAZER_PRESERVATION: CharProg = {
  base: { hp: 1241, atk: 601, def: 606, spd: 95 },
  byLevel: {
    10: { hp: 244, atk: 118, def: 119, spd: 95 },
    20: { hp: 329, atk: 159, def: 160, spd: 95 },
    30: { hp: 481, atk: 233, def: 235, spd: 95 },
    40: { hp: 633, atk: 306, def: 309, spd: 95 },
    50: { hp: 785, atk: 380, def: 383, spd: 95 },
    60: { hp: 937, atk: 454, def: 457, spd: 95 },
    70: { hp: 1089, atk: 527, def: 532, spd: 95 },
    80: { hp: 1241, atk: 601, def: 606, spd: 95 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Ice-Breaking Light
    skill: [0.4,0.41,0.42,0.43,0.44,0.45,0.4625,0.475,0.4875,0.5,0.51,0.52,0.53,0.54,0.55], // Ever-Burning Amber
    skill_a2: Array(15).fill(1), // Ever-Burning Amber param#2
    skill_a3: Array(15).fill(1), // Ever-Burning Amber param#3
    ult: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // War-Flaming Lance
    ult_a2: [0.75,0.825,0.9,0.975,1.05,1.125,1.21875,1.3125,1.40625,1.5,1.575,1.65,1.725,1.8,1.875], // War-Flaming Lance param#2
    talent: [0.04,0.0425,0.045,0.0475,0.05,0.052,0.054,0.056,0.058,0.06,0.062,0.064,0.066,0.068,0.07], // Treasure of the Architects
    talent_a2: Array(15).fill(2), // Treasure of the Architects param#2
    talent_a3: Array(15).fill(8), // Treasure of the Architects param#3
    talent_a4: [20,32,41,50,56,62,66.5,71,75.5,80,84.5,89,93.5,98,102.5], // Treasure of the Architects param#4
    basic_en: [0.9,0.99,1.08,1.17,1.26,1.35,1.4625,1.575,1.6875,1.8], // Ice-Breaking Light
    basic_en_a2: [0.36,0.396,0.432,0.468,0.504,0.54,0.585,0.63,0.675,0.72], // Ice-Breaking Light param#2
  },
  eidolons: [
    "E1: Earth-Shaking Resonance — When the Trailblazer uses their Basic ATK, additionally deals Fire DMG equal to 25% of the Trailblazer's DEF. When the Trailblazer uses their enhanced",
    "E2: Time-Defying Tenacity — The Shield applied to all allies from the Trailblazer's Talent will block extra DMG equal to 2% of the Trailblazer's DEF plus 27.",
    "E3: Trail-Blazing Blueprint — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Nation-Building Oath — At the start of the battle, immediately gains 4 stack(s) of Magma Will.",
    "E5: Spirit-Warming Flame — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: City-Forging Bulwarks — After the Trailblazer uses enhanced Basic ATK or Ultimate, their DEF increases by 10%. Stacks up to 3 time(s)."
  ],
  traces: [
    { stat: "atkPct", value: 0.18 },
    { stat: "defPct", value: 0.35 },
    { stat: "hpPct", value: 0.1 }
  ],
}

// {NICKNAME} (Harmony) — Harmony (Imaginary). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const TRAILBLAZER_HARMONY: CharProg = {
  base: { hp: 1086, atk: 446, def: 679, spd: 105 },
  byLevel: {
    10: { hp: 214, atk: 88, def: 133, spd: 105 },
    20: { hp: 288, atk: 118, def: 180, spd: 105 },
    30: { hp: 421, atk: 173, def: 263, spd: 105 },
    40: { hp: 554, atk: 227, def: 346, spd: 105 },
    50: { hp: 687, atk: 282, def: 429, spd: 105 },
    60: { hp: 820, atk: 336, def: 512, spd: 105 },
    70: { hp: 953, atk: 391, def: 595, spd: 105 },
    80: { hp: 1086, atk: 446, def: 679, spd: 105 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Swing Dance Etiquette
    skill: [0.25,0.275,0.3,0.325,0.35,0.375,0.40625,0.4375,0.46875,0.5,0.525,0.55,0.575,0.6,0.625], // Halftime to Make It Rain
    skill_a2: Array(15).fill(2), // Halftime to Make It Rain param#2
    ult: Array(15).fill(3), // <unbreak>All-Out</unbreak> <unbreak>Footlight Parade</unbreak>
    ult_a2: Array(15).fill(1), // <unbreak>All-Out</unbreak> <unbreak>Footlight Parade</unbreak> param#2
    ult_a3: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // <unbreak>All-Out</unbreak> <unbreak>Footlight Parade</unbreak> param#3
    talent: [5,5.5,6,6.5,7,7.5,8.125,8.75,9.375,10,10.5,11,11.5,12,12.5], // Full-on Aerial Dance
  },
  eidolons: [
    "E1: Best Seat in the House — After using Skill for the first time, immediately recovers 1 Skill Point(s).",
    "E2: Jailbreaking Rainbowwalk — When the battle starts, the Trailblazer's Energy Regeneration Rate increases by 25%, lasting for 3 turn(s).",
    "E3: Sanatorium for Rest Notes — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Dove in Tophat — While the Trailblazer is on the field, increases the Break Effect of all teammates (excluding the Trailblazer), by an amount equal to 15% of the Trail",
    "E5: Poem Favors Rhythms of Old — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Tomorrow, Rest in Spotlight — The number of additional DMG applications by the Skill increases by 2."
  ],
  traces: [
    { stat: "be", value: 0.373 },
    { stat: "dmg:Imaginary", value: 0.144 },
    { stat: "effRes", value: 0.1 }
  ],
}

// {NICKNAME} (Remembrance) — Remembrance (Ice). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const TRAILBLAZER_REMEMBRANCE: CharProg = {
  base: { hp: 1047, atk: 543, def: 630, spd: 103 },
  byLevel: {
    10: { hp: 206, atk: 107, def: 124, spd: 103 },
    20: { hp: 277, atk: 144, def: 167, spd: 103 },
    30: { hp: 406, atk: 210, def: 244, spd: 103 },
    40: { hp: 534, atk: 277, def: 321, spd: 103 },
    50: { hp: 662, atk: 343, def: 398, spd: 103 },
    60: { hp: 791, atk: 410, def: 476, spd: 103 },
    70: { hp: 919, atk: 476, def: 553, spd: 103 },
    80: { hp: 1047, atk: 543, def: 630, spd: 103 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Leave It to Me!
    skill: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // I Choose You!
    skill_a2: Array(15).fill(0.1), // I Choose You! param#2
    ult: [1.2,1.32,1.44,1.56,1.68,1.8,1.95,2.1,2.25,2.4,2.52,2.64,2.76,2.88,3], // Together, Mem!
    ult_a2: Array(15).fill(0.4), // Together, Mem! param#2
    talent: Array(15).fill(130), // Almighty Companion
    talent_a2: [0.5,0.53,0.56,0.59,0.62,0.65,0.6875,0.725,0.7625,0.8,0.83,0.86,0.89,0.92,0.95], // Almighty Companion param#2
    talent_a3: Array(15).fill(10), // Almighty Companion param#3
    talent_a4: [400,424,448,472,496,520,550,580,610,640,664,688,712,736,760], // Almighty Companion param#4
    basic_en: [0.6,0.72,0.84,0.96,1.08,1.2,1.32,1.44,1.56,1.68], // Together, We Script Tomorrow!
    basic_en_a2: [0.6,0.72,0.84,0.96,1.08,1.2,1.32,1.44,1.56,1.68], // Together, We Script Tomorrow! param#2
    basic_en_a3: Array(10).fill(0.1), // Together, We Script Tomorrow! param#3
    mem_skill: [0.18,0.216,0.252,0.288,0.324,0.36,0.396,0.432,0.468,0.504], // Baddies! Trouble!
    mem_skill_a2: Array(10).fill(4), // Baddies! Trouble! param#2
    mem_skill_a3: [0.45,0.54,0.63,0.72,0.81,0.9,0.99,1.08,1.17,1.26], // Baddies! Trouble! param#3
    mem_talent: [0.06,0.072,0.084,0.096,0.108,0.12,0.132,0.144,0.156,0.168], // Friends! Together!
    mem_talent_a2: [0.12,0.144,0.168,0.192,0.216,0.24,0.264,0.288,0.312,0.336], // Friends! Together! param#2
    mem_talent_en: Array(10).fill(0.5), // Go, Mem, Go!
    mem_talent_en2: Array(10).fill(0.25), // No... Regrets
    mem_skill_en: [0.18,0.2,0.22,0.24,0.26,0.28,0.3,0.32,0.34,0.36], // Lemme! Help You!
    mem_skill_en_a2: Array(10).fill(3), // Lemme! Help You! param#2
    mem_skill_en_a3: Array(10).fill(1), // Lemme! Help You! param#3
  },
  eidolons: [
    "E1: Narrator of the Present — Increases the CRIT Rate of ally targets with Mem's Support by 10%. When an ally target has Mem's Support, the effect of Mem's Support also applies to ",
    "E2: Gleaner of the Past — When ally memosprites (aside from Mem) take action, Trailblazer regenerates 8 Energy. This effect can trigger a max of 1 time(s) per turn. The trigger",
    "E3: Chanter of the Future — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Memosprite Talent Lv. +1, up to a maximum of Lv. 10.",
    "E4: Dancer of the Muse — When an ally target with 0 Max Energy actively uses an ability, Mem can also gain 3% Charge, and the multiplier of the True DMG dealt by this target v",
    "E5: Seamster of the Ode — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Memosprite Skill Lv. +1, up to a maximum of Lv. 10.",
    "E6: Bearer of the Revelation — Ultimate's CRIT Rate is set at 100%."
  ],
  traces: [
    { stat: "atkPct", value: 0.14 },
    { stat: "critDmg", value: 0.373 },
    { stat: "hpPct", value: 0.14 }
  ],
}

// {NICKNAME} (Elation) — Elation (Lightning). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const TRAILBLAZER_ELATION: CharProg = {
  base: { hp: 1086, atk: 465, def: 630, spd: 106 },
  byLevel: {
    10: { hp: 214, atk: 91, def: 124, spd: 106 },
    20: { hp: 288, atk: 123, def: 167, spd: 106 },
    30: { hp: 421, atk: 180, def: 244, spd: 106 },
    40: { hp: 554, atk: 237, def: 321, spd: 106 },
    50: { hp: 687, atk: 294, def: 398, spd: 106 },
    60: { hp: 820, atk: 351, def: 476, spd: 106 },
    70: { hp: 953, atk: 408, def: 553, spd: 106 },
    80: { hp: 1086, atk: 465, def: 630, spd: 106 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Make Some Noise
    skill: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // Let the Storm Rage On
    skill_a2: Array(15).fill(20), // Let the Storm Rage On param#2
    ult: [0.3,0.32,0.34,0.36,0.38,0.4,0.425,0.45,0.475,0.5,0.52,0.54,0.56,0.58,0.6], // May the Trailblaze Fly You Starward
    ult_a2: Array(15).fill(3), // May the Trailblaze Fly You Starward param#2
    ult_a3: Array(15).fill(0.5), // May the Trailblaze Fly You Starward param#3
    ult_a4: Array(15).fill(10), // May the Trailblaze Fly You Starward param#4
    ult_a5: Array(15).fill(20), // May the Trailblaze Fly You Starward param#5
    ult_a6: Array(15).fill(5), // May the Trailblaze Fly You Starward param#6
    talent: Array(15).fill(10), // That Smile Hits Different
    talent_a2: Array(15).fill(3), // That Smile Hits Different param#2
    talent_a3: [0.15,0.165,0.18,0.195,0.21,0.225,0.24375,0.2625,0.28125,0.3,0.315,0.33,0.345,0.36,0.375], // That Smile Hits Different param#3
    el_skill: Array(15).fill(8), // I Said "Elation," Did I Stutter?
    el_skill_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // I Said "Elation," Did I Stutter? param#2
    el_skill_a3: [0.3,0.33,0.36,0.39,0.42,0.45,0.4875,0.525,0.5625,0.6,0.63,0.66,0.69,0.72,0.75], // I Said "Elation," Did I Stutter? param#3
  },
  eidolons: [
    "E1: Believe In the Light — After using Skill, the next Ultimate increases the amount of Certified Banger gained by ally targets by 2. This effect can stack up to 3 time(s).",
    "E2: History in the Making... — Ultimate additionally increases the Elation of one designated ally by 12%, lasting for 2 turn(s).",
    "E3: Into the Spotlight — Skill Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: Save the World. Just Because. — When using Elation Skill, increases the DMG taken by enemy targets by 10%, lasting for 2 turn(s).",
    "E5: Love & Courage: Always in Style — Ultimate Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: The Cosmic Legend Cometh! — When using Elation Skill, increases this unit's CRIT DMG by 100% for 3 turns."
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critRate", value: 0.12 },
    { stat: "critDmg", value: 0.133 }
  ],
}
const SUSHANG: CharProg = {
  base: { hp: 917, atk: 564, def: 418, spd: 107 },
  byLevel: {
    10: { hp: 180, atk: 111, def: 82, spd: 107 },
    20: { hp: 243, atk: 149, def: 111, spd: 107 },
    30: { hp: 355, atk: 218, def: 162, spd: 107 },
    40: { hp: 468, atk: 288, def: 213, spd: 107 },
    50: { hp: 580, atk: 357, def: 265, spd: 107 },
    60: { hp: 692, atk: 426, def: 316, spd: 107 },
    70: { hp: 804, atk: 495, def: 367, spd: 107 },
    80: { hp: 917, atk: 564, def: 418, spd: 107 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Cloudfencer Art: Starshine
    skill: [1.05,1.155,1.26,1.365,1.47,1.575,1.70625,1.8375,1.96875,2.1,2.205,2.31,2.415,2.52,2.625], // Cloudfencer Art: Mountainfall
    skill_a2: [0.5,0.55,0.6,0.65,0.7,0.75,0.8125,0.875,0.9375,1,1.05,1.1,1.15,1.2,1.25], // Cloudfencer Art: Mountainfall param#2
    skill_a3: Array(15).fill(0.33), // Cloudfencer Art: Mountainfall param#3
    ult: [1.92,2.048,2.176,2.304,2.432,2.56,2.72,2.88,3.04,3.2,3.328,3.456,3.584,3.712,3.84], // Shape of Taixu: Dawn Herald
    ult_a2: Array(15).fill(2), // Shape of Taixu: Dawn Herald param#2
    ult_a3: Array(15).fill(0.5), // Shape of Taixu: Dawn Herald param#3
    ult_a4: [0.18,0.192,0.204,0.216,0.228,0.24,0.255,0.27,0.285,0.3,0.312,0.324,0.336,0.348,0.36], // Shape of Taixu: Dawn Herald param#4
    talent: [0.15,0.155,0.16,0.165,0.17,0.175,0.18125,0.1875,0.19375,0.2,0.205,0.21,0.215,0.22,0.225], // Dancing Blade
    talent_a2: Array(15).fill(2), // Dancing Blade param#2
  },
  eidolons: [
    "E1: Cut With Ease — After using Skill against a Weakness Broken enemy, regenerates 1 Skill Point.",
    "E2: Refine in Toil — After Sword Stance is triggered, the DMG taken by Sushang is reduced by 20% for 1 turn.",
    "E3: Rise From Fame — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E4: Cleave With Heart — Sushang's Break Effect increases by 40%.",
    "E5: Prevail via Taixu — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E6: Dwell Like Water — Talent's SPD Boost is stackable and can stack up to 2 times. Additionally, after entering battle, Sushang immediately gains 1 stack of her Talent's SP"
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "defPct", value: 0.125 },
    { stat: "hpPct", value: 0.18 }
  ],
}


// Silver Wolf LV.999 — Elation (Imaginary). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const SILVER_WOLF_LV999: CharProg = {
  base: { hp: 1047, atk: 388, def: 654, spd: 110 },
  byLevel: {
    10: { hp: 206, atk: 76, def: 129, spd: 110 },
    20: { hp: 277, atk: 102, def: 173, spd: 110 },
    30: { hp: 406, atk: 150, def: 253, spd: 110 },
    40: { hp: 534, atk: 198, def: 334, spd: 110 },
    50: { hp: 662, atk: 245, def: 414, spd: 110 },
    60: { hp: 791, atk: 293, def: 494, spd: 110 },
    70: { hp: 919, atk: 340, def: 574, spd: 110 },
    80: { hp: 1047, atk: 388, def: 654, spd: 110 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // One Punch!
    skill: [0.8,0.88,0.96,1.04,1.12,1.2,1.3,1.4,1.5,1.6,1.68,1.76,1.84,1.92,2], // Trigger Happy
    skill_a2: Array(15).fill(5), // Trigger Happy param#2
    ult: Array(15).fill(60), // God Mode: ON!
    ult_a2: Array(15).fill(0), // God Mode: ON! param#2
    ult_a3: [0.45,0.495,0.54,0.585,0.63,0.675,0.73125,0.7875,0.84375,0.9,0.945,0.99,1.035,1.08,1.125], // God Mode: ON! param#3
    ult_a4: Array(15).fill(0.2), // God Mode: ON! param#4
    ult_a5: Array(15).fill(0.2), // God Mode: ON! param#5
    ult_a6: Array(15).fill(3), // God Mode: ON! param#6
    ult_a7: Array(15).fill(2), // God Mode: ON! param#7
    talent: Array(15).fill(60), // I Carry, We Win
    talent_a2: Array(15).fill(240), // I Carry, We Win param#2
    talent_a3: [0.2,0.22,0.24,0.26,0.28,0.3,0.325,0.35,0.375,0.4,0.42,0.44,0.46,0.48,0.5], // I Carry, We Win param#3
    talent_a4: [0.002,0.0022,0.0024,0.0026,0.0028,0.003,0.00325,0.0035,0.00375,0.004,0.0042,0.0044,0.0046,0.0048,0.005], // I Carry, We Win param#4
    talent_a5: Array(15).fill(3), // I Carry, We Win param#5
    talent_a6: [0.004,0.0044,0.0048,0.0052,0.0056,0.006,0.0065,0.007,0.0075,0.008,0.0084,0.0088,0.0092,0.0096,0.01], // I Carry, We Win param#6
    basic_en: [1.2,1.44,1.68,1.92,2.16,2.4,2.64,2.88,3.12,3.36], // Bonus Stage: αWolf Instant
    basic_en_a2: Array(10).fill(0), // Bonus Stage: αWolf Instant param#2
    basic_en_a3: Array(10).fill(100), // Bonus Stage: αWolf Instant param#3
    basic_en_a4: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // Bonus Stage: αWolf Instant param#4
    basic_en_a5: Array(10).fill(3), // Bonus Stage: αWolf Instant param#5
    basic_en_a6: Array(10).fill(60), // Bonus Stage: αWolf Instant param#6
    basic_en_a7: Array(10).fill(2), // Bonus Stage: αWolf Instant param#7
    basic_en_a8: Array(10).fill(0.15), // Bonus Stage: αWolf Instant param#8
    el_skill: Array(15).fill(15), // Pro-Gamer Move
    el_skill_en: [0.45,0.495,0.54,0.585,0.63,0.675,0.73125,0.7875,0.84375,0.9,0.945,0.99,1.035,1.08,1.125], // Honkai-DMG Demo
    el_skill_en_a2: Array(15).fill(6), // Honkai-DMG Demo param#2
  },
  eidolons: [
    "E1: Aether Editing: Eidolon +1 — Enemy targets in the Zone take 20% increased DMG. When exiting the Godmode Player state, Hidden MMR will not be cleared. Instead, 20% of Hidden MMR wi",
    "E2: It's a Feature, Not a Bug — After entering the Godmode Player state, extends the duration of all buffs on this unit by 1 turn. In the current Godmode Player state, for every 120 ",
    "E3: Max Lv. <unbreak>15</unbreak>? Says who? — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E4: I Came. I Saw. I One-Shot. — Elation DMG dealt by Honkai-DMG Demo additionally takes into account Punchline, equal to the original amount multiplied by 5.",
    "E5: Basic ATK Is the New Ultimate — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15. Elation Skill Lv. +1, up to a maximum of Lv. 15.",
    "E6: Solo Maxxing! — Elation DMG dealt during Enhanced Basic ATK merrymakes by 50%. When enemy targets enter combat, they are implanted with Absolute Weakness : Has All-Ty"
  ],
traces: [
  { stat: "critRate", value: 0.187 },
  { stat: "spdFlat", value: 9 },
  { stat: "elation", value: 0.1 },
],
}


// March 7th • The Hunt (The Hunt) — The Hunt (Imaginary). Generated from hsr-data/characters.json by scripts/gen-newprog.mjs.
const MARCH7TH_THE_HUNT: CharProg = {
  base: { hp: 1058, atk: 564, def: 441, spd: 102 },
  byLevel: {
    10: { hp: 208, atk: 111, def: 87, spd: 102 },
    20: { hp: 280, atk: 149, def: 117, spd: 102 },
    30: { hp: 410, atk: 218, def: 171, spd: 102 },
    40: { hp: 540, atk: 288, def: 225, spd: 102 },
    50: { hp: 669, atk: 357, def: 279, spd: 102 },
    60: { hp: 799, atk: 426, def: 333, spd: 102 },
    70: { hp: 928, atk: 495, def: 387, spd: 102 },
    80: { hp: 1058, atk: 564, def: 441, spd: 102 }
  },
  abilities: {
    basic: [0.5,0.6,0.7,0.8,0.9,1,1.1,1.2,1.3,1.4], // My Sword Zaps Demons
    basic_a2: Array(10).fill(1), // My Sword Zaps Demons param#2
    skill: [0.06,0.064,0.068,0.072,0.076,0.08,0.085,0.09,0.095,0.1,0.104,0.108,0.112,0.116,0.12], // Master, It's Tea Time!
    skill_a2: [0.1,0.11,0.12,0.13,0.14,0.15,0.1625,0.175,0.1875,0.2,0.21,0.22,0.23,0.24,0.25], // Master, It's Tea Time! param#2
    skill_a3: Array(15).fill(1), // Master, It's Tea Time! param#3
    ult: [1.44,1.536,1.632,1.728,1.824,1.92,2.04,2.16,2.28,2.4,2.496,2.592,2.688,2.784,2.88], // <unbreak>March 7th,</unbreak> <unbreak>the Apex Heroine</unbreak>
    ult_a2: Array(15).fill(2), // <unbreak>March 7th,</unbreak> <unbreak>the Apex Heroine</unbreak> param#2
    ult_a3: Array(15).fill(0.2), // <unbreak>March 7th,</unbreak> <unbreak>the Apex Heroine</unbreak> param#3
    talent: Array(15).fill(7), // Master, I've Ascended!
    talent_a2: [0.4,0.44,0.48,0.52,0.56,0.6,0.65,0.7,0.75,0.8,0.84,0.88,0.92,0.96,1], // Master, I've Ascended! param#2
    talent_a3: Array(15).fill(10), // Master, I've Ascended! param#3
    basic_en: [0.4,0.48,0.56,0.64,0.72,0.8,0.88,0.96,1.04,1.12], // Brows Be Smitten, Heart Be Bitten
    basic_en_a2: Array(10).fill(0.6), // Brows Be Smitten, Heart Be Bitten param#2
    basic_en_a3: Array(10).fill(3), // Brows Be Smitten, Heart Be Bitten param#3
    basic_en_a4: Array(10).fill(3), // Brows Be Smitten, Heart Be Bitten param#4
  },
  eidolons: [
    "E1: My Sword Stirs Starlight — When Shifu is on the field, increases March 7th's SPD by 10%.",
    "E2: Blade Dances on Waves' Fight — After Shifu uses Basic ATK or Skill to attack an enemy target, March 7th immediately launches a Follow-Up ATK and deals Imaginary DMG equal to 60% of ",
    "E3: Sharp Wit in Martial Might — Skill Lv. +2, up to a maximum of Lv. 15. Basic ATK Lv. +1, up to a maximum of Lv. 10.",
    "E4: Being Fabulous Never Frights — At the start of the turn, regenerates 5 Energy.",
    "E5: Sword Delights, Sugar Blights — Ultimate Lv. +2, up to a maximum of Lv. 15. Talent Lv. +2, up to a maximum of Lv. 15.",
    "E6: Me, the Best Girl in Sight — After using Ultimate, increases the CRIT DMG dealt by the next Enhanced Basic ATK by 50%."
  ],
  traces: [
    { stat: "atkPct", value: 0.28 },
    { stat: "critDmg", value: 0.24 },
    { stat: "defPct", value: 0.125 }
  ],
}

export const PROG: Record<string, CharProg> = {
  acheron: ACHERON,
  seele: SEELE,
  jingyuan: JINGYUAN,
  firefly: FIREFLY,
  bronya: BRONYA,
  pela: PELA,
  guinaifen: GUINAIFEN,
  sparkle: SPARKLE,
  gallagher: GALLAGHER,
  huohuo: HUOHUO,
  march7th: MARCH7TH,
  danheng: DANHENG,
  himeko: HIMEKO,
  welt: WELT,
  kafka: KAFKA,
  silverwolf: SILVERWOLF,
  luocha: LUOCHA,
  yukong: YUKONG,
  blade: BLADE,
  luka: LUKA,
  danhengil: DANHENGIL,
  fuxuan: FUXUAN,
  lynx: LYNX,
  topaz: TOPAZ,
  jingliu: JINGLIU,
  tingyun: TINGYUN,
  blackswan: BLACKSWAN,
  sparxie: SPARXIE,
  aglaea: AGLAEA,
  hyacine: HYACINE,
  tribbie: TRIBBie,
  sunday: SUNDAY,
  danhengperman: DANHENGPERMAN,
  cipher: CIPHER,
  cerydra: CERYDRA,
  castorice: CASTORICE,
  phainon: PHAINON,
  aventurine: AVENTURINE,
  asta: ASTA,
  arlan: ARLAN,
  herta: HERTA,
  serval: SERVAL,
  gepard: GEPARD,
  natasha: NATASHA,
  fugue: FUGUE,
  clara: CLARA,
  sampo: SAMPO,
  hook: HOOK,
  qingque: QINGQUE,
  yanqing: YANQING,
  bailu: BAILU,
  xueyi: XUEYI,
  hanya: HANYA,
  misha: MISHA,
  jiaoqiu: JIAOQIU,
  feixiao: FEIXIAO,
  yunli: YUNLI,
  lingsha: LINGSHA,
  moze: MOZE,
  robin: ROBIN,
  jade: JADE,
  boothill: BOOTHILL,
  rappa: RAPPA,
  argenti: ARGENTI,
  ruanmei: RUANMEI,
  the_herta: THE_HERTA,
  mydei: MYDEI,
  anaxa: ANAXA,
  hysilens: HYSILENS,
  evernight: EVERNIGHT,
  cyrene: CYRENE,
  ashveil: ASHVEIL,
  the_dahlia: THE_DAHLIA,
  yao_guang: YAO_GUANG,
  pearl: PEARL,
  evanescia: EVANESCIA,
  mortenax_blade: MORTENAX_BLADE,
  himeko_nova: HIMEKO_NOVA,
  robin_summeretto: ROBIN_SUMMERETTO,
  aventurine_waveflair: AVENTURINE_WAVEFLAIR,
  trailblazer_destruction: TRAILBLAZER_DESTRUCTION,
  trailblazer_preservation: TRAILBLAZER_PRESERVATION,
  trailblazer_harmony: TRAILBLAZER_HARMONY,
  trailblazer_remembrance: TRAILBLAZER_REMEMBRANCE,
  trailblazer_elation: TRAILBLAZER_ELATION,
  sushang: SUSHANG,
  silver_wolf_lv999: SILVER_WOLF_LV999,
  march7th_the_hunt: MARCH7TH_THE_HUNT,
  rm: RUANMEI,
  dr_ratio: DR_RATIO,
  ratio: DR_RATIO,
  saber: SABER,
  archer: ARCHER,
  rin: RIN,
  gilgamesh: GILGAMESH,
}

/** multiplier for slot at given level (1-based), defaulting to max */
export function mult(char: string, slot: string, level?: number): number {
  const arr = PROG[char]?.abilities[slot]
  if (!arr || !arr.length) return 0
  const lv = Math.max(1, Math.min(arr.length, level ?? arr.length))
  return arr[lv - 1]
}

/** summed minor-trace mods as StatKey/value pairs */
export function traceMods(char: string): Array<{ stat: string; value: number }> {
  return PROG[char]?.traces ?? []
}
