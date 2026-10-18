/**
 * §17 coverage report: which of the four layers a slot actually asserts.
 * Split out from the runner: it is a report over specs, not a spec execution.
 */

import { ABILITY_SLOTS, type AbilitySlot, type Layer, type Requirement } from './Requirement'
import type { SlotSpec } from './Spec'

export function coverage(specs: SlotSpec[]): string {
  const layers: Layer[] = ['structure', 'parameters', 'ordering', 'interactions']
  const head = 'kit'.padEnd(20) + 'slot'.padEnd(9) + layers.map(l => l.slice(0, 6).padEnd(8)).join('')
  const out = ['SKILL COVERAGE REPORT', head, '-'.repeat(head.length), '']
  let empty = 0
  for (const s of specs) {
    const cells = layers.map(l => String(s.requirements.filter(r => r.layer === l).length).padEnd(8)).join('')
    out.push(s.kit.padEnd(20) + s.slot.padEnd(8) + cells)
    if (s.requirements.length) empty++
  }
  out.push('', `${specs.length} specs, ${empty} with requirements, ${specs.length - empty} empty`)
  return out.join('\n')
}

/** The ability slot a requirement exercises: the explicit `ability` tag, else derived from the
 *  assertion's event `action` matcher (only basic/skill/ultimate carry an action tag today). */
export function abilityOf(r: Requirement): AbilitySlot | undefined {
  if (r.ability) return r.ability
  const act = (r.assertion as { of?: { action?: string } }).of?.action
  return act === 'basic' || act === 'skill' || act === 'ultimate' ? act : undefined
}

/** guide §30 character verification matrix: which of the six ability slots each kit's ability specs
 *  actually pin. Reads the `skill` spec (basic/skill/talent/ultimate/base live there) and the
 *  dedicated `technique` spec; eidolons/interactions/traces/gear test other axes and are excluded.
 *  A `.` is an honest gap, not a pass — talent/technique stay empty until a spec tags them.
 *  `base` is not a battle-observable ability (fixtures override `stats`), so its column is fed by
 *  `baseKits` — the kits whose base stats the dataset-fidelity layer (`BaseStats.ts`) verified. */
export function abilityCoverage(specs: SlotSpec[], baseKits: Set<string> = new Set()): string {
  const byKit = new Map<string, Set<AbilitySlot>>()
  const kits = new Set<string>()
  for (const s of specs) {
    if (s.slot !== 'skill' && s.slot !== 'technique') continue
    kits.add(s.kit)
    for (const r of s.requirements) {
      const a = abilityOf(r)
      if (!a) continue
      const set = byKit.get(s.kit) ?? new Set<AbilitySlot>()
      set.add(a)
      byKit.set(s.kit, set)
    }
  }
  const col = 10
  const head = 'kit'.padEnd(20) + ABILITY_SLOTS.map(c => c.slice(0, col - 1).padEnd(col)).join('')
  const out = ['ABILITY COVERAGE (guide §30)', head, '-'.repeat(head.length)]
  const totals = Object.fromEntries(ABILITY_SLOTS.map(c => [c, 0])) as Record<AbilitySlot, number>
  for (const kit of [...kits].sort()) {
    const set = byKit.get(kit) ?? new Set<AbilitySlot>()
    const has = (c: AbilitySlot): boolean => c === 'base' ? baseKits.has(kit) : set.has(c)
    out.push(kit.padEnd(20) + ABILITY_SLOTS.map(c => (has(c) ? 'Y' : '.').padEnd(col)).join(''))
    for (const c of ABILITY_SLOTS) if (has(c)) totals[c]++
  }
  out.push('', `${kits.size} kits · covering: ` + ABILITY_SLOTS.map(c => `${c} ${totals[c]}`).join(' · '))
  return out.join('\n')
}

/** Roster gate: which kit ids never appear in any fixture team. Content-based, so a
 *  cloned spec whose fixtures run a different kit does not count as coverage. */
export function missingKits(specs: SlotSpec[], roster: string[]): string[] {
  const used = new Set<string>()
  for (const s of specs) {
    for (const f of s.fixtures ?? []) {
      const team = (f.battle as { team?: { kitId?: string }[] } | undefined)?.team ?? []
      for (const t of team) if (t.kitId) used.add(t.kitId)
    }
  }
  return roster.filter(k => !used.has(k))
}

/** One executed requirement row, flattened from the runner reports. */
export interface CovRow {
  kit: string
  slot: string
  fixture: string
  requirement: string
  layer: Layer
  ok: boolean
  status?: 'gap' | 'blocked'
}

/** Per-requirement roll-up over what actually ran: totals + the failing/non-fatal rows by id.
 *  The `fixture` on each row keeps the line actionable when one requirement runs in several
 *  fixtures — `#id` alone cannot say which battle failed. */
export function requirementCoverage(rows: CovRow[]): string {
  const passed = rows.filter(r => r.ok).length
  const failed = rows.filter(r => !r.ok && !r.status)
  const nonFatal = rows.filter(r => r.status)
  const out = [`REQUIREMENT COVERAGE — ${rows.length} rows, ${passed} passed, ${failed.length} failed${nonFatal.length ? `, ${nonFatal.length} non-fatal` : ''}`]
  for (const r of failed) out.push(`  FAIL [${r.layer}] ${r.kit}/${r.slot}#${r.requirement} @ ${r.fixture}`)
  for (const r of nonFatal) out.push(`  [${r.status!.toUpperCase()}] ${r.kit}/${r.slot}#${r.requirement} @ ${r.fixture}`)
  return out.join('\n')
}

/** Light-cone coverage: which dataset cones any fixture's team gear actually exercises. */
export function lightconeCoverage(specs: SlotSpec[], lcIds: string[]): string {
  const used = new Set<string>()
  for (const s of specs) {
    for (const f of s.fixtures ?? []) {
      const team = (f.battle as { team?: { gear?: { coneId?: string } }[] } | undefined)?.team ?? []
      for (const t of team) if (t.gear?.coneId) used.add(t.gear.coneId)
    }
  }
  const missing = lcIds.filter(id => !used.has(id))
  const out = [`LIGHT CONE COVERAGE — ${used.size}/${lcIds.length} exercised by fixtures (${missing.length} not)`]
  if (used.size) out.push(`  exercised: ${[...used].sort().join(' ')}`)
  // only enumerate the gap once coverage exists — otherwise the count already says "nothing""
  if (used.size && missing.length) out.push(`  not exercised: ${missing.join(' ')}`)
  return out.join('\n')
}

type GearEntry = { coneId?: string; planarId?: string; relicSets?: string[]; pieces?: { setId: string; slot: string }[] }

/** Set-id coverage for relics and planars: legacy `relicSets`/`planarId` plus per-slot `pieces`
 *  (slot decides which family a piece belongs to: head/hands/body/feet vs sphere/rope). */
function setCoverage(label: string, specs: SlotSpec[], ids: string[], planar: boolean): string {
  const used = new Set<string>()
  for (const s of specs) {
    for (const f of s.fixtures ?? []) {
      const team = (f.battle as { team?: { gear?: GearEntry }[] } | undefined)?.team ?? []
      for (const t of team) {
        const g = t.gear
        if (!g) continue
        if (planar) {
          if (g.planarId) used.add(g.planarId)
        } else {
          for (const id of g.relicSets ?? []) used.add(id)
        }
        for (const p of g.pieces ?? []) {
          const isPlanarPiece = p.slot === 'sphere' || p.slot === 'rope'
          if (isPlanarPiece === planar) used.add(p.setId)
        }
      }
    }
  }
  const missing = ids.filter(id => !used.has(id))
  const out = [`${label} — ${used.size}/${ids.length} exercised by fixtures (${missing.length} not)`]
  if (used.size && missing.length) out.push(`  not exercised: ${missing.join(' ')}`)
  return out.join('\n')
}

export function relicCoverage(specs: SlotSpec[], ids: string[]): string {
  return setCoverage('RELIC SET COVERAGE', specs, ids, false)
}

export function planarCoverage(specs: SlotSpec[], ids: string[]): string {
  return setCoverage('PLANAR SET COVERAGE', specs, ids, true)
}


