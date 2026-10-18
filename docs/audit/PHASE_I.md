# FiniteHSR - Phase I: Diagnostics screen

## Current
- ROUTES has 'deviations' (ENGINEERING, capability known.deviations) but no dedicated 'diagnostics'.
- Brief wants "Diagnostics screen with deviation records & statuses OPEN...VERIFIED_FIXED" and "hide internal event IDs/stacktraces/coverage tables from normal UI (separate Diagnostics screen)".
- dashboard.ts reads events.length; runAnalysis shows damage events. No diagnostics panel in routes.

## Traceability
- traceability.md mentions diagnostics in 84.15/84.17 context? Also "Data Catalog, Known Deviations and Settings" in total_guide 84.15.
- capabilities.ts has known.deviations available.

Conclusion: need new Diagnostics route/panel + component (separate from Deviations). Document scope.