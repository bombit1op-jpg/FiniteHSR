# FiniteHSR

Deterministic damage simulator for Honkai: Star Rail.

- **Playable characters:** 93 kits (all implemented with Eidolons E0–E6)
- **Enemies:** 250 base enemy types, 631 abilities covered with full inventory verification
- **Turn-based deterministic combat** with AV/timeline, actions, energy/SP, triggers and event stream
- **Combat systems:** damage/crit/DEF/RES/Vuln, Break/Super Break, DoT, control, shields/healing
- **Non-standard mechanics:** special Ultimate resources, charges/stacks/gauges, summons/memosprites, FUA/counters/reactions, phases, transformations
- **Verification:** golden/spec tests, comparison, audit, deviations; deterministic with seeded RNG
- **GUI:** Vite app for teams/builds/encounters, runs/comparisons, profiles/optimizer, verification/catalog

## Quick Start

    npm install
    npm run dev     # http://localhost:5173
    npm run build   # tsc --noEmit + vite build
    npm run test    # full test suite

## Structure

    FiniteHSR/
    ├── src/                # Engine, UI, analysis, optimizer, verification
    ├── tests/              # Unit, scenario, regression, golden, UI tests
    ├── verification/       # Specs, golden traces, interactions, meta
    ├── hsr-data/           # Game data (characters/enemies/lightcones + data/)
    ├── docs/               # Documentation
    ├── debug/lab/          # Lab harness and checks
    ├── index.html          # Vite entry
    ├── package.json
    ├── tsconfig.json
    └── README.md