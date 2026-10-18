/**
 * §44 `invariants/` — formula caps from the wiki damage formula (canon, 30-09-2026).
 *
 * These are pure functions with hard caps; they are exactly the kind of constant that a later
 * "cleanup" silently relaxes, so they get their own named cases instead of living inside a
 * bigger numeric assert.
 */

import { defMultiplier, resFactor, vulnFactor } from '../../src/core/combat/StatResolver'
import type { Buff } from '../../src/core/effects/Buff'
import type { Unit } from '../../src/core/entities/Unit'
import { t, type Case } from '../suites'

const unit = (res: Partial<Record<string, number>>): Unit =>
  ({ name: 'T', side: 'enemy', kind: 'enemy', res, buffs: [], dots: [] }) as unknown as Unit

/** same fixture but with target-side buffs (where the All-Type `resAll` entry lives) */
const unitB = (res: Partial<Record<string, number>>, buffs: Buff[]): Unit =>
  ({ name: 'T', side: 'enemy', kind: 'enemy', res, buffs, dots: [] }) as unknown as Unit

const buff = (stat: string, value: number): Buff => ({ id: stat, name: stat, turns: 1, mods: [{ stat, value }] }) as unknown as Buff

export default function (): Case[] {
  return [
    t.near('RES 20% taken at face value', resFactor(unit({ Fire: 0.2 }), [], 'Fire'), 0.8, 1e-9),
    t.near('RES reduction caps at 90%', resFactor(unit({ Fire: 1 }), [], 'Fire'), 0.1, 1e-9),
    t.near('RES PEN floors at -100% (max 2.0x)', resFactor(unit({ Fire: 1 }), [buff('resPenAll', 3)], 'Fire'), 2, 1e-9),
    t.near('absent RES entry = 1.0', resFactor(unit({}), [], 'Fire'), 1, 1e-9),
    // target-side All-Type RES (resAll): POSITIVE = RES raised (less damage), NEGATIVE = RES lowered
    t.near('resAll +30% (All-Type RES raised) = ×0.7', resFactor(unitB({}, [buff('resAll', 0.3)]), [], 'Fire'), 0.7, 1e-9),
    t.near('resAll −30% (All-Type RES lowered) = ×1.3', resFactor(unitB({}, [buff('resAll', -0.3)]), [], 'Fire'), 1.3, 1e-9),
    t.near('resAll adds to the base RES entry (0.2 − 0.3 = −0.1 → ×1.1)', resFactor(unitB({ Fire: 0.2 }, [buff('resAll', -0.3)]), [], 'Fire'), 1.1, 1e-9),
    t.near('resAll obeys the 90% RES-reduction cap', resFactor(unitB({ Fire: 0.2 }, [buff('resAll', 5)]), [], 'Fire'), 0.1, 1e-9),
    t.near('vuln 0% bonus = 1.0x', vulnFactor(0), 1, 1e-9),
    t.near('vuln +250% = 3.5x', vulnFactor(2.5), 3.5, 1e-9),
    t.near('vuln bonus caps at +250%', vulnFactor(5), 3.5, 1e-9),
    t.near('vuln bonus cannot go below 0', vulnFactor(-1), 1, 1e-9),
    t.near('DEF mult lvl80 vs lvl95 = wiki form', defMultiplier(80, 95, unit({})), 1000 / 2150, 1e-9),
  ]
}
