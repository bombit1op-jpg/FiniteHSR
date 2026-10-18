# FiniteHSR - Pre-combat techniques check (Phase C)  ## Core - BattleSetup.techniques?: string[] (order; repeated => additional use; capped by Technique maxUses). Buff stack; at most ONE attack technique starts fight; at most one zone survives. - PreCombat.ts exports resolvePreCombat, useCounts, switchSensitive, CancelReason (repeat-cap, attack-conflict, zone-replaced, switch-cancelled). - BattleEngine applies TECHNIQUE_APPLIED events (BattleEngine.ts:63-80) and has pre-combat resolution usage? grep for resolvePreCombat.  ## Wiring grep - applyTechniques() called at battle start (BattleEngine.ts:30) after onStart hooks; resolves via PreCombat and attaches plan to sim.preCombat; emits TECHNIQUE_APPLIED; applies surviving; logs skipped with reasons. - UI: no technique selection UI (build/team/encounter/battle panels). collect() doesn't set techniques. BattleSetup.techniques exists but unused by UI forms.  Conclusion: core correct per 84.6.1; UI wiring missing (Phase C). 
## UI gap (confirmed)
- TeamRowState in store.ts has no 	echniques field.
- team.ts collect() doesn't set 	echniques in BattleSetup.
- No UI checkboxes for pre-combat techniques in team/build editors.
- BattleSetup.techniques is passed through core (BattleEngine applies via resolvePreCombat) but never populated by UI.

## Next minimal step
- Add 	echniques?: string[] to TeamRowState (store)
- Add UI checkbox per character (team editor) to include their technique (or multi-use selector)
- Wire to collect() -> build TeamSpec with techniques? Or pass techniques to BattleSetup? TeamSpec has no techniques; BattleSetup.techniques is global ordered list (by activation order). Need to decide: per-character selection -> collect ordered list.
- Add tests for conflicts/repeats.
