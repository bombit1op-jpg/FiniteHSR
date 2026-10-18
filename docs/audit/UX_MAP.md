# FiniteHSR - UX Map (Phase B)

## Routes (shell.ts:47-80)
- WORKSPACE: dashboard, , , , , , , , 
- ANALYSIS: analysis (analysis.run), compare (analysis.compare), profiles (analysis.profile), optimizer (optimize.search)
- ENGINEERING: verification (verification.specs), catalog, deviations (known.deviations)
- SETTINGS: settings

ROUTES=18, DEFAULT_ROUTE=dashboard. Panel IDs = panel-<id> (panelOf).

## Capability mapping (capabilities.ts)
- Non-available shown with badge (~=partial, !=unavailable) + full reason in .cap-notice.
- Available: build.editor, build.apply, team.editor, encounter.editor, validate, spec.io, battle.run/manual, rules.snapshot, checks.formulas, gear.coverage, determinism.check, analysis.run/compare/damage/causal/profile/teamValue/audit, capabilities grouped.
- Partial (10): replay.build, verification.specs, analysis.probe, optimize.search/beam/joint/mc/calibrate/encounter/ablation.
- Unavailable (1): sweep.workers.

## Status surface (shell.ts:130-190)
- showStatus(msg, kind=info/loading/error), clearStatus(), withBusy(label, fn) adds .busy, shows loading, clears on success or sets error, always restores .busy.

## Version bar (shell.ts:193-250)
- 3 chips: engine/rules/data from verification/meta/rules (ENGINE_VERSION, RULES_VERSION, DATASET_VERSION). Visible always.

## Route activation
- activate(id) sets active nav + active panel; renderCapabilityNotice removes or creates .cap-notice; runs enter hook (ENTER_HOOKS or route.enter).

## vs traceability.md (docs/gui/traceability.md)
- Route→module/init table exists (G0). Shell section 84.3 present. Traceability matrix covers many 84.17 items but not all routes fully expanded.

## Findings (84.1/84.3 compliance)
- Honesty: non-available → badge + notice (no stub). Browser-viable distinction in capabilities.ts (partial/unavailable).
- No engine duplication in shell (UI-only).
- No fake metrics; only status surface for missing backend.

## Gaps for Phases C–I
- C: pre-combat technique selection UI not visible in current routes? team/build/battle encoders — need to check 84.6.1.
- D: per-node traces UI — buildEditor has single global traces checkbox only.
- E: results.ts uses logLines only; no structured events feed (but event count visible in dashboard/analysis). Main issue: UI runs without log config.
- G: asset manifest/provenance missing (fetch_all.py no image download).
- I: Diagnostics screen — not in ROUTES; 'deviations' exists but separate from per-run Diagnostics.

Routes missing obvious Diagnostics screen: 84.15 mentions Diagnostics; current ROUTES have 'deviations' (ENGINEERING) — may need dedicated Diagnostics (I) or extend.