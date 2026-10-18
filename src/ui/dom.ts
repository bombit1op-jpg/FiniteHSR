export const STAT_LABELS: Record<string, string> = {
  hpFlat: 'HP', atkFlat: 'АТК', defFlat: 'ЗАЩ', spd: 'СКР',
  hpPct: 'HP %', atkPct: 'АТК %', defPct: 'ЗАЩ %',
  be: 'ПЭ', ehr: 'ЭФФ.ПОП', effRes: 'ЭФФ.СОП', err: 'ВЭ',
  critRate: 'КР.ШАНС', critDmg: 'КР.УРОН',
  outHeal: 'ИСЦЛЕНИЕ',
  'dmg:Physical': 'Физический урон',
  'dmg:Fire': 'Огненный урон',
  'dmg:Ice': 'Ледяной урон',
  'dmg:Wind': 'Ветровой урон',
  'dmg:Lightning': 'Молниевой урон',
  'dmg:Quantum': 'Квантовый урон',
  'dmg:Imaginary': 'Воображаемый урон',
}

const PCT_STATS = new Set([
  'hpPct', 'atkPct', 'defPct', 'be', 'ehr', 'effRes', 'err',
  'critRate', 'critDmg', 'outHeal',
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
