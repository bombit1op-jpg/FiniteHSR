# FiniteHSR - Function Matrix (Phase A2)

Based on §84.17 traceability + actual code. Statuses: VERIFIED, PARTIAL, MISSING, BROKEN, UNKNOWN, BLOCKED.

Last updated: 2026-10-18 17:00:52 (commit 8e2626c)

## UI → Engine (confirmed)
| Path | Symbol | Status | Notes |
|---|---|---|---|
| main.ts -> collect() -> runBattle() | collect (team.ts:473), runBattle (battle.ts:458) | VERIFIED | UI does not pass log; events array empty in UI runs. |
| Results rendering | colorizeLog(sim.logLines) (results.ts) | VERIFIED | Uses logLines only; no structured events read. |
| Build editor traces | tracesChk + cur.traces (buildEditor.ts:57-100) | VERIFIED | Stored on build rows; default true. |
| Simulator state | sim.logLines vs sim.logger.events | VERIFIED | logger.events gated by debug>=gate (BattleLogger). Tests use debug:5. |
| PreCombat | resolvePreCombat/useCounts/switchSensitive (PreCombat.ts) | VERIFIED | Implemented; UI surface for technique pre-combat selection limited. |

## Structured events / diagnostics
| Feature | Location | Status | Notes |
|---|---|---|---|
| BattleLogger events[] | src/core/battlelog.ts | VERIFIED | Full BattleEvent[] with eventId/time/turn/actionId/traceId/type/ids/payload; MIN_DEBUG gates emission. |
| dashboard reads events.length | src/ui/dashboard.ts:75 | VERIFIED | |
| runAnalysis filters DAMAGE_EVENTS | src/ui/runAnalysis.ts:39 | VERIFIED | |
| settings.debugLevel exists | src/ui/settings.ts | VERIFIED | Not consumed by run path (UI runs without log). |
| deviation gate logic | src/verification/deviations.ts:38,90 | VERIFIED | Only FAIL -> failed++; exits 0 on PASS/GAP/BLOCKED/PROMOTE. |

## Capabilities/GUI tests
| Area | Files | Status | Notes |
|---|---|---|---|
| Capability registry | src/ui/capabilities.ts + tests/ui/capabilities.ts | VERIFIED | 31 (20 avail, 10 partial, 1 unavailable); honesty checks green. |
| UI DOM/render/specs/store/format | tests/ui/*.ts (5 files) | VERIFIED | 90/90 green. |
| UI test category | tests/suites.ts, tests/golden/ui empty | VERIFIED | 'ui' category present; no golden/ui files. |

## Hypothesis points (A3)
| Item | Spec ref | Status | Evidence |
|---|---|---|---|
| results.ts: colorizeLog(sim.logLines) | structured event stream goal | PARTIAL | UI still uses logLines; structured events exist but not consumed. |
| buildEditor.ts single traces checkbox | per-node traces per brief? | UNKNOWN | Only global traces checkbox present; need to confirm per-node traces UI. |
| PreCombat: resolvePreCombat/useCounts/switchSensitive/repeat limits/conflicts/zone replacement | 84.6.1 | PARTIAL | Core exists; UI wiring for technique selection/resolution not fully visible. |
| hsr-data/fetch_all.py | image loader? | VERIFIED | Data fetcher (Fandom+nanoka); no image download/manifest for UI assets. |
| src/verification/deviations.ts | GAP/BLOCKED non-fatal | VERIFIED | Non-fatal except FAIL; exit 0 when no FAIL. |
| TODO.md historical vs fresh dates | status truth | UNKNOWN | Need to inspect TODO.md dates/results. |

## Asset manifest / provenance
| Item | Status | Notes |
|---|---|---|
| UI image assets | MISSING | None committed (outside reference). fetch_all.py doesn't write UI asset manifest. |
| Image provenance/licenses | MISSING | No docs/assets/PROVENANCE.md found in audit scan. |

## Baseline
| Gate | Exit | Result |
|---|---|---|
| tsc --noEmit | 0 | ok |
| npm test (all) | 0 | 2951/0 |
| npm test enemies | 0 | 933/0 |
| npm test ui | 0 | 90/0 |
| npm run lab | 0 | ALL LABS PASSED |
| npm run verify | 0 | 93/93 + ALL SPECS PASSED |
| npm run verify:deviations | 0 | PASS 129, GAP 0, BLOCKED 0, FAIL 0; exit 0 |
| npm run check | 0 | 93 presets ok |
| npm run build | 0 | vite build ok |