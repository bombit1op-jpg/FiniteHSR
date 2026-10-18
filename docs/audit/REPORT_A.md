# FiniteHSR - Audit Report (Phase A: evidence-based audit + baseline)

## Snapshot
- Date: 2026-10-18 17:06:01
- Working dir: D:\.WORK\FiniteHSR
- Git commit: 8e2626ca4357696e3faa36d5da99806ec6f079cf
- Branch: main
- Remote: origin	https://github.com/bombit1op-jpg/FiniteHSR.git (fetch)
- Node: v24.15.0, npm 11.12.1

## A1: Baseline (all re-run)
| Command | Exit | Result |
|---|---------|------|--------|
| npx tsc --noEmit | 0 | no errors |
| npm test | 0 | 2951 cases, 0 failed |
| npx tsx tests/index.ts enemies | 0 | 933 cases, 0 failed |
| npx tsx tests/index.ts ui | 0 | 90 cases, 0 failed |
| npm run lab | 0 | ALL LABS PASSED |
| npm run verify | 0 | KIT ROSTER 93/93, ALL SPECS PASSED |
| npm run verify:deviations | 0 | TOTALS PASS 129, GAP 0, BLOCKED 0, FAIL 0, NO FAILURES |
| npm run check | 0 | 93 presets smoke-tested (93 kits) |
| npm run build | 0 | vite build ok |

## A2: Module map / function matrix
- BASELINE.md: docs/audit/BASELINE.md (evidence)
- MATRIX.md: docs/audit/MATRIX.md (statuses: VERIFIED/PARTIAL/MISSING/BROKEN/UNKNOWN/BLOCKED)

Key findings:
- UI runs without log: collect() -> runBattle() has no log; sim.events empty in UI path, sim.logLines populated. settings.debugLevel not consumed by run path.
- results.ts reads only sim.logLines (colorizeLog); BattleLogger.events exists and gated by debug, but not consumed by UI results.
- PreCombat exports: resolvePreCombat, EMPTY_PRECOMBAT, useCounts, switchSensitive (core implemented; UI technique pre-combat surface limited).
- buildEditor has single global traces checkbox (cur.traces); no per-node traces UI found. build/battle support traces per-team-row.
- Capability registry: 31 total (20 available, 10 partial, 1 unavailable). UI tests (90/90) green (capabilities/dom-render/format/specs/store).
- deviations.ts: only FAIL increments failed counter; process.exit(failed?1:0) at line 90; returns 0 on PASS/GAP/BLOCKED/PROMOTE (confirmed exit 0).
- fetch_all.py: data fetcher (Fandom + nanoka), writes JSON/txt under hsr-data; not an image downloader/manifest writer for UI assets. No UI image assets in hsr-data, no asset manifest for UI committed.

## A3: Hypotheses verified
| Item | Status | Evidence |
|---|---|---|
| results.ts: colorizeLog(sim.logLines) | PARTIAL | Line 11,76; no structured events consumed. |
| buildEditor.ts single traces checkbox | PARTIAL | tracesChk at 57-100; global only; no per-node traces UI. |
| PreCombat: useCounts, switchSensitive, repeat limits/conflicts/zone replacement | PARTIAL | Core implemented (PreCombat.ts); UI wiring limited to BattleSetup.techniques. |
| hsr-data/fetch_all.py | VERIFIED | Data fetcher only (not image loader/manifest for UI). |
| src/verification/deviations.ts (GAP/BLOCKED non-fatal) | VERIFIED | Non-fatal except FAIL; confirmed exit 0. |
| TODO.md historical vs fresh dates | PARTIAL | Historical dates present; fresh baseline captured in this audit. |

## Assets / provenance / docs
- No UI image assets committed (outside reference tree).
- fetch_all.py does not produce UI asset manifest/provenance.
- total_guide.txt present (ends §84.19; §86 not present as separate top heading in this copy).
- traceability.md present (docs/gui/traceability.md).

## Deviations
- None introduced. Existing: deviations.ts shows PASS 129, GAP 0, BLOCKED 0, FAIL 0, NO FAILURES.

## Completion
- Phase A (evidence-based audit + baseline) complete. Artifacts:
  - docs/audit/BASELINE.md (git SHA, script list, gates, data counts, observations)
  - docs/audit/MATRIX.md (function matrix with statuses, evidence)
- All required gates green on fresh run (tsc 0, tests 2951/0, enemies 933/0, ui 90/0, lab all passed, verify/deviations/check/build 0).

Next: Phase B–I per brief (UX, pre-combat techniques, 50% start energy, per-node traces UI check, structured action log from typed events, image downloader+manifest+provenance, build recommendations via production APIs, calculators dedup, Diagnostics screen). No broad changes before audit exists — audit exists.