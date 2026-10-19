/**
 * TODO.md text for the deviations workspace (§84.15).
 *
 * Vite dev/build: the identifier `__TODO_RAW__` is replaced at transform time via
 * `define` in `vite.config.ts`, so the browser bundle carries the file verbatim
 * without a runtime fetch.
 *
 * Node/tsx harnesses (e.g. `src/debug-store.ts` boots the real `main.ts`): the
 * define is absent, so we read the file from disk through `node:fs` obtained via
 * `process.getBuiltinModule` (no static node import — the browser bundler must
 * never see one). Path is cwd-relative: like every other node script in this
 * repo, harnesses run from the repo root.
 *
 * Neither environment: empty string. The deviations page then honestly renders
 * zero lines; it never fabricates registry content.
 */
declare const __TODO_RAW__: string | undefined

function fromNodeFs(): string {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process
  const fs = proc?.getBuiltinModule?.('node:fs') as
    | { readFileSync: (path: unknown, encoding: string) => string }
    | undefined
  if (!fs) return ''
  try {
    return fs.readFileSync('TODO.md', 'utf8')
  } catch {
    return ''
  }
}

export const todoRaw: string = typeof __TODO_RAW__ === 'string' ? __TODO_RAW__ : fromNodeFs()
