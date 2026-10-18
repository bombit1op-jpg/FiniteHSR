import { run, raw } from '../../_helpers/battle'
import { gearForTeam } from '../../../src/core/debug-presets'
import { auditTeam } from '../../../src/analysis/audit'

/**
 * §35 TEAM AUDIT (roadmap item 18): audit one real recommended team — carry + supports with their
 * preloaded gear — and require every category PASS. The determinism probe re-runs the identical
 * config+seed and compares event/state fingerprints, so DETERMINISM is a real check, not N/A.
 */
export default () => {
  const team = gearForTeam('firefly')
  const a = run({ team })
  const b = run({ team })
  const report = auditTeam({ sim: a.sim, team, rerun: { eventHash: b.sim.logger.eventHash(), stateHash: b.sim.logger.hash() } })

  const sectionOk = (name: string) => report.sections.find(s => s.name === name)!.checks.every(c => c.status !== 'FAIL')
  const required = ['DATA', 'EQUIPMENT', 'TEAM INTERACTIONS', 'COMBAT', 'INVARIANTS', 'DETERMINISM', 'GOLDEN TRACE']

  return [
    raw('team audit: overall PASS', report.ok, report.ok ? '' : report.text.split('\n').filter(l => l.includes('FAIL')).join(' | ')),
    raw('team audit: all seven §35 sections present', required.every(r => report.sections.some(s => s.name === r)), report.sections.map(s => s.name).join(',')),
    raw('team audit: every section free of failures', required.every(sectionOk)),
    raw('team audit: determinism probe is a real check (not N/A)', report.sections.find(s => s.name === 'DETERMINISM')!.checks[0]!.status === 'PASS'),
    raw('team audit: equipment is exercised (geared team, not N/A)', report.sections.find(s => s.name === 'EQUIPMENT')!.checks.every(c => c.status !== 'N/A')),
  ]
}
