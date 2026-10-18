/**
 * `npm test` — runs every suite in `tests/`, exits non-zero on any failed case.
 *
 *   npm test                 # all suites
 *   npm test -- golden/break # filter by suite name or path
 */

import { runAll } from './suites'

const failed = await runAll(process.argv[2])
process.exit(failed ? 1 : 0)
