# Mechanics laboratory (`debug/lab/`)

Developer-only, fast, deterministic environment for isolating **one** engine rule at a time — the
place a formula-level change is developed before it is promoted to full regression (`tests/` +
`npm run check`). A lab runs the **real** pure function or a **real** battle and prints
expected-vs-actual. It is not a replacement for `src/core/check.ts` (the broad self-check) or the
sweep suite; it is the smallest possible scenario that answers one question.

## Run

```bash
npm run lab            # every lab, aggregated (non-zero exit on any failure)
npm run lab:damage     # one lab at a time
npm run lab:timeline
npm run lab:break
npm run lab:buffs
npm run lab:energy
npm run lab:fua
npm run lab:gear
npm run lab:summons
npm run lab:teams
npm run lab:guard      # §45: forbids `ponytail:` markers in this directory
```

## Rules

- **Inert on import.** Each lab self-executes only when it is the process entry (`isEntry`),
  mirroring `src/core/check.ts`. Every file imports the harness, so it stays a module under
  `noUnusedLocals` (a bare script file would leak top-level globals into the shared tsc program).
- **No `ponytail:` markers here.** A lab is a permanent invariant check, not a parking spot for
  "good enough for now" shortcuts. Enforced by `npm run lab:guard`.
- **Isolate, then promote.** When a lab catches a real divergence, turn it into a
  `tests/regression/*` case and fix the root cause — don't let the lab carry the only proof.
- **One rule per case.** Assert the smallest observable contract (a single multiplier, one
  ordering rule, one lifecycle transition), not an end-to-end total.

## Files

| Lab | Isolates |
| --- | --- |
| `harness.ts` | shared `eq` / `ok` / `mkUnit` / `mod` / `report` / `isEntry` |
| `damage.ts` | RES cap, DEF mult / ignore, Vulnerability cap, CRIT, intact `×0.9` vs broken, boost composition |
| `timeline.ts` | `baseAv = 10000/SPD`, advance/delay, queue ordering + tie-break, `rescaleAv` |
| `break.ts` | Break DMG formula, `0.5 + tough/40`, per-element coefficient, broken `×1.0` |
| `buffs.ts` | apply stack/refresh, `expireBuffs`, `tickOnSource`, `isDebuff`, `buffSum`, `runtimeString` |
| `energy.ts` | ERR on flat regen vs flat grant, `maxEnergy` clamp, SP pool clamp |
| `fua.ts` | Follow-Up tag on a live hit, summon attribution, same-seed event-stream determinism |
| `gear.ts` | cone flat stats, relic/planar sets, SPEED-gated conditional mods |
| `summons.ts` | memosprite CRIT mirror (live lookup), own-buff count, recursion stop |
| `teams.ts` | preset roster assembly + end-to-end smoke |
| `guard.ts` | `ponytail:`-free laboratory (§45) |
| `all.ts` | runs every lab, aggregates failures |
