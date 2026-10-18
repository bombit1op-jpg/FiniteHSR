import { BASE_AV } from './kit'
import { levelMultiplier, BREAK_ELEM_MULT } from './combat/LevelMultiplier'
import { rawDefMult } from './combat/StatResolver'

export interface CalcProfile {
  atk: number
  atkPct: number
  attLevel: number
  critRate: number
  critDmg: number
  dmgPct: number
  be: number
  spd: number
}

export interface CalcEnemy {
  level: number
  res: number
  vuln: number
  defShred: number
  broken: boolean
}

export interface HitBreakdown {
  base: number
  boost: number
  defM: number
  resM: number
  vulnM: number
  brokenM: number
  noCrit: number
  crit: number
  expected: number
}

export function hitBreakdown(p: CalcProfile, e: CalcEnemy, mult = 1): HitBreakdown {
  const base = p.atk * (1 + p.atkPct) * mult
  const boost = 1 + p.dmgPct
  const defM = rawDefMult(p.attLevel, e.level, 1 - e.defShred)
  const resM = 1 - e.res
  const vulnM = 1 + e.vuln
  const brokenM = e.broken ? 1 : 0.9
  const mid = base * boost * defM * resM * vulnM * brokenM
  const cr = Math.min(1, Math.max(0, p.critRate))
  return {
    base, boost, defM, resM, vulnM, brokenM,
    noCrit: mid,
    crit: mid * (1 + p.critDmg),
    expected: mid * (1 + cr * p.critDmg),
  }
}

// --- Stat grid ---

export const GRID_KEYS = ['atkPct', 'dmgPct', 'critRate', 'critDmg'] as const
export type GridKey = typeof GRID_KEYS[number]
export const GRID_KEY_LABELS: Record<GridKey, string> = {
  atkPct: 'АТК %',
  dmgPct: 'Урон % (DMG)',
  critRate: 'Крит. шанс %',
  critDmg: 'Крит. урон %',
}

function withAdd(p: CalcProfile, key: GridKey, v: number): CalcProfile {
  const q = { ...p }
  q[key] += v
  return q
}

export function statGrid(
  p: CalcProfile, e: CalcEnemy,
  keyA: GridKey, keyB: GridKey,
  steps: number, stepSize: number,
): number[][] {
  const ref = hitBreakdown(p, e).expected
  const out: number[][] = []
  for (let i = 0; i <= steps; i++) {
    const row: number[] = []
    for (let j = 0; j <= steps; j++) {
      const q = withAdd(withAdd(p, keyA, i * stepSize), keyB, j * stepSize)
      row.push(hitBreakdown(q, e).expected / ref)
    }
    out.push(row)
  }
  return out
}

// --- Crit optimizer (maximize CV = CR × CD) ---

export function critOptimal(
  baseCR: number,
  baseCD: number,
  rolls: number,
  rollCR = 0.0324,
  rollCD = 0.0648,
): { crRolls: number; cdRolls: number; cvNow: number; cvAfter: number; multAfter: number } {
  const rx = rollCR, ry = rollCD
  let x = (baseCD + ry * rolls - (ry / rx) * baseCR) / (2 * ry)
  x = Math.max(0, Math.min(rolls, x))
  const crAfter = baseCR + rx * x
  const cdAfter = baseCD + ry * (rolls - x)
  return {
    crRolls: x,
    cdRolls: rolls - x,
    cvNow: baseCR * baseCD,
    cvAfter: crAfter * cdAfter,
    multAfter: 1 + crAfter * cdAfter,
  }
}

// --- Speed helpers ---

export function minSpdFor(nActions: number, avBudget: number): number {
  return Math.ceil((nActions * BASE_AV) / avBudget)
}

export function actionsIn(spd: number, avBudget: number): number {
  return Math.floor((avBudget * spd) / BASE_AV)
}

export function advanceAsSpeed(pct: number): number {
  return pct >= 1 ? Infinity : 1 / (1 - pct)
}

// --- RES / Vuln helpers ---

export function resGain(baseRes: number, shred: number): number {
  const b = Math.max(0.001, 1 - baseRes)
  return (b + shred) / b
}

export function vulnEquivDefShred(vuln: number, atkLvl: number, defLvl: number): number {
  const a = atkLvl * 10 + 200, d = 200 + 10 * defLvl
  return Math.max(0, Math.min(1, 1 - ((a + d) / (1 + vuln) - a) / d))
}

// --- Break / Super Break ---

export function breakDamage(elem: string, lvl: number, maxToughness: number, be: number): number {
  const m = BREAK_ELEM_MULT[elem] ?? 1
  return m * levelMultiplier(lvl) * (0.5 + maxToughness / 40) * (1 + be)
}

export function superBreakHit(
  p: CalcProfile, e: CalcEnemy,
  toughnessReduced: number, abilityMult = 1,
): number {
  if (toughnessReduced <= 0) return 0
  return Math.floor(
    (toughnessReduced / 10) *
    levelMultiplier(p.attLevel) *
    abilityMult * (1 + p.be) *
    rawDefMult(p.attLevel, e.level, 1 - e.defShred) *
    (1 - e.res) * (1 + e.vuln),
  )
}
