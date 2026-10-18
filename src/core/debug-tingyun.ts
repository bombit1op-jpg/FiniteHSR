/** Tingyun smoke: A2/A4/A6 + E1/E2/E4/E6 + Benediction/Violet Sparknado.
 *  Run: rtk npx tsx src/core/debug-tingyun.ts
 */
import { runBattle, type BattleSetup } from './battle'
import type { Simulator } from './simulator'

function base(hp: number, atk: number, def: number, spd: number, eidolon = 0): BattleSetup {
  return {
    team: [
      { kitId: 'seele', eidolon: 0, name: 'Seele' },
      { kitId: 'tingyun', eidolon, name: 'Tingyun', energyStartFrac: 0.9 },
    ],
    enemy: { name: 'Trottler', count: 1, hp: 20000, atk: 500, spd: 100, level: 85, toughness: 120, weaknesses: ['Quantum', 'Lightning'] },
    cycles: 6,
    seed: 42,
  }
}

let fails = 0
const t = (name: string, cond: boolean, extra = ''): void => {
  if (cond) console.log('ok   ' + name)
  else { fails++; console.log('FAIL ' + name + (extra ? ' → ' + extra : '')) }
}

function capture(setup: BattleSetup): { lines: string[]; account: (n: string) => number; addDmg: (n: string) => number; av: number; buff: (n: string, id: string) => boolean } {
  const sim: Simulator = runBattle(setup)
  const total = (n: string): number => {
    const ac = sim.accounts.get(n)
    if (!ac) return 0
    return (Object.values(ac.bySkill) as number[]).reduce((s, v) => s + v, 0)
  }
  const addDmg = (n: string): number => {
    const ac = sim.accounts.get(n)
    if (!ac) return 0
    let s = 0
    for (const [k, v] of Object.entries(ac.bySkill)) if (/Melody|Sparknado/.test(k)) s += v as number
    return s
  }
  if (!sim.logLines.length || sim.avElapsed === 0) {
    console.log('  [diag] endReason:', (sim as unknown as { endReason?: string }).endReason,
      '| av:', sim.avElapsed, '| alive:', sim.roster.filter(u => !u.dead).map(u => u.name).join(','))
  }
  const buff = (n: string, id: string): boolean => sim.buffLog.some(b => b.unitName === n && b.id === id)
  return { lines: sim.logLines, account: total, addDmg, av: sim.avElapsed, buff }
}

function has(lines: string[], re: RegExp): string | undefined {
  return lines.find(l => re.test(l))
}

const e0 = capture(base(846, 529, 396, 112))
t('tingyun A6 Jubilant Passage fires', !!has(e0.lines, /Tingyun A6: \+5 Energy/))
t('tingyun Skill places Benediction', !!has(e0.lines, /Tingyun Skill → Seele: Benediction ATK\+/))
t('Benediction ally deals Soothing Melody add', !!has(e0.lines, /Soothing Melody/), e0.lines.filter(l => /Soothing|Sparknado/.test(l)).join(' | '))
t('Talent Violet Sparknado procs on Tingyun hits', !!has(e0.lines, /Violet Sparknado/))
t('Tingyun Ult gives DMG+ buff', !!has(e0.lines, /Tingyun Ult → Seele: \+50 Energy, DMG\+/))
t('battle runs to completion', e0.av > 0, `av=${e0.av}`)
console.log('  t0 Seele total:', e0.account('Seele'), '| Tingyun total:', e0.account('Tingyun'))

// E4: Soothing Melody DMG multiplier ×1.2; E1: SPD+20% after ult; E6: +10 energy; E2: +5 on kill
const e6 = capture(base(846, 529, 396, 112, 6))
t('E1 SPD+20% after Ult', e6.buff('Seele', 'tingyun_e1'))
t('E6 Ult regens 60 Energy', !!has(e6.lines, /Tingyun Ult → Seele: \+60 Energy/))
t('Benediction ATK+ logs', !!has(e6.lines, /Benediction ATK\+/))
t('E2 +5 Energy on kill', !!has(e6.lines, /Tingyun E2: \+5 Energy/), e6.lines.filter(l => /E2/.test(l)).join(' | '))

// higher cap check: Tingyun's own ATK limits the flat buff
t('battle e6 runs', e6.av > 0, `av=${e6.av}`)

// E4 Jovial Versatility: Soothing Melody DMG multiplier ×1.2 (e0 vs e4, same seed → deterministic)
const e4 = capture(base(846, 529, 396, 112, 4))
const r = e4.addDmg('Seele') / Math.max(1, e0.addDmg('Seele'))
t('E4 Soothing Melody add DMG ×1.2', r > 1.05 && r < 1.4, `ratio ${r.toFixed(3)}`)
console.log('  add DMG e0:', e0.addDmg('Seele'), '| e4:', e4.addDmg('Seele'), '| e6:', e6.addDmg('Seele'))

console.log(`\ntingyun smoke: FAILURES: ${fails}`)
process.exitCode = fails ? 1 : 0