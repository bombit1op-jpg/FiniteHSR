import { prepareBattle } from '../../src/core/battle'
import { kitById } from '../../src/core/kits'
import { case_, type Case } from '../suites'

/** Р В Р’В Р Р†Р вЂљРІвЂћСћР В РІР‚в„ўР вЂ™Р’В§P5 cross-kit action deferral (`SimApi.releaseAsExtraTurn` / `KitDef.onBeforeAction`).
 *  A kit may intercept an action another unit is about to take and re-issue it as an Extra Turn.
 *  Two invariants matter and are easy to get wrong:
 *   1. A re-issued action must NOT grant a further timeline action (`av` untouched) Р В Р’В Р В РІР‚В Р В Р’В Р Р†Р вЂљРЎв„ўР В Р вЂ Р В РІР‚С™Р РЋРЎС™ the point is to
 *      move the SAME action, not to hand out a second one.
 *   2. It must NOT inherit the self-granted Extra Turn flag `ctx.inExtraTurn`: that flag carries
 *      kit-specific free-action semantics (Seele Resurgence: no SP, no energy, hunt.ts:99), which a
 *      re-issued action must still pay for. It gets its own `ctx.extraRelease` marker instead. */

const stats = { hp: 8000, atk: 2000, def: 1000, spd: 120 } as const

export default (): Case[] => {
  const cases: Case[] = []

  // releaseAsExtraTurn runs the action, leaves no timeline action behind, and marks the release
  {
    const s = prepareBattle({ team: [{ kitId: 'hook', ...stats }], enemy: { name: 'Foe', count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 0, weaknesses: ['Fire'] as never, atk: 60 }, cycles: 1, seed: 1 })
    s.initBattle()
    const u = s.roster.find(x => x.kitId === 'hook')!
    const av = u.av
    s.releaseAsExtraTurn(u, { kind: 'basic' })
    const rt = s.rt(u)
    cases.push(case_('releaseAsExtraTurn grants no further timeline action (av unchanged)', u.av === av, `${av} -> ${u.av}`))
    cases.push(case_('releaseAsExtraTurn marks ctx.extraRelease then clears it', rt.extraRelease === false, `extraRelease=${rt.extraRelease}`))
    cases.push(case_('releaseAsExtraTurn does NOT set ctx.inExtraTurn', rt.inExtraTurn !== true, `inExtraTurn=${rt.inExtraTurn}`))
  }

  // Cerydra Coup de Main: onBeforeAction casts the copy BEFORE the original is released
  {
    const s = prepareBattle({
      team: [
        { kitId: 'cerydra', ...stats },
        { kitId: 'topaz', ...stats },
      ],
      enemy: { name: 'Foe', count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 120, weaknesses: ['Wind'] as never, atk: 700 },
      cycles: 1, seed: 3,
    })
    s.initBattle()
    const cer = s.roster.find(x => x.kitId === 'cerydra')!
    const carrier = s.roster.find(x => x.kitId === 'topaz')!
    s.rt(cer).mmId = carrier.id
    s.rt(cer).peerage = true
    s.rt(cer).charge = 8
    const spBefore = s.sp()
    const mark = s.logLines.length
    s.performAbility(kitById('topaz')!, carrier, { kind: 'skill' }, s.rt(carrier))
    const seg = s.logLines.slice(mark)
    const copy = seg.findIndex(l => /Coup de Main/.test(l))
    const orig = seg.findIndex(l => /Difficulty Paying\?/.test(l))
    cases.push(case_('coup copy lands before the original', copy >= 0 && orig > copy, `copy=#${copy} original=#${orig}`))
    const hitLines = seg.filter(l => l.includes('→') && l.includes('[Coup de Main]'))
    cases.push(case_('coup fires exactly once per action', hitLines.length === 1, `count=${hitLines.length}`))
    cases.push(case_('the pair pays exactly 1 SP (copy is free, original is not)', s.sp() - spBefore === -1, `sp ${spBefore} -> ${s.sp()}`))
    cases.push(case_('coupLock/extraRelease cleaned up after the action', s.rt(cer).coupLock === false && s.rt(carrier).extraRelease === false, `coupLock=${s.rt(cer).coupLock} extraRelease=${s.rt(carrier).extraRelease}`))
    cases.push(case_('no Charge gain inside the coup window', !seg.slice(0, seg.findIndex(l => /Peerage reverted/.test(l))).some(l => /: Charge \d/.test(l))))
  }

  return cases
}
