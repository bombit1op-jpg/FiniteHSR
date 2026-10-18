import { prepareBattle } from '../../src/core/battle'
import { kitById } from '../../src/core/kits'
import { case_, type Case } from '../suites'

/** §P4 ally-called Assist Skill (Himeko • Nova). The engine routes it as a first-class
 *  `{kind:'assist'}` Action that replaces the actor's turn, and the provider kit resolves it.
 *  Invariants that are easy to get wrong:
 *   1. Companion Protocol is entered ONLY when a listed ally uses the Assist Skill — never at
 *      field entry (the old `onStart` grant is removed).
 *   2. The two protocols are mutually exclusive: switching clears the previous one's buffs and
 *      KEEPS its charge.
 *   3. The Starblazer's launch is a Skill (canon: "considered as Himeko • Nova using her Skill"),
 *      so every hit must carry `attackType: 'skill'`.
 *   4. The user regenerates exactly 4 flat Energy (Talent #3) and gains the "Hark!" Extra Turn.
 *   5. A Special Effect launches the Starblazer at most `assist_a8` (=2) times per battle, and the
 *      count resets after Nova's Ultimate. */

const stats = { hp: 8000, atk: 3000, def: 1000, spd: 120 } as const

const foe = (count: number) => ({
  name: 'Foe', count, hp: 50_000_000, spd: 100, level: 80, toughness: 180,
  weaknesses: ['Fire'] as never, atk: 60,
})

/** debug:5 so `logger.events` records HIT_START / ENERGY_GAIN (MIN_DEBUG 2/3). */
const battle = (enemies = 1) => prepareBattle({
  team: [
    { kitId: 'himeko_nova', ...stats },
    { kitId: 'danheng', ...stats },
    { kitId: 'march7th', ...stats },
    { kitId: 'bronya', ...stats },
  ],
  enemy: foe(enemies), cycles: 1, seed: 11, log: { debug: 5 },
})

const kit = kitById('himeko_nova')!
const find = (s: ReturnType<typeof prepareBattle>, id: string) => s.roster.find(x => x.kitId === id)!

export default (): Case[] => {
  const cases: Case[] = []

  // ---- 1. protocol entered only on Assist use; offering policy ----
  {
    const s = battle()
    s.initBattle()
    const nova = find(s, 'himeko_nova')
    const d = find(s, 'danheng')
    const m = find(s, 'march7th')
    const br = find(s, 'bronya')
    const ctx = s.rt(nova)

    cases.push(case_('no Companion Protocol at field entry', ctx.protocol === undefined, `protocol=${ctx.protocol}`))
    cases.push(case_('no protocol buffs at field entry',
      !s.hasBuff(nova, 'hn_verdict') && !s.hasBuff(nova, 'hn_decimation') && !s.hasBuff(br, 'hn_decimation')))
    cases.push(case_('Talent grants 1 Assist use at E0', Number(ctx.assist) === 1, `assist=${ctx.assist}`))

    cases.push(case_('a Verdict giver is offered the Assist Skill', s.events.assistOffered(d)))
    cases.push(case_('a Decimation giver is offered the Assist Skill', s.events.assistOffered(m)))
    cases.push(case_('a non-giver ally is never offered', !s.events.assistOffered(br)))
    cases.push(case_('Nova is never offered her own Assist Skill', !s.events.assistOffered(nova)))
    const held = ctx.assist
    ctx.assist = 0
    cases.push(case_('no offer once the Assist uses are spent', !s.events.assistOffered(d), `assist=${ctx.assist}`))
    ctx.assist = held
  }

  // ---- 2. resolve an ally's Assist Skill: Verdict, pool spend, flat 4 Energy, Hark! ----
  {
    const s = battle()
    s.initBattle()
    const nova = find(s, 'himeko_nova')
    const d = find(s, 'danheng')
    const br = find(s, 'bronya')
    const ctx = s.rt(nova)
    const hpBefore = s.allies('enemy').reduce((n, e) => n + e.hp, 0)
    const mark = s.logLines.length

    s.performAbility(kitById('danheng')!, d, { kind: 'assist' }, s.rt(d))
    const seg = s.logLines.slice(mark)

    cases.push(case_('assist run is accepted (provider kit resolved it)',
      s.events.assistOffered(d) || seg.length > 0, `lines=${seg.length}`))
    cases.push(case_('Starblazer launch happened', seg.some(l => /Assist Skill: Trailblaze, By Your Side \(Dan Heng\)/.test(l))))
    cases.push(case_('Verdict entered, Decimation never applied',
      ctx.protocol === 'verdict' && s.hasBuff(nova, 'hn_verdict') && !s.hasBuff(nova, 'hn_decimation') && !s.hasBuff(br, 'hn_decimation'),
      `protocol=${ctx.protocol}`))
    cases.push(case_('exactly one Assist use spent', Number(ctx.assist) === 0, `assist=${ctx.assist}`))
    cases.push(case_('user regenerates exactly 4 flat Energy', s.logger.events.some(e =>
      e.type === 'ENERGY_GAIN' && e.payload?.targetId === d.id && e.payload?.flat === true && Number(e.payload?.n) === 4)))
    cases.push(case_('Hark! grants the user an Extra Turn', seg.some(l => /Dan Heng gains an Extra Turn/.test(l))))
    cases.push(case_('every launch hit is typed as a Skill', s.logger.events.some(e =>
      e.type === 'HIT_START' && e.attackType === 'skill' && /Trailblaze, By Your Side \(Dan Heng\)/.test(String(e.payload?.label)))))
    cases.push(case_('the launch damages the enemy', s.allies('enemy').reduce((n, e) => n + e.hp, 0) < hpBefore))
  }

  // ---- 3. mutual exclusion + charge kept when the protocol switches (2 enemies -> Decimation) ----
  {
    const s = battle(2)
    s.initBattle()
    const nova = find(s, 'himeko_nova')
    const d = find(s, 'danheng')
    const m = find(s, 'march7th')
    const ctx = s.rt(nova)
    ctx.assist = 2

    s.events.runAssist(d)
    cases.push(case_('first Assist enters Verdict', ctx.protocol === 'verdict' && s.hasBuff(nova, 'hn_verdict'), `protocol=${ctx.protocol}`))
    ctx.charge = 5

    // 2 enemies: preferred protocol is Decimation, so the policy may flip away from Verdict
    cases.push(case_('after Verdict, only a Decimation giver may call the Assist Skill',
      s.events.assistOffered(m) && !s.events.assistOffered(d)))
    cases.push(case_('switching to Decimation is accepted', s.events.runAssist(m)))
    cases.push(case_('switch clears Verdict and applies Decimation to every ally',
      ctx.protocol === 'decimation' && !s.hasBuff(nova, 'hn_verdict') && !s.hasBuff(nova, 'hn_verdict_ult')
      && s.hasBuff(nova, 'hn_decimation') && s.hasBuff(d, 'hn_decimation') && s.hasBuff(m, 'hn_decimation'), `protocol=${ctx.protocol}`))
    cases.push(case_('switching keeps the previous protocol charge', Number(ctx.charge) === 5, `charge=${ctx.charge}`))
    cases.push(case_('two Assist calls spend two uses', Number(ctx.assist) === 0, `assist=${ctx.assist}`))
  }

  // ---- 4. free-launch cap (assist_a8 = 2) and its reset on Nova's Ultimate ----
  {
    const s = battle()
    s.initBattle()
    const nova = find(s, 'himeko_nova')
    const d = find(s, 'danheng')
    const en = s.allies('enemy')[0]
    const ctx = s.rt(nova)
    ctx.protocol = 'decimation'

    const fire = () => { ctx.charge = 8; kit.onAfterAttack!(s, d, en, 'skill', ctx); return Number(ctx.free) }
    cases.push(case_('a filled Decimation charge launches the Starblazer once', fire() === 1, `free=${ctx.free}`))
    cases.push(case_('a second charge launches again', fire() === 2, `free=${ctx.free}`))
    cases.push(case_('the free-launch count is capped at assist_a8 = 2', fire() === 2, `free=${ctx.free}`))

    // the reset sits in `perform`'s Ultimate branch behind the full-energy gate
    ctx.protocol = undefined // keep post-Ult hits from refilling the counter before it is read
    nova.energy = nova.maxEnergy
    s.performAbility(kit, nova, { kind: 'ult' }, ctx)
    cases.push(case_('Nova\'s Ultimate resets the free-launch count', Number(ctx.free) === 0, `free=${ctx.free}`))
  }

  return cases
}
