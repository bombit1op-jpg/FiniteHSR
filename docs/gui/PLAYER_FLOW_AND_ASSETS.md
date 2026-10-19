# UI reference guide: player setup → battle → results

**Status:** implementation target, not a claim that the interface already behaves this way.  
**Scope:** UI composition and static image assets. Keep combat/domain logic in existing modules.

## Product goal

The user should be able to configure a team and run a simulation without hopping between separate screens. The primary page follows the same order in which a player thinks about a run:

1. Choose the team and each character.
2. Choose each character's Light Cone and relic/planar sets.
3. Set the character's relevant stats and build details.
4. Set each character's combat behaviour (technique, skill policy/priority, rotation/pattern and other supported strategy controls).
5. Choose the encounter/enemies and run options, including the supported automatic or step-by-step mode.
6. Press **Start simulation**.
7. Read results on the same page after the run completes.

The order above is intentional. Do not put optimizer/diagnostic settings before the run setup, and do not require navigation to a separate “results” route for the normal happy path.

## Proposed single-page structure

### 1. Team

- Show 1–4 character cards with portrait, name, element and path if present in data.
- Provide a clear add/remove/replace action and prevent exceeding the existing team limit.
- Character portrait is a visual aid; the stable character/kit ID remains the data identity.
- Keep a compact summary visible; expand detailed controls inside the character card instead of showing every field at once.

### 2. Build per character

Within each character card, in this order:
1. Light Cone, superimposition/refinement and eidolon.
2. Relic sets and planar set.
3. Six relic slots (head, hands, body, feet, sphere, rope), main stats and substats where supported.
4. Character stat overrides / traces / skill levels and starting energy where supported.

Use real existing editor controls and data models. Do not create a parallel UI-only build format. Persist changes through the current store and convert to the existing BuildSpec/TeamSpec pipeline.

### 3. Combat behaviour per character

- Put the existing technique selector and strategy controls directly in the corresponding character card.
- Present supported controls with player-facing labels, not raw internal property names.
- Keep advanced rotation text/pattern controls collapsed under “Advanced strategy” unless the current configuration makes them essential.
- Show defaults clearly; blank values must retain their current meaning (do not silently turn “unset” into zero).
- Do not add unsupported character-specific toggles just to make the UI look complete.

### 4. Encounter and run mode

After all character cards, show a compact “Battle setup” section:
- enemy/encounter preset and available encounter options;
- supported run mode: automatic or step-by-step/manual;
- only settings backed by the existing API.

If mode selection already exists elsewhere, reuse its source of truth. Do not introduce a second mode state.

### 5. Primary action and results

- One prominent primary action: **Start simulation**.
- Disable it only for real validation/loading constraints; explain what must be fixed.
- Reuse the existing busy/error contract and actual simulator entry point.
- After completion, render the existing results/log/summary below the setup on the same route. Keep setup editable so the user can change one parameter and rerun.
- Make run status visible: idle, running, success, error. Never show sample/fabricated output as if it came from a run.
- Advanced analysis, comparison, optimizer, verification and engine diagnostics remain separate secondary routes.

## Image / icon integration guide

### First inspect the committed assets

Before coding, inspect the current branch and list actual files under likely asset locations (for example `public/`, `assets/`, `src/assets/`, or a dedicated icon directory). Do not assume a directory or filename scheme. Identify:
- character portrait/icon files;
- Light Cone icons;
- relic/planar set icons;
- slot icons, if present;
- file format, dimensions, case-sensitive paths and duplicate naming;
- whether files are complete and correspond to IDs in the data.

Produce a manifest/audit table with: entity kind, stable data ID, display name, repository-relative path, source/licensing note if available, and match confidence. Do not silently map an uncertain image to a character.

### Use a stable local manifest

- Resolve images by stable IDs, never by localized display names or first letters.
- Prefer a small typed manifest, e.g. `Record<string, string>` keyed by character/Light Cone/set ID, or an existing equivalent if the project already has one.
- Paths must be local app paths that actually exist in the repository; verify them on case-sensitive filesystems.
- If a consistent filename scheme is verified, derive paths only when all files obey that scheme and tests check representative cases. Otherwise use an explicit manifest.
- Never invent image URLs. Do not hotlink the wiki at runtime. The user has supplied repository assets; use those first.
- If an image cannot be matched, render the existing deterministic fallback badge and avoid broken-image icons.
- Add `alt` text, explicit dimensions/aspect ratio, `object-fit: contain` for item icons and `cover` only for portraits whose source framing supports it. Lazy-load non-critical images.
- Image failure must not break selection, keyboard navigation or form submission.
- Use a single reusable image/badge component so team cards, selectors, Light Cone fields and relic-set selectors share the same mapping and fallback rules.
- Keep attribution/license notes if available. Do not remove provenance from existing assets.

### Recommended visual hierarchy

- Portrait and character name are the card anchor; build settings follow.
- Show selected Light Cone and sets with their icons plus text labels. Icon-only controls are not sufficient for accessibility.
- For relic slots, show slot icon, selected set/item name and main stat in a compact row.
- Distinguish selected/unselected states using border/background and text, not color alone.
- Use consistent icon sizes: portrait larger than Light Cone/set icons, slot icons smallest.
- Avoid giant headers, duplicate page titles, raw IDs, and always-open technical tables.

## Architecture constraints

- UI is presentation/orchestration only; no damage formula or combat rules in DOM code.
- Reuse current `TeamSpec`, `BuildSpec`/build representation, `EncounterSpec`, `RulesSnapshot`, store and simulator entry points as they exist in this branch. Inspect actual definitions before editing; do not assume the names imply a particular shape.
- No duplicated mutable state for mode, encounter or team.
- Do not modify `src/core/calcs.ts`, combat/event semantics, golden traces or verification expectations for a UI-only task.
- Keep route IDs/deep links intact unless a migration is explicitly needed. The normal player flow can be a single page while advanced screens remain available.
- Statuses such as available/partial/unavailable/N/A must remain truthful. Do not turn partial functionality into a success badge.

## Acceptance criteria

- A user can configure team, builds, per-character supported strategy, encounter and run mode in the listed order on one page.
- The primary run action and actual results appear on the same page.
- No duplicate source of truth for team/mode/encounter.
- Portraits and gear icons resolve through verified local paths and stable IDs; unknown/missing images use a graceful fallback.
- Existing URLs/routes still work.
- Typecheck, UI tests, full test suite and build pass, or every unrun gate is explicitly reported.
- Add UI tests for manifest mapping/fallback, order and run-state transitions; do not test by hardcoding an expected icon count without verifying the actual assets.
