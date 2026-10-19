# FiniteHSR - Phase H: calculators dedup

Status: **[~] inventory done (19-10-2026); merge BLOCKED: SPEC MISSING + no equivalence proof. Zero code changed.**

Brief `REPORT_A.md:62` is the only F/H mention; no PHASE_H spec existed. Per brief §3-4: no semantic merge without spec + tests.

## 1. Calculator inventory

| # | Implementation | Inputs | Units | Formula / order | Stages | Weaken / Mit | Tests | Callers |
|---|---|---|---|---|---|---|---|---|
| C1 | `core/calcs.ts:hitBreakdown(p,e,mult)` | plain numbers (`CalcProfile`, `CalcEnemy`) | un-floored damage number | `base=atk*(1+atkPct)*mult; ×boost(1+dmgPct) ×defM ×resM(1-res) ×vulnM(1+vuln) ×brokenM(0.9/1)`; crit: `mid*(1+cd)`, expected `mid*(1+cr*cd)` with cr clamped 0..1 | base, DMG boost, DEF (`rawDefMult`), RES, Vuln, broken, crit | **no weaken, no mitigation, no finalM** | `core/check.ts:668-676` (pins simplified expectations) | `src/ui/calcs.ts` (renderHit, grid via `statGrid`) |
| C2 | `core/calcs.ts:superBreakHit(p,e,tough,abil)` | plain numbers | floored (`Math.floor`) | `(tough/10)×lvlM×abil×(1+be)×rawDefMult×(1-res)×(1+vuln)` | partial break chain (no mit/broken/final/gear/ironCav) | no | `check.ts:707-710` | `ui/calcs.ts:196` |
| C3 | `core/calcs.ts:breakDamage(elem,lvl,maxTough,be)` | plain numbers | un-floored | `BREAK_ELEM_MULT×lvlM×(0.5+maxTough/40)×(1+be)` — **base only, no def/res/vuln** | base+BE | no | none (only via UI) | `ui/calcs.ts:197` |
| P1 | `core/combat/DamageCalculator.ts:dealDamage` | `DmgContext` + `Unit`s + rng | floored integer | `base×crit×boost×weaken×def×res×vuln×mit×broken×final` | full chain | yes (`weakenM`, `mitM`) | `check.ts` damage block | `combat/DamagePipeline.hit` |
| P2 | `DamageCalculator:computeBreakDamage` | Units, `kind:'break'|'debuff'` | floored | `BREAK_ELEM×lvlM×(0.5+maxTough/40)×(1+be)×(1+breakInc)×def×res×vuln×mit×broken×final` | full | yes | `check.ts:45-71,114` | `BreakResolver`, `TurnManager.tickDots` (via computeDotDamage) |
| P3 | `combat/BreakResolver:superBreak` | Units | floored | `(tough/10)×lvlM×abil×(1+be)×stdMultipliers(elem,'break')×(1+finalDmgBoost)` + ironCav defIgnore + gear hit mods (temp buffs) | full + gear | yes (inside stdMultipliers) | engine regression corpus | `simulator:570` delegate, kits via `sim.superBreak` |
| P4 | `combat/StatResolver:rawDefMult/defMultiplier/resFactor/vulnMult/mitigationMult/resGain-like` | levels / Units+buffs | multiplier 0..n | shared stage helpers | single stage each | — | `check.ts:660-666` | C1/C2/P1/P2/P3 + `TurnManager` Entanglement composition |
| L1-L4 | `core/levelmult.ts`, `core/stats.ts`, `core/damage.ts`, `core/types.ts` | legacy copies of P4/C3 | — | `levelMultiplier`/`rawDefMult`/break base duplicated | — | — | none | **dead: `git grep` finds no importer**; `.gitignore: src/` → untracked local leftovers |

Also noted (not dedup targets):
- `TurnManager:238-243` (DoT base per kind) and `:284-300` (Entanglement): reuse P4 stage helpers; `0.5+maxTough/40` inline; Entanglement composition is a documented, comment-cited deliberate deviation (`docs/combat_mechanics/Toughness.md:84`).
- `core/check.ts:54,71,114`: expected values re-derive formulas inline — tests, by design.
- UI layer: `src/ui/calcs.ts` contains **no math of its own** — every number comes from C1-C3/P4 (import lines 4-9). No UI duplicate.

## 2. Duplication verdict

1. C1-C3 vs P1-P3: same names, **different contracts** (plain what-if numbers vs stateful Units+buffs) and **different stage sets** (C-chain omits weaken/mit/final/gear; C3 omits everything past base). Not semantic duplicates; merging changes displayed numbers on «Калькулятор» route and would require Unit scaffolding for a what-if tool.
2. `core/calcs.ts` = what-if calculator, NOT universal truth source — evidence: input shape, no floor in C1/C3, simplified stages, `check.ts` pins the simplified forms, UI hint text states the simplified formula (`ui/calcs.ts:203`).
3. Real byte-level duplicates are all in **dead, gitignored L1-L4** (no tracked importer) — report-only per AGENTS §3.
4. `0.5 + maxTough/40` inline x4 in tracked code = one-line arithmetic; extracting a helper is cosmetic churn (ponytail/YAGNI).

## 3. Actions taken / not taken
- Taken: inventory + spec search + this record; TODO updated.
- NOT taken (per brief §3-4): no merge, no wrapper, no formula/order/rounding/units change, no mass call replacement. Reason: no spec, no equivalence tests proving C-chain ≡ P-chain (they are NOT equivalent — deliberate), and any "safe" merge candidates were either dead files or cosmetic.
- Dead legacy files: reported, not deleted (AGENTS: mention, don't delete).

## 4. Unblock conditions for actual dedup
- Spec statement of intended contract (what-if vs production) for `core/calcs.ts`, OR explicit instruction to keep both;
- If merge wanted: agreed common contract + backward-compat wrappers + equivalence tests for the stages that must match (DEF via P4 already shared) + proof UI numbers unchanged or changed intentionally;
- Deleting L1-L4: confirmation they are not needed on the source machine (they are untracked — deletion is unrecoverable).
