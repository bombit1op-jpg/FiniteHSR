import { t } from '../../suites'
import { allDefinitions, getDefinition, getVariant, getEnemyStat, parseToughness, resolveInstance } from '../../../src/core/enemy'

/** §51/§52 — enemy data model: 3-layer split, toughness model, resistance profile,
 *  stat resolution. Data-level only (no runtime instance — that is §53+). */
export default () => {
  const defs = allDefinitions()
  return [
    // ---- §51 catalog: raw rows → definitions → variants --------------------------
    t.eq('379 raw variant rows parsed', defs.reduce((n, d) => n + d.variants.length, 0), 379),
    t.eq('250 definitions (distinct baseName)', defs.length, 250),
    (() => { const ids = defs.flatMap(d => d.variants.map(v => v.variantId)); return t.eq('variantId unique (titles)', new Set(ids).size, ids.length) })(),

    // ---- §52 explicit-undefined stats -------------------------------------------
    (() => {
      const aon = getDefinition('"All or Nothing"')!
      const base = aon.variants.find(v => v.mode === '')!
      const as = aon.variants.find(v => v.mode === 'Apocalyptic Shadow')!
      return t.ok('base variant stats = undefined (explicit, not zero-filled)', base.stats === undefined && as.stats?.[80] !== undefined, `base=${base.stats === undefined} as=${as.stats?.[80] !== undefined}`)
    })(),

    // ---- §52.1 toughness model ---------------------------------------------------
    t.eq('tough "30" → primary 30', parseToughness('30').primary, 30),
    t.eq('tough "30" → one segment', JSON.stringify(parseToughness('30').segments), JSON.stringify([{ max: 30, count: 1 }])),
    t.eq('tough "120 ×8" → count 8', JSON.stringify(parseToughness('120 ×8').segments), JSON.stringify([{ max: 120, count: 8 }])),
    (() => { const tm = parseToughness('80 (×10)'); return t.eq('tough "80 (×10)" → one bar of count 10', JSON.stringify([tm.primary, tm.segments]), JSON.stringify([80, [{ max: 80, count: 10 }]])) })(),
    (() => {
      const tm = parseToughness('60 ×3 (Phase 1/2) 36 ×9 (Phase 3)')
      return t.eq('multi-bar phase toughness segments', JSON.stringify([tm.primary, tm.segments, tm.phases?.map(p => p.phase)]),
        JSON.stringify([60, [{ max: 60, count: 3 }, { max: 36, count: 9 }], ['Phase 1/2', 'Phase 3']]))
    })(),
    (() => {
      const sept = getVariant('"Harmonious Choir" The Great Septimus')!
      return t.eq('Septimus phase toughness from raw row', JSON.stringify(sept.toughnessModel.phases?.map(p => [p.phase, p.segments])),
        JSON.stringify([['Phase 1/2', [{ max: 60, count: 3 }]], ['Phase 3', [{ max: 36, count: 9 }]]]))
    })(),
    (() => { const g = parseToughness('The Past, Present, and Eternal Show'); return t.ok('unparseable toughness → unknown (not silent 0)', g.unknown && g.primary === 0) })(),

    // ---- §52.2 resistance profile -----------------------------------------------
    (() => {
      const r = getVariant('Stellaron Hunter: Sam')!.resistanceProfile
      return t.eq('Sam RES Ph/Fire/Ice/Wind = 0.2', JSON.stringify([r.Physical, r.Fire, r.Ice, r.Wind]), JSON.stringify([0.2, 0.2, 0.2, 0.2]))
    })(),
    (() => {
      const r = getVariant('Stellaron Hunter: Sam')!.resistanceProfile
      return t.ok('Sam RES Lightning/Quantum/Imaginary = undefined', r.Lightning === undefined && r.Quantum === undefined && r.Imaginary === undefined)
    })(),

    // ---- §52 stat resolver -------------------------------------------------------
    (() => {
      const sam = getVariant('Stellaron Hunter: Sam')!
      return t.eq('Sam lv80 raw hp row', getEnemyStat(sam, 'hp', { level: 80 }), 688251)
    })(),
    (() => {
      const sam = getVariant('Stellaron Hunter: Sam')!
      return t.eq('Sam lv120 raw hp/spd rows', JSON.stringify([getEnemyStat(sam, 'hp', { level: 120 }), getEnemyStat(sam, 'spd', { level: 120 })]), JSON.stringify([6767428, 180]))
    })(),
    (() => {
      const sam = getVariant('Stellaron Hunter: Sam')!
      return t.ok('absent level row → undefined (explicit)', getEnemyStat(sam, 'hp', { level: 55 }) === undefined)
    })(),
    (() => {
      const sam = getVariant('Stellaron Hunter: Sam')!
      return t.eq('stage modifier applies multiplicatively', getEnemyStat(sam, 'hp', { level: 80, stageMul: { hp: 2 } }), 688251 * 2)
    })(),

    // ---- §51 resolved instance view ---------------------------------------------
    (() => {
      const def = getDefinition('Stellaron Hunter: Sam')!
      const v = getVariant('Stellaron Hunter: Sam')!
      const ri = resolveInstance(def, v, 80)
      return t.eq('instance carries definitionId/variantId/weaknesses', JSON.stringify([ri.definitionId, ri.variantId, ri.weaknesses]),
        JSON.stringify([def.id, v.title, v.weaknesses]))
    })(),

    // ---- §51 deterministic variant selection ------------------------------------
    (() => {
      const v = getVariant('"Past Confined and Caged"')!
      const def = getDefinition('"Past Confined and Caged"')!
      return t.ok('baseName dup → base (mode "") variant, deterministic', v.mode === '' && def.variants.length === 3, `mode=${JSON.stringify(v.mode)} variants=${def.variants.length}`)
    })(),
  ]
}
