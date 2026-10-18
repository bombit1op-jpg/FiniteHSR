# FiniteHSR - Baseline Audit (Phase A1)

## Snapshot
- Date (local): 2026-10-18 16:43:52
- Directory: D:\.WORK\FiniteHSR
- Commit: 8e2626ca4357696e3faa36d5da99806ec6f079cf
- Package manager: npm (package-lock.json present), Node v24.15.0, npm 11.12.1

## git status --short (untracked only, nothing staged)
```
?? =
?? README.utf8.md
?? scripts/
?? sweep.ps1
?? tools/
```

## Actual npm scripts (from package.json)
```
dev, build, preview, check, lab (+ per-area lab:*), probe-eidolon,
test, ci, verify, verify:deviations
```

## Baseline gates (run at this commit, before any changes)

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | 
px tsc --noEmit | 0 | no type errors |
| 2 | 
pm test (tsx tests/index.ts) | 0 | **2951 cases, 0 failed** |
| 3 | 
px tsx tests/index.ts enemies | 0 | **933 cases, 0 failed** |
| 4 | 
px tsx tests/index.ts ui | 0 | **90 cases, 0 failed** |
| 5 | 
pm run lab (debug/lab/all.ts) | 0 | ALL LABS PASSED |
| 6 | 
pm run verify (src/verification/index.ts) | 0 | KIT ROSTER 93/93, ALL SPECS PASSED |
| 7 | 
pm run verify:deviations | 0 | TOTALS PASS 129, GAP 0, BLOCKED 0, FAIL 0, NO FAILURES |
| 8 | 
pm run check (src/core/check.ts) | 0 | 93 presets smoke-tested (93 kits) |
| 9 | 
pm run build (tsc --noEmit && vite build) | 0 | vite build ok |

## Data counts (raw, honest)
- hsr-data/characters.json: **98** character records (array).
- hsr-data/enemies.json: **379** enemy variant rows (250 base names per coverage).
- Implemented kits in verification roster: **93/93**.

## Notes / limitations
- No command failed in this baseline; all are genuinely re-run (not copied from TODO.md).
- Untracked files (=, README.utf8.md, scripts/, 	ools/, sweep.ps1) are local helpers and intentionally not committed.
- Next: Phase A2 (function matrix / module map) - read-only audit, no wide refactor.
## Phase A1-A2 observations (on-disk)

- **UI -> engine:** collect() in team.ts calls runBattle() without log; events length 0 in UI path, logLines preserved. settings.debugLevel not consumed by run path.
- **PreCombat:** src/core/battle/PreCombat.ts exports resolvePreCombat, EMPTY_PRECOMBAT, useCounts, switchSensitive.
- **results.ts:** uses sim.logLines (colorizeLog); no structured events read.
- **Event stream:** BattleLogger records BattleEvent[] gated by debug; tests use debug:5.
- **Capabilities:** 31 total (20 available, 10 partial, 1 unavailable). UI tests green (90/90).
- **fetch_all.py:** data fetcher, no image downloader/manifest writer for UI assets.
- **Baseline:** all gates green; no command failed.
