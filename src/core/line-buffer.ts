// Line reassembler for piped child output (sweep fan-out). Each child writes whole lines;
// the parent re-emits them, so two shards sharing one console can never interleave inside a
// line. Multi-byte UTF-8 split across chunk boundaries is handled by a streaming decoder.
import { StringDecoder } from 'string_decoder'

export interface LineSink {
  /** push a raw chunk (Buffer from a pipe, or an already-decoded string) */
  feed(chunk: Buffer | string): void
  /** flush any trailing line left without a final newline */
  end(): void
}

export function lineBuffer(onLine: (line: string) => void): LineSink {
  const dec = new StringDecoder('utf8')
  let tail = ''
  const push = (text: string, final: boolean): void => {
    tail += text
    let nl: number
    while ((nl = tail.indexOf('\n')) >= 0) {
      onLine(tail.slice(0, nl).replace(/\r$/, ''))
      tail = tail.slice(nl + 1)
    }
    if (final && tail) { onLine(tail.replace(/\r$/, '')); tail = '' }
  }
  return {
    feed(chunk) { push(typeof chunk === 'string' ? chunk : dec.write(chunk), false) },
    end() { push(dec.end(), true) },
  }
}
