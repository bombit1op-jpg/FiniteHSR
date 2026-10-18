import { raw } from '../_helpers/battle'
import { CAPABILITIES, capability, capabilityStatus, unavailableReason, capabilitiesByGroup, type CapabilityStatus } from '../../src/ui/capabilities'

/**
 * §84.1/§84 G0 — the capability registry is the GUI's single honesty contract: a feature whose
 * backend is missing or non-browser-viable must be marked, with a reason, never stubbed. These
 * checks pin that contract so a new capability cannot silently ship without its status/reason.
 * Covers §84.19 criterion: registries/status are validated, not just rendered.
 */
const STATUSES: CapabilityStatus[] = ['available', 'partial', 'unavailable']

export default () => {
  const ids = CAPABILITIES.map(c => c.id)

  return [
    raw('capability ids are unique', new Set(ids).size === ids.length, `${ids.length} ids`),
    raw('registry is non-empty', CAPABILITIES.length > 0, `${CAPABILITIES.length}`),
    raw('every capability carries a non-empty backend list', CAPABILITIES.every(c => c.backend.length > 0),
      CAPABILITIES.filter(c => c.backend.length === 0).map(c => c.id).join(',') || 'ok'),
    raw('every status is one of the three contract values', CAPABILITIES.every(c => STATUSES.includes(c.status)),
      CAPABILITIES.filter(c => !STATUSES.includes(c.status)).map(c => c.id).join(',') || 'ok'),
    raw('every non-available capability declares a reason', CAPABILITIES.every(c => c.status === 'available' || !!c.reason),
      CAPABILITIES.filter(c => c.status !== 'available' && !c.reason).map(c => c.id).join(',') || 'ok'),
    raw('unknown id fails closed to unavailable', capabilityStatus('does.not.exist') === 'unavailable', capabilityStatus('does.not.exist')),
    raw('available capability has no unavailable reason', unavailableReason('build.editor') === null, String(unavailableReason('build.editor'))),
    raw('non-available capability reports its reason', !!unavailableReason('sweep.workers'), String(unavailableReason('sweep.workers'))),
    raw('capability(id) resolves a known descriptor', capability('battle.run')?.group === 'simulate', String(capability('battle.run')?.group)),
    raw('every capability declares a label and group', CAPABILITIES.every(c => !!c.label && !!c.group)),
    raw('capabilitiesByGroup partitions without mixing groups',
      (['config', 'simulate', 'analysis', 'optimize', 'verify'] as const).every(g => capabilitiesByGroup(g).every(c => c.group === g))),
  ]
}
