/**
 * guide §30 "Base stats" per-character test.
 *
 * Base stats are not event-observable: every battle fixture overrides `stats`, so a
 * `unitState base.*` clause would read the fixture override, not the kit's own base. They are
 * therefore verified here against the dataset instead of through a battle requirement.
 *
 * Chain checked:  KitDef.base  ←  PROG[kit]  ←  hsr-data/characters.json `byLevel`
 *
 * Name matching: strip rich-text tags (`<unbreak>`), normalise to [a-z0-9], one alias for
 * March 7th (Hunt); same-name rows (March 7th Ice/Hunt, the ten {NICKNAME} Trailblazer forms)
 * are disambiguated by speed.
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KITS } from '../core/kits'
import { PROG } from '../core/progression'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../..')
const LEVELS = [10, 20, 30, 40, 50, 60, 70, 80] as const

export interface BaseCheck {
  kit: string
  ok: boolean
  /** first divergence, human-readable; absent when ok */
  reason?: string
}

interface LevelStat { hp: number; atk: number; def: number; spd: number }
interface Row { name: string; byLevel?: Record<string, LevelStat> }

const norm = (s: unknown): string => String(s).replace(/<[^>]*>/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** kit id -> dataset name, only where the two differ */
const ALIAS: Record<string, string> = {
  march7th_the_hunt: 'March 7th',
  trailblazer_preservation: '{NICKNAME}',
  trailblazer_harmony: '{NICKNAME}',
  trailblazer_remembrance: '{NICKNAME}',
  trailblazer_destruction: '{NICKNAME}',
  trailblazer_elation: '{NICKNAME}',
}

export function baseFidelity(): BaseCheck[] {
  const chars = JSON.parse(readFileSync(join(ROOT, 'hsr-data', 'characters.json'), 'utf8')) as Row[]
  const byName = new Map<string, Row[]>()
  for (const c of chars) {
    const k = norm(c.name)
    const arr = byName.get(k) ?? []
    arr.push(c)
    byName.set(k, arr)
  }

  const out: BaseCheck[] = []
  for (const kit of KITS) {
    const prog = PROG[kit.id]
    if (!prog) { out.push({ kit: kit.id, ok: false, reason: 'no PROG entry' }); continue }

    const rows = (byName.get(norm(ALIAS[kit.id] ?? kit.name)) ?? []).filter(r => r.byLevel?.[80])
    if (!rows.length) { out.push({ kit: kit.id, ok: false, reason: 'no dataset row' }); continue }
    const row = rows.length === 1
      ? rows[0]
      : rows.slice().sort((a, b) => Math.abs(a.byLevel![80].spd - kit.base.spd) - Math.abs(b.byLevel![80].spd - kit.base.spd))[0]

    const bad: string[] = []
    // KitDef.base mirrors PROG.<id>.base (kits spread it)
    for (const s of ['hp', 'atk', 'def', 'spd'] as const) {
      if (kit.base[s] !== prog.base[s]) bad.push(`kit.base.${s} ${kit.base[s]} != PROG ${prog.base[s]}`)
    }
    if (kit.base.critRate !== 0.05 || kit.base.critDmg !== 0.5) bad.push(`crit ${kit.base.critRate}/${kit.base.critDmg} != 0.05/0.5`)
    if (kit.base.level !== 80) bad.push(`level ${kit.base.level} != 80`)
    // PROG.byLevel mirrors the dataset at every ascension checkpoint
    for (const L of LEVELS) {
      const e = row.byLevel![L]
      const a = prog.byLevel?.[L]
      if (!e || !a) { bad.push(`L${L} missing`); continue }
      if (a.hp !== e.hp || a.atk !== e.atk || a.def !== e.def || a.spd !== e.spd) {
        bad.push(`L${L} ${a.hp}/${a.atk}/${a.def}/${a.spd} != ${e.hp}/${e.atk}/${e.def}/${e.spd}`)
      }
    }
    out.push(bad.length ? { kit: kit.id, ok: false, reason: bad[0] } : { kit: kit.id, ok: true })
  }
  return out
}
