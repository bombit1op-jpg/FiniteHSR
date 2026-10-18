/**
 * §29.7 replay regression: the same `BattleSetup` + seed must reproduce the same event stream
 * and final state (same hashes), and the artifact must survive a disk round-trip.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runBattle, type BattleSetup } from '../../src/core/battle'
import { makeReplay, writeReplay, readReplay, replayMatches } from '../../src/verification/meta/replay'
import { rulesSnapshot, rulesHash, ENGINE_VERSION, RULES_VERSION } from '../../src/verification/meta/rules'
import { t, type Case } from '../suites'

const setup = (seed: number): BattleSetup => ({
  team: [{ kitId: 'hook' }],
  enemy: { name: 'Mob', count: 1, hp: 25_000, spd: 132, level: 80, toughness: 30, weaknesses: ['Fire', 'Lightning'] },
  cycles: 3,
  seed,
  log: { debug: 5 },
})

export default (): Case[] => {
  const a = makeReplay(runBattle(setup(7)), setup(7))
  const b = makeReplay(runBattle(setup(7)), setup(7))
  const other = makeReplay(runBattle(setup(8)), setup(8))

  const dir = mkdtempSync(join(tmpdir(), 'calc-replay-'))
  const path = join(dir, 'run.json')
  writeReplay(a, path)
  const loaded = readReplay(path)

  return [
    t.truthy('battle records events', a.eventCount > 0, `${a.eventCount} events`),
    t.truthy('same config + seed reproduce the same stream', replayMatches(a, b), `${a.eventHash} vs ${b.eventHash}`),
    t.truthy('different seed diverges', a.eventHash !== other.eventHash),
    t.truthy('artifact survives a disk round-trip', replayMatches(a, loaded)),
    t.eq('round-trip keeps the seed', loaded.seed, 7),
    t.eq('round-trip keeps the event count', loaded.eventCount, a.eventCount),
    t.eq('rules snapshot pins the engine version', a.rules?.engine, ENGINE_VERSION),
    t.eq('rules snapshot pins the rules version', a.rules?.rules, RULES_VERSION),
    t.eq('rules hash is deterministic for the same setup', rulesHash(a.rules!), rulesHash(b.rules!)),
    t.truthy('rules hash diverges when the run (seed) differs', rulesHash(a.rules!) !== rulesHash(other.rules!)),
    t.eq('round-trip keeps the rules snapshot', rulesHash(loaded.rules!), rulesHash(a.rules!)),
    t.eq('named encounter is reflected in the stage',
      rulesSnapshot({ ...setup(7), encounter: 'moc12' }).stage.encounter, 'moc12'),
  ]
}
