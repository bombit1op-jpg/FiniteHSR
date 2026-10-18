/**
 * §44 REGRESSION CORPUS self-check — "each production bug becomes a permanent regression case"
 * (total_guide 3420) only holds if every regression file states which bug/mechanism it pins. This
 * gate reads `tests/regression/`, requires each `*.ts` to open with a prose doc-comment, and fails
 * the file that doesn't — so a silent drop-in (or a stripped header) is caught, not shipped blind.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { case_, TESTS_DIR, type Case } from '../suites'

const MIN_PROSE = 80
const HEAD_LINES = 10

export default (): Case[] => {
  const dir = join(TESTS_DIR, 'regression')
  const files = readdirSync(dir).filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  const cases: Case[] = [
    case_('regression manifest is non-vacuous', files.length >= 20, `${files.length} files`),
  ]
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf-8')
    const block = text.match(/\/\*([\s\S]*?)\*\//)
    const line = block ? text.slice(0, block.index).split('\n').length : 0
    const prose = block ? block[1].replace(/[\s*]/g, '').length : 0
    cases.push(case_(`${f} documents the pinned bug`, line > 0 && line <= HEAD_LINES && prose >= MIN_PROSE, `${prose} chars @L${line}`))
  }
  return cases
}
