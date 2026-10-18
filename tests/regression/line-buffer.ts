/**
 * PHASE 7 §78 — line reassembly for the parallel sweep fan-out.
 *
 * Parallel shards share one console; each child writes whole lines but a raw pipe delivers
 * arbitrary byte chunks, so the parent re-emits one complete line at a time (see
 * `debug-sweep.ts` fan-out). This pins the reassembler: lines split across chunk boundaries,
 * several lines per chunk, CRLF, no-final-newline flush, and a multi-byte UTF-8 sequence split
 * across a chunk boundary (which must never surface as mojibake).
 */

import { lineBuffer } from '../../src/core/line-buffer'
import { t } from '../suites'
import type { Case } from '../suites'

/** feed every chunk, then end() — what the pipe delivers over one child's lifetime */
function run(...chunks: (string | Buffer)[]): string[] {
  const out: string[] = []
  const b = lineBuffer(l => out.push(l))
  for (const c of chunks) b.feed(c)
  b.end()
  return out
}

export default (): Case[] => {
  const cases: Case[] = []

  // a line split across two chunks is emitted once, whole, when its newline arrives
  const got: string[] = []
  const b = lineBuffer(l => got.push(l))
  b.feed('hello ')
  cases.push(t.ok('partial line is held, not emitted early', got.length === 0))
  b.feed('world\n')
  cases.push(t.eq('split line reassembled', got, ['hello world']))
  b.end()

  cases.push(t.eq('several lines in one chunk', run('a\nb\nc\n'), ['a', 'b', 'c']))
  cases.push(t.eq('CRLF stripped', run('x\r\ny\r\n'), ['x', 'y']))
  cases.push(t.eq('no trailing newline flushed on end', run('x\ny'), ['x', 'y']))
  cases.push(t.eq('empty line preserved', run('a\n\nb\n'), ['a', '', 'b']))
  cases.push(t.eq('chunk with no newline emits nothing yet', run('a', 'b', '\n'), ['ab']))

  // multi-byte UTF-8 split across two chunks must not mojibake
  const bytes = Buffer.from('█ ok\n', 'utf8')
  const got2: string[] = []
  const s = lineBuffer(l => got2.push(l))
  s.feed(bytes.subarray(0, 1)) // inside the 3-byte block glyph
  cases.push(t.ok('partial multi-byte char is held', got2.length === 0))
  s.feed(bytes.subarray(1))
  s.end()
  cases.push(t.eq('multi-byte char reassembled, no mojibake', got2, ['█ ok']))

  return cases
}
