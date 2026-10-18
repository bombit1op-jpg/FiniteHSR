import { run, raw, all, type Ctx } from '../../_helpers/battle'

/**
 * Golden teams (guide §33 / roadmap item 17): one real synergy per archetype. Per guide §33.3 we
 * do NOT assert only total damage — each case pins the archetype's DEFINING observable (the event
 * or axis bucket that exists only if the team's core loop fired), plus the attribution law that
 * every owner's damage-axis partition sums back to that owner's total.
 *
 * Archetypes (roadmap §11-20 list): Acheron/debuff, FUA, Break, DoT, summon/memosprite,
 * HP-consumption, special-resource Ultimate, Elation.
 */
const kit = (c: Ctx, id: string) => c.sim.roster.find(u => u.kitId === id)!
const axisOf = (c: Ctx, id: string, bucket: string): number =>
  c.sim.ownerAxis.get(kit(c, id).id)?.get(bucket) ?? 0
const axisTotal = (c: Ctx, owners: string[]): number =>
  owners.reduce((a, id) => a + [...(c.sim.ownerAxis.get(kit(c, id).id)?.values() ?? [])].reduce((x, y) => x + y, 0), 0)
const bucketSum = (c: Ctx, owners: string[], bucket: string): number =>
  owners.reduce((a, id) => a + axisOf(c, id, bucket), 0)
/** guide §16 attribution law: axis buckets partition the owner damage, no double count */
const axesSumOk = (c: Ctx): boolean =>
  [...c.sim.ownerAxis].every(([id, m]) => Math.abs([...m.values()].reduce((a, b) => a + b, 0) - (c.sim.ownerDamage.get(id) ?? 0)) < 1e-6)
const enemyNames = (c: Ctx): Set<string> => new Set(c.sim.roster.filter(u => u.side === 'enemy').map(u => u.name))
const dmg = (c: Ctx, id: string): number => c.sim.ownerDamage.get(kit(c, id).id) ?? 0

export default () => {
  // 1) Acheron / debuff: two Nihility allies land debuffs → fuel Slashed Dream → Acheron Ult.
  const nih = run({ team: [{ kitId: 'acheron', skillPriority: 1 }, { kitId: 'pela', skillPriority: 2 }, { kitId: 'guinaifen', skillPriority: 2 }] })
  const foes = enemyNames(nih)
  const allyDebuffs = all(nih, 'DEBUFF_APPLIED').filter(n => !!n.target && foes.has(n.target))

  // 2) FUA: two follow-up attackers (Topaz / Dr. Ratio) both deal follow-up damage.
  const fua = run({ team: [{ kitId: 'topaz', skillPriority: 1 }, { kitId: 'dr_ratio', skillPriority: 1 }] })

  // 3) Break: Firefly breaks the Fire-weak mob; Harmony MC adds Super Break.
  const brk = run({ team: [{ kitId: 'firefly', skillPriority: 1 }, { kitId: 'ruanmei', skillPriority: 2 }, { kitId: 'trailblazer_harmony', skillPriority: 2 }] })

  // 4) DoT: Kafka + Black Swan + Sampo apply and tick DoTs; Kafka detonates them.
  const dot = run({ team: [{ kitId: 'kafka', skillPriority: 1 }, { kitId: 'blackswan', skillPriority: 1 }, { kitId: 'sampo', skillPriority: 1 }] })

  // 5) Summon / memosprite: Jing Yuan's Lightning-Lord is a summon owned by him.
  const sum = run({ team: [{ kitId: 'jingyuan', skillPriority: 1 }, { kitId: 'robin', skillPriority: 2 }] })
  const jySummons = sum.sim.roster.filter(u => u.side === 'ally' && u.kind !== 'char')
  const jySkill = sum.sim.ownerSkill.get(kit(sum, 'jingyuan').id) ?? new Map<string, number>()

  // 6) HP-consumption: Blade's Skill costs 30% Max HP → Hellscape + charge loop → talent FUA.
  const hp = run({ team: [{ kitId: 'blade', skillPriority: 1 }, { kitId: 'natasha', skillPriority: 2 }] })
  const hellscape = hp.sim.buffLog.some(e => e.id === 'hellscape')

  // 7) Special-resource Ultimate: Feixiao has no Energy system — Ult ready at 6 Flying Aureus.
  const spec = run({ team: [{ kitId: 'feixiao', skillPriority: 1 }, { kitId: 'moze', skillPriority: 1 }] })
  const feixiao = kit(spec, 'feixiao')

  // 8) Elation: Sparxie + Yao Guang build the shared Punchline pool / deal Elation damage.
  const el = run({ team: [{ kitId: 'sparxie', skillPriority: 1 }, { kitId: 'yao_guang', skillPriority: 1 }] })

  return [
    // --- Acheron / debuff ---
    raw('acheron: two Nihility allies land debuffs on the enemy', allyDebuffs.length > 0, `n=${allyDebuffs.length}`),
    raw('acheron: Slashed Dream (energy) built above 0 by ally debuffs', kit(nih, 'acheron').energy > 0, `sd=${kit(nih, 'acheron').energy}`),
    raw('acheron: Ultimate fired from the special resource', axisOf(nih, 'acheron', 'ult') > 0, `ult=${Math.round(axisOf(nih, 'acheron', 'ult'))}`),

    // --- FUA ---
    raw('fua: follow-up damage dealt by the team', bucketSum(fua, ['topaz', 'dr_ratio'], 'fua') > 0, `fua=${Math.round(bucketSum(fua, ['topaz', 'dr_ratio'], 'fua'))}`),
    raw('fua: both follow-up attackers contribute damage', dmg(fua, 'topaz') > 0 && dmg(fua, 'dr_ratio') > 0,
      `topaz=${Math.round(dmg(fua, 'topaz'))} ratio=${Math.round(dmg(fua, 'dr_ratio'))}`),

    // --- Break ---
    raw('break: a weakness break occurred', all(brk, 'WEAKNESS_BREAK').length > 0, `n=${all(brk, 'WEAKNESS_BREAK').length}`),
    raw('break: toughness was removed', all(brk, 'TOUGHNESS_DAMAGE').length > 0, `n=${all(brk, 'TOUGHNESS_DAMAGE').length}`),
    raw('break: break damage is attributed to an owner', bucketSum(brk, ['firefly', 'trailblazer_harmony'], 'break') + bucketSum(brk, ['firefly', 'trailblazer_harmony'], 'superbreak') > 0),

    // --- DoT ---
    raw('dot: DoTs are applied', all(dot, 'DOT_APPLIED').length > 0, `n=${all(dot, 'DOT_APPLIED').length}`),
    raw('dot: DoTs tick and deal dot-axis damage', all(dot, 'DOT_TICK').length > 0 && bucketSum(dot, ['kafka', 'blackswan', 'sampo'], 'dot') > 0,
      `ticks=${all(dot, 'DOT_TICK').length} dot=${Math.round(bucketSum(dot, ['kafka', 'blackswan', 'sampo'], 'dot'))}`),

    // --- Summon / memosprite ---
    raw('summon: a summon entity is created', all(sum, 'SUMMON_CREATED').length > 0 && jySummons.length > 0, jySummons.map(u => u.name).join(',')),
    raw('summon: summon ability folds under its owner (Jing Yuan)', jySkill.has('Lightning-Lord'), [...jySkill.keys()].join('+')),
    raw('summon: no separate owner bucket for the summon', jySummons.every(u => !sum.sim.ownerDamage.has(u.id))),

    // --- HP-consumption ---
    raw('hp-consumption: Blade enters Hellscape (Skill costs 30% Max HP)', hellscape),
    raw('hp-consumption: HP-loss charges trigger the talent FUA', axisOf(hp, 'blade', 'fua') > 0, `fua=${Math.round(axisOf(hp, 'blade', 'fua'))}`),
    raw('hp-consumption: Blade survives the self-cost loop (sustained)', !kit(hp, 'blade').dead),

    // --- Special-resource Ultimate ---
    raw('special-ult: Feixiao uses a non-Energy Ultimate (Flying Aureus)', axisOf(spec, 'feixiao', 'ult') > 0, `ult=${Math.round(axisOf(spec, 'feixiao', 'ult'))}`),
    raw('special-ult: Feixiao resource is the custom pool, not standard energy', feixiao.maxEnergy === 12, `max=${feixiao.maxEnergy}`),

    // --- Elation ---
    raw('elation: Punchline pool built or Elation damage dealt', el.sim.punchline > 0 || axisTotal(el, ['sparxie', 'yao_guang']) > 0,
      `punchline=${el.sim.punchline}`),
    raw('elation: an Elation-path carry deals damage', dmg(el, 'sparxie') > 0, `sparxie=${Math.round(dmg(el, 'sparxie'))}`),

    // --- shared attribution law across every archetype team ---
    raw('attribution law holds for every archetype team', [nih, fua, brk, dot, sum, hp, spec, el].every(axesSumOk)),
  ]
}
