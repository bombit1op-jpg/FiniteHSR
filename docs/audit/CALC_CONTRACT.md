# FiniteHSR — calculator contract: what-if (`core/calcs.ts`) vs production chain

Roles (confirmed by code, 19-10-2026):

- **What-if calculator** `src/core/calcs.ts` — flat-number miniatures for the «Калькулятор» UI.
  Inputs: `CalcProfile`/`CalcEnemy` plain numbers. No Unit, no buffs, no engine context.
  Not a source of combat truth (§84.1 anti-fabrication).
- **Production chain** `src/core/combat/{DamageCalculator,BreakResolver,StatResolver}` —
  Unit+buffs, full stage set, game floor, rng rolls. The only authority for battle numbers.

Shared primitives (single source, both sides import them):
`levelMultiplier`, `BREAK_ELEM_MULT`, `rawDefMult` (DEF stage).

## Equivalence zones (what-if == production)

A what-if input maps onto a production unit with **empty buffs** and stage values inside
their linear (uncapped) ranges. Then:

| Stage | What-if | Production equivalent |
|---|---|---|
| DEF | `rawDefMult(a, d, 1 − defShred)` | `defMultiplier(a, d, target, defShred)` |
| RES | `1 − res` | `resFactor(target, …)` when `0 ≤ res ≤ 0.9` |
| Vulnerability | `1 + vuln` | `vulnMult(target, …)` when `0 ≤ vuln ≤ 2.5` |
| Broken | `broken ? 1 : 0.9` | `target.maxToughness > 0` branch |
| DMG Boost | `1 + dmgPct` | `dmgBoostMult` via one `dmg:<elem>` buff |
| Crit | `mid × (1 + cd)` | `dealDamage` with `forceCrit` (`critMult = 1 + eff.critDmg`) |
| No-crit hit | `mid` | `dealDamage` with `canCrit: false`, same `ctx.defIgnore ≡ defShred` |
| Break base | `BREAK_ELEM × lvlM × (0.5 + tough/40) × (1 + be)` | `computeBreakDamage` base term |
| Super Break | `(tough/10) × lvlM × abil × (1 + be) × def × res × vuln` | `BreakResolver.superBreak` with empty attacker/target buffs, no gear (ironCavPen 0, gearHitMods empty, finalDmgBoost 0) |

Production applies `Math.floor`; what-if `hitBreakdown`/`breakDamage` do not — equivalence is
`production == floor(what-if)`.

Pinned by `tests/invariants/calcs-contract.ts` (both match AND documented divergences).

## Documented divergences (by design, outside the zones)

- RES: production caps RES reduction at 90% (`resFactor`); what-if `1 − res` keeps falling.
- Vulnerability: production caps bonus at +250% (`vulnFactor`); what-if `1 + vuln` does not.
- Broken: production `1.0` when `maxToughness <= 0`; what-if always `0.9` when `broken=false`.
- What-if has **no** weaken / mitigation / finalDmgBoost / atkPctVsBroken / gear (ironCav,
  hitMods) stages — production does.
- What-if `expected` is the multiplicative expectation `mid × (1 + cr × cd)`; production uses
  rng rolls, not expectation.
- Super Break what-if has no `finalDmgBoost`, no defIgnore gear pen, no hitMods.

## Change rule

Any formula change touches both layers only with: (1) this contract updated, (2) the
equivalence suite updated, (3) full gates green. The what-if layer never feeds battle
simulations; the production chain never gets called from the calculator UI without a
Unit-shaped fixture.
