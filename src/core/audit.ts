// Step-by-step audit instrumentation. Wraps public Simulator methods to capture a
// full per-step state snapshot + buff/debuff duration events, WITHOUT mutating sim
// state (a parallel audit stream merged into the log transcript by index on flush).
// Instantiate via createAudit after prepareBattle, call sim.start(), then flush.
import type { Simulator } from './simulator'
import type { Unit } from './entities/Unit'
import type { Buff, DoT } from './effects/Buff'
import { isDebuff, runtimeString } from './combat/StatResolver'

interface AuditRec { idx: number; lines: string[] }

export interface Audit {
  /** merge the audit stream with sim.logLines by index -> full interleaved transcript */
  flush(sim: Simulator): string[]
}

export interface AuditOpts {
  /** snapshot the full per-unit state every Nth turn header (1 = every turn, default).
   *  Sweeps use >1: the block is a drift-check convenience, hits/buffs stay complete. */
  stateEvery?: number
}

function fmtMods(mods: { stat: string; value: number }[]): string {
  return mods.map(m => `${m.stat}=${Math.abs(m.value) >= 1 ? Math.round(m.value) : (m.value * 100).toFixed(1) + '%'}`).join(',')
}

function buffsOf(u: Unit): string {
  if (!u.buffs.length) return '—'
  return u.buffs.filter(b => b.id !== 'traces' && b.id !== 'gear' && b.sourceId !== 'gear')
    .map(b => {
      const dur = b.turns === undefined || b.turns === Infinity ? 'perm' : `t${b.turns}`
      const stk = b.stacks !== undefined && (b.maxStacks ?? 1) > 1 ? ` x${b.stacks}` : ''
      const sh = b.shield !== undefined ? `|sh${Math.round(b.shield)}` : ''
      const mods = fmtMods(b.mods ?? [])
      return `${b.name}[${dur}${stk}${sh}${mods ? ' ' + mods : ''}]`
    }).join(' ')
}

function dotsOf(u: Unit): string {
  if (!u.dots.length) return ''
  return u.dots.map((d: DoT) => `${d.kind}${d.stacks ? `x${d.stacks}` : ''}[t${d.turns}]`).join(' ')
}

function countersOf(u: Unit): string {
  const nb = u.buffs.filter(b => !isDebuff(b)).length
  const nd = u.buffs.length - nb
  return `B:${nb} D:${nd}`
}

export function createAudit(sim: Simulator, opts: AuditOpts = {}): Audit {
  const recs: AuditRec[] = []
  const stateEvery = Math.max(1, opts.stateEvery ?? 1)
  let turnNo = 0

  // events land before the next to-be-logged line (idx = current log length)
  const durLine = (s: string): void => {
    recs.push({ idx: (sim as any).logLines.length, lines: [`[${sim.avElapsed.toFixed(1)}] AUDIT ${s}`] })
  }

  // --- duration events on buff/debuff/heal ops ---
  const addBuff = sim.addBuff.bind(sim)
  ;(sim as any).addBuff = (u: Unit, b: Buff): void => {
    const existed = u.buffs.some(x => x.id === b.id)
    addBuff(u, b)
    const mode = existed ? (b.maxStacks ? 'STACK' : 'REFRESH') : 'APPLY'
    const t = b.turns === undefined ? '' : b.turns === Infinity ? ' perm' : ` t${b.turns}`
    durLine(`${mode} ${u.name} <- ${b.name}${t} (${fmtMods(b.mods)})`)
  }
  const removeBuff = sim.removeBuff.bind(sim)
  ;(sim as any).removeBuff = (u: Unit, id: string): void => {
    const b = u.buffs.find(x => x.id === id)
    if (b) durLine(`REMOVE ${u.name} -> ${b.name}`)
    removeBuff(u, id)
  }
  const heal = sim.heal.bind(sim)
  ;(sim as any).heal = (u: Unit, amount: number): void => {
    const before = u.hp
    heal(u, amount)
    const got = u.hp - before
    durLine(`HEAL ${u.name} +${got} (→${(u.hp / u.maxHp * 100).toFixed(0)}%hp)`)
  }

  // --- full state snapshot right after each turn header; FUA/Additional/Elation hits
//     carry their own B/D+R tail inline (actTag in simulator hit) ---
  const log = sim.log.bind(sim)
  ;(sim as any).log = (msg: string): void => {
    log(msg)
    if (/^>>>\s/.test(msg)) {
      if (++turnNo % stateEvery !== 0) return
      const snap: string[] = []
      snap.push(`[${sim.avElapsed.toFixed(1)}] ── STATE ──`)
      for (const a of sim.allies('ally')) {
        const hp = `${Math.round(a.hp)}/${a.maxHp}(${(a.hp / a.maxHp * 100).toFixed(0)}%)`
        const rt = (sim as any).rt ? runtimeString(sim.rt(a)) : ''
        const b = buffsOf(a)
        snap.push(`  A ${a.name} ${hp} EN:${a.energy.toFixed(2)}/${a.maxEnergy} ${countersOf(a)}${b !== '—' ? ' [' + b + ']' : ''}${rt ? ' R:{' + rt + '}' : ''}`)
      }
      snap.push('  ' + '-'.repeat(50))
      for (const e of sim.allies('enemy')) {
        const hp = `${Math.round(e.hp)}/${e.maxHp}(${(e.hp / e.maxHp * 100).toFixed(0)}%)`
        const dots = dotsOf(e)
        const b = buffsOf(e)
        snap.push(`  E ${e.name} ${hp} Tough:${Math.round(e.toughness)}/${e.maxToughness}${e.broken ? ' BROKEN' : ''} ${countersOf(e)}${b !== '—' ? ' [' + b + ']' : ''}${dots ? ' DOT:' + dots : ''}`)
      }
      // snapshot right after the header line (idx = header's own index)
      recs.push({ idx: (sim as any).logLines.length - 1, lines: snap })
    }
  }

  return {
    flush(sim: Simulator): string[] {
      const logLines = (sim as any).logLines as string[]
      const out: string[] = []
      let ri = 0
      for (let i = 0; i < logLines.length; i++) {
        // diff against previous flush point (idx may interleave within same i)
        while (ri < recs.length && recs[ri].idx <= i) { out.push(...recs[ri].lines); ri++ }
        out.push(logLines[i])
      }
      while (ri < recs.length) { out.push(...recs[ri].lines); ri++ }
      return out
    },
  }
}
