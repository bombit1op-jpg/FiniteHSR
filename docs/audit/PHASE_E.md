# FiniteHSR - Phase E: structured log from typed events

## Current state
- Simulator.logLines built (unconditional push). 
- BattleLogger.events exists; gated by debug>=MIN_DEBUG (battlelog.ts). 
- tests use log:{debug:5} so events populated. UI uses no log config -> events empty in UI runs.
- dashboard reads sim.logger.events.length; runAnalysis filters DAMAGE_EVENTS from events.
- results.ts colorizeLog(sim.logLines) only.

## Goal per brief
Structured action log from typed events (not logLines). Hide event IDs/stacktraces/internal fields in normal UI (separate Diagnostics screen Phase I).

## Plan
Need: UI path to use structured events when available; or set reasonable debug level for UI runs? Or add a "structured log" renderer over BattleEvent[]. But changing default log behavior affects tests? tests assume debug:5 explicitly. UI runs: collect() passes no log.
Also results.ts needs rewrite to render from events.

But Phase E says "structured action log from typed events, not logLines" — engineering change in UI + possibly simulator defaults. Document first.

Find MIN_DEBUG and event types used for "action log".
- MIN_DEBUG shows ACTION_* level 2; HIT_* 2; DAMAGE_* 4; BUFF/DEBUFF 3. Gate = e.minDebug ?? MIN_DEBUG[type] ?? 2; debug<gate -> drop.
- UI calls runBattle without log -> log.debug 0. So ACTION/HIT events suppressed (gate 2 > 0). DAMAGE gated 4 > 0 also.
- results.ts needs structured renderer over BattleEvent[]; must hide eventId, traceId, sourceId/targetId/ownerId when not in Diagnostics. Phase I is separate Diagnostics screen.

Structured log feasible if UI uses debug>=2 or if we emit a minimal canonical subset at debug=1/2 for UI. But change affects what gets recorded. Alternative: UI builds action log by filtering events (e.g. ACTION_START/ABILITY_USED/HIT_START/HIT_END/DAMAGE_DEALT, BATTLE/WAVE/CYCLE, ENCOUNTER_VICTORY/DEFEAT) when present; if empty, fallback to logLines (current). This preserves backward compat and avoids changing defaults.

But brief says "structured action log from typed events, not logLines". Mark Phase E as partial until UI wiring exists.