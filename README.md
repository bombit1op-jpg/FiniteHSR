# FiniteHSR

Deterministic Honkai: Star Rail damage simulator. Turn-based combat, AV/timeline, buffs/debuffs, Break/DoT, targeting, verification.

## Quick Start

`ash
npm install
npm run dev       # Vite dev server (http://localhost:5173)
npm run build     # tsc --noEmit + vite build
npm run preview   # preview build
npm test          # 2951 cases, 0 failed
npm run verify    # verification gate
npm run lab       # lab checks
npm run ci        # tsc --noEmit && npm test && npm run lab
`

## Features

- Deterministic battle engine: timeline, actions, AV, energy/SP, triggers, events
- Combat: damage/crit/DEF/RES/Vuln, Break/Super Break, DoT, control, shields/healing
- Enemy coverage: bosses/mobs E0–E6 with inventory + negative tests
- Verification: golden/spec, comparison, audit, deviations
- GUI (Vite): dashboard, build/team/encounter editors, run/compare, profiles, optimizer, verification, catalog, deviations, settings

## Project Structure

`
src/            # engine, UI, analysis, optimizer, verification
tests/          # unit/scenario/regression/golden + UI
verification/   # specs, golden traces, interactions, meta
hsr-data/        # game data (characters/enemies/lightcones + data/)
docs/            # guides
debug/lab/       # lab harness + checks
`

## Status

- 
px tsc --noEmit — 0
- 
pm test — 2951/0
- 
pm run lab — ALL PASSED
- 
px tsx tests/index.ts enemies — 933/0
- 
px tsx src/core/debug-kits.ts — 0 failures