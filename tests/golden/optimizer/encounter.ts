import { case_, type Case } from '../../suites'
import { mob } from '../../_helpers/battle'
import { rankAcrossEncounters, teamRankTable } from '../../../src/optimizer/encounter'
import type { SearchSpace } from '../../../src/optimizer/space'
import type { EncounterSpec } from '../../../src/core/encounter'

/**
 * §81 encounter-aware ranking: the same team ranks differently per encounter — never a context-free
 * "best team". Deterministic given explicit seeds/encounters (§80.3/§80.4).
 */

export default (): Case[] => {
  const boss: EncounterSpec = { id: 'boss', waves: [[mob({ hp: 800_000, toughness: 160 })]], cycles: 4 }
  const aoe: EncounterSpec = { id: 'aoe', waves: [[mob({ hp: 400_000, toughness: 120, count: 3 })]], cycles: 4 }
  const space: SearchSpace = {
    members: [{ id: 'acheron' }, { id: 'pela' }, { id: 'kafka' }],
    teamSize: 2,
    encounter: boss,
    seed: 7,
    objective: { primary: 'totalDamage' },
  }
  const encounters = [boss, aoe]

  const rankPerEnc = rankAcrossEncounters(space, encounters)
  const table = teamRankTable(space, encounters)
  const tableAgain = teamRankTable(space, encounters)

  return [
    case_('rankAcrossEncounters: one ranking per encounter, each over the whole space', rankPerEnc.length === 2 && rankPerEnc.every(r => r.ranked.length === 3)),
    case_('encounter ranking: encounter ids are preserved in order', rankPerEnc.map(r => r.encounter).join(',') === 'boss,aoe'),
    case_('teamRankTable: one row per distinct team, one rank per encounter', table.length === 3 && table.every(r => r.ranks.length === 2)),
    case_('teamRankTable: every rank is in 1..teamCount', table.every(r => r.ranks.every(x => x.rank >= 1 && x.rank <= 3))),
    case_('teamRankTable: scores are finite, each encounter has a rank-1 team', table.every(r => r.ranks.every(x => Number.isFinite(x.score))) && rankPerEnc.every(r => r.ranked.length > 0)),
    case_('teamRankTable: deterministic for the same input (§80.3)', JSON.stringify(table) === JSON.stringify(tableAgain)),
  ]
}
