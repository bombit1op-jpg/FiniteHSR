# FiniteHSR - Pre-combat techniques check (Phase C)

## Core
- BattleSetup.techniques?: string[] (order; repeated => additional use; capped by Technique maxUses). Buff stack; at most ONE attack technique starts fight; at most one zone survives.
- PreCombat.ts exports resolvePreCombat, useCounts, switchSensitive, CancelReason (repeat-cap, attack-conflict, zone-replaced, switch-cancelled).
- BattleEngine applies TECHNIQUE_APPLIED events (BattleEngine.ts:63-80) and has pre-combat resolution usage? grep for resolvePreCombat.

## Wiring grep
- applyTechniques() called at battle start (BattleEngine.ts:30) after onStart hooks; resolves via PreCombat and attaches plan to sim.preCombat; emits TECHNIQUE_APPLIED; applies surviving; logs skipped with reasons.
- UI: no technique selection UI (build/team/encounter/battle panels). collect() doesn't set techniques. BattleSetup.techniques exists but unused by UI forms.

Conclusion: core correct per 84.6.1; UI wiring missing (Phase C).