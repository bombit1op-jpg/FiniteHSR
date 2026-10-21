# §84 GUI — Traceability Matrix (§84.17)

**Status of this document:** G0 deliverable. Every GUI surface listed here must be traceable to
a real backend entrypoint. Per §84.1 the UI is presentation/orchestration only — it may not
re-implement damage/timeline/targeting/resource/enemy-AI/buff/trigger logic, may not treat the
browser view as the source of truth for `BattleState`, and must not fabricate any number.

Status codes (mirror `src/ui/capabilities.ts`):

- **available** — callable in the browser bundle as-is
- **partial** — callable but bounded (node-only IO, or long-running → run a slice)
- **unavailable** — not viable in the browser; show status + reason, no stub

Last audited: G1–G5 phase (all workspaces wired into `src/main.ts`). Runtime registry: `src/ui/capabilities.ts` (`CAPABILITIES`).
Keep the two in sync; `capabilityStatus(id)` is the single source the shell renders.

Route → module wiring (all registered in `src/main.ts`):

| Route | Module | init / enter |
|---|---|---|
| `player` | `index.html#panel-player` (hosts relocated `team`/`build`/`gear`/`encounter`/`battle`/`results` editors) | shell default; editors self-init |
| `dashboard` | `src/ui/dashboard.ts` | `initDashboard` / re-init |
| `build` | `src/ui/buildEditor.ts` | `initBuildEditor` |
| `encounter` | `src/ui/encounterEditor.ts` | `initEncounterEditor` |
| `analysis` | `src/ui/runAnalysis.ts` | `initRunAnalysis` / `renderRunAnalysis` |
| `compare` | `src/ui/compare.ts` | `initCompare` / `renderCompare` |
| `profiles` | `src/ui/profiles.ts` | `initProfiles` / `renderProfiles` |
| `optimizer` | `src/ui/optimizerPage.ts` | `initOptimizer` / `renderOptimizer` |
| `verification` | `src/ui/verificationPage.ts` | `initVerification` / `renderVerification` |
| `catalog` | `src/ui/catalog.ts` | `initCatalog` / `renderCatalog` |
| `deviations` | `src/ui/deviations.ts` | `initDeviations` / `renderDeviations` |
| `diagnostics` | `src/ui/diagnostics.ts` | `initDiagnostics` / `renderDiagnostics` |
| `settings` | `src/ui/settings.ts` | `initSettings` / `renderSettings` |

---

## 84.3 Shell / navigation

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Hash routing + nav rail | none (UI-only) | — | — |
| Loading / error surface | none (UI-only) | — | — |
| Reproducibility banner (engine/rules/dataset versions) | `src/verification/meta/rules.ts:ENGINE_VERSION,RULES_VERSION,DATASET_VERSION` | `rules.snapshot` | available |

## 84.4 Dashboard

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Recent run summary | `src/analysis/run.ts:analyzeRun` | `analysis.run` | available |
| Capability overview | `src/ui/capabilities.ts:CAPABILITIES` | — | — |

## 84.5 Character catalog + Build Editor

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Build editor (cone/relic/planar/eidolon/levels/stats) | `src/core/build.ts:BuildSpec` | `build.editor` | available |
| Validate build ids | `src/core/build.ts:validateBuild` | `build.editor` | available |
| Compile build → runtime gear/TeamSpec | `src/core/build.ts:resolveBuild`, `src/core/build.ts:applyBuild` | `build.apply` | available |
| Gear catalogs (cones/sets/mains/substats) | `src/core/gear.ts:LIGHT_CONES,RELIC_SETS,PLANAR_SETS,SLOT_MAINS,SUBSTAT_TIERS` | — | — |

## 84.6 Team Builder

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Team rows → `TeamSpec[]` | `src/core/battle.ts:TeamSpec` | `team.editor` | available |
| Recommended team preset | `src/core/battle.ts:presetTeam` | `team.editor` | available |
| Compile members → runnable setup | `src/optimizer/space.ts:toBattleSetup,configToSetup` | `spec.io` | available |

## 84.7 Enemy catalog + Encounter Editor

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Encounter editor (waves/cycles/effects/rules) | `src/core/encounter.ts:EncounterSpec` | `encounter.editor` | available |
| Compile encounter → setup fields | `src/core/encounter.ts:resolveEncounter` | `encounter.editor` | available |
| Validate encounter structure | `src/core/encounter.ts:validateEncounter` | `encounter.validate` | available |
| Enemy presets | `src/core/battle.ts:ENEMY_PRESETS,ENCOUNTER_PRESETS` | — | — |

## 84.8 Simulator workspace

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Auto battle | `src/core/battle.ts:runBattle` | `battle.run` | available |
| Step battle (manual IO) | `src/core/battle.ts:runBattleManual` | `battle.manual` | available |
| Rules snapshot digest | `src/verification/meta/rules.ts:rulesSnapshot,rulesHash` | `rules.snapshot` | available |
| Replay artifact build | `src/verification/meta/replay.ts:makeReplay` | `replay.build` | partial (fs IO → JSON export) |
| Mass sweep | `src/core/sweep-worker.ts` | `sweep.workers` | unavailable (node workers) |

## 84.9 Run Analysis + Damage Inspector

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Run analysis | `src/analysis/run.ts:analyzeRun` | `analysis.run` | available |
| Damage breakdown | `src/analysis/compare.ts:buildDamageBreakdown` | `analysis.compare` | available |
| Per-source attribution | `src/analysis/attribution.ts:attributeDamage` | `analysis.damage` | available |
| Formula self-check | `src/core/check.ts:runChecks` | `checks.formulas` | available |

## 84.10 Team Comparison

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| A/B team compare | `src/analysis/compare.ts:compareTeams` | `analysis.compare` | available |

## 84.11 Team Profiling / Compatibility / Valuation

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Behavior profile | `src/analysis/profile.ts:behaviorProfile` | `analysis.profile` | available |
| Need/Provide/Conflict | `src/analysis/causal.ts:causalProbe,needProfile,provideProfile,conflictProfile` | `analysis.causal` | available |
| Kit scoring / Shapley / compatibility | `src/analysis/team.ts:scoreKits,shapleyValue,predictCompatibility` | `analysis.teamValue` | available |
| Team audit | `src/analysis/audit.ts:auditTeam` | `analysis.audit` | available |
| Character probe | `src/analysis/probe.ts:probeCharacter,runProbe` | `analysis.probe` | partial (bounded) |

## 84.13 Sweep / batch workspace

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Sweep (worker threads, CSV/artifact IO) | `src/core/sweep-worker.ts`, `src/core/sweep-battle.ts` | `sweep.workers` | unavailable (browser) — status + reason shown |
| Per-run debug level / logging cost hint | `src/core/battle.ts:BattleSetup.log` (`LogConfig`) | `rules.snapshot` | available (shown pre-run) |
| Open a swept run in Run Analysis | `src/ui/runAnalysis.ts` + `store.history` | `analysis.run` | available |

## 84.14 Verification / coverage workspace

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Gear coverage registry + report | `src/verification/gearCoverage.ts:gearRegistry,gearCoverageReport` | `gear.coverage` | available |
| Determinism check (re-run → compare hashes) | `src/core/battle.ts:runBattle` + `logger.eventHash()/hash()` | `determinism.check` | available |
| Verification specs / golden runners | `src/verification/GoldenRunner.ts:runFixture` (disk fixtures) | `verification.specs` | partial (CLI only) |
| Capability status table | `src/ui/capabilities.ts:CAPABILITIES` | — | — |

## 84.15 Catalog / Deviations / Settings

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Data catalog (kits/cones/sets/presets) | `src/core/kits/index.ts:KITS`, `src/core/gear.ts`, `src/core/battle.ts:ENCOUNTER_PRESETS,ENEMY_PRESETS` | — | — |
| Known deviations (browser view) | `TODO.md` via `?raw` + `src/verification/deviations.ts` (CLI gate) | `known.deviations` | available (view); CLI gate is node-only |
| Settings (seed/debug defaults) | `localStorage` (UI-only); effective values re-shown per run | — | — |

## 84.12+ Optimization workspace

| Feature | Backend | Capability id | Status |
|---|---|---|---|
| Exhaustive search | `src/optimizer/search.ts:evaluateSpace,bruteForce` | `optimize.search` | partial (bounded) |
| Beam search | `src/optimizer/beam.ts:beamSearch` | `optimize.beam` | partial (bounded) |
| Joint team search | `src/optimizer/joint.ts:jointTeamSearch` | `optimize.joint` | partial (bounded) |
| MC-assisted search | `src/optimizer/mc.ts:mcAssistedSearch` | `optimize.mc` | partial (bounded) |
| Calibration | `src/optimizer/calibration.ts:calibrate` | `optimize.calibrate` | partial (offline/bounded) |
| Cross-encounter ranking | `src/optimizer/encounter.ts:rankAcrossEncounters` | `optimize.encounter` | partial (bounded) |
| Ablation / replacement | `src/optimizer/ablation.ts:teamAblation,replacementMatrix` | `optimize.ablation` | partial (bounded) |

---

## Reproducibility (84.1)

Every run/optimize artifact must be traceable to: `BattleSetup` (canonical config), `seed`,
`RulesSnapshot` (`src/core/battle/BattleRules.ts:buildRulesSnapshot` + verification meta
`rulesSnapshot`), and version constants. Event/state hashes: `src/verification/meta/hash.ts`.

## Rules for new GUI surfaces

1. Add a `Capability` entry in `src/ui/capabilities.ts` and a row here **before** wiring the view.
2. If `status !== 'available'`, the view shows the reason — no front-end stub, no placeholder value.
3. Bind only to canonical types (`BuildSpec`, `TeamSpec`, `EncounterSpec`, `RulesSnapshot`,
   `ReplayArtifact`, `RunAnalysis`, …) — never an ad-hoc object.
