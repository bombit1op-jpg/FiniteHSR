/**
 * §44 `regression/` — engine-level cases for bugs that already happened and must stay fixed.
 *
 * Kit-level canon regressions live as blocks in `src/core/debug-kits.ts` (Acheron ladder, Cyrene
 * ×100, Moze dedupe, Misha A3, ...); duplicating them here would be two places to update. What
 * belongs here is the shared engine behaviour those fixes relied on, where a regression would
 * silently break dozens of kits at once.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareBattle } from '../../src/core/battle'
import { KITS } from '../../src/core/kits'
import { t, type Case } from '../suites'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** activation identity: `attackNo()` splits per dmg type, `attackAct()` is the activation (26-09-2026) */
function activationIdentity(): Case[] {
  const sim = prepareBattle({
    team: [{ kitId: 'seele', name: 'Seele' }],
    enemy: { name: 'Dummy', count: 1, hp: 500_000, spd: 100, level: 80, toughness: 60, weaknesses: ['Quantum'] },
    cycles: 1, seed: 7, log: { debug: 7 },
  })
  sim.initBattle()
  const a = sim.roster.find(u => u.side === 'ally')!
  const e = sim.roster.find(u => u.side === 'enemy')!

  sim.newAttack()
  const seq0 = sim.attackNo()
  sim.hit(a, e, { mult: 1, type: 'skill' })
  const actSkill = sim.attackAct()
  const seqSkill = sim.attackNo()
  // same activation, different damage type: the Acheron/Moze gating bug
  sim.hit(a, e, { mult: 1, type: 'fua' })
  const actFua = sim.attackAct()
  const seqFua = sim.attackNo()
  // `noSeq` must not open a new attack either
  sim.hit(a, e, { mult: 1, type: 'fua', noSeq: true })
  const seqNoSeq = sim.attackNo()

  return [
    t.ok('skill hit opens an attack', seqSkill === seq0 + 1, `${seq0} -> ${seqSkill}`),
    t.ok('mid-chain dmg-type switch keeps the activation', actFua === actSkill, `${actSkill} vs ${actFua}`),
    t.ok('mid-chain dmg-type switch opens a new attackNo', seqFua === seqSkill + 1, `${seqSkill} -> ${seqFua}`),
    t.ok('noSeq hit does not open a new attack', seqNoSeq === seqFua, `${seqFua} -> ${seqNoSeq}`),
  ]
}

/**
 * A `noSeq` Additional-DMG rider must not split the parent attack's identity (TODO L181, 10-10-2026).
 * Serval's Talent add used to mint a new attackNo per hit, defeating a `sim.attackNo()` once-per-attack
 * gate. `noSeq:true` fixes it; this pins the mechanism the kit fix relies on.
 */
function riderDoesNotSplitAttack(): Case[] {
  const sim = prepareBattle({
    team: [{ kitId: 'seele', name: 'Seele' }],
    enemy: { name: 'Dummy', count: 1, hp: 500_000, spd: 100, level: 80, toughness: 60, weaknesses: ['Quantum'] },
    cycles: 1, seed: 7, log: { debug: 7 },
  })
  sim.initBattle()
  const a = sim.roster.find(u => u.side === 'ally')!
  const e = sim.roster.find(u => u.side === 'enemy')!

  sim.newAttack()
  sim.hit(a, e, { mult: 1, type: 'skill' })
  const s0 = sim.attackNo()
  // Additional-DMG rider — canon: "not considered an attack"
  sim.hit(a, e, { mult: 1, type: 'add', noSeq: true })
  const s1 = sim.attackNo()
  // DoT-tick rider (Yanqing "Frozen Additional DMG" path): also emitted inline inside the parent
  // attack's window, so it must share the identity too — the failure mode the 2026-10 noSeq sweep fixed.
  sim.hit(a, e, { mult: 1, type: 'dot', noSeq: true })
  const s2 = sim.attackNo()
  // the parent attack's next hit (another Blast target) must stay the SAME attack
  sim.hit(a, e, { mult: 1, type: 'skill' })
  const s3 = sim.attackNo()
  // a fresh activation must still open a new attack (noSeq must not freeze identity globally)
  sim.newAttack()
  sim.hit(a, e, { mult: 1, type: 'skill' })
  const s4 = sim.attackNo()

  return [
    t.ok('Additional-DMG rider (noSeq) opens no new attack', s1 === s0, `${s0} -> ${s1}`),
    t.ok('DoT-tick rider (noSeq) opens no new attack', s2 === s0, `${s0} -> ${s2}`),
    t.ok('riders do not split the parent attack (next hit keeps the same attackNo)', s3 === s0, `${s0} -> ${s3}`),
    t.ok('newAttack() still opens a fresh attack after noSeq riders', s4 === s0 + 1, `${s0} -> ${s4}`),
  ]
}

/**
 * Every `type:'add'` hit literal in the kits + gear must be a `noSeq` rider (canon: Additional DMG
 * "is not considered an attack"), so a `sim.attackNo()` once-per-attack gate on the parent does not
 * re-fire per hit. The 2026-10 sweep added `noSeq` to 28 emitters; two are deliberate standalone
 * damage, not riders, and are allowlisted here. A new emitter that forgets `noSeq` fails this scan.
 */
function addRidersCarryNoSeq(): Case[] {
  const allowed = ['E4 Self-Sufficer (FUA)', 'Wings Sweep the Ruins']
  const kdir = join(ROOT, 'src', 'core', 'kits')
  const files = readdirSync(kdir).filter(f => f.endsWith('.ts')).map(f => join(kdir, f))
  files.push(join(ROOT, 'src', 'core', 'gear.ts'))

  const offenders: string[] = []
  let total = 0
  for (const file of files) {
    const rel = file.replace(/\\/g, '/').split('/src/core/')[1] ?? file
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (!/type:\s*['"]add['"]/.test(line)) return
      total++
      if (/\bnoSeq\b/.test(line) || allowed.some(a => line.includes(a))) return
      offenders.push(`${rel}:${i + 1}`)
    })
  }

  return [
    t.ok('every add-type hit literal is a noSeq rider (or an allowlisted standalone)',
      offenders.length === 0, offenders.join(', ')),
    t.ok('add-emitter scan is non-vacuous', total >= 30, `found ${total}`),
  ]
}

/** charTurn convention: the Ultimate REPLACES the turn action, energy gained mid-action buys nothing */
function ultReplacesAction(): Case[] {
  const sim = prepareBattle({
    team: [{ kitId: 'seele', name: 'Seele' }],
    enemy: { name: 'Dummy', count: 1, hp: 2_000_000, spd: 100, level: 80, toughness: 60, weaknesses: ['Quantum'] },
    cycles: 1, seed: 11, log: { debug: 7 },
  })
  sim.start()
  // one ability per actor per battle turn; grantExtraTurn is an explicit extra ACTION, so it is
  // counted separately from the turn itself
  const perTurn = new Map<string, Set<number>>()
  for (const e of sim.logger.events) {
    if (e.type !== 'ABILITY_USED' || e.source !== 'Seele') continue
    const set = perTurn.get(String(e.turn)) ?? new Set<number>()
    set.add(Number(e.payload.action === 'ultimate' ? 0 : 1))
    perTurn.set(String(e.turn), set)
  }
  const ultTurns = new Set<number>()
  for (const e of sim.logger.events)
    if (e.type === 'ABILITY_USED' && e.source === 'Seele' && e.payload.action === 'ultimate') ultTurns.add(Number(e.turn))
  const mixed = [...perTurn.entries()].filter(([turn, s]) => ultTurns.has(Number(turn)) && s.size > 1)

  return [
    t.truthy('battle produced Seele abilities', sim.logger.events.some(e => e.type === 'ABILITY_USED' && e.source === 'Seele')),
    t.ok('no turn has both an Ultimate and a Basic/Skill', mixed.length === 0,
      mixed.map(([turn, s]) => `turn ${turn}: ${[...s].join('+')}`).join(', ')),
  ]
}

/**
 * Ultimate resolver (08-10-2026): activation/consumption are declarative — `ultActivation`
 * (`at:'half'` etc.) decides readiness through `canUltimate`, `ultConsumption:'none'` kills the
 * generic sp_base +5 refund. A regression here reverts every declared kit at once.
 */
function ultResolver(): Case[] {
  // half-threshold kit (Energy.md: Argenti/Evanescia/Yunli ult at HALF Max Energy):
  // the ult must fire without the pool ever announcing full (480)
  const half = prepareBattle({
    team: [{ kitId: 'evanescia', name: 'Evanescia' }],
    enemy: { name: 'Dummy', count: 1, hp: 6_000_000, spd: 100, level: 80, toughness: 300, weaknesses: ['Wind'] },
    cycles: 1, seed: 5, log: { debug: 7 },
  })
  half.start()
  const halfUlt = half.logger.events.filter(e => e.type === 'ABILITY_USED' && e.payload?.action === 'ultimate').length
  const halfFull = half.logger.events.some(e => e.type === 'ENERGY_FULL')

  // non-Energy kit (Acheron, Slashed Dream): the cast pays the gauge (ENERGY_LOSS ult_cost)
  // but must NOT get the generic sp_base +5 refund — Energy.md: she does not use the Energy system
  const ach = prepareBattle({
    team: [{ kitId: 'acheron', name: 'Acheron' }],
    enemy: { name: 'Dummy', count: 1, hp: 6_000_000, spd: 100, level: 80, toughness: 300, weaknesses: ['Lightning'] },
    cycles: 3, seed: 9, log: { debug: 7 },
  })
  ach.start()
  const loss = ach.logger.events.some(e => e.type === 'ENERGY_LOSS' && e.payload?.reason === 'ult_cost')
  const refund = ach.logger.events.some(e => e.type === 'ENERGY_GAIN' && e.payload?.n === 5)

  return [
    t.ok('half-threshold kit ults without ever reaching full energy', halfUlt > 0 && !halfFull,
      `ults=${halfUlt} energyFull=${halfFull}`),
    t.ok('non-Energy kit pays the gauge (ENERGY_LOSS ult_cost)', loss, String(loss)),
    t.ok('non-Energy kit gets no generic +5 refund', !refund, `refund=${refund}`),
  ]
}

/**
 * Special-Ultimate resource contract (§6.2/§7, guide №33). A kit that replaces Energy must declare
 * both readiness and payment; scanned over the registry so a new special-Ult kit cannot silently
 * opt out of either:
 *  - a custom readiness gate (`ultActivation.kind === 'ready'`) implies a non-Energy payment
 *    (`ultConsumption: 'none'`) — otherwise the generic sp_base +5 refund would fire on a gauge;
 *  - the non-Energy roster is exactly the canonical six (Acheron / Castorice / Cyrene / Feixiao /
 *    Phainon / SW LV.999) — catches both a dropped kit and an accidental extra `none`.
 * The per-kit gauges themselves are exercised by `verification/characters/*` + `verification/golden/*`.
 */
function ultResourceContract(): Case[] {
  const nonEnergy = KITS.filter(k => k.ultConsumption === 'none').map(k => k.id).sort()
  const expected = ['acheron', 'castorice', 'cyrene', 'feixiao', 'phainon', 'silver_wolf_lv999']
  const readyWithoutNone = KITS.filter(k => k.ultActivation?.kind === 'ready' && k.ultConsumption !== 'none').map(k => k.id)
  return [
    t.ok('every custom-readiness (kind:ready) Ult is non-Energy', readyWithoutNone.length === 0, readyWithoutNone.join(', ')),
    t.ok('non-Energy Ultimate roster is exactly the canonical six', nonEnergy.join(',') === expected.join(','), nonEnergy.join(',')),
    t.ok('special-Ultimate coverage is non-vacuous', nonEnergy.length === 6, `${nonEnergy.length}`),
  ]
}

export default function (): Case[] {
  return [
    ...activationIdentity(), ...riderDoesNotSplitAttack(), ...addRidersCarryNoSeq(),
    ...ultReplacesAction(), ...ultResolver(), ...ultResourceContract(),
  ]
}
