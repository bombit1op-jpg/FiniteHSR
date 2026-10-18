/**
 * §84.1/§84 G0 — capability-status contract.
 *
 * The GUI is a presentation layer over the existing engine/analysis/optimizer/verification
 * APIs (rules 84.1: no duplicated damage/timeline/targeting logic, no second engine). This
 * module is the single honest registry of WHICH backend capabilities the GUI may invoke and
 * in what state they are. Per 84.1 a feature whose backend is missing or non-browser-viable
 * must surface its status + reason — never a front-end stub that fabricates numbers.
 *
 * Status is a runtime fact about the backend, not UI polish:
 *   available   — callable in the browser bundle as-is
 *   partial     — callable but bounded (node-only IO, or long-running → run a slice)
 *   unavailable — not viable in the browser (node worker/fs); desktop/CLI only
 *
 * `backend` names the real entrypoints (module path + symbol) so traceability.md and the
 * shell can point at the exact code being wrapped. Keep this list in sync with the audit.
 */

export type CapabilityStatus = 'available' | 'partial' | 'unavailable'

export type CapabilityGroup = 'config' | 'simulate' | 'analysis' | 'optimize' | 'verify'

export interface Capability {
  id: string
  label: string
  group: CapabilityGroup
  status: CapabilityStatus
  /** real backend entrypoints (module + symbol) this capability wraps */
  backend: string[]
  /** why not fully available — required when status !== 'available' */
  reason?: string
}

export const CAPABILITIES: Capability[] = [
  // ---------------------------------------------------------------- config (§84.5–84.7)
  {
    id: 'build.editor', label: 'Build Editor', group: 'config', status: 'available',
    backend: ['src/core/build.ts:resolveBuild', 'src/core/build.ts:validateBuild', 'src/core/build.ts:BuildSpec'],
  },
  {
    id: 'build.apply', label: 'Build → TeamSpec', group: 'config', status: 'available',
    backend: ['src/core/build.ts:applyBuild'],
  },
  {
    id: 'team.editor', label: 'Team Builder', group: 'config', status: 'available',
    backend: ['src/core/battle.ts:TeamSpec', 'src/core/battle.ts:presetTeam'],
  },
  {
    id: 'encounter.editor', label: 'Encounter Editor', group: 'config', status: 'available',
    backend: ['src/core/encounter.ts:EncounterSpec', 'src/core/encounter.ts:resolveEncounter'],
  },
  {
    id: 'encounter.validate', label: 'Encounter Validation', group: 'config', status: 'available',
    backend: ['src/core/encounter.ts:validateEncounter'],
  },
  {
    id: 'spec.io', label: 'Spec Import/Export', group: 'config', status: 'available',
    backend: ['src/core/build.ts:BuildSpec', 'src/core/battle.ts:TeamSpec', 'src/core/encounter.ts:EncounterSpec'],
  },

  // ---------------------------------------------------------------- simulate (§84.8)
  {
    id: 'battle.run', label: 'Battle (auto)', group: 'simulate', status: 'available',
    backend: ['src/core/battle.ts:runBattle', 'src/core/battle.ts:prepareBattle'],
  },
  {
    id: 'battle.manual', label: 'Battle (step)', group: 'simulate', status: 'available',
    backend: ['src/core/battle.ts:runBattleManual', 'src/core/battle.ts:BattleIO'],
  },
  {
    id: 'rules.snapshot', label: 'Rules Snapshot', group: 'simulate', status: 'available',
    backend: ['src/verification/meta/rules.ts:rulesSnapshot', 'src/verification/meta/rules.ts:rulesHash'],
  },
  {
    id: 'replay.build', label: 'Replay Artifact', group: 'simulate', status: 'partial',
    backend: ['src/verification/meta/replay.ts:makeReplay', 'src/verification/meta/hash.ts:eventHash'],
    reason: 'artifact build + hash are browser-safe; writeReplay/readReplay use node:fs → persist via JSON download/upload',
  },
  {
    id: 'sweep.workers', label: 'Sweep (workers)', group: 'simulate', status: 'unavailable',
    backend: ['src/core/sweep-worker.ts', 'src/core/sweep-battle.ts'],
    reason: 'node worker threads + fs; desktop/CLI only, not part of the browser bundle',
  },

  // ---------------------------------------------------------------- verify (§84.9)
  {
    id: 'checks.formulas', label: 'Formula Self-check', group: 'verify', status: 'available',
    backend: ['src/core/check.ts:runChecks'],
  },
  {
    id: 'verification.specs', label: 'Verification Specs', group: 'verify', status: 'partial',
    backend: ['src/verification/GoldenRunner.ts:runFixture', 'src/verification/Coverage.ts:coverage'],
    reason: 'runners read fixture files from disk; browser sees coverage/gear registries only',
  },
  {
    id: 'gear.coverage', label: 'Gear Coverage', group: 'verify', status: 'available',
    backend: ['src/verification/gearCoverage.ts:gearCoverageReport'],
  },
  {
    id: 'known.deviations', label: 'Known Deviations', group: 'verify', status: 'available',
    backend: ['TODO.md (§ known deviations)', 'src/verification/deviations.ts (CLI gate)'],
    reason: 'браузер читает TODO.md как текст (?raw) и показывает таблицу; сам gate deviations.ts — node/CLI',
  },
  {
    id: 'determinism.check', label: 'Determinism Check', group: 'verify', status: 'available',
    backend: ['src/core/battle.ts:runBattle', 'src/core/battlelog.ts:BattleLogger.eventHash'],
  },

  // ---------------------------------------------------------------- analysis (§84.9–84.11)
  {
    id: 'analysis.run', label: 'Run Analysis', group: 'analysis', status: 'available',
    backend: ['src/analysis/run.ts:analyzeRun', 'src/analysis/run.ts:explainDelta'],
  },
  {
    id: 'analysis.compare', label: 'Team Comparison', group: 'analysis', status: 'available',
    backend: ['src/analysis/compare.ts:compareTeams', 'src/analysis/compare.ts:buildDamageBreakdown'],
  },
  {
    id: 'analysis.damage', label: 'Damage Attribution', group: 'analysis', status: 'available',
    backend: ['src/analysis/attribution.ts:attributeDamage'],
  },
  {
    id: 'analysis.causal', label: 'Causal / Need-Provide', group: 'analysis', status: 'available',
    backend: ['src/analysis/causal.ts:causalProbe', 'src/analysis/causal.ts:needProfile', 'src/analysis/causal.ts:provideProfile'],
  },
  {
    id: 'analysis.profile', label: 'Behavior Profile', group: 'analysis', status: 'available',
    backend: ['src/analysis/profile.ts:behaviorProfile'],
  },
  {
    id: 'analysis.teamValue', label: 'Team Valuation', group: 'analysis', status: 'available',
    backend: ['src/analysis/team.ts:scoreKits', 'src/analysis/team.ts:shapleyValue', 'src/analysis/team.ts:predictCompatibility'],
  },
  {
    id: 'analysis.audit', label: 'Team Audit', group: 'analysis', status: 'available',
    backend: ['src/analysis/audit.ts:auditTeam'],
  },
  {
    id: 'analysis.probe', label: 'Character Probe', group: 'analysis', status: 'partial',
    backend: ['src/analysis/probe.ts:probeCharacter', 'src/analysis/probe.ts:runProbe'],
    reason: 'multi-scenario sweep; run a bounded probe slice in-browser',
  },

  // ---------------------------------------------------------------- optimize (§84.12+)
  {
    id: 'optimize.search', label: 'Search (exhaustive)', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/search.ts:evaluateSpace', 'src/optimizer/search.ts:bruteForce'],
    reason: 'long-running; bound the space / stream progress',
  },
  {
    id: 'optimize.beam', label: 'Beam Search', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/beam.ts:beamSearch'],
    reason: 'long-running; bound the space / stream progress',
  },
  {
    id: 'optimize.joint', label: 'Joint Team Search', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/joint.ts:jointTeamSearch'],
    reason: 'long-running; bound the space / stream progress',
  },
  {
    id: 'optimize.mc', label: 'MC-assisted Search', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/mc.ts:mcAssistedSearch'],
    reason: 'seeded multi-run; bound samples, show progress',
  },
  {
    id: 'optimize.calibrate', label: 'Calibration', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/calibration.ts:calibrate'],
    reason: 'long-running; run offline or a bounded slice',
  },
  {
    id: 'optimize.encounter', label: 'Cross-encounter Ranking', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/encounter.ts:rankAcrossEncounters'],
    reason: 'N encounters × N teams; bound and show progress',
  },
  {
    id: 'optimize.ablation', label: 'Ablation / Replacement', group: 'optimize', status: 'partial',
    backend: ['src/optimizer/ablation.ts:teamAblation', 'src/optimizer/ablation.ts:replacementMatrix'],
    reason: 'repeated sims; bound and show progress',
  },
]

const BY_ID = new Map(CAPABILITIES.map(c => [c.id, c]))

export function capability(id: string): Capability | undefined {
  return BY_ID.get(id)
}

/** current status of a capability, or 'unavailable' for an unknown id (fail closed, not stub). */
export function capabilityStatus(id: string): CapabilityStatus {
  return BY_ID.get(id)?.status ?? 'unavailable'
}

/** reason a capability is not fully available, or null when it is. */
export function unavailableReason(id: string): string | null {
  const c = BY_ID.get(id)
  if (!c || c.status === 'available') return null
  return c.reason ?? 'backend not wired'
}

export function capabilitiesByGroup(group: CapabilityGroup): Capability[] {
  return CAPABILITIES.filter(c => c.group === group)
}
