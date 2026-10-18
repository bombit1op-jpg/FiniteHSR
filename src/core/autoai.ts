// Central role-based auto-AI. Gives every character a consistent autobattle policy
// ("like in-game autobattle") layered on top of each kit's own decide/perform:
//   SUSITain: save the team from death (heal/shield critically-low allies first).
//   SUPPORT:  keep the main DPS buffed / primary enemy debuffed.
//   DPS:      delegate to the kit (deal damage).
// Only overrides `decide` when a clear role priority applies; otherwise defers to the
// kit, so kit-specific loops (transforms, summons, rotations) are preserved.
import type { Action, KitDef, KitRuntime, SimApi } from './kit'
import type { Unit } from './entities/Unit'

export type Role = 'sustain' | 'support' | 'dps'

// explicit per-kit role (paths are not 1:1 with combat role)
export const ROLE: Record<string, Role> = {
  // Abundance sustains
  gallagher: 'sustain', luocha: 'sustain', huohuo: 'sustain', lynx: 'sustain', bailu: 'sustain',
  // Preservation sustains (shield/taunt tanks)
  fuxuan: 'sustain', march7th: 'sustain', aventurine: 'sustain', danhengperman: 'sustain',
  // Remembrance heal/sustain
  hyacine: 'sustain',
  // Harmony supports
  bronya: 'support', sparkle: 'support', asta: 'support', tingyun: 'support', sunday: 'support', yukong: 'support', hanya: 'support',
  robin: 'support', ruanmei: 'support',
  // Debuff supports (Nihility control/utility)
  pela: 'support', silverwolf: 'support', welt: 'support', fugue: 'support',
  // Elation / sub-DPS support
  tribbie: 'support', cerydra: 'support', guinaifen: 'support',
  // everything else is a DD (or DD-first hybrid)
}

export function roleOf(kitId: string | undefined): Role {
  return (kitId && (ROLE[kitId] ?? 'dps')) as Role
}

const SUSTAIN_SAVE_HP = 0.35 // heal/shield when any char is below this HP %
const SUSTAIN_KEEP_HP = 0.70 // keep the team topped up when SP allows

/** lowest-HP living char ally (excluding summons/timers), returns the ratio too */
function lowestCharHp(sim: SimApi, exclude?: Unit): { u: Unit; ratio: number } | undefined {
  let best: { u: Unit; ratio: number } | undefined
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead || a === exclude) continue
    const r = a.hp / a.maxHp
    if (!best || r < best.ratio) best = { u: a, ratio: r }
  }
  return best
}

/**
 * Central auto decision. Returns an action, or undefined to let the kit decide.
 * `kind: 'skill'` on a sustain always targets lowest-HP (kits already do).
 */
export function autoDecide(sim: SimApi, u: Unit, ctx: KitRuntime, kit: KitDef): Action | undefined {
  if ((ctx.skillPattern as string) && (ctx.skillPattern as string) !== 'auto') return undefined
  const role = roleOf(kit.id)

  // --- sustain: save the team from death ---
  if (role === 'sustain') {
    const low = lowestCharHp(sim, u)
    // critically-low teammate → drop everything and heal/shield it. Sustainable even at 0 SP:
    // SP-gated sustains' perform falls through to basic on spendSp failure; Gallagher's skill is SP-free.
    if (low && low.ratio < SUSTAIN_SAVE_HP) return { kind: 'skill' }
    if (low && low.ratio < SUSTAIN_KEEP_HP && sim.sp() >= 1) return { kind: 'skill' }
    // opt-in SP economy (TeamSpec.strategy.spEconomy): healthy team → Basic to generate SP
    if ((ctx.strategy as Record<string, boolean>)?.spEconomy) return { kind: 'basic' }
    return undefined // delegate — team is healthy
  }

  // --- support: keep the carry buffed / enemies debuffed ---
  if (role === 'support') {
    const mainDps = mainDpsOf(sim, ctx)
    // if the carry is missing any buff, buff it; else let the kit's own decide run
    if (sim.sp() >= 1 && mainDps && mainDps.buffs.length === 0) return { kind: 'skill' }
    // opt-in SP economy: buffs up → Basic to generate SP for the carry
    if ((ctx.strategy as Record<string, boolean>)?.spEconomy) return { kind: 'basic' }
    return undefined
  }

  // --- DPS: delegate ---
  return undefined
}

/** the declared main DPS (by unit id or kitId), else the ally with highest effective ATK among chars */
export function mainDpsOf(sim: SimApi, ctx: KitRuntime): Unit | undefined {
  const id = ctx.mainDpsId as string | undefined
  if (id) {
    const found = sim.allies('ally').find(a => a.kind === 'char' && !a.dead && (a.id === id || a.kitId === id))
    if (found) return found
  }
  let best: Unit | undefined
  for (const a of sim.allies('ally')) {
    if (a.kind !== 'char' || a.dead) continue
    if (!best || sim.effAtk(a) > sim.effAtk(best)) best = a
  }
  return best
}

// ---- self-check (one runnable check for the branch logic) ----
export function selfCheck(): void {
  const mkUnit = (kitId: string, spd: number): Unit => ({
    kitId, kind: 'char', side: 'ally', dead: false, hp: 100, maxHp: 100,
    base: { level: 80, hp: 100, atk: 1000, def: 500, spd, critRate: 0.05, critDmg: 0.5 },
    buffs: [], energy: 0, maxEnergy: 100,
  } as unknown as Unit)
  const kit = (id: string, role?: any) => ({ id, name: id, elem: 'Fire', energyMax: 110, base: mkUnit(id, 90).base, decide: () => ({ kind: 'basic' }) as Action, perform: () => {} }) as KitDef
  const assert = (cond: boolean, msg: string) => { if (!cond) throw new Error('autoai: ' + msg) }

  const sustainKit = kit('gallagher'); const supportKit = kit('tingyun')
  const lowAlly = mkUnit('blade', 1); lowAlly.hp = 20 // 20% — critically low
  const highAlly = mkUnit('jingliu', 2); highAlly.hp = 90
  const sim = {
    sp: () => 1,
    allies: (s: string) => s === 'ally' ? [lowAlly, highAlly, mkUnit('gallagher', 3)] : [],
    effAtk: (u: Unit) => u.base.atk,
  } as unknown as SimApi
  const a = autoDecide(sim, mkUnit('gallagher', 3), { skillPattern: 'auto' } as KitRuntime, sustainKit)
  assert(a?.kind === 'skill', `sustain should skill to save low ally, got ${JSON.stringify(a)}`)

  const healthySim = { sp: () => 1, allies: (s: string) => s === 'ally' ? [mkUnit('blade', 1), highAlly, mkUnit('gallagher', 3)] : [], effAtk: (u: Unit) => u.base.atk } as unknown as SimApi
  const d = autoDecide(healthySim, mkUnit('gallagher', 3), { skillPattern: 'auto' } as KitRuntime, sustainKit)
  assert(d === undefined, `sustain should delegate on healthy team, got ${d}`)

  const dpsUnit = mkUnit('seele', 4); dpsUnit.id = 'dps-1'; dpsUnit.buffs = []
  const dpsOnly = { sp: () => 1, allies: (s: string) => s === 'ally' ? [dpsUnit, mkUnit('tingyun', 0)] : [], effAtk: (u: Unit) => u.base.atk } as unknown as SimApi
  const ctx2 = { skillPattern: 'auto', mainDpsId: 'dps-1' } as KitRuntime
  const b = autoDecide(dpsOnly, mkUnit('tingyun', 0), ctx2, supportKit)
  assert(b?.kind === 'skill', `support should buff unbuffed DPS, got ${JSON.stringify(b)}`)
  dpsUnit.buffs = [{ id: 'b1', name: 'b' } as never]
  const c = autoDecide(dpsOnly, mkUnit('tingyun', 0), ctx2, supportKit)
  assert(c === undefined, `support should delegate when DPS buffed, got ${c}`)

  const ctxE = { skillPattern: 'auto', mainDpsId: 'dps-1', strategy: { spEconomy: true } } as KitRuntime
  const e1 = autoDecide(dpsOnly, mkUnit('tingyun', 0), ctxE, supportKit)
  assert(e1?.kind === 'basic', `support spEconomy should Basic, got ${JSON.stringify(e1)}`)
  const e2 = autoDecide(healthySim, mkUnit('gallagher', 3), { skillPattern: 'auto', strategy: { spEconomy: true } } as KitRuntime, sustainKit)
  assert(e2?.kind === 'basic', `sustain spEconomy should Basic, got ${JSON.stringify(e2)}`)

  console.log('autoai self-check OK')
}
