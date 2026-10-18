import { raw } from '../_helpers/battle'
import { specToJson, specFromJson, validateSpec, envelope } from '../../src/ui/specs'
import type { BuildSpec } from '../../src/core/build'
import type { TeamSpec } from '../../src/core/battle'
import type { EncounterSpec } from '../../src/core/encounter'

/**
 * §84 G6 — config import/export round-trip. The GUI owns no format of its own (rule 84.1); the
 * exported document IS the engine's canonical spec wrapped in a versioned envelope. These checks
 * pin: export→import is lossless, foreign/malformed documents fail with a readable error, and
 * validation delegates to the engine validators (no UI-side id re-checking).
 */
const dEq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

export default () => {
  const build: BuildSpec = { cone: 'secret_vow', si: 3, relic: 'musketeer', relic2: 'passerby', relicCount: 2, planar: 'salsotto' }
  const team: TeamSpec[] = [{ kitId: 'hook', build: { relic: 'musketeer', relicCount: 4 } }]
  const enc: EncounterSpec = { id: 'enc', waves: [] }

  const roundBuild = specFromJson<BuildSpec>(specToJson('build', build), 'build')
  const roundTeam = specFromJson<TeamSpec[]>(specToJson('team', team), 'team')
  const roundEnc = specFromJson<EncounterSpec>(specToJson('encounter', enc), 'encounter')

  const thrown = (fn: () => unknown): string => { try { fn(); return '' } catch (e) { return e instanceof Error ? e.message : String(e) } }

  const wrongKind = thrown(() => specFromJson(specToJson('build', build), 'encounter'))
  const malformed = thrown(() => specFromJson('{ not json', 'build'))
  const noData = thrown(() => specFromJson(JSON.stringify({ kind: 'build', version: 1 }), 'build'))
  const notObject = thrown(() => specFromJson('42', 'build'))

  return [
    raw('envelope stamps kind + version', envelope('team', []).kind === 'team' && envelope('team', []).version === 1),
    raw('build spec survives export→import', dEq(roundBuild, build), specToJson('build', build).slice(0, 40)),
    raw('team spec survives export→import', dEq(roundTeam, team)),
    raw('encounter spec survives export→import', dEq(roundEnc, enc)),
    raw('exported text ends with a newline', specToJson('build', build).endsWith('\n')),
    raw('foreign kind is rejected with a readable error', /kind="encounter"/.test(wrongKind), wrongKind),
    raw('malformed JSON is rejected', /не JSON/.test(malformed), malformed),
    raw('envelope without data is rejected', /data/.test(noData), noData),
    raw('non-object document is rejected', /объект/.test(notObject), notObject),
    raw('validateSpec accepts a valid build', validateSpec('build', build).length === 0, validateSpec('build', build).join(',')),
    raw('validateSpec flags unknown build ids', validateSpec('build', { cone: 'nope' }).length > 0, validateSpec('build', { cone: 'nope' }).join(',')),
    raw('validateSpec rejects a non-array team', dEq(validateSpec('team', { kitId: 'x' }), ['team:not-array'])),
    raw('validateSpec requires a kitId per team member', validateSpec('team', [{ build: {} }]).some(e => e.endsWith(':kitId')), validateSpec('team', [{ build: {} }]).join(',')),
    raw('validateSpec reports an unknown kind', dEq(validateSpec('bogus' as never, {}), ['unknown-kind'])),
  ]
}
