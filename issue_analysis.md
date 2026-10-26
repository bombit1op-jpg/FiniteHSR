# Character Stat Display Issue Analysis

## Problem Summary

The issue is with how energy regeneration rate (`err`) and elemental damage boost (`elemDmgBoost`) are displayed in the UI party setup panel.

## Root Cause

In `src/core/charStats.ts`, the `charFinalStats` function calculates these values:

1. `err: 1 + buffSum(u.buffs, 'err')` - Returns a multiplier (e.g., 1.2 = 20% more regen)
2. `elemDmgBoost: buffSum(u.buffs, `dmg:${kit.elem}`)` - Also returns a multiplier

However, in `src/ui/partyPanel.ts`, these are formatted differently:

- Line 756: `['err', pct(s.err)]` - This passes the multiplier directly to pct() function
- Line 759: `['elemDmgBoost', pct((s.elemDmgBoost - 1) * 100)]` - This correctly converts multiplier to percentage

## The Issue

The `pct()` function in partyPanel.ts treats all values as percentages, but `err` is already a multiplier. When `err = 1.2`, passing it to `pct()` gives `Math.round(1.2 * 1000) / 10 + '%'` = `120%` instead of the correct display of `+20%`.

## Expected Behavior

- `err = 1.2` should display as `+20%` (not `120%`)
- `elemDmgBoost = 1.2` correctly displays as `+20%`

## Solution

The `err` field in the stats array needs to be converted from multiplier to percentage before being passed to `pct()` function, similar to how `elemDmgBoost` is handled.

In partyPanel.ts line 756, change:
```typescript
['err', pct(s.err)],
```

To:
```typescript
['err', pct((s.err - 1) * 100)],
```