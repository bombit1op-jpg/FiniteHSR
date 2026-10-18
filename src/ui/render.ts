/**
 * §84.2 / §84.16 — shared rendering primitives for every workspace.
 *
 * Honesty rules encoded here:
 *  - `n()` never turns missing data into 0 — `undefined`/`null` → `N/A`, and only a real 0 → `0`.
 *  - `badge()` always carries a text label, never colour alone (§84.2).
 *  - `jsonBlock()` dumps the exact returned object — no re-derivation of undocumented fields.
 */
import { el } from './dom'

export type Status = 'pass' | 'fail' | 'blocked' | 'warn' | 'neutral' | 'info'

export function badge(text: string, status: Status = 'neutral'): HTMLElement {
  const b = el('span', 'badge')
  b.dataset.s = status
  b.textContent = text
  return b
}

/** map engine-like status strings to semantic badge state (§84.2 status semantics) */
export function statusBadge(status: string): HTMLElement {
  const s = (status ?? '').toUpperCase()
  if (s === 'PASS' || s === 'OK' || s === 'AVAILABLE' || s === 'VERIFIED' || s === 'SAME' || s === 'FEASIBLE' || s === 'SUPPORTED' || s === 'COVERED') return badge(status, 'pass')
  if (s === 'FAIL' || s === 'FAILED' || s === 'DIFFERENT' || s === 'MISMATCH') return badge(status, 'fail')
  if (s === 'BLOCKED' || s === 'UNAVAILABLE' || s === 'GAP') return badge(status, 'blocked')
  if (s === 'WARN' || s === 'WARNING' || s === 'PARTIAL' || s === 'KNOWN DEVIATION') return badge(status, 'warn')
  if (s === 'NOT CHECKED' || s === 'UNKNOWN' || s === 'INCONCLUSIVE' || s === 'NOT_CHECKED') return badge(status, 'neutral')
  return badge(status, 'info')
}

/** number that stays honest: missing → N/A, real zero stays 0. Round for display only. */
export function n(v: unknown, digits = 1): string {
  if (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) return 'N/A'
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v)
    return v.toFixed(digits)
  }
  return String(v)
}

/** formatted big number for damage columns */
export function dmg(v: unknown): string {
  if (v === undefined || v === null || (typeof v === 'number' && Number.isNaN(v))) return 'N/A'
  if (typeof v !== 'number') return String(v)
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M'
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k'
  return String(Math.round(v * 10) / 10)
}

export function title(text: string, hint?: string): HTMLElement {
  const h = el('h3', 'wsTitle')
  h.textContent = text
  if (hint) { const s = el('div', 'wsHint'); s.textContent = hint; const w = el('div'); w.append(h, s); return w }
  return h
}

export function emptyState(text: string): HTMLElement {
  const e = el('div', 'emptyState')
  e.textContent = text
  return e
}

/** key/value table — labels left, values right-aligned with tabular numerals (§84.2) */
export function kv(rows: Array<[string, string | number | undefined | null]>, headers: [string, string] = ['Поле', 'Значение']): HTMLElement {
  const t = el('table', 'kvTable')
  const thead = el('thead'); const hr = el('tr')
  for (const h of headers) { const th = el('th'); th.textContent = h; hr.append(th) }
  thead.append(hr)
  const tb = el('tbody')
  for (const [k, v] of rows) {
    if (v === undefined) continue
    const tr = el('tr')
    const td1 = el('td', 'k'); td1.textContent = k
    const td2 = el('td', 'num'); td2.textContent = v === null ? 'N/A' : String(v)
    tr.append(td1, td2); tb.append(tr)
  }
  t.append(thead, tb)
  return t
}

/** generic table with explicit headers; cells accept node | string | number | null */
export function table(headers: string[], rows: Array<Array<string | number | null | HTMLElement | undefined>>, cls = ''): HTMLElement {
  const w = el('div', 'tableScroll')
  const t = el('table', cls)
  const thead = el('thead'); const hr = el('tr')
  for (const h of headers) { const th = el('th'); th.textContent = h; hr.append(th) }
  thead.append(hr)
  const tb = el('tbody')
  for (const r of rows) {
    const tr = el('tr')
    for (const c of r) {
      const td = el('td')
      if (c instanceof HTMLElement) td.append(c)
      else if (c === undefined || c === null) { td.textContent = 'N/A'; td.classList.add('dim') }
      else td.textContent = String(c)
      tr.append(td)
    }
    tb.append(tr)
  }
  t.append(thead, tb); w.append(t)
  return w
}

/** collapsible exact payload — the real returned object, no re-derivation (§84.9) */
export function jsonBlock(what: string, value: unknown): HTMLElement {
  const d = el('details', 'jsonBlock')
  const s = el('summary'); s.textContent = what
  const pre = el('pre')
  pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  d.append(s, pre)
  return d
}

export function button(label: string, onClick: () => void, cls = 'btn-secondary'): HTMLButtonElement {
  const b = el('button', cls)
  b.textContent = label
  b.onclick = onClick
  return b
}

export function row(...nodes: HTMLElement[]): HTMLElement {
  const r = el('div', 'row')
  for (const x of nodes) r.append(x)
  return r
}

export function select(entries: Array<[string, string]>, value?: string): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement
  for (const [v, t] of entries) { const o = el('option') as HTMLOptionElement; o.value = v; o.textContent = t; s.append(o) }
  if (value !== undefined) s.value = value
  return s
}

export function label(text: string, control: HTMLElement): HTMLLabelElement {
  const l = el('label'); l.textContent = text; l.append(control); return l
}
