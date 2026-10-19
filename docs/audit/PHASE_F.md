# FiniteHSR - Phase F: build recommendations via production APIs

Status: **BLOCKED: SPEC MISSING** (19-10-2026). No algorithm implemented, no requirements invented.

## 1. Spec sources: opened vs missing

Opened:
- `AGENTS.md`, `TODO.md` (§84 pointers, audit tail), `docs/audit/*` (10 tracked files), `REPORT_A.md:62` (only F/H mention in repo), `MATRIX.md`, `UX_MAP.md`.
- All `src/ui/*`, `src/optimizer/*` (12 files), `src/analysis/*` (8 files) — code as its own evidence.
- Git: single branch `main`, no tags, no stash, `origin/main` fetched (1670 files) == local HEAD `69ab287`.

Missing (verified, not assumed):
- `docs/gui/traceability.md` (§84.17) — `.gitignore: docs/`; never committed (`git log --all -- docs/gui` empty); absent on `origin/main`; absent locally (`Test-Path = False`).
- guide §84 (TODO: `reference/total_guide.txt` lines 6343-6900) — local file = 6331 lines, ends pre-§84; `reference/` untracked, never in git history.
- `docs/audit/PHASE_F.md` / `PHASE_H.md` — did not exist (this file = F record).
- No `D:\` drive on this machine (source machine paths unavailable).

Conclusion: only F artifact in repo = REPORT_A phrase. Acceptance criteria for "build recommendations" unknowable from repo.

## 2. Functionality map (what exists today)

### Recommendation-like, wired to UI (true ranking via production APIs)
| Surface | UI | Production API |
|---|---|---|
| Optimizer search candidates | `src/ui/optimizerPage.ts:23-27` | `optimizer/search:evaluateSpace/rank/bruteForce`, `beam:beamSearch`, `mc:mcReport`, `joint:jointReport` |
| Cross-encounter team ranking | `optimizerPage.ts:27` | `optimizer/encounter:teamRankTable` (`rankAcrossEncounters`) |
| Kit compatibility scoring | `src/ui/profiles.ts:12-15` | `analysis/team:scoreKits/predictCompatibility/pairInteraction`, `analysis/causal`, `analysis/profile`, `analysis/probe` |
| Team delta comparison | `src/ui/compare.ts:8` | `analysis/compare:compareTeams` |

### Production APIs with NO UI surface (tested by `tests/golden/optimizer/*`)
- `optimizer/ablation.ts` — `teamAblation`, `replacementMatrix` (closest thing to "team member recommendations"); capability registry honestly marks `optimize.ablation = partial` (`capabilities.ts:176`).
- `optimizer/exact.ts`, `optimizer/calibration.ts`, `optimizer/pipeline.ts`, `optimizer/sample.ts`, `optimizer/score.ts`.

### Display/edit only, NOT recommendations
- `buildEditor.ts` — edits `BuildSpec`; validation/compilation delegate to `core/build:validateBuild/resolveBuild`; static dropdowns from `core/gear` (LIGHT_CONES/RELIC_SETS/PLANAR_SETS) + `core/kits`.
- `catalog.ts`, `dashboard.ts`, `enemy.ts` (static enemy presets), `runAnalysis.ts` (post-run metrics via `analysis/*`).

### Data available for any future recommendation feature
- Characters: `core/kits` (KITS), raw `hsr-data/data/characters.json`.
- Light Cones / Relics: `core/gear` (LIGHT_CONES, RELIC_SETS, PLANAR_SETS, aggregateGear), raw `hsr-data/data/lightcones.json`.
- Build validation: `core/build` (BuildSpec, validateBuild, resolveBuild).
- Search space / objectives: `optimizer/space.ts` (CharacterPool, memberBuilds, teamCandidates, Objective+constraints).
- Scoring / exactness: `optimizer/search`, `optimizer/score`, `optimizer/exact` (exact simulator = authority per guide).

### The feature itself
No "build recommendation" implementation exists anywhere: no UI term match (`recommend|suggest|Рекомен|Предл|подбор|Совет|лучш` over `src/ui` = only optimizer ranking rows), no API with recommendation contract in `src/optimizer` or `src/analysis`.

## 3. Status
- `F = BLOCKED: SPEC MISSING`.
- Not done on purpose: no algorithm, no UI, no static-preset substitution presented as recommendations (would violate §84.1 anti-fabrication as paraphrased in TODO:1555).

## 4. Unblock requires
- `docs/gui/traceability.md` (§84.17 rows for recommendations), or
- guide §84 lines 6343-6900 from source machine, or
- direct statement of: which surface (build editor suggestion vs optimizer page vs new route), which API is authoritative (`rank` vs `replacementMatrix` vs `exact`), input/output contract, and acceptance test.
