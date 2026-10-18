import { parentPort, workerData } from 'worker_threads'
import { runOne, flushLogs, Pacer, type BattleSpec } from './sweep-battle'
import type { TeamSpec } from './battle'

interface Task { team: TeamSpec[]; seed: number; logKey?: string; targetCount?: number; carrier?: string }

const { spec, cpuMax, memMax } = workerData as {
  spec: BattleSpec
  cpuMax: number
  memMax: number
}

// one pacer per worker thread: shared duty factor across the whole fleet,
// CPU EWMA + hysteresis locally. gate() before EVERY battle keeps the loop tight.
const pacer = new Pacer(cpuMax, memMax)

parentPort!.on('message', async (tasks: Task[]) => {
  const out = await Promise.all(tasks.map(async t => {
    pacer.gate()
    return runOne(t.team, t.seed, t.logKey, t.targetCount, spec, t.carrier)
  }))
  await flushLogs() // never lose a transcript on exit
  parentPort!.postMessage(out)
})