/**
 * §64 — third production elite profile group: "Daybreak Squadron" (Azurewing / Blazeweaver /
 * Cinderborne / Dawnlance — Quantum / Fire / Physical / Imaginary, 120 Toughness).
 *
 * Shipping in `src/core/enemy/profiles.ts` and seeded into the registry at import, so the battles
 * below wire NOTHING test-side. The quartet shares one template; the cases assert registration, the
 * per-member damage element, the `require`-gated Forcefield state machine (Daybreak Will raises the
 * field + toggles the `guard` defense flags, Shadow Dance is gated to the field, Daybreak Dispersal
 * tears it down), the self-inflicted Disheartened debuff (`vulnAll` + target-side `resRed:<elem>`),
 * real resolution through the shared pipeline, determinism and a real encounter.
 *
 * Known deviations (see TODO.md): the number of Shadow Dances before Dispersal and the rotation
 * order are authored (the data publishes neither); Dispersal is a self-debuff.
 */
import { run, raw, all, type Ctx } from '../../_helpers/battle'
import { enemyBehavior, enemyDefenseOf } from '../../../src/core/enemy'
import { encounterStateOf, type EncounterSpec } from '../../../src/core/encounter'
import type { EnemySpec } from '../../../src/core/battle'
import type { Elem } from '../../../src/core/entities/Unit'

const FORCEFIELD = 'daybreak_forcefield'
const DISHEARTENED = 'daybreak_disheartened'

const MEMBERS: Record<string, Elem> = {
  'Daybreak Squadron: Azurewing': 'Quantum',
  'Daybreak Squadron: Blazeweaver': 'Fire',
  'Daybreak Squadron: Cinderborne': 'Physical',
  'Daybreak Squadron: Dawnlance': 'Imaginary',
}

const spec = (name: string): EnemySpec =>
  ({ name, count: 1, hp: 3_000_000, spd: 150, level: 80, toughness: 120, weaknesses: ['Physical', 'Lightning', 'Imaginary'], atk: 300 })

const actsOf = (b: Ctx, name: string) => all(b, 'ABILITY_USED').filter(n => n.source === name).map(n => String(n.payload?.action))
const notes = (b: Ctx) => b.sim.logger.events.filter(e => e.type === 'NOTE').map(e => String(e.raw ?? ''))

export default () => {
  // ---- registration + declared data values (all four members) --------------------------------
  const regCases: Array<ReturnType<typeof raw>> = []
  for (const [name, elem] of Object.entries(MEMBERS)) {
    const beh = enemyBehavior(name)
    const abs = beh?.abilities ?? []
    const byId = new Map(abs.map(a => [a.id, a]))
    const blade = byId.get('daybreak_blade')
    const wheel = byId.get('daybreak_flywheel')
    const will = byId.get('daybreak_will')
    const dance = byId.get('daybreak_shadow_dance')
    const dispel = byId.get('daybreak_dispersal')
    const guardOn = will?.effects.find(e => e.op === 'guard') as { op: string; controlImmune?: boolean; toughnessImmune?: boolean } | undefined
    const guardOff = dispel?.effects.find(e => e.op === 'guard') as { op: string; controlImmune?: boolean; toughnessImmune?: boolean } | undefined
    const dispelSelf = dispel?.effects.find(e => e.op === 'dispelSelf') as { op: string; id?: string } | undefined
    const heart = dispel?.effects.find(e => e.op === 'buff') as
      { op: string; to?: string; buff?: { id: string; debuff?: boolean; turns?: number; mods?: Array<{ stat: string; value: number }> } } | undefined
    const heartMods = heart?.buff?.mods ?? []
    regCases.push(raw(`daybreak: ${name} — registered with five abilities`, beh !== undefined && abs.length === 5, `abilities=${abs.length}`))
    regCases.push(raw(`daybreak: ${name} — Blade 400% + Flywheel 600/300% + Shadow Dance 800% all ${elem}`,
      (blade?.effects[0] as { mult?: number; elem?: string })?.mult === 4.0 && (blade?.effects[0] as { elem?: string })?.elem === elem
        && wheel?.targetRule === 'blast' && (wheel.effects[0] as { mult?: number })?.mult === 6.0
        && (wheel.effects[0] as { adjMult?: number })?.adjMult === 3.0 && (wheel.effects[0] as { elem?: string })?.elem === elem
        && (dance?.effects[0] as { mult?: number; elem?: string })?.mult === 8.0 && (dance?.effects[0] as { elem?: string })?.elem === elem,
      `${elem}`))
    regCases.push(raw(`daybreak: ${name} — Will raises the Forcefield (guard on) and gates Shadow Dance`,
      will?.charges === 1 && will?.require?.noBuff === FORCEFIELD && guardOn?.controlImmune === true && guardOn?.toughnessImmune === true
        && dance?.require?.buff === FORCEFIELD,
      `require=${JSON.stringify(will?.require)} guard=${JSON.stringify(guardOn)}`))
    regCases.push(raw(`daybreak: ${name} — Dispersal drops the field (guard off) and self-inflicts Disheartened (Vuln +30%, RES −40%)`,
      dispel?.charges === 1 && dispel?.require?.buff === FORCEFIELD && dispelSelf?.id === FORCEFIELD
        && guardOff?.controlImmune === false && guardOff?.toughnessImmune === false
        && heart?.to === 'self' && heart?.buff?.id === DISHEARTENED && heart?.buff?.debuff === true && heart?.buff?.turns === 2
        && heartMods.some(m => m.stat === 'vulnAll' && Math.abs(m.value - 0.30) < 1e-9)
        && heartMods.some(m => m.stat === `resRed:${elem}` && Math.abs(m.value - 0.40) < 1e-9),
      `mods=${JSON.stringify(heartMods)}`))
  }

  // ---- full battle: the state machine through one Azurewing rotation --------------------------
  const NAME = 'Daybreak Squadron: Azurewing'
  const battle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: spec(NAME), cycles: 8 })
  const enemy = battle.sim.roster.find(u => u.side === 'enemy')!
  const enemyName = enemy.name
  const actions = actsOf(battle, enemyName)
  const forcefield = all(battle, 'BUFF_APPLIED').some(n => n.payload?.id === FORCEFIELD)
  const heartApplied = all(battle, 'DEBUFF_APPLIED').filter(n => n.payload?.id === DISHEARTENED)
  const heartOnEnemy = heartApplied.some(n => n.payload?.targetId === enemy.id)
  const danceCount = actions.filter(a => a === 'daybreak_shadow_dance').length
  const elems = new Set(all(battle, 'HIT_START').filter(n => n.source === enemyName).map(n => String(n.element)))
  const dmgDealt = all(battle, 'DAMAGE_DEALT').filter(n => n.source === enemyName).reduce((s, n) => s + Number(n.payload?.amount ?? 0), 0)
  const raised = notes(battle).some(t => /raises a protective field/.test(t))
  const lowered = notes(battle).some(t => /lowers a protective field/.test(t))

  const battleCases = [
    raw('daybreak: rotation raises the Forcefield, dances (state-gated), then disperses it',
      actions.includes('daybreak_will') && danceCount >= 2 && actions.includes('daybreak_dispersal') && forcefield,
      actions.slice(0, 8).join(',')),
    raw('daybreak: Forcefield toggles the unit-defense flags on then off (guard op)',
      raised && lowered && enemyDefenseOf(enemy).defense.toughnessImmune === false,
      `raised=${raised} lowered=${lowered} toughImmune=${enemyDefenseOf(enemy).defense.toughnessImmune}`),
    raw('daybreak: Disheartened lands on the unit itself as a debuff (vulnAll)',
      heartApplied.length >= 1 && heartOnEnemy,
      `applied=${heartApplied.length} onEnemy=${heartOnEnemy}`),
    raw('daybreak: falls back to Blade/Flywheel after the field is gone',
      actions.includes('daybreak_blade') || actions.includes('daybreak_flywheel'),
      actions.join(',')),
    raw('daybreak: every landed hit is Quantum (single shared element)',
      elems.size === 1 && elems.has('Quantum'), [...elems].join(',')),
    raw('daybreak: damage lands as a real battle result (not just an id)', dmgDealt > 0, `dealt=${dmgDealt}`),
    raw('daybreak: invariants hold — no dedicated enemy damage engine', battle.sim.logger.verify().length === 0, battle.sim.logger.verify().join('; ')),
  ]

  // ---- determinism ---------------------------------------------------------------------------
  const sig = (c: Ctx): string => actsOf(c, enemyName).join('|')
  const battle2 = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: spec(NAME), cycles: 8 })
  const detCases = [
    raw('daybreak: deterministic across runs (same seed → same enemy trace)', sig(battle) === sig(battle2) && sig(battle).length > 0, sig(battle).slice(0, 40)),
  ]

  // ---- breadth: every member runs and lands its own element ----------------------------------
  const breadthCases = Object.entries(MEMBERS).map(([name, elem]) => {
    const b = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], enemy: spec(name), cycles: 6 })
    const acts = actsOf(b, name)
    const hit = all(b, 'HIT_START').filter(n => n.source === name).map(n => String(n.element))
    return raw(`daybreak: ${name} acts and lands ${elem}`,
      (acts.includes('daybreak_will') || acts.includes('daybreak_blade')) && hit.includes(elem) && b.sim.logger.verify().length === 0,
      `acts=${acts.slice(0, 3).join(',')} elems=${[...new Set(hit)].join(',')}`)
  })

  // ---- real encounter: the elite spawns and acts inside a wave-based encounter -----------------
  const enc: EncounterSpec = {
    id: 'daybreak-enc', mode: 'E2E Mock', cycles: 6,
    waves: [[{ ...spec(NAME), rank: 'elite' }]],
    victoryCondition: 'All enemies down', defeatCondition: 'Team wiped',
  }
  const encBattle = run({ team: [{ kitId: 'gepard' }, { kitId: 'natasha' }], encounter: enc })
  const encState = encounterStateOf(encBattle.sim)
  const encActs = actsOf(encBattle, NAME)
  const encCases = [
    raw('daybreak: elite spawns + acts inside a real encounter', encActs.includes('daybreak_will'), `${encActs.length} acts`),
    raw('daybreak: encounter state tracks the wave', encState.currentWave >= 1, `wave=${encState.currentWave}`),
  ]

  return [...regCases, ...battleCases, ...detCases, ...breadthCases, ...encCases]
}
