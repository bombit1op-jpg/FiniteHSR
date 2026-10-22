// Minimal custom dropdown — a stylable replacement for <select> that keeps the
// same usage surface as the selects it replaces: a `.value` string and a
// `.onchange` handler. Native <select> cannot animate/style individual options,
// which the signature light cone row needs (green shimmer).
//
// Usage:
//   const dd = new Dropdown()
//   dd.setEntries([[id, label], ...], { sig: signatureId })
//   dd.value = 'in_the_night'
//   dd.onchange = () => { ... }
//   parent.append(dd.root)
import { el } from './dom'

let ddSeq = 0

export class Dropdown {
  readonly root: HTMLElement
  private btn: HTMLButtonElement
  private menu: HTMLElement
  private entries: Array<[string, string]> = []
  private sigId?: string
  private icons: Record<string, string> = {}
  private _value = ''
  private open = false
  onchange: (() => void) | null = null

  constructor(cls = '') {
    this.root = el('div', 'dd' + (cls ? ' ' + cls : ''))
    this.btn = el('button', 'ddBtn') as HTMLButtonElement
    this.btn.type = 'button'
    this.menu = el('div', 'ddMenu')
    this.root.append(this.btn, this.menu)
    const id = `dd${ddSeq++}`
    this.root.dataset.id = id

    this.btn.onclick = (e) => { e.stopPropagation(); this.toggle() }
    this.menu.onclick = (e) => {
      const opt = (e.target as HTMLElement).closest('.ddOpt') as HTMLElement | null
      if (!opt) return
      this.value = opt.dataset.value ?? ''
      this.close()
      this.onchange?.()
    }
    // close on outside click / escape
    this.btn.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
    document.addEventListener('click', (e) => {
      if (this.open && !this.root.contains(e.target as Node)) this.close()
    })
  }

  get value(): string { return this._value }
  set value(v: string) {
    this._value = v
    this.paint()
  }

  setEntries(entries: Array<[string, string]>, opts: { sig?: string; icons?: Record<string, string> } = {}): void {
    this.entries = entries
    this.sigId = opts.sig
    this.icons = opts.icons ?? {}
    if (!entries.some(([v]) => v === this._value)) this._value = entries[0]?.[0] ?? ''
    this.menu.innerHTML = ''
    for (const [v, label] of entries) {
      const o = el('div', 'ddOpt' + (v === this.sigId ? ' ddSig' : ''))
      o.dataset.value = v
      const icon = this.icons[v]
      if (icon) {
        const img = document.createElement('img')
        img.className = 'ddOptIcon'
        img.src = icon
        img.alt = ''
        o.append(img)
      }
      const t = el('span', 'ddOptLabel')
      t.textContent = label
      o.append(t)
      this.menu.append(o)
    }
    this.paint()
  }

  private labelFor(v: string): string {
    return this.entries.find(([x]) => x === v)?.[1] ?? ''
  }

  private paint(): void {
    this.btn.textContent = ''
    const icon = this.icons[this._value]
    if (icon) {
      const img = document.createElement('img')
      img.className = 'ddOptIcon'
      img.src = icon
      img.alt = ''
      this.btn.append(img)
    }
    const t = el('span', 'ddOptLabel')
    t.textContent = this.labelFor(this._value)
    this.btn.append(t)
    this.btn.classList.toggle('ddSig', this._value !== '' && this._value === this.sigId)
    for (const o of this.menu.querySelectorAll<HTMLElement>('.ddOpt')) {
      o.classList.toggle('ddSel', o.dataset.value === this._value)
    }
  }

  private toggle(): void { this.open ? this.close() : this.openMenu() }

  private openMenu(): void {
    this.open = true
    this.root.classList.add('ddOpen')
  }

  private close(): void {
    this.open = false
    this.root.classList.remove('ddOpen')
  }
}
