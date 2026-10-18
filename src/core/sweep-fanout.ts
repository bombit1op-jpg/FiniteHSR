// PHASE 7 §78 — parallel sweep fan-out: line-buffered child output + bounded retry.
//
// Parallel shards share one console, so a child's bytes must not be handed straight to the
// parent's stream: two shards writing concurrently interleave MID-LINE and the log becomes
// unreadable. Each shard is piped, reassembled by `lineBuffer`, and re-emitted one whole line
// at a time. A shard that exits non-zero is launched again up to `maxRetry` times — the sweep
// marks each kit `.done`, so a retry resumes the shard rather than restarting it.
import { lineBuffer } from './line-buffer'

/** the structural slice of `ChildProcess` the coordinator needs (a real `spawn` fits) */
export interface Shard {
  stdout?: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null
  stderr?: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null
  on(event: 'exit', handler: (code: number | null) => void): void
}

export interface FanoutOpts {
  /** how many shards to launch */
  workers: number
  /** start shard `i` — the coordinator wires only its stdio and its exit, nothing else */
  start: (i: number) => Shard
  /** extra launches allowed per shard (0 = a failed shard is final) */
  maxRetry?: number
  /** whole-line sink; defaults to the parent's stdout/stderr */
  emit?: (stream: 'stdout' | 'stderr', line: string) => void
  /** shard `i` exited `code` at attempt `attempt` and is about to be launched again */
  onRetry?: (i: number, attempt: number, code: number) => void
  /** every shard settled, exactly once: `bad` = failures left after retries, `retried` = retries used */
  onSettle: (bad: number, retried: number) => void
}

export function fanout(o: FanoutOpts): void {
  const maxRetry = Math.max(0, o.maxRetry ?? 0)
  const emit = o.emit
    ?? ((stream: 'stdout' | 'stderr', line: string) =>
      (stream === 'stdout' ? process.stdout : process.stderr).write(line + '\n'))
  let alive = 0, bad = 0, retried = 0

  const launch = (i: number, attempt: number): void => {
    const s = o.start(i)
    alive++
    const wire = (stream: 'stdout' | 'stderr'): (() => void) => {
      const sink = lineBuffer(l => emit(stream, l))
      s[stream]?.on('data', d => sink.feed(d))
      return () => sink.end()
    }
    const endOut = wire('stdout')
    const endErr = wire('stderr')
    s.on('exit', (code) => {
      endOut(); endErr()
      alive--
      // retry BEFORE the settle check: launching keeps `alive` > 0, so a lone shard retrying
      // does not settle its siblings away
      if (code && attempt < maxRetry) {
        retried++
        o.onRetry?.(i, attempt, code)
        launch(i, attempt + 1)
        return
      }
      if (code) bad++
      if (alive === 0) o.onSettle(bad, retried)
    })
  }

  for (let i = 0; i < o.workers; i++) launch(i, 0)
}
