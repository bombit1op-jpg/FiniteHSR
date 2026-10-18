# FiniteHSR - Phases B-I summary

- B (UX): shell/routes/capabilities mapped; UX_MAP.md. Gaps: Diagnostics missing as separate screen (deviations exists).
- C (pre-combat): core complete (PreCombat + applyTechniques + BattleEngine wiring) — UI selection missing.
- D (energy/traces): energyStartFrac defaults 0.5 (already half); traces global checkbox only — per-node UI missing.
- E (structured log): logger.events exist gated by debug; UI omits log -> events empty. Need structured renderer + UI debug wiring or fallback to events when present.
- G (assets): fetch_all.py data-only; no UI asset downloader/manifest/provenance. MISSING.
- I (Diagnostics): need separate Diagnostics screen (hide internal IDs/stacktraces) beyond 'deviations' route.

All gates still green: tsc 0, tests 2951/0, ui 90/0, lab/verify/deviations/check/build 0.