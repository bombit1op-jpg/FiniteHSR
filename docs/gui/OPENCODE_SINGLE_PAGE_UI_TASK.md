# OpenCode task: implement the single-page team/build/battle workflow

Repository: `bombit1op-jpg/FiniteHSR`  
Reference: `docs/gui/PLAYER_FLOW_AND_ASSETS.md`

## Goal

Refactor the normal player workflow so team composition, character builds, per-character strategy, encounter/run mode, the start button and simulation results are presented on one page in this exact order:

1. Team / character selection
2. Light Cone and relic/planar sets
3. Stats and detailed build options
4. Per-character technique and supported action/rotation strategy
5. Encounter/enemies and supported run mode
6. Start simulation
7. Results/log below the form, on the same page

This should feel simple and game-oriented. Advanced analysis, optimizer and engine diagnostics stay secondary. Implement real behavior, not a mockup.

## Before editing

1. Read `AGENTS.md`, `TODO.md`, `docs/audit/UX_MAP.md`, and `docs/gui/PLAYER_FLOW_AND_ASSETS.md`.
2. Check `git status`, current branch, HEAD and uncommitted changes. Do not reset, stash, overwrite or revert user work.
3. Inspect the actual UI entry points, route/panel mounting, team store, character cards, gear editors, encounter editor, battle mode controls, run action and results rendering. Search by symbols and follow real imports; do not assume filenames.
4. Inventory the current committed image assets. List paths and dimensions and inspect naming/casing. Build a verified mapping from the actual files to stable IDs in the data. Do not state “icons are missing” before inspecting the current checkout.
5. Identify current tests and package scripts from `package.json`. Establish a baseline before changing code if feasible.

## Implementation plan — small vertical slices

### Slice A: asset manifest and reusable image component
- Use the assets already committed by the user. Do not download replacements or use wiki hotlinks.
- Match character portraits, Light Cones and relic/planar set icons by stable IDs. Check mapping correctness and local path existence.
- Add one reusable typed component/helper for image + accessible label + fallback. It should tolerate missing/unknown IDs and failed image loads.
- Keep names alongside icons; never rely on color or icon alone.
- Add tests for real representative IDs, unknown IDs and fallback behavior.
- Preserve source/license attribution if present. Do not invent mappings for uncertain files.

### Slice B: single-page player flow
- Reuse existing team/build/gear/strategy/encounter/mode/run/result controls and current store/domain contracts.
- Compose the normal workflow on one primary page in this order: team → equipment/sets → stats → per-character strategy → encounter/mode → start → results.
- Prefer progressive disclosure: show character portrait, name, selected gear and essential stats by default; collapse secondary stats and advanced rotation fields under clear expandable sections.
- Do not duplicate the team selector, encounter state or run-mode state. One source of truth only.
- Reuse the existing simulator invocation and busy/error status behavior. Do not implement a second simulation path.
- Render actual run results on the same page and retain the configuration so users can make a change and rerun.
- If a requested control is not supported by the existing backend, state that clearly and leave it out of the primary flow rather than fabricating behavior.

### Slice C: visual polish and accessibility
- Establish consistent sizing for portraits, Light Cone icons, set icons and relic slot icons.
- Make the primary run button visually prominent; labels and validation errors should be clear.
- Support keyboard focus, useful alt text, image failure fallback, narrow screens and existing hash routes.
- Avoid broad unrelated styling rewrites. Keep advanced diagnostics accessible but not dominant.

## Non-negotiable constraints

- UI-only task: no changes to damage formulas, combat/event semantics, character kits or golden traces.
- Preserve the actual `TeamSpec`/build/encounter/rules contracts as found in source; do not create parallel UI representations.
- Do not change capability statuses to make the interface appear more complete.
- No fake data, placeholder success results, fabricated image URLs or fake cancel controls.
- No broad engine refactor and no unrelated feature work.
- Keep the implementation in small commits/slices and update the UX map/reference guide to reflect only what is actually implemented.

## Validation

Run the project-supported checks, using scripts discovered from `package.json`, at minimum:
- typecheck/build;
- targeted UI tests;
- full test suite;
- existing check/verification gate if applicable and feasible.

Compare before/after test outcomes. If any gate cannot run, name it and explain why; do not report it as passing. Inspect the final diff for accidental engine/data changes.

## Definition of done

- The primary workflow is one page and follows the exact order above.
- A user can select a team, configure each character's gear/stats/strategy, set encounter and run mode, run the real simulator and see actual results without navigating away.
- Local portraits and gear icons render from verified repository paths using stable IDs, with graceful fallbacks.
- Existing advanced screens and deep links still work.
- Tests and docs reflect reality; no claim of completion without evidence.
