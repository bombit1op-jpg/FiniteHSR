import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// §84.15: the deviations workspace (src/ui/todoRaw.ts) needs TODO.md verbatim in the
// browser bundle. Injected at transform time; no runtime fetch, no ?raw loader needed.
export default defineConfig({
  define: {
    __TODO_RAW__: JSON.stringify(readFileSync('TODO.md', 'utf8')),
  },
  server: {
    host: '127.0.0.1',
  },
})
