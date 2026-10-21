# Overview

**Type:** Combat

Data Toughness Stats Toughness is an enemy-only stat in Honkai: Star Rail . In combat, the Toughness gauge is displayed above the HP gauge of enemies. It can be reduced by attacks of a Type that the enemy is weak to. Once fully depleted, the enemy will suffer a Weakness Break which has the following effects: Deals an instance of Break DMG Delays the enemy's action by 25% Has a 150% base chance to apply a debuff corresponding to the Type used to inflict Weakness Break Enters the Weakness Broken state In the enemy's next turn, they will recover from the Weakness Broken state and fully restores their Toughness gauge. As long as the enemy is not Weakness Broken, all incoming DMG will be multiplied by 0.9, including the Break DMG from Toughness depletion. Dealing Break DMG solely is not considered an attack.

## Formulas

**`Toughness Reduction= (Base Toughness Reduction + Additive Toughness Reduction)\\ × (1+\%Toughness Reduction Increase)\\ × (1+\%Weakness Break Efficiency+\%Toughness Vulnerability)\\ × Ability Multiplier`**

**`Ability Multiplier= casesAbility Attribute if specified\\100\% if not specified\\ cases`**

**`Max Toughness Multiplier=0.5+ Max Toughness_Target40`**

**`2 × Level Multiplier × Max Toughness Multiplier_Target`**

**`2 × Level Multiplier × Max Toughness Multiplier_Target`**

**`1 × Level Multiplier × Max Toughness Multiplier_Target`**

**`1 × Level Multiplier × Max Toughness Multiplier_Target`**

**`1.5 × Level Multiplier × Max Toughness Multiplier_Target`**

**`0.5 × Level Multiplier × Max Toughness Multiplier_Target`**

**`0.5 × Level Multiplier × Max Toughness Multiplier_Target`**

**`0.16 × Max HP_Target`**

**`0.07 × Max HP_Target`**

**`2 × Level Multiplier × Max Toughness Multiplier_Target`**

**`1 × Level Multiplier`**

**`1 × Level Multiplier`**

**`2 × Level Multiplier`**

**`1 × Stack Count × Level Multiplier`**

**`align 0.6 × Stack Count × Level Multiplier \\ × Max Toughness Multiplier_Target align`**

**`20\% × (1 + Break Effect)`**

**`30\%× (1+Break Effect)`**

**`DMG= Base DMG× Ability Multiplier× (1+Break Effect)\\ × DMG Increase Multiplier\\ × DEF Multiplier_Target× RES Multiplier_Target\\ × Vulnerability Multiplier_Target× DMG Mitigation Multiplier_Target\\ × Broken Multiplier_Target`**

**`Ability Multiplier= casesBase Ability Multiplier + Break DMG Multiplier Increase if specified\\100\% if not specified\\ cases`**

**`DMG Increase Multiplier= cases1 + Break DMG Increase if Break DMG\\1 otherwise\\ cases`**

**`DEF Multiplier= Level_Attacker+20 matrix(Level_Enemy+20)\\× max\0,1+\%DEF Bonus-\%DEF Reduction-\%DEF Ignore\\\+ Level_Attacker+20 matrix`**

**`RES Multiplier = 1 - (RES_Target - RES PEN_Attacker)`**

**`Vulnerability Multiplier=1 +Elemental Vulnerability+All-Type Vulnerability\\ + casesBreak DMG Vulnerability if Break DMG\\DoT Vulnerability if DoT DMG\\0 otherwise\\ cases`**

**`DMG Mitigation Multiplier_Total= (1-DMG Mitigation_1)× (1-DMG Mitigation_2)\\× (1-DMG Mitigation_3)×`**

**`Broken Multiplier= cases0.9 if enemy has Toughness (affects Toughness depletion Break DMG)\\1.0 if enemy Toughness is broken\\ cases`**

**`Super Break DMG= (Toughness Reduction 10)× Level Multiplier\\ × Ability Multiplier× (1+Break Effect)\\ × (1+Break DMG Increase)× (1+Super Break DMG Increase)\\ × DEF Multiplier_Target× RES Multiplier_Target\\ × Vulnerability Multiplier_Target× DMG Mitigation Multiplier_Target\\ × Broken Multiplier_Target`**

| Type | Break Base DMG | Applied Debuff |
| --- | --- | --- |
| Physical | 2         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 2 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Bleed |
| Fire | 2         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 2 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Burn |
| Ice | 1         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 1 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Freeze |
| Lightning | 1         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 1 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Shock |
| Wind | 1.5         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 1.5 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Wind Shear |
| Quantum | 0.5         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 0.5 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Entanglement |
| Imaginary | 0.5         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 0.5 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | Imprisonment |

| Debuff | Debuff Base DMG | Turns | Additional Effects | Is DoT |
| --- | --- | --- | --- | --- |
| Bleed | Normal:                         0.16         &#xd7;                    Max HP           Target                          {\displaystyle 0.16 \times \text{Max HP}_\text{Target}}    Elite/Boss:                         0.07         &#xd7;                    Max HP           Target                          {\displaystyle 0.07 \times \text{Max HP}_\text{Target}} | 2 | There is a max cap for Bleed Base DMG:                        2         &#xd7;         Level Multiplier         &#xd7;                    Max Toughness Multiplier           Target                          {\displaystyle 2 \times \text{Level Multiplier} \times \text{Max Toughness Multiplier}_\text{Target}} | &#10004;&#10004;Yes |
| Burn | 1         &#xd7;         Level Multiplier                 {\displaystyle 1 \times \text{Level Multiplier} } | 2 | &#8212; | &#10004;&#10004;Yes |
| Freeze | 1         &#xd7;         Level Multiplier                 {\displaystyle 1 \times \text{Level Multiplier} } | 1 | Upon unfreezing, skips the target's current turn but advances their next turn forward by 50% | &#10008;&#10008;No |
| Shock | 2         &#xd7;         Level Multiplier                 {\displaystyle 2 \times \text{Level Multiplier}} | 2 | &#8212; | &#10004;&#10004;Yes |
| Wind Shear | 1         &#xd7;         Stack Count         &#xd7;         Level Multiplier                 {\displaystyle 1 \times \text{Stack Count} \times \text{Level Multiplier}} | 2 | Applies 1 stack to Normal, 3 stacks to Elite/Boss Enemies (Max 5 Stacks) | &#10004;&#10004;Yes |
| Entanglement | 0.6               &#xd7;               Stack Count               &#xd7;               Level Multiplier                                                                                           &#xd7;                                Max Toughness Multiplier                 Target                                                                 {\displaystyle \begin{align} &amp; 0.6 \times \text{Stack Count} \times \text{Level Multiplier} \\ &amp; \times \text{Max Toughness Multiplier}_\text{Target} \end{align}} | 1 | Delays action by                         20         &#x25;         &#xd7;         (         1         +         Break Effect         )                 {\displaystyle 20\% \times (1 + \text{Break Effect})}    Applies 1 stack when the Entangled target is hit (Max 5 Stacks) | &#10008;&#10008;No |
| Imprisonment | &#8212; | 1 | Delays action by                         30         &#x25;         &#xd7;         (         1         +                    Break Effect                  )                 {\displaystyle 30\%\times (1+{\text{Break Effect}})}    Reduces the speed of the Imprisoned target by 10% | &#8212; |

| Level | Level Multiplier |
| --- | --- |
| 1 | 54.0000 |
| 2 | 58.0000 |
| 3 | 62.0000 |
| 4 | 67.5264 |
| 5 | 70.5094 |
| 6 | 73.5228 |
| 7 | 76.5660 |
| 8 | 79.6385 |
| 9 | 82.7395 |
| 10 | 85.8684 |
| 11 | 91.4944 |
| 12 | 97.0680 |
| 13 | 102.5892 |
| 14 | 108.0579 |
| 15 | 113.4743 |
| 16 | 118.8383 |
| 17 | 124.1499 |
| 18 | 129.4091 |
| 19 | 134.6159 |
| 20 | 139.7703 |
| 21 | 149.3323 |
| 22 | 158.8011 |
| 23 | 168.1768 |
| 24 | 177.4594 |
| 25 | 186.6489 |
| 26 | 195.7452 |
| 27 | 204.7484 |

| Level | Level Multiplier |
| --- | --- |
| 28 | 213.6585 |
| 29 | 222.4754 |
| 30 | 231.1992 |
| 31 | 246.4276 |
| 32 | 261.1810 |
| 33 | 275.4733 |
| 34 | 289.3179 |
| 35 | 302.7275 |
| 36 | 315.7144 |
| 37 | 328.2905 |
| 38 | 340.4671 |
| 39 | 352.2554 |
| 40 | 363.6658 |
| 41 | 408.1240 |
| 42 | 451.7883 |
| 43 | 494.6798 |
| 44 | 536.8188 |
| 45 | 578.2249 |
| 46 | 618.9172 |
| 47 | 658.9138 |
| 48 | 698.2325 |
| 49 | 736.8905 |
| 50 | 774.9041 |
| 51 | 871.0599 |
| 52 | 964.8705 |
| 53 | 1056.4206 |
| 54 | 1145.7910 |

| Level | Level Multiplier |
| --- | --- |
| 55 | 1233.0585 |
| 56 | 1318.2965 |
| 57 | 1401.5750 |
| 58 | 1482.9608 |
| 59 | 1562.5178 |
| 60 | 1640.3068 |
| 61 | 1752.3215 |
| 62 | 1861.9011 |
| 63 | 1969.1242 |
| 64 | 2074.0659 |
| 65 | 2176.7983 |
| 66 | 2277.3904 |
| 67 | 2375.9085 |
| 68 | 2472.4160 |
| 69 | 2566.9739 |
| 70 | 2659.6406 |
| 71 | 2780.3044 |
| 72 | 2898.6022 |
| 73 | 3014.6029 |
| 74 | 3128.3729 |
| 75 | 3239.9758 |
| 76 | 3349.4730 |
| 77 | 3456.9236 |
| 78 | 3562.3843 |
| 79 | 3665.9099 |
| 80 | 3767.5533 |

| Level | Level Multiplier |
| --- | --- |
| 81 | 3957.8618 |
| 82 | 4155.2118 |
| 83 | 4359.8638 |
| 84 | 4572.0878 |
| 85 | 4792.1641 |
| 86 | 5020.3833 |
| 87 | 5257.0466 |
| 88 | 5502.4664 |
| 89 | 5756.9667 |
| 90 | 6020.8836 |
| 91 | 6294.5654 |
| 92 | 6578.3734 |
| 93 | 6872.6823 |
| 94 | 7177.8806 |
| 95 | 7494.3713 |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Fugue Fugue | Fortune Follows Where Virtue Spreads Fortune Follows Where Virtue Spreads | While Fugue is on the field, enemy targets will get additionally afflicted with "Cloudflame Luster," equal to 40% of their Max Toughness. When the initial Toughness is reduced to 0, "Cloudflame Luster" can continue to be reduced. When "Cloudflame Luster" is reduced to 0, the enemy will receive Weakness Break DMG again.While Fugue is on the field and after allies attack Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy targets, converts the Toughness Reduction of this attack into 1 instance of 50%—110% Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | Talent | Impair |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Boothill Boothill | 3-9× Smile 3-9× Smile | After the Technique is used, when casting the Skill for the first time in the next battle, applies the same Physical Weakness to the target as the one induced by the Ultimate, lasting for 2 turn(s). | Technique | Enhance |
| Silver Wolf Silver Wolf | Allow Changes? Allow Changes? | There is a 75%—87% base chanceBase ChanceThe base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to add 1 Weakness of an on-field character's Type to the target enemy. This also reduces the enemy's DMG RES to that Weakness Type by 20% for 2 turn(s). If the enemy already has that Type Weakness, the effect of DMG RES reduction to that Weakness Type will not be triggered.Each enemy can only have 1 Weakness implanted by Silver Wolf. When Silver Wolf implants another Weakness to the target, only the most recent implanted Weakness will be kept.In addition, there is a 100% base chanceBase ChanceThe base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to further reduce the All-Type RES of the enemy by 7.5%—10.5% for 2 turn(s).Deals Quantum DMG equal to 98%—215.6% of Silver Wolf's ATK to this enemy. | Skill | Single Target |
| Silver Wolf Silver Wolf | Allow Changes? (Enhanced) Allow Changes? (Enhanced) | There is a 80%—128% base chanceBase ChanceThe base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to add 1 Weakness of an on-field ally target's Type to one designated enemy target (prioritizes implanting the Weakness corresponding to the first ally target in the lineup), also reducing the enemy target's RES to that Weakness Type by 20% for 3 turn(s). If the enemy target already has that Type Weakness, the RES reduction effect to that Type will not be triggered.Each enemy target can only have 1 Weakness implanted by Silver Wolf. When Silver Wolf implants another Weakness to the target, only the most recent implanted Weakness will be kept.In addition, there is a 100% base chanceBase ChanceThe base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to further reduce the target's All-Type RES by 10.5%—13.5% for 2 turn(s).Deals Quantum DMG equal to 98%—215.6% of Silver Wolf's ATK to this target. | Skill | Single Target |
| Boothill Boothill | Dust Devil's Sunset Rodeo Dust Devil's Sunset Rodeo | Applies Physical Weakness to a single target enemy, lasting for 2 turn(s).Deals Physical DMG equal to 240%—432% of Boothill's ATK to the target and delays their actionAction DelayedIncreases the target's waiting interval before the next action. by 30%—42%. | Ultimate | Single Target |
| Firefly Firefly | Fyrefly Type-IV: Deathstar Overload Fyrefly Type-IV: Deathstar Overload | Restores HP by an amount equal to 25% of this unit's Max HP. Applies Fire Weakness to a single target enemy, lasting for 2 turn(s). Deals Fire DMG equal to (0.2 &#215; Break Effect + 100%—220%) of SAM's ATK to this target. At the same time, deals Fire DMG equal to (0.1 &#215; Break Effect + 50%—110%) of SAM's ATK to adjacent targets. The Break Effect taken into the calculation is capped at 360%. | Skill | Blast |
| Firefly Firefly | Fyrefly Type-IV: Deathstar Overload (Enhanced) Fyrefly Type-IV: Deathstar Overload (Enhanced) | Restores HP by an amount equal to 25% of this unit's Max HP. Adds Fire Weakness to one designated enemy and its adjacent targets, lasting for 2 turns. Deals Fire DMG equal to (0.2 &#215; Break Effect + 100%-220%) of SAM's ATK to this target. At the same time, deals Fire DMG equal to (0.1 &#215; Break Effect + 50%-110%) of SAM's ATK to adjacent targets. The Break Effect taken into the calculation is capped at 360%. | Skill | Blast |
| Phainon Phainon | He Who Bears the World Must Burn He Who Bears the World Must Burn | Transforms into Khaslana. During the transformation, deploys the TerritoryTerritoryTerritory effects are unique in the battle. While it exists, other abilities with Territory effects cannot be used. "Ruinous Irontomb." Within the TerritoryTerritoryTerritory effects are unique in the battle. While it exists, other abilities with Territory effects cannot be used., other teammates departDepartedTargets in the Departed state cannot be designated as ability targets and will not appear in the Action Order. and cannot take action, and all enemies have Physical Weakness.Khaslana does not enter his own turn, but has 8 Khaslana's extra turn(s)Khaslana's Extra TurnWhen Phainon transforms into Khaslana, a countdown will appear on the Action Order. When the countdown begins, Khaslana will gain 1 extra turn. When the last turn of the countdown begins, transforms into Khaslana and delivers a final hit before ending the transformation.The countdown initial action value will be set between 0–100%. The action value will not be reset at the start of each wave.When Khaslana is under the effect of action advance, the first countdown's action is advanced instead. with a SPD set at 60.0% of Khaslana's base SPD. When the last of Khaslana's extra turnsKhaslana's Extra TurnWhen Phainon transforms into Khaslana, a countdown will appear on the Action Order. When the countdown begins, Khaslana will gain 1 extra turn. When the last turn of the countdown begins, transforms into Khaslana and delivers a final hit before ending the transformation.The countdown initial action value will be set between 0–100%. The action value will not be reset at the start of each wave.When Khaslana is under the effect of action advance, the first countdown's action is advanced instead. starts, immediately launches a final hit and deals Physical Ultimate DMG equal to 480.0%—1056.0% of Khaslana's ATK that is distributed evenly across all enemies. | Ultimate | AoE |
| Anaxa Anaxa | Prism of the Pupil Prism of the Pupil | After using Technique, inflicts the Terrified state on enemies in a set area. Terrified enemies will flee in a direction away from Anaxa for 10 second(s). When allies enter battle via actively attacking a Terrified enemy, it will always be considered as entering battle via attacking a Weakness. After entering battle, Anaxa applies 1 Weakness of the attacker's Type to every enemy target, lasting for 3 turn(s). | Technique | Impair |
| Anaxa Anaxa | Sprouting Life Sculpts Earth Sprouting Life Sculpts Earth | Inflicts the "Sublimation" state on all enemies, then deals Wind DMG equal to 80%—176% of Anaxa's ATK to all enemies.In the "Sublimation" state, the targets will be simultaneously inflicted with Physical, Fire, Ice, Lightning, Wind, Quantum, and Imaginary Weaknesses, lasting until the start of the targets' turn. If the targets do not have Control RES, they are unable to take action in the "Sublimation" state. | Ultimate | AoE |
| Anaxa Anaxa | Tetrad Wisdom Reigns Thrice Tetrad Wisdom Reigns Thrice | Each time Anaxa lands 1 hit on enemy targets, inflicts 1 Weakness of a random Type to the targets, lasting for 3 turn(s), with priority to the Weakness Type that the target doesn't already possess.While Anaxa is on the field, inflicts the "Qualitative Disclosure" state on enemy targets that have at least 5 different Types of Weaknesses. Anaxa deals 18%—32.4% increased DMG to targets afflicted with the "Qualitative Disclosure" state. In addition, after using Basic ATK or Skill on them, unleashes 1 additional instance of Skill on the targets. This additional Skill does not consume any Skill Points and cannot trigger this effect again. If the target has been defeated before the additional Skill is used, it will be cast on one random enemy instead. | Talent | Impair |
| The Dahlia The Dahlia | Wallow... Entombed Ash Wallow... Entombed Ash | Inflicts a "Wilt" state on all enemies, lasting for 4 turn(s). Then, deals Fire DMG equal to 180%—324% of The Dahlia's ATK, which is distributed evenly across all enemies.Enemy targets in the "Wilt" state have their DEF reduced by 8%—20% and will be implanted with Weakness of all Dance Partners' Types. | Ultimate | AoE |
| Firefly Firefly | Δ Order: Meteoric Incineration Δ Order: Meteoric Incineration | Leaps into the air and moves about freely for 5 seconds, which can be ended early by launching a plunging attack. When the duration ends, plunges and immediately attacks all enemies within a set area. At the start of each wave, applies a Fire Weakness to all enemies, lasting for 2 turn(s). Then, deals Fire DMG equal to 200% of SAM's ATK to all enemies. | Technique |  |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Acheron Acheron | Atop Rainleaf Hangs Oneness Atop Rainleaf Hangs Oneness | When Slashed Dream reaches 9 point(s), the Ultimate can be activated. During the Ultimate, reduces enemies' Toughness regardless of Weakness Types and reduces all enemies' All-Type RES by 10%—22%, lasting until the end of the Ultimate.When any unit inflicts debuffs on an enemy target while using their ability, Acheron gains 1 point of Slashed Dream and inflicts 1 stack of Crimson Knot on a target. If debuffs are inflicted on multiple targets, then the 1 stack of Crimson Knot will be inflicted on the enemy target with the most Crimson Knot stacks. This effect can only trigger once for every ability use.After an enemy target exits the field or gets defeated by any unit while Acheron is on the field, their Crimson Knot stacks will be transferred to the enemy target with the most Crimson Knot stacks on the whole field. | Talent | Enhance |
| Xueyi Xueyi | Divine Castigation Divine Castigation | Deals Quantum DMG equal to 150%—270% of Xueyi's ATK to a single target enemy. This attack ignores Weakness Types and reduces the enemy's Toughness. When the enemy's Weakness is Broken, the Quantum Weakness Break effect is triggered.In this attack, the more Toughness is reduced, the higher the DMG will be dealt, up to a max of 36%—64.8% increase. | Ultimate | Single Target |
| Silver Wolf Silver Wolf | Force Quit Program Force Quit Program | Immediately attacks the enemy. After entering battle, deals Quantum DMG equal to 80% of Silver Wolf's ATK to all enemies, and ignores Weakness Types and reduces Toughness from all enemies. Enemies with their Weakness Broken in this way will trigger the Quantum Weakness Break effect. | Technique |  |
| Rappa Rappa | Ningu: Demonbane Petalblade Ningu: Demonbane Petalblade | Launches "Ningu: Demonbane Petalblade." The first 2 hits deal Imaginary DMG equal to 60%—108% of Rappa's ATK to one designated enemy and Imaginary DMG equal to 30%—54% of Rappa's ATK to adjacent targets, and the 3rd hit deals Imaginary DMG equal to 60%—108% of Rappa's ATK to all enemies.Enhanced Basic ATK will not recover Skill Points. Attacking enemies that don't have Imaginary Weakness can also reduce Toughness, whose effect is equal to 50% of the original Toughness Reduction. When Breaking Weakness, triggers the Imaginary Weakness Break effect. | Basic ATK | Blast |
| Rappa Rappa | Ninja Dash: By Leaps and Bounds Ninja Dash: By Leaps and Bounds | After using Technique, enters the "Graffiti" state for 20 seconds. While in the "Graffiti" state, moves forward rapidly for a set distance and attacks any enemies touched. During the rapid movement, can block all enemies' attacks. Using an attack in the "Graffiti" state can end the state's duration early. After entering combat via attacking enemies, deals 30 Toughness Reduction regardless of Weakness Type and Break DMG equal to 200% of Rappa's Imaginary Break DMG to each enemy target, and deals Break DMG equal to 180% of Rappa's Imaginary Break DMG to adjacent targets. At the same time, this unit regenerates 10 Energy. | Technique | Enhance |
| Rappa Rappa | Ninja Tech: Endurance Gauge Ninja Tech: Endurance Gauge | Each time the enemy target is Weakness Broken, Rappa gains 1 point of Charge, up to a max of 10 points of Charge. When Rappa next launches the third hit of "Ningu: Demonbane Petalblade," additionally deals Break DMG equal to 30%—66% of Rappa's Imaginary Break DMG to all enemies. This DMG can ignore Weakness Type to reduce 2 Toughness, consuming all Charge. Each point of Charge increases the Break DMG multiplier by 25%—55% and increases the Toughness Reduction that can ignore Weakness Type by 1.When Breaking Weakness, triggers the Imaginary Weakness Break effect. | Talent | Enhance |
| Himeko • Nova Himeko • Nova | Of Fire and Far Faring Of Fire and Far Faring | While Himeko • Nova is on the field, immediately deploys the TerritoryTerritoryTerritory effects are unique in the battle. While it exists, other abilities with Territory effects cannot be used. "Starblazer Visioscape," summoning "Starblazer" to the field and granting all ally characters 1 Assist SkillAssist SkillAn extra ability that can be granted to an ally target. Using an Assist Skill will also consume the current action turn. use. Ally characters can use Assist SkillAssist SkillAn extra ability that can be granted to an ally target. Using an Assist Skill will also consume the current action turn. to call upon "Starblazer" to attack enemies.Using Assist SkillAssist SkillAn extra ability that can be granted to an ally target. Using an Assist Skill will also consume the current action turn. is considered as Himeko • Nova using her Skill. Himeko • Nova gains 10%-22% increased All-Type RES PENRES PENWhen dealing DMG, ignore a part of the enemy target's resistance to the corresponding damage type. and 40%-88% increased CRIT DMG. When attacking, can ignore Weakness Types to reduce enemy Toughness. When breaking Weakness, triggers the Fire Weakness Break effect.When ally characters other than Himeko • Nova use their Assist SkillAssist SkillAn extra ability that can be granted to an ally target. Using an Assist Skill will also consume the current action turn., regenerates 4 Energy for them. | Talent | Enhance |
| Acheron Acheron | Quadrivalent Ascendance Quadrivalent Ascendance | Immediately attacks the enemy. At the start of each wave, gains Quadrivalent Ascendance, dealing Lightning DMG equal to 200% of Acheron's ATK to all enemies and reducing Toughness of all enemies irrespective of Weakness Types. When breaking Weaknesses, triggers the Lightning Weakness Break effect.Quadrivalent Ascendance: After using the Ultimate, Acheron gains 1 point(s) of Slashed Dream and inflicts 1 stack(s) of Crimson Knot on a single random enemy.If attacking a normal enemy, immediately defeats them without entering combat. When not hitting enemies, no Technique Points are consumed. | Technique |  |
| Ruan Mei Ruan Mei | Silken Serenade Silken Serenade | After using the Technique, gains Silken Serenade. At the start of the next battle, automatically triggers the Skill for 1 time(s) without consuming Skill Points.In Simulated Universe or Divergent Universe, when Ruan Mei has Silken Serenade, the team actively attacking enemies will always be regarded as attacking their Weakness to enter battle, and this attack can reduce all enemies' Toughness regardless of Weakness types. When breaking Weakness, triggers Weakness Break Effect corresponding to the attacker's Type. For every Blessing in possession (up to a max of 20 Blessings will be taken into account), additionally increases the Toughness Reduction of this attack by 100%. After breaking an enemy target's Weakness, additionally deals to the enemy target Break DMG equal to 100% of Ruan Mei's Ice Break DMG. | Technique | Enhance |
| Fugue Fugue | Solar Splendor Shines Upon All Solar Splendor Shines Upon All | Deals Fire DMG equal to 100%—220% of Fugue's ATK to all enemies. This attack ignores Weakness Type to reduce all enemies' Toughness. And when breaking Weakness, triggers the Fire Weakness Break effect. | Ultimate | AoE |
| Feixiao Feixiao | Terrasplit Terrasplit | Deals Wind DMG to a single target enemy, up to 402%—759.6% of Feixiao's ATK. During this time, can ignore Weakness Type to reduce the target's Toughness. When the target is not Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions., Feixiao's Weakness Break Efficiency increases by 100%.During the attack, Feixiao first launches "Boltsunder Blitz" or "Waraxe Skyward" on the target, for a total of 6 time(s).At the end, deals Wind DMG equal to 96%—172.8% of Feixiao's ATK to the target. | Ultimate | Single Target |
| Fugue Fugue | Virtue Beckons Bliss Virtue Beckons Bliss | Grants one designated ally "Foxian Prayer". Enters the "Torrid Scorch" state, lasting for 3 turn(s). The duration reduces by 1 at the start of Fugue's every turn. "Foxian Prayer" only takes effect on the most recent target of Fugue's Skill.The ally target with "Foxian Prayer" increases their Break Effect by 15%—33% and can also reduce Toughness even when attacking enemies that don't have the corresponding Weakness Type, with the effect equivalent to 50% of the original Toughness Reduction value. This cannot stack with other Toughness Reduction effects that also ignore Weakness Type.While in the "Torrid Scorch" state, Fugue enhances her Basic ATK. Every time an ally target with "Foxian Prayer" attacks, Fugue has a 100% base chanceBase ChanceThe base chance of applying debuffs to targets hit. The final probability is affected by the attacker's Effect Hit Rate and enemy targets' Effect RES. to reduce the attacked enemy target's DEF by 8%—20%, lasting for 2 turn(s). | Skill | Support |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Boothill Boothill | Five Peas in a Pod Five Peas in a Pod | Each stack of Pocket Trickshot increases the Enhanced Basic Attack's Toughness Reduction by 50%, stacking up to 3 time(s).If the target is Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. while the Enhanced Basic ATK is being used, based on the number of Pocket Trickshot stacks, deals Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. to this target equal to 35%—77%/60%—132%/85%—187% of Boothill's Physical Break DMG. The max Toughness taken into account for this DMG cannot exceed 16 times the base Toughness Reduction of the Basic Attack "Skullcrush Spurs."After winning the battle, Boothill can retain Pocket Trickshot for the next battle. | Talent | Enhance |
| March 7th (The Hunt) March 7th (The Hunt) | Master, It's Tea Time! Master, It's Tea Time! | Designates one ally (excluding this unit) as "Shifu" and increases "Shifu"'s SPD by 6%—10.8%. Only the most recent target of March 7th's Skill is considered as "Shifu."Whenever using Basic ATK or dealing 1 hit of Enhanced Basic ATK's DMG, triggers the corresponding effect if "Shifu" with the specified Path is present on the field:Erudition, Destruction, The Hunt, Remembrance, Elation: Deals Additional DMGAdditional DMGCauses the target being hit to take extra DMG, which is not considered an attack. (DMG Type based on "Shifu"'s Combat Type) equal to 10%—22% of March 7th's ATK.Harmony, Nihility, Preservation, Abundance: Increases the Toughness Reduction of this instance of DMG by 100%. | Skill | Support |
| Rappa Rappa | Ninja Tech: Endurance Gauge Ninja Tech: Endurance Gauge | Each time the enemy target is Weakness Broken, Rappa gains 1 point of Charge, up to a max of 10 points of Charge. When Rappa next launches the third hit of "Ningu: Demonbane Petalblade," additionally deals Break DMG equal to 30%—66% of Rappa's Imaginary Break DMG to all enemies. This DMG can ignore Weakness Type to reduce 2 Toughness, consuming all Charge. Each point of Charge increases the Break DMG multiplier by 25%—55% and increases the Toughness Reduction that can ignore Weakness Type by 1.When Breaking Weakness, triggers the Imaginary Weakness Break effect. | Talent | Enhance |
| Yukong Yukong | Seven Layers, One Arrow Seven Layers, One Arrow | Basic ATK additionally deals Imaginary DMG equal to 40%—88% of Yukong's ATK, and increases the Toughness Reduction of this attack by 100%. This effect can be triggered again after 1 turn(s). | Talent | Enhance |
| Ruan Mei Ruan Mei | Silken Serenade Silken Serenade | After using the Technique, gains Silken Serenade. At the start of the next battle, automatically triggers the Skill for 1 time(s) without consuming Skill Points.In Simulated Universe or Divergent Universe, when Ruan Mei has Silken Serenade, the team actively attacking enemies will always be regarded as attacking their Weakness to enter battle, and this attack can reduce all enemies' Toughness regardless of Weakness types. When breaking Weakness, triggers Weakness Break Effect corresponding to the attacker's Type. For every Blessing in possession (up to a max of 20 Blessings will be taken into account), additionally increases the Toughness Reduction of this attack by 100%. After breaking an enemy target's Weakness, additionally deals to the enemy target Break DMG equal to 100% of Ruan Mei's Ice Break DMG. | Technique | Enhance |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Firefly Firefly | Fyrefly Type-IV: Complete Combustion Fyrefly Type-IV: Complete Combustion | Enters the Complete Combustion state, advances this unit's Action by 100%, and gains Enhanced Basic ATK and Enhanced Skill. While in Complete Combustion, increases SPD by 30—66, and when using the Enhanced Basic ATK or Enhanced Skill, increases this unit's Weakness Break Efficiency by 50% and the Break DMG dealt by SAM to the enemy targets by 10%—22%, lasting until this current attack ends.A countdown timer for the Complete Combustion state appears on the Action Order. When the countdown timer's turn starts, SAM exits the Complete Combustion state. The countdown timer has a fixed SPD of 70.SAM cannot use Ultimate while in Complete Combustion. | Ultimate | Enhance |
| The Dahlia The Dahlia | Lick... Enkindled Betrayal Lick... Enkindled Betrayal | Deploys a Zone that lasts for 3 turn(s). This duration decreases by 1 at the start of The Dahlia's turn. Then, deals Fire DMG equal to 80%—168% of The Dahlia's ATK to one designated enemy and their adjacent targets.While the Zone lasts, increases all allies' Weakness Break Efficiency by 50%. Toughness Reduction taken by enemy targets while not Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. can also be converted into Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | Skill | Blast |
| Rappa Rappa | Nindō Supreme: Aishiteru Nindō Supreme: Aishiteru | Enters the "Sealform" state, immediately gains 1 extra turnExtra TurnGain 1 extra turn that won't expend your remaining turns when taking action. During this extra turn, no Ultimate can be used., obtains 3 points of "Chroma Ink," and increases Weakness Break Efficiency by 50% and Break Effect by 10%—34%.While in the "Sealform" state, Basic ATK is enhanced, and Skill and Ultimate cannot be used. After using Enhanced Basic ATK, consumes 1 point of "Chroma Ink." When "Chroma Ink" is depleted, exits the "Sealform" state. | Ultimate | Enhance |
| Ruan Mei Ruan Mei | String Sings Slow Swirls String Sings Slow Swirls | After using her Skill, Ruan Mei gains Overtone, lasting for 3 turn(s). This duration decreases by 1 at the start of Ruan Mei's every turn. When Ruan Mei has Overtone, all allies' DMG increases by 16%—35.2% and Weakness Break Efficiency increases by 50%. | Skill | Support |
| Feixiao Feixiao | Terrasplit Terrasplit | Deals Wind DMG to a single target enemy, up to 402%—759.6% of Feixiao's ATK. During this time, can ignore Weakness Type to reduce the target's Toughness. When the target is not Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions., Feixiao's Weakness Break Efficiency increases by 100%.During the attack, Feixiao first launches "Boltsunder Blitz" or "Waraxe Skyward" on the target, for a total of 6 time(s).At the end, deals Wind DMG equal to 96%—172.8% of Feixiao's ATK to the target. | Ultimate | Single Target |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Boothill Boothill | Five Peas in a Pod Five Peas in a Pod | Each stack of Pocket Trickshot increases the Enhanced Basic Attack's Toughness Reduction by 50%, stacking up to 3 time(s).If the target is Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. while the Enhanced Basic ATK is being used, based on the number of Pocket Trickshot stacks, deals Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. to this target equal to 35%—77%/60%—132%/85%—187% of Boothill's Physical Break DMG. The max Toughness taken into account for this DMG cannot exceed 16 times the base Toughness Reduction of the Basic Attack "Skullcrush Spurs."After winning the battle, Boothill can retain Pocket Trickshot for the next battle. | Talent | Enhance |
| Rappa Rappa | Ninja Dash: By Leaps and Bounds Ninja Dash: By Leaps and Bounds | After using Technique, enters the "Graffiti" state for 20 seconds. While in the "Graffiti" state, moves forward rapidly for a set distance and attacks any enemies touched. During the rapid movement, can block all enemies' attacks. Using an attack in the "Graffiti" state can end the state's duration early. After entering combat via attacking enemies, deals 30 Toughness Reduction regardless of Weakness Type and Break DMG equal to 200% of Rappa's Imaginary Break DMG to each enemy target, and deals Break DMG equal to 180% of Rappa's Imaginary Break DMG to adjacent targets. At the same time, this unit regenerates 10 Energy. | Technique | Enhance |
| Rappa Rappa | Ninja Tech: Endurance Gauge Ninja Tech: Endurance Gauge | Each time the enemy target is Weakness Broken, Rappa gains 1 point of Charge, up to a max of 10 points of Charge. When Rappa next launches the third hit of "Ningu: Demonbane Petalblade," additionally deals Break DMG equal to 30%—66% of Rappa's Imaginary Break DMG to all enemies. This DMG can ignore Weakness Type to reduce 2 Toughness, consuming all Charge. Each point of Charge increases the Break DMG multiplier by 25%—55% and increases the Toughness Reduction that can ignore Weakness Type by 1.When Breaking Weakness, triggers the Imaginary Weakness Break effect. | Talent | Enhance |
| Ruan Mei Ruan Mei | Petals to Stream, Repose in Dream Petals to Stream, Repose in Dream | Ruan Mei deploys a Zone that lasts for 2 turns. The Zone's duration decreases by 1 at the start of her turn.While inside the Zone, all allies' All-Type RES PEN increases by 15%—27% and their attacks apply Thanatoplum Rebloom to the enemies hit.When these enemies attempt to recover from Weakness BreakWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions., Thanatoplum Rebloom is triggered, extending the duration of their Weakness BreakWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions., delaying their actionAction DelayedIncreases the target's waiting interval before the next action. by an amount equal to 20% of Ruan Mei's Break Effect plus 10%, and dealing Break DMG equal to 30%—54% of Ruan Mei's Ice Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects..Enemy targets cannot have Thanatoplum Rebloom re-applied to them until they recover from Weakness BreakWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions.. | Ultimate | Support |
| Ruan Mei Ruan Mei | Silken Serenade Silken Serenade | After using the Technique, gains Silken Serenade. At the start of the next battle, automatically triggers the Skill for 1 time(s) without consuming Skill Points.In Simulated Universe or Divergent Universe, when Ruan Mei has Silken Serenade, the team actively attacking enemies will always be regarded as attacking their Weakness to enter battle, and this attack can reduce all enemies' Toughness regardless of Weakness types. When breaking Weakness, triggers Weakness Break Effect corresponding to the attacker's Type. For every Blessing in possession (up to a max of 20 Blessings will be taken into account), additionally increases the Toughness Reduction of this attack by 100%. After breaking an enemy target's Weakness, additionally deals to the enemy target Break DMG equal to 100% of Ruan Mei's Ice Break DMG. | Technique | Enhance |
| Ruan Mei Ruan Mei | Somatotypical Helix Somatotypical Helix | Increases SPD by 8%—10.4% for all teammates (i.e., excluding this unit). When allies Break an enemy target's Weakness, Ruan Mei deals to this enemy target Break DMG equal to 60%—132% of her Ice Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.. | Talent | Support |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Trailblazer (Harmony) Trailblazer (Harmony) | All-Out Footlight Parade All-Out Footlight Parade | Grants all allies the Backup Dancer effect, lasting for 3 turn(s). This duration decreases by 1 at the start of Trailblazer's every turn. Allies with the Backup Dancer effect have their Break Effect increased by 15%—33%. And when they attack enemy targets that are in the Weakness Broken stateWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions., the Toughness Reduction of the attack will be converted into 1 instance of Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | Ultimate | Support |
| Fugue Fugue | Fortune Follows Where Virtue Spreads Fortune Follows Where Virtue Spreads | While Fugue is on the field, enemy targets will get additionally afflicted with "Cloudflame Luster," equal to 40% of their Max Toughness. When the initial Toughness is reduced to 0, "Cloudflame Luster" can continue to be reduced. When "Cloudflame Luster" is reduced to 0, the enemy will receive Weakness Break DMG again.While Fugue is on the field and after allies attack Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy targets, converts the Toughness Reduction of this attack into 1 instance of 50%—110% Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | Talent | Impair |
| The Dahlia The Dahlia | Lick... Enkindled Betrayal Lick... Enkindled Betrayal | Deploys a Zone that lasts for 3 turn(s). This duration decreases by 1 at the start of The Dahlia's turn. Then, deals Fire DMG equal to 80%—168% of The Dahlia's ATK to one designated enemy and their adjacent targets.While the Zone lasts, increases all allies' Weakness Break Efficiency by 50%. Toughness Reduction taken by enemy targets while not Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. can also be converted into Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | Skill | Blast |
| The Dahlia The Dahlia | The Heart Makes the Finest Tomb The Heart Makes the Finest Tomb | After using Technique, creates a Special Dimension that lasts for 20 second(s). Enemies within this dimension will not actively attack ally targets. After entering combat with enemies in the Special Dimension, The Dahlia immediately deploys her Skill's Zone, and converts the combat-triggering Toughness Reduction into 1 instance of Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. at 60% against enemy targets that are Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions..Only 1 Dimension Effect created by allies can exist at the same time. | Technique | Impair |
| The Dahlia The Dahlia | Who's Afraid of Constance? Who's Afraid of Constance? | When entering combat, The Dahlia regenerates 35 Energy and becomes "Dance Partners" along with the teammate that triggered combat. Whenever there is no other "Dance Partner" on the field, this unit and the teammate with the highest Break Effect become "Dance Partners" together. After a "Dance Partner" attacks a Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy target, the Toughness Reduction from this attack will be converted into 1 instance of Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. at 30%—66%.After an enemy target gets attacked by the other "Dance Partner," The Dahlia launches Follow-Up ATKFollow-Up ATKUnleashes an extra attack on the target. This effect is triggered automatically when requirements are met. and deals 5 instance(s) of DMG, each dealing Fire DMG equal to 15%—33% of The Dahlia's ATK to one random enemy. After each instance of DMG dealt to a Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy target, the Toughness Reduction from this DMG will be converted into 1 instance of Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. at 100%—220%.This effect can only trigger once per turn. If the target is defeated before the Follow-Up ATKFollow-Up ATKUnleashes an extra attack on the target. This effect is triggered automatically when requirements are met. is used, it will be launched at one random enemy instead. | Talent | Bounce |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Rappa Rappa | Ninja Tech: Endurance Gauge Ninja Tech: Endurance Gauge | Each time the enemy target is Weakness Broken, Rappa gains 1 point of Charge, up to a max of 10 points of Charge. When Rappa next launches the third hit of "Ningu: Demonbane Petalblade," additionally deals Break DMG equal to 30%—66% of Rappa's Imaginary Break DMG to all enemies. This DMG can ignore Weakness Type to reduce 2 Toughness, consuming all Charge. Each point of Charge increases the Break DMG multiplier by 25%—55% and increases the Toughness Reduction that can ignore Weakness Type by 1.When Breaking Weakness, triggers the Imaginary Weakness Break effect. | Talent | Enhance |

| Character | Name | Description | Type | Tag |
| --- | --- | --- | --- | --- |
| Lingsha Lingsha | Dripping Mistscape Dripping Mistscape | Inflicts "Befog" on all enemies. While in "Befog," targets receive 15%—27% increased Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects., lasting for 2 turn(s).Deals Fire DMG equal to 90%—162% of Lingsha's ATK to all enemies, and at the same time restores HP equal to 8%—12.8% of Lingsha's ATK plus 90—400.5 for all allies. Fuyuan's action advancesAction AdvanceReduces the target's waiting interval before the next action. by 100%. | Ultimate | AoE |
| Firefly Firefly | Fyrefly Type-IV: Complete Combustion Fyrefly Type-IV: Complete Combustion | Enters the Complete Combustion state, advances this unit's Action by 100%, and gains Enhanced Basic ATK and Enhanced Skill. While in Complete Combustion, increases SPD by 30—66, and when using the Enhanced Basic ATK or Enhanced Skill, increases this unit's Weakness Break Efficiency by 50% and the Break DMG dealt by SAM to the enemy targets by 10%—22%, lasting until this current attack ends.A countdown timer for the Complete Combustion state appears on the Action Order. When the countdown timer's turn starts, SAM exits the Complete Combustion state. The countdown timer has a fixed SPD of 70.SAM cannot use Ultimate while in Complete Combustion. | Ultimate | Enhance |
| Gallagher Gallagher | Tipsy Tussle Tipsy Tussle | The Besotted state makes targets receive 6%—13.2% more Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.. Every time a Besotted target gets attacked by an ally, the attacking ally's HP is restored by 80—707.2. | Talent | Restore |

| Character | Name | Description | AscensionRequirement |
| --- | --- | --- | --- |
| Firefly Firefly | Module α: Antilag Outburst Module α: Antilag Outburst | During the Complete Combustion, attacking enemies that have no Fire Weakness can also reduce their Toughness, with the effect being equivalent to 55% of the original Toughness Reduction from abilities. | 2 |
| March 7th (The Hunt) March 7th (The Hunt) | Filigree Filigree | March 7th can reduce the Toughness of enemies whose Weakness Type is the same as Shifu's Combat Type. When Breaking Weakness, triggers the Imaginary Weakness Break effect. | 4 |
| The Dahlia The Dahlia | Outgrow the Old, Espouse the New Outgrow the Old, Espouse the New | When an ally target adds Weakness to an enemy target, increases SPD by 30% for 2 turn(s). If a Fire ally character has implanted a Weakness when using an attack, then after the attack, additionally deals a fixed amount of 20 Fire Toughness Reduction to every target implanted with Weakness. Also, regenerates Energy equal to 10% of Max Energy. This effect can regenerate Energy up to 50% of Max Energy. | 6 |

| Character | Name | Description | AscensionRequirement |
| --- | --- | --- | --- |
| Trailblazer (Harmony) Trailblazer (Harmony) | Shuffle Along Shuffle Along | When using Skill, additionally increases the Toughness Reduction of the first instance of DMG by 100%. | 4 |

| Character | Name | Description | AscensionRequirement |
| --- | --- | --- | --- |
| Firefly Firefly | Module β: Autoreactive Armor Module β: Autoreactive Armor | When SAM is in Complete Combustion with a Break Effect that is equal to or greater than 200%/360%, attacking a Weakness-BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy target will convert the Toughness Reduction of this attack into 1 instance of 35%/50% Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | 4 |
| Firefly Firefly | Module β: Autoreactive Armor (Enhanced) Module β: Autoreactive Armor (Enhanced) | When SAM is in Complete Combustion with a Break Effect that is equal to or greater than 150%/300%, attacking a Weakness-BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy target will convert the Toughness Reduction of this attack into 1 instance of 100%/150% Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | 4 |
| Rappa Rappa | Ninjutsu Inscription: Sea Echo Ninjutsu Inscription: Sea Echo | While in the "Sealform" state, after Rappa uses Enhanced Basic ATK to deal DMG to a Weakness BrokenWeakness Break StateWhen enemy targets' Toughness is reduced to 0, they will enter the Weakness Break State, which delays their actions. enemy target, converts the Toughness Reduction from this instance of DMG to 1 instance of 60% Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG.. | 4 |

| Character | Name | Description | AscensionRequirement |
| --- | --- | --- | --- |
| Trailblazer (Harmony) Trailblazer (Harmony) | Dance With the One Dance With the One | When the number of enemy targets on the field is 5 (or more)/4/3/2/1, the Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. triggered by the Backup Dancer effect increases by 20%/30%/40%/50%/60%. | 2 |

| Character | Name | Description | AscensionRequirement |
| --- | --- | --- | --- |
| Rappa Rappa | Ninjutsu Inscription: Withered Leaf Ninjutsu Inscription: Withered Leaf | When an enemy target becomes Weakness Broken, increases the Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. taken by 2%. If Rappa's current ATK is higher than 2,400, for every 100 excess ATK, additionally increases this value by 1%, up to a max additional increase of 8%. This effect lasts for 2 turn(s). | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| Anaxa Anaxa | Soul, True to History Soul, True to History | When enemy targets enter the battlefield, triggers 1 instance of the Talent's Weakness Implant effect, and reduces their All-Type RES by 20%. | 2 |
| Archer Archer | The Unfulfilled Happiness The Unfulfilled Happiness | When using Ultimate, reduces the enemy target's Quantum RES by 20%, and induces Quantum Weakness for it, lasting for 2 turn(s). | 2 |
| Silver Wolf LV.999 Silver Wolf LV.999 | Solo Maxxing! Solo Maxxing! | Elation DMGElation DMGThe more Punchline taken into account, and the higher the Elation and Character Level, the greater the Elation DMG dealt.Elation DMG is not affected by DMG Boost effects. dealt during Enhanced Basic ATK merrymakesMerrymakeA special effect that affects Elation DMG and can additionally boost Elation DMG dealt. by 50%.When enemy targets enter combat, they are implanted with "Absolute Weakness": Has All-Type Weakness, and reduces their All-Type Base RESBase RESThe fixed DMG Type RES a target has when entering combat. Under normal circumstances, it cannot be modified. to 0. (If Base RESBase RESThe fixed DMG Type RES a target has when entering combat. Under normal circumstances, it cannot be modified. is already at 0, then the corresponding Type RES decreases by 20% instead). | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| The Dahlia The Dahlia | When a Bud Readies to Bloom When a Bud Readies to Bloom | The Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. multiplier provided by Talent to "Dance Partners" now applies to all ally characters, with "Dance Partners" additionally receiving a 40% boost. After "Dance Partners" use an attack, additionally deals the attacked enemy targets a fixed amount of Toughness Reduction equal to 25% of their Max Toughness (minimum 10, maximum 300). This effect can only trigger once per enemy target, and this trigger count resets after the enemy target receives a killing blow. | 1 |
| Xueyi Xueyi | Klesha, Breached Klesha, Breached | Talent's Follow-up ATKFollow-Up ATKUnleashes an extra attack on the target. This effect is triggered automatically when requirements are met. Reduces enemy Toughness regardless of Weakness types. At the same time, restores Xueyi's HP by an amount equal to 5% of her Max HP. When breaking Weakness, triggers the Quantum Break Effect. | 2 |
| Acheron Acheron | Apocalypse, the Emancipator Apocalypse, the Emancipator | Increases the All-Type RES PENRES PENWhen dealing DMG, ignore a part of the enemy target's resistance to the corresponding damage type. for the Ultimate DMG dealt by Acheron by 20%. The DMG dealt by Basic ATK and Skill will also be considered as Ultimate DMG and can Reduce enemy Toughness regardless of Weakness Types. When breaking Weaknesses, triggers the Lightning Weakness Break effect. | 6 |
| Castorice Castorice | Await for Years to Loom Await for Years to Loom | When Castorice or Netherwing deals DMG, increases Quantum RES PENRES PENWhen dealing DMG, ignore a part of the enemy target's resistance to the corresponding damage type. by 20%. During Netherwing's attacks, can reduce enemy Toughness regardless of Weakness Types. When breaking Weaknesses, triggers the Quantum Weakness Break effect. And the number of Bounces for Netherwing's Talent "Wings Sweep the Ruins" additionally increases by 3. | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| Rappa Rappa | Free Is the Mind Enlightened by Haikus Free Is the Mind Enlightened by Haikus | The Enhanced Basic ATK's first 2 hits have their Toughness Reduction against the one designated enemy increased by 50%. | 2 |
| Feixiao Feixiao | Stormward I Hear Stormward I Hear | The Toughness Reduction from the Talent's Follow-up ATKFollow-Up ATKUnleashes an extra attack on the target. This effect is triggered automatically when requirements are met. increases by 100% and, when launched, increases this unit's SPD by 8%, lasting for 2 turn(s). | 4 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| Lingsha Lingsha | Bloom on Vileward Bouquet Bloom on Vileward Bouquet | Lingsha's Weakness Break Efficiency increases by 50%. When an enemy unit's Weakness is Broken, reduces their DEF by 20%. | 1 |
| Fugue Fugue | Earthbound I Was, Cloudward I Be Earthbound I Was, Cloudward I Be | Ally target with "Foxian Prayer" increases their Weakness Break Efficiency by 50%. | 1 |
| Evernight Evernight | Wake Up, the Tomorrow is Yours Wake Up, the Tomorrow is Yours | While Evernight is on the field, ally memosprites' Weakness Break Efficiency increases by 25%, and the memosprite Evey's Weakness Break Efficiency additionally increases by 25%. | 4 |
| Gallagher Gallagher | Blood and Sand Blood and Sand | Increases Gallagher's Break Effect by 20% and Weakness Break Efficiency by 20%. | 6 |
| Fugue Fugue | Clairvoyance of Boom and Doom Clairvoyance of Boom and Doom | Increases Fugue's Weakness Break Efficiency by 50%. While Fugue is in the "Torrid Scorch" state, "Foxian Prayer" takes effect on all allies. | 6 |
| Firefly Firefly | In Finalized Morrow, I Full Bloom In Finalized Morrow, I Full Bloom | While in Complete Combustion, increases SAM's Fire RES PENRES PENWhen dealing DMG, ignore a part of the enemy target's resistance to the corresponding damage type. by 20%. When using the Enhanced Basic ATK or Enhanced Skill, increases Weakness Break Efficiency by 50%. | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| Boothill Boothill | Crowbar Hotel's Raccoon Crowbar Hotel's Raccoon | When triggering the Talent's Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects., additionally deals Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. to the target equal to 40% of the original DMG multiplier and additionally deals Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. to adjacent targets equal to 70% of the original DMG multiplier. | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| The Dahlia The Dahlia | When a Bud Readies to Bloom When a Bud Readies to Bloom | The Super Break DMGSuper Break DMGSuper Break DMG increases with higher Break Effect, higher Toughness Reduction of the attack, and higher character levels.Super Break DMG cannot CRIT Hit and is not affected by DMG Boost effects.Super Break DMG is also considered Break DMG. multiplier provided by Talent to "Dance Partners" now applies to all ally characters, with "Dance Partners" additionally receiving a 40% boost. After "Dance Partners" use an attack, additionally deals the attacked enemy targets a fixed amount of Toughness Reduction equal to 25% of their Max Toughness (minimum 10, maximum 300). This effect can only trigger once per enemy target, and this trigger count resets after the enemy target receives a killing blow. | 1 |
| Ruan Mei Ruan Mei | Sash Cascade Sash Cascade | Extends the duration of the Ultimate's Zone by 1 turn(s). The Talent's Break DMGBreak DMGBreak DMG increases with higher Break Effect, higher target max Toughness, and higher character levels.Break DMG cannot CRIT Hit and is not affected by DMG Boost effects. multiplier additionally increases by 200%. | 6 |

| Character | Name | Description | Level |
| --- | --- | --- | --- |
| Fugue Fugue | Bereft of Form, Which Name to Bear Bereft of Form, Which Name to Bear | Ally target with "Foxian Prayer" increases their Break DMG dealt by 20%. | 4 |

| Icon | Set | Pieces | Bonuses |
| --- | --- | --- | --- |
|  | Iron Cavalry Against the Scourge |  | 2 Piece: Increases Break Effect by 16%.4 Piece: If the wearer's Break Effect is 150% or higher, the Break DMG dealt to the enemy target ignores 10% of their DEF. If the wearer's Break Effect is 250% or higher, the Super Break DMG dealt to the enemy target additionally ignores 15% of their DEF. |

| Icon &amp; Name | Rarity | Path | Stats | Passive |
| --- | --- | --- | --- | --- |
| Long Road Leads Home |  | Nihility | HP:&#160;43~952ATK:&#160;21~476DEF:&#160;30~661 | RebirthIncreases the wearer's Break Effect by 60~100%. When an enemy target's Weakness gets broken, there is a 100% base chance to inflict the "Charring" state on it, which increases its Break DMG taken by 18~30%, lasting for 2 turn(s). This effect can stack 2 time(s). |
| Whereabouts Should Dreams Rest |  | Destruction | HP:&#160;52~1,164ATK:&#160;21~476DEF:&#160;24~529 | MetamorphosisIncreases the wearer's Break Effect by 60~100%. When the wearer deals Break DMG to an enemy target, inflicts Routed on the enemy, lasting for 2 turn(s). Targets afflicted with Routed receive 24.0~40.0% increased Break DMG from the wearer, and their SPD is lowered by 20%. Effects of the same type cannot be stacked. |

| Icon &amp; Name | Rarity | Path | Stats | Passive |
| --- | --- | --- | --- | --- |
| In Pursuit of the Wind |  | Harmony | HP:&#160;48~1,058ATK:&#160;21~476DEF:&#160;18~396 | FlusteredAfter entering combat, increases all allies' Break DMG dealt by 16~24%. Abilities of the same type cannot stack. |
| Never Forget Her Flame |  | Nihility | HP:&#160;52~1,164ATK:&#160;24~529DEF:&#160;21~463 | ImmolationIncreases the wearer's Break Effect by 60~120%. When entering combat, increases Break DMG dealt by the wearer and another teammate who triggered combat by 32~72%. If there is no teammate who triggered combat, applies this effect to the wearer and the teammate with the highest Break Effect. Effects of the same type cannot be stacked. When the wearer applies Weakness to an enemy target, recovers 1 Skill Point. This effect can only trigger once, and trigger count resets when using Ultimate. |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| "Harmonious Choir" The Great Septimus | Echo of War |  |  |
| Abundant Ebon Deer | Boss |  |  |
| Abundant Ebon Deer (Complete) | Boss |  |  |
| Abundant Ebon Deer (Illusion) | Boss |  |  |
| Aurumaton Gatekeeper | Elite |  |  |
| Aurumaton Gatekeeper (Bug) | Elite |  |  |
| Bronya | Boss |  |  |
| Bronya (Illusion) | Boss |  |  |
| Cloud Knight Lieutenant: Yanqing | Boss |  |  |
| Cloud Knight Lieutenant: Yanqing (Complete) | Boss |  |  |
| Cloud Knight Lieutenant: Yanqing (Illusion) | Boss |  |  |
| Cocolia, Mother of Deception | Echo of War |  |  |
| Cocolia, Mother of Deception (Illusion) | Echo of War |  |  |
| Dreamjolt Troupe's Sweet Gorilla | Elite |  |  |
| Dreamjolt Troupe's Sweet Gorilla (Bug) | Elite |  |  |
| Dreamjolt Troupe's Sweet Gorilla (Projection) | Elite |  |  |
| Guide of Withering and Decay | Boss |  |  |
| Memory Zone Meme "Something Unto Death" (Complete) | Boss |  |  |
| Pollux, Netherwing Husk, Ferry of Souls | Boss |  |  |
| Sequence Trotter | Normal |  |  |
| Stellaron Hunter: Sam | Boss |  |  |
| Stellaron Hunter: Sam (Complete) | Boss |  |  |
| The Giver, Master of Legions, Lance of Fury | Boss |  |  |
| Trot Deuce | Normal |  |  |
| Trot Prime | Normal |  |  |
| Trot Tri | Normal |  |  |
| Trotter of Abundance | Normal |  |  |
| Trotter of Destruction | Normal |  |  |
| Trotter of Preservation | Normal |  |  |
| Warp Trotter | Normal |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| "Harmonious Choir" The Great Septimus | Echo of War |  |  |
| Memory Zone Meme "Insatiable Vanity" | Normal |  |  |
| Shadow of "Feixiao" | Echo of War |  |  |
| Swarm: True Sting | Boss |  |  |
| Swarm: True Sting (Complete) | Boss |  |  |
| The Giver, Master of Legions, Lance of Fury | Boss |  |  |
| The Past, Present, and Eternal Show | Boss |  |  |
| The Past, Present, and Eternal Show (Complete) | Boss |  |  |
| Wonder Forest's Banacademic Office Staff | Boss |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| "Speartip" | Normal |  |  |
| Automaton Spider | Normal |  |  |
| Borisin Warhead: Hoolay | Boss |  |  |
| Borisin Warhead: Hoolay (Complete) | Boss |  |  |
| Dreamjolt Troupe's Bubble Hound | Normal |  |  |
| Entranced Ingenium: Illumination Dragonfish | Normal |  |  |
| Flying Sword (Illusion) | Normal |  |  |
| Gnaw Sting | Normal |  |  |
| Juvenile Sting | Normal |  |  |
| Lesser Sting | Normal |  |  |
| Starcrusher Swarm King: Skaracabaz (Synthetic) | Echo of War |  |  |
| Swarm: True Sting | Boss |  |  |
| Swarm: True Sting (Complete) | Boss |  |  |
| The Conquered | Normal |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| Nebula Devourer | Normal |  |  |
| Planeshred Claws | Normal |  |  |
| Shadow of "Feixiao" | Echo of War |  |  |
| Worldpurge Tail | Normal |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| Flying Sword (Illusion) | Normal |  |  |
| Lordly Trashcan | Normal |  |  |
| Memory Zone Meme "Insatiable Vanity" | Normal |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| "Harmonious Choir" The Great Septimus | Echo of War |  |  |
| Arbiter of the Lost Abyss | Boss |  |  |
| Ichor Memosprite: Judge of Oblivion | Boss |  |  |
| Ichor Memosprite: Judge of Oblivion (Complete) | Boss |  |  |

| Enemy | Tier | Damage | Weakness |
| --- | --- | --- | --- |
| Memory Zone Meme "Insatiable Vanity" | Normal |  |  |

|  | Name | Category | Description | Hidden | Version |
| --- | --- | --- | --- | --- | --- |
| 5 | Break Till Broken | Eager for Battle | Inflict Weakness Break 4 time(s) upon the same enemy in a single battle | No | 1.0 |
| 5 | Electric Dreams | Eager for Battle | Defeat 3 enemies with Lightning Break DMG in a single battle | No | 1.0 |
| 5 | Fahrenheit 451 | Eager for Battle | Defeat 3 enemies with Fire Break DMG in a single battle | No | 1.0 |
| 5 | Sunstorm | Eager for Battle | Defeat 3 enemies with Wind Break DMG in a single battle | No | 1.0 |
| 5 | The Demolished Man | Eager for Battle | Defeat 3 enemies with Physical Break DMG in a single battle | No | 1.0 |
| 5 | Lightning Breaker (I) | Eager for Battle | Defeat 20 enemies with Lightning Break DMG | No | 1.0 |
| 5 | Lightning Breaker (II) | Eager for Battle | Defeat 60 enemies with Lightning Break DMG | No | 1.0 |
| 5 | Fire Breaker (I) | Eager for Battle | Defeat 20 enemies with Fire Break DMG | No | 1.0 |
| 5 | Fire Breaker (II) | Eager for Battle | Defeat 60 enemies with Fire Break DMG | No | 1.0 |
| 5 | Wind Breaker (I) | Eager for Battle | Defeat 20 enemies with Wind Break DMG | No | 1.0 |
| 5 | Wind Breaker (II) | Eager for Battle | Defeat 60 enemies with Wind Break DMG | No | 1.0 |
| 5 | Physical Breaker (I) | Eager for Battle | Defeat 20 enemies with Physical Break DMG | No | 1.0 |
| 5 | Physical Breaker (II) | Eager for Battle | Defeat 60 enemies with Physical Break DMG | No | 1.0 |
| 5 | Schrödinger's Other Cat | Eager for Battle | Inflict 5 Quantum Weakness Breaks in a single battle | No | 1.0 |
| 5 | The Cold Equations | Eager for Battle | Inflict 5 Ice Weakness Breaks in a single battle | No | 1.0 |
| 5 | Unimaginably Imaginary | Eager for Battle | Inflict 5 Imaginary Weakness Breaks in a single battle | No | 1.0 |
| 5 | Quantum Breaker (I) | Eager for Battle | Inflict Quantum Weakness Break 100 time(s) | No | 1.0 |
| 5 | Quantum Breaker (II) | Eager for Battle | Inflict Quantum Weakness Break 300 time(s) | No | 1.0 |
| 5 | Ice Breaker (I) | Eager for Battle | Inflict Ice Weakness Break 100 time(s) | No | 1.0 |
| 5 | Ice Breaker (II) | Eager for Battle | Inflict Ice Weakness Break 300 time(s) | No | 1.0 |
| 5 | Imaginary Breaker (I) | Eager for Battle | Inflict Imaginary Weakness Break 100 time(s) | No | 1.0 |
| 5 | Imaginary Breaker (II) | Eager for Battle | Inflict Imaginary Weakness Break 300 time(s) | No | 1.0 |
| 5 | Add Insult to Injury | Eager for Battle | Deal a total of 20,000 DMG to enemies inflicted with Weakness Break in a single battle | No | 1.0 |
| 5 | Serial Breaker | Eager for Battle | Inflict Weakness Break to 4 enemies in a single action | No | 1.0 |
