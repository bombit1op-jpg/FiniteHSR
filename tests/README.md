# tests/

Engine-level test corpus for FiniteHSR (§44 of `reference/total_guide.txt`).

Run: `npm test`. Type-check: `npx tsc --noEmit -p tsconfig.json` (tsconfig includes `tests`).

## Layout

```
tests/
  _helpers/      shared harness: battle.ts (run/chk/raw/name/all, re-exports Node/Ctx)
  invariants/    universal engine laws — must hold for every kit
  regression/    shared-engine behaviour that already broke once
  property/      invariants over many random seeded battles
  verification/  bridge to the `npm run verify` spec corpus (one case per spec requirement)
  golden/        category goldens — hand-written fixtures per mechanic family
  scenarios/     minimal / interactions / endgame / adversarial scripted runs
  replays/       determinism / event+state hash / RulesSnapshot round-trip
```

`suites.ts` discovers every category listed in `CATEGORIES`; a category directory that does not
exist is loud (stderr warning), not skipped silently. Each `*.ts` file default-exports `() => Case[]`
(async allowed).

## What is here today (2274 cases, all green)

- `invariants/` — `engine-invariants.ts` (bridge to `src/core/check.ts`, 1/1), `formula-caps.ts`
  (wiki damage caps, 13/13), `per-event.ts` (`LogConfig.verifyPerEvent` watcher laws + trace parity, 8/8).
- `regression/` (26 files) — `damage-chain` (38), `reaction` (19), `availability` (16), `scheduled` (14),
  `hp-change` (12), `state-clauses` (11) / `targetOverride` (13), `accumulator` (10),
  `engine-invariants` (`attackNo`/`attackAct` identity + `charTurn` law + noSeq rider doesn't split the parent attack, 15), `stableIds` (8),
  `state-matcher` (6), `trace-matcher` / `trigger-window` (5 each), `coverage-fixture` (8),
  `line-buffer` (9), `sweep-fanout` (24), plus `action-deferral`, `assist-skill`, `dot-edge-cases`,
  `enemy-attack-seq`, `enemy-counter`, `heal-anti`, `march7th-technique`, `owner-elem`, `ponytail-parity`
  and `summon-lifecycle`.
- `property/random-battles.ts` — 48 cases: 12 seeded random 4-kit teams vs random enemy groups; no
  NaN, `hp/energy/toughness >= 0`, strictly increasing event ids.
- `verification/corpus.ts` — 235 cases; spawns `src/verification/index.ts` and turns each spec
  requirement verdict into a case, so `npm test` and `npm run verify` cannot drift apart.
- `replays/replay.ts` — 12 cases: restart determinism, event/state hash stability, `RulesSnapshot`
  round-trip + divergence by seed (see `src/verification/meta/rules.ts`).
- `golden/` — 26 mechanic families (72 files): `damage, timeline, energy, sp, buffs, debuffs, fua, break, dot,
   shields, summons, death, targeting, gear, eidolons, teams, enemies, special-resources, hp-changes,
   reactions, countdowns, transformations, marks, techniques, additional-dmg, optimizer`.
  `additional-dmg` (PHASE 5) pins Additional DMG as an inline `add` DAMAGE_DEALT inside the parent
  attack — separate damage number, `attackType:'add'`, resolved after the parent's damage, never a
  scheduled action, deterministic for a fixed seed (guide's old ActionQueue "sub-action ordering"
  discrepancy no longer applies). Two extra cases (TODO L181) pin the once-per-attack rider law: a
  rider that carries `noSeq` (Serval Talent) fires once per attack, not per hit/target, so its adds
  form at most one block per action.
  `gear` has eight files: `basic` (cone on/off), `buildspec` (declarative `BuildSpec` == explicit
  `GearConfig`; see `src/core/build.ts`), `deltas` (one-item swap → known ATK/damage delta),
  `cone-hooks` + `set-hooks` (gear-hook wiring), `cone-passive` (all-cone structural + condition/SI/stack levels, guide §19.3), `relic-gen`
  (allocator roll rules across all 93 kits: slots, mains, budget, desired-roll placement, 2pc/4pc
  activation, guide §34.1) and `coverage` (generic sweep of every cone/set + the verified/partial/
  unverified/blocked equipment registry; see `src/verification/gearCoverage.ts`).
  `teams` has thirteen files: `minimal` (buffer→carry, 2-kit), `trio` (two supporters stack on one carry,
  3-kit), `ablation` (turn one stat/member off → delta), `attribution` (owner-id damage fold +
  axis partition), `encounter` (declarative `EncounterSpec` == explicit waves/cycles; see
  `src/core/encounter.ts`), `archetypes` (one real synergy per archetype — Acheron/debuff, FUA,
  Break, DoT, summon, HP-consumption, special-resource Ult, Elation — asserting the defining
  event/axis bucket, guide §33.3), `audit` (guide §35 team audit over a geared recommended team; see
  `src/analysis/audit.ts`), `compare` (guide §77 team comparison report + winner/why, self-compare
  invariant; see `src/analysis/compare.ts`), `analysis`, `causal`, `probe`, `profile`, `team`.
  `enemies` has sixteen files: `model` (guide §51/§52 enemy data model — 379 raw rows → 250 definitions +
  variants, explicit-undefined stats, multi-bar/phase toughness parsing, resistance profile,
  `getEnemyStat` level resolution; see `src/core/enemy/`), `abilities` (§53 enemy ability defs run
  through the shared damage/loss pipeline), `phase` (§54/§56 AI patterns + PhaseController,
  PHASE_START/END), `defense` (§57/§58 data-driven defense/link profile — invulnerable/partial/
  shield/redirect/redistribute + immunity gates), `encounter` (§59 `EncounterSpec`/`RulesSnapshot`),
  `verification` (guide §63 four-layer enemy verification over the real catalog — data/ability/
  pattern/encounter, 26/26), plus the profile sweep (`boss-profile`, `mob-profiles`,
  `profile-aurumaton`, `profile-daybreak`, `profile-elites`, `profile-savage-god`), `ops`
  (§53 ability-operator audit) and `control`/`flee` (control application + flee/retreat).
  `targeting` has two files: `basic` (enemy picks a live ally, AoE lists its units) and `resolver`
  (guide §62 `TargetResolver` — priority pipeline geometry/forced/marked/locked/HP/weighted-aggro,
  one-roll contract, and the golden-safe `TARGET_SELECTED` payload; see `src/core/combat/TargetResolver.ts`).
- `scenarios/` — `minimal/basic`, `interactions/basic`, `endgame/basic`, `endgame/score` (§60
  per-mode ScoreResolver), `endgame/transitions` (§61 wave/encounter transition events),
  `endgame/toughness-bars` (multi-bar/partial-toughness behaviour),
  `endgame/combination` (§64 canonical combinations — charge/multi-phase/multi-bar/linked-adds/
  redistribute/immunity-window/mode-variant/wave-transition), `adversarial/mechanics`
  (5/5/6/21/16/10/26). `adversarial/` pins the cross-cutting laws for the five
  non-standard families (transforms/FUA/counters/summons/countdowns) run to completion: id-stable
  identity, single owner damage account, reactions never landing on a dead target or retriggering
  themselves, no orphan spawned entity. New categories must be listed in `suites.ts::CATEGORIES`.

Watch out: a golden suite must run battles through `_helpers/battle.ts::run` (`log: { debug: 5 }`,
`cycles 4`, `seed 7`), or the logger drops the events (`LogConfig.debug` defaults to 0).

## What is deliberately NOT here

Kit-level canon regressions live as blocks in `src/core/debug-kits.ts` (Acheron ladder, Cyrene ×100,
Moze dedupe, Misha A3, …) — duplicating them here would create a second place to update.
`verification/characters/*.json` specs and `verification/golden/*.log` traces are the per-kit canon
payload and are driven by `npm run verify` (bridged into `npm test` via `verification/corpus.ts`).

## Command scope and time

| command | scope | time |
|---|---|---|
| `npm test` | `tests/` corpus (incl. verification bridge) | ~8 s |
| `npm run check` | `src/core/check.ts` | ~1 s |
| `npm run verify` | `verification/characters` specs | ~3 s |
| `npx tsx src/core/debug-kits.ts` | 93 kits, canon blocks | ~4 s |
