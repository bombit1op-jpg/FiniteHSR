# Benchmark Reference — CalFun HSR Simulator

Sources: `hsr-data/characters.json` (`sub_affix_property_list`), fribbels/hsr-optimizer (scoring metadata + benchmark doc).

---

## How "25 Effective Rolls" Works

- Each relic has up to 6 substat rolls at +15.
- 6 relics × ~4 rolls each = 24 total rolls, rounded to 25.
- "Effective rolls" = rolls spent on substats the character actually wants.
- A build with 25/25 effective rolls = every roll hit a useful stat = strong endgame.
- Fribbels benchmark: 25 effective rolls = 100% DPS score baseline.

**Stat weight**: 0 = useless, 0.25 = nice-to-have, 0.5 = good, 0.75 = great, 1.0 = best. Rolls on 1.0 stats are twice as valuable as 0.5 stats.

---

## Substat Roll Values (5★ +15, Tier 2 High Roll)

| Substat | High | Mid | Low |
|---------|------|-----|-----|
| CRIT Rate | 3.24% | 2.916% | 2.592% |
| CRIT DMG | 6.48% | 5.832% | 5.184% |
| ATK% | 4.32% | 3.888% | 3.456% |
| DEF% | 5.4% | 4.86% | 4.32% |
| HP% | 4.32% | 3.888% | 3.456% |
| SPD | 2.6 | 2.34 | 2.08 |
| Break Effect | 6.48% | 5.832% | 5.184% |
| Effect Hit Rate | 4.32% | 3.888% | 3.456% |
| Effect RES | 4.32% | 3.888% | 3.456% |
| Flat ATK | 19.44 | 17.496 | 15.552 |
| Flat DEF | 21.6 | 19.44 | 17.28 |
| Flat HP | 33.78 | 30.402 | 27.024 |

---

## Characters

### Seele (1103) — Quantum Hunt DPS

**Effective substats** (hsr-data): CRIT Rate, CRIT DMG, ATK%, SPD
**Weights**: CR 1.0, CD 1.0, ATK% 0.75, ATK 0.75, SPD 1.0

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | CRIT Rate / CRIT DMG | — |
| Feet | SPD / ATK% | — |
| Planar Sphere | Quantum DMG / ATK% | — |
| Link Rope | ATK% | — |

**Fribbels presets**: Tengoku Set, Ashblazing Grand Duke (1 stack), Navigator Set (3 stacks)
**Recommended relic set**: Scholar Lost in Erudition or Pioneer Diver of Dead Waters
**Recommended planar**: Rutilant Arena or Inert Salsotto

---

### Jing Yuan (1012) — Lightning Erudition DPS (+ FUA)

**Effective substats** (hsr-data): CRIT Rate, CRIT DMG, ATK%, SPD
**Weights**: CR 1.0, CD 1.0, ATK% 0.75, ATK 0.75, SPD 1.0

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | CRIT Rate / CRIT DMG | — |
| Feet | SPD / ATK% | — |
| Planar Sphere | Lightning DMG / ATK% | — |
| Link Rope | ATK% | — |

**Fribbels presets**: Ashblazing Grand Duke (1 stack), BananAmusement Park, Inert Salsotto
**Recommended relic set**: The Ashblazing Grand Duke
**Recommended planar**: The Wondrous BananAmusement Park or Inert Salsotto

**Benchmark team**: Sunday + Robin + Permansor Terrae

---

### Firefly (1310) — Fire Destruction DPS (Super Break)

**Effective substats** (hsr-data): Break Effect, SPD, ATK%
**Weights**: BE 1.0, SPD 1.0, ATK% 0.5, ATK 0.5

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | ATK% / EHR | — |
| Feet | SPD / ATK% | — |
| Planar Sphere | ATK% | — |
| Link Rope | Break Effect | — |

**Recommended relic set**: Iron Cavalry Against the Scourge
**Recommended planar**: Firmament Frontline: Glamoth

---

### Bronya (1001) — Wind Harmony Buffer

**Effective substats** (hsr-data): CRIT DMG, SPD, Effect RES
**Weights**: CD 1.0, SPD 1.0, RES 0.25

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | CRIT DMG | — |
| Feet | SPD | — |
| Planar Sphere | HP% / DEF% | — |
| Link Rope | ERR | — |

**Fribbels presets**: Sacerdos' Relived Ordeal (3 stacks), Broken Keel
**Recommended relic set**: Sacerdos' Relived Ordeal
**Recommended planar**: Broken Keel

**Benchmark team**: Phainon + Cerydra + Permansor Terrae

---

### Pela (1008) — Ice Nihility Debuffer

**Effective substats** (hsr-data): SPD, Effect Hit Rate, CRIT Rate, CRIT DMG, ATK%
**Weights**: EHR 1.0, SPD 1.0, DEF% 0.25, DEF 0.25, HP% 0.25, HP 0.25, RES 0.25

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | EHR / HP% / DEF% | — |
| Feet | SPD | — |
| Planar Sphere | HP% / DEF% / Ice DMG | — |
| Link Rope | ERR | — |

**Fribbels presets**: Pioneer Diver of Dead Waters (4), Ashblazing Grand Duke (5 stacks), Divine-Querying Master Smith
**Recommended relic set**: Pioneer Diver of Dead Waters
**Recommended planar**: Divine-Querying Master Smith

---

### Guinaifen (1112) — Fire Nihility DoT/Debuffer

**Effective substats** (hsr-data): ATK%, SPD, Effect Hit Rate
**Weights**: EHR 1.0, SPD 1.0, ATK% 0.5, ATK 0.5, DEF% 0.25, DEF 0.25, HP% 0.25, HP 0.25, RES 0.25

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | ATK% / EHR | — |
| Feet | SPD | — |
| Planar Sphere | ATK% / Fire DMG | — |
| Link Rope | ERR / ATK% | — |

**Fribbels presets**: Prisoner in Deep Confinement (3), Ashblazing Grand Duke (5 stacks)
**Recommended relic set**: Prisoner in Deep Confinement
**Recommended planar**: Pan-Cosmic Commercial Enterprise

---

### Sparkle (1208) — Quantum Harmony Buffer

**Effective substats** (hsr-data): CRIT DMG, SPD, Effect RES
**Weights**: CD 1.0, SPD 1.0, RES 0.25

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | CRIT DMG | — |
| Feet | SPD | — |
| Planar Sphere | (any — HP%/DEF% for survivability) | — |
| Link Rope | ERR | — |

**Fribbels presets**: Sacerdos' Relived Ordeal (3 stacks)
**Recommended relic set**: Sacerdos' Relived Ordeal
**Recommended planar**: Broken Keel or Penacony

---

### Gallagher (1305) — Fire Abundance Healer (Break)

**Effective substats** (hsr-data): SPD, Break Effect, Effect RES
**Weights**: BE 1.0, SPD 1.0, RES 0.50

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | Outgoing Healing | — |
| Feet | SPD | — |
| Planar Sphere | (any — HP%/DEF% for survivability) | — |
| Link Rope | ERR / Break Effect | — |

**Fribbels presets**: Warrior Goddess of Sun and Thunder, Ashblazing Grand Duke (5 stacks)
**Recommended relic set**: Warrior Goddess of Sun and Thunder
**Recommended planar**: Fleet of the Ageless

---

### Huohuo (1110) — Wind Abundance Healer/Battery

**Effective substats** (hsr-data): HP%, SPD, Effect RES
**Weights**: HP 1.0, HP% 1.0, SPD 1.0, RES 0.50

| Main Stat | Best | Alternative |
|-----------|------|-------------|
| Body | HP% / Outgoing Healing | — |
| Feet | SPD / HP% | — |
| Planar Sphere | HP% | — |
| Link Rope | HP% / ERR | — |

**Fribbels presets**: Warrior Goddess of Sun and Thunder
**Recommended relic set**: Warrior Goddess of Sun and Thunder
**Recommended planar**: Fleet of the Ageless

---

## SPD Breakpoints (Fribbels)

| Target SPD | AV at battle start | Cycles needed | Notes |
|------------|-------------------|---------------|-------|
| 100 | 100.00 | — | Base |
| 105 | 95.24 | — | — |
| 110 | 90.91 | — | — |
| 115 | 86.96 | — | — |
| 120 | 83.33 | — | — |
| 133.34 | 75.00 | 4 cycles in 150 AV | Common breakpoint |
| 142.86 | 70.00 | — | — |
| 160.00 | 62.50 | — | Speedy characters |

---

## How to Read This

For a character like Seele with "CR 1.0, CD 1.0, ATK% 0.75, SPD 1.0":
- Every CR and CD roll is worth 1.0 × roll_value
- Every ATK% roll is worth 0.75 × roll_value
- Every SPD roll is worth 1.0 × roll_value (but fewer rolls needed for breakpoints)
- Flat ATK, DEF, HP, EHR, RES, BE rolls are wasted (weight 0)
- 25/25 effective rolls = all 25 rolls hit CR, CD, ATK%, or SPD

For support characters (Bronya, Sparkle, Huohuo), "effective" includes survivability stats since they don't deal damage.
