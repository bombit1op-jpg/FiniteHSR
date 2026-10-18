# FiniteHSR - Phase G: assets (image downloader + manifest + provenance)

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