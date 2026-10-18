/**
 * §64 — third production boss profile with a real §56 phase machine:
 * "Savage God, Mad King, Incarnation of Strife" (Boss, Imaginary, 240 Toughness).
 *
 * Shipping in `src/core/enemy/profiles.ts`, seeded into the registry at import — the battle below
 * wires NOTHING test-side. The boss has two in-game phases with distinct attack sets; the phase
 * transition swaps the usable abilities via `availableAbilities`. Covers the A–H lifecycle:
 *   A registration · B declared abilities + data values · C phase definitions ·
 *   D phase-1 behaviour · E transition announced · F transition ≠ death (identity/HP kept, set
 *   swapped) · G forward-only (never returns to phase 1) · H determinism + invariants.
 *
 * Known deviations (see TODO.md): the phase trigger (HP below 50%) is an authored decision — no
 * canonical source publishes it; the War Armor "per attack" timing and its flat `true`-kind
 * self-damage are authored decisions; Calamity Eternal / Glory / Titanic Corpus are not modelled
 * (no published trigger or damage value in hsr-data).
 */
import { run, raw, all } from '../../_helpers/battle'
import {
  enemyBehavior, evaluateEnemyPhase, enemyPhaseRuntimeOf, resetEnemyPhase,
  type EnemyPhaseDefinition,
} from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import type { SimApi } from '../../../src/core/kit'
import type { BattleLogger } from '../../../src/core/battlelog'
import type { Unit } from '../../../src/core/entities/Unit'
import type { EnemySpec } from '../../../src/core/battle'

const NAME = 'Savage God, Mad King, Incarnation of Strife'
const P1 = ['savage_lightning_spear', 'savage_hewing', 'savage_unceasing_flames', 'savage_sky_piercing_lance']
const P2 = ['savage_worldsplitting_spine', 'savage_survivors', 'savage_pyre', 'savage_ruination']

const SPEC: EnemySpec = {
  name: NAME, count: 1, hp: 12_000, spd: 158, level: 80,
  toughness: 240, weaknesses: ['Ice', 'Lightning', 'Quantum'], atk: 400, rank: 'boss',
}

/** minimal unit-level harness (mirrors phase.ts) to probe the *profile's own* phase definitions */
function harness() {
  const events: { type: string; payload: Record<string, unknown> }[] = []
  const logger = { emit: (e: { type: string; payload?: Record<string, unknown> }) => { events.push({ type: e.type, payload: e.payload ?? {} }) } } as unknown as BattleLogger
  const sim = {
    addBuff: (u: Unit, b: { id: string }) => { u.buffs.push(b as unknown as Unit['buffs'][number]) },
    removeBuff: (u: Unit, id: string) => { u.buffs = u.buffs.filter(b => b.id !== id) },
  } as unknown as SimApi
  const actor = (over: Partial<Unit> = {}): Unit => ({ id: 'e1', name: NAME, maxHp: 4000, hp: 4000, broken: false, weaknesses: ['Ice'], res: {}, buffs: [], ...over } as unknown as Unit)
  return { events, logger, sim, actor }
}

export default () => {
  // ---- A. registration: production profile, no test-side registerEnemyBehavior ----------------
  const beh = enemyBehavior(NAME)
  const abs = beh?.abilities ?? []
  const phases = beh?.phases ?? []
  const byId = new Map(abs.map(a => [a.id, a]))
  const eff = (id: string) => byId.get(id)?.effects[0] as { op: string; mult: number; adjMult?: number; hits?: number; elem?: string } | undefined

  const regCases = [
    raw('A: "Savage God, Mad King, Incarnation of Strife" is registered in production',
      beh !== undefined && abs.length === 8, `abilities=${abs.length}`),
    raw('A: the profile carries a two-phase machine',
      phases.length === 2 && phases[0]!.id === 'savage_p1' && phases[1]!.id === 'savage_p2', phases.map(p => p.id).join(',')),
  ]

  // ---- B. declared abilities + data values ----------------------------------------------------
  const bCases = [
    raw('B: Lightning Spear — Single Target 240% Imaginary',
      byId.get('savage_lightning_spear')?.targetRule === 'single' && eff('savage_lightning_spear')?.op === 'attack'
        && eff('savage_lightning_spear')?.mult === 2.4 && eff('savage_lightning_spear')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_lightning_spear'))),
    raw('B: Hewing of the River of Souls — Single Target 360% Imaginary',
      eff('savage_hewing')?.op === 'attack' && eff('savage_hewing')?.mult === 3.6 && eff('savage_hewing')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_hewing'))),
    raw('B: Unceasing Flames of War — AoE 280% Imaginary',
      eff('savage_unceasing_flames')?.op === 'aoe' && eff('savage_unceasing_flames')?.mult === 2.8 && eff('savage_unceasing_flames')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_unceasing_flames'))),
    raw('B: Worldsplitting Spine — Blast 220%/180% Imaginary',
      byId.get('savage_worldsplitting_spine')?.targetRule === 'blast' && eff('savage_worldsplitting_spine')?.op === 'blast'
        && eff('savage_worldsplitting_spine')?.mult === 2.2 && eff('savage_worldsplitting_spine')?.adjMult === 1.8,
      JSON.stringify(eff('savage_worldsplitting_spine'))),
    raw('B: Survivors Unto Dead Waters — Single Target 400% Imaginary',
      eff('savage_survivors')?.op === 'attack' && eff('savage_survivors')?.mult === 4.0 && eff('savage_survivors')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_survivors'))),
    raw('B: Pyre of High Graves — AoE 320% Imaginary',
      eff('savage_pyre')?.op === 'aoe' && eff('savage_pyre')?.mult === 3.2 && eff('savage_pyre')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_pyre'))),
    raw('B: Sky-Piercing Lance — Bounce 120% ×5 Imaginary, random targets',
      byId.get('savage_sky_piercing_lance')?.targetRule === 'random' && eff('savage_sky_piercing_lance')?.op === 'bounce'
        && eff('savage_sky_piercing_lance')?.mult === 1.2 && eff('savage_sky_piercing_lance')?.hits === 5
        && eff('savage_sky_piercing_lance')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_sky_piercing_lance'))),
    raw('B: Ruination of Night and Light — Bounce 120% ×10 Imaginary, random targets',
      byId.get('savage_ruination')?.targetRule === 'random' && eff('savage_ruination')?.op === 'bounce'
        && eff('savage_ruination')?.mult === 1.2 && eff('savage_ruination')?.hits === 10
        && eff('savage_ruination')?.elem === 'Imaginary',
      JSON.stringify(eff('savage_ruination'))),
  ]

  // ---- C. phase definitions: condition + disjoint ability whitelists --------------------------
  const cCases = [
    raw('C: phase 2 starts under hpBelow 0.5',
      JSON.stringify(phases[1]!.start) === JSON.stringify({ hpBelow: 0.5 }), JSON.stringify(phases[1]!.start)),
    raw('C: phase 1 whitelists the phase-1 attack set',
      JSON.stringify(phases[0]!.availableAbilities) === JSON.stringify(P1), JSON.stringify(phases[0]!.availableAbilities)),
    raw('C: phase 2 whitelists the phase-2 attack set',
      JSON.stringify(phases[1]!.availableAbilities) === JSON.stringify(P2), JSON.stringify(phases[1]!.availableAbilities)),
    raw('C: the two phase ability sets are disjoint',
      P1.every(id => !P2.includes(id)), `${P1.join(',')} vs ${P2.join(',')}`),
  ]

  // ---- D/E/F/G. real battle through the normal EnemySpec path --------------------------------
  const battle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }, { kitId: 'luocha' }, { kitId: 'bailu' }], enemy: SPEC, cycles: 12 })
  const boss = battle.sim.roster.find(u => u.name === NAME)!
  const acts = all(battle, 'ABILITY_USED').filter(n => n.source === NAME).map(n => String(n.payload?.action))
  const phaseStarts = all(battle, 'PHASE_START').filter(n => n.source === NAME).map(n => String(n.payload?.phase))
  const phaseEnds = all(battle, 'PHASE_END').filter(n => n.source === NAME).map(n => String(n.payload?.phase))
  const bossDeaths = all(battle, 'DEATH').filter(n => n.target === NAME).length
  const firstP2 = acts.findIndex(a => P2.includes(a))

  const dCases = [
    raw('D: first action is the pattern head (Lightning Spear)', acts[0] === 'savage_lightning_spear', acts.slice(0, 4).join(',')),
    raw('D: phase 1 uses only the phase-1 attack set before the transition',
      firstP2 > 0 && acts.slice(0, firstP2).every(a => P1.includes(a)), acts.slice(0, firstP2).join(',')),
  ]
  const eCases = [
    raw('E: both phases are announced on the shared event bus',
      phaseStarts.includes('savage_p1') && phaseStarts.includes('savage_p2'), phaseStarts.join(',')),
    raw('E: exiting phase 1 emits PHASE_END', phaseEnds.includes('savage_p1'), phaseEnds.join(',')),
  ]
  const fCases = [
    raw('F: the transition swaps the usable ability set (all 8 abilities run)',
      new Set(acts).size === 8 && firstP2 > 0 && acts.slice(firstP2).every(a => P2.includes(a)), acts.join(',')),
    raw('F: transition is not death — the boss survives with its identity and HP pool',
      !boss.dead && bossDeaths === 0 && boss.hp > 0 && boss.maxHp === SPEC.hp,
      `dead=${boss.dead} deaths=${bossDeaths} hp=${Math.round(boss.hp)}/${boss.maxHp}`),
    raw('F: element rides the shared HIT_START event (Imaginary)',
      all(battle, 'HIT_START').filter(n => n.source === NAME).every(n => n.element === 'Imaginary'),
      [...new Set(all(battle, 'HIT_START').filter(n => n.source === NAME).map(n => String(n.element)))].join(',')),
  ]
  const gCases = [
    raw('G: phase 1 is entered exactly once (no backward transition)',
      phaseStarts.filter(p => p === 'savage_p1').length === 1, phaseStarts.join(',')),
    raw('G: the battle ends in phase 2 and phase 2 is never exited',
      phaseStarts[phaseStarts.length - 1] === 'savage_p2' && !phaseEnds.includes('savage_p2'), phaseEnds.join(',')),
  ]

  // ---- Bounce: random multi-hit through the shared pipeline (Sky-Piercing Lance / Ruination) ----
  const hitsOf = (label: string) => all(battle, 'HIT_START').filter(n => n.source === NAME && n.label === label)
  const allyNames = new Set(battle.sim.roster.filter(u => u.side === 'ally').map(u => u.name))
  const skyHits = hitsOf('Sky-Piercing Lance')
  const ruinHits = hitsOf('Ruination of Night and Light')
  const bounceCases = [
    raw('B: Sky-Piercing Lance resolves 5 hits per cast (Bounce ×5)',
      skyHits.length > 0 && skyHits.length % 5 === 0, `hits=${skyHits.length}`),
    raw('B: Ruination of Night and Light resolves 10 hits per cast (Bounce ×10)',
      ruinHits.length > 0 && ruinHits.length % 10 === 0, `hits=${ruinHits.length}`),
    raw('B: every Bounce hit lands on a living ally (random resolution, never the boss)',
      [...skyHits, ...ruinHits].length > 0 && [...skyHits, ...ruinHits].every(n => allyNames.has(String(n.target))),
      [...new Set([...skyHits, ...ruinHits].map(n => String(n.target)))].join(',')),
  ]

  // ---- War Armor (Polis Protector): the §57 passive on the profile ------------------------------
  // The status is authored data (src/core/enemy/passive.ts), applied at spawn and reacting through
  // the shared pipeline: one stack per attack, shatter at 0 (10% Max HP Imaginary self-damage + 10%
  // delay + 15% Max Energy to the attacker), restored to full at the end of the boss's own turn.
  const passive = beh?.passive
  const armorApplied = all(battle, 'BUFF_APPLIED').filter(n => String(n.payload?.id ?? '').startsWith('warArmor') && n.target === NAME)
  const armorCounter = armorApplied.filter(n => n.payload?.id === 'warArmor')
  const mitMod = (armorApplied.find(n => n.payload?.id === 'warArmorMit')?.payload?.mods as { stat: string; value: number }[] | undefined)?.[0]
  const armorSteps = all(battle, 'STAT_CHANGED').filter(n => n.payload?.stat === 'warArmor').map(n => `${n.payload?.before}->${n.payload?.after}`)
  const bossDelays = all(battle, 'ACTION_DELAY').filter(n => n.target === NAME).length
  const brokenApplied = armorApplied.some(n => n.payload?.id === 'warArmorBroken')
  const wCases = [
    raw('W: the profile declares War Armor through the §57 passive hooks',
      !!passive?.onSpawn && !!passive?.onHitTaken && !!passive?.onTurnEnd, Object.keys(passive ?? {}).join(',')),
    raw('W: the boss arms a 7-stack War Armor counter at spawn',
      armorCounter.length >= 1 && armorCounter[0]!.payload?.stacks === 7 && armorCounter[0]!.payload?.maxStacks === 7,
      `first=${armorCounter[0]?.payload?.stacks}/${armorCounter[0]?.payload?.maxStacks}`),
    raw('W: a companion buff applies −10% DMG taken (mitigation), not a stack-scaled −70%',
      mitMod?.stat === 'mitigation' && mitMod?.value === 0.10, JSON.stringify(mitMod)),
    raw('W: one stack is lost per attack and the armor shatters at 0',
      armorSteps.includes('7->6') && armorSteps.includes('1->0'), armorSteps.slice(0, 12).join(' ')),
    raw('W: shattering the armor delays the boss (10%)',
      bossDelays >= 1, `delays=${bossDelays}`),
    raw('W: the armor is destroyed, then restored to full at the end of the boss’s own turn',
      brokenApplied && armorCounter.length >= 2 && armorCounter.every(n => n.payload?.stacks === 7) && !boss.buffs.some(b => b.id === 'warArmorBroken'),
      `rearms=${armorCounter.length} broken=${brokenApplied}`),
  ]

  // ---- H. determinism + invariants ------------------------------------------------------------
  const sig = (c: ReturnType<typeof run>): string =>
    all(c, 'ABILITY_USED').filter(n => n.source === NAME).map(n => String(n.payload?.action)).join('|')
  const battle2 = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }, { kitId: 'luocha' }, { kitId: 'bailu' }], enemy: SPEC, cycles: 12 })
  const hCases = [
    raw('H: deterministic across runs (same seed → same enemy action trace)', sig(battle) === sig(battle2) && sig(battle).length > 0, sig(battle).slice(0, 40)),
    raw('H: invariants hold — no dedicated enemy damage engine', battle.sim.logger.verify().length === 0, battle.sim.logger.verify().join('; ')),
  ]

  // ---- unit-level: the profile's OWN phase machine (boundary + forward-only) ------------------
  const unitCases = (() => {
    const h = harness(); const a = h.actor()
    const p: EnemyPhaseDefinition[] = phases
    evaluateEnemyPhase(h.sim, h.logger, a, p, 0)
    const atFull = enemyPhaseRuntimeOf(a).index
    a.hp = 2000 // exactly 50% — hpBelow is strict
    evaluateEnemyPhase(h.sim, h.logger, a, p, 1)
    const atExactHalf = enemyPhaseRuntimeOf(a).index
    a.hp = 1999 // just under
    evaluateEnemyPhase(h.sim, h.logger, a, p, 2)
    const under = enemyPhaseRuntimeOf(a).index
    a.hp = 4000 // HP restored — must NOT move backward
    evaluateEnemyPhase(h.sim, h.logger, a, p, 3)
    const afterHeal = enemyPhaseRuntimeOf(a).index
    resetEnemyPhase(a)
    return [
      raw('C: full HP stays in phase 1', atFull === 0, String(atFull)),
      raw('C: exactly 50% stays in phase 1 (strict hpBelow)', atExactHalf === 0, String(atExactHalf)),
      raw('C: below 50% advances to phase 2', under === 1, String(under)),
      raw('G: HP restored above 50% does not return to phase 1', afterHeal === 1, String(afterHeal)),
    ]
  })()

  // ---- real encounter: the boss spawns and phases inside a wave-based encounter ---------------
  const enc: EncounterSpec = {
    id: 'savagegod-enc', mode: 'E2E Mock', cycles: 12,
    waves: [[{ ...SPEC }]],
    victoryCondition: 'All enemies down', defeatCondition: 'Team wiped',
  }
  const encBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }, { kitId: 'luocha' }, { kitId: 'bailu' }], encounter: enc })
  const encState = encounterStateOf(encBattle.sim)
  const encPhases = all(encBattle, 'PHASE_START').filter(n => n.source === NAME).map(n => String(n.payload?.phase))
  const encCases = [
    raw('F: boss spawns + runs its phase machine inside a real encounter',
      encPhases.includes('savage_p1') && encPhases.includes('savage_p2'), encPhases.join(',')),
    raw('A: encounter state tracks the wave', encState.currentWave >= 1, `wave=${encState.currentWave}`),
  ]

  return [
    ...regCases, ...bCases, ...cCases, ...unitCases,
    ...dCases, ...eCases, ...fCases, ...gCases, ...bounceCases, ...wCases, ...hCases, ...encCases,
  ]
}
