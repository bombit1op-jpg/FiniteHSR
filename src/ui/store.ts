import type { BattleSetup } from '../core/battle'
import type { SkillPattern } from '../core/battle'
import type { ManualMod } from '../core/battle'
import type { AbilityLevels, RelicPiece } from '../core/entities/Unit'
import type { Simulator } from '../core/simulator'
import type { EncounterSpec } from '../core/encounter'
import { resolvePreCombat } from '../core/battle/PreCombat'

/** redux-style store: single state tree, action dispatch, subscribe. No React bindings. */

export interface RootAction {
  type: string
  [k: string]: unknown
}

export interface Store<S> {
  getState(): S
  dispatch(a: RootAction): void
  subscribe(fn: (prev: S, next: S) => void): () => void
}

export function createStore<S>(reducer: (prev: S, a: RootAction) => S, init: S): Store<S> {
  let state = init
  const subs = new Set<(prev: S, next: S) => void>()
  return {
    getState: () => state,
    dispatch: (a) => {
      const next = reducer(state, a)
      if (next === state) return
      const prev = state
      state = next
      for (const fn of [...subs]) fn(prev, next)
    },
    subscribe: (fn) => {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

// ---------------------------------------------------------------- state shape

export interface SubState { stat: string; tier: 0 | 1 | 2; rolls: number; spread?: number[] }
export interface PieceState { slot: RelicPiece['slot']; setId: string; main: string; subs: SubState[] }

export interface TeamRowState {
  id: string
  kitId: string
  stats: Partial<Record<'hp' | 'atk' | 'def' | 'spd' | 'critRate' | 'critDmg' | 'be' | 'ehr', number>>
  coneId: string
  si: number
  relic1: string
  relic2: string
  planar: string
  eidolon: number
  levels: AbilityLevels
  /** minor traces: `true` = all, `false` = none, array = per-trace flags (raw order) */
  traces: boolean | boolean[]
  /** character level 1..80 (engine default 80) */
  level?: number
  /** Light Cone level 1..80 (engine default 80) */
  coneLevel?: number
  /** start energy as a fraction of max (engine default 0.5 when absent) */
  energyStartFrac?: number
  /** pre-fight Technique uses for this character (§84.6.1): 0/absent = not activated */
  techniqueUses?: number
  skillPriority: number
  skillPattern: SkillPattern
  skillRotation: string
  strategy: Record<string, boolean>
  pieces: PieceState[]
}

/** §84.6.1 — pre-combat Technique activations from team rows. Row order IS the activation order;
 *  `techniqueUses` > 1 is an additional use of the same kit (the engine's repeat-cap still applies). */
export function techniquesForRows(rows: readonly TeamRowState[]): string[] {
  return rows.flatMap(r => Array.from({ length: r.techniqueUses ?? 0 }, () => r.kitId))
}

/** §84.6.1 — the surviving Technique count per row after the engine's own `resolvePreCombat` rules
 *  (repeat-cap / attack-conflict / zone-replaced / switch-cancelled). Reuses the engine resolver, so
 *  the UI never re-implements the conflict rules: a row whose activations are all cancelled drops to
 *  0. Returned in row order; index i pairs with `rows[i]`. */
export function survivingTechniqueUses(rows: readonly TeamRowState[], techniques: readonly { kitId: string, name: string, kind: 'buff' | 'attack', zone?: boolean, switchSensitive?: boolean, maxUses?: number }[]): number[] {
  const byId = new Map(techniques.map(t => [t.kitId, t]))
  const inputs = techniquesForRows(rows)
    .map(kitId => byId.get(kitId))
    .filter((t): t is NonNullable<typeof t> => !!t)
    .map(t => ({ kitId: t.kitId, name: t.name, kind: t.kind, zone: t.zone, switchSensitive: t.switchSensitive, maxUses: t.maxUses }))
  const plan = resolvePreCombat(inputs)
  const survivors = new Map<string, number>()
  for (const a of plan.survivors) survivors.set(a.kitId, (survivors.get(a.kitId) ?? 0) + 1)
  return rows.map(r => Math.min(r.techniqueUses ?? 0, survivors.get(r.kitId) ?? 0))
}

export interface EnemyState {
  preset: string
  count: number
  weaknesses: string[]
  effRes: number
}

export interface ModState extends ManualMod { id: string }

export interface RunState {
  mode: 'auto' | 'manual'
  cycles: number
  seed: number
}

export interface CalcsState {
  cKit: string
  cAttLvl: number; cAtk: number; cAtkPct: number; cSPD: number
  cCR: number; cCD: number; cDMG: number; cBE: number
  eLvl: number; eRES: number; eVuln: number; eDEF: number; eBroken: boolean; eMaxTough: number
  hMult: number
  gKeyA: string; gKeyB: string
  crCR: number; crCD: number; crRolls: number
  sSPD: number; sCycles: number; sAdv: number
  sbTough: number; sbAbil: number
}

export type ResultsState = { sim: Simulator; setup: BattleSetup } | null

/** §84.10 — a saved run the comparison workspace can pick as side A / B. */
export interface RunRecord {
  id: number
  label: string
  ts: number
  sim: Simulator
  setup: BattleSetup
}

export interface UiState { activeRelic: string | null }

export interface AppState {
  team: TeamRowState[]
  enemy: EnemyState
  mods: ModState[]
  run: RunState
  calcs: CalcsState
  results: ResultsState
  ui: UiState
  encounterSpec?: EncounterSpec | null
  history: RunRecord[]
}

// ---------------------------------------------------------------- slice reducers

function teamReducer(state: TeamRowState[], a: RootAction): TeamRowState[] {
  switch (a.type) {
    case 'team/add': return [...state, a.row as TeamRowState]
    case 'team/update': return state.map(r => r.id === a.id ? { ...r, ...(a.patch as Partial<TeamRowState>) } : r)
    case 'team/remove': return state.filter(r => r.id !== a.id)
    default: return state
  }
}

function enemyReducer(state: EnemyState, a: RootAction): EnemyState {
  switch (a.type) {
    case 'enemy/set': return { ...state, ...(a.patch as Partial<EnemyState>) }
    default: return state
  }
}

function modsReducer(state: ModState[], a: RootAction): ModState[] {
  switch (a.type) {
    case 'mods/add': return [...state, a.mod as ModState]
    case 'mods/remove': return state.filter(m => m.id !== a.id)
    case 'mods/update': return state.map(m => m.id === a.id ? { ...m, ...(a.patch as Partial<ModState>) } : m)
    default: return state
  }
}

function runReducer(state: RunState, a: RootAction): RunState {
  switch (a.type) {
    case 'run/set': return { ...state, ...(a.patch as Partial<RunState>) }
    default: return state
  }
}

function calcsReducer(state: CalcsState, a: RootAction): CalcsState {
  switch (a.type) {
    case 'calcs/set': return { ...state, [a.key as keyof CalcsState]: a.value }
    default: return state
  }
}

function resultsReducer(state: ResultsState, a: RootAction): ResultsState {
  switch (a.type) {
    case 'results/set': return { sim: a.sim as Simulator, setup: a.setup as BattleSetup }
    case 'results/clear': return null
    default: return state
  }
}

function uiReducer(state: UiState, a: RootAction): UiState {
  switch (a.type) {
    case 'ui/setRelic': return { activeRelic: a.id as string | null }
    default: return state
  }
}

function encounterSpecReducer(state: EncounterSpec | null | undefined, a: RootAction): EncounterSpec | null | undefined {
  switch (a.type) {
    case 'encounterSpec/set': return a.spec as EncounterSpec | null
    case 'encounterSpec/clear': return null
    default: return state
  }
}

/** bounded: comparison only needs a handful of saved runs, and each holds a whole Simulator. */
const HISTORY_LIMIT = 12
let historySeq = 0

function historyReducer(state: RunRecord[], a: RootAction): RunRecord[] {
  switch (a.type) {
    case 'history/add': {
      const rec: RunRecord = {
        id: ++historySeq,
        label: String(a.label ?? `Прогон #${historySeq}`),
        ts: Date.now(),
        sim: a.sim as Simulator,
        setup: a.setup as BattleSetup,
      }
      return [...state, rec].slice(-HISTORY_LIMIT)
    }
    case 'history/clear': return []
    default: return state
  }
}

// ---------------------------------------------------------------- root + singleton

export const initialState: AppState = {
  team: [],
  enemy: { preset: 'mob', count: 2, weaknesses: ['Fire', 'Lightning'], effRes: 0 },
  mods: [],
  run: { mode: 'auto', cycles: 4, seed: 42 },
  calcs: {
    cKit: '', cAttLvl: 80, cAtk: 1000, cAtkPct: 0, cSPD: 120,
    cCR: 5, cCD: 50, cDMG: 0, cBE: 0,
    eLvl: 95, eRES: 0, eVuln: 0, eDEF: 0, eBroken: false, eMaxTough: 180,
    hMult: 100, gKeyA: 'atkPct', gKeyB: 'critRate',
    crCR: 5, crCD: 50, crRolls: 10,
    sSPD: 120, sCycles: 4, sAdv: 0,
    sbTough: 10, sbAbil: 100,
  },
  results: null,
  ui: { activeRelic: null },
  encounterSpec: null,
  history: [],
}

export function rootReducer(prev: AppState, a: RootAction): AppState {
  return {
    ...prev,
    team: teamReducer(prev.team, a),
    enemy: enemyReducer(prev.enemy, a),
    mods: modsReducer(prev.mods, a),
    run: runReducer(prev.run, a),
    calcs: calcsReducer(prev.calcs, a),
    results: resultsReducer(prev.results, a),
    ui: uiReducer(prev.ui, a),
    encounterSpec: encounterSpecReducer(prev.encounterSpec, a),
    history: historyReducer(prev.history, a),
  }
}

export const store = createStore(rootReducer, initialState)

// convenience: subscribe to a slice, fire only when its reference changed
export function subscribeSlice<K extends keyof AppState>(key: K, fn: (s: AppState[K], prev: AppState[K]) => void): () => void {
  return store.subscribe((prev, next) => {
    if (prev[key] !== next[key]) fn(next[key], prev[key])
  })
}