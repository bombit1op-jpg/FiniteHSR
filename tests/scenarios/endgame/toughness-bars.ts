/**
 * §64.1 — multi-layer intrinsic toughness (runtime). The enemy card model carries N layers
 * ("80 ×10", "60 ×3 (Phase 1/2) 36 ×9 (Phase 3)"). Each non-last layer empties into a damage-only
 * Break: Break DMG on the still-intact target (×0.9), but no debuff / delay / `broken` / break
 * triggers — the next layer becomes current. Only the last layer is the full Weakness Break.
 * Recovery restores the whole stack, not just the broken layer.
 */
import { prepareBattle, type EnemySpec } from '../../../src/core/battle'
import { enemyAtLevel } from '../../../src/core/endgame'
import { raw, all, type Ctx } from '../../_helpers/battle'
import { normalize } from '../../../src/verification/TraceMatcher'
import type { Simulator } from '../../../src/core/simulator'
import type { Elem, Unit } from '../../../src/core/entities/Unit'

const nodesOf = (sim: Simulator): Ctx => ({ nodes: normalize(sim.logger.events), sim, buffLog: sim.buffLog, logLines: sim.logLines } as unknown as Ctx)
const events = (sim: Simulator, type: string) => all(nodesOf(sim), type)

const barSpec = (bars?: number[]): EnemySpec => ({
  name: 'Bar Boss', count: 1, hp: 1e9, spd: 1, level: 80,
  toughness: bars?.[0] ?? 30, ...(bars ? { toughnessBars: bars } : {}), weaknesses: ['Fire'], atk: 500,
})

/** fresh deterministic battle with a N-layer enemy, imperative control (no battle start) */
const mk = (bars?: number[]) => {
  const sim = prepareBattle({ cycles: 2, seed: 7, log: { debug: 5 }, team: [{ kitId: 'firefly' }], enemy: barSpec(bars) })
  const ally = sim.roster.find(u => u.side === 'ally' && u.kind === 'char')!
  const foe = sim.roster.find(u => u.side === 'enemy')!
  return { sim, ally, foe }
}

/** one controlled hit: exact Toughness DMG, exact element, no crit. */
const hit = (sim: Simulator, from: Unit, to: Unit, toughDmg: number, label: string, elem: Elem = 'Fire'): void => {
  sim.hit(from, to, { type: 'basic', mult: 1, elem, toughDmg, canCrit: false, label })
}

/** normalized per-event signature of a full break-then-3-hit battle */
function runBattleSeq(bars: number[]): string {
  const { sim, ally, foe } = mk(bars)
  hit(sim, ally, foe, 30, 'h1')
  hit(sim, ally, foe, 30, 'h2')
  hit(sim, ally, foe, 30, 'h3')
  return normalize(sim.logger.events).map(n => `${n.type}|${n.source ?? ''}|${n.target ?? ''}`).join('\n')
}

export default () => {
  // ---- data: count>1 flatten (Cacophonic Conductor 80 ×10) -------------------------------
  const cac = enemyAtLevel('Cacophonic Conductor', 80)
  // ---- data: phase-segmented flatten (60 ×3 then 36 ×9), per-segment bars -----------------
  const sept = enemyAtLevel('"Harmonious Choir" The Great Septimus', 80)
  const cocolia = enemyAtLevel('Cocolia, Mother of Deception', 80)

  // ---- 1. first bar: damage-only Break, next bar becomes current -------------------------
  const { sim: s1, ally: a1, foe: f1 } = mk([30, 30, 30])
  hit(s1, a1, f1, 30, 'h1')
  const firstDepleted = events(s1, 'TOUGHNESS_BAR_DEPLETED')
  const firstHpLoss = events(s1, 'BREAK_DAMAGE').reduce((n, x) => n + (typeof x.payload?.amount === 'number' ? x.payload.amount : 0), 0)

  // ---- 2. wrong element: no toughness damage on a non-weak hit ----------------------------
  const { sim: s2, ally: a2, foe: f2 } = mk([30])
  hit(s2, a2, f2, 30, 'ice-hit', 'Ice')
  const wrongElemOk = events(s2, 'TOUGHNESS_DAMAGE').length === 0 && f2.toughness === 30

  // ---- 3. several bars in a row: each layer depletes with a Break, enemy never breaks -------
  const { sim: s3, ally: a3, foe: f3 } = mk([30, 30, 30])
  hit(s3, a3, f3, 30, 'h1'); hit(s3, a3, f3, 30, 'h2')
  const twoDepleted = events(s3, 'TOUGHNESS_BAR_DEPLETED')
  const twoHoldOk = twoDepleted.length === 2 && events(s3, 'WEAKNESS_BREAK').length === 0 && !f3.broken

  // ---- 4. multihit attack: two hits of one activation deplete two layers, no Weakness Break --
  const { sim: s4, ally: a4, foe: f4 } = mk([30, 30, 30])
  hit(s4, a4, f4, 30, 'mh'); hit(s4, a4, f4, 30, 'mh')
  const mhDepleted = events(s4, 'TOUGHNESS_BAR_DEPLETED')

  // ---- 5. last bar: full Weakness Break (broken flag, toughness 0) -------------------------
  const { sim: s5, ally: a5, foe: f5 } = mk([30, 30, 30])
  hit(s5, a5, f5, 30, 'h1'); hit(s5, a5, f5, 30, 'h2'); hit(s5, a5, f5, 30, 'h3')
  const fiveDepleted = events(s5, 'TOUGHNESS_BAR_DEPLETED')
  const fiveBreaks = events(s5, 'WEAKNESS_BREAK').length
  const lastHoldOk = fiveDepleted.length === 2 && fiveBreaks === 1 && f5.broken && f5.toughness === 0 && f5.toughBarIndex === 2

  // ---- 6. recovery: full stack restored (refill primitive; TurnManager also clears broken) --
  s5.refillToughness(f5)
  const recoveryOk = f5.toughBarIndex === 0 && f5.maxToughness === 30 && f5.toughness === 30

  // ---- 7. single-bar enemy: no bar state, hit exhausts straight into a Weakness Break -------
  const { sim: s7, ally: a7, foe: f7 } = mk()
  const singleSetupOk = f7.toughBarIndex === undefined && f7.toughnessBars === undefined
  hit(s7, a7, f7, 30, 'only')
  const singleHitOk = events(s7, 'WEAKNESS_BREAK').length === 1 && events(s7, 'TOUGHNESS_BAR_DEPLETED').length === 0 && f7.broken

  // ---- 8. determinism: same config + seed → identical event sequence -----------------------
  const a = runBattleSeq([30, 30, 30])
  const b = runBattleSeq([30, 30, 30])
  const determinismOk = a === b

  // ---- exo bars (unified resolver, Fugue Cloudflame Luster) --------------------------------
  // A source-bound secondary bar (40% Max Toughness) that only drains once the main bar is Broken
  // and re-Breaks on empty, regardless of Weakness Type. `mkExo` registers the bar imperatively
  // (the real source would be fugueKit.perform → registerExoBar).
  const mkExo = () => {
    const sim = prepareBattle({ cycles: 2, seed: 7, log: { debug: 5 }, team: [{ kitId: 'fugue' }, { kitId: 'firefly' }], enemy: barSpec([30, 30]) })
    const owner = sim.roster.find(u => u.kitId === 'fugue' && u.side === 'ally')!
    const foe = sim.roster.find(u => u.side === 'enemy')!
    sim.registerExoBar(owner, { id: 'cloudflame', pct: 0.4, label: 'Cloudflame Break' })
    return { sim, owner, foe }
  }
  /** break a 2-layer [30,30] enemy fully → the foe is Broken with the exo bar still intact */
  const breakMain = (sim: Simulator, from: Unit, to: Unit) => { hit(sim, from, to, 30, 'main1'); hit(sim, from, to, 30, 'main2') }

  // ---- 9. exo bar drains only after the main bar is Broken, then re-Breaks once -------------
  const { sim: s9, owner: o9, foe: f9 } = mkExo()
  breakMain(s9, o9, f9)
  const exoBeforeDrain = events(s9, 'SECONDARY_BAR_EMPTIED').length
  hit(s9, o9, f9, 20, 'exo') // 20 ≥ round(30×0.4)=12 → empties the exo bar
  const exoAfterDrain = events(s9, 'SECONDARY_BAR_EMPTIED').length
  const exoRebreakOk = exoBeforeDrain === 0 && exoAfterDrain === 1 && events(s9, 'WEAKNESS_BREAK').length === 2

  // ---- 10. exo bar ignores Weakness Type: a non-weak hit still drains it --------------------
  const { sim: s10, owner: o10, foe: f10 } = mkExo()
  breakMain(s10, o10, f10)
  hit(s10, o10, f10, 20, 'exo-ice', 'Ice') // Ice ∉ {Fire} — intrinsic would do nothing, exo still drains
  const exoPierceOk = events(s10, 'SECONDARY_BAR_EMPTIED').length === 1 && events(s10, 'WEAKNESS_BREAK').length === 2

  /** real production recovery: drive the enemy's own turn so `turnPrologue` runs the Weakness Break
   *  recovery (no direct `broken` mutation) — the same method `BattleEngine.loop` calls. */
  const recover = (sim: Simulator, foe: Unit) => sim.takeTurn(foe)

  // ---- 11 (B). hit before recovery: exo is exhausted once per Broken state — no second re-Break --
  const { sim: s11, owner: o11, foe: f11 } = mkExo()
  breakMain(s11, o11, f11)
  hit(s11, o11, f11, 20, 'exo1') // empties → one re-Break
  const b1 = events(s11, 'SECONDARY_BAR_EMPTIED').length
  const wb1 = events(s11, 'WEAKNESS_BREAK').length
  hit(s11, o11, f11, 20, 'exo1b') // still Broken, bar exhausted → must NOT re-Break again
  hit(s11, o11, f11, 20, 'exo1c')
  const exoOnceOk = b1 === 1 && wb1 === 2
    && events(s11, 'SECONDARY_BAR_EMPTIED').length === 1 && events(s11, 'WEAKNESS_BREAK').length === 2

  // ---- 12 (G). dead source drops its exo bars: no re-Break after Fugue dies ------------------
  const { sim: s12, owner: o12, foe: f12 } = mkExo()
  breakMain(s12, o12, f12)
  s12.kill(f12, o12)
  hit(s12, o12, f12, 20, 'exo-dead')
  const exoClearOk = events(s12, 'SECONDARY_BAR_EMPTIED').length === 0 && events(s12, 'WEAKNESS_BREAK').length === 1

  // ---- 13 (F). intrinsic + exo combined: exo stays intact through intermediate (unbroken) layers
  const { sim: s13, owner: o13, foe: f13 } = mkExo()
  hit(s13, o13, f13, 30, 'layer1') // [30,30] → layer 1 depletes, damage-only, NOT broken
  hit(s13, o13, f13, 20, 'intact-hit') // 20 tough on layer 2 (30) → still intact, no break
  const combinedOk = events(s13, 'TOUGHNESS_BAR_DEPLETED').length === 1 && !f13.broken
    && events(s13, 'SECONDARY_BAR_EMPTIED').length === 0 && f13.toughBarIndex === 1

  // ---- 14 (C). recovery after PARTIAL exo drain → bar refills to full Max (not the leftover) --
  // break, drain 5 of 12 (7 left), recover via the real path, break again and deal 8:
  // a full 12-bar survives (12-8=4), a stale 7-bar would empty (7-8<0). Proves it reset to max.
  const { sim: s14, owner: o14, foe: f14 } = mkExo()
  breakMain(s14, o14, f14)
  hit(s14, o14, f14, 5, 'partial') // exo 12 → 7, no re-Break
  const partialNoBreak = events(s14, 'SECONDARY_BAR_EMPTIED').length === 0
  recover(s14, f14)
  const recoveredFull = !f14.broken && f14.toughness === 30 && f14.toughBarIndex === 0
  breakMain(s14, o14, f14)
  hit(s14, o14, f14, 8, 'after-recovery')
  const exoResetOk = partialNoBreak && recoveredFull && events(s14, 'SECONDARY_BAR_EMPTIED').length === 0

  // ---- 15 (D/E). full drain → real recovery → new cycle drains exo again (one re-Break per cycle)
  const { sim: s15, owner: o15, foe: f15 } = mkExo()
  breakMain(s15, o15, f15)
  hit(s15, o15, f15, 20, 'exo1') // cycle 1: re-Break
  recover(s15, f15)
  const recoveredFull15 = !f15.broken && f15.toughBarIndex === 0 && f15.toughness === 30
  breakMain(s15, o15, f15) // cycle 2 main Break
  hit(s15, o15, f15, 20, 'exo2') // cycle 2: re-Break again
  const exoCycleOk = recoveredFull15
    && events(s15, 'SECONDARY_BAR_EMPTIED').length === 2 && events(s15, 'WEAKNESS_BREAK').length === 4

  // ---- 16 (H). determinism of the exo lifecycle: same seed/config → identical sequence ---------
  const lifecycle = (): string => {
    const { sim, owner, foe } = mkExo()
    breakMain(sim, owner, foe)
    hit(sim, owner, foe, 20, 'exo1')
    hit(sim, owner, foe, 20, 'exo1b')
    recover(sim, foe)
    breakMain(sim, owner, foe)
    hit(sim, owner, foe, 20, 'exo2')
    return normalize(sim.logger.events).map(n => `${n.type}|${n.source ?? ''}|${n.target ?? ''}`).join('\n')
  }
  const lifecycleDetOk = lifecycle() === lifecycle()

  return [
    raw('1 data: Cacophonic 80 ×10 → ten 80-layers, primary 80',
      cac !== undefined && cac.toughness === 80 && cac.toughnessBars?.length === 10 && cac.toughnessBars.every(v => v === 80),
      JSON.stringify(cac?.toughnessBars)),
    raw('1 data: Septimus phase bars flatten in order (60 ×3, 36 ×9)',
      sept !== undefined && sept.toughness === 60 && sept.toughnessBars?.length === 12
        && sept.toughnessBars.slice(0, 3).every(v => v === 60) && sept.toughnessBars.slice(3).every(v => v === 36),
      JSON.stringify(sept?.toughnessBars)),
    raw('1 data: Cocolia multi-phase → one bar per phase (180, 160)',
      cocolia !== undefined && cocolia.toughness === 180 && JSON.stringify(cocolia.toughnessBars) === '[180,160]',
      JSON.stringify(cocolia?.toughnessBars)),
    raw('2 first bar: damage-only Break — depleted event, Break DMG, no Weakness Break, next bar current',
      firstDepleted.length === 1 && firstDepleted[0]!.payload?.bar === 1 && firstDepleted[0]!.payload?.bars === 3
        && firstHpLoss > 0 && events(s1, 'WEAKNESS_BREAK').length === 0 && !f1.broken,
      `depleted=${firstDepleted.length} hpLoss=${firstHpLoss} broken=${f1.broken}`),
    raw('2 wrong element: non-weak hit does no toughness damage',
      wrongElemOk, `tough=${f2.toughness} events=${events(s2, 'TOUGHNESS_DAMAGE').length}`),
    raw('3 several bars in a row: two damage-only Breaks, enemy never broken',
      twoHoldOk, `depleted=${twoDepleted.length} broken=${f3.broken}`),
    raw('4 multihit attack: two hits of one activation deplete two layers',
      mhDepleted.length === 2 && events(s4, 'WEAKNESS_BREAK').length === 0 && !f4.broken,
      `depleted=${mhDepleted.length}`),
    raw('5 last bar: full Weakness Break — broken flag set, toughness 0',
      lastHoldOk, `depleted=${fiveDepleted.length} breaks=${fiveBreaks} broken=${f5.broken} idx=${f5.toughBarIndex}`),
    raw('6 recovery: full multi-layer stack restored',
      recoveryOk, `idx=${f5.toughBarIndex} max=${f5.maxToughness} tough=${f5.toughness}`),
    raw('7 single-bar enemy: no bar state, hit breaks directly',
      singleSetupOk && singleHitOk, `idx=${f7.toughBarIndex} breaks=${events(s7, 'WEAKNESS_BREAK').length} broken=${f7.broken}`),
    raw('8 determinism: same config + seed → identical event sequence',
      determinismOk, a === b ? 'match' : 'MISMATCH'),
    raw('9 exo bar: drains only after the main bar is Broken, then re-Breaks (broken → empty → WEAKNESS_BREAK)',
      exoRebreakOk, `before=${exoBeforeDrain} after=${exoAfterDrain} breaks=${events(s9, 'WEAKNESS_BREAK').length}`),
    raw('10 exo bar: ignores Weakness Type — a non-weak (Ice) hit still drains and re-Breaks',
      exoPierceOk, `secondary=${events(s10, 'SECONDARY_BAR_EMPTIED').length} breaks=${events(s10, 'WEAKNESS_BREAK').length}`),
    raw('11 (B) exo bar: drains once per Broken state — hits before recovery do NOT re-Break twice',
      exoOnceOk, `first-secondary=${b1} first-breaks=${wb1} secondary=${events(s11, 'SECONDARY_BAR_EMPTIED').length} breaks=${events(s11, 'WEAKNESS_BREAK').length}`),
    raw('12 (G) exo bar: dead source drops its bars (onUnitDeath → clearExoBars) — no re-Break after death',
      exoClearOk, `secondary=${events(s12, 'SECONDARY_BAR_EMPTIED').length} breaks=${events(s12, 'WEAKNESS_BREAK').length}`),
    raw('13 (F) intrinsic + exo combined: exo stays intact through intermediate (damage-only) layers',
      combinedOk, `depleted=${events(s13, 'TOUGHNESS_BAR_DEPLETED').length} broken=${f13.broken} secondary=${events(s13, 'SECONDARY_BAR_EMPTIED').length} idx=${f13.toughBarIndex}`),
    raw('14 (C) recovery after partial exo drain → bar refills to full Max, not the leftover',
      exoResetOk, `partialNoBreak=${partialNoBreak} recoveredFull=${recoveredFull} secondary=${events(s14, 'SECONDARY_BAR_EMPTIED').length}`),
    raw('15 (D/E) full drain → real recovery → next cycle drains exo again (one re-Break per cycle)',
      exoCycleOk, `recoveredFull=${recoveredFull15} secondary=${events(s15, 'SECONDARY_BAR_EMPTIED').length} breaks=${events(s15, 'WEAKNESS_BREAK').length}`),
    raw('16 (H) exo lifecycle determinism: same config + seed → identical event sequence',
      lifecycleDetOk, lifecycleDetOk ? 'match' : 'MISMATCH'),
  ]
}