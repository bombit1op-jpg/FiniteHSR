export const STAT_LABELS: Record<string, string> = {
  hp: 'HP', atk: 'ATK', def: 'DEF', spd: 'SPD',
  hpFlat: 'HP', atkFlat: 'ATK', defFlat: 'DEF', spdFlat: 'SPD',
  hpPct: 'HP%', atkPct: 'ATK%', defPct: 'DEF%',
  be: 'Break Effect', ehr: 'Effect Hit Rate', effRes: 'Effect RES', err: 'Energy Regen',
  critRate: 'CRIT Rate', critDmg: 'CRIT DMG',
  outHeal: 'Outgoing Healing', energyMax: 'Max Energy', elemDmgBoost: 'Elemental DMG Boost',
  elation: 'Elation DMG Boost',
  'dmg:Physical': 'Physical DMG',
  'dmg:Fire': 'Fire DMG',
  'dmg:Ice': 'Ice DMG',
  'dmg:Wind': 'Wind DMG',
  'dmg:Lightning': 'Lightning DMG',
  'dmg:Quantum': 'Quantum DMG',
  'dmg:Imaginary': 'Imaginary DMG',
}

const PCT_STATS = new Set([
  'hpPct', 'atkPct', 'defPct', 'be', 'ehr', 'effRes', 'err',
  'critRate', 'critDmg', 'outHeal', 'elation',
  'dmg:Physical', 'dmg:Fire', 'dmg:Ice', 'dmg:Wind', 'dmg:Lightning', 'dmg:Quantum', 'dmg:Imaginary',
])

export function fmtStatVal(stat: string, v: number): string {
  if (PCT_STATS.has(stat)) return (Math.round(v * 1000) / 10) + '%'
  return String(Math.round(v * 10) / 10)
}

export function fmt(n: number): string {
  return n >= 10_000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n))
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

export function fillSelect(sel: HTMLSelectElement, entries: Array<[string, string]>): void {
  sel.innerHTML = ''
  for (const [v, t] of entries) {
    const o = el('option')
    o.value = v
    o.textContent = t
    sel.append(o)
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
