import { resolvePreCombat } from '../../src/core/battle/PreCombat'
import { prepareBattle } from '../../src/core/battle'
import { case_, type Case } from '../suites'

/**
 * §84.6.1 pre-combat Technique backend model. Part A pins the pure resolver (synthetic
 * entries): attack/zone exclusivity, repeat cap, switch-cancel, and the core fact that a
 * CANCELLED activation is still a counted USE. Part B pins engine integration with real
 * kits: Tingyun zero/one/two uses (+Energy cap, Ult readiness derived from effective
 * starting Energy), March 7th • The Hunt counting a cancelled teammate's use, and a
 * deterministic replay (same config + seed → same plan).
 *
 * Not covered (deliberate ceiling, see battle/PreCombat.ts): Technique Point costs / budget.
 */

const stats = { hp: 8000, atk: 3000, def: 1000, spd: 120 } as const

const foe = () => ({
  name: 'Foe', count: 1, hp: 5_000_000, spd: 100, level: 80, toughness: 180,
  weaknesses: ['Imaginary'] as never, atk: 60,
})

export default (): Case[] => {
  const cases: Case[] = []

  // ---- A. pure resolver ----
  {
    const p = resolvePreCombat([
      { kitId: 'a', name: 'Atk A', kind: 'attack' },
      { kitId: 'b', name: 'Atk B', kind: 'attack' },
      { kitId: 'c', name: 'Buff C', kind: 'buff' },
    ])
    cases.push(case_('attack conflict: first attack survives', p.activations[0].survives))
    cases.push(case_('attack conflict: second attack cancelled', p.activations[1].cancelledBy === 'attack-conflict' && p.activations[1].replacedBy === 'Atk A'))
    cases.push(case_('attack conflict: buff unaffected', p.activations[2].survives))
    cases.push(case_('attack conflict: cancelled attack still a counted use', p.useCounts['b'] === 1))
  }
  {
    const p = resolvePreCombat([
      { kitId: 'z1', name: 'Zone 1', kind: 'buff', zone: true },
      { kitId: 'z2', name: 'Zone 2', kind: 'buff', zone: true },
    ])
    cases.push(case_('zone: earlier zone replaced', !p.activations[0].survives && p.activations[0].cancelledBy === 'zone-replaced' && p.activations[0].replacedBy === 'Zone 2'))
    cases.push(case_('zone: last zone survives', p.activations[1].survives))
  }
  {
    const p = resolvePreCombat([
      { kitId: 'x', name: 'Sens X', kind: 'buff', switchSensitive: true },
      { kitId: 'y', name: 'Sens Y', kind: 'buff', switchSensitive: true },
    ])
    cases.push(case_('switch-cancel: earlier sensitive effect lost', !p.activations[0].survives && p.activations[0].cancelledBy === 'switch-cancelled' && p.activations[0].replacedBy === 'Sens Y'))
    cases.push(case_('switch-cancel: only the last character\'s effect survives', p.activations[1].survives))
  }
  {
    const cap = resolvePreCombat([
      { kitId: 'r', name: 'Rep', kind: 'buff' },
      { kitId: 'r', name: 'Rep', kind: 'buff' },
    ])
    cases.push(case_('repeat-cap: second use cancelled by default maxUses 1', cap.survivors.length === 1 && cap.activations[1].cancelledBy === 'repeat-cap'))
    cases.push(case_('repeat-cap: cancelled use still counted', cap.useCounts['r'] === 2))
    const two = resolvePreCombat([
      { kitId: 'r', name: 'Rep', kind: 'buff', maxUses: 2 },
      { kitId: 'r', name: 'Rep', kind: 'buff', maxUses: 2 },
    ])
    cases.push(case_('maxUses 2: both uses survive', two.survivors.length === 2))
  }

  // ---- B. engine integration ----
  const battle = (techniques: string[]) => prepareBattle({
    team: [{ kitId: 'tingyun', ...stats }, { kitId: 'danheng', ...stats }],
    enemy: foe(), techniques, cycles: 1, seed: 7,
  })

  // Tingyun zero/one/two uses: Energy = floor(130×0.5)=65 start + 50×uses, capped at 130
  {
    const s0 = battle([])
    s0.initBattle()
    const ty0 = s0.roster.find(u => u.kitId === 'tingyun')!
    cases.push(case_('Tingyun 0 uses: starting Energy only', ty0.energy === 65, `energy=${ty0.energy}`))
    cases.push(case_('Tingyun 0 uses: Ultimate not ready', ty0.energy < ty0.maxEnergy))
  }
  {
    const s1 = battle(['tingyun'])
    s1.initBattle()
    const ty = s1.roster.find(u => u.kitId === 'tingyun')!
    cases.push(case_('Tingyun 1 use: +50 Energy', ty.energy === 115, `energy=${ty.energy}`))
    cases.push(case_('Tingyun 1 use: Ultimate not ready (115/130)', ty.energy < ty.maxEnergy))
  }
  {
    const s2 = battle(['tingyun', 'tingyun'])
    s2.initBattle()
    const ty = s2.roster.find(u => u.kitId === 'tingyun')!
    cases.push(case_('Tingyun 2 uses: +100 Energy capped at 130', ty.energy === 130, `energy=${ty.energy}`))
    cases.push(case_('Tingyun 2 uses: Ultimate ready derived from effective Energy', ty.energy >= ty.maxEnergy))
    cases.push(case_('Tingyun 2 uses: both uses recorded in plan', s2.preCombat.useCounts['tingyun'] === 2))
  }

  // zone replacement with real kits: later zone survives, earlier deploy never runs
  {
    const s = prepareBattle({
      team: [{ kitId: 'cyrene', ...stats }, { kitId: 'yao_guang', ...stats }],
      enemy: foe(), techniques: ['cyrene', 'yao_guang'], cycles: 1, seed: 7,
    })
    s.initBattle()
    const cy = s.roster.find(u => u.kitId === 'cyrene')!
    const ygZone = s.buffLog.filter(b => b.id === 'yg_zone').length
    cases.push(case_('zone (real): earlier cyrene zone replaced', s.preCombat.cancelled.some(a => a.kitId === 'cyrene' && a.cancelledBy === 'zone-replaced')))
    cases.push(case_('zone (real): cancelled zone never deployed', Number(s.rt(cy).cyZone ?? 0) === 0, `cyZone=${s.rt(cy).cyZone}`))
    cases.push(case_('zone (real): surviving yao_guang zone deployed', ygZone >= 1, `n=${ygZone}`))
  }

  // a cancelled teammate Technique still counts for March 7th (Hunt)'s use-based Charge
  {
    const s = prepareBattle({
      team: [
        { kitId: 'march7th_the_hunt', ...stats },
        { kitId: 'aglaea', ...stats },
        { kitId: 'pela', ...stats },
      ],
      enemy: foe(), techniques: ['aglaea', 'pela', 'march7th_the_hunt'], cycles: 1, seed: 7,
    })
    s.initBattle()
    const m = s.roster.find(u => u.kitId === 'march7th_the_hunt')!
    cases.push(case_('M7H: pela\'s attack cancelled but her use still counts (charge 2)', Number(s.rt(m).charge) === 2, `charge=${s.rt(m).charge}`))
    cases.push(case_('M7H: plan marks pela attack-conflict', s.preCombat.cancelled.some(a => a.kitId === 'pela' && a.cancelledBy === 'attack-conflict')))
  }

  // deterministic replay: same config + seed → identical plan + Energy
  {
    const snap = () => {
      const s = battle(['tingyun', 'tingyun'])
      s.initBattle()
      return `${JSON.stringify(s.preCombat)}|${s.roster.find(u => u.kitId === 'tingyun')!.energy}`
    }
    cases.push(case_('deterministic replay: identical plan + Energy', snap() === snap()))
  }

  return cases
}
