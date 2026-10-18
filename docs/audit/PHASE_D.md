# FiniteHSR - Phase D: 50% start energy + per-node traces

## 50% start energy
BattleSetup has no 'startEnergy' or half-start flag. In setup/build, units start with energy from kit defaults? Check start initialization.
Also note wounded-start knob exists (u.startHp). Search for energy init.

Energy: sim units get energy = ...? simulator/battle init: find where energy set.
## 50% start energy
- addChar default energyStartFrac = 0.5 (simulator.ts:609) — matches "half".
- TeamSpec.energyStartFrac exists (battle.ts:24) and passed through (battle.ts:362, defaults 0.5).
- So half start is already the default. Need UI control? Brief Phase D says "50% start energy" + per-node traces — maybe ensure UI can set per-character energyStartFrac; team editor doesn't expose it now.

## Per-node traces
- buildEditor has single global traces checkbox -> BuildSpec.traces (build.ts:37,45,65,94). Applied as team-row.traces (applyBuild -> TeamSpec.traces). In setup, TeamSpec.traces checked (battle.ts:372): if (t.traces !== false) apply traceMods (permanent buff). No per-node traces UI in buildEditor (only global). Phase D states "per-node traces UI check" — need to document/expose or note current state.
Summary (Phase D):
- energyStartFrac defaults 0.5 (already half). Can be set per TeamSpec via energyStartFrac. UI doesn't expose it. If brief wants UI control, needs wiring in team/build editor.
- traces: global checkbox only; per-node traces UI missing. Core supports per-row traces via TeamSpec.traces.