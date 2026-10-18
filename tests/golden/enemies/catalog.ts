import { t } from '../../suites'
import { allDefinitions, ELEMS, type EnemyRank } from '../../../src/core/enemy'
import { enemyCoverage, enemyCoverageSummary } from '../../../src/core/enemy/coverage'

/** §85.E2 — catalog-wide DATA invariants over `hsr-data/enemies.json`.
 *
 *  `model.ts` pins a handful of hand-picked §51/§52 examples (Sam, Septimus, "All or Nothing");
 *  this suite asserts the invariants that must hold for EVERY variant/definition, and pins the
 *  measured anomalies as explicit known deviations rather than letting them drift silently.
 *  Data-level only — no battle, no runtime instance (§53+ is elsewhere). */

const RANKS: EnemyRank[] = ['mob', 'elite', 'boss']
const ELSET = new Set<string>(ELEMS)

const countBy = <T extends string | number>(xs: T[]): Map<T, number> => {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}
const dist = <T extends string | number>(xs: T[]): Record<string, number> =>
  Object.fromEntries([...countBy(xs).entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))

export default () => {
  const defs = allDefinitions()
  const variants = defs.flatMap(d => d.variants.map(v => ({ d, v })))
  const stats = variants.flatMap(x => Object.values(x.v.stats ?? {}))

  const cases = [
    // ---- catalog shape ----------------------------------------------------------
    t.eq('250 definitions (distinct baseName)', defs.length, 250),
    t.eq('379 raw variant rows folded', variants.length, 379),
    t.eq('variants per definition', JSON.stringify(dist(defs.map(d => d.variants.length))), JSON.stringify({ '1': 152, '2': 70, '3': 25, '4': 3 })),
    t.eq('rank split by variant row', JSON.stringify(dist(variants.map(x => x.v.rank))), JSON.stringify({ boss: 93, elite: 98, mob: 188 })),
    t.eq('rank split by definition', JSON.stringify(dist(defs.map(d => d.defaultRank))), JSON.stringify({ boss: 62, elite: 55, mob: 133 })),

    // ---- identity integrity -----------------------------------------------------
    t.eq('every variant.rank is a valid rank', variants.filter(x => !RANKS.includes(x.v.rank)).length, 0),
    t.eq('every definition.defaultRank is valid', defs.filter(d => !RANKS.includes(d.defaultRank)).length, 0),
    t.eq('variant.baseName always equals its definition baseName', variants.filter(x => x.v.baseName !== x.d.baseName).length, 0),
    (() => { const ids = variants.map(x => x.v.variantId); return t.eq('variantId unique across catalog', new Set(ids).size, ids.length) })(),
    t.eq('mode vocabulary', JSON.stringify([...new Set(variants.map(x => x.v.mode))].sort()), JSON.stringify(['', '1', '2', 'Aether Spirit Enemy', 'Apocalyptic Shadow', 'Boss', 'Bug', 'Complete', 'Enemy', 'Giant', 'Illusion', 'Phase 1', 'Phase 2', 'Phase 3', 'Projection', 'Synthetic'])),
    t.eq('definitions WITH a base (mode "") variant', defs.filter(d => d.variants.some(v => v.mode === '')).length, 232),
    t.eq('definitions WITHOUT a base variant (story/phase-only rows)', defs.filter(d => !d.variants.some(v => v.mode === '')).length, 18),
    t.eq('no definition has two base variants', defs.filter(d => d.variants.filter(v => v.mode === '').length > 1).length, 0),

    // ---- weaknesses -------------------------------------------------------------
    t.eq('every weakness is a known element', variants.filter(x => x.v.weaknesses.some(w => !ELSET.has(w))).length, 0),
    t.eq('no variant has a duplicate weakness', variants.filter(x => new Set(x.v.weaknesses).size !== x.v.weaknesses.length).length, 0),

    // ---- damage RES profile -----------------------------------------------------
    (() => {
      const keys = new Set<string>()
      const vals: number[] = []
      for (const x of variants) for (const [k, v] of Object.entries(x.v.resistanceProfile)) { keys.add(k); vals.push(v as number) }
      return t.ok('RES keys ⊆ the 7 elements (no allType in current data)', [...keys].every(k => ELSET.has(k)), JSON.stringify([...keys]))
    })(),
    (() => {
      const vals = variants.flatMap(x => Object.values(x.v.resistanceProfile)) as number[]
      return t.ok('RES values finite, within [-0.2, 0.8], never 0 (0% rows are dropped)', vals.every(v => Number.isFinite(v) && v >= -0.2 && v <= 0.8 && v !== 0), `min=${Math.min(...vals)} max=${Math.max(...vals)}`)
    })(),

    // ---- debuff RES profile -----------------------------------------------------
    t.eq('debuffRes present on 377 / 379 variants', variants.filter(x => x.v.effectResistanceProfile).length, 377),
    (() => { const absent = variants.filter(x => !x.v.effectResistanceProfile).map(x => x.v.title); return t.eq('debuffRes absent exactly on the two untyped base rows', JSON.stringify(absent.sort()), JSON.stringify(['"All or Nothing"', 'Ecliptic Inner Beast & Shadow of "Feixiao"'].sort())) })(),
    t.eq('every debuffRes row has the 8 documented columns', variants.filter(x => x.v.effectResistanceProfile && x.v.effectResistanceProfile.values.length !== 8).length, 0),
    t.eq('debuffRes values are non-negative', variants.filter(x => x.v.effectResistanceProfile?.values.some(v => v < 0)).length, 0),
    (() => {
      const over1 = [...new Set(variants.filter(x => Object.values(x.v.stats ?? {}).some(r => r.effectRes > 1)).map(x => x.v.title))].sort()
      return t.eq('KNOWN DEVIATION: only Cirrus (Boss/Complete) stat effectRes > 1 (raw 110%)', JSON.stringify(over1), JSON.stringify(['Cirrus (Boss)', 'Cirrus (Complete)']))
    })(),

    // ---- toughness model --------------------------------------------------------
    t.eq('toughness unknown ⟺ no parsed segment', variants.filter(x => x.v.toughnessModel.unknown !== (x.v.toughnessModel.segments.length === 0)).length, 0),
    t.eq('primary equals first segment max (when known)', variants.filter(x => !x.v.toughnessModel.unknown && x.v.toughnessModel.primary !== x.v.toughnessModel.segments[0]!.max).length, 0),
    t.eq('every segment has count >= 1 and max >= 0 (0 = no break bar)', variants.filter(x => x.v.toughnessModel.segments.some(s => s.count < 1 || s.max < 0)).length, 0),
    t.eq('unknown toughness count (unparseable raw string)', variants.filter(x => x.v.toughnessModel.unknown).length, 35),
    t.eq('variants carrying phase-specific toughness', variants.filter(x => x.v.toughnessModel.phases).length, 3),
    (() => {
      const zero = variants.filter(x => !x.v.toughnessModel.unknown && x.v.toughnessModel.primary === 0)
      return t.ok('KNOWN: zero-toughness variants carry a "0" raw bar, not unknown', zero.length > 0 && zero.every(x => x.v.toughnessModel.raw.trim() === '0'), `${zero.length} zero-toughness variants`)
    })(),

    // ---- stat tables ------------------------------------------------------------
    t.eq('stat rows across catalog', stats.length, 7700),
    t.eq('stat levels in [80, 120]', stats.filter(r => r.level < 80 || r.level > 120).length, 0),
    t.eq('every stat row has hp > 0', stats.filter(r => !(r.hp > 0)).length, 0),
    t.eq('every stat row has atk/def/spd finite and non-negative', stats.filter(r => !(Number.isFinite(r.atk) && r.atk >= 0 && Number.isFinite(r.def) && r.def >= 0 && Number.isFinite(r.spd) && r.spd >= 0)).length, 0),
    t.eq('every stat row has effectRes >= 0', stats.filter(r => !(r.effectRes >= 0)).length, 0),

    // ---- cross-check the coverage registry --------------------------------------
    (() => {
      const s = enemyCoverageSummary()
      return t.eq('coverage registry: 250 bases / 379 records / 250 behavioral', JSON.stringify([s.bases, s.records, s.behavioral]), JSON.stringify([250, 379, 250]))
    })(),
    t.eq('every coverage row baseName resolves to a definition', enemyCoverage().filter(r => !defs.some(d => d.baseName === r.baseName)).length, 0),
    t.eq('every coverage row records its true variant count', enemyCoverage().filter(r => r.variants !== (defs.find(d => d.baseName === r.baseName)?.variants.length ?? -1)).length, 0),
  ]
  return cases
}
