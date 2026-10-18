/**
 * PHASE 7 §78 — parallel sweep fan-out: line-buffered child output + bounded retry.
 *
 * `debug-sweep.ts` fans one sweep out to N child processes. Two failure modes this pins down:
 *
 *  - OUTPUT: each child was spawned with `stdio:'inherit'`, so shards wrote straight to the
 *    shared console and could interleave inside a line. Every stream is now reassembled and
 *    re-emitted whole line by line.
 *  - RETRY: a child that exited non-zero was only counted (`bad++`) and the whole sweep failed,
 *    with no second chance. A shard now relaunches up to `maxRetry` times (sweep resumes per kit
 *    through `.done`), settles exactly once, and still reports the failure if retries run out.
 */

import { fanout, type Shard } from '../../src/core/sweep-fanout'
import { t } from '../suites'
import type { Case } from '../suites'

/** a programmable shard: wires synchronously, then delivers chunks + exit on the next microtask,
 *  so the coordinator has finished wiring stdio and the exit handler before anything fires */
interface FakeSpec { out?: string[]; err?: string[]; code: number }

function fake(spec: FakeSpec): Shard {
  const outCb: ((c: Buffer | string) => void)[] = []
  const errCb: ((c: Buffer | string) => void)[] = []
  const exits: ((code: number | null) => void)[] = []
  queueMicrotask(() => {
    for (const c of spec.out ?? []) for (const cb of outCb) cb(c)
    for (const c of spec.err ?? []) for (const cb of errCb) cb(c)
    for (const h of exits) h(spec.code)
  })
  return {
    stdout: { on: (_e, cb) => { outCb.push(cb) } },
    stderr: { on: (_e, cb) => { errCb.push(cb) } },
    on: (_e, h) => { exits.push(h) },
  }
}

interface Outcome { bad: number; retried: number; emits: string[]; retries: string[]; starts: number[]; settles: number }

/** run a fan-out over fake shards; `plan(i, launch)` returns the spec for shard `i`'s Nth launch */
function drive(workers: number, maxRetry: number, plan: (i: number, launch: number) => FakeSpec): Promise<Outcome> {
  const emits: string[] = []
  const retries: string[] = []
  const starts: number[] = []
  const launches = new Map<number, number>()
  let settles = 0
  return new Promise(res => {
    fanout({
      workers,
      maxRetry,
      start: (i) => {
        const n = launches.get(i) ?? 0
        launches.set(i, n + 1)
        starts.push(i)
        return fake(plan(i, n))
      },
      emit: (stream, line) => emits.push(`${stream}|${line}`),
      onRetry: (i, attempt, code) => retries.push(`${i}:${attempt}:${code}`),
      onSettle: (bad, retried) => { settles++; res({ bad, retried, emits, retries, starts, settles }) },
    })
  })
}

/** let any stray second settle land before asserting "exactly once" */
const settle = async (o: Promise<Outcome>): Promise<Outcome> => {
  const r = await o
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  return r
}

export default async (): Promise<Case[]> => {
  const cases: Case[] = []

  // --- happy path: every shard exits 0 -----------------------------------------------------
  {
    const o = await settle(drive(2, 1, i => ({ out: [`shard ${i} done\n`], code: 0 })))
    cases.push(t.eq('success: bad=0, retried=0', [o.bad, o.retried], [0, 0]))
    cases.push(t.eq('success: one launch per worker', o.starts, [0, 1]))
    cases.push(t.eq('success: no retry recorded', o.retries, []))
    cases.push(t.eq('both shards re-emitted', o.emits, ['stdout|shard 0 done', 'stdout|shard 1 done']))
    cases.push(t.eq('settled exactly once', o.settles, 1))
  }

  // --- line buffering: a shard's own chunks must not reach the console mid-line -------------
  {
    const o = await settle(drive(1, 0, () => ({ out: ['line ', 'a\n', 'pa', 'rtial', '\n', 'tail-no-newline'], code: 0 })))
    cases.push(t.eq('split chunks reassembled into whole lines',
      o.emits, ['stdout|line a', 'stdout|partial', 'stdout|tail-no-newline']))
  }

  // --- stderr is routed to stderr -----------------------------------------------------------
  {
    const o = await settle(drive(1, 0, () => ({ err: ['warn\n'], out: ['ok\n'], code: 0 })))
    cases.push(t.eq('streams kept apart', o.emits, ['stdout|ok', 'stderr|warn']))
  }

  // --- retry: first launch fails, second succeeds -------------------------------------------
  {
    const o = await settle(drive(2, 1, (i, launch) => i === 0 && launch === 0
      ? { out: ['flaky first\n'], code: 1 }
      : { out: [`shard ${i} ok\n`], code: 0 }))
    cases.push(t.eq('retry recovers: bad=0, retried=1', [o.bad, o.retried], [0, 1]))
    cases.push(t.eq('retry logged with index/attempt/code', o.retries, ['0:0:1']))
    cases.push(t.eq('failed shard launched twice', o.starts, [0, 1, 0]))
    cases.push(t.eq('output of both attempts kept', o.emits, ['stdout|flaky first', 'stdout|shard 1 ok', 'stdout|shard 0 ok']))
    cases.push(t.eq('settled exactly once', o.settles, 1))
  }

  // --- retry exhausted: a permanently broken shard still fails the sweep ---------------------
  {
    const o = await settle(drive(2, 2, (i, launch) => i === 0 ? { code: 1, out: [`attempt ${launch}\n`] } : { code: 0 }))
    cases.push(t.eq('exhausted: bad=1, retried=2', [o.bad, o.retried], [1, 2]))
    cases.push(t.eq('exhausted: two retries for the broken shard', o.retries, ['0:0:1', '0:1:1']))
    cases.push(t.eq('exhausted: the healthy shard was never relaunched', o.starts.filter(x => x === 1).length, 1))
    cases.push(t.eq('exhausted: broken shard launched initial + 2 retries', o.starts.filter(x => x === 0).length, 3))
    cases.push(t.eq('every attempt still reported', o.emits, ['stdout|attempt 0', 'stdout|attempt 1', 'stdout|attempt 2']))
    cases.push(t.eq('settled exactly once', o.settles, 1))
  }

  // --- maxRetry 0: the original behaviour (count and fail) ----------------------------------
  {
    const o = await settle(drive(2, 0, i => ({ code: i === 0 ? 1 : 0 })))
    cases.push(t.eq('no retry: bad=1, retried=0', [o.bad, o.retried], [1, 0]))
    cases.push(t.eq('no retry: broken shard launched once', o.starts, [0, 1]))
    cases.push(t.eq('no retry: settles exactly once', o.settles, 1))
  }

  // --- a shard retried while its siblings are already done must not settle early -------------
  {
    const o = await settle(drive(3, 1, (i, launch) => i === 0 && launch === 0 ? { code: 1 } : { code: 0 }))
    cases.push(t.eq('staggered settle: bad=0, retried=1', [o.bad, o.retried], [0, 1]))
    cases.push(t.eq('staggered settle: settles exactly once, after the retry', o.settles, 1))
    cases.push(t.eq('staggered settle: 4 launches for 3 workers', o.starts.length, 4))
  }

  return cases
}
