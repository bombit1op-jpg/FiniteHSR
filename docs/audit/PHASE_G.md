# FiniteHSR - Phase G: assets (image downloader + manifest + provenance)

## Status (19-10-2026): still deliberate deferral; fallback done
- Downloader/manifest/provenance = NOT done (unchanged YAGNI-deferral, see TODO.md Phase G).
- Done: data-driven fallback badges `src/ui/icons.ts` (element-tinted initial, team + build
  editor) — zero `<img>` tags, zero invented URLs; gap stated in every badge tooltip.
- Re-verified 19-10: 0 image files in repo/hsr-data; no usable image URLs in raw data
  (characters.json = numeric avatar_id; lightcones.json = no icon fields; relicsets.json =
  in-game SpriteOutput path strings only; enemies.json = wiki page link, not an image).

## Current
- fetch_all.py: Fandom + nanoka JSON/txt fetcher; writes under hsr-data/data/* and combat_mechanics/*.txt (see earlier). No image downloads, no manifest for UI assets.
- hsr-data/ has no .png (0). UI image assets in repo only under reference/fribbels.github.io-master (not committed core).
- No asset manifest.json in core. No docs/assets/PROVENANCE.md found.

## Requirements
- image downloader + manifest
- document image provenance/licenses
- small reviewable batches (per brief)

fetch_all.py is in hsr-data/ (gitignored? .gitignore has hsr-data/ core include? Wait: .gitignore line 4 has 'hsr-data/' under core runtime - included. But fetch_all.py is in hsr-data/ root? check.
- hsr-data/fetch_all.py exists; not an image loader/manifest for UI. 
- hsr-data/data contains JSON/txt (core data). 
- No UI asset manifest in core; no docs/assets/PROVENANCE.md.
- UI images only in reference/ (not committed). If UI needs images, downloader+manifest+provenance required. Phase G marked MISSING in MATRIX.