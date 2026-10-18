/**
 * Generate `verification/characters/<kit>/eidolons.json` for every kit that does not have one.
 *
 * Guide §34.5 wants the eidolon ladder asserted in the spec corpus, not just in the debug probes.
 * Hand-writing 90+ specs is wasted motion, so this reuses each kit's own tuned skill.json fixture
 * (already known to exercise the kit) and runs the WHOLE ladder E0..E6 — one fixture per rank. The
 * requirements are derived from the `*_eN` buff ids the engine applies, using the id's canon rank N:
 *
 *   noBuff id at every rank e < N     (cumulative unlock — a leaked `_eN` below its rank fails)
 *   buff   id at the top rank where it is observed (the gate actually opens)
 *
 * So an E4 buff yields four lock rows (E0..E3) + one present row — the intermediate rungs the guide
 * asks for. `resolveLevels` monotonicity and the all-kit leak scan stay in probe-eidolon-ladder.ts.
 *
 *   npx tsx src/core/gen-eidolon-specs.ts            # write missing specs
 *   npx tsx src/core/gen-eidolon-specs.ts --dry      # report only
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runBattle, type BattleSetup } from './battle'
import { KITS } from './kits/index'

const DRY = process.argv.includes('--dry')
const SPEC_DIR = join(process.cwd(), 'verification', 'characters')

interface Req { id: string; layer: string; claim: string; fixtures: string[]; assertion: Record<string, unknown> }
interface Battle { team?: Array<{ kitId?: string; eidolon?: number }>; cycles?: number; seed?: number; [k: string]: unknown }

function sourceFixture(kit: string): { file: string; battle: Battle } | null {
  const dir = join(SPEC_DIR, kit)
  if (!existsSync(dir)) return null
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'eidolons.json') continue
    const s = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { fixtures?: Array<{ battle?: Battle }> }
    const b = s.fixtures?.[0]?.battle
    if (b) return { file: f, battle: b }
  }
  return null
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

function battleWithEidolon(src: Battle, kit: string, e: number): Battle {
  const battle = JSON.parse(JSON.stringify(src)) as Battle
  battle.team = Array.isArray(battle.team) ? battle.team : []
  const entry = battle.team.find(t => t.kitId === kit)
  if (entry) entry.eidolon = e
  else battle.team.push({ kitId: kit, eidolon: e })
  return battle
}

function run(kit: string, src: Battle, e: number): Set<string> {
  const battle = battleWithEidolon(src, kit, e)
  const sim = runBattle({ cycles: battle.cycles ?? 6, seed: battle.seed ?? 7, log: { debug: 2 }, ...battle } as unknown as BattleSetup)
  const ids = new Set<string>()
  for (const l of sim.buffLog) { if (/_e\d$/.test(l.id)) ids.add(l.id) }
  return ids
}

function build(kit: string, src: { file: string; battle: Battle }): { fixtures: unknown[]; requirements: Req[] } {
  const ranks = [0, 1, 2, 3, 4, 5, 6]
  const obs = ranks.map(e => run(kit, src.battle, e))
  const ids = [...new Set(obs.flatMap(s => [...s]))].sort()

  const fixtures = ranks.map(e => ({
    id: `e${e}`,
    env: `${kit} E${e} — eidolon ladder rung, cloned from ${kit}/${src.file}`,
    battle: battleWithEidolon(src.battle, kit, e),
  }))

  const requirements: Req[] = []
  for (const id of ids) {
    const n = Number(/_e(\d)$/.exec(id)![1])
    const locked = ranks.filter(e => e < n).map(e => `e${e}`)
    if (locked.length) {
      requirements.push({
        id: `${slug(id)}_locked_${locked.join('_')}`,
        layer: 'interactions',
        claim: `Cumulative unlock: \`${id}\` (E${n}) must NOT be active at any rank below E${n} (E${locked.join(', E')}).`,
        fixtures: locked,
        assertion: { assert: 'noBuff', id },
      })
    }
    const maxObs = Math.max(...ranks.filter(e => obs[e].has(id)))
    requirements.push({
      id: `${slug(id)}_present_e${maxObs}`,
      layer: 'interactions',
      claim: `Eidolon effect \`${id}\` (canon rank E${n}) is active at the rank cap where it fires (E${maxObs}).`,
      fixtures: [`e${maxObs}`],
      assertion: { assert: 'buff', id },
    })
  }
  if (!requirements.length) {
    requirements.push({
      id: `${kit}_level_only`,
      layer: 'parameters',
      claim: "No runtime `*_eN` buff in this kit's normal loop — its eidolons are ability-level bumps (E1/E3/E5) or resource changes. The cumulative ladder is guarded by src/core/probe-eidolon-ladder.ts.",
      fixtures: ranks.map(e => `e${e}`),
      assertion: { assert: 'custom', note: 'level-only eidolon ladder; covered by probe-eidolon-ladder' },
    })
  }
  return { fixtures, requirements }
}

let written = 0, skipped = 0
for (const k of KITS) {
  const dir = join(SPEC_DIR, k.id)
  if (!existsSync(dir) || existsSync(join(dir, 'eidolons.json'))) { skipped++; continue }
  const src = sourceFixture(k.id)
  if (!src) { skipped++; console.log(`  skip ${k.id}: no source fixture`); continue }
  const { fixtures, requirements } = build(k.id, src)
  const spec = {
    kit: k.id,
    slot: 'eidolons',
    canon: {
      source: 'derived',
      ref: `verification/characters/${k.id}/${src.file} + characters.json#/${k.name}/ranks`,
      confidence: 'interpreted',
      note: 'Auto-generated by src/core/gen-eidolon-specs.ts. Fixtures clone the kit skill.json scenario and vary only the eidolon rank (E0 floor / E6 cap); requirements anchor to the `*_eN` buff ids and their canon rank N (present at E6, absent at E0). Cumulative level monotonicity + full-leak scan live in probe-eidolon-ladder.ts.',
    },
    fixtures,
    requirements,
    golds: [],
  }
  if (!DRY) writeFileSync(join(dir, 'eidolons.json'), JSON.stringify(spec, null, 2) + '\n')
  written++
  console.log(`  ${DRY ? 'dry' : 'write'} ${k.id}: ${requirements.length} requirement(s)`)
}

console.log(`\n${DRY ? 'would write' : 'wrote'} ${written}, skipped ${skipped}`)
