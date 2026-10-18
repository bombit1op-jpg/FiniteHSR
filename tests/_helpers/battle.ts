/**
 * Shared runner for the golden/scenario suites: one deterministic battle in, normalized
 * event graph + assertion ctx out. Not a suite — discover() only scans CATEGORIES dirs.
 */
import { runBattle, ENEMY_PRESETS, type BattleSetup, type TeamSpec, type EnemySpec } from '../../src/core/battle'
import { normalize, type Node } from '../../src/verification/TraceMatcher'
import { evaluate, type Assertion, type Ctx } from '../../src/verification/Assertion'
import { case_, type Case } from '../suites'

export type { Ctx, Node }

/** one EnemySpec override on top of the mob preset (weak Fire/Lightning) */
export const mob = (over: Partial<EnemySpec> = {}): EnemySpec => ({ ...ENEMY_PRESETS.mob, count: 1, ...over })

export interface RunOpts extends Omit<Partial<BattleSetup>, 'enemy'> {
  team: TeamSpec[]
  enemy?: EnemySpec | EnemySpec[][]
}

export function run(opts: RunOpts): Ctx {
  const { team, enemy, ...rest } = opts
  const single: EnemySpec = Array.isArray(enemy) ? (enemy[0]![0] ?? mob()) : (enemy ?? mob())
  const waves: EnemySpec[][] | undefined = Array.isArray(enemy) ? enemy : undefined
  const sim = runBattle({
    cycles: 4, seed: 7, log: { debug: 5 },
    team, enemy: single, enemyWaves: waves,
    ...rest,
  })
  const nodes = normalize(sim.logger.events)
  return { nodes, sim, buffLog: sim.buffLog, logLines: sim.logLines }
}

/** run an Assertion through the shared evaluator, wrapped as a Case */
export const chk = (name: string, c: Ctx, a: Assertion): Case => {
  const r = evaluate(a, c)
  return case_(name, r.ok, r.detail)
}

/** predicate over nodes when the vocabulary has no declarative shape for it */
export const raw = (name: string, ok: boolean, detail = ''): Case => case_(name, ok, detail)

export const all = (c: Ctx, type: string): Node[] => c.nodes.filter(n => n.type === type)
export const idx = (nodes: readonly Node[], type: string): number => nodes.findIndex(n => n.type === type)
export const name = (c: Ctx, kitId: string): string => c.sim.roster.find(u => u.kitId === kitId)?.name ?? kitId
export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
