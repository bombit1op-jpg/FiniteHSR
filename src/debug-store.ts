/** Debug harness for the store-based UI.
 *  Runs the real main.ts boot against a minimal DOM shim and asserts store/DOM
 *  integration: team add/cap/delete, sync-on-input, enemy/mods, collect(),
 *  run battle, auto-rerun, calcs tabs.
 *  Run: rtk npx tsx src/debug-store.ts
 */

export {}

// ---------------------------------------------------------------- DOM shim

/** minimal CSSStyleDeclaration stand-in: property bag + setProperty (populated per-El) */
const styleProto = { setProperty(this: Record<string, string>, k: string, v: string): void { this[k] = v } }

class El {
  tag: string
  id = ''
  children: El[] = []
  parent: El | null = null
  style: Record<string, string> = Object.create(styleProto)
  dataset: Record<string, string> = {}
  props: Record<string, unknown> = {}
  eventHandlers: Record<string, (e?: unknown) => void> = {}
  _raw = ''
  _text = ''
  _value = ''
  className = ''
  checked = false
  disabled = false
  type = ''

  constructor(tag: string) {
    this.tag = tag
  }

  /** crude HTML → El tree (ids/values register for later getElementById) */
  set innerHTML(html: string) {
    this._raw = html
    this.children = []
    this._text = ''
    if (!html) return
    const stack: El[] = [this]
    const re = /<\/?([\w-]+)((?:"[^"]*"|[^<>])*?)(\/?)>/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      if (m.index > last) stack[stack.length - 1]._text += html.slice(last, m.index)
      last = re.lastIndex
      const full = m[0]
      const closing = full.startsWith('</')
      const attrs = (m[2] ?? '').trim()
      if (closing) {
        if (stack.length > 1 && stack[stack.length - 1].tag === m[1]) stack.pop()
        continue
      }
      const e = mkEl(m[1], attrs)
      stack[stack.length - 1].append(e)
      if (!VOID_TAGS.has(m[1]) && !m[3]) stack.push(e)
    }
    if (last < html.length) stack[stack.length - 1]._text += html.slice(last)
  }
  get innerHTML(): string {
    return this._raw
  }

  get textContent(): string {
    return this._text + this.children.map(c => c.textContent).join('')
  }
  set textContent(v: string | number) {
    this._text = String(v)
  }
  get value(): string {
    return this._value
  }
  set value(v: string) {
    this._value = String(v)
  }
  set onclick(f: unknown) { this.eventHandlers['click'] = f as (e?: unknown) => void }
  get onclick() { return this.eventHandlers['click'] }
  set onchange(f: unknown) { this.eventHandlers['change'] = f as (e?: unknown) => void }
  get onchange() { return this.eventHandlers['change'] }
  set oninput(f: unknown) { this.eventHandlers['input'] = f as (e?: unknown) => void }
  get oninput() { return this.eventHandlers['input'] }

  append(...nodes: unknown[]): void {
    for (const n of nodes) {
      if (n instanceof El) { n.parent = this; this.children.push(n) }
    }
  }
  appendChild(n: unknown): unknown { this.append(n); return n }
  remove(): void {
    if (this.parent) {
      const i = this.parent.children.indexOf(this)
      if (i >= 0) this.parent.children.splice(i, 1)
    }
  }
  addEventListener(name: string, f: (e?: unknown) => void): void { this.eventHandlers[name] = f }
  get classList() {
    const set = new Set(this.className.split(/\s+/).filter(Boolean))
    return {
      add: (c: string) => set.add(c), remove: (c: string) => set.delete(c),
      toggle: (c: string, on?: boolean) => { if (on === undefined ? !set.has(c) : on) set.add(c); else set.delete(c) },
      contains: (c: string) => set.has(c),
      valueOf: () => [...set].join(' '),
    }
  }
  get _cls() { return typeof this.classList.valueOf === 'function' ? this.classList.valueOf() : '' }
  fire(name: string, fake?: Partial<El>): void {
    const fn = this.eventHandlers[name]
    if (fn) fn(fake ?? this)
  }
}

const VOID_TAGS = new Set(['input', 'br', 'hr', 'img'])
const byId = new Map<string, El>()
const allEls: El[] = []

function mkEl(tag: string, attrs?: string): El {
  const e = new El(tag)
  if (attrs) {
    for (const m of attrs.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) {
      const [, k, v] = m
      if (k === 'id') { e.id = v ?? ''; if (v) byId.set(v, e) }
      else if (k === 'class') e.className = v ?? ''
      else if (k === 'value') e._value = v ?? ''
      else if (k === 'checked') e.checked = true
      else e.props[k] = v ?? ''
    }
  }
  allEls.push(e)
  return e
}

// registry roots (mirror index.html)
const TABS: El[] = []
const PANELS: El[] = []
function rootEl(id: string): El {
  const e = new El('div')
  e.id = id
  byId.set(id, e)
  return e
}
rootEl('team'); rootEl('addChar')
rootEl('enemyCfg'); rootEl('modRows'); rootEl('addMod')
rootEl('calcRoot')
rootEl('cycles'); rootEl('seed'); rootEl('runMode'); rootEl('run'); rootEl('check')
rootEl('summary'); rootEl('statPanel'); rootEl('hpPanel'); rootEl('log')
rootEl('manualPanel')
rootEl('reference')
const mainTabs = rootEl('mainTabs')
const body = rootEl('body')
const names = ['team', 'battle', 'gear', 'calc', 'results', 'reference']
for (const n of names) {
  const t = new El('button'); t.className = 'tab'; t.dataset['tab'] = n; TABS.push(t); mainTabs.append(t)
  const p = new El('div'); p.className = 'tab-panel' + (n === 'team' ? ' active' : ''); p.id = 'panel-' + n; PANELS.push(p); allEls.push(p)
}

const documentShim = {
  body,
  getElementById(id: string): El | null {
    if (byId.has(id)) return byId.get(id)!
    return null
  },
  createElement(tag: string): El { return mkEl(tag) },
  createTextNode(t: string) { return { textContent: t } },
  querySelectorAll(sel: string): El[] {
    if (sel === '#mainTabs .tab') return TABS
    if (sel === '.tab-panel') return PANELS
    return []
  },
  addEventListener(): void { /* teamChanged → renderReference: no-op in shim, not asserted */ },
}
;(globalThis as Record<string, unknown>).document = documentShim
;(globalThis as Record<string, unknown>).location = { hash: '' }

// ---------------------------------------------------------------- boot

const failures: string[] = []
let checks = 0
function ok(cond: unknown, label: string): void {
  checks++
  if (cond) console.log('ok   ' + label)
  else { failures.push(label); console.log('FAIL ' + label) }
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// eslint-disable-next-line @typescript-eslint/no-require-imports
import('./main').then(async () => {
  const store = (await import('./ui/store')).store
  const { addCharRow, collect } = await import('./ui/team')
  const { addManualModRow } = await import('./ui/enemy')

  // 1) boot seeded 4 chars
  ok(store.getState().team.length === 4, 'boot adds 4 team rows ' + store.getState().team.length)
  ok(byId.get('team')!.children.length === 4, 'DOM has 4 cards')

  // 2) cap at 4
  addCharRow(); addCharRow()
  ok(store.getState().team.length === 4, 'team capped at 4')

  // 3) input → store sync (stats row is the card's `.row` after head/gear/progRow/relicDetails)
  const row0 = byId.get('team')!.children[0]
  const statsRow = row0.children.find(c => c.tag === 'div' && c.className === 'row')
  const atkInput = statsRow!.children[0].children[0] as El
  atkInput.value = '3100'
  atkInput.fire('input')
  ok(store.getState().team[0].stats.atk === 3100, 'stat input syncs to store: atk=3100')

  // 4) delete
  const delBtn = row0.children[0].children[4] as El
  delBtn.fire('click')
  ok(store.getState().team.length === 3, 'delete removes row')

  // 5) enemy form + presets
  const inputs = (byId.get('enemyCfg') as El).children.flatMap(c => c.children).filter(c => c.tag === 'input') as El[]
  const countInp = inputs[0], weakInp = inputs[1], effResInp = inputs[2]
  countInp.value = '3'; countInp.fire('input')
  weakInp.value = 'Fire,Quantum'; weakInp.fire('input')
  effResInp.value = '0.2'; effResInp.fire('input')
  const en = store.getState().enemy
  ok(en.count === 3 && en.effRes === 0.2 && en.weaknesses.length === 2, 'enemy inputs sync: count/effRes/weak')

  // 6) mods
  addManualModRow()
  const modRow = (byId.get('modRows') as El).children[0]
  const modInputs = modRow.children.filter(c => c.tag === 'input') as El[]
  ok(modInputs.length === 1, 'mod row has value input')
  modInputs[0].value = '0.5'; modInputs[0].fire('input')
  ok(store.getState().mods.length === 1 && store.getState().mods[0].value === 0.5, 'mod value syncs')
  const modStat = modRow.children.filter(c => c.tag === 'select')[0] as El
  modStat.value = 'defPct'; modStat.fire('change')
  ok(store.getState().mods[0].stat === 'defPct', 'mod stat select syncs')

  // 7) collect
  const setup = collect()
  ok(setup.team.length === 3, 'collect team=3')
  ok((setup.manualMods ?? []).length === 1 && setup.manualMods![0].stat === 'defPct', 'collect manual mods')
  ok(setup.enemy.count === 3 && setup.enemy.weaknesses.includes('Quantum'), 'collect enemy from store')
  ok(setup.cycles === 4 && setup.seed === 42, 'collect run defaults')

  // 8) initCalcs built the form + sync on input
  const calc = byId.get('calcRoot') as El
  ok(calc.innerHTML.length > 200, 'calcRoot rendered')
  const cAtk = byId.get('cAtk') as El | undefined
  ok(!!cAtk, 'calc cAtk input registered')
  cAtk!.value = '1500'
  calc.fire('input', { target: cAtk, type: 'number' } as unknown as Partial<El>)
  ok(store.getState().calcs.cAtk === 1500, 'calcs input syncs to store: cAtk=1500')
  ok((byId.get('hitResult') as El).innerHTML.includes('Средний'), 'hit breakdown rendered')

  // 9) run battle (auto mode) via the #run handler
  const runBtn = byId.get('run') as El
  await runBtn.eventHandlers['click']()
  const summary = (byId.get('summary') as El).innerHTML
  ok(summary.includes('ИТОГО'), 'run renders summary: ' + summary.slice(0, 40))
  const res = store.getState().results
  ok(!!res && res.sim.accounts.size > 0, 'results stored in redux')

  // 10) auto-rerun on run/set (cycles+seed) — new sim identity proves rerun
  const beforeSim = store.getState().results?.sim
  store.dispatch({ type: 'run/set', patch: { cycles: 8, seed: 7 } })
  await sleep(60)
  const after = store.getState().results
  ok(!!after && after.sim !== beforeSim, 'auto-rerun on run/set rebuilds sim')
  ok(store.getState().results?.setup.seed === 7, 'rerun used new seed=7')

  // 11) run-mode select → store
  const modeSel = byId.get('runMode') as El
  modeSel.value = 'manual'; modeSel.fire('change')
  ok(store.getState().run.mode === 'manual', 'runMode select → store')

  // 12) relic editors are mounted inside each character card (§2 — no separate tab panel)
  const card0 = byId.get('team')!.children[0]
  const relicDetails = card0.children.find(c => c.tag === 'details' && c.children.some(x => x.tag === 'div' && x.className === 'relicGrid'))
  const relicGrid = relicDetails?.children.find(x => x.tag === 'div' && x.className === 'relicGrid')
  ok(!!relicGrid && relicGrid.children.length === 6, 'character card owns 6 relic slot editors')
  ok(!byId.has('relicPanel'), 'no separate relic tab panel')

  console.log(`\nchecks: ${checks}, FAILURES: ${failures.length}`)
  if (failures.length) { console.log('failed: ' + failures.join(' | ')); process.exitCode = 1 }
  else console.log('DEBUG-STORE: all good')
}).catch(err => { console.error('BOOT CRASH:', err); process.exitCode = 1 })