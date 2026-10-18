import { chk, run, raw, all } from '../../_helpers/battle'

export default () => {
  const c = run({ team: [{ kitId: 'hook' }] })
  const starts = all(c, 'BATTLE_START')
  const ends = all(c, 'BATTLE_END')
  return [
    chk('battle starts', c, { assert: 'present', of: { type: 'BATTLE_START' } }),
    chk('battle ends', c, { assert: 'present', of: { type: 'BATTLE_END' } }),
    raw('exactly one start/end', starts.length === 1 && ends.length === 1, `${starts.length}/${ends.length}`),
    raw('no logger errors', c.sim.logger.errors.length === 0, c.sim.logger.errors.join('; ')),
    raw('combat actions happened', all(c, 'ACTION_START').length > 0),
  ]
}
