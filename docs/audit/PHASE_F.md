# FiniteHSR - Phase F: build recommendations via production APIs

Status: **IMPLEMENTED + VERIFIED** (19-10-2026). Spec: direct user statement, 19-10-2026
(F1 improve-one-build + F2 rank-replacement-candidates, production simulator as sole source of
truth, existing optimizer API, no invented synergy, honest incompleteness). The earlier
"BLOCKED: SPEC MISSING" record is superseded by this file.

## 1. API contract

Engine module `src/optimizer/recommend.ts`:

```ts
buildRecommendations(ctx, pool, opts?)        // F1: vary ONE slot's build, team fixed
replacementRecommendations(ctx, candidates, opts?)  // F2: rank replacement characters for ONE slot
```

Both return `RecommendationReport`:

```ts
{
  baselineLabel, baselineValues, baselineTotalDamage  // baseline = current Team Builder team
  rows: RecommendationRow[]   // rank asc by delta desc; infeasible last
  exhaustive                  // true iff every declared candidate was evaluated
  candidatesConsidered        // declared set size
  evaluated                   // actually simulated set size (<= candidatesConsidered via maxCandidates)
  warnings                    // dropped invalid builds, truncation, empty set — always visible in UI
}

RecommendationRow = {
  rank, label, build?, kitId, team   // team = other slots verbatim, target slot swapped
  metrics, values, constraints, feasible
  delta                              // values[primary] − baselineValues[primary]
  reason                             // verifiable sentence: delta vs baseline, or failed constraint
}
```

Contract points (each pinned by a test):

- **Single source of truth**: every row evaluated by `evaluateCandidate` on the same
  `EncounterSpec` + seed + log level via `configToSetup`; baseline independently recomputed
  through the same path. `core/calcs.ts` never used for results.
- **Fixed slots**: only the target slot's build (F1) or character (F2) varies; other members
  pass through verbatim (`recommend.ts` team mapping).
- **Validation**: per-build `validateBuild`; invalid builds dropped with a visible warning,
  never silently zero-filled or fabricated.
- **Determinism**: same inputs → identical rank/label/delta sequence (fixed seed, no RNG outside
  the engine's seeded stream).
- **Honesty**: `exhaustive=false` + "исследовано X из Y …не глобальный оптимум" warning when
  `maxCandidates` truncates; empty candidate set → explicit "нет допустимых кандидатов", zero rows.
- **Multi-run metrics** (`variance`, `consistency`): throw via `assertSingleRun` — no fabricated
  number for a single deterministic run.

## 2. UI contract

Existing page `src/ui/optimizerPage.ts` — no new route. Section "Рекомендации (фаза F)":

- inputs: slot (populated from Team Builder team), eidolons/cones/SI/relicSets/planarSets pool
  fields (F1), candidate kitIds (F2); encounter/seed/primary reuse the page's existing controls;
  maxCandidates reuses the existing field.
- pool is labelled explicitly as the allowed catalog (`CharacterPool`), not account inventory.
- output via exported `renderRecommendationReport(report, mount, primary)`: baseline kv,
  exhaustive/incomplete badge, warnings list, ranked table with feasible/pruned badges, delta,
  and reason. Render function is UI-only — no engine logic; tested independently.

## 3. Test coverage (§9 list)

`tests/golden/optimizer/recommend.ts` (13 cases) — F1 rows match an independent production-API
run of the same setup; fixed-slot invariant; invalid-cone pool drops the bad build with warning;
delta and baseline recomputed independently; deterministic ranking; empty F2 set; maxCandidates
truncation marks the report incomplete; multi-run metric throws; F2 fixed other slots +
deterministic; reasons are numeric/constraint sentences; infeasible rows rank last with the
failed constraint named; pool id must match the varied slot kitId.

`tests/ui/optimizer-recommend.ts` (9 cases, happy-dom) — ranked table rows, exhaustive pass
badge, zero warnings on clean exhaustive run, delta visible in variant cell, infeasible row
shows its constraint, feasible badge present, incomplete run shows honest fail badge + exact
"исследовано 3 из 8" warning, empty set renders explicit empty state with no ranked table.

## 4. Verified gates (19-10-2026)

`npx tsc --noEmit` 0 · `npm test` 3006/0 (was 2984 before F) · `npm run check` exit 0 ·
`npm run verify` ALL SPECS PASSED (93/93) · `npm run verify:deviations` NO FAILURES ·
`npm run lab` ALL LABS PASSED · `npm run build` OK (pre-existing chunk-size warning).

## 5. Honest limits (kept, not silently "fixed")

- F2 candidates use their pool-default build (no per-candidate relic search) — v1 scope per
  spec option "narrowed v1"; per-candidate build search would compose F1 inside F2 rows.
- Ranking = simulated metrics on the fixed encounter; cross-encounter generalisation is the
  separate `optimizer/encounter` surface, not mixed into the report metric (spec: never mix
  scenarios).
- `maxCandidates` truncation is deterministic (set order preserved), not importance-sampled —
  bounded search is marked incomplete rather than estimated.
